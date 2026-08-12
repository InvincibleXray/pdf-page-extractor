# PDF Page Extractor

A privacy-focused, browser-based PDF utility that allows users to extract page ranges or individual pages from PDF documents entirely on their device without uploading files to a server.

## Live Demo

👉 **[https://invinciblexray.github.io/pdf-page-extractor/](https://invinciblexray.github.io/pdf-page-extractor/)**

- **Tech Stack**: Astro, TypeScript, Tailwind CSS, pdf-lib, GitHub Pages, GitHub Actions
- **Core Differentiator**: 100% Client-side processing — your PDF is loaded directly into browser memory and is never uploaded to a remote server.

---

## Why I Built This

I created this project to solve a recurring personal challenge: studying from an Electronics and Communication Engineering (ECE) "organizer" PDF containing over 800 pages covering multiple semester subjects in a single document. Extracting a specific subject range using existing online tools was inconvenient, as free web tools often imposed daily limits, forced file compression, or required cumbersome upload steps.

A secondary concern was privacy. When extracting pages from personal or confidential documents, uploading files to third-party servers creates an unavoidable trust gap. Even when web services state that uploaded files are deleted after processing, users cannot independently verify or audit remote server storage or data retention policies.

To eliminate both inconvenience and privacy risks, I designed and built **PDF Page Extractor** to handle parsing, page selection, document construction, and file downloading entirely inside the user's browser memory.

---

## What It Does

PDF Page Extractor provides a single-page web application for extracting specific pages from standard PDF documents. The application reads the document structure locally, lets the user define exact page selections, customizes the output filename, and generates a new compiled PDF for direct download—without transmitting document data over the network.

---

## Features

- **Client-Side Execution**: All document processing occurs locally using `pdf-lib` and Web APIs.
- **Dual Extraction Modes**:
  - **Page Range Mode**: Select continuous ranges (`Start page` → `End page`) with built-in step controls.
  - **Individual Pages & Mixed Range Mode**: Select comma-separated pages or range tokens (e.g., `1, 3, 7-10, 15`).
- **Input Parsing & Validation**: Automatically expands range tokens, deduplicates overlapping page selections, sorts entries in ascending order, and validates against total PDF page counts.
- **Custom Output Filename**: Pre-populates a clean output filename (`[Original Name] - Extracted`), auto-appends `.pdf` safely, and sanitizes illegal OS filesystem characters (`\ / : * ? " < > |`).
- **Quality Preservation**: Copies original vector layouts, fonts, annotations, and embedded objects directly without rasterizing pages to images.
- **Dark / Light Theme**: Full theme toggle with system preference detection and FOUT (Flash of Unstyled Theme) prevention.
- **Responsive Layout**: Designed for mobile, tablet, and desktop viewports.

---

## Privacy-First Architecture

The application executes all extraction operations inside the client browser environment:

```
[ User PDF File ]
       │
       ▼
[ Browser Memory (ArrayBuffer) ]
       │
       ▼
[ pdf-lib Engine (copyPages) ]
       │
       ▼
[ Extracted PDF Blob (application/pdf) ]
       │
       ▼
[ Direct Download (URL.createObjectURL) ]
```

### Technical Privacy Model
- **No File Uploads**: The application contains no backend upload endpoints, server storage, or external extraction APIs.
- **No Content Analytics**: Document content, filenames, page numbers, and metadata remain strictly on the client device.
- **In-Memory Lifecycle**: Source PDF bytes exist only in browser DOM memory during active interaction and are released when the user closes or refreshes the page.

---

## Tech Stack

| Layer | Technology | Role |
| :--- | :--- | :--- |
| **Framework** | [Astro](https://astro.build/) | Static site generation with minimal client JS overhead |
| **Language** | [TypeScript](https://www.typescriptlang.org/) | Type-safe state management and validation logic |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) | Responsive UI components and dark mode styling |
| **PDF Processing** | [pdf-lib](https://pdf-lib.js.org/) | Browser-compatible PDF document loading, copying, and generation |
| **Testing** | Puppeteer Core | Headless browser integration testing and visual QA |
| **Deployment** | GitHub Pages & Actions | Automated build, type-check, and continuous deployment |

---

## How It Works

1. **Local File Loading**: When a user selects or drops a `.pdf` file, the browser reads the file into memory as an `ArrayBuffer` via the HTML5 File API.
2. **Document Parsing**: `PDFDocument.load()` parses the cross-reference table and catalog structure to determine the total page count.
3. **Selection Parsing**:
   - In *Range Mode*, an array of indices is generated from the start and end values.
   - In *Individual Mode*, `parseIndividualPages()` splits comma-separated strings, expands range tokens (`7-10` → `7, 8, 9, 10`), deduplicates entries using `Set`, sorts the indices, and validates bounds against `1..totalPages`.
4. **Page Copying**: `PDFDocument.create()` initializes a new document, and `copyPages()` transfers the original PDF page dictionaries into the target document.
5. **Download Trigger**: The target document is saved as a `Uint8Array`, converted to a `Blob`, and triggered for download via `URL.createObjectURL()`.

---

## Project Structure

```text
pdf-page-extractor/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions deployment workflow
├── public/
│   └── favicon.svg             # Application favicon
├── scripts/
│   └── visual-qa.js            # Puppeteer browser QA test script
├── src/
│   ├── components/
│   │   ├── FaqSection.astro    # FAQ section with JSON-LD schema
│   │   ├── FeatureList.astro   # Hero messaging and feature list
│   │   ├── Header.astro        # Header bar & theme switch toggle
│   │   └── PdfExtractorCard.astro # Interactive extraction card component
│   ├── layouts/
│   │   └── Layout.astro        # HTML shell, metadata, & dark theme script
│   ├── pages/
│   │   └── index.astro         # Main application page
│   ├── styles/
│   │   └── global.css          # Custom border utilities and styling overrides
│   └── utils/
│       └── pdfExtractor.ts     # Client PDF extraction logic & parser
├── astro.config.mjs            # Astro build & GitHub Pages base config
├── tailwind.config.mjs         # Tailwind theme configuration
├── tsconfig.json               # TypeScript configuration
└── package.json                # Project dependencies & npm scripts
```

---

## Local Development

### Prerequisites
- Node.js (v18 or higher recommended)
- `npm` package manager

### Running Locally
1. Clone the repository:
   ```bash
   git clone https://github.com/InvincibleXray/pdf-page-extractor.git
   cd pdf-page-extractor
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the local development server:
   ```bash
   npm run dev
   ```
   Open `http://127.0.0.1:4321` in your browser.

---

## Production Build

To run type checks and build the static production bundle:

```bash
# Run TypeScript & Astro component diagnostics
npm run check

# Build static output to dist/
npm run build
```

---

## Deployment

Continuous deployment is configured via **GitHub Actions**:

- **Workflow File**: `.github/workflows/deploy.yml`
- **Trigger**: Pushes to `main` run `npm run check`, build the static site via `npm run build`, and deploy `./dist` to GitHub Pages.

---

## Technical Considerations & Limitations

- **Browser Memory Allocation**: PDF extraction performance depends on local machine memory and CPU. Very large files (e.g. multi-gigabyte documents) may hit browser tab memory limits.
- **Password-Protected / Encrypted PDFs**: Password-protected PDFs must be decrypted prior to uploading, as client-side decryption without a user-supplied password is not supported.
- **Corrupted PDF Structure**: Documents with broken cross-reference tables or incomplete EOF markers will display an inline error state.

---

## Realistic Future Enhancements

- [ ] **Canvas Page Thumbnails**: Render visual page previews for interactive thumbnail selection.
- [ ] **Multi-Document Page Merging**: Support selecting and combining pages from multiple PDF files.
- [ ] **Drag & Drop Page Reordering**: Allow custom page sequence arrangements prior to export.

---

## License

This repository does not currently specify an open-source license. All rights reserved.
