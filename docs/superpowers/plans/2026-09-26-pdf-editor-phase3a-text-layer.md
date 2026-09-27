# PDF Editor — Phase 3A: Existing PDF Text Layer & Visual Text Replacement Implementation Plan

> **For**: `InvincibleXray/pdf-page-extractor`  
> **Spec**: [`docs/superpowers/specs/2026-09-26-pdf-editor-phase3a-text-layer-design.md`](file:///c:/Users/A/Desktop/pdf%20tool%20web%20dev/docs/superpowers/specs/2026-09-26-pdf-editor-phase3a-text-layer-design.md)  
> **Goal**: Implement PDF.js TextLayer, per-page existing text indexing, visual text selection, click-to-edit inline editor, opaque background masking, `pdf-lib` export, transactional undo/redo, and dead controls cleanup.

---

## Proposed Changes & File Mapping

| File | Nature of Change | Primary Responsibility |
| :--- | :---: | :--- |
| `src/utils/pdfTextLayer.ts` | **NEW** | Mounts PDF.js `TextLayer`, indexes `ExistingPdfTextItem` for active page, handles lifecycle and text extraction |
| `src/components/editor/EditorViewport.astro` | **MODIFY** | Mounts `#pdf-text-layer` between canvas and overlay; adds `#existing-text-action-bar` floating pill; manages pointer event hierarchy |
| `src/utils/editorState.ts` | **MODIFY** | Adds `TextReplacementEditorObject`, `selectedExistingTextId`, methods to store and transactionally undo/redo replacements |
| `src/utils/editorInteractionController.ts` | **MODIFY** | Handles clicks on TextLayer spans in select mode, opens prefilled inline editor with live whiteout preview, handles `Ctrl+Enter` commit |
| `src/utils/pdfExportEngine.ts` | **MODIFY** | Burns opaque background mask and replacement text into `pdf-lib`; adds large PDF ($>50\text{MB}$) export memory guard |
| `src/components/editor/EditorInspector.astro` | **MODIFY** | Replaces misleading tip copy; binds properties for active text replacement (text, font size, font family, text color, mask color) |
| `src/components/editor/EditorToolbar.astro` | **MODIFY** | Marks dead controls (`Redact`, `Underline`, `Strikethrough`, `Comment`) as `(Coming soon)` / disabled; labels `Whiteout — Visual Covering` |
| `src/pages/pdf-editor.astro` | **MODIFY** | Synchronizes TextLayer on page/zoom changes; hides TextLayer spans when replacements exist; connects floating action bar |
| `scripts/verify-text-layer.js` | **NEW** | Node test script verifying TextLayer extraction, coordinate bounds mapping, and indexing |
| `scripts/verify-replacement-export.js` | **NEW** | Automated test verifying `text-replacement` export with `pdf-lib` and visual verification |
| `scripts/visual-qa-editor.js` | **MODIFY** | End-to-end browser test covering existing text click, inline edit, replacement, zoom stability, export, and mobile views |

---

## Detailed Task Breakdown

### Task 1 (P0): TextLayer Engine & Indexing (`pdfTextLayer.ts`)
- **Deliverable**: `src/utils/pdfTextLayer.ts`
- **Actions**:
  1. Define `ExistingPdfTextItem` interface.
  2. Implement `PdfTextLayerManager`:
     - Calls `page.getTextContent()`.
     - Maps each `TextItem` transform to `pdfBounds` (72 dpi, top-left origin) using page height.
     - Builds per-page `Map<string, ExistingPdfTextItem>`.
     - Instantiates `new TextLayer({ textContentSource, container, viewport })` and calls `render()`.
     - Injects necessary `.textLayer` CSS styles (`position: absolute; inset: 0; color: transparent; ...`).
     - Adds `cancel()` and `dispose()` to clean up DOM and abort in-flight rendering.
  3. Verify with `scripts/verify-text-layer.js`.

### Task 2 (P0): Viewport Stacking & Pointer Hierarchy (`EditorViewport.astro`)
- **Deliverable**: `src/components/editor/EditorViewport.astro`
- **Actions**:
  1. Add `<div id="pdf-text-layer" class="textLayer absolute inset-0 overflow-hidden pointer-events-auto"></div>` directly between `#pdf-render-layer` and `#editor-overlay-layer`.
  2. Add floating action pill `<div id="existing-text-action-bar">` containing `[ Edit Text ]`.
  3. Set `#editor-overlay-layer` to `pointer-events-none` when `activeTool === 'select'` so clicks reach the TextLayer spans, while individual child `.editor-object` elements retain `pointer-events-auto`.
  4. When creation tools (`text`, `rectangle`, `pen`, etc.) are active, `#editor-overlay-layer` switches to `pointer-events-auto` and `#pdf-text-layer` to `pointer-events-none`.

### Task 3 (P1): State Model & Transactional Replacements (`editorState.ts`)
- **Deliverable**: `src/utils/editorState.ts`
- **Actions**:
  1. Add `TextReplacementEditorObject` schema extending `BaseEditorObject`:
     - `sourceTextItemId`, `originalText`, `replacementText`, `fontSize`, `fontFamily`, `color`, `backgroundColor`, `maskPadding`.
  2. Add `selectedExistingTextId: string | null` to `EditorStateSnapshot`.
  3. Implement `selectExistingText(id: string | null)`.
  4. Ensure `deleteSelectedObject()` on a replacement restores visibility of the underlying TextLayer span.
  5. Verify Undo/Redo transactional stack cleanly pushes and pops text replacements without storing PDF binary buffers.

### Task 4 (P1): Click-to-Edit & Visual Masking Interaction (`editorInteractionController.ts`)
- **Deliverable**: `src/utils/editorInteractionController.ts`
- **Actions**:
  1. Listen for pointer clicks on `span[data-text-id]` inside `#pdf-text-layer` when `activeTool === 'select'`.
  2. On click: set `selectedExistingTextId`, anchor `#existing-text-action-bar` above/below the text bounds.
  3. On double click or clicking `[ Edit Text ]`:
     - Mount inline contenteditable editor directly over the text item screen bounds.
     - Mount a temporary opaque whiteout mask below the editor so the user sees the original text covered in real time.
     - Prefill with original text.
  4. Shortcuts:
     - `Ctrl/Cmd + Enter`: commit replacement -> create `TextReplacementEditorObject` -> add to store -> record history snapshot.
     - `Escape`: cancel -> clean up inline editor without creating object.
     - `Enter`: plain newline (multiline text).
     - `blur`: commit if changed; cancel if empty/unchanged.

### Task 5 (P2): Export Engine Support (`pdfExportEngine.ts`)
- **Deliverable**: `src/utils/pdfExportEngine.ts`
- **Actions**:
  1. Add `'text-replacement'` to pre-flight `supportedTypes`.
  2. For each `text-replacement`:
     - Draw opaque background mask (`page.drawRectangle`) with padding over `(x, y_pdflib)`.
     - Draw replacement text (`page.drawText`) using embedded standard fonts.
  3. Large File Safety: If `pristineBytes.byteLength > 50 * 1024 * 1024`, skip the redundant secondary `PDFDocument.load()` verification to prevent heap exhaustion.
  4. Verify with `scripts/verify-replacement-export.js`.

### Task 6 (P2): Inspector & Dead Controls Cleanup
- **Deliverable**: `EditorInspector.astro`, `EditorToolbar.astro`, `EditorUploadState.astro`, `pdf-editor.astro`
- **Actions**:
  1. `EditorInspector.astro`:
     - Update tip: `"Select text or an added object to edit its properties."`
     - When `text-replacement` is selected: display "Text Replacement Properties" pane allowing modification of text, font size, font family, color, and mask background color.
  2. `EditorToolbar.astro`:
     - Label `Redact (Coming soon)` with disabled state and tooltip `"Cryptographic redaction planned for Phase 3B"`.
     - Label `Whiteout — Visual Covering`.
     - Mark `Underline`, `Strikethrough`, `Comment`, and `More` menu items with `(Coming soon)` badges/tooltips.
  3. `EditorUploadState.astro`:
     - Remove false claims of cryptographic redaction.

### Task 7 (P3): Automated QA, Visual Testing & Regression Suite
- **Deliverable**: `scripts/visual-qa-editor.js`
- **Actions**:
  1. Add test suite steps:
     - Select existing text on page 1 of sample PDF.
     - Click "Edit Text".
     - Type replacement text.
     - Commit via `Ctrl+Enter`.
     - Verify visual replacement appears and original text is masked.
     - Test zoom in to 200% and ensure replacement remains anchored.
     - Test Undo and Redo.
     - Trigger export and verify exported PDF has replacement and retains original pages.
     - Test on 876-page PDF to ensure single-page TextLayer creation.
  2. Run `npm run check` (`tsc --noEmit`) -> 0 errors.
  3. Run `npm run build` -> 0 errors.
  4. Run `node scripts/visual-qa.js` (extractor regression) -> 0 errors.
  5. Run `node scripts/visual-qa-editor.js` -> 0 errors across all viewports.
