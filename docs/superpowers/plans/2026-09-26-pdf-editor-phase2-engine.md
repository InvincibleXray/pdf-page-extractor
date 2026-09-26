# PDF Editor — Phase 2: Engine & Client-Side Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement real client-side PDF rendering (via `pdfjs-dist`), authoritative `PageViewport` coordinate mapping, interactive annotation editing, and valid byte-level PDF export (via `pdf-lib`) into the existing Astro application without server dependencies or extractor regressions.

**Architecture:** A decoupled 4-tier client architecture:
1. `pdfDocumentManager.ts` & `pdfRenderer.ts`: PDF.js document lifecycle, DPR-clamped canvas rendering with in-flight cancellation.
2. `coordinateMapper.ts`: Authoritative coordinate transformations powered by PDF.js `PageViewport`.
3. `editorInteractionController.ts` & `editorState.ts`: Normalized point-based vector annotations on `#editor-overlay-layer` with gestural history.
4. `pdfExportEngine.ts`: Pristine buffer mutation using `pdf-lib` native primitives with automated validation and download.

**Tech Stack:** Astro 4.16, TypeScript 5.7, Tailwind CSS 3.4, `pdfjs-dist` 4.10.38, `pdf-lib` 1.17.9, Puppeteer Core 25.6.

**Spec:** `docs/superpowers/specs/2026-09-26-pdf-editor-phase2-engine-design.md`

## Global Constraints

- 100% in-browser client-side execution; zero network requests or backend services.
- Never use simple `x * zoom` approximations; use PDF.js `PageViewport` transformations.
- Clone original PDF `ArrayBuffer` exactly once on load for export; never mutate or pass export buffer to PDF.js.
- DPR clamped to `Math.min(window.devicePixelRatio || 1, 2)` to prevent OOM on large documents (e.g. 876 pages).
- Text editing: `Enter` = newline, `Ctrl/Cmd+Enter` = commit, `Escape` = cancel, `blur` = commit if non-empty.
- Whiteout is explicitly visual covering, never secure redaction.
- Export pre-flight check must warn user if any unsupported objects exist before exporting.
- Zero regressions on existing extractor tool at `/`.

## Review Focus

1. **Large document memory exhaustion**: Loading an 800+ page PDF must not freeze the UI or crash GPU memory; cancelled in-flight renders must clean up cleanly.
2. **Coordinate drift across zoom & rotation**: Annotations must align to exact PDF features at 25%, 100%, 250%, and rotated views ($90^\circ, 270^\circ$).
3. **Empty text orphan objects**: Clicking the page with the Text tool and immediately blurring or hitting Escape must not leave zero-width ghost annotations.
4. **Corrupt export bytes**: `pdf-lib` output must be re-parseable without errors by both `pdf-lib` and `pdfjs-dist` before triggering download.
5. **Accidental text submission**: Pressing `Enter` in the text tool must insert a newline, not commit the text box.

---

## Task Decomposition

### Milestone P0: PDF Rendering Foundation

#### Task 1: PDF Document Manager & Worker Configuration
**Files:**
- Create: `src/utils/pdfDocumentManager.ts`
- Test: `tests/pdf-document-manager.test.ts` (or node verification script `scripts/verify-doc-manager.js`)

**Interfaces:**
- Produces:
  ```ts
  export interface LoadedPdfDoc {
    docProxy: import('pdfjs-dist').PDFDocumentProxy;
    pageCount: number;
    pristineBytes: ArrayBuffer;
    getPageDimensions(pageNum: number): Promise<{ width: number; height: number; rotation: number }>;
    destroy(): void;
  }
  export function loadPdfDocumentManager(file: File | ArrayBuffer): Promise<LoadedPdfDoc>;
  ```

- [ ] **Step 1: Write verification script for Document Manager**
Create `scripts/verify-doc-manager.js`:
```js
import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist';

async function testManager() {
  const filePath = 'C:/Users/A/Desktop/ece/5th sem ECE organizer.pdf';
  if (!fs.existsSync(filePath)) {
    console.log('Skipping real PDF test: file not found');
    return;
  }
  const buffer = fs.readFileSync(filePath);
  const pristineClone = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pristineClone) });
  const doc = await loadingTask.promise;
  console.log(`Successfully loaded PDF with ${doc.numPages} pages.`);
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1.0 });
  console.log(`Page 1 dimensions: ${viewport.width} x ${viewport.height}`);
  await doc.destroy();
}
testManager();
```

- [ ] **Step 2: Run verification script to check PDF.js import in Node environment**
Run: `node scripts/verify-doc-manager.js`
Expected: Successfully loads PDF with 876 pages and prints Page 1 dimensions.

- [ ] **Step 3: Implement `src/utils/pdfDocumentManager.ts`**
Implement the manager with Vite `?url` worker loader, pristine buffer clone, lazy dimension cache, and memory disposal:
```ts
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}

export interface LoadedPdfDoc {
  docProxy: pdfjsLib.PDFDocumentProxy;
  pageCount: number;
  pristineBytes: ArrayBuffer;
  getPageDimensions(pageNum: number): Promise<{ width: number; height: number; rotation: number }>;
  destroy(): void;
}

export async function loadPdfDocumentManager(source: File | ArrayBuffer): Promise<LoadedPdfDoc> {
  let rawBuffer: ArrayBuffer;
  if (source instanceof File) {
    rawBuffer = await source.arrayBuffer();
  } else {
    rawBuffer = source;
  }

  // Preserve pristine clone strictly for pdf-lib export
  const pristineBytes = rawBuffer.slice(0);
  const workingBytes = new Uint8Array(rawBuffer.slice(0));

  const loadingTask = pdfjsLib.getDocument({
    data: workingBytes,
    useSystemFonts: true,
  });

  const docProxy = await loadingTask.promise;
  const dimensionCache = new Map<number, { width: number; height: number; rotation: number }>();

  return {
    docProxy,
    pageCount: docProxy.numPages,
    pristineBytes,
    async getPageDimensions(pageNum: number) {
      if (dimensionCache.has(pageNum)) {
        return dimensionCache.get(pageNum)!;
      }
      const page = await docProxy.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });
      const dims = {
        width: viewport.width,
        height: viewport.height,
        rotation: viewport.rotation,
      };
      dimensionCache.set(pageNum, dims);
      return dims;
    },
    destroy() {
      docProxy.destroy();
      dimensionCache.clear();
    },
  };
}
```

- [ ] **Step 4: Verify typecheck passes**
Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**
```bash
git add src/utils/pdfDocumentManager.ts scripts/verify-doc-manager.js
git commit -m "feat(p0): add PDF.js document manager with pristine export buffer clone"
```

---

#### Task 2: High-DPI Canvas Renderer with In-Flight Cancellation
**Files:**
- Create: `src/utils/pdfRenderer.ts`
- Modify: `src/components/editor/EditorViewport.astro`

**Interfaces:**
- Produces:
  ```ts
  export interface RenderOptions {
    scale: number;
    rotation?: number;
    onRenderSuccess?: () => void;
    onRenderError?: (error: any) => void;
  }
  export class PdfPageRenderer {
    renderPage(canvas: HTMLCanvasElement, docProxy: import('pdfjs-dist').PDFDocumentProxy, pageNumber: number, options: RenderOptions): Promise<import('pdfjs-dist').PageViewport | null>;
    cancelCurrentRender(): void;
  }
  ```

- [ ] **Step 1: Implement `src/utils/pdfRenderer.ts`**
Create the renderer with DPR clamping to 2.0, canvas resolution configuration, and cancellation of in-flight `RenderTask`:
```ts
import type { PDFDocumentProxy, PageViewport, RenderTask } from 'pdfjs-dist';

export interface RenderOptions {
  scale: number;
  rotation?: number;
  onRenderSuccess?: () => void;
  onRenderError?: (error: any) => void;
}

export class PdfPageRenderer {
  private activeRenderTask: RenderTask | null = null;
  private currentRenderingPage: number | null = null;

  public cancelCurrentRender(): void {
    if (this.activeRenderTask) {
      try {
        this.activeRenderTask.cancel();
      } catch (e) {
        // Suppress cancellation exceptions
      }
      this.activeRenderTask = null;
      this.currentRenderingPage = null;
    }
  }

  public async renderPage(
    canvas: HTMLCanvasElement,
    docProxy: PDFDocumentProxy,
    pageNumber: number,
    options: RenderOptions
  ): Promise<PageViewport | null> {
    // Cancel any ongoing render
    this.cancelCurrentRender();

    try {
      this.currentRenderingPage = pageNumber;
      const page = await docProxy.getPage(pageNumber);

      const rotation = options.rotation !== undefined ? options.rotation : page.rotate;
      const viewport = page.getViewport({ scale: options.scale, rotation });

      const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Could not obtain 2D canvas context');

      // Set internal bitmap resolution scaled by DPR
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);

      // Set CSS dimensions to exact unscaled viewport size
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      ctx.save();
      ctx.scale(dpr, dpr);

      const renderContext = {
        canvasContext: ctx,
        viewport,
        enableWebGL: false,
      };

      const task = page.render(renderContext);
      this.activeRenderTask = task;

      await task.promise;
      ctx.restore();

      this.activeRenderTask = null;
      if (options.onRenderSuccess) options.onRenderSuccess();
      return viewport;
    } catch (err: any) {
      if (err?.name === 'RenderingCancelledException') {
        // Expected when switching quickly
        return null;
      }
      console.error(`Render failed for page ${pageNumber}:`, err);
      if (options.onRenderError) options.onRenderError(err);
      throw err;
    }
  }
}

export const pdfRenderer = new PdfPageRenderer();
```

- [ ] **Step 2: Update `EditorViewport.astro` to host `<canvas id="pdf-canvas">`**
Replace mock content in `src/components/editor/EditorViewport.astro` with real `<canvas id="pdf-canvas">`:
```astro
<!-- LAYER 1: PDF Base Rendering Layer -->
<div id="pdf-render-layer" class="absolute inset-0 overflow-hidden pointer-events-none flex items-center justify-center">
  <canvas id="pdf-canvas" class="block shadow-xs bg-white"></canvas>
</div>
```

- [ ] **Step 3: Run TypeScript validation**
Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**
```bash
git add src/utils/pdfRenderer.ts src/components/editor/EditorViewport.astro
git commit -m "feat(p0): add high-DPI canvas renderer with cancellation and update EditorViewport"
```

---

### Milestone P1: Authoritative Coordinate & Overlay Engine

#### Task 3: Authoritative Coordinate Mapper
**Files:**
- Create: `src/utils/coordinateMapper.ts`
- Test: `tests/coordinate-mapper.test.ts` (or unit script `scripts/verify-coord-mapper.js`)

**Interfaces:**
- Produces:
  ```ts
  import type { PageViewport } from 'pdfjs-dist';

  export interface ScreenPoint { x: number; y: number; }
  export interface PdfPoint { x: number; y: number; }
  export interface PdfRect { x: number; y: number; width: number; height: number; }
  export interface ScreenRect { left: number; top: number; width: number; height: number; }

  export function screenToPdfPoint(clientX: number, clientY: number, canvasEl: HTMLElement, viewport: PageViewport): PdfPoint;
  export function pdfPointToScreen(pdfX: number, pdfY: number, viewport: PageViewport): ScreenPoint;
  export function pdfRectToScreenRect(rect: PdfRect, viewport: PageViewport): ScreenRect;
  export function screenRectToPdfRect(screenRect: ScreenRect, viewport: PageViewport): PdfRect;
  export function pdfToPdfLibCoords(x: number, y: number, width: number, height: number, pageHeight: number): { x: number; y: number; width: number; height: number };
  ```

- [ ] **Step 1: Implement `src/utils/coordinateMapper.ts`**
```ts
import type { PageViewport } from 'pdfjs-dist';

export interface ScreenPoint { x: number; y: number; }
export interface PdfPoint { x: number; y: number; }
export interface PdfRect { x: number; y: number; width: number; height: number; }
export interface ScreenRect { left: number; top: number; width: number; height: number; }

export function screenToPdfPoint(
  clientX: number,
  clientY: number,
  canvasEl: HTMLElement,
  viewport: PageViewport
): PdfPoint {
  const rect = canvasEl.getBoundingClientRect();
  const cssX = clientX - rect.left;
  const cssY = clientY - rect.top;

  // Use PDF.js PageViewport authoritative transform
  const [pdfX, pdfY] = viewport.convertToPdfPoint(cssX, cssY);
  
  // Convert from bottom-left PDF coordinate to top-left coordinate for state consistency
  // viewport.viewBox = [xMin, yMin, xMax, yMax]
  const pageHeight = viewport.viewBox[3] - viewport.viewBox[1];
  const topLeftY = pageHeight - pdfY;

  return {
    x: Math.round(pdfX * 100) / 100,
    y: Math.round(topLeftY * 100) / 100,
  };
}

export function pdfPointToScreen(
  pdfX: number,
  pdfY: number,
  viewport: PageViewport
): ScreenPoint {
  const pageHeight = viewport.viewBox[3] - viewport.viewBox[1];
  const standardPdfY = pageHeight - pdfY;
  const [cssX, cssY] = viewport.convertToViewportPoint(pdfX, standardPdfY);
  return { x: cssX, y: cssY };
}

export function pdfRectToScreenRect(
  rect: PdfRect,
  viewport: PageViewport
): ScreenRect {
  const pt = pdfPointToScreen(rect.x, rect.y, viewport);
  const scale = viewport.scale;
  return {
    left: pt.x,
    top: pt.y,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}

export function screenRectToPdfRect(
  screenRect: ScreenRect,
  viewport: PageViewport
): PdfRect {
  const scale = viewport.scale;
  const pageHeight = viewport.viewBox[3] - viewport.viewBox[1];
  const [pdfX, standardPdfY] = viewport.convertToPdfPoint(screenRect.left, screenRect.top);
  const topLeftY = pageHeight - standardPdfY;

  return {
    x: Math.round(pdfX * 100) / 100,
    y: Math.round(topLeftY * 100) / 100,
    width: Math.round((screenRect.width / scale) * 100) / 100,
    height: Math.round((screenRect.height / scale) * 100) / 100,
  };
}

export function pdfToPdfLibCoords(
  x: number,
  y: number,
  width: number,
  height: number,
  pageHeight: number
): { x: number; y: number; width: number; height: number } {
  return {
    x,
    y: pageHeight - y - height,
    width,
    height,
  };
}
```

- [ ] **Step 2: Run verification script for Coordinate Mapper**
Create `scripts/verify-coord-mapper.js`:
```js
import { pdfToPdfLibCoords } from '../src/utils/coordinateMapper.js';
// Simple math sanity check
const mapped = pdfToPdfLibCoords(50, 100, 200, 40, 842);
if (mapped.x === 50 && mapped.y === (842 - 100 - 40) && mapped.y === 702) {
  console.log('Coordinate mapping verification PASSED');
} else {
  console.error('Coordinate mapping failed', mapped);
  process.exit(1);
}
```
Run: `node scripts/verify-coord-mapper.js`
Expected: `Coordinate mapping verification PASSED`

- [ ] **Step 3: Run TypeScript validation**
Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**
```bash
git add src/utils/coordinateMapper.ts scripts/verify-coord-mapper.js
git commit -m "feat(p1): add authoritative PageViewport coordinate mapping layer"
```

---

### Milestone P2: Core Interaction Tools

#### Task 4: Interactive Controller with Gestural Transactions & Text Lifecycle
**Files:**
- Create: `src/utils/editorInteractionController.ts`
- Modify: `src/utils/editorState.ts`
- Modify: `src/pages/pdf-editor.astro`

**Interfaces:**
- Produces:
  ```ts
  export class EditorInteractionController {
    public attach(overlayEl: HTMLElement, canvasEl: HTMLCanvasElement): void;
    public detach(): void;
    public setViewport(viewport: import('pdfjs-dist').PageViewport): void;
  }
  ```

- [ ] **Step 1: Update `editorState.ts` to add pen path & explicit types**
Ensure `PenEditorObject` and `ArrowEditorObject` are supported with normalized schemas and transactions.
- [ ] **Step 2: Implement `src/utils/editorInteractionController.ts`**
Support:
- Click-to-type lifecycle (`Enter` = newline, `Ctrl/Cmd+Enter` = commit, `Escape` = cancel, `blur` = commit if non-empty).
- Shape creation drag (`rectangle`, `ellipse`, `line`, `arrow`, `whiteout`, `highlight`).
- Pen freehand vector path drawing.
- Object selection, drag-to-move (clamped to page bounds), and corner resize handles.
- Single history transaction per gesture (`pointerup`).
- [ ] **Step 3: Wire interaction controller in `pdf-editor.astro`**
Connect real PDF.js render output `viewport` to the interaction controller and overlay renderer.
- [ ] **Step 4: Run TypeScript validation**
Run: `npx tsc --noEmit`
Expected: 0 errors.
- [ ] **Step 5: Commit**
```bash
git add src/utils/editorInteractionController.ts src/utils/editorState.ts src/pages/pdf-editor.astro
git commit -m "feat(p2): add interaction controller for text, shapes, pen, and transform handles"
```

---

### Milestone P3: History & Undo/Redo

#### Task 5: Gestural History Transactions in State Store
**Files:**
- Modify: `src/utils/editorState.ts`

- [ ] **Step 1: Refactor `saveHistory()` to accept transactions**
Ensure moving or resizing emits exactly one transaction on `pointerup`, not on every `pointermove`.
- [ ] **Step 2: Add keyboard shortcut listeners in `pdf-editor.astro`**
Listen for `Ctrl+Z`, `Cmd+Z`, `Ctrl+Y`, `Cmd+Shift+Z`, `Delete`, `Backspace`.
- [ ] **Step 3: Verify TypeScript compilation**
Run: `npx tsc --noEmit`
Expected: 0 errors.
- [ ] **Step 4: Commit**
```bash
git add src/utils/editorState.ts src/pages/pdf-editor.astro
git commit -m "feat(p3): add gestural history transactions and keyboard shortcuts"
```

---

### Milestone P4: Client-Side Export Engine (`pdf-lib`)

#### Task 6: Native `pdf-lib` Export Engine with Capability Check & Progress Toast
**Files:**
- Create: `src/utils/pdfExportEngine.ts`
- Modify: `src/pages/pdf-editor.astro`
- Modify: `src/components/editor/EditorHeader.astro`

**Interfaces:**
- Produces:
  ```ts
  export interface ExportResult {
    success: boolean;
    bytes?: Uint8Array;
    error?: string;
    unsupportedCount?: number;
  }
  export function exportPdfDocument(
    pristineBytes: ArrayBuffer,
    objects: EditorObject[],
    originalFilename: string,
    onProgress?: (msg: string) => void
  ): Promise<ExportResult>;
  ```

- [ ] **Step 1: Implement `src/utils/pdfExportEngine.ts`**
- Check capabilities: `['text', 'rectangle', 'ellipse', 'line', 'arrow', 'pen', 'highlight', 'whiteout', 'image', 'signature']`.
- Load pristine buffer via `PDFDocument.load(cleanClone)`.
- Embed StandardFonts (`Helvetica`, `HelveticaBold`, `TimesRoman`, `Courier`).
- Map PDF points to `pdf-lib` bottom-left origin ($y = \text{height} - y - h$).
- Draw shapes, lines, text, SVG paths, and embedded images.
- Highlight export: draws `page.drawRectangle()` with explicit graphics state `opacity: 0.35` (independent of browser CSS blend mode).
- Whiteout export: draws opaque white rectangle with explicit label/comment.
- Validate resulting bytes by testing re-load in `PDFDocument.load()` and PDF.js.
- Trigger browser download as `<filename>-edited.pdf`.
- [ ] **Step 2: Replace `alert()` in `EditorHeader.astro` & `pdf-editor.astro` with an in-app non-modal toast**
Show live progress ("Generating PDF...", "Validating...", "Export Complete").
- [ ] **Step 3: Run TypeScript validation**
Run: `npx tsc --noEmit`
Expected: 0 errors.
- [ ] **Step 4: Commit**
```bash
git add src/utils/pdfExportEngine.ts src/pages/pdf-editor.astro src/components/editor/EditorHeader.astro
git commit -m "feat(p4): implement client-side pdf-lib export engine with capability check and progress toast"
```

---

### Milestone P5: Export Validation & Signatures/Images

#### Task 7: Signature Pad Modal & Image Insertion
**Files:**
- Modify: `src/components/editor/EditorMobileSheets.astro` (or dedicated signature modal)
- Modify: `src/pages/pdf-editor.astro`

- [ ] **Step 1: Implement Signature Pad canvas modal**
- [ ] **Step 2: Implement Image file picker handler**
- [ ] **Step 3: Run automated verification script on exported PDF sample**
Create `scripts/verify-export.js` that creates annotations on a sample PDF, exports it via `pdf-lib`, and validates that PDF.js can parse all pages and extract dimensions without errors.
Run: `node scripts/verify-export.js`
Expected: `Exported PDF validation PASSED`.
- [ ] **Step 4: Commit**
```bash
git add src/components/editor/EditorMobileSheets.astro src/pages/pdf-editor.astro scripts/verify-export.js
git commit -m "feat(p5): add signature pad modal, image insertion, and export validation script"
```

---

### Milestone P6: Visual & Accessibility QA and Regression Check

#### Task 8: End-to-End Automated Browser QA
**Files:**
- Modify: `scripts/visual-qa-editor.js`
- Test: `scripts/visual-qa.js` (existing extractor regression test)

- [ ] **Step 1: Update `scripts/visual-qa-editor.js`**
Test:
1. File upload with real PDF (`5th sem ECE organizer.pdf`).
2. Verification of rendered canvas dimensions and PDF.js text layer.
3. Adding a text annotation via click-to-type (`Ctrl+Enter` commit).
4. Drawing a rectangle, highlight, and line.
5. Zooming in to 150% and verifying overlay position alignment.
6. Triggering Export and confirming file download.
7. Mobile viewport (390×844) responsiveness.
- [ ] **Step 2: Run `node scripts/visual-qa-editor.js`**
Expected: 15+ screenshots saved, all actions succeed.
- [ ] **Step 3: Run `node scripts/visual-qa.js`**
Expected: Extractor on `/` passes with zero regressions.
- [ ] **Step 4: Run production build check**
Run: `npm run build`
Expected: Build passes with 0 Astro / TypeScript errors.
- [ ] **Step 5: Commit**
```bash
git add scripts/visual-qa-editor.js
git commit -m "test(p6): comprehensive visual QA test for real PDF editor and export"
```
