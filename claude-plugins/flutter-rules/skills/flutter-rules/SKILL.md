---
name: flutter-rules
description: Apply reusable Flutter engineering rules for clean architecture, BLoC, UI, API, navigation, quality, secure persistence, and Git safety. Use only when explicitly invoked.
compatibility: Codex, Claude Code, Cursor, and Devin. Flutter and Dart tooling are required for validation commands.
disable-model-invocation: true
metadata:
  author: aswinsubhash
  version: "1.0.0"
---

# Flutter Rules

Use this skill only when explicitly invoked through the host agent's skill
mechanism.

## Workflow

1. Inspect the existing implementation before changing code.
2. Read only the reference files relevant to the task.
3. Apply the loaded rules before introducing new patterns.
4. Prefer existing project conventions and helpers over new abstractions.
5. Run `flutter analyze` after meaningful code changes when possible.
6. Do not perform risky git operations unless explicitly requested.

## References

- `references/architecture.md`: dependency direction, feature boundaries, Result/Failure/Exception flow, DI, persistence and secret handling, import hygiene, barrel policy, architecture definition of done.
- `references/ui.md`: localization, page composition, RTL, global loading, colors, image assets, ScreenUtil, headers, text fields, widget method ordering.
- `references/state.md`: enum-based state management, BLoC preference, private logic methods, route-level BLoC provisioning, BlocBuilder/BlocConsumer scope.
- `references/api.md`: Dio client baseline and request model rules.
- `references/navigation.md`: tab navigation, scroll reset, and go_router standards.
- `references/quality.md`: mandatory analysis, sensitive-storage verification, AI-code cleanup, README/ARCHITECTURE/`///` docs, and inline comment rules.
- `references/git.md`: git safety rules.
