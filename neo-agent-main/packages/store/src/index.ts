/**
 * `@neo-agent/store` 공개 배럴.
 *
 * 세션 저장소 — 코어 이벤트 스트림의 구독자이며 CLI 렌더러와 같은 자리에 앉는다.
 * 코어는 저장소를 모른다. 계약 정본은 `docs/SESSION-STORE.md`.
 *
 * 의존성 예산: `@neo-agent/core` + `zod`. 본업상 `node:fs`·`node:sqlite`는 허용하되
 * 네트워크·프로세스 스폰은 예산 게이트가 기계적으로 차단한다 — 대화 전문을 보관하는
 * 패키지가 바깥으로 나가는 경로를 만들지 않는다(SESSION-STORE §1).
 */

// §4 구독 배선
export { attachSessionStore } from "./attach.ts";

// §5 압축 분기 — 한 트랜잭션 (COMPACTION §6)
export { branchSession, type SessionBranch } from "./branch.ts";
// SEARCH §3 색인 텍스트 추출 — 백필과 저장 시점 색인이 공유하는 유일한 구현
export { extractSearchText } from "./extract.ts";
// §5 재개
export { type LoadedSession, loadSession, type ResumeContext } from "./load.ts";
// §4 메시지 쓰기 — body·role·timestamp 파생의 유일한 지점
export { appendMessage } from "./messages.ts";

// §2 마이그레이션
export {
  LATEST_SCHEMA_VERSION,
  type MigrationHooks,
  migrate,
  readSchemaVersion,
} from "./migrate.ts";
// §6 열기 — 경로·권한·PRAGMA (스키마 제약을 API 우회로 검증할 때 쓰는 하위 층)
export {
  type CorruptMessageSkippedWarning,
  defaultDatabasePath,
  type LoosePermissionsWarning,
  type OpenDatabaseOptions,
  openDatabase,
  type ResumeMismatchWarning,
  type StoreWarning,
  type StoreWarningHandler,
} from "./open.ts";
// SEARCH §4 검색 — 표시 전용. 스니펫 마커 상수는 CLI 렌더러와 QA가 참조한다
export {
  type SearchHit,
  type SearchOptions,
  SNIPPET_MARK_END,
  SNIPPET_MARK_START,
  searchMessages,
} from "./search.ts";
// §5 세션 행
export {
  createSession,
  deleteSession,
  getSession,
  listSessions,
  resolveSessionId,
  type SessionInit,
  type StoredSession,
} from "./sessions.ts";
// §5 저장소 핸들 — 열기와 세션 연산을 묶은 공개 진입점
export {
  type OpenSessionStoreOptions,
  openSessionStore,
  type SessionStore,
} from "./store.ts";
