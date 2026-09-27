# Phase 7 Repository & Capability Inventory

**Repository:** `c:\Users\A\Desktop\pdf tool web dev`  
**Project:** `InvincibleXray/pdf-page-extractor`  
**Audit Phase:** Phase 7 Final Product & Release-Gate Audit  
**Date:** 2026-09-27  

---

## 1. System & Architecture Overview

| Parameter | Specification |
| :--- | :--- |
| **Framework** | Astro `^4.16.18` (Static Site Generator) |
| **Rendering Model** | 100% Static HTML/CSS/JS (`output: "static"`), Pre-rendered to `/dist` |
| **Styling Engine** | Tailwind CSS `^3.4.17` (`@astrojs/tailwind` `^5.1.4`) |
| **Language / Typecheck** | TypeScript `^5.7.3` (`astro/tsconfigs/strict`) |
| **Core PDF Manipulation** | `pdf-lib` `^1.17.1` (Client-side WASM/JS PDF assembly & export) |
| **Core PDF Rendering** | `pdfjs-dist` `^4.10.38` (Canvas rendering, TextLayer, AcroForm discovery) |
| **Web Worker** | Dedicated client worker (`pdf.worker.min.*.mjs`) bundled via Vite |
| **Browser Automation** | Puppeteer-Core `^25.6.0` (Testing against local Chrome/Chromium) |
| **Hosting Model** | Static Host / GitHub Pages / Cloudflare Pages (`CNAME: pdfpage.tools`) |
| **Privacy Architecture** | 100% Client-Side. Zero document data transmitted to external servers. |

---

## 2. Complete Route Inventory

| Route Path | Source File | Build Output | Purpose / Capabilities |
| :--- | :--- | :--- | :--- |
| `/` | `src/pages/index.astro` | `dist/index.html` | **Main PDF Page Extractor & Splitter.** Allows drag-and-drop of single and multi-page PDFs, visual page selection, range specifications (e.g., `1-3, 5`), rotation, reset, and single-click client-side download of extracted pages. Contains Hero, Feature Grid, and FAQ. |
| `/pdf-editor/` | `src/pages/pdf-editor.astro` | `dist/pdf-editor/index.html` | **Full PDF Editor & AcroForm Studio.** Complete interactive editor supporting text replacement, drawing, shapes, annotations, secure redaction, page management (rotate, duplicate, delete, reorder), AcroForm discovery/filling, and drag-to-create form authoring with dual-mode export (Mode A Interactive & Mode B Flattened). |

---

## 3. Component Hierarchy

### 3.1 Website Shell & Extractor Components
- `src/layouts/Layout.astro`: Common HTML shell with `<head>`, SEO metadata, theme script, and typography imports.
- `src/components/Header.astro`: Shared top navigation bar with brand logo, tool switcher links (Extractor vs Editor), and Dark/Light theme toggle.
- `src/components/PdfExtractorCard.astro`: Core client-side PDF extractor interface, upload dropzone, thumbnail preview grid, range input parser, page selection toolbar, and download trigger.
- `src/components/FeatureList.astro`: Marketing grid highlighting client-side privacy, speed, and zero file size limits.
- `src/components/FaqSection.astro`: Accordion FAQ addressing privacy, supported browsers, file size limits, and security.

### 3.2 PDF Editor Sub-Components
- `src/components/editor/EditorHeader.astro`: Workspace header with document metadata, back button, dark mode toggle, and real export triggers.
- `src/components/editor/EditorToolbar.astro`: Interactive tool selector (Select, Text, Replace, Shapes, Pen, Annotations, Redaction, Forms dropdown, and Author Mode toggle).
- `src/components/editor/EditorViewport.astro`: Main interactive canvas wrapper containing `#pdf-canvas`, `#editor-overlay-layer`, `#pdf-form-layer`, and ghost preview container.
- `src/components/editor/EditorThumbnails.astro`: Sidebar thumbnail filmstrip supporting drag reordering, rotation, page duplication, and deletion.
- `src/components/editor/EditorInspector.astro`: Contextual right-hand sidebar for text styling, shape colors, redaction parameters, and complete form field property controls.
- `src/components/editor/EditorBottomBar.astro`: Zoom slider (25% - 500%), page navigation, fit-to-width/fit-to-page, and rotate shortcut.
- `src/components/editor/EditorMobileSheets.astro`: Mobile slide-over drawers for tools, thumbnails, and field inspector on compact viewports (< 768px).
- `src/components/editor/EditorUploadState.astro`: Editor landing state with drag-and-drop file target and sample document loader.

---

## 4. Source Engine & Utility Architecture (`src/utils/`)

| File | Primary Responsibility |
| :--- | :--- |
| `src/utils/pdfDocumentManager.ts` | Multi-page document proxy wrapper, pristine byte caching, page count, and dimensions calculation. |
| `src/utils/pdfRenderer.ts` | PDF.js canvas rasterization, viewport scaling, DPI normalization, and render cancellation handling. |
| `src/utils/pdfTextLayer.ts` | PDF.js TextLayer parsing, glyph coordinate mapping, text selection, and search indexing. |
| `src/utils/pdfExtractor.ts` | Pure client-side PDF extraction engine using `pdf-lib` to copy page dictionaries without mutation. |
| `src/utils/editorState.ts` | Central editor state manager (undo/redo history stack, annotations, page rotations, ordering, and selection). |
| `src/utils/formState.ts` | Authoritative AcroForm document state manager (Option A architecture, author mode, tab orders, field collision checks, undo/redo). |
| `src/utils/pdfFormOverlay.ts` | DOM-based Layer 2.5 interactive form overlay, two-way bindings, 8 resize handles, and tabIndex sequencing. |
| `src/utils/editorInteractionController.ts` | Unified mouse/touch gesture controller for drawing, dragging, resizing, arrow-key nudging, and drag-to-create. |
| `src/utils/coordinateMapper.ts` | Bidirectional coordinate transformation between viewport screen pixels and PDF points (`[x1, y1, x2, y2]`). |
| `src/utils/redactionRasterizer.ts` | Clean-page raster reconstruction engine (300 DPI, rotation-invariant, 16 MP safety ceiling clamp). |
| `src/utils/redactionValidator.ts` | Forensic validation scanner detecting text, font descriptors, and metadata leaks. |
| `src/utils/pdfSanitizer.ts` | Metadata stripper purging Info dict, XMP metadata streams, and document attachments upon export. |
| `src/utils/pdfExportEngine.ts` | Production-grade multi-mode PDF exporter (Mode A Interactive AcroForm synthesis, Mode B Flattening, and Redaction synthesis). |

---

## 5. Test Infrastructure & Quality Scripts

| Category | Scripts |
| :--- | :--- |
| **Form Authoring & Export** | `scripts/phase6d-form-authoring-qa.js`, `scripts/phase6c-browser-acceptance.js`, `scripts/phase6c-export-verifier.js`, `scripts/phase6b-browser-qa.js` |
| **Redaction & Forensics** | `scripts/phase5b-remediation-tests.js`, `scripts/phase5b-adversarial-audit.js`, `scripts/phase5b-batch-forensics.js`, `scripts/phase5b-focused-tests.js`, `scripts/secure-redaction-acceptance-test.js` |
| **Page Ops & Foundation** | `scripts/phase4-real-export-acceptance-test.js`, `scripts/real-export-acceptance-test.js` |
| **Visual QA & Viewports** | `scripts/visual-qa.js`, `scripts/visual-qa-editor.js` |
| **Coordinate & Performance**| `scripts/phase6a-coordinate-audit.js`, `scripts/phase6a-large-pdf-audit.js`, `scripts/phase6a-library-audit.js`, `scripts/phase6a-security-audit.js`, `scripts/verify-privacy-network.js` |

---

## 6. Public Assets & SEO Infrastructure

- `public/favicon.svg`: Vector brand icon.
- `public/CNAME`: Custom domain pointer (`pdfpage.tools`).
- `public/.nojekyll`: GitHub Pages bypass for underscore assets.
- `public/google7abc9f79c329957f.html`: Google Search Console verification token.
- **Observed Gaps for SEO:**
  - `public/robots.txt` is missing.
  - `public/sitemap.xml` is missing.
  - Social OpenGraph image (`og:image`) is missing.
  - JSON-LD structured data is present on `/` (`WebApplication`), but absent on `/pdf-editor/`.

---

## 7. Supply Chain & Dependencies

- **Direct Runtime Dependencies:**
  - `@astrojs/check` `0.9.4`
  - `@astrojs/tailwind` `5.1.4`
  - `astro` `4.16.18`
  - `pdf-lib` `1.17.1`
  - `pdfjs-dist` `4.10.38`
  - `tailwindcss` `3.4.17`
  - `typescript` `5.7.3`
- **Development Dependencies:**
  - `puppeteer-core` `25.6.0`
- **Vulnerability Audit Status:**
  - 7 advisories detected in transitive dependencies (`astro <= 7.2.7`, `sharp`, `vite`, `esbuild`, `fast-uri`, `js-yaml`, `devalue`).
  - All critical/high advisories affect server-side endpoints (SSR server islands, middleware, development server proxy) which are not bundled or executed in this pure static client-side build (`output: 'static'`).
