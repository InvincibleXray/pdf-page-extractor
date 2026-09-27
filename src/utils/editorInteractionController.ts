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
  private lastClickObjectId: string | null = null;
  private lastClickTime = 0;

  // Bound event listeners
  private boundPointerDown: (e: PointerEvent) => void;
  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerUp: (e: PointerEvent) => void;
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundDblClick: (e: MouseEvent) => void;
  private boundTextLayerPointerDown: (e: PointerEvent) => void;

  constructor() {
    this.boundPointerDown = this.handlePointerDown.bind(this);
    this.boundPointerMove = this.handlePointerMove.bind(this);
    this.boundPointerUp = this.handlePointerUp.bind(this);
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
    }

    if (this.actionBarEl) {
      const editBtn = this.actionBarEl.querySelector('#edit-existing-text-btn');
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const selectedTextId = editorStore.getSelectedExistingTextId();
          if (selectedTextId) {
            const item = pdfTextLayerManager.getTextItem(selectedTextId);
            if (item) this.startEditingExistingText(item);
          }
        });
      }

      const underlineBtn = this.actionBarEl.querySelector('#underline-existing-text-btn');
      if (underlineBtn) {
        underlineBtn.addEventListener('click', (e) => {
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
        strikeBtn.addEventListener('click', (e) => {
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
        redactBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const selectedTextId = editorStore.getSelectedExistingTextId();
          if (selectedTextId) {
            const item = pdfTextLayerManager.getTextItem(selectedTextId);
            if (item) this.redactExistingText(item);
          }
        });
      }
    }

    window.addEventListener('pointermove', this.boundPointerMove);
    window.addEventListener('pointerup', this.boundPointerUp);
    window.addEventListener('keydown', this.boundKeyDown);
  }

  public detach(): void {
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
    }
    window.removeEventListener('pointermove', this.boundPointerMove);
    window.removeEventListener('pointerup', this.boundPointerUp);
    window.removeEventListener('keydown', this.boundKeyDown);
    this.cleanupInlineEditor();
    this.cleanupGhost();
    this.hideExistingTextActionBar();
  }

  public setViewport(viewport: PageViewport): void {
    this.viewport = viewport;
  }

  private handlePointerDown(e: PointerEvent): void {
    if (!this.overlayEl || !this.canvasEl || !this.viewport) return;
    if (e.button !== 0) return; // Main left click only

    const target = e.target as HTMLElement;

    // Check if clicking on form resize handles
    const formHandleEl = target.closest('[data-form-handle]') as HTMLElement | null;
    if (formHandleEl) {
      const handle = formHandleEl.getAttribute('data-form-handle');
      const selWidgetId = formStore.getSelectedWidgetId();
      const widget = selWidgetId ? formStore.getWidget(selWidgetId) : null;
      if (widget && handle) {
        e.preventDefault();
        e.stopPropagation();
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
        this.isInteracting = true;
        this.interactionMode = 'resize-object';
        this.activeResizeHandle = handle;
        this.startPointer = { x: e.clientX, y: e.clientY };
        this.startObjectBounds = { ...selected };
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
          this.isInteracting = true;
          this.interactionMode = 'move-form';
          this.startPointer = { x: e.clientX, y: e.clientY };
          this.startFormBounds = [...widget.pdfRect] as [number, number, number, number];
          return;
        }
      }
    }

    const objectEl = target.closest('[data-object-id]') as HTMLElement | null;
    const now = Date.now();

    // Double click on text or text-replacement object opens inline editor
    const isDouble = objectEl && (e.detail === 2 || (this.lastClickObjectId === objectEl.getAttribute('data-object-id') && (now - this.lastClickTime < 280)));
    if (objectEl && isDouble) {
      const id = objectEl.getAttribute('data-object-id');
      const obj = state.objects.find((o) => o.id === id);
      if (obj && (obj.type === 'text' || obj.type === 'text-replacement')) {
        e.preventDefault();
        e.stopPropagation();
        this.lastClickObjectId = null;
        this.lastClickTime = 0;
        this.openInlineTextEditor(obj as TextEditorObject | TextReplacementEditorObject);
        return;
      }
    }
    if (objectEl) {
      this.lastClickObjectId = objectEl.getAttribute('data-object-id');
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
          e.preventDefault();
          this.isInteracting = true;
          this.interactionMode = 'move-object';
          this.startPointer = { x: e.clientX, y: e.clientY };
          this.startObjectBounds = { ...selected };
          return;
        }
      }
    }

    // Form authoring drag-to-create tools
    if (activeTool.startsWith('form-')) {
      e.preventDefault();
      this.isInteracting = true;
      this.interactionMode = 'create-form';
      const canvasRect = this.canvasEl.getBoundingClientRect();
      this.startPointer = {
        x: e.clientX - canvasRect.left,
        y: e.clientY - canvasRect.top,
      };
      this.initGhost(activeTool);
      try {
        target.setPointerCapture?.(e.pointerId);
      } catch (err) {}
      return;
    }

    // Text tool: click-to-type lifecycle
    if (activeTool === 'text') {
      e.preventDefault();
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
      this.isInteracting = true;
      this.interactionMode = 'create-shape';
      const canvasRect = this.canvasEl.getBoundingClientRect();
      this.startPointer = {
        x: e.clientX - canvasRect.left,
        y: e.clientY - canvasRect.top,
      };
      this.initGhost(activeTool);
      try {
        target.setPointerCapture?.(e.pointerId);
      } catch (err) {}
      return;
    }

    // Pen tool: freehand drawing
    if (activeTool === 'pen') {
      e.preventDefault();
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
    if (activeTool === 'select' && !objectEl && !formWidgetEl) {
      this.hideExistingTextActionBar();
      editorStore.selectExistingText(null);
      editorStore.selectObject(null);
      if (formStore.isAuthorModeActive()) {
        formStore.selectWidget(null);
      }
    }
  }

  private handlePointerMove(e: PointerEvent): void {
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

      const deltaPdfX = (e.clientX - this.startPointer.x) / this.viewport.scale;
      // In PDF coordinates (bottom-left origin), screen Y moving down (positive) means PDF Y decreases
      const deltaPdfY = -(e.clientY - this.startPointer.y) / this.viewport.scale;

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

      const deltaPdfX = (e.clientX - this.startPointer.x) / this.viewport.scale;
      const deltaPdfY = -(e.clientY - this.startPointer.y) / this.viewport.scale;

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
      const deltaX = (e.clientX - this.startPointer.x) / this.viewport.scale;
      const deltaY = (e.clientY - this.startPointer.y) / this.viewport.scale;

      const pageDims = this.getPageDimensions();
      const newX = Math.max(0, Math.min(this.startObjectBounds.x + deltaX, pageDims.width - this.startObjectBounds.width));
      const newY = Math.max(0, Math.min(this.startObjectBounds.y + deltaY, pageDims.height - this.startObjectBounds.height));

      // Live update without writing history on every move frame
      editorStore.updateSelectedObject({ x: Math.round(newX), y: Math.round(newY) }, false);
      return;
    }

    if (this.interactionMode === 'resize-object' && this.activeResizeHandle) {
      const deltaX = (e.clientX - this.startPointer.x) / this.viewport.scale;
      const deltaY = (e.clientY - this.startPointer.y) / this.viewport.scale;

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
      // Commit one consolidated history transaction on gesture finish
      editorStore.recordHistorySnapshot();
      try {
        (window as any).__PDF_JUST_DRAGGED__ = Date.now();
      } catch (err) {}
      this.lastClickObjectId = null;
      this.lastClickTime = 0;
    }

    this.isInteracting = false;
    this.interactionMode = 'idle';
    this.activeResizeHandle = null;
  }

  private handleDblClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const objectEl = target.closest('[data-object-id]') as HTMLElement | null;
    if (objectEl) {
      const id = objectEl.getAttribute('data-object-id');
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
  }

  /**
   * Click-to-type lifecycle for "Add Text".
   */
  private createInlineTextEditorAt(clientX: number, clientY: number): void {
    if (!this.overlayEl || !this.canvasEl || !this.viewport) return;

    this.cleanupInlineEditor();

    const canvasRect = this.canvasEl.getBoundingClientRect();
    const cssX = clientX - canvasRect.left;
    const cssY = clientY - canvasRect.top;

    const editor = document.createElement('div');
    editor.id = 'active-inline-text-editor';
    editor.contentEditable = 'true';
    editor.className =
      'absolute outline-none min-w-[80px] min-h-[28px] p-1.5 bg-white dark:bg-[#1a2232] border-2 border-brand-500 rounded-md shadow-lg text-slate-900 dark:text-white text-sm z-50 overflow-hidden';
    editor.style.left = `${cssX}px`;
    editor.style.top = `${cssY}px`;
    editor.style.fontFamily = 'Inter, sans-serif';
    editor.style.fontSize = '14px';
    editor.style.lineHeight = '1.3';

    this.overlayEl.appendChild(editor);
    this.activeInlineEditor = editor;

    const hint = document.createElement('div');
    hint.id = 'inline-editor-hint';
    hint.textContent = 'Ctrl + Enter · Save  |  Esc · Cancel';
    hint.className = 'text-[10px] font-medium text-slate-400 dark:text-slate-500 mt-1 select-none pointer-events-none';
    hint.style.position = 'absolute';
    hint.style.left = editor.style.left;
    const updateHintPos = () => {
      hint.style.top = `calc(${editor.style.top} + ${editor.offsetHeight}px)`;
    };
    updateHintPos();
    editor.addEventListener('input', updateHintPos);
    this.overlayEl.appendChild(hint);

    // Focus editor
    setTimeout(() => {
      editor.focus();
    }, 10);

    const commitAndClose = () => {
      if (!this.activeInlineEditor) return;
      const text = this.activeInlineEditor.innerText.trim();
      const rect = this.activeInlineEditor.getBoundingClientRect();
      const width = Math.max(rect.width, 80);
      const height = Math.max(rect.height, 28);

      this.cleanupInlineEditor();

      if (text.length > 0 && this.viewport) {
        const pdfRect = screenRectToPdfRect({ left: cssX, top: cssY, width, height }, this.viewport);
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
        editorStore.setActiveTool('select');
      } else {
        // Clean removal without leaving orphaned object
        editorStore.setActiveTool('select');
      }
    };

    editor.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        commitAndClose();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.cleanupInlineEditor();
        editorStore.setActiveTool('select');
      }
      // Plain Enter inserts normal newline for multiline text
    });

    editor.addEventListener('blur', () => {
      // Small timeout to allow potential button clicks
      setTimeout(commitAndClose, 50);
    });
  }

  /**
   * Reopens inline editor for an existing text object or text replacement.
   */
  private openInlineTextEditor(obj: TextEditorObject | TextReplacementEditorObject): void {
    if (!this.overlayEl || !this.viewport) return;
    this.cleanupInlineEditor();

    const screenRect = pdfRectToScreenRect(obj, this.viewport);
    const initialText = obj.type === 'text' ? (obj as TextEditorObject).text : (obj as TextReplacementEditorObject).replacementText;

    const editor = document.createElement('div');
    editor.id = 'active-inline-text-editor';
    editor.contentEditable = 'true';
    editor.className =
      'absolute outline-none min-w-[80px] p-1 bg-white dark:bg-[#1a2232] border-2 border-brand-500 rounded-md shadow-lg text-slate-900 dark:text-white z-50';
    editor.style.left = `${screenRect.left}px`;
    editor.style.top = `${screenRect.top}px`;
    editor.style.width = `${Math.max(screenRect.width, 100)}px`;
    editor.style.fontFamily = obj.fontFamily;
    editor.style.fontSize = `${obj.fontSize * this.viewport.scale}px`;
    editor.style.fontWeight = obj.fontWeight;
    editor.style.fontStyle = obj.fontStyle;
    editor.style.color = obj.color;
    editor.innerText = initialText;

    this.overlayEl.appendChild(editor);
    this.activeInlineEditor = editor;

    const hint = document.createElement('div');
    hint.id = 'inline-editor-hint';
    hint.textContent = 'Ctrl + Enter · Save  |  Esc · Cancel';
    hint.className = 'text-[10px] font-medium text-slate-400 dark:text-slate-500 mt-1 select-none pointer-events-none';
    hint.style.position = 'absolute';
    hint.style.left = editor.style.left;
    const updateHintPos = () => {
      hint.style.top = `calc(${editor.style.top} + ${editor.offsetHeight}px)`;
    };
    updateHintPos();
    editor.addEventListener('input', updateHintPos);
    this.overlayEl.appendChild(hint);

    setTimeout(() => {
      editor.focus();
      // Select all text
      const range = document.createRange();
      range.selectNodeContents(editor);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }, 10);

    const commitAndClose = () => {
      if (!this.activeInlineEditor) return;
      const text = this.activeInlineEditor.innerText.trim();
      this.cleanupInlineEditor();
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
      } else {
        editorStore.deleteSelectedObject();
      }
    };

    editor.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        commitAndClose();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.cleanupInlineEditor();
        editorStore.setActiveTool('select');
      }
    });

    editor.addEventListener('blur', () => {
      setTimeout(commitAndClose, 80);
    });
  }

  private handleTextLayerPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
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
        this.startEditingExistingText(item);
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

    if (span) {
      span.classList.add('text-item-selected');
    }

    editorStore.selectExistingText(item.id);

    // Position action bar above or below the text bounds
    if (this.actionBarEl && this.viewport) {
      const screenRect = pdfRectToScreenRect(item.pdfBounds, this.viewport);
      this.actionBarEl.classList.remove('hidden');
      const pillTop = Math.max(8, screenRect.top - 38);
      const pillLeft = Math.max(8, screenRect.left);
      this.actionBarEl.style.top = `${pillTop}px`;
      this.actionBarEl.style.left = `${pillLeft}px`;
    }
  }

  public hideExistingTextActionBar(): void {
    if (this.actionBarEl) {
      this.actionBarEl.classList.add('hidden');
    }
    if (this.textLayerEl) {
      this.textLayerEl.querySelectorAll('.text-item-selected').forEach((el) => {
        el.classList.remove('text-item-selected');
      });
    }
  }

  public startEditingExistingText(item: ExistingPdfTextItem): void {
    if (!this.overlayEl || !this.viewport) return;
    this.hideExistingTextActionBar();
    this.cleanupInlineEditor();

    const screenRect = pdfRectToScreenRect(item.pdfBounds, this.viewport);

    // 1. Mount temporary whiteout mask behind the editor so the user sees the original text covered in real time
    const mask = document.createElement('div');
    mask.id = 'temp-whiteout-mask';
    mask.className = 'absolute bg-white z-40 rounded-xs pointer-events-none shadow-xs';
    mask.style.left = `${screenRect.left - 2}px`;
    mask.style.top = `${screenRect.top - 2}px`;
    mask.style.width = `${screenRect.width + 4}px`;
    mask.style.height = `${screenRect.height + 4}px`;
    this.overlayEl.appendChild(mask);
    this.tempWhiteoutMaskEl = mask;

    // 2. Mount inline contenteditable editor directly over the mask
    const editor = document.createElement('div');
    editor.id = 'active-inline-text-editor';
    editor.contentEditable = 'true';
    editor.className =
      'absolute outline-none min-w-[60px] p-0.5 bg-white dark:bg-[#1a2232] border-2 border-brand-500 rounded-xs shadow-lg text-slate-900 dark:text-white z-50';
    editor.style.left = `${screenRect.left - 2}px`;
    editor.style.top = `${screenRect.top - 2}px`;
    editor.style.minWidth = `${screenRect.width + 4}px`;
    editor.style.minHeight = `${screenRect.height + 4}px`;
    editor.style.fontFamily = item.fontFamily || 'Inter, sans-serif';
    editor.style.fontSize = `${item.fontSize * this.viewport.scale}px`;
    editor.style.fontWeight = item.fontWeight || 'normal';
    editor.style.fontStyle = item.fontStyle || 'normal';
    editor.style.lineHeight = '1.2';
    editor.innerText = item.text;

    this.overlayEl.appendChild(editor);
    this.activeInlineEditor = editor;

    setTimeout(() => {
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(editor);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }, 10);

    const commitAndClose = () => {
      if (!this.activeInlineEditor) return;
      const text = this.activeInlineEditor.innerText.trim();
      const editorRect = this.activeInlineEditor.getBoundingClientRect();
      const overlayRect = this.overlayEl ? this.overlayEl.getBoundingClientRect() : null;

      let finalWidth = item.pdfBounds.width;
      let finalHeight = item.pdfBounds.height;

      let measuredWidthPt = 0;
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.font = `${item.fontStyle || 'normal'} ${item.fontWeight || 'normal'} ${item.fontSize}px ${item.fontFamily || 'sans-serif'}`;
          measuredWidthPt = ctx.measureText(text).width;
        }
      } catch (e) {}

      if (editorRect && overlayRect && this.viewport) {
        const mappedRect = screenRectToPdfRect(
          {
            left: editorRect.left - overlayRect.left,
            top: editorRect.top - overlayRect.top,
            width: editorRect.width,
            height: editorRect.height,
          },
          this.viewport
        );
        finalWidth = Math.max(item.pdfBounds.width, mappedRect.width, measuredWidthPt + 6);
        finalHeight = Math.max(item.pdfBounds.height, mappedRect.height);
      } else {
        finalWidth = Math.max(item.pdfBounds.width, measuredWidthPt + 6);
      }

      this.cleanupInlineEditor();

      if (text.length > 0 && text !== item.text) {
        // Create replacement object
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
          height: Math.round(finalHeight),
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
    };

    editor.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        commitAndClose();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.cleanupInlineEditor();
        editorStore.selectExistingText(null);
        editorStore.setActiveTool('select');
      }
    });

    editor.addEventListener('blur', () => {
      setTimeout(commitAndClose, 80);
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
    if (this.activeInlineEditor && this.activeInlineEditor.parentElement) {
      this.activeInlineEditor.parentElement.removeChild(this.activeInlineEditor);
    }
    this.activeInlineEditor = null;

    const hint = document.getElementById('inline-editor-hint');
    if (hint) hint.remove();

    if (this.tempWhiteoutMaskEl && this.tempWhiteoutMaskEl.parentElement) {
      this.tempWhiteoutMaskEl.parentElement.removeChild(this.tempWhiteoutMaskEl);
    }
    this.tempWhiteoutMaskEl = null;
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
