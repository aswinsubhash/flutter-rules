# Navigation Rules

## Tab navigation and scroll position
- Preserve each tab's navigation and scroll state by default when using
  `StatefulShellRoute` or another persistent-tab pattern.
- Reset scroll only when product behavior requires it, commonly when the active
  tab is reselected rather than whenever it becomes active.
- When implementing reset behavior, use the page's existing `ScrollController`,
  check that it has clients, and defer the jump until layout is complete.

## Navigation APIs
- Follow the project's existing routing approach. When it uses go_router, prefer
  `context.go`, `context.push`, and `context.pop` for application routes.
- Use `Navigator` when working with local dialogs, bottom sheets, overlays,
  nested navigators, or another specific navigator that is not an app route.
- Keep routes requiring deep links or restoration in router configuration;
  transient local overlays do not need route definitions.
