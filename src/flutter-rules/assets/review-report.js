const controls = {
  search: document.querySelector('[data-filter="search"]'),
  severity: document.querySelector('[data-filter="severity"]'),
  risk: document.querySelector('[data-filter="risk"]'),
  effort: document.querySelector('[data-filter="effort"]'),
  status: document.querySelector('[data-filter="status"]'),
};
const cards = [...document.querySelectorAll('[data-finding]')];
const noResults = document.querySelector('[data-no-filter-results]');

if (cards.length > 0) {
  function applyFilters() {
    const query = controls.search.value.trim().toLocaleLowerCase();
    let visible = 0;
    for (const card of cards) {
      const matches = (!query || card.textContent.toLocaleLowerCase().includes(query))
        && (!controls.severity.value || card.dataset.severity === controls.severity.value)
        && (!controls.risk.value || card.dataset.risk === controls.risk.value)
        && (!controls.effort.value || card.dataset.effort === controls.effort.value)
        && (!controls.status.value || card.dataset.status === controls.status.value);
      card.hidden = !matches;
      if (matches) visible += 1;
    }
    noResults.hidden = visible > 0;
  }

  for (const control of Object.values(controls)) {
    control.addEventListener(control === controls.search ? 'input' : 'change', applyFilters);
  }
}
