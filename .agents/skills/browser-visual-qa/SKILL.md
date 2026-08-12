---
name: browser-visual-qa
description: Performs autonomous browser-based visual QA for web projects. Use when implementing or reviewing a frontend and the task requires opening the running site in Chrome, visually inspecting the rendered UI, comparing it with a reference image or expected design, testing responsive states, fixing visual/functional bugs, and rechecking the result.
---

# Browser Visual QA

## Purpose

Use this skill for frontend implementation tasks where source-code inspection alone is insufficient. The rendered application must be inspected in an actual browser.

The required workflow is:

**Implement → Run → Open in Chrome → Inspect → Compare → Fix → Retest → Final verify**

Never claim that a visual inspection was performed unless the rendered page was actually opened and inspected with the available browser capability.

## Browser-first verification

When this skill is active:

1. Start or identify the local development server.
2. Open the running application in the available Antigravity browser/Chrome environment.
3. Inspect the rendered page, not only HTML/CSS source.
4. Use screenshots/visual browser state when available.
5. Compare the rendered result against the supplied reference image or the stated design requirements.
6. Interact with the UI to test important states.
7. Fix discovered problems.
8. Reload and inspect again.
9. Repeat until major visual and functional issues are resolved.

### Important

Antigravity has an integrated browser capability that can open and actuate a local Chrome browser. Use that browser capability when available.

If browser tools are unavailable, disabled, or inaccessible:
- Do NOT pretend that visual QA was completed.
- Complete code/build checks that are possible.
- Clearly report that browser visual verification could not be performed.
- Do not substitute source-code inspection and call it visual inspection.

## Visual comparison checklist

Compare the actual rendered page against the reference for:

- Overall composition
- Layout proportions
- Alignment
- Typography hierarchy
- Font sizes and weights
- Line heights
- Whitespace
- Card dimensions
- Border radius
- Borders
- Shadows
- Colors
- Icons
- Button dimensions
- Input dimensions
- Upload/drop-zone appearance
- Header
- Footer if present
- Responsive behavior
- Light/dark theme consistency

Prioritize high-impact differences first:
1. Layout/composition
2. Spacing/alignment
3. Typography
4. Colors
5. Component details

Do not waste time trying to reproduce insignificant pixel-level differences if the visual reference is affected by different viewport dimensions or rendering engines.

## Functional browser checks

For a typical frontend tool, test applicable states such as:

- Initial/empty state
- Main interactive controls
- File selection
- Drag-over state
- Valid input
- Invalid input
- Disabled controls
- Enabled controls
- Error messages
- Loading/progress state
- Success state
- Light mode
- Dark mode
- Mobile layout
- Tablet layout
- Desktop layout
- Keyboard navigation where practical

Also check for:
- Horizontal overflow
- Broken images/icons
- Missing fonts
- Console errors
- Runtime errors
- Buttons that do nothing unexpectedly
- Inputs that accept invalid values
- Layout shifts or overlapping elements

## Responsive verification

At minimum, inspect:
- ~320px mobile
- ~375px mobile
- ~768px tablet
- ~1024px desktop/tablet
- ~1440px desktop

Do not assume responsive behavior is correct merely because media queries exist.

## Reference-image rules

When a reference image is supplied:

- Treat it as the primary visual source of truth.
- Reproduce the visual hierarchy and interaction structure.
- Do not copy demonstration data unless explicitly requested.
- If the image contains example filenames, numbers, page ranges, names, statistics, or other sample values, treat them as placeholders.
- Use dynamic/empty states where the real application would need them.

## Fix-and-retest loop

When a visual or functional problem is found:

1. Identify the likely source.
2. Modify the minimum necessary code.
3. Reload the application.
4. Reinspect the affected area.
5. Recheck nearby components for regressions.

Do not stop after the first implementation if obvious discrepancies remain.

## Build verification

Before final completion:

- Run the project's build/type checks.
- Check for TypeScript errors.
- Check for framework/build errors.
- Check the browser console where available.
- Confirm the final page loads successfully.
- Perform a final browser visual inspection.

## Final report

Report concisely:

- What was implemented
- Files changed
- Browser visual QA performed: Yes/No
- Functional checks performed
- Major issues found and fixed
- Build/type-check result
- Remaining limitations

Never report "visually verified" unless the browser inspection actually happened.
