# Localization and Package Boundary Rules

Use these rules when app-level localization is shared with reusable feature or
UI packages.

## App-owned localization

- Do not introduce user-facing hardcoded strings directly in UI widgets.
- Apps supporting more than one language should use Flutter gen-l10n with
  `flutter_localizations`, `intl`, `l10n.yaml`, and `.arb` files. Add every
  user-facing string to every supported language and access it through
  `context.l10n`.
- Apps supporting one language do not need ARB setup. Keep user-facing text in
  `lib/core/utils/app_strings.dart` and access it through `AppStrings`.
- Keep generated app localizations in the host app. App-specific feature
  folders may use `context.l10n`, but reusable packages must not import the
  host app's generated localization class.
- Core and data exceptions or failures must not own localized UI copy.
  Presentation maps typed failures or reason codes to localized messages.
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
