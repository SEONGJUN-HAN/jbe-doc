import { readFileSync } from "node:fs";
import { validateHwpx } from "kordoc";
for (const f of process.argv.slice(2)) {
  const r = await validateHwpx(readFileSync(f));
  console.log(f.split(/[\/]/).pop(), JSON.stringify(r).slice(0, 600));
}
