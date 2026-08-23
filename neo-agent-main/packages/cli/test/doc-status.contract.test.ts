/**
 * 문서 지위 선언 — `DOC-STATUS.md` §3의 기계화.
 *
 * 기대값의 출처는 전부 정본 문서다:
 *   - §3.1 — 타입(`DocStatus`·`Violation`·`Verdict`)과 **위반 갈래 전부**. 축 2가 ①~⑦을 각각
 *            들고, ⑧ `context-unterminated`는 계약이 §3.6으로 갈라져 나가 축 8이 든다
 *   - §3.2 — 유효한 세 값과 `근거:`의 필수/금지. 축 1(양성 대조군)
 *   - §3.3 — *"파서는 관대하지 않다"*의 규칙 표. 축 3이 접두 고정으로 재어지는 행들을 들고,
 *            구간 행(*"선언은 **구간 밖**에서만 읽는다"*)은 축 8이 든다
 *   - §4   — 게이트가 판정하는 것은 §3.1의 `Violation`이 드는 갈래 전부. 축 4(`judge`가 파싱
 *            실패를 삼키지 않는다) — **판정과 실행부는 파일이 다르다.** 축 5
 *   - §5.1 — §5 표의 세 셀 행 문법, `###`로 끊는 절 범위, *"관대하지 않다"*, 실패 사유가
 *            §3.1의 `Violation`과 **다른 이름공간**이라는 것. 축 6
 *   - §5.2 — 헤더·구분선을 **위치**로 자른다 / 절 범위에 표가 둘이면 실패. 축 6-5
 *
 * **구현 본문(`scripts/doc-status.mjs`·`scripts/check-doc-status.mjs`)을 읽지 않고 썼다.**
 * 시그니처만 `scripts/doc-status.d.mts`에서 받았다(축 6의 `parseStatusTable`도 같다 — 그
 * 함수의 본문은 이 파일을 쓰는 동안 한 번도 열지 않았다). 이 게이트의 실패 양태는 *"파서가
 * 관대해서 조용히 통과"*이므로 구현을 보고 케이스를 짜면 정확히 그 관대함을 재현한다 — 케이스가
 * 구현의 그림자가 되는 순간 §3.3·§5.1의 *"관대하지 않다"*는 리포에서 아무도 재지 않는 문장이
 * 된다. 이 파일이 죽고 구현이 문서와 어긋나면 **문서가 이긴다**(축 2·축 3·축 6의 기대값은 전부
 * 문서 문면에서 직접 옮긴 것이고, 각 케이스의 출처 문장을 주석에 인용해 두었다).
 *
 * **양성 대조군(축 1)이 먼저 오는 이유.** 위반 케이스만 있으면 *"파서가 전부 거부한다"*와
 * 구별되지 않는다 — 2026-08-13에 이 레포가 실제로 밟은 함정이라 여기서 반복하지 않는다.
 *
 * **파일 I/O가 없다.** `parseDocStatus`는 문자열만 받고, 앵커의 존재 여부는 `judge`의 두 번째
 * 인자로 **주입된다**(§3.1의 ⑥·⑦이 파싱이 아니라 판정 단계에 있는 이유가 그것이다). 실물
 * `docs/`의 내용도 `packages/`의 존재도 이 파일의 판정에 들어오지 않는다 — 들어오면 문서를
 * 고칠 때마다 계약 테스트가 흔들리고, 그러면 이 파일은 계약이 아니라 실물의 사진이 된다.
 *
 * **임포트 부작용 — 이 QA가 잡아 고쳐진 것.** 최초 구현은 판정과 게이트 실행부가 한 파일이라
 * `check-doc-status.mjs`를 임포트만 해도 게이트 본체가 돌았고, 위반이 하나라도 있으면
 * **`process.exit(1)`로 임포트 시점에 프로세스를 끝냈다**(격리 사본으로 재현: 임포트 다음 줄이
 * 실행되지 않고 exit=1). 실물 `docs/`가 레드인 날에는 이 파일의 테스트가 **한 건도 돌지 못하고**
 * vitest 워커가 죽는다 — 순수 함수 두 개만 쓰는데도 그렇다. 진단은 "계약 위반"이 아니라
 * "테스트 파일이 사라짐"으로 나타난다. `package-boundary.contract.test.ts`가
 * `check-core-budget.mjs`를 임포트하지 않고 텍스트로 읽는 이유가 같은 것이었다.
 *
 * 지금은 판정이 **부작용 없는 `scripts/doc-status.mjs`**로 갈렸고 이 파일은 그쪽을 임포트한다.
 * `import.meta.main` 가드가 아니라 파일 경계로 가른 근거는 `DOC-STATUS.md` §4에 있다 —
 * 그 속성은 Node 24.2.0 도입이라 `engines: >=24`의 하단에서 게이트가 **조용히 통과**한다.
 * **고쳐진 것을 재지 않으면 되돌아온 것도 모르므로**, 그 경계 자체를 축 5가 단언한다.
 *
 * **§3.1 `Verdict`도 같은 사이클에 개정됐다.** 최초 문면은 두 갈래 모두에 `doc: string`을 뒀고
 * 구현은 성공 갈래를 `kind` + 옵셔널 `anchor`로 평탄화했는데, 전자는 순수 판정이 만들 수 없는
 * 값이었고 후자는 `{kind:"no-claim", anchor:"x"}`를 타입상 합법으로 만들어 §3.1의 불변을 판정
 * 경계에서 풀었다. 지금은 `{ ok: true, status: DocStatus }`로 문서·구현이 맞춰졌고 축 5가
 * **런타임(형태 전수)과 타입 레벨(`@ts-expect-error`) 양쪽에서** 잰다.
 *
 * **여기서 재지 않는 것.**
 *   - **집합 대조 자체** — «표에 없는 문서»·«문서 없는 행»·«값 어긋남»의 *보고*는 §5.1이
 *     *"집합 대조인 갈래는 실행부가 만든다"*라고 못박은 자리라 순수 함수의 밖에 있다.
 *     §5.2의 셋째 경계(머리 판정이 이미 실패한 문서를 값 어긋남 대조에서 건너뛰되 **한
 *     줄로 밝힌다**)도 같다 — 건너뛴 사실의 출력은 실행부의 산출이다. 그 자리는 **T-005의
 *     역검증**이 든다. 축 6이 재는 것은 그 대조의 **왼쪽 피연산자를 만드는 파서**뿐이다.
 *     같은 §5.1이 재료의 소유를 갈래마다 가르므로 나머지 둘은 여기서 재어진다 — «행 파싱
 *     실패»는 축 6-3·6-4가, «구간이 안 닫혔다»는 축 8-10이 든다.
 *   - §4의 *"발견한 `.md` 수 = 판정한 수"* — 실물 `docs/` 순회가 필요하다(축 5 말미 `it.todo`).
 *   - §6(수 서술 금지 예외)은 문서가 스스로 *"게이트의 검사 대상이 아니다"*라고 명시했다(§6 말미).
 *
 * **파일을 여는 축은 일부다.** 축 1~4·축 6-1~6-6·축 7은 순수 함수의 계약만 들고 파일을 열지
 * 않는다. 축 5가 여는 것은 `docs/`가 아니라 `scripts/`의 **파일 경계**이고, 축 8은 같은
 * `scripts/`의 모듈을 **자식 프로세스에 적재**한다(C-7·C-8). 실물 `docs/DOC-STATUS.md`를 여는
 * 것은 축 6-7뿐이다 — 인질 범위를 **자기 행 하나**로 좁혔고 행의 *수*는 세지 않는다
 * (§5 서두: *"문서의 수는 여기서 세지 않는다"*).
 *
 * **`it.todo("[예시] …")`는 `K-034`(파서의 미규정 갈래)의 소유다.** 이 파일에 이미 있는 것들을
 * 지우거나 단언으로 승격하지 않는다 — 승격의 근거는 구현의 동작이 아니라 **문서가 그 자리를
 * 정하는 것**이고, 그 판정은 이 파일이 아니라 `K-034`가 한다. 축 5의 두 건이 승격된 것도 문서와
 * 구현이 **함께** 개정된 뒤였다(§3.1 `Verdict` · §4 파일 경계).
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  type DocStatus,
  HEAD_LINE_LIMIT,
  judge,
  type ParseFailure,
  type ParseResult,
  parseDocStatus,
  parseStatusTable,
  type TableAssignment,
  type TableFailureReason,
  type TableParseResult,
  uncoveredPackages,
  type Verdict,
  type Violation,
} from "../../../scripts/doc-status.mjs";

// ---------------------------------------------------------------------------
// 픽스처 · 단언 헬퍼
// ---------------------------------------------------------------------------

/**
 * 실물 문서 머리의 최소 골격. 주어진 줄들이 `- 상태:`/`- 근거:` 자리에 **그대로** 들어간다.
 *
 * 골격을 두는 것은 미관이 아니다 — 필드만 던지면 *"머리가 파일 맨 앞줄일 때만 동작하는
 * 파서"*도 통과한다. §5의 실물 문서는 전부 제목·요약 뒤에 필드가 오므로 그 배치를 재현한다.
 */
function head(...lines: string[]): string {
  return ["# 문서 제목", "", "**한 줄 요약.**", "", ...lines, "", "---", "", "## 1. 경계", ""].join(
    "\n",
  );
}

/** `lines[0]`이 `lineNumber`번째 줄에 오도록 앞을 채운다 — §3.3의 40줄 경계를 재는 도구. */
function atLine(lineNumber: number, ...lines: string[]): string {
  const filler = Array.from({ length: lineNumber - 1 }, (_, index) => `채움 본문 ${index + 1}`);
  return [...filler, ...lines].join("\n");
}

function asFailure(parsed: ParseResult): ParseFailure | undefined {
  return "violation" in parsed ? parsed : undefined;
}

/**
 * §3.1의 **어느** 위반인지까지 단언한다.
 *
 * *"실패했다"*만 재면 ①~⑦이 서로 자리를 바꿔도 전부 그린이다. 이 게이트에서 그것은 치명적인데,
 * 위반 이름이 곧 **고칠 곳의 주소**이기 때문이다 — `anchor-present`(⑦)는 *"머리를 고쳐라"*이고
 * `anchor-missing`(⑥)은 *"구현이 사라졌다"*이며 둘의 처방은 정반대다.
 *
 * `detail`이 빈 문자열이 아닌 것도 함께 잰다(§3.1의 `detail: string`). 게이트의 출력이 곧
 * 진단이므로 위반 이름만 맞고 detail이 비면 §4의 *"성공도 조용하지 않다"*가 절반만 참이 된다.
 */
function expectViolation(source: string, expected: Violation): void {
  const parsed = parseDocStatus(source);
  // 두 번째 인자로 실제 파싱 결과를 남긴다 — 가장 흔한 오답이 "위반이긴 한데 다른 위반"이다.
  expect(parsed, `실제: ${JSON.stringify(parsed)}`).toHaveProperty("violation", expected);
  const failure = asFailure(parsed);
  expect(typeof failure?.detail).toBe("string");
  expect((failure?.detail ?? "").length).toBeGreaterThan(0);
}

/**
 * 파싱 결과가 §3.1의 `DocStatus`와 **정확히** 같다고 단언한다.
 *
 * `toEqual`이라 잉여 프로퍼티도 잡는다 — `no-claim`에 `anchor`가 딸려 오면 여기서 죽는다.
 * §3.1이 `근거:` 줄의 유무를 *"kind에 의해 완전히 결정된다 — 옵셔널이 아니다"*라고 못박은 것이
 * 그 뜻이므로, 부분 일치로 재면 그 문장이 무단언으로 남는다.
 */
function expectStatus(source: string, expected: DocStatus): void {
  const parsed = parseDocStatus(source);
  expect(parsed, `실제: ${JSON.stringify(parsed)}`).toEqual(expected);
}

/**
 * 판정 **성공** 갈래의 형태 전체를 §3.1의 `Verdict`와 대조한다.
 *
 * `toHaveProperty("ok", true)`로만 재던 것을 형태 전수로 올린 것이 이번 사이클의 승격이다.
 * `ok`만 보면 성공 갈래가 어떤 모양이어도 그린이라, 개정 전의 평탄화(`kind` + 옵셔널
 * `anchor`)도 존재하지 않는 `doc` 필드도 아무도 세지 않았다. `toEqual`이라 **잉여 필드가
 * 있으면 죽는다** — `status`가 통째로 실리는지, `no-claim`에 `anchor`가 딸려 오지 않는지,
 * 판정 함수가 만들 수 없는 `doc`이 되살아나지 않는지가 한 단언에 들어간다.
 */
function expectVerdictOk(source: string, anchorExists: boolean, status: DocStatus): void {
  const verdict = judge(parseDocStatus(source), anchorExists);
  expect(verdict, `실제: ${JSON.stringify(verdict)}`).toEqual({ ok: true, status });
}

/** §5 표에서 그대로 가져온 앵커. 형태(디렉터리/파일)가 판정에 영향을 주지 않는다는 것도 겸한다. */
const DIR_ANCHOR = "packages/gate/src";
const FILE_ANCHOR = "scripts/check-doc-status.mjs";

/** §4의 두 자리. 순수 판정과 실행부가 **다른 파일**이라는 것이 축 5의 대상이다. */
const SCRIPTS_DIR = fileURLToPath(new URL("../../../scripts/", import.meta.url));
const PURE_MODULE = join(SCRIPTS_DIR, "doc-status.mjs");
const GATE_MODULE = join(SCRIPTS_DIR, "check-doc-status.mjs");

// ---------------------------------------------------------------------------
// 축 0 — fail-closed
// ---------------------------------------------------------------------------

describe("DOC-STATUS §3 — 축 0: fail-closed", () => {
  it("판정 함수 둘이 실제로 임포트된다", () => {
    // 임포트가 조용히 undefined를 주면 아래 단언들이 전부 TypeError로 죽기는 하지만,
    // 진단이 "판정이 틀렸다"가 아니라 "배선이 끊겼다"를 가리키게 여기서 먼저 잰다.
    expect(typeof parseDocStatus).toBe("function");
    expect(typeof judge).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// 축 1 — 양성 대조군 (§3.2의 세 값)
//
// **이 축이 없으면 축 2·축 3 전체가 공허하다.** 전부 거부하는 파서도 위반 케이스는 남김없이
// 통과시킨다. §3.2의 표 세 행이 각각 여기 한 건씩이고, 그것이 이 게이트가 통과시켜야 하는
// 문면의 전부다 — 네 번째 유효 값은 없다.
// ---------------------------------------------------------------------------

describe("DOC-STATUS §3.2 — 축 1: 유효한 세 값은 통과한다", () => {
  it("`구현 완료` + `근거:` → implemented (앵커 존재 시 판정 ok)", () => {
    const source = head(`- 상태: 구현 완료`, `- 근거: ${DIR_ANCHOR}`, "- 작성일: 2026-08-13");
    expectStatus(source, { kind: "implemented", anchor: DIR_ANCHOR });

    // §3.2 — `구현 완료`의 `근거:`는 *"존재해야 하는 경로"*다.
    expectVerdictOk(source, true, { kind: "implemented", anchor: DIR_ANCHOR });
  });

  it("`구현 전` + `근거:` → not-yet (앵커 부재 시 판정 ok)", () => {
    const source = head(`- 상태: 구현 전`, `- 근거: ${FILE_ANCHOR}`);
    expectStatus(source, { kind: "not-yet", anchor: FILE_ANCHOR });

    // §3.2 — `구현 전`의 `근거:`는 ***아직 없어야 하는* 경로**다. 이것이 이 설계의 핵심이고
    // (§3.2 본문), 2026-08-13에 이 문서 자신이 통과한 상태이기도 하다(머리 정정 주석).
    expectVerdictOk(source, false, { kind: "not-yet", anchor: FILE_ANCHOR });
  });

  it("`구현 주장 없음` (근거 없음) → no-claim", () => {
    const source = head("- 상태: 구현 주장 없음");
    expectStatus(source, { kind: "no-claim" });

    // §3.1에 `no-claim`을 판정 단계에서 깨뜨리는 위반은 없다 — ⑥은 implemented,
    // ⑦은 not-yet 한정이고 ⑤(anchor-forbidden)는 파싱 단계에서 이미 끝난다. 따라서
    // 주입되는 존재 여부와 무관하게 ok다. 앵커가 없는 값에 존재 여부를 묻는 것 자체가
    // 무의미하다는 것을 두 방향으로 못박는다.
    //
    // **양쪽 다 `status`가 `{kind:"no-claim"}` 정확히여야 한다** — 주입된 존재 여부가
    // `anchor`로 새어 나오면(개정 전 평탄화 타입이 허용하던 형태) 여기서 죽는다.
    expectVerdictOk(source, false, { kind: "no-claim" });
    expectVerdictOk(source, true, { kind: "no-claim" });
  });

  it("앵커가 디렉터리든 파일이든 규칙 분기가 없다 (§5 말미)", () => {
    // §5 — *"앵커는 «존재 여부를 물을 수 있는 경로»이고 디렉터리와 파일이 그 점에서 다르지
    // 않다. 문서 유형별로 규칙을 나누자는 안은 배제했다."* 분기가 생기면 여기서 죽는다.
    expectStatus(head("- 상태: 구현 완료", "- 근거: packages/cli/bin/neo-agent.mjs"), {
      kind: "implemented",
      anchor: "packages/cli/bin/neo-agent.mjs",
    });
    expectStatus(head("- 상태: 구현 완료", "- 근거: packages/store/src/search.ts"), {
      kind: "implemented",
      anchor: "packages/store/src/search.ts",
    });
  });
});

// ---------------------------------------------------------------------------
// 축 2 — §3.1의 위반 ①~⑦
//
// 하나도 빠뜨리지 않는 것이 이 축의 존재 이유다. ①~⑤는 문면만으로 정해지므로
// `parseDocStatus`가 소유하고, ⑥·⑦은 **실물 존재 여부**가 필요하므로 `judge`가 소유한다 —
// 그 분할이 곧 §3.1이 `judge(parsed, anchorExists)`로 경로 판정을 주입받는 이유다.
//
// **⑧ `context-unterminated`는 여기 없고 축 8이 든다.** 2026-08-23에 §3.1이 그 갈래를 얹으며
// 계약 전체를 §3.6으로 갈라 두었고, 그 자리는 접두 고정이 아니라 구간 마스킹이 재는 자리다.
// 전수 자기 점검(축 4의 `COVERED`)이 ⑧까지 함께 세므로 이 분할이 침묵을 만들지 않는다.
// ---------------------------------------------------------------------------

describe("DOC-STATUS §3.1 — 축 2: 위반 ①~⑦", () => {
  it("① missing — `상태:` 줄이 없다", () => {
    expectViolation(head("- 근거: packages/core/src", "- 작성일: 2026-08-13"), "missing");
  });

  it("① missing — 필드가 하나도 없는 머리", () => {
    // F-1 이전 상태(머리에 지위 선언 자체가 없음)가 이 갈래다. §5 — *"표에 없는 `.md`가
    // 있으면 그것은 표의 누락이며 §4 게이트가 ①로 잡는다."*
    expectViolation(head("일반 문단이다.", "여기에도 필드가 없다."), "missing");
  });

  it("② duplicate — `상태:` 줄이 둘이다", () => {
    // §3.3 — *"0개(미선언)와 2개 이상(모호)을 각각 다른 위반으로 잡는다."*
    expectViolation(
      head("- 상태: 구현 완료", `- 근거: ${DIR_ANCHOR}`, "- 상태: 구현 전"),
      "duplicate",
    );
  });

  it("② duplicate — 값이 같아도 둘이면 위반이다", () => {
    // *"파일당 정확히 1개"*이지 *"서로 모순되지 않으면 된다"*가 아니다. 관대한 파서는
    // 중복을 dedupe하고 넘어가는데, 그러면 나중에 한쪽만 고치는 경로가 열린 채로 그린이 된다.
    expectViolation(
      head("- 상태: 구현 완료", `- 근거: ${DIR_ANCHOR}`, "- 상태: 구현 완료"),
      "duplicate",
    );
  });

  it("③ unknown-value — 유니온 밖의 값", () => {
    // §3.5 — `설계 확정`은 필드에서 뺐다. 개정 전 6개 문서가 들고 있던 축이라 가장 먼저
    // 되돌아올 후보이고, 되돌아오면 여기서 잡힌다.
    expectViolation(head("- 상태: 설계 확정", `- 근거: ${DIR_ANCHOR}`), "unknown-value");
  });

  it("④ anchor-required — `구현 완료`인데 `근거:`가 없다", () => {
    expectViolation(head("- 상태: 구현 완료", "- 작성일: 2026-08-13"), "anchor-required");
  });

  it("④ anchor-required — `구현 전`인데 `근거:`가 없다", () => {
    // §3.2 — *"앵커 없는 `구현 전`은 검사할 수 없고, 검사할 수 없는 선언이 정확히 F-1이
    // 7일간 산 방식이다."* 이쪽 갈래가 뚫리면 게이트 전체가 F-1을 못 잡는다.
    expectViolation(head("- 상태: 구현 전"), "anchor-required");
  });

  it("⑤ anchor-forbidden — `구현 주장 없음`인데 `근거:`가 있다", () => {
    expectViolation(head("- 상태: 구현 주장 없음", `- 근거: ${DIR_ANCHOR}`), "anchor-forbidden");
  });

  it("⑥ anchor-missing — `구현 완료`인데 앵커 경로가 없다", () => {
    const parsed = parseDocStatus(head("- 상태: 구현 완료", `- 근거: ${DIR_ANCHOR}`));
    const verdict = judge(parsed, false);
    expect(verdict, `실제: ${JSON.stringify(verdict)}`).toHaveProperty("ok", false);
    expect(verdict).toHaveProperty("violation", "anchor-missing");
  });

  it("⑦ anchor-present — `구현 전`인데 앵커 경로가 있다 (F-1 6건이 여기)", () => {
    // §4 — *"구현이 착지하는 순간 게이트가 ⑦로 깨지므로, 머리를 고치는 것이 구현 커밋의
    // 일부가 된다."* 이 게이트의 존재 이유 자체이고, `DOC-STATUS.md` 자신이 첫 시험
    // 사례로 여기 걸렸다(머리 정정 주석).
    const parsed = parseDocStatus(head("- 상태: 구현 전", `- 근거: ${FILE_ANCHOR}`));
    const verdict = judge(parsed, true);
    expect(verdict, `실제: ${JSON.stringify(verdict)}`).toHaveProperty("ok", false);
    expect(verdict).toHaveProperty("violation", "anchor-present");
  });
});

// ---------------------------------------------------------------------------
// 축 3 — §3.3의 규칙 표: 파서는 관대하지 않다
//
// §3.3 표의 행이 각각 아래 `R…` describe 하나다. 이 축이 이 파일의 무게중심인데,
// **관대함은 언제나 그린으로 나타나기 때문**이다 — 파서가 느슨해지는 회귀는 실패를 만들지
// 않고 통과를 만든다. 그래서 여기 케이스들은 전부 *"거부되어야 한다"*를 단언한다.
//
// **구간 행은 여기 없고 축 8이 든다.** 2026-08-23에 §3.3 표에 행이 하나 붙었다 —
// *"선언은 **구간 밖**에서만 읽는다 — HTML 주석·펜스 코드 블록 안은 안 읽는다"*. 그 행의
// 근거 칸이 스스로 *"접두 고정이 못 가르는 자리다"*라고 적었으므로 이 축의 수단(열 0 접두)으로는
// 재어지지 않고, 계약 전체가 §3.6으로 갈라져 나갔다. **축 8이 그 행의 실물이다** — 상호 참조를
// 양쪽 머리에 두는 것이 계약이다. 한쪽만 두면 §3.3의 그 행이 어느 축에도 안 선 것처럼 읽힌다.
// ---------------------------------------------------------------------------

describe("DOC-STATUS §3.3 R1 — 탐색 범위는 파일 첫 40줄", () => {
  it("상한이 40이다 — 문서 머리말이 «조정 가능(세부)»로 분류한 유일한 수", () => {
    // `DOC-STATUS.md`:12는 *"조정 가능(세부): … 탐색 줄 수 상한"*이라고 못박았다. 그래서
    // 아래 경계 케이스들은 **상수로 픽스처를 만들고** 수 자체는 여기 한 줄만 든다 — 상한이
    // 바뀌면 §3.3 문면과 이 줄만 고치면 되고 경계 동작은 그대로 재어진다. 반대로 픽스처에
    // 40을 박아 두면 상한 변경이 경계 케이스 네 건을 동시에 죽여 진단이 흩어진다.
    expect(HEAD_LINE_LIMIT).toBe(40);
  });

  it("상한 줄의 `- 상태:`는 읽힌다 (경계 안)", () => {
    // 경계 밖만 재면 *"파서가 앞 5줄만 본다"*도 통과한다. 안쪽 경계를 함께 못박는다.
    expectStatus(atLine(HEAD_LINE_LIMIT, "- 상태: 구현 주장 없음"), { kind: "no-claim" });
  });

  it("상한 + 1번째 줄의 `- 상태:`는 무시된다 → missing", () => {
    expectViolation(atLine(HEAD_LINE_LIMIT + 1, "- 상태: 구현 주장 없음"), "missing");
  });

  it("본문 깊숙한 곳의 `- 상태:` 줄은 머리를 만들지 못한다", () => {
    // §3.3 — *"머리는 머리에 있다. 본문 인용까지 읽으면 자기오염이 되살아난다."*
    // 이 레포가 세 번 겪은 자기오염(§2.2)이 정확히 이 경로로 들어온다.
    expectViolation(
      atLine(HEAD_LINE_LIMIT * 3, "- 상태: 구현 완료", `- 근거: ${DIR_ANCHOR}`),
      "missing",
    );
  });

  it("범위 밖의 두 번째 `- 상태:`는 중복을 만들지 않는다", () => {
    // R1과 R5의 교차. 범위 밖이 세어지면 본문에서 옛 문면을 인용한 문서가 전부 ②로
    // 깨지고, 그러면 사람이 규칙을 우회할 동기가 생긴다.
    expectStatus(
      [head("- 상태: 구현 주장 없음"), atLine(HEAD_LINE_LIMIT + 20, "- 상태: 구현 완료")].join(
        "\n",
      ),
      { kind: "no-claim" },
    );
  });
});

describe("DOC-STATUS §3.3 R2 — 줄이 `- 상태: `로 정확히 시작한다", () => {
  it("선행 공백이 붙은 `  - 상태:`는 무시된다 → missing", () => {
    expectViolation(head("  - 상태: 구현 완료", `  - 근거: ${DIR_ANCHOR}`), "missing");
  });

  it("탭 들여쓰기가 붙은 `\\t- 상태:`는 무시된다 → missing", () => {
    expectViolation(head("\t- 상태: 구현 완료", `\t- 근거: ${DIR_ANCHOR}`), "missing");
  });

  it("`>` 인용 블록 안의 `- 상태:`는 무시된다 → missing", () => {
    // §3.3 — *"접두를 열 0에 고정하면 `>` 인용 블록과 들여쓰기 코드 블록이 **규칙으로**
    // 배제된다"*. 2026-08-23까지 그 근거 칸은 *"정정 주석은 `>` 블록이므로 자동 배제된다"*
    // 였고, §3.6이 그 관측을 규칙으로 옮기며 문면이 바뀌었다 — 지금 그 옛 문면은 §3.6 서두가
    // 인용으로만 든다.
    expectViolation(head("> - 상태: 구현 완료", `> - 근거: ${DIR_ANCHOR}`), "missing");
  });

  it("정정 주석이 옛 상태를 인용해도 비인용 한 줄만 읽는다 (§2.2의 핵심)", () => {
    // §2.2 — *"정정 주석이 옛 상태를 아무리 인용해도 파서는 `- 상태:`로 시작하는 비인용
    // 줄만 읽는다. 필드 파서는 **무엇을 읽을지 자신이 정한다**."* 이것이 grep 격자와
    // 갈리는 지점이고, §5 말미가 기존 6개 문서의 정정 주석을 *"그대로 둔다"*고 판정한
    // 근거다. 이 단언이 죽으면 그 판정이 무효가 되어 과거 기록을 고쳐야 한다.
    const source = head(
      "- 상태: 구현 완료",
      `- 근거: ${DIR_ANCHOR}`,
      "",
      "> **정정(2026-08-13).** 이 줄은 원래 `- 상태: 구현 전`이었다.",
      "> - 상태: 구현 전",
      "> 위 인용은 과거 문면의 기록이며 파서 밖이다.",
    );
    expectStatus(source, { kind: "implemented", anchor: DIR_ANCHOR });
  });

  it.todo("[미규정] `-상태:`·`- 상태:구현 완료`처럼 구분자 공백이 어긋난 줄의 취급");
});

describe("DOC-STATUS §3.3 R3 — 값은 순수 텍스트 정확 일치", () => {
  it("마크다운 강조 `**구현 완료**`는 거부된다 → unknown-value", () => {
    // §3.3이 이름을 들어 위반이라고 못박은 형태다. 개정 전 6개 문서가 실제로
    // `설계 확정, **구현 완료**` 형태였으므로(§3.5) 가장 되돌아오기 쉬운 문면이다.
    expectViolation(head("- 상태: **구현 완료**", `- 근거: ${DIR_ANCHOR}`), "unknown-value");
  });

  it("F-2의 실물 문면 `구현 완료(검색 제외)`는 거부된다 → unknown-value", () => {
    // §2.1 — *"이 설계는 F-2를 검사하지 않고 표현 불가능하게 만든다."* 괄호 한정을 통과시키는
    // 파서는 F-2를 5일이 아니라 영원히 살게 한다. §3.1 ③의 주석이 지목한 자리가 여기다.
    expectViolation(
      head("- 상태: 구현 완료(검색 제외)", "- 근거: packages/store/src"),
      "unknown-value",
    );
  });

  it("공백 한 칸 차이 `구현완료`도 거부된다 → unknown-value", () => {
    expectViolation(head("- 상태: 구현완료", `- 근거: ${DIR_ANCHOR}`), "unknown-value");
  });

  it("마침표가 붙은 `구현 완료.`도 거부된다 → unknown-value", () => {
    expectViolation(head("- 상태: 구현 완료.", `- 근거: ${DIR_ANCHOR}`), "unknown-value");
  });

  it("`구현 주장 없음`에 한정을 붙인 형태도 거부된다 → unknown-value", () => {
    // 세 값 중 `근거:`를 금지하는 유일한 값이라 관대함이 ⑤ 검사까지 함께 무력화한다.
    expectViolation(head("- 상태: 구현 주장 없음(본문 §4 제외)"), "unknown-value");
  });

  it.todo("[미규정] 값 뒤 후행 공백(`- 상태: 구현 완료   `)의 취급 — trim 여부");
});

describe("DOC-STATUS §3.3 R4 — `상태:`·`근거:`는 각각 자기 줄을 갖는다", () => {
  it("두 필드를 한 줄에 몬 형태는 거부된다 → unknown-value", () => {
    // §3.4 — *"`(검색 제외)`가 5일간 살아남은 것은 그 괄호가 그 줄의 끝에 있었기
    // 때문이다."* 한 줄에 몰 수 있으면 F-2의 인과가 그대로 복원된다. 값이 유니온 밖이
    // 되므로 ③으로 떨어진다.
    expectViolation(head(`- 상태: 구현 완료 · 근거: ${DIR_ANCHOR}`), "unknown-value");
  });

  it("`최종 개정:` 이력을 같은 줄에 붙인 형태는 거부된다 → unknown-value", () => {
    // §3.4 말미 — *"`최종 개정:` 이력은 이 규약이 규정하지 않는다. 다만 `상태:`·`근거:`와
    // 같은 줄에 둘 수 없다."* 규정하지 않는 것과 같은 줄에 둘 수 있는 것은 다르다.
    expectViolation(
      head("- 상태: 구현 완료 (최종 개정: 2026-08-13)", `- 근거: ${DIR_ANCHOR}`),
      "unknown-value",
    );
  });

  it("개정 전 실물 문면(`설계 확정, **구현 완료**`)은 거부된다 → unknown-value", () => {
    // §3.5가 서술한 개정 전 6개 문서의 형태. R3·R4·§3.5가 한 문면에서 동시에 걸린다.
    expectViolation(
      head("- 상태: 설계 확정, **구현 완료**", `- 근거: ${DIR_ANCHOR}`),
      "unknown-value",
    );
  });

  it.todo("[미규정] `- 근거:` 줄이 둘 이상일 때의 위반 — §3.3이 세는 것은 `상태:` 줄뿐이다");
  it.todo("[미규정] `- 근거:` 줄만 40줄 밖에 있을 때(상태는 안쪽) ④인가 정상인가");
  it.todo("[미규정] `- 상태:`와 `- 근거:`의 등장 순서·인접 요구 여부");
});

describe("DOC-STATUS §3.3 R5 — `상태:` 줄은 파일당 정확히 1개", () => {
  it("0개는 ①, 2개는 ② — 서로 다른 위반이다", () => {
    // §3.3의 근거 칸이 요구하는 것은 *두 위반이 갈린다*는 것 자체다. 하나로 뭉뚱그리면
    // 진단이 "머리를 써라"와 "머리가 둘이다" 중 어느 쪽인지 말하지 못한다.
    expectViolation(head("- 근거: packages/core/src"), "missing");
    expectViolation(head("- 상태: 구현 주장 없음", "- 상태: 구현 주장 없음"), "duplicate");
  });

  it("3개도 duplicate다 — 위반은 개수에 따라 갈리지 않는다", () => {
    expectViolation(
      head("- 상태: 구현 주장 없음", "- 상태: 구현 전", "- 상태: 구현 완료"),
      "duplicate",
    );
  });

  it("값이 둘 다 유니온 밖이어도 줄이 2개면 ②다", () => {
    // R5의 조건은 **줄 수**이고 값에 대한 단서가 붙어 있지 않다 — *"2개 이상(모호)"*.
    // 값 검증을 먼저 돌려 ③으로 떨어뜨리면 *"머리가 둘"*이라는 사실이 값을 고칠 때까지
    // 드러나지 않는다. (③과 동시 성립할 때 어느 쪽을 보고할지의 일반 규칙은 §3이 정하지
    // 않았다 — 다만 이 케이스는 R5의 조건이 무조건형이라는 데서 직접 나온다.)
    expectViolation(head("- 상태: **구현 완료**", "- 상태: 설계 확정"), "duplicate");
  });
});

// ---------------------------------------------------------------------------
// 축 4 — 판정은 §3.1의 `Violation`이 드는 갈래 전부다 (§4)
//
// §4 — *"판정은 §3.1의 `Violation` 유니온이 드는 갈래 전부다"*. ①~⑤는 파싱에서 나오지만
// 게이트가 출력하는 단위는 `Verdict`이므로, `judge`가 파싱 실패를 **그대로 통과시켜
// ok:true로 만들지 않는다**는 것이 계약이다.
// 이 자리가 뚫리면 ①~⑤ 다섯 위반이 게이트에서 전부 조용해진다 — 축 2의 다섯 단언이 파서
// 안에서만 참인 채로.
// ---------------------------------------------------------------------------

describe("DOC-STATUS §4 — 축 4: judge가 파싱 실패를 삼키지 않는다", () => {
  const FAILING_SOURCES: readonly (readonly [Violation, string])[] = [
    ["missing", head("- 근거: packages/core/src")],
    ["duplicate", head("- 상태: 구현 주장 없음", "- 상태: 구현 전")],
    ["unknown-value", head("- 상태: 구현 완료(검색 제외)", `- 근거: ${DIR_ANCHOR}`)],
    ["anchor-required", head("- 상태: 구현 완료")],
    ["anchor-forbidden", head("- 상태: 구현 주장 없음", `- 근거: ${DIR_ANCHOR}`)],
  ];

  it("①~⑤는 앵커 존재 여부와 무관하게 그대로 판정에 실린다", () => {
    for (const [violation, source] of FAILING_SOURCES) {
      for (const anchorExists of [false, true]) {
        const verdict = judge(parseDocStatus(source), anchorExists);
        const label = `${violation} / anchorExists=${anchorExists}`;
        expect(verdict, `${label} 실제: ${JSON.stringify(verdict)}`).toHaveProperty("ok", false);
        expect(verdict, label).toHaveProperty("violation", violation);
      }
    }
  });

  it("`Violation`의 갈래가 하나도 빠지지 않고 결선됐다 — 이 파일의 자기 점검", () => {
    // 축 2가 ①~⑦을, 축 8이 ⑧을 든다. 위반 하나가 §3.1에 추가되고 여기 케이스가 안 늘어나면
    // 그 사실을 아무도 세지 않는다. 목록을 한 자리에 두어 `Violation` 유니온이 넓어질 때
    // 이 단언이 먼저 죽게 한다(타입 레벨 전수 — 빠지면 컴파일이 실패한다).
    const COVERED: Record<Violation, true> = {
      missing: true,
      duplicate: true,
      "unknown-value": true,
      "anchor-required": true,
      "anchor-forbidden": true,
      "anchor-missing": true,
      "anchor-present": true,
      "context-unterminated": true,
    };
    expect(Object.keys(COVERED).sort()).toEqual([
      "anchor-forbidden",
      "anchor-missing",
      "anchor-present",
      "anchor-required",
      "context-unterminated",
      "duplicate",
      "missing",
      "unknown-value",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 축 5 — 이 QA가 잡아 고쳐진 두 자리의 회귀 방지 (§3.1 `Verdict` · §4 파일 경계)
//
// 둘 다 처음에는 `it.todo`(판정 필요)였다. 문서와 구현이 함께 개정됐으므로 단언으로
// 승격한다 — **고쳐진 것을 재지 않으면 되돌아온 것도 모른다.** 둘 다 회귀했을 때의 양태가
// 조용하다는 것이 승격의 근거다: 평탄화는 타입만 넓히고 테스트는 그린이며, 부작용 복귀는
// "계약 위반"이 아니라 "테스트 파일이 통째로 사라짐"으로 나타난다.
//
// **이 축만 파일을 연다.** 축 1~4의 무(無)I/O 원칙이 지키려던 것은 *"docs/ 내용에 인질로
// 잡히지 않는다"*이고, 여기가 여는 것은 `scripts/`의 파일 경계라 그 원칙에 걸리지 않는다.
// ---------------------------------------------------------------------------

describe("DOC-STATUS §3.1 · §4 — 축 5: 회귀 방지", () => {
  it("판정 성공 갈래는 `status`를 통째로 든다 — 세 값 전수 (§3.1)", () => {
    // §3.1 — *"성공 갈래는 `status`를 **통째로** 든다 — `kind` + 옵셔널 `anchor`로 평탄화하면
    // `{kind:"no-claim", anchor:"x"}`가 타입상 합법이 되어 위 불변이 판정 경계에서 풀린다."*
    // 세 값을 한자리에 모아 전수로 든다. 축 1이 값별 맥락에서 같은 것을 재지만, 그쪽이
    // 죽으면 진단은 *"그 값의 파싱"*을 가리키고 여기가 죽으면 *"판정 타입의 형태"*를 가리킨다.
    expectVerdictOk(head("- 상태: 구현 완료", `- 근거: ${DIR_ANCHOR}`), true, {
      kind: "implemented",
      anchor: DIR_ANCHOR,
    });
    expectVerdictOk(head("- 상태: 구현 전", `- 근거: ${FILE_ANCHOR}`), false, {
      kind: "not-yet",
      anchor: FILE_ANCHOR,
    });
    expectVerdictOk(head("- 상태: 구현 주장 없음"), false, { kind: "no-claim" });

    // `doc`이 되살아나지 않는다 — §3.1: *"문서 이름은 이 타입에 없다. 판정 함수는 소스
    // 텍스트와 앵커 존재 여부만 받으므로 파일명을 원리적으로 만들 수 없다."* 위 `toEqual`이
    // 이미 잉여 필드를 잡지만, 그 사실이 실패 메시지에 이름으로 남게 따로 센다.
    const verdict = judge(parseDocStatus(head("- 상태: 구현 주장 없음")), false);
    expect(Object.keys(verdict).sort()).toEqual(["ok", "status"]);
  });

  it("불가능한 상태가 타입 레벨에서 배제된다 — 이 케이스는 tsc가 잰다 (§3.1)", () => {
    // **런타임 단언이 아니다.** `@ts-expect-error`는 *에러가 나지 않으면* 컴파일이 실패하므로,
    // 아래 세 줄은 `pnpm typecheck`에게 *"여전히 불가능한가"*를 묻는다. §3.1이 평탄화를 금지한
    // 근거는 런타임 값이 아니라 **타입이 무엇을 허용하는가**였고, 그것을 재는 자리가 여기다.

    // @ts-expect-error §3.1 — `no-claim`은 앵커를 갖지 않는다(닫힌 유니온의 불변).
    const withAnchor: DocStatus = { kind: "no-claim", anchor: DIR_ANCHOR };
    // @ts-expect-error §3.1 — 성공 갈래는 `status`를 통째로 든다. 평탄화된 형태는 타입이 아니다.
    const flattened: Verdict = { ok: true, kind: "no-claim" };
    // @ts-expect-error §3.1 — *"문서 이름은 이 타입에 없다"*(순수 판정이 만들 수 없는 값).
    const withDoc: Verdict = { ok: true, status: { kind: "no-claim" }, doc: "DOC-STATUS.md" };
    // 대조군 — 올바른 형태는 통과해야 한다. 없으면 위 셋이 "타입이 전부 거부한다"와 구별되지 않는다.
    const wellFormed: Verdict = { ok: true, status: { kind: "implemented", anchor: DIR_ANCHOR } };

    expect([withAnchor, flattened, withDoc, wellFormed]).toHaveLength(4);
  });

  it("판정과 실행부가 서로 다른 파일에 산다 (§4)", () => {
    expect(existsSync(PURE_MODULE), PURE_MODULE).toBe(true);
    expect(existsSync(GATE_MODULE), GATE_MODULE).toBe(true);

    // **실행부에는 `.d.mts`가 없다.** 있으면 계약 테스트가 실행부를 타입 안전하게 임포트할 수
    // 있게 되어 D-2가 그대로 되살아난다 — 타입 선언의 부재가 곧 *"이건 임포트하는 것이
    // 아니다"*의 표시이고, 이 레포에서 그 구별을 하는 기계는 여기뿐이다.
    expect(existsSync(join(SCRIPTS_DIR, "doc-status.d.mts"))).toBe(true);
    expect(existsSync(join(SCRIPTS_DIR, "check-doc-status.d.mts"))).toBe(false);
  });

  it("순수 판정 모듈은 임포트만으로 출력하지도 종료하지도 않는다 (§4)", () => {
    // **자식 프로세스로 잰다.** 이 파일은 이미 그 모듈을 임포트한 뒤라 여기서는 부작용을
    // 관측할 수 없고(모듈 평가는 한 번뿐), 부작용이 있었다면 관측할 자리는 이미 지나갔다 —
    // vitest 워커가 죽어 이 파일이 통째로 사라지는 형태로.
    //
    // `cwd`를 리포 밖(임시 디렉터리)에 둔다: 모듈이 상대 경로로 `docs/`를 읽으려 하면 여기서
    // 죽는다. 개정 전 구현은 정확히 이 프로브에서 `REACHED` 미출력 + exit 1로 잡혔다.
    const probe = `await import(${JSON.stringify(pathToFileURL(PURE_MODULE).href)});process.stdout.write("REACHED");`;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", probe], {
      cwd: tmpdir(),
      encoding: "utf8",
    });
    expect(result.stderr, "순수 모듈이 stderr에 무언가를 썼다").toBe("");
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    // 정확 일치라 **출력 0바이트**까지 함께 잰다 — 게이트 리포트가 한 줄이라도 새면 죽는다.
    // 그리고 임포트 *다음 줄*이 실행됐다는 것이 `process.exit()`가 불리지 않았다는 증거다.
    expect(result.stdout).toBe("REACHED");
  });

  it("실행부는 여전히 게이트를 돌린다 — 침묵이 «판정이 사라져서»가 아니다", () => {
    // 위 단언의 양성 대조군. 실행부까지 조용해지면 `pnpm check:docs`가 아무것도 검사하지 않는
    // 상태로 그린이 되고, 그것이 §4가 *"침묵 통과는 이 게이트가 존재하는 이유 그 자체"*라고
    // 부른 실패다. **exit code는 재지 않는다** — 실물 `docs/`가 레드인 날 이 단언까지 죽으면
    // 축 5가 문서 내용에 인질로 잡힌다. 재는 것은 *"무언가를 말한다"*뿐이다(§4의 출력 요구).
    const probe = `await import(${JSON.stringify(pathToFileURL(GATE_MODULE).href)});`;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", probe], {
      cwd: tmpdir(),
      encoding: "utf8",
    });
    expect((result.stdout + result.stderr).length).toBeGreaterThan(0);
  });

  it.todo("[미규정] §4의 *'발견한 .md 수 = 판정한 수'* 대조는 순수 함수 둘의 밖에 있다");
});

// ---------------------------------------------------------------------------
// 축 6 — §5.1·§5.2: §5 표 파서 `parseStatusTable`
//
// **왜 이 축이 따로 있는가.** §3의 머리 판정은 문서가 *스스로 신고한 값*을 실물과 맞출 뿐이고,
// 그 값이 §5가 **배정한** 값인지는 아무도 묻지 않았다 — §5.1이 *"배정 권한은 §5 표에 있는데
// 표를 읽는 기계가 없으면 `구현 주장 없음`이 도피처가 된다"*고 부른 구멍이다. 축 6은 그 대조의
// **왼쪽 피연산자**(표 → 배정 맵)를 재고, 대조 자체는 실행부에 있어 여기서 열 수 없다(머리말).
//
// **이 축의 실패 양태도 그린이다.** §5.1은 §3.3을 인용해 *"관대하지 않다"*고 선언했는데,
// 관대해지는 회귀는 실패가 아니라 통과를 만든다 — 표의 한 행이 조용히 무시되면 그 문서는
// «표에 없는 문서»에도 «값 어긋남»에도 걸리지 않고, 넷을 다 만들고도 구멍이 남는다(§5.2 첫 행이
// 내용 판별을 기각한 근거 그대로). 그래서 축 6-3의 케이스들은 전부 *"실패로 떨어져야 한다"*를
// 단언하고, 그 옆에 **정상 행을 한 줄 같이 둔다** — 나쁜 행만 조용히 건너뛰는 구현은 `ok:true` +
// 정상 행 하나를 내므로 그 형태로 잡힌다.
// ---------------------------------------------------------------------------

/** §5.1 — 앵커 없음을 뜻하는 기호. **EM DASH(U+2014)**이고 ASCII 하이픈이 아니다. */
const EM_DASH = "—";

/** 실물 §5 표의 헤더 두 줄. §5.2 첫 행 — *"파이프 블록의 첫 두 행은 데이터가 아니다."* */
const TABLE_HEAD = ["| 문서 | `상태:` | `근거:` |", "|---|---|---|"];

function pipeRow(...cells: readonly string[]): string {
  return `| ${cells.join(" | ")} |`;
}

function statusTable(...rows: readonly string[]): string[] {
  return [...TABLE_HEAD, ...rows];
}

/**
 * §5 **밖**의 세 셀 표. §3.2의 실물 표를 본떴다.
 *
 * 픽스처가 이것을 드는 것은 장식이 아니다 — §5.1 — *"이 문서에는 세 셀 표가 여럿이고, 파일
 * 전체에서 세 셀 행을 긁으면 §7의 레퍼런스 판정표가 문서 목록으로 섞여 들어온다"*.
 * (2026-08-23에 그 문장이 §번호 열거를 잃었다 — §3.3의 표는 처음부터 두 셀이었고 같은 날
 * §3.6에 선 세 셀 표 둘이 열거에서 빠져 있었다.)
 * 절 범위를 안 지키는 파서는 축 6-1(양성 대조군)부터 죽는다.
 */
const PRECEDING_THREE_CELL_TABLE = [
  "| 값 | 뜻 | `근거:` |",
  "|---|---|---|",
  "| `구현 완료` | 이 문서의 계약이 실물로 존재한다 | **필수** — 존재해야 하는 경로 |",
  "| `구현 주장 없음` | 이 문서는 구현 상태를 주장하지 않는다 | **금지** |",
];

/**
 * 실물 §5.1의 형태 — **두 셀** 표를 든 `###` 소절.
 *
 * §5.1 인용 블록: *"경계를 `###`로 끊는 이유는 이 절 자신이다. … 지금은 그 표들이 두 셀이라 세 셀
 * 행 문법에 안 걸리지만, 나중에 §5.x에 세 셀 표가 하나 생기면 그 행들이 문서 배정으로 섞인다."*
 */
const SECTION_5_1_TWO_CELL = [
  "### 5.1 표의 행 문법 — 기계 대조의 계약",
  "",
  "| 셀 | 형식 |",
  "|---|---|",
  "| 문서 | 백틱으로 감싼 파일명 하나 |",
  "| `상태:` | §3.2 유니온의 값 하나 |",
];

/** 실물 §7의 형태 — 세 셀 판정표. §5.1이 이름을 들어 *"섞여 들어온다"*고 지목한 표다. */
const SECTION_7_THREE_CELL = [
  "## 7. 레퍼런스 대비 — 가져온 것이 없다",
  "",
  "| 항목 | 판정 | 근거 |",
  "|---|---|---|",
  "| OpenClaw 문서 YAML frontmatter | **안 함** | 구현 상태 필드도 문서↔실물 대조도 없다 |",
  "| hermes `AGENTS.md` | **없음** | 문서 상태 규약이 없다. grep 무소득 |",
];

/**
 * §5 절을 든 최소 문서. 실물 `DOC-STATUS.md`의 **배치**를 재현한다 — §5 앞에 세 셀 표가 있고,
 * §5 뒤에 `###` 소절이 있다. 배치를 재현하지 않으면 *"파일 전체를 긁는 파서"*도 통과한다.
 */
function docWithSection5(
  sectionBody: readonly string[],
  trailing: readonly string[] = SECTION_5_1_TWO_CELL,
): string {
  return [
    "# 문서 지위 선언 규약",
    "",
    "**`neo-agent-main/docs/*.md` 머리가 무엇을 선언해야 하는가의 정본.**",
    "",
    "- 상태: 구현 완료",
    `- 근거: ${FILE_ANCHOR}`,
    "",
    "---",
    "",
    "## 3. 계약 — 머리 필드",
    "",
    "### 3.2 세 값이 무엇을 뜻하는가",
    "",
    ...PRECEDING_THREE_CELL_TABLE,
    "",
    "---",
    "",
    "## 5. 문서별 확정 값",
    "",
    "**아래 표가 이 절의 정본이고, 문서의 수는 여기서 세지 않는다.**",
    "",
    ...sectionBody,
    "",
    ...trailing,
    "",
  ].join("\n");
}

/** §5.1 «문서»·«`상태:`»·«`근거:`» 세 셀이 전부 정상인 행. 축 6-1의 양성 대조군. */
const OK_ROW_DIR_ANCHOR = pipeRow("`APPROVAL-GATE.md`", "구현 완료", `\`${DIR_ANCHOR}\``);
const OK_ROW_FILE_ANCHOR = pipeRow("`DOC-STATUS.md`", "구현 완료", `\`${FILE_ANCHOR}\``);
const OK_ROW_NO_CLAIM = pipeRow("`ARCHITECTURE.md`", "구현 주장 없음", EM_DASH);

/** 위 세 행이 만들어야 하는 배정. 행 상수와 1:1로 이름을 맞춰 둔다. */
const OK_ASSIGN_DIR: TableAssignment = {
  doc: "APPROVAL-GATE.md",
  status: { kind: "implemented", anchor: DIR_ANCHOR },
};
const OK_ASSIGN_FILE: TableAssignment = {
  doc: "DOC-STATUS.md",
  status: { kind: "implemented", anchor: FILE_ANCHOR },
};
const OK_ASSIGN_NO_CLAIM: TableAssignment = {
  doc: "ARCHITECTURE.md",
  status: { kind: "no-claim" },
};
const OK_ASSIGNMENTS: readonly TableAssignment[] = [
  OK_ASSIGN_DIR,
  OK_ASSIGN_FILE,
  OK_ASSIGN_NO_CLAIM,
];

/** 실물 정본. 축 6-7만 이것을 연다. */
const REAL_DOC_STATUS_MD = fileURLToPath(new URL("../../../docs/DOC-STATUS.md", import.meta.url));

/**
 * 배정 목록 **전체**를 형태로 대조한다.
 *
 * `toEqual`이라 잉여 행도 잉여 필드도 잡는다 — 관대한 파서의 전형적 산출인 *"헤더 행이 배정으로
 * 섞임"*·*"§7 행이 문서로 섞임"*이 여기서 죽는다. 부분 일치(`toContainEqual`)로 재면 정확히 그
 * 오염을 놓친다.
 *
 * **순서는 문서 순서로 든다 — 다만 §5.1·§5.2가 순서를 말한 적은 없다.** 표는 읽는 순서가 있는
 * 목록이므로 이 읽기가 자연스럽지만, 문면에서 직접 나온 것이 아니라 **판정 필요**다
 * (`plans/20260813-doc-status-table-qa-report.md` W-2). 순서 없는 대조로 낮추지 않은 것은
 * 그쪽이 *"행을 섞어 내는 파서"*를 통과시키기 때문이다 — 회색지대에서 더 센 쪽을 잡고 기록을
 * 남긴다.
 */
function expectTableRows(source: string, expected: readonly TableAssignment[]): void {
  const result = parseStatusTable(source);
  expect(result, `실제: ${JSON.stringify(result)}`).toEqual({ ok: true, rows: expected });
}

/**
 * **어느** 실패인지까지 단언한다.
 *
 * 축 2의 `expectViolation`과 같은 이유다 — *"실패했다"*만 재면 사유가 서로 자리를 바꿔도 전부
 * 그린이다. §5.1은 자기 갈래 표에 대해 *"위 이름이 그대로 게이트 출력의 라벨이다"*라고 이름을
 * 진단의 주소로 못박았고, 파서 사유도 같은 원리에 선다: `table-ambiguous`(*"배정의 정본이 둘"*)와
 * `row-malformed`(*"한 행을 고쳐라"*)의 처방은 정반대다.
 *
 * **단, 이 사유 이름들의 정본은 `DOC-STATUS.md`가 아니라 `scripts/doc-status.d.mts`다.** §5.1이
 * 갈래 표에 명문화한 것은 사람이 읽는 라벨(«표에 없는 문서»·«문서 없는 행»·«값 어긋남»·«행 파싱
 * 실패»·«구간이 안 닫혔다»)이고, 파서 자신의 사유 중 `section-missing`·`table-missing`은 문서
 * 어디에도 없다 — 리포트 W-1의 *문서 부정확(미기재)*이 이 자리다. 여기 기대값은 그래서 시그니처
 * 파일에서 받았다.
 */
function expectTableFailure(source: string, expected: TableFailureReason): void {
  const result: TableParseResult = parseStatusTable(source);
  expect(result, `실제: ${JSON.stringify(result)}`).toHaveProperty("reason", expected);
  expect(result).toHaveProperty("ok", false);
  const detail = result.ok ? "" : result.detail;
  expect(typeof detail).toBe("string");
  expect(detail.length).toBeGreaterThan(0);
}

describe("DOC-STATUS §5.1 — 축 6-1: 양성 대조군 (정상 표는 배정이 된다)", () => {
  it("세 셀 정상 행 셋이 그대로 배정에 실린다", () => {
    // **이 케이스가 없으면 축 6 전체가 공허하다** — 전부 거부하는 파서도 6-2~6-5를 남김없이
    // 통과시킨다. 세 행은 §5.1의 세 셀 문법을 각각 다른 조합으로 든다:
    //   디렉터리 앵커 / 파일 앵커(§5 말미 — *"규칙 분기가 없다"*) / `—`(앵커 없음).
    expectTableRows(
      docWithSection5(statusTable(OK_ROW_DIR_ANCHOR, OK_ROW_FILE_ANCHOR, OK_ROW_NO_CLAIM)),
      OK_ASSIGNMENTS,
    );
  });

  it("`구현 주장 없음`의 `—`는 EM DASH(U+2014)이고, 배정은 앵커를 갖지 않는다", () => {
    // §5.1 «`근거:`» 칸 — *"백틱으로 감싼 경로 하나, 또는 앵커 없음을 뜻하는 `—`"*.
    // 산출은 §3.1의 `DocStatus` 그대로여야 한다: `no-claim`에 `anchor`가 딸려 오면
    // *"`근거:`의 유무가 kind에 의해 완전히 결정된다"*가 표 경계에서 풀린다.
    expect(EM_DASH.codePointAt(0)).toBe(0x2014);
    expectTableRows(docWithSection5(statusTable(OK_ROW_NO_CLAIM)), [
      { doc: "ARCHITECTURE.md", status: { kind: "no-claim" } },
    ]);
  });

  it("`구현 전` 행도 실린다 — §5.1은 «§3.2 유니온의 값 하나»라고만 적었다", () => {
    // 현재 실물 §5 표에 `구현 전` 행이 없다는 것은 이 시점의 우연이고 문법의 제약이 아니다.
    // 세 값 중 하나만 표에서 못 쓰게 되면 §3.2와 §5.1이 어긋나므로 여기서 못박는다.
    expectTableRows(
      docWithSection5(statusTable(pipeRow("`FUTURE.md`", "구현 전", "`packages/future/src`"))),
      [{ doc: "FUTURE.md", status: { kind: "not-yet", anchor: "packages/future/src" } }],
    );
  });
});

describe("DOC-STATUS §5.1 — 축 6-2: 절 범위는 `## 5.`부터 첫 `###` 앞까지", () => {
  it("`### 5.1` 뒤의 세 셀 표는 범위 밖이다", () => {
    // §5.1 인용 블록 — *"초안은 `## 5.`와 다음 `## ` 사이였는데, 그러면 §5.1(지금 이 소절)의
    // 표들이 범위 안에 든다. … 나중에 §5.x에 세 셀 표가 하나 생기면 그 행들이 문서 배정으로
    // 섞인다. «관대하지 않은 파서»를 정의하는 절이 자기 범위를 관대하게 잡고 있었다."*
    //
    // 그 *"나중에"*를 여기서 만든다: §5.1에 세 셀 표를 놓고, 그 행이 배정에 없다고 단언한다.
    const source = docWithSection5(statusTable(OK_ROW_DIR_ANCHOR), [
      "### 5.1 표의 행 문법 — 기계 대조의 계약",
      "",
      ...statusTable(pipeRow("`GHOST-5-1.md`", "구현 완료", "`packages/ghost/src`")),
    ]);
    expectTableRows(source, [OK_ASSIGN_DIR]);
  });

  it("`## 6.` 경계로 읽는 파서는 여기서 죽는다 — 기각된 대안의 자리", () => {
    // 위와 같은 문장에서 나오지만 재는 것이 다르다. 위는 *"§5.1의 행이 안 섞인다"*이고
    // 여기는 *"§5.1 뒤 · `## 6.` 앞의 표가 «표가 둘»로도 읽히지 않는다"* — 초안 경계를 쓰는
    // 구현은 절 범위 안에서 파이프 블록을 둘 보게 되어 §5.2의 `table-ambiguous`로 떨어진다.
    // 실패 사유가 갈리므로 두 케이스는 서로를 대체하지 못한다.
    const source = docWithSection5(statusTable(OK_ROW_NO_CLAIM), [
      ...SECTION_5_1_TWO_CELL,
      "",
      "### 5.2 경계 셋",
      "",
      ...statusTable(pipeRow("`GHOST-5-2.md`", "구현 완료", "`packages/ghost/src`")),
      "",
      "## 6. 수 서술 금지의 예외",
      "",
      "본문.",
    ]);
    expectTableRows(source, [OK_ASSIGN_NO_CLAIM]);
  });

  it("§7 형태의 세 셀 판정표가 배정으로 섞이지 않는다", () => {
    // §5.1 — *"파일 전체에서 세 셀 행을 긁으면 §7의 레퍼런스 판정표가 문서 목록으로 섞여
    // 들어온다. §2.2의 처방 그대로다 — 검사는 파일이 아니라 **주장이 사는 절 범위**에 건다."*
    //
    // 섞이면 두 형태 중 하나로 나타난다: (a) `안 함`이 유니온 밖이라 `row-malformed`,
    // (b) 관대한 파서면 `OpenClaw 문서 YAML frontmatter`가 문서로 실린다. `toEqual`이 둘 다 잡는다.
    const source = docWithSection5(statusTable(OK_ROW_DIR_ANCHOR, OK_ROW_NO_CLAIM), [
      ...SECTION_5_1_TWO_CELL,
      "",
      ...SECTION_7_THREE_CELL,
    ]);
    expectTableRows(source, [OK_ASSIGN_DIR, OK_ASSIGN_NO_CLAIM]);
  });

  it("`## 5.` 절이 아예 없으면 section-missing", () => {
    // fail-closed. 절이 사라진 문서를 *"배정이 0건"*으로 읽으면 §5.1의 «표에 없는 문서» 갈래가
    // `docs/` 전체를 한꺼번에 뱉는 형태로만 나타나거나, 실행부 구현에 따라 조용해진다.
    const source = [
      "# 문서 지위 선언 규약",
      "",
      "- 상태: 구현 완료",
      `- 근거: ${FILE_ANCHOR}`,
      "",
      "## 4. 게이트 — 무엇을 검사하는가",
      "",
      ...PRECEDING_THREE_CELL_TABLE,
      "",
      "## 6. 수 서술 금지의 예외",
      "",
      "본문.",
      "",
    ].join("\n");
    expectTableFailure(source, "section-missing");
  });
});

describe("DOC-STATUS §5.1 — 축 6-3: 관대하지 않다", () => {
  // §5.1 — *"§3.3과 같은 이유로 **관대하지 않다.** 마크업과 괄호 주석을 허용하면
  // `구현 완료(검색 제외)`가 머리 대신 표에서 되살아난다 — F-2를 한 층 아래로 옮기는 것뿐이다."*
  //
  // 각 픽스처는 **정상 행 하나 + 문제 행 하나**다. 문제 행만 조용히 건너뛰는 구현은
  // `{ok:true, rows:[정상 하나]}`를 내므로 `expectTableFailure`의 `ok:false`에서 죽는다.
  const MALFORMED: readonly (readonly [string, string])[] = [
    // §5 말미 — *"표의 문서 셀에서 볼드와 괄호 주석을 뺐다. `DOC-STATUS.md` 행이
    // ``**`DOC-STATUS.md`** (이 문서)`` 형태였는데, §5.1이 그 자리를 기계가 읽을 대상으로
    // 확정했으므로 §3.3과 같은 이유로 마크업을 허용하지 않는다."* — 실물 문면 그대로 든다.
    ["문서 셀의 볼드", pipeRow("**`DOC-STATUS.md`**", "구현 완료", `\`${FILE_ANCHOR}\``)],
    [
      "문서 셀의 괄호 주석",
      pipeRow("`DOC-STATUS.md` (이 문서)", "구현 완료", `\`${FILE_ANCHOR}\``),
    ],
    // §5.1 «문서» 칸 — *"백틱으로 감싼 파일명 하나"*. 백틱이 없으면 형식이 아니다.
    // **§5.2 첫 행이 이 케이스를 위해 위치 기반을 골랐다**: 내용으로 헤더를 판별하면
    // (백틱 없는 문서 셀은 건너뛴다) *"데이터 행이 백틱을 잃었을 때 그 문서가 어느 갈래에도
    // 안 걸린다 — 넷을 다 만들고도 구멍이 남는다."* 그 구멍을 직접 겨눈다.
    ["백틱 없는 파일명", pipeRow("DOC-STATUS.md", "구현 완료", `\`${FILE_ANCHOR}\``)],
    // §5.1 «`상태:`» 칸 — *"§3.2 유니온의 값 하나. 순수 텍스트 정확 일치"*.
    ["`상태:` 셀의 볼드", pipeRow("`DOC-STATUS.md`", "**구현 완료**", `\`${FILE_ANCHOR}\``)],
    ["`상태:` 셀의 백틱", pipeRow("`DOC-STATUS.md`", "`구현 완료`", `\`${FILE_ANCHOR}\``)],
    // F-2의 실물 문면. §5.1이 이름을 들어 *"머리 대신 표에서 되살아난다"*고 지목한 형태다.
    [
      "`상태:` 셀의 괄호 한정",
      pipeRow("`SEARCH.md`", "구현 완료(검색 제외)", "`packages/store/src`"),
    ],
    [
      "유니온 밖의 값(§3.5 `설계 확정`)",
      pipeRow("`SEARCH.md`", "설계 확정", "`packages/store/src`"),
    ],
    // §5.1 «`근거:`» 칸 — *"백틱으로 감싼 경로 하나, 또는 앵커 없음을 뜻하는 `—`"*. 둘 중
    // 어느 형식도 아니다.
    ["백틱 없는 경로", pipeRow("`DOC-STATUS.md`", "구현 완료", FILE_ANCHOR)],
    // `—`(U+2014)가 아닌 ASCII 하이픈. §3.3의 *"정확 일치"*가 표에 내려온 자리다.
    ["`—` 대신 ASCII 하이픈", pipeRow("`ARCHITECTURE.md`", "구현 주장 없음", "-")],
    // §5.1 — *"§5 표의 각 행은 정확히 세 셀이고, 각 셀은 하나만 든다"*.
    ["셀이 둘인 행", pipeRow("`ARCHITECTURE.md`", "구현 주장 없음")],
    ["셀이 넷인 행", pipeRow("`DOC-STATUS.md`", "구현 완료", `\`${FILE_ANCHOR}\``, "이 문서")],
  ];

  for (const [label, badRow] of MALFORMED) {
    it(`${label} → row-malformed`, () => {
      expectTableFailure(docWithSection5(statusTable(OK_ROW_DIR_ANCHOR, badRow)), "row-malformed");
    });
  }
});

describe("DOC-STATUS §5.1 — 축 6-4: `—`와 경로는 서로를 배제한다 (§3.1 불변의 표 버전)", () => {
  // §3.1 — *"`근거:` 줄의 존재 여부가 kind에 의해 완전히 결정된다 — 옵셔널이 아니다."*
  // `TableAssignment.status`가 머리 판정과 **같은** `DocStatus`이므로(§5.1이 유니온을 늘리지
  // 않은 결과), 아래 두 조합은 표현할 값이 아예 없다 — 통과하는 순간 그 불변이 표에서 풀린다.
  //
  // 사유 이름은 소거법으로 정해진다: `TableFailureReason`은 닫힌 유니온이고, 이 픽스처에는
  // 절도 표도 있으며 표가 하나뿐이고 안 닫힌 구간도 없으므로 남는 것은 `row-malformed`뿐이다.
  it("`구현 주장 없음`에 경로가 붙은 행 → row-malformed", () => {
    // §3.2 — `구현 주장 없음`의 `근거:`는 **금지**. ⑤(anchor-forbidden)의 표 버전이다.
    expectTableFailure(
      docWithSection5(
        statusTable(
          OK_ROW_DIR_ANCHOR,
          pipeRow("`ARCHITECTURE.md`", "구현 주장 없음", "`packages/core/src`"),
        ),
      ),
      "row-malformed",
    );
  });

  it("`구현 완료`에 `—`가 붙은 행 → row-malformed", () => {
    // §3.2 — `구현 완료`의 `근거:`는 **필수**. ④(anchor-required)의 표 버전이다.
    expectTableFailure(
      docWithSection5(statusTable(OK_ROW_DIR_ANCHOR, pipeRow("`MEMORY.md`", "구현 완료", EM_DASH))),
      "row-malformed",
    );
  });

  it("`구현 전`에 `—`가 붙은 행 → row-malformed", () => {
    // §3.2 — *"앵커 없는 `구현 전`은 검사할 수 없고, 검사할 수 없는 선언이 정확히 F-1이 7일간
    // 산 방식이다."* 표에서 앵커를 뺄 수 있으면 그 F-1이 배정 쪽으로 되돌아온다.
    expectTableFailure(
      docWithSection5(statusTable(OK_ROW_DIR_ANCHOR, pipeRow("`FUTURE.md`", "구현 전", EM_DASH))),
      "row-malformed",
    );
  });
});

describe("DOC-STATUS §5.2 — 축 6-5: 경계 셋", () => {
  it("헤더 행과 구분선 행은 배정이 되지 않는다 — 위치로 자른다", () => {
    // §5.2 첫 행 — *"파이프 블록의 첫 두 행은 데이터가 아니다. 마크다운 표의 정의상 고정
    // 2행이므로 **위치**로 자른다."* 축 6-1이 이미 이것을 간접으로 재지만(헤더가 섞이면
    // `toEqual`이 죽는다), 진단이 *"헤더 배제"*를 이름으로 가리키게 여기서 따로 든다.
    const result = parseStatusTable(docWithSection5(statusTable(OK_ROW_DIR_ANCHOR)));
    const rows = "rows" in result ? result.rows : [];
    expect(rows.map((row) => row.doc)).toEqual(["APPROVAL-GATE.md"]);
  });

  it("헤더 라벨이 §5의 것과 달라도 첫 두 행은 배제된다 — 내용 판별이 아니다", () => {
    // 위 문장의 *"위치로"*가 재어지는 자리. 라벨 문자열(`문서`·`` `상태:` ``)에 의존하는 구현은
    // **내용 판별**이고, §5.2가 기각한 것이 정확히 그것이다(기각 근거는 축 6-3의 백틱 없는
    // 파일명 표본이 든다). 두 케이스가 짝이라 한쪽만으로는 대안이 갈리지 않는다.
    const source = docWithSection5([
      pipeRow("파일", "지위", "앵커"),
      "|:---|:---:|---|",
      OK_ROW_DIR_ANCHOR,
    ]);
    expectTableRows(source, [OK_ASSIGN_DIR]);
  });

  it("절 범위에 표가 둘이면 실패 → table-ambiguous", () => {
    // §5.2 둘째 행 — *"**실패.** 배정의 정본이 둘이 되는 상태를 통과시키지 않는다. 첫 표만
    // 읽으면 새 표가 배정을 바꿔도 아무도 모른다."* 첫 표만 읽는 구현은 `{ok:true}`를 내므로
    // *"실패했다"*를 재는 것만으로 갈린다 — 그래도 사유까지 든다(§5.1: 이름이 곧 주소).
    const source = docWithSection5([
      ...statusTable(OK_ROW_DIR_ANCHOR),
      "",
      "표를 하나 더 두었다 — 배정의 정본이 둘이 된다.",
      "",
      ...statusTable(OK_ROW_NO_CLAIM),
    ]);
    expectTableFailure(source, "table-ambiguous");
  });

  it("절은 있는데 표가 없으면 table-missing", () => {
    // 셋째 경계(머리 판정 실패 문서를 값 어긋남 대조에서 건너뛰고 한 줄로 밝힌다)는 **실행부**의
    // 판정이라 이 파일이 열 수 없다 — 머리말에 적어 둔 대로 T-005 역검증의 자리다. 대신 절
    // 범위에서 표 자체가 사라지는 경로를 fail-closed로 못박는다: 배정 0건을 성공으로 내면
    // §5.1의 «표에 없는 문서»가 `docs/` 전량으로 뒤집혀 진단이 무의미해진다.
    expectTableFailure(
      docWithSection5(["표가 없는 절 본문이다.", "", "파이프 블록이 하나도 없다."]),
      "table-missing",
    );
  });

  it("헤더 두 줄만 있고 데이터 행이 0개여도 table-missing", () => {
    // 위와 같은 갈래의 다른 입구. §5.2가 첫 두 행을 **위치**로 자르므로, 그 둘만 남은 블록은
    // *"표는 있는데 데이터 행이 없다"*가 된다 — `doc-status.d.mts`의 `table-missing` 주석이
    // *"절 범위에 표(또는 데이터 행)가 없다"*로 두 입구를 한 사유에 묶었다.
    expectTableFailure(docWithSection5(statusTable()), "table-missing");
  });

  // §5.2 말미 인용 블록 — *"**미규정 — 같은 문서가 두 행에 배정되는 경우.** 위 셋과 함께 정하지
  // 않았고 구현이 마주쳤다. D-2와 같은 모양의 모호함이라 그 판정 근거를 그대로 적용해
  // fail-closed로 두었으나, **이 문서가 정한 바는 아니다** — 판정은 `K-034`에 속한다."*
  // 문서가 스스로 미규정이라 적은 자리를 이 파일이 임의로 못박으면 `K-034`의 판정을 선점한다.
  it.todo(
    "[미규정] 같은 문서가 두 행에 배정될 때의 사유 — §5.2가 스스로 미규정이라 적었다 (K-034)",
  );
});

describe("DOC-STATUS §5.1 — 축 6-6: 표 실패 사유는 §3.1의 `Violation`과 다른 이름공간이다", () => {
  it("`TableFailureReason`의 사유가 하나도 빠지지 않고 결선됐다 — 이 축의 자기 점검", () => {
    // 축 4의 `COVERED`와 같은 장치다. `TableFailureReason`에 사유가 하나 늘고 케이스가 안 늘면
    // 그 사실을 아무도 세지 않는다(타입 레벨 전수 — 빠지면 컴파일이 실패한다).
    const TABLE_COVERED: Record<TableFailureReason, true> = {
      "section-missing": true,
      "table-missing": true,
      "table-ambiguous": true,
      "row-malformed": true,
      "inert-unclosed": true,
    };
    expect(Object.keys(TABLE_COVERED).sort()).toEqual([
      "inert-unclosed",
      "row-malformed",
      "section-missing",
      "table-ambiguous",
      "table-missing",
    ]);
  });

  it("두 유니온이 서로를 받아들이지 않는다 — 이 케이스는 tsc가 잰다", () => {
    // §5.1 — *"§3.1의 `Violation`을 늘리지 않는다"*, 그 유니온은 머리 판정이고 표 대조는
    // *"판정 함수가 만들 수 없는 값이다"*. 둘이 한 유니온으로 합쳐지면 축 4의 전수 단언이 표
    // 실패까지 세게 되어, 머리말의 불변 선언이 드는 «머리 판정 §3.1» 갈래가 조용히 넓어진다
    // (2026-08-17 — 머리가 수를 빼고 갈래를 §포인터로 들도록 개정됐다. 그 전 문면은
    // *"일곱 가지 실패"*였다). **런타임 단언이 아니다** — `@ts-expect-error`는 에러가 없으면
    // 컴파일이 실패한다.

    // @ts-expect-error §5.1 — 머리 판정의 위반은 표 실패 사유가 아니다.
    const violationAsTableReason: TableFailureReason = "missing";
    // @ts-expect-error §5.1 — 반대 방향도 같다. 이쪽이 뚫리면 «머리 판정 §3.1» 갈래가 표
    // 실패까지 세게 된다. 2026-08-23에 그 유니온이 실제로 일곱에서 여덟이 됐고(⑧
    // `context-unterminated`), 그때 넓어진 것이 이 단언이 지키는 쪽이 아니라는 것이 계약이다.
    const tableReasonAsViolation: Violation = "row-malformed";
    expect([violationAsTableReason, tableReasonAsViolation]).toHaveLength(2);
  });
});

describe("DOC-STATUS §5 — 축 6-7: 실물 문서의 §5 표 (자기 참조)", () => {
  it("실물 `docs/DOC-STATUS.md`의 §5 표가 정상 파싱되고 자기 행을 든다", () => {
    // **축 6에서 파일을 여는 유일한 케이스다.** 픽스처만으로는 *"문법은 맞는데 실물 표를 못
    // 읽는 파서"*가 그린이고, 그 상태에서 게이트는 배정 0건으로 조용히 통과한다.
    //
    // 인질 범위를 **자기 행 하나**로 좁혔다. `DOC-STATUS.md`의 행은 이 문서가 §9에서
    // *"이때 `DOC-STATUS.md` 자신이 `구현 완료`로 바뀌었다"*고 기록한 자리이자, 머리 정정 주석이
    // 첫 시험 사례로 든 자리다 — 이것이 바뀌면 게이트 자신의 앵커가 바뀐 것이므로 red가 옳다.
    const source = readFileSync(REAL_DOC_STATUS_MD, "utf8");
    const result = parseStatusTable(source);
    expect(result, `실제: ${JSON.stringify(result).slice(0, 600)}`).toHaveProperty("ok", true);

    const rows = "rows" in result ? result.rows : [];
    expect(rows.find((row) => row.doc === "DOC-STATUS.md")).toEqual({
      doc: "DOC-STATUS.md",
      status: { kind: "implemented", anchor: FILE_ANCHOR },
    });

    // **행의 수는 세지 않는다.** §5 서두 — *"아래 표가 이 절의 정본이고, 문서의 수는 여기서
    // 세지 않는다(손으로 센 수는 문서가 하나 늘면 어긋난다)."* 그 금지는 이 파일에도 걸린다.
    // 재는 것은 성질뿐이다: 비어 있지 않고, 모든 행이 `.md` 문서에 §3.2의 세 값 중 하나를 준다.
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      expect(row.doc, JSON.stringify(row)).toMatch(/^[A-Z0-9-]+\.md$/);
      expect(["implemented", "not-yet", "no-claim"], JSON.stringify(row)).toContain(
        row.status.kind,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 축 7 — §5.3: 역방향 집합 술어 `uncoveredPackages`
//
// **이 축이 존재하는 이유가 §5.3의 「자리」 판정이다.** §5.1은 표 대조를 통째로 실행부에
// 두어 단위 테스트가 붙지 않았는데, 역방향은 두 피연산자가 모두 인자로 들어오므로 술어를
// 순수로 뽑을 수 있다. 검사를 늘리면서 그 검사를 아무도 재지 않는 상태를 함께 만들지
// 않는다는 것이 그 분할의 값이고, 이 축이 그 값을 실현한다.
//
// 실물 `docs/`도 `packages/`도 열지 않는다 — 축 1~4와 같은 무(無)I/O 원칙이다.
// ---------------------------------------------------------------------------

describe("DOC-STATUS §5.3 — 축 7: 역방향 「덮였다」 판정", () => {
  it("앵커가 패키지 하위 경로면 덮는다", () => {
    expect(uncoveredPackages(["packages/core/src"], ["core"])).toEqual([]);
  });

  it("앵커가 패키지 디렉터리 자신이어도 덮는다", () => {
    expect(uncoveredPackages(["packages/core"], ["core"])).toEqual([]);
  });

  it("한 패키지를 여러 문서가 덮어도 된다 (store의 실제 형태)", () => {
    // SESSION-STORE.md와 SEARCH.md가 둘 다 store를 덮는다. 중복은 위반이 아니다.
    expect(
      uncoveredPackages(["packages/store/src", "packages/store/src/search.ts"], ["store"]),
    ).toEqual([]);
  });

  it("접두가 겹치는 다른 패키지의 앵커가 덮지 않는다 — 경계에 `/`를 요구한다", () => {
    // 맨 `anchor.startsWith(prefix)`면 `packages/storefront/src`가 접두 일치로
    // `store`를 덮어 **문서 없는 패키지가 조용히 통과한다.** §5.3이 「덮였다」의 정의에
    // 경계 조건을 넣은 근거가 이것이고, 이 단언이 그 경계를 재는 유일한 자리다.
    //
    // 방향에 주의: 덮이는 쪽이 짧은 이름(`store`)이다. 반대로 쓰면(긴 이름을 대상으로)
    // 버그가 있어도 초록이 나온다 — 2026-08-14 역검증이 실제로 그것을 잡았다.
    expect(uncoveredPackages(["packages/storefront/src"], ["store"])).toEqual(["packages/store"]);
  });

  it("덮이지 않은 패키지를 경로 형태로 낸다", () => {
    expect(uncoveredPackages(["packages/core/src"], ["core", "providers"])).toEqual([
      "packages/providers",
    ]);
  });

  it("앵커가 비면 전 패키지가 덮이지 않는다 — fail-closed 방향", () => {
    // 표를 읽지 못한 상태가 「전부 통과」로 보이면 안 된다. 실행부의 그물과 같은 방향이다.
    expect(uncoveredPackages([], ["core", "providers"])).toEqual([
      "packages/core",
      "packages/providers",
    ]);
  });

  it("패키지가 비면 빈 배열이다 — 0개 판정은 실행부의 그물이지 술어의 일이 아니다", () => {
    // §5.3은 「패키지 0개 → 실패」를 실행부에 배정했다. 술어가 그것을 흉내 내면
    // 같은 판정이 두 자리에 살게 되고, 어느 쪽이 정본인지 알 수 없어진다.
    expect(uncoveredPackages(["packages/core/src"], [])).toEqual([]);
  });

  it("앵커 목록도 패키지 목록도 변형하지 않는다", () => {
    const anchors = ["packages/core/src"];
    const packages = ["core", "providers"];
    uncoveredPackages(anchors, packages);
    expect(anchors).toEqual(["packages/core/src"]);
    expect(packages).toEqual(["core", "providers"]);
  });
});

// ---------------------------------------------------------------------------
// 축 8 — §3.6: 「선언이 살 수 없는 구간」 (구간 마스킹 · C-1~C-11)
//
// **이 축이 §3.3 표의 구간 행의 실물이다.** 축 3은 그 표의 행들을 `R…` describe로 드는데,
// 2026-08-23에 행이 하나 붙었다 — *"HTML 주석·펜스 코드 블록 안은 안 읽는다"*. 그 행의 근거
// 칸이 스스로 *"접두 고정이 못 가르는 자리다"*라고 적었으므로 축 3의 수단(열 0 접두)으로는
// 재어지지 않고, 계약 전체가 §3.6으로 갈라져 나갔다. 그래서 그 행은 축 3이 아니라 **여기**
// 산다. **상호 참조는 축 3 머리에도 있다** — 한쪽에만 두면 §3.3의 그 행이 어느 축에도 안 선
// 것처럼 읽힌다.
//
// **기대값은 전부 §3.6 C-1~C-11 · §3.1 위반 ⑧ · §5.1의 문면에서만 뽑았다.** 구현 본문
// (`scripts/doc-status.mjs`·`scripts/doc-citation.mjs`)은 이 축을 쓰는 동안 텍스트로도 열지
// 않았고, 시그니처는 `scripts/doc-status.d.mts`에서만 받았다(머리말의 선언 그대로).
//
// **이 축은 마스킹 배선이 착지하기 전까지 red다.** §3.6이 *"오늘 구현은 없다 — 이 절은 계약만
// 세운다"*라고 스스로 적었고, 아래 케이스 상당수는 그 문장이 참인 동안 붉는다. **red → green
// 전이가 이 단정들이 공허하지 않다는 증거이므로**, 통과를 만들려고 단언을 낮추지 않는다.
//
// **이 축이 재지 않는 것.**
//   - 술어 자신의 표면(`scanInertContext`·`htmlCommentSpans`·`InertKind`)의 계약 — 그쪽은
//     `doc-citation.contract.test.ts`가 든다. 여기서 재는 것은 **이 규약의 파서가 그 술어를
//     실제로 앞세우는가**뿐이므로, 마스킹 결과 문자열을 직접 보지 않고 판정으로만 잰다.
//   - C-9의 *"같은 자리에서 둘이 후보이면"* 우선순위와 *"코드 표기는 마스킹 대상이 아니다 —
//     투과시킬 뿐이다"*의 후반 — 마스킹 결과를 직접 봐야 갈리므로 같은 이유로 저쪽이다.
//   - 실행부의 라벨(«구간이 안 닫혔다»가 게이트 출력에 그 이름으로 뜨는가) — §5.1이
//     *"위 이름이 그대로 게이트 출력의 라벨이다"*라고 든 자리이고 실행부의 산출이다.
// ---------------------------------------------------------------------------

/** C-8의 양성 대조군이 쓰는 자리. 이 모듈은 최상위에서 `typescript`를 임포트한다(§3.6 C-8). */
const LEXER_MODULE = join(SCRIPTS_DIR, "comment-lexer.mjs");

/** 자식 프로세스로 재는 두 케이스(C-7·C-8)의 공통 실행부. `cwd`는 축 5와 같이 리포 밖이다. */
function runProbe(probe: string, ...args: readonly string[]) {
  return spawnSync(process.execPath, ["--input-type=module", "-e", probe, ...args], {
    cwd: tmpdir(),
    encoding: "utf8",
  });
}

/**
 * 문자열이 든 숫자 런을 순서대로 낸다.
 *
 * `detail`의 **형식**은 정본이 정하지 않는다 — C-10의 타입 블록이 정하는 것은 `unclosed`가
 * `kind`·`line`·`column`을 든다는 것이고, 그것이 문장으로 어떻게 직렬화되는지는 미규정이다.
 * 그래서 형식에 기대지 않고 부류 문자열이 들어 있는지와 두 수가 들어 있는지만 잰다.
 */
function digitRuns(text: string): string[] {
  const runs: string[] = [];
  let current = "";
  for (const ch of text) {
    if (ch >= "0" && ch <= "9") {
      current += ch;
    } else if (current.length > 0) {
      runs.push(current);
      current = "";
    }
  }
  if (current.length > 0) {
    runs.push(current);
  }
  return runs;
}

/** 머리 판정의 `detail`을 꺼낸다. 실패 갈래가 아니면 빈 문자열이라 아래 단언이 죽는다. */
function failureDetail(source: string): string {
  return asFailure(parseDocStatus(source))?.detail ?? "";
}

const IMPLEMENTED_DIR: DocStatus = { kind: "implemented", anchor: DIR_ANCHOR };

// §3.6 실증 표의 네 형태. **이 넷이 이 카드가 존재하는 이유이므로 픽스처를 한 자리에 모아
// 이름을 표의 이름과 맞춘다** — 스크래치패드 탐침으로만 두면 다음 사이클이 마스킹을 되돌려도
// 게이트가 그린이다.

/** 실증 ① 머리 오탐 — *"실물 머리는 한 글자도 안 바뀌었다"*. 오늘 `duplicate`가 난다. */
const EVIDENCE_HEAD_FALSE_POSITIVE = head(
  "- 상태: 구현 완료",
  `- 근거: ${DIR_ANCHOR}`,
  "<!--",
  "- 상태: 구현 전",
  "-->",
);

/** 실증 ② 머리 위조 — *"화면에는 지위 선언이 하나도 없다"*. 오늘 `implemented` 적합이 난다. */
const EVIDENCE_HEAD_FORGERY = head("<!--", "- 상태: 구현 완료", `- 근거: ${DIR_ANCHOR}`, "-->");

/** 실증 ③ 표 오탐 — 주석 속 파이프 줄 하나. 오늘 `table-ambiguous` fail-closed가 난다. */
const EVIDENCE_TABLE_FALSE_POSITIVE = docWithSection5([
  ...statusTable(OK_ROW_DIR_ANCHOR, OK_ROW_FILE_ANCHOR, OK_ROW_NO_CLAIM),
  "",
  "<!--",
  pipeRow("`GHOST.md`", "구현 완료", "`packages/ghost`"),
  "-->",
]);

/** 실증 ④ 펜스 오탐 — *"예시가 선언으로 세어졌다"*. 오늘 `duplicate`가 난다. */
const EVIDENCE_FENCE_FALSE_POSITIVE = head(
  "- 상태: 구현 완료",
  `- 근거: ${DIR_ANCHOR}`,
  "",
  "```markdown",
  "- 상태: 구현 완료",
  "- 근거: <경로>",
  "```",
);

describe("DOC-STATUS §3.6 — 축 8-0: 실증 넷 (§3.6이 실물로 재현해 둔 우회)", () => {
  it("실증 ① 머리 오탐 — 주석 속 옛 값이 `duplicate`를 만들지 않는다", () => {
    // §3.6 실증 표 1행. 심은 것은 *"머리의 `- 상태:` 줄 뒤에 `<!--` 로 감싼 옛 값 한 줄"*이고
    // 오늘 판정은 `duplicate`다 — 그 표가 *"실물 머리는 한 글자도 안 바뀌었다"*고 든 자리다.
    expectStatus(EVIDENCE_HEAD_FALSE_POSITIVE, IMPLEMENTED_DIR);
  });

  it("실증 ② 머리 위조 — 주석 안에만 있는 선언은 선언이 아니다 → missing", () => {
    // §3.6 실증 표 2행. C-1이 이 자리를 마스킹으로 배제하는 근거가 *"화면에 안 보인다"*이고,
    // *"보이는 것과 재는 것이 갈리는 순간 위조가 성립"*한다. `missing`이 옳은 판정이다.
    expectViolation(EVIDENCE_HEAD_FORGERY, "missing");
  });

  it("실증 ③ 표 오탐 — 주석 속 파이프 줄이 `table-ambiguous`를 만들지 않는다", () => {
    // §3.6 실증 표 3행. C-6이 마스킹을 표 행 판별의 앞에도 세우는 이유가 이 자리다.
    expectTableRows(EVIDENCE_TABLE_FALSE_POSITIVE, OK_ASSIGNMENTS);
  });

  it("실증 ④ 펜스 오탐 — 머리 창 안 펜스 속 예시가 선언으로 안 세어진다", () => {
    // §3.6 실증 표 4행. C-1이 펜스를 배제 대상으로 든 근거가 *"문서가 **형식을 예시로 드는
    // 자리**다"*이고, 그 표가 이 형태를 *"예시가 선언으로 세어졌다"*로 적었다.
    expectStatus(EVIDENCE_FENCE_FALSE_POSITIVE, IMPLEMENTED_DIR);
  });
});

describe("DOC-STATUS §3.6 C-1 — 축 8-1: 배제되는 자리는 넷이고 수단은 둘", () => {
  it("`>` 인용과 들여쓰기는 **마스킹 없이** 배제된다 — 접두 고정의 몫이다", () => {
    // C-1의 표 첫 두 행. 수단이 갈리는 것이 계약이므로, 이 둘이 마스킹으로 넘어가면
    // *"목록은 닫혀 있다 — 「기타」를 두지 않는다"*의 「수단은 둘」이 흐려진다. 여기서 재는
    // 것은 결과다: 두 형태가 옆에 있어도 선언은 **하나**로 세어진다(축 3 R2의 두 케이스가
    // 각각을 따로 들고, 이 케이스는 셋이 함께 있을 때의 합을 든다).
    expectStatus(
      head(
        "- 상태: 구현 완료",
        `- 근거: ${DIR_ANCHOR}`,
        "> - 상태: 구현 전",
        "    - 상태: 구현 주장 없음",
      ),
      IMPLEMENTED_DIR,
    );
  });

  it("마스킹이 걸리는 부류는 둘이다 — 주석과 펜스가 같은 규칙으로 배제된다", () => {
    // 한 문서에 둘이 함께 있어도 결과가 같다. 부류 하나만 배선한 구현은 여기서 갈린다.
    expectStatus(
      head(
        "- 상태: 구현 완료",
        `- 근거: ${DIR_ANCHOR}`,
        "<!--",
        "- 상태: 구현 전",
        "-->",
        "",
        "```markdown",
        "- 상태: 구현 주장 없음",
        "```",
      ),
      IMPLEMENTED_DIR,
    );
  });
});

describe("DOC-STATUS §3.6 C-2 — 축 8-2: 마스킹은 글자 단위이고 줄을 지우지 않는다", () => {
  // C-2 — *"구간에 든 글자 중 개행이 아닌 것을 공백으로 바꾼다."* 그 근거 둘이 각각
  // ①*"줄 수 보존"* ②*"열 오프셋 보존"*이고, 아래 세 케이스가 그 둘을 판정으로 잰다.
  // **마스킹 결과 문자열을 직접 보지 않는다** — 이 축의 관측면은 파서의 산출뿐이다.

  const FOLDED_COMMENT = ["<!--", "옛 머리를 여기 접어 두었다.", "-->"];

  it("줄 수 보존 — 주석이 머리 창을 위로 밀지 않는다 (창 밖 선언은 창 밖이다)", () => {
    // 구간을 **지워** 줄을 당기는 구현이면 창이 밀려 아래 선언이 창 안으로 들어온다.
    // C-2 ①이 그것을 금한 근거가 *"그 밀림은 문서마다 다르다"*이다. 세 줄짜리 주석이
    // 창의 끝에 걸리게 두고, 선언은 상한 **다음** 줄에 둔다 → `missing`이 옳다.
    expectViolation(
      atLine(
        HEAD_LINE_LIMIT + 1 - FOLDED_COMMENT.length,
        ...FOLDED_COMMENT,
        "- 상태: 구현 완료",
        `- 근거: ${DIR_ANCHOR}`,
      ),
      "missing",
    );
  });

  it("줄 수 보존 — 창 **안** 선언은 주석이 위에 있어도 그대로 읽힌다 (양성 대조군)", () => {
    // 위 케이스만 있으면 주석이 있는 문서를 전부 missing으로 떨어뜨리는 구현도 그린이다.
    expectStatus(
      atLine(HEAD_LINE_LIMIT - FOLDED_COMMENT.length, ...FOLDED_COMMENT, "- 상태: 구현 주장 없음"),
      { kind: "no-claim" },
    );
  });

  it("[미규정 의존] 열 오프셋 보존 — *한 줄 안에서 구간 안팎이 갈리는 자리*", () => {
    // C-2 ②가 이 형태를 **문면 그대로** 든다: *"한 줄 안에서 구간 안팎이 갈리는 자리"*.
    // 오늘은 값이 `구현 완료 <!-- 옛값: 구현 전 -->` 통째로 읽혀 `unknown-value`다.
    //
    // **[미규정 의존]** C-2는 그 자리를 *"표현할 수 있어야 한다"*까지만 말하고 **선언이
    // 살아남는다**를 계약으로 들지 않는다. 마스킹 뒤 이 줄은 값 뒤에 공백이 남으므로, 이
    // 단언의 통과는 후행 공백에 대한 파서의 관용(그 자체가 미규정 갈래다 — `K-034`)에
    // 얹혀 있다. 그 미규정이 엄격 쪽으로 판정되면 기대값은 `unknown-value`로 뒤집힌다.
    // 회색지대에서 더 센 쪽을 잡고 기록을 남기는 것은 축 6의 순서 대조와 같은 처분이다.
    expectStatus(
      head("- 상태: 구현 완료 <!-- 옛값: 구현 전 -->", `- 근거: ${DIR_ANCHOR}`),
      IMPLEMENTED_DIR,
    );
  });
});

describe("DOC-STATUS §3.6 C-3 — 축 8-3: 구간 계산은 전문, 머리 창은 그 뒤", () => {
  // C-3 — *"창 안에서만 계산하면 창 밖에서 닫히는 펜스가 전부 「안 닫힌 구간」이 된다."*
  // 그 절이 **실측**으로 든 자리가 문서 여섯(`APPROVAL-GATE.md`·`COMPACTION.md`·
  // `CORE-INTERFACE.md`·`SEARCH.md`·`SESSION-STORE.md`·`TOOLS-INTERFACE.md`)의 머리 40줄
  // 창이 열린 펜스 안에서 끝나는 것이다. 여기서는 **그 형태**를 픽스처로 재현한다 — 실물
  // 문서를 인질로 잡으면 그 문서가 개정될 때 이 축이 흔들린다(머리말의 무 I/O 원칙).

  function fenceClosingBeyondHead(...inside: readonly string[]): string {
    const filler = Array.from({ length: 60 }, (_, index) => `type Filler${index + 1} = never;`);
    return [
      "# 문서 제목",
      "",
      "**한 줄 요약.**",
      "",
      "- 상태: 구현 완료",
      `- 근거: ${DIR_ANCHOR}`,
      "",
      "## 1. 경계",
      "",
      "```typescript",
      ...inside,
      ...filler,
      "```",
      "",
    ].join("\n");
  }

  it("머리 창 밖에서 닫히는 펜스는 「안 닫힘」이 아니다 → ⑧이 나지 않는다", () => {
    expectStatus(fenceClosingBeyondHead(), IMPLEMENTED_DIR);
  });

  it("그 펜스의 창 **안** 부분도 마스킹된다 — 안의 예시가 선언으로 안 세어진다", () => {
    // 앞 케이스만 있으면 창 밖에서 닫히는 펜스를 아예 안 보는 구현도 그린이다.
    // 전문에 대해 구간을 계산한 뒤 창을 자른다는 것이 C-3의 전부이므로, 그 펜스의 창 안
    // 부분은 여전히 덮여 있어야 한다.
    expectStatus(fenceClosingBeyondHead("- 상태: 구현 전"), IMPLEMENTED_DIR);
  });
});

describe("DOC-STATUS §3.6 C-4·C-11 — 축 8-4: 겹치면 바깥이 이긴다 (문서 순서 한 번의 주사)", () => {
  it("펜스 안의 여는 주석 표기는 *바깥 구간의 내용일 뿐 새 구간을 열지 않는다*", () => {
    // C-4. 안쪽 표기가 새 구간을 열면 펜스가 닫힌 뒤에도 주석이 파일 끝까지 열린 채가 되어
    // ⑧이 나거나 머리가 통째로 지워진다. 오늘은 마스킹이 없어 `duplicate`가 난다.
    expectStatus(
      head(
        "- 상태: 구현 완료",
        `- 근거: ${DIR_ANCHOR}`,
        "",
        "```markdown",
        "<!--",
        "- 상태: 구현 전",
        "```",
      ),
      IMPLEMENTED_DIR,
    );
  });

  it("주석 안의 펜스 표기도 새 구간을 열지 않는다 (반대 방향)", () => {
    expectStatus(
      head(
        "- 상태: 구현 완료",
        `- 근거: ${DIR_ANCHOR}`,
        "",
        "<!--",
        "```markdown",
        "- 상태: 구현 전",
        "-->",
      ),
      IMPLEMENTED_DIR,
    );
  });

  it("C-11의 다섯 줄 표본 — 부류별 선주사로는 4행 선언이 지워진다", () => {
    // C-11이 **실측**으로 든 표본을 그대로 옮겼다: *"HTML 주석이 1행에서 열려 3행에서 닫히고,
    // 그 안 2행에 펜스 마커가 있고, 4행에 실물 선언이 있다."* 펜스를 먼저 훑는 구현에서는
    // 2행의 마커가 열어 둔 펜스가 4행을 삼켜 **4행 선언이 마스킹된다** — 그 절이 오늘 트리의
    // `maskCodeFences`로 재현한 것이 그것이다. C-4대로면 바깥은 주석이고 4행은 살아 있다.
    expectStatus(
      ["<!--", "```", "-->", "- 상태: 구현 완료", `- 근거: ${DIR_ANCHOR}`].join("\n"),
      IMPLEMENTED_DIR,
    );
  });
});

describe("DOC-STATUS §3.6 C-5 — 축 8-5: 짝이 안 맞으면 라벨 있는 실패다", () => {
  // C-5 — *"짝이 안 맞으면 조용한 0이 아니라 라벨 있는 실패다."* 그리고 *"「끝까지 구간」으로
  // 관대하게 읽지 않는다"* — 그 읽기에서는 *"결과가 `missing`으로 나와"* 원인이 위반 이름에
  // 안 남는다. **이 축에서 가장 침묵에 가까운 갈래이므로 케이스를 부류마다 따로 든다.**

  /** 여는 표기만 있고 닫는 표기가 파일 어디에도 없다. 선언은 그 **뒤**에 둔다. */
  const UNCLOSED_COMMENT = head("<!--", "- 상태: 구현 완료", `- 근거: ${DIR_ANCHOR}`);
  const UNCLOSED_FENCE = head("```markdown", "- 상태: 구현 완료", `- 근거: ${DIR_ANCHOR}`);

  it("안 닫힌 HTML 주석 → ⑧ context-unterminated (`missing`이 아니다)", () => {
    // §3.1 ⑧ — *"파일 끝까지 안 닫힌 HTML 주석·펜스가 있다 (§3.6)"*.
    expectViolation(UNCLOSED_COMMENT, "context-unterminated");
  });

  it("안 닫힌 펜스도 같은 위반이다 — 부류가 갈려도 라벨은 ⑧ 하나다", () => {
    expectViolation(UNCLOSED_FENCE, "context-unterminated");
  });

  it("detail이 **부류**를 든다 — `InertKind`의 두 값이 각각 나온다", () => {
    // C-10의 타입 블록: *"미닫힘 구간의 부류. C-5의 `context-unterminated` detail이 이 값을
    // 든다."* 부류가 없으면 *"위반 이름이 곧 고칠 곳의 주소"*가 새 갈래에서만 절반이 된다 —
    // 주석을 닫아야 하는지 펜스를 닫아야 하는지가 안 나온다.
    expect(failureDetail(UNCLOSED_COMMENT)).toContain("html-comment");
    expect(failureDetail(UNCLOSED_FENCE)).toContain("code-fence");
  });

  it("[미규정 의존] detail이 **자리**를 든다 — 줄·열이 1-기반이다", () => {
    // C-10의 타입 블록이 `line`·`column`을 들고 §5.2가 *"위반 이름이 곧 고칠 곳의 주소"*를
    // 이 게이트의 설계로 못박으므로 자리는 계약이다.
    //
    // **[미규정 의존]** 정본은 두 수의 **기준**(0-기반 / 1-기반)을 정하지 않는다
    // (`scripts/doc-citation.d.mts`가 같은 미규정을 그 자리에 적어 두었다). 이 케이스는
    // **1-기반**을 잡았다 — 오늘 이 리포의 게이트들이 내는 자리가 1-기반이고, C-11이
    // 기존 두 표면과의 등가를 요구하므로 그 기준이 함께 고정된다. 0-기반으로 판정되면
    // 아래 두 수가 각각 하나씩 내려간다.
    const opener = "구간 표기를 여기서 연다: <!--";
    const expectedLine = 12;
    const expectedColumn = opener.indexOf("<!--") + 1;
    const detail = failureDetail(atLine(expectedLine, opener, "- 상태: 구현 완료"));

    expect(detail).toContain("html-comment");
    const numbers = digitRuns(detail);
    expect(numbers, `detail: ${detail}`).toContain(String(expectedLine));
    expect(numbers, `detail: ${detail}`).toContain(String(expectedColumn));
  });

  it("[미규정 의존] 유효한 선언 **뒤**의 미닫힘도 ⑧이다 — 조용한 통과가 아니다", () => {
    // C-5의 문면은 조건을 걸지 않는다 — *"파일 끝까지 안 닫힌 HTML 주석·펜스"*면 ⑧이다.
    //
    // **[미규정 의존]** 다만 그 절의 논거는 머리가 **지워지는** 경우를 든다. 선언이 미닫힘
    // 표기보다 앞서 온전히 읽히는 이 배치에서 ⑧이 선언 판정을 이기는지는 문면이 직접 정하지
    // 않았다. fail-closed 쪽을 잡았다 — 반대로 두면 *"파일 어디에나 `<!--` 한 줄을 두어"*가
    // 부분적으로 되살아나고, 무엇보다 그쪽이 조용한 갈래다.
    expectViolation(
      head("- 상태: 구현 완료", `- 근거: ${DIR_ANCHOR}`, "", "<!--"),
      "context-unterminated",
    );
  });
});

describe("DOC-STATUS §3.6 C-6 — 축 8-6: 마스킹은 이 파서의 정규식 전부의 앞에 선다", () => {
  it("펜스 안의 `## 5.` 꼴 한 줄이 배정의 정본 범위를 옮기지 않는다", () => {
    // C-6이 이 형태를 문면 그대로 든다: *"펜스 안의 `## 5.` 꼴 한 줄이 배정의 정본 범위를
    // 통째로 옮긴다."* 머리 필드에만 마스킹을 걸면 여기가 그대로 열린 채 남는다.
    const source = [
      "# 문서 지위 선언 규약",
      "",
      "**한 줄 요약.**",
      "",
      "- 상태: 구현 완료",
      `- 근거: ${FILE_ANCHOR}`,
      "",
      "---",
      "",
      "## 2. 예시",
      "",
      "```markdown",
      "## 5. 문서별 확정 값",
      "",
      ...statusTable(pipeRow("`GHOST.md`", "구현 완료", "`packages/ghost`")),
      "```",
      "",
      "---",
      "",
      "## 5. 문서별 확정 값",
      "",
      ...statusTable(OK_ROW_DIR_ANCHOR, OK_ROW_FILE_ANCHOR, OK_ROW_NO_CLAIM),
      "",
      ...SECTION_5_1_TWO_CELL,
      "",
    ].join("\n");
    expectTableRows(source, OK_ASSIGNMENTS);
  });

  it("주석 안의 `###` 소제목이 절 범위를 끊지 않는다", () => {
    // 같은 계약의 반대편 경계다. §5.1이 범위의 끝을 *"그 다음에 처음 나오는 `###` 소제목"*으로
    // 정했으므로, 덮이지 않은 주석 속 `###` 하나가 범위를 표 앞에서 끊어 버린다 — 그러면
    // 배정이 0건인 채로 `table-missing`이 나고, 그것은 표를 못 읽었다는 신고이지 주석이
    // 덮이지 않았다는 신고가 아니다. 진단이 원인에서 한 칸 멀어지는 형태다.
    const source = docWithSection5([
      "<!--",
      "### 5.0 옛 소절 — 지금은 접어 두었다.",
      "-->",
      "",
      ...statusTable(OK_ROW_DIR_ANCHOR, OK_ROW_FILE_ANCHOR, OK_ROW_NO_CLAIM),
    ]);
    expectTableRows(source, OK_ASSIGNMENTS);
  });
});

describe("DOC-STATUS §3.6 C-7 — 축 8-7: 마스킹은 순수 파서 안에 산다", () => {
  it("순수 모듈 **하나만** 임포트한 프로세스에서 네 우회가 전부 막힌다", () => {
    // C-7 — *"마스킹은 순수 파서 안에 산다. 실행부가 대신 해 주지 않는다."* 그 근거가
    // *"순수 함수를 직접 부르는 호출자가 우회를 그대로 물려받는데"*이고, 그 호출자가 바로
    // 이 파일이었다(§3.6: 계약 테스트가 전문을 프로덕션 파서에 넘기고 있었다).
    //
    // **자식 프로세스로 재는 것이 이 케이스의 전부다.** 같은 워커 안에서 재면 이 파일이
    // 이미 임포트한 것들이 배경에 깔려 실행부를 안 거쳤다는 것이 관측이 아니라 주장이 된다.
    // 여기서는 `doc-status.mjs` 하나만 적재된 프로세스가 넷을 전부 막는 것을 본다.
    const probe = [
      `const mod = await import(${JSON.stringify(pathToFileURL(PURE_MODULE).href)});`,
      "const [heads, table] = JSON.parse(process.argv[1]);",
      "process.stdout.write(",
      "  JSON.stringify({",
      "    heads: heads.map((source) => mod.parseDocStatus(source)),",
      "    table: mod.parseStatusTable(table),",
      "  }),",
      ");",
    ].join("\n");
    const payload = JSON.stringify([
      [EVIDENCE_HEAD_FALSE_POSITIVE, EVIDENCE_HEAD_FORGERY, EVIDENCE_FENCE_FALSE_POSITIVE],
      EVIDENCE_TABLE_FALSE_POSITIVE,
    ]);

    const result = runProbe(probe, payload);
    expect(result.stderr, "순수 모듈이 stderr에 무언가를 썼다").toBe("");
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);

    const observed = JSON.parse(result.stdout) as {
      heads: readonly unknown[];
      table: unknown;
    };
    expect(observed.heads[0], result.stdout).toEqual(IMPLEMENTED_DIR);
    expect(observed.heads[1], result.stdout).toHaveProperty("violation", "missing");
    expect(observed.heads[2], result.stdout).toEqual(IMPLEMENTED_DIR);
    expect(observed.table, result.stdout).toEqual({ ok: true, rows: OK_ASSIGNMENTS });
  });
});

describe("DOC-STATUS §3.6 C-8 — 축 8-8: 이 술어는 `typescript`를 끌어오지 않는다", () => {
  // C-8 — *"`check-doc-status.mjs`는 매 `pnpm check`마다 적재되므로"* 그 그래프에 컴파일러가
  // 들어오면 게이트 한 번의 값이 바뀐다. **손 판정으로 두면 다음 사이클에 재현되지 않으므로**
  // 자식 프로세스에서 CJS 모듈 캐시를 실제로 들여다본다.

  const CACHE_PROBE = [
    "await import(process.argv[1]);",
    'const { createRequire } = await import("node:module");',
    "const req = createRequire(process.execPath);",
    "const hit = Object.keys(req.cache).some(",
    '  (key) => key.includes("node_modules") && key.includes("typescript"),',
    ");",
    'process.stdout.write(hit ? "LOADED" : "CLEAN");',
  ].join("\n");

  it("순수 판정 모듈의 전이 임포트 그래프에 `typescript`가 없다", () => {
    const result = runProbe(CACHE_PROBE, pathToFileURL(PURE_MODULE).href);
    expect(result.stderr, `stderr: ${result.stderr}`).toBe("");
    expect(result.stdout).toBe("CLEAN");
  });

  it("그 측정이 실제로 잡는다 — `comment-lexer.mjs`가 양성 대조군이다", () => {
    // **역검증.** 이 케이스가 없으면 위 단언은 측정이 아무것도 못 보는 상태와 구별되지 않는다.
    // C-8이 이름으로 든 모듈이 그대로 양성 대조군이 된다 — 그 모듈은 최상위에서 컴파일러를
    // 임포트하므로, 같은 프로브가 여기서는 `LOADED`를 내야 한다.
    expect(existsSync(LEXER_MODULE), LEXER_MODULE).toBe(true);
    const result = runProbe(CACHE_PROBE, pathToFileURL(LEXER_MODULE).href);
    expect(result.stderr, `stderr: ${result.stderr}`).toBe("");
    expect(result.stdout).toBe("LOADED");
  });
});

describe("DOC-STATUS §3.6 C-9 — 축 8-9: 코드 표기 안의 여닫 표기는 구간을 열지 않는다", () => {
  // C-9 — 이 규칙을 요구한 것이 §3.6 자신이다: C-1~C-8만 세우고 실물에 걸었더니 그 문서가
  // 즉시 안 닫힌 주석으로 붉어졌다. 규약이 자기 검사 대상을 설명하는 것 자체가 불가능해지는
  // 형태이고(§2.2의 자기오염), 그래서 아래 두 케이스는 **이 파일의 위 주석들이 살아남는
  // 조건**이기도 하다.

  it("백틱 안의 여는 주석 표기가 구간을 안 연다 → ⑧도 `missing`도 아니다", () => {
    expectStatus(
      head("여는 표기 `<!--` 를 인용한다.", "- 상태: 구현 완료", `- 근거: ${DIR_ANCHOR}`),
      IMPLEMENTED_DIR,
    );
  });

  it("백틱 안의 펜스 마커가 구간을 안 연다", () => {
    // 네 백틱 런으로 감싼 코드 표기 안의 세 백틱이다. *"줄머리의 펜스 판별이 먼저 서므로
    // 펜스 마커가 코드 표기로 오인되지 않는다"* — 이 줄은 줄머리가 글자라 펜스가 아니다.
    expectStatus(
      head("펜스 표기는 ```` ``` ````로 쓴다.", "- 상태: 구현 완료", `- 근거: ${DIR_ANCHOR}`),
      IMPLEMENTED_DIR,
    );
  });
});

describe("DOC-STATUS §3.6 C-10 — 축 8-10: 표 갈래와 머리 갈래는 이름공간이 다르다", () => {
  /** §5 절 범위 안에서 열려 파일 끝까지 안 닫히는 주석. 두 파서가 같은 입력을 본다. */
  const UNCLOSED_IN_SECTION_5 = docWithSection5([
    ...statusTable(OK_ROW_DIR_ANCHOR, OK_ROW_FILE_ANCHOR, OK_ROW_NO_CLAIM),
    "",
    "<!--",
    "옛 표를 여기 접어 두었다.",
  ]);

  it("표 갈래는 `inert-unclosed`다 — §5.1의 «구간이 안 닫혔다»", () => {
    // §5.1 갈래 표 — *"이 문서에 파일 끝까지 안 닫힌 HTML 주석·펜스가 있다"*. 사유 문자열의
    // 정본은 `scripts/doc-status.d.mts`다(정본 문서가 표 갈래의 사유를 열거하지 않는다 —
    // 축 6-6의 사유들과 같은 자리이고, 그 값을 정한 것은 이 사이클의 플랜이다).
    expectTableFailure(UNCLOSED_IN_SECTION_5, "inert-unclosed");
  });

  it("한 입력이 두 이름을 낸다 — 머리는 ⑧, 표는 `inert-unclosed`이고 문자열이 다르다", () => {
    // 두 유니온의 멤버가 서로소라는 것이 §5.1의 분리이고, 같은 문자열을 쓰면 그 분리가
    // **조용히** 깨진다(축 6-6이 타입 레벨에서 재는 것과 같은 성질을 여기서는 실물 값으로
    // 잰다 — 타입은 유니온의 교집합을 보지만 이 케이스는 한 사건이 낸 두 이름을 본다).
    const table = parseStatusTable(UNCLOSED_IN_SECTION_5);
    const tableReason = table.ok ? "" : table.reason;
    const headViolation = asFailure(parseDocStatus(UNCLOSED_IN_SECTION_5))?.violation ?? "";

    expect(tableReason).toBe("inert-unclosed");
    expect(headViolation).toBe("context-unterminated");
    expect(tableReason).not.toBe(headViolation);
  });
});

describe("DOC-STATUS §3.6 — 축 8-11: 양성 대조군 (마스킹이 정상 문서를 안 바꾼다)", () => {
  // §3.6 소급 절 — *"이 규칙은 오늘 아무 문서도 붉히지 않으면서 네 우회를 닫는다."* 그 절이
  // 판정 변화 0을 든 것이 착지 순서를 안 강제하는 근거이므로, **중립이 깨지면 그 근거가
  // 무너진다.** 축 1·축 6-1과 같은 이유로 이 축에도 양성 대조군이 선다.

  it("구간이 없는 정상 머리 세 값이 그대로 통과한다", () => {
    expectVerdictOk(head("- 상태: 구현 완료", `- 근거: ${DIR_ANCHOR}`), true, IMPLEMENTED_DIR);
    expectVerdictOk(head("- 상태: 구현 전", `- 근거: ${DIR_ANCHOR}`), false, {
      kind: "not-yet",
      anchor: DIR_ANCHOR,
    });
    expectVerdictOk(head("- 상태: 구현 주장 없음"), false, { kind: "no-claim" });
  });

  it("닫힌 구간이 있어도 그 밖의 정상 표는 그대로 배정이 된다", () => {
    expectTableRows(
      docWithSection5([
        "<!--",
        "이 주석은 제대로 닫힌다.",
        "-->",
        "",
        ...statusTable(OK_ROW_DIR_ANCHOR, OK_ROW_FILE_ANCHOR, OK_ROW_NO_CLAIM),
      ]),
      OK_ASSIGNMENTS,
    );
  });

  it("구간이 하나도 없는 문서는 마스킹 전후로 판정이 같다", () => {
    expectTableRows(
      docWithSection5(statusTable(OK_ROW_DIR_ANCHOR, OK_ROW_FILE_ANCHOR, OK_ROW_NO_CLAIM)),
      OK_ASSIGNMENTS,
    );
  });
});
