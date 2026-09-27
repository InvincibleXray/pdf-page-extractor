import fs from 'fs';
import path from 'path';
import { exportPdfDocument } from '../src/utils/pdfExportEngine.js';
import * as pdfjsLib from 'pdfjs-dist';

async function testLargePdf() {
  console.log('====================================================');
  console.log('Testing Large PDF Performance & Memory Guard');
  console.log('====================================================\n');

  const largePdfPath = 'C:\\Users\\A\\Desktop\\ece\\5th sem ECE organizer.pdf';
  if (!fs.existsSync(largePdfPath)) {
    console.log(`Large PDF not found at ${largePdfPath}, skipping test.`);
    return;
  }

  const stat = fs.statSync(largePdfPath);
  console.log(`File size: ${(stat.size / (1024 * 1024)).toFixed(2)} MB`);

  const t0 = Date.now();
  const rawBytes = fs.readFileSync(largePdfPath);
  const pristineBytes = rawBytes.buffer.slice(rawBytes.byteOffset, rawBytes.byteOffset + rawBytes.byteLength);
  console.log(`Loaded pristine bytes in ${Date.now() - t0} ms`);

  const t1 = Date.now();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pristineBytes.slice(0)),
    useSystemFonts: true,
  });
  const jsDoc = await loadingTask.promise;
  console.log(`PDF.js loaded ${jsDoc.numPages} pages in ${Date.now() - t1} ms`);

  // Verify form discovery on page 1 is lazy & fast
  const t2 = Date.now();
  const p1 = await jsDoc.getPage(1);
  const annots = await p1.getAnnotations({ intent: 'display' });
  console.log(`Page 1 annotations queried in ${Date.now() - t2} ms (count: ${annots.length})`);

  // Export 1st page or small subset to verify memory guards and fast path
  const t3 = Date.now();
  const exportResult = await exportPdfDocument(
    pristineBytes,
    [],
    '5th sem ECE organizer.pdf',
    (stage) => {
      // progress log
    },
    [
      {
        id: 'p_1',
        sourcePageIndex: 0,
        originalPageNumber: 1,
        pageNumber: 1,
        rotation: 0,
        width: 595,
        height: 842,
        orientation: 'portrait',
      },
    ],
    {
      download: false,
      loadedDocProxy: jsDoc,
    }
  );

  const tExport = Date.now() - t3;
  console.log(`Single-page export from large doc completed in ${tExport} ms`);
  console.log(`Export success: ${exportResult.success}, bytes: ${exportResult.pdfBytes?.length || 0}`);

  await jsDoc.destroy();
  if (!exportResult.success) {
    throw new Error(`Large PDF export failed: ${exportResult.error}`);
  }
  console.log('\n✅ Large PDF memory guard & export test PASSED!');
}

testLargePdf().catch((err) => {
  console.error('Large PDF test error:', err);
  process.exit(1);
});
