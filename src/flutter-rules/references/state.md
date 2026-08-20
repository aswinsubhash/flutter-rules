# State Management Rules

## 14) Cubit vs BLoC Selection
- Prefer `Cubit` for simple state transitions that do not need explicit events.
- Use `Bloc` for complex flows, event traceability, or event transformers such
  as debounce and throttle.
- Both are preferred over `setState` for business, validation, fetched, or
  persistent state. Keep `setState` for local UI-only state.

## 15) State Modeling
- Prefer one immutable `<Feature>State` with a status enum when states share
  data or previous data should remain available after a failure.
- Use a sealed state hierarchy when states are mutually exclusive, carry
  different subtype-specific data, or benefit from exhaustive pattern matching.
  Use one modeling style consistently within a feature.
- Name state snapshots as nouns: `LoginState`, `LoginInitial`,
  `LoginInProgress`, `LoginSuccess`, and `LoginFailure`.
- For the enum approach, use lifecycle values such as `initial`, `loading`,
  `success`, and `failure` and render with `switch (state.status)`.
- For sealed states, handle every subtype with an exhaustive `switch (state)`.
- Mark state classes `@immutable` and use the project's existing value-equality
  approach. When the project uses `Equatable`, include every relevant field in
  `props`.
- Always emit a new state instance. Copy `List` and `Map` values before
  changing them; never mutate collections held by an emitted state.
- Extract each status or state branch into a focused private builder so page
  `build` methods remain orchestration-focused.

## 16) Events and Transitions
- Name `Bloc` events in the past tense: `LoginSubmitted`,
  `ProfileRefreshRequested`, and `AuthenticationStarted` for the initial load.
- Use `<Feature>Event` as the base event name and keep event-handler methods
  private (`_onLoginSubmitted`).
- Trigger `Bloc` transitions with `bloc.add(Event())`, not custom public methods
  that emit state. Public `Cubit` commands may be verbs and should return
  `void` or `Future<void>`.
- Use event transformers such as debounce or throttle only when the workflow
  needs them. Keep repository-driven or internal events private.
- Call `emit` only inside the `Cubit` or `Bloc`; keep business logic out of
  widgets.
- When overriding storage in a `HydratedCubit`, pass it as the named `storage:`
  argument to the superclass.

## 17) State Management Rule (BLoC Preference)
- Prefer handling state updates through `Cubit` or `Bloc` for separation,
  testability, and consistent UI updates.
- Any state related to data fetching, validation logic, or persistent app state
  must reside in a `Cubit` or `Bloc`.

## 18) Logic Isolation (Private Methods)
- Presentation pages may isolate input collection and event dispatch in dedicated
  private methods (for example, `_onLogin` or `_onSubmitted`). Business
  validation and decisions must remain in the Cubit, Bloc, or domain layer.
- **Clean Build Methods**: Avoid writing multi-line logic blocks directly within the `build` method or inside inline callbacks like `onPressed` or `onTap`.
- **No computed values in build**: Derived or calculated values (totals, intervals, max values, etc.) must be extracted to a private method (e.g., `_computeMetrics()`) and never computed inline inside `build`.
- **Chart data objects**: When using fl_chart, each data object (`LineChartData`, `FlGridData`, `FlTitlesData`, `LineChartBarData`, etc.) must be constructed in its own private method. Never build them inline inside `build`.
- **Method Signatures**: Private logic methods should typically accept `BuildContext` and the relevant BLoC `State` as parameters to ensure consistent and reliable access to the latest data and context.
- This practice improves code readability, makes UI components purely orchestration-focused, and facilitates easier debugging of functional logic.

## 19) Architecture Boundaries
- Follow the feature structure `data/`, `di/`, `domain/`,
  `presentation/bloc/`, `presentation/pages/`, `presentation/widgets/`, and a
  public `<feature>.dart` barrel.
- `presentation/bloc` depends on domain use cases and repository contracts;
  inject those dependencies through the Cubit or Bloc constructor.
- `domain` owns entities, repository interfaces, and use cases. It must not
  import `data` or `presentation`.
- `data` implements domain contracts and handles API, database, and storage
  access. `di` wires data implementations, domain use cases, and presentation
  state managers together.
- Follow the repository `Result` contract: consume `Result.fold(...)` in the
  Cubit or Bloc and map typed data exceptions to failures at the repository
  boundary, not in presentation state management.
- Do not communicate directly from one Bloc/Cubit to another. Use a scoped UI
  listener to bridge side effects or inject a shared repository when state is
  genuinely shared.

## 19a) Connectivity BLoC Baseline (Project Setup)
- Add connectivity monitoring only when the task requires it. Reuse the
  project's existing checker, state manager, and folder conventions.
- If adopting `internet_checker_plus` is explicitly in scope, use its status
  stream and current-status check rather than adding a parallel abstraction.
- `ConnectivityState` starts as connected (`isConnected = true`) and exposes only the current connection flag until product UI needs more state.
- Provide `ConnectivityBloc` once at the app root above `MaterialApp.router`; do not create it inside pages.
- Export the bloc from `core/core.dart` so app/root widgets can consume it consistently.

## 20) Route-level BLoC Provisioning
- BLoCs/Cubits for a page/flow should be provided at the **route level** whenever that state belongs to the route lifecycle.
- Prefer creating route-scoped BLoCs inside `GoRoute.pageBuilder` / router composition instead of instantiating them inside page widgets.
- Pages should consume already-provided BLoCs and remain focused on presentation orchestration.
- Only use more local provisioning when the state is intentionally scoped to a smaller extracted subtree and not the full route.

## 21) Flutter Bloc Widgets and Scaffold Scope

### Providers

- Use `BlocProvider` or `MultiBlocProvider` for Cubit/Bloc lifetimes and
  `RepositoryProvider` for repository dependencies.
- Use `MultiBlocListener` and `MultiRepositoryProvider` to keep multiple
  listeners or repository providers readable without deep nesting.
- Resolve a provided Bloc or repository from a descendant `BuildContext`, not
  the same context that created the provider.

### Rendering and side effects

- Use `BlocBuilder` or `BlocSelector` for rendering and `BlocListener` for
  side effects such as navigation, dialogs, and snackbars.
- Use `BlocConsumer` only when both rendering and side effects are needed in
  the same scoped subtree.
- Use `context.read<T>()` in callbacks. Use `context.select<T, R>()` only for a
  small, stable slice of state; prefer scoped builders over broad `watch` or
  `select` calls at the root of `build`.
- Handle every possible state, including initial, loading, empty, success, and
  failure states, in the presentation layer.

### Rebuild scope

- Avoid rebuilding an entire screen when only one field changes. Use
  `BlocSelector` for the smallest widget that depends on that field. Use
  `BlocBuilder` when the whole subtree genuinely depends on the state.

```dart
// Avoid this when only the title changes.
BlocBuilder<MyCubit, MyState>(
  builder: (context, state) => EntireScreen(state: state),
);

// Scope the rebuild to the value that actually changes.
BlocSelector<MyCubit, MyState, String>(
  selector: (state) => state.title,
  builder: (context, title) => Text(title),
);
```

### Scaffold placement

- **`Scaffold` must be the outermost widget** in every page `build()` method.
  Never wrap it with `BlocBuilder`, `BlocConsumer`, or `BlocListener`.
- Place reactive builders and listeners inside `Scaffold.body`, scoped to the
  smallest subtree that actually changes. This keeps static app bars, drawers,
  and bottom navigation bars from rebuilding.

```dart
return Scaffold(
  appBar: AppBar(...),
  body: BlocConsumer<MyBloc, MyState>(
    listener: _onStatusChanged,
    builder: (context, state) => _buildBody(state),
  ),
);
```

## 22) Bloc Diagnostics
- Override `onChange`, `onError`, or `onTransition` only when the additional
  diagnostics are useful for the current feature.
- Configure a global `BlocObserver` once at the app root when global state or
  error observation is required. Bloc diagnostics must not log tokens,
  credentials, or sensitive state fields; the debug-only HTTP logging exception
  in `references/api.md` does not apply to state diagnostics.

## 23) Testing Cubits and Blocs
- Use the project's existing state-test and mocking tools. Use `bloc_test` for
  state-emission assertions when it is already available or adding it is within
  task scope.
- Group tests by the class under test, name cases with `should`, and cover the
  initial state plus success, loading, and failure transitions.
- Close every Cubit or Bloc in `tearDown` and register fallback values for
  custom mocktail types when required.
- Keep tests focused on observable state transitions and side-effect decisions;
  do not test private handler implementation details.

## 24) Common State-Management Pitfalls
- Do not emit the same state instance twice; meaningful state changes require a
  new instance and complete value-equality fields.
- Do not mutate state lists or maps in place.
- Do not call `context.watch` from callbacks; use `context.read` there.
- Do not put repository calls, validation, or business decisions in widgets.
