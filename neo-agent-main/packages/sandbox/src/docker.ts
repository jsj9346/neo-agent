/**
 * `docker` CLI와의 유일한 접점 — 주입 가능한 러너와 가용 판정(`probeDocker`).
 *
 * 정본: `docs/SANDBOX.md` §2(경계·금지 모듈) · §3(조건부 노출과 판정).
 *
 * **왜 CLI인가**: Docker HTTP API를 쓰려면 유닉스 소켓에 직접 붙어야 하고(`node:net`),
 * 그건 이 패키지에 금지된 모듈이다. 소켓 접근 코드를 갖는 것 자체가 §1의 위험(데몬은
 * 호스트 root 권한)을 우리 코드 안으로 들이는 일이다.
 *
 * **왜 러너가 주입점인가**: §4의 하드닝 계약은 런타임 동작이 아니라 **`docker`에 넘긴
 * 인자 배열의 성질**이다. `--network none`이 빠져도 명령은 정상 성공하므로, 인자를
 * 관찰할 수 있는 이음매가 없으면 하드닝 누락이 영원히 잡히지 않는다.
 *
 * 출력을 통짜 문자열이 아니라 **콜백 스트림**으로 받는 이유는 출력 유계
 * (`docs/TOOLS-INTERFACE.md` §4) 때문이다 — 반환값으로 받으면 상한 초과분이 이미
 * 메모리에 다 올라온 뒤라 "유계"가 절반만 성립한다.
 */

import { spawn } from "node:child_process";

export interface DockerRunOptions {
  /** `docker` 실행 파일 뒤에 오는 인자 전부 */
  readonly args: readonly string[];
  /** 컨테이너 stdin으로 흘려보낼 내용. 이 패키지는 쓰지 않는다(§4 — 명령은 인자로 싣는다) */
  readonly stdin?: string;
  /** stdout 청크. 유계 처리는 호출자 책임이다 */
  readonly onStdout?: (chunk: string) => void;
  /** stderr 청크 */
  readonly onStderr?: (chunk: string) => void;
}

export interface DockerProcess {
  /** `docker` **클라이언트** 프로세스의 종료 코드(시그널 종료는 `null`) */
  readonly exit: Promise<number | null>;
  /**
   * 클라이언트 프로세스에 시그널을 보낸다.
   * **컨테이너가 죽는다는 보장이 아니다** — 그것은 `docker kill`의 몫이다(§4).
   */
  kill(signal?: NodeJS.Signals): void;
}

export interface DockerRunner {
  run(options: DockerRunOptions): DockerProcess;
}

export type DockerAvailability =
  | { readonly available: true; readonly version: string }
  | { readonly available: false; readonly reason: string };

export interface ProbeDockerOptions {
  /** 판정 상한. 데몬이 매달려도 기동이 멈추지 않게 한다 */
  readonly timeoutMs?: number;
  readonly docker?: DockerRunner;
}

/**
 * 판정 상한 기본값. `SANDBOX.md` §8이 수치를 미결로 남겼다 — 계약은 "상한이
 * 존재한다"이지 30초가 아니다. **[미규정 ES-1]** 값은 T-013 실측 대상.
 */
const DEFAULT_PROBE_TIMEOUT_MS = 30_000;

/**
 * **데몬 접촉까지 확인한다.** `docker --version`은 클라이언트 바이너리 문자열일 뿐
 * 데몬에 붙지 않는다 — 2026-08-09 실측(개발 VPS)에서 `docker --version`은 성공하고
 * 데몬 접촉은 `permission denied`로 거부됐다(`SANDBOX.md` §3).
 *
 * **[미규정 ES-2]** 문서는 "데몬 접촉까지"만 요구하고 명령 형태를 정하지 않았다
 * (`version`/`info`/`ping` 중 무엇이든). `version --format`을 고른 이유는 서버 버전
 * 문자열이 그대로 `available.version`이 되어 판정과 표시가 한 번의 호출로 끝나기
 * 때문이다.
 */
const PROBE_ARGS = ["version", "--format", "{{.Server.Version}}"] as const;

/** 진단 문자열이 로그를 삼키지 않게 하는 상한 */
const DIAGNOSTIC_EXCERPT_CHARS = 300;
/** 판정용 명령의 출력 상한 — 버전 문자열은 짧다 */
const PROBE_OUTPUT_CHARS = 8 * 1024;

export type DockerCommandOutcome =
  | {
      readonly kind: "exited";
      readonly code: number | null;
      readonly stdout: string;
      readonly stderr: string;
    }
  | { readonly kind: "timeout"; readonly stdout: string; readonly stderr: string }
  | { readonly kind: "spawn-error"; readonly error: unknown };

/**
 * 실 `docker`를 spawn하는 기본 러너. 주입이 없을 때만 쓰인다.
 *
 * stdin은 닫는다 — 열어두면 입력을 기다리는 명령이 상한까지 매달린다.
 * 청크가 멀티바이트 경계에서 쪼개질 수 있으므로 `TextDecoder({ stream: true })`로
 * 이어 붙인다(바이트 단위 `toString()`은 경계에서 문자를 깨뜨린다).
 */
export function createSpawnDockerRunner(executable = "docker"): DockerRunner {
  return {
    run(options) {
      const child = spawn(executable, [...options.args], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      const stdoutDecoder = new TextDecoder();
      const stderrDecoder = new TextDecoder();

      child.stdout?.on("data", (chunk: Buffer) => {
        options.onStdout?.(stdoutDecoder.decode(chunk, { stream: true }));
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        options.onStderr?.(stderrDecoder.decode(chunk, { stream: true }));
      });

      const exit = new Promise<number | null>((resolve, reject) => {
        child.once("error", (error) => {
          reject(error);
        });
        child.once("close", (code) => {
          // 스트림 끝 — 디코더에 남은 불완전 시퀀스를 흘려보낸다
          const restOut = stdoutDecoder.decode();
          if (restOut !== "") options.onStdout?.(restOut);
          const restErr = stderrDecoder.decode();
          if (restErr !== "") options.onStderr?.(restErr);
          resolve(code);
        });
      });

      return {
        exit,
        kill(signal) {
          try {
            child.kill(signal);
          } catch {
            // 이미 죽었다 — 종료 시도의 실패는 그 자체로 문제가 아니다.
          }
        },
      };
    },
  };
}

/**
 * `docker` 명령 하나를 끝까지 돌리고 결과를 값으로 돌려준다. **던지지 않는다** —
 * 부재·권한 없음·무응답을 전부 판정으로 흡수하는 것이 이 함수의 존재 이유다.
 *
 * 상한을 넘기면 남은 프로세스에 종료를 시도한다 — 판정이 프로세스를 흘리면
 * 기동마다 좀비가 하나씩 쌓인다.
 */
export async function runDockerCommand(
  runner: DockerRunner,
  args: readonly string[],
  timeoutMs: number,
): Promise<DockerCommandOutcome> {
  let stdout = "";
  let stderr = "";

  const append = (current: string, chunk: string): string => {
    if (current.length >= PROBE_OUTPUT_CHARS) return current;
    return (current + chunk).slice(0, PROBE_OUTPUT_CHARS);
  };

  let child: DockerProcess;
  try {
    child = runner.run({
      args,
      onStdout: (chunk) => {
        stdout = append(stdout, chunk);
      },
      onStderr: (chunk) => {
        stderr = append(stderr, chunk);
      },
    });
  } catch (error) {
    // `docker` 실행 파일 부재(ENOENT)가 여기로 온다. 예외를 판정으로 바꾼다.
    return { kind: "spawn-error", error };
  }

  const exited = child.exit.then(
    (code) => ({ ok: true as const, code }),
    (error: unknown) => ({ ok: false as const, error }),
  );

  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });

  let settled: Awaited<typeof exited> | "timeout";
  try {
    settled = await Promise.race([exited, expired]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }

  if (settled === "timeout") {
    child.kill("SIGKILL");
    return { kind: "timeout", stdout, stderr };
  }
  if (!settled.ok) return { kind: "spawn-error", error: settled.error };
  return { kind: "exited", code: settled.code, stdout, stderr };
}

/** 여러 줄 stderr를 한 줄 진단 문구로 — 로그 한 줄에 담기게 한다 */
export function excerpt(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= DIAGNOSTIC_EXCERPT_CHARS) return collapsed;
  return `${collapsed.slice(0, DIAGNOSTIC_EXCERPT_CHARS)}…`;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? `${error.message} (${code})` : error.message;
  }
  return String(error);
}

/**
 * Docker 가용 판정. **예외를 던지지 않는다** — 이 결과는 세션 시작 시 도구 목록을
 * 정하는 데 쓰이고(§3), 예외로 튀면 호출부가 try/catch로 삼켜 "Docker 없음"과
 * "우리 코드의 버그"가 같은 모양이 된다.
 *
 * `reason`은 **진단용이지 사용자 문구가 아니다**(§3, 2026-08-09 판정). 사용자에게
 * 보이는 두 갈래 안내(설치 / 명시적 `sandbox: "off"`)의 정본은 `CLI-INTERFACE.md`이고
 * CLI가 자체 문구를 쓰면서 이 값을 원인으로 덧붙인다. 그래서 **미설치와 권한 없음이
 * 구분돼 담긴다** — 사용자가 할 일이 전혀 다르기 때문이다(`apt install docker` vs
 * `usermod -aG docker`).
 *
 * **[미규정 ES-4]** 문면과 분류 축(미설치 / 권한 없음 / 데몬 무응답 / 그 밖)은 문서가
 * 정하지 않았다. 문면은 계약이 아니지만 **미설치와 권한 없음이 갈린다는 것**은 §3이
 * 요구한 성질이므로 그 둘만은 서로 다른 분기로 고정했다.
 */
export async function probeDocker(options: ProbeDockerOptions = {}): Promise<DockerAvailability> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  const runner = options.docker ?? createSpawnDockerRunner();

  const outcome = await runDockerCommand(runner, PROBE_ARGS, timeoutMs);

  if (outcome.kind === "spawn-error") {
    const message = errorMessage(outcome.error);
    if (/ENOENT|command not found|no such file/i.test(message)) {
      return {
        available: false,
        reason: `docker 실행 파일을 찾을 수 없다 — 설치되지 않았거나 PATH에 없다: ${excerpt(message)}`,
      };
    }
    return { available: false, reason: `docker 실행에 실패했다: ${excerpt(message)}` };
  }

  if (outcome.kind === "timeout") {
    return {
      available: false,
      reason: `docker 데몬이 ${timeoutMs}ms 안에 응답하지 않았다 — 데몬이 매달려 있을 수 있다`,
    };
  }

  const { code, stdout, stderr } = outcome;

  if (code === 0) {
    // 서버 버전이 비면 클라이언트 응답만 온 것이지만, 종료 코드 0은 데몬 접촉 성공을
    // 뜻한다. 판정을 뒤집지 않고 버전 표기만 보수적으로 채운다.
    // **[미규정 ES-3]** "종료 코드 0인데 서버 버전이 빈" 경우의 판정을 문서가 정하지
    // 않았다. 가용 쪽으로 기울인 근거는 §3의 오차 방향이다 — 불가용 오판은 도구를
    // 통째로 숨겨 사용자가 이유를 알 수 없게 만든다.
    const version = stdout.trim() !== "" ? stdout.trim() : "unknown";
    return { available: true, version };
  }

  const combined = `${stderr} ${stdout}`;

  if (/permission denied|dial unix .*permission|got permission denied/i.test(combined)) {
    return {
      available: false,
      reason:
        "docker 데몬 소켓에 접근할 권한이 없다 — 사용자가 docker 그룹에 속하지 않았을 수 있다: " +
        excerpt(combined),
    };
  }
  if (
    /cannot connect to the docker daemon|is the docker daemon running|docker daemon is not running/i.test(
      combined,
    )
  ) {
    return {
      available: false,
      reason: `docker 데몬에 연결할 수 없다 — 데몬이 실행 중이 아닐 수 있다: ${excerpt(combined)}`,
    };
  }
  if (code === 127 || /command not found|not found/i.test(combined)) {
    return {
      available: false,
      reason: `docker 명령을 찾을 수 없다 — 설치되지 않았거나 PATH에 없다: ${excerpt(combined)}`,
    };
  }

  return {
    available: false,
    reason: `docker version이 종료 코드 ${code === null ? "null(시그널)" : code}로 실패했다: ${excerpt(combined)}`,
  };
}
