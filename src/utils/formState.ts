/**
 * Core Form State Management Module
 * 
 * Manages AcroForm documents, field values, widget bindings, validation state,
 * and transactional history for PDF form filling.
 */

export type FormFieldType =
  | 'text'
  | 'multiline'
  | 'password'
  | 'checkbox'
  | 'radio'
  | 'dropdown'
  | 'listbox'
  | 'signature'
  | 'unknown';

export interface FormWidgetState {
  widgetId: string; // PDF.js internal ref ID (e.g., "9R") or created ID
  fieldId: string;  // Fully qualified field name
  pageNumber: number;
  pdfRect: [number, number, number, number]; // [x1, y1, x2, y2] PDF bottom-left points
  rotation: number;
  hidden: boolean;
  readOnly: boolean;
  exportValue?: string; // For radio button / checkbox options
  appearanceState?: string;
  hasAppearance?: boolean;
}

export interface FormFieldState {
  id: string;               // Stable internal ID (fully qualified field name or unique ID)
  name: string;             // Fully qualified field name (e.g. "applicant.firstName")
  partialName: string;      // Leaf name (e.g. "firstName")
  type: FormFieldType;
  value: string | boolean | string[];
  defaultValue?: string | boolean | string[];
  originalValue: string | boolean | string[];
  required: boolean;
  readOnly: boolean;
  hidden: boolean;
  disabled: boolean;
  tooltip?: string;
  maxLength?: number;
  multiline?: boolean;
  password?: boolean;
  comb?: boolean;
  alignment?: 'left' | 'center' | 'right';
  fontSize?: number;
  textColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  radioGroup?: string;
  exportValue?: string;
  options?: Array<{ label: string; value: string }>;
  selectedOptions?: string[];
  widgetIds: string[];
  dirty: boolean;
  isCreated?: boolean; // Flag to identify newly authored fields
}

export interface FormDocumentState {
  hasAcroForm: boolean;
  isXfa: boolean;
  fields: Map<string, FormFieldState>;
  widgets: Map<string, FormWidgetState>;
  activeFieldId: string | null;
  focusedFieldId: string | null;
  selectedWidgetId: string | null;
  isAuthorMode: boolean;
  tabOrders: Map<number, string[]>; // pageNumber -> ordered field IDs
  dirtyFields: Set<string>;
  highlightFields: boolean;
}

export interface FormStateSnapshot {
  hasAcroForm: boolean;
  isXfa: boolean;
  fieldCount: number;
  widgetCount: number;
  activeFieldId: string | null;
  focusedFieldId: string | null;
  selectedWidgetId: string | null;
  isAuthorMode: boolean;
  dirtyFieldCount: number;
  highlightFields: boolean;
}

type FormStateListener = (snapshot: FormStateSnapshot) => void;

interface FormHistorySnapshot {
  action: string;
  fields: [string, FormFieldState][];
  widgets: [string, FormWidgetState][];
  tabOrders: [number, string[]][];
  dirtyFields: string[];
  activeFieldId: string | null;
  focusedFieldId: string | null;
  selectedWidgetId: string | null;
  hasAcroForm: boolean;
}

export class FormStateManager {
  private state: FormDocumentState;
  private listeners: Set<FormStateListener> = new Set();
  private historyHook: ((action: string, values: Record<string, any>) => void) | null = null;
  private discoveredPages: Set<number> = new Set();
  private undoStack: FormHistorySnapshot[] = [];
  private redoStack: FormHistorySnapshot[] = [];
  private maxHistory = 50;

  constructor() {
    this.state = {
      hasAcroForm: false,
      isXfa: false,
      fields: new Map(),
      widgets: new Map(),
      activeFieldId: null,
      focusedFieldId: null,
      selectedWidgetId: null,
      isAuthorMode: false,
      tabOrders: new Map(),
      dirtyFields: new Set(),
      highlightFields: true,
    };
  }

  private captureSnapshot(action: string): FormHistorySnapshot {
    const fields: [string, FormFieldState][] = Array.from(this.state.fields.entries()).map(([k, v]) => [
      k,
      {
        ...v,
        options: v.options ? v.options.map((o) => ({ ...o })) : undefined,
        selectedOptions: v.selectedOptions ? [...v.selectedOptions] : undefined,
        widgetIds: [...v.widgetIds],
      },
    ]);

    const widgets: [string, FormWidgetState][] = Array.from(this.state.widgets.entries()).map(([k, v]) => [
      k,
      {
        ...v,
        pdfRect: [...v.pdfRect] as [number, number, number, number],
      },
    ]);

    const tabOrders: [number, string[]][] = Array.from(this.state.tabOrders.entries()).map(([k, v]) => [
      k,
      [...v],
    ]);

    return {
      action,
      fields,
      widgets,
      tabOrders,
      dirtyFields: Array.from(this.state.dirtyFields),
      activeFieldId: this.state.activeFieldId,
      focusedFieldId: this.state.focusedFieldId,
      selectedWidgetId: this.state.selectedWidgetId,
      hasAcroForm: this.state.hasAcroForm,
    };
  }

  private restoreSnapshot(snapshot: FormHistorySnapshot): void {
    this.state.fields = new Map(
      snapshot.fields.map(([k, v]) => [
        k,
        {
          ...v,
          options: v.options ? v.options.map((o) => ({ ...o })) : undefined,
          selectedOptions: v.selectedOptions ? [...v.selectedOptions] : undefined,
          widgetIds: [...v.widgetIds],
        },
      ])
    );

    this.state.widgets = new Map(
      snapshot.widgets.map(([k, v]) => [
        k,
        {
          ...v,
          pdfRect: [...v.pdfRect] as [number, number, number, number],
        },
      ])
    );

    this.state.tabOrders = new Map(
      snapshot.tabOrders.map(([k, v]) => [k, [...v]])
    );

    this.state.dirtyFields = new Set(snapshot.dirtyFields);
    this.state.activeFieldId = snapshot.activeFieldId;
    this.state.focusedFieldId = snapshot.focusedFieldId;
    this.state.selectedWidgetId = snapshot.selectedWidgetId;
    this.state.hasAcroForm = snapshot.hasAcroForm;
  }

  public recordHistory(action: string): void {
    const snap = this.captureSnapshot(action);
    this.undoStack.push(snap);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  public undo(): boolean {
    if (this.undoStack.length === 0) return false;
    const currentSnap = this.captureSnapshot('Current');
    this.redoStack.push(currentSnap);
    const prevSnap = this.undoStack.pop()!;
    this.restoreSnapshot(prevSnap);
    this.notify();
    return true;
  }

  public redo(): boolean {
    if (this.redoStack.length === 0) return false;
    const currentSnap = this.captureSnapshot('Current');
    this.undoStack.push(currentSnap);
    const nextSnap = this.redoStack.pop()!;
    this.restoreSnapshot(nextSnap);
    this.notify();
    return true;
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public registerHistoryHook(hook: (action: string, values: Record<string, any>) => void): void {
    this.historyHook = hook;
  }

  public recordHistorySnapshot(action: string, values: Record<string, any>): void {
    this.recordHistory(action);
    if (this.historyHook) {
      this.historyHook(action, values);
    }
  }

  public isPageDiscovered(pageNumber: number): boolean {
    return this.discoveredPages.has(pageNumber);
  }

  public markPageDiscovered(pageNumber: number): void {
    this.discoveredPages.add(pageNumber);
  }

  public initDocument(hasAcroForm: boolean, isXfa: boolean = false): void {
    this.reset();
    this.state.hasAcroForm = hasAcroForm;
    this.state.isXfa = isXfa;
    this.notify();
  }

  public registerWidget(widget: FormWidgetState, fieldMeta: Partial<FormFieldState>): void {
    this.state.widgets.set(widget.widgetId, widget);

    let field = this.state.fields.get(widget.fieldId);
    if (!field) {
      const initialVal = fieldMeta.value !== undefined ? fieldMeta.value : '';
      field = {
        id: widget.fieldId,
        name: widget.fieldId,
        partialName: fieldMeta.partialName || widget.fieldId.split('.').pop() || widget.fieldId,
        type: fieldMeta.type || 'text',
        value: initialVal,
        defaultValue: fieldMeta.defaultValue !== undefined ? fieldMeta.defaultValue : initialVal,
        originalValue: initialVal,
        required: fieldMeta.required || false,
        readOnly: fieldMeta.readOnly || false,
        hidden: fieldMeta.hidden || false,
        disabled: fieldMeta.disabled || false,
        tooltip: fieldMeta.tooltip,
        maxLength: fieldMeta.maxLength,
        multiline: fieldMeta.multiline,
        password: fieldMeta.password,
        comb: fieldMeta.comb,
        alignment: fieldMeta.alignment || 'left',
        options: fieldMeta.options || [],
        selectedOptions: fieldMeta.selectedOptions || [],
        widgetIds: [widget.widgetId],
        dirty: false,
      };
      this.state.fields.set(widget.fieldId, field);
    } else {
      if (!field.widgetIds.includes(widget.widgetId)) {
        field.widgetIds.push(widget.widgetId);
      }
      // Merge options if present
      if (fieldMeta.options && fieldMeta.options.length > 0 && (!field.options || field.options.length === 0)) {
        field.options = fieldMeta.options;
      }
    }

    this.state.hasAcroForm = true;
    this.notify();
  }

  public getField(fieldId: string): FormFieldState | undefined {
    return this.state.fields.get(fieldId);
  }

  public getFields(): FormFieldState[] {
    return Array.from(this.state.fields.values());
  }

  public getWidgetsForPage(pageNumber: number): FormWidgetState[] {
    const list: FormWidgetState[] = [];
    for (const w of this.state.widgets.values()) {
      if (w.pageNumber === pageNumber) {
        list.push(w);
      }
    }
    return list;
  }

  public getWidget(widgetId: string): FormWidgetState | undefined {
    return this.state.widgets.get(widgetId);
  }

  public setFieldValue(
    fieldId: string,
    value: string | boolean | string[],
    isCommitted: boolean = true
  ): void {
    const field = this.state.fields.get(fieldId);
    if (!field || field.readOnly) return;

    if (field.value === value) return;

    if (isCommitted && this.historyHook) {
      // Save state before mutation so undo restores the previous state
      this.historyHook(`Edit Form Field: ${field.name}`, this.getAllFieldValues());
    }

    field.value = value;
    field.dirty = field.value !== field.originalValue;

    if (field.dirty) {
      this.state.dirtyFields.add(fieldId);
    } else {
      this.state.dirtyFields.delete(fieldId);
    }

    this.notify();
  }

  public resetField(fieldId: string): void {
    const field = this.state.fields.get(fieldId);
    if (!field) return;

    if (field.value !== field.originalValue) {
      if (this.historyHook) {
        this.historyHook(`Reset Form Field: ${field.name}`, this.getAllFieldValues());
      }
      field.value = field.originalValue;
      field.dirty = false;
      this.state.dirtyFields.delete(fieldId);
      this.notify();
    }
  }

  public setActiveField(fieldId: string | null): void {
    if (this.state.activeFieldId !== fieldId) {
      this.state.activeFieldId = fieldId;
      this.notify();
    }
  }

  public getFocusedFieldId(): string | null {
    return this.state.focusedFieldId;
  }

  public getActiveFieldId(): string | null {
    return this.state.activeFieldId;
  }

  public setFocusedField(fieldId: string | null): void {
    if (this.state.focusedFieldId !== fieldId) {
      this.state.focusedFieldId = fieldId;
      if (fieldId) this.state.activeFieldId = fieldId;
      this.notify();
    }
  }

  public toggleFieldHighlight(highlight?: boolean): void {
    this.state.highlightFields = highlight !== undefined ? highlight : !this.state.highlightFields;
    this.notify();
  }

  public getAllFieldValues(): Record<string, string | boolean | string[]> {
    const values: Record<string, string | boolean | string[]> = {};
    for (const [id, f] of this.state.fields.entries()) {
      values[id] = f.value;
    }
    return values;
  }

  public restoreFieldValues(values?: Record<string, any>): void {
    if (!values) return;
    let changed = false;

    for (const [id, val] of Object.entries(values)) {
      const field = this.state.fields.get(id);
      if (field && field.value !== val) {
        field.value = val;
        field.dirty = field.value !== field.originalValue;
        if (field.dirty) {
          this.state.dirtyFields.add(id);
        } else {
          this.state.dirtyFields.delete(id);
        }
        changed = true;
      }
    }

    if (changed) {
      this.notify();
    }
  }

  public resetAllValuesToOriginal(): void {
    let changed = false;
    for (const field of this.state.fields.values()) {
      if (field.value !== field.originalValue) {
        field.value = field.originalValue;
        field.dirty = false;
        changed = true;
      }
    }
    this.state.dirtyFields.clear();
    if (changed) {
      if (this.historyHook) {
        this.historyHook('Reset Form Values', this.getAllFieldValues());
      }
      this.notify();
    }
  }

  // --- AUTHORING & SELECTION METHODS ---

  public setAuthorMode(authorMode: boolean): void {
    if (this.state.isAuthorMode !== authorMode) {
      this.state.isAuthorMode = authorMode;
      if (!authorMode) {
        this.state.selectedWidgetId = null;
      }
      this.notify();
    }
  }

  public isAuthorModeActive(): boolean {
    return this.state.isAuthorMode;
  }

  public selectWidget(widgetId: string | null): void {
    if (this.state.selectedWidgetId !== widgetId) {
      this.state.selectedWidgetId = widgetId;
      if (widgetId) {
        const widget = this.state.widgets.get(widgetId);
        if (widget) {
          this.state.activeFieldId = widget.fieldId;
          this.state.focusedFieldId = widget.fieldId;
        }
      }
      this.notify();
    }
  }

  public getSelectedWidgetId(): string | null {
    return this.state.selectedWidgetId;
  }

  public getSelectedWidget(): FormWidgetState | null {
    return this.state.selectedWidgetId ? this.state.widgets.get(this.state.selectedWidgetId) || null : null;
  }

  public getSelectedField(): FormFieldState | null {
    const w = this.getSelectedWidget();
    if (w) return this.state.fields.get(w.fieldId) || null;
    if (this.state.activeFieldId) return this.state.fields.get(this.state.activeFieldId) || null;
    return null;
  }

  public getUniqueFieldName(baseName: string): string {
    const cleanBase = baseName.trim().replace(/\s+/g, '_') || 'Field';
    let candidate = cleanBase;
    let counter = 1;
    const existingNames = new Set<string>();
    for (const f of this.state.fields.values()) {
      existingNames.add(f.name.toLowerCase());
      existingNames.add(f.id.toLowerCase());
    }
    while (existingNames.has(candidate.toLowerCase())) {
      candidate = `${cleanBase}_${counter}`;
      counter++;
    }
    return candidate;
  }

  public createFieldAndWidget(params: {
    type: FormFieldType;
    name?: string;
    pageNumber: number;
    pdfRect: [number, number, number, number];
    options?: Array<{ label: string; value: string }>;
    radioGroup?: string;
    exportValue?: string;
    value?: any;
    fontSize?: number;
    multiline?: boolean;
    required?: boolean;
    readOnly?: boolean;
    tooltip?: string;
  }): { field: FormFieldState; widget: FormWidgetState } {
    this.recordHistorySnapshot('Create Form Field', this.getAllFieldValues());

    const widgetId = `widget_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let fieldName = params.name ? params.name.trim() : '';

    if (params.type === 'radio' && params.radioGroup) {
      fieldName = params.radioGroup.trim();
    } else if (!fieldName) {
      const prefixMap: Record<FormFieldType, string> = {
        text: 'TextField',
        multiline: 'MultilineText',
        password: 'PasswordField',
        checkbox: 'Checkbox',
        radio: 'RadioGroup',
        dropdown: 'Dropdown',
        listbox: 'ListBox',
        signature: 'Signature',
        unknown: 'Field',
      };
      const prefix = prefixMap[params.type] || 'Field';
      fieldName = this.getUniqueFieldName(prefix);
    }

    let field = this.state.fields.get(fieldName);
    if (!field) {
      const initialVal =
        params.value !== undefined
          ? params.value
          : params.type === 'checkbox'
            ? false
            : params.type === 'radio'
              ? (params.exportValue || 'Choice1')
              : params.type === 'dropdown'
                ? (params.options?.[0]?.value || 'Option 1')
                : params.type === 'listbox'
                  ? []
                  : '';

      const defaultOptions =
        params.type === 'dropdown' || params.type === 'listbox'
          ? [
              { label: 'Option 1', value: 'Option 1' },
              { label: 'Option 2', value: 'Option 2' },
              { label: 'Option 3', value: 'Option 3' },
            ]
          : [];

      field = {
        id: fieldName,
        name: fieldName,
        partialName: fieldName.split('.').pop() || fieldName,
        type: params.type,
        value: initialVal,
        defaultValue: initialVal,
        originalValue: initialVal,
        required: !!params.required,
        readOnly: !!params.readOnly,
        hidden: false,
        disabled: !!params.readOnly,
        tooltip: params.tooltip || '',
        multiline: params.multiline !== undefined ? params.multiline : params.type === 'multiline',
        fontSize: params.fontSize || 12,
        options: params.options && params.options.length > 0 ? params.options : defaultOptions,
        widgetIds: [widgetId],
        dirty: true,
        isCreated: true,
      };
      this.state.fields.set(fieldName, field);
    } else {
      if (!field.widgetIds.includes(widgetId)) {
        field.widgetIds.push(widgetId);
      }
    }

    const defaultExportVal =
      params.exportValue ||
      (params.type === 'radio'
        ? `Option_${field.widgetIds.length}`
        : 'Yes');

    const widget: FormWidgetState = {
      widgetId,
      fieldId: fieldName,
      pageNumber: params.pageNumber,
      pdfRect: [...params.pdfRect] as [number, number, number, number],
      rotation: 0,
      hidden: false,
      readOnly: !!params.readOnly,
      exportValue: defaultExportVal,
    };

    this.state.widgets.set(widgetId, widget);
    this.state.hasAcroForm = true;
    this.state.dirtyFields.add(fieldName);
    this.state.selectedWidgetId = widgetId;
    this.state.activeFieldId = fieldName;
    this.state.focusedFieldId = fieldName;
    this.state.isAuthorMode = true;

    // Maintain tab order for this page
    const currentOrder = this.getTabOrder(params.pageNumber);
    if (!currentOrder.includes(fieldName)) {
      currentOrder.push(fieldName);
      this.state.tabOrders.set(params.pageNumber, currentOrder);
    }

    this.notify();
    return { field, widget };
  }

  public updateFieldProperties(
    fieldId: string,
    updates: Partial<FormFieldState> & { newName?: string }
  ): boolean {
    const field = this.state.fields.get(fieldId);
    if (!field) return false;

    // Check collision first if renaming is requested
    const rawTargetName = updates.newName !== undefined ? updates.newName : (updates as any).name;
    const isRenaming = rawTargetName !== undefined && rawTargetName.trim() !== '' && rawTargetName.trim() !== field.name;
    const targetName = isRenaming ? rawTargetName.trim() : null;

    if (targetName && this.state.fields.has(targetName)) {
      return false; // Name collision error
    }

    this.recordHistorySnapshot(`Update Form Field: ${field.name}`, this.getAllFieldValues());

    // Handle field renaming
    let currentFieldId = fieldId;
    if (targetName) {
      this.state.fields.delete(fieldId);
      field.id = targetName;
      field.name = targetName;
      field.partialName = targetName.split('.').pop() || targetName;
      this.state.fields.set(targetName, field);

      // Update dirty fields
      if (this.state.dirtyFields.has(fieldId)) {
        this.state.dirtyFields.delete(fieldId);
        this.state.dirtyFields.add(targetName);
      }

      // Update attached widgets
      for (const wId of field.widgetIds) {
        const w = this.state.widgets.get(wId);
        if (w) w.fieldId = targetName;
      }

      // Update active/focused references
      if (this.state.activeFieldId === fieldId) this.state.activeFieldId = targetName;
      if (this.state.focusedFieldId === fieldId) this.state.focusedFieldId = targetName;

      // Update tab orders
      for (const order of this.state.tabOrders.values()) {
        const idx = order.indexOf(fieldId);
        if (idx !== -1) {
          order[idx] = targetName;
        }
      }

      currentFieldId = targetName;
    }

    if (updates.tooltip !== undefined) field.tooltip = updates.tooltip;
    if (updates.required !== undefined) field.required = updates.required;
    if (updates.readOnly !== undefined) {
      field.readOnly = updates.readOnly;
      field.disabled = updates.readOnly;
      for (const wId of field.widgetIds) {
        const w = this.state.widgets.get(wId);
        if (w) w.readOnly = updates.readOnly;
      }
    }
    if (updates.multiline !== undefined) field.multiline = updates.multiline;
    if (updates.maxLength !== undefined) field.maxLength = updates.maxLength;
    if (updates.alignment !== undefined) field.alignment = updates.alignment;
    if (updates.fontSize !== undefined) field.fontSize = updates.fontSize;
    if (updates.textColor !== undefined) field.textColor = updates.textColor;
    if (updates.backgroundColor !== undefined) field.backgroundColor = updates.backgroundColor;
    if (updates.borderColor !== undefined) field.borderColor = updates.borderColor;
    if (updates.options !== undefined) field.options = updates.options;
    if (updates.defaultValue !== undefined) {
      field.defaultValue = updates.defaultValue;
      field.value = updates.defaultValue;
    }
    if (updates.exportValue !== undefined) {
      field.exportValue = updates.exportValue;
      if (this.state.selectedWidgetId) {
        const selW = this.state.widgets.get(this.state.selectedWidgetId);
        if (selW) selW.exportValue = updates.exportValue;
      }
    }

    field.dirty = true;
    this.state.dirtyFields.add(currentFieldId);
    this.notify();
    return true;
  }

  public updateWidgetBounds(
    widgetId: string,
    pdfRect: [number, number, number, number],
    commitHistory = false
  ): void {
    const widget = this.state.widgets.get(widgetId);
    if (!widget) return;

    if (commitHistory) {
      this.recordHistorySnapshot(`Move/Resize Widget: ${widget.fieldId}`, this.getAllFieldValues());
    }

    widget.pdfRect = [...pdfRect] as [number, number, number, number];
    const field = this.state.fields.get(widget.fieldId);
    if (field) {
      field.dirty = true;
      this.state.dirtyFields.add(field.id);
    }
    this.notify();
  }

  public duplicateField(fieldId: string, pageNumber: number, offsetPt = 15): FormFieldState | null {
    const field = this.state.fields.get(fieldId);
    if (!field) return null;

    // Find widget on this page
    const widget = this.getWidgetsForPage(pageNumber).find((w) => w.fieldId === fieldId) ||
      (field.widgetIds[0] ? this.state.widgets.get(field.widgetIds[0]) : null);

    if (!widget) return null;

    const baseName = field.name.replace(/_copy\d+$/, '');
    const newName = this.getUniqueFieldName(`${baseName}_copy1`);

    const clonedRect: [number, number, number, number] = [
      widget.pdfRect[0] + offsetPt,
      widget.pdfRect[1] - offsetPt,
      widget.pdfRect[2] + offsetPt,
      widget.pdfRect[3] - offsetPt,
    ];

    const { field: newField } = this.createFieldAndWidget({
      type: field.type,
      name: newName,
      pageNumber,
      pdfRect: clonedRect,
      options: field.options ? JSON.parse(JSON.stringify(field.options)) : undefined,
      exportValue: widget.exportValue,
      value: field.value,
      fontSize: field.fontSize,
      multiline: field.multiline,
      required: field.required,
      readOnly: field.readOnly,
      tooltip: field.tooltip,
    });

    return newField;
  }

  public deleteField(fieldId: string): void {
    const field = this.state.fields.get(fieldId);
    if (!field) return;

    this.recordHistorySnapshot(`Delete Form Field: ${field.name}`, this.getAllFieldValues());

    for (const wId of field.widgetIds) {
      this.state.widgets.delete(wId);
      if (this.state.selectedWidgetId === wId) {
        this.state.selectedWidgetId = null;
      }
    }

    this.state.fields.delete(fieldId);
    this.state.dirtyFields.delete(fieldId);
    if (this.state.activeFieldId === fieldId) this.state.activeFieldId = null;
    if (this.state.focusedFieldId === fieldId) this.state.focusedFieldId = null;

    for (const order of this.state.tabOrders.values()) {
      const idx = order.indexOf(fieldId);
      if (idx !== -1) order.splice(idx, 1);
    }

    this.notify();
  }

  public deleteWidget(widgetId: string): void {
    const widget = this.state.widgets.get(widgetId);
    if (!widget) return;

    const field = this.state.fields.get(widget.fieldId);
    if (!field || field.widgetIds.length <= 1) {
      this.deleteField(widget.fieldId);
    } else {
      this.recordHistorySnapshot(`Delete Widget: ${widget.fieldId}`, this.getAllFieldValues());
      field.widgetIds = field.widgetIds.filter((id) => id !== widgetId);
      this.state.widgets.delete(widgetId);
      if (this.state.selectedWidgetId === widgetId) {
        this.state.selectedWidgetId = null;
      }
      this.notify();
    }
  }

  public duplicatePageFormFields(sourcePageNum: number, targetPageNum: number): void {
    const sourceWidgets = this.getWidgetsForPage(sourcePageNum);
    if (sourceWidgets.length === 0) return;

    this.recordHistorySnapshot('Duplicate Page Form Fields', this.getAllFieldValues());

    // Group widgets by fieldId
    const widgetsByField = new Map<string, FormWidgetState[]>();
    for (const w of sourceWidgets) {
      const list = widgetsByField.get(w.fieldId) || [];
      list.push(w);
      widgetsByField.set(w.fieldId, list);
    }

    for (const [fieldId, widgets] of widgetsByField.entries()) {
      const field = this.state.fields.get(fieldId);
      if (!field) continue;

      const baseName = field.name.replace(/_copy\d+$/, '');
      const newFieldName = this.getUniqueFieldName(`${baseName}_copy1`);

      const newField: FormFieldState = {
        ...JSON.parse(JSON.stringify(field)),
        id: newFieldName,
        name: newFieldName,
        partialName: newFieldName.split('.').pop() || newFieldName,
        widgetIds: [],
        dirty: true,
        isCreated: true,
      };
      this.state.fields.set(newFieldName, newField);
      this.state.dirtyFields.add(newFieldName);

      for (const w of widgets) {
        const newWidgetId = `widget_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const newWidget: FormWidgetState = {
          ...JSON.parse(JSON.stringify(w)),
          widgetId: newWidgetId,
          fieldId: newFieldName,
          pageNumber: targetPageNum,
        };
        this.state.widgets.set(newWidgetId, newWidget);
        newField.widgetIds.push(newWidgetId);
      }

      // Add to tab order
      const tabOrder = this.getTabOrder(targetPageNum);
      if (!tabOrder.includes(newFieldName)) {
        tabOrder.push(newFieldName);
        this.state.tabOrders.set(targetPageNum, tabOrder);
      }
    }

    this.notify();
  }

  public getTabOrder(pageNumber: number): string[] {
    const existing = this.state.tabOrders.get(pageNumber);
    if (existing && existing.length > 0) {
      return existing.filter((id) => this.state.fields.has(id));
    }

    // Default reading order: higher Y first, lower X first
    const widgets = this.getWidgetsForPage(pageNumber);
    const sorted = [...widgets].sort((a, b) => {
      if (Math.abs(b.pdfRect[3] - a.pdfRect[3]) > 10) {
        return b.pdfRect[3] - a.pdfRect[3];
      }
      return a.pdfRect[0] - b.pdfRect[0];
    });

    const uniqueFieldIds: string[] = [];
    for (const w of sorted) {
      if (!uniqueFieldIds.includes(w.fieldId) && this.state.fields.has(w.fieldId)) {
        uniqueFieldIds.push(w.fieldId);
      }
    }
    this.state.tabOrders.set(pageNumber, uniqueFieldIds);
    return uniqueFieldIds;
  }

  public setTabOrder(pageNumber: number, fieldIds: string[]): void {
    this.recordHistorySnapshot('Update Tab Order', this.getAllFieldValues());
    this.state.tabOrders.set(pageNumber, [...fieldIds]);
    this.notify();
  }

  public reorderTabItem(pageNumber: number, fromIndex: number, toIndex: number): void {
    const current = this.getTabOrder(pageNumber);
    if (fromIndex < 0 || fromIndex >= current.length || toIndex < 0 || toIndex >= current.length) return;
    if (fromIndex === toIndex) return;

    this.recordHistorySnapshot('Reorder Tab Item', this.getAllFieldValues());
    const [moved] = current.splice(fromIndex, 1);
    current.splice(toIndex, 0, moved);
    this.state.tabOrders.set(pageNumber, current);
    this.notify();
  }

  public getSnapshot(): FormStateSnapshot {
    return {
      hasAcroForm: this.state.hasAcroForm,
      isXfa: this.state.isXfa,
      fieldCount: this.state.fields.size,
      widgetCount: this.state.widgets.size,
      activeFieldId: this.state.activeFieldId,
      focusedFieldId: this.state.focusedFieldId,
      selectedWidgetId: this.state.selectedWidgetId,
      isAuthorMode: this.state.isAuthorMode,
      dirtyFieldCount: this.state.dirtyFields.size,
      highlightFields: this.state.highlightFields,
    };
  }

  public hasForm(): boolean {
    return this.state.hasAcroForm && this.state.fields.size > 0;
  }

  public isXfa(): boolean {
    return this.state.isXfa;
  }

  public subscribe(listener: FormStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const snap = this.getSnapshot();
    for (const listener of this.listeners) {
      try {
        listener(snap);
      } catch (e) {
        console.error('Error in FormState listener:', e);
      }
    }
  }

  public reset(): void {
    this.state.hasAcroForm = false;
    this.state.isXfa = false;
    this.state.fields.clear();
    this.state.widgets.clear();
    this.state.activeFieldId = null;
    this.state.focusedFieldId = null;
    this.state.selectedWidgetId = null;
    this.state.isAuthorMode = false;
    this.state.tabOrders.clear();
    this.state.dirtyFields.clear();
    this.state.highlightFields = true;
    this.discoveredPages.clear();
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }
}

export const formStore = new FormStateManager();
