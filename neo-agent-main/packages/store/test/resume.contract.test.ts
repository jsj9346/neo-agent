/**
 * 세션 이어가기 — loadSession과 재개 검증 2갈래 (QA-B).
 *
 * 기대값의 출처는 `docs/SESSION-STORE.md` §5 전체, 보조로 §2의 "읽을 때 body를
 * Zod로 검증한다"와 `CORE-INTERFACE.md` §5(도구 짝 정합성 — 저장소가 재검증하지
 * 않아야 하는 것)다.
 *
 * ── §5의 인터페이스 블록과 산문이 어긋난다 ─────────────────────────────
 * [미규정] §5의 시그니처는 `loadSession(id): { session; messages }`인데, 같은 절의
 * 산문은 "**현재 워크스페이스**의 realpath가 `sessions.workspace_root`와 다르면
 * 재개가 실패한다"고 요구한다. **`loadSession(id)`는 현재 워크스페이스를 알 수
 * 없으므로 이 검증을 수행할 수 없다.** 시스템 프롬프트·모델 불일치 경고도 같다.
 *
 * 가능한 해소는 셋이다:
 *   (a) `loadSession(id, expected)` — 두 번째 인자로 현재 컨텍스트를 받는다
 *   (b) `openSessionStore({ home, workspaceRoot, systemPrompt, model })` — 저장소가
 *       현재 컨텍스트를 들고 생성된다
 *   (c) 검증을 저장소 밖(CLI)으로 밀고 `loadSession`은 순수 조회로 남긴다
 *       — 단 이 경우 §5의 "재개가 실패한다"는 저장소 계약이 아니게 되므로
 *         §5 문구를 고쳐야 한다
 *
 * 아래는 (a)로 가정해 썼다. **어느 쪽이든 §5의 시그니처 블록은 고쳐져야 한다** —
 * 지금 문서 그대로 구현하면 산문이 요구한 검증이 구현 불가능하다. 판정 요청.
 * ───────────────────────────────────────────────────────────────────────
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Agent, type AgentMessage } from "@neo-agent/core";
import { openSessionStore, type SessionStore } from "@neo-agent/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScriptedModel } from "./contract-harness.ts";

let sandbox: string;
let home: string;
let workspaceRoot: string;
let store: SessionStore;
let sessionId: string;

const dbPath = (): string => join(home, ".neo-agent", "sessions.db");

/** 이 세션의 현재 컨텍스트 — 재개 검증의 기준값 */
const context = () => ({ workspaceRoot, systemPrompt: "SP", model: "model-x" });

function withAdminDb<T>(fn: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(dbPath());
  try {
    db.exec("PRAGMA foreign_keys = ON");
    return fn(db);
  } finally {
    db.close();
  }
}

/** 도구 결과가 섞인 런을 한 번 저장한다 — 재개 검증의 재료 */
async function recordRun(): Promise<AgentMessage[]> {
  const model = new ScriptedModel([
    {
      text: "도구 씁니다",
      toolCalls: [{ toolCallId: "c1", toolName: "없는도구", args: { a: 1 } }],
    },
    { text: "끝났습니다" },
  ]);
  const agent = new Agent({ session: { systemPrompt: "SP", tools: [] }, modelClient: model });
  store.attach(agent, sessionId);
  await agent.prompt("질문");
  await agent.waitForIdle();
  return [...agent.state.messages];
}

beforeEach(() => {
  sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-qab-resume-")));
  home = join(sandbox, "home");
  workspaceRoot = join(sandbox, "ws");
  mkdirSync(home, { recursive: true });
  mkdirSync(workspaceRoot, { recursive: true });
  store = openSessionStore({ home });
  sessionId = store.createSession({ workspaceRoot, systemPrompt: "SP", model: "model-x" }).id;
});

afterEach(() => {
  vi.restoreAllMocks();
  try {
    store.close();
  } catch {
    /* 이미 닫힘 */
  }
  rmSync(sandbox, { recursive: true, force: true });
});

/**
 * `.toThrow()`는 메서드가 없을 때도 통과한다 — 미구현 상태에서 거부 단정이 공허하게
 * 초록불이 되는 것을 막는다. `expect(...).toThrow()` 대신 이 헬퍼를 쓴다.
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

describe("loadSession — 조회 (SESSION-STORE §5)", () => {
  it("선행 조건: attach·loadSession이 실제로 존재한다 (아래 단정들이 공허하지 않다는 보증)", () => {
    expect(typeof (store as { attach?: unknown }).attach).toBe("function");
    expect(typeof (store as { loadSession?: unknown }).loadSession).toBe("function");
  });

  it("저장한 트랜스크립트와 읽은 트랜스크립트가 순서·내용까지 일치한다 (id 포함)", async () => {
    const recorded = await recordRun();
    const loaded = store.loadSession(sessionId, context());

    expect(loaded.messages).toEqual(recorded);
    expect(loaded.session.id).toBe(sessionId);
    expect(loaded.session.workspaceRoot).toBe(workspaceRoot);
    expect(loaded.session.model).toBe("model-x");
  });

  it("`seq` 순으로 돌려준다 — id 순서가 아니다", async () => {
    await recordRun();
    const loaded = store.loadSession(sessionId, context());
    const seqs = withAdminDb(
      (db) =>
        db.prepare("SELECT id FROM messages WHERE session_id = ? ORDER BY seq").all(sessionId) as {
          id: string;
        }[],
    ).map((row) => row.id);
    expect(loaded.messages.map((message) => (message as { id: string }).id)).toEqual(seqs);
  });

  it("active = 0인 메시지는 제외한다", async () => {
    const recorded = await recordRun();
    withAdminDb((db) => db.prepare("UPDATE messages SET active = 0 WHERE seq = 2").run());

    const loaded = store.loadSession(sessionId, context());
    expect(loaded.messages).toHaveLength(recorded.length - 1);
  });

  /**
   * §5: "그 배열이 그대로 `AgentSessionInit.messages`가 된다." 재개한 Agent가
   * 이어서 돌고, 코어의 트랜스크립트가 누적되는지까지 본다.
   */
  it("반환 배열이 그대로 AgentSessionInit.messages가 되어 재개가 성립한다", async () => {
    const recorded = await recordRun();
    const loaded = store.loadSession(sessionId, context());

    const model = new ScriptedModel([{ text: "이어서" }]);
    const resumed = new Agent({
      session: { systemPrompt: "SP", tools: [], messages: loaded.messages },
      modelClient: model,
    });
    store.attach(resumed, sessionId);
    await resumed.prompt("추가 질문");
    await resumed.waitForIdle();

    expect(resumed.state.messages).toHaveLength(recorded.length + 2);
    // 재개한 런의 메시지도 이어서 저장된다 — seq가 이어 붙는다
    const seqs = withAdminDb(
      (db) =>
        db.prepare("SELECT seq FROM messages WHERE session_id = ? ORDER BY seq").all(sessionId) as {
          seq: number;
        }[],
    ).map((row) => row.seq);
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("없는 세션 id는 throw한다 — 빈 세션을 지어내지 않는다", () => {
    expectRejects(() => store.loadSession("없는-세션-id", context()));
  });
});

describe("재개 검증 — 워크스페이스 불일치는 거부한다 (SESSION-STORE §5)", () => {
  /**
   * §5의 근거: "과거 트랜스크립트의 파일 경로가 전부 다른 실체를 가리키게 되고,
   * 모델은 그것을 모른 채 '아까 고친 파일'을 다시 수정하려 한다 — **조용히 엉뚱한
   * 곳을 고치는 경로**". 경고가 아니라 거부여야 한다.
   */
  it("다른 워크스페이스로 재개하면 throw한다", async () => {
    await recordRun();
    const other = join(sandbox, "다른-워크스페이스");
    mkdirSync(other, { recursive: true });

    expectRejects(() => store.loadSession(sessionId, { ...context(), workspaceRoot: other }));
  });

  it("거부는 경고로 대체되지 않는다 — 값을 돌려주면서 경고만 하는 것은 위반이다", async () => {
    await recordRun();
    const other = join(sandbox, "또-다른-워크스페이스");
    mkdirSync(other, { recursive: true });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    let returned: unknown;
    try {
      returned = store.loadSession(sessionId, { ...context(), workspaceRoot: other });
    } catch {
      returned = undefined;
    }
    expect(returned).toBeUndefined();
    void warn;
  });

  /**
   * §5: "비교는 realpath 기준". 심링크를 거쳐 **같은 실체**를 가리키면 통과해야 한다.
   * 문자열 비교로 구현하면 여기서 걸린다 — 사용자에게는 같은 디렉터리인데 재개가
   * 막히는, 근거 없는 거부가 된다.
   */
  it("심링크 경유로 같은 실체를 가리키면 통과한다 (realpath 비교)", async () => {
    await recordRun();
    const link = join(sandbox, "ws-link");
    symlinkSync(workspaceRoot, link);

    expect(() => store.loadSession(sessionId, { ...context(), workspaceRoot: link })).not.toThrow();
  });

  it("`.` 등 정규화 전 표기로 같은 경로를 가리켜도 통과한다", async () => {
    await recordRun();
    const dotted = join(workspaceRoot, ".", "..", "ws");
    expect(() =>
      store.loadSession(sessionId, { ...context(), workspaceRoot: dotted }),
    ).not.toThrow();
  });

  it("워크스페이스의 하위 디렉터리는 같은 워크스페이스가 아니다", async () => {
    await recordRun();
    const nested = join(workspaceRoot, "src");
    mkdirSync(nested, { recursive: true });
    expectRejects(() => store.loadSession(sessionId, { ...context(), workspaceRoot: nested }));
  });
});

describe("재개 검증 — 프롬프트·모델 불일치는 경고 후 진행 (SESSION-STORE §5)", () => {
  /**
   * §5: "결과가 비용 증가(캐시 무효화)에 그치고, neo-agent 버전이 올라 시스템
   * 프롬프트가 바뀌면 모든 과거 세션의 재개가 막히기 때문이다."
   *
   * 이 둘을 워크스페이스와 다르게 취급하는 기준은 "**틀린 결과가 나오는가, 비싼
   * 결과가 나오는가**"다. 여기서 throw하면 그 기준이 뒤집힌 것이다.
   *
   * [미규정] 경고 전달 수단은 §5도 정하지 않았다(§6과 같은 미규정). `console.warn`
   * 으로 관측한다 — 다른 수단이면 조정 대상이고, **아무 데로도 안 나가면** "경고는
   * 캐시가 무효화된다는 사실을 알린다"가 거짓이 되므로 위반이다.
   */
  it("시스템 프롬프트가 달라도 재개는 성공한다", async () => {
    const recorded = await recordRun();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const loaded = store.loadSession(sessionId, {
      ...context(),
      systemPrompt: "새 시스템 프롬프트",
    });

    expect(loaded.messages).toEqual(recorded);
    expect(warn).toHaveBeenCalled();
  });

  it("모델이 달라도 재개는 성공한다", async () => {
    const recorded = await recordRun();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const loaded = store.loadSession(sessionId, { ...context(), model: "다른-모델" });

    expect(loaded.messages).toEqual(recorded);
    expect(warn).toHaveBeenCalled();
  });

  it("전부 일치하면 경고가 없다 — 경고가 상시 울리면 신호가 아니다", async () => {
    await recordRun();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    store.loadSession(sessionId, context());
    expect(warn).not.toHaveBeenCalled();
  });

  it("반환된 session은 **저장된** 프롬프트·모델을 담는다 — 현재 값으로 덮어쓰지 않는다", async () => {
    await recordRun();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const loaded = store.loadSession(sessionId, { ...context(), model: "다른-모델" });
    expect(loaded.session.model).toBe("model-x");
    expect(loaded.session.systemPrompt).toBe("SP");
  });
});

describe("저장소는 코어가 보장한 것을 재검증하지 않는다 (SESSION-STORE §5)", () => {
  /**
   * §5: "도구 호출-결과 짝 정합성은 코어가 모든 종료 경로에서 보장한다. 저장소가
   * 이를 다시 검증하지 않는다 — 사후 검증에서 '정합성 검증을 모든 소비자에
   * 복제시키는 대안은 기각'으로 이미 판정했다."
   *
   * 짝이 깨진 트랜스크립트를 DB에 직접 만들고 `loadSession`이 **그 이유로는**
   * 실패하지 않는지 본다. 여기서 throw하면 저장소가 코어의 책임을 복제한 것이다.
   * (스키마 위반이 아니므로 §7의 fail-closed와 충돌하지 않는다 — body는 유효한
   * `AgentMessage`이고 빠진 것은 **짝**뿐이다.)
   */
  it("짝 없는 toolCall이 있어도 loadSession은 그 이유로 실패하지 않는다", () => {
    const assistant = {
      id: "a-1",
      role: "assistant",
      content: [{ type: "toolCall", toolCallId: "짝없음", toolName: "t", args: {} }],
      stopReason: "tool_use",
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      timestamp: 2,
    };
    const user = {
      id: "u-1",
      role: "user",
      content: [{ type: "text", text: "질문" }],
      timestamp: 1,
    };

    withAdminDb((db) => {
      const stmt = db.prepare(
        "INSERT INTO messages (id, session_id, seq, role, timestamp, body) VALUES (?,?,?,?,?,?)",
      );
      stmt.run(user.id, sessionId, 1, "user", 1, JSON.stringify(user));
      stmt.run(assistant.id, sessionId, 2, "assistant", 2, JSON.stringify(assistant));
    });

    const loaded = store.loadSession(sessionId, context());
    expect(loaded.messages).toHaveLength(2);
  });
});
