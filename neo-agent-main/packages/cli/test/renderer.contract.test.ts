/**
 * 렌더링 계약 — `docs/CLI-INTERFACE.md` **§7**(라이브 이벤트) + **§6**(재개 트랜스크립트).
 *
 * 렌더러는 이벤트 스트림의 구독자다. 모의 Writable에 이벤트 시퀀스를 주입하고
 * 출력만 본다 — 코어 상태를 폴링하지 않는 구조라야 이 방식으로 검증된다.
 *
 * **두 축이 한 파일에 있는 것은 §6 판정의 귀결이다** — 라이브와 재개는 같은 모듈이
 * 소유한다(2026-08-11, W-4/I-2 해소). 둘이 갈리는 지점(도구 결과 표기)이 계약이므로
 * 그 대비를 한 파일에서 볼 수 있어야 한다.
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
 *
 * 검증하는 계약(§6):
 *   - 재개 트랜스크립트는 도구 결과를 **"실행되지 않음"으로 그리지 않는다** — 같은
 *     입력에 라이브 경로는 그 표시를 낸다는 대비까지 함께 잰다
 *   - 재개 경로의 실패 판정 근거는 **`isError`뿐**이다
 *   - "어디까지 진행된 세션인지"가 화면에 닿는다. **표시 범위 수치는 세부**이므로
 *     단언하지 않는다(W-3/I-1 판정 유지)
 *   - 과거 대화를 그리는 표면을 **`renderer.ts`가 소유하고** **배럴에 노출된다**
 *     (§1의 소속 기준). 두 절반을 따로 잰다 — 노출만 재면 조립 소유안(§6이 명시적으로
 *     기각한 배치)으로 옮겨도 통과한다
 */

import { PassThrough } from "node:stream";
import type {
  AgentEvent,
  AgentMessage,
  AssistantMessage,
  ToolResultMessage,
  UserMessage,
} from "@neo-agent/core";
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

/**
 * 재개 트랜스크립트 렌더러 — **배럴 경유로 로드한다.**
 *
 * §6이 *"`renderer.ts`가 소유하고 배럴에 노출된다"*를 계약으로 적었으므로 이 경로
 * 자체가 검증 대상이다. `../src/renderer.ts`를 직접 임포트하면 배럴이 비어도
 * 아래 테스트가 전부 통과해 그 계약을 놓친다.
 */
let barrel: Record<string, unknown>;
let renderTranscript: (
  out: CaptureStream,
  messages: readonly AgentMessage[],
  options?: { limit?: number },
) => void;

/** 소유 모듈. §6의 앞절반("`renderer.ts`가 소유하고")을 재는 쪽이다 */
let rendererModule: Record<string, unknown>;

beforeAll(async () => {
  barrel = await loadCliModule("index.ts");
  rendererModule = await loadCliModule("renderer.ts");
  renderTranscript = pickExport(barrel, ["renderTranscript"], "재개 트랜스크립트 렌더러");
});

/** 도구를 한 번 부르고 결과를 받은 과거 대화 — 재개 화면의 최소 재료 */
function pastConversation(isError = false): AgentMessage[] {
  return [
    userMessage("PAST-USER-TURN"),
    assistantMessage({
      content: [
        { type: "text", text: "PAST-ASSISTANT-TURN" },
        { type: "toolCall", toolCallId: "call-past", toolName: "shell", args: { cmd: "ls" } },
      ],
    }),
    toolResultMessage("call-past", "PAST-TOOL-OUTPUT", isError),
  ];
}

describe("재개 트랜스크립트 — 도구 결과 표기 (CLI-INTERFACE §6)", () => {
  it("도구 결과를 '실행되지 않음'으로 그리지 않는다", () => {
    // 근거: §6 "재개 트랜스크립트는 도구 결과를 '실행되지 않음'으로 그리지 않는다.
    //       그 표시는 'tool_end 없이 온 결과 = 비정상 종료의 합성 짝'이라는 §7
    //       판정에서 나오는데, 과거 트랜스크립트에는 애초에 도구 이벤트가 없으므로
    //       같은 규칙을 적용하면 실제로 실행됐던 도구가 전부 미실행으로 보인다"
    const out = new CaptureStream();
    renderTranscript(out, pastConversation());
    const text = stripAnsi(out.text);

    expect(
      text,
      "재개 화면이 실행됐던 도구를 미실행으로 보고했다 — 없던 실패를 지어낸다",
    ).not.toContain("실행되지 않음");
    expect(text).toContain("PAST-TOOL-OUTPUT");
  });

  it("같은 결과를 라이브 경로는 '실행되지 않음'으로 그린다 — 의도된 차이", async () => {
    // §6이 "일부러 다르게 처리한다"고 못박은 차이의 반대쪽. 두 경로가 같은 입력에
    // 다르게 반응한다는 것을 한 파일에서 볼 수 없으면, 라이브 규칙을 재개 경로에
    // 복사하는 리팩터가 위 테스트만 깨고 이유는 남기지 않는다.
    const orphan = toolResultMessage("call-past", "PAST-TOOL-OUTPUT");
    const harness = makeRenderer();
    harness.mark();
    await harness.feed(
      { type: "message_start", message: orphan },
      { type: "message_end", message: orphan },
    );
    expect(harness.since()).toContain("실행되지 않음");
  });

  it("재개 경로의 실패 판정 근거는 isError뿐이다", () => {
    // 근거: §6 "재개 경로의 실패 판정 근거는 `isError`뿐이다"
    const failed = new CaptureStream();
    renderTranscript(failed, pastConversation(true));
    expect(stripAnsi(failed.text)).toContain("실패");

    const ok = new CaptureStream();
    renderTranscript(ok, pastConversation(false));
    const okText = stripAnsi(ok.text);
    expect(okText).not.toContain("실패");
    expect(okText).toContain("완료");
  });

  it("어디까지 진행된 세션인지가 화면에 닿는다", () => {
    // 근거: §6 "재개 직후 '어디까지 진행된 세션인지'가 화면에 보여야 한다는 것이
    //       계약"(§2.6). 표시 **범위**(마지막 몇 턴)는 세부이므로 단언하지 않는다 —
    //       W-3/I-1 판정 유지. 여기서 재는 것은 "빈 화면이 아니다"까지다.
    const out = new CaptureStream();
    renderTranscript(out, pastConversation());
    const text = stripAnsi(out.text);

    expect(text).toContain("PAST-USER-TURN");
    expect(text).toContain("PAST-ASSISTANT-TURN");
  });
});

describe("재개 트랜스크립트 — 소유와 노출 (CLI-INTERFACE §1·§6)", () => {
  it("두 표면을 `renderer.ts`가 소유한다", () => {
    // 근거: §6 "과거 대화를 그리는 표면은 **renderer.ts가 소유하고** 배럴에 노출된다.
    //       라이브 이벤트 렌더러와 재개 트랜스크립트 렌더러는 같은 모듈이어야 한다 —
    //       한쪽만 바뀌면 같은 대화가 재개 전후로 다르게 보인다."
    //
    // 노출만 재면 이 계약의 앞절반이 비는다: `renderTranscript`를 `wiring.ts`로 옮기고
    // 배럴에서 재수출해도 — §6이 조립 소유안을 **명시적으로 기각**했는데도 — 아래
    // 노출 단언은 그대로 통과한다. 그래서 소유 모듈을 따로 짚는다.
    expect(typeof rendererModule.createRenderer).toBe("function");
    expect(typeof rendererModule.renderTranscript).toBe("function");

    // 배럴이 그 모듈의 것을 그대로 내보내는가 — 재구현·래핑이 아니라 재수출이어야
    // 두 경로가 영영 같은 함수다.
    expect(barrel.renderTranscript).toBe(rendererModule.renderTranscript);
    expect(barrel.createRenderer).toBe(rendererModule.createRenderer);
  });

  it("라이브와 재개의 두 표면이 배럴에서 함께 나온다", () => {
    // 근거: §6 "과거 대화를 그리는 표면은 renderer.ts가 소유하고 **배럴에 노출된다**".
    // 5일간 거짓 판정(W-4/I-2)이 살아남은 원인이 "배럴 상태를 아무도 보지 않는다"였다.
    //
    // **전체 목록을 세지 않는다** — §1의 소속 기준은 목록이 아니라 규칙이므로
    // 목록을 박으면 정당한 추가가 매번 이 테스트의 수정을 부른다. 부분집합에서 멈춘다.
    expect(typeof barrel.createRenderer).toBe("function");
    expect(typeof barrel.renderTranscript).toBe("function");
  });
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
