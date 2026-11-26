// 전북교육청 프리셋 엔진 핵심부(Node·브라우저 공용): 마크다운 → (전처리) → kordoc markdownToHwpx → (후처리) → hwpx
// 파일 읽기·조판(쪽 번호 추정)은 engine.mjs(Node 전용)에 있다. 공문만들기(브라우저 HTML)도 이 파일을 번들한다.
import { markdownToHwpx } from "kordoc";
import { Hwpx, splitTopParas, joinTopParas, textOf, esc } from "./hwpx.mjs";

const SENT = "⟦jbe:"; // 전처리에서 심고 후처리에서 바꾸는 표지
const BODY_W = 47900; // A4 좌우 20mm 여백일 때 본문 폭(HWPUNIT, 실측 47907)

// ── 번호 ──────────────────────────────────────────────
const ROMAN = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ", "Ⅷ", "Ⅸ", "Ⅹ", "Ⅺ", "Ⅻ"];
const GANADA = "가나다라마바사아자차카타파하".split("");
const fmtNum = (n, kind) => kind === "roman" ? ROMAN[n - 1] ?? String(n) : kind === "ganada" ? GANADA[n - 1] ?? String(n) : String(n);

// ── 전처리 ─────────────────────────────────────────────
const ANNEX_RE = /^##\s+[\[【]?\s*(붙임|참고|서식|별첨|별지)\s*(\d+)?\s*[\]】]?\s*[.:：]?\s*(.*)$/;
function preprocess(md, preset) {
  const map = preset.markdown.headings; // 예: {"###":"section","####":"dae"}
  const out = [];
  for (const line of md.split(/\r?\n/)) {
    // '## 붙임 1. 제목', '## [참고] 제목', '## 서식 2 제목' → 장이 아닌 붙임(새 쪽 + 라벨 상자)
    const ax = line.match(ANNEX_RE);
    if (ax) {
      const label = `${ax[1]}${ax[2] ? " " + ax[2] : ""}`;
      out.push("", `${SENT}annex⟧${label}|${ax[3].trim()}`, "");
      continue;
    }
    const m = line.match(/^(#{3,5})\s+(.*)$/);
    if (m && map[m[1]]) {
      let role = map[m[1]], title = m[2].trim();
      // '### 과제: 제목' — 과제 띠가 있는 프리셋이면 과제 띠, 없으면 '과제:'만 떼고 보통 절로
      const task = role === "section" && title.match(/^과제\s*[:：]\s*(.*)$/);
      if (task) { title = task[1]; if (preset.blocks?.task) role = "task"; }
      if (role === "dae") out.push(`### ${title}`);
      else out.push("", `${SENT}${role}⟧${title}`, "");
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

// ── 블록(장·절·과제 머리) ───────────────────────────────
function side(spec, name) {
  if (!spec) return null;
  return spec[name] ?? spec.all ?? null;
}

function buildBlock(doc, spec, vars, ctx) {
  if (spec.type === "para") {
    const pp = doc.paraPrFrom(ctx.daeParaPr ?? ctx.outerParaPr, { align: "LEFT", left: spec.left ?? 0, indent: 0, prev: spec.before ?? 600, next: spec.after ?? 200, keepNext: true });
    const runs = spec.runs.map((r) => `<hp:run charPrIDRef="${doc.charPr(r.font)}"><hp:t>${esc(fill(r.text, vars))}</hp:t></hp:run>`).join("");
    return `<hp:p paraPrIDRef="${pp}" styleIDRef="0"${vars.pageBreak ? ' pageBreak="1"' : ""}>${runs}</hp:p>`;
  }
  const H = spec.height ?? 2650;
  const fixed = spec.cells.filter((c) => typeof c.w === "number").reduce((a, c) => a + c.w, 0);
  const cells = [];
  for (const c of spec.cells) {
    let w = c.w;
    if (w === "fit") {
      const t = fill(c.text ?? "", vars);
      w = Math.round([...t].reduce((a, ch) => a + (ch.charCodeAt(0) < 128 ? 0.55 : 1), 0) * c.font.pt * 100 * 1.02 + 600);
    }
    cells.push({ ...c, w });
  }
  const used = cells.filter((c) => c.w !== "rest").reduce((a, c) => a + c.w, 0);
  cells.forEach((c) => { if (c.w === "rest") c.w = Math.max(1000, BODY_W - used); });
  const total = cells.reduce((a, c) => a + c.w, 0);
  const tcs = cells.map((c, i) => {
    const bf = doc.borderFill({ left: side(c.border, "left"), right: side(c.border, "right"), top: side(c.border, "top"), bottom: side(c.border, "bottom"), fill: c.fill });
    const pp = doc.paraPrFrom(ctx.cellParaPr, { align: c.align ?? "LEFT", left: 0, indent: 0, prev: 0, next: 0, line: 100 });
    const text = fill(c.text ?? "", vars);
    const run = c.font ? `<hp:run charPrIDRef="${doc.charPr(c.font)}"><hp:t>${esc(text)}</hp:t></hp:run>` : `<hp:run charPrIDRef="0"><hp:t></hp:t></hp:run>`;
    return `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="1" dirty="0" borderFillIDRef="${bf}">` +
      `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">` +
      `<hp:p paraPrIDRef="${pp}" styleIDRef="0">${run}</hp:p></hp:subList>` +
      `<hp:cellAddr colAddr="${i}" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${c.w}" height="${H}"/>` +
      `<hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc>`;
  }).join("");
  const none = doc.borderFill({});
  const outer = doc.paraPrFrom(ctx.outerParaPr, { prev: spec.before ?? 400, next: spec.after ?? 200, keepNext: true });
  ctx.tblId = (ctx.tblId ?? 970000000) + 1;
  return `<hp:p paraPrIDRef="${outer}" styleIDRef="0"${vars.pageBreak ? ' pageBreak="1"' : ""}><hp:run charPrIDRef="0"><hp:tbl id="${ctx.tblId}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="1" colCnt="${cells.length}" cellSpacing="0" borderFillIDRef="${none}" noAdjust="1">` +
    `<hp:sz width="${total}" widthRelTo="ABSOLUTE" height="${H}" heightRelTo="ABSOLUTE" protect="0"/>` +
    `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
    `<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="141" right="141" top="141" bottom="141"/>` +
    `<hp:tr>${tcs}</hp:tr></hp:tbl></hp:run></hp:p>`;
}

const fill = (t, vars) => t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

// ── 후처리 ─────────────────────────────────────────────
const SHIFT = [ // 번호형: kordoc 법정 번호를 한 단계 내려 '가.'부터 시작
  [/^(\d+)\.$/, (n) => `${GANADA[n - 1]}.`],
  [/^([가-하])\.$/, (g) => `${GANADA.indexOf(g) + 1})`],
  [/^(\d+)\)$/, (n) => `${GANADA[n - 1]})`],
  [/^([가-하])\)$/, (g) => `(${GANADA.indexOf(g) + 1})`],
  [/^\((\d+)\)$/, (n) => `(${GANADA[n - 1]})`],
];

// 번호형: kordoc 법정 번호(1. 가. 1))를 한 단계 내려 가. 1) 가)로 바꾸고,
// 절 제목('1.') 아래로 들여 쓰며, 글자 폭이 넓은 '가.'류는 내어쓰기를 넓힌다.
function shiftNumbering(doc, p, opt) {
  const m = p.match(/^<hp:p paraPrIDRef="(\d+)"([^>]*)><hp:run charPrIDRef="(\d+)"><hp:t>([^<]{1,5})<hp:tab width="(\d+)"/);
  if (!m) return p;
  const [head, pp, rest, cp, mark, tabW] = m;
  let next = null;
  for (const [rx, f] of SHIFT) { const mm = mark.match(rx); if (mm) { next = f(mm[1]); break; } }
  if (!next) return p;
  const extra = /^[가-하]/.test(next) ? (opt.wide ?? 550) : /^\(/.test(next) ? (opt.paren ?? 350) : 0;
  const newPP = doc.paraPrFrom(+pp, { leftAdd: opt.indent ?? 0, indentAdd: -extra });
  return `<hp:p paraPrIDRef="${newPP}"${rest}><hp:run charPrIDRef="${cp}"><hp:t>${next}<hp:tab width="${+tabW + extra}"` + p.slice(head.length);
}

async function postprocess(buf, preset, meta = {}) {
  const doc = await Hwpx.open(buf);
  const B = preset.blocks ?? {};
  const counters = { chapter: 0, section: 0, sub: 0, task: 0 };
  const toc = { chapters: [], annexes: [], entries: [] };
  const annexSpec = B.annex ?? defaultAnnex(preset);
  for (let s = 0; s < doc.sections.length; s++) {
    const parts = splitTopParas(doc.sections[s]);
    const ctx = {};
    // kordoc 장 띠에서 문단 모양을 빌린다
    const h2 = parts.paras.find((p) => p.includes('name="__kordoc_h2"'));
    if (h2) {
      ctx.outerParaPr = +h2.match(/^<hp:p paraPrIDRef="(\d+)"/)[1];
      ctx.cellParaPr = +h2.match(/<hp:tc [^>]*>[\s\S]*?<hp:p paraPrIDRef="(\d+)"/)[1];
    } else {
      ctx.outerParaPr = 0; ctx.cellParaPr = 0;
    }
    const dae = parts.paras.find((p) => /<hp:t>□<hp:tab/.test(p));
    if (dae) ctx.daeParaPr = +dae.match(/^<hp:p paraPrIDRef="(\d+)"/)[1];

    parts.paras = parts.paras.map((p) => {
      // 장
      if (p.includes('name="__kordoc_h2"') && B.chapter) {
        counters.chapter++; counters.section = 0; counters.sub = 0;
        const title = textOf(p.match(/<hp:tc name="__kordoc_h2"[\s\S]*?<\/hp:tc>/)[0]).trim();
        toc.chapters.push({ title, items: [] });
        return buildBlock(doc, B.chapter, { num: fmtNum(counters.chapter, B.chapter.num ?? "roman"), title }, ctx);
      }
      // 전처리 표지
      const t = textOf(p);
      const m = t.match(/⟦jbe:(\w+)⟧(.*)$/);
      if (m) {
        const [, role, title] = m;
        if (role === "annex") {
          const [label, atitle] = title.split("|");
          counters.section = 0; counters.sub = 0;
          toc.annexes.push({ label, title: atitle }); toc.inAnnex = true;
          return buildBlock(doc, annexSpec, { label, title: atitle, pageBreak: true }, ctx);
        }
        if (role === "section") { counters.section++; counters.sub = 0; counters.parent = counters.section; }
        if (role === "sub") counters.sub++;
        if (role === "task") { counters.task++; counters.sub = 0; counters.parent = counters.task; }
        const spec = B[role];
        if (!spec) return p;
        const vars = { title: title.trim(), num: fmtNum(counters[role], spec.num ?? "arabic"), section: counters.section, chapter: counters.chapter, task: counters.task, parent: counters.parent ?? 1 };
        if ((role === "section" || role === "task") && toc.chapters.length && !toc.inAnnex && meta.tocDepth !== "장") toc.chapters.at(-1).items.push({ text: `${vars.num}. ${vars.title}`, title: vars.title });
        return buildBlock(doc, spec, vars, ctx);
      }
      if (preset.numberShift) return shiftNumbering(doc, p, preset.numberShift);
      return p;
    });
    parts.paras = parts.paras.map((p) => p.includes('name="__kordoc_toc"') ? rebuildToc(doc, p, toc, preset) : p);
    let xml = joinTopParas(parts);

    // 기호 바꾸기(○→❍ 등) — 기호만 든 run(기호 + 탭)에만
    for (const [from, to] of Object.entries(preset.bullets ?? {})) {
      xml = xml.split(`<hp:t>${from}<hp:tab`).join(`<hp:t>${to}<hp:tab`);
    }
    // □ 대항목 본문 서식(유초등형: □ 뒤 【키워드】 굵게, 나머지 보통)
    if (preset.dae) {
      const kw = doc.charPr(preset.dae.keyword), body = doc.charPr(preset.dae.text);
      xml = xml.replace(/(<hp:run charPrIDRef=")(\d+)("><hp:t>□<hp:tab[^>]*\/><\/hp:t><\/hp:run>)<hp:run charPrIDRef="\d+"><hp:t>([\s\S]*?)<\/hp:t><\/hp:run>/g,
        (all, a, cp, b, text) => {
          const k = text.match(/^(【[^】]*】|\([^)]*\))([\s\S]*)$/);
          const rest = k ? `<hp:run charPrIDRef="${kw}"><hp:t>${k[1]}</hp:t></hp:run><hp:run charPrIDRef="${body}"><hp:t>${k[2]}</hp:t></hp:run>` : `<hp:run charPrIDRef="${body}"><hp:t>${text}</hp:t></hp:run>`;
          return `${a}${cp}${b}${rest}`;
        });
    }
    xml = centerShortCells(doc, xml);
    if (preset.cover) xml = restyleCover(doc, xml, preset.cover, meta, s === 0);
    xml = restyleSummary(doc, xml, preset);
    doc.sections[s] = xml;
  }
  return { buffer: await doc.save(), entries: toc.entries };
}

// 붙임·참고·서식 머리: 새 쪽에서 [라벨 칸 | 제목 + 밑줄]
function defaultAnnex(preset) {
  const accent = preset.cover?.accent ?? "#1F3864";
  return {
    height: 2500, before: 0, after: 400,
    cells: [
      { w: 6200, fill: accent, border: { all: ["SOLID", "0.12 mm", accent] }, text: "{label}", align: "CENTER",
        font: { font: "HY헤드라인M", pt: 14, color: "#FFFFFF" } },
      { w: 565 },
      { w: "rest", border: { bottom: ["SOLID", "0.4 mm", accent] }, text: " {title}", font: { font: "HY헤드라인M", pt: 16 } },
    ],
  };
}

// 목차: kordoc이 만든 장 목록(__kordoc_toc 칸) 사이에 절을 들여 넣고, 끝에 붙임 목록
function rebuildToc(doc, p, toc, preset) {
  // kordoc은 '목 차' 제목 칸과 목록 칸에 같은 이름을 붙인다 → 장 번호(Ⅰ)가 든 칸이 목록
  const cell = [...p.matchAll(/(<hp:tc name="__kordoc_toc"[^>]*><hp:subList[^>]*>)([\s\S]*?)(<\/hp:subList>)/g)]
    .find((m) => /[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]/.test(textOf(m[2])));
  if (!cell) return p;
  const chParas = cell[2].match(/<hp:p [\s\S]*?<\/hp:p>/g) ?? [];
  if (!chParas.length) return p;
  const first = chParas[0];
  const pp = +first.match(/paraPrIDRef="(\d+)"/)[1];
  const runs = [...first.matchAll(/<hp:run charPrIDRef="(\d+)">/g)].map((m) => +m[1]);
  const titleInfo = doc.charPrInfo(runs.at(-1));
  const itemCp = doc.charPr({ font: titleInfo.font, pt: Math.max(10, titleInfo.pt - 2) });
  // 한 쪽 상자에 들어가도록 줄 수에 따라 장 위 간격·줄간격을 줄인다
  const lines = chParas.length + toc.chapters.reduce((a, c) => a + c.items.length, 0) + toc.annexes.length;
  const tight = lines > 24 ? 0 : lines > 16 ? 1 : 2; // 0=가장 촘촘
  const chPrev = [300, 600, 1000][tight], line = [130, 140, 160][tight];
  // 쪽 번호: 오른쪽 점선 탭 + 자리표지(⟦pg:n⟧) — 생성 뒤 fillTocPages가 숫자로 바꾼다
  const cellW = +(p.slice(p.indexOf(cell[0])).match(/<hp:cellSz width="(\d+)"/) || [0, 40000])[1];
  const baseLeft = +(doc.header.match(new RegExp(`<hh:paraPr id="${pp}"[\\s\\S]*?<hc:left value="(-?\\d+)"`)) || [0, 0])[1];
  const indent = preset.tocIndent ?? 1800;
  const posFor = (left) => Math.max(8000, cellW - 282 - 1700 - left);
  const tabFor = (left) => doc.tabPrRight(posFor(left));
  const chPp = doc.paraPrFrom(pp, { prev: chPrev, next: 0, line, tabPr: tabFor(baseLeft) });
  const itemPp = doc.paraPrFrom(pp, { leftAdd: indent, prev: 0, next: 0, line, tabPr: tabFor(baseLeft + indent) });
  const width = (t, pt) => Math.round([...t].reduce((a, ch) => a + (ch.charCodeAt(0) < 128 ? 0.55 : 1), 0) * pt * 100);
  const pageRun = (cp, left, textW) => {
    const n = toc.entries.length;
    return { n, xml: `<hp:run charPrIDRef="${cp}"><hp:t><hp:tab width="${Math.max(600, posFor(left) - textW - 900)}" leader="3" type="2"/>⟦pg:${n}⟧</hp:t></hp:run>` };
  };
  let body = "";
  chParas.forEach((cp, i) => {
    const ch = toc.chapters[i];
    let chXml = cp.replace(/paraPrIDRef="\d+"/, `paraPrIDRef="${chPp}"`);
    if (ch) {
      const pr = pageRun(runs.at(-1), baseLeft, width(textOf(cp), titleInfo.pt));
      toc.entries.push({ n: pr.n, title: ch.title });
      chXml = chXml.replace(/<\/hp:p>$/, `${pr.xml}</hp:p>`);
    }
    body += chXml;
    for (const it of ch?.items ?? []) {
      const pr = pageRun(itemCp, baseLeft + indent, width(it.text, titleInfo.pt - 2));
      toc.entries.push({ n: pr.n, title: it.title });
      body += `<hp:p paraPrIDRef="${itemPp}" styleIDRef="0"><hp:run charPrIDRef="${itemCp}"><hp:t>${esc(it.text)}</hp:t></hp:run>${pr.xml}</hp:p>`;
    }
  });
  if (toc.annexes.length) {
    const annexCp = doc.charPr({ font: titleInfo.font, pt: titleInfo.pt - 1 });
    const annexFirst = doc.paraPrFrom(pp, { prev: chPrev + 400, next: 0, line, tabPr: tabFor(baseLeft) });
    const annexRest = doc.paraPrFrom(pp, { prev: 0, next: 0, line, tabPr: tabFor(baseLeft) });
    body += toc.annexes.map((a, i) => {
      const text = `[${a.label}] ${a.title}`;
      const pr = pageRun(annexCp, baseLeft, width(text, titleInfo.pt - 1));
      toc.entries.push({ n: pr.n, title: a.title });
      return `<hp:p paraPrIDRef="${i ? annexRest : annexFirst}" styleIDRef="0"><hp:run charPrIDRef="${annexCp}"><hp:t>${esc(text)}</hp:t></hp:run>${pr.xml}</hp:p>`;
    }).join("");
  }
  return p.replace(cell[0], cell[1] + body + cell[3]);
}

// 본문 표: kordoc이 숫자 칸 일부를 왼쪽 정렬하는 것을 가운데로 맞춘다
// (짧고 숫자가 든 칸만. 도교육청 계획서 표는 수치 칸을 가운데 정렬하는 관행)
function centerShortCells(doc, xml) {
  return xml.replace(/<hp:tbl[^>]*rowCnt="(\d+)"[^>]*>[\s\S]*?<\/hp:tbl>/g, (tbl, rows) => {
    if (+rows < 2 || /<hp:tbl[\s\S]*<hp:tbl/.test(tbl)) return tbl;
    return tbl.replace(/<hp:p paraPrIDRef="(\d+)"([^>]*)>((?:(?!<\/hp:p>)[\s\S])*?)<\/hp:p>/g, (p, pp, rest, inner) => {
      const t = textOf(inner).trim();
      if (!t || t.length > 10 || !/\d/.test(t)) return p;
      const al = doc.header.match(new RegExp(`<hh:paraPr id="${pp}"[\\s\\S]*?<hh:align horizontal="(\\w+)"`));
      if (!al || al[1] !== "LEFT") return p;
      return `<hp:p paraPrIDRef="${doc.paraPrFrom(+pp, { align: "CENTER" })}"${rest}>${inner}</hp:p>`;
    });
  });
}

// 표지·제목 박스·목차: kordoc 파랑 띠를 원본 색 띠로, 기관명 아래 【부서명】
const KORDOC_DARK = "#193AAA", KORDOC_LIGHT = "#A0B4E6", KORDOC_PALE = "#E0E5FA";
function restyleCover(doc, xml, cover, meta, first) {
  const idsOf = (color) => new Set([...doc.header.matchAll(/<hh:borderFill id="(\d+)"[^>]*>(?:(?!<\/hh:borderFill>)[\s\S])*?faceColor="([^"]+)"/g)]
    .filter((m) => m[2].toUpperCase() === color).map((m) => m[1]));
  const bar = new Set([...idsOf(KORDOC_DARK), ...idsOf(KORDOC_LIGHT)]);
  // 띠는 표지 표(3×3) 안의 칸들: 진한 칸·연한 칸이 짝으로 위 띠, 아래 띠 순서로 나온다.
  // 칸 너비는 표 격자에 묶여 있어 색만 바꾼다.
  // 표(최상위 문단)마다 따로 센다. 짝이 안 맞는 칸(목차 장식 등)은 강조색으로.
  const parts = splitTopParas(xml);
  parts.paras = parts.paras.map((p) => {
    const cnt = [...p.matchAll(/<hp:tc [^>]*borderFillIDRef="(\d+)"/g)].filter((m) => bar.has(m[1])).length;
    if (!cnt) return p;
    let n = 0;
    return p.replace(/(<hp:tc [^>]*borderFillIDRef=")(\d+)/g, (all, a, id) => {
      if (!bar.has(id)) return all;
      const color = cnt % 2 === 0 ? cover.bars[Math.floor(n / 2) % cover.bars.length][n % 2] : (cover.accent ?? KORDOC_DARK);
      n++;
      return a + doc.borderFill({ fill: color });
    });
  });
  xml = joinTopParas(parts);
  // 남은 kordoc 파랑(목차 장식 등)은 기관 강조색으로
  if (cover.accent) {
    doc.header = doc.header.replace(new RegExp(`faceColor="${KORDOC_DARK}"`, "gi"), `faceColor="${cover.accent}"`)
      .replace(new RegExp(`faceColor="${KORDOC_PALE}"`, "gi"), `faceColor="${cover.accentPale ?? "#EEEEEE"}"`);
  }
  // 표지 기관명 아래 【부서명】
  if (first && meta.dept) {
    const org = meta.org || "전북특별자치도교육청";
    const at = xml.indexOf(`<hp:t>${esc(org)}</hp:t>`);
    if (at > 0) {
      const ps = xml.lastIndexOf("<hp:p ", at), pe = xml.indexOf("</hp:p>", at) + 7;
      const para = xml.slice(ps, pe);
      const cp = para.match(/<hp:run charPrIDRef="(\d+)"><hp:t>/)[1];
      const base = doc.header.match(new RegExp(`<hh:charPr id="${cp}" height="(\\d+)"`));
      const deptCp = doc.charPr({ font: cover.deptFont ?? "HY헤드라인M", pt: cover.deptPt ?? (base ? +base[1] / 100 * 0.75 : 14), color: cover.deptColor ?? "#000000" });
      const clone = para.replace(/<hp:run charPrIDRef="\d+"><hp:t>[\s\S]*?<\/hp:t><\/hp:run>/, `<hp:run charPrIDRef="${deptCp}"><hp:t>【${esc(meta.dept)}】</hp:t></hp:run>`);
      xml = xml.slice(0, pe) + clone + xml.slice(pe);
    }
  }
  return xml;
}

// 리드문 요약 상자(kordoc __kordoc_summary): 테두리·채움을 프리셋 강조색 계열로
function restyleSummary(doc, xml, preset) {
  const accent = preset.cover?.accent;
  if (!accent) return xml;
  const line = ["SOLID", "0.4 mm", accent];
  const bf = doc.borderFill({ left: line, right: line, top: line, bottom: line, fill: preset.summaryFill ?? preset.cover.accentPale ?? "#EEEEEE" });
  return xml.replace(/(<hp:tc name="__kordoc_summary"[^>]*borderFillIDRef=")\d+/g, `$1${bf}`);
}

/**
 * 마크다운 + 프리셋 객체 → hwpx(Uint8Array).
 * meta: {org, dept, date, tocDepth('장'|'절'), tocPages('빈칸'|'추정')}
 * tocPages가 '추정'이면 목차에 쪽 자리표지(⟦pg:n⟧)를 남기고 entries를 함께 돌려준다(engine.mjs가 채움).
 */
export async function generateCore(markdown, preset, meta = {}) {
  const gongmun = structuredClone(preset.kordoc);
  gongmun.totalRow ??= "keep"; // 표 합계 행은 원고 순서 그대로(kordoc 4.25 기본은 맨 위로 옮김)
  if (gongmun.cover !== false) {
    gongmun.cover = { ...(typeof gongmun.cover === "object" ? gongmun.cover : {}), org: meta.org || "전북특별자치도교육청", ...(meta.dept && { dept: meta.dept }), ...(meta.date && { date: meta.date }) };
  }
  const warnings = [];
  const md = preprocess(markdown, preset);
  const raw = await markdownToHwpx(md, { gongmun, warnings });
  const pp = await postprocess(new Uint8Array(raw), preset, meta);
  if (meta.tocPages === "추정") return { buffer: pp.buffer, warnings, entries: pp.entries };
  // 기본: 쪽 번호 빈칸(점선만, 한글에서 마지막에 직접 입력)
  const doc = await Hwpx.open(pp.buffer);
  doc.sections = doc.sections.map((x) => x.replace(/⟦pg:\d+⟧/g, ""));
  return { buffer: await doc.save(), warnings, entries: [] };
}
