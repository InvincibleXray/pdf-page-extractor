# PDF Editor — Phase 1: Frontend Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete, responsive, client-side PDF Editor frontend workspace at `/pdf-editor/` for `InvincibleXray/pdf-page-extractor`, preserving the existing visual system and zero-server architecture without regressions.

**Architecture:** Astro component architecture coupled with a dedicated client-side TypeScript state management module (`src/utils/editorState.ts`). Pure DOM/SVG rendering layer without React or other heavy frameworks, maintaining lightning-fast performance and clean separation of concerns.

**Tech Stack:** Astro 4.16, TypeScript 5.7, Tailwind CSS 3.4, pdf-lib 1.17, Puppeteer-Core (Visual QA).

**Spec:** `docs/superpowers/specs/2026-09-26-pdf-editor-frontend-design.md`

## Global Constraints
- Primary design source of truth: Existing PDF Page Extractor UI (rounded 3xl cards, Inter typography, slate/dark-blue tokens, brand-500/600 accents).
- Do NOT introduce React, Vue, Svelte, or external UI component libraries.
- Zero server communication: 100% client-side execution.
- Existing route `/` must remain completely intact and functional.

---

## Tasks

### Task 1: Navigation & Header Tool Switcher
**Files:**
- Modify: `src/components/Header.astro`

- [ ] Add tool navigation tabs ("Extractor" and "Editor") to `Header.astro` with active indicator based on current path.
- [ ] Ensure brand logo links to `/` and theme switcher remains shared and synchronized across both tools.
- [ ] Test that `/` displays the extractor with the "Extractor" tab active.

---

### Task 2: State Model & Event Architecture
**Files:**
- Create: `src/utils/editorState.ts`

- [ ] Define TypeScript types: `EditorTool`, `EditorObject`, `TextObject`, `ImageObject`, `ShapeObject`, `HighlightObject`, `EditorDocument`, `EditorViewportState`.
- [ ] Implement reactive `EditorStateManager` with typed event emitter (`on`, `emit`).
- [ ] Provide initial mock document loader and sample annotations for initial preview testing.
- [ ] Add unit verification for state transitions (tool changes, object selection, zoom clamping).

---

### Task 3: Editor Landing / Upload Component
**Files:**
- Create: `src/components/editor/EditorUploadState.astro`

- [ ] Build landing state with privacy pill, bold heading, and descriptive subtitle matching existing design language.
- [ ] Implement dropzone with `custom-dashed-border`, file drag-and-drop listeners, and file picker.
- [ ] Add "Try Sample Document" action to immediately demonstrate editor capabilities without needing an uploaded file.
- [ ] Add format support badge and 100% client-side privacy indicators.

---

### Task 4: Editor Header & Top Toolbar
**Files:**
- Create: `src/components/editor/EditorHeader.astro`
- Create: `src/components/editor/EditorToolbar.astro`

- [ ] Build `EditorHeader.astro`:
  - Back navigation button ("← Extractor").
  - Document title and status badge ("In-Memory • Local").
  - "Export PDF" action button and document actions dropdown.
  - Theme toggle pill switch (consistent with existing header).
- [ ] Build `EditorToolbar.astro`:
  - Tool groups: Select, Content (Text, Image), Annotation (Highlight, Underline, Strikethrough, Comment), Drawing (Pen, Line, Arrow, Rect, Ellipse), Privacy (Whiteout, Redact), Signature, More dropdown.
  - Keyboard shortcut tooltips and active state highlights.
  - Connect tool selection clicks to `EditorStateManager`.

---

### Task 5: Left Thumbnail Sidebar & Contextual Page Management
**Files:**
- Create: `src/components/editor/EditorThumbnails.astro`

- [ ] Build thumbnail drawer/sidebar container with page counter.
- [ ] Render page preview cards with page numbers, active state borders, and hover page action menus (Rotate, Duplicate, Delete, Extract).
- [ ] Implement "+ Add Page" button.
- [ ] Wire thumbnail clicks to page selection state.

---

### Task 6: Central Viewport & Layered Canvas Architecture
**Files:**
- Create: `src/components/editor/EditorViewport.astro`

- [ ] Build the three-tier layer architecture:
  - Container / Viewport: Scrollable area, zoom transform scaling, center alignment.
  - PDF Rendering Layer: Document page representation with shadow and border.
  - Editor Overlay Layer: SVG/DOM interaction surface with interactive objects (sample text, highlight box, shape, and selection bounding box with resize handles).
- [ ] Implement object click-to-select and drag/transform interaction placeholders.
- [ ] Wire zoom level transformations to viewport style scale.

---

### Task 7: Right Inspector Sidebar & Floating Bottom Controls
**Files:**
- Create: `src/components/editor/EditorInspector.astro`
- Create: `src/components/editor/EditorBottomBar.astro`

- [ ] Build `EditorInspector.astro`:
  - Document Properties pane (when no object selected: pages, dimensions, zoom, size).
  - Text Properties pane (font family, font size, bold/italic/underline, text alignment, color swatch picker, opacity).
  - Shape Properties pane (fill color, border color, border width, opacity).
  - Image Properties pane (dimensions, aspect ratio, opacity).
- [ ] Build `EditorBottomBar.astro`:
  - Compact floating pill centered at bottom.
  - Zoom out (-), percentage display, zoom in (+), Fit to Page, Fit to Width.
  - Page navigation: Previous, "Page X of Y", Next.
  - Fullscreen toggle.

---

### Task 8: Mobile Drawers & Sheets
**Files:**
- Create: `src/components/editor/EditorMobileSheets.astro`

- [ ] Implement slide-out thumbnail drawer for screens < 768px.
- [ ] Implement slide-up bottom sheet for the inspector for screens < 768px.
- [ ] Add mobile toolbar horizontal scroll container with minimum 44px touch targets.
- [ ] Ensure zero horizontal overflow across 320px, 375px, 390px, and 768px.

---

### Task 9: Assemble `/pdf-editor/` Page & Integrate Transition
**Files:**
- Create: `src/pages/pdf-editor.astro`

- [ ] Combine all editor components inside `Layout.astro`.
- [ ] Implement seamless transition from State 1 (Upload) to State 2 (Workspace) upon file selection or "Try Sample Document" click.
- [ ] Handle PDF loading via pdf-lib to read real page count and dimensions if a real file is provided.
- [ ] Wire full client-side lifecycle and clean reset functionality.

---

### Task 10: Automated Browser Visual QA & Regression Verification
**Files:**
- Create: `scripts/visual-qa-editor.js`

- [ ] Test `/pdf-editor/` in Chrome via Puppeteer across:
  - 1440×900 Desktop (Light and Dark)
  - 1024×768 Tablet
  - 390×844 and 375×667 Mobile
  - Both Upload State and Active Workspace State
  - Tool switching, thumbnail selection, inspector switching, mobile sheet opening.
- [ ] Run existing `scripts/visual-qa.js` to verify zero regression on `/` (page range, individual pages, and PDF extraction).
- [ ] Run `npm run check` and `npm run build` to guarantee zero errors.
