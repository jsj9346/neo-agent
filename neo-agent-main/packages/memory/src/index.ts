/**
 * `@neo-agent/memory` 공개 배럴.
 *
 * 메모리 쓰기의 문 하나다 — 로드(`loadMemory`), 프롬프트 블록(`renderMemoryBlock`),
 * 큐레이션이 쓰는 저장·삭제(`appendMemoryEntry`·`removeMemoryEntry`), 그리고 모델이
 * 쓰는 유일한 도구(`createRememberTool`). 계약 정본은 `docs/MEMORY.md`이며, 이
 * 패키지는 `packages/gate`·`packages/tools`와 무의존이다.
 *
 * 이 패키지가 따로 있는 이유: `packages/tools`의 불변식은 *"워크스페이스 경계를
 * 강제하고 `~/.neo-agent/`를 거부한다"*인데, 메모리 도구는 **정확히 그 거부된
 * 디렉터리 안에 쓰는 유일한 도구**다. 같은 패키지에 두면 그 불변식이 거짓이 되어
 * 예산 게이트로 표현할 수 없다.
 */

// §7.3 항목 경계 · §3.2 프롬프트 블록 — 파일을 만지지 않는 순수 함수
export {
  countChars,
  type MemoryEntry,
  type MemorySnapshot,
  normalizeEntry,
  parseEntries,
  renderMemoryBlock,
} from "./format.ts";

// §5 게이트 접점
export { MEMORY_TOOL_GATE_PROFILES, type MemoryToolGateProfile } from "./gate-profiles.ts";

// §4 도구
export { createRememberTool, type MemoryToolDeps, type RememberDetails } from "./remember.ts";

// §2.2 로드 · §4.3 원자적 append · §7.2 삭제 · §6 예산
export {
  type AppendResult,
  appendMemoryEntry,
  type LoadMemoryOptions,
  loadMemory,
  MEMORY_ENTRY_MAX_CHARS,
  MEMORY_FILE_MAX_CHARS,
  MEMORY_FILE_NAME,
  MemoryBudgetError,
  removeMemoryEntry,
} from "./store.ts";
