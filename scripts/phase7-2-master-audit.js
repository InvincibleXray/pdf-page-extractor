/**
 * PHASE 7.2 — RELEASE BLOCKER REMEDIATION & FINAL CLEAN-ROOM VERIFICATION MASTER AUDIT
 * 
 * Tests the entire application against the PRODUCTION PREVIEW BUILD (http://127.0.0.1:4321)
 * and rigorously gathers empirical evidence for all release criteria and the 3 remediated blockers.
 */

import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PDFDocument, PDFName, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { verifyPdfForensics, PHASE72_CANARY } from './phase7-2-independent-verifier.js';

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

const prodBaseUrl = 'http://127.0.0.1:4321';
const downloadDir = path.resolve('test-fixtures/phase7-2-downloads');
const screenshotDir = 'C:\\Users\\A\\.gemini\\antigravity\\brain\\7fd15cee-732e-4287-b99e-7575b7470022\\qa_screenshots\\phase7-2';
const realLargePdfPath = 'C:\\Users\\A\\Desktop\\ece\\5th sem ECE organizer.pdf';
const dedicatedCanary = PHASE72_CANARY;

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
  const initialFiles = existingFiles || [];
  while (Date.now() - start < timeoutMs) {
    const currentFiles = fs.readdirSync(downloadDir).filter((f) => !f.endsWith('.crdownload') && !f.endsWith('.tmp'));
    const newFiles = currentFiles.filter((f) => !initialFiles.includes(f));
    if (newFiles.length > 0) {
      const fullPath = path.join(downloadDir, newFiles[0]);
      if (fs.existsSync(fullPath)) {
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
  console.log('STARTING PHASE 7.2 RELEASE BLOCKER REMEDIATION & FINAL AUDIT');
  console.log(`Target: ${prodBaseUrl} (Astro Production Preview)`);
  console.log(`Browser: ${chromePath}`);
  console.log(`Canary: ${dedicatedCanary}`);
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
    // SECTION 1: ROUTE INVENTORY & BASELINE
    // =========================================================================
    console.log('\n--- SECTION 1: Route Inventory & Metadata ---');

    // 1.1 Extractor Route `/`
    const r1 = await page.goto(`${prodBaseUrl}/`, { waitUntil: 'networkidle0' });
    const r1Status = r1.status();
    const r1Meta = await page.evaluate(() => {
      return {
        title: document.title,
        desc: document.querySelector('meta[name="description"]')?.getAttribute('content'),
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
        viewport: document.querySelector('meta[name="viewport"]')?.getAttribute('content'),
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
      name: 'Extractor Route Metadata & Viewport',
      area: 'SEO Technical',
      passed: !!r1Meta.title && !!r1Meta.desc && !!r1Meta.viewport,
      details: `Title: "${r1Meta.title}", Canonical: "${r1Meta.canonical}"`,
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
      id: 'SEO-02',
      name: 'Editor Route Metadata & Canonicals',
      area: 'SEO Technical',
      passed: !!r2Meta.title && !!r2Meta.desc && !!r2Meta.viewport,
      details: `Title: "${r2Meta.title}", Canonical: "${r2Meta.canonical}"`,
    });

    // =========================================================================
    // SECTION 2: BLOCKER A VERIFICATION — MOBILE HORIZONTAL OVERFLOW
    // =========================================================================
    console.log('\n--- SECTION 2: Blocker A Verification — Mobile Horizontal Overflow ---');
    const mobileViewports = [320, 360, 390, 430];
    let r1MobileOverflowCount = 0;
    let r2MobileOverflowCount = 0;

    // Check Route /
    await page.goto(`${prodBaseUrl}/`, { waitUntil: 'networkidle0' });
    for (const w of mobileViewports) {
      await page.setViewport({ width: w, height: 700 });
      await new Promise((r) => setTimeout(r, 200));
      const hasOverflow = await page.evaluate(() => {
        const docEl = document.documentElement;
        const b = document.body;
        return docEl.scrollWidth > window.innerWidth || (b && b.scrollWidth > window.innerWidth);
      });
      if (hasOverflow) r1MobileOverflowCount++;
      await page.screenshot({ path: path.join(screenshotDir, `blockerA_extractor_${w}.png`) });
    }

    // Check Route /pdf-editor/
    await page.goto(`${prodBaseUrl}/pdf-editor/`, { waitUntil: 'networkidle0' });
    for (const w of mobileViewports) {
      await page.setViewport({ width: w, height: 700 });
      await new Promise((r) => setTimeout(r, 200));
      const hasOverflow = await page.evaluate(() => {
        const docEl = document.documentElement;
        const b = document.body;
        return docEl.scrollWidth > window.innerWidth || (b && b.scrollWidth > window.innerWidth);
      });
      if (hasOverflow) r2MobileOverflowCount++;
      await page.screenshot({ path: path.join(screenshotDir, `blockerA_editor_${w}.png`) });
    }

    recordAudit({
      id: 'BLOCKER-A-01',
      name: 'Mobile Horizontal Overflow Remediation on Extractor Route "/"',
      area: 'Blocker A Remediation',
      passed: r1MobileOverflowCount === 0,
      details: `Tested viewports: [320, 360, 390, 430px]. Overflows: ${r1MobileOverflowCount}`,
    });

    recordAudit({
      id: 'BLOCKER-A-02',
      name: 'Mobile Horizontal Overflow Remediation on Editor Route "/pdf-editor/"',
      area: 'Blocker A Remediation',
      passed: r2MobileOverflowCount === 0,
      details: `Tested viewports: [320, 360, 390, 430px]. Overflows: ${r2MobileOverflowCount}`,
    });

    // Reset viewport to desktop
    await page.setViewport({ width: 1440, height: 900 });

    // =========================================================================
    // SECTION 3: BLOCKER B VERIFICATION — ACCESSIBLE NAMES ON INTERACTIVE CONTROLS
    // =========================================================================
    console.log('\n--- SECTION 3: Blocker B Verification — Interactive Controls Accessible Names ---');
    
    // Helper to evaluate unlabeled controls
    async function auditA11yControls(p) {
      return await p.evaluate(() => {
        const interactive = Array.from(document.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]'));
        const unlabeled = [];
        for (const el of interactive) {
          if (el.offsetParent === null && el.offsetWidth === 0 && el.offsetHeight === 0 && !el.id.includes('file-input')) {
            continue;
          }
          const ariaLabel = el.getAttribute('aria-label');
          const ariaLabelledby = el.getAttribute('aria-labelledby');
          const title = el.getAttribute('title');
          const text = el.innerText || el.textContent || '';
          const placeholder = el.getAttribute('placeholder');
          const value = (el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit')) ? el.value : '';

          let hasName = false;
          if (ariaLabel && ariaLabel.trim().length > 0) hasName = true;
          else if (ariaLabelledby && document.getElementById(ariaLabelledby)) hasName = true;
          else if (title && title.trim().length > 0) hasName = true;
          else if (text && text.trim().length > 0) hasName = true;
          else if (placeholder && placeholder.trim().length > 0) hasName = true;
          else if (value && value.trim().length > 0) hasName = true;
          else if (el.tagName === 'INPUT' && (el.type === 'file' || el.type === 'range' || el.type === 'checkbox' || el.type === 'radio' || el.type === 'color')) {
            const id = el.id;
            if (id && document.querySelector(`label[for="${id}"]`)) hasName = true;
            if (el.closest('label')) hasName = true;
          }

          if (!hasName) {
            unlabeled.push({
              tag: el.tagName,
              id: el.id,
              className: el.className ? el.className.toString().slice(0, 40) : '',
            });
          }
        }
        return { total: interactive.length, unlabeled };
      });
    }

    await page.goto(`${prodBaseUrl}/`, { waitUntil: 'networkidle0' });
    const r1A11y = await auditA11yControls(page);

    await page.goto(`${prodBaseUrl}/pdf-editor/`, { waitUntil: 'networkidle0' });
    const r2A11y = await auditA11yControls(page);

    recordAudit({
      id: 'BLOCKER-B-01',
      name: 'Accessible Names on Extractor Route "/" Interactive Controls',
      area: 'Blocker B Remediation',
      passed: r1A11y.unlabeled.length === 0,
      details: `Total: ${r1A11y.total}, Unlabeled: ${r1A11y.unlabeled.length}`,
    });

    recordAudit({
      id: 'BLOCKER-B-02',
      name: 'Accessible Names on Editor Route "/pdf-editor/" Interactive Controls',
      area: 'Blocker B Remediation',
      passed: r2A11y.unlabeled.length === 0,
      details: `Total: ${r2A11y.total}, Unlabeled: ${r2A11y.unlabeled.length}`,
    });

    // =========================================================================
    // SECTION 4: BLOCKER C VERIFICATION — SVG PATH & CONSOLE STABILITY
    // =========================================================================
    console.log('\n--- SECTION 4: Blocker C Verification — SVG Path & Console Stability ---');

    // Load sample and test pen tool drawing
    await page.click('#editor-sample-btn');
    await page.waitForFunction(() => !document.getElementById('editor-workspace-view')?.classList.contains('hidden'), { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 800));

    // Select Pen tool and create a stroke
    await page.click('[data-tool="pen"]');
    await new Promise((r) => setTimeout(r, 200));

    // Simulate drag to draw pen path
    const canvasBounds = await page.evaluate(() => {
      const c = document.getElementById('pdf-canvas');
      const r = c.getBoundingClientRect();
      return { x: r.left + 50, y: r.top + 50 };
    });

    await page.mouse.move(canvasBounds.x, canvasBounds.y);
    await page.mouse.down();
    await page.mouse.move(canvasBounds.x + 40, canvasBounds.y + 30);
    await page.mouse.move(canvasBounds.x + 80, canvasBounds.y + 60);
    await page.mouse.up();
    await new Promise((r) => setTimeout(r, 400));

    // Check SVG paths in DOM for undefined or NaN
    const svgPathAudit = await page.evaluate(() => {
      const paths = Array.from(document.querySelectorAll('path'));
      const invalidPaths = paths.filter((p) => {
        const d = p.getAttribute('d');
        return !d || d.includes('undefined') || d.includes('NaN');
      });
      return {
        totalPaths: paths.length,
        invalidCount: invalidPaths.length,
      };
    });

    recordAudit({
      id: 'BLOCKER-C-01',
      name: 'Zero Invalid SVG Path Attributes (path d="undefined" / NaN)',
      area: 'Blocker C Remediation',
      passed: svgPathAudit.invalidCount === 0,
      details: `Total paths: ${svgPathAudit.totalPaths}, Invalid paths: ${svgPathAudit.invalidCount}`,
    });

    // =========================================================================
    // SECTION 5: REAL BROWSER EXTRACTOR ACCEPTANCE
    // =========================================================================
    console.log('\n--- SECTION 5: Real Browser Extractor Acceptance ---');
    await page.goto(`${prodBaseUrl}/`, { waitUntil: 'networkidle0' });

    const extractorFixturePath = path.resolve('test-fixtures/phase7-2-extractor-fixture.pdf');
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

    const extractorFileInput = await page.$('#file-input');
    await extractorFileInput.uploadFile(extractorFixturePath);

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

    // Extract pages 1 and 3
    await page.click('#mode-individual-btn');
    await page.evaluate(() => {
      const inp = document.getElementById('individual-pages-input');
      if (inp) {
        inp.value = '1, 3';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await new Promise((r) => setTimeout(r, 400));

    clearDownloadDir();
    await page.click('#extract-btn');
    const downloadedExtract = await waitForNewDownload(null, 20000);

    recordAudit({
      id: 'EXTRACT-02',
      name: 'Extractor Client-Side Real File Download',
      area: 'Extractor Acceptance',
      passed: !!downloadedExtract,
      details: downloadedExtract ? `File: ${path.basename(downloadedExtract)} (${fs.statSync(downloadedExtract).size} bytes)` : 'Failed',
    });

    if (downloadedExtract) {
      const extractBytes = fs.readFileSync(downloadedExtract);
      const extDoc = await PDFDocument.load(extractBytes);
      recordAudit({
        id: 'EXTRACT-03',
        name: 'Extractor Output Integrity & Page Count',
        area: 'Extractor Output',
        passed: extDoc.getPageCount() === 2,
        details: `Expected 2 pages, got: ${extDoc.getPageCount()}`,
      });
    }

    // =========================================================================
    // SECTION 6: FORENSIC CANARY REDACTION TEST (10 VECTORS)
    // =========================================================================
    console.log('\n--- SECTION 6: Forensic Canary Redaction Test (10 Vectors) ---');
    await page.goto(`${prodBaseUrl}/pdf-editor/`, { waitUntil: 'networkidle0' });

    // Generate Canary PDF Fixture
    const canaryFixturePath = path.resolve('test-fixtures/phase7-2-canary-fixture.pdf');
    {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.HelveticaBold);
      const p = doc.addPage([595, 842]);
      p.drawText('CONFIDENTIAL CONTRACT - FORENSIC CANARY VERIFICATION', { x: 50, y: 780, size: 14, font });
      p.drawText(`Secret Code: ${dedicatedCanary}`, { x: 50, y: 720, size: 12, font });
      p.drawText('Public Information: Retained in full.', { x: 50, y: 650, size: 12 });
      fs.writeFileSync(canaryFixturePath, await doc.save());
    }

    const editorFileInput = await page.$('#editor-file-input');
    await editorFileInput.uploadFile(canaryFixturePath);

    await page.waitForFunction(() => {
      const ws = document.getElementById('editor-workspace-view');
      const canvas = document.getElementById('pdf-canvas');
      return ws && !ws.classList.contains('hidden') && canvas && canvas.width > 0;
    }, { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 800));

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
    await new Promise((r) => setTimeout(r, 600));

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
      name: 'Sanitized Redaction PDF Real Browser Download',
      area: 'Redaction Export',
      passed: !!downloadedRedactedPdf,
      details: downloadedRedactedPdf ? path.basename(downloadedRedactedPdf) : 'Failed',
    });

    if (downloadedRedactedPdf) {
      const forensicReport = await verifyPdfForensics(downloadedRedactedPdf, {
        forbiddenCanaries: [dedicatedCanary],
        requireSingleRevision: true,
        requireSanitizedMetadata: true,
      });

      recordAudit({
        id: 'REDACT-02',
        name: 'Forensic Canary Obliteration across 10 Vectors',
        area: 'Forensic Redaction',
        passed: forensicReport.passedForensicGates,
        details: forensicReport.passedForensicGates
          ? `All 10 vectors passed. 0 leaks of "${dedicatedCanary}".`
          : `Failures: ${forensicReport.failureReasons.join('; ')}`,
      });

      for (const [vecName, vecRes] of Object.entries(forensicReport.vectorAudit)) {
        console.log(`  Vector [${vecName}]: ${vecRes.passed ? 'PASS' : 'FAIL'} (${vecRes.details})`);
      }
    }

    // =========================================================================
    // SECTION 7: ACROFORM INTERACTIVE & FLATTENED REAL EXPORT
    // =========================================================================
    console.log('\n--- SECTION 7: AcroForm Interactive & Flattened Real Export ---');
    const fixtureAPath = path.resolve('test-fixtures/phase6a/FIXTURE_A_SINGLE_TEXT.pdf');

    await page.goto(`${prodBaseUrl}/pdf-editor/`, { waitUntil: 'networkidle0' });
    const formInput = await page.$('#editor-file-input');
    await formInput.uploadFile(fixtureAPath);

    await page.waitForFunction(() => {
      const ws = document.getElementById('editor-workspace-view');
      return ws && !ws.classList.contains('hidden');
    }, { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 800));

    // Update form field
    await page.evaluate(() => {
      const store = window.__PDF_FORM_STORE__;
      if (store) store.setFieldValue('applicant.firstName', 'Phase 7.2 Verified');
    });
    await new Promise((r) => setTimeout(r, 400));

    // Mode A: Interactive Form Export
    clearDownloadDir();
    await page.click('#editor-export-btn');
    await page.waitForSelector('#form-export-mode-modal:not(.hidden)', { timeout: 6000 });
    await page.click('#export-mode-interactive-btn');

    const downloadedInteractivePdf = await waitForNewDownload(null, 25000);
    recordAudit({
      id: 'FORM-01',
      name: 'Mode A Interactive Form Real Export Download',
      area: 'Form Export Mode A',
      passed: !!downloadedInteractivePdf,
      details: downloadedInteractivePdf ? path.basename(downloadedInteractivePdf) : 'Failed',
    });

    if (downloadedInteractivePdf) {
      const modeAReport = await verifyPdfForensics(downloadedInteractivePdf, {
        mustHaveAcroForm: true,
      });
      recordAudit({
        id: 'FORM-02',
        name: 'Mode A AcroForm Catalog & Updated Value Integrity',
        area: 'Form Forensics',
        passed: modeAReport.hasAcroFormCatalog && modeAReport.fieldValues['applicant.firstName'] === 'Phase 7.2 Verified',
        details: `AcroForm present: ${modeAReport.hasAcroFormCatalog}, Value: "${modeAReport.fieldValues['applicant.firstName']}"`,
      });
    }

    // Mode B: Flattened Form Export
    clearDownloadDir();
    await page.click('#editor-export-btn');
    await page.waitForSelector('#form-export-mode-modal:not(.hidden)', { timeout: 6000 });
    await page.click('#export-mode-flattened-btn');

    const downloadedFlattenedPdf = await waitForNewDownload(null, 25000);
    recordAudit({
      id: 'FORM-03',
      name: 'Mode B Flattened Form Real Export Download',
      area: 'Form Export Mode B',
      passed: !!downloadedFlattenedPdf,
      details: downloadedFlattenedPdf ? path.basename(downloadedFlattenedPdf) : 'Failed',
    });

    if (downloadedFlattenedPdf) {
      const modeBReport = await verifyPdfForensics(downloadedFlattenedPdf, {
        mustNotHaveAcroForm: true,
      });
      recordAudit({
        id: 'FORM-04',
        name: 'Mode B Form Flattening Integrity (0 AcroForm & 0 Widgets)',
        area: 'Form Forensics',
        passed: !modeBReport.hasAcroFormCatalog && modeBReport.widgetAnnotationCount === 0,
        details: `AcroForm: ${modeBReport.hasAcroFormCatalog}, Widgets: ${modeBReport.widgetAnnotationCount}`,
      });
    }

    // =========================================================================
    // SECTION 8: LARGE PDF STRESS TEST (876 PAGES, 211.7 MB)
    // =========================================================================
    console.log('\n--- SECTION 8: Large PDF Stress Test (876 Pages) ---');
    recordAudit({
      id: 'LARGE-01',
      name: 'Real 876-Page PDF File Presence',
      area: 'Large PDF',
      passed: fs.existsSync(realLargePdfPath),
      details: `File size: ${(fs.statSync(realLargePdfPath).size / (1024 * 1024)).toFixed(2)} MB`,
    });

    await page.goto(`${prodBaseUrl}/`, { waitUntil: 'networkidle0' });
    const largeInput = await page.$('#file-input');
    const startLargeLoad = Date.now();
    await largeInput.uploadFile(realLargePdfPath);

    await page.waitForFunction(() => {
      const el = document.getElementById('page-count-status');
      return el && el.textContent && el.textContent.includes('876 pages');
    }, { timeout: 60000 });
    const loadDuration = Date.now() - startLargeLoad;

    recordAudit({
      id: 'LARGE-02',
      name: 'Large PDF (876 Pages) Discovered in Extractor',
      area: 'Large PDF & Extractor',
      passed: true,
      details: `Loaded 876 pages in ${(loadDuration / 1000).toFixed(2)}s`,
    });

    // Extract pages 1 and 876
    await page.click('#mode-individual-btn');
    await page.evaluate(() => {
      const inp = document.getElementById('individual-pages-input');
      if (inp) {
        inp.value = '1, 876';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
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
    // SECTION 9: RESPONSIVE & VISUAL QA (8 VIEWPORTS: 320 to 1920px)
    // =========================================================================
    console.log('\n--- SECTION 9: Multi-Viewport Visual QA (8 Viewports) ---');
    const allViewports = [320, 360, 390, 430, 768, 1024, 1440, 1920];
    let totalOverflows = 0;

    await page.goto(`${prodBaseUrl}/`, { waitUntil: 'networkidle0' });
    for (const w of allViewports) {
      await page.setViewport({ width: w, height: 900 });
      await new Promise((r) => setTimeout(r, 200));

      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth;
      });
      if (hasOverflow) totalOverflows++;

      await page.screenshot({ path: path.join(screenshotDir, `responsive_extractor_${w}.png`) });
    }

    await page.goto(`${prodBaseUrl}/pdf-editor/`, { waitUntil: 'networkidle0' });
    for (const w of allViewports) {
      await page.setViewport({ width: w, height: 900 });
      await new Promise((r) => setTimeout(r, 200));

      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth;
      });
      if (hasOverflow) totalOverflows++;

      await page.screenshot({ path: path.join(screenshotDir, `responsive_editor_${w}.png`) });
    }

    recordAudit({
      id: 'RESP-01',
      name: 'Zero Horizontal Overflow across 8 Viewports (320px to 1920px)',
      area: 'Responsive QA',
      passed: totalOverflows === 0,
      details: `16 page/viewport combinations tested. Total overflows: ${totalOverflows}`,
    });

    // Reset viewport
    await page.setViewport({ width: 1440, height: 900 });

    // =========================================================================
    // SECTION 10: NETWORK PRIVACY & STABILITY AUDIT
    // =========================================================================
    console.log('\n--- SECTION 10: Network Privacy & Runtime Stability ---');
    const nonGetRequests = capturedNetworkRequests.filter((r) => r.method !== 'GET');
    const payloadLeaks = capturedNetworkRequests.filter((r) => r.postData && r.postData.length > 0);

    recordAudit({
      id: 'PRIVACY-01',
      name: 'Zero External Document Data Transmission (Network Privacy)',
      area: 'Network Privacy',
      passed: nonGetRequests.length === 0 && payloadLeaks.length === 0,
      details: `Captured external requests: ${capturedNetworkRequests.length}, Non-GET: ${nonGetRequests.length}, Leaked payloads: ${payloadLeaks.length}`,
    });

    recordAudit({
      id: 'STABILITY-01',
      name: 'Zero Uncaught Runtime Console Errors',
      area: 'Runtime Stability',
      passed: uncaughtConsoleErrors.length === 0,
      details: `Uncaught console errors: ${uncaughtConsoleErrors.length}`,
    });

  } finally {
    await browser.close();
  }

  // Save audit results to JSON
  const auditReportPath = path.resolve('phase7-2-audit-results.json');
  const summary = {
    timestamp: new Date().toISOString(),
    totalChecks: auditResults.length,
    passed: auditResults.filter((r) => r.status === 'PASS').length,
    failed: auditResults.filter((r) => r.status === 'FAIL').length,
    results: auditResults,
    networkRequestsCaptured: capturedNetworkRequests.length,
    consoleErrors: uncaughtConsoleErrors,
  };
  fs.writeFileSync(auditReportPath, JSON.stringify(summary, null, 2));

  console.log('\n================================================================');
  console.log(`PHASE 7.2 AUDIT COMPLETE: ${summary.passed} PASSED, ${summary.failed} FAILED / ${summary.totalChecks} TOTAL`);
  console.log(`Report written to: ${auditReportPath}`);
  console.log('================================================================\n');

  return summary;
}

runMasterAudit().catch((err) => {
  console.error('Fatal error in Master Audit:', err);
  process.exit(1);
});
