const THEME_KEY = 'flutter-rules-review-theme';
const root = document.documentElement;
const toggle = document.querySelector('[data-theme-toggle]');

function storedTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

function applyTheme(theme, persist) {
  root.dataset.theme = theme;
  toggle?.setAttribute('aria-pressed', String(theme === 'dark'));
  toggle?.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  if (!persist) return;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Theme preference is optional when storage is unavailable.
  }
}

applyTheme(storedTheme() ?? 'light', false);
toggle?.addEventListener('click', () => applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true));

const controls = {
  search: document.querySelector('[data-filter="search"]'),
  severity: document.querySelector('[data-filter="severity"]'),
  risk: document.querySelector('[data-filter="risk"]'),
  effort: document.querySelector('[data-filter="effort"]'),
  status: document.querySelector('[data-filter="status"]'),
};
const cards = [...document.querySelectorAll('[data-finding]')];
const groups = [...document.querySelectorAll('[data-finding-group]')];
const noResults = document.querySelector('[data-no-filter-results]');

if (cards.length > 0 && controls.search) {
  const applyFilters = () => {
    const query = controls.search.value.trim().toLocaleLowerCase();
    let visible = 0;
    for (const card of cards) {
      const matches = (!query || card.dataset.haystack.includes(query))
        && (!controls.severity.value || card.dataset.severity === controls.severity.value)
        && (!controls.risk.value || card.dataset.risk === controls.risk.value)
        && (!controls.effort.value || card.dataset.effort === controls.effort.value)
        && (!controls.status.value || card.dataset.status === controls.status.value);
      card.hidden = !matches;
      if (matches) visible += 1;
    }
    for (const group of groups) {
      group.hidden = ![...group.querySelectorAll('[data-finding]')].some((card) => !card.hidden);
    }
    noResults.hidden = visible > 0;
  };

  for (const [name, control] of Object.entries(controls)) {
    control.addEventListener(name === 'search' ? 'input' : 'change', applyFilters);
  }
}
