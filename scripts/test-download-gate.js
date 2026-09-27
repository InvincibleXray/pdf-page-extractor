import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';

const browserCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];
const chromePath = browserCandidates.find(p => fs.existsSync(p));

const exportDir = path.resolve('test-fixtures/phase5b/exported');

async function testDownloadGate() {
  console.log('--- Testing Download Gate Fail-Closed Enforcement ---');

  // Create a 2-page PDF:
  // Page 1 has "LEAK_TARGET_WORD"
  // Page 2 has "LEAK_TARGET_WORD"
  const doc = await PDFDocument.create();
  const font = await doc.embedFont('Helvetica');
  const p1 = doc.addPage([595, 842]);
  p1.drawText('Page 1 Secret: LEAK_TARGET_WORD', { x: 50, y: 700, size: 14, font });
  const p2 = doc.addPage([595, 842]);
  p2.drawText('Page 2 Unredacted: LEAK_TARGET_WORD', { x: 50, y: 700, size: 14, font });
  const bytes = await doc.save();

  const fixturePath = path.resolve('test-fixtures/phase5b/FIXTURE_GATE_TEST.pdf');
  fs.writeFileSync(fixturePath, bytes);

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
    await new Promise(r => setTimeout(r, 800));

    // Select text "LEAK_TARGET_WORD" on Page 1
    const textSpans = await page.$$('#pdf-text-layer span');
    for (const span of textSpans) {
      const text = await page.evaluate(el => el.textContent, span);
      if (text && text.includes('LEAK_TARGET_WORD')) {
        await span.click();
        break;
      }
    }

    await page.waitForSelector('#existing-text-action-bar:not(.hidden)', { timeout: 3000 });
    await page.click('#redact-existing-text-btn');
    await new Promise(r => setTimeout(r, 500));

    // Notice what will happen now:
    // Page 1 is redacted with originalText = "LEAK_TARGET_WORD"
    // Page 2 is UNREDACTED and retains "LEAK_TARGET_WORD" in its uncompressed stream!
    // The forensic validator will scan the exported bytes, find "LEAK_TARGET_WORD" in Page 2's stream,
    // and fail with:
    // "Forensic failure: Plaintext token "LEAK_TARGET_WORD" detected in raw uncompressed PDF byte stream!"
    // The download must be ABORTED (0 bytes downloaded)!

    const filesBefore = fs.readdirSync(exportDir);
    console.log('Clicking export...');
    await page.click('#editor-export-btn');
    await page.waitForSelector('#redaction-confirm-modal:not(.hidden)', { timeout: 3000 });
    await page.click('#confirm-redact-export-btn');

    // Wait 5 seconds
    await new Promise(r => setTimeout(r, 5000));
    const filesAfter = fs.readdirSync(exportDir);
    const newFiles = filesAfter.filter(f => !filesBefore.includes(f));

    const toastInfo = await page.evaluate(() => {
      const title = document.getElementById('export-toast-title')?.textContent;
      const desc = document.getElementById('export-toast-desc')?.textContent;
      const isRed = document.getElementById('export-toast')?.classList.contains('border-red-500') ||
                    document.getElementById('export-toast-title')?.classList.contains('text-red-500');
      return { title, desc, isRed };
    });

    console.log('Result of Download Gate Test:');
    console.log('- New files created in export folder:', newFiles.length);
    console.log('- Toast Title:', toastInfo.title);
    console.log('- Toast Description:', toastInfo.desc);

    const isFailClosed = newFiles.length === 0 && toastInfo.title === 'Export Failed';
    console.log(`- FAIL-CLOSED ENFORCEMENT VERDICT: ${isFailClosed ? 'PASS (Secure)' : 'FAIL'}`);

    return { isFailClosed, newFiles, toastInfo };
  } finally {
    await browser.close();
  }
}

testDownloadGate().catch(console.error);
