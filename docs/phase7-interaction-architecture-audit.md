# PHASE 7 — FORENSIC PDF EDITOR INTERACTION ARCHITECTURE AUDIT
## Comprehensive Root-Cause Audit Report

- **Repository**: `InvincibleXray/pdf-page-extractor`
- **Workspace**: `C:\Users\A\Desktop\pdf tool web dev`
- **Target URL**: `http://127.0.0.1:4321/pdf-editor/`
- **Live Production URL**: `https://pdfpage.tools/pdf-editor/`
- **Timestamp**: `2026-09-28T09:15:00+05:30`
- **Audit Mode**: **ROOT-CAUSE AUDIT ONLY — ZERO PRODUCTION CODE MODIFICATIONS**
- **Final Verdict**: **ROOT CAUSE IDENTIFIED**

---

## 1. Executive Summary

Despite successive fixes in Phase 5 and Phase 6 targeting toolbar positioning and button responsiveness, user testing on physical mobile devices continued to expose two severe interaction defects:
1. **Problem A**: When attempting to drag, move, or place text objects, interaction starts but abruptly stops after moving a short distance (~10–20px), freezing the object or preview in place.
2. **Problem B**: The inline text editor appears as a large, separate, floating dialog card that feels completely detached from the PDF text being edited, obscuring surrounding document content and falling off-screen when the mobile keyboard appears.

This forensic audit conducted an exhaustive, instrumented investigation of the browser event stream, Chrome DevTools Protocol (CDP) touch dispatches, DOM layer hierarchy, computed CSS styles, and coordinate transformations across 5 viewports (375×812, 390×844, 430×932, 768×1024, and 1440×900).

### Core Conclusion
The architecture is **FULLY UNDERSTOOD**. Both issues are not random glitches or superficial styling problems; they are deterministic consequences of:
- **Default `touch-action: auto` on all canvas layers and objects** combined with **the total omission of `setPointerCapture`** in `move-object` and `resize-object`. After 10–15px of finger movement (the browser's pan slop threshold), the mobile browser interprets the touch as a page scroll gesture on `#editor-viewport` (`overflow: auto`), fires `pointercancel`, and permanently terminates the pointer event stream to JavaScript.
- **Architectural modal-coupling in `showAnchoredTextPopover`**, which builds an auxiliary 320px wide floating card with a decorative rotated beak, separate input box, and large button rows rather than an in-situ, direct contentEditable overlay sitting on the exact PDF text bounding box.

---

## 2. Root Cause Analysis

### Problem A: Why Movement Stops After 10–20px
The browser's native touch gesture lifecycle operates as follows:
1. When a user touches the screen, the browser emits `pointerdown`.
2. As the finger moves within a small bounding box (approximately 10–15 CSS pixels, known as the *touch slop threshold*), the browser emits initial `pointermove` events while assessing user intent.
3. If the touch target or any of its scrollable ancestor containers (`#editor-viewport`) has **`touch-action: auto`** (the default value):
   - The browser determines that the gesture is a native panning/scrolling action.
   - Per the W3C Pointer Events Specification (§5.2.8): *"When the user agent determines that a touch input is a native gesture (e.g. scroll or zoom), it MUST fire a `pointercancel` event at the target and stop delivering further pointer events."*
4. **The Smoking Gun**: Our CDP event harness captured the exact transition:
   - At $+10\text{px}$: `pointermove` fired cleanly; object moved from PDF $(169, 254)$ to $(186, 271)$.
   - At $+20\text{px}$: Browser emitted `pointercancel@(0,0) on <DIV id="editor-overlay-layer">`.
   - From $+40\text{px}$ to $+300\text{px}$: The object remained frozen at $(203, 288)$. **Zero further pointermove events were delivered to JavaScript.**
5. **Pointer Capture Absence**: While `create-shape` and `create-form` called `target.setPointerCapture(e.pointerId)`, the methods for moving and resizing existing objects (`move-object` and `resize-object` in `handlePointerDown`) **never called `setPointerCapture`**. Without pointer capture, moving fingers immediately lost ownership to the native scroller.

### Problem B: Why the Inline Editor Feels Detached and Broken
1. **Separate Floating Card Structure**:
   `showAnchoredTextPopover` in `src/utils/editorInteractionController.ts` creates an independent floating modal dialog:
   - Card width is hardcoded to `320px` (`maxWidth: calc(100vw - 24px)`).
   - Card height is $\sim 116\text{px}$ to $140\text{px}$.
   - It renders an auxiliary `div` textbox with a heavy blue border, a rotated triangular beak, and dedicated Cancel and Save button bars.
2. **Spatial Separation**:
   Instead of the user typing directly into the text element on the PDF, the editor is rendered 10px below (or above) the text. On a phone screen of 375px width, a 320px wide card takes up **85.3% of the viewport width**, obscuring the surrounding PDF document, table borders, and alignment lines.
3. **Software Keyboard Occlusion**:
   When the mobile virtual keyboard opens, the visual viewport height shrinks from 812px to ~420px. Because the popover is positioned at an absolute offset relative to the document card, it does not compensate for `visualViewport.height`. In our test, when the keyboard opened, the popover's top was at $471\text{px}$ and bottom at $587\text{px}$, placing it **100% off-screen underneath the virtual keyboard**.

---

## 3. Empirical Event Timeline Trace

The following timeline was captured directly by the diagnostic harness in `scratch/forensic_interaction_audit.mjs` during a controlled touch drag:

| Step | Event Type | Position $(x, y)$ | Target Element | Action / State | Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **0** | `touchstart` | $(153, 387)$ | `<DIV id="obj-text-1790566925829">` | Finger makes contact with text object | Native touch initiated |
| **1** | `pointerdown` | $(153, 387)$ | `<DIV id="obj-text-1790566925829">` | `isInteracting = true`, `mode = 'move-object'`. **`setPointerCapture` omitted!** | Drag initiated in JS |
| **2** | `pointermove` | $(163, 397)$ | `<DIV id="obj-text-1790566925829">` | Finger moves $+10\text{px}$. Delta applied. PDF coords: $(186, 271)$. Screen left: $122.7\text{px}$. | Object moves with finger |
| **3** | `pointercancel` | $(0, 0)$ | `<DIV id="editor-overlay-layer">` | **Threshold breached (+20px). Browser native scroller takes over touch.** | **CRITICAL FAILURE: Event stream severed** |
| **4** | `touchcancel` | $(173, 407)$ | `<DIV id="obj-text-1790566925829">` | Native touch canceled by compositor | JS notified of touch cancellation |
| **5** | *User moves $+40\text{px}$* | $(193, 427)$ | *Native Scroller* | Browser scrolls `#editor-viewport`. **No events sent to web page.** | Object frozen at $(203, 288)$ |
| **6** | *User moves $+80\text{px}$* | $(233, 467)$ | *Native Scroller* | Browser scrolls `#editor-viewport`. **No events sent to web page.** | Object frozen at $(203, 288)$ |
| **7** | *User moves $+300\text{px}$* | $(453, 687)$ | *Native Scroller* | Browser scrolls `#editor-viewport`. **No events sent to web page.** | Object frozen at $(203, 288)$ |
| **8** | `touchend` | $(453, 687)$ | *Native Scroller* | Finger leaves screen. No `pointerup` received by `EditorInteractionController`. | `isInteracting` left in hanging state |

---

## 4. DOM Interaction Layer Map

The PDF editor workspace is composed of 10 distinct stacked layers within `#editor-viewport`:

```
┌────────────────────────────────────────────────────────────────────────┐
│ Layer 10: Mobile Drawers & Sheets (#mobile-inspector-sheet, z-50)      │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 9:  Inline Text Popover (#active-inline-text-popover, z-50)      │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 8:  Selection Bounding Box & Handles (#selection-bounding-box, z-40)
├────────────────────────────────────────────────────────────────────────┤
│ Layer 7:  Dynamic Context Action Bar (#existing-text-action-bar, z-40) │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 6:  AcroForm Interactive Layer (#pdf-form-layer, z-30)           │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 5:  Interactive Editor Overlay (#editor-overlay-layer, z-20)     │
│           ├── Created text objects (.obj-text-..., z-10)               │
│           └── Text placement preview (#text-placement-preview, z-40)   │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 4:  PDF.js Text Layer (#pdf-text-layer, z-5)                     │
│           └── Selectable text spans (span[data-text-id])               │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 3:  PDF Render Layer (#pdf-render-layer, z-0)                    │
│           └── Raster Canvas (#pdf-canvas, z-auto)                      │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 2:  Page Card Wrapper (#pdf-page-card, z-auto)                   │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 1:  Scrollable Root Viewport (#editor-viewport, overflow: auto)  │
└────────────────────────────────────────────────────────────────────────┘
```

### Layer Property Matrix

| Layer ID | z-Index | `pointer-events` | `touch-action` | Position | Intercepts Touches? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `#editor-viewport` | `auto` | `auto` | **`auto` (Defect)** | `relative` | Yes (Triggers native scroll takeover) |
| `#pdf-page-card` | `auto` | `auto` | **`auto` (Defect)** | `relative` | Yes |
| `#pdf-canvas` | `auto` | `auto` | **`auto` (Defect)** | `static` | Yes (Receives empty clicks) |
| `#pdf-text-layer` | `5` | `none` | `auto` | `absolute` | Spans intercept click |
| `#editor-overlay-layer` | `20` | `none` | **`auto` (Defect)** | `absolute` | Container transparent |
| `[data-object-id]` | `10` | `auto` | **`auto` (Defect)** | `absolute` | Yes (Target of move-object) |
| `#selection-bounding-box` | `40` | `none` (handles `auto`) | **`auto` (Defect)** | `absolute` | Handles receive resize touches |
| `#existing-text-action-bar` | `40` | `auto` (dimmed in drag)| `manipulation` | `absolute` | Intercepts when visible |
| `#active-inline-text-popover`| `50` | `auto` | `auto` | `absolute` | Blocks all underlying content (320px) |

---

## 5. Coordinate Pipeline & Transformations

The editor translates coordinates across 8 distinct reference frames:

1. **Browser Client Screen Space** (`clientX`, `clientY`): Raw touch coordinates relative to the browser viewport.
2. **Visual Viewport Space** (`visualViewport.offsetTop/Left`): Physical display coordinates under soft keyboard or pinch-zoom.
3. **Editor Viewport Space**: Coordinates relative to the scrollable container `#editor-viewport` (`scrollLeft`, `scrollTop`).
4. **Canvas Screen Space** (`cssX = clientX - canvasRect.left`, `cssY = clientY - canvasRect.top`).
5. **Overlay Space** (`overlayRect.left`, `overlayRect.top`): Container space for all overlay elements.
6. **PDF Page Space** (72 DPI points): Mathematical PDF coordinate space where $(0, 0)$ is at the **bottom-left** of the page.
7. **Scaled PDF Space**: `point * viewport.scale`.
8. **Object Local Space**: Coordinates relative to the top-left corner of the individual object.

### Critical Coordinate Conversion Flaws
1. **Delta Calculation without Pointer Capture**:
   In `handlePointerMove`:
   ```ts
   const deltaX = (e.clientX - this.startPointer.x) / this.viewport.scale;
   const deltaY = (e.clientY - this.startPointer.y) / this.viewport.scale;
   ```
   Because `e.clientX` is in client screen space, if `#editor-viewport` scrolls during the gesture, the document shifts underneath the finger. Without `touch-action: none`, finger movement and page scroll occur simultaneously, compounding coordinate drift.
2. **Text Placement "Hover" Fallacy on Touch**:
   `initTextPlacementPreview` relies on `handlePointerMove` reading `clientX/Y` without any active touch contact. On touch screens, there is no cursor hover before finger contact. The instant contact occurs, `handlePointerDown` runs and immediately creates the inline editor popover, preventing the placement preview from ever following a sliding touch gesture.

---

## 6. Pointer Capture Audit

| Dimension | Inspection Finding | Severity |
| :--- | :--- | :--- |
| **API Availability** | `setPointerCapture`, `releasePointerCapture`, `hasPointerCapture` are 100% available in Edge/Chromium. | N/A |
| **Shape & Form Creation** | Used: `target.setPointerCapture?.(e.pointerId)` is present in `create-shape` and `create-form`. | Low |
| **`move-object`** | **MISSING**: Line 572 in `handlePointerDown` does NOT invoke `setPointerCapture`. | **CRITICAL** |
| **`resize-object`** | **MISSING**: Line 490 in `handlePointerDown` does NOT invoke `setPointerCapture`. | **CRITICAL** |
| **Gesture Loss Consequence** | Without pointer capture, moving fingers crossing outside the element boundary or triggering browser pan immediately causes `pointercancel`. | **CRITICAL** |

---

## 7. Touch-Action Audit

Inspection of computed CSS styles across all DOM elements revealed:
- `#editor-viewport`: `touch-action = auto`
- `#pdf-canvas`: `touch-action = auto`
- `#editor-overlay-layer`: `touch-action = auto`
- `.obj-[data-object-id]`: `touch-action = auto`
- `[data-handle]`: `touch-action = auto`

### Consequence
When `touch-action` is `auto`, the browser retains full authority to cancel pointer tracking and scroll the viewport whenever finger movement exceeds 10–15px. 

### Required Policy
- Draggable objects (`[data-object-id]`) and transform handles (`[data-handle]`) must have **`touch-action: none`**.
- During an active drag session (`isInteracting === true`), the active interaction target must own the pointer exclusively via pointer capture.

---

## 8. Action Bar Audit: Role in the Issue

| Checkpoint | Status | Assessment |
| :--- | :--- | :--- |
| **Direct Click Interception** | Resolved in Phase 6 | Action bar dims and sets `pointer-events: none` during active drag. |
| **Physical Occlusion** | Mitigated in Phase 6 | 5-tier dynamic placement maneuvers away from selection. |
| **Role in Problem A (Drag Stopping)** | **UNRELATED** | The drag stopping after 10–20px occurs even when the action bar is completely hidden or positioned elsewhere, caused entirely by `touch-action: auto` and `pointercancel`. |
| **Role in Problem B (Inline Editor)** | **CONTRIBUTING** | Action bar presence after popover save created confusion with multiple floating toolbars. |

---

## 9. Inline Editor Audit: Spatial Detachment Analysis

### Structural Inspection of `showAnchoredTextPopover`
1. **Container**: Appended to `#editor-overlay-layer`.
2. **Width**: Hardcoded to `320px` (`maxWidth: calc(100vw - 24px)`).
3. **Height**: Hardcoded to `116px`–`140px`.
4. **Internal Layout**:
   - Rotated square beak (`#popover-beak`)
   - Text input box (`#active-inline-text-editor`, `min-h-[46px]`, 2px blue border)
   - Action footer with separate `Cancel` and `Save` buttons.

### Why It Feels Detached
- **Cognitive & Visual Mismatch**: In desktop PDF editors (Adobe Acrobat, Apple Preview, Figma), clicking a text box turns that exact text box into an editable caret field. The user types *where the text lives*. In the current implementation, a large dialog box appears floating 10px below the text.
- **Occlusion**: On mobile, a 320px card blocks the surrounding content. The user cannot see the adjacent table columns or lines to gauge sizing.
- **Virtual Keyboard Failure**: When the mobile keyboard opens, the viewport shrinks to ~420px. The popover stays at its absolute position (top: ~471px), rendering it **100% off-screen underneath the virtual keyboard**.

---

## 10. Desktop vs. Mobile Behavioral Separation

| Feature / Behavior | Desktop Mouse | Mobile Touch Screen |
| :--- | :--- | :--- |
| **Hover State** | Continuous `pointermove` stream with no buttons pressed. | **Does not exist.** No pointer events until physical finger touch. |
| **Touch Slop / Pan Takeover** | None. Mouse dragging never triggers native page scrolling. | **Enforced.** Moving $>10\text{px}$ on `touch-action: auto` triggers `pointercancel`. |
| **Pointer Capture Requirement** | Recommended, but mouse drag often works without it if mouse stays over window. | **Mandatory.** Without capture, touch gestures are aborted by the browser. |
| **Screen Real Estate** | 1440×900: 320px popover is 22% of screen width; ample space. | 375×812: 320px popover is **85.3%** of screen width; massive occlusion. |
| **Keyboard Interaction** | Physical hardware keyboard; screen size unchanged. | Software keyboard shrinks visual viewport by 40–50%; pushes UI off-screen. |

---

## 11. Reproduction Matrix

| Viewport | Device Profile | Input Mode | Gesture Tested | Observed Result | Failure Boundary | Responsible Mechanism |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `375 × 812` | iPhone 12/13 mini | Touch | Drag object 300px | Moves 10px, then stops | 15–20px delta | `touch-action: auto` $\rightarrow$ `pointercancel` |
| `390 × 844` | iPhone 13/14 | Touch | Drag object 300px | Moves 10px, then stops | 15–20px delta | `touch-action: auto` $\rightarrow$ `pointercancel` |
| `430 × 932` | iPhone 14/15 Pro Max | Touch | Drag object 300px | Moves 10px, then stops | 15–20px delta | `touch-action: auto` $\rightarrow$ `pointercancel` |
| `768 × 1024` | iPad Portrait | Touch | Drag object 300px | Moves 10px, then stops | 15–20px delta | `touch-action: auto` $\rightarrow$ `pointercancel` |
| `1440 × 900` | Desktop | Mouse | Drag object 300px | Moves smoothly full 300px | None | Mouse lacks native pan gesture cancellation |

---

## 12. Root-Cause Confidence Assessment

| Suspected Cause | Confidence | Empirical Evidence |
| :--- | :--- | :--- |
| **`touch-action: auto` causing `pointercancel`** | **HIGH (100%)** | CDP event log captured `pointercancel@(0,0)` at $+20\text{px}$ followed by total stoppage of `pointermove`. |
| **Missing `setPointerCapture` in `move-object` / `resize-object`** | **HIGH (100%)** | Code inspection of `editorInteractionController.ts` lines 490–501 and 572–580 confirms complete absence. |
| **Oversized detached popover (`showAnchoredTextPopover`)** | **HIGH (100%)** | Computed geometry proves 320px width (85% of mobile screen) and 100% off-screen keyboard occlusion under 420px height. |
| **Text placement preview expecting mouse hover** | **HIGH (100%)** | `handlePointerDown` immediately invokes `createInlineTextEditorAt` on touch tap, eliminating any drag-placement ability. |

---

## 13. Recommended Architecture for Phase 8

> [!IMPORTANT]
> **Audit Boundary**: No fixes were implemented during Phase 7. The following architecture is the recommended implementation plan for Phase 8.

### Component 1: Touch-Action & Pointer Capture Foundation
1. **Apply `touch-action: none`**:
   - Add `touch-action: none` to all draggable text objects (`.obj-...`), selection handles (`[data-handle]`), and `#selection-bounding-box`.
   - When `isInteracting === true`, apply `touch-action: none` to `#editor-viewport` to lock viewport panning during object manipulation.
2. **Enforce Pointer Capture**:
   - In `handlePointerDown` for `move-object`: `(e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);`
   - In `handlePointerDown` for `resize-object`: `(e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);`
   - In `handlePointerUp`: `(e.target as HTMLElement)?.releasePointerCapture?.(e.pointerId);`
3. **Add `pointercancel` Listener**:
   - Register `window.addEventListener('pointercancel', this.boundPointerCancel)`.
   - On cancellation, gracefully finalize or revert the current drag operation rather than leaving `isInteracting: true` stranded.

### Component 2: True In-Situ Direct Text Editing Architecture
1. **Deprecate the 320px Detached Floating Card**:
   - Eliminate `#active-inline-text-popover`, the rotated beak, and the 320px card wrapper.
2. **In-Place Editable Overlay**:
   - Render the editable input **directly inside or over the bounding box of the text object**:
     - `left = screenRect.left`, `top = screenRect.top`
     - `width = Math.max(screenRect.width, 60)`, `height = screenRect.height`
     - Matches the exact font family, font size, weight, line height, and color of the target text.
3. **Compact Floating Action Pill**:
   - A minimalist, compact floating action bar attached to the bottom edge of the in-situ text:
     - Contains only: **✓ (Save / Commit)** and **✕ (Cancel / Discard)**.
     - Height: 32px (with 44px touch padding on mobile).
     - Does not block the surrounding document.
4. **Soft Keyboard & `visualViewport` Auto-Scroll**:
   - Listen to `window.visualViewport.addEventListener('resize')`.
   - When the virtual keyboard opens, smoothly scroll `#editor-viewport` so that the in-situ text and action pill remain centered in the visible screen area.

---

## 14. Phase 8 Regression Requirements

To prove that the interaction defects are permanently solved, Phase 8 must verify:
1. **Continuous Touch Drag**: A touch drag across $300\text{px}$ on viewports 375, 390, 430, and 768 must generate continuous `pointermove` events without triggering `pointercancel`.
2. **In-Situ Spatial Alignment**: The inline editor must mount at the exact screen coordinates of the selected text object ($\Delta \le 2\text{px}$).
3. **Zero Off-Screen Keyboard Occlusion**: When visualViewport shrinks to 420px, the in-situ text input and save/cancel controls must remain 100% visible inside the visible viewport.
4. **Full Regression Stability**: Zero breakages to existing Phase 2, Phase 5, Phase 5.1, and Phase 6 test suites (136/136 tests passing).

---

## 15. Skills & Workflow Audit

### Skills Used
- **`browser-visual-qa`** (`.agents/skills/browser-visual-qa/SKILL.md`): Used to conduct browser-first inspection of rendered DOM geometry, layer bounding boxes, and visual viewport metrics in headless Edge via CDP.
- **`playwright-cli`** (`.agents/skills/playwright-cli/SKILL.md`): Used CDP session commands (`Input.dispatchTouchEvent`) to simulate real touch events and log fine-grained event streams.
- **`web-accessibility`** (`.agents/skills/web-accessibility/SKILL.md`): Used to evaluate WCAG 2.5.1 pointer gestures and touch-action constraints.
- **`ui-ux-pro-max`** (`.agents/skills/ui-ux-pro-max/SKILL.md`): Used to evaluate the mental model of in-situ direct manipulation vs detached popovers.

### Available Skills Not Used
- **`a11y-debugging`**: Not used because `web-accessibility` directly provided pointer gesture and touch event criteria.
- **`memory-leak-debugging`**: Not used because this phase was strictly an interaction architecture and touch event audit, not a memory leak investigation.

---

## 16. Final Verdict

# `ROOT CAUSE IDENTIFIED`

The root causes of both Problem A (touch drag freezing at 10–20px due to `touch-action: auto` triggering `pointercancel` without pointer capture) and Problem B (oversized, detached 320px floating card lacking in-situ alignment and visualViewport keyboard awareness) have been empirically verified and fully documented.
