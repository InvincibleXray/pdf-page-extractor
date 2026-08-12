# PDF Page Extractor

A privacy-focused, browser-based PDF utility that allows users to extract page ranges or individual pages from PDF documents entirely on their device without uploading files to a server.

## Live Demo

👉 **[https://invinciblexray.github.io/pdf-page-extractor/](https://invinciblexray.github.io/pdf-page-extractor/)**

---

## Why I Built This

I created this project to solve a recurring personal challenge: studying from an Electronics and Communication Engineering (ECE) "organizer" PDF containing over 800 pages covering multiple semester subjects in a single document. Extracting a specific subject range using existing online tools was cumbersome, and existing free services often imposed daily file limits or intrusive advertisements.

A secondary concern was privacy. When extracting pages from personal or confidential documents, uploading files to remote third-party servers created an unavoidable trust gap. Even when web services claim that uploaded documents are deleted immediately after processing, users cannot independently verify or audit remote server storage or data retention policies.

To eliminate both friction and privacy risks, I designed and built **PDF Page Extractor** to handle parsing, page selection, document construction, and file downloading entirely inside the user's browser memory.

---

## What It Does

PDF Page Extractor provides a clean single-page web interface for extracting specific pages from any standard PDF file. The application reads the document structure locally, lets the user define exact page selections, customizes the output filename, and instantly generates a new compiled PDF for download—all without transmitting a single byte of document data over the network.

---

## Features

- **100% In-Browser Execution**: All document processing occurs locally using `pdf-lib` and Web APIs.
- **Dual Extraction Modes**:
  - **Page Range Mode**: Select continuous ranges (`Start page` → `End page`) with built-in step controls.
  - **Individual Pages & Mixed Range Mode**: Select comma-separated pages or range tokens (e.g., `1, 3, 7-10, 15`).
- **Input Parsing & Validation**: Automatically expands range tokens, deduplicates overlapping page selections, sorts entries in ascending order, and validates against total PDF page counts.
- **Custom Output Filename**: Pre-populates a clean output filename (`[Original Name] - Extracted`), auto-appends `.pdf` safely, and sanitizes illegal OS filesystem characters (`\ / : * ? " < > |`).
- **Lossless Quality Preservation**: Copies original vector layouts, fonts, annotations, and embedded objects without rasterizing pages to images.
- **Dark / Light Theme**: Full theme toggle with system preference detection and FOUT (Flash of Unstyled Theme) prevention.
- **Responsive Layout**: Designed for seamless usability across desktop, tablet, and mobile devices.

---

## Privacy-First Architecture

The application is structured to execute all operations inside the browser's client JavaScript engine:

```
[ User PDF File ]
       │
       ▼
[ Web Browser Memory (ArrayBuffer) ]
       │
       ▼
[ pdf-lib Engine (copyPages) ]
       │
       ▼
[ New PDF Blob (application/pdf) ]
       │
       ▼
[ Direct File Download (URL.createObjectURL) ]
```

### Privacy Guarantees
- **Zero Server Uploads**: The application contains no backend API endpoints, database connections, or file-upload handlers.
- **Zero Analytics / Tracking Data Footprint**: No document content, filenames, page numbers, or metadata leave the user's device.
- **Ephemeral Memory Lifecycle**: Source PDF bytes exist only in browser DOM memory during active interaction and are garbage-collected upon closing or refreshing the tab.

---

## Tech Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Framework** | [Astro v4.16](https://astro.build/) | Static site generation with minimal client JavaScript payload |
| **Language** | [TypeScript v5.7](https://www.typescriptlang.org/) | Strict type checking and robust interface definitions |
| **Styling** | [Tailwind CSS v3.4](https://tailwindcss.com/) | Responsive design system with dark mode class strategies |
| **PDF Processing** | [pdf-lib v1.17](https://pdf-lib.js.org/) | Pure TypeScript/JavaScript client-side PDF document manipulation |
| **Automated Testing**| Puppeteer Core | Headless browser integration testing and visual QA |
| **Hosting & CI/CD** | GitHub Pages & Actions | Automated building, type-checking, and static site deployment |

---

## How It Works

1. **Local File Loading**: When a user selects or drops a `.pdf` file, the browser reads the file into memory as an `ArrayBuffer` via the HTML5 File API.
2. **Document Parsing**: `PDFDocument.load()` parses the cross-reference table and catalog structure to determine the total page count.
3. **Selection Parsing**:
   - In *Range Mode*, an array of indices is generated from the start and end values.
   - In *Individual Mode*, `parseIndividualPages()` splits comma-separated strings, expands range tokens (`7-10` → `7, 8, 9, 10`), filters out duplicates using `Set`, sorts the indices, and validates bounds against `1..totalPages`.
4. **Page Copying**: `PDFDocument.create()` initializes a new document, and `copyPages()` transfers the underlying PDF page dictionaries into the target document.
5. **Download Trigger**: The target document is serialized to a `Uint8Array`, converted to a `Blob`, and saved via a temporary `<a>` element using `URL.createObjectURL()`.

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
│   └── visual-qa.js            # Automated Puppeteer QA script
├── src/
│   ├── components/
│   │   ├── FaqSection.astro    # FAQ accordion with JSON-LD schema
│   │   ├── FeatureList.astro   # Feature badges and hero copy
│   │   ├── Header.astro        # Navigation bar & theme switch
│   │   └── PdfExtractorCard.astro # Core interactive card component
│   ├── layouts/
│   │   └── Layout.astro        # Global layout, SEO tags, & dark theme script
│   ├── pages/
│   │   └── index.astro         # Main landing page route
│   ├── styles/
│   │   └── global.css          # Custom styling utilities and fonts
│   └── utils/
│       └── pdfExtractor.ts     # Client PDF extraction logic & parser
├── astro.config.mjs            # Astro build configuration
├── tailwind.config.mjs         # Tailwind theme extension & color tokens
├── tsconfig.json               # TypeScript configuration
└── package.json                # Project dependencies & npm scripts
```

---

## Local Development

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- `npm` package manager

### Steps
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

To run type checks and build the production static bundle:

```bash
# Type check TypeScript and Astro components
npm run check

# Compile static bundle into dist/
npm run build
```

---

## Deployment

The project is configured for continuous deployment to **GitHub Pages** using **GitHub Actions**.

- **Workflow File**: `.github/workflows/deploy.yml`
- **Trigger**: Every push to the `main` branch automatically runs `npm run check`, compiles static output via `npm run build`, and deploys the `./dist` artifact to GitHub Pages.

---

## Privacy Considerations

- **Client Execution**: Because processing occurs on the client machine, extraction performance is governed by the user's local CPU and available browser RAM.
- **No Third-Party Analytics**: The site operates without analytics scripts or external tracking pixels.
- **Security Boundaries**: Files are constrained by browser sandbox protections. No data is written to disk except for the user-initiated download of the extracted file.

---

## Known Limitations

- **Encrypted / Password-Protected PDFs**: PDFs encrypted with an owner/user password cannot be parsed without prior decryption.
- **Browser Memory Boundaries**: Extremely large PDF files (e.g., several gigabytes) may exceed browser tab memory allocations (`ArrayBuffer` limits).
- **Corrupted PDF Structures**: PDFs with invalid cross-reference tables or missing EOF markers will produce an error prompt.

---

## Future Improvements

- [ ] **Thumbnail Previews**: Generate canvas-rendered page previews for visual page selection.
- [ ] **Drag & Drop Page Reordering**: Allow custom page re-arrangements prior to extraction.
- [ ] **Multi-PDF Merge**: Support merging selected pages from multiple uploaded PDF files.
- [ ] **PDF Compression**: Basic streams optimization to reduce output file size.

---

## Screenshots

| Desktop Light Mode | Desktop Dark Mode |
| :---: | :---: |
| ![Desktop Light Mode](qa_screenshots/01_desktop_light.png) | ![Desktop Dark Mode](qa_screenshots/02_desktop_dark.png) |

| Individual Pages Mode | Range Extraction Mode |
| :---: | :---: |
| ![Individual Pages Mode](qa_screenshots/08_individual_list.png) | ![Range Extraction Mode](qa_screenshots/06_file_selected_light.png) |

---

## License

This repository does not currently specify an open-source license. All rights reserved.
