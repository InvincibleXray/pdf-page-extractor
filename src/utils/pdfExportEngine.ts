import { PDFDocument, rgb, StandardFonts, type RGB } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import type {
  EditorObject,
  TextEditorObject,
  ShapeEditorObject,
  AnnotationEditorObject,
  PrivacyEditorObject,
  PenEditorObject,
  ImageEditorObject,
} from './editorState';

export interface ExportProgressCallback {
  (stage: string, current: number, total: number): void;
}

export interface ExportResult {
  success: boolean;
  filename?: string;
  error?: string;
  unsupportedCount?: number;
}

function parseHexColor(hex: string, defaultColor: RGB = rgb(0, 0, 0)): RGB {
  if (!hex || hex === 'transparent') return defaultColor;
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  if (clean.length !== 6) return defaultColor;
  const num = parseInt(clean, 16);
  return rgb(
    ((num >> 16) & 255) / 255,
    ((num >> 8) & 255) / 255,
    (num & 255) / 255
  );
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function exportPdfDocument(
  pristineBytes: ArrayBuffer,
  objects: EditorObject[],
  originalFilename: string,
  onProgress?: ExportProgressCallback
): Promise<ExportResult> {
  try {
    if (onProgress) onProgress('Checking capabilities...', 0, 100);

    // Pre-flight capability check
    const supportedTypes = [
      'text',
      'rectangle',
      'ellipse',
      'line',
      'arrow',
      'pen',
      'highlight',
      'whiteout',
      'image',
      'signature',
    ];
    const unsupported = objects.filter((o) => !supportedTypes.includes(o.type));
    if (unsupported.length > 0) {
      console.warn(`Export contains ${unsupported.length} unsupported object(s).`);
    }

    if (onProgress) onProgress('Loading document bytes...', 15, 100);

    // Load pristine clone in pdf-lib
    const pdfDoc = await PDFDocument.load(pristineBytes);

    // Embed standard fonts
    const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontTimes = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const fontCourier = await pdfDoc.embedFont(StandardFonts.Courier);

    const totalPages = pdfDoc.getPageCount();

    // Group objects by page
    const objectsByPage = new Map<number, EditorObject[]>();
    for (const obj of objects) {
      const list = objectsByPage.get(obj.pageNumber) || [];
      list.push(obj);
      objectsByPage.set(obj.pageNumber, list);
    }

    if (onProgress) onProgress('Applying annotations to pages...', 30, 100);

    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      const pageNum = pageIdx + 1;
      const pageObjects = objectsByPage.get(pageNum);
      if (!pageObjects || pageObjects.length === 0) continue;

      const page = pdfDoc.getPage(pageIdx);
      const pageHeight = page.getHeight();

      for (const obj of pageObjects) {
        if (obj.type === 'text') {
          const textObj = obj as TextEditorObject;
          let font = fontHelvetica;
          if (textObj.fontWeight === 'bold') {
            font = fontHelveticaBold;
          } else if (textObj.fontFamily.toLowerCase().includes('times')) {
            font = fontTimes;
          } else if (textObj.fontFamily.toLowerCase().includes('mono') || textObj.fontFamily.toLowerCase().includes('courier')) {
            font = fontCourier;
          }

          const lines = textObj.text.split('\n');
          const fontSize = textObj.fontSize || 14;
          const color = parseHexColor(textObj.color, rgb(0.06, 0.09, 0.16));

          for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const line = lines[lineIdx];
            const lineY = pageHeight - textObj.y - fontSize - (lineIdx * fontSize * 1.3);
            page.drawText(line, {
              x: textObj.x + 4,
              y: lineY,
              size: fontSize,
              font,
              color,
              opacity: textObj.opacity !== undefined ? textObj.opacity : 1.0,
            });
          }
        } else if (obj.type === 'highlight') {
          const annotObj = obj as AnnotationEditorObject;
          const y_pdflib = pageHeight - annotObj.y - annotObj.height;
          const color = parseHexColor(annotObj.color || '#facc15', rgb(0.98, 0.8, 0.08));
          page.drawRectangle({
            x: annotObj.x,
            y: y_pdflib,
            width: annotObj.width,
            height: annotObj.height,
            color,
            opacity: 0.35, // Explicit PDF graphics state transparency
          });
        } else if (obj.type === 'whiteout') {
          const privObj = obj as PrivacyEditorObject;
          const y_pdflib = pageHeight - privObj.y - privObj.height;
          page.drawRectangle({
            x: privObj.x,
            y: y_pdflib,
            width: privObj.width,
            height: privObj.height,
            color: rgb(1, 1, 1),
            opacity: 1.0,
          });
        } else if (obj.type === 'rectangle') {
          const shapeObj = obj as ShapeEditorObject;
          const y_pdflib = pageHeight - shapeObj.y - shapeObj.height;
          const hasFill = shapeObj.fillColor && shapeObj.fillColor !== 'transparent';
          page.drawRectangle({
            x: shapeObj.x,
            y: y_pdflib,
            width: shapeObj.width,
            height: shapeObj.height,
            color: hasFill ? parseHexColor(shapeObj.fillColor) : undefined,
            borderColor: parseHexColor(shapeObj.strokeColor, rgb(0.14, 0.38, 0.92)),
            borderWidth: shapeObj.strokeWidth || 1,
            opacity: shapeObj.opacity !== undefined ? shapeObj.opacity : 1.0,
          });
        } else if (obj.type === 'ellipse') {
          const shapeObj = obj as ShapeEditorObject;
          const x_center = shapeObj.x + shapeObj.width / 2;
          const y_center = pageHeight - (shapeObj.y + shapeObj.height / 2);
          const hasFill = shapeObj.fillColor && shapeObj.fillColor !== 'transparent';
          page.drawEllipse({
            x: x_center,
            y: y_center,
            xScale: shapeObj.width / 2,
            yScale: shapeObj.height / 2,
            color: hasFill ? parseHexColor(shapeObj.fillColor) : undefined,
            borderColor: parseHexColor(shapeObj.strokeColor, rgb(0.14, 0.38, 0.92)),
            borderWidth: shapeObj.strokeWidth || 1,
            opacity: shapeObj.opacity !== undefined ? shapeObj.opacity : 1.0,
          });
        } else if (obj.type === 'line' || obj.type === 'arrow') {
          const shapeObj = obj as ShapeEditorObject;
          const startX = shapeObj.x;
          const startY = pageHeight - shapeObj.y;
          const endX = shapeObj.x + shapeObj.width;
          const endY = pageHeight - (shapeObj.y + shapeObj.height);
          const strokeColor = parseHexColor(shapeObj.strokeColor, rgb(0.14, 0.38, 0.92));

          page.drawLine({
            start: { x: startX, y: startY },
            end: { x: endX, y: endY },
            thickness: shapeObj.strokeWidth || 2,
            color: strokeColor,
            opacity: shapeObj.opacity !== undefined ? shapeObj.opacity : 1.0,
          });

          if (obj.type === 'arrow') {
            // Draw arrowhead
            const angle = Math.atan2(endY - startY, endX - startX);
            const arrowHeadLen = 10;
            const x1 = endX - arrowHeadLen * Math.cos(angle - Math.PI / 6);
            const y1 = endY - arrowHeadLen * Math.sin(angle - Math.PI / 6);
            const x2 = endX - arrowHeadLen * Math.cos(angle + Math.PI / 6);
            const y2 = endY - arrowHeadLen * Math.sin(angle + Math.PI / 6);

            page.drawLine({
              start: { x: endX, y: endY },
              end: { x: x1, y: y1 },
              thickness: shapeObj.strokeWidth || 2,
              color: strokeColor,
            });
            page.drawLine({
              start: { x: endX, y: endY },
              end: { x: x2, y: y2 },
              thickness: shapeObj.strokeWidth || 2,
              color: strokeColor,
            });
          }
        } else if (obj.type === 'pen') {
          const penObj = obj as PenEditorObject;
          const strokeColor = parseHexColor(penObj.strokeColor, rgb(0.14, 0.38, 0.92));
          try {
            page.drawSvgPath(penObj.pathData, {
              x: penObj.x,
              y: pageHeight - penObj.y,
              borderColor: strokeColor,
              borderWidth: penObj.strokeWidth || 2,
              opacity: penObj.opacity !== undefined ? penObj.opacity : 1.0,
            });
          } catch (svgErr) {
            console.warn('SVG path draw error:', svgErr);
          }
        } else if (obj.type === 'image') {
          const imgObj = obj as ImageEditorObject;
          if (imgObj.src && imgObj.src.startsWith('data:')) {
            try {
              const imgBytes = dataUrlToBytes(imgObj.src);
              const isPng = imgObj.src.includes('image/png');
              const embeddedImage = isPng
                ? await pdfDoc.embedPng(imgBytes)
                : await pdfDoc.embedJpg(imgBytes);

              const y_pdflib = pageHeight - imgObj.y - imgObj.height;
              page.drawImage(embeddedImage, {
                x: imgObj.x,
                y: y_pdflib,
                width: imgObj.width,
                height: imgObj.height,
                opacity: imgObj.opacity !== undefined ? imgObj.opacity : 1.0,
              });
            } catch (imgErr) {
              console.warn('Image embed error:', imgErr);
            }
          }
        }
      }
    }

    if (onProgress) onProgress('Serializing and validating PDF bytes...', 80, 100);

    const pdfBytes = await pdfDoc.save();

    // Automated integrity validation check
    try {
      const validationDoc = await PDFDocument.load(pdfBytes);
      if (validationDoc.getPageCount() !== totalPages) {
        throw new Error('Exported PDF page count mismatch');
      }
      const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
      const jsDoc = await loadingTask.promise;
      await jsDoc.getPage(1);
      await jsDoc.destroy();
    } catch (valErr: any) {
      console.error('Validation failure:', valErr);
      throw new Error(`Export validation failed: ${valErr.message}`);
    }

    if (onProgress) onProgress('Export complete! Triggering download...', 100, 100);

    // Compute filename
    const baseName = originalFilename.replace(/\.[^/.]+$/, '');
    const finalFilename = `${baseName}-edited.pdf`;

    // Trigger browser download
    const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = finalFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);

    return {
      success: true,
      filename: finalFilename,
      unsupportedCount: unsupported.length,
    };
  } catch (err: any) {
    console.error('Export engine error:', err);
    return {
      success: false,
      error: err.message || 'Unknown export error',
    };
  }
}
