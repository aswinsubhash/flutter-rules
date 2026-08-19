# Code Quality Rules

## 7) Mandatory Analysis (Flutter Analyze)
- **Always** run `flutter analyze` after every new implementation or refactor.
- Run:
  `flutter analyze` or `flutter analyze lib/app lib/core lib/features`
- Ensure **zero** analyzer issues before finalizing or notifying the user.

## 8) Sensitive storage verification
- Add or update tests whenever session persistence changes.
- Assert that tokens, credentials, user IDs, and other sensitive identifiers
  are absent from `SharedPreferences`.
- Cover secure-storage hydration, migration, logout cleanup, and failed
  persistence so partial writes cannot create an authenticated session.
- Map local persistence exceptions to the appropriate `CacheFailure` at the
  repository boundary.
- Review diffs for plaintext secrets in logs, URLs, analytics, fixtures, or
  test output before finalizing.

## 10) AI-generated code cleanup policy
- Never leave obvious AI artifacts (verbose boilerplate, duplicated helper layers, unnatural naming).
- Prefer existing project style and patterns over generic generated patterns.
- Before finalizing, simplify any generated code to the minimum clear implementation.
- Remove placeholder/todo-generated blocks unless explicitly requested by product scope.

## 11) Documentation & comments

Document the project in three places only:

| Layer | File / form | Purpose |
|-------|-------------|---------|
| Setup | `README.md` | What the app is, how to run/build (flavors), stack, locales, env/API |
| Architecture | `ARCHITECTURE.md` | Folder structure, layer rules, Result/DI/routing — keep to ~1 page |
| Code contracts | `///` on public APIs | What each public type/method means for callers |

Do not put deep implementation detail in README. Do not put run/build instructions only in code comments.

### Dartdoc (`///`) — public APIs

**Require** `///` on:
- Feature barrels (`login.dart`, etc.) — one purpose line + `library;`
- Domain: entities, repository interfaces, use cases
- Core contracts: `Result`, failures/exceptions, `DioClient`, `UserSession`, DI, router
- BLoCs and pages (class-level purpose)

**Skip** `///` on:
- Private `_` types
- Obvious getters (`email`, `token`)
- JSON field-only models
- Pure layout widgets

**Format:**
```dart
/// One sentence: what it is / does.
///
/// Optional: side effects, return value, failure cases.
/// Use [TypeName] links.
```

**Depth:**
- Core hard APIs → a few lines + pitfalls
- Repos / use cases → purpose + return / failures
- BLoC / page / barrel → one clear sentence
- Prefer prose + `[TypeName]` over heavy `@param` lists

Document **why / contract**, not what each line does.

### Inline (`//`) — inside functions only

**Default: no inline comment.** Add `//` only when a future reader would ask “why?”:

- Non-obvious intent, tradeoff, or constraint
- Business/product rule encoded in code
- Workaround or platform limitation
- Easy-to-break / dangerous behavior

**Do not** narrate self-explanatory code (“get the email”, “call the API”).
**Do not** add decorative `// === Section ===` blocks.
Favor meaningful names and small functions over explanatory comments.
If a comment can be removed without losing understanding, remove it.

### AI-comment cleanup rule
- Strip AI narration comments ("what this line does").
- Never delete a real `///` contract or a `//` that explains a non-obvious why.
- When changing a public API, update its `///` in the same change.
