# Navigation Rules

## 14) Tab Navigation & Scroll Reset
- For pages within a `StatefulShellRoute` (bottom tab bar), content must reset to the top when the tab becomes active.
- Detect index changes inside `didChangeDependencies` by listening to `StatefulNavigationShell.of(context).currentIndex`. **Do not perform this check inside the `build` method.**
- Use a `ScrollController` with `keepScrollOffset: false` and `jumpTo(0)` inside a `WidgetsBinding.instance.addPostFrameCallback` when the index match is detected.

## 19) Navigation Standard (go_router)
- **Strict go_router Usage**: Always use go_router extension methods (context.push(), context.go(), context.pop(), etc.) for all navigation and dialog/bottom-sheet dismissals.
- **Avoid Navigator API**: Never use the static Navigator.of(context) or Navigator.push/pop methods directly.
- **Consistent Routing**: Ensure all routes and sub-routes are defined within the AppRouter configuration to maintain a centralized and predictable deep-linking structure.
