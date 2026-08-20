/**
 * store 격차 계약 — `deleteSession`과 `resolveSessionId` 소문자 정규화 (QA-B).
 *
 * **이 파일은 구현보다 먼저 쓰였고, 그 격차는 닫혔다.** 두 계약은 2026-08-06 CLI
 * 설계에서 확정된 문서상 계약이었고 당시 `packages/store` 구현에는 없었다 — §5가
 * "계약-구현 격차 (의도적)"이라 선언한 상태다. 그 선언은 같은 날 CLI 구현에서
 * 취소선으로 닫혔고(이 테스트가 선행하고 구현이 통과했다), 지금은 둘 다 구현돼 있다.
 *
 * **그러므로 여기가 빨간불이면 그것은 회귀다.** 한때 이 자리에 그 반대(빨간불이
 * 정상이라는 안내)가 적혀 있었으나 그것은 격차가 열려 있던 동안의 문장이고, 남겨
 * 두면 **미래의 빨간불을 미리 정당화한다** — 진짜 회귀로 깨졌을 때 읽는 사람에게
 * 원래 실패하는 파일이라고 알려주게 된다. 2026-08-12에 걷었다.
 *
 * 기대값의 출처:
 *   - `docs/SESSION-STORE.md` §5 — `deleteSession` 규정("soft-delete — sessions.active = 0
 *     … 삭제된 세션은 listSessions·resolveSessionId에서 제외"), `resolveSessionId`
 *     규정("입력은 소문자로 정규화한 뒤 매칭한다 … 모호하면 throw")
 *   - `docs/CLI-INTERFACE.md` §6 — 같은 두 계약의 CLI 측 서술과 근거(RFC 9562)
 *
 * **기대값은 구현 코드에서 도출하지 않았다.** 이 파일이 쓰일 당시 `resolveSessionId`는
 * "`active` 여부로 거르지 않는다"고 주석에 명시하고 있었고, §5가 정반대를 규정하므로
 * **테스트는 문서 편에 섰다**. 구현이 뒤따라와 지금은 주석도 §5를 인용한다 — 즉 이
 * 대목은 해소된 과거이고, 테스트가 문서 편에 선 것이 옳았다는 기록으로 남긴다.
 *
 * 판정 기준: **원인 쪽이 미규정이어도 문서가 금지한 결과가 나오면 위반이다.**
 * 회색지대는 임의 판정하지 않고 파일 말미의 미규정 블록에 판정 요청으로 모았다.
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
import { Agent } from "@neo-agent/core";
import { openSessionStore, type SessionStore } from "@neo-agent/store";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ScriptedModel } from "./contract-harness.ts";

/**
 * `deleteSession`은 §5의 `SessionStore`에 있으나 구현 타입에는 아직 없다. 타입을
 * 넓혀 접근하되 **존재 여부는 런타임에 확인한다** — 없을 때 `is not a function`이라는
 * 진단 불가능한 TypeError 대신 "계약 미구현"이라고 말하게 만든다.
 */
type GapStore = SessionStore & { deleteSession?: (id: string) => void };

let sandbox: string;
let home: string;
let workspaceRoot: string;
let store: SessionStore;

const dbPath = (): string => join(home, ".neo-agent", "sessions.db");

function withAdminDb<T>(fn: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(dbPath());
  try {
    db.exec("PRAGMA foreign_keys = ON");
    return fn(db);
  } finally {
    db.close();
  }
}

/** 미구현과 계약 위반을 구분해 보고하기 위한 얇은 래퍼 */
function deleteSession(id: string): void {
  const fn = (store as GapStore).deleteSession;
  if (typeof fn !== "function") {
    throw new Error(
      "계약 미구현: SessionStore.deleteSession이 없다 (SESSION-STORE §5 — 의도된 격차)",
    );
  }
  fn.call(store, id);
}

/**
 * `.toThrow()`는 메서드가 없을 때도 통과한다 — 미구현 상태에서 거부 단정이 공허하게
 * 초록불이 되는 것을 막는다(`resume.contract.test.ts`와 같은 헬퍼).
 */
function expectRejects(fn: () => unknown): void {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  expect(String((caught as Error).message)).not.toMatch(/is not a function/);
}

/**
 * **모호 판정과 "매칭 없음"은 둘 다 throw라 구조만으로는 구분되지 않는다.** 정규화가
 * 없는 구현에서 대문자 입력은 0건 매칭이 되므로 `expectRejects`가 통과해 버린다 —
 * 실측으로 확인한 공허한 초록불이다. 그래서 에러가 "모호"를 말하는지까지 본다.
 *
 * 문구 자체는 `SESSION-STORE.md` 머리가 "조정 가능(세부)"로 분류한 영역이다. 구현이
 * 다른 표현을 쓰면 이 정규식을 넓히는 것이 옳은 조정이다 — **계약은 "모호를 매칭
 * 없음과 구분해 알린다"이지 특정 문자열이 아니다.**
 */
function expectRejectsAsAmbiguous(fn: () => unknown): void {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  const message = String((caught as Error).message);
  expect(message).not.toMatch(/is not a function/);
  expect(message).toMatch(/ambiguous|모호|more than one|multiple|여러/i);
}

/**
 * id를 지정해 세션을 만든다. `createSession`은 `crypto.randomUUID()`를 발급하므로
 * **접두를 공유하는 두 세션**(모호성 판정의 재료)을 API로는 만들 수 없다. 스키마는
 * id 형식을 제약하지 않으며, 여기 쓰는 값은 전부 UUID 형태의 소문자 hex다 —
 * §5가 정규화의 근거로 든 "id는 소문자 hex뿐"이라는 전제를 깨지 않는다.
 */
function insertSessionWithId(id: string): string {
  const now = Date.now();
  withAdminDb((db) =>
    db
      .prepare(
        `INSERT INTO sessions
           (id, created_at, updated_at, title, workspace_root, system_prompt, model, parent_session_id, active)
         VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, 1)`,
      )
      .run(id, now, now, workspaceRoot, "SP", "model-x"),
  );
  return id;
}

/** 한 런을 실제 경로(attach → prompt)로 저장한다 — 메시지 행의 재료 */
async function recordRun(sessionId: string): Promise<void> {
  const model = new ScriptedModel([{ text: "응답" }]);
  const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });
  store.attach(agent, sessionId);
  await agent.prompt("질문");
  await agent.waitForIdle();
}

function countMessageRows(sessionId: string): number {
  return withAdminDb((db) => {
    const row = db
      .prepare("SELECT COUNT(*) AS n FROM messages WHERE session_id = ?")
      .get(sessionId) as { n: number };
    return row.n;
  });
}

function sessionRow(id: string): { id: string; active: number } | undefined {
  return withAdminDb(
    (db) =>
      db.prepare("SELECT id, active FROM sessions WHERE id = ?").get(id) as
        | { id: string; active: number }
        | undefined,
  );
}

beforeEach(() => {
  sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-qab-gap-")));
  home = join(sandbox, "home");
  workspaceRoot = join(sandbox, "ws");
  mkdirSync(home, { recursive: true });
  mkdirSync(workspaceRoot, { recursive: true });
  store = openSessionStore({ home });
});

afterEach(() => {
  try {
    store.close();
  } catch {
    /* 이미 닫힘 */
  }
  rmSync(sandbox, { recursive: true, force: true });
});

const newSession = (): string =>
  store.createSession({ workspaceRoot, systemPrompt: "SP", model: "model-x" }).id;

// ───────────────────────────────────────────────────────────────────────────
// 1. deleteSession — soft-delete (SESSION-STORE §5, CLI-INTERFACE §6)
// ───────────────────────────────────────────────────────────────────────────

describe("deleteSession — soft-delete (SESSION-STORE §5)", () => {
  /**
   * 아래 단정들이 "메서드가 없어서" 통과하는 공허한 초록불이 되지 않게 하는 보증.
   * §5의 `SessionStore` 인터페이스가 `deleteSession(id: string): void`를 요구한다.
   */
  it("선행 조건: SessionStore.deleteSession이 존재한다", () => {
    expect(typeof (store as GapStore).deleteSession).toBe("function");
  });

  it("삭제된 세션은 listSessions에서 제외된다", () => {
    const kept = newSession();
    const removed = newSession();

    deleteSession(removed);

    const ids = store.listSessions().map((session) => session.id);
    expect(ids).toContain(kept);
    expect(ids).not.toContain(removed);
  });

  it("삭제는 대상 하나에만 적용된다 — 다른 세션은 그대로 남는다", () => {
    const a = newSession();
    const b = newSession();
    const c = newSession();

    deleteSession(b);

    const ids = store
      .listSessions()
      .map((session) => session.id)
      .sort();
    expect(ids).toEqual([a, c].sort());
  });

  /**
   * §5: "soft-delete — `sessions.active = 0`". **물리 삭제가 아니라는 것이 계약의
   * 내용 그 자체다** — 행이 사라지면 §9의 미결("soft-delete된 행의 물리 삭제 시점")
   * 이 성립할 수 없고, 복구 가능성도 함께 사라진다. API를 우회해 행을 직접 본다.
   */
  it("물리 삭제가 아니다 — sessions 행이 남고 active = 0이 된다", () => {
    const id = newSession();

    deleteSession(id);

    const row = sessionRow(id);
    expect(row).toBeDefined();
    expect(row?.active).toBe(0);
  });

  /**
   * §5는 세션 행의 `active`만 규정한다. 메시지 행에 대한 규정은 없으나, **행이
   * 물리 삭제되면 soft-delete가 아니다** — 원인 쪽(메시지의 active 값)이 미규정이어도
   * 문서가 금지한 결과(대화 소실)가 나오면 위반이다. 여기서는 `active` 값을 단정하지
   * 않고 **행의 존속만** 본다(미규정 지점을 임의 판정하지 않는다 — 말미 U-2).
   */
  it("메시지 행은 삭제되지 않는다", async () => {
    const id = newSession();
    await recordRun(id);
    const before = countMessageRows(id);
    expect(before).toBeGreaterThan(0);

    deleteSession(id);

    expect(countMessageRows(id)).toBe(before);
  });

  /**
   * §5: "삭제된 세션은 listSessions·**resolveSessionId**에서 제외".
   *
   * 현재 구현은 `active`로 거르지 않는다고 주석에 명시하고 있으므로 이 단정은
   * 실패한다 — 문서와 구현이 갈리는 지점이고, 테스트는 문서 편이다.
   */
  it("삭제된 세션은 resolveSessionId의 매칭 후보에서 빠진다", () => {
    const a = insertSessionWithId("ab12cdef-0000-4000-8000-00000000000a");
    const b = insertSessionWithId("ab12cdef-0000-4000-8000-00000000000b");

    // 삭제 전에는 두 세션이 접두를 공유하므로 모호하다 (기존 계약)
    expectRejectsAsAmbiguous(() => store.resolveSessionId("ab12cdef"));

    deleteSession(b);

    // 후보에서 빠지면 남은 하나가 유일해진다
    expect(store.resolveSessionId("ab12cdef")).toBe(a);
  });

  /** 파생 확인 — 다른 활성 세션이 없으면 "매칭 없음"이 된다 */
  it("삭제 후 같은 접두로 resolveSessionId 하면 매칭 없음 에러다", () => {
    const only = insertSessionWithId("cd34beef-0000-4000-8000-00000000000c");

    expect(store.resolveSessionId("cd34")).toBe(only);

    deleteSession(only);

    expectRejects(() => store.resolveSessionId("cd34"));
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. resolveSessionId — 소문자 정규화 (SESSION-STORE §5, CLI-INTERFACE §6)
// ───────────────────────────────────────────────────────────────────────────

describe("resolveSessionId — 소문자 정규화 (SESSION-STORE §5)", () => {
  /**
   * §5: "입력은 소문자로 정규화한 뒤 매칭한다 (2026-08-06 확정 — id는
   * `crypto.randomUUID()`의 소문자 hex뿐이라 정규화에 정보 손실이 없고, UUID 표기의
   * 대소문자는 구별 의미가 없다(RFC 9562). 대문자화된 접두를 거부하면 복사 과정에서
   * 대문자가 된 id를 이유 없이 막는다)."
   *
   * **id를 지정해 만든다.** `createSession`이 발급하는 UUID의 앞 8자가 우연히 전부
   * 숫자면(확률 약 2%) 대문자화가 값을 바꾸지 않아 정규화 없이도 통과한다 — 실측에서
   * 실제로 목격한 공허한 초록불이다. 대문자화가 반드시 값을 바꾸도록 글자를 고정한다.
   */
  it("대문자화된 접두로 소문자 id 세션이 매칭된다", () => {
    const id = insertSessionWithId("ab12cdef-0000-4000-8000-000000000001");

    expect(store.resolveSessionId("AB12CDEF")).toBe(id);
    expect(store.resolveSessionId("AB12")).toBe(id);
  });

  it("대소문자가 섞인 접두도 매칭된다", () => {
    const id = insertSessionWithId("dcba4321-0000-4000-8000-000000000001");

    expect(store.resolveSessionId("dCbA4321")).toBe(id);
  });

  /**
   * 여기만 실제 발급 id를 쓴다 — 32자 hex 전체가 숫자일 확률은 사실상 0이라
   * 대문자화가 값을 바꾸는 것이 보장되고, **발급 경로가 만든 id**로도 계약이
   * 성립하는지 확인한다(픽스처에만 통하는 정규화가 아니라는 보증).
   */
  it("id 전체를 대문자화해도 매칭된다", () => {
    const id = newSession();
    expect(store.resolveSessionId(id.toUpperCase())).toBe(id);
  });

  /** 기존 계약의 회귀 — 정규화 도입이 소문자 입력을 깨뜨리지 않는다 */
  it("소문자 접두는 그대로 매칭된다", () => {
    const id = newSession();
    expect(store.resolveSessionId(id.slice(0, 8))).toBe(id);
  });

  /**
   * 정규화는 **입력에만** 적용된다. 반환은 저장된 id여야 한다 — 대문자로 되돌려주면
   * 그 값으로 `loadSession`·`deleteSession`을 부르는 호출자가 조용히 빗나간다.
   */
  it("반환값은 저장된 소문자 id 그대로다 — 입력의 대소문자를 되돌려주지 않는다", () => {
    const id = insertSessionWithId("fedcba98-0000-4000-8000-000000000001");
    const resolved = store.resolveSessionId("FEDCBA98");

    expect(resolved).toBe(id);
    expect(resolved).toBe(resolved.toLowerCase());
  });

  /**
   * §5: "모호하면 throw — 조용히 하나를 고르지 않는다." 판정은 **정규화 후**에
   * 이뤄져야 한다. 정규화 전에 판정하면 대문자 입력이 0건 매칭으로 보여 "모호"가
   * "없음"으로 둔갑한다 — 그래서 `expectRejectsAsAmbiguous`로 에러의 종류까지 본다.
   */
  it("정규화 후 2건 이상 매칭되면 throw한다 — 대문자 입력도 모호 판정을 받는다", () => {
    insertSessionWithId("ef56aaaa-0000-4000-8000-000000000001");
    insertSessionWithId("ef56aaaa-0000-4000-8000-000000000002");

    expectRejectsAsAmbiguous(() => store.resolveSessionId("EF56AAAA"));
  });

  /** 소문자 입력의 모호 판정은 기존 계약 — 정규화 도입이 이것을 깨지 않는다 */
  it("소문자 입력의 모호 판정은 그대로 유지된다", () => {
    insertSessionWithId("aa88bbbb-0000-4000-8000-000000000001");
    insertSessionWithId("aa88bbbb-0000-4000-8000-000000000002");

    expectRejectsAsAmbiguous(() => store.resolveSessionId("aa88"));
  });

  it("모호 에러는 하나를 골라 돌려주는 것으로 대체되지 않는다", () => {
    insertSessionWithId("bb77aaaa-0000-4000-8000-000000000001");
    insertSessionWithId("bb77aaaa-0000-4000-8000-000000000002");

    let returned: unknown;
    try {
      returned = store.resolveSessionId("BB77");
    } catch {
      returned = undefined;
    }
    // 후보 중 하나를 돌려주는 것이 금지된 결과다 — undefined만이 아니라
    // "두 후보 중 어느 것도 아님"을 명시한다.
    expect(returned).toBeUndefined();
    expectRejectsAsAmbiguous(() => store.resolveSessionId("BB77"));
  });

  it("매칭이 없으면 throw한다 — 정규화가 없는 세션을 만들어내지 않는다", () => {
    newSession();
    expectRejects(() => store.resolveSessionId("ZZZZZZZZ"));
  });

  /**
   * 기존 계약의 회귀 — "git 스타일 **접두** 매칭"은 문자 그대로의 접두다.
   * `LIKE`로 구현하면 `_`가 와일드카드가 되어 접두 매칭이 아니게 된다. 정규화를
   * 넣으면서 `lower(id) LIKE lower(?) || '%'`로 갈아타면 여기서 걸린다.
   */
  it("`_`는 와일드카드가 아니다 — 접두 매칭은 문자 그대로다", () => {
    insertSessionWithId("a1b2cdef-0000-4000-8000-000000000001");
    expectRejects(() => store.resolveSessionId("a_b2"));
  });

  /** 같은 회귀의 `%` 쪽 */
  it("`%`도 와일드카드가 아니다", () => {
    insertSessionWithId("c3d4cdef-0000-4000-8000-000000000001");
    expectRejects(() => store.resolveSessionId("c3%"));
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * [미규정] 판정 요청 — 이 파일이 임의로 정하지 않은 것
 *
 * 보고는 유실될 수 있으므로 여기에 남긴다. 아래 항목은 **테스트로 고정하지 않았다** —
 * 기대값이 정본에 없기 때문이고, 지금 현재 동작을 기술해 두면 그것이 사후적으로
 * 계약이 되어 버린다.
 *
 * ── U-1 (R-4, 플랜 지정): `loadSession`이 `active = 0`인 세션에 불릴 때 ─────────
 *   `deleteSession` 신설의 파생 빈칸이다. §5는 `loadSession`의 세션 `active` 조건을
 *   말하지 않는다(메시지 쪽 `active = 1`만 규정). 선택지:
 *     (a) throw — 삭제된 세션은 재개할 수 없다. `resolveSessionId`에서 제외되므로
 *         접두로는 도달할 수 없고, 전체 id를 아는 경로만 남는다. `/delete` 후
 *         "지웠는데 이어서 대화가 된다"는 표면을 없앤다.
 *     (b) 정상 반환 — soft-delete는 "목록에서 감춤"일 뿐이고, id를 정확히 아는
 *         사용자의 복구 경로가 된다(§9가 물리 삭제 시점을 미결로 남긴 이유와 결이 같다).
 *     (c) 경고 후 진행 — §5의 "틀린 결과인가 비싼 결과인가" 기준을 적용하면
 *         삭제된 세션 재개는 틀린 결과가 아니므로 (b)에 가깝다.
 *   **판정이 필요하다.** CLI-INTERFACE §6이 `/resume`을 `resolveSessionId → loadSession`
 *   으로 정의하므로 CLI 경로에서는 (a)/(b)의 차이가 드러나지 않지만, 저장소 계약
 *   자체는 정해져야 한다.
 *
 * ── U-2: `deleteSession`이 `messages.active`를 함께 0으로 만드는가 ──────────────
 *   §5는 `sessions.active = 0`만 규정한다. 위 "메시지 행은 삭제되지 않는다" 테스트는
 *   **행의 존속만** 단정하고 `active` 값은 보지 않는다. 판정이 필요한 이유: §7이
 *   "검증 범위는 반환되는 행(`active = 1`)"이라고 정했으므로, 메시지까지 0으로
 *   내리면 U-1을 (b)로 정했을 때 되살린 세션의 트랜스크립트가 비어 나온다.
 *
 * ── U-3: 없는 id로 `deleteSession`을 부를 때 ────────────────────────────────
 *   throw인지 no-op인지 미규정. `resolveSessionId`가 없는 접두에 throw하므로 CLI
 *   경로에서는 도달하지 않지만, 저장소 API를 직접 부르는 경로가 남는다.
 *
 * ── U-4: 이미 삭제된 세션을 다시 `deleteSession` 할 때 (멱등성) ──────────────
 *   미규정. U-3과 같은 성격이며, 반환 타입이 `void`라 "무엇이 일어났는지"를
 *   호출자가 알 수단이 없다는 점이 U-3·U-4를 함께 판정하게 만든다.
 *
 * ── U-5: `deleteSession`이 `sessions.updated_at`을 갱신하는가 ────────────────
 *   미규정. `listSessions`가 `updated_at DESC` 정렬이므로, 되살리는 경로가 생기면
 *   목록 순서가 "마지막 대화 시각"이 아니라 "마지막 삭제 시각"으로 오염될 수 있다.
 *   지금은 관측 가능한 표면이 없어 테스트하지 않는다.
 * ═══════════════════════════════════════════════════════════════════════════ */
