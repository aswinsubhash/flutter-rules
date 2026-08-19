# Dart 3 Language Rules

Use these features when they make control flow and data modeling clearer. Do
not introduce advanced syntax only for novelty.

## Branching and Exhaustiveness

- Use `if` and `if-case` when matching one condition or one pattern.
- Use `switch` statements or expressions when handling multiple alternatives.
- Use switch expressions with `_` for the default case.
- Prefer exhaustive switches over enums and sealed types; add a default only
  when an intentional fallback is required.
- Use `when` guards when a pattern match also needs a condition.
- Do not add `break` to a non-fall-through switch case.

```dart
final label = switch (status) {
  LoginStatus.initial => 'Ready',
  LoginStatus.loading => 'Loading',
  LoginStatus.success => 'Complete',
  LoginStatus.failure => 'Failed',
};
```

## Patterns

- Use patterns for readable destructuring, not to hide business logic.
- Use wildcard patterns (`_`) for values that are intentionally ignored.
- Use list, map, record, and object patterns when the matched shape is stable
  and the resulting code is clearer than manual indexing.
- Use logical-or patterns to share behavior for equivalent cases.
- Keep variables introduced by a pattern scoped to the smallest useful branch.

## Pattern Safety

- Logical-or branches must bind the same variable names; logical-and branches
  must not bind the same name twice.
- Use null-check patterns (`?`) to refine nullable values. Use null-assert
  patterns (`!`) only when the non-null invariant is proven, because a failed
  match throws.
- Map patterns require their requested keys; a missing key throws a
  `StateError`.
- Use patterns in loops and collection literals only when they make the data
  flow clearer than ordinary iteration.

```dart
if (response case {'data': final data, 'error': null}) {
  return data;
}
```

## Records

- Use records for small, immutable, strongly typed groups of values and
  multiple return values.
- Destructure records at the call site when it improves readability.
- Use a typedef for a repeated record shape.
- Named record field names are part of the record type; keep record shapes
  stable when they cross an API boundary.
- Use a class instead when the value needs behavior, validation, identity, or
  long-term API stability.

```dart
({String name, int age}) userSummary(User user) =>
    (name: user.name, age: user.age);

final (:name, :age) = userSummary(user);
```

## Sealed and Class Modifiers

- Use `sealed` for closed state or result hierarchies that must be exhaustively
  handled.
- Use `final` for classes that should not be extended and `interface` or `base`
  when the extension contract needs to be explicit.
- Keep class modifiers aligned with the public API and package boundaries.
