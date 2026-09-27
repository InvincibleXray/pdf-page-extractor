/**
 * Core Editor State Management Module
 * Client-side only state model, decoupled from direct PDF rendering and UI templates.
 */

export type EditorTool =
  | 'select'
  | 'text'
  | 'image'
  | 'highlight'
  | 'underline'
  | 'strikethrough'
  | 'comment'
  | 'pen'
  | 'line'
  | 'arrow'
  | 'rectangle'
  | 'ellipse'
  | 'signature'
  | 'whiteout'
  | 'redact'
  | 'text-replacement'
  | 'form-text'
  | 'form-multiline'
  | 'form-checkbox'
  | 'form-radio'
  | 'form-dropdown'
  | 'form-listbox';

export interface BaseEditorObject {
  id: string;
  type: EditorTool;
  pageId?: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  zIndex: number;
}

export interface TextEditorObject extends BaseEditorObject {
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  textDecoration: 'none' | 'underline' | 'line-through';
  textAlign: 'left' | 'center' | 'right';
  color: string;
  backgroundColor?: string;
}

export interface TextReplacementEditorObject extends BaseEditorObject {
  type: 'text-replacement';
  sourceTextItemId: string; // references ExistingPdfTextItem.id
  originalText: string;     // text being replaced
  replacementText: string;  // new user-provided text
  fontSize: number;         // in PDF points
  fontFamily: string;       // font family
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  textDecoration: 'none' | 'underline';
  textAlign: 'left' | 'center' | 'right';
  color: string;            // text color
  backgroundColor: string;  // mask background color (default #ffffff)
  maskPadding: number;      // mask padding in points (default 2)
}

export interface ImageEditorObject extends BaseEditorObject {
  type: 'image';
  src: string;
  originalWidth: number;
  originalHeight: number;
  keepRatio: boolean;
}

export interface ShapeEditorObject extends BaseEditorObject {
  type: 'rectangle' | 'ellipse' | 'line' | 'arrow';
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: 'solid' | 'dashed';
  borderRadius?: number;
}

export interface AnnotationEditorObject extends BaseEditorObject {
  type: 'highlight' | 'underline' | 'strikethrough' | 'comment';
  color: string;
  strokeWidth?: number;
  commentText?: string;
  author?: string;
  createdAt?: string;
}

export interface PrivacyEditorObject extends BaseEditorObject {
  type: 'whiteout';
  fillColor: string;
}

export interface RedactionEditorObject extends BaseEditorObject {
  type: 'redact';
  status: 'draft' | 'applied';
  fillColor: string;
  overlayText?: string;
  fontSize?: number;
  textColor?: string;
  originalText?: string;
}

export interface PenEditorObject extends BaseEditorObject {
  type: 'pen';
  pathData: string;
  strokeColor: string;
  strokeWidth: number;
}

export type EditorObject =
  | TextEditorObject
  | TextReplacementEditorObject
  | ImageEditorObject
  | ShapeEditorObject
  | AnnotationEditorObject
  | PrivacyEditorObject
  | RedactionEditorObject
  | PenEditorObject;

export interface PageState {
  id: string;
  sourcePageIndex: number;
  originalPageNumber: number;
  pageNumber: number;
  width: number; // in points (default: 595.28 for A4)
  height: number; // in points (default: 841.89 for A4)
  orientation: 'portrait' | 'landscape';
  rotation: number;
}

export type EditorPageInfo = PageState;

export interface EditorDocumentInfo {
  name: string;
  fileSizeFormatted: string;
  pageCount: number;
  pages: PageState[];
  file: File | null;
}

export interface EditorViewportState {
  zoom: number; // 0.25 to 3.0 (1.0 = 100%)
  minZoom: number;
  maxZoom: number;
  fitMode: 'custom' | 'page' | 'width';
  isFullscreen: boolean;
}

export interface EditorStateSnapshot {
  document: EditorDocumentInfo | null;
  currentPage: number;
  activeTool: EditorTool;
  selectedObjectId: string | null;
  selectedExistingTextId: string | null;
  objects: EditorObject[];
  viewport: EditorViewportState;
  isLeftSidebarOpen: boolean;
  isInspectorOpen: boolean;
  isMobileDrawerOpen: boolean;
  isMobileInspectorOpen: boolean;
}

import { formStore } from './formState';

export interface EditorHistoryEntry {
  action: string;
  objects: EditorObject[];
  pages: PageState[];
  currentPage: number;
  formValues?: Record<string, any>;
}

type StateListener = (state: EditorStateSnapshot) => void;

class EditorStateManager {
  private state: EditorStateSnapshot;
  private listeners: Set<StateListener> = new Set();
  private historyPast: EditorHistoryEntry[] = [];
  private historyFuture: EditorHistoryEntry[] = [];

  constructor() {
    this.state = {
      document: null,
      currentPage: 1,
      activeTool: 'select',
      selectedObjectId: null,
      selectedExistingTextId: null,
      objects: [],
      viewport: {
        zoom: 1.0,
        minZoom: 0.1,
        maxZoom: 3.0,
        fitMode: 'page',
        isFullscreen: false,
      },
      isLeftSidebarOpen: true,
      isInspectorOpen: true,
      isMobileDrawerOpen: false,
      isMobileInspectorOpen: false,
    };

    formStore.registerHistoryHook((action, values) => {
      this.recordFormChange(action, values);
    });
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const current = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(current);
      } catch (err) {
        console.error('Error in editor state listener:', err);
      }
    }
  }

  public getState(): EditorStateSnapshot {
    return {
      ...this.state,
      viewport: { ...this.state.viewport },
      objects: [...this.state.objects],
      document: this.state.document
        ? {
            ...this.state.document,
            pages: this.state.document.pages.map((p) => ({ ...p })),
          }
        : null,
      selectedExistingTextId: this.state.selectedExistingTextId,
    };
  }

  public getCurrentPageState(): PageState | null {
    if (!this.state.document) return null;
    return this.state.document.pages[this.state.currentPage - 1] || null;
  }

  /**
   * Loads a real uploaded PDF file and page metrics.
   */
  public loadDocument(file: File, pageCount: number, dimensions?: { width: number; height: number; rotation?: number }[]): void {
    const pages: PageState[] = [];
    const sizeKB = (file.size / 1024).toFixed(1);
    const sizeStr = file.size > 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : `${sizeKB} KB`;

    for (let i = 1; i <= pageCount; i++) {
      const dim = dimensions && dimensions[i - 1] ? dimensions[i - 1] : { width: 595, height: 842 };
      const w = Math.round(dim.width);
      const h = Math.round(dim.height);
      const rot = (dim as any)?.rotation !== undefined ? (dim as any).rotation : 0;
      pages.push({
        id: `page_${i}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        sourcePageIndex: i - 1,
        originalPageNumber: i,
        pageNumber: i,
        width: w,
        height: h,
        orientation: w > h ? 'landscape' : 'portrait',
        rotation: rot,
      });
    }

    this.state.document = {
      name: file.name,
      fileSizeFormatted: sizeStr,
      pageCount,
      pages,
      file,
    };
    this.state.currentPage = 1;
    this.state.selectedObjectId = null;
    this.state.selectedExistingTextId = null;
    this.state.objects = [];
    this.historyPast = [];
    this.historyFuture = [];
    this.notify();
  }


  public setCurrentPage(page: number): void {
    if (!this.state.document) return;
    const clamped = Math.max(1, Math.min(page, this.state.document.pageCount));
    if (this.state.currentPage !== clamped) {
      this.state.currentPage = clamped;
      this.state.selectedObjectId = null;
      this.state.selectedExistingTextId = null;
      this.notify();
    }
  }

  public nextPage(): void {
    if (!this.state.document) return;
    this.setCurrentPage(this.state.currentPage + 1);
  }

  public prevPage(): void {
    if (!this.state.document) return;
    this.setCurrentPage(this.state.currentPage - 1);
  }

  public setActiveTool(tool: EditorTool): void {
    if (this.state.activeTool !== tool) {
      this.state.activeTool = tool;
      if (tool !== 'select') {
        this.state.selectedObjectId = null;
        this.state.selectedExistingTextId = null;
      }
      this.notify();
    }
  }

  public selectObject(id: string | null): void {
    if (this.state.selectedObjectId !== id) {
      this.state.selectedObjectId = id;
      if (id) {
        this.state.selectedExistingTextId = null;
        // If an object is selected on mobile, open mobile inspector
        this.state.isMobileInspectorOpen = true;
      }
      this.notify();
    }
  }

  public selectExistingText(id: string | null): void {
    if (this.state.selectedExistingTextId !== id) {
      this.state.selectedExistingTextId = id;
      if (id) {
        this.state.selectedObjectId = null;
      }
      this.notify();
    }
  }

  public getSelectedExistingTextId(): string | null {
    return this.state.selectedExistingTextId;
  }

  public getSelectedObject(): EditorObject | null {
    if (!this.state.selectedObjectId) return null;
    return this.state.objects.find((o) => o.id === this.state.selectedObjectId) || null;
  }

  public getPageObjects(pageNum?: number): EditorObject[] {
    const page = pageNum !== undefined ? pageNum : this.state.currentPage;
    const pageState = this.state.document?.pages[page - 1];
    if (!pageState) return [];
    return this.state.objects.filter((obj) => {
      if (obj.pageId) {
        return obj.pageId === pageState.id;
      }
      return obj.pageNumber === page;
    });
  }

  public addObject(obj: EditorObject, recordHistory = true): void {
    if (recordHistory) this.saveHistory('ADD_OBJECT');
    const curPageState = this.getCurrentPageState();
    if (curPageState && !obj.pageId) {
      obj.pageId = curPageState.id;
    }
    if (obj.type === 'pen') {
      const pen = obj as any;
      if (!pen.pathData && pen.points && Array.isArray(pen.points) && pen.points.length > 0) {
        let d = `M ${pen.points[0].x} ${pen.points[0].y}`;
        for (let i = 1; i < pen.points.length; i++) {
          d += ` L ${pen.points[i].x} ${pen.points[i].y}`;
        }
        pen.pathData = d;
      }
      if (!pen.pathData || pen.pathData.includes('undefined') || pen.pathData.includes('NaN')) {
        pen.pathData = 'M 0 0';
      }
    }
    this.state.objects.push(obj);
    this.state.selectedObjectId = obj.id;
    this.notify();
  }

  public updateObject(id: string, updates: Partial<EditorObject>, recordHistory = true): void {
    if (recordHistory) this.saveHistory('UPDATE_OBJECT');
    this.state.objects = this.state.objects.map((obj) => {
      if (obj.id === id) {
        return { ...obj, ...updates } as EditorObject;
      }
      return obj;
    });
    this.notify();
  }

  public recordHistorySnapshot(action = 'TRANSACTION'): void {
    this.saveHistory(action);
  }

  public updateSelectedObject(updates: Partial<EditorObject>, recordHistory = true): void {
    if (!this.state.selectedObjectId) return;
    if (recordHistory) this.saveHistory('UPDATE_OBJECT');
    this.state.objects = this.state.objects.map((obj) => {
      if (obj.id === this.state.selectedObjectId) {
        return { ...obj, ...updates } as EditorObject;
      }
      return obj;
    });
    this.notify();
  }

  public deleteSelectedObject(): void {
    if (!this.state.selectedObjectId) return;
    this.saveHistory('DELETE_OBJECT');
    this.state.objects = this.state.objects.filter((obj) => obj.id !== this.state.selectedObjectId);
    this.state.selectedObjectId = null;
    this.notify();
  }

  public duplicateSelectedObject(): EditorObject | null {
    if (!this.state.selectedObjectId) return null;
    const orig = this.state.objects.find((o) => o.id === this.state.selectedObjectId);
    if (!orig) return null;
    this.saveHistory('DUPLICATE_OBJECT');
    const newId = `${orig.type}-${Date.now()}`;
    const clone: EditorObject = {
      ...JSON.parse(JSON.stringify(orig)),
      id: newId,
      x: orig.x + 20,
      y: orig.y + 20,
    };
    this.state.objects.push(clone);
    this.state.selectedObjectId = newId;
    this.notify();
    return clone;
  }

  // --- PAGE LEVEL OPERATIONS ---

  /**
   * Rotates a page by 90° clockwise (or custom degreesDelta).
   */
  public rotatePage(pageNum: number, degreesDelta = 90): void {
    if (!this.state.document) return;
    const targetIdx = pageNum - 1;
    const page = this.state.document.pages[targetIdx];
    if (!page) return;

    this.saveHistory('ROTATE_PAGE');
    page.rotation = (page.rotation + degreesDelta) % 360;
    if (page.rotation < 0) page.rotation += 360;
    this.notify();
  }

  public rotateCurrentPage(degreesDelta = 90): void {
    this.rotatePage(this.state.currentPage, degreesDelta);
  }

  /**
   * Duplicates a page and all its attached editor objects.
   */
  public duplicatePage(pageNum?: number): void {
    if (!this.state.document) return;
    const targetPageNum = pageNum !== undefined ? pageNum : this.state.currentPage;
    const targetIdx = targetPageNum - 1;
    const sourcePage = this.state.document.pages[targetIdx];
    if (!sourcePage) return;

    this.saveHistory('DUPLICATE_PAGE');

    const newPageId = `page_dup_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newPage: PageState = {
      ...JSON.parse(JSON.stringify(sourcePage)),
      id: newPageId,
      pageNumber: targetPageNum + 1,
    };

    // Duplicate all objects currently attached to this page
    const pageObjects = this.state.objects.filter((o) =>
      o.pageId ? o.pageId === sourcePage.id : o.pageNumber === targetPageNum
    );

    const clonedObjects: EditorObject[] = pageObjects.map((obj) => ({
      ...JSON.parse(JSON.stringify(obj)),
      id: `${obj.type}_dup_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      pageId: newPageId,
      pageNumber: targetPageNum + 1,
    }));

    // Insert new page right after the source page
    this.state.document.pages.splice(targetIdx + 1, 0, newPage);
    this.state.document.pageCount = this.state.document.pages.length;

    // Resequence page numbers on pages and objects
    this.resequencePagesAndObjects();

    // Add cloned objects
    this.state.objects.push(...clonedObjects);

    // Duplicate AcroForm fields on this page with safe independent re-keying (_copy1)
    if (formStore) {
      formStore.duplicatePageFormFields(targetPageNum, targetPageNum + 1);
    }

    // Switch to newly duplicated page
    this.state.currentPage = targetPageNum + 1;
    this.state.selectedObjectId = null;
    this.state.selectedExistingTextId = null;
    this.notify();
  }

  /**
   * Deletes a page and removes its attached objects.
   * Prevents deleting the only remaining page without confirmation.
   */
  public deletePage(pageNum?: number): boolean {
    if (!this.state.document) return false;
    const targetPageNum = pageNum !== undefined ? pageNum : this.state.currentPage;
    const targetIdx = targetPageNum - 1;
    const page = this.state.document.pages[targetIdx];
    if (!page) return false;

    if (this.state.document.pages.length <= 1) {
      return false; // Cannot delete only page
    }

    this.saveHistory('DELETE_PAGE');

    // Remove objects for this page
    this.state.objects = this.state.objects.filter((o) =>
      o.pageId ? o.pageId !== page.id : o.pageNumber !== targetPageNum
    );

    // Remove page
    this.state.document.pages.splice(targetIdx, 1);
    this.state.document.pageCount = this.state.document.pages.length;

    // Resequence page numbers
    this.resequencePagesAndObjects();

    // Navigate to a valid neighbor page
    this.state.currentPage = Math.max(1, Math.min(targetPageNum, this.state.document.pageCount));
    this.state.selectedObjectId = null;
    this.state.selectedExistingTextId = null;
    this.notify();
    return true;
  }

  /**
   * Reorders pages by moving a page from fromIndex to toIndex.
   */
  public reorderPages(fromIndex: number, toIndex: number): void {
    if (!this.state.document) return;
    const pages = this.state.document.pages;
    if (fromIndex < 0 || fromIndex >= pages.length || toIndex < 0 || toIndex >= pages.length) return;
    if (fromIndex === toIndex) return;

    this.saveHistory('REORDER_PAGES');

    const [movedPage] = pages.splice(fromIndex, 1);
    pages.splice(toIndex, 0, movedPage);

    this.resequencePagesAndObjects();
    this.state.currentPage = toIndex + 1;
    this.state.selectedObjectId = null;
    this.state.selectedExistingTextId = null;
    this.notify();
  }

  public movePageUp(pageNum?: number): void {
    const targetPageNum = pageNum !== undefined ? pageNum : this.state.currentPage;
    const idx = targetPageNum - 1;
    if (idx > 0) {
      this.reorderPages(idx, idx - 1);
    }
  }

  public movePageDown(pageNum?: number): void {
    if (!this.state.document) return;
    const targetPageNum = pageNum !== undefined ? pageNum : this.state.currentPage;
    const idx = targetPageNum - 1;
    if (idx < this.state.document.pages.length - 1) {
      this.reorderPages(idx, idx + 1);
    }
  }

  private resequencePagesAndObjects(): void {
    if (!this.state.document) return;
    const pageIdToNumber = new Map<string, number>();
    this.state.document.pages.forEach((p, idx) => {
      p.pageNumber = idx + 1;
      pageIdToNumber.set(p.id, idx + 1);
    });

    this.state.objects.forEach((obj) => {
      if (obj.pageId && pageIdToNumber.has(obj.pageId)) {
        obj.pageNumber = pageIdToNumber.get(obj.pageId)!;
      }
    });
  }

  public setZoom(zoom: number): void {
    const clamped = Math.max(this.state.viewport.minZoom, Math.min(zoom, this.state.viewport.maxZoom));
    const rounded = Math.round(clamped * 100) / 100;
    if (this.state.viewport.zoom !== rounded) {
      this.state.viewport.zoom = rounded;
      this.state.viewport.fitMode = 'custom';
      this.notify();
    }
  }

  public zoomIn(): void {
    const steps = [0.1, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0];
    const current = this.state.viewport.zoom;
    const next = steps.find((s) => s > current + 0.05) || this.state.viewport.maxZoom;
    this.setZoom(next);
  }

  public zoomOut(): void {
    const steps = [0.1, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0];
    const current = this.state.viewport.zoom;
    const reversed = [...steps].reverse();
    const prev = reversed.find((s) => s < current - 0.05) || this.state.viewport.minZoom;
    this.setZoom(prev);
  }

  public setFitMode(mode: 'custom' | 'page' | 'width'): void {
    this.state.viewport.fitMode = mode;
    if (mode === 'page') {
      this.state.viewport.zoom = 1.0;
    } else if (mode === 'width') {
      this.state.viewport.zoom = 1.25;
    }
    this.notify();
  }

  public toggleLeftSidebar(open?: boolean): void {
    this.state.isLeftSidebarOpen = open !== undefined ? open : !this.state.isLeftSidebarOpen;
    this.notify();
  }

  public toggleInspector(open?: boolean): void {
    this.state.isInspectorOpen = open !== undefined ? open : !this.state.isInspectorOpen;
    this.notify();
  }

  public toggleMobileDrawer(open?: boolean): void {
    this.state.isMobileDrawerOpen = open !== undefined ? open : !this.state.isMobileDrawerOpen;
    this.notify();
  }

  public toggleMobileInspector(open?: boolean): void {
    this.state.isMobileInspectorOpen = open !== undefined ? open : !this.state.isMobileInspectorOpen;
    this.notify();
  }

  public toggleFullscreen(): void {
    this.state.viewport.isFullscreen = !this.state.viewport.isFullscreen;
    if (typeof document !== 'undefined') {
      if (this.state.viewport.isFullscreen && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else if (!this.state.viewport.isFullscreen && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    }
    this.notify();
  }

  public recordFormChange(action: string, formValues: Record<string, any>): void {
    if (!this.state.document) return;
    this.historyPast.push({
      action,
      objects: JSON.parse(JSON.stringify(this.state.objects)),
      pages: JSON.parse(JSON.stringify(this.state.document.pages)),
      currentPage: this.state.currentPage,
      formValues: { ...formValues },
    });
    if (this.historyPast.length > 40) {
      this.historyPast.shift();
    }
    this.historyFuture = [];
    this.notify();
  }

  private saveHistory(action: string = 'STATE_CHANGE'): void {
    if (!this.state.document) return;
    this.historyPast.push({
      action,
      objects: JSON.parse(JSON.stringify(this.state.objects)),
      pages: JSON.parse(JSON.stringify(this.state.document.pages)),
      currentPage: this.state.currentPage,
      formValues: formStore ? formStore.getAllFieldValues() : undefined,
    });
    if (this.historyPast.length > 40) {
      this.historyPast.shift();
    }
    this.historyFuture = [];
  }

  public undo(): void {
    if (this.historyPast.length === 0 || !this.state.document) return;
    const currentEntry: EditorHistoryEntry = {
      action: 'CURRENT',
      objects: JSON.parse(JSON.stringify(this.state.objects)),
      pages: JSON.parse(JSON.stringify(this.state.document.pages)),
      currentPage: this.state.currentPage,
      formValues: formStore ? formStore.getAllFieldValues() : undefined,
    };
    const previous = this.historyPast.pop()!;
    this.historyFuture.push(currentEntry);

    this.state.objects = previous.objects;
    this.state.document.pages = previous.pages;
    this.state.document.pageCount = previous.pages.length;
    this.resequencePagesAndObjects();
    this.state.currentPage = Math.max(1, Math.min(previous.currentPage, previous.pages.length));
    this.state.selectedObjectId = null;
    this.state.selectedExistingTextId = null;

    if (previous.formValues && formStore) {
      formStore.restoreFieldValues(previous.formValues);
    }

    this.notify();
  }

  public redo(): void {
    if (this.historyFuture.length === 0 || !this.state.document) return;
    const currentEntry: EditorHistoryEntry = {
      action: 'CURRENT',
      objects: JSON.parse(JSON.stringify(this.state.objects)),
      pages: JSON.parse(JSON.stringify(this.state.document.pages)),
      currentPage: this.state.currentPage,
      formValues: formStore ? formStore.getAllFieldValues() : undefined,
    };
    const next = this.historyFuture.pop()!;
    this.historyPast.push(currentEntry);

    this.state.objects = next.objects;
    this.state.document.pages = next.pages;
    this.state.document.pageCount = next.pages.length;
    this.resequencePagesAndObjects();
    this.state.currentPage = Math.max(1, Math.min(next.currentPage, next.pages.length));
    this.state.selectedObjectId = null;
    this.state.selectedExistingTextId = null;

    if (next.formValues && formStore) {
      formStore.restoreFieldValues(next.formValues);
    }

    this.notify();
  }

  public reset(): void {
    this.state.document = null;
    this.state.currentPage = 1;
    this.state.selectedObjectId = null;
    this.state.objects = [];
    this.state.isMobileDrawerOpen = false;
    this.state.isMobileInspectorOpen = false;
    this.historyPast = [];
    this.historyFuture = [];
    this.notify();
  }
}

// Global browser singleton
export const editorStore = new EditorStateManager();
