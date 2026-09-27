# PDF Editor — Phase 4: Page Management & Editor UX Completion Specification

## 1. Executive Summary & Goals

Phase 4 completes the PDF Editor by providing complete client-side page management (rotation, deletion, duplication, and reordering), core annotation tools (underline, strikethrough, sticky comments), comprehensive select behavior, mobile UX enhancements, and large-document safety.

$$\text{CORRECTNESS} > \text{ARCHITECTURAL QUALITY} > \text{PERFORMANCE} > \text{FEATURE COUNT}$$

### Scope Boundaries

* **IN SCOPE**:
  1. **Page Model (`PageState`)**: Stable unique page identities (`id`), mapping to `sourcePageIndex`, unrotated dimensions, and rotation state.
  2. **Page Rotation**: 90° clockwise rotation affecting PDF rendering, PDF.js TextLayer, editor overlay, coordinate mapping, and `pdf-lib` export.
  3. **Page Deletion**: Real page removal with thumbnail synchronization, page count updates, neighbor navigation, safety confirmation for single-page documents, and export reflection.
  4. **Page Duplication**: Clean duplication of source pages and cloning of relevant editor objects with new unique IDs.
  5. **Page Reordering**: Desktop drag-and-drop thumbnail reordering plus accessible Move Up / Move Down buttons for mobile and keyboard users.
  6. **Page-Level Transactional History**: Full undo/redo across page rotation, deletion, duplication, reordering, object modifications, and text replacements.
  7. **Complete Select Tool**: Clear distinction between existing PDF text items and editor overlay objects with unified selection, movement, resize handles, and deletion.
  8. **Underline Tool**: Contextual application to selected existing PDF text and manual overlay annotation; exported faithfully.
  9. **Strikethrough Tool**: Contextual application to selected existing PDF text; exported faithfully.
  10. **Sticky Comment Tool**: Click-to-place comment pins, popup/inspector text entry, selection, editing, deletion, and visible annotation export.
  11. **Mobile UX Completion**: Responsive validation across 320px, 360px, 390px, and 430px viewports without horizontal overflow; accessible sheets and drawers.
  12. **Large-PDF Safety**: Preserving lazy active-page rendering and memory throttling tested against documents up to 876 pages (~211 MB).
  13. **Real Export Acceptance Testing**: Automated end-to-end browser test script verifying page operations, annotations, and exported document fidelity.

* **STRICTLY OUT OF SCOPE (Deferred)**:
  - Cryptographic / secure content-stream redaction (labeled "Redact — Coming soon").
  - Raw PDF content-stream bytecode surgery.
  - Native embedded Adobe Acrobat sticky notes (exported as visible annotation markers).
  - Backend servers, user authentication, or cloud storage.

---

## 2. Architecture & Data Model

### A. Architectural Invariant: Non-Destructive State
The pristine source PDF `ArrayBuffer` is never mutated during interaction. Instead, mutations are tracked across distinct state layers:
1. **Source Bytes**: Dedicated `pristineBytes` clone in `LoadedPdfDoc`.
2. **Document State**: Sequence of `PageState` objects.
3. **Editor Objects**: Array of `EditorObject` items linked by `pageId` and `pageNumber`.
4. **History Stack**: Transactional snapshots of `{ pages, objects, currentPage }`.
5. **Export Materialization**: Synthesized on-demand via `pdf-lib` `copyPages` and graphics operations.

### B. Extended Page Model (`src/utils/editorState.ts`)
```ts
export interface PageState {
  id: string;                 // Stable unique ID (e.g. "page-1-1718293040")
  sourcePageIndex: number;   // 0-based index into pristine source PDF
  originalPageNumber: number;// 1-based original page number
  rotation: number;          // 0 | 90 | 180 | 270 (degrees)
  width: number;             // Unrotated width in points (72 dpi)
  height: number;            // Unrotated height in points (72 dpi)
}

export interface EditorDocumentInfo {
  name: string;
  fileSizeFormatted: string;
  pageCount: number;
  pages: PageState[];
  file: File | null;
}
```

### C. History State Model
```ts
export interface EditorHistoryEntry {
  action: string;
  objects: EditorObject[];
  pages: PageState[];
  currentPage: number;
}
```

### D. Extended Annotation Objects
```ts
export interface AnnotationEditorObject extends BaseEditorObject {
  type: 'highlight' | 'underline' | 'strikethrough' | 'comment';
  color: string;
  strokeWidth?: number;
  commentText?: string;
  author?: string;
  createdAt?: string;
}
```

---

## 3. Coordinate System & Rotation Invariance

PDF points are defined with a top-left origin on unrotated pages. When a page is rotated by 90°, 180°, or 270°:
- PDF.js `PageViewport` applies the rotation transformation matrix.
- `pdfPointToScreen` maps unrotated PDF coordinates `(x, y)` to the rotated CSS viewport via `viewport.convertToViewportPoint`.
- `pdfRectToScreenRect` converts all four rectangle corners through `convertToViewportPoint` and calculates `(minX, maxX, minY, maxY)`.
- `screenRectToPdfRect` converts the four screen corners back via `viewport.convertToPdfPoint` into unrotated PDF point bounding boxes.
- `pdfExportEngine` applies `page.setRotation(degrees(pageState.rotation))` directly on copied pages and positions overlays in standard PDF point coordinates.

---

## 4. UI/UX Interaction Design

Follows the calm, minimalist, beginner-friendly design principles established in Phase 1-3:
- **Thumbnails Sidebar**: Clean cards with active indicators, page badges, rotation badges (e.g. `90°`), and a `···` button opening a floating context menu.
- **Context Menu Actions**:
  - `Rotate 90°`: Clockwise rotation.
  - `Duplicate`: Clones current page with all overlays.
  - `Move Up`: Reorders page earlier.
  - `Move Down`: Reorders page later.
  - `Delete Page`: Deletes page (with confirmation if only 1 page remains).
- **Desktop Drag & Drop**: Native HTML5 draggable thumbnail cards with blue insertion line indicators.
- **Floating Text Action Bar**: When existing PDF text is selected, displays:
  - `[ Edit text ]`
  - `[ Underline ]`
  - `[ Strikethrough ]`
- **Comment Tool**:
  - Click Comment tool in toolbar.
  - Click anywhere on PDF page to drop a stylish amber pin.
  - Inline popover opens to enter comment text; Ctrl/Cmd+Enter commits.
  - Clicking pin selects it; inspector allows updating text and author.

---

## 5. Export Materialization

The export engine (`pdfExportEngine.ts`) materializes the document:
1. Loads `pristineBytes` in `pdf-lib`.
2. Creates a fresh `outDoc = await PDFDocument.create()`.
3. Copies source pages in the sequence specified by `document.pages`:
   `const copiedPages = await outDoc.copyPages(srcDoc, pages.map(p => p.sourcePageIndex))`.
4. Loops over `copiedPages`, applies `newPage.setRotation(degrees(pageState.rotation))`, adds to `outDoc`.
5. Renders all page objects (text replacements, text, shapes, underlines, strikethroughs, highlights, whiteouts, pen, comments, images) on their corresponding new page.
6. Validates the output bytes with `PDFDocument.load()` and `pdfjsLib.getDocument()`.
7. Triggers browser download.

---

## 6. Capability Matrix

| Feature | Status | Description |
| :--- | :---: | :--- |
| **PDF Rendering** | GREEN | PDF.js high-DPI canvas rendering |
| **TextLayer Selection** | GREEN | Native PDF.js text layer selection & copy |
| **Visual Text Replacement** | GREEN | Opaque mask + replacement text overlay |
| **Page Rotation (0/90/180/270)**| GREEN | Rotates canvas, text layer, overlays, & export |
| **Delete Page** | GREEN | Deletes page with safety confirmation for 1 page |
| **Duplicate Page** | GREEN | Duplicates source page and clones overlays |
| **Page Reordering** | GREEN | Desktop drag & drop + accessible Move Up/Down |
| **Page-Level Undo/Redo** | GREEN | Full transactional history of pages & objects |
| **Underline Tool** | GREEN | Contextual & manual underline; exported |
| **Strikethrough Tool** | GREEN | Contextual & manual strikethrough; exported |
| **Sticky Comment Tool** | GREEN | Pin markers, inline popover, inspector, export |
| **Mobile UX** | GREEN | 320-430px responsive sheets & drawers |
| **Large-PDF Safety** | GREEN | Lazy rendering & memory throttled up to 876 pages |
| **True Cryptographic Redaction**| RED | Coming soon (visual whiteout supported) |
| **PDF Content Stream Surgery** | RED | Out of scope for Phase 4 |
