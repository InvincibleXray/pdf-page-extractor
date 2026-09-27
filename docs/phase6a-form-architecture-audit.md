# Phase 6A — PDF Forms / Form Filling Architecture & Capability Audit

**Repository:** `c:\Users\A\Desktop\pdf tool web dev`  
**Project:** `InvincibleXray/pdf-page-extractor`  
**Date:** 2026-09-26  
**Auditor:** Antigravity Autonomous Architecture & Security Agent  
**Scope:** Deep Architectural & Capability Audit for AcroForms, Widget Annotations, XFA, and Form Filling  
**Status:** **AUDIT ONLY — NO PRODUCTION IMPLEMENTATION**

---

## 1. Executive Summary

This audit assesses the feasibility, architecture, performance boundaries, and security constraints of introducing **PDF Form Filling (AcroForm)** support into the PDF Editor.

### Key Empirical Findings
1. **Library Capabilities:**
   - **`pdfjs-dist` (v4.10.38):** Fully capable of authoritative form discovery. `page.getAnnotations({ intent: 'display' })` extracts all terminal widget annotations, precise bounding boxes (`rect`), default appearances, flags (`readOnly`, `required`, `hidden`, `comb`, `maxLen`), and choice options. `doc.getFieldObjects()` provides document-level tree discovery in **~2 ms** even on an 876-page / 211.7 MB PDF.
   - **`pdf-lib` (v1.17.1):** Fully capable of reading and mutating field values (`PDFTextField`, `PDFCheckBox`, `PDFRadioGroup`, `PDFDropdown`, `PDFOptionList`). Verified 100% round-trip mutation fidelity. Built-in `form.flatten()` correctly bakes field appearances into the content stream and purges interactive widgets.
2. **Critical Export Architecture Discovery:**
   - The current export engine (`pdfExportEngine.ts`) relies on `outDoc.copyPages(srcDoc, ...)`.
   - **Empirical Proof:** `outDoc.copyPages()` copies page visual streams and annotations, but **silently drops the Document Catalog's `/AcroForm` dictionary**. Exporting an AcroForm via `copyPages()` strips all interactive field definitions!
   - **Solution:** Interactive form export must transition to an in-place mutation pipeline (`srcDoc.getForm()`) or catalog reconstruction.
3. **XFA Forms:**
   - `pdf-lib` explicitly deletes `/XFA` upon save (`"Removing XFA form data as pdf-lib does not support reading or writing XFA"`).
   - Neither browser JavaScript nor `pdf-lib` can render or evaluate dynamic XFA XML scripts.
   - **Verdict:** Dynamic XFA must be **explicitly unsupported** with a clear user-facing warning.
4. **Digital Signatures:**
   - `pdf-lib` recognizes `/FT /Sig` as `PDFSignature`, but **cannot compute PKCS#7 detached digital signatures**.
   - Modifying any PDF field after signing invalidates the cryptographic ByteRange digest.
   - **Verdict:** True cryptographic digital signing is **unsupported**. Signature fields must be treated as detection-only / visual stamps.
5. **Security & Privacy:**
   - An automated Chrome CDP network audit confirmed: **0 document data requests**, **0 telemetry requests**, **0 sensitive payload leaks**, and **0 storage entries** in `localStorage`/`sessionStorage`. 100% client-side privacy is preserved.

---

## 2. Existing Repository Architecture Review

The current PDF Editor is built with Astro, TypeScript, Tailwind CSS, `pdfjs-dist` (client-side rendering), and `pdf-lib` (export/mutation).

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Current Editor Stack                            │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 5: Floating Action Bars (Text Selection, Replacement)            │
│ Layer 4: Selection & Transform Gizmos (Bounding boxes, Resize handles) │
│ Layer 3: Normalized Editor Overlay (#editor-viewport-overlay)          │
│ Layer 2: PDF.js TextLayer (#pdf-text-layer)                            │
│ Layer 1: PDF.js Canvas Bitmap (#pdf-canvas)                            │
└────────────────────────────────────────────────────────────────────────┘
```

- **`coordinateMapper.ts`:** Converts screen/pointer coordinates to PDF points (72 DPI, top-left origin) using PDF.js `PageViewport`.
- **`editorState.ts`:** Centralized reactive state store managing pages, tools, history, and overlay objects.
- **`editorInteractionController.ts`:** Dispatches pointer events for drawing, selecting, and transforming objects.
- **`pdfExportEngine.ts`:** Constructs the exported PDF. Currently uses a clean-document synthesis model (`PDFDocument.create()` + `copyPages()`) with selective 300 DPI raster reconstruction for redacted pages.

---

## 3. PDF Form Taxonomy & Capability Matrix

PDF documents with visible input boxes fall into distinct technical categories:

```
PDF Form Taxonomy
├── Interactive Forms
│   ├── AcroForm (Standard PDF Interactive Forms — ISO 32000-1) [SUPPORTABLE]
│   └── XFA (XML Forms Architecture — Proprietary Adobe Dynamic Forms) [UNSUPPORTED]
└── Non-Interactive / Static Visual Forms
    ├── Static Vector Forms (Lines, Rectangles, Labels in Content Stream) [VIEWABLE ONLY]
    ├── Scanned Form Images (Raster Bitmaps of Paper Forms) [VIEWABLE ONLY]
    └── Flattened Forms (Previously Interactive Forms Baked into Stream) [VIEWABLE ONLY]
```

### Comprehensive Capability Matrix

| Feature / Capability | Detect | Render | Select | Edit | Export | Notes |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Single-Line Text (`/Tx`)** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | Supported via `PDFTextField.setText()` |
| **Multiline Text (`/Tx` + Multiline)** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | Supported via `<textarea>` overlay |
| **Password Field (`/Tx` + Password)** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | Masked input `<input type="password">` |
| **Comb Fields (`/Tx` + Comb bit 25)** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | Segmented character spacing |
| **Checkbox (`/Btn`)** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | Supported via `PDFCheckBox.check()/uncheck()` |
| **Radio Button Group (`/Btn`)** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | Synchronized radio selection via `PDFRadioGroup` |
| **Dropdown / Combo Box (`/Ch`)** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | Supported via `PDFDropdown.select()` |
| **List Box (`/Ch` + MultiSelect)** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | Supported via `PDFOptionList.select()` |
| **Push Button (`/Btn` without Radio)** | ✅ Yes | ✅ Yes | ❌ No | ❌ No | ⚠️ Preserve | Action buttons (e.g., Reset, Submit, Print) |
| **Signature Field (`/Sig`)** | ✅ Yes | ⚠️ Yes | ❌ No | ❌ No | ⚠️ Preserve | Detection-only; cryptographic signing unsupported |
| **Required Field (`/Ff` bit 2)** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | Visual asterisk & validation feedback |
| **Read-Only Field (`/Ff` bit 1)** | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No | ✅ Yes | Rendered with disabled/locked styling |
| **Hidden Field (`/F` bit 2)** | ✅ Yes | ❌ No | ❌ No | ❌ No | ✅ Yes | Excluded from visual rendering |
| **Multi-Widget Field (1 Field, N Widgets)**| ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | Synchronized value propagation across pages |
| **Duplicate / Hierarchical Names** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | Resolved via fully qualified dot-notation |
| **Rotated Field (90°, 180°, 270°)**| ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | Rotation-invariant viewport projection |
| **Appearance Streams (`/AP`)** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | Re-generated on value change by `pdf-lib` |
| **`NeedAppearances` Flag** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | Set to `true` when custom fonts used |
| **XFA Form (`/XFA`)** | ✅ Yes | ❌ No | ❌ No | ❌ No | ❌ No | **Explicitly Unsupported**; warning displayed |
| **Flattened Static Visual Form** | ✅ Yes | ❌ No | ❌ No | ❌ No | ❌ No | Detected as standard vector text/paths |

---

## 4. Empirical Library Testing & Analysis

Installed package versions:
- `pdf-lib`: **1.17.1**
- `pdfjs-dist`: **4.10.38**

### 4.1. `pdf-lib` Findings
1. **Field Discovery:** `doc.getForm().getFields()` accurately enumerates all field objects and instantiates correct subclasses (`PDFTextField`, `PDFCheckBox`, `PDFRadioGroup`, `PDFDropdown`, `PDFOptionList`, `PDFSignature`).
2. **Value Mutation:**
   - `tf.setText('Jane')` $\rightarrow$ verified 100% match on reload.
   - `cb.uncheck()` $\rightarrow$ verified state transition `true` $\rightarrow$ `false`.
   - `rg.select('BankWire')` $\rightarrow$ verified radio option update.
   - `dd.select('Japan')` $\rightarrow$ verified dropdown option selection.
3. **Form Flattening:**
   - Calling `form.flatten()` deletes all `/Annots` widgets from pages and removes the `/AcroForm` catalog dictionary.
   - Empirical inspection via PDF.js confirmed that text (`"FLATTENED_NAME"`) was successfully baked into the page content stream.
4. **XFA Handling:**
   - Calling `doc.save()` on any document where `doc.getForm()` was invoked triggers:
     `"Removing XFA form data as pdf-lib does not support reading or writing XFA"`
   - `pdf-lib` actively deletes the `/XFA` catalog key.

### 4.2. `pdfjs-dist` Findings
1. **Widget Discovery:**
   - `page.getAnnotations({ intent: 'display' })` returns rich, authoritative metadata for every widget on the page.
   - Metadata includes: `id`, `subtype: 'Widget'`, `fieldName`, `fieldValue`, `fieldType`, `rect: [x1, y1, x2, y2]`, `readOnly`, `required`, `hidden`, `multiLine`, `maxLen`, `comb`, `textAlignment`, `options`, `defaultAppearanceData`.
2. **Radio Groups:**
   - PDF.js generates separate widget entries for each physical radio button on the page sharing the same `fieldName`.
3. **Performance:**
   - `doc.getFieldObjects()` completed in **2 ms** on a 211.7 MB / 876-page PDF.
   - Active-page `page.getAnnotations()` completed in **1.69 ms to 9.1 ms**.

---

## 5. Form Fixture Results (Fixtures A through T)

All 20 fixtures were generated and audited in `test-fixtures/phase6a/`:

| Fixture | Filename | PDF.js Widgets | `pdf-lib` Fields | Status |
| :--- | :--- | :---: | :---: | :--- |
| **A** | `FIXTURE_A_SINGLE_TEXT.pdf` | 2 | 2 | Verified text & comb fields |
| **B** | `FIXTURE_B_MULTILINE_TEXT.pdf` | 1 | 1 | Verified multiline text |
| **C** | `FIXTURE_C_CHECKBOX.pdf` | 3 | 3 | Verified checked/unchecked states |
| **D** | `FIXTURE_D_RADIO_GROUP.pdf` | 3 | 1 | 3 widgets mapped to 1 radio group |
| **E** | `FIXTURE_E_DROPDOWN.pdf` | 1 | 1 | Verified combo box options |
| **F** | `FIXTURE_F_LISTBOX.pdf` | 1 | 1 | Verified list box options |
| **G** | `FIXTURE_G_REQUIRED.pdf` | 2 | 2 | Verified required flags |
| **H** | `FIXTURE_H_READONLY.pdf` | 2 | 2 | Verified read-only flags |
| **I** | `FIXTURE_I_HIDDEN.pdf` | 2 | 2 | Verified annotation flag F=2 (Hidden) |
| **J** | `FIXTURE_J_MULTI_WIDGET_FIELD.pdf` | 2 | 1 | 2 widgets on 2 pages sharing 1 field |
| **K** | `FIXTURE_K_DUPLICATE_NAMES.pdf` | 4 | 4 | Verified hierarchical dot-notation |
| **L** | `FIXTURE_L_ROTATED_PAGE.pdf` | 4 | 4 | Verified across 0°, 90°, 180°, 270° |
| **M** | `FIXTURE_M_UNUSUAL_DIMS.pdf` | 2 | 2 | Verified banner (1200×300) & blueprint |
| **N** | `FIXTURE_N_OVERLAY_CONTENT.pdf` | 1 | 1 | Verified field over vector text/shapes |
| **O** | `FIXTURE_O_MISSING_AP.pdf` | 1 | 1 | Verified reading without `/AP` |
| **P** | `FIXTURE_P_NEED_APPEARANCES.pdf` | 1 | 1 | Verified `/NeedAppearances true` |
| **Q** | `FIXTURE_Q_MALFORMED.pdf` | 2 | 1 | Discovered orphaned widget handling |
| **R** | `FIXTURE_R_SIGNATURE.pdf` | 1 | 1 | Verified `/FT /Sig` detection |
| **S** | `FIXTURE_S_XFA.pdf` | 0 | 0 | Pure XFA has 0 AcroForm widgets |
| **T** | `FIXTURE_T_FLATTENED_STATIC.pdf` | 0 | 0 | 0 widgets (zero false positives) |

---

## 6. Form Rendering Architecture Evaluation

Three architectural candidates were evaluated for rendering interactive form fields:

```
Candidate A: PDF.js AnnotationLayer
Candidate B: Custom Accessible Form Overlay (Layer 2.5) [RECOMMENDED]
Candidate C: Pure Canvas / SVG Rendered Controls
```

| Evaluation Criteria | Candidate A: PDF.js AnnotationLayer | Candidate B: Custom HTML Form Overlay | Candidate C: Canvas/SVG Controls |
| :--- | :--- | :--- | :--- |
| **Coordinate Accuracy** | High (Managed by PDF.js) | **High** (Calculated via `PageViewport`) | Medium (Custom transform math) |
| **Event Pipeline** | ❌ Fights editor pointer events | ✅ **Perfect integration** via DOM layer | ❌ Requires custom hit-testing |
| **Design System / Theme**| ❌ Hard to style; default PDF.js CSS| ✅ **Full Tailwind & dark-mode support**| ❌ Custom canvas drawing |
| **Accessibility (a11y)**| Medium (basic inputs) | ✅ **Full ARIA, tab order, focus rings**| ❌ Completely inaccessible |
| **Mobile Soft Keyboard** | ❌ Causes erratic viewport jumps | ✅ **Smooth scroll & focus positioning**| ❌ Very poor virtual keyboard support |
| **State Synchronization**| ❌ Trapped inside PDF.js DOM | ✅ **Direct binding to `EditorStore`** | ⚠️ Complex custom state |

### Architectural Decision: Candidate B (Custom Form Overlay — Layer 2.5)
The editor will insert a dedicated **Form Widget Layer (`#pdf-form-layer`)** between the PDF.js TextLayer (L2) and the Editor Drawing Overlay (L3).
- **Geometry Source:** Authoritative PDF points from `page.getAnnotations({ intent: 'display' })`.
- **Rendering:** Semantic HTML elements (`<input>`, `<textarea>`, `<select>`, `<button>`) projected via `PageViewport.convertToViewportRectangle()`.
- **Interaction:** Standard HTML focus and input events update the reactive `FormDocumentState`.

---

## 7. Coordinate System & Geometry Audit

Tested via `scripts/phase6a-coordinate-audit.js`:
- **Rotations (Fixture L):**
  - **0° (595 × 842):** Screen Box: `left=49.5, top=131.5, w=221, h=31`
  - **90° (842 × 595):** Screen Box: `left=679.5, top=49.5, w=31, h=221` (Exact dimension swap)
  - **180° (595 × 842):** Screen Box: `left=324.5, top=679.5, w=221, h=31` (180° inversion)
  - **270° (842 × 595):** Screen Box: `left=131.5, top=324.5, w=31, h=221` (270° swap)
  - Every coordinate is strictly non-negative and contained within the page bounding box.
- **Zoom Proportionality (Fixture A):**
  - Zoom 25%: `w=50.25, h=6.5`
  - Zoom 50%: `w=100.5, h=13.0`
  - Zoom 100%: `w=201.0, h=26.0`
  - Zoom 200%: `w=402.0, h=52.0`
  - Sub-pixel linear scaling verified.

---

## 8. Proposed Normalized Form State Model

Form state must be decoupled from graphic annotations (`objects: EditorObject[]`) to preserve clean separation between vector overlays and underlying PDF form fields.

```typescript
export interface FormDocumentState {
  hasAcroForm: boolean;
  isXfa: boolean;
  fields: Map<string, FormFieldState>; // Keyed by fully qualified name
  dirtyFields: Set<string>;
}

export interface FormFieldState {
  id: string;               // e.g. "applicant.firstName"
  name: string;             // e.g. "firstName"
  type: 'text' | 'multiline' | 'checkbox' | 'radio' | 'dropdown' | 'listbox' | 'signature';
  value: string | boolean | string[];
  defaultValue: string | boolean | string[];
  readOnly: boolean;
  required: boolean;
  hidden: boolean;
  maxLen?: number;
  comb?: boolean;
  options?: Array<{ label: string; value: string }>;
  widgets: FormWidgetState[];
}

export interface FormWidgetState {
  widgetId: string;         // PDF.js internal ref (e.g. "9R")
  pageNumber: number;
  rect: [number, number, number, number]; // [x1, y1, x2, y2] PDF bottom-left points
  rotation: number;
  exportValue?: string;     // For radio / checkbox options
}
```

---

## 9. History & Undo/Redo Architecture

### Transaction Boundaries
1. **Discrete Inputs (Checkbox, Radio, Dropdown, OptionList):**
   - Push history snapshot immediately upon `change` event.
   - Example: Checking a box creates a single discrete undo record: `"Check Terms of Service"`.
2. **Continuous Text Inputs (Single-line, Multiline):**
   - Typing character-by-character must **NOT** flood history.
   - Implement a **500 ms debounce** and commit on `blur`.
   - Result: Typing `"Jane"` pushes one undo record: `"Edit First Name"`.
3. **Interplay with Page Operations:**
   - If Page 2 is moved or deleted, widgets mapped to Page 2 move or deactivate accordingly.
   - Undoing page deletion restores the page and rebinds its widgets to the field state.

---

## 10. Export Architecture: In-Place Mutation vs Flattening

### The `copyPages` Dilemma
In Section 4, empirical testing revealed that `PDFDocument.create()` + `outDoc.copyPages(srcDoc, ...)` **strips `/Catalog /AcroForm`**.

### Dual-Mode Export Strategy

```
Export Mode Selection
├── Mode A: Interactive Form Export (Default)
│   ├── Load pristine bytes into srcDoc
│   ├── Mutate fields in-place via srcDoc.getForm()
│   ├── Embed standard fonts if new glyphs introduced
│   └── Save with interactive fields preserved
└── Mode B: Flattened Form Export (User-Selected)
    ├── Load pristine bytes into srcDoc
    ├── Apply mutated values
    ├── Call srcDoc.getForm().flatten()
    └── Save static vector PDF (zero interactive widgets)
```

### Hybrid Redaction Interaction
- When a user applies a **Redaction Region** on Page 1 of a form document:
  - Page 1 undergoes clean-page raster reconstruction (destroying any widgets on Page 1 to ensure zero data leakage).
  - Unaffected pages (Pages 2+) retain their interactive AcroForm fields!

---

## 11. Digital Signatures Analysis

- **Detection:** PDF.js exposes `fieldType === 'Sig'`; `pdf-lib` provides `PDFSignature`.
- **Cryptographic Reality:** Digital signing requires:
  1. Private key access (PKCS#11 hardware token, PKCS#12 `.p12`/`.pfx` file).
  2. Public key certificate validation chain (CRL/OCSP).
  3. Strict byte-range hashing (`/ByteRange [start1 len1 start2 len2]`).
- **Hazard:** Modifying any byte in a signed PDF invalidates the signature hash.
- **Architectural Policy:**
  - **Detection Only:** The editor displays signature fields with a locked visual indicator: *"Digital Signature Field (Signing requires desktop certificate tool)"*.
  - Visual signatures (ink drawings from Phase 4) can be placed as visual annotations, but will **never be claimed as cryptographic signatures**.

---

## 12. XFA (XML Forms Architecture) Analysis

- **Detection:** Checked via `catalog.get(PDFName.of('AcroForm')).has(PDFName.of('XFA'))`.
- **Feasibility:** Dynamic XFA requires a proprietary Adobe XML rendering engine that is not available in browser JavaScript. `pdf-lib` deletes `/XFA` upon save.
- **Architectural Policy:**
  - **Explicitly Unsupported:** When an XFA document is opened, display a non-blocking notification banner:
    > *"This document contains dynamic Adobe XFA forms. Interactive form editing is not supported in web browsers. Form fields cannot be edited."*
  - The document remains viewable and printable, but fields will not be editable.

---

## 13. Security, Privacy & Malformed PDF Results

### Automated Privacy Run (`scripts/phase6a-security-audit.js`)
- **Total Requests Recorded:** 60
- **External CDN Requests:** 2 (Google Fonts UI fonts)
- **External Document / Form Data Requests:** **0**
- **Telemetry Requests:** **0**
- **Sensitive Payload Leaks:** **0** (SSN, email, phone checked)
- **Storage Leaks:** **0** (`localStorage` and `sessionStorage` clean)

### Malformed PDF Handling
- **Orphaned Widgets (Fixture Q):** PDF.js identifies orphaned widgets on the page, but `pdf-lib` ignores them because they are missing from the `/Fields` tree. The form editor must skip widgets without a valid parent field to prevent corruption.
- **Missing Appearance Streams (Fixture O):** PDF.js successfully reads `/V` values even when `/AP` is omitted. `pdf-lib` automatically generates standard appearance streams on save.

---

## 14. Large PDF Performance (876-Page Organizer)

Tested with `scripts/phase6a-large-pdf-audit.js` on `5th sem ECE organizer.pdf` (211.7 MB, 876 pages):
- **Document-Level Discovery (`getFieldObjects`):** **2 ms**
- **Active-Page Annotation Latency (`getAnnotations`):** **1.69 ms to 9.1 ms**
- **Heap Memory Delta:** **+4.6 MB**
- **Architectural Constraint:** **Lazy page inspection is mandatory**. Never iterate all 876 pages on load; query annotations only for the active visible page and cache the results.

---

## 15. Mobile UX & Accessibility (a11y)

### Mobile Viewports (320px, 360px, 390px, 430px)
- **Soft Keyboard Handling:** When an input receives focus, invoke `scrollIntoView({ behavior: 'smooth', block: 'center' })` to keep the input visible above the keyboard.
- **Font Sizing:** Input font size must be at least `16px` on mobile viewports to prevent iOS Safari auto-zoom.
- **Tap Target Sizing:** Checkboxes and radio buttons must have minimum 44 × 44 px touch targets via CSS padding or invisible pseudo-elements.

### Accessibility (a11y)
- **Tab Navigation:** Follow PDF document tab order across widgets.
- **ARIA Standards:**
  - `<input type="text" aria-label={field.name} aria-required={field.required} aria-readonly={field.readOnly}>`
  - `<input type="checkbox" role="checkbox">`
  - `<select aria-label={field.name}>`
- **Visual Focus:** 2px high-contrast focus rings (`outline: 2px solid #2563eb`) conforming to WCAG 2.1 AA.

---

## 16. UI/UX Proposed Integration

Minimal Phase 6 addition to existing toolbar and inspector:
1. **Toolbar Mode:** Add an interactive **"Fill Form"** state to the existing Select/Hand tool.
2. **Form Highlighting Toggle:** A subtle toggle in the top bar: `[Highlight Fields]` (toggles a light blue background on unfilled fields).
3. **Inspector Panel:** When a form field is active, the inspector displays:
   - Field Name
   - Field Type
   - Required / Read-Only badges
   - Reset Field button
4. **Export Dropdown:**
   - Default: `Export PDF (Editable Form)`
   - Secondary: `Export PDF (Flatten Form)`

---

## 17. Compatibility Matrix

| Feature | `pdfjs-dist` | `pdf-lib` | Current Editor | Phase 6 Plan | Risk Level |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Field Discovery** | ✅ Full | ✅ Full | ❌ None | Implement via PDF.js | Low |
| **Text Field Editing** | ✅ Full | ✅ Full | ❌ None | Custom HTML overlay | Low |
| **Checkbox / Radio** | ✅ Full | ✅ Full | ❌ None | Custom HTML overlay | Low |
| **Dropdown / List** | ✅ Full | ✅ Full | ❌ None | Custom HTML overlay | Low |
| **Form Flattening** | ✅ Viewable | ✅ `form.flatten()` | ❌ None | Add Flatten export option | Low |
| **Interactive Export** | N/A | ⚠️ Needs in-place | ❌ `copyPages` drops AcroForm | In-place mutation engine | **Medium** |
| **Digital Signatures** | ⚠️ Detect only | ⚠️ Detect only | ❌ None | Detection only / visual stamp | **High (if signing attempted)** |
| **XFA Forms** | ❌ Unsupported | ❌ Strips /XFA | ❌ None | Explicit warning banner | **High (if editing attempted)** |

---

## 18. Implementation Roadmap for Phase 6

Phase 6 should be split into discrete, testable sub-phases:

```
Phase 6 Implementation Roadmap
├── Phase 6B: Form Discovery & Interactive Overlay
│   ├── Form state store (FormDocumentState, FormFieldState)
│   ├── Lazy active-page widget discovery via PDF.js
│   ├── Custom HTML input overlay (Layer 2.5) with rotation-invariant PageViewport
│   └── Tab navigation and focus management
├── Phase 6C: In-Place Export & Form Flattening
│   ├── In-place mutation engine for interactive AcroForm export
│   ├── Optional form flattening via form.flatten()
│   ├── Redaction reconciliation (rasterizing redacted pages, preserving others)
│   └── Real browser export acceptance tests
└── Phase 6D: UX Polish, Mobile Optimization & Accessibility
    ├── Mobile soft keyboard auto-scroll
    ├── Highlight fields toggle
    ├── Form reset / clear actions
    └── Comprehensive visual QA across viewports (1440px down to 320px)
```

---

## 19. Explicit Unsupported Features

To prevent security vulnerabilities, corrupted PDFs, or false user expectations:
1. **Cryptographic Digital Signatures:** Creating PKCS#7 detached digital signatures with X.509 certificates is **strictly out of scope**.
2. **Dynamic Adobe XFA Forms:** XML Forms Architecture rendering is **strictly out of scope**.
3. **PDF Embedded JavaScript Execution:** Executing arbitrary JavaScript actions embedded in PDF form fields (`/AcroForm /AA` or widget `/A` actions) is **strictly disabled** for web application security.
4. **Barcode Form Fields:** 2D barcode generation widgets (e.g. Paper Forms barcodes) are **unsupported**.
