import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}

export interface LoadedPdfDoc {
  docProxy: pdfjsLib.PDFDocumentProxy;
  pageCount: number;
  pristineBytes: ArrayBuffer;
  getPageDimensions(pageNum: number): Promise<{ width: number; height: number; rotation: number }>;
  destroy(): void;
}

export async function loadPdfDocumentManager(source: File | ArrayBuffer): Promise<LoadedPdfDoc> {
  let rawBuffer: ArrayBuffer;
  if (source instanceof File) {
    rawBuffer = await source.arrayBuffer();
  } else {
    rawBuffer = source;
  }

  // Preserve dedicated pristine clone strictly for pdf-lib export
  const pristineBytes = rawBuffer.slice(0);
  const workingBytes = new Uint8Array(rawBuffer.slice(0));

  const loadingTask = pdfjsLib.getDocument({
    data: workingBytes,
    useSystemFonts: true,
  });

  const docProxy = await loadingTask.promise;
  const dimensionCache = new Map<number, { width: number; height: number; rotation: number }>();

  return {
    docProxy,
    pageCount: docProxy.numPages,
    pristineBytes,
    async getPageDimensions(pageNum: number) {
      if (dimensionCache.has(pageNum)) {
        return dimensionCache.get(pageNum)!;
      }
      const page = await docProxy.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });
      const dims = {
        width: Math.round(viewport.width),
        height: Math.round(viewport.height),
        rotation: viewport.rotation,
      };
      dimensionCache.set(pageNum, dims);
      return dims;
    },
    destroy() {
      try {
        docProxy.destroy();
      } catch (e) {
        // Suppress cleanup errors
      }
      dimensionCache.clear();
    },
  };
}
