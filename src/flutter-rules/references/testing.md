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

- Follow the project's existing test organization and naming style. Use
  `group()` when it makes multiple related cases easier to navigate.
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
- Follow the project's existing test organization. When none exists, mirror
  the `lib/` feature and layer structure under `test/` so production code and
  its tests are easy to locate.
- Keep shared fixtures, fakes, and test helpers under `test/support/`. Keep
  end-to-end tests in the directory configured by the project's chosen tooling.
- Organize by feature behavior instead of strict source-file mirroring when a
  test intentionally spans multiple classes or files.

## Test Types

- Use unit tests for pure logic, use cases, repositories, and value objects.
- Use widget tests for rendering, interaction, accessibility, and state-driven
  UI behavior.
- Use integration tests for critical flows that cross multiple real layers.
- For Cubit/Bloc transition tests, follow the Bloc-specific rules in
  `references/state.md` and use `bloc_test` when it improves clarity.

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
