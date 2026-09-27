/**
 * Phase 7 Independent PDF Forensic Verifier
 * 
 * STRICT INDEPENDENCE RULE:
 * This script does NOT import or rely on any production validation helpers
 * (e.g. redactionValidator.ts, pdfSanitizer.ts, pdfExportEngine.ts).
 * It uses raw binary stream inspection, PDF.js, and pdf-lib directly to
 * independently audit exported PDF files against forensic criteria.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { PDFDocument, PDFName } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

export async function verifyPdfForensics(filePath, options = {}) {
  const failureReasons = [];
  const canaryLeakDetections = [];

  if (!fs.existsSync(filePath)) {
    throw new Error(`Target file does not exist: ${filePath}`);
  }

  const rawBytes = fs.readFileSync(filePath);
  const fileSizeBytes = rawBytes.length;
  const rawString = rawBytes.toString('binary');

  // 1. Raw PDF Header & Trailer Checks
  const hasValidHeader = rawString.startsWith('%PDF-');
  if (!hasValidHeader) {
    failureReasons.push('Invalid PDF header: Missing %PDF- prefix');
  }

  // Count %%EOF occurrences to detect incremental updates / revisions
  const eofMatches = rawString.match(/%%EOF/g) || [];
  const incrementalRevisionCount = eofMatches.length;
  const hasValidEof = incrementalRevisionCount >= 1;
  if (!hasValidEof) {
    failureReasons.push('Missing %%EOF trailer marker');
  }

  // 2. Binary Decompression & Deep Stream Inspection
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
      }
    }
  }

  const combinedSearchCorpus = [
    rawString,
    ...decompressedStreamChunks,
  ].join('\n---\n');

  // 3. Canary Leak Detection
  const canariesToCheck = [
    'PHASE7_TEXT_SECRET_91X',
    'PHASE7_FORM_SECRET_42Q',
    'PHASE7_METADATA_SECRET_77M',
    'PHASE7_ATTACHMENT_SECRET_33A',
    'PHASE7_ANNOTATION_SECRET_18P',
    'SUPER_SECRET',
    'TOP_SECRET_RED_TEAM',
    ...(options?.forbiddenCanaries || []),
  ];

  for (const canary of canariesToCheck) {
    if (combinedSearchCorpus.includes(canary)) {
      canaryLeakDetections.push(canary);
      failureReasons.push(`CRITICAL FORENSIC LEAK: Canary "${canary}" discovered in PDF byte corpus!`);
    }
  }

  // 4. Metadata & Active Content Detection
  const hasInfoMetadata = /\/Title|\/Author|\/Subject|\/Keywords|\/Creator|\/Producer/i.test(rawString);
  const hasXmpMetadata = /<x:xmpmeta|http:\/\/ns\.adobe\.com\/xap/i.test(combinedSearchCorpus);
  const hasEmbeddedFiles = /\/EmbeddedFiles|\/EF\b|\/Type\s*\/Filespec/i.test(combinedSearchCorpus);
  const hasJavaScript = /\/JavaScript|\/JS\b/i.test(combinedSearchCorpus);
  const hasSignatures = /\/Type\s*\/Sig|\/ByteRange/i.test(combinedSearchCorpus);

  if (options?.requireSanitizedMetadata) {
    if (hasXmpMetadata) {
      failureReasons.push('Metadata Sanitization Failure: Raw XMP packet retained in exported PDF');
    }
    if (hasEmbeddedFiles) {
      failureReasons.push('Metadata Sanitization Failure: Embedded files / attachments retained');
    }
    if (hasJavaScript) {
      failureReasons.push('Active Content Failure: JavaScript action dictionary retained');
    }
  }

  // 5. Independent pdf-lib Inspection
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

  // Check /AcroForm Catalog
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
      failureReasons.push(`AcroForm parsing error: ${String(e)}`);
    }
  }

  // Count /Widget annotations across all pages
  for (let i = 0; i < pageCount; i++) {
    const p = pdfDoc.getPage(i);
    const annots = p.node.Annots();
    if (annots) {
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
    failureReasons.push('Form Flattening Failure: /AcroForm catalog still exists in exported document');
  }
  if (options?.mustNotHaveAcroForm && widgetAnnotationCount > 0) {
    failureReasons.push(`Form Flattening Failure: ${widgetAnnotationCount} /Widget annotations still exist`);
  }
  if (options?.mustHaveAcroForm && !hasAcroFormCatalog) {
    failureReasons.push('Interactive Form Failure: Missing /AcroForm catalog in exported document');
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

  // 6. Independent PDF.js Text & Structure Extraction
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
          if (!canaryLeakDetections.includes(canary)) canaryLeakDetections.push(canary);
          failureReasons.push(`PDF.js TextLayer Leak: Canary "${canary}" discovered on page ${pageNum}!`);
        }
      }
    }
  } catch (err) {
    failureReasons.push(`PDF.js Loading/Text extraction error: ${String(err)}`);
  }

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
    hasSignatures,
    canaryLeakDetections,
    extractedTextByPage,
    streamDecompressionErrors,
    passedForensicGates,
    failureReasons,
  };
}

// CLI Execution Entry Point
if (process.argv[1] && process.argv[1].endsWith('phase7-independent-verifier.js')) {
  const target = process.argv[2];
  if (!target) {
    console.log('Usage: node scripts/phase7-independent-verifier.js <path-to-pdf>');
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
