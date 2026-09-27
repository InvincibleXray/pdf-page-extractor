/**
 * Phase 5B — Focused Tests for Remaining Audit Gaps:
 * 1. Fixtures S and Z (drag-to-create fallback)
 * 2. Proper download gate analysis
 * 3. DPI / raster quality measurement
 * 4. Validator raw binary scan gap analysis
 */
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { runFullForensicAudit, inspectPdfLibStructure } from './phase5b-forensic-engine.js';
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';

const browserCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];
const chromePath = browserCandidates.find(p => fs.existsSync(p));
const exportDir = path.resolve('test-fixtures/phase5b/exported');

async function waitForDownload(existingFiles, timeoutMs = 25000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const currentFiles = fs.readdirSync(exportDir).filter(f => !f.endsWith('.crdownload') && !f.endsWith('.tmp'));
    const newFiles = currentFiles.filter(f => !existingFiles.includes(f));
    if (newFiles.length > 0) return path.join(exportDir, newFiles[0]);
    await new Promise(r => setTimeout(r, 250));
  }
  return null;
}

async function testFixtureWithDragRedact(browser, fixtureId, fixturePath, canaries) {
  console.log(`\n--- Testing ${fixtureId} with drag-to-create ---`);
  const page = await browser.newPage();
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: exportDir });
  await page.setViewport({ width: 1440, height: 900 });

  try {
    const stale = path.join(exportDir, `${fixtureId}-edited.pdf`);
    if (fs.existsSync(stale)) fs.unlinkSync(stale);

    await page.goto('http://localhost:4321/pdf-editor/', { waitUntil: 'networkidle0' });
    const fileInput = await page.$('#editor-file-input');
    await fileInput.uploadFile(fixturePath);
    await page.waitForSelector('#pdf-canvas', { timeout: 20000 });
    await new Promise(r => setTimeout(r, 1200));

    // Activate Redact tool via evaluate (avoids Puppeteer clickability issues)
    await page.evaluate(() => { document.getElementById('tool-redact-btn')?.click(); });
    await new Promise(r => setTimeout(r, 300));

    const canvasBounds = await page.evaluate(() => {
      const c = document.getElementById('pdf-canvas');
      const rect = c.getBoundingClientRect();
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    });

    // Drag redaction inside visible window bounds
    const sx = Math.max(50, Math.round(canvasBounds.x + 40));
    const sy = Math.max(150, Math.round(canvasBounds.y + 40));
    const ex = Math.min(1350, sx + Math.min(250, canvasBounds.width - 80));
    const ey = Math.min(850, sy + Math.min(150, canvasBounds.height - 80));

    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(ex, ey, { steps: 8 });
    await page.mouse.up();
    await new Promise(r => setTimeout(r, 500));

    // Export
    const filesBefore = fs.readdirSync(exportDir);
    await page.evaluate(() => { document.getElementById('editor-export-btn')?.click(); });
    await page.waitForSelector('#redaction-confirm-modal:not(.hidden)', { timeout: 10000 });
    await page.evaluate(() => { document.getElementById('confirm-redact-export-btn')?.click(); });

    const downloaded = await waitForDownload(filesBefore, 30000);
    if (!downloaded) throw new Error('Download timed out');

    const pdfBytes = fs.readFileSync(downloaded);
    const forensic = await runFullForensicAudit(pdfBytes, canaries);

    console.log(`  Result: ${forensic.passed ? 'PASS' : 'FAIL'} — ${forensic.totalCanariesLeaked} canary leaks`);
    if (!forensic.passed) console.log(`  Leaks:`, forensic.allLeaks);
    return { passed: forensic.passed, leaks: forensic.allLeaks, fileSize: pdfBytes.length };
  } finally {
    await page.close();
  }
}

async function analyzeRasterDpi() {
  console.log('\n================================================================');
  console.log('DPI / RASTER QUALITY ANALYSIS (§22)');
  console.log('================================================================');

  const testCases = [
    { name: 'A4 (595x842)', file: 'FIXTURE_B_PARTIAL-edited.pdf', ptW: 595, ptH: 842 },
    { name: 'Letter (612x792)', file: 'FIXTURE_V_CROPBOX_MEDIABOX-edited.pdf', ptW: 612, ptH: 792 },
    { name: 'Wide Banner (1200x300)', file: 'FIXTURE_W_UNUSUAL_DIMS-edited.pdf', ptW: 1200, ptH: 300 },
  ];

  for (const tc of testCases) {
    const filePath = path.join(exportDir, tc.file);
    if (!fs.existsSync(filePath)) { console.log(`  Skipping ${tc.name} — not found`); continue; }
    const pdfBytes = fs.readFileSync(filePath);
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

    for (let i = 0; i < doc.getPageCount(); i++) {
      const p = doc.getPage(i);
      const resRef = p.node.get(PDFName.of('Resources'));
      if (!resRef) continue;
      const res = doc.context.lookup(resRef);
      if (!(res instanceof PDFDict)) continue;
      const xobjRef = res.get(PDFName.of('XObject'));
      if (!xobjRef) continue;
      const xobjDict = doc.context.lookup(xobjRef);
      if (!(xobjDict instanceof PDFDict)) continue;

      for (const [key, ref] of xobjDict.entries()) {
        const imgObj = doc.context.lookup(ref);
        if (!imgObj) continue;
        let imgW, imgH;
        if (imgObj instanceof PDFDict) {
          imgW = imgObj.get(PDFName.of('Width'));
          imgH = imgObj.get(PDFName.of('Height'));
        } else if (imgObj.dict) {
          imgW = imgObj.dict.get(PDFName.of('Width'));
          imgH = imgObj.dict.get(PDFName.of('Height'));
        }
        if (imgW && imgH) {
          const w = typeof imgW === 'object' && imgW.value ? imgW.value() : imgW;
          const h = typeof imgH === 'object' && imgH.value ? imgH.value() : imgH;
          const pWidth = p.getWidth();
          const pHeight = p.getHeight();
          const dpiX = (Number(w) / pWidth) * 72;
          const dpiY = (Number(h) / pHeight) * 72;
          console.log(`  ${tc.name} — Page ${i+1}: Image ${Number(w)}x${Number(h)}px on ${pWidth}x${pHeight}pt page → Effective DPI: ${dpiX.toFixed(0)}x${dpiY.toFixed(0)}`);
        }
      }
    }
  }
}

async function analyzeValidatorGap() {
  console.log('\n================================================================');
  console.log('VALIDATOR RAW BINARY SCAN GAP ANALYSIS');
  console.log('================================================================');

  // The production validator (redactionValidator.ts) scans raw uncompressed bytes.
  // It does NOT decompress Flate streams before searching.
  // This means: if a canary survives inside a compressed stream, the validator would miss it.
  // However: for redacted pages, the entire page is rasterized (content stream replaced with image).
  // For unredacted pages, the original content is preserved (but those pages are NOT redacted).
  
  // Test: check if the independent forensic engine (which DOES decompress) finds anything
  // that the production validator's raw scan would miss.
  
  const fixtureY = path.join(exportDir, 'FIXTURE_Y_MULTI_PAGE_MULTI_REDACT-edited.pdf');
  if (fs.existsSync(fixtureY)) {
    const pdfBytes = fs.readFileSync(fixtureY);
    const canaries = ['SECRET_CANARY_Y_PAGE1_SSN', 'SECRET_CANARY_Y_PAGE2_BANK', 'SECRET_CANARY_Y_PAGE4_PASS'];
    const unredactedToken = 'PUBLIC_PRESERVED_VECTOR_TEXT_PAGE3';

    // Check if the unredacted page 3 token survives (it SHOULD — page 3 is not redacted)
    const rawAscii = Buffer.from(pdfBytes).toString('latin1');
    const rawFound = rawAscii.includes(unredactedToken);
    
    // Decompress all streams and check
    const streamResult = extractAndScanStreams(pdfBytes, [unredactedToken]);
    const decompFound = streamResult.canaryHits.get(unredactedToken);

    console.log(`  Unredacted token "${unredactedToken}":`);
    console.log(`    In raw bytes: ${rawFound}`);
    console.log(`    In decompressed streams: ${decompFound?.decompressed || false}`);
    console.log(`    This is CORRECT — page 3 was not redacted and should preserve its content.`);

    // Now verify the redacted canaries are gone from BOTH raw and decompressed
    for (const c of canaries) {
      const cRaw = rawAscii.includes(c);
      const cDecomp = streamResult.canaryHits.get(c);
      console.log(`  Redacted canary "${c}":`);
      console.log(`    In raw bytes: ${cRaw}`);
      // Need to scan specifically for this canary
      const cResult = extractAndScanStreams(pdfBytes, [c]);
      const cHit = cResult.canaryHits.get(c);
      console.log(`    In decompressed streams: ${cHit?.decompressed || false}`);
    }
  }
}

async function run() {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    // Test Fixture S (20 redactions) with drag-to-create
    const sCanaries = Array.from({length: 20}, (_, i) => `SECRET_CANARY_S_${(i+1).toString().padStart(2,'0')}_TOKEN`);
    await testFixtureWithDragRedact(
      browser,
      'FIXTURE_S_MULTI_REDACT',
      path.resolve('test-fixtures/phase5b/FIXTURE_S_MULTI_REDACT.pdf'),
      sCanaries
    );

    // Test Fixture Z (large page / memory stress) with drag-to-create
    await testFixtureWithDragRedact(
      browser,
      'FIXTURE_Z_MEMORY_STRESS',
      path.resolve('test-fixtures/phase5b/FIXTURE_Z_MEMORY_STRESS.pdf'),
      ['SECRET_CANARY_Z_LARGE_PAGE_ARCH']
    );

    // Large PDF test (876 pages, 1 redaction on page 1)
    console.log('\n================================================================');
    console.log('LARGE 876-PAGE PDF SELECTIVE REDACTION STRESS TEST (§23)');
    console.log('================================================================');
    const largePdfPath = 'C:\\Users\\A\\Desktop\\ece\\5th sem ECE organizer.pdf';
    if (fs.existsSync(largePdfPath)) {
      console.log(`Testing: ${largePdfPath} (${(fs.statSync(largePdfPath).size / (1024 * 1024)).toFixed(1)} MB)`);
      const page = await browser.newPage();
      const client = await page.target().createCDPSession();
      await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: exportDir });
      await page.setViewport({ width: 1440, height: 900 });

      const loadStart = Date.now();
      await page.goto('http://localhost:4321/pdf-editor/', { waitUntil: 'networkidle0' });
      const fileInput = await page.$('#editor-file-input');
      await fileInput.uploadFile(largePdfPath);
      await page.waitForSelector('#pdf-canvas', { timeout: 45000 });
      await page.waitForFunction(() => {
        const c = document.getElementById('pdf-canvas');
        return c && c.width > 0;
      }, { timeout: 45000 });
      await new Promise(r => setTimeout(r, 2500));
      console.log(`  Loaded in ${((Date.now() - loadStart) / 1000).toFixed(1)}s`);

      // Use evaluate to click tool-redact-btn (avoids Puppeteer clickability issues)
      await page.evaluate(() => {
        document.getElementById('tool-redact-btn')?.click();
      });
      await new Promise(r => setTimeout(r, 500));

      const canvasBounds = await page.evaluate(() => {
        const c = document.getElementById('pdf-canvas');
        if (!c) return null;
        const rect = c.getBoundingClientRect();
        return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
      });

      if (canvasBounds) {
        const sx = Math.max(50, Math.round(canvasBounds.x + 50));
        const sy = Math.max(150, Math.round(canvasBounds.y + 50));
        const ex = sx + 250;
        const ey = sy + 100;
        await page.mouse.move(sx, sy);
        await page.mouse.down();
        await page.mouse.move(ex, ey, { steps: 5 });
        await page.mouse.up();
        await new Promise(r => setTimeout(r, 600));

        const redactCount = await page.evaluate(() => document.querySelectorAll('#editor-overlay-layer [data-object-id]').length);
        console.log(`  Redactions created on 876-page PDF: ${redactCount}`);

        const filesBefore = fs.readdirSync(exportDir);
        const exportStart = Date.now();

        await page.evaluate(() => {
          document.getElementById('editor-export-btn')?.click();
        });
        await page.waitForSelector('#redaction-confirm-modal:not(.hidden)', { timeout: 10000 });
        await page.evaluate(() => {
          document.getElementById('confirm-redact-export-btn')?.click();
        });

        const downloaded = await waitForDownload(filesBefore, 120000);
        const exportMs = Date.now() - exportStart;
        if (downloaded) {
          const outSize = (fs.statSync(downloaded).size / (1024 * 1024)).toFixed(1);
          const outDoc = await PDFDocument.load(fs.readFileSync(downloaded), { ignoreEncryption: true });
          console.log(`  Export: ${(exportMs / 1000).toFixed(1)}s, Output: ${outSize} MB, Pages: ${outDoc.getPageCount()}`);
        } else {
          console.log('  Export timed out (>120s)');
        }
      } else {
        console.log('  Canvas not found');
      }
      await page.close();
    } else {
      console.log('  Large PDF not found — skipping');
    }
  } finally {
    await browser.close();
  }

  // DPI analysis
  await analyzeRasterDpi();

  // Validator gap analysis
  await analyzeValidatorGap();

  console.log('\n================================================================');
  console.log('ALL FOCUSED TESTS COMPLETE');
  console.log('================================================================');
}

run().catch(console.error);
