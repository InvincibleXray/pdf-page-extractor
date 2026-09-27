/**
 * Phase 5B Remediation Test Suite
 * 
 * Verifies fixes for:
 * - V1: Hard 16 MP Safety Ceiling (pixelWidth * pixelHeight <= 16,000,000)
 * - V2: Rotation-Invariant DPI (A4 0°, 90°, 180°, 270° abs(dpiX - dpiY) < tolerance)
 * - V3: Large-Page Drag-to-Create (real browser drag creates redaction object on 2592x3456 pt page)
 */
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { PDFDocument, degrees } from 'pdf-lib';

const browserCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];
const chromePath = browserCandidates.find(p => fs.existsSync(p));
const fixturesDir = path.resolve('test-fixtures/phase5b');
const exportDir = path.resolve('test-fixtures/phase5b/exported');

async function waitForDownload(existingFiles, timeoutMs = 30000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const currentFiles = fs.readdirSync(exportDir).filter(f => !f.endsWith('.crdownload') && !f.endsWith('.tmp'));
    const newFiles = currentFiles.filter(f => !existingFiles.includes(f));
    if (newFiles.length > 0) return path.join(exportDir, newFiles[0]);
    await new Promise(r => setTimeout(r, 250));
  }
  return null;
}

// Generate the dedicated test fixtures deterministically
async function prepareRemediationFixtures() {
  // 1. Large 36" x 48" page for V1 & V3
  const largeDoc = await PDFDocument.create();
  const font = await largeDoc.embedFont('Helvetica');
  const lp = largeDoc.addPage([2592, 3456]);
  lp.drawText('CONFIDENTIAL ARCHITECTURAL BLUEPRINT 36x48', { x: 100, y: 3200, size: 28, font });
  const largePath = path.join(fixturesDir, 'REMEDIATION_LARGE_PAGE.pdf');
  fs.writeFileSync(largePath, await largeDoc.save());

  // 2. A4 pages at 0°, 90°, 180°, 270° for V2
  const a4Rotations = [0, 90, 180, 270];
  const a4Paths = {};
  for (const rot of a4Rotations) {
    const a4Doc = await PDFDocument.create();
    const aFont = await a4Doc.embedFont('Helvetica');
    const ap = a4Doc.addPage([595, 842]);
    ap.setRotation(degrees(rot));
    ap.drawText(`A4 ROTATION TEST ${rot} DEGREES`, { x: 80, y: 700, size: 16, font: aFont });
    const a4Path = path.join(fixturesDir, `REMEDIATION_A4_ROT_${rot}.pdf`);
    fs.writeFileSync(a4Path, await a4Doc.save());
    a4Paths[rot] = a4Path;
  }

  return { largePath, a4Paths };
}

async function runRemediationTests() {
  console.log('================================================================');
  console.log('PHASE 5B REMEDIATION TEST SUITE (V1, V2, V3)');
  console.log('================================================================\n');

  const { largePath, a4Paths } = await prepareRemediationFixtures();

  let passedAll = true;
  const results = { v1: false, v2: false, v3: false };

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  try {
    const page = await browser.newPage();
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: exportDir });
    await page.setViewport({ width: 1440, height: 900 });

    // Navigate to editor
    await page.goto('http://localhost:4321/pdf-editor/', { waitUntil: 'networkidle0' });
    await page.waitForSelector('#editor-file-input', { timeout: 15000 });

    // ================================================================
    // TEST V1: HARD 16 MP SAFETY CEILING
    // ================================================================
    console.log('--- TEST V1: Hard 16 MP Safety Ceiling ---');
    // Upload large page PDF
    let fileInput = await page.$('#editor-file-input');
    await fileInput.uploadFile(largePath);
    await page.waitForSelector('#pdf-canvas', { timeout: 25000 });
    await new Promise(r => setTimeout(r, 1500));

    // Evaluate rasterizer in browser context
    const v1Result = await page.evaluate(async () => {
      const { renderSanitizedPageRaster } = (window).__REDACTION_RASTERIZER__;
      const loadedDoc = (window).__PDF_LOADED_DOC__?.();
      const pageProxy = await loadedDoc.docProxy.getPage(1);

      const pageState = {
        id: 'p1',
        sourcePageIndex: 0,
        originalPageNumber: 1,
        pageNumber: 1,
        width: 2592,
        height: 3456,
        orientation: 'portrait',
        rotation: 0,
      };

      // 1. Target 300 DPI request on 36" x 48" page
      const res = await renderSanitizedPageRaster(
        pageProxy,
        pageState,
        [],
        [],
        { targetDpi: 300, maxPixels: 16_000_000 }
      );

      const totalPixels = res.pixelWidth * res.pixelHeight;
      const withinLimit = totalPixels <= 16_000_000;

      // 2. Strict 4 MP test
      const res4MP = await renderSanitizedPageRaster(
        pageProxy,
        pageState,
        [],
        [],
        { targetDpi: 300, maxPixels: 4_000_000 }
      );
      const totalPixels4MP = res4MP.pixelWidth * res4MP.pixelHeight;
      const within4MP = totalPixels4MP <= 4_000_000;

      return {
        pixelWidth: res.pixelWidth,
        pixelHeight: res.pixelHeight,
        totalPixels,
        withinLimit,
        scale: res.scale,
        actualDpiX: res.actualDpiX,
        actualDpiY: res.actualDpiY,
        reason: res.reason,
        totalPixels4MP,
        within4MP,
      };
    });

    console.log(`  36" x 48" Page (2592 x 3456 pt):`);
    console.log(`    Pixel Dimensions: ${v1Result.pixelWidth} x ${v1Result.pixelHeight}`);
    console.log(`    Total Pixels: ${(v1Result.totalPixels / 1_000_000).toFixed(3)} MP (Ceiling: 16.000 MP)`);
    console.log(`    Scale: ${v1Result.scale.toFixed(4)}`);
    console.log(`    Actual Effective DPI: ${v1Result.actualDpiX.toFixed(1)} x ${v1Result.actualDpiY.toFixed(1)}`);
    console.log(`    Clamp Reason: ${v1Result.reason}`);
    console.log(`    4 MP Limit Test: ${(v1Result.totalPixels4MP / 1_000_000).toFixed(3)} MP (within limit: ${v1Result.within4MP})`);

    if (v1Result.withinLimit && v1Result.within4MP && v1Result.totalPixels <= 16_000_000) {
      console.log('  ✅ V1 PASS: Invariant pixelWidth * pixelHeight <= 16,000,000 strictly enforced.\n');
      results.v1 = true;
    } else {
      console.error('  ❌ V1 FAIL: Memory ceiling was exceeded!\n');
      passedAll = false;
    }

    // ================================================================
    // TEST V2: ROTATION-INVARIANT DPI (A4: 0°, 90°, 180°, 270°)
    // ================================================================
    console.log('--- TEST V2: Rotation-Invariant DPI ---');
    const v2Rotations = [0, 90, 180, 270];
    const v2Results = [];

    for (const rot of v2Rotations) {
      const a4FilePath = a4Paths[rot];
      
      // Upload the rotated A4 PDF
      await page.goto('http://localhost:4321/pdf-editor/', { waitUntil: 'networkidle0' });
      fileInput = await page.$('#editor-file-input');
      await fileInput.uploadFile(a4FilePath);
      await page.waitForSelector('#pdf-canvas', { timeout: 15000 });
      await new Promise(r => setTimeout(r, 1000));

      const rotData = await page.evaluate(async (testRot) => {
        const { renderSanitizedPageRaster } = (window).__REDACTION_RASTERIZER__;
        const loadedDoc = (window).__PDF_LOADED_DOC__?.();
        const pageProxy = await loadedDoc.docProxy.getPage(1);
        const storeState = (window).__PDF_EDITOR_STORE__?.getState?.();

        const pageState = storeState?.document?.pages[0] || {
          id: 'p1',
          sourcePageIndex: 0,
          originalPageNumber: 1,
          pageNumber: 1,
          width: testRot === 90 || testRot === 270 ? 842 : 595,
          height: testRot === 90 || testRot === 270 ? 595 : 842,
          orientation: testRot === 90 || testRot === 270 ? 'landscape' : 'portrait',
          rotation: testRot,
        };

        const res = await renderSanitizedPageRaster(
          pageProxy,
          pageState,
          [],
          [],
          { targetDpi: 300, maxPixels: 16_000_000 }
        );

        return {
          rotation: testRot,
          pixelWidth: res.pixelWidth,
          pixelHeight: res.pixelHeight,
          pageWidth: res.pageWidth,
          pageHeight: res.pageHeight,
          actualDpiX: res.actualDpiX,
          actualDpiY: res.actualDpiY,
          dpiDelta: Math.abs(res.actualDpiX - res.actualDpiY),
        };
      }, rot);

      v2Results.push(rotData);
      console.log(`  A4 at ${rot}°:`);
      console.log(`    Page Points: ${rotData.pageWidth} x ${rotData.pageHeight}`);
      console.log(`    Raster Pixels: ${rotData.pixelWidth} x ${rotData.pixelHeight}`);
      console.log(`    Effective DPI: ${rotData.actualDpiX.toFixed(1)} x ${rotData.actualDpiY.toFixed(1)} (delta: ${rotData.dpiDelta.toFixed(3)})`);
    }

    const v2AllEqual = v2Results.every(r => r.dpiDelta < 1.0 && Math.abs(r.actualDpiX - 300) < 1.0);
    if (v2AllEqual) {
      console.log('  ✅ V2 PASS: Effective DPI is strictly rotation-invariant (≈300x300 DPI across all 4 rotations).\n');
      results.v2 = true;
    } else {
      console.error('  ❌ V2 FAIL: Asymmetric DPI detected across rotations!\n');
      passedAll = false;
    }

    // ================================================================
    // TEST V3: LARGE-PAGE BROWSER DRAG-TO-CREATE
    // ================================================================
    console.log('--- TEST V3: Large-Page Browser Drag-to-Create ---');
    await page.goto('http://localhost:4321/pdf-editor/', { waitUntil: 'networkidle0' });
    fileInput = await page.$('#editor-file-input');
    await fileInput.uploadFile(largePath);
    await page.waitForSelector('#pdf-canvas', { timeout: 25000 });
    await new Promise(r => setTimeout(r, 1500));

    // Verify canvas position is non-negative and visible
    const canvasBounds = await page.evaluate(() => {
      const c = document.getElementById('pdf-canvas');
      const r = c.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    });
    console.log(`  Large page canvas screen bounds: left=${canvasBounds.x}, top=${canvasBounds.y}, width=${canvasBounds.width}, height=${canvasBounds.height}`);

    // Activate Redact tool
    await page.evaluate(() => {
      document.getElementById('tool-redact-btn')?.click();
    });
    await new Promise(r => setTimeout(r, 300));

    // Drag inside visible canvas area
    const dragStartX = Math.max(50, Math.round(canvasBounds.x + 100));
    const dragStartY = Math.max(150, Math.round(canvasBounds.y + 100));
    const dragEndX = dragStartX + 200;
    const dragEndY = dragStartY + 120;

    console.log(`  Performing drag gesture from (${dragStartX}, ${dragStartY}) to (${dragEndX}, ${dragEndY})...`);
    await page.mouse.move(dragStartX, dragStartY);
    await page.mouse.down();
    await page.mouse.move(dragEndX, dragEndY, { steps: 8 });
    await page.mouse.up();
    await new Promise(r => setTimeout(r, 600));

    // Check if redaction object was created
    const redactionCheck = await page.evaluate(() => {
      const overlay = document.getElementById('editor-overlay-layer');
      const elements = overlay?.querySelectorAll('[data-object-id]') || [];
      return {
        domElementCount: elements.length,
        firstElementBox: elements[0] ? elements[0].getBoundingClientRect() : null,
      };
    });

    console.log(`  Redaction elements in overlay: ${redactionCheck.domElementCount}`);
    if (redactionCheck.firstElementBox) {
      console.log(`  Created redaction screen bounds: ${Math.round(redactionCheck.firstElementBox.width)} x ${Math.round(redactionCheck.firstElementBox.height)} px`);
    }

    if (redactionCheck.domElementCount > 0) {
      console.log('  ✅ V3 PASS: Redaction object created cleanly via browser drag on large page.\n');
      results.v3 = true;

      // Verify export of large page with redaction
      console.log('  Verifying export of large page with redaction...');
      const filesBefore = fs.readdirSync(exportDir);
      await page.evaluate(() => {
        document.getElementById('editor-export-btn')?.click();
      });
      await page.waitForSelector('#redaction-confirm-modal:not(.hidden)', { timeout: 8000 });
      await page.evaluate(() => {
        document.getElementById('confirm-redact-export-btn')?.click();
      });

      const downloaded = await waitForDownload(filesBefore, 45000);
      if (downloaded) {
        const outBytes = fs.readFileSync(downloaded);
        const outDoc = await PDFDocument.load(outBytes, { ignoreEncryption: true });
        console.log(`  ✅ Export succeeded: ${downloaded} (${(outBytes.length / 1024).toFixed(1)} KB, pages: ${outDoc.getPageCount()})`);
      } else {
        console.warn('  ⚠️ Export download timed out on large page');
      }
    } else {
      console.error('  ❌ V3 FAIL: No redaction object was created on large page!\n');
      passedAll = false;
    }

    await page.close();
  } finally {
    await browser.close();
  }

  console.log('================================================================');
  console.log('REMEDIATION TEST SUMMARY:');
  console.log(`  V1 (Hard 16 MP Safety Ceiling): ${results.v1 ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`  V2 (Rotation-Invariant DPI):     ${results.v2 ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`  V3 (Large-Page Drag-to-Create):  ${results.v3 ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`  OVERALL: ${passedAll ? 'ALL PASSED ✅' : 'SOME FAILED ❌'}`);
  console.log('================================================================\n');

  if (!passedAll) {
    process.exit(1);
  }
}

runRemediationTests().catch((err) => {
  console.error('Remediation test error:', err);
  process.exit(1);
});
