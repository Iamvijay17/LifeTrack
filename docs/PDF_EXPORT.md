# PDF export

Every PDF in the web app is built by one engine, so they all look and paginate the same way.

## Why it was rebuilt

| Problem | Cause |
| --- | --- |
| Reports "PDF" was the browser's print of the dark app | `window.print()` on the page: dark theme, charts cut across pages, no page numbers or header |
| ₹ printed as "Rs", accents and dashes were replaced | the old Insights writer only knew Latin-1 Helvetica |
| Long text was cut with "…", columns were guessed | text width was approximated, table cells could not wrap |
| Charts were crude bars | no axes, units or legends |
| No progress, no retry, double click could download twice | the export ran inline in the click handler |

## Pieces

- `services/pdf/engine.js` lays blocks out on A4 pages with pdf-lib (file writer) and real glyph metrics of the embedded font. Blocks: `heading`, `text`, `note`, `kpis`, `table`, `bars`, `chart` (`columns` or `line`), `orientation`, `pagebreak`.
- `services/pdf/fonts.js` loads Inter (latin + latin-ext, regular and semibold) from the app bundle. Nothing is fetched from a third party. The engine, pdf-lib and the fonts are loaded only when an export starts.
- `features/reports/pdf/templates.js` one template per module. A template returns no blocks when the module has nothing in the period.
- `features/reports/pdf/buildReportPdf.js` validates the request and assembles the document. `ExportPdfDialog.jsx` is the UI; `usePdfExport.js` runs one export at a time, shows progress, and reports success only after the file is built and handed to the browser.

## Adding a section to a report

Add a function to `T` in `templates.js` returning blocks (or `[]`), and an entry in `MODULES` and `MODULE_TABLES`. A new PDF elsewhere in the app only needs `renderPdf(spec)` with blocks.

## Limits

- Glyphs outside Latin and Latin Extended (for example Tamil, CJK) print as `?`; emoji are dropped.
- Charts are drawn as vectors from the data, not captured from the screen, so they look different from the on-screen charts by design.
- The engine adds about 1.1 MB (510 kB gzip) to a lazy chunk that loads on first export.
- Tests: `tests/pdfExport.test.js`. Set `PDF_SAMPLES_DIR=/some/folder` to also write every PDF the tests build, for a look at the real pages.
