# UI & Widget Rules

## 13) Page-size and composition rule
- **Widget Extraction Mandatory**: Reusable or custom UI components should be extracted into separate files within the `widgets` folder under the `presentation` layer to improve code readability and maintainability.
- **Separate Files Required**: Each extracted widget must be placed in its own file (e.g., `shipment_header.dart`, `shipment_dates_row.dart`) rather than as private classes within the parent widget file.
- Keep presentation pages orchestration-focused; extract heavy UI sections into `presentation/widgets`.
- If a page grows beyond a simple screen, split into focused widgets (content, controls, sections).
- Prefer stateless extracted widgets with explicit inputs/callbacks.
- Avoid monolithic page files that mix state, rendering, and repeated UI blocks.
- **Private data/metrics classes** (e.g. `_ChartMetrics`) may co-locate in the same file as the single widget that exclusively owns them. Any secondary widget class must live in its own file.
- **Line count limit**: A page file must not exceed ~150 lines. If it does, extract page-specific sections into their own widget files in `presentation/widgets/` — even if those sections are not reusable across features. Extracting private builder methods into the same file does NOT count as a fix; each section must be its own file.
- **Section naming convention**: Page-specific section widgets are named after the page and their role (e.g., `SettingsAccountSection`, `SettingsVersionFooter`) and live in `presentation/widgets/`.

## 16) RTL Compatibility Mandatory
- All UI must be built to be RTL-compatible by default.
- Use directional properties exclusively: `EdgeInsetsDirectional` instead of `EdgeInsets`, `AlignmentDirectional` instead of `Alignment`, and `PositionedDirectional` inside Stacks.
- Avoid hardcoded `left` or `right` values for padding, margins, or positioning.
- Ensure icons that convey direction (e.g., arrows) mirror correctly using Flutter's built-in directionality support.

## 21) Global Loading Indicator
- **CustomLoader Mandatory**: Use the `CustomLoader` widget for all full-page loading states and list pagination.
- **Button Exception**: `CustomButton` is exempt and should continue to use its internal loading state (spinner inside the button).
- **Consistency**: Do not use `CircularProgressIndicator` directly for page-level or section-level loading.

## 22) Color Constants Policy
- **No hardcoded colors in UI**: All `Color(0xFF...)` values must be extracted to `lib/core/presentation/theme/app_colors.dart`.
- Define meaningful semantic names (e.g., `paid`, `overdue`, `dispatched`) instead of generic names like `red1`, `green2`.
- Do not repeat the same color value in a file. If a new semantic name needs an existing color, alias the existing constant instead of declaring another `Color(0xFF...)` value (for example, `static const warning = paid;`).
- Reference colors via `AppColors.<name>` exclusively in presentation layer widgets.
- Exceptions: `Colors.white`, `Colors.black`, `Colors.transparent`, and `Colors.grey` with index accessor are acceptable for simple cases.
- Status/finance colors used across features must live in core `AppColors`.

## 23) Image Asset Constants Policy
- **No hardcoded image asset paths in UI**: All `assets/images/...` string values must be extracted to `lib/core/utils/app_assets.dart`.
- Define meaningful semantic names (e.g., `logo`, `emptyShipment`, `driverAvatarPlaceholder`) instead of file-name-only names when possible.
- Reference images via `AppAssets.<name>` in presentation widgets.
- Feature-only image paths may live in a feature-level asset constants file if they are not reused across the app.

## 24) ScreenUtil & Responsive Sizing Policy
- Use `flutter_screenutil` for UI sizing after `ScreenUtilInit` is configured.
- Configure `ScreenUtilInit` with the app's design size, split-screen support,
  size-based rebuilds, and height-based font scaling:

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
- Use `.verticalSpace` and `.horizontalSpace` instead of `SizedBox` for spacing-only gaps.
- Default page horizontal padding is `16.r` unless a specific design requires otherwise.

## 25) App Header Policy
- Use a fixed `AppBar` for persistent screen branding when the title/logo must remain visible during scroll.
- Do not place persistent logo/title headers inside the scroll body.
- App bar horizontal title spacing should match page horizontal padding (`16.r` by default).

## 26) Text Field Focus Policy
- Pages with text fields should support tap-outside-to-unfocus so the keyboard dismisses naturally.

## 27) Method Ordering in Widget Classes
- **Mandatory order** for all `StatelessWidget` and `StatefulWidget` classes:
  1. Event dispatchers (`_onToggle`, `_onSave`, etc.)
  2. BLoC listener handlers (`_onStatusChanged`, etc.)
  3. Async actions that open sheets/dialogs (`_openEditor`, etc.)
  4. Private builder helpers for sub-widgets (`_buildWhatsappSheet`, `_buildEmailSheet`, etc.)
  5. Main body builder (`_buildBody`)
  6. `@override build` — always last
- For `StatefulWidget`: lifecycle overrides (`initState`, `dispose`) come before event dispatchers; `build` is still always last.
- Never place `build` before private helper methods.
