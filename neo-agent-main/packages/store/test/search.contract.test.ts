/**
 * 대화 검색 — 추출 규칙 · 색인 시점 · `searchMessages` 계약 (QA-A).
 *
 * **이 파일은 구현보다 먼저 쓰였다.** T-003·T-004(Store Eng)가 착수하기 전에 계약을
 * 고정하는 것이 목적이며, 작성 시점에는 `extract.ts`·`search.ts`가 없어 **임포트 단계에서
 * 파일 전체가 실패하는 것이 정상이다.**
 *
 * 기대값의 출처 — **정본 문서만 본다. 구현 코드를 보고 쓰지 않았다**:
 *   - `docs/SEARCH.md` §3 — 색인 대상 표(7행), `"\n\n"` 결합, 메시지당 1행,
 *     **FTS 행 존재 ⇔ 검색 가능 텍스트 존재**, 저장과 **같은 트랜잭션**,
 *     FTS INSERT 실패는 저장 트랜잭션 전체 실패, `branchSession`의 kept 복사도 같은 경로
 *   - `docs/SEARCH.md` §4 — `SearchOptions`(limit 기본 20)·`SearchHit`(7필드),
 *     **질의는 항상 리터럴**, **3자 미만은 LIKE 폴백**, 범위(superseded 포함 ·
 *     soft-delete 제외 · 같은 id 1회), chainTip 해석, rank(bm25) 정렬
 *   - `docs/SEARCH.md` §4 "스니펫" (**2026-08-07 개정** — 구현 착수 실측으로 정정된 부분.
 *     최초 작성은 원안(FTS5 `snippet()`) 기준이었고 개정본에 맞춰 §11을 다시 썼다):
 *     스니펫은 **애플리케이션이 만든다**. 질의가 리터럴이므로 매치 텍스트에 질의가 그대로
 *     있고, 대소문자 무시로 위치를 찾아(원문 대소문자 보존) 앞뒤 문맥을 자른 뒤 **그 구간만**
 *     마커로 감싼다. FTS 경로와 LIKE 폴백이 **같은 발췌 함수**를 쓴다.
 *     마커 값은 store가 `SNIPPET_MARK_START`/`SNIPPET_MARK_END`로 export한다 —
 *     이 파일은 그 상수를 참조하므로 값을 따로 적지 않는다(2026-08-07 Architect 판정)
 *   - `docs/SESSION-STORE.md` §5 — superseded/soft-delete의 "제외는 **조회 조건이지
 *     사후 필터가 아니다**", 압축 체인은 선형
 *   - `docs/CORE-INTERFACE.md` §2 — `AgentMessage` 유니온과 콘텐츠 블록(추출 대상 판정의 근거),
 *     압축 요약은 **합성 `UserMessage`**이고 신규 역할을 만들지 않는다
 *
 * 판정 기준: **원인 쪽이 미규정이어도 문서가 금지한 결과가 나오면 위반이다.**
 * 회색지대는 임의 판정하지 않고 파일 말미의 `[미규정 A-n]` 블록에 모았다.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  type AgentMessage,
  type AssistantMessage,
  createUserMessage,
  type ToolResultMessage,
  type UserMessage,
} from "@neo-agent/core";
import {
  appendMessage,
  branchSession,
  createSession,
  deleteSession,
  extractSearchText,
  openDatabase,
  openSessionStore,
  type SearchHit,
  type SearchOptions,
  SNIPPET_MARK_END,
  SNIPPET_MARK_START,
  type StoredSession,
  searchMessages,
} from "@neo-agent/store";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SYSTEM_PROMPT = "시스템프롬프트고유문자열 — 대화가 아니므로 색인 밖이다";
const MODEL = "model-x";
const USAGE = { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 };

/** SEARCH §4가 정한 `SearchHit`의 필드 — 여기서 벗어나면 표면이 계약과 다르다 */
const SEARCH_HIT_FIELDS = [
  "chainTipId",
  "chainTipTitle",
  "messageId",
  "role",
  "sessionId",
  "snippet",
  "timestamp",
] as const;

// ───────────────────────────────────────────────────────────────────────────
// 하네스
// ───────────────────────────────────────────────────────────────────────────

let sandbox: string;
let home: string;
let workspaceRoot: string;
let db: DatabaseSync;
let idCounter = 0;

const nextId = (): string => {
  idCounter += 1;
  return `m-${String(idCounter).padStart(4, "0")}`;
};

function userMessage(text: string | readonly string[], timestamp = 1_000): UserMessage {
  const texts = typeof text === "string" ? [text] : text;
  return {
    id: nextId(),
    role: "user",
    content: texts.map((value) => ({ type: "text", text: value })),
    timestamp,
  };
}

function assistantMessage(
  content: AssistantMessage["content"],
  timestamp = 2_000,
): AssistantMessage {
  return {
    id: nextId(),
    role: "assistant",
    content,
    stopReason: "end_turn",
    usage: USAGE,
    timestamp,
  };
}

function assistantText(text: string, timestamp = 2_000): AssistantMessage {
  return assistantMessage([{ type: "text", text }], timestamp);
}

function toolResultMessage(text: string, timestamp = 3_000): ToolResultMessage {
  return {
    id: nextId(),
    role: "toolResult",
    toolCallId: "call-1",
    toolName: "read",
    content: [{ type: "text", text }],
    isError: false,
    source: "local",
    timestamp,
  };
}

function newSession(): StoredSession {
  return createSession(db, { workspaceRoot, systemPrompt: SYSTEM_PROMPT, model: MODEL });
}

/** 메시지 하나를 저장하고 그 객체를 돌려준다 */
function say<T extends AgentMessage>(sessionId: string, message: T): T {
  appendMessage(db, sessionId, message);
  return message;
}

function search(query: string, opts?: SearchOptions): SearchHit[] {
  return searchMessages(db, query, opts);
}

/** FTS 원본 행 — 색인의 대칭 불변 조건은 검색 결과가 아니라 여기서 판정한다 */
function ftsRowsFor(messageId: string): { session_id: string; text: string }[] {
  return db
    .prepare("SELECT session_id, text FROM messages_fts WHERE message_id = ? ORDER BY session_id")
    .all(messageId) as unknown as { session_id: string; text: string }[];
}

function ftsRowCount(): number {
  return (db.prepare("SELECT count(*) AS n FROM messages_fts").get() as { n: number }).n;
}

function messageRowCount(sessionId: string, messageId: string): number {
  return (
    db
      .prepare("SELECT count(*) AS n FROM messages WHERE session_id = ? AND id = ?")
      .get(sessionId, messageId) as { n: number }
  ).n;
}

/**
 * 제어문자(마킹 후보)를 걷어낸 스니펫 — 마커의 구체 문자에 과결합하지 않기 위한 정규화.
 * 정규식 대신 코드포인트로 거른다: 어떤 제어문자를 쓰든 이 헬퍼는 그대로 동작한다.
 */
function plainSnippet(snippet: string): string {
  return [...snippet].filter((char) => (char.codePointAt(0) ?? 0) > 0x1f).join("");
}

// ───────────────────────────────────────────────────────────────────────────
// 스니펫 마커 — SEARCH §4 "마커는 store가 넣고 CLI가 색상으로 치환한다".
//
// **값은 U+0002(시작) / U+0003(끝)** — 2026-08-07 Architect 판정.
//
// 마커는 제어문자라 **소스에 실문자로 쓰지 않는다**(이스케이프 시퀀스로만). 실문자를
// 넣으면 `file`이 이 파일을 바이너리로 보고 grep·git diff가 죽는다 — 같은 이유로 위
// `plainSnippet`도 정규식에 마커를 박지 않고 코드포인트로 거른다.
//
// **값의 정본은 구현이다** — 2026-08-07 store가 `SNIPPET_MARK_START`/`SNIPPET_MARK_END`를
// export하면서 아래 두 줄은 그 상수의 별칭이 됐다(짧은 이름은 단정의 가독성 때문이다).
// 테스트가 값을 따로 적어 두지 않으므로 구현과 어긋날 수가 없고, 아래 단정들은 값이
// 아니라 구조(짝·구간)만 본다.
// ───────────────────────────────────────────────────────────────────────────

const MARK_START = SNIPPET_MARK_START;
const MARK_END = SNIPPET_MARK_END;

/**
 * 마커로 감싸인 구간들만 뽑아낸다. 계약의 실질이 "**매치 구간만** 마킹"이므로,
 * 판정의 근거는 "마커가 있는가"가 아니라 "무엇이 감싸였는가"다.
 *
 * trigram + FTS5 `snippet()` 조합의 실패 모드(발췌 전 구간의 모든 문자가 개별
 * 마킹됨)가 이 헬퍼에서 **구간 수 폭증**으로 드러난다 — 2026-08-07 실측으로
 * `snippet()`을 버리고 애플리케이션 발췌로 정정한 바로 그 실패다.
 */
function markedSpans(snippet: string): string[] {
  const spans: string[] = [];
  let cursor = 0;
  for (;;) {
    const start = snippet.indexOf(MARK_START, cursor);
    if (start === -1) break;
    const end = snippet.indexOf(MARK_END, start + 1);
    if (end === -1) break;
    spans.push(snippet.slice(start + MARK_START.length, end));
    cursor = end + MARK_END.length;
  }
  return spans;
}

function countOf(text: string, needle: string): number {
  return [...text].filter((char) => char === needle).length;
}

beforeEach(() => {
  sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-qaa-search-")));
  home = join(sandbox, "home");
  workspaceRoot = join(sandbox, "ws");
  mkdirSync(home, { recursive: true });
  mkdirSync(workspaceRoot, { recursive: true });
  idCounter = 0;
  db = openDatabase({ home, onWarning: () => {} });
});

afterEach(() => {
  try {
    db.close();
  } catch {
    // 원자성 테스트가 DB를 이미 닫았거나 손댔을 수 있다 — 정리 실패로 원인을 덮지 않는다.
  }
  rmSync(sandbox, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. 추출 규칙 — SEARCH §3 색인 대상 표 7행 1:1
// ═══════════════════════════════════════════════════════════════════════════

describe("추출 규칙 (SEARCH §3)", () => {
  it("UserMessage의 TextContent를 추출한다", () => {
    expect(extractSearchText(userMessage("압축 설계를 검토했다"))).toBe("압축 설계를 검토했다");
  });

  it("AssistantMessage의 TextContent를 추출한다", () => {
    expect(extractSearchText(assistantText("먼저 문서를 읽는다"))).toBe("먼저 문서를 읽는다");
  });

  it("ThinkingContent는 추출하지 않는다", () => {
    const message = assistantMessage([
      { type: "thinking", text: "숨은사고블록고유어" },
      { type: "text", text: "보이는 답이다" },
    ]);
    expect(extractSearchText(message)).toBe("보이는 답이다");
  });

  it("ThinkingContent만 있으면 undefined다", () => {
    const message = assistantMessage([{ type: "thinking", text: "숨은사고블록고유어" }]);
    expect(extractSearchText(message)).toBeUndefined();
  });

  it("ToolCallContent는 추출하지 않는다", () => {
    const message = assistantMessage([
      { type: "text", text: "파일을 읽는다" },
      { type: "toolCall", toolCallId: "c1", toolName: "read", args: { path: "/기계소음/x" } },
    ]);
    expect(extractSearchText(message)).toBe("파일을 읽는다");
  });

  it("ToolCallContent만 있으면 undefined다", () => {
    const message = assistantMessage([
      { type: "toolCall", toolCallId: "c1", toolName: "read", args: { path: "/tmp/x" } },
    ]);
    expect(extractSearchText(message)).toBeUndefined();
  });

  /** 도구 행은 트랜스크립트 바이트의 대부분이며 대부분 기계 소음이다 — 전체 제외 */
  it("ToolResultMessage는 TextContent가 있어도 전체가 제외된다", () => {
    expect(extractSearchText(toolResultMessage("도구출력덤프고유어"))).toBeUndefined();
  });

  it("ImageContent는 추출하지 않는다", () => {
    const message: UserMessage = {
      id: nextId(),
      role: "user",
      content: [{ type: "image", mimeType: "image/png", data: "aW1n" }],
      timestamp: 1_000,
    };
    expect(extractSearchText(message)).toBeUndefined();
  });

  it("이미지와 텍스트가 섞이면 텍스트만 남는다", () => {
    const message: UserMessage = {
      id: nextId(),
      role: "user",
      content: [
        { type: "image", mimeType: "image/png", data: "aW1n" },
        { type: "text", text: "이 그림을 봐" },
      ],
      timestamp: 1_000,
    };
    expect(extractSearchText(message)).toBe("이 그림을 봐");
  });

  it("여러 TextContent는 \\n\\n으로 결합한다", () => {
    expect(extractSearchText(userMessage(["앞 단락", "뒤 단락"]))).toBe("앞 단락\n\n뒤 단락");
  });

  it("텍스트 사이에 비텍스트가 끼어도 텍스트만 순서대로 결합한다", () => {
    const message = assistantMessage([
      { type: "text", text: "첫 문단" },
      { type: "thinking", text: "숨은사고블록고유어" },
      { type: "toolCall", toolCallId: "c1", toolName: "read", args: {} },
      { type: "text", text: "둘째 문단" },
    ]);
    expect(extractSearchText(message)).toBe("첫 문단\n\n둘째 문단");
  });

  it("빈 content는 undefined다", () => {
    expect(extractSearchText(assistantMessage([]))).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. 압축 요약 — 별도 분기 없이 콘텐츠 기준으로 색인된다
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 압축 요약은 **합성 `UserMessage`**이고 신규 역할을 만들지 않는다(CORE-INTERFACE §2,
 * COMPACTION §2). 그래서 SEARCH §3의 "압축 요약도 여기 포함된다"는 별도 처리가 아니라
 * **콘텐츠 기준 판정의 자동 결과**여야 한다 — 요약을 특별 취급하는 분기가 생기면
 * 압축 설계가 역할을 신설하지 않기로 한 근거가 색인 쪽에서 무너진다.
 */
describe("압축 요약(합성 UserMessage) 색인 (SEARCH §3, CORE-INTERFACE §2)", () => {
  it("createUserMessage로 만든 요약이 추출 대상이다", () => {
    const summary = createUserMessage({
      role: "user",
      content: [{ type: "text", text: "이전 대화의 요약고유어다" }],
    });
    expect(extractSearchText(summary)).toBe("이전 대화의 요약고유어다");
  });

  it("요약이 저장되면 검색된다", () => {
    const session = newSession();
    const summary = createUserMessage({
      role: "user",
      content: [{ type: "text", text: "이전 대화의 요약고유어다" }],
    });
    say(session.id, summary);

    const hits = search("요약고유어");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.messageId).toBe(summary.id);
    expect(hits[0]?.role).toBe("user");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. 색인 시점 — 저장과 같은 트랜잭션 (SEARCH §3)
// ═══════════════════════════════════════════════════════════════════════════

describe("색인 시점 — appendMessage (SEARCH §3)", () => {
  it("저장하면 FTS 행이 함께 생긴다 (별도 동기화 절차 없음)", () => {
    const session = newSession();
    const message = say(session.id, userMessage("색인시점고유어를 남긴다"));

    expect(ftsRowsFor(message.id)).toEqual([
      { session_id: session.id, text: "색인시점고유어를 남긴다" },
    ]);
  });

  it("메시지당 FTS 행은 1개다", () => {
    const session = newSession();
    const message = say(session.id, userMessage(["앞 단락", "뒤 단락"]));

    expect(ftsRowsFor(message.id)).toHaveLength(1);
    expect(ftsRowsFor(message.id)[0]?.text).toBe("앞 단락\n\n뒤 단락");
  });

  /**
   * **불변 조건: FTS 행 존재 ⇔ 검색 가능 텍스트 존재**(SEARCH §3). 텍스트 없는 메시지가
   * 빈 행을 남기면 이 동치가 깨지고 재구축 로직에 분기가 생긴다.
   */
  it("텍스트 없는 메시지는 messages 행만 생기고 FTS 행은 0이다", () => {
    const session = newSession();
    const message = say(
      session.id,
      assistantMessage([{ type: "toolCall", toolCallId: "c1", toolName: "read", args: {} }]),
    );

    expect(messageRowCount(session.id, message.id)).toBe(1);
    expect(ftsRowsFor(message.id)).toEqual([]);
  });

  it("ToolResultMessage 저장은 FTS 행을 만들지 않는다", () => {
    const session = newSession();
    const message = say(session.id, toolResultMessage("도구출력덤프고유어"));

    expect(messageRowCount(session.id, message.id)).toBe(1);
    expect(ftsRowsFor(message.id)).toEqual([]);
  });

  /**
   * `INSERT OR IGNORE`가 0행이면 FTS에도 쓰지 않는다(SEARCH §3 — 대칭 유지).
   * §4의 멱등은 이벤트를 두 번 구독해도 무해하게 만드는 구독 계약의 요구이므로,
   * 색인이 그 멱등을 따라오지 않으면 재구독 한 번에 검색 결과가 중복된다.
   */
  it("같은 id로 재호출해도 FTS 행이 늘지 않는다", () => {
    const session = newSession();
    const message = userMessage("멱등재호출고유어");

    expect(appendMessage(db, session.id, message)).toBe(true);
    const before = ftsRowCount();

    expect(appendMessage(db, session.id, message)).toBe(false);

    expect(ftsRowCount()).toBe(before);
    expect(ftsRowsFor(message.id)).toHaveLength(1);
    expect(search("멱등재호출고유어")).toHaveLength(1);
  });

  /**
   * **FTS INSERT 실패는 저장 트랜잭션 전체 실패다**(SEARCH §3·§6). 메시지는 저장됐는데
   * 색인만 빠진 상태는 침묵 드리프트이며, 그것이 "같은 트랜잭션"을 계약으로 못박은
   * 이유다. 색인 테이블을 밖에서 없애는 것이 `src/`를 건드리지 않는 유일한 주입 지점이다
   * (`[미규정 A-4]`).
   */
  it("FTS INSERT가 실패하면 messages 행도 남지 않는다 (원자성)", () => {
    const session = newSession();
    db.exec("DROP TABLE messages_fts");

    const message = userMessage("원자성고유어");
    expect(() => appendMessage(db, session.id, message)).toThrow();

    expect(messageRowCount(session.id, message.id)).toBe(0);
  });

  it("색인 실패는 삼켜지지 않는다 (§7 — 저장 실패는 호출자로 전파)", () => {
    const session = newSession();
    db.exec("DROP TABLE messages_fts");

    let caught: unknown;
    try {
      appendMessage(db, session.id, userMessage("전파고유어"));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(String((caught as Error).message)).not.toMatch(/is not a function/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. branchSession — kept 복사도 같은 경로로 색인 (SEARCH §3)
// ═══════════════════════════════════════════════════════════════════════════

describe("branchSession 색인 (SEARCH §3)", () => {
  it("요약과 kept 복사가 자식 세션 행으로 색인된다", () => {
    const parent = newSession();
    say(parent.id, userMessage("부모원문고유어를 말했다"));
    const kept = say(parent.id, userMessage("유지메시지고유어를 말했다", 1_500));

    const summary = createUserMessage({
      role: "user",
      content: [{ type: "text", text: "요약하나고유어" }],
    });
    const child = branchSession(db, parent.id, {
      summaryMessage: summary,
      keptMessages: [kept],
      systemPrompt: SYSTEM_PROMPT,
      model: MODEL,
    });

    expect(ftsRowsFor(summary.id)).toEqual([{ session_id: child.id, text: "요약하나고유어" }]);
    expect(
      ftsRowsFor(kept.id)
        .map((row) => row.session_id)
        .sort(),
    ).toEqual([parent.id, child.id].sort());
  });

  /**
   * SEARCH §3 — 같은 id가 부모·자식 양쪽 FTS에 존재하는 것이 **정상**이고 중복 제거는
   * 검색 쿼리의 책임이다. 색인 쪽에 예외를 두면 "messages 행과 FTS 행의 대칭"이 깨진다.
   */
  it("같은 message_id가 부모·자식 양쪽 FTS에 존재한다 (dedupe는 색인의 책임이 아니다)", () => {
    const parent = newSession();
    const kept = say(parent.id, userMessage("유지메시지고유어를 말했다"));

    branchSession(db, parent.id, {
      summaryMessage: createUserMessage({
        role: "user",
        content: [{ type: "text", text: "요약하나고유어" }],
      }),
      keptMessages: [kept],
      systemPrompt: SYSTEM_PROMPT,
      model: MODEL,
    });

    expect(ftsRowsFor(kept.id)).toHaveLength(2);
  });

  it("텍스트 없는 kept 메시지는 자식 쪽에도 FTS 행을 만들지 않는다", () => {
    const parent = newSession();
    const kept = say(parent.id, userMessage("유지메시지고유어"));
    const noText = say(
      parent.id,
      assistantMessage([{ type: "toolCall", toolCallId: "c1", toolName: "read", args: {} }], 1_600),
    );

    branchSession(db, parent.id, {
      summaryMessage: createUserMessage({
        role: "user",
        content: [{ type: "text", text: "요약하나고유어" }],
      }),
      keptMessages: [kept, noText],
      systemPrompt: SYSTEM_PROMPT,
      model: MODEL,
    });

    expect(ftsRowsFor(noText.id)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. 검색 범위 (SEARCH §4)
// ═══════════════════════════════════════════════════════════════════════════

/** 부모 → 자식 → 손자. 압축 체인은 선형이다(SESSION-STORE §5) */
interface Chain {
  root: StoredSession;
  middle: StoredSession;
  tip: StoredSession;
  rootOnlyMessage: UserMessage;
  keptMessage: UserMessage;
}

function buildChain(tipTitle: string): Chain {
  const root = newSession();
  const rootOnlyMessage = say(root.id, userMessage("부모원문고유어만 여기 있다"));
  const keptMessage = say(root.id, userMessage("유지메시지고유어가 이어진다", 1_500));

  const middle = branchSession(db, root.id, {
    summaryMessage: createUserMessage({
      role: "user",
      content: [{ type: "text", text: "요약하나고유어" }],
    }),
    keptMessages: [keptMessage],
    systemPrompt: SYSTEM_PROMPT,
    model: MODEL,
  });

  const tip = branchSession(db, middle.id, {
    summaryMessage: createUserMessage({
      role: "user",
      content: [{ type: "text", text: "요약둘고유어" }],
    }),
    keptMessages: [keptMessage],
    systemPrompt: SYSTEM_PROMPT,
    model: MODEL,
  });

  // `branchSession`은 title을 부모에서 복사하므로 체인 전체가 같은 제목이 된다 —
  // tip의 것을 싣는지 판정하려면 tip만 다른 값을 가져야 한다.
  db.prepare("UPDATE sessions SET title = ? WHERE id = ?").run(tipTitle, tip.id);

  return { root, middle, tip, rootOnlyMessage, keptMessage };
}

describe("검색 범위 — superseded 부모 포함 (SEARCH §4)", () => {
  it("압축 전 원문(부모에만 있는 텍스트)이 검색된다", () => {
    const chain = buildChain("체인끝제목");

    const hits = search("부모원문고유어");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.messageId).toBe(chain.rootOnlyMessage.id);
    expect(hits[0]?.sessionId).toBe(chain.root.id);
  });

  it("중간 세션의 요약도 검색된다", () => {
    buildChain("체인끝제목");
    expect(search("요약하나고유어")).toHaveLength(1);
  });
});

describe("검색 범위 — 같은 id는 1회 (SEARCH §4)", () => {
  it("부모·자식·손자에 같은 id로 존재해도 결과는 1건이다", () => {
    const chain = buildChain("체인끝제목");

    // 전제 확인 — 색인 자체에는 3벌이 있다. dedupe가 검색의 책임임을 이 대비가 보인다.
    expect(ftsRowsFor(chain.keptMessage.id)).toHaveLength(3);

    expect(search("유지메시지고유어")).toHaveLength(1);
  });

  /**
   * SEARCH §4 — "대표 행은 자식(체인 tip에 가까운) 쪽". `messageId`·`chainTipId`·
   * `timestamp`는 어느 행을 골라도 같으므로 실제로 갈리는 것은 `sessionId` 하나다.
   * `[미규정 A-5]` 참조.
   */
  it("대표 행은 체인 tip에 가까운 쪽이다", () => {
    const chain = buildChain("체인끝제목");
    expect(search("유지메시지고유어")[0]?.sessionId).toBe(chain.tip.id);
  });
});

describe("검색 범위 — soft-delete 제외 (SEARCH §4)", () => {
  it("삭제된 세션의 메시지는 검색되지 않는다", () => {
    const session = newSession();
    say(session.id, userMessage("삭제대상고유어를 말했다"));
    expect(search("삭제대상고유어")).toHaveLength(1);

    deleteSession(db, session.id);

    expect(search("삭제대상고유어")).toEqual([]);
  });

  /**
   * SEARCH §4 — "체인 tip이 soft-delete되면 그 체인 전체(superseded 부모들 포함)가
   * 검색에서 빠진다. 부모는 목록 밖 행이라 사용자가 개별 삭제할 수 없으므로, 체인의
   * 가시성은 tip의 `active`가 대표한다."
   */
  it("체인 tip을 삭제하면 superseded 부모의 원문도 검색에서 빠진다", () => {
    const chain = buildChain("체인끝제목");
    expect(search("부모원문고유어")).toHaveLength(1);

    deleteSession(db, chain.tip.id);

    expect(search("부모원문고유어")).toEqual([]);
    expect(search("요약하나고유어")).toEqual([]);
    expect(search("유지메시지고유어")).toEqual([]);
  });

  it("한 세션을 지워도 다른 세션의 매치는 남는다", () => {
    const kept = newSession();
    const removed = newSession();
    say(kept.id, userMessage("공통검색어가 여기 있다"));
    say(removed.id, userMessage("공통검색어가 저기도 있다"));

    deleteSession(db, removed.id);

    const hits = search("공통검색어");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.sessionId).toBe(kept.id);
  });

  /**
   * **제외는 조회 조건이지 사후 필터가 아니다** (SEARCH §4, SESSION-STORE §5의 같은
   * 판정 준용). 사후 필터면 삭제된 체인의 매치가 `limit` 자리를 소비해, 사용자에게는
   * 멀쩡한 대화가 검색에서 사라진 것으로 보인다.
   *
   * 삭제 세션의 메시지는 같은 검색어를 여러 번 담아 bm25 상위를 차지하게 만들었다 —
   * 사후 필터 구현이면 상위 3건이 전부 걸러져 결과가 0건이 된다.
   */
  it("삭제된 체인의 매치가 limit 자리를 소비하지 않는다", () => {
    const live = newSession();
    const removed = newSession();

    const term = "리밋소비고유어";
    const dense = `${term} `.repeat(8);
    for (let i = 0; i < 5; i += 1) {
      say(removed.id, userMessage(`${dense}삭제된 발화 ${i}`, 1_000 + i));
    }
    for (let i = 0; i < 3; i += 1) {
      say(live.id, userMessage(`${term} 살아 있는 발화 ${i}`, 2_000 + i));
    }

    deleteSession(db, removed.id);

    const hits = search(term, { limit: 3 });
    expect(hits).toHaveLength(3);
    expect(hits.every((hit) => hit.sessionId === live.id)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. chainTip 해석 (SEARCH §4)
// ═══════════════════════════════════════════════════════════════════════════

describe("chainTip 해석 (SEARCH §4)", () => {
  it("체인이 없으면 chainTipId는 자기 세션이다", () => {
    const session = newSession();
    say(session.id, userMessage("단독세션고유어를 말했다"));

    const hit = search("단독세션고유어")[0];
    expect(hit?.sessionId).toBe(session.id);
    expect(hit?.chainTipId).toBe(session.id);
  });

  it("superseded 부모의 매치가 체인 tip을 가리킨다", () => {
    const chain = buildChain("체인끝제목");

    const hit = search("부모원문고유어")[0];
    expect(hit?.sessionId).toBe(chain.root.id);
    expect(hit?.chainTipId).toBe(chain.tip.id);
  });

  it("중간 세션의 매치도 tip을 가리킨다 (선형 체인을 끝까지 따라간다)", () => {
    const chain = buildChain("체인끝제목");

    const hit = search("요약하나고유어")[0];
    expect(hit?.sessionId).toBe(chain.middle.id);
    expect(hit?.chainTipId).toBe(chain.tip.id);
  });

  it("chainTipTitle은 tip의 title이다 (부모의 것이 아니다)", () => {
    buildChain("체인끝제목");

    expect(search("부모원문고유어")[0]?.chainTipTitle).toBe("체인끝제목");
    expect(search("요약하나고유어")[0]?.chainTipTitle).toBe("체인끝제목");
  });

  it("title이 없으면 chainTipTitle은 null이다", () => {
    const session = newSession();
    // title은 첫 `UserMessage`에서만 파생된다(SESSION-STORE §2) — 어시스턴트 발화만
    // 있는 세션의 title은 NULL이고, `SearchHit.chainTipTitle`은 그것을 그대로 싣는다.
    say(session.id, assistantText("제목없음고유어를 답했다"));

    expect(search("제목없음고유어")[0]?.chainTipTitle).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. 리터럴 질의 — FTS5 문법을 노출하지 않는다 (SEARCH §4)
// ═══════════════════════════════════════════════════════════════════════════

describe("리터럴 질의 (SEARCH §4)", () => {
  const SYNTAX_QUERIES = [
    "*",
    "AND",
    "OR",
    "NEAR",
    "(",
    ")",
    '"',
    "^",
    "고양이*",
    "(고양이 OR 강아지)",
    "NEAR(고양이 강아지)",
    '"닫히지 않은 인용',
    "^접두어",
    "-부정어",
    '""',
    "고양이 AND",
    "a* OR (b NEAR c)",
  ];

  /** 어떤 사용자 입력도 쿼리 문법 에러를 일으키지 않아야 한다 — 유일한 효과가 에러 화면이다 */
  it.each(SYNTAX_QUERIES)("FTS5 문법 문자가 든 질의 %j가 에러를 던지지 않는다", (query) => {
    const session = newSession();
    say(session.id, userMessage("아무 내용이나 있다"));

    expect(() => search(query)).not.toThrow();
  });

  /**
   * 리터럴의 실체 — `OR`가 불리언으로 해석되면 "고양이"만 있는 메시지도 함께 걸린다.
   * 리터럴 phrase면 `"고양이 OR 강아지"`라는 문자열이 실제로 든 메시지만 걸린다.
   */
  it("OR가 불리언 연산자로 해석되지 않는다", () => {
    const session = newSession();
    const literal = say(session.id, userMessage("고양이 OR 강아지 이야기"));
    say(session.id, userMessage("고양이 혼자 있다", 1_100));
    say(session.id, userMessage("강아지 혼자 있다", 1_200));

    const hits = search("고양이 OR 강아지");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.messageId).toBe(literal.id);
  });

  it('인용 이스케이프가 동작한다 (질의 안의 " 가 리터럴이다)', () => {
    const session = newSession();
    const quoted = say(session.id, userMessage('그는 "안녕"이라고 말했다'));
    say(session.id, userMessage("안녕 반갑다고 말했다", 1_100));

    const hits = search('"안녕"');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.messageId).toBe(quoted.id);
  });

  it("*가 와일드카드가 아니다", () => {
    const session = newSession();
    const literal = say(session.id, userMessage("계산은 2*3 이다"));
    say(session.id, userMessage("계산은 243 이다", 1_100));

    const hits = search("2*3");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.messageId).toBe(literal.id);
  });

  it("빈 결과는 빈 배열이다 (에러가 아니다)", () => {
    const session = newSession();
    say(session.id, userMessage("아무 내용이나 있다"));

    expect(search("존재하지않는검색어")).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. 3자 미만 LIKE 폴백 (SEARCH §4)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * trigram은 3자 미만을 매치할 수 없다. 한국어 2자 단어("압축"·"설정"·"삭제")가 흔하므로
 * 이 폴백은 부속이 아니라 **요구사항**이다(SEARCH §4·§7).
 */
describe("3자 미만 LIKE 폴백 (SEARCH §4)", () => {
  it('2자 한국어 질의가 매치를 찾는다 — "압축"', () => {
    const session = newSession();
    say(session.id, userMessage("압축을 실행했다"));
    say(session.id, userMessage("재압축 완료다", 1_100));
    say(session.id, userMessage("무관한 문장이다", 1_200));

    expect(search("압축")).toHaveLength(2);
  });

  it('2자 한국어 질의가 매치를 찾는다 — "설정"', () => {
    const session = newSession();
    say(session.id, userMessage("설정 파일을 고쳤다"));
    say(session.id, userMessage("기본설정이 안전해야 한다", 1_100));

    expect(search("설정")).toHaveLength(2);
  });

  it("1자 질의도 에러 없이 동작한다", () => {
    const session = newSession();
    say(session.id, userMessage("압축을 실행했다"));

    expect(() => search("압")).not.toThrow();
    expect(search("압")).toHaveLength(1);
  });

  /** `%`가 와일드카드로 해석되면 "50가 남았다"까지 걸린다 */
  it("2자 질의의 %가 와일드카드로 해석되지 않는다", () => {
    const session = newSession();
    const literal = say(session.id, userMessage("50%가 남았다"));
    say(session.id, userMessage("50가 남았다", 1_100));

    const hits = search("0%");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.messageId).toBe(literal.id);
  });

  /** `_`가 와일드카드로 해석되면 "axb"까지 걸린다 */
  it("2자 질의의 _가 와일드카드로 해석되지 않는다", () => {
    const session = newSession();
    const literal = say(session.id, userMessage("a_b 코드다"));
    say(session.id, userMessage("axb 코드다", 1_100));

    const hits = search("_b");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.messageId).toBe(literal.id);
  });

  it("폴백 경로도 soft-delete를 제외한다", () => {
    const session = newSession();
    say(session.id, userMessage("압축을 실행했다"));
    deleteSession(db, session.id);

    expect(search("압축")).toEqual([]);
  });

  it("폴백 경로도 같은 id를 1회만 돌려준다", () => {
    const chain = buildChain("체인끝제목");
    // "유지"는 2자라 폴백 경로로 간다 — kept 복사가 3벌 색인돼 있다.
    expect(ftsRowsFor(chain.keptMessage.id)).toHaveLength(3);

    expect(search("유지")).toHaveLength(1);
  });

  /** 폴백 여부는 결과에 표시하지 않는다 — 사용자에게는 같은 검색이다(SEARCH §4) */
  it("폴백 여부가 결과에 드러나지 않는다 (SearchHit 필드가 같다)", () => {
    const session = newSession();
    say(session.id, userMessage("압축 설계를 검토했다"));

    const viaFts = search("압축 설계");
    const viaLike = search("압축");

    expect(Object.keys(viaFts[0] ?? {}).sort()).toEqual([...SEARCH_HIT_FIELDS]);
    expect(Object.keys(viaLike[0] ?? {}).sort()).toEqual([...SEARCH_HIT_FIELDS]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. 정렬 · limit (SEARCH §4)
// ═══════════════════════════════════════════════════════════════════════════

describe("정렬 · limit (SEARCH §4)", () => {
  function seedMatches(count: number): StoredSession {
    const session = newSession();
    for (let i = 0; i < count; i += 1) {
      say(session.id, userMessage(`리밋기본값고유어 ${i}번 발화`, 1_000 + i));
    }
    return session;
  }

  it("limit 기본값은 20이다", () => {
    seedMatches(25);
    expect(search("리밋기본값고유어")).toHaveLength(20);
  });

  it("명시한 limit을 지킨다", () => {
    seedMatches(25);
    const opts: SearchOptions = { limit: 5 };
    expect(search("리밋기본값고유어", opts)).toHaveLength(5);
  });

  it("매치가 limit보다 적으면 전부 돌려준다", () => {
    seedMatches(3);
    expect(search("리밋기본값고유어", { limit: 20 })).toHaveLength(3);
  });

  it("빈 옵션 객체는 기본값과 같다", () => {
    seedMatches(25);
    expect(search("리밋기본값고유어", {})).toHaveLength(20);
  });

  /**
   * "관련 높은 것 먼저"(SEARCH §4 — rank(bm25) 기본)의 관측 가능한 의미. 정확한 점수를
   * 단정하지 않는다 — 조정 가능 영역이라 순위의 방향만 본다.
   */
  it("같은 검색어가 더 많이 든 메시지가 앞에 온다", () => {
    const session = newSession();
    say(session.id, userMessage("정렬확인고유어 한 번"));
    const dense = say(session.id, userMessage(`${"정렬확인고유어 ".repeat(8)}많이 들었다`, 1_100));

    expect(search("정렬확인고유어")[0]?.messageId).toBe(dense.id);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. SearchHit 형상 (SEARCH §4)
// ═══════════════════════════════════════════════════════════════════════════

describe("SearchHit 형상 (SEARCH §4)", () => {
  it("필드가 7개로 정확히 닫힌다", () => {
    const session = newSession();
    say(session.id, userMessage("형상확인고유어를 말했다"));

    expect(Object.keys(search("형상확인고유어")[0] ?? {}).sort()).toEqual([...SEARCH_HIT_FIELDS]);
  });

  it("messageId·sessionId·timestamp가 저장된 메시지의 값과 같다", () => {
    const session = newSession();
    const message = say(session.id, userMessage("형상확인고유어를 말했다", 1_234));

    const hit = search("형상확인고유어")[0];
    expect(hit?.messageId).toBe(message.id);
    expect(hit?.sessionId).toBe(session.id);
    expect(hit?.timestamp).toBe(1_234);
  });

  it("role이 메시지의 역할을 그대로 싣는다", () => {
    const session = newSession();
    say(session.id, userMessage("역할확인고유어 사용자"));
    say(session.id, assistantText("역할확인고유어 어시스턴트", 1_100));

    const roles = search("역할확인고유어")
      .map((hit) => hit.role)
      .sort();
    expect(roles).toEqual(["assistant", "user"]);
  });

  /** 색인 대상이 두 역할뿐이므로 toolResult가 결과에 나타날 경로 자체가 없다 */
  it("toolResult는 어떤 결과에도 나타나지 않는다", () => {
    const session = newSession();
    say(session.id, userMessage("역할확인고유어 사용자"));
    say(session.id, toolResultMessage("역할확인고유어 도구 출력", 1_100));

    const hits = search("역할확인고유어");
    expect(hits).toHaveLength(1);
    expect(hits.every((hit) => hit.role === "user" || hit.role === "assistant")).toBe(true);
  });

  /**
   * 타입 수준 단정 — `role`이 `"toolResult"`까지 받도록 넓어지면 `RoleIsClosed`가
   * `false`가 되어 `Assert<false>`가 제약을 만족하지 못하고 **tsc가 실패한다.**
   * 런타임 단정만으로는 표면이 넓어진 것을 잡지 못한다.
   */
  it('role이 "user" | "assistant"로 닫힌다 (타입 수준)', () => {
    type Assert<T extends true> = T;
    type RoleIsClosed = Assert<[SearchHit["role"]] extends ["user" | "assistant"] ? true : false>;

    const roleIsClosed: RoleIsClosed = true;
    expect(roleIsClosed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. 스니펫 (SEARCH §4)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * **2026-08-07 계약 정정 반영.** §4의 스니펫 생성 수단이 FTS5 `snippet()`에서
 * **애플리케이션 발췌**로 바뀌었다. 근거는 실측이다 — trigram 토크나이저에서
 * `snippet()`은 문자 하나하나를 개별 토큰으로 보아 **발췌 전 구간의 모든 문자를**
 * 마커로 감싼다. 매치 구간 표시라는 목적 자체가 성립하지 않는다.
 *
 * 따라서 이 블록은 **생성 수단을 검증하지 않는다**(`snippet()` SQL 함수를 썼는지는
 * 계약이 아니다). 검증하는 것은 관찰 가능한 결과 셋이다:
 *   1. 마커가 **매치 구간에만** 있다 — 방금 실측된 실패 모드의 직접 번역
 *   2. 대소문자 무시로 찾되 **원문의 대소문자가 보존**된다
 *   3. FTS 경로(3자 이상)와 LIKE 폴백(2자)의 스니펫 **형식이 같다**
 *      — 같은 발췌 함수를 쓰는 것이 정정의 부수 효과이고, 사용자에게는 같은 검색이다
 */
describe("스니펫 (SEARCH §4 — 2026-08-07 정정)", () => {
  /** 앞뒤 문맥이 충분히 길어 "발췌"가 의미를 갖는 본문 */
  const LONG_TEXT =
    "앞쪽 문맥이 제법 길게 이어지는 문장이고 그 한가운데에 스니펫고유어가 자리를 잡고 있으며 " +
    "뒤쪽 문맥도 마찬가지로 제법 길게 이어져서 발췌가 의미를 갖는다";

  it("매치 주변 발췌가 실린다", () => {
    const session = newSession();
    say(session.id, userMessage(LONG_TEXT));

    const snippet = search("스니펫고유어")[0]?.snippet ?? "";
    expect(snippet.length).toBeGreaterThan(0);
    expect(plainSnippet(snippet)).toContain("스니펫고유어");
  });

  it("마커가 매치 구간만 감싼다 — 발췌 전체가 마킹되면 위반이다", () => {
    // trigram + `snippet()` 조합의 실패 모드가 바로 이것이다(2026-08-07 실측):
    // 발췌 전 구간의 문자가 하나씩 개별 마킹된다.
    const session = newSession();
    say(session.id, userMessage(LONG_TEXT));

    const snippet = search("스니펫고유어")[0]?.snippet ?? "";
    const spans = markedSpans(snippet);

    // 마킹된 구간은 질의 하나뿐이어야 한다 — 문자 단위로 쪼개지면 여기서 폭증한다.
    expect(spans).toEqual(["스니펫고유어"]);

    // 발췌에는 마킹되지 않은 문맥이 반드시 남는다. 전 구간 마킹이면 이 단정이 깨진다.
    const marked = spans.join("");
    expect(plainSnippet(snippet).length).toBeGreaterThan(marked.length);
  });

  it("마커가 짝을 이룬다 — 여는 수 == 닫는 수", () => {
    const session = newSession();
    say(session.id, userMessage(LONG_TEXT));

    const snippet = search("스니펫고유어")[0]?.snippet ?? "";
    expect(countOf(snippet, MARK_START)).toBe(countOf(snippet, MARK_END));
    expect(countOf(snippet, MARK_START)).toBeGreaterThan(0);
    expect(snippet.indexOf(MARK_START)).toBeLessThan(snippet.indexOf(MARK_END));
  });

  it("대소문자 무시로 찾되 원문의 대소문자를 보존한다", () => {
    // trigram은 대소문자 무시다(실측) — 질의 `riverbank`가 `RiverBank`에 매치된다.
    // 발췌가 질의 문자열을 그대로 끼워 넣으면 사용자가 쓴 원문이 화면에서 변조된다.
    const session = newSession();
    say(session.id, userMessage("우리는 그 RiverBank 근처에서 오래 이야기를 나눴다"));

    const snippet = search("riverbank")[0]?.snippet ?? "";
    expect(plainSnippet(snippet)).toContain("RiverBank");
    expect(markedSpans(snippet)).toEqual(["RiverBank"]);
  });

  it("대문자 질의도 같다 — 마킹 구간이 원문 형태 그대로다", () => {
    const session = newSession();
    say(session.id, userMessage("우리는 그 RiverBank 근처에서 오래 이야기를 나눴다"));

    expect(markedSpans(search("RIVERBANK")[0]?.snippet ?? "")).toEqual(["RiverBank"]);
  });

  it("LIKE 폴백(2자)의 스니펫도 같은 형식이다 — 사용자에게는 같은 검색이다", () => {
    // 정정의 부수 효과: `snippet()`은 폴백 경로에서 쓸 수 없으므로 원안대로라면
    // 표시 코드가 두 벌이 됐다. 이제 두 경로가 같은 발췌 함수를 쓴다.
    const session = newSession();
    say(
      session.id,
      userMessage(
        "앞쪽 문맥이 제법 길게 이어지는 문장이고 그 한가운데에 압축이 자리를 잡고 있으며 " +
          "뒤쪽 문맥도 마찬가지로 제법 길게 이어진다",
      ),
    );

    const snippet = search("압축")[0]?.snippet ?? "";
    expect(snippet.length).toBeGreaterThan(0);
    expect(markedSpans(snippet)).toEqual(["압축"]);
    expect(countOf(snippet, MARK_START)).toBe(countOf(snippet, MARK_END));
    expect(plainSnippet(snippet).length).toBeGreaterThan("압축".length);
  });

  it("FTS 경로와 폴백 경로의 스니펫 구조가 같다", () => {
    // 같은 본문·같은 매치 낱말인데 질의 길이만 3자 경계를 넘나들 때 결과 형식이
    // 달라지면 "폴백 여부는 결과에 표시하지 않는다"(§4)가 깨진다.
    const session = newSession();
    say(session.id, userMessage(LONG_TEXT));

    const viaFts = search("스니펫고유어")[0]?.snippet ?? "";
    const viaLike = search("스니")[0]?.snippet ?? "";

    for (const snippet of [viaFts, viaLike]) {
      expect(snippet.length).toBeGreaterThan(0);
      expect(countOf(snippet, MARK_START)).toBe(countOf(snippet, MARK_END));
      expect(markedSpans(snippet).length).toBeGreaterThan(0);
    }
    expect(markedSpans(viaLike)).toEqual(["스니"]);
  });

  it("같은 질의는 같은 스니펫을 낸다 (결정적)", () => {
    const session = newSession();
    say(session.id, userMessage(LONG_TEXT));

    expect(search("스니펫고유어")[0]?.snippet).toBe(search("스니펫고유어")[0]?.snippet);
  });

  /**
   * 판정 요청은 파일 말미의 `[미규정 A-6]`(발췌 안에서 질의가 여러 번 나올 때의 마킹
   * 범위)에 이미 있다. 여기서는 그 판정이 어느 쪽으로 나든 **금지된 결과만** 본다 —
   * 마킹 구간이 존재하고, 그 구간이 전부 질의와 같아야 한다(문맥이 마킹되면 위반).
   */
  it("질의가 여러 번 나와도 마킹 구간은 전부 질의와 같다", () => {
    const session = newSession();
    say(
      session.id,
      userMessage("반복고유어가 앞에 있고 가운데를 한참 지나 뒤에도 반복고유어가 있다"),
    );

    const snippet = search("반복고유어")[0]?.snippet ?? "";
    const spans = markedSpans(snippet);
    expect(spans.length).toBeGreaterThan(0);
    for (const span of spans) expect(span).toBe("반복고유어");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. store 공개 표면 — SessionStore.searchMessages (SEARCH §4)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * SEARCH §4의 정본 표면은 `searchMessages(query, opts)` — 저장소 핸들의 메서드다.
 * 위의 전 테스트가 쓰는 자유 함수와 **같은 결과**를 내야 한다(store.ts는 위임일 뿐이다).
 */
describe("SessionStore.searchMessages (SEARCH §4)", () => {
  it("store 핸들이 자유 함수와 같은 결과를 낸다", () => {
    const session = newSession();
    const message = say(session.id, userMessage("위임확인고유어를 말했다", 4_242));
    const direct = search("위임확인고유어");
    db.close();

    const store = openSessionStore({ home, onWarning: () => {} });
    try {
      const viaStore = store.searchMessages("위임확인고유어");

      expect(viaStore).toEqual(direct);
      expect(viaStore).toHaveLength(1);
      expect(viaStore[0]?.messageId).toBe(message.id);
      expect(viaStore[0]?.sessionId).toBe(session.id);
    } finally {
      store.close();
    }
  });

  it("store 핸들도 limit 옵션을 받는다", () => {
    const session = newSession();
    for (let i = 0; i < 5; i += 1) {
      say(session.id, userMessage(`위임리밋고유어 ${i}`, 1_000 + i));
    }
    db.close();

    const store = openSessionStore({ home, onWarning: () => {} });
    try {
      expect(store.searchMessages("위임리밋고유어", { limit: 2 })).toHaveLength(2);
      expect(store.searchMessages("위임리밋고유어")).toHaveLength(5);
    } finally {
      store.close();
    }
  });

  it("빈 결과는 빈 배열이다", () => {
    db.close();

    const store = openSessionStore({ home, onWarning: () => {} });
    try {
      expect(store.searchMessages("존재하지않는검색어")).toEqual([]);
    } finally {
      store.close();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [미규정 A-n] — QA-A가 임의 판정하지 않고 남기는 회색지대
// ═══════════════════════════════════════════════════════════════════════════
//
// [미규정 A-4] **FTS INSERT 실패 주입이 `DROP TABLE messages_fts`다.** `src/`를 건드리지
//   않고 색인 INSERT만 실패시킬 다른 수단을 찾지 못했다. 이 주입은 "테이블이 없다"는
//   실패라 실제 운용에서 나올 실패(디스크 가득·손상)와 종류가 다르다.
//   잠정 의견: 계약이 요구하는 사후 조건("색인이 실패하면 메시지도 저장되지 않는다")은
//   실패의 종류와 무관하므로 검증으로 충분하다고 본다. **판정 필요.**
//
// [미규정 A-5] **dedupe 대표 행의 `sessionId`가 반규정이다.** SEARCH §4는 "대표 행은
//   자식(체인 tip에 가까운) 쪽"이라 쓴 뒤 곧바로 "결정적 규칙이면 어느 쪽이든 결과는
//   같다(body 동일)"고 덧붙인다. 실제로는 `sessionId` 하나가 갈린다 — 자식을 고르면
//   tip, 부모를 고르면 원문이 난 자리.
//   잠정 의견: 앞 문장이 규정이고 뒤 문장은 그 선택이 무해하다는 부연으로 읽는 것이
//   자연스러워 **tip 쪽**으로 테스트를 고정했다. 다만 `sessionId`의 의미가 SEARCH §4
//   주석("매치가 발견된 세션 — superseded 부모일 수 있다")과는 긴장 관계다: dedupe가
//   자식을 고르면 "매치가 발견된 세션"이 실제 발견 위치가 아니게 된다. **판정 필요.**
//
// [미규정 A-6] — **A-11로 합쳤다.** 같은 판정(발췌 안에서 질의가 여러 번 나올 때의 마킹
//   범위)을 두 번호로 부르면 판정 목록에서 한쪽이 누락된다. 번호는 회수하지 않고 이
//   포인터만 남긴다 — 이미 나간 보고에서 A-6을 찾는 사람이 빈손으로 돌아가지 않게.
//   (마커의 구체 문자는 더 이상 회색지대가 아니다 — SEARCH §4 개정이 U+0001·U+0002로
//   확정했고 `MARK_START`·`MARK_END` 한 곳에 두었다.)
//
// [미규정 A-7] **LIKE 폴백 경로의 정렬 규칙.** SEARCH §4는 "rank(bm25) 기본"이라 정했으나
//   폴백 경로에는 bm25가 없다. 위 §9의 정렬 테스트는 FTS 경로만 본다.
//   잠정 의견: `timestamp` 내림차순("최근 것부터")이 사용자 기대에 가깝고, §4가 날짜
//   정렬을 "지금 안 만든다"고 한 것은 **옵션**에 대한 판정이지 폴백의 내부 규칙에 대한
//   것이 아니다. 다만 두 경로의 정렬이 다르면 같은 검색어의 길이 하나로 순서가 바뀌므로,
//   사용자에게 설명 가능한 규칙인지는 판정이 필요하다. **판정 필요.**
//
// [미규정 A-8] **limit의 경계값.** `limit: 0`·음수·비정수가 미규정이다. `listSessions`는
//   음수 LIMIT을 "제한 없음"으로 쓰는 SQLite 관례에 기대고 있어(`sessions.ts`의
//   `NO_LIMIT`), `limit: -1`이 전량 반환으로 새면 사용자 입력이 그대로 흘러갔을 때
//   의도치 않게 전체를 반환한다. 테스트로 고정하지 않았다.
//   잠정 의견: `/search`의 인자는 질의 문자열뿐이라(SEARCH §5) limit이 사용자 입력에서
//   오는 경로가 지금은 없다 — 급하지 않다. 확정한다면 "0 이하는 기본값으로 취급"이
//   `listSessions`와의 차이를 만들지 않는 쪽이다. **판정 필요.**
