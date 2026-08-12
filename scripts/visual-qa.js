import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outputDir = 'C:\\Users\\A\\.gemini\\antigravity\\brain\\3a1e8236-ef37-4c10-9a79-cf9ce2225f04\\qa_screenshots';
const downloadDir = path.join(outputDir, 'downloads');
const realPdfPath = 'C:\\Users\\A\\Desktop\\ece\\5th sem ECE organizer.pdf';

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

async function runVisualQA() {
  console.log('Starting Visual & Functional Individual Pages QA on http://127.0.0.1:4321 ...');
  
  if (!fs.existsSync(realPdfPath)) {
    throw new Error(`Real PDF test file not found at: ${realPdfPath}`);
  }
  console.log(`Using real PDF test file: ${realPdfPath}`);

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  // Configure download directory in Chrome
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
  });

  // Retry loop for dev server readiness
  let connected = false;
  for (let i = 0; i < 15; i++) {
    try {
      await page.goto('http://127.0.0.1:4321', { waitUntil: 'networkidle0', timeout: 5000 });
      connected = true;
      break;
    } catch (e) {
      console.log(`Waiting for dev server... attempt ${i + 1}/15`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (!connected) {
    throw new Error('Could not connect to Astro dev server at http://127.0.0.1:4321');
  }

  // 1. Desktop Light Mode - Initial State
  await page.setViewport({ width: 1440, height: 900 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  
  await page.evaluate(() => {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  });
  await new Promise(r => setTimeout(r, 200));
  await page.screenshot({ path: path.join(outputDir, '01_desktop_light.png') });
  console.log('Saved 01_desktop_light.png');

  // 2. Upload Real PDF File
  const fileInput = await page.$('#file-input');
  await fileInput.uploadFile(realPdfPath);
  await new Promise(r => setTimeout(r, 1000));

  await page.screenshot({ path: path.join(outputDir, '06_file_selected_light.png') });
  console.log('Saved 06_file_selected_light.png');

  // 3. Test Range Mode Extraction (Pages 1 to 5)
  await page.focus('#start-page');
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.type('1');

  await page.focus('#end-page');
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.type('5');

  await page.click('#extract-btn');
  await new Promise(r => setTimeout(r, 1500));

  // 4. Switch to Individual Pages Mode
  await page.click('#mode-individual-btn');
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: path.join(outputDir, '07_individual_mode_selected.png') });
  console.log('Saved 07_individual_mode_selected.png');

  // 5. Test Individual Pages Input: "2, 5, 8, 13"
  await page.focus('#individual-pages-input');
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.type('2, 5, 8, 13');
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: path.join(outputDir, '08_individual_list.png') });
  console.log('Saved 08_individual_list.png');

  await page.click('#extract-btn');
  await new Promise(r => setTimeout(r, 1500));

  // 6. Test Mixed Range & Individual Input: "1, 3, 7-10, 15"
  await page.focus('#individual-pages-input');
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.type('1, 3, 7-10, 15');
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: path.join(outputDir, '09_individual_mixed.png') });
  console.log('Saved 09_individual_mixed.png');

  await page.click('#extract-btn');
  await new Promise(r => setTimeout(r, 1500));

  // 7. Test Duplicate Input: "2, 2, 5, 5, 8"
  await page.focus('#individual-pages-input');
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.type('2, 2, 5, 5, 8');
  await new Promise(r => setTimeout(r, 300));

  const pillText = await page.$eval('#range-status-text', el => el.textContent);
  console.log(`Deduplication status text: "${pillText}" (Expected: "3 pages selected (Pages: 2, 5, 8)")`);

  // 8. Test Invalid Page Inputs: Page 0, Negative, Decimal, Out of bounds
  // A. Page 0
  await page.focus('#individual-pages-input');
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.type('0, 5');
  await new Promise(r => setTimeout(r, 200));
  const err0 = await page.$eval('#range-status-text', el => el.textContent);
  console.log(`Error test (Page 0): "${err0}"`);

  // B. Decimal value
  await page.focus('#individual-pages-input');
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.type('2.5, 5');
  await new Promise(r => setTimeout(r, 200));
  const errDecimal = await page.$eval('#range-status-text', el => el.textContent);
  console.log(`Error test (Decimal 2.5): "${errDecimal}"`);

  // C. Out of bounds page 9999
  await page.focus('#individual-pages-input');
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.type('9999');
  await new Promise(r => setTimeout(r, 200));
  const errOutOfBounds = await page.$eval('#range-status-text', el => el.textContent);
  console.log(`Error test (Out of bounds 9999): "${errOutOfBounds}"`);

  // 9. Dark Mode Check in Individual Pages Mode
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    localStorage.setItem('theme', 'dark');
  });
  await new Promise(r => setTimeout(r, 200));
  await page.screenshot({ path: path.join(outputDir, '10_individual_dark.png') });
  console.log('Saved 10_individual_dark.png');

  // Verify downloaded files in Chrome session
  const downloadedFiles = fs.readdirSync(downloadDir);
  console.log('Downloaded Files in Chrome session:', downloadedFiles);

  for (const fileName of downloadedFiles) {
    const filePath = path.join(downloadDir, fileName);
    const bytes = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(bytes);
    console.log(`Verified downloaded PDF "${fileName}": ${pdfDoc.getPageCount()} pages`);
  }

  await browser.close();
  console.log('Visual & Functional Individual Pages QA finished successfully!');
}

runVisualQA().catch(err => {
  console.error('Visual QA Error:', err);
  process.exit(1);
});
