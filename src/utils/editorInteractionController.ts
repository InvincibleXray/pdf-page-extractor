import type { PageViewport } from 'pdfjs-dist';
import {
  editorStore,
  type EditorObject,
  type TextEditorObject,
  type ShapeEditorObject,
  type AnnotationEditorObject,
  type PrivacyEditorObject,
  type PenEditorObject,
  type EditorTool,
} from './editorState';
import {
  screenToPdfPoint,
  pdfPointToScreen,
  screenRectToPdfRect,
  pdfRectToScreenRect,
} from './coordinateMapper';

export class EditorInteractionController {
  private overlayEl: HTMLElement | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private viewport: PageViewport | null = null;

  // Active interaction state
  private isInteracting = false;
  private interactionMode: 'idle' | 'create-shape' | 'draw-pen' | 'move-object' | 'resize-object' = 'idle';
  private startPointer = { x: 0, y: 0 };
  private startObjectBounds = { x: 0, y: 0, width: 0, height: 0 };
  private activeResizeHandle: string | null = null;
  private penPoints: { x: number; y: number }[] = [];
  private ghostEl: HTMLElement | null = null;
  private activeInlineEditor: HTMLElement | null = null;

  // Bound event listeners
  private boundPointerDown: (e: PointerEvent) => void;
  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerUp: (e: PointerEvent) => void;
  private boundKeyDown: (e: KeyboardEvent) => void;

  constructor() {
    this.boundPointerDown = this.handlePointerDown.bind(this);
    this.boundPointerMove = this.handlePointerMove.bind(this);
    this.boundPointerUp = this.handlePointerUp.bind(this);
    this.boundKeyDown = this.handleKeyDown.bind(this);
  }

  public attach(overlayEl: HTMLElement, canvasEl: HTMLCanvasElement): void {
    this.overlayEl = overlayEl;
    this.canvasEl = canvasEl;

    this.overlayEl.addEventListener('pointerdown', this.boundPointerDown);
    window.addEventListener('pointermove', this.boundPointerMove);
    window.addEventListener('pointerup', this.boundPointerUp);
    window.addEventListener('keydown', this.boundKeyDown);
  }

  public detach(): void {
    if (this.overlayEl) {
      this.overlayEl.removeEventListener('pointerdown', this.boundPointerDown);
    }
    window.removeEventListener('pointermove', this.boundPointerMove);
    window.removeEventListener('pointerup', this.boundPointerUp);
    window.removeEventListener('keydown', this.boundKeyDown);
    this.cleanupInlineEditor();
    this.cleanupGhost();
  }

  public setViewport(viewport: PageViewport): void {
    this.viewport = viewport;
  }

  private handlePointerDown(e: PointerEvent): void {
    if (!this.overlayEl || !this.canvasEl || !this.viewport) return;
    if (e.button !== 0) return; // Main left click only

    const target = e.target as HTMLElement;

    // Check if clicking on resize handles
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

    // If clicking on an existing object when in select mode
    const objectEl = target.closest('[data-object-id]') as HTMLElement | null;
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

    // Double click on text object opens inline editor
    if (objectEl && e.detail === 2) {
      const id = objectEl.getAttribute('data-object-id');
      const obj = state.objects.find((o) => o.id === id);
      if (obj && obj.type === 'text') {
        e.preventDefault();
        this.openInlineTextEditor(obj as TextEditorObject);
        return;
      }
    }

    // Text tool: click-to-type lifecycle
    if (activeTool === 'text') {
      e.preventDefault();
      this.createInlineTextEditorAt(e.clientX, e.clientY);
      return;
    }

    // Shapes creation: drag-to-create
    if (
      activeTool === 'rectangle' ||
      activeTool === 'ellipse' ||
      activeTool === 'line' ||
      activeTool === 'arrow' ||
      activeTool === 'whiteout' ||
      activeTool === 'highlight'
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
    if (activeTool === 'select' && !objectEl) {
      editorStore.selectObject(null);
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.isInteracting || !this.overlayEl || !this.canvasEl || !this.viewport) return;

    const canvasRect = this.canvasEl.getBoundingClientRect();
    const curCssX = e.clientX - canvasRect.left;
    const curCssY = e.clientY - canvasRect.top;

    if (this.interactionMode === 'create-shape' && this.ghostEl) {
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

        if (activeTool === 'whiteout') {
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
    } else if (this.interactionMode === 'move-object' || this.interactionMode === 'resize-object') {
      // Commit one consolidated history transaction on gesture finish
      editorStore.recordHistorySnapshot();
    }

    this.isInteracting = false;
    this.interactionMode = 'idle';
    this.activeResizeHandle = null;
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.activeInlineEditor) return; // Let inline editor handle its own keys

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
      const selected = editorStore.getSelectedObject();
      if (selected) {
        e.preventDefault();
        editorStore.deleteSelectedObject();
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
   * Reopens inline editor for an existing text object.
   */
  private openInlineTextEditor(obj: TextEditorObject): void {
    if (!this.overlayEl || !this.viewport) return;
    this.cleanupInlineEditor();

    const screenRect = pdfRectToScreenRect(obj, this.viewport);

    const editor = document.createElement('div');
    editor.id = 'active-inline-text-editor';
    editor.contentEditable = 'true';
    editor.className =
      'absolute outline-none min-w-[80px] p-1.5 bg-white dark:bg-[#1a2232] border-2 border-brand-500 rounded-md shadow-lg text-slate-900 dark:text-white z-50';
    editor.style.left = `${screenRect.left}px`;
    editor.style.top = `${screenRect.top}px`;
    editor.style.width = `${Math.max(screenRect.width, 100)}px`;
    editor.style.fontFamily = obj.fontFamily;
    editor.style.fontSize = `${obj.fontSize * this.viewport.scale}px`;
    editor.style.fontWeight = obj.fontWeight;
    editor.style.fontStyle = obj.fontStyle;
    editor.style.color = obj.color;
    editor.innerText = obj.text;

    this.overlayEl.appendChild(editor);
    this.activeInlineEditor = editor;

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
        editorStore.updateObject(obj.id, { text }, true);
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
      }
    });

    editor.addEventListener('blur', () => {
      setTimeout(commitAndClose, 50);
    });
  }

  private cleanupInlineEditor(): void {
    if (this.activeInlineEditor && this.activeInlineEditor.parentElement) {
      this.activeInlineEditor.parentElement.removeChild(this.activeInlineEditor);
    }
    this.activeInlineEditor = null;
  }

  private initGhost(tool: EditorTool): void {
    if (!this.overlayEl) return;
    this.cleanupGhost();

    const ghost = document.createElement('div');
    ghost.id = 'active-ghost-preview';
    ghost.className = 'absolute pointer-events-none z-40';

    if (tool === 'rectangle') {
      ghost.className += ' border-2 border-dashed border-brand-500 bg-brand-500/10 rounded';
    } else if (tool === 'ellipse') {
      ghost.className += ' border-2 border-dashed border-brand-500 bg-brand-500/10 rounded-full';
    } else if (tool === 'whiteout') {
      ghost.className += ' bg-white border border-slate-300 shadow-md';
    } else if (tool === 'highlight') {
      ghost.className += ' bg-yellow-400/40 border border-yellow-500/50 rounded-xs';
    } else if (tool === 'pen') {
      ghost.innerHTML = `<svg class="w-full h-full absolute inset-0 overflow-visible"><path d="" stroke="#2563eb" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
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
