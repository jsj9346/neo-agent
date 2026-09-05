/**
 * 독립 QA — 설정 쓰기 표면의 계약 여덟이 실물로 서 있는가 (`docs/CLI-INTERFACE.md` §3.2).
 *
 * 대상은 넷이다: `packages/cli/src/config.ts` · `config-surface.ts` · `wiring.ts` ·
 * `registry.ts`.
 *
 * **기대값의 출처는 정본 문서뿐이다** — §3.2(계약 여덟과 원자적 쓰기 문단) · §3(키 여덟과
 * 시작 시 동결) · §5(닫힌 목록과 명령 1개 + 인자) · §7(표시 문면의 지위) · 문서 머리의
 * 불변과 조정 가능 분류. 구현을 읽어 기대값을 정하지 않는다 — 그러면 구현이 옳았다는 것을
 * 구현으로 증명하는 순환이 된다. 실물이 문서와 갈리면 문서 편에 서고 red를 그대로 남긴다.
 *
 * 여덟 키의 이름과 닫힌 목록의 명령 이름은 **정본 문서의 표에서 파싱해** 온다. 손으로 옮겨
 * 적으면 다음 개정에 조용히 낡고, 그 낡음은 이 파일이 재려는 부류와 정확히 같다. 파싱이
 * 0건을 내면 통과가 아니라 실패다(fail-closed).
 *
 * 재는 축 — 플랜 `plans/20260905-config-surface-plan.md` T-007의 매핑 표와 1:1이다.
 *
 *   A. 계약 8 — 키 메타데이터가 완전 레코드다 (문서 §3 표와의 이름 집합 대조 포함)
 *   B. 계약 5 — 쓰기 대상 일곱과 조회 전용 하나
 *   C. 계약 4 — 쓰기 전 검증이 시작 시 검증과 같은 코드다
 *   D. 원자적 쓰기 문단 — 모드·디렉터리·키 집합·키 순서·실패 시 원본 무변경
 *   E. §5 — 명령 1개 + 인자, 그리고 사용법 에러
 *   F. 계약 1·2 — 파일만 바뀌고 동결 객체는 그대로다
 *   G. 계약 3 — 여덟 키 전부·두 상태·경로·적용 시점·조회는 죽지 않는다
 *   H. 계약 6 — 확인을 두지 않고 낮아짐을 명시한다
 *   I. 계약 7 — 거부 고지가 다음 한 수를 든다
 *   J. 자기 축 — §7의 리터럴 금지를 이 파일 자신에 대해 잰다
 *
 * **F-3·G-4는 그 매핑 표에 없다** — 변이 검증(`plans/20260905-config-surface-mutation-report.md`
 * F-1)이 낸 커버리지 구멍을 닫는 축이다. 그 구멍은 관측면이 갈려 있다는 것이었다: F-1이 보는
 * 것은 조립이 든 설정 객체이고 화면의 세션 열이 읽는 것은 슬래시 동작이 받은 환경의 설정인데,
 * 둘을 묶는 단언이 없어 뒤엣것만 쓰기 뒤에 다시 읽어 갈아끼우면 게이트가 그린인 채로 화면이
 * 거짓을 단언했다. 두 상태를 재던 유일한 축(G-2)은 파일을 바깥에서 고친 경우만 재고 이 명령
 * 자신의 쓰기가 낳은 갈림은 재지 않았다. 두 축 다 그 쓰기 직후의 조회 출력을 잰다.
 *
 * **J가 자기 축인 이유**: `packages/cli/test/renderer-literal-policy.qa.test.ts`의 리터럴
 * 정책 판별기는 대상이 한 파일로 고정돼 있어 이 파일을 안 덮는다. 자기 소스를 읽어 스스로
 * 재지 않으면 §7의 금지를 이 자리에서 재는 기계가 없다.
 *
 * **관측 밖으로 남긴 것 하나** — 원자적 쓰기의 임시 파일이 대상 디렉터리 안에 만들어지는가는
 * 프로세스 밖에서 결정적으로 관측할 수단이 없다. 성공하면 흔적이 없고 실패해도 정리되며, 두
 * 배치(대상 디렉터리 안과 밖)가 같은 관측을 낸다. 여기서는 그 문단의 나머지 주장을 재고 위치
 * 자체의 대조는 구조 감사에 남긴다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 이 파일은 그 위험을
 * 아예 피한다: 정본 문면을 인용부호로 감싸지 않고 전부 서술로 쓴다. 문서를 줄번호로 가리키는
 * 자리는 이 규약의 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호로만 한다.
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import type { ModelClient, ModelRequest, ModelStreamEvent, TokenUsage } from "@neo-agent/core";
import type { ShellExecResult, ShellExecutor } from "@neo-agent/tools";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CliArgs } from "../src/args.ts";
import { type CliConfig, loadConfig } from "../src/config.ts";
import {
  CONFIG_KEY_META,
  CONFIG_KEYS,
  type ConfigScalar,
  type ConfigWriteResult,
  lookupConfigKey,
  WRITABLE_CONFIG_KEYS,
  type WritableConfigKey,
  writeConfigValue,
} from "../src/config-surface.ts";
import { API_KEY_ENV } from "../src/credentials.ts";
import {
  type CliActions,
  type CliContext,
  findSlashCommand,
  SLASH_COMMANDS,
} from "../src/registry.ts";
import type { CliApp, CliDeps } from "../src/wiring.ts";
import { startCli } from "../src/wiring.ts";
import { dockerProbeForbidden } from "./probe-docker.ts";

const path = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

/** 이 파일 자신의 원문 — 축 J가 쓴다. 파일 이름을 적지 않는다(적으면 개명 때 낡는다) */
const SELF_SOURCE = readFileSync(fileURLToPath(import.meta.url), "utf8");

const DOC = readFileSync(path("../../../docs/CLI-INTERFACE.md"), "utf8");

/* ------------------------------------------------------------------------ *
 * 정본에서 기대값을 뽑는다 — 표지가 없으면 던진다(fail-closed)
 * ------------------------------------------------------------------------ */

function slice(from: string, to: string, label: string): string {
  const start = DOC.indexOf(from);
  const end = DOC.indexOf(to, start === -1 ? 0 : start);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`${label}: 정본에서 구간을 뽑지 못했다 — 문서가 개편됐으면 이것부터 고친다`);
  }
  return DOC.slice(start, end);
}

/** §3 설정 표의 키 이름과 타입 표기. 순서는 표의 순서 그대로다 */
const DOC_KEY_ROWS: readonly (readonly [string, string])[] = (() => {
  const section = slice("\n## 3. 설정 파일", "\n### 3.1 ", "§3 설정 표");
  const rows: [string, string][] = [];
  for (const line of section.split("\n")) {
    const match = /^\|\s*`([A-Za-z][A-Za-z0-9]*)`\s*\|\s*([^|]+?)\s*\|/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) rows.push([match[1], match[2]]);
  }
  if (rows.length === 0) throw new Error("§3 표에서 키를 하나도 못 뽑았다");
  return rows;
})();

const DOC_KEYS: readonly string[] = DOC_KEY_ROWS.map(([key]) => key);

/** 값이 한 토큰으로 안 닫히는 키 — §3 표에서 배열 타입인 행이다(계약 5의 근거 첫째) */
const DOC_ARRAY_KEYS: readonly string[] = DOC_KEY_ROWS.filter(([, type]) =>
  type.includes("string[]"),
).map(([key]) => key);

/** §5 표의 닫힌 목록 */
const DOC_COMMANDS: readonly string[] = (() => {
  const section = slice("\n## 5. 명령 표면", "\n## 6. ", "§5 명령 표");
  const names = section
    .split("\n")
    .map((line) => /^\|\s*`(\/[a-z]+)(?:\s[^`]*)?`/.exec(line)?.[1])
    .filter((name): name is string => name !== undefined);
  if (names.length === 0) throw new Error("§5 표에서 명령을 하나도 못 뽑았다");
  return names;
})();

/* ------------------------------------------------------------------------ *
 * 표본 값 — 타입은 §3 표가 정하고, 구체 값은 이 파일이 고른 주입 데이터다
 * ------------------------------------------------------------------------ */

const SAMPLE_TOKEN: Readonly<Record<string, string>> = {
  approvalMode: "off",
  model: "qa-model-9",
  compactionAuto: "false",
  compactionThreshold: "0.5",
  compactionKeepRecentTurns: "3",
  sandbox: "off",
  sandboxImage: "debian:bullseye-slim",
};

const SAMPLE_VALUE: Readonly<Record<string, ConfigScalar>> = {
  approvalMode: "off",
  model: "qa-model-9",
  compactionAuto: false,
  compactionThreshold: 0.5,
  compactionKeepRecentTurns: 3,
  sandbox: "off",
  sandboxImage: "debian:bullseye-slim",
};

/* ------------------------------------------------------------------------ *
 * 파일 층 하네스 — 임시 홈 하나. 실 홈을 알아내는 경로는 이 파일에 없다
 * ------------------------------------------------------------------------ */

let home = "";
let agentDir = "";
let configPath = "";
let workspace = "";

beforeEach(() => {
  home = realpathSync(mkdtempSync(join(tmpdir(), "neo-config-qa-")));
  agentDir = join(home, ".neo-agent");
  configPath = join(agentDir, "config.json");
  mkdirSync(agentDir, { recursive: true, mode: 0o700 });
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "neo-config-ws-")));
});

afterEach(() => {
  if (existsSync(agentDir)) chmodSync(agentDir, 0o700);
  rmSync(home, { recursive: true, force: true });
  rmSync(workspace, { recursive: true, force: true });
});

function writeRecord(record: Record<string, unknown>): void {
  writeFileSync(configPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
}

function raw(): string {
  return readFileSync(configPath, "utf8");
}

/** 시작 시 로더가 지금 파일에 대해 내는 문면. 안 던지면 빈 문자열 */
function startupRefusal(): string {
  try {
    loadConfig(configPath);
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function set(key: WritableConfigKey, token: string): ConfigWriteResult {
  const lookup = lookupConfigKey(key);
  if (lookup.kind !== "writable") throw new Error(`${key}: 쓰기 가능한 키가 아니다`);
  const parsed = lookup.meta.parseToken(token);
  if (!parsed.ok) throw new Error(`${key}: 토큰을 읽지 못했다`);
  return writeConfigValue(configPath, lookup.key, parsed.value);
}

/* ------------------------------------------------------------------------ *
 * REPL 층 하네스 — 실물을 조립해 끝에서 끝까지 돌린다
 * ------------------------------------------------------------------------ */

const ZERO_USAGE: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/** 요청을 기록만 하는 모델. 계약 2의 흐름 축이 이 기록을 읽는다 */
class RecordingModel implements ModelClient {
  readonly modelId = "qa-config/recorder";
  readonly requests: ModelRequest[] = [];

  async *stream(request: ModelRequest, _signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
    this.requests.push(structuredClone(request) as ModelRequest);
    yield {
      type: "done",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "확인" }],
        stopReason: "end_turn",
        usage: ZERO_USAGE,
        timestamp: 0,
      },
    };
  }
}

function stubExecutor(): ShellExecutor {
  return {
    async exec(request): Promise<ShellExecResult> {
      return {
        exitCode: 0,
        stdout: `stub:${request.command}`,
        stderr: "",
        truncated: false,
        timedOut: false,
      };
    },
  };
}

interface Rig {
  app: CliApp;
  running: Promise<void>;
  input: PassThrough;
  model: RecordingModel;
  text(): string;
}

function stripAnsi(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI 제거가 목적이다
  return text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

async function settle(rounds = 40): Promise<void> {
  for (let index = 0; index < rounds; index += 1) await tick();
}

/**
 * 3c 관문(§2.1)의 판정 재료는 저장소 파일의 부재 하나뿐이므로 빈 파일 하나면 관문을 지난다.
 * 이 파일이 재는 것은 §3.2이지 관문이 아니다.
 */
function seedReturningHome(): void {
  writeFileSync(join(agentDir, "sessions.db"), "", { mode: 0o600 });
  chmodSync(join(agentDir, "sessions.db"), 0o600);
}

async function start(): Promise<Rig> {
  seedReturningHome();
  const input = new PassThrough();
  const output = new PassThrough() as PassThrough & { columns?: number };
  output.columns = 120;
  const chunks: string[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf8")));

  const model = new RecordingModel();
  const deps: CliDeps = {
    argv: [],
    env: { [API_KEY_ENV]: "sk-ant-테스트" },
    cwd: workspace,
    home,
    io: { input, output },
    version: "0.0.0-qa-config",
    factories: {
      createModelClient: () => model,
      probeDocker: dockerProbeForbidden(),
      createExecutor: () => stubExecutor(),
    },
  };
  const args: CliArgs = { kind: "run" };
  const app = await startCli(deps, args);
  const running = app.run();
  await settle(10);
  return { app, running, input, model, text: () => stripAnsi(chunks.join("")) };
}

async function stop(rig: Rig): Promise<void> {
  await rig.app.shutdown();
  await rig.running;
}

/**
 * 한 줄을 치고 그 줄이 낳은 출력만 돌려준다.
 *
 * 앞에 붙는 입력 라인 되그리기를 걷어내려고 마지막 에코 뒤에서 자른다 — 걷어내지 않으면
 * 명령 문자열 자체가 출력에 섞여 서로 다른 명령의 출력이 그것만으로 갈린다.
 */
async function runLine(rig: Rig, line: string, rounds = 40): Promise<string> {
  const before = rig.text().length;
  rig.input.write(`${line}\r`);
  await settle(rounds);
  const delta = rig.text().slice(before);
  // 첫 에코 뒤에서 자른다. 마지막 자리를 잡으면 고지가 되돌리는 수단으로 같은 명령을 들 때
  // 그 문장 안에서 잘려 출력이 통째로 사라진다.
  const at = delta.indexOf(line);
  return at === -1 ? delta : delta.slice(at + line.length);
}

/* ------------------------------------------------------------------------ *
 * A. 계약 8 — 키 메타데이터는 완전 레코드다
 * ------------------------------------------------------------------------ */

describe("A. CLI-INTERFACE §3.2 계약 8 — 키 메타데이터가 여덟을 전부 든다", () => {
  it("A-1 메타데이터의 키 집합이 정본 §3 표의 여덟과 같다", () => {
    // 근거: 계약 8은 표시 메타데이터를 CliConfig의 키 전부에 대한 레코드로 못박고, §12는
    // 문서 표와의 대조가 그 타입 밖이라고 적는다. 그래서 이 축이 기대값을 표에서 뽑는다.
    expect(DOC_KEYS.length, "정본 §3 표의 행 수").toBe(8);
    expect([...CONFIG_KEYS].sort()).toEqual([...DOC_KEYS].sort());
    expect(Object.keys(CONFIG_KEY_META).sort()).toEqual([...DOC_KEYS].sort());
  });

  it("A-2 런타임 설정 객체의 키 집합도 같은 여덟이다", () => {
    // 로더가 돌려주는 것이 곧 설정 타입의 실물 키 집합이다. 메타데이터가 타입으로 묶인
    // 상대가 이것이므로 셋이 함께 서야 계약 8이 공허하지 않다.
    writeRecord({});
    expect(Object.keys(loadConfig(configPath)).sort()).toEqual([...DOC_KEYS].sort());
  });

  it("A-3 키마다 비어 있지 않고 서로 다른 사람 언어 라벨이 있다", () => {
    // 근거: 계약 8은 키 이름을 그대로 내는 것이 안내가 아니라는 데서 라벨을 요구한다.
    // 문면 자체는 세부이므로(문서 머리) 여기서 재는 것은 존재와 구별뿐이다.
    const labels = CONFIG_KEYS.map((key) => CONFIG_KEY_META[key].label);
    expect(labels.filter((label) => label.trim() === "")).toEqual([]);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.filter((label) => DOC_KEYS.includes(label))).toEqual([]);
  });
});

/* ------------------------------------------------------------------------ *
 * B. 계약 5 — 쓰기 일곱 · 조회 전용 하나
 * ------------------------------------------------------------------------ */

describe("B. CLI-INTERFACE §3.2 계약 5 — 쓰기 대상은 일곱이고 배열 키는 조회 전용이다", () => {
  it("B-1 쓰기 가능 집합이 여덟에서 배열 키를 뺀 일곱이다", () => {
    expect(DOC_ARRAY_KEYS.length, "정본 §3 표의 배열 타입 행").toBe(1);
    expect([...WRITABLE_CONFIG_KEYS].sort()).toEqual(
      DOC_KEYS.filter((key) => !DOC_ARRAY_KEYS.includes(key)).sort(),
    );
    expect(WRITABLE_CONFIG_KEYS).toHaveLength(7);
  });

  it("B-2 배열 키는 조회 전용으로, 모르는 키는 미지로 갈린다", () => {
    // 근거: §5는 모르는 키도 배열 키도 사용법 에러라고 적지만, 계약 7이 다음 행동을
    // 요구하므로 둘이 같은 갈래로 뭉개지면 손편집이라는 정당한 경로가 화면에서 사라진다.
    for (const key of DOC_ARRAY_KEYS) expect(lookupConfigKey(key).kind).toBe("read-only");
    expect(lookupConfigKey("approvalmode").kind).toBe("unknown");
    expect(lookupConfigKey("denyrules").kind).toBe("unknown");
    for (const key of WRITABLE_CONFIG_KEYS) expect(lookupConfigKey(key).kind).toBe("writable");
  });

  it("B-3 일곱 각각이 실제로 파일에 써지고 다음 로드가 그 값을 낸다", () => {
    for (const key of WRITABLE_CONFIG_KEYS) {
      writeRecord({});
      const token = SAMPLE_TOKEN[key];
      expect(token, `${key}: 표본 토큰이 없다`).toBeDefined();
      const result = set(key, token ?? "");
      expect(result.outcome, `${key}: ${JSON.stringify(result)}`).toBe("applied");
      expect(loadConfig(configPath)[key]).toEqual(SAMPLE_VALUE[key]);
    }
  });
});

/* ------------------------------------------------------------------------ *
 * C. 계약 4 — 쓰기 전 검증은 시작 시 검증과 같은 코드다
 * ------------------------------------------------------------------------ */

describe("C. CLI-INTERFACE §3.2 계약 4 — 쓰기 전 검증이 시작 시 검증과 같다", () => {
  /** 계약 4가 이름으로 든 판정 셋의 표본. 값은 §3 표의 유효 구간 밖이다 */
  const BAD: readonly (readonly [WritableConfigKey, string, unknown])[] = [
    ["compactionThreshold", "1.5", 1.5],
    ["compactionThreshold", "0", 0],
    ["compactionKeepRecentTurns", "0", 0],
    ["compactionKeepRecentTurns", "1.5", 1.5],
    ["sandboxImage", "debian:latest", "debian:latest"],
    ["sandboxImage", "debian", "debian"],
  ];

  it("C-1 구간과 고정 태그 위반이 쓰기 경로에서도 거부되고 문면이 시작 시와 같다", () => {
    for (const [key, token, value] of BAD) {
      writeRecord({});
      const before = raw();
      const result = set(key, token);
      expect(result.outcome, `${key}: 거부되지 않았다`).toBe("refused");
      if (result.outcome !== "refused") continue;
      expect(result.reason, `${key}`).toBe("new-value-invalid");
      expect(raw(), `${key}: 거부인데 파일이 바뀌었다`).toBe(before);

      // 같은 레코드를 시작 시 로더에 먹였을 때의 문면과 글자 그대로 같아야 한다 —
      // 이것이 검증기가 한 곳이라는 것의 관측 가능한 형태다.
      writeRecord({ [key]: value });
      expect(result.detail, `${key}: 시작 시 문면과 갈렸다`).toBe(startupRefusal());
    }
  });

  it("C-2 지금 파일이 유효하지 않으면 거부하고 파일을 안 건드린다 (fail-closed)", () => {
    const cases: readonly Record<string, unknown>[] = [
      { approvalmode: "off" },
      { compactionThreshold: 5 },
      { sandboxImage: "debian:latest" },
    ];
    for (const record of cases) {
      writeRecord(record);
      const before = raw();
      const expected = startupRefusal();
      const result = set("model", "qa-model-9");
      expect(result.outcome, JSON.stringify(record)).toBe("refused");
      if (result.outcome !== "refused") continue;
      expect(result.reason, JSON.stringify(record)).toBe("current-file-invalid");
      expect(result.detail, JSON.stringify(record)).toBe(expected);
      expect(raw(), JSON.stringify(record)).toBe(before);
    }
  });

  it("C-3 읽을 수 없는 파일도 같은 갈래로 거부한다", () => {
    writeFileSync(configPath, "{ 이건 JSON이 아니다", { mode: 0o600 });
    const before = raw();
    const expected = startupRefusal();
    const result = set("model", "qa-model-9");
    expect(result.outcome).toBe("refused");
    if (result.outcome !== "refused") return;
    expect(result.reason).toBe("current-file-invalid");
    expect(result.detail).toBe(expected);
    expect(raw()).toBe(before);
  });

  it("C-4 파일 부재는 유효한 상태다 — 새로 만들고 저장소 파일은 안 만든다", () => {
    // 근거: §3은 파일이 없으면 전부 기본값이라 적고, §3.2는 그 상태의 쓰기가 파일을 새로
    // 만든다고 적는다. 첫 기동 판정의 재료는 저장소 파일의 부재뿐이므로(§2.1) 이 생성이
    // 그 관문을 건드리면 안 된다.
    rmSync(agentDir, { recursive: true, force: true });
    const result = set("compactionKeepRecentTurns", "3");
    expect(result.outcome).toBe("applied");
    if (result.outcome !== "applied") return;
    expect(result.createdFile).toBe(true);
    expect(loadConfig(configPath).compactionKeepRecentTurns).toBe(3);
    expect(existsSync(join(agentDir, "sessions.db"))).toBe(false);
    expect(readdirSync(agentDir)).toEqual(["config.json"]);
  });

  it("C-5 읽을 수 없는 토큰은 값이 되지 않는다 (§5 사용법 에러의 재료)", () => {
    // 근거: §12는 토큰 파싱 규칙 자체를 구현 세부로 두되, 읽을 수 없는 토큰이 조용히 값이
    // 되지 않는다는 것만 계약으로 남긴다.
    const cases: readonly (readonly [WritableConfigKey, string])[] = [
      ["compactionAuto", "yes"],
      ["compactionAuto", "1"],
      ["compactionThreshold", "0x1"],
      ["compactionThreshold", ""],
      ["compactionKeepRecentTurns", "셋"],
    ];
    for (const [key, token] of cases) {
      const lookup = lookupConfigKey(key);
      expect(lookup.kind).toBe("writable");
      if (lookup.kind !== "writable") continue;
      const parsed = lookup.meta.parseToken(token);
      expect(parsed.ok, `${key}: 읽혔다`).toBe(false);
      if (parsed.ok) continue;
      expect(parsed.expected.trim(), `${key}`).not.toBe("");
    }
  });
});

/* ------------------------------------------------------------------------ *
 * D. 원자적 쓰기 문단
 * ------------------------------------------------------------------------ */

describe("D. CLI-INTERFACE §3.2 원자적 쓰기 — 모드·키 집합·키 순서·실패 시 원본", () => {
  it("D-1 쓰기 뒤 파일 모드가 0600이고 디렉터리는 0700이다", () => {
    rmSync(agentDir, { recursive: true, force: true });
    expect(set("model", "qa-model-9").outcome).toBe("applied");
    expect(statSync(configPath).mode & 0o777).toBe(0o600);
    expect(statSync(agentDir).mode & 0o777).toBe(0o700);
  });

  it("D-2 키 집합은 이전 집합에 바꾼 키 하나를 더한 것이다 — 기본값이 안 번진다", () => {
    writeRecord({ model: "qa-model-0" });
    expect(set("compactionAuto", "false").outcome).toBe("applied");
    expect(Object.keys(JSON.parse(raw()) as object)).toEqual(["model", "compactionAuto"]);

    // 이미 있던 키를 바꾸면 집합이 안 늘어난다
    expect(set("model", "qa-model-9").outcome).toBe("applied");
    expect(Object.keys(JSON.parse(raw()) as object)).toEqual(["model", "compactionAuto"]);
  });

  it("D-3 기존 키 순서가 보존되고 새 키만 끝에 붙는다", () => {
    writeRecord({ sandbox: "off", compactionAuto: true, model: "qa-model-0" });
    expect(set("model", "qa-model-9").outcome).toBe("applied");
    expect(Object.keys(JSON.parse(raw()) as object)).toEqual([
      "sandbox",
      "compactionAuto",
      "model",
    ]);
    expect(set("compactionKeepRecentTurns", "3").outcome).toBe("applied");
    expect(Object.keys(JSON.parse(raw()) as object)).toEqual([
      "sandbox",
      "compactionAuto",
      "model",
      "compactionKeepRecentTurns",
    ]);
  });

  it("D-4 쓰기가 실패하면 원본이 그대로이고 잔여물이 없다", () => {
    writeRecord({ model: "qa-model-0" });
    const before = raw();
    chmodSync(agentDir, 0o500);
    const result = set("model", "qa-model-9");
    chmodSync(agentDir, 0o700);

    expect(result.outcome).toBe("refused");
    if (result.outcome !== "refused") return;
    expect(result.reason).toBe("write-failed");
    expect(raw()).toBe(before);
    expect(readdirSync(agentDir)).toEqual(["config.json"]);
  });

  it("D-5 성공한 쓰기도 임시 파일을 남기지 않고 결과가 다시 읽힌다", () => {
    writeRecord({ model: "qa-model-0" });
    expect(set("model", "qa-model-9").outcome).toBe("applied");
    expect(readdirSync(agentDir)).toEqual(["config.json"]);
    expect(() => JSON.parse(raw())).not.toThrow();
    expect(loadConfig(configPath).model).toBe("qa-model-9");
  });
});

/* ------------------------------------------------------------------------ *
 * E. §5 — 명령 1개 + 인자, 사용법 에러
 * ------------------------------------------------------------------------ */

interface Probe {
  ctx: CliContext;
  calls: string[];
}

function probeContext(): Probe {
  const calls: string[] = [];
  const record =
    (name: string) =>
    async (...args: unknown[]): Promise<void> => {
      calls.push(`${name}:${args.join("|")}`);
    };
  const actions: CliActions = {
    listSessions: record("listSessions"),
    resumeSession: record("resumeSession"),
    newSession: record("newSession"),
    deleteSession: record("deleteSession"),
    search: record("search"),
    compact: record("compact"),
    showMemory: record("showMemory"),
    forgetMemory: record("forgetMemory"),
    showConfig: record("showConfig"),
    setConfigValue: record("setConfigValue"),
    exit: record("exit"),
  };
  return { ctx: { out: { write: () => undefined }, actions }, calls };
}

describe("E. CLI-INTERFACE §5 — 명령 1개 + 인자, 나머지는 사용법 에러", () => {
  it("E-1 닫힌 목록이 정본 §5 표와 같다", () => {
    expect(DOC_COMMANDS.length).toBeGreaterThanOrEqual(10);
    expect(SLASH_COMMANDS.map((command) => command.name).sort()).toEqual([...DOC_COMMANDS].sort());
  });

  it("E-2 인자가 없으면 조회, set 두 토큰이면 쓰기다", async () => {
    const command = findSlashCommand("/config");
    expect(command).toBeDefined();
    if (command === undefined) return;

    const bare = probeContext();
    await command.run("", bare.ctx);
    expect(bare.calls).toEqual(["showConfig:"]);

    const write = probeContext();
    await command.run("set model qa-model-9", write.ctx);
    expect(write.calls).toEqual(["setConfigValue:model|qa-model-9"]);
  });

  it("E-3 모르는 하위 동작과 토큰 수가 둘이 아닌 입력은 사용법 에러다", async () => {
    const command = findSlashCommand("/config");
    expect(command).toBeDefined();
    if (command === undefined) return;

    for (const args of ["bogus", "SET model qa", "set", "set model", "set model qa extra"]) {
      const probe = probeContext();
      await expect(command.run(args, probe.ctx), args).rejects.toThrow();
      expect(probe.calls, `${args}: 조용히 동작이 불렸다`).toEqual([]);
    }
  });

  it("E-4 표시 동작과 쓰기 동작의 반환은 값이 아니다", () => {
    // 근거: §3.2는 조회가 읽은 값이 표시 밖으로 흐르지 않는다고 적고 그 수단으로 반환을
    // 지목한다. 타입이 그 계약의 운반체이므로 여기서 타입으로 고정한다.
    type ShowVoid = ReturnType<CliActions["showConfig"]> extends Promise<void> ? true : false;
    type SetVoid = ReturnType<CliActions["setConfigValue"]> extends Promise<void> ? true : false;
    const showIsVoid: ShowVoid = true;
    const setIsVoid: SetVoid = true;
    expect([showIsVoid, setIsVoid]).toEqual([true, true]);
  });
});

/* ------------------------------------------------------------------------ *
 * F. 계약 1·2 — 파일만 바뀐다
 * ------------------------------------------------------------------------ */

describe("F. CLI-INTERFACE §3.2 계약 1·2 — 파일만 바뀌고 동결 객체는 그대로다", () => {
  it("F-1 set 뒤 동결 객체는 그대로이고 파일만 바뀐다", async () => {
    writeRecord({
      model: "qa-model-0",
      compactionAuto: false,
      sandbox: "off",
      compactionKeepRecentTurns: 5,
    });
    const rig = await start();
    try {
      const frozen: CliConfig = rig.app.parts.config;
      const snapshot = JSON.stringify(frozen);
      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen(frozen.denyRules)).toBe(true);

      await runLine(rig, "/config set compactionKeepRecentTurns 3");

      expect(JSON.stringify(rig.app.parts.config), "동결 객체가 바뀌었다").toBe(snapshot);
      expect(rig.app.parts.config.compactionKeepRecentTurns).toBe(5);
      expect(loadConfig(configPath).compactionKeepRecentTurns).toBe(3);

      // 구조 축 — 쓰기 함수는 동결 객체를 인자로 받을 자리 자체가 없다. 값이 안 닿는다는
      // 계약을 배선의 성의가 아니라 타입이 지는 것이 §3.2가 이 계약을 든 이유다.
      type WriteParams = Parameters<typeof writeConfigValue>;
      type TakesConfig = CliConfig extends WriteParams[number] ? true : false;
      const takesConfig: TakesConfig = false;
      expect(takesConfig).toBe(false);
    } finally {
      await stop(rig);
    }
  });

  it("F-2 조회가 읽은 파일 값이 모델 요청으로 흐르지 않는다", async () => {
    const probeImage = "qa-probe-image:1.0";
    writeRecord({
      model: "qa-model-0",
      compactionAuto: false,
      sandbox: "off",
      sandboxImage: probeImage,
    });
    const rig = await start();
    try {
      await runLine(rig, "/config");
      await runLine(rig, "안녕", 80);
      await rig.app.parts.agent.waitForIdle();

      const sent = JSON.stringify(rig.model.requests);
      expect(rig.model.requests.length, "모델이 한 번도 안 불렸다").toBeGreaterThan(0);
      expect(sent).not.toContain(probeImage);
      expect(sent).not.toContain(configPath);
    } finally {
      await stop(rig);
    }
  });

  it("F-3 set 직후의 조회에서 세션 열은 옛 값이고 파일 열만 새 값이다", async () => {
    // 근거: §3.2 계약 2 — 쓰기는 이 프로세스의 동결 값에 반영되지 않는다. 그 계약을 동결
    // 객체의 동일성만으로 재면 관측면이 갈린다: F-1이 보는 것은 조립이 든 설정 객체이고,
    // 화면의 세션 열이 읽는 것은 슬래시 동작이 받은 환경의 설정이다. 둘을 묶는 단언이
    // 없으면 뒤엣것만 다시 읽어 갈아끼우는 배선이 그대로 통과하고, 그때 화면은 두 값이
    // 같다고 사용자에게 단언한다 — 세션은 여전히 옛 값으로 도는데.
    //
    // 그래서 여기서는 계약 2를 사용자가 보는 것에 묶는다. 값은 이 블록이 심은 것이고
    // 문면은 재지 않는다(§7 — 구별과 비침묵).
    const sessionModel = "qa-config-frozen";
    const fileModel = "qa-config-written";
    writeRecord({ model: sessionModel, compactionAuto: false, sandbox: "off" });
    const rig = await start();
    try {
      const frozen: CliConfig = rig.app.parts.config;
      const agreed = await runLine(rig, "/config");
      expect(agreed, "시작 상태의 조회에 세션 값이 없다").toContain(sessionModel);
      expect(agreed, "쓰기 전인데 새 값이 이미 보인다").not.toContain(fileModel);

      await runLine(rig, `/config set model ${fileModel}`);
      const after = await runLine(rig, "/config");

      // ① 세션 열은 옛 값 그대로다 — 화면이 읽는 상태가 쓰기로 갈아끼워지지 않았다
      expect(after, "set 뒤 조회에서 세션 값이 사라졌다").toContain(sessionModel);
      // ② 그 값이 이 세션이 동결한 객체의 값과 같다 — 갈린 두 관측면을 묶는 자리
      expect(after, "화면의 세션 값이 동결 객체와 갈렸다").toContain(frozen.model);
      expect(rig.app.parts.config.model).toBe(sessionModel);
      // ③ 파일 열은 새 값을 낸다 — 쓰기가 실제로 파일에 착지했다
      expect(after, "set 뒤 조회에 파일의 새 값이 없다").toContain(fileModel);
      expect(loadConfig(configPath).model).toBe(fileModel);
      // ④ 두 값이 한 줄에 함께 보인다(계약 3의 1 — 다르면 둘 다). 열 배치와 라벨은
      //    세부이므로 자리가 아니라 공존으로 잰다.
      const together = after
        .split("\n")
        .filter((line) => line.includes(sessionModel) && line.includes(fileModel));
      expect(together.length, "두 값이 한 줄에 함께 보이지 않는다").toBeGreaterThan(0);
      // ⑤ 갈린 상태의 출력이 합치 상태의 출력과 다르다(§7 — 구별)
      expect(after, "set 전후의 조회 출력이 같다").not.toBe(agreed);
    } finally {
      await stop(rig);
    }
  });
});

/* ------------------------------------------------------------------------ *
 * G. 계약 3 — 조회
 * ------------------------------------------------------------------------ */

describe("G. CLI-INTERFACE §3.2 계약 3 — 여덟 키·두 상태·경로·적용 시점", () => {
  it("G-1 조회가 여덟 키를 라벨과 함께 전부 내고 파일 경로를 낸다", async () => {
    writeRecord({ model: "qa-model-0", compactionAuto: false, sandbox: "off" });
    const rig = await start();
    try {
      const view = await runLine(rig, "/config");
      expect(view.trim(), "조회가 아무것도 안 냈다").not.toBe("");
      for (const key of DOC_KEYS) expect(view, `${key}: 키 이름이 없다`).toContain(key);
      for (const key of CONFIG_KEYS) {
        expect(view, `${key}: 라벨이 없다`).toContain(CONFIG_KEY_META[key].label);
      }
      expect(view, "설정 파일 경로가 없다").toContain(configPath);
      // 적용 시점 — 문면은 세부이므로 부류로만 잰다(문서 머리의 조정 가능).
      expect(view).toMatch(/다음\s*시작/);
    } finally {
      await stop(rig);
    }
  });

  it("G-2 세션 값과 파일 값이 갈리면 둘 다 보이고 출력이 달라진다", async () => {
    writeRecord({ model: "qa-model-0", compactionAuto: false, sandbox: "off" });
    const rig = await start();
    try {
      const same = await runLine(rig, "/config");
      expect(same).toContain("qa-model-0");
      expect(same).not.toContain("qa-model-9");

      writeRecord({ model: "qa-model-9", compactionAuto: false, sandbox: "off" });
      const differs = await runLine(rig, "/config");

      // 두 상태가 함께 보인다 — 세션이 동결한 값과 파일의 현재 값
      expect(differs).toContain("qa-model-0");
      expect(differs).toContain("qa-model-9");
      expect(differs).not.toBe(same);
    } finally {
      await stop(rig);
    }
  });

  it("G-3 파일이 깨져도 조회가 죽지 않고 그 사실을 낸다", async () => {
    writeRecord({ model: "qa-model-0", compactionAuto: false, sandbox: "off" });
    const rig = await start();
    try {
      const healthy = await runLine(rig, "/config");
      writeFileSync(configPath, "{ 깨진 JSON", { mode: 0o600 });
      const broken = await runLine(rig, "/config");

      expect(broken.trim(), "깨진 파일에서 조회가 침묵했다").not.toBe("");
      for (const key of DOC_KEYS) expect(broken, `${key}: 키 이름이 없다`).toContain(key);
      expect(broken).toContain("qa-model-0");
      expect(broken).toContain(configPath);
      expect(broken).not.toBe(healthy);

      // 명령이 REPL을 죽이지 않았다 — 다음 명령이 그대로 돈다
      const after = await runLine(rig, "/config");
      expect(after.trim()).not.toBe("");
    } finally {
      await stop(rig);
    }
  });

  it("G-4 set 직후의 조회는 두 상태가 갈렸음을 값 줄 밖에서도 알린다", async () => {
    // 근거: §3.2 계약 3의 1 — 둘이 같으면 한 열이고 다르면 둘 다 보인다. 그 구별이 값
    // 표기 안에만 있으면 사용자는 한 줄의 배치만으로 그것을 읽어야 하고, 세션 설정을
    // 다시 읽어 갈아끼우는 배선에서는 그 줄 자체가 사라져 화면이 두 값이 같다고 말한다.
    //
    // G-2가 재는 것은 파일을 바깥에서 고친 경우다. 이 명령 자신의 쓰기가 낳은 갈림을
    // 재는 축은 그전까지 없었다. 여기서는 값이 든 줄을 걷어낸 나머지가 합치 상태와
    // 갈리는지를 잰다 — 문면이 아니라 구별이다(§7).
    const sessionModel = "qa-config-agree";
    const fileModel = "qa-config-split";
    writeRecord({ model: sessionModel, compactionAuto: false, sandbox: "off" });
    const rig = await start();
    try {
      const agreed = await runLine(rig, "/config");
      await runLine(rig, `/config set model ${fileModel}`);
      const split = await runLine(rig, "/config");

      const agreedRest = scrub(agreed, sessionModel, fileModel);
      const splitRest = scrub(split, sessionModel, fileModel);
      // 모집단이 비면 통과가 아니라 공허다 — 걷어낸 나머지가 있어야 잴 것이 있다
      expect(agreedRest.trim(), "값 줄을 걷어내니 남는 서술이 없다").not.toBe("");
      expect(splitRest, "두 상태가 갈렸는데 값 줄 밖의 서술이 그대로다").not.toBe(agreedRest);
      // 갈림이 사라진 것이 아니라 실제로 갈려 있다 — 파일만 새 값이고 세션은 옛 값이다
      expect(loadConfig(configPath).model).toBe(fileModel);
      expect(rig.app.parts.config.model).toBe(sessionModel);
    } finally {
      await stop(rig);
    }
  });
});

/* ------------------------------------------------------------------------ *
 * H. 계약 6 — 확인 없음 + 낮아짐 명시
 * ------------------------------------------------------------------------ */

/** 값 토큰이 든 줄을 걷어낸다 — 남는 것이 값 변경으로 설명되지 않는 자리다 */
function scrub(text: string, ...tokens: readonly string[]): string {
  const pattern = new RegExp(`\\b(?:${tokens.join("|")})\\b`);
  return text
    .split("\n")
    .filter((line) => !pattern.test(line))
    .join("\n");
}

describe("H. CLI-INTERFACE §3.2 계약 6 — 확인을 두지 않고 낮아짐을 명시한다", () => {
  it("H-1 보호를 낮추는 쓰기가 추가 입력을 요구하지 않는다", async () => {
    writeRecord({ model: "qa-model-0", compactionAuto: false, sandbox: "off" });
    const rig = await start();
    try {
      await runLine(rig, "/config set approvalMode off");
      expect(loadConfig(configPath).approvalMode).toBe("off");

      // 다음 줄이 확인 응답으로 먹히지 않았다는 것을 그 줄이 명령으로 도는 것으로 잰다
      const next = await runLine(rig, "/config");
      expect(next).toContain(configPath);

      await runLine(rig, "/config set sandbox off");
      expect(loadConfig(configPath).sandbox).toBe("off");
    } finally {
      await stop(rig);
    }
  });

  it("H-2 낮추는 쓰기와 안 낮추는 쓰기의 고지가 갈린다", async () => {
    writeRecord({ model: "qa-model-0", compactionAuto: false, sandbox: "off" });
    const rig = await start();
    try {
      const lowered = await runLine(rig, "/config set approvalMode off");
      const restored = await runLine(rig, "/config set approvalMode manual");
      const sandboxOff = await runLine(rig, "/config set sandbox off");
      const sandboxOn = await runLine(rig, "/config set sandbox on");

      for (const notice of [lowered, restored, sandboxOff, sandboxOn]) {
        expect(notice.trim(), "쓰기 고지가 침묵했다").not.toBe("");
      }
      expect(lowered).not.toBe(restored);
      expect(sandboxOff).not.toBe(sandboxOn);

      // 값이 바뀐 것만으로 갈린 것이 아니라는 것까지 잰다 — 값 토큰이 든 줄을 걷어내도
      // 남는 자리가 갈리면 그 자리가 낮아짐을 말하는 곳이다. 문면은 세부이므로 안 든다.
      expect(scrub(lowered, "off", "manual").trim()).not.toBe("");
      expect(scrub(lowered, "off", "manual")).not.toBe(scrub(restored, "off", "manual"));
      expect(scrub(sandboxOff, "off", "on")).not.toBe(scrub(sandboxOn, "off", "on"));

      // 역검증 — 걷어내는 술어가 실제로 값 토큰이 든 줄만 지운다. 이 짝이 없으면 위 둘은
      // 술어가 통째로 지워 버린 빈 문자열끼리의 비교로도 통과할 수 있다.
      expect(scrub("값이 off다\n남는 줄", "off")).toBe("남는 줄");
      expect(scrub("남는 줄", "off")).toBe("남는 줄");
    } finally {
      await stop(rig);
    }
  });

  it("H-3 결과 고지가 이전 값과 되돌리는 수단을 든다", async () => {
    writeRecord({ model: "qa-model-0", compactionAuto: false, sandbox: "off" });
    const rig = await start();
    try {
      const notice = await runLine(rig, "/config set model qa-model-9");
      // 이전 값은 이 테스트가 심은 데이터다 — 되돌리는 한 수가 화면에 있다는 것의 관측면
      expect(notice).toContain("qa-model-0");
      expect(notice).toContain(configPath);
      expect(notice).toMatch(/다음\s*시작/);
    } finally {
      await stop(rig);
    }
  });
});

/* ------------------------------------------------------------------------ *
 * I. 계약 7 — 모든 거부가 다음 한 수를 든다
 * ------------------------------------------------------------------------ */

describe("I. CLI-INTERFACE §3.2 계약 7 — 거부 고지가 다음 행동 자리를 든다", () => {
  it("I-1 거부 넷이 서로 갈리고 전부 여러 줄의 안내를 낸다", async () => {
    writeRecord({ model: "qa-model-0", compactionAuto: false, sandbox: "off" });
    const rig = await start();
    try {
      const untouched = raw();
      const unknownKey = await runLine(rig, "/config set approvalmode off");
      const readOnly = await runLine(rig, "/config set denyRules a");
      const badToken = await runLine(rig, "/config set compactionAuto yes");
      const badValue = await runLine(rig, "/config set compactionThreshold 1.5");

      const all = [unknownKey, readOnly, badToken, badValue];
      for (const refusal of all) {
        expect(refusal.trim(), "거부가 침묵했다").not.toBe("");
        expect(
          refusal.split("\n").filter((line) => line.trim() !== "").length,
          "거부가 한 줄뿐이다 — 다음 행동 자리가 없다",
        ).toBeGreaterThanOrEqual(3);
      }
      expect(new Set(all).size, "거부 넷 중 같은 문면이 있다").toBe(4);

      // 각 거부가 실제로 다음 한 수를 든다 — 재료는 전부 이 테스트가 아는 데이터다
      for (const key of WRITABLE_CONFIG_KEYS) expect(unknownKey).toContain(key);
      expect(readOnly).toContain(configPath);
      for (const key of DOC_ARRAY_KEYS) expect(readOnly).toContain(key);
      expect(badToken).toContain("compactionAuto");
      expect(badValue).toContain("compactionThreshold");

      // 거부 넷 어느 것도 파일을 안 건드린다 — 바이트 그대로다
      expect(raw(), "거부인데 파일이 바뀌었다").toBe(untouched);
    } finally {
      await stop(rig);
    }
  });

  it("I-2 파일이 깨진 상태의 쓰기 거부도 다음 한 수를 든다", async () => {
    writeRecord({ model: "qa-model-0", compactionAuto: false, sandbox: "off" });
    const rig = await start();
    try {
      writeFileSync(configPath, "{ 깨진 JSON", { mode: 0o600 });
      const before = raw();
      const refusal = await runLine(rig, "/config set model qa-model-9");

      expect(refusal.trim(), "거부가 침묵했다").not.toBe("");
      expect(refusal).toContain(configPath);
      expect(raw(), "거부인데 파일이 바뀌었다").toBe(before);
    } finally {
      await stop(rig);
    }
  });
});

/* ------------------------------------------------------------------------ *
 * J. 자기 축 — CLI-INTERFACE §7의 리터럴 금지를 이 파일 자신에 대해 잰다
 * ------------------------------------------------------------------------ */

type LiteralAssertion = {
  readonly line: number;
  readonly literal: string;
  readonly negated: boolean;
  readonly blockText: string;
};

/** 숫자와 보간 자리를 지운다 — 주입 데이터가 템플릿으로 만들어졌을 때 대조하기 위한 것이다 */
const skeleton = (text: string): string => text.replace(/\d+/g, "#").replace(/\$\{[^}]*\}/g, "#");

/** 조립을 두 조각으로 나눠 이 파일의 원문에 판별 대상이 우연히 생기지 않게 한다 */
const CONTAIN = ".toContain";

/**
 * 문면 리터럴 단언을 it 블록 단위로 모은다.
 *
 * 부분 문자열 단언으로 좁히는 이유는 §7이 다루는 것이 표시 문구이기 때문이다. 정규식 단언은
 * 문면을 고정하지 않고 부류를 재므로 이 금지의 대상이 아니다.
 */
function literalAssertions(source: string): LiteralAssertion[] {
  const lines = source.split("\n");
  const starts: number[] = [];
  lines.forEach((line, index) => {
    if (/^\s{2}it\(/.test(line)) starts.push(index);
  });

  const found: LiteralAssertion[] = [];
  starts.forEach((start, order) => {
    const end = starts[order + 1] ?? lines.length;
    const blockText = lines.slice(start, end).join("\n");
    const pattern = new RegExp(
      `expect\\([\\s\\S]*?\\)[\\s\\S]{0,80}?(\\.not)?\\${CONTAIN}\\(\\s*"([^"]+)"`,
      "g",
    );
    for (const match of blockText.matchAll(pattern)) {
      const literal = match[2];
      if (literal === undefined || match.index === undefined) continue;
      const before = blockText.slice(0, match.index).split("\n").length - 1;
      found.push({ line: start + before + 1, literal, negated: match[1] !== undefined, blockText });
    }
  });
  return found;
}

/**
 * §7이 금지한 형태만 남긴다 — 짝도 없고 주입 데이터도 아닌 단독 리터럴.
 *
 * 허용 첫째는 같은 문면을 서로 다른 상태에서 있음과 없음으로 재는 대비쌍이고, 둘째는 그
 * 블록이 스스로 심은 데이터가 그대로 통과했는지를 확인하는 단언이다.
 */
function forbiddenLiterals(source: string): string[] {
  const all = literalAssertions(source);
  return all
    .filter((assertion) => {
      const fixture = assertion.blockText
        .split("\n")
        .filter((line) => !line.includes("expect(") && !line.includes(`${CONTAIN}(`))
        .join("\n");
      const injected = skeleton(fixture).includes(skeleton(assertion.literal));
      const paired = all.some(
        (other) => other.literal === assertion.literal && other.negated !== assertion.negated,
      );
      return !injected && !paired;
    })
    .map((assertion) => `L${assertion.line} ${JSON.stringify(assertion.literal)}`);
}

describe("J. CLI-INTERFACE §7 — 이 파일이 표시 문구를 리터럴로 고정하지 않는다 (자기 축)", () => {
  it("J-1 이 파일에 짝 없고 주입 데이터도 아닌 단독 리터럴이 없다", () => {
    // 근거: §7 마지막 불릿의 금지 항 — 리터럴이 문면 자체를 고정할 때. 짝이 없고 주입
    // 데이터도 아닌 단독 리터럴이 그것이다.
    //
    // 모집단이 비면 통과가 아니라 공허다. 이 파일이 문면 단언을 하나도 안 하면 아래
    // 단언은 아무것도 안 재므로 코퍼스를 먼저 짚는다.
    expect(literalAssertions(SELF_SOURCE).length, "잴 문면 단언이 0건이다").toBeGreaterThan(0);
    expect(forbiddenLiterals(SELF_SOURCE)).toEqual([]);
  });

  it("J-2 역검증 — 같은 판별기가 심은 위반을 잡고 허용 둘은 안 잡는다", () => {
    const planted = [
      `  it("심은 위반", () => {`,
      `    const text = run();`,
      `    expect(text)${CONTAIN}("고정된 문구");`,
      `  });`,
    ].join("\n");
    expect(forbiddenLiterals(planted)).toEqual([`L3 "고정된 문구"`]);

    const pair = [
      `  it("있음", () => {`,
      `    expect(a)${CONTAIN}("문구");`,
      `  });`,
      `  it("없음", () => {`,
      `    expect(b).not${CONTAIN}("문구");`,
      `  });`,
    ].join("\n");
    expect(forbiddenLiterals(pair)).toEqual([]);

    const injected = [
      `  it("주입", () => {`,
      `    const text = run({ note: "심은 값" });`,
      `    expect(text)${CONTAIN}("심은 값");`,
      `  });`,
    ].join("\n");
    expect(forbiddenLiterals(injected)).toEqual([]);
  });
});
