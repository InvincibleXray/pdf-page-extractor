# Phase 6C Implementation Plan: AcroForm Export & Form Flattening Engine

## 1. Overview
Persist client-side AcroForm edits into exported PDFs with two explicit modes:
- **Mode A (Editable PDF):** Preserves valid `/AcroForm`, `/Fields`, field hierarchy, widgets, and appearance streams.
- **Mode B (Flattened PDF):** Bakes form values into page vector streams and eliminates all interactive fields and widgets.
Both modes must strictly preserve Phase 5 secure redactions, support page operations, enforce an XFA fail-closed gate, and pass an independent forensic verification gate prior to download.

---

## 2. Tasks

### Task 1: Core Export Engine Upgrades (`src/utils/pdfExportEngine.ts`)
- Add `FormExportMode = 'interactive' | 'flattened'` to `ExportEngineOptions`.
- Implement `exportInteractiveFormPdf` and `exportFlattenedFormPdf` convenience entry points.
- Implement XFA pre-flight check: if dynamic XFA is present, abort export with error `"XFA forms are not supported."`.
- Implement digital signature check: if `/FT /Sig` is present, record warning `"Editing this PDF may invalidate its existing digital signature."`.
- For AcroForm documents, use in-place mutation on `srcDoc = await PDFDocument.load(pristineBytes)`:
  - Synchronize form field values (`PDFTextField`, `PDFCheckBox`, `PDFRadioGroup`, `PDFDropdown`, `PDFOptionList`).
  - Update appearances cleanly.
  - Page operations: update page rotations, remove fields belonging exclusively to deleted pages, duplicate pages when repeated, and reorder `/Pages` `/Kids` array.
  - Redaction reconciliation: if a page contains redactions, remove any form fields with widgets on that page from `/AcroForm /Fields` so secrets/canaries are obliterated, rasterize the page with burned-in redactions, and replace page `/Contents` with 0 annotations.
  - Mode B flattening: call `form.flatten()`, purge `/AcroForm` from catalog, and remove surviving `/Widget` annotations.
  - Draw standard editor overlay objects (text, shapes, pen, image, highlights).
  - Apply `sanitizePdfDocument(srcDoc)`.
  - Enforce validation gate: PDF.js verification, AcroForm verification, flattened check, redaction & canary verification before download.

### Task 2: Export UI & Pre-Flight Modal (`src/pages/pdf-editor.astro`)
- Keep existing clean layout.
- When `editor-export-btn` is clicked:
  - If XFA detected: show alert/toast `"XFA forms are not supported."` and block export.
  - If form fields present: open `#export-mode-modal` offering:
    - **Editable PDF** (*"Form fields remain editable."*)
    - **Flattened PDF** (*"Form values become part of the page and can no longer be edited as form fields."*)
    - Display signature warning if present.
    - Display redaction notice if redactions present.
  - If no form fields present: proceed directly or open redaction modal as before.

### Task 3: Test Fixtures & Independent Forensic Verifier
- Test fixtures:
  - `test-fixtures/phase6c-real-form.pdf` (Page 1: text, multi, pass, check, radio, drop; Page 2: listbox, required, readonly, multi-widget, hierarchy; Page 3: static content).
  - `test-fixtures/phase6c-redaction-form.pdf` (Secret canary field `SUPER_SECRET_FORM_VALUE_6C`, unaffected field, static text).
- Independent verifier (`scripts/phase6c-export-verifier.js`):
  - Validates interactive PDF structure (`/AcroForm`, `/Fields`, field types, values, widgets, page associations).
  - Validates flattened PDF structure (0 widgets, no `/AcroForm`, visible values).
  - Forensic canary search on redacted export (checks text extraction, raw ASCII, raw UTF-8, decompressed streams, AcroForm, widget annotations).

### Task 4: Real Browser Acceptance Test (`scripts/phase6c-browser-acceptance.js`)
- Start real browser session.
- Fill fields via real UI.
- Test Mode A download & verify in fresh session.
- Test Mode B download & verify in fresh session.
- Test Redaction over secret canary & verify forensic elimination.
- Mobile viewports (320px, 390px).

### Task 5: Full Regression Testing & Technical Report
- `npx tsc --noEmit`
- `npm run build`
- `node scripts/phase4-real-export-acceptance-test.js`
- `node scripts/phase5b-remediation-tests.js`
- `node scripts/phase6b-browser-qa.js`
- `node scripts/visual-qa-editor.js`
- Generate `docs/phase6c-form-export-report.md`.
