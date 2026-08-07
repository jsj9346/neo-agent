/**
 * 스키마 v1 — STRICT · CHECK · FK · 인덱스 · 파생 규칙 (QA-B).
 *
 * 기대값의 출처는 `docs/SESSION-STORE.md` §2의 DDL과 "결정 사항" 절이다.
 *
 * 이 파일은 저장소가 연 DB **파일을 직접** 열어 검사한다. 스키마 제약은 저장소
 * API를 통해서만 확인하면 "API가 막아서 통과한 것"과 "DB가 막아서 통과한 것"을
 * 구분할 수 없는데, §2가 STRICT를 채택한 이유가 바로 **API를 우회한 쓰기까지
 * 막는 것**이기 때문이다.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openSessionStore } from "@neo-agent/store";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let sandbox: string;
let home: string;
let db: DatabaseSync;

const WS = "/tmp/qab-workspace";

beforeEach(() => {
  sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-qab-schema-")));
  home = join(sandbox, "home");
  mkdirSync(home, { recursive: true });
  openSessionStore({ home }).close();
  db = new DatabaseSync(join(home, ".neo-agent", "sessions.db"));
  // FK는 연결별 설정이고 SQLite 기본이 off다. 저장소 연결이 켰다고 해서
  // 이 연결이 켜지지는 않으므로, FK 테스트를 하려면 여기서도 켜야 한다.
  db.exec("PRAGMA foreign_keys = ON");
});

afterEach(() => {
  db.close();
  rmSync(sandbox, { recursive: true, force: true });
});

/** 테스트용 세션 행을 직접 넣는다 — messages의 FK 대상이 필요할 때 */
function insertSession(id: string): void {
  db.prepare(
    `INSERT INTO sessions (id, created_at, updated_at, workspace_root, system_prompt, model, active)
     VALUES (?, 1, 1, ?, 'SP', 'model-x', 1)`,
  ).run(id, WS);
}

describe("테이블 구성 (SESSION-STORE §2)", () => {
  /**
   * v3(`SEARCH.md` §2)부터 `messages_fts`와 **fts5가 스스로 만드는 shadow 테이블**
   * (`messages_fts_data`·`_idx`·`_docsize`·`_config`·`_content`)이 함께 존재한다.
   *
   * shadow의 이름과 개수는 fts5의 구현 세부다 — 목록에 열거하면 SQLite 버전이 바뀔 때
   * 계약과 무관한 이유로 이 테스트가 깨진다. 판정의 실질은 "우리가 정한 테이블 말고
   * 다른 것을 우리가 만들지 않았다"이므로, FTS 부산물을 제외한 나머지를 정확히
   * 단정하고 `messages_fts` 자체의 존재는 아래에서 따로 본다.
   */
  it("정본 테이블은 정확히 3개다 — 컬럼을 임의 추가하지 않듯 테이블도 추가하지 않는다", () => {
    const names = (
      db
        .prepare(
          `SELECT name FROM sqlite_master
            WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'messages_fts%'
            ORDER BY name`,
        )
        .all() as { name: string }[]
    ).map((row) => row.name);
    expect(names).toEqual(["messages", "schema_version", "sessions"]);
  });

  it("검색 인덱스 messages_fts가 함께 존재한다 (SEARCH §2)", () => {
    const names = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
        name: string;
      }[]
    ).map((row) => row.name);
    expect(names).toContain("messages_fts");
  });

  /**
   * **`messages_fts`는 명시된 예외다** — SEARCH §2가 그렇게 명문화했다. STRICT는 FTS5
   * 가상 테이블에 적용할 수 없는 SQLite 제약이며, 규율을 어긴 것이 아니다. 그 테이블의
   * 타입 안전은 쓰기 지점이 store 한 곳(`extract.ts`)뿐인 것으로 갈음한다.
   *
   * shadow 테이블도 같은 이유로 빠진다 — fts5가 만든 것이지 우리 DDL이 만든 것이 아니다.
   */
  it("정본 테이블은 전부 STRICT다 (FTS5 가상 테이블은 §2의 명시된 예외)", () => {
    const rows = db
      .prepare(
        `SELECT name, sql FROM sqlite_master
          WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'messages_fts%'`,
      )
      .all() as { name: string; sql: string }[];

    // 제외가 지나쳐 검사할 것이 없어지면 이 테스트는 공허하게 통과한다.
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.sql.toUpperCase()).toMatch(/\)\s*STRICT\s*;?\s*$/);
    }
  });

  it("§2 DDL이 정한 컬럼 집합과 정확히 일치한다 (추가도 누락도 없다)", () => {
    const columnsOf = (table: string): string[] =>
      (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
        (row) => row.name,
      );

    expect(columnsOf("schema_version").sort()).toEqual(["applied_at", "version"]);
    expect(columnsOf("sessions").sort()).toEqual([
      "active",
      "created_at",
      "id",
      "model",
      "parent_session_id",
      "system_prompt",
      "title",
      "updated_at",
      "workspace_root",
    ]);
    expect(columnsOf("messages").sort()).toEqual([
      "active",
      "body",
      "id",
      "role",
      "seq",
      "session_id",
      "timestamp",
    ]);
  });

  it("§2가 정한 인덱스 3개가 존재한다", () => {
    const names = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'")
        .all() as { name: string }[]
    ).map((row) => row.name);
    expect(names).toEqual(
      expect.arrayContaining(["messages_session_seq", "messages_session_order", "sessions_recent"]),
    );
  });
});

describe("STRICT 타입 강제 (SESSION-STORE §2)", () => {
  /**
   * 주의 — STRICT는 **무손실 변환을 허용한다.** `INTEGER` 컬럼에 `"7"`을 넣으면
   * 거부하지 않고 7로 저장한다. 그래서 "STRICT가 켜졌다"의 증거는
   * **변환 불가능한 문자열**(`"abc"`)이어야 한다. 반대 방향(`TEXT` 컬럼에 숫자)은
   * STRICT가 실제로 거부하므로 그쪽도 함께 본다.
   */
  it("INTEGER 컬럼에 변환 불가능한 문자열을 거부한다", () => {
    insertSession("s1");
    expect(() =>
      db
        .prepare(
          "INSERT INTO messages (id, session_id, seq, role, timestamp, body) VALUES (?,?,?,?,?,?)",
        )
        .run("m1", "s1", "not-a-number", "user", 1, "{}"),
    ).toThrow();
  });

  it("INTEGER 컬럼에 부동소수 형태의 문자열도 거부한다", () => {
    insertSession("s1b");
    expect(() =>
      db
        .prepare(
          "INSERT INTO messages (id, session_id, seq, role, timestamp, body) VALUES (?,?,?,?,?,?)",
        )
        .run("m1b", "s1b", 1, "user", "12.5abc", "{}"),
    ).toThrow();
  });

  /**
   * 반대 방향(TEXT 컬럼에 숫자)은 **거부되지 않는다** — STRICT의 무손실 변환 허용
   * 범위 안이고, `12345`는 `"12345.0"`으로 저장된다(2026-08-06 실측: Node의
   * `DatabaseSync`는 숫자 바인딩을 REAL로 넘긴다).
   *
   * 이것을 "STRICT가 안 켜졌다"의 증거로 읽으면 오판이다. STRICT의 실효성은 위
   * 두 테스트(변환 불가능한 문자열 거부)로만 판정한다.
   */
  it("TEXT 컬럼의 숫자는 STRICT가 막지 않는다 — 변환 방향의 비대칭을 못박는다", () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO sessions (id, created_at, updated_at, workspace_root, system_prompt, model, active)
           VALUES (?, 1, 1, ?, 'SP', 'm', 1)`,
        )
        .run(12345, WS),
    ).not.toThrow();
  });

  it("무손실 변환은 STRICT가 막지 않는다 — 이 통과가 위 두 테스트의 대조군이다", () => {
    insertSession("s2");
    db.prepare(
      "INSERT INTO messages (id, session_id, seq, role, timestamp, body) VALUES (?,?,?,?,?,?)",
    ).run("m2", "s2", "7", "user", 1, "{}");
    const row = db.prepare("SELECT seq FROM messages WHERE id='m2'").get() as { seq: number };
    expect(row.seq).toBe(7);
  });
});

describe("CHECK · FK · 유니크 (SESSION-STORE §2)", () => {
  it("sessions.active는 0/1만 받는다", () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO sessions (id, created_at, updated_at, workspace_root, system_prompt, model, active)
           VALUES (?, 1, 1, ?, 'SP', 'm', 2)`,
        )
        .run("bad", WS),
    ).toThrow();
  });

  it("messages.active는 0/1만 받는다", () => {
    insertSession("s3");
    expect(() =>
      db
        .prepare(
          "INSERT INTO messages (id, session_id, seq, role, timestamp, body, active) VALUES (?,?,?,?,?,?,?)",
        )
        .run("m3", "s3", 1, "user", 1, "{}", 2),
    ).toThrow();
  });

  it("messages.session_id의 FK가 실제로 강제된다 (장식이 아니다)", () => {
    expect(() =>
      db
        .prepare(
          "INSERT INTO messages (id, session_id, seq, role, timestamp, body) VALUES (?,?,?,?,?,?)",
        )
        .run("m4", "존재하지-않는-세션", 1, "user", 1, "{}"),
    ).toThrow();
  });

  it("sessions.parent_session_id의 FK도 강제된다", () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO sessions (id, created_at, updated_at, workspace_root, system_prompt, model, parent_session_id)
           VALUES (?, 1, 1, ?, 'SP', 'm', ?)`,
        )
        .run("child", WS, "없는-부모"),
    ).toThrow();
  });

  it("(session_id, seq)는 유니크다 — 순서의 진실이 둘일 수 없다", () => {
    insertSession("s5");
    db.prepare(
      "INSERT INTO messages (id, session_id, seq, role, timestamp, body) VALUES (?,?,?,?,?,?)",
    ).run("m5a", "s5", 1, "user", 1, "{}");
    expect(() =>
      db
        .prepare(
          "INSERT INTO messages (id, session_id, seq, role, timestamp, body) VALUES (?,?,?,?,?,?)",
        )
        .run("m5b", "s5", 1, "user", 2, "{}"),
    ).toThrow();
  });

  it("messages.id는 PRIMARY KEY다 — 같은 id 재삽입이 거부된다 (INSERT OR IGNORE의 근거)", () => {
    insertSession("s6");
    const stmt = db.prepare(
      "INSERT INTO messages (id, session_id, seq, role, timestamp, body) VALUES (?,?,?,?,?,?)",
    );
    stmt.run("dup", "s6", 1, "user", 1, "{}");
    expect(() => stmt.run("dup", "s6", 2, "user", 2, "{}")).toThrow();
  });

  it("다른 세션끼리는 seq가 겹쳐도 된다 — seq는 세션 내 순서다", () => {
    insertSession("s7a");
    insertSession("s7b");
    const stmt = db.prepare(
      "INSERT INTO messages (id, session_id, seq, role, timestamp, body) VALUES (?,?,?,?,?,?)",
    );
    stmt.run("m7a", "s7a", 1, "user", 1, "{}");
    expect(() => stmt.run("m7b", "s7b", 1, "user", 1, "{}")).not.toThrow();
  });
});

describe("세션 CRUD와 v1 규칙 (SESSION-STORE §2 · §5)", () => {
  const init = { workspaceRoot: WS, systemPrompt: "SP", model: "model-x" };

  it("createSession은 id·createdAt·updatedAt을 채우고 title·parentSessionId는 비운다", () => {
    const store = openSessionStore({ home });
    try {
      const session = store.createSession(init);
      expect(typeof session.id).toBe("string");
      expect(session.id.length).toBeGreaterThan(0);
      expect(typeof session.createdAt).toBe("number");
      expect(typeof session.updatedAt).toBe("number");
      expect(session.title).toBeNull();
      // §2: "parent_session_id는 v1에서 항상 NULL이다"
      expect(session.parentSessionId).toBeNull();
      expect(session.workspaceRoot).toBe(WS);
    } finally {
      store.close();
    }
  });

  it("생성된 세션은 active = 1이다", () => {
    const store = openSessionStore({ home });
    let id: string;
    try {
      id = store.createSession(init).id;
    } finally {
      store.close();
    }
    const row = db
      .prepare("SELECT active, parent_session_id FROM sessions WHERE id = ?")
      .get(id) as {
      active: number;
      parent_session_id: string | null;
    };
    expect(row.active).toBe(1);
    expect(row.parent_session_id).toBeNull();
  });

  it("listSessions는 최근 갱신 순으로 돌려주고 limit을 존중한다", () => {
    const store = openSessionStore({ home });
    try {
      const a = store.createSession(init);
      const b = store.createSession(init);
      const c = store.createSession(init);
      // sessions_recent 인덱스가 (active, updated_at DESC)인 이유가 이 조회다
      const listed = store.listSessions();
      expect(listed.map((session) => session.id)).toEqual(
        expect.arrayContaining([a.id, b.id, c.id]),
      );
      expect(store.listSessions(2)).toHaveLength(2);
    } finally {
      store.close();
    }
  });

  it("listSessions는 active = 0인 세션을 제외한다", () => {
    const store = openSessionStore({ home });
    let id: string;
    try {
      id = store.createSession(init).id;
    } finally {
      store.close();
    }
    db.prepare("UPDATE sessions SET active = 0 WHERE id = ?").run(id);

    const store2 = openSessionStore({ home });
    try {
      expect(store2.listSessions().map((session) => session.id)).not.toContain(id);
    } finally {
      store2.close();
    }
  });
});

describe("resolveSessionId — git 스타일 접두 매칭 (SESSION-STORE §5)", () => {
  it("유일한 접두는 전체 id로 해석된다", () => {
    const store = openSessionStore({ home });
    try {
      const session = store.createSession({
        workspaceRoot: WS,
        systemPrompt: "SP",
        model: "m",
      });
      expect(store.resolveSessionId(session.id.slice(0, 8))).toBe(session.id);
      expect(store.resolveSessionId(session.id)).toBe(session.id);
    } finally {
      store.close();
    }
  });

  /**
   * §5: "모호하면 throw — **조용히 하나를 고르지 않는다**".
   *
   * 조용히 고르면 사용자는 엉뚱한 세션을 이어가고, 그 세션의 워크스페이스가
   * 우연히 같으면 §5의 워크스페이스 검증도 그것을 잡지 못한다.
   */
  it("모호한 접두는 throw한다", () => {
    const store = openSessionStore({ home });
    try {
      store.close();
    } catch {
      /* noop */
    }
    // id는 UUID라 접두 충돌을 만들 수 없다 — DB에 직접 넣어 충돌을 구성한다
    db.prepare(
      `INSERT INTO sessions (id, created_at, updated_at, workspace_root, system_prompt, model, active)
       VALUES (?, 1, 1, ?, 'SP', 'm', 1)`,
    ).run("abc111", WS);
    db.prepare(
      `INSERT INTO sessions (id, created_at, updated_at, workspace_root, system_prompt, model, active)
       VALUES (?, 1, 2, ?, 'SP', 'm', 1)`,
    ).run("abc222", WS);

    const store2 = openSessionStore({ home });
    try {
      expect(() => store2.resolveSessionId("abc")).toThrow();
      expect(store2.resolveSessionId("abc1")).toBe("abc111");
    } finally {
      store2.close();
    }
  });

  it("일치하는 것이 없으면 throw한다 — 빈 값을 돌려주지 않는다", () => {
    const store = openSessionStore({ home });
    try {
      expect(() => store.resolveSessionId("zzzz-없음")).toThrow();
    } finally {
      store.close();
    }
  });
});
