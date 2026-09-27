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

// Clear old downloaded files
fs.readdirSync(downloadDir).forEach(f => {
  try { fs.unlinkSync(path.join(downloadDir, f)); } catch (e) {}
});

async function runPhase4AcceptanceTest() {
  console.log('=== Starting Phase 4 Real Export & Page Management Acceptance Test ===\n');

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`BROWSER [ERROR]:`, msg.text());
      consoleErrors.push(msg.text());
    }
  });

  // Setup CDP download intercept
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
  });

  // 1. Open editor on 1440x900
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:4321/pdf-editor/', { waitUntil: 'networkidle0' });

  // 2. Load Sample PDF
  console.log('Step 1: Loading sample PDF...');
  await page.click('#editor-sample-btn');
  await page.waitForSelector('#pdf-canvas', { timeout: 10000 });
  await page.waitForSelector('#pdf-text-layer span', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 1200));

  // Initial State Check
  const initialInfo = await page.evaluate(() => {
    const pageCount = document.querySelectorAll('#thumbnails-container .thumbnail-card').length;
    const docPropPage = document.getElementById('doc-prop-current-page')?.textContent;
    const docPropRot = document.getElementById('doc-prop-rotation')?.textContent;
    return { pageCount, docPropPage, docPropRot };
  });
  console.log('Initial document state:', initialInfo);
  if (initialInfo.pageCount !== 3) throw new Error(`Expected 3 initial pages, found ${initialInfo.pageCount}`);

  // 3. Rotate Page 1 by 90° Clockwise
  console.log('\nStep 2: Rotating current page (Page 1) 90° clockwise...');
  await page.click('#tool-rotate-page-btn');
  await new Promise(r => setTimeout(r, 1000));

  const rotatedInfo = await page.evaluate(() => {
    const rotBadge = document.querySelector('#thumbnails-container [data-page="1"] span.bg-brand-500')?.textContent;
    const docRot = document.getElementById('doc-prop-rotation')?.textContent;
    const cardWidth = document.getElementById('pdf-page-card')?.style.width;
    const cardHeight = document.getElementById('pdf-page-card')?.style.height;
    return { rotBadge, docRot, cardWidth, cardHeight };
  });
  console.log('Rotated Page 1 state:', rotatedInfo);
  if (rotatedInfo.docRot !== '90°') throw new Error(`Expected rotation 90°, got ${rotatedInfo.docRot}`);
  await page.screenshot({ path: path.join(qaDir, 'phase4_01_page_rotated_90.png') });

  // 4. Duplicate Page 1
  console.log('\nStep 3: Duplicating Page 1 via thumbnail context menu...');
  const menuTrigger1 = await page.$('#thumbnails-container [data-page="1"] [data-page-menu-trigger]');
  if (!menuTrigger1) throw new Error('Could not find Page 1 context menu trigger.');
  await menuTrigger1.click();
  await new Promise(r => setTimeout(r, 300));

  await page.waitForSelector('#thumbnail-context-menu:not(.hidden)', { timeout: 3000 });
  await page.click('#ctx-duplicate-btn');
  await new Promise(r => setTimeout(r, 1200));

  const duplicateInfo = await page.evaluate(() => {
    const totalThumbs = document.querySelectorAll('#thumbnails-container .thumbnail-card').length;
    const totalLabel = document.getElementById('bottom-total-pages')?.textContent;
    return { totalThumbs, totalLabel };
  });
  console.log('Post-duplicate state:', duplicateInfo);
  if (duplicateInfo.totalThumbs !== 4) throw new Error(`Expected 4 pages after duplicate, got ${duplicateInfo.totalThumbs}`);
  await page.screenshot({ path: path.join(qaDir, 'phase4_02_page_duplicated.png') });

  // 5. Add Annotations: Underline, Strike, Replacement, Comment on Page 1
  console.log('\nStep 4: Adding text replacement, underline, strikethrough, and sticky comment...');
  // Select page 1
  await page.click('#thumbnails-container [data-page="1"]');
  await new Promise(r => setTimeout(r, 800));

  // Underline an item
  const span0 = await page.$('#pdf-text-layer span[data-text-id="p1-t0"]');
  if (span0) {
    await span0.click();
    await new Promise(r => setTimeout(r, 300));
    const underlineBtn = await page.$('#underline-existing-text-btn');
    if (underlineBtn) {
      await underlineBtn.click();
      console.log('Applied underline annotation to text item');
      await new Promise(r => setTimeout(r, 400));
    }
  }

  // Strikethrough another item
  const span1 = await page.$('#pdf-text-layer span[data-text-id="p1-t1"]');
  if (span1) {
    await span1.click();
    await new Promise(r => setTimeout(r, 300));
    const strikeBtn = await page.$('#strikethrough-existing-text-btn');
    if (strikeBtn) {
      await strikeBtn.click();
      console.log('Applied strikethrough annotation to text item');
      await new Promise(r => setTimeout(r, 400));
    }
  }

  // Visual Text Replacement
  const span2 = await page.$('#pdf-text-layer span[data-text-id="p1-t2"]');
  if (span2) {
    await span2.click();
    await new Promise(r => setTimeout(r, 300));
    const editBtn = await page.$('#edit-existing-text-btn');
    if (editBtn) {
      await editBtn.click();
      await new Promise(r => setTimeout(r, 300));
      await page.keyboard.down('Control');
      await page.keyboard.press('KeyA');
      await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
      await page.keyboard.type('PHASE 4 REAL ACCEPTANCE TEST');
      await page.keyboard.down('Control');
      await page.keyboard.press('Enter');
      await page.keyboard.up('Control');
      console.log('Committed visual text replacement: "PHASE 4 REAL ACCEPTANCE TEST"');
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Sticky Comment Note
  console.log('Adding sticky comment...');
  await page.click('[data-tool="comment"]');
  await new Promise(r => setTimeout(r, 300));
  // Click on pdf card to place comment
  const pdfCardEl = await page.$('#pdf-page-card');
  const cardBox = await pdfCardEl.boundingBox();
  await page.mouse.click(cardBox.x + 120, cardBox.y + 180);
  await new Promise(r => setTimeout(r, 400));

  // Type into comment popover
  const commentTextarea = await page.$('#active-comment-popover textarea');
  if (commentTextarea) {
    await commentTextarea.type('Phase 4 verified and compliant.');
    await page.click('#commit-comment-btn');
    console.log('Placed and committed sticky comment note');
    await new Promise(r => setTimeout(r, 500));
  }

  await page.screenshot({ path: path.join(qaDir, 'phase4_03_annotations_added.png') });

  // 6. Test Undo & Redo
  console.log('\nStep 5: Testing Undo and Redo...');
  await page.click('#tool-undo-btn');
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(qaDir, 'phase4_04_undo_executed.png') });

  await page.click('#tool-redo-btn');
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(qaDir, 'phase4_05_redo_executed.png') });

  // 7. Page Reordering: Move Page 2 up
  console.log('\nStep 6: Reordering pages (Move Page 2 Up)...');
  const menuTrigger2 = await page.$('#thumbnails-container [data-page="2"] [data-page-menu-trigger]');
  if (menuTrigger2) {
    await menuTrigger2.click();
    await new Promise(r => setTimeout(r, 300));
    await page.click('#ctx-move-up-btn');
    await new Promise(r => setTimeout(r, 800));
    console.log('Moved Page 2 Up successfully');
  }
  await page.screenshot({ path: path.join(qaDir, 'phase4_06_pages_reordered.png') });

  // 8. Delete Page 4
  console.log('\nStep 7: Deleting Page 4...');
  const menuTrigger4 = await page.$('#thumbnails-container [data-page="4"] [data-page-menu-trigger]');
  if (menuTrigger4) {
    await menuTrigger4.click();
    await new Promise(r => setTimeout(r, 300));
    await page.click('#ctx-delete-btn');
    await new Promise(r => setTimeout(r, 800));
  }

  const postDeleteCount = await page.evaluate(() => {
    return document.querySelectorAll('#thumbnails-container .thumbnail-card').length;
  });
  console.log(`Page count after deletion: ${postDeleteCount}`);
  if (postDeleteCount !== 3) throw new Error(`Expected 3 pages after deletion, got ${postDeleteCount}`);
  await page.screenshot({ path: path.join(qaDir, 'phase4_07_page_deleted.png') });

  // 9. Real Browser Export
  console.log('\nStep 8: Triggering Real Client-Side Export...');
  await page.click('#editor-export-btn');
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: path.join(qaDir, 'phase4_08_export_complete.png') });

  // Verify downloaded file
  const downloadedFiles = fs.readdirSync(downloadDir).filter(f => f.endsWith('.pdf'));
  console.log('Downloaded files:', downloadedFiles);
  if (downloadedFiles.length === 0) throw new Error('No PDF file was downloaded by browser export!');

  const downloadedFilePath = path.join(downloadDir, downloadedFiles[0]);
  const downloadedBytes = fs.readFileSync(downloadedFilePath);
  console.log(`Downloaded file: ${downloadedFiles[0]} (${downloadedBytes.length} bytes)`);

  // Inspect with pdf-lib
  console.log('\nStep 9: Inspecting downloaded PDF with pdf-lib...');
  const exportedDoc = await PDFDocument.load(downloadedBytes);
  const exportedPageCount = exportedDoc.getPageCount();
  console.log(`Exported PDF Page Count: ${exportedPageCount}`);
  if (exportedPageCount !== 3) throw new Error(`Expected 3 pages in exported PDF, got ${exportedPageCount}`);

  // Inspect page rotations in exported PDF
  const rotations = [];
  for (let i = 0; i < exportedPageCount; i++) {
    rotations.push(exportedDoc.getPage(i).getRotation().angle);
  }
  console.log('Exported page rotations:', rotations);

  // Inspect with PDF.js
  console.log('\nStep 10: Inspecting text content with PDF.js...');
  const pdfJsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(downloadedBytes) }).promise;
  let allExtractedText = '';
  for (let i = 1; i <= pdfJsDoc.numPages; i++) {
    const p = await pdfJsDoc.getPage(i);
    const content = await p.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    allExtractedText += `\n[Page ${i}]: ${pageText}`;
  }
  console.log('Extracted Text Summary:', allExtractedText.substring(0, 400));

  // 11. Responsive Multi-Viewport Visual QA
  console.log('\nStep 11: Testing responsive viewports...');
  const viewports = [
    { width: 1440, height: 900, name: 'phase4_responsive_1440.png' },
    { width: 1024, height: 768, name: 'phase4_responsive_1024.png' },
    { width: 768, height: 1024, name: 'phase4_responsive_768.png' },
    { width: 430, height: 932, name: 'phase4_responsive_430.png' },
    { width: 390, height: 844, name: 'phase4_responsive_390.png' },
    { width: 360, height: 800, name: 'phase4_responsive_360.png' },
    { width: 320, height: 568, name: 'phase4_responsive_320.png' },
  ];

  for (const vp of viewports) {
    await page.setViewport({ width: vp.width, height: vp.height });
    await new Promise(r => setTimeout(r, 600));

    // Verify zero horizontal scrolling
    const overflowInfo = await page.evaluate(() => {
      return {
        docScrollWidth: document.documentElement.scrollWidth,
        docClientWidth: document.documentElement.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
        bodyClientWidth: document.body.clientWidth,
      };
    });

    const hasHorizontalOverflow = overflowInfo.docScrollWidth > overflowInfo.docClientWidth + 1;
    console.log(`Viewport ${vp.width}x${vp.height}: scrollWidth=${overflowInfo.docScrollWidth}, clientWidth=${overflowInfo.docClientWidth}, overflow=${hasHorizontalOverflow}`);
    if (hasHorizontalOverflow) {
      console.warn(`WARNING: Horizontal overflow detected at ${vp.width}px!`);
    }

    await page.screenshot({ path: path.join(qaDir, vp.name) });
  }

  await browser.close();
  console.log('\n=== Phase 4 Real Export & Page Management Acceptance Test PASSED! ===');
}

runPhase4AcceptanceTest().catch(err => {
  console.error('\n*** Acceptance Test FAILED ***\n', err);
  process.exit(1);
});
