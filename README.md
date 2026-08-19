# Flutter Rules

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

Invoke it with `$flutter-rules`.

### Claude Code

Add the marketplace and install the plugin for the current user:

```bash
claude plugin marketplace add aswinsubhash/flutter-rules
claude plugin install flutter-rules@flutter-rules --scope user
```

Invoke it with `/flutter-rules:flutter-rules`.

### Cursor

Clone the repository and run the Cursor installer:

```bash
git clone https://github.com/aswinsubhash/flutter-rules.git
cd flutter-rules
./scripts/install.sh cursor
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

## Compatibility

- [Agent Skills specification](https://agentskills.io/specification)
- [Codex skills](https://developers.openai.com/codex/skills/)
- [Claude Code skills](https://code.claude.com/docs/en/slash-commands)
- [Claude Code plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
- [Cursor skills](https://cursor.com/docs/skills)
- [Devin skills](https://docs.devin.ai/product-guides/skills)
