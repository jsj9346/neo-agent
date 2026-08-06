/**
 * 저장 시점 — 이벤트 구독 계약 (QA-B).
 *
 * 기대값의 출처는 `docs/SESSION-STORE.md` §4 전체와 §2의 "결정 사항"(seq 발급,
 * body 단방향 파생, title 자동 생성), 보조로 `CORE-INTERFACE.md` §3(구독 순서와
 * settlement)이다.
 *
 * §4의 계약은 네 줄로 요약된다:
 *   1. `message_end`만 저장한다 (초안은 거짓 기록, 나머지는 중복)
 *   2. 저장은 `INSERT OR IGNORE` — 규약을 어겨도 데이터가 손상되지 않는다
 *   3. 메시지 INSERT와 `sessions.updated_at` UPDATE는 한 트랜잭션이다
 *   4. 저장소는 렌더러보다 먼저 구독한다 — 본 것은 이미 저장된 것이다
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Agent, type AgentEvent, type AgentMessage } from "@neo-agent/core";
import { openSessionStore, type SessionStore } from "@neo-agent/store";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ScriptedModel } from "./contract-harness.ts";

let sandbox: string;
let home: string;
let workspaceRoot: string;
let store: SessionStore;
let sessionId: string;

const dbPath = (): string => join(home, ".neo-agent", "sessions.db");

/** 저장소가 쓴 결과를 저장소 API 밖에서 관측한다 — API가 스스로를 증명하지 않게 */
function readRows(): { id: string; seq: number; role: string; timestamp: number; body: string }[] {
  const db = new DatabaseSync(dbPath());
  try {
    return db
      .prepare(
        "SELECT id, seq, role, timestamp, body FROM messages WHERE session_id = ? ORDER BY seq",
      )
      .all(sessionId) as never;
  } finally {
    db.close();
  }
}

function readSessionRow(): { updated_at: number; title: string | null } {
  const db = new DatabaseSync(dbPath());
  try {
    return db
      .prepare("SELECT updated_at, title FROM sessions WHERE id = ?")
      .get(sessionId) as never;
  } finally {
    db.close();
  }
}

beforeEach(() => {
  sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-qab-subscribe-")));
  home = join(sandbox, "home");
  workspaceRoot = join(sandbox, "ws");
  mkdirSync(home, { recursive: true });
  mkdirSync(workspaceRoot, { recursive: true });
  store = openSessionStore({ home });
  sessionId = store.createSession({ workspaceRoot, systemPrompt: "SP", model: "model-x" }).id;
});

afterEach(() => {
  try {
    store.close();
  } catch {
    /* 이미 닫힌 경우 */
  }
  rmSync(sandbox, { recursive: true, force: true });
});

describe("message_end만 저장한다 (SESSION-STORE §4)", () => {
  it("런 1회의 행 수·순서가 트랜스크립트와 일치한다", async () => {
    const model = new ScriptedModel([{ text: "답변" }]);
    const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });
    store.attach(agent, sessionId);

    await agent.prompt("질문");
    await agent.waitForIdle();

    const rows = readRows();
    expect(rows.map((row) => row.role)).toEqual(["user", "assistant"]);
    // seq는 트랜스크립트 순서다 — 1부터 빈틈없이
    expect(rows.map((row) => row.seq)).toEqual([1, 2]);
  });

  /**
   * §4의 핵심 단정. 초안(`message_start`)의 `stopReason`은 `end_turn`,
   * `usage`는 전부 0이다(evidence.contract.test.ts에서 실측 확인). 저장된 body가
   * 그 값을 담고 있으면 저장소가 초안을 저장한 것이고 §3이 말한 **거짓 기록**이 된다.
   */
  it("저장된 body는 초안이 아니라 최종 메시지다 — stopReason·usage가 확정값이다", async () => {
    const model = new ScriptedModel([
      {
        text: "도구 씁니다",
        toolCalls: [{ toolCallId: "call-1", toolName: "nope", args: {} }],
        usage: { input: 999, output: 11, cacheRead: 2, cacheWrite: 3 },
      },
      { text: "끝", usage: { input: 5, output: 1 } },
    ]);
    const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });
    store.attach(agent, sessionId);

    await agent.prompt("질문");
    await agent.waitForIdle();

    const assistant = readRows()
      .map((row) => JSON.parse(row.body) as AgentMessage)
      .filter((message) => message.role === "assistant");

    expect(assistant[0]?.stopReason).toBe("tool_use");
    expect(assistant[0]?.usage).toEqual({ input: 999, output: 11, cacheRead: 2, cacheWrite: 3 });
  });

  it("실패한 런의 저장된 stopReason은 error다 — 초안의 end_turn이 아니다", async () => {
    const model = new ScriptedModel([
      { text: "부분", stopReason: "error", errorMessage: "upstream 500" },
    ]);
    const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });
    store.attach(agent, sessionId);

    await agent.prompt("질문");
    await agent.waitForIdle();

    const assistant = readRows()
      .map((row) => JSON.parse(row.body) as AgentMessage)
      .find((message) => message.role === "assistant");
    expect(assistant?.stopReason).toBe("error");
    expect(assistant?.errorMessage).toBe("upstream 500");
  });

  it("turn_end·agent_end가 실은 메시지가 중복 저장되지 않는다", async () => {
    const model = new ScriptedModel([{ text: "답변" }]);
    const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });
    store.attach(agent, sessionId);

    const seen: AgentEvent["type"][] = [];
    agent.subscribe((event) => void seen.push(event.type));

    await agent.prompt("질문");
    await agent.waitForIdle();

    // 같은 어시스턴트 메시지가 message_end · turn_end · agent_end 세 번 흘러가지만
    // 행은 하나다
    expect(seen).toContain("turn_end");
    expect(seen).toContain("agent_end");
    expect(readRows()).toHaveLength(2);
  });

  it("도구 결과 메시지도 저장된다 — 트랜스크립트의 모든 메시지가 대상이다", async () => {
    const model = new ScriptedModel([
      { toolCalls: [{ toolCallId: "c1", toolName: "없는도구", args: {} }] },
      { text: "끝" },
    ]);
    const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });
    store.attach(agent, sessionId);

    await agent.prompt("질문");
    await agent.waitForIdle();

    expect(readRows().map((row) => row.role)).toEqual([
      "user",
      "assistant",
      "toolResult",
      "assistant",
    ]);
  });
});

describe("INSERT OR IGNORE 멱등 (SESSION-STORE §3 · §4)", () => {
  /**
   * §3: "`INSERT OR IGNORE`가 성립해 `agent_end`·`turn_end`를 실수로 함께 구독해도
   * 데이터 손상이 아니라 무해한 no-op이 된다."
   *
   * 같은 저장소를 같은 세션에 **두 번 attach**하면 모든 `message_end`가 두 번
   * 전달된다 — 규약 위반의 효과를 API 경계에서 정확히 재현한다.
   */
  it("같은 세션에 두 번 attach해도 행 수가 변하지 않는다", async () => {
    const model = new ScriptedModel([{ text: "답변" }]);
    const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });
    store.attach(agent, sessionId);
    store.attach(agent, sessionId);

    await agent.prompt("질문");
    await agent.waitForIdle();

    expect(readRows()).toHaveLength(2);
    // seq도 부풀지 않는다 — MAX(seq)+1이 무시된 INSERT마다 올라가면 구멍이 생긴다
    expect(readRows().map((row) => row.seq)).toEqual([1, 2]);
  });

  it("두 번 attach해도 두 번째 삽입이 첫 번째 내용을 덮어쓰지 않는다", async () => {
    const model = new ScriptedModel([{ text: "답변", usage: { input: 42 } }]);
    const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });
    store.attach(agent, sessionId);
    store.attach(agent, sessionId);

    await agent.prompt("질문");
    await agent.waitForIdle();

    const assistant = readRows()
      .map((row) => JSON.parse(row.body) as AgentMessage)
      .find((message) => message.role === "assistant");
    expect(assistant?.usage.input).toBe(42);
  });

  it("attach의 반환값으로 해지하면 그 뒤 메시지는 저장되지 않는다", async () => {
    const model = new ScriptedModel([{ text: "답변1" }, { text: "답변2" }]);
    const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });
    const unsubscribe = store.attach(agent, sessionId);

    await agent.prompt("질문1");
    await agent.waitForIdle();
    expect(readRows()).toHaveLength(2);

    unsubscribe();
    await agent.prompt("질문2");
    await agent.waitForIdle();
    expect(readRows()).toHaveLength(2);
  });
});

describe("멱등 보장의 경계 — message_start는 무해하지 않다 (SESSION-STORE §3 · §4)", () => {
  /**
   * §3은 `INSERT OR IGNORE`가 "중복 방지를 규약이 아니라 **구조**로 만든다"며
   * `agent_end`·`turn_end`를 실수로 함께 구독해도 무해하다고 말한다. 그 열거에
   * `message_start`가 빠져 있는 것은 **의도적이고 옳다** — 그리고 그 이유는
   * §3의 다른 결정(초안과 최종이 **같은 id**를 공유한다)에서 나온다.
   *
   * 같은 id를 공유하므로 초안을 먼저 넣으면 최종이 `INSERT OR IGNORE`에 **먹힌다**.
   * 결과는 "행 수는 맞는데 내용이 거짓인" 상태다 — 행 수만 세는 멱등 검사로는
   * 절대 잡히지 않는다.
   *
   * 이 테스트는 위반 단정이 아니라 **경계의 고정**이다. 나중에 누군가 "안전하니까
   * message_start도 구독하자"고 할 때 근거가 되라고 둔다. §4의 "무시한다" 목록에서
   * `message_start`가 다른 셋과 **다른 이유로** 거기 있다는 사실이 코드에 남아야 한다.
   */
  it("초안을 먼저 넣으면 최종이 INSERT OR IGNORE에 먹혀 거짓 기록이 남는다", async () => {
    const model = new ScriptedModel([
      { text: "답변", stopReason: "error", errorMessage: "실패했다", usage: { input: 500 } },
    ]);
    const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });

    // 저장소가 message_start까지 구독했다면 벌어질 일을 그대로 재현한다
    const drafts: AgentMessage[] = [];
    const finals: AgentMessage[] = [];
    agent.subscribe((event) => {
      if (event.type === "message_start" && event.message.role === "assistant") {
        drafts.push(event.message);
      }
      if (event.type === "message_end" && event.message.role === "assistant") {
        finals.push(event.message);
      }
    });
    await agent.prompt("질문");
    await agent.waitForIdle();

    const draft = drafts[0] as AgentMessage;
    const final = finals[0] as AgentMessage;
    expect(draft).toBeDefined();
    expect(final).toBeDefined();
    // §3의 결정 — 초안과 최종은 같은 id다. 이것이 아래 결과의 원인이다.
    expect((draft as { id: string }).id).toBe((final as { id: string }).id);

    const db = new DatabaseSync(dbPath());
    try {
      const stmt = db.prepare(
        "INSERT OR IGNORE INTO messages (id, session_id, seq, role, timestamp, body) VALUES (?,?,?,?,?,?)",
      );
      // message_start 구독의 효과
      stmt.run(
        (draft as { id: string }).id,
        sessionId,
        1,
        draft.role,
        draft.timestamp,
        JSON.stringify(draft),
      );
      // 뒤이은 message_end — 같은 id라 무시된다
      stmt.run(
        (final as { id: string }).id,
        sessionId,
        2,
        final.role,
        final.timestamp,
        JSON.stringify(final),
      );

      const rows = db.prepare("SELECT body FROM messages WHERE session_id = ?").all(sessionId) as {
        body: string;
      }[];

      // 행 수는 1 — 행 수만 세는 멱등 검사는 여기서 "통과"한다
      expect(rows).toHaveLength(1);
      // 그런데 남은 것은 초안이다: 실패한 턴이 정상 종료로 기록됐다
      const stored = JSON.parse(rows[0]?.body ?? "{}") as AgentMessage & { stopReason?: string };
      expect(stored.stopReason).toBe("end_turn");
      expect(stored.stopReason).not.toBe("error");
    } finally {
      db.close();
    }
  });
});

describe("트랜잭션 원자성 (SESSION-STORE §4)", () => {
  /**
   * "메시지 INSERT와 `sessions.updated_at` UPDATE는 **한 트랜잭션**이다."
   *
   * 트리거로 INSERT를 실패시킨다. 트랜잭션이 하나면 `updated_at`도 롤백되고,
   * 둘이면 "메시지는 없는데 세션은 갱신된" 상태가 남는다 — 목록 화면에서 방금
   * 대화한 것처럼 보이지만 열면 비어 있는 세션이다.
   */
  it("메시지 INSERT가 실패하면 sessions.updated_at도 갱신되지 않는다", async () => {
    const before = readSessionRow().updated_at;

    const admin = new DatabaseSync(dbPath());
    try {
      admin.exec(
        "CREATE TRIGGER qab_fail_insert BEFORE INSERT ON messages BEGIN SELECT RAISE(ABORT, 'qab-forced-failure'); END",
      );
    } finally {
      admin.close();
    }

    const model = new ScriptedModel([{ text: "답변" }]);
    const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });
    store.attach(agent, sessionId);

    await expect(agent.prompt("질문")).rejects.toThrow();
    await agent.waitForIdle();

    expect(readRows()).toHaveLength(0);
    expect(readSessionRow().updated_at).toBe(before);
  });

  it("정상 저장은 sessions.updated_at을 앞으로 민다", async () => {
    const before = readSessionRow().updated_at;
    await new Promise((resolve) => setTimeout(resolve, 5));

    const model = new ScriptedModel([{ text: "답변" }]);
    const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });
    store.attach(agent, sessionId);
    await agent.prompt("질문");
    await agent.waitForIdle();

    expect(readSessionRow().updated_at).toBeGreaterThanOrEqual(before);
  });
});

describe("body 단방향 파생과 title (SESSION-STORE §2)", () => {
  /**
   * §2: "`role`·`timestamp`는 `body`에서 파생된 중복이며 파생은 **단방향**이다.
   * 컬럼만 갱신해 `body`와 어긋나게 만드는 경로를 두지 않는다."
   *
   * 공개 경로가 하나뿐이라는 것은 "어긋난 행을 만들 API가 없다"로만 검증 가능하다 —
   * 저장 경로를 통과한 모든 행에서 두 값이 body와 일치하는지 본다.
   */
  it("저장된 모든 행의 role·timestamp가 body와 일치한다", async () => {
    const model = new ScriptedModel([
      { toolCalls: [{ toolCallId: "c1", toolName: "없는도구", args: {} }] },
      { text: "끝" },
    ]);
    const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });
    store.attach(agent, sessionId);
    await agent.prompt("질문");
    await agent.waitForIdle();

    for (const row of readRows()) {
      const body = JSON.parse(row.body) as AgentMessage;
      expect(row.role).toBe(body.role);
      expect(row.timestamp).toBe(body.timestamp);
      // id 컬럼도 body의 id와 같아야 한다 — 중복 방지가 구조가 되려면(§3)
      expect(row.id).toBe((body as { id?: string }).id);
    }
  });

  it("body는 AgentMessage JSON 전문이다 — 손실 없이 왕복한다", async () => {
    const model = new ScriptedModel([{ text: "답변", usage: { input: 7, cacheWrite: 2 } }]);
    const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });
    store.attach(agent, sessionId);
    await agent.prompt("질문");
    await agent.waitForIdle();

    const stored = readRows().map((row) => JSON.parse(row.body) as AgentMessage);
    expect(stored).toEqual([...agent.state.messages]);
  });

  it("세션 title은 첫 UserMessage의 앞부분에서 자동 생성된다", async () => {
    expect(readSessionRow().title).toBeNull();

    const model = new ScriptedModel([{ text: "답변" }]);
    const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });
    store.attach(agent, sessionId);
    await agent.prompt("첫 질문입니다");
    await agent.waitForIdle();

    const title = readSessionRow().title;
    expect(title).not.toBeNull();
    expect(title).toContain("첫 질문");
  });

  it("title은 첫 UserMessage로만 정해진다 — 이후 프롬프트가 덮어쓰지 않는다", async () => {
    const model = new ScriptedModel([{ text: "a" }, { text: "b" }]);
    const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });
    store.attach(agent, sessionId);

    await agent.prompt("첫 질문입니다");
    await agent.waitForIdle();
    const first = readSessionRow().title;

    await agent.prompt("두 번째 질문입니다");
    await agent.waitForIdle();
    expect(readSessionRow().title).toBe(first);
  });
});

describe("구독 순서와 flush (SESSION-STORE §4 · CORE-INTERFACE §3)", () => {
  /**
   * §4: "**저장소는 CLI 렌더러보다 먼저 구독한다.** … 이 순서는 **사용자가 화면에서
   * 본 것은 이미 저장된 것**이라는 뜻이 된다."
   *
   * 저장소를 먼저 attach하고 나중에 구독한 관찰자가 `message_end`를 받는 시점에
   * 이미 행이 있는지 본다. 리스너가 구독 순서대로 await된다는 코어 계약(§3)이
   * 이 성질의 하부 구조다.
   */
  it("나중에 구독한 관찰자는 이미 저장된 뒤에 이벤트를 받는다", async () => {
    const model = new ScriptedModel([{ text: "답변" }]);
    const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });

    store.attach(agent, sessionId);

    const observed: number[] = [];
    agent.subscribe((event) => {
      if (event.type === "message_end") observed.push(readRows().length);
    });

    await agent.prompt("질문");
    await agent.waitForIdle();

    // user 메시지 방출 시점에 1행, assistant 방출 시점에 2행 — 항상 "이미 저장된 뒤"
    expect(observed).toEqual([1, 2]);
  });

  /**
   * §4: "**종료 시 flush가 따로 필요 없다.** `waitForIdle()`이 리스너 settlement까지
   * 기다린다." 별도 flush 호출 없이 행 수가 최종값이어야 한다.
   */
  it("waitForIdle() 직후 행 수가 최종값이다 — 별도 flush가 필요 없다", async () => {
    const model = new ScriptedModel([
      { toolCalls: [{ toolCallId: "c1", toolName: "없는도구", args: {} }] },
      { text: "끝" },
    ]);
    const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });
    store.attach(agent, sessionId);

    await agent.prompt("질문");
    await agent.waitForIdle();
    const settled = readRows().length;

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(readRows().length).toBe(settled);
    expect(settled).toBe(4);
  });
});
