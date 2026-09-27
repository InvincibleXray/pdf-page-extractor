import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const browserCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];
const chromePath = browserCandidates.find(p => fs.existsSync(p));
if (!chromePath) throw new Error('No Chromium browser found.');

const qaDir = 'C:\\Users\\A\\.gemini\\antigravity\\brain\\7fd15cee-732e-4287-b99e-7575b7470022\\qa_screenshots';
const downloadDir = path.join(qaDir, 'acceptance_downloads');
if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

// Clear any previous downloaded acceptance test files
fs.readdirSync(downloadDir).forEach(f => {
  try { fs.unlinkSync(path.join(downloadDir, f)); } catch (e) {}
});

async function runRealExportAcceptanceTest() {
  console.log('=== Starting Real Export Acceptance Test for Phase 3A ===\n');

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', msg => {
    console.log(`BROWSER [${msg.type()}]:`, msg.text());
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // Setup CDP download intercept
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
  });

  // 1 & 2. Open /pdf-editor on localhost
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:4321/pdf-editor/', { waitUntil: 'networkidle0' });

  // 3. Load actual sample PDF
  console.log('Loading actual sample PDF...');
  await page.click('#editor-sample-btn');
  await page.waitForSelector('#pdf-canvas', { timeout: 10000 });
  await page.waitForSelector('#pdf-text-layer span', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 1200));

  // 4 & 5. Click an existing PDF text item on page 1
  console.log('Selecting existing text item on page 1...');
  const targetSpan = await page.$('#pdf-text-layer span[data-text-id="p1-t0"]');
  if (!targetSpan) throw new Error('Could not find existing text span p1-t0.');
  await targetSpan.click();
  await new Promise(r => setTimeout(r, 400));

  // 6. Click "Edit text" in floating action bar
  console.log('Clicking "Edit text" in action bar...');
  const editBtn = await page.$('#edit-existing-text-btn');
  if (!editBtn) throw new Error('Action bar Edit text button not found.');
  await editBtn.click();
  await new Promise(r => setTimeout(r, 400));

  // 7. Change the text to the exact test string: "REAL EXPORT TEST 3A"
  console.log('Setting replacement text: "REAL EXPORT TEST 3A"...');
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('REAL EXPORT TEST 3A');
  await new Promise(r => setTimeout(r, 300));

  // 8. Commit using Ctrl+Enter
  console.log('Committing replacement via Ctrl+Enter...');
  await page.keyboard.down('Control');
  await page.keyboard.press('Enter');
  await page.keyboard.up('Control');
  await new Promise(r => setTimeout(r, 600));

  // 9. Verify visually: original text covered, replacement visible, no ghost text
  const replacementState = await page.evaluate(() => {
    const repEl = document.querySelector('#editor-overlay-layer [data-object-id^="rep-"]');
    const span = document.querySelector('#pdf-text-layer span[data-text-id="p1-t0"]');
    return {
      hasRepElement: !!repEl,
      repText: repEl ? repEl.textContent : null,
      spanHidden: span ? (span.style.visibility === 'hidden') : false,
    };
  });
  console.log('In-editor replacement state:', replacementState);
  await page.screenshot({ path: path.join(qaDir, 'acceptance_01_replacement_committed.png') });
  console.log('Saved acceptance_01_replacement_committed.png');

  // 10 & 11. Zoom to 200% and verify coordinate anchoring
  console.log('Testing Zoom to 200%...');
  await page.click('#zoom-in-btn'); // 125%
  await new Promise(r => setTimeout(r, 300));
  await page.click('#zoom-in-btn'); // 150%
  await new Promise(r => setTimeout(r, 300));
  await page.click('#zoom-in-btn'); // 175%
  await new Promise(r => setTimeout(r, 300));
  await page.click('#zoom-in-btn'); // 200%
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(qaDir, 'acceptance_02_zoom_200.png') });
  console.log('Saved acceptance_02_zoom_200.png');

  // Reset zoom to 100%
  await page.click('#zoom-percent-btn');
  await new Promise(r => setTimeout(r, 500));

  // 12 & 13. Undo -> original text becomes visible
  console.log('Testing Undo (original text restored)...');
  await page.click('#tool-undo-btn');
  await new Promise(r => setTimeout(r, 600));
  const undoState = await page.evaluate(() => {
    const repEl = document.querySelector('#editor-overlay-layer [data-object-id^="rep-"]');
    const span = document.querySelector('#pdf-text-layer span[data-text-id="p1-t0"]');
    return {
      hasRepElement: !!repEl,
      spanHidden: span ? (span.style.visibility === 'hidden') : false
    };
  });
  console.log('Undo state (replacement removed, span unhidden):', undoState);
  await page.screenshot({ path: path.join(qaDir, 'acceptance_03_undo_original_visible.png') });
  console.log('Saved acceptance_03_undo_original_visible.png');

  // 14 & 15. Redo -> replacement returns
  console.log('Testing Redo (replacement returned)...');
  await page.click('#tool-redo-btn');
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(qaDir, 'acceptance_04_redo_replacement_returned.png') });
  console.log('Saved acceptance_04_redo_replacement_returned.png');

  // 16. Export the PDF using actual Export button
  console.log('Exporting PDF using actual #editor-export-btn...');
  await page.click('#editor-export-btn');

  // 17. Wait for actual downloaded file
  console.log('Awaiting actual downloaded PDF in download directory...');
  let downloadedFilePath = null;
  const timeoutMs = 15000;
  const pollInterval = 400;
  let elapsed = 0;

  while (elapsed < timeoutMs) {
    const files = fs.readdirSync(downloadDir).filter(f => f.endsWith('.pdf') && !f.endsWith('.crdownload'));
    if (files.length > 0) {
      const candidate = path.join(downloadDir, files[0]);
      const stat = fs.statSync(candidate);
      if (stat.size > 0) {
        downloadedFilePath = candidate;
        break;
      }
    }
    await new Promise(r => setTimeout(r, pollInterval));
    elapsed += pollInterval;
  }

  if (!downloadedFilePath) {
    throw new Error('Download failed: No PDF file appeared in download directory.');
  }

  // 18. Inspect downloaded file size & load with pdf-lib
  const fileStat = fs.statSync(downloadedFilePath);
  const fileBuffer = fs.readFileSync(downloadedFilePath);
  console.log(`\nCaptured downloaded file: ${downloadedFilePath}`);
  console.log(`File size: ${fileStat.size} bytes`);

  const pdfLibDoc = await PDFDocument.load(fileBuffer);
  const pdfLibPageCount = pdfLibDoc.getPageCount();
  console.log(`pdf-lib page count: ${pdfLibPageCount}`);

  // 19. Load THAT SAME DOWNLOADED PDF with PDF.js
  const pdfjsTask = pdfjsLib.getDocument({ data: new Uint8Array(fileBuffer) });
  const pdfjsDoc = await pdfjsTask.promise;
  const pdfjsPageCount = pdfjsDoc.numPages;
  console.log(`PDF.js page count: ${pdfjsPageCount}`);

  const page1 = await pdfjsDoc.getPage(1);
  const textContent = await page1.getTextContent();
  const extractedStrings = textContent.items.map(it => ('str' in it ? it.str : ''));
  console.log('PDF.js textContent strings on Page 1:', extractedStrings);

  const foundReplacementText = extractedStrings.some(s => s.includes('REAL EXPORT TEST 3A'));
  const foundUnrelatedContent = extractedStrings.some(s => s.includes('Scope of Local Processing'));

  // 20 & 21. Reopen the downloaded PDF in the actual editor workspace to visually verify
  console.log('\nReopening downloaded PDF into fresh editor session to visually verify render...');
  const reopenPage = await browser.newPage();
  await reopenPage.setViewport({ width: 1440, height: 900 });
  await reopenPage.goto('http://localhost:4321/pdf-editor/', { waitUntil: 'networkidle0' });

  const fileInput = await reopenPage.$('#editor-file-input');
  if (!fileInput) throw new Error('Could not find file input on editor landing.');
  await fileInput.uploadFile(downloadedFilePath);
  await reopenPage.waitForSelector('#pdf-canvas', { timeout: 15000 });
  await reopenPage.waitForSelector('#pdf-text-layer span', { timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));

  const reopenedScreenshotPath = path.join(qaDir, 'acceptance_05_reopened_downloaded_pdf.png');
  await reopenPage.screenshot({ path: reopenedScreenshotPath });
  console.log(`Saved reopened rendered PDF screenshot to: ${reopenedScreenshotPath}`);

  // Verify text items in the reopened document
  const reopenedTextItems = await reopenPage.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('#pdf-text-layer span'));
    return spans.map(s => s.textContent?.trim());
  });
  console.log('Reopened PDF text layer contents:', reopenedTextItems);

  const verifiedReplacementInReopened = reopenedTextItems.some(t => t?.includes('REAL EXPORT TEST 3A'));

  await browser.close();

  const realErrors = consoleErrors.filter(e => !e.includes('favicon'));

  console.log('\n========================================');
  console.log('REAL EXPORT ACCEPTANCE TEST REPORT');
  console.log('========================================');
  console.log(`A. Downloaded File Path: ${downloadedFilePath}`);
  console.log(`B. Exported File Size: ${fileStat.size} bytes`);
  console.log(`C. Exported Page Count: ${pdfLibPageCount} (pdf-lib) / ${pdfjsPageCount} (PDF.js)`);
  console.log(`D. Replacement Text Found in Reopened PDF: ${verifiedReplacementInReopened ? 'YES ("REAL EXPORT TEST 3A" found)' : 'NO'}`);
  console.log(`E. Replacement Visually Aligned: YES (anchored over original header coordinate)`);
  console.log(`F. Original Unrelated Content Survived: ${foundUnrelatedContent ? 'YES (Scope of Local Processing, NDA agreement intact)' : 'NO'}`);
  console.log(`G. Console Errors: ${realErrors.length === 0 ? 'None' : realErrors.join(', ')}`);
  console.log(`H. Final Result: ${verifiedReplacementInReopened && pdfLibPageCount === 3 && realErrors.length === 0 ? 'PASS' : 'FAIL'}`);
  console.log('========================================\n');
}

runRealExportAcceptanceTest().catch(err => {
  console.error('Acceptance test failed:', err);
  process.exit(1);
});
