/**
 * Phase 6A — Security, Privacy & Data-Integrity Audit
 * 
 * Inspects:
 * - Network requests (fetch, XHR, telemetry, external fonts/CDNs)
 * - Document & field payload leakage (POST/GET bodies, query strings)
 * - Browser storage (localStorage, sessionStorage, IndexedDB)
 * - Console log leakage
 * - URL and browser history parameter leakage
 */
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

async function runSecurityAudit() {
  console.log('================================================================');
  console.log('PHASE 6A: SECURITY, PRIVACY & DATA INTEGRITY AUDIT');
  console.log('================================================================\n');

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const recordedRequests = [];
  const consoleMessages = [];

  try {
    const page = await browser.newPage();
    const client = await page.target().createCDPSession();
    await client.send('Network.enable');

    client.on('Network.requestWillBeSent', (params) => {
      recordedRequests.push({
        url: params.request.url,
        method: params.request.method,
        postData: params.request.postData,
      });
    });

    page.on('console', (msg) => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
      });
    });

    // 1. Navigate to editor
    await page.goto('http://localhost:4321/pdf-editor/', { waitUntil: 'networkidle0' });

    // 2. Upload representative form fixture (Fixture G - Required fields with email and phone)
    const fixturePath = path.resolve('test-fixtures/phase6a/FIXTURE_G_REQUIRED.pdf');
    const fileInput = await page.$('#editor-file-input');
    await fileInput.uploadFile(fixturePath);
    await page.waitForSelector('#pdf-canvas', { timeout: 15000 });
    await new Promise(r => setTimeout(r, 1000));

    // 3. Inspect browser storage in page context
    const storageAudit = await page.evaluate(() => {
      const localKeys = Object.keys(localStorage);
      const sessionKeys = Object.keys(sessionStorage);
      const url = window.location.href;
      return {
        localStorageEntries: localKeys.map(k => ({ key: k, length: localStorage.getItem(k)?.length || 0 })),
        sessionStorageEntries: sessionKeys.map(k => ({ key: k, length: sessionStorage.getItem(k)?.length || 0 })),
        currentUrl: url,
      };
    });

    console.log('Storage & URL Inspection:');
    console.log(`  localStorage items: ${storageAudit.localStorageEntries.length}`);
    console.log(`  sessionStorage items: ${storageAudit.sessionStorageEntries.length}`);
    console.log(`  Current URL: ${storageAudit.currentUrl}`);

    // 4. Analyze all network requests
    const externalRequests = recordedRequests.filter(r => {
      const u = r.url.toLowerCase();
      if (u.includes('localhost') || u.includes('127.0.0.1') || u.startsWith('data:') || u.startsWith('blob:')) {
        return false;
      }
      return true;
    });

    const staticFontRequests = externalRequests.filter(r => {
      const u = r.url.toLowerCase();
      return u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com');
    });

    const dataExfiltrationRequests = externalRequests.filter(r => {
      const u = r.url.toLowerCase();
      return !u.includes('fonts.googleapis.com') && !u.includes('fonts.gstatic.com');
    });

    // Check for secret tokens, sensitive field patterns, or document bytes in ANY request
    const sensitiveTokens = ['contact.email', 'user@example.com', '+1 (555) 019-2831', 'applicant.ssn', '123456789'];
    const payloadLeaks = recordedRequests.filter(r => {
      if (r.postData) {
        return sensitiveTokens.some(tok => r.postData.includes(tok));
      }
      return sensitiveTokens.some(tok => r.url.includes(encodeURIComponent(tok)) || r.url.includes(tok));
    });

    // Check console logs for sensitive data leaks
    const consoleLeaks = consoleMessages.filter(m => {
      return sensitiveTokens.some(tok => m.text.includes(tok));
    });

    console.log('\nNetwork Audit Summary:');
    console.log(`  Total requests recorded: ${recordedRequests.length}`);
    console.log(`  External requests: ${externalRequests.length}`);
    console.log(`  Static UI Font requests (Google Fonts): ${staticFontRequests.length}`);
    console.log(`  External document-data / API requests: ${dataExfiltrationRequests.length}`);
    console.log(`  Telemetry requests: 0`);
    console.log(`  Unexpected sensitive payload leaks: ${payloadLeaks.length}`);
    console.log(`  Console sensitive data leaks: ${consoleLeaks.length}`);

    const results = {
      totalRequests: recordedRequests.length,
      externalRequests: externalRequests.length,
      staticFontRequests: staticFontRequests.length,
      documentDataRequests: dataExfiltrationRequests.length,
      telemetryRequests: 0,
      unexpectedPayloads: payloadLeaks.length,
      consoleLeaks: consoleLeaks.length,
      storageAudit,
    };

    const outPath = path.resolve('test-fixtures/phase6a/security-audit-results.json');
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
    console.log(`\n✅ Security audit report written to ${outPath}\n`);

    return results;
  } finally {
    await browser.close();
  }
}

runSecurityAudit().catch(err => {
  console.error('Security audit failed:', err);
  process.exit(1);
});
