import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { runFullForensicAudit } from './phase5b-forensic-engine.js';

const browserCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];
const chromePath = browserCandidates.find(p => fs.existsSync(p));

const exportDir = path.resolve('test-fixtures/phase5b/exported');

async function testSingleFixture() {
  const fixturePath = path.resolve('test-fixtures/phase5b/FIXTURE_A_SELECTABLE.pdf');
  const canary = 'REDACTION_CANARY_A_7F91X';

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: exportDir,
    });

    await page.setViewport({ width: 1440, height: 900 });
    await page.goto('http://localhost:4321/pdf-editor/', { waitUntil: 'networkidle0' });

    // Upload
    const fileInput = await page.$('#editor-file-input');
    await fileInput.uploadFile(fixturePath);

    await page.waitForSelector('#pdf-canvas', { timeout: 15000 });
    await page.waitForSelector('#pdf-text-layer span', { timeout: 15000 });
    await new Promise(r => setTimeout(r, 1000));

    // Find span containing canary and click it with Puppeteer ElementHandle
    const textSpans = await page.$$('#pdf-text-layer span');
    let clicked = false;
    for (const span of textSpans) {
      const text = await page.evaluate(el => el.textContent, span);
      if (text && (text.includes(canary) || text.includes('REDACTION_CANARY'))) {
        clicked = true;
        await span.click();
        break;
      }
    }

    console.log('Clicked target span:', clicked);

    if (clicked) {
      await page.waitForSelector('#existing-text-action-bar:not(.hidden)', { timeout: 3000 });
      await page.click('#redact-existing-text-btn');
      await new Promise(r => setTimeout(r, 500));
    } else {
      // Fallback to drag-to-create
      await page.click('#tool-redact-btn');
      const canvasBounds = await page.evaluate(() => {
        const c = document.getElementById('pdf-canvas');
        const rect = c.getBoundingClientRect();
        return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
      });
      await page.mouse.move(canvasBounds.x + 50, canvasBounds.y + 100);
      await page.mouse.down();
      await page.mouse.move(canvasBounds.x + 400, canvasBounds.y + 150, { steps: 5 });
      await page.mouse.up();
      await new Promise(r => setTimeout(r, 500));
    }

    // Export
    const existingFilesBefore = fs.readdirSync(exportDir);
    await page.click('#editor-export-btn');
    await page.waitForSelector('#redaction-confirm-modal:not(.hidden)', { timeout: 4000 });
    await page.click('#confirm-redact-export-btn');

    // Wait for file download
    let downloadedFile = null;
    const startTime = Date.now();
    while (Date.now() - startTime < 15000) {
      const currentFiles = fs.readdirSync(exportDir).filter(f => !f.endsWith('.crdownload') && !f.endsWith('.tmp'));
      const newFiles = currentFiles.filter(f => !existingFilesBefore.includes(f));
      if (newFiles.length > 0) {
        downloadedFile = path.join(exportDir, newFiles[0]);
        break;
      }
      await new Promise(r => setTimeout(r, 200));
    }

    if (!downloadedFile) throw new Error('Download timed out!');
    console.log('Successfully captured download:', downloadedFile);

    const pdfBytes = fs.readFileSync(downloadedFile);
    const forensicReport = await runFullForensicAudit(pdfBytes, [canary]);
    console.log('Forensic Audit Result:', {
      passed: forensicReport.passed,
      canaryLeaks: forensicReport.totalCanariesLeaked,
      allLeaks: forensicReport.allLeaks,
    });
  } finally {
    await browser.close();
  }
}

testSingleFixture().catch(console.error);
