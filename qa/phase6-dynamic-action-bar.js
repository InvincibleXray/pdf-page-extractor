import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const browserPath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const targetUrl = 'http://127.0.0.1:4321/pdf-editor/';
const screenshotDir = path.resolve('qa_screenshots/phase6');
const fixturePath = path.resolve('test-fixtures/phase6a/FIXTURE_A_SINGLE_TEXT.pdf');
const jsonReportPath = path.resolve('docs/phase6-dynamic-action-bar.json');

if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

const results = {
  phase: 6,
  phaseName: 'PHASE 6 — DYNAMIC CONTEXT ACTION BAR + TOUCH-FIRST OBJECT MANIPULATION',
  timestamp: new Date().toISOString(),
  targetUrl,
  browser: browserPath,
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    verdict: 'PENDING'
  },
  adversarialMatrix: [],
  mobileTouchMatrix: [],
  zoomMatrix: [],
  existingTextTests: [],
  tests: [],
  screenshots: [],
  physicalDevice: {
    tested: false,
    result: 'NOT TESTED',
    notes: 'Physical mobile device testing was NOT performed in this automated CI/CD environment; headless Edge touch emulation was used.'
  }
};

function record(category, id, name, passed, details = {}) {
  results.summary.total++;
  if (passed) {
    results.summary.passed++;
  } else {
    results.summary.failed++;
  }
  const status = passed ? 'PASS' : 'FAIL';
  const entry = { id, name, status, details };
  results.tests.push(entry);
  if (category === 'adversarial') results.adversarialMatrix.push(entry);
  else if (category === 'mobile') results.mobileTouchMatrix.push(entry);
  else if (category === 'zoom') results.zoomMatrix.push(entry);
  else if (category === 'existing-text') results.existingTextTests.push(entry);

  const icon = passed ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`${icon} ${id}: ${name}`);
  if (details.message) console.log(`   └─ ${details.message}`);
}

async function capture(page, filename, desc) {
  const p = path.join(screenshotDir, filename);
  await page.screenshot({ path: p, fullPage: false });
  results.screenshots.push({ filename, path: p, description: desc });
  return p;
}

function rectOverlap(r1, r2) {
  return !(
    r1.left + r1.width <= r2.left ||
    r1.left >= r2.left + r2.width ||
    r1.top + r1.height <= r2.top ||
    r1.top >= r2.top + r2.height
  );
}

async function runPhase6Verifier() {
  console.log('================================================================');
  console.log('PHASE 6: DYNAMIC CONTEXT ACTION BAR & TOUCH-FIRST MANIPULATION');
  console.log(`Target: ${targetUrl}`);
  console.log(`Browser: ${browserPath}`);
  console.log('================================================================\n');

  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1440,900',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-sync',
      '--disable-translate',
      '--metrics-recording-only',
      '--no-first-run',
      '--safebrowsing-disable-auto-update'
    ]
  });

  const consoleErrors = [];
  const networkLogs = [];

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push({ text: msg.text(), location: msg.location() });
    }
  });

  page.on('request', (req) => {
    const u = req.url().toLowerCase();
    if (
      !u.startsWith('http://localhost') &&
      !u.startsWith('http://127.0.0.1') &&
      !u.startsWith('data:') &&
      !u.startsWith('blob:') &&
      !u.includes('fonts.googleapis.com') &&
      !u.includes('fonts.gstatic.com')
    ) {
      networkLogs.push({ url: req.url(), method: req.method() });
    }
  });

  try {
    // 1. Load editor
    await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 30000 });

    // Upload test fixture
    const fileInput = await page.$('#editor-file-input');
    if (!fileInput) throw new Error('#editor-file-input not found');
    await fileInput.uploadFile(fixturePath);
    await page.waitForSelector('#pdf-canvas', { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 1500));

    console.log('\n--- PART 1: ADVERSARIAL 9-POSITION MATRIX ---');

    const positions = [
      { id: 'POS-A-CENTER', name: 'Center placement', x: 200, y: 350, w: 140, h: 36, shot: 'p6_01_center_placement.png' },
      { id: 'POS-B-TOP', name: 'Top edge placement', x: 200, y: 15, w: 140, h: 36, shot: 'p6_02_top_edge_placement.png' },
      { id: 'POS-C-BOTTOM', name: 'Bottom edge placement', x: 200, y: 780, w: 140, h: 36, shot: 'p6_03_bottom_edge_placement.png' },
      { id: 'POS-D-LEFT', name: 'Left edge placement', x: 10, y: 350, w: 140, h: 36, shot: 'p6_04_left_edge_placement.png' },
      { id: 'POS-E-RIGHT', name: 'Right edge placement', x: 440, y: 350, w: 140, h: 36, shot: 'p6_05_right_edge_placement.png' },
      { id: 'POS-F-TOP-LEFT', name: 'Top-left corner', x: 10, y: 15, w: 140, h: 36, shot: 'p6_06_top_left_corner.png' },
      { id: 'POS-G-TOP-RIGHT', name: 'Top-right corner', x: 440, y: 15, w: 140, h: 36, shot: 'p6_07_top_right_corner.png' },
      { id: 'POS-H-BOTTOM-LEFT', name: 'Bottom-left corner', x: 10, y: 780, w: 140, h: 36, shot: 'p6_08_bottom_left_corner.png' },
      { id: 'POS-I-BOTTOM-RIGHT', name: 'Bottom-right corner', x: 440, y: 780, w: 140, h: 36, shot: 'p6_09_bottom_right_corner.png' }
    ];

    for (const pos of positions) {
      // Add a text object at target coordinates using editorStore
      const objId = await page.evaluate((p) => {
        const store = window.__PDF_EDITOR_STORE__;
        // Clean existing added objects
        const state = store.getState();
        state.objects = [];
        state.selectedObjectId = null;
        store.notify();

        const id = `test-pos-${Date.now()}-${Math.floor(Math.random()*1000)}`;
        store.addObject({
          id,
          type: 'text',
          pageNumber: 1,
          x: p.x,
          y: p.y,
          width: p.w,
          height: p.h,
          rotation: 0,
          opacity: 1,
          zIndex: 10,
          text: `Sample Text ${p.id}`,
          fontFamily: 'Inter',
          fontSize: 14,
          fontWeight: 'normal',
          fontStyle: 'normal',
          textDecoration: 'none',
          textAlign: 'left',
          color: '#0f172a'
        }, false);
        store.selectObject(id);
        return id;
      }, pos);

      await new Promise((r) => setTimeout(r, 200));

      // Measure object and action bar geometry
      const geom = await page.evaluate((id) => {
        const bar = document.getElementById('existing-text-action-bar');
        const objEl = document.getElementById(`obj-${id}`);
        const card = document.getElementById('pdf-page-card');
        if (!bar || !objEl || !card) return null;

        const cardRect = card.getBoundingClientRect();
        const barRect = bar.getBoundingClientRect();
        const objRect = objEl.getBoundingClientRect();

        return {
          barVisible: !bar.classList.contains('hidden'),
          barPlacement: bar.getAttribute('data-placement'),
          barRel: {
            left: barRect.left - cardRect.left,
            top: barRect.top - cardRect.top,
            width: barRect.width,
            height: barRect.height
          },
          objRel: {
            left: objRect.left - cardRect.left,
            top: objRect.top - cardRect.top,
            width: objRect.width,
            height: objRect.height
          },
          cardWidth: cardRect.width,
          cardHeight: cardRect.height
        };
      }, objId);

      const hasOverlap = geom ? rectOverlap(geom.barRel, geom.objRel) : true;
      const withinCard = geom &&
        geom.barRel.left >= 0 &&
        geom.barRel.left + geom.barRel.width <= geom.cardWidth + 2 &&
        geom.barRel.top >= 0 &&
        geom.barRel.top + geom.barRel.height <= geom.cardHeight + 2;

      const posPass = geom && geom.barVisible && !hasOverlap && withinCard;

      record('adversarial', pos.id, `${pos.name} (no collision, within bounds, placement: ${geom?.barPlacement})`, posPass, {
        placement: geom?.barPlacement,
        barRel: geom?.barRel,
        objRel: geom?.objRel,
        hasOverlap,
        withinCard
      });

      await capture(page, pos.shot, `Adversarial position: ${pos.name} (${pos.id})`);
    }

    console.log('\n--- PART 2: TOUCH DRAG PRIORITY & STABILITY LIFECYCLE ---');

    // Create center object for touch drag test
    const dragTestObjId = await page.evaluate(() => {
      const store = window.__PDF_EDITOR_STORE__;
      const state = store.getState();
      state.objects = [];
        state.selectedObjectId = null;
        store.notify();
      const id = `drag-test-obj-${Date.now()}`;
      store.addObject({
        id,
        type: 'text',
        pageNumber: 1,
        x: 200,
        y: 350,
        width: 140,
        height: 36,
        rotation: 0,
        opacity: 1,
        zIndex: 10,
        text: 'Drag Priority Text',
        fontFamily: 'Inter',
        fontSize: 14,
        fontWeight: 'normal',
        fontStyle: 'normal',
        textDecoration: 'none',
        textAlign: 'left',
        color: '#0f172a'
      }, false);
      store.selectObject(id);
      return id;
    });

    await new Promise((r) => setTimeout(r, 200));

    // Verify initial state: action bar active and visible
    const initialBarState = await page.evaluate(() => {
      const bar = document.getElementById('existing-text-action-bar');
      return {
        visible: bar && !bar.classList.contains('hidden'),
        pointerEvents: bar ? window.getComputedStyle(bar).pointerEvents : null,
        opacity: bar ? window.getComputedStyle(bar).opacity : null
      };
    });

    record('adversarial', 'DRAG-01-INITIAL', 'Action bar active and interactable initially',
      initialBarState.visible && initialBarState.pointerEvents === 'auto',
      initialBarState
    );

    // Simulate drag start via CDP DispatchPointerEvent
    const client = await page.target().createCDPSession();
    const objCenter = await page.evaluate((id) => {
      const el = document.getElementById(`obj-${id}`);
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, dragTestObjId);

    // PointerDown on object to initiate drag
    await page.mouse.move(objCenter.x, objCenter.y);
    await page.mouse.down();
    await new Promise((r) => setTimeout(r, 180));

    // Check action bar non-interference during active drag
    const duringDragState = await page.evaluate(() => {
      const bar = document.getElementById('existing-text-action-bar');
      return {
        pointerEvents: bar ? window.getComputedStyle(bar).pointerEvents : null,
        opacity: bar ? parseFloat(window.getComputedStyle(bar).opacity) : 1
      };
    });

    record('adversarial', 'DRAG-02-NON-INTERFERING', 'Action bar non-interfering during drag (pointer-events: none, dimmed opacity)',
      duringDragState.pointerEvents === 'none' && duringDragState.opacity <= 0.5,
      duringDragState
    );

    await capture(page, 'p6_10_touch_drag_active.png', 'Touch drag active: action bar non-interfering');

    // Move pointer by +60px X, +60px Y
    await page.mouse.move(objCenter.x + 30, objCenter.y + 30);
    await new Promise((r) => setTimeout(r, 40));
    await page.mouse.move(objCenter.x + 60, objCenter.y + 60);
    await new Promise((r) => setTimeout(r, 60));

    // Release pointer (pointerUp)
    await page.mouse.up();
    await new Promise((r) => setTimeout(r, 250));

    // Measure post-drag state: object moved, action bar restored and repositioned
    const postDragState = await page.evaluate((id) => {
      const store = window.__PDF_EDITOR_STORE__;
      const sel = store.getSelectedObject();
      const bar = document.getElementById('existing-text-action-bar');
      const objEl = document.getElementById(`obj-${id}`);
      const card = document.getElementById('pdf-page-card');
      const cardRect = card.getBoundingClientRect();
      const barRect = bar.getBoundingClientRect();
      const objRect = objEl.getBoundingClientRect();

      return {
        newCoords: sel ? { x: sel.x, y: sel.y } : null,
        pointerEvents: bar ? window.getComputedStyle(bar).pointerEvents : null,
        opacity: bar ? parseFloat(window.getComputedStyle(bar).opacity) : 0,
        barRel: {
          left: barRect.left - cardRect.left,
          top: barRect.top - cardRect.top,
          width: barRect.width,
          height: barRect.height
        },
        objRel: {
          left: objRect.left - cardRect.left,
          top: objRect.top - cardRect.top,
          width: objRect.width,
          height: objRect.height
        }
      };
    }, dragTestObjId);

    const postDragCollision = rectOverlap(postDragState.barRel, postDragState.objRel);
    const objectMoved = postDragState.newCoords && (postDragState.newCoords.x !== 200 || postDragState.newCoords.y !== 350);

    record('adversarial', 'DRAG-03-COMPLETED', 'Drag completion: object moved, action bar restored, 0 collision at new coords',
      objectMoved && postDragState.pointerEvents === 'auto' && postDragState.opacity >= 0.9 && !postDragCollision,
      { objectMoved, postDragState, postDragCollision }
    );

    await capture(page, 'p6_11_touch_drag_completed.png', 'Touch drag completed: action bar cleanly repositioned');

    console.log('\n--- PART 3: MOBILE TOUCH MATRIX (CDP TOUCH EMULATION) ---');

    const mobileViewports = [
      { name: 'iPhone 12/13 mini', width: 375, height: 812, dpr: 3, shot: 'p6_12_mobile_375x812.png' },
      { name: 'iPhone 13/14', width: 390, height: 844, dpr: 3, shot: 'p6_13_mobile_390x844.png' },
      { name: 'iPhone 14/15 Pro Max', width: 430, height: 932, dpr: 3, shot: 'p6_14_mobile_430x932.png' },
      { name: 'iPad Portrait', width: 768, height: 1024, dpr: 2, shot: 'p6_15_tablet_768x1024.png' }
    ];

    for (const mv of mobileViewports) {
      console.log(`\n  * Testing Mobile Viewport: ${mv.name} (${mv.width}×${mv.height})...`);
      const mPage = await browser.newPage();
      await mPage.setViewport({
        width: mv.width,
        height: mv.height,
        deviceScaleFactor: mv.dpr,
        isMobile: true,
        hasTouch: true
      });

      mPage.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push({ text: `[${mv.width}px] ` + msg.text(), location: msg.location() });
        }
      });
      mPage.on('request', (req) => {
        const u = req.url().toLowerCase();
        if (
          !u.startsWith('http://localhost') &&
          !u.startsWith('http://127.0.0.1') &&
          !u.startsWith('data:') &&
          !u.startsWith('blob:') &&
          !u.includes('fonts.googleapis.com') &&
          !u.includes('fonts.gstatic.com')
        ) {
          networkLogs.push({ url: req.url(), method: req.method() });
        }
      });

      await mPage.goto(targetUrl, { waitUntil: 'networkidle0' });
      const mFileInput = await mPage.$('#editor-file-input');
      await mFileInput.uploadFile(fixturePath);
      await mPage.waitForFunction(() => {
        const ws = document.getElementById('editor-workspace-view');
        const canvas = document.getElementById('pdf-canvas');
        return ws && !ws.classList.contains('hidden') && canvas && canvas.width > 0;
      }, { timeout: 30000 });
      await new Promise((r) => setTimeout(r, 1200));

      // Test text selection and touch target sizes on action bar
      const mobileObjId = await mPage.evaluate((w) => {
        const store = window.__PDF_EDITOR_STORE__;
        const curPageState = store.getCurrentPageState();
        const id = `mob-${w}-${Date.now()}`;
        store.addObject({
          id,
          type: 'text',
          pageNumber: 1,
          pageId: curPageState ? curPageState.id : undefined,
          x: 60,
          y: 120,
          width: 120,
          height: 32,
          rotation: 0,
          opacity: 1,
          zIndex: 10,
          text: `Mobile ${w}px`,
          fontFamily: 'Inter',
          fontSize: 14,
          fontWeight: 'normal',
          fontStyle: 'normal',
          textDecoration: 'none',
          textAlign: 'left',
          color: '#0f172a'
        }, false);
        store.selectObject(id);
        return id;
      }, mv.width);

      await new Promise((r) => setTimeout(r, 600));
      await mPage.waitForSelector('#obj-' + mobileObjId, { timeout: 10000 });
      await mPage.waitForSelector('#existing-text-action-bar:not(.hidden)', { timeout: 10000 });

      // Measure touch targets on action bar
      const touchMetrics = await mPage.evaluate(() => {
        const bar = document.getElementById('existing-text-action-bar');
        if (!bar) return null;
        const btns = Array.from(bar.querySelectorAll('button'));
        const btnHeights = btns.map(b => b.getBoundingClientRect().height);
        const minHeight = Math.min(...btnHeights);
        const maxHeight = Math.max(...btnHeights);
        const barRect = bar.getBoundingClientRect();
        return {
          btnCount: btns.length,
          minHeight,
          maxHeight,
          barVisible: !bar.classList.contains('hidden'),
          barWidth: barRect.width,
          barHeight: barRect.height,
          withinViewport: barRect.left >= 0 && barRect.right <= window.innerWidth + 2
        };
      });

      const touchTargetPass = touchMetrics && touchMetrics.minHeight >= 38 && touchMetrics.withinViewport;

      record('mobile', `MOB-${mv.width}`, `Mobile ${mv.width}×${mv.height} (${mv.name}) touch target & viewport compliance`,
        touchTargetPass,
        { mv, touchMetrics }
      );

      // Verify immediate touch drag on mobile
      const mobObjCenter = await mPage.evaluate((id) => {
        const el = document.getElementById(`obj-${id}`);
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }, mobileObjId);

      await mPage.mouse.move(mobObjCenter.x, mobObjCenter.y);
      await mPage.mouse.down();
      await new Promise((r) => setTimeout(r, 40));

      await mPage.mouse.move(mobObjCenter.x + 25, mobObjCenter.y + 25);
      await new Promise((r) => setTimeout(r, 40));

      await mPage.mouse.up();
      await new Promise((r) => setTimeout(r, 300));

      const mobPostDrag = await mPage.evaluate((id) => {
        const bar = document.getElementById('existing-text-action-bar');
        const objEl = document.getElementById(`obj-${id}`);
        const barRect = bar.getBoundingClientRect();
        const objRect = objEl.getBoundingClientRect();
        return {
          hasOverlap: !(
            barRect.right <= objRect.left ||
            barRect.left >= objRect.right ||
            barRect.bottom <= objRect.top ||
            barRect.top >= objRect.bottom
          ),
          pointerEvents: window.getComputedStyle(bar).pointerEvents
        };
      }, mobileObjId);

      record('mobile', `MOB-DRAG-${mv.width}`, `Mobile ${mv.width}px touch drag object wins & reposition 0 collision`,
        !mobPostDrag.hasOverlap && mobPostDrag.pointerEvents === 'auto',
        mobPostDrag
      );

      await capture(mPage, mv.shot, `Mobile viewport: ${mv.name} (${mv.width}×${mv.height})`);
      await mPage.close();
    }

    console.log('\n--- PART 4: ZOOM MATRIX (50% TO 150%) & SCROLL SAFETY ---');

    const zoomLevels = [0.5, 0.75, 1.0, 1.25, 1.5];
    for (const z of zoomLevels) {
      await page.evaluate((zoom) => {
        const store = window.__PDF_EDITOR_STORE__;
        store.setZoom(zoom);
      }, z);
      await new Promise((r) => setTimeout(r, 1000));

      const zoomState = await page.evaluate(() => {
        const bar = document.getElementById('existing-text-action-bar');
        const selObj = (window.__PDF_EDITOR_STORE__).getSelectedObject();
        if (!bar || !selObj) return null;
        const objEl = document.getElementById(`obj-${selObj.id}`);
        if (!objEl) return null;

        const barRect = bar.getBoundingClientRect();
        const objRect = objEl.getBoundingClientRect();
        const hasOverlap = !(
          barRect.right <= objRect.left ||
          barRect.left >= objRect.right ||
          barRect.bottom <= objRect.top ||
          barRect.top >= objRect.bottom
        );

        return {
          barVisible: !bar.classList.contains('hidden'),
          placement: bar.getAttribute('data-placement'),
          hasOverlap,
          barRect: { left: barRect.left, top: barRect.top, width: barRect.width, height: barRect.height }
        };
      });

      const zPass = zoomState && zoomState.barVisible && !zoomState.hasOverlap;
      record('zoom', `ZOOM-${Math.round(z * 100)}`, `Zoom ${Math.round(z * 100)}%: action bar visible with 0 collision`,
        zPass,
        { zoom: z, zoomState }
      );

      if (z === 1.5) {
        await capture(page, 'p6_18_zoom_150_reposition.png', 'Zoom 150% dynamic action bar reposition');
      }
    }

    // Reset zoom to 100%
    await page.evaluate(() => (window.__PDF_EDITOR_STORE__).setZoom(1.0));
    await new Promise((r) => setTimeout(r, 500));

    console.log('\n--- PART 5: EXISTING PDF TEXT ACTION BAR ---');

    // Click on an existing text item from PDF text layer
    const existingTextResult = await page.evaluate(() => {
      const textLayer = document.getElementById('pdf-text-layer');
      if (!textLayer) return { found: false };
      const span = textLayer.querySelector('span');
      if (!span) return { found: false };
      span.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
      return { found: true, text: span.textContent };
    });

    await new Promise((r) => setTimeout(r, 300));

    const existingBarGeom = await page.evaluate(() => {
      const bar = document.getElementById('existing-text-action-bar');
      const textId = (window.__PDF_EDITOR_STORE__).getSelectedExistingTextId();
      return {
        barVisible: bar && !bar.classList.contains('hidden'),
        selectedTextId: textId,
        placement: bar ? bar.getAttribute('data-placement') : null
      };
    });

    record('existing-text', 'EXT-TEXT-01', 'Existing PDF text click activates dynamic action bar',
      existingBarGeom.barVisible && !!existingBarGeom.selectedTextId,
      existingBarGeom
    );

    await capture(page, 'p6_17_existing_text_action_bar.png', 'Existing PDF text action bar active');

    // Test Underline action on existing text
    await page.click('#underline-existing-text-btn');
    await new Promise((r) => setTimeout(r, 300));

    const underlineCreated = await page.evaluate(() => {
      const objs = (window.__PDF_EDITOR_STORE__).getState().objects;
      return objs.some(o => o.type === 'underline');
    });

    record('existing-text', 'EXT-TEXT-02', 'Underline button creates underline object from existing text',
      underlineCreated,
      { underlineCreated }
    );

    // Final desktop screenshot
    await capture(page, 'p6_16_desktop_1440.png', 'Final desktop 1440px editor state');

    // Check console errors and privacy
    const privacyPass = networkLogs.length === 0;
    record('adversarial', 'NET-PRIVACY', 'Zero external network leaks observed', privacyPass, {
      leakCount: networkLogs.length,
      leaks: networkLogs
    });

    const consolePass = consoleErrors.length === 0;
    record('adversarial', 'CONSOLE-ERRORS', 'Zero unhandled console errors during session', consolePass, {
      errorCount: consoleErrors.length,
      errors: consoleErrors
    });

  } catch (err) {
    console.error('Test run error:', err);
    record('adversarial', 'TEST-RUN-ERROR', 'Test runner exception', false, { error: err.message, stack: err.stack });
  } finally {
    await browser.close();
  }

  // Summary verdict
  results.summary.verdict = results.summary.failed === 0 ? 'PASS' : 'FAIL';
  fs.writeFileSync(jsonReportPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log('\n================================================================');
  console.log(`PHASE 6 TEST RESULTS: ${results.summary.passed}/${results.summary.total} PASSED`);
  console.log(`FINAL VERDICT: ${results.summary.verdict}`);
  console.log(`JSON Report: ${jsonReportPath}`);
  console.log('================================================================\n');

  return results;
}

runPhase6Verifier().catch(console.error);
