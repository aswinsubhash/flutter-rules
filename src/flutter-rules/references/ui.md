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
- When a value means start or end, use directional APIs such as
  `EdgeInsetsDirectional`, `AlignmentDirectional`, and `PositionedDirectional`.
  Do not encode start/end semantics with hardcoded `left` or `right` values.
- Symmetric values, direction-neutral alignment, and intentionally physical
  coordinates may use non-directional APIs when that preserves their meaning.
- Ensure icons that convey direction (e.g., arrows) mirror correctly using
  Flutter's built-in directionality support or an equivalent project convention.

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
- When ScreenUtil is already used, follow the project's existing design-system
  configuration for `designSize`, scaling behavior, unit extensions, and
  spacing tokens. Do not introduce a different reference size or scaling policy
  as a universal default.
- Use `.w`, `.h`, `.r`, `.sp`, and ScreenUtil spacing extensions according to
  the project's established conventions rather than assigning universal units
  to widths, heights, padding, margins, radii, gaps, or font sizes.
- Use the design system's page padding and app-bar title-spacing tokens or
  established values; do not introduce a fixed ScreenUtil value as the default.

## App Header Policy
- Use a fixed `AppBar` for persistent screen branding when the title/logo must remain visible during scroll.
- Do not place persistent logo/title headers inside the scroll body.
- App bar horizontal title spacing should match the page horizontal padding
  defined by the project's design system or existing convention.

## Text Field Focus Policy
- Pages with text fields should support tap-outside-to-unfocus so the keyboard dismisses naturally.

## Method Ordering in Widget Classes
- Follow the project's existing member-ordering convention for `StatelessWidget`
  and `StatefulWidget` classes.
- For new code when no convention exists, an optional grouping is lifecycle
  overrides, event dispatchers and listener handlers, async UI actions, private
  builder helpers, the main body helper, and `build`.
- The suggested grouping does not require `build` to be last. Do not reorder
  existing methods solely to match it; make ordering changes only when they are
  part of a substantive refactor or improve clarity.
