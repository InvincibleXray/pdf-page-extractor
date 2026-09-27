import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { generateAllFixtures, FIXTURES_DIR } from './phase5b-generate-fixtures.js';
import { runFullForensicAudit } from './phase5b-forensic-engine.js';
import { PDFDocument } from 'pdf-lib';

const browserCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];
const chromePath = browserCandidates.find(p => fs.existsSync(p));
if (!chromePath) throw new Error('Chromium browser not found.');

const exportDir = path.resolve('test-fixtures/phase5b/exported');
const reportDir = path.resolve('test-fixtures/phase5b/reports');
const qaDir = 'C:\\Users\\A\\.gemini\\antigravity\\brain\\7fd15cee-732e-4287-b99e-7575b7470022\\qa_screenshots';

if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
if (!fs.existsSync(qaDir)) fs.mkdirSync(qaDir, { recursive: true });

// Helper to wait for file download in exportDir
async function waitForDownload(existingFiles, timeoutMs = 25000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const currentFiles = fs.readdirSync(exportDir).filter(f => !f.endsWith('.crdownload') && !f.endsWith('.tmp'));
    const newFiles = currentFiles.filter(f => !existingFiles.includes(f));
    if (newFiles.length > 0) {
      return path.join(exportDir, newFiles[0]);
    }
    await new Promise(r => setTimeout(r, 250));
  }
  return null;
}

export async function runAdversarialAudit() {
  console.log('================================================================');
  console.log('PHASE 5B: ADVERSARIAL SECURE REDACTION SECURITY AUDIT');
  console.log('Red-Team & Forensic Validation Across Fixtures A–Z');
  console.log('================================================================\n');

  // Step 1: Generate all 26 fixtures
  console.log('Stage 2: Generating Fixture Suite A through Z...');
  const fixtures = await generateAllFixtures();
  console.log(`Generated ${fixtures.length} deterministic fixtures in ${FIXTURES_DIR}\n`);

  // Launch browser with CDP download interception & network audit
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const auditResults = {
    timestamp: new Date().toISOString(),
    fixturesTested: 0,
    fixturesPassed: 0,
    fixturesFailed: 0,
    vulnerabilities: [],
    networkRequests: [],
    fixtureReports: [],
    downloadGateTest: null,
    falsePositiveTest: null,
    largePdfTest: null,
    uiSecurityAudit: null,
  };

  try {
    const page = await browser.newPage();
    const client = await page.target().createCDPSession();

    // Enable CDP Download Behavior
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: exportDir,
    });

    // Enable CDP Network Tracking to verify privacy / local-only execution
    await client.send('Network.enable');
    client.on('Network.requestWillBeSent', (params) => {
      const url = params.request.url;
      auditResults.networkRequests.push({
        url,
        method: params.request.method,
        timestamp: params.wallTime,
      });
    });

    await page.setViewport({ width: 1440, height: 900 });

    // Iterate through fixtures
    for (let idx = 0; idx < fixtures.length; idx++) {
      const fixture = fixtures[idx];
      const letter = fixture.id.replace('FIXTURE_', '')[0];
      console.log(`----------------------------------------------------------------`);
      console.log(`Testing Fixture [${letter}]: ${fixture.name} (${fixture.id})`);
      console.log(`Description: ${fixture.description}`);
      console.log(`Canaries: ${fixture.canaries.join(', ')}`);

      try {
        await page.goto('http://localhost:4321/pdf-editor/', { waitUntil: 'networkidle0' });

        // Upload fixture
        const fileInput = await page.$('#editor-file-input');
        if (!fileInput) throw new Error('#editor-file-input not found');
        await fileInput.uploadFile(fixture.filePath);

        await page.waitForSelector('#pdf-canvas', { timeout: 15000 });
        await new Promise(r => setTimeout(r, 800));

        // Apply redactions
        for (const box of fixture.redactionBoxes) {
          // Navigate to target page if needed
          const currentPageNum = await page.evaluate(() => {
            const el = document.getElementById('page-current-input');
            return el ? parseInt(el.value, 10) : 1;
          });

          if (currentPageNum !== box.pageNumber) {
            // Click thumbnail or navigate
            await page.evaluate((targetPage) => {
              const thumbs = document.querySelectorAll('#thumbnails-container .thumbnail-card');
              if (thumbs[targetPage - 1]) (thumbs[targetPage - 1]).click();
            }, box.pageNumber);
            await new Promise(r => setTimeout(r, 600));
          }

          // Try text span selection first if originalText is set
          let spanClicked = false;
          if (box.originalText) {
            const spans = await page.$$('#pdf-text-layer span');
            for (const span of spans) {
              const text = await page.evaluate(el => el.textContent, span);
              if (text && text.includes(box.originalText)) {
                await span.click();
                spanClicked = true;
                break;
              }
            }
          }

          if (spanClicked) {
            await page.waitForSelector('#existing-text-action-bar:not(.hidden)', { timeout: 3000 });
            await page.click('#redact-existing-text-btn');
            await new Promise(r => setTimeout(r, 400));
          } else {
            // Native drag-to-create via pointer coordinates
            await page.click('#tool-redact-btn');
            await new Promise(r => setTimeout(r, 200));

            const canvasBounds = await page.evaluate(() => {
              const c = document.getElementById('pdf-canvas');
              const rect = c.getBoundingClientRect();
              return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
            });

            // Calculate screen coordinates from box
            // Note: box.x, box.y are in PDF coordinates (from top-left in our state model)
            const zoom = await page.evaluate(() => {
              const el = document.getElementById('zoom-percentage');
              return el ? parseInt(el.textContent, 10) / 100 : 1.0;
            });

            const screenX = canvasBounds.x + (box.x * zoom);
            const screenY = canvasBounds.y + (box.y * zoom);
            const screenW = Math.max(20, box.width * zoom);
            const screenH = Math.max(15, box.height * zoom);

            await page.mouse.move(screenX, screenY);
            await page.mouse.down();
            await page.mouse.move(screenX + screenW, screenY + screenH, { steps: 5 });
            await page.mouse.up();
            await new Promise(r => setTimeout(r, 400));
          }
        }

        // For Fixture X (Page Management): test delete page 1 and reorder
        if (fixture.id === 'FIXTURE_X_PAGE_MGMT') {
          console.log('Executing page management operations: delete page 1, verify redactions stay bound to page 2...');
          await page.evaluate(() => {
            const delBtn = document.querySelector('#thumbnails-container .thumbnail-card[data-page-index="0"] button[data-action="delete"]');
            if (delBtn) delBtn.click();
          });
          await new Promise(r => setTimeout(r, 600));
        }

        // Trigger Export
        const existingFilesBefore = fs.readdirSync(exportDir);
        await page.click('#editor-export-btn');
        await page.waitForSelector('#redaction-confirm-modal:not(.hidden)', { timeout: 5000 });
        await page.click('#confirm-redact-export-btn');

        // Wait for download
        const downloadedFile = await waitForDownload(existingFilesBefore, 20000);
        if (!downloadedFile) {
          throw new Error('Export download timed out or failed to trigger');
        }

        // Read exported bytes & run independent forensic audit
        const exportedBytes = fs.readFileSync(downloadedFile);
        const forensicReport = await runFullForensicAudit(exportedBytes, fixture.canaries);

        const fixtureSummary = {
          id: fixture.id,
          name: fixture.name,
          passed: forensicReport.passed,
          totalCanaries: fixture.canaries.length,
          canaryLeaks: forensicReport.totalCanariesLeaked,
          allLeaks: forensicReport.allLeaks,
          outputSize: exportedBytes.length,
          pageGeometries: forensicReport.pdfLibResults.pageGeometries,
        };

        auditResults.fixturesTested++;
        if (forensicReport.passed) {
          auditResults.fixturesPassed++;
          console.log(`Result: PASS - 0 leaks detected in ${fixture.id}`);
        } else {
          auditResults.fixturesFailed++;
          console.error(`Result: FAIL/LEAK - ${forensicReport.totalCanariesLeaked} canary leak(s) in ${fixture.id}:`, forensicReport.allLeaks);
          auditResults.vulnerabilities.push({
            fixture: fixture.id,
            severity: forensicReport.totalCanariesLeaked > 0 ? 'CRITICAL' : 'HIGH',
            leaks: forensicReport.allLeaks,
            details: forensicReport.canaryReports,
          });
        }

        auditResults.fixtureReports.push(fixtureSummary);
      } catch (fErr) {
        console.error(`Fixture ${fixture.id} execution failed with error:`, fErr.message);
        auditResults.fixturesTested++;
        auditResults.fixturesFailed++;
        auditResults.fixtureReports.push({
          id: fixture.id,
          name: fixture.name,
          passed: false,
          error: fErr.message,
        });
      }
    }

    // ==========================================
    // SPECIAL TEST 1: Fail-Closed Download Gate Test (§25)
    // ==========================================
    console.log('\n================================================================');
    console.log('SPECIAL TEST 1: Fail-Closed Download Gate Enforcement (§25)');
    console.log('================================================================');
    try {
      await page.goto('http://localhost:4321/pdf-editor/', { waitUntil: 'networkidle0' });
      // Upload Fixture A
      const fileInput = await page.$('#editor-file-input');
      await fileInput.uploadFile(path.resolve('test-fixtures/phase5b/FIXTURE_A_SELECTABLE.pdf'));
      await page.waitForSelector('#pdf-canvas', { timeout: 15000 });
      await new Promise(r => setTimeout(r, 600));

      // Intentionally create a redaction object with originalText "%PDF" (guaranteed to trigger validator fail)
      console.log('Injecting intentionally leaking redaction token "%PDF" into workspace...');
      await page.evaluate(() => {
        // Find tool-redact-btn and click it
        const redactBtn = document.getElementById('tool-redact-btn');
        if (redactBtn) redactBtn.click();
      });

      // Drag to create
      const canvasBounds = await page.evaluate(() => {
        const c = document.getElementById('pdf-canvas');
        const rect = c.getBoundingClientRect();
        return { x: rect.left, y: rect.top };
      });
      await page.mouse.move(canvasBounds.x + 50, canvasBounds.y + 100);
      await page.mouse.down();
      await page.mouse.move(canvasBounds.x + 200, canvasBounds.y + 150, { steps: 3 });
      await page.mouse.up();
      await new Promise(r => setTimeout(r, 400));

      // Now set overlay text or trigger leak condition by attaching originalText in state
      const leakTriggered = await page.evaluate(() => {
        // Access inspector and set overlay
        const inp = document.getElementById('redact-prop-overlay-text');
        if (inp) {
          inp.value = '[LEAK TEST]';
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        }
        // In editorStore, set the redaction object's originalText to "%PDF" which exists in every PDF file
        const store = window['__PDF_EDITOR_STORE__'] || null;
        if (store) {
          const objs = store.getState().objects;
          const r = objs.find(o => o.type === 'redact');
          if (r) {
            r.originalText = '%PDF';
            return true;
          }
        }
        return false;
      });

      console.log('Attempting export with forced validator failure...');
      const existingFilesBefore = fs.readdirSync(exportDir);
      await page.click('#editor-export-btn');
      await page.waitForSelector('#redaction-confirm-modal:not(.hidden)', { timeout: 3000 });
      await page.click('#confirm-redact-export-btn');

      // Wait 4 seconds to observe if download triggers
      await new Promise(r => setTimeout(r, 4000));
      const currentFiles = fs.readdirSync(exportDir).filter(f => !f.endsWith('.crdownload') && !f.endsWith('.tmp'));
      const newFiles = currentFiles.filter(f => !existingFilesBefore.includes(f));

      const toastStatus = await page.evaluate(() => {
        const title = document.getElementById('export-toast-title')?.textContent;
        const desc = document.getElementById('export-toast-desc')?.textContent;
        return { title, desc };
      });

      console.log('Download Gate Result:', {
        downloadBlocked: newFiles.length === 0,
        toastTitle: toastStatus.title,
        toastDesc: toastStatus.desc,
      });

      auditResults.downloadGateTest = {
        passed: newFiles.length === 0,
        downloadBlocked: newFiles.length === 0,
        toastStatus,
      };
    } catch (dgErr) {
      console.error('Download Gate Test error:', dgErr);
      auditResults.downloadGateTest = { passed: false, error: dgErr.message };
    }

    // ==========================================
    // SPECIAL TEST 2: False-Positive Substring Collision Test (§26)
    // ==========================================
    console.log('\n================================================================');
    console.log('SPECIAL TEST 2: False-Positive Substring Collision (§26)');
    console.log('================================================================');
    try {
      const fpDoc = await PDFDocument.create();
      const fpFont = await fpDoc.embedFont('Helvetica');
      // Page 1: Sensitive token
      const p1 = fpDoc.addPage([595, 842]);
      p1.drawText('Sensitive Account: SECRET_CANARY_123', { x: 50, y: 750, size: 14, font: fpFont });
      // Page 2: Non-sensitive overlapping token
      const p2 = fpDoc.addPage([595, 842]);
      p2.drawText('Public Reference: SECRET_CANARY_1234_PUBLIC', { x: 50, y: 750, size: 14, font: fpFont });
      const fpBytes = await fpDoc.save();
      const fpPath = path.resolve('test-fixtures/phase5b/FIXTURE_FALSE_POSITIVE.pdf');
      fs.writeFileSync(fpPath, fpBytes);

      await page.goto('http://localhost:4321/pdf-editor/', { waitUntil: 'networkidle0' });
      const fileInput = await page.$('#editor-file-input');
      await fileInput.uploadFile(fpPath);
      await page.waitForSelector('#pdf-canvas', { timeout: 15000 });
      await new Promise(r => setTimeout(r, 600));

      // Click span on page 1 with SECRET_CANARY_123
      const textSpans = await page.$$('#pdf-text-layer span');
      for (const span of textSpans) {
        const text = await page.evaluate(el => el.textContent, span);
        if (text && text.includes('SECRET_CANARY_123')) {
          await span.click();
          break;
        }
      }
      await page.waitForSelector('#existing-text-action-bar:not(.hidden)', { timeout: 3000 });
      await page.click('#redact-existing-text-btn');
      await new Promise(r => setTimeout(r, 500));

      // Export
      const existingFilesBefore = fs.readdirSync(exportDir);
      await page.click('#editor-export-btn');
      await page.waitForSelector('#redaction-confirm-modal:not(.hidden)', { timeout: 3000 });
      await page.click('#confirm-redact-export-btn');

      const downloaded = await waitForDownload(existingFilesBefore, 10000);
      const toastStatus = await page.evaluate(() => {
        const title = document.getElementById('export-toast-title')?.textContent;
        const desc = document.getElementById('export-toast-desc')?.textContent;
        return { title, desc };
      });

      console.log('False-Positive Collision Test:', {
        downloaded: !!downloaded,
        toastTitle: toastStatus.title,
        toastDesc: toastStatus.desc,
      });

      auditResults.falsePositiveTest = {
        downloaded: !!downloaded,
        toastStatus,
        vulnerability: !downloaded ? 'Validator erroneously blocked export due to naive substring collision on unredacted page' : 'None',
      };
      if (!downloaded) {
        auditResults.vulnerabilities.push({
          fixture: 'FALSE_POSITIVE_SUBSTRING',
          severity: 'MEDIUM',
          leaks: ['Validator rawBinaryClean failed because SECRET_CANARY_123 matched substring of SECRET_CANARY_1234 on unredacted page.'],
        });
      }
    } catch (fpErr) {
      console.error('False-Positive Test error:', fpErr);
      auditResults.falsePositiveTest = { error: fpErr.message };
    }

    // ==========================================
    // SPECIAL TEST 3: Network & Privacy Audit (§24)
    // ==========================================
    console.log('\n================================================================');
    console.log('SPECIAL TEST 3: Network & Privacy Client-Side Audit (§24)');
    console.log('================================================================');
    const externalRequests = auditResults.networkRequests.filter((r) => {
      const u = r.url.toLowerCase();
      return !u.includes('localhost') && !u.includes('127.0.0.1') && !u.startsWith('data:') && !u.startsWith('blob:');
    });

    console.log(`Total HTTP/CDP requests recorded: ${auditResults.networkRequests.length}`);
    console.log(`External non-localhost requests: ${externalRequests.length}`);
    if (externalRequests.length > 0) {
      console.error('PRIVACY VIOLATION: External requests detected:', externalRequests);
    } else {
      console.log('PRIVACY PASS: 100% of operations executed locally on client.');
    }

    // ==========================================
    // SPECIAL TEST 4: Large 876-Page PDF Stress Test (§23)
    // ==========================================
    console.log('\n================================================================');
    console.log('SPECIAL TEST 4: 876-Page Large PDF Selective Redaction Stress Test (§23)');
    console.log('================================================================');
    const largePdfPath = 'C:\\Users\\A\\Desktop\\ece\\5th sem ECE organizer.pdf';
    if (fs.existsSync(largePdfPath)) {
      console.log(`Testing with large PDF: ${largePdfPath} (${(fs.statSync(largePdfPath).size / (1024 * 1024)).toFixed(1)} MB)...`);
      const loadStart = Date.now();
      await page.goto('http://localhost:4321/pdf-editor/', { waitUntil: 'networkidle0' });
      const fileInput = await page.$('#editor-file-input');
      await fileInput.uploadFile(largePdfPath);

      await page.waitForSelector('#pdf-canvas', { timeout: 35000 });
      const loadTimeMs = Date.now() - loadStart;
      console.log(`Large PDF loaded in ${(loadTimeMs / 1000).toFixed(2)}s`);

      // Apply 1 redaction on page 1
      await page.click('#tool-redact-btn');
      const canvasBounds = await page.evaluate(() => {
        const c = document.getElementById('pdf-canvas');
        const rect = c.getBoundingClientRect();
        return { x: rect.left, y: rect.top };
      });
      await page.mouse.move(canvasBounds.x + 50, canvasBounds.y + 100);
      await page.mouse.down();
      await page.mouse.move(canvasBounds.x + 350, canvasBounds.y + 180, { steps: 5 });
      await page.mouse.up();
      await new Promise(r => setTimeout(r, 600));

      const exportStart = Date.now();
      const existingFilesBefore = fs.readdirSync(exportDir);
      await page.click('#editor-export-btn');
      await page.waitForSelector('#redaction-confirm-modal:not(.hidden)', { timeout: 10000 });
      await page.click('#confirm-redact-export-btn');

      const downloadedLarge = await waitForDownload(existingFilesBefore, 90000);
      const exportTimeMs = Date.now() - exportStart;

      if (downloadedLarge) {
        const largeSizeMb = (fs.statSync(downloadedLarge).size / (1024 * 1024)).toFixed(1);
        console.log(`Large PDF export completed in ${(exportTimeMs / 1000).toFixed(2)}s! Output size: ${largeSizeMb} MB`);
        // Verify page count of output
        const outDoc = await PDFDocument.load(fs.readFileSync(downloadedLarge), { ignoreEncryption: true });
        console.log(`Exported page count: ${outDoc.getPageCount()} (Expected 876)`);

        auditResults.largePdfTest = {
          success: true,
          pageCount: outDoc.getPageCount(),
          loadTimeMs,
          exportTimeMs,
          outputSizeMb: largeSizeMb,
        };
      } else {
        console.error('Large PDF export timed out or failed');
        auditResults.largePdfTest = { success: false, error: 'Export timeout' };
      }
    } else {
      console.log('Large PDF file not found at path, skipping.');
    }

    // ==========================================
    // SPECIAL TEST 5: UI Security Messaging & Responsive Audit (§27)
    // ==========================================
    console.log('\n================================================================');
    console.log('SPECIAL TEST 5: UI Security Messaging & Responsive Audit (§27)');
    console.log('================================================================');
    const viewports = [
      { name: 'desktop_1440', width: 1440, height: 900 },
      { name: 'mobile_430', width: 430, height: 932 },
      { name: 'mobile_390', width: 390, height: 844 },
      { name: 'mobile_320', width: 320, height: 568 },
    ];

    const uiScreenshots = [];
    for (const vp of viewports) {
      await page.setViewport({ width: vp.width, height: vp.height });
      await page.goto('http://localhost:4321/pdf-editor/', { waitUntil: 'networkidle0' });
      const snapPath = path.join(qaDir, `phase5b_ui_${vp.name}.png`);
      await page.screenshot({ path: snapPath });
      uiScreenshots.push({ name: vp.name, snapPath });
    }

    auditResults.uiSecurityAudit = {
      viewportsTested: viewports.map(v => v.name),
      screenshots: uiScreenshots,
    };

    // Save final audit JSON
    const reportPath = path.join(reportDir, 'audit-results.json');
    fs.writeFileSync(reportPath, JSON.stringify(auditResults, null, 2));
    console.log(`\nAudit results successfully written to ${reportPath}`);

    return auditResults;
  } finally {
    await browser.close();
  }
}

if (process.argv[1].endsWith('phase5b-adversarial-audit.js')) {
  runAdversarialAudit().then((res) => {
    console.log('================================================================');
    console.log('PHASE 5B AUDIT SUMMARY:');
    console.log(`Total Fixtures Tested: ${res.fixturesTested}`);
    console.log(`Passed: ${res.fixturesPassed}`);
    console.log(`Failed: ${res.fixturesFailed}`);
    console.log(`Vulnerabilities Discovered: ${res.vulnerabilities.length}`);
    console.log('================================================================');
  }).catch((err) => {
    console.error('Fatal audit error:', err);
    process.exit(1);
  });
}
