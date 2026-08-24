# Implemented Feature Review

Use this workflow whenever the user asks Flutter Rules to review an implemented feature. A review produces evidence and report artifacts; it does not modify application code.

## Review boundary

- Treat the review as read-only except for `.flutter-rules/reviews/` artifacts.
- Do not fix findings, add dependencies, reorganize code, or edit project configuration during the review.
- After presenting the report, wait for the user to choose follow-up work in chat.
- Check whether `.flutter-rules/reviews/` is ignored. If it is not, disclose that the artifacts are untracked and ask before editing `.gitignore`.

## Determine the scope

Use the first reliable source below:

1. A user-supplied commit range, comparison branch, or file list.
2. Current staged, unstaged, and relevant untracked feature work.
3. The feature branch compared with the merge-base of the detected default branch.

If the baseline or feature boundary is still ambiguous, ask the user before reviewing. Record the baseline, target, included files, and limitations in the report.

Inspect directly changed files and only the affected dependency, public API, routing, DI, persistence, localization, state-management, UI, and test surfaces. Do not turn a feature review into an audit or retrofit of untouched legacy code.

## Gather evidence

- Read the implementation and acceptance criteria before judging it.
- Read only Flutter Rules references relevant to the changed and affected surfaces.
- Run appropriate project validation when available, including `flutter analyze` and focused tests. Record every check as `passed`, `failed`, `blocked`, or `not-run`; never imply an unexecuted check passed.
- Separate confirmed findings, findings that need verification, passed checks, and unverified areas. Mark findings that predate the feature with `provenance: affected-pre-existing` when the current change materially exposes or affects them.
- A confirmed finding requires exact project-relative file and line evidence. When its impact depends on a specific entry path or runtime flow, also require acceptance criteria, product evidence, or reproducible runtime evidence. Mark an incomplete concern `needs-verification` instead of asserting it as a defect.
- Distinguish technically addressable routes from product-supported flows. Route registration alone does not prove that direct or deep-link entry is supported.
- If a finding depends on an unsupported or unverified entry path, classify it as `needs-verification` rather than `confirmed`.
- Redact tokens, credentials, personal data, and secret values from excerpts. A path and line range are sufficient when a safe excerpt cannot be included.
- Report only actionable issues introduced by or materially exposed by the reviewed feature. Do not report personal style preferences as defects.

## Classification

Keep these dimensions independent:

| Dimension | Values | Meaning |
| --- | --- | --- |
| Severity | `critical`, `high`, `medium`, `low` | Impact if the issue occurs |
| Risk tier | `R1`, `R2`, `R3`, `R4` | Release urgency, from blocker to optional follow-up |
| Confidence | `high`, `medium`, `low` | Strength of the available evidence |
| Effort | `XS`, `S`, `M`, `L`, `XL` | Relative remediation scope, not a time estimate |

Use `critical` only for outcomes such as exploitable security compromise, unrecoverable data loss, authentication bypass, or application-wide failure. Architecture, style, and documentation issues are not critical unless their demonstrated impact warrants it.

Do not assign `medium` or `high` severity to hypothetical navigation behavior without acceptance criteria, product evidence, or reproducible runtime evidence.

## Remediation guidance

- Choose the least behavior-changing remediation by default when options differ in navigation history or animation.
- Do not automatically choose `context.go` when a guarded `context.pop` preserves the existing UX and the current product flow guarantees a valid stack.
- Before recommending a material navigation-history or animation change, explain the trade-off and require explicit user direction.

## Report data

Read `schemas/review-report.schema.json` and create a conforming JSON document. Each finding must include:

- A stable ID, concise title, status, provenance, severity, risk tier, confidence, and effort.
- Affected modules and project-relative files.
- The relevant implementation changes and user or production impact.
- Exact evidence, including safe excerpts where useful.
- The Flutter Rule, requirement, correctness, security, or testing basis.
- Concrete remediation and verification guidance.

The renderer computes counts and ordering; do not add duplicate summary totals.

## Generate and present artifacts

1. Create a collision-safe directory named `.flutter-rules/reviews/<YYYYMMDDTHHMMSSZ>-<feature-slug>/` in the reviewed project. Use UTC and add a numeric suffix if the path already exists.
2. Save the source data as `review.json`.
3. Resolve this skill's installed directory and run:

   ```text
   node <skill-directory>/scripts/render-review-report.mjs <review.json> --output <review.html>
   ```

   The renderer opens the report by default. Use `--no-open` only for headless environments or when the user asks not to open it.
4. Treat a browser-launch failure as non-fatal and give the user the absolute HTML path.
5. Report both artifact paths, summarize the highest-risk findings, disclose limitations and untracked artifact status, and wait for the user's decisions. Do not begin remediation automatically.
