import {
  PDFDocument,
  rgb,
  degrees,
  StandardFonts,
  PDFName,
  PDFDict,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  type RGB,
  type PDFPage,
} from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import type {
  EditorObject,
  TextEditorObject,
  TextReplacementEditorObject,
  ShapeEditorObject,
  AnnotationEditorObject,
  PrivacyEditorObject,
  RedactionEditorObject,
  PenEditorObject,
  ImageEditorObject,
  PageState,
} from './editorState';
import { formStore } from './formState';
import { renderSanitizedPageRaster } from './redactionRasterizer';
import { sanitizePdfDocument } from './pdfSanitizer';
import { validateRedactedPdf, assertRedactionClean } from './redactionValidator';

export type FormExportMode = 'interactive' | 'flattened';

export interface ExportProgressCallback {
  (stage: string, current: number, total: number): void;
}

export interface ExportEngineOptions {
  sanitizeMetadata?: boolean;
  targetDpi?: number;
  loadedDocProxy?: pdfjsLib.PDFDocumentProxy;
  skipValidation?: boolean;
  download?: boolean;
  exportMode?: FormExportMode;
}

export interface ExportResult {
  success: boolean;
  filename?: string;
  error?: string;
  unsupportedCount?: number;
  pdfBytes?: Uint8Array;
  warning?: string;
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

/**
 * Renders editor overlay objects (text, shapes, highlights, pen, image) onto a PDF page.
 */
async function renderPageObjects(
  page: PDFPage,
  pageObjects: EditorObject[],
  isRedactedPage: boolean,
  fonts: {
    fontHelvetica: any;
    fontHelveticaBold: any;
    fontTimes: any;
    fontTimesBold?: any;
    fontCourier: any;
    fontCourierBold?: any;
  }
): Promise<void> {
  if (pageObjects.length === 0) return;
  const pageHeight = page.getHeight();

  for (const obj of pageObjects) {
    // For rasterized pages, redact, text-replacement, and whiteout are already obliterated into the raster
    if (isRedactedPage && (obj.type === 'redact' || obj.type === 'text-replacement' || obj.type === 'whiteout')) {
      continue;
    }

    if (obj.type === 'text') {
      const textObj = obj as TextEditorObject;
      let font = fonts.fontHelvetica;
      const fam = (textObj.fontFamily || '').toLowerCase();
      const isBold = textObj.fontWeight === 'bold';
      if (fam.includes('times') || fam.includes('serif')) {
        font = isBold ? (fonts.fontTimesBold || fonts.fontTimes) : fonts.fontTimes;
      } else if (fam.includes('mono') || fam.includes('courier')) {
        font = isBold ? (fonts.fontCourierBold || fonts.fontCourier) : fonts.fontCourier;
      } else {
        font = isBold ? fonts.fontHelveticaBold : fonts.fontHelvetica;
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
    } else if (obj.type === 'text-replacement') {
      const repObj = obj as TextReplacementEditorObject;
      let font = fonts.fontHelvetica;
      const fam = (repObj.fontFamily || '').toLowerCase();
      const isBold = repObj.fontWeight === 'bold';
      if (fam.includes('times') || fam.includes('serif')) {
        font = isBold ? (fonts.fontTimesBold || fonts.fontTimes) : fonts.fontTimes;
      } else if (fam.includes('mono') || fam.includes('courier')) {
        font = isBold ? (fonts.fontCourierBold || fonts.fontCourier) : fonts.fontCourier;
      } else {
        font = isBold ? fonts.fontHelveticaBold : fonts.fontHelvetica;
      }

      const lines = repObj.replacementText.split('\n');
      const fontSize = repObj.fontSize || 14;
      const color = parseHexColor(repObj.color, rgb(0.06, 0.09, 0.16));

      let maxLineWidth = repObj.width;
      for (const line of lines) {
        try {
          const textW = font.widthOfTextAtSize(line, fontSize);
          if (textW > maxLineWidth) maxLineWidth = textW;
        } catch (e) {}
      }

      const padding = repObj.maskPadding !== undefined ? repObj.maskPadding : 2;
      const y_pdflib = pageHeight - repObj.y - repObj.height;
      const maskColor = parseHexColor(repObj.backgroundColor || '#ffffff', rgb(1, 1, 1));

      page.drawRectangle({
        x: repObj.x - padding,
        y: y_pdflib - padding,
        width: maxLineWidth + (padding * 2),
        height: repObj.height + (padding * 2),
        color: maskColor,
        opacity: 1.0,
      });

      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        const lineY = pageHeight - repObj.y - fontSize - (lineIdx * fontSize * 1.2);
        page.drawText(line, {
          x: repObj.x,
          y: lineY,
          size: fontSize,
          font,
          color,
          opacity: 1.0,
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
        opacity: 0.35,
      });
    } else if (obj.type === 'underline') {
      const annotObj = obj as AnnotationEditorObject;
      const strokeColor = parseHexColor(annotObj.color || '#2563eb', rgb(0.14, 0.38, 0.92));
      const thickness = annotObj.strokeWidth || 1.5;
      const lineY = pageHeight - annotObj.y - annotObj.height + 1;
      page.drawLine({
        start: { x: annotObj.x, y: lineY },
        end: { x: annotObj.x + annotObj.width, y: lineY },
        thickness,
        color: strokeColor,
        opacity: annotObj.opacity !== undefined ? annotObj.opacity : 1.0,
      });
    } else if (obj.type === 'strikethrough') {
      const annotObj = obj as AnnotationEditorObject;
      const strokeColor = parseHexColor(annotObj.color || '#dc2626', rgb(0.86, 0.15, 0.15));
      const thickness = annotObj.strokeWidth || 1.5;
      const lineY = pageHeight - annotObj.y - annotObj.height / 2;
      page.drawLine({
        start: { x: annotObj.x, y: lineY },
        end: { x: annotObj.x + annotObj.width, y: lineY },
        thickness,
        color: strokeColor,
        opacity: annotObj.opacity !== undefined ? annotObj.opacity : 1.0,
      });
    } else if (obj.type === 'comment') {
      const annotObj = obj as AnnotationEditorObject;
      const badgeSize = Math.max(18, Math.min(annotObj.width || 22, annotObj.height || 22));
      const y_pdflib = pageHeight - annotObj.y - badgeSize;
      const badgeColor = parseHexColor(annotObj.color || '#f59e0b', rgb(0.96, 0.62, 0.04));
      page.drawRectangle({
        x: annotObj.x,
        y: y_pdflib,
        width: badgeSize,
        height: badgeSize,
        color: badgeColor,
        borderColor: rgb(0.75, 0.45, 0.0),
        borderWidth: 1,
        opacity: 0.95,
      });
      try {
        page.drawText('C', {
          x: annotObj.x + 5,
          y: y_pdflib + 4,
          size: 11,
          font: fonts.fontHelveticaBold,
          color: rgb(1, 1, 1),
        });
      } catch (e) {}
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
            ? await page.doc.embedPng(imgBytes)
            : await page.doc.embedJpg(imgBytes);

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

/**
 * Main transactional export entry point.
 */
export async function exportPdfDocument(
  pristineBytes: ArrayBuffer,
  objects: EditorObject[],
  originalFilename: string,
  onProgress?: ExportProgressCallback,
  pages?: PageState[],
  options?: ExportEngineOptions
): Promise<ExportResult> {
  let srcJsDoc: pdfjsLib.PDFDocumentProxy | null = options?.loadedDocProxy || null;
  let ownsJsDoc = false;
  let warningMessage: string | undefined = undefined;

  try {
    if (onProgress) onProgress('Checking capabilities...', 0, 100);

    // 1. HARD XFA FAIL-CLOSED GATE
    let isXfaDetected = formStore.isXfa();
    if (!isXfaDetected && srcJsDoc) {
      try {
        const meta = await srcJsDoc.getMetadata();
        if (meta?.info && (meta.info as any).IsXFAPresent) {
          isXfaDetected = true;
        }
      } catch (e) {}
    }
    if (!isXfaDetected) {
      const scanLen = Math.min(65536, pristineBytes.byteLength);
      const headSlice = new TextDecoder('latin1').decode(new Uint8Array(pristineBytes.slice(0, scanLen)));
      if (headSlice.includes('/XFA')) {
        isXfaDetected = true;
      }
    }
    if (isXfaDetected) {
      return {
        success: false,
        error: 'XFA forms are not supported.',
      };
    }

    // 2. DIGITAL SIGNATURE CHECK
    if (srcJsDoc) {
      try {
        for (let p = 1; p <= srcJsDoc.numPages; p++) {
          const pProxy = await srcJsDoc.getPage(p);
          const annots = await pProxy.getAnnotations();
          if (annots.some((a: any) => a.subtype === 'Widget' && a.fieldType === 'Sig')) {
            warningMessage = 'Editing this PDF may invalidate its existing digital signature.';
            break;
          }
        }
      } catch (e) {}
    }

    // Pre-flight capability check
    const supportedTypes = [
      'text',
      'text-replacement',
      'rectangle',
      'ellipse',
      'line',
      'arrow',
      'pen',
      'highlight',
      'whiteout',
      'redact',
      'image',
      'signature',
      'underline',
      'strikethrough',
      'comment',
    ];
    const unsupported = objects.filter((o) => !supportedTypes.includes(o.type));
    if (unsupported.length > 0) {
      console.warn(`Export contains ${unsupported.length} unsupported object(s).`);
    }

    if (onProgress) onProgress('Loading document bytes...', 15, 100);

    // Load pristine clone in pdf-lib
    const srcDoc = await PDFDocument.load(pristineBytes);
    const hasCatalogAcroForm = srcDoc.catalog.has(PDFName.of('AcroForm'));
    const isFormDoc =
      (hasCatalogAcroForm && (formStore.hasForm() || srcDoc.getForm().getFields().length > 0)) ||
      formStore.getFields().length > 0;
    const exportMode: FormExportMode = options?.exportMode || 'interactive';

    const effectivePages: PageState[] =
      pages && pages.length > 0
        ? pages
        : Array.from({ length: srcDoc.getPageCount() }, (_, i) => {
            const p = srcDoc.getPage(i);
            return {
              id: `p_${i + 1}`,
              sourcePageIndex: i,
              originalPageNumber: i + 1,
              pageNumber: i + 1,
              rotation: p.getRotation().angle,
              width: p.getWidth(),
              height: p.getHeight(),
              orientation: p.getWidth() > p.getHeight() ? 'landscape' : 'portrait',
            };
          });

    const totalPages = effectivePages.length;

    // Group objects by page ID and by pageNumber
    const objectsByPageId = new Map<string, EditorObject[]>();
    const objectsByPageNum = new Map<number, EditorObject[]>();
    for (const obj of objects) {
      if (obj.pageId) {
        const list = objectsByPageId.get(obj.pageId) || [];
        list.push(obj);
        objectsByPageId.set(obj.pageId, list);
      } else {
        const list = objectsByPageNum.get(obj.pageNumber) || [];
        list.push(obj);
        objectsByPageNum.set(obj.pageNumber, list);
      }
    }

    // Check if any redactions exist across document
    const hasAnyRedactions = objects.some((o) => o.type === 'redact');
    if (hasAnyRedactions && !srcJsDoc) {
      const loadingTask = pdfjsLib.getDocument({
        data: pristineBytes.slice(0),
        useSystemFonts: true,
      });
      srcJsDoc = await loadingTask.promise;
      ownsJsDoc = true;
    }

    let pdfBytes: Uint8Array;

    if (isFormDoc) {
      // =========================================================================
      // ACROFORM DOCUMENT EXPORT (MODE A: Interactive / MODE B: Flattened)
      // Uses in-place mutation on srcDoc to preserve /Catalog /AcroForm hierarchy
      // =========================================================================
      if (onProgress) onProgress('Synchronizing form field values...', 25, 100);

      const form = srcDoc.getForm();
      const fontHelvetica = await srcDoc.embedFont(StandardFonts.Helvetica);
      const fontHelveticaBold = await srcDoc.embedFont(StandardFonts.HelveticaBold);
      const fontTimes = await srcDoc.embedFont(StandardFonts.TimesRoman);
      const fontTimesBold = await srcDoc.embedFont(StandardFonts.TimesRomanBold);
      const fontCourier = await srcDoc.embedFont(StandardFonts.Courier);
      const fontCourierBold = await srcDoc.embedFont(StandardFonts.CourierBold);
      const fonts = { fontHelvetica, fontHelveticaBold, fontTimes, fontTimesBold, fontCourier, fontCourierBold };

      // 0. Authoring: Materialize newly created form fields and widgets into srcDoc
      const allFormFields = formStore.getFields();
      for (const fieldState of allFormFields) {
        let pdfField = form.getFieldMaybe(fieldState.name);
        if (!pdfField) {
          try {
            if (fieldState.type === 'text' || fieldState.type === 'multiline' || fieldState.type === 'password') {
              const tf = form.createTextField(fieldState.name);
              if (fieldState.multiline) tf.enableMultiline();
              if (fieldState.maxLength) tf.setMaxLength(fieldState.maxLength);
              if (fieldState.readOnly) tf.enableReadOnly();
              if (fieldState.required) tf.enableRequired();
              for (const widgetId of fieldState.widgetIds) {
                const w = formStore.getWidget(widgetId);
                if (!w) continue;
                const pageIdx = Math.max(0, Math.min(w.pageNumber - 1, srcDoc.getPageCount() - 1));
                const targetPage = srcDoc.getPage(pageIdx);
                const width = Math.max(12, Math.abs(w.pdfRect[2] - w.pdfRect[0]));
                const height = Math.max(12, Math.abs(w.pdfRect[3] - w.pdfRect[1]));
                tf.addToPage(targetPage, {
                  x: Math.min(w.pdfRect[0], w.pdfRect[2]),
                  y: Math.min(w.pdfRect[1], w.pdfRect[3]),
                  width,
                  height,
                  borderWidth: fieldState.borderWidth || 1,
                  borderColor: fieldState.borderColor ? parseHexColor(fieldState.borderColor, rgb(0, 0, 0)) : rgb(0.7, 0.7, 0.7),
                  backgroundColor: fieldState.backgroundColor ? parseHexColor(fieldState.backgroundColor, rgb(1, 1, 1)) : rgb(1, 1, 1),
                });
              }
            } else if (fieldState.type === 'checkbox') {
              const cb = form.createCheckBox(fieldState.name);
              if (fieldState.readOnly) cb.enableReadOnly();
              if (fieldState.required) cb.enableRequired();
              for (const widgetId of fieldState.widgetIds) {
                const w = formStore.getWidget(widgetId);
                if (!w) continue;
                const pageIdx = Math.max(0, Math.min(w.pageNumber - 1, srcDoc.getPageCount() - 1));
                const targetPage = srcDoc.getPage(pageIdx);
                const width = Math.max(12, Math.abs(w.pdfRect[2] - w.pdfRect[0]));
                const height = Math.max(12, Math.abs(w.pdfRect[3] - w.pdfRect[1]));
                cb.addToPage(targetPage, {
                  x: Math.min(w.pdfRect[0], w.pdfRect[2]),
                  y: Math.min(w.pdfRect[1], w.pdfRect[3]),
                  width,
                  height,
                  borderWidth: fieldState.borderWidth || 1,
                  borderColor: fieldState.borderColor ? parseHexColor(fieldState.borderColor, rgb(0, 0, 0)) : rgb(0.4, 0.4, 0.4),
                  backgroundColor: fieldState.backgroundColor ? parseHexColor(fieldState.backgroundColor, rgb(1, 1, 1)) : rgb(1, 1, 1),
                });
              }
            } else if (fieldState.type === 'radio') {
              const rg = form.createRadioGroup(fieldState.name);
              if (fieldState.readOnly) rg.enableReadOnly();
              if (fieldState.required) rg.enableRequired();
              let optIdx = 1;
              for (const widgetId of fieldState.widgetIds) {
                const w = formStore.getWidget(widgetId);
                if (!w) continue;
                const pageIdx = Math.max(0, Math.min(w.pageNumber - 1, srcDoc.getPageCount() - 1));
                const targetPage = srcDoc.getPage(pageIdx);
                const width = Math.max(12, Math.abs(w.pdfRect[2] - w.pdfRect[0]));
                const height = Math.max(12, Math.abs(w.pdfRect[3] - w.pdfRect[1]));
                const optVal = w.exportValue || `Option_${optIdx}`;
                rg.addOptionToPage(optVal, targetPage, {
                  x: Math.min(w.pdfRect[0], w.pdfRect[2]),
                  y: Math.min(w.pdfRect[1], w.pdfRect[3]),
                  width,
                  height,
                  borderWidth: fieldState.borderWidth || 1,
                  borderColor: fieldState.borderColor ? parseHexColor(fieldState.borderColor, rgb(0, 0, 0)) : rgb(0.4, 0.4, 0.4),
                  backgroundColor: fieldState.backgroundColor ? parseHexColor(fieldState.backgroundColor, rgb(1, 1, 1)) : rgb(1, 1, 1),
                });
                optIdx++;
              }
            } else if (fieldState.type === 'dropdown') {
              const dd = form.createDropdown(fieldState.name);
              if (fieldState.readOnly) dd.enableReadOnly();
              if (fieldState.required) dd.enableRequired();
              if (fieldState.options && fieldState.options.length > 0) {
                dd.addOptions(fieldState.options.map((o) => o.value));
              }
              for (const widgetId of fieldState.widgetIds) {
                const w = formStore.getWidget(widgetId);
                if (!w) continue;
                const pageIdx = Math.max(0, Math.min(w.pageNumber - 1, srcDoc.getPageCount() - 1));
                const targetPage = srcDoc.getPage(pageIdx);
                const width = Math.max(12, Math.abs(w.pdfRect[2] - w.pdfRect[0]));
                const height = Math.max(12, Math.abs(w.pdfRect[3] - w.pdfRect[1]));
                dd.addToPage(targetPage, {
                  x: Math.min(w.pdfRect[0], w.pdfRect[2]),
                  y: Math.min(w.pdfRect[1], w.pdfRect[3]),
                  width,
                  height,
                  borderWidth: fieldState.borderWidth || 1,
                  borderColor: fieldState.borderColor ? parseHexColor(fieldState.borderColor, rgb(0, 0, 0)) : rgb(0.7, 0.7, 0.7),
                  backgroundColor: fieldState.backgroundColor ? parseHexColor(fieldState.backgroundColor, rgb(1, 1, 1)) : rgb(1, 1, 1),
                });
              }
            } else if (fieldState.type === 'listbox') {
              const ol = form.createOptionList(fieldState.name);
              if (fieldState.readOnly) ol.enableReadOnly();
              if (fieldState.required) ol.enableRequired();
              if (fieldState.options && fieldState.options.length > 0) {
                ol.addOptions(fieldState.options.map((o) => o.value));
              }
              for (const widgetId of fieldState.widgetIds) {
                const w = formStore.getWidget(widgetId);
                if (!w) continue;
                const pageIdx = Math.max(0, Math.min(w.pageNumber - 1, srcDoc.getPageCount() - 1));
                const targetPage = srcDoc.getPage(pageIdx);
                const width = Math.max(12, Math.abs(w.pdfRect[2] - w.pdfRect[0]));
                const height = Math.max(12, Math.abs(w.pdfRect[3] - w.pdfRect[1]));
                ol.addToPage(targetPage, {
                  x: Math.min(w.pdfRect[0], w.pdfRect[2]),
                  y: Math.min(w.pdfRect[1], w.pdfRect[3]),
                  width,
                  height,
                  borderWidth: fieldState.borderWidth || 1,
                  borderColor: fieldState.borderColor ? parseHexColor(fieldState.borderColor, rgb(0, 0, 0)) : rgb(0.7, 0.7, 0.7),
                  backgroundColor: fieldState.backgroundColor ? parseHexColor(fieldState.backgroundColor, rgb(1, 1, 1)) : rgb(1, 1, 1),
                });
              }
            }
          } catch (createErr) {
            console.warn(`Error materializing authored field ${fieldState.name}:`, createErr);
          }
        } else {
          // If field existed, check if any of its widget bounds were updated
          try {
            const widgets = pdfField.acroField.getWidgets();
            for (let i = 0; i < fieldState.widgetIds.length && i < widgets.length; i++) {
              const wState = formStore.getWidget(fieldState.widgetIds[i]);
              if (wState && wState.pdfRect) {
                widgets[i].setRectangle({
                  x: Math.min(wState.pdfRect[0], wState.pdfRect[2]),
                  y: Math.min(wState.pdfRect[1], wState.pdfRect[3]),
                  width: Math.abs(wState.pdfRect[2] - wState.pdfRect[0]),
                  height: Math.abs(wState.pdfRect[3] - wState.pdfRect[1]),
                });
              }
            }
          } catch (boundErr) {
            console.warn(`Error updating bounds for existing field ${fieldState.name}:`, boundErr);
          }
        }
      }

      // 1. Sync field values from FormStateManager
      const allFieldValues = formStore.getAllFieldValues();
      for (const [fieldId, val] of Object.entries(allFieldValues)) {
        try {
          const field = form.getFieldMaybe(fieldId);
          if (!field) continue;
          if (field instanceof PDFTextField) {
            field.setText(typeof val === 'string' ? val : String(val ?? ''));
          } else if (field instanceof PDFCheckBox) {
            if (val === true || val === 'Yes') {
              field.check();
            } else {
              field.uncheck();
            }
          } else if (field instanceof PDFRadioGroup) {
            if (typeof val === 'string' && val) {
              try {
                field.select(val);
              } catch (e) {
                const options = field.getOptions();
                const idx = parseInt(val, 10);
                if (!isNaN(idx) && options[idx]) {
                  field.select(options[idx]);
                }
              }
            }
          } else if (field instanceof PDFDropdown) {
            if (typeof val === 'string' && val) {
              field.select(val);
            }
          } else if (field instanceof PDFOptionList) {
            if (Array.isArray(val)) {
              field.select(val);
            } else if (val) {
              field.select([String(val)]);
            }
          }
        } catch (fErr) {
          console.warn(`Could not set value for field ${fieldId}:`, fErr);
        }
      }

      try {
        form.updateFieldAppearances(fontHelvetica);
      } catch (appErr) {
        console.warn('Form appearance update warning:', appErr);
      }

      // 2. Handle Page Operations (Rotations, Deletions, Duplications, Reordering)
      const originalPageCount = srcDoc.getPageCount();
      const keptSourceIndices = new Set(effectivePages.map((p) => p.sourcePageIndex));

      // Remove fields belonging exclusively to deleted pages
      if (keptSourceIndices.size < originalPageCount) {
        const deletedSourceIndices = new Set<number>();
        for (let i = 0; i < originalPageCount; i++) {
          if (!keptSourceIndices.has(i)) {
            deletedSourceIndices.add(i);
          }
        }
        for (const field of form.getFields()) {
          const fName = field.getName();
          const fState = formStore.getField(fName);
          if (fState && fState.widgetIds.length > 0) {
            const widgetPages: number[] = fState.widgetIds
              .map((wId) => formStore.getWidget(wId)?.pageNumber)
              .filter((p): p is number => p !== undefined)
              .map((p) => p - 1);
            const allOnDeleted = widgetPages.length > 0 && widgetPages.every((pIdx: number) => deletedSourceIndices.has(pIdx));
            if (allOnDeleted) {
              try {
                form.removeField(field);
              } catch (e) {}
            }
          }
        }
      }

      // Handle duplicated pages
      const pageRefMap = new Map<number, any[]>();
      for (let i = 0; i < originalPageCount; i++) {
        pageRefMap.set(i, [srcDoc.getPage(i).ref]);
      }
      const pageCounts = new Map<number, number>();
      for (const pState of effectivePages) {
        const count = (pageCounts.get(pState.sourcePageIndex) || 0) + 1;
        pageCounts.set(pState.sourcePageIndex, count);
        if (count > 1) {
          const [cloned] = await srcDoc.copyPages(srcDoc, [pState.sourcePageIndex]);
          const newPage = srcDoc.addPage(cloned);
          pageRefMap.get(pState.sourcePageIndex)!.push(newPage.ref);
        }
      }

      // Reorder /Pages Kids array
      const pageOccurrence = new Map<number, number>();
      const finalPageRefs = [];
      for (const pState of effectivePages) {
        const occ = pageOccurrence.get(pState.sourcePageIndex) || 0;
        pageOccurrence.set(pState.sourcePageIndex, occ + 1);
        const refs = pageRefMap.get(pState.sourcePageIndex);
        if (refs && refs[occ]) {
          finalPageRefs.push(refs[occ]);
        }
      }

      const pagesRef = srcDoc.catalog.get(PDFName.of('Pages'));
      const pagesDict = srcDoc.context.lookup(pagesRef) as PDFDict;
      pagesDict.set(PDFName.of('Kids'), srcDoc.context.obj(finalPageRefs));
      pagesDict.set(PDFName.of('Count'), srcDoc.context.obj(finalPageRefs.length));

      // Apply rotations
      for (let i = 0; i < srcDoc.getPageCount(); i++) {
        const p = srcDoc.getPage(i);
        const pState = effectivePages[i];
        if (pState) {
          p.setRotation(degrees(pState.rotation || 0));
        }
      }

      // 3. Redaction Reconciliation (Phase 5 Secure Raster Reconstruction)
      for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
        const pageState = effectivePages[pageIdx];
        const pageObjects =
          objectsByPageId.get(pageState.id) || objectsByPageNum.get(pageIdx + 1) || [];
        const pageRedactions = pageObjects.filter((o) => o.type === 'redact') as RedactionEditorObject[];

        if (pageRedactions.length > 0) {
          if (onProgress) {
            onProgress(
              `Rasterizing & sanitizing redacted page ${pageIdx + 1} of ${totalPages}...`,
              35 + Math.round((pageIdx / totalPages) * 30),
              100
            );
          }

          // Obliterate form fields on this page from AcroForm so canary string cannot leak in dictionary
          const pageWidgets = formStore.getWidgetsForPage(pageState.sourcePageIndex + 1);
          for (const pw of pageWidgets) {
            const f = form.getFieldMaybe(pw.fieldId);
            if (f) {
              try {
                form.removeField(f);
              } catch (e) {}
            }
          }

          if (!srcJsDoc) {
            const loadingTask = pdfjsLib.getDocument({
              data: pristineBytes.slice(0),
              useSystemFonts: true,
            });
            srcJsDoc = await loadingTask.promise;
            ownsJsDoc = true;
          }

          const pageProxy = await srcJsDoc.getPage(pageState.sourcePageIndex + 1);
          const raster = await renderSanitizedPageRaster(
            pageProxy,
            pageState,
            pageRedactions,
            pageObjects,
            { targetDpi: options?.targetDpi || 300 }
          );

          const targetPage = srcDoc.getPage(pageIdx);
          const embeddedImg = await srcDoc.embedPng(raster.imageBytes);

          // Clear original annotations & contents
          targetPage.node.delete(PDFName.of('Annots'));
          targetPage.node.delete(PDFName.of('Contents'));
          targetPage.setSize(raster.pageWidth, raster.pageHeight);
          targetPage.drawImage(embeddedImg, {
            x: 0,
            y: 0,
            width: raster.pageWidth,
            height: raster.pageHeight,
          });
        }
      }

      // 4. Mode B: Form Flattening
      if (exportMode === 'flattened') {
        if (onProgress) onProgress('Flattening form fields into page content...', 70, 100);
        form.flatten();

        // Purge /AcroForm from catalog
        if (srcDoc.catalog.has(PDFName.of('AcroForm'))) {
          srcDoc.catalog.delete(PDFName.of('AcroForm'));
        }

        // Remove any remaining /Widget annotations from all pages
        for (let i = 0; i < srcDoc.getPageCount(); i++) {
          const p = srcDoc.getPage(i);
          const annots = p.node.Annots();
          if (annots) {
            const surviving = [];
            for (let j = 0; j < annots.size(); j++) {
              const ref = annots.get(j);
              const aDict = srcDoc.context.lookup(ref);
              if (aDict instanceof PDFDict) {
                const subtype = aDict.get(PDFName.of('Subtype'));
                if (subtype && subtype.toString() === '/Widget') {
                  continue;
                }
                surviving.push(ref);
              }
            }
            if (surviving.length === 0) {
              p.node.delete(PDFName.of('Annots'));
            } else {
              p.node.set(PDFName.of('Annots'), srcDoc.context.obj(surviving));
            }
          }
        }
      }

      // 5. Draw Editor Overlay Objects
      for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
        const pageState = effectivePages[pageIdx];
        const pageObjects =
          objectsByPageId.get(pageState.id) || objectsByPageNum.get(pageIdx + 1) || [];
        const isRedactedPage = pageObjects.some((o) => o.type === 'redact');
        const targetPage = srcDoc.getPage(pageIdx);
        await renderPageObjects(targetPage, pageObjects, isRedactedPage, fonts);
      }

      // 6. Sanitization
      if (options?.sanitizeMetadata !== false) {
        if (onProgress) onProgress('Sanitizing document metadata...', 75, 100);
        sanitizePdfDocument(srcDoc);
      }

      if (onProgress) onProgress('Serializing PDF bytes...', 80, 100);
      pdfBytes = await srcDoc.save();
    } else {
      // =========================================================================
      // NON-FORM DOCUMENT EXPORT (Phase 1-5 Clean Synthesis Pipeline)
      // =========================================================================
      const outDoc = await PDFDocument.create();
      const fontHelvetica = await outDoc.embedFont(StandardFonts.Helvetica);
      const fontHelveticaBold = await outDoc.embedFont(StandardFonts.HelveticaBold);
      const fontTimes = await outDoc.embedFont(StandardFonts.TimesRoman);
      const fontTimesBold = await outDoc.embedFont(StandardFonts.TimesRomanBold);
      const fontCourier = await outDoc.embedFont(StandardFonts.Courier);
      const fontCourierBold = await outDoc.embedFont(StandardFonts.CourierBold);
      const fonts = { fontHelvetica, fontHelveticaBold, fontTimes, fontTimesBold, fontCourier, fontCourierBold };

      for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
        const pageState = effectivePages[pageIdx];
        const pageObjects =
          objectsByPageId.get(pageState.id) || objectsByPageNum.get(pageIdx + 1) || [];
        const pageRedactions = pageObjects.filter((o) => o.type === 'redact') as RedactionEditorObject[];
        const isRedactedPage = pageRedactions.length > 0;

        let page: any;

        if (!isRedactedPage) {
          const [copied] = await outDoc.copyPages(srcDoc, [pageState.sourcePageIndex]);
          copied.setRotation(degrees(pageState.rotation || 0));
          page = outDoc.addPage(copied);
        } else {
          if (onProgress) {
            onProgress(
              `Rasterizing & sanitizing page ${pageIdx + 1} of ${totalPages}...`,
              30 + Math.round((pageIdx / totalPages) * 35),
              100
            );
          }

          if (!srcJsDoc) {
            throw new Error('PDF.js document proxy unavailable for rasterizing redacted page');
          }

          const pageProxy = await srcJsDoc.getPage(pageState.sourcePageIndex + 1);
          const raster = await renderSanitizedPageRaster(
            pageProxy,
            pageState,
            pageRedactions,
            pageObjects,
            { targetDpi: options?.targetDpi || 300 }
          );

          const embeddedImg = await outDoc.embedPng(raster.imageBytes);
          page = outDoc.addPage([raster.pageWidth, raster.pageHeight]);
          page.drawImage(embeddedImg, {
            x: 0,
            y: 0,
            width: raster.pageWidth,
            height: raster.pageHeight,
          });
        }

        await renderPageObjects(page, pageObjects, isRedactedPage, fonts);
      }

      if (options?.sanitizeMetadata !== false) {
        if (onProgress) onProgress('Sanitizing document metadata...', 75, 100);
        sanitizePdfDocument(outDoc);
      }

      if (onProgress) onProgress('Serializing PDF bytes...', 80, 100);
      pdfBytes = await outDoc.save();
    }

    // =========================================================================
    // MANDATORY PRE-DOWNLOAD VALIDATION GATE
    // =========================================================================
    try {
      if (onProgress) onProgress('Validating PDF integrity...', 85, 100);
      const isLargePdf = pristineBytes.byteLength > 50 * 1024 * 1024;
      if (!isLargePdf) {
        const validationDoc = await PDFDocument.load(pdfBytes.slice(0));
        if (validationDoc.getPageCount() !== totalPages) {
          throw new Error('Exported PDF page count mismatch');
        }
        if (isFormDoc) {
          if (exportMode === 'interactive') {
            if (!validationDoc.catalog.has(PDFName.of('AcroForm'))) {
              throw new Error('AcroForm catalog entry missing in interactive export');
            }
          } else if (exportMode === 'flattened') {
            if (validationDoc.catalog.has(PDFName.of('AcroForm'))) {
              const f = validationDoc.getForm();
              if (f.getFields().length > 0) {
                throw new Error('Flattened PDF contains surviving editable form fields');
              }
            }
          }
        }
      }

      const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice(0) });
      const jsDoc = await loadingTask.promise;
      if (jsDoc.numPages !== totalPages) {
        throw new Error(`PDF.js page count mismatch: expected ${totalPages}, got ${jsDoc.numPages}`);
      }

      if (isFormDoc && exportMode === 'flattened') {
        for (let p = 1; p <= jsDoc.numPages; p++) {
          const pProxy = await jsDoc.getPage(p);
          const pAnnots = await pProxy.getAnnotations();
          const widgets = pAnnots.filter((a: any) => a.subtype === 'Widget');
          if (widgets.length > 0) {
            throw new Error(`Flattened PDF page ${p} contains ${widgets.length} unflattened widget(s)`);
          }
        }
      }
      await jsDoc.destroy();
    } catch (valErr: any) {
      console.error('Validation failure:', valErr);
      throw new Error(`Export validation failed: ${valErr.message}`);
    }

    // Automated forensic validation check on redactions
    const allRedactions = objects.filter((o) => o.type === 'redact') as RedactionEditorObject[];
    if (allRedactions.length > 0 && !options?.skipValidation) {
      if (onProgress) onProgress('Running pre-download forensic security validation...', 90, 100);
      const valResult = await validateRedactedPdf(pdfBytes, allRedactions, {
        expectedPageCount: totalPages,
        checkMetadataPurge: options?.sanitizeMetadata !== false,
      });
      assertRedactionClean(valResult);
    }

    if (onProgress) onProgress('Export complete! Triggering download...', 100, 100);

    // Compute filename
    const baseName = originalFilename.replace(/\.[^/.]+$/, '');
    const suffix = isFormDoc && exportMode === 'flattened' ? '-flattened.pdf' : '-edited.pdf';
    const finalFilename = `${baseName}${suffix}`;

    // Trigger browser download if enabled
    if (options?.download !== false && typeof document !== 'undefined') {
      const exportBuffer = (pdfBytes.buffer as ArrayBuffer).slice(
        pdfBytes.byteOffset,
        pdfBytes.byteOffset + pdfBytes.byteLength
      );
      const blob = new Blob([exportBuffer], { type: 'application/pdf' });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = finalFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
    }

    return {
      success: true,
      filename: finalFilename,
      unsupportedCount: unsupported.length,
      pdfBytes,
      warning: warningMessage,
    };
  } catch (err: any) {
    console.error('Export engine error:', err);
    return {
      success: false,
      error: err.message || 'Unknown export error',
    };
  } finally {
    if (ownsJsDoc && srcJsDoc) {
      try {
        await srcJsDoc.destroy();
      } catch (e) {}
    }
  }
}

/**
 * Convenience entry point for exporting an editable interactive AcroForm PDF.
 */
export async function exportInteractiveFormPdf(
  pristineBytes: ArrayBuffer,
  objects: EditorObject[],
  originalFilename: string,
  onProgress?: ExportProgressCallback,
  pages?: PageState[],
  options?: ExportEngineOptions
): Promise<ExportResult> {
  return exportPdfDocument(pristineBytes, objects, originalFilename, onProgress, pages, {
    ...options,
    exportMode: 'interactive',
  });
}

/**
 * Convenience entry point for exporting a flattened PDF with baked form values.
 */
export async function exportFlattenedFormPdf(
  pristineBytes: ArrayBuffer,
  objects: EditorObject[],
  originalFilename: string,
  onProgress?: ExportProgressCallback,
  pages?: PageState[],
  options?: ExportEngineOptions
): Promise<ExportResult> {
  return exportPdfDocument(pristineBytes, objects, originalFilename, onProgress, pages, {
    ...options,
    exportMode: 'flattened',
  });
}
