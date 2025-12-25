const LS_KEY = "pwm_compare_selected_products_v1";

export function loadCompareSelection(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

export function saveCompareSelection(ids: string[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(ids.slice(0, 3)));
}

export function toggleCompareSelection(productId: string): string[] {
  const current = loadCompareSelection();
  const exists = current.includes(productId);
  const next = exists ? current.filter(x => x !== productId) : [...current, productId].slice(0, 3);
  saveCompareSelection(next);
  return next;
}
