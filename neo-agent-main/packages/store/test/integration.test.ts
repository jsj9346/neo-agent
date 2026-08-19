/**
 * 통합 시나리오 — 저장 → 재개 → 이어가기 왕복.
 *
 * 단위 테스트가 각 조각을 보는 것과 달리, 여기서 검증하는 것은 **조각들의 접합부**다:
 * 코어가 발급한 id로 저장소가 행을 만들고, 그 행이 Zod를 통과해 다시
 * `AgentSessionInit.messages`가 되고, 그 배열로 만든 새 `Agent`가 이어서 돈다.
 * 접합부 어디가 어긋나도 개별 단위 테스트는 전부 초록불일 수 있다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  Agent,
  type AgentEvent,
  type AgentMessage,
  type AgentTool,
  type ToolResult,
} from "@neo-agent/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { openSessionStore, type SessionStore } from "../src/index.ts";
import { MockModel } from "./mock-model.ts";

let sandbox: string;
let home: string;
let workspaceRoot: string;
let store: SessionStore;
let sessionId: string;

const dbPath = (): string => join(home, ".neo-agent", "sessions.db");
const context = () => ({ workspaceRoot, systemPrompt: "SP", model: "model-x" });

/** 저장소 API 밖에서 관측한다 — API가 스스로를 증명하지 않게 */
function rawRows(): { seq: number; role: string; id: string }[] {
  const db = new DatabaseSync(dbPath());
  try {
    return db
      .prepare("SELECT seq, role, id FROM messages WHERE session_id = ? ORDER BY seq")
      .all(sessionId) as never;
  } finally {
    db.close();
  }
}

const echoTool: AgentTool = {
  name: "echo",
  label: "Echo",
  description: "받은 문자열을 그대로 돌려준다",
  paramsSchema: z.strictObject({ text: z.string() }),
  execute: async (params): Promise<ToolResult> => ({
    content: [{ type: "text", text: `echo: ${(params as { text: string }).text}` }],
    source: "local",
  }),
};

beforeEach(() => {
  sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-store-integration-")));
  home = join(sandbox, "home");
  workspaceRoot = join(sandbox, "ws");
  mkdirSync(home, { recursive: true });
  mkdirSync(workspaceRoot, { recursive: true });
  store = openSessionStore({ home, onWarning: () => {} });
  sessionId = store.createSession({ workspaceRoot, systemPrompt: "SP", model: "model-x" }).id;
});

afterEach(() => {
  store.close();
  rmSync(sandbox, { recursive: true, force: true });
});

describe("저장 → 재개 → 이어가기 왕복", () => {
  it("도구 호출이 섞인 런을 저장하고, 새 스토어·새 Agent로 이어간다", async () => {
    const model = new MockModel([
      {
        text: "도구를 쓰겠습니다",
        toolCalls: [{ toolCallId: "c1", toolName: "echo", args: { text: "안녕" } }],
      },
      { text: "끝났습니다" },
    ]);
    const agent = new Agent({
      session: { systemPrompt: "SP", tools: [echoTool] },
      modelClient: model,
    });
    store.attach(agent, sessionId);

    await agent.prompt("첫 질문입니다");
    await agent.waitForIdle();

    const recorded = [...agent.state.messages];
    expect(recorded.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "toolResult",
      "assistant",
    ]);

    // ── 프로세스가 죽었다 치고 저장소를 완전히 새로 연다 ──
    store.close();
    const reopened = openSessionStore({ home, onWarning: () => {} });
    try {
      const loaded = reopened.loadSession(sessionId, context());

      // 왕복 무손실 — id·timestamp·usage·args까지 포함해 그대로여야 한다.
      expect(loaded.messages).toEqual(recorded);
      expect(loaded.session.title).toContain("첫 질문");

      const resumedModel = new MockModel([{ text: "이어서 답합니다" }]);
      const resumed = new Agent({
        session: { systemPrompt: "SP", tools: [echoTool], messages: loaded.messages },
        modelClient: resumedModel,
      });
      reopened.attach(resumed, sessionId);

      await resumed.prompt("추가 질문");
      await resumed.waitForIdle();

      // 과거 트랜스크립트가 모델에게 그대로 전달됐다 — 재개의 실질이다.
      expect(resumedModel.requests[0]?.messages.slice(0, recorded.length)).toEqual(recorded);

      // seq가 이어 붙는다. 재개가 1부터 다시 세면 유니크 인덱스에서 터진다.
      expect(rawRows().map((row) => row.seq)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(rawRows().map((row) => row.role)).toEqual([
        "user",
        "assistant",
        "toolResult",
        "assistant",
        "user",
        "assistant",
      ]);
    } finally {
      reopened.close();
    }
  });

  it("재개해도 과거 메시지가 다시 저장되지 않는다 — 재방출이 없다", async () => {
    const model = new MockModel([{ text: "답변" }]);
    const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });
    store.attach(agent, sessionId);
    await agent.prompt("질문");
    await agent.waitForIdle();

    const loaded = store.loadSession(sessionId, context());
    const resumed = new Agent({
      session: { systemPrompt: "SP", tools: [], messages: loaded.messages },
      modelClient: new MockModel([{ text: "이어서" }]),
    });
    store.attach(resumed, sessionId);
    await resumed.prompt("질문2");
    await resumed.waitForIdle();

    // 2(원래) + 2(새로) = 4. 과거 2건이 다시 방출됐다면 `INSERT OR IGNORE`가
    // 삼켜 4로 보이지만, seq가 어긋나므로 아래 단정이 그 경우를 가른다.
    expect(rawRows().map((row) => row.seq)).toEqual([1, 2, 3, 4]);
  });
});

describe("구독 순서 — 본 것은 이미 저장된 것 (§4)", () => {
  it("저장소를 먼저 배선하면 나중 구독자는 항상 저장 뒤에 이벤트를 받는다", async () => {
    const model = new MockModel([
      { toolCalls: [{ toolCallId: "c1", toolName: "echo", args: { text: "x" } }] },
      { text: "끝" },
    ]);
    const agent = new Agent({
      session: { systemPrompt: "SP", tools: [echoTool] },
      modelClient: model,
    });

    // 배선 순서가 계약이다 — 저장소가 먼저.
    store.attach(agent, sessionId);

    // 렌더러 역할. 이벤트를 받은 그 순간의 행 수를 기록한다.
    const rowsWhenSeen: number[] = [];
    agent.subscribe((event: AgentEvent) => {
      if (event.type === "message_end") rowsWhenSeen.push(rawRows().length);
    });

    await agent.prompt("질문");
    await agent.waitForIdle();

    // n번째 메시지를 화면에서 볼 때 이미 n행이 있다. 반대 순서였다면 [0,1,2,3]이 된다.
    expect(rowsWhenSeen).toEqual([1, 2, 3, 4]);
  });

  it("waitForIdle() 직후 행 수가 최종값이다 — 별도 flush가 없다", async () => {
    const model = new MockModel([
      { toolCalls: [{ toolCallId: "c1", toolName: "echo", args: { text: "x" } }] },
      { text: "끝" },
    ]);
    const agent = new Agent({
      session: { systemPrompt: "SP", tools: [echoTool] },
      modelClient: model,
    });
    store.attach(agent, sessionId);

    await agent.prompt("질문");
    await agent.waitForIdle();
    const settled = rawRows().length;
    expect(settled).toBe(4);

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(rawRows().length).toBe(settled);
  });
});

describe("비정상 종료도 저장되고 재개 가능하다", () => {
  /**
   * 긴 런에서 프로세스가 죽으면 그 런의 대화가 통째로 사라지는 것이 `agent_end`
   * 일괄 저장을 기각한 이유였다(§4). 중단된 런도 같은 논리로 남아야 한다.
   */
  it("중단된 런의 트랜스크립트가 저장되고, 그 상태에서 재개해 이어갈 수 있다", async () => {
    let abort: () => void = () => {};
    const model = new MockModel([
      {
        text: "도구 씁니다",
        toolCalls: [{ toolCallId: "c1", toolName: "echo", args: { text: "x" } }],
        // done 직전에 중단을 건다 — 스트림 도중 취소를 재현한다.
        beforeDone: async () => {
          abort();
        },
      },
    ]);
    const agent = new Agent({
      session: { systemPrompt: "SP", tools: [echoTool] },
      modelClient: model,
    });
    abort = () => agent.abort("테스트 중단");
    store.attach(agent, sessionId);

    await agent.prompt("질문").catch(() => undefined);
    await agent.waitForIdle();

    const saved = rawRows();
    expect(saved.length).toBeGreaterThan(0);

    // 재개 — 짝이 맞지 않으면 다음 API 호출이 와이어 정합성 검사에서 거부된다(§7).
    const loaded = store.loadSession(sessionId, context());
    expect(loaded.messages).toEqual([...agent.state.messages]);
    expectToolCallsArePaired(loaded.messages);

    const resumed = new Agent({
      session: { systemPrompt: "SP", tools: [echoTool], messages: loaded.messages },
      modelClient: new MockModel([{ text: "중단 뒤 이어서" }]),
    });
    store.attach(resumed, sessionId);
    await resumed.prompt("다시 질문");
    await resumed.waitForIdle();

    expect(rawRows().length).toBe(saved.length + 2);
  });

  /**
   * 다른 구독자(렌더러)가 던져도 저장은 이미 끝나 있다 — 코어가 "리스너 예외는
   * 나머지 리스너의 전달을 취소하지 않는다"를 보장하고, 저장소가 먼저 구독하므로
   * 예외를 던진 렌더러보다 앞서 실행된다.
   */
  it("나중 구독자가 던져 런이 실패해도 그 시점까지의 메시지는 저장돼 있다", async () => {
    const model = new MockModel([{ text: "답변" }]);
    const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });
    store.attach(agent, sessionId);
    // 어시스턴트 메시지에서 터뜨린다 — 저장소가 **먼저** 구독했으므로 이 예외가
    // 나기 전에 그 메시지는 이미 행이 되어 있어야 한다.
    agent.subscribe((event) => {
      if (event.type === "message_end" && event.message.role === "assistant") {
        throw new Error("렌더러가 터졌다");
      }
    });

    await expect(agent.prompt("질문")).rejects.toThrow();
    await agent.waitForIdle();

    expect(rawRows().map((row) => row.role)).toEqual(["user", "assistant"]);
    expect(() => store.loadSession(sessionId, context())).not.toThrow();
  });
});

/** 모든 toolCall에 같은 `toolCallId`의 toolResult가 있는지 — 코어의 §5 보장 확인 */
function expectToolCallsArePaired(messages: readonly AgentMessage[]): void {
  const calls = new Set<string>();
  const results = new Set<string>();
  for (const message of messages) {
    if (message.role === "assistant") {
      for (const block of message.content) {
        if (block.type === "toolCall") calls.add(block.toolCallId);
      }
    }
    if (message.role === "toolResult") results.add(message.toolCallId);
  }
  expect([...calls].filter((id) => !results.has(id))).toEqual([]);
}
