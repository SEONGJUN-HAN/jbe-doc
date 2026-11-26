// kordoc이 만든 hwpx를 고치는 최소 도구. kordoc 출력 형식(들여쓰기·속성 순서)에 기대므로
// kordoc 버전을 올리면 test/check.mjs 로 먼저 확인한다.
import JSZip from "jszip";

const LANGS = ["HANGUL", "LATIN", "HANJA", "JAPANESE", "OTHER", "SYMBOL", "USER"];

export class Hwpx {
  static async open(buf) {
    const d = new Hwpx();
    d.zip = await JSZip.loadAsync(buf);
    d.header = await d.zip.file("Contents/header.xml").async("string");
    d.sectionNames = Object.keys(d.zip.files).filter((n) => /^Contents\/section\d+\.xml$/.test(n)).sort();
    d.sections = await Promise.all(d.sectionNames.map((n) => d.zip.file(n).async("string")));
    d._cache = new Map();
    return d;
  }

  async save() {
    this.zip.file("Contents/header.xml", this.header);
    this.sectionNames.forEach((n, i) => this.zip.file(n, this.sections[i]));
    // mimetype은 압축하지 않고 맨 앞에 (hwpx 규칙)
    return this.zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", mimeType: "application/hwp+zip" });
  }

  _bumpCount(tag, delta = 1) {
    this.header = this.header.replace(new RegExp(`(<hh:${tag} itemCnt=")(\\d+)(")`), (_, a, n, b) => a + (+n + delta) + b);
  }

  _nextId(tag) {
    const ids = [...this.header.matchAll(new RegExp(`<hh:${tag} id="(\\d+)"`, "g"))].map((m) => +m[1]);
    return Math.max(-1, ...ids) + 1;
  }

  /** 글꼴 id. 없으면 모든 언어 fontface 끝에 추가 */
  fontId(face) {
    const hangul = this.header.match(/<hh:fontface lang="HANGUL"[\s\S]*?<\/hh:fontface>/)[0];
    const m = hangul.match(new RegExp(`<hh:font id="(\\d+)" face="${face.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    if (m) return +m[1];
    const id = [...hangul.matchAll(/<hh:font id="(\d+)"/g)].length;
    for (const lang of LANGS) {
      this.header = this.header.replace(new RegExp(`(<hh:fontface lang="${lang}" fontCnt=")(\\d+)(">[\\s\\S]*?)(</hh:fontface>)`), (_, a, n, body, end) =>
        `${a}${+n + 1}${body}<hh:font id="${id}" face="${face}" type="TTF" isEmbedded="0"><hh:typeInfo familyType="FCAT_GOTHIC" weight="6" proportion="4" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/></hh:font>\n      ${end}`);
    }
    return id;
  }

  /** 글자 모양 추가: {font, pt, bold, color, ratio, spacing} → charPr id */
  charPr({ font, pt, bold = false, color = "#000000", ratio = 100, spacing = 0 }) {
    const key = JSON.stringify(["c", font, pt, bold, color, ratio, spacing]);
    if (this._cache.has(key)) return this._cache.get(key);
    const fid = this.fontId(font);
    const id = this._nextId("charPr");
    const all = (v) => LANGS.map((l) => `${l.toLowerCase()}="${v}"`).join(" ");
    const xml = `<hh:charPr id="${id}" height="${Math.round(pt * 100)}" textColor="${color}" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1"${bold ? ' bold="1"' : ""}>` +
      `<hh:fontRef ${all(fid)}/><hh:ratio ${all(ratio)}/><hh:spacing ${all(spacing)}/><hh:relSz ${all(100)}/><hh:offset ${all(0)}/>${bold ? "<hh:bold/>" : ""}</hh:charPr>`;
    this.header = this.header.replace(/<\/hh:charProperties>/, `${xml}\n    </hh:charProperties>`);
    this._bumpCount("charProperties");
    this._cache.set(key, id);
    return id;
  }

  /** 오른쪽 점선 탭(목차 쪽 번호용, 한글 원본 목차와 같은 꼴) → tabPr id */
  tabPrRight(pos) {
    const key = JSON.stringify(["t", pos]);
    if (this._cache.has(key)) return this._cache.get(key);
    const id = this._nextId("tabPr");
    const xml = `<hh:tabPr id="${id}" autoTabLeft="0" autoTabRight="0"><hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">` +
      `<hh:tabItem pos="${pos}" type="RIGHT" leader="DASH" unit="HWPUNIT"/></hp:case><hp:default><hh:tabItem pos="${pos * 2}" type="RIGHT" leader="DASH"/></hp:default></hp:switch></hh:tabPr>`;
    this.header = this.header.replace(/<\/hh:tabProperties>/, `${xml}\n    </hh:tabProperties>`);
    this._bumpCount("tabProperties");
    this._cache.set(key, id);
    return id;
  }

  /** 글자 모양 읽기 → {font, pt, bold} */
  charPrInfo(id) {
    const c = this.header.match(new RegExp(`<hh:charPr id="${id}"[\\s\\S]*?</hh:charPr>`))[0];
    const fid = c.match(/hangul="(\d+)"/)[1];
    const hangul = this.header.match(/<hh:fontface lang="HANGUL"[\s\S]*?<\/hh:fontface>/)[0];
    return { font: hangul.match(new RegExp(`<hh:font id="${fid}" face="([^"]+)"`))[1], pt: +c.match(/height="(\d+)"/)[1] / 100, bold: /<hh:bold\/>/.test(c) };
  }

  /** 테두리·채움 추가: {left,right,top,bottom:[type,width,color]|null, fill} → borderFill id */
  borderFill({ left, right, top, bottom, fill } = {}) {
    const key = JSON.stringify(["b", left, right, top, bottom, fill]);
    if (this._cache.has(key)) return this._cache.get(key);
    const id = this._nextId("borderFill");
    const side = (tag, s) => s ? `<hh:${tag} type="${s[0]}" width="${s[1]}" color="${s[2]}"/>` : `<hh:${tag} type="NONE" width="0.1 mm" color="#000000"/>`;
    const xml = `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">` +
      `<hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>` +
      side("leftBorder", left) + side("rightBorder", right) + side("topBorder", top) + side("bottomBorder", bottom) +
      `<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>` +
      (fill ? `<hc:fillBrush><hc:winBrush faceColor="${fill}" hatchColor="#000000" alpha="0"/></hc:fillBrush>` : "") +
      `</hh:borderFill>`;
    this.header = this.header.replace(/<\/hh:borderFills>/, `${xml}\n    </hh:borderFills>`);
    this._bumpCount("borderFills");
    this._cache.set(key, id);
    return id;
  }

  /** 기존 문단 모양을 복제해 정렬·여백만 바꾼다 → paraPr id */
  paraPrFrom(baseId, { align, left, indent, prev, next, line, leftAdd, indentAdd, keepNext, tabPr } = {}) {
    const key = JSON.stringify(["p", baseId, align, left, indent, prev, next, line, leftAdd, indentAdd, keepNext, tabPr]);
    if (this._cache.has(key)) return this._cache.get(key);
    const base = this.header.match(new RegExp(`<hh:paraPr id="${baseId}"[\\s\\S]*?</hh:paraPr>`))[0];
    const id = this._nextId("paraPr");
    let xml = base.replace(/id="\d+"/, `id="${id}"`);
    if (align) xml = xml.replace(/(<hh:align horizontal=")[A-Z]+/, `$1${align}`);
    const setM = (tag, v) => { if (v !== undefined) xml = xml.replace(new RegExp(`(<hc:${tag} value=")-?\\d+`), `$1${v}`); };
    const getM = (tag) => +(xml.match(new RegExp(`<hc:${tag} value="(-?\\d+)"`)) || [0, 0])[1];
    if (leftAdd) left = getM("left") + leftAdd;
    if (indentAdd) indent = getM("intent") + indentAdd;
    setM("left", left); setM("intent", indent); setM("prev", prev); setM("next", next);
    if (line) xml = xml.replace(/(<hh:lineSpacing type="PERCENT" value=")\d+/, `$1${line}`);
    // 제목 문단은 다음 문단과 같은 쪽에 (쪽 끝에 제목만 남지 않게)
    if (tabPr !== undefined) xml = xml.replace(/tabPrIDRef="\d+"/, `tabPrIDRef="${tabPr}"`);
    if (keepNext !== undefined) xml = xml.replace(/keepWithNext="\d"/, `keepWithNext="${keepNext ? 1 : 0}"`);
    this.header = this.header.replace(/<\/hh:paraProperties>/, `${xml}\n    </hh:paraProperties>`);
    this._bumpCount("paraProperties");
    this._cache.set(key, id);
    return id;
  }
}

/** 섹션 XML을 최상위 문단 단위로 나눈다 → {head, paras, tail} */
export function splitTopParas(xml) {
  const paras = [];
  let depth = 0, start = -1, i = 0, head = null;
  const re = /<hp:p\b[^>]*?(\/?)>|<\/hp:p>/g;
  let m;
  while ((m = re.exec(xml))) {
    if (m[0].startsWith("</")) {
      depth--;
      if (depth === 0) { paras.push(xml.slice(start, re.lastIndex)); i = re.lastIndex; }
    } else if (!m[1]) {
      if (depth === 0) { if (head === null) head = xml.slice(0, m.index); start = m.index; }
      depth++;
    }
  }
  return { head: head ?? xml, paras, tail: xml.slice(i) };
}

export const joinTopParas = ({ head, paras, tail }) => head + paras.join("\n  ") + tail;

export const textOf = (xml) => [...xml.matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g)]
  .map((m) => m[1].replace(/<hp:(nbSpace|fwSpace)\/>/g, " ").replace(/<[^>]+>/g, "")).join("")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
