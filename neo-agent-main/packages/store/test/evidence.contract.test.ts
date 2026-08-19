/**
 * SESSION-STORE가 근거로 든 실측 가능한 문장 3건의 독립 검증 (QA-B).
 *
 * 이 파일은 저장소 **구현**을 검증하지 않는다. `docs/SESSION-STORE.md`가 설계
 * 판단의 근거로 제시한 세 문장이 **실제로 참인지**를 코어·tools 코드의 실행으로
 * 확인한다. 근거가 거짓이면 그 위에 세운 설계 결정이 무너지므로, 구현 검증보다
 * 먼저 온다.
 *
 *   근거 1 — "스트리밍 초안의 stopReason·usage는 자리표시자다"  (§3 · §4 초안 저장 배제)
 *   근거 2 — "재개 시 과거 메시지는 이벤트로 재방출되지 않는다"   (§4 멱등의 전제)
 *   근거 3 — "`~/.neo-agent/**` denylist가 세션 DB를 덮는다"      (§6 자기접근 차단)
 *
 * 셋 다 저장소 API에 의존하지 않으므로 구현 진척과 무관하게 지금 판정 가능하다.
 * 임포트가 `@neo-agent/store`를 거치지 않는 유일한 파일이다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Agent,
  type AgentEvent,
  type AgentMessage,
  type AssistantMessage,
  type ToolExecutionContext,
} from "@neo-agent/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// store의 의존성 예산에 `@neo-agent/tools`가 없다(SESSION-STORE §1). 근거 3은 tools의
// 판정기를 실측해야 하므로 테스트에서만 상대 경로로 가져온다 — src는 건드리지 않는다.
import { createReadFileTool, createWorkspaceBoundary } from "../../tools/src/index.ts";
import { eventsOfType, recordEvents, ScriptedModel } from "./contract-harness.ts";

const ZERO_USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

// ---------------------------------------------------------------------------
// 근거 1 — 스트리밍 초안의 stopReason·usage는 미확정 자리표시자다
// ---------------------------------------------------------------------------

describe("근거 1 — 초안의 stopReason·usage는 자리표시자다 (SESSION-STORE §3)", () => {
  /**
   * §3의 문장: "스트리밍 초안의 stopReason·usage는 미확정 자리표시자다(loop.ts의
   * draft). 그것을 저장하면 **거짓 기록**이 남는다."
   *
   * 이 테스트가 실패하면 초안 저장 배제(§4)의 근거가 사라진다 — 초안이 확정값을
   * 싣는다면 "start에 행 만들고 end에 갱신"을 기각할 이유가 없어진다.
   */
  it("도구 호출 응답: 초안은 end_turn·usage 0인데 최종은 tool_use·실제 usage다", async () => {
    const model = new ScriptedModel([
      {
        text: "파일을 읽겠습니다",
        toolCalls: [{ toolCallId: "call-1", toolName: "noop", args: {} }],
        usage: { input: 1234, output: 56, cacheRead: 7, cacheWrite: 8 },
      },
      { text: "끝", usage: { input: 10, output: 2, cacheRead: 0, cacheWrite: 0 } },
    ]);

    const { events, listener } = recordEvents();
    const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });
    agent.subscribe(listener);
    await agent.prompt("읽어줘");
    await agent.waitForIdle();

    const drafts = eventsOfType(events, "message_start")
      .map((event) => event.message)
      .filter((message): message is AssistantMessage => message.role === "assistant");
    const finals = eventsOfType(events, "message_end")
      .map((event) => event.message)
      .filter((message): message is AssistantMessage => message.role === "assistant");

    expect(drafts.length).toBeGreaterThan(0);
    const draft = drafts[0] as AssistantMessage;
    const final = finals[0] as AssistantMessage;

    // 자리표시자의 실체 — 이 두 줄이 §3·§4 전체의 근거다
    expect(draft.stopReason).toBe("end_turn");
    expect(draft.usage).toEqual(ZERO_USAGE);

    // 최종은 다른 값이다 → 초안을 저장하면 거짓 기록이 된다
    expect(final.stopReason).toBe("tool_use");
    expect(final.usage).toEqual({ input: 1234, output: 56, cacheRead: 7, cacheWrite: 8 });
    expect(final.stopReason).not.toBe(draft.stopReason);
  });

  /**
   * §3이 명시한 최악의 형태 그대로: 실패한 턴의 초안이 `end_turn`을 달고 있어
   * "재개 시 정상 종료된 턴으로 보인다".
   */
  it("실패 응답: 초안은 end_turn이라 정상 종료된 턴으로 위장된다", async () => {
    const model = new ScriptedModel([
      { text: "부분 출력", stopReason: "error", errorMessage: "upstream 500" },
    ]);

    const { events, listener } = recordEvents();
    const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });
    agent.subscribe(listener);
    await agent.prompt("해줘");
    await agent.waitForIdle();

    const draft = eventsOfType(events, "message_start")
      .map((event) => event.message)
      .find((message): message is AssistantMessage => message.role === "assistant");
    const final = eventsOfType(events, "message_end")
      .map((event) => event.message)
      .find((message): message is AssistantMessage => message.role === "assistant");

    expect(draft?.stopReason).toBe("end_turn");
    expect(draft?.errorMessage).toBeUndefined();
    expect(final?.stopReason).toBe("error");
    expect(final?.errorMessage).toBe("upstream 500");
  });

  /**
   * `message_start`(초안)와 `message_end`(최종)는 **서로 다른 객체**다. 초안은
   * 트랜스크립트에도 들어가지 않는다 — 저장소가 초안을 볼 수 있는 유일한 창은
   * `message_start` 구독뿐이라는 뜻이고, 그것을 구독하지 않는 것이 §4의 계약이다.
   */
  it("초안 객체는 트랜스크립트에 남지 않는다 — 최종만 state.messages에 들어간다", async () => {
    const model = new ScriptedModel([{ text: "응답", usage: { input: 5, output: 3 } }]);

    const { events, listener } = recordEvents();
    const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });
    agent.subscribe(listener);
    await agent.prompt("안녕");
    await agent.waitForIdle();

    const draft = eventsOfType(events, "message_start")
      .map((event) => event.message)
      .find((message): message is AssistantMessage => message.role === "assistant");
    const stored = agent.state.messages.filter((message) => message.role === "assistant");

    expect(stored).toHaveLength(1);
    // 참조 동일성이 아니라는 것 — 초안은 버려진다
    expect(stored[0]).not.toBe(draft);
    expect(stored[0]?.usage).toEqual({ ...ZERO_USAGE, input: 5, output: 3 });
  });

  /**
   * §3의 두 번째 갈래: "`AgentMessage.id`를 필수 필드로 넣는다 … 스트리밍 초안과
   * 최종 메시지는 같은 id를 갖는다."
   *
   * CORE-INTERFACE §2·불변 조건 8도 같은 것을 요구한다. 현재 구현은 id를 발급하지
   * 않으므로 이 테스트는 실패한다 — 문서가 스스로 "계약-구현 격차"로 기록한 지점이고
   * (CORE-INTERFACE §11), 저장소의 `INSERT OR IGNORE` 멱등(§4)이 통째로 이 필드에
   * 얹혀 있으므로 저장소 구현의 **선행 조건**이다.
   */
  it("초안과 최종 어시스턴트 메시지는 같은 id를 갖는다 (불변 조건 8)", async () => {
    const model = new ScriptedModel([{ text: "응답" }]);

    const { events, listener } = recordEvents();
    const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });
    agent.subscribe(listener);
    await agent.prompt("안녕");
    await agent.waitForIdle();

    const draft = eventsOfType(events, "message_start")
      .map((event) => event.message)
      .find((message): message is AssistantMessage => message.role === "assistant");
    const final = eventsOfType(events, "message_end")
      .map((event) => event.message)
      .find((message): message is AssistantMessage => message.role === "assistant");

    expect(typeof (draft as { id?: unknown } | undefined)?.id).toBe("string");
    expect((final as { id?: unknown } | undefined)?.id).toBe(
      (draft as { id?: unknown } | undefined)?.id,
    );
  });

  it("한 런의 모든 message_end 메시지는 유일한 id를 갖는다 (불변 조건 8)", async () => {
    const model = new ScriptedModel([{ text: "a" }]);

    const { events, listener } = recordEvents();
    const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });
    agent.subscribe(listener);
    await agent.prompt("안녕");
    await agent.waitForIdle();

    const ids = eventsOfType(events, "message_end").map(
      (event) => (event.message as { id?: unknown }).id,
    );
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(typeof id).toBe("string");
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// 근거 2 — 재개 시 과거 메시지는 이벤트로 재방출되지 않는다
// ---------------------------------------------------------------------------

describe("근거 2 — 재개해도 과거 메시지는 재방출되지 않는다 (SESSION-STORE §4)", () => {
  /**
   * 저장소가 `message_end`만 구독하고 `INSERT OR IGNORE`로 쓰는 설계는, 재개 시
   * 과거 메시지가 다시 흘러오면 "이미 있는 행 재삽입 시도"가 매 런 반복된다는
   * 뜻이 된다. 문서는 그런 일이 없다고 전제한다 — 그 전제를 실측한다.
   *
   * id가 없는 현재 구현에서는 이 전제가 깨질 경우 `INSERT OR IGNORE`조차 성립하지
   * 않아 트랜스크립트가 매 재개마다 부풀어 오른다. 그래서 근거 2는 근거 1의 id
   * 항목과 함께 저장소 정확성의 축이다.
   */
  // 저장소에서 읽어 온 과거 트랜스크립트를 흉내 낸다 — id는 이미 발급돼 있다(§3)
  const past: AgentMessage[] = [
    { id: "past-u1", role: "user", content: [{ type: "text", text: "과거 질문" }], timestamp: 1 },
    {
      id: "past-a1",
      role: "assistant",
      content: [{ type: "text", text: "과거 답변" }],
      stopReason: "end_turn",
      usage: { ...ZERO_USAGE },
      timestamp: 2,
    },
    {
      id: "past-t1",
      role: "toolResult",
      toolCallId: "past-call",
      toolName: "noop",
      content: [{ type: "text", text: "과거 결과" }],
      isError: false,
      source: "local",
      timestamp: 3,
    },
  ];

  it("message_end는 이 런에서 새로 생긴 메시지에만 발화한다", async () => {
    const model = new ScriptedModel([{ text: "새 답변" }]);

    const { events, listener } = recordEvents();
    const agent = new Agent({
      session: { systemPrompt: "SP", tools: [], messages: structuredClone(past) },
      modelClient: model,
    });
    agent.subscribe(listener);
    await agent.prompt("새 질문");
    await agent.waitForIdle();

    const ended = eventsOfType(events, "message_end").map((event) => event.message);
    const texts = ended.flatMap((message) =>
      message.content.filter((block) => block.type === "text").map((block) => block.text),
    );

    // 과거 트랜스크립트의 어떤 것도 재방출되지 않는다
    expect(texts).not.toContain("과거 질문");
    expect(texts).not.toContain("과거 답변");
    expect(texts).not.toContain("과거 결과");
    // 새 메시지 2건(user + assistant)만
    expect(ended).toHaveLength(2);
    expect(texts).toEqual(["새 질문", "새 답변"]);
  });

  it("message_start도 마찬가지다 — 과거 메시지는 어떤 이벤트로도 재방출되지 않는다", async () => {
    const model = new ScriptedModel([{ text: "새 답변" }]);

    const { events, listener } = recordEvents();
    const agent = new Agent({
      session: { systemPrompt: "SP", tools: [], messages: structuredClone(past) },
      modelClient: model,
    });
    agent.subscribe(listener);
    await agent.prompt("새 질문");
    await agent.waitForIdle();

    const carried = new Set<AgentMessage>();
    for (const event of events as AgentEvent[]) {
      if (event.type === "message_start" || event.type === "message_end")
        carried.add(event.message);
      if (event.type === "turn_end") {
        carried.add(event.message);
        for (const result of event.toolResults) carried.add(result);
      }
      if (event.type === "agent_end") for (const message of event.messages) carried.add(message);
    }

    const carriedTexts = [...carried].flatMap((message) =>
      message.content.filter((block) => block.type === "text").map((block) => block.text),
    );
    expect(carriedTexts).not.toContain("과거 질문");
    expect(carriedTexts).not.toContain("과거 답변");
    expect(carriedTexts).not.toContain("과거 결과");
  });

  it("agent_end.messages는 새 메시지만 담고, state.messages는 과거+새를 담는다", async () => {
    const model = new ScriptedModel([{ text: "새 답변" }]);

    const { events, listener } = recordEvents();
    const agent = new Agent({
      session: { systemPrompt: "SP", tools: [], messages: structuredClone(past) },
      modelClient: model,
    });
    agent.subscribe(listener);
    await agent.prompt("새 질문");
    await agent.waitForIdle();

    const agentEnd = eventsOfType(events, "agent_end")[0];
    expect(agentEnd?.messages).toHaveLength(2);
    // 저장소는 과거를 다시 쓰지 않지만, 코어의 트랜스크립트는 이어져 있다
    expect(agent.state.messages).toHaveLength(past.length + 2);
  });

  it("두 번째 런에서도 첫 런의 메시지가 재방출되지 않는다", async () => {
    const model = new ScriptedModel([{ text: "답변1" }, { text: "답변2" }]);

    const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });
    await agent.prompt("질문1");
    await agent.waitForIdle();

    // 첫 런이 끝난 뒤 구독한다 — 저장소가 중간에 붙는 경우의 관찰
    const { events, listener } = recordEvents();
    agent.subscribe(listener);
    await agent.prompt("질문2");
    await agent.waitForIdle();

    const texts = eventsOfType(events, "message_end").flatMap((event) =>
      event.message.content.filter((block) => block.type === "text").map((block) => block.text),
    );
    expect(texts).toEqual(["질문2", "답변2"]);
  });
});

// ---------------------------------------------------------------------------
// 근거 3 — `~/.neo-agent/**` denylist가 세션 DB를 덮는다 (게이트 off에서도)
// ---------------------------------------------------------------------------

describe("근거 3 — denylist가 세션 DB를 덮는다 (SESSION-STORE §6)", () => {
  let sandbox: string;
  let home: string;
  let root: string;

  beforeAll(() => {
    // macOS tmpdir은 `/var` → `/private/var` 심링크다. realpath로 고정하지 않으면
    // 기대값이 플랫폼 사정으로 틀어진다.
    sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-qab-denylist-")));
    home = join(sandbox, "home");
    root = join(sandbox, "ws");
    mkdirSync(join(home, ".neo-agent"), { recursive: true });
    mkdirSync(root, { recursive: true });
    // 실재하는 세션 DB 3종 — realpath가 존재/미존재로 다르게 동작하는지까지 본다
    writeFileSync(join(home, ".neo-agent", "sessions.db"), "SQLite format 3\u0000");
    writeFileSync(join(home, ".neo-agent", "sessions.db-wal"), "");
    writeFileSync(join(home, ".neo-agent", "sessions.db-shm"), "");
    writeFileSync(join(root, "ok.txt"), "안");
  });

  afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  const boundaryOf = () => createWorkspaceBoundary({ root, home });

  it("세션 DB와 WAL 부산물이 전부 denied다", () => {
    const boundary = boundaryOf();
    for (const name of ["sessions.db", "sessions.db-wal", "sessions.db-shm"]) {
      expect(boundary.resolve(join(home, ".neo-agent", name)).scope).toBe("denied");
      expect(boundary.resolve(`~/.neo-agent/${name}`).scope).toBe("denied");
    }
  });

  it("아직 만들어지지 않은 DB 경로도 denied다 — 첫 실행 전에도 구멍이 없다", () => {
    const boundary = boundaryOf();
    expect(boundary.resolve("~/.neo-agent/not-created-yet.db").scope).toBe("denied");
    expect(boundary.resolve("~/.neo-agent/nested/deep/sessions.db").scope).toBe("denied");
  });

  it("대소문자 변형으로도 우회되지 않는다", () => {
    const boundary = boundaryOf();
    expect(boundary.resolve("~/.NEO-AGENT/sessions.db").scope).toBe("denied");
    expect(boundary.resolve("~/.Neo-Agent/Sessions.DB").scope).toBe("denied");
  });

  it("`..` 경유·중복 슬래시로도 우회되지 않는다", () => {
    const boundary = boundaryOf();
    expect(boundary.resolve(join(home, ".neo-agent", "x", "..", "sessions.db")).scope).toBe(
      "denied",
    );
    expect(boundary.resolve(`${home}//.neo-agent//sessions.db`).scope).toBe("denied");
  });

  it("`.neo-agent-evil`처럼 접두어만 같은 형제는 denied가 아니다 (과차단 없음)", () => {
    const boundary = boundaryOf();
    // 봉쇄 판정은 세그먼트 단위다 — 이것이 denied면 판정기가 문자열 prefix를 쓰고 있다는 뜻
    expect(boundary.resolve(join(home, ".neo-agent-evil", "x.db")).scope).not.toBe("denied");
  });

  it("게이트도 훅도 없이 read_file 도구 자체가 세션 DB 읽기를 거부한다", async () => {
    const boundary = boundaryOf();
    const tool = createReadFileTool(boundary);
    const ctx: ToolExecutionContext = {
      toolCallId: "call-1",
      signal: new AbortController().signal,
    };

    // 게이트 모듈도, beforeToolCall 훅도 이 경로에 없다 — 도구 자체가 최종 보장 지점(§6)
    await expect(tool.execute({ path: `~/.neo-agent/sessions.db` }, ctx)).rejects.toThrow(
      /blocked/i,
    );
    await expect(
      tool.execute({ path: join(home, ".neo-agent", "sessions.db") }, ctx),
    ).rejects.toThrow(/approval/i);

    // 대조군 — 워크스페이스 안의 평범한 파일은 읽힌다(거부가 무차별이 아님)
    const ok = await tool.execute({ path: "ok.txt" }, ctx);
    expect(ok.content[0]).toMatchObject({ type: "text" });
  });

  it("게이트를 배선하지 않은 Agent 런에서도 세션 DB 읽기가 실패로 끝난다", async () => {
    const boundary = boundaryOf();
    const model = new ScriptedModel([
      {
        toolCalls: [
          {
            toolCallId: "call-1",
            toolName: "read_file",
            args: { path: "~/.neo-agent/sessions.db" },
          },
        ],
      },
      { text: "못 읽었습니다" },
    ]);

    // hooks 미지정 = 게이트 off. 도구만으로 막혀야 한다.
    const agent = new Agent({
      session: { systemPrompt: "SP", tools: [createReadFileTool(boundary)] },
      modelClient: model,
    });
    await agent.prompt("내 대화 DB 좀 읽어줘");
    await agent.waitForIdle();

    const result = agent.state.messages.find((message) => message.role === "toolResult");
    expect(result?.isError).toBe(true);
    const text = result?.content.find((block) => block.type === "text")?.text ?? "";
    expect(text).toMatch(/blocked/i);
    // DB의 내용이 모델에게 새지 않았다
    expect(text).not.toContain("SQLite format 3");
  });
});
