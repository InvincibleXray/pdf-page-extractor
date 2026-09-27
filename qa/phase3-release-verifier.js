import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const browserPath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const baseUrl = 'http://127.0.0.1:4321';
const screenshotDir = path.resolve('scratch/phase3_screenshots');
const fixturePath = path.resolve('test-fixtures/phase6a/FIXTURE_A_SINGLE_TEXT.pdf');

if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

const results = {
  phase: 3,
  timestamp: new Date().toISOString(),
  tests: [],
  summary: { total: 0, passed: 0, failed: 0 }
};

function record(id, name, passed, details = {}) {
  results.summary.total++;
  if (passed) results.summary.passed++;
  else results.summary.failed++;
  results.tests.push({ id, name, status: passed ? 'PASS' : 'FAIL', details });
  const icon = passed ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`${icon} ${id}: ${name}`);
  if (details.message) console.log(`   └─ ${details.message}`);
}

async function runPhase3Verifier() {
  console.log('================================================================');
  console.log('PHASE 3: PRODUCTION POLISH, SEO & RELEASE-READINESS AUDIT');
  console.log(`Base URL: ${baseUrl}`);
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

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const networkRequests = [];
  page.on('request', (req) => {
    const url = req.url().toLowerCase();
    if (!url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1') && !url.startsWith('data:') && !url.startsWith('blob:')) {
      networkRequests.push({ url: req.url(), method: req.method() });
    }
  });

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  try {
    // -------------------------------------------------------------------------
    // 1. PART 2 & PART 13: SAMPLE PDF / DEMO REMOVAL CLEAN-ROOM VERIFICATION
    // -------------------------------------------------------------------------
    console.log('--- 1. Part 2 & 13: Clean-Room Initial State & Demo Removal ---');
    await page.goto(`${baseUrl}/pdf-editor/`, { waitUntil: 'networkidle0' });

    const sampleBtnExists = await page.$('#editor-sample-btn');
    record('P3-CLEAN-01', 'Sample Document Button Completely Absent', sampleBtnExists === null, {
      message: sampleBtnExists === null ? 'No sample button in DOM' : 'Sample button unexpectedly found!'
    });

    const landingVisible = await page.evaluate(() => {
      const landing = document.getElementById('editor-landing-view');
      const ws = document.getElementById('editor-workspace-view');
      const landingShown = landing && !landing.classList.contains('hidden');
      const wsHidden = ws && ws.classList.contains('hidden');
      return landingShown && wsHidden;
    });
    record('P3-CLEAN-02', 'Landing View Active & Workspace Hidden on Fresh Load', landingVisible, {
      message: 'Workspace is hidden, landing dropzone is active'
    });

    const bodyText = await page.evaluate(() => document.body.innerText);
    const mentionsSampleAgreement = /Sample Agreement/i.test(bodyText);
    record('P3-CLEAN-03', 'Zero Preloaded Sample Content on Fresh Visit', !mentionsSampleAgreement, {
      message: mentionsSampleAgreement ? 'Found sample agreement text' : 'Clean state verified'
    });

    await page.screenshot({ path: path.join(screenshotDir, 'p3_01_clean_upload_state.png') });

    // -------------------------------------------------------------------------
    // 2. PART 1 & PART 11: CTRL+ENTER DISCOVERABILITY HINT & ACCESSIBILITY
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Part 1 & 11: Ctrl+Enter Hint Discoverability & Lifecycle ---');
    const uploadInput = await page.$('#editor-file-input');
    await uploadInput.uploadFile(fixturePath);

    await page.waitForFunction(() => {
      const ws = document.getElementById('editor-workspace-view');
      const canvas = document.getElementById('pdf-canvas');
      return ws && !ws.classList.contains('hidden') && canvas && canvas.width > 0;
    }, { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1000));

    // Activate Text Tool
    await page.click('[data-tool="text"]');
    await new Promise((r) => setTimeout(r, 200));

    // Click canvas to trigger inline editor
    const canvasBox = await page.evaluate(() => {
      const c = document.getElementById('pdf-canvas');
      const r = c.getBoundingClientRect();
      return { x: Math.round(r.left + 180), y: Math.round(r.top + 200) };
    });
    await page.mouse.click(canvasBox.x, canvasBox.y);
    await new Promise((r) => setTimeout(r, 300));

    // Verify hint exists while inline editor is active
    const hintInfo = await page.evaluate(() => {
      const hint = document.getElementById('inline-editor-hint');
      const editor = document.getElementById('active-inline-text-editor');
      if (!hint || !editor) return null;
      const comp = window.getComputedStyle(hint);
      return {
        exists: true,
        text: hint.textContent,
        pointerEvents: comp.pointerEvents,
        isBelow: parseInt(hint.style.top) >= parseInt(editor.style.top)
      };
    });

    record('P3-HINT-01', 'Contextual Hint Visible During Text Creation', !!hintInfo && hintInfo.exists, {
      message: `Hint found with text: "${hintInfo?.text}"`
    });

    record('P3-HINT-02', 'Hint Text Contains Ctrl+Enter and Esc Instructions', 
      hintInfo?.text?.includes('Ctrl + Enter') && hintInfo?.text?.includes('Esc'), {
      message: `Hint text: "${hintInfo?.text}"`
    });

    record('P3-HINT-03', 'Hint Has pointer-events-none (Non-Interfering)', 
      hintInfo?.pointerEvents === 'none', {
      message: `Computed pointer-events: ${hintInfo?.pointerEvents}`
    });

    await page.screenshot({ path: path.join(screenshotDir, 'p3_02_ctrl_enter_hint_visible.png') });

    // Focus editor and commit via Ctrl+Enter
    await page.focus('#active-inline-text-editor');
    await page.keyboard.type('Phase 3 Discoverability Test');
    await page.keyboard.down('Control');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Control');
    await new Promise((r) => setTimeout(r, 400));

    const hintAfterCommit = await page.$('#inline-editor-hint');
    record('P3-HINT-04', 'Hint Removed Upon Committing Text', hintAfterCommit === null, {
      message: hintAfterCommit === null ? 'Hint cleanly removed on commit' : 'Hint remained in DOM!'
    });

    // Double-click to re-edit and check hint reappearance
    let createdTextPos = await page.evaluate(() => {
      const store = window.__PDF_EDITOR_STORE__;
      const obj = store.getState().objects.find((o) => o.text && o.text.includes('Discoverability'));
      const el = obj ? document.getElementById(`obj-${obj.id}`) : null;
      const r = el ? el.getBoundingClientRect() : null;
      return r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), id: obj?.id } : null;
    });

    if (createdTextPos) {
      await page.mouse.click(createdTextPos.x, createdTextPos.y, { clickCount: 2 });
      await new Promise((r) => setTimeout(r, 300));

      let hintOnReedit = await page.evaluate(() => {
        const hint = document.getElementById('inline-editor-hint');
        return hint ? hint.textContent : null;
      });

      if (!hintOnReedit) {
        // Dispatch dblclick event directly on element as fallback
        await page.evaluate((id) => {
          const el = document.getElementById(`obj-${id}`);
          if (el) el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
        }, createdTextPos.id);
        await new Promise((r) => setTimeout(r, 300));
        hintOnReedit = await page.evaluate(() => {
          const hint = document.getElementById('inline-editor-hint');
          return hint ? hint.textContent : null;
        });
      }

      record('P3-HINT-05', 'Hint Reappears When Re-Editing Existing Text', !!hintOnReedit, {
        message: `Hint text on re-edit: "${hintOnReedit}"`
      });

      // Dismiss via Escape
      await page.keyboard.press('Escape');
      await new Promise((r) => setTimeout(r, 300));

      const hintAfterEscape = await page.$('#inline-editor-hint');
      record('P3-HINT-06', 'Hint Removed Upon Escape Cancellation', hintAfterEscape === null, {
        message: hintAfterEscape === null ? 'Hint cleanly removed on Escape' : 'Hint remained after Escape!'
      });
    } else {
      record('P3-HINT-05', 'Hint Reappears When Re-Editing Existing Text', false, {
        message: 'Created text object not found in store'
      });
      record('P3-HINT-06', 'Hint Removed Upon Escape Cancellation', false, {
        message: 'Could not test Escape without text object'
      });
    }

    // -------------------------------------------------------------------------
    // 3. PART 5-10: SEO, CANONICALS & STRUCTURED DATA VERIFICATION
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Part 5-10: SEO, Canonical & Structured Data Checks ---');
    
    // Check robots.txt
    const robotsResp = await fetch(`${baseUrl}/robots.txt`);
    const robotsTxt = await robotsResp.text();
    record('P3-SEO-01', 'robots.txt Allows Crawling & Points to Sitemap', 
      robotsTxt.includes('Allow: /') && robotsTxt.includes('Sitemap: https://pdfpage.tools/sitemap-index.xml'), {
      message: robotsTxt.trim()
    });

    // Check sitemap-0.xml
    const sitemapResp = await fetch(`${baseUrl}/sitemap-0.xml`);
    const sitemapTxt = await sitemapResp.text();
    record('P3-SEO-02', 'Sitemap Includes Both Homepage and Editor', 
      sitemapTxt.includes('https://pdfpage.tools/') && sitemapTxt.includes('https://pdfpage.tools/pdf-editor/'), {
      message: 'Both URLs verified in sitemap'
    });

    // Check Editor Canonical & Meta
    const editorMeta = await page.evaluate(() => {
      const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
      const title = document.title;
      const desc = document.querySelector('meta[name="description"]')?.getAttribute('content');
      const ogSite = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content');
      return { canonical, title, desc, ogSite };
    });

    record('P3-SEO-03', 'PDF Editor Canonical Points to https://pdfpage.tools/pdf-editor/', 
      editorMeta.canonical === 'https://pdfpage.tools/pdf-editor/', {
      message: `Canonical: ${editorMeta.canonical}`
    });

    record('P3-SEO-04', 'OG Site Name Updated to PDFPage.Tools', 
      editorMeta.ogSite === 'PDFPage.Tools', {
      message: `og:site_name: ${editorMeta.ogSite}`
    });

    // Check Editor JSON-LD Structured Data
    const editorJsonLd = await page.evaluate(() => {
      const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
      return scripts.map(s => {
        try { return JSON.parse(s.textContent || ''); } catch (e) { return null; }
      }).filter(Boolean);
    });

    const hasWebApplication = editorJsonLd.some(j => j['@type'] === 'WebApplication' && j.name.includes('PDF Editor'));
    const hasWebSite = editorJsonLd.some(j => j['@type'] === 'WebSite' && j.url === 'https://pdfpage.tools');

    record('P3-SEO-05', 'WebApplication JSON-LD Schema Present on Editor', hasWebApplication, {
      message: hasWebApplication ? 'WebApplication schema verified' : 'WebApplication schema missing'
    });

    record('P3-SEO-06', 'WebSite JSON-LD Schema Present', hasWebSite, {
      message: hasWebSite ? 'WebSite schema verified' : 'WebSite schema missing'
    });

    // Check Homepage Canonical & Meta
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle0' });
    const homeMeta = await page.evaluate(() => {
      const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
      const title = document.title;
      const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => {
        try { return JSON.parse(s.textContent || ''); } catch (e) { return null; }
      }).filter(Boolean);
      return { canonical, title, jsonLd };
    });

    record('P3-SEO-07', 'Homepage Canonical Points to https://pdfpage.tools/', 
      homeMeta.canonical === 'https://pdfpage.tools/', {
      message: `Homepage Canonical: ${homeMeta.canonical}`
    });

    const hasFaqPage = homeMeta.jsonLd.some(j => j['@type'] === 'FAQPage');
    record('P3-SEO-08', 'Homepage FAQPage Structured Data Present', hasFaqPage, {
      message: hasFaqPage ? 'FAQPage schema verified' : 'FAQPage schema missing'
    });

    // -------------------------------------------------------------------------
    // 4. PART 14: RESPONSIVE MOBILE VIEWPORT TESTING
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Part 14: Responsive Mobile Viewport Verification ---');
    const viewports = [
      { name: 'iPhone X / SE (375x812)', width: 375, height: 812 },
      { name: 'iPhone 13 / 14 (390x844)', width: 390, height: 844 },
      { name: 'iPhone Pro Max (430x932)', width: 430, height: 932 },
      { name: 'iPad Mini (768x1024)', width: 768, height: 1024 }
    ];

    for (const vp of viewports) {
      await page.setViewport({ width: vp.width, height: vp.height });
      // Test Homepage
      await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle0' });
      const homeOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      
      // Test Editor Landing
      await page.goto(`${baseUrl}/pdf-editor/`, { waitUntil: 'networkidle0' });
      const editorOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

      const pass = !homeOverflow && !editorOverflow;
      record(`P3-MOB-${vp.width}`, `0px Horizontal Overflow at ${vp.name}`, pass, {
        message: `Home overflow: ${homeOverflow}, Editor overflow: ${editorOverflow}`
      });

      await page.screenshot({ path: path.join(screenshotDir, `p3_mobile_${vp.width}.png`) });
    }

    // -------------------------------------------------------------------------
    // 5. PART 16: VISUAL QA & THEME AUDIT (LIGHT / DARK)
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Part 16: Visual QA & Theme Verification ---');
    await page.setViewport({ width: 1366, height: 768 });
    await page.goto(`${baseUrl}/pdf-editor/`, { waitUntil: 'networkidle0' });

    // Light mode screenshot
    await page.screenshot({ path: path.join(screenshotDir, 'p3_desktop_editor_light.png') });

    // Toggle to Dark Mode
    await page.click('#theme-toggle-btn');
    await new Promise((r) => setTimeout(r, 300));
    const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    record('P3-THEME-01', 'Dark Mode Toggle Operates Correctly', isDark, {
      message: `HTML dark class active: ${isDark}`
    });
    await page.screenshot({ path: path.join(screenshotDir, 'p3_desktop_editor_dark.png') });

    // Switch back to light
    await page.click('#theme-toggle-btn');
    await new Promise((r) => setTimeout(r, 200));

    // -------------------------------------------------------------------------
    // 6. PART 17: NETWORK & SECURITY AUDIT
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Part 17: Zero External Network Leaks Audit ---');
    const externalLeaks = networkRequests.filter(req => {
      const u = req.url.toLowerCase();
      return !u.includes('microsoft.com') && 
             !u.includes('skype.com') && 
             !u.includes('msn.com') && 
             !u.includes('bing.com') &&
             !u.includes('fonts.googleapis.com') &&
             !u.includes('fonts.gstatic.com');
    });
    if (externalLeaks.length > 0) {
      console.log('Unrecognized external requests:', externalLeaks);
    }
    record('P3-SEC-01', 'Zero Document Data Leaked over Network', externalLeaks.length === 0, {
      message: `External leaks: ${externalLeaks.length} (Total raw external network events: ${networkRequests.length})`
    });

    record('P3-SEC-02', 'Zero Severe Browser Runtime Console Errors', consoleErrors.length === 0, {
      message: `Console errors captured: ${consoleErrors.length}`
    });

  } catch (err) {
    console.error('Test execution error:', err);
    record('P3-EXEC-ERR', 'Execution Failure', false, { message: err.message });
  } finally {
    await browser.close();
  }

  // Write output JSON
  const outputPath = path.resolve('docs/phase3-production-release-audit.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nMachine-readable audit results saved to: ${outputPath}`);
  console.log(`Phase 3 Audit complete. Total: ${results.summary.total}, Passed: ${results.summary.passed}, Failed: ${results.summary.failed}`);
}

runPhase3Verifier();
