// 복잡샘플.md 를 세 프리셋으로 만들고 전 쪽을 PNG로
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { renderDocument } from "kordoc";
import { generate, listPresets } from "../src/engine.mjs";
const md = readFileSync("test/복잡샘플.md", "utf8");
for (const p of listPresets()) {
  const { buffer, warnings, tocPages } = await generate(md, p.id, { dept: "미래교육과", date: "2027. 1." }); console.log(p.id, tocPages.map((x) => `${x.title.slice(0,8)}=${x.page}`).join(" "));
  writeFileSync(`test/sample/${p.id}.hwpx`, buffer);
  const r = await renderDocument(buffer, { format: "png", maxWidthPx: 800 });
  mkdirSync(`test/sample/${p.id}`, { recursive: true });
  r.assets.forEach((a) => writeFileSync(`test/sample/${p.id}/p${String(a.page).padStart(2, "0")}.png`, a.data));
  console.log(p.id, r.assets.length + "쪽", warnings.join(" / "));
}
