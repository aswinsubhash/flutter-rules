# Effective Dart Rules

Apply these rules when writing or reviewing Dart code. Preserve existing
project conventions when they are more specific.

## Naming

- Use `UpperCamelCase` for classes, enums, extensions, typedefs, and type
  parameters.
- Use `lowercase_with_underscores` for packages, directories, source files, and
  import prefixes.
- Use `lowerCamelCase` for variables, parameters, named parameters, getters,
  and methods.
- Avoid unnecessary abbreviations and keep the most descriptive noun last.
- Name boolean properties positively and use noun phrases for non-boolean
  properties.
- Prefer a getter over a `getX` method when the API conceptually exposes a
  property.
- Use consistent generic type names such as `T`, `E`, `K`, and `V`.

## Types and Functions

- Add return and parameter types to public function declarations.
- Type-annotate fields and top-level variables when their type is not obvious.
- Add generic type arguments when inference is unclear.
- Use `Future<void>` for asynchronous members that do not return a value.
- Use getters for property-like operations and setters for property-like
  mutations.
- Use inclusive start and exclusive end parameters for ranges.
- Use class modifiers (`final`, `base`, `interface`, `sealed`) when they make
  extension and implementation boundaries explicit.

## Style

- Run `dart format` on changed Dart files.
- Use braces for all flow-control statements.
- Prefer `final` when a local value does not change and `const` for compile-time
  constants.
- Prefer `const` constructors when a class supports them.
- Keep files focused on one responsibility and split large files by behavior,
  not by arbitrary line counts.
- Prefer private declarations unless a type or member is part of the intended
  public API.

## Imports and Files

- Use package imports for public cross-feature APIs and precise relative imports
  for nearby files when that matches the project convention.
- Never include `/lib/` in an import path or reach outside the package boundary.
- Do not import another package's `src/` directory.
- Keep import prefixes lowercase and descriptive.
- Consider a library-level doc comment for files that define a public library.

## Usage

- Use collection literals and adjacent strings where they improve clarity.
- Prefer collection `if`, `for`, and spread (`...`) elements for declarative
  lists such as widget children. Use null-aware (`?`) elements only when the
  package SDK lower bound is Dart 3.8 or newer; otherwise use collection `if`.
  Use imperative `add`/`addAll` when the loop has meaningful side effects or
  complex control flow.
- Initialize fields at their declaration when possible.
- Use initializing formals in constructors when possible.
- Use `rethrow` when propagating a caught exception without changing it.
- When an async function only forwards a `Future`, return it directly instead
  of using redundant `async`/`await`. Keep `async` when inspecting the result,
  sequencing work, or handling errors locally.
- Catch known exception types explicitly at the boundary that can handle them;
  avoid broad `catch` blocks except as a final fallback. In this architecture,
  repositories map typed data exceptions into domain failures.
- When the logger supports structured error fields, pass the error and stack
  trace separately instead of interpolating them into the message.
- Override `hashCode` whenever `==` is overridden and preserve equality's
  reflexive, symmetric, and transitive behavior.
- Use `part of` directives only with string library names when a part file is
  genuinely required.

## Documentation

- Format comments as sentences and use `///` for API documentation.
- Start public doc comments with a one-sentence summary in its own paragraph.
- Document why a public API exists, how callers should use it, and relevant
  side effects or failure behavior.
- Use square-bracket links for in-scope Dart identifiers.
- Keep implementation narration out of comments; prefer clear names and small
  functions.

## Widgets

- Extract reusable widgets into focused files and prefer `StatelessWidget` when
  no mutable widget-local state is required.
- Keep `build` methods focused on composition and avoid expensive work inside
  them.
- Keep state local when it is truly local; use the project's Cubit/Bloc rules
  for business or shared state.

## Performance

- Use `const` widgets and constructors where possible.
- Avoid repeated parsing, filtering, or other expensive work in `build`.
- Use pagination for large lists and lazy builders for long collections.
