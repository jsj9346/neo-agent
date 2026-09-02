/**
 * 배선의 계약 테스트 — **프레임이 앵커에 착지하는 자리**가 정본대로인가. 정본은
 * `docs/WEB-UI.md` §9.6이다.
 *
 * **기대값은 구현이 아니라 그 절에서만 도출했다.** 아래 축이 드는 값(배선하는 앵커 다섯 ·
 * 승인의 답 셋 · «누적하지 않는다»)은 전부 §9.6의 범위 표와 결정 번호에서 왔고, 순수 모듈의
 * 소스를 읽어 «오늘 무엇을 하고 있나»를 옮겨 적은 자리는 없다.
 *
 * ## 범위 표는 손으로 옮겨 적지 않고 **정본에서 파싱한다**
 *
 * 결정 11이 *"문서와 실물 중 한쪽만 움직이면 붉는다"*로 **양방향**을 요구했다. 그 표를 이
 * 파일에 손으로 옮겨 적으면 재지는 것은 한 방향뿐이다 — 실물이 움직이면 붉지만 **문서가
 * 움직이는 방향은 조용하다.** 그 순간 이 목록이 §9.4 결정 5가 *"관측형은 실물이 움직일 때마다
 * 조용히 낡고"*로 이름 붙인 사본이 되고, 검사가 실제보다 넓게 주장하게 된다(§2.3). 그래서
 * 아래 `SCOPED_ANCHORS`·`OUT_OF_SCOPE_ANCHORS`는 상수가 아니라 **`docs/WEB-UI.md` §9.6의
 * 범위 표를 런타임에 읽어 낸 파생**이다.
 *
 * **파싱 실패가 조용한 그린이 되지 않게 fail-closed로 둔다.** 절을 못 찾으면 던지고, 모르는
 * 판정 문면을 만나면 던지고, 파생이 비면 아래 첫 축이 붉는다. 파싱은 모듈 적재 시점에 도므로
 * 그 던짐은 이 파일 전체의 수집 실패로 나온다 — 조용히 0건을 세는 갈래가 없다.
 *
 * ## 무엇을 임포트하는가 — 순수 층뿐이다
 *
 * 결정 1이 *"①②는 순수하고 시그니처에 DOM 타입도 DOM 전역도 안 낸다"*로 그 둘을 node에서
 * 부를 수 있게 만들었고 같은 항이 *"그 배치가 node 환경의 계약 테스트가 이 모듈을 그대로
 * 임포트할 수 있는 근거다"*라고 적었다. 그래서 이 파일이 여는 것은 `client/state.js`와
 * `client/view.js` 둘뿐이다 — 그리기 층(`client/render.js`)과 부트(`client/main.js`)는 DOM
 * 전역에 닿으므로 여기서 **실행하지 않는다.** 그 둘을 재는 것은 이 사이클이 아니다:
 * §9.6이 스스로 *"그리기 층을 이번 사이클에서 아무도 재지 않는다"*를 적었고, 가짜 DOM을
 * 들이는 갈래는 그 절이 기각했다(*"손으로 만든 가짜를 상대로 재면 재는 것이 그 가짜다"*).
 *
 * ## 파일 이름은 세부다 — 그래서 실재를 먼저 잰다
 *
 * §9.6이 *"함수 이름·문면·파일 수는 세부이며 §12가 든다"*로 이름을 계약 밖에 두었고, 계약인
 * 것은 *"경계가 파일이라는 것"* 하나다. 그래서 아래 파일 경계 축은 경로를 손으로 들되
 * **먼저 실재를 단언한다** — 개명이 이 축을 조용히 통과시키는 경로(없는 파일에서 임포트 문을
 * 0건 찾아 그린)를 없애는 자리다. §9.4 결정 8이 앵커 대조에 대해 쓴 비대칭 그대로다.
 *
 * ## 문면을 고정하지 않는다
 *
 * 뷰가 짓는 한국어 문장은 §12가 드는 세부이고, 계약 테스트가 리터럴을 고정하면 그 순간 세부가
 * 계약이 된다. 그래서 아래 축이 재는 것은 **«비어 있지 않은가»와 «구별되는가»**다. 예외는
 * 서버가 소유한 어휘(§11의 실패 코드)이고, 그것은 우리 세부가 아니라 계약이라 문자로 잰다.
 *
 * ## 이 파일이 재지 못하는 것
 *
 * - **그리기와 부트를 안 잰다**(위). 배선 집합의 상수가 표와 맞는가는 여기가 지고, 부트가 그
 *   상수를 실제로 순회하는가는 `main.js`의 앵커 이름 리터럴 0건이 진다 — 두 축의 합이
 *   결정 11의 *"부트가 여는 이름의 집합"*이다.
 * - **표가 앵커 목록 전부를 판정하는가는 안 잰다.** §9.6이 범위 표에 그 전수성을 요구하지
 *   않았다 — 결정 11이 든 것은 *"부트가 여는 이름의 집합"*과 표의 일치뿐이다. 앵커가 하나
 *   늘었는데 표가 안 따라오면 그 이름은 「붙는다」로도 「안 붙는다」로도 안 읽혀 모집단 밖으로
 *   빠지는데, 그것을 여기서 붉히면 이 파일이 정본에 없는 계약을 새로 짓는 것이 된다.
 *   `[미규정]` — 판정은 §9.6이 할 일이다.
 * - **소진 검사는 이 파일의 종료 코드로 안 난다.** 아래 `@ts-expect-error` 축의 판정은
 *   `pnpm typecheck`가 낸다(`wiring.contract.test.ts`가 같은 배치를 쓴다).
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로 있는
 * 부분 문자열이고, 문서를 지목하는 자리는 절 번호와 결정 번호로 한다.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AgentEvent, AgentMessage, AssistantMessage, ToolCallContent } from "@neo-agent/core";
import { describe, expect, test } from "vitest";
import { ANCHOR_NAMES } from "../client/anchors.js";
import type { StateEffect } from "../client/protocol.js";
import type { ScreenState, WiringSignal } from "../client/state.js";
import { foldSignal, INITIAL_SCREEN_STATE } from "../client/state.js";
import type { AnchorValues } from "../client/view.js";
import { APPROVAL_ANSWERS, openWiredAnchors, viewOf, WIRED_ANCHORS } from "../client/view.js";
import type { AnchorSource } from "../client/wiring.js";
import type { ApprovalAnswer } from "../src/approvals.ts";
import type { PendingApproval, StateSnapshot } from "../src/protocol.ts";

/* -------------------------------------------------------------------------- *
 * 정본에서 파싱한 기대값 — §9.6 범위 표가 원천이다
 * -------------------------------------------------------------------------- */

/** §9.6 범위 표의 한 행 — 이름 여럿이 한 판정을 함께 받는 행이 있다 */
type ScopeRow = { readonly names: readonly string[]; readonly wired: boolean };

/** 범위 절의 제목. 구간을 이 제목부터 다음 제목까지로 닫는다 */
const SCOPE_HEADING = "#### 범위";

/**
 * §9.6 「범위」 절의 표를 읽어 앵커 이름별 판정을 낸다.
 *
 * **구간을 제목으로 닫는 것이 계약의 일부다** — 같은 절(§9.6)에 「기각한 갈래」 표가 하나 더
 * 있고, 문서 전체를 훑으면 그 표의 행이 섞여 판정이 흐려진다. 다른 §의 표는 말할 것도 없다.
 *
 * **fail-closed다.** 절을 못 찾으면 던지고, 이름 칸에 코드 표기가 있는데 판정 칸이 아는 문면
 * 둘 중 어느 쪽도 아니면 던진다. 조용히 건너뛰면 표가 오타 하나로 통째 비어도 아래 축이
 * "공집합 대 공집합"으로 통과한다.
 */
const parseScopeTable = (markdown: string): readonly ScopeRow[] => {
  const at = markdown.indexOf(SCOPE_HEADING);
  if (at < 0) throw new Error(`§9.6의 범위 절을 못 찾았다 — "${SCOPE_HEADING}"이 없다`);
  const tail = markdown.slice(at + SCOPE_HEADING.length);
  const end = tail.search(/\n#{1,6} /);
  const section = end < 0 ? tail : tail.slice(0, end);

  const rows: ScopeRow[] = [];
  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = trimmed.split("|").map((cell) => cell.trim());
    // 이름 칸의 코드 표기가 «이 줄이 판정 행인가»의 판별자다. 머리줄(`| 앵커 | ... |`)과
    // 구분선(`|---|`)에는 없으므로 그 둘이 여기서 걸러진다.
    const names = [...(cells[1] ?? "").matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? "");
    if (names.length === 0) continue;
    // 강조 표기는 판정이 아니라 문서의 강조다 — 표가 한쪽을 굵게 쓴다.
    const verdict = (cells[2] ?? "").replaceAll("*", "").trim();
    if (verdict === "붙는다") rows.push({ names, wired: true });
    else if (verdict === "안 붙는다") rows.push({ names, wired: false });
    else throw new Error(`범위 표의 판정을 못 읽었다 — ${JSON.stringify(verdict)} (${names[0]})`);
  }
  return rows;
};

/** 정본 원문. 이 파일에서 유일하게 문서를 여는 자리다 */
const WEB_UI_PATH = fileURLToPath(new URL("../../../docs/WEB-UI.md", import.meta.url));
const SCOPE_ROWS = parseScopeTable(readFileSync(WEB_UI_PATH, "utf8"));

/**
 * §9.6 범위 표의 「붙는다」. **관측이 아니라 판정이다** — 그 표가 스스로 *"관측이 아니라
 * **판정**이다"*를 적었다. 실물이 움직이면 이 목록과 어긋나 붉고, **문서가 움직여도 이 목록이
 * 함께 움직여 실물과 어긋나 붉는다**(결정 11 — *"문서와 실물 중 한쪽만 움직이면 붉는다"*).
 */
const SCOPED_ANCHORS: readonly string[] = SCOPE_ROWS.filter((row) => row.wired).flatMap(
  (row) => row.names,
);

/**
 * 같은 표의 「안 붙는다」. 이 목록이 따로 서는 이유는 축의 방향이 반대이기 때문이다 —
 * 위엣것은 «빠지면 붉는다»를 재고 이것은 «들어오면 붉는다»를 잰다. 앞엣것만 두면 배선 집합이
 * 넓어지는 방향이 조용하다.
 */
const OUT_OF_SCOPE_ANCHORS: readonly string[] = SCOPE_ROWS.filter((row) => !row.wired).flatMap(
  (row) => row.names,
);

/**
 * 결정 7 — *"낼 수 있는 답의 집합은 서버의 것 그대로다"*. 그 항이 셋을 이름으로 들었다.
 *
 * **키가 `ApprovalAnswer`로 강제되는 표다** — 서버의 집합(`../src/approvals.ts`)이 넓어지면
 * 키가 미충족이라 컴파일이 붉고, 좁아지면 초과 속성이라 붉는다. 손 배열만 두면 그 어긋남이
 * 이 파일 안에서 조용하다.
 */
const CONTRACT_ANSWERS: Readonly<Record<ApprovalAnswer, true>> = {
  "allow-once": true,
  "allow-always": true,
  deny: true,
};

/**
 * 결정 4 — *"나머지 일곱은 트랜스크립트를 안 움직인다."* 위와 같은 형태의 표이고, 코어가
 * 이벤트를 더하면 여기가 미충족으로 붉는다. 그때 판정할 것이 §9.6이 든
 * *"«이 이벤트가 트랜스크립트에 실리는가»"*다.
 */
const NON_TRANSCRIPT_EVENTS: Readonly<
  Record<Exclude<AgentEvent["type"], "message_start" | "message_update" | "message_end">, true>
> = {
  agent_start: true,
  agent_end: true,
  turn_start: true,
  turn_end: true,
  tool_start: true,
  tool_update: true,
  tool_end: true,
};

/**
 * 화면 상태가 드는 자리 전부. 결정 2 — *"화면 상태가 드는 것은 서버가 준 것과 배선이 낸
 * 요청의 왕복뿐이다 — 사용자가 치고 있는 텍스트는 안 든다."*
 *
 * **키가 강제되는 표인 것이 축의 실질이다.** 입력 텍스트의 필드가 상태에 생기면 그 순간
 * 이 표가 미충족으로 붉는다 — 이름을 미리 알 필요가 없다는 것이 손 금지 목록보다 나은
 * 점이다(금지 목록은 «draft»를 막고 «typing»을 통과시킨다).
 */
const SCREEN_STATE_FIELDS: Readonly<Record<keyof ScreenState, true>> = {
  transcript: true,
  approvals: true,
  connection: true,
  request: true,
  submit: true,
};

/**
 * 결정 2 — *"이 사이클이 그 버튼에 쓰는 것은 잠금 상태뿐이고 내용이 아니다."* 위와 같은
 * 형태이고, 뷰가 그 자리에 문면을 실으면 초과 속성으로 붉는다.
 */
const SUBMIT_VIEW_FIELDS: Readonly<Record<keyof AnchorValues["composer-submit"], true>> = {
  disabled: true,
};

/* -------------------------------------------------------------------------- *
 * 표본 — 계약이 요구하는 최소 형태만 든다
 * -------------------------------------------------------------------------- */

const assistantMessage = (id: string, text: string): AssistantMessage => ({
  id,
  role: "assistant",
  content: [{ type: "text", text }],
  stopReason: "end_turn",
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  timestamp: 0,
});

const pendingApproval = (id: string): PendingApproval => ({
  id,
  display: `승인 ${id}`,
  requestedAt: 0,
  expiresAt: 1,
});

const snapshotOf = (
  messages: readonly AgentMessage[],
  approvals: readonly PendingApproval[],
): StateSnapshot => ({
  sessionId: "s-1",
  transcript: { complete: true, messages },
  pendingApprovals: approvals,
  safety: { approvalMode: "manual", sandbox: "on" },
});

const snapshotSignal = (
  messages: readonly AgentMessage[],
  approvals: readonly PendingApproval[] = [],
): WiringSignal => ({
  kind: "effect",
  effect: { effect: "replace_snapshot", snapshot: snapshotOf(messages, approvals) },
});

const effectSignal = (effect: StateEffect): WiringSignal => ({ kind: "effect", effect });

const eventSignal = (event: AgentEvent): WiringSignal => ({ kind: "event", event });

/** 신호 여럿을 초기 상태부터 차례로 접는다. 배선이 실제로 도는 형태 그대로다 */
const foldAll = (signals: readonly WiringSignal[]): ScreenState =>
  signals.reduce<ScreenState>(foldSignal, INITIAL_SCREEN_STATE);

/** 응답 본문 — 부트가 급수하는 것은 파싱된 값이 아니라 **텍스트**다(결정 6) */
const responseBody = (frame: unknown): string => JSON.stringify(frame);

/* -------------------------------------------------------------------------- *
 * 축 1 — 배선 집합이 §9.6 범위 표다 (결정 11)
 * -------------------------------------------------------------------------- */

describe("축 1 — 배선하는 앵커가 범위 표 그대로다 (§9.6 결정 11)", () => {
  test("정본 표에서 판정을 실제로 읽었다 — 빈 파생의 조용한 그린이 없다", () => {
    // 이 단언이 없으면 아래 전부가 "공집합 대 공집합"으로 통과할 수 있다. 표가 통째로 안
    // 읽힌 상태와 "표대로다"가 구별되지 않는 것이 정확히 §2.3이 든 형태다.
    expect(SCOPE_ROWS.length, "범위 표에서 행을 하나도 못 읽었다").toBeGreaterThan(0);
    expect(SCOPED_ANCHORS.length, "「붙는다」 행을 하나도 못 읽었다").toBeGreaterThan(0);
    expect(OUT_OF_SCOPE_ANCHORS.length, "「안 붙는다」 행을 하나도 못 읽었다").toBeGreaterThan(0);
  });

  test("역검증 — 표의 판정을 뒤집은 표본에서 파서가 다른 답을 낸다", () => {
    // 파서가 무엇을 먹여도 같은 답을 내면 위 축의 그린이 아무것도 뜻하지 않는다. 여기서
    // 재는 것이 «문서가 움직이는 방향»의 증명이다 — 그 방향이 오늘까지 조용했다.
    const source = readFileSync(WEB_UI_PATH, "utf8");
    const flipped = source.replace("| `run-abort` | 안 붙는다 |", "| `run-abort` | **붙는다** |");
    expect(flipped, "치환이 아무것도 안 바꿨다 — 이 역검증이 공허하다").not.toBe(source);
    const wired = parseScopeTable(flipped)
      .filter((row) => row.wired)
      .flatMap((row) => row.names);
    expect(wired).toContain("run-abort");
    // 그리고 그 표본에서는 아래 일치 축이 실제로 실패한다.
    expect([...WIRED_ANCHORS].sort()).not.toEqual([...wired].sort());
  });

  test("역검증 — 모르는 판정 문면에서 파서가 던진다 (fail-closed)", () => {
    const source = readFileSync(WEB_UI_PATH, "utf8");
    const broken = source.replace("| `run-abort` | 안 붙는다 |", "| `run-abort` | 아마도 |");
    expect(broken, "치환이 아무것도 안 바꿨다").not.toBe(source);
    expect(() => parseScopeTable(broken)).toThrow();
  });

  test("역검증 — 범위 절이 없으면 파서가 던진다 — 빈 표로 접히지 않는다", () => {
    expect(() => parseScopeTable("# 문서\n\n표가 없다\n")).toThrow();
  });

  test("집합이 표의 「붙는다」와 정확히 일치한다 — 어느 쪽이 움직여도 붉는다", () => {
    // 정렬해 비교하는 것은 순서에 뜻이 없기 때문이다(`anchors.js`가 자기 배열에 대해 적었다).
    expect([...WIRED_ANCHORS].sort()).toEqual([...SCOPED_ANCHORS].sort());
  });

  test("「안 붙는다」로 판정된 이름이 하나도 안 들어 있다", () => {
    for (const name of OUT_OF_SCOPE_ANCHORS) {
      expect(
        WIRED_ANCHORS as readonly string[],
        `범위 밖 앵커가 배선 집합에 들었다 — ${name}`,
      ).not.toContain(name);
    }
  });

  test("전체 앵커 목록의 부분집합이다 — 목록 밖 이름이 없다", () => {
    for (const name of WIRED_ANCHORS) {
      expect(ANCHOR_NAMES, `앵커 목록에 없는 이름이다 — ${name}`).toContain(name);
    }
  });

  test("비어 있지 않다 — 파생이 붕괴하면 빈 배열이 되고 그것이 조용하다", () => {
    // `view.js`가 이 붕괴를 스스로 적었다: `Extract`가 `never`로 무너지면 필터가 전부를
    // 떨궈 빈 배열이 된다. 위 일치 축이 그것을 이미 잡지만, 실패 메시지가 «다섯 대 0»으로
    // 읽히게 이 축을 따로 둔다.
    expect(WIRED_ANCHORS.length).toBe(SCOPED_ANCHORS.length);
  });

  test("일괄 개방이 그 집합을 그대로 연다 — 더도 덜도 아니다", () => {
    // 결정 11 — *"부트가 쓰는 앵커를 한 번에 연다."* 부트가 이 함수를 부르므로 여기서 재는
    // 것이 «부트가 여는 이름»의 절반이다(나머지 절반은 `main.js`의 리터럴 0건).
    const asked: string[] = [];
    const source: AnchorSource<{ readonly name: string }> = {
      getElementById: (id: string) => {
        asked.push(id);
        return { name: id };
      },
    };
    const opened = openWiredAnchors(source);
    expect(asked.sort()).toEqual([...SCOPED_ANCHORS].sort());
    expect(Object.keys(opened).sort()).toEqual([...SCOPED_ANCHORS].sort());
  });

  test("못 찾으면 던지고 잡지 않는다 — 늦게 드러나는 실패를 만들지 않는다", () => {
    // 결정 11 — *"그 던짐을 잡지 않는다."* 개방이 조용히 부분 성공하면 승인 앵커의 부재가
    // 첫 승인이 뜰 때까지 안 드러난다.
    const source: AnchorSource<{ readonly name: string }> = { getElementById: () => null };
    expect(() => openWiredAnchors(source)).toThrow();
  });
});

/* -------------------------------------------------------------------------- *
 * 축 2~4 — 트랜스크립트 (결정 4)
 * -------------------------------------------------------------------------- */

describe("축 2 — 스냅샷은 대체다 (§9.6 결정 4 · §8.1)", () => {
  test("두 번 접어도 누적이 없다 — 뒤엣것만 남는다", () => {
    const first = [assistantMessage("m-1", "첫째")];
    const second = [assistantMessage("m-2", "둘째")];
    const state = foldAll([snapshotSignal(first), snapshotSignal(second)]);
    expect(state.transcript.map((item) => item.id)).toEqual(["m-2"]);
  });

  test("같은 스냅샷을 두 번 접어도 항목이 늘지 않는다", () => {
    // 재접속 회복이 지나는 자리다. 누적하면 *"스냅샷이 이미 든 꼬리와 겹쳐 같은 메시지가 두 번
    // 서고"* 그 중복은 화면에만 나타난다.
    const messages = [assistantMessage("m-1", "첫째"), assistantMessage("m-2", "둘째")];
    const state = foldAll([snapshotSignal(messages), snapshotSignal(messages)]);
    expect(state.transcript.map((item) => item.id)).toEqual(["m-1", "m-2"]);
  });

  test("이벤트로 쌓인 것도 스냅샷이 대체한다 — 이어 붙이지 않는다", () => {
    const state = foldAll([
      eventSignal({ type: "message_start", message: assistantMessage("m-1", "먼저") }),
      snapshotSignal([assistantMessage("m-9", "스냅샷") satisfies AgentMessage]),
    ]);
    expect(state.transcript.map((item) => item.id)).toEqual(["m-9"]);
  });
});

describe("축 3 — 수명주기 셋이 한 항목이다 (§9.6 결정 4)", () => {
  test("같은 id의 start→update→end가 항목 하나로 남는다", () => {
    const draft = assistantMessage("m-1", "초안");
    const grown = assistantMessage("m-1", "초안 더");
    const finished = assistantMessage("m-1", "최종");
    const state = foldAll([
      eventSignal({ type: "message_start", message: draft }),
      eventSignal({
        type: "message_update",
        message: grown,
        delta: { type: "text_delta", text: " 더" },
      }),
      eventSignal({ type: "message_end", message: finished }),
    ]);
    expect(state.transcript.length).toBe(1);
    expect(state.transcript[0]).toEqual(finished);
  });

  test("다른 id는 뒤에 붙는다 — 순서가 온 순서다", () => {
    const state = foldAll([
      eventSignal({ type: "message_start", message: assistantMessage("m-1", "첫째") }),
      eventSignal({ type: "message_start", message: assistantMessage("m-2", "둘째") }),
      eventSignal({ type: "message_end", message: assistantMessage("m-1", "첫째 최종") }),
    ]);
    expect(state.transcript.map((item) => item.id)).toEqual(["m-1", "m-2"]);
  });
});

describe("축 4 — 나머지 일곱이 트랜스크립트를 안 움직인다 (§9.6 결정 4)", () => {
  const seeded = foldAll([snapshotSignal([assistantMessage("m-1", "첫째")])]);

  const samples: Readonly<Record<keyof typeof NON_TRANSCRIPT_EVENTS, AgentEvent>> = {
    agent_start: { type: "agent_start" },
    // `agent_end`가 그 런의 메시지를 다시 싣는 자리다 — 정본이 이름으로 든 함정이라 표본이
    // 실제로 메시지를 들어야 이 축이 뜻을 갖는다.
    agent_end: { type: "agent_end", messages: [assistantMessage("m-2", "다시 실린 것")] },
    turn_start: { type: "turn_start" },
    turn_end: { type: "turn_end", message: assistantMessage("m-3", "턴"), toolResults: [] },
    tool_start: { type: "tool_start", toolCallId: "t-1", toolName: "read", args: {} },
    tool_update: {
      type: "tool_update",
      toolCallId: "t-1",
      toolName: "read",
      partial: { content: [{ type: "text", text: "부분" }], source: "local" },
    },
    tool_end: {
      type: "tool_end",
      toolCallId: "t-1",
      toolName: "read",
      result: { content: [{ type: "text", text: "끝" }], source: "local" },
      isError: false,
    },
  };

  test("표본이 표의 일곱을 전부 든다 — 빠진 갈래가 조용히 안 재진다", () => {
    expect(Object.keys(samples).sort()).toEqual(Object.keys(NON_TRANSCRIPT_EVENTS).sort());
  });

  for (const [name, event] of Object.entries(samples)) {
    test(`${name}이 상태를 안 바꾼다`, () => {
      expect(foldSignal(seeded, eventSignal(event))).toEqual(seeded);
    });
  }
});

/* -------------------------------------------------------------------------- *
 * 축 5 — 소진 (결정 4). 판정은 `pnpm typecheck`가 낸다
 * -------------------------------------------------------------------------- */

describe("축 5 — 열거가 소진으로 닫혔다 (§9.6 결정 4)", () => {
  /**
   * **타입 전용 검증 — 실행하지 않는다.** 아래 지시자가 에러를 잡지 못하면 `pnpm typecheck`가
   * unused directive로 실패한다. 즉 이 축의 판정은 이 파일의 종료 코드가 아니라 타입 검사의
   * 종료 코드다(`wiring.contract.test.ts`가 같은 배치를 쓴다).
   *
   * 재는 것은 "유니온 밖 갈래가 컴파일되지 않는가"다. 컴파일되면 `default`로 흘리는 갈래가
   * 사실상 열려 있다는 뜻이고, §9.6이 기각한 형태(*"모르는 판별자를 조용히 버리고"*)가
   * 표현 가능해진다.
   */
  function offUnionBranchesDoNotCompile(state: ScreenState): ScreenState[] {
    return [
      // @ts-expect-error §9.6 결정 4 — 코어에 없는 이벤트 종류는 `AgentEvent`가 아니다.
      foldSignal(state, { kind: "event", event: { type: "message_deleted" } }),
      // @ts-expect-error §9.6 결정 3 — 입력 알파벳 밖의 판별자는 `WiringSignal`이 아니다.
      foldSignal(state, { kind: "user_typed", text: "안녕" }),
      // @ts-expect-error §9.6 결정 4 — 상태 프레임의 처분도 넷으로 닫혀 있다.
      foldSignal(state, { kind: "effect", effect: { effect: "append_snapshot" } }),
      // 대조군 — 알파벳 안의 갈래는 지시자 없이 컴파일된다. 없으면 위 셋이 «타입이 인자를
      // 전부 거부하는 상태»와 구별되지 않는다.
      foldSignal(state, { kind: "gap" }),
    ];
  }

  test("컴파일 축이 실제로 존재한다 — 실행하지 않고 존재만 단언한다", () => {
    expect(offUnionBranchesDoNotCompile).toBeTypeOf("function");
  });
});

/* -------------------------------------------------------------------------- *
 * 축 6 — 잠금 왕복 (결정 5)
 * -------------------------------------------------------------------------- */

describe("축 6 — 제출 잠금이 왕복 동안만 선다 (§9.6 결정 5)", () => {
  const submitted: WiringSignal = { kind: "prompt_submitted", requestId: "r-1" };

  const acceptedBody = responseBody({ type: "res", id: "r-1", ok: true });
  const failedBody = responseBody({
    type: "res",
    id: "r-1",
    ok: false,
    error: { code: "RUN_ACTIVE", message: "런이 이미 돈다" },
  });

  test("제출 제스처가 잠근다", () => {
    const state = foldAll([submitted]);
    expect(viewOf(state)["composer-submit"].disabled).toBe(true);
  });

  test("성공 응답이 푼다", () => {
    const state = foldAll([
      submitted,
      { kind: "response_body", requestId: "r-1", body: acceptedBody },
    ]);
    expect(viewOf(state)["composer-submit"].disabled).toBe(false);
  });

  test("실패 응답도 푼다 — 안 풀면 한 번 실패한 뒤로 영영 못 누른다", () => {
    const state = foldAll([
      submitted,
      { kind: "response_body", requestId: "r-1", body: failedBody },
    ]);
    expect(viewOf(state)["composer-submit"].disabled).toBe(false);
  });

  test("전송 거부도 푼다 — 응답이 아예 없는 갈래다", () => {
    const state = foldAll([
      submitted,
      { kind: "request_rejected", requestId: "r-1", reason: "네트워크" },
    ]);
    expect(viewOf(state)["composer-submit"].disabled).toBe(false);
  });

  test("초기 상태는 잠겨 있지 않다", () => {
    expect(viewOf(INITIAL_SCREEN_STATE)["composer-submit"].disabled).toBe(false);
  });

  test("낙관적 그리기가 없다 — 제출도 응답도 트랜스크립트를 안 움직인다", () => {
    // 결정 5 — *"제출한 프롬프트가 화면에 처음 서는 것은 서버가 그것을 메시지로 돌려줄 때다."*
    const seeded = foldAll([snapshotSignal([assistantMessage("m-1", "이미 있던 것")])]);
    const after = [
      submitted,
      { kind: "response_body", requestId: "r-1", body: acceptedBody } as const,
    ].reduce<ScreenState>(foldSignal, seeded);
    expect(after.transcript).toEqual(seeded.transcript);
  });

  test("남의 왕복이 내 잠금을 안 푼다 — 승인 응답 하나가 제출을 여는 경로가 없다", () => {
    const state = foldAll([
      submitted,
      {
        kind: "response_body",
        requestId: "r-other",
        body: responseBody({ type: "res", id: "r-other", ok: true }),
      },
    ]);
    expect(viewOf(state)["composer-submit"].disabled).toBe(true);
  });
});

/* -------------------------------------------------------------------------- *
 * 축 7 — 실패의 착지 (결정 6 · `readFrame` 경유)
 * -------------------------------------------------------------------------- */

describe("축 7 — 요청 실패가 connection-status에 선다 (§9.6 결정 6)", () => {
  const landOf = (body: string): string => {
    const state = foldAll([
      { kind: "prompt_submitted", requestId: "r-1" },
      { kind: "response_body", requestId: "r-1", body },
    ]);
    return viewOf(state)["connection-status"].text;
  };

  /**
   * §11의 실패 어휘 셋. **이것은 우리 세부가 아니라 서버가 소유한 계약이라 문자로 잰다** —
   * §9.6 결정 6이 셋을 이름으로 들었다(*"`run.prompt`의 `RUN_ACTIVE`, `approval.settle`의
   * `APPROVAL_UNKNOWN`·`APPROVAL_ALWAYS_UNAVAILABLE`"*).
   */
  const FAILURE_CODES = ["RUN_ACTIVE", "APPROVAL_UNKNOWN", "APPROVAL_ALWAYS_UNAVAILABLE"] as const;

  for (const code of FAILURE_CODES) {
    test(`${code}가 화면에 그대로 뜬다 — 버리면 그것이 침묵 실패다`, () => {
      const text = landOf(
        responseBody({ type: "res", id: "r-1", ok: false, error: { code, message: "사유" } }),
      );
      expect(text).toContain(code);
      expect(text).toContain("사유");
    });
  }

  test("성공 응답도 자국을 남긴다 — 빈 문면은 «아직 왕복이 없다» 하나뿐이다", () => {
    const accepted = landOf(responseBody({ type: "res", id: "r-1", ok: true }));
    const idle = viewOf(INITIAL_SCREEN_STATE)["connection-status"].text;
    expect(accepted.length).toBeGreaterThan(0);
    expect(accepted).not.toBe(idle);
  });

  test("읽을 수 없는 본문이 조용히 성공으로 안 접힌다 — 파싱이 `readFrame` 경유다", () => {
    // 사유의 어휘가 `readFrame`의 것이라는 사실이 이 축의 실질이다. 손 파서를 새로 두면
    // 이 갈래가 다른 형태로 접히거나 던져 사라진다.
    const broken = landOf("{ 이건 JSON이 아니다");
    const accepted = landOf(responseBody({ type: "res", id: "r-1", ok: true }));
    expect(broken.length).toBeGreaterThan(0);
    expect(broken).not.toBe(accepted);
  });

  test("응답 자리에 응답이 아닌 프레임이 와도 자국이 남는다", () => {
    const off = landOf(responseBody({ type: "req", id: "r-1", method: "run.prompt" }));
    const accepted = landOf(responseBody({ type: "res", id: "r-1", ok: true }));
    expect(off.length).toBeGreaterThan(0);
    expect(off).not.toBe(accepted);
  });

  test("다른 요청의 응답을 내 결과로 안 읽는다", () => {
    const mismatched = landOf(responseBody({ type: "res", id: "r-2", ok: true }));
    const accepted = landOf(responseBody({ type: "res", id: "r-1", ok: true }));
    expect(mismatched).not.toBe(accepted);
  });

  test("실패 응답이 코드·문면을 안 들면 성공으로 안 접힌다", () => {
    const shapeless = landOf(responseBody({ type: "res", id: "r-1", ok: false }));
    const accepted = landOf(responseBody({ type: "res", id: "r-1", ok: true }));
    expect(shapeless).not.toBe(accepted);
  });

  test("본문 하나가 순수 함수를 던지게 하지 않는다 — 던짐은 부트에서 삼켜진다", () => {
    for (const body of ["", "null", "[]", "42", '"문자열"', "{}"]) {
      expect(() => landOf(body), `본문이 던졌다 — ${body}`).not.toThrow();
    }
  });

  /* ------------------------------------------------------------------------ *
   * 문면의 수명 — 다음 제스처까지다 (결정 6 U-5, 2026-09-02 확정)
   * ------------------------------------------------------------------------ */

  /** 실패 하나가 서 있는 상태. 아래 셋의 공통 입력이다 */
  const failed = foldAll([
    { kind: "prompt_submitted", requestId: "r-1" },
    {
      kind: "response_body",
      requestId: "r-1",
      body: responseBody({
        type: "res",
        id: "r-1",
        ok: false,
        error: { code: "RUN_ACTIVE", message: "런이 이미 돈다" },
      }),
    },
  ]);

  test("입력 가정 — 실패가 실제로 서 있다. 안 서 있으면 아래 둘이 공허하다", () => {
    expect(failed.request.kind).toBe("failed");
    expect(viewOf(failed)["connection-status"].text).toContain("RUN_ACTIVE");
  });

  test("다음 프롬프트 제출이 앞 왕복의 결과를 지운다 (§9.6 결정 6 U-5)", () => {
    // 결정 6 — *"왕복 하나의 결과(성공이든 실패든)는 다음 프롬프트 제출이나 승인 응답이 날 때
    // 지워진다"*. **새 왕복이 시작했는데 앞 왕복의 실패가 그대로 서 있으면 그 문면이 지금의
    // 사실이 아니다.** 이 항은 코드 변경 없이 문서로 승격된 자리라(2026-09-02) 재는 축이
    // 없었고, 이 축이 그 자리를 회귀로 잡는다.
    const after = foldSignal(failed, { kind: "prompt_submitted", requestId: "r-2" });
    expect(after.request).toEqual({ kind: "none" });
    expect(viewOf(after)["connection-status"].text).not.toContain("RUN_ACTIVE");
  });

  test("승인 응답도 같은 제스처다 — 지우는 자리가 하나가 아니다 (§9.6 결정 6 U-5)", () => {
    const after = foldSignal(failed, {
      kind: "approval_answered",
      requestId: "r-3",
      approvalId: "a-1",
      answer: "allow-once",
    });
    expect(after.request).toEqual({ kind: "none" });
    expect(viewOf(after)["connection-status"].text).not.toContain("RUN_ACTIVE");
  });

  test("런의 종료는 제스처가 아니라 결과 문면을 안 지운다 (§9.6 결정 6 U-5)", () => {
    // 같은 항의 뒷문장 — *"**런의 종료 자체는 지우지 않는다**"*. 종료에도 지우면 «그 요청이
    // 어떻게 됐는가»가 화면에서 사라지고, 그것이 §2.6이 금지한 침묵이다.
    const after = foldSignal(failed, eventSignal({ type: "agent_end", messages: [] }));
    expect(after.request).toEqual(failed.request);
    expect(viewOf(after)["connection-status"].text).toContain("RUN_ACTIVE");
  });
});

/* -------------------------------------------------------------------------- *
 * 축 8·9 — 안 드는 것 (결정 2)
 * -------------------------------------------------------------------------- */

describe("축 8 — 화면 상태에 입력 텍스트가 없다 (§9.6 결정 2)", () => {
  test("상태의 자리가 표의 다섯과 정확히 같다", () => {
    // 표가 컴파일에서 강제되므로(위 `SCREEN_STATE_FIELDS`) 이 축이 재는 것은 실물의 초기값이
    // 그 표와 어긋나지 않는가다.
    expect(Object.keys(INITIAL_SCREEN_STATE).sort()).toEqual(
      Object.keys(SCREEN_STATE_FIELDS).sort(),
    );
  });

  test("서버 프레임을 접어도 자리가 안 는다 — 접기가 필드를 몰래 더하지 않는다", () => {
    const state = foldAll([
      snapshotSignal([assistantMessage("m-1", "첫째")], [pendingApproval("a-1")]),
      { kind: "prompt_submitted", requestId: "r-1" },
      { kind: "gap" },
    ]);
    expect(Object.keys(state).sort()).toEqual(Object.keys(SCREEN_STATE_FIELDS).sort());
  });

  /**
   * **타입 전용 — 실행하지 않는다.** 필드가 없다는 것을 런타임으로는 «오늘 없다»까지만 잴 수
   * 있고, 타입으로 재야 «표현할 수 없다»가 된다.
   */
  function draftTextIsNotRepresentable(state: ScreenState): void {
    // @ts-expect-error §9.6 결정 2 — 사용자가 치고 있는 텍스트는 화면 상태에 없다.
    void state.draftText;
    // 대조군 — 표의 자리는 지시자 없이 읽힌다.
    void state.transcript;
  }

  test("컴파일 축이 실제로 존재한다", () => {
    expect(draftTextIsNotRepresentable).toBeTypeOf("function");
  });
});

describe("축 9 — composer-submit 값이 잠금뿐이다 (§9.6 결정 2)", () => {
  const sample = viewOf(foldAll([snapshotSignal([assistantMessage("m-1", "첫째")])]));

  test("자리가 표의 하나와 정확히 같다 — 문면이 실리면 붉는다", () => {
    expect(Object.keys(sample["composer-submit"]).sort()).toEqual(
      Object.keys(SUBMIT_VIEW_FIELDS).sort(),
    );
  });

  test("그 하나가 불리언이다", () => {
    expect(typeof sample["composer-submit"].disabled).toBe("boolean");
  });

  test("읽는 자리에 그릴 값이 아예 없다 — `composer-input`의 키가 없다", () => {
    // 결정 2가 그 자리를 *"**읽는 자리**"*로 분류했다. 값이 있으면 그리기 층이 그것을 쓸 수
    // 있게 되고, 그때 서버 프레임 하나가 사용자가 친 것을 덮는다.
    expect(Object.hasOwn(sample, "composer-input")).toBe(false);
  });
});

/* -------------------------------------------------------------------------- *
 * 축 10~12 — 승인 (결정 7)
 * -------------------------------------------------------------------------- */

describe("축 10 — 승인의 시작이 스냅샷이다 (§9.6 결정 7)", () => {
  test("스냅샷의 pendingApprovals가 그대로 초기값이 된다", () => {
    const state = foldAll([snapshotSignal([], [pendingApproval("a-1"), pendingApproval("a-2")])]);
    expect(state.approvals.map((item) => item.id)).toEqual(["a-1", "a-2"]);
  });

  test("재접속의 스냅샷이 승인도 대체한다 — 누적이 없다", () => {
    const state = foldAll([
      snapshotSignal([], [pendingApproval("a-1")]),
      snapshotSignal([], [pendingApproval("a-2")]),
    ]);
    expect(state.approvals.map((item) => item.id)).toEqual(["a-2"]);
  });

  test("스냅샷이 화면까지 온다 — 상태에만 서고 그려지지 않는 경로가 없다", () => {
    const state = foldAll([snapshotSignal([], [pendingApproval("a-1")])]);
    expect(viewOf(state).approval.map((item) => item.id)).toEqual(["a-1"]);
  });
});

describe("축 11 — approval_open이 더하고 approval_close가 뺀다 (§9.6 결정 7)", () => {
  test("연 것이 늘어난다", () => {
    const state = foldAll([
      snapshotSignal([], []),
      effectSignal({ effect: "approval_open", approval: pendingApproval("a-1") }),
      effectSignal({ effect: "approval_open", approval: pendingApproval("a-2") }),
    ]);
    expect(state.approvals.map((item) => item.id)).toEqual(["a-1", "a-2"]);
  });

  test("닫은 것이 빠진다 — 그 하나만 빠진다", () => {
    const state = foldAll([
      snapshotSignal([], [pendingApproval("a-1"), pendingApproval("a-2")]),
      effectSignal({
        effect: "approval_close",
        id: "a-1",
        outcome: { decision: "allow", resolvedBy: "client" },
      }),
    ]);
    expect(state.approvals.map((item) => item.id)).toEqual(["a-2"]);
  });

  test("닫힌 항목이 화면에서도 사라진다", () => {
    const state = foldAll([
      snapshotSignal([], [pendingApproval("a-1")]),
      effectSignal({
        effect: "approval_close",
        id: "a-1",
        outcome: { decision: "deny", resolvedBy: "timeout" },
      }),
    ]);
    expect(viewOf(state).approval).toEqual([]);
  });

  test("같은 id를 두 번 열어도 항목이 둘 서지 않는다", () => {
    const state = foldAll([
      effectSignal({ effect: "approval_open", approval: pendingApproval("a-1") }),
      effectSignal({ effect: "approval_open", approval: pendingApproval("a-1") }),
    ]);
    expect(state.approvals.length).toBe(1);
  });

  test("없는 id를 닫아도 남은 것이 안 사라진다", () => {
    const state = foldAll([
      snapshotSignal([], [pendingApproval("a-1")]),
      effectSignal({
        effect: "approval_close",
        id: "a-없음",
        outcome: { decision: "allow", resolvedBy: "shutdown" },
      }),
    ]);
    expect(state.approvals.map((item) => item.id)).toEqual(["a-1"]);
  });
});

describe("축 12 — 답 셋이 서버의 것 그대로다 (§9.6 결정 7)", () => {
  test("낼 수 있는 답이 계약의 셋과 정확히 같다", () => {
    expect([...APPROVAL_ANSWERS].sort()).toEqual(Object.keys(CONTRACT_ANSWERS).sort());
  });

  test("승인 항목마다 답 셋이 전부 실린다 — 부분집합 금지", () => {
    const state = foldAll([snapshotSignal([], [pendingApproval("a-1"), pendingApproval("a-2")])]);
    for (const item of viewOf(state).approval) {
      expect(
        item.answers.map((choice) => choice.answer).sort(),
        `승인 ${item.id}의 답 집합이 좁아졌다`,
      ).toEqual(Object.keys(CONTRACT_ANSWERS).sort());
    }
  });

  test("답마다 문면이 있고 서로 구별된다 — 문면 자체는 세부라 문자로 안 잰다", () => {
    const state = foldAll([snapshotSignal([], [pendingApproval("a-1")])]);
    const labels = (viewOf(state).approval[0]?.answers ?? []).map((choice) => choice.label);
    expect(labels.length).toBe(Object.keys(CONTRACT_ANSWERS).length);
    for (const label of labels) expect(label.length).toBeGreaterThan(0);
    expect(new Set(labels).size).toBe(labels.length);
  });

  test("항목이 자기 id와 서버 문면을 그대로 나른다", () => {
    const approval = pendingApproval("a-1");
    const state = foldAll([snapshotSignal([], [approval])]);
    expect(viewOf(state).approval[0]?.id).toBe(approval.id);
    expect(viewOf(state).approval[0]?.display).toBe(approval.display);
  });
});

/* -------------------------------------------------------------------------- *
 * 축 13 — 파일 경계 (결정 1)
 * -------------------------------------------------------------------------- */

describe("축 13 — 순수 층이 그리기 층을 임포트하지 않는다 (§9.6 결정 1)", () => {
  const clientPath = (name: string): string =>
    fileURLToPath(new URL(`../client/${name}`, import.meta.url));

  /**
   * 층별 파일. **이름은 §12가 드는 세부다** — 그래서 아래 실재 축이 먼저 서고, 개명이 이
   * 검사를 조용히 통과시키는 경로(없는 파일에서 임포트 0건을 찾아 그린)를 막는다.
   */
  const PURE_MODULES = ["state.js", "view.js"] as const;
  const RENDER_MODULE = "render.js";

  /**
   * 소스에서 **실행되는** 모듈 지정자만 뽑는다. 주석은 먼저 걷어낸다 — 두 순수 모듈의 머리
   * 주석이 그리기 층을 이름으로 지목하고(층 셋을 설명하는 자리다) JSDoc의 `import("...")`은
   * 타입 표기라 실행 임포트가 아니다. 원문을 통째로 훑으면 그 문장들이 위반으로 읽혀 이
   * 축이 «항상 붉는» 검사가 된다.
   */
  const executableSpecifiers = (source: string): readonly string[] => {
    const stripped = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
    const found: string[] = [];
    for (const match of stripped.matchAll(/\bfrom\s*["']([^"']+)["']/g)) found.push(match[1] ?? "");
    for (const match of stripped.matchAll(/\bimport\s*\(\s*["']([^"']+)["']/g))
      found.push(match[1] ?? "");
    return found;
  };

  test("역검증 — 추출기가 주석 속 지목을 임포트로 읽지 않는다", () => {
    // 이 단언이 없으면 아래 축의 그린이 «추출기가 아무것도 못 찾는다»와 구별되지 않는다.
    const sample = [
      '/** 층 셋은 이 파일과 `./render.js`와 `./view.js`다. import from "./render.js" 아님 */',
      '// from "./render.js" — 주석이다',
      '/** @typedef {import("./render.js").AnchorElements} AnchorElements */',
      'import { readFrame } from "./protocol.js";',
    ].join("\n");
    expect(executableSpecifiers(sample)).toEqual(["./protocol.js"]);
  });

  test("역검증 — 추출기가 실제 임포트는 찾는다", () => {
    expect(executableSpecifiers('import { paint } from "./render.js";')).toEqual(["./render.js"]);
    expect(executableSpecifiers('const m = await import("./render.js");')).toEqual(["./render.js"]);
  });

  test("층별 파일이 실재한다 — 개명이 아래 축을 조용히 통과시키지 않는다", () => {
    for (const name of [...PURE_MODULES, RENDER_MODULE]) {
      expect(existsSync(clientPath(name)), `층의 파일이 없다 — ${name}`).toBe(true);
    }
  });

  for (const name of PURE_MODULES) {
    test(`${name}이 그리기 층을 임포트하지 않는다`, () => {
      const specifiers = executableSpecifiers(readFileSync(clientPath(name), "utf8"));
      expect(
        specifiers.length,
        `${name}에서 임포트를 하나도 못 찾았다 — 추출이 헛돌았다`,
      ).toBeGreaterThan(0);
      for (const specifier of specifiers) {
        expect(
          specifier,
          `${name}이 그리기 층을 연다 — 경계가 파일이라는 계약이 깨졌다`,
        ).not.toContain(RENDER_MODULE);
      }
    });
  }

  test("그리기 층은 반대로 순수 층을 연다 — 방향이 한쪽이다", () => {
    // 이 방향은 계약이 막지 않는다(판정을 순수 층에 두라는 것이 결정 1이다). 재는 이유는
    // 위 축이 «아무 파일도 서로를 안 연다»로도 그린이 되는 것을 막기 위해서다.
    const specifiers = executableSpecifiers(readFileSync(clientPath(RENDER_MODULE), "utf8"));
    expect(specifiers.some((one) => one.includes("view.js"))).toBe(true);
  });
});

/* -------------------------------------------------------------------------- *
 * 축 14 — 연결 서술의 파생
 * -------------------------------------------------------------------------- */

describe("축 14 — 연결 서술이 프레임 수신에서 파생한다 (§9.6 결정 6의 자리)", () => {
  /**
   * 서술만 뽑는다. 요청 결과가 같은 자리를 함께 쓰므로(결정 6) 왕복이 없는 상태에서 재야
   * 서술의 파생이 따로 보인다 — 그래서 아래 표본에 요청 신호를 안 섞는다.
   */
  const narrationOf = (signals: readonly WiringSignal[]): string =>
    viewOf(foldAll(signals))["connection-status"].text;

  const connecting = narrationOf([]);
  const connected = narrationOf([snapshotSignal([])]);
  const gapped = narrationOf([snapshotSignal([]), { kind: "gap" }]);
  const recovered = narrationOf([snapshotSignal([]), { kind: "gap" }, snapshotSignal([])]);

  test("초기값이 «연결됨»이 아니다 — 아직 참이 아닌 사실을 화면이 짓지 않는다", () => {
    expect(connecting.length).toBeGreaterThan(0);
    expect(connecting).not.toBe(connected);
  });

  test("핸드셰이크 수신이 «연결됨»의 원천이다 — 통지가 아니다", () => {
    // `stream.js`는 나쁜 소식만 통지한다(2026-08-28 실측). 최초 연결 성립에 통지 갈래가
    // 없으므로 이 파생이 아니면 화면이 영영 «연결 중»에 멈춘다.
    expect(connected.length).toBeGreaterThan(0);
    expect(connected).not.toBe(connecting);
  });

  test("갭이 «끊김»으로 간다 — 세 서술이 서로 구별된다", () => {
    expect(new Set([connecting, connected, gapped]).size).toBe(3);
  });

  test("다시 핸드셰이크가 오면 회복한다 — 갭이 흡수 상태가 아니다", () => {
    expect(recovered).toBe(connected);
  });

  test("결함과 종료 고지가 각자 자국을 남긴다 — 고지가 화면에 아무 결과를 안 낳는 형태가 없다", () => {
    const faulted = narrationOf([
      snapshotSignal([]),
      { kind: "fault", fault: { kind: "transport_gave_up" } },
    ]);
    const stopped = narrationOf([snapshotSignal([]), effectSignal({ effect: "stop" })]);
    expect(new Set([connected, gapped, faulted, stopped]).size).toBe(4);
  });

  test("계약 밖 프레임이 스트림으로 와도 자국이 남는다 — 조용히 안 버린다", () => {
    const offStream = narrationOf([
      snapshotSignal([]),
      { kind: "off_stream_frame", frameType: "req" },
    ]);
    expect(offStream).not.toBe(connected);
    expect(offStream.length).toBeGreaterThan(0);
  });

  test("서술과 요청 결과가 한 자리에 함께 선다 — 뒤엣것이 앞엣것을 안 지운다", () => {
    // 결정 6이 이 겹침을 *"가장 큰 빚"*으로 이름 붙였다. 오늘의 계약은 «둘 다 보인다»이고,
    // 서로를 지우는 관측이 났을 때 여는 것은 앵커 집합이다(그 항의 트리거).
    const both = narrationOf([
      snapshotSignal([]),
      { kind: "prompt_submitted", requestId: "r-1" },
      {
        kind: "response_body",
        requestId: "r-1",
        body: responseBody({
          type: "res",
          id: "r-1",
          ok: false,
          error: { code: "RUN_ACTIVE", message: "런이 이미 돈다" },
        }),
      },
    ]);
    expect(both).toContain("RUN_ACTIVE");
    expect(both).toContain(connected);
  });
});

/* -------------------------------------------------------------------------- *
 * 축 15 — 내부 표현의 구멍이 문면으로 안 샌다 (결정 14)
 * -------------------------------------------------------------------------- */

describe("축 15 — 도구 호출의 `args`가 없어도 문면이 `undefined`를 안 나른다 (§9.6 결정 14)", () => {
  /**
   * 도구 호출 블록 하나가 트랜스크립트에 실렸을 때의 줄. **줄을 짓는 함수를 직접 안 부른다** —
   * 그 이름은 §12의 세부이고 내보내지도 않는다. 배선이 실제로 도는 경로(접기 → 뷰) 그대로
   * 잰다.
   */
  const lineOfToolCall = (block: ToolCallContent): string => {
    const message: AssistantMessage = { ...assistantMessage("m-1", ""), content: [block] };
    return viewOf(foldAll([snapshotSignal([message])])).transcript[0]?.lines[0] ?? "";
  };

  /**
   * 값이 없는 경로 ① — **`unknown`이 `undefined`를 값으로 허용한다.** 결정 14가 든 두 경로 중
   * 앞엣것이고, `ToolCallContent.args`가 `unknown` **필수** 프로퍼티라 이 표본은 캐스트 없이
   * 그대로 타입에 성립한다(*"타입의 구멍이 아니라 **런타임 표현의 구멍**이다"*).
   */
  const MISSING_BY_VALUE: ToolCallContent = {
    type: "toolCall",
    toolCallId: "t-1",
    toolName: "shell",
    args: undefined,
  };

  /**
   * 값이 없는 경로 ② — **와이어가 그 키를 통째로 떨군다.** 결정 14가
   * *"실제로 그 값이 비는 경로는 와이어가 `JSON.stringify`로 그 키를 통째로 떨구는 것이다"*로
   * 든 자리이고, 여기서는 그 왕복을 그대로 태워 짓는다(손으로 만든 부분 객체가 아니라 실제
   * 직렬화의 산물이라는 것이 이 표본의 실질이다).
   */
  const MISSING_BY_WIRE = JSON.parse(JSON.stringify(MISSING_BY_VALUE)) as ToolCallContent;

  /** `{}`는 «인자 없이 호출했다»는 **별개의 사실**이다 — 결정 14가 안 건드린다고 못박았다 */
  const EMPTY_ARGS: ToolCallContent = { ...MISSING_BY_VALUE, args: {} };

  /** 값이 있는 경우. 방어가 실제 인자를 함께 삼키면 그것이 새 침묵이다(§2.6) */
  const WITH_ARGS: ToolCallContent = { ...MISSING_BY_VALUE, args: { cmd: "ls" } };

  test("표본 ②가 실제로 키를 잃었다 — 왕복이 아무것도 안 떨궜으면 그 축이 공허하다", () => {
    expect(Object.hasOwn(MISSING_BY_VALUE, "args"), "표본 ①에 키가 있어야 한다").toBe(true);
    expect(Object.hasOwn(MISSING_BY_WIRE, "args"), "왕복이 키를 안 떨궜다").toBe(false);
  });

  for (const [label, block] of [
    ["값이 `undefined`다", MISSING_BY_VALUE],
    ["와이어가 키를 떨궜다", MISSING_BY_WIRE],
  ] as const) {
    test(`${label} — 리터럴 \`undefined\`가 문면에 없다`, () => {
      // 결정 14가 계약으로 드는 것은 둘뿐이다 — *"리터럴 `"undefined"`의 부재와 `toolName`의
      // 존재"*. 정확한 낱말(공백·구두점)은 §12의 세부라 여기서 고정하지 않는다.
      const line = lineOfToolCall(block);
      expect(line, "표의 구멍이 문면으로 샜다").not.toContain("undefined");
      expect(line, "`toolName`이 문면에서 사라졌다").toContain("shell");
      expect(line.length, "줄이 통째로 비었다 — 그것은 §2.6의 침묵이다").toBeGreaterThan(0);
    });
  }

  test("역검증 — 술어가 고쳐지기 전의 문면을 실제로 붉힌다", () => {
    // 이 축의 단정이 «무엇을 먹여도 통과하는» 것이 아님을 못박는다. 아래 문면은 결정 14가
    // 인용한 옛 형태(`` `[도구 호출] ${block.toolName} ${JSON.stringify(block.args)}` ``)를
    // 그대로 태운 것이고, 그것이 실제로 리터럴을 낳는다는 것이 그 결정의 진단이다.
    const before = `[도구 호출] ${MISSING_BY_VALUE.toolName} ${JSON.stringify(MISSING_BY_VALUE.args)}`;
    expect(before).toContain("undefined");
  });

  test("`{}`는 «없음»과 구별된다 — 그것은 «인자 없이 호출했다»는 별개의 사실이다", () => {
    // 결정 14 — *"`args`가 `{}`(빈 객체)인 경우는 "인자 없이 호출했다"는 별개의 사실이라 안
    // 건드린다."* 방어가 빈 값 전부를 같은 자리로 접으면 그 구별이 화면에서 죽는다.
    const empty = lineOfToolCall(EMPTY_ARGS);
    expect(empty, "`{}`가 «없음»과 같은 문면으로 접혔다").not.toBe(
      lineOfToolCall(MISSING_BY_VALUE),
    );
    expect(empty).toContain("shell");
    expect(empty, "빈 객체를 `undefined`로 그렸다").not.toContain("undefined");
  });

  test("값이 있는 도구 호출은 그 값을 그대로 나른다 — 방어가 인자를 안 삼킨다", () => {
    const line = lineOfToolCall(WITH_ARGS);
    expect(line).toContain("shell");
    expect(line, "인자가 문면에서 사라졌다 — 방어가 너무 넓다").toContain("ls");
    expect(line).not.toContain("undefined");
    expect(line).not.toBe(lineOfToolCall(MISSING_BY_VALUE));
  });
});
