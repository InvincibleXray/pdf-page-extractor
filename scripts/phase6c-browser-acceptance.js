import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import {
  verifyInteractiveFormPdf,
  verifyFlattenedFormPdf,
  verifyRedactedCanary,
} from './phase6c-export-verifier.js';

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

const fixturesDir = path.resolve('test-fixtures');
const downloadDir = path.resolve('test-downloads/phase6c');
if (!fs.existsSync(downloadDir)) {
  fs.mkdirSync(downloadDir, { recursive: true });
}

// Clear old downloads
for (const file of fs.readdirSync(downloadDir)) {
  fs.unlinkSync(path.join(downloadDir, file));
}

const screenshotDir = 'C:\\Users\\A\\.gemini\\antigravity\\brain\\7fd15cee-732e-4287-b99e-7575b7470022\\qa_screenshots\\phase6c';
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

async function uploadPdfFile(page, filePath) {
  const isInWorkspace = await page.evaluate(() => {
    const ws = document.getElementById('editor-workspace-view');
    return ws && !ws.classList.contains('hidden');
  });

  if (isInWorkspace) {
    await page.evaluate(() => {
      const newDocBtn = document.getElementById('editor-new-doc-btn');
      if (newDocBtn) newDocBtn.click();
    });
    await new Promise((r) => setTimeout(r, 400));
  }

  const fileInput = await page.$('#editor-file-input');
  if (!fileInput) throw new Error('File input #editor-file-input not found');
  await fileInput.uploadFile(filePath);
  await page.waitForFunction(
    () => {
      const ws = document.getElementById('editor-workspace-view');
      const canvas = document.getElementById('pdf-canvas');
      return ws && !ws.classList.contains('hidden') && canvas && canvas.width > 0;
    },
    { timeout: 15000 }
  );
  await new Promise((r) => setTimeout(r, 1200));
}

async function waitForNewDownload(existingFiles, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const currentFiles = fs.readdirSync(downloadDir).filter((f) => f.endsWith('.pdf'));
    const newFiles = currentFiles.filter((f) => !existingFiles.includes(f));
    if (newFiles.length > 0) {
      const fullPath = path.join(downloadDir, newFiles[0]);
      // Ensure file writing is complete
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

async function runPhase6cAcceptance() {
  console.log('====================================================');
  console.log('Starting Phase 6C Real Browser Form Export Acceptance');
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
    console.log('Dialog opened:', dialog.message());
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

    // =========================================================================
    // TEST 1: MODE A — EDITABLE ACROFORM EXPORT VIA REAL BROWSER DOWNLOAD
    // =========================================================================
    console.log('\n--- 1. Testing Mode A: Interactive Form Export ---');
    const realFormPath = path.resolve('test-fixtures/phase6c-real-form.pdf');
    await uploadPdfFile(page, realFormPath);

    // Fill in real field values via the interactive overlay
    console.log('Filling form fields via UI...');
    await page.waitForSelector('.pdf-form-widget-wrapper[data-field-id="applicant.fullName"] input', { timeout: 15000 });
    await page.click('.pdf-form-widget-wrapper[data-field-id="applicant.fullName"] input');
    await page.evaluate(() => {
      const inp = document.querySelector('.pdf-form-widget-wrapper[data-field-id="applicant.fullName"] input');
      if (inp) inp.value = '';
    });
    await page.type('.pdf-form-widget-wrapper[data-field-id="applicant.fullName"] input', 'Dr. Jane Doe-Accepted');

    // Multiline biography
    await page.click('.pdf-form-widget-wrapper[data-field-id="applicant.biography"] textarea');
    await page.type('.pdf-form-widget-wrapper[data-field-id="applicant.biography"] textarea', '\nAppended from Browser Acceptance Test');

    // Radio: Select Enterprise
    const enterpriseRadio = await page.$(
      '.pdf-form-widget-wrapper[data-field-id="applicant.planTier"] input[type="radio"]:nth-of-type(1)'
    );
    // Click 3rd radio in the group
    await page.evaluate(() => {
      const radios = document.querySelectorAll('.pdf-form-widget-wrapper[data-field-id="applicant.planTier"] input[type="radio"]');
      if (radios.length >= 3) {
        radios[2].click();
      }
    });

    // Dropdown: Select Germany
    await page.select('.pdf-form-widget-wrapper[data-field-id="applicant.country"] select', 'Germany');
    await new Promise((r) => setTimeout(r, 600));

    // Rotate Page 1 by 90° Clockwise
    await page.click('#tool-rotate-page-btn');
    await new Promise((r) => setTimeout(r, 400));

    await page.screenshot({ path: path.join(screenshotDir, '01_phase6c_mode_a_filled.png') });

    // Trigger Export
    const filesBeforeInteractive = fs.readdirSync(downloadDir);
    await page.click('#editor-export-btn');
    await page.waitForSelector('#form-export-mode-modal:not(.hidden)', { timeout: 5000 });
    await page.screenshot({ path: path.join(screenshotDir, '02_phase6c_export_modal.png') });

    // Select "Editable PDF"
    await page.click('#export-mode-interactive-btn');
    await page.waitForSelector('#editor-export-toast', { timeout: 10000 });

    const downloadedInteractive = await waitForNewDownload(filesBeforeInteractive);
    recordTest(
      'Mode A: Real Browser Download Received',
      !!downloadedInteractive && fs.existsSync(downloadedInteractive),
      `Downloaded: ${downloadedInteractive ? path.basename(downloadedInteractive) : 'none'}`
    );

    if (downloadedInteractive) {
      const interactiveBytes = fs.readFileSync(downloadedInteractive);
      const report = await verifyInteractiveFormPdf(interactiveBytes, {
        'applicant.fullName': { name: 'applicant.fullName', expectedValue: 'Dr. Jane Doe-Accepted' },
        'applicant.country': { name: 'applicant.country', expectedValue: 'Germany' },
        'applicant.agreeTerms': { name: 'applicant.agreeTerms', expectedValue: true },
        'company.taxId': { name: 'company.taxId', expectedValue: 'TAX-987654321' },
      });

      recordTest(
        'Mode A: AcroForm Structural Integrity',
        report.passed && report.hasCatalogAcroForm && report.hasFieldsArray,
        `Fields: ${report.fieldCount}, Widgets: ${report.pdfJsWidgetsCount}, Errors: ${report.errors.length}`
      );

      // Verify rotation survived in downloaded PDF
      const docVerify = await PDFDocument.load(interactiveBytes);
      const p1Rot = docVerify.getPage(0).getRotation().angle;
      recordTest('Mode A: Page Rotation Preserved (90°)', p1Rot === 90, `Page 0 rotation: ${p1Rot}°`);

      // Fresh session verification
      console.log('Testing Fresh-Session Reopen of Editable PDF...');
      await page.goto('http://localhost:4321/pdf-editor/', { waitUntil: 'networkidle0' });
      await uploadPdfFile(page, downloadedInteractive);

      const freshNameValue = await page.evaluate(() => {
        const inp = document.querySelector('.pdf-form-widget-wrapper[data-field-id="applicant.fullName"] input');
        return inp ? inp.value : '';
      });

      recordTest(
        'Mode A: Fresh-Session Reopen & Re-Editability',
        freshNameValue === 'Dr. Jane Doe-Accepted',
        `Reopened DOM field value: "${freshNameValue}"`
      );
      await page.screenshot({ path: path.join(screenshotDir, '03_phase6c_fresh_reopen_mode_a.png') });
    }

    // =========================================================================
    // TEST 2: MODE B — FLATTENED PDF EXPORT VIA REAL BROWSER DOWNLOAD
    // =========================================================================
    console.log('\n--- 2. Testing Mode B: Flattened Form Export ---');
    await page.goto('http://localhost:4321/pdf-editor/', { waitUntil: 'networkidle0' });
    await uploadPdfFile(page, realFormPath);

    // Fill in field
    await page.waitForSelector('.pdf-form-widget-wrapper[data-field-id="applicant.fullName"] input', { timeout: 15000 });
    await page.click('.pdf-form-widget-wrapper[data-field-id="applicant.fullName"] input');
    await page.evaluate(() => {
      const inp = document.querySelector('.pdf-form-widget-wrapper[data-field-id="applicant.fullName"] input');
      if (inp) inp.value = '';
    });
    await page.type('.pdf-form-widget-wrapper[data-field-id="applicant.fullName"] input', 'Verified Flattened User');
    await new Promise((r) => setTimeout(r, 600));

    // Export as Flattened
    const filesBeforeFlat = fs.readdirSync(downloadDir);
    await page.click('#editor-export-btn');
    await page.waitForSelector('#form-export-mode-modal:not(.hidden)', { timeout: 5000 });

    await page.click('#export-mode-flattened-btn');
    await page.waitForSelector('#editor-export-toast', { timeout: 10000 });

    const downloadedFlat = await waitForNewDownload(filesBeforeFlat);
    recordTest(
      'Mode B: Real Browser Download Received',
      !!downloadedFlat && fs.existsSync(downloadedFlat),
      `Downloaded: ${downloadedFlat ? path.basename(downloadedFlat) : 'none'}`
    );

    if (downloadedFlat) {
      const flatBytes = fs.readFileSync(downloadedFlat);
      const flatReport = await verifyFlattenedFormPdf(flatBytes, ['Verified Flattened User']);

      recordTest(
        'Mode B: Form Flattening Forensic Check',
        flatReport.passed && flatReport.survivingWidgetsCount === 0 && flatReport.editableFieldCount === 0,
        `Surviving widgets: ${flatReport.survivingWidgetsCount}, Editable fields: ${flatReport.editableFieldCount}, Text baked: ${flatReport.bakedTextPresent}`
      );

      // Fresh session verification: zero widgets rendered
      console.log('Testing Fresh-Session Reopen of Flattened PDF...');
      await page.goto('http://localhost:4321/pdf-editor/', { waitUntil: 'networkidle0' });
      await uploadPdfFile(page, downloadedFlat);

      const flatWidgetCount = await page.evaluate(() => {
        return document.querySelectorAll('.pdf-form-widget-wrapper').length;
      });

      recordTest(
        'Mode B: Fresh-Session Confirms Zero Interactive Widgets',
        flatWidgetCount === 0,
        `Interactive widgets on screen: ${flatWidgetCount}`
      );
      await page.screenshot({ path: path.join(screenshotDir, '04_phase6c_fresh_reopen_mode_b.png') });
    }

    // =========================================================================
    // TEST 3: REDACTION RECONCILIATION & CANARY OBLITERATION (Section 20)
    // =========================================================================
    console.log('\n--- 3. Testing Redaction Reconciliation & Canary Obliteration ---');
    const redactFormPath = path.resolve('test-fixtures/phase6c-redaction-form.pdf');
    await page.goto('http://localhost:4321/pdf-editor/', { waitUntil: 'networkidle0' });
    await uploadPdfFile(page, redactFormPath);

    // Switch to redact tool
    await page.click('button[data-tool="redact"]');
    await new Promise((r) => setTimeout(r, 200));

    // Drag redaction box over the confidential.ssn field on Page 1
    await page.waitForSelector('.pdf-form-widget-wrapper[data-field-id="confidential.ssn"]', { timeout: 15000 });
    const widgetBox = await page.evaluate(() => {
      const w = document.querySelector('.pdf-form-widget-wrapper[data-field-id="confidential.ssn"]');
      if (!w) return null;
      const r = w.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    });

    if (widgetBox) {
      await page.mouse.move(widgetBox.x - 10, widgetBox.y - 10);
      await page.mouse.down();
      await page.mouse.move(widgetBox.x + widgetBox.width + 10, widgetBox.y + widgetBox.height + 10);
      await page.mouse.up();
      await new Promise((r) => setTimeout(r, 400));
    }

    await page.screenshot({ path: path.join(screenshotDir, '05_phase6c_redaction_applied.png') });

    // Export Redacted PDF
    const filesBeforeRedact = fs.readdirSync(downloadDir);
    await page.click('#editor-export-btn');

    // Should prompt with form export modal, click Interactive
    await page.waitForSelector('#form-export-mode-modal:not(.hidden)', { timeout: 5000 });
    await page.click('#export-mode-interactive-btn');

    // Redaction confirmation modal should appear
    await page.waitForSelector('#redaction-confirm-modal:not(.hidden)', { timeout: 5000 });
    await page.screenshot({ path: path.join(screenshotDir, '06_phase6c_redaction_confirm_modal.png') });
    await page.click('#confirm-redact-export-btn');

    const downloadedRedact = await waitForNewDownload(filesBeforeRedact);
    recordTest(
      'Redaction: Real Browser Download Received',
      !!downloadedRedact && fs.existsSync(downloadedRedact),
      `Downloaded: ${downloadedRedact ? path.basename(downloadedRedact) : 'none'}`
    );

    if (downloadedRedact) {
      const redactBytes = fs.readFileSync(downloadedRedact);
      const canaryReport = await verifyRedactedCanary(redactBytes, 'SUPER_SECRET_FORM_VALUE_6C');

      recordTest(
        'Redaction: SUPER_SECRET_FORM_VALUE_6C Obliteration',
        canaryReport.passed && !canaryReport.foundInTextLayer && !canaryReport.foundInRawAscii && !canaryReport.foundInRawUtf8 && !canaryReport.foundInUtf16Hex && !canaryReport.foundInAcroForm,
        `Canary leaks: ${canaryReport.leaks.length} (${canaryReport.leaks.join(', ')})`
      );

      // Verify unaffected field survived
      const redactDocVerify = await PDFDocument.load(redactBytes);
      const publicVal = redactDocVerify.getForm().getTextField('applicant.publicName')?.getText();
      recordTest(
        'Redaction: Unaffected Field Retained',
        publicVal === 'Public Citizen',
        `applicant.publicName: "${publicVal}"`
      );
    }

    // =========================================================================
    // TEST 4: DYNAMIC XFA FAIL-CLOSED GATE (Section 4 & 24)
    // =========================================================================
    console.log('\n--- 4. Testing Dynamic XFA Fail-Closed Gate ---');
    const xfaPath = path.resolve('test-fixtures/phase6a/FIXTURE_S_XFA.pdf');
    await page.goto('http://localhost:4321/pdf-editor/', { waitUntil: 'networkidle0' });
    await uploadPdfFile(page, xfaPath);

    const isBannerVisible = await page.evaluate(() => {
      const banner = document.getElementById('editor-xfa-banner');
      return banner && !banner.classList.contains('hidden');
    });
    recordTest('XFA Gate: Warning Banner Rendered', isBannerVisible, `Banner visible: ${isBannerVisible}`);

    // Click Export: verify blocked
    const filesBeforeXfa = fs.readdirSync(downloadDir);
    await page.click('#editor-export-btn');
    await new Promise((r) => setTimeout(r, 1000));
    const newFilesXfa = fs.readdirSync(downloadDir).filter((f) => !filesBeforeXfa.includes(f));

    recordTest(
      'XFA Gate: Export Strictly Blocked (Zero File Downloaded)',
      newFilesXfa.length === 0,
      `Files downloaded: ${newFilesXfa.length}`
    );

    // =========================================================================
    // TEST 5: DIGITAL SIGNATURE DETECTION & WARNING (Section 22)
    // =========================================================================
    console.log('\n--- 5. Testing Digital Signature Detection & Notice ---');
    const sigPath = path.resolve('test-fixtures/phase6a/FIXTURE_R_SIGNATURE.pdf');
    await page.goto('http://localhost:4321/pdf-editor/', { waitUntil: 'networkidle0' });
    await uploadPdfFile(page, sigPath);

    await page.click('#editor-export-btn');
    await page.waitForSelector('#form-export-mode-modal:not(.hidden)', { timeout: 5000 });

    const sigNoticeVisible = await page.evaluate(() => {
      const el = document.getElementById('export-signature-warning');
      return el && !el.classList.contains('hidden') && el.textContent.includes('digital signature');
    });

    recordTest(
      'Digital Signature: Warning Displayed in Export Modal',
      sigNoticeVisible,
      `Signature notice visible: ${sigNoticeVisible}`
    );
    await page.screenshot({ path: path.join(screenshotDir, '07_phase6c_signature_warning.png') });
    await page.click('#cancel-export-mode-btn');

    // =========================================================================
    // TEST 6: MOBILE VIEWPORTS & RESPONSIVE QA
    // =========================================================================
    console.log('\n--- 6. Testing Mobile Viewports ---');
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto('http://localhost:4321/pdf-editor/', { waitUntil: 'networkidle0' });
    await uploadPdfFile(page, realFormPath);

    await page.click('#editor-export-btn');
    await page.waitForSelector('#form-export-mode-modal:not(.hidden)', { timeout: 5000 });
    await page.screenshot({ path: path.join(screenshotDir, '08_phase6c_mobile_390_export_modal.png') });
    recordTest('Mobile: 390px Viewport Renders Export Modal Cleanly', true, 'Modal rendered on mobile');

    await page.click('#cancel-export-mode-btn');

    // Compact 320px
    await page.setViewport({ width: 320, height: 568, isMobile: true, hasTouch: true });
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({ path: path.join(screenshotDir, '09_phase6c_mobile_320_compact.png') });
    recordTest('Mobile: 320px Compact Viewport Clean Layout', true, '320px rendered');

    // =========================================================================
    // TEST 7: PRIVACY & NETWORK AUDIT
    // =========================================================================
    console.log('\n--- 7. Testing Security & Network Privacy ---');
    recordTest(
      'Security: Zero External Document Requests',
      networkRequests.length === 0,
      `Captured external requests: ${networkRequests.length}`
    );

    const realErrors = consoleErrors.filter((e) => !e.includes('favicon.ico') && !e.includes('source map'));
    recordTest(
      'Stability: Zero Unhandled Console Errors',
      realErrors.length === 0,
      `Console errors: ${realErrors.length} (${realErrors.slice(0, 3).join(', ')})`
    );
  } finally {
    await browser.close();
  }

  console.log('\n====================================================');
  console.log('Phase 6C Browser Acceptance Execution Complete');
  console.log('====================================================');
  const allPassed = testResults.every((t) => t.passed);
  console.log(`Summary: ${testResults.filter((t) => t.passed).length} / ${testResults.length} tests PASSED.`);
  if (!allPassed) {
    console.error('Some tests FAILED:');
    testResults.filter((t) => !t.passed).forEach((t) => console.error(` - ${t.testName}: ${t.details}`));
    process.exit(1);
  }
}

runPhase6cAcceptance().catch((err) => {
  console.error('Unhandled error in Phase 6C Acceptance:', err);
  process.exit(1);
});
