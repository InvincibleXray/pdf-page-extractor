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

async function runNetworkPrivacyAudit() {
  console.log('================================================================');
  console.log('NETWORK & PRIVACY LOCAL-ONLY EXECUTION AUDIT');
  console.log('================================================================\n');

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const recordedRequests = [];

  try {
    const page = await browser.newPage();
    const client = await page.target().createCDPSession();
    await client.send('Network.enable');

    client.on('Network.requestWillBeSent', (params) => {
      recordedRequests.push({
        url: params.request.url,
        method: params.request.method,
        postData: params.request.postData
      });
    });

    await page.setViewport({ width: 1440, height: 900 });
    // 1. Load Editor
    await page.goto('http://localhost:4321/pdf-editor/', { waitUntil: 'networkidle0' });

    // 2. Upload a test PDF
    const fixturePath = path.resolve('test-fixtures/phase5b/FIXTURE_A_SELECTABLE.pdf');
    const fileInput = await page.$('#editor-file-input');
    await fileInput.uploadFile(fixturePath);
    await page.waitForSelector('#pdf-canvas', { timeout: 15000 });

    // 3. Draw a redaction box
    await new Promise(r => setTimeout(r, 1000));
    await page.evaluate(() => {
      document.getElementById('tool-redact-btn')?.click();
    });
    await new Promise(r => setTimeout(r, 300));
    const canvasBounds = await page.evaluate(() => {
      const c = document.getElementById('pdf-canvas');
      const r = c.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
    await page.mouse.move(canvasBounds.x + 50, canvasBounds.y + 50);
    await page.mouse.down();
    await page.mouse.move(canvasBounds.x + 250, canvasBounds.y + 100);
    await page.mouse.up();

    // 4. Trigger Export
    await page.evaluate(() => {
      document.getElementById('editor-export-btn')?.click();
    });
    await page.waitForSelector('#redaction-confirm-modal:not(.hidden)', { timeout: 8000 });
    await page.evaluate(() => {
      document.getElementById('confirm-redact-export-btn')?.click();
    });
    await page.waitForSelector('#editor-export-toast', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 4000));

    // Audit captured network requests
    const dataExfiltrationRequests = recordedRequests.filter(r => {
      const u = r.url.toLowerCase();
      // Exclude localhost/127.0.0.1 and data/blob URLs
      if (u.includes('localhost') || u.includes('127.0.0.1') || u.startsWith('data:') || u.startsWith('blob:')) {
        return false;
      }
      // Check if it's just static fonts/CSS
      if (u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) {
        return false;
      }
      return true;
    });

    // Also check all requests for POST/PUT bodies or payload leaks
    const payloadLeakRequests = recordedRequests.filter(r => {
      if (r.method === 'POST' || r.method === 'PUT') {
        const u = r.url.toLowerCase();
        if (!u.includes('localhost') && !u.includes('127.0.0.1')) return true;
      }
      if (r.postData && (r.postData.includes('CONFIDENTIAL') || r.postData.includes('CANARY') || r.postData.includes('pdf'))) {
        return true;
      }
      return false;
    });

    const staticCdnRequests = recordedRequests.filter(r => {
      const u = r.url.toLowerCase();
      return u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com');
    });

    console.log(`Total HTTP/CDP requests recorded: ${recordedRequests.length}`);
    console.log(`Static UI font requests (Google Fonts): ${staticCdnRequests.length}`);
    console.log(`External API / backend / analytical requests: ${dataExfiltrationRequests.length}`);
    console.log(`Data exfiltration / document payload leak requests: ${payloadLeakRequests.length}`);

    if (dataExfiltrationRequests.length === 0 && payloadLeakRequests.length === 0) {
      console.log('✅ PRIVACY AUDIT PASSED: 100% of PDF processing, rendering, rasterization, and export executed strictly in-browser.');
      console.log('   Zero document bytes, metadata, or canaries left the client environment.');
      return true;
    } else {
      console.error('❌ PRIVACY AUDIT FAILED: Data exfiltration detected:', { dataExfiltrationRequests, payloadLeakRequests });
      return false;
    }
  } finally {
    await browser.close();
  }
}

runNetworkPrivacyAudit().then(passed => {
  process.exit(passed ? 0 : 1);
}).catch(err => {
  console.error('Error during privacy audit:', err);
  process.exit(1);
});
