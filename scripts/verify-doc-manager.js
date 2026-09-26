import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function testManager() {
  const filePath = 'C:/Users/A/Desktop/ece/5th sem ECE organizer.pdf';
  if (!fs.existsSync(filePath)) {
    console.log('Skipping real PDF test: file not found');
    return;
  }
  const buffer = fs.readFileSync(filePath);
  const pristineClone = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pristineClone) });
  const doc = await loadingTask.promise;
  console.log(`Successfully loaded PDF with ${doc.numPages} pages.`);
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1.0 });
  console.log(`Page 1 dimensions: ${viewport.width} x ${viewport.height}`);
  await doc.destroy();
}

testManager().catch(err => {
  console.error('Test manager failed:', err);
  process.exit(1);
});
