/**
 * 첫 기동 관문 독립 검증 — `docs/CLI-INTERFACE.md` §2.1 (부수: §2 시작 시퀀스 열거).
 *
 * **기대값은 §2.1과 §2에서만 뽑았다.** 이 파일을 쓰는 동안 `src/first-run.ts`와
 * `src/wiring.ts`의 3c 블록은 열지 않았다 — 구현을 읽고 나서 기대값을 적으면 그것은
 * 구현의 재서술이지 검증이 아니다. 여는 문(門)은 `runCli` 하나이고, 나머지는 전부
 * 파일 시스템·종료 코드·출력이라는 **관측 가능한 결과**다.
 *
 * **응답 키를 아는 단정을 쓰지 않는다.** §2.1은 선택지를 닫힌 둘로 정하면서 어느 키가
 * 어느 쪽인지는 정하지 않았고, §9가 응답 키를 구현 세부로 두고 §12가 표시 세부를 위임한다.
 * 그래서 이 파일은 키를 **찾아낸다** — 후보 알파벳을 하나씩 넣어 보고 그 결과를 세
 * 부류(진행 / 취소 / 재프롬프트)로 가른 뒤, 그 부류 위에서만 단정한다. 선례는 같은
 * 디렉터리의 `approval-ui.contract.test.ts`가 응답 키를 미규정으로 두고 간 규율이다.
 *
 * **문면을 리터럴로 고정하지 않는다**(§7 말미의 기준). 이 파일의 리터럴은 두 갈래뿐이다
 * — 테스트가 주입한 데이터(홈 경로)가 그대로 통과했는지 확인하는 단정이거나, 같은 값의
 * 있음과 없음을 서로 다른 상태에서 재는 대비쌍이다. 예외가 하나 있고 그 자리는 §2.1이
 * 스스로 문면의 내용을 계약으로 올린 자리다 — 문면에 반드시 있어야 할 셋을 그 절이
 * 이름으로 들었으므로, 그 셋의 유무를 재는 것은 테스트가 세부를 계약으로 굳히는 것이
 * 아니라 이미 계약인 것을 재는 것이다. 다만 **정확한 낱말은 여전히 세부이므로** 개념마다
 * 여러 표기를 허용하는 관용 집합으로 잰다.
 *
 * 대조한 계약 항목 열넷 — 등급과 재현은 `plans/20260821-firstrun-gate-qa-report.md`가 든다.
 *
 *   A. 판정은 sessions.db의 부재 하나뿐   (A-1 ~ A-4)
 *   B. 자리 — 3b 뒤·4 앞                  (B-1 ~ B-3)
 *   C. 선택의 귀결 — 닫힌 둘·기본 선택 없음 (C-1 ~ C-6)
 *   D. 새 영속 상태를 만들지 않는다        (D-1)
 *   E. 문면 셋                            (E-1 ~ E-4)
 *   F. 비용 상한 — 한 프롬프트·한 분기      (F-1 ~ F-3)
 *   G. serve 갈래                         (G-1)
 *   H. [미규정] EOF·제어문자의 해석         (H-1 ~ H-2)
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
import { join } from "node:path";
import { PassThrough } from "node:stream";
import type { ModelClient, ModelStreamEvent } from "@neo-agent/core";
import { afterEach, describe, expect, it } from "vitest";
import { parseArgs } from "../src/args.ts";
import { API_KEY_ENV } from "../src/credentials.ts";
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
}

interface Trial {
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
  const root = mkdtempSync(join(tmpdir(), "neo-firstrun-qa-"));
  roots.push(root);
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
    env: { [API_KEY_ENV]: "firstrun-qa-key" },
    cwd: workspace,
    home,
    io: { input, output },
    version: "0.0.0-firstrun-qa",
    factories: {
      // 5b의 Docker 판정을 명시 주입한다 — 생략하면 실제 `docker version`이 스폰된다
      // (`./probe-docker.ts`가 그 규율의 정본 서술을 든다).
      probeDocker: async () => ({ available: false, reason: "firstrun-qa: 판정 주입" }),
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
 *   PROCEED  — 시작 시퀀스 4가 돌았다 (`sessions.db`가 생겼다)
 *   CANCEL   — 기동이 끝났는데 홈에 아무것도 없다
 *   STAY     — 둘 다 아니다 (관문이 그대로 서 있다)
 *
 * 세 부류의 이름은 §2.1의 표가 든 두 귀결과 그 절의 «기본 선택을 두지 않는다»에서 나온다.
 * **어느 문자가 어디 드는지는 이 파일이 정하지 않는다** — 그것을 정하는 순간 §12가 세부로
 * 위임한 것을 테스트가 계약으로 굳힌다.
 * ========================================================================== */

type Outcome = "PROCEED" | "CANCEL" | "STAY";

interface KeyMap {
  readonly proceed: readonly string[];
  readonly cancel: readonly string[];
  readonly stay: readonly string[];
}

async function classifyKey(key: string): Promise<Outcome> {
  const trial = startTrial();
  try {
    await waitForGate(trial);
    const before = trial.outputLength();
    trial.write(key);
    // 종단 신호(진행·취소) 또는 비침묵 신호(재프롬프트 출력) 중 먼저 오는 것을 잡는다.
    await waitFor(() => trial.settled() || trial.dbExists() || trial.outputLength() > before, 1500);
    // 비침묵 신호가 먼저 왔을 수 있으므로 종단 신호에 유예를 준다.
    await waitFor(() => trial.settled() || trial.dbExists(), 250);
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
   * A-1·A-2는 한 쌍이다. §2의 열거가 3c에 건 문장은 "sessions.db가 없으면 알약 선택을
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

  /** A-4 — §2.1: 사용자가 그 파일을 지우면 다시 묻는다 */
  it("A-4 sessions.db를 지우면 다시 묻는다", async () => {
    const first = startTrial({ seed: seedReturningHome });
    expect(await waitFor(() => storeOpened(first))).toBe(true);
    await first.dispose();

    // 같은 홈을 쓰되 파일만 없앤 상태 — 디렉터리는 남는다(A-3과 같은 모양).
    const second = startTrial({
      seed: (agentHome) => {
        mkdirSync(agentHome, { recursive: true, mode: 0o700 });
        chmodSync(agentHome, 0o700);
        writeFileSync(join(agentHome, "allowlist"), "", { mode: 0o600 });
      },
    });
    await waitForGate(second);
    await sleep(200);
    expect(second.dbExists()).toBe(false);
    expect(second.settled()).toBe(false);

    await second.dispose();
  });
});

/* ============================================================================
 * B. 자리 — 3b 뒤·4 앞이 유일하다 (§2.1)
 * ========================================================================== */

describe("B. 자리 — 3b 뒤·4 앞 (CLI-INTERFACE §2.1)", () => {
  /**
   * B-1 — 4가 홈 디렉터리를 만드는 유일한 지점이므로, 관문이 서 있는 동안 그 디렉터리는
   * 아직 없어야 한다. §2.1의 표현으로는 묻고 나서 만든다.
   */
  it("B-1 관문이 서 있는 동안 ~/.neo-agent/가 아직 없다 (4보다 앞)", async () => {
    const trial = startTrial();
    await waitForGate(trial);

    expect(trial.homeExists()).toBe(false);

    await trial.dispose();
  });

  /**
   * B-2 — 2(크리덴셜 fail-closed)가 관문보다 앞이라는 것. §2.1의 근거는 동의를 받아
   * 놓고 그 다음 단계에서 죽는 순서를 만들지 않는다는 것이다. 관측 형태는 키를 주지
   * 않았는데 기동이 실패로 끝난다는 것이고, A-1이 그 대비쌍이다(같은 조건에서 관문이 서면
   * 끝나지 않는다).
   */
  it("B-2 크리덴셜 권한 실패(2)는 관문보다 앞에서 기동을 끝낸다", async () => {
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

  /** B-3 — 3b(메모리 로드)도 관문보다 앞이다. 읽기 실패는 기동 실패다 */
  it("B-3 메모리 읽기 실패(3b)는 관문보다 앞에서 기동을 끝낸다", async () => {
    const trial = startTrial({
      seed: (agentHome) => {
        // 파일 자리에 디렉터리를 둔다 — 존재하는데 읽히지 않는 상태를 만든다.
        mkdirSync(join(agentHome, "memory", "MEMORY.md"), { recursive: true });
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
    // 그리고 «나중에» 같은 셋째 종단 귀결이 없다 — 종단은 진행 아니면 취소뿐이다.
    expect(keys.stay.length).toBeGreaterThan(0);
  }, 120_000);

  it("C-2 Red Pill 갈래 — 4로 진행해 sessions.db가 생긴다", async () => {
    const keys = await discoverKeys();
    const trial = startTrial();
    await waitForGate(trial);

    trial.write(pickKey(keys.proceed, "진행"));
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
});

/* ============================================================================
 * D. 새 영속 상태를 만들지 않는다 (§2.1 — 별도 동의 파일을 두지 않는다)
 * ========================================================================== */

describe("D. 동의를 기록하는 새 상태가 없다 (CLI-INTERFACE §2.1)", () => {
  /**
   * 관문을 지난 기동이 남긴 항목 집합이, 관문을 **아예 지나지 않은** 기동이 남긴 항목
   * 집합을 넘지 않는가. 동의 파일이 생겼다면 앞쪽에만 있는 항목으로 나타난다.
   * 이름을 미리 알 필요가 없다는 것이 이 방식을 고른 이유다.
   */
  it("D-1 Red Pill 뒤의 홈이 returning 기동의 홈보다 늘지 않는다", async () => {
    const keys = await discoverKeys();

    const gated = startTrial();
    await waitForGate(gated);
    gated.write(pickKey(keys.proceed, "진행"));
    expect(await waitFor(() => gated.dbExists())).toBe(true);
    await gated.dispose();
    const gatedEntries = gated.entries() ?? [];

    const returning = startTrial({ seed: seedReturningHome });
    expect(await waitFor(() => storeOpened(returning))).toBe(true);
    await returning.dispose();
    const returningEntries = returning.entries() ?? [];

    expect(gatedEntries.length).toBeGreaterThan(0);
    const extra = gatedEntries.filter((entry) => !returningEntries.includes(entry));
    expect(extra).toEqual([]);
  }, 120_000);
});

/* ============================================================================
 * E. 문면 — 사실을 대체하지 않고 감싼다 (§2.1)
 * ========================================================================== */

describe("E. 문면 셋 (CLI-INTERFACE §2.1)", () => {
  /**
   * E-1 — 경로. **주입 데이터 확인**이다: 이 파일이 준 홈 경로가 그대로 문면에 나타나는가.
   * 표기 형태(틸데냐 절대 경로냐)는 재지 않는다 — §2.1이 든 것은 «경로»이고 그 표기는
   * §12가 위임한 표시 세부다.
   */
  it("E-1 문면에 경로가 있다", async () => {
    const trial = startTrial();
    await waitForGate(trial);

    expect(trial.output()).toContain(trial.agentHome);

    await trial.dispose();
  });

  /**
   * E-2 — 무엇이 생기는가. §2.1이 넷을 이름으로 들었다(세션 기록·설정·승인 allowlist·
   * 메모리). **정확한 낱말은 세부이므로** 개념마다 관용 집합으로 잰다 — 그 개념의
   * 시스템 값(파일 이름)이든 §2.1이 쓴 낱말이든 하나라도 있으면 적합이다. 넷 중 하나라도
   * 어느 표기로도 안 보이면 그것이 발견이다.
   */
  it("E-2 문면에 무엇이 생기는지가 있다 (넷)", async () => {
    const trial = startTrial();
    await waitForGate(trial);
    const text = trial.output();

    const concepts: readonly (readonly [string, readonly string[]])[] = [
      ["세션 기록", ["세션 기록", "sessions.db", "세션"]],
      ["설정", ["설정", "config.json"]],
      ["승인 allowlist", ["승인 allowlist", "allowlist", "승인 목록"]],
      ["메모리", ["메모리", "memory"]],
    ];
    const missing = concepts
      .filter(([, tokens]) => !tokens.some((token) => text.includes(token)))
      .map(([name]) => name);
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
 * F. 비용 상한 — 한 프롬프트·한 분기 (§2.1)
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
   * §2.1은 serve가 sessions.db 없이 기동하지 않는다고 판정하면서, 그 판정이 그 경로가
   * 생길 때 함께 선다고 스스로 밝힌다. 그래서 여기서 재는 것은 판정의 이행이 아니라
   * **전제의 부재**다 — argv 닫힌 목록에 serve가 아직 없다. 이 단정이 붉어지면 경로가
   * 생겼다는 뜻이고, 그때 §2.1의 판정을 재는 검사가 이 자리에 들어와야 한다.
   */
  it("G-1 argv 닫힌 목록에 serve가 아직 없다 — 판정이 설 자리가 미착지다", () => {
    expect(() => parseArgs(["serve"])).toThrow();
  });
});

/* ============================================================================
 * H. [미규정] EOF와 제어문자의 해석 — 판정 필요
 *
 * §2.1은 응답 키를 정하지 않았고, 정한 것은 기본 선택이 없다는 것뿐이다. 그런데 §9는
 * 승인 프롬프트에 대해 Ctrl+D가 EOF·취소 어느 쪽으로도 해석되지 않는다고 못박았고,
 * §8의 Ctrl+D 표는 approval-wait를 무효 키로 둔다. 3c는 REPL보다 앞이라 그 상태가
 * 아니지만, §2.1이 기본 선택 금지의 근거로 §9의 규율을 이름으로 끌어왔다.
 *
 * **그래서 여기서는 임의로 판정하지 않는다.** 재는 것은 §2.1이 금한 결과가 나지
 * 않는다는 것뿐이고(어느 쪽도 홈에 상태를 만들지 않는다), 실제 해석이 무엇인지는
 * 리포트가 «판정 필요»로 든다.
 * ========================================================================== */

/**
 * 셋 — 스트림 EOF(키 없이 입력이 닫힘)·Ctrl+D(U+0004)·Ctrl+C(U+0003).
 * `undefined`가 EOF 갈래다.
 */
const CONTROL_PROBES: readonly (string | undefined)[] = [undefined, "\u0004", "\u0003"];

describe("H. [미규정] EOF·제어문자 (CLI-INTERFACE §2.1 · §9 대조)", () => {
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
   * [미규정 FR-1] 셋 다 취소 갈래로 해석되어 종료 코드 0으로 끝난다. §2.1은 이것을
   * 정하지 않았고 §9는 승인 프롬프트에 대해 반대 규율을 든다. 이 단정은 **오늘의 동작을
   * 기록**하는 것이지 계약을 만드는 것이 아니다 — 판정이 서면 이 블록이 그 판정으로
   * 대체된다. 붉어지면 동작이 바뀐 것이므로 리포트의 FR-1을 다시 연다.
   */
  it("H-2 [미규정] 셋 다 취소로 해석되어 종료 코드 0이다", async () => {
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
