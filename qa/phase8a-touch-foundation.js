import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const browserPath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const targetUrl = 'http://127.0.0.1:4321/pdf-editor/';
const screenshotDir = path.resolve('qa_screenshots/phase8a');
const fixturePath = path.resolve('test-fixtures/phase6a/FIXTURE_A_SINGLE_TEXT.pdf');
const jsonReportPath = path.resolve('docs/phase8a-touch-interaction-foundation.json');

if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

const results = {
  phase: '8A',
  phaseName: 'PHASE 8A — TOUCH INTERACTION FOUNDATION',
  timestamp: new Date().toISOString(),
  targetUrl,
  browser: browserPath,
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    verdict: 'PENDING'
  },
  distanceMatrix: [],
  objectTypeMatrix: [],
  viewportMatrix: [],
  zoomMatrix: [],
  scrollingAndLifecycleMatrix: [],
  tests: [],
  screenshots: [],
  physicalDevice: {
    tested: false,
    result: 'NOT TESTED',
    notes: 'Physical mobile device testing was NOT performed in this automated CI/CD environment; headless Edge CDP touch emulation was used.'
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

  if (category === 'distance') results.distanceMatrix.push(entry);
  else if (category === 'objectType') results.objectTypeMatrix.push(entry);
  else if (category === 'viewport') results.viewportMatrix.push(entry);
  else if (category === 'zoom') results.zoomMatrix.push(entry);
  else if (category === 'lifecycle') results.scrollingAndLifecycleMatrix.push(entry);

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

async function setupPage(browser, width, height, dpr = 2) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  const client = await page.target().createCDPSession();
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await client.send('Emulation.setEmitTouchEventsForMouse', { enabled: true });

  await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 30000 });
  const fileInput = await page.$('#editor-file-input');
  if (!fileInput) throw new Error('#editor-file-input not found');
  await fileInput.uploadFile(fixturePath);
  await page.waitForSelector('#pdf-canvas', { timeout: 15000 });
  await page.waitForFunction(() => !!(window).__PDF_VIEWPORT__, { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));

  return { page, client };
}

async function attachPointerSpy(page) {
  await page.evaluate(() => {
    (window).__TOUCH_EVENTS__ = [];
    const recordEvent = (e) => {
      (window).__TOUCH_EVENTS__.push({
        type: e.type,
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        clientX: Math.round(e.clientX),
        clientY: Math.round(e.clientY),
        targetId: (e.target).id || (e.target).className || (e.target).tagName,
        time: performance.now()
      });
    };
    ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'gotpointercapture', 'lostpointercapture'].forEach((evt) => {
      window.addEventListener(evt, recordEvent, { capture: true, passive: true });
    });
  });
}

async function getPointerSpyEvents(page) {
  return await page.evaluate(() => {
    const evts = (window).__TOUCH_EVENTS__ || [];
    (window).__TOUCH_EVENTS__ = [];
    return evts;
  });
}

async function dispatchTouchDrag(client, startX, startY, deltaX, deltaY, stepCount = 10, stepDelay = 20) {
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: Math.round(startX), y: Math.round(startY) }]
  });

  for (let i = 1; i <= stepCount; i++) {
    await new Promise((r) => setTimeout(r, stepDelay));
    const curX = Math.round(startX + (deltaX * i) / stepCount);
    const curY = Math.round(startY + (deltaY * i) / stepCount);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: curX, y: curY }]
    });
  }

  await new Promise((r) => setTimeout(r, stepDelay));
  const finalX = Math.round(startX + deltaX);
  const finalY = Math.round(startY + deltaY);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: []
  });
}

async function runSuite() {
  console.log('================================================================');
  console.log('PHASE 8A: TOUCH INTERACTION FOUNDATION VERIFICATION SUITE');
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

  try {
    // -------------------------------------------------------------------------
    // TEST SECTION 1: CONTINUOUS DISTANCE MATRIX (20px, 50px, 100px, 200px, 300px)
    // -------------------------------------------------------------------------
    console.log('\n--- PART 1: CONTINUOUS DISTANCE MATRIX (390x844 Mobile Viewport) ---');
    const { page, client } = await setupPage(browser, 390, 844);
    await attachPointerSpy(page);

    const testDistances = [20, 50, 100, 200, 300];

    for (const delta of testDistances) {
      // Create a fresh text object at known coordinates
      const startPos = { x: 50, y: 150 };
      const objId = await page.evaluate((pos, d) => {
        const store = (window).__PDF_EDITOR_STORE__;
        const state = store.getState();
        state.objects = [];
        state.selectedObjectId = null;
        store.notify();

        const id = `dist-test-${d}-${Date.now()}`;
        store.addObject({
          id,
          type: 'text',
          pageNumber: 1,
          x: pos.x,
          y: pos.y,
          width: 140,
          height: 36,
          rotation: 0,
          opacity: 1,
          zIndex: 10,
          text: `Dist Test ${d}px`,
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
      }, startPos, delta);

      await new Promise((r) => setTimeout(r, 200));

      // Get screen center coordinates of object
      const objScreenPos = await page.evaluate((id) => {
        const el = document.getElementById(`obj-${id}`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }, objId);

      // Clear spy events before drag
      await getPointerSpyEvents(page);

      // Execute touch drag of +delta X, +delta/2 Y
      const deltaX = delta;
      const deltaY = Math.round(delta * 0.5);
      const steps = Math.max(8, Math.round(delta / 10));

      await dispatchTouchDrag(client, objScreenPos.x, objScreenPos.y, deltaX, deltaY, steps, 15);
      await new Promise((r) => setTimeout(r, 250));

      const spyEvents = await getPointerSpyEvents(page);
      const pointerCancelEvents = spyEvents.filter((e) => e.type === 'pointercancel');
      const pointerMoveEvents = spyEvents.filter((e) => e.type === 'pointermove');
      const pointerUpEvents = spyEvents.filter((e) => e.type === 'pointerup');

      // Check object new position in store
      const endPos = await page.evaluate((id) => {
        const store = (window).__PDF_EDITOR_STORE__;
        const obj = store.getState().objects.find((o) => o.id === id);
        return obj ? { x: obj.x, y: obj.y } : null;
      }, objId);

      // Expected change in PDF coords (clamped by document boundary)
      const { scale, pageDims } = await page.evaluate(() => {
        const store = (window).__PDF_EDITOR_STORE__;
        const page = store.getState().document?.pages[0];
        const vp = (window).__PDF_VIEWPORT__;
        return {
          scale: vp ? vp.scale : 1,
          pageDims: page ? { width: page.width, height: page.height } : { width: 595, height: 842 }
        };
      });
      const maxDeltaX = pageDims.width - startPos.x - 140;
      const maxDeltaY = pageDims.height - startPos.y - 36;
      const expectedPdfDeltaX = Math.min(deltaX / scale, maxDeltaX);
      const expectedPdfDeltaY = Math.min(deltaY / scale, maxDeltaY);
      const actualPdfDeltaX = endPos ? endPos.x - startPos.x : 0;
      const actualPdfDeltaY = endPos ? endPos.y - startPos.y : 0;

      const passedNoCancel = pointerCancelEvents.length === 0;
      const passedHasMoves = pointerMoveEvents.length >= Math.floor(steps * 0.7);
      const passedHasUp = pointerUpEvents.length >= 1;
      const passedPositionDelta = Math.abs(actualPdfDeltaX - expectedPdfDeltaX) <= 2 && Math.abs(actualPdfDeltaY - expectedPdfDeltaY) <= 2;

      const allPassed = passedNoCancel && passedHasMoves && passedHasUp && passedPositionDelta;

      record('distance', `DIST-${delta}PX`, `Touch drag continuous past ${delta}px without pointercancel`, allPassed, {
        delta,
        pointerCancelCount: pointerCancelEvents.length,
        pointerMoveCount: pointerMoveEvents.length,
        pointerUpCount: pointerUpEvents.length,
        startPos,
        endPos,
        expectedDelta: { x: expectedPdfDeltaX, y: expectedPdfDeltaY },
        actualDelta: { x: actualPdfDeltaX, y: actualPdfDeltaY },
        message: allPassed
          ? `Moved ${delta}px: 0 pointercancel, ${pointerMoveEvents.length} pointermoves, delta exact`
          : `Failed: cancels=${pointerCancelEvents.length}, moves=${pointerMoveEvents.length}, expectedX=${expectedPdfDeltaX}, actualX=${actualPdfDeltaX}`
      });

      await capture(page, `p8a_dist_${delta}px.png`, `Continuous touch drag at ${delta}px`);
    }

    // -------------------------------------------------------------------------
    // TEST SECTION 2: OBJECT TYPE MATRIX (Text, Shape, Resize Handle)
    // -------------------------------------------------------------------------
    console.log('\n--- PART 2: OBJECT TYPE MATRIX ---');

    // 2.1 Drag Shape Object (Rectangle)
    const shapeId = await page.evaluate(() => {
      const store = (window).__PDF_EDITOR_STORE__;
      const state = store.getState();
      state.objects = [];
      store.notify();

      const id = `rect-shape-${Date.now()}`;
      store.addObject({
        id,
        type: 'rectangle',
        pageNumber: 1,
        x: 60,
        y: 200,
        width: 120,
        height: 80,
        rotation: 0,
        opacity: 1,
        zIndex: 5,
        fillColor: '#eff6ff',
        strokeColor: '#2563eb',
        strokeWidth: 2,
        strokeStyle: 'solid',
        borderRadius: 4
      }, false);
      store.selectObject(id);
      return id;
    });
    await new Promise((r) => setTimeout(r, 200));

    const shapeScreen = await page.evaluate((id) => {
      const el = document.getElementById(`obj-${id}`);
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, shapeId);

    await getPointerSpyEvents(page);
    await dispatchTouchDrag(client, shapeScreen.x, shapeScreen.y, 80, 40, 10, 20);
    await new Promise((r) => setTimeout(r, 250));

    const shapeSpy = await getPointerSpyEvents(page);
    const shapePos = await page.evaluate((id) => {
      const obj = (window).__PDF_EDITOR_STORE__.getState().objects.find((o) => o.id === id);
      return obj ? { x: obj.x, y: obj.y } : null;
    }, shapeId);

    const shapePassed = shapeSpy.filter((e) => e.type === 'pointercancel').length === 0 && shapePos && shapePos.x > 60;
    record('objectType', 'OBJ-SHAPE-DRAG', 'Rectangle shape dragged continuously with touch (0 pointercancel)', shapePassed, {
      finalPos: shapePos,
      cancelCount: shapeSpy.filter((e) => e.type === 'pointercancel').length,
      message: shapePassed ? 'Shape moved successfully without cancel' : 'Shape drag failed'
    });
    await capture(page, 'p8a_shape_drag.png', 'Shape drag with touch');

    // 2.2 Resize Object via Touch Handle
    const handleScreen = await page.evaluate(() => {
      const seHandle = document.querySelector('[data-handle="se"]');
      if (!seHandle) return null;
      const r = seHandle.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });

    if (handleScreen) {
      await getPointerSpyEvents(page);
      await dispatchTouchDrag(client, handleScreen.x, handleScreen.y, 50, 40, 8, 20);
      await new Promise((r) => setTimeout(r, 250));

      const handleSpy = await getPointerSpyEvents(page);
      const resizedObj = await page.evaluate((id) => {
        const obj = (window).__PDF_EDITOR_STORE__.getState().objects.find((o) => o.id === id);
        return obj ? { width: obj.width, height: obj.height } : null;
      }, shapeId);

      const resizePassed = handleSpy.filter((e) => e.type === 'pointercancel').length === 0 && resizedObj && resizedObj.width > 120;
      record('objectType', 'OBJ-RESIZE-TOUCH', 'Resize handle dragged continuously with touch (0 pointercancel)', resizePassed, {
        resizedBounds: resizedObj,
        cancelCount: handleSpy.filter((e) => e.type === 'pointercancel').length,
        message: resizePassed ? `Resized shape to ${resizedObj.width}x${resizedObj.height}` : 'Resize failed'
      });
      await capture(page, 'p8a_handle_resize.png', 'Resize handle drag with touch');
    }

    await page.close();

    // -------------------------------------------------------------------------
    // TEST SECTION 3: RESPONSIVE VIEWPORT MATRIX (375, 390, 430, 768, 1440)
    // -------------------------------------------------------------------------
    console.log('\n--- PART 3: RESPONSIVE VIEWPORT MATRIX ---');
    const viewports = [
      { id: 'VP-375', name: 'iPhone SE (375x812)', w: 375, h: 812 },
      { id: 'VP-390', name: 'iPhone 14 (390x844)', w: 390, h: 844 },
      { id: 'VP-430', name: 'iPhone Pro Max (430x932)', w: 430, h: 932 },
      { id: 'VP-768', name: 'iPad / Tablet (768x1024)', w: 768, h: 1024 },
      { id: 'VP-1440', name: 'Desktop (1440x900)', w: 1440, h: 900 }
    ];

    for (const vp of viewports) {
      const sess = await setupPage(browser, vp.w, vp.h);
      await attachPointerSpy(sess.page);

      const objId = await sess.page.evaluate(() => {
        const store = (window).__PDF_EDITOR_STORE__;
        store.getState().objects = [];
        const id = `vp-obj-${Date.now()}`;
        store.addObject({
          id,
          type: 'text',
          pageNumber: 1,
          x: 100,
          y: 200,
          width: 130,
          height: 36,
          rotation: 0,
          opacity: 1,
          zIndex: 10,
          text: 'Viewport Touch Test',
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

      const objPos = await sess.page.evaluate((id) => {
        const el = document.getElementById(`obj-${id}`);
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }, objId);

      await getPointerSpyEvents(sess.page);
      await dispatchTouchDrag(sess.client, objPos.x, objPos.y, 70, 50, 10, 20);
      await new Promise((r) => setTimeout(r, 250));

      const spy = await getPointerSpyEvents(sess.page);
      const cancelCount = spy.filter((e) => e.type === 'pointercancel').length;
      const endPos = await sess.page.evaluate((id) => {
        const obj = (window).__PDF_EDITOR_STORE__.getState().objects.find((o) => o.id === id);
        return obj ? { x: obj.x, y: obj.y } : null;
      }, objId);

      const vpPassed = cancelCount === 0 && endPos && endPos.x > 100;
      record('viewport', vp.id, `Continuous touch drag at ${vp.name}`, vpPassed, {
        viewport: `${vp.w}x${vp.h}`,
        cancelCount,
        endPos,
        message: vpPassed ? 'Moved cleanly without pointercancel' : 'Failed with pointercancel or no move'
      });

      await capture(sess.page, `p8a_viewport_${vp.w}.png`, `Viewport ${vp.name} touch drag`);
      await sess.page.close();
    }

    // -------------------------------------------------------------------------
    // TEST SECTION 4: ZOOM & COORDINATE PRECISION MATRIX (50%, 100%, 150%)
    // -------------------------------------------------------------------------
    console.log('\n--- PART 4: ZOOM & COORDINATE PRECISION MATRIX ---');
    const zoomLevels = [
      { id: 'ZOOM-50', level: 0.5, name: 'Zoom 50%' },
      { id: 'ZOOM-100', level: 1.0, name: 'Zoom 100%' },
      { id: 'ZOOM-150', level: 1.5, name: 'Zoom 150%' }
    ];

    for (const zl of zoomLevels) {
      const sess = await setupPage(browser, 430, 932);
      await attachPointerSpy(sess.page);

      // Set zoom level via store
      await sess.page.evaluate((z) => {
        const store = (window).__PDF_EDITOR_STORE__;
        store.setZoom(z);
      }, zl.level);

      // Wait until __PDF_VIEWPORT__.scale matches zl.level
      await sess.page.waitForFunction((z) => {
        return (window).__PDF_VIEWPORT__ && Math.abs((window).__PDF_VIEWPORT__.scale - z) < 0.05;
      }, { timeout: 10000 }, zl.level);
      await new Promise((r) => setTimeout(r, 200));

      const objId = await sess.page.evaluate((z) => {
        const store = (window).__PDF_EDITOR_STORE__;
        store.getState().objects = [];
        const id = `zoom-obj-${z}-${Date.now()}`;
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
          text: `Zoom ${z * 100}%`,
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
      }, zl.level);

      await new Promise((r) => setTimeout(r, 200));

      const objScreen = await sess.page.evaluate((id) => {
        const el = document.getElementById(`obj-${id}`);
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, id };
      }, objId);

      const dragScreenX = 60;
      const dragScreenY = 40;

      await getPointerSpyEvents(sess.page);
      await dispatchTouchDrag(sess.client, objScreen.x, objScreen.y, dragScreenX, dragScreenY, 8, 20);
      await new Promise((r) => setTimeout(r, 250));

      const spy = await getPointerSpyEvents(sess.page);
      const cancelCount = spy.filter((e) => e.type === 'pointercancel').length;

      const coordCheck = await sess.page.evaluate((id, initPos, sx, sy) => {
        const store = (window).__PDF_EDITOR_STORE__;
        const obj = store.getState().objects.find((o) => o.id === id);
        const vp = (window).__PDF_VIEWPORT__;
        const scale = vp ? vp.scale : 1.0;
        const expectedPdfDeltaX = sx / scale;
        const expectedPdfDeltaY = sy / scale;
        const actualPdfDeltaX = obj.x - initPos.x;
        const actualPdfDeltaY = obj.y - initPos.y;
        return {
          scale,
          expectedPdfDelta: { x: expectedPdfDeltaX, y: expectedPdfDeltaY },
          actualPdfDelta: { x: actualPdfDeltaX, y: actualPdfDeltaY },
          driftX: Math.abs(actualPdfDeltaX - expectedPdfDeltaX),
          driftY: Math.abs(actualPdfDeltaY - expectedPdfDeltaY)
        };
      }, objScreen.id, { x: 100, y: 200 }, dragScreenX, dragScreenY);

      const zoomPassed = cancelCount === 0 && coordCheck.driftX <= 2 && coordCheck.driftY <= 2;
      record('zoom', zl.id, `${zl.name} scale-compensated drag with zero drift`, zoomPassed, {
        cancelCount,
        ...coordCheck,
        message: zoomPassed
          ? `Zero drift (driftX: ${coordCheck.driftX.toFixed(2)}pt, driftY: ${coordCheck.driftY.toFixed(2)}pt)`
          : `Drift exceeded or cancelled (driftX: ${coordCheck.driftX}, driftY: ${coordCheck.driftY})`
      });

      await capture(sess.page, `p8a_zoom_${zl.level * 100}.png`, `Zoom ${zl.name} drag`);
      await sess.page.close();
    }

    // -------------------------------------------------------------------------
    // TEST SECTION 5: IDLE SCROLLING & VIEWPORT TOUCH-ACTION LIFECYCLE
    // -------------------------------------------------------------------------
    console.log('\n--- PART 5: IDLE SCROLLING & LIFECYCLE MATRIX ---');
    const lifeSess = await setupPage(browser, 390, 844);

    // 5.1 Idle touchAction on viewport
    const idleTouchAction = await lifeSess.page.evaluate(() => {
      const vp = document.getElementById('editor-viewport');
      return vp ? vp.style.touchAction : 'none';
    });

    const idlePassed = idleTouchAction === '' || idleTouchAction === 'auto';
    record('lifecycle', 'LIFECYCLE-01-IDLE-SCROLL', 'Editor viewport preserves native scrolling when idle (touchAction is not locked)', idlePassed, {
      viewportTouchAction: idleTouchAction,
      message: idlePassed ? 'Viewport scrolling unlocked when idle' : `Unexpected locked touchAction: "${idleTouchAction}"`
    });

    // 5.2 Dynamic touchAction locking during object drag
    const testObjId = await lifeSess.page.evaluate(() => {
      const store = (window).__PDF_EDITOR_STORE__;
      store.getState().objects = [];
      const id = `lifecycle-obj-${Date.now()}`;
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
        text: 'Lifecycle Test',
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

    const objCenter = await lifeSess.page.evaluate((id) => {
      const el = document.getElementById(`obj-${id}`);
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, testObjId);

    // Start touch drag (dispatch touchStart and 1st touchMove)
    await lifeSess.client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: Math.round(objCenter.x), y: Math.round(objCenter.y) }]
    });
    await new Promise((r) => setTimeout(r, 30));
    await lifeSess.client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: Math.round(objCenter.x + 20), y: Math.round(objCenter.y + 10) }]
    });
    await new Promise((r) => setTimeout(r, 50));

    const duringTouchAction = await lifeSess.page.evaluate(() => {
      const vp = document.getElementById('editor-viewport');
      return vp ? vp.style.touchAction : '';
    });

    const duringPassed = duringTouchAction === 'none';
    record('lifecycle', 'LIFECYCLE-02-ACTIVE-LOCK', 'Viewport touch-action dynamically locked to "none" during active object drag', duringPassed, {
      viewportTouchAction: duringTouchAction,
      message: duringPassed ? 'Viewport scrolling dynamically locked to prevent compositor pointercancel' : `Failed: touchAction is "${duringTouchAction}"`
    });

    // Complete touch drag (touchEnd)
    await lifeSess.client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: []
    });
    await new Promise((r) => setTimeout(r, 100));

    const afterTouchAction = await lifeSess.page.evaluate(() => {
      const vp = document.getElementById('editor-viewport');
      return vp ? vp.style.touchAction : 'none';
    });

    const afterPassed = afterTouchAction === '' || afterTouchAction === 'auto';
    record('lifecycle', 'LIFECYCLE-03-RESTORE-SCROLL', 'Viewport touch-action restored to allow scrolling upon touch release', afterPassed, {
      viewportTouchAction: afterTouchAction,
      message: afterPassed ? 'Viewport scrolling unlocked after touch release' : `Failed: touchAction remained "${afterTouchAction}"`
    });

    // 5.3 Static touchAction: none on handles and objects
    const elementTouchActions = await lifeSess.page.evaluate((id) => {
      const objEl = document.getElementById(`obj-${id}`);
      const seHandle = document.querySelector('[data-handle="se"]');
      const box = document.getElementById('selection-bounding-box');
      return {
        objectTouchAction: objEl ? objEl.style.touchAction : null,
        handleTouchAction: seHandle ? seHandle.style.touchAction : null,
        boxTouchAction: box ? box.style.touchAction : null
      };
    }, testObjId);

    const staticPassed =
      elementTouchActions.objectTouchAction === 'none' &&
      elementTouchActions.handleTouchAction === 'none' &&
      elementTouchActions.boxTouchAction === 'none';

    record('lifecycle', 'LIFECYCLE-04-STATIC-TOUCH-ACTION', 'Interactive objects and selection handles have static touch-action: none', staticPassed, {
      ...elementTouchActions,
      message: staticPassed ? 'All interactive targets configured with touch-action: none' : 'Missing touch-action: none on interactive targets'
    });

    await lifeSess.page.close();

    // -------------------------------------------------------------------------
    // SUMMARY & REPORT
    // -------------------------------------------------------------------------
    results.summary.verdict = results.summary.failed === 0 ? 'PASS' : 'FAIL';
    fs.writeFileSync(jsonReportPath, JSON.stringify(results, null, 2), 'utf-8');

    console.log('\n================================================================');
    console.log(`SUITE COMPLETE: ${results.summary.passed}/${results.summary.total} PASSED`);
    console.log(`VERDICT: ${results.summary.verdict}`);
    console.log(`JSON Report: ${jsonReportPath}`);
    console.log('================================================================\n');

  } catch (err) {
    console.error('Test execution failed with error:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runSuite();
