# IPAPAN3 observation collection fix

This update was prepared from the current public main branch of Vaiyai-Weather-Dashboard on 24 October 2026.

## What the live site showed

The published data/manifest.json was reachable and contained mode=live, current=null, history_days=0, and status.state=no_data. Its last attempt was 24 October 2026 at 18:35 IST, with installation_date=2023-12-29. This establishes that the collector ran with a configured key and published its result, but saved no usable records. It does not by itself expose the provider's raw response.

## Bug corrected

The original valid_record() rejected qcStatus=-1. The provider defines -1 as 'No quality control check performed', 0 as 'possibly incorrect', and 1 as 'passed'. Rejecting -1 could discard every otherwise valid record for this station. The corrected filter retains unchecked records, preserves their QC flag, and excludes explicitly flagged qcStatus=0 records.

The actual upstream QC distribution for your authenticated request is not visible from the public manifest. New diagnostic counters establish whether this was the only cause or whether the API also returns empty responses or rejects records for another reason.

Reference: https://www.ibm.com/docs/en/environmental-intel-suite?topic=apis-pws-observations-current-conditions

## Apply

1. Extract this ZIP.
2. In your GitHub repository, replace collector.py, dist/app.mjs, README.md and the matching test files. Add tests/test_api_response.py. Keep the exact directory structure. Upload the extracted contents rather than the ZIP itself.
3. Do not change WU_API_KEY or WU_INSTALLATION_DATE. No workflow change is required. The existing workflow runs after the commit; alternatively use Actions > Update weather & deploy Pages > Run workflow.
4. After the collection and deployment finish, reload your GitHub Pages site. The corrected collector automatically rechecks the dates marked as checked by the earlier QC filter. Existing data files are preserved.
5. If readings remain absent, expand Collect station observations and find API observations/current. A line such as 'HTTP 200; received=1, accepted=1, QC={...}' means a record passed the filter. received=0 indicates an empty provider response. received>0 with accepted=0 indicates records were filtered; the QC counts identify flagged records. HTTP 204 and 404 are logged distinctly. These diagnostics are also stored in data/manifest.json under diagnostics. Logs never include the API key or authenticated URL.

The dashboard now distinguishes 'API key not configured' from 'No station data returned'. Replacing the label alone does not create observations; the collector change is required.

## Validation

12 Python checks pass, including a provider response containing unchecked QC=-1 records, secret-safe logging, HTTP 204, historical-date retry after the QC fix, and preservation of existing archives after an API failure. JavaScript syntax validation also passes. Live authenticated collection must be verified in your next GitHub Actions run; no API key was requested or used to prepare this update.

This patch includes no data/manifest.json or other observation data stubs, so applying it does not overwrite your generated station archive.
