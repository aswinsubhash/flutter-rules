# Contributing to Flutter Rules

Thank you for helping improve Flutter Rules. Contributions can clarify an
existing rule, add a well-scoped rule, improve host compatibility, or fix the
installation and packaging tools.

## Before you start

- Search the existing issues and pull requests before opening a new one.
- Open a rule proposal for changes that affect the guidance or its scope.
- Keep rules practical, testable, and independent of proprietary projects.
- Preserve explicit invocation for Codex, Claude Code, Cursor, and Devin.

## Development workflow

1. Fork and clone the repository.
2. Create a focused branch.
3. Edit the canonical skill in `src/flutter-rules`.
4. Synchronize the host-specific packages:

   ```bash
   ./scripts/sync-plugin-skills.sh
   ```

5. Validate the repository:

   ```bash
   ./scripts/validate.sh
   ```

6. Commit both the canonical and generated changes.

Do not edit files under `plugins/flutter-rules/skills`,
`claude-plugins/flutter-rules/skills`, or `.devin/skills` directly. They are
generated from the canonical source.

## Pull requests

Keep each pull request focused on one concern. Explain the problem, the reason
for the proposed rule or tooling change, and how you verified it. Update the
README when installation, invocation, or supported-host behavior changes.

## Release

Do not push release work directly to `main`. Create a versioned branch such as
`release/v1.1.0`, commit the versioned changes there, create the matching tag
`v1.1.0`, and push that branch and tag. Open a pull request from the versioned
branch into `main`. After the pull request is merged, publish the GitHub
release for the existing tag; the publish workflow verifies that the tag
matches `package.json`, runs the tests and repository validation, and publishes
with npm provenance.

Before publishing, create a granular npm access token with package write access
and 2FA bypass enabled, then save it as the repository's `NPM_TOKEN` Actions
secret.

By contributing, you agree that your contribution will be distributed under
the repository's license.
