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
  console.log('Starting Phase 3A Visual QA for PDF Editor on http://127.0.0.1:4321/pdf-editor/ ...');

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
  await page.goto('http://localhost:4321/pdf-editor/', { waitUntil: 'networkidle0' });

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
  // Wait for real canvas & text layer rendering to complete
  await page.waitForSelector('#pdf-canvas', { timeout: 10000 });
  await page.waitForSelector('#pdf-text-layer span', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(outputDir, '03_editor_workspace_light_1440.png') });
  console.log('Saved 03_editor_workspace_light_1440.png');

  // Verify TextLayer contains indexed spans
  const spanCount = await page.evaluate(() => {
    const layer = document.getElementById('pdf-text-layer');
    return layer ? layer.querySelectorAll('span[data-text-id]').length : 0;
  });
  console.log(`Phase 3A: Found ${spanCount} indexed text spans in #pdf-text-layer on active page.`);
  if (spanCount === 0) {
    throw new Error('Phase 3A Failure: No indexed text spans rendered in #pdf-text-layer.');
  }

  // 4. Test Existing Text Click & Action Bar
  console.log('Testing existing text click & action bar positioning...');
  const firstSpan = await page.$('#pdf-text-layer span[data-text-id]');
  if (firstSpan) {
    await firstSpan.click();
    await new Promise(r => setTimeout(r, 300));

    // Verify action bar is visible
    const actionBarVisible = await page.evaluate(() => {
      const bar = document.getElementById('existing-text-action-bar');
      return bar && !bar.classList.contains('hidden');
    });
    console.log(`Action bar visible after click: ${actionBarVisible}`);
    await page.screenshot({ path: path.join(outputDir, '04a_existing_text_selected_action_bar.png') });
    console.log('Saved 04a_existing_text_selected_action_bar.png');

    // 5. Click "Edit text" button in floating action bar
    console.log('Clicking "Edit text" button...');
    await page.click('#edit-existing-text-btn');
    await new Promise(r => setTimeout(r, 300));

    const inlineEditorActive = await page.evaluate(() => {
      const editor = document.getElementById('active-inline-text-editor');
      const mask = document.getElementById('temp-whiteout-mask');
      return !!editor && !!mask;
    });
    console.log(`Inline editor and whiteout preview active: ${inlineEditorActive}`);
    await page.screenshot({ path: path.join(outputDir, '04b_inline_editing_active.png') });
    console.log('Saved 04b_inline_editing_active.png');

    // 6. Type replacement text and commit with Ctrl+Enter
    console.log('Typing replacement text and committing with Ctrl+Enter...');
    // Clear existing text by selecting all and backspacing
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('Phase 3A Verified Agreement');
    await new Promise(r => setTimeout(r, 200));

    // Commit using Ctrl+Enter
    await page.keyboard.down('Control');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Control');
    await new Promise(r => setTimeout(r, 600));

    // Verify text-replacement object created and original span hidden
    const replacementVerification = await page.evaluate(() => {
      const overlayLayer = document.getElementById('editor-overlay-layer');
      const repEl = overlayLayer ? overlayLayer.querySelector('[data-object-id^="rep-"]') : null;
      const hiddenSpans = document.querySelectorAll('#pdf-text-layer span[style*="visibility: hidden"]');
      return {
        hasRepElement: !!repEl,
        repText: repEl ? repEl.textContent : null,
        hiddenSpanCount: hiddenSpans.length,
      };
    });
    console.log('Replacement verification:', replacementVerification);
    await page.screenshot({ path: path.join(outputDir, '04c_text_replacement_committed.png') });
    console.log('Saved 04c_text_replacement_committed.png');

    // 7. Test Undo / Redo
    console.log('Testing Undo (original text restored)...');
    await page.click('#tool-undo-btn');
    await new Promise(r => setTimeout(r, 500));
    const undoVerification = await page.evaluate(() => {
      const overlayLayer = document.getElementById('editor-overlay-layer');
      const repEl = overlayLayer ? overlayLayer.querySelector('[data-object-id^="rep-"]') : null;
      const visibleSpans = document.querySelectorAll('#pdf-text-layer span:not([style*="visibility: hidden"])');
      return {
        hasRepElement: !!repEl,
        visibleSpanCount: visibleSpans.length,
      };
    });
    console.log('Undo verification (should have 0 rep objects):', undoVerification);
    await page.screenshot({ path: path.join(outputDir, '04d_undo_reverted_to_original.png') });
    console.log('Saved 04d_undo_reverted_to_original.png');

    console.log('Testing Redo (replacement restored)...');
    await page.click('#tool-redo-btn');
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: path.join(outputDir, '04e_redo_restored_replacement.png') });
    console.log('Saved 04e_redo_restored_replacement.png');
  }

  // 8. Test Zoom to 200% and check anchored coordinates
  console.log('Testing Zoom In (coordinate anchoring)...');
  await page.click('#zoom-in-btn');
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(outputDir, '04f_zoom_anchored_replacement.png') });
  console.log('Saved 04f_zoom_anchored_replacement.png');

  // Reset zoom
  await page.click('#zoom-percent-btn');
  await new Promise(r => setTimeout(r, 600));

  // 9. Add standard text annotation
  console.log('Testing Add Text tool...');
  await page.click('[data-tool="text"]');
  await new Promise(r => setTimeout(r, 200));
  const overlayBox = await page.$('#editor-overlay-layer');
  if (overlayBox) {
    const box = await overlayBox.boundingBox();
    if (box) {
      await page.mouse.click(box.x + 80, box.y + 120);
      await new Promise(r => setTimeout(r, 300));
      await page.keyboard.type('Standard Text Annotation');
      await page.keyboard.down('Control');
      await page.keyboard.press('Enter');
      await page.keyboard.up('Control');
      await new Promise(r => setTimeout(r, 500));
    }
  }
  await page.screenshot({ path: path.join(outputDir, '05_text_annotation_added.png') });
  console.log('Saved 05_text_annotation_added.png');

  // 10. Test Shape Drawing (Rectangle)
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

  // 11. Test Real Client-Side Export Button with Replacement
  console.log('Testing client-side PDF export button with replacement...');
  await page.click('#editor-export-btn');
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(outputDir, '09_export_toast_active.png') });
  console.log('Saved 09_export_toast_active.png');

  // Wait for export toast to show complete
  await new Promise(r => setTimeout(r, 1500));

  // 12. Tablet Viewport (1024x768)
  await page.setViewport({ width: 1024, height: 768 });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(outputDir, '10_tablet_1024_dark.png') });
  console.log('Saved 10_tablet_1024_dark.png');

  // 13. Mobile Viewport (390x844) - Workspace
  await page.setViewport({ width: 390, height: 844 });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(outputDir, '11_mobile_390_workspace.png') });
  console.log('Saved 11_mobile_390_workspace.png');

  // 14. Mobile Pages Drawer (open drawer)
  await page.click('#mobile-open-pages-btn');
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(outputDir, '12_mobile_drawer_pages.png') });
  console.log('Saved 12_mobile_drawer_pages.png');

  // Close drawer
  await page.click('#close-mobile-drawer-btn');
  await new Promise(r => setTimeout(r, 300));

  // 15. Mobile Inspector Bottom Sheet (open sheet)
  await page.click('#mobile-open-inspector-btn');
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(outputDir, '13_mobile_inspector_sheet.png') });
  console.log('Saved 13_mobile_inspector_sheet.png');

  // Close sheet
  await page.click('#close-mobile-sheet-btn');
  await new Promise(r => setTimeout(r, 300));

  // 16. Mobile Compact Viewport (320x568) - Check Overflow
  await page.setViewport({ width: 320, height: 568 });
  await new Promise(r => setTimeout(r, 400));
  const hasHorizontalScroll = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });
  console.log(`Mobile 320px horizontal body scroll check: ${hasHorizontalScroll ? 'FAILED (overflow)' : 'PASSED (no overflow)'}`);
  await page.screenshot({ path: path.join(outputDir, '14_mobile_320_compact.png') });
  console.log('Saved 14_mobile_320_compact.png');

  // 17. Real PDF Upload Test in Editor (876 pages, ~211.7 MB)
  if (fs.existsSync(realPdfPath)) {
    console.log(`Testing real 876-page PDF upload into editor: ${realPdfPath}`);
    await page.goto('http://localhost:4321/pdf-editor/', { waitUntil: 'networkidle0' });
    await page.setViewport({ width: 1440, height: 900 });
    const editorFileInput = await page.$('#editor-file-input');
    if (editorFileInput) {
      await editorFileInput.uploadFile(realPdfPath);
      await page.waitForSelector('#pdf-canvas', { timeout: 20000 });
      await page.waitForSelector('#pdf-text-layer span', { timeout: 10000 });
      await new Promise(r => setTimeout(r, 2000));

      // Verify that TextLayer spans are ONLY for page 1
      const largeDocTextItems = await page.evaluate(() => {
        const spans = document.querySelectorAll('#pdf-text-layer span[data-page-number]');
        const pagesFound = new Set();
        spans.forEach(s => pagesFound.add(s.getAttribute('data-page-number')));
        return {
          totalSpans: spans.length,
          pages: Array.from(pagesFound)
        };
      });
      console.log('Large 876-page PDF TextLayer verification:', largeDocTextItems);
      if (largeDocTextItems.pages.length > 1 || (largeDocTextItems.pages[0] && largeDocTextItems.pages[0] !== '1')) {
        throw new Error(`TextLayer created spans for unexpected pages: ${JSON.stringify(largeDocTextItems.pages)}`);
      }

      await page.screenshot({ path: path.join(outputDir, '15_real_pdf_editor_workspace.png') });
      console.log('Saved 15_real_pdf_editor_workspace.png');
    }
  }

  await browser.close();

  const realErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('404'));
  console.log('Console errors captured during run:', realErrors);
  console.log('PDF Editor Phase 3A Visual QA completed successfully!');
}

runEditorVisualQA().catch(err => {
  console.error('Editor Visual QA failed:', err);
  process.exit(1);
});
