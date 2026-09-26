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
  | 'redact';

export interface BaseEditorObject {
  id: string;
  type: EditorTool;
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
  commentText?: string;
  author?: string;
  createdAt?: string;
}

export interface PrivacyEditorObject extends BaseEditorObject {
  type: 'whiteout' | 'redact';
  fillColor: string;
}

export interface PenEditorObject extends BaseEditorObject {
  type: 'pen';
  pathData: string;
  strokeColor: string;
  strokeWidth: number;
}

export type EditorObject =
  | TextEditorObject
  | ImageEditorObject
  | ShapeEditorObject
  | AnnotationEditorObject
  | PrivacyEditorObject
  | PenEditorObject;

export interface EditorPageInfo {
  pageNumber: number;
  width: number; // in points (default: 595.28 for A4)
  height: number; // in points (default: 841.89 for A4)
  orientation: 'portrait' | 'landscape';
  rotation: number;
}

export interface EditorDocumentInfo {
  name: string;
  fileSizeFormatted: string;
  pageCount: number;
  pages: EditorPageInfo[];
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
  objects: EditorObject[];
  viewport: EditorViewportState;
  isLeftSidebarOpen: boolean;
  isInspectorOpen: boolean;
  isMobileDrawerOpen: boolean;
  isMobileInspectorOpen: boolean;
}

type StateListener = (state: EditorStateSnapshot) => void;

class EditorStateManager {
  private state: EditorStateSnapshot;
  private listeners: Set<StateListener> = new Set();
  private historyPast: EditorObject[][] = [];
  private historyFuture: EditorObject[][] = [];

  constructor() {
    this.state = {
      document: null,
      currentPage: 1,
      activeTool: 'select',
      selectedObjectId: null,
      objects: [],
      viewport: {
        zoom: 1.0,
        minZoom: 0.25,
        maxZoom: 3.0,
        fitMode: 'page',
        isFullscreen: false,
      },
      isLeftSidebarOpen: true,
      isInspectorOpen: true,
      isMobileDrawerOpen: false,
      isMobileInspectorOpen: false,
    };
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
      document: this.state.document ? { ...this.state.document } : null,
    };
  }

  /**
   * Loads a real uploaded PDF file and page metrics.
   */
  public loadDocument(file: File, pageCount: number, dimensions?: { width: number; height: number }[]): void {
    const pages: EditorPageInfo[] = [];
    const sizeKB = (file.size / 1024).toFixed(1);
    const sizeStr = file.size > 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : `${sizeKB} KB`;

    for (let i = 1; i <= pageCount; i++) {
      const dim = dimensions && dimensions[i - 1] ? dimensions[i - 1] : { width: 595, height: 842 };
      pages.push({
        pageNumber: i,
        width: Math.round(dim.width),
        height: Math.round(dim.height),
        orientation: dim.width > dim.height ? 'landscape' : 'portrait',
        rotation: 0,
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
    this.state.objects = [];
    this.historyPast = [];
    this.historyFuture = [];
    this.notify();
  }

  /**
   * Initializes with a sample document for instant browser testing.
   */
  public loadSampleDocument(): void {
    const pages: EditorPageInfo[] = [
      { pageNumber: 1, width: 595, height: 842, orientation: 'portrait', rotation: 0 },
      { pageNumber: 2, width: 595, height: 842, orientation: 'portrait', rotation: 0 },
      { pageNumber: 3, width: 595, height: 842, orientation: 'portrait', rotation: 0 },
    ];

    this.state.document = {
      name: 'Sample Agreement.pdf',
      fileSizeFormatted: '245 KB',
      pageCount: 3,
      pages,
      file: null,
    };
    this.state.currentPage = 1;
    this.state.selectedObjectId = 'demo-text-1';
    this.state.objects = this.createDefaultDemoObjects();
    this.historyPast = [];
    this.historyFuture = [];
    this.notify();
  }

  private createDefaultDemoObjects(): EditorObject[] {
    return [
      {
        id: 'demo-highlight-1',
        type: 'highlight',
        pageNumber: 1,
        x: 48,
        y: 110,
        width: 320,
        height: 24,
        rotation: 0,
        opacity: 0.35,
        zIndex: 1,
        color: '#facc15',
      },
      {
        id: 'demo-text-1',
        type: 'text',
        pageNumber: 1,
        x: 48,
        y: 155,
        width: 380,
        height: 52,
        rotation: 0,
        opacity: 1,
        zIndex: 2,
        text: 'Standard Confidentiality & Non-Disclosure Agreement',
        fontFamily: 'Inter',
        fontSize: 16,
        fontWeight: 'bold',
        fontStyle: 'normal',
        textDecoration: 'none',
        textAlign: 'left',
        color: '#0f172a',
      },
      {
        id: 'demo-shape-1',
        type: 'rectangle',
        pageNumber: 1,
        x: 48,
        y: 230,
        width: 499,
        height: 110,
        rotation: 0,
        opacity: 1,
        zIndex: 3,
        fillColor: '#eff6ff',
        strokeColor: '#3b82f6',
        strokeWidth: 1.5,
        strokeStyle: 'solid',
        borderRadius: 8,
      },
      {
        id: 'demo-text-2',
        type: 'text',
        pageNumber: 1,
        x: 64,
        y: 250,
        width: 467,
        height: 70,
        rotation: 0,
        opacity: 1,
        zIndex: 4,
        text: 'This document is processed 100% locally in your browser session. No data is sent to external servers.',
        fontFamily: 'Inter',
        fontSize: 13,
        fontWeight: 'normal',
        fontStyle: 'normal',
        textDecoration: 'none',
        textAlign: 'left',
        color: '#1e3a8a',
      },
    ];
  }

  public setCurrentPage(page: number): void {
    if (!this.state.document) return;
    const clamped = Math.max(1, Math.min(page, this.state.document.pageCount));
    if (this.state.currentPage !== clamped) {
      this.state.currentPage = clamped;
      this.state.selectedObjectId = null;
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
      }
      this.notify();
    }
  }

  public selectObject(id: string | null): void {
    if (this.state.selectedObjectId !== id) {
      this.state.selectedObjectId = id;
      if (id) {
        // If an object is selected on mobile, open mobile inspector
        this.state.isMobileInspectorOpen = true;
      }
      this.notify();
    }
  }

  public getSelectedObject(): EditorObject | null {
    if (!this.state.selectedObjectId) return null;
    return this.state.objects.find((o) => o.id === this.state.selectedObjectId) || null;
  }

  public getPageObjects(pageNum?: number): EditorObject[] {
    const page = pageNum !== undefined ? pageNum : this.state.currentPage;
    return this.state.objects.filter((obj) => obj.pageNumber === page);
  }

  public addObject(obj: EditorObject, recordHistory = true): void {
    if (recordHistory) this.saveHistory();
    this.state.objects.push(obj);
    this.state.selectedObjectId = obj.id;
    this.notify();
  }

  public updateObject(id: string, updates: Partial<EditorObject>, recordHistory = true): void {
    if (recordHistory) this.saveHistory();
    this.state.objects = this.state.objects.map((obj) => {
      if (obj.id === id) {
        return { ...obj, ...updates } as EditorObject;
      }
      return obj;
    });
    this.notify();
  }

  public recordHistorySnapshot(): void {
    this.saveHistory();
  }

  public updateSelectedObject(updates: Partial<EditorObject>, recordHistory = true): void {
    if (!this.state.selectedObjectId) return;
    if (recordHistory) this.saveHistory();
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
    this.saveHistory();
    this.state.objects = this.state.objects.filter((obj) => obj.id !== this.state.selectedObjectId);
    this.state.selectedObjectId = null;
    this.notify();
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
    const steps = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0];
    const current = this.state.viewport.zoom;
    const next = steps.find((s) => s > current + 0.05) || this.state.viewport.maxZoom;
    this.setZoom(next);
  }

  public zoomOut(): void {
    const steps = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0];
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

  private saveHistory(): void {
    this.historyPast.push(JSON.parse(JSON.stringify(this.state.objects)));
    if (this.historyPast.length > 30) {
      this.historyPast.shift();
    }
    this.historyFuture = [];
  }

  public undo(): void {
    if (this.historyPast.length === 0) return;
    const previous = this.historyPast.pop()!;
    this.historyFuture.push(JSON.parse(JSON.stringify(this.state.objects)));
    this.state.objects = previous;
    this.state.selectedObjectId = null;
    this.notify();
  }

  public redo(): void {
    if (this.historyFuture.length === 0) return;
    const next = this.historyFuture.pop()!;
    this.historyPast.push(JSON.parse(JSON.stringify(this.state.objects)));
    this.state.objects = next;
    this.state.selectedObjectId = null;
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
