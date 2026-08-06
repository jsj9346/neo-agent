/**
 * 이벤트 렌더링 계약 — `docs/CLI-INTERFACE.md` §7 (표 전체 + 규칙 목록).
 *
 * 렌더러는 이벤트 스트림의 구독자다. 모의 Writable에 이벤트 시퀀스를 주입하고
 * 출력만 본다 — 코어 상태를 폴링하지 않는 구조라야 이 방식으로 검증된다.
 *
 * 검증하는 계약(§7):
 *   - "사용자 메시지는 항상 렌더한다" — 직접 친 프롬프트·steer·**코어의 합성 user
 *     메시지**(턴 한도 grace)가 구분 없이 처리된다. 근거 실측 2가 이 전제를 확인했다
 *   - `text_delta` 도착 즉시 출력 / `thinking_delta`는 시각 구분
 *   - "`stopReason`은 침묵하지 않는다": max_tokens·error(errorMessage)·aborted는 명시,
 *     end_turn/tool_use만 무표시
 *   - `turn_end` usage 한 줄 — 비용 가시성의 소비 지점
 *   - `message_end`(toolResult): `tool_end`로 이미 렌더된 `toolCallId`면 스킵,
 *     `tool_end` 없이 온 합성 짝은 **미실행 사실이 화면에 남아야 한다**
 *   - "렌더러 예외는 삼키지 않는다 — 렌더링이 안 되는데 대화가 계속되는 것 자체가
 *     침묵 실패다"
 */

import { PassThrough } from "node:stream";
import type { AgentEvent, AssistantMessage, ToolResultMessage, UserMessage } from "@neo-agent/core";
import { beforeAll, describe, expect, it } from "vitest";
import { CaptureStream, flush, loadCliModule, pickExport, stripAnsi } from "./harness.ts";

let createRenderer: unknown;
/** 결정된 생성 형태 — support.ts 규약과 같은 이유로 1회만 탐색한다 */
let construct: (out: CaptureStream) => unknown;

const ZERO_USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } as const;

function userMessage(text: string, id = "u-1"): UserMessage {
  return { id, role: "user", content: [{ type: "text", text }], timestamp: 1 };
}

function assistantMessage(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    id: "a-1",
    role: "assistant",
    content: [{ type: "text", text: "ASSISTANT-BODY" }],
    stopReason: "end_turn",
    usage: { ...ZERO_USAGE },
    timestamp: 1,
    ...overrides,
  };
}

function toolResultMessage(toolCallId: string, text: string, isError = false): ToolResultMessage {
  return {
    id: `tr-${toolCallId}`,
    role: "toolResult",
    toolCallId,
    toolName: "shell",
    content: [{ type: "text", text }],
    isError,
    source: "local",
    timestamp: 1,
  };
}

function resolveListener(renderer: unknown): (event: AgentEvent) => unknown {
  if (typeof renderer === "function") {
    return (event) =>
      (renderer as (e: AgentEvent, s: AbortSignal) => unknown)(event, new AbortController().signal);
  }
  for (const key of ["handleEvent", "onEvent", "render", "listener", "handle", "emit", "write"]) {
    const candidate = (renderer as Record<string, unknown> | null)?.[key];
    if (typeof candidate === "function") {
      return (event) =>
        (candidate as (e: AgentEvent, s: AbortSignal) => unknown).call(
          renderer,
          event,
          new AbortController().signal,
        );
    }
  }
  throw new Error(
    `[시그니처 불일치 가능] 렌더러에서 이벤트 리스너를 찾지 못했다 — 반환값: ${typeof renderer}, 키: ${Object.keys((renderer as object) ?? {}).join(", ")}`,
  );
}

interface Harness {
  out: CaptureStream;
  feed: (...events: AgentEvent[]) => Promise<void>;
  /** 마지막 `mark()` 이후의 출력(ANSI 제거) */
  since: () => string;
  mark: () => void;
  text: () => string;
}

function makeRenderer(): Harness {
  const out = new CaptureStream();
  const listener = resolveListener(construct(out));
  let marker = 0;
  return {
    out,
    feed: async (...events) => {
      for (const event of events) await listener(event);
      await flush(2);
    },
    mark: () => {
      marker = out.text.length;
    },
    since: () => stripAnsi(out.text.slice(marker)),
    text: () => stripAnsi(out.text),
  };
}

beforeAll(async () => {
  const module = await loadCliModule("renderer.ts");
  createRenderer = pickExport(
    module,
    ["createRenderer", "createCliRenderer", "makeRenderer"],
    "렌더러 팩토리",
  );

  const styles: { label: string; build: (out: CaptureStream) => unknown }[] = [
    {
      label: "createRenderer(stream)",
      build: (out) => (createRenderer as (o: unknown) => unknown)(out),
    },
    {
      label: "createRenderer({ output })",
      build: (out) => (createRenderer as (o: unknown) => unknown)({ output: out }),
    },
    {
      label: "createRenderer({ out })",
      build: (out) => (createRenderer as (o: unknown) => unknown)({ out }),
    },
    {
      label: "createRenderer({ stream })",
      build: (out) => (createRenderer as (o: unknown) => unknown)({ stream: out }),
    },
    {
      label: "createRenderer({ stdout })",
      build: (out) => (createRenderer as (o: unknown) => unknown)({ stdout: out }),
    },
    {
      // `TerminalIo`(src/terminal.ts) 형태 — 입출력 짝을 통째로 받는 배선
      label: "createRenderer({ input, output })  (TerminalIo)",
      build: (out) =>
        (createRenderer as (o: unknown) => unknown)({ input: new PassThrough(), output: out }),
    },
  ];

  const failures: string[] = [];
  for (const style of styles) {
    try {
      const probe = new CaptureStream();
      const renderer = style.build(probe);
      resolveListener(renderer);
      construct = style.build as (out: CaptureStream) => unknown;
      return;
    } catch (error) {
      failures.push(`${style.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(
    `[시그니처 불일치 가능] createRenderer의 호출 형태를 찾지 못했다.\n${failures.join("\n")}`,
  );
});

describe("렌더러 — 사용자 메시지 (CLI-INTERFACE §7)", () => {
  it("사용자가 친 프롬프트의 message_start를 렌더한다", async () => {
    const harness = makeRenderer();
    await harness.feed({ type: "message_start", message: userMessage("USER-TYPED-INPUT") });
    expect(harness.text()).toContain("USER-TYPED-INPUT");
  });

  it("코어가 주입한 합성 user 메시지도 똑같이 렌더한다", async () => {
    // 근거: §7 "이 규칙 하나로 세 경우가 구분 없이 처리된다 — 직접 친 프롬프트,
    //       steer 주입, 그리고 코어가 주입하는 합성 user 메시지(턴 한도 grace).
    //       렌더러가 '내가 만든 메시지'를 추적해 스킵하는 설계는 합성 메시지를 놓친다"
    // 근거 실측 2가 이 메시지가 실제로 message_start로 온다는 것을 확인했다.
    const synthetic = userMessage(
      "Turn limit reached: this run has used its budget of 2 turns. Do not call any more tools.",
      "u-synthetic",
    );
    const harness = makeRenderer();
    await harness.feed({ type: "message_start", message: synthetic });
    expect(harness.text()).toContain("Turn limit reached");
  });
});

describe("렌더러 — 스트리밍 (CLI-INTERFACE §7)", () => {
  it("text_delta는 message_end를 기다리지 않고 즉시 출력된다", async () => {
    // 근거: §7 "message_update | text_delta 도착 즉시 출력(스트리밍)"
    const draft = assistantMessage({ content: [] });
    const harness = makeRenderer();
    await harness.feed(
      { type: "message_start", message: draft },
      {
        type: "message_update",
        message: assistantMessage({ content: [{ type: "text", text: "DELTA-CHUNK" }] }),
        delta: { type: "text_delta", text: "DELTA-CHUNK" },
      },
    );
    // message_end 전에 이미 보여야 한다 — 이것이 스트리밍의 정의다
    expect(harness.text()).toContain("DELTA-CHUNK");
  });

  it("thinking_delta는 text_delta와 시각적으로 구분된다", async () => {
    // 근거: §7 "thinking_delta는 시각 구분(dim)해 표시"
    // 구현 수단(dim·접두어·색)은 세부이므로, **같은 문자열이 다른 출력을 낳는가**로 본다.
    const payload = "SAME-PAYLOAD-TEXT";

    const textHarness = makeRenderer();
    await textHarness.feed(
      { type: "message_start", message: assistantMessage({ content: [] }) },
      {
        type: "message_update",
        message: assistantMessage({ content: [{ type: "text", text: payload }] }),
        delta: { type: "text_delta", text: payload },
      },
    );

    const thinkingHarness = makeRenderer();
    await thinkingHarness.feed(
      { type: "message_start", message: assistantMessage({ content: [] }) },
      {
        type: "message_update",
        message: assistantMessage({ content: [{ type: "thinking", text: payload }] }),
        delta: { type: "thinking_delta", text: payload },
      },
    );

    // 원문(ANSI 포함)이 달라야 한다 — 구분이 색으로만 이뤄져도 통과한다
    expect(thinkingHarness.out.text).not.toBe(textHarness.out.text);
  });
});

describe("렌더러 — stopReason은 침묵하지 않는다 (CLI-INTERFACE §7)", () => {
  async function renderStop(message: AssistantMessage): Promise<string> {
    const harness = makeRenderer();
    await harness.feed(
      { type: "message_start", message: assistantMessage({ content: [] }) },
      { type: "message_end", message },
    );
    return harness.text();
  }

  it("end_turn은 무표시가 정상이다 (기준선)", async () => {
    const output = await renderStop(assistantMessage({ stopReason: "end_turn" }));
    expect(output).toContain("ASSISTANT-BODY");
  });

  it("tool_use도 무표시다 — end_turn과 같은 출력", async () => {
    // 근거: §7 "end_turn/tool_use만 무표시 정상이다"
    const endTurn = await renderStop(assistantMessage({ stopReason: "end_turn" }));
    const toolUse = await renderStop(assistantMessage({ stopReason: "tool_use" }));
    expect(toolUse).toBe(endTurn);
  });

  it("max_tokens는 길이 한도로 잘렸음을 명시한다", async () => {
    // 근거: §7 "max_tokens → 응답이 길이 한도로 잘렸음을 명시"
    const endTurn = await renderStop(assistantMessage({ stopReason: "end_turn" }));
    const truncated = await renderStop(assistantMessage({ stopReason: "max_tokens" }));
    expect(truncated).not.toBe(endTurn);
    expect(truncated.length).toBeGreaterThan(endTurn.length);
  });

  it("error는 errorMessage를 표시한다", async () => {
    // 근거: §7 "error → errorMessage 표시"
    //       CORE-INTERFACE §2 "errorMessage ... 침묵 실패 금지"
    const output = await renderStop(
      assistantMessage({
        stopReason: "error",
        errorMessage: "UNIQUE-ERROR-DETAIL-429",
      }),
    );
    expect(output).toContain("UNIQUE-ERROR-DETAIL-429");
  });

  it("aborted는 중단을 표시한다", async () => {
    // 근거: §7 "aborted → 중단 표시"
    const endTurn = await renderStop(assistantMessage({ stopReason: "end_turn" }));
    const aborted = await renderStop(
      assistantMessage({ stopReason: "aborted", errorMessage: "The run was aborted." }),
    );
    expect(aborted).not.toBe(endTurn);
  });
});

describe("렌더러 — turn_end usage (CLI-INTERFACE §7)", () => {
  it("usage 네 값이 한 줄로 표시된다", async () => {
    // 근거: §7 "turn_end | usage 한 줄(input/output/cacheRead/cacheWrite, dim) —
    //       **비용 가시성의 소비 지점**(CORE-INTERFACE §2 'usage는 옵션이 아니다'가
    //       화면에 닿는 곳)"
    const harness = makeRenderer();
    harness.mark();
    await harness.feed({
      type: "turn_end",
      message: assistantMessage({
        content: [],
        usage: { input: 1234, output: 5678, cacheRead: 9012, cacheWrite: 3456 },
      }),
      toolResults: [],
    });
    const line = harness.since();
    for (const value of ["1234", "5678", "9012", "3456"]) {
      expect(line, `usage에 ${value}가 없다 — 비용이 보이지 않는다`).toContain(value);
    }
    expect(line.trim().split("\n"), "usage는 한 줄이다").toHaveLength(1);
  });
});

describe("렌더러 — toolResult message_end의 두 갈래 (CLI-INTERFACE §7)", () => {
  it("tool_end로 이미 렌더된 toolCallId의 toolResult는 스킵한다", async () => {
    // 근거: §7 "message_end(toolResult) | tool_end로 이미 렌더된 toolCallId면 스킵"
    //       상관 판정은 toolCallId로 한다(같은 절)
    const harness = makeRenderer();
    await harness.feed(
      { type: "tool_start", toolCallId: "call-1", toolName: "shell", args: { command: "ls" } },
      {
        type: "tool_end",
        toolCallId: "call-1",
        toolName: "shell",
        result: { content: [{ type: "text", text: "TOOL-END-OUTPUT" }], source: "local" },
        isError: false,
      },
    );
    harness.mark();
    await harness.feed(
      { type: "message_start", message: toolResultMessage("call-1", "DUPLICATE-RENDER-MARKER") },
      { type: "message_end", message: toolResultMessage("call-1", "DUPLICATE-RENDER-MARKER") },
    );
    expect(harness.since().trim(), "이미 렌더된 도구 결과가 두 번 그려졌다").toBe("");
  });

  it("tool 이벤트 없이 온 toolResult(합성 짝)는 미실행 사실을 화면에 남긴다", async () => {
    // 근거: §7 "tool_end 없이 온 것(비정상 종료의 합성 짝, CORE-INTERFACE §5)은
    //       여기서 표시 — **미실행 사실이 화면에 남아야 한다**"
    // 근거 실측 3이 이 이벤트가 tool 이벤트 없이 실제로 온다는 것을 확인했다.
    const synthetic = toolResultMessage(
      "call-orphan",
      'Tool "shell" was not executed: the run reached its turn limit.',
      true,
    );
    const harness = makeRenderer();
    harness.mark();
    await harness.feed(
      { type: "message_start", message: synthetic },
      { type: "message_end", message: synthetic },
    );
    const output = harness.since();
    expect(output.trim(), "합성 짝이 화면에 남지 않았다 — 미실행 사실이 사라진다").not.toBe("");
    expect(output).toContain("was not executed");
  });
});

describe("렌더러 — 예외 비삼킴 (CLI-INTERFACE §7)", () => {
  it("출력 실패를 삼키지 않는다", async () => {
    // 근거: §7 "렌더러 예외는 삼키지 않는다 — 코어 계약(§3)대로 런을 실패시킨다.
    //       렌더링이 안 되는데 대화가 계속되는 것 자체가 침묵 실패다"
    const out = new CaptureStream();
    const listener = resolveListener(construct(out));
    out.breakWrites();

    // async 래퍼로 감싸 동기 throw와 reject를 같은 방식으로 관찰한다
    await expect(
      (async () => listener({ type: "message_start", message: userMessage("WILL-FAIL") }))(),
    ).rejects.toBeDefined();
  });
});
