# Architecture Rules

## Dependency direction
- Use the dependency graph `presentation -> domain <- data`; both outer layers
  depend on Domain contracts, while DI wires implementations at the boundary.
- **Domain must not import Data or Presentation.**
- Presentation orchestrates pages, widgets, and state; it dispatches actions and
  renders states without owning data-source details.
- Domain contains pure entities, repository contracts, and use cases. It must
  not depend on Flutter, APIs, databases, or storage implementations.
- Data contains datasources, models, and repository implementations. Datasources
  handle external systems; repositories translate their results into Domain
  contracts.

## Feature boundaries
- Keep feature internals inside `lib/features/<feature>/...`.
- Expose feature entry points through `lib/features/<feature>/<feature>.dart`.
- App-level modules (router/DI/app) should import feature barrel files, not deep paths.

Canonical feature shape:

```text
lib/features/<feature>/
  <feature>.dart
  data/
    datasources/
    models/
    repositories/
  domain/
    entities/
    repositories/
    usecases/
  presentation/
    bloc/
    pages/
    widgets/
  di/
    <feature>_injection.dart
```

## Result-based error flow

```text
datasource  -> throws typed exception
repository  -> catches and maps to Failure -> returns Result.failure(...)
use case    -> applies business rules -> returns Result<T>
bloc/cubit  -> folds Result -> emits presentation state
```

- Repository contracts return `Future<Result<T>>`, not thrown app-flow exceptions.
  For commands without response data, follow the project's established no-value
  success convention.
- Data sources throw typed exceptions only (`ServerException`, `NetworkException`, etc).
- Repository implementations map exceptions into `Result.failure(Failure)`.
- Use cases orchestrate business rules and repository calls, then return typed
  `Result` contracts to presentation.
- BLoCs/Cubits consume `Result.fold(...)` for success/failure handling.

### File locations (mandatory)
- `lib/core/error/result.dart` — `Result<T>` class.
- `lib/core/error/failures.dart` — all `Failure` subclasses.
- `lib/core/error/exceptions.dart` — all `Exception` subclasses.

### `Result<T>` representation
- Preserve the project's existing `Result` representation when it provides
  explicit success and failure variants.
- When introducing `Result<T>`, use either a sealed success/failure hierarchy or
  another representation with an explicit variant discriminator.
- Never infer success or failure from payload nullability. The representation
  must support nullable success values and the project's no-value success
  convention without unsafe casts.
- Expose exhaustive handling through `fold`, pattern matching, or an equivalent
  project-standard API.

### `Failure` representation
- Preserve the project's existing failure base type and value-equality approach.
  When it uses `Equatable`, include every identity-relevant field in `props`.
- Keep only broadly shared failures in core, such as server, cache, network, and
  session failures. Define feature-specific failures inside the owning feature.

### `Exception` representation
- Use typed exceptions at data boundaries and preserve the project's existing
  exception contracts.
- Exceptions may carry safe technical details or stable reason codes, but must
  not import `AppStrings`, generated localization classes, or other UI copy.
- Keep broadly shared server, cache, network, and session exceptions in core;
  define feature-specific exceptions inside the owning feature.

### Exception → Failure mapping convention
Repository implementations catch typed exceptions and map 1:1:

| Exception | Failure |
|-----------|---------|
| `ServerException` | `ServerFailure(e.message)` |
| `CacheException` | `CacheFailure(...)` |
| `NetworkException` | `NetworkFailure(e.message)` |
| `SessionInvalidatedException` | `SessionExpiredFailure(e.message)` |

Map feature-specific exceptions inside their owning repository. Presentation
maps failure types or reason codes to localized user-facing copy; never display
raw exception text.

## DI composition
- Each feature owns a `di/<feature>_injection.dart` initializer.
- `core/di/injection.dart` is composition root and calls feature initializers.

## Local persistence and secret handling
- Use `SharedPreferences` for non-sensitive preferences such as locale, theme,
  onboarding state, and approved non-secret display data.
- Use secure storage for authentication and sensitive identifiers, including
  access/refresh tokens, user IDs, credentials, and encryption keys.
- Never copy secure values into `SharedPreferences`, URLs, analytics, or crash
  breadcrumbs. Debug-only HTTP logs may include headers and bodies only with
  non-production credentials and data, must remain local, and must be disabled
  in profile and release modes.
- Keep storage access behind a session/storage abstraction and hydrate it
  through DI before feature code reads session state.
- Treat storage migrations and logout as security boundaries: invalidate
  authenticated state before cleanup and expose a session only after secure
  values have been successfully validated.

## Import hygiene
- Inside a feature layer, prefer precise relative imports over broad cross-layer barrels.
- Avoid importing another feature's internals directly.
- Avoid `core.dart` when a narrow import is sufficient in domain/data layers.

### Import extraction policy (mandatory)
- **Feature Presentation layer**: use `core/core.dart` for shared UI/packages/utils and feature-local relative imports.
- **Core Presentation layer**: use `core/packages.dart` + local relative imports.
- **Domain/Data layers**: use narrow, explicit imports only (no broad `core.dart`).
- **App layer (router/di/app)**: import ONLY through feature public barrels (`features/<feature>/<feature>.dart`), never deep internal feature paths.
- **Cross-feature imports**: Avoid where possible; if necessary, import via the target feature's barrel file.
- Prefer one canonical import style per file; remove unused and duplicate imports.

## Barrel policy
- Feature barrel files (`lib/features/<feature>/<feature>.dart`) export only
  intentional public APIs:
    - **Pages**: Main entry pages consumed by routing.
    - **Widgets**: Components explicitly reused outside the feature.
    - **BLoCs/Cubits**: Public state managers and their Events/States.
    - **Domain**: Entities, repository contracts, and use cases needed by
      other app-level modules.
    - **DI**: Feature-specific injection initializers.
- App-level modules (Router, DI setup) should import these barrel files exclusively for a clean, flat import structure.
- Do not use barrel exports to bypass layer boundaries internally.

## Routing boundary
- `AppRouter` owns route definitions and authenticated shell composition; use a
  `StatefulShellRoute` when the app has persistent tab navigation.
- Provision route-scoped BLoCs/Cubits during route composition. Pages consume
  the provided state managers and do not instantiate route-owned BLoCs.
- Keep go_router behavior and tab-specific details in `references/navigation.md`
  and route-level Bloc/widget details in `references/state.md`.

## Definition of Done (architecture)
- No layer-direction violations.
- Repository/usecase signatures use `Result` consistently.
- Router/DI imports use feature public entry points.
- Feature DI initializer exists for implemented features.
- All POST/PUT/PATCH operations use dedicated request models.
