/**
 * 실 Docker 실측 — **기본 실행에서 제외된다** (QA-B, T-013이 돌린다).
 *
 * 실행 방법:
 *   NEO_SANDBOX_LIVE=1 npx vitest run --project sandbox
 *
 * 게이팅: 환경변수 `NEO_SANDBOX_LIVE=1`이 아니면 `describe.skipIf`로 전부 건너뛴다.
 * Docker가 없는 머신·CI에서 상시 게이트가 빨간불이 되면 게이트가 신뢰를 잃고,
 * 그러면 진짜 실패도 무시된다 — 그래서 실측은 옵트인이다.
 *
 * 기대값의 출처:
 *   - `docs/SANDBOX.md` §4 (고아 방지, 하드닝, 동일 절대 경로 마운트)
 *   - `docs/SANDBOX.md` §5 (`--network none`의 귀결)
 *   - `docs/TOOLS-INTERFACE.md` §4 (timeout·abort·유계)
 *
 * **왜 스텁으로는 부족한가**: 스텁은 "종료 명령을 쏘았다"까지만 본다. 그 명령이
 * 실제로 컨테이너를 죽였는지는 Docker만 안다. `docker run` 클라이언트를 죽여도
 * 컨테이너는 산다는 것이 §4가 지목한 바로 그 함정이므로, 최종 판정은 여기다.
 *
 * 이 파일은 실 `docker`를 부르는 `DockerRunner`를 **테스트가 직접 구성해** 주입한다.
 * 그래야 실제 실행이면서도 인자(라벨)를 관찰할 수 있어, 종료 후 `docker ps`로
 * 그 컨테이너를 지목해 확인할 수 있다. (`node:child_process`는 테스트 파일에서만
 * 쓴다 — `src`의 금지 목록과 무관하다.)
 */

import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDockerShellExecutor, probeDocker } from "../src/index.ts";
import { type DockerRunner, labels, settlesWithin } from "./support.ts";

const LIVE = process.env.NEO_SANDBOX_LIVE === "1";
const IMAGE = process.env.NEO_SANDBOX_IMAGE ?? "debian:bookworm-slim";

interface LiveLogEntry {
  args: readonly string[];
}

/** 실 `docker`를 부르되 인자를 기록하는 러너 — 실측과 관찰을 동시에 한다 */
function createLiveRunner(log: LiveLogEntry[]): DockerRunner {
  return {
    run(options) {
      log.push({ args: [...options.args] });
      const child = spawn("docker", [...options.args], { stdio: ["pipe", "pipe", "pipe"] });

      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => options.onStdout?.(chunk));
      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", (chunk: string) => options.onStderr?.(chunk));
      child.stdin?.end(options.stdin ?? "");

      const exit = new Promise<number | null>((resolve) => {
        child.on("close", (code) => resolve(code));
        child.on("error", () => resolve(null));
      });

      return {
        exit,
        kill(signal) {
          child.kill(signal);
        },
      };
    },
  };
}

function docker(...args: string[]): string {
  return execFileSync("docker", args, { encoding: "utf8" });
}

/** 기록된 `docker run` 인자에서 라벨을 뽑아 `docker ps` 필터로 만든다 */
function labelFilter(log: LiveLogEntry[]): string {
  const run = log.find((entry) => entry.args[0] === "run");
  expect(run, "docker run 호출이 기록되지 않았다").toBeDefined();
  const found = labels(run?.args ?? []);
  expect(found.length, "실행 라벨이 없어 고아를 조회할 수 없다").toBeGreaterThan(0);
  const label = found[0];
  return `label=${label?.key}=${label?.value}`;
}

let workspaceRoot: string;
let scratch: string;

beforeAll(() => {
  if (!LIVE) return;
  scratch = realpathSync(mkdtempSync(join(tmpdir(), "neo-qa-sandbox-live-")));
  workspaceRoot = join(scratch, "ws");
  mkdirSync(workspaceRoot, { recursive: true });
  // 이미지는 호스트가 받는다 — `--network none`은 컨테이너 네트워크이므로 무관하다(§4)
  try {
    docker("image", "inspect", IMAGE);
  } catch {
    docker("pull", IMAGE);
  }
}, 300_000);

afterAll(() => {
  if (!LIVE) return;
  rmSync(scratch, { recursive: true, force: true });
});

function liveExecutor(log: LiveLogEntry[]) {
  return createDockerShellExecutor({
    image: IMAGE,
    workspaceRoot,
    docker: createLiveRunner(log),
  });
}

describe.skipIf(!LIVE)("실 Docker — 기본 동작", () => {
  it("`probeDocker`가 이 머신에서 가용으로 판정한다", async () => {
    const availability = await probeDocker();
    expect(availability.available).toBe(true);
  });

  it("`echo`가 돌고 stdout이 온다", async () => {
    const log: LiveLogEntry[] = [];
    const result = await liveExecutor(log).exec(
      { command: "echo neo-live-ok", cwd: workspaceRoot, timeoutMs: 60_000 },
      new AbortController().signal,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("neo-live-ok");
  });

  it("`exit 7`이 7로 온다 — docker CLI 자신의 코드가 아니다", async () => {
    const log: LiveLogEntry[] = [];
    const result = await liveExecutor(log).exec(
      { command: "exit 7", cwd: workspaceRoot, timeoutMs: 60_000 },
      new AbortController().signal,
    );
    expect(result.exitCode).toBe(7);
  });

  it("`pwd`가 **호스트와 같은 절대 경로**를 찍는다 — 경로 번역 없음", async () => {
    const log: LiveLogEntry[] = [];
    const result = await liveExecutor(log).exec(
      { command: "pwd", cwd: workspaceRoot, timeoutMs: 60_000 },
      new AbortController().signal,
    );
    expect(result.stdout.trim()).toBe(workspaceRoot);
  });

  it("워크스페이스에 쓴 파일이 호스트에서 보이고 소유자가 root가 아니다", async () => {
    const log: LiveLogEntry[] = [];
    const result = await liveExecutor(log).exec(
      {
        command: "echo written-in-container > live-artifact.txt",
        cwd: workspaceRoot,
        timeoutMs: 60_000,
      },
      new AbortController().signal,
    );
    expect(result.exitCode).toBe(0);
    expect(readFileSync(join(workspaceRoot, "live-artifact.txt"), "utf8")).toContain(
      "written-in-container",
    );
  });
});

describe.skipIf(!LIVE)("실 Docker — 하드닝 실증 (SANDBOX §4·§5)", () => {
  it("`--network none`: DNS 조회가 실패한다", async () => {
    const log: LiveLogEntry[] = [];
    const result = await liveExecutor(log).exec(
      { command: "getent ahosts example.com", cwd: workspaceRoot, timeoutMs: 60_000 },
      new AbortController().signal,
    );
    expect(result.exitCode).not.toBe(0);
  });

  it("읽기 전용 루트: `/etc`에 쓰기가 실패한다", async () => {
    const log: LiveLogEntry[] = [];
    const result = await liveExecutor(log).exec(
      { command: "touch /etc/neo-live-probe", cwd: workspaceRoot, timeoutMs: 60_000 },
      new AbortController().signal,
    );
    expect(result.exitCode).not.toBe(0);
  });

  it("`/tmp`는 쓰기 가능하다 — 읽기 전용 루트의 보완", async () => {
    const log: LiveLogEntry[] = [];
    const result = await liveExecutor(log).exec(
      {
        command: "touch /tmp/neo-live-probe && echo tmp-ok",
        cwd: workspaceRoot,
        timeoutMs: 60_000,
      },
      new AbortController().signal,
    );
    expect(result.stdout).toContain("tmp-ok");
  });

  it("호스트 env의 시크릿이 컨테이너 안에서 보이지 않는다", async () => {
    process.env.NEO_LIVE_SECRET = "sk-neo-live-secret";
    try {
      const log: LiveLogEntry[] = [];
      const result = await liveExecutor(log).exec(
        { command: "printenv", cwd: workspaceRoot, timeoutMs: 60_000 },
        new AbortController().signal,
      );
      expect(result.stdout).not.toContain("sk-neo-live-secret");
      expect(result.stdout).not.toContain("NEO_LIVE_SECRET");
    } finally {
      delete process.env.NEO_LIVE_SECRET;
    }
  });
});

describe.skipIf(!LIVE)("실 Docker — 고아 방지 (SANDBOX §4, 1급)", () => {
  it("timeout 후 컨테이너가 남지 않는다", async () => {
    const log: LiveLogEntry[] = [];
    const result = await settlesWithin(
      liveExecutor(log).exec(
        { command: "sleep 300", cwd: workspaceRoot, timeoutMs: 3_000 },
        new AbortController().signal,
      ),
      60_000,
      "timeout 후 exec",
    );

    expect(result.timedOut).toBe(true);
    // `-a`로 조회한다 — 죽었지만 제거되지 않은 컨테이너도 흔적이다
    expect(docker("ps", "-aq", "--filter", labelFilter(log)).trim()).toBe("");
  }, 90_000);

  it("abort 후 컨테이너가 남지 않는다", async () => {
    const log: LiveLogEntry[] = [];
    const controller = new AbortController();
    const pending = liveExecutor(log).exec(
      { command: "sleep 300", cwd: workspaceRoot, timeoutMs: 600_000 },
      controller.signal,
    );
    setTimeout(() => controller.abort(), 2_000);

    await settlesWithin(pending, 60_000, "abort 후 exec");

    expect(docker("ps", "-aq", "--filter", labelFilter(log)).trim()).toBe("");
  }, 90_000);

  it("백그라운드 잡도 컨테이너와 함께 사라진다", async () => {
    // 컨테이너 안에서 백그라운드로 띄운 프로세스가 살아남으면 `--pids-limit`·
    // 메모리 상한이 무의미해진다 — 종료가 컨테이너 단위여야 하는 이유다.
    const log: LiveLogEntry[] = [];
    const result = await settlesWithin(
      liveExecutor(log).exec(
        { command: "( sleep 300 ) & echo started", cwd: workspaceRoot, timeoutMs: 5_000 },
        new AbortController().signal,
      ),
      60_000,
      "백그라운드 잡 exec",
    );

    expect(result.stdout).toContain("started");
    expect(docker("ps", "-aq", "--filter", labelFilter(log)).trim()).toBe("");
  }, 90_000);
});
