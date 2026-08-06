/**
 * 세션 이어가기 — `docs/SESSION-STORE.md` §5.
 *
 * 재개 검증은 두 불일치를 **다르게** 취급한다. 가르는 기준은 하나다 —
 * **틀린 결과가 나오는가, 비싼 결과가 나오는가.**
 */

import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { type AgentMessage, agentMessageSchema } from "@neo-agent/core";
import { textParam } from "./bind.ts";
import type { StoreWarningHandler } from "./open.ts";
import { getSession, type StoredSession } from "./sessions.ts";

/**
 * 재개 시점의 현재 컨텍스트 — 저장된 값과 비교할 기준이다.
 *
 * 초판 `SESSION-STORE.md` §5의 시그니처 블록(`loadSession(id)`)은 같은 절의 산문이
 * 요구하는 워크스페이스 검증을 구현할 수 없었다 — 인자 하나로는 현재 워크스페이스를
 * 알 수 없다. 구현자·QA-B의 독립 지적으로 2026-08-06 문서가 정정됐다(§5에
 * `ResumeContext` 반영). 산문이 계약 실질이고 시그니처 블록은 조정 가능 세부라는
 * 문서 지위 선언에 따른 처리다.
 */
export interface ResumeContext {
  workspaceRoot: string;
  systemPrompt: string;
  model: string;
}

export interface LoadedSession {
  session: StoredSession;
  /** `active = 1`인 메시지를 `seq` 순으로. 그대로 `AgentSessionInit.messages`가 된다 */
  messages: AgentMessage[];
}

export function loadSession(
  db: DatabaseSync,
  sessionId: string,
  context: ResumeContext,
  warn: StoreWarningHandler,
): LoadedSession {
  const session = getSession(db, sessionId);
  if (session === undefined) {
    // 빈 세션을 지어내지 않는다 — 없는 세션으로 재개하면 사용자는 과거 대화가
    // 사라진 것을 모른 채 새 대화를 이어간다.
    throw new Error(`No session with id "${sessionId}".`);
  }

  assertSameWorkspace(session, context.workspaceRoot);
  warnOnCacheBreakingMismatch(session, context, warn);

  return { session, messages: readMessages(db, sessionId) };
}

/**
 * **워크스페이스 불일치는 거부한다**(§5).
 *
 * 과거 트랜스크립트의 파일 경로가 전부 다른 실체를 가리키게 되고, 모델은 그것을
 * 모른 채 "아까 고친 파일"을 다시 수정하려 한다 — **조용히 엉뚱한 곳을 고치는
 * 경로**이며, `TOOLS-INTERFACE.md`가 fuzzy edit를 기각한 것과 같은 방향이다.
 *
 * 비교는 realpath 기준이다. 문자열 비교로 하면 심링크를 거친 같은 디렉터리가
 * 근거 없이 거부된다 — 사용자에게는 같은 곳인데 재개가 막히는 오탐이다.
 */
function assertSameWorkspace(session: StoredSession, currentRoot: string): void {
  const stored = canonicalize(session.workspaceRoot);
  const current = canonicalize(currentRoot);
  if (stored === current) return;

  throw new Error(
    `Session ${session.id} belongs to workspace ${session.workspaceRoot}, but the current workspace is ${currentRoot}. ` +
      "Resuming here would point every past file path at a different file. " +
      "Run neo-agent from the original workspace, or start a new session.",
  );
}

/**
 * 존재하면 realpath로, 없으면 절대 경로로 정규화한다.
 *
 * 미존재를 이유로 판정을 포기하지 않는 이유: 저장된 워크스페이스가 지워졌거나
 * 옮겨졌을 때도 "같지 않다"는 판정은 여전히 옳고, 그때 통과시키면 §5가 막으려던
 * 바로 그 상황(다른 실체를 가리키는 재개)이 열린다.
 */
function canonicalize(path: string): string {
  const absolute = resolve(path);
  return existsSync(absolute) ? realpathSync(absolute) : absolute;
}

/**
 * **시스템 프롬프트·모델 불일치는 경고 후 진행한다**(§5).
 *
 * 결과가 비용 증가(프롬프트 캐시 무효화)에 그치고, neo-agent 버전이 올라 시스템
 * 프롬프트가 바뀌면 모든 과거 세션의 재개가 막히기 때문이다.
 */
function warnOnCacheBreakingMismatch(
  session: StoredSession,
  context: ResumeContext,
  warn: StoreWarningHandler,
): void {
  if (session.systemPrompt !== context.systemPrompt) {
    warn({
      kind: "system-prompt-mismatch",
      sessionId: session.id,
      stored: session.systemPrompt,
      current: context.systemPrompt,
      message:
        `Session ${session.id} was recorded with a different system prompt. ` +
        "Resuming works, but the prompt cache for this conversation is invalidated — the next request re-reads the whole transcript.",
    });
  }

  if (session.model !== context.model) {
    warn({
      kind: "model-mismatch",
      sessionId: session.id,
      stored: session.model,
      current: context.model,
      message:
        `Session ${session.id} was recorded with model ${session.model}, resuming with ${context.model}. ` +
        "Resuming works, but the prompt cache for this conversation is invalidated.",
    });
  }
}

/**
 * `active = 1`인 메시지를 `seq` 순으로 읽고 **전부** 검증한다.
 *
 * **손상 행은 건너뛰지 않는다**(§7). 건너뛰면 트랜스크립트에 구멍이 나고, 도구
 * 호출만 남고 결과가 사라진 트랜스크립트로 재개하면 다음 API 호출이 와이어
 * 정합성 검사에서 거부된다. 구멍 난 대화를 조용히 이어가는 것보다 열지 못하는
 * 편이 낫다.
 *
 * 검증에 **코어가 공개한 `agentMessageSchema`를 쓴다**(§2). 저장소가 자체 스키마를
 * 정의하면 계약이 두 곳에 존재하고, 코어가 유니온을 넓혔을 때 저장소가 따라오지
 * 않아도 컴파일이 통과한다.
 *
 * 도구 호출-결과 짝 정합성은 **재검증하지 않는다**(§5) — 코어가 모든 종료 경로에서
 * 보장하고, 정합성 검증을 모든 소비자에 복제시키는 대안은 이미 기각됐다.
 */
function readMessages(db: DatabaseSync, sessionId: string): AgentMessage[] {
  const rows = db
    .prepare(
      `SELECT id, seq, body FROM messages
        WHERE session_id = ? AND active = 1
        ORDER BY seq`,
    )
    .all(textParam(sessionId, "messages.session_id"));

  return rows.map((row) => {
    const { id, seq, body } = readRow(row, sessionId);

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch (error) {
      throw corrupt(
        sessionId,
        id,
        seq,
        `body is not valid JSON — ${(error as Error).message}`,
        error,
      );
    }

    const result = agentMessageSchema.safeParse(parsed);
    if (!result.success) {
      throw corrupt(
        sessionId,
        id,
        seq,
        `body is not a valid AgentMessage — ${result.error.message}`,
      );
    }
    return result.data;
  });
}

function readRow(row: unknown, sessionId: string): { id: string; seq: number; body: string } {
  const record = row as { id?: unknown; seq?: unknown; body?: unknown };
  if (
    typeof record.id !== "string" ||
    typeof record.seq !== "number" ||
    typeof record.body !== "string"
  ) {
    throw new Error(`Corrupt message row in session ${sessionId}: unexpected column types.`);
  }
  return { id: record.id, seq: record.seq, body: record.body };
}

/**
 * 실패는 **어느 행인지 말해야 한다**. 진단 불가능한 실패는 침묵 실패와 같은
 * 문제를 남긴다(ARCHITECTURE §2.6) — 사용자가 고칠 수도, 신고할 수도 없다.
 */
function corrupt(
  sessionId: string,
  messageId: string,
  seq: number,
  detail: string,
  cause?: unknown,
): Error {
  return new Error(
    `Corrupt message in session ${sessionId} (message id ${messageId}, seq ${seq}): ${detail}. ` +
      "neo-agent does not skip corrupt rows — a transcript with holes fails on the next API call instead.",
    cause === undefined ? undefined : { cause },
  );
}
