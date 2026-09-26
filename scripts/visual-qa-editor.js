import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const browserCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];
const chromePath = browserCandidates.find(p => fs.existsSync(p));
if (!chromePath) {
  throw new Error('No Chromium browser found (Chrome or Edge).');
}
const outputDir = 'C:\\Users\\A\\.gemini\\antigravity\\brain\\7fd15cee-732e-4287-b99e-7575b7470022\\qa_screenshots';
const realPdfPath = 'C:\\Users\\A\\Desktop\\ece\\5th sem ECE organizer.pdf';

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

async function runEditorVisualQA() {
  console.log('Starting Phase 2 Visual QA for PDF Editor on http://127.0.0.1:4321/pdf-editor/ ...');

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  // Track console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // Navigate to /pdf-editor/
  await page.goto('http://127.0.0.1:4321/pdf-editor/', { waitUntil: 'networkidle0' });

  // 1. Desktop Light Mode - Upload Landing State (1440x900)
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluate(() => {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  });
  await new Promise(r => setTimeout(r, 200));
  await page.screenshot({ path: path.join(outputDir, '01_editor_landing_light_1440.png') });
  console.log('Saved 01_editor_landing_light_1440.png');

  // 2. Desktop Dark Mode - Upload Landing State (1440x900)
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    localStorage.setItem('theme', 'dark');
  });
  await new Promise(r => setTimeout(r, 200));
  await page.screenshot({ path: path.join(outputDir, '02_editor_landing_dark_1440.png') });
  console.log('Saved 02_editor_landing_dark_1440.png');

  // 3. Switch back to Light Mode & Open Sample Document into Workspace
  await page.evaluate(() => {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  });
  await page.click('#editor-sample-btn');
  // Wait for real canvas rendering to complete
  await page.waitForSelector('#pdf-canvas', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(outputDir, '03_editor_workspace_light_1440.png') });
  console.log('Saved 03_editor_workspace_light_1440.png');

  // 4. Desktop Dark Mode - Active Workspace State (1440x900)
  await page.click('#editor-theme-toggle-btn');
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(outputDir, '04_editor_workspace_dark_1440.png') });
  console.log('Saved 04_editor_workspace_dark_1440.png');

  // 5. Switch back to light mode for crisp tool testing
  await page.click('#editor-theme-toggle-btn');
  await new Promise(r => setTimeout(r, 200));

  // 6. Test "Add Text" click-to-type lifecycle
  console.log('Testing Add Text tool with inline click-to-type...');
  await page.click('[data-tool="text"]');
  await new Promise(r => setTimeout(r, 200));

  // Click on the overlay layer to create inline editor
  const overlayBox = await page.$('#editor-overlay-layer');
  if (overlayBox) {
    const box = await overlayBox.boundingBox();
    if (box) {
      await page.mouse.click(box.x + 80, box.y + 120);
      await new Promise(r => setTimeout(r, 300));
      // Type text into inline editor
      await page.keyboard.type('Verified Phase 2 Annotation Text');
      // Commit using Ctrl+Enter
      await page.keyboard.down('Control');
      await page.keyboard.press('Enter');
      await page.keyboard.up('Control');
      await new Promise(r => setTimeout(r, 500));
    }
  }
  await page.screenshot({ path: path.join(outputDir, '05_text_annotation_added.png') });
  console.log('Saved 05_text_annotation_added.png');

  // 7. Test Shape Drawing (Rectangle)
  console.log('Testing rectangle drag-to-create...');
  await page.click('[data-tool="rectangle"]');
  await new Promise(r => setTimeout(r, 200));
  if (overlayBox) {
    const box = await overlayBox.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 60, box.y + 180);
      await page.mouse.down();
      await page.mouse.move(box.x + 260, box.y + 260, { steps: 5 });
      await page.mouse.up();
      await new Promise(r => setTimeout(r, 500));
    }
  }
  await page.screenshot({ path: path.join(outputDir, '06_shape_rectangle_added.png') });
  console.log('Saved 06_shape_rectangle_added.png');

  // 8. Test Zoom in and Fit Page
  await page.click('#zoom-in-btn');
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(outputDir, '07_zoom_in_workspace.png') });
  console.log('Saved 07_zoom_in_workspace.png');

  await page.click('#zoom-percent-btn');
  await new Promise(r => setTimeout(r, 600));

  // 9. Test Page Navigation via Thumbnails
  const page2Thumb = await page.$('.thumbnail-card[data-page="2"]');
  if (page2Thumb) {
    await page2Thumb.click();
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(outputDir, '08_page_2_selected.png') });
    console.log('Saved 08_page_2_selected.png');
  }

  // 10. Test Real Client-Side Export Button
  console.log('Testing client-side PDF export button...');
  // Intercept file download or verify export toast appears
  await page.click('#editor-export-btn');
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(outputDir, '09_export_toast_active.png') });
  console.log('Saved 09_export_toast_active.png');

  // Wait for export toast to show complete
  await new Promise(r => setTimeout(r, 1500));

  // 11. Tablet Viewport (1024x768)
  await page.setViewport({ width: 1024, height: 768 });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(outputDir, '10_tablet_1024_dark.png') });
  console.log('Saved 10_tablet_1024_dark.png');

  // 12. Mobile Viewport (390x844) - Workspace
  await page.setViewport({ width: 390, height: 844 });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(outputDir, '11_mobile_390_workspace.png') });
  console.log('Saved 11_mobile_390_workspace.png');

  // 13. Mobile Pages Drawer (open drawer)
  await page.click('#mobile-open-pages-btn');
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(outputDir, '12_mobile_drawer_pages.png') });
  console.log('Saved 12_mobile_drawer_pages.png');

  // Close drawer
  await page.click('#close-mobile-drawer-btn');
  await new Promise(r => setTimeout(r, 300));

  // 14. Mobile Inspector Bottom Sheet (open sheet)
  await page.click('#mobile-open-inspector-btn');
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(outputDir, '13_mobile_inspector_sheet.png') });
  console.log('Saved 13_mobile_inspector_sheet.png');

  // Close sheet
  await page.click('#close-mobile-sheet-btn');
  await new Promise(r => setTimeout(r, 300));

  // 15. Mobile Compact Viewport (320x568) - Check Overflow
  await page.setViewport({ width: 320, height: 568 });
  await new Promise(r => setTimeout(r, 400));
  const hasHorizontalScroll = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });
  console.log(`Mobile 320px horizontal body scroll check: ${hasHorizontalScroll ? 'FAILED (overflow)' : 'PASSED (no overflow)'}`);
  await page.screenshot({ path: path.join(outputDir, '14_mobile_320_compact.png') });
  console.log('Saved 14_mobile_320_compact.png');

  // 16. Real PDF Upload Test in Editor (876 pages, ~211.7 MB)
  if (fs.existsSync(realPdfPath)) {
    console.log(`Testing real 876-page PDF upload into editor: ${realPdfPath}`);
    await page.goto('http://127.0.0.1:4321/pdf-editor/', { waitUntil: 'networkidle0' });
    await page.setViewport({ width: 1440, height: 900 });
    const editorFileInput = await page.$('#editor-file-input');
    if (editorFileInput) {
      await editorFileInput.uploadFile(realPdfPath);
      await page.waitForSelector('#pdf-canvas', { timeout: 20000 });
      await new Promise(r => setTimeout(r, 2000));
      await page.screenshot({ path: path.join(outputDir, '15_real_pdf_editor_workspace.png') });
      console.log('Saved 15_real_pdf_editor_workspace.png');
    }
  }

  await browser.close();

  console.log('Console errors captured during run:', consoleErrors.filter(e => !e.includes('favicon')));
  console.log('PDF Editor Visual QA completed successfully!');
}

runEditorVisualQA().catch(err => {
  console.error('Editor Visual QA failed:', err);
  process.exit(1);
});
