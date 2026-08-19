/**
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../src/open.ts";
import { createSession } from "../src/sessions.ts";

/**
 * 스키마 v1이 실제로 제약을 강제하는지. **STRICT가 무엇을 막고 무엇을 안 막는지가
 * 여기서 갈린다** — 막지 않는 것은 `bind.ts`가 맡는다.
 */
describe("스키마 v1", () => {
  let sandbox: string;
  let db: DatabaseSync;

  beforeEach(() => {
    sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-schema-")));
    db = openDatabase({ path: join(sandbox, "sessions.db"), onWarning: () => {} });
  });

  afterEach(() => {
    db.close();
    rmSync(sandbox, { recursive: true, force: true });
  });

  function newSessionId(): string {
    return createSession(db, {
      workspaceRoot: "/ws",
      systemPrompt: "sp",
      model: "claude-opus-5",
    }).id;
  }

  /**
   * v3(검색 인덱스)부터 `messages_fts`와 fts5가 스스로 만드는 shadow 테이블
   * (`messages_fts_data`·`_idx`·`_docsize`·`_config`)이 함께 존재한다. shadow의
   * 이름·개수는 fts5의 구현 세부라 열거하지 않는다 — 열거하면 SQLite 버전이 바뀔 때
   * 이 테스트가 계약과 무관한 이유로 깨진다. 정본 스키마가 만드는 객체는 그대로
   * 있어야 하므로 그쪽만 정확히 단정한다.
   */
  it("정본 테이블 3개와 인덱스 3개를 만든다 (FTS 부산물 제외)", () => {
    const names = db
      .prepare(
        `SELECT name FROM sqlite_master
          WHERE type IN ('table','index') AND sql IS NOT NULL
            AND name NOT LIKE 'messages_fts%'
          ORDER BY name`,
      )
      .all()
      .map((row) => (row as { name: string }).name);

    expect(names).toEqual([
      "messages",
      "messages_session_order",
      "messages_session_seq",
      "schema_version",
      "sessions",
      "sessions_recent",
    ]);
  });

  it("검색 인덱스 messages_fts가 함께 만들어진다 (v3)", () => {
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(names).toContain("messages_fts");
  });

  it("전 테이블이 STRICT다", () => {
    const strict = db
      .prepare(
        "SELECT name FROM pragma_table_list WHERE schema = 'main' AND type = 'table' AND strict = 1 ORDER BY name",
      )
      .all()
      .map((row) => (row as { name: string }).name);
    expect(strict).toEqual(["messages", "schema_version", "sessions"]);
  });

  describe("STRICT", () => {
    it("`messages.seq`에 문자열을 넣으면 거부한다", () => {
      const sessionId = newSessionId();
      expect(() =>
        db
          .prepare(
            "INSERT INTO messages (id, session_id, seq, role, timestamp, body) VALUES (?,?,?,?,?,?)",
          )
          .run("m1", sessionId, "abc", "user", 1, "{}"),
      ).toThrowError(/cannot store TEXT value in INTEGER column/);
    });

    it("`messages.timestamp`에 비정수를 넣으면 거부한다", () => {
      const sessionId = newSessionId();
      expect(() =>
        db
          .prepare(
            "INSERT INTO messages (id, session_id, seq, role, timestamp, body) VALUES (?,?,?,?,?,?)",
          )
          .run("m1", sessionId, 1, "user", 1.5, "{}"),
      ).toThrowError(/cannot store REAL value in INTEGER column/);
    });

    it("[실측] STRICT는 number → TEXT를 막지 않는다 — 그래서 바인딩 지점이 막는다", () => {
      const sessionId = newSessionId();
      db.prepare(
        "INSERT INTO messages (id, session_id, seq, role, timestamp, body) VALUES (?,?,?,?,?,?)",
      )
        // biome-ignore lint/suspicious/noExplicitAny: 계약이 아니라 DB의 실제 동작을 고정하는 검사다
        .run("m1", sessionId, 1, 42 as any, 1, "{}");

      // 조용히 "42.0"이 된다. 이 사실이 `bind.ts`의 존재 이유다.
      expect(db.prepare("SELECT role FROM messages WHERE id = 'm1'").get()).toEqual({
        role: "42.0",
      });
    });
  });

  describe("CHECK", () => {
    it("`sessions.active`에 2를 넣으면 거부한다", () => {
      const sessionId = newSessionId();
      expect(() =>
        db.prepare("UPDATE sessions SET active = 2 WHERE id = ?").run(sessionId),
      ).toThrowError(/CHECK constraint failed/);
    });

    it("`messages.active`에 2를 넣으면 거부한다", () => {
      const sessionId = newSessionId();
      expect(() =>
        db
          .prepare(
            "INSERT INTO messages (id, session_id, seq, role, timestamp, body, active) VALUES (?,?,?,?,?,?,?)",
          )
          .run("m1", sessionId, 1, "user", 1, "{}", 2),
      ).toThrowError(/CHECK constraint failed/);
    });
  });

  describe("FOREIGN KEY", () => {
    it("없는 `session_id`로 messages INSERT는 거부된다", () => {
      expect(() =>
        db
          .prepare(
            "INSERT INTO messages (id, session_id, seq, role, timestamp, body) VALUES (?,?,?,?,?,?)",
          )
          .run("m1", "no-such-session", 1, "user", 1, "{}"),
      ).toThrowError(/FOREIGN KEY constraint failed/);
    });

    it("없는 `parent_session_id`도 거부된다", () => {
      expect(() =>
        db
          .prepare(
            `INSERT INTO sessions (id, created_at, updated_at, workspace_root, system_prompt, model, parent_session_id)
             VALUES (?,?,?,?,?,?,?)`,
          )
          .run("s1", 1, 1, "/ws", "sp", "m", "no-such-parent"),
      ).toThrowError(/FOREIGN KEY constraint failed/);
    });
  });

  it("`messages(session_id, seq)`는 유일하다", () => {
    const sessionId = newSessionId();
    const insert = db.prepare(
      "INSERT INTO messages (id, session_id, seq, role, timestamp, body) VALUES (?,?,?,?,?,?)",
    );
    insert.run("m1", sessionId, 1, "user", 1, "{}");
    expect(() => insert.run("m2", sessionId, 1, "user", 1, "{}")).toThrowError(
      /UNIQUE constraint failed/,
    );
  });
});
