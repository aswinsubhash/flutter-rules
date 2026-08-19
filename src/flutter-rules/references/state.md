# State Management Rules

## 15) Enum-based State Management
- **Status Enum**: Use a `Status` enum (e.g., `LoginStatus`, `DashboardStatus`) within the BLoC state to track the lifecycle: `initial`, `loading`, `success`, `failure`.
- **Single State Class**: Prefer a single `State` class with a `status` field and optional data/error fields, rather than a bulky abstract class hierarchy.
- **Switch-based Builders**: In the presentation layer, the `BlocBuilder` or `BlocConsumer` should use a `switch (state.status)` statement to handle different states.
- **Helper Methods**: Extract the widget building logic for each state into dedicated private methods (e.g., `_buildLoading`, `_buildError`, `_buildContent`) to keep the `build` method purely orchestration-focused.

## 17) State Management Rule (BLoC Preference)
- **BLoC over setState**: Minimize the use of `setState` for state management.
- Prefer handling all state updates through **BLoC** to ensure a clear separation of concerns, testability, and consistent UI updates.
- `setState` should only be used for local UI-only state that doesn't impact business logic or need to be shared (e.g., local animations, immediate input focus handled internally by a widget).
- Any state related to data fetching, validation logic, or persistent app state must reside in a BLoC.

## 18) Logic Isolation (Private Methods)
- **Isolate Business Logic**: Presentation pages must isolate validation, complex logic, and event dispatching into dedicated private methods (e.g., `_onLogin`, `_onRegister`, `_onSubmitted`).
- **Clean Build Methods**: Avoid writing multi-line logic blocks directly within the `build` method or inside inline callbacks like `onPressed` or `onTap`.
- **No computed values in build**: Derived or calculated values (totals, intervals, max values, etc.) must be extracted to a private method (e.g. `_computeMetrics()`) and never computed inline inside `build`.
- **Chart data objects**: When using fl_chart, each data object (`LineChartData`, `FlGridData`, `FlTitlesData`, `LineChartBarData`, etc.) must be constructed in its own private method. Never build them inline inside `build`.
- **Method Signatures**: Private logic methods should typically accept `BuildContext` and the relevant BLoC `State` as parameters to ensure consistent and reliable access to the latest data and context.
- This practice improves code readability, makes UI components purely orchestration-focused, and facilitates easier debugging of functional logic.

## 19a) Connectivity BLoC Baseline (Project Setup)
- During basic project setup, add `internet_checker_plus` and create `lib/core/bloc/connectivity/` with `ConnectivityBloc`, `ConnectivityEvent`, and `ConnectivityState`.
- Use `InternetCheckerPlus.onStatusChange()` and `InternetCheckerPlus.check()` with a short offline debounce (3 seconds) to avoid flickering offline UI.
- `ConnectivityState` starts as connected (`isConnected = true`) and exposes only the current connection flag until product UI needs more state.
- Provide `ConnectivityBloc` once at the app root above `MaterialApp.router`; do not create it inside pages.
- Export the bloc from `core/core.dart` so app/root widgets can consume it consistently.

## 20) Route-level BLoC Provisioning
- BLoCs/Cubits for a page/flow should be provided at the **route level** whenever that state belongs to the route lifecycle.
- Prefer creating route-scoped BLoCs inside `GoRoute.pageBuilder` / router composition instead of instantiating them inside page widgets.
- Pages should consume already-provided BLoCs and remain focused on presentation orchestration.
- Only use more local provisioning when the state is intentionally scoped to a smaller extracted subtree and not the full route.

## 21) BlocBuilder / BlocConsumer Scope — Never Wrap Scaffold
- **`Scaffold` must be the outermost widget** in every page `build()` method. Never wrap it with `BlocBuilder`, `BlocConsumer`, or `BlocListener`.
- Wrapping `Scaffold` causes `AppBar`, `Drawer`, and `BottomNavigationBar` to rebuild on every state change — even when they are fully static.
- **Correct pattern**: place `BlocBuilder` / `BlocConsumer` inside `body`, scoped to the smallest subtree that actually reacts to state.
- Side-effect listeners (`BlocListener`) belong inside `body` too — use `BlocConsumer` on the body subtree to combine listener + builder in one widget.
- `ScaffoldMessenger.of(context)` resolves from `MaterialApp` above, so snackbars work correctly even when the listener sits inside `body`.

```dart
// WRONG — AppBar rebuilds on every state change
return BlocBuilder<MyBloc, MyState>(
  builder: (context, state) => Scaffold(
    appBar: AppBar(...),
    body: ...,
  ),
);

// CORRECT — Scaffold and AppBar are static; only body rebuilds
return Scaffold(
  appBar: AppBar(...),         // never rebuilds
  body: BlocConsumer<MyBloc, MyState>(
    listener: _onStatusChanged,
    builder: (context, state) => _buildBody(state),
  ),
);
```
