# Phase 4: PDF Page Management & Editor UX Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the PDF Editor with client-side page management (rotation, deletion, duplication, reordering), annotation tools (underline, strikethrough, sticky comments), accessible drag & drop thumbnail interactions, responsive mobile controls, and real browser export verification.

**Architecture:** Extend the normalized editor state model with a stable `PageState` entity and multi-field transactional history (`{ pages, objects, currentPage }`). Upgrade `coordinateMapper.ts` for full 4-corner rotation invariance. Materialize page order, rotation, and annotations at export time using `pdf-lib`'s `copyPages` and `page.setRotation(degrees(...))`.

**Tech Stack:** Astro, TypeScript, Tailwind CSS, pdf-lib, pdfjs-dist, Puppeteer-core.

**Spec:** [`docs/phase4-spec.md`](file:///c:/Users/A/Desktop/pdf%20tool%20web%20dev/docs/phase4-spec.md)

## Global Constraints

- Preserve Phase 1, Phase 2, and Phase 3A functionality with zero regressions.
- Do NOT mutate the pristine PDF ArrayBuffer for UI actions.
- Every page operation must have a stable unique ID and survive undo/redo.
- All exported PDFs must validate cleanly in both `pdf-lib` and `pdfjs-dist`.
- True cryptographic redaction remains out of scope and labeled "Coming soon".
- Follow UI/UX Pro Max guidelines for accessibility (WCAG 2.2 AA single-pointer drag alternative, focus indicators, minimum 44px touch targets on mobile).

## Review Focus

1. **Page Rotation Bounding Boxes:** When rotated 90° or 270°, bounding boxes for text replacements and shapes must remain aligned with rendered glyphs on canvas.
2. **Page Duplication Object Isolation:** Duplicating a page must deep-clone objects with new IDs so editing one does not alter the other.
3. **Single-Page Deletion Guard:** Preventing deletion of the only remaining page in a 1-page document without user confirmation to prevent 0-page PDFs.
4. **Exported Page Ordering & Rotation:** Validating that `outDoc.copyPages` faithfully exports the exact page count, order, and rotation angles.
5. **Mobile Viewport Usability:** Ensuring no horizontal scrolling or clipped controls on 320px–430px screens.

---

## Tasks

### Task 1: Extend Page Model & State Manager (`editorState.ts`)
**Files:**
- Modify: [`src/utils/editorState.ts`](file:///c:/Users/A/Desktop/pdf%20tool%20web%20dev/src/utils/editorState.ts)

- [ ] Add `PageState` interface with `id`, `sourcePageIndex`, `originalPageNumber`, `rotation`, `width`, `height`.
- [ ] Extend `EditorDocumentInfo` to use `pages: PageState[]`.
- [ ] Add `pageId?: string` to `BaseEditorObject` while keeping `pageNumber: number` in sync.
- [ ] Update `EditorHistoryEntry` to store `{ action, objects, pages, currentPage }`.
- [ ] Implement page mutation methods on `EditorStateManager`:
  - `rotateCurrentPage(degreesDelta?: number)`
  - `deletePage(pageNumber: number)`
  - `duplicatePage(pageNumber: number)`
  - `reorderPages(fromIndex: number, toIndex: number)`
- [ ] Update `undo()` and `redo()` to restore `{ objects, pages, currentPage }`.
- [ ] Run `npm run check` to verify types.

### Task 2: Enhance Coordinate Mapper for Rotation Invariance (`coordinateMapper.ts`)
**Files:**
- Modify: [`src/utils/coordinateMapper.ts`](file:///c:/Users/A/Desktop/pdf%20tool%20web%20dev/src/utils/coordinateMapper.ts)

- [ ] Update `pdfRectToScreenRect` to project all 4 corners via `viewport.convertToViewportPoint` and take `(minX, maxX, minY, maxY)`.
- [ ] Update `screenRectToPdfRect` to project all 4 corners via `viewport.convertToPdfPoint` and take `(minX, maxX, minY, maxY)`.
- [ ] Verify round-trip conversion at 0°, 90°, 180°, and 270° via Node.js script.

### Task 3: Upgrade PDF Export Engine for Page Operations & New Annotations (`pdfExportEngine.ts`)
**Files:**
- Modify: [`src/utils/pdfExportEngine.ts`](file:///c:/Users/A/Desktop/pdf%20tool%20web%20dev/src/utils/pdfExportEngine.ts)

- [ ] Update `exportPdfDocument` to accept `pages: PageState[]` from the editor state.
- [ ] Use `outDoc = await PDFDocument.create()` and `outDoc.copyPages(srcDoc, pages.map(p => p.sourcePageIndex))`.
- [ ] Apply `page.setRotation(degrees(pageState.rotation))` to each copied page.
- [ ] Add support for `underline` annotations (drawn at baseline).
- [ ] Add support for `strikethrough` annotations (drawn at center line).
- [ ] Add support for `comment` annotations (drawn as crisp note badge/marker).
- [ ] Update preflight capability check and progress reporting.
- [ ] Verify export with simulated unit test.

### Task 4: Implement Underline, Strikethrough, and Comment in Interaction Controller
**Files:**
- Modify: [`src/utils/editorInteractionController.ts`](file:///c:/Users/A/Desktop/pdf%20tool%20web%20dev/src/utils/editorInteractionController.ts)
- Modify: [`src/components/editor/EditorViewport.astro`](file:///c:/Users/A/Desktop/pdf%20tool%20web%20dev/src/components/editor/EditorViewport.astro)
- Modify: [`src/components/editor/EditorToolbar.astro`](file:///c:/Users/A/Desktop/pdf%20tool%20web%20dev/src/components/editor/EditorToolbar.astro)

- [ ] In `EditorViewport.astro`, add `Underline` and `Strikethrough` buttons to `#existing-text-action-bar`.
- [ ] In `EditorToolbar.astro`, enable `underline`, `strikethrough`, and `comment` tool buttons.
- [ ] In `EditorInteractionController.ts`:
  - Wire action bar Underline and Strikethrough clicks on selected existing text to create `underline` and `strikethrough` objects.
  - Implement Comment creation lifecycle: click page in `comment` mode -> prompt / small inline text box -> commit comment marker object.
  - Support selecting and moving comment objects.
  - Refine Select tool behavior and tooltips.

### Task 5: Upgrade Thumbnails with Drag & Drop, Context Menu, and Mobile Buttons
**Files:**
- Modify: [`src/components/editor/EditorThumbnails.astro`](file:///c:/Users/A/Desktop/pdf%20tool%20web%20dev/src/components/editor/EditorThumbnails.astro)
- Modify: [`src/components/editor/EditorMobileSheets.astro`](file:///c:/Users/A/Desktop/pdf%20tool%20web%20dev/src/components/editor/EditorMobileSheets.astro)
- Modify: [`src/pages/pdf-editor.astro`](file:///c:/Users/A/Desktop/pdf%20tool%20web%20dev/src/pages/pdf-editor.astro)

- [ ] In `EditorThumbnails.astro`, add context menu actions: Rotate 90°, Duplicate, Move Up, Move Down, Delete Page.
- [ ] In `pdf-editor.astro`, implement `renderThumbnails` with:
  - Active page styling and page rotation badge (`90°`, `180°`, `270°`).
  - Desktop HTML5 Drag & Drop handlers (`dragstart`, `dragover`, `drop`, `dragend`).
  - Context menu button handler positioning floating menu at thumbnail position.
  - Context menu action handlers calling `editorStore` methods.
  - Move Up / Move Down buttons for mobile drawer list.
- [ ] Connect toolbar page operations (e.g. Rotate button in toolbar or More menu).

### Task 6: Wire Rendering & Inspector for Rotated Pages and Annotations
**Files:**
- Modify: [`src/pages/pdf-editor.astro`](file:///c:/Users/A/Desktop/pdf%20tool%20web%20dev/src/pages/pdf-editor.astro)
- Modify: [`src/components/editor/EditorInspector.astro`](file:///c:/Users/A/Desktop/pdf%20tool%20web%20dev/src/components/editor/EditorInspector.astro)

- [ ] In `triggerPageRender`, pass `rotation: pageState.rotation` to `pdfRenderer.renderPage`.
- [ ] Update `renderOverlayObjects` to render:
  - `underline` objects (styled line/bar at bottom).
  - `strikethrough` objects (styled line/bar through center).
  - `comment` objects (styled amber pin/badge with hover tooltip and click-to-select).
- [ ] In `EditorInspector.astro`, add Comment pane showing author and comment text (editable).
- [ ] Wire Inspector bindings for comment objects and page properties (rotation display).

### Task 7: Mobile UX & Large PDF Verification
**Files:**
- Test across mobile viewports (320px, 360px, 390px, 430px).
- Verify lazy rendering on large PDF (876 pages).
- Verify zero horizontal scrollbars on mobile.

### Task 8: End-to-End Real Export Acceptance Test
**Files:**
- Create: [`scripts/phase4-real-export-acceptance-test.js`](file:///c:/Users/A/Desktop/pdf%20tool%20web%20dev/scripts/phase4-real-export-acceptance-test.js)

- [ ] Write Puppeteer test performing:
  1. Open `/pdf-editor` and load sample agreement.
  2. Rotate page 1 by 90°.
  3. Duplicate page 1 (now 4 pages).
  4. Move page 4 up / reorder.
  5. Delete page 3 (now 3 pages).
  6. Select existing text and edit replacement: `"PHASE 4 ACCEPTED"`.
  7. Add underline to an existing text item.
  8. Add strikethrough to an existing text item.
  9. Add a sticky comment note.
  10. Test undo and redo.
  11. Click Export, intercept browser download.
  12. Reopen downloaded PDF, validate with `pdf-lib` and `pdfjs-dist`.
  13. Verify page count, rotation, replacement, annotations, and original content intact.
- [ ] Run test and confirm 100% PASS with 0 console errors.
