# Flutter Rules

[![Validate skill packages](https://github.com/aswinsubhash/flutter-rules/actions/workflows/validate.yml/badge.svg)](https://github.com/aswinsubhash/flutter-rules/actions/workflows/validate.yml)
[![Latest tag](https://img.shields.io/github/v/tag/aswinsubhash/flutter-rules?sort=semver)](https://github.com/aswinsubhash/flutter-rules/tags)
[![npm](https://img.shields.io/npm/v/%40aswinsubhash%2Fflutter-rules)](https://www.npmjs.com/package/@aswinsubhash/flutter-rules)
[![Agent Skills](https://img.shields.io/badge/Agent%20Skills-compatible-4c6ef5)](https://agentskills.io/specification)

Reusable engineering guidance for building maintainable, production-ready
Flutter applications with AI coding agents.

Flutter Rules gives Codex, Claude Code, Cursor, and Devin a shared set of
principles for clean architecture, state management, UI, networking,
navigation, testing, security, and Git workflows. The skill is invoked
explicitly, so it applies only when requested.

## What it covers

- Clean architecture and feature boundaries
- Effective Dart and Dart 3 language conventions
- Cubit/BLoC state-management and testing conventions
- Flutter UI, accessibility, and responsive design
- Flutter layout-error diagnosis and debugging workflow
- API clients, models, repositories, and error handling
- Navigation and routing
- Testing, analysis, documentation, and code quality
- Secure storage and SharedPreferences usage

## Install

Install Flutter Rules for all supported agents:

```bash
npx @aswinsubhash/flutter-rules@latest install all
```

No plugin marketplace setup is required. Install for a specific agent instead:

```bash
npx @aswinsubhash/flutter-rules@latest install codex
npx @aswinsubhash/flutter-rules@latest install claude
npx @aswinsubhash/flutter-rules@latest install cursor
npx @aswinsubhash/flutter-rules@latest install devin
```

Preview an installation without changing anything:

```bash
npx @aswinsubhash/flutter-rules@latest install all --dry-run
```

## Use

Flutter Rules runs only when you invoke it explicitly.

| Agent | Invocation |
| --- | --- |
| Codex | `$flutter-rules` |
| Claude Code | `/flutter-rules` |
| Cursor | `/flutter-rules` |
| Devin | `@skills:flutter-rules` |

Examples for Codex:

```text
$flutter-rules review this authentication feature
$flutter-rules plan a new checkout flow
$flutter-rules check whether this session storage is secure
```

Start a new agent session after installation so the skill is discovered.

## Manage

Update Flutter Rules:

```bash
npx @aswinsubhash/flutter-rules@latest update all
```

Check that it is installed correctly:

```bash
npx @aswinsubhash/flutter-rules@latest doctor all
```

Uninstall it:

```bash
npx @aswinsubhash/flutter-rules@latest uninstall all
```

Use `--help` to see all commands and targets:

```bash
npx @aswinsubhash/flutter-rules@latest --help
```

## Community

- Read [CONTRIBUTING.md](CONTRIBUTING.md) to propose a rule or contribute a
  change.
- Use the issue forms to report a bug or propose a rule.
- Report vulnerabilities privately by following [SECURITY.md](SECURITY.md).
- Distributed under the [MIT License](LICENSE).

## Compatibility

- [Agent Skills specification](https://agentskills.io/specification)
- [Codex skills](https://developers.openai.com/codex/skills/)
- [Claude Code skills](https://code.claude.com/docs/en/slash-commands)
- [Cursor skills](https://cursor.com/docs/skills)
- [Devin skills](https://docs.devin.ai/product-guides/skills)
