import fs from 'fs';
import zlib from 'zlib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFRawStream } from 'pdf-lib';

/**
 * Independent Binary Stream Scanner
 * 
 * Extracts all stream objects from raw PDF bytes, attempts Flate inflation,
 * and scans both uncompressed bytes and decompressed stream bodies.
 */
export function extractAndScanStreams(pdfBytes, canaries) {
  const leaks = [];
  const canaryHits = new Map();
  for (const c of canaries) {
    canaryHits.set(c, {
      raw: false,
      decompressed: false,
      locations: [],
    });
  }

  const rawBuffer = Buffer.from(pdfBytes);
  const rawAscii = rawBuffer.toString('latin1');
  const rawUtf8 = rawBuffer.toString('utf8');

  // 1. Raw byte scan
  for (const c of canaries) {
    if (rawAscii.includes(c) || rawUtf8.includes(c)) {
      canaryHits.get(c).raw = true;
      canaryHits.get(c).locations.push('Raw Uncompressed PDF Stream / Header / Dictionary');
      leaks.push(`Canary "${c}" found in raw uncompressed PDF bytes!`);
    }
    // Check hex-encoded canary: e.g. <534543524554...>
    const hexRep = Buffer.from(c, 'utf8').toString('hex');
    if (rawAscii.toLowerCase().includes(hexRep.toLowerCase())) {
      canaryHits.get(c).raw = true;
      canaryHits.get(c).locations.push('Hex-encoded string literal <...>');
      leaks.push(`Canary "${c}" found as hex-encoded string in PDF bytes!`);
    }
  }

  // 2. Binary stream extraction & Flate decompression
  // Find all `stream\r?\n` ... `\r?\nendstream` blocks
  const streamHeaderRegex = /stream[\r\n]+/g;
  let match;
  let streamIndex = 0;

  while ((match = streamHeaderRegex.exec(rawAscii)) !== null) {
    streamIndex++;
    const streamStart = match.index + match[0].length;
    const endstreamPos = rawAscii.indexOf('endstream', streamStart);
    if (endstreamPos === -1) continue;

    // Isolate stream payload bytes
    let streamPayload = rawBuffer.subarray(streamStart, endstreamPos);
    // Trim trailing CRLF if present
    if (streamPayload.length >= 2 && streamPayload[streamPayload.length - 2] === 0x0D && streamPayload[streamPayload.length - 1] === 0x0A) {
      streamPayload = streamPayload.subarray(0, streamPayload.length - 2);
    } else if (streamPayload.length >= 1 && (streamPayload[streamPayload.length - 1] === 0x0A || streamPayload[streamPayload.length - 1] === 0x0D)) {
      streamPayload = streamPayload.subarray(0, streamPayload.length - 1);
    }

    let decompressed = null;
    try {
      decompressed = zlib.inflateSync(streamPayload);
    } catch (e1) {
      try {
        decompressed = zlib.inflateRawSync(streamPayload);
      } catch (e2) {
        // Not a valid Flate stream (e.g. uncompressed or image stream)
      }
    }

    if (decompressed) {
      const decompStr = decompressed.toString('latin1');
      const decompUtf8 = decompressed.toString('utf8');
      for (const c of canaries) {
        if (decompStr.includes(c) || decompUtf8.includes(c)) {
          canaryHits.get(c).decompressed = true;
          canaryHits.get(c).locations.push(`Decompressed Flate Stream #${streamIndex}`);
          leaks.push(`Canary "${c}" found inside decompressed Flate stream #${streamIndex}!`);
        }
      }
    }
  }

  return {
    canaryHits,
    leaks,
    totalStreamsScanned: streamIndex,
  };
}

/**
 * Independent PDF.js Text & Annotation Forensic Scanner
 */
export async function scanPdfJsForensics(pdfBytes, canaries) {
  const leaks = [];
  const textHits = new Map();
  const annotHits = new Map();

  for (const c of canaries) {
    textHits.set(c, false);
    annotHits.set(c, false);
  }

  let doc = null;
  try {
    const uint8 = new Uint8Array(pdfBytes.buffer, pdfBytes.byteOffset, pdfBytes.byteLength);
    const loadingTask = pdfjsLib.getDocument({
      data: uint8.slice(0),
      useSystemFonts: true,
      stopAtErrors: false,
    });
    doc = await loadingTask.promise;

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const extractedText = textContent.items.map((i) => i.str || '').join(' ');

      for (const c of canaries) {
        if (extractedText.includes(c)) {
          textHits.set(c, true);
          leaks.push(`PDF.js extracted text leak on page ${pageNum}: contains "${c}"`);
        }
      }

      const annots = await page.getAnnotations();
      for (const a of annots) {
        const annotStr = JSON.stringify(a);
        for (const c of canaries) {
          if (annotStr.includes(c)) {
            annotHits.set(c, true);
            leaks.push(`PDF.js annotation leak on page ${pageNum}: annotation contains "${c}"`);
          }
        }
      }
    }
  } catch (err) {
    leaks.push(`PDF.js parsing error: ${err.message}`);
  } finally {
    if (doc) {
      try { await doc.destroy(); } catch (e) {}
    }
  }

  return {
    textHits,
    annotHits,
    leaks,
  };
}

/**
 * Independent PDF-lib Structural Inspection
 */
export async function inspectPdfLibStructure(pdfBytes, options = {}) {
  const issues = [];
  let doc = null;
  try {
    doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  } catch (e) {
    return {
      success: false,
      error: `PDF-lib failed to load PDF: ${e.message}`,
      issues: [`Malformed PDF structure: ${e.message}`],
    };
  }

  const pageCount = doc.getPageCount();
  const pageGeometries = [];

  for (let i = 0; i < pageCount; i++) {
    const p = doc.getPage(i);
    const rotation = p.getRotation().angle;
    const mediaBox = p.getMediaBox();
    const width = p.getWidth();
    const height = p.getHeight();

    // Check annotations on page
    const annotsRef = p.node.get(PDFName.of('Annots'));
    let hasAnnots = false;
    let annotCount = 0;
    if (annotsRef) {
      const annotsArray = doc.context.lookup(annotsRef);
      if (annotsArray && typeof annotsArray.size === 'function') {
        annotCount = annotsArray.size();
        hasAnnots = annotCount > 0;
      }
    }

    // Check resources on page
    const resRef = p.node.get(PDFName.of('Resources'));
    let xObjects = [];
    if (resRef) {
      const res = doc.context.lookup(resRef);
      if (res instanceof PDFDict && res.has(PDFName.of('XObject'))) {
        const xobjDict = doc.context.lookup(res.get(PDFName.of('XObject')));
        if (xobjDict instanceof PDFDict) {
          xObjects = xobjDict.entries().map(([k]) => k.asString());
        }
      }
    }

    pageGeometries.push({
      pageIndex: i,
      pageNumber: i + 1,
      width,
      height,
      rotation,
      mediaBox: [mediaBox.x, mediaBox.y, mediaBox.width, mediaBox.height],
      hasAnnots,
      xObjects,
    });
  }

  // Check catalog level metadata & dictionary sanitization
  const catalog = doc.catalog;
  let metadataPresent = false;
  let namesPresent = false;
  let acroFormPresent = false;

  if (catalog.has(PDFName.of('Metadata'))) metadataPresent = true;
  if (catalog.has(PDFName.of('Names'))) namesPresent = true;
  if (catalog.has(PDFName.of('AcroForm'))) acroFormPresent = true;

  // Check /Info trailer
  const infoRef = doc.context.trailerInfo?.Info;
  let infoEntries = [];
  if (infoRef) {
    const infoDict = doc.context.lookup(infoRef);
    if (infoDict instanceof PDFDict) {
      infoEntries = infoDict.entries().map(([k]) => k.asString());
    }
  }

  return {
    success: true,
    pageCount,
    pageGeometries,
    metadataPresent,
    namesPresent,
    acroFormPresent,
    infoEntries,
    issues,
  };
}

/**
 * Comprehensive Independent Forensic Examination
 */
export async function runFullForensicAudit(pdfBytes, canaries, options = {}) {
  const streamResults = extractAndScanStreams(pdfBytes, canaries);
  const pdfJsResults = await scanPdfJsForensics(pdfBytes, canaries);
  const pdfLibResults = await inspectPdfLibStructure(pdfBytes, options);

  const allLeaks = [
    ...streamResults.leaks,
    ...pdfJsResults.leaks,
    ...pdfLibResults.issues,
  ];

  // Consolidate canary status
  const canaryReports = canaries.map((c) => {
    const streamHit = streamResults.canaryHits.get(c);
    const textHit = pdfJsResults.textHits.get(c);
    const annotHit = pdfJsResults.annotHits.get(c);
    const leaked = streamHit.raw || streamHit.decompressed || textHit || annotHit;

    return {
      canary: c,
      leaked,
      rawBytes: streamHit.raw,
      decompressedStream: streamHit.decompressed,
      pdfJsText: textHit,
      pdfJsAnnot: annotHit,
      locations: streamHit.locations,
    };
  });

  const totalCanariesLeaked = canaryReports.filter((r) => r.leaked).length;

  return {
    passed: totalCanariesLeaked === 0 && allLeaks.length === 0,
    totalCanariesTested: canaries.length,
    totalCanariesLeaked,
    canaryReports,
    streamResults,
    pdfJsResults,
    pdfLibResults,
    allLeaks,
  };
}
