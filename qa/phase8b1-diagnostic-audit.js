/**
 * PHASE 8B.1 — FORENSIC AUDIT: TEXT EDIT TARGET/ANCHOR MISMATCH
 * Diagnostic test harness to pinpoint the exact root cause of the target/position mismatch.
 */

import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const browserPath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const targetUrl = 'http://127.0.0.1:4321/pdf-editor/';
const fixtureB = path.resolve('test-fixtures/phase6a/FIXTURE_B_MULTILINE_TEXT.pdf');
const fixtureA = path.resolve('test-fixtures/phase6a/FIXTURE_A_SINGLE_TEXT.pdf');

const results = {
  timestamp: new Date().toISOString(),
  investigations: [],
  findings: {},
};

async function uploadPdf(page, filePath) {
  const fileInput = await page.$('input[type="file"]');
  if (!fileInput) throw new Error('File input not found');
  await fileInput.uploadFile(filePath);
  await page.waitForSelector('#pdf-canvas', { timeout: 15000 });
  await page.waitForFunction(() => !!window.__PDF_VIEWPORT__, { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 600));
}

async function runAudit() {
  console.log('================================================================');
  console.log('PHASE 8B.1: FORENSIC AUDIT — TEXT EDIT TARGET/ANCHOR MISMATCH');
  console.log('================================================================\n');

  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Multiple Existing Text Spans Selection & Edit Target Check
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: Multi-Span Target Identity Check (FIXTURE_B) ---');
    const page1 = await browser.newPage();
    await page1.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    const cdp1 = await page1.target().createCDPSession();
    await cdp1.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp1.send('Emulation.setEmitTouchEventsForMouse', { enabled: true });

    await page1.goto(targetUrl, { waitUntil: 'networkidle2' });
    await uploadPdf(page1, fixtureB);

    // Get all spans in text layer
    const spans = await page1.evaluate(() => {
      return Array.from(document.querySelectorAll('#pdf-text-layer span[data-text-id]')).map((s) => {
        const r = s.getBoundingClientRect();
        return {
          id: s.getAttribute('data-text-id'),
          text: s.textContent?.trim(),
          rect: { left: r.left, top: r.top, width: r.width, height: r.height },
          center: { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
        };
      });
    });

    console.log(`Found ${spans.length} text spans in text layer:`, spans.map(s => `[${s.id}] "${s.text}"`).join(', '));

    const test1Record = { test: 'multi_span_identity', spansTested: [] };

    for (const span of spans) {
      console.log(`\nTesting span [${span.id}] "${span.text}" at (${span.center.x}, ${span.center.y})...`);
      
      // Tap span
      await page1.touchscreen.tap(span.center.x, span.center.y);
      await new Promise((r) => setTimeout(r, 300));

      const selectedState = await page1.evaluate(() => {
        const store = window.__PDF_EDITOR_STORE__?.getState();
        const bar = document.getElementById('existing-text-action-bar');
        const barRect = bar ? bar.getBoundingClientRect() : null;
        return {
          selectedExistingTextId: store?.selectedExistingTextId,
          selectedObjectId: store?.selectedObjectId,
          barVisible: bar && !bar.classList.contains('hidden'),
          barRect: barRect ? { left: barRect.left, top: barRect.top, width: barRect.width, height: barRect.height } : null,
          barPlacement: bar ? bar.getAttribute('data-placement') : null,
        };
      });

      console.log(`  Selected Text ID in store: ${selectedState.selectedExistingTextId} (Expected: ${span.id})`);
      console.log(`  Action bar visible: ${selectedState.barVisible} at top:${selectedState.barRect?.top}`);

      // Click Edit button
      await page1.tap('#edit-existing-text-btn');
      await new Promise((r) => setTimeout(r, 300));

      const inSituEditorState = await page1.evaluate(() => {
        const ed = document.getElementById('active-inline-text-popover');
        const pill = document.getElementById('insitu-editor-pill');
        const edRect = ed ? ed.getBoundingClientRect() : null;
        return {
          editorOpen: !!ed,
          editorText: ed ? ed.innerText.trim() : null,
          editorRect: edRect ? { left: edRect.left, top: edRect.top, width: edRect.width, height: edRect.height } : null,
          styleLeft: ed ? ed.style.left : null,
          styleTop: ed ? ed.style.top : null,
        };
      });

      console.log(`  In-Situ Editor Text: "${inSituEditorState.editorText}" (Expected: "${span.text}")`);
      console.log(`  In-Situ Editor Rect: top:${inSituEditorState.editorRect?.top}, left:${inSituEditorState.editorRect?.left}`);
      console.log(`  Target Span Rect:    top:${span.rect.top}, left:${span.rect.left}`);
      const deltaY = Math.abs((inSituEditorState.editorRect?.top || 0) - span.rect.top);
      const deltaX = Math.abs((inSituEditorState.editorRect?.left || 0) - span.rect.left);
      console.log(`  Delta: dx=${deltaX}px, dy=${deltaY}px`);

      test1Record.spansTested.push({
        spanId: span.id,
        expectedText: span.text,
        selectedIdBeforeEdit: selectedState.selectedExistingTextId,
        actualEditorText: inSituEditorState.editorText,
        textMatched: inSituEditorState.editorText === span.text,
        deltaX,
        deltaY,
      });

      // Cancel editor to reset for next span
      if (await page1.$('#inline-text-cancel-btn')) {
        await page1.tap('#inline-text-cancel-btn');
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    results.investigations.push(test1Record);
    await page1.close();

    // -------------------------------------------------------------------------
    // TEST 2: Sequence of Overlay Object Creation -> Then Selecting Existing Text
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Overlay Object Creation -> Existing Text Edit (Cross-contamination) ---');
    const page2 = await browser.newPage();
    await page2.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    const cdp2 = await page2.target().createCDPSession();
    await cdp2.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp2.send('Emulation.setEmitTouchEventsForMouse', { enabled: true });

    await page2.goto(targetUrl, { waitUntil: 'networkidle2' });
    await uploadPdf(page2, fixtureB);

    // 1. Create a new text object at bottom
    await page2.tap('[data-tool="text"]');
    await new Promise((r) => setTimeout(r, 200));
    const canvasBox2 = await page2.evaluate(() => {
      const c = document.getElementById('pdf-canvas');
      const r = c.getBoundingClientRect();
      return { left: r.left, top: r.top };
    });
    await page2.touchscreen.tap(canvasBox2.left + 50, canvasBox2.top + 400);
    await new Promise((r) => setTimeout(r, 300));
    await page2.evaluate(() => {
      const ed = document.getElementById('active-inline-text-popover');
      if (ed) ed.textContent = 'Created Text Box';
    });
    await page2.tap('#inline-text-save-btn');
    await new Promise((r) => setTimeout(r, 300));

    const createdObj = await page2.evaluate(() => {
      const store = window.__PDF_EDITOR_STORE__?.getState();
      return store?.objects?.find((o) => o.text === 'Created Text Box');
    });
    console.log(`Created overlay object: ID=${createdObj?.id}, at (${createdObj?.x}, ${createdObj?.y})`);

    // 2. Now tap existing PDF text span 0 ("Fixture B: Multiline Text Field")
    const span0Pos = await page2.evaluate(() => {
      const s = document.querySelector('#pdf-text-layer span[data-text-id="p1-t0"]');
      const r = s.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });
    console.log(`Tapping existing PDF text span 0 at (${span0Pos.x}, ${span0Pos.y})...`);
    await page2.touchscreen.tap(span0Pos.x, span0Pos.y);
    await new Promise((r) => setTimeout(r, 300));

    const stateBeforeEdit2 = await page2.evaluate(() => {
      const store = window.__PDF_EDITOR_STORE__?.getState();
      return {
        selectedExistingTextId: store?.selectedExistingTextId,
        selectedObjectId: store?.selectedObjectId,
      };
    });
    console.log('State before Edit click:', stateBeforeEdit2);

    // 3. Tap Edit button
    await page2.tap('#edit-existing-text-btn');
    await new Promise((r) => setTimeout(r, 300));

    const editorState2 = await page2.evaluate(() => {
      const ed = document.getElementById('active-inline-text-popover');
      const r = ed ? ed.getBoundingClientRect() : null;
      return {
        open: !!ed,
        text: ed ? ed.innerText.trim() : null,
        top: r ? r.top : null,
        left: r ? r.left : null,
      };
    });
    console.log('In-situ editor opened:', editorState2);
    results.investigations.push({
      test: 'overlay_then_existing_text',
      createdObjId: createdObj?.id,
      stateBeforeEdit: stateBeforeEdit2,
      editorState: editorState2,
      matchedExpected: editorState2.text === 'Fixture B: Multiline Text Field',
    });
    await page2.close();

    // -------------------------------------------------------------------------
    // TEST 3: SCROLLED VIEWPORT (Scroll offset impact on in-situ editor positioning)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Scrolled Viewport Coordinate Offset ---');
    const page3 = await browser.newPage();
    await page3.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    const cdp3 = await page3.target().createCDPSession();
    await cdp3.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp3.send('Emulation.setEmitTouchEventsForMouse', { enabled: true });

    await page3.goto(targetUrl, { waitUntil: 'networkidle2' });
    await uploadPdf(page3, fixtureB);

    // Scroll editor viewport vertically by 150px
    await page3.evaluate(() => {
      const vp = document.getElementById('editor-viewport');
      if (vp) vp.scrollTop = 150;
    });
    await new Promise((r) => setTimeout(r, 300));

    const scrollInfo = await page3.evaluate(() => {
      const vp = document.getElementById('editor-viewport');
      return { scrollTop: vp?.scrollTop, scrollLeft: vp?.scrollLeft };
    });
    console.log(`Viewport scrolled: scrollTop=${scrollInfo.scrollTop}, scrollLeft=${scrollInfo.scrollLeft}`);

    // Get position of span 1 after scroll
    const span1AfterScroll = await page3.evaluate(() => {
      const s = document.querySelector('#pdf-text-layer span[data-text-id="p1-t1"]');
      const r = s.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), rect: { left: r.left, top: r.top, width: r.width, height: r.height } };
    });

    console.log(`Tapping span 1 at (${span1AfterScroll.x}, ${span1AfterScroll.y})...`);
    await page3.touchscreen.tap(span1AfterScroll.x, span1AfterScroll.y);
    await new Promise((r) => setTimeout(r, 300));

    const barAfterScroll = await page3.evaluate(() => {
      const bar = document.getElementById('existing-text-action-bar');
      const r = bar ? bar.getBoundingClientRect() : null;
      return { visible: bar && !bar.classList.contains('hidden'), top: r?.top, left: r?.left };
    });
    console.log('Action bar after scroll:', barAfterScroll);

    await page3.tap('#edit-existing-text-btn');
    await new Promise((r) => setTimeout(r, 300));

    const editorAfterScroll = await page3.evaluate(() => {
      const ed = document.getElementById('active-inline-text-popover');
      const r = ed ? ed.getBoundingClientRect() : null;
      return {
        open: !!ed,
        text: ed ? ed.innerText.trim() : null,
        rect: r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null,
        styleLeft: ed ? ed.style.left : null,
        styleTop: ed ? ed.style.top : null,
      };
    });

    console.log('In-situ editor after scroll:', editorAfterScroll);
    console.log('Target span rect after scroll:', span1AfterScroll.rect);
    const scrollDeltaY = Math.abs((editorAfterScroll.rect?.top || 0) - span1AfterScroll.rect.top);
    console.log(`Delta after scroll: dy=${scrollDeltaY}px`);

    results.investigations.push({
      test: 'scrolled_viewport',
      scrollInfo,
      spanRect: span1AfterScroll.rect,
      editorRect: editorAfterScroll.rect,
      editorText: editorAfterScroll.text,
      deltaY: scrollDeltaY,
    });
    await page3.close();

    // -------------------------------------------------------------------------
    // TEST 4: Viewport & Zoom Matrix (50%, 100%, 150%) across 5 Viewports
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Viewport & Zoom Matrix ---');
    const viewports = [
      { name: 'iPhone SE', w: 375, h: 812 },
      { name: 'iPhone 14', w: 390, h: 844 },
      { name: 'iPhone 14 Pro Max', w: 430, h: 932 },
      { name: 'iPad Portrait', w: 768, h: 1024 },
      { name: 'Desktop', w: 1440, h: 900 },
    ];

    const zoomLevels = [0.5, 1.0, 1.5];

    for (const vp of viewports) {
      for (const zoom of zoomLevels) {
        const vpPage = await browser.newPage();
        await vpPage.setViewport({ width: vp.w, height: vp.h, isMobile: vp.w < 1000, hasTouch: vp.w < 1000 });
        if (vp.w < 1000) {
          const cdp = await vpPage.target().createCDPSession();
          await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
          await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: true });
        }

        await vpPage.goto(targetUrl, { waitUntil: 'networkidle2' });
        await uploadPdf(vpPage, fixtureB);

        // Apply zoom
        await vpPage.evaluate((z) => {
          window.__PDF_EDITOR_STORE__?.setZoom(z);
        }, zoom);
        await new Promise((r) => setTimeout(r, 400));

        // Get span 0 target
        const target = await vpPage.evaluate(() => {
          const s = document.querySelector('#pdf-text-layer span[data-text-id="p1-t0"]');
          if (!s) return null;
          const r = s.getBoundingClientRect();
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), rect: { left: r.left, top: r.top } };
        });

        if (target) {
          if (vp.w < 1000) {
            await vpPage.touchscreen.tap(target.x, target.y);
          } else {
            await vpPage.mouse.click(target.x, target.y);
          }
          await new Promise((r) => setTimeout(r, 250));

          await vpPage.click('#edit-existing-text-btn');
          await new Promise((r) => setTimeout(r, 250));

          const edResult = await vpPage.evaluate(() => {
            const ed = document.getElementById('active-inline-text-popover');
            const r = ed ? ed.getBoundingClientRect() : null;
            return {
              text: ed ? ed.innerText.trim() : null,
              rect: r ? { left: r.left, top: r.top } : null,
            };
          });

          const dY = Math.abs((edResult.rect?.top || 0) - target.rect.top);
          const dX = Math.abs((edResult.rect?.left || 0) - target.rect.left);
          console.log(`[${vp.name} @ ${(zoom * 100)}%] text="${edResult.text}" delta=(dx:${dX}px, dy:${dY}px)`);

          results.investigations.push({
            test: 'viewport_zoom_matrix',
            viewport: vp.name,
            dimensions: `${vp.w}x${vp.h}`,
            zoom,
            textMatched: edResult.text === 'Fixture B: Multiline Text Field',
            deltaX: dX,
            deltaY: dY,
          });
        }
        await vpPage.close();
      }
    }

    // -------------------------------------------------------------------------
    // TEST 5: Touch-Tap Penetration / Ghost Click on Mobile Action Bar
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Touch Tap Event Propagation / Underlying Element Inspection ---');
    const page5 = await browser.newPage();
    await page5.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    const cdp5 = await page5.target().createCDPSession();
    await cdp5.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp5.send('Emulation.setEmitTouchEventsForMouse', { enabled: true });

    await page5.goto(targetUrl, { waitUntil: 'networkidle2' });
    await uploadPdf(page5, fixtureB);

    // Tap span 0 to bring up action bar
    const span0 = await page5.evaluate(() => {
      const s = document.querySelector('#pdf-text-layer span[data-text-id="p1-t0"]');
      const r = s.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });
    await page5.touchscreen.tap(span0.x, span0.y);
    await new Promise((r) => setTimeout(r, 300));

    // Inspect what element is physically underneath #edit-existing-text-btn
    const underEditBtn = await page5.evaluate(() => {
      const btn = document.getElementById('edit-existing-text-btn');
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      const centerX = Math.round(r.left + r.width / 2);
      const centerY = Math.round(r.top + r.height / 2);

      // Hide action bar temporarily to hit-test what's underneath
      const bar = document.getElementById('existing-text-action-bar');
      bar.style.pointerEvents = 'none';
      const elUnder = document.elementFromPoint(centerX, centerY);
      bar.style.pointerEvents = '';

      return {
        btnRect: { left: r.left, top: r.top, width: r.width, height: r.height },
        centerX,
        centerY,
        elementUnderneath: {
          tagName: elUnder?.tagName,
          id: elUnder?.id,
          className: elUnder?.className,
          text: elUnder?.textContent?.trim(),
          dataTextId: elUnder?.getAttribute('data-text-id'),
          dataObjectId: elUnder?.getAttribute('data-object-id'),
        }
      };
    });

    console.log('Element physically located directly behind #edit-existing-text-btn:');
    console.log(JSON.stringify(underEditBtn, null, 2));

    results.investigations.push({
      test: 'underlying_element_behind_edit_btn',
      underEditBtn
    });

    await page5.close();

    console.log('\n================================================================');
    console.log('AUDIT HARNESS COMPLETED');
    console.log('================================================================\n');

    fs.writeFileSync(
      path.resolve('docs/phase8b1-diagnostic-raw.json'),
      JSON.stringify(results, null, 2)
    );

  } finally {
    await browser.close();
  }
}

runAudit().catch(console.error);
