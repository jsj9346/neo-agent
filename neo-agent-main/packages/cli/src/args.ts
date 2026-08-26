/**
 * argv 파싱 — `docs/CLI-INTERFACE.md` §5.
 *
 * **argv는 최소로 닫는다**: `neo-agent` · `neo-agent --resume <접두>` ·
 * `neo-agent serve` · `--help` · `--version`. 그 외 조작은 전부 REPL 슬래시 명령이다.
 *
 * Commander류 프레임워크·지연 커맨드 등록은 쓰지 않는다(REUSE-MAP §2.6 기각 —
 * argv 5개에 프레임워크는 과설계). 여기가 직접 파싱하는 30줄이 그 판정의 실체다.
 *
 * **`serve`는 이 목록에서 유일한 위치 인자이고, 유일하게 REPL에 들어가지 않는다**(§5).
 * 나머지 넷은 갈래가 둘뿐이다 — `neo-agent`·`--resume`은 REPL을 열고, `--help`·
 * `--version`은 출력 후 즉시 끝난다.
 *
 * **이 파서에는 임포트가 하나도 없고, 그것이 계약이다**(§2.2 계약 2). `main.ts`가
 * TTY 부재 거부의 면제를 판정하려고 이 모듈을 **정적으로** 임포트하는데, 그 파일의
 * `node:sqlite` 규율(경고 필터가 store 로드보다 먼저 서야 한다)이 여기에 걸리지 않는
 * 근거가 바로 «무엇도 끌어오지 않는다»이다. 임포트가 하나라도 생기면 그 근거가 죽는다.
 */

export type CliArgs =
  | { kind: "run" }
  | { kind: "resume"; prefix: string }
  /**
   * 웹 UI 서버 — `WEB-UI.md` §3. 상주하되 REPL을 열지 않는 유일한 갈래다.
   *
   * **`main.ts`가 이 갈래를 이름으로 본다**(`CLI-INTERFACE.md` §2.2 계약 2·4).
   * 그 파일은 argv를 손으로 비교하지 않고 이 파서에 물어 답 하나를 받으며,
   * 파싱이 던지거나 다른 갈래로 답하면 TTY 부재 거부를 건다.
   */
  | { kind: "serve" }
  | { kind: "help" }
  | { kind: "version" };

/** `--help`와 파싱 실패가 함께 쓰는 사용법 문구 */
export const USAGE = [
  "사용법:",
  "  neo-agent                    새 세션을 시작한다",
  "  neo-agent --resume <접두>    세션 id 접두로 이전 대화를 이어간다",
  "  neo-agent serve              웹 UI 서버를 띄운다 (브라우저에서 조작)",
  "  neo-agent --help             이 도움말",
  "  neo-agent --version          버전",
  "",
  "그 밖의 조작은 대화 중 슬래시 명령으로 한다 (/help).",
].join("\n");

/**
 * `process.argv.slice(2)`를 받는다 — 실행 파일·스크립트 경로는 조립 지점이 뗀다.
 *
 * 인식하지 못한 형태는 **던진다**. 시작 단계의 실패는 원인과 다음 행동을 담은
 * 에러로 종료하는 것이 계약이고(§2), 모르는 플래그를 무시하면 `--resmue abc`가
 * 조용히 새 세션으로 뜬다(§2.6 침묵 실패).
 *
 * [미규정] 짧은 플래그(`-h`·`-v`)는 넣지 않았다. 계약이 5종을 닫힌 목록으로 열거하고,
 * 별칭은 그 목록을 넓히는 표면이다.
 */
export function parseArgs(argv: readonly string[]): CliArgs {
  if (argv.length === 0) return { kind: "run" };

  const [first, ...rest] = argv;

  // 위치 인자는 이 하나뿐이다(§5). **`assertNoExtra`를 쓰지 않는다** — 서브명령의
  // 잔여 인자를 어떻게 다룰지는 플래그의 잔여 인자와 다른 판정이고, 그 판정은 아직
  // 서지 않았다. 대신 잔여가 있으면 아래 닫힌 목록 밖 경로(사용법 에러)로 그대로
  // 떨어뜨린다 — fail-closed이므로 §2.6의 침묵 무시가 열리지 않는다.
  //
  // [미규정] `neo-agent serve <남는 인자>`의 문면. 오늘은 "알 수 없는 인자다"로 나가
  // 무엇이 잘못됐는지가 `serve`를 지목하지 않는다. 서브명령 전용 문면을 줄지는
  // `CLI-INTERFACE.md` §5가 정하지 않았다.
  if (first === "serve" && rest.length === 0) return { kind: "serve" };

  if (first === "--help") {
    assertNoExtra(rest, "--help");
    return { kind: "help" };
  }

  if (first === "--version") {
    assertNoExtra(rest, "--version");
    return { kind: "version" };
  }

  if (first === "--resume") {
    const prefix = rest[0];
    if (prefix === undefined || prefix.trim() === "") {
      throw new Error(`--resume에는 세션 id 접두가 필요하다.\n\n${USAGE}`);
    }
    assertNoExtra(rest.slice(1), "--resume");
    return { kind: "resume", prefix };
  }

  throw new Error(
    `알 수 없는 인자다: ${argv.map((value) => JSON.stringify(value)).join(" ")}\n\n${USAGE}`,
  );
}

function assertNoExtra(rest: readonly string[], flag: string): void {
  if (rest.length > 0) {
    throw new Error(
      `${flag} 뒤에 남는 인자가 있다: ${rest.map((value) => JSON.stringify(value)).join(" ")}\n\n${USAGE}`,
    );
  }
}
