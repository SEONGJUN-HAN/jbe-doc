// 프리셋마다 시험 문서를 만들고, 렌더하고, 깨짐을 점검한다.
// kordoc 버전을 올린 뒤 꼭 돌린다: npm run check  → test/out/ 에 hwpx·png
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderDocument, parse } from "kordoc";
import { generate, listPresets } from "../src/engine.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "out");
mkdirSync(outDir, { recursive: true });
const md = readFileSync(join(here, "시험문서.md"), "utf8");
let fail = 0;
for (const p of listPresets()) {
  const { buffer, warnings } = await generate(md, p.id, { dept: "○○과", date: "2026. 1." });
  const f = join(outDir, `${p.id}.hwpx`);
  writeFileSync(f, buffer);
  const parsed = await parse(buffer);
  const text = parsed.success ? parsed.markdown : "";
  const problems = [];
  if (!parsed.success) problems.push("다시 읽기 실패: " + parsed.error);
  if (text.includes("⟦jbe")) problems.push("바뀌지 않은 표지(⟦jbe) 남음");
  for (const must of ["추진 개요", "세부 추진 계획", "기대 효과", "추진 근거"]) if (!text.includes(must)) problems.push(`'${must}' 없음`);
  const r = await renderDocument(buffer, { format: "png", maxWidthPx: 700 });
  r.assets.forEach((a) => writeFileSync(join(outDir, `${p.id}_p${a.page}.png`), a.data));
  console.log(`${problems.length ? "✗" : "✓"} ${p.id}  ${r.assets.length}쪽  ${problems.join(" / ")}${warnings.length ? "  (kordoc 경고: " + warnings.join(" / ") + ")" : ""}`);
  if (problems.length) fail++;
}
process.exit(fail ? 1 : 0);
