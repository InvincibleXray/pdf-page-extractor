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
 */
export function pdfRectToScreenRect(
  rect: PdfRect,
  viewport: PageViewport
): ScreenRect {
  const pt = pdfPointToScreen(rect.x, rect.y, viewport);
  const scale = viewport.scale;
  return {
    left: pt.x,
    top: pt.y,
    width: Math.round(rect.width * scale * 100) / 100,
    height: Math.round(rect.height * scale * 100) / 100,
  };
}

/**
 * Maps screen CSS pixel bounds back to PDF points for newly created or transformed objects.
 */
export function screenRectToPdfRect(
  screenRect: ScreenRect,
  viewport: PageViewport
): PdfRect {
  const scale = viewport.scale;
  const pageHeight = viewport.viewBox[3] - viewport.viewBox[1];
  const [pdfX, standardPdfY] = viewport.convertToPdfPoint(screenRect.left, screenRect.top);
  const topLeftY = pageHeight - standardPdfY;

  return {
    x: Math.round(pdfX * 100) / 100,
    y: Math.round(topLeftY * 100) / 100,
    width: Math.round((screenRect.width / scale) * 100) / 100,
    height: Math.round((screenRect.height / scale) * 100) / 100,
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
