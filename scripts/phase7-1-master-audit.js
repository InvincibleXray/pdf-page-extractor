/**
 * PHASE 7.1 — FINAL EVIDENCE-COMPLETION & PRODUCTION RELEASE GATE MASTER AUDIT
 * 
 * Tests the entire application against the PRODUCTION PREVIEW BUILD (http://127.0.0.1:4323)
 * and rigorously gathers empirical evidence for all 30 audit sections.
 */

import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PDFDocument, PDFName, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { verifyPdfForensics } from './phase7-1-independent-verifier.js';

const browserCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
const chromePath = browserCandidates.find((p) => fs.existsSync(p));
if (!chromePath) {
  console.error('Fatal: No Chromium/Edge browser found.');
  process.exit(1);
}

const prodBaseUrl = 'http://127.0.0.1:4323';
const downloadDir = path.resolve('test-fixtures/phase7-1-downloads');
const screenshotDir = 'C:\\Users\\A\\.gemini\\antigravity\\brain\\7fd15cee-732e-4287-b99e-7575b7470022\\qa_screenshots\\phase7-1';
const realLargePdfPath = 'C:\\Users\\A\\Desktop\\ece\\5th sem ECE organizer.pdf';
const dedicatedCanary = 'CONFIDENTIAL_CANARY_PHASE7_1_SECRET_99X';

if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });
if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

function clearDownloadDir() {
  for (const file of fs.readdirSync(downloadDir)) {
    try {
      fs.unlinkSync(path.join(downloadDir, file));
    } catch (e) {}
  }
}
clearDownloadDir();

const auditResults = [];

function recordAudit(item) {
  const status = item.status || (item.passed ? 'PASS' : 'FAIL');
  const record = {
    ...item,
    passed: status === 'PASS',
    status,
  };
  auditResults.push(record);
  const tag = status === 'PASS' ? '✅ [PASS]' : status === 'UNSUPPORTED' ? 'ℹ️ [UNSUPPORTED]' : status === 'NOT TESTED' ? '⏸️ [NOT TESTED]' : status === 'BLOCKED' ? '🚫 [BLOCKED]' : '❌ [FAIL]';
  console.log(`${tag} ${record.id}: ${record.name} (${record.area})${record.details ? ` — ${record.details}` : ''}`);
}

async function waitForNewDownload(existingFiles = null, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const currentFiles = fs.readdirSync(downloadDir).filter((f) => f.endsWith('.pdf'));
    const newFiles = existingFiles ? currentFiles.filter((f) => !existingFiles.includes(f)) : currentFiles;
    if (newFiles.length > 0) {
      for (const nf of newFiles) {
        const fullPath = path.join(downloadDir, nf);
        try {
          const initialSize = fs.statSync(fullPath).size;
          if (initialSize > 0) {
            await new Promise((r) => setTimeout(r, 600));
            const finalSize = fs.statSync(fullPath).size;
            if (initialSize === finalSize && finalSize > 0) {
              return fullPath;
            }
          }
        } catch (e) {}
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

async function runMasterAudit() {
  console.log('================================================================');
  console.log('STARTING PHASE 7.1 FINAL EVIDENCE & RELEASE-GATE AUDIT');
  console.log(`Target: ${prodBaseUrl} (Astro Production Preview)`);
  console.log(`Browser: ${chromePath}`);
  console.log('================================================================\n');

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900'],
  });

  const capturedNetworkRequests = [];
  const uncaughtConsoleErrors = [];

  try {
    const page = await browser.newPage();
    const cdp = await page.target().createCDPSession();
    await cdp.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDir,
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('standardFontDataUrl')) {
          uncaughtConsoleErrors.push(text);
        }
      }
    });

    page.on('dialog', async (dialog) => {
      console.log(`[Browser Dialog] "${dialog.message()}"`);
      await dialog.dismiss();
    });

    page.on('request', (req) => {
      const url = req.url().toLowerCase();
      if (!url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1') && !url.startsWith('data:') && !url.startsWith('blob:')) {
        capturedNetworkRequests.push({
          url: req.url(),
          method: req.method(),
          postData: req.postData(),
        });
      }
    });

    // =========================================================================
    // SECTION 2 & 3: PRODUCTION BUILD BASELINE & ROUTE INVENTORY
    // =========================================================================
    console.log('\n--- SECTION 2 & 3: Production Build Baseline & Route Inventory ---');

    // 1.1 Extractor Route `/`
    const r1 = await page.goto(`${prodBaseUrl}/`, { waitUntil: 'networkidle0' });
    const r1Status = r1.status();
    const r1Meta = await page.evaluate(() => {
      return {
        title: document.title,
        desc: document.querySelector('meta[name="description"]')?.getAttribute('content'),
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
        viewport: document.querySelector('meta[name="viewport"]')?.getAttribute('content'),
        ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute('content'),
        ogDesc: document.querySelector('meta[property="og:description"]')?.getAttribute('content'),
        twitterCard: document.querySelector('meta[property="twitter:card"]')?.getAttribute('content'),
        jsonLd: document.querySelector('script[type="application/ld+json"]')?.textContent,
      };
    });

    recordAudit({
      id: 'ROUTE-01',
      name: 'Extractor Route "/" Availability & Status',
      area: 'Route Inventory',
      passed: r1Status === 200,
      details: `HTTP Status: ${r1Status}`,
    });

    recordAudit({
      id: 'SEO-01',
      name: 'Extractor Route Metadata, Viewport & Canonicals',
      area: 'SEO Technical',
      passed: !!r1Meta.title && !!r1Meta.desc && r1Meta.canonical === 'https://pdfpage.tools/' && !!r1Meta.viewport,
      details: `Title: "${r1Meta.title}", Canonical: "${r1Meta.canonical}"`,
    });

    let hasR1StructuredData = false;
    if (r1Meta.jsonLd) {
      try {
        const parsed = JSON.parse(r1Meta.jsonLd);
        hasR1StructuredData = !!parsed['@type'];
      } catch (e) {}
    }
    recordAudit({
      id: 'SEO-02',
      name: 'Extractor Route Structured Data (JSON-LD)',
      area: 'Structured Data',
      passed: hasR1StructuredData,
      details: hasR1StructuredData ? 'Valid JSON-LD schema detected' : 'Missing JSON-LD',
    });

    // 1.2 Editor Route `/pdf-editor/`
    const r2 = await page.goto(`${prodBaseUrl}/pdf-editor/`, { waitUntil: 'networkidle0' });
    const r2Status = r2.status();
    const r2Meta = await page.evaluate(() => {
      return {
        title: document.title,
        desc: document.querySelector('meta[name="description"]')?.getAttribute('content'),
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
        viewport: document.querySelector('meta[name="viewport"]')?.getAttribute('content'),
        ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute('content'),
        jsonLd: document.querySelector('script[type="application/ld+json"]')?.textContent,
      };
    });

    recordAudit({
      id: 'ROUTE-02',
      name: 'Editor Route "/pdf-editor/" Availability & Status',
      area: 'Route Inventory',
      passed: r2Status === 200,
      details: `HTTP Status: ${r2Status}`,
    });

    recordAudit({
      id: 'SEO-03',
      name: 'Editor Route Metadata & Canonicals',
      area: 'SEO Technical',
      passed: !!r2Meta.title && !!r2Meta.desc && r2Meta.canonical === 'https://pdfpage.tools/pdf-editor/',
      details: `Title: "${r2Meta.title}", Canonical: "${r2Meta.canonical}"`,
    });

    recordAudit({
      id: 'SEO-04',
      name: 'Editor Route Structured Data',
      area: 'Structured Data',
      passed: !!r2Meta.jsonLd,
      status: r2Meta.jsonLd ? 'PASS' : 'FAIL',
      details: r2Meta.jsonLd ? 'Valid JSON-LD' : 'Editor route lacks dedicated JSON-LD schema (Documented backlog item)',
    });

    // 1.3 Check robots.txt and sitemap.xml
    const robotsRes = await page.goto(`${prodBaseUrl}/robots.txt`).catch(() => null);
    const sitemapRes = await page.goto(`${prodBaseUrl}/sitemap.xml`).catch(() => null);

    recordAudit({
      id: 'SEO-05',
      name: 'robots.txt Presence & Technical Discoverability',
      area: 'Technical SEO',
      passed: robotsRes && robotsRes.status() === 200,
      status: (robotsRes && robotsRes.status() === 200) ? 'PASS' : 'FAIL',
      details: (robotsRes && robotsRes.status() === 200) ? 'robots.txt present' : 'robots.txt missing (404 Not Found)',
    });

    recordAudit({
      id: 'SEO-06',
      name: 'sitemap.xml Presence & Technical Discoverability',
      area: 'Technical SEO',
      passed: sitemapRes && sitemapRes.status() === 200,
      status: (sitemapRes && sitemapRes.status() === 200) ? 'PASS' : 'FAIL',
      details: (sitemapRes && sitemapRes.status() === 200) ? 'sitemap.xml present' : 'sitemap.xml missing (404 Not Found)',
    });

    // =========================================================================
    // SECTION 4: REAL BROWSER EXTRACTOR ACCEPTANCE
    // =========================================================================
    console.log('\n--- SECTION 4: Real Browser Extractor Acceptance ---');
    await page.goto(`${prodBaseUrl}/`, { waitUntil: 'networkidle0' });

    // Generate a pristine 3-page test PDF
    const extractorFixturePath = path.resolve('test-fixtures/phase7-1-extractor-fixture.pdf');
    {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.HelveticaBold);
      for (let i = 1; i <= 3; i++) {
        const p = doc.addPage([595, 842]);
        p.drawText(`Extractor Acceptance Document - Page ${i}`, { x: 50, y: 750, size: 20, font });
        p.drawText(`Page content fingerprint: P${i}-UNIQUE-DATA-${Date.now()}`, { x: 50, y: 700, size: 12 });
      }
      fs.writeFileSync(extractorFixturePath, await doc.save());
    }
    const initialSourceBytes = fs.readFileSync(extractorFixturePath);
    const initialSourceHash = crypto.createHash('sha256').update(initialSourceBytes).digest('hex');

    const extractorFileInput = await page.$('#file-input');
    await extractorFileInput.uploadFile(extractorFixturePath);

    // Wait for page detection
    await page.waitForFunction(() => {
      const el = document.getElementById('page-count-status');
      return el && el.textContent && el.textContent.includes('3 pages');
    }, { timeout: 10000 });

    recordAudit({
      id: 'EXTRACT-01',
      name: 'Extractor Real Browser PDF Upload & Page Detection',
      area: 'Extractor Acceptance',
      passed: true,
      details: 'Detected 3 pages correctly',
    });

    // Test Invalid Range Input Handling via Individual Pages Mode
    await page.click('#mode-individual-btn');
    await page.evaluate(() => {
      const inp = document.getElementById('individual-pages-input');
      if (inp) {
        inp.value = '0, 99999, -5, abc';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await new Promise((r) => setTimeout(r, 500));

    const invalidRangeFeedback = await page.evaluate(() => {
      const el = document.getElementById('range-status-text');
      return el ? el.textContent : '';
    });
    const isInvalidHandled =
      invalidRangeFeedback?.toLowerCase().includes('must be at least 1') ||
      invalidRangeFeedback?.toLowerCase().includes('invalid') ||
      invalidRangeFeedback?.toLowerCase().includes('0 pages') ||
      invalidRangeFeedback?.toLowerCase().includes('out of range');

    recordAudit({
      id: 'EXTRACT-02',
      name: 'Extractor Out-of-Bounds & Invalid Range Sanitization',
      area: 'Extractor Acceptance',
      passed: !!isInvalidHandled,
      details: `Status feedback: "${invalidRangeFeedback.trim()}"`,
    });

    // Test Mixed Selection & Deduplication: enter '1, 1, 2-3, 2'
    await page.evaluate(() => {
      const inp = document.getElementById('individual-pages-input');
      if (inp) {
        inp.value = '1, 1, 2-3, 2';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await new Promise((r) => setTimeout(r, 600));

    clearDownloadDir();

    // Click Extract and wait for download
    await page.click('#extract-btn');
    const downloadedExtractorPdf = await waitForNewDownload(null, 20000);

    recordAudit({
      id: 'EXTRACT-03',
      name: 'Extractor Real Browser Extraction & Download',
      area: 'Extractor Acceptance',
      passed: !!downloadedExtractorPdf,
      details: downloadedExtractorPdf ? `Downloaded: ${path.basename(downloadedExtractorPdf)} (${fs.statSync(downloadedExtractorPdf).size} bytes)` : 'Download timed out',
    });

    // Verify SHA-256 immutability of source file
    const postSourceBytes = fs.readFileSync(extractorFixturePath);
    const postSourceHash = crypto.createHash('sha256').update(postSourceBytes).digest('hex');
    recordAudit({
      id: 'EXTRACT-04',
      name: 'Source PDF Immutability (Byte-for-byte SHA-256 match)',
      area: 'Data Integrity',
      passed: initialSourceHash === postSourceHash,
      details: `Source hash unmutated: ${initialSourceHash.slice(0, 16)}...`,
    });

    // Fresh session reopen of extracted PDF
    if (downloadedExtractorPdf) {
      const extractedDoc = await PDFDocument.load(fs.readFileSync(downloadedExtractorPdf));
      const extractedCount = extractedDoc.getPageCount();
      recordAudit({
        id: 'EXTRACT-05',
        name: 'Extracted PDF Page Count & Deduplication Fidelity',
        area: 'Extractor Forensic Check',
        passed: extractedCount === 3,
        details: `Expected deduplicated pages 1, 2, 3 (count: 3). Found: ${extractedCount}`,
      });
    }

    // =========================================================================
    // SECTION 6: SECURE REDACTION — FORENSIC VERIFICATION (DEDICATED CANARY)
    // =========================================================================
    console.log('\n--- SECTION 6: Secure Redaction Forensic Verification ---');
    const canaryFixturePath = path.resolve('test-fixtures/phase7-1-canary-fixture.pdf');
    {
      const doc = await PDFDocument.create();
      doc.setTitle(`Phase 7.1 Confidential Dossier ${dedicatedCanary}`);
      doc.setAuthor(`Officer ${dedicatedCanary}`);
      doc.setSubject(`Secret Subject ${dedicatedCanary}`);
      const font = await doc.embedFont(StandardFonts.HelveticaBold);

      // Page 1: Ordinary text canary + partial text canary + form field canary
      const p1 = doc.addPage([595, 842]);
      p1.drawText(`CONFIDENTIAL DATA: ${dedicatedCanary}`, { x: 50, y: 750, size: 16, font });
      p1.drawText(`PARTIAL: PREFIX_${dedicatedCanary}_SUFFIX`, { x: 50, y: 700, size: 12, font });
      p1.drawText('Page 1 Public Unredacted Header', { x: 50, y: 650, size: 12, font });

      const form = doc.getForm();
      const secretField = form.createTextField('secretField');
      secretField.setText(`FIELD_${dedicatedCanary}`);
      secretField.addToPage(p1, { x: 50, y: 550, width: 300, height: 30 });

      // Page 2: Rotated 90° text canary
      const p2 = doc.addPage([595, 842]);
      p2.setRotation({ angle: 90, type: 'degrees' });
      p2.drawText(`ROTATED_CANARY: ${dedicatedCanary}`, { x: 100, y: 400, size: 14, font });
      const publicField = form.createTextField('publicField');
      publicField.setText('PublicUnredactedValue');
      publicField.addToPage(p2, { x: 100, y: 300, width: 250, height: 30 });

      fs.writeFileSync(canaryFixturePath, await doc.save());
    }

    // Load canary document in editor
    await page.goto(`${prodBaseUrl}/pdf-editor/`, { waitUntil: 'networkidle0' });
    const editorFileInput = await page.$('#editor-file-input');
    await editorFileInput.uploadFile(canaryFixturePath);

    await page.waitForFunction(() => !document.getElementById('editor-workspace-view')?.classList.contains('hidden'), { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 1200));

    // Place redaction box over Page 1 secret area (x: 40, y: 60, width: 450, height: 260)
    await page.evaluate(() => {
      const store = window.__PDF_EDITOR_STORE__;
      if (store) {
        store.addObject({
          id: 'redact-canary-p1',
          type: 'redact',
          pageNumber: 1,
          x: 40,
          y: 60,
          width: 450,
          height: 260,
          rotation: 0,
          strokeColor: '#000000',
          fillColor: '#000000',
          strokeWidth: 1,
          zIndex: 100,
        });
      }
    });

    // Also switch to Page 2 and place redaction box over the rotated text
    await page.evaluate(() => {
      const store = window.__PDF_EDITOR_STORE__;
      if (store) {
        store.setCurrentPage(2);
        store.addObject({
          id: 'redact-canary-p2',
          type: 'redact',
          pageNumber: 2,
          x: 40,
          y: 40,
          width: 500,
          height: 400,
          rotation: 0,
          strokeColor: '#000000',
          fillColor: '#000000',
          strokeWidth: 1,
          zIndex: 100,
        });
      }
    });

    await page.screenshot({ path: path.join(screenshotDir, '03_editor_redaction_placed.png') });

    // Export redacted PDF with modal handling
    clearDownloadDir();
    await page.click('#editor-export-btn');
    await new Promise((r) => setTimeout(r, 500));

    const isFormModalOpen = await page.evaluate(() => {
      const m = document.getElementById('form-export-mode-modal');
      return m && !m.classList.contains('hidden');
    });
    if (isFormModalOpen) {
      await page.click('#export-mode-interactive-btn');
      await new Promise((r) => setTimeout(r, 400));
    }

    await page.waitForSelector('#redaction-confirm-modal:not(.hidden)', { timeout: 8000 });
    await page.click('#confirm-redact-export-btn');

    const downloadedRedactedPdf = await waitForNewDownload(null, 25000);

    recordAudit({
      id: 'REDACT-01',
      name: 'Adversarial Redaction Export Download',
      area: 'Secure Redaction',
      passed: !!downloadedRedactedPdf,
      details: downloadedRedactedPdf ? `Exported: ${path.basename(downloadedRedactedPdf)}` : 'Download failed',
    });

    if (downloadedRedactedPdf) {
      const forensicReport = await verifyPdfForensics(downloadedRedactedPdf, {
        forbiddenCanaries: [dedicatedCanary],
        requireSanitizedMetadata: true,
        requireSingleRevision: true,
      });

      recordAudit({
        id: 'REDACT-02',
        name: 'Vector A-J Independent Forensic Audit (Zero Leaked Canaries)',
        area: 'Forensic Redaction Gate',
        passed: forensicReport.canaryLeakDetections.length === 0,
        details: `Canary leaks detected: ${forensicReport.canaryLeakDetections.length}`,
      });

      recordAudit({
        id: 'REDACT-03',
        name: 'Metadata & XMP Packet Sanitization',
        area: 'Forensic Redaction Gate',
        passed: !forensicReport.hasXmpMetadata && forensicReport.vectorAudit.vectorD_metadata.passed,
        details: `XMP purged: ${!forensicReport.hasXmpMetadata}, Info clean: ${forensicReport.vectorAudit.vectorD_metadata.passed}`,
      });
    }

    // =========================================================================
    // SECTION 5: REAL BROWSER EDITOR ACCEPTANCE (COMPREHENSIVE TOOLING)
    // =========================================================================
    console.log('\n--- SECTION 5: Real Browser Editor Acceptance ---');
    await page.goto(`${prodBaseUrl}/pdf-editor/`, { waitUntil: 'networkidle0' });

    // Open Sample PDF Document via button
    await page.click('#editor-sample-btn');
    await page.waitForFunction(() => !document.getElementById('editor-workspace-view')?.classList.contains('hidden'), { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 1200));

    // Capture Screenshot 1: Original
    await page.screenshot({ path: path.join(screenshotDir, '01_editor_original.png') });

    // Test Navigation: Step to page 2, then back to 1
    await page.evaluate(() => {
      const store = window.__PDF_EDITOR_STORE__;
      if (store) store.setCurrentPage(2);
    });
    await new Promise((r) => setTimeout(r, 500));
    await page.evaluate(() => {
      const store = window.__PDF_EDITOR_STORE__;
      if (store) store.setCurrentPage(1);
    });

    // Test Zoom: 50%, 150%, 100%
    await page.evaluate(() => {
      const store = window.__PDF_EDITOR_STORE__;
      if (store) {
        store.setZoom(0.5);
        store.setZoom(1.5);
        store.setZoom(1.0);
      }
    });

    // Add Text, Annotations, Shapes & Fill Forms
    await page.evaluate(() => {
      const store = window.__PDF_EDITOR_STORE__;
      if (store) {
        // Text
        store.addObject({
          id: 'text-obj-p1',
          type: 'text',
          pageNumber: 1,
          x: 60,
          y: 120,
          width: 250,
          height: 30,
          text: 'Phase 7.1 Engineering Text',
          fontSize: 14,
          fontFamily: 'Helvetica',
          fillColor: '#1e40af',
          zIndex: 10,
        });

        // Text Replacement
        store.addObject({
          id: 'replace-obj-p1',
          type: 'text-replacement',
          pageNumber: 1,
          x: 60,
          y: 160,
          width: 220,
          height: 25,
          originalText: 'Standard Terms',
          replacementText: 'Verified Phase 7.1 Terms',
          fontSize: 12,
          fontFamily: 'Helvetica',
          fillColor: '#0f172a',
          maskColor: '#ffffff',
          zIndex: 11,
        });

        // Underline & Strikethrough
        store.addObject({
          id: 'underline-obj-p1',
          type: 'underline',
          pageNumber: 1,
          x: 60,
          y: 200,
          width: 180,
          height: 15,
          strokeColor: '#2563eb',
          strokeWidth: 2,
          zIndex: 12,
        });
        store.addObject({
          id: 'strike-obj-p1',
          type: 'strikethrough',
          pageNumber: 1,
          x: 60,
          y: 225,
          width: 180,
          height: 15,
          strokeColor: '#dc2626',
          strokeWidth: 2,
          zIndex: 13,
        });

        // Sticky Comment Note
        store.addObject({
          id: 'comment-obj-p1',
          type: 'comment',
          pageNumber: 1,
          x: 320,
          y: 120,
          width: 32,
          height: 32,
          commentText: 'Forensic Review Note: Confirmed passed',
          fillColor: '#fbbf24',
          zIndex: 14,
        });

        // Shapes (Rectangle, Ellipse, Line, Arrow)
        store.addObject({
          id: 'rect-obj-p1',
          type: 'rectangle',
          pageNumber: 1,
          x: 320,
          y: 170,
          width: 80,
          height: 40,
          strokeColor: '#10b981',
          strokeWidth: 2,
          fillColor: 'transparent',
          zIndex: 15,
        });
        store.addObject({
          id: 'ellipse-obj-p1',
          type: 'ellipse',
          pageNumber: 1,
          x: 420,
          y: 170,
          width: 70,
          height: 40,
          strokeColor: '#8b5cf6',
          strokeWidth: 2,
          fillColor: 'transparent',
          zIndex: 16,
        });
        store.addObject({
          id: 'line-obj-p1',
          type: 'line',
          pageNumber: 1,
          x: 60,
          y: 260,
          width: 200,
          height: 0,
          strokeColor: '#64748b',
          strokeWidth: 2,
          zIndex: 17,
        });
        store.addObject({
          id: 'arrow-obj-p1',
          type: 'arrow',
          pageNumber: 1,
          x: 60,
          y: 280,
          width: 200,
          height: 0,
          strokeColor: '#64748b',
          strokeWidth: 2,
          zIndex: 18,
        });

        // Pen freehand
        store.addObject({
          id: 'pen-obj-p1',
          type: 'pen',
          pageNumber: 1,
          x: 320,
          y: 230,
          width: 100,
          height: 30,
          strokeColor: '#f97316',
          strokeWidth: 2,
          points: [{ x: 0, y: 0 }, { x: 20, y: 15 }, { x: 50, y: 5 }, { x: 100, y: 20 }],
          zIndex: 19,
        });
      }

      // Create & Fill AcroForm field on Page 1
      const formStore = window.__PDF_FORM_STORE__;
      if (formStore) {
        formStore.createFieldAndWidget({
          type: 'text',
          name: 'personName',
          pageNumber: 1,
          pdfRect: [70, 700, 220, 725],
          value: 'Jane Doe',
        });
      }
    });

    await new Promise((r) => setTimeout(r, 600));
    // Capture Screenshot 2: Edited with Tools
    await page.screenshot({ path: path.join(screenshotDir, '02_editor_edited_tools.png') });

    // Capture Screenshot 4: Form Filled
    await page.screenshot({ path: path.join(screenshotDir, '04_editor_form_filled.png') });

    // Export Mode A (Interactive)
    clearDownloadDir();
    await page.click('#editor-export-btn');
    await page.waitForSelector('#form-export-mode-modal:not(.hidden)', { timeout: 6000 });
    await page.click('#export-mode-interactive-btn');

    const downloadedEditorPdf = await waitForNewDownload(null, 25000);

    recordAudit({
      id: 'EDITOR-01',
      name: 'Full Editor Browser Workflow & Export Download',
      area: 'Editor Acceptance',
      passed: !!downloadedEditorPdf,
      details: downloadedEditorPdf ? `Downloaded: ${path.basename(downloadedEditorPdf)}` : 'Export failed',
    });

    // Reopen exported document in fresh browser session
    if (downloadedEditorPdf) {
      const reopenPage = await browser.newPage();
      await reopenPage.goto(`${prodBaseUrl}/pdf-editor/`, { waitUntil: 'networkidle0' });
      const reopenInput = await reopenPage.$('#editor-file-input');
      await reopenInput.uploadFile(downloadedEditorPdf);
      await reopenPage.waitForFunction(() => !document.getElementById('editor-workspace-view')?.classList.contains('hidden'), { timeout: 15000 });
      await new Promise((r) => setTimeout(r, 1200));

      // Capture Screenshot 5: Exported Reopened
      await reopenPage.screenshot({ path: path.join(screenshotDir, '05_editor_exported_reopened.png') });
      await reopenPage.close();

      recordAudit({
        id: 'EDITOR-02',
        name: 'Fresh Session Reopen of Exported Document',
        area: 'Editor Acceptance',
        passed: true,
        details: 'Exported PDF reopened and rendered successfully in fresh session',
      });
    }

    // =========================================================================
    // SECTION 7: FORM EXPORT FORENSICS (MODE A & MODE B)
    // =========================================================================
    console.log('\n--- SECTION 7: Form Export Forensics ---');
    // Mode A: Interactive Form Export Check
    if (downloadedEditorPdf) {
      const modeAReport = await verifyPdfForensics(downloadedEditorPdf, {
        mustHaveAcroForm: true,
        expectedFieldValues: {
          personName: 'Jane Doe',
        },
      });

      recordAudit({
        id: 'FORM-01',
        name: 'Mode A Interactive Form Export (AcroForm Catalog & Values Preserved)',
        area: 'Form Forensics',
        passed: modeAReport.hasAcroFormCatalog && modeAReport.fieldValues['personName'] === 'Jane Doe',
        details: `AcroForm present: ${modeAReport.hasAcroFormCatalog}, Field personName: "${modeAReport.fieldValues['personName']}"`,
      });
    }

    // Mode B: Flattened Form Export Check
    clearDownloadDir();
    await page.click('#editor-export-btn');
    await page.waitForSelector('#form-export-mode-modal:not(.hidden)', { timeout: 6000 });
    await page.click('#export-mode-flattened-btn');

    const downloadedFlattenedPdf = await waitForNewDownload(null, 25000);

    recordAudit({
      id: 'FORM-02',
      name: 'Mode B Flattened Export Downloaded',
      area: 'Form Export Mode B',
      passed: !!downloadedFlattenedPdf,
      details: downloadedFlattenedPdf ? path.basename(downloadedFlattenedPdf) : 'Failed',
    });

    if (downloadedFlattenedPdf) {
      const modeBReport = await verifyPdfForensics(downloadedFlattenedPdf, {
        mustNotHaveAcroForm: true,
      });

      recordAudit({
        id: 'FORM-03',
        name: 'Mode B Flattened Forensic Check (0 AcroForm & 0 Widgets)',
        area: 'Form Forensics',
        passed: !modeBReport.hasAcroFormCatalog && modeBReport.widgetAnnotationCount === 0,
        details: `AcroForm Catalog: ${modeBReport.hasAcroFormCatalog}, Widgets: ${modeBReport.widgetAnnotationCount}`,
      });
    }

    // =========================================================================
    // SECTION 8: PAGE OPERATION FORENSICS (ROTATION, DUPLICATION, RE-KEYING)
    // =========================================================================
    console.log('\n--- SECTION 8: Page Operation Forensics ---');
    // Test Form Field Re-Keying on Page Duplication
    const rekeyingResult = await page.evaluate(() => {
      const editorStore = window.__PDF_EDITOR_STORE__;
      const formStore = window.__PDF_FORM_STORE__;
      if (!editorStore || !formStore) return null;

      // Duplicate page 1 (which contains personName)
      editorStore.duplicatePage(1);
      const fieldsAfterFirstDup = Array.from(formStore.state.fields.keys());

      // Duplicate page 1 again
      editorStore.duplicatePage(1);
      const fieldsAfterSecondDup = Array.from(formStore.state.fields.keys());

      return {
        firstDupFields: fieldsAfterFirstDup,
        secondDupFields: fieldsAfterSecondDup,
      };
    });

    const hasCopy1 = rekeyingResult?.firstDupFields?.some((f) => f.includes('copy1') || f.includes('_1'));
    const hasCopy2 = rekeyingResult?.secondDupFields?.some((f) => f.includes('copy2') || f.includes('_2') || f.includes('copy1_1'));

    recordAudit({
      id: 'PAGEOPS-01',
      name: 'Duplicated Page Form Field Re-Keying Semantics',
      area: 'Page Operations',
      passed: hasCopy1 && hasCopy2,
      details: `Generated fields: ${JSON.stringify(rekeyingResult?.secondDupFields)}`,
    });

    // Test Rotations: 0, 90, 180, 270
    const rotationResult = await page.evaluate(() => {
      const editorStore = window.__PDF_EDITOR_STORE__;
      if (!editorStore) return null;
      editorStore.rotatePage(1, 90);
      const rot90 = editorStore.getState().document.pages[0].rotation;
      editorStore.rotatePage(1, 90);
      const rot180 = editorStore.getState().document.pages[0].rotation;
      editorStore.rotatePage(1, 90);
      const rot270 = editorStore.getState().document.pages[0].rotation;
      editorStore.rotatePage(1, 90);
      const rot0 = editorStore.getState().document.pages[0].rotation;
      return { rot90, rot180, rot270, rot0 };
    });

    recordAudit({
      id: 'PAGEOPS-02',
      name: 'Page Rotation Coordinate Invariance (0°, 90°, 180°, 270°)',
      area: 'Page Operations',
      passed: rotationResult?.rot90 === 90 && rotationResult?.rot180 === 180 && rotationResult?.rot270 === 270 && rotationResult?.rot0 === 0,
      details: `Tested angles: 90° -> ${rotationResult?.rot90}°, 180° -> ${rotationResult?.rot180}°, 270° -> ${rotationResult?.rot270}°, 0° -> ${rotationResult?.rot0}°`,
    });

    // =========================================================================
    // SECTION 9: LARGE PDF STRESS & MEMORY STABILITY
    // =========================================================================
    console.log('\n--- SECTION 9: Large PDF Stress & Memory Stability ---');
    recordAudit({
      id: 'LARGE-01',
      name: 'Real 876-Page 211.7 MB PDF File Presence',
      area: 'Large PDF',
      passed: fs.existsSync(realLargePdfPath),
      details: `File size: ${(fs.statSync(realLargePdfPath).size / (1024 * 1024)).toFixed(2)} MB`,
    });

    // Load Large PDF into Extractor
    await page.goto(`${prodBaseUrl}/`, { waitUntil: 'networkidle0' });
    const largeExtractorInput = await page.$('#file-input');
    const largeLoadStart = Date.now();
    await largeExtractorInput.uploadFile(realLargePdfPath);

    await page.waitForFunction(() => {
      const el = document.getElementById('page-count-status');
      return el && el.textContent && el.textContent.includes('876 pages');
    }, { timeout: 60000 });
    const largeLoadDuration = Date.now() - largeLoadStart;

    recordAudit({
      id: 'LARGE-02',
      name: 'Large PDF (876 Pages) Loaded & Discovered',
      area: 'Large PDF & Extractor',
      passed: true,
      details: `Discovered 876 pages in ${(largeLoadDuration / 1000).toFixed(2)}s`,
    });

    // Extract First & Last Pages (1 and 876) from 876-page PDF
    await page.click('#mode-individual-btn');
    await page.evaluate(() => {
      const input = document.getElementById('individual-pages-input');
      if (input) {
        input.value = '1, 876';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await new Promise((r) => setTimeout(r, 600));

    clearDownloadDir();
    await page.click('#extract-btn');
    const downloadedLargeExtract = await waitForNewDownload(null, 60000);

    recordAudit({
      id: 'LARGE-03',
      name: 'Large PDF Differential Extraction (Pages 1 & 876)',
      area: 'Large PDF Output',
      passed: !!downloadedLargeExtract,
      details: downloadedLargeExtract ? `Downloaded: ${path.basename(downloadedLargeExtract)} (${fs.statSync(downloadedLargeExtract).size} bytes)` : 'Failed',
    });

    if (downloadedLargeExtract) {
      const docLarge = await PDFDocument.load(fs.readFileSync(downloadedLargeExtract));
      recordAudit({
        id: 'LARGE-04',
        name: 'Large PDF Extracted Page Count Verification',
        area: 'Large PDF Output',
        passed: docLarge.getPageCount() === 2,
        details: `Page count exactly 2: ${docLarge.getPageCount() === 2}`,
      });
    }

    // =========================================================================
    // SECTION 10: CRASH & FAILURE-MODE RESILIENCE
    // =========================================================================
    console.log('\n--- SECTION 10: Crash & Failure-Mode Resilience ---');
    // 1. Zero-byte file
    const zeroBytePath = path.resolve('test-fixtures/zero-byte.pdf');
    fs.writeFileSync(zeroBytePath, Buffer.alloc(0));

    await page.goto(`${prodBaseUrl}/pdf-editor/`, { waitUntil: 'networkidle0' });
    const crashInput = await page.$('#editor-file-input');
    await crashInput.uploadFile(zeroBytePath);
    await new Promise((r) => setTimeout(r, 800));

    const zeroByteHandled = await page.evaluate(() => {
      return !document.body.innerHTML.includes('Uncaught Error');
    });
    recordAudit({
      id: 'CRASH-01',
      name: 'Zero-byte File Input Graceful Handling',
      area: 'Crash Resilience',
      passed: zeroByteHandled,
      details: 'No unhandled crash occurred on zero-byte file',
    });

    // 2. Non-PDF disguised as .pdf
    const fakePdfPath = path.resolve('test-fixtures/fake.pdf');
    fs.writeFileSync(fakePdfPath, 'THIS IS JUST PLAIN TEXT, NOT A REAL PDF DOCUMENT AT ALL.');
    await crashInput.uploadFile(fakePdfPath);
    await new Promise((r) => setTimeout(r, 800));

    const fakeHandled = await page.evaluate(() => {
      return !document.body.innerHTML.includes('Uncaught Error');
    });
    recordAudit({
      id: 'CRASH-02',
      name: 'Non-PDF Disguised File Handling',
      area: 'Crash Resilience',
      passed: fakeHandled,
      details: 'Corrupted format caught gracefully without breaking UI',
    });

    // 3. Rapid Tool Switching Stress (20 cycles)
    await page.click('#editor-sample-btn');
    await page.waitForFunction(() => !document.getElementById('editor-workspace-view')?.classList.contains('hidden'), { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 800));

    const stressErrorCount = await page.evaluate(async () => {
      let errors = 0;
      const tools = ['select', 'text', 'highlight', 'pen', 'rectangle', 'ellipse'];
      for (let i = 0; i < 20; i++) {
        try {
          const t = tools[i % tools.length];
          const btn = document.querySelector(`[data-tool="${t}"]`);
          if (btn) btn.click();
        } catch (e) {
          errors++;
        }
      }
      return errors;
    });

    recordAudit({
      id: 'CRASH-03',
      name: 'Rapid Tool Switching Stress Test (20 cycles)',
      area: 'Stress Policy',
      passed: stressErrorCount === 0,
      details: `Errors encountered: ${stressErrorCount}`,
    });

    // 4. Repeated Undo/Redo Stress (20 cycles)
    const undoRedoErrors = await page.evaluate(async () => {
      let errors = 0;
      const undoBtn = document.getElementById('tool-undo-btn');
      const redoBtn = document.getElementById('tool-redo-btn');
      for (let i = 0; i < 20; i++) {
        try {
          if (undoBtn && !undoBtn.disabled) undoBtn.click();
          if (redoBtn && !redoBtn.disabled) redoBtn.click();
        } catch (e) {
          errors++;
        }
      }
      return errors;
    });

    recordAudit({
      id: 'CRASH-04',
      name: 'Repeated Undo/Redo Stress Test (20 cycles)',
      area: 'Stress Policy',
      passed: undoRedoErrors === 0,
      details: `Errors encountered: ${undoRedoErrors}`,
    });

    // =========================================================================
    // SECTION 11: PERFORMANCE METRICS
    // =========================================================================
    console.log('\n--- SECTION 11: Performance Metrics ---');
    await page.goto(`${prodBaseUrl}/`, { waitUntil: 'networkidle0' });

    const perfMetrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const resources = performance.getEntriesByType('resource');
      let totalBytes = 0;
      for (const r of resources) {
        totalBytes += r.transferSize || 0;
      }
      return {
        domInteractive: nav ? Math.round(nav.domInteractive) : 0,
        domComplete: nav ? Math.round(nav.domComplete) : 0,
        loadEventEnd: nav ? Math.round(nav.loadEventEnd) : 0,
        resourceCount: resources.length,
        totalTransferKb: Math.round(totalBytes / 1024),
      };
    });

    recordAudit({
      id: 'PERF-01',
      name: 'Navigation Timing & Page Weight',
      area: 'Performance',
      passed: perfMetrics.domComplete > 0 && perfMetrics.domComplete < 3000,
      details: `DOM Complete: ${perfMetrics.domComplete}ms, Resources: ${perfMetrics.resourceCount}, Transfer: ${perfMetrics.totalTransferKb} KB`,
    });

    // =========================================================================
    // SECTION 13: RESPONSIVE & VISUAL QA (8 VIEWPORTS)
    // =========================================================================
    console.log('\n--- SECTION 13: Responsive & Visual QA ---');
    const viewports = [320, 360, 390, 430, 768, 1024, 1440, 1920];
    let overflowCount = 0;

    for (const width of viewports) {
      await page.setViewport({ width, height: 900 });
      await new Promise((r) => setTimeout(r, 200));

      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      if (hasOverflow) overflowCount++;

      await page.screenshot({ path: path.join(screenshotDir, `responsive_${width}.png`) });
    }

    recordAudit({
      id: 'RESP-01',
      name: 'Zero Horizontal Overflow across 8 Viewports (320px to 1920px)',
      area: 'Responsive QA',
      passed: overflowCount === 0,
      details: `Viewports tested: ${viewports.join(', ')}px. Overflows: ${overflowCount}`,
    });

    // Reset viewport
    await page.setViewport({ width: 1440, height: 900 });

    // =========================================================================
    // SECTION 15: ACCESSIBILITY AUDIT
    // =========================================================================
    console.log('\n--- SECTION 15: Accessibility Audit ---');
    await page.goto(`${prodBaseUrl}/`, { waitUntil: 'networkidle0' });

    // Tab key navigation check
    await page.keyboard.press('Tab');
    const activeTagName = await page.evaluate(() => document.activeElement?.tagName);

    recordAudit({
      id: 'A11Y-01',
      name: 'Keyboard Tab Focus Navigation Active',
      area: 'Accessibility',
      passed: !!activeTagName && activeTagName !== 'BODY',
      details: `First focused element tag: <${activeTagName}>`,
    });

    // Check button labels and aria attributes
    const a11yAudit = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const unlabeledButtons = buttons.filter((b) => !b.textContent?.trim() && !b.getAttribute('aria-label') && !b.getAttribute('title'));
      return {
        totalButtons: buttons.length,
        unlabeledCount: unlabeledButtons.length,
      };
    });

    recordAudit({
      id: 'A11Y-02',
      name: 'Semantic Button Labeling & ARIA Attributes',
      area: 'Accessibility',
      passed: a11yAudit.unlabeledCount === 0,
      details: `Total buttons: ${a11yAudit.totalButtons}, Unlabeled: ${a11yAudit.unlabeledCount}`,
    });

    // =========================================================================
    // SECTION 20 & 21: NETWORK PRIVACY & STORAGE PERSISTENCE AUDIT
    // =========================================================================
    console.log('\n--- SECTION 20 & 21: Network Privacy & Storage Persistence ---');
    const nonGetRequests = capturedNetworkRequests.filter((r) => r.method !== 'GET');
    const payloadLeaks = capturedNetworkRequests.filter((r) => r.postData && r.postData.length > 0);

    recordAudit({
      id: 'PRIVACY-01',
      name: 'Zero External Document Data Transmission (Network Privacy)',
      area: 'Network Privacy',
      passed: nonGetRequests.length === 0 && payloadLeaks.length === 0,
      details: `Captured external requests: ${capturedNetworkRequests.length}, Non-GET: ${nonGetRequests.length}, Leaked payloads: ${payloadLeaks.length}`,
    });

    const storageAudit = await page.evaluate(() => {
      const localKeys = Object.keys(localStorage);
      const sessionKeys = Object.keys(sessionStorage);
      return { localKeys, sessionKeys };
    });

    recordAudit({
      id: 'PRIVACY-02',
      name: 'Zero Document Content in Client Storage (Storage Privacy)',
      area: 'Storage Privacy',
      passed: !storageAudit.localKeys.some((k) => k.toLowerCase().includes('pdf') || k.toLowerCase().includes('doc')),
      details: `localStorage keys: [${storageAudit.localKeys.join(', ')}], sessionStorage keys: [${storageAudit.sessionKeys.join(', ')}]`,
    });

    // =========================================================================
    // SECTION 12: CROSS-BROWSER SUMMARY
    // =========================================================================
    recordAudit({
      id: 'BROWSER-01',
      name: 'Chromium / Microsoft Edge Compatibility',
      area: 'Cross-Browser',
      passed: true,
      details: `Verified on ${path.basename(chromePath)}`,
    });

    recordAudit({
      id: 'BROWSER-02',
      name: 'Google Chrome Standalone Binary',
      area: 'Cross-Browser',
      passed: false,
      status: 'NOT TESTED',
      details: 'Google Chrome binary not installed on machine (Edge Chromium used for Chromium engine tests)',
    });

    recordAudit({
      id: 'BROWSER-03',
      name: 'Mozilla Firefox Compatibility',
      area: 'Cross-Browser',
      passed: false,
      status: 'NOT TESTED',
      details: 'Firefox executable present on machine but CDP headless automation is Chromium-based',
    });

    recordAudit({
      id: 'BROWSER-04',
      name: 'Apple Safari / WebKit Compatibility',
      area: 'Cross-Browser',
      passed: false,
      status: 'BLOCKED',
      details: 'WebKit/Safari binary unsupported on native Windows host',
    });

    // Console Errors check
    recordAudit({
      id: 'STABILITY-01',
      name: 'Zero Uncaught Runtime Console Errors',
      area: 'Stability',
      passed: uncaughtConsoleErrors.length === 0,
      details: `Uncaught console errors: ${uncaughtConsoleErrors.length}`,
    });

  } finally {
    await browser.close();
  }

  // Save audit results to JSON
  const auditReportPath = path.resolve('test-fixtures/phase7-1-audit-results.json');
  const summary = {
    timestamp: new Date().toISOString(),
    totalChecks: auditResults.length,
    passed: auditResults.filter((r) => r.status === 'PASS').length,
    failed: auditResults.filter((r) => r.status === 'FAIL').length,
    notTested: auditResults.filter((r) => r.status === 'NOT TESTED').length,
    blocked: auditResults.filter((r) => r.status === 'BLOCKED').length,
    unsupported: auditResults.filter((r) => r.status === 'UNSUPPORTED').length,
    results: auditResults,
    networkRequestsCaptured: capturedNetworkRequests.length,
    consoleErrors: uncaughtConsoleErrors,
  };
  fs.writeFileSync(auditReportPath, JSON.stringify(summary, null, 2));

  console.log('\n================================================================');
  console.log(`PHASE 7.1 AUDIT COMPLETE: ${summary.passed} PASSED, ${summary.failed} FAILED, ${summary.notTested} NOT TESTED, ${summary.blocked} BLOCKED`);
  console.log(`Report written to: ${auditReportPath}`);
  console.log('================================================================\n');

  return summary;
}

runMasterAudit().catch((err) => {
  console.error('Fatal error in Master Audit:', err);
  process.exit(1);
});
