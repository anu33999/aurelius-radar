/**
 * Optional: load the starter service catalogue into the database so it can be edited/replaced.
 * Run: npm run db:seed
 */
import { replaceCatalogue } from "../lib/db/repo";
import { STARTER_CATALOGUE } from "../lib/services/starter-catalogue";

replaceCatalogue(STARTER_CATALOGUE)
  .then((n) => console.log(`Seeded ${n} starter services. Replace them with: npm run catalogue:import -- <file>`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
