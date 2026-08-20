# State Management Rules

## Cubit vs BLoC Selection
- Prefer `Cubit` for simple state transitions that do not need explicit events.
- Use `Bloc` for complex flows, event traceability, or event transformers such
  as debounce and throttle.
- Both are preferred over `setState` for business, validation, fetched, or
  persistent state. Keep `setState` for local UI-only state.

## State Modeling
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

## Events and Transitions
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

## Logic Isolation (Private Methods)
- Presentation pages may isolate input collection and event dispatch in dedicated
  private methods (for example, `_onLogin` or `_onSubmitted`). Business
  validation and decisions must remain in the Cubit, Bloc, or domain layer.
- Keep `build` and inline callbacks readable. Cheap, obvious derived values may
  remain local to `build`; extract computations when they are complex,
  expensive, reused, or obscure the widget structure.
- When using `fl_chart`, extract chart configuration only when its size or
  complexity harms readability. Group related configuration where useful; do
  not require one private method for every chart data object.
- Helpers should accept the explicit values they need. Pass `BuildContext` only
  when the helper calls an API that requires it, rather than passing context or
  an entire Bloc state by default.
- These practices keep UI code readable without turning straightforward values
  or declarative widget configuration into unnecessary indirection.

## Architecture Boundaries
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

## Connectivity BLoC Baseline (Project Setup)
- Add connectivity monitoring only when the task requires it. Reuse the
  project's existing checker, state manager, and folder conventions.
- If adopting `internet_checker_plus` is explicitly in scope, use its status
  stream and current-status check rather than adding a parallel abstraction.
- Derive the initial connectivity state from a real current-status check, or
  represent it explicitly as unknown until that check completes; do not assume
  the device starts connected.
- Debounce or otherwise transform connectivity events only when product needs
  justify it, using a duration chosen for the expected UX and event behavior.
- Scope the provider to the lifecycle of its consumers. Provide it above
  `MaterialApp.router` only when connectivity is genuinely app-wide; otherwise
  use the appropriate route or subtree scope.
- Follow existing public-export conventions. Do not add a `core/core.dart`
  barrel export unless consumers need it and that API change is in task scope.

## Route-level BLoC Provisioning
- BLoCs/Cubits for a page/flow should be provided at the **route level** whenever that state belongs to the route lifecycle.
- Prefer creating route-scoped BLoCs inside `GoRoute.pageBuilder` / router composition instead of instantiating them inside page widgets.
- Pages should consume already-provided BLoCs and remain focused on presentation orchestration.
- Only use more local provisioning when the state is intentionally scoped to a smaller extracted subtree and not the full route.

## Flutter Bloc Widgets and Scaffold Scope

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

- Scope reactive builders to the smallest subtree that changes. When only body
  content is reactive, keep the `Scaffold` and its static app bar, drawer, or
  navigation outside the builder.
- `Scaffold` does not have to be the outermost page widget. Route- or
  lifecycle-scoped providers and listeners, plus focus, restoration, and other
  non-reactive wrappers, may wrap it when their responsibilities require that
  scope. A reactive builder may also include the `Scaffold` when the scaffold
  itself genuinely depends on that state.

```dart
return Scaffold(
  appBar: AppBar(...),
  body: BlocConsumer<MyBloc, MyState>(
    listener: _onStatusChanged,
    builder: (context, state) => _buildBody(state),
  ),
);
```

## Bloc Diagnostics
- Override `onChange`, `onError`, or `onTransition` only when the additional
  diagnostics are useful for the current feature.
- Configure a global `BlocObserver` once at the app root when global state or
  error observation is required. Bloc diagnostics must not log tokens,
  credentials, or sensitive state fields; the debug-only HTTP logging exception
  in `references/api.md` does not apply to state diagnostics.

## Testing Cubits and Blocs
- Use the project's existing state-test and mocking tools. Use `bloc_test` for
  state-emission assertions when it is already available or adding it is within
  task scope.
- Follow the project's test organization and naming style. Cover the initial
  state and relevant success, loading, and failure transitions.
- The owning test must close Cubit or Bloc instances it creates manually,
  typically in `tearDown`. `blocTest` automatically closes the instance returned
  by its `build`; do not reuse that instance across tests or close it again.
- Register fallback values only when required by the project's selected mocking
  tool (for example, a custom type passed to a Mocktail argument matcher).
- Keep tests focused on observable state transitions and side-effect decisions;
  do not test private handler implementation details.

## Common State-Management Pitfalls
- Do not emit the same state instance twice; meaningful state changes require a
  new instance and complete value-equality fields.
- Do not mutate state lists or maps in place.
- Do not call `context.watch` from callbacks; use `context.read` there.
- Do not put repository calls, validation, or business decisions in widgets.
