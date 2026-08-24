# Localization and Package Boundary Rules

Use these rules when app-level localization is shared with reusable feature or
UI packages.

## App-owned localization

- Do not introduce app-owned user-facing hardcoded strings directly in UI
  widgets.
- Apps supporting more than one language should use Flutter gen-l10n with
  `flutter_localizations`, `intl`, `l10n.yaml`, and `.arb` files. Add every
  app-owned user-facing string to every supported language and access it through
  `context.l10n`.
- Apps supporting one language do not need ARB setup. Keep app-owned user-facing
  text in `lib/core/utils/app_strings.dart` and access it through `AppStrings`.
- Keep generated app localizations in the host app. App-specific feature
  folders may use `context.l10n`, but reusable packages must not import the
  host app's generated localization class.
- Core and data exceptions or failures must not own localized UI copy.
  Presentation localizes app-owned errors, including frontend validation and
  app-defined messages derived from typed failures or reason codes.
- Preserve safe, intentional server-provided user messages as provided when the
  feature's existing API and product contract define them as user-facing. Do not
  add backend-owned messages to ARB files or `AppStrings`, or replace them with
  frontend-localized copy.
- Use a localized app-owned fallback only when a server message is absent or
  unsafe to display.
- Do not display diagnostic internals such as stack traces, exception details,
  or raw technical payloads.
- Technical protocol literals such as API paths, MIME types, regex patterns,
  and route paths are not user-facing copy and may remain constants.

## Reusable package boundaries

- Keep reusable package APIs portable: state in, callbacks out, and labels or
  strings in.
- Pass a typed strings object (for example, `SettingsPageStrings`) from the
  host app instead of having the package read `context.l10n`.
- The host app owns app-specific localization, routing, dependency-injection
  integration, services, and business behavior. A reusable package owns its
  layout and interactions and may own portable internal state and behavior, but
  it must not depend on host-generated localization or app-specific services.
- A package may ship its own ARB bundle only when it is a genuinely reusable,
  published package with stable copy that should be translated independently
  of its host app.

## Language controls

- Do not show a visible language picker when only one locale is supported.
- Persist the selected locale in the settings Cubit or view model and wire it
  to `MaterialApp.locale`.
- Expose the picker only when `supportedLocales.length > 1`, and add the
  second ARB file before exposing it.
- Provide a label for every supported locale when rendering a locale selector.
