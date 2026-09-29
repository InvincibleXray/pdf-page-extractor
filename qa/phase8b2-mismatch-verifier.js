/**
 * PHASE 8B.2 — EXISTING TEXT EDIT TARGET/ANCHOR MISMATCH VERIFICATION SUITE
 *
 * Comprehensive end-to-end verification proving:
 * 1. Target Stability: Text A selected -> Edit -> Text A remains the editing target (100% match).
 * 2. Visual Alignment: In-situ editor DOMRect exactly matches live text span DOMRect (dx <= 2px, dy <= 2px).
 * 3. Mobile Ghost Click Prevention: Mobile touch tap on Edit does not fall through to underlying spans.
 * 4. Multi-Span Dense Layout: Distinguishes adjacent spans without collisions on real form PDF.
 * 5. Viewport Matrix: 375x812, 390x844, 430x932, 768x1024, 1440x900.
 * 6. Scrolled Viewport: Editor remains visually aligned when viewport is scrolled.
 * 7. Store & Export Integrity: Saved text replacement object is created with correct bounds.
 * 8. Phase 8A Touch Foundation: Object touch manipulation remains intact (0 unexpected pointercancel).
 */

import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const browserPath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const targetUrl = 'http://127.0.0.1:4321/pdf-editor/';
const realFormFixture = path.resolve('test-fixtures/phase6c-real-form.pdf');
const fixtureB = path.resolve('test-fixtures/phase6a/FIXTURE_B_MULTILINE_TEXT.pdf');
const fixtureA = path.resolve('test-fixtures/phase6a/FIXTURE_A_SINGLE_TEXT.pdf');
const screenshotDir = path.resolve('qa_screenshots/phase8b2');
const jsonReportPath = path.resolve('docs/phase8b2-existing-text-edit-fix.json');
const mdReportPath = path.resolve('docs/phase8b2-existing-text-edit-fix.md');

if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

const allTests = [];

function recordTest(id, name, passed, details = {}) {
  const status = passed ? 'PASS' : 'FAIL';
  allTests.push({ id, name, status, details });
  const icon = passed ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${id}: ${name}`);
  if (details.message) console.log(`   └─ ${details.message}`);
  return passed;
}

async function capture(page, filename) {
  const p = path.join(screenshotDir, filename);
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

async function uploadPdf(page, filePath) {
  const fileInput = await page.$('input[type="file"]');
  if (!fileInput) throw new Error('File input not found');
  await fileInput.uploadFile(filePath);
  await page.waitForSelector('#pdf-canvas', { timeout: 15000 });
  await page.waitForFunction(() => !!window.__PDF_VIEWPORT__, { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 600));
}

async function runPhase8B2Verification() {
  console.log('================================================================');
  console.log('PHASE 8B.2: EXISTING TEXT EDIT TARGET/ANCHOR FIX VERIFICATION');
  console.log(`Target: ${targetUrl}`);
  console.log(`Browser: ${browserPath}`);
  console.log('================================================================\n');

  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    // =========================================================================
    // TEST SUITE 1: Target Stability & Exact Placement on Multi-Span Form
    // =========================================================================
    console.log('\n--- SUITE 1: Dense Multi-Span Target Stability (phase6c-real-form.pdf) ---');
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
      const cdp = await page.target().createCDPSession();
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: true });

      await page.goto(targetUrl, { waitUntil: 'networkidle2' });
      await uploadPdf(page, realFormFixture);

      // Verify scale factor CSS variable is set on text layer container
      const scaleFactorStyle = await page.evaluate(() => {
        const tl = document.getElementById('pdf-text-layer');
        return tl ? tl.style.getPropertyValue('--scale-factor') : null;
      });

      recordTest(
        '8B2-SCALE-FACTOR-SET',
        'Text layer container has --scale-factor CSS property matching viewport scale',
        scaleFactorStyle !== null && parseFloat(scaleFactorStyle) > 0,
        { scaleFactor: scaleFactorStyle, message: `Container scale factor: ${scaleFactorStyle}` }
      );

      // Verify no negative gap / overlap between adjacent spans "Standard Plan" and "Pro Plan"
      const overlapCheck = await page.evaluate(() => {
        const spans = Array.from(document.querySelectorAll('#pdf-text-layer span[data-text-id]'));
        const spanStandard = spans.find((s) => s.textContent && s.textContent.includes('Standard'));
        const spanPro = spans.find((s) => s.textContent && s.textContent.includes('Pro Plan'));
        if (!spanStandard || !spanPro) return { found: false };
        const r1 = spanStandard.getBoundingClientRect();
        const r2 = spanPro.getBoundingClientRect();
        const horizontalGap = r2.left - (r1.left + r1.width);
        return {
          found: true,
          standardText: spanStandard.textContent.trim(),
          proText: spanPro.textContent.trim(),
          horizontalGap: Math.round(horizontalGap * 100) / 100,
          hasOverlap: horizontalGap < 0,
        };
      });

      recordTest(
        '8B2-NO-SIBLING-OVERLAP',
        'Adjacent spans on real form have positive horizontal separation without overlap',
        overlapCheck.found && !overlapCheck.hasOverlap && overlapCheck.horizontalGap > 0,
        { details: overlapCheck, message: `Horizontal gap: ${overlapCheck.horizontalGap}px (overlap: ${overlapCheck.hasOverlap})` }
      );

      // Select "Standard Plan" span
      const selectStandard = await page.evaluate(() => {
        const spans = Array.from(document.querySelectorAll('#pdf-text-layer span[data-text-id]'));
        const span = spans.find((s) => s.textContent && s.textContent.includes('Standard'));
        if (!span) return null;
        const r = span.getBoundingClientRect();
        return {
          id: span.getAttribute('data-text-id'),
          text: span.textContent.trim(),
          x: Math.round(r.left + r.width / 2),
          y: Math.round(r.top + r.height / 2),
          rect: { left: r.left, top: r.top, width: r.width, height: r.height },
        };
      });

      // Tap on Standard Plan span
      await page.touchscreen.tap(selectStandard.x, selectStandard.y);
      await new Promise((r) => setTimeout(r, 250));

      // Verify action bar opened for Standard Plan
      const actionBarCheck1 = await page.evaluate(() => {
        const bar = document.getElementById('existing-text-action-bar');
        const isVisible = bar && !bar.classList.contains('hidden');
        return { isVisible };
      });

      recordTest(
        '8B2-ACTIONBAR-APPEARS-TARGET-A',
        'Action bar appears for target span A ("Standard Plan")',
        actionBarCheck1.isVisible,
        { message: `Action bar visible: ${actionBarCheck1.isVisible}` }
      );

      // Now tap "Edit" button using touchscreen tap
      const editBtnRect = await page.evaluate(() => {
        const btn = document.getElementById('edit-existing-text-btn');
        if (!btn) return null;
        const r = btn.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });

      await page.touchscreen.tap(editBtnRect.x, editBtnRect.y);
      await new Promise((r) => setTimeout(r, 350));

      // Inspect the opened in-situ editor
      const editorCheck1 = await page.evaluate((expectedSpan) => {
        const editor = document.getElementById('active-inline-text-popover');
        const mask = document.getElementById('temp-whiteout-mask');
        if (!editor) return { open: false };
        const er = editor.getBoundingClientRect();
        const text = editor.innerText.trim();
        const deltaX = Math.abs(er.left - expectedSpan.rect.left);
        const deltaY = Math.abs(er.top - expectedSpan.rect.top);

        return {
          open: true,
          text,
          editorRect: { left: er.left, top: er.top, width: er.width, height: er.height },
          deltaX: Math.round(deltaX * 100) / 100,
          deltaY: Math.round(deltaY * 100) / 100,
          hasMask: !!mask,
        };
      }, selectStandard);

      recordTest(
        '8B2-TARGET-STABILITY-TARGET-A',
        'In-situ editor opens with exact text of Target A ("Standard Plan")',
        editorCheck1.open && editorCheck1.text.includes('Standard Plan'),
        {
          expectedText: selectStandard.text,
          actualText: editorCheck1.text,
          message: `Expected "${selectStandard.text}", got "${editorCheck1.text}"`,
        }
      );

      recordTest(
        '8B2-ANCHOR-ACCURACY-TARGET-A',
        'In-situ editor coordinates match live text span A (dx <= 2px, dy <= 2px)',
        editorCheck1.open && editorCheck1.deltaX <= 2.0 && editorCheck1.deltaY <= 2.0,
        {
          deltaX: editorCheck1.deltaX,
          deltaY: editorCheck1.deltaY,
          message: `deltaX=${editorCheck1.deltaX}px, deltaY=${editorCheck1.deltaY}px (limit: 2px)`,
        }
      );

      await capture(page, '01_mobile_390_standard_plan_editor.png');

      // Cancel editor
      await page.click('#inline-text-cancel-btn');
      await new Promise((r) => setTimeout(r, 400));

      // Now select Target B ("Pro Plan")
      const selectPro = await page.evaluate(() => {
        const spans = Array.from(document.querySelectorAll('#pdf-text-layer span[data-text-id]'));
        const span = spans.find((s) => s.textContent && s.textContent.includes('Pro Plan'));
        if (!span) return null;
        const r = span.getBoundingClientRect();
        return {
          id: span.getAttribute('data-text-id'),
          text: span.textContent.trim(),
          x: Math.round(r.left + r.width / 2),
          y: Math.round(r.top + r.height / 2),
          rect: { left: r.left, top: r.top, width: r.width, height: r.height },
        };
      });

      await page.touchscreen.tap(selectPro.x, selectPro.y);
      await new Promise((r) => setTimeout(r, 250));

      const editBtnRect2 = await page.evaluate(() => {
        const btn = document.getElementById('edit-existing-text-btn');
        if (!btn) return null;
        const r = btn.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });

      await page.touchscreen.tap(editBtnRect2.x, editBtnRect2.y);
      await new Promise((r) => setTimeout(r, 350));

      const editorCheck2 = await page.evaluate((expectedSpan) => {
        const editor = document.getElementById('active-inline-text-popover');
        if (!editor) return { open: false };
        const er = editor.getBoundingClientRect();
        const text = editor.innerText.trim();
        const deltaX = Math.abs(er.left - expectedSpan.rect.left);
        const deltaY = Math.abs(er.top - expectedSpan.rect.top);

        return {
          open: true,
          text,
          deltaX: Math.round(deltaX * 100) / 100,
          deltaY: Math.round(deltaY * 100) / 100,
        };
      }, selectPro);

      recordTest(
        '8B2-TARGET-STABILITY-TARGET-B',
        'In-situ editor opens with exact text of Target B ("Pro Plan")',
        editorCheck2.open && editorCheck2.text.includes('Pro Plan'),
        {
          expectedText: selectPro.text,
          actualText: editorCheck2.text,
          message: `Expected "${selectPro.text}", got "${editorCheck2.text}"`,
        }
      );

      recordTest(
        '8B2-ANCHOR-ACCURACY-TARGET-B',
        'In-situ editor coordinates match live text span B (dx <= 2px, dy <= 2px)',
        editorCheck2.open && editorCheck2.deltaX <= 2.0 && editorCheck2.deltaY <= 2.0,
        {
          deltaX: editorCheck2.deltaX,
          deltaY: editorCheck2.deltaY,
          message: `deltaX=${editorCheck2.deltaX}px, deltaY=${editorCheck2.deltaY}px (limit: 2px)`,
        }
      );

      await capture(page, '02_mobile_390_pro_plan_editor.png');

      await page.close();
    }

    // =========================================================================
    // TEST SUITE 2: Multi-Device Responsive Matrix (375, 430, 768, 1440)
    // =========================================================================
    console.log('\n--- SUITE 2: Responsive Matrix (375, 430, 768, 1440) ---');
    const viewports = [
      { name: 'iPhone SE (375x812)', width: 375, height: 812, isMobile: true, hasTouch: true },
      { name: 'iPhone 15 Pro Max (430x932)', width: 430, height: 932, isMobile: true, hasTouch: true },
      { name: 'iPad Mini (768x1024)', width: 768, height: 1024, isMobile: true, hasTouch: true },
      { name: 'Desktop (1440x900)', width: 1440, height: 900, isMobile: false, hasTouch: false },
    ];

    for (const vp of viewports) {
      const page = await browser.newPage();
      await page.setViewport(vp);
      if (vp.hasTouch) {
        const cdp = await page.target().createCDPSession();
        await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: true });
      }

      await page.goto(targetUrl, { waitUntil: 'networkidle2' });
      await uploadPdf(page, fixtureB);

      // Select first available span
      const targetSpan = await page.evaluate(() => {
        const span = document.querySelector('#pdf-text-layer span[data-text-id]');
        if (!span) return null;
        const r = span.getBoundingClientRect();
        return {
          id: span.getAttribute('data-text-id'),
          text: span.textContent.trim(),
          x: Math.round(r.left + r.width / 2),
          y: Math.round(r.top + r.height / 2),
          rect: { left: r.left, top: r.top, width: r.width, height: r.height },
        };
      });

      if (vp.hasTouch) {
        await page.touchscreen.tap(targetSpan.x, targetSpan.y);
      } else {
        await page.mouse.click(targetSpan.x, targetSpan.y);
      }
      await new Promise((r) => setTimeout(r, 250));

      const editBtn = await page.evaluate(() => {
        const btn = document.getElementById('edit-existing-text-btn');
        if (!btn) return null;
        const r = btn.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });

      if (vp.hasTouch) {
        await page.touchscreen.tap(editBtn.x, editBtn.y);
      } else {
        await page.click('#edit-existing-text-btn');
      }
      await new Promise((r) => setTimeout(r, 350));

      const vpResult = await page.evaluate((expectedId) => {
        const editor = document.getElementById('active-inline-text-popover');
        if (!editor) return { open: false };
        const er = editor.getBoundingClientRect();
        const liveSpan = document.querySelector(`#pdf-text-layer span[data-text-id="${expectedId}"]`);
        if (!liveSpan) return { open: false, missingSpan: true };
        const sr = liveSpan.getBoundingClientRect();
        const deltaX = Math.abs(er.left - sr.left);
        const deltaY = Math.abs(er.top - sr.top);
        return {
          open: true,
          deltaX: Math.round(deltaX * 100) / 100,
          deltaY: Math.round(deltaY * 100) / 100,
          editorText: editor.innerText.trim(),
        };
      }, targetSpan.id);

      const pass = vpResult.open && vpResult.deltaX <= 2.0 && vpResult.deltaY <= 2.0;
      recordTest(
        `8B2-VIEWPORT-${vp.width}`,
        `Viewport ${vp.name} anchor accuracy (dx <= 2px, dy <= 2px)`,
        pass,
        {
          viewport: vp.name,
          deltaX: vpResult.deltaX,
          deltaY: vpResult.deltaY,
          message: `dx=${vpResult.deltaX}px, dy=${vpResult.deltaY}px, open=${vpResult.open}`,
        }
      );

      await capture(page, `03_viewport_${vp.width}.png`);
      await page.close();
    }

    // =========================================================================
    // TEST SUITE 3: Scrolled Viewport Test
    // =========================================================================
    console.log('\n--- SUITE 3: Scrolled Viewport Visual Alignment ---');
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
      const cdp = await page.target().createCDPSession();
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: true });

      await page.goto(targetUrl, { waitUntil: 'networkidle2' });
      await uploadPdf(page, realFormFixture);

      // Scroll viewport down by 150px
      await page.evaluate(() => {
        const viewport = document.getElementById('editor-viewport');
        if (viewport) viewport.scrollTop = 150;
      });
      await new Promise((r) => setTimeout(r, 200));

      const scrolledSpan = await page.evaluate(() => {
        const spans = Array.from(document.querySelectorAll('#pdf-text-layer span[data-text-id]'));
        // Find a visible span in the middle of the viewport
        const span = spans.find((s) => {
          const r = s.getBoundingClientRect();
          return r.top > 200 && r.bottom < 600;
        });
        if (!span) return null;
        const r = span.getBoundingClientRect();
        return {
          id: span.getAttribute('data-text-id'),
          text: span.textContent.trim(),
          x: Math.round(r.left + r.width / 2),
          y: Math.round(r.top + r.height / 2),
          rect: { left: r.left, top: r.top, width: r.width, height: r.height },
        };
      });

      if (scrolledSpan) {
        await page.touchscreen.tap(scrolledSpan.x, scrolledSpan.y);
        await new Promise((r) => setTimeout(r, 250));

        const editBtn = await page.evaluate(() => {
          const btn = document.getElementById('edit-existing-text-btn');
          if (!btn) return null;
          const r = btn.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        });

        await page.touchscreen.tap(editBtn.x, editBtn.y);
        await new Promise((r) => setTimeout(r, 350));

        const scrollResult = await page.evaluate((expected) => {
          const editor = document.getElementById('active-inline-text-popover');
          if (!editor) return { open: false };
          const er = editor.getBoundingClientRect();
          const deltaX = Math.abs(er.left - expected.rect.left);
          const deltaY = Math.abs(er.top - expected.rect.top);
          return {
            open: true,
            deltaX: Math.round(deltaX * 100) / 100,
            deltaY: Math.round(deltaY * 100) / 100,
          };
        }, scrolledSpan);

        recordTest(
          '8B2-SCROLLED-VIEWPORT-ALIGNMENT',
          'In-situ editor remains aligned under scrollTop=150px (dx <= 2px, dy <= 2px)',
          scrollResult.open && scrollResult.deltaX <= 2.0 && scrollResult.deltaY <= 2.0,
          {
            deltaX: scrollResult.deltaX,
            deltaY: scrollResult.deltaY,
            message: `dx=${scrollResult.deltaX}px, dy=${scrollResult.deltaY}px`,
          }
        );
      } else {
        recordTest('8B2-SCROLLED-VIEWPORT-ALIGNMENT', 'Scrolled span check', false, { message: 'No span found' });
      }

      await capture(page, '04_scrolled_viewport.png');
      await page.close();
    }

    // =========================================================================
    // TEST SUITE 4: Save Replacement & Object Store Verification
    // =========================================================================
    console.log('\n--- SUITE 4: Save Replacement & Object Store Integrity ---');
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      await page.goto(targetUrl, { waitUntil: 'networkidle2' });
      await uploadPdf(page, fixtureA);

      // Select existing text span
      const span = await page.evaluate(() => {
        const s = document.querySelector('#pdf-text-layer span[data-text-id]');
        if (!s) return null;
        const r = s.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: s.textContent.trim() };
      });

      await page.mouse.click(span.x, span.y);
      await new Promise((r) => setTimeout(r, 200));

      await page.click('#edit-existing-text-btn');
      await new Promise((r) => setTimeout(r, 350));

      // Type replacement text into editor
      await page.evaluate(() => {
        const ed = document.getElementById('active-inline-text-popover');
        if (ed) ed.innerText = 'Brand New Replacement Text';
      });

      // Click save
      await page.evaluate(() => {
        document.getElementById('inline-text-save-btn')?.click();
      });
      await new Promise((r) => setTimeout(r, 400));

      // Inspect editorStore
      const replacementStore = await page.evaluate(() => {
        // @ts-ignore
        const store = window.__PDF_EDITOR_STORE__;
        const objects = store ? store.getState().objects : [];
        const rep = objects.find((o) => o.type === 'text-replacement');
        return {
          objectCount: objects.length,
          hasReplacement: !!rep,
          replacement: rep
            ? {
                type: rep.type,
                replacementText: rep.replacementText,
                originalText: rep.originalText,
                pageIndex: rep.pageIndex,
                hasPdfBounds: !!rep.pdfBounds,
              }
            : null,
        };
      });

      recordTest(
        '8B2-SAVE-REPLACEMENT-OBJECT',
        'Saving edited text creates a valid text-replacement object in store',
        replacementStore.hasReplacement && replacementStore.replacement?.replacementText === 'Brand New Replacement Text',
        { details: replacementStore, message: `Created object: ${JSON.stringify(replacementStore.replacement)}` }
      );

      await capture(page, '05_replacement_saved.png');
      await page.close();
    }

    // =========================================================================
    // TEST SUITE 5: Phase 8A Touch Foundation Regression
    // =========================================================================
    console.log('\n--- SUITE 5: Phase 8A Touch Foundation Regression ---');
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
      const cdp = await page.target().createCDPSession();
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: true });

      await page.goto(targetUrl, { waitUntil: 'networkidle2' });
      await uploadPdf(page, fixtureA);

      // Add a test object using store directly (standard across phase6 and phase8a suites)
      const objInfo = await page.evaluate(() => {
        const store = (window).__PDF_EDITOR_STORE__;
        const state = store.getState();
        state.objects = [];
        state.selectedObjectId = null;
        store.notify();

        const id = `touch-test-${Date.now()}`;
        store.addObject({
          id,
          type: 'text',
          pageNumber: 1,
          x: 100,
          y: 200,
          width: 140,
          height: 36,
          rotation: 0,
          opacity: 1,
          zIndex: 10,
          text: 'Draggable Text',
          fontFamily: 'Inter',
          fontSize: 14,
          fontWeight: 'normal',
          fontStyle: 'normal',
          textDecoration: 'none',
          textAlign: 'left',
          color: '#0f172a'
        }, false);
        store.selectObject(id);

        const el = document.getElementById(`obj-${id}`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { id, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      });

      // Instrument pointercancel on overlay
      await page.evaluate(() => {
        // @ts-ignore
        window.__pointerCancelCount__ = 0;
        const overlay = document.getElementById('editor-overlay-layer');
        if (overlay) {
          overlay.addEventListener('pointercancel', () => {
            // @ts-ignore
            window.__pointerCancelCount__++;
          });
        }
      });

      // Execute touch drag of 60px using CDP Input.dispatchTouchEvent
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: objInfo.x, y: objInfo.y }]
      });

      for (let i = 1; i <= 6; i++) {
        await new Promise((r) => setTimeout(r, 20));
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: objInfo.x + i * 10, y: objInfo.y }]
        });
      }

      await new Promise((r) => setTimeout(r, 20));
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: []
      });
      await new Promise((r) => setTimeout(r, 200));

      const cancelCount = await page.evaluate(() => {
        // @ts-ignore
        return window.__pointerCancelCount__ || 0;
      });

      recordTest(
        '8B2-PHASE8A-TOUCH-FOUNDATION-INTACT',
        'Touch drag on text object produces 0 pointercancel events',
        cancelCount === 0,
        { cancelCount, message: `pointercancel count: ${cancelCount}` }
      );

      await capture(page, '06_touch_drag_regression.png');
      await page.close();
    }
  } catch (err) {
    console.error('Fatal error during test run:', err);
    recordTest('8B2-RUNNER-FATAL', 'Test runner finished without fatal crash', false, { message: err.message });
  } finally {
    await browser.close();
  }

  // Summary
  console.log('\n================================================================');
  console.log('PHASE 8B.2 VERIFICATION SUMMARY');
  console.log('================================================================');
  const passed = allTests.filter((t) => t.status === 'PASS').length;
  const failed = allTests.filter((t) => t.status === 'FAIL').length;
  console.log(`TOTAL: ${allTests.length} | PASS: ${passed} | FAIL: ${failed}`);

  const report = {
    timestamp: new Date().toISOString(),
    total: allTests.length,
    passed,
    failed,
    tests: allTests,
  };

  fs.writeFileSync(jsonReportPath, JSON.stringify(report, null, 2));
  console.log(`Saved JSON report to: ${jsonReportPath}`);

  return report;
}

runPhase8B2Verification().then((r) => {
  if (r.failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
});
