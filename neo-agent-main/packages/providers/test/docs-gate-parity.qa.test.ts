/**
 * 문서 ↔ 기계 대조 — QA 독립 검증 (T-008).
 *
 * **이 파일의 주제는 `package-boundary.contract.test.ts`와 정반대다.** 그쪽은 «게이트를
 * 보지 않는 것»이 값이라 기대값을 문서에서만 뽑는다. 여기는 «문서와 게이트가 같은 것을
 * 말하는가»가 주제이므로 **둘 다 읽는 것이 목적**이다 — 한쪽만 읽으면 대조가 성립하지
 * 않는다. 두 파일은 겹치지 않는다.
 *
 * 왜 필요한가: 2026-08-14까지 `PROVIDERS.md` §2.1이 금지 모듈 여덟을 선언하는 동안
 * 예산 게이트는 다섯만 쟀고, **그 어긋남을 재는 기계가 하나도 없었다**
 * (`plans/20260814-providers-doc-verify-report.md` V-1). 같은 사이클이 §2.2 코드블록과
 * `client.ts`의 필드 수 어긋남도 같은 이유로 놓쳤다(같은 리포트 D-1). 선언과 집행 사이의
 * 간격은 사람이 볼 때만 보이는 자리였고, 이 파일이 그 자리에 기계를 놓는다.
 *
 * `ARCHITECTURE.md` 머리의 «규범적 수» 예외가 요구하는 «그 수를 실제로 재는 검사»가
 * 금지 목록에 대해서는 존재하지 않았다는 것과 같은 사실이다.
 *
 * 기대값의 출처는 **정본 문서**이고, 게이트·구현은 **대조 상대**다. 어긋나면 문서가 옳다.
 *
 * ---
 *
 * ## 문면 인용 대조가 재지 못하는 것 — 좁아진 자리 넷 · 임의로 고른 자리 하나
 *
 * 아래 `cited` 계열은 `DOC-CITATION.md` §3.4의 **S-6**(백틱 코드 스팬 안은 인용부호가 아니다) ·
 * **S-5**의 **단위** 절반(유효 범위는 렌더링 한 덩어리) · **S-4**(대조 코퍼스에서 인용하는
 * 단위를 뺀다) · **N-1**·**N-2**·**N-3**·**N-4**(단위가 겹칠 때 · 잔여 · 복수 배제 · 배제
 * 사유) · **Q-1**(코드 표기는 부류다) · **Q-2**(들여쓰기 코드 블록은 코드 표기가 아니므로
 * 지우지 않는다) · **Q-3**(평문 큰따옴표는 부류다)를 옮긴 것이다. **S-5의 나머지 절반인 지목 판정은
 * 한 줄도 옮기지 않았다** — 무엇이 지목인가를 재는 코드가 여기 없으므로, S-4가 지목으로
 * 코퍼스를 넓히는 부분(기록·리비전)도 서지 않는다. 한계 1이 그 결과를 부분적으로 덮지만
 * 원인을 덮지는 않는다.
 *
 * 옮기면서 **좁아진 자리가 넷**이고, 그 위에 §3.4가 정하지 않아 **임의로 고른 자리가 하나**다.
 * **머리가 실물보다 넓게 주장하지 않도록** 다섯을 전부 여기 적는다 — 이 목록은 이 파일이
 * 무엇을 증명하지 **않는지**의 정본이다. 마지막 하나는 자리만 들고 근거는 본문의 미규정
 * 표시가 든다 — 같은 근거를 두 자리에 적으면 어느 쪽이 최신인지 알 수 없어져 둘 다 신뢰를
 * 잃는다.
 *
 * **임의로 고른 자리가 셋에서 하나로 준 것은 계약이 둘을 닫았기 때문이다**(2026-08-14).
 * 제목 줄·빈 줄의 처분은 **N-2**가, 같은 문면을 담은 단위가 여럿일 때의 처분은 **N-3**이
 * 정했다. 둘은 이제 임의 선택이 아니라 계약 준수이므로 이 목록에서 빠진다.
 *
 * **목록이 둘로 갈라지지 않는 것은 사람이 아니라 검사가 지킨다.** 두 방향이 다 걸려 있다:
 * 아래 `머리 주석이 판정 방식의 한계 다섯을 전부 든다`가 다섯이 머리에 실재하는지를 재고,
 * `cited-noncircular.qa.test.ts`가 본문의 미규정 표시를 열거해 머리에 없는 것이 있으면
 * 던진다. 새 미규정 선택을 본문에 넣고 머리에 안 적으면 두 번째가 red다.
 *
 * ### 옮기면서 좁아진 자리 — 넷
 *
 * 1. **코퍼스가 `PROVIDERS.md` 한 파일이다.** S-4의 코퍼스는 `docs/*.md` 전체 + 동결 레퍼런스
 *    트리 + 그 인용이 지목한 기록·리비전이다. 여기서 부재로 나온 문면을 S-4 기준으로도
 *    부재라고 단정할 수 없고, 그래서 실패 메시지가 그 한계를 함께 든다.
 * 2. **대조가 정확 부분 문자열이라 D-2의 공백 정규화를 하지 않는다.** 원문이 줄바꿈이나
 *    연속 공백을 사이에 두고 있으면 원문이 있어도 red가 난다. 정규화를 넣으면 대조의 의미가
 *    바뀌므로 그것은 계약 변경이고 이 파일의 몫이 아니다.
 * 3. **인용 구간 판별이 표기 기반이다.** 코드 펜스와 인라인 코드 스팬을 지운 뒤 인용부호
 *    셋을 찾을 뿐이므로, 원문 자체가 큰따옴표를 담고 있으면 구간 경계가 흔들릴 수 있다.
 *    구간은 줄 안에서 닫히는 것만 본다. **Q-3가 그 한계를 한 글자 넓혔다** — 셋째 형식이
 *    부류가 되면서 곡선 따옴표도 경계를 흔들 수 있는 글자가 됐다. 넓힌 쪽이 계약이므로
 *    이것은 결함이 아니라 이 한계의 모집단이 커진 것이다.
 * 4. **인용 목록이 손으로 유지된다.** 새 인용이 §2.2에 들어와도 아래 `it` 목록에 등록되지
 *    않으면 걸리지 않는다. 인용 자리를 문서에서 열거하는 것은 `check-doc-citation.mjs`의
 *    범위이고 그쪽은 형식만 보므로(`DOC-CITATION.md` §4가 그 경계를 명시한다), 이 간격은
 *    이 파일이 닫지 않는다.
 *
 * ### §3.4가 정하지 않아 임의로 고른 자리 — 하나
 *
 * **판정을 바꾼다.** 넷과 달리 이것은 좁힌 것이 아니라 규칙이 없는 자리를 하나로 정한
 * 것이므로, 다음 감사가 반대로 읽으면 결과가 갈린다.
 *
 * 5. **표 칸을 가를 때 코드 스팬 안의 `|`** — 표 칸 경계가 갈린다.
 *
 * 이 문단은 인용부호를 쓰지 않는다. **근거는 U-1이 아니다** — `DOC-CITATION.md` §1이 규약의
 * 범위를 `neo-agent-main/docs/*.md` 안의 주소 표기로 그었고 코드 대상 인용은 §6 U-b로 열어
 * 두었으므로, `.ts` 주석은 원리적으로 그 밖이다(이 파일 위쪽 문단들이 이미 인용부호를 쓴다).
 * 안 쓰는 이유는 **이 자리의 인용을 대조하는 기계가 없기 때문**이다 — `cited` 계열이 재는
 * 것은 `docs/*.md`의 문면이지 자기 주석이 아니다. 대조받지 않는 인용부호는 원문이 이렇다는
 * 신호만 주고 그 신호가 참인지 아무도 묻지 않는다.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const SELF_SOURCE = read("./docs-gate-parity.qa.test.ts");
const PROVIDERS_DOC = read("../../../docs/PROVIDERS.md");
const SESSION_STORE_DOC = read("../../../docs/SESSION-STORE.md");
/**
 * N-1의 실물 확인용으로만 **읽는다** — 코퍼스에 넣지 않는다(`citedVerdict`의 기본 인자는
 * 그대로 `PROVIDERS.md`다). 이 상수를 파일 머리에 두는 것은 `cited-noncircular.qa.test.ts`가
 * 잘라 실행하는 구간이 모듈 스코프 없이 돌기 때문이다 — 파서가 아니라 `it` 본문이 쓰는
 * 값이므로 구간 표지 «밖»에 있어야 한다.
 */
const APPROVAL_GATE_DOC = read("../../../docs/APPROVAL-GATE.md");
const BUDGET_GATE = read("../../../scripts/check-core-budget.mjs");
const CLIENT_SRC = read("../src/anthropic/client.ts");

/**
 * 게이트의 한 패키지 항에서 `forbiddenModules` 문자열을 뽑는다.
 *
 * 임포트하지 않고 텍스트로 읽는 이유는 `check-core-budget.mjs`가 exports 없는 실행
 * 스크립트이고 최상위에서 `process.exit(1)`을 부르기 때문이다 — 임포트하면 이 워커가
 * 죽는다(`DOC-CITATION.md` §4가 판정과 실행부를 파일로 가른 것과 같은 이유).
 *
 * 뽑지 못하면 `[]`가 아니라 던진다. 0건을 통과로 읽으면 «항 이름이 바뀌어 검사가 조용히
 * 죽은 상태»와 «위반이 없는 상태»가 구분되지 않는다(게이트 자신의 `soleLiteral` 규율).
 */
function gateForbiddenModules(packageName: string, gateSource: string = BUDGET_GATE): string[] {
  const entry = new RegExp(
    `name:\\s*"${packageName}"[\\s\\S]*?forbiddenModules:\\s*(\\[[\\s\\S]*?\\]|IO_MODULES)`,
  ).exec(gateSource);
  if (entry === null) {
    throw new Error(`게이트에서 ${packageName} 항의 forbiddenModules를 뽑지 못했다`);
  }
  const body = entry[1] ?? "";
  const source =
    body === "IO_MODULES" ? (/IO_MODULES = \[([\s\S]*?)\]/.exec(gateSource)?.[1] ?? "") : body;
  const modules = [...source.matchAll(/"([^"]+)"/g)].map((match) => match[1] as string);
  if (modules.length === 0) {
    throw new Error(`${packageName} 항의 forbiddenModules에서 모듈을 1건도 뽑지 못했다`);
  }
  return modules.sort();
}

/** 문서 한 줄에서 백틱으로 감싼 토큰을 뽑는다 */
function backticked(line: string): string[] {
  return [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1] as string);
}

/** `이름?: 타입` 꼴에서 필드 이름과 선택성을 뽑는다 — 주석 줄은 건너뛴다 */
function interfaceFields(block: string): { name: string; optional: boolean }[] {
  const fields: { name: string; optional: boolean }[] = [];
  for (const raw of block.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;
    const match = /^([A-Za-z_$][\w$]*)(\??)\s*:/.exec(line);
    if (match) fields.push({ name: match[1] as string, optional: match[2] === "?" });
  }
  return fields;
}

/** `interface <이름> {` 부터 짝이 맞는 `}` 직전까지 */
function interfaceBody(source: string, name: string): string {
  const start = source.indexOf(`interface ${name} {`);
  if (start === -1) throw new Error(`${name} 인터페이스를 찾지 못했다`);
  const end = source.indexOf("\n}", start);
  if (end === -1) throw new Error(`${name} 인터페이스의 끝을 찾지 못했다`);
  return source.slice(start, end);
}

/* ------------------------------------------------------------------------ *
 * DOC-CITATION.md §3.4 S-4·S-5·S-6 — 인용부호 구간과 렌더링 단위
 *
 * 아래 두 파서는 §3.4가 정한 것을 그대로 옮긴다. S-6이 «어디가 인용부호인가»를,
 * S-5가 «단위가 무엇인가»를, S-4가 «대조 코퍼스에서 무엇을 빼는가»를 정한다.
 * 셋을 코드에서 섞지 않는다 — 구간과 단위는 다른 것이고, 빼는 것은 단위다.
 * ------------------------------------------------------------------------ */

/** 원문 좌표계의 반열린 구간 `[start, end)` */
type TextSpan = { readonly start: number; readonly end: number };

/**
 * 코드 펜스 여는/닫는 줄. 최대 3칸 들여쓰기까지 인정한다.
 *
 * **Q-1·Q-2 — 이 상한이 계약보다 좁다.** Q-1은 코드 표기를 **부류**로 정하고 펜스(백틱·물결)
 * 전부를 들이므로 4칸 이상 들여쓴 펜스도 코드 표기인데 이 정규식은 안 잡는다. 오늘 실물이
 * 0건이고(2026-08-14 실측 — 4칸 이상 들여쓴 줄은 전부 펜스 안이거나 목록 연속이다) 방향이
 * red 쪽이라 이 사이클에서 넓히지 않는다. **다만 N-1이 하위 항목을 바깥 항목에 삼키면서
 * 깊게 들여쓴 펜스가 생길 여지가 커졌다** — 항목 «안»의 펜스는 `NESTED_FENCE_LINE`이
 * 들여쓰기를 가리지 않고 받으므로 단위 분해에서는 이미 닫혀 있고, 남은 것은 마스킹 쪽이다.
 *
 * Q-2는 반대 방향의 자리다 — **`docs/*.md`는 들여쓰기 코드 블록을 쓰지 않는다.** 4칸
 * 들여쓰기는 마커가 없어 무엇인지 알려면 앞 블록을 읽어야 하고, 그러면 S-6의 근거(판정이
 * 문자열 안에서 끝난다)가 무너진다. 그래서 계약이 형태를 금지했고, **그 형태를 안 지우는
 * 것이 여기서는 계약 준수다** — 그래도 쓰이면 그 안의 큰따옴표는 인용부호다.
 */
const FENCE_LINE = /^\s{0,3}(`{3,}|~{3,})/;

/** 같은 길이의 공백으로 지운다 — 줄바꿈은 남겨 좌표계와 줄 구조를 보존한다 */
const blankOut = (chunk: string): string => chunk.replace(/[^\n]/g, " ");

/**
 * 코드 «펜스»를 먼저 지운다. **펜스와 인라인 스팬이 한 부류인 것이 Q-1이다** — 코드 표기는
 * 목록이 아니라 부류이고, S-6이 든 근거 셋(값의 문법이 요구한다 · 판정이 문자열 안에서
 * 끝난다 · 감싸서 규칙을 피하는 길이 안 열린다)이 형태를 가리지 않기 때문이다. 펜스는 코드
 * **블록**으로 렌더링되므로 오히려 눈에 더 띈다.
 *
 * 인라인 스팬보다 **반드시 먼저**다 — 순서가 뒤면 펜스 안의
 * 백틱이 인라인 쌍으로 잘못 짝지어져 마스크 경계가 원문 밖으로 번진다. `PROVIDERS.md`의
 * `typescript` 펜스 안에 백틱 쌍이 실제로 들어 있어 이 순서가 실물에서 갈린다.
 */
function maskCodeFences(doc: string): string {
  const lines = doc.split("\n");
  const out: string[] = [];
  let open: string | null = null;
  for (const line of lines) {
    const marker = FENCE_LINE.exec(line)?.[1];
    if (open === null) {
      if (marker === undefined) {
        out.push(line);
        continue;
      }
      open = marker;
      out.push(blankOut(line));
      continue;
    }
    if (marker !== undefined && marker[0] === open[0] && marker.length >= open.length) open = null;
    out.push(blankOut(line));
  }
  return out.join("\n");
}

/**
 * 인라인 코드 스팬을 지운다 — S-6. 스팬은 줄 안에서 닫히는 것만 본다(이 레포 문서의 실물이
 * 전부 그렇고, 줄을 넘는 스팬을 인정하면 짝이 안 맞는 백틱 하나가 문서 절반을 삼킨다).
 *
 * **여는 백틱 런과 닫는 런의 길이가 같아야 한 스팬이다.** S-6의 술어는 백틱 쌍 안인가이고
 * 백틱의 개수를 가르지 않으므로, 이중 백틱 스팬이 홑 백틱을 담는 형태도 통째로 지워져야
 * 한다. 초판은 `` `+[^`\n]*`+ ``로 짝지어 런 길이를 안 맞췄고, 그 결과 이중 백틱 스팬의
 * 마스킹이 스팬 «중간»에서 끊겨 남은 조각이 인용부호 구간으로 잡혔다
 * (`plans/20260814-cited-noncircular-qa-report.md` V-1 — `DOC-CITATION.md` §3.4의 D-5·B-3
 * 칸이 금지 표기 자체를 예시로 든 다섯 자리가 실물에서 걸렸다).
 *
 * 짝짓기는 CommonMark와 같다 — 왼쪽 런이 열고, 같은 길이의 «첫» 런이 닫는다. 짝이 없는
 * 런은 내용이므로 그대로 두고 다음 런을 여는 후보로 본다.
 */
function maskCodeSpans(text: string): string {
  const runs: TextSpan[] = [];
  for (let at = 0; at < text.length; at++) {
    if (text[at] !== "`") continue;
    let end = at;
    while (end < text.length && text[end] === "`") end++;
    runs.push({ start: at, end });
    at = end - 1;
  }

  const pieces: string[] = [];
  let cursor = 0;
  let index = 0;
  while (index < runs.length) {
    const open = runs[index] as TextSpan;
    const width = open.end - open.start;
    let close = -1;
    for (let scan = index + 1; scan < runs.length; scan++) {
      const candidate = runs[scan] as TextSpan;
      // 줄을 넘으면 짝짓지 않는다 — 위 문단의 «줄 안에서 닫히는 것만»이다.
      if (text.slice(open.end, candidate.start).includes("\n")) break;
      if (candidate.end - candidate.start === width) {
        close = scan;
        break;
      }
    }
    if (close === -1) {
      index++;
      continue;
    }
    const spanEnd = (runs[close] as TextSpan).end;
    pieces.push(text.slice(cursor, open.start), blankOut(text.slice(open.start, spanEnd)));
    cursor = spanEnd;
    index = close + 1;
  }
  pieces.push(text.slice(cursor));
  return pieces.join("");
}

/**
 * 평문 큰따옴표의 **부류** — Q-3. 곧은 것과 곡선 것을 가리지 않는다.
 *
 * **부류는 여는 글자와 닫는 글자에 각각 걸린다**(2026-08-14 정정 · 착수 전 결정 D-1) —
 * 한쪽만 곡선인 혼합 쌍도 인용부호 구간이다. 쌍으로 읽으면 한쪽만 곡선으로 쓰는 도피처가
 * 열리고, 그것은 평문 큰따옴표를 인용부호에 들일 때 닫은 것과 같은 형태다. 문자 클래스로
 * 쓰는 것 자체가 그 계약이다 — 쌍별 패턴으로 쓰면 표기 방식이 계약을 바꾼다.
 *
 * **홑따옴표는 밖이다** — 아포스트로피와 표기가 같아 판정이 문자열 안에서 안 끝난다.
 */
const PLAIN_QUOTE_GLYPH = '["“”]';
const NOT_QUOTE_GLYPH = '[^"“”\\n]';

/**
 * 인용부호 셋의 구간을 원문 좌표계로 뽑는다 — `*"…"*` · «…» · 평문 큰따옴표.
 *
 * **추출 순서가 계약이다.** `*"…"*`를 먼저 잡지 않으면 그 안쪽 평문이 따로 잡혀 한 인용이
 * 두 구간이 된다. 이미 잡힌 구간과 겹치는 후보는 버린다. Q-3의 곡선 변종도 **같은 자리에서
 * 같은 순서로** 받는다 — 부류는 형식을 늘리는 것이 아니라 셋째 형식을 넓힐 뿐이다.
 *
 * **0건은 정상 결과다.** S-6이 정확히 그런 입력을 만든다 — 큰따옴표가 전부 코드 스팬 안이면
 * 옳은 답이 0건이다. 0건을 던짐으로 두면 그 답을 원리적으로 표현할 수 없고, 그것이 S-6의
 * 판정을 재려는 쪽에서는 «구간이 0건임»과 «파서가 죽음»을 뒤바꾼 것이 된다. 파서가 조용히
 * 죽는 것을 막는 것은 아래 `documentQuoteSpans`의 몫이다.
 */
function quoteSpans(doc: string): TextSpan[] {
  const masked = maskCodeSpans(maskCodeFences(doc));
  const spans: TextSpan[] = [];
  for (const source of [
    `\\*${PLAIN_QUOTE_GLYPH}${NOT_QUOTE_GLYPH}*${PLAIN_QUOTE_GLYPH}\\*`,
    "«[^»\\n]*»",
    `${PLAIN_QUOTE_GLYPH}${NOT_QUOTE_GLYPH}*${PLAIN_QUOTE_GLYPH}`,
  ]) {
    for (const match of masked.matchAll(new RegExp(source, "g"))) {
      const start = match.index;
      const end = start + match[0].length;
      if (spans.some((span) => start < span.end && span.start < end)) continue;
      spans.push({ start, end });
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

/**
 * 실물 **문서**에서 인용부호 구간을 뽑는다. 0건이면 `[]`가 아니라 던진다 —
 * `gateForbiddenModules`와 같은 규율이다. 0건을 통과로 읽으면 «표기가 바뀌어 파서가 조용히
 * 죽은 상태»와 «인용이 없는 상태»가 구분되지 않는다.
 *
 * **순수 판정(`quoteSpans`)이 아니라 여기에 두는 이유**는 위 문단이 든다. 한 문서 전체에
 * 인용부호가 1건도 없으면 그것은 파서가 죽은 쪽이 훨씬 그럴듯하지만, 줄 하나에 대해서는
 * 0건이 옳은 답일 수 있다. 규율이 걸릴 자리는 코퍼스를 먹이는 쪽이다.
 */
function documentQuoteSpans(doc: string): TextSpan[] {
  const spans = quoteSpans(doc);
  if (spans.length === 0) throw new Error("문서에서 인용부호 구간을 1건도 뽑지 못했다");
  return spans;
}

/** `span`이 `[start, end)`를 온전히 담는가 */
const covers = (span: TextSpan, start: number, end: number): boolean =>
  span.start <= start && end <= span.end;

/** 줄 하나의 원문 좌표 — 끝 오프셋은 줄바꿈을 포함한다(단위가 문서를 빈틈없이 덮게 한다) */
type LineRecord = { readonly start: number; readonly end: number; readonly text: string };

function lineRecords(doc: string): LineRecord[] {
  const pieces = doc.split("\n");
  const records: LineRecord[] = [];
  let offset = 0;
  for (let index = 0; index < pieces.length; index++) {
    const text = pieces[index] as string;
    const end = offset + text.length + (index < pieces.length - 1 ? 1 : 0);
    records.push({ start: offset, end, text });
    offset = end;
  }
  return records;
}

const BLANK_LINE = /^\s*$/;
const HEADING_LINE = /^#{1,6}\s/;
const LIST_ITEM_LINE = /^\s*(?:[-*+]\s|\d+[.)]\s)/;
const BLOCKQUOTE_LINE = /^\s{0,3}>/;
const TABLE_ROW_LINE = /^\s*\|/;

/** 수평선 단독 줄 — N-2의 잔여 넷 중 하나 */
const THEMATIC_BREAK_LINE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;

/** 표 구분자 행(`| --- | --- |` 꼴) — N-2에 따라 칸으로 가르지 않고 한 줄이 한 단위다 */
const TABLE_DELIMITER_LINE = /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/;

/** 목록 항목의 마커 줄. 1번 그룹이 마커 앞 들여쓰기다 — 형제 판정이 이 폭으로 갈린다 */
const LIST_MARKER_LINE = /^(\s*)(?:[-*+]|\d+[.)])\s/;

/**
 * 들여쓰기를 가리지 않는 펜스 마커. `FENCE_LINE`이 3칸까지만 인정하는 것과 다르다 —
 * 목록 항목 «안»의 펜스는 항목 들여쓰기만큼 더 들어가 있어 그 상한을 넘는다.
 */
const NESTED_FENCE_LINE = /^\s*(`{3,}|~{3,})/;

const indentWidth = (text: string): number => text.length - text.trimStart().length;

/** 새 렌더링 덩어리를 여는 줄인가 — 문단·목록 항목이 여기서 끊긴다 */
const opensBlock = (text: string): boolean =>
  BLANK_LINE.test(text) ||
  HEADING_LINE.test(text) ||
  LIST_ITEM_LINE.test(text) ||
  BLOCKQUOTE_LINE.test(text) ||
  TABLE_ROW_LINE.test(text) ||
  THEMATIC_BREAK_LINE.test(text) ||
  FENCE_LINE.test(text);

/**
 * N-1 — 목록 항목 하나가 자기 «연속»을 어디까지 삼키는가. 마커 줄의 인덱스를 받아
 * **마지막으로 삼킨 줄의 인덱스**를 돌려준다.
 *
 * 삼키는 것은 셋이다.
 * 1. 마커 들여쓰기보다 깊게 들여쓴 줄 — 펜스·표·인용 블록·하위 항목을 가리지 않는다.
 *    N-1이 «목록 항목 안의 코드 펜스는 항목이 단위이고, 하위 항목은 바깥 항목이 단위»다.
 * 2. 그런 줄이 뒤따르는 빈 줄.
 * 3. 새 덩어리를 열지 않는 비들여쓰기 줄(지연 연속).
 *
 * **항목 안에서 펜스가 열리면 닫힐 때까지 들여쓰기를 보지 않는다.** 연속 판정을 들여쓰기로만
 * 하면 펜스 «안»의 얕은 줄에서 항목이 끊기고, 닫는 펜스 줄이 새 펜스의 여는 줄로 읽혀 뒤가
 * 통째로 밀린다. 오늘 실물은 전부 2칸 들여쓰기라 걸리지 않지만 규칙에 든다.
 *
 * **형제 항목은 삼키지 않는다** — 같은(또는 더 얕은) 들여쓰기의 마커 줄에서 끊는다.
 * 형제는 겹침이 아니므로 N-1의 «바깥이 이긴다»가 적용될 자리가 아니다.
 */
function listItemLast(lines: LineRecord[], start: number, baseIndent: number): number {
  let last = start;
  let fence: string | null = null;
  let scan = start + 1;
  while (scan < lines.length) {
    const { text } = lines[scan] as LineRecord;
    if (fence !== null) {
      const close = NESTED_FENCE_LINE.exec(text)?.[1];
      if (close !== undefined && close[0] === fence[0] && close.length >= fence.length) fence = null;
      last = scan;
      scan++;
      continue;
    }
    if (BLANK_LINE.test(text)) {
      let ahead = scan;
      while (ahead < lines.length && BLANK_LINE.test((lines[ahead] as LineRecord).text)) ahead++;
      if (ahead >= lines.length) break;
      if (indentWidth((lines[ahead] as LineRecord).text) <= baseIndent) break;
      // 빈 줄은 `last`를 옮기지 않는다 — 뒤의 깊은 줄이 옮기고, 구간은 연속이라 함께 담긴다.
      scan = ahead;
      continue;
    }
    if (indentWidth(text) > baseIndent) {
      fence = NESTED_FENCE_LINE.exec(text)?.[1] ?? null;
      last = scan;
      scan++;
      continue;
    }
    if (opensBlock(text)) break;
    last = scan;
    scan++;
  }
  return last;
}

/**
 * 표 한 줄을 «칸»까지 가른다. 칸 구분자(`|`)는 앞 칸에 붙여 덮개에 틈이 안 생기게 한다.
 *
 * [미규정] 코드 스팬 안의 `|`는 §3.4가 정하지 않는다. 그 자리는 표를 실제로 깨뜨리므로
 * 문서에 쓰이지 않고, 여기서는 이스케이프한 `\|`만 내용으로 본다.
 */
function pushTableCells(units: TextSpan[], line: LineRecord): void {
  const boundaries = new Set<number>([line.start, line.end]);
  for (let at = 0; at < line.text.length; at++) {
    if (line.text[at] !== "|") continue;
    if (at > 0 && line.text[at - 1] === "\\") continue;
    boundaries.add(line.start + at);
  }
  const sorted = [...boundaries].sort((a, b) => a - b);
  for (let index = 0; index + 1 < sorted.length; index++) {
    units.push({ start: sorted[index] as number, end: sorted[index + 1] as number });
  }
}

/**
 * S-5의 «렌더링 한 덩어리»로 문서를 가른다 — 문단 · 목록 항목 하나 · 표 한 칸 · 인용 블록 ·
 * 코드 펜스. 반환은 원문 좌표계이며 **문서 전체를 빈틈없이, 겹치지 않게 덮는다.**
 *
 * 표를 행이 아니라 칸까지, 목록을 블록이 아니라 항목까지 가르는 것이 S-5의 문면이다.
 * 안 가르면 목록 하나가 통째로 한 단위가 되어 S-4가 빼는 범위가 과도해진다.
 *
 * **겹치면 바깥이 이긴다 — N-1.** 목록 항목 안의 코드 펜스·표·인용 블록·하위 항목은 전부
 * **항목**이 단위이고(`listItemLast`), 인용 블록 안의 표·목록은 **인용 블록**이 단위다.
 * 바깥은 다섯 형태 안에서만 찾는다 — 문서 전체는 형태가 아니다. 그래서 표를 칸까지 가르는
 * 것은 **표가 최상위일 때뿐**이다. 안쪽을 고르면 인용이 항목 텍스트에 있고 원문이 같은 항목
 * 안 펜스에만 있을 때 판정이 통과하는데, 그것이 S-4가 닫는 순환 자신이다.
 *
 * **다섯 형태 어디에도 안 드는 줄은 그 줄 하나가 단위다 — N-2.** 제목 줄 · 빈 줄 ·
 * 수평선 · 표 구분자 행 넷이다. 빈 줄을 묶지 않고 각각 자기 단위로 두는 것도, 수평선을
 * 문단에 붙이지 않는 것도, 표 구분자 행을 칸으로 가르지 않는 것도 이 문면 그대로다.
 * 덮개에 틈이 있으면 그 자리의 히트가 어느 단위에도 안 담겨 조용히 코퍼스에 남는다.
 */
function documentUnits(doc: string): TextSpan[] {
  const lines = lineRecords(doc);
  const units: TextSpan[] = [];
  const push = (from: number, to: number): void => {
    const start = (lines[from] as LineRecord).start;
    const end = (lines[to] as LineRecord).end;
    if (end > start) units.push({ start, end });
  };

  let index = 0;
  while (index < lines.length) {
    const { text } = lines[index] as LineRecord;
    const marker = FENCE_LINE.exec(text)?.[1];
    if (marker !== undefined) {
      let scan = index + 1;
      while (scan < lines.length) {
        const close = FENCE_LINE.exec((lines[scan] as LineRecord).text)?.[1];
        if (close !== undefined && close[0] === marker[0] && close.length >= marker.length) break;
        scan++;
      }
      const last = Math.min(scan, lines.length - 1);
      push(index, last);
      index = last + 1;
      continue;
    }
    // N-2 — 빈 줄은 «묶음»이 아니라 각각이 자기 단위다.
    if (BLANK_LINE.test(text)) {
      push(index, index);
      index++;
      continue;
    }
    // N-2 — 수평선은 뒤 문단에 붙지 않고 자기 단위다.
    if (THEMATIC_BREAK_LINE.test(text)) {
      push(index, index);
      index++;
      continue;
    }
    if (TABLE_ROW_LINE.test(text)) {
      // N-2 — 표 구분자 행은 칸으로 가르지 않는다. 내용이 없어 어느 칸에도 문면이 없다.
      if (TABLE_DELIMITER_LINE.test(text)) push(index, index);
      else pushTableCells(units, lines[index] as LineRecord);
      index++;
      continue;
    }
    if (BLOCKQUOTE_LINE.test(text)) {
      let scan = index;
      while (scan < lines.length && BLOCKQUOTE_LINE.test((lines[scan] as LineRecord).text)) scan++;
      push(index, scan - 1);
      index = scan;
      continue;
    }
    if (HEADING_LINE.test(text)) {
      push(index, index);
      index++;
      continue;
    }
    // N-1 — 목록 항목이 자기 연속(하위 항목·들여쓴 펜스·표·인용 블록)을 전부 삼킨다.
    const listIndent = LIST_MARKER_LINE.exec(text)?.[1];
    if (listIndent !== undefined) {
      const last = listItemLast(lines, index, listIndent.length);
      push(index, last);
      index = last + 1;
      continue;
    }
    let scan = index + 1;
    while (scan < lines.length && !opensBlock((lines[scan] as LineRecord).text)) scan++;
    push(index, scan - 1);
    index = scan;
  }
  return units;
}

describe("DOC-CITATION §3.4 S-5 — 렌더링 단위 분해", () => {
  const assertCovers = (doc: string, units: TextSpan[]): void => {
    expect(units.length).toBeGreaterThan(0);
    expect((units[0] as TextSpan).start).toBe(0);
    expect((units[units.length - 1] as TextSpan).end).toBe(doc.length);
    for (const unit of units) expect(unit.end).toBeGreaterThan(unit.start);
    for (let index = 0; index + 1 < units.length; index++) {
      expect((units[index] as TextSpan).end).toBe((units[index + 1] as TextSpan).start);
    }
  };

  it("S-5 — 단위 분해가 문서를 빈틈없이 덮는다", () => {
    assertCovers(PROVIDERS_DOC, documentUnits(PROVIDERS_DOC));
    assertCovers(SESSION_STORE_DOC, documentUnits(SESSION_STORE_DOC));
  });

  it("S-5 — 표 칸과 목록 항목이 각각 한 단위다", () => {
    const sample = [
      "| 대상 | 근거 |",
      "| --- | --- |",
      "| 첫 칸 | 둘째 칸 |",
      "",
      "- 항목 하나",
      "- 항목 둘",
      "",
    ].join("\n");
    const units = documentUnits(sample);
    assertCovers(sample, units);

    const rendered = units.map((unit) => sample.slice(unit.start, unit.end));
    expect(rendered).toContain("| 첫 칸 ");
    expect(rendered).toContain("| 둘째 칸 ");
    expect(rendered).toContain("- 항목 하나\n");
    expect(rendered).toContain("- 항목 둘\n");
    // 한 단위가 두 칸/두 항목을 함께 담으면 S-4가 빼는 범위가 과도해진다.
    const swallows = (left: string, right: string): boolean =>
      rendered.some((unit) => unit.includes(left) && unit.includes(right));
    expect(swallows("첫 칸", "둘째 칸")).toBe(false);
    expect(swallows("항목 하나", "항목 둘")).toBe(false);
  });

  it("N-1 — 겹치면 바깥 형태가 단위다", () => {
    // ① 목록 항목 안의 펜스는 **항목**이 단위다 — 항목 텍스트와 펜스 내용이 한 문자열에 든다.
    const itemWithFence = [
      "- 항목 텍스트",
      "  ```ts",
      "  const 펜스내용 = 1;",
      "  ```",
      "- 형제 항목",
      "",
    ].join("\n");
    const fenceUnits = documentUnits(itemWithFence).map((unit) =>
      itemWithFence.slice(unit.start, unit.end),
    );
    assertCovers(itemWithFence, documentUnits(itemWithFence));
    const holdsBoth = fenceUnits.filter(
      (unit) => unit.includes("항목 텍스트") && unit.includes("펜스내용"),
    );
    expect(holdsBoth).toHaveLength(1);
    // ③ 형제 항목은 삼켜지지 않는다 — 형제는 겹침이 아니다.
    expect(fenceUnits.some((unit) => unit.includes("항목 텍스트") && unit.includes("형제 항목"))).toBe(
      false,
    );

    // ② 인용 블록 안의 목록·표는 **인용 블록**이 단위다.
    const quoteWithList = ["> - 안쪽 하나", "> - 안쪽 둘", "", "바깥 문단", ""].join("\n");
    const quoteUnits = documentUnits(quoteWithList).map((unit) =>
      quoteWithList.slice(unit.start, unit.end),
    );
    expect(
      quoteUnits.filter((unit) => unit.includes("안쪽 하나") && unit.includes("안쪽 둘")),
    ).toHaveLength(1);

    // ③ 하위 항목은 바깥 항목이 삼킨다.
    const nested = ["- 바깥 항목", "  - 하위 항목", "- 형제 항목", ""].join("\n");
    const nestedUnits = documentUnits(nested).map((unit) => nested.slice(unit.start, unit.end));
    expect(
      nestedUnits.filter((unit) => unit.includes("바깥 항목") && unit.includes("하위 항목")),
    ).toHaveLength(1);
    expect(nestedUnits.some((unit) => unit.includes("바깥 항목") && unit.includes("형제 항목"))).toBe(
      false,
    );
  });

  it("N-2 — 다섯 형태에 안 드는 줄은 그 줄이 단위다", () => {
    const sample = ["| 머리 | 칸 |", "| --- | --- |", "", "", "---", "다음 문단", ""].join("\n");
    const units = documentUnits(sample);
    assertCovers(sample, units);
    const rendered = units.map((unit) => sample.slice(unit.start, unit.end));

    // 표 구분자 행은 칸으로 갈리지 않고 한 줄이 한 단위다.
    expect(rendered).toContain("| --- | --- |\n");
    // 수평선은 뒤 문단에 붙지 않는다.
    expect(rendered).toContain("---\n");
    expect(rendered).toContain("다음 문단\n");
    // 빈 줄 둘이 두 단위다 — 묶지 않는다.
    expect(rendered.filter((unit) => unit === "\n")).toHaveLength(2);
  });

  it("N-1 실물 — 항목 안 펜스가 항목과 한 단위다", () => {
    // `docs/*.md` 전량에서 «목록 항목 안의 코드 펜스»는 이 한 자리다
    // (2026-08-14 실측 — `DOC-CITATION.md` §3.4 N-1~N-4 문단의 소급 폭). 합성 표본과 따로
    // 고정하는 이유는 실물의 연속 형태가 «마커 줄 → 빈 줄 → 들여쓴 펜스»라 합성 표본과
    // 다르기 때문이다.
    const units = documentUnits(APPROVAL_GATE_DOC).map((unit) =>
      APPROVAL_GATE_DOC.slice(unit.start, unit.end),
    );
    const marker = "프로필은 `contentParam`을 갖는다";
    const inFence = '| { kind: "memoryWrite"; contentParam: string }';
    expect(APPROVAL_GATE_DOC).toContain(marker);
    expect(APPROVAL_GATE_DOC).toContain(inFence);
    expect(units.filter((unit) => unit.includes(marker) && unit.includes(inFence))).toHaveLength(1);
  });
});

describe("DOC-CITATION §3.4 S-6 — 인용부호 구간 추출", () => {
  it("문서에서 인용부호 구간을 1건도 못 뽑으면 던진다", () => {
    // 실물에서는 뽑힌다. 안 뽑히는 입력에서 `[]`로 조용히 통과하지 않는 것이 계약이다.
    expect(documentQuoteSpans(PROVIDERS_DOC).length).toBeGreaterThan(0);
    expect(() => documentQuoteSpans("인용부호가 하나도 없는 문서다.")).toThrow(/1건도 뽑지 못했다/);
    // 순수 판정 쪽은 0건을 값으로 낸다 — S-6이 그 답이 옳은 입력을 만들기 때문이다.
    expect(quoteSpans("인용부호가 하나도 없는 문서다.")).toEqual([]);
  });

  it("S-6 — 이중 백틱 코드 스팬도 통째로 지워진다 (여는 런 ↔ 닫는 런 길이)", () => {
    // S-6의 술어는 백틱 쌍 안인가이고 개수를 가르지 않는다. 이중 백틱 스팬이 홑 백틱을
    // 담는 형태(`DOC-CITATION.md` §3.4 D-5·B-3 칸의 금지 표기 예시)가 실물 코퍼스에 있고,
    // 런 길이를 안 맞추면 마스킹이 스팬 중간에서 끊겨 남은 조각이 인용부호로 잡힌다.
    expect(quoteSpans('금지 표기는 `` `**"표본 문면"**` ``이다.')).toEqual([]);
    expect(quoteSpans("금지 표기는 `` `**«표본 문면»**` ``이다.")).toEqual([]);

    // 역검증 — 런 길이를 안 맞추는 옛 짝짓기는 같은 입력에서 유령 구간을 낸다.
    const looselyMasked = '금지 표기는 `` `**"표본 문면"**` ``이다.'.replace(
      /`+[^`\n]*`+/g,
      blankOut,
    );
    expect([...looselyMasked.matchAll(/"[^"\n]*"/g)].length).toBeGreaterThan(0);

    // 그러면서 홑 백틱 스팬 바깥의 산문 인용은 그대로 잡힌다.
    expect(quoteSpans('`a` 뒤의 "진짜 인용"이다.')).toHaveLength(1);
    // 짝이 없는 런은 내용이므로 다음 런이 여는 후보가 된다 — 백틱 하나가 줄을 삼키지 않는다.
    expect(quoteSpans('``짝 없는 런 뒤의 `a` 와 "진짜 인용"이다.')).toHaveLength(1);
  });

  it("S-6 — 코드 스팬 안의 큰따옴표는 인용부호가 아니다", () => {
    const spans = quoteSpans(PROVIDERS_DOC);
    const spanCovering = (needle: string): TextSpan | undefined => {
      const at = PROVIDERS_DOC.indexOf(needle);
      expect(at, `표본 문면 ${needle}이 PROVIDERS.md에 없다`).toBeGreaterThan(-1);
      return spans.find((span) => covers(span, at, at + needle.length));
    };

    // 코드 스팬 안 — §2 표의 `stopReason: "max_tokens"`, §2.1 인용 블록의 `import "https"`.
    expect(spanCovering('"max_tokens"')).toBeUndefined();
    expect(spanCovering('"https"')).toBeUndefined();
    // 같은 문서의 평문 큰따옴표는 잡힌다 — 위 둘이 «큰따옴표를 통째로 못 본다»가 아님을 고정한다.
    expect(spanCovering('"시크릿 자가 읽기"')).toBeDefined();

    // 코드 펜스 — 그 안의 백틱·큰따옴표가 구간 경계를 흔들지 않는다.
    const fenceStart = PROVIDERS_DOC.indexOf("```typescript");
    const fenceEnd = PROVIDERS_DOC.indexOf("\n```", fenceStart) + "\n```".length;
    expect(fenceStart).toBeGreaterThan(-1);
    expect(spans.some((span) => span.start < fenceEnd && fenceStart < span.end)).toBe(false);

    // 펜스를 먼저 지우지 않으면 아래가 갈린다 — 펜스 안 백틱이 인라인 쌍으로 짝지어진다.
    const sample = [
      "```ts",
      'const a = `x`; // "펜스 안"',
      "```",
      "",
      "본문이 «진짜 인용»을 든다.",
    ].join("\n");
    const sampleSpans = quoteSpans(sample);
    expect(sampleSpans.length).toBe(1);
    const only = sampleSpans[0] as TextSpan;
    expect(sample.slice(only.start, only.end)).toBe("«진짜 인용»");
  });

  it("Q-3 — 평문 큰따옴표는 곧은 것과 곡선 것을 안 가른다", () => {
    // ① 곡선으로 감싼 문면이 구간 1건이다.
    const curved = "본문이 “곡선 인용”을 든다.";
    const curvedSpans = quoteSpans(curved);
    expect(curvedSpans).toHaveLength(1);
    expect(curved.slice((curvedSpans[0] as TextSpan).start, (curvedSpans[0] as TextSpan).end)).toBe(
      "“곡선 인용”",
    );

    // ② 홑따옴표·아포스트로피는 구간이 아니다 — 아포스트로피와 표기가 같아 판정이
    //    문자열 안에서 안 끝난다.
    expect(quoteSpans("본문이 '홑따옴표'와 ‘곡선 홑’을 든다. don't.")).toEqual([]);

    // ③ 곡선 따옴표가 코드 스팬 안이면 구간이 아니다 — Q-1이 먼저 걸린다.
    expect(quoteSpans('설정은 `stopReason: “max_tokens”` 이다.')).toEqual([]);
    expect(quoteSpans("```ts\nconst a = “펜스 안”;\n```\n")).toEqual([]);

    // ④ D-1 — 부류는 여는 글자와 닫는 글자에 «각각» 걸린다. 혼합 쌍도 구간이다.
    const mixed = '여는 것은 "곧은데 닫는 것은 곡선”이다.';
    expect(quoteSpans(mixed)).toHaveLength(1);
    expect(mixed.slice((quoteSpans(mixed)[0] as TextSpan).start)).toContain("곧은데 닫는 것은 곡선");
    // 이탤릭 형식도 같은 부류를 받는다 — 형식이 셋에서 늘지 않는다.
    expect(quoteSpans('그 절이 *“이탤릭 곡선”*이라 적었다.')).toHaveLength(1);

    // ⑤ 실물 — 이 변경으로 `PROVIDERS.md`의 구간 수가 늘지 않는다(곡선 실물 0건).
    expect(PROVIDERS_DOC).not.toMatch(/[“”]/);
  });

  it("역검증 — 곧은 따옴표만 보는 옛 추출은 곡선 인용을 놓친다", () => {
    // 통과만 확인하는 검사로 퇴화하지 않도록 «구멍이 실재했음»과 «닫혔음»을 한 자리에 둔다.
    // 합성 표본으로만 돈다 — `docs/*.md`에 표본을 넣으면 S-4의 코퍼스가 오염된다.
    const curved = "본문이 “곡선 인용”을 든다.";
    const mixed = '본문이 "혼합 쌍”도 든다.';

    // 새 추출 — Q-3의 부류로 둘 다 잡는다.
    expect(quoteSpans(curved)).toHaveLength(1);
    expect(quoteSpans(mixed)).toHaveLength(1);

    // 옛 추출 — 곧은 글자만 보는 패턴은 같은 표본에서 0건이다.
    const legacyPlain = /"[^"\n]*"/g;
    expect([...curved.matchAll(legacyPlain)]).toHaveLength(0);
    expect([...mixed.matchAll(legacyPlain)]).toHaveLength(0);
  });

  it("추출 순서 — 이탤릭 인용의 안쪽 평문이 따로 잡히지 않는다", () => {
    const sample = '그 절이 *"등록 계약은 코어 설계의 일부로 여기서 확정한다"*고 명시했다.';
    const spans = quoteSpans(sample);
    expect(spans.length).toBe(1);
    const only = spans[0] as TextSpan;
    expect(sample.slice(only.start, only.end)).toBe(
      '*"등록 계약은 코어 설계의 일부로 여기서 확정한다"*',
    );
  });
});

describe("PROVIDERS §2.1 금지 모듈 ↔ 예산 게이트 `providers` 항", () => {
  /**
   * §2.1의 문면. **문서가 정본이므로 기대값은 여기서만 나온다.**
   * §2.1이 든 표기 규칙(«표기는 게이트 키 형태(`node:` 접두)로 쓴다»)이 참이면 문서에서
   * 뽑은 문자열이 게이트 키와 **그대로** 같아야 한다 — 정규화 없이 대조하는 이유다.
   */
  const documented = (): string[] => {
    const line = PROVIDERS_DOC.split("\n").find((candidate) =>
      candidate.startsWith("**금지 모듈**:"),
    );
    if (line === undefined) throw new Error("§2.1의 금지 모듈 줄을 찾지 못했다");
    return backticked(line).sort();
  };

  it("집합이 같다", () => {
    expect(gateForbiddenModules("providers")).toEqual(documented());
  });

  it("문서 표기가 전부 게이트 키 형태(`node:` 접두)다", () => {
    // §2.1의 표기 규칙 자체가 계약이다. 접두가 빠진 항목은 게이트 키와 «다른 문자열»이라
    // 위 집합 대조가 통과해도 사람이 눈으로 맞춰야 하는 상태로 되돌아간다.
    for (const module of documented()) {
      expect(module.startsWith("node:"), `§2.1의 \`${module}\`에 node: 접두가 없다`).toBe(true);
    }
  });

  it("검사기가 어긋남을 실제로 잡는다 (역검증)", () => {
    // 위 두 검사가 통과만 확인하는 형태로 퇴화하지 않았음을 표본으로 고정한다.
    const injected = BUDGET_GATE.replace('      "node:dns",\n', "");
    const parsed = gateForbiddenModules("providers", injected);
    expect(parsed).not.toContain("node:dns");
    expect(parsed).not.toEqual(documented());
  });
});

describe("SESSION-STORE §1 금지 목록 ↔ 예산 게이트 `store` 항", () => {
  /**
   * §1의 문면은 맨 이름(`child_process`·`net`…)이고 게이트 키는 `node:` 접두다.
   * `PROVIDERS.md` §2.1은 2026-08-14에 표기를 게이트 키로 통일했으나 이 문서는 그 범위
   * 밖이었으므로(플랜 §8 결정 2), 여기서는 접두를 붙여 대조한다. **이 정규화가 필요한
   * 것 자체가 «문서↔게이트 대조가 눈으로만 된다»는 상태의 잔존이다.**
   */
  const documented = (): string[] => {
    const line = SESSION_STORE_DOC.split("\n").find((candidate) =>
      candidate.includes("store가 임포트하지 않는 모듈"),
    );
    if (line === undefined) throw new Error("§1의 금지 목록 줄을 찾지 못했다");
    // **열거는 첫 마침표에서 끝난다.** 같은 줄 뒤쪽이 «`node:fs`는 허용한다»를 들고
    // 있어서, 줄 전체의 백틱을 걷으면 허용 모듈이 금지 목록으로 섞여 들어온다
    // (이 파서의 초판이 실제로 그렇게 틀렸다).
    const enumeration = /임포트하지 않는 모듈:([^.]*)\./.exec(line);
    if (enumeration === null) throw new Error("§1의 금지 열거 구간을 끊지 못했다");
    const modules = backticked(enumeration[1] as string).map((module) =>
      module.startsWith("node:") ? module : `node:${module}`,
    );
    if (modules.length === 0) throw new Error("§1의 금지 열거에서 모듈을 1건도 뽑지 못했다");
    return modules.sort();
  };

  it("문서가 든 금지 모듈이 전부 게이트에 있다", () => {
    const gate = gateForbiddenModules("store");
    for (const module of documented()) {
      expect(gate, `SESSION-STORE §1의 ${module}이 게이트 store 항에 없다`).toContain(module);
    }
  });

  it("`node:fs`·`node:sqlite`는 금지되지 않는다 — store의 본업이다", () => {
    // §1: «`node:fs`는 허용한다 — 디렉터리 생성과 권한 확인에 필요하다» · 의존성 줄이
    // `node:sqlite`(내장)를 든다. 게이트를 넓히다 본업을 막는 회귀를 여기서 고정한다.
    const gate = gateForbiddenModules("store");
    expect(gate).not.toContain("node:fs");
    expect(gate).not.toContain("node:sqlite");
  });

  it("검사기가 누락을 실제로 잡는다 (역검증)", () => {
    // T-004가 처분한 형태가 «문서가 든 `dns`를 게이트가 안 든다»였다. 그 형태를 표본으로
    // 재현해, 이 대조가 통과만 확인하는 검사로 퇴화하지 않았음을 고정한다.
    const injected = gateForbiddenModules("store").filter((module) => module !== "node:dns");
    expect(documented()).toContain("node:dns");
    expect(injected).not.toContain("node:dns");
  });

  it("게이트가 문서보다 넓은 항에는 근거 주석이 있다", () => {
    // 문서에 없는 금지를 게이트가 들면, 근거가 없는 한 다음 감사가 «게이트가 틀렸다»와
    // «문서가 낡았다» 중 어느 쪽인지 알 수 없다. store 항은 `dgram`·`worker_threads`가
    // 그 자리다.
    const entry = /name:\s*"store"[\s\S]*?forbiddenModules:/.exec(BUDGET_GATE)?.[0] ?? "";
    const wider = gateForbiddenModules("store").filter((m) => !documented().includes(m));
    expect(wider.sort()).toEqual(["node:dgram", "node:worker_threads"]);
    for (const module of wider) {
      expect(entry, `${module}이 문서 밖 금지인데 주석이 그것을 밝히지 않는다`).toContain(
        module.replace("node:", ""),
      );
    }
  });
});

describe("PROVIDERS §2.2 `AnthropicClientConfig` 블록 ↔ `client.ts`", () => {
  const docFields = (): { name: string; optional: boolean }[] =>
    interfaceFields(interfaceBody(PROVIDERS_DOC, "AnthropicClientConfig"));
  const srcFields = (): { name: string; optional: boolean }[] =>
    interfaceFields(interfaceBody(CLIENT_SRC, "AnthropicClientConfig"));

  it("필드 이름과 선택성이 1:1이다", () => {
    const key = (field: { name: string; optional: boolean }) =>
      `${field.name}${field.optional ? "?" : ""}`;
    expect(docFields().map(key).sort()).toEqual(srcFields().map(key).sort());
  });

  it("§2.2가 «유일한 입구»라 부르는 필드가 `apiKey`이고 필수다", () => {
    // 블록이 §2.2의 «유일한 입구» 주장의 근거이므로, `apiKey`가 선택 필드가 되면 그
    // 주장이 무너진다 — SDK의 환경 변수 폴백이 열리기 때문이다.
    expect(srcFields()).toContainEqual({ name: "apiKey", optional: false });
    expect(docFields()).toContainEqual({ name: "apiKey", optional: false });
  });

  it("검사기가 필드 누락을 실제로 잡는다 (역검증)", () => {
    // D-1이 정확히 «문서 블록에 필드 하나가 없다»는 형태였다. 그 형태를 표본으로 재현한다.
    const stripped = interfaceBody(PROVIDERS_DOC, "AnthropicClientConfig")
      .split("\n")
      .filter((line) => !line.includes("fetch?"))
      .join("\n");
    expect(interfaceFields(stripped).map((f) => f.name)).not.toContain("fetch");
    expect(interfaceFields(stripped).length).toBe(srcFields().length - 1);
  });
});

describe("DOC-CITATION U-1 — 이 사이클이 들여온 인용의 문면 일치", () => {
  /**
   * 대상은 `PROVIDERS.md` §2.2가 **§2.1을 지목하며** 인용부호로 감싼 문면이다.
   * U-1: «인용부호로 감싼 문면은 대상 문서에 문자 그대로 존재하는 부분 문자열이어야 한다».
   * D-6에 따라 이 규칙은 `docs/*.md` 안에 쓰인 인용에 걸리므로 대상 자리가 맞다.
   *
   * **처분됨 (2026-08-14).** 이 절은 T-008이 red로 제출했고, §2.2가 «네트워크는 SDK를
   * 경유한다»로 종결형 의역을 하고 있었다. 처분은 **인용부호를 벗겨 서술로 바꾸는 것**이었고
   * (§2.1의 원문은 «…경유하고, 그 밖의 I/O는…»이라 종결형 부분 문자열이 존재하지 않는다),
   * 그래서 그 항목은 목록에서 빠졌다 — 인용이 사라졌으므로 대조할 대상이 없다.
   *
   * **이 절이 재지 못하는 것은 파일 머리의 «한계 다섯»이 든다** — 손으로 유지되는 목록은
   * 그중 넷째다. 여기에 다시 적지 않는다: 두 자리에 같은 목록을 두면 어느 쪽이 최신인지 알
   * 수 없어져 둘 다 신뢰를 잃는다.
   */
  /** 판정 결과. 닫힌 유니온이라 «어느 갈래로 깨졌나»가 타입에서 사라지지 않는다 */
  type CitedVerdict =
    | { readonly kind: "ok"; readonly outside: number }
    | { readonly kind: "absent" }
    | { readonly kind: "citing-only"; readonly occurrences: number };

  /** `quote`의 모든 출현을 원문 좌표계로 — 겹치지 않게 센다 */
  const occurrencesOf = (doc: string, quote: string): TextSpan[] => {
    const found: TextSpan[] = [];
    let at = doc.indexOf(quote);
    while (at !== -1) {
      found.push({ start: at, end: at + quote.length });
      at = doc.indexOf(quote, at + quote.length);
    }
    return found;
  };

  /**
   * S-4의 «인용하는 단위 자신은 뺀다»를 그대로 옮긴다. 세 단계다.
   *
   * 1. `quote`의 모든 출현을 **원문에서** 찾는다(마스킹된 텍스트가 아니다).
   * 2. **인용하는 단위**를 정한다 — 어느 인용부호 구간 안에 든 출현을 담은 단위. 복수면 전부.
   * 3. **그 단위들 밖의** 출현을 센다. 1건 이상이면 원문이 따로 있다.
   *
   * **빼는 것은 단위이지 인용부호 구간이 아니다.** 구간만 빼면 인용과 같은 문단에 원문을
   * 한 번 더 적는 것으로 자기 증거가 서고, 그것이 S-4가 닫는 순환이다. 반대로 이 `quote`를
   * 인용부호로 담지 않은 단위는 그 안에 다른 인용부호 구간이 있어도 코퍼스로 남는다.
   *
   * **여럿이면 전부 뺀다 — N-3.** 같은 문면을 인용부호로 담은 단위가 여럿일 때 어느 자리가
   * 인용의 주인인지 묻지 않는다. 판정 대상은 문면이지 자리가 아니고, 주인을 고르는 것은
   * 의도 판정이라 §3.4가 하지 않기로 한 것이다(S-1이 쓴 수를 그대로 쓴다). 하나만 빼면
   * **인용 자리가 둘이 되고 원문이 사라진 문서가 통과한다** — 아래 역검증이 그 형태다.
   *
   * **배제 사유는 인용부호뿐이다 — N-4.** S-7이 든 나머지 두 표기(백틱 코드 스팬 · 머리 필드
   * 값)로 문면을 든 단위는 코퍼스에 남는다. 그 둘은 **원문 자신이 쓰는 표기**이므로 배제
   * 사유로 삼으면 필드 값 인용이 원리적으로 대조 불가능해진다. 그래서 아래 `citing` 판정은
   * `spans`(인용부호 구간)만 보고 백틱 스팬은 보지 않는다 — 그것이 이 코드에서 N-4다.
   */
  const citedVerdict = (quote: string, doc: string = PROVIDERS_DOC): CitedVerdict => {
    const found = occurrencesOf(doc, quote);
    if (found.length === 0) return { kind: "absent" };
    const spans = documentQuoteSpans(doc);
    const units = documentUnits(doc);
    const citing = units.filter((unit) =>
      found.some(
        (hit) =>
          covers(unit, hit.start, hit.end) &&
          spans.some((span) => covers(span, hit.start, hit.end)),
      ),
    );
    const outside = found.filter((hit) => !citing.some((unit) => covers(unit, hit.start, hit.end)));
    if (outside.length === 0) return { kind: "citing-only", occurrences: found.length };
    return { kind: "ok", outside: outside.length };
  };

  /**
   * 실패 메시지는 두 갈래다 — «문면이 없다»와 «원문이 사라졌다»는 고칠 곳이 다르다.
   * 메시지는 이 파일이 실제로 재는 범위만 주장한다: 코퍼스가 `PROVIDERS.md` 한 파일이므로
   * 부재를 U-1 위반이라 단정하지 않는다.
   */
  const citedFailure = (quote: string, verdict: Exclude<CitedVerdict, { kind: "ok" }>): string =>
    verdict.kind === "absent"
      ? `«${quote}»의 문면이 PROVIDERS.md에 없다 — 이 파일의 코퍼스는 그 한 파일뿐이라 U-1 위반이라 단정하지 않는다 (S-4의 코퍼스는 더 넓다)`
      : `«${quote}»가 인용하는 단위 밖에 하나도 없다 — 원문이 사라지고 인용 자리만 ${verdict.occurrences}건 남았다`;

  const cited = (quote: string): void => {
    const verdict = citedVerdict(quote);
    if (verdict.kind === "ok") {
      expect(verdict.outside).toBeGreaterThan(0);
      return;
    }
    expect(verdict.kind, citedFailure(quote, verdict)).toBe("ok");
  };

  it("«스스로 크리덴셜을 읽지 않는다» — §2.2 자기 문면", () => {
    cited("스스로 크리덴셜을 읽지 않는다");
  });

  it("«유일한 입구» — §2.2 코드블록 주석", () => {
    cited("유일한 입구");
  });

  it("S-4 — 빼는 것은 인용하는 단위이지 인용부호 구간 전부가 아니다", () => {
    // ① 인용과 같은 단위 안의 원문은 코퍼스가 아니다 — 구간만 빼면 이것이 통과한다.
    const selfEvidence = [
      "# 표본",
      "",
      "`대상.md` §1이 «표본 문면»이라 적었고, 이 문단은 표본 문면을 그대로 다시 쓴다.",
      "",
    ].join("\n");
    expect(citedVerdict("표본 문면", selfEvidence).kind).toBe("citing-only");

    // ② 다른 단위의 원문은 코퍼스다.
    const separateUnit = [
      "# 표본",
      "",
      "**표본 문면**은 이 문단이 원문으로 든다.",
      "",
      "`대상.md` §1이 «표본 문면»이라 적었다.",
      "",
    ].join("\n");
    expect(citedVerdict("표본 문면", separateUnit)).toEqual({ kind: "ok", outside: 1 });

    // ③ 그 단위에 **다른** 인용부호 구간이 있어도 빼지 않는다 — 빼는 기준은 이 문면이
    //    인용부호 안에 들었는가이지 단위가 인용부호를 품었는가가 아니다.
    const otherQuoteNearby = [
      "# 표본",
      "",
      "이 문단은 «다른 조어»를 쓰면서 표본 문면을 원문으로 든다.",
      "",
      "`대상.md` §1이 «표본 문면»이라 적었다.",
      "",
    ].join("\n");
    expect(citedVerdict("표본 문면", otherQuoteNearby)).toEqual({ kind: "ok", outside: 1 });
  });

  it("실패 메시지가 두 갈래를 구분한다", () => {
    const failureOf = (quote: string, doc: string): string => {
      const verdict = citedVerdict(quote, doc);
      if (verdict.kind === "ok") throw new Error(`${quote}가 이 표본에서 통과했다 — 표본이 틀렸다`);
      return citedFailure(quote, verdict);
    };

    const absent = failureOf("이 표본 어디에도 없는 문면", "본문이 «어떤 인용»을 든다.\n");
    const citingOnly = failureOf(
      "표본 문면",
      [
        "`대상.md` §1이 «표본 문면»이라 적었다.",
        "",
        "`대상.md` §2도 «표본 문면»을 인용한다.",
        "",
      ].join("\n"),
    );

    expect(absent).not.toBe(citingOnly);
    expect(absent).toContain("단정하지 않는다");
    expect(citingOnly).toContain("원문이 사라지고");
    expect(citingOnly).not.toContain("단정하지 않는다");
  });

  // 이름에 `+`를 쓰지 않는다 — `vitest -t`는 이름을 정규식으로 읽으므로 `+`가 든 이름은
  // 자기 자신을 1건도 고르지 못한다(플랜 §9 E-4가 요구한 «검증 조건 = 실행 명령»이 깨진다).
  it("검사기가 «원문 소실과 인용 자리 둘»을 실제로 잡는다", () => {
    // **합성 문자열이다.** `PROVIDERS.md`를 고쳐 표본을 만들지 않는다 — 고치는 순간 S-4의
    // 코퍼스가 오염되어 이 검사가 자기가 만든 자국을 증거로 읽는다.
    const sample = [
      "# 표본 — 원문이 사라지고 인용 자리만 둘 남았다",
      "",
      "`대상.md` §1이 «사라진 원문»이라고 적었다.",
      "",
      "`대상.md` §2도 «사라진 원문»을 인용한다.",
      "",
    ].join("\n");

    // 새 형태 — 인용하는 단위 밖 히트가 0이므로 red다.
    expect(citedVerdict("사라진 원문", sample)).toEqual({ kind: "citing-only", occurrences: 2 });

    // 옛 형태(히트 총수 > 1) — **같은 표본이 통과한다.** 구멍이 실재했다는 것과 닫혔다는 것을
    // 한 자리에서 보인다.
    expect(sample.split("사라진 원문").length - 1).toBeGreaterThan(1);
  });

  it("역검증 — 안쪽이 이기는 옛 분해에서는 자기 증거가 통과한다", () => {
    // **이음매를 여기서 고정한다.** `citedVerdict`는 분해를 주입받지 않으므로 옛 분해를
    // 먹일 수 없다. 그래서 판정 로직을 국소 재구현하고 **분해 함수만 갈아 끼운다** —
    // 재구현이 대상 판정과 어긋나면 역검증이 무의미하므로, 같은 표본에서
    // «새 분해로 부른 국소 판정 = 대상 `citedVerdict`»임을 아래에서 함께 단언한다.
    const verdictWith = (
      decompose: (doc: string) => TextSpan[],
      quote: string,
      doc: string,
    ): CitedVerdict => {
      const found = occurrencesOf(doc, quote);
      if (found.length === 0) return { kind: "absent" };
      const spans = documentQuoteSpans(doc);
      const citing = decompose(doc).filter((unit) =>
        found.some(
          (hit) =>
            covers(unit, hit.start, hit.end) &&
            spans.some((span) => covers(span, hit.start, hit.end)),
        ),
      );
      const outside = found.filter(
        (hit) => !citing.some((unit) => covers(unit, hit.start, hit.end)),
      );
      return outside.length === 0
        ? { kind: "citing-only", occurrences: found.length }
        : { kind: "ok", outside: outside.length };
    };

    /** 옛 읽기 — 겹치면 «안쪽»이 이긴다. 펜스 줄이 무조건 새 덩어리를 열어 항목을 쪼갠다 */
    const innerWinsUnits = (doc: string): TextSpan[] => {
      const lines = lineRecords(doc);
      const units: TextSpan[] = [];
      const push = (from: number, to: number): void => {
        const start = (lines[from] as LineRecord).start;
        const end = (lines[to] as LineRecord).end;
        if (end > start) units.push({ start, end });
      };
      let index = 0;
      while (index < lines.length) {
        const { text } = lines[index] as LineRecord;
        const marker = FENCE_LINE.exec(text)?.[1];
        if (marker !== undefined) {
          let scan = index + 1;
          while (scan < lines.length) {
            const close = FENCE_LINE.exec((lines[scan] as LineRecord).text)?.[1];
            if (close !== undefined && close[0] === marker[0] && close.length >= marker.length)
              break;
            scan++;
          }
          const last = Math.min(scan, lines.length - 1);
          push(index, last);
          index = last + 1;
          continue;
        }
        let scan = index + 1;
        while (scan < lines.length && !opensBlock((lines[scan] as LineRecord).text)) scan++;
        push(index, scan - 1);
        index = scan;
      }
      return units;
    };

    // 인용은 항목 텍스트에 있고 원문은 **같은 항목 안에 중첩된 펜스**에만 있다.
    const sample = [
      "- `대상.md` §1이 «표본 문면»이라 적었다",
      "  ```ts",
      "  // 표본 문면",
      "  ```",
      "- 다른 항목",
      "",
    ].join("\n");

    // ① 새 분해(N-1: 바깥이 이긴다) — 항목이 펜스를 삼키므로 자기 증거를 거부한다.
    expect(verdictWith(documentUnits, "표본 문면", sample)).toEqual({
      kind: "citing-only",
      occurrences: 2,
    });
    // 이음매 — 국소 판정이 대상 판정과 같다.
    expect(verdictWith(documentUnits, "표본 문면", sample)).toEqual(
      citedVerdict("표본 문면", sample),
    );

    // ② 옛 분해(안쪽이 이긴다) — **같은 표본이 통과한다.** 구멍이 실재했다는 것과 닫혔다는
    //    것이 한 자리에 있다.
    expect(verdictWith(innerWinsUnits, "표본 문면", sample)).toEqual({ kind: "ok", outside: 1 });
  });

  it("머리 주석이 판정 방식의 한계 다섯을 전부 든다", () => {
    // `K-069`가 지적한 결함은 «머리가 실제보다 넓게 주장하는 것»이다. 판정 방식이 바뀌면
    // 주석이 낡고, 낡은 주석은 다음 감사가 이 파일을 실물보다 강하게 읽게 만든다.
    //
    // **이름의 수가 일곱에서 다섯으로 바뀐 것이 이번 처분이다.** §3.4가 N-2·N-3으로 임의
    // 선택 둘을 계약으로 흡수했으므로 그 둘은 «임의로 고른 자리»가 아니다. 이름의 수가
    // 실물과 어긋나면 그것이 이 검사가 잡으려는 부패와 같은 것이므로 이름도 함께 옮긴다.
    //
    // 이 주석은 미규정 표시를 **대괄호 표기 그대로** 쓰지 않는다. 그 표기가 곧 열거의
    // 표지라 산문에서 언급하기만 해도 한 건으로 세어진다 — `DOC-CITATION.md` §3.3이 숫자에
    // 대해 든 자기오염과 같은 자리이고, 처방도 같다(표기를 재현하지 않는다).
    const end = SELF_SOURCE.indexOf("*/");
    if (end === -1) throw new Error("파일 머리 주석을 찾지 못했다");
    const header = SELF_SOURCE.slice(0, end);

    for (const limit of [
      // 옮기면서 좁아진 자리 — 넷
      "코퍼스가 `PROVIDERS.md` 한 파일이다",
      "D-2의 공백 정규화를 하지 않는다",
      "인용 구간 판별이 표기 기반이다",
      "인용 목록이 손으로 유지된다",
      // §3.4가 정하지 않아 임의로 고른 자리 — 하나. 본문 미규정 표시의 첫 낱말들과 같은
      // 문면이라야 한다: `cited-noncircular.qa.test.ts`가 본문에서 그것을 뽑아 머리와 대조한다.
      "코드 스팬 안의 `|`",
    ]) {
      expect(header, `머리 주석이 한계 «${limit}»을 들지 않는다`).toContain(limit);
    }
    // 흡수된 둘이 «임의로 고른 자리»로 다시 실리지 않는다 — 계약이 정한 것은 한계가 아니다.
    expect(header).not.toContain("임의로 고른 자리 — 셋");
    for (const rule of ["S-4", "S-5", "S-6", "N-1", "N-2", "N-3", "N-4", "Q-1", "Q-2", "Q-3"]) {
      expect(header, `머리 주석이 §3.4 ${rule}을 지목하지 않는다`).toContain(rule);
    }
    expect(header).toContain("`DOC-CITATION.md` §4");
  });

  it("의역이 다시 들어오지 않는다 — §2.1의 종결형 변형", () => {
    // 처분된 위반의 재발 방어. 이 문자열은 §2.1 원문에 없으므로 문서 어디에도
    // 나타나서는 안 된다 — 나타나면 누군가 다시 종결형으로 의역한 것이다.
    expect(PROVIDERS_DOC).not.toContain("네트워크는 SDK를 경유한다");
  });
});
