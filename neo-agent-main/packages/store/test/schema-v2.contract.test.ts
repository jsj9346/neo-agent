/**
 * 스키마 v2 마이그레이션 — `messages` PK `id` → `(session_id, id)` (QA-B).
 *
 * **이 파일은 구현보다 먼저 쓰였다.** T-004(Store Eng)가 착수하기 전에 계약을
 * 고정하는 것이 목적이며, 작성 시점에는 전부 빨간불(`LATEST_SCHEMA_VERSION`이 아직
 * 1이므로 타입이 아니라 값 단정에서 실패)인 것이 정상이다.
 *
 * 기대값의 출처:
 *   - `docs/SESSION-STORE.md` §2 "스키마 v2" — PK 변경, 테이블 재생성 복사,
 *     한 트랜잭션, `INSERT OR IGNORE`의 멱등 범위가 **세션 내**로 축소
 *   - `docs/SESSION-STORE.md` §2 "마이그레이션 규율" — 앞으로만·트랜잭션 하나·
 *     **DB 버전이 코드 최신보다 높으면 거부**
 *   - `docs/COMPACTION.md` §2 — 자식 세션이 유지 메시지를 **같은 id로** 복사하는 것이
 *     PK 변경의 이유(= 세션 간 같은 id INSERT가 성공해야 한다는 요구의 출처)
 *
 * ── v1 DDL을 왜 동결 복사했는가 ────────────────────────────────────────────
 * 실측 1(왕복)은 **v1 스키마의 실데이터 DB**를 만들어 마이그레이션을 통과시켜야
 * 한다. 그런데 v2가 들어오면 `src/schema.sql.ts`의 `SCHEMA_V1`을 임포트해 쓰더라도
 * 그것은 "현행 코드가 만드는 v1"이지 **과거 사용자 디스크에 있는 v1**이라는 보장이
 * 없고, 구현자가 v2 작업 중 그 상수를 손대면 픽스처가 조용히 따라 바뀌어 **왕복
 * 검증이 자기 자신을 검증하는 동어반복**이 된다. 그래서 아래 `SCHEMA_V1_FROZEN`은
 * 2026-08-06 시점 `packages/store/src/schema.sql.ts`의 `SCHEMA_V1`을 **raw SQL로
 * 복사해 동결한 것**이며, 앞으로 구현이 무엇을 바꾸든 여기는 바뀌지 않는다.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * 판정 기준: **원인 쪽이 미규정이어도 문서가 금지한 결과가 나오면 위반이다.**
 * 회색지대는 임의 판정하지 않고 파일 말미의 `[미규정 B-n]` 블록에 모았다.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AgentMessage } from "@neo-agent/core";
import {
  appendMessage,
  LATEST_SCHEMA_VERSION,
  openDatabase,
  openSessionStore,
  readSchemaVersion,
} from "@neo-agent/store";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// ───────────────────────────────────────────────────────────────────────────
// 동결된 v1 DDL — 2026-08-06 `src/schema.sql.ts`의 `SCHEMA_V1` 복사본.
// **구현을 따라 갱신하지 않는다.** 여기가 바뀌면 왕복 검증의 의미가 사라진다.
// ───────────────────────────────────────────────────────────────────────────

const SCHEMA_V1_FROZEN = `
CREATE TABLE schema_version (
  version    INTEGER NOT NULL,
  applied_at INTEGER NOT NULL
) STRICT;

CREATE TABLE sessions (
  id                TEXT    PRIMARY KEY,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  title             TEXT,
  workspace_root    TEXT    NOT NULL,
  system_prompt     TEXT    NOT NULL,
  model             TEXT    NOT NULL,
  parent_session_id TEXT    REFERENCES sessions(id),
  active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
) STRICT;

CREATE TABLE messages (
  id         TEXT    PRIMARY KEY,
  session_id TEXT    NOT NULL REFERENCES sessions(id),
  seq        INTEGER NOT NULL,
  role       TEXT    NOT NULL,
  timestamp  INTEGER NOT NULL,
  body       TEXT    NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
) STRICT;

CREATE UNIQUE INDEX messages_session_seq   ON messages(session_id, seq);
CREATE INDEX        messages_session_order ON messages(session_id, active, seq);
CREATE INDEX        sessions_recent        ON sessions(active, updated_at DESC);
`;

// ───────────────────────────────────────────────────────────────────────────
// 픽스처 — v1 시절 실데이터. 세션 3개(활성 2 + soft-delete 1), 역할 3종 혼합,
// 비활성 메시지 1건 포함.
// ───────────────────────────────────────────────────────────────────────────

const SESSION_A = "aaaa1111-0000-4000-8000-000000000001";
const SESSION_B = "bbbb2222-0000-4000-8000-000000000002";
const SESSION_C = "cccc3333-0000-4000-8000-000000000003";

const SYSTEM_PROMPT = "SP";
const MODEL = "model-x";

const usage = { input: 10, output: 20, cacheRead: 0, cacheWrite: 0 };

function userBody(id: string, text: string, timestamp: number): AgentMessage {
  return { id, role: "user", content: [{ type: "text", text }], timestamp };
}

function assistantBody(id: string, text: string, timestamp: number): AgentMessage {
  return {
    id,
    role: "assistant",
    content: [{ type: "text", text }],
    stopReason: "end_turn",
    usage,
    timestamp,
  };
}

function assistantWithToolCall(id: string, timestamp: number): AgentMessage {
  return {
    id,
    role: "assistant",
    content: [
      { type: "text", text: "파일을 읽는다" },
      { type: "toolCall", toolCallId: "call-1", toolName: "read", args: { path: "/tmp/x" } },
    ],
    stopReason: "tool_use",
    usage,
    timestamp,
  };
}

function toolResultBody(id: string, timestamp: number): AgentMessage {
  return {
    id,
    role: "toolResult",
    toolCallId: "call-1",
    toolName: "read",
    content: [{ type: "text", text: "파일 내용" }],
    isError: false,
    source: "local",
    timestamp,
  };
}

interface MessageFixture {
  sessionId: string;
  seq: number;
  active: number;
  message: AgentMessage;
}

/** 배열 순서가 곧 삽입 순서다 — seq는 여기 적힌 값이 진실이고 재발급되지 않는다 */
const MESSAGE_FIXTURES: readonly MessageFixture[] = [
  { sessionId: SESSION_A, seq: 1, active: 1, message: userBody("m-a1", "첫 질문", 1100) },
  { sessionId: SESSION_A, seq: 2, active: 1, message: assistantWithToolCall("m-a2", 1200) },
  { sessionId: SESSION_A, seq: 3, active: 1, message: toolResultBody("m-a3", 1300) },
  { sessionId: SESSION_A, seq: 4, active: 1, message: userBody("m-a4", "두 번째 질문", 1400) },
  { sessionId: SESSION_A, seq: 5, active: 1, message: assistantBody("m-a5", "두 번째 답", 1500) },
  // 비활성 행 — `loadSession`은 제외하지만 마이그레이션은 보존해야 한다.
  { sessionId: SESSION_A, seq: 6, active: 0, message: userBody("m-a6", "지운 발화", 1600) },
  { sessionId: SESSION_B, seq: 1, active: 1, message: userBody("m-b1", "B의 질문", 2100) },
  { sessionId: SESSION_B, seq: 2, active: 1, message: assistantBody("m-b2", "B의 답", 2200) },
  { sessionId: SESSION_C, seq: 1, active: 1, message: userBody("m-c1", "C의 질문", 3100) },
  { sessionId: SESSION_C, seq: 2, active: 1, message: assistantBody("m-c2", "C의 답", 3200) },
];

/** `loadSession`이 돌려줘야 하는 것 = active = 1인 행을 seq 순으로 */
function expectedMessages(sessionId: string): AgentMessage[] {
  return MESSAGE_FIXTURES.filter(
    (fixture) => fixture.sessionId === sessionId && fixture.active === 1,
  ).map((fixture) => fixture.message);
}

// ───────────────────────────────────────────────────────────────────────────
// 하네스
// ───────────────────────────────────────────────────────────────────────────

let sandbox: string;
let home: string;
let workspaceRoot: string;

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

/**
 * 동결된 v1 DDL로 실데이터 DB를 만든다. **저장소 코드를 전혀 지나지 않는다** —
 * v2가 들어오면 현행 코드로는 v1 DB를 만들 수 없기 때문이다.
 */
function createV1Fixture(options: { schemaVersions?: readonly number[] } = {}): void {
  mkdirSync(join(home, ".neo-agent"), { recursive: true });
  const db = new DatabaseSync(dbPath());
  try {
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(SCHEMA_V1_FROZEN);

    for (const version of options.schemaVersions ?? [1]) {
      db.prepare("INSERT INTO schema_version (version, applied_at) VALUES (?, ?)").run(
        version,
        1_000,
      );
    }

    const insertSession = db.prepare(
      `INSERT INTO sessions
         (id, created_at, updated_at, title, workspace_root, system_prompt, model, parent_session_id, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    );
    insertSession.run(SESSION_A, 1_000, 5_000, "첫 세션", workspaceRoot, SYSTEM_PROMPT, MODEL, 1);
    insertSession.run(SESSION_B, 2_000, 7_000, null, workspaceRoot, SYSTEM_PROMPT, MODEL, 1);
    insertSession.run(SESSION_C, 3_000, 6_000, "지운 세션", workspaceRoot, SYSTEM_PROMPT, MODEL, 0);

    const insertMessage = db.prepare(
      `INSERT INTO messages (id, session_id, seq, role, timestamp, body, active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const fixture of MESSAGE_FIXTURES) {
      insertMessage.run(
        fixture.message.id,
        fixture.sessionId,
        fixture.seq,
        fixture.message.role,
        fixture.message.timestamp,
        JSON.stringify(fixture.message),
        fixture.active,
      );
    }
  } finally {
    db.close();
  }
}

interface RowSnapshot {
  sessions: unknown[];
  messages: unknown[];
}

/** 전 컬럼 스냅샷. 왕복 무손실의 판정 근거는 "우리가 기대한 값"이 아니라 이 diff다 */
function snapshotRows(): RowSnapshot {
  return withRawDb((db) => ({
    sessions: db
      .prepare(
        `SELECT id, created_at, updated_at, title, workspace_root, system_prompt, model,
                parent_session_id, active
           FROM sessions ORDER BY id`,
      )
      .all(),
    messages: db
      .prepare(
        `SELECT id, session_id, seq, role, timestamp, body, active
           FROM messages ORDER BY session_id, seq`,
      )
      .all(),
  }));
}

/**
 * 정본 테이블만. v3(`SEARCH.md` §2)부터 `messages_fts`와 fts5가 스스로 만드는 shadow
 * 테이블이 함께 존재하는데, 그 이름·개수는 fts5의 구현 세부라 열거하지 않는다 —
 * 열거하면 SQLite 버전이 바뀔 때 v2 계약이 무관한 이유로 깨진다. 이 헬퍼를 쓰는
 * 판정의 실질은 "v2의 테이블 재생성이 임시 테이블을 남기지 않았는가"이므로,
 * 검사 대상은 우리 DDL이 만든 것으로 충분하다.
 */
function tableNames(): string[] {
  return withRawDb((db) =>
    (
      db
        .prepare(
          `SELECT name FROM sqlite_master
            WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'messages_fts%'
            ORDER BY name`,
        )
        .all() as { name: string }[]
    ).map((row) => row.name),
  );
}

function indexNames(): string[] {
  return withRawDb((db) =>
    (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as { name: string }[]
    ).map((row) => row.name),
  );
}

/**
 * `.toThrow()`는 심볼 자체가 없을 때도 통과한다 — 미구현 상태에서 거부 단정이
 * 공허하게 초록불이 되는 것을 막는다(`store-gap.contract.test.ts`와 같은 헬퍼).
 */
function expectRejects(fn: () => unknown): Error {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  expect(String((caught as Error).message)).not.toMatch(/is not a function/);
  return caught as Error;
}

/** 마이그레이션을 태우고 즉시 닫는다 — 열기 자체가 마이그레이션의 트리거다 */
function openAndClose(): void {
  openSessionStore({ home, onWarning: () => {} }).close();
}

beforeEach(() => {
  sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-qab-v2-")));
  home = join(sandbox, "home");
  workspaceRoot = join(sandbox, "ws");
  mkdirSync(home, { recursive: true });
  mkdirSync(workspaceRoot, { recursive: true });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// 0. 버전 표면 — v2가 실제로 등록됐는가
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ── 왜 "최신 버전 == 2"를 단정하지 않는가 ─────────────────────────────────
 * 초판은 `LATEST_SCHEMA_VERSION`을 2로 못박았다. 그것은 v2가 최신이던 시점의
 * 우연을 계약으로 적은 것이라 **스키마가 하나 늘 때마다 v2 계약이 깨진다** —
 * v2가 무엇을 보장하는지와 무관한 이유로. 2026-08-07 v3(검색 인덱스) 도입에서
 * 실제로 그렇게 깨졌다.
 *
 * 이 파일의 주제는 "v2 마이그레이션이 존재하고 제 일을 하는가"다. 그래서 단정을
 * **v2 자신에 대한 사실**로 옮겼다: 사슬에 v2가 있고(`schema_version`에 2가 쌓인다),
 * v1 DB가 그것을 지나며, PK가 `(session_id, id)`로 바뀌고 데이터가 보존된다.
 * 최신 버전 숫자는 그때그때의 상한일 뿐 v2 계약의 내용이 아니다.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** `schema_version`은 이력 테이블이다(B-1) — 적용된 버전이 행으로 쌓인다 */
function appliedVersions(): number[] {
  return withRawDb((db) =>
    (
      db.prepare("SELECT version FROM schema_version ORDER BY version").all() as {
        version: number;
      }[]
    ).map((row) => row.version),
  );
}

describe("스키마 v2 등록 (SESSION-STORE §2)", () => {
  /**
   * 이 단정이 아래 전부의 선행 조건이다. 2 미만이면 v2 마이그레이션 자체가 없다는
   * 뜻이고, 이후 테스트의 실패는 "계약 위반"이 아니라 "미구현"으로 읽어야 한다.
   */
  it("LATEST_SCHEMA_VERSION이 최소 2다 — v2가 마이그레이션 사슬에 있다", () => {
    expect(LATEST_SCHEMA_VERSION).toBeGreaterThanOrEqual(2);
  });

  it("새로 만든 DB가 v2를 적용한 이력을 갖는다", () => {
    openAndClose();
    expect(appliedVersions()).toContain(2);
  });

  it("v1 DB를 열면 v2가 적용된다", () => {
    createV1Fixture();
    withRawDb((db) => {
      expect(readSchemaVersion(db)).toBe(1);
    });

    openAndClose();

    expect(appliedVersions()).toContain(2);
    withRawDb((db) => {
      expect(readSchemaVersion(db)).toBeGreaterThanOrEqual(2);
    });
  });

  /** 재실행은 no-op — 매 기동마다 지나는 경로다 */
  it("이미 최신인 DB를 다시 열어도 버전이 오르지 않는다", () => {
    createV1Fixture();
    openAndClose();
    const afterFirst = snapshotRows();
    const versionAfterFirst = withRawDb(readSchemaVersion);

    openAndClose();

    withRawDb((db) => {
      expect(readSchemaVersion(db)).toBe(versionAfterFirst);
    });
    expect(appliedVersions()).toContain(2);
    expect(snapshotRows()).toEqual(afterFirst);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 실측 1 — 왕복 (v1 실데이터가 마이그레이션을 지나 그대로 남는가)
// ═══════════════════════════════════════════════════════════════════════════

describe("실측 1 — v1 실데이터 왕복 (SESSION-STORE §2)", () => {
  /**
   * 판정의 핵심. 기대값을 손으로 쓰지 않고 **마이그레이션 전 스냅샷**과 비교한다 —
   * 손으로 쓴 기대값은 픽스처를 옮겨 적은 것이라 "픽스처가 픽스처와 같다"를
   * 검증하게 된다. 전 컬럼을 보므로 `active`·`title` NULL·`parent_session_id`까지
   * 포함된다.
   */
  it("모든 행이 전 컬럼 그대로 보존된다 (내용·seq·active)", () => {
    createV1Fixture();
    const before = snapshotRows();

    openAndClose();

    expect(snapshotRows()).toEqual(before);
  });

  it("정본 테이블은 여전히 3개다 — 재생성 임시 테이블이 남지 않는다", () => {
    createV1Fixture();
    openAndClose();
    // `messages_v2`(재생성 중간 산물)가 남았다면 여기서 드러난다.
    expect(tableNames()).toEqual(["messages", "schema_version", "sessions"]);
  });

  it("§2가 정한 인덱스 3개가 재생성 후에도 존재한다", () => {
    createV1Fixture();
    openAndClose();
    expect(indexNames()).toEqual(
      expect.arrayContaining(["messages_session_order", "messages_session_seq", "sessions_recent"]),
    );
  });

  it("messages의 컬럼 집합이 변하지 않는다 — PK만 바뀌고 컬럼은 그대로다", () => {
    createV1Fixture();
    openAndClose();
    const columns = withRawDb((db) =>
      (db.prepare("PRAGMA table_info(messages)").all() as { name: string }[]).map(
        (row) => row.name,
      ),
    );
    expect(columns.sort()).toEqual([
      "active",
      "body",
      "id",
      "role",
      "seq",
      "session_id",
      "timestamp",
    ]);
  });

  it("loadSession이 마이그레이션 전과 같은 메시지를 같은 순서로 돌려준다", () => {
    createV1Fixture();
    const store = openSessionStore({ home, onWarning: () => {} });
    try {
      const loaded = store.loadSession(SESSION_A, context());
      expect(loaded.messages).toEqual(expectedMessages(SESSION_A));
      expect(loaded.messages.map((message) => message.id)).toEqual([
        "m-a1",
        "m-a2",
        "m-a3",
        "m-a4",
        "m-a5",
      ]);
    } finally {
      store.close();
    }
  });

  it("loadSession은 마이그레이션 후에도 active = 0 메시지를 제외한다", () => {
    createV1Fixture();
    const store = openSessionStore({ home, onWarning: () => {} });
    try {
      const ids = store.loadSession(SESSION_A, context()).messages.map((message) => message.id);
      expect(ids).not.toContain("m-a6");
    } finally {
      store.close();
    }
  });

  it("역할 3종(user·assistant·toolResult)이 전부 왕복한다", () => {
    createV1Fixture();
    const store = openSessionStore({ home, onWarning: () => {} });
    try {
      const roles = store.loadSession(SESSION_A, context()).messages.map((m) => m.role);
      expect(roles).toEqual(["user", "assistant", "toolResult", "user", "assistant"]);
    } finally {
      store.close();
    }
  });

  it("listSessions 결과가 마이그레이션 전과 같다 (soft-delete 제외·최근 갱신 순)", () => {
    createV1Fixture();
    const store = openSessionStore({ home, onWarning: () => {} });
    try {
      // updated_at: B=7000 > A=5000. C는 active = 0이라 빠진다.
      expect(store.listSessions().map((session) => session.id)).toEqual([SESSION_B, SESSION_A]);
    } finally {
      store.close();
    }
  });

  it("soft-delete된 세션도 전체 id로는 여전히 열린다 (§5 — 목록 제외 ≠ 접근 봉쇄)", () => {
    createV1Fixture();
    const store = openSessionStore({ home, onWarning: () => {} });
    try {
      expect(store.loadSession(SESSION_C, context()).messages.map((m) => m.id)).toEqual([
        "m-c1",
        "m-c2",
      ]);
    } finally {
      store.close();
    }
  });

  /**
   * 마이그레이션이 seq를 재발급하면 여기서 걸린다 — 다음 메시지가 기존 번호와
   * 충돌하거나 구멍이 생긴다. `nextSeq`는 `active = 0` 행까지 세므로(§2) 다음은 7이다.
   */
  it("마이그레이션 후 이어 쓰면 seq가 MAX(seq)+1로 이어진다", () => {
    createV1Fixture();
    const db = openDatabase({ home, onWarning: () => {} });
    try {
      const appended = userBody("m-a7", "마이그레이션 후 발화", 9_000);
      expect(appendMessage(db, SESSION_A, appended)).toBe(true);

      const row = db
        .prepare("SELECT seq FROM messages WHERE id = ? AND session_id = ?")
        .get("m-a7", SESSION_A) as { seq: number };
      expect(row.seq).toBe(7);
    } finally {
      db.close();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 실측 2 — PK 충돌 (v2의 존재 이유)
// ═══════════════════════════════════════════════════════════════════════════

describe("실측 2 — PK가 (session_id, id)다 (SESSION-STORE §2 · COMPACTION §2)", () => {
  /**
   * **이것이 v2의 존재 이유다.** 압축 분기는 유지 메시지를 **같은 id로** 자식 세션에
   * 복사한다(COMPACTION §2 — 메시지 동일성 보존). v1 PK(`id` 단독)에서는 그 복사가
   * 통째로 불가능하므로, 이 케이스가 빠지면 마이그레이션 검증 전체가 헛돈다.
   */
  it("세션 간 같은 id INSERT가 성공한다", () => {
    createV1Fixture();
    const db = openDatabase({ home, onWarning: () => {} });
    try {
      // m-b1은 이미 SESSION_B에 있다. 같은 id를 SESSION_A에 복사한다.
      const copied = MESSAGE_FIXTURES.find((f) => f.message.id === "m-b1")?.message;
      expect(copied).toBeDefined();
      expect(appendMessage(db, SESSION_A, copied as AgentMessage)).toBe(true);

      const rows = db
        .prepare("SELECT session_id FROM messages WHERE id = ? ORDER BY session_id")
        .all("m-b1") as { session_id: string }[];
      expect(rows.map((row) => row.session_id)).toEqual([SESSION_A, SESSION_B]);
    } finally {
      db.close();
    }
  });

  it("세션 간 같은 id는 raw INSERT로도 거부되지 않는다 (API 우회 확인)", () => {
    createV1Fixture();
    openAndClose();
    withRawDb((db) => {
      expect(() =>
        db
          .prepare(
            "INSERT INTO messages (id, session_id, seq, role, timestamp, body, active) VALUES (?,?,?,?,?,?,1)",
          )
          .run("m-a1", SESSION_B, 99, "user", 1, "{}"),
      ).not.toThrow();
    });
  });

  /**
   * §2: "`INSERT OR IGNORE`의 멱등 범위도 **세션 내**로 좁아진다." 좁아진다는 것이지
   * 사라진다는 것이 아니다 — §4의 구독 계약(`agent_end`·`turn_end`를 실수로 함께
   * 구독해도 무해한 no-op)이 여기에 의존한다.
   */
  it("세션 내 같은 id는 INSERT OR IGNORE로 멱등하다 — 행이 늘지 않는다", () => {
    createV1Fixture();
    const db = openDatabase({ home, onWarning: () => {} });
    try {
      const existing = MESSAGE_FIXTURES.find((f) => f.message.id === "m-a1")?.message;
      expect(appendMessage(db, SESSION_A, existing as AgentMessage)).toBe(false);

      const row = db
        .prepare("SELECT COUNT(*) AS n FROM messages WHERE session_id = ? AND id = ?")
        .get(SESSION_A, "m-a1") as { n: number };
      expect(row.n).toBe(1);
    } finally {
      db.close();
    }
  });

  it("세션 내 같은 id는 일반 INSERT로는 거부된다 — 유일성이 유지된다", () => {
    createV1Fixture();
    openAndClose();
    withRawDb((db) => {
      expect(() =>
        db
          .prepare(
            "INSERT INTO messages (id, session_id, seq, role, timestamp, body, active) VALUES (?,?,?,?,?,?,1)",
          )
          .run("m-a1", SESSION_A, 98, "user", 1, "{}"),
      ).toThrow();
    });
  });

  /** 스키마 수준의 직접 확인 — 두 컬럼이 함께 PK를 이룬다 */
  it("PRAGMA table_info가 session_id·id를 복합 PK로 보고한다", () => {
    createV1Fixture();
    openAndClose();
    const pkColumns = withRawDb((db) =>
      (db.prepare("PRAGMA table_info(messages)").all() as { name: string; pk: number }[])
        .filter((row) => row.pk > 0)
        .sort((a, b) => a.pk - b.pk)
        .map((row) => row.name),
    );
    expect(pkColumns.sort()).toEqual(["id", "session_id"]);
  });

  it("messages_session_seq 유니크 인덱스가 재생성 후에도 계약대로다", () => {
    createV1Fixture();
    openAndClose();
    withRawDb((db) => {
      expect(() =>
        db
          .prepare(
            "INSERT INTO messages (id, session_id, seq, role, timestamp, body, active) VALUES (?,?,?,?,?,?,1)",
          )
          // seq 1은 SESSION_A에 이미 있다 (m-a1)
          .run("m-new", SESSION_A, 1, "user", 1, "{}"),
      ).toThrow();
    });
  });

  it("다른 세션끼리 seq가 겹치는 것은 여전히 허용된다 — seq는 세션 내 순서다", () => {
    createV1Fixture();
    openAndClose();
    withRawDb((db) => {
      // 픽스처 자체가 이미 증거다 — A와 B가 각각 seq 1을 갖고 왕복했다.
      const overlapping = db
        .prepare("SELECT session_id FROM messages WHERE seq = 1 ORDER BY session_id")
        .all() as { session_id: string }[];
      expect(overlapping.map((row) => row.session_id)).toEqual([SESSION_A, SESSION_B, SESSION_C]);

      // 새 세션에 seq 1을 넣는 것도 여전히 열려 있다.
      db.prepare(
        `INSERT INTO sessions (id, created_at, updated_at, workspace_root, system_prompt, model, active)
         VALUES (?, 1, 1, ?, 'SP', 'm', 1)`,
      ).run("dddd4444-0000-4000-8000-000000000004", workspaceRoot);
      expect(() =>
        db
          .prepare(
            "INSERT INTO messages (id, session_id, seq, role, timestamp, body, active) VALUES (?,?,?,?,?,?,1)",
          )
          .run("m-new2", "dddd4444-0000-4000-8000-000000000004", 1, "user", 1, "{}"),
      ).not.toThrow();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 재생성이 삼킬 수 있는 제약들 — STRICT · CHECK · FK
// ═══════════════════════════════════════════════════════════════════════════

describe("테이블 재생성 후에도 제약이 살아 있다 (SESSION-STORE §2)", () => {
  beforeEach(() => {
    createV1Fixture();
    openAndClose();
  });

  it("messages가 여전히 STRICT다 — 변환 불가능한 문자열을 거부한다", () => {
    withRawDb((db) => {
      expect(() =>
        db
          .prepare(
            "INSERT INTO messages (id, session_id, seq, role, timestamp, body) VALUES (?,?,?,?,?,?)",
          )
          .run("m-strict", SESSION_A, "not-a-number", "user", 1, "{}"),
      ).toThrow();
    });
  });

  it("messages.active의 CHECK(0,1)이 살아 있다", () => {
    withRawDb((db) => {
      expect(() =>
        db
          .prepare(
            "INSERT INTO messages (id, session_id, seq, role, timestamp, body, active) VALUES (?,?,?,?,?,?,?)",
          )
          .run("m-check", SESSION_A, 50, "user", 1, "{}", 2),
      ).toThrow();
    });
  });

  /**
   * 재생성 복사에서 가장 조용히 사라지기 쉬운 것이 FK다 — 새 테이블을 만들 때
   * `REFERENCES`를 빠뜨려도 데이터는 멀쩡히 옮겨진다.
   */
  it("messages.session_id의 FK가 살아 있다", () => {
    withRawDb((db) => {
      expect(() =>
        db
          .prepare(
            "INSERT INTO messages (id, session_id, seq, role, timestamp, body) VALUES (?,?,?,?,?,?)",
          )
          .run("m-fk", "존재하지-않는-세션", 1, "user", 1, "{}"),
      ).toThrow();
    });
  });

  it("sessions.parent_session_id의 FK도 살아 있다 — 분기가 이 FK 위에 선다", () => {
    withRawDb((db) => {
      expect(() =>
        db
          .prepare(
            `INSERT INTO sessions (id, created_at, updated_at, workspace_root, system_prompt, model, parent_session_id, active)
             VALUES (?, 1, 1, ?, 'SP', 'm', ?, 1)`,
          )
          .run("orphan-child", "/tmp/ws", "없는-부모"),
      ).toThrow();
    });
  });

  /**
   * 재생성 중 FK를 끄고 옮기는 구현(`PRAGMA foreign_keys = OFF` + rename)이 흔한데,
   * 옮긴 뒤 무결성을 확인하지 않으면 고아 행이 남는다. `foreign_key_check`는 그
   * 결과를 직접 본다.
   */
  it("마이그레이션이 고아 행을 만들지 않는다 (foreign_key_check 0건)", () => {
    withRawDb((db) => {
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    });
  });

  it("integrity_check가 ok다", () => {
    withRawDb((db) => {
      expect(db.prepare("PRAGMA integrity_check").all()).toEqual([{ integrity_check: "ok" }]);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 상위 버전 거부 — v1 규율이 v2 코드에서도 산다
// ═══════════════════════════════════════════════════════════════════════════

describe("상위 버전 DB 거부 (SESSION-STORE §2 마이그레이션 규율)", () => {
  /**
   * §2: "**DB의 버전이 코드가 아는 최신보다 높으면 거부한다.** 구 버전 바이너리가
   * 신 스키마를 열어 쓰면 손상된다." v1에서 확립한 이 규율이 v2 코드에서도
   * 동작해야 한다 — 마이그레이션 목록을 늘리면서 거부 분기가 함께 깨질 수 있다.
   */
  /**
   * 위조 버전은 **`LATEST_SCHEMA_VERSION + 1`로 계산한다.** 초판은 3을 상수로 적었는데,
   * v3이 실제로 도입되자 그 DB가 더 이상 "상위 버전"이 아니게 되어 테스트가 거부를
   * 관측하지 못했다(거부 단정이 조용히 통과 불가가 됐다). 계약은 "코드가 아는 최신보다
   * 높으면"이므로 기준을 코드에서 가져오는 것이 그 문장 그대로다.
   */
  const FUTURE_VERSION = LATEST_SCHEMA_VERSION + 1;

  it("코드가 아는 최신보다 높은 버전으로 위조한 DB를 열면 거부한다", () => {
    createV1Fixture({ schemaVersions: [1, FUTURE_VERSION] });
    const error = expectRejects(() => openSessionStore({ home, onWarning: () => {} }));
    // 문구는 조정 가능 세부다. 계약은 "무엇이 문제인지 말하고 거부한다"이므로
    // 버전 번호가 진단에 실려 있는지까지만 본다.
    expect(error.message).toMatch(new RegExp(String(FUTURE_VERSION)));
  });

  it("상위 버전 DB는 v2 마이그레이션이 적용되지 않은 채 남는다 — 부분 변조가 없다", () => {
    createV1Fixture({ schemaVersions: [1, FUTURE_VERSION] });
    const before = snapshotRows();

    expectRejects(() => openSessionStore({ home, onWarning: () => {} }));

    // 거부는 데이터를 건드리지 않는다. (journal_mode 같은 파일 헤더 변화는
    // 여기서 보지 않는다 — 계약의 대상은 행이다.)
    expect(snapshotRows()).toEqual(before);
    withRawDb((db) => {
      expect(readSchemaVersion(db)).toBe(FUTURE_VERSION);
      // 재생성이 일어났다면 PK가 바뀌었을 것이다. 거부된 DB는 v1 형상 그대로다.
      const pkColumns = (
        db.prepare("PRAGMA table_info(messages)").all() as { name: string; pk: number }[]
      )
        .filter((row) => row.pk > 0)
        .map((row) => row.name);
      expect(pkColumns).toEqual(["id"]);
    });
  });

  it("v2보다 높은 버전이면 데이터가 없어도 거부한다", () => {
    mkdirSync(join(home, ".neo-agent"), { recursive: true });
    const db = new DatabaseSync(dbPath());
    try {
      db.exec(SCHEMA_V1_FROZEN);
      db.prepare("INSERT INTO schema_version (version, applied_at) VALUES (?, ?)").run(99, 1);
    } finally {
      db.close();
    }
    expectRejects(() => openSessionStore({ home, onWarning: () => {} }));
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * [미규정 B-n] 판정 요청 — 이 파일이 임의로 정하지 않은 것
 *
 * 보고는 유실될 수 있으므로 여기에 남긴다. 아래는 **테스트로 고정하지 않았다** —
 * 기대값이 정본에 없기 때문이고, 지금 현재 동작을 기술해 두면 그것이 사후적으로
 * 계약이 되어 버린다. (branchSession 쪽 미규정은 `branch-session.contract.test.ts`
 * 말미에 B-4 이후로 이어 적었다.)
 *
 * ── B-1: v2 마이그레이션이 `schema_version`에 행을 **추가**하는가, 갱신하는가 ──
 *   v1 러너는 `INSERT INTO schema_version (version, applied_at)`으로 행을 쌓고
 *   `readSchemaVersion`은 `MAX(version)`을 읽는다. v2도 같은 형태면 행이 2개가
 *   된다. §2는 "각 마이그레이션은 트랜잭션 하나"까지만 정하고 이력을 남기는지
 *   최신 하나만 두는지는 정하지 않는다. 위 테스트는 `readSchemaVersion`의 반환값만
 *   보고 행 수를 단정하지 않는다.
 *
 * ── B-2: 마이그레이션 중 실패의 관측 가능한 표면 ─────────────────────────────
 *   §2가 "한 트랜잭션"을 요구하므로 실패 시 v2가 통째로 없어야 하지만, **v1 데이터로
 *   v2 제약을 위반시키는 것이 구조적으로 불가능하다**(v1 PK가 `id` 단독 = 전역
 *   유일이므로 `(session_id, id)`는 항상 만족된다. PK 확장은 제약의 완화다).
 *   즉 실패 주입 경로가 데이터 쪽에는 없다. 원자성 실측은 `branchSession` 쪽
 *   (실측 3)에서 수행했고, 마이그레이션 원자성은 **코드 리뷰로만 판정 가능**하다.
 *   판정 요청: 이 상태를 수용할지, 아니면 러너에 테스트용 실패 주입 지점을 둘지.
 *
 * ── B-3: `messages` 재생성 시 rowid 보존 여부 ────────────────────────────────
 *   테이블 재생성 복사는 rowid를 바꾼다. 현행 스키마 어디도 rowid에 의미를 부여하지
 *   않으므로(순서의 진실은 `seq` 하나 — §2) 위 테스트는 rowid를 보지 않는다. 다만
 *   `WITHOUT ROWID`를 택할지 여부는 §2가 정하지 않았고, 복합 PK 테이블에서는 흔한
 *   선택지라 구현이 어느 쪽을 골랐는지 기록될 가치가 있다.
 * ═══════════════════════════════════════════════════════════════════════════ */
