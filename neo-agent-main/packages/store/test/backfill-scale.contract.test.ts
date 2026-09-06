/**
 * v3 백필 — **실사용 규모 실측** (QA-A, 플랜 §4 T-005 실측 1).
 *
 * `schema-v3.contract.test.ts`가 v3 DDL 형상·원자성·D-1·B-13을 소형 픽스처로 고정한다.
 * 이 파일은 그것과 **겹치지 않고** 플랜이 실측 1에서 명시한 세 가지만 담당한다:
 *
 *   > "실사용 규모 모사 DB(**세션 수십·메시지 수백·압축 체인**·soft-delete 포함)를
 *   >  v1→v2→v3로 승격 — 백필 결과가 '재백필과 동일'(결정성) + FTS 행 수 = 검색 가능
 *   >  텍스트 보유 메시지 수(대칭)"
 *
 * 소형 픽스처로는 잡히지 않는 것이 셋 있어서 규모가 계약의 일부다:
 *   1. **압축 체인** — 같은 message_id가 부모·자식 두 세션에 존재한다(v2 PK가 그래서
 *      바뀌었다). 백필이 `message_id`를 키로 삼거나 DISTINCT를 걸면 한쪽이 사라지는데,
 *      체인이 없는 픽스처에서는 그 결함이 보이지 않는다.
 *   2. **삽입 순서의 결정성** — 행이 8개면 어떤 순서든 우연히 같아 보인다.
 *   3. **백필 시간** — 플랜 R-1이 "수 초 초과면 중단·보고"로 고립한 미지수.
 *
 * 기대값의 출처는 계약 문서뿐이다 — `docs/SEARCH.md` §2(마이그레이션)·§3(색인 대상 표와
 * 대칭 불변 조건), `docs/SESSION-STORE.md` §2(마이그레이션 규율)·§5(압축 체인은 선형).
 * 추출 규칙은 아래 `expectedSearchText()`로 **독립 구현**했다 — 구현의 `extractSearchText`를
 * 임포트해 기대값을 만들면 그 함수가 틀렸을 때 테스트가 함께 틀린다.
 *
 * 판정 기준: **원인 쪽이 미규정이어도 문서가 금지한 결과가 나오면 위반이다.**
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
import type { AgentMessage } from "@neo-agent/core";
import { openSessionStore, readSchemaVersion } from "@neo-agent/store";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// ───────────────────────────────────────────────────────────────────────────
// 동결된 v2 최종 형상 — 2026-08-07 기준. **구현을 따라 갱신하지 않는다.**
//
// `schema-v3.contract.test.ts`에도 같은 상수가 있다. 공유하지 않는 이유는 동결의
// 의미 때문이다 — 한 곳에서 꺼내 쓰면 그 한 곳이 바뀔 때 두 파일의 픽스처가 함께
// 움직여 "과거 디스크의 v2"라는 전제가 조용히 사라진다. 동결 상수는 복제가 맞다.
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
// 추출 규칙 — SEARCH §3 표를 독립적으로 옮긴 것
// ───────────────────────────────────────────────────────────────────────────

/** `UserMessage`·`AssistantMessage`의 `TextContent`만, `"\n\n"` 결합, 없으면 undefined */
function expectedSearchText(message: AgentMessage): string | undefined {
  if (message.role === "toolResult") return undefined;
  const texts = message.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .filter((text) => text.length > 0);
  if (texts.length === 0) return undefined;
  return texts.join("\n\n");
}

// ───────────────────────────────────────────────────────────────────────────
// 규모 픽스처 — 결정적으로 생성한다(난수가 있으면 두 벌 비교가 불가능하다)
// ───────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = "시스템프롬프트고유문자열";
const MODEL = "model-x";
const USAGE = { input: 10, output: 20, cacheRead: 0, cacheWrite: 0 };

/** 세션 수 — "수십" */
const SESSION_COUNT = 30;
/** 세션당 턴 수 — 총 메시지가 "수백"이 되도록 */
const TURNS_PER_SESSION = 7;

/** 압축 체인: 부모 27 → 자식 30 (자식이 체인 tip) */
const CHAIN_PARENT = 27;
const CHAIN_CHILD = 30;
/** soft-delete된 세션 */
const DELETED_SESSIONS = new Set([28, 29]);

function sessionId(n: number): string {
  return `s${String(n).padStart(4, "0")}-0000-4000-8000-000000000000`;
}

interface SessionFixture {
  id: string;
  active: number;
  parentSessionId: string | null;
  title: string | null;
}

interface MessageFixture {
  sessionId: string;
  seq: number;
  active: number;
  message: AgentMessage;
}

interface Fixture {
  sessions: SessionFixture[];
  messages: MessageFixture[];
}

function buildScaleFixture(): Fixture {
  const sessions: SessionFixture[] = [];
  const messages: MessageFixture[] = [];

  for (let s = 1; s <= SESSION_COUNT; s += 1) {
    sessions.push({
      id: sessionId(s),
      active: DELETED_SESSIONS.has(s) ? 0 : 1,
      parentSessionId: s === CHAIN_CHILD ? sessionId(CHAIN_PARENT) : null,
      title: s % 3 === 0 ? null : `세션 ${s}`,
    });
  }

  for (let s = 1; s <= SESSION_COUNT; s += 1) {
    // 체인 자식은 아래에서 [요약, ...kept]로 따로 만든다.
    if (s === CHAIN_CHILD) continue;

    const id = sessionId(s);
    let seq = 1;
    const push = (message: AgentMessage, active = 1): void => {
      messages.push({ sessionId: id, seq, active, message });
      seq += 1;
    };
    const mid = (): string => `m-${String(s).padStart(4, "0")}-${String(seq).padStart(3, "0")}`;
    const ts = (): number => s * 10_000 + seq;

    for (let turn = 1; turn <= TURNS_PER_SESSION; turn += 1) {
      push({
        id: mid(),
        role: "user",
        content: [{ type: "text", text: `세션${s} 질문${turn} — 압축 설정 검색을 다뤘다` }],
        timestamp: ts(),
      });

      if (turn === 2) {
        // 텍스트 없는 어시스턴트(도구 호출만) + 도구 결과 — 둘 다 색인 밖
        push({
          id: mid(),
          role: "assistant",
          content: [{ type: "toolCall", toolCallId: `c${s}-${turn}`, toolName: "read", args: {} }],
          stopReason: "tool_use",
          usage: USAGE,
          timestamp: ts(),
        });
        push({
          id: mid(),
          role: "toolResult",
          toolCallId: `c${s}-${turn}`,
          toolName: "read",
          content: [{ type: "text", text: "도구출력덤프고유어" }],
          isError: false,
          source: "local",
          timestamp: ts(),
        });
        continue;
      }

      if (turn === 4) {
        // thinking만 — 색인 밖
        push({
          id: mid(),
          role: "assistant",
          content: [{ type: "thinking", text: "숨은사고블록고유어" }],
          stopReason: "end_turn",
          usage: USAGE,
          timestamp: ts(),
        });
        continue;
      }

      // 다중 텍스트 블록 — `"\n\n"` 결합 대상
      push({
        id: mid(),
        role: "assistant",
        content: [
          { type: "text", text: `세션${s} 답변${turn} 앞 단락` },
          { type: "text", text: `세션${s} 답변${turn} 뒤 단락` },
        ],
        stopReason: "end_turn",
        usage: USAGE,
        timestamp: ts(),
      });
    }

    // 이미지만 보낸 발화 — 색인 밖
    push({
      id: mid(),
      role: "user",
      content: [{ type: "image", mimeType: "image/png", data: "aW1hZ2Vvbmx5" }],
      timestamp: ts(),
    });
    // 비활성 메시지 행 — 백필 대상이다(제외는 검색의 책임, §3·§4)
    push(
      {
        id: mid(),
        role: "user",
        content: [{ type: "text", text: `세션${s} 비활성행고유어` }],
        timestamp: ts(),
      },
      0,
    );
  }

  // ── 압축 체인 ──────────────────────────────────────────────────────────
  // 자식 = [요약, ...부모의 마지막 활성 메시지 3건]. kept는 **같은 id로** 복사된다
  // (COMPACTION §2 메시지 동일성 보존) — 백필이 이 이중 존재를 보존해야 한다.
  const parentActive = messages.filter(
    (row) => row.sessionId === sessionId(CHAIN_PARENT) && row.active === 1,
  );
  const kept = parentActive.slice(-3);
  const childId = sessionId(CHAIN_CHILD);
  messages.push({
    sessionId: childId,
    seq: 1,
    active: 1,
    message: {
      id: "m-summary-chain",
      role: "user",
      content: [{ type: "text", text: "지금까지의 대화 요약 — 요약본만아는고유어" }],
      timestamp: 999_000,
    },
  });
  kept.forEach((row, index) => {
    messages.push({ sessionId: childId, seq: index + 2, active: 1, message: row.message });
  });

  return { sessions, messages };
}

/** 백필되어야 하는 (session_id, message_id, text) — 기대값 */
interface FtsRow {
  text: string;
  session_id: string;
  message_id: string;
}

function expectedFtsRows(fixture: Fixture): FtsRow[] {
  const rows: FtsRow[] = [];
  for (const row of fixture.messages) {
    const text = expectedSearchText(row.message);
    if (text === undefined) continue;
    rows.push({ text, session_id: row.sessionId, message_id: row.message.id });
  }
  return rows;
}

function sortRows(rows: readonly FtsRow[]): FtsRow[] {
  return [...rows].sort((a, b) => {
    const left = `${a.session_id}\u0000${a.message_id}\u0000${a.text}`;
    const right = `${b.session_id}\u0000${b.message_id}\u0000${b.text}`;
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

// ───────────────────────────────────────────────────────────────────────────
// 하네스
// ───────────────────────────────────────────────────────────────────────────

let sandbox: string;
let homeA: string;
let homeB: string;
let workspaceRoot: string;
let fixture: Fixture;

const dbPath = (home: string): string => join(home, ".neo-agent", "sessions.db");

function withRawDb<T>(home: string, fn: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(dbPath(home));
  try {
    db.exec("PRAGMA foreign_keys = ON");
    return fn(db);
  } finally {
    db.close();
  }
}

/**
 * 동결 DDL로 v2 실데이터 DB를 만든다 — 저장소 코드를 전혀 지나지 않는다.
 *
 * 삽입 전량을 **명시 트랜잭션 하나**로 감싼다. 이것은 픽스처 구축의 비용 문제일 뿐
 * 계약이 아니다 — 커밋 후 디스크에 남는 v2 DB의 내용은 자동커밋으로 넣었을 때와
 * 같고, 이 파일의 축들이 재는 것은 그 **내용**이 승격에서 어떻게 되는가다.
 * 감싸지 않으면 행 하나마다 `fsync`가 한 번씩 돌아(530행 = 530회) 픽스처 한 벌에
 * 825ms가 든다 — `ARCHITECTURE.md` §2.21이 처분 갈래의 첫째로 둔 「그 축이 하는
 * 일이 정당하게 그만큼 걸리는가」에 이 자리는 **아니다**로 답한다. 실제 승격(백필)은
 * 12ms이고 나머지 전부가 이 fsync였다(2026-09-06 실측 · T-005).
 *
 * FK는 켜진 채이고 SQLite의 즉시 FK는 트랜잭션 안에서도 문(statement)마다 검사되므로
 * 아래 부모-먼저 삽입 순서는 여전히 필요하다 — 트랜잭션이 그 규율을 느슨하게 하지 않는다.
 */
function createV2Fixture(home: string): void {
  mkdirSync(join(home, ".neo-agent"), { recursive: true });
  const db = new DatabaseSync(dbPath(home));
  try {
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(SCHEMA_V2_FROZEN);
    db.exec("BEGIN");

    const insertVersion = db.prepare(
      "INSERT INTO schema_version (version, applied_at) VALUES (?, ?)",
    );
    insertVersion.run(1, 1_000);
    insertVersion.run(2, 2_000);

    const insertSession = db.prepare(
      `INSERT INTO sessions
         (id, created_at, updated_at, title, workspace_root, system_prompt, model, parent_session_id, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    // FK가 켜져 있으므로 부모를 먼저 넣는다.
    for (const session of fixture.sessions.filter((s) => s.parentSessionId === null)) {
      insertSession.run(
        session.id,
        1_000,
        5_000,
        session.title,
        workspaceRoot,
        SYSTEM_PROMPT,
        MODEL,
        null,
        session.active,
      );
    }
    for (const session of fixture.sessions.filter((s) => s.parentSessionId !== null)) {
      insertSession.run(
        session.id,
        1_000,
        5_000,
        session.title,
        workspaceRoot,
        SYSTEM_PROMPT,
        MODEL,
        session.parentSessionId,
        session.active,
      );
    }

    const insertMessage = db.prepare(
      `INSERT INTO messages (id, session_id, seq, role, timestamp, body, active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const row of fixture.messages) {
      insertMessage.run(
        row.message.id,
        row.sessionId,
        row.seq,
        row.message.role,
        row.message.timestamp,
        JSON.stringify(row.message),
        row.active,
      );
    }

    db.exec("COMMIT");
  } finally {
    // 위에서 예외가 나면 트랜잭션이 열린 채로 남는다 — `close()`가 그것을 롤백하므로
    // 디스크에는 반쪽 픽스처가 남지 않는다(픽스처가 조용히 작아지는 경로를 막는다).
    db.close();
  }
}

/** 열기 = 마이그레이션 트리거. 소요 시간(ms)을 돌려준다 */
function openAndClose(home: string): number {
  const started = performance.now();
  openSessionStore({ home, onWarning: () => {} }).close();
  return performance.now() - started;
}

function ftsSorted(home: string): FtsRow[] {
  return sortRows(
    withRawDb(
      home,
      (db) =>
        db
          .prepare("SELECT text, session_id, message_id FROM messages_fts")
          .all() as unknown as FtsRow[],
    ),
  );
}

/** 삽입 순서(rowid) 그대로 */
function ftsByRowid(home: string): FtsRow[] {
  return withRawDb(
    home,
    (db) =>
      db
        .prepare("SELECT text, session_id, message_id FROM messages_fts ORDER BY rowid")
        .all() as unknown as FtsRow[],
  );
}

beforeEach(() => {
  sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-qaa-scale-")));
  homeA = join(sandbox, "homeA");
  homeB = join(sandbox, "homeB");
  workspaceRoot = join(sandbox, "ws");
  for (const dir of [homeA, homeB, workspaceRoot]) mkdirSync(dir, { recursive: true });
  fixture = buildScaleFixture();
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// 0. 표본이 플랜이 요구한 규모인가 — 실측의 전제를 테스트가 스스로 증명한다
// ═══════════════════════════════════════════════════════════════════════════

describe("표본 전제 (플랜 §4 T-005 실측 1)", () => {
  it("세션 수십 · 메시지 수백이다", () => {
    expect(fixture.sessions.length).toBe(SESSION_COUNT);
    expect(fixture.messages.length).toBeGreaterThanOrEqual(200);
  });

  it("압축 체인 1쌍 · soft-delete 세션 · 비활성 메시지 행을 포함한다", () => {
    expect(fixture.sessions.filter((s) => s.parentSessionId !== null)).toHaveLength(1);
    expect(fixture.sessions.filter((s) => s.active === 0)).toHaveLength(DELETED_SESSIONS.size);
    expect(fixture.messages.some((m) => m.active === 0)).toBe(true);
  });

  it("같은 message_id가 두 세션에 존재한다 — 체인의 kept 복사", () => {
    const byId = new Map<string, Set<string>>();
    for (const row of fixture.messages) {
      const set = byId.get(row.message.id) ?? new Set<string>();
      set.add(row.sessionId);
      byId.set(row.message.id, set);
    }
    const shared = [...byId.entries()].filter(([, sessions]) => sessions.size > 1);
    expect(shared.length).toBeGreaterThanOrEqual(3);
  });

  it("색인 밖 메시지가 실제로 있다 — 대칭 검증이 자명해지지 않게", () => {
    const indexed = expectedFtsRows(fixture).length;
    expect(indexed).toBeLessThan(fixture.messages.length);
    // 제외 근거 4종이 전부 표본에 있는가
    expect(fixture.messages.some((m) => m.message.role === "toolResult")).toBe(true);
    expect(
      fixture.messages.some(
        (m) => m.message.role === "assistant" && expectedSearchText(m.message) === undefined,
      ),
    ).toBe(true);
    expect(
      fixture.messages.some(
        (m) => m.message.role === "user" && expectedSearchText(m.message) === undefined,
      ),
    ).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. 대칭 — FTS 행 존재 ⇔ 검색 가능 텍스트 존재 (SEARCH §3 불변 조건)
// ═══════════════════════════════════════════════════════════════════════════

describe("규모 백필의 대칭 (SEARCH §3)", () => {
  beforeEach(() => {
    createV2Fixture(homeA);
  });

  it("승격이 성공하고 버전이 3이 된다", () => {
    openAndClose(homeA);
    expect(withRawDb(homeA, readSchemaVersion)).toBe(3);
  });

  it("FTS 행 수 = 검색 가능 텍스트를 가진 메시지 수", () => {
    openAndClose(homeA);
    expect(ftsSorted(homeA)).toHaveLength(expectedFtsRows(fixture).length);
  });

  it("FTS 내용이 §3 추출 규칙의 기대값과 정확히 일치한다", () => {
    openAndClose(homeA);
    // 행 수만 맞고 내용이 어긋나는 경우를 잡으려 삼중쌍 전체를 비교한다.
    expect(ftsSorted(homeA)).toEqual(sortRows(expectedFtsRows(fixture)));
  });

  it("승격이 기존 v2 행을 변경하지 않는다", () => {
    const before = withRawDb(homeA, (db) =>
      db
        .prepare(
          "SELECT id, session_id, seq, role, timestamp, body, active FROM messages ORDER BY session_id, seq",
        )
        .all(),
    );
    openAndClose(homeA);
    const after = withRawDb(homeA, (db) =>
      db
        .prepare(
          "SELECT id, session_id, seq, role, timestamp, body, active FROM messages ORDER BY session_id, seq",
        )
        .all(),
    );
    expect(after).toEqual(before);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. 압축 체인 — 같은 id의 이중 존재가 백필에서 보존되는가 (SEARCH §3)
// ═══════════════════════════════════════════════════════════════════════════

describe("압축 체인의 kept 복사 백필 (SEARCH §3)", () => {
  beforeEach(() => {
    createV2Fixture(homeA);
    openAndClose(homeA);
  });

  it("같은 message_id가 부모·자식 두 session_id로 색인된다", () => {
    // 색인 쪽에 dedupe 예외를 두면 "messages 행과 FTS 행의 대칭"이 깨진다(§3).
    // 중복 제거는 검색 쿼리의 책임이다(§4) — 백필이 미리 지우면 부모 매치가 사라진다.
    const rows = ftsSorted(homeA);
    const parent = sessionId(CHAIN_PARENT);
    const child = sessionId(CHAIN_CHILD);

    // 자식에 복사된 kept 메시지들 — 색인 대상인 것만 남긴다.
    const kept = fixture.messages.filter(
      (row) =>
        row.sessionId === child &&
        row.message.id !== "m-summary-chain" &&
        expectedSearchText(row.message) !== undefined,
    );
    expect(kept.length).toBeGreaterThan(0);

    for (const row of kept) {
      const found = rows.filter((fts) => fts.message_id === row.message.id);
      expect(found.map((fts) => fts.session_id).sort()).toEqual([child, parent].sort());
    }
  });

  it("체인 자식의 요약(합성 UserMessage)도 색인된다", () => {
    // SEARCH §3: "압축 요약(합성 UserMessage)도 여기 포함된다" — 압축된 대화가
    // 요약 경유로도 검색되어야 하므로, 합성 여부로 분기하면 계약 위반이다.
    const rows = ftsSorted(homeA);
    const summary = rows.filter((row) => row.message_id === "m-summary-chain");
    expect(summary).toHaveLength(1);
    expect(summary[0]?.session_id).toBe(sessionId(CHAIN_CHILD));
    expect(summary[0]?.text).toContain("요약본만아는고유어");
  });

  it("soft-delete된 세션의 메시지도 백필된다 — 제외는 검색의 책임", () => {
    const rows = new Set(ftsSorted(homeA).map((row) => `${row.session_id}\u0000${row.message_id}`));
    const deleted = fixture.messages.filter((row) =>
      [...DELETED_SESSIONS].some((n) => sessionId(n) === row.sessionId),
    );
    expect(deleted.length).toBeGreaterThan(0);
    for (const row of deleted) {
      if (expectedSearchText(row.message) === undefined) continue;
      expect(rows.has(`${row.sessionId}\u0000${row.message.id}`)).toBe(true);
    }
  });

  it("`active = 0` 메시지 행도 백필된다", () => {
    const rows = new Set(ftsSorted(homeA).map((row) => `${row.session_id}\u0000${row.message_id}`));
    const inactive = fixture.messages.filter((row) => row.active === 0);
    expect(inactive.length).toBeGreaterThan(0);
    for (const row of inactive) {
      if (expectedSearchText(row.message) === undefined) continue;
      expect(rows.has(`${row.sessionId}\u0000${row.message.id}`)).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. 결정성 (플랜 §4 실측 1 "재백필과 동일")
// ═══════════════════════════════════════════════════════════════════════════

describe("규모 백필의 결정성", () => {
  beforeEach(() => {
    createV2Fixture(homeA);
    createV2Fixture(homeB);
  });

  it("같은 v2 입력 두 벌의 FTS 내용이 동일하다", () => {
    // [미규정 A-9] "재백필과 동일"의 직접 재현은 불가능하다 — 재구축은 사용자 노출
    // 명령이 아니고(SEARCH §3) 마이그레이션은 앞으로만 간다. 같은 입력을 두 번 백필한
    // 결과의 동일성으로 판정했다. 판정 요청: 이 해석이 플랜이 요구한 것과 같은지.
    openAndClose(homeA);
    openAndClose(homeB);
    expect(ftsSorted(homeB)).toEqual(ftsSorted(homeA));
  });

  it("삽입 순서(rowid)까지 동일하다", () => {
    // [미규정 A-10] 삽입 순서를 계약으로 볼지 미규정. 근거: bm25는 동점 문서를
    // rowid로 가르므로, 순서가 흔들리면 **같은 질의의 결과 순서가 DB마다 달라진다**
    // — 사용자에게는 검색이 재현 불가능해 보인다. 판정 요청: 백필에 고정 순서
    // (예: `ORDER BY session_id, seq`)를 계약으로 명문화할 것인지.
    openAndClose(homeA);
    openAndClose(homeB);
    expect(ftsByRowid(homeB)).toEqual(ftsByRowid(homeA));
  });

  it("승격된 DB를 다시 열어도 FTS 행이 늘지 않는다 — 백필은 1회다", () => {
    openAndClose(homeA);
    const first = ftsSorted(homeA);
    openAndClose(homeA);
    openAndClose(homeA);
    expect(ftsSorted(homeA)).toEqual(first);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. 백필 소요 시간 (플랜 §8 R-1 — "수 초 초과면 중단·보고")
// ═══════════════════════════════════════════════════════════════════════════

describe("백필 소요 시간 (플랜 R-1)", () => {
  it("실사용 규모에서 백필이 수 초를 넘지 않는다", () => {
    createV2Fixture(homeA);
    const elapsed = openAndClose(homeA);

    // 실사용 DB는 메시지 17행(플랜 §8 착수 시점 실측)이고 이 표본은 그보다 10배 이상
    // 크다. 여기서 수 초가 나오면 실사용에서도 체감되므로 R-1의 중단·보고 조건이다.
    // 수치는 실행 로그에 남긴다 — 통과/실패가 아니라 값이 근거다.
    console.log(
      `[QA-A 실측] v2→v3 백필: 메시지 ${fixture.messages.length}행 → FTS ${expectedFtsRows(fixture).length}행, ${elapsed.toFixed(1)}ms`,
    );
    expect(elapsed).toBeLessThan(5_000);
  });
});
