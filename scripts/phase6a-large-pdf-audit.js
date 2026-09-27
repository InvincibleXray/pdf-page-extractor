/**
 * Phase 6A — Large PDF Form Discovery & Performance Audit
 * 
 * Tests the real 876-page PDF (C:\Users\A\Desktop\ece\5th sem ECE organizer.pdf, 211.7 MB)
 * for AcroForm discovery time, active-page widget inspection latency, and memory behavior.
 */
import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

const largePdfPath = 'C:\\Users\\A\\Desktop\\ece\\5th sem ECE organizer.pdf';

async function auditLargePdfPerformance() {
  console.log('================================================================');
  console.log('PHASE 6A: LARGE PDF PERFORMANCE & DISCOVERY AUDIT');
  console.log('================================================================\n');

  if (!fs.existsSync(largePdfPath)) {
    console.warn(`File not found: ${largePdfPath}`);
    return;
  }

  const stat = fs.statSync(largePdfPath);
  console.log(`Document: ${largePdfPath}`);
  console.log(`Size: ${(stat.size / (1024 * 1024)).toFixed(1)} MB\n`);

  const memBefore = process.memoryUsage().heapUsed;

  // 1. PDF.js Document Loading & AcroForm Discovery
  console.log('--- 1. PDF.js Document Loading & Field Objects Discovery ---');
  const t0 = Date.now();
  const bytes = fs.readFileSync(largePdfPath);
  const tFileRead = Date.now() - t0;
  console.log(`  File read into buffer: ${tFileRead} ms`);

  const t1 = Date.now();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bytes) });
  const jsDoc = await loadingTask.promise;
  const tDocLoad = Date.now() - t1;
  console.log(`  PDF.js document loaded: ${tDocLoad} ms (pages: ${jsDoc.numPages})`);

  // Document-level form discovery
  const t2 = Date.now();
  const fieldObjects = await jsDoc.getFieldObjects();
  const tFieldObjs = Date.now() - t2;
  const hasAcroForm = fieldObjects !== null && Object.keys(fieldObjects).length > 0;
  console.log(`  getFieldObjects() completed in: ${tFieldObjs} ms`);
  console.log(`  Document has interactive AcroForm fields? ${hasAcroForm} (${fieldObjects ? Object.keys(fieldObjects).length : 0} fields)`);

  // 2. Active-Page Annotation Inspection (Pages 1, 2, 100, 500)
  console.log('\n--- 2. Active-Page Annotation Inspection Latency ---');
  const samplePages = [1, 2, 100, 500];
  const pageLatencies = [];

  for (const pNum of samplePages) {
    if (pNum > jsDoc.numPages) continue;
    const pt0 = performance.now();
    const page = await jsDoc.getPage(pNum);
    const annots = await page.getAnnotations({ intent: 'display' });
    const pt1 = performance.now();
    const durationMs = Math.round((pt1 - pt0) * 100) / 100;
    pageLatencies.push({ pageNumber: pNum, durationMs, widgetCount: annots.filter(a => a.subtype === 'Widget').length });
    console.log(`  Page ${pNum}: getAnnotations() took ${durationMs} ms (widgets: ${annots.filter(a => a.subtype === 'Widget').length})`);
  }

  // 3. Memory Impact
  const memAfter = process.memoryUsage().heapUsed;
  const memDeltaMb = Math.round(((memAfter - memBefore) / (1024 * 1024)) * 10) / 10;
  console.log(`\n--- 3. Memory Impact ---`);
  console.log(`  Heap used before: ${Math.round(memBefore / (1024 * 1024))} MB`);
  console.log(`  Heap used after: ${Math.round(memAfter / (1024 * 1024))} MB (Delta: +${memDeltaMb} MB)`);

  const results = {
    fileSizeMb: Math.round(stat.size / (1024 * 1024)),
    totalPages: jsDoc.numPages,
    fileReadTimeMs: tFileRead,
    docLoadTimeMs: tDocLoad,
    fieldObjectsDiscoveryMs: tFieldObjs,
    hasAcroForm,
    pageLatencies,
    heapDeltaMb: memDeltaMb,
    recommendation: 'Lazy active-page discovery MUST be used. Never iterate all 876 pages for annotations on initial document load.',
  };

  const outPath = path.resolve('test-fixtures/phase6a/large-pdf-performance-results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\n✅ Large PDF audit complete. Output written to ${outPath}\n`);

  return results;
}

auditLargePdfPerformance().catch(err => {
  console.error('Large PDF performance audit failed:', err);
  process.exit(1);
});
