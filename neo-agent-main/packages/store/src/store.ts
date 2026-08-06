/**
 * `SessionStore` 조립 — `docs/SESSION-STORE.md` §5.
 *
 * 열기(`open.ts`)·세션 행(`sessions.ts`)·쓰기(`attach.ts`)·읽기(`load.ts`)를 하나의
 * 핸들로 묶는다. 층을 나눠 둔 이유는 스키마 제약을 **API를 우회해서도** 검증할 수
 * 있어야 하기 때문이다(§2가 STRICT를 채택한 이유가 그것이다).
 */

import type { DatabaseSync } from "node:sqlite";
import type { Agent, Unsubscribe } from "@neo-agent/core";
import { attachSessionStore } from "./attach.ts";
import { type LoadedSession, loadSession, type ResumeContext } from "./load.ts";
import {
  defaultWarningHandler,
  type OpenDatabaseOptions,
  openDatabase,
  type StoreWarningHandler,
} from "./open.ts";
import {
  createSession,
  getSession,
  listSessions,
  resolveSessionId,
  type SessionInit,
  type StoredSession,
} from "./sessions.ts";

export type OpenSessionStoreOptions = OpenDatabaseOptions;

export interface SessionStore {
  createSession(init: SessionInit): StoredSession;
  getSession(id: string): StoredSession | undefined;
  listSessions(limit?: number): StoredSession[];
  /** git 스타일 접두 매칭. 모호하면 throw — 조용히 하나를 고르지 않는다 */
  resolveSessionId(prefix: string): string;
  /**
   * 재개할 트랜스크립트를 읽고 §5의 재개 검증을 수행한다.
   *
   * 워크스페이스 불일치는 throw, 시스템 프롬프트·모델 불일치는 경고 후 진행.
   * `context`를 받는 이유는 `load.ts`의 `ResumeContext` 주석 참조.
   */
  loadSession(id: string, context: ResumeContext): LoadedSession;
  /**
   * `message_end` 구독을 배선하고 해지 함수를 돌려준다.
   *
   * **렌더러보다 먼저 부른다**(§4) — 그래야 "사용자가 화면에서 본 것은 이미
   * 저장된 것"이 성립한다.
   */
  attach(agent: Agent, sessionId: string): Unsubscribe;
  close(): void;
}

export function openSessionStore(options: OpenSessionStoreOptions = {}): SessionStore {
  const db: DatabaseSync = openDatabase(options);
  // 열기 경고와 재개 경고가 같은 수신자로 간다 — 사용자에게는 한 채널이다.
  const warn: StoreWarningHandler = options.onWarning ?? defaultWarningHandler;
  let closed = false;

  return {
    createSession: (init) => createSession(db, init),
    getSession: (id) => getSession(db, id),
    listSessions: (limit) => listSessions(db, limit),
    resolveSessionId: (prefix) => resolveSessionId(db, prefix),
    loadSession: (id, context) => loadSession(db, id, context, warn),
    attach: (agent, sessionId) => attachSessionStore(db, agent, sessionId),

    // 닫힌 저장소를 다시 닫는 것은 정리 코드의 흔한 형태이고 오류가 아니다.
    // `DatabaseSync.close()`는 두 번째 호출에서 던진다 — 그 예외가 `finally`에서
    // 원래 실패를 덮어쓰지 않게 여기서 흡수한다.
    close: () => {
      if (closed) return;
      closed = true;
      db.close();
    },
  };
}
