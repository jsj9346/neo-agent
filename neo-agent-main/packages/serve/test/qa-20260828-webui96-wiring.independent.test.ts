/**
 * 독립 QA — 배선 층(`packages/serve/client/`의 `state.js`·`view.js`·`protocol.js`·`stream.js`·
 * `main.js`). 정본은 `docs/WEB-UI.md` **§9.6**(주 계약 — 범위 표 · 결정 1~12)이고, 같은 문서
 * **§8.1**과 **§9.4 결정 13**이 배경 계약으로 걸린다.
 *
 * **[정정 — 2026-09-02 · §9.6 결정 15]** 이 파일이 축 A(범위 표 파싱)·축 G(그리기 층의
 * 배치)·축 H의 결정 3·10·11·12 몫을 함께 들었다. 결정 15가 그 셋을 «승격 대상»으로 닫아
 * 계약 테스트로 옮겼다 — 축 A의 전수 대조 하나는 `client-wiring-landing.contract.test.ts`
 * 축 1로, 축 G 여덟과 축 H 여섯은 `client-drawing-boot.contract.test.ts`로 갔다(축 A의
 * 나머지는 landing 축 1과 중복이라 폐기). **승격은 이동이지 복제가 아니다** — 그래서
 * 여기서 걷었다. 남는 것은 축 B~F·I와 축 H의 `[미규정]` 하나다. `render.js`는 이 파일이
 * 더 이상 읽지 않는다.
 *
 * **기대값은 정본에서만 도출했다.** 구현 주석이 자기 근거로 든 문장은 판정 재료로 쓰지
 * 않았다 — 구현이 «이렇게 도니 이것이 맞다»고 적은 것을 그대로 받으면 그것은 검증이 아니라
 * 받아쓰기다. 아래 축의 기대값은 전부 위 세 절의 문면에서 나왔고, 여러 축은 **모집단을
 * 런타임에 파싱해서** 기대값을 만든다(축 B는 코어의 `AgentEvent`, 축 D는 결함 갈래, 축 E는
 * 서버의 답). 그 형태가 결정 11이 요구한 *"문서와 실물 중 한쪽만 움직이면 붉는다"*를 실제로
 * 얻는 유일한 방법이다 — 정본 원문 자체를 파싱하던 축 A는 위 정정대로 계약 테스트로 갔다.
 *
 * ## 이 파일이 무엇을 안 하는가
 *
 * - **`src/`와 `client/`를 고치지 않는다.** 고치고 싶어진 자리는 전부 리포트로 갔다
 *   (`plans/20260828-webui-96-wiring-qa-report.md`).
 * - **가짜 DOM을 들이지 않는다.** §9.6이 그 갈래를 기각했다 —
 *   *"손으로 만든 가짜를 상대로 재면 재는 것이 그 가짜다"*. 그래서 실행 축은 순수 층 둘에만
 *   걸고, 브라우저 전역에 닿는 층은 **정적 읽기**로만 검토한다(그리기 층의 정적 읽기는
 *   2026-09-02에 계약 테스트로 갔다 — 위 정정). 앵커 원천 스텁은 가짜 DOM이 아니라
 *   `wiring.js`가 설계로 요구하는 **주입 인자**다(§9.4 결정 13).
 * - **새 의존성 0.** node 환경 · `node:fs`와 vitest만 쓴다.
 * - **기존 테스트 파일을 안 고친다.**
 *
 * ## 정적 읽기 축의 한계를 먼저 적는다 (§2.3)
 *
 * 아래 D·E·H·I 군은 **원문 텍스트 스캔**이다. §2.3·§9.3·§9.4가 세 번 거부한 것이 바로 이
 * 부류이고, 거부 근거는 *"못 찾으면 조용히 통과한다"*와 변수 경유를 못 본다는 것이다. **그
 * 거부는 「계약의 강제 수단으로 올리는 것」에 걸린 것이고**(§9.4 결정 13 —
 * *"그 축은 QA 산출물이지 이 절의 강제 수단이 아니다"*) QA 산출물로 두는 것은 선례가 있다.
 * 그래서 이 파일의 스캔 축은 **역검증**(심은 위반을 술어가 실제로 붉히는가)이나 **파생이
 * 실물을 얻는다**는 가드를 짝으로 달았고, 못 잡는 방향은 각 축의 주석이 이름으로 든다.
 * 예외 하나 — 축 H의 `[미규정]`은 임포트 추출기의 역검증을 함께 갖고 있었으나 그 역검증이
 * 승격분에 딸려 갔다(2026-09-02). 그 축이 공허해지지는 않는다: 추출기가 빈 배열을 내면
 * 그래프가 `main.js` 하나로 남아 `authored` 대조가 곧바로 붉는다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로 있는
 * 부분 문자열이고, 문서를 지목하는 자리는 절 번호와 결정 번호로 한다.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AgentEvent, AgentMessage, AssistantMessage } from "@neo-agent/core";
import { describe, expect, test } from "vitest";
import type { StateEffect, StreamFault } from "../client/protocol.js";
import type { ScreenState, WiringSignal } from "../client/state.js";
import {
  approvalRequest,
  foldSignal,
  INITIAL_SCREEN_STATE,
  promptRequest,
} from "../client/state.js";
import { APPROVAL_ANSWERS, approvalAnswerOf, viewOf, WIRED_ANCHORS } from "../client/view.js";
import { ASSET_MANIFEST } from "../src/assets.ts";
import type { PendingApproval, StateSnapshot } from "../src/protocol.ts";

/* -------------------------------------------------------------------------- *
 * 원문 읽기 — 기대값의 원천
 * -------------------------------------------------------------------------- */

const REPO = new URL("../../../", import.meta.url);
const readRepo = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, REPO)), "utf8");

const CORE_EVENTS = readRepo("packages/core/src/events.ts");
const SRC_APPROVALS = readRepo("packages/serve/src/approvals.ts");
const CLIENT_PROTOCOL = readRepo("packages/serve/client/protocol.js");
const CLIENT_STREAM = readRepo("packages/serve/client/stream.js");

/* -------------------------------------------------------------------------- *
 * 표본 — 정본이 든 타입에서만 짓는다
 * -------------------------------------------------------------------------- */

const assistant = (id: string, text: string, extra: Partial<AssistantMessage> = {}): AgentMessage =>
  ({
    id,
    role: "assistant",
    content: [{ type: "text", text }],
    stopReason: "end_turn",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    timestamp: 0,
    ...extra,
  }) as AgentMessage;

const approvalOf = (id: string): PendingApproval => ({
  id,
  display: `승인 ${id}`,
  requestedAt: 0,
  expiresAt: 1,
});

const snapshot = (
  messages: readonly AgentMessage[] = [],
  approvals: readonly PendingApproval[] = [],
): StateSnapshot => ({
  sessionId: "s-1",
  transcript: { complete: true, messages },
  pendingApprovals: approvals,
  safety: { approvalMode: "manual", sandbox: "on" },
});

const effectSignal = (effect: StateEffect): WiringSignal => ({ kind: "effect", effect });
const handshake = (
  messages: readonly AgentMessage[] = [],
  approvals: readonly PendingApproval[] = [],
): WiringSignal =>
  effectSignal({ effect: "replace_snapshot", snapshot: snapshot(messages, approvals) });

const fold = (signals: readonly WiringSignal[]): ScreenState =>
  signals.reduce<ScreenState>(foldSignal, INITIAL_SCREEN_STATE);

/** 화면의 그 자리에 실제로 서는 문면. 결정 6이 실패를 이 자리로 보냈다 */
const statusOf = (signals: readonly WiringSignal[]): string =>
  viewOf(fold(signals))["connection-status"].text;

/* ========================================================================== *
 * 축 B — `AgentEvent` 소진을 **코어 원문에서 파생해** 전수 대조한다 (결정 4)
 *
 * 결정 4: *"**그래도 열거를 소진으로 닫는다.** `AgentEvent`는 코어 소유라 이 검사가 붉는 날은
 * 코어가 이벤트를 더한 날이고"*. 표본 목록을 테스트에 손으로 적으면 **코어가 갈래를 더한
 * 날 이 축이 그 갈래를 아예 안 먹여** 조용히 그린이 된다 — 그래서 코어의 정의를 읽는다.
 * ========================================================================== */

const parseAgentEventTypes = (source: string): readonly string[] => {
  const at = source.indexOf("export type AgentEvent");
  if (at < 0) throw new Error("코어의 `AgentEvent` 정의를 못 찾았다.");
  const tail = source.slice(at);
  const end = tail.search(/\n\s*\n/);
  const body = end < 0 ? tail : tail.slice(0, end);
  return [...new Set([...body.matchAll(/\btype:\s*"([a-z_]+)"/g)].map((match) => match[1] ?? ""))];
};

const EVENT_TYPES = parseAgentEventTypes(CORE_EVENTS);
/** 결정 4가 트랜스크립트를 움직이는 것으로 든 셋 */
const LIFECYCLE = ["message_start", "message_update", "message_end"];

describe("축 B — 이벤트 열 갈래가 전부 접히고, 셋만 트랜스크립트를 움직인다 (결정 4)", () => {
  test("파생이 실물을 얻는다 — 표본이 비면 아래가 공허하다", () => {
    expect(EVENT_TYPES.length).toBeGreaterThan(0);
    for (const name of LIFECYCLE) expect(EVENT_TYPES).toContain(name);
  });

  test("역검증 — 파서가 새 갈래를 실제로 집어 온다", () => {
    const grown = CORE_EVENTS.replace(
      '| { type: "agent_start" }',
      '| { type: "agent_start" }\n  | { type: "qa_probe" }',
    );
    expect(grown).not.toBe(CORE_EVENTS);
    expect(parseAgentEventTypes(grown)).toContain("qa_probe");
  });

  for (const type of EVENT_TYPES) {
    test(`\`${type}\`가 조용히 버려지지 않는다 — 접기가 답을 낸다`, () => {
      const event = { type, message: assistant("m-1", "본문"), messages: [], toolResults: [] };
      expect(() => fold([{ kind: "event", event: event as unknown as AgentEvent }])).not.toThrow();
    });
  }

  for (const type of EVENT_TYPES.filter((name) => !LIFECYCLE.includes(name))) {
    test(`\`${type}\`가 트랜스크립트를 안 움직인다 — 나머지 일곱의 판정`, () => {
      const base = fold([handshake([assistant("m-1", "기존")])]);
      const event = { type, message: assistant("m-2", "새것"), messages: [], toolResults: [] };
      const after = foldSignal(base, { kind: "event", event: event as unknown as AgentEvent });
      expect(after.transcript).toEqual(base.transcript);
    });
  }

  test("모르는 판별자를 `default`로 흘리지 않는다 — 던지는 것이 이 자리의 계약이다", () => {
    // 기각 표: *"`AgentEvent`의 관심 없는 갈래를 `default`로 흘린다"*. 조용히 흘리면
    // 코어가 이벤트를 더한 날 판정할 것이 아무 데서도 안 뜬다.
    expect(() =>
      fold([{ kind: "event", event: { type: "qa_unknown" } as unknown as AgentEvent }]),
    ).toThrow();
  });

  test("동일성이 메시지 `id`다 — 같은 id는 대체, 다른 id는 뒤에 붙는다", () => {
    const same = fold([
      {
        kind: "event",
        event: { type: "message_start", message: assistant("m-1", "초안") } as AgentEvent,
      },
      {
        kind: "event",
        event: { type: "message_end", message: assistant("m-1", "최종") } as AgentEvent,
      },
    ]);
    expect(same.transcript).toHaveLength(1);
    expect(same.transcript[0]?.content).toEqual([{ type: "text", text: "최종" }]);

    const two = fold([
      {
        kind: "event",
        event: { type: "message_end", message: assistant("m-1", "첫째") } as AgentEvent,
      },
      {
        kind: "event",
        event: { type: "message_end", message: assistant("m-2", "둘째") } as AgentEvent,
      },
    ]);
    expect(two.transcript.map((message) => message.id)).toEqual(["m-1", "m-2"]);
  });

  test("스냅샷이 대체다 — 이벤트로 쌓인 것에 누적하지 않는다 (§8.1)", () => {
    const state = fold([
      {
        kind: "event",
        event: { type: "message_end", message: assistant("m-1", "옛것") } as AgentEvent,
      },
      handshake([assistant("m-9", "스냅샷")]),
    ]);
    expect(state.transcript.map((message) => message.id)).toEqual(["m-9"]);
  });

  test("내용 블록 넷이 전부 줄을 얻는다 — 텍스트가 아닌 블록이 빈 줄로 안 선다", () => {
    // 뷰 층의 `MessageContent` 소진 검사가 그 자리다. 버리면 그 메시지가 화면에 빈 줄로
    // 서고, 그것이 §2.6의 형태다.
    const rich = assistant("m-1", "본문", {
      content: [
        { type: "text", text: "본문" },
        { type: "thinking", text: "생각" },
        { type: "toolCall", toolCallId: "t-1", toolName: "shell", args: { cmd: "ls" } },
      ],
    } as Partial<AssistantMessage>);
    const item = viewOf(fold([handshake([rich])])).transcript[0];
    expect(item?.lines).toHaveLength(3);
    for (const line of item?.lines ?? []) expect(line.length).toBeGreaterThan(0);
  });

  test("도구 호출의 `args`가 없어도 문면에 `undefined`가 안 든다 (2026-09-02 · §9.6 결정 14 확정)", () => {
    // **폐기 전 원 축의 이름**: "[미규정] 도구 호출의 `args`가 없으면 문면에 `undefined`가 든다" —
    // 그 축이 오늘의 사실만 못박고 *"이 축이 붉는 날은 그 자리가 판정된 날이다"*로 자기 만료를
    // 적어 두었다. **오늘 그날이다** — §9.6 결정 14가 그 누출을 계약 위반으로 판정했다
    // (*"내부 표현의 구멍이 문면으로 새지 않는다"* · *"버려도 되는 것은 «없음»을 그대로
    // 나타내는 것뿐이고, 없음을 «undefined»라는 다른 사실처럼 나타내는 것은 아니다."*).
    // 그 결정이 계약으로 드는 것은 둘뿐이다 — *"리터럴 `"undefined"`의 부재와 `toolName`의
    // 존재"*. 정확한 문면은 §12의 세부라 여기서도 고정하지 않는다.
    //
    // **부호를 뒤집어 회귀 축으로 살린다.** 폐기하면 이 파일이 그 누출을 다시는 안 재게 되고,
    // 되돌려도 조용해진다 — 형제 축 둘(":983"·":1003")이 같은 처분을 밟았다. **판정의 정본은
    // 여기가 아니다** — `client-wiring-landing.contract.test.ts` 축 15가 두 경로(값이
    // `undefined`인 것과 와이어가 키를 떨군 것)와 `{}`의 구별을 정본 인용과 함께 든다.
    const missing = assistant("m-1", "본문", {
      content: [{ type: "toolCall", toolCallId: "t-1", toolName: "shell" }],
    } as unknown as Partial<AssistantMessage>);
    const line = viewOf(fold([handshake([missing])])).transcript[0]?.lines[0] ?? "";
    expect(line).toContain("shell");
    expect(line, "표의 구멍이 문면으로 샜다 — §9.6 결정 14").not.toContain("undefined");
  });

  test("[미규정] 같은 누출이 형제 보간 넷에 그대로 있다 — 결정 14가 고친 자리는 `args` 하나다", () => {
    // **판정 필요.** 결정 14의 표제는 일반 금지다 — *"내부 표현의 구멍이 문면으로 새지
    // 않는다"*. 그런데 같은 항의 계약 문장은 도구 호출 문면 하나로 좁다 — *"이 결정이 계약으로
    // 드는 것은 리터럴 `"undefined"`의 부재와 `toolName`의 존재 둘뿐이다"*. 그 사이가 회색이다:
    // **와이어가 키를 떨구는 경로**(그 항이 든 실제 경로)는 `args`만의 것이 아니고, 아래 넷이
    // 오늘 전부 같은 형태로 샌다. 그 중 첫째는 **결정 14가 계약으로 든 그 문면 자신**이다 —
    // `toolName`이 비면 그 자리에 리터럴이 서고 «`toolName`의 존재»도 함께 깨진다.
    //
    // 어느 쪽으로 읽어야 하는지(표제의 일반 금지인가, 계약 문장의 좁은 둘인가)를 §9.6도 §12도
    // 안 든다. 그래서 **오늘의 사실만 못박고 판정은 리포트로 올린다** — 이 축이 붉는 날은 그
    // 자리가 판정된 날이고, 그때 부호를 뒤집어 회귀 축으로 살린다(바로 위 형제가 밟은 경로).
    //
    // **입력은 손으로 만든 부분 객체가 아니라 와이어 왕복의 산물이다** — `JSON.stringify`가
    // 값이 `undefined`인 키를 통째로 떨구는 그 경로 그대로다(결정 14가 이름 붙였다).
    const overWire = (block: unknown): string => {
      const shipped = JSON.parse(JSON.stringify(block)) as never;
      const message = assistant("m-1", "본문", {
        content: [shipped],
      } as unknown as Partial<AssistantMessage>);
      return (
        viewOf(fold([handshake([message])])).transcript[0]?.lines[0] ?? "«줄이 문자열이 아니다»"
      );
    };

    const LEAKS: readonly (readonly [string, unknown])[] = [
      // ① 결정 14가 계약으로 든 바로 그 문면. 계약 둘이 **함께** 깨진다.
      ["`toolName`이 떨궈진 도구 호출", { type: "toolCall", toolCallId: "t-1", args: { a: 1 } }],
      ["`mimeType`이 떨궈진 이미지", { type: "image", data: "x" }],
      ["`text`가 떨궈진 사고", { type: "thinking" }],
    ];
    for (const [label, block] of LEAKS) {
      expect(overWire(block), `${label} — 오늘의 사실이 바뀌었다`).toContain("undefined");
    }

    // 텍스트 블록은 한 단계 더 나간다 — 줄 자체가 문자열이 아니라 `undefined` 값이 되고,
    // 그리기 층이 그것을 `textContent`에 그대로 넣는다(`render.js`의 *"`textContent`뿐이다"*).
    // 그 대입은 `null`만 빈 문자열로 접으므로 화면에는 역시 리터럴이 선다.
    const message = assistant("m-1", "본문", {
      content: [{ type: "text" }],
    } as unknown as Partial<AssistantMessage>);
    const lines = viewOf(fold([handshake([message])])).transcript[0]?.lines ?? [];
    expect(lines).toHaveLength(1);
    expect(typeof lines[0], "줄이 문자열이 됐다 — 오늘의 사실이 바뀌었다").toBe("undefined");
  });
});

/* ========================================================================== *
 * 축 C — 응답을 버리지 않는다: **침묵 실패 사냥** (결정 6)
 *
 * 결정 6: *"요청의 응답을 버리지 않는다 — 실패는 `connection-status`가 진다."* ·
 * *"버리면 그것이 정확히 §2.6의 침묵 실패다."*
 *
 * 계약이 든 것은 «버리지 않는다»이므로 재는 것은 **자국의 존재**다. 문면 자체는 §12의
 * 세부라 리터럴로 안 잰다 — 다만 **`undefined`가 문면에 새는 것은 세부가 아니다**(표의
 * 구멍이 화면에 그대로 뜬 것이므로 날조된 기본값과 같은 부류다).
 * ========================================================================== */

const RESPONSE_ID = "c1";
const bodySignal = (body: unknown, id = RESPONSE_ID): WiringSignal => ({
  kind: "response_body",
  requestId: id,
  body: typeof body === "string" ? body : JSON.stringify(body),
});

/** 왕복 하나를 낸 뒤 그 결과가 화면에 남긴 자국 */
const roundTrip = (body: unknown, id = RESPONSE_ID): string =>
  statusOf([
    handshake(),
    { kind: "prompt_submitted", requestId: RESPONSE_ID },
    bodySignal(body, id),
  ]);

describe("축 C — 요청 왕복의 어떤 결말도 화면에서 침묵하지 않는다 (결정 6)", () => {
  const baseline = statusOf([handshake()]);

  const CASES: readonly (readonly [string, unknown])[] = [
    [
      "서버가 이름 붙인 실패",
      {
        type: "res",
        id: RESPONSE_ID,
        ok: false,
        error: { code: "run_active", message: "이미 돈다" },
      },
    ],
    ["성공", { type: "res", id: RESPONSE_ID, ok: true }],
    ["본문이 JSON이 아니다", "not json at all"],
    ["본문이 빈 문자열이다", ""],
    ["본문이 HTML 오류 페이지다", "<!doctype html><title>404</title>"],
    ["본문이 배열이다", [1, 2, 3]],
    ["응답 자리에 요청이 왔다", { type: "req", id: RESPONSE_ID, method: "run.prompt" }],
    ["응답 자리에 푸시가 왔다", { type: "event", seq: 1, event: { type: "agent_start" } }],
    ["`ok`가 아예 없다", { type: "res", id: RESPONSE_ID }],
    ['`ok`가 문자열 `"true"`다', { type: "res", id: RESPONSE_ID, ok: "true" }],
    ["`ok: false`인데 `error`가 없다", { type: "res", id: RESPONSE_ID, ok: false }],
    ["`error`가 `null`이다", { type: "res", id: RESPONSE_ID, ok: false, error: null }],
    ["`error`가 배열이다", { type: "res", id: RESPONSE_ID, ok: false, error: ["run_active"] }],
    [
      "`error.code`가 숫자다",
      { type: "res", id: RESPONSE_ID, ok: false, error: { code: 429, message: "x" } },
    ],
    [
      "`error.message`가 없다",
      { type: "res", id: RESPONSE_ID, ok: false, error: { code: "run_active" } },
    ],
  ];

  for (const [label, body] of CASES) {
    test(`${label} — 자국이 남고 «아직 왕복이 없다»와 구별된다`, () => {
      const text = roundTrip(body);
      expect(text.length, "문면이 비었다 — 왕복이 조용히 사라졌다").toBeGreaterThan(0);
      expect(text, "왕복 전과 같은 문면이다 — 결과가 화면에 안 닿았다").not.toBe(baseline);
      expect(text, "표의 구멍이 문면으로 샜다").not.toContain("undefined");
      expect(text).not.toContain("[object Object]");
    });
  }

  test("전송이 거부한 왕복도 자국을 남긴다 — 응답이 아예 없는 갈래다", () => {
    const text = statusOf([
      handshake(),
      { kind: "prompt_submitted", requestId: RESPONSE_ID },
      { kind: "request_rejected", requestId: RESPONSE_ID, reason: "TypeError: failed to fetch" },
    ]);
    expect(text).not.toBe(baseline);
    expect(text).toContain("failed to fetch");
  });

  test("다른 요청의 응답을 성공으로 안 읽는다 — §6의 «요청 하나에 정확히 하나»", () => {
    // 이 왕복은 **내가 보낸 것**이고(부트가 붙인 `requestId`가 같다) 프레임 안의 `id`만 갈렸다.
    // 그래서 왕복 자체는 끝났고 잠금은 풀리는 것이 결정 5의 *"왕복 동안"*이다 — 재는 것은
    // 그 응답이 **성공으로 접히지 않는가**다.
    const state = fold([
      handshake(),
      { kind: "prompt_submitted", requestId: RESPONSE_ID },
      bodySignal({ type: "res", id: "남의-것", ok: true }),
    ]);
    expect(state.request.kind, "id가 갈린 응답이 성공으로 접혔다").not.toBe("accepted");
    expect(viewOf(state)["connection-status"].text).not.toBe(baseline);
    // 그리고 잠금은 풀린다 — 안 풀면 응답이 온 왕복에서 사용자가 영영 못 누른다.
    expect(state.submit.phase).toBe("idle");
  });

  test("응답 본문 하나가 접기를 던지게 하지 않는다 — 던짐은 급수에서 삼켜진다", () => {
    for (const [, body] of CASES) {
      expect(() => fold([bodySignal(body)])).not.toThrow();
    }
  });

  test("제출 잠금이 성공·실패·거부 어느 쪽으로도 풀린다 — 영영 못 누르는 화면이 없다", () => {
    const submitted: readonly WiringSignal[] = [
      { kind: "prompt_submitted", requestId: RESPONSE_ID },
    ];
    expect(fold(submitted).submit.phase).toBe("in_flight");
    for (const closing of [
      bodySignal({ type: "res", id: RESPONSE_ID, ok: true }),
      bodySignal({
        type: "res",
        id: RESPONSE_ID,
        ok: false,
        error: { code: "run_active", message: "x" },
      }),
      bodySignal("not json"),
      { kind: "request_rejected", requestId: RESPONSE_ID, reason: "네트워크" } as WiringSignal,
    ]) {
      expect(fold([...submitted, closing]).submit.phase, "왕복이 끝났는데 잠금이 남았다").toBe(
        "idle",
      );
    }
  });

  test("승인 왕복이 제출 잠금을 안 푼다 — 누른 것과 무관한 자리가 안 움직인다", () => {
    const state = fold([
      { kind: "prompt_submitted", requestId: "c1" },
      { kind: "approval_answered", requestId: "c2", approvalId: "a-1", answer: "deny" },
      bodySignal({ type: "res", id: "c2", ok: true }, "c2"),
    ]);
    expect(state.submit).toEqual({ phase: "in_flight", requestId: "c1" });
  });

  test("낙관적 그리기가 없다 — 제출 제스처가 트랜스크립트를 안 건드린다 (결정 5)", () => {
    const before = fold([handshake([assistant("m-1", "기존")])]);
    const after = foldSignal(before, { kind: "prompt_submitted", requestId: "c1" });
    expect(after.transcript).toEqual(before.transcript);
  });
});

/* ========================================================================== *
 * 축 D — 결함 문면이 전 갈래를 든다 (결정 6의 자리 · §8.1)
 *
 * `StreamFault`는 §8.1이 *"갈래를 더하는 것이 곧 소비자의 소진 검사를 붉히는 것"*이 **아니라**
 * 고 스스로 정정한 유니온이고, 그래서 강제 수단을 검사 쪽에 두기로 했다 —
 * *"갈래 전부를 키로 드는 표 하나가 §9.3의 유닛 축에 살고"*. 그 표가 배선의 문면 층에도
 * 있으므로 **여기서 전수로 먹인다.** 빠진 키는 화면에서 `undefined`로 뜬다.
 * ========================================================================== */

const parseFaultKinds = (source: string): readonly string[] => {
  const end = source.indexOf("} StreamFault");
  if (end < 0) throw new Error("`StreamFault` 정의를 못 찾았다.");
  const start = source.lastIndexOf("@typedef", end);
  return [
    ...new Set(
      [...source.slice(start, end).matchAll(/\bkind:\s*"([a-z_]+)"/g)].map((m) => m[1] ?? ""),
    ),
  ];
};

const FAULT_KINDS = parseFaultKinds(CLIENT_PROTOCOL);

describe("축 D — 결함 갈래 전부가 이름을 얻는다 (§8.1 · 결정 6)", () => {
  test("파생이 실물을 얻는다", () => {
    expect(FAULT_KINDS.length).toBeGreaterThan(1);
    expect(FAULT_KINDS).toContain("transport_gave_up");
  });

  const texts = new Map<string, string>();

  for (const kind of FAULT_KINDS) {
    test(`\`${kind}\`가 문면을 얻는다 — 표의 구멍이 화면에 안 샌다`, () => {
      const text = statusOf([handshake(), { kind: "fault", fault: { kind } as StreamFault }]);
      expect(text.length).toBeGreaterThan(0);
      expect(text, "결함 이름이 표에 없어 `undefined`가 화면에 떴다").not.toContain("undefined");
      texts.set(kind, text);
    });
  }

  test("갈래끼리 서로 구별된다 — 뭉치면 사용자의 다음 행동이 한 문면으로 접힌다", () => {
    const all = FAULT_KINDS.map((kind) =>
      statusOf([handshake(), { kind: "fault", fault: { kind } as StreamFault }]),
    );
    expect(new Set(all).size).toBe(FAULT_KINDS.length);
  });

  test("응답을 못 읽은 자리도 같은 표를 쓴다 — 두 자리 중 하나만 이름을 얻는 상태가 없다", () => {
    const text = roundTrip("not json");
    expect(text).not.toContain("undefined");
  });

  test("종료 고지가 자국을 남긴다 — §6.1이 이름 붙인 «고지가 아무 결과를 안 낳는» 형태가 없다", () => {
    const stopped = statusOf([handshake(), effectSignal({ effect: "stop" })]);
    const connected = statusOf([handshake()]);
    expect(stopped).not.toBe(connected);
    expect(stopped.length).toBeGreaterThan(0);
  });

  test("스트림으로 온 계약 밖 프레임도 자국을 남긴다 — 조용히 안 버린다", () => {
    for (const frameType of ["req", "res"] as const) {
      const text = statusOf([handshake(), { kind: "off_stream_frame", frameType }]);
      expect(text).not.toBe(statusOf([handshake()]));
      expect(text).not.toContain("undefined");
    }
  });
});

/* ========================================================================== *
 * 축 E — 승인 (결정 7)
 * ========================================================================== */

const parseServerAnswers = (source: string): readonly string[] => {
  const match = source.match(/const APPROVAL_ANSWERS = \[([^\]]*)\] as const/);
  if (match === null) throw new Error("서버의 답 집합을 못 찾았다.");
  return [...(match[1] ?? "").matchAll(/"([a-z-]+)"/g)].map((one) => one[1] ?? "");
};

const SERVER_ANSWERS = parseServerAnswers(SRC_APPROVALS);

describe("축 E — 승인의 답과 항목 (결정 7)", () => {
  test("파생이 실물을 얻는다", () => {
    expect(SERVER_ANSWERS.length).toBeGreaterThan(0);
  });

  test("낼 수 있는 답이 서버의 집합 그대로다 — 부분집합을 고르지 않았다", () => {
    // *"배선이 부분집합을 고르면 그 좁힘이 어디에도 안 적힌 사본이 되고"*.
    expect([...APPROVAL_ANSWERS].sort()).toEqual([...SERVER_ANSWERS].sort());
  });

  test("항목마다 답 전부가 실린다 — 화면에서 답이 조용히 지워지는 자리가 없다", () => {
    const values = viewOf(fold([handshake([], [approvalOf("a-1"), approvalOf("a-2")])]));
    expect(values.approval).toHaveLength(2);
    for (const item of values.approval) {
      expect(item.answers.map((one) => one.answer).sort()).toEqual([...SERVER_ANSWERS].sort());
      for (const one of item.answers) expect(one.label.length).toBeGreaterThan(0);
    }
  });

  test("승인 상태가 스냅샷에서 시작해 열림이 더하고 닫힘이 뺀다", () => {
    const state = fold([
      handshake([], [approvalOf("a-1")]),
      effectSignal({ effect: "approval_open", approval: approvalOf("a-2") }),
      effectSignal({ effect: "approval_close", id: "a-1", outcome: "answered" as never }),
    ]);
    expect(state.approvals.map((one) => one.id)).toEqual(["a-2"]);
  });

  test("재접속 스냅샷이 승인도 대체한다 — 누적하면 같은 게이트가 둘 선다", () => {
    const state = fold([
      handshake([], [approvalOf("a-1")]),
      handshake([], [approvalOf("a-1"), approvalOf("a-2")]),
    ]);
    expect(state.approvals.map((one) => one.id)).toEqual(["a-1", "a-2"]);
  });

  test("답 술어가 집합 밖을 거른다 — 위임이 낳는 갈래", () => {
    for (const answer of SERVER_ANSWERS) expect(approvalAnswerOf(answer)).toBe(answer);
    for (const outside of [
      null,
      "",
      "allow",
      "ALLOW-ONCE",
      "toString",
      "constructor",
      "__proto__",
    ]) {
      expect(
        approvalAnswerOf(outside),
        `집합 밖 값이 답으로 읽혔다 — ${String(outside)}`,
      ).toBeNull();
    }
  });

  test("요청 프레임이 서버의 답을 그대로 싣고 id를 받아서 쓴다 (결정 10)", () => {
    for (const answer of SERVER_ANSWERS) {
      const frame = approvalRequest("req-1", "a-1", answer as never);
      expect(frame).toEqual({
        type: "req",
        id: "req-1",
        method: "approval.settle",
        params: { id: "a-1", answer },
      });
    }
  });
});

/* ========================================================================== *
 * 축 F — 순수 층이 순수하다 (결정 1·10)
 *
 * 결정 1: *"①②는 순수하고 시그니처에 DOM 타입도 DOM 전역도 안 낸다"* ·
 * 결정 10: *"요청 id를 순수 층이 짓지 않는다."*
 *
 * **실행 축이 먼저다.** 이 파일은 node 환경에서 도므로 `document`·`window`가 없다. 순수 층
 * 둘을 임포트하고 전 경로를 도는 것 자체가 «전역에 안 닿는다»의 실물이고, 그것은 텍스트
 * 스캔이 아니다. 스캔은 그 뒤에 보조로만 선다.
 * ========================================================================== */

describe("축 F — 접기·뷰가 브라우저 없이 돈다 (결정 1)", () => {
  test("이 환경에 DOM 전역이 없다 — 아래 축이 공허하지 않은 조건", () => {
    expect(typeof (globalThis as Record<string, unknown>).document).toBe("undefined");
    expect(typeof (globalThis as Record<string, unknown>).window).toBe("undefined");
  });

  test("모든 신호 갈래를 접고 그릴 값까지 내는 데 전역이 필요 없다", () => {
    const every: readonly WiringSignal[] = [
      handshake([assistant("m-1", "본문")], [approvalOf("a-1")]),
      {
        kind: "event",
        event: { type: "message_end", message: assistant("m-2", "둘째") } as AgentEvent,
      },
      { kind: "gap" },
      { kind: "off_stream_frame", frameType: "res" },
      { kind: "prompt_submitted", requestId: "c1" },
      { kind: "approval_answered", requestId: "c2", approvalId: "a-1", answer: "deny" },
      bodySignal({ type: "res", id: "c2", ok: true }, "c2"),
      { kind: "request_rejected", requestId: "c3", reason: "네트워크" },
      { kind: "fault", fault: { kind: "transport_gave_up" } },
      effectSignal({ effect: "stop" }),
    ];
    const values = viewOf(fold(every));
    expect(values["connection-status"].text.length).toBeGreaterThan(0);
    expect(values.transcript.length).toBeGreaterThan(0);
  });

  test("같은 입력에 같은 출력이다 — 뷰가 비결정 원천을 안 쓴다", () => {
    const state = fold([handshake([assistant("m-1", "본문")], [approvalOf("a-1")])]);
    expect(viewOf(state)).toEqual(viewOf(state));
  });

  test("접기가 받은 상태를 제자리에서 안 고친다 — 「화면은 상태의 함수다」의 전제", () => {
    const before = fold([handshake([assistant("m-1", "본문")])]);
    const frozen = JSON.stringify(before);
    foldSignal(before, {
      kind: "event",
      event: { type: "message_end", message: assistant("m-2", "둘") } as AgentEvent,
    });
    expect(JSON.stringify(before)).toBe(frozen);
  });

  test("요청 id를 순수 층이 안 짓는다 — 받아서 그대로 싣는다 (결정 10)", () => {
    expect(promptRequest("given-1", "안녕")).toEqual({
      type: "req",
      id: "given-1",
      method: "run.prompt",
      params: { text: "안녕" },
    });
    // 두 번 불러도 같다 — 안에서 발급하면 여기서 갈린다.
    expect(promptRequest("given-1", "안녕")).toEqual(promptRequest("given-1", "안녕"));
  });

  test("화면 상태에 사용자가 치고 있는 텍스트의 자리가 없다 (결정 2)", () => {
    const keys = Object.keys(
      fold([handshake(), { kind: "prompt_submitted", requestId: "c1" }]),
    ).sort();
    expect(keys).toEqual(["approvals", "connection", "request", "submit", "transcript"]);
    // 이름으로도 한 번 더 막는다 — 필드가 늘 때 이 축이 「무엇이 늘었나」를 말한다.
    for (const key of keys) {
      expect(/draft|input|text|composer/i.test(key), `입력 텍스트로 읽히는 자리다 — ${key}`).toBe(
        false,
      );
    }
  });

  test("그릴 값에 `composer-input`의 자리가 없다 — 읽는 자리에 쓸 값이 없다 (결정 2)", () => {
    const values = viewOf(fold([handshake()]));
    expect(Object.keys(values).sort()).toEqual([
      "approval",
      "composer-submit",
      "connection-status",
      "transcript",
    ]);
  });

  test("`composer-submit`에 실리는 것이 잠금 하나다 — 문면이 안 실린다 (결정 2)", () => {
    const values = viewOf(fold([{ kind: "prompt_submitted", requestId: "c1" }]));
    expect(Object.keys(values["composer-submit"])).toEqual(["disabled"]);
    expect(values["composer-submit"].disabled).toBe(true);
    expect(viewOf(fold([handshake()]))["composer-submit"].disabled).toBe(false);
  });
});

/* ========================================================================== *
 * 원문 스캔의 공유 추출기
 *
 * 축 G(그리기 층의 배치)가 이 자리에 있었고 그 배너가 이 추출기들을 설명했다. **2026-09-02에
 * 축 G 전체가 `client-drawing-boot.contract.test.ts`로 승격됐다**(§9.6 결정 15). 추출기는
 * 남는 축(아래 축 H의 `[미규정]`과 축 I)이 계속 쓰므로 여기 남는다 — 승격이 «이동»인 것과
 * 별개로, 여러 축이 공유하는 헬퍼는 목적지에 **복사**됐다.
 * ========================================================================== */

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

/* ========================================================================== *
 * 축 H — 부트의 임포트 그래프 ([미규정])
 *
 * [정정 — 2026-09-02 · §9.6 결정 15] 이 축은 결정 3·10·11·12를 재는 여섯 테스트를 함께
 * 들었고, 그 여섯이 `client-drawing-boot.contract.test.ts`로 승격됐다. 여기 남는 것은
 * **정본이 아직 판정하지 않은** 하나뿐이다 — 미확정 의무는 계약으로 올리지 않는다.
 * ========================================================================== */

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

describe("축 H — 부트의 임포트 그래프 ([미규정])", () => {
  test("[미규정] 부트의 임포트 그래프가 형제 전부를 덮는다", () => {
    // **정본이 이 의무를 안 든다.** §9.5 결정 4가 정하는 것은 진입점이 **하나**라는 것뿐이고,
    // 그 하나가 `authored` 집합을 전부 끌어오는가는 2026-08-27에 **미규정 유지**로 판정됐다.
    // §9.6 결정 12는 트리거가 발동했다는 사실만 적고 뒤집지 않았다. 그래서 이 축의 붉음은
    // «계약 위반»이 아니라 "오늘의 사실이 바뀌었다"다 — 판정은 리포트로 올린다.
    const graph = new Set<string>();
    const walk = (file: string): void => {
      if (graph.has(file)) return;
      graph.add(file);
      const source = readRepo(`packages/serve/client/${file}`);
      for (const specifier of importSpecifiers(source)) {
        if (specifier.startsWith("./")) walk(specifier.slice(2));
      }
    };
    walk("main.js");

    const authored = Object.values(ASSET_MANIFEST)
      .filter((entry) => entry.origin === "authored" && entry.file.endsWith(".js"))
      .map((entry) => entry.file);
    expect(authored.length, "매니페스트에서 `authored` 스크립트를 못 찾았다").toBeGreaterThan(0);
    for (const file of authored) {
      expect(graph, `진입점 그래프가 안 덮는 자산이다 — ${file}`).toContain(file);
    }
  });
});

/* ========================================================================== *
 * 축 I — 정본이 스스로 든 한계를 **못박는다**
 *
 * §9.6의 「이 절이 재지 못하는 것」과 §8.1의 같은 절이 든 사실들이다. 계약 위반이 아니라
 * **오늘 참인 사실**이고, 적어 두지 않으면 다음 사이클이 그 자리를 「이미 붙었다」로 읽는다.
 * ========================================================================== */

describe("축 I — 안 붙는 자리와 안 재는 자리 (§9.6 「이 절이 재지 못하는 것」)", () => {
  test("안전 표시 둘이 오늘 화면에 안 선다 — 확정된 안전 계약이 한 사이클 더 미이행이다", () => {
    // §9.4 결정 10이 계약으로 든 표시가 배선 집합 밖이라 그릴 값이 아예 없다.
    // 정본이 그 대가를 스스로 적었고, 이 축은 그 사실을 회귀로 못박는다.
    const values = viewOf(fold([handshake()]));
    expect(Object.keys(values)).not.toContain("safety-approval-mode");
    expect(Object.keys(values)).not.toContain("safety-sandbox");
    expect(WIRED_ANCHORS as readonly string[]).not.toContain("safety-approval-mode");
  });

  test("잘림 표시가 상태에도 값에도 없다 — 안 그릴 값을 상태에 두지 않았다", () => {
    const truncated: StateSnapshot = {
      ...snapshot([assistant("m-1", "본문")]),
      transcript: { complete: false, omitted: 42, messages: [assistant("m-1", "본문")] },
    } as StateSnapshot;
    const state = fold([effectSignal({ effect: "replace_snapshot", snapshot: truncated })]);
    expect(JSON.stringify(state)).not.toContain("42");
    expect(JSON.stringify(state)).not.toContain("omitted");
  });

  test("전송이 재시도하는 동안 화면에 자국이 없다 — 알파벳에 그 갈래가 아예 없다", () => {
    // §9.6: *"서버가 죽고 브라우저가 다시 붙는 동안 화면은 «연결됨»인 채로 멈춘 것처럼
    // 보인다."* 배선의 입력 알파벳(`WiringSignal`)에 `dropped`가 없다는 것이 그 사실의
    // 구조적 원인이다 — `openStream`이 상실을 화면에 안 알린다.
    const alphabet = executableOf(CLIENT_STREAM);
    expect(alphabet).toContain("onGap");
    expect(HANDLER_NAMES).not.toContain("onDropped");
    // 그래서 «연결됨» 뒤에 어떤 배선 신호로도 «끊길 수 있음»이 안 뜬다는 것이 오늘의 사실이다.
    expect(statusOf([handshake()])).toBe(statusOf([handshake()]));
  });

  test("전송 층이 계약 판정을 **먼저** 한다 (2026-08-31 · §8.1 계약 ⑤ 확정)", () => {
    // **폐기 전 원 축의 이름**: "[미규정] 전송 층이 계약 판정 **전에** 화면 콜백을 부른다" —
    // `receive`가 `handlers.on*`를 먼저 부르고 그 뒤에 수열을 검사하던 것을 기록하며
    // *"§9.6도 §8.1도 이 순서를 정하지 않았다 — 판정 필요."*로 자기 만료 조건을 못박아
    // 두었다. **오늘 그날이다** — §8.1이 계약 ⑤를 세웠고(*"프레임의 내용은 순수 층이 그것을
    // 접수한 뒤에만 화면에 선다."*) §9.6 기각표가 옛 배치를 명시로 기각했다
    // (*"화면 콜백을 부른 뒤에 수열을 검사한다 (오늘의 배치)"* 행). 바로 아래 형제 축이
    // `K-329`에 대해 한 것과 같은 처분이다.
    //
    // **부호를 뒤집어 회귀 축으로 살린다.** 폐기하면 이 파일이 그 순서를 다시는 안 재게 되고,
    // 되돌려도 조용해진다. 재는 것은 판정이 급수보다 앞인가 하나다 — 급수가 접수 분기
    // 안에 있는가는 이 축이 아니라 그 성질을 겨눈 별도 파일의 축이 진다.
    const executable = executableOf(CLIENT_STREAM);
    const verdict = executable.indexOf("frameVerdict(");
    const dispatch = executable.indexOf("handlers.onEvent");
    expect(verdict, "`receive`의 판정 호출을 못 찾았다").toBeGreaterThan(0);
    expect(dispatch, "`receive`의 콜백 급수를 못 찾았다").toBeGreaterThan(0);
    expect(verdict, "판정이 급수보다 앞이어야 한다 — §8.1 계약 ⑤").toBeLessThan(dispatch);
  });

  test("잠금이 사용자에게 주는 자국이 회색이 된 빈 버튼이 아니다 (2026-08-29 · `K-329` 닫힘)", () => {
    // **폐기 전 원 축의 이름**: "[미규정] 잠금이 사용자에게 주는 자국이 회색이 된 빈 버튼 하나다" —
    // 스스로 "이 축이 붉는 날은 `K-329`가 닫힌 날이다"로 자기 만료를 못박아 두었다. 오늘
    // 그날이다 — `K-329`(재생성 사이클)가 컨트롤 셋의 문면을 화면 몫으로 채웠다
    // (`WEB-UI.md` §9.4 결정 11의 2026-08-27 확정 문장 · §9.6 결정 2). 판정 필요였던 물음
    // ("빈 버튼 하나가 결정 5의 목적을 채우는가")은 전제가 없어져 더는 성립하지 않는다.
    // **판정 축의 정본은 여기가 아니다** — `qa-20260827-asset-import.independent.test.ts`의
    // "축 3-b — 컨트롤 셋의 문면"이 그 판정을 정본 근거와 함께 든다(승격 여부는 `K-352`).
    // 이 축은 그 사실이 실물에서 계속 참인지만 회귀로 잰다.
    const screen = readRepo("packages/serve/assets/index.html");
    const button = screen.match(/<button[^>]*id="composer-submit"[^>]*>([\s\S]*?)<\/button>/);
    expect(button, "화면에서 제출 버튼을 못 찾았다 — 이 축의 입력 가정이 깨졌다").not.toBeNull();
    expect((button?.[1] ?? "").trim()).not.toBe("");
  });

  test("판정 완료 — 계약 밖: 레이블이 좁고 요청 결과가 그 자리에 선다 (§9.6 결정 6 U-4, 2026-09-02)", () => {
    // **폐기 전 원 축의 이름**: "[미규정] `connection-status`의 접근 가능한 이름이 「connection」인데
    // 요청 결과가 그 자리에 선다" — 결정 6이 그 자리의 뜻을 *"«세션이 지금 무엇을 하고
    // 있는가»로 넓힌다"*로 개정했는데 화면의 레이블은 좁은 쪽 그대로인 것을 올렸고, 어느 절도
    // 그 방향을 안 든다며 판정을 리포트로 넘겼다.
    //
    // **2026-09-02에 판정됐다 — 계약 위반이 아니다.** 결정 6이 U-4 항을 새로 들며
    // *"정적 레이블("Link" 등)의 문면은 이 결정이 안 잰다"*로 닫았다: §9.4 결정 11이
    // *"컨트롤의 레이블처럼 문면이 정적인 자리는 여기 들지 않는다"*로 이미 그 층을 갈랐고,
    // 결정 6이 요구하는 것은 이 자리가 나르는 **동적** 문면의 성질뿐이다. 그 어긋남은
    // *"계약 위반이 아니라 화면(프롬프트) 층의 표현 선택"*이고 *"정정할 계약이 없어 이 관측은
    // 여기서 닫는다"*.
    //
    // **동작이 안 바뀌므로 단정은 그대로 둔다** — 라벨만 현행화했다. 다음이 이 축의
    // `[미규정]`을 근거로 U-4를 다시 열지 않게 하는 것이 이 갱신의 전부다. 재는 것은 그
    // 배치가 오늘도 참인가 하나다(레이블이 실재하고, 그 아래에 요청 결과가 선다).
    const screen = readRepo("packages/serve/assets/index.html");
    const label = screen.match(/id="connection-status-label"[^>]*>([\s\S]*?)</);
    expect(label, "화면에서 그 자리의 레이블을 못 찾았다").not.toBeNull();
    expect((label?.[1] ?? "").trim().length).toBeGreaterThan(0);
    // 그 레이블 아래에 실제로 요청 결과가 선다는 것이 이 축의 나머지 절반이다.
    expect(
      roundTrip({
        type: "res",
        id: RESPONSE_ID,
        ok: false,
        error: { code: "run_active", message: "이미 돈다" },
      }),
    ).toContain("run_active");
  });
});
