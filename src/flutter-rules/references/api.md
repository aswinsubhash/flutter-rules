# API / Request Model Rules

## 1) Dio Client Baseline
- When adding core networking, create the baseline from this repository's needs; do not copy endpoint lists, session fields, or storage behavior from another project unless the user explicitly asks for those details.
- `lib/core/network/api_endpoints.dart` may start as an empty `abstract final class ApiEndpoints {}`. Add endpoint constants only when implementing the feature that uses them.
- `lib/core/storage/user_session.dart` may start as an empty `class UserSession {}`. Add persistence fields/dependencies only when auth/session storage is requested.
- Reuse the project's existing environment configuration. When a project needs
  an enum-based configuration, the following neutral pattern is a suitable
  baseline. Use `--dart-define` only when it matches the project's chosen
  configuration strategy.

```dart
enum AppEnvironment { staging, production }

abstract final class Env {
  static AppEnvironment currentEnvironment = AppEnvironment.staging;

  static String get baseUrl {
    switch (currentEnvironment) {
      case AppEnvironment.staging:
        return 'https://staging-api.example.com/';
      case AppEnvironment.production:
        return 'https://api.example.com/';
    }
  }
}
```

- Do not add environment helpers unless the current feature needs them.
- `DioClient` should use direct package imports, `Env.baseUrl`, JSON headers,
  repository exception types, and this baseline client shape:
  - constructor accepts optional `Dio? dio` and `String? baseUrl`
  - exposes `Dio get dio`
  - uses 60-second connect/receive/send timeouts
  - adds full request and response logging, including headers and bodies, only
    inside `if (kDebugMode)`, with non-production credentials and data, and to a
    local console only; never forwards these logs to monitoring, and disables
    HTTP logging in profile and release modes
  - supports `get`, `post`, `put`, `patch`, and `delete`
  - supports `CancelToken` and progress callbacks where Dio supports them
  - extracts a safe response body `message` when present for server failures
  - maps `connectionError` to `NetworkException`; inspect the underlying cause
    before classifying `unknown` because it is not necessarily a network error
  - preserves cancellation, timeout, certificate, transform, and bad-response
    semantics through the project's appropriate typed exceptions instead of
    collapsing every Dio error into `ServerException`
- Do not add auth headers, token interceptors, `shared_preferences`, or `get_it` unless current task needs them.
- Do not copy monitoring hooks (for example `AppMonitoring`) unless the project already has that module.
- Add only required dependencies, usually `dio` for the baseline client.

## 8) Request Models (POST/PUT/PATCH Only)
- POST/PUT/PATCH operations must use dedicated request models in `data/models/<operation>_request_model.dart`
- Each request model must have `toJson()` method for serialization
- If corresponding domain usecase exists (e.g. `UpdateProfileData`), request model must have `fromParams()` factory
- GET requests do NOT use request models (no request body)
- Datasources use `requestModel.toJson()` instead of inline data maps
