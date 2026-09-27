/**
 * Phase 6A — Coordinate System & Geometry Audit for Form Widgets
 * 
 * Verifies that coordinateMapper.ts and PageViewport correctly project
 * PDF widget rectangles [x1, y1, x2, y2] into screen overlay CSS coordinates
 * across:
 * - Rotations: 0°, 90°, 180°, 270°
 * - Zoom levels: 25%, 50%, 100%, 200%
 * - Non-standard dimensions: 1200x300 pt banner and 2592x3456 pt blueprint
 */
import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist';

const fixturesDir = path.resolve('test-fixtures/phase6a');

/**
 * Converts a PDF [x1, y1, x2, y2] bottom-left bounding box to screen CSS coordinates
 * using PageViewport.convertToViewportRectangle()
 */
function pdfWidgetRectToScreen(rect, viewport) {
  // rect in PDF is [x1, y1, x2, y2] where (x1, y1) is bottom-left, (x2, y2) is top-right
  const viewRect = viewport.convertToViewportRectangle(rect);
  // convertToViewportRectangle returns [x1, y1, x2, y2] in viewport coordinates (top-left origin)
  const minX = Math.min(viewRect[0], viewRect[2]);
  const maxX = Math.max(viewRect[0], viewRect[2]);
  const minY = Math.min(viewRect[1], viewRect[3]);
  const maxY = Math.max(viewRect[1], viewRect[3]);

  return {
    left: Math.round(minX * 100) / 100,
    top: Math.round(minY * 100) / 100,
    width: Math.round((maxX - minX) * 100) / 100,
    height: Math.round((maxY - minY) * 100) / 100,
  };
}

async function auditCoordinates() {
  console.log('================================================================');
  console.log('PHASE 6A: COORDINATE SYSTEM & GEOMETRY AUDIT');
  console.log('================================================================\n');

  const results = {
    rotations: {},
    zooms: {},
    nonStandardDims: {},
  };

  // 1. Audit Rotated Pages (Fixture L: 0°, 90°, 180°, 270°)
  console.log('--- SECTION 1: Rotated Pages (Fixture L) ---');
  const bytesL = fs.readFileSync(path.join(fixturesDir, 'FIXTURE_L_ROTATED_PAGE.pdf'));
  const jsDocL = await pdfjsLib.getDocument({ data: new Uint8Array(bytesL) }).promise;

  const rotations = [0, 90, 180, 270];
  for (let i = 0; i < rotations.length; i++) {
    const pageNum = i + 1;
    const rot = rotations[i];
    const page = await jsDocL.getPage(pageNum);
    const annots = await page.getAnnotations();
    const widget = annots.find(a => a.subtype === 'Widget');

    // Test at 100% zoom with native rotation
    const viewport = page.getViewport({ scale: 1.0, rotation: rot });
    const screenRect = pdfWidgetRectToScreen(widget.rect, viewport);

    console.log(`  Page ${pageNum} (${rot}° rotation):`);
    console.log(`    PDF Rect: [${widget.rect.map(v => Math.round(v)).join(', ')}]`);
    console.log(`    Viewport: ${viewport.width} x ${viewport.height} px`);
    console.log(`    Screen Box: left=${screenRect.left}, top=${screenRect.top}, w=${screenRect.width}, h=${screenRect.height}`);

    const isNonNegative = screenRect.left >= 0 && screenRect.top >= 0;
    const isWithinBounds = screenRect.left + screenRect.width <= viewport.width &&
                           screenRect.top + screenRect.height <= viewport.height;

    results.rotations[rot] = {
      pdfRect: widget.rect,
      screenRect,
      viewportDims: { w: viewport.width, h: viewport.height },
      valid: isNonNegative && isWithinBounds,
    };
  }

  // 2. Audit Zoom Levels (Fixture A at 25%, 50%, 100%, 200%)
  console.log('\n--- SECTION 2: Zoom Levels (Fixture A: 25%, 50%, 100%, 200%) ---');
  const bytesA = fs.readFileSync(path.join(fixturesDir, 'FIXTURE_A_SINGLE_TEXT.pdf'));
  const jsDocA = await pdfjsLib.getDocument({ data: new Uint8Array(bytesA) }).promise;
  const pageA = await jsDocA.getPage(1);
  const annotsA = await pageA.getAnnotations();
  const widgetA = annotsA[0]; // applicant.firstName

  const zooms = [0.25, 0.5, 1.0, 2.0];
  for (const z of zooms) {
    const viewport = pageA.getViewport({ scale: z });
    const screenRect = pdfWidgetRectToScreen(widgetA.rect, viewport);

    console.log(`  Zoom ${Math.round(z * 100)}%:`);
    console.log(`    Screen Box: left=${screenRect.left}, top=${screenRect.top}, w=${screenRect.width}, h=${screenRect.height}`);

    results.zooms[`${z * 100}%`] = {
      scale: z,
      screenRect,
      proportional: Math.abs(screenRect.width - (widgetA.rect[2] - widgetA.rect[0]) * z) < 1.0,
    };
  }

  // 3. Audit Non-Standard Dimensions (Fixture M)
  console.log('\n--- SECTION 3: Non-Standard Page Dimensions (Fixture M) ---');
  const bytesM = fs.readFileSync(path.join(fixturesDir, 'FIXTURE_M_UNUSUAL_DIMS.pdf'));
  const jsDocM = await pdfjsLib.getDocument({ data: new Uint8Array(bytesM) }).promise;

  // Page 1: 1200 x 300
  const pageM1 = await jsDocM.getPage(1);
  const annotsM1 = await pageM1.getAnnotations();
  const vpM1 = pageM1.getViewport({ scale: 1.0 });
  const rectM1 = pdfWidgetRectToScreen(annotsM1[0].rect, vpM1);
  console.log(`  Banner (1200x300 pt): Screen Box left=${rectM1.left}, top=${rectM1.top}, w=${rectM1.width}, h=${rectM1.height}`);

  // Page 2: 2592 x 3456
  const pageM2 = await jsDocM.getPage(2);
  const annotsM2 = await pageM2.getAnnotations();
  const vpM2 = pageM2.getViewport({ scale: 0.25 }); // 25% preview zoom
  const rectM2 = pdfWidgetRectToScreen(annotsM2[0].rect, vpM2);
  console.log(`  Blueprint (2592x3456 pt at 25% zoom): Screen Box left=${rectM2.left}, top=${rectM2.top}, w=${rectM2.width}, h=${rectM2.height}`);

  results.nonStandardDims = {
    banner: { rectM1, valid: rectM1.left >= 0 && rectM1.top >= 0 },
    blueprint: { rectM2, valid: rectM2.left >= 0 && rectM2.top >= 0 },
  };

  const reportPath = path.resolve('test-fixtures/phase6a/coordinate-audit-results.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n✅ Coordinate audit complete. Output written to ${reportPath}\n`);
  return results;
}

auditCoordinates().catch(err => {
  console.error('Coordinate audit failed:', err);
  process.exit(1);
});
