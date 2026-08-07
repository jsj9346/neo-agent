/**
 * `@neo-agent/cli` 공개 배럴.
 *
 * CLI는 유일한 조립 지점(composition root)이다 — 코어·도구·게이트·저장소는 서로를
 * 모르고, 결합은 여기의 배선 한 곳에서 일어난다. 계약 정본은 `docs/CLI-INTERFACE.md`.
 *
 * 이 배럴이 내보내는 것은 전부 **주입 가능한 조각**이다. `process.stdin`/`stdout`을
 * 직접 만지는 곳은 bin 엔트리(`main.ts`) 하나뿐이라는 것이 계약이고, 그래서 모든
 * 모듈이 스트림·경로·핸들러를 파라미터로 받는다.
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
  defaultConfigPath,
  loadConfig,
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
// §3 시스템 프롬프트 — CLI 내장 상수
export { buildSystemPrompt } from "./system-prompt.ts";
// §1 터미널 제어 — 주입 가능한 출력 싱크의 타입이 여기 산다
export { type OutputSink, style, type TerminalIo } from "./terminal.ts";
// §2 조립 — 시작·종료 시퀀스와 그 주입 표면
export {
  CLI_VERSION,
  type CliApp,
  type CliDeps,
  type CliParts,
  EXIT_OK,
  EXIT_STARTUP_FAILED,
  EXIT_USAGE,
  resolveFactories,
  runCli,
  startCli,
  type WiringFactories,
} from "./wiring.ts";
