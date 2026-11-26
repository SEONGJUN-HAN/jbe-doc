#!/usr/bin/env node
// jbe-doc MCP 서버: 전북교육청 개조식 보고서 프리셋으로 hwpx를 만든다.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { generate, listPresets } from "./engine.mjs";

const server = new McpServer({ name: "jbe-doc", version: "0.1.0" }, {
  instructions:
    "전북특별자치도교육청 개조식 보고서(계획서)를 HWPX로 만든다. 도교육청이 실제로 게시한 모범 문서를 실측한 프리셋을 쓴다. " +
    "공식 표준 서식은 아니다(도교육청 문서 관행 실측). 먼저 list_jbe_presets로 프리셋과 마크다운 작성법을 보고, " +
    "어떤 프리셋을 쓸지 불분명하면 사용자에게 묻는다. 만든 뒤에는 kordoc의 render_document로 렌더해 확인을 권한다.",
});

const presets = listPresets();

server.registerTool("list_jbe_presets", {
  title: "전북교육청 보고서 프리셋 목록",
  description: "쓸 수 있는 전북교육청 개조식 보고서 프리셋과 각 프리셋의 마크다운 작성법·근거 문서를 보여준다.",
  inputSchema: {},
}, async () => ({
  content: [{ type: "text", text: presets.map((p) =>
    `■ ${p.id} — ${p.label}\n  ${p.description}\n  작성법: ${p.markdown.guide}\n  근거: ${p.source.doc} (${p.source.dept}, ${p.source.posted}) ${p.source.url}`).join("\n\n") +
    "\n\n공통: # 문서 제목, 제목 바로 아래 '> …하고자 함' 한 문장(보고 목적), ## 장(Ⅰ Ⅱ 자동 번호). 표는 GFM 파이프 표. 표지·목차(장, 선택하면 절까지)는 자동. 붙임은 목차에 넣지 않는다. " +
    "붙임·참고·서식은 '## 붙임 1. 제목', '## 참고 1. 제목', '## 서식 1. 제목'처럼 쓰면 새 쪽에서 라벨 상자로 시작하고 장 번호에서 빠진다(본문 뒤에 둔다)." }],
}));

server.registerTool("generate_jbe_report", {
  title: "전북교육청 개조식 보고서 만들기",
  description: "마크다운을 전북교육청 프리셋 서식의 HWPX로 만든다. 프리셋별 제목 단계(###·####)의 뜻이 다르니 list_jbe_presets의 작성법을 따른다. " +
    "'### 과제: 제목'은 과제 띠가 있는 프리셋(번호형)에서 과제 띠가 되고, 다른 프리셋에선 보통 절이 된다.",
  inputSchema: {
    preset: z.enum(presets.map((p) => p.id)).describe("프리셋 id"),
    markdown: z.string().describe("보고서 마크다운 전문"),
    output_path: z.string().describe("저장할 .hwpx 절대 경로"),
    dept: z.string().optional().describe("표지 부서명(예: 민주시민교육과). 【 】는 자동"),
    date: z.string().optional().describe("표지 날짜 'YYYY. M.' 또는 'YYYY. M. D.'. 없으면 오늘"),
    org: z.string().optional().describe("표지 기관명. 기본 전북특별자치도교육청 (학교면 학교명)"),
    toc_depth: z.enum(["장", "절"]).optional().describe("목차 깊이. '장'=장만(기본), '절'=장+절"),
    toc_pages: z.enum(["빈칸", "추정"]).optional().describe("목차 쪽 번호. '빈칸'=점선만 두고 한글에서 직접 입력(기본), '추정'=자동 추정(어긋날 수 있음)"),
  },
}, async ({ preset, markdown, output_path, dept, date, org, toc_depth, toc_pages }) => {
  if (!isAbsolute(output_path)) throw new Error("output_path는 절대 경로여야 합니다");
  const { buffer, warnings } = await generate(markdown, preset, { dept, date, org, tocDepth: toc_depth, tocPages: toc_pages });
  mkdirSync(dirname(output_path), { recursive: true });
  writeFileSync(output_path, buffer);
  return {
    content: [{ type: "text", text: `저장: ${output_path} (${Math.round(buffer.length / 1024)}KB, 프리셋 ${preset})` +
      (warnings.length ? `\n경고: ${warnings.join(" / ")}` : "") +
      "\n렌더 확인: kordoc render_document(file_path=위 경로, pages='1-4')" }],
  };
});

await server.connect(new StdioServerTransport());
