"""Optional Ecowitt V3 adapter. Credentials stay server-side; output contains observations only."""
import datetime as dt
import json
import math
import os
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo


class EcowittError(Exception):
    pass


def numeric(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        value = float(value)
        return value if math.isfinite(value) else None
    except (ValueError, TypeError):
        return None


def converted(value, unit, field):
    value = numeric(value)
    if value is None:
        return None
    u = str(unit or '').lower().replace('℃', 'c').replace('℉', 'f').replace('º', '').replace('°', '').replace(' ', '')
    if field.startswith(('temp', 'dew')):
        if u in ('f', 'fahrenheit'):
            value = (value - 32) * 5 / 9
        elif u not in ('', 'c', 'celsius'):
            return None
    elif field.startswith('rain'):
        if u in ('in', 'in/hr', 'in/h', 'inch', 'inches'):
            value *= 25.4
        elif u not in ('', 'mm', 'mm/hr', 'mm/h'):
            return None
    elif field.startswith('pressure'):
        if u == 'inhg':
            value *= 33.8638866667
        elif u == 'mmhg':
            value *= 1.33322387415
        elif u not in ('', 'hpa', 'mb'):
            return None
    elif field in ('wind', 'wind_max', 'gust'):
        if u == 'mph':
            value *= 1.609344
        elif u in ('m/s', 'mps'):
            value *= 3.6
        elif u in ('knots', 'knot', 'kts'):
            value *= 1.852
        elif u not in ('', 'km/h', 'km/hr', 'kmh', 'kph'):
            return None
    if field.startswith(('rain', 'wind', 'gust', 'solar', 'uv')) and value < 0:
        return None
    if field.startswith('humidity') and not 0 <= value <= 100:
        return None
    if field == 'wind_dir':
        return value % 360 if 0 <= value <= 360 else None
    return value


def field_paths(rain_group):
    return {
        'outdoor.temperature': 'temp', 'outdoor.temperature_low': 'temp_min',
        'outdoor.temperature_high': 'temp_max', 'outdoor.humidity': 'humidity',
        'outdoor.humidity_low': 'humidity_min', 'outdoor.humidity_high': 'humidity_max',
        'outdoor.dew_point': 'dew', 'wind.wind_speed': 'wind',
        'wind.wind_speed_high': 'wind_max', 'wind.wind_gust': 'gust',
        'wind.wind_direction': 'wind_dir', 'pressure.relative': 'pressure',
        'pressure.relative_low': 'pressure_min', 'pressure.relative_high': 'pressure_max',
        'solar_and_uvi.solar': 'solar', 'solar_and_uvi.uvi': 'uv',
        rain_group + '.rain_rate': 'rain_rate', rain_group + '.daily': 'rain_total',
    }


def points_from_data(data, timezone, rain_group='rainfall', resolution='5min', realtime=False):
    """Keep timestamps from the sensor leaves, never the API response's server clock."""
    points = {}
    if not isinstance(data, dict):
        return []
    for path, field in field_paths(rain_group).items():
        group, key = path.split('.')
        leaf = (data.get(group) or {}).get(key)
        if not isinstance(leaf, dict):
            continue
        values = {str(leaf.get('time')): leaf.get('value')} if realtime else leaf.get('list', {})
        if not isinstance(values, dict):
            continue
        for timestamp, value in values.items():
            epoch = numeric(timestamp)
            value = converted(value, leaf.get('unit'), field)
            if epoch is None or value is None:
                continue
            try:
                stamp = dt.datetime.fromtimestamp(epoch, dt.timezone.utc)
            except (ValueError, OSError, OverflowError):
                continue
            row = points.setdefault(epoch, {
                'time': stamp.isoformat(), 'date': stamp.astimezone(ZoneInfo(timezone)).date().isoformat(),
                'source': 'ecowitt', 'resolution': 'live' if realtime else resolution,
                'field_sources': {}, 'field_times': {},
            })
            row[field] = value
            row['field_sources'][field] = 'ecowitt:' + path
            row['field_times'][field] = stamp.isoformat()
    for row in points.values():
        for target, origin in [('temp_min', 'temp'), ('temp_max', 'temp'), ('humidity_min', 'humidity'),
                               ('humidity_max', 'humidity'), ('wind_max', 'wind'),
                               ('pressure_min', 'pressure'), ('pressure_max', 'pressure')]:
            if target not in row and origin in row:
                row[target] = row[origin]
    return [points[key] for key in sorted(points)]


class EcowittClient:
    def __init__(self, application_key, api_key, mac, timezone, rain_group='rainfall', pause=1):
        if rain_group not in ('rainfall', 'rainfall_piezo'):
            raise EcowittError('ECOWITT_RAIN_SENSOR must be rainfall or rainfall_piezo.')
        self.application_key, self.api_key, self.mac = application_key, api_key, mac
        self.timezone, self.rain_group, self.pause = timezone, rain_group, pause
        self.requests = 0
        self.diagnostics = []

    @classmethod
    def from_environment(cls, timezone):
        values = [os.environ.get(k, '').strip() for k in
                  ('ECOWITT_APPLICATION_KEY', 'ECOWITT_API_KEY', 'ECOWITT_MAC')]
        if not any(values):
            return None
        if not all(values):
            raise EcowittError('Set ECOWITT_APPLICATION_KEY, ECOWITT_API_KEY and ECOWITT_MAC together.')
        return cls(*values, timezone, rain_group=os.environ.get('ECOWITT_RAIN_SENSOR', 'rainfall').strip() or 'rainfall')

    def get(self, endpoint, **parameters):
        params = dict(application_key=self.application_key, api_key=self.api_key, mac=self.mac,
                      call_back='outdoor,wind,pressure,solar_and_uvi,' + self.rain_group,
                      temp_unitid=1, pressure_unitid=3, wind_speed_unitid=7,
                      rainfall_unitid=12, solar_irradiance_unitid=16)
        params.update(parameters)
        url = 'https://api.ecowitt.net/api/v3/device/' + endpoint + '?' + urlencode(params)
        if self.requests:
            time.sleep(self.pause)
        self.requests += 1
        try:
            with urlopen(Request(url, headers={'User-Agent': 'Vaiyai-Weather-Dashboard/2.0'}), timeout=35) as response:
                payload = json.load(response)
        except HTTPError as error:
            raise EcowittError(f'Ecowitt HTTP {error.code}; existing data retained.') from None
        except (URLError, TimeoutError, OSError, ValueError):
            raise EcowittError('Ecowitt connection or response failed; existing data retained.') from None
        # Do not print provider messages: some echo authenticated request parameters.
        if not isinstance(payload, dict) or str(payload.get('code')) != '0':
            code = payload.get('code') if isinstance(payload, dict) else None
            raise EcowittError('Ecowitt rejected the request (code ' + (str(int(code)) if numeric(code) is not None else 'unknown') + ').')
        data = payload.get('data')
        self.diagnostics.append({'source': 'ecowitt', 'endpoint': endpoint, 'code': 0})
        return data if isinstance(data, dict) else {}

    def current(self):
        points = points_from_data(self.get('real_time'), self.timezone, self.rain_group, realtime=True)
        if not points:
            return None
        latest = dt.datetime.fromisoformat(points[-1]['time'])
        result = {'time': latest.isoformat(), 'date': points[-1]['date'], 'source': 'ecowitt',
                  'resolution': 'live', 'field_sources': {}, 'field_times': {}}
        # Leaves may refresh separately. Never attach old rain/gust values to a fresh timestamp.
        for row in points:
            if (latest - dt.datetime.fromisoformat(row['time'])).total_seconds() <= 120:
                for key, value in row.items():
                    if key not in ('time', 'date', 'source', 'resolution', 'field_sources', 'field_times'):
                        result[key] = value
                result['field_sources'].update(row.get('field_sources', {}))
                result['field_times'].update(row.get('field_times', {}))
        return result

    def history(self, day, now=None):
        now = now or dt.datetime.now(dt.timezone.utc)
        requested = dt.date.fromisoformat(day)
        today = now.astimezone(ZoneInfo(self.timezone)).date()
        age = (today - requested).days
        if not 0 <= age < 1460:
            return []
        cycle = '5min' if age < 90 else '30min' if age < 365 else '4hour' if age < 730 else '1day'
        start = dt.datetime.combine(requested, dt.time(), ZoneInfo(self.timezone))
        end = min(start + dt.timedelta(days=1) - dt.timedelta(seconds=1), now.astimezone(ZoneInfo(self.timezone)))
        # Explicit ISO8601 offsets prevent server/browser timezone assumptions.
        data = self.get('history', start_date=start.isoformat(' '), end_date=end.isoformat(' '), cycle_type=cycle)
        return [p for p in points_from_data(data, self.timezone, self.rain_group, resolution=cycle) if p['date'] == day]
