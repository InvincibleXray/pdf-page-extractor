/**
 * Phase 7.2 Independent Forensic Verifier
 * 
 * STRICT INDEPENDENCE RULE:
 * This script does NOT import or rely on any production validation helpers
 * (e.g. redactionValidator.ts, pdfSanitizer.ts, pdfExportEngine.ts).
 * It uses raw binary stream inspection, PDF.js, and pdf-lib directly to
 * independently audit exported PDF files against forensic criteria across
 * 10 distinct vectors (A through J).
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { PDFDocument, PDFName } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

export const PHASE72_CANARY = 'PHASE72_FINAL_FORENSIC_SECRET_7X9Q';

export async function verifyPdfForensics(filePath, options = {}) {
  const failureReasons = [];
  const canaryLeakDetections = [];
  const vectorAudit = {
    vectorA_pdfjsText: { passed: true, details: '' },
    vectorB_rawBytes: { passed: true, details: '' },
    vectorC_flateStreams: { passed: true, details: '' },
    vectorD_metadata: { passed: true, details: '' },
    vectorE_xmpPacket: { passed: true, details: '' },
    vectorF_annotations: { passed: true, details: '' },
    vectorG_acroForm: { passed: true, details: '' },
    vectorH_embeddedFiles: { passed: true, details: '' },
    vectorI_javascript: { passed: true, details: '' },
    vectorJ_incrementalRevisions: { passed: true, details: '' },
  };

  if (!fs.existsSync(filePath)) {
    throw new Error(`Target file does not exist: ${filePath}`);
  }

  const rawBytes = fs.readFileSync(filePath);
  const fileSizeBytes = rawBytes.length;
  const rawString = rawBytes.toString('binary');

  // Vector J: Header & Incremental Revision Inspection
  const hasValidHeader = rawString.startsWith('%PDF-');
  if (!hasValidHeader) {
    failureReasons.push('Invalid PDF header: Missing %PDF- prefix');
    vectorAudit.vectorJ_incrementalRevisions.passed = false;
  }
  const eofMatches = rawString.match(/%%EOF/g) || [];
  const incrementalRevisionCount = eofMatches.length;
  const hasValidEof = incrementalRevisionCount >= 1;
  if (!hasValidEof) {
    failureReasons.push('Missing %%EOF trailer marker');
    vectorAudit.vectorJ_incrementalRevisions.passed = false;
  }
  if (incrementalRevisionCount > 1) {
    if (options?.requireSingleRevision) {
      failureReasons.push(`Incremental revision leak: Found ${incrementalRevisionCount} %%EOF markers (must be 1 for sanitized export)`);
      vectorAudit.vectorJ_incrementalRevisions.passed = false;
    }
  }
  vectorAudit.vectorJ_incrementalRevisions.details = `Revisions: ${incrementalRevisionCount}, Header: ${hasValidHeader ? 'Valid' : 'Invalid'}`;

  // Vector C: Binary Decompression & Deep Stream Inspection
  let streamDecompressionErrors = 0;
  const decompressedStreamChunks = [];

  const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
  let match;
  while ((match = streamRegex.exec(rawString)) !== null) {
    const streamContent = Buffer.from(match[1], 'binary');
    try {
      const decompressed = zlib.inflateSync(streamContent);
      decompressedStreamChunks.push(decompressed.toString('utf-8'));
    } catch (e) {
      try {
        const decompressedRaw = zlib.inflateRawSync(streamContent);
        decompressedStreamChunks.push(decompressedRaw.toString('utf-8'));
      } catch (err) {
        decompressedStreamChunks.push(match[1]);
        streamDecompressionErrors++;
      }
    }
  }

  const flateCorpus = decompressedStreamChunks.join('\n---\n');
  const combinedSearchCorpus = [rawString, flateCorpus].join('\n---\n');

  // Canaries to inspect
  const canariesToCheck = [
    PHASE72_CANARY,
    'CONFIDENTIAL_CANARY_PHASE7_1_SECRET_99X',
    'CONFIDENTIAL_CANARY_PHASE7_SECRET_77Z',
    'SUPER_SECRET_FORM_VALUE_6C',
    'SUPER_SECRET',
    'TOP_SECRET_RED_TEAM',
    ...(options?.forbiddenCanaries || []),
  ];

  // Vector B: Raw Byte Search
  for (const canary of canariesToCheck) {
    if (rawString.includes(canary)) {
      canaryLeakDetections.push(`[RawBytes] ${canary}`);
      failureReasons.push(`Vector B Leak: Canary "${canary}" discovered in raw PDF bytes!`);
      vectorAudit.vectorB_rawBytes.passed = false;
    }
  }
  vectorAudit.vectorB_rawBytes.details = vectorAudit.vectorB_rawBytes.passed
    ? '0 canaries in raw bytes'
    : 'Canary detected in raw bytes';

  // Vector C: Flate Stream Inspection
  for (const canary of canariesToCheck) {
    if (flateCorpus.includes(canary)) {
      canaryLeakDetections.push(`[FlateStream] ${canary}`);
      failureReasons.push(`Vector C Leak: Canary "${canary}" discovered in decompressed Flate streams!`);
      vectorAudit.vectorC_flateStreams.passed = false;
    }
  }
  vectorAudit.vectorC_flateStreams.details = vectorAudit.vectorC_flateStreams.passed
    ? `${decompressedStreamChunks.length} streams inspected, 0 canaries`
    : 'Canary detected in decompressed stream';

  // Vector D & E: Metadata & XMP Inspection
  const hasInfoMetadata = /\/Title|\/Author|\/Subject|\/Keywords|\/Creator|\/Producer/i.test(rawString);
  const hasXmpMetadata = /<x:xmpmeta|http:\/\/ns\.adobe\.com\/xap/i.test(combinedSearchCorpus);

  for (const canary of canariesToCheck) {
    if (/Title|Author|Subject|Keywords/i.test(rawString) && rawString.includes(canary)) {
      canaryLeakDetections.push(`[Metadata] ${canary}`);
      failureReasons.push(`Vector D Leak: Canary "${canary}" discovered in document Info metadata dictionary!`);
      vectorAudit.vectorD_metadata.passed = false;
    }
    if (hasXmpMetadata && combinedSearchCorpus.includes(canary)) {
      canaryLeakDetections.push(`[XMP] ${canary}`);
      failureReasons.push(`Vector E Leak: Canary "${canary}" discovered in XMP packet!`);
      vectorAudit.vectorE_xmpPacket.passed = false;
    }
  }

  if (options?.requireSanitizedMetadata) {
    if (hasXmpMetadata) {
      failureReasons.push('Vector E Failure: Raw XMP packet retained in exported PDF');
      vectorAudit.vectorE_xmpPacket.passed = false;
    }
  }
  vectorAudit.vectorD_metadata.details = vectorAudit.vectorD_metadata.passed ? 'Info metadata clean' : 'Metadata leak';
  vectorAudit.vectorE_xmpPacket.details = hasXmpMetadata ? 'XMP packet present' : 'XMP purged';

  // Vector H & I: Embedded Files & JavaScript
  const hasEmbeddedFiles = /\/EmbeddedFiles|\/EF\b|\/Type\s*\/Filespec/i.test(combinedSearchCorpus);
  const hasJavaScript = /\/JavaScript|\/JS\b/i.test(combinedSearchCorpus);

  if (options?.requireSanitizedMetadata) {
    if (hasEmbeddedFiles) {
      failureReasons.push('Vector H Failure: Embedded files / attachments retained');
      vectorAudit.vectorH_embeddedFiles.passed = false;
    }
    if (hasJavaScript) {
      failureReasons.push('Vector I Failure: JavaScript action dictionary retained');
      vectorAudit.vectorI_javascript.passed = false;
    }
  }
  vectorAudit.vectorH_embeddedFiles.details = hasEmbeddedFiles ? 'Embedded files present' : 'No embedded files';
  vectorAudit.vectorI_javascript.details = hasJavaScript ? 'JavaScript dictionary present' : 'No active JS';

  // Vector F & G: pdf-lib Inspection for AcroForms, Widgets & Annotations
  const pdfDoc = await PDFDocument.load(rawBytes, { ignoreEncryption: true });
  const pageCount = pdfDoc.getPageCount();
  const pageRotations = [];
  const pageDimensions = [];

  for (let i = 0; i < pageCount; i++) {
    const page = pdfDoc.getPage(i);
    pageRotations.push(page.getRotation().angle);
    pageDimensions.push({ width: page.getWidth(), height: page.getHeight() });
  }

  if (options?.expectedPageCount !== undefined && pageCount !== options.expectedPageCount) {
    failureReasons.push(`Page count mismatch: Expected ${options.expectedPageCount}, found ${pageCount}`);
  }

  if (options?.expectedRotations) {
    for (let i = 0; i < options.expectedRotations.length; i++) {
      if (pageRotations[i] !== options.expectedRotations[i]) {
        failureReasons.push(`Page ${i + 1} rotation mismatch: Expected ${options.expectedRotations[i]}°, found ${pageRotations[i]}°`);
      }
    }
  }

  // Vector G: Check /AcroForm Catalog
  const catalog = pdfDoc.catalog;
  const hasAcroFormCatalog = catalog.has(PDFName.of('AcroForm'));
  let acroFormFieldCount = 0;
  let widgetAnnotationCount = 0;
  const discoveredFieldNames = [];
  const fieldValues = {};

  if (hasAcroFormCatalog) {
    try {
      const form = pdfDoc.getForm();
      const fields = form.getFields();
      acroFormFieldCount = fields.length;
      for (const f of fields) {
        const name = f.getName();
        discoveredFieldNames.push(name);
        try {
          const val = f.getText ? f.getText() : f.isChecked ? f.isChecked() : f.getSelected ? f.getSelected() : '';
          fieldValues[name] = val;
        } catch (e) {
          fieldValues[name] = '[unreadable]';
        }
      }
    } catch (e) {
      failureReasons.push(`Vector G AcroForm parsing error: ${String(e)}`);
      vectorAudit.vectorG_acroForm.passed = false;
    }
  }

  // Vector F: Count /Widget and other annotations across all pages
  let totalAnnotationCount = 0;
  for (let i = 0; i < pageCount; i++) {
    const p = pdfDoc.getPage(i);
    const annots = p.node.Annots();
    if (annots) {
      totalAnnotationCount += annots.size();
      for (let j = 0; j < annots.size(); j++) {
        const ref = annots.get(j);
        const dict = pdfDoc.context.lookup(ref);
        if (dict && dict.get) {
          const subtype = dict.get(PDFName.of('Subtype'))?.toString();
          if (subtype === '/Widget') {
            widgetAnnotationCount++;
          }
        }
      }
    }
  }

  if (options?.mustNotHaveAcroForm && hasAcroFormCatalog) {
    failureReasons.push('Vector G Failure: /AcroForm catalog still exists in flattened document');
    vectorAudit.vectorG_acroForm.passed = false;
  }
  if (options?.mustNotHaveAcroForm && widgetAnnotationCount > 0) {
    failureReasons.push(`Vector F Failure: ${widgetAnnotationCount} /Widget annotations still exist in flattened document`);
    vectorAudit.vectorF_annotations.passed = false;
  }
  if (options?.mustHaveAcroForm && !hasAcroFormCatalog) {
    failureReasons.push('Vector G Failure: Missing /AcroForm catalog in interactive document');
    vectorAudit.vectorG_acroForm.passed = false;
  }
  if (options?.expectedWidgetCount !== undefined && widgetAnnotationCount !== options.expectedWidgetCount) {
    failureReasons.push(`Widget annotation count mismatch: Expected ${options.expectedWidgetCount}, found ${widgetAnnotationCount}`);
  }
  if (options?.expectedFieldValues) {
    for (const [key, expectedVal] of Object.entries(options.expectedFieldValues)) {
      if (fieldValues[key] !== expectedVal) {
        failureReasons.push(`Field value mismatch for "${key}": Expected "${expectedVal}", found "${fieldValues[key]}"`);
      }
    }
  }

  vectorAudit.vectorF_annotations.details = `Annotations: ${totalAnnotationCount}, Widgets: ${widgetAnnotationCount}`;
  vectorAudit.vectorG_acroForm.details = hasAcroFormCatalog
    ? `AcroForm present, Fields: ${acroFormFieldCount}`
    : 'No AcroForm catalog';

  // Vector A: Independent PDF.js Text & Structure Extraction
  const extractedTextByPage = [];
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(rawBytes),
      isEvalSupported: false,
      useSystemFonts: true,
    });
    const pdfJsDoc = await loadingTask.promise;

    for (let pageNum = 1; pageNum <= pdfJsDoc.numPages; pageNum++) {
      const page = await pdfJsDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(' ');
      extractedTextByPage.push(pageText);

      // Verify text layer for forbidden canaries
      for (const canary of canariesToCheck) {
        if (pageText.includes(canary)) {
          if (!canaryLeakDetections.includes(canary)) canaryLeakDetections.push(`[PDF.js Text] ${canary}`);
          failureReasons.push(`Vector A Leak: Canary "${canary}" discovered on page ${pageNum} via PDF.js!`);
          vectorAudit.vectorA_pdfjsText.passed = false;
        }
      }
    }
  } catch (err) {
    failureReasons.push(`Vector A Error: PDF.js loading error: ${String(err)}`);
    vectorAudit.vectorA_pdfjsText.passed = false;
  }
  vectorAudit.vectorA_pdfjsText.details = vectorAudit.vectorA_pdfjsText.passed
    ? `Extracted ${extractedTextByPage.length} pages, 0 canaries`
    : 'Canary detected in PDF.js TextLayer';

  const passedForensicGates = failureReasons.length === 0 && canaryLeakDetections.length === 0;

  return {
    file: path.basename(filePath),
    fileSizeBytes,
    hasValidHeader,
    hasValidEof,
    incrementalRevisionCount,
    pageCount,
    pageRotations,
    pageDimensions,
    hasAcroFormCatalog,
    acroFormFieldCount,
    widgetAnnotationCount,
    discoveredFieldNames,
    fieldValues,
    hasInfoMetadata,
    hasXmpMetadata,
    hasEmbeddedFiles,
    hasJavaScript,
    canaryLeakDetections,
    extractedTextByPage,
    streamDecompressionErrors,
    vectorAudit,
    passedForensicGates,
    failureReasons,
  };
}

if (process.argv[1] && process.argv[1].endsWith('phase7-2-independent-verifier.js')) {
  const target = process.argv[2];
  if (!target) {
    console.log('Usage: node scripts/phase7-2-independent-verifier.js <path-to-pdf>');
    process.exit(0);
  }

  verifyPdfForensics(target)
    .then((result) => {
      console.log('=== Independent Forensic Verifier Output ===');
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.passedForensicGates ? 0 : 1);
    })
    .catch((err) => {
      console.error('Fatal error during forensic audit:', err);
      process.exit(1);
    });
}
