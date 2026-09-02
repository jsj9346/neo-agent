/**
 * 그리기 층과 부트의 **배치** 계약 테스트 — 정본은 `docs/WEB-UI.md` §9.6이다.
 *
 * **기대값은 구현이 아니라 그 절에서만 도출했다.** 아래 축이 금지하는 표기(마크업 통로 ·
 * 부분 갱신 · DOM 전역 · 읽는 자리에 쓰기 · 앵커 이름의 재기입)는 전부 §9.6의
 * 결정 2·3·7·8·9·10·11·12 문면에서 왔고, `render.js`·`main.js`를 읽어 «오늘 무엇을 안 하고
 * 있나»를 옮겨 적은 자리는 없다.
 *
 *   - **결정 2** — *"그래서 앵커가 방향으로 셋으로 갈린다"*. 내용을 쓰는 자리 ·
 *     **읽는 자리**(`composer-input`) · 사건을 내는 자리로 갈리고, 그리기가 읽는 자리에
 *     쓰면 사용자가 친 것이 조용히 사라진다
 *   - **결정 3** — *"접기의 입력 알파벳은 하나이고 판별자로 닫는다."* 콜백 집합이 전부
 *     한 알파벳으로 옮겨지고, *"콜백마다 따로 그리면 **그리는 자리가 다섯이 되고**"* 그
 *     성립이 멈춘다 — 기각된 갈래가 *"콜백 다섯이 각자 자기 앵커를 그린다"*다
 *   - **결정 7** — *"리스너를 항목마다 달지 않는다"*, *"위임은 컨테이너가 앵커라는 사실에서
 *     공짜로 나온다"*
 *   - **결정 8** — *"그리기는 전량 재구성이다 — 부분 갱신을 두지 않는다"*,
 *     *"쓰는 자리의 내용은 매번 통째로 다시 짓는다"*
 *   - **결정 9** — *"배선이 마크업을 짓지 않는다"*, *"노드는 만들되 문자열을 HTML로
 *     해석시키지 않는다"*
 *   - **결정 10** — *"DOM 전역에 닿는 자리는 부트 하나이고, 나머지는 인자로 받는다"*
 *   - **결정 11** — *"부트가 쓰는 앵커를 한 번에 연다."*, *"부트가 여는 이름의 집합이 위 범위
 *     표의 기계 판이다."* 그래서 부트가 앵커 이름을 리터럴로 다시 적을 자리가 없다
 *   - **결정 12** — *"오늘 실물이 하는 것은 여섯이다"*, *"판정은 여섯 다 0이다"*
 *
 * ## 이 파일이 왜 새로 서는가 — 형제와 임포트 범위가 다르다
 *
 * `client-wiring-landing.contract.test.ts`가 자기 머리에 여는 것을 순수 층 둘로 닫아 두었다
 * — 결정 1이 *"①②는 순수하고 시그니처에 DOM 타입도 DOM 전역도 안 낸다"*로 그 둘만 node에서
 * 부를 수 있게 만들었기 때문이다. 이 파일이 재는 `render.js`·`main.js`는 DOM 전역에 닿으므로
 * 거기서 **실행하지 않는다.** 그래서 자리를 새로 연다 — 이 파일은 그 둘을 **임포트하지 않고
 * 원문만 읽는다.** 실행이 0이라 그 제약과 충돌하지 않는다.
 *
 * ## 정적 읽기를 계약으로 올리는 근거 — §9.6 결정 15
 *
 * §2.3·§9.3·§9.4가 텍스트 스캔을 세 번 거부했고, §9.4 결정 13이 이 부류에 대해
 * *"그 축은 QA 산출물이지 이 절의 강제 수단이 아니다"*라고 적었다. **그 거부를 §9.6 결정 15가
 * 아래 항목들에 한해 닫았다** — *"배치는 실행 없이(정적 조회로) 잴 수 있으므로 존재 축이고
 * 승격 대상이다"*, 그리고 승격 자체를 *"다음이 `packages/serve/test/`에 정적 조회 기반 축으로
 * 옮긴다"*로 구현에 배정했다. 이 파일이 그 이행이고, 원문은
 * `qa-20260828-webui96-wiring.independent.test.ts`의 축 G(그리기 층)와 축 H(부트)였다.
 *
 * **축 H에서 하나는 안 옮겼다.** *"[미규정] 부트의 임포트 그래프가 형제 전부를 덮는다"*는
 * §9.5 결정 4가 2026-08-27에 **미규정 유지**로 판정한 자리라, 옮기면 미확정 설계를 계약으로
 * 굳히는 것이 된다. 그 테스트는 QA 산출물에 남는다 — 그쪽의 붉음은 «계약 위반»이 아니라
 * «오늘의 사실이 바뀌었다»이고, 그 구분이 이 파일의 존재 이유다.
 *
 * **그래도 스캔의 한계는 그대로 물려받는다.** 거부 근거였던 *"못 찾으면 조용히 통과한다"*는
 * 승격으로 사라지지 않는다. 그래서 이 파일의 스캔 축은 전부 **역검증**(심은 위반을 술어가
 * 실제로 붉히는가)을 짝으로 달고, 절단이 헛돌면 던지게 두었다.
 *
 * ## 「여섯」의 존재·전수 축이 왜 이 파일에 서는가 — 결정 12 셋째항의 직접 배정
 *
 * §9.6 결정 12가 자기 마지막 항에서 *"손으로 유지되는 이 열거가 다시 썩지 않도록"*을 사유로
 * 들고, *"여섯 낱말의 존재를 실행 가능한 축으로 정본화하는 것은 `/make-plan`(구현)의 일이다"*
 * 로 그 몫을 구현에 넘겼다. 같은 항이 *"주석 정정(코드 쪽 열거 갱신)도 구현이 진다"*로 **코드
 * 쪽 열거**를 함께 지목했고, 그 열거가 `main.js` 머리의 여섯 항이다. 그래서 아래 축은 수를
 * **두 방향으로** 센다 — 정본이 든 여섯과 `main.js` 주석이 든 여섯. 한쪽만 자라면 붉는다.
 *
 * **선례가 있다.** `client-protocol.contract.test.ts`의 「§8.1 — 모집단의 수」 스위트가 정본
 * 문면에서 한글 수사와 `①②③…` 열거를 함께 뽑아 양방향으로 대조한다. 아래가 그 형태를 §9.6
 * 결정 12 문단에 옮긴 것이다.
 *
 * **선례에서 갈라지는 자리 하나.** 그쪽의 「자기 쪽」은 **이 파일의 `describe` 제목에 든 기호**
 * 를 세는데, 여기서는 그 셈이 성립하지 않는다 — 여섯 중 ②·④·⑥은 오늘 이 파일에 자기 축이
 * 없고(각각 §8.1 계약과 §9.6 결정 6·13이 다른 파일에서 진다), 제목에 기호를 달면 그 셋이
 * 영구히 붉는다. 그래서 코드 쪽 대조 상대를 정본 자신이 지목한 **`main.js`의 열거**로 잡았다.
 * 재는 것은 같다 — 손으로 유지되는 두 열거가 갈리는가.
 *
 * ## 문면을 고정하지 않는다
 *
 * §9.6이 *"함수 이름·문면·파일 수는 세부이며 §12가 든다"*로 이름을 계약 밖에 두었다. 아래가
 * 리터럴로 드는 것은 **정본이 직접 지목한 이름**(앵커 이름 `composer-input`)과 **플랫폼이
 * 소유한 어휘**(`innerHTML` 따위의 마크업 통로, `appendChild` 따위의 부분 갱신 표기)뿐이고,
 * 배선이 짓는 한국어 문장이나 함수 이름을 고정한 자리는 없다. 예외 **둘**이 `paint`·
 * `markStopped`인데, 그 둘은 문면이 아니라 **절단의 좌표**이고 못 찾으면 던지므로(아래)
 * 개명이 조용히 통과하지 않는다.
 *
 * ## 이 파일이 재지 못하는 것
 *
 * - **그리기가 실제로 무엇을 그리는지 안 잰다.** 재는 것은 원문의 배치뿐이다.
 *   §9.6이 스스로 *"그리기 층을 이번 사이클에서 아무도 재지 않는다"*를 적었고 가짜 DOM을
 *   기각했다(*"손으로 만든 가짜를 상대로 재면 재는 것이 그 가짜다"*). 그 자리를 처음 재는
 *   것은 브라우저 e2e다.
 * - **변수로 조립한 접근을 못 본다.** `node[name] = ...`나 라이브러리 경유는 아래 술어를
 *   지나간다. 그 방향까지 재려면 §2.3이 거부한 스캔을 더 넓혀야 하므로 여기서 멈추고 적는다.
 * - **CSP가 이 자리를 대신 막지 않는다.** §9.6 결정 9가 *"CSP(§9.4 결정 9)가 이 자리를
 *   반쯤만 막는다"*로 그 부족을 이름으로 들었다 — 인라인 스크립트는 막지만 배선이 문자열을
 *   마크업으로 넘기는 것 자체는 안 막는다.
 * - **리스너 등록의 개수를 안 닫는다.** 아래 결정 7 축은 «등록이 있고 전부 앵커에서 난다»만
 *   재고 «정확히 몇이다»를 안 잰다 — 그 수는 §9.6 어느 항도 안 들므로, 세면 오늘의 관측을
 *   계약으로 굳히는 것이 된다(§9.5 결정 11의 규율).
 * - **결정 8·2의 모집단이 `render.js` 전체가 아니라 「쓰는 함수 둘」이다** — `paint`와
 *   `markStopped`. 그 밖의 둘(`attachPromptSubmit`·`attachApprovalAnswers`)은 리스너 등록이라
 *   **결정 7 축**이 재고, 노드 조립 헬퍼 셋은 앵커에 안 닿아 모집단이 아니다(근거는 아래
 *   `writingBodies` 주석). 그래서 이 두 축은 «`render.js` 어디에도 없다»를 주장하지 않는다.
 *
 *   [정정 — 2026-09-03] 그 모집단이 `paint` 하나였고 **이 목록에 그 좁힘이 없었다.** 독립 QA
 *   T-008 V-1이 그것을 계약 위반으로 판정했다 — 두 축이 그리기 층 전체를 막는다고 읽히는데
 *   실제로는 `markStopped`에 심은 위반을 통과시켰다(§2.3이 이름 붙인 «막는다고 주장하면서 못
 *   막는 상태»). 처분은 모집단을 쓰는 함수 둘로 **넓히고** 그 경계를 여기 적는 것이다.
 *   근거는 `plans/20260902-webui96-decision15-qa.md` §4 V-1.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로 있는
 * 부분 문자열이고, 문서를 지목하는 자리는 절 번호와 결정 번호로 한다.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { ANCHOR_NAMES } from "../client/anchors.js";

/* -------------------------------------------------------------------------- *
 * 원문 읽기 — 기대값의 원천
 *
 * 임포트가 아니라 읽기다. 결정 1이 node에 연 것은 순수 층 둘뿐이고, 이 파일이 보는 둘은
 * DOM 전역에 닿으므로 실행하지 않는다.
 * -------------------------------------------------------------------------- */

const REPO = new URL("../../../", import.meta.url);
const readRepo = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, REPO)), "utf8");

const CLIENT_RENDER = readRepo("packages/serve/client/render.js");
const CLIENT_MAIN = readRepo("packages/serve/client/main.js");
const CLIENT_STREAM = readRepo("packages/serve/client/stream.js");
const CLIENT_STATE = readRepo("packages/serve/client/state.js");
const CLIENT_VIEW = readRepo("packages/serve/client/view.js");

/** 정본 자신. 아래 「여섯」 축이 수를 여기서 뽑는다 */
const WEB_UI_DOC = fileURLToPath(new URL("../../../docs/WEB-UI.md", import.meta.url));

/* -------------------------------------------------------------------------- *
 * 추출기 — 원문에서 「실행되는 것」만 남긴다
 * -------------------------------------------------------------------------- */

/** 주석만 걷어낸 코드. 문자열은 남는다 — 앵커 이름이 리터럴로 사는 자리를 봐야 한다 */
const codeOf = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

/**
 * 주석과 문자열 리터럴을 함께 걷어낸 실행 코드. 산문도 문자열 상수도 위반으로 읽히지
 * 않게 하는 쪽이고, **문면 자체를 봐야 하는 축은 위 `codeOf`를 쓴다.**
 */
const executableOf = (source: string): string =>
  codeOf(source)
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");

/**
 * 이름 붙은 export 함수의 본문만 잘라 낸다. **못 찾으면 던진다** — 개명이 조용히 통과하면
 * 그 함수에 걸린 축 전부가 «아무것도 안 읽는» 그린이 된다.
 */
const exportedBody = (source: string, name: string): string => {
  const executable = codeOf(source);
  const at = executable.indexOf(`export function ${name}(`);
  if (at < 0) throw new Error(`\`${name}\`을 못 찾았다 — 그리기 층의 함수가 개명됐다.`);
  const end = executable.indexOf("\n}", at);
  if (end < 0) throw new Error(`\`${name}\`의 끝을 못 찾았다.`);
  return executable.slice(at, end);
};

/** `paint` 함수 본문만 — 그리기의 진입점이다 */
const paintBody = (source: string): string => exportedBody(source, "paint");

/**
 * `markStopped` 함수 본문만. §9.6 결정 13이 *"착지 실패의 자국은 그리기 층의 최소 경로 하나로
 * 서고 접기와 뷰를 안 거친다"*로 세운 그리기 층의 정식 경로이고, 쓰는 자리
 * (`connection-status`)에 직접 쓴다. 그래서 결정 8·2의 모집단에 든다.
 */
const markStoppedBody = (source: string): string => exportedBody(source, "markStopped");

/**
 * 결정 8·2가 걸리는 모집단 — `render.js`에서 앵커(`elements.*`)에 **직접 쓰는** 함수 전부다.
 *
 * 나머지 함수는 이 모집단이 아니고, 그 배제에 근거가 있다. `textNode`·`transcriptNode`·
 * `approvalNode`는 `create(...)`가 낳은 **지역 노드**를 조립할 뿐 앵커에 안 닿으므로 결정 8이
 * 말하는 *"쓰는 자리"*가 없고(지역 노드의 `appendChild`는 재구성의 *수단*이지 부분 갱신이
 * 아니다), `attachPromptSubmit`·`attachApprovalAnswers`는 리스너 등록이라 결정 7 소관이다.
 *
 * [정정 — 2026-09-03] 이 모집단이 `paint` 하나였다. 독립 QA T-008 V-1이 그 좁힘을 계약 위반으로
 * 판정했다 — `markStopped`에 부분 갱신이나 읽는 자리 쓰기를 심어도 이 파일이 그린이었고,
 * 그 좁힘이 아래 「이 파일이 재지 못하는 것」에도 안 적혀 있었다. 근거는
 * `plans/20260902-webui96-decision15-qa.md` §4 V-1.
 */
const writingBodies = (source: string): readonly (readonly [string, string])[] => [
  ["paint", paintBody(source)],
  ["markStopped", markStoppedBody(source)],
];

/** 결정 8이 금지하는 부분 갱신 표기 — 플랫폼이 소유한 어휘라 리터럴로 든다 */
const PARTIAL_UPDATE_MARKS = [
  "appendChild",
  "insertBefore",
  "removeChild",
  "childNodes",
  "children[",
];

const MARKUP_SINKS = [
  "innerHTML",
  "outerHTML",
  "insertAdjacentHTML",
  "document.write",
  "createContextualFragment",
  "srcdoc",
];

/**
 * 합성 원문 — `markStopped` 본문 첫 줄에 한 문을 심는다. 뮤테이션 역검증 전용이고
 * **디스크의 `client/`·`src/`는 안 건드린다.** 시그니처를 못 찾으면 던진다.
 */
const plantInMarkStopped = (statement: string): string => {
  const signature = "export function markStopped(elements, text) {";
  if (!CLIENT_RENDER.includes(signature)) {
    throw new Error("`markStopped` 시그니처를 못 찾았다 — 합성 픽스처가 헛돈다.");
  }
  return CLIENT_RENDER.replace(signature, `${signature}\n  ${statement}`);
};

describe("§9.6 결정 2·7·8·9·10 — 그리기 층의 배치 (정적 읽기)", () => {
  test("역검증 — 추출기가 주석·문자열 속 표기를 실행 코드로 읽지 않는다", () => {
    const sample =
      '/** innerHTML은 금지다 */\nconst a = "innerHTML";\n// innerHTML\nnode.innerHTML = x;';
    const stripped = executableOf(sample);
    expect(stripped.match(/innerHTML/g)).toHaveLength(1);
  });

  test("마크업을 짓지 않는다 — 문자열이 HTML로 해석되는 통로가 0건이다 (결정 9)", () => {
    const executable = executableOf(CLIENT_RENDER);
    for (const sink of MARKUP_SINKS) {
      expect(executable, `그리기 층이 마크업 통로를 연다 — ${sink}`).not.toContain(sink);
    }
    // **못 보는 것**: 변수로 조립한 속성 이름(`node[name] = ...`)과 라이브러리 경유.
    // 그 방향을 재려면 §2.3이 거부한 스캔을 더 넓혀야 하므로 여기서 멈추고 적는다.
  });

  test("역검증 — 마크업 통로를 심으면 술어가 붉는다", () => {
    const planted = `${CLIENT_RENDER}\nfunction qa() { node.innerHTML = text; }`;
    const executable = executableOf(planted);
    expect(MARKUP_SINKS.some((sink) => executable.includes(sink))).toBe(true);
  });

  test("쓰는 자리 셋이 전량 재구성이다 — 부분 갱신 표기가 0건이다 (결정 8)", () => {
    expect(paintBody(CLIENT_RENDER)).toContain("replaceChildren");
    // **모집단은 쓰는 함수 둘이다**(위 `writingBodies`). `markStopped`는 `replaceChildren`을
    // 안 쓰는데, 그것이 위반이 아닌 것은 그 자리가 텍스트 하나이고 결정 8이 요구하는 것은
    // *"매번 통째로 다시 짓는다"*이지 특정 API가 아니기 때문이다. 그래서 재구성의 존재는
    // `paint`에만 걸고, **부분 갱신의 부재는 둘 다에** 건다.
    for (const [name, body] of writingBodies(CLIENT_RENDER)) {
      for (const partial of PARTIAL_UPDATE_MARKS) {
        expect(body, `그리기에 부분 갱신이 들어왔다 — ${name}의 ${partial}`).not.toContain(partial);
      }
    }
  });

  test("역검증 — `paint` 절단이 실물을 얻는다", () => {
    const body = paintBody(CLIENT_RENDER);
    expect(body.length).toBeGreaterThan(50);
    expect(body).toContain("connection-status");
    expect(() => paintBody("export function nothing() {}")).toThrow();
  });

  test("역검증 — `markStopped` 절단이 실물을 얻는다", () => {
    const body = markStoppedBody(CLIENT_RENDER);
    expect(body.length).toBeGreaterThan(50);
    expect(body).toContain("connection-status");
    expect(() => markStoppedBody("export function nothing() {}")).toThrow();
    // **두 절단이 안 겹친다.** `render.js`에서 `paint`가 먼저이므로 `paint`의 종단(`\n}`)이
    // `markStopped`보다 앞이고, 각 절단은 자기 시그니처에서 시작한다. 겹치면 아래 뮤테이션
    // 역검증 둘이 «어느 쪽에 심어도 붉는다»가 되어 모집단을 넓힌 것이 무의미해진다.
    expect(body).not.toContain("export function paint(");
    expect(paintBody(CLIENT_RENDER)).not.toContain("export function markStopped(");
  });

  test("`composer-input`에 쓰지 않는다 — 읽는 자리다 (결정 2)", () => {
    for (const [name, body] of writingBodies(CLIENT_RENDER)) {
      expect(body, `그리기가 읽는 자리에 썼다 — ${name}`).not.toContain("composer-input");
    }
  });

  test("역검증 — `markStopped`에 심은 부분 갱신을 결정 8 술어가 붉힌다", () => {
    // 합성 원문만 만든다 — `client/`·`src/`의 실물은 안 건드린다.
    const planted = plantInMarkStopped('elements["connection-status"].appendChild(text);');
    const body = markStoppedBody(planted);
    expect(PARTIAL_UPDATE_MARKS.some((partial) => body.includes(partial))).toBe(true);
    // 심은 자리가 `paint` 절단으로 새지 않는다 — 붉는 이유가 모집단을 넓힌 덕이라는 확인이다.
    expect(paintBody(planted)).not.toContain("appendChild");
  });

  test("역검증 — `markStopped`에 심은 읽는 자리 쓰기를 결정 2 술어가 붉힌다", () => {
    const planted = plantInMarkStopped('elements["composer-input"].textContent = text;');
    expect(markStoppedBody(planted)).toContain("composer-input");
    expect(paintBody(planted)).not.toContain("composer-input");
  });

  test("리스너를 항목마다 안 단다 — 등록이 앵커 컨테이너에서만 난다 (결정 7)", () => {
    const executable = executableOf(CLIENT_RENDER);
    const registrations = [...executable.matchAll(/([\w[\]."'-]+)\.addEventListener/g)].map(
      (match) => match[1] ?? "",
    );
    // **개수를 안 닫는다.** 원본 QA 축은 여기서 «정확히 2»를 단언했는데, 그 2는 §9.6이
    // 든 수가 아니라 오늘 실물이 든 수다 — 승격하면서 그대로 옮기면 관측이 계약이 된다
    // (§9.5 결정 11). 이 자리가 실제로 지켜야 하는 것은 「추출이 헛돌아 공집합을 그린으로
    // 통과시키지 않는다」는 fail-closed 몫이고, 그것은 비어 있지 않음으로 얻는다. 위임 리스너가 하나 더
    // 늘거나 주는 것 자체는 결정 7의 위반이 아니다 — 위반은 **어디에** 다는가다.
    expect(
      registrations.length,
      "리스너 등록을 하나도 못 찾았다 — 추출이 헛돌았다",
    ).toBeGreaterThan(0);
    for (const receiver of registrations) {
      expect(receiver, `앵커가 아닌 노드에 리스너를 달았다 — ${receiver}`).toContain("elements");
    }

    // **역검증을 이 축 안에 둔다.** 개수 단언이 지고 있던 「추출이 실물을 얻는가」의 절반이
    // 완화로 빠졌으므로, 심은 위반이 같은 추출기에서 실제로 걸리는지 여기서 확인한다.
    // 축의 테스트 수를 안 늘리는 자리에 두는 것은 §9.6 결정 15가 옮기라 한 모집단(축 G의
    // 여덟)을 이 승격이 스스로 넓히지 않게 하려는 것이다.
    const planted = `${CLIENT_RENDER}\nfunction qa(node) { node.addEventListener("click", () => {}); }`;
    const plantedReceivers = [
      ...executableOf(planted).matchAll(/([\w[\]."'-]+)\.addEventListener/g),
    ].map((match) => match[1] ?? "");
    expect(plantedReceivers.filter((receiver) => !receiver.includes("elements"))).toEqual(["node"]);
  });

  test("그리기가 DOM 전역을 안 읽는다 — 요소도 생성 수단도 인자다 (결정 10)", () => {
    const executable = executableOf(CLIENT_RENDER);
    for (const global of ["document.", "window.", "globalThis."]) {
      expect(executable, `그리기가 전역을 읽는다 — ${global}`).not.toContain(global);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * 부트 축의 추출기 — 원본 QA(`qa-20260828-webui96-wiring.independent.test.ts` 축 H)에서
 * 함께 옮겼다.
 *
 * **`importSpecifiers`는 원본에서 지우지 않는다.** 승격은 이동이지 복제가 아니지만, 이
 * 헬퍼는 원본에 남는 `[미규정]` 임포트 그래프 테스트가 계속 쓴다 — 그것이 §9.6 결정 15의
 * 승격 대상이 아니므로 원본에 남고, 그래서 헬퍼도 남는다. 여기 있는 것은 **복사본**이다.
 * -------------------------------------------------------------------------- */

/** `stream.js`가 요구하는 콜백 이름 — 손으로 안 적고 그 파일의 타입에서 파생한다 */
const parseHandlerNames = (source: string): readonly string[] => {
  const end = source.indexOf("} StreamHandlers");
  if (end < 0) throw new Error("`StreamHandlers` 정의를 못 찾았다.");
  const start = source.lastIndexOf("@typedef", end);
  return [
    ...new Set([...source.slice(start, end).matchAll(/readonly (on\w+):/g)].map((m) => m[1] ?? "")),
  ];
};

const HANDLER_NAMES = parseHandlerNames(CLIENT_STREAM);

/**
 * 실행되는 임포트 지정자만. 주석을 먼저 걷어내므로 산문이 지목한 이름은 안 든다 —
 * JSDoc의 `import("...")`도 블록 주석 안이라 함께 사라진다.
 */
const importSpecifiers = (source: string): readonly string[] =>
  [...codeOf(source).matchAll(/\bfrom\s*["']([^"']+)["']/g)].map((match) => match[1] ?? "");

describe("§9.6 결정 3·10·11·12 — 부트가 하는 것과 안 하는 것 (정적 읽기)", () => {
  test("파생이 실물을 얻는다 — 콜백 이름 다섯", () => {
    expect(HANDLER_NAMES.length).toBe(5);
    expect(HANDLER_NAMES).toContain("onOffStreamFrame");
  });

  test("다섯 콜백이 전부 알파벳으로 옮겨진다 — 리스너를 안 단 갈래가 없다 (결정 3)", () => {
    const executable = executableOf(CLIENT_MAIN);
    for (const name of HANDLER_NAMES) {
      expect(executable, `부트가 콜백을 안 달았다 — ${name}`).toContain(`${name}:`);
    }
  });

  test("그리는 자리가 하나다 — 콜백마다 그리지 않는다 (결정 3의 기각 갈래)", () => {
    // *"콜백 다섯이 각자 자기 앵커를 그린다"*가 기각됐다. 그리기 호출이 여럿이면
    // 「화면은 상태의 함수다」의 자리가 흩어진다. 오늘 실물은 접고-그리는 함수 하나와
    // 최초 1회다.
    const calls = [...executableOf(CLIENT_MAIN).matchAll(/\bpaint\s*\(/g)];
    expect(calls.length, "그리기 호출이 셋 이상이다 — 자리가 흩어졌다").toBeLessThanOrEqual(2);
    expect(calls.length).toBeGreaterThan(0);
  });

  test("부트에 앵커 이름 리터럴이 없다 — 집합을 순회해서 연다 (결정 11)", () => {
    // 재는 것은 **인용된 이름**이다. 식별자의 부분 문자열(`attachApprovalAnswers`)을 위반으로
    // 읽으면 이 축이 「항상 붉는」 검사가 된다. 못 보는 것: 변수로 조립한 이름 — 그 방향은
    // §9.4 결정 13의 조회 통로가 타입으로 잡는다.
    const code = codeOf(CLIENT_MAIN);
    for (const name of ANCHOR_NAMES) {
      for (const literal of [`"${name}"`, `'${name}'`]) {
        expect(code, `부트가 앵커 이름을 다시 적었다 — ${literal}`).not.toContain(literal);
      }
    }
    // 역검증 — 술어가 실제로 인용된 이름을 잡는다.
    expect(`${code}\nconst probe = "transcript";`).toContain('"transcript"');
  });

  test("DOM 전역에 닿는 자리가 부트 하나다 (결정 10)", () => {
    // 전송 전역(`EventSource`·`fetch`·`location`)은 이 판정 밖이다 —
    // *"전송 전역은 이 절이 안 옮긴다."*
    //
    // [정정 — 2026-08-29] 이름이 «읽는»이었고 결정 10이 그날 «DOM 전역에 닿는»으로 넓어졌다
    // (`K-376`). **어서션은 안 고쳤다** — `document`·`window.`의 부재를 재므로 읽기와 쓰기를
    // 애초에 함께 잡고, 넓어진 계약을 이미 만족한다. 고친 것은 이름 하나이고, 근거는 같은
    // 파일의 `SafetyAnchorName` 주석이 든 규율이다: 이름이 재는 것보다 넓거나 좁게 주장하면
    // 그 어긋남 자체가 결함이다. 여기서는 이름이 **좁아서** 낡은 쪽이었다.
    const modules: readonly (readonly [string, string])[] = [
      ["state.js", CLIENT_STATE],
      ["view.js", CLIENT_VIEW],
      ["render.js", CLIENT_RENDER],
    ];
    for (const [name, source] of modules) {
      const executable = executableOf(source);
      for (const global of ["document", "window."]) {
        expect(executable, `${name}이 DOM 전역에 닿는다 — ${global}`).not.toContain(global);
      }
    }
    // 역검증 — 부트에는 실제로 있다. 없으면 위 축이 «아무 파일도 안 읽는다»로 그린이 된다.
    expect(executableOf(CLIENT_MAIN)).toContain("document");
  });

  test("역검증 — 임포트 추출기가 실물을 얻는다", () => {
    expect(importSpecifiers(CLIENT_MAIN)).toContain("./state.js");
    expect(importSpecifiers('/** from "./ghost.js" */\nimport { a } from "./real.js";')).toEqual([
      "./real.js",
    ]);
  });
});

/* -------------------------------------------------------------------------- *
 * 「여섯」의 존재·전수 — §9.6 결정 12 셋째항이 구현에 직접 배정한 축
 *
 * **막지 못하는 것**(§2.3의 규율 — *"막는다고 주장하면서 못 막는 상태"*를 만들지 않는다).
 * 아래 추출기는 §9.6 결정 12의 **문면 표기**에 걸려 있다:
 *
 *   - `BOOT_COUNT`는 굵게 감싼 *"오늘 실물이 하는 것은 …이다"* 형태를 전제한다. 같은 항의
 *     다른 굵은 문장(*"판정은 여섯 다 0이다"*)은 이 형태가 아니라 안 걸린다 — 그 구분이
 *     문면의 우연이라, 아래 **열거 축**이 그 오검출을 함께 잡는다: 수사와 기호의 수가 함께
 *     여섯이어야 통과하므로 둘 중 하나만 어긋나도 붉다.
 *   - 열거 축은 항목을 `①②③…`으로 매기고 **낱말을 굵게** 감싸는 표기를 전제한다. 정본이
 *     열거를 글머리표나 표로 바꾸면 기호를 하나도 못 찾고 **던진다**.
 *   - `bootClauseOf`는 §9.6의 표제가 `###`이고 결정이 열 안 든 `12. `로 시작하는 항목이라는
 *     것을 전제한다. 문서가 절 층이나 번호 매김을 재편하면 자르는 자리가 어긋나고, 그
 *     어긋남도 조용하지 않다(자른 본문에 수가 없어져 던진다).
 *   - **이 축은 수와 낱말만 잰다.** 정본이 ④의 *내용*을 통째로 바꿔 써도 낱말이 같으면 여기서
 *     안 잡힌다. 항목별 실물 확인은 위 두 스위트가 부분적으로 지고, ②·④·⑥은 오늘 이 파일
 *     밖(§8.1 계약 · §9.6 결정 6·13)에 있다.
 *
 * **못 찾으면 던진다.** 표제를 못 찾거나 수사를 못 뽑으면 0을 세고 통과하는 대신 예외로
 * 죽는다 — `ARCHITECTURE.md` §2.6의 가시적 결과다.
 * -------------------------------------------------------------------------- */

/** 항목을 매기는 기호. §9.6 결정 12의 열거가 쓰는 표기 그대로다 */
const BOOT_MARKS = "①②③④⑤⑥⑦⑧⑨⑩";

/** 정본이 수를 한글 수사로 적으므로 낱말→수의 표가 필요하다. 열까지 든다 */
const KOREAN_NUMERALS: Readonly<Record<string, number>> = {
  하나: 1,
  둘: 2,
  셋: 3,
  넷: 4,
  다섯: 5,
  여섯: 6,
  일곱: 7,
  여덟: 8,
  아홉: 9,
  열: 10,
};

/** `**오늘 실물이 하는 것은 여섯이다**` — 굵게 감싼 문장에서 한글 수사 하나를 뽑는다 */
const BOOT_COUNT = /\*\*오늘 실물이 하는 것은 ([가-힣]+)이다\*\*/;

/** `① **원천 주입**` — 기호와 그 뒤 굵은 낱말의 짝 */
const BOOT_ITEM = new RegExp(`([${BOOT_MARKS}]) \\*\\*([^*]+)\\*\\*`, "g");

/** `main.js` 머리 열거의 한 항 — ` * 1. **원천 주입** — …` */
const CODE_ITEM = /^\s*\*\s*(\d+)\.\s+\*\*([^*]+)\*\*/gm;

/** §9.6 결정 12 항목 본문만 잘라 낸다. 못 찾으면 던진다 */
const bootClauseOf = (doc: string): string => {
  const section = doc.search(/^#{1,3} 9\.6[ .]/m);
  if (section === -1) throw new Error("정본에서 §9.6 표제를 찾지 못했다 — docs/WEB-UI.md");
  const body = doc.slice(section);
  const start = body.search(/^12\. /m);
  if (start === -1) throw new Error("§9.6에서 결정 12 항목을 찾지 못했다 — 번호 매김이 바뀌었다");
  const rest = body.slice(start);
  const afterHeading = rest.indexOf("\n");
  if (afterHeading === -1) return rest;
  const next = rest.slice(afterHeading).search(/^(?:\d+\. |#{1,3} )/m);
  return next === -1 ? rest : rest.slice(0, afterHeading + next);
};

/** 정본이 든 「부트가 하는 일」 — 수사와 기호·낱말 열거를 함께 뽑는다. 못 뽑으면 던진다 */
const bootDutiesInDoc = (
  doc: string,
): {
  readonly spelled: number;
  readonly marks: readonly string[];
  readonly words: readonly string[];
} => {
  const clause = bootClauseOf(doc);
  const hit = BOOT_COUNT.exec(clause);
  if (hit === null)
    throw new Error(`§9.6 결정 12에서 부트가 하는 일의 수를 뽑지 못했다 — 문면이 다시 쓰였다`);
  const word = hit[1] ?? "";
  const spelled = KOREAN_NUMERALS[word];
  if (spelled === undefined) throw new Error(`§9.6 결정 12가 든 수사를 못 읽었다 — "${word}"`);
  // 열거는 그 수사와 같은 줄에 있다 — 항목의 다른 줄이 같은 기호를 다시 들어도(§8.1 계약 ⑥
  // 참조처럼) 모집단에 안 섞이게 줄로 가둔다.
  const lineStart = clause.lastIndexOf("\n", hit.index) + 1;
  const lineEnd = clause.indexOf("\n", hit.index);
  const line = clause.slice(lineStart, lineEnd === -1 ? clause.length : lineEnd);
  const pairs = [...line.matchAll(BOOT_ITEM)];
  if (pairs.length === 0)
    throw new Error("§9.6 결정 12의 열거에서 기호를 하나도 못 찾았다 — 표기가 바뀌었다");
  return {
    spelled,
    marks: pairs.map((pair) => pair[1] ?? ""),
    words: pairs.map((pair) => (pair[2] ?? "").trim()),
  };
};

/** `main.js` 머리 주석이 든 열거 — 첫 블록 주석 안의 `N. **낱말**`. 못 찾으면 던진다 */
const bootDutiesInCode = (source: string): readonly string[] => {
  const end = source.indexOf("*/");
  if (end === -1) throw new Error("`main.js`에서 머리 주석을 찾지 못했다");
  const head = source.slice(0, end);
  const items = [...head.matchAll(CODE_ITEM)];
  if (items.length === 0)
    throw new Error("`main.js` 머리 주석에서 부트가 하는 일의 열거를 못 찾았다 — 표기가 바뀌었다");
  return items.map((item) => (item[2] ?? "").trim());
};

describe("§9.6 결정 12 — 부트가 하는 일 「여섯」의 존재·전수", () => {
  test("정본 쪽 — 수사와 열거가 같은 수를 든다", () => {
    // 정본이 ⑦을 더하면 `marks`가 일곱이 되고, 수사만 고치고 열거를 안 고쳐도(또는 그 반대여도)
    // 두 값이 갈려 붉는다. **이 축은 「여섯」을 리터럴로 안 든다** — 정본 안의 두 표기가
    // 서로를 지탱하는지만 재므로, 정본이 일곱으로 자라는 것 자체는 위반이 아니다.
    const { spelled, marks } = bootDutiesInDoc(readFileSync(WEB_UI_DOC, "utf8"));
    expect(marks).toHaveLength(spelled);
    expect(marks).toEqual([...BOOT_MARKS].slice(0, spelled));
  });

  test("코드 쪽 — `main.js` 머리 열거가 정본의 낱말을 그대로 같은 순서로 든다", () => {
    // §9.6 결정 12 셋째항이 *"주석 정정(코드 쪽 열거 갱신)도 구현이 진다"*로 이 대조를 배정했다.
    // 한쪽만 자라거나 낱말이 갈리면 여기서 붉는다 — 그것이 *"손으로 유지되는 이 열거가 다시
    // 썩지 않도록"*의 기계 판이다.
    const { words } = bootDutiesInDoc(readFileSync(WEB_UI_DOC, "utf8"));
    expect(bootDutiesInCode(CLIENT_MAIN)).toEqual(words);
  });

  test("⑤ 최초 그리기가 실물에 선다 — 스트림을 열기 전에 화면을 한 번 세운다", () => {
    // 여섯 중 다섯은 다른 축이 이미 실물을 만진다(①·③은 위 결정 10·3 축, ②는 아래 좌표,
    // ④·⑥은 §9.6 결정 6·13이 다른 파일에서). **⑤만 오늘 자기 축이 없어** 여기서 존재를 잰다.
    //
    // 재는 것 둘: 그리는 값이 **부트 자신의 상수**라는 것(정본 — *"그리는 값
    // (`INITIAL_SCREEN_STATE`)은 부트 자신이 상수로 든 것"*)과, 그 그리기가 **스트림 개설보다
    // 앞선다**는 것(*"스트림을 열기 전에 화면을 한 번 세운다"*). 안 세우면 첫 프레임까지의
    // 창이 빈 화면이라 §2.6의 침묵이 된다.
    const executable = executableOf(CLIENT_MAIN);
    expect(executable, "부트가 초기 상태 상수를 안 든다").toContain("INITIAL_SCREEN_STATE");

    const opensStream = executable.search(/\bstartStream\(\)/);
    if (opensStream < 0) throw new Error("부트에서 스트림 개설 호출을 못 찾았다 — ②가 개명됐다.");

    const paints = [...executable.matchAll(/\bpaint\s*\(/g)].map((hit) => hit.index);
    // 그리기 자리가 둘이라는 것은 관측이 아니라 정본이다 — 결정 13이
    // *"잡는 자리는 아래 둘이다: 접고 그리는 `push` 안과, 그것을 안 지나는 최초 그리기."*
    expect(
      paints.length,
      "그리기 자리가 둘 미만이다 — 최초 그리기가 접기 경로와 안 갈렸다",
    ).toBeGreaterThanOrEqual(2);
    expect(
      paints.at(-1),
      "마지막 그리기가 스트림 개설보다 뒤다 — 첫 프레임까지의 창이 빈 화면이 된다",
    ).toBeLessThan(opensStream);
  });

  test("역검증 — 두 셈과 ⑤의 좌표가 실제로 잡는다", () => {
    // ① 정본 쪽: ⑦이 붙은 가짜 문면에서 일곱을 세고, 수사만 낡으면 갈린다.
    const grown = [
      "### 9.6 가짜 절",
      "",
      "12. **가짜 항**. **오늘 실물이 하는 것은 일곱이다** — ① **가** ② **나** ③ **다**" +
        " ④ **라** ⑤ **마** ⑥ **바** ⑦ **사**.",
      "",
      "13. **다음 항**",
    ].join("\n");
    const verdict = bootDutiesInDoc(grown);
    expect(verdict.spelled).toBe(7);
    expect(verdict.marks).toHaveLength(7);
    expect(verdict.words).toEqual(["가", "나", "다", "라", "마", "바", "사"]);

    const stale = grown.replace("일곱이다", "여섯이다");
    const staleVerdict = bootDutiesInDoc(stale);
    expect(staleVerdict.spelled).toBe(6);
    expect(staleVerdict.marks).toHaveLength(7);

    // ② 정본 쪽 fail-closed: 표제·항목·수사를 못 찾으면 0이 아니라 예외다.
    expect(() => bootDutiesInDoc("## 9. 표제 없음\n\n본문뿐이다.\n")).toThrow(/§9\.6 표제/);
    expect(() => bootDutiesInDoc("### 9.6 절\n\n11. **다른 항**\n")).toThrow(/결정 12 항목/);
    expect(() => bootDutiesInDoc("### 9.6 절\n\n12. **수를 안 든다**\n")).toThrow(/수를 뽑지/);

    // ③ 코드 쪽: 열거가 줄면 보이고, 아예 없으면 던진다.
    const shrunk = "/**\n * 1. **원천 주입** — 하나뿐이다.\n */\nexport {};";
    expect(bootDutiesInCode(shrunk)).toEqual(["원천 주입"]);
    expect(() => bootDutiesInCode("/**\n * 열거가 없다.\n */")).toThrow(/열거를 못 찾았다/);
    expect(() => bootDutiesInCode("주석이 없다")).toThrow(/머리 주석/);

    // ④ 코드 쪽 셈이 머리 주석 밖을 안 센다 — 본문의 같은 표기는 모집단이 아니다.
    expect(bootDutiesInCode(`${shrunk}\n// 7. **바깥 항**\n`)).toEqual(["원천 주입"]);

    // ⑤ 최초 그리기의 좌표: 그 호출이 스트림 개설 뒤로 밀리면 순서 단언이 갈린다.
    const moved = executableOf(CLIENT_MAIN);
    const opensStream = moved.search(/\bstartStream\(\)/);
    const paints = [...moved.matchAll(/\bpaint\s*\(/g)].map((hit) => hit.index);
    expect(paints.filter((at) => at > opensStream)).toEqual([]);
    const after = `${moved}\npaint(a, b, c);`;
    expect([...after.matchAll(/\bpaint\s*\(/g)].map((hit) => hit.index).at(-1)).toBeGreaterThan(
      opensStream,
    );
  });
});
