import * as pdfjsLib from 'pdfjs-dist';
import type { RedactionEditorObject } from './editorState';

export interface ValidationDetails {
  pagesScanned: number;
  redactionsChecked: number;
  textLayerClean: boolean;
  rawBinaryClean: boolean;
  metadataClean: boolean;
  annotationsClean: boolean;
}

export interface ValidationResult {
  passed: boolean;
  leaks: string[];
  details: ValidationDetails;
}

export interface ValidatorOptions {
  expectedPageCount?: number;
  expectedAuthor?: string;
  expectedTitle?: string;
  checkMetadataPurge?: boolean;
}

/**
 * Pre-Download Forensic Validator
 * 
 * Inspects the final exported PDF bytes before browser download or storage.
 * Performs deep multi-layer forensic inspection:
 * 1. PDF.js text layer scan across all redacted pages
 * 2. Uncompressed raw binary stream search for residual tokens
 * 3. Annotation and widget dictionary absence on redacted pages
 * 4. Metadata and XMP stream purge verification
 */
export async function validateRedactedPdf(
  exportedBytes: Uint8Array,
  redactions: RedactionEditorObject[],
  options: ValidatorOptions = {}
): Promise<ValidationResult> {
  const leaks: string[] = [];
  const details: ValidationDetails = {
    pagesScanned: 0,
    redactionsChecked: redactions.length,
    textLayerClean: true,
    rawBinaryClean: true,
    metadataClean: true,
    annotationsClean: true,
  };

  // 1. PDF.js Text Layer Inspection
  let jsDoc: pdfjsLib.PDFDocumentProxy | null = null;
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: exportedBytes.slice(0),
      useSystemFonts: true,
    });
    jsDoc = await loadingTask.promise;
    details.pagesScanned = jsDoc.numPages;

    if (options.expectedPageCount !== undefined && jsDoc.numPages !== options.expectedPageCount) {
      leaks.push(
        `Integrity error: Page count mismatch. Expected ${options.expectedPageCount}, but exported document has ${jsDoc.numPages}.`
      );
    }

    // Map redactions by page number
    const pageRedactionsMap = new Map<number, RedactionEditorObject[]>();
    for (const r of redactions) {
      const list = pageRedactionsMap.get(r.pageNumber) || [];
      list.push(r);
      pageRedactionsMap.set(r.pageNumber, list);
    }

    for (const [pageNum, reds] of pageRedactionsMap.entries()) {
      if (pageNum < 1 || pageNum > jsDoc.numPages) continue;

      const page = await jsDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => (item.str || ''))
        .join(' ')
        .toLowerCase();

      for (const red of reds) {
        if (!red.originalText || red.originalText.trim().length === 0) continue;
        const target = red.originalText.trim().toLowerCase();

        if (pageText.includes(target)) {
          details.textLayerClean = false;
          leaks.push(
            `Security failure on page ${pageNum}: Original redacted text "${red.originalText}" remains recoverable in PDF text layer!`
          );
        }
      }

      // Check annotations on redacted page: rasterized page should have 0 native annotations
      const annots = await page.getAnnotations();
      if (annots && annots.length > 0) {
        // Redacted pages synthesized as clean images should not retain original page annotations
        details.annotationsClean = false;
        leaks.push(
          `Security warning on page ${pageNum}: Redacted page contains ${annots.length} native annotation object(s).`
        );
      }
    }
  } catch (err: any) {
    leaks.push(`Validator failed to parse exported PDF structure: ${err.message}`);
  } finally {
    if (jsDoc) {
      try {
        await jsDoc.destroy();
      } catch (e) {}
    }
  }

  // 2. Raw Binary String & Token Scanner
  let rawAscii = '';
  let rawUtf8 = '';
  try {
    rawAscii = new TextDecoder('latin1').decode(exportedBytes);
    rawUtf8 = new TextDecoder('utf-8', { fatal: false }).decode(exportedBytes);
  } catch (e) {
    // Fallback manual ASCII conversion
    for (let i = 0; i < Math.min(exportedBytes.length, 5_000_000); i++) {
      rawAscii += String.fromCharCode(exportedBytes[i]);
    }
  }

  for (const red of redactions) {
    if (!red.originalText || red.originalText.trim().length < 3) continue;
    const target = red.originalText.trim();
    if (rawAscii.includes(target) || (rawUtf8 && rawUtf8.includes(target))) {
      details.rawBinaryClean = false;
      leaks.push(
        `Forensic failure: Plaintext token "${target}" detected in raw uncompressed PDF byte stream!`
      );
    }
  }

  // 3. Metadata Purge Scanner
  if (options.checkMetadataPurge) {
    if (rawAscii.includes('<x:xmpmeta') || rawUtf8.includes('<x:xmpmeta')) {
      details.metadataClean = false;
      leaks.push('Sanitization failure: Residual XMP metadata stream (<x:xmpmeta>) found in exported document.');
    }
    if (options.expectedAuthor && (rawAscii.includes(options.expectedAuthor) || rawUtf8.includes(options.expectedAuthor))) {
      details.metadataClean = false;
      leaks.push(
        `Sanitization failure: Author string "${options.expectedAuthor}" detected in document metadata.`
      );
    }
    if (options.expectedTitle && (rawAscii.includes(options.expectedTitle) || rawUtf8.includes(options.expectedTitle))) {
      details.metadataClean = false;
      leaks.push(
        `Sanitization failure: Title string "${options.expectedTitle}" detected in document metadata.`
      );
    }
  }

  return {
    passed: leaks.length === 0,
    leaks,
    details,
  };
}

/**
 * Enforces fail-closed security. Throws an explicit error if validation fails.
 */
export function assertRedactionClean(result: ValidationResult): void {
  if (!result.passed) {
    const message = `REDACTION SECURITY ABORT: Export blocked due to forensic validation failure(s):\n${result.leaks.join('\n')}`;
    console.error(message);
    throw new Error(message);
  }
}
