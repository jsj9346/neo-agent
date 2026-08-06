import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../src/open.ts";
import { createSession, getSession, listSessions, resolveSessionId } from "../src/sessions.ts";

describe("세션 CRUD", () => {
  let sandbox: string;
  let db: DatabaseSync;

  beforeEach(() => {
    sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-sessions-")));
    db = openDatabase({ path: join(sandbox, "sessions.db"), onWarning: () => {} });
  });

  afterEach(() => {
    db.close();
    rmSync(sandbox, { recursive: true, force: true });
  });

  const init = {
    workspaceRoot: "/ws",
    systemPrompt: "You are neo-agent.",
    model: "claude-opus-5",
  };

  describe("createSession", () => {
    it("행을 만들고 그대로 돌려준다", () => {
      const session = createSession(db, init);

      expect(session).toEqual({
        id: expect.any(String),
        title: null,
        workspaceRoot: "/ws",
        systemPrompt: "You are neo-agent.",
        model: "claude-opus-5",
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
        parentSessionId: null,
      });
      expect(getSession(db, session.id)).toEqual(session);
    });

    it("id는 UUID다", () => {
      expect(createSession(db, init).id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it("id가 세션마다 다르다", () => {
      const ids = new Set(Array.from({ length: 32 }, () => createSession(db, init).id));
      expect(ids.size).toBe(32);
    });

    it("`parent_session_id`는 v1에서 항상 NULL이다", () => {
      createSession(db, init);
      createSession(db, init);
      expect(
        db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE parent_session_id IS NOT NULL").get(),
      ).toEqual({
        n: 0,
      });
    });

    it("`active`는 1로 시작한다", () => {
      const session = createSession(db, init);
      expect(db.prepare("SELECT active FROM sessions WHERE id = ?").get(session.id)).toEqual({
        active: 1,
      });
    });

    it("createdAt·updatedAt이 INTEGER로 저장된다", () => {
      const session = createSession(db, init);
      expect(
        db
          .prepare(
            "SELECT typeof(created_at) AS c, typeof(updated_at) AS u FROM sessions WHERE id = ?",
          )
          .get(session.id),
      ).toEqual({ c: "integer", u: "integer" });
    });
  });

  describe("listSessions", () => {
    it("최근 갱신 순으로 돌려준다", () => {
      const first = createSession(db, init);
      const second = createSession(db, init);
      // 같은 밀리초에 만들어질 수 있으므로 순서를 명시적으로 벌린다.
      db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(1_000, first.id);
      db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(2_000, second.id);

      expect(listSessions(db).map((session) => session.id)).toEqual([second.id, first.id]);
    });

    it("limit을 지킨다", () => {
      for (let i = 0; i < 5; i += 1) createSession(db, init);
      expect(listSessions(db, 2)).toHaveLength(2);
    });

    it("limit 없이 부르면 전부 돌려준다", () => {
      for (let i = 0; i < 5; i += 1) createSession(db, init);
      expect(listSessions(db)).toHaveLength(5);
    });

    it("`active = 0`인 세션은 빠진다", () => {
      const kept = createSession(db, init);
      const hidden = createSession(db, init);
      db.prepare("UPDATE sessions SET active = 0 WHERE id = ?").run(hidden.id);

      expect(listSessions(db).map((session) => session.id)).toEqual([kept.id]);
    });

    it("빈 DB에서는 빈 배열이다", () => {
      expect(listSessions(db)).toEqual([]);
    });
  });

  describe("resolveSessionId", () => {
    it("유일한 접두는 해석된다", () => {
      const session = createSession(db, init);
      expect(resolveSessionId(db, session.id.slice(0, 8))).toBe(session.id);
    });

    it("전체 id도 해석된다", () => {
      const session = createSession(db, init);
      expect(resolveSessionId(db, session.id)).toBe(session.id);
    });

    it("모호하면 던진다 — 조용히 하나를 고르지 않는다", () => {
      // 접두가 겹치는 두 세션을 직접 만들어 모호성을 결정적으로 재현한다.
      const insert = db.prepare(
        `INSERT INTO sessions (id, created_at, updated_at, workspace_root, system_prompt, model)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      insert.run("abcdef-1", 1, 1, "/ws", "sp", "m");
      insert.run("abcdef-2", 1, 1, "/ws", "sp", "m");

      expect(() => resolveSessionId(db, "abcdef")).toThrowError(/ambiguous/);
    });

    it("매칭이 없으면 던진다", () => {
      createSession(db, init);
      expect(() => resolveSessionId(db, "zzzzzzzz")).toThrowError(/No session matches/);
    });

    it("빈 DB에서도 던진다", () => {
      expect(() => resolveSessionId(db, "a")).toThrowError(/No session matches/);
    });

    it("LIKE 와일드카드를 문자 그대로 다룬다", () => {
      const insert = db.prepare(
        `INSERT INTO sessions (id, created_at, updated_at, workspace_root, system_prompt, model)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      insert.run("abc", 1, 1, "/ws", "sp", "m");
      insert.run("a_c", 1, 1, "/ws", "sp", "m");

      // LIKE였다면 `a_c`가 `abc`까지 매칭해 모호 판정이 났을 것이다.
      expect(resolveSessionId(db, "a_c")).toBe("a_c");
      expect(resolveSessionId(db, "abc")).toBe("abc");
      // `%`도 마찬가지 — 전체 매칭 와일드카드가 아니라 없는 문자다.
      expect(() => resolveSessionId(db, "%")).toThrowError(/No session matches/);
    });
  });

  describe("getSession", () => {
    it("없는 세션은 undefined다", () => {
      expect(getSession(db, "no-such-id")).toBeUndefined();
    });

    it("title이 채워진 세션도 그대로 읽는다", () => {
      const session = createSession(db, init);
      db.prepare("UPDATE sessions SET title = ? WHERE id = ?").run("첫 질문", session.id);
      expect(getSession(db, session.id)?.title).toBe("첫 질문");
    });
  });
});
