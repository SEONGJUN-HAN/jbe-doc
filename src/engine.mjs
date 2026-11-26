// jbe-doc 엔진(Node 전용 부분): 프리셋 파일 읽기, 목차 쪽 번호 추정(kordoc 조판). 생성 자체는 core.mjs.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderDocumentToScene } from "kordoc";
import { Hwpx } from "./hwpx.mjs";
import { generateCore } from "./core.mjs";

const PRESET_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "presets");
const readAll = () => readdirSync(PRESET_DIR).filter((f) => f.endsWith(".json")).sort()
  .map((f) => JSON.parse(readFileSync(join(PRESET_DIR, f), "utf8")));

export function listPresets() {
  return readAll().map((p) => ({ id: p.id, label: p.label, description: p.description, source: p.source, markdown: p.markdown }));
}

export function loadPreset(id) {
  const p = readAll().find((x) => x.id === id);
  if (!p) throw new Error(`프리셋 '${id}' 없음. 있는 것: ${listPresets().map((x) => x.id).join(", ")}`);
  return p;
}

// 목차 쪽 번호: 만든 문서를 kordoc으로 조판해 각 제목이 놓인 쪽을 찾아 자리표지를 숫자로 바꾼다.
// 쪽 번호는 본문 첫 쪽(목차 다음 쪽)을 1로 센다. kordoc 조판은 한글의 근사치라 어긋날 수 있다.
async function fillTocPages(buf, entries) {
  if (!entries.length) return { buffer: buf, pages: [] };
  const scene = await renderDocumentToScene(buf, {});
  const norm = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/[\s ]/g, "");
  const pages = [...scene.pageSvgs.entries()].sort((a, b) => a[0] - b[0])
    .map(([no, svg]) => ({ no, text: norm([...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]).join("")) }));
  const tocPages = pages.filter((p) => p.text.includes("⟦pg:")).map((p) => p.no);
  const tocLast = tocPages.length ? Math.max(...tocPages) : 0;
  const found = new Map();
  let from = tocLast + 1;
  for (const e of entries) {
    const key = norm(e.title);
    const hit = pages.find((p) => p.no >= from && p.text.includes(key));
    if (hit) { found.set(e.n, hit.no - tocLast); from = hit.no; }
  }
  const doc = await Hwpx.open(buf);
  doc.sections = doc.sections.map((x) => x.replace(/⟦pg:(\d+)⟧/g, (_, n) => String(found.get(+n) ?? "")));
  return { buffer: await doc.save(), pages: entries.map((e) => ({ title: e.title, page: found.get(e.n) ?? null })) };
}

/** 메인: 마크다운 → hwpx Buffer. meta: {org, dept, date, tocDepth, tocPages} */
export async function generate(markdown, presetId, meta = {}) {
  const preset = loadPreset(presetId);
  const r = await generateCore(markdown, preset, meta);
  if (meta.tocPages !== "추정") return { buffer: Buffer.from(r.buffer), warnings: r.warnings, tocPages: [] };
  const { buffer, pages } = await fillTocPages(r.buffer, r.entries);
  const warnings = r.warnings;
  const missing = pages.filter((p) => p.page === null).map((p) => p.title);
  if (missing.length) warnings.push(`목차 쪽 번호를 못 찾은 항목: ${missing.join(", ")}`);
  warnings.push("목차 쪽 번호는 추정값입니다. 한글에서 확인하세요");
  return { buffer: Buffer.from(buffer), warnings, tocPages: pages };
}
