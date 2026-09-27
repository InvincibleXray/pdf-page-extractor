import { PDFDocument, PDFDict, PDFName } from 'pdf-lib';

export interface SanitizationReport {
  strippedInfo: boolean;
  strippedMetadata: boolean;
  strippedJavaScript: boolean;
  strippedAttachments: boolean;
}

/**
 * Global Document Sanitizer
 * 
 * Purges document-level tracking metadata, revision history, author credentials,
 * XMP streams, embedded files, and potential dynamic executable payloads (/JavaScript).
 */
export function sanitizePdfDocument(pdfDoc: PDFDocument): SanitizationReport {
  const report: SanitizationReport = {
    strippedInfo: false,
    strippedMetadata: false,
    strippedJavaScript: false,
    strippedAttachments: false,
  };

  // 1. Clear high-level standard fields in pdf-lib
  try {
    pdfDoc.setTitle('');
    pdfDoc.setAuthor('');
    pdfDoc.setSubject('');
    pdfDoc.setKeywords([]);
    pdfDoc.setProducer('');
    pdfDoc.setCreator('');
    pdfDoc.setCreationDate(new Date(0));
    pdfDoc.setModificationDate(new Date(0));
    report.strippedInfo = true;
  } catch (e) {
    console.warn('Sanitizer: standard info clear warning:', e);
  }

  // 2. Direct dictionary removal from trailer /Info
  try {
    const infoRef = pdfDoc.context.trailerInfo?.Info;
    if (infoRef) {
      const infoDict = pdfDoc.context.lookup(infoRef);
      if (infoDict instanceof PDFDict) {
        const keysToDelete = [
          'Title',
          'Author',
          'Subject',
          'Keywords',
          'Creator',
          'Producer',
          'CreationDate',
          'ModDate',
          'Trapped',
          'PTEX.Fullbanner',
        ];
        for (const key of keysToDelete) {
          infoDict.delete(PDFName.of(key));
        }
        report.strippedInfo = true;
      }
    }
  } catch (e) {
    console.warn('Sanitizer: trailer Info clear warning:', e);
  }

  // 3. Purge /Metadata XMP stream from Document Catalog
  try {
    const catalog = pdfDoc.catalog;
    if (catalog && catalog.has(PDFName.of('Metadata'))) {
      catalog.delete(PDFName.of('Metadata'));
      report.strippedMetadata = true;
    }
  } catch (e) {
    console.warn('Sanitizer: Catalog Metadata purge warning:', e);
  }

  // 4. Purge /Names (/JavaScript, /EmbeddedFiles) and action hooks
  try {
    const catalog = pdfDoc.catalog;
    if (catalog && catalog.has(PDFName.of('Names'))) {
      const names = pdfDoc.context.lookup(catalog.get(PDFName.of('Names')));
      if (names instanceof PDFDict) {
        if (names.has(PDFName.of('JavaScript'))) {
          names.delete(PDFName.of('JavaScript'));
          report.strippedJavaScript = true;
        }
        if (names.has(PDFName.of('EmbeddedFiles'))) {
          names.delete(PDFName.of('EmbeddedFiles'));
          report.strippedAttachments = true;
        }
      }
    }
    if (catalog && catalog.has(PDFName.of('OpenAction'))) {
      catalog.delete(PDFName.of('OpenAction'));
    }
    if (catalog && catalog.has(PDFName.of('AA'))) {
      catalog.delete(PDFName.of('AA'));
    }
  } catch (e) {
    console.warn('Sanitizer: Actions/Names purge warning:', e);
  }

  return report;
}
