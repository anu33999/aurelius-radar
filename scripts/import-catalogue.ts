/**
 * Usage: npm run catalogue:import -- path/to/catalogue.(json|csv|html)
 * Replaces the Service table with the parsed catalogue (e.g. your real 206 services).
 */
import fs from "node:fs";
import path from "node:path";
import { parseCatalogue } from "../lib/services/catalogue-import";
import { replaceCatalogue } from "../lib/db/repo";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: npm run catalogue:import -- <file.json|file.csv|file.html>");
    process.exit(1);
  }
  const text = fs.readFileSync(file, "utf8");
  const services = parseCatalogue(text, path.basename(file));
  if (services.length === 0) {
    console.error("No services could be parsed from that file. Try exporting it as JSON or CSV.");
    process.exit(1);
  }
  const n = await replaceCatalogue(services);
  const areas = new Set(services.map((s) => s.practiceArea));
  console.log(`Imported ${n} services across ${areas.size} practice areas.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
