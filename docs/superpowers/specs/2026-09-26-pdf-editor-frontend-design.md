# PDF Editor — Phase 1: Frontend Workspace Specification

## 1. Executive Summary & Goals
Extend the existing `InvincibleXray/pdf-page-extractor` product with a new, dedicated, browser-local **PDF Editor** workspace at `/pdf-editor/`.

### Core Tenets
1. **Preserve Product Identity**: The editor must feel like the exact same product family as the PDF Extractor—utilizing the same color palette, typography (Inter), rounded surfaces (`rounded-3xl` cards, `rounded-xl` controls), subtle borders/shadows, and dark/light mode system.
2. **100% Client-Side / Zero Data Footprint**: All processing occurs strictly on the user's device in-browser. No servers, no uploads, no cloud dependencies.
3. **Clean Astro Architecture**: Zero framework bloat (no React, Next.js, Vue, or Svelte). Pure modular TypeScript, Tailwind CSS, and Astro components.
4. **Non-Breaking Extension**: The existing PDF Extractor on `/` remains 100% operational with zero regressions.
5. **Phase 1 Scope**: Complete frontend workspace, UI component architecture, state management system, responsive mobile layout, and layered canvas abstraction (EditorViewport → Rendering Layer → Overlay Layer). PDF byte mutation engine is scoped for future phases.

---

## 2. Information Architecture & Routing
- **Route**: `/pdf-editor/` (via `src/pages/pdf-editor.astro`)
- **Homepage Integration**: Update `src/components/Header.astro` with subtle navigation tabs or quick switcher allowing instant switching between "PDF Extractor" and "PDF Editor".

---

## 3. UI States & User Experience

### State 1: PDF Editor Landing / Upload
Displayed when no PDF is loaded.
- **Hero & Privacy Badge**:
  - Emerald pulse badge: "Private PDF Editing — No Upload Required"
  - Heading: "Edit PDF <span class='text-brand-600 dark:text-brand-500'>Directly in Browser</span>"
  - Subtitle: "Add text, annotations, highlights, shapes, and redact confidential data directly on your device."
- **Dropzone Card**:
  - Reuses the styled `custom-dashed-border` with hover/drag states.
  - Prominent upload icon, "Drop your PDF file here", "Supports .pdf documents • Click to browse".
  - Quick action to test with a pre-configured sample PDF for rapid exploration.
- **Value Proposition Trio**:
  - Client-Side Privacy, Non-Destructive Annotation, Fast & Device-Local.

### State 2: Editor Workspace
Active once a file is loaded.
1. **Editor Header**:
   - Left: Back link to home ("← Extractor") + "PDF Editor" badge + document title.
   - Center: Document filename, status indicator ("Local • In Memory").
   - Right: "Export PDF" button (primary brand button with download icon), "New Document" action, and shared theme switcher.
2. **Compact Grouped Toolbar**:
   - Tool groups organized by role with clear separators:
     - **Select**: Cursor (`select`)
     - **Content**: Text (`text`), Image (`image`)
     - **Annotations**: Highlight (`highlight`), Underline (`underline`), Strikethrough (`strikethrough`), Comment (`comment`)
     - **Drawing**: Pen (`pen`), Line (`line`), Arrow (`arrow`), Rectangle (`rectangle`), Ellipse (`ellipse`)
     - **Privacy**: Whiteout (`whiteout`), Redact (`redact`)
     - **Signing**: Signature (`signature`)
     - **More**: Link, Watermark, Page Number, Crop
   - Accessible tooltips, active visual indicator, and keyboard shortcuts.
3. **Left Sidebar — Page Thumbnails**:
   - Header with page count + "+ Add Page" action.
   - Vertical thumbnail strip with active page highlighting.
   - Contextual page menu: Rotate, Duplicate, Delete, Extract.
4. **Center Viewport — Layered Canvas Workspace**:
   - Three distinct architectural layers:
     - **Viewport Layer**: Pan, zoom, smooth scroll, responsive centering.
     - **PDF Rendering Layer**: Clean document page presentation with accurate page dimensions and shadow.
     - **Editor Overlay Layer**: Interactive object canvas supporting selection boxes, drag handles, text/shape annotations, and transform bounds.
5. **Right Sidebar — Contextual Inspector**:
   - **Document Mode** (no selection): Page count, dimensions (e.g. 595 × 842 pt / A4), zoom level, orientation.
   - **Text Mode**: Font family, font size, bold/italic/underline, alignment, color presets, opacity.
   - **Image Mode**: Width, height, aspect lock, rotation, opacity, z-order.
   - **Shape Mode**: Fill color, stroke color, stroke width, opacity, corner radius.
6. **Bottom Controls**:
   - Floating pill with zoom controls (`-`, zoom %, `+`, fit-to-page, fit-to-width), page navigation (`Prev`, `Page X of Y`, `Next`), and fullscreen toggle.
7. **Mobile Experience (< 768px)**:
   - Workspace stays central and responsive without horizontal window overflow.
   - Page thumbnails accessible via a sliding drawer.
   - Inspector accessible via an animated bottom sheet.
   - Toolbar is horizontally scrollable with comfortable touch targets (>= 44px).

---

## 4. State Management Architecture (`src/utils/editorState.ts`)
A dedicated, strongly typed, event-driven module:
- `EditorDocumentState`: Tracks current file, filename, total pages, current page index, page dimensions.
- `EditorViewportState`: Tracks zoom factor (0.25 to 3.0), fit mode, fullscreen state.
- `EditorToolState`: Current active tool, tool options (stroke, fill, font size).
- `EditorSelectionState`: Currently selected object ID, hover object.
- `EditorObjectStore`: Collection of canvas objects (text, shapes, drawings, highlights).
- `HistoryState`: Undo/Redo tracking.
- Event emission for decoupled UI updates across Astro components without heavy framework overhead.

---

## 5. Visual QA & Verification Strategy
- Browser automation via `puppeteer-core` checking:
  1. Desktop (1440×900) in Light & Dark modes (Upload state & Workspace state).
  2. Tablet (1024×768) and Mobile (390×844, 375×667, 320×568) viewports.
  3. Interactive checks: Tool selection, page thumbnail switching, inspector panel context switching, mobile sheet opening.
  4. Regression verification: Existing PDF Extractor on `/` remains fully functional (file upload, page range, individual pages, and extraction download).
