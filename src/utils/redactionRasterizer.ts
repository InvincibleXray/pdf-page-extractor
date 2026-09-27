import type { PDFPageProxy, PageViewport } from 'pdfjs-dist';
import { pdfRectToScreenRect } from './coordinateMapper';
import type {
  RedactionEditorObject,
  EditorObject,
  PageState,
  TextReplacementEditorObject,
  PrivacyEditorObject,
} from './editorState';

export class RedactionRasterSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RedactionRasterSafetyError';
  }
}

export interface RasterRedactionResult {
  imageBytes: Uint8Array;
  format: 'png';
  width: number;
  height: number;
  scale: number;
  requestedDpi: number;
  actualDpiX: number;
  actualDpiY: number;
  pixelWidth: number;
  pixelHeight: number;
  pageWidth: number;
  pageHeight: number;
  memoryEstimate: number;
  reason?: string;
}

export interface RasterRedactorOptions {
  targetDpi?: number;
  maxPixels?: number;
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
 * High-Resolution Pixel Obliteration Rasterizer
 * 
 * Renders an affected PDF page at high DPI (default 300 DPI, memory-clamped)
 * and burns opaque redactions and replacements directly into the pixel bitmap.
 * The underlying text, vector paths, and original image XObjects on this page
 * are completely destroyed and replaced with a clean raster image.
 */
export async function renderSanitizedPageRaster(
  pageProxy: PDFPageProxy,
  pageState: PageState,
  redactions: RedactionEditorObject[],
  overlayObjects: EditorObject[] = [],
  options: RasterRedactorOptions = {}
): Promise<RasterRedactionResult> {
  const targetDpi = options.targetDpi || 300;
  const maxPixels = options.maxPixels || 16_000_000; // Hard 16 MP safety ceiling

  const requestedScale = targetDpi / 72; // ~4.1667 at 300 DPI
  const rotation = pageState.rotation !== undefined ? pageState.rotation : (pageProxy.rotate || 0);

  // Authoritative geometry pipeline:
  // PDF page -> actual rotation -> PDF.js PageViewport -> viewport dimensions -> raster pixel dimensions
  const baseViewport = pageProxy.getViewport({ scale: 1.0, rotation });
  const viewportWidth = baseViewport.width;
  const viewportHeight = baseViewport.height;

  // Maximum mathematically safe scale that strictly respects maxPixels
  const maxSafeScale = Math.sqrt(maxPixels / (viewportWidth * viewportHeight));
  let scale = Math.min(requestedScale, maxSafeScale);

  // Compute raster dimensions from the actual rotated viewport
  let viewport = pageProxy.getViewport({ scale, rotation });
  let width = Math.round(viewport.width);
  let height = Math.round(viewport.height);

  // After rounding dimensions: if width * height > maxPixels, reduce dimensions/scale again
  while (width * height > maxPixels && scale > 0.001) {
    scale *= 0.999;
    viewport = pageProxy.getViewport({ scale, rotation });
    width = Math.round(viewport.width);
    height = Math.round(viewport.height);
  }

  // HARD INVARIANT ASSERTION: pixelWidth * pixelHeight <= MAX_PIXELS (no exceptions)
  if (width * height > maxPixels) {
    throw new RedactionRasterSafetyError(
      `Raster pixel count (${width}x${height} = ${width * height} px) exceeds safety ceiling of ${maxPixels} px.`
    );
  }

  // Calculate actual effective DPI from actual rotated viewport dimensions
  const actualDpiX = (width / viewportWidth) * 72;
  const actualDpiY = (height / viewportHeight) * 72;
  const pixelWidth = width;
  const pixelHeight = height;
  const memoryEstimate = width * height * 4; // 4 bytes per RGBA pixel
  const isClamped = width * height >= maxPixels || scale < requestedScale - 0.01;
  const reason = isClamped ? '16 MP safety ceiling' : undefined;

  // Allocate canvas
  let canvas: HTMLCanvasElement;
  if (typeof document !== 'undefined' && document.createElement) {
    canvas = document.createElement('canvas');
  } else if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(width, height) as any;
  } else {
    throw new Error('Canvas environment not available for redaction rasterizer');
  }

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    throw new Error('Unable to create 2D canvas context for redaction rasterization');
  }

  // Fill canvas with white background before rendering PDF
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Render base PDF page
  const renderContext = {
    canvasContext: ctx as any,
    viewport,
    enableWebGL: false,
  };
  await pageProxy.render(renderContext).promise;

  // 1. Burn text-replacements and whiteouts that exist on this page
  for (const obj of overlayObjects) {
    if (obj.type === 'text-replacement') {
      const rep = obj as TextReplacementEditorObject;
      const screenRect = pdfRectToScreenRect(rep, viewport);
      ctx.fillStyle = rep.backgroundColor || '#ffffff';
      ctx.fillRect(screenRect.left, screenRect.top, screenRect.width, screenRect.height);

      if (rep.replacementText) {
        ctx.fillStyle = rep.color || '#000000';
        const fontPx = Math.max(8, Math.round(rep.fontSize * viewport.scale));
        ctx.font = `${rep.fontWeight === 'bold' ? 'bold ' : ''}${rep.fontStyle === 'italic' ? 'italic ' : ''}${fontPx}px ${rep.fontFamily || 'sans-serif'}`;
        ctx.textAlign = (rep.textAlign as CanvasTextAlign) || 'left';
        ctx.textBaseline = 'middle';
        const textX =
          rep.textAlign === 'center'
            ? screenRect.left + screenRect.width / 2
            : rep.textAlign === 'right'
            ? screenRect.left + screenRect.width - 2
            : screenRect.left + 2;
        ctx.fillText(rep.replacementText, textX, screenRect.top + screenRect.height / 2);
      }
    } else if (obj.type === 'whiteout') {
      const priv = obj as PrivacyEditorObject;
      const screenRect = pdfRectToScreenRect(priv, viewport);
      ctx.fillStyle = priv.fillColor || '#ffffff';
      ctx.fillRect(screenRect.left, screenRect.top, screenRect.width, screenRect.height);
    }
  }

  // 2. Burn opaque redactions directly into pixel buffer (True Irreversible Destruction)
  for (const redact of redactions) {
    const screenRect = pdfRectToScreenRect(redact, viewport);
    ctx.fillStyle = redact.fillColor || '#000000';
    ctx.fillRect(screenRect.left, screenRect.top, screenRect.width, screenRect.height);

    if (redact.overlayText && redact.overlayText.trim().length > 0) {
      ctx.fillStyle = redact.textColor || '#ffffff';
      const fontPt = redact.fontSize || 11;
      const fontPx = Math.max(10, Math.round(fontPt * (scale / 1.0)));
      ctx.font = `bold ${fontPx}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        redact.overlayText,
        screenRect.left + screenRect.width / 2,
        screenRect.top + screenRect.height / 2
      );
    }
  }

  // Extract clean image bytes
  let imageBytes: Uint8Array;
  if ('toBlob' in canvas && typeof canvas.toBlob === 'function') {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
    if (!blob) throw new Error('Failed to generate PNG blob from redaction canvas');
    imageBytes = new Uint8Array(await blob.arrayBuffer());
  } else if ('convertToBlob' in canvas && typeof (canvas as any).convertToBlob === 'function') {
    const blob = await (canvas as any).convertToBlob({ type: 'image/png' });
    imageBytes = new Uint8Array(await blob.arrayBuffer());
  } else if (canvas.toDataURL) {
    const dataUrl = canvas.toDataURL('image/png');
    imageBytes = dataUrlToBytes(dataUrl);
  } else {
    throw new Error('Canvas does not support raster image export');
  }

  // Clean up canvas memory
  canvas.width = 0;
  canvas.height = 0;

  return {
    imageBytes,
    format: 'png',
    width,
    height,
    scale,
    requestedDpi: targetDpi,
    actualDpiX,
    actualDpiY,
    pixelWidth,
    pixelHeight,
    pageWidth: viewportWidth,
    pageHeight: viewportHeight,
    memoryEstimate,
    reason,
  };
}

if (typeof window !== 'undefined') {
  (window as any).__REDACTION_RASTERIZER__ = {
    renderSanitizedPageRaster,
    RedactionRasterSafetyError,
  };
}
