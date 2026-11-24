# API / Request Model Rules

## Dio Client Baseline
- When adding core networking, create the baseline from this repository's needs; do not copy endpoint lists, session fields, or storage behavior from another project unless the user explicitly asks for those details.
- Use the project's existing endpoints file. When none exists, create `lib/core/network/api_endpoints.dart` only when the current task needs its first real endpoint member; do not add an empty `ApiEndpoints` placeholder.
- Use the project's existing session contract. When none exists, create `lib/core/storage/user_session.dart` only when the current task needs its first real session contract or member; do not add an empty `UserSession` placeholder.
- Reuse the project's existing environment configuration. Add one only when
  the current task needs it and the project has none; the following immutable
  pattern is a suitable baseline. Select the environment once in the app or
  flavor entrypoint and pass it through DI; never keep it in mutable global
  state. Use `--dart-define` only when it matches the project's chosen
  configuration strategy.

```dart
enum AppEnvironment {
  staging('https://staging-api.example.com/'),
  production('https://api.example.com/');

  const AppEnvironment(this.baseUrl);

  final String baseUrl;
}
```

- `DioClient` should use direct package imports, the project's configured base
  URL, JSON headers, repository exception types, and this baseline client
  shape:
  - constructor accepts optional `Dio? dio` and `String? baseUrl`
  - exposes `Dio get dio`
  - uses the project's connect/receive/send timeouts, defaulting to 60 seconds when none are defined
  - adds full request and response logging, including headers and bodies, only
    inside `if (kDebugMode)`, with non-production credentials and data, and to a
    local console only; never forwards these logs to monitoring, and disables
    HTTP logging in profile and release modes
  - supports `get`, `post`, `put`, `patch`, and `delete`
  - supports `CancelToken` and progress callbacks where Dio supports them
  - extracts a response body `message` only when the feature's existing API and
    product contract define it as user-facing; the field's presence alone does
    not make its contents safe. Ownership and display follow
    `references/localization.md`
  - uses existing status or reason codes, not user-facing message text, for
    programmatic decisions
  - maps `connectionError` to `NetworkException`; inspect the underlying cause
    before classifying `unknown` because it is not necessarily a network error
  - preserves cancellation, timeout, certificate, transform, and bad-response
    semantics through the project's appropriate typed exceptions instead of
    collapsing every Dio error into `ServerException`
- Do not add auth headers, token interceptors, `shared_preferences`, or `get_it` unless current task needs them.
- Do not copy monitoring hooks (for example `AppMonitoring`) unless the project already has that module.
- Add only required dependencies, usually `dio` for the baseline client.

## Request Payloads (POST/PUT/PATCH Only)
- Preserve the project's existing request-payload modeling and naming conventions.
- Use a dedicated request model in `data/models/<operation>_request_model.dart` when a payload is reused, validated, non-trivial, or the project's established convention requires one.
- A dedicated request model must provide `toJson()` for serialization.
- When the project maps domain use-case parameters into request models, follow its existing mapping convention; add a `fromParams()` factory only when that contract is useful for the operation.
- A simple one-off payload may use an inline map when the project's convention allows it.
- GET requests do not use request models when they have no request body.
- Datasources serialize dedicated request models with `requestModel.toJson()`; inline maps remain limited to the simple one-off case above.
