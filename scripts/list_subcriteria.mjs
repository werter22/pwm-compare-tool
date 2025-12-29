import fs from "node:fs";

const tree = JSON.parse(fs.readFileSync("public/fixtures/tree.json", "utf-8"));

for (const d of tree.domains) {
  console.log(`\n=== ${d.name} (${d.id}) ===`);
  for (const c of d.criteria) {
    console.log(`\n- ${c.name}`);
    for (const s of c.subcriteria) {
      console.log(`  ${s.id} | ${s.name}`);
    }
  }
}
