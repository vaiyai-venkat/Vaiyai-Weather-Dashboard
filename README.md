# Vaiyaicheri Weather — IPAPAN3

A responsive, static HTML weather dashboard for the IPAPAN3 Weather Underground station at Vaiyaicheri, near Papanasam, Tamil Nadu. Built for GitHub Pages, with no Node build, paid chart service or Python dependencies.

## What is included

- Current temperature, humidity, rainfall total and rate, solar radiation, UV, wind speed/gust/direction, dew point and pressure.
- Today, trailing week, calendar month/year to a selected date, since installation, and arbitrary date ranges. Previous/next controls move through past periods; select a past date to explore its month or year.
- Temperature high/low/mean, rainfall totals and accumulation, humidity range, wind and gust, solar and UV charts, and a 16-sector direction rose.
- Maximum and minimum records with their dates; first occurrence and number of tied dates are shown. Daily means and precipitation totals are included.
- CSV export of the selected period; dark/light themes; mobile layouts; chart tooltips and keyboard arrow navigation.
- A sequential Python collector, an incremental archive, and a GitHub Actions workflow that collects and deploys approximately every 30 minutes.

## Deploy to GitHub Pages

1. Create a GitHub repository with its default branch named **main**. Extract this ZIP and upload **all its contents**, including the `.github/workflows` directory. Do not upload just the ZIP or just `index.html`. If your file picker hides dot folders, use Git or enable hidden files before uploading.
2. In **Settings → Pages → Build and deployment → Source**, choose **GitHub Actions**.
3. In **Settings → Secrets and variables → Actions → Secrets**, add **WU_API_KEY** containing your own Weather Underground / The Weather Company API key. The station upload password is **not** an API key. Never paste the key into HTML or commit it to Git.
4. In the same screen, open **Variables** and add **WU_INSTALLATION_DATE** with the actual installation date, for example `2022-06-15`. This example is not a claim about IPAPAN3. Alternatively, set `installation_date` in `config.json`. If unset, the collector requests the last 30 days and the UI explicitly marks the installation date as unknown.
5. In **Settings → Actions → General → Workflow permissions**, allow **Read and write permissions** if organization policy does not already permit the workflow's declared `contents: write` access.
6. Open **Actions → Update weather & deploy Pages → Run workflow**. After it completes, open the URL shown by the Pages deployment. The workflow deploys `dist/` automatically; you do not need a separate `gh-pages` branch.

An API key with **current and historical PWS endpoint access** is required. Availability and history retention depend on your API entitlement and the station's archived uploads. This package does not borrow a website's API key, scrape the dashboard, or manufacture missing observations.

### Backfill the full installation history

Each scheduled run refreshes today and yesterday, then checks up to seven older dates starting from your configured installation date. It also archives reporting intervals for checked dates. A successful no-data date is remembered; it remains a gap rather than zero rainfall.

For faster initial loading, run the workflow manually with **max_backfill = 60** (or another value within your API quota). This uses approximately `2 × max_backfill + 4` requests. The default scheduled run uses up to 18 requests during initial backfill and about four after backfill completes. Requests are sequential, paused by one second, with limited retries. Check your own API quota before increasing the batch or frequency. GitHub schedules are approximate and can be delayed; public-repository schedules may be disabled after prolonged repository inactivity.

Set `WU_INSTALLATION_DATE` persistently for future runs. The optional workflow `start_date` input overrides only that run. To recheck historical gaps after the provider restores data, remove the relevant dates from `dist/data/collector-state.json` and rerun. An installation date cannot recover records the provider no longer serves.

### A failed collector run

The site retains already saved observations, publishes a collection status, and still deploys Pages. The workflow emits a warning rather than deliberately failing the job after deployment. Authentication failures identify `WU_API_KEY`; HTTP 429 stops collection rather than hammering the service. A Pages/deployment failure remains a real workflow failure.

A protected branch or an organization policy may prevent the archive bot from pushing to `main`. Permit the workflow's archive updates or adapt the workflow to your repository's approved persistence path. Workflow runs use one concurrency group to avoid overlapping archive writes.

## Local preview

From the project directory:

```bash
python -m http.server 8000 --directory dist
```

Open `http://localhost:8000/` for the station archive, or `http://localhost:8000/?demo=1` for the illustrative preview. The demo is conspicuously labeled and never used as an automatic substitute when real collection fails. Directly double-clicking `index.html` is not supported because browsers restrict JSON/module access from `file://` pages.

For local collection, set `WU_API_KEY` in your shell environment and run:

```bash
python collector.py
# Optional one-off request:
python collector.py --start-date 2022-06-15 --max-backfill 30
```

Python 3.11+ is recommended. On Windows, install the `tzdata` package if your Python installation does not include the IANA timezone database. The GitHub Linux workflow needs no extra Python packages.

## Readings and their meaning

| Reading | Daily records and charts |
| --- | --- |
| Temperature | Reported daily high, low and mean, in °C |
| Precipitation | Sum of **daily** rainfall totals, in mm; highest/lowest daily rainfall and dates; peak reported interval rain rate in mm/h |
| Humidity | Reported daily high, low and mean, in % |
| Wind / gust | Reported daily high, low and mean, in km/h |
| Direction | Meteorological direction **from** which wind blows, clockwise from north; equal-weight circular mean of non-calm daily mean directions |
| Solar radiation | Daily peak irradiance in W/m²; highest and lowest **daily peaks**, not a true minimum irradiance |
| UV | Daily peak index; highest and lowest **daily peaks**, not a true minimum UV |
| Dew point / pressure | Additional reported extrema and means where available |

The daily PWS summaries do not provide solar or UV daily minima, exact times of daily extrema, or the wind direction at the instant of the day's peak gust. The dashboard does not invent these values. It shows record **dates**, not fabricated exact times. Interval solar/UV data are interval peaks as supplied by the API. Peak rain rate is the highest reported interval rate, not a claimed unobserved instantaneous rate.

For one-day selections, charts use archived reporting intervals when available. Missing intraday records show a specific empty state while daily record summaries can remain available. Daily data are stored in monthly shards; intraday files are loaded on demand for a selected day. Native reporting intervals are collected for the dates checked by this package; archive completeness still depends on the provider.

Rain counters are never summed across intraday observations. Multi-day cumulative rainfall adds each daily total once. Unavailable data stay `null` and appear as gaps. A zero is retained only when actually reported. Dates and rain-day boundaries use `Asia/Kolkata`; rain days use a configurable threshold of 0.2 mm. Daily averages are averaged equally over available days, not weighted by observation count. Today's totals and extrema are incomplete. Provider QC flags are interpreted as follows: `-1` means no quality check was performed, `0` means possibly incorrect, and `1` means passed. Unchecked (`-1`), missing-QC, and passed (`1`) station observations are retained. Explicitly flagged (`0`) observations are excluded. The collector preserves the QC flag in saved records and logs received/accepted counts for diagnosis.

The wind rose uses **daily mean directions**, not all instantaneous samples or a speed-binned climatological wind rose. Calm days and unavailable directions are counted separately. Opposing directions with an undefined circular mean show a dash.

## Project files

```text
config.json                         Station settings and collection limits
collector.py                        Data collection and archive updates
.github/workflows/dashboard.yml     Collection and GitHub Pages deployment
 dist/index.html                    Dashboard markup
 dist/style.css                     Responsive themes
 dist/app.mjs                       Dashboard interactions and SVG charts
 dist/analytics.mjs                 Date windows, records and calculations
 dist/demo.mjs                      Explicitly illustrative data generator
 dist/data/manifest.json            Current reading, archive index and status
 dist/data/history/YYYY-MM.json     Generated daily observations
 dist/data/intraday/YYYY-MM-DD.json  Generated reporting intervals
 tests/                             Data and calculation checks
```

The frontend has no chart CDN dependency. Google Fonts are optional: system fonts take over if unavailable. To change the automatic refresh schedule, edit the workflow cron. To use another station, change `config.json`, the initial manifest and page branding before deployment.

## Checks

```bash
python -m unittest discover -s tests -v
node tests/analytics.test.mjs
```

The frontend can be hosted on any static host; the bundled unattended collector is designed for GitHub Actions. Hosting this HTML by itself does not schedule GitHub workflows. A preview hosted elsewhere remains illustrative until a real archive is supplied.

Data source documentation:
- https://developer.weather.com/docs/openapi/pws-historical-2-0
- https://developer.weather.com/docs/openapi/pws-historical-2-0/get-v2-pws-history-daily
- https://developer.weather.com/docs/current-historical
- https://www.wunderground.com/dashboard/pws/IPAPAN3

© Analysis: VaiyaiVenkat · Data source: Weather Underground / The Weather Company.
# Vaiyai-Weather-Dashboard
