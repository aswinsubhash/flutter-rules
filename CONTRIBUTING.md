# Contributing to Flutter Rules

Thank you for helping improve Flutter Rules. Contributions can clarify an
existing rule, add a well-scoped rule, improve host compatibility, or fix the
installer and migration tooling.

## Before you start

- Search existing issues and pull requests.
- Open a rule proposal for changes that affect guidance or scope.
- Keep rules practical, testable, and independent of proprietary projects.
- Preserve explicit invocation for every supported agent.

## Development workflow

1. Fork and clone the repository.
2. Create a focused branch.
3. Edit the canonical skill only under `src/flutter-rules`.
4. Run the verification suite:

   ```bash
   npm test
   npm run validate
   npm run pack:check
   ```

5. Commit the canonical source, tests, and user-facing documentation together.

The installer uses the exact `skills@1.5.15` dependency to retain Node 20
compatibility. Integration tests set `FLUTTER_RULES_SKILL_SOURCE` to a local or
branch source so they never depend on an unreleased production tag.

## Pull requests

Keep each pull request focused on one concern. Explain the problem, why the
change is needed, and how it was verified. Update the README when installation,
invocation, or supported-host behavior changes.

## Release

Do not push release work directly to `main`. Create a versioned branch such as
`release/v2.0.0`, commit and push the versioned changes, and open a pull request
into `main`. After merge, create the matching tag on the merged commit and
publish its GitHub release.

The publish workflow verifies that the release tag matches `package.json`, the
canonical skill version, and the Skills CLI tagged-source discovery check before
publishing with npm provenance.

Before publishing, create a granular npm access token with package write access
and 2FA bypass enabled, then save it as the repository's `NPM_TOKEN` Actions
secret.

By contributing, you agree that your contribution will be distributed under
the repository's license.
