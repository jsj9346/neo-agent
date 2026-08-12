/**
 * `DockerShellExecutor` — 셸 실행을 컨테이너 경계 뒤로 옮긴다.
 *
 * 정본: `docs/SANDBOX.md` §4(하드닝 표·마운트·env 화이트리스트·고아 방지·종료 코드) +
 * `docs/TOOLS-INTERFACE.md` §4(`ShellExecutor` 3계약: timeout 강제·abort 존중·출력 유계).
 *
 * **인터페이스는 한 글자도 바뀌지 않는다**(`SANDBOX.md` §2 — 흔적 🧬 회수의 전제).
 * `packages/tools`를 임포트하지 않고 **구조적 타입 호환**으로 `ShellExecutor`를
 * 만족시킨다. 배선은 CLI 한 곳이며, 거기서 `HostShellExecutor`와 자리를 바꾼다.
 *
 * ## 고아 방지가 이 파일의 1급 관심사다
 *
 * `docker run` 클라이언트를 죽여도 컨테이너는 계속 돈다. 호스트 실행자에서 통과하던
 * timeout·abort 테스트가 여기서 **조용히 거짓**이 되는 지점이다 — `exec`는 제때
 * 반환하는데 컨테이너는 살아 있는 상태. 그래서 종료 순서를 뒤집는다:
 *
 *   1. **컨테이너를 먼저 죽인다** (`docker kill <name>`). 우리보다 오래 살 수 있는
 *      것이 컨테이너이지 클라이언트가 아니다.
 *   2. 클라이언트가 아직 붙어 있으면 짧은 유예 뒤 **한 번 더** 지목해 죽인다 —
 *      1차 kill이 컨테이너 생성보다 앞설 수 있기 때문이다(즉시 abort·짧은 timeout).
 *   3. 그 다음에야 클라이언트를 `SIGKILL`한다. 이 순서면 클라이언트를 죽이는 시점에
 *      컨테이너는 이미 없다.
 *   4. **정리 전체에 상한이 있다.** 정리가 매달리면 `exec`가 매달리고, 상위의 어떤
 *      타임아웃도 그것을 잡지 못한다(도구가 아니라 실행자가 매다는 형태라서).
 *
 * `--rm`은 **정상 종료 경로**일 뿐이므로 여기에 기대지 않는다.
 */

import type { DockerProcess, DockerRunner } from "./docker.ts";
import { createSpawnDockerRunner, errorMessage, excerpt, runDockerCommand } from "./docker.ts";

/** `docs/TOOLS-INTERFACE.md` §4 — 정본이 적어 둔 모양 그대로. 구조적 호환용 로컬 선언 */
export interface ShellExecRequest {
  command: string;
  /** 도구가 경계 검증을 마친 **호스트** 절대 경로. 번역하지 않는다 */
  cwd: string;
  timeoutMs: number;
}

export interface ShellExecResult {
  /** 시그널로 끝났으면 null — timeout·abort 경로가 여기 해당한다 */
  exitCode: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  timedOut: boolean;
}

export interface DockerShellExecutorOptions {
  /** 고정 태그 이미지. `latest` 금지의 **강제 지점은 CLI 설정 검증 하나**다(§4) */
  readonly image: string;
  /** 유일한 바인드 마운트. 호스트와 **같은 절대 경로**로 마운트된다 */
  readonly workspaceRoot: string;
  /** 기본값은 호스트 uid/gid. 테스트가 값을 고정할 수 있게 주입 옵션으로 둔다 */
  readonly uid?: number;
  readonly gid?: number;
  /** 메모리 상한(`docker` 표기, 예: `"1g"`). 미지정이어도 상한은 붙는다 */
  readonly memoryLimit?: string;
  readonly pidsLimit?: number;
  /** stdout·stderr 각각의 상한 바이트 */
  readonly maxOutputBytes?: number;
  /** 정리(컨테이너 종료) 절차 전체의 상한 */
  readonly cleanupTimeoutMs?: number;
  readonly docker?: DockerRunner;
}

/**
 * 실행 식별 라벨. **키는 실행 간 안정, 값은 실행마다 고유**여야 한다(§4) —
 * 사후에 고아를 조회하는 유일한 수단이고 `docker ps` 출력에 사용자 눈으로도 보인다.
 */
const RUN_LABEL_KEY = "neo-agent-run";
/**
 * 라벨과 **같은 고유값**으로 이름도 준다. **[미규정 ES-7]** 문서는 라벨만 규정했지만,
 * 이름이 없으면 정리 명령이 컨테이너 ID를 알아야 하고 그 ID는 attach된 `docker run`의
 * stdout에 오지 않는다(그 스트림은 명령의 출력이다). 이름이 있으면 `docker kill <name>`
 * 한 번으로 **그 컨테이너만** 지목할 수 있다 — 쓸어담기 금지(§4)의 실장 수단이다.
 */
const CONTAINER_NAME_PREFIX = "neo-agent-";

/**
 * `HOME`은 **고정값 `/tmp`**다(§4 표). 읽기 전용 루트에서 홈이 쓰기 불가면 많은
 * 도구가 **조용히** 실패한다. 워크스페이스를 홈으로 두지 않는 이유는 도구가 만드는
 * 캐시·설정 파일이 사용자 저장소를 오염시키기 때문이다.
 */
const CONTAINER_HOME = "/tmp";

/**
 * **화이트리스트다.** 넣을 이름을 코드가 나열한다 — `process.env`를 필터링해 넘기는
 * 구조는 이름을 아무리 잘 골라도 denylist이고, 패턴에 안 걸리는 변수(`MY_NOTES`·
 * `PROJECT_ROOT`)가 샌다(§4).
 *
 * `PATH`는 없다 — 호스트 PATH는 컨테이너에 **존재하지 않는 디렉터리**를 가리키고
 * 이미지 기본 PATH가 그 이미지에 맞는 값이다. `USER`·`LOGNAME`·`SHELL`·`PWD`도 없다
 * (uid는 `--user`가, cwd는 `-w`가 이미 정한다).
 */
const PASSTHROUGH_ENV = ["LANG", "TERM", "TZ"] as const;

/**
 * 계약은 **"유계"**이지 수치가 아니다(`SANDBOX.md` §4 표). 아래 두 값은 2026-08-09
 * 실측이 확정했고(§8) 여전히 **조정 가능한 세부**다 — 실측이 확인한 것은 *상한이
 * 의도대로 무는가*이지 이 숫자만이 답이라는 것이 아니다.
 */
const DEFAULT_MEMORY_LIMIT = "1g";
const DEFAULT_PIDS_LIMIT = 256;
/** `HostShellExecutor`와 같은 기준선(OpenClaw 64KB tail) — 실행자 간 결과가 갈리지 않게 */
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;
/**
 * 정리 절차 **전체**의 상한. 문서는 "정리 자체에도 상한이 있다"만 말하고 수치를
 * 정하지 않았다. **[미규정 ES-6]** 이 값은 최악의 경우 `exec` 반환을 그만큼 늦춘다
 * (timeout 상한 + 이 값이 실질 반환 상한이다).
 */
const DEFAULT_CLEANUP_TIMEOUT_MS = 5_000;
/** 컨테이너 종료 후 클라이언트가 스스로 빠져나오기를 기다리는 유예 [미규정 ES-6] */
const POST_KILL_GRACE_MS = 250;
/** 클라이언트 `SIGKILL` 후의 마지막 유예 [미규정 ES-6] */
const CLIENT_EXIT_GRACE_MS = 250;

/**
 * `docker` CLI 자신의 실패 코드. 컨테이너 안 명령이 진짜 125로 끝날 수도 있어
 * **원리적으로 코드만으로는 구분되지 않는다**(§4). 그럼에도 실행 실패로 승격하는
 * 이유는 오분류의 방향 때문이다 — 진짜 125를 실행 실패로 보고하면 모델은 재시도하거나
 * 사용자에게 묻지만(복구 가능), 반대로 docker의 실패를 명령의 실패로 흘리면 모델은
 * 존재하지 않는 버그를 디버깅한다(복구 불가에 가깝다).
 */
const DOCKER_CLI_FAILURE_CODE = 125;

interface Tail {
  push(chunk: string): void;
  snapshot(): { text: string; truncated: boolean };
}

/**
 * 유계 tail 버퍼 — 누적하지 않고 상한을 **유지**한다. 통짜로 모았다가 마지막에 자르면
 * 상한 초과분이 이미 메모리에 다 올라온 뒤라 "유계"가 절반만 성립한다.
 */
function createTail(maxBytes: number): Tail {
  let text = "";
  let truncated = false;

  return {
    push(chunk) {
      if (chunk === "") return;
      text += chunk;
      if (Buffer.byteLength(text, "utf8") <= maxBytes) return;

      const buffer = Buffer.from(text, "utf8");
      let start = buffer.length - maxBytes;
      // 잘린 경계가 멀티바이트 문자 중간이면 이어지는 바이트를 버린다 —
      // 안 그러면 tail 첫 글자가 U+FFFD로 깨진다.
      while (start < buffer.length && (buffer[start] ?? 0) >= 0x80 && (buffer[start] ?? 0) < 0xc0) {
        start += 1;
      }
      text = buffer.subarray(start).toString("utf8");
      truncated = true;
    },
    snapshot: () => ({ text, truncated }),
  };
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * 컨테이너에 넘길 env. **넣을 이름을 코드가 나열한다**(위 `PASSTHROUGH_ENV` 주석).
 */
function containerEnv(): string[] {
  const entries = [`HOME=${CONTAINER_HOME}`];
  for (const name of PASSTHROUGH_ENV) {
    const value = process.env[name];
    if (value !== undefined && value !== "") entries.push(`${name}=${value}`);
  }
  return entries;
}

export function createDockerShellExecutor(options: DockerShellExecutorOptions): {
  exec(request: ShellExecRequest, signal: AbortSignal): Promise<ShellExecResult>;
} {
  const runner = options.docker ?? createSpawnDockerRunner();
  const { image, workspaceRoot } = options;
  const uid = options.uid ?? process.getuid?.();
  const gid = options.gid ?? process.getgid?.();
  const memoryLimit = options.memoryLimit ?? DEFAULT_MEMORY_LIMIT;
  const pidsLimit = options.pidsLimit ?? DEFAULT_PIDS_LIMIT;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const cleanupTimeoutMs = options.cleanupTimeoutMs ?? DEFAULT_CLEANUP_TIMEOUT_MS;

  function buildRunArgs(containerName: string, runId: string, request: ShellExecRequest): string[] {
    const args = [
      "run",
      // 정상 종료 경로의 제거. 고아 방지는 이것이 아니라 `docker kill`이 맡는다
      "--rm",
      "--name",
      containerName,
      "--label",
      `${RUN_LABEL_KEY}=${runId}`,
      // 웹은 `web_fetch`라는 감사된 문 하나로만 (§5)
      "--network",
      "none",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      // 포크 폭탄·메모리 고갈이 호스트를 끌고 내려가지 않게
      "--pids-limit",
      String(pidsLimit),
      "--memory",
      memoryLimit,
      // 스왑을 메모리와 같게 두면 스왑이 꺼진다. 두지 않으면 docker 기본이 메모리의
      // 2배라 방금 건 상한이 실질적으로 2배가 된다 — **§4 표가 이 인자를 그렇게
      // 규정한다.** 미규정이 아니다: 2026-08-09 구현이 이 결함을 발견하면서 같은
      // 커밋으로 표에 행을 올렸다
      "--memory-swap",
      memoryLimit,
      // 읽기 전용 루트의 보완. 컨테이너와 함께 사라진다.
      // **크기 상한을 주지 않는 것은 판정이다** — tmpfs 페이지가 컨테이너 메모리
      // cgroup에 잡혀 `--memory`가 이미 상한이고, 여기서 수치를 또 정하면 상한이
      // 둘이 되어 작은 쪽이 조용한 실패를 만든다. 이 주석이 처음엔 **가정**으로
      // 적어 둔 근거인데 2026-08-09 실측이 확인했고 §8이 판단을 명문화했다.
      // **[미규정 ES-9]** 남은 미규정은 **옵션 문자열**이다 — §4 표의 `/tmp` 행은
      // "tmpfs" 한 단어뿐이라 아래 세 옵션은 여전히 구현 재량이다
      "--tmpfs",
      "/tmp:rw,nosuid,nodev,mode=1777",
      // **호스트와 같은 절대 경로.** 경로 번역 계층을 만들지 않기 위해서다 —
      // 번역 테이블이 생기면 그것이 두 번째 판정기이고, 판정기가 둘이면 어긋난다
      "-v",
      `${workspaceRoot}:${workspaceRoot}`,
      "-w",
      request.cwd,
    ];

    // 컨테이너가 만든 파일이 root 소유가 되면 호스트에서 사용자가 고칠 수 없다
    if (uid !== undefined && gid !== undefined) args.push("--user", `${uid}:${gid}`);

    for (const entry of containerEnv()) args.push("-e", entry);

    // 명령은 **인자로** 싣는다(§4 확정) — stdin 파이프는 `-i`가 필요하고 셸 선택이
    // 이미지 내용과 얽히며 스트림이 하나 더 는다.
    //
    // **이미지는 받은 그대로 쓴다.** `latest` 금지의 강제 지점은 CLI 설정 검증
    // 하나이며 **실행자는 겸하지 않는다**(§4, 2026-08-09 판정 — 같은 규칙의 에러가
    // 두 곳에서 나면 문면이 갈리고, 실행자 쪽은 도구 실행 시점에야 터져 사용자
    // 경험이 더 나쁘다). **[미규정 ES-10]** QA-B의 `docker-args.contract.test.ts`
    // "[미규정 B-1]" 2건은 이 판정 **이전에** 작성돼 실행자 층의 거부를 기대한다 —
    // 정본이 바뀐 것이지 구현이 어긴 것이 아니다(보고 대상).
    args.push(image, "sh", "-c", request.command);
    return args;
  }

  return {
    async exec(request: ShellExecRequest, signal: AbortSignal): Promise<ShellExecResult> {
      const stdout = createTail(maxOutputBytes);
      const stderr = createTail(maxOutputBytes);

      // 이미 중단된 런이 컨테이너를 하나 띄우고 지우는 것은 낭비이자 고아의 씨앗이다
      if (signal.aborted) {
        return { exitCode: null, stdout: "", stderr: "", truncated: false, timedOut: false };
      }

      const runId = globalThis.crypto.randomUUID();
      const containerName = `${CONTAINER_NAME_PREFIX}${runId}`;
      const runArgs = buildRunArgs(containerName, runId, request);

      let child: DockerProcess;
      try {
        child = runner.run({
          args: runArgs,
          onStdout: (chunk) => stdout.push(chunk),
          onStderr: (chunk) => stderr.push(chunk),
        });
      } catch (error) {
        // `docker` 부재·spawn 실패. §3이 말한 "실행 실패로 보고하고 Docker 부재를
        // 명시한다"의 실장 지점이다.
        throw new Error(
          `docker를 실행하지 못해 셸 명령을 돌릴 수 없다 (Docker가 없거나 접근할 수 없다): ${errorMessage(error)}`,
          { cause: error },
        );
      }

      let timedOut = false;
      let aborted = false;
      let clientExited = false;

      const exited = child.exit.then(
        (code) => {
          clientExited = true;
          return { kind: "exited" as const, code };
        },
        (error: unknown) => {
          clientExited = true;
          return { kind: "failed" as const, error };
        },
      );

      let resolveForced: (value: { kind: "forced" }) => void = () => {};
      const forced = new Promise<{ kind: "forced" }>((resolve) => {
        resolveForced = resolve;
      });

      /** 남은 예산 안에서 **그 컨테이너만** 지목해 죽인다. 쓸어담기는 금지다(§4) */
      const killContainer = async (deadline: number): Promise<void> => {
        const budget = deadline - Date.now();
        if (budget <= 0) return;
        // `docker stop`이 아니라 `docker kill`이다 — stop의 기본 유예 10초가
        // 방금 강제한 상한의 실질을 깎아먹는다(§4).
        await runDockerCommand(runner, ["kill", containerName], budget);
      };

      /** 클라이언트가 스스로 빠져나오길 유예 안에서만 기다린다 */
      const waitForClient = async (graceMs: number, deadline: number): Promise<void> => {
        const budget = Math.min(graceMs, deadline - Date.now());
        if (budget <= 0) return;
        await Promise.race([exited, delay(budget)]);
      };

      let terminating = false;
      const terminate = (): void => {
        if (terminating) return;
        terminating = true;

        void (async () => {
          const deadline = Date.now() + cleanupTimeoutMs;
          try {
            // 1. 컨테이너부터. 우리보다 오래 살 수 있는 것은 이쪽이다
            await killContainer(deadline);
            if (!clientExited) {
              await waitForClient(POST_KILL_GRACE_MS, deadline);
              // 2. 1차 kill이 컨테이너 **생성보다 앞섰을** 수 있다(즉시 abort·짧은
              //    timeout). 그때 1차는 "No such container"로 끝나고 컨테이너는
              //    그 뒤에 뜬다 — 클라이언트가 여전히 붙어 있다는 것이 그 신호다.
              //    **[미규정 ES-11]** 재시도는 문서에 없다. 지목 범위는 그대로이고
              //    (같은 이름) 정리 예산 안에서만 도므로 계약을 넓히지 않는다.
              if (!clientExited) await killContainer(deadline);
            }
          } catch {
            // 정리 실패는 결과를 바꾸지 않는다 — 아래 클라이언트 종료로 이어간다.
          }
          try {
            // 3. 이제야 클라이언트. 이 시점이면 컨테이너는 이미 없다
            child.kill("SIGKILL");
            if (!clientExited)
              await waitForClient(CLIENT_EXIT_GRACE_MS, Date.now() + CLIENT_EXIT_GRACE_MS);
          } catch {
            // 어떤 경우에도 아래 resolve까지 도달해야 한다 — 여기서 던지면
            // `exec`가 영원히 pending이 되고 그것이 §4가 막으려는 바로 그 상태다.
          }
          // 4. 클라이언트가 시그널을 무시해도 `exec`는 반환한다 — 정리가 매다는
          //    무한 대기는 상위의 어떤 타임아웃도 잡지 못한다
          resolveForced({ kind: "forced" });
        })();
      };

      const timer = setTimeout(() => {
        timedOut = true;
        terminate();
      }, request.timeoutMs);

      const onAbort = (): void => {
        aborted = true;
        terminate();
      };
      signal.addEventListener("abort", onAbort, { once: true });

      let outcome: Awaited<typeof exited> | { kind: "forced" };
      try {
        outcome = await Promise.race([exited, forced]);
        // 정리를 시작했다면 **끝까지 기다린 뒤** 반환한다. 클라이언트가 먼저 죽어
        // `exited`가 경주에서 이기는 경우가 있는데, 그때 그냥 반환하면 `exec`가
        // 컨테이너 종료 명령보다 앞서 끝난다 — 호출자 입장에서 "반환 = 정리 완료"가
        // 아니게 되고, 고아 여부를 확인하려는 쪽(T-013)이 경주와 싸우게 된다.
        // `forced`는 정리 절차의 끝에서만 resolve되고 그 절차 자체가 유계다.
        if (terminating) await forced;
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
      }

      const out = stdout.snapshot();
      const err = stderr.snapshot();
      const truncated = out.truncated || err.truncated;

      // timeout·abort로 끝나도 **그때까지의 출력은 살린다**(TOOLS-INTERFACE §4).
      // 부분 출력을 버리면 사용자는 왜 멈췄는지의 단서를 통째로 잃는다.
      // **[미규정 ES-12]** 잘림을 **결과 텍스트에 문구로 넣지 않고** `truncated`
      // 플래그로만 알린다 — `HostShellExecutor`가 그렇게 하고 문구는 셸 도구가
      // 붙이기 때문이다(`packages/tools/src/shell.ts`). 실행자마다 갈리면
      // `sandbox: on/off`가 "같은 도구, 다른 결과"가 된다.
      if (timedOut || aborted || outcome.kind === "forced") {
        return { exitCode: null, stdout: out.text, stderr: err.text, truncated, timedOut };
      }

      if (outcome.kind === "failed") {
        throw new Error(
          `docker 실행이 실패했다 (컨테이너 결과를 얻지 못했다): ${errorMessage(outcome.error)}`,
          { cause: outcome.error },
        );
      }

      if (outcome.code === DOCKER_CLI_FAILURE_CODE) {
        throw new Error(
          `docker가 종료 코드 ${DOCKER_CLI_FAILURE_CODE}로 끝났다 — docker CLI 자신의 실패(이미지 없음·데몬 오류 등)로 보고 실행 실패로 승격한다. ` +
            `주의: 컨테이너 안 명령이 진짜 ${DOCKER_CLI_FAILURE_CODE}로 끝난 경우와 종료 코드만으로는 원리적으로 구분되지 않는다(docs/SANDBOX.md §4). ` +
            `stderr: ${excerpt(err.text)}`,
        );
      }

      // 컨테이너 **프로세스의** 종료 코드다 — `exit 7`이 7로 온다
      return {
        exitCode: outcome.code,
        stdout: out.text,
        stderr: err.text,
        truncated,
        timedOut: false,
      };
    },
  };
}
