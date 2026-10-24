"""Collect one configured WU station. Standard library only; no browser API key."""
from __future__ import annotations
import argparse
import datetime as dt
import json
import math
import os
from pathlib import Path
import sys
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'dist' / 'data'
QC_FILTER_VERSION = 2


def number(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def direction(value):
    value = number(value)
    return value % 360 if value is not None and 0 <= value <= 360 else None


def valid_record(raw, station_id):
    # Provider definition: -1 = not checked, 0 = possibly incorrect, 1 = passed.
    # Keep unchecked observations; exclude explicitly flagged observations.
    return (isinstance(raw, dict)
            and str(raw.get('stationID') or '').strip().upper() == station_id.upper()
            and number(raw.get('qcStatus')) != 0)


def local_date(raw, timezone):
    if raw.get('obsTimeLocal'):
        try:
            return dt.date.fromisoformat(raw['obsTimeLocal'][:10]).isoformat()
        except ValueError:
            return None
    epoch = number(raw.get('epoch'))
    if epoch is None:
        return None
    return dt.datetime.fromtimestamp(epoch, ZoneInfo(timezone)).date().isoformat()


def daily_record(raw, timezone):
    m = raw.get('metric') or {}
    row = {'date': local_date(raw, timezone), 'qc_status': number(raw.get('qcStatus'))}
    for field, source in [('temp', 'temp'), ('humidity', 'humidity'), ('wind', 'windspeed'), ('gust', 'windgust'), ('dew', 'dewpt')]:
        container = raw if field == 'humidity' else m
        for suffix, api in [('min', 'Low'), ('max', 'High'), ('avg', 'Avg')]:
            row[f'{field}_{suffix}'] = number(container.get(source + api))
    row.update(rain_total=number(m.get('precipTotal')),
               solar_max=number(raw.get('solarRadiationHigh')),
               uv_max=number(raw.get('uvHigh')),
               wind_dir=direction(raw.get('winddirAvg')),
               pressure_min=number(m.get('pressureMin')),
               pressure_max=number(m.get('pressureMax')))
    # A missing sensor remains null. Never replace missing values with zero.
    return row


def point_record(raw, timezone, current=False):
    m = raw.get('metric') or {}
    epoch = number(raw.get('epoch'))
    stamp = (dt.datetime.fromtimestamp(epoch, dt.timezone.utc).isoformat()
             if epoch is not None else raw.get('obsTimeUtc'))
    return {
        'time': stamp, 'date': local_date(raw, timezone),
        'qc_status': number(raw.get('qcStatus')),
        'temp': number(m.get('temp' if current else 'tempAvg')),
        'temp_min': number(m.get('temp' if current else 'tempLow')),
        'temp_max': number(m.get('temp' if current else 'tempHigh')),
        'humidity': number(raw.get('humidity' if current else 'humidityAvg')),
        'wind': number(m.get('windSpeed' if current else 'windspeedAvg')),
        'gust': number(m.get('windGust' if current else 'windgustHigh')),
        'wind_dir': direction(raw.get('winddir' if current else 'winddirAvg')),
        'solar': number(raw.get('solarRadiation' if current else 'solarRadiationHigh')),
        'uv': number(raw.get('uv' if current else 'uvHigh')),
        'rain_total': number(m.get('precipTotal')),
        'rain_rate': number(m.get('precipRate')),
        'dew': number(m.get('dewpt')) if current else number(m.get('dewptAvg')),
        'pressure': number(m.get('pressure')) if current else number(m.get('pressureMax')),
    }


def has_readings(row):
    return any(number(row.get(k)) is not None for k in ['temp_avg', 'temp_max', 'humidity_avg', 'rain_total', 'wind_avg', 'solar_max', 'uv_max'])


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False), encoding='utf-8')
    temporary.replace(path)


class APIError(Exception):
    pass


class Client:
    def __init__(self, key, station, pause=1):
        self.key, self.station, self.pause = key, station, pause
        self.requests = 0
        self.diagnostics = []

    def record_response(self, endpoint, date, status, raw_rows):
        accepted = [r for r in raw_rows if valid_record(r, self.station)]
        qc_counts = {}
        for row in raw_rows:
            code = str(row.get('qcStatus', 'missing')) if isinstance(row, dict) else 'invalid_record'
            qc_counts[code] = qc_counts.get(code, 0) + 1
        diagnostic = {'endpoint': endpoint, 'date': date, 'http_status': status,
                      'received': len(raw_rows), 'accepted': len(accepted),
                      'qc_counts': qc_counts}
        self.diagnostics.append(diagnostic)
        # Endpoint names/counts only. Never log the authenticated request URL.
        print(f'API {endpoint} {date or "current"}: HTTP {status}; '
              f'received={len(raw_rows)}, accepted={len(accepted)}, QC={qc_counts}')
        return accepted

    def get(self, endpoint, date=None):
        params = dict(apiKey=self.key, stationId=self.station, format='json', units='m', numericPrecision='decimal')
        if date:
            params['date'] = date.replace('-', '')
        url = 'https://api.weather.com/v2/pws/' + endpoint + '?' + urlencode(params)
        for attempt in range(3):
            if self.requests:
                time.sleep(self.pause)
            self.requests += 1
            try:
                with urlopen(Request(url, headers={'User-Agent': 'IPAPAN3-Weather-Dashboard/1.0'}), timeout=40) as response:
                    if response.status == 204:
                        return self.record_response(endpoint, date, 204, [])
                    payload = json.load(response)
                if not isinstance(payload, dict):
                    raise APIError('Unexpected API response structure.')
                rows = payload.get('observations', payload.get('summaries', []))
                if not isinstance(rows, list):
                    raise APIError('Unexpected API response structure.')
                return self.record_response(endpoint, date, 200, rows)
            except HTTPError as error:
                if error.code in (204, 404):
                    return self.record_response(endpoint, date, error.code, [])
                if error.code in (401, 403):
                    raise APIError(f'API authorization failed (HTTP {error.code}). Check WU_API_KEY and historical-data access.') from None
                if error.code == 429:
                    raise APIError('API rate limit reached (HTTP 429). Collection stopped; existing data retained.') from None
                if error.code >= 500 and attempt < 2:
                    time.sleep(2 ** attempt)
                    continue
                raise APIError(f'Weather API returned HTTP {error.code}.') from None
            except (URLError, TimeoutError, OSError, ValueError):
                if attempt < 2:
                    time.sleep(2 ** attempt)
                    continue
                # Never print an exception that may contain the authenticated URL.
                raise APIError('Weather API connection or JSON response failed after three attempts.') from None
        return []


def collect(start_date=None, max_backfill=None):
    config = json.loads((ROOT / 'config.json').read_text())
    now = dt.datetime.now(dt.timezone.utc)
    today = now.astimezone(ZoneInfo(config['timezone'])).date()
    install = os.environ.get('WU_INSTALLATION_DATE') or config.get('installation_date')
    target_start = dt.date.fromisoformat(start_date or install) if (start_date or install) else today - dt.timedelta(days=config['initial_history_days'] - 1)
    if target_start > today:
        raise ValueError('History start / installation date must not be in the future.')
    installation = dt.date.fromisoformat(install).isoformat() if install else None
    if installation and dt.date.fromisoformat(installation) > today:
        raise ValueError('Installation date must not be in the future.')
    old = json.loads((DATA / 'manifest.json').read_text()) if (DATA / 'manifest.json').exists() else {}
    state = json.loads((DATA / 'collector-state.json').read_text()) if (DATA / 'collector-state.json').exists() else {'checked_dates': []}
    checked = set(state.get('checked_dates', []))
    if state.get('qc_filter_version') != QC_FILTER_VERSION:
        # Recheck dates previously processed with the incorrect QC interpretation.
        checked = set()
        print('Updated QC interpretation: previously checked dates will be rechecked. Existing readings are retained.')
    station = {'id': config['station_id'], 'name': config['station_name'], 'local_name': config.get('station_name_local', ''),
               'location': config['location'], 'latitude': config['latitude'], 'longitude': config['longitude'],
               'timezone': config['timezone'], 'installation_date': installation}
    manifest = {**old, 'schema_version': 1, 'collector_version': QC_FILTER_VERSION,
                'station': station, 'last_attempt_at': now.isoformat(),
                'rain_day_threshold_mm': config.get('rain_day_threshold_mm', 0.2)}
    key = os.environ.get('WU_API_KEY', '').strip()
    if not key:
        manifest['status'] = {'state': 'unconfigured', 'message': 'Add WU_API_KEY to the repository Actions secrets to connect station observations.'}
        manifest.setdefault('mode', 'unconfigured')
        write_json(DATA / 'manifest.json', manifest)
        print('WU_API_KEY is not configured. Existing observations retained.')
        return 0
    client = Client(key, config['station_id'], config.get('request_pause_seconds', 1))
    rows = {}
    for path in sorted((DATA / 'history').glob('*.json')):
        for row in json.loads(path.read_text()):
            rows[row['date']] = row
    errors, touched = [], set()
    interval_dates = set(old.get('intraday_dates', []))
    try:
        current = client.get('observations/current')
        manifest['current'] = point_record(current[-1], config['timezone'], current=True) if current else None
        manifest['intraday'] = [point_record(r, config['timezone']) for r in client.get('history/all', today.isoformat())]
        manifest['intraday'] = sorted([r for r in manifest['intraday'] if r['time'] and r['date'] == today.isoformat()], key=lambda r: r['time'])
        if manifest['intraday']:
            write_json(DATA / 'intraday' / f'{today.isoformat()}.json', manifest['intraday'])
            interval_dates.add(today.isoformat())
        # Refresh today and yesterday, then fill older history sequentially.
        dates = {today, today - dt.timedelta(days=1)}
        limit = max_backfill if max_backfill is not None else config.get('backfill_days_per_run', 7)
        cursor, added = target_start, 0
        while cursor < today and added < limit:
            if cursor.isoformat() not in checked and cursor not in dates:
                dates.add(cursor)
                added += 1
            cursor += dt.timedelta(days=1)
        for date in sorted(dates, reverse=True):
            if date < target_start:
                continue
            day = date.isoformat()
            raw = client.get('history/daily', day)
            normalized = [daily_record(r, config['timezone']) for r in raw]
            normalized = [r for r in normalized if r['date'] == day and has_readings(r)]
            points = manifest['intraday'] if date == today else [point_record(r, config['timezone']) for r in client.get('history/all', day)]
            points = sorted([r for r in points if r['time'] and r['date'] == day], key=lambda r: r['time'])
            if points:
                write_json(DATA / 'intraday' / f'{day}.json', points)
                interval_dates.add(day)
            if normalized:
                rates = [r['rain_rate'] for r in points if r['rain_rate'] is not None]
                normalized[-1]['rain_rate_max'] = max(rates) if rates else None
                rows[day] = normalized[-1]
                touched.add(day[:7])
            # Empty historical days are remembered, not filled with invented readings.
            checked.add(day)
        manifest['updated_at'] = now.isoformat()
        manifest['mode'] = 'live'
        manifest['status'] = {'state': 'ok' if rows or manifest.get('current') else 'no_data', 'message': 'Station observations collected successfully.' if rows or manifest.get('current') else 'No usable observations were saved. See API response counts in diagnostics and the collection log.'}
    except APIError as error:
        errors.append(str(error))
        manifest['status'] = {'state': 'error', 'message': str(error)}
        manifest.setdefault('mode', 'unconfigured')
    for month in touched:
        write_json(DATA / 'history' / f'{month}.json', sorted([r for d, r in rows.items() if d.startswith(month)], key=lambda r: r['date']))
    ordered = sorted(rows)
    all_dates = {(target_start + dt.timedelta(days=i)).isoformat() for i in range((today - target_start).days + 1)}
    manifest.update(months=sorted({d[:7] for d in rows}), first_date=ordered[0] if ordered else None,
                    last_date=ordered[-1] if ordered else None,
                    backfill={'target_start': target_start.isoformat(), 'checked_days': len(all_dates & checked), 'remaining_days': len(all_dates - checked)},
                    history_days=len(rows), intraday_dates=sorted(interval_dates),
                    diagnostics=client.diagnostics)
    write_json(DATA / 'collector-state.json', {'checked_dates': sorted(checked),
                                             'qc_filter_version': QC_FILTER_VERSION})
    write_json(DATA / 'manifest.json', manifest)
    print(f'Station {config["station_id"]}: {len(rows)} observed days; {client.requests} API requests; {len(all_dates - checked)} days pending.')
    for error in errors:
        print(error)
    return 1 if errors else 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--start-date', help='Earliest requested station-local date, YYYY-MM-DD. Saved in config/variable for regular runs.')
    parser.add_argument('--max-backfill', type=int, help='Extra historical days in this run (0–366).')
    args = parser.parse_args()
    if args.max_backfill is not None and not 0 <= args.max_backfill <= 366:
        parser.error('--max-backfill must be between 0 and 366')
    try:
        sys.exit(collect(args.start_date, args.max_backfill))
    except (ValueError, KeyError) as error:
        print(f'Configuration error: {error}')
        sys.exit(1)
