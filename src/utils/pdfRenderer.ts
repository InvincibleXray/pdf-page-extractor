import type { PDFDocumentProxy, PageViewport, RenderTask } from 'pdfjs-dist';

export interface RenderOptions {
  scale: number;
  rotation?: number;
  onRenderSuccess?: () => void;
  onRenderError?: (error: any) => void;
}

export class PdfPageRenderer {
  private activeRenderTask: RenderTask | null = null;
  private activeRenderPromise: Promise<void> | null = null;
  private currentRenderingPage: number | null = null;

  public async cancelCurrentRender(): Promise<void> {
    if (this.activeRenderTask) {
      try {
        this.activeRenderTask.cancel();
      } catch (e) {
        // Suppress cancellation exceptions
      }
      if (this.activeRenderPromise) {
        try {
          await this.activeRenderPromise;
        } catch (e) {
          // Expected cancellation rejection
        }
      }
      this.activeRenderTask = null;
      this.activeRenderPromise = null;
      this.currentRenderingPage = null;
    }
  }

  public async renderPage(
    canvas: HTMLCanvasElement,
    docProxy: PDFDocumentProxy,
    pageNumber: number,
    options: RenderOptions
  ): Promise<PageViewport | null> {
    // Await cancellation of any in-flight task to ensure canvas is released cleanly
    await this.cancelCurrentRender();

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
      this.activeRenderPromise = task.promise;

      try {
        await task.promise;
      } finally {
        ctx.restore();
        if (this.activeRenderTask === task) {
          this.activeRenderTask = null;
          this.activeRenderPromise = null;
        }
      }

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
