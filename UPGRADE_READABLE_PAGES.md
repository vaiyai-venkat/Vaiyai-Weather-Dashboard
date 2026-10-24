# Larger, clearer text and separate dashboard views

Upload the **extracted contents** of this ZIP to the root of your existing GitHub repository. Preserve the `dist/` and `tests/` folders and replace matching files. Allow the existing Pages workflow to finish, then reload the dashboard.

This is a cumulative source update: it includes the pressure graph and customizable comparisons from the previous update, plus the new typography and page navigation. Add every included JavaScript module, including `dist/pages.mjs`, `dist/comparison.mjs` and `dist/compare-ui.mjs`.

The ZIP contains no observation data, configuration file, initial manifest or repository workflow. Your existing API key, installation date, observation archive and schedule remain in place. The collector retains the QC correction and pressure-bound fields from the earlier update.

## Viewing changes

- Most desktop labels and controls use 16–17px type, chart labels use 14px, record-table values use 17px, and summary readings use 31–36px.
- Text has stronger weight and contrast in both dark and light themes. Chart lines are thicker. Controls have larger touch targets.
- Overview, Weather Trends, Compare and Records open as separate page-like screens. Only the chosen screen is shown; the selected navigation button stays highlighted.
- Date/range selections are retained between Overview, Weather Trends and Records. Comparisons keep their independent settings.
- Back/Forward navigation and direct view links work. Pressure and other summary shortcuts open the matching graph view.
- All four navigation buttons remain visible on a narrow screen. Charts resize with readable labels and fewer date ticks where needed. Wide comparison charts and record tables scroll within their own containers.

## Checks

The existing collector and analytics checks pass. Browser checks cover exclusive page visibility, preserved date selections, Back navigation, pressure shortcuts, mobile layout and actual rendered font sizes.

The preview screenshot uses illustrative data. The update becomes live on your GitHub Pages website after you upload these files and its deployment workflow completes.
