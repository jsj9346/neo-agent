/**
 * `@neo-agent/cli` 공개 배럴.
 *
 * CLI는 유일한 조립 지점(composition root)이다 — 코어·도구·게이트·저장소는 서로를
 * 모르고, 결합은 여기의 배선 한 곳에서 일어난다. 계약 정본은 `docs/CLI-INTERFACE.md`.
 *
 * **이 배럴은 런타임 경로가 아니다** — bin은 여기를 지나지 않는다(`main.ts`가
 * `./wiring.ts`를 직접 동적 import한다. `node:sqlite` 경고 필터가 store 로드보다
 * 먼저 설치돼야 한다는 제약의 귀결이다). 그래서 이 파일이 정하는 것은 *무엇이
 * 실행되는가*가 아니라 **이 패키지가 무엇으로 이루어져 있는가**이고, 각 export 줄의
 * `// §n` 주석이 계약 절과 모듈을 잇는 지도다.
 *
 * **무엇을 여기 올리는지의 기준은 `docs/CLI-INTERFACE.md` §1이 정한다.** 여기서
 * 다시 말하지 않는다 — 두 곳에 적으면 어긋나는 순간 어느 쪽이 정본인지 알 수 없다.
 *
 * 별개의 계약 하나: `process.stdin`/`stdout`을 직접 만지는 곳은 bin 엔트리
 * (`main.ts`) 하나뿐이고, 그래서 모든 모듈이 스트림·경로·핸들러를 파라미터로 받는다.
 */

// §10 allowlist 파일 구현
export {
  type AllowlistStoreOptions,
  type AllowlistWarningHandler,
  createAllowlistStore,
  defaultAllowlistPath,
  defaultAllowlistWarningHandler,
} from "./allowlist.ts";
// §9 승인 프롬프트
export { createApprovalPrompt } from "./approval-ui.ts";
// §5 argv
export { type CliArgs, parseArgs, USAGE } from "./args.ts";
// §6 압축 오케스트레이션 — 판정 시점·Agent 교체·표시 (COMPACTION §3·§6·§7)
export {
  type CompactionController,
  type CompactionDeps,
  type CompactionRuntime,
  type CompactionSettings,
  type CompactTrigger,
  createCompactionController,
  SUMMARY_MAX_TOKENS,
} from "./compact.ts";
// §3 설정
export {
  type CliConfig,
  DEFAULT_APPROVAL_MODE,
  DEFAULT_COMPACTION_AUTO,
  DEFAULT_COMPACTION_KEEP_RECENT_TURNS,
  DEFAULT_COMPACTION_THRESHOLD,
  DEFAULT_MODEL,
  DEFAULT_SANDBOX_IMAGE,
  DEFAULT_SANDBOX_MODE,
  defaultConfigPath,
  loadConfig,
  type SandboxMode,
} from "./config.ts";
// §4 크리덴셜
export {
  API_KEY_ENV,
  defaultCredentialsPath,
  type LoadedCredentials,
  loadCredentials,
} from "./credentials.ts";
// §8 입력 상태 머신 + REPL
export { createRepl, type InputState, PROMPT, type Repl, type ReplHandlers } from "./input.ts";
// 메모리 디렉터리 — 설정 표면이 아니라 고정 경로다 (MEMORY §9 M-2)
export { defaultMemoryDir } from "./memory.ts";
// §5 슬래시 명령 레지스트리
export {
  type CliActions,
  type CliContext,
  completeSlashCommand,
  dispatchSlashCommand,
  findSlashCommand,
  formatSlashHelp,
  isSlashCommand,
  SLASH_COMMANDS,
  type SlashCommand,
} from "./registry.ts";
// §6·§7 이벤트 렌더러 + 재개 시 과거 대화 되그리기
export { createRenderer, renderTranscript } from "./renderer.ts";
// §5 검색 결과 표시 — 표시 전용 (SEARCH §5)
export { renderSearchResults } from "./search.ts";
// §7.1 상태줄 조립·절단 — 하단 고정 영역의 그 한 행. 그리고 걷는 것은 §8의 REPL이 한다
export { formatStatus, type StatusFields } from "./status.ts";
// §3 시스템 프롬프트 — CLI 내장 상수
export { buildSystemPrompt } from "./system-prompt.ts";
// §1 터미널 제어 — 주입 가능한 입출력 타입과 ANSI 원시 요소 (TUI 라이브러리 0의 실체)
export {
  advanceColumn,
  CLEAR_TO_END,
  cursorToColumn,
  cursorUp,
  displayWidth,
  type OutputSink,
  style,
  type TerminalIo,
  wrappedColumn,
  wrappedRows,
} from "./terminal.ts";
// §2 조립 — 시작·종료 시퀀스와 그 주입 표면
// (`resolveInstallRoot`만 `DISTRIBUTION.md` §6 — 읽는 것은 `main.ts`가, 세는 것은 여기가)
export {
  CLI_VERSION,
  type CliApp,
  type CliDeps,
  type CliParts,
  EXIT_OK,
  EXIT_STARTUP_FAILED,
  EXIT_USAGE,
  resolveFactories,
  resolveInstallRoot,
  runCli,
  type ShellWiring,
  startCli,
  type WiringFactories,
} from "./wiring.ts";
