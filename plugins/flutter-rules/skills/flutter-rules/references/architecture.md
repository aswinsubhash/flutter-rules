# Architecture Rules

## 1) Dependency direction
- Allowed direction: `presentation -> domain -> data` (implementation wiring via DI).
- **Domain must not import Data or Presentation.**
- Data can depend on Domain contracts/entities.

## 2) Feature boundaries
- Keep feature internals inside `lib/features/<feature>/...`.
- Expose feature entry points through `lib/features/<feature>/<feature>.dart`.
- App-level modules (router/DI/app) should import feature barrel files, not deep paths.

## 3) Result-based error flow
- Repository contracts return `Future<Result<T>>` (or `Result<void>`), not thrown app-flow exceptions.
- Data sources throw typed exceptions only (`ServerException`, `NetworkException`, etc).
- Repository implementations map exceptions into `Result.failure(Failure)`.
- Use cases forward typed result contracts.
- BLoCs/Cubits consume `Result.fold(...)` for success/failure handling.

### 3a) File locations (mandatory)
- `lib/core/error/result.dart` — `Result<T>` class.
- `lib/core/error/failures.dart` — all `Failure` subclasses.
- `lib/core/error/exceptions.dart` — all `Exception` subclasses.

### 3b) `Result<T>` shape (mandatory)
Single class with private constructor and named factories. **Do NOT** use `sealed class` + `Success<T>`/`FailureResult<T>` subclasses.

```dart
class Result<T> {
  final T? data;
  final Failure? failure;

  const Result._({this.data, this.failure});

  const Result.success(T value) : this._(data: value);
  const Result.failure(Failure value) : this._(failure: value);

  bool get isSuccess => data != null;
  bool get isFailure => failure != null;

  R fold<R>(
    R Function(Failure failure) onFailure,
    R Function(T data) onSuccess,
  ) {
    if (failure != null) return onFailure(failure!);
    return onSuccess(data as T);
  }
}
```

### 3c) `Failure` shape (mandatory)
- Abstract base extends `Equatable` with `final String message` and `props => [message]`.
- All concrete failures extend `Failure` and forward `super.message` via `super` parameter.
- Canonical failures (extend list as needed, do not rename):
  - `ServerFailure`, `CacheFailure`, `NetworkFailure`, `SessionExpiredFailure`, `VehicleNotFoundFailure`.

### 3d) `Exception` shape (mandatory)
- Each exception `implements Exception`, exposes `final String message` when applicable.
- `NetworkException` defaults message to `AppStrings.noInternetConnection`.
- Canonical exceptions (extend list as needed, do not rename):
  - `ServerException`, `CacheException`, `NetworkException`, `VehicleNotFoundException`, `SessionInvalidatedException`.

### 3e) Exception → Failure mapping convention
Repository implementations catch typed exceptions and map 1:1:

| Exception | Failure |
|-----------|---------|
| `ServerException` | `ServerFailure(e.message)` |
| `CacheException` | `CacheFailure(...)` |
| `NetworkException` | `NetworkFailure(e.message)` |
| `SessionInvalidatedException` | `SessionExpiredFailure(e.message)` |
| `VehicleNotFoundException` | `VehicleNotFoundFailure()` |

Unknown exceptions map to `ServerFailure(e.toString())` as last resort.

## 4) DI composition
- Each feature owns a `di/<feature>_injection.dart` initializer.
- `core/di/injection.dart` is composition root and calls feature initializers.

## 5) Local persistence and secret handling
- Use `SharedPreferences` for non-sensitive preferences such as locale, theme,
  onboarding state, and approved non-secret display data.
- Use secure storage for authentication and sensitive identifiers, including
  access/refresh tokens, user IDs, credentials, and encryption keys.
- Never copy secure values into `SharedPreferences`, logs, URLs, analytics, or
  crash breadcrumbs.
- Keep storage access behind a session/storage abstraction and hydrate it
  through DI before feature code reads session state.
- Treat storage migrations and logout as security boundaries: invalidate
  authenticated state before cleanup and expose a session only after secure
  values have been successfully validated.

## 6) Import hygiene
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

## 7) Barrel policy
- Feature barrel files (`lib/features/<feature>/<feature>.dart`) MUST export all public feature components:
    - **Pages**: Main entry pages for the feature.
    - **Widgets**: Any extracted components in `presentation/widgets`.
    - **BLoCs/Cubits**: State management classes and their Events/States.
    - **Domain**: Entities, Repositories (interfaces), and Use Cases.
    - **DI**: Feature-specific injection initializers.
- App-level modules (Router, DI setup) should import these barrel files exclusively for a clean, flat import structure.
- Do not use barrel exports to bypass layer boundaries internally.

## 9) Definition of Done (architecture)
- No layer-direction violations.
- Repository/usecase signatures use `Result` consistently.
- Router/DI imports use feature public entry points.
- Feature DI initializer exists for implemented features.
- All POST/PUT/PATCH operations use dedicated request models.
