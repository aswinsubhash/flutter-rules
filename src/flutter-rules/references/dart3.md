# Dart 3 Language Rules

Use these features when they make control flow and data modeling clearer. Do
not introduce advanced syntax only for novelty.

## Branching and Exhaustiveness

- Prefer exhaustive switches over enums and sealed types so a new case fails
  compilation; add a default (`_`) only when an intentional fallback is
  required.
- Use `if-case` for a single pattern and `switch` for multiple alternatives.

## Patterns

- Use patterns for readable destructuring, not to hide business logic.
- Use list, map, record, and object patterns when the matched shape is stable
  and the resulting code is clearer than manual indexing.
- Use null-assert patterns (`!`) only when the non-null invariant is proven,
  because a failed match throws.
- A map pattern whose requested key is missing fails to match in `if-case` and
  `switch`. In a declaration or assignment (`final {'id': id} = json;`) it
  throws a `StateError`, so use the refutable forms for untrusted data.

```dart
if (response case {'data': final data, 'error': null}) {
  return data;
}
```

## Records

- Use records for small, immutable groups of values and multiple return
  values; use a typedef for a repeated record shape.
- Named record field names are part of the record type; keep record shapes
  stable when they cross an API boundary.
- Use a class instead when the value needs behavior, validation, identity, or
  long-term API stability.

## Sealed and Class Modifiers

- Use `sealed` for closed state or result hierarchies that must be exhaustively
  handled.
- Use `final` for classes that should not be extended and `interface` or `base`
  when the extension contract needs to be explicit. Keep class modifiers
  aligned with the public API and package boundaries.
