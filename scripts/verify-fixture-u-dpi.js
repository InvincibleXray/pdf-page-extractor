import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { PDFDocument, PDFName } from 'pdf-lib';

const browserCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];
const chromePath = browserCandidates.find(p => fs.existsSync(p));
const exportDir = path.resolve('test-fixtures/phase5b/exported');

async function testFixtureU() {
  const browser = await puppeteer.launch({ executablePath: chromePath, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: exportDir });
  await page.setViewport({ width: 1440, height: 900 });

  const uOut = path.join(exportDir, 'FIXTURE_U_ROTATED_PAGES-edited.pdf');
  if (fs.existsSync(uOut)) fs.unlinkSync(uOut);

  await page.goto('http://localhost:4321/pdf-editor/', { waitUntil: 'networkidle0' });
  const fileInput = await page.$('#editor-file-input');
  await fileInput.uploadFile(path.resolve('test-fixtures/phase5b/FIXTURE_U_ROTATED_PAGES.pdf'));
  await page.waitForSelector('#pdf-canvas', { timeout: 15000 });
  await new Promise(r => setTimeout(r, 1000));

  // Add redactions to all 3 pages
  // Page 1 (90 deg)
  await page.evaluate(() => { document.getElementById('tool-redact-btn')?.click(); });
  await new Promise(r => setTimeout(r, 200));
  await page.mouse.move(450, 250);
  await page.mouse.down();
  await page.mouse.move(650, 350);
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 300));

  // Page 2 (180 deg)
  await page.evaluate(() => { document.getElementById('page-next-btn')?.click(); });
  await new Promise(r => setTimeout(r, 800));
  await page.evaluate(() => { document.getElementById('tool-redact-btn')?.click(); });
  await page.mouse.move(450, 250);
  await page.mouse.down();
  await page.mouse.move(650, 350);
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 300));

  // Page 3 (270 deg)
  await page.evaluate(() => { document.getElementById('page-next-btn')?.click(); });
  await new Promise(r => setTimeout(r, 800));
  await page.evaluate(() => { document.getElementById('tool-redact-btn')?.click(); });
  await page.mouse.move(450, 250);
  await page.mouse.down();
  await page.mouse.move(650, 350);
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 300));

  // Export
  const filesBefore = fs.readdirSync(exportDir);
  await page.evaluate(() => { document.getElementById('editor-export-btn')?.click(); });
  await page.waitForSelector('#redaction-confirm-modal:not(.hidden)', { timeout: 8000 });
  await page.evaluate(() => { document.getElementById('confirm-redact-export-btn')?.click(); });

  let downloaded = null;
  const start = Date.now();
  while (Date.now() - start < 30000) {
    const current = fs.readdirSync(exportDir).filter(f => !f.endsWith('.crdownload') && !f.endsWith('.tmp'));
    const newF = current.filter(f => !filesBefore.includes(f));
    if (newF.length > 0) { downloaded = path.join(exportDir, newF[0]); break; }
    await new Promise(r => setTimeout(r, 250));
  }

  await browser.close();

  if (downloaded) {
    const doc = await PDFDocument.load(fs.readFileSync(downloaded), { ignoreEncryption: true });
    console.log('FIXTURE_U Re-Export DPI Result:');
    for (let i = 0; i < doc.getPageCount(); i++) {
      const p = doc.getPage(i);
      const pW = p.getWidth();
      const pH = p.getHeight();
      const res = doc.context.lookup(p.node.get(PDFName.of('Resources')));
      const xo = doc.context.lookup(res.get(PDFName.of('XObject')));
      for (const [k, ref] of xo.entries()) {
        const img = doc.context.lookup(ref);
        const dict = img.dict || img;
        const w = dict.get(PDFName.of('Width')).value();
        const h = dict.get(PDFName.of('Height')).value();
        const dpiX = (w / pW) * 72;
        const dpiY = (h / pH) * 72;
        console.log(`  Page ${i+1} (${pW}x${pH} pt): Image ${w}x${h} px -> DPI: ${dpiX.toFixed(1)}x${dpiY.toFixed(1)} (delta: ${Math.abs(dpiX - dpiY).toFixed(3)})`);
      }
    }
  } else {
    console.log('Export failed to download');
  }
}

testFixtureU().catch(console.error);
