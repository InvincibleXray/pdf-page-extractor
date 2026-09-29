import type { PageViewport } from 'pdfjs-dist';
import {
  editorStore,
  type EditorObject,
  type TextEditorObject,
  type TextReplacementEditorObject,
  type ShapeEditorObject,
  type AnnotationEditorObject,
  type PrivacyEditorObject,
  type RedactionEditorObject,
  type PenEditorObject,
  type EditorTool,
} from './editorState';
import {
  screenToPdfPoint,
  pdfPointToScreen,
  screenRectToPdfRect,
  pdfRectToScreenRect,
  type ScreenRect,
} from './coordinateMapper';
import { pdfTextLayerManager, type ExistingPdfTextItem } from './pdfTextLayer';
import { formStore, type FormFieldType } from './formState';

export class EditorInteractionController {
  private overlayEl: HTMLElement | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private textLayerEl: HTMLElement | null = null;
  private formLayerEl: HTMLElement | null = null;
  private selectionBoxEl: HTMLElement | null = null;
  private actionBarEl: HTMLElement | null = null;
  private lastSelectedScreenRect: { left: number; top: number; width: number; height: number } | null = null;
  private tempWhiteoutMaskEl: HTMLElement | null = null;
  private viewport: PageViewport | null = null;

  // Active interaction state
  private isInteracting = false;
  private interactionMode: 'idle' | 'create-shape' | 'draw-pen' | 'move-object' | 'resize-object' | 'create-form' | 'move-form' | 'resize-form' = 'idle';
  private startPointer = { x: 0, y: 0 };
  private startObjectBounds = { x: 0, y: 0, width: 0, height: 0 };
  private startFormBounds: [number, number, number, number] = [0, 0, 0, 0];
  private activeResizeHandle: string | null = null;
  private penPoints: { x: number; y: number }[] = [];
  private ghostEl: HTMLElement | null = null;
  private activeInlineEditor: HTMLElement | null = null;
  private textPlacementPreviewEl: HTMLElement | null = null;
  private lastPointerPos = { x: 120, y: 120 };
  private unsubscribeStore: (() => void) | null = null;
  private lastClickObjectId: string | null = null;
  private lastClickTime = 0;
  private lastActionBarDismissTime = 0;

  // Touch foundation & pointer capture state
  private activePointerId: number | null = null;
  private capturedPointerTarget: HTMLElement | null = null;
  private startScroll = { left: 0, top: 0 };

  // Bound event listeners
  private boundPointerDown: (e: PointerEvent) => void;
  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerUp: (e: PointerEvent) => void;
  private boundPointerCancel: (e: PointerEvent) => void;
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundDblClick: (e: MouseEvent) => void;
  private boundTextLayerPointerDown: (e: PointerEvent) => void;

  constructor() {
    this.boundPointerDown = this.handlePointerDown.bind(this);
    this.boundPointerMove = this.handlePointerMove.bind(this);
    this.boundPointerUp = this.handlePointerUp.bind(this);
    this.boundPointerCancel = this.handlePointerCancel.bind(this);
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundDblClick = this.handleDblClick.bind(this);
    this.boundTextLayerPointerDown = this.handleTextLayerPointerDown.bind(this);
  }

  public attach(
    overlayEl: HTMLElement,
    canvasEl: HTMLCanvasElement,
    textLayerEl?: HTMLElement | null,
    actionBarEl?: HTMLElement | null,
    formLayerEl?: HTMLElement | null,
    selectionBoxEl?: HTMLElement | null
  ): void {
    this.overlayEl = overlayEl;
    this.canvasEl = canvasEl;
    this.textLayerEl = textLayerEl || null;
    this.actionBarEl = actionBarEl || null;
    this.formLayerEl = formLayerEl || null;
    this.selectionBoxEl = selectionBoxEl || null;

    this.overlayEl.addEventListener('pointerdown', this.boundPointerDown);
    this.overlayEl.addEventListener('dblclick', this.boundDblClick);
    this.canvasEl.addEventListener('pointerdown', this.boundPointerDown);
    if (this.textLayerEl) {
      this.textLayerEl.addEventListener('pointerdown', this.boundTextLayerPointerDown);
    }
    if (this.formLayerEl) {
      this.formLayerEl.addEventListener('pointerdown', this.boundPointerDown);
    }
    if (this.selectionBoxEl) {
      this.selectionBoxEl.addEventListener('pointerdown', this.boundPointerDown);
      this.selectionBoxEl.addEventListener('dblclick', this.boundDblClick);
    }

    if (this.actionBarEl) {
      this.actionBarEl.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
      });
      this.actionBarEl.addEventListener('pointerup', (e) => {
        e.stopPropagation();
      });

      const editBtn = this.actionBarEl.querySelector('#edit-existing-text-btn');
      if (editBtn) {
        editBtn.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
        });
        editBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const selectedTextId = editorStore.getSelectedExistingTextId();
          if (selectedTextId) {
            const item = pdfTextLayerManager.getTextItem(selectedTextId);
            if (item) {
              const span = this.textLayerEl ? this.textLayerEl.querySelector<HTMLElement>(`span[data-text-id="${selectedTextId}"]`) : null;
              this.startEditingExistingText(item, span);
              return;
            }
          }
          const obj = editorStore.getSelectedObject();
          if (obj && (obj.type === 'text' || obj.type === 'text-replacement')) {
            this.openInlineTextEditor(obj as any);
            return;
          }
        });
      }

      const underlineBtn = this.actionBarEl.querySelector('#underline-existing-text-btn');
      if (underlineBtn) {
        underlineBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
        underlineBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const selectedTextId = editorStore.getSelectedExistingTextId();
          if (selectedTextId) {
            const item = pdfTextLayerManager.getTextItem(selectedTextId);
            if (item) this.underlineExistingText(item);
          }
        });
      }

      const strikeBtn = this.actionBarEl.querySelector('#strikethrough-existing-text-btn');
      if (strikeBtn) {
        strikeBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
        strikeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const selectedTextId = editorStore.getSelectedExistingTextId();
          if (selectedTextId) {
            const item = pdfTextLayerManager.getTextItem(selectedTextId);
            if (item) this.strikethroughExistingText(item);
          }
        });
      }

      const redactBtn = this.actionBarEl.querySelector('#redact-existing-text-btn');
      if (redactBtn) {
        redactBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
        redactBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const selectedTextId = editorStore.getSelectedExistingTextId();
          if (selectedTextId) {
            const item = pdfTextLayerManager.getTextItem(selectedTextId);
            if (item) this.redactExistingText(item);
          }
        });
      }
    }

    // Subscribe to tool changes for instant placement affordance
    this.unsubscribeStore = editorStore.subscribe((state) => {
      if (state.activeTool === 'text') {
        if (!this.activeInlineEditor) {
          this.initTextPlacementPreview();
        }
      } else {
        this.hideTextPlacementPreview();
      }
    });

    window.addEventListener('pointermove', this.boundPointerMove);
    window.addEventListener('pointerup', this.boundPointerUp);
    window.addEventListener('pointercancel', this.boundPointerCancel);
    window.addEventListener('keydown', this.boundKeyDown);
  }

  public detach(): void {
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
    if (this.overlayEl) {
      this.overlayEl.removeEventListener('pointerdown', this.boundPointerDown);
      this.overlayEl.removeEventListener('dblclick', this.boundDblClick);
    }
    if (this.canvasEl) {
      this.canvasEl.removeEventListener('pointerdown', this.boundPointerDown);
    }
    if (this.textLayerEl) {
      this.textLayerEl.removeEventListener('pointerdown', this.boundTextLayerPointerDown);
    }
    if (this.formLayerEl) {
      this.formLayerEl.removeEventListener('pointerdown', this.boundPointerDown);
    }
    if (this.selectionBoxEl) {
      this.selectionBoxEl.removeEventListener('pointerdown', this.boundPointerDown);
      this.selectionBoxEl.removeEventListener('dblclick', this.boundDblClick);
    }
    window.removeEventListener('pointermove', this.boundPointerMove);
    window.removeEventListener('pointerup', this.boundPointerUp);
    window.removeEventListener('pointercancel', this.boundPointerCancel);
    window.removeEventListener('keydown', this.boundKeyDown);
    this.releaseActivePointerCapture();
    this.lockViewportScrolling(false);
    this.cleanupInlineEditor();
    this.cleanupGhost();
    this.hideTextPlacementPreview();
    this.hideExistingTextActionBar();
  }

  private lockViewportScrolling(lock: boolean): void {
    const vp = document.getElementById('editor-viewport');
    if (!vp) return;
    if (lock) {
      vp.style.touchAction = 'none';
    } else {
      vp.style.touchAction = '';
    }
  }

  private acquirePointerCapture(target: HTMLElement | null, pointerId: number): void {
    if (!target) return;
    try {
      target.setPointerCapture(pointerId);
      this.activePointerId = pointerId;
      this.capturedPointerTarget = target;
    } catch (err) {}
  }

  private releaseActivePointerCapture(): void {
    if (this.activePointerId !== null && this.capturedPointerTarget) {
      try {
        if (this.capturedPointerTarget.hasPointerCapture(this.activePointerId)) {
          this.capturedPointerTarget.releasePointerCapture(this.activePointerId);
        }
      } catch (err) {}
    }
    this.activePointerId = null;
    this.capturedPointerTarget = null;
  }

  private handlePointerCancel(e: PointerEvent): void {
    if (this.isInteracting) {
      if (
        this.interactionMode === 'create-shape' ||
        this.interactionMode === 'draw-pen' ||
        this.interactionMode === 'create-form'
      ) {
        this.cleanupGhost();
        this.penPoints = [];
      }
      this.releaseActivePointerCapture();
      this.lockViewportScrolling(false);
      this.setActionBarInteractivity(true);
      this.isInteracting = false;
      this.interactionMode = 'idle';
      this.activeResizeHandle = null;
    }
  }

  public setViewport(viewport: PageViewport): void {
    this.viewport = viewport;
  }

  public initTextPlacementPreview(): void {
    if (!this.overlayEl) return;
    this.hideTextPlacementPreview();

    const preview = document.createElement('div');
    preview.id = 'text-placement-preview';
    preview.className = 'absolute pointer-events-none z-40 select-none transition-opacity duration-150';
    preview.style.pointerEvents = 'none';

    // Position at last known pointer pos or top-left center
    const overlayRect = this.overlayEl.getBoundingClientRect();
    const initX = Math.min(Math.max(20, this.lastPointerPos.x), Math.max(20, overlayRect.width - 160));
    const initY = Math.min(Math.max(20, this.lastPointerPos.y), Math.max(20, overlayRect.height - 50));
    preview.style.left = `${Math.round(initX)}px`;
    preview.style.top = `${Math.round(initY)}px`;

    preview.innerHTML = `
      <div class="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/15 dark:bg-blue-400/20 border-2 border-dashed border-blue-500 dark:border-blue-400 rounded-xl shadow-md text-blue-700 dark:text-blue-300 text-xs font-semibold backdrop-blur-xs select-none">
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
        <span id="text-placement-preview-label">Click to place text</span>
      </div>
    `;

    this.overlayEl.appendChild(preview);
    this.textPlacementPreviewEl = preview;
  }

  public showTextPlacementPreview(x: number, y: number): void {
    if (!this.textPlacementPreviewEl) {
      this.initTextPlacementPreview();
    }
    if (this.textPlacementPreviewEl) {
      this.textPlacementPreviewEl.style.left = `${Math.round(x + 12)}px`;
      this.textPlacementPreviewEl.style.top = `${Math.round(y + 12)}px`;
      this.textPlacementPreviewEl.style.opacity = '1';
    }
  }

  public hideTextPlacementPreview(): void {
    if (this.textPlacementPreviewEl && this.textPlacementPreviewEl.parentElement) {
      this.textPlacementPreviewEl.parentElement.removeChild(this.textPlacementPreviewEl);
    }
    this.textPlacementPreviewEl = null;
  }

  public setActionBarInteractivity(active: boolean): void {
    if (!this.actionBarEl) return;
    if (active) {
      this.actionBarEl.style.pointerEvents = 'auto';
      this.actionBarEl.style.opacity = '1';
    } else {
      this.actionBarEl.style.pointerEvents = 'none';
      this.actionBarEl.style.opacity = '0.25';
    }
  }

  public repositionCurrentActionBar(): void {
    if (!this.actionBarEl || this.actionBarEl.classList.contains('hidden')) return;
    const selected = editorStore.getSelectedObject();
    if (selected && (selected.type === 'text' || selected.type === 'text-replacement') && this.viewport) {
      const screenRect = pdfRectToScreenRect(selected, this.viewport);
      this.positionActionBar(screenRect);
      return;
    }
    const selectedExistingTextId = editorStore.getSelectedExistingTextId();
    if (selectedExistingTextId && this.viewport) {
      const item = pdfTextLayerManager.getTextItem(selectedExistingTextId);
      if (item) {
        const screenRect = pdfRectToScreenRect(item.pdfBounds, this.viewport);
        this.positionActionBar(screenRect);
        return;
      }
    }
    if (this.lastSelectedScreenRect) {
      this.positionActionBar(this.lastSelectedScreenRect);
    }
  }

  public positionActionBar(screenRect: { left: number; top: number; width: number; height: number }): void {
    if (!this.actionBarEl || !this.overlayEl) return;
    this.lastSelectedScreenRect = { ...screenRect };
    this.actionBarEl.classList.remove('hidden');

    const overlayRect = this.overlayEl.getBoundingClientRect();
    const barWidth = Math.min(this.actionBarEl.offsetWidth || 280, Math.max(160, overlayRect.width - 16));
    const barHeight = this.actionBarEl.offsetHeight || 38;

    // Detect touch / coarse input mode
    const isTouch =
      typeof window !== 'undefined' &&
      (('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches));

    // Clearances and protected region around selection
    // Top requires extra clearance to not overlap the selectionBox rotation stem (-24px)
    const marginAbove = isTouch ? 36 : 28;
    const marginBelow = isTouch ? 18 : 10;
    const marginSide = isTouch ? 18 : 10;

    const protTop = screenRect.top - (isTouch ? 32 : 24);
    const protBottom = screenRect.top + screenRect.height + (isTouch ? 14 : 8);
    const protLeft = screenRect.left - (isTouch ? 14 : 8);
    const protRight = screenRect.left + screenRect.width + (isTouch ? 14 : 8);

    const collidesWithProtected = (cLeft: number, cTop: number): boolean => {
      const cRight = cLeft + barWidth;
      const cBottom = cTop + barHeight;
      return !(
        cRight <= protLeft ||
        cLeft >= protRight ||
        cBottom <= protTop ||
        cTop >= protBottom
      );
    };

    // Calculate viewport & visual viewport boundaries in overlay coordinate space
    const viewportEl = document.getElementById('editor-viewport');
    const vpRect = viewportEl
      ? viewportEl.getBoundingClientRect()
      : { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth, width: window.innerWidth, height: window.innerHeight };

    const vv = typeof window !== 'undefined' && window.visualViewport ? window.visualViewport : null;
    const vvTop = vv ? vv.offsetTop : 0;
    const vvBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;

    let visibleClientTop = Math.max(vpRect.top + 8, vvTop + 8);
    let visibleClientBottom = Math.min(vpRect.bottom - 8, vvBottom - 8);

    // Factor in fixed overlapping elements: bottom floating bar and mobile nav
    const bottomBar = document.querySelector('#zoom-in-btn')?.closest('[role="toolbar"]');
    const bottomBarRect = bottomBar ? bottomBar.getBoundingClientRect() : null;
    if (bottomBarRect && bottomBarRect.top > visibleClientTop + 60 && bottomBarRect.top < visibleClientBottom) {
      visibleClientBottom = bottomBarRect.top - 8;
    }

    const mobileNav = document.getElementById('mobile-open-pages-btn')?.parentElement;
    const mobileNavRect = (mobileNav && mobileNav.offsetParent !== null) ? mobileNav.getBoundingClientRect() : null;
    if (mobileNavRect && mobileNavRect.top > visibleClientTop + 60 && mobileNavRect.top < visibleClientBottom) {
      visibleClientBottom = mobileNavRect.top - 8;
    }

    const visibleClientLeft = Math.max(vpRect.left + 8, vv ? vv.offsetLeft + 8 : 8);
    const visibleClientRight = Math.min(vpRect.right - 8, vv ? vv.offsetLeft + vv.width - 8 : window.innerWidth - 8);

    // Transform visible client constraints into overlay coordinates
    let minOverlayY = Math.max(8, visibleClientTop - overlayRect.top);
    let maxOverlayY = Math.min(overlayRect.height - barHeight - 8, visibleClientBottom - overlayRect.top - barHeight);
    let minOverlayX = Math.max(8, visibleClientLeft - overlayRect.left);
    let maxOverlayX = Math.min(overlayRect.width - barWidth - 8, visibleClientRight - overlayRect.left - barWidth);

    // If overlay is scrolled/zoomed such that constraints are inverted, relax to page card boundaries
    if (maxOverlayY < minOverlayY) {
      minOverlayY = 8;
      maxOverlayY = Math.max(8, overlayRect.height - barHeight - 8);
    }
    if (maxOverlayX < minOverlayX) {
      minOverlayX = 8;
      maxOverlayX = Math.max(8, overlayRect.width - barWidth - 8);
    }

    let finalLeft = 8;
    let finalTop = 8;
    let chosenPlacement = 'above';

    // 1. Candidate 1: ABOVE SELECTION
    const topAbove = screenRect.top - barHeight - marginAbove;
    let leftAbove = screenRect.left + (screenRect.width - barWidth) / 2;
    leftAbove = Math.max(minOverlayX, Math.min(leftAbove, maxOverlayX));
    const fitsAbove = topAbove >= minOverlayY && topAbove >= 8 && !collidesWithProtected(leftAbove, topAbove);

    // 2. Candidate 2: BELOW SELECTION
    const topBelow = screenRect.top + screenRect.height + marginBelow;
    let leftBelow = screenRect.left + (screenRect.width - barWidth) / 2;
    leftBelow = Math.max(minOverlayX, Math.min(leftBelow, maxOverlayX));
    const fitsBelow = topBelow <= maxOverlayY && topBelow + barHeight <= overlayRect.height - 8 && !collidesWithProtected(leftBelow, topBelow);

    // 3. Candidate 3: LEFT SIDE OF SELECTION
    const leftSide = screenRect.left - barWidth - marginSide;
    let topSide = screenRect.top + (screenRect.height - barHeight) / 2;
    topSide = Math.max(minOverlayY, Math.min(topSide, maxOverlayY));
    const fitsLeft = leftSide >= minOverlayX && leftSide >= 8 && !collidesWithProtected(leftSide, topSide);

    // 4. Candidate 4: RIGHT SIDE OF SELECTION
    const rightSide = screenRect.left + screenRect.width + marginSide;
    let topSideRight = screenRect.top + (screenRect.height - barHeight) / 2;
    topSideRight = Math.max(minOverlayY, Math.min(topSideRight, maxOverlayY));
    const fitsRight = rightSide <= maxOverlayX && rightSide + barWidth <= overlayRect.width - 8 && !collidesWithProtected(rightSide, topSideRight);

    if (fitsAbove) {
      finalLeft = leftAbove;
      finalTop = topAbove;
      chosenPlacement = 'above';
    } else if (fitsBelow) {
      finalLeft = leftBelow;
      finalTop = topBelow;
      chosenPlacement = 'below';
    } else if (fitsLeft) {
      finalLeft = leftSide;
      finalTop = topSide;
      chosenPlacement = 'left';
    } else if (fitsRight) {
      finalLeft = rightSide;
      finalTop = topSideRight;
      chosenPlacement = 'right';
    } else {
      // 5. Candidate 5: SAFE VIEWPORT FALLBACK
      // Determine if object is located more in upper or lower half of available space
      const objCenterY = screenRect.top + screenRect.height / 2;
      const overlayCenterY = (minOverlayY + maxOverlayY) / 2;
      let fallbackTop = objCenterY > overlayCenterY ? minOverlayY : maxOverlayY;
      let fallbackLeft = Math.max(minOverlayX, Math.min((overlayRect.width - barWidth) / 2, maxOverlayX));

      // Verify no collision with protected zone
      if (collidesWithProtected(fallbackLeft, fallbackTop)) {
        // Try opposite edge
        const alternateTop = fallbackTop === minOverlayY ? maxOverlayY : minOverlayY;
        if (!collidesWithProtected(fallbackLeft, alternateTop)) {
          fallbackTop = alternateTop;
        } else {
          // If still colliding, shift horizontally to left or right margin
          if (!collidesWithProtected(minOverlayX, fallbackTop)) {
            fallbackLeft = minOverlayX;
          } else if (!collidesWithProtected(maxOverlayX, fallbackTop)) {
            fallbackLeft = maxOverlayX;
          }
        }
      }

      finalLeft = fallbackLeft;
      finalTop = fallbackTop;
      chosenPlacement = fallbackTop === minOverlayY ? 'fallback-top' : 'fallback-bottom';
    }

    // Strict boundary clamping guarantees no document overflow
    finalLeft = Math.max(8, Math.min(finalLeft, overlayRect.width - barWidth - 8));
    finalTop = Math.max(8, Math.min(finalTop, overlayRect.height - barHeight - 8));

    this.actionBarEl.style.top = `${Math.round(finalTop)}px`;
    this.actionBarEl.style.left = `${Math.round(finalLeft)}px`;
    this.actionBarEl.setAttribute('data-placement', chosenPlacement);
  }

  private handlePointerDown(e: PointerEvent): void {
    if (!this.overlayEl || !this.canvasEl || !this.viewport) return;
    if (e.button !== 0) return; // Main left click only

    const target = e.target as HTMLElement;

    // Suppress fall-through compatibility clicks immediately following action bar dismissal on empty canvas/overlay
    const isInteractiveTarget = !!(
      target.closest('[data-object-id]') ||
      target.closest('[data-widget-id]') ||
      target.closest('[data-handle]') ||
      target.closest('[data-form-handle]')
    );
    if (!isInteractiveTarget && Date.now() - this.lastActionBarDismissTime < 350) {
      return;
    }

    // Ignore clicks inside active in-situ text editor or its pill
    if (this.activeInlineEditor && (this.activeInlineEditor.contains(target) || target.closest('#active-inline-text-popover'))) {
      return;
    }
    if (target.closest('#insitu-editor-pill')) {
      return;
    }
    // Ignore clicks inside active action bar
    if (this.actionBarEl && (this.actionBarEl.contains(target) || target.closest('#existing-text-action-bar'))) {
      return;
    }

    // Check if clicking on form resize handles
    const formHandleEl = target.closest('[data-form-handle]') as HTMLElement | null;
    if (formHandleEl) {
      const handle = formHandleEl.getAttribute('data-form-handle');
      const selWidgetId = formStore.getSelectedWidgetId();
      const widget = selWidgetId ? formStore.getWidget(selWidgetId) : null;
      if (widget && handle) {
        e.preventDefault();
        e.stopPropagation();
        const viewportEl = document.getElementById('editor-viewport');
        this.startScroll = {
          left: viewportEl ? viewportEl.scrollLeft : 0,
          top: viewportEl ? viewportEl.scrollTop : 0,
        };
        this.lockViewportScrolling(true);
        this.acquirePointerCapture(target, e.pointerId);
        this.isInteracting = true;
        this.interactionMode = 'resize-form';
        this.activeResizeHandle = handle;
        this.startPointer = { x: e.clientX, y: e.clientY };
        this.startFormBounds = [...widget.pdfRect] as [number, number, number, number];
        return;
      }
    }

    // Check if clicking on editor object resize handles
    const handleEl = target.closest('[data-handle]') as HTMLElement | null;
    if (handleEl) {
      const handle = handleEl.getAttribute('data-handle');
      const selected = editorStore.getSelectedObject();
      if (selected && handle) {
        e.preventDefault();
        e.stopPropagation();
        const viewportEl = document.getElementById('editor-viewport');
        this.startScroll = {
          left: viewportEl ? viewportEl.scrollLeft : 0,
          top: viewportEl ? viewportEl.scrollTop : 0,
        };
        this.lockViewportScrolling(true);
        this.acquirePointerCapture(target, e.pointerId);
        this.isInteracting = true;
        this.interactionMode = 'resize-object';
        this.activeResizeHandle = handle;
        this.startPointer = { x: e.clientX, y: e.clientY };
        this.startObjectBounds = { ...selected };
        this.setActionBarInteractivity(false);
        return;
      }
    }

    const state = editorStore.getState();
    const activeTool = state.activeTool;

    // Check if clicking on form widget in Author Mode
    const formWidgetEl = target.closest('.pdf-form-widget-wrapper') as HTMLElement | null;
    if (formWidgetEl && (formStore.isAuthorModeActive() || activeTool.startsWith('form-'))) {
      const widgetId = formWidgetEl.getAttribute('data-widget-id');
      if (widgetId) {
        e.preventDefault();
        e.stopPropagation();
        formStore.selectWidget(widgetId);
        const widget = formStore.getWidget(widgetId);
        if (widget) {
          const viewportEl = document.getElementById('editor-viewport');
          this.startScroll = {
            left: viewportEl ? viewportEl.scrollLeft : 0,
            top: viewportEl ? viewportEl.scrollTop : 0,
          };
          this.lockViewportScrolling(true);
          this.acquirePointerCapture(target, e.pointerId);
          this.isInteracting = true;
          this.interactionMode = 'move-form';
          this.startPointer = { x: e.clientX, y: e.clientY };
          this.startFormBounds = [...widget.pdfRect] as [number, number, number, number];
          return;
        }
      }
    }

    let objectEl = target.closest('[data-object-id]') as HTMLElement | null;
    let targetObjectId = objectEl ? objectEl.getAttribute('data-object-id') : null;
    if (!targetObjectId) {
      const selected = editorStore.getSelectedObject();
      if (selected && target.closest('#selection-bounding-box')) {
        targetObjectId = selected.id;
        objectEl = document.getElementById(`obj-${selected.id}`);
      }
    }
    const now = Date.now();

    // Double click on text or text-replacement object opens inline editor
    const isDouble = targetObjectId && (e.detail === 2 || (this.lastClickObjectId === targetObjectId && (now - this.lastClickTime < 500)));
    if (targetObjectId && isDouble) {
      const obj = state.objects.find((o) => o.id === targetObjectId);
      if (obj && (obj.type === 'text' || obj.type === 'text-replacement')) {
        e.preventDefault();
        e.stopPropagation();
        this.lastClickObjectId = null;
        this.lastClickTime = 0;
        this.openInlineTextEditor(obj as TextEditorObject | TextReplacementEditorObject);
        return;
      }
    }
    if (targetObjectId) {
      this.lastClickObjectId = targetObjectId;
      this.lastClickTime = now;
    } else {
      this.lastClickObjectId = null;
      this.lastClickTime = 0;
    }

    // If clicking on an existing object when in select mode
    if (objectEl && activeTool === 'select') {
      const id = objectEl.getAttribute('data-object-id');
      if (id) {
        editorStore.selectObject(id);
        const selected = editorStore.getSelectedObject();
        if (selected) {
          if (selected.type === 'text' || selected.type === 'text-replacement') {
            if (this.viewport) {
              let screenRect: ScreenRect;
              if (objectEl && this.overlayEl) {
                const objRect = objectEl.getBoundingClientRect();
                const overlayRect = this.overlayEl.getBoundingClientRect();
                screenRect = {
                  left: Math.round((objRect.left - overlayRect.left) * 100) / 100,
                  top: Math.round((objRect.top - overlayRect.top) * 100) / 100,
                  width: Math.round(objRect.width * 100) / 100,
                  height: Math.round(objRect.height * 100) / 100,
                };
              } else {
                screenRect = pdfRectToScreenRect(selected, this.viewport);
              }
              this.positionActionBar(screenRect);
            }
          } else {
            this.hideExistingTextActionBar();
          }
          e.preventDefault();
          const viewportEl = document.getElementById('editor-viewport');
          this.startScroll = {
            left: viewportEl ? viewportEl.scrollLeft : 0,
            top: viewportEl ? viewportEl.scrollTop : 0,
          };
          this.lockViewportScrolling(true);
          this.acquirePointerCapture(target, e.pointerId);
          this.isInteracting = true;
          this.interactionMode = 'move-object';
          this.startPointer = { x: e.clientX, y: e.clientY };
          this.startObjectBounds = { ...selected };
          this.setActionBarInteractivity(false);
          return;
        }
      }
    }

    // Form authoring drag-to-create tools
    if (activeTool.startsWith('form-')) {
      e.preventDefault();
      const viewportEl = document.getElementById('editor-viewport');
      this.startScroll = {
        left: viewportEl ? viewportEl.scrollLeft : 0,
        top: viewportEl ? viewportEl.scrollTop : 0,
      };
      this.lockViewportScrolling(true);
      this.acquirePointerCapture(target, e.pointerId);
      this.isInteracting = true;
      this.interactionMode = 'create-form';
      const canvasRect = this.canvasEl.getBoundingClientRect();
      this.startPointer = {
        x: e.clientX - canvasRect.left,
        y: e.clientY - canvasRect.top,
      };
      this.initGhost(activeTool);
      return;
    }

    // Text tool: click-to-type lifecycle
    if (activeTool === 'text') {
      e.preventDefault();
      this.hideTextPlacementPreview();
      this.createInlineTextEditorAt(e.clientX, e.clientY);
      return;
    }

    // Comment tool: click-to-place sticky comment note
    if (activeTool === 'comment') {
      e.preventDefault();
      this.createCommentAt(e.clientX, e.clientY);
      return;
    }

    // Shapes & Annotation lines creation: drag-to-create
    if (
      activeTool === 'rectangle' ||
      activeTool === 'ellipse' ||
      activeTool === 'line' ||
      activeTool === 'arrow' ||
      activeTool === 'whiteout' ||
      activeTool === 'redact' ||
      activeTool === 'highlight' ||
      activeTool === 'underline' ||
      activeTool === 'strikethrough'
    ) {
      e.preventDefault();
      const viewportEl = document.getElementById('editor-viewport');
      this.startScroll = {
        left: viewportEl ? viewportEl.scrollLeft : 0,
        top: viewportEl ? viewportEl.scrollTop : 0,
      };
      this.lockViewportScrolling(true);
      this.acquirePointerCapture(target, e.pointerId);
      this.isInteracting = true;
      this.interactionMode = 'create-shape';
      const canvasRect = this.canvasEl.getBoundingClientRect();
      this.startPointer = {
        x: e.clientX - canvasRect.left,
        y: e.clientY - canvasRect.top,
      };
      this.initGhost(activeTool);
      return;
    }

    // Pen tool: freehand drawing
    if (activeTool === 'pen') {
      e.preventDefault();
      const viewportEl = document.getElementById('editor-viewport');
      this.startScroll = {
        left: viewportEl ? viewportEl.scrollLeft : 0,
        top: viewportEl ? viewportEl.scrollTop : 0,
      };
      this.lockViewportScrolling(true);
      this.acquirePointerCapture(target, e.pointerId);
      this.isInteracting = true;
      this.interactionMode = 'draw-pen';
      const canvasRect = this.canvasEl.getBoundingClientRect();
      const pt = {
        x: e.clientX - canvasRect.left,
        y: e.clientY - canvasRect.top,
      };
      this.penPoints = [pt];
      this.initGhost('pen');
      return;
    }

    // Deselect if clicking on empty overlay
    if (activeTool === 'select' && !objectEl && !formWidgetEl && !target.closest('#existing-text-action-bar')) {
      this.hideExistingTextActionBar();
      editorStore.selectExistingText(null);
      editorStore.selectObject(null);
      if (formStore.isAuthorModeActive()) {
        formStore.selectWidget(null);
      }
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    this.lastPointerPos = { x: e.clientX, y: e.clientY };

    // Text tool: smooth cursor-following placement preview without blocking events
    const state = editorStore.getState();
    if (state.activeTool === 'text' && !this.activeInlineEditor && this.overlayEl) {
      const overlayRect = this.overlayEl.getBoundingClientRect();
      const x = e.clientX - overlayRect.left;
      const y = e.clientY - overlayRect.top;
      if (x >= -40 && x <= overlayRect.width + 40 && y >= -40 && y <= overlayRect.height + 40) {
        this.showTextPlacementPreview(x, y);
      } else {
        if (this.textPlacementPreviewEl) {
          this.textPlacementPreviewEl.style.opacity = '0';
        }
      }
    }

    if (!this.isInteracting || !this.overlayEl || !this.canvasEl || !this.viewport) return;

    const canvasRect = this.canvasEl.getBoundingClientRect();
    const curCssX = e.clientX - canvasRect.left;
    const curCssY = e.clientY - canvasRect.top;

    if ((this.interactionMode === 'create-shape' || this.interactionMode === 'create-form') && this.ghostEl) {
      const left = Math.min(this.startPointer.x, curCssX);
      const top = Math.min(this.startPointer.y, curCssY);
      const width = Math.abs(curCssX - this.startPointer.x);
      const height = Math.abs(curCssY - this.startPointer.y);

      this.ghostEl.style.left = `${left}px`;
      this.ghostEl.style.top = `${top}px`;
      this.ghostEl.style.width = `${width}px`;
      this.ghostEl.style.height = `${height}px`;
      return;
    }

    if (this.interactionMode === 'draw-pen' && this.ghostEl) {
      this.penPoints.push({ x: curCssX, y: curCssY });
      this.updateGhostPenPath();
      return;
    }

    if (this.interactionMode === 'move-form') {
      const selWidgetId = formStore.getSelectedWidgetId();
      if (!selWidgetId) return;

      const viewportEl = document.getElementById('editor-viewport');
      const currentScrollLeft = viewportEl ? viewportEl.scrollLeft : 0;
      const currentScrollTop = viewportEl ? viewportEl.scrollTop : 0;
      const scrollDeltaX = currentScrollLeft - this.startScroll.left;
      const scrollDeltaY = currentScrollTop - this.startScroll.top;

      const deltaPdfX = (e.clientX - this.startPointer.x + scrollDeltaX) / this.viewport.scale;
      // In PDF coordinates (bottom-left origin), screen Y moving down (positive) means PDF Y decreases
      const deltaPdfY = -(e.clientY - this.startPointer.y + scrollDeltaY) / this.viewport.scale;

      const pageDims = this.getPageDimensions();
      const origW = this.startFormBounds[2] - this.startFormBounds[0];
      const origH = this.startFormBounds[3] - this.startFormBounds[1];

      let newX1 = Math.max(0, Math.min(this.startFormBounds[0] + deltaPdfX, pageDims.width - origW));
      let newY1 = Math.max(0, Math.min(this.startFormBounds[1] + deltaPdfY, pageDims.height - origH));
      let newX2 = newX1 + origW;
      let newY2 = newY1 + origH;

      formStore.updateWidgetBounds(
        selWidgetId,
        [Math.round(newX1), Math.round(newY1), Math.round(newX2), Math.round(newY2)],
        false
      );
      return;
    }

    if (this.interactionMode === 'resize-form' && this.activeResizeHandle) {
      const selWidgetId = formStore.getSelectedWidgetId();
      if (!selWidgetId) return;

      const viewportEl = document.getElementById('editor-viewport');
      const currentScrollLeft = viewportEl ? viewportEl.scrollLeft : 0;
      const currentScrollTop = viewportEl ? viewportEl.scrollTop : 0;
      const scrollDeltaX = currentScrollLeft - this.startScroll.left;
      const scrollDeltaY = currentScrollTop - this.startScroll.top;

      const deltaPdfX = (e.clientX - this.startPointer.x + scrollDeltaX) / this.viewport.scale;
      const deltaPdfY = -(e.clientY - this.startPointer.y + scrollDeltaY) / this.viewport.scale;

      let newX1 = this.startFormBounds[0];
      let newY1 = this.startFormBounds[1];
      let newX2 = this.startFormBounds[2];
      let newY2 = this.startFormBounds[3];

      if (this.activeResizeHandle.includes('e')) {
        newX2 = Math.max(this.startFormBounds[0] + 15, this.startFormBounds[2] + deltaPdfX);
      }
      if (this.activeResizeHandle.includes('w')) {
        newX1 = Math.min(this.startFormBounds[2] - 15, this.startFormBounds[0] + deltaPdfX);
      }
      if (this.activeResizeHandle.includes('n')) {
        newY2 = Math.max(this.startFormBounds[1] + 15, this.startFormBounds[3] + deltaPdfY);
      }
      if (this.activeResizeHandle.includes('s')) {
        newY1 = Math.min(this.startFormBounds[3] - 15, this.startFormBounds[1] + deltaPdfY);
      }

      formStore.updateWidgetBounds(
        selWidgetId,
        [Math.round(newX1), Math.round(newY1), Math.round(newX2), Math.round(newY2)],
        false
      );
      return;
    }

    if (this.interactionMode === 'move-object') {
      const viewportEl = document.getElementById('editor-viewport');
      const currentScrollLeft = viewportEl ? viewportEl.scrollLeft : 0;
      const currentScrollTop = viewportEl ? viewportEl.scrollTop : 0;
      const scrollDeltaX = currentScrollLeft - this.startScroll.left;
      const scrollDeltaY = currentScrollTop - this.startScroll.top;

      const deltaX = (e.clientX - this.startPointer.x + scrollDeltaX) / this.viewport.scale;
      const deltaY = (e.clientY - this.startPointer.y + scrollDeltaY) / this.viewport.scale;

      const pageDims = this.getPageDimensions();
      const newX = Math.max(0, Math.min(this.startObjectBounds.x + deltaX, pageDims.width - this.startObjectBounds.width));
      const newY = Math.max(0, Math.min(this.startObjectBounds.y + deltaY, pageDims.height - this.startObjectBounds.height));

      // Live update without writing history on every move frame
      editorStore.updateSelectedObject({ x: Math.round(newX), y: Math.round(newY) }, false);
      return;
    }

    if (this.interactionMode === 'resize-object' && this.activeResizeHandle) {
      const viewportEl = document.getElementById('editor-viewport');
      const currentScrollLeft = viewportEl ? viewportEl.scrollLeft : 0;
      const currentScrollTop = viewportEl ? viewportEl.scrollTop : 0;
      const scrollDeltaX = currentScrollLeft - this.startScroll.left;
      const scrollDeltaY = currentScrollTop - this.startScroll.top;

      const deltaX = (e.clientX - this.startPointer.x + scrollDeltaX) / this.viewport.scale;
      const deltaY = (e.clientY - this.startPointer.y + scrollDeltaY) / this.viewport.scale;

      let newX = this.startObjectBounds.x;
      let newY = this.startObjectBounds.y;
      let newW = this.startObjectBounds.width;
      let newH = this.startObjectBounds.height;

      if (this.activeResizeHandle.includes('e')) {
        newW = Math.max(20, this.startObjectBounds.width + deltaX);
      }
      if (this.activeResizeHandle.includes('s')) {
        newH = Math.max(15, this.startObjectBounds.height + deltaY);
      }
      if (this.activeResizeHandle.includes('w')) {
        const potentialW = this.startObjectBounds.width - deltaX;
        if (potentialW >= 20) {
          newW = potentialW;
          newX = this.startObjectBounds.x + deltaX;
        }
      }
      if (this.activeResizeHandle.includes('n')) {
        const potentialH = this.startObjectBounds.height - deltaY;
        if (potentialH >= 15) {
          newH = potentialH;
          newY = this.startObjectBounds.y + deltaY;
        }
      }

      editorStore.updateSelectedObject(
        {
          x: Math.round(newX),
          y: Math.round(newY),
          width: Math.round(newW),
          height: Math.round(newH),
        },
        false
      );
      return;
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    if (!this.isInteracting || !this.overlayEl || !this.canvasEl || !this.viewport) {
      this.releaseActivePointerCapture();
      this.lockViewportScrolling(false);
      this.isInteracting = false;
      this.interactionMode = 'idle';
      return;
    }

    const state = editorStore.getState();
    const activeTool = state.activeTool;

    if (this.interactionMode === 'create-shape') {
      try {
        (e.target as HTMLElement)?.releasePointerCapture?.(e.pointerId);
      } catch (err) {}
      const canvasRect = this.canvasEl.getBoundingClientRect();
      const curCssX = e.clientX - canvasRect.left;
      const curCssY = e.clientY - canvasRect.top;

      const left = Math.min(this.startPointer.x, curCssX);
      const top = Math.min(this.startPointer.y, curCssY);
      const width = Math.abs(curCssX - this.startPointer.x);
      const height = Math.abs(curCssY - this.startPointer.y);

      this.cleanupGhost();

      // Only commit if gesture has minimum size (>= 6px)
      if (width >= 6 && height >= 6) {
        const pdfRect = screenRectToPdfRect({ left, top, width, height }, this.viewport);
        const id = `${activeTool}-${Date.now()}`;
        const pageNumber = state.currentPage;

        let newObj: EditorObject;

        if (activeTool === 'redact') {
          newObj = {
            id,
            type: 'redact',
            status: 'draft',
            pageNumber,
            x: pdfRect.x,
            y: pdfRect.y,
            width: pdfRect.width,
            height: pdfRect.height,
            rotation: 0,
            opacity: 1,
            zIndex: 15,
            fillColor: '#000000',
            textColor: '#ffffff',
            overlayText: '',
            fontSize: 11,
          } as RedactionEditorObject;
        } else if (activeTool === 'whiteout') {
          newObj = {
            id,
            type: 'whiteout',
            pageNumber,
            x: pdfRect.x,
            y: pdfRect.y,
            width: pdfRect.width,
            height: pdfRect.height,
            rotation: 0,
            opacity: 1,
            zIndex: 10,
            fillColor: '#ffffff',
          } as PrivacyEditorObject;
        } else if (activeTool === 'highlight') {
          newObj = {
            id,
            type: 'highlight',
            pageNumber,
            x: pdfRect.x,
            y: pdfRect.y,
            width: pdfRect.width,
            height: pdfRect.height,
            rotation: 0,
            opacity: 0.35,
            zIndex: 2,
            color: '#facc15',
          } as AnnotationEditorObject;
        } else if (activeTool === 'underline') {
          newObj = {
            id,
            type: 'underline',
            pageNumber,
            x: pdfRect.x,
            y: pdfRect.y,
            width: pdfRect.width,
            height: pdfRect.height,
            rotation: 0,
            opacity: 1,
            zIndex: 8,
            color: '#2563eb',
            strokeWidth: 2,
          } as AnnotationEditorObject;
        } else if (activeTool === 'strikethrough') {
          newObj = {
            id,
            type: 'strikethrough',
            pageNumber,
            x: pdfRect.x,
            y: pdfRect.y,
            width: pdfRect.width,
            height: pdfRect.height,
            rotation: 0,
            opacity: 1,
            zIndex: 8,
            color: '#dc2626',
            strokeWidth: 2,
          } as AnnotationEditorObject;
        } else {
          // rectangle, ellipse, line, arrow
          newObj = {
            id,
            type: activeTool,
            pageNumber,
            x: pdfRect.x,
            y: pdfRect.y,
            width: pdfRect.width,
            height: pdfRect.height,
            rotation: 0,
            opacity: 1,
            zIndex: 5,
            fillColor: activeTool === 'rectangle' ? '#eff6ff' : 'transparent',
            strokeColor: '#2563eb',
            strokeWidth: 2,
            strokeStyle: 'solid',
            borderRadius: activeTool === 'rectangle' ? 4 : undefined,
          } as ShapeEditorObject;
        }

        editorStore.addObject(newObj, true);
        editorStore.setActiveTool('select');
      }
    } else if (this.interactionMode === 'draw-pen') {
      this.cleanupGhost();
      if (this.penPoints.length > 2) {
        // Compute bounding box
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const pt of this.penPoints) {
          if (pt.x < minX) minX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y > maxY) maxY = pt.y;
        }
        const width = Math.max(10, maxX - minX);
        const height = Math.max(10, maxY - minY);

        // Normalize points relative to (minX, minY)
        const relPoints = this.penPoints.map((p) => ({
          x: Math.round(p.x - minX),
          y: Math.round(p.y - minY),
        }));

        let d = `M ${relPoints[0].x} ${relPoints[0].y}`;
        for (let i = 1; i < relPoints.length; i++) {
          d += ` L ${relPoints[i].x} ${relPoints[i].y}`;
        }

        const pdfRect = screenRectToPdfRect({ left: minX, top: minY, width, height }, this.viewport);
        const penObj: PenEditorObject = {
          id: `pen-${Date.now()}`,
          type: 'pen',
          pageNumber: state.currentPage,
          x: pdfRect.x,
          y: pdfRect.y,
          width: pdfRect.width,
          height: pdfRect.height,
          rotation: 0,
          opacity: 1,
          zIndex: 5,
          pathData: d,
          strokeColor: '#2563eb',
          strokeWidth: 2,
        };
        editorStore.addObject(penObj, true);
        editorStore.setActiveTool('select');
      }
      this.penPoints = [];
    } else if (this.interactionMode === 'create-form') {
      try {
        (e.target as HTMLElement)?.releasePointerCapture?.(e.pointerId);
      } catch (err) {}
      const canvasRect = this.canvasEl.getBoundingClientRect();
      const curCssX = e.clientX - canvasRect.left;
      const curCssY = e.clientY - canvasRect.top;

      const left = Math.min(this.startPointer.x, curCssX);
      const top = Math.min(this.startPointer.y, curCssY);
      const rawW = Math.abs(curCssX - this.startPointer.x);
      const rawH = Math.abs(curCssY - this.startPointer.y);
      const width = Math.max(rawW, 20);
      const height = Math.max(rawH, 15);

      this.cleanupGhost();

      const p1 = this.viewport.convertToPdfPoint(left, top);
      const p2 = this.viewport.convertToPdfPoint(left + width, top + height);
      const pdfX1 = Math.round(Math.min(p1[0], p2[0]));
      const pdfY1 = Math.round(Math.min(p1[1], p2[1]));
      const pdfX2 = Math.round(Math.max(p1[0], p2[0]));
      const pdfY2 = Math.round(Math.max(p1[1], p2[1]));

      let type: FormFieldType = 'text';
      if (activeTool === 'form-text') type = 'text';
      else if (activeTool === 'form-multiline') type = 'multiline';
      else if (activeTool === 'form-checkbox') type = 'checkbox';
      else if (activeTool === 'form-radio') type = 'radio';
      else if (activeTool === 'form-dropdown') type = 'dropdown';
      else if (activeTool === 'form-listbox') type = 'listbox';

      const result = formStore.createFieldAndWidget({
        type,
        pageNumber: state.currentPage,
        pdfRect: [pdfX1, pdfY1, pdfX2, pdfY2],
      });

      formStore.setAuthorMode(true);
      formStore.selectWidget(result.widget.widgetId);
      editorStore.setActiveTool('select');
    } else if (this.interactionMode === 'move-form' || this.interactionMode === 'resize-form') {
      const selWidgetId = formStore.getSelectedWidgetId();
      if (selWidgetId) {
        const widget = formStore.getWidget(selWidgetId);
        if (widget) {
          formStore.updateWidgetBounds(selWidgetId, widget.pdfRect, true);
        }
      }
    } else if (this.interactionMode === 'move-object' || this.interactionMode === 'resize-object') {
      const dist = Math.hypot(e.clientX - this.startPointer.x, e.clientY - this.startPointer.y);
      if (dist > 3) {
        // Commit one consolidated history transaction on drag finish
        editorStore.recordHistorySnapshot();
        try {
          (window as any).__PDF_JUST_DRAGGED__ = Date.now();
        } catch (err) {}
        this.lastClickObjectId = null;
        this.lastClickTime = 0;
      }
      this.setActionBarInteractivity(true);
      const selected = editorStore.getSelectedObject();
      if (selected && (selected.type === 'text' || selected.type === 'text-replacement') && this.viewport) {
        const newScreenRect = pdfRectToScreenRect(selected, this.viewport);
        this.positionActionBar(newScreenRect);
      }
    }

    this.releaseActivePointerCapture();
    this.lockViewportScrolling(false);
    this.setActionBarInteractivity(true);
    this.isInteracting = false;
    this.interactionMode = 'idle';
    this.activeResizeHandle = null;
  }

  private handleDblClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    let objectEl = target.closest('[data-object-id]') as HTMLElement | null;
    let id = objectEl ? objectEl.getAttribute('data-object-id') : null;
    if (!id) {
      const selected = editorStore.getSelectedObject();
      if (selected && target.closest('#selection-bounding-box')) {
        id = selected.id;
      }
    }
    if (id) {
      const obj = editorStore.getState().objects.find((o) => o.id === id);
      if (obj && (obj.type === 'text' || obj.type === 'text-replacement')) {
        e.preventDefault();
        e.stopPropagation();
        this.openInlineTextEditor(obj as TextEditorObject | TextReplacementEditorObject);
      }
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.activeInlineEditor) return; // Let inline editor handle its own keys

    // Duplicate shortcut (Ctrl+D / Meta+D)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      editorStore.duplicateSelectedObject();
      return;
    }

    // Undo / Redo shortcuts
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        editorStore.redo();
      } else {
        editorStore.undo();
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      editorStore.redo();
      return;
    }

    // Delete / Backspace shortcuts
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const selWidgetId = formStore.getSelectedWidgetId();
      if (selWidgetId && formStore.isAuthorModeActive()) {
        e.preventDefault();
        formStore.deleteWidget(selWidgetId);
        return;
      }
      const selected = editorStore.getSelectedObject();
      if (selected) {
        e.preventDefault();
        editorStore.deleteSelectedObject();
      }
      return;
    }

    // Form widget nudge with arrow keys (1pt or 10pt with Shift)
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      const selWidgetId = formStore.getSelectedWidgetId();
      if (selWidgetId && formStore.isAuthorModeActive()) {
        const widget = formStore.getWidget(selWidgetId);
        if (widget) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          let [x1, y1, x2, y2] = widget.pdfRect;
          if (e.key === 'ArrowLeft') { x1 -= step; x2 -= step; }
          if (e.key === 'ArrowRight') { x1 += step; x2 += step; }
          if (e.key === 'ArrowUp') { y1 += step; y2 += step; }
          if (e.key === 'ArrowDown') { y1 -= step; y2 -= step; }
          formStore.updateWidgetBounds(selWidgetId, [x1, y1, x2, y2], true);
          return;
        }
      }
    }

    // Escape key: cancel active tool / placement preview or deselect
    if (e.key === 'Escape') {
      const state = editorStore.getState();
      if (state.activeTool !== 'select') {
        e.preventDefault();
        this.hideTextPlacementPreview();
        this.cleanupGhost();
        editorStore.setActiveTool('select');
        return;
      }
      if (state.selectedObjectId || editorStore.getSelectedExistingTextId()) {
        e.preventDefault();
        this.hideExistingTextActionBar();
        editorStore.selectObject(null);
        editorStore.selectExistingText(null);
        return;
      }
    }
  }

  /**
   * TRUE IN-SITU TEXT EDITOR (Phase 8B)
   *
   * Renders an editable field directly over the selected text's bounding box.
   * Replaces the former 320px detached floating card (showAnchoredTextPopover).
   *
   * Architecture:
   * - A contenteditable div positioned at exact anchorScreenRect coordinates inside #editor-overlay-layer
   * - A compact 32px Save/Cancel pill positioned just below (or above) the editable field
   * - visualViewport resize listener ensures the pill stays visible when the mobile soft keyboard opens
   */
  private showInSituTextEditor(options: {
    anchorScreenRect: { left: number; top: number; width: number; height: number };
    initialText: string;
    fontFamily?: string;
    fontSize?: number;
    isExistingText?: boolean;
    onSave: (text: string) => void;
    onCancel: () => void;
  }): void {
    if (!this.overlayEl || !this.viewport) return;
    this.cleanupInlineEditor();
    this.hideTextPlacementPreview();
    this.hideExistingTextActionBar();

    const { anchorScreenRect, initialText, fontFamily, fontSize, isExistingText, onSave, onCancel } = options;
    const overlayRect = this.overlayEl.getBoundingClientRect();

    // 1. Optional whiteout mask (covers existing PDF text while editing)
    if (isExistingText) {
      const mask = document.createElement('div');
      mask.id = 'temp-whiteout-mask';
      mask.className = 'absolute bg-white z-40 pointer-events-none';
      mask.style.left = `${anchorScreenRect.left - 2}px`;
      mask.style.top = `${anchorScreenRect.top - 2}px`;
      mask.style.width = `${anchorScreenRect.width + 4}px`;
      mask.style.height = `${anchorScreenRect.height + 4}px`;
      this.overlayEl.appendChild(mask);
      this.tempWhiteoutMaskEl = mask;
    }

    // 2. In-situ editable field — positioned at exact text bounding box
    const editorWidth = Math.max(anchorScreenRect.width, 80);
    const editorHeight = Math.max(anchorScreenRect.height, 24);

    // Clamp left so editor doesn't overflow the overlay to the right
    const editorLeft = Math.min(anchorScreenRect.left, overlayRect.width - editorWidth - 4);
    const editorTop = anchorScreenRect.top;

    const editorEl = document.createElement('div');
    editorEl.id = 'active-inline-text-popover';
    editorEl.setAttribute('data-testid', 'anchored-text-popover');
    editorEl.contentEditable = 'true';
    editorEl.role = 'textbox';
    editorEl.setAttribute('aria-label', 'Edit text');
    editorEl.setAttribute('aria-multiline', 'true');
    // Visually match the selected text; thin focus ring instead of large card border
    editorEl.className =
      'absolute z-50 outline-none ring-2 ring-blue-500 bg-white dark:bg-[#101621] text-slate-900 dark:text-white select-text pointer-events-auto overflow-y-auto';
    editorEl.style.left = `${Math.round(editorLeft)}px`;
    editorEl.style.top = `${Math.round(editorTop)}px`;
    editorEl.style.width = `${Math.round(editorWidth)}px`;
    editorEl.style.minHeight = `${Math.round(editorHeight)}px`;
    editorEl.style.maxHeight = '200px';
    editorEl.style.padding = '2px 4px';
    editorEl.style.fontFamily = fontFamily || 'Inter, sans-serif';
    editorEl.style.touchAction = 'auto'; // allow scrolling within editor
    editorEl.style.wordBreak = 'break-word';
    editorEl.style.whiteSpace = 'pre-wrap';
    editorEl.style.lineHeight = '1.4';
    if (fontSize && fontSize > 6) {
      editorEl.style.fontSize = `${Math.round(fontSize)}px`;
    } else {
      editorEl.style.fontSize = '14px';
    }
    editorEl.innerText = initialText;

    // Stop pointer events on the editor from bubbling to the overlay/drag system
    editorEl.addEventListener('pointerdown', (e) => e.stopPropagation());

    // 3. Compact Save/Cancel pill (32px height, 44px touch targets on mobile)
    const PILL_HEIGHT = 32;
    const PILL_GAP = 6;
    const pill = document.createElement('div');
    pill.id = 'insitu-editor-pill';
    pill.className =
      'absolute z-50 flex items-center gap-1 px-1.5 py-1 bg-white dark:bg-[#161c28] border border-slate-200 dark:border-[#212836] rounded-full shadow-lg pointer-events-auto select-none';
    pill.style.touchAction = 'none';
    pill.addEventListener('pointerdown', (e) => e.stopPropagation());

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.id = 'inline-text-cancel-btn';
    cancelBtn.setAttribute('aria-label', 'Cancel editing');
    cancelBtn.className =
      'flex items-center justify-center w-7 h-7 min-h-[44px] min-w-[44px] lg:min-h-[28px] lg:min-w-[28px] lg:w-7 lg:h-7 rounded-full text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer pointer-events-auto';
    cancelBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-3.5 h-3.5"><path d="M18 6L6 18M6 6l12 12"/></svg>';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.id = 'inline-text-save-btn';
    saveBtn.setAttribute('aria-label', 'Save text');
    saveBtn.className =
      'flex items-center justify-center w-7 h-7 min-h-[44px] min-w-[44px] lg:min-h-[28px] lg:min-w-[28px] lg:w-7 lg:h-7 rounded-full bg-blue-600 hover:bg-blue-700 text-white transition-colors cursor-pointer pointer-events-auto shadow-xs';
    saveBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-3.5 h-3.5"><path d="M20 6L9 17l-5-5"/></svg>';

    const kbdHint = document.createElement('span');
    kbdHint.className = 'hidden lg:inline text-[10px] text-slate-400 dark:text-slate-500 px-1 font-mono select-none';
    kbdHint.textContent = '⌘↵';
    kbdHint.setAttribute('aria-hidden', 'true');

    pill.appendChild(cancelBtn);
    pill.appendChild(saveBtn);
    pill.appendChild(kbdHint);

    // 4. Position the pill: prefer below the editor; flip above if clipped
    const positionPill = () => {
      const edRect = editorEl.getBoundingClientRect();
      const editorBottomInOverlay = editorEl.offsetTop + editorEl.offsetHeight;
      const pillWidth = 90; // estimated pill width
      // Try below
      let pillTop = editorBottomInOverlay + PILL_GAP;
      let pillLeft = editorEl.offsetLeft;

      // Clamp left
      pillLeft = Math.min(pillLeft, overlayRect.width - pillWidth - 8);
      pillLeft = Math.max(pillLeft, 8);

      // Flip above if we're near the bottom of the overlay
      const viewportVisibleBottom = window.visualViewport
        ? overlayRect.top + (window.visualViewport.height - overlayRect.top)
        : overlayRect.bottom;
      const pillBottomAbs = overlayRect.top + editorBottomInOverlay + PILL_GAP + PILL_HEIGHT;

      if (pillBottomAbs > viewportVisibleBottom - 8 && editorEl.offsetTop - PILL_GAP - PILL_HEIGHT > 8) {
        pillTop = editorEl.offsetTop - PILL_GAP - PILL_HEIGHT;
      }

      pill.style.top = `${Math.round(pillTop)}px`;
      pill.style.left = `${Math.round(pillLeft)}px`;
    };

    // 5. visualViewport resize handler: keep pill visible above soft keyboard
    const onVisualViewportResize = () => {
      positionPill();
      // Scroll editor-viewport so the editor remains visible
      const vp = document.getElementById('editor-viewport');
      if (vp && window.visualViewport) {
        const editorBottomClient = editorEl.getBoundingClientRect().bottom + PILL_HEIGHT + PILL_GAP + 12;
        const visibleBottom = window.visualViewport.height;
        if (editorBottomClient > visibleBottom) {
          vp.scrollTop += editorBottomClient - visibleBottom;
        }
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onVisualViewportResize);
    }

    // Store cleanup fn for visualViewport listener
    (editorEl as any).__cleanupVisualViewport = () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', onVisualViewportResize);
      }
    };

    this.overlayEl.appendChild(editorEl);
    this.overlayEl.appendChild(pill);
    this.activeInlineEditor = editorEl;

    positionPill();

    // 6. Action handlers
    let actionHandled = false;

    const commitAndClose = (e?: Event) => {
      if (actionHandled) return;
      actionHandled = true;
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      const text = editorEl.innerText.trim();
      this.cleanupInlineEditor();
      onSave(text);
    };

    const cancelAndClose = (e?: Event) => {
      if (actionHandled) return;
      actionHandled = true;
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      this.cleanupInlineEditor();
      onCancel();
    };

    saveBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); commitAndClose(e); });
    saveBtn.addEventListener('click', (e) => commitAndClose(e));
    cancelBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); cancelAndClose(e); });
    cancelBtn.addEventListener('click', (e) => cancelAndClose(e));

    // Keyboard shortcuts
    editorEl.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        commitAndClose();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancelAndClose();
      }
    });

    // 7. Auto-focus and select all existing text
    setTimeout(() => {
      editorEl.focus();
      try { editorEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (err) {}
      if (initialText) {
        try {
          const range = document.createRange();
          range.selectNodeContents(editorEl);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        } catch (err) {}
      }
    }, 20);
  }

  /**
   * Click-to-type lifecycle for "Add Text".
   */
  private createInlineTextEditorAt(clientX: number, clientY: number): void {
    if (!this.overlayEl || !this.canvasEl || !this.viewport) return;
    this.hideTextPlacementPreview();

    const canvasRect = this.canvasEl.getBoundingClientRect();
    const cssX = clientX - canvasRect.left;
    const cssY = clientY - canvasRect.top;

    this.showInSituTextEditor({
      anchorScreenRect: { left: cssX, top: cssY, width: 20, height: 20 },
      initialText: '',
      onSave: (text) => {
        if (text.length > 0 && this.viewport) {
          const pdfRect = screenRectToPdfRect({ left: cssX, top: cssY, width: 80, height: 28 }, this.viewport);
          const newTextObj: TextEditorObject = {
            id: `text-${Date.now()}`,
            type: 'text',
            pageNumber: editorStore.getState().currentPage,
            x: pdfRect.x,
            y: pdfRect.y,
            width: pdfRect.width,
            height: pdfRect.height,
            rotation: 0,
            opacity: 1,
            zIndex: 10,
            text,
            fontFamily: 'Inter',
            fontSize: 14,
            fontWeight: 'normal',
            fontStyle: 'normal',
            textDecoration: 'none',
            textAlign: 'left',
            color: '#0f172a',
          };
          editorStore.addObject(newTextObj, true);
          editorStore.selectObject(newTextObj.id);
        }
        editorStore.setActiveTool('select');
      },
      onCancel: () => {
        editorStore.setActiveTool('select');
      },
    });
  }

  /**
   * Reopens inline editor for an existing text object or text replacement.
   */
  public openInlineTextEditor(obj: TextEditorObject | TextReplacementEditorObject): void {
    if (!this.overlayEl || !this.viewport) return;
    this.hideTextPlacementPreview();
    this.hideExistingTextActionBar();

    let screenRect: ScreenRect;
    const objEl = document.getElementById(`obj-${obj.id}`);
    if (objEl && this.overlayEl) {
      const objRect = objEl.getBoundingClientRect();
      const overlayRect = this.overlayEl.getBoundingClientRect();
      screenRect = {
        left: Math.round((objRect.left - overlayRect.left) * 100) / 100,
        top: Math.round((objRect.top - overlayRect.top) * 100) / 100,
        width: Math.round(objRect.width * 100) / 100,
        height: Math.round(objRect.height * 100) / 100,
      };
    } else {
      screenRect = pdfRectToScreenRect(obj, this.viewport);
    }

    const initialText = obj.type === 'text' ? (obj as TextEditorObject).text : (obj as TextReplacementEditorObject).replacementText;

    this.showInSituTextEditor({
      anchorScreenRect: screenRect,
      initialText,
      fontFamily: obj.fontFamily,
      fontSize: obj.fontSize * this.viewport.scale,
      onSave: (text) => {
        if (text.length > 0) {
          if (obj.type === 'text') {
            editorStore.updateObject(obj.id, { text }, true);
          } else {
            let measuredWidthPt = 0;
            try {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.font = `${obj.fontSize}px ${obj.fontFamily || 'sans-serif'}`;
                measuredWidthPt = ctx.measureText(text).width;
              }
            } catch (e) {}
            const newWidth = Math.max(obj.width, measuredWidthPt + 6);
            editorStore.updateObject(obj.id, { replacementText: text, width: Math.round(newWidth) }, true);
          }
          editorStore.selectObject(null);
          this.hideExistingTextActionBar();
        } else {
          editorStore.deleteSelectedObject();
          this.hideExistingTextActionBar();
        }
        editorStore.setActiveTool('select');
      },
      onCancel: () => {
        editorStore.setActiveTool('select');
      },
    });
  }

  private handleTextLayerPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;

    // Suppress fall-through compatibility clicks immediately following action bar dismissal
    if (Date.now() - this.lastActionBarDismissTime < 350) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const state = editorStore.getState();
    if (state.activeTool !== 'select') {
      this.handlePointerDown(e);
      return;
    }

    const target = e.target as HTMLElement;
    const span = target.closest('span[data-text-id]') as HTMLElement | null;

    if (span) {
      const textId = span.getAttribute('data-text-id');
      if (!textId) return;

      const item = pdfTextLayerManager.getTextItem(textId);
      if (!item) return;

      // Double-click on existing text enters edit mode immediately
      if (e.detail === 2) {
        e.preventDefault();
        e.stopPropagation();
        this.startEditingExistingText(item, span);
        return;
      }

      // Single click selects existing text and positions action bar
      e.stopPropagation();
      this.selectExistingTextItem(item, span);
    } else {
      this.hideExistingTextActionBar();
      editorStore.selectExistingText(null);
    }
  }

  public selectExistingTextItem(item: ExistingPdfTextItem, span?: HTMLElement | null): void {
    // Clear any previous selection outlines
    if (this.textLayerEl) {
      this.textLayerEl.querySelectorAll('.text-item-selected').forEach((el) => {
        el.classList.remove('text-item-selected');
      });
    }

    const targetSpan = span || (this.textLayerEl ? this.textLayerEl.querySelector<HTMLElement>(`span[data-text-id="${item.id}"]`) : null);
    if (targetSpan) {
      targetSpan.classList.add('text-item-selected');
    }

    editorStore.selectObject(null);
    editorStore.selectExistingText(item.id);

    // Position action bar above or below the text bounds using live DOM geometry if available
    if (this.actionBarEl && this.viewport) {
      let screenRect: ScreenRect;
      if (targetSpan && this.overlayEl) {
        const spanRect = targetSpan.getBoundingClientRect();
        const overlayRect = this.overlayEl.getBoundingClientRect();
        screenRect = {
          left: Math.round((spanRect.left - overlayRect.left) * 100) / 100,
          top: Math.round((spanRect.top - overlayRect.top) * 100) / 100,
          width: Math.round(spanRect.width * 100) / 100,
          height: Math.round(spanRect.height * 100) / 100,
        };
      } else {
        screenRect = pdfRectToScreenRect(item.pdfBounds, this.viewport);
      }
      this.positionActionBar(screenRect);
    }
  }

  public hideExistingTextActionBar(): void {
    if (this.actionBarEl) {
      if (!this.actionBarEl.classList.contains('hidden')) {
        this.lastActionBarDismissTime = Date.now();
      }
      this.actionBarEl.classList.add('hidden');
      this.actionBarEl.removeAttribute('data-placement');
    }
    this.lastSelectedScreenRect = null;
    if (this.textLayerEl) {
      this.textLayerEl.querySelectorAll('.text-item-selected').forEach((el) => {
        el.classList.remove('text-item-selected');
      });
    }
  }

  public startEditingExistingText(item: ExistingPdfTextItem, targetSpan?: HTMLElement | null): void {
    if (!this.overlayEl || !this.viewport) return;
    this.hideExistingTextActionBar();
    this.cleanupInlineEditor();
    this.hideTextPlacementPreview();

    const span = targetSpan || (this.textLayerEl ? this.textLayerEl.querySelector<HTMLElement>(`span[data-text-id="${item.id}"]`) : null);
    let screenRect: ScreenRect;
    let computedFontSize = item.fontSize * this.viewport.scale;

    if (span && this.overlayEl) {
      const spanRect = span.getBoundingClientRect();
      const overlayRect = this.overlayEl.getBoundingClientRect();
      screenRect = {
        left: Math.round((spanRect.left - overlayRect.left) * 100) / 100,
        top: Math.round((spanRect.top - overlayRect.top) * 100) / 100,
        width: Math.round(spanRect.width * 100) / 100,
        height: Math.round(spanRect.height * 100) / 100,
      };
      try {
        const comp = window.getComputedStyle(span);
        const parsed = parseFloat(comp.fontSize);
        if (parsed > 0) computedFontSize = parsed;
      } catch (e) {}
    } else {
      screenRect = pdfRectToScreenRect(item.pdfBounds, this.viewport);
    }

    this.showInSituTextEditor({
      anchorScreenRect: screenRect,
      initialText: item.text,
      fontFamily: item.fontFamily,
      fontSize: computedFontSize,
      isExistingText: true,
      onSave: (text) => {
        if (text.length > 0 && text !== item.text) {
          let measuredWidthPt = 0;
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.font = `${item.fontStyle || 'normal'} ${item.fontWeight || 'normal'} ${item.fontSize}px ${item.fontFamily || 'sans-serif'}`;
              measuredWidthPt = ctx.measureText(text).width;
            }
          } catch (e) {}

          const finalWidth = Math.max(item.pdfBounds.width, measuredWidthPt + 6);
          const replacementObj: TextReplacementEditorObject = {
            id: `rep-${Date.now()}`,
            type: 'text-replacement',
            pageNumber: item.pageNumber,
            sourceTextItemId: item.id,
            originalText: item.text,
            replacementText: text,
            x: item.pdfBounds.x,
            y: item.pdfBounds.y,
            width: Math.round(finalWidth),
            height: Math.round(item.pdfBounds.height),
            rotation: 0,
            opacity: 1,
            zIndex: 10,
            fontSize: item.fontSize,
            fontFamily: item.fontFamily || 'Inter',
            fontWeight: (item.fontWeight as any) || 'normal',
            fontStyle: (item.fontStyle as any) || 'normal',
            textDecoration: 'none',
            textAlign: 'left',
            color: item.color || '#0f172a',
            backgroundColor: '#ffffff',
            maskPadding: 2,
          };

          editorStore.addObject(replacementObj, true);
          if (this.textLayerEl) {
            pdfTextLayerManager.hideSpan(item.id, this.textLayerEl);
          }
        }
        editorStore.selectExistingText(null);
        editorStore.setActiveTool('select');
      },
      onCancel: () => {
        editorStore.selectExistingText(null);
        editorStore.setActiveTool('select');
      },
    });
  }

  public underlineExistingText(item: ExistingPdfTextItem): void {
    const curPageState = editorStore.getCurrentPageState();
    const underlineObj: AnnotationEditorObject = {
      id: `underline-${Date.now()}`,
      type: 'underline',
      pageId: curPageState?.id,
      pageNumber: item.pageNumber,
      x: item.pdfBounds.x,
      y: item.pdfBounds.y,
      width: item.pdfBounds.width,
      height: item.pdfBounds.height,
      rotation: 0,
      opacity: 1,
      zIndex: 8,
      color: '#2563eb',
      strokeWidth: 2,
    };
    editorStore.addObject(underlineObj, true);
    this.hideExistingTextActionBar();
    editorStore.selectExistingText(null);
  }

  public strikethroughExistingText(item: ExistingPdfTextItem): void {
    const curPageState = editorStore.getCurrentPageState();
    const strikeObj: AnnotationEditorObject = {
      id: `strike-${Date.now()}`,
      type: 'strikethrough',
      pageId: curPageState?.id,
      pageNumber: item.pageNumber,
      x: item.pdfBounds.x,
      y: item.pdfBounds.y,
      width: item.pdfBounds.width,
      height: item.pdfBounds.height,
      rotation: 0,
      opacity: 1,
      zIndex: 8,
      color: '#dc2626',
      strokeWidth: 2,
    };
    editorStore.addObject(strikeObj, true);
    this.hideExistingTextActionBar();
    editorStore.selectExistingText(null);
  }

  public redactExistingText(item: ExistingPdfTextItem): void {
    const curPageState = editorStore.getCurrentPageState();
    const redactObj: RedactionEditorObject = {
      id: `redact-${Date.now()}`,
      type: 'redact',
      status: 'draft',
      pageId: curPageState?.id,
      pageNumber: item.pageNumber,
      x: Math.max(0, item.pdfBounds.x - 2),
      y: Math.max(0, item.pdfBounds.y - 1),
      width: item.pdfBounds.width + 4,
      height: item.pdfBounds.height + 2,
      rotation: 0,
      opacity: 1,
      zIndex: 15,
      fillColor: '#000000',
      textColor: '#ffffff',
      overlayText: '',
      fontSize: 11,
      originalText: item.text,
    };
    editorStore.addObject(redactObj, true);
    this.hideExistingTextActionBar();
    editorStore.selectExistingText(null);
    editorStore.selectObject(redactObj.id);
  }

  private createCommentAt(clientX: number, clientY: number): void {
    if (!this.overlayEl || !this.canvasEl || !this.viewport) return;
    this.cleanupInlineEditor();

    const canvasRect = this.canvasEl.getBoundingClientRect();
    const cssX = clientX - canvasRect.left;
    const cssY = clientY - canvasRect.top;

    const pdfPt = screenToPdfPoint(clientX, clientY, this.canvasEl, this.viewport);

    const popover = document.createElement('div');
    popover.id = 'active-comment-popover';
    popover.className =
      'absolute z-50 p-2.5 bg-white dark:bg-[#1a2232] border border-amber-300 dark:border-amber-700/60 rounded-xl shadow-xl flex flex-col gap-2 w-64 text-xs select-none';
    popover.style.left = `${Math.min(cssX, canvasRect.width - 270)}px`;
    popover.style.top = `${Math.min(cssY, canvasRect.height - 120)}px`;

    popover.innerHTML = `
      <div class="flex items-center justify-between text-slate-700 dark:text-slate-200 font-semibold">
        <span class="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Add Sticky Comment
        </span>
        <button type="button" id="comment-close-btn" class="p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" title="Close">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <textarea id="comment-input-text" placeholder="Type a note... (Ctrl+Enter to save)" class="w-full h-16 p-1.5 text-xs bg-slate-50 dark:bg-[#121721] border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-amber-500 text-slate-900 dark:text-white resize-none"></textarea>
      <div class="flex items-center justify-end gap-1.5">
        <button type="button" id="commit-comment-btn" class="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs shadow-xs transition-colors">
          Save Comment
        </button>
      </div>
    `;

    this.overlayEl.appendChild(popover);
    this.activeInlineEditor = popover;

    const textarea = popover.querySelector('#comment-input-text') as HTMLTextAreaElement | null;
    const saveBtn = popover.querySelector('#commit-comment-btn, #comment-save-btn') as HTMLButtonElement | null;
    const closeBtn = popover.querySelector('#comment-close-btn') as HTMLButtonElement | null;

    setTimeout(() => textarea?.focus(), 20);

    const commitComment = () => {
      const text = textarea?.value.trim();
      this.cleanupInlineEditor();
      if (text && text.length > 0) {
        const state = editorStore.getState();
        const curPageState = editorStore.getCurrentPageState();
        const commentObj: AnnotationEditorObject = {
          id: `comment-${Date.now()}`,
          type: 'comment',
          pageId: curPageState?.id,
          pageNumber: state.currentPage,
          x: Math.round(pdfPt.x),
          y: Math.round(pdfPt.y),
          width: 24,
          height: 24,
          rotation: 0,
          opacity: 1,
          zIndex: 12,
          color: '#f59e0b',
          commentText: text,
          author: 'User',
          createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        editorStore.addObject(commentObj, true);
        editorStore.setActiveTool('select');
      } else {
        editorStore.setActiveTool('select');
      }
    };

    saveBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      commitComment();
    });

    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cleanupInlineEditor();
      editorStore.setActiveTool('select');
    });

    textarea?.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        commitComment();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.cleanupInlineEditor();
        editorStore.setActiveTool('select');
      }
    });
  }

  private cleanupInlineEditor(): void {
    // Run visualViewport listener cleanup if stored on the active editor
    if (this.activeInlineEditor && typeof (this.activeInlineEditor as any).__cleanupVisualViewport === 'function') {
      try { (this.activeInlineEditor as any).__cleanupVisualViewport(); } catch (err) {}
    }

    if (this.activeInlineEditor && this.activeInlineEditor.parentElement) {
      this.activeInlineEditor.parentElement.removeChild(this.activeInlineEditor);
    }
    this.activeInlineEditor = null;

    // Remove in-situ editor (Phase 8B)
    const popover = document.getElementById('active-inline-text-popover');
    if (popover) {
      if (typeof (popover as any).__cleanupVisualViewport === 'function') {
        try { (popover as any).__cleanupVisualViewport(); } catch (err) {}
      }
      if (popover.parentElement) popover.parentElement.removeChild(popover);
    }

    // Remove in-situ pill (Phase 8B)
    const pill = document.getElementById('insitu-editor-pill');
    if (pill && pill.parentElement) {
      pill.parentElement.removeChild(pill);
    }

    // Remove legacy editor elements (backward compat / stray cleanup)
    const editor = document.getElementById('active-inline-text-editor');
    if (editor && editor.parentElement) {
      editor.parentElement.removeChild(editor);
    }

    const commentPopover = document.getElementById('active-comment-popover');
    if (commentPopover && commentPopover.parentElement) {
      commentPopover.parentElement.removeChild(commentPopover);
    }

    const hint = document.getElementById('inline-editor-hint');
    if (hint && hint.parentElement) {
      hint.parentElement.removeChild(hint);
    }

    if (this.tempWhiteoutMaskEl && this.tempWhiteoutMaskEl.parentElement) {
      this.tempWhiteoutMaskEl.parentElement.removeChild(this.tempWhiteoutMaskEl);
    }
    this.tempWhiteoutMaskEl = null;

    const strayMask = document.getElementById('temp-whiteout-mask');
    if (strayMask && strayMask.parentElement) {
      strayMask.parentElement.removeChild(strayMask);
    }
  }

  private initGhost(tool: EditorTool): void {
    if (!this.overlayEl) return;
    this.cleanupGhost();

    const ghost = document.createElement('div');
    ghost.id = 'active-ghost-preview';
    ghost.className = 'absolute pointer-events-none z-40';

    if (tool === 'redact') {
      ghost.className += ' bg-rose-500/25 border-2 border-dashed border-rose-600 rounded flex items-center justify-center';
      ghost.innerHTML = '<span class="text-[10px] font-bold tracking-wider text-rose-700 bg-white/90 px-1 py-0.5 rounded shadow-xs uppercase">REDACT</span>';
    } else if (tool === 'rectangle') {
      ghost.className += ' border-2 border-dashed border-brand-500 bg-brand-500/10 rounded';
    } else if (tool === 'ellipse') {
      ghost.className += ' border-2 border-dashed border-brand-500 bg-brand-500/10 rounded-full';
    } else if (tool === 'whiteout') {
      ghost.className += ' bg-white border border-slate-300 shadow-md';
    } else if (tool === 'highlight') {
      ghost.className += ' bg-yellow-400/40 border border-yellow-500/50 rounded-xs';
    } else if (tool === 'underline') {
      ghost.className += ' border-b-2 border-blue-600 bg-blue-500/10';
    } else if (tool === 'strikethrough') {
      ghost.className += ' border border-rose-300 bg-rose-500/10 flex items-center justify-center';
      ghost.innerHTML = '<div class="w-full h-0.5 bg-rose-500"></div>';
    } else if (tool === 'pen') {
      ghost.innerHTML = `<svg class="w-full h-full absolute inset-0 overflow-visible"><path d="M 0 0" stroke="#2563eb" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    } else if (tool.startsWith('form-')) {
      const typeLabel = tool.replace('form-', '').toUpperCase();
      ghost.className += ' border-2 border-dashed border-brand-500 bg-brand-500/15 rounded flex items-center justify-center';
      ghost.innerHTML = `<span class="text-[10px] font-bold tracking-wider text-brand-700 bg-white/90 px-1 py-0.5 rounded shadow-xs uppercase">${typeLabel}</span>`;
    } else {
      ghost.className += ' border-2 border-dashed border-brand-500';
    }

    this.overlayEl.appendChild(ghost);
    this.ghostEl = ghost;
  }

  private updateGhostPenPath(): void {
    if (!this.ghostEl || this.penPoints.length < 2) return;
    const pathEl = this.ghostEl.querySelector('path');
    if (!pathEl) return;

    let d = `M ${this.penPoints[0].x} ${this.penPoints[0].y}`;
    for (let i = 1; i < this.penPoints.length; i++) {
      d += ` L ${this.penPoints[i].x} ${this.penPoints[i].y}`;
    }
    pathEl.setAttribute('d', d);
  }

  private cleanupGhost(): void {
    if (this.ghostEl && this.ghostEl.parentElement) {
      this.ghostEl.parentElement.removeChild(this.ghostEl);
    }
    this.ghostEl = null;
  }

  private getPageDimensions(): { width: number; height: number } {
    const state = editorStore.getState();
    const curInfo = state.document?.pages[state.currentPage - 1];
    return curInfo ? { width: curInfo.width, height: curInfo.height } : { width: 595, height: 842 };
  }
}

export const interactionController = new EditorInteractionController();
