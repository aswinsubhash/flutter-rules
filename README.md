# Flutter Rules

[![Validate skill packages](https://github.com/aswinsubhash/flutter-rules/actions/workflows/validate.yml/badge.svg)](https://github.com/aswinsubhash/flutter-rules/actions/workflows/validate.yml)
[![Latest tag](https://img.shields.io/github/v/tag/aswinsubhash/flutter-rules?sort=semver)](https://github.com/aswinsubhash/flutter-rules/tags)
[![Agent Skills](https://img.shields.io/badge/Agent%20Skills-compatible-4c6ef5)](https://agentskills.io/specification)

Reusable engineering guidance for building maintainable, production-ready
Flutter applications with AI coding agents.

Flutter Rules gives Codex, Claude Code, Cursor, and Devin a shared set of
principles for clean architecture, state management, UI, networking,
navigation, testing, security, and Git workflows. The skill is invoked
explicitly, so it applies only when requested.

## What it covers

- Clean architecture and feature boundaries
- BLoC and state-management conventions
- Flutter UI, accessibility, and responsive design
- API clients, models, repositories, and error handling
- Navigation and routing
- Testing, analysis, documentation, and code quality
- Secure storage and SharedPreferences usage
- Git branches, commits, and pull-request hygiene

## Global installation

Install Flutter Rules for Codex, Claude Code, and Cursor with one command:

```bash
git clone https://github.com/aswinsubhash/flutter-rules.git
cd flutter-rules
./scripts/install.sh all
```

**🪄 Prompt**

```text
Install Flutter Rules for Codex, Claude Code, and Cursor at user scope from https://github.com/aswinsubhash/flutter-rules. Clone the repository into a temporary directory, run ./scripts/install.sh all, verify the installation for all three tools, and report the result for each tool. Preserve any existing installation using the installer's backup behavior. Do not install Devin because it requires a project path. Ask before installing any missing CLI or dependency, and remove only the temporary clone after a successful installation.
```

This installs the skill at user scope, making it available across projects in
each supported local tool. Devin uses repository or organization-level skill
discovery and is configured separately below.

## Installation

Use these options when installing for only one tool.

### Codex

Add the repository as a Codex plugin marketplace and install the plugin:

```bash
codex plugin marketplace add aswinsubhash/flutter-rules --ref main
codex plugin add flutter-rules@flutter-rules
```

**🪄 Prompt**

```text
Install Flutter Rules for Codex from https://github.com/aswinsubhash/flutter-rules. Add aswinsubhash/flutter-rules as the flutter-rules Codex plugin marketplace from the main branch, then install flutter-rules@flutter-rules. If the marketplace already exists, upgrade it instead of failing. Verify that the plugin and $flutter-rules skill are available, report the result, and do not modify Claude Code, Cursor, or Devin.
```

Invoke it with `$flutter-rules`.

### Claude Code

Add the marketplace and install the plugin for the current user:

```bash
claude plugin marketplace add aswinsubhash/flutter-rules
claude plugin install flutter-rules@flutter-rules --scope user
```

**🪄 Prompt**

```text
Install Flutter Rules for Claude Code from https://github.com/aswinsubhash/flutter-rules. Add the repository as a Claude plugin marketplace, install flutter-rules@flutter-rules at user scope, and handle an existing marketplace or plugin by updating it safely. Verify that /flutter-rules:flutter-rules is available, report the result, and do not modify Codex, Cursor, or Devin.
```

Invoke it with `/flutter-rules:flutter-rules`.

### Cursor

Clone the repository and run the Cursor installer:

```bash
git clone https://github.com/aswinsubhash/flutter-rules.git
cd flutter-rules
./scripts/install.sh cursor
```

**🪄 Prompt**

```text
Install Flutter Rules for Cursor at user scope from https://github.com/aswinsubhash/flutter-rules. Clone the repository into a temporary directory, run ./scripts/install.sh cursor, and verify that ~/.cursor/skills/flutter-rules/SKILL.md exists. Preserve any existing installation using the installer's backup behavior, report the result, and remove only the temporary clone after a successful installation. Do not modify Codex, Claude Code, or Devin.
```

Invoke it with `/flutter-rules`.

### Devin

Connect this repository to Devin for organization-wide discovery, or install
the skill into a single project:

```bash
git clone https://github.com/aswinsubhash/flutter-rules.git
cd flutter-rules
./scripts/install.sh devin /absolute/path/to/project
```

**🪄 Prompt**

```text
Install Flutter Rules for Devin in the current project from https://github.com/aswinsubhash/flutter-rules. Record the current project's absolute path, clone the repository into a temporary directory, and from that clone run ./scripts/install.sh devin with the project path. Verify that the project contains .devin/skills/flutter-rules/SKILL.md, preserve any existing installation using the installer's backup behavior, report the result, and remove only the temporary clone after success. Do not modify Codex, Claude Code, or Cursor.
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

For Codex, refresh the marketplace and reinstall the plugin:

```bash
codex plugin marketplace upgrade flutter-rules
codex plugin add flutter-rules@flutter-rules
```

For Claude Code, update the marketplace and plugin through Claude's plugin
manager. For Cursor or project-local Devin installations, pull the latest
repository changes and rerun the corresponding installer.

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
