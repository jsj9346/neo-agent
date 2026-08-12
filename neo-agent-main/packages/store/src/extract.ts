/**
 * 검색 텍스트 추출과 색인 쓰기 — `docs/SEARCH.md` §3.
 *
 * **색인 대상 판정이 존재하는 유일한 곳이다.** §2가 SQL 트리거를 기각한 근거가
 * 그것이다 — `messages.body`는 JSON 통짜라 트리거로 추출하려 들면 메시지 계약이
 * TS와 트리거 SQL 두 곳에 존재하게 된다. 저장(`messages.ts`)·분기(`branch.ts`)·
 * 백필(`migrate.ts`) 세 경로가 전부 여기를 지난다.
 *
 * **불변 조건: FTS 행 존재 ⇔ 검색 가능 텍스트 존재**(§3). 텍스트가 없는 메시지는
 * 빈 행을 남기지 않는다 — 남기면 이 동치가 깨지고 재구축 로직에 분기가 생긴다.
 */

import type { DatabaseSync } from "node:sqlite";
import type { AgentMessage } from "@neo-agent/core";
import { textParam } from "./bind.ts";

/** 한 메시지의 여러 `TextContent`를 잇는 구분자(§3) */
const BLOCK_SEPARATOR = "\n\n";

/**
 * 색인 행 INSERT. 세 경로가 같은 문장을 쓴다 — 컬럼 순서가 어긋날 자리를 만들지
 * 않는다. 컬럼이 셋뿐인 이유는 §2 참조(role·timestamp·title은 JOIN에서 나온다).
 */
export const INSERT_SEARCH_ROW_SQL = `
  INSERT INTO messages_fts (text, session_id, message_id) VALUES (?, ?, ?)
`;

/**
 * 검색 대상 텍스트. 없으면 `undefined` — **호출자는 그때 FTS 행을 만들지 않는다.**
 *
 * §3 표 그대로다: `UserMessage`·`AssistantMessage`의 `TextContent`만 남고
 * `ThinkingContent`(표시·기록 전용 계약)·`ToolCallContent`(args는 기계 소음)·
 * `ImageContent`(base64)·`ToolResultMessage` 전체(트랜스크립트 바이트의 대부분이
 * 기계 소음)가 빠진다.
 *
 * **압축 요약(합성 `UserMessage`)에 분기를 두지 않는다.** 요약은 역할을 신설하지
 * 않는다는 것이 압축 설계의 결정이므로(COMPACTION §2), 여기서 합성 여부를 보면
 * 그 결정이 색인 쪽에서 무너진다 — 콘텐츠 기준 판정의 자동 결과여야 한다.
 *
 * **빈 문자열 `TextContent`는 텍스트로 세지 않는다** — `SEARCH.md` §3이 정한다
 * (판정 ES-1). 세는 쪽이면 `text = ""`인 FTS 행이 생기는데 그것은 "검색 가능
 * 텍스트"가 아니므로 §3의 대칭 불변 조건(**FTS 행 존재 ⇔ 검색 가능 텍스트 존재**)이
 * 문자 그대로 깨진다. 빈 블록만 있는 메시지는 이미지만 있는 메시지와 검색 관점에서
 * 구별되지 않는다.
 */
export function extractSearchText(message: AgentMessage): string | undefined {
  // 도구 결과는 `TextContent`를 가지고 있어도 통째로 빠진다 — 블록 단위가 아니라
  // 메시지 단위의 판정이다(§3 표의 "`ToolResultMessage` 전체").
  if (message.role === "toolResult") return undefined;

  const texts: string[] = [];
  for (const block of message.content) {
    if (block.type !== "text") continue;
    if (block.text.length === 0) continue;
    texts.push(block.text);
  }

  return texts.length === 0 ? undefined : texts.join(BLOCK_SEPARATOR);
}

/**
 * 메시지 하나를 색인한다. 검색 가능 텍스트가 없으면 아무것도 하지 않는다.
 *
 * **호출자의 트랜잭션 안에서 실행된다** — 이 함수는 트랜잭션을 열지도 닫지도
 * 않는다(§3 "저장과 같은 트랜잭션"). 실패는 삼키지 않고 그대로 던져 저장 트랜잭션
 * 전체를 실패시킨다: 메시지는 저장됐는데 색인만 빠진 상태가 침묵 드리프트다.
 */
export function indexMessage(db: DatabaseSync, sessionId: string, message: AgentMessage): void {
  const text = extractSearchText(message);
  if (text === undefined) return;

  db.prepare(INSERT_SEARCH_ROW_SQL).run(
    textParam(text, "messages_fts.text"),
    textParam(sessionId, "messages_fts.session_id"),
    textParam(message.id, "messages_fts.message_id"),
  );
}
