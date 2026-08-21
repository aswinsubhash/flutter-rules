---
name: flutter-rules
description: Apply reusable Flutter and Dart engineering rules for implementation and evidence-based feature reviews across clean architecture, Cubit/Bloc, UI, APIs, Dart 3, navigation, quality, and secure persistence. Use only when explicitly invoked.
compatibility: Codex, Claude Code, Cursor, and Devin. Flutter and Dart tooling are required for validation commands.
disable-model-invocation: true
metadata:
  author: aswinsubhash
  version: "2.0.2"
---

# Flutter Rules

Use this skill only when explicitly invoked through the host agent's skill
mechanism.

## Workflow

1. Inspect the existing implementation before changing code.
2. Read only the reference files relevant to the task; use the References
   section below to determine their scope.
3. When creating or modifying tests, read and follow every mandatory placement,
   Bloc/Cubit, exception, and automated validation requirement in
   `references/testing.md`.
4. Apply relevant rules only to code required by the current task. Do not
   modify unrelated code or retrofit untouched legacy code.
5. Prefer existing project conventions and helpers over new abstractions.
6. Do not move files, reorganize features, add dependencies, or make
   architecture-wide changes unless required by the task or approved by the
   user.
7. Follow the mandatory analysis policy in `references/quality.md` after
   implementation or refactoring.

## Implemented feature reviews

When the user asks to review an implemented feature, follow
`references/review.md`. Generate and open the required report for every such
review. The review must not modify application code; wait for the user to
choose any remediation after reading the report.

## References

- `references/dart.md`: Effective Dart naming, types, style, imports, documentation, widgets, and performance.
- `references/dart3.md`: Dart 3 branching, patterns, records, sealed classes, and class modifiers.
- `references/testing.md`: test value, mandatory mirrored placement, automated policy validation, behavior-focused assertions, naming, cleanup, and test-type selection.
- `references/architecture.md`: dependency direction, feature boundaries, Result/Failure/Exception flow, DI, persistence and secret handling, import hygiene, barrel policy, architecture definition of done.
- `references/ui.md`: page composition, RTL, global loading, colors, image assets, ScreenUtil, headers, text fields, and widget method ordering.
- `references/localization.md`: app-owned localization, ARB versus `AppStrings`, reusable package boundaries, and language controls.
- `references/state.md`: Cubit/Bloc selection, enum or sealed state modeling, events, architecture boundaries, diagnostics, mandatory `bloc_test` coverage, route-level provisioning, and widget scope.
- `references/api.md`: Dio client baseline and request model rules.
- `references/navigation.md`: tab navigation, scroll reset, and go_router standards.
- `references/flutter-errors.md`: Flutter layout constraints, lifecycle errors, and debugging workflow.
- `references/quality.md`: mandatory analysis, sensitive-storage verification, AI-code cleanup, README/ARCHITECTURE/`///` docs, and inline comment rules.
- `references/review.md`: implemented-feature review scope, evidence, classification, report generation, and human approval boundary.
