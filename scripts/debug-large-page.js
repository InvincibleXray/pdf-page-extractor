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

async function debugLargePage() {
  const browser = await puppeteer.launch({ executablePath: chromePath, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:4321/pdf-editor/', { waitUntil: 'networkidle0' });

  const fileInput = await page.$('#editor-file-input');
  await fileInput.uploadFile(path.resolve('test-fixtures/phase5b/FIXTURE_Z_MEMORY_STRESS.pdf'));
  await page.waitForSelector('#pdf-canvas', { timeout: 20000 });
  await new Promise(r => setTimeout(r, 2000));

  const info = await page.evaluate(() => {
    const canvas = document.getElementById('pdf-canvas');
    const card = document.getElementById('pdf-page-card');
    const overlay = document.getElementById('editor-overlay-layer');
    const textLayer = document.getElementById('pdf-text-layer');
    const zoomEl = document.getElementById('zoom-percentage');
    const canvasRect = canvas ? canvas.getBoundingClientRect() : null;
    const cardRect = card ? card.getBoundingClientRect() : null;
    return {
      zoom: zoomEl ? zoomEl.textContent : 'none',
      canvasWidth: canvas ? canvas.width : 0,
      canvasHeight: canvas ? canvas.height : 0,
      canvasStyleW: canvas ? canvas.style.width : 0,
      canvasStyleH: canvas ? canvas.style.height : 0,
      canvasRect: canvasRect ? { left: canvasRect.left, top: canvasRect.top, width: canvasRect.width, height: canvasRect.height } : null,
      cardRect: cardRect ? { left: cardRect.left, top: cardRect.top, width: cardRect.width, height: cardRect.height } : null,
      overlayPointerEvents: overlay ? window.getComputedStyle(overlay).pointerEvents : null,
      textLayerPointerEvents: textLayer ? window.getComputedStyle(textLayer).pointerEvents : null,
    };
  });
  console.log('Large Page Viewport Info:', JSON.stringify(info, null, 2));

  // Now simulate click on redact tool and drag
  await page.evaluate(() => {
    document.getElementById('tool-redact-btn')?.click();
  });
  await new Promise(r => setTimeout(r, 300));

  const activeTool = await page.evaluate(() => {
    const btn = document.getElementById('tool-redact-btn');
    return {
      hasActiveBg: btn?.classList.contains('bg-brand-50'),
      dataTool: btn?.getAttribute('data-tool')
    };
  });
  console.log('Active tool after click:', activeTool);

  // Now let's test pointerdown / pointermove / pointerup
  const dragResult = await page.evaluate(() => {
    const canvas = document.getElementById('pdf-canvas');
    const overlay = document.getElementById('editor-overlay-layer');
    const textLayer = document.getElementById('pdf-text-layer');
    const rect = canvas.getBoundingClientRect();

    const startX = rect.left + 50;
    const startY = rect.top + 50;
    const endX = rect.left + 250;
    const endY = rect.top + 150;

    // Dispatch pointerdown on textLayer
    textLayer.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      clientX: startX,
      clientY: startY,
      button: 0,
      pointerId: 1,
    }));

    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      clientX: endX,
      clientY: endY,
      button: 0,
      pointerId: 1,
    }));

    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      clientX: endX,
      clientY: endY,
      button: 0,
      pointerId: 1,
    }));

    const objs = overlay.querySelectorAll('[data-object-id]').length;
    return { objectsInOverlay: objs };
  });

  console.log('Drag result via dispatchEvent:', dragResult);
  await browser.close();
}

debugLargePage().catch(console.error);
