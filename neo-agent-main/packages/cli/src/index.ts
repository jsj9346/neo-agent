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
// §3 설정 — 파일의 계약(키·기본값·동결)
// (biome가 같은 소스의 export 문을 병합하므로 블록은 하나다. 그 안에서 좌표가 갈리는
//  둘은 `readConfigRecord`·`validateConfigRecord`이고, 로더를 「읽기」와 「레코드 검증」
//  으로 갈라 `/config set`이 같은 검증기를 다시 쓰게 하는 것이 §3.2 계약 4다)
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
  readConfigRecord,
  type SandboxMode,
  validateConfigRecord,
} from "./config.ts";
// §3.2 설정 쓰기 표면 — 키 메타데이터(계약 8)·토큰 파서(계약 5)·원자적 쓰기(계약 1·2·4)
export {
  CONFIG_KEY_META,
  CONFIG_KEYS,
  type ConfigKeyLookup,
  type ConfigKeyMeta,
  type ConfigScalar,
  type ConfigTokenResult,
  type ConfigWriteApplied,
  type ConfigWriteRefusalReason,
  type ConfigWriteRefused,
  type ConfigWriteResult,
  lookupConfigKey,
  type ReadOnlyConfigKeyMeta,
  WRITABLE_CONFIG_KEYS,
  type WritableConfigKey,
  type WritableConfigKeyMeta,
  writeConfigValue,
} from "./config-surface.ts";
// §4 크리덴셜
export {
  API_KEY_ENV,
  defaultCredentialsPath,
  type LoadedCredentials,
  loadCredentials,
  SEARCH_API_KEY_ENV,
} from "./credentials.ts";
// §5.1 진단 명령 `neo-agent doctor` — 축 정의·전량 판정·보고서 렌더링
// (렌더러의 이름과 시그니처는 그 절이 정하지 않은 세부다 — 계약이 지는 것은 축마다
//  판정이 화면에 보인다는 것과 `skipped`가 이유를 함께 낸다는 것 둘뿐이다. §5.1 계약 3)
export {
  DOCTOR_AXES,
  type DoctorAxis,
  type DoctorAxisMeta,
  type DoctorContext,
  type DoctorFinding,
  type DoctorReport,
  type DoctorVerdict,
  renderDoctorReport,
  runDoctor,
} from "./doctor.ts";
// §2.1 첫 기동의 관문 — 3c의 판정과 알약 선택 프롬프트 (LORE §5.4의 실물)
export {
  askFirstRunChoice,
  checkFirstRun,
  type FirstRunChoice,
  type FirstRunVerdict,
} from "./first-run.ts";
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
// §5 `serve` 갈래의 배선 — 두 번째 호스트 (WEB-UI §3·§3.1·§3.2)
export { runServe, type ServeOptions } from "./serve.ts";
// §7.1 상태줄 조립·절단 — 하단 고정 영역의 그 한 행. 그리고 걷는 것은 §8의 REPL이 한다
export { formatStatus, type StatusFields } from "./status.ts";
// §3 시스템 프롬프트 — CLI 내장 상수. 내용 계약은 §3.1
export { buildSystemPrompt } from "./system-prompt.ts";
// §1 터미널 제어 — 주입 가능한 입출력 타입, ANSI 원시 요소(TUI 라이브러리 0의 실체), raw 모드 전환
export {
  advanceColumn,
  CLEAR_TO_END,
  cursorToColumn,
  cursorUp,
  describeKey,
  displayWidth,
  enterRawMode,
  type OutputSink,
  style,
  type TerminalIo,
  wrappedColumn,
  wrappedRows,
} from "./terminal.ts";
// §2 조립 — 시작·종료 시퀀스와 그 주입 표면
// (`resolveInstallRoot`만 `DISTRIBUTION.md` §6 — 읽는 것은 `main.ts`가, 세는 것은 여기가)
// (`describeShellRecoveryChoices`는 시작 시퀀스 5b와 `doctor`의 `docker` 축이 같은 두
//  갈래 안내를 나눠 갖는 자리다 — 문면의 정본은 이 모듈이고 복사본을 두면 같은 상황의
//  안내가 두 문면이 된다. 그 공유를 요구하는 것은 `CLI-INTERFACE.md` §5.1 계약 6이다)
export {
  CLI_VERSION,
  type CliApp,
  type CliDeps,
  type CliParts,
  describeShellRecoveryChoices,
  EXIT_OK,
  EXIT_STARTUP_FAILED,
  EXIT_USAGE,
  FirstRunDeclined,
  resolveFactories,
  resolveInstallRoot,
  runCli,
  type ShellWiring,
  startCli,
  type WiringFactories,
} from "./wiring.ts";
