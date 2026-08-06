/**
 * 셸 실행자 경계 — `docs/TOOLS-INTERFACE.md` §4.
 *
 * **셸 도구는 실행 백엔드를 직접 품지 않는다.** 이 경계가 있어야 샌드박스 도입이
 * `HostShellExecutor` → `DockerShellExecutor` **교체**로 끝나고, 셸 도구 재작성이
 * 되지 않는다(SAFE-DEFAULTS §2의 🧬 흔적이 여기서 실체가 된다).
 *
 * 시크릿 제거·타임아웃 강제·중단 존중은 전부 실행자의 책임이다 — 백엔드를 바꿔도
 * 이 보장들이 따라오게 하려면 계약이 도구가 아니라 실행자 쪽에 있어야 한다.
 */

import { spawn } from "node:child_process";
import { truncateTailBytes } from "./truncate.ts";

export interface ShellExecRequest {
  command: string;
  /** 도구가 경계 검증을 마친 절대 경로 */
  cwd: string;
  timeoutMs: number;
}

export interface ShellExecResult {
  /** 시그널로 종료했으면 null */
  exitCode: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  timedOut: boolean;
}

export interface ShellExecutor {
  exec(request: ShellExecRequest, signal: AbortSignal): Promise<ShellExecResult>;
}

export interface HostShellExecutorOptions {
  /** 자식에게 물려줄 기본 환경. 기본 `process.env` */
  env?: NodeJS.ProcessEnv;
  /**
   * 이 값들이 담긴 변수는 **이름과 무관하게** 제거한다. 크리덴셜 로더가 실제로 읽은
   * 시크릿을 넘기는 자리다 — 이름 패턴만으로는 `MY_THING=sk-...`을 놓친다.
   */
  secretValues?: readonly string[];
  /** stdout·stderr 각각의 상한. 기본 64KB(OpenClaw 기준선) */
  maxOutputBytes?: number;
}

const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;
/** SIGTERM 후 이만큼 기다렸다가 SIGKILL — 정리할 기회는 주되 무한정 기다리지 않는다 */
const KILL_GRACE_MS = 200;

const SECRET_NAME_PATTERN = /(API_KEY|_TOKEN|TOKEN_|^TOKEN$|SECRET|PASSWORD|CREDENTIAL|_KEY$)/i;

/**
 * 자식 프로세스 환경에서 시크릿을 제거한다(SAFE-DEFAULTS §3 계약 3).
 * 에이전트가 실행한 스크립트가 `printenv`로 API 키를 읽는 경로를 막는다.
 */
export function scrubEnv(
  source: NodeJS.ProcessEnv,
  secretValues: readonly string[] = [],
): NodeJS.ProcessEnv {
  // 길이 하한을 두지 않는다 — 계약이 "시크릿 값이 실린 변수 **전부**"이기 때문이다
  // (TOOLS-INTERFACE §4). 짧은 시크릿이 우연히 다른 변수의 부분 문자열이 되면
  // 그 변수까지 제거되는 오탐이 생기지만, 유출과 오탐 중에서는 오탐을 택한다.
  // 빈 문자열만 제외한다 — 모든 값이 빈 문자열을 포함하므로 환경이 통째로 빈다.
  const meaningful = secretValues.filter((value) => value.length > 0);
  const scrubbed: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (SECRET_NAME_PATTERN.test(key)) continue;
    if (meaningful.some((secret) => value.includes(secret))) continue;
    scrubbed[key] = value;
  }

  return scrubbed;
}

export function createHostShellExecutor(options: HostShellExecutorOptions = {}): ShellExecutor {
  const baseEnv = options.env ?? process.env;
  const secretValues = options.secretValues ?? [];
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;

  return {
    exec(request, signal) {
      return new Promise<ShellExecResult>((resolve, reject) => {
        if (signal.aborted) {
          resolve({
            exitCode: null,
            stdout: "",
            stderr: "",
            truncated: false,
            timedOut: false,
          });
          return;
        }

        let child: ReturnType<typeof spawn>;
        try {
          child = spawn(request.command, {
            shell: true,
            cwd: request.cwd,
            env: scrubEnv(baseEnv, secretValues),
            // 새 프로세스 그룹을 만들어야 손자 프로세스까지 한 번에 종료할 수 있다
            // (`( sleep 5 ) & ...` 같은 백그라운드 잡이 살아남지 않게 — 2026-08-06 실측).
            detached: true,
            // stdin을 닫는다 — 열어두면 입력을 기다리는 명령이 타임아웃까지 매달린다.
            stdio: ["ignore", "pipe", "pipe"],
          });
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
          return;
        }

        let stdout = "";
        let stderr = "";
        let timedOut = false;
        let settled = false;

        const killTree = (): void => {
          if (child.pid === undefined) return;
          try {
            process.kill(-child.pid, "SIGTERM");
          } catch {
            // 이미 죽었거나 그룹이 없다 — SIGKILL 시도로 넘어간다.
          }
          setTimeout(() => {
            if (child.pid === undefined || settled) return;
            try {
              process.kill(-child.pid, "SIGKILL");
            } catch {
              // 정리 완료.
            }
          }, KILL_GRACE_MS).unref();
        };

        const timer = setTimeout(() => {
          timedOut = true;
          killTree();
        }, request.timeoutMs);

        const onAbort = (): void => killTree();
        signal.addEventListener("abort", onAbort, { once: true });

        const cleanup = (): void => {
          settled = true;
          clearTimeout(timer);
          signal.removeEventListener("abort", onAbort);
        };

        child.stdout?.on("data", (chunk: Buffer) => {
          stdout += chunk.toString("utf8");
        });
        child.stderr?.on("data", (chunk: Buffer) => {
          stderr += chunk.toString("utf8");
        });

        child.on("error", (error) => {
          cleanup();
          reject(error);
        });

        child.on("close", (code) => {
          cleanup();
          const outTail = truncateTailBytes(stdout, maxOutputBytes);
          const errTail = truncateTailBytes(stderr, maxOutputBytes);
          resolve({
            exitCode: code,
            stdout: outTail.text,
            stderr: errTail.text,
            truncated: outTail.truncated || errTail.truncated,
            timedOut,
          });
        });
      });
    },
  };
}
