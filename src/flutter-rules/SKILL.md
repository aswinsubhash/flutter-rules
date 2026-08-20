---
name: flutter-rules
description: Apply reusable Flutter and Dart engineering rules for clean architecture, Cubit/Bloc, UI, APIs, Dart 3, navigation, quality, and secure persistence. Use only when explicitly invoked.
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
3. Apply relevant rules only to code required by the current task. Do not
   modify unrelated code or retrofit untouched legacy code.
4. Prefer existing project conventions and helpers over new abstractions.
5. Do not move files, reorganize features or tests, add dependencies, or make
   architecture-wide changes unless the task requires it or the user approves.
6. Run `flutter analyze` after implementation or refactoring. Fix issues
   introduced by the current changes; report unrelated pre-existing issues
   without modifying them unless explicitly requested.

## References

- `references/dart.md`: Effective Dart naming, types, style, imports, documentation, widgets, and performance.
- `references/dart3.md`: Dart 3 branching, patterns, records, sealed classes, and class modifiers.
- `references/testing.md`: test value, behavior-focused assertions, organization, naming, cleanup, and test-type selection.
- `references/architecture.md`: dependency direction, feature boundaries, Result/Failure/Exception flow, DI, persistence and secret handling, import hygiene, barrel policy, architecture definition of done.
- `references/ui.md`: page composition, RTL, global loading, colors, image assets, ScreenUtil, headers, text fields, and widget method ordering.
- `references/localization.md`: app-owned localization, ARB versus `AppStrings`, reusable package boundaries, and language controls.
- `references/state.md`: Cubit/Bloc selection, enum or sealed state modeling, events, architecture boundaries, diagnostics, testing, route-level provisioning, and widget scope.
- `references/api.md`: Dio client baseline and request model rules.
- `references/navigation.md`: tab navigation, scroll reset, and go_router standards.
- `references/flutter-errors.md`: Flutter layout constraints, lifecycle errors, and debugging workflow.
- `references/quality.md`: mandatory analysis, sensitive-storage verification, AI-code cleanup, README/ARCHITECTURE/`///` docs, and inline comment rules.
