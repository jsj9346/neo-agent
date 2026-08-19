/**
 * QA-B 독립 검증 — `docs/DISTRIBUTION.md` §6 · §7 · §7.1 · §9.
 *
 * **기대값은 전부 정본 문서에서 도출했다.** 구현을 읽기 전에 다음 계약을 뽑았고,
 * 구현이 문서와 어긋나면 이 파일은 실패하는 쪽에 선다.
 *
 *   §6  설치 트리와 워크스페이스가 **겹치면 고지한다. 막지 않는다.** 겹침은
 *       **양방향**이다(판정 D-5) — 워크스페이스가 설치 트리 안인 배치와, 설치 트리를
 *       품는 배치(이 저장소의 실제 배치) 둘 다. 고지는 **두 사실을 모두** 말한다:
 *       ① 겹친다 ② 편집은 **다음 기동부터** 적용된다. ②의 누락을 §6이 명시적으로
 *       금지했으므로 **부분 통과가 없다.** 판정은 세그먼트 단위여야 하고(`neo-agent-2`
 *       오탐 금지), **계산된 루트에 `pnpm-workspace.yaml`이 있음을 테스트가 단정**한다
 *       — §6이 *"레이아웃 변경이 조용히 고지를 죽이는 것을 막는 유일한 수단"*으로
 *       지목한 검사다.
 *   §7  `process.stdin.isTTY`가 아니면 **원인과 다음 행동을 담은 에러로 종료**한다.
 *       판정 D-1: 검사가 argv보다 앞이므로 `--version`·`--help`도 거부된다.
 *   §7.1 *"`runCli`를 모의 스트림으로 부르는 경로는 이 검사를 지나지 않는다"* —
 *       그리고 *"모의 스트림 경로는 이미 `isTTY !== true`를 정상 분기로 다룬다
 *       (`approval-ui.ts`·`wiring.ts` — 라인 모드로 강등). 그 분기는 그대로 남는다."*
 *   §9  README가 담을 것/담지 않을 것. 적힌 절차가 **실제로 재현**되어야 한다.
 *
 * **하네스를 재사용하지 않는다.** 구현자의 `install-tree.contract.test.ts`도
 * QA-A의 `harness.ts`도 QA-C의 `probe-docker.ts`도 쓰지 않는다 — 독립 검증의 결론이
 * 다른 작성자의 하네스 정확성에 의존하면 "둘 다 같은 오해를 공유하는" 경우를 잡지
 * 못한다. 모의 모델·ANSI 제거·Docker 판정 주입은 여기서 새로 썼고, 대역은 캐스트
 * 없이 구조적으로만 맞춘다(`as unknown as`는 검사를 끄는 도구라 쓰지 않는다).
 *
 * **TTY 검사는 실물 bin을 스폰해서만 관측된다.** `main.ts`는 top-level await로 CLI를
 * 띄우는 파일이라 임포트로는 검증할 수 없고, 검사가 `main.ts`에 있다는 것 자체가
 * §7.1의 근거이기 때문이다. 스폰은 `node <path>`가 아니라 **파일을 직접 실행**한다 —
 * 링크 설치가 배포 형태이므로(§2.1) shebang과 실행 비트를 함께 지나는 쪽이 실제
 * 설치 경로다.
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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import type { ModelClient, ModelStreamEvent } from "@neo-agent/core";
import type { ApprovalRequest } from "@neo-agent/gate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApprovalPrompt } from "../src/approval-ui.ts";
import {
  type CliDeps,
  EXIT_OK,
  EXIT_STARTUP_FAILED,
  resolveInstallRoot,
  runCli,
  startCli,
} from "../src/wiring.ts";

/**
 * `ANTHROPIC_API_KEY` — `CLI-INTERFACE.md` §4가 정한 이름이다. 구현 상수를 임포트하지
 * 않고 문서에서 옮겨 적는다: 이름이 바뀌면 README(§9)와 함께 여기서 깨져야 한다.
 */
const API_KEY_ENV = "ANTHROPIC_API_KEY";

const testDir = dirname(fileURLToPath(import.meta.url));
/** `main.ts`가 있는 디렉터리. 실행 시 `import.meta.dirname`이 갖는 값과 같다 */
const cliSrcDir = realpathSync(join(testDir, "..", "src"));
/** §3.2가 지정한 bin. `package.json`의 `bin` 필드가 가리키는 그 파일이다 */
const binPath = realpathSync(join(testDir, "..", "bin", "neo-agent.mjs"));
/** 계산이 아니라 **관측**된 설치 루트 — 이 파일 위치에서 두 단계 위가 패키지 루트다 */
const packageRoot = realpathSync(join(testDir, ".."));

/** 유사 TTY를 만들 수단. 없으면 양성 대조를 세울 수 없어 그 자리를 건너뛴다 */
const PTY_TOOL = "/usr/bin/script";
const hasPty = existsSync(PTY_TOOL);

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI 제거가 목적이다
const ANSI = /\[[0-9;?]*[ -/]*[@-~]/g;

function plain(text: string): string {
  return text.replace(ANSI, "");
}

let sandbox: string;
let home: string;

beforeEach(() => {
  sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-qab-dist-")));
  home = join(sandbox, "home");
  mkdirSync(home, { recursive: true });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

// ───────────────────────────────────────────────────────────────────────────
// 대역 — 캐스트 없이 구조적으로만 맞춘다
// ───────────────────────────────────────────────────────────────────────────

/** 네트워크에 닿지 않는 최소 `ModelClient`. 한 마디 하고 끝낸다 */
function silentModel(): ModelClient {
  return {
    modelId: "qa-b/dist-probe",
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

/**
 * Docker 판정 주입. `sandbox`의 기본값이 `"on"`이라 주입하지 않으면 시작 시퀀스가
 * **실제 `docker version`을 스폰**하고, 이 파일의 결과가 테스트 머신의 데몬 상태에
 * 좌우된다. 불가용 갈래를 고른 이유는 그쪽이 프로세스도 컨테이너도 만들지 않기
 * 때문이며, 고지(§6)는 셸 도구 등록 여부와 무관하다.
 */
function noDocker(): () => Promise<{ available: false; reason: string }> {
  return async () => ({ available: false, reason: "QA-B: Docker 판정을 주입해 고정했다" });
}

/**
 * 조립을 세우고 그때까지의 화면을 돌려준다. `run()`을 부르지 않는 것이 의도다 —
 * 고지가 배너가 아니라 **판정 단계**에서 나가는지가 함께 관측된다.
 */
async function startAndCapture(options: { cwd: string; installRoot?: string }): Promise<string> {
  const output = new PassThrough() as PassThrough & { columns?: number };
  output.columns = 100;
  const chunks: string[] = [];
  output.on("data", (chunk: Buffer) => void chunks.push(chunk.toString("utf8")));

  const deps: CliDeps = {
    argv: [],
    env: { [API_KEY_ENV]: "sk-ant-qa-b" },
    cwd: options.cwd,
    home,
    io: { input: new PassThrough(), output },
    version: "0.0.0-qa-b",
    // `exactOptionalPropertyTypes` 아래에서 "주지 않는다"와 "undefined를 준다"는
    // 다른 입력이다. 여기서 재는 것은 전자다.
    ...(options.installRoot === undefined ? {} : { installRoot: options.installRoot }),
    factories: { probeDocker: noDocker(), createModelClient: () => silentModel() },
  };

  const app = await startCli(deps, { kind: "run" });
  await app.shutdown();
  return plain(chunks.join(""));
}

/** 임시 트리 안에 디렉터리를 만들고 realpath로 돌려준다 */
function makeDir(...segments: string[]): string {
  const path = join(sandbox, ...segments);
  mkdirSync(path, { recursive: true });
  return realpathSync(path);
}

// ───────────────────────────────────────────────────────────────────────────
// 실물 bin 스폰
// ───────────────────────────────────────────────────────────────────────────

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  /** pty 실행에서는 stdout/stderr가 한 터미널로 합쳐진다 */
  merged: string;
}

/**
 * 설치된 bin을 실행한다.
 *
 * `tty: false` — stdin이 파이프다(cron·스크립트·파이프의 재현).
 * `tty: true`  — `script(1)`가 유사 터미널을 붙여 준다. `-e`가 자식의 종료 코드를
 *                그대로 돌려주므로 종료 코드도 관측 대상이 된다.
 */
function runBin(args: readonly string[], options: { tty: boolean }): Promise<RunResult> {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home };
  // 실제 키가 프로세스 환경에 있으면 거부 경로의 관측이 흐려질 이유는 없지만,
  // 어떤 경로로도 실물 크리덴셜이 자식에게 흘러가지 않게 지운다.
  delete env[API_KEY_ENV];

  const child = options.tty
    ? spawn(PTY_TOOL, ["-qec", [binPath, ...args].join(" "), "/dev/null"], { cwd: sandbox, env })
    : spawn(binPath, [...args], { cwd: sandbox, env });

  const out: string[] = [];
  const err: string[] = [];
  child.stdout.on("data", (chunk: Buffer) => void out.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk: Buffer) => void err.push(chunk.toString("utf8")));
  child.stdin.end();

  return new Promise<RunResult>((resolvePromise, rejectPromise) => {
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      const stdout = plain(out.join(""));
      const stderr = plain(err.join(""));
      resolvePromise({ code, stdout, stderr, merged: `${stdout}${stderr}` });
    });
  });
}

// ───────────────────────────────────────────────────────────────────────────
// §7 — TTY 없이 기동하면 거부한다
// ───────────────────────────────────────────────────────────────────────────

describe("TTY 없는 기동 거부 (§7)", () => {
  it("파이프로 기동하면 비정상 종료한다 — 조용한 행(hang)이 아니다", async () => {
    const result = await runBin([], { tty: false });

    // §7의 요구는 "에러로 종료"다. 0이 아닌 것이 계약이고, 값이 무엇인지는 세부다 —
    // 둘 다 본다: 계약(비정상)과 현재 정본(EXIT_STARTUP_FAILED).
    expect(result.code).not.toBe(0);
    expect(result.code).toBe(EXIT_STARTUP_FAILED);
    expect(result.stderr).not.toBe("");
  }, 60_000);

  it("거부 메시지가 stderr로 나간다 — stdout이 파이프에 물려 있을 수 있다", async () => {
    const result = await runBin([], { tty: false });

    expect(result.stderr).toContain("neo-agent");
    // 표준 출력에는 REPL도 배너도 나오지 않는다(조립 자체가 서지 않았다).
    expect(result.stdout).toBe("");
  }, 60_000);

  it("메시지가 네 가지를 말한다 — 원인·왜 막는가·다음 행동·알아야 할 것", async () => {
    const message = (await runBin([], { tty: false })).stderr;

    // ① 원인 — §7이 명시적으로 요구한 것. 무엇이 TTY가 아닌지가 보여야 한다.
    expect(message).toMatch(/TTY|터미널/);
    expect(message).toMatch(/파이프|리다이렉션|cron|스크립트/);

    // ② 왜 막는가 — §7의 근거("승인 게이트가 물어볼 사람이 없는데 묻는다 → 조용한
    //    행")가 사용자에게 닿아야 한다. 이유 없는 거부는 §2.6의 silent failure를
    //    다른 모양으로 되돌린다.
    expect(message).toMatch(/승인/);
    expect(message).toMatch(/hang|멈춥|기다/);

    // ③ 다음 행동 — §7이 명시적으로 요구한 것.
    expect(message).toMatch(/터미널에서.*실행/);

    // ④ 사용자가 알아야 할 것 — 판정 D-1의 귀결(정보성 플래그도 함께 거부된다)이나
    //    무인 실행 미지원 중 하나는 반드시 말해야 한다. 이것이 없으면 `--version`이
    //    실패하는 이유를 사용자가 알 방법이 없다.
    expect(message).toMatch(/--version|--help|무인|지원하지 않/);
  }, 60_000);

  it("판정 D-1 — `--version`도 거부된다. 검사가 argv보다 앞이다", async () => {
    const result = await runBin(["--version"], { tty: false });

    expect(result.code).toBe(EXIT_STARTUP_FAILED);
    expect(result.stderr).toMatch(/TTY|터미널/);
    // 버전이 출력되면 검사가 argv 뒤로 밀린 것이다.
    expect(result.stdout).toBe("");
  }, 60_000);

  it("판정 D-1 — `--help`도 거부된다", async () => {
    const result = await runBin(["--help"], { tty: false });

    expect(result.code).toBe(EXIT_STARTUP_FAILED);
    expect(result.stderr).toMatch(/TTY|터미널/);
    expect(result.stdout).not.toContain("사용법");
  }, 60_000);

  it("알 수 없는 인자여도 TTY 거부가 먼저다 — 사용법 에러(EXIT_USAGE)가 아니다", async () => {
    const result = await runBin(["--알수없는플래그"], { tty: false });

    expect(result.code).toBe(EXIT_STARTUP_FAILED);
    expect(result.stderr).toMatch(/TTY|터미널/);
  }, 60_000);
});

/**
 * **양성 대조.** 위의 거부들이 "TTY가 없어서"인지 "CLI가 그냥 깨져서"인지는 이
 * 묶음이 없으면 구별되지 않는다. 유사 터미널을 붙이면 같은 인자가 정상 종료해야 한다.
 */
describe.skipIf(!hasPty)("TTY가 있으면 통과한다 (§7 양성 대조)", () => {
  it("pty에서 `--version`은 버전을 찍고 0으로 끝난다", async () => {
    const result = await runBin(["--version"], { tty: true });

    expect(result.code).toBe(EXIT_OK);
    expect(result.merged).not.toMatch(/TTY|터미널이 아니면/);
    // 버전 형태만 본다 — 값의 정본은 §4(`registration.ts`)이고 여기서 세지 않는다.
    expect(result.merged).toMatch(/\d+\.\d+\.\d+/);
  }, 60_000);

  it("pty에서 `--help`는 사용법을 찍고 0으로 끝난다", async () => {
    const result = await runBin(["--help"], { tty: true });

    expect(result.code).toBe(EXIT_OK);
    expect(result.merged).toContain("neo-agent --version");
    expect(result.merged).not.toMatch(/터미널이 아니면/);
  }, 60_000);
});

// ───────────────────────────────────────────────────────────────────────────
// §7.1 — 검사는 `main.ts`에 있고 조립은 이 사실을 모른다
// ───────────────────────────────────────────────────────────────────────────

describe("§7.1의 주장 — 모의 스트림으로 부르는 경로는 이 검사를 지나지 않는다", () => {
  /**
   * **회귀 시 이 이름이 뜬다.** 검사가 `runCli`(또는 그 아래)로 내려가면 같은 argv가
   * 두 경로에서 같은 결과를 내기 시작하고, §7.1이 *"닫아도 검증 경로를 막지 않는다"*
   * 라고 판정한 근거가 사라진다. 그 순간 이 단정이 깨져야 한다.
   */
  it("같은 `--version`이 bin(비-TTY)에서는 거부, `runCli`(모의 스트림)에서는 성공한다", async () => {
    const spawned = await runBin(["--version"], { tty: false });

    const chunks: string[] = [];
    const output = new PassThrough();
    output.on("data", (chunk: Buffer) => void chunks.push(chunk.toString("utf8")));
    const input = new PassThrough();
    // 모의 스트림에는 `isTTY`가 없다 — bin 경로를 거부시킨 바로 그 조건이다.
    expect((input as PassThrough & { isTTY?: boolean }).isTTY).toBeUndefined();

    const code = await runCli({
      argv: ["--version"],
      env: {},
      cwd: sandbox,
      home,
      io: { input, output },
      version: "9.9.9-qa-b",
    });

    expect(spawned.code).toBe(EXIT_STARTUP_FAILED);
    expect(code).toBe(EXIT_OK);
    expect(plain(chunks.join(""))).toContain("9.9.9-qa-b");
  }, 60_000);

  it("`startCli`는 비-TTY 스트림으로 끝까지 조립된다 — 검사가 조립에 없다", async () => {
    const workspace = makeDir("plain-ws");
    const text = await startAndCapture({ cwd: workspace });

    // 종료 시퀀스의 안내까지 나왔다면 시작 시퀀스가 전부 통과한 것이다.
    expect(text).not.toMatch(/터미널이 아니면/);
    expect(text.length).toBeGreaterThan(0);
  }, 60_000);
});

// ───────────────────────────────────────────────────────────────────────────
// §7.1 — 라인 모드 강등 분기가 살아 있다
// ───────────────────────────────────────────────────────────────────────────

describe("라인 모드 강등 분기 생존 (§7.1)", () => {
  function request(): ApprovalRequest {
    return {
      toolCallId: "call-1",
      toolName: "shell",
      subject: { kind: "shellExec", command: "echo hi", cwd: "/tmp" },
      display: "echo hi",
      warnings: [],
    };
  }

  /** `TerminalIo.output`이 요구하는 최소 모양. 쓴 것을 모아 둔다 */
  function sink(): PassThrough & { columns?: number } {
    const stream = new PassThrough() as PassThrough & { columns?: number };
    stream.columns = 80;
    stream.resume();
    return stream;
  }

  it("`isTTY`가 없는 스트림에서도 승인 프롬프트가 응답을 받는다", async () => {
    const input = new PassThrough();
    const prompt = createApprovalPrompt({ input, output: sink() });

    const answer = prompt.ask(request(), new AbortController().signal);
    input.write("y");

    await expect(answer).resolves.toBe("allow-once");
  });

  it("`isTTY: false`면 raw 모드로 바꾸지 않는다 — 강등이 실제로 일어난다", async () => {
    const calls: boolean[] = [];
    const input = new PassThrough() as PassThrough & {
      isTTY?: boolean;
      setRawMode?: (mode: boolean) => unknown;
    };
    input.isTTY = false;
    input.setRawMode = (mode: boolean) => void calls.push(mode);

    const prompt = createApprovalPrompt({ input, output: sink() });
    const answer = prompt.ask(request(), new AbortController().signal);
    input.write("n");

    await expect(answer).resolves.toBe("deny");
    expect(calls).toEqual([]);
  });

  /**
   * **대조군.** 위의 단정만으로는 `setRawMode`를 아예 부르지 않는 구현(= 분기가
   * 사라진 것)과 구별되지 않는다. TTY 쪽에서는 켜고 끄는 것이 관측돼야 분기가
   * 두 갈래로 살아 있는 것이다.
   */
  it("`isTTY: true`면 raw 모드를 켜고 응답 뒤 되돌린다", async () => {
    const calls: boolean[] = [];
    const input = new PassThrough() as PassThrough & {
      isTTY?: boolean;
      setRawMode?: (mode: boolean) => unknown;
    };
    input.isTTY = true;
    input.setRawMode = (mode: boolean) => void calls.push(mode);

    const prompt = createApprovalPrompt({ input, output: sink() });
    const answer = prompt.ask(request(), new AbortController().signal);
    input.write("y");

    await expect(answer).resolves.toBe("allow-once");
    expect(calls).toEqual([true, false]);
  });

  /**
   * `wiring.ts`의 확인 프롬프트(`/delete`)도 같은 강등을 한다. 여기서 재는 것은
   * **비-TTY 입력으로 확인 절차가 끝까지 간다**는 것이다 — raw 모드를 무조건 켜는
   * 구현이면 `setRawMode`가 없는 스트림에서 TypeError로 죽는다.
   */
  it("`/delete` 확인도 비-TTY 입력에서 끝까지 간다 (wiring)", async () => {
    const workspace = makeDir("delete-ws");
    const output = new PassThrough() as PassThrough & { columns?: number };
    output.columns = 100;
    const chunks: string[] = [];
    output.on("data", (chunk: Buffer) => void chunks.push(chunk.toString("utf8")));
    const input = new PassThrough();
    const screen = (): string => plain(chunks.join(""));

    const app = await startCli(
      {
        argv: [],
        env: { [API_KEY_ENV]: "sk-ant-qa-b" },
        cwd: workspace,
        home,
        io: { input, output },
        version: "0.0.0-qa-b",
        factories: { probeDocker: noDocker(), createModelClient: () => silentModel() },
      },
      { kind: "run" },
    );
    const running = app.run();
    const doomed = app.parts.session.id;

    const waitFor = async (needle: string): Promise<void> => {
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        if (screen().includes(needle)) return;
        await new Promise<void>((r) => void setImmediate(r));
      }
      throw new Error(`"${needle}"가 화면에 나타나지 않았다:\n${screen()}`);
    };

    input.write("/new\r");
    await waitFor("새 세션");
    input.write(`/delete ${doomed.slice(0, 8)}\r`);
    await waitFor("삭제 대상");
    input.write("y");
    await waitFor("삭제했다");

    expect(app.parts.store.listSessions().some((s) => s.id === doomed)).toBe(false);
    await app.shutdown();
    await running;
  }, 60_000);
});

// ───────────────────────────────────────────────────────────────────────────
// §6 — 설치 루트 계산
// ───────────────────────────────────────────────────────────────────────────

describe("설치 루트 계산 (§6)", () => {
  /**
   * **§6이 요구한 단정이다.** 고지는 경계가 아니라서, 레이아웃이 바뀌어 계산이
   * 어긋나도 기동은 정상 진행한다 — 즉 **아무 소리 없이 사라진다.** 그때 깨지는
   * 자리가 여기여야 한다.
   */
  it("계산된 루트에 `pnpm-workspace.yaml`이 있다", () => {
    const installRoot = resolveInstallRoot(cliSrcDir);
    expect(existsSync(join(installRoot, "pnpm-workspace.yaml"))).toBe(true);
  });

  it("계산된 루트가 실제 워크스페이스 루트다 — 우연한 동명 파일로 통과하지 않는다", () => {
    const installRoot = resolveInstallRoot(cliSrcDir);

    // 관측된 경로와 계산된 경로가 같아야 한다: `packages/cli`의 두 단계 위.
    expect(installRoot).toBe(realpathSync(join(packageRoot, "..", "..")));
    // 루트의 다른 표지들도 함께 본다.
    expect(existsSync(join(installRoot, "package.json"))).toBe(true);
    expect(existsSync(join(installRoot, "packages", "cli", "src", "main.ts"))).toBe(true);
    expect(existsSync(join(installRoot, "README.md"))).toBe(true);
  });

  it("bin이 동적 import하는 `../src/main.ts`와 같은 트리를 센다", () => {
    // §3.2의 shim은 `../src/main.ts`를 부른다. 그 `src`에서 3단계를 세는 것이
    // `main.ts`가 하는 일이므로, 두 경로가 같은 곳을 짚어야 계약이 성립한다.
    const fromBin = resolveInstallRoot(realpathSync(join(dirname(binPath), "..", "src")));
    expect(fromBin).toBe(resolveInstallRoot(cliSrcDir));
  });

  it("파일시스템을 건드리지 않는 순수 산술이다", () => {
    expect(resolveInstallRoot("/nowhere/packages/cli/src")).toBe("/nowhere");
    expect(resolveInstallRoot("/a/b/c/d/e")).toBe("/a/b");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §6 — 자기 편집 고지
// ───────────────────────────────────────────────────────────────────────────

/** 고지의 사실 ② — §6이 누락을 명시적으로 금지했다 */
const NEXT_BOOT = /다음 기동/;
/** 고지의 사실 ① — 설치 트리와 겹친다는 것 */
const OVERLAP = /설치 트리/;

describe("자기 편집 고지 — 겹치면 말한다 (§6)", () => {
  it("워크스페이스가 설치 트리 자신이면 두 사실을 모두 말한다", async () => {
    const installRoot = makeDir("neo-agent");
    const text = await startAndCapture({ cwd: installRoot, installRoot });

    expect(text).toMatch(OVERLAP);
    expect(text).toMatch(NEXT_BOOT);
  }, 60_000);

  it("워크스페이스가 설치 트리 하위여도 말한다", async () => {
    const installRoot = makeDir("neo-agent");
    const inside = makeDir("neo-agent", "packages", "tools", "src");
    const text = await startAndCapture({ cwd: inside, installRoot });

    expect(text).toMatch(OVERLAP);
    expect(text).toMatch(NEXT_BOOT);
  }, 60_000);

  it("판정 D-5 — 워크스페이스가 설치 트리를 품어도 말하고, 설치 트리 경로를 함께 준다", async () => {
    const outer = makeDir("work");
    const installRoot = makeDir("work", "neo-agent-main");
    const text = await startAndCapture({ cwd: outer, installRoot });

    expect(text).toMatch(OVERLAP);
    expect(text).toMatch(NEXT_BOOT);
    // 품는 쪽은 **어디가 설치 트리인지 알고 있다.** 말하지 않으면 사용자는 이 워크
    // 스페이스의 어느 부분이 돌고 있는 코드인지 알 수 없다(§6: 문면이 다르다).
    expect(text).toContain(installRoot);
  }, 60_000);

  it("판정 D-5 — 이 저장소의 실제 배치(저장소 루트에서 기동)에서도 고지가 나간다", async () => {
    const installRoot = resolveInstallRoot(cliSrcDir);
    const gitRoot = resolve(installRoot, "..");
    // 실제 배치의 전제 확인 — 설치 트리가 저장소 루트의 하위다.
    expect(existsSync(join(gitRoot, "neo-agent-main", "pnpm-workspace.yaml"))).toBe(true);

    const text = await startAndCapture({ cwd: gitRoot, installRoot });

    expect(text).toMatch(OVERLAP);
    expect(text).toMatch(NEXT_BOOT);
    expect(text).toContain(installRoot);
  }, 60_000);

  it("두 배치의 문면이 다르다 — 아는 것만 말한다", async () => {
    const inner = makeDir("self");
    const insideText = await startAndCapture({ cwd: inner, installRoot: inner });

    const outer = makeDir("outer");
    const nested = makeDir("outer", "neo-agent-main");
    const containsText = await startAndCapture({ cwd: outer, installRoot: nested });

    // 안쪽 배치는 설치 트리 경로를 따로 말할 이유가 없다(워크스페이스가 그것이다).
    expect(insideText).not.toContain(nested);
    expect(containsText).toContain(nested);
  }, 60_000);

  it("**막지 않는다** — 겹쳐도 기동과 종료가 끝까지 간다", async () => {
    const installRoot = makeDir("neo-agent");
    const text = await startAndCapture({ cwd: installRoot, installRoot });

    // 종료 시퀀스가 남기는 재개 안내까지 나왔다면 어디서도 멈추지 않은 것이다.
    expect(text).toMatch(/--resume/);
  }, 60_000);

  /**
   * **부분 통과가 없다**는 것을 한 자리에서 못박는다. ①만 말하고 ②를 빠뜨리는
   * 회귀가 위의 개별 단정 사이로 빠져나가지 않게, 겹치는 모든 배치를 한 표로 돈다.
   */
  it("겹치는 모든 배치가 ①과 ②를 함께 말한다", async () => {
    const self = makeDir("case-self");
    const parent = makeDir("case-parent");
    const child = makeDir("case-parent", "deep", "sub");
    const outer = makeDir("case-outer");
    const nested = makeDir("case-outer", "neo-agent-main");

    const cases: readonly { cwd: string; installRoot: string }[] = [
      { cwd: self, installRoot: self },
      { cwd: child, installRoot: parent },
      { cwd: outer, installRoot: nested },
    ];

    for (const item of cases) {
      const text = await startAndCapture(item);
      expect(text, `배치 ${item.cwd} / ${item.installRoot}`).toMatch(OVERLAP);
      expect(text, `배치 ${item.cwd} / ${item.installRoot}`).toMatch(NEXT_BOOT);
    }
  }, 90_000);
});

describe("자기 편집 고지 — 겹치지 않으면 말하지 않는다 (§6)", () => {
  it("설치 트리 밖에서 기동하면 고지가 없다", async () => {
    const installRoot = makeDir("neo-agent");
    const elsewhere = makeDir("elsewhere");
    const text = await startAndCapture({ cwd: elsewhere, installRoot });

    expect(text).not.toMatch(OVERLAP);
    expect(text).not.toMatch(NEXT_BOOT);
  }, 60_000);

  it("형제 `neo-agent-2`를 하위로 오판하지 않는다 — 문자열 prefix 비교 금지", async () => {
    const installRoot = makeDir("neo-agent");
    const sibling = makeDir("neo-agent-2");
    const text = await startAndCapture({ cwd: sibling, installRoot });

    expect(text).not.toMatch(OVERLAP);
  }, 60_000);

  it("반대 방향의 접두 오탐도 없다 — 설치 트리가 `neo-agent-2`일 때", async () => {
    const installRoot = makeDir("neo-agent-2");
    const sibling = makeDir("neo-agent");
    const text = await startAndCapture({ cwd: sibling, installRoot });

    expect(text).not.toMatch(OVERLAP);
  }, 60_000);

  it("접두가 겹치는 더 깊은 형제도 오판하지 않는다", async () => {
    const installRoot = makeDir("neo-agent");
    const sibling = makeDir("neo-agent-2", "packages", "cli");
    const text = await startAndCapture({ cwd: sibling, installRoot });

    expect(text).not.toMatch(OVERLAP);
  }, 60_000);

  it("설치 루트를 모르면 판정하지 않는다 — 모르는 것은 말하지 않는다", async () => {
    const workspace = makeDir("unknown-install");
    const text = await startAndCapture({ cwd: workspace });

    expect(text).not.toMatch(OVERLAP);
  }, 60_000);
});

// ───────────────────────────────────────────────────────────────────────────
// §9 — README의 책임
// ───────────────────────────────────────────────────────────────────────────

describe("README 사실성 (§9)", () => {
  const readmePath = join(resolveInstallRoot(cliSrcDir), "README.md");
  const readme = readFileSync(readmePath, "utf8");

  it("*'스캐폴딩 전'*이 남아 있지 않다 — §9가 사실 오류로 지목한 문장", () => {
    expect(readme).not.toContain("스캐폴딩 전");
    expect(readme).not.toContain("기술 스택이 정해지지 않아");
  });

  it("§3.1의 설치 절차 네 줄이 그대로 있다", () => {
    expect(readme).toContain("pnpm install");
    expect(readme).toContain("mkdir -p ~/.local/bin");
    expect(readme).toContain('ln -s "$PWD/packages/cli/bin/neo-agent.mjs" ~/.local/bin/neo-agent');
    expect(readme).toContain("cd neo-agent/neo-agent-main");
  });

  it("적힌 링크 대상이 실재한다 — 절차가 가리키는 shim이 그 경로에 있다", () => {
    const installRoot = resolveInstallRoot(cliSrcDir);
    expect(existsSync(join(installRoot, "packages", "cli", "bin", "neo-agent.mjs"))).toBe(true);
  });

  it("전제를 적는다 — Node 24, TTY 필수, Docker 선택", () => {
    expect(readme).toMatch(/Node[^\n]*24/);
    expect(readme).toMatch(/TTY/);
    expect(readme).toMatch(/Docker/);
  });

  it("API 키 설정 위치를 적는다 (`CLI-INTERFACE.md` §4)", () => {
    expect(readme).toContain(API_KEY_ENV);
    expect(readme).toContain("~/.neo-agent/credentials");
  });

  it("갱신과 되돌리기를 적는다 (§5) — 사본 한 줄 포함", () => {
    expect(readme).toContain("git pull");
    expect(readme).toMatch(/실행 중에.*갱신하지 않는다|실행 중 갱신/);
    expect(readme).toMatch(/다운그레이드는 지원하지 않는다/);
    expect(readme).toMatch(/cp ~\/\.neo-agent\/sessions\.db/);
  });

  it("안전 기본값 한 문단과 *'유일한 경계는 OS'*를 담는다", () => {
    expect(readme).toContain("유일한 경계는 OS다");
  });

  it("문서 지도가 있고 각 링크 대상이 실재한다", () => {
    const installRoot = resolveInstallRoot(cliSrcDir);
    const targets = [...readme.matchAll(/\]\((docs\/[A-Za-z0-9._-]+\.md)\)/g)].map(
      (match) => match[1] ?? "",
    );

    // 정본 문서들이 실제로 링크돼 있어야 한다 — 지도가 지도 노릇을 하는지.
    expect(targets).toContain("docs/ARCHITECTURE.md");
    expect(targets).toContain("docs/DISTRIBUTION.md");
    expect(targets).toContain("docs/SAFE-DEFAULTS.md");

    for (const target of new Set(targets)) {
      expect(existsSync(join(installRoot, target)), `깨진 링크: ${target}`).toBe(true);
    }
  });

  it("루트 밖 링크(LICENSE·THIRD_PARTY_NOTICES)도 실재한다", () => {
    const installRoot = resolveInstallRoot(cliSrcDir);
    const targets = [...readme.matchAll(/\]\((\.\.\/[A-Za-z0-9._-]+)\)/g)].map(
      (match) => match[1] ?? "",
    );

    expect(targets.length).toBeGreaterThan(0);
    for (const target of new Set(targets)) {
      expect(existsSync(join(installRoot, target)), `깨진 링크: ${target}`).toBe(true);
    }
  });

  /**
   * §9: *"README가 담지 않는 것: 설계 근거. `docs/`가 정본이고 README는 링크만 건다."*
   *
   * 재는 것은 **근거의 복제**다 — 배제한 대안, 실측 표, 재도입 트리거, 공급망 설정의
   * 선택 이유. 절차에 딸린 한 줄 이유("소스 트리가 곧 런타임이라")는 사용자가 그
   * 절차를 지키는 데 필요한 사실이지 판정 근거가 아니므로 대상이 아니다.
   *
   * 레퍼런스 두 프로젝트의 **이름 자체**도 대상이 아니다 — README의 "저장소 경계"
   * 표는 `hermes-agent-main/`을 *"남의 코드. 읽기 전용"*으로 적는데, 그것은 설계
   * 근거가 아니라 이 저장소를 여는 사람이 첫 화면에서 알아야 할 사실이다. 재는 것은
   * *"hermes가 같은 판정을 했다"*류의 **비교 논증**이다.
   */
  it("설계 근거를 복제하지 않는다 — `docs/`에만 있어야 할 것들", () => {
    for (const marker of [
      "배제한 대안",
      "재도입 트리거",
      "pnpm link --global",
      "minimumReleaseAge",
      "blockExoticSubdeps",
      "npm publish",
      "Shai-Hulud",
      "실측",
    ]) {
      expect(readme, `설계 근거가 README로 새어 나왔다: ${marker}`).not.toContain(marker);
    }
  });

  it("레퍼런스 비교 논증을 옮겨 적지 않는다 — 이름은 경계 안내에만 나온다", () => {
    for (const line of readme.split("\n")) {
      if (!/hermes|OpenClaw|openclaw/.test(line)) continue;
      // 허용되는 유일한 등장은 "읽기 전용 참조 트리"라는 사실 안내다.
      expect(line, `레퍼런스 비교가 README로 새어 나왔다: ${line.trim()}`).toMatch(
        /읽기 전용|남의 코드|참조/,
      );
    }
  });
});
