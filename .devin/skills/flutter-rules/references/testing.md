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

- Always use `group()`, even when a file contains one test, and name the group
  after the class or behavior under test.
- Name test cases with “should” and describe the expected behavior, for example:

```dart
test('value should start at 0', () {
  expect(value, 0);
});
```

- Use one focused test file per substantial class or feature behavior.
- Use `setUp` for shared construction and `tearDown` for cleanup. Close
  Cubits, Blocs, streams, and controllers created by a test.

## Test Types

- Use unit tests for pure logic, use cases, repositories, and value objects.
- Use widget tests for rendering, interaction, accessibility, and state-driven
  UI behavior.
- Use integration tests for critical flows that cross multiple real layers.
- For Cubit/Bloc transition tests, follow the Bloc-specific rules in
  `references/state.md` and use `bloc_test` when it improves clarity.

## Mocking

- Mock at the repository or service boundary, not the method under test and not
  below the boundary at the HTTP or database implementation.
- A stubbed call should drive real production logic and an observable
  assertion; do not assert only that a mock returns the value configured in the
  test.
- Use `mocktail` when it is the project's chosen mocking library and register
  custom fallback values in `setUpAll` before passing them to `any()`.

## Widget Test Basics

- Pump widgets inside `MaterialApp` or the project's app root so directionality,
  media query, theme, and localization dependencies are available.
- Use `pump()` for a single frame and `pumpAndSettle()` only when animations or
  scheduled frames must complete.
- Prefer stable `Key` finders for localized or dynamic content; use text finders
  when the displayed copy itself is the behavior under test.
