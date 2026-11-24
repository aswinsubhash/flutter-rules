# Flutter Layout-Error Debugging

Use the Flutter Inspector and review parent constraints before changing layout
code. Fix the constraint or lifecycle cause rather than hiding the symptom.

## Debugging Workflow

- Reproduce the smallest failing widget tree.
- Inspect constraints and parent sizes with Flutter Inspector.
- Check the first relevant stack-frame location before changing downstream
  widgets.
- Verify the fix on the smallest affected screen and with the project's
  analyzer and widget tests.
