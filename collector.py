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
        'humidity_min': number(raw.get('humidity' if current else 'humidityLow')),
        'humidity_max': number(raw.get('humidity' if current else 'humidityHigh')),
        'wind': number(m.get('windSpeed' if current else 'windspeedAvg')),
        'wind_max': number(m.get('windSpeed' if current else 'windspeedHigh')),
        'gust': number(m.get('windGust' if current else 'windgustHigh')),
        'wind_dir': direction(raw.get('winddir' if current else 'winddirAvg')),
        'solar': number(raw.get('solarRadiation' if current else 'solarRadiationHigh')),
        'uv': number(raw.get('uv' if current else 'uvHigh')),
        'rain_total': number(m.get('precipTotal')),
        'rain_rate': number(m.get('precipRate')),
        'dew': number(m.get('dewpt')) if current else number(m.get('dewptAvg')),
        'pressure': number(m.get('pressure')) if current else number(m.get('pressureMax')),
        'pressure_min': number(m.get('pressure' if current else 'pressureMin')),
        'pressure_max': number(m.get('pressure' if current else 'pressureMax')),
    }


def has_readings(row):
    return any(number(row.get(k)) is not None for k in ['temp_avg', 'temp_max', 'humidity_avg', 'rain_total', 'wind_avg', 'solar_max', 'uv_max', 'pressure_min', 'pressure_max'])


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
        self.timezone = 'Asia/Kolkata'

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
        # Preserve the collector interface used by existing integrations/tests.
        # Today's interval request uses the rolling feed on the wire so the graph
        # is not held back by the date-based historical product.
        today = dt.datetime.now(dt.timezone.utc).astimezone(ZoneInfo(self.timezone)).date().isoformat()
        if endpoint == 'history/all' and date == today:
            try:
                rolling = self._get('observations/all/1day')
                if any(local_date(row, self.timezone) == date for row in rolling):
                    return rolling
            except APIError as error:
                if '429' in str(error):
                    raise
                self.diagnostics.append({'endpoint': 'observations/all/1day', 'error': str(error)})
        return self._get(endpoint, date)

    def _get(self, endpoint, date=None):
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


def timestamp(row):
    try:
        stamp = dt.datetime.fromisoformat(str(row.get('time', '')).replace('Z', '+00:00'))
        return stamp.replace(tzinfo=dt.timezone.utc) if stamp.tzinfo is None else stamp.astimezone(dt.timezone.utc)
    except (ValueError, TypeError):
        return None


def merge_points(*groups, timezone='Asia/Kolkata', day=None, now=None):
    """Union by exact observation time; never bin, interpolate, or sum rainfall counters."""
    merged = {}
    for group in groups:
        for original in group or []:
            if not isinstance(original, dict):
                continue
            stamp = timestamp(original)
            if stamp is None or (now is not None and stamp > now + dt.timedelta(minutes=5)):
                continue
            local_day = stamp.astimezone(ZoneInfo(timezone)).date().isoformat()
            if day is not None and local_day != day:
                continue
            row = {**original, 'time': stamp.isoformat(), 'date': local_day}
            row.setdefault('source', 'wu')
            old = merged.get(row['time'])
            if old:
                # Prefer the primary provider at identical times; retain existing non-null fields.
                priority = lambda r: (r.get('source') == 'wu', r.get('resolution') == 'live')
                preferred, fallback = (row, old) if priority(row) >= priority(old) else (old, row)
                combined = {**fallback, **{k: v for k, v in preferred.items() if v is not None}}
                fields = {**fallback.get('field_sources', {}), **preferred.get('field_sources', {})}
                for key, value in fallback.items():
                    if preferred.get(key) is None and value is not None:
                        fields[key] = fallback.get('field_sources', {}).get(key, fallback.get('source', 'wu'))
                combined['field_sources'] = fields
                rates = [(number(r.get('rain_rate_observed_max', r.get('rain_rate'))), r.get('rain_rate_peak_source', r.get('source', 'wu'))) for r in (old, row)]
                rates = [r for r in rates if r[0] is not None and r[0] >= 0]
                if rates:
                    combined['rain_rate_observed_max'], combined['rain_rate_peak_source'] = max(rates, key=lambda r: r[0])
                row = combined
            merged[row['time']] = row
    return [merged[key] for key in sorted(merged)]


def freshest_current(candidates):
    if not candidates:
        return None
    latest = {**candidates[-1]}
    latest['field_sources'] = dict(latest.get('field_sources', {}))
    latest['field_times'] = dict(latest.get('field_times', {}))
    for candidate in reversed(candidates[:-1]):
        if (timestamp(latest) - timestamp(candidate)).total_seconds() > 120:
            break
        for key, value in candidate.items():
            if key not in ('time', 'date') and number(value) is not None and number(latest.get(key)) is None:
                latest[key] = value
                latest['field_sources'][key] = candidate.get('field_sources', {}).get(key, candidate.get('source', 'wu'))
                latest['field_times'][key] = candidate.get('field_times', {}).get(key, candidate['time'])
    return latest


def daily_from_points(day, points, previous=None, reported=None, partial=False):
    """Extend reported extremes and retain sampled peaks; mark derived summaries honestly."""
    old, report = previous or {}, reported or {}
    row = {**old, **{k: v for k, v in report.items() if v is not None}, 'date': day}
    row['sources'] = sorted(set(old.get('sources', [])) | {p.get('source', 'wu') for p in points} | ({'wu'} if reported else set()))
    for field in ('temp', 'humidity', 'wind', 'gust', 'dew'):
        values = [number(p.get(field)) for p in points]
        values = [v for v in values if v is not None]
        for suffix, operation in [('min', min), ('max', max)]:
            pkey = field + '_' + suffix
            pointkey = 'gust' if field == 'gust' else 'wind_max' if field == 'wind' and suffix == 'max' else pkey
            candidates = [number(old.get(pkey)), number(report.get(pkey))]
            candidates += [number(p.get(pointkey, p.get(field))) for p in points]
            candidates = [v for v in candidates if v is not None]
            if candidates:
                row[pkey] = operation(candidates)
        if number(row.get(field + '_avg')) is None and values:
            row[field + '_avg'] = sum(values) / len(values)
            row['averages_basis'] = 'available_samples'
    for output, input_field, operation in [('solar_max', 'solar', max), ('uv_max', 'uv', max), ('pressure_min', 'pressure_min', min), ('pressure_max', 'pressure_max', max)]:
        values = [number(old.get(output)), number(report.get(output))] + [number(p.get(input_field)) for p in points]
        values = [v for v in values if v is not None]
        if values:
            row[output] = operation(values)
    # Counters are not additive across providers or observations.
    totals = [p for p in points if number(p.get('rain_total')) is not None]
    if totals and (partial or number(row.get('rain_total')) is None):
        row['rain_total'] = totals[-1]['rain_total']
    if number(row.get('wind_dir')) is None:
        directions = [number(p.get('wind_dir')) for p in points]
        directions = [v for v in directions if v is not None]
        if directions:
            x = sum(math.cos(math.radians(v)) for v in directions)
            y = sum(math.sin(math.radians(v)) for v in directions)
            row['wind_dir'] = math.degrees(math.atan2(y, x)) % 360 if math.hypot(x, y) > 1e-10 else None
    peak = number(old.get('rain_rate_max'))
    for point in points:
        rate = number(point.get('rain_rate_observed_max', point.get('rain_rate')))
        if rate is not None and rate >= 0 and (peak is None or rate > peak):
            peak = rate
            row['rain_rate_max_time'] = point['time']
            row['rain_rate_max_source'] = point.get('rain_rate_peak_source', point.get('source', 'wu'))
            row['rain_rate_max_resolution'] = point.get('resolution', 'reporting_interval')
    row['rain_rate_max'] = peak
    row['rain_rate_max_basis'] = 'highest_collected_rate_not_guaranteed_instantaneous_peak'
    row['partial'] = partial or not bool(reported)
    row['summary_basis'] = 'provider_daily_with_collected_extremes' if reported else 'available_samples'
    if points:
        row['through'] = points[-1]['time']
    return row


def collect(start_date=None, max_backfill=None, scheduled=False, recent_week=False, refresh_target_minutes=5, live_only=False):
    # Preserve the original imported Python API default. The CLI below passes its
    # selected display target explicitly, so existing callers remain compatible.
    config = json.loads((ROOT / 'config.json').read_text())
    now = dt.datetime.now(dt.timezone.utc)
    timezone = config['timezone']
    today = now.astimezone(ZoneInfo(timezone)).date()
    today_key = today.isoformat()
    install = os.environ.get('WU_INSTALLATION_DATE') or config.get('installation_date')
    target_start = dt.date.fromisoformat(start_date or install) if (start_date or install) else today - dt.timedelta(days=config['initial_history_days'] - 1)
    if target_start > today:
        raise ValueError('History start / installation date must not be in the future.')
    old = json.loads((DATA / 'manifest.json').read_text()) if (DATA / 'manifest.json').exists() else {}
    state = json.loads((DATA / 'collector-state.json').read_text()) if (DATA / 'collector-state.json').exists() else {}
    checked = set(state.get('checked_dates', []))
    if state.get('qc_filter_version') != QC_FILTER_VERSION:
        checked = set()
        print('Updated QC interpretation: older dates will be rechecked. Existing readings are retained.')
    station = {'id': config['station_id'], 'name': config['station_name'], 'local_name': config.get('station_name_local', ''),
               'location': config['location'], 'latitude': config['latitude'], 'longitude': config['longitude'],
               'timezone': timezone, 'installation_date': install or old.get('station', {}).get('installation_date')}
    manifest = {**old, 'schema_version': 1, 'collector_version': QC_FILTER_VERSION,
                'station': station, 'last_attempt_at': now.isoformat(),
                'rain_day_threshold_mm': config.get('rain_day_threshold_mm', 0.2),
                'collector_release': '2026-10-25-wu-single-file', 'refresh_target_minutes': refresh_target_minutes}
    try:
        previous = dt.datetime.fromisoformat(state.get('last_history_success_at', ''))
        if previous.tzinfo is None:
            previous = previous.replace(tzinfo=dt.timezone.utc)
        history_age = (now - previous).total_seconds() / 60
    except (ValueError, TypeError):
        history_age = float('inf')
    # Live-only runs never request station-local dates before today.
    history_due = not live_only and (not scheduled or history_age >= config.get('history_refresh_minutes', 60))
    warnings, touched, errors = [], set(), []
    key = os.environ.get('WU_API_KEY', '').strip()
    if not key:
        manifest.update(status={'state': 'unconfigured', 'message': 'Configure WU_API_KEY to collect observations.'})
        manifest.setdefault('mode', 'unconfigured')
        write_json(DATA / 'manifest.json', manifest)
        print('WU_API_KEY is not configured. Existing observations retained.')
        return 0
    client = Client(key, config['station_id'], config.get('request_pause_seconds', 1))
    client.timezone = timezone
    wu_disabled = False
    received_new = False

    def wu_get(endpoint, date=None):
        nonlocal wu_disabled, received_new
        if wu_disabled:
            return [], False
        try:
            records = client.get(endpoint, date)
            received_new = received_new or bool(records)
            return records, True
        except APIError as error:
            warnings.append(str(error))
            if any(code in str(error) for code in ('401', '403', '429')):
                wu_disabled = True
            return [], False

    def saved_points(day):
        path = DATA / 'intraday' / (day + '.json')
        points = json.loads(path.read_text()) if path.exists() else []
        if day == today_key:
            points = merge_points(points, old.get('intraday', []), timezone=timezone, day=day, now=now)
        return points

    rows = {}
    for path in sorted((DATA / 'history').glob('*.json')):
        for row in json.loads(path.read_text()):
            rows[row['date']] = row
    interval_dates = set(old.get('intraday_dates', []))
    raw_current, current_ok = wu_get('observations/current')
    current_points = [dict(point_record(raw, timezone, current=True), source='wu', resolution='live') for raw in raw_current]
    rolling, rolling_ok = wu_get('history/all', today_key)
    rolling_points = [dict(point_record(raw, timezone), source='wu', resolution='reporting_interval') for raw in rolling]
    old_current = [old['current']] if isinstance(old.get('current'), dict) else []
    candidates = merge_points(old_current, current_points, timezone=timezone, now=now)
    manifest['current'] = freshest_current(candidates)
    manifest['intraday'] = merge_points(saved_points(today_key), rolling_points, current_points,
                                       timezone=timezone, day=today_key, now=now)
    # A successfully queried empty interval archive is still an available file.
    # Its empty list means no usable readings; no zero/future samples are invented.
    if rolling_ok or manifest['intraday']:
        write_json(DATA / 'intraday' / (today_key + '.json'), manifest['intraday'])
        interval_dates.add(today_key)
    dates = {today}
    if history_due:
        dates.add(today - dt.timedelta(days=1))
        if recent_week:
            for offset in range(1, 7):
                date = today - dt.timedelta(days=offset)
                day = date.isoformat()
                if date >= target_start and (state.get('intraday_schema_version', 1) < 2 or day not in interval_dates or day not in rows):
                    dates.add(date)
        limit = max_backfill if max_backfill is not None else config.get('backfill_days_per_run', 7)
        cursor, added = target_start, 0
        while cursor < today and added < limit:
            day = cursor.isoformat()
            if cursor not in dates and day not in checked:
                dates.add(cursor)
                added += 1
            cursor += dt.timedelta(days=1)
    elif live_only:
        print('Live refresh only: older historical collection is disabled for this run.')
    else:
        print(f'Live refresh only: historical batch last completed {history_age:.1f} minutes ago.')
    history_success = history_due
    for date in sorted(dates, reverse=True):
        if date < target_start:
            continue
        day = date.isoformat()
        raw_daily, daily_ok = wu_get('history/daily', day)
        normalized = [daily_record(raw, timezone) for raw in raw_daily]
        normalized = [row for row in normalized if row['date'] == day and has_readings(row)]
        if date == today:
            points = manifest['intraday']
            interval_ok = rolling_ok or bool(current_points)
        else:
            raw_intervals, interval_ok = wu_get('history/all', day)
            incoming = [dict(point_record(raw, timezone), source='wu', resolution='reporting_interval') for raw in raw_intervals]
            points = merge_points(saved_points(day), incoming, timezone=timezone, day=day, now=now)
            if interval_ok or points:
                write_json(DATA / 'intraday' / (day + '.json'), points)
                interval_dates.add(day)
        if daily_ok:
            checked.add(day)
        elif not interval_ok:
            history_success = False
        if (normalized or points) and (daily_ok or interval_ok):
            combined = daily_from_points(day, points, rows.get(day), normalized[-1] if normalized else None, partial=date == today)
            if has_readings(combined):
                rows[day] = combined
                touched.add(day[:7])
    for month in touched:
        write_json(DATA / 'history' / (month + '.json'), sorted([row for day, row in rows.items() if day.startswith(month)], key=lambda row: row['date']))
    ordered = sorted(rows)
    all_dates = {(target_start + dt.timedelta(days=i)).isoformat() for i in range((today - target_start).days + 1)}
    if received_new:
        manifest.update(updated_at=now.isoformat(), collection_finished_at=dt.datetime.now(dt.timezone.utc).isoformat(), mode='live')
        manifest['status'] = {'state': 'ok', 'message': 'Available WU observations merged; today includes collected live readings.'}
    elif warnings:
        errors = warnings.copy()
        manifest['status'] = {'state': 'error', 'message': warnings[0]}
    else:
        manifest['status'] = {'state': 'no_data', 'message': 'WU returned no usable new observations. Previously saved data retained.'}
    coverage = manifest.get('intraday', [])
    manifest.update(months=sorted({day[:7] for day in rows}), first_date=ordered[0] if ordered else None,
                    last_date=ordered[-1] if ordered else None, history_days=len(rows),
                    backfill={'target_start': target_start.isoformat(), 'checked_days': len(all_dates & checked),
                              'remaining_days': len(all_dates - checked),
                              'missing_observation_days': len(all_dates - set(rows))},
                    intraday_dates=sorted(interval_dates), warnings=list(dict.fromkeys(warnings)),
                    diagnostics=client.diagnostics,
                    today_coverage={'date': today_key, 'first': coverage[0]['time'] if coverage else None,
                                    'through': coverage[-1]['time'] if coverage else None, 'points': len(coverage)},
                    sources={'wu': True},
                    rain_rate_note='Highest collected WU rate; brief peaks between samples may be missed.')
    write_json(DATA / 'collector-state.json', {**state, 'checked_dates': sorted(checked), 'qc_filter_version': QC_FILTER_VERSION,
               'last_history_success_at': now.isoformat() if history_success else state.get('last_history_success_at'),
               'intraday_schema_version': 2 if history_success and recent_week else state.get('intraday_schema_version', 1),
               'live_archive_version': 1})
    write_json(DATA / 'manifest.json', manifest)
    print(f'Station {config["station_id"]}: {len(rows)} observed days; {client.requests} API requests; {len(all_dates - checked)} dates unchecked; {len(all_dates - set(rows))} dates without observations.')
    for warning in dict.fromkeys(warnings):
        print(warning)
    return 1 if errors else 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--start-date', help='Earliest requested station-local date, YYYY-MM-DD. Saved in config/variable for regular runs.')
    parser.add_argument('--max-backfill', type=int, help='Extra historical days in this run (0–366).')
    parser.add_argument('--scheduled', action='store_true', help='Refresh live readings now; throttle historical batches to roughly hourly.')
    parser.add_argument('--recent-week', action='store_true', help='Ensure recent seven-day interval archives during a historical batch.')
    parser.add_argument('--live-only', action='store_true', help='Refresh today only; do not request older dates, regardless of backfill options.')
    parser.add_argument('--refresh-target-minutes', type=int, default=2, help='Displayed collection target in minutes (default: 2); scheduling is configured separately.')
    args = parser.parse_args()
    if args.refresh_target_minutes <= 0:
        parser.error('--refresh-target-minutes must be a positive integer')
    if args.max_backfill is not None and not 0 <= args.max_backfill <= 366:
        parser.error('--max-backfill must be between 0 and 366')
    try:
        sys.exit(collect(args.start_date, args.max_backfill, args.scheduled, args.recent_week, refresh_target_minutes=args.refresh_target_minutes, live_only=args.live_only))
    except (ValueError, KeyError) as error:
        print(f'Configuration error: {error}')
        sys.exit(1)
