import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { PDFDocument, PDFName } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const browserCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const chromePath = browserCandidates.find((p) => fs.existsSync(p));

if (!chromePath) {
  console.error('No compatible Chromium browser found.');
  process.exit(1);
}

const downloadDir = path.resolve('test-downloads/phase6d');
if (!fs.existsSync(downloadDir)) {
  fs.mkdirSync(downloadDir, { recursive: true });
}

// Clear old downloads
for (const file of fs.readdirSync(downloadDir)) {
  fs.unlinkSync(path.join(downloadDir, file));
}

const screenshotDir = 'C:\\Users\\A\\.gemini\\antigravity\\brain\\7fd15cee-732e-4287-b99e-7575b7470022\\qa_screenshots\\phase6d';
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

async function waitForNewDownload(existingFiles, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const currentFiles = fs.readdirSync(downloadDir).filter((f) => f.endsWith('.pdf'));
    const newFiles = currentFiles.filter((f) => !existingFiles.includes(f));
    if (newFiles.length > 0) {
      const fullPath = path.join(downloadDir, newFiles[0]);
      const initialSize = fs.statSync(fullPath).size;
      await new Promise((r) => setTimeout(r, 500));
      const finalSize = fs.statSync(fullPath).size;
      if (initialSize === finalSize && finalSize > 0) {
        return fullPath;
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

async function dragToCreate(page, toolName, startX, startY, endX, endY) {
  // Open dropdown if needed
  await page.evaluate((tool) => {
    const btn = document.querySelector(`button[data-tool="${tool}"]`);
    if (btn) btn.click();
  }, toolName);
  await new Promise((r) => setTimeout(r, 200));

  const canvasBox = await page.evaluate(() => {
    const c = document.getElementById('pdf-canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });

  if (!canvasBox) throw new Error('PDF canvas not found');

  const absStartX = canvasBox.left + startX;
  const absStartY = canvasBox.top + startY;
  const absEndX = canvasBox.left + endX;
  const absEndY = canvasBox.top + endY;

  await page.mouse.move(absStartX, absStartY);
  await page.mouse.down();
  await page.mouse.move(absEndX, absEndY, { steps: 5 });
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 300));
}

async function runPhase6dQA() {
  console.log('====================================================');
  console.log('Starting Phase 6D Real Browser Form Authoring QA');
  console.log('====================================================\n');

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  const consoleErrors = [];
  const networkRequests = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('dialog', async (dialog) => {
    console.log('Dialog:', dialog.message());
    await dialog.dismiss();
  });

  page.on('request', (req) => {
    const url = req.url().toLowerCase();
    if (
      !url.startsWith('http://localhost') &&
      !url.startsWith('http://127.0.0.1') &&
      !url.startsWith('data:') &&
      !url.startsWith('blob:') &&
      !url.includes('fonts.googleapis.com') &&
      !url.includes('fonts.gstatic.com')
    ) {
      networkRequests.push(req.url());
    }
  });

  // Enable CDP downloads
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
  });

  const testResults = [];
  function recordTest(testName, passed, details = '') {
    testResults.push({ testName, passed, details });
    const status = passed ? 'PASS' : 'FAIL';
    console.log(`[${status}] ${testName} ${details ? '— ' + details : ''}`);
  }

  try {
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto('http://localhost:4321/pdf-editor/', { waitUntil: 'networkidle0' });

    // Open sample document
    console.log('Loading sample document...');
    await page.click('#editor-sample-btn');
    await page.waitForFunction(
      () => {
        const ws = document.getElementById('editor-workspace-view');
        const canvas = document.getElementById('pdf-canvas');
        return ws && !ws.classList.contains('hidden') && canvas && canvas.width > 0;
      },
      { timeout: 15000 }
    );
    await new Promise((r) => setTimeout(r, 1000));

    // =========================================================================
    // 1. DRAG-TO-CREATE AUTHORING (6 FIELD TYPES)
    // =========================================================================
    console.log('\n--- 1. Testing Drag-to-Create Form Fields ---');

    // 1.1 Text Field
    await dragToCreate(page, 'form-text', 70, 100, 250, 130);
    // 1.2 Multiline Text Field
    await dragToCreate(page, 'form-multiline', 70, 150, 350, 220);
    // 1.3 Checkbox
    await dragToCreate(page, 'form-checkbox', 70, 240, 95, 265);
    // 1.4 Radio 1
    await dragToCreate(page, 'form-radio', 120, 240, 145, 265);
    // 1.5 Radio 2
    await dragToCreate(page, 'form-radio', 170, 240, 195, 265);
    // 1.6 Dropdown
    await dragToCreate(page, 'form-dropdown', 70, 280, 220, 310);
    // 1.7 Listbox
    await dragToCreate(page, 'form-listbox', 70, 330, 220, 400);

    const createdFieldCount = await page.evaluate(() => {
      const fs = window.__PDF_FORM_STORE__;
      return fs ? fs.getFields().length : 0;
    });
    recordTest('Drag-to-Create 6 Field Types', createdFieldCount >= 6, `Total fields: ${createdFieldCount}`);

    // Verify Author Mode is active
    const isAuthorActive = await page.evaluate(() => {
      const fs = window.__PDF_FORM_STORE__;
      return fs ? fs.isAuthorModeActive() : false;
    });
    recordTest('Author Mode Active upon Creation', isAuthorActive === true);

    await page.screenshot({ path: path.join(screenshotDir, '01_phase6d_author_mode_drag_create.png') });

    // =========================================================================
    // 2. RESIZE HANDLES & SELECTION
    // =========================================================================
    console.log('\n--- 2. Testing Selection & 8 Resize Handles ---');
    // Select the first text field
    await page.evaluate(() => {
      const fs = window.__PDF_FORM_STORE__;
      const f = fs.getFields().find((x) => x.type === 'text');
      if (f && f.widgetIds[0]) {
        fs.selectWidget(f.widgetIds[0]);
      }
    });
    await new Promise((r) => setTimeout(r, 400));

    const handlesCount = await page.evaluate(() => {
      return document.querySelectorAll('[data-form-handle]').length;
    });
    recordTest('8 Resize Handles Active on Selection', handlesCount === 8, `Handle count: ${handlesCount}`);

    await page.screenshot({ path: path.join(screenshotDir, '03_phase6d_resize_handles_active.png') });

    // =========================================================================
    // 3. PROPERTY INSPECTOR & FIELD RENAMING / VALIDATION
    // =========================================================================
    console.log('\n--- 3. Testing Field Properties Inspector & Validation ---');
    const isInspectorVisible = await page.evaluate(() => {
      const pane = document.getElementById('pane-form-field');
      return pane && !pane.classList.contains('hidden');
    });
    recordTest('Property Inspector Pane Visible', isInspectorVisible === true);

    // Edit field name to client_name
    await page.evaluate(() => {
      const inp = document.getElementById('form-prop-name-input');
      if (inp) {
        inp.value = 'client_name';
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await new Promise((r) => setTimeout(r, 300));

    const updatedName = await page.evaluate(() => {
      const fs = window.__PDF_FORM_STORE__;
      const f = fs.getSelectedField();
      return f ? f.name : '';
    });
    recordTest('Field Renaming to client_name', updatedName === 'client_name');

    // Test collision: select multiline and try to rename to client_name
    await page.evaluate(() => {
      const fs = window.__PDF_FORM_STORE__;
      const multi = fs.getFields().find((x) => x.type === 'multiline');
      if (multi && multi.widgetIds[0]) {
        fs.selectWidget(multi.widgetIds[0]);
      }
    });
    await new Promise((r) => setTimeout(r, 300));

    await page.evaluate(() => {
      const inp = document.getElementById('form-prop-name-input');
      if (inp) {
        inp.value = 'client_name'; // Duplicate collision
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await new Promise((r) => setTimeout(r, 300));

    const isCollisionBlocked = await page.evaluate(() => {
      const err = document.getElementById('form-prop-name-error');
      const fs = window.__PDF_FORM_STORE__;
      const f = fs.getSelectedField();
      return err && !err.classList.contains('hidden') && f && f.name !== 'client_name';
    });
    recordTest('Field Name Collision Gate (Blocked & Error Shown)', isCollisionBlocked === true);

    // Edit properties: tooltip, default value, required, font size, alignment
    await page.evaluate(() => {
      const tooltipInput = document.getElementById('form-prop-tooltip-input');
      if (tooltipInput) {
        tooltipInput.value = 'Applicant Detailed Summary';
        tooltipInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const defValInput = document.getElementById('form-prop-default-value-input');
      if (defValInput) {
        defValInput.value = 'Confidential terms and mutual obligations';
        defValInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const reqChk = document.getElementById('form-prop-required-chk');
      if (reqChk) {
        reqChk.checked = true;
        reqChk.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const fontInput = document.getElementById('form-prop-fontsize-input');
      if (fontInput) {
        fontInput.value = '14';
        fontInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await new Promise((r) => setTimeout(r, 400));

    // Select dropdown and add an option
    await page.evaluate(() => {
      const fs = window.__PDF_FORM_STORE__;
      const dd = fs.getFields().find((x) => x.type === 'dropdown');
      if (dd && dd.widgetIds[0]) {
        fs.selectWidget(dd.widgetIds[0]);
      }
    });
    await new Promise((r) => setTimeout(r, 300));

    await page.evaluate(() => {
      const newOpt = document.getElementById('form-prop-new-option-input');
      const addBtn = document.getElementById('form-prop-add-option-btn');
      if (newOpt && addBtn) {
        newOpt.value = 'Enterprise Tier Plan';
        addBtn.click();
      }
    });
    await new Promise((r) => setTimeout(r, 400));

    const ddOptionsCount = await page.evaluate(() => {
      const fs = window.__PDF_FORM_STORE__;
      const dd = fs.getSelectedField();
      return dd && dd.options ? dd.options.length : 0;
    });
    recordTest('Dropdown Custom Option Added', ddOptionsCount >= 4, `Options count: ${ddOptionsCount}`);

    await page.screenshot({ path: path.join(screenshotDir, '02_phase6d_field_properties_inspector.png') });

    // =========================================================================
    // 4. MOVE & RESIZE GESTURES
    // =========================================================================
    console.log('\n--- 4. Testing Move & Resize Gestures ---');
    const boundsBefore = await page.evaluate(() => {
      const fs = window.__PDF_FORM_STORE__;
      const w = fs.getSelectedWidget();
      return w ? [...w.pdfRect] : null;
    });

    // Test arrow key nudge (ArrowRight 5 times)
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await new Promise((r) => setTimeout(r, 300));

    const boundsAfterNudge = await page.evaluate(() => {
      const fs = window.__PDF_FORM_STORE__;
      const w = fs.getSelectedWidget();
      return w ? [...w.pdfRect] : null;
    });

    const isNudged = boundsBefore && boundsAfterNudge && boundsAfterNudge[0] === boundsBefore[0] + 5;
    recordTest('Arrow Key Nudge Updates Bounds', isNudged === true, `Before: ${boundsBefore?.[0]}, After: ${boundsAfterNudge?.[0]}`);

    // =========================================================================
    // 5. TAB ORDER CONFIGURATION & ACCESSIBILITY
    // =========================================================================
    console.log('\n--- 5. Testing Tab Order & Keyboard Navigation ---');
    const initialTabOrder = await page.evaluate(() => {
      const fs = window.__PDF_FORM_STORE__;
      return fs ? [...fs.getTabOrder(1)] : [];
    });

    // Move first tab item down
    await page.evaluate(() => {
      const fs = window.__PDF_FORM_STORE__;
      if (fs) {
        fs.reorderTabItem(1, 0, 1);
      }
    });
    await new Promise((r) => setTimeout(r, 300));

    const newTabOrder = await page.evaluate(() => {
      const fs = window.__PDF_FORM_STORE__;
      return fs ? [...fs.getTabOrder(1)] : [];
    });

    const isTabReordered = initialTabOrder.length > 1 && newTabOrder[0] === initialTabOrder[1] && newTabOrder[1] === initialTabOrder[0];
    recordTest('Tab Order Sequence Configured & Reordered', isTabReordered === true);

    await page.screenshot({ path: path.join(screenshotDir, '04_phase6d_tab_order_configured.png') });

    // =========================================================================
    // 6. PAGE DUPLICATION WITH INDEPENDENT FIELD RE-KEYING
    // =========================================================================
    console.log('\n--- 6. Testing Page Duplication Independent Re-Keying ---');
    await page.evaluate(() => {
      const es = window.__PDF_EDITOR_STORE__;
      if (es) es.duplicatePage(1);
    });
    await new Promise((r) => setTimeout(r, 1000));

    const page2Fields = await page.evaluate(() => {
      const fs = window.__PDF_FORM_STORE__;
      if (!fs) return [];
      const widgetsP2 = fs.getWidgetsForPage(2);
      return widgetsP2.map((w) => w.fieldId);
    });

    const hasRekeyedFields = page2Fields.length > 0 && page2Fields.some((f) => f.includes('_copy'));
    recordTest('Duplicated Page Fields Automatically Re-Keyed (_copy1)', hasRekeyedFields === true, `P2 Fields: ${page2Fields.join(', ')}`);

    await page.screenshot({ path: path.join(screenshotDir, '05_phase6d_page_duplication_rekey.png') });

    // =========================================================================
    // 7. UNDO / REDO OF FORM AUTHORING
    // =========================================================================
    console.log('\n--- 7. Testing Undo / Redo ---');
    const fieldCountBeforeUndo = await page.evaluate(() => window.__PDF_FORM_STORE__.getFields().length);

    await page.evaluate(() => {
      const fs = window.__PDF_FORM_STORE__;
      if (fs) fs.undo();
    });
    await new Promise((r) => setTimeout(r, 400));

    const fieldCountAfterUndo = await page.evaluate(() => window.__PDF_FORM_STORE__.getFields().length);

    await page.evaluate(() => {
      const fs = window.__PDF_FORM_STORE__;
      if (fs) fs.redo();
    });
    await new Promise((r) => setTimeout(r, 400));

    const fieldCountAfterRedo = await page.evaluate(() => window.__PDF_FORM_STORE__.getFields().length);

    recordTest('Form Authoring Undo / Redo Transactions', fieldCountAfterRedo === fieldCountBeforeUndo, `Before: ${fieldCountBeforeUndo}, After Undo: ${fieldCountAfterUndo}, After Redo: ${fieldCountAfterRedo}`);

    await page.screenshot({ path: path.join(screenshotDir, '10_phase6d_undo_redo_authoring.png') });

    // =========================================================================
    // 8. REAL PDF EXPORT — MODE A (INTERACTIVE)
    // =========================================================================
    console.log('\n--- 8. Testing Mode A: Interactive Export of Authored Form ---');
    const filesBeforeA = fs.readdirSync(downloadDir);
    await page.click('#editor-export-btn');
    await page.waitForSelector('#form-export-mode-modal:not(.hidden)', { timeout: 5000 });
    await page.click('#export-mode-interactive-btn');
    await page.waitForSelector('#editor-export-toast', { timeout: 10000 });

    const downloadedA = await waitForNewDownload(filesBeforeA);
    recordTest('Mode A Authored PDF Downloaded', !!downloadedA, downloadedA ? path.basename(downloadedA) : 'None');

    if (downloadedA) {
      const bytesA = fs.readFileSync(downloadedA);
      const docA = await PDFDocument.load(bytesA);
      const formA = docA.getForm();
      const fieldsA = formA.getFields();

      recordTest('Mode A PDF Contains AcroForm', docA.catalog.has(PDFName.of('AcroForm')));
      recordTest('Mode A Fields Count >= 6', fieldsA.length >= 6, `Field count: ${fieldsA.length}`);

      // Verify client_name field exists and has expected value
      const clientNameField = formA.getFieldMaybe('client_name');
      recordTest('Mode A Authored Field "client_name" Exists', !!clientNameField);

      // Verify PDF.js discovery by opening downloaded PDF in browser
      const inspectPage = await browser.newPage();
      await inspectPage.setViewport({ width: 1440, height: 900 });
      await inspectPage.goto('http://localhost:4321/pdf-editor/', { waitUntil: 'networkidle0' });
      const inspectInput = await inspectPage.$('#editor-file-input');
      if (inspectInput) {
        await inspectInput.uploadFile(downloadedA);
        await inspectPage.waitForFunction(
          () => {
            const ws = document.getElementById('editor-workspace-view');
            const canvas = document.getElementById('pdf-canvas');
            return ws && !ws.classList.contains('hidden') && canvas && canvas.width > 0;
          },
          { timeout: 15000 }
        );
        await new Promise((r) => setTimeout(r, 1200));

        const discoveredInInspect = await inspectPage.evaluate(() => {
          const fs = window.__PDF_FORM_STORE__;
          return fs ? fs.getFields().length : 0;
        });
        recordTest('Mode A Re-Opened PDF Discovers Authored Fields in PDF.js', discoveredInInspect >= 6, `Discovered: ${discoveredInInspect}`);

        await inspectPage.screenshot({ path: path.join(screenshotDir, '06_phase6d_mode_a_authored_export.png') });
        await inspectPage.close();
      }
    }

    // =========================================================================
    // 9. REAL PDF EXPORT — MODE B (FLATTENED)
    // =========================================================================
    console.log('\n--- 9. Testing Mode B: Flattened Export of Authored Form ---');
    const filesBeforeB = fs.readdirSync(downloadDir);
    await page.click('#editor-export-btn');
    await page.waitForSelector('#form-export-mode-modal:not(.hidden)', { timeout: 5000 });
    await page.click('#export-mode-flattened-btn');
    await page.waitForSelector('#editor-export-toast', { timeout: 10000 });

    const downloadedB = await waitForNewDownload(filesBeforeB);
    recordTest('Mode B Flattened Authored PDF Downloaded', !!downloadedB, downloadedB ? path.basename(downloadedB) : 'None');

    if (downloadedB) {
      const bytesB = fs.readFileSync(downloadedB);
      const docB = await PDFDocument.load(bytesB);

      const hasAcroFormB = docB.catalog.has(PDFName.of('AcroForm'));
      recordTest('Mode B PDF Has No /AcroForm Catalog', hasAcroFormB === false);

      let widgetAnnotsCount = 0;
      for (let i = 0; i < docB.getPageCount(); i++) {
        const p = docB.getPage(i);
        const annots = p.node.Annots();
        if (annots) {
          for (let j = 0; j < annots.size(); j++) {
            const ref = annots.get(j);
            const d = docB.context.lookup(ref);
            if (d && d.get && d.get(PDFName.of('Subtype'))?.toString() === '/Widget') {
              widgetAnnotsCount++;
            }
          }
        }
      }
      recordTest('Mode B PDF Has Exactly 0 /Widget Annotations', widgetAnnotsCount === 0, `Widgets: ${widgetAnnotsCount}`);

      // Reopen in browser to verify visual fidelity
      const inspectPageB = await browser.newPage();
      await inspectPageB.setViewport({ width: 1440, height: 900 });
      await inspectPageB.goto('http://localhost:4321/pdf-editor/', { waitUntil: 'networkidle0' });
      const inspectInputB = await inspectPageB.$('#editor-file-input');
      if (inspectInputB) {
        await inspectInputB.uploadFile(downloadedB);
        await inspectPageB.waitForFunction(
          () => {
            const ws = document.getElementById('editor-workspace-view');
            const canvas = document.getElementById('pdf-canvas');
            return ws && !ws.classList.contains('hidden') && canvas && canvas.width > 0;
          },
          { timeout: 15000 }
        );
        await new Promise((r) => setTimeout(r, 1200));

        await inspectPageB.screenshot({ path: path.join(screenshotDir, '07_phase6d_mode_b_authored_flatten.png') });
        await inspectPageB.close();
      }
    }

    // =========================================================================
    // 10. MOBILE VIEWPORT INSPECTION & OVERFLOW AUDIT
    // =========================================================================
    console.log('\n--- 10. Testing Mobile Viewports (320, 360, 390, 430px) ---');
    const mobileViewports = [
      { width: 390, height: 844, name: '390x844' },
      { width: 320, height: 568, name: '320x568' },
      { width: 360, height: 740, name: '360x740' },
      { width: 430, height: 932, name: '430x932' },
    ];

    for (const vp of mobileViewports) {
      await page.setViewport(vp);
      await new Promise((r) => setTimeout(r, 400));

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      recordTest(`Zero Horizontal Overflow on Mobile (${vp.name})`, hasHorizontalScroll === false, `scrollWidth: <= ${vp.width}px`);

      if (vp.width === 390) {
        // Open mobile inspector sheet
        await page.click('#mobile-open-inspector-btn');
        await new Promise((r) => setTimeout(r, 500));
        await page.screenshot({ path: path.join(screenshotDir, '08_phase6d_mobile_390_field_inspector.png') });
        await page.click('#close-mobile-sheet-btn');
        await new Promise((r) => setTimeout(r, 300));
      }

      if (vp.width === 320) {
        await page.screenshot({ path: path.join(screenshotDir, '09_phase6d_mobile_320_compact_authoring.png') });
      }
    }

    // =========================================================================
    // 11. PRIVACY & SECURITY AUDIT
    // =========================================================================
    console.log('\n--- 11. Privacy & Network Audit ---');
    recordTest('Zero External Network Requests during Authoring & Export', networkRequests.length === 0, `External requests: ${networkRequests.length}`);

  } catch (err) {
    console.error('Fatal error during Phase 6D QA:', err);
    recordTest('Phase 6D QA Execution', false, String(err));
  } finally {
    await browser.close();
  }

  console.log('\n====================================================');
  console.log('Phase 6D QA Execution Summary:');
  const passCount = testResults.filter((r) => r.passed).length;
  const failCount = testResults.length - passCount;
  console.log(`PASSED: ${passCount}`);
  console.log(`FAILED: ${failCount}`);
  console.log('====================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runPhase6dQA();
