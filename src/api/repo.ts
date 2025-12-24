export async function getProducts() {
  const r = await fetch(`${import.meta.env.BASE_URL}fixtures/products.json`);
  if (!r.ok) throw new Error("products.json fehlt");
  return r.json();
}

export async function getTree() {
  const r = await fetch(`${import.meta.env.BASE_URL}fixtures/tree.json`);
  if (!r.ok) throw new Error("tree.json fehlt");
  return r.json();
}

export async function getScores() {
  const r = await fetch(`${import.meta.env.BASE_URL}fixtures/scores.json`);
  if (!r.ok) throw new Error("scores.json fehlt");
  return r.json();
}
