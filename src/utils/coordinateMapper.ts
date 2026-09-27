import type { PageViewport } from 'pdfjs-dist';

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface PdfPoint {
  x: number;
  y: number;
}

export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Converts screen/pointer coordinates into authoritative PDF points (72 dpi, top-left origin).
 * Utilizes the PDF.js PageViewport transformation matrix to ensure stability across zoom,
 * fit-mode, rotation, and viewport scrolling.
 */
export function screenToPdfPoint(
  clientX: number,
  clientY: number,
  canvasEl: HTMLElement,
  viewport: PageViewport
): PdfPoint {
  const rect = canvasEl.getBoundingClientRect();
  const cssX = clientX - rect.left;
  const cssY = clientY - rect.top;

  // Use PDF.js PageViewport authoritative transform
  const [pdfX, pdfY] = viewport.convertToPdfPoint(cssX, cssY);

  // Convert bottom-left PDF coordinate to top-left coordinate for consistent state
  const pageHeight = viewport.viewBox[3] - viewport.viewBox[1];
  const topLeftY = pageHeight - pdfY;

  return {
    x: Math.round(pdfX * 100) / 100,
    y: Math.round(topLeftY * 100) / 100,
  };
}

/**
 * Converts PDF points (72 dpi, top-left origin) into canvas-relative screen CSS coordinates.
 */
export function pdfPointToScreen(
  pdfX: number,
  pdfY: number,
  viewport: PageViewport
): ScreenPoint {
  const pageHeight = viewport.viewBox[3] - viewport.viewBox[1];
  const standardPdfY = pageHeight - pdfY;
  const [cssX, cssY] = viewport.convertToViewportPoint(pdfX, standardPdfY);
  return {
    x: Math.round(cssX * 100) / 100,
    y: Math.round(cssY * 100) / 100,
  };
}

/**
 * Maps a PDF point bounding box to CSS pixel dimensions on the overlay layer.
 * Uses 4-corner projection to guarantee rotation invariance (0°, 90°, 180°, 270°).
 */
export function pdfRectToScreenRect(
  rect: PdfRect,
  viewport: PageViewport
): ScreenRect {
  const pageHeight = viewport.viewBox[3] - viewport.viewBox[1];
  const standardPdfY_top = pageHeight - rect.y;
  const standardPdfY_bottom = pageHeight - (rect.y + rect.height);

  const c1 = viewport.convertToViewportPoint(rect.x, standardPdfY_top);
  const c2 = viewport.convertToViewportPoint(rect.x + rect.width, standardPdfY_top);
  const c3 = viewport.convertToViewportPoint(rect.x, standardPdfY_bottom);
  const c4 = viewport.convertToViewportPoint(rect.x + rect.width, standardPdfY_bottom);

  const minX = Math.min(c1[0], c2[0], c3[0], c4[0]);
  const maxX = Math.max(c1[0], c2[0], c3[0], c4[0]);
  const minY = Math.min(c1[1], c2[1], c3[1], c4[1]);
  const maxY = Math.max(c1[1], c2[1], c3[1], c4[1]);

  return {
    left: Math.round(minX * 100) / 100,
    top: Math.round(minY * 100) / 100,
    width: Math.round((maxX - minX) * 100) / 100,
    height: Math.round((maxY - minY) * 100) / 100,
  };
}

/**
 * Maps screen CSS pixel bounds back to PDF points for newly created or transformed objects.
 * Uses 4-corner reverse projection to guarantee rotation invariance (0°, 90°, 180°, 270°).
 */
export function screenRectToPdfRect(
  screenRect: ScreenRect,
  viewport: PageViewport
): PdfRect {
  const pageHeight = viewport.viewBox[3] - viewport.viewBox[1];

  const corners = [
    viewport.convertToPdfPoint(screenRect.left, screenRect.top),
    viewport.convertToPdfPoint(screenRect.left + screenRect.width, screenRect.top),
    viewport.convertToPdfPoint(screenRect.left, screenRect.top + screenRect.height),
    viewport.convertToPdfPoint(screenRect.left + screenRect.width, screenRect.top + screenRect.height),
  ];

  const converted = corners.map(([pdfX, standardPdfY]) => ({
    x: pdfX,
    y: pageHeight - standardPdfY,
  }));

  const minX = Math.min(...converted.map((p) => p.x));
  const maxX = Math.max(...converted.map((p) => p.x));
  const minY = Math.min(...converted.map((p) => p.y));
  const maxY = Math.max(...converted.map((p) => p.y));

  return {
    x: Math.round(minX * 100) / 100,
    y: Math.round(minY * 100) / 100,
    width: Math.round((maxX - minX) * 100) / 100,
    height: Math.round((maxY - minY) * 100) / 100,
  };
}

/**
 * Inverts top-left PDF points into bottom-left coordinates required by pdf-lib drawing methods.
 */
export function pdfToPdfLibCoords(
  x: number,
  y: number,
  width: number,
  height: number,
  pageHeight: number
): { x: number; y: number; width: number; height: number } {
  return {
    x,
    y: pageHeight - y - height,
    width,
    height,
  };
}
