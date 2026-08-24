# Navigation Rules

## Tab navigation and scroll position
- Preserve each tab's navigation and scroll state by default when using
  `StatefulShellRoute` or another persistent-tab pattern.
- Reset scroll only when product behavior requires it, commonly when the active
  tab is reselected rather than whenever it becomes active.
- When implementing reset behavior, use the page's existing `ScrollController`,
  check that it has clients, and defer the jump until layout is complete.

## Navigation APIs
- Follow the project's existing routing approach. When it uses go_router, use
  its established `context.go`, `context.push`, and `context.pop` APIs for
  application routes; this does not make `context.go` preferable to
  `context.pop` in every situation.
- Choose the API by navigation intent:
  - `context.push` adds a route and preserves the current route.
  - `context.pop` returns to the previous route and preserves reverse
    transitions.
  - `context.go` replaces the current location and is appropriate for redirects,
    deep-link normalization, or auth-state changes.
- Do not replace a valid stack-based `context.pop` with `context.go` merely
  because the destination route is technically addressable.
- A route registered in go_router is technically addressable but is not
  automatically a product-supported deep-link entry point.
- Use `Navigator` when working with local dialogs, bottom sheets, overlays,
  nested navigators, or another specific navigator that is not an app route.
- Keep routes requiring deep links or restoration in router configuration;
  transient local overlays do not need route definitions.
