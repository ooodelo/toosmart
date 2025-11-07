# Audit: Dots Navigation Tasks 3.1–3.4

| ID | Requirement | Status | Findings |
| --- | --- | --- | --- |
| 3.1 | Hide dots outside desktop | ✅ | The base `.dots-rail` rule uses `display: none`, with `body[data-mode="desktop"]` re-enabling it while tablet-wide and handheld rules keep it hidden; JS also toggles `hidden` when the mode is not desktop. 【F:styles.css†L243-L400】【F:script.js†L84-L106】 |
| 3.2 | Align dots with `.text-box` | ⚠️ | `--text-box-left` is updated from the live `.text-box` bounding box to position the rail beside the text column, which solves misalignment across responsive widths. However, the calculation runs only when dots are (re)configured or on resize/orientation events; layout shifts inside the text column (e.g., font loading) after initialization are not tracked until the next scroll handler tick. Consider observing `.text-box` size changes to keep the variable in sync. 【F:styles.css†L243-L247】【F:script.js†L64-L107】【F:script.js†L320-L337】 |
| 3.3 | Observer respects sticky header | ⚠️ | The observer now factors the header height into `rootMargin` and resolves the active section through a probe point beneath the header, matching visible content in most cases. Edge cases remain when sections are shorter than the probe zone: the fallback distance heuristic may switch early. 【F:script.js†L109-L171】 |
| 3.4 | Disable observer in non-desktop | ✅ | Non-desktop modes trigger `teardownObserver()` and keep the rail hidden; resize/orientation handlers also disconnect the observer when leaving desktop. 【F:script.js†L41-L107】【F:script.js†L320-L337】 |

## Notes
- The scroll listener continues to run in all modes but exits early for non-desktop, which is harmless yet slightly wasteful. 【F:script.js†L277-L290】
- If the number of `.text-section` elements changes dynamically, `configureDots()` is not called again, so the UI would desynchronize; static markup avoids the issue for now. 【F:script.js†L84-L107】
