import type { PDFDocumentProxy, PageViewport, RenderTask } from 'pdfjs-dist';

export interface RenderOptions {
  scale: number;
  rotation?: number;
  onRenderSuccess?: () => void;
  onRenderError?: (error: any) => void;
}

export class PdfPageRenderer {
  private activeRenderTask: RenderTask | null = null;
  private currentRenderingPage: number | null = null;

  public cancelCurrentRender(): void {
    if (this.activeRenderTask) {
      try {
        this.activeRenderTask.cancel();
      } catch (e) {
        // Suppress cancellation exceptions
      }
      this.activeRenderTask = null;
      this.currentRenderingPage = null;
    }
  }

  public async renderPage(
    canvas: HTMLCanvasElement,
    docProxy: PDFDocumentProxy,
    pageNumber: number,
    options: RenderOptions
  ): Promise<PageViewport | null> {
    // Cancel any in-flight render task before starting a new one
    this.cancelCurrentRender();

    try {
      this.currentRenderingPage = pageNumber;
      const page = await docProxy.getPage(pageNumber);

      const rotation = options.rotation !== undefined ? options.rotation : page.rotate;
      const viewport = page.getViewport({ scale: options.scale, rotation });

      const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Could not obtain 2D canvas context');

      // Set internal bitmap resolution scaled by clamped DPR
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);

      // Set CSS dimensions to exact unscaled viewport size
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      ctx.save();
      ctx.scale(dpr, dpr);

      const renderContext = {
        canvasContext: ctx,
        viewport,
        enableWebGL: false,
      };

      const task = page.render(renderContext);
      this.activeRenderTask = task;

      await task.promise;
      ctx.restore();

      this.activeRenderTask = null;
      if (options.onRenderSuccess) options.onRenderSuccess();
      return viewport;
    } catch (err: any) {
      if (err?.name === 'RenderingCancelledException') {
        // Expected when user switches pages or zoom quickly
        return null;
      }
      console.error(`Render failed for page ${pageNumber}:`, err);
      if (options.onRenderError) options.onRenderError(err);
      throw err;
    }
  }
}

export const pdfRenderer = new PdfPageRenderer();
