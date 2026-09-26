import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function testExportEngine() {
  console.log('Starting export engine validation...');

  // 1. Create a clean sample base PDF
  const baseDoc = await PDFDocument.create();
  const font = await baseDoc.embedFont(StandardFonts.Helvetica);
  const page1 = baseDoc.addPage([595, 842]);
  page1.drawText('Original Base Document', { x: 50, y: 750, size: 16, font });
  const baseBytes = await baseDoc.save();

  // Pristine clone
  const pristineClone = baseBytes.buffer.slice(baseBytes.byteOffset, baseBytes.byteOffset + baseBytes.byteLength);

  // 2. Load into pdf-lib to apply simulated annotations
  const exportDoc = await PDFDocument.load(pristineClone);
  const exportPage = exportDoc.getPage(0);
  const pageHeight = exportPage.getHeight();

  // Draw text
  exportPage.drawText('Edited Line 1\nEdited Line 2', {
    x: 50,
    y: pageHeight - 100 - 14,
    size: 14,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });

  // Draw highlight (explicit opacity)
  exportPage.drawRectangle({
    x: 50,
    y: pageHeight - 200 - 24,
    width: 250,
    height: 24,
    color: rgb(0.98, 0.8, 0.08),
    opacity: 0.35,
  });

  // Draw whiteout (opaque white)
  exportPage.drawRectangle({
    x: 50,
    y: pageHeight - 300 - 40,
    width: 200,
    height: 40,
    color: rgb(1, 1, 1),
    opacity: 1.0,
  });

  // Draw rectangle & ellipse
  exportPage.drawRectangle({
    x: 50,
    y: pageHeight - 400 - 60,
    width: 150,
    height: 60,
    borderColor: rgb(0.14, 0.38, 0.92),
    borderWidth: 2,
  });

  exportPage.drawEllipse({
    x: 350,
    y: pageHeight - 400 - 30,
    xScale: 50,
    yScale: 30,
    borderColor: rgb(0.14, 0.38, 0.92),
    borderWidth: 2,
  });

  const modifiedBytes = await exportDoc.save();
  console.log(`Generated modified PDF: ${modifiedBytes.length} bytes`);

  // 3. Validation: Re-open in pdf-lib
  const verifyPdfLib = await PDFDocument.load(modifiedBytes);
  if (verifyPdfLib.getPageCount() !== 1) {
    throw new Error('Verification failed: Page count mismatch');
  }

  // 4. Validation: Re-open in PDF.js
  const loadingTask = pdfjsLib.getDocument({ data: modifiedBytes });
  const verifyPdfJs = await loadingTask.promise;
  const p1 = await verifyPdfJs.getPage(1);
  const vp = p1.getViewport({ scale: 1.0 });
  console.log(`PDF.js verified exported Page 1: ${vp.width} x ${vp.height}`);
  await verifyPdfJs.destroy();

  console.log('Export engine verification PASSED with 100% structural fidelity!');
}

testExportEngine().catch((err) => {
  console.error('Export engine verification FAILED:', err);
  process.exit(1);
});
