# Insights, voice prompt, usage and POC feedback verification

26 October 2026. Verified against the existing light business UI and Gabriel's requested changes. No deployment, commit or push was performed.

## Functional evidence

- The safe full regression run passed **594 tests**, with 104 database-dependent tests skipped. The latest focused checks passed 13 tests, including an additional cross-period generation contention case added after that full run. TypeScript and ESLint passed. The destructive database/e2e fixture setup was not run against the persistent demo.
- The production standalone build succeeded in an isolated directory. A final rebuild first encountered the framework's known-security-version notice and completed on repeat with the warning acknowledged; build success does not mean the dependencies are safe to expose. The final standalone served 30 anonymous login/health requests successfully with a 256-MiB heap and approximately 142 MiB observed process memory. See [the launch blockers and runtime evidence](render-neon-free-assessment.md).
- A real first visit to the previously ungenerated seven-day and ninety-day Insights windows automatically called Groq `openai/gpt-oss-20b`, saved a ready PostgreSQL snapshot covering seven conversations and recorded one provider-reported generation event per snapshot. Reloading reused the saved snapshot without another POST/model call. No Generate/Up to date click was used.
- Topic selection filters the linked evidence conversations; clearing restores the complete sample. Unknown/cross-conversation evidence, incomplete topic membership and invented conversation references are rejected by validation tests.
- Workspace usage separates delivered replies from all model calls and internal planning/intake/analytics. CSV export, month selection and Escape dismissal passed in the browser. A temporary-tenant database check confirmed provider-response deduplication, reasoning included within output, estimates kept separate, and tenant-isolated reads. No client price or invented financial saving was added.
- Brand prompt browser checks passed: choosing a preset keeps custom text, explicit preset application replaces it, the save payload retains the exact prompt in custom mode, a conflict preserves unsaved text, back navigation warns, and discard restores the original. A temporary tenant verified the exact custom draft text survives PostgreSQL storage. Existing publication gates remain.
- Feedback browser checks passed: select an element, create a pinned note, add a reply, reload and find both comments, locate the anchor, resolve and reopen. Resolving does not erase an unsent reply. Anonymous feedback reads return 401; foreign-origin writes return 403. API tests cover session-derived author/tenant identity, inaccessible threads, strict fields and request/comment limits.
- Only the exact QA feedback thread and its two QA comments were deleted after verification, guarded by their ID, demo tenant and expected QA contents. Existing customer data remained **seven conversations / 22 messages**. Genuine Insights snapshots and metering remain saved.

## Visual comparison and responsive checks

Browser/IAB was unavailable, so verification used Playwright Chromium against the running local app. The temporary Chromium profile was placed in `/var/tmp` because `/tmp` was nearly full; no unrelated temporary files or processes were removed. Screenshots were captured with Playwright and inspected with `view_image`, alongside the supplied references in the same review pass.

Reference screenshots used as the accepted existing design:

- Knowledge overview: `/mnt/c/Users/Gabriel/AppData/Local/Temp/tmp14CD.png` (1621 × 924).
- Brand voice: `/mnt/c/Users/Gabriel/AppData/Local/Temp/tmp9B5C.png` (1322 × 764).
- Synthesis changes: `/mnt/c/Users/Gabriel/AppData/Local/Temp/tmpE411.png`.
- Feedback intent: `/mnt/c/Users/Gabriel/AppData/Local/Temp/tmpF80D.png` (the Google Docs-style comment request, not a pixel layout specification).

Desktop checks included 1494 × 1100 and both reference-size viewports above. Mobile checks used 390 × 844 for Insights, Knowledge, Brand voice, usage and feedback. Full-page captures were used for long content, rather than reducing product font sizes to fit the viewport.

| Comparison point | Reference / requested change | Render evidence and resolution |
|---|---|---|
| Navigation and copy | Retain business navigation; rename Synthesis / Analytics to Insights | Three destinations, one active state, Insights heading and browser title Pronto AI. The requested technical interpretation paragraph and manual freshness button are absent. |
| Card layout | Brand voice should span the Knowledge/Handoff width; remove Channels overview | Knowledge → Brand voice → Handoff. At the 1494-pixel desktop check Brand voice and Handoff both measured 1142 pixels wide. No Channels overview node remains. |
| Palette and containers | Existing white surfaces, fine gray borders, indigo actions | Existing white `#ffffff`, accent `#455dd3`, rounded panels, subdued labels and green/amber status badges retained. No generated imagery or new visual theme introduced. |
| Typography and controls | Existing heading/body hierarchy; presets plus custom prompt | Existing typography system retained; custom textarea, counter and explicit preset application follow current form styles. Labels and helpers wrap at mobile width without horizontal overflow. |
| Icons and action placement | Existing Lucide/arrow treatment; usage export top right | Consistent stroke icons for navigation, cards, export, close, feedback and return arrows. Export sits in the usage header; the View analytics link is removed. |
| Comment interaction | Pin UI feedback, reply and resolve | Page pins, anchor context, author/timestamps, threaded comments and status controls are visible. The pinning instruction bar was moved and made pointer-transparent so it cannot intercept clicks on the target element. |
| Responsive behavior | Usable mobile workspace | Three-column mobile navigation; stacked metrics/forms; scrollable usage dialog and feedback pane. Automated width checks found no horizontal page overflow. |
| Client rendering | Stable server/client output | Fixed an SVG title text hydration mismatch and made the saved-analysis timestamp explicitly UTC. Final browser runs reported no page errors. |

The above-the-fold copy comparison found only intentional requested additions/renames: Insights, the custom prompt controls, metered workspace usage and private prototype feedback. Existing knowledge/source status wording and business approval semantics remain. No material unrequested layout mismatch remained in the inspected states; the implementation was visually checked against the established design with the requested changes applied.

Intentional POC limits: feedback is an overlay, element anchors are best-effort DOM locations, and pins may need relocation after substantial UI changes. The separate native usage/import dialogs do not have an embedded feedback control; a reviewer can leave a page comment about them after closing the dialog. This feature stores comments, not screenshots, and sends no notifications. Temporary visual QA screenshots/scripts are removed after review; product source, tests, migrations and this evidence summary remain.
