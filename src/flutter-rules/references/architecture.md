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
- Where the project establishes a public feature entry point, keep it at `lib/features/<feature>/<feature>.dart`.

Default layout when the project has no established structure. Create only the
directories the current task needs:

```text
lib/
  app/
    router/
      app_router.dart
  core/
    config/
    di/
    error/
    network/
    presentation/
    services/
    storage/
    usecase/
    utils/
  features/
    <feature>/
      <feature>.dart        # public barrel, when the project uses one
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

### Native plugin outcomes
- When a native plugin can fail during a normal user action, the owning service
  must inspect both its return values and documented `PlatformException` codes.
  Map known, recoverable codes to typed outcomes in the existing error flow,
  and keep cancellation distinct from other failures.
- Preserve platform-specific behavior when interpreting those outcomes. Rethrow
  unknown exceptions with their original stack trace rather than converting
  them to a known failure or a generic fallback.

### File locations
Use the project's existing locations. When none exist, default to:
- `lib/core/error/result.dart` — `Result<T>` class.
- `lib/core/error/failures.dart` — shared `Failure` subclasses.
- `lib/core/error/exceptions.dart` — shared `Exception` subclasses.

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

Map feature-specific exceptions inside their owning repository. Message
display and backend message ownership follow `references/localization.md`.

## DI composition
- Follow the project's existing DI structure. When none exists, each feature
  owns a `di/<feature>_injection.dart` initializer, and
  `lib/core/di/injection.dart` is the composition root that calls the feature
  initializers.

## Local persistence and secret handling
- Use `SharedPreferences` for non-sensitive preferences such as locale, theme,
  onboarding state, and approved non-secret display data.
- Use secure storage for authentication and sensitive identifiers, including
  access/refresh tokens, user IDs, credentials, and encryption keys.
- Never copy secure values into `SharedPreferences`, URLs, analytics, or crash
  breadcrumbs. HTTP logging rules are in `references/api.md`.
- Keep storage access behind a session/storage abstraction and hydrate it
  through DI before feature code reads session state.
- Treat storage migrations and logout as security boundaries: invalidate
  authenticated state before cleanup and expose a session only after secure
  values have been successfully validated.

## Import hygiene
- Preserve the project's existing import policy and canonical import style.
- Inside a feature or core implementation, prefer narrow, explicit imports over broad barrels such as `core/core.dart` or `core/packages.dart`.
- Prefer one canonical import style per file; remove unused and duplicate imports.
- **App and external feature boundaries**: use public feature barrels when the project has established them; otherwise follow the project's public import convention. Never deep-import another feature's internals.
- **Cross-feature imports**: avoid them where possible. When necessary, depend on the target feature's intentional public API using its established boundary import.

## Barrel policy
- When feature barrel files (`lib/features/<feature>/<feature>.dart`) are established, export only intentional public APIs:
    - **Pages**: Main entry pages consumed by routing.
    - **Widgets**: Components explicitly reused outside the feature.
    - **BLoCs/Cubits**: Public state managers and their Events/States.
    - **Domain**: Entities, repository contracts, and use cases needed by
      other app-level modules.
    - **DI**: Feature-specific injection initializers.
- Never use barrel imports or exports to bypass layer boundaries.

## Routing boundary
- The project's router (default `AppRouter` in
  `lib/app/router/app_router.dart`) owns route definitions and authenticated
  shell composition; use a `StatefulShellRoute` when the app has persistent tab
  navigation.
- Route-scoped BLoC/Cubit provisioning follows `references/state.md`; go_router
  behavior and tab details follow `references/navigation.md`.

## Definition of Done (architecture)
- No layer-direction violations.
- Repository/usecase signatures use `Result` consistently.
- Router/DI imports follow the project's public feature-boundary policy without deep-importing feature internals.
- Implemented features are registered through the project's DI structure.
- Request payloads follow `references/api.md`.
