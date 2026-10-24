# Five-minute collection and seven-day midnight-to-midnight comparisons

1. Extract the ZIP and upload its contents to your existing repository root, preserving the folder paths.
2. **Replace `.github/workflows/dashboard.yml` as well as `collector.py` and the `dist/` files.** The workflow controls how often new station data is collected. Some file pickers hide `.github`; use Git or enable hidden folders if necessary.
3. Allow the existing Update weather & deploy Pages workflow to complete. This first full run also requests any missing recent seven-day interval archives. Refresh the GitHub Pages dashboard afterward.

This cumulative source update contains no observation data, configuration or initial manifest. Your station key, installation date and saved archive remain in place. No new key is needed.

## Update timing

The previous collector schedule was `7,37 * * * *`, or twice an hour. The new schedule is `2-59/5 * * * *`, or every five minutes with an offset from the top of the hour. The browser now checks the published files every 60 seconds and refreshes when returning to a hidden tab. A Refresh now button is also available.

GitHub's scheduler can delay jobs, and Pages publication takes time. Therefore five minutes is the requested collection interval, not a guaranteed maximum age for readings. The header distinguishes the observation timestamp, completed collection time and latest page check so an old reading is not presented as a new one. Refresh now reloads the published archive; it cannot force the station to upload or trigger the private collector.

To limit repeated API work, normal scheduled ticks refresh current readings and today's data (three API requests). Historical batches run roughly hourly, while manual/push runs perform a full batch. Recent seven-day interval files are populated during a full batch. Default ongoing API use is roughly 900–1,250 requests/day plus warm-up, retries and manual runs; consult your own API quota.

## Weekly plot

- Choose **Weekly** and a week-ending date.
- Seven separate daily curves share one **00:00–24:00 station-time** X axis. For IPAPAN3 this is IST.
- Each date has its own colour. Choose the first variable and, optionally, a second variable with dashed curves and a second unit axis.
- Today's line ends at the last archived sample. Missing intervals and days remain gaps. Long gaps are not joined.
- Weekly CSV exports actual station dates, clock times, UTC timestamps and variable readings.
- Monthly/yearly comparisons keep their previous calendar alignment and two-period controls.

All 15 Python collection checks pass, including five-minute-path request counts and seven-day archive warm-up. Existing analytics/comparison checks and new weekly-clock checks also pass, covering IST midnight boundaries, cumulative rainfall, gap breaks and CSV data. Browser checks confirm seven curves with 00:00–24:00 labels and the existing monthly/yearly modes.

The screenshot preview uses clearly illustrative data. Actual interval coverage depends on the station archive returned by your API.
