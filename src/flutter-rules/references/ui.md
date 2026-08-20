# UI & Widget Rules

## Page composition
- Keep presentation pages orchestration-focused. Extract reusable, complex, or
  behaviorally distinct sections when doing so improves readability, reuse, or
  lifecycle ownership.
- Follow the project's existing widget locations and naming conventions. Small
  page-specific widgets and private data classes may remain with their sole
  owner; move them to focused files when they grow or become reusable.
- Do not split files or move untouched code solely to satisfy a line count.
- Prefer stateless extracted widgets with explicit inputs and callbacks.
- Prefer a purpose-specific widget such as `Padding`, `SizedBox`, `ColoredBox`,
  `DecoratedBox`, or `Center` when only one behavior is needed, while following
  the project's responsive-spacing convention. Use `Container` when its
  combined properties make the composition clearer.
- Prefix widgets that return slivers with `Sliver` so their required render
  protocol is clear at the call site.
- Avoid monolithic pages that mix state ownership, rendering, and repeated UI
  blocks.

## RTL Compatibility Mandatory
- All UI must be built to be RTL-compatible by default.
- Use directional properties exclusively: `EdgeInsetsDirectional` instead of `EdgeInsets`, `AlignmentDirectional` instead of `Alignment`, and `PositionedDirectional` inside Stacks.
- Avoid hardcoded `left` or `right` values for padding, margins, or positioning.
- Ensure icons that convey direction (e.g., arrows) mirror correctly using Flutter's built-in directionality support.

## Loading indicators
- Reuse the project's existing loading components and conventions. If the
  project provides a shared loader, use it consistently for equivalent
  full-page, section, and pagination states.
- Preserve loading behavior encapsulated by existing button components.
- Do not introduce a new custom loader abstraction solely to replace Flutter's
  built-in indicators.

## Color Constants Policy
- **No hardcoded colors in UI**: All `Color(0xFF...)` values must be extracted to `lib/core/presentation/theme/app_colors.dart`.
- Define meaningful semantic names (for example, `primaryAction`, `warning`, or
  `success`) instead of generic names like `red1` or `green2`.
- Avoid accidental duplicate color literals. Distinct semantic tokens may share
  the same value without aliasing one meaning to another; when the design system
  separates palette and semantic tokens, map both meanings to a neutral palette
  token.
- Reference colors via `AppColors.<name>` exclusively in presentation layer widgets.
- Exceptions: `Colors.white`, `Colors.black`, `Colors.transparent`, and `Colors.grey` with index accessor are acceptable for simple cases.
- Shared semantic colors used across features should follow the project's core
  theme or design-token convention.

## Image Asset Constants Policy
- **No hardcoded image asset paths in UI**: All `assets/images/...` string values must be extracted to `lib/core/utils/app_assets.dart`.
- Define meaningful semantic names (for example, `logo`, `emptyState`, or
  `avatarPlaceholder`) instead of file-name-only names when possible.
- Reference images via `AppAssets.<name>` in presentation widgets.
- Feature-only image paths may live in a feature-level asset constants file if they are not reused across the app.

## ScreenUtil & Responsive Sizing Policy
- Apply these rules only when the project already uses `flutter_screenutil` or
  its adoption is explicitly in scope. Otherwise preserve the project's current
  responsive-sizing approach.
- Configure `ScreenUtilInit` from the app's design specifications and existing
  conventions. A possible configuration is:

```dart
ScreenUtilInit(
  designSize: const Size(375, 812),
  minTextAdapt: true,
  splitScreenMode: true,
  rebuildFactor: (old, data) => RebuildFactors.size(old, data),
  fontSizeResolver: (fontSize, instance) =>
      FontSizeResolvers.height(fontSize, instance),
  child: const MyApp(),
)
```

- Use `.w` for widths.
- Use `.r` for horizontal padding/margins.
- Use `.h` for heights and vertical padding/margins.
- Use `.r` for border radius and circular dimensions.
- Use `.sp` for all explicit `fontSize` values.
- When the project uses ScreenUtil spacing extensions, prefer `.verticalSpace`
  and `.horizontalSpace` for responsive gaps. Use `SizedBox` when an exact,
  constant, or project-standard gap is clearer.
- Default page horizontal padding is `16.r` unless a specific design requires otherwise.

## App Header Policy
- Use a fixed `AppBar` for persistent screen branding when the title/logo must remain visible during scroll.
- Do not place persistent logo/title headers inside the scroll body.
- App bar horizontal title spacing should match page horizontal padding (`16.r` by default).

## Text Field Focus Policy
- Pages with text fields should support tap-outside-to-unfocus so the keyboard dismisses naturally.

## Method Ordering in Widget Classes
- **Mandatory order** for all `StatelessWidget` and `StatefulWidget` classes:
  1. Event dispatchers (`_onToggle`, `_onSave`, etc.)
  2. BLoC listener handlers (`_onStatusChanged`, etc.)
  3. Async actions that open sheets/dialogs (`_openEditor`, etc.)
  4. Private builder helpers for sub-widgets (`_buildActionSheet`, `_buildDetailsSection`, etc.)
  5. Main body builder (`_buildBody`)
  6. `@override build` — always last
- For `StatefulWidget`: lifecycle overrides (`initState`, `dispose`) come before event dispatchers; `build` is still always last.
- Never place `build` before private helper methods.
