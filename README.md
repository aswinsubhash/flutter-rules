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
- Git branches, commits, and pull-request hygiene

## Global installation

Install or update Flutter Rules for Codex, Claude Code, Cursor, and Devin Local with one
command:

```bash
npx @aswinsubhash/flutter-rules@latest install all
npx @aswinsubhash/flutter-rules@latest update all
npx @aswinsubhash/flutter-rules@latest doctor all
npx @aswinsubhash/flutter-rules@latest uninstall all
```

Pass `--dry-run` to any command to preview it. The executable also supports
`flutter-rules --help` and `flutter-rules --version` when installed globally
with npm.

**🪄 Prompt**

```text
Install or update Flutter Rules globally for Codex, Claude Code, Cursor, and Devin Local by running `npx @aswinsubhash/flutter-rules@latest install all` or `npx @aswinsubhash/flutter-rules@latest update all`. Verify each tool, preserve any existing Cursor or Devin Local installation using the installer's backup behavior, and report missing CLIs without installing them automatically. Do not modify a project directory.
```

This installs the skill at user scope, making it available across projects in
each supported local tool.

## Installation

Use these options when installing for only one tool.

### Codex

Install through the universal CLI:

```bash
npx @aswinsubhash/flutter-rules@latest install codex
npx @aswinsubhash/flutter-rules@latest update codex
```

**🪄 Prompt**

```text
Install or update Flutter Rules for Codex with `npx @aswinsubhash/flutter-rules@latest install codex` or `npx @aswinsubhash/flutter-rules@latest update codex`. Verify that the `flutter-rules@flutter-rules` plugin and `$flutter-rules` skill are available, report the result, and do not modify Claude Code, Cursor, or Devin.
```

Invoke it with `$flutter-rules`.

### Claude Code

Install through the universal CLI at user scope:

```bash
npx @aswinsubhash/flutter-rules@latest install claude
npx @aswinsubhash/flutter-rules@latest update claude
```

**🪄 Prompt**

```text
Install or update Flutter Rules for Claude Code with `npx @aswinsubhash/flutter-rules@latest install claude` or `npx @aswinsubhash/flutter-rules@latest update claude`. Verify that `/flutter-rules:flutter-rules` is available, report the result, and do not modify Codex, Cursor, or Devin.
```

Invoke it with `/flutter-rules:flutter-rules`.

### Cursor

Install through the universal CLI at user scope:

```bash
npx @aswinsubhash/flutter-rules@latest install cursor
npx @aswinsubhash/flutter-rules@latest update cursor
```

**🪄 Prompt**

```text
Install or update Flutter Rules for Cursor at user scope with `npx @aswinsubhash/flutter-rules@latest install cursor` or `npx @aswinsubhash/flutter-rules@latest update cursor`. Verify that `~/.cursor/skills/flutter-rules/SKILL.md` exists, preserve any existing installation using the installer's backup behavior, and do not modify Codex, Claude Code, or Devin.
```

Invoke it with `/flutter-rules`.

When Cursor and Devin Local are installed together, Cursor may display the
shared `~/.agents/skills/flutter-rules` path instead of the dedicated
`~/.cursor/skills/flutter-rules` path. Cursor discovers both user-level skill
directories. The installer renders both copies with matching explicit-only
invocation metadata, so either discovered path behaves the same. Run
`flutter-rules doctor all` to detect drift and `flutter-rules update all` to
synchronize the copies.

### Devin

Install through the universal CLI at user scope:

```bash
npx @aswinsubhash/flutter-rules@latest install devin
npx @aswinsubhash/flutter-rules@latest update devin
```

**🪄 Prompt**

```text
Install or update Flutter Rules for Devin Local at user scope with `npx @aswinsubhash/flutter-rules@latest install devin` or `npx @aswinsubhash/flutter-rules@latest update devin`. Verify that `~/.agents/skills/flutter-rules/SKILL.md` exists, preserve any existing installation using the installer's backup behavior, and do not modify Codex, Claude Code, Cursor, or any project directory.
```

Invoke it with `@skills:flutter-rules`.

## Usage

Invoke the skill before describing the Flutter task. For example:

```text
$flutter-rules review this authentication feature
$flutter-rules plan a new checkout flow
$flutter-rules check whether this session storage is secure
```

Invocation syntax varies by host as shown above. The guidance remains the same
across supported agents.

## Invocation policy

Flutter Rules is configured for explicit invocation on every supported host.
Installing it does not make the agent apply the rules automatically to every
Flutter request.

| Host | Explicit invocation |
| --- | --- |
| Codex | `$flutter-rules` |
| Claude Code | `/flutter-rules:flutter-rules` |
| Cursor | `/flutter-rules` |
| Devin | `@skills:flutter-rules` |

## Updating

Use the universal CLI to update local tools:

```bash
npx @aswinsubhash/flutter-rules@latest update all
```

If the CLI is unavailable, use the direct marketplace commands:

```bash
# Initial install
codex plugin marketplace add aswinsubhash/flutter-rules --ref main
codex plugin add flutter-rules@flutter-rules
claude plugin marketplace add aswinsubhash/flutter-rules
claude plugin install flutter-rules@flutter-rules --scope user

# Update
codex plugin marketplace upgrade flutter-rules
codex plugin add flutter-rules@flutter-rules
claude plugin marketplace update flutter-rules
claude plugin update flutter-rules@flutter-rules --scope user
```

## Contributing

The canonical skill lives in `src/flutter-rules`. Host-specific packages are
generated from that source and should not be edited directly.

After changing the canonical skill, synchronize and validate the repository:

```bash
./scripts/sync-plugin-skills.sh
./scripts/validate.sh
```

Open a pull request with the canonical and generated changes together.

## Community

- Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a rule or opening a
  pull request.
- Use the issue forms to report a bug or propose a rule.
- Report vulnerabilities privately by following [SECURITY.md](SECURITY.md).
- Distributed under the [MIT License](LICENSE).

## Compatibility

- [Agent Skills specification](https://agentskills.io/specification)
- [Codex skills](https://developers.openai.com/codex/skills/)
- [Claude Code skills](https://code.claude.com/docs/en/slash-commands)
- [Claude Code plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
- [Cursor skills](https://cursor.com/docs/skills)
- [Devin skills](https://docs.devin.ai/product-guides/skills)
