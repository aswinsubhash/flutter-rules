# Common Flutter Errors

Use the Flutter Inspector and review parent constraints before changing layout
code. Fix the constraint or lifecycle cause rather than hiding the symptom.

## Layout and Constraints

- **RenderFlex overflowed**: inspect the `Row` or `Column` for unconstrained
  children. Use `Flexible`, `Expanded`, wrapping, or deliberate constraints.
- **Vertical viewport was given unbounded height**: a scrollable is inside a
  `Column` without a bounded height. Use `Expanded`, `Flexible`, or a fixed
  constraint where the layout requires it.
- **InputDecorator cannot have an unbounded width**: constrain a `TextField`
  with `Expanded`, `SizedBox`, or a parent that provides width.
- **RenderBox was not laid out**: find the first unconstrained or incorrectly
  nested render object, commonly a `ListView` or `Column` without a bounded
  parent.
- **ScrollController attached to multiple scroll views**: give each scrollable
  its own controller, or ensure one controller is attached to only one view.

## Lifecycle and State

- **setState called during build**: do not call `setState`, show a dialog, or
  dispatch a state change directly during `build`. Respond to an event or use
  `addPostFrameCallback` only when the action must happen after layout.
- Keep dialogs, navigation, and other side effects out of pure builder methods;
  use the appropriate listener or user interaction callback.

## Debugging Workflow

- Reproduce the smallest failing widget tree.
- Inspect constraints and parent sizes with Flutter Inspector.
- Check the first relevant stack-frame location before changing downstream
  widgets.
- Verify the fix on the smallest affected screen and with the project's
  analyzer and widget tests.
