/**
 * 스키마 v3 마이그레이션 — `messages_fts`(FTS5 trigram) 신설 + 기존 메시지 일괄 백필 (QA-A).
 *
 * **이 파일은 구현보다 먼저 쓰였다.** T-002(Store Eng)가 착수하기 전에 계약을 고정하는
 * 것이 목적이며, 작성 시점에는 전부 빨간불(`LATEST_SCHEMA_VERSION`이 아직 2이므로
 * 값 단정에서 실패)인 것이 정상이다.
 *
 * 기대값의 출처 — **정본 문서만 본다. 구현 코드를 보고 쓰지 않았다**:
 *   - `docs/SEARCH.md` §2 — v3 DDL(`messages_fts`, trigram, UNINDEXED 2컬럼), 독립 FTS
 *     테이블, 마이그레이션은 "테이블 생성 + 기존 `messages` 전체 백필"이 **한 트랜잭션**
 *   - `docs/SEARCH.md` §3 — 색인 대상 표(무엇이 색인되고 무엇이 빠지는가),
 *     **FTS 행 존재 ⇔ 검색 가능 텍스트 존재**라는 대칭 불변 조건
 *   - `docs/SEARCH.md` §6 — 백필 중 손상 행은 조용히 건너뛰지 않는다,
 *     마이그레이션 실패는 트랜잭션 롤백(v2 DB 무손상)
 *   - `docs/SESSION-STORE.md` §2 "마이그레이션 규율" — 앞으로만·트랜잭션 하나·
 *     **버전 상한 초과 거부**·`schema_version`은 이력 테이블·**기존 DB 승격은 경고 통지**(B-13)
 *   - `docs/SESSION-STORE.md` §7 — 검증 범위는 `active = 1`, 비활성 행의 손상은 열기를 막지 않는다
 *   - 플랜 §8 **D-1 확정** — 백필 중 손상 행(JSON 파싱·Zod 검증 실패)은 경고 핸들러로
 *     통지 + 그 행만 색인 제외, **마이그레이션 자체는 성공한다**
 *
 * ── v2 DDL을 왜 동결 복사했는가 ─────────────────────────────────────────────
 * `schema-v2.contract.test.ts`가 v1에 대해 한 것과 같은 이유다. 백필 검증은 **v3 이전
 * 형상의 실데이터 DB**를 만들어 마이그레이션을 통과시켜야 하는데, `src/schema.sql.ts`의
 * 상수를 임포트해 쓰면 구현자가 v3 작업 중 그것을 손댈 때 픽스처가 조용히 따라 바뀌어
 * **백필 검증이 자기 자신을 검증하는 동어반복**이 된다. 아래 `SCHEMA_V2_FROZEN`은
 * 2026-08-07 시점 v1+v2 마이그레이션이 **만들어 내는 최종 형상**을 raw SQL로 옮겨 적어
 * 동결한 것이며, 앞으로 구현이 무엇을 바꾸든 여기는 바뀌지 않는다.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * 판정 기준: **원인 쪽이 미규정이어도 문서가 금지한 결과가 나오면 위반이다.**
 * 회색지대는 임의 판정하지 않고 파일 말미의 `[미규정 A-n]` 블록에 모았다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AgentMessage } from "@neo-agent/core";
import {
  LATEST_SCHEMA_VERSION,
  openSessionStore,
  readSchemaVersion,
  type StoreWarning,
} from "@neo-agent/store";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// ───────────────────────────────────────────────────────────────────────────
// 동결된 v2 최종 형상 DDL — 2026-08-07 기준 v1+v2 마이그레이션의 결과물.
// **구현을 따라 갱신하지 않는다.** 여기가 바뀌면 백필 검증의 의미가 사라진다.
// (`messages`의 PK가 `(session_id, id)`인 것이 v2의 실체다 — SESSION-STORE §2)
// ───────────────────────────────────────────────────────────────────────────

const SCHEMA_V2_FROZEN = `
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
  id         TEXT,
  session_id TEXT    NOT NULL REFERENCES sessions(id),
  seq        INTEGER NOT NULL,
  role       TEXT    NOT NULL,
  timestamp  INTEGER NOT NULL,
  body       TEXT    NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  PRIMARY KEY (session_id, id)
) STRICT;

CREATE UNIQUE INDEX messages_session_seq   ON messages(session_id, seq);
CREATE INDEX        messages_session_order ON messages(session_id, active, seq);
CREATE INDEX        sessions_recent        ON sessions(active, updated_at DESC);
`;

// ───────────────────────────────────────────────────────────────────────────
// 픽스처 — SEARCH §3 색인 대상 표의 7행을 **한 DB 안에서 전부** 만나게 구성했다.
// 세션 3개: A(활성) · B(soft-delete된 세션) · C(활성, 비활성 메시지 행 보유).
// ───────────────────────────────────────────────────────────────────────────

const SESSION_A = "aaaa1111-0000-4000-8000-00000000000a";
const SESSION_B = "bbbb2222-0000-4000-8000-00000000000b";
const SESSION_C = "cccc3333-0000-4000-8000-00000000000c";

const SYSTEM_PROMPT = "시스템프롬프트고유문자열 — 대화가 아니므로 절대 색인되지 않는다";
const MODEL = "model-x";

const USAGE = { input: 10, output: 20, cacheRead: 0, cacheWrite: 0 };

interface MessageFixture {
  sessionId: string;
  seq: number;
  /** `messages.active` — 0이어도 백필 대상이다(제외는 검색 쿼리의 책임, SEARCH §3·§4) */
  active: number;
  message: AgentMessage;
  /** 백필 후 이 메시지가 가져야 하는 FTS `text`. `undefined`면 FTS 행이 없어야 한다 */
  indexedText: string | undefined;
}

/**
 * SEARCH §3 표의 7행이 여기 1:1로 대응한다.
 *
 * | 픽스처 | 표의 행 | 색인 |
 * |---|---|---|
 * | m-a1 | `UserMessage.content`의 `TextContent` | ✅ |
 * | m-a2 | `AssistantMessage.content`의 `TextContent` (+ thinking·toolCall 동거) | ✅ text만 |
 * | m-a3 | `ToolResultMessage` 전체 | ❌ |
 * | m-a4 | `ToolCallContent`만 있는 어시스턴트 턴 | ❌ |
 * | m-a5 | `ImageContent`만 있는 사용자 턴 | ❌ |
 * | m-a6 | `TextContent` 여러 개 → `"\n\n"` 결합 | ✅ |
 * | m-b1 | soft-delete된 **세션**의 메시지 | ✅ (색인은 대칭, 제외는 검색의 책임) |
 * | m-c1 | `active = 0`인 **메시지 행** | ✅ (같은 이유) |
 *
 * 시스템 프롬프트(표의 마지막 행)는 `messages`에 존재할 수 없으므로 픽스처가 아니라
 * `sessions.system_prompt`에 심어 두고 "FTS 어디에도 없다"로 검증한다.
 */
const MESSAGE_FIXTURES: readonly MessageFixture[] = [
  {
    sessionId: SESSION_A,
    seq: 1,
    active: 1,
    message: {
      id: "m-a1",
      role: "user",
      content: [{ type: "text", text: "압축 설계를 검토했다" }],
      timestamp: 1_100,
    },
    indexedText: "압축 설계를 검토했다",
  },
  {
    sessionId: SESSION_A,
    seq: 2,
    active: 1,
    message: {
      id: "m-a2",
      role: "assistant",
      content: [
        { type: "thinking", text: "숨은사고블록고유어 — 표시·기록 전용이라 색인 밖이다" },
        { type: "text", text: "먼저 SEARCH 문서를 읽는다" },
        { type: "toolCall", toolCallId: "call-1", toolName: "read", args: { path: "/기계소음/x" } },
      ],
      stopReason: "tool_use",
      usage: USAGE,
      timestamp: 1_200,
    },
    indexedText: "먼저 SEARCH 문서를 읽는다",
  },
  {
    sessionId: SESSION_A,
    seq: 3,
    active: 1,
    message: {
      id: "m-a3",
      role: "toolResult",
      toolCallId: "call-1",
      toolName: "read",
      content: [{ type: "text", text: "도구출력덤프고유어 — 트랜스크립트 바이트의 대부분" }],
      isError: false,
      source: "local",
      timestamp: 1_300,
    },
    indexedText: undefined,
  },
  {
    sessionId: SESSION_A,
    seq: 4,
    active: 1,
    message: {
      id: "m-a4",
      role: "assistant",
      content: [
        { type: "toolCall", toolCallId: "call-2", toolName: "write", args: { path: "/tmp/y" } },
      ],
      stopReason: "tool_use",
      usage: USAGE,
      timestamp: 1_400,
    },
    indexedText: undefined,
  },
  {
    sessionId: SESSION_A,
    seq: 5,
    active: 1,
    message: {
      id: "m-a5",
      role: "user",
      content: [{ type: "image", mimeType: "image/png", data: "aW1hZ2Vvbmx5" }],
      timestamp: 1_500,
    },
    indexedText: undefined,
  },
  {
    sessionId: SESSION_A,
    seq: 6,
    active: 1,
    message: {
      id: "m-a6",
      role: "user",
      content: [
        { type: "text", text: "앞 단락이다" },
        { type: "text", text: "뒤 단락이다" },
      ],
      timestamp: 1_600,
    },
    indexedText: "앞 단락이다\n\n뒤 단락이다",
  },
  {
    sessionId: SESSION_B,
    seq: 1,
    active: 1,
    message: {
      id: "m-b1",
      role: "user",
      content: [{ type: "text", text: "삭제된 세션의 발화다" }],
      timestamp: 2_100,
    },
    indexedText: "삭제된 세션의 발화다",
  },
  {
    sessionId: SESSION_C,
    seq: 1,
    active: 0,
    message: {
      id: "m-c1",
      role: "user",
      content: [{ type: "text", text: "비활성 행의 발화다" }],
      timestamp: 3_100,
    },
    indexedText: "비활성 행의 발화다",
  },
];

/** SEARCH §3 대칭 불변 조건의 우변 — 표에서 손으로 센 값이지 구현이 돌려준 값이 아니다 */
const EXPECTED_FTS_ROW_COUNT = 5;

// ───────────────────────────────────────────────────────────────────────────
// 하네스
// ───────────────────────────────────────────────────────────────────────────

let sandbox: string;
let home: string;
let workspaceRoot: string;

const dbPath = (): string => join(home, ".neo-agent", "sessions.db");

function withRawDb<T>(fn: (db: DatabaseSync) => T, path = dbPath()): T {
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA foreign_keys = ON");
    return fn(db);
  } finally {
    db.close();
  }
}

interface V2FixtureOptions {
  /** `schema_version`에 심을 버전 행들. 기본 `[1, 2]` */
  schemaVersions?: readonly number[];
  /** 백필이 읽게 될 손상 행 — `[messageId, body]` (D-1) */
  corruptBodies?: readonly (readonly [string, string])[];
  /** 마이그레이션을 실패시킬 미끼. fts5의 shadow 테이블 이름을 선점한다 */
  plantFtsShadowDecoy?: boolean;
  /** 대상 홈 디렉터리. 기본 `home` — 결정성 검증에서 두 벌을 만들 때 쓴다 */
  targetHome?: string;
}

/**
 * 동결된 v2 DDL로 실데이터 DB를 만든다. **저장소 코드를 전혀 지나지 않는다** —
 * v3이 들어오면 현행 코드로는 v2 DB를 만들 수 없기 때문이다.
 */
function createV2Fixture(options: V2FixtureOptions = {}): void {
  const targetHome = options.targetHome ?? home;
  const directory = join(targetHome, ".neo-agent");
  const path = join(directory, "sessions.db");

  // 권한을 실제 사용자 DB와 같게(디렉터리 700 · 파일 600) 만든다. umask가 깎으므로
  // `chmod`까지 해야 결정적이다. 이걸 빼면 `openDatabase`가 `loose-*-permissions`
  // 경고를 내고, D-1의 "경고 핸들러가 호출된다"가 **손상 행과 무관한 이유로 통과한다**
  // — 실제로 그렇게 통과하는 것을 확인하고 고쳤다.
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);

  const db = new DatabaseSync(path);
  try {
    chmodSync(path, 0o600);
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(SCHEMA_V2_FROZEN);

    if (options.plantFtsShadowDecoy === true) {
      // fts5는 `messages_fts` 생성 시 shadow 테이블 `messages_fts_data`를 함께 만든다.
      // 그 이름을 미리 점유하면 v3의 `CREATE VIRTUAL TABLE`이 실패한다 — 마이그레이션
      // 트랜잭션을 밖에서 깨는, 구현 비의존 주입 지점이다. `[미규정 A-1]` 참조.
      db.exec("CREATE TABLE messages_fts_data (decoy INTEGER)");
    }

    for (const version of options.schemaVersions ?? [1, 2]) {
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
    insertSession.run(SESSION_B, 2_000, 7_000, "지운 세션", workspaceRoot, SYSTEM_PROMPT, MODEL, 0);
    insertSession.run(SESSION_C, 3_000, 6_000, null, workspaceRoot, SYSTEM_PROMPT, MODEL, 1);

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

    // 손상 행 — `role`·`timestamp`는 멀쩡하고 `body`만 깨진 형상이다. 실제 손상이
    // 그렇게 생긴다(파생 컬럼은 쓰기 시점에 만들어졌고 body만 나중에 망가진다).
    let seq = 100;
    for (const [messageId, body] of options.corruptBodies ?? []) {
      insertMessage.run(messageId, SESSION_C, seq, "user", 9_000 + seq, body, 1);
      seq += 1;
    }
  } finally {
    db.close();
  }
}

interface FtsRow {
  text: string;
  session_id: string;
  message_id: string;
}

/** FTS 테이블의 전 행. 정렬은 `message_id`로 고정해 비교를 결정적으로 만든다 */
function ftsRows(path = dbPath()): FtsRow[] {
  return withRawDb(
    (db) =>
      db
        .prepare("SELECT text, session_id, message_id FROM messages_fts ORDER BY message_id")
        .all() as unknown as FtsRow[],
    path,
  );
}

function ftsRowCount(path = dbPath()): number {
  return withRawDb(
    (db) => (db.prepare("SELECT count(*) AS n FROM messages_fts").get() as { n: number }).n,
    path,
  );
}

interface RowSnapshot {
  sessions: unknown[];
  messages: unknown[];
  schemaVersions: unknown[];
}

/** v2 형상의 전 컬럼 스냅샷 — 원자성 판정의 근거는 기대값이 아니라 이 diff다 */
function snapshotV2Rows(): RowSnapshot {
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
    schemaVersions: db.prepare("SELECT version FROM schema_version ORDER BY version").all(),
  }));
}

function tableNames(path = dbPath()): string[] {
  return withRawDb(
    (db) =>
      (
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
          )
          .all() as { name: string }[]
      ).map((row) => row.name),
    path,
  );
}

function schemaVersionRows(path = dbPath()): number[] {
  return withRawDb(
    (db) =>
      (
        db.prepare("SELECT version FROM schema_version ORDER BY version").all() as {
          version: number;
        }[]
      ).map((row) => row.version),
    path,
  );
}

/**
 * `.toThrow()`는 심볼 자체가 없을 때도 통과한다 — 미구현 상태에서 거부 단정이
 * 공허하게 초록불이 되는 것을 막는다(`schema-v2.contract.test.ts`와 같은 헬퍼).
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
function openAndClose(targetHome = home): StoreWarning[] {
  const warnings: StoreWarning[] = [];
  openSessionStore({
    home: targetHome,
    onWarning: (warning) => void warnings.push(warning),
  }).close();
  return warnings;
}

beforeEach(() => {
  sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-qaa-v3-")));
  home = join(sandbox, "home");
  workspaceRoot = join(sandbox, "ws");
  mkdirSync(home, { recursive: true });
  mkdirSync(workspaceRoot, { recursive: true });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// 0. 버전 표면 — v3이 실제로 등록됐는가
// ═══════════════════════════════════════════════════════════════════════════

describe("스키마 v3 등록 (SEARCH §2)", () => {
  /**
   * 이 단정이 아래 전부의 선행 조건이다. 2면 v3 마이그레이션 자체가 없다는 뜻이고,
   * 이후 실패는 "계약 위반"이 아니라 "미구현"으로 읽어야 한다.
   */
  it("LATEST_SCHEMA_VERSION이 3이다", () => {
    expect(LATEST_SCHEMA_VERSION).toBe(3);
  });

  it("새로 만든 DB의 schema_version은 3이다", () => {
    openAndClose();
    withRawDb((db) => {
      expect(readSchemaVersion(db)).toBe(3);
    });
  });

  it("v2 DB를 열면 3으로 올라간다", () => {
    createV2Fixture();
    withRawDb((db) => {
      expect(readSchemaVersion(db)).toBe(2);
    });

    openAndClose();

    withRawDb((db) => {
      expect(readSchemaVersion(db)).toBe(3);
    });
  });

  /** 재실행은 no-op — 매 기동마다 지나는 경로다 */
  it("이미 v3인 DB를 다시 열어도 버전이 오르지 않는다", () => {
    createV2Fixture();
    openAndClose();
    const afterFirst = ftsRows();

    openAndClose();

    withRawDb((db) => {
      expect(readSchemaVersion(db)).toBe(3);
    });
    expect(ftsRows()).toEqual(afterFirst);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. v3 DDL 형상 (SEARCH §2)
// ═══════════════════════════════════════════════════════════════════════════

describe("v3 DDL 형상 (SEARCH §2)", () => {
  beforeEach(() => {
    openAndClose();
  });

  it("messages_fts 테이블이 존재한다", () => {
    expect(tableNames()).toContain("messages_fts");
  });

  it("messages_fts는 fts5 가상 테이블이다", () => {
    const sql = withRawDb(
      (db) =>
        (
          db.prepare("SELECT sql FROM sqlite_master WHERE name = 'messages_fts'").get() as {
            sql: string;
          }
        ).sql,
    );
    expect(sql).toMatch(/VIRTUAL\s+TABLE/i);
    expect(sql).toMatch(/USING\s+fts5/i);
  });

  it("토크나이저가 trigram이다 (DDL 문면)", () => {
    const sql = withRawDb(
      (db) =>
        (
          db.prepare("SELECT sql FROM sqlite_master WHERE name = 'messages_fts'").get() as {
            sql: string;
          }
        ).sql,
    );
    expect(sql).toMatch(/tokenize\s*=\s*['"]trigram['"]/i);
  });

  /**
   * 문면 검사만으로는 "trigram이라 적혀 있다"까지다. 부분 문자열 매치가 실제로 되는지가
   * 채택 근거(SEARCH §2 — 한국어 부분 문자열 검색이 1차 요구)이므로 기능으로도 확인한다.
   * unicode61이면 어절 중간의 3자는 매치되지 않는다.
   */
  it("어절 중간의 3자 부분 문자열이 매치된다 (trigram 실효)", () => {
    withRawDb((db) => {
      db.prepare("INSERT INTO messages_fts (text, session_id, message_id) VALUES (?, ?, ?)").run(
        "프롬프트캐싱은신성불가침",
        "s-probe",
        "m-probe",
      );
      const hits = db
        .prepare("SELECT message_id FROM messages_fts WHERE messages_fts MATCH ?")
        .all('"프트캐"');
      expect(hits).toHaveLength(1);
    });
  });

  it("session_id·message_id가 UNINDEXED다", () => {
    const sql = withRawDb(
      (db) =>
        (
          db.prepare("SELECT sql FROM sqlite_master WHERE name = 'messages_fts'").get() as {
            sql: string;
          }
        ).sql,
    );
    expect(sql).toMatch(/session_id\s+UNINDEXED/i);
    expect(sql).toMatch(/message_id\s+UNINDEXED/i);
  });

  /**
   * UNINDEXED의 실효 — 메타 컬럼 값이 전문 검색에 걸리면 세션 id의 일부를 검색어로
   * 넣은 사용자가 그 세션의 전 메시지를 얻는다. SEARCH §2가 UNINDEXED를 명시한 이유다.
   */
  it("UNINDEXED 컬럼 값은 MATCH 대상이 아니다", () => {
    withRawDb((db) => {
      db.prepare("INSERT INTO messages_fts (text, session_id, message_id) VALUES (?, ?, ?)").run(
        "본문텍스트",
        "세션식별자고유어",
        "메시지식별자고유어",
      );
      expect(
        db
          .prepare("SELECT 1 FROM messages_fts WHERE messages_fts MATCH ?")
          .all('"세션식별자고유어"'),
      ).toHaveLength(0);
      expect(
        db
          .prepare("SELECT 1 FROM messages_fts WHERE messages_fts MATCH ?")
          .all('"메시지식별자고유어"'),
      ).toHaveLength(0);
      expect(
        db.prepare("SELECT 1 FROM messages_fts WHERE messages_fts MATCH ?").all('"본문텍스트"'),
      ).toHaveLength(1);
    });
  });

  /**
   * SEARCH §2 — FTS 컬럼은 최소다. role·timestamp·title을 넣지 않는다(JOIN에서 나오므로
   * 중복 저장하면 정본 아닌 사본이 한 벌 더 생긴다).
   */
  it("FTS 컬럼은 text·session_id·message_id 셋뿐이다", () => {
    const columns = withRawDb((db) =>
      (db.prepare("PRAGMA table_info(messages_fts)").all() as { name: string }[]).map(
        (row) => row.name,
      ),
    );
    expect(columns).toEqual(["text", "session_id", "message_id"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. 마이그레이션 규율 (SESSION-STORE §2)
// ═══════════════════════════════════════════════════════════════════════════

describe("마이그레이션 규율 (SESSION-STORE §2)", () => {
  /**
   * 지름길 금지 — 신규 DB도 v1 → v2 → v3을 순서대로 지난다. `schema_version`이
   * 이력 테이블(B-1)이므로 행 3개가 그 증거다. 한 번에 최신 형상을 만들면 최신 DDL이
   * 두 곳에 존재하게 되고, 마이그레이션 경로는 신규 설치에서 검증되지 않는다.
   */
  it("신규 DB도 v1→v2→v3을 순서대로 지난다 (schema_version 행 3개)", () => {
    openAndClose();
    expect(schemaVersionRows()).toEqual([1, 2, 3]);
  });

  it("v2 DB 승격은 v3 행 하나만 추가한다", () => {
    createV2Fixture();
    openAndClose();
    expect(schemaVersionRows()).toEqual([1, 2, 3]);
  });

  /** 버전 상한 초과 거부는 v3에서도 기존 동작 그대로다 */
  it("코드가 아는 최신보다 높은 버전의 DB는 거부한다", () => {
    createV2Fixture({ schemaVersions: [1, 2, 4] });

    const error = expectRejects(() => openAndClose());
    expect(error.message).toMatch(/v4/);
  });

  it("거부된 DB에는 messages_fts가 만들어지지 않는다", () => {
    createV2Fixture({ schemaVersions: [1, 2, 4] });
    expectRejects(() => openAndClose());

    expect(tableNames()).not.toContain("messages_fts");
  });

  /** v3은 파생 인덱스의 추가일 뿐 정본(`messages`·`sessions`)을 건드리지 않는다 */
  it("v3 승격이 기존 행을 변경하지 않는다", () => {
    createV2Fixture();
    const before = snapshotV2Rows();

    openAndClose();

    const after = snapshotV2Rows();
    expect(after.sessions).toEqual(before.sessions);
    expect(after.messages).toEqual(before.messages);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. 백필 — SEARCH §3 색인 대상 표
// ═══════════════════════════════════════════════════════════════════════════

describe("백필 — 색인 대상 (SEARCH §3)", () => {
  beforeEach(() => {
    createV2Fixture();
    openAndClose();
  });

  /**
   * **대칭 불변 조건** — "FTS 행 존재 ⇔ 검색 가능 텍스트 존재"(SEARCH §3).
   * 우변은 픽스처 표에서 손으로 센 값이다(구현이 돌려준 값이 아니다).
   */
  it("FTS 행 수 == 검색 가능 텍스트를 가진 메시지 수", () => {
    expect(ftsRowCount()).toBe(EXPECTED_FTS_ROW_COUNT);
  });

  it("색인된 message_id 집합이 표와 정확히 일치한다", () => {
    const expected = MESSAGE_FIXTURES.filter((f) => f.indexedText !== undefined)
      .map((f) => f.message.id)
      .sort();
    expect(ftsRows().map((row) => row.message_id)).toEqual(expected);
  });

  it("색인된 텍스트가 표의 추출 규칙과 일치한다 (thinking·toolCall 제외, \\n\\n 결합)", () => {
    const expected = MESSAGE_FIXTURES.filter((f) => f.indexedText !== undefined)
      .map((f) => ({
        message_id: f.message.id,
        session_id: f.sessionId,
        text: f.indexedText as string,
      }))
      .sort((a, b) => a.message_id.localeCompare(b.message_id));
    expect(ftsRows()).toEqual(expected);
  });

  it("ThinkingContent는 색인되지 않는다", () => {
    expect(
      ftsRows()
        .map((row) => row.text)
        .join("\u0000"),
    ).not.toContain("숨은사고블록고유어");
  });

  it("ToolResultMessage 전체가 색인되지 않는다", () => {
    expect(
      ftsRows()
        .map((row) => row.text)
        .join("\u0000"),
    ).not.toContain("도구출력덤프고유어");
    expect(ftsRows().map((row) => row.message_id)).not.toContain("m-a3");
  });

  it("텍스트 블록이 없는 메시지는 FTS 행이 0이다 (이미지만·toolCall만)", () => {
    const ids = ftsRows().map((row) => row.message_id);
    expect(ids).not.toContain("m-a4");
    expect(ids).not.toContain("m-a5");
  });

  it("시스템 프롬프트는 색인되지 않는다 (messages에 없다)", () => {
    expect(
      ftsRows()
        .map((row) => row.text)
        .join("\u0000"),
    ).not.toContain("시스템프롬프트고유문자열");
  });

  /**
   * SEARCH §3 — 색인은 대칭이고 제외는 **검색 쿼리의 책임**이다. 백필이 `active = 0`을
   * 걸러 버리면 "messages 행 ⇔ FTS 후보"의 대칭이 깨져 재구축 로직에 분기가 생긴다.
   */
  it("soft-delete된 세션의 메시지도 백필된다", () => {
    const row = ftsRows().find((r) => r.message_id === "m-b1");
    expect(row).toBeDefined();
    expect(row?.session_id).toBe(SESSION_B);
  });

  it("active = 0인 메시지 행도 백필된다", () => {
    const row = ftsRows().find((r) => r.message_id === "m-c1");
    expect(row).toBeDefined();
    expect(row?.session_id).toBe(SESSION_C);
  });

  it("session_id·message_id가 messages 행의 값과 같다 (JOIN 키)", () => {
    for (const row of ftsRows()) {
      const fixture = MESSAGE_FIXTURES.find((f) => f.message.id === row.message_id);
      expect(fixture).toBeDefined();
      expect(row.session_id).toBe(fixture?.sessionId);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. 백필 결정성
// ═══════════════════════════════════════════════════════════════════════════

describe("백필 결정성", () => {
  /**
   * 같은 입력 → 같은 결과. FTS는 파생 데이터이고 "원본에서 언제든 재구축 가능"이
   * 그 성격의 정의다(SEARCH §1) — 재구축이 매번 다른 결과를 내면 그 성격이 무너진다.
   */
  it("같은 v2 입력을 두 DB에 백필하면 결과가 같다", () => {
    const otherHome = join(sandbox, "home2");
    mkdirSync(otherHome, { recursive: true });

    createV2Fixture();
    createV2Fixture({ targetHome: otherHome });

    openAndClose();
    openAndClose(otherHome);

    expect(ftsRows(join(otherHome, ".neo-agent", "sessions.db"))).toEqual(ftsRows());
  });

  it("승격된 DB를 다시 열어도 FTS 행이 늘지 않는다", () => {
    createV2Fixture();
    openAndClose();
    const first = ftsRowCount();

    openAndClose();
    openAndClose();

    expect(ftsRowCount()).toBe(first);
    expect(ftsRowCount()).toBe(EXPECTED_FTS_ROW_COUNT);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. 원자성 — SEARCH §6 "마이그레이션 실패 → 트랜잭션 롤백, v2 DB 무손상"
// ═══════════════════════════════════════════════════════════════════════════

describe("백필 원자성 (SEARCH §6, SESSION-STORE §2)", () => {
  it("마이그레이션이 실패하면 열기가 실패한다", () => {
    createV2Fixture({ plantFtsShadowDecoy: true });
    expectRejects(() => openAndClose());
  });

  it("실패 후 messages_fts가 남지 않는다", () => {
    createV2Fixture({ plantFtsShadowDecoy: true });
    expectRejects(() => openAndClose());

    expect(tableNames()).not.toContain("messages_fts");
  });

  it("실패 후 fts 잔재(shadow 테이블)가 남지 않는다", () => {
    createV2Fixture({ plantFtsShadowDecoy: true });
    expectRejects(() => openAndClose());

    // 우리가 심은 미끼(`messages_fts_data`)만 남아야 한다 — 마이그레이션이 만든
    // shadow 테이블(`_idx`·`_docsize`·`_config`·`_content`)은 롤백으로 전부 사라진다.
    const leftovers = tableNames().filter(
      (name) => name.startsWith("messages_fts") && name !== "messages_fts_data",
    );
    expect(leftovers).toEqual([]);
  });

  it("실패 후 schema_version에 v3 행이 없다", () => {
    createV2Fixture({ plantFtsShadowDecoy: true });
    expectRejects(() => openAndClose());

    expect(schemaVersionRows()).toEqual([1, 2]);
  });

  it("실패 후 v2 데이터가 전 컬럼 그대로다", () => {
    createV2Fixture({ plantFtsShadowDecoy: true });
    const before = snapshotV2Rows();

    expectRejects(() => openAndClose());

    expect(snapshotV2Rows()).toEqual(before);
  });

  it("실패 원인을 제거하면 재시도가 성공한다", () => {
    createV2Fixture({ plantFtsShadowDecoy: true });
    expectRejects(() => openAndClose());

    withRawDb((db) => db.exec("DROP TABLE messages_fts_data"));

    openAndClose();
    expect(schemaVersionRows()).toEqual([1, 2, 3]);
    expect(ftsRowCount()).toBe(EXPECTED_FTS_ROW_COUNT);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. D-1 — 백필 중 손상 행 (플랜 §8 확정)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * D-1 확정: 손상 행은 **경고 통지 + 그 행만 색인 제외**이고 **마이그레이션은 성공한다.**
 * (b)안(마이그레이션 실패)은 기각됐다 — SESSION-STORE §7이 검증 범위를 `active = 1`로
 * 한정하고 "비활성 행의 손상은 열기를 막지 않는다"고 명문화했는데, 백필은 `active = 0`
 * 행도 읽으므로 실패 처리하면 그 규율이 역전된다.
 */
describe("D-1 — 백필 중 손상 행", () => {
  const BROKEN_JSON = "m-corrupt-json";
  const NOT_AGENT_MESSAGE = "m-corrupt-shape";

  const CORRUPT: readonly (readonly [string, string])[] = [
    // JSON 파싱 실패
    [BROKEN_JSON, '{ "role": "user", 잘린다'],
    // 파싱은 되지만 `AgentMessage`가 아니다 → Zod 검증 실패
    [NOT_AGENT_MESSAGE, '{"foo":1,"bar":"손상형상고유어"}'],
  ];

  /**
   * v3 이전부터 있던 `StoreWarning` 멤버들. 손상 행 통지는 이것들 **밖**에 있어야
   * 한다 — 이 필터가 없으면 열기 과정에서 나는 다른 경고(권한·승격) 때문에 "통지됐다"가
   * 손상과 무관한 이유로 통과한다. 실제로 픽스처의 디렉터리 권한 경고로 그렇게 통과하는
   * 것을 확인하고 이 필터를 넣었다.
   */
  const PRE_V3_WARNING_KINDS: readonly StoreWarning["kind"][] = [
    "schema-migrated",
    "loose-directory-permissions",
    "loose-file-permissions",
    "system-prompt-mismatch",
    "model-mismatch",
  ];

  function openWithCorruptRows(): StoreWarning[] {
    createV2Fixture({ corruptBodies: CORRUPT });
    return openAndClose().filter((warning) => !PRE_V3_WARNING_KINDS.includes(warning.kind));
  }

  it("마이그레이션이 성공한다 (DB 전체를 봉쇄하지 않는다)", () => {
    openWithCorruptRows();
    expect(schemaVersionRows()).toEqual([1, 2, 3]);
  });

  it("손상 행만 색인에서 빠진다 — 나머지는 전부 색인된다", () => {
    openWithCorruptRows();

    const ids = ftsRows().map((row) => row.message_id);
    expect(ids).not.toContain(BROKEN_JSON);
    expect(ids).not.toContain(NOT_AGENT_MESSAGE);
    expect(ftsRowCount()).toBe(EXPECTED_FTS_ROW_COUNT);
  });

  it("손상 행의 내용이 색인에 새지 않는다", () => {
    openWithCorruptRows();
    expect(
      ftsRows()
        .map((row) => row.text)
        .join("\u0000"),
    ).not.toContain("손상형상고유어");
  });

  /**
   * SEARCH §6 — "조용히 건너뛰지 않는다". 통지가 없으면 침묵 유실이고, 그것이 D-1이
   * (a)안을 택하면서도 지켜야 한다고 못박은 조건이다.
   */
  it("경고 핸들러가 호출된다", () => {
    expect(openWithCorruptRows().length).toBeGreaterThanOrEqual(1);
  });

  /**
   * **어느 행인지 식별 가능해야 한다.** "손상 행이 있었다"만으로는 사용자가 손댈 곳을
   * 찾을 수 없다 — 진단 불가능한 실패는 침묵 실패와 같은 문제를 남긴다는 것이
   * `load.ts`·§7이 이미 택한 방향이다. 경고의 `kind`·필드 구성은 미규정이라(`[미규정 A-2]`)
   * 직렬화 문면에 message id가 나타나는지로 판정한다.
   */
  it("경고가 어느 행인지 식별할 수 있는 정보를 싣는다", () => {
    const text = JSON.stringify(openWithCorruptRows());

    expect(text).toContain(BROKEN_JSON);
    expect(text).toContain(NOT_AGENT_MESSAGE);
  });

  it("손상 행이 있어도 정상 행의 검색은 동작한다", () => {
    openWithCorruptRows();
    withRawDb((db) => {
      const hits = db
        .prepare("SELECT message_id FROM messages_fts WHERE messages_fts MATCH ?")
        .all('"압축 설계"');
      expect(hits).toHaveLength(1);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. B-13 통지 (SESSION-STORE §2)
// ═══════════════════════════════════════════════════════════════════════════

describe("B-13 승격 통지 (SESSION-STORE §2)", () => {
  it("기존 v2 DB 승격 시 onUpgrade가 1회 호출된다", () => {
    createV2Fixture();
    const warnings = openAndClose().filter((w) => w.kind === "schema-migrated");

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ kind: "schema-migrated", from: 2, to: 3 });
  });

  it("신규 DB 생성 시에는 통지하지 않는다", () => {
    const warnings = openAndClose().filter((w) => w.kind === "schema-migrated");
    expect(warnings).toHaveLength(0);
  });

  it("이미 v3인 DB를 다시 열면 통지하지 않는다", () => {
    createV2Fixture();
    openAndClose();

    const warnings = openAndClose().filter((w) => w.kind === "schema-migrated");
    expect(warnings).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [미규정 A-n] — QA-A가 임의 판정하지 않고 남기는 회색지대
// ═══════════════════════════════════════════════════════════════════════════
//
// [미규정 A-1] **백필 실패 주입 지점이 DDL 단계다.** SEARCH §6·SESSION-STORE §2가
//   요구하는 것은 "마이그레이션 실패 → 전량 롤백, v2 무손상"이고 위 테스트는 그것을
//   검증하지만, 실패가 나는 위치는 `CREATE VIRTUAL TABLE`이지 백필 INSERT 도중이
//   아니다. `src/` 수정 없이 개별 FTS INSERT를 실패시킬 구현 비의존 수단을 찾지
//   못했다(D-1 확정으로 손상 body는 더 이상 실패 경로가 아니다).
//   잠정 의견: 계약이 요구하는 것은 "한 트랜잭션"이므로 어느 단계에서 깨져도 사후
//   조건은 동일하고, 검증으로 충분하다고 본다. 구현자가 백필 단계에 테스트 훅을
//   노출한다면 그때 이 테스트를 그쪽으로 옮기는 것이 낫다. **판정 필요.**
//
// [미규정 A-2] **D-1 경고의 형상이 미규정이다.** D-1은 "경고 핸들러로 어느 행인지
//   통지"까지만 정했고 `StoreWarning` 유니온에 어떤 `kind`를 추가하는지, 어떤 필드를
//   싣는지(messageId·sessionId·원인)는 정해지지 않았다. 위 테스트는 유니온 형상에
//   과결합하지 않으려고 `kind !== "schema-migrated"`로 걸러 직렬화 문면에 message id가
//   있는지만 본다.
//   잠정 의견: `kind: "corrupt-message-skipped"` 정도의 신규 멤버에 `sessionId`·
//   `messageId`·`message`를 싣는 것이 기존 `StoreWarning` 관례(전 멤버가 `kind` +
//   식별 정보 + `message`)와 일관된다. **판정 필요 — 확정 시 이 테스트를 조여야 한다.**
//
// [미규정 A-3] **NULL id 행의 백필 처리가 미규정이다.** v2 DDL은 `messages.id`에
//   `NOT NULL`이 없다(E-21이 의도적으로 그렇게 뒀다) — v1 시절 NULL id 행이 존재할 수
//   있다. 그 행의 body는 멀쩡할 수 있으므로 D-1(JSON 파싱·Zod 검증 실패)에 해당하지
//   않는데, `messages_fts.message_id`에 NULL을 넣으면 검색 결과의 `messageId`가 NULL이
//   되고 dedupe(SEARCH §4 "같은 id는 1회")의 기준이 무너진다.
//   잠정 의견: E-21이 세운 폭발 반경 규율("DB 전체를 봉쇄하지 않는다")에 따라
//   **마이그레이션은 성공**하고 그 행만 색인에서 빠지되 D-1과 같은 채널로 통지하는 것이
//   일관된다. 테스트로 고정하지 않았다 — 확정 전에 쓰면 QA가 판정을 대신하는 것이 된다.
//   **판정 필요.**
