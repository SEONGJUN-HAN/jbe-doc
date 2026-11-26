# jbe-doc — 전북교육청 개조식 보고서 프리셋 (kordoc 래퍼 MCP)

마크다운을 전북교육청 계획서 서식의 HWPX(한글 문서)로 만드는 MCP 서버다.
[kordoc](https://www.npmjs.com/package/kordoc)으로 본문을 만들고, 장·절·과제 머리와 표지 색 띠를
**도교육청이 실제 게시한 모범 문서를 실측한 모양**으로 바꾼다.

> 공식 표준 서식이 아니다. 도교육청 누리집에 게시된 계획서의 관행을 실측한 것이다(근거 문서는 각 프리셋 JSON의 `source`).

## 무엇이 필요한가

| 구성 | 하는 일 | 필수 |
|---|---|---|
| **kordoc** MCP | 한글·PDF 문서 읽기, 만든 문서 미리보기(`render_document`), 일반 공문서 생성 | 권장 |
| **jbe-doc** MCP (이 저장소) | 전북교육청 프리셋으로 보고서 생성 | 필수 |

jbe-doc은 kordoc을 **자기 폴더 안에 고정 버전(4.25.22)으로 따로** 설치해 쓴다. 그래서 kordoc MCP를 따로 깔지 않아도 보고서는 만들어진다.
다만 만든 문서를 Claude가 렌더해서 확인하려면 kordoc MCP도 함께 등록해 두는 것이 좋다.
전역 kordoc을 업데이트해도 jbe-doc 서식은 깨지지 않는다(버전이 분리되어 있음).

준비물: **Node.js 20 이상**(https://nodejs.org 에서 LTS 설치), **한글 2022**(휴먼명조·HY헤드라인M·맑은 고딕·휴먼엑스포 글꼴 포함).

## 설치

### 1단계. kordoc 설치·등록 (권장)
```powershell
npm install -g kordoc
```
- Claude Code:
  ```powershell
  claude mcp add -s user kordoc -- kordoc-mcp
  ```
- Claude 데스크톱 앱: `%APPDATA%\Claude\claude_desktop_config.json`의 `mcpServers`에 추가
  ```json
  "kordoc": { "command": "cmd", "args": ["/c", "kordoc-mcp"] }
  ```

### 2단계. jbe-doc 설치·등록
```powershell
git clone https://github.com/SEONGJUN-HAN/jbe-doc.git
cd jbe-doc
npm install
```
git이 없으면 GitHub 화면의 **Code → Download ZIP**으로 받아 원하는 곳에 풀고, 그 폴더에서 `npm install`.
설치 폴더는 옮기지 않는다(옮기면 등록을 다시 해야 함).

- Claude Code (`<설치폴더>`는 실제 절대 경로로):
  ```powershell
  claude mcp add -s user jbe-doc -- node "<설치폴더>\src\server.mjs"
  ```
- Claude 데스크톱 앱: `claude_desktop_config.json`의 `mcpServers`에 추가 (경로의 `\`는 `\\`로)
  ```json
  "jbe-doc": { "command": "node", "args": ["C:\\...\\jbe-doc\\src\\server.mjs"] }
  ```
  설정을 고친 뒤 데스크톱 앱을 **완전히 종료**(트레이 아이콘 → 종료)했다가 다시 켠다.

### 3단계. 확인
- Claude Code: `claude mcp get jbe-doc` → `Connected`
- 대화에서 "전북교육청 보고서 프리셋 목록 보여줘" → 프리셋 3개가 나오면 성공

### AI에게 설치를 맡길 때
Claude Code에 아래를 그대로 붙여 넣는다.
```
https://github.com/SEONGJUN-HAN/jbe-doc 의 README '설치' 절차대로 kordoc과 jbe-doc을 설치하고
Claude Code(user 범위)와 Claude 데스크톱 앱 설정 양쪽에 MCP로 등록해 줘.
설치 폴더는 C:\Users\<내 계정>\jbe-doc 으로 하고, 데스크톱 설정 파일은 고치기 전에 백업해 줘.
끝나면 claude mcp get 으로 연결을 확인해 줘.
```

## 프리셋
| id | 모양 | 근거 문서 |
|---|---|---|
| `jbe-띠형` | 남색 Ⅰ 칸 + 숫자 칸 절, ❍ 14pt, 줄간격 170% | 2026 미디어리터러시 교육 기본 계획(민주시민교육과) |
| `jbe-키워드형` | 노랑 번호 상자 + `1.` 절 + `□【키워드】` | 2026. 유·보 이음교육 운영 계획(유초등특수교육과) |
| `jbe-번호형` | 청회색 Ⅰ 칸 + 과제 띠 + `가. 1) 가)` | 2026 대입 맞춤형 진학지도 기본계획(중등교육과) |

## 쓰는 법
Claude에게 "전북교육청 띠형으로 ○○ 추진계획 만들어 줘"처럼 요청하면 된다. 도구는 두 개다.
- `list_jbe_presets` — 프리셋과 작성법
- `generate_jbe_report` — 마크다운 → HWPX. 옵션: `dept`(표지 부서), `date`, `org`(학교면 학교명),
  `toc_depth`(`장` / `절` 기본), `toc_pages`(`빈칸` 기본 = 점선만 두고 한글에서 마지막에 직접 입력 / `추정`)

### 마크다운 작성법
```
# 문서 제목
> 보고 목적 한 문장(…하고자 함)
## 장 제목              → Ⅰ Ⅱ 자동
### 절 제목             → 띠형: 숫자 칸 / 키워드형·번호형: '1.'
### 과제: 과제 제목      → 번호형: '과제 n' 띠 (다른 프리셋은 보통 절)
#### 대항목             → 띠형·키워드형: □ / 번호형: '1-1.' 소절
- 항목                  → ❍ / ○ / 가.
  - 하위 항목            → - / - / 1)
※ 참고
## 붙임 1. 제목          → 새 쪽, [붙임 1] 라벨 상자 (참고·서식·별첨·별지도 같음, 장 번호에서 빠짐)
```
표는 GFM 파이프 표. 표지·목차(장·절·붙임)는 자동. 예시 원고: `test/복잡샘플.md`

## 개발·업데이트
```powershell
npm run check                         # 세 프리셋 생성·재해석·렌더 → test/out/*.png
node test/validate.mjs test/out/*.hwpx  # hwpx 구조 검사
node test/sample.mjs                  # 복잡샘플.md → test/sample/
```
래퍼 안의 kordoc 버전을 올릴 때: `package.json`의 kordoc 버전 변경 → `npm install` → 위 검사 → 눈으로 확인 후 배포.
래퍼가 기대는 kordoc 출력 특징: 장 띠 표의 `name="__kordoc_h2"` 칸, 목차 칸 `__kordoc_toc`, 리드문 상자 `__kordoc_summary`,
목록 기호가 따로 든 run(`기호+탭`), 표지 띠 채움색 `#193AAA`·`#A0B4E6`·`#E0E5FA`. 이것이 바뀌면 `src/core.mjs`를 고친다.
표 합계 행은 `totalRow: "keep"`(원고 순서 그대로)으로 고정한다(kordoc 4.25 기본은 맨 위로 옮김).

### 코드 구성
- `src/core.mjs` — 생성 핵심부(전처리·kordoc·후처리). Node·브라우저 공용. 프리셋 **객체**를 받는다.
- `src/engine.mjs` — Node 전용: `presets/*.json` 읽기, 목차 쪽 번호 추정(kordoc 조판).
- `src/server.mjs` — MCP 서버.
- 브라우저용 [공문만들기] HTML 도구도 `src/core.mjs`와 `presets/*.json`을 번들해 같은 서식을 쓴다.

## 알려진 한계 (v0.1)
- `toc_pages: '추정'`의 쪽 번호는 kordoc 조판 기준이라 한글과 어긋날 수 있다(표가 많으면 뒤쪽이 한 쪽씩 밀림). 그래서 기본은 빈칸이다.
- 목차 점선·오른쪽 정렬은 한글에서만 보인다(kordoc 미리보기는 점선 없음).
- 제목이 쪽 끝에 남지 않게 '다음 문단과 함께'를 넣었다. kordoc 미리보기는 이걸 반영하지 않는다.
- 키워드형 원본의 장 머리는 그리기 개체라 확인 못 했다. 요약 쪽의 번호 상자 모양을 따랐다.
- 표지 띠의 좌우 비율은 kordoc 표 격자를 따른다(색만 원본과 같음). 교육청 CI·슬로건 그림은 넣지 않는다.

## 고지
- kordoc © 해당 저작자, MIT License. 이 저장소는 kordoc을 npm 의존성으로 설치할 뿐 소스를 포함하지 않는다.
- 프리셋 수치는 전북특별자치도교육청 누리집 공개 게시물을 실측한 것이며, 원본 파일은 이 저장소에 포함하지 않는다.
