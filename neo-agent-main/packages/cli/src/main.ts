/**
 * `neo-agent`의 조립 진입점 — `docs/CLI-INTERFACE.md` §2.
 *
 * **bin은 이 파일이 아니다.** `bin/neo-agent.mjs`(Node 버전 게이트 shim)가 bin이고
 * 이 파일은 그것이 동적 import하는 대상이다(`DISTRIBUTION.md` §3.2). 그래서 여기에
 * shebang이 없다 — 있으면 이 파일도 직접 실행되는 진입점처럼 읽힌다.
 *
 * **`process.*`를 만지는 유일한 곳이다.** argv·env·cwd·home·표준 스트림을 여기서
 * 읽어 조립(`wiring.ts`)에 넘긴다. **자기 위치(`import.meta`)를 읽는 것도 여기뿐**이다
 * (`DISTRIBUTION.md` §6의 설치 루트). 조립부터 아래로는 전부 주입된 값만 쓰므로
 * 모의 스트림과 임시 디렉터리로 검증할 수 있다.
 *
 * **`node:sqlite`를 끌어올 수 있는 것은 정적으로 임포트하지 않는다.** 아래 경고
 * 필터가 `node:sqlite`가 로드되기 전에 설치돼야 하는데, 정적 임포트는 모듈 본문보다
 * 먼저 평가되기 때문이다 — `@neo-agent/store`(또는 그것을 끌어오는 `./wiring.ts`)를
 * 정적으로 임포트하는 순간 필터는 항상 한 발 늦는다(실측: ExperimentalWarning은
 * `node:sqlite` 임포트 시점에 방출된다). 규율의 대상은 **무엇을** 임포트하는가이지
 * 정적 임포트의 존재 자체가 아니다 — `node:os`·`node:fs`는 그 경로에 없어서 위에
 * 있어도 된다. **`./args.ts`도 같은 근거로 위에 있어도 된다**: 그 모듈에는 임포트가
 * 하나도 없어 무엇도 끌어오지 않는다(`CLI-INTERFACE.md` §2.2 계약 2가 이 사실을
 * 여는 비용으로 든다). 배럴(`./index.ts`)을 지나면 그 사실이 깨지므로 파서를
 * **파일로 직접** 집는다.
 */

import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { type CliArgs, parseArgs } from "./args.ts";

installSqliteWarningFilter();

const { runCli, CLI_VERSION, EXIT_STARTUP_FAILED, resolveInstallRoot } = await import(
  "./wiring.ts"
);

/**
 * TTY 없는 기동 거부 — `DISTRIBUTION.md` §7. `CLI-INTERFACE.md` §12의 R-3 항목이
 * 여기서 닫힌다(그 자리에 있던 미규정 주석이 이 블록으로 대체됐다).
 *
 * **argv를 해석하지 않는다 — 아래 예외 하나를 빼고**(`CLI-INTERFACE.md` §2.2 계약 2).
 * 그래서 `--version`·`--help`도 함께 거부된다 — 순서를 지키려 애쓴 결과가 아니라
 * 해석이 조립의 일이라는 그 계약의 자연스러운 귀결이고, 플랜 §9 D-1이 그것을 수용된
 * 귀결로 확정했다. **이 파일이 argv에서 직접 읽어 내는 값은 여전히 0개다** — 예외도
 * argv를 조립의 파서에 통째로 넘겨 갈래 하나를 돌려받을 뿐이다.
 *
 * **이 검사가 argv에 대해 갖는 예외는 하나다** (2026-08-24 — `CLI-INTERFACE.md` §2.2).
 * 그 절이 `serve` 갈래를 이 거부에서 면제했고, 면제 판정은 **조립이 소유한 파서에
 * 갈래를 물어** 얻는다 — 여기서 argv를 손으로 비교하는 것은 그 절이 이름으로
 * 금지했다(argv를 읽는 것이 둘이 되면 갈리는 방향 하나가 침묵 실패다). 파싱이
 * 던지거나 다른 갈래로 답하면 검사를 건다.
 *
 * **면제의 근거는 승인자의 이전이지 편의가 아니다** (`WEB-UI.md` §3 · §2.2 계약 5).
 * 이 거부가 막는 것은 «승인 게이트가 물어볼 사람이 없는데 묻는» 상태인데, `serve`에서
 * 묻는 상대는 터미널이 아니라 브라우저다. 근거가 그 명령에서 죽으므로 결론도 함께
 * 죽는다 — **거부를 없앤 것이 아니다.** 반대로도 선다: `serve`에서 승인자가 브라우저가
 * 아니게 되면(`WEB-UI.md` §7의 귀속이 바뀌면) 이 면제는 그 순간 근거를 잃는다.
 *
 * **stderr로 쓴다.** 거부하는 이유 자체가 "표준 입출력이 사람에게 닿지 않는 모양"이라,
 * stdout이 파이프로 물려 있을 가능성이 높다. shim의 버전 게이트와 같은 경로다(§3.2).
 *
 * **`process.exit`가 아니라 `exitCode`다.** 파이프로 향한 `process.stderr.write`는
 * 비동기라 즉시 종료하면 메시지가 잘릴 수 있다 — 지금 하려는 일이 정확히 "메시지를
 * 보이게 하는 것"이므로 그 위험을 지지 않는다. 이 뒤로 실행되는 것이 없어 프로세스는
 * 자연히 끝난다.
 *
 * **동적 import 뒤인 이유**는 종료 코드의 정본이 `wiring.ts`이기 때문이다. shim은
 * `.ts`를 로드하기 **전에** 판정해야 해서 같은 값을 리터럴로 복제했고 그 주석이 스스로
 * "중복이다"라고 밝힌다 — 여기는 복제할 이유가 없다. import가 무거운 것은 사실이나
 * 거부 경로의 비용이지 정상 경로의 비용이 아니다.
 *
 * 검사가 조립보다 앞이므로 조립(`runCli`)은 이 사실을 알 필요가 없다. 테스트·QA가
 * `runCli`를 모의 스트림으로 직접 부르는 경로는 이 검사를 지나지 않으며, 그것이
 * `DISTRIBUTION.md` §7.1이 이 거부를 닫으면서도 검증 경로가 막히지 않는다고 판정한
 * 근거다. **이 줄의 지목을 2026-08-24에 고쳤다** — 그 전까지 여기는 문서 이름 없는
 * `§7.1`에 인용부호 친 문면을 귀속시켰는데 그 문면은 §7.1에 문자 그대로 없다
 * (`81d12e3`에서 확인). 인용부호를 벗기고 서술로 쓴다(`DOC-CITATION.md` §3.4 U-1의
 * 처방). **그 절의 이 근거가 `CLI-INTERFACE.md` §2.2에서 갈래 하나를 기각시켰다.**
 */
if (process.stdin.isTTY !== true && !isExemptFromTtyRequirement(process.argv.slice(2))) {
  process.stderr.write(
    [
      "neo-agent: 대화형 터미널이 아니면 실행할 수 없습니다.",
      "",
      "  원인       표준 입력이 터미널(TTY)이 아닙니다 — 파이프·리다이렉션·cron·스크립트에서 실행된 것으로 보입니다.",
      "  왜 막는가  승인 게이트는 도구를 실행하기 전에 사람에게 묻습니다. 물어볼 사람이 없으면 대답을 기다리며 조용히 멈춥니다(hang). 그 결말은 실패보다 나쁩니다 — 무엇을 기다리는지 아무도 알 수 없습니다.",
      "  다음 행동  터미널에서 직접 실행하세요: neo-agent",
      "  참고       무인 실행(cron·스크립트·파이프)은 아직 지원하지 않습니다. --version·--help도 같은 이유로 거부됩니다. 예외는 웹 UI 서버(neo-agent serve) 하나입니다 — 그 명령은 승인을 브라우저에 묻습니다.",
      "",
    ].join("\n"),
  );
  process.exitCode = EXIT_STARTUP_FAILED;
} else {
  process.exitCode = await runCli({
    argv: process.argv.slice(2),
    env: process.env,
    cwd: process.cwd(),
    home: homedir(),
    io: { input: process.stdin, output: process.stdout },
    version: CLI_VERSION,
    // 설치 루트 — `DISTRIBUTION.md` §6. **자기 위치를 읽는 것은 여기까지**이고,
    // 상위 3단계를 세는 산술과 워크스페이스와의 비교는 조립이 한다. realpath를
    // 명시적으로 거는 이유는 비교 상대(`WorkspaceBoundary.root`)가 이미 realpath로
    // 동결돼 있기 때문이다 — 한쪽만 심링크 경로면 같은 트리가 다른 트리로 보인다.
    // (링크 설치가 배포 형태이므로 이 경로에 심링크가 섞이는 것이 기본값이다: §2.1.)
    installRoot: resolveInstallRoot(realpathSync(import.meta.dirname)),
  });
}

/**
 * 위 TTY 부재 거부의 면제 판정 — `CLI-INTERFACE.md` §2.2 계약 2·3·4.
 *
 * **자기 파서를 만들지 않는다**(계약 3). argv를 손으로 비교해 `serve`를 알아내면
 * argv를 읽는 것이 둘이 되고, 손으로 짠 쪽이 파서보다 넓어지는 방향이 침묵 실패다 —
 * 파서가 REPL로 보내는 기동이 면제를 받아 조용한 행(hang)으로 끝난다. 파서가 순수
 * 함수(부작용 없음·같은 입력에 같은 값)라 아래 `runCli`의 호출과 두 번 불려도 무해한
 * 것이 이 금지의 비용을 0으로 만든다.
 *
 * **던지면 `false`다**(계약 4 — fail-closed). 알 수 없는 인자로 비-TTY 기동하면
 * 사용법 에러가 아니라 TTY 거부가 나가고, 그것이 계약으로 유지되는 오늘의 동작이다.
 * 면제가 파싱 실패까지 넓어지면 `ARCHITECTURE.md` §2.6이 이름 붙인 침묵 실패 방향이다.
 *
 * **여기서 문면을 내지 않는다.** 파싱이 던진 사실은 조립(`runCli`)이 다시 파싱하며
 * 사용법 에러로 보고하고, 이 경로에서 실제로 나가는 것은 위 블록의 TTY 거부다.
 */
function isExemptFromTtyRequirement(argv: readonly string[]): boolean {
  let parsed: CliArgs;
  try {
    parsed = parseArgs(argv);
  } catch {
    return false;
  }
  return parsed.kind === "serve";
}

/**
 * `node:sqlite`의 ExperimentalWarning만 걸러낸다 (§12 미결의 해소).
 *
 * 계약은 **"정상 기동 시 stderr에 sqlite 경고가 없다"**이지 경고 전역 억제가 아니다.
 * `--no-warnings`류는 다른 경고(폐기 예정 API, 미처리 rejection 등)까지 함께 삼켜서
 * 침묵 실패를 만든다 — 지금 안 보이게 하려는 것 하나만 걸러야 한다.
 *
 * Node의 기본 경고 출력은 `process.on("warning")` 리스너 하나다. 그것을 떼어 보관한
 * 뒤 우리 필터를 끼우고, 통과한 경고는 **보관한 기본 리스너에게 그대로 넘긴다** —
 * 우리가 다시 찍으면 스택 트레이스 형식이 달라진다.
 */
function installSqliteWarningFilter(): void {
  const defaults = process.listeners("warning");
  process.removeAllListeners("warning");

  process.on("warning", (warning: Error) => {
    if (warning.name === "ExperimentalWarning" && warning.message.includes("SQLite")) return;
    for (const listener of defaults) listener(warning);
  });
}
