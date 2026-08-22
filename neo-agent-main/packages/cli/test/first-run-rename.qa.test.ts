/**
 * 첫 기동 관문 — 개명 사이클 뒤의 독립 재검증. `docs/CLI-INTERFACE.md` §2.1.
 *
 * **기대값은 §2.1에서만 뽑았다.** 이 파일을 쓰기 전에 그 절을 읽어 계약 항목을 목록으로
 * 만들었고, 실물(`src/first-run.ts`·`src/wiring.ts`의 3c)은 그 목록이 닫힌 뒤에 열었다.
 * 워킹트리의 diff는 읽지 않았다 — 무엇이 바뀌었는지를 보고 나서 재면 그것은 변경의
 * 재서술이지 계약 대조가 아니다.
 *
 * **여는 문은 `runCli` 하나다.** 나머지 관측은 전부 파일 시스템·종료 코드·출력이다.
 * 예외는 두 자리이고 각각 이유가 있다: `checkFirstRun`은 §2.1이 코드 블록으로 든 판정
 * 타입을 런타임에서 재는 자리이고, `src/`의 원문 읽기는 §2.1이 식별자 층에 건 요구를
 * 재는 유일한 수단이다(타입은 런타임에 없다).
 *
 * **응답 키를 아는 단정을 쓰지 않는다.** §2.1의 중단 입력과 응답 키 소절이 계약 표면은
 * 키를 알지 않는다고 정했다. 그래서 이 파일은 후보 문자를 전수로 넣어 보고 그 결과를
 * 세 부류(진행/취소/재프롬프트)로 가른 뒤 부류 위에서만 단정한다. 제어문자 셋만 예외인데,
 * 그것은 §2.1이 중단 입력을 **이름으로** 계약에 올렸기 때문이다(2026-08-21 `K-220`) —
 * 세부를 고정하는 것이 아니라 절이 든 항목을 그대로 재는 것이다.
 *
 * 대조한 계약 항목 열여덟(+오늘의 동작 기록 둘) — 등급과 재현은 `plans/20260821-firstrun-gate-rename-qa.md`가 든다.
 *
 *   P. 문면 사실 셋            (P-1 ~ P-6)   — 판정 1
 *   Q. 유효 응답과 기본 선택    (Q-1 ~ Q-4)   — 판정 2
 *   R. 취소 갈래               (R-1 ~ R-3)   — 판정 3
 *   S. 중단 입력 셋            (S-1 ~ S-4)   — 판정 4
 *   T. 선택 확인 표시          (T-1 ~ T-3)   — 판정 5
 *   U. 식별자 층 — 개명        (U-1 ~ U-3)
 *   W. 오늘의 동작 기록        (W-1 ~ W-2)
 *   V. 역검증 — 검사가 실제로 잡는가
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석은 설계 정본의 문면을 인용부호로 담지 않는다. 지목은 절 번호·소절 이름·
 * 코드 표기로만 하므로 §3.4의 대조 축(`U-1`·`D-1`·`D-2`) 중 인용부호에 걸리는 자리가 없고,
 * 형식 축(`D-3`~`D-5`)도 오지 않는다 — 그것이 대조를 면제하지는 않는다. 문서를 줄번호로
 * 가리키지 않는다.
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
import { fileURLToPath } from "node:url";
import type { ModelClient, ModelStreamEvent } from "@neo-agent/core";
import { defaultDatabasePath } from "@neo-agent/store";
import { afterEach, describe, expect, it } from "vitest";
// 주석 소속 술어의 정본이다(`DOC-CITATION.md` §6 U-b의 2026-08-18·2026-08-19 판정).
// 사본을 두면 정본이 고쳐져도 이 파일만 옛 술어로 잰다.
import { commentTokenSpans } from "../../../scripts/comment-lexer.mjs";
import { defaultAllowlistPath } from "../src/allowlist.ts";
import { defaultConfigPath } from "../src/config.ts";
import { API_KEY_ENV } from "../src/credentials.ts";
import { checkFirstRun } from "../src/first-run.ts";
import { defaultMemoryDir } from "../src/memory.ts";
import { EXIT_OK, runCli } from "../src/wiring.ts";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// biome-ignore lint/suspicious/noControlCharactersInRegex: 이스케이프를 걷어내려면 찾아야 한다
const ANSI_PATTERN = /\x1b\[[0-9;]*[A-Za-z]/g;
const stripAnsi = (text: string): string => text.replace(ANSI_PATTERN, "");

/** 네트워크로 나가지 않는 최소 모델. 진행 갈래가 실물 프로바이더를 조립하지 않게 한다 */
function localModel(): ModelClient {
  return {
    modelId: "firstrun-rename-qa/probe",
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
 * 시험대 — 기동 하나를 통째로 감싼다
 * ========================================================================== */

interface RunOptions {
  readonly argv?: readonly string[];
  /** 기동 전에 홈을 채운다. 인자는 `<home>/.neo-agent` 경로다 */
  readonly seed?: (agentHome: string) => void;
  /**
   * 기동 **전에** 입력 스트림을 소비까지 끝낸다. 관문이 설 때 스트림이 이미 죽어 있는
   * 상태를 만든다 — 답이 영영 오지 않는 경로가 있는지 재는 자리다.
   */
  readonly preEndInput?: boolean;
}

interface Run {
  readonly home: string;
  readonly agentHome: string;
  write(key: string): void;
  endInput(): void;
  /** ANSI를 걷어낸 누적 출력 */
  text(): string;
  /** 걷지 않은 원문 — 실패 표시(색)를 재는 자리가 쓴다 */
  raw(): string;
  settled(): boolean;
  exit(): number | undefined;
  dbExists(): boolean;
  homeExists(): boolean;
  entries(): readonly string[] | null;
  dispose(): Promise<void>;
}

const roots: string[] = [];

async function startRun(options: RunOptions = {}): Promise<Run> {
  const root = mkdtempSync(join(tmpdir(), "neo-firstrun-rename-"));
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

  if (options.preEndInput === true) {
    input.resume();
    input.end();
    await new Promise<void>((resolve) => {
      input.on("end", () => resolve());
    });
  }

  let code: number | undefined;
  let failure: unknown;
  let done = false;
  const running = runCli({
    argv: [...(options.argv ?? [])],
    env: { [API_KEY_ENV]: "firstrun-rename-qa-key" },
    cwd: workspace,
    home,
    io: { input, output },
    version: "0.0.0-firstrun-rename-qa",
    factories: {
      // 판정을 주입하지 않으면 실제 `docker version`이 스폰된다.
      probeDocker: async () => ({ available: false, reason: "firstrun-rename-qa: 판정 주입" }),
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
    text: () => stripAnsi(chunks.join("")),
    raw: () => chunks.join(""),
    settled: () => done,
    exit: () => {
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

/** 관문이 서서 입력을 기다리는 상태까지 기다린다 */
async function waitForGate(run: Run): Promise<void> {
  const reached = await waitFor(() => run.text().length > 0 || run.settled());
  if (!reached || run.settled()) {
    throw new Error(
      `관문이 서지 않았다 — 기동이 입력을 기다리지 않고 끝났다(exit=${String(run.exit())}). 출력: ${JSON.stringify(run.text().slice(0, 200))}`,
    );
  }
  // 문면이 여러 청크로 나뉘어 나가는 구현을 배제하지 않는다.
  await sleep(30);
}

/** 홈을 이미 지난 적이 있는 상태로 만든다 — 판정의 입력은 `sessions.db`의 존재 하나다 */
function seedReturningHome(agentHome: string): void {
  mkdirSync(agentHome, { recursive: true, mode: 0o700 });
  chmodSync(agentHome, 0o700);
  writeFileSync(join(agentHome, "sessions.db"), "", { mode: 0o600 });
  chmodSync(join(agentHome, "sessions.db"), 0o600);
}

/** 저장소(4)가 실제로 열렸는가 — 열리면 WAL 부산물이 함께 서므로 항목이 는다 */
function storeOpened(run: Run): boolean {
  return run.dbExists() && (run.entries()?.length ?? 0) > 1;
}

/* ============================================================================
 * 판정의 순수 술어 — 실물과 역검증이 **같은 함수**를 쓴다
 *
 * 단정을 인라인으로 흩어 놓으면 역검증이 다른 코드를 재게 된다. 여기 모아 두면 V 블록이
 * 일부러 망가뜨린 입력을 같은 술어에 먹여 실제로 잡히는지를 확인할 수 있다.
 * ========================================================================== */

/**
 * 리터럴 틸데 호칭. §2.1의 문면 소절이 금하는 것은 이 표기의 **단독** 사용이고, 절대 경로와의
 * 공존은 금하지 않는다(2026-08-22 `K-230`). 그래서 이 상수는 계약 표면의 단정에 쓰이지 않고
 * 역검증(V-2)이 절대 경로를 치환해 «틸데 단독»을 만들 때의 입력으로만 쓴다.
 */
const TILDE_FORM = "~/.neo-agent";

/**
 * §2.1의 문면 사실 셋이 빠지지 않았는가. 빠진 항목의 이름들을 돌려준다.
 *
 * ①이 재는 것은 조립이 쓸 홈으로 해석한 실제 절대 경로가 있는가 하나다. 틸데 호칭이 함께
 * 있는지는 재지 않는다 — 절대 경로가 있는 한 그것이 흐려지지 않고, 틸데 단독이면 절대 경로가
 * 없으므로 이 축이 이미 잡는다(2026-08-22 `K-230`).
 *
 * ②는 §2.1이 이름으로 든 넷이고, 각 이름의 정본은 경로 함수다 — 이 파일이 짓지 않는다.
 *
 * ③의 정확한 낱말은 §12가 위임한 표시 세부이므로 관용 표기 집합으로 잰다.
 */
function missingFacts(text: string, agentHome: string, names: readonly string[]): string[] {
  const missing: string[] = [];
  if (!text.includes(agentHome)) missing.push("①경로-해석된-절대경로");
  for (const name of names) {
    if (!text.includes(name)) missing.push(`②이름:${name}`);
  }
  if (!/취소/.test(text) || !/아무것도\s*(생기지|만들지|남기지)\s*않/.test(text)) {
    missing.push("③취소-무생성");
  }
  return missing;
}

/**
 * ②의 넷이 **개념으로도** 전달되는가. 이름만 나열하고 그것이 무엇인지 말하지 않으면
 * §2.1이 이름으로 든 넷 중 사용자가 알아볼 수 있는 것은 없다. 개념마다 관용 표기를 허용한다.
 */
const CONCEPTS: readonly (readonly [string, readonly string[]])[] = [
  ["세션 기록", ["세션 기록", "세션"]],
  ["설정", ["설정"]],
  ["승인 allowlist", ["승인 allowlist", "승인 목록", "승인"]],
  ["메모리", ["메모리"]],
];

function missingConcepts(text: string): string[] {
  return CONCEPTS.filter(([, tokens]) => !tokens.some((token) => text.includes(token))).map(
    ([name]) => name,
  );
}

/** §2.1의 선택의 귀결 표가 든 화면의 이름 둘. 코드가 드는 값이 아니라 사용자가 보는 이름이다 */
const PROCEED_NAME = "Red Pill";
const CANCEL_NAME = "Blue Pill";

/**
 * 선택 뒤에 나온 출력이 **고른 쪽**을 말하는가. 어긋난 항목의 이름들을 돌려준다.
 *
 * 프롬프트 자신이 두 이름을 함께 그리므로 전체 출력을 재는 단정은 대응이 뒤바뀌어도
 * 통과한다 — 키를 넣은 **뒤에 나온 조각만** 이 술어에 넣는 것이 전제다.
 */
function confirmationFindings(delta: string, chosen: string, other: string): string[] {
  const findings: string[] = [];
  if (delta.includes(other)) findings.push(`고르지-않은-쪽-이름:${other}`);
  if (!delta.includes(chosen)) findings.push(`고른-쪽-이름-없음:${chosen}`);
  return findings;
}

/* ============================================================================
 * 응답 키의 발견 — 키를 알지 않고 부류로 가른다
 * ========================================================================== */

type Outcome = "PROCEED" | "CANCEL" | "STAY";

interface Classified {
  readonly key: string;
  readonly outcome: Outcome;
  readonly exit: number | undefined;
  readonly homeExists: boolean;
  /** 키를 넣은 뒤에 나온 출력 조각 */
  readonly delta: string;
}

async function classify(key: string): Promise<Classified> {
  const run = await startRun();
  try {
    await waitForGate(run);
    const before = run.text().length;
    // 종단 신호(진행·취소) 또는 비침묵 신호(재프롬프트) 중 먼저 오는 것을 잡는다.
    run.write(key);
    await waitFor(() => run.settled() || run.dbExists() || run.text().length > before, 1500);
    // 비침묵 신호가 먼저 왔을 수 있으므로 종단 신호에 유예를 준다.
    await waitFor(() => run.settled() || run.dbExists(), 300);
    // 마지막 출력이 싱크를 빠져나오기 전에 잘라내면 «없다»가 경합으로 참이 된다.
    await sleep(60);
    const delta = run.text().slice(before);
    const outcome: Outcome = run.dbExists() ? "PROCEED" : run.settled() ? "CANCEL" : "STAY";
    return {
      key,
      outcome,
      exit: outcome === "CANCEL" ? run.exit() : undefined,
      homeExists: run.homeExists(),
      delta,
    };
  } finally {
    await run.dispose();
  }
}

/**
 * 후보 — 출력 가능한 ASCII 전량(공백 포함). §2.1이 키를 정하지 않았으므로 넓게 잡는다.
 * 제어문자는 여기 없다 — S 블록이 이름으로 든 셋을 따로 잰다.
 */
const CANDIDATES: readonly string[] = Array.from({ length: 0x7e - 0x20 + 1 }, (_, index) =>
  String.fromCharCode(0x20 + index),
);

let discovery: Promise<readonly Classified[]> | undefined;

function discover(): Promise<readonly Classified[]> {
  discovery ??= (async () => {
    const results: Classified[] = [];
    const CONCURRENCY = 8;
    for (let i = 0; i < CANDIDATES.length; i += CONCURRENCY) {
      const batch = CANDIDATES.slice(i, i + CONCURRENCY);
      results.push(...(await Promise.all(batch.map((key) => classify(key)))));
    }
    return results;
  })();
  return discovery;
}

const keysOf = (all: readonly Classified[], outcome: Outcome): readonly Classified[] =>
  all.filter((entry) => entry.outcome === outcome);

function pick(entries: readonly Classified[], what: string): Classified {
  const first = entries[0];
  if (first === undefined) throw new Error(`${what} 부류가 비었다 — 키 발견이 실패했다`);
  return first;
}

/* ============================================================================
 * P. 문면 사실 셋 (§2.1 문면 소절) — 판정 1
 * ========================================================================== */

/** ②의 넷. 이름의 정본은 각 경로 함수이므로 여기서 짓지 않고 받아 온다 */
function createdNames(home: string): readonly string[] {
  return [
    basename(defaultDatabasePath(home)),
    basename(defaultConfigPath(home)),
    basename(defaultAllowlistPath(home)),
    basename(defaultMemoryDir(home)),
  ];
}

describe("P. 문면 사실 셋 (CLI-INTERFACE §2.1)", () => {
  it("P-1 셋이 전부 문면에 있다 — 경로·무엇이 생기는가·취소하면 아무것도 생기지 않는다", async () => {
    const run = await startRun();
    await waitForGate(run);

    expect(missingFacts(run.text(), run.agentHome, createdNames(run.home))).toEqual([]);

    await run.dispose();
  });

  /**
   * P-2 — ①을 **홀로** 재는 자리. P-1에 이미 들어 있으나 개명·문서 개정의 대상이 정확히
   * 이 갈래였으므로 실패가 났을 때 원인이 한 눈에 보이게 따로 세운다.
   *
   * 재는 것은 주입한 홈이 문면에 그대로 나타나는가 하나다(§7이 허용 형태로 든 주입 데이터
   * 확인). 틸데 호칭의 부재를 함께 재지 않는다 — §2.1 문면 소절이 계약 표면에 그 부정 축을
   * 두지 말라고 정했고(2026-08-22 `K-230`), 공존은 금지도 요구도 아니므로 재지 않는 것이
   * 판정이다.
   */
  it("P-2 경로는 주입한 홈으로 해석한 절대 경로다", async () => {
    const run = await startRun();
    await waitForGate(run);
    const text = run.text();

    expect(text, "주입한 홈으로 해석한 절대 경로가 문면에 없다").toContain(run.agentHome);

    await run.dispose();
  });

  /**
   * P-3 — 주입 데이터 확인. 서로 다른 홈 둘이 서로 다른 경로를 낸다는 것을 재면, 경로가
   * 조립이 쓸 홈을 실제로 따라가는지가 갈린다. 한 홈만 재면 `homedir()`를 직접 읽는
   * 구현도 통과한다.
   */
  it("P-3 문면의 경로가 주입된 홈을 따라간다 (두 홈 대조)", async () => {
    const first = await startRun();
    await waitForGate(first);
    const firstText = first.text();
    const firstHome = first.agentHome;
    await first.dispose();

    const second = await startRun();
    await waitForGate(second);
    const secondText = second.text();

    expect(firstHome).not.toBe(second.agentHome);
    expect(firstText).toContain(firstHome);
    expect(secondText).toContain(second.agentHome);
    expect(secondText, "다른 기동의 홈이 이 문면에 나왔다").not.toContain(firstHome);

    await second.dispose();
  });

  it("P-4 ②의 넷이 개념으로도 전달된다", async () => {
    const run = await startRun();
    await waitForGate(run);

    expect(missingConcepts(run.text())).toEqual([]);

    await run.dispose();
  });

  /**
   * P-5 — 대비쌍. P-1~P-4의 단정이 문면이 늘 거기 있어서 참이 되는 경우를 배제한다.
   * 이미 지난 적이 있는 홈에서는 같은 축이 전부 비어야 한다.
   */
  it("P-5 returning 기동에는 관문 문면이 없다", async () => {
    const run = await startRun({ seed: seedReturningHome });
    expect(await waitFor(() => storeOpened(run))).toBe(true);
    await sleep(120);
    const text = run.text();

    expect(missingConcepts(text).length, "묻지 않는 기동에 관문 문면이 나왔다").toBeGreaterThan(0);
    expect(/아무것도\s*(생기지|만들지|남기지)\s*않/.test(text)).toBe(false);

    await run.dispose();
  });

  /**
   * P-6 — 관문의 문면은 `--resume` 갈래에서도 선다. §2.1이 3c를 시작 시퀀스의 자리로
   * 정했고 그 자리는 argv 갈래를 묻지 않는다. 이 갈래에서 관문이 빠지면 세션을 이어가려던
   * 사용자만 묻지 않고 홈이 생긴다 — §2.1이 막으려던 조용한 생성이다.
   */
  it("P-6 --resume 갈래에서도 관문이 선다", async () => {
    const run = await startRun({ argv: ["--resume", "abc"] });
    await waitForGate(run);

    expect(missingFacts(run.text(), run.agentHome, createdNames(run.home))).toEqual([]);
    expect(run.homeExists(), "관문이 서 있는데 홈이 이미 생겼다").toBe(false);

    await run.dispose();
  });
});

/* ============================================================================
 * Q. 유효 응답과 기본 선택 (§2.1 중단 입력과 응답 키 소절) — 판정 2
 *
 * 계약은 유효 응답이 닫힌 둘이고 기본 선택이 없다는 것까지다. 어느 바이트가 그 둘인지는
 * 세부이므로 이 블록은 부류 위에서만 단정한다.
 * ========================================================================== */

describe("Q. 유효 응답 — 닫힌 둘·기본 선택 없음 (CLI-INTERFACE §2.1)", () => {
  it("Q-1 종단 부류가 정확히 둘이고 서로 겹치지 않는다", async () => {
    const all = await discover();
    const proceed = keysOf(all, "PROCEED");
    const cancel = keysOf(all, "CANCEL");
    const stay = keysOf(all, "STAY");

    expect(proceed.length, "진행 갈래로 가는 키가 하나도 없다").toBeGreaterThan(0);
    expect(cancel.length, "취소 갈래로 가는 키가 하나도 없다").toBeGreaterThan(0);
    // 셋을 합치면 후보 전량이다 — 분류되지 않고 샌 키가 없다는 것.
    expect(proceed.length + cancel.length + stay.length).toBe(CANDIDATES.length);
    // 유효 응답이 **닫힌** 둘이라는 것: 나머지 전부가 어느 갈래도 아니다.
    expect(stay.length).toBeGreaterThan(0);
    // 부류는 배타적이다 — 같은 키가 두 부류에 들 수 없다.
    const proceedKeys = new Set(proceed.map((entry) => entry.key));
    expect(cancel.filter((entry) => proceedKeys.has(entry.key))).toEqual([]);
  }, 300_000);

  /**
   * Q-2 — 셋째 종단 귀결이 없다. §2.1의 표는 귀결을 둘로 닫았고 그 절은 나중에 같은
   * 셋째 선택지를 명시적으로 배제한다. 관측 형태는 **모든** 취소 갈래 키가 같은 성질을
   * 갖는다는 것이다: 종료 코드 0, 홈 미생성.
   */
  it("Q-2 취소 부류의 키는 전부 같은 귀결이다 — 종료 코드 0·홈 미생성", async () => {
    const all = await discover();
    const cancel = keysOf(all, "CANCEL");

    expect(cancel.length).toBeGreaterThan(0);
    expect(cancel.filter((entry) => entry.exit !== EXIT_OK).map((entry) => entry.key)).toEqual([]);
    expect(cancel.filter((entry) => entry.homeExists).map((entry) => entry.key)).toEqual([]);
  }, 300_000);

  /**
   * Q-3 — 기본 선택이 없다. §2.1의 근거는 Enter 한 번에 지나가면 명확한 의사가 아니라는
   * 것이므로, 재는 것은 Enter가 두 갈래 어느 쪽도 아니라는 것이다. Tab·Esc·Backspace도
   * 함께 넣는다 — 확정 키로 오인되기 쉬운 자리다.
   */
  it("Q-3 Enter·Tab·Esc·Backspace 어느 것도 갈래를 고르지 않는다", async () => {
    for (const key of ["\r", "\n", "\t", "\x1b", "\x7f"]) {
      const run = await startRun();
      await waitForGate(run);

      run.write(key);
      await sleep(250);

      expect(run.dbExists(), `${JSON.stringify(key)}가 진행 갈래로 지나갔다`).toBe(false);
      expect(run.settled(), `${JSON.stringify(key)}가 기동을 끝냈다`).toBe(false);

      await run.dispose();
    }
  }, 30_000);

  /**
   * Q-4 — 시간이 고르지 않는다. 기본 선택이 없다는 것은 아무 키도 안 눌렀을 때 저절로
   * 어느 쪽으로도 가지 않는다는 뜻이다. 타임아웃 자동 선택은 조용한 생성의 다른 이름이다.
   */
  it("Q-4 아무 키도 주지 않으면 관문이 그대로 서 있다", async () => {
    const run = await startRun();
    await waitForGate(run);

    await sleep(1500);
    expect(run.settled(), "아무 입력 없이 기동이 끝났다").toBe(false);
    expect(run.homeExists(), "아무 입력 없이 홈이 생겼다").toBe(false);

    await run.dispose();
  }, 20_000);
});

/* ============================================================================
 * R. 취소 갈래 (§2.1 선택의 귀결) — 판정 3
 * ========================================================================== */

describe("R. 취소 갈래 — 종료 코드 0·홈 미생성 (CLI-INTERFACE §2.1)", () => {
  it("R-1 취소하면 아무것도 만들지 않고 종료 코드 0이다", async () => {
    const all = await discover();
    const key = pick(keysOf(all, "CANCEL"), "취소").key;
    const run = await startRun();
    await waitForGate(run);

    run.write(key);
    expect(await waitFor(() => run.settled())).toBe(true);

    expect(run.homeExists(), "취소했는데 홈이 생겼다").toBe(false);
    expect(run.exit()).toBe(EXIT_OK);

    await run.dispose();
  }, 300_000);

  it("R-2 이미 있던 디렉터리의 내용이 그대로다", async () => {
    const all = await discover();
    const key = pick(keysOf(all, "CANCEL"), "취소").key;
    const run = await startRun({
      seed: (agentHome) => {
        mkdirSync(agentHome, { recursive: true, mode: 0o700 });
        chmodSync(agentHome, 0o700);
        writeFileSync(join(agentHome, "allowlist"), "shell:rename-qa-marker\n", { mode: 0o600 });
      },
    });
    await waitForGate(run);

    run.write(key);
    expect(await waitFor(() => run.settled())).toBe(true);

    expect(run.entries()).toEqual(["allowlist"]);
    expect(readFileSync(join(run.agentHome, "allowlist"), "utf8")).toBe("shell:rename-qa-marker\n");
    expect(run.exit()).toBe(EXIT_OK);

    await run.dispose();
  }, 300_000);

  /**
   * R-3 — 취소가 실패로 보고되지 않는다. §2.1은 취소가 실패가 아니라는 것을 종료 코드 0의
   * 근거로 들고, §2 말미의 에러 종료는 실패 갈래의 형태다. 종료 코드만 0이고 화면이 빨간
   * 실패를 말하면 사용자에게는 실패한 것이다.
   *
   * [미규정] 실패 표시의 **수단**(빨간색)은 §12가 위임한 표시 세부다. 이 단정이 재는 것은
   * 오늘의 수단으로 실패가 표시되지 않는다는 것이고, 수단이 바뀌면 이 자리도 함께 바뀐다.
   */
  it("R-3 취소 갈래는 실패 문면을 내지 않는다", async () => {
    const all = await discover();
    const cancelKey = pick(keysOf(all, "CANCEL"), "취소").key;
    const cancelled = await startRun();
    await waitForGate(cancelled);
    cancelled.write(cancelKey);
    expect(await waitFor(() => cancelled.settled())).toBe(true);
    const cancelledRaw = cancelled.raw();
    await cancelled.dispose();

    // 대비쌍 — 실제 실패 갈래에서는 같은 축이 잡힌다. 없으면 이 단정은 아무것도 안 잰다.
    const failing = await startRun({
      seed: (agentHome) => {
        mkdirSync(agentHome, { recursive: true, mode: 0o700 });
        chmodSync(agentHome, 0o700);
        writeFileSync(join(agentHome, "credentials"), "ANTHROPIC_API_KEY=x\n");
        chmodSync(join(agentHome, "credentials"), 0o644);
      },
    });
    expect(await waitFor(() => failing.settled())).toBe(true);
    const failingRaw = failing.raw();
    await failing.dispose();

    expect(failingRaw, "실패 갈래에 실패 표시가 없다 — 이 축은 아무것도 재지 못한다").toContain(
      "\x1b[31m",
    );
    expect(cancelledRaw, "취소 갈래가 실패로 표시됐다").not.toContain("\x1b[31m");
  }, 300_000);
});

/* ============================================================================
 * S. 중단 입력 셋 (§2.1 중단 입력과 응답 키 소절) — 판정 4
 *
 * §2.1은 Ctrl+C·Ctrl+D·입력 스트림 종료를 **이름으로** 들고 그 귀결을 취소와 같다고
 * 못박았다(2026-08-21 `K-220`). 그래서 이 블록의 단정은 미규정이 아니라 계약이다.
 * ========================================================================== */

interface AbortProbe {
  readonly name: string;
  readonly apply: (run: Run) => void;
}

const ABORTS: readonly AbortProbe[] = [
  { name: "Ctrl+C", apply: (run) => run.write("\x03") },
  { name: "Ctrl+D", apply: (run) => run.write("\x04") },
  { name: "입력 스트림 종료", apply: (run) => run.endInput() },
];

describe("S. 중단 입력 셋 — 취소와 같은 귀결 (CLI-INTERFACE §2.1)", () => {
  it("S-1 셋 다 종료 코드 0으로 끝난다", async () => {
    for (const abort of ABORTS) {
      const run = await startRun();
      await waitForGate(run);

      abort.apply(run);
      expect(await waitFor(() => run.settled(), 2000), `${abort.name}에 답하지 않았다`).toBe(true);
      expect(run.exit(), `${abort.name}의 종료 코드가 0이 아니다`).toBe(EXIT_OK);

      await run.dispose();
    }
  }, 30_000);

  it("S-2 셋 다 홈을 만들지 않는다", async () => {
    for (const abort of ABORTS) {
      const run = await startRun();
      await waitForGate(run);

      abort.apply(run);
      await waitFor(() => run.settled(), 2000);
      await sleep(120);

      expect(run.dbExists(), `${abort.name} 뒤에 sessions.db가 생겼다`).toBe(false);
      expect(run.homeExists(), `${abort.name} 뒤에 홈이 생겼다`).toBe(false);

      await run.dispose();
    }
  }, 30_000);

  /**
   * S-3 — 중단이 **취소와 같은 귀결로** 확인된다. 종료 코드와 파일 시스템만 보면 묻지 않고
   * 진행했다가 실패해서 아무것도 안 남은 경로와 구분되지 않으므로, 화면이 무엇으로 읽었는지를
   * 함께 잰다.
   *
   * **두 단정 다 계약이다.** 뒤쪽(진행 쪽 이름이 아니다)은 §2.1 선택의 귀결 표가 든 이름 ↔
   * 값 대응이고, 앞쪽(취소 쪽 이름이다)은 같은 절 선택의 귀결 소절이 2026-08-22에 계약으로
   * 올린 **확인 표시의 존재**다 — T-3과 같은 지위이고, 그 지위가 이제 계약이다. 앞쪽이
   * 뒤쪽의 대비쌍 노릇도 겸한다(조각을 못 받으면 뒤쪽이 조용히 참이 된다).
   *
   * **중단 입력 셋에서 이 구별이 가장 급하다는 것이 그 판정의 둘째 근거다** — 무효 키가 먹지
   * 않은 것과 취소로 읽힌 것을 사용자가 가를 수단이 화면밖에 없기 때문이다. 그래서 앞쪽만
   * 붉어져도 계약 위반이다.
   */
  it("S-3 중단은 취소 쪽 이름으로 확인된다 — 진행으로 읽히지 않는다", async () => {
    for (const abort of ABORTS) {
      const run = await startRun();
      await waitForGate(run);
      const before = run.text().length;

      abort.apply(run);
      await waitFor(() => run.settled(), 2000);
      await sleep(150);
      const delta = run.text().slice(before);

      expect(delta, `${abort.name}이 진행으로 확인됐다`).not.toContain(PROCEED_NAME);
      expect(delta, `${abort.name}에 아무 확인도 나오지 않았다`).toContain(CANCEL_NAME);

      await run.dispose();
    }
  }, 30_000);

  /**
   * S-4 — 관문이 설 때 스트림이 **이미 죽어 있는** 경로. 여기서 매달리면 화면이 멈춘 채
   * 아무것도 알리지 않는다 — §2.1이 중단 입력의 근거 넷 중 하나로 배제한 형태다.
   * 이 갈래는 다른 셋과 달리 이벤트가 다시 오지 않으므로 따로 재야 한다.
   */
  it("S-4 이미 끝난 입력 스트림에서도 매달리지 않는다", async () => {
    const run = await startRun({ preEndInput: true });

    expect(await waitFor(() => run.settled(), 3000), "답 없이 매달렸다").toBe(true);
    expect(run.exit()).toBe(EXIT_OK);
    expect(run.homeExists()).toBe(false);

    await run.dispose();
  }, 20_000);
});

/* ============================================================================
 * T. 선택 확인 표시 (§2.1 선택의 귀결 표) — 판정 5
 *
 * 그 표가 화면의 이름 ↔ 값 대응의 정본이다. 고르지 않은 쪽의 이름으로 확인이 나가면
 * 사용자가 읽은 것과 실제로 일어난 일이 갈린다.
 * ========================================================================== */

describe("T. 선택 확인 표시 — 고른 쪽의 이름 (CLI-INTERFACE §2.1)", () => {
  it("T-1 진행 갈래의 확인은 취소 쪽 이름을 말하지 않는다", async () => {
    const all = await discover();
    const entry = pick(keysOf(all, "PROCEED"), "진행");

    expect(entry.delta, "진행했는데 취소 쪽 이름이 확인에 나왔다").not.toContain(CANCEL_NAME);
  }, 300_000);

  it("T-2 취소 갈래의 확인은 진행 쪽 이름을 말하지 않는다", async () => {
    const all = await discover();
    const entry = pick(keysOf(all, "CANCEL"), "취소");

    expect(entry.delta, "취소했는데 진행 쪽 이름이 확인에 나왔다").not.toContain(PROCEED_NAME);
  }, 300_000);

  /**
   * T-3 — 고른 쪽의 이름이 실제로 확인에 나오는가. 두 갈래를 한 자리에서 잰다.
   *
   * **붉어졌을 때의 등급은 한 갈래 — 계약 위반이다.** §2.1 선택의 귀결 소절이 2026-08-22에
   * 확인 표시의 **존재**를 계약으로 올렸다. 그전까지 그 절이 정한 것은 선택의 귀결 표의
   * 이름 ↔ 값 대응뿐이라, 이름이 뒤바뀌면 표 위반인데 확인이 통째로 사라지면 무엇인지가
   * 비어 있었다. 같은 소절이 그 사라짐을 이름이 뒤바뀐 것과 **같은 등급**으로 못박았다 —
   * 사용자가 읽은 것과 실제로 일어난 일이 갈린다는 결과가 같기 때문이다. 그래서 이 술어가
   * 내는 발견 둘(고르지 않은 쪽 이름이 나옴 · 고른 쪽 이름이 없음)은 등급이 서로 다르지
   * 않고, 어느 쪽이 붉어져도 갈리는 것은 구현이다.
   *
   * **재는 것은 존재 하나뿐이다.** 문면·색·자리는 같은 소절이 §12에 남겨 둔 표시 세부이고
   * 이 단정은 그것을 고정하지 않는다.
   */
  it("T-3 고른 쪽의 이름이 확인에 나온다", async () => {
    const all = await discover();
    const proceed = pick(keysOf(all, "PROCEED"), "진행");
    const cancel = pick(keysOf(all, "CANCEL"), "취소");

    expect(confirmationFindings(proceed.delta, PROCEED_NAME, CANCEL_NAME)).toEqual([]);
    expect(confirmationFindings(cancel.delta, CANCEL_NAME, PROCEED_NAME)).toEqual([]);
  }, 300_000);
});

/* ============================================================================
 * U. 식별자 층 — 개명 (§2.1의 2026-08-21 개정 · `LORE.md` §6 불변)
 *
 * §2.1은 판정 타입과 선택 타입을 코드 블록으로 들고, 이름과 값이 전부 기능 어휘라고
 * 못박았다. 알약 어휘가 사는 층은 화면 문면·선택지 라벨·응답 키뿐이다.
 * ========================================================================== */

const SRC_DIR = fileURLToPath(new URL("../src/", import.meta.url));
const PACKAGES_DIR = fileURLToPath(new URL("../../", import.meta.url));

/**
 * 주석만 공백으로 덮는다 — 남는 것이 코드다.
 *
 * 문자열 리터럴을 함께 덮는 것과 갈라 둔 이유는 **재는 모집단이 문자열인 자리가 있기
 * 때문**이다. 유니온 값을 원문에서 읽는 U-2가 그 경우라 문자열까지 덮으면 그 단정이
 * 공허하게 참이 된다. 주석 소속 판정은 여기서도 정본 렉서가 한다.
 */
function maskComments(source: string): string {
  const chars = source.split("");
  for (const span of commentTokenSpans(source)) {
    for (let i = span.pos; i < span.end; i += 1) {
      if (chars[i] !== "\n") chars[i] = " ";
    }
  }
  return chars.join("");
}

/** 주석과 문자열 리터럴을 공백으로 덮는다 — 남는 것이 식별자 층이다 */
function maskCommentsAndLiterals(source: string): string {
  const masked = maskComments(source);
  const out = masked.split("");
  // 템플릿 리터럴의 `${...}` 안은 다시 식별자 층이다. 프레임을 쌓아 그 안을 살려 둔다.
  const frames: { kind: "code" | "template"; depth: number }[] = [{ kind: "code", depth: 0 }];
  let i = 0;
  while (i < masked.length) {
    const frame = frames[frames.length - 1];
    if (frame === undefined) break;
    const ch = masked[i];
    if (frame.kind === "code") {
      if (ch === "'" || ch === '"') {
        const quote = ch;
        i += 1;
        while (i < masked.length && masked[i] !== quote) {
          if (masked[i] === "\\") {
            out[i] = " ";
            i += 1;
          }
          if (i < masked.length && masked[i] !== "\n") out[i] = " ";
          i += 1;
        }
        i += 1;
        continue;
      }
      if (ch === "`") {
        frames.push({ kind: "template", depth: 0 });
        i += 1;
        continue;
      }
      if (ch === "{") frame.depth += 1;
      else if (ch === "}") {
        if (frame.depth === 0 && frames.length > 1) {
          frames.pop();
          i += 1;
          continue;
        }
        frame.depth -= 1;
      }
      i += 1;
      continue;
    }
    if (ch === "\\") {
      out[i] = " ";
      if (i + 1 < masked.length && masked[i + 1] !== "\n") out[i + 1] = " ";
      i += 2;
      continue;
    }
    if (ch === "`") {
      frames.pop();
      i += 1;
      continue;
    }
    if (ch === "$" && masked[i + 1] === "{") {
      frames.push({ kind: "code", depth: 0 });
      i += 2;
      continue;
    }
    if (ch !== "\n") out[i] = " ";
    i += 1;
  }
  return out.join("");
}

/**
 * 식별자 층에 남은 세계관 어휘. 줄번호와 함께 돌려준다.
 *
 * 재는 낱말을 알약 어휘 하나로 좁힌 것은 오탐 때문이다 — 색 이름(`red`)은 표시 수단이지
 * 세계관 어휘가 아니고, 그 둘을 문자열만으로 가를 수 없다. 유니온 **값**이 색 이름으로
 * 돌아가는 갈래는 U-2가 따로 잡는다.
 */
function worldVocabularyHits(source: string): number[] {
  const masked = maskCommentsAndLiterals(source);
  const lines: number[] = [];
  masked.split("\n").forEach((line, index) => {
    if (/pill/i.test(line)) lines.push(index + 1);
  });
  return lines;
}

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      found.push(...sourceFiles(full));
    } else if (entry.name.endsWith(".ts")) {
      found.push(full);
    }
  }
  return found;
}

describe("U. 식별자 층 — 개명 (CLI-INTERFACE §2.1 · LORE §6)", () => {
  /** U-1 — §2.1이 코드 블록으로 든 판정 타입. 값 둘이 그대로인가를 런타임에서 잰다 */
  it("U-1 checkFirstRun의 판정 값이 first-run·returning이다", () => {
    const empty = mkdtempSync(join(tmpdir(), "neo-firstrun-verdict-"));
    roots.push(empty);
    expect(checkFirstRun(empty)).toEqual({ kind: "first-run" });

    mkdirSync(join(empty, ".neo-agent"), { recursive: true });
    writeFileSync(join(empty, ".neo-agent", "sessions.db"), "");
    expect(checkFirstRun(empty)).toEqual({ kind: "returning" });
  });

  /**
   * U-2 — 선택 타입의 이름과 값. 타입은 런타임에 없으므로 원문에서 읽는다. §2.1이 이
   * 자리를 코드 블록으로 들었고 값 둘이 조립의 분기에 그대로 박히므로, 이름만 바꾸고 값을
   * 두는 절반 정리를 여기서 잡는다.
   */
  it("U-2 선택 타입이 FirstRunChoice이고 값이 continue·cancel이다", () => {
    // 주석을 먼저 덮는다. 앵커 없는 첫 매치라 실물 선언을 주석으로 돌리고 다른 값으로
    // 되살리면 주석 쪽이 첫 매치가 되어 **조용히 그린**이 된다. 문자열은 남긴다 — 값
    // 둘이 곧 문자열 리터럴이라 함께 덮으면 이 단정이 공허하게 참이 된다.
    const source = maskComments(readFileSync(join(SRC_DIR, "first-run.ts"), "utf8"));
    const declaration = /export type FirstRunChoice\s*=([^;]*);/.exec(source);

    expect(declaration, "FirstRunChoice 선언을 찾지 못했다").not.toBeNull();
    const members = [...(declaration?.[1] ?? "").matchAll(/"([^"]*)"/g)].map((match) => match[1]);
    expect(members.slice().sort()).toEqual(["cancel", "continue"]);
  });

  /** U-3 — 식별자 층에 알약 어휘가 없다. 화면 문면·라벨은 문자열이므로 이 축 밖이다 */
  it("U-3 packages/*/src의 식별자 층에 알약 어휘가 없다", () => {
    const offenders: string[] = [];
    for (const entry of readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(PACKAGES_DIR, entry.name, "src");
      if (!existsSync(dir)) continue;
      for (const file of sourceFiles(dir)) {
        for (const line of worldVocabularyHits(readFileSync(file, "utf8"))) {
          offenders.push(`${file}:${line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

/* ============================================================================
 * W. 오늘의 동작 기록
 *
 * 이 둘이 서 있던 자리를 §2.1이 2026-08-22에 규율했다 — 앞엣것은 자리 소절이 관문 자리
 * 근거의 범위를 관문 **앞**(1~3b)으로 못박고 그 뒤 단계의 실패를 §2 말미의 실패 갈래로
 * 넘긴 것이고, 뒤엣것은 문면 소절이 ②의 모집단과 시제 제약을 정한 것이다.
 *
 * **그래도 아래 둘은 계약을 만드는 단정이 아니라 오늘의 동작을 못박는 기록이다** — 각
 * 술어가 재는 것이 그 규율 자체가 아니라 그것이 기대는 전제이기 때문이다. 붉어졌을 때
 * 무엇이 갈리는지는 각 단정의 주석이 절 이름으로 든다.
 * ========================================================================== */

describe("W. 오늘의 동작 기록 (CLI-INTERFACE §2.1)", () => {
  /**
   * W-1 — `--resume`에 없는 접두를 주면, 관문을 통과해 홈이 생긴 **뒤** 시작 시퀀스 5가
   * 실패한다.
   *
   * **구현도 자리 규정도 무죄다** (§2.1 자리 소절, 2026-08-22). 관문을 3b 뒤에 둔 근거가
   * 덮는 것은 관문 **앞**의 단계(1~3b)뿐이고, 관문 **뒤** 단계(4 이후)의 실패는 그 근거
   * 밖이다 — 그 실패는 §2 말미의 실패 갈래(원인과 다음 행동을 담은 에러로 종료)가 든다.
   * 관문이 동의를 구한 대상은 홈에 상태를 만드는 것이고 4가 끝난 시점에 그것은 이행됐다.
   *
   * **그래서 이 단정은 계약 위반을 재지 않는다.** 오늘의 종료 코드와 홈 생성 여부를 못박을
   * 뿐이고, 붉어지면 갈리는 것은 §2 말미 쪽이다 — 그 절의 실패 갈래를 다시 읽는다.
   */
  it("W-1 --resume의 미존재 접두 + 진행 = 홈이 생긴 뒤 기동 실패", async () => {
    const all = await discover();
    const key = pick(keysOf(all, "PROCEED"), "진행").key;
    const run = await startRun({ argv: ["--resume", "없는접두"] });
    await waitForGate(run);

    run.write(key);
    expect(await waitFor(() => run.settled(), 5000)).toBe(true);

    expect(run.exit(), "오늘은 실패로 끝난다").not.toBe(EXIT_OK);
    expect(run.dbExists(), "오늘은 실패 전에 홈이 이미 생긴다").toBe(true);

    await run.dispose();
  }, 300_000);

  /**
   * W-2 — 문면이 이름으로 든 넷 중 **계속 직후 실제로 생기는 것은 하나뿐**이다. 나머지
   * 셋은 각자의 첫 쓰임에서 생긴다.
   *
   * **그래도 넷을 그대로 드는 것이 계약이다** (§2.1 문면 소절, 2026-08-22). ②의 모집단은
   * «계속 직후 생기는 것»이 아니라 «이 홈 아래 살게 될 것»이고, 즉시 생기는 하나로 좁히면
   * 나머지 셋이 나중에 조용히 생긴다. 같은 소절이 시제에 거는 제약은 한 줄이 전부다 —
   * 문면은 넷 중 어느 것도 계속 직후 이미 존재한다고 단정하지 않는다. 그것을 어떤
   * 시제·어순으로 이루는지는 §12에 남겨 둔 세부다.
   *
   * **이 단정이 재는 것은 그 제약의 «전제»이지 제약 자체가 아니다.** 제약은 문면의 단정에
   * 걸리는데 이 술어는 파일 시스템만 본다 — 문면을 재지 않으므로 그 계약 문장은 여기서
   * 무커버리지다. 그래서 붉어지면 갈리는 것은 구현이 아니라 전제이고, 그때 §2.1 문면
   * 소절을 다시 연다.
   */
  it("W-2 계속 직후에는 넷 중 sessions.db만 있다", async () => {
    const all = await discover();
    const key = pick(keysOf(all, "PROCEED"), "진행").key;
    const run = await startRun();
    await waitForGate(run);

    run.write(key);
    expect(await waitFor(() => run.dbExists())).toBe(true);
    await sleep(150);

    expect(existsSync(defaultConfigPath(run.home))).toBe(false);
    expect(existsSync(defaultAllowlistPath(run.home))).toBe(false);
    expect(existsSync(defaultMemoryDir(run.home))).toBe(false);

    await run.dispose();
  }, 300_000);
});

/* ============================================================================
 * V. 역검증 — 위반을 넣어 실제로 잡히는지 본다
 *
 * 새로 만든 검사가 무엇이든 통과시키는 것이면 그린은 아무것도 뜻하지 않는다. 여기서는
 * 위 블록이 실제로 쓰는 **그 술어들**에 일부러 망가뜨린 입력을 먹인다.
 * ========================================================================== */

describe("V. 역검증 — 술어가 위반을 잡는가", () => {
  const HOME = "/tmp/neo-qa-home/.neo-agent";
  const NAMES = ["sessions.db", "config.json", "allowlist", "memory"];
  const GOOD = [
    `계속하면 이 경로에 상태가 생긴다: ${HOME}`,
    "  sessions.db  세션 기록",
    "  config.json  설정",
    "  allowlist    승인 allowlist",
    "  memory/      메모리",
    "취소하면 아무것도 생기지 않는다.",
  ].join("\n");

  it("V-1 온전한 문면은 통과한다 — 술어가 늘 붉지는 않다", () => {
    expect(missingFacts(GOOD, HOME, NAMES)).toEqual([]);
    expect(missingConcepts(GOOD)).toEqual([]);
  });

  /**
   * 치환이므로 절대 경로가 사라지고 틸데 **단독**만 남는다 — §2.1이 여전히 금하는 그 형태이고,
   * 남은 긍정 축 하나가 그것을 잡는다(2026-08-22 `K-230`).
   */
  it("V-2 절대 경로를 틸데 단독으로 바꾸면 잡힌다", () => {
    const mutant = GOOD.replace(HOME, TILDE_FORM);
    expect(missingFacts(mutant, HOME, NAMES)).toContain("①경로-해석된-절대경로");
  });

  it("V-3 이름 넷 중 하나를 지우면 잡힌다", () => {
    for (const name of NAMES) {
      const mutant = GOOD.split(name).join("");
      expect(missingFacts(mutant, HOME, NAMES)).toContain(`②이름:${name}`);
    }
  });

  it("V-4 취소 사실을 지우면 잡힌다", () => {
    const mutant = GOOD.replace("취소하면 아무것도 생기지 않는다.", "");
    expect(missingFacts(mutant, HOME, NAMES)).toContain("③취소-무생성");
    // 낱말만 남고 부정이 사라진 형태도 잡는다.
    const flipped = GOOD.replace("취소하면 아무것도 생기지 않는다.", "취소해도 상태는 남는다.");
    expect(missingFacts(flipped, HOME, NAMES)).toContain("③취소-무생성");
  });

  it("V-5 개념 넷 중 하나를 지우면 잡힌다", () => {
    expect(missingConcepts(GOOD.split("메모리").join(""))).toEqual(["메모리"]);
  });

  it("V-6 확인 표시의 이름이 뒤바뀌면 잡힌다", () => {
    expect(confirmationFindings(`  → ${CANCEL_NAME}`, PROCEED_NAME, CANCEL_NAME)).toEqual([
      `고르지-않은-쪽-이름:${CANCEL_NAME}`,
      `고른-쪽-이름-없음:${PROCEED_NAME}`,
    ]);
    // 대비쌍 — 올바른 대응은 비어야 한다.
    expect(confirmationFindings(`  → ${PROCEED_NAME}`, PROCEED_NAME, CANCEL_NAME)).toEqual([]);
  });

  it("V-7 식별자 층의 알약 어휘를 잡고 문자열·주석은 잡지 않는다", () => {
    expect(worldVocabularyHits('type PillChoice = "red" | "blue";\n')).toEqual([1]);
    expect(worldVocabularyHits("const redPill = 1;\n")).toEqual([1]);
    // 화면 문면과 라벨은 §2.1이 허용하는 층이다 — 잡히면 안 된다.
    expect(worldVocabularyHits('const label = "Red Pill — 계속한다";\n')).toEqual([]);
    expect(worldVocabularyHits("// Blue Pill과 같은 귀결이다\n")).toEqual([]);
    expect(worldVocabularyHits("/** Blue Pill을 고른 상태 */\nconst a = 1;\n")).toEqual([]);
    // 템플릿 리터럴 — 바깥은 문자열이고 `${}` 안은 식별자 층이다. 아래 두 줄의 문자열은
    // 술어에 먹일 **원문 표본**이라 자리표시자가 그대로 남아 있어야 한다.
    // biome-ignore lint/suspicious/noTemplateCurlyInString: 표본 원문이다
    expect(worldVocabularyHits("const t = `Red Pill ${bluePill}`;\n")).toEqual([1]);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: 표본 원문이다
    expect(worldVocabularyHits("const t = `Red Pill ${label}`;\n")).toEqual([]);
  });
});
