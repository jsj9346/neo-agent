/**
 * 첫 기동의 관문 — `docs/CLI-INTERFACE.md` §2.1 (시작 시퀀스의 `3c`).
 *
 * 첫 기동은 사용자 홈에 상태를 만든다. 그 생성을 묻지 않고 하는 것이
 * `ARCHITECTURE.md` §2.6이 금하는 형태이므로, 홈을 만드는 유일한 단계(4. 저장소
 * 열기) 앞에 관문 하나를 둔다. 세계관 정본은 `LORE.md` §5.4이고 자리와 형태의
 * 정본은 §2.1이다.
 *
 * **이 모듈은 터미널을 직접 참조하지 않는다** — 입출력은 전부 주입받는다(§1).
 * `process.*`를 읽는 곳은 `main.ts` 하나이고, 그래서 QA가 모의 스트림으로 관문을
 * 구동할 수 있다.
 *
 * **TTY를 보지 않는다.** 비-TTY 거부의 자리는 `main.ts`이고 조립은 그 검사를
 * 모른다(§12). 조립이 TTY를 다시 보면 «`startCli`는 비-TTY 스트림으로 끝까지
 * 조립된다»는 기존 단정이 깨지고, 관문을 구동할 수단도 함께 사라진다.
 *
 * **비용 상한은 한 프롬프트·한 분기다**(§2.1). 설정 항목·재표시 명령·우회 플래그·
 * 설치 마법사로 자라면 그것은 표면이 아니라 기능이므로 §2.1 개정이 선행한다.
 */

import { existsSync } from "node:fs";
import { basename, dirname } from "node:path";
import { defaultDatabasePath } from "@neo-agent/store";
import { defaultAllowlistPath } from "./allowlist.ts";
import { defaultConfigPath } from "./config.ts";
import { defaultMemoryDir } from "./memory.ts";
import { describeKey, enterRawMode, type OutputSink, style, type TerminalIo } from "./terminal.ts";

/**
 * 3c의 판정. **동의를 기록하는 새 상태를 만들지 않는다** — 「이 프로세스가 홈에 쓴
 * 적이 있는가」의 답이 이미 디스크에 있다(§2.1).
 */
export type FirstRunVerdict =
  /** `~/.neo-agent/sessions.db`가 없다 — 4가 아직 한 번도 돌지 않았다 */
  | { readonly kind: "first-run" }
  /** 있다 — 이미 지난 적이 있다. 묻지 않는다 */
  | { readonly kind: "returning" };

/** 사용자의 선택. 닫힌 둘 — 기본 선택도 «나중에»도 없다(§2.1) */
export type PillChoice = "red" | "blue";

/**
 * 첫 기동인가 — 판정 재료는 `~/.neo-agent/sessions.db`의 부재 **하나뿐**이다(§2.1).
 *
 * **디렉터리의 존재를 보지 않는다.** 크리덴셜 로더의 실패 안내가 사용자에게
 * `mkdir -p ~/.neo-agent`를 직접 시키므로(§4), 그 안내를 따른 사용자는 디렉터리를
 * 이미 갖고 있다 — 디렉터리로 판정하면 그 사용자는 관문을 영영 못 본다.
 *
 * **경로를 여기서 조립하지 않는다.** 저장소가 여는 파일과 관문이 보는 파일이
 * 갈리면 판정이 조용히 거짓이 되므로, 경로의 정본인 `defaultDatabasePath`를 그대로
 * 쓴다(`SESSION-STORE.md` §6의 그 파일).
 */
export function checkFirstRun(home: string): FirstRunVerdict {
  return existsSync(defaultDatabasePath(home)) ? { kind: "returning" } : { kind: "first-run" };
}

/** 응답 키. **기본 선택(그냥 Enter)은 존재하지 않는다**(§2.1). 키 자체는 §12가 위임한 세부다 */
const KEYS: Readonly<Record<string, PillChoice>> = {
  r: "red",
  b: "blue",
};

/** 중단 입력의 귀결 — Blue Pill과 같다. 새 종료 코드를 만들지 않는다(플랜 D-1 확정) */
const ABORT_CHOICE: PillChoice = "blue";

/** Ctrl+C. raw 모드에서는 SIGINT가 아니라 이 바이트로 온다 */
const CTRL_C = "\x03";
/** Ctrl+D. 살아 있는 TTY에서 사용자가 EOF를 표현하는 유일한 수단이다 — 아래 참조 */
const CTRL_D = "\x04";

const CHOICE_LABEL: Readonly<Record<PillChoice, string>> = {
  red: "Red Pill — 계속한다",
  blue: "Blue Pill — 취소한다",
};

/**
 * 관문 프롬프트. 입력·출력은 주입받는다.
 *
 * **키 판독을 승인 프롬프트와 공유하지 않는다.** 그쪽은 Ctrl+C를 건너뛴다 — 승인
 * 대기의 중단 시그널 소유자가 REPL이기 때문이고(§8·§9), 관문에는 그 소유자가 없다.
 * 물려받으면 Ctrl+C가 관문에 닿을 수단이 아예 없어져 영구 대기가 된다. 공유하는
 * 것은 raw 모드 전환과 무효 키 표기뿐이다.
 *
 * **중단 입력은 Blue Pill과 같은 귀결로 보낸다.** 어느 쪽도 홈에 쓰지 않으므로
 * §2.1이 만든 유일한 새 계약(취소 후 `~/.neo-agent/`가 없다)은 그대로 참이고, 새
 * 종료 코드도 필요 없다. 승인 프롬프트가 EOF에 뜻을 주지 않는 근거는 사용자가 하지
 * 않은 결정을 지어내지 않는다는 것인데(§8), 여기서 지어지는 결정은 **아무것도 하지
 * 않는 것**이라 그 위험이 없다.
 *
 * [미규정] Ctrl+D(`\x04`)를 중단으로 볼 것인가 — 정할 곳은 `CLI-INTERFACE.md` §2.1이다.
 * 그 절도 §8의 Ctrl+D 표도 이 상태를 다루지 않는다(그 표의 모집단은 REPL의 닫힌 상태
 * 넷이고 관문은 그중 어느 것도 아니다). 중단으로 본 근거는 **raw 모드에서 스트림 끝은
 * 실제 터미널에 오지 않는다**는 것이다 — 살아 있는 TTY의 스트림은 끝나지 않으므로, 이
 * 바이트를 무효 키로 두면 「EOF는 취소로 본다」는 판정이 파이프·모의 스트림에만 적용되고
 * 실제 사용자에게는 가리키는 대상이 없어진다.
 */
export function askPillChoice(options: {
  io: TerminalIo;
  out: OutputSink;
  home: string;
}): Promise<PillChoice> {
  const { io, out, home } = options;
  const { input } = io;

  out.write(renderGate(home));

  return new Promise<PillChoice>((resolve) => {
    const rawMode = enterRawMode(input);
    let settled = false;

    function finishWith(choice: PillChoice): void {
      if (settled) return;
      settled = true;
      input.off("data", onData);
      input.off("end", onEnd);
      input.off("close", onEnd);
      rawMode?.();
      out.write(`${style.dim(`  → ${CHOICE_LABEL[choice]}`)}\n`);
      resolve(choice);
    }

    function onEnd(): void {
      finishWith(ABORT_CHOICE);
    }

    function onData(chunk: Buffer | string): void {
      for (const key of chunk.toString()) {
        if (key === CTRL_C || key === CTRL_D) {
          finishWith(ABORT_CHOICE);
          return;
        }
        const choice = KEYS[key.toLowerCase()];
        if (choice === undefined) {
          // 유효 키 둘 외에는 전부 재프롬프트다 — Enter도 여기로 온다. 무엇이
          // 무효였는지를 함께 보인다(§9와 같은 규율): 원시 이스케이프를 그대로
          // 흘리면 사용자는 자기가 누른 키를 알아보지 못한다.
          out.write(`${style.dim(`  ${describeKey(key)}는 유효한 응답이 아니다.`)} ${CHOICES}`);
          // **청크의 나머지를 버리지 않는다.** 실제 터미널은 키마다 청크가 오지만
          // 파이프·모의 스트림은 여러 키를 한 청크로 준다 — 무효 키 하나에서
          // 빠져나오면 뒤따라온 유효 키가 조용히 사라지고 관문이 영영 답을 못 받는다
          // (실측으로 걸렸다).
          continue;
        }
        finishWith(choice);
        return;
      }
    }

    // 이미 끝난 스트림에는 'end'가 다시 오지 않는다. 여기서 걸러내지 않으면
    // 영원히 resolve되지 않는 경로가 생긴다 — 답이 없는 채로 조용히 멈추는 것은
    // §2.6이 금한 형태이고, 중단 입력의 귀결이 이미 정해져 있으므로 그대로 쓴다.
    if (input.readable === false) {
      finishWith(ABORT_CHOICE);
      return;
    }

    input.on("data", onData);
    input.on("end", onEnd);
    input.on("close", onEnd);
    // 앞 단계가 스트림을 멈춰 놓았을 수 있다(승인 프롬프트의 실측과 같은 이유).
    input.resume();
  });
}

const CHOICES = `${style.bold(`[r] ${CHOICE_LABEL.red}  [b] ${CHOICE_LABEL.blue}`)}\n`;

/** 홈 아래 무엇이 생기는가 — 이름의 정본은 각 경로 함수다. 여기서 짓지 않는다 */
function createdEntries(home: string): readonly (readonly [string, string])[] {
  return [
    [basename(defaultDatabasePath(home)), "세션 기록"],
    [basename(defaultConfigPath(home)), "설정"],
    [basename(defaultAllowlistPath(home)), "승인 allowlist"],
    [`${basename(defaultMemoryDir(home))}/`, "메모리"],
  ];
}

/**
 * 관문의 문면 — 은유가 실제 사실을 흐리지 않는다(`LORE.md` §5.3).
 *
 * 알약 어휘는 껍질이고, §2.1이 반드시 있어야 한다고 든 사실 셋이 아래를 이룬다:
 * ① 경로 ② 무엇이 생기는가 ③ 취소하면 아무것도 생기지 않는다.
 *
 * **경로는 주입된 홈으로 해석한 실제 절대 경로다.** 홈이 `$HOME`과 다른 환경에서
 * `~`는 무엇이 어디에 생기는지 알려주지 못하고, 그것은 §2.6이 금한 형태다. 이
 * 선택은 §2.1의 문면 요구가 리터럴 `~/.neo-agent/`를 드는 것과 갈리며, 근거는
 * 2026-08-21 유저 확정(플랜 D-2)이다.
 *
 * ②의 넷을 낱말이 아니라 **파일·디렉터리 이름과 함께** 드는 것도 같은 방향이다 —
 * 사용자가 실제로 볼 이름을 보이면서 동시에 검증 가능해진다.
 *
 * 색·배치·정확한 문구는 §12가 위임한 표시 세부다. 이 함수가 지키는 것은 위 셋이
 * 빠지지 않는다는 것뿐이다.
 */
function renderGate(home: string): string {
  const directory = dirname(defaultDatabasePath(home));
  const entries = createdEntries(home);
  const width = Math.max(...entries.map(([name]) => name.length));

  const lines = [
    "",
    `${style.cyan("● 첫 기동")} ${style.dim("— 계속하려면 선택이 필요하다")}`,
    "",
    "  계속하면 이 경로에 상태가 생긴다:",
    `    ${style.bold(directory)}`,
    "",
    ...entries.map(([name, label]) => `      ${name.padEnd(width)}  ${style.dim(label)}`),
    "",
    "  취소하면 아무것도 생기지 않는다.",
    "",
    "",
  ];
  return `${lines.join("\n")}${CHOICES}`;
}
