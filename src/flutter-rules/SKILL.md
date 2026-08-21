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
2. Read only the reference files relevant to the task.
3. Before creating or modifying tests, inspect the existing test organization
   and read `references/testing.md`. A lone `test/widget_test.dart` or flat
   legacy test does not establish a feature-specific test convention.
4. Apply relevant rules only to code required by the current task. Do not
   modify unrelated code or retrofit untouched legacy code.
5. Prefer existing project conventions and helpers over new abstractions.
6. Do not move files, reorganize features or tests, add dependencies, or make
   architecture-wide changes unless the task requires it or the user approves.
   Moving an in-scope flat legacy test into its mandatory mirrored path is part
   of the task and does not require separate approval.
7. Place every new or modified feature and core test at the mandatory mirrored
   path defined in `references/testing.md`. Never add feature-specific tests
   directly under `test/`.
8. Before finalizing, verify every new or modified test path maps to its
   production path. Test placement is a completion requirement; document any
   intentional exception in the final response.
9. When Dart tests are created or modified, run
   `node "<skill-root>/scripts/validate-test-policy.mjs" --project .` from the
   Flutter project root. Fix every reported violation before completion and
   disclose every documented exception in the final response.
10. Run `flutter analyze` after implementation or refactoring. Fix issues
    introduced by the current changes; report unrelated pre-existing issues
    without modifying them unless explicitly requested.

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
