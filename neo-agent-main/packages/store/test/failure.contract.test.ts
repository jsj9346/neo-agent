/**
 * 실패 처리 — 삼키지 않는다 · 건너뛰지 않는다 (QA-B).
 *
 * 기대값의 출처는 `docs/SESSION-STORE.md` §7 두 문단과, 그 근거로 §7이 인용한
 * `CORE-INTERFACE.md` §3(리스너 예외가 런을 끝내고 `prompt()`가 reject한다)이다.
 *
 * §7의 두 규칙은 방향이 같다 — **조용한 유실보다 시끄러운 실패가 낫다**:
 *   1. 저장 실패는 삼키지 않는다 → 리스너 예외로 전파 → `prompt()` reject
 *   2. 손상 행은 건너뛰지 않는다 → `loadSession` throw
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

let sandbox: string;
let home: string;
let workspaceRoot: string;
let store: SessionStore;
let sessionId: string;

const dbPath = (): string => join(home, ".neo-agent", "sessions.db");
const context = () => ({ workspaceRoot, systemPrompt: "SP", model: "model-x" });

function withAdminDb<T>(fn: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(dbPath());
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

/**
 * "loadSession이 던진다"를 단정하되, **미구현으로 인한 `TypeError`는 통과로 세지
 * 않는다.** 이 구분이 없으면 fail-closed 단정 전체가 공허하게 초록불이 된다.
 */
function expectLoadSessionThrows(): void {
  let caught: unknown;
  try {
    store.loadSession(sessionId, context());
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  expect(String((caught as Error).message)).not.toMatch(/is not a function/);
}

/** `body`에 임의 문자열을 실은 행을 직접 넣는다 — 저장소 API를 우회한 손상 재현 */
function insertRawBody(seq: number, role: string, body: string): void {
  withAdminDb((db) =>
    db
      .prepare(
        "INSERT INTO messages (id, session_id, seq, role, timestamp, body) VALUES (?,?,?,?,?,?)",
      )
      .run(`raw-${seq}`, sessionId, seq, role, 1000 + seq, body),
  );
}

beforeEach(() => {
  sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-qab-failure-")));
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
    /* 이미 닫힘 */
  }
  rmSync(sandbox, { recursive: true, force: true });
});

describe("저장 실패는 삼키지 않는다 (SESSION-STORE §7)", () => {
  /**
   * §7: "저장이 안 되는데 대화가 계속되면 사용자는 저장된 줄 안다 — … '안내가 있는
   * 조용한 유실은 안내 없는 것보다 나쁘다'와 같은 방향이고, **여기선 안내조차 없다**."
   */
  it("DB가 닫힌 상태에서 런이 진행되면 prompt()가 reject한다", async () => {
    const model = new ScriptedModel([{ text: "답변" }]);
    const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });
    store.attach(agent, sessionId);

    store.close();

    await expect(agent.prompt("질문")).rejects.toThrow();
  });

  it("런 도중 DB가 닫혀도 그 런은 실패로 끝난다 — 조용히 이어가지 않는다", async () => {
    const model = new ScriptedModel([{ text: "답변1" }, { text: "답변2" }]);
    const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });
    store.attach(agent, sessionId);

    await agent.prompt("질문1");
    await agent.waitForIdle();
    store.close();

    await expect(agent.prompt("질문2")).rejects.toThrow();
  });

  it("INSERT 제약 위반(디스크 에러 대용)도 그대로 전파된다", async () => {
    withAdminDb((db) =>
      db.exec(
        "CREATE TRIGGER qab_boom BEFORE INSERT ON messages BEGIN SELECT RAISE(ABORT, 'qab-forced'); END",
      ),
    );

    const model = new ScriptedModel([{ text: "답변" }]);
    const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });
    store.attach(agent, sessionId);

    await expect(agent.prompt("질문")).rejects.toThrow();
  });

  /**
   * §7의 전파 경로가 실제로 성립하려면 코어의 리스너 예외 계약(§3)이 지켜져야
   * 한다: "리스너 예외는 삼키지 않지만, 나머지 리스너의 전달을 취소하지도 않는다."
   * 저장이 터져도 렌더러는 `agent_end`까지 받아야 한다 — 아니면 화면이 런 중간에
   * 멈춘 채 남는다.
   */
  it("저장이 실패해도 다른 구독자는 완결된 시퀀스를 받는다", async () => {
    withAdminDb((db) =>
      db.exec(
        "CREATE TRIGGER qab_boom2 BEFORE INSERT ON messages BEGIN SELECT RAISE(ABORT, 'qab-forced'); END",
      ),
    );

    const model = new ScriptedModel([{ text: "답변" }]);
    const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });
    store.attach(agent, sessionId);

    const seen: string[] = [];
    agent.subscribe((event) => void seen.push(event.type));

    await expect(agent.prompt("질문")).rejects.toThrow();
    await agent.waitForIdle();

    expect(seen[0]).toBe("agent_start");
    expect(seen.at(-1)).toBe("agent_end");
  });
});

describe("손상 행은 건너뛰지 않는다 (SESSION-STORE §7)", () => {
  /**
   * **`.toThrow()`는 메서드가 없을 때도 통과한다** — `store.loadSession`이 미구현이면
   * `TypeError: not a function`이 던져지고 아래 fail-closed 단정 전부가 "통과"한다.
   * 아무것도 검증하지 않은 채 초록불이 켜지는 것이 fail-closed 테스트에서 가장 나쁜
   * 실패 양식이라, 선행 조건을 먼저 못박는다.
   */
  it("선행 조건: loadSession이 실제로 존재한다 (아래 단정들이 공허하지 않다는 보증)", () => {
    expect(typeof (store as { loadSession?: unknown }).loadSession).toBe("function");
  });

  /**
   * §7: "`body`의 Zod 검증이 실패하면 에러다. 건너뛰면 트랜스크립트에 구멍이 나고,
   * 도구 호출만 남고 결과가 사라진 트랜스크립트로 재개하면 **다음 API 호출이 와이어
   * 정합성 검사에서 거부된다**. 구멍 난 대화를 조용히 이어가는 것보다 열지 못하는
   * 편이 낫다."
   *
   * 아래 각 케이스는 "건너뛰고 나머지를 돌려주기"가 가능한 형태다 — 그렇게 하면
   * 통과하지 않도록 **throw**를 단정한다.
   */
  const valid = (seq: number): string =>
    JSON.stringify({
      id: `ok-${seq}`,
      role: "user",
      content: [{ type: "text", text: `정상 ${seq}` }],
      timestamp: 1000 + seq,
    });

  it("파싱 불가능한 JSON이 있으면 throw한다", () => {
    insertRawBody(1, "user", valid(1));
    insertRawBody(2, "user", "{이건 JSON이 아니다");
    expectLoadSessionThrows();
  });

  it("스키마 위반(필수 필드 누락)이 있으면 throw한다", () => {
    insertRawBody(1, "user", valid(1));
    // usage 없는 assistant — CORE-INTERFACE §2가 "옵션이 아니다"라고 못박은 필드
    insertRawBody(
      2,
      "assistant",
      JSON.stringify({
        id: "bad-2",
        role: "assistant",
        content: [{ type: "text", text: "x" }],
        stopReason: "end_turn",
        timestamp: 1002,
      }),
    );
    expectLoadSessionThrows();
  });

  it("알 수 없는 role은 throw한다 — 닫힌 유니온이다", () => {
    insertRawBody(1, "user", valid(1));
    insertRawBody(
      2,
      "system",
      JSON.stringify({ id: "bad-3", role: "system", content: [], timestamp: 1002 }),
    );
    expectLoadSessionThrows();
  });

  it("id가 없는 행은 throw한다 — 불변 조건 8이 스키마의 일부다", () => {
    insertRawBody(1, "user", valid(1));
    insertRawBody(
      2,
      "user",
      JSON.stringify({
        role: "user",
        content: [{ type: "text", text: "id 없음" }],
        timestamp: 1002,
      }),
    );
    expectLoadSessionThrows();
  });

  it("source 없는 toolResult는 throw한다 — 필수 필드다(taint 흔적)", () => {
    insertRawBody(1, "user", valid(1));
    insertRawBody(
      2,
      "toolResult",
      JSON.stringify({
        id: "bad-5",
        role: "toolResult",
        toolCallId: "c1",
        toolName: "t",
        content: [{ type: "text", text: "r" }],
        isError: false,
        timestamp: 1002,
      }),
    );
    expectLoadSessionThrows();
  });

  /**
   * 손상 행이 **마지막**일 때가 가장 위험하다 — 앞 행들이 정상이라 "거의 다 읽었으니
   * 이만큼만 돌려주자"는 유혹이 생기는 자리다. §7은 부분 반환을 허용하지 않는다.
   */
  it("손상 행이 마지막이어도 부분 반환하지 않는다", () => {
    insertRawBody(1, "user", valid(1));
    insertRawBody(2, "user", valid(2));
    insertRawBody(3, "user", "null");
    expectLoadSessionThrows();
  });

  it("정상 행만 있으면 당연히 통과한다 — 위 단정들이 무차별 throw가 아님을 보인다", () => {
    insertRawBody(1, "user", valid(1));
    insertRawBody(2, "user", valid(2));
    expect(() => store.loadSession(sessionId, context())).not.toThrow();
  });

  /**
   * `active = 0`으로 제외되는 행은 애초에 읽지 않으므로 검증 대상이 아니다.
   *
   * [미규정] §7은 "손상 행"과 §5의 "`active = 1`인 메시지를 반환한다"의 상호작용을
   * 정하지 않았다. 비활성 행까지 검증하면 soft-delete된 과거 손상이 세션을 영구히
   * 열 수 없게 만든다 — 반환하지 않는 데이터로 열기를 막을 이유는 없다고 읽었다.
   * 반대 판정이면 이 테스트를 뒤집으면 된다.
   */
  it("[미규정] 비활성(active = 0) 행의 손상은 열기를 막지 않는다", () => {
    insertRawBody(1, "user", valid(1));
    insertRawBody(2, "user", "손상된 본문");
    withAdminDb((db) => db.prepare("UPDATE messages SET active = 0 WHERE seq = 2").run());

    expect(() => store.loadSession(sessionId, context())).not.toThrow();
    expect(store.loadSession(sessionId, context()).messages).toHaveLength(1);
  });

  it("에러 메시지가 어느 행이 손상됐는지 알려준다 — 진단 불가능한 실패는 §2.6 위반이다", () => {
    insertRawBody(1, "user", valid(1));
    insertRawBody(2, "user", "손상된 본문");
    let caught: unknown;
    try {
      store.loadSession(sessionId, context());
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    // 세션 id 또는 메시지 id/seq 중 하나는 있어야 사용자가 손상 위치를 찾는다
    expect(String((caught as Error).message)).toMatch(/raw-2|seq|2|손상|corrupt/i);
  });
});
