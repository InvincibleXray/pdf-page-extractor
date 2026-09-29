# Phase 8B.1 — Forensic Audit Report: Text Edit Target and Anchor Mismatch

**Document Status:** Complete Forensic Root-Cause Analysis  
**Repository:** `InvincibleXray/pdf-page-extractor`  
**Execution Phase:** Phase 8B.1 (Audit Only — Zero Production Code Modified)  
**Date:** September 29, 2026  
**Auditor:** Antigravity Forensic Engineering  

---

## 1. Executive Summary

During manual mobile testing following Phase 8B (In-Situ Text Editing), a critical mismatch was identified:
- **Observed Behavior:** The user selects Text A; the contextual action bar appears correctly for Text A; however, tapping **Edit** causes the in-situ editor to mount at a different PDF text location, overlaying another text box instead of the selected one.
- **Audit Conclusion:** The issue is **NOT** a simple CSS offset or visual glitch. It is the result of **two compounding architectural defects**:
  1. **Span Geometry Inflation & Physical Sibling Collision (`src/utils/pdfTextLayer.ts:156-186`):** When indexing PDF text spans, `pdfTextLayerManager` forcibly overrides `span.style.width` and `span.style.height` by calculating `Math.max(pdfBounds.width, rawItem.width)`. On mobile viewports where zoom is scaled to fit screen width (e.g. scale ~ `0.62`), unscaled raw PDF points (72 DPI) are larger than rendered CSS pixels. This inflates the clickable bounding box of spans, causing adjacent spans to physically overlap by **20px to 41px**. Taps intended for one span frequently hit an overlapping sibling with higher DOM stacking order.
  2. **Action Bar Synchronous Dismissal & Mobile Touch Event Bleed-Through (`src/utils/editorInteractionController.ts:108-125, 1715`):** `#edit-existing-text-btn` relies on a generic `click` listener. When tapped on touch screens, `pointerdown` is stopped but **not prevented** (`e.preventDefault()` is omitted). When `click` fires, `this.hideExistingTextActionBar()` synchronously hides the action bar (`display: none` / `hidden`). The mobile browser (WebKit / Blink) completes its touch-compatibility emulation pipeline by firing a delayed synthetic click (~300ms) at the touch point. Because the action bar was positioned directly above/below the text, the newly exposed element at those exact touch coordinates is **another text span** (e.g. `p1-t2`). The synthetic click hits this underlying span, immediately re-triggering selection on the wrong object.

---

## 2. Forensic Trace & Evidence

### 2.1 Environmental Matrix Tested

| Dimension | Mobile Profile (Primary) | Tablet Profile | Desktop Baseline |
| :--- | :--- | :--- | :--- |
| **Viewport** | 390 × 844 (iPhone 14) | 768 × 1024 (iPad) | 1440 × 900 (MacBook Pro) |
| **Input Mode** | Touch / Coarse Pointer | Touch / Coarse Pointer | Mouse / Fine Pointer |
| **Effective Zoom** | ~62% (`(390 - 24) / 595 = 0.615`) | 100% | 100% |
| **Page Card Size** | 368px × 522px | 595px × 842px | 595px × 842px |

---

### 2.2 Finding 1: Span Geometry Inflation & Overlap Collision in `pdfTextLayer.ts`

In [`src/utils/pdfTextLayer.ts:156-186`](file:///c:/Users/A/Desktop/pdf%20tool%20web%20dev/src/utils/pdfTextLayer.ts#L156-L186):
```typescript
if (rawItem) {
  if (rawItem.width && rawItem.width > 0) {
    authoritativeWidth = Math.max(pdfBounds.width, rawItem.width);
  }
  if (rawItem.height && rawItem.height > 0) {
    authoritativeHeight = Math.max(pdfBounds.height, rawItem.height);
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

// Apply authoritative bounds to span DOM style
span.style.width = `${effectiveScreenWidth}px`;
span.style.height = `${effectiveScreenHeight}px`;
span.style.pointerEvents = 'auto';
```

#### Forensic Measurement (`qa/inspect-real-form.js` output on `test-fixtures/phase6c-real-form.pdf`):
- `[p1-t7]` `"Standard Plan"`: starts at `x = 49px`, inflated width = `101px` $\rightarrow$ Right edge = `150px`.
- `[p1-t8]` `"Pro Plan (Selected)"`: starts at `x = 129px`, inflated width = `139px` $\rightarrow$ Right edge = `268px`.
- `[p1-t9]` `"Enterprise Plan"`: starts at `x = 227px`, inflated width = `109px`.

#### Physical Collision Evidence:
- **`p1-t7` and `p1-t8` Overlap:** `150px - 129px = 21px` horizontal overlap across the entire 16px line height.
- **`p1-t8` and `p1-t9` Overlap:** `268px - 227px = 41px` horizontal overlap.
- **Vertical Overlap:** `p1-t0` bottom (`35px`) overlaps `p1-t1` top (`31px`) by `4px`.

**Consequence:** When a user taps a visible text span on mobile, the touch target (minimum 44×44px touch contact area) hits an overlapping adjacent span. In automated scripts or manual taps on `p1-t1`, the store registered `p1-t0` because `p1-t0` extended over `p1-t1`.

---

### 2.3 Finding 2: Action Bar Dismissal & Touch Bleed-Through (Ghost Clicks)

In [`src/utils/editorInteractionController.ts:108-125`](file:///c:/Users/A/Desktop/pdf%20tool%20web%20dev/src/utils/editorInteractionController.ts#L108-L125):
```typescript
if (this.actionBarEl) {
  this.actionBarEl.addEventListener('pointerdown', (e) => {
    e.stopPropagation(); // <-- DOES NOT call e.preventDefault()!
  });

  const editBtn = this.actionBarEl.querySelector('#edit-existing-text-btn');
  if (editBtn) {
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const selectedTextId = editorStore.getSelectedExistingTextId();
      if (selectedTextId) {
        const item = pdfTextLayerManager.getTextItem(selectedTextId);
        if (item) {
          this.startEditingExistingText(item); // <-- Synchronously hides action bar!
          return;
        }
      }
    });
  }
}
```

In [`src/utils/editorInteractionController.ts:1713-1718`](file:///c:/Users/A/Desktop/pdf%20tool%20web%20dev/src/utils/editorInteractionController.ts#L1713-L1718):
```typescript
public startEditingExistingText(item: ExistingPdfTextItem): void {
  if (!this.overlayEl || !this.viewport) return;
  this.hideExistingTextActionBar(); // <-- Immediately executes: this.actionBarEl.classList.add('hidden')
  this.cleanupInlineEditor();
  this.hideTextPlacementPreview();
  ...
```

#### Forensic Event Sequence on Mobile Touch Devices:
1. User taps `#edit-existing-text-btn` (located at client coords `x = 36px, y = 60px` when placed below Text A).
2. `pointerdown` fires on `#edit-existing-text-btn` $\rightarrow$ bubbles to `actionBarEl` $\rightarrow$ `stopPropagation()` prevents root canvas drag, but **no `preventDefault()` is executed**.
3. User lifts finger $\rightarrow$ `pointerup` fires on `#edit-existing-text-btn`.
4. Browser fires standard `click` event on `#edit-existing-text-btn`.
5. `editBtn` click listener executes `this.startEditingExistingText(item)`.
6. `this.hideExistingTextActionBar()` **synchronously** sets `classList.add('hidden')` on `actionBarEl`.
7. **The Ghost Click:** The browser's touch emulation layer delivers a delayed (~300ms) synthetic mouse/pointer event (`mousemove` $\rightarrow$ `mousedown` $\rightarrow$ `mouseup` $\rightarrow$ `click`) to `document.elementFromPoint(36, 60)`.
8. Because the action bar was hidden synchronously, `document.elementFromPoint(36, 60)` is no longer `#edit-existing-text-btn`. It is **the text span physically situated beneath the button** (e.g. `p1-t2` `"Full Name:"`).
9. `this.textLayerEl` receives the event via `boundTextLayerPointerDown`, re-assigning selection to `p1-t2`, or causing the editor to retarget to `p1-t2`.

---

### 2.4 Finding 3: Anchor Coordinate Drift vs Live DOM Span Rect

In [`src/utils/editorInteractionController.ts:1719-1725`](file:///c:/Users/A/Desktop/pdf%20tool%20web%20dev/src/utils/editorInteractionController.ts#L1719-L1725):
```typescript
const screenRect = pdfRectToScreenRect(item.pdfBounds, this.viewport);

this.showInSituTextEditor({
  anchorScreenRect: screenRect,
  initialText: item.text,
  ...
});
```

- When the in-situ editor mounts, its position is calculated by round-tripping `item.pdfBounds` through `pdfRectToScreenRect()`.
- However, `item.pdfBounds` was stored during initial page render based on inflated metrics (`authoritativeWidth = Math.max(pdfBounds.width, rawItem.width)`).
- When measured in `qa/test-real-form-mismatch.js`, the live DOM position of `span` relative to the page card was `(31.73px, 18.83px)`.
- The in-situ editor computed anchor was `(50px, 29px)` — an offset drift of **`dx = 18.27px, dy = 10.17px`**.
- This offset causes the editor popover and whiteout mask to shift away from the actual text glyphs, creating the appearance of editing an adjacent box.

---

## 3. Direct Answers to Audit Objectives

### Q1: Which object is selected before Edit?
**Answer:** The object selected before Edit is correctly recorded in `editorStore.selectedExistingTextId` (e.g. `'p1-t0'`). The contextual action bar correctly queries this item and positions itself relative to this item's bounds.

### Q2: Which object/geometry is passed into the in-situ editor?
**Answer:** `startEditingExistingText(item)` passes `item.text` and `item.pdfBounds` into `showInSituTextEditor`. However, `item.pdfBounds` contains the inflated width/height produced by `pdfTextLayer.ts:158`, not the exact visual bounding box of the rendered DOM text span.

### Q3: Where does identity change (if it changes)?
**Answer:** Identity changes at two distinct failure points:
1. **Touch Bleed-Through on Edit Tap:** When the user taps `#edit-existing-text-btn`, the action bar is hidden synchronously. The mobile browser's delayed synthetic click falls through to the element directly beneath the button (e.g. `p1-t2`), changing the selected item ID right as the editor opens.
2. **Prior Span Selection via Overlap:** If the user tapped on a text span that was physically overlapped by an inflated sibling span (e.g. `p1-t7` overlapping `p1-t8` by 21px), the wrong span ID was selected from the very beginning.

### Q4: Where does geometry diverge (if it diverges)?
**Answer:** Geometry diverges in two places:
1. In `src/utils/pdfTextLayer.ts:183-184`: `span.style.width` and `span.style.height` are explicitly forced to `effectiveScreenWidth` and `effectiveScreenHeight`, causing text spans to distort and collide.
2. In `src/utils/editorInteractionController.ts:1719`: `pdfRectToScreenRect(item.pdfBounds, this.viewport)` converts rounded PDF points back to screen pixels, producing an 18px horizontal and 10px vertical drift compared to the span's actual DOM position (`span.getBoundingClientRect()`).

### Q5: What is the exact root cause classification?
**Answer:**
- **Primary:** DOM Event Lifecycle Race / Touch Fall-Through (lack of `preventDefault()` on touch interaction + synchronous removal of touched DOM element).
- **Secondary:** TextLayer Coordinate Model Invalidation (artificial bounding-box inflation overriding native PDF.js layout).

### Q6: Why did manual mobile testing expose this while automated tests passed?
**Answer:**
1. Automated desktop tests use synthesized CDP pointer events (`page.mouse.click` or instant `page.tap`) that do not emulate mobile WebKit/Blink delayed synthetic mouse clicks (the 300ms compatibility click).
2. Automated tests tested single isolated fixture spans (`FIXTURE_A`, `FIXTURE_B` with 2 widely spaced spans), avoiding the multi-column and dense-form layout present in real-world PDFs (such as `phase6c-real-form.pdf`).
3. Automated tests did not verify whether the coordinates of `#active-inline-text-popover` matched the live `span.getBoundingClientRect()` within a tolerance of `< 2px`.

### Q7: Desktop vs Mobile divergence
**Answer:**
- **On Desktop:** Pointer clicks are discrete and immediate; no 300ms touch-emulation click occurs after element dismissal. Furthermore, desktop viewports operate at 100% zoom, where 72 DPI PDF coordinates do not experience the severe downscaling inversion present on mobile screens (`scale ~ 0.62`).
- **On Mobile:** Screen widths are narrow (`390px`), triggering auto-fit downscaling to `0.62`. At this scale, unscaled PDF point metrics are 1.6× larger than pixel layout, causing massive span collisions. Furthermore, mobile browsers utilize touch-to-mouse compatibility pipelines that cause touch bleed-through when overlay controls vanish under the user's thumb.

---

## 4. Minimal Architectural Fix Direction (Recommendations for Phase 8C)

> [!NOTE]
> Per the constraints of Phase 8B.1, **no production code has been modified**. The following recommendations define the surgical implementation path for Phase 8C.

1. **Eliminate Span Style Overrides in `pdfTextLayer.ts`:**
   - Remove lines 183-184 (`span.style.width = ...; span.style.height = ...`).
   - Let PDF.js manage span typography, transforms, and font scaling natively.
   - Calculate `item.pdfBounds` purely from the unadulterated `span.getBoundingClientRect()` relative to the container. This guarantees zero sibling span collisions.
2. **Prevent Touch Fall-Through on Action Bar Controls:**
   - In `editorInteractionController.ts`, bind both `pointerdown` and `touchend` on action bar buttons with `e.preventDefault()` and `e.stopPropagation()`.
   - In `hideExistingTextActionBar()`, defer element removal/hiding or set `pointer-events: none` during the transition window to prevent synthetic click bleed-through.
3. **Anchor In-Situ Editor to Live DOM Span:**
   - In `startEditingExistingText(item)`: Instead of round-tripping through PDF coordinate space (`pdfRectToScreenRect(item.pdfBounds)`), directly measure the live DOM bounding rect of the target span (`span.getBoundingClientRect()`) relative to `this.overlayEl`.
   - This guarantees mathematical `dx = 0px, dy = 0px` alignment between the original text and the in-situ editor.

---

## 5. Audit Deliverables Manifest

- Forensic JSON Artifact: [`docs/phase8b1-text-edit-target-audit.json`](file:///c:/Users/A/Desktop/pdf%20tool%20web%20dev/docs/phase8b1-text-edit-target-audit.json)
- Forensic Report: [`docs/phase8b1-text-edit-target-audit.md`](file:///c:/Users/A/Desktop/pdf%20tool%20web%20dev/docs/phase8b1-text-edit-target-audit.md)
- Diagnostic Test Harnesses Created:
  - `qa/phase8b1-diagnostic-audit.js`
  - `qa/inspect-real-form.js`
  - `qa/test-real-form-mismatch.js`
  - `qa/forensic-span-trace.js`
- Production Code Status: **0 files modified, 100% clean repository state.**
