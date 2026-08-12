import { PDFDocument } from 'pdf-lib';

export interface PdfLoadResult {
  pdfDoc: PDFDocument;
  pageCount: number;
}

export interface IndividualPagesParseResult {
  validPages: number[];
  error: string | null;
}

/**
 * Loads a PDF file client-side using pdf-lib and returns the document instance and total page count.
 */
export async function loadPdfDocument(file: File): Promise<PdfLoadResult> {
  if (!file || file.type !== 'application/pdf') {
    throw new Error('Please select a valid PDF document (.pdf).');
  }

  const arrayBuffer = await file.arrayBuffer();
  
  if (arrayBuffer.byteLength === 0) {
    throw new Error('The selected PDF file is empty (0 bytes).');
  }

  try {
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const pageCount = pdfDoc.getPageCount();

    if (pageCount === 0) {
      throw new Error('The selected PDF document contains zero pages.');
    }

    return { pdfDoc, pageCount };
  } catch (err: any) {
    if (err.message && err.message.includes('encrypted')) {
      throw new Error('This PDF is password-protected or encrypted.');
    }
    throw new Error('Failed to parse PDF document. The file may be corrupted.');
  }
}

/**
 * Strips .pdf extension and generates default output filename string (without extension).
 */
export function getDefaultOutputFilename(originalName: string): string {
  const baseName = originalName.replace(/\.pdf$/i, '').trim() || 'extracted-document';
  return `${baseName} - Extracted`;
}

/**
 * Safely sanitizes user-provided output filename, strips duplicate .pdf, and appends .pdf extension.
 */
export function sanitizeOutputFilename(inputName: string, fallbackOriginalName: string = 'document.pdf'): string {
  let cleaned = (inputName || '').trim();

  if (!cleaned) {
    cleaned = getDefaultOutputFilename(fallbackOriginalName);
  }

  cleaned = cleaned.replace(/\.pdf$/i, '').trim();
  cleaned = cleaned.replace(/[\/\\:*?"<>|]/g, '');
  cleaned = cleaned.replace(/^[\s.]+|[\s.]+$/g, '');

  if (cleaned.length > 150) {
    cleaned = cleaned.substring(0, 150).trim();
  }

  if (!cleaned) {
    cleaned = 'extracted-document';
  }

  return `${cleaned}.pdf`;
}

/**
 * Parses comma-separated individual pages and range tokens (e.g., "1, 3, 7-10, 15").
 * Deduplicates, sorts in ascending order, and validates against total PDF pages.
 */
export function parseIndividualPages(input: string, totalPages: number): IndividualPagesParseResult {
  const trimmed = (input || '').trim();
  if (!trimmed) {
    return { validPages: [], error: 'Please enter page numbers (e.g. 1, 3, 7-10)' };
  }

  const tokens = trimmed.split(',').map(t => t.trim()).filter(Boolean);
  if (tokens.length === 0) {
    return { validPages: [], error: 'Please enter valid page numbers.' };
  }

  const pageSet = new Set<number>();

  for (const token of tokens) {
    // Check if token contains a range hyphen (e.g., "7-10")
    if (token.includes('-')) {
      // Handle negative signs or malformed multiple hyphens
      const parts = token.split('-');
      if (parts.length !== 2 || parts[0].trim() === '' || parts[1].trim() === '') {
        return { validPages: [], error: `Invalid range format "${token}".` };
      }

      const startRaw = parts[0].trim();
      const endRaw = parts[1].trim();

      // Check decimal values
      if (!/^\d+$/.test(startRaw) || !/^\d+$/.test(endRaw)) {
        return { validPages: [], error: `Invalid page numbers in range "${token}". Use positive whole numbers.` };
      }

      const startVal = parseInt(startRaw, 10);
      const endVal = parseInt(endRaw, 10);

      if (startVal < 1) {
        return { validPages: [], error: `Page numbers must be at least 1 (got "${startVal}").` };
      }
      if (endVal > totalPages) {
        return { validPages: [], error: `Page ${endVal} exceeds total PDF length (${totalPages} max).` };
      }
      if (startVal > endVal) {
        return { validPages: [], error: `Invalid range "${token}": start page cannot exceed end page.` };
      }

      for (let p = startVal; p <= endVal; p++) {
        pageSet.add(p);
      }
    } else {
      // Single page number
      if (!/^\d+$/.test(token)) {
        return { validPages: [], error: `Invalid page number "${token}". Use positive whole numbers.` };
      }

      const val = parseInt(token, 10);

      if (val < 1) {
        return { validPages: [], error: `Page numbers must be at least 1 (got "${val}").` };
      }
      if (val > totalPages) {
        return { validPages: [], error: `Page ${val} exceeds total PDF length (${totalPages} max).` };
      }

      pageSet.add(val);
    }
  }

  const validPages = Array.from(pageSet).sort((a, b) => a - b);

  if (validPages.length === 0) {
    return { validPages: [], error: 'No valid pages selected.' };
  }

  return { validPages, error: null };
}

/**
 * Extracts specific 1-based page numbers from an existing PDFDocument and triggers a client-side download.
 */
export async function extractAndDownloadPdfPages(
  srcPdfDoc: PDFDocument,
  pageNumbers: number[],
  outputFilenameInput: string,
  originalFilename: string
): Promise<void> {
  const totalPages = srcPdfDoc.getPageCount();

  if (!pageNumbers || pageNumbers.length === 0) {
    throw new Error('No pages selected for extraction.');
  }

  for (const pageNum of pageNumbers) {
    if (pageNum < 1 || pageNum > totalPages) {
      throw new Error(`Page ${pageNum} is out of bounds (1 to ${totalPages}).`);
    }
  }

  // Create new PDF document
  const extractedPdf = await PDFDocument.create();

  // Convert 1-based page numbers to 0-indexed page indices
  const pageIndices: number[] = pageNumbers.map(p => p - 1);

  // Copy requested pages from source PDF to target PDF
  const copiedPages = await extractedPdf.copyPages(srcPdfDoc, pageIndices);
  copiedPages.forEach(page => extractedPdf.addPage(page));

  // Save new PDF bytes (Uint8Array)
  const pdfBytes = await extractedPdf.save();

  // Sanitize user's custom filename
  const downloadName = sanitizeOutputFilename(outputFilenameInput, originalFilename);

  // Create Blob & trigger direct browser download
  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const downloadUrl = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = downloadName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // Clean up DOM and Blob Object URL
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 2000);
}
