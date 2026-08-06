/**
 * QA-A (T-010) — `createUserMessage` 공개 표면의 계약 검증. (T-002)
 *
 * **기대값은 구현이 아니라 계약 문서에서만 도출했다.** 구현이 문서와 다르면 이 파일은
 * 문서 편에 선다.
 *
 *   - `docs/CORE-INTERFACE.md` §2  — `createUserMessage(input): UserMessage` 공개.
 *                                    "세션 밖에서 만들어지는 합성 메시지(압축 요약)의
 *                                    id·timestamp 발급을 코어 하나로 유지하는 수단",
 *                                    "`Agent` 내부의 발급도 같은 함수를 지난다(발급 지점 단일)",
 *                                    id 형식은 `crypto.randomUUID()`,
 *                                    "코어는 입력 객체의 id·timestamp를 읽지 않는다"
 *   - `docs/CORE-INTERFACE.md` §4  — `UserMessageInput = Omit<UserMessage,"id"|"timestamp">`
 *   - `docs/CORE-INTERFACE.md` §9  — 불변 조건 8(트랜스크립트 id 유일성)
 *   - `docs/COMPACTION.md`     §6  — 요약 메시지 생성이 이 함수의 실제 소비 지점
 *
 * 판정 기준: **원인 쪽이 미규정이어도 문서가 금지한 결과가 나오면 위반이다.**
 */

import { describe, expect, test } from "vitest";
import {
  Agent,
  type AgentMessage,
  createUserMessage,
  type ModelClient,
  type ModelRequest,
  type ModelStreamEvent,
  type UserMessage,
  type UserMessageInput,
} from "../src/index.ts";

/** `crypto.randomUUID()` 산출 형식 — §2 · SESSION-STORE §3이 못박은 형식 */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function textInput(text: string): UserMessageInput {
  return { role: "user", content: [{ type: "text", text }] };
}

// ---------------------------------------------------------------------------
// 타입 수준 검증 — 실행하지 않는다. 판정자는 `tsc --noEmit`.
// ---------------------------------------------------------------------------

function typeLevelSurface(): void {
  // §2 — 반환은 완전한 `UserMessage`다. id·timestamp가 옵셔널이면 여기서 깨진다.
  const message: UserMessage = createUserMessage(textInput("안녕"));
  const id: string = message.id;
  const timestamp: number = message.timestamp;
  void id;
  void timestamp;

  // §4 — 입력 경계는 `UserMessageInput`이다. 호출자는 id·timestamp를 모른다.
  // @ts-expect-error §4 — 호출자는 id를 실을 수 없다. 발급자는 코어 하나다(§2)
  createUserMessage({ role: "user", content: [{ type: "text", text: "x" }], id: "caller" });
  // @ts-expect-error §4 — 호출자는 timestamp를 실을 수 없다
  createUserMessage({ role: "user", content: [{ type: "text", text: "x" }], timestamp: 1 });
  // @ts-expect-error §2 — UserMessage.content는 텍스트·이미지만. thinking은 어시스턴트 전용이다
  createUserMessage({ role: "user", content: [{ type: "thinking", text: "x" }] });
  // @ts-expect-error §2 — role은 "user" 리터럴이다
  createUserMessage({ role: "assistant", content: [{ type: "text", text: "x" }] });
}
void typeLevelSurface;

// ---------------------------------------------------------------------------
// 1. id 발급 — UUID 형식, 매 호출 신규
//    §2 · 불변 조건 8
// ---------------------------------------------------------------------------

describe("id 발급 (§2 · 불변 조건 8)", () => {
  test("id가 crypto.randomUUID() 형식이다", () => {
    expect(createUserMessage(textInput("안녕")).id).toMatch(UUID_V4);
  });

  test("매 호출마다 새 id를 발급한다 — 같은 입력이어도", () => {
    // 같은 입력에 같은 id를 주면 압축 요약 메시지가 세션 간 충돌한다.
    // 저장소의 `INSERT OR IGNORE`(SESSION-STORE §3) 아래에서는 두 번째가 조용히 사라진다.
    const input = textInput("같은 내용");
    const ids = new Set<string>();
    for (let i = 0; i < 1_000; i += 1) {
      const message = createUserMessage(input);
      expect(message.id).toMatch(UUID_V4);
      ids.add(message.id);
    }
    expect(ids.size).toBe(1_000);
  });

  test("입력 객체를 재사용해도 입력이 오염되지 않는다", () => {
    // 발급 값을 입력 객체에 써 넣으면 두 번째 호출이 첫 번째 id를 물려받는다.
    const input = textInput("재사용");
    const first = createUserMessage(input);
    const second = createUserMessage(input);

    expect(first.id).not.toBe(second.id);
    expect(Object.hasOwn(input, "id")).toBe(false);
    expect(Object.hasOwn(input, "timestamp")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. timestamp 발급
//    §2 — id와 같은 자리에서 코어가 채운다
// ---------------------------------------------------------------------------

describe("timestamp 발급 (§2)", () => {
  test("timestamp가 발급되고 현재 시각 범위 안이다", () => {
    const before = Date.now();
    const message = createUserMessage(textInput("안녕"));
    const after = Date.now();

    expect(typeof message.timestamp).toBe("number");
    expect(Number.isFinite(message.timestamp)).toBe(true);
    expect(message.timestamp).toBeGreaterThanOrEqual(before);
    expect(message.timestamp).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// 3. 입력 경계 — 코어는 입력 객체의 id·timestamp를 읽지 않는다
//    §2 (2026-08-06 QA 명문화): "타입을 우회해 실어 보내도 코어가 발급한 값만 남는다.
//    throw 대안은 기각"
// ---------------------------------------------------------------------------

describe("입력 경계 — 실어 보낸 id·timestamp는 무시된다 (§2 · §4)", () => {
  test("타입을 우회해 실은 id·timestamp가 반영되지 않는다", () => {
    const forged = {
      role: "user",
      content: [{ type: "text", text: "안녕" }],
      id: "caller-forged-id",
      timestamp: 111,
    } as unknown as UserMessageInput;

    const before = Date.now();
    const message = createUserMessage(forged);

    // §2는 throw 대안을 **명시적으로 기각**했다 — 덮어쓰기가 확정된 동작이다.
    expect(message.id).not.toBe("caller-forged-id");
    expect(message.id).toMatch(UUID_V4);
    expect(message.timestamp).not.toBe(111);
    expect(message.timestamp).toBeGreaterThanOrEqual(before);
  });

  test("role과 content는 입력 그대로 보존된다", () => {
    const content: UserMessageInput["content"] = [
      { type: "text", text: "요약 본문" },
      { type: "image", mimeType: "image/png", data: "aGVsbG8=" },
    ];
    const message = createUserMessage({ role: "user", content });

    expect(message.role).toBe("user");
    expect(message.content).toEqual(content);
  });

  test("발급 값은 스키마 검증을 통과한다 — 저장소가 그대로 쓸 수 있어야 한다", async () => {
    // 압축 요약 메시지는 `branchSession`으로 곧장 영속화된다(COMPACTION §6).
    // 코어가 공개한 Zod 스키마(§2)를 통과하지 못하면 저장 경로에서 깨진다.
    const { userMessageSchema, agentMessageSchema } = await import("../src/index.ts");
    const message = createUserMessage(textInput("요약"));

    expect(userMessageSchema.safeParse(message).success).toBe(true);
    expect(agentMessageSchema.safeParse(message).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. 발급 지점 단일 — Agent 내부 발급과 같은 규칙인가
//    §2: "`Agent` 내부의 발급도 같은 함수를 지난다(발급 지점 단일)"
// ---------------------------------------------------------------------------

class SilentModelClient implements ModelClient {
  readonly modelId = "qa-a/create-user-message";
  async *stream(_request: ModelRequest, _signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
    yield {
      type: "done",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "응" }],
        stopReason: "end_turn",
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
        timestamp: Date.now(),
      },
    };
  }
}

describe("발급 지점 단일 (§2)", () => {
  test("createUserMessage와 Agent 내부 발급이 같은 id 형식을 낸다", async () => {
    const agent = new Agent({
      session: { systemPrompt: "테스트", tools: [] },
      modelClient: new SilentModelClient(),
    });

    await agent.prompt("안녕");
    await agent.waitForIdle();

    const fromAgent = agent.state.messages.find((message) => message.role === "user");
    const fromFactory = createUserMessage(textInput("안녕"));

    expect(fromAgent?.id).toMatch(UUID_V4);
    expect(fromFactory.id).toMatch(UUID_V4);
    // 두 경로가 다른 형식을 쓰면 "발급 지점 단일"이 코드 배치가 아니라 문서 규약으로 격하된다.
    expect(fromAgent?.id).not.toBe(fromFactory.id);
  });

  test("발급된 요약 메시지를 새 세션 트랜스크립트로 실을 수 있다 (COMPACTION §6)", async () => {
    // 분기의 실제 형태: [요약, ...kept]로 새 Agent를 만든다. 생성자의 중복 id fail-fast(§4)를
    // 통과해야 하고, 트랜스크립트 머리에 앉아야 한다.
    const summary = createUserMessage(textInput("이전 대화 요약"));
    const kept: AgentMessage[] = [
      { id: "kept-user-1", role: "user", content: [{ type: "text", text: "유지" }], timestamp: 1 },
      {
        id: "kept-assistant-1",
        role: "assistant",
        content: [{ type: "text", text: "유지 답" }],
        stopReason: "end_turn",
        usage: { input: 5, output: 5, cacheRead: 0, cacheWrite: 0 },
        timestamp: 2,
      },
    ];

    const agent = new Agent({
      session: { systemPrompt: "테스트", tools: [], messages: [summary, ...kept] },
      modelClient: new SilentModelClient(),
    });

    expect(agent.state.messages.map((message) => message.id)).toEqual([
      summary.id,
      "kept-user-1",
      "kept-assistant-1",
    ]);
    expect(agent.state.messages[0]?.role).toBe("user");
  });
});
