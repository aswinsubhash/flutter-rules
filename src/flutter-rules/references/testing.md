# Testing Rules

## Test Value

- Test observable behavior and user-facing outcomes, not implementation details.
- Before keeping a test, ask: “Could this fail if the real code were broken?”
- Avoid tests that only confirm Dart, Flutter, or standard-library behavior, or
  behavior that cannot fail unless the environment itself is broken.
- Use real business logic in unit tests. Mock external boundaries such as APIs,
  databases, and repositories only when isolation is necessary.
- Keep tests deterministic, focused, and easy to maintain.

## Assertions

- Prefer expressive matchers over brittle literal comparisons when they convey
  intent, such as `isEmpty`, `startsWith`, `completion`, and `throwsA`.

## Organization and Naming

Test placement is mandatory. It is part of task completion, not an optional
style preference, and it must not be relaxed to restore coverage quickly.

Before editing, inspect `test/` to detect the existing feature and layer
organization and map every in-scope production file to its test path. A lone
scaffold such as `test/widget_test.dart`, an app-wide root smoke or integration
test, or flat legacy tests do not establish a feature-specific convention.
Existing naming and grouping conventions apply only when they are compatible
with these required paths:

| Production path | Required test path |
| --- | --- |
| `lib/features/<feature>/<layer>/<file>.dart` | `test/features/<feature>/<layer>/<file>_test.dart` |
| `lib/core/<layer>/<file>.dart` | `test/core/<layer>/<file>_test.dart` |

- Never add a new feature-specific or core-specific test directly under `test/`.
- Reserve root-level test files for genuinely app-wide smoke or integration
  behavior.
- When creating, restoring, or modifying coverage in a flat legacy test, move
  that test into the required mirrored feature or core path as part of the task.
- When no compatible test organization exists, create the mirrored `lib/`
  structure under `test/`; do not infer a flat convention from scaffold files.
- A behavior test that spans multiple production files must remain under the
  nearest mirrored feature and layer directory. Give it a behavior-oriented
  filename there instead of placing it at the test root.
- Keep shared fixtures, fakes, and test helpers under `test/support/`. Keep
  end-to-end tests in the directory configured by the project's chosen tooling.
- Before finalizing, inspect every new or modified test path and verify that it
  maps to its production path under `test/`. If an intentional exception is
  necessary, document the reason in the final response.

For a login feature, the required paths include:

```text
test/core/storage/user_session_test.dart
test/features/login/data/repositories/login_repository_impl_test.dart
test/features/login/presentation/bloc/login_bloc_test.dart
test/features/login/presentation/pages/login_page_test.dart
```

### Automated policy validation

Before finalizing any task that creates or modifies Dart tests, run this command
from the Flutter project root, resolving `<skill-root>` to the active Flutter
Rules skill directory:

```bash
node "<skill-root>/scripts/validate-test-policy.mjs" --project .
```

The validator checks staged, unstaged, and untracked Dart tests. Use repeated
`--file <path>` arguments only when validating an explicit file set outside the
normal Git workflow. Fix every violation before completion.

A genuinely app-wide root test that imports feature or core code requires an
auditable exception with a concrete reason:

```dart
// flutter-rules: allow-root-test -- app-wide smoke flow crosses feature boundaries
```

Do not use an exception to preserve a flat feature-test layout. Repeat every
exception and its reason in the final response.

- Follow the project's compatible naming style and use `group()` when it makes
  multiple related cases easier to navigate.
- Name each test after its observable behavior and expected outcome. A “should”
  style is acceptable when it matches the project, for example:

```dart
test('value should start at 0', () {
  expect(value, 0);
});
```

- Use one focused test file per substantial class or feature behavior.
- Use `setUp` for shared construction and `tearDown` for cleanup. The owning
  test must close Cubits, Blocs, streams, and controllers it creates manually.
  A Cubit or Bloc returned by `blocTest`'s `build` is automatically closed;
  do not reuse it across tests or close it again.

## Test Types

- Use unit tests for pure logic, use cases, repositories, and value objects.
- Use widget tests for rendering, interaction, accessibility, and state-driven
  UI behavior.
- Use integration tests for critical flows that cross multiple real layers.
- For new or modified Cubit/Bloc transition tests, follow the mandatory
  `bloc_test` policy and exception rules in `references/state.md`.

## Mocking

- Mock or fake external dependencies at the boundary of the unit under test;
  never mock the behavior being tested.
- When testing a Cubit, Bloc, or use case, mock its repository or service. When
  testing a repository, mock or fake its datasource, HTTP client, database, or
  storage dependency.
- A stubbed dependency should drive real production logic and an observable
  assertion; do not assert only that a mock returns its configured value.
- Use the project's selected mocking library. For Mocktail, register a custom
  fallback value in `setUpAll` only when that type is passed to an argument
  matcher such as `any()`; do not add fallback registration for other tools or
  when no matcher requires it.

## Widget Test Basics

- Pump widgets inside `MaterialApp` or the project's app root so directionality,
  media query, theme, and localization dependencies are available.
- Use `pump()` for a single frame and `pumpAndSettle()` only when animations or
  scheduled frames must complete.
- Prefer stable `Key` finders for localized or dynamic content; use text finders
  when the displayed copy itself is the behavior under test.
- Keep widget-test fixtures minimal. Prefer Flutter primitives unless a custom
  design-system component is the behavior under test.
