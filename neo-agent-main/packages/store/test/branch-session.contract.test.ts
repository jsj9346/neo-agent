/**
 * `branchSession` — 압축 분기의 원자적 영속화와 superseded 제외 (QA-B).
 *
 * **이 파일은 구현보다 먼저 쓰였다.** T-005(Store Eng)가 착수하기 전에 계약을
 * 고정하는 것이 목적이며, 작성 시점에는 전부 빨간불(`SessionStore`에
 * `branchSession`이 없으므로 타입 에러 포함)인 것이 정상이다.
 *
 * 기대값의 출처:
 *   - `docs/SESSION-STORE.md` §5 — `branchSession` 시그니처와 규정("한 트랜잭션:
 *     자식 세션 행(parent_session_id = parentId) + 요약(seq 1) + 유지 복사(같은 id).
 *     workspace_root·title은 부모에서 복사한다 — 첫 UserMessage 자동 제목 규칙을
 *     적용하면 제목이 요약문이 되므로 이 경로에서는 쓰지 않는다"),
 *     "superseded 세션은 목록·접두 해석에서 빠진다"
 *   - `docs/COMPACTION.md` 머리 — "**압축은 과거를 고쳐 쓰지 않는다.** 구 세션의 행은
 *     단 하나도 변경·삭제되지 않으며, 압축의 산출물은 언제나 새 세션이다"
 *   - `docs/COMPACTION.md` §2 — 자식 세션의 자기완결성, 같은 id 유지(메시지 동일성)
 *   - `docs/COMPACTION.md` §6 — "branchSession은 한 트랜잭션이다 … 반쯤 분기된
 *     세션은 손상이다", "부모 세션은 목록·접두 해석에서 빠진다"
 *
 * 판정 기준: **원인 쪽이 미규정이어도 문서가 금지한 결과가 나오면 위반이다.**
 * 회색지대는 임의 판정하지 않고 파일 말미의 `[미규정 B-n]` 블록에 모았다.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Agent, type AgentMessage, createUserMessage, type UserMessage } from "@neo-agent/core";
import { openSessionStore, type SessionStore, type StoredSession } from "@neo-agent/store";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ScriptedModel } from "./contract-harness.ts";

// ───────────────────────────────────────────────────────────────────────────
// 계약 격차 래퍼 — `branchSession`은 §5의 `SessionStore`에 있으나 구현 타입에는
// 아직 없다. 타입을 넓혀 접근하되 **존재 여부는 런타임에 확인한다**: 없을 때
// "is not a function"이라는 진단 불가능한 TypeError 대신 "계약 미구현"이라고
// 말하게 만든다.
// ───────────────────────────────────────────────────────────────────────────

interface BranchInput {
  summaryMessage: UserMessage;
  keptMessages: readonly AgentMessage[];
  systemPrompt: string;
  model: string;
}

type BranchStore = SessionStore & {
  branchSession?: (parentId: string, branch: BranchInput) => StoredSession;
};

function branchSession(parentId: string, branch: BranchInput): StoredSession {
  const fn = (store as BranchStore).branchSession;
  if (typeof fn !== "function") {
    throw new Error(
      "계약 미구현: SessionStore.branchSession이 없다 (SESSION-STORE §5 · COMPACTION §6)",
    );
  }
  return fn.call(store, parentId, branch);
}

/**
 * `.toThrow()`는 메서드가 없을 때도 통과한다 — 미구현 상태에서 거부 단정이 공허하게
 * 초록불이 되는 것을 막는다(`store-gap.contract.test.ts`와 같은 헬퍼).
 */
function expectRejects(fn: () => unknown): Error {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  const message = String((caught as Error).message);
  expect(message).not.toMatch(/is not a function/);
  expect(message).not.toMatch(/계약 미구현/);
  return caught as Error;
}

// ───────────────────────────────────────────────────────────────────────────
// 하네스
// ───────────────────────────────────────────────────────────────────────────

let sandbox: string;
let home: string;
let workspaceRoot: string;
let store: SessionStore;

const SYSTEM_PROMPT = "SP";
const MODEL = "model-x";

const dbPath = (): string => join(home, ".neo-agent", "sessions.db");

const context = () => ({ workspaceRoot, systemPrompt: SYSTEM_PROMPT, model: MODEL });

function withRawDb<T>(fn: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(dbPath());
  try {
    db.exec("PRAGMA foreign_keys = ON");
    return fn(db);
  } finally {
    db.close();
  }
}

const newSession = (): string =>
  store.createSession({ workspaceRoot, systemPrompt: SYSTEM_PROMPT, model: MODEL }).id;

/**
 * 실제 경로(attach → prompt)로 `turns`번의 user/assistant 왕복을 저장한다.
 * 분기의 재료가 되는 트랜스크립트는 API가 만든 것이어야 한다 — 손으로 넣은 행으로만
 * 검증하면 `title` 자동 생성 같은 기존 계약과의 상호작용이 드러나지 않는다.
 */
async function recordTurns(sessionId: string, turns: number): Promise<void> {
  const model = new ScriptedModel(
    Array.from({ length: turns }, (_, index) => ({ text: `응답 ${index + 1}` })),
  );
  const agent = new Agent({
    session: { systemPrompt: SYSTEM_PROMPT, tools: [] },
    modelClient: model,
  });
  const unsubscribe = store.attach(agent, sessionId);
  try {
    for (let index = 0; index < turns; index += 1) {
      await agent.prompt(`질문 ${index + 1}`);
    }
    await agent.waitForIdle();
  } finally {
    unsubscribe();
  }
}

function summaryMessage(text = "이전 대화의 요약이다"): UserMessage {
  return createUserMessage({ role: "user", content: [{ type: "text", text }] });
}

interface SessionRow {
  id: string;
  created_at: number;
  updated_at: number;
  title: string | null;
  workspace_root: string;
  system_prompt: string;
  model: string;
  parent_session_id: string | null;
  active: number;
}

function sessionRow(id: string): SessionRow | undefined {
  return withRawDb(
    (db) =>
      db
        .prepare(
          `SELECT id, created_at, updated_at, title, workspace_root, system_prompt, model,
                  parent_session_id, active
             FROM sessions WHERE id = ?`,
        )
        .get(id) as SessionRow | undefined,
  );
}

function messageRows(sessionId: string): unknown[] {
  return withRawDb((db) =>
    db
      .prepare(
        `SELECT id, session_id, seq, role, timestamp, body, active
           FROM messages WHERE session_id = ? ORDER BY seq`,
      )
      .all(sessionId),
  );
}

function countSessions(): number {
  return withRawDb(
    (db) => (db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number }).n,
  );
}

function countMessagesWithId(messageId: string): number {
  return withRawDb(
    (db) =>
      (
        db.prepare("SELECT COUNT(*) AS n FROM messages WHERE id = ?").get(messageId) as {
          n: number;
        }
      ).n,
  );
}

function childrenOf(parentId: string): string[] {
  return withRawDb((db) =>
    (
      db
        .prepare("SELECT id FROM sessions WHERE parent_session_id = ? ORDER BY id")
        .all(parentId) as { id: string }[]
    ).map((row) => row.id),
  );
}

/** 접두를 지정해 세션을 만든다 — `createSession`은 UUID를 발급하므로 충돌을 만들 수 없다 */
function insertDecoySharingPrefix(prefix: string): string {
  const id = `${prefix}-0000-4000-8000-00000000dec0`;
  const now = Date.now();
  withRawDb((db) =>
    db
      .prepare(
        `INSERT INTO sessions
           (id, created_at, updated_at, title, workspace_root, system_prompt, model, parent_session_id, active)
         VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, 1)`,
      )
      .run(id, now, now, workspaceRoot, SYSTEM_PROMPT, MODEL),
  );
  return id;
}

beforeEach(() => {
  sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-qab-branch-")));
  home = join(sandbox, "home");
  workspaceRoot = join(sandbox, "ws");
  mkdirSync(home, { recursive: true });
  mkdirSync(workspaceRoot, { recursive: true });
  store = openSessionStore({ home, onWarning: () => {} });
});

afterEach(() => {
  try {
    store.close();
  } catch {
    /* 이미 닫힘 */
  }
  rmSync(sandbox, { recursive: true, force: true });
});

/** 4턴짜리 부모 세션과 그 트랜스크립트 — 대부분의 케이스가 공유하는 준비 */
async function makeParent(): Promise<{ parentId: string; messages: AgentMessage[] }> {
  const parentId = newSession();
  await recordTurns(parentId, 4);
  return { parentId, messages: store.loadSession(parentId, context()).messages };
}

// ═══════════════════════════════════════════════════════════════════════════
// 0. 선행 조건
// ═══════════════════════════════════════════════════════════════════════════

describe("선행 조건 (SESSION-STORE §5)", () => {
  /** 아래 단정들이 "메서드가 없어서" 통과하는 공허한 초록불이 되지 않게 하는 보증 */
  it("SessionStore.branchSession이 존재한다", () => {
    expect(typeof (store as BranchStore).branchSession).toBe("function");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. 자식 세션 행
// ═══════════════════════════════════════════════════════════════════════════

describe("자식 세션 행 (SESSION-STORE §5 · COMPACTION §6)", () => {
  it("parent_session_id에 부모 id가 실린다", async () => {
    const { parentId, messages } = await makeParent();

    const child = branchSession(parentId, {
      summaryMessage: summaryMessage(),
      keptMessages: messages.slice(-4),
      systemPrompt: SYSTEM_PROMPT,
      model: MODEL,
    });

    expect(child.parentSessionId).toBe(parentId);
    expect(sessionRow(child.id)?.parent_session_id).toBe(parentId);
  });

  it("자식 id는 새로 발급된다 — 부모를 덮어쓰지 않는다", async () => {
    const { parentId, messages } = await makeParent();

    const child = branchSession(parentId, {
      summaryMessage: summaryMessage(),
      keptMessages: messages.slice(-4),
      systemPrompt: SYSTEM_PROMPT,
      model: MODEL,
    });

    expect(child.id).not.toBe(parentId);
    expect(sessionRow(parentId)).toBeDefined();
    expect(countSessions()).toBe(2);
  });

  it("workspace_root는 부모에서 복사한다", async () => {
    const { parentId, messages } = await makeParent();

    const child = branchSession(parentId, {
      summaryMessage: summaryMessage(),
      keptMessages: messages.slice(-4),
      systemPrompt: SYSTEM_PROMPT,
      model: MODEL,
    });

    expect(child.workspaceRoot).toBe(workspaceRoot);
    expect(sessionRow(child.id)?.workspace_root).toBe(sessionRow(parentId)?.workspace_root);
  });

  /**
   * §5: "첫 UserMessage 자동 제목 규칙을 적용하면 제목이 요약문이 되므로 이 경로에서는
   * 쓰지 않는다." 자식의 첫 메시지는 요약이므로, 규칙이 새면 목록에 요약문이 뜬다 —
   * 사용자가 `/sessions`에서 대화를 알아볼 수 없게 되는 관측 가능한 결과다.
   */
  it("title은 부모에서 복사한다 — 요약문이 제목이 되지 않는다", async () => {
    const { parentId, messages } = await makeParent();
    const parentTitle = sessionRow(parentId)?.title;
    expect(parentTitle).toBe("질문 1");

    const child = branchSession(parentId, {
      summaryMessage: summaryMessage("이 문장이 제목이 되면 위반이다"),
      keptMessages: messages.slice(-4),
      systemPrompt: SYSTEM_PROMPT,
      model: MODEL,
    });

    expect(child.title).toBe(parentTitle);
    expect(sessionRow(child.id)?.title).toBe(parentTitle);
  });

  it("systemPrompt·model은 인자로 받은 값이다 — 부모 복사가 아니다", async () => {
    const { parentId, messages } = await makeParent();

    const child = branchSession(parentId, {
      summaryMessage: summaryMessage(),
      keptMessages: messages.slice(-4),
      systemPrompt: "새 시스템 프롬프트",
      model: "model-y",
    });

    expect(child.systemPrompt).toBe("새 시스템 프롬프트");
    expect(child.model).toBe("model-y");
    const row = sessionRow(child.id);
    expect(row?.system_prompt).toBe("새 시스템 프롬프트");
    expect(row?.model).toBe("model-y");
  });

  it("자식 세션은 active = 1이다 — 만들자마자 목록에 있다", async () => {
    const { parentId, messages } = await makeParent();

    const child = branchSession(parentId, {
      summaryMessage: summaryMessage(),
      keptMessages: messages.slice(-4),
      systemPrompt: SYSTEM_PROMPT,
      model: MODEL,
    });

    expect(sessionRow(child.id)?.active).toBe(1);
    expect(store.listSessions().map((session) => session.id)).toContain(child.id);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. 자식 트랜스크립트 — 요약 seq 1 + 같은 id 복사
// ═══════════════════════════════════════════════════════════════════════════

describe("자식 트랜스크립트 (SESSION-STORE §5 · COMPACTION §2)", () => {
  it("요약이 seq 1이고 유지 메시지가 배열 순서대로 2..N+1이다", async () => {
    const { parentId, messages } = await makeParent();
    const kept = messages.slice(-4);
    const summary = summaryMessage();

    const child = branchSession(parentId, {
      summaryMessage: summary,
      keptMessages: kept,
      systemPrompt: SYSTEM_PROMPT,
      model: MODEL,
    });

    const rows = messageRows(child.id) as { id: string; seq: number }[];
    expect(rows.map((row) => ({ id: row.id, seq: row.seq }))).toEqual([
      { id: summary.id, seq: 1 },
      { id: kept[0]?.id, seq: 2 },
      { id: kept[1]?.id, seq: 3 },
      { id: kept[2]?.id, seq: 4 },
      { id: kept[3]?.id, seq: 5 },
    ]);
  });

  /**
   * COMPACTION §2: "유지 메시지를 **같은 id로** 자식 세션에 복사한다 … 메시지 동일성
   * 보존이다 — 저장소 플랜 V-1 판정('이미 영속화한 id를 조용히 바꾸면 동일성이
   * 깨진다')과 같은 방향." id 재발급은 명시적으로 기각된 선택지다.
   */
  it("유지 메시지의 id가 부모의 것 그대로다 — 재발급하지 않는다", async () => {
    const { parentId, messages } = await makeParent();
    const kept = messages.slice(-4);

    const child = branchSession(parentId, {
      summaryMessage: summaryMessage(),
      keptMessages: kept,
      systemPrompt: SYSTEM_PROMPT,
      model: MODEL,
    });

    const childIds = (messageRows(child.id) as { id: string }[]).map((row) => row.id).slice(1);
    expect(childIds).toEqual(kept.map((message) => message.id));

    // 같은 id가 두 세션에 존재한다 — v2 PK가 이것을 위해 존재한다.
    for (const message of kept) {
      expect(countMessagesWithId(message.id)).toBe(2);
    }
  });

  it("loadSession(자식)이 [요약, ...kept]를 순서·id 보존해 돌려준다", async () => {
    const { parentId, messages } = await makeParent();
    const kept = messages.slice(-4);
    const summary = summaryMessage();

    const child = branchSession(parentId, {
      summaryMessage: summary,
      keptMessages: kept,
      systemPrompt: SYSTEM_PROMPT,
      model: MODEL,
    });

    const loaded = store.loadSession(child.id, context());
    expect(loaded.messages).toEqual([summary, ...kept]);
    expect(loaded.session.parentSessionId).toBe(parentId);
  });

  /**
   * COMPACTION §2: "자식 세션은 자기완결이다 … 부모의 손상·soft-delete·(미래의)
   * 물리 삭제가 자식에 영향을 주지 않고, `loadSession`·손상 검증의 범위가 세션
   * 하나로 닫힌 채 유지된다."
   */
  it("부모를 soft-delete해도 자식 트랜스크립트가 그대로다 — 자기완결", async () => {
    const { parentId, messages } = await makeParent();
    const kept = messages.slice(-4);
    const summary = summaryMessage();
    const child = branchSession(parentId, {
      summaryMessage: summary,
      keptMessages: kept,
      systemPrompt: SYSTEM_PROMPT,
      model: MODEL,
    });

    store.deleteSession(parentId);

    expect(store.loadSession(child.id, context()).messages).toEqual([summary, ...kept]);
  });

  it("분기 후 자식에 이어 쓰면 seq가 이어진다 — 요약 자리가 재사용되지 않는다", async () => {
    const { parentId, messages } = await makeParent();
    const kept = messages.slice(-4);
    const child = branchSession(parentId, {
      summaryMessage: summaryMessage(),
      keptMessages: kept,
      systemPrompt: SYSTEM_PROMPT,
      model: MODEL,
    });

    await recordTurns(child.id, 1);

    const seqs = (messageRows(child.id) as { seq: number }[]).map((row) => row.seq);
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. 과거를 고쳐 쓰지 않는다
// ═══════════════════════════════════════════════════════════════════════════

describe("부모는 무변경이다 (COMPACTION 머리 전제)", () => {
  /**
   * COMPACTION 머리: "구 세션의 행은 **단 하나도 변경·삭제되지 않으며**". `updated_at`
   * 갱신도 변경이다 — `listSessions`가 그 컬럼으로 정렬하므로 갱신되면 목록 의미가
   * "마지막 대화 시각"에서 어긋난다(`deleteSession`의 U-5 판정과 같은 근거).
   */
  it("부모 세션 행이 전 컬럼 그대로다 (updated_at 포함)", async () => {
    const { parentId, messages } = await makeParent();
    const before = sessionRow(parentId);

    branchSession(parentId, {
      summaryMessage: summaryMessage(),
      keptMessages: messages.slice(-4),
      systemPrompt: SYSTEM_PROMPT,
      model: MODEL,
    });

    expect(sessionRow(parentId)).toEqual(before);
  });

  it("부모 메시지 행이 전 컬럼 그대로다 — 복사가 원본을 옮기지 않는다", async () => {
    const { parentId, messages } = await makeParent();
    const before = messageRows(parentId);
    expect(before).toHaveLength(8);

    branchSession(parentId, {
      summaryMessage: summaryMessage(),
      keptMessages: messages.slice(-4),
      systemPrompt: SYSTEM_PROMPT,
      model: MODEL,
    });

    expect(messageRows(parentId)).toEqual(before);
  });

  it("부모의 active는 건드리지 않는다 — superseded는 구조적 사실이지 soft-delete가 아니다", async () => {
    const { parentId, messages } = await makeParent();

    branchSession(parentId, {
      summaryMessage: summaryMessage(),
      keptMessages: messages.slice(-4),
      systemPrompt: SYSTEM_PROMPT,
      model: MODEL,
    });

    expect(sessionRow(parentId)?.active).toBe(1);
  });

  it("부모를 전체 id로 loadSession하면 원본 트랜스크립트가 그대로 나온다", async () => {
    const { parentId, messages } = await makeParent();

    branchSession(parentId, {
      summaryMessage: summaryMessage(),
      keptMessages: messages.slice(-4),
      systemPrompt: SYSTEM_PROMPT,
      model: MODEL,
    });

    expect(store.loadSession(parentId, context()).messages).toEqual(messages);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 실측 3 — 원자성 (한 트랜잭션)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * §6: "**`branchSession`은 한 트랜잭션이다.** 세션 행 + 요약 + 유지 복사가 전부
 * 반영되거나 전부 안 된다 — 반쯤 분기된 세션은 손상이다."
 *
 * 실패 주입은 **유지 메시지의 마지막 원소**에 넣는다. 세션 행과 요약, 그리고 앞선
 * 유지 메시지가 이미 삽입된 뒤에 실패해야 롤백이 실제로 검증되기 때문이다. 구현이
 * 트랜잭션 시작 전에 전량 직렬화·검증하는 형태여도 계약("전부 아니면 전무")은 같은
 * 단정으로 판정된다.
 *
 * 주입 방법 두 가지를 쓴다. 하나는 구현 세부에 의존할 수 있으므로 서로를 보완한다:
 *   (a) 비정수 `timestamp` — `bind.ts`의 `integerParam`이 막고, 우회하더라도
 *       STRICT가 "cannot store REAL value in INTEGER column"으로 막는다(bind.ts 실측표).
 *       **DB 자체가 거부하므로 구현이 어떤 쓰기 경로를 택하든 성립한다.**
 *   (b) 순환 참조 — `body`가 "AgentMessage JSON 전문"(§2)인 이상 직렬화를 반드시
 *       지나므로 `JSON.stringify`가 던진다.
 */
describe("실측 3 — 분기의 원자성 (COMPACTION §6)", () => {
  /** 부분 반영의 흔적을 한 자리에서 판정한다 */
  function expectNoTrace(parentId: string, summary: UserMessage): void {
    expect(childrenOf(parentId)).toEqual([]);
    expect(countMessagesWithId(summary.id)).toBe(0);
  }

  function nonIntegerTimestamp(base: AgentMessage): AgentMessage {
    return { ...base, timestamp: 1.5 } as AgentMessage;
  }

  function circular(base: AgentMessage): AgentMessage {
    const poisoned: Record<string, unknown> = { ...base };
    poisoned.self = poisoned;
    return poisoned as unknown as AgentMessage;
  }

  it("(a) 마지막 유지 메시지의 timestamp가 비정수면 자식 흔적이 하나도 없다", async () => {
    const { parentId, messages } = await makeParent();
    const kept = messages.slice(-4);
    const summary = summaryMessage();
    const sessionsBefore = countSessions();
    const parentBefore = { session: sessionRow(parentId), messages: messageRows(parentId) };

    expectRejects(() =>
      branchSession(parentId, {
        summaryMessage: summary,
        keptMessages: [...kept.slice(0, -1), nonIntegerTimestamp(kept[3] as AgentMessage)],
        systemPrompt: SYSTEM_PROMPT,
        model: MODEL,
      }),
    );

    expect(countSessions()).toBe(sessionsBefore);
    expectNoTrace(parentId, summary);
    // 부모는 무손상이다 — 실패한 분기가 원본을 건드리지 않는다.
    expect({ session: sessionRow(parentId), messages: messageRows(parentId) }).toEqual(
      parentBefore,
    );
  });

  it("(b) 마지막 유지 메시지가 직렬화 불가면 자식 흔적이 하나도 없다", async () => {
    const { parentId, messages } = await makeParent();
    const kept = messages.slice(-4);
    const summary = summaryMessage();
    const sessionsBefore = countSessions();
    const parentBefore = { session: sessionRow(parentId), messages: messageRows(parentId) };

    expectRejects(() =>
      branchSession(parentId, {
        summaryMessage: summary,
        keptMessages: [...kept.slice(0, -1), circular(kept[3] as AgentMessage)],
        systemPrompt: SYSTEM_PROMPT,
        model: MODEL,
      }),
    );

    expect(countSessions()).toBe(sessionsBefore);
    expectNoTrace(parentId, summary);
    expect({ session: sessionRow(parentId), messages: messageRows(parentId) }).toEqual(
      parentBefore,
    );
  });

  it("실패한 분기 뒤에도 부모는 목록·해석에 남는다 — superseded 표시가 새지 않는다", async () => {
    const { parentId, messages } = await makeParent();
    const kept = messages.slice(-4);

    expectRejects(() =>
      branchSession(parentId, {
        summaryMessage: summaryMessage(),
        keptMessages: [...kept.slice(0, -1), nonIntegerTimestamp(kept[3] as AgentMessage)],
        systemPrompt: SYSTEM_PROMPT,
        model: MODEL,
      }),
    );

    expect(store.listSessions().map((session) => session.id)).toContain(parentId);
    expect(store.resolveSessionId(parentId)).toBe(parentId);
  });

  it("실패 후 같은 인자로 다시 분기하면 정상 성공한다 — 실패가 상태를 오염시키지 않는다", async () => {
    const { parentId, messages } = await makeParent();
    const kept = messages.slice(-4);
    const summary = summaryMessage();

    expectRejects(() =>
      branchSession(parentId, {
        summaryMessage: summary,
        keptMessages: [...kept.slice(0, -1), nonIntegerTimestamp(kept[3] as AgentMessage)],
        systemPrompt: SYSTEM_PROMPT,
        model: MODEL,
      }),
    );

    const child = branchSession(parentId, {
      summaryMessage: summary,
      keptMessages: kept,
      systemPrompt: SYSTEM_PROMPT,
      model: MODEL,
    });

    expect(store.loadSession(child.id, context()).messages).toEqual([summary, ...kept]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. superseded 제외 — 목록·접두 해석
// ═══════════════════════════════════════════════════════════════════════════

describe("superseded 부모 제외 (SESSION-STORE §5 · COMPACTION §6)", () => {
  /**
   * §5: "다른 세션의 `parent_session_id`로 참조되는 세션은 압축으로 대체된 것이며,
   * `listSessions`·`resolveSessionId`에서 제외한다." §6의 근거: "같은 대화가
   * `/sessions`에 두 줄로 보이면 어느 쪽을 재개해야 하는지가 사용자 문제가 된다."
   */
  it("분기 후 부모가 listSessions에서 빠지고 자식만 남는다", async () => {
    const { parentId, messages } = await makeParent();

    const child = branchSession(parentId, {
      summaryMessage: summaryMessage(),
      keptMessages: messages.slice(-4),
      systemPrompt: SYSTEM_PROMPT,
      model: MODEL,
    });

    const ids = store.listSessions().map((session) => session.id);
    expect(ids).toContain(child.id);
    expect(ids).not.toContain(parentId);
  });

  it("무관한 세션은 영향받지 않는다", async () => {
    const untouched = newSession();
    const { parentId, messages } = await makeParent();

    const child = branchSession(parentId, {
      summaryMessage: summaryMessage(),
      keptMessages: messages.slice(-4),
      systemPrompt: SYSTEM_PROMPT,
      model: MODEL,
    });

    expect(
      store
        .listSessions()
        .map((session) => session.id)
        .sort(),
    ).toEqual([untouched, child.id].sort());
  });

  it("부모는 resolveSessionId의 매칭 후보에서 빠진다", async () => {
    const { parentId, messages } = await makeParent();
    expect(store.resolveSessionId(parentId)).toBe(parentId);

    branchSession(parentId, {
      summaryMessage: summaryMessage(),
      keptMessages: messages.slice(-4),
      systemPrompt: SYSTEM_PROMPT,
      model: MODEL,
    });

    expectRejects(() => store.resolveSessionId(parentId));
  });

  /**
   * "제외"는 **후보에서 빠지는 것**이지 결과를 사후에 걸러내는 것이 아니다.
   * 사후 필터로 구현하면 모호 판정(`resolveSessionId`가 후보 2건을 세는 지점)이
   * 오작동한다 — superseded 부모 때문에 살아 있는 세션 하나가 "모호"로 거부된다.
   */
  it("접두를 공유하던 부모가 빠지면 남은 세션이 유일해진다 — 모호 판정이 오작동하지 않는다", async () => {
    const { parentId, messages } = await makeParent();
    const prefix = parentId.slice(0, 8);
    const decoy = insertDecoySharingPrefix(prefix);

    // 분기 전에는 두 세션이 접두를 공유하므로 모호하다.
    expectRejects(() => store.resolveSessionId(prefix));

    branchSession(parentId, {
      summaryMessage: summaryMessage(),
      keptMessages: messages.slice(-4),
      systemPrompt: SYSTEM_PROMPT,
      model: MODEL,
    });

    expect(store.resolveSessionId(prefix)).toBe(decoy);
  });

  /** 같은 이유로 `limit`도 superseded를 세지 않는다 — 제외는 조회 조건이다 */
  it("listSessions(limit)이 superseded 부모로 자리를 소비하지 않는다", async () => {
    const other = newSession();
    const { parentId, messages } = await makeParent();
    const child = branchSession(parentId, {
      summaryMessage: summaryMessage(),
      keptMessages: messages.slice(-4),
      systemPrompt: SYSTEM_PROMPT,
      model: MODEL,
    });

    const listed = store.listSessions(2).map((session) => session.id);
    expect(listed.sort()).toEqual([other, child.id].sort());
  });

  /**
   * §5: "자식의 `active` 여부와 무관 — **대체는 구조적 사실이라 자식을 soft-delete해도
   * 부모가 목록에 재등장하지 않는다**." 재등장하면 사용자는 지운 대화의 옛 판본을
   * 되살아난 것으로 보게 된다.
   */
  it("자식을 soft-delete해도 부모가 목록에 재등장하지 않는다", async () => {
    const { parentId, messages } = await makeParent();
    const child = branchSession(parentId, {
      summaryMessage: summaryMessage(),
      keptMessages: messages.slice(-4),
      systemPrompt: SYSTEM_PROMPT,
      model: MODEL,
    });

    store.deleteSession(child.id);

    const ids = store.listSessions().map((session) => session.id);
    expect(ids).not.toContain(parentId);
    expect(ids).not.toContain(child.id);
  });

  it("자식을 soft-delete해도 부모가 resolveSessionId에 재등장하지 않는다", async () => {
    const { parentId, messages } = await makeParent();
    const child = branchSession(parentId, {
      summaryMessage: summaryMessage(),
      keptMessages: messages.slice(-4),
      systemPrompt: SYSTEM_PROMPT,
      model: MODEL,
    });

    store.deleteSession(child.id);

    expectRejects(() => store.resolveSessionId(parentId));
  });

  /** §5: "전체 id로의 `loadSession`은 열린다 — soft-delete와 같은 '목록 제외 ≠ 접근 봉쇄'" */
  it("superseded 부모도 전체 id로는 loadSession이 열린다", async () => {
    const { parentId, messages } = await makeParent();
    branchSession(parentId, {
      summaryMessage: summaryMessage(),
      keptMessages: messages.slice(-4),
      systemPrompt: SYSTEM_PROMPT,
      model: MODEL,
    });

    const loaded = store.loadSession(parentId, context());
    expect(loaded.session.id).toBe(parentId);
    expect(loaded.messages).toEqual(messages);
  });

  /** 반복 압축(COMPACTION §5) — 체인이 3단이 되면 중간도 superseded다 */
  it("체인 3단: 손자를 만들면 자식도 목록에서 빠진다", async () => {
    const { parentId, messages } = await makeParent();
    const child = branchSession(parentId, {
      summaryMessage: summaryMessage("1차 요약"),
      keptMessages: messages.slice(-4),
      systemPrompt: SYSTEM_PROMPT,
      model: MODEL,
    });

    const childMessages = store.loadSession(child.id, context()).messages;
    const grandchild = branchSession(child.id, {
      summaryMessage: summaryMessage("2차 요약"),
      keptMessages: childMessages.slice(-2),
      systemPrompt: SYSTEM_PROMPT,
      model: MODEL,
    });

    expect(store.listSessions().map((session) => session.id)).toEqual([grandchild.id]);
    expect(sessionRow(grandchild.id)?.parent_session_id).toBe(child.id);
    expect(sessionRow(child.id)?.parent_session_id).toBe(parentId);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * [미규정 B-n] 판정 요청 — 이 파일이 임의로 정하지 않은 것
 *
 * 보고는 유실될 수 있으므로 여기에 남긴다. 아래는 **테스트로 고정하지 않았다** —
 * 기대값이 정본에 없기 때문이고, 지금 현재 동작을 기술해 두면 그것이 사후적으로
 * 계약이 되어 버린다. B-1~B-3은 `schema-v2.contract.test.ts` 말미에 있다.
 *
 * ── B-4 (플랜이 [미규정 E-2x]로 함께 배치): `parentId`가 존재하지 않을 때 ────────
 *   §5·§6 어느 쪽도 정하지 않는다. `sessions.parent_session_id`의 FK가 켜져 있으므로
 *   (§6 PRAGMA) 실패 자체는 구조적으로 보장되지만, **에러의 형태**(FK 위반이 그대로
 *   새는가, 저장소가 진단 가능한 메시지로 감싸는가)는 미규정이다. 위 원자성 테스트는
 *   실패 주입에 이 경로를 쓰지 않았다 — 미규정 영역을 테스트로 강제하지 않기 위해서다.
 *
 * ── B-5: `parentId`가 이미 superseded인 세션일 때 ───────────────────────────────
 *   즉 체인 중간에서 다시 분기하는 경우. 한 부모가 자식 둘을 갖게 되어 체인이
 *   분기 트리가 된다. §5의 superseded 판정("다른 세션의 parent_session_id로
 *   참조되는")은 자식 수를 세지 않으므로 부모 제외는 그대로 성립하지만, 형제 둘이
 *   모두 목록에 남는다("같은 대화가 두 줄로 보인다" — §6이 막으려던 바로 그 형상).
 *   거부할지 허용할지 판정이 필요하다.
 *
 * ── B-6: `parentId`가 `active = 0`(soft-delete된) 세션일 때 ────────────────────
 *   §5는 soft-delete를 "목록·접두 해석에서의 제외"로만 규정하고 분기 가능 여부는
 *   말하지 않는다. 허용하면 지운 대화에서 살아 있는 자식이 태어난다.
 *
 * ── B-7: `keptMessages`가 빈 배열일 때 ─────────────────────────────────────────
 *   요약만 실린 자식이 만들어진다. COMPACTION §4의 `planCompaction`이 이 형상을
 *   만들 수 있는지가 선행 질문이고(cut이 마지막 user 경계이므로 최소 1개는 남을
 *   것으로 보이나 계약이 명시하지 않는다), 저장소 계약 자체는 별개로 정해져야 한다.
 *
 * ── B-8: `summaryMessage.id`가 `keptMessages` 중 하나와 충돌할 때 ──────────────
 *   v2 PK가 `(session_id, id)`이므로 자식 세션 안에서 충돌이다. 구현이
 *   `INSERT OR IGNORE`를 쓰면 **조용히 한 건이 사라지고** 자식 트랜스크립트가 짧아진다
 *   (침묵 유실 — ARCHITECTURE §2.6). 일반 INSERT면 예외이고 원자성 규정에 따라
 *   전량 롤백이다. 정상 경로에서는 `createUserMessage`가 새 UUID를 발급하므로
 *   발생하지 않지만, **어느 쪽인지가 정해져야 `keptMessages` 내부의 중복 id 처리도
 *   함께 결정된다.**
 *
 * ── B-9: `keptMessages`에 부모에 없는 메시지가 섞였을 때 ────────────────────────
 *   §5는 "부모에서 id 그대로"라고 쓰지만 저장소가 그것을 검증하는지는 정하지 않는다.
 *   검증하지 않는 쪽이 §5의 태도("저장소는 코어가 보장한 것을 재검증하지 않는다")와
 *   결이 같으나, 그 절은 도구 짝 정합성에 대한 규정이라 그대로 적용할지 판정이 필요하다.
 *
 * ── B-10: 복사된 유지 메시지의 `messages.active` 값 ────────────────────────────
 *   위 테스트는 `loadSession`이 `[요약, ...kept]`를 돌려주는 것으로 **간접 고정**만
 *   했다(§5의 `active = 1` 반환 규정에 따라 1이어야 관측이 성립). 부모에서 이미
 *   `active = 0`인 행이 `keptMessages`에 섞여 들어오는 경우(정상 경로에서는
 *   `loadSession`이 걸러내므로 발생하지 않는다)의 처리는 미규정이다.
 *
 * ── B-11: 자식 세션의 `created_at`·`updated_at` ────────────────────────────────
 *   부모 복사인지 분기 시각인지 §5가 정하지 않는다. `listSessions`가 `updated_at DESC`
 *   정렬이므로 부모 복사를 택하면 방금 만든 자식이 목록 아래에 묻힐 수 있다. 위
 *   테스트는 두 값을 단정하지 않는다.
 * ═══════════════════════════════════════════════════════════════════════════ */
