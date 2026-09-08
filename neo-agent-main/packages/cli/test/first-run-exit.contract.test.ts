/**
 * 첫 기동 관문의 **실 pty 종료 축** — `docs/CLI-INTERFACE.md` §2.1.
 *
 * 기대값은 §2.1(선택의 귀결 표 · 검사 가능한 주장 · 중단 입력과 응답 키 · 선택 뒤의
 * 확인)과 §2(시작 시퀀스 `0b`)에서만 뽑았다. `src/first-run.ts`·`src/wiring.ts`는 이 파일을
 * 쓰는 동안 열지 않았고, 이 파일은 `src/`에서 아무것도 임포트하지 않는다 — 여는 문(門)은
 * 설치 형태 그대로의 bin 하나이고 나머지는 전부 **프로세스 종료·파일 시스템·화면**이라는
 * 관측 가능한 결과다.
 *
 * ── 셋을 선언한다 ─────────────────────────────────────────────────────────
 *
 * **1. 왜 별도 층인가.** 기존 관문 테스트 셋(`first-run.test.ts`·`first-run.qa.test.ts`·
 *    `first-run-rename.qa.test.ts`)은 전부 `PassThrough` 대역 스트림으로 `runCli`를 직접
 *    부른다. 대역 스트림은 실제 TTY fd처럼 이벤트 루프를 붙잡지 않으므로 **이 축이 그
 *    층에서는 원리적으로 안 잡힌다** — 그 층에서 「끝났다」는 프라미스가 풀렸다는 뜻이지
 *    프로세스가 죽었다는 뜻이 아니다. 그래서 유사 터미널을 붙여 실 bin을 스폰한다.
 *
 * **2. 무엇이 이 층의 것이고 무엇이 아닌가.** 모의 층은 `runCli`의 **반환값**이 취소
 *    갈래에서 0인 것을 이미 잰다. **이 층이 더하는 것은 「그 반환이 프로세스 종료로
 *    이어진다」 하나다.** 관문의 판정·자리·문면 셋·기본 선택 부재·키 부류의 배타성은 이
 *    파일이 재지 않는다 — 그것은 모의 층의 몫이고, 여기서 다시 재면 두 층이 중복된다.
 *    아래 ⓓ·ⓔ는 그 예외처럼 보이나 아니다: 재는 대상이 「같은 시행에서 종료 축과 함께
 *    관측된 홈·확인」이라 종료 축의 red가 의미 축까지 무너뜨렸는지를 가르는 대조군이다.
 *
 * **3. `ARCHITECTURE.md` §2.21 판별.** 이 파일의 명시 상한은 **자리 한정**이고 그 근거는
 *    *"그 작업이 본래 오래 걸린다"*(실 bin 스폰 + 유사 터미널 + 종료 이벤트 대기)이지
 *    **부하가 아니다.** 그래서 그 절이 부하를 근거로 올린 상한에 요구하는 각인 4항
 *    (측정일·측정값·여유 배수·배수의 근거)은 **이 자리에 안 걸린다.** 여유 배수는
 *    그래도 지켜야 하는 판정 단위이므로 측정해 리포트가 든다
 *    (`plans/20260907-firstrun-exit-qa-report.md`).
 *
 * **4. 이 층은 응답 키를 안다 — §2.1이 요구한 선언이다.** 그 절은 응답 키를 §12가 위임한
 *    표시 세부로 두면서, *"단위 층은 키를 안다"*와 그 층이 자기가 세부를 고정한다는 것을
 *    *"파일 머리에 선언한다"*를 함께 요구했다. 이 파일이 그 선언이다. 아래 `CANCEL_KEY`는
 *    **세부이지 계약이 아니다** — 관문의 취소 라벨이 다른 글자로 바뀌면 이 상수를 고치는
 *    것이 옳고, 그 변경은 계약 변경이 아니다. 제어문자 둘(Ctrl+D·Ctrl+C)은 사정이 다르다:
 *    §2.1이 중단 입력 셋을 **이름으로** 들었으므로 그 둘은 세부가 아니라 계약이다.
 *
 * ── 재는 축 ───────────────────────────────────────────────────────────────
 *
 *   ⓐ 취소를 고르면 자체 상한 안에 프로세스가 **종료**하고 코드가 0이다   (§2.1 귀결 표)
 *   ⓑ Ctrl+D가 같은 귀결이다                                        (§2.1 중단 입력 셋)
 *   ⓒ Ctrl+C가 같은 귀결이다                                        (§2.1 중단 입력 셋)
 *   ⓓ 위 각각에서 `<home>/.neo-agent` 디렉터리 자체가 없다        (§2.1 검사 가능한 주장)
 *   ⓔ 위 각각에서 확인이 비어 있지 않고 고르지 않은 쪽 이름을 안 담는다   (§2.1 확인 표시)
 *
 * **중단 입력 셋의 셋째(입력 스트림 종료)는 이 층에서 원리적으로 안 잡힌다** — 그 자리의
 * 근거를 §2.1이 스스로 든다: raw 모드의 살아 있는 TTY에서는 스트림 끝이 오지 않는다. 그
 * 갈래를 재려면 대역 스트림이 필요하고 그것은 모의 층의 몫이다. 커버리지 구멍이 아니라
 * 층의 경계이므로 여기 적어 둔다.
 *
 * **문면을 리터럴로 고정하지 않는다**(§7 말미의 기준 — 재는 것은 *"서로 다른 상태가 서로
 * 다른 출력을 낳는가, 그 출력이 비어 있지 않은가"*). 이 파일의 화면 리터럴은 ⓔ의 이름 둘
 * 뿐이고, 그 둘은 §2.1의 귀결 표가 스스로 화면의 이름과 코드의 값의 대응의 정본이라고
 * 못박은 자리이며, 여기서는 **같은 값의 있음과 없음을 한 문자열에서 재는 대비쌍**으로만
 * 쓰인다. 관문이 떴는지의 판별에도 문면을 쓰지 않는다 — 출력이 나기 시작한 뒤 조용해지는
 * 것으로 잰다.
 *
 * **하네스를 재사용하지 않는다.** `harness.ts`도 `distribution-qa-b.contract.test.ts`의
 * 스폰 헬퍼도 임포트하지 않는다(형태는 참고했다). 독립 검증의 결론이 다른 작성자의 하네스
 * 정확성에 의존하면 둘이 같은 오해를 공유하는 경우를 못 잡는다. 대신 **하네스 자기 검사**를
 * 첫 축으로 둔다 — 이 하네스가 실제 종료를 관측할 수 있음을 같은 코드 경로로 먼저 보인다.
 * 그것이 없으면 아래의 red가 앱의 결함인지 재는 자의 결함인지 갈리지 않는다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

// ───────────────────────────────────────────────────────────────────────────
// 하네스 — 이 파일 전용. 아무 하네스도 임포트하지 않는다
// ───────────────────────────────────────────────────────────────────────────

/**
 * 유사 터미널을 만들 수단. 없으면 이 축을 세울 수 없으므로 **건너뛴다** — 없는 환경에서
 * 붉게 만들지 않는다. `distribution-qa-b.contract.test.ts`가 같은 자리에서 쓰는 가드와
 * 같은 형태이고, 그 파일을 임포트하지 않으므로 여기서 다시 쓴다.
 */
const PTY_TOOL = "/usr/bin/script";
const hasPty = existsSync(PTY_TOOL);

const testDir = dirname(fileURLToPath(import.meta.url));
/** `package.json`의 `bin` 필드가 가리키는 그 파일. 링크 설치가 배포 형태이므로 직접 실행한다 */
const binPath = realpathSync(join(testDir, "..", "bin", "neo-agent.mjs"));

/**
 * `CLI-INTERFACE.md` §4가 정한 이름 둘. 구현 상수를 임포트하지 않고 문서에서 옮겨 적는다.
 *
 * **더미 값을 주는 이유가 2026-09-08에 바뀌었다.** 개정 전 근거는 자리였다 — 크리덴셜
 * 로드가 시작 시퀀스 2이고 관문이 `3c`였으므로 키가 없으면 관문에 닿기 전에 fail-closed로
 * 죽었다. 온보딩이 그 경로를 앞으로 옮기면서(§2 `0`~`0d`) **키의 부재는 이제 실패가 아니라
 * 온보딩의 입력**이고(§2.3 「`0a` 선행 검증」의 마지막 불릿), 이 두 값이 하는 일은
 * §2.3 「이미 있는 값은 묻지 않는다」의 **env 갈래**로 키 두 단계를 건너뛰게 하는 것이다.
 * 남는 질문은 `model` 하나다 — 세 단계가 전부 건너뛰어지는 조합은 없다(같은 소절).
 *
 * **네트워크에 나가지 않는다.** 취소 갈래의 종단은 전부 `0b`이고, 계속 갈래에서도 확인
 * 호출이 돌지 않는다 — §2.3이 *"모델 키가 env·파일에서 왔다(= 안 물었다) → 모델도
 * 확인하지 않는다"*로 그 갈래를 닫았고, 검색 키도 안 물으므로 그쪽 확인도 없다.
 */
const API_KEY_ENV = "ANTHROPIC_API_KEY";
const DUMMY_API_KEY = "sk-ant-dummy";
const SEARCH_API_KEY_ENV = "TAVILY_API_KEY";
const DUMMY_SEARCH_KEY = "tvly-dummy";

/**
 * 관문이 다 그려지고 입력을 기다리는 상태의 판별 — **문면을 안 쓴다.** 출력이 나기
 * 시작한 뒤 이만큼 조용하면 그린 것이 끝났다고 본다.
 *
 * **키를 미리 먹이지 않는 것이 계약을 재는 조건이다.** 앱이 raw 모드에 들기 전에 바이트가
 * 도착하면 pty의 canonical 모드가 Ctrl+C를 SIGINT로 번역하고, 그러면 재는 것이 관문이
 * 아니라 라인 디시플린이 된다(실측 확인).
 */
const GATE_QUIET_MS = 150;
/** 관문이 서기까지의 상한. 이 시간 안에 아무 출력도 없으면 시행 자체가 실패다 */
const GATE_WAIT_MS = 5_000;

/**
 * **종료를 기다리는 자체 상한.** §2.1은 종료까지의 시간을 정하지 않으므로 이 수는 계약이
 * 아니라 재는 도구다(`ARCHITECTURE.md` §2.21 — 시간 상한은 측정 도구다). 근거는 실측이다:
 * 이 관문은 유사 터미널에서 스폰 후 약 0.3초에 그려지고 키에 대한 확인은 약 1ms에 나간다.
 * 종료가 이어진다면 같은 자릿수에서 일어난다.
 */
const EXIT_WAIT_MS = 1_200;

/**
 * `it` 하나에 거는 명시 상한. **자리 한정이고 근거는 부하가 아니라 이 축이 하는 일이다** —
 * 위 머리 선언 3 참조. 그래서 §2.21의 각인 4항은 안 걸리나, 같은 절의 **판정 단위**인
 * 여유 배수는 걸리므로 값의 근거로 그것을 든다: 전량 런 1본(2026-09-07 · 실행 축 4544 ·
 * pending 32)에서 이 파일의 최악 보고값이 1683ms이고 8000 ÷ 1683 = **4.75배**다(문턱 3배).
 *
 * **2026-09-08 재측정** — 계속 갈래가 `0c`·`0d`를 지나게 된 뒤 단독 런의 최악값은 1009ms
 * (ⓕ가 그 시행을 소유한다)이고 8000 ÷ 1009 = **7.9배**다. 경유가 늘었는데 값이 준 것은
 * 단독 런과 전량 런의 차이이므로 판정 기준은 여전히 위의 전량 런 값이다 — 문턱은 두
 * 측정 어느 쪽으로도 지켜진다.
 *
 * 전역 `testTimeout`을 만들지 않는다 — §2.21의 기각표가 이름으로 든 갈래다.
 */
const AXIS_TIMEOUT_MS = 8_000;

/**
 * 취소 갈래의 응답 키. **세부다** — 위 머리 선언 4가 이 고정을 선언한다.
 *
 * 이 파일은 §2.1이 계약 표면에 요구한 키 무관 규율(어느 키를 넣어도 무엇이 나오지
 * 않는가)을 재는 층이 아니라 **세부의 생사를 재는 단위 층**이고, 키를 모르면 관문을
 * 구동할 수단 자체가 없다.
 */
const CANCEL_KEY = "b";
/** Ctrl+D. §2.1의 중단 입력 셋이 이름으로 든 것이라 세부가 아니다 */
const CTRL_D = "\u0004";
/** Ctrl+C. 같은 자리 */
const CTRL_C = "\u0003";

/** §2.1의 귀결 표가 든 화면의 이름 둘. ⓔ에서 대비쌍으로만 쓴다 */
const NAME_CANCEL = "Blue Pill";
const NAME_PROCEED = "Red Pill";

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI 제거가 목적이다
const ANSI = /\[[0-9;?]*[ -/]*[@-~]/g;

function plain(text: string): string {
  return text.replace(ANSI, "");
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const roots: string[] = [];

afterAll(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
});

/** 한 시행에서 관측된 것 전부. 축마다 이 레코드 위에서만 단정한다 */
interface Landing {
  /**
   * **자체 상한 안에** 프로세스가 끝났는가 — 이 층이 더하는 유일한 관측이다.
   *
   * 상한을 넘겨 거둔 시행에서도 `close`는 결국 온다(우리가 죽였으므로). 그래서 이
   * 필드는 **거두기 전에 얼어붙는다** — 안 그러면 「안 끝났다」가 「SIGKILL로 끝났다」로
   * 보이고, 그것이 정확히 이 축이 잡으려는 상태를 가리는 형태다.
   */
  readonly exitedWithinLimit: boolean;
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  /** `<home>/.neo-agent` 디렉터리 자체의 존재. 파일이 아니라 디렉터리를 본다 */
  readonly homeExists: boolean;
  /** 키를 넣기 전까지의 화면 */
  readonly gateScreen: string;
  /** 키를 넣은 뒤의 화면 — §2.1이 존재를 계약으로 든 그 확인이 여기 있어야 한다 */
  readonly confirmation: string;
}

/**
 * 실 bin을 유사 터미널로 스폰해 관문까지 몰고 간 뒤 키 하나를 넣고, 프로세스가 끝나는지
 * 본다. **키는 관문 문면이 화면에 뜬 뒤에 쓴다**(위 `GATE_QUIET_MS` 참조).
 *
 * `key`가 `undefined`면 아무것도 안 넣고 자체 상한만 기다린다 — 하네스 자기 검사와
 * 관문의 대조군이 그 갈래를 쓴다.
 */
async function land(args: readonly string[], key: string | undefined): Promise<Landing> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "neo-firstrun-exit-")));
  roots.push(root);
  const home = join(root, "home");
  const workspace = join(root, "ws");
  mkdirSync(home, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  // 홈에 `sessions.db`를 만들지 않는다 — 만들면 관문이 안 선다(§2.1의 첫 기동의 판정).

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    [API_KEY_ENV]: DUMMY_API_KEY,
  };

  // `-e`가 자식의 종료 코드를 그대로 돌려주므로 종료 코드가 관측 대상이 된다.
  // `detached`는 프로세스 그룹을 갈라 두는 것이고, 자체 상한을 넘긴 시행을 그룹째
  // 거두기 위해서다 — 안 그러면 pty 뒤의 node가 이 런 내내 남는다.
  const child = spawn(PTY_TOOL, ["-qec", [binPath, ...args].join(" "), "/dev/null"], {
    cwd: workspace,
    env,
    detached: true,
  });

  let raw = "";
  let lastChunkAt = 0;
  const collect = (chunk: Buffer): void => {
    raw += chunk.toString("utf8");
    lastChunkAt = Date.now();
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);

  let exited = false;
  let code: number | null = null;
  let signal: NodeJS.Signals | null = null;
  const closed = new Promise<void>((resolve) => {
    child.on("close", (exitCode, exitSignal) => {
      exited = true;
      code = exitCode;
      signal = exitSignal;
      resolve();
    });
  });

  // ① 관문이 그려지고 조용해질 때까지. 종료가 먼저 오면 그것도 종단이다.
  const gateDeadline = Date.now() + GATE_WAIT_MS;
  while (Date.now() < gateDeadline && !exited) {
    if (lastChunkAt !== 0 && Date.now() - lastChunkAt >= GATE_QUIET_MS) break;
    await sleep(10);
  }
  const gateScreen = plain(raw);
  const mark = raw.length;

  // ② 키를 넣는다. 여기서부터가 이 층이 재는 구간이다.
  if (key !== undefined && !exited) child.stdin.write(key);

  // ③ 종료 **이벤트**를 기다린다. 긴 고정 대기가 아니라 이벤트가 이기는 경주다 —
  //    자체 상한을 넘기면 그룹째 거두고 그 사실을 얼려 실패로 낸다.
  await Promise.race([closed, sleep(EXIT_WAIT_MS)]);
  const exitedWithinLimit = exited;
  if (!exited) {
    const pid = child.pid;
    try {
      if (pid === undefined) throw new Error("pid 없음");
      process.kill(-pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
    await Promise.race([closed, sleep(2_000)]);
  }

  return {
    exitedWithinLimit,
    code,
    signal,
    homeExists: existsSync(join(home, ".neo-agent")),
    gateScreen,
    confirmation: plain(raw.slice(mark)),
  };
}

/**
 * 시행을 축마다 새로 세우지 않고 **키마다 한 번씩만** 세운다. ⓐ~ⓒ가 각자 자기 시행을
 * 세우고 ⓓ·ⓔ는 그 결과를 다시 본다 — §2.21의 처분 갈래 첫째(경량화)를 먼저 따른 것이고,
 * 같은 시행 위에서 종료 축과 의미 축을 함께 보는 것이 ⓓ·ⓔ가 대조군인 이유이기도 하다.
 */
const trials = new Map<string, Promise<Landing>>();

function gateTrial(key: string): Promise<Landing> {
  let existing = trials.get(key);
  if (existing === undefined) {
    existing = land([], key);
    trials.set(key, existing);
  }
  return existing;
}

/** 축 이름 ↔ 자극. ⓓ·ⓔ가 셋을 함께 돈다 */
const CANCEL_INPUTS: ReadonlyArray<readonly [string, string]> = [
  ["ⓐ 취소 선택", CANCEL_KEY],
  ["ⓑ Ctrl+D", CTRL_D],
  ["ⓒ Ctrl+C", CTRL_C],
];

// ───────────────────────────────────────────────────────────────────────────
// 축
// ───────────────────────────────────────────────────────────────────────────

describe.skipIf(!hasPty)("첫 기동 관문 — 실 pty 종료 축 (CLI-INTERFACE §2.1)", () => {
  /**
   * 하네스 자기 검사. **이 축이 초록이어야 아래의 red가 앱의 것이 된다.**
   *
   * 같은 스폰·같은 pty·같은 종료 감시로 도는 기동 하나가 실제로 끝나는 것을 보인다.
   * 이 축이 붉으면 아래 전부의 근거가 사라진다 — 그때 붉은 것은 재는 자다.
   */
  it(
    "하네스 자기 검사 — 이 하네스는 실제 프로세스 종료를 관측한다",
    async () => {
      const landing = await land(["--version"], undefined);

      expect(landing.exitedWithinLimit).toBe(true);
      expect(landing.signal).toBe(null);
      // 버전 문면은 세부다 — 재는 것은 비침묵과 종료뿐이다.
      expect(landing.gateScreen.trim()).not.toBe("");
    },
    AXIS_TIMEOUT_MS,
  );

  for (const [label, key] of CANCEL_INPUTS) {
    /**
     * ⓐ·ⓑ·ⓒ — §2.1의 귀결 표는 취소에 *"아무것도 만들지 않고 종료한다"*를 붙이고 종료
     * 코드를 0으로 못박았으며, 같은 절의 중단 입력 소절은 *"중단 입력 셋(Ctrl+C · Ctrl+D ·
     * 입력 스트림 종료)은 Blue Pill과 같은 귀결이다"*를 계약으로 들었다(*"종료 코드 0, 홈
     * 미생성"*).
     *
     * **이 단정이 모의 층과 겹치지 않는 자리가 `exitedWithinLimit`이다.** 모의 층은 `runCli`가 0을
     * 돌려주는 것까지 재고, 여기서 더하는 것은 그 반환이 **프로세스 종료로 이어지는가**
     * 하나다. 종료가 안 오면 사용자가 보는 것은 취소를 알린 뒤 돌아오지 않는 터미널이고,
     * 그것은 `ARCHITECTURE.md` §2.6이 든 *"보이는 결과 또는 기록된 의도적 비결과"*의
     * 반대편이다.
     */
    it(
      `${label} — 종료하고 코드가 0이다`,
      async () => {
        const landing = await gateTrial(key);

        expect({
          exitedWithinLimit: landing.exitedWithinLimit,
          code: landing.code,
          signal: landing.signal,
        }).toEqual({ exitedWithinLimit: true, code: 0, signal: null });
      },
      AXIS_TIMEOUT_MS,
    );
  }

  /**
   * ⓓ — §2.1이 이 관문의 유일한 새 계약이라 부른 검사 가능한 주장. 재는 것은 파일이 아니라
   * **디렉터리 자체**다. 이 시행의 홈은 갓 만든 빈 자리라 관문 전에는 없었고, 취소 갈래가
   * 무엇도 만들지 않았다면 여전히 없어야 한다.
   */
  it(
    "ⓓ 취소 갈래 셋 어디서도 홈 디렉터리가 생기지 않는다",
    async () => {
      const seen: Record<string, boolean> = {};
      for (const [label, key] of CANCEL_INPUTS) {
        seen[label] = (await gateTrial(key)).homeExists;
      }

      expect(seen).toEqual({ "ⓐ 취소 선택": false, "ⓑ Ctrl+D": false, "ⓒ Ctrl+C": false });
    },
    AXIS_TIMEOUT_MS,
  );

  /**
   * ⓔ — §2.1: *"관문은 자기가 무엇으로 읽었는지를 알린 뒤에만 다음으로 간다"*. 재는 것은
   * 그 절이 §7 말미의 기준으로 넘긴 두 가지 그대로다 — *"고른 갈래의 확인이 비어 있지
   * 않은가, 그 확인이 고르지 않은 쪽의 이름을 담지 않는가"*. 문면·색·자리는 §12가 위임한
   * 세부이고 이 축은 그것을 건드리지 않는다.
   *
   * **구간은 §2.1이 정한다**(2026-09-07 확정 — 이 자리의 미규정 해소). 모집단은 *"선택을 읽은
   * 뒤 관문이 내는 출력"*이고 **상한은 계약이 아니다** — 넓히는 방향이 안전한 방향이라 재는
   * 쪽에 열려 있고, 여기서는 키 입력 뒤 전량으로 잡는다. 그 절이 함께 계약으로 든
   * *"선택을 읽은 뒤 관문은 선택지를 다시 제시하지 않는다"*가 관문 재그리기 구현을 계약 밖으로
   * 밀어내므로, 두 이름이 이 구간에 함께 서는 갈래는 이제 미규정이 아니라 위반이다.
   */
  it(
    "ⓔ 확인이 비어 있지 않고 고르지 않은 쪽의 이름을 담지 않는다",
    async () => {
      for (const [label, key] of CANCEL_INPUTS) {
        const landing = await gateTrial(key);

        expect(`${label}: ${landing.confirmation.trim() !== ""}`).toBe(`${label}: true`);
        // 대비쌍 — 같은 문자열 안에서 고른 쪽의 이름은 있고 안 고른 쪽의 이름은 없다.
        expect(`${label}: ${landing.confirmation.includes(NAME_CANCEL)}`).toBe(`${label}: true`);
        expect(`${label}: ${landing.confirmation.includes(NAME_PROCEED)}`).toBe(`${label}: false`);
      }
    },
    AXIS_TIMEOUT_MS,
  );
});

// ───────────────────────────────────────────────────────────────────────────
// 계속(Red Pill) 갈래 — 회귀 부재를 재는 축 셋
//
// **왜 형태가 위와 다른가.** §2.1의 귀결 표에서 Red Pill 행의 동작은 *"4로 진행한다"*이고,
// §2의 시퀀스는 4 뒤에 5·5b·6·7을 지나 `8. REPL 진입`으로 끝난다. 그래서 이 갈래의 정상은
// **끝나지 않는 것**이다 — 위의 ⓐ~ⓒ가 재는 「종료」를 여기서 그대로 뒤집어 재면 재는 것이
// 계약이 아니라 대기 시간이 된다.
//
// **2026-09-08 — 4에 닿는 경로가 길어졌다.** 관문이 `0b`로 옮겨지면서 Red Pill 뒤에
// `0c`(온보딩)와 `0d`(영속화)가 서고, 그 둘을 지나야 1~4가 돈다(§2·§2.3). **재는 축 셋은
// 그대로이고 바뀐 것은 자극 하나다** — 관문의 키 하나에 더해 `0c`의 질문에 답해야 한다.
// env로 준 키 둘이 키 두 단계를 건너뛰게 하므로(§2.3 「이미 있는 값은 묻지 않는다」)
// 남는 질문은 `model` 하나이고, 그 단계는 §2.3이 기본값을 갖는다고 정한 유일한 단계라
// **기본값 수용**이 이 층의 자극이 된다.
//
//   ⓕ `<home>/.neo-agent/sessions.db`가 생긴다 — §2의 4가 실제로 돌았다.
//     그 파일이 그 자리에 있다는 것은 §2.1의 판정 소절이 `FirstRunVerdict`의 근거로
//     든 그대로이고(*"`~/.neo-agent/sessions.db`가 없다 — 4가 아직 한 번도 돌지 않았다"*),
//     **`sessions.db`를 만드는 단계는 여전히 4 하나다** — 2026-09-08에 둘이 된 것은
//     「홈을 만드는 단계」의 수이고(`0d`와 4 — §2·§2.1 자리 소절), 이 축이 재는 것은
//     그 수가 아니라 그 파일의 출현이다. 같은 구분을 아래 ⓙ 블록이 다시 든다.
//   ⓖ 확인이 비어 있지 않고 고르지 않은 쪽의 이름을 담지 않는다 — ⓔ와 **같은 계약의
//     반대 갈래**다(§2.1 *"선택 뒤의 확인 표시는 «있다»가 계약"*). §2.1이 그 판정에서
//     *"한 관문에서 두 갈래의 규율을 가르지 않는다"*고 명시했으므로 이 축이 그 대칭을 잰다.
//   ⓗ REPL이 **입력을 받는다** — §2의 `8. REPL 진입`.
//
// **ⓗ의 형태가 이 블록의 설계 제약이다** (`ARCHITECTURE.md` §2.21). 「자체 상한만큼 기다려
// 안 끝나는 것을 본다」로 세우지 않는다. 근거 둘:
//   ① 그 절의 처분 갈래는 순서가 있고 첫째가 **경량화**다 — 상한만큼의 고정 대기는
//      게이트에 그 시간을 그대로 얹고 여유 배수를 갉는다.
//   ② 더 중요한 것은 **그 축이 재려는 것을 못 잰다**는 것이다. 「살아 있다」와 「입력을
//      받을 준비가 됐다」가 갈리지 않는다 — stdin이 멎은 채 이벤트 루프만 붙잡고 있는
//      프로세스도 그 단정을 통과한다. 그것이 정확히 이 갈래에서 의심할 상태다.
//
// **그래서 입력 라인의 「반응」을 관측한다.** §5의 닫힌 목록에 있는 `/exit`(*"종료 시퀀스
// (§2)"*)를 넣고, §2 말미가 계약으로 든 그 귀결(세션 id와 재개 방법을 표시하고 종료)이
// 실제로 오는지 본다. 이 단정은 **입력이 REPL에 닿아야만** 통과하므로 위 ②를 가르고,
// 고정 대기가 없으므로 ①도 만족한다. 덤으로 자식이 스스로 거둬진다.
//
// **프롬프트 「글자」를 단정하지 않는다.** 입력 라인이 서 있다는 것은 §7이 계약으로 들지만
// (*"스트리밍 중에도 입력 라인은 최하단에 유지되고"*), 프롬프트 문자는 §12가 위임한 표시
// 세부다 — 그것을 리터럴로 고정하면 §7 말미가 금한 「짝 없는 단독 리터럴」이 되고 세부를
// 계약으로 승격시킨다. 실측으로 그 자리에 프롬프트가 그려지는 것은 확인했고(2026-09-07),
// 이 축이 단정하는 것은 그 글자가 아니라 **그 줄이 입력을 받는다**는 것이다.
//
// **`/exit`도 입력 자극이지 계약 문면이 아니다** — 위 머리 선언 4가 `CANCEL_KEY`에 대해
// 한 것과 같은 지위이나, 이쪽은 §5의 MVP 명령 집합이 **닫힌 목록으로 이름을 든** 자리라
// 세부보다 강하다(그 목록의 변경은 *"이 문서 개정"*을 요구한다).
//
// **응답 키 `r`은 세부다** — 머리 선언 4의 `CANCEL_KEY`와 같은 지위이고 같은 선언을 받는다.
//
// **이 블록을 쓰는 동안 본 `src/`는 `git diff`가 낸 추가 11줄이 전부다**(주석 10줄 +
// `input.pause()` 한 줄). 기대값은 그것을 보기 전에 §2.1·§2·§5·§7·§12에서 뽑았고 이
// 블록은 `src/`에서 아무것도 임포트하지 않는다. 그래도 본 것은 사실이므로 여기 적는다 —
// 위 머리의 「열지 않았다」 선언은 그 파일을 쓴 시점의 것이고 이 블록에는 이 줄이 걸린다.
// ───────────────────────────────────────────────────────────────────────────

/** 계속 갈래의 응답 키. **세부다** — `CANCEL_KEY`와 같은 지위 */
const PROCEED_KEY = "r";
/**
 * `0c`의 `model` 단계에서 **기본값을 수용하는** 자극. **세부다** — 머리 선언 4가
 * `CANCEL_KEY`에 대해 한 선언이 이 자리에도 그대로 걸린다.
 *
 * §2.3이 계약으로 든 것은 *"모델은 기본값을 보이고 수용하거나 직접 입력한다"*까지이고,
 * **그 수용이 어느 바이트로 표현되는가는 §12가 위임한 표시 세부**다(`OnboardingPrompt`의
 * `defaultValue`가 그 계약의 타입 표면이다). 여기서 고정하는 것은 그 세부이고, 갈리면
 * 이 상수를 고치는 것이 옳다 — 계약 변경이 아니다. pty이므로 개행은 CR이다.
 */
const ONBOARDING_ACCEPT_DEFAULT = "\r";
/** §5의 닫힌 목록이 이름으로 든 종료 명령. pty이므로 개행은 CR이다 */
const EXIT_COMMAND = "/exit\r";
/** REPL이 다 그려지고 조용해진 것의 판별 — `GATE_QUIET_MS`와 같은 수단, 문면을 안 쓴다 */
const REPL_QUIET_MS = 250;
/** 관문 통과 뒤 REPL이 서기까지의 상한. `0c`~8이 이 안에 끝난다 */
const REPL_WAIT_MS = 6_000;
/** `0c`의 첫 질문이 다 그려지고 조용해진 것의 판별 — 관문과 같은 수단, 문면을 안 쓴다 */
const ONBOARDING_QUIET_MS = 200;
/** 관문 통과 뒤 `0c`의 첫 질문이 서기까지의 상한 */
const ONBOARDING_WAIT_MS = 5_000;

/** 계속 갈래 한 시행에서 관측된 것 전부 */
interface Proceeding {
  /** 키를 넣은 뒤 REPL이 조용해질 때까지의 화면 — 확인과 시작 화면이 여기 있다 */
  readonly confirmation: string;
  /** `<home>/.neo-agent/sessions.db`의 존재 — §2의 4가 돌았다는 뜻 */
  readonly sessionsDbExists: boolean;
  /** `/exit`를 넣기 **직전**에 프로세스가 살아 있었는가. ⓗ의 두 상태를 가르는 첫 항 */
  readonly aliveBeforeInput: boolean;
  /** `/exit` 뒤 자체 상한 안에 끝났는가. 살아만 있는 상태는 여기서 걸린다 */
  readonly exitedAfterInput: boolean;
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

/**
 * 관문에 계속을 주고 REPL까지 몰고 간 뒤, 입력 라인에 `/exit`를 넣어 반응을 본다.
 * 위의 `land`를 재사용하지 않는 이유는 그 함수가 **종료를 기다리는** 형태로 굳어 있어서다 —
 * 이 갈래의 정상은 그 반대다.
 */
async function proceed(): Promise<Proceeding> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "neo-firstrun-proceed-")));
  roots.push(root);
  const home = join(root, "home");
  const workspace = join(root, "ws");
  mkdirSync(home, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  // 홈에 `sessions.db`를 미리 만들지 않는다 — 만들면 관문이 안 선다(§2.1 첫 기동의 판정).

  const child = spawn(PTY_TOOL, ["-qec", binPath, "/dev/null"], {
    cwd: workspace,
    // 키 둘을 env로 준다 — `0c`의 키 두 단계를 §2.3의 env 갈래로 건너뛰게 하고, 남는
    // 질문 하나(`model`)만 이 층의 자극이 되게 한다. 확인 호출은 어느 쪽도 돌지 않는다.
    env: {
      ...process.env,
      HOME: home,
      [API_KEY_ENV]: DUMMY_API_KEY,
      [SEARCH_API_KEY_ENV]: DUMMY_SEARCH_KEY,
    },
    detached: true,
  });

  let raw = "";
  let lastChunkAt = 0;
  const collect = (chunk: Buffer): void => {
    raw += chunk.toString("utf8");
    lastChunkAt = Date.now();
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);

  let exited = false;
  let code: number | null = null;
  let signal: NodeJS.Signals | null = null;
  const closed = new Promise<void>((resolve) => {
    child.on("close", (exitCode, exitSignal) => {
      exited = true;
      code = exitCode;
      signal = exitSignal;
      resolve();
    });
  });

  // ① 관문이 그려지고 조용해질 때까지 — 위 `land`와 같은 이유로 키를 미리 안 먹인다.
  const gateDeadline = Date.now() + GATE_WAIT_MS;
  while (Date.now() < gateDeadline && !exited) {
    if (lastChunkAt !== 0 && Date.now() - lastChunkAt >= GATE_QUIET_MS) break;
    await sleep(10);
  }
  const mark = raw.length;

  // ② 계속을 고른다. 여기서부터 §2의 `0c`가 돈다.
  if (!exited) child.stdin.write(PROCEED_KEY);

  // ③ `0c`의 첫 질문이 다 그려지고 조용해질 때까지. 이 구간의 화면이 ⓖ의 모집단이다 —
  //    관문의 확인이 여기 있어야 하고, 뒤이어 오는 것은 온보딩의 질문이다.
  const onboardingDeadline = Date.now() + ONBOARDING_WAIT_MS;
  while (Date.now() < onboardingDeadline && !exited) {
    if (Date.now() - lastChunkAt >= ONBOARDING_QUIET_MS) break;
    await sleep(10);
  }
  const confirmation = plain(raw.slice(mark));

  // ④ `model` 질문에 기본값 수용으로 답한다. 키 두 단계는 env 갈래로 건너뛰어지므로
  //    이 하나가 `0c`의 마지막 답이고, 그 뒤 `0d`와 1~8이 돈다.
  if (!exited) child.stdin.write(ONBOARDING_ACCEPT_DEFAULT);

  // ⑤ REPL이 다 그려지고 조용해질 때까지. 종료가 오면 그것도 종단이다(그때 ⓗ가 붉는다).
  const replDeadline = Date.now() + REPL_WAIT_MS;
  while (Date.now() < replDeadline && !exited) {
    if (Date.now() - lastChunkAt >= REPL_QUIET_MS) break;
    await sleep(10);
  }
  const sessionsDbExists = existsSync(join(home, ".neo-agent", "sessions.db"));

  // ⑥ 입력 라인에 명령을 넣는다. **고정 대기가 아니라 반응 관측이다.**
  const aliveBeforeInput = !exited;
  if (aliveBeforeInput) child.stdin.write(EXIT_COMMAND);
  await Promise.race([closed, sleep(EXIT_WAIT_MS)]);
  const exitedAfterInput = exited;
  if (!exited) {
    const pid = child.pid;
    try {
      if (pid === undefined) throw new Error("pid 없음");
      process.kill(-pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
    await Promise.race([closed, sleep(2_000)]);
  }

  return { confirmation, sessionsDbExists, aliveBeforeInput, exitedAfterInput, code, signal };
}

/** 축 셋이 시행 하나를 나눠 쓴다 — §2.21 처분 갈래의 첫째(경량화)를 먼저 따른다 */
let proceedTrial: Promise<Proceeding> | undefined;
function gateProceed(): Promise<Proceeding> {
  proceedTrial ??= proceed();
  return proceedTrial;
}

describe.skipIf(!hasPty)("첫 기동 관문 — 계속(Red Pill) 갈래 (CLI-INTERFACE §2.1·§2)", () => {
  /**
   * ⓕ — §2.1 귀결 표의 Red Pill 행: *"4로 진행한다"*. `sessions.db`를 만드는 것은 4이고,
   * §2.1의 `FirstRunVerdict` 주석이 그 파일의 부재를 *"4가 아직 한 번도 돌지 않았다"*로
   * 읽는다 — 그 독해의 대우가 이 축이다.
   *
   * **2026-09-08 — 「홈을 만드는 유일한 단계」는 이제 4가 아니다.** §2.1 자리 소절이 그 수를
   * 둘(`0d`와 4)로 고쳤다. 이 축이 재는 것은 그 수가 아니라 **`sessions.db`의 출현**이고,
   * 그 파일의 소유 단계는 여전히 4 하나다.
   */
  it(
    "ⓕ 계속을 고르고 온보딩을 지나면 홈에 sessions.db가 생긴다",
    async () => {
      expect((await gateProceed()).sessionsDbExists).toBe(true);
    },
    AXIS_TIMEOUT_MS,
  );

  /**
   * ⓖ — ⓔ와 같은 계약의 반대 갈래다(§2.1: *"관문은 자기가 무엇으로 읽었는지를 알린 뒤에만
   * 다음으로 간다"* · *"한 관문에서 두 갈래의 규율을 가르지 않는다"*). 재는 것도 같다 —
   * 비어 있지 않은가, 고르지 않은 쪽의 이름을 담지 않는가.
   *
   * **구간은 §2.1이 정한다**(2026-09-07 확정 — ⓔ와 같은 항의 해소). 계속 갈래에서는 확인 뒤에
   * 다음 단계의 출력이 이어져 이 구간이 확인보다 넓고, 그것이 허용된다 — 상한이 계약이
   * 아니기 때문이다. **넓혀서 헐거워지는 것은 첫째 단정 하나**이고(뒤 단계 출력이
   * 비침묵을 대신 통과시킨다) 그 몫을 아래 둘째 단정이 진다: 알약 어휘는 관문 문면에만 사는
   * 층이므로(`LORE.md` §6) 고른 쪽 이름의 존재가 **관문이 이 구간에서 말했다**의 증거다.
   *
   * **2026-09-08 — 구간의 오른쪽 끝이 좁아졌다.** 개정 전에는 시작 화면(§2의 5b·6 고지)까지
   * 들어왔으나, 이제 관문 뒤에 `0c`가 서므로 이 구간은 **관문의 확인 + 온보딩의 첫 질문**에서
   * 끝난다. 좁아지는 방향이라 위 판정에 걸리지 않는다 — 상한이 계약이 아닌 이유가 넓히는
   * 쪽이 안전해서였고, 좁히는 쪽은 단정을 헐겁게 만들지 않는다.
   */
  it(
    "ⓖ 확인이 비어 있지 않고 고르지 않은 쪽의 이름을 담지 않는다",
    async () => {
      const { confirmation } = await gateProceed();

      expect(confirmation.trim() !== "").toBe(true);
      // 대비쌍 — ⓔ와 같은 값 둘을 갈래만 뒤집어 쓴다.
      expect(confirmation.includes(NAME_PROCEED)).toBe(true);
      expect(confirmation.includes(NAME_CANCEL)).toBe(false);
    },
    AXIS_TIMEOUT_MS,
  );

  /**
   * ⓗ — §2의 `8. REPL 진입`. **두 항의 연언이 이 축의 전부다**: 시작 화면이 조용해진
   * 시점에 프로세스가 **살아 있고**, 그 상태에서 넣은 §5의 `/exit`가 §2 말미의 종료
   * 시퀀스를 실제로 돌린다(*"세션 id와 재개 방법(`neo-agent --resume <id 앞부분>`)을
   * 표시하고 종료한다"*).
   *
   * **앞 항만으로는 부족하고 뒤 항만으로도 부족하다.** 앞 항만 재면 stdin이 멎은 채
   * 이벤트 루프만 붙잡힌 프로세스가 통과하고, 뒤 항만 재면 관문 자체가 죽어 끝난 시행이
   * 「끝났으니 통과」로 읽힌다. 둘을 함께 단정해야 「입력을 받을 준비가 된 상태」가 된다.
   */
  it(
    "ⓗ REPL이 서고 입력 라인이 입력을 받는다",
    async () => {
      const landing = await gateProceed();

      expect({
        aliveBeforeInput: landing.aliveBeforeInput,
        exitedAfterInput: landing.exitedAfterInput,
        code: landing.code,
        signal: landing.signal,
      }).toEqual({
        aliveBeforeInput: true,
        exitedAfterInput: true,
        code: 0,
        signal: null,
      });
    },
    AXIS_TIMEOUT_MS,
  );
});
