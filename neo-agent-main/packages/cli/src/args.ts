/**
 * argv 파싱 — `docs/CLI-INTERFACE.md` §5.
 *
 * **argv는 최소로 닫는다**: `neo-agent` · `neo-agent --resume <접두>` · `--help` ·
 * `--version`. 그 외 조작은 전부 REPL 슬래시 명령이다.
 *
 * Commander류 프레임워크·지연 커맨드 등록은 쓰지 않는다(REUSE-MAP §2.6 기각 —
 * argv 4개에 프레임워크는 과설계). 여기가 직접 파싱하는 30줄이 그 판정의 실체다.
 */

export type CliArgs =
  | { kind: "run" }
  | { kind: "resume"; prefix: string }
  | { kind: "help" }
  | { kind: "version" };

/** `--help`와 파싱 실패가 함께 쓰는 사용법 문구 */
export const USAGE = [
  "사용법:",
  "  neo-agent                    새 세션을 시작한다",
  "  neo-agent --resume <접두>    세션 id 접두로 이전 대화를 이어간다",
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
 * [미규정] 짧은 플래그(`-h`·`-v`)는 넣지 않았다. 계약이 4종을 닫힌 목록으로 열거하고,
 * 별칭은 그 목록을 넓히는 표면이다.
 */
export function parseArgs(argv: readonly string[]): CliArgs {
  if (argv.length === 0) return { kind: "run" };

  const [first, ...rest] = argv;

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
