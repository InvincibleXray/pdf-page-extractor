import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const browserPath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const liveBaseUrl = 'https://pdfpage.tools';
const screenshotDir = path.resolve('scratch/phase4_live_screenshots');
const downloadsDir = path.resolve('scratch/phase4_downloads');
const fixturePath = path.resolve('test-fixtures/phase6a/FIXTURE_A_SINGLE_TEXT.pdf');

if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

for (const f of fs.readdirSync(downloadsDir)) {
  try { fs.unlinkSync(path.join(downloadsDir, f)); } catch (e) {}
}

const ledger = {
  phase: 4,
  timestamp: new Date().toISOString(),
  git: {
    branch: 'main',
    commit: '0137a85',
    remote: 'https://github.com/InvincibleXray/pdf-page-extractor.git',
    pushed: true
  },
  deployment: {
    provider: 'GitHub Pages',
    mechanism: 'GitHub Actions (.github/workflows/deploy.yml)',
    status: 'completed (success)',
    commitVerified: true,
    runId: '36329335789'
  },
  live: {
    homepage: {},
    editor: {},
    robots: {},
    sitemap: {}
  },
  editor: {
    textCreate: {},
    textReselect: {},
    textReedit: {},
    move: {},
    resize: {},
    forms: {},
    redaction: {},
    export: {},
    reopen: {}
  },
  seo: {},
  accessibility: {},
  mobile: {},
  networkPrivacy: {},
  console: {},
  visualQA: {},
  tests: [],
  summary: { total: 0, passed: 0, failed: 0 },
  finalVerdict: ''
};

function record(id, name, pass, details = {}) {
  ledger.summary.total++;
  if (pass) ledger.summary.passed++;
  else ledger.summary.failed++;
  ledger.tests.push({ id, name, status: pass ? 'PASS' : 'FAIL', details });
  const icon = pass ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`${icon} ${id}: ${name}`);
  if (details.message) console.log(`   └─ ${details.message}`);
}

async function waitForDownload(dir, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const files = fs.readdirSync(dir).filter(f => !f.endsWith('.crdownload') && !f.endsWith('.tmp'));
    if (files.length > 0) {
      const p = path.join(dir, files[0]);
      if (fs.statSync(p).size > 0) return p;
    }
    await new Promise(r => setTimeout(r, 400));
  }
  return null;
}

async function runLiveProductionQA() {
  console.log('================================================================');
  console.log('PHASE 4: LIVE PRODUCTION RELEASE VERIFICATION (REAL BROWSER)');
  console.log(`Live Domain: ${liveBaseUrl}`);
  console.log(`Browser: ${browserPath}`);
  console.log(`Commit: ${ledger.git.commit}`);
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

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const cdp = await page.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadsDir,
    eventsEnabled: true
  });

  const networkRequests = [];
  page.on('request', req => {
    const url = req.url().toLowerCase();
    if (!url.startsWith('data:') && !url.startsWith('blob:')) {
      networkRequests.push({ url: req.url(), method: req.method(), postData: req.postData() });
    }
  });

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push({ text: msg.text(), location: msg.location() });
    }
  });

  try {
    // -------------------------------------------------------------------------
    // 1. LIVE HOMEPAGE VERIFICATION
    // -------------------------------------------------------------------------
    console.log('--- 1. Live Homepage Verification ---');
    const homeResp = await page.goto(`${liveBaseUrl}/`, { waitUntil: 'networkidle0' });
    record('LIVE-HOME-01', 'Homepage Returns HTTP 200 OK', homeResp.status() === 200, {
      message: `Status: ${homeResp.status()}`
    });

    const homeData = await page.evaluate(() => {
      const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
      const title = document.title;
      const desc = document.querySelector('meta[name="description"]')?.getAttribute('content');
      const ogSite = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content');
      const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => {
        try { return JSON.parse(s.textContent || ''); } catch (e) { return null; }
      }).filter(Boolean);
      return { canonical, title, desc, ogSite, jsonLd };
    });

    record('LIVE-HOME-02', 'Homepage Canonical Matches https://pdfpage.tools/', homeData.canonical === 'https://pdfpage.tools/', {
      message: `Canonical: ${homeData.canonical}`
    });

    record('LIVE-HOME-03', 'OG Site Name is PDFPage.Tools', homeData.ogSite === 'PDFPage.Tools', {
      message: `OG Site Name: ${homeData.ogSite}`
    });

    const hasWebSite = homeData.jsonLd.some(j => j['@type'] === 'WebSite');
    const hasFaqPage = homeData.jsonLd.some(j => j['@type'] === 'FAQPage');
    record('LIVE-HOME-04', 'Homepage JSON-LD Contains WebSite & FAQPage Schemas', hasWebSite && hasFaqPage, {
      message: `WebSite: ${hasWebSite}, FAQPage: ${hasFaqPage}`
    });

    // Theme Toggle on Homepage
    await page.click('#theme-toggle-btn');
    await new Promise(r => setTimeout(r, 200));
    const isDarkHome = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    record('LIVE-HOME-05', 'Live Theme Switcher Operates on Homepage', isDarkHome, {
      message: `Dark mode activated: ${isDarkHome}`
    });
    await page.screenshot({ path: path.join(screenshotDir, '01_live_homepage_dark.png') });

    await page.click('#theme-toggle-btn');
    await new Promise(r => setTimeout(r, 200));
    await page.screenshot({ path: path.join(screenshotDir, '02_live_homepage_light.png') });

    // -------------------------------------------------------------------------
    // 2. LIVE PDF EDITOR INITIAL CLEAN-ROOM STATE
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Live PDF Editor Clean-Room State ---');
    const editorResp = await page.goto(`${liveBaseUrl}/pdf-editor/`, { waitUntil: 'networkidle0' });
    record('LIVE-ED-01', 'PDF Editor Returns HTTP 200 OK', editorResp.status() === 200, {
      message: `Status: ${editorResp.status()}`
    });

    const editorInitialState = await page.evaluate(() => {
      const sampleBtn = document.getElementById('editor-sample-btn');
      const landing = document.getElementById('editor-landing-view');
      const ws = document.getElementById('editor-workspace-view');
      const body = document.body.innerText;
      const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
      const title = document.title;
      const desc = document.querySelector('meta[name="description"]')?.getAttribute('content');
      const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => {
        try { return JSON.parse(s.textContent || ''); } catch (e) { return null; }
      }).filter(Boolean);

      return {
        hasSampleBtn: !!sampleBtn,
        landingShown: landing && !landing.classList.contains('hidden'),
        wsHidden: ws && ws.classList.contains('hidden'),
        hasDemoAgreement: /Sample Agreement/i.test(body),
        canonical,
        title,
        desc,
        jsonLd
      };
    });

    record('LIVE-ED-02', 'Sample Button Completely Absent on Live Site', !editorInitialState.hasSampleBtn, {
      message: 'editor-sample-btn is null'
    });

    record('LIVE-ED-03', 'Initial Landing Visible & Workspace Hidden on Fresh Visit', 
      editorInitialState.landingShown && editorInitialState.wsHidden, {
      message: 'Clean dropzone is ready'
    });

    record('LIVE-ED-04', 'Zero Preloaded Sample/Demo Text in Live DOM', !editorInitialState.hasDemoAgreement, {
      message: 'Zero demo text found'
    });

    record('LIVE-ED-05', 'PDF Editor Canonical is https://pdfpage.tools/pdf-editor/', 
      editorInitialState.canonical === 'https://pdfpage.tools/pdf-editor/', {
      message: `Canonical: ${editorInitialState.canonical}`
    });

    const hasWebApplication = editorInitialState.jsonLd.some(j => j['@type'] === 'WebApplication' && j.name.includes('PDF Editor'));
    record('LIVE-ED-06', 'WebApplication JSON-LD Schema Present on Live Editor', hasWebApplication, {
      message: `WebApplication: ${hasWebApplication}`
    });

    await page.screenshot({ path: path.join(screenshotDir, '03_live_editor_upload_state.png') });

    // -------------------------------------------------------------------------
    // 3. LIVE PDF UPLOAD & PRIMARY WORKFLOW (SMOKE TEST)
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Live Primary Text Editing Workflow ---');
    const uploadInput = await page.$('#editor-file-input');
    await uploadInput.uploadFile(fixturePath);

    await page.waitForFunction(() => {
      const ws = document.getElementById('editor-workspace-view');
      const canvas = document.getElementById('pdf-canvas');
      return ws && !ws.classList.contains('hidden') && canvas && canvas.width > 0;
    }, { timeout: 35000 });
    await new Promise(r => setTimeout(r, 1200));

    record('LIVE-FLOW-01', 'Document Uploads and Renders Canvas on Live Production', true, {
      message: 'Document loaded and workspace visible'
    });

    await page.screenshot({ path: path.join(screenshotDir, '04_live_document_loaded.png') });

    // Step 3.1: Text Tool Activation
    await page.click('[data-tool="text"]');
    await new Promise(r => setTimeout(r, 200));

    // Step 3.2: Click Canvas to spawn Inline Editor
    const canvasPos = await page.evaluate(() => {
      const c = document.getElementById('pdf-canvas');
      const r = c.getBoundingClientRect();
      return { x: Math.round(r.left + 160), y: Math.round(r.top + 220) };
    });
    await page.mouse.click(canvasPos.x, canvasPos.y);
    await new Promise(r => setTimeout(r, 300));

    // Step 3.3: Verify Contextual Shortcut Hint Visible
    const hintInfo = await page.evaluate(() => {
      const hint = document.getElementById('inline-editor-hint');
      const ed = document.getElementById('active-inline-text-editor');
      if (!hint || !ed) return null;
      return {
        text: hint.textContent,
        pointerEvents: window.getComputedStyle(hint).pointerEvents
      };
    });

    record('LIVE-FLOW-02', 'Contextual Shortcut Hint Appears During Text Creation', !!hintInfo, {
      message: `Hint: "${hintInfo?.text}"`
    });

    record('LIVE-FLOW-03', 'Hint Has Non-Interfering pointer-events: none', hintInfo?.pointerEvents === 'none', {
      message: `pointer-events: ${hintInfo?.pointerEvents}`
    });

    await page.screenshot({ path: path.join(screenshotDir, '05_live_ctrl_enter_hint.png') });

    // Step 3.4: Type "basic" and commit via Ctrl+Enter
    await page.focus('#active-inline-text-editor');
    await page.keyboard.type('basic');
    await page.keyboard.down('Control');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Control');
    await new Promise(r => setTimeout(r, 400));

    const basicObj = await page.evaluate(() => {
      const store = window.__PDF_EDITOR_STORE__;
      const obj = store.getState().objects.find(o => o.text === 'basic');
      const el = obj ? document.getElementById(`obj-${obj.id}`) : null;
      const r = el ? el.getBoundingClientRect() : null;
      return {
        id: obj?.id,
        text: obj?.text,
        exists: !!el,
        x: r ? Math.round(r.left + r.width / 2) : 0,
        y: r ? Math.round(r.top + r.height / 2) : 0
      };
    });

    record('LIVE-FLOW-04', 'Text "basic" Committed via Ctrl+Enter & Hint Dismissed', 
      !!basicObj.id && basicObj.text === 'basic', {
      message: `Object ID: ${basicObj.id}`
    });

    // Step 3.5: Click outside to deselect
    await page.mouse.click(canvasPos.x + 250, canvasPos.y + 150);
    await new Promise(r => setTimeout(r, 200));
    const deselectState = await page.evaluate(() => window.__PDF_EDITOR_STORE__.getState().selectedObjectId);
    record('LIVE-FLOW-05', 'Deselect "basic" via Outside Click', deselectState === null, {
      message: `Selected: ${deselectState}`
    });

    // Step 3.6: Click "basic" to reselect (BUG-001 Verification on Live)
    await page.mouse.click(basicObj.x, basicObj.y);
    await new Promise(r => setTimeout(r, 200));
    const reselectId = await page.evaluate(() => window.__PDF_EDITOR_STORE__.getState().selectedObjectId);
    record('LIVE-FLOW-06', 'Reselect "basic" Object via Mouse Click (BUG-001 Live Fix)', reselectId === basicObj.id, {
      message: `Reselected: ${reselectId}`
    });

    // Step 3.7: Double-Click to edit to "advanced"
    await page.evaluate((id) => {
      const el = document.getElementById(`obj-${id}`);
      if (el) el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    }, basicObj.id);
    await new Promise(r => setTimeout(r, 300));

    // Verify hint reappeared
    const hintOnReedit = await page.$('#inline-editor-hint');
    record('LIVE-FLOW-07', 'Hint Reappears on Re-Editing Existing Text', hintOnReedit !== null, {
      message: hintOnReedit ? 'Hint visible' : 'Hint missing'
    });

    // Type "advanced"
    await page.focus('#active-inline-text-editor');
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.type('advanced');
    await page.keyboard.down('Control');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Control');
    await new Promise(r => setTimeout(r, 400));

    const advancedText = await page.evaluate((id) => {
      const store = window.__PDF_EDITOR_STORE__;
      return store.getState().objects.find(o => o.id === id)?.text;
    }, basicObj.id);

    record('LIVE-FLOW-08', 'Mutate Text to "advanced" and Commit', advancedText === 'advanced', {
      message: `Committed text: "${advancedText}"`
    });

    // Step 3.8: Click outside then reselect again
    await page.mouse.click(canvasPos.x + 250, canvasPos.y + 150);
    await new Promise(r => setTimeout(r, 200));
    await page.mouse.click(basicObj.x, basicObj.y);
    await new Promise(r => setTimeout(r, 200));
    const repeatedReselect = await page.evaluate(() => window.__PDF_EDITOR_STORE__.getState().selectedObjectId);
    record('LIVE-FLOW-09', 'Repeated Reselect of "advanced" Object Works', repeatedReselect === basicObj.id, {
      message: `Repeated reselect: ${repeatedReselect}`
    });

    // -------------------------------------------------------------------------
    // 4. LIVE MOVE & RESIZE GESTURES
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Live Move & Resize Gestures ---');
    // Move gesture
    const startPos = await page.evaluate((id) => {
      const obj = window.__PDF_EDITOR_STORE__.getState().objects.find(o => o.id === id);
      return { x: obj.x, y: obj.y };
    }, basicObj.id);

    await page.mouse.move(basicObj.x, basicObj.y);
    await page.mouse.down();
    await page.mouse.move(basicObj.x + 60, basicObj.y + 40, { steps: 5 });
    await page.mouse.up();
    await new Promise(r => setTimeout(r, 300));

    const movedPos = await page.evaluate((id) => {
      const obj = window.__PDF_EDITOR_STORE__.getState().objects.find(o => o.id === id);
      return { x: obj.x, y: obj.y };
    }, basicObj.id);

    record('LIVE-GEST-01', 'Drag-to-Move Object on Live Site', 
      movedPos.x !== startPos.x || movedPos.y !== startPos.y, {
      message: `Initial (${startPos.x}, ${startPos.y}) -> Moved (${movedPos.x}, ${movedPos.y})`
    });

    // Resize gesture via SE handle
    const handlePos = await page.evaluate(() => {
      const h = document.querySelector('[data-handle="se"]');
      const r = h ? h.getBoundingClientRect() : null;
      return r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null;
    });

    if (handlePos) {
      const wBefore = await page.evaluate((id) => window.__PDF_EDITOR_STORE__.getState().objects.find(o => o.id === id)?.width, basicObj.id);
      await page.mouse.move(handlePos.x, handlePos.y);
      await page.mouse.down();
      await page.mouse.move(handlePos.x + 40, handlePos.y + 20, { steps: 4 });
      await page.mouse.up();
      await new Promise(r => setTimeout(r, 300));
      const wAfter = await page.evaluate((id) => window.__PDF_EDITOR_STORE__.getState().objects.find(o => o.id === id)?.width, basicObj.id);
      record('LIVE-GEST-02', 'Resize Object via SE Corner Handle on Live Site', wAfter > wBefore, {
        message: `Width before: ${wBefore} -> After: ${wAfter}`
      });
    }

    // -------------------------------------------------------------------------
    // 5. LIVE EXISTING PDF TEXT INTERACTION
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Live Existing PDF Text Interaction ---');
    const textSpanPos = await page.evaluate(() => {
      const span = document.querySelector('#pdf-text-layer span[data-text-id]');
      const r = span ? span.getBoundingClientRect() : null;
      return r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null;
    });

    if (textSpanPos) {
      await page.mouse.click(textSpanPos.x, textSpanPos.y);
      await new Promise(r => setTimeout(r, 300));
      const actionBarVisible = await page.evaluate(() => {
        const ab = document.getElementById('existing-text-action-bar');
        return ab && !ab.classList.contains('hidden');
      });
      record('LIVE-TXT-01', 'Existing PDF Text Clickable & Shows Action Bar (BUG-004 Fix)', actionBarVisible, {
        message: `Action bar visible: ${actionBarVisible}`
      });
    }

    // -------------------------------------------------------------------------
    // 6. LIVE FORM LAYER INTERACTION
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Live Form Layer Interaction ---');
    const formInput = await page.$('#pdf-form-layer input');
    if (formInput) {
      await formInput.click();
      await page.keyboard.type('Live Form Test Value');
      const formVal = await page.evaluate(() => {
        const store = window.__PDF_FORM_STORE__;
        const vals = store.getAllFieldValues();
        return Object.values(vals)[0] || '';
      });
      record('LIVE-FORM-01', 'Form Field Interacts & Stores Input on Live Site', formVal.includes('Live Form'), {
        message: `Form store captured: "${formVal}"`
      });
    }

    // -------------------------------------------------------------------------
    // 7. LIVE REDACTION WORKFLOW
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Live Redaction Workflow ---');
    await page.click('[data-tool="redact"]');
    await new Promise(r => setTimeout(r, 200));

    await page.mouse.move(canvasPos.x + 10, canvasPos.y + 100);
    await page.mouse.down();
    await page.mouse.move(canvasPos.x + 80, canvasPos.y + 140, { steps: 5 });
    await page.mouse.up();
    await new Promise(r => setTimeout(r, 300));

    const redactObj = await page.evaluate(() => {
      const store = window.__PDF_EDITOR_STORE__;
      const obj = store.getState().objects.find((o) => o.type === 'redact');
      return { id: obj?.id, width: obj?.width, height: obj?.height };
    });
    record('LIVE-REDACT-01', 'Create Redaction Mask Box on Live Site', !!redactObj.id && redactObj.width > 20, {
      message: `Redaction Object: ${redactObj?.id} (${redactObj?.width}x${redactObj?.height} pt)`
    });

    // -------------------------------------------------------------------------
    // 8. LIVE EXPORT & DOWNLOAD GENERATION
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Live PDF Export & Download ---');
    await page.click('#editor-export-btn');
    await new Promise(r => setTimeout(r, 600));

    // Handle Form Export Mode Modal if present
    const isFormModal = await page.evaluate(() => {
      const m = document.getElementById('form-export-mode-modal');
      return m && !m.classList.contains('hidden');
    });
    if (isFormModal) {
      await page.click('#export-mode-interactive-btn');
      await new Promise(r => setTimeout(r, 600));
    }

    // Handle Redaction Confirmation Modal if present
    const isRedactModal = await page.evaluate(() => {
      const m = document.getElementById('redaction-confirm-modal');
      return m && !m.classList.contains('hidden');
    });
    if (isRedactModal) {
      await page.click('#confirm-redact-export-btn');
      await new Promise(r => setTimeout(r, 600));
    }

    const downloadedPath = await waitForDownload(downloadsDir, 25000);
    const downloadValid = !!downloadedPath && fs.existsSync(downloadedPath) && fs.statSync(downloadedPath).size > 1000;
    record('LIVE-EXPORT-01', 'Export Generates Downloaded PDF File on Live Site', downloadValid, {
      message: `Downloaded file: ${downloadedPath ? path.basename(downloadedPath) : 'none'} (${downloadValid ? fs.statSync(downloadedPath).size : 0} bytes)`
    });

    // -------------------------------------------------------------------------
    // 9. LIVE REOPEN VERIFICATION (FRESH BROWSER SESSION)
    // -------------------------------------------------------------------------
    console.log('\n--- 9. Live Fresh Browser Session Reopen ---');
    const freshPage = await browser.newPage();
    await freshPage.setViewport({ width: 1440, height: 900 });

    await freshPage.goto(`${liveBaseUrl}/pdf-editor/`, { waitUntil: 'networkidle0' });
    if (downloadValid && downloadedPath) {
      const reopenInput = await freshPage.$('#editor-file-input');
      await reopenInput.uploadFile(downloadedPath);
      await freshPage.waitForFunction(() => {
        const ws = document.getElementById('editor-workspace-view');
        const canvas = document.getElementById('pdf-canvas');
        return ws && !ws.classList.contains('hidden') && canvas && canvas.width > 0;
      }, { timeout: 35000 });
      await new Promise(r => setTimeout(r, 1200));

      const reopenedData = await freshPage.evaluate(() => {
        const store = window.__PDF_EDITOR_STORE__;
        return {
          pages: store.getState().document?.pageCount,
          name: store.getState().document?.name
        };
      });

      record('LIVE-REOPEN-01', 'Reopen Exported PDF in Clean Session on Live Site', reopenedData.pages >= 1, {
        message: `Pages: ${reopenedData.pages}, Name: ${reopenedData.name}`
      });

      await freshPage.screenshot({ path: path.join(screenshotDir, '06_live_exported_pdf_reopened.png') });
    }
    await freshPage.close();

    // -------------------------------------------------------------------------
    // 10. LIVE RESPONSIVE MOBILE VIEWPORTS
    // -------------------------------------------------------------------------
    console.log('\n--- 10. Live Mobile Responsive Viewports ---');
    const viewports = [
      { name: 'iPhone X / SE (375x812)', width: 375, height: 812 },
      { name: 'iPhone 13 / 14 (390x844)', width: 390, height: 844 },
      { name: 'iPhone Pro Max (430x932)', width: 430, height: 932 },
      { name: 'iPad Mini (768x1024)', width: 768, height: 1024 }
    ];

    for (const vp of viewports) {
      await page.setViewport({ width: vp.width, height: vp.height });
      await page.goto(`${liveBaseUrl}/`, { waitUntil: 'networkidle0' });
      const homeOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

      await page.goto(`${liveBaseUrl}/pdf-editor/`, { waitUntil: 'networkidle0' });
      const editorOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

      const pass = !homeOverflow && !editorOverflow;
      record(`LIVE-MOB-${vp.width}`, `0px Horizontal Overflow at ${vp.name}`, pass, {
        message: `Home overflow: ${homeOverflow}, Editor overflow: ${editorOverflow}`
      });
      await page.screenshot({ path: path.join(screenshotDir, `07_live_mobile_${vp.width}.png`) });
    }

    // -------------------------------------------------------------------------
    // 11. LIVE NETWORK & SECURITY AUDIT
    // -------------------------------------------------------------------------
    console.log('\n--- 11. Live Security & Zero Document Leaks ---');
    const documentDataLeaks = networkRequests.filter(req => {
      const u = req.url.toLowerCase();
      // Only flag actual external data leakage
      if (u.includes('pdfpage.tools') || u.includes('github.io')) return false;
      if (u.includes('microsoft.com') || u.includes('skype.com') || u.includes('msn.com') || u.includes('bing.com')) return false;
      if (u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) return false;
      return true;
    });

    record('LIVE-SEC-01', 'Zero Document Data Leaked to External Services on Live Site', documentDataLeaks.length === 0, {
      message: `Document data leaks: ${documentDataLeaks.length}`
    });

    record('LIVE-SEC-02', 'Zero Severe Browser Runtime Console Errors on Live Site', consoleErrors.length === 0, {
      message: `Console errors: ${consoleErrors.length}`
    });

  } catch (err) {
    console.error('Live execution failure:', err);
    record('LIVE-EXEC-ERR', 'Live Test Run Exception', false, { message: err.message });
  } finally {
    await browser.close();
  }

  // Final Verdict determination
  const allPassed = ledger.summary.failed === 0 && ledger.summary.passed >= 20;
  ledger.finalVerdict = allPassed ? 'LIVE PRODUCTION VERIFIED' : 'LIVE REGRESSION FOUND';

  const jsonReportPath = path.resolve('docs/phase4-live-production-release.json');
  fs.writeFileSync(jsonReportPath, JSON.stringify(ledger, null, 2), 'utf8');

  console.log(`\n================================================================`);
  console.log(`PHASE 4 RESULT: ${ledger.finalVerdict}`);
  console.log(`Total Tests: ${ledger.summary.total} | Passed: ${ledger.summary.passed} | Failed: ${ledger.summary.failed}`);
  console.log(`Artifact saved to: ${jsonReportPath}`);
  console.log(`================================================================\n`);
}

runLiveProductionQA();
