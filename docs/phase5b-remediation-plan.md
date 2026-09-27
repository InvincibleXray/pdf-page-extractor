# Phase 5B — Remediation Plan

## Vulnerability Summary

| ID | Severity | Title | Affected File | Security Impact |
|----|----------|-------|---------------|-----------------|
| V1 | MEDIUM | Memory Safety Ceiling Override | `redactionRasterizer.ts` L64 | Canvas OOM on constrained devices |
| V2 | LOW | Rotated Page DPI Asymmetry | `redactionRasterizer.ts` L53-66 | Visual quality regression |
| V3 | LOW | Large Page Drag UX Failure | `editorInteractionController.ts` | UX gap (not security) |
| V4 | INFO | Google Fonts External Dependency | Layout HTML / CSS | Privacy metadata |
| V5 | INFO | Validator Compressed Stream Blind Spot | `redactionValidator.ts` L117-139 | Theoretical coverage gap |
| V6 | INFO | Empty `/Annots` Array | `pdfExportEngine.ts` | Cosmetic noise |

---

## V1: Memory Safety Ceiling Override

### Root Cause

In `redactionRasterizer.ts` line 64:

```typescript
scale = Math.max(1.5, scale);
```

The minimum scale floor of 1.5 (≈108 DPI) is applied AFTER the memory clamp, which can produce pixel counts exceeding the 16 MP safety ceiling.

### Proposed Fix

```typescript
// Apply memory clamp
if (estPixels > maxPixels) {
  scale = Math.sqrt(maxPixels / (baseViewport.width * baseViewport.height));
}

// Apply minimum ONLY if it doesn't exceed the memory ceiling
const minScale = 1.5;
if (scale < minScale) {
  const minPixels = baseViewport.width * minScale * baseViewport.height * minScale;
  if (minPixels <= maxPixels) {
    scale = minScale;
  }
  // Otherwise keep the clamped scale — reduced DPI is safer than OOM
}
```

### Regression Tests Required

1. A4 page (595×842): scale should be 4.1667 (300 DPI), within 16 MP
2. Large page (2592×3456): scale should be clamped to ~1.3365 (97 DPI), NOT bumped to 1.5
3. Very small page (100×100): scale should be 4.1667 → minimum 1.5 applies (within ceiling)

---

## V2: Rotated Page DPI Asymmetry

### Root Cause

When a page has 90° or 270° rotation, `pageProxy.getViewport({ scale, rotation })` produces a viewport where width and height are swapped. The page dimensions in `pageState` (width/height) may not reflect this swap, causing the raster image to be drawn with incorrect aspect mapping.

### Proposed Fix

After computing the viewport, verify the raster image dimensions match the target page layout:

```typescript
const viewport = pageProxy.getViewport({ scale, rotation });
const width = Math.round(viewport.width);
const height = Math.round(viewport.height);

// For the output page, swap dimensions if rotation is 90 or 270
const outputWidth = (rotation === 90 || rotation === 270) ? pageState.height : pageState.width;
const outputHeight = (rotation === 90 || rotation === 270) ? pageState.width : pageState.height;
```

And in the export engine, draw the embedded image using the correct output dimensions.

### Regression Tests Required

1. 0° page: raster 2479×3508 on 595×842pt page → 300×300 DPI
2. 90° page: raster should match rotated viewport → symmetric DPI
3. 180° page: same as 0° (no dimension swap)
4. 270° page: same as 90°

---

## V3: Large Page Drag UX Failure

### Root Cause

The interaction controller's drag-to-create coordinate mapping does not account for the extreme zoom-out required to fit a 2592×3456pt page within a 1440×900 viewport. The mouse coordinates may not map correctly to PDF coordinates at sub-0.3x zoom levels.

### Proposed Fix

1. Add explicit minimum interaction zone size (e.g., 10px drag minimum in screen space)
2. Log coordinate mapping debug info when drag results in zero-size redaction
3. Consider adding a manual coordinate input for redaction placement on large pages

### Regression Tests Required

1. Standard page drag-to-create: works at 100%, 50%, 25% zoom
2. Large page drag-to-create: works at the auto-fitted zoom level
3. Verify minimum drag threshold prevents zero-size redactions

---

## V4: Google Fonts External Dependency

### Root Cause

The application HTML includes:
```html
<link href="https://fonts.googleapis.com/css2?family=Inter..." rel="stylesheet">
```

### Proposed Fix

Self-host the Inter font:
1. Download Inter WOFF2 files
2. Place in `public/fonts/`
3. Update CSS `@font-face` declarations to reference local files

### Regression Tests Required

1. Verify font renders correctly from local files
2. Verify zero external requests during PDF operations (CDP network audit)

---

## V5: Validator Compressed Stream Blind Spot

### Root Cause

`redactionValidator.ts` lines 117-139 decode the raw PDF bytes as Latin-1 and UTF-8 strings and search for canary tokens. Flate-compressed streams are NOT decompressed.

### Proposed Fix

Add a Flate decompression pass to the raw binary scanner:

```typescript
// After raw byte scan, also scan decompressed streams
const streamRegex = /stream[\r\n]+/g;
// Extract and inflate each stream, search for tokens
```

Alternatively, the independent forensic engine's `extractAndScanStreams()` logic can be adapted for production use.

### Regression Tests Required

1. Create a fixture where canary is in a Flate-compressed stream on a redacted page
2. Verify the enhanced validator detects it
3. Verify false-positive rate does not increase for unredacted pages

---

## V6: Empty `/Annots` Array

### Root Cause

pdf-lib's `PDFDocument.create()` and page construction may initialize an empty `/Annots` array by default when the export engine processes annotation-related logic.

### Proposed Fix

After constructing redacted pages, explicitly remove the `/Annots` key if the array is empty:

```typescript
if (isRedactedPage) {
  const annotsRef = page.node.get(PDFName.of('Annots'));
  if (annotsRef) {
    const annots = outDoc.context.lookup(annotsRef);
    if (annots && typeof annots.size === 'function' && annots.size() === 0) {
      page.node.delete(PDFName.of('Annots'));
    }
  }
}
```

### Regression Tests Required

1. Redacted page should have no `/Annots` key in output
2. Unredacted page with annotations should preserve them
3. Unredacted page without annotations should not gain an `/Annots` key

---

## Implementation Priority

| Priority | ID | Effort | Reason |
|----------|----|--------|--------|
| 1 | V1 | Small | Memory safety correctness |
| 2 | V2 | Small | Visual quality on rotated pages |
| 3 | V5 | Medium | Validator coverage depth |
| 4 | V4 | Small | Privacy hygiene |
| 5 | V6 | Trivial | Structural cleanliness |
| 6 | V3 | Medium | UX improvement for edge case |

---

## Post-Remediation Verification

After implementing fixes, re-run:

1. `node scripts/phase5b-batch-forensics.js` — Independent forensic audit on all fixtures
2. `node scripts/phase5b-test-fixture-z.js` — Large page memory clamp verification
3. `node scripts/secure-redaction-acceptance-test.js` — Original Phase 5A acceptance test
4. `node scripts/phase4-real-export-acceptance-test.js` — Phase 4 regression
5. `npm run check` — TypeScript
6. `npm run build` — Production build
