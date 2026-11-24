# Dart Rules

Follow Effective Dart and the project's analyzer lints; the rules below are
where this skill is more specific. Preserve existing project conventions when
they are more specific still.

## Style

- Run `dart format` on changed Dart files.
- Keep files focused on one responsibility and split large files by behavior,
  not by arbitrary line counts.
- Prefer private declarations unless a type or member is part of the intended
  public API.

## Imports

- Use package imports for public cross-feature APIs and precise relative imports
  for nearby files when that matches the project convention.
- Do not import another package's `src/` directory.

## Usage

- Prefer collection `if`, `for`, and spread (`...`) elements for declarative
  lists such as widget children. Use null-aware (`?`) elements only when the
  package SDK lower bound is Dart 3.8 or newer; otherwise use collection `if`.
  Use imperative `add`/`addAll` when the loop has meaningful side effects or
  complex control flow.

### Constructors

- Use initializing formals when the constructor parameter and field have the
  same intended name and visibility.
- Keep injected dependencies private unless they are intentionally part of the
  public API. Do not expose an internal dependency just to satisfy a style
  lint.
- When a public constructor parameter must keep its caller-facing name while
  initializing a private field with a different name, use an explicit
  initializer, for example:

  ```dart
  Service(ApiClient client) : _client = client;
  ```

- Preserve the public API and encapsulation before satisfying a style lint. Do
  not add a forwarding constructor solely to make an initializing formal fit.

### Async and errors

- When an async function only forwards a `Future`, return it directly instead
  of using redundant `async`/`await`. Keep `async` when inspecting the result,
  sequencing work, or handling errors locally.
- Catch known exception types explicitly at the boundary that can handle them;
  avoid broad `catch` blocks except as a final fallback. In this architecture,
  repositories map typed data exceptions into domain failures.
- When the logger supports structured error fields, pass the error and stack
  trace separately instead of interpolating them into the message.
