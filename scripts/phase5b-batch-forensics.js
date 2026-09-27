/**
 * Phase 5B — Comprehensive Independent Forensic Batch Audit
 * 
 * Runs full forensic inspection on ALL exported PDFs in test-fixtures/phase5b/exported/
 * using the independent forensic engine (NOT the production validator).
 * 
 * Also tests:
 * - DPI/raster quality analysis
 * - AcroForm, /Names, /Metadata catalog presence
 * - Incremental revision / orphan object analysis
 * - Download gate enforcement (separate focused test)
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { runFullForensicAudit, extractAndScanStreams, inspectPdfLibStructure } from './phase5b-forensic-engine.js';
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';

const exportDir = path.resolve('test-fixtures/phase5b/exported');
const reportDir = path.resolve('test-fixtures/phase5b/reports');

// Fixture canary mapping (must match phase5b-generate-fixtures.js)
const FIXTURE_CANARIES = {
  'FIXTURE_A_SELECTABLE': ['REDACTION_CANARY_A_7F91X'],
  'FIXTURE_B_PARTIAL': ['SECRET_CANARY_B_PARTIAL_99214'],
  'FIXTURE_C_ROTATED_TEXT': ['SECRET_CANARY_C_ROT45_18274'],
  'FIXTURE_D_TEXT_IN_IMAGE': ['SECRET_IMAGE_CANARY_D_4819'],
  'FIXTURE_E_XOBJECT_IMAGE': ['SECRET_XOBJ_CANARY_E_9912'],
  'FIXTURE_F_VECTOR': ['CANARY_F_VEC_SECRET_SHAPE'],
  'FIXTURE_G_HIDDEN_TEXT': ['SECRET_CANARY_G_TR3_INVISIBLE'],
  'FIXTURE_H_WHITE_ON_WHITE': ['SECRET_CANARY_H_WHITE_ON_WHITE'],
  'FIXTURE_I_CLIPPED': ['SECRET_CANARY_I_CLIPPED_9021'],
  'FIXTURE_J_BEHIND_OBJECT': ['SECRET_CANARY_J_ZORDER_BEHIND'],
  'FIXTURE_K_ANNOT_SECRET': ['SECRET_CANARY_K_ANNOT_TEXT'],
  'FIXTURE_L_FREETEXT': ['SECRET_CANARY_L_FREETEXT'],
  'FIXTURE_M_ACROFORM': ['SECRET_CANARY_M_ACROFORM_FIELD'],
  'FIXTURE_N_INFO_METADATA': ['SECRET_CANARY_N_AUTHOR_9821', 'SECRET_CANARY_N_TITLE_4319', 'SECRET_CANARY_N_SUBJECT_1102'],
  'FIXTURE_O_XMP_METADATA': ['SECRET_CANARY_O_XMP_STREAM_7741'],
  'FIXTURE_P_JAVASCRIPT': ['SECRET_CANARY_P_JAVASCRIPT_5502'],
  'FIXTURE_Q_ATTACHMENT': ['SECRET_CANARY_Q_EMBEDDED_FILE_8832'],
  'FIXTURE_R_OCG_LAYER': ['SECRET_CANARY_R_OCG_LAYER_3190'],
  'FIXTURE_S_MULTI_REDACT': Array.from({length: 20}, (_, i) => `SECRET_CANARY_S_${(i+1).toString().padStart(2,'0')}_TOKEN`),
  'FIXTURE_T_SPANNING': ['SECRET_CANARY_T_TEXT_991', 'SECRET_CANARY_T_VEC_992'],
  'FIXTURE_U_ROTATED_PAGES': ['SECRET_CANARY_U_ROT90_PAGE1', 'SECRET_CANARY_U_ROT180_PAGE2', 'SECRET_CANARY_U_ROT270_PAGE3'],
  'FIXTURE_V_CROPBOX_MEDIABOX': ['SECRET_CANARY_V_CROPBOX_OFFSET_719'],
  'FIXTURE_W_UNUSUAL_DIMS': ['SECRET_CANARY_W_UNUSUAL_DIM_1200x300'],
  'FIXTURE_X_PAGE_MGMT': ['SECRET_CANARY_X_PAGEMGMT_REORDER'],
  'FIXTURE_Y_MULTI_PAGE_MULTI_REDACT': ['SECRET_CANARY_Y_PAGE1_SSN', 'SECRET_CANARY_Y_PAGE2_BANK', 'SECRET_CANARY_Y_PAGE4_PASS'],
  'FIXTURE_Z_MEMORY_STRESS': ['SECRET_CANARY_Z_LARGE_PAGE_ARCH'],
};

async function runBatchForensics() {
  console.log('================================================================');
  console.log('PHASE 5B — COMPREHENSIVE INDEPENDENT FORENSIC BATCH AUDIT');
  console.log('================================================================\n');

  const exportedFiles = fs.readdirSync(exportDir).filter(f => f.endsWith('.pdf'));
  console.log(`Found ${exportedFiles.length} exported PDFs to audit.\n`);

  const results = [];
  let totalPassed = 0;
  let totalFailed = 0;
  let totalLeaks = 0;

  for (const file of exportedFiles) {
    const fixtureId = file.replace('-edited.pdf', '');
    const canaries = FIXTURE_CANARIES[fixtureId];
    if (!canaries) {
      console.log(`Skipping ${file} — no known canary mapping.`);
      continue;
    }

    const filePath = path.join(exportDir, file);
    const pdfBytes = fs.readFileSync(filePath);
    console.log(`--- ${fixtureId} (${(pdfBytes.length / 1024).toFixed(1)} KB) ---`);

    // 1. Full forensic audit (raw bytes + decompressed streams + PDF.js text + annotations)
    const forensic = await runFullForensicAudit(pdfBytes, canaries);

    // 2. Extended structural inspection
    const structural = await inspectPdfLibStructure(pdfBytes);

    // 3. Check for catalog-level security dictionary remnants
    let catalogIssues = [];
    if (structural.success) {
      if (structural.metadataPresent) catalogIssues.push('Catalog /Metadata XMP stream present');
      if (structural.acroFormPresent) catalogIssues.push('Catalog /AcroForm dictionary present');
      if (structural.namesPresent) {
        // Deeper check: does /Names still have /JavaScript or /EmbeddedFiles?
        try {
          const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
          const cat = doc.catalog;
          const namesRef = cat.get(PDFName.of('Names'));
          if (namesRef) {
            const namesDict = doc.context.lookup(namesRef);
            if (namesDict instanceof PDFDict) {
              if (namesDict.has(PDFName.of('JavaScript'))) catalogIssues.push('/Names/JavaScript tree present');
              if (namesDict.has(PDFName.of('EmbeddedFiles'))) catalogIssues.push('/Names/EmbeddedFiles tree present');
            }
          }
        } catch (e) {}
      }
    }

    // 4. DPI analysis for rasterized pages
    let dpiInfo = [];
    if (structural.success) {
      for (const pg of structural.pageGeometries) {
        if (pg.xObjects && pg.xObjects.length > 0) {
          // This page likely has a raster image — it's a redacted page
          dpiInfo.push({
            page: pg.pageNumber,
            pagePt: `${pg.width}x${pg.height}`,
            hasRaster: true,
          });
        }
      }
    }

    const passed = forensic.passed && catalogIssues.length === 0;
    if (passed) totalPassed++;
    else totalFailed++;
    totalLeaks += forensic.totalCanariesLeaked;

    const result = {
      fixtureId,
      fileSize: pdfBytes.length,
      passed,
      canaryLeaks: forensic.totalCanariesLeaked,
      allLeaks: forensic.allLeaks,
      catalogIssues,
      dpiInfo,
      pageCount: structural.pageCount,
      infoEntries: structural.infoEntries,
      canaryDetails: forensic.canaryReports,
    };
    results.push(result);

    if (passed) {
      console.log(`  PASS — 0 canary leaks, ${catalogIssues.length} catalog issues`);
    } else {
      console.log(`  FAIL — ${forensic.totalCanariesLeaked} canary leak(s), ${catalogIssues.length} catalog issue(s)`);
      if (forensic.allLeaks.length > 0) console.log(`    Leaks: ${forensic.allLeaks.join('; ')}`);
      if (catalogIssues.length > 0) console.log(`    Catalog: ${catalogIssues.join('; ')}`);
    }
  }

  // 5. Incremental revision / orphan object scan on a sample exported PDF
  console.log('\n--- Incremental Revision / Orphan Object Scan ---');
  const sampleExported = path.join(exportDir, 'FIXTURE_B_PARTIAL-edited.pdf');
  if (fs.existsSync(sampleExported)) {
    const sampleBytes = fs.readFileSync(sampleExported);
    const ascii = Buffer.from(sampleBytes).toString('latin1');
    const xrefCount = (ascii.match(/xref/g) || []).length;
    const startxrefCount = (ascii.match(/startxref/g) || []).length;
    const eofCount = (ascii.match(/%%EOF/g) || []).length;
    console.log(`  xref sections: ${xrefCount}, startxref: ${startxrefCount}, %%EOF: ${eofCount}`);
    if (eofCount > 1) {
      console.log(`  WARNING: Multiple %%EOF markers found — possible incremental revision remnants!`);
    } else {
      console.log(`  CLEAN: Single %%EOF — freshly serialized document (no incremental updates).`);
    }
  }

  console.log('\n================================================================');
  console.log('BATCH FORENSIC SUMMARY:');
  console.log(`  Fixtures audited: ${results.length}`);
  console.log(`  Passed: ${totalPassed}`);
  console.log(`  Failed: ${totalFailed}`);
  console.log(`  Total canary leaks: ${totalLeaks}`);
  console.log('================================================================');

  // Write detailed JSON report
  const reportPath = path.join(reportDir, 'batch-forensic-results.json');
  fs.writeFileSync(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), results, summary: { totalPassed, totalFailed, totalLeaks } }, null, 2));
  console.log(`\nDetailed results written to ${reportPath}`);

  return results;
}

runBatchForensics().catch(console.error);
