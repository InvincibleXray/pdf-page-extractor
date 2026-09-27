# Phase 5: True Secure Redaction — Implementation Plan

**Document:** `docs/phase5-redaction-plan.md`  
**Status:** Implementation Roadmap — **DO NOT IMPLEMENT UNTIL APPROVED**

---

## 1. Overview & Phased Roadmap

This plan establishes a stepwise, test-driven approach to implementing secure redaction without regressing Phase 1, Phase 2, Phase 3A, or Phase 4.

```
Phase 5A: Clean Page Synthesis & Forensic Validation Engine (Current Stack)
   ├── Task 1: Redaction State Model & Draft UI
   ├── Task 2: High-Resolution Pixel Obliteration Pipeline (300 DPI)
   ├── Task 3: Selective Clean Page Substitution in pdfExportEngine
   ├── Task 4: Global Document Sanitizer (Metadata, XMP, Annotations)
   ├── Task 5: Pre-Export Automated Forensic Validator
   ├── Task 6: UI Activation & Pre-Export Confirmation Modal
   └── Task 7: Automated End-to-End Acceptance Test & Verification
```

---

## 2. Task Breakdown

### Task 1: Redaction State Model & Draft UI
- **File:** `src/utils/editorState.ts`, `src/utils/editorInteractionController.ts`
- **Actions:**
  1. Add `RedactionEditorObject` to `EditorObject` union.
  2. Implement draft drag-to-create in `editorInteractionController.ts` when `activeTool === 'redact'`.
  3. Render translucent red preview box with dashed border on `#editor-overlay-layer`.
  4. Ensure handles (`nw`, `ne`, `se`, `sw`) allow resizing.
  5. Verify Undo / Redo restores draft redactions non-destructively.

### Task 2: High-Resolution Pixel Obliteration Pipeline
- **File:** `src/utils/pdfRasterRedactor.ts` (New utility)
- **Actions:**
  1. Create `renderSanitizedPageRaster(pageProxy, redactions, scale)`:
     - Render base PDF page to an offscreen canvas at 300 DPI (scale ~4.167).
     - Fill all redaction rectangles with `rgb(0, 0, 0)`.
     - Render optional overlay label (e.g. `[REDACTED]`).
     - Return raw PNG / JPEG `Uint8Array`.
  2. Implement memory cleanup to avoid canvas retention.

### Task 3: Selective Clean Page Substitution in `pdfExportEngine.ts`
- **File:** `src/utils/pdfExportEngine.ts`
- **Actions:**
  1. Check if page $i$ contains any `redact` objects.
  2. If **NO redactions**: use `outDoc.copyPages(srcDoc, [i])` to preserve 100% native vector text and low file size.
  3. If **HAS redactions**: embed the sanitized raster image from Task 2 as a new page with identical dimensions and rotation.

### Task 4: Global Document Sanitizer
- **File:** `src/utils/pdfSanitizer.ts` (or within `pdfExportEngine.ts`)
- **Actions:**
  1. Clear `/Info` dictionary: Title, Author, Subject, Keywords, Creator.
  2. Remove `/Metadata` XMP stream from document catalog.
  3. Remove annotations intersecting the redaction box from the page's `/Annots` array.
  4. Clear form widget dictionaries located inside redacted regions.

### Task 5: Pre-Export Automated Forensic Validator
- **File:** `src/utils/pdfForensicValidator.ts`
- **Actions:**
  1. Inspect exported `Uint8Array` before triggering browser download:
     - Load exported bytes in PDF.js and extract text content: assert redacted strings are absent.
     - Scan raw byte stream for uncompressed plaintext strings: assert redacted strings are absent.
  2. If any leak is detected, **abort export** and throw a visible security error.

### Task 6: UI Activation & Pre-Export Confirmation Modal
- **File:** `src/components/editor/EditorToolbar.astro`, `src/components/editor/EditorInspector.astro`, `src/pages/pdf-editor.astro`
- **Actions:**
  1. Enable `#tool-redact-btn` in toolbar and remove `disabled` attribute.
  2. Add dedicated Redaction pane in Inspector (choose Black / White fill, enter optional label).
  3. Show confirmation modal upon export:
     *"Permanent Redaction Warning: Redacted pages will be rasterized to permanently destroy underlying text and images. This cannot be undone once exported."*

### Task 7: Automated End-to-End Acceptance Test
- **File:** `scripts/secure-redaction-acceptance-test.js`
- **Actions:**
  1. Run automated browser suite covering text redaction, image redaction, partial text redaction, undo/redo, metadata sanitization, and export inspection.

---

## 3. Acceptance Test Specification (`scripts/secure-redaction-acceptance-test.js`)

The test must execute the following 15 verification steps against a live browser session:

1. **Create Synthetic Fixture PDF**:
   - Page 1: Contains secret text `"CONFIDENTIAL_SSN_987-65-4321"`, a vector logo, and metadata `Author: "TopSecretUser"`.
   - Page 2: Contains scanned image with text `"BANK_ACCOUNT_555"`.
   - Page 3: Contains standard public text `"Public Page 3"`.
2. **Load Fixture into Running Editor**: Open `/pdf-editor` and upload fixture.
3. **Draft Redaction on Page 1**: Drag redaction box over `"987-65-4321"` (partial text).
4. **Draft Redaction on Page 2**: Drag redaction box over `"BANK_ACCOUNT_555"` (image).
5. **Verify Draft Non-Destructiveness**: Click Undo -> verify redaction removed -> click Redo -> verify restored.
6. **Trigger Export with Metadata Sanitization**: Click "Export Redacted PDF".
7. **Verify Download**: Capture downloaded file via CDP session.
8. **Forensic Check 1 (PDF.js Text Extraction)**:
   - Extract text from Page 1: assert `"987-65-4321"` is NOT in extracted text.
   - Assert `"CONFIDENTIAL_SSN_"` before the box is intact (or page is rasterized).
   - Extract text from Page 3: assert `"Public Page 3"` remains 100% selectable vector text!
9. **Forensic Check 2 (Raw Byte Stream Scanner)**:
   - Scan raw uncompressed and inflated PDF streams: assert `"987-65-4321"` does NOT appear in raw bytes.
10. **Forensic Check 3 (Metadata Purge)**:
    - Inspect `/Info` and `/Metadata`: assert `"TopSecretUser"` is absent.
11. **Forensic Check 4 (Layer Removal Attack)**:
    - Attempt to delete the top-level drawing operator: assert no underlying text or image exists.
12. **Forensic Check 5 (Page 3 Vector Preservation)**:
    - Confirm Page 3 was NOT rasterized and retained its compact vector size.
13. **Forensic Check 6 (Downloaded PDF Reopening)**:
    - Reopen downloaded PDF in fresh browser tab; visually confirm black redaction boxes are baked into the page.
14. **Responsive Verification**: Multi-viewport regression check across 320px to 1440px.
15. **Extractor Regression Check**: Verify `scripts/visual-qa.js` passes.

---

## 4. Risk Matrix & Mitigations

| Risk | Impact | Likelihood | Mitigation Strategy |
|---|---|---|---|
| **Underlying Text Leakage** | Critical (Security Failure) | Low (with Raster Reconstruction) | Redacted pages are completely replaced with clean rendered raster bitmaps. Content streams containing glyphs are never copied to output. |
| **Out-of-Memory (OOM) on Large PDFs** | High (Crash) | Low | Selective processing: only pages with active redactions are rendered to canvas. All unredacted pages are passed through via `copyPages`. |
| **Visual Blur / Low Resolution** | Medium (UX) | Low | Render raster pages at 300 DPI (scale 4.167) rather than screen 72/96 DPI. Print quality remains sharp. |
| **Increased Output File Size** | Low (Performance) | Medium | Only redacted pages have image payloads (compressed with PNG/JPEG); unredacted pages remain compact vector streams. |
| **Legal / Licensing Exposure** | High (Legal) | None | Zero AGPL dependencies. Uses existing MIT (`pdf-lib`) and Apache 2.0 (`pdfjs-dist`). |

---

## 5. Definition of Done for Phase 5

Phase 5 will only be considered complete and ready for production when:
1. `scripts/secure-redaction-acceptance-test.js` passes all 15 verification steps with code 0.
2. The pre-export validator confirms 0 string occurrences of redacted data in exported PDF.
3. The UI label is safely changed from `"Redact — Coming soon"` to `"Redact"`.
4. Extractor and existing editor visual QA suites pass with zero regressions.
