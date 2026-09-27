/**
 * Custom Accessible Form Overlay (Layer 2.5) Controller
 * 
 * Authoritatively discovers page widgets via PDF.js, maintains PageViewport
 * geometry across 0°, 90°, 180°, 270° and zoom levels, renders native
 * accessible HTML controls, and binds to FormStateManager.
 */
import type { PageViewport, PDFPageProxy } from 'pdfjs-dist';
import { formStore, type FormFieldState, type FormWidgetState, type FormFieldType } from './formState';

export class PdfFormOverlayManager {
  private containerEl: HTMLElement | null = null;
  private currentViewport: PageViewport | null = null;
  private currentPageNumber: number = 1;
  private textDebounceTimers: Map<string, any> = new Map();
  private isRendering = false;

  public attach(containerEl: HTMLElement): void {
    this.containerEl = containerEl;
  }

  public detach(): void {
    this.clear();
    this.containerEl = null;
    this.currentViewport = null;
  }

  public clear(): void {
    // Clear any pending debounce timers
    for (const timer of this.textDebounceTimers.values()) {
      clearTimeout(timer);
    }
    this.textDebounceTimers.clear();

    if (this.containerEl) {
      this.containerEl.innerHTML = '';
    }
  }

  /**
   * Lazily discovers form widgets on the active page via PDF.js
   * and populates the FormStateManager.
   */
  public async discoverPageWidgets(pageProxy: PDFPageProxy, pageNumber: number): Promise<void> {
    if (formStore.isPageDiscovered(pageNumber)) {
      return;
    }

    try {
      const annotations = await pageProxy.getAnnotations({ intent: 'display' });
      const widgetAnnots = annotations.filter((a: any) => a.subtype === 'Widget');

      for (const a of widgetAnnots) {
        const fieldName = a.fieldName || `unnamed_field_${a.id}`;
        const fieldType = this.mapPdfJsFieldType(a);

        // Parse options for choice fields
        let options: Array<{ label: string; value: string }> = [];
        if (Array.isArray(a.options)) {
          options = a.options.map((opt: any) => {
            if (typeof opt === 'string') return { label: opt, value: opt };
            return {
              label: opt.displayValue || opt.exportValue || String(opt),
              value: opt.exportValue || opt.displayValue || String(opt),
            };
          });
        }

        // Determine value
        let val: any = '';
        if (fieldType === 'checkbox') {
          val = a.fieldValue === 'Yes' || a.fieldValue === a.exportValue || a.fieldValue === true;
        } else if (fieldType === 'radio') {
          val = a.fieldValue || '';
        } else if (fieldType === 'listbox') {
          val = Array.isArray(a.fieldValue) ? a.fieldValue : a.fieldValue ? [a.fieldValue] : [];
        } else {
          val = a.fieldValue !== undefined && a.fieldValue !== null ? String(a.fieldValue) : '';
        }

        const widgetState: FormWidgetState = {
          widgetId: a.id,
          fieldId: fieldName,
          pageNumber,
          pdfRect: a.rect as [number, number, number, number],
          rotation: a.rotation || 0,
          hidden: !!a.hidden || (a.annotationFlags && (a.annotationFlags & 2) !== 0),
          readOnly: !!a.readOnly,
          exportValue: a.buttonValue !== undefined ? a.buttonValue : (a.exportValue !== undefined ? a.exportValue : a.appearanceState),
          appearanceState: a.appearanceState,
          hasAppearance: a.hasAppearance,
        };

        const fieldMeta: Partial<FormFieldState> = {
          type: fieldType,
          value: val,
          required: !!a.required,
          readOnly: !!a.readOnly,
          hidden: widgetState.hidden,
          disabled: !!a.readOnly,
          tooltip: a.alternativeText,
          maxLength: a.maxLen,
          multiline: !!a.multiLine,
          password: !!a.password,
          comb: !!a.comb,
          alignment: a.textAlignment === 1 ? 'center' : a.textAlignment === 2 ? 'right' : 'left',
          options,
        };

        formStore.registerWidget(widgetState, fieldMeta);
      }

      formStore.markPageDiscovered(pageNumber);
    } catch (err) {
      console.error(`Failed to discover widgets for page ${pageNumber}:`, err);
    }
  }

  /**
   * Authoritative mapping of PDF.js annotation types to FormFieldType
   */
  private mapPdfJsFieldType(annot: any): FormFieldType {
    if (annot.fieldType === 'Tx') {
      if (annot.multiLine) return 'multiline';
      if (annot.password) return 'password';
      return 'text';
    }
    if (annot.fieldType === 'Btn') {
      if (annot.radioButton) return 'radio';
      if (annot.checkBox) return 'checkbox';
      return 'unknown'; // Pushbutton
    }
    if (annot.fieldType === 'Ch') {
      if (annot.combo) return 'dropdown';
      return 'listbox';
    }
    if (annot.fieldType === 'Sig') {
      return 'signature';
    }
    return 'unknown';
  }

  /**
   * Renders the interactive HTML form layer on top of the active canvas page.
   */
  public renderFormOverlay(pageNumber: number, viewport: PageViewport): void {
    if (!this.containerEl) return;
    this.currentViewport = viewport;
    this.currentPageNumber = pageNumber;

    this.clear();

    const widgets = formStore.getWidgetsForPage(pageNumber);
    if (widgets.length === 0) {
      this.containerEl.style.display = 'none';
      return;
    }

    this.containerEl.style.display = 'block';

    // Sort widgets in logical tab order, fallback to top-to-bottom, left-to-right
    const tabOrder = formStore.getTabOrder(pageNumber);
    const sortedWidgets = [...widgets].sort((a, b) => {
      let idxA = tabOrder.indexOf(a.fieldId);
      let idxB = tabOrder.indexOf(b.fieldId);
      if (idxA === -1) idxA = 9999;
      if (idxB === -1) idxB = 9999;
      if (idxA !== idxB) return idxA - idxB;
      if (Math.abs(b.pdfRect[3] - a.pdfRect[3]) > 10) {
        return b.pdfRect[3] - a.pdfRect[3];
      }
      return a.pdfRect[0] - b.pdfRect[0];
    });

    for (const widget of sortedWidgets) {
      if (widget.hidden) continue;

      const field = formStore.getField(widget.fieldId);
      if (!field || field.hidden) continue;

      // Project PDF rectangle through PageViewport
      const screenBox = this.calculateScreenBox(widget.pdfRect, viewport);
      const element = this.createWidgetElement(widget, field, screenBox);
      if (element) {
        this.containerEl.appendChild(element);
      }
    }
  }

  /**
   * Synchronizes current FormStateManager field values into active DOM controls
   * without recreating elements or losing keyboard focus.
   */
  public syncDomValues(): void {
    if (!this.containerEl) return;
    const wrappers = this.containerEl.querySelectorAll<HTMLElement>('.pdf-form-widget-wrapper');
    for (const wrapper of wrappers) {
      const fieldId = wrapper.getAttribute('data-field-id');
      const widgetId = wrapper.getAttribute('data-widget-id');
      if (!fieldId) continue;
      const field = formStore.getField(fieldId);
      const widget = widgetId ? formStore.getWidget(widgetId) : undefined;
      if (!field) continue;

      const input = wrapper.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select');
      if (!input) continue;

      if (input instanceof HTMLInputElement) {
        if (input.type === 'checkbox') {
          input.checked = field.value === true || field.value === 'Yes' || (widget !== undefined && field.value === widget.exportValue);
        } else if (input.type === 'radio') {
          input.checked = widget !== undefined ? (field.value === widget.exportValue || field.value === widget.appearanceState) : false;
        } else {
          if (document.activeElement !== input) {
            input.value = typeof field.value === 'string' ? field.value : String(field.value || '');
          }
        }
      } else if (input instanceof HTMLTextAreaElement) {
        if (document.activeElement !== input) {
          input.value = typeof field.value === 'string' ? field.value : String(field.value || '');
        }
      } else if (input instanceof HTMLSelectElement) {
        const val = Array.isArray(field.value) ? field.value[0] : field.value;
        input.value = String(val || '');
      }
    }
  }

  /**
   * Maps a PDF [x1, y1, x2, y2] bounding box to viewport CSS coordinates
   */
  private calculateScreenBox(
    pdfRect: [number, number, number, number],
    viewport: PageViewport
  ): { left: number; top: number; width: number; height: number } {
    const viewRect = viewport.convertToViewportRectangle(pdfRect);
    const minX = Math.min(viewRect[0], viewRect[2]);
    const maxX = Math.max(viewRect[0], viewRect[2]);
    const minY = Math.min(viewRect[1], viewRect[3]);
    const maxY = Math.max(viewRect[1], viewRect[3]);

    return {
      left: Math.round(minX * 100) / 100,
      top: Math.round(minY * 100) / 100,
      width: Math.max(12, Math.round((maxX - minX) * 100) / 100),
      height: Math.max(12, Math.round((maxY - minY) * 100) / 100),
    };
  }

  /**
   * Creates the appropriate semantic HTML control
   */
  private createWidgetElement(
    widget: FormWidgetState,
    field: FormFieldState,
    box: { left: number; top: number; width: number; height: number }
  ): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-form-widget-wrapper absolute select-none pointer-events-auto';
    wrapper.style.left = `${box.left}px`;
    wrapper.style.top = `${box.top}px`;
    wrapper.style.width = `${box.width}px`;
    wrapper.style.height = `${box.height}px`;
    wrapper.setAttribute('data-field-id', field.id);
    wrapper.setAttribute('data-widget-id', widget.widgetId);

    const isAuthorMode = formStore.isAuthorModeActive();
    const isSelected = isAuthorMode && formStore.getSelectedWidgetId() === widget.widgetId;

    if (isAuthorMode) {
      wrapper.classList.add(isSelected ? 'cursor-move' : 'cursor-pointer');
      if (isSelected) {
        wrapper.classList.add('ring-2', 'ring-brand-500', 'bg-brand-500/10', 'z-30');
      } else {
        wrapper.classList.add('hover:ring-2', 'hover:ring-brand-400/60');
      }
    }

    const isHighlighted = formStore.getSnapshot().highlightFields;
    const baseBorder = isHighlighted && !field.readOnly
      ? 'border border-blue-400/70 dark:border-blue-500/70 bg-blue-50/25 dark:bg-blue-950/20'
      : 'border border-transparent hover:border-slate-300 dark:hover:border-slate-600 bg-transparent';

    let controlElement: HTMLElement | null = null;

    switch (field.type) {
      case 'text':
      case 'password': {
        const input = document.createElement('input');
        input.type = field.type === 'password' ? 'password' : 'text';
        input.className = `w-full h-full px-1 text-xs text-slate-900 dark:text-slate-100 rounded-xs transition-colors outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white dark:focus:bg-slate-900 ${baseBorder}`;
        input.value = typeof field.value === 'string' ? field.value : '';
        if (field.maxLength && field.maxLength > 0) input.maxLength = field.maxLength;
        if (field.readOnly) {
          input.readOnly = true;
          input.classList.add('cursor-not-allowed', 'opacity-70', 'bg-slate-100/40', 'dark:bg-slate-800/40');
        }

        // Accessibility
        input.setAttribute('aria-label', field.tooltip || field.name);
        input.setAttribute('aria-required', field.required ? 'true' : 'false');
        input.setAttribute('aria-readonly', field.readOnly ? 'true' : 'false');

        // Font sizing scaled to widget height
        const fontSizePx = Math.max(10, Math.min(Math.round(box.height * 0.65), 18));
        input.style.fontSize = `${fontSizePx}px`;

        controlElement = input;
        this.bindTextInputEvents(input, field);
        wrapper.appendChild(input);
        break;
      }

      case 'multiline': {
        const textarea = document.createElement('textarea');
        textarea.className = `w-full h-full p-1 text-xs text-slate-900 dark:text-slate-100 rounded-xs resize-none transition-colors outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white dark:focus:bg-slate-900 ${baseBorder}`;
        textarea.value = typeof field.value === 'string' ? field.value : '';
        if (field.maxLength && field.maxLength > 0) textarea.maxLength = field.maxLength;
        if (field.readOnly) {
          textarea.readOnly = true;
          textarea.classList.add('cursor-not-allowed', 'opacity-70', 'bg-slate-100/40', 'dark:bg-slate-800/40');
        }

        textarea.setAttribute('aria-label', field.tooltip || field.name);
        textarea.setAttribute('aria-required', field.required ? 'true' : 'false');
        textarea.setAttribute('aria-readonly', field.readOnly ? 'true' : 'false');

        const fontSizePx = Math.max(10, Math.min(Math.round(box.height * 0.2), 14));
        textarea.style.fontSize = `${fontSizePx}px`;

        controlElement = textarea;
        this.bindTextInputEvents(textarea, field);
        wrapper.appendChild(textarea);
        break;
      }

      case 'checkbox': {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'w-full h-full cursor-pointer accent-brand-600 rounded-xs transition-transform hover:scale-105 outline-none focus:ring-2 focus:ring-brand-500';
        cb.checked = field.value === true || field.value === 'Yes' || field.value === widget.exportValue;
        if (field.readOnly) {
          cb.disabled = true;
          cb.classList.add('cursor-not-allowed', 'opacity-60');
        }

        cb.setAttribute('aria-label', field.tooltip || field.name);
        cb.setAttribute('aria-required', field.required ? 'true' : 'false');
        cb.setAttribute('aria-readonly', field.readOnly ? 'true' : 'false');

        cb.addEventListener('focus', () => {
          formStore.setFocusedField(field.id);
          this.handleMobileFocusScroll(cb);
        });

        cb.addEventListener('change', () => {
          const checked = cb.checked;
          formStore.setFieldValue(field.id, checked, true);
        });

        controlElement = cb;
        wrapper.appendChild(cb);
        break;
      }

      case 'radio': {
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = field.id;
        radio.className = 'w-full h-full cursor-pointer accent-brand-600 transition-transform hover:scale-105 outline-none focus:ring-2 focus:ring-brand-500';
        
        // Radio is selected if field value matches this widget's export value
        const isSelected = field.value === widget.exportValue || field.value === widget.appearanceState;
        radio.checked = isSelected;
        if (field.readOnly) {
          radio.disabled = true;
          radio.classList.add('cursor-not-allowed', 'opacity-60');
        }

        radio.setAttribute('aria-label', `${field.tooltip || field.name}: ${widget.exportValue || ''}`);
        radio.setAttribute('aria-required', field.required ? 'true' : 'false');
        radio.setAttribute('aria-readonly', field.readOnly ? 'true' : 'false');

        radio.addEventListener('focus', () => {
          formStore.setFocusedField(field.id);
          this.handleMobileFocusScroll(radio);
        });

        radio.addEventListener('change', () => {
          if (radio.checked) {
            const selectedVal = widget.exportValue !== undefined ? widget.exportValue : (widget.appearanceState || 'Selected');
            formStore.setFieldValue(field.id, selectedVal, true);
            this.syncDomValues();
          }
        });

        controlElement = radio;
        wrapper.appendChild(radio);
        break;
      }

      case 'dropdown': {
        const select = document.createElement('select');
        select.className = `w-full h-full px-1 text-xs text-slate-900 dark:text-slate-100 rounded-xs outline-none focus:ring-2 focus:ring-brand-500 bg-white/90 dark:bg-slate-900/90 cursor-pointer ${baseBorder}`;
        if (field.readOnly) {
          select.disabled = true;
          select.classList.add('cursor-not-allowed', 'opacity-70');
        }

        select.setAttribute('aria-label', field.tooltip || field.name);
        select.setAttribute('aria-required', field.required ? 'true' : 'false');
        select.setAttribute('aria-readonly', field.readOnly ? 'true' : 'false');

        const currentVal = Array.isArray(field.value) ? field.value[0] : field.value;

        // Populate options
        for (const opt of field.options || []) {
          const optEl = document.createElement('option');
          optEl.value = opt.value;
          optEl.textContent = opt.label;
          if (opt.value === currentVal || opt.label === currentVal) {
            optEl.selected = true;
          }
          select.appendChild(optEl);
        }

        select.addEventListener('focus', () => {
          formStore.setFocusedField(field.id);
          this.handleMobileFocusScroll(select);
        });

        select.addEventListener('change', () => {
          formStore.setFieldValue(field.id, select.value, true);
        });

        controlElement = select;
        wrapper.appendChild(select);
        break;
      }

      case 'listbox': {
        const select = document.createElement('select');
        select.multiple = true;
        select.className = `w-full h-full p-1 text-xs text-slate-900 dark:text-slate-100 rounded-xs outline-none focus:ring-2 focus:ring-brand-500 bg-white/95 dark:bg-slate-900/95 cursor-pointer ${baseBorder}`;
        if (field.readOnly) {
          select.disabled = true;
          select.classList.add('cursor-not-allowed', 'opacity-70');
        }

        select.setAttribute('aria-label', field.tooltip || field.name);
        select.setAttribute('aria-required', field.required ? 'true' : 'false');

        const selectedVals = Array.isArray(field.value) ? field.value : [field.value];

        for (const opt of field.options || []) {
          const optEl = document.createElement('option');
          optEl.value = opt.value;
          optEl.textContent = opt.label;
          if (selectedVals.includes(opt.value) || selectedVals.includes(opt.label)) {
            optEl.selected = true;
          }
          select.appendChild(optEl);
        }

        select.addEventListener('focus', () => {
          formStore.setFocusedField(field.id);
          this.handleMobileFocusScroll(select);
        });

        select.addEventListener('change', () => {
          const selected = Array.from(select.selectedOptions).map(o => o.value);
          formStore.setFieldValue(field.id, selected, true);
        });

        controlElement = select;
        wrapper.appendChild(select);
        break;
      }

      case 'signature': {
        const sigBadge = document.createElement('div');
        sigBadge.className = 'w-full h-full border border-dashed border-amber-500/80 bg-amber-50/30 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 rounded-xs flex items-center justify-center p-1 text-center cursor-default';
        sigBadge.title = 'Digital signature field — signing not supported in browser editor';
        sigBadge.innerHTML = `
          <div class="flex items-center gap-1 text-[10px] font-medium pointer-events-none">
            <svg class="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span class="truncate">Digital signature field — signing not supported</span>
          </div>
        `;
        sigBadge.addEventListener('click', () => {
          formStore.setFocusedField(field.id);
        });
        controlElement = sigBadge;
        wrapper.appendChild(sigBadge);
        break;
      }

      default: {
        const placeholder = document.createElement('div');
        placeholder.className = 'w-full h-full border border-slate-300 dark:border-slate-700 bg-slate-100/30 dark:bg-slate-800/30 rounded-xs flex items-center justify-center text-[10px] text-slate-500 dark:text-slate-400 truncate p-1';
        placeholder.textContent = field.name;
        controlElement = placeholder;
        wrapper.appendChild(placeholder);
        break;
      }
    }

    if (controlElement) {
      if (isAuthorMode) {
        controlElement.style.pointerEvents = 'none';
      }
      if (field.fontSize) {
        controlElement.style.fontSize = `${field.fontSize}px`;
      }
      if (field.textColor) {
        controlElement.style.color = field.textColor;
      }
      if (field.backgroundColor) {
        controlElement.style.backgroundColor = field.backgroundColor;
      }
      if (field.borderColor) {
        controlElement.style.borderColor = field.borderColor;
      }
      if (field.alignment) {
        controlElement.style.textAlign = field.alignment;
      }

      const tabOrder = formStore.getTabOrder(widget.pageNumber);
      const tabIdx = tabOrder.indexOf(field.id);
      if (tabIdx !== -1) {
        controlElement.tabIndex = tabIdx + 1;
      }
    }

    // Handles and badge in Author Mode when selected
    if (isSelected) {
      const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
      const cursorClasses: Record<string, string> = {
        nw: 'cursor-nwse-resize -top-1.5 -left-1.5',
        n: 'cursor-ns-resize -top-1.5 left-1/2 -translate-x-1/2',
        ne: 'cursor-nesw-resize -top-1.5 -right-1.5',
        e: 'cursor-ew-resize top-1/2 -translate-y-1/2 -right-1.5',
        se: 'cursor-nwse-resize -bottom-1.5 -right-1.5',
        s: 'cursor-ns-resize -bottom-1.5 left-1/2 -translate-x-1/2',
        sw: 'cursor-nesw-resize -bottom-1.5 -left-1.5',
        w: 'cursor-ew-resize top-1/2 -translate-y-1/2 -left-1.5',
      };
      for (const h of handles) {
        const handleEl = document.createElement('div');
        handleEl.className = `absolute w-2.5 h-2.5 bg-white dark:bg-slate-900 border-2 border-brand-500 rounded-xs shadow-xs z-40 ${cursorClasses[h]}`;
        handleEl.setAttribute('data-form-handle', h);
        wrapper.appendChild(handleEl);
      }

      const badge = document.createElement('div');
      badge.className = 'absolute -top-5 left-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-brand-600 text-white shadow-xs pointer-events-none whitespace-nowrap z-40';
      badge.textContent = `${field.type.toUpperCase()}: ${field.name}`;
      wrapper.appendChild(badge);
    }

    // Required indicator dot
    if (field.required && !field.readOnly) {
      const dot = document.createElement('span');
      dot.className = 'absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500 pointer-events-none ring-2 ring-white dark:ring-slate-900';
      dot.title = 'Required field';
      wrapper.appendChild(dot);
    }

    return wrapper;
  }

  /**
   * Binds focus, blur, input, and keydown handlers for text and textarea inputs
   */
  private bindTextInputEvents(
    inputEl: HTMLInputElement | HTMLTextAreaElement,
    field: FormFieldState
  ): void {
    let lastCommittedVal = typeof field.value === 'string' ? field.value : String(field.value || '');

    inputEl.addEventListener('focus', () => {
      lastCommittedVal = inputEl.value;
      formStore.setFocusedField(field.id);
      this.handleMobileFocusScroll(inputEl);
    });

    const commitChange = (val: string) => {
      if (val !== lastCommittedVal) {
        const prevVals = formStore.getAllFieldValues();
        prevVals[field.id] = lastCommittedVal;
        formStore.recordHistorySnapshot(`Edit Form Field: ${field.name}`, prevVals);
        lastCommittedVal = val;
      }
      formStore.setFieldValue(field.id, val, false);
    };

    inputEl.addEventListener('input', () => {
      const newVal = inputEl.value;
      // Update form state live without immediately committing history
      formStore.setFieldValue(field.id, newVal, false);

      // Debounce history commit
      if (this.textDebounceTimers.has(field.id)) {
        clearTimeout(this.textDebounceTimers.get(field.id));
      }

      const timer = setTimeout(() => {
        commitChange(inputEl.value);
        this.textDebounceTimers.delete(field.id);
      }, 500);

      this.textDebounceTimers.set(field.id, timer);
    });

    inputEl.addEventListener('blur', () => {
      // Commit pending text on blur
      if (this.textDebounceTimers.has(field.id)) {
        clearTimeout(this.textDebounceTimers.get(field.id));
        this.textDebounceTimers.delete(field.id);
      }
      commitChange(inputEl.value);
    });

    inputEl.addEventListener('keydown', (e: any) => {
      // Allow standard Tab / Shift+Tab navigation
      if (e.key === 'Tab') {
        // Natural browser tab navigation handles moving to next/prev input
        return;
      }

      // In single-line inputs, Enter triggers commit and moves forward
      if (e.key === 'Enter' && inputEl instanceof HTMLInputElement) {
        e.preventDefault();
        inputEl.blur();
      }

      // Do NOT allow single Esc or Enter to bubble and close modals unexpectedly
      if (e.key === 'Escape') {
        e.stopPropagation();
        inputEl.blur();
      }
    });
  }

  /**
   * Handles smooth scrolling for mobile viewports to prevent soft keyboard overlap
   */
  private handleMobileFocusScroll(targetEl: HTMLElement): void {
    if (window.innerWidth <= 768) {
      setTimeout(() => {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }, 150);
    }
  }
}

export const pdfFormOverlayManager = new PdfFormOverlayManager();
