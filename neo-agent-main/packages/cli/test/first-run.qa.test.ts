/**
 * 첫 기동 관문 독립 검증 — `docs/CLI-INTERFACE.md` §2.1 (부수: §2 시작 시퀀스 열거).
 *
 * **기대값은 §2.1과 §2에서만 뽑았다.** 이 파일을 쓰는 동안 `src/first-run.ts`와
 * `src/wiring.ts`의 첫 실행 블록(쓰던 시점의 번호는 `3c`, 지금은 `0b`)은 열지 않았다 —
 * 구현을 읽고 나서 기대값을 적으면 그것은
 * 구현의 재서술이지 검증이 아니다. 여는 문(門)은 `runCli` 하나이고, 나머지는 전부
 * 파일 시스템·종료 코드·출력이라는 **관측 가능한 결과**다.
 *
 * **응답 키를 아는 단정을 쓰지 않는다.** §2.1은 선택지를 닫힌 둘로 정하면서 어느 키가
 * 어느 쪽인지는 정하지 않았고, §9가 응답 키를 구현 세부로 두고 §12가 표시 세부를 위임한다.
 * 그래서 이 파일은 키를 **찾아낸다** — 후보 알파벳을 하나씩 넣어 보고 그 결과를 세
 * 부류(진행 / 취소 / 재프롬프트)로 가른 뒤, 그 부류 위에서만 단정한다. 선례는 같은
 * 디렉터리의 `approval-ui.contract.test.ts`가 응답 키를 미규정으로 두고 간 규율이다.
 *
 * **`0c`의 입력 세부 하나를 고정한다 — 그 사실을 여기 선언한다** (2026-09-08 · §2.1이
 * 「단위 층은 키를 안다」에 붙인 선언 요구와 같은 형태). 온보딩이 관문 뒤에 서면서
 * (§2·§2.3) 진행 갈래는 `0c`를 지나야 4에 닿고, 그러려면 `model` 질문에 답해야 한다 —
 * 세 단계가 전부 건너뛰어지는 조합은 없기 때문이다(§2.3). 이 파일이 고정하는 것은
 * **기본값을 수용하는 자극 하나**(`ONBOARDING_ACCEPT_DEFAULT`)이고, §2.3이 계약으로 든
 * 것은 *"모델은 기본값을 보이고 수용하거나 직접 입력한다"*까지이므로 그 수용이 어느
 * 바이트인가는 §12가 위임한 표시 세부다. 갈리면 그 상수를 고치는 것이 옳다 — 계약
 * 변경이 아니다. 나머지 두 단계는 §2.3의 **env 갈래**로 건너뛰어지므로 자극이 없다.
 *
 * **그래서 진행 판정의 기계가 바뀌었다.** 개정 전에는 키 하나를 넣고 `sessions.db`의
 * 출현을 기다리는 것이 진행 갈래의 관측이었으나, 관문 뒤에 `0c`가 서면서 그 신호가
 * 그 자리에 오지 않는다. **재는 것은 그대로 «그 키가 진행 갈래인가»이고**, 관측은
 * 「관문의 답 + `0c`의 답」 뒤의 `sessions.db`로 옮겼다. 취소 갈래와 갈리는 자리도
 * 그대로다 — 취소는 `0b`에서 끝나므로 둘째 자극에 닿지 않고, 재프롬프트 갈래는 그
 * 자극이 §2.1이 「기본 선택이 없다」로 배제한 것이라 관문을 넘지 못한다(C-5가 그
 * 배제를 독립으로 잰다).
 *
 * **문면을 리터럴로 고정하지 않는다**(§7 말미의 기준). 이 파일의 리터럴은 두 갈래뿐이다
 * — 테스트가 주입한 데이터(홈 경로)가 그대로 통과했는지 확인하는 단정이거나, 같은 값의
 * 있음과 없음을 서로 다른 상태에서 재는 대비쌍이다. **예외는 둘이고 둘 다 §2.1이 스스로
 * 그 내용을 계약으로 올린 자리다** — 성질이 같고 자리가 다르다.
 *
 *   1. **문면 소절이 이름으로 든 셋**(E 블록). 그 셋의 유무를 재는 것은 테스트가 세부를
 *      계약으로 굳히는 것이 아니라 이미 계약인 것을 재는 것이다. 다만 **정확한 낱말은
 *      여전히 세부이므로** 개념마다 여러 표기를 허용하는 관용 집합으로 잰다. 같은
 *      소절이 함께 요구한 **파일·디렉터리 이름**은 낱말과 축이 다르지만 그 절이 이름의
 *      정본을 각 경로 함수로 위임했으므로 리터럴이 아니라 **경로 함수에서 파생한다**
 *      (E-2). 그래서 이름 축은 이 예외 열거에 오르지 않는다.
 *   2. **귀결 표의 화면 이름 둘**(C-7). 그 표가 화면의 이름과 코드의 값의 대응을 스스로
 *      «정본»으로 못박았다. 대소문자·사이 공백은 표시 세부이므로 느슨하게 잰다.
 *
 * 대조한 계약 항목 열넷 — 등급과 재현은 `plans/20260821-firstrun-gate-qa-report.md`가 든다.
 *
 *   A. 판정은 sessions.db의 부재 하나뿐   (A-1 ~ A-4)
 *   B. 자리 — `0a` 뒤·홈 생성(`0d`·4) 앞  (B-1 ~ B-4)
 *   C. 선택의 귀결 — 닫힌 둘·기본 선택 없음·라벨↔값 대응 (C-1 ~ C-7)
 *   D. 새 영속 상태를 만들지 않는다        (D-1)
 *   E. 문면 셋                            (E-1 ~ E-4)
 *   F. 비용 상한 — 성장 형태 넷            (F-1 ~ F-3)
 *   G. serve 갈래                         (G-1)
 *   H. 중단 입력 셋 — EOF·제어문자         (H-1 ~ H-2)
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { PassThrough } from "node:stream";
import type { ModelClient, ModelStreamEvent } from "@neo-agent/core";
import { defaultDatabasePath } from "@neo-agent/store";
import { afterEach, describe, expect, it } from "vitest";
import { defaultAllowlistPath } from "../src/allowlist.ts";
import { parseArgs } from "../src/args.ts";
import { defaultConfigPath } from "../src/config.ts";
import { API_KEY_ENV, SEARCH_API_KEY_ENV } from "../src/credentials.ts";
import { defaultMemoryDir } from "../src/memory.ts";
import { SLASH_COMMANDS } from "../src/registry.ts";
import { EXIT_OK, runCli } from "../src/wiring.ts";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 네트워크로 나가지 않는 최소 모델. 관문은 시작 시퀀스 6보다 앞이라 이 모델이 불릴 일은
 * 없으나, 주입하지 않으면 Red Pill 갈래가 실물 프로바이더를 조립한다.
 */
function localModel(): ModelClient {
  return {
    modelId: "firstrun-qa/probe",
    async *stream(): AsyncIterable<ModelStreamEvent> {
      yield {
        type: "done",
        message: {
          role: "assistant",
          content: [],
          stopReason: "end_turn",
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          timestamp: Date.now(),
        },
      };
    },
  };
}

/* ============================================================================
 * 관측 수단 — 한 번의 기동을 통째로 감싼 시험대
 * ========================================================================== */

interface TrialOptions {
  readonly argv?: readonly string[];
  /** 기동 전에 홈을 채운다. 인자는 `<home>/.neo-agent` 경로다 */
  readonly seed?: (agentHome: string) => void;
  /**
   * 이미 만든 루트를 재사용한다. 주면 그 루트를 쓰고, 없으면 오늘처럼 새로 만든다.
   *
   * A-4가 자기 제목을 재려면 **첫 시행의 홈을 둘째 시행에 그대로 넘길 수단**이
   * 있어야 한다. §2.1 판정 소절의 마지막 불릿이 이름으로 든 것은
   * «사용자가 그 파일을 지우면 다시 묻는다»이고, 새 홈에서는 그 지움이 성립하지 않는다.
   */
  readonly root?: string;
}

interface Trial {
  /** 이 시행이 쓰는 임시 루트. 둘째 시행에 그대로 넘기는 자리다(`TrialOptions.root`) */
  readonly root: string;
  readonly home: string;
  readonly agentHome: string;
  write(key: string): void;
  endInput(): void;
  output(): string;
  outputLength(): number;
  settled(): boolean;
  exitCode(): number | undefined;
  dbExists(): boolean;
  homeExists(): boolean;
  /** `~/.neo-agent`의 항목 이름들. 디렉터리가 없으면 null */
  entries(): readonly string[] | null;
  dispose(): Promise<void>;
}

const roots: string[] = [];

function startTrial(options: TrialOptions = {}): Trial {
  // 새로 만들 때만 정리 목록에 올린다. 같은 루트를 두 번 밀어도 `rmSync`는 견디지만,
  // 정리 대상이 중복으로 세어지면 뒤 세대가 그 수를 오독한다.
  let root: string;
  if (options.root === undefined) {
    root = mkdtempSync(join(tmpdir(), "neo-firstrun-qa-"));
    roots.push(root);
  } else {
    root = options.root;
  }
  // 재사용 갈래도 아래 조립을 **같은 식으로** 통과한다 — 두 식이 갈리면 두 시행이
  // 같은 홈을 쓴다는 것이 거짓이 되고, 그것이 정확히 A-4가 걸렸던 함정이다.
  const home = join(root, "home");
  const workspace = join(root, "ws");
  const agentHome = join(home, ".neo-agent");
  mkdirSync(workspace, { recursive: true });
  options.seed?.(agentHome);

  const input = new PassThrough();
  const output = new PassThrough() as PassThrough & { columns?: number };
  output.columns = 80;
  const chunks: string[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf8")));

  let code: number | undefined;
  let failure: unknown;
  let done = false;
  const running = runCli({
    argv: [...(options.argv ?? [])],
    // 키 둘을 env로 준다 — §2.3의 env 갈래로 `0c`의 키 두 단계를 건너뛰게 해서 진행
    // 갈래의 자극을 `model` 하나로 좁힌다. 확인 호출은 어느 쪽도 돌지 않는다(§2.3 —
    // 안 물은 키는 확인하지 않는다). 이 파일의 모든 시행이 같은 env를 쓰므로 두 갈래의
    // 대비쌍이 env 차이로 흔들리지 않는다.
    env: { [API_KEY_ENV]: "firstrun-qa-key", [SEARCH_API_KEY_ENV]: "firstrun-qa-search-key" },
    cwd: workspace,
    home,
    io: { input, output },
    version: "0.0.0-firstrun-qa",
    factories: {
      // 5b의 Docker 판정을 명시 주입한다 — 생략하면 실제 `docker version`이 스폰된다
      // (`./probe-docker.ts`가 그 규율의 정본 서술을 든다).
      probeDocker: async () => ({ available: false, reason: "firstrun-qa: 판정 주입" }),
      // 이미지 프로브도 같은 규율이다 — 이 기동은 진단(doctor)을 부르지 않으므로 여기에
      // 닿을 수 없는 것이 계약이고, 불리면 그것이 곧 실 docker에 닿을 뻔했다는 신호다.
      probeSandboxImage: async ({ image }: { image: string }) => {
        throw new Error(
          `firstrun-qa: probeSandboxImage가 불렸다(${image}) — 이 경로는 진단을 부르지 않는다`,
        );
      },
      createModelClient: () => localModel(),
    },
  }).then(
    (value) => {
      done = true;
      code = value;
      return value;
    },
    (error: unknown) => {
      done = true;
      failure = error;
      return -1;
    },
  );

  return {
    root,
    home,
    agentHome,
    write: (key) => void input.write(key),
    endInput: () => void input.end(),
    output: () => chunks.join(""),
    outputLength: () => chunks.length,
    settled: () => done,
    exitCode: () => {
      if (failure !== undefined) throw failure;
      return code;
    },
    dbExists: () => existsSync(join(agentHome, "sessions.db")),
    homeExists: () => existsSync(agentHome),
    entries: () => (existsSync(agentHome) ? readdirSync(agentHome).sort() : null),
    dispose: async () => {
      if (!done) {
        input.end();
        await Promise.race([running, sleep(1500)]);
      }
      input.destroy();
      await Promise.race([running, sleep(1500)]);
    },
  };
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
});

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(10);
  }
  return predicate();
}

/** 관문이 서서 입력을 기다리는 상태에 도달할 때까지 기다린다 */
async function waitForGate(trial: Trial): Promise<void> {
  const reached = await waitFor(() => trial.outputLength() > 0 || trial.settled());
  if (!reached || trial.settled()) {
    throw new Error(
      `관문이 서지 않았다 — 기동이 입력을 기다리지 않고 끝났다(exit=${String(trial.exitCode())}). 출력: ${JSON.stringify(trial.output().slice(0, 200))}`,
    );
  }
  // 한 프레임 더 준다 — 문면이 여러 청크로 나뉘어 나가는 구현을 배제하지 않기 위해서다.
  await sleep(30);
}

/**
 * 저장소(4)가 실제로 열렸는가의 관측. 열리면 WAL 부산물이 함께 서므로 항목이 는다 —
 * `sessions.db` 파일의 존재만으로는 seed와 구분되지 않는다.
 */
function storeOpened(trial: Trial): boolean {
  return trial.dbExists() && (trial.entries()?.length ?? 0) > 1;
}

/** 발견된 부류에서 키 하나를 꺼낸다. 부류가 비었으면 그 자체가 실패다 */
function pickKey(keys: readonly string[], what: string): string {
  const key = keys[0];
  if (key === undefined) throw new Error(`${what} 부류가 비었다 — 키 발견이 실패했다`);
  return key;
}

/** 홈을 «이미 지난 적이 있는» 상태로 만든다 — 판정의 입력은 sessions.db의 존재 하나다 */
function seedReturningHome(agentHome: string): void {
  mkdirSync(agentHome, { recursive: true, mode: 0o700 });
  chmodSync(agentHome, 0o700);
  writeFileSync(join(agentHome, "sessions.db"), "", { mode: 0o600 });
  chmodSync(join(agentHome, "sessions.db"), 0o600);
}

/* ============================================================================
 * 응답 키의 발견 — 키를 알지 않고 두 갈래를 가른다
 *
 * 후보 하나마다 기동을 새로 세우고 그 키를 넣은 뒤, 세 부류로 가른다:
 *
 *   PROCEED  — 관문을 지나 `0c`가 섰고, 그 답 뒤에 시작 시퀀스 4가 돌았다
 *   CANCEL   — 기동이 끝났는데 홈에 아무것도 없다
 *   STAY     — 둘 다 아니다 (관문이 그대로 서 있다)
 *
 * 세 부류의 이름은 §2.1의 표가 든 두 귀결과 그 절의 «기본 선택을 두지 않는다»에서 나온다.
 * **어느 문자가 어디 드는지는 이 파일이 정하지 않는다** — 그것을 정하는 순간 §12가 세부로
 * 위임한 것을 테스트가 계약으로 굳힌다.
 * ========================================================================== */

/**
 * `0c`의 `model` 단계에서 **기본값을 수용하는** 자극. **세부다** — 파일 머리의 2026-09-08
 * 선언이 이 고정을 든다.
 *
 * **이 자극이 관문에서는 아무 갈래도 아니다**(§2.1 «기본 선택을 두지 않는다»). 그래서
 * 진행 갈래와 재프롬프트 갈래를 가르는 데 쓸 수 있다 — 관문이 그대로 서 있으면 이것을
 * 넣어도 4가 돌지 않는다. C-5가 그 전제를 독립으로 잰다.
 */
const ONBOARDING_ACCEPT_DEFAULT = "\r";

type Outcome = "PROCEED" | "CANCEL" | "STAY";

interface KeyMap {
  readonly proceed: readonly string[];
  readonly cancel: readonly string[];
  readonly stay: readonly string[];
}

/**
 * 관문에 키 하나를 넣은 뒤 `0c`의 답까지 밀어 넣는다. 두 자극 사이는 **고정 대기가
 * 아니라 반응 관측**이다 — 관문의 확인이든 재프롬프트든 출력이 하나 나야 다음 자극이
 * 의미를 갖는다(§2.1 «관문은 자기가 무엇으로 읽었는지를 알린 뒤에만 다음으로 간다»).
 */
async function driveGate(trial: Trial, key: string): Promise<void> {
  const before = trial.outputLength();
  trial.write(key);
  await waitFor(() => trial.settled() || trial.outputLength() > before, 1500);
  // 문면이 여러 청크로 나뉘어 나가는 구현을 배제하지 않는다(`waitForGate`와 같은 수단).
  await sleep(30);
  if (!trial.settled()) trial.write(ONBOARDING_ACCEPT_DEFAULT);
}

async function classifyKey(key: string): Promise<Outcome> {
  const trial = startTrial();
  try {
    await waitForGate(trial);
    await driveGate(trial, key);
    // 종단 신호를 기다린다 — 진행이면 `0d` 뒤에 4가 돌아 `sessions.db`가 서고, 취소면
    // 기동이 끝난다. 재프롬프트 갈래는 둘 다 오지 않는다.
    await waitFor(() => trial.settled() || trial.dbExists(), 2500);
    if (trial.dbExists()) return "PROCEED";
    if (trial.settled()) return "CANCEL";
    return "STAY";
  } finally {
    await trial.dispose();
  }
}

/**
 * 후보 알파벳 — ASCII 글자와 숫자. §2.1이 키를 정하지 않았으므로 후보를 넓게 잡되,
 * 아래 단정이 요구하는 것은 두 갈래가 각각 비어 있지 않고 서로 겹치지 않는다는 것이므로
 * 이 범위로 충분하다. 제어문자는 여기 넣지 않는다 — H 블록이 따로 든다.
 */
const CANDIDATE_KEYS: readonly string[] = (() => {
  const keys: string[] = [];
  for (let c = 0x30; c <= 0x39; c += 1) keys.push(String.fromCharCode(c)); // 0-9
  for (let c = 0x41; c <= 0x5a; c += 1) keys.push(String.fromCharCode(c)); // A-Z
  for (let c = 0x61; c <= 0x7a; c += 1) keys.push(String.fromCharCode(c)); // a-z
  return keys;
})();

let keyMapCache: Promise<KeyMap> | undefined;

function discoverKeys(): Promise<KeyMap> {
  keyMapCache ??= (async () => {
    const proceed: string[] = [];
    const cancel: string[] = [];
    const stay: string[] = [];
    const CONCURRENCY = 8;
    for (let i = 0; i < CANDIDATE_KEYS.length; i += CONCURRENCY) {
      const batch = CANDIDATE_KEYS.slice(i, i + CONCURRENCY);
      const outcomes = await Promise.all(batch.map((key) => classifyKey(key)));
      batch.forEach((key, index) => {
        const outcome = outcomes[index];
        if (outcome === "PROCEED") proceed.push(key);
        else if (outcome === "CANCEL") cancel.push(key);
        else stay.push(key);
      });
    }
    return { proceed, cancel, stay };
  })();
  return keyMapCache;
}

/* ============================================================================
 * A. 첫 기동의 판정 — sessions.db의 부재 하나뿐 (§2.1)
 * ========================================================================== */

describe("A. 판정 — sessions.db의 부재 하나뿐 (CLI-INTERFACE §2.1)", () => {
  /**
   * A-1·A-2는 한 쌍이다. §2의 열거가 `0`~`0b`에 건 문장은 "sessions.db가 없으면 알약 선택을
   * 묻는다"이고, 그 «묻는다»의 관측 가능한 형태는 **키를 주지 않으면 시퀀스가 4로 가지
   * 않는다**는 것이다. 문면을 안 보고 재는 방식이라 표시 세부에 걸리지 않는다.
   */
  it("A-1 sessions.db가 없으면 — 키를 주지 않는 한 4가 돌지 않는다", async () => {
    const trial = startTrial();
    await waitForGate(trial);

    await sleep(300);
    expect(trial.dbExists()).toBe(false);
    expect(trial.settled()).toBe(false);

    await trial.dispose();
  });

  it("A-2 sessions.db가 있으면 — 묻지 않는다 (키 없이 4가 돈다)", async () => {
    const trial = startTrial({ seed: seedReturningHome });

    // A-1과 같은 시간을 주고도 이쪽은 진행한다. 두 기동의 차이는 seed 하나뿐이다.
    const proceeded = await waitFor(() => storeOpened(trial));
    expect(proceeded).toBe(true);

    await trial.dispose();
  });

  /**
   * A-3 — §2.1은 디렉터리의 존재를 판정에 쓰지 않는다고 못박고, 근거로 크리덴셜 로더의
   * 실패 안내가 사용자에게 디렉터리를 직접 만들게 한다는 사실을 든다. 그 사용자가 관문을
   * 영영 못 보는 것이 이 배제가 막으려는 결과다.
   */
  it("A-3 디렉터리만 있고 sessions.db가 없으면 여전히 묻는다", async () => {
    const trial = startTrial({
      seed: (agentHome) => {
        mkdirSync(agentHome, { recursive: true, mode: 0o700 });
        chmodSync(agentHome, 0o700);
      },
    });
    await waitForGate(trial);

    await sleep(200);
    expect(trial.dbExists()).toBe(false);
    expect(trial.settled()).toBe(false);

    await trial.dispose();
  });

  /**
   * A-4 — §2.1 판정 소절의 마지막 불릿: 사용자가 그 파일을 지우면 다시 묻는다.
   *
   * **재는 것은 지웠다는 사실이지 없다는 사실이 아니다.** 새 홈에 다른 파일을 심으면
   * 그것은 A-3의 중복이고, `sessions.db`가 **있던 홈에서 그것이 지워진** 적이 한 번도
   * 없게 된다. 그래서 첫 시행이 실제로 연 루트를 둘째 시행에 그대로 넘긴다.
   *
   * 판정 재료가 `sessions.db` 하나뿐이라는 것은 홈에 다른 것이 남아 있어도 묻는다는
   * 것을 함의하고, 아래가 그것을 함께 잰다(`homeExists() === true`인 채 관문이 선다).
   * **홈에 무엇이 남았는지의 정체는 이 단정이 주장하지 않는다** — 첫 시행이 정상
   * 종료라 WAL 부산물의 잔존은 비결정적이고, 검증하지 않은 것을 주석에 적는 것이
   * 이 단정이 고친 결함과 같은 등급이다.
   */
  it("A-4 sessions.db를 지우면 다시 묻는다", async () => {
    const first = startTrial({ seed: seedReturningHome });
    expect(await waitFor(() => storeOpened(first))).toBe(true);
    await first.dispose();

    // 첫 시행이 연 그 홈에서 실제로 지운다. 삭제가 조용히 실패하면 아래 단정이
    // A-3으로 퇴화하므로 여기서 못박는다.
    rmSync(join(first.agentHome, "sessions.db"));
    expect(first.dbExists()).toBe(false);
    expect(first.homeExists()).toBe(true);

    // 같은 홈을 쓰되 파일만 없앤 상태 — 디렉터리는 남는다(A-3과 같은 모양).
    const second = startTrial({ root: first.root });
    expect(second.agentHome).toBe(first.agentHome);
    await waitForGate(second);
    await sleep(200);
    expect(second.dbExists()).toBe(false);
    expect(second.settled()).toBe(false);

    await second.dispose();
  });
});

/* ============================================================================
 * B. 자리 — `0a` 뒤·홈 생성(`0d`·4) 앞 (§2.1)
 *
 * **2026-09-08 개정 전 이 블록의 제목은 «3b 뒤·4 앞이 유일하다»였다.** 온보딩이 첫 실행
 * 경로를 통째로 앞으로 옮기면서(§2 `0`~`0d`) 관문의 자리가 `0b`가 됐고, §2.1 자리 소절의
 * 두 요구가 각각 옮겨졌다: 「홈을 만드는 지점보다 앞」의 그 지점이 **둘**(`0d`·4)이 됐고,
 * 「fail-closed 검증보다 뒤」의 그 검증이 **`0a`의 둘**로 좁혀졌다. **아래 넷이 재는 것은
 * 한 축도 안 바뀌었다** — B-3만 근거의 방향이 뒤집혔고 그 자리에서 그것을 든다.
 * ========================================================================== */

describe("B. 자리 — `0a` 뒤·홈 생성 앞 (CLI-INTERFACE §2.1)", () => {
  /**
   * B-1 — 홈 디렉터리를 만드는 지점은 `0d`와 4뿐이고 둘 다 관문보다 뒤이므로, 관문이
   * 서 있는 동안 그 디렉터리는 아직 없어야 한다. §2.1의 표현으로는 묻고 나서 만든다.
   */
  it("B-1 관문이 서 있는 동안 ~/.neo-agent/가 아직 없다 (`0d`·4보다 앞)", async () => {
    const trial = startTrial();
    await waitForGate(trial);

    expect(trial.homeExists()).toBe(false);

    await trial.dispose();
  });

  /**
   * B-2 — 크리덴셜 fail-closed가 관문보다 앞이라는 것. §2.1의 근거는 동의를 받아
   * 놓고 그 다음 단계에서 죽는 순서를 만들지 않는다는 것이다. 관측 형태는 키를 주지
   * 않았는데 기동이 실패로 끝난다는 것이고, A-1이 그 대비쌍이다(같은 조건에서 관문이 서면
   * 끝나지 않는다).
   *
   * **2026-09-08 — 이행 지점이 2에서 `0a`로 옮겨졌다.** §2.3이 §4의 로더를 「읽기」와
   * 「부재 판정」으로 가르면서 **600 fail-closed는 앞쪽에 남겼고**, 첫 실행 경로에서는
   * 그 앞쪽이 `0a`다. 재는 것도 붉어졌을 때 갈리는 것도 안 바뀐다 — 노출 비트를 가진
   * `credentials`는 관문을 보기 전에 기동을 끝낸다.
   */
  it("B-2 크리덴셜 권한 실패(`0a`)는 관문보다 앞에서 기동을 끝낸다", async () => {
    const trial = startTrial({
      seed: (agentHome) => {
        mkdirSync(agentHome, { recursive: true, mode: 0o700 });
        chmodSync(agentHome, 0o700);
        writeFileSync(join(agentHome, "credentials"), "ANTHROPIC_API_KEY=x\n");
        chmodSync(join(agentHome, "credentials"), 0o644);
      },
    });

    expect(await waitFor(() => trial.settled())).toBe(true);
    expect(trial.exitCode()).not.toBe(EXIT_OK);
    expect(trial.dbExists()).toBe(false);

    await trial.dispose();
  });

  /**
   * B-3 — **재는 방향이 2026-09-08에 뒤집혔다.** 개정 전 이 단정은 3b(메모리 로드)도 관문보다
   * 앞이라는 것을 재고 있었고, 그 근거는 관문이 `3c`(3b 뒤)에 서 있다는 것이었다.
   * §2.3이 관문을 `0b`로 옮기면서 그 문장이 **거짓**이 됐다 — 관문 앞에 서는 검증은
   * `0a`의 둘로 좁혀졌고(크리덴셜 노출 비트 · `config.json` 파싱·검증) **3b는 그 모집단
   * 밖**이다. 근거는 §2.3의 `0a` 소절이 이름으로 든다: 온보딩이 그 파일을 안 쓰므로
   * 「덮어쓴다」가 안 걸리고, 그 실패는 §2.1의 2026-08-22 불릿이 든 «관문 뒤 단계의
   * 실패»다.
   *
   * **그래서 이 자리는 그 대우를 잰다** — 같은 조건(메모리가 존재하는데 읽히지 않는 홈)에서
   * ① 관문이 **선다**(3b가 관문을 죽이지 않는다)이고 ② 관문과 `0c`를 지난 **뒤에** 그
   * 실패가 온다. 둘을 함께 두는 이유는 서로를 반증하기 때문이다: ①만 두면 3b가 아예 안
   * 불려도 그린이고, ②만 두면 관문이 그 앞에서 죽어도 그린이 될 수 있다.
   *
   * **붉어졌을 때 갈리는 것은 §2.3의 `0a` 모집단이다** — 3b가 관문 앞으로 돌아왔다면
   * 그 절이 좁힌 모집단이 깨진 것이고, 반대로 실패가 아예 안 오면 `MEMORY.md` §2.2의
   * «읽기 실패는 기동 실패»가 깨진 것이다.
   */
  it("B-3 메모리 읽기 실패(3b)는 관문보다 뒤다 — 관문이 먼저 선다", async () => {
    const keys = await discoverKeys();
    const trial = startTrial({
      seed: (agentHome) => {
        // 파일 자리에 디렉터리를 둔다 — 존재하는데 읽히지 않는 상태를 만든다.
        mkdirSync(join(agentHome, "memory", "MEMORY.md"), { recursive: true });
      },
    });

    // ① 관문이 선다 — `0a`가 이 상태를 재지 않으므로 여기서 죽지 않는다.
    await waitForGate(trial);
    await sleep(200);
    expect(trial.settled(), "3b의 실패가 관문 앞에서 기동을 끝냈다").toBe(false);
    expect(trial.dbExists()).toBe(false);

    // ② 관문과 `0c`를 지난 뒤에 그 실패가 온다.
    await driveGate(trial, pickKey(keys.proceed, "진행"));
    expect(await waitFor(() => trial.settled(), 5000)).toBe(true);
    expect(trial.exitCode()).not.toBe(EXIT_OK);
    expect(trial.dbExists(), "3b가 4보다 앞이므로 저장소는 열리지 않는다").toBe(false);

    await trial.dispose();
  }, 120_000);

  /**
   * B-4 — 설정 파싱 실패(`0a`)는 관문보다 앞이다. §2.1의 «`0a`보다 뒤여야 하는 이유»가
   * 그 요구를 든다 — 관문 앞에 fail-closed 검증이 서야 하고, 안 그러면 «동의를 받아
   * 놓고 그 다음 단계에서 죽는» 순서가 된다.
   *
   * **2026-09-08 개정 전 이 주석은 그 소절의 옛 이름(3b보다 뒤여야 하는 이유)을 인용하며 앞 단계의
   * 검증을 셋(크리덴셜 권한 · 설정 파싱 · 메모리 읽기)으로 들었다.** 그 소절이
   * §2.3(첫 실행 온보딩) 신설과 함께 개정되며 이행 지점이 `0a`로 옮겨졌고, 그
   * 모집단이 「온보딩이 덮어쓸 파일 둘」로 좁혀졌다 — 메모리는 그 밖이다(근거는 §2.3).
   * **이 단정이 재는 것은 안 바뀐다**: 설정 파싱 실패가 관문보다 앞이라는 것이고,
   * 그것은 옛 1에서도 새 `0a`에서도 참이다. B-2가 크리덴셜 쪽을 재고 이 단정이
   * 설정 쪽을 든다.
   *
   * 재는 것은 **파싱** 실패다 — 미지 키는 F-2가 드는 다른 축이므로 여기서는 JSON으로
   * 파싱될 수 없는 내용만 심고 키 이름을 쓰지 않는다.
   * §3의 «파싱 실패도 시작 시 에러»는 같은 사실의 다른 자리이므로 참조로만 든다.
   *
   * 대비쌍은 두 자리가 나눠 든다 — A-1(같은 조건에서 관문이 서면 기동이 끝나지
   * 않는다)과 F-2의 대비쌍(알려진 키를 담은 설정은 관문에 닿는다).
   */
  it("B-4 설정 파싱 실패(`0a`)는 관문보다 앞에서 기동을 끝낸다", async () => {
    const trial = startTrial({
      seed: (agentHome) => {
        mkdirSync(agentHome, { recursive: true, mode: 0o700 });
        chmodSync(agentHome, 0o700);
        writeFileSync(join(agentHome, "config.json"), "{", { mode: 0o600 });
      },
    });

    expect(await waitFor(() => trial.settled())).toBe(true);
    expect(trial.exitCode()).not.toBe(EXIT_OK);
    expect(trial.dbExists()).toBe(false);

    await trial.dispose();
  });
});

/* ============================================================================
 * C. 선택의 귀결 (§2.1)
 * ========================================================================== */

describe("C. 선택의 귀결 (CLI-INTERFACE §2.1)", () => {
  it("C-1 진행 갈래와 취소 갈래가 각각 서고 서로 겹치지 않는다 (닫힌 둘)", async () => {
    const keys = await discoverKeys();

    expect(keys.proceed.length).toBeGreaterThan(0);
    expect(keys.cancel.length).toBeGreaterThan(0);
    // 부류가 배타적으로 갈렸다 — 같은 키가 두 부류에 들 수 없다.
    const overlap = keys.proceed.filter((key) => keys.cancel.includes(key));
    expect(overlap).toEqual([]);
    // 셋을 합치면 후보 전량이다 — 분류되지 않고 샌 키가 없다는 것.
    expect(keys.proceed.length + keys.cancel.length + keys.stay.length).toBe(CANDIDATE_KEYS.length);
    // 그리고 «나중에» 같은 셋째 귀결이 없다 — 유효 응답은 진행 아니면 취소뿐이다.
    expect(keys.stay.length).toBeGreaterThan(0);
  }, 120_000);

  /**
   * C-2 — §2.1 귀결 표의 Red Pill 행: *"4로 진행한다"*. **2026-09-08 — 그 진행의 경로에
   * `0c`·`0d`가 들어왔다**(§2·§2.3). 재는 것은 그대로 계속을 고르면 4가 돈다는 것이고, 그
   * 사이에 온보딩의 답 하나가 든다.
   */
  it("C-2 Red Pill 갈래 — `0c`를 지나 4로 진행해 sessions.db가 생긴다", async () => {
    const keys = await discoverKeys();
    const trial = startTrial();
    await waitForGate(trial);

    await driveGate(trial, pickKey(keys.proceed, "진행"));
    expect(await waitFor(() => trial.dbExists())).toBe(true);

    await trial.dispose();
  }, 120_000);

  it("C-3 Blue Pill 갈래 — 아무것도 만들지 않고 종료 코드 0", async () => {
    const keys = await discoverKeys();
    const trial = startTrial();
    await waitForGate(trial);

    trial.write(pickKey(keys.cancel, "취소"));
    expect(await waitFor(() => trial.settled())).toBe(true);

    // §2.1이 이 관문의 유일한 새 계약이라 부른 그 검사다.
    expect(trial.homeExists()).toBe(false);
    expect(trial.exitCode()).toBe(EXIT_OK);

    await trial.dispose();
  }, 120_000);

  it("C-4 Blue Pill — 이미 있던 디렉터리의 내용이 그대로다", async () => {
    const keys = await discoverKeys();
    const trial = startTrial({
      seed: (agentHome) => {
        mkdirSync(agentHome, { recursive: true, mode: 0o700 });
        chmodSync(agentHome, 0o700);
        writeFileSync(join(agentHome, "allowlist"), "shell:qa-marker\n", { mode: 0o600 });
      },
    });
    await waitForGate(trial);

    trial.write(pickKey(keys.cancel, "취소"));
    expect(await waitFor(() => trial.settled())).toBe(true);

    expect(trial.entries()).toEqual(["allowlist"]);
    // 주입한 데이터가 그대로 남았는가 — 내용까지 본다.
    expect(readFileSync(join(trial.agentHome, "allowlist"), "utf8")).toBe("shell:qa-marker\n");
    expect(trial.exitCode()).toBe(EXIT_OK);

    await trial.dispose();
  }, 120_000);

  /**
   * C-5 — §2.1: 기본 선택을 두지 않는다. 근거는 Enter 한 번에 지나가면 명확한 의사가
   * 아니라는 것이므로, 재는 것은 Enter가 두 갈래 어느 쪽도 아니라는 것이다.
   */
  it("C-5 Enter는 어느 갈래도 아니다 (기본 선택 없음)", async () => {
    for (const key of ["\r", "\n"]) {
      const trial = startTrial();
      await waitForGate(trial);

      trial.write(key);
      await sleep(300);

      expect(trial.dbExists()).toBe(false);
      expect(trial.settled()).toBe(false);

      await trial.dispose();
    }
  });

  /** C-6 — 무효 키가 침묵하지 않는다(§2.6). 문면이 아니라 출력의 유무를 잰다 */
  it("C-6 무효 키는 침묵하지 않는다", async () => {
    const keys = await discoverKeys();
    const trial = startTrial();
    await waitForGate(trial);

    const before = trial.outputLength();
    trial.write(pickKey(keys.stay, "재프롬프트"));
    expect(await waitFor(() => trial.outputLength() > before, 1000)).toBe(true);

    await trial.dispose();
  }, 120_000);

  /**
   * 종단 신호 뒤, 델타를 자르기 전에 두는 플러시 유예. 확인 표시는 종단보다 **먼저**
   * 싱크에 쓰인다 — §2.1이 «관문은 자기가 무엇으로 읽었는지를 알린 뒤에만 다음으로
   * 간다»로 그 순서를 계약에 담았다. 그런데 싱크는 스트림이라 그 청크가 수집 배열에
   * 닿는 것은 한 틱 뒤이고, 종단 신호는 파일 시스템(`dbExists`)과 프로미스(`settled`)로
   * 오므로 두 축이 갈린다. **유예 없이 자르면 긍정 축이 경합으로 붉어진다** — 부정
   * 축은 델타가 짧을수록 참이라 이 경합에 안전했고, 그래서 오늘까지 드러나지 않았다.
   * 조건으로 기다린 뒤 한 프레임을 더 주는 것은 `waitForGate`가 쓰는 것과 같은 수단이고
   * 근거도 같다 — 문면이 여러 청크로 나뉘어 나가는 구현을 배제하지 않는다.
   */
  async function deltaAfterFlush(trial: Trial, mark: number): Promise<string> {
    await waitFor(() => trial.output().length > mark, 1000);
    await sleep(30);
    return trial.output().slice(mark);
  }

  /**
   * C-7 — 라벨↔값 대응과 확인 표시의 존재. §2.1 귀결 표가 화면의 이름 둘을 값 둘에
   * 붙이고 그 표가 그 대응의 정본이라고 못박았다. C-1~C-6은 결과의 **부류**만 가르므로,
   * 화면에 보이는 이름이 실제로 고른 쪽과 맞는지는 어느 단정도 재지 않았다 — 둘을
   * 맞바꿔도 전부 그린이었다.
   *
   * 측정의 형태 넷:
   *
   * 1. **델타에서 잰다.** 관문 문면은 두 이름을 **모두** 들고 있으므로 전체 출력으로는
   *    맞바꿈이 잡히지 않는다. 키를 넣기 직전에 `output().length`(**문자 오프셋**)를
   *    잡고 그 뒤에 붙은 부분만 본다. `outputLength()`는 청크 수이므로 그 값으로
   *    자르면 관문 프롬프트가 델타에 섞여 들어온다.
   * 2. **부류는 발견해서 쓴다** — §2.1의 «계약 표면은 키를 알지 않는다» 그대로다.
   * 3. **단정은 부정 쌍과 긍정 쌍 둘 다다.** §2.1 «선택의 귀결» 소절이 2026-08-22에
   *    선택 뒤 확인 표시의 **존재**를 계약으로 올렸다 — 정한 것은 존재 하나뿐이고
   *    («계약으로 올리는 것은 존재 하나뿐이다») 문면·색·자리는 그 판정이 건드리지 않은
   *    §12 위임 세부로 남는다. 재는 방식까지 그 절이 §7 말미의 기준으로 이름지었으므로
   *    그대로 쓴다: **구별**(«그 확인이 고르지 않은 쪽의 이름을 담지 않는가»)과
   *    **비침묵**(«고른 갈래의 확인이 비어 있지 않은가»). 두 축을 함께 두는 이유는 서로를
   *    반증하기 때문이다 — 부정 쌍만 두면 확인이 통째로 사라져도 그린이고, 긍정 쌍만
   *    두면 두 이름을 다 뱉는 확인이 그린이 된다.
   *
   *    **등급은 한 갈래다.** 확인이 통째로 사라지는 것은 이름이 뒤바뀐 것과 «같은 등급의
   *    계약 위반»이라고 그 소절이 못박았다 — 사용자가 읽은 것과 실제로 일어난 일이
   *    갈린다는 결과가 같기 때문이다. 그래서 이 단정은 실패했을 때 두 갈래로 읽히지
   *    않는다.
   * 4. **자르기 전에 플러시 유예를 둔다** — 바로 위 `deltaAfterFlush`가 그 근거를 든다.
   *
   * **2026-09-08 — 진행 갈래의 델타에 `0c`의 출력이 함께 든다.** 구간의 상한은 계약이
   * 아니므로(§2.1 «선택을 읽은 뒤 관문이 내는 출력»의 2026-09-07 해소) 넓어지는 것 자체는
   * 허용되고, 넓혀서 헐거워지는 것은 비침묵 축 하나다. 그 몫은 구별 축이 진다 — 알약
   * 어휘는 관문 문면에만 사는 층이므로(`LORE.md` §6) 고른 쪽 이름의 존재가 관문이 이 구간에서
   * 말했다는 증거이고, 고르지 않은 쪽 이름의 부재는 `0c`가 그것을 말하지
   * 않는다는 것까지 함께 잰다.
   *
   * 대소문자와 사이 공백은 표시 세부이므로 느슨하게 잰다. 이름 뒤에 붙는 설명은
   * 고정하지 않는다. 긍정 승격도 **새 리터럴을 늘리지 않는다** — 부정 쌍이 쓰던 정규식
   * 둘을 그대로 반대 방향으로 읽을 뿐이고, 그 둘은 귀결 표가 스스로 계약으로 올린
   * 화면의 이름이다(파일 머리 예외 2).
   */
  it("C-7 선택 뒤의 확인이 고른 쪽의 이름을 담고 다른 쪽의 이름을 담지 않는다 (라벨↔값 대응)", async () => {
    const keys = await discoverKeys();
    const RED = /red\s*pill/i;
    const BLUE = /blue\s*pill/i;

    const proceeding = startTrial();
    await waitForGate(proceeding);
    const proceedMark = proceeding.output().length;
    await driveGate(proceeding, pickKey(keys.proceed, "진행"));
    expect(await waitFor(() => proceeding.dbExists())).toBe(true);
    const proceedDelta = await deltaAfterFlush(proceeding, proceedMark);
    await proceeding.dispose();

    const cancelling = startTrial();
    await waitForGate(cancelling);
    const cancelMark = cancelling.output().length;
    cancelling.write(pickKey(keys.cancel, "취소"));
    expect(await waitFor(() => cancelling.settled())).toBe(true);
    const cancelDelta = await deltaAfterFlush(cancelling, cancelMark);
    await cancelling.dispose();

    // 구별 — 고른 갈래의 확인이 고르지 않은 쪽의 이름을 담지 않는다.
    expect(BLUE.test(proceedDelta)).toBe(false);
    expect(RED.test(cancelDelta)).toBe(false);
    // 비침묵 — 고른 갈래의 확인이 비어 있지 않다(존재가 계약이다).
    expect(RED.test(proceedDelta)).toBe(true);
    expect(BLUE.test(cancelDelta)).toBe(true);
  }, 120_000);
});

/* ============================================================================
 * D. 새 영속 상태를 만들지 않는다 (§2.1 — 별도 동의 파일을 두지 않는다)
 * ========================================================================== */

describe("D. 동의를 기록하는 새 상태가 없다 (CLI-INTERFACE §2.1)", () => {
  /**
   * 관문을 지난 기동이 남긴 항목 집합이, 관문을 **아예 지나지 않은** 기동이 남긴 항목
   * 집합보다 무엇이 더 많은가. 동의 파일이 생겼다면 앞쪽에만 있는 항목으로 나타난다.
   * 이름을 미리 알 필요가 없다는 것이 이 방식을 고른 이유다.
   *
   * **2026-09-08 — 차집합이 빈 집합에서 `0d`의 산출물로 바뀐다.** 첫 실행 경로가
   * `0d`(온보딩 영속화)를 얻으면서 그 갈래에만 `config.json`이 선다(§2·§2.3). 그것은
   * 동의의 기록이 아니라 사용자가 답한 값의 저장이므로 §2.1이 금한 형태가 아니다 —
   * 그 절이 배제한 것은 «동의를 기록하는 새 상태»다.
   *
   * **그래서 단정이 부정에서 등식으로 승격한다.** 「비어 있다」를 「정확히 이 하나다」로
   * 바꾸면 동의 파일이 하나 더 생기는 경우가 여전히 붉고, `0d`가 안 도는 경우도 붉는다.
   * 이름은 여전히 이 파일이 짓지 않는다 — 경로 함수에서 파생한다(E-2와 같은 규율).
   *
   * **`credentials`가 그 차집합에 없는 것도 계약이다** — 이 파일의 시행은 키 둘을 env로
   * 주므로 온보딩이 그 둘을 **안 받았고**, §2.3은 받은 값만 얹는다(*"`OnboardingValues`의
   * 두 키가 옵셔널인 이유"*). 그 파일이 여기 나타나면 env의 시크릿이 파일로 복사된
   * 것이고, 같은 소절이 이름으로 금지한 형태다.
   */
  it("D-1 Red Pill 뒤의 홈이 returning 기동의 홈보다 `0d`의 산출물만큼만 는다", async () => {
    const keys = await discoverKeys();

    const gated = startTrial();
    await waitForGate(gated);
    await driveGate(gated, pickKey(keys.proceed, "진행"));
    expect(await waitFor(() => gated.dbExists())).toBe(true);
    await gated.dispose();
    const gatedEntries = gated.entries() ?? [];

    const returning = startTrial({ seed: seedReturningHome });
    expect(await waitFor(() => storeOpened(returning))).toBe(true);
    await returning.dispose();
    const returningEntries = returning.entries() ?? [];

    expect(gatedEntries.length).toBeGreaterThan(0);
    const extra = gatedEntries.filter((entry) => !returningEntries.includes(entry));
    expect(extra).toEqual([basename(defaultConfigPath(gated.home))]);
  }, 120_000);
});

/* ============================================================================
 * E. 문면 — 사실을 대체하지 않고 감싼다 (§2.1)
 * ========================================================================== */

describe("E. 문면 셋 (CLI-INTERFACE §2.1)", () => {
  /**
   * E-1 — 경로. **주입 데이터 확인**이다: 이 파일이 준 홈 경로가 그대로 문면에 나타나는가.
   * **표기 형태는 계약 밖이 아니다** — §2.1 문면 소절의 `K-219` 처분(2026-08-21)이 ①을
   * 리터럴 `~/.neo-agent/`가 **아닌 것**으로 못박았고, 그 근거 둘 중 하나가 실제 경로여야
   * 검사가 주입한 홈으로 대조할 수 있다는 것이다. 아래 단정이 재는 것이 정확히 그 대조다 —
   * 틸데는 어느 홈에서 찍어도 같은 글자라 주입한 절대 경로를 만족시키지 못한다.
   */
  it("E-1 문면에 경로가 있다", async () => {
    const trial = startTrial();
    await waitForGate(trial);

    expect(trial.output()).toContain(trial.agentHome);

    await trial.dispose();
  });

  /**
   * E-2 — 무엇이 생기는가. §2.1 문면 소절이 넷을 이름으로 들고(세션 기록·설정·승인
   * allowlist·메모리), 바로 아래 불릿이 그 넷을 **파일·디렉터리 이름과 함께** 내라고
   * 요구한다. **낱말과 이름은 서로 다른 축이고 요구는 둘 다이므로 AND로 잰다** —
   * 어느 한쪽만 재면 다른 쪽이 문면에서 통째로 사라져도 그린이 된다.
   *
   * 두 축의 규율이 갈린다:
   *
   * - **낱말 축**은 여전히 세부다. 그 절이 어떤 표기를 쓰라고 정하지 않았으므로
   *   개념마다 관용 집합을 두고 하나라도 있으면 적합으로 친다.
   * - **이름 축은 리터럴을 박지 않는다.** 같은 불릿이 자기 밖으로 위임했기 때문이다 —
   *   «이름의 정본은 각 경로 함수이지 이 절이 아니다». 그래서 네 이름을 계약으로 올린
   *   §2.1 문장은 존재하지 않는다. 리터럴을 박으면 근거 주석이 거짓이 되고, 경로 함수가
   *   개명되는 날 §2.1 위반이 아닌 이유로 이 파일이 붉어진다. **경로 함수 넷에서
   *   파생한다** — 위임을 따르는 것이 그 요구를 문자 그대로 재는 유일한 형태다.
   *   위임된 정본이 하나이므로 이쪽에는 관용 집합을 두지 않는다.
   *
   * **두 축의 분리를 부분 문자열로는 못 만든다 — 낱말을 지운 뒤에 이름을 찾는다.**
   * 낱말 라벨이 이름을 글자로 품는 자리가 있어서(`승인 allowlist` ⊃ `allowlist`)
   * 그냥 찾으면 이름 열이 통째로 없어도 라벨만으로 이름 축이 통과한다. 그래서 개념의
   * 낱말 토큰을 긴 것부터 전부 지운 문자열에서 이름을 찾고, 그 문자열은 이 판정에만
   * 쓰고 버린다.
   *
   * 이름 축에 슬래시를 요구하지 않는다 — `basename`이 내는 값에 슬래시가 없고,
   * 디렉터리 표기의 슬래시는 §12가 위임한 표시 세부다. 실패 목록은 **어느 축이
   * 빠졌는지**를 함께 든다(`ARCHITECTURE.md` §2.6 — 붉어졌을 때 원인을 잘못 가리키는
   * 형태를 만들지 않는다).
   */
  it("E-2 문면에 무엇이 생기는지가 있다 (넷 — 낱말과 이름)", async () => {
    const trial = startTrial();
    await waitForGate(trial);
    const text = trial.output();

    const concepts: readonly (readonly [string, string, readonly string[]])[] = [
      ["세션 기록", basename(defaultDatabasePath(trial.home)), ["세션 기록", "세션"]],
      ["설정", basename(defaultConfigPath(trial.home)), ["설정"]],
      [
        "승인 allowlist",
        basename(defaultAllowlistPath(trial.home)),
        ["승인 allowlist", "승인 목록", "승인"],
      ],
      ["메모리", basename(defaultMemoryDir(trial.home)), ["메모리"]],
    ];

    const missing: string[] = [];
    for (const [concept, name, words] of concepts) {
      if (!words.some((word) => text.includes(word))) missing.push(`${concept}(낱말)`);
      const stripped = [...words]
        .sort((a, b) => b.length - a.length)
        .reduce((rest, word) => rest.split(word).join(""), text);
      if (!stripped.includes(name)) missing.push(`${concept}(이름)`);
    }
    expect(missing).toEqual([]);

    await trial.dispose();
  });

  /** E-3 — 취소하면 아무것도 생기지 않는다는 사실. 같은 관용 규율로 잰다 */
  it("E-3 문면에 취소하면 아무것도 생기지 않는다는 사실이 있다", async () => {
    const trial = startTrial();
    await waitForGate(trial);
    const text = trial.output();

    expect(text).toContain("취소");
    expect(/아무것도\s*(생기지|만들지)/.test(text)).toBe(true);

    await trial.dispose();
  });

  /**
   * E-4 — 대비쌍. E-1~E-3의 단정들이 문면이 늘 거기 있어서 참이 되는 경우를 배제한다:
   * returning 기동에서는 같은 값이 나타나지 않아야 한다.
   */
  it("E-4 returning 기동에는 관문 문면이 나타나지 않는다", async () => {
    const gated = startTrial();
    await waitForGate(gated);
    const gatedText = gated.output();
    await gated.dispose();

    const returning = startTrial({ seed: seedReturningHome });
    expect(await waitFor(() => storeOpened(returning))).toBe(true);
    await sleep(120);
    const returningText = returning.output();
    await returning.dispose();

    // 같은 축을 두 상태에서 잰다 — 관문의 문면은 첫 기동에만 있다.
    expect(gatedText.length).toBeGreaterThan(0);
    expect(/아무것도\s*(생기지|만들지)/.test(gatedText)).toBe(true);
    expect(/아무것도\s*(생기지|만들지)/.test(returningText)).toBe(false);
  });
});

/* ============================================================================
 * F. 비용 상한 — 성장 형태 넷 (§2.1)
 *
 * **이 블록은 상한의 «값»을 재지 않는다.** 재는 것은 그 절이 이름으로 든 성장 형태 —
 * 우회 플래그(F-1) · 설정 항목(F-2) · 재표시·되돌리기 명령(F-3) — 이고, 값(화면·분기의 수)은
 * 문면이지 이 축의 대상이 아니다. 2026-09-08에 그 값이 «한 프롬프트·한 분기»에서
 * «세 화면·한 분기·영속 상태 0»으로 개정됐을 때 **아래 단정이 한 줄도 안 바뀐 것**이
 * 그 구분의 실증이다 — 형태 넷은 그 개정에서 그대로였다.
 * ========================================================================== */

describe("F. 비용 상한 (CLI-INTERFACE §2.1)", () => {
  /**
   * F-1 — 우회 플래그가 붙으면 이 절의 개정이 선행이므로, 오늘의 argv 닫힌 목록에는
   * 그런 플래그가 없어야 한다. §5의 닫힌 목록 밖은 사용법 에러다.
   */
  it("F-1 우회 플래그가 없다", () => {
    for (const flag of ["--yes", "-y", "--force", "--no-first-run", "--accept", "--red-pill"]) {
      expect(() => parseArgs([flag])).toThrow();
    }
    // 대비쌍 — 닫힌 목록 안의 것은 던지지 않는다. 위 단정이 «parseArgs가 늘 던져서»
    // 참이 되는 경우를 배제한다.
    expect(() => parseArgs([])).not.toThrow();
    expect(() => parseArgs(["--help"])).not.toThrow();
  });

  /** F-2 — 설정 항목이 되지 않았다. §3의 미지 키는 시작 에러다 */
  it("F-2 설정 항목이 없다", async () => {
    for (const key of ["firstRun", "pill", "firstRunGate", "skipFirstRun"]) {
      const trial = startTrial({
        seed: (agentHome) => {
          mkdirSync(agentHome, { recursive: true, mode: 0o700 });
          chmodSync(agentHome, 0o700);
          writeFileSync(join(agentHome, "config.json"), JSON.stringify({ [key]: false }));
        },
      });
      expect(await waitFor(() => trial.settled())).toBe(true);
      expect(trial.exitCode()).not.toBe(EXIT_OK);
      await trial.dispose();
    }

    // 대비쌍 — 위 넷이 설정 로딩이 통째로 깨져서 참이 되는 경우를 배제한다(F-1이
    // 같은 블록에서 쓰는 규율이다). 알려진 키를 담은 설정은 파싱을 통과해 관문에
    // 닿는다. 키와 값은 §3 표의 것이고 **기본값과 같은 값**을 준다 — 다른 계약의
    // 동작을 흔들지 않으면서 파싱을 통과한다는 것만 재기 위해서다. 첫 기동 상태로
    // 세운다: 관문이 서는 것 자체가 앞 단계를 통과했다는 관측이다.
    const known = startTrial({
      seed: (agentHome) => {
        mkdirSync(agentHome, { recursive: true, mode: 0o700 });
        chmodSync(agentHome, 0o700);
        writeFileSync(join(agentHome, "config.json"), JSON.stringify({ approvalMode: "manual" }));
      },
    });
    await waitForGate(known);
    expect(known.settled()).toBe(false);
    await known.dispose();
  }, 30_000);

  /**
   * F-3 — 재표시·되돌리기 명령이 생기지 않았다. §5의 MVP 명령 집합은 닫힌 목록이고
   * 이 관문은 그 목록에 아무것도 더하지 않았다.
   */
  it("F-3 재표시·되돌리기 슬래시 명령이 없다", () => {
    const names = SLASH_COMMANDS.map((command) => command.name).sort();
    expect(names).toEqual(
      [
        "/compact",
        // §5 표에 2026-09-05 추가 — `/config`(설정 조회·변경, 계약 정본은 §3.2).
        // **이 축이 재는 것은 관문이 목록을 넓혔는가이지 목록의 크기가 아니다** —
        // 문서 개정으로 들어온 명령은 여기에도 따라 오르고, 그래야 아래 별칭 단정과
        // 함께 관문이 아무것도 더하지 않았다는 사실이 계속 관측된다
        "/config",
        "/delete",
        "/exit",
        "/help",
        "/memory",
        "/new",
        "/resume",
        "/search",
        "/sessions",
      ].sort(),
    );
    const aliases = SLASH_COMMANDS.flatMap((command) => [...(command.aliases ?? [])]);
    expect(aliases.filter((alias) => /pill|first|reset/i.test(alias))).toEqual([]);
  });
});

/* ============================================================================
 * G. serve 갈래 (§2.1)
 * ========================================================================== */

describe("G. serve 갈래 (CLI-INTERFACE §2.1)", () => {
  /**
   * **이 자리의 감시선이 두 번 옮겨졌고 이제 여기서 닫힌다** (2026-08-26).
   *
   * 최초의 G-1은 argv 닫힌 목록에 `serve`가 없다는 것을 단정해 경로의 착지를 감시했고
   * **설계대로 붉어졌다** — §5가 `neo-agent serve`를 닫힌 목록에 들이면서다(2026-08-25).
   * 그 자리에 들어온 G-2는 `packages/cli/src/serve.ts`의 **부재**를 감시해 배선의 착지를
   * 기다렸고, 같은 사이클에서 그 파일이 서면서 역시 설계대로 붉어졌다.
   *
   * **그래서 G-2를 지운 것이 아니라 옮긴 것이다.** §2.1이 넘긴 판정(`serve`는 `sessions.db`
   * 없이 기동하지 않는다)의 이행처는 `WEB-UI.md` §3.1의 존재 검사이고, 그 검사를 실제로
   * 구동하는 단정이 `serve.integration.test.ts`에 섰다(S-4·S-8). 감시선이 기다리던 대상이
   * 생겼으므로 감시선 자신은 여기서 닫힌다 — 남겨 두면 항상 붉거나, 조건을 뒤집어 놓고
   * **재는 대상이 없는 그린**이 된다.
   *
   * 아래 G-1이 재는 것은 그 이행처의 **전제**다: 파서가 다른 갈래를 실제로 낸다는 것.
   */
  it("G-1 argv 닫힌 목록에 serve가 들어왔다 — 구별되는 갈래가 실재한다 (§5)", () => {
    // 전제의 부재를 재던 단정의 자리. 이제 재는 것은 **전제의 실재**다.
    expect(() => parseArgs(["serve"])).not.toThrow();
    expect(JSON.stringify(parseArgs(["serve"]))).not.toBe(JSON.stringify(parseArgs([])));
  });
});

/* ============================================================================
 * H. 중단 입력 셋 — EOF와 제어문자의 해석 (§2.1 중단 입력과 응답 키 소절)
 *
 * **이 자리는 더 이상 회색지대가 아니다.** §2.1의 중단 입력과 응답 키 소절(2026-08-21
 * `K-220` 해소)이 중단 입력 셋(Ctrl+C · Ctrl+D · 입력 스트림 종료)을 Blue Pill과 같은
 * 귀결로 못박았다 — 종료 코드 0, 홈 미생성. 그 소절이 근거 넷을 함께 든다.
 *
 * §9의 반대 규율(EOF에 뜻을 주지 않는다)이 뒤집힌 것이 아니라 모집단이 다르다 —
 * 관문은 §8 상태 머신 밖의 `0b`이고, 취소 갈래가 남기는 상태가 0이다. §9는 개정되지
 * 않으므로 새 프롬프트의 기본값은 여전히 그쪽이다.
 * ========================================================================== */

/**
 * 셋 — 스트림 EOF(키 없이 입력이 닫힘)·Ctrl+D(U+0004)·Ctrl+C(U+0003).
 * `undefined`가 EOF 갈래다.
 */
const CONTROL_PROBES: readonly (string | undefined)[] = [undefined, "\u0004", "\u0003"];

describe("H. 중단 입력 셋 — EOF·제어문자 (CLI-INTERFACE §2.1)", () => {
  it("H-1 EOF·Ctrl+D·Ctrl+C 어느 것도 홈에 상태를 만들지 않는다", async () => {
    for (const key of CONTROL_PROBES) {
      const trial = startTrial();
      await waitForGate(trial);

      if (key === undefined) trial.endInput();
      else trial.write(key);
      await waitFor(() => trial.settled(), 1000);
      await sleep(120);

      expect(trial.dbExists()).toBe(false);
      expect(trial.homeExists()).toBe(false);

      await trial.dispose();
    }
  }, 30_000);

  /**
   * H-2 — 셋 다 취소 갈래로 해석되어 종료 코드 0으로 끝난다. **이 단정은 계약을 잰다** —
   * §2.1의 중단 입력과 응답 키 소절이 셋의 귀결을 Blue Pill과 같게 못박았고, 종료 코드 0은
   * 같은 절의 귀결 표가 취소에 붙인 값이다(취소는 실패가 아니다 — `LORE.md` §5.4).
   * 붉어지면 오늘의 동작이 바뀐 것이 아니라 **계약이 깨진 것**이다.
   *
   * **다만 이 단정이 그 계약을 단독으로 온전히 재지는 않는다.** 그 소절이 못박은 귀결은
   * 종료 코드 0 **과** 홈 미생성 둘이고, 아래가 재는 것은 앞의 하나뿐이다. 나머지 절반은
   * 바로 위 H-1이 든다 — **두 단정이 한 계약을 나눠 든다.** 그래서 H-1이 지워지거나 그
   * 조건이 좁아지면 이 선언의 절반이 근거를 잃는다 — 종료 코드만 남으면 홈을 만들어
   * 놓고 0으로 끝나는 구현이 여기서 그린이 된다.
   */
  it("H-2 셋 다 취소로 해석되어 종료 코드 0이다", async () => {
    for (const key of CONTROL_PROBES) {
      const trial = startTrial();
      await waitForGate(trial);

      if (key === undefined) trial.endInput();
      else trial.write(key);
      expect(await waitFor(() => trial.settled(), 1500)).toBe(true);
      expect(trial.exitCode()).toBe(EXIT_OK);

      await trial.dispose();
    }
  }, 30_000);
});
