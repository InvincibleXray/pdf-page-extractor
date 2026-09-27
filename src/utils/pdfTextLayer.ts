import { TextLayer, type PageViewport, type PDFPageProxy, type PDFDocumentProxy } from 'pdfjs-dist';
import { screenRectToPdfRect, type PdfRect } from './coordinateMapper';

export interface ExistingPdfTextItem {
  id: string; // e.g. "p1-t0"
  pageNumber: number;
  itemIndex: number;
  text: string;
  pdfBounds: PdfRect; // 72 dpi native PDF points (top-left origin)
  screenBounds: { left: number; top: number; width: number; height: number };
  fontSize: number; // approximate font size in PDF points
  fontFamily: string;
  fontWeight?: string;
  fontStyle?: string;
  color: string;
}

export class PdfTextLayerManager {
  private activeTextLayer: TextLayer | null = null;
  private currentTextMap: Map<string, ExistingPdfTextItem> = new Map();
  private currentPageNumber: number | null = null;

  /**
   * Cancels any active text layer rendering task.
   */
  public cancel(): void {
    if (this.activeTextLayer) {
      try {
        this.activeTextLayer.cancel();
      } catch (e) {
        // Suppress cancellation exceptions
      }
      this.activeTextLayer = null;
    }
  }

  /**
   * Cleans up text layer DOM elements and indexes.
   */
  public clear(container?: HTMLElement | null): void {
    this.cancel();
    if (container) {
      container.innerHTML = '';
    }
    this.currentTextMap.clear();
    this.currentPageNumber = null;
  }

  /**
   * Renders the PDF.js text layer into the container for the active visible page only.
   * Maps rendered span geometries back to authoritative PDF points.
   */
  public async renderTextLayer(
    container: HTMLElement,
    docOrPage: PDFDocumentProxy | PDFPageProxy,
    pageNumber: number,
    viewport: PageViewport
  ): Promise<Map<string, ExistingPdfTextItem>> {
    this.clear(container);
    this.currentPageNumber = pageNumber;

    try {
      const page = 'getPage' in docOrPage ? await docOrPage.getPage(pageNumber) : docOrPage;
      // 1. Fetch text content from PDF.js
      const textContent = await page.getTextContent();

      // 2. Set container dimensions to match viewport
      container.style.width = `${Math.floor(viewport.width)}px`;
      container.style.height = `${Math.floor(viewport.height)}px`;

      // 3. Instantiate and render TextLayer
      const textLayer = new TextLayer({
        textContentSource: textContent,
        container,
        viewport,
      });

      this.activeTextLayer = textLayer;
      await textLayer.render();

      // 4. Validate and index each rendered span against actual DOM geometry
      const containerRect = container.getBoundingClientRect();
      const spans = container.querySelectorAll<HTMLElement>('span');

      // Extract valid raw items from PDF.js textContent to cross-validate font metrics
      const rawTextItems = textContent.items.filter(
        (it: any) => 'str' in it && typeof it.str === 'string' && it.str.trim().length > 0
      );

      let itemCounter = 0;
      spans.forEach((span) => {
        const text = span.textContent?.trim();
        if (!text) return; // Skip empty spans or spacing artifacts

        const spanRect = span.getBoundingClientRect();
        if (spanRect.width <= 0 || spanRect.height <= 0) return;

        const screenLeft = Math.round((spanRect.left - containerRect.left) * 100) / 100;
        const screenTop = Math.round((spanRect.top - containerRect.top) * 100) / 100;
        const screenWidth = Math.round(spanRect.width * 100) / 100;
        const screenHeight = Math.round(spanRect.height * 100) / 100;

        // Convert DOM screen pixels back to authoritative PDF points
        const pdfBounds = screenRectToPdfRect(
          { left: screenLeft, top: screenTop, width: screenWidth, height: screenHeight },
          viewport
        );

        const id = `p${pageNumber}-t${itemCounter}`;
        span.setAttribute('data-text-id', id);
        span.setAttribute('data-page-number', String(pageNumber));
        span.setAttribute('data-item-index', String(itemCounter));

        // Infer approximate font size from computed style
        const computedStyle = window.getComputedStyle(span);
        const fontSizePx = parseFloat(computedStyle.fontSize) || 14;
        let fontSizePt = Math.round((fontSizePx / viewport.scale) * 10) / 10;

        // Cross-validate with authoritative PDF.js text item metrics
        const rawItem = rawTextItems[itemCounter] as any;
        let authoritativeWidth = pdfBounds.width;
        let authoritativeHeight = pdfBounds.height;

        // Extract font typography from PDF.js styles dictionary and page proxy
        let detectedFontFamily = 'Inter, Helvetica, Arial, sans-serif';
        let detectedFontWeight = 'normal';
        let detectedFontStyle = 'normal';

        const styleObj = (rawItem && rawItem.fontName && textContent.styles) ? (textContent.styles as any)[rawItem.fontName] : null;
        let commonFont: any = null;
        if (rawItem?.fontName && (page as any).commonObjs?.has?.(rawItem.fontName)) {
          try {
            commonFont = (page as any).commonObjs.get(rawItem.fontName);
          } catch (e) {}
        }

        const rawFontName = (commonFont?.name || commonFont?.loadedName || rawItem?.fontName || '').toLowerCase();
        const fallbackFamily = (commonFont?.fallbackName || styleObj?.fontFamily || '').toLowerCase();

        const isMono = commonFont?.isMonospace === true || fallbackFamily === 'monospace' || /courier|mono|consolas|menlo/i.test(rawFontName);
        const isSerif = commonFont?.isSerifFont === true || fallbackFamily === 'serif' || /times|georgia|garamond|minion|cambria|serif/i.test(rawFontName);
        const isBold = !!commonFont?.bold || /bold|black|heavy|700|800|900/i.test(rawFontName);
        const isItalic = !!commonFont?.italic || /italic|oblique/i.test(rawFontName);

        if (isMono) {
          detectedFontFamily = 'Courier New, Courier, monospace';
        } else if (isSerif) {
          detectedFontFamily = 'Times New Roman, Times, Georgia, serif';
        } else {
          detectedFontFamily = 'Inter, Helvetica, Arial, sans-serif';
        }

        if (isBold) detectedFontWeight = 'bold';
        if (isItalic) detectedFontStyle = 'italic';

        if (rawItem) {
          if (rawItem.width && rawItem.width > 0) {
            authoritativeWidth = Math.max(pdfBounds.width, rawItem.width);
          }
          if (rawItem.height && rawItem.height > 0) {
            authoritativeHeight = Math.max(pdfBounds.height, rawItem.height);
          }
          if (rawItem.transform && Array.isArray(rawItem.transform) && rawItem.transform.length >= 2) {
            const fontScale = Math.hypot(rawItem.transform[0], rawItem.transform[1]);
            if (fontScale > 0) {
              fontSizePt = Math.round(fontScale * 10) / 10;
              authoritativeHeight = Math.max(authoritativeHeight, fontSizePt);
            }
          }
        }

        const effectivePdfBounds = {
          x: pdfBounds.x,
          y: pdfBounds.y,
          width: Math.round(authoritativeWidth * 100) / 100,
          height: Math.round(authoritativeHeight * 100) / 100,
        };

        const effectiveScreenWidth = Math.round(effectivePdfBounds.width * viewport.scale * 100) / 100;
        const effectiveScreenHeight = Math.round(effectivePdfBounds.height * viewport.scale * 100) / 100;

        // Apply authoritative bounds and pointer-events to span
        span.style.width = `${effectiveScreenWidth}px`;
        span.style.height = `${effectiveScreenHeight}px`;
        span.style.pointerEvents = 'auto';

        const textItem: ExistingPdfTextItem = {
          id,
          pageNumber,
          itemIndex: itemCounter,
          text: span.textContent || '',
          pdfBounds: effectivePdfBounds,
          screenBounds: { left: screenLeft, top: screenTop, width: effectiveScreenWidth, height: effectiveScreenHeight },
          fontSize: fontSizePt,
          fontFamily: detectedFontFamily,
          fontWeight: detectedFontWeight,
          fontStyle: detectedFontStyle,
          color: '#0f172a',
        };

        this.currentTextMap.set(id, textItem);
        itemCounter++;
      });

      return this.currentTextMap;
    } catch (err: any) {
      if (err?.name === 'RenderingCancelledException') {
        return new Map();
      }
      console.warn(`TextLayer error on page ${pageNumber}:`, err);
      return new Map();
    }
  }

  public getTextItem(id: string): ExistingPdfTextItem | undefined {
    return this.currentTextMap.get(id);
  }

  public getAllTextItems(): ExistingPdfTextItem[] {
    return Array.from(this.currentTextMap.values());
  }

  public hideSpan(id: string, container: HTMLElement): void {
    const span = container.querySelector<HTMLElement>(`span[data-text-id="${id}"]`);
    if (span) {
      span.style.visibility = 'hidden';
    }
  }

  public unhideSpan(id: string, container: HTMLElement): void {
    const span = container.querySelector<HTMLElement>(`span[data-text-id="${id}"]`);
    if (span) {
      span.style.visibility = 'visible';
    }
  }
}

export const pdfTextLayerManager = new PdfTextLayerManager();
