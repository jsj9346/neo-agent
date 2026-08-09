/**
 * QA-B 계약 테스트 공용 — **Docker 주입점 스텁**과 인자 파싱 헬퍼.
 *
 * 기대값의 출처: `docs/SANDBOX.md` §2·§3·§4 + `docs/TOOLS-INTERFACE.md` §4.
 *
 * ## 왜 주입점이 필요한가
 *
 * `SANDBOX.md` §4의 하드닝 계약은 **런타임 동작이 아니라 `docker` CLI에 넘긴 인자
 * 배열의 성질**이다. `--network none`이 빠진 실행자도 명령은 정상적으로 성공하므로,
 * 결과만 보는 테스트로는 하드닝 누락이 영원히 잡히지 않는다. 인자를 관찰할 수 있는
 * 이음매가 없으면 이 패키지의 1급 계약이 통째로 검증 불가가 된다.
 *
 * ## 이 파일이 제안하는 `DockerRunner` (구현자에게 주는 명세)
 *
 * 아래 세 인터페이스를 `packages/sandbox/src/docker.ts`가 그대로 export 하고,
 * `DockerShellExecutorOptions.docker` / `probeDocker({ docker })`가 이 타입을 받는다.
 * 여기 정의는 테스트 로컬 사본이므로, 구현이 다른 모양을 export 하면 **구조적 대입이
 * 실패해 typecheck에서 드러난다** — 그것이 이 사본의 목적이다.
 *
 * 요구 성질 4개:
 *  1. **인자 배열 관찰** — `run({ args })`의 `args`가 `docker` 실행 파일 뒤의 전부다.
 *     실행자가 인자를 어디에도 숨길 수 없어야 §4 표 전체를 한 곳에서 검증할 수 있다.
 *  2. **종료 코드·출력 조작** — 컨테이너 프로세스의 코드(`exit 7`)가 그대로 올라오는지,
 *     대용량 출력이 유계로 잘리는지를 실제 프로세스 없이 결정론적으로 만든다.
 *  3. **프로세스 수명 흉내** — `exit`가 스텁이 `settle()`을 부를 때까지 pending으로
 *     남는다. "끝나지 않는 명령"을 만들 수 있어야 timeout·abort를 검증할 수 있다.
 *  4. **`kill`과 종료의 분리** — `kill()`은 기록만 되고, 죽을지 말지는 스텁이 정한다.
 *     이것이 고아 컨테이너 검증의 핵심이다: 실제 Docker에서도 `docker run` 클라이언트를
 *     죽이는 것과 컨테이너가 죽는 것은 별개이며(SANDBOX §4), 그 분리를 스텁이 재현하지
 *     못하면 "클라이언트만 죽이고 끝내는" 구현이 그린으로 통과한다.
 *
 * 스트림을 콜백으로 둔 이유: 출력 유계(§4)는 **누적하지 않고 상한을 유지**할 수 있어야
 * 의미가 있다. 결과를 통짜 문자열로 돌려주는 모양이면 상한을 넘는 출력이 이미 메모리에
 * 다 올라온 뒤라 계약이 절반만 성립한다.
 */

export interface DockerRunOptions {
  /** `docker` 실행 파일 뒤에 오는 인자 전부. 예: `["run", "--rm", "--network", "none", …]` */
  readonly args: readonly string[];
  /** 컨테이너 stdin으로 흘려보낼 내용(명령 문자열 전달 수단으로 쓸 수 있다) */
  readonly stdin?: string;
  /** stdout 청크. 유계 처리는 실행자 책임이다 */
  readonly onStdout?: (chunk: string) => void;
  /** stderr 청크 */
  readonly onStderr?: (chunk: string) => void;
}

export interface DockerProcess {
  /** `docker` 클라이언트 프로세스가 끝나면 종료 코드로 resolve(시그널 종료는 `null`) */
  readonly exit: Promise<number | null>;
  /** 클라이언트 프로세스에 종료 시그널을 보낸다. **컨테이너가 죽는다는 보장은 아니다** */
  kill(signal?: NodeJS.Signals): void;
}

export interface DockerRunner {
  run(options: DockerRunOptions): DockerProcess;
}

/** 스텁이 기록·조작하는 한 번의 `docker` 호출 */
export interface StubInvocation {
  readonly args: readonly string[];
  /** `exactOptionalPropertyTypes` 아래에서 대입이 막히지 않게 필수 + `undefined` 허용으로 둔다 */
  readonly stdin: string | undefined;
  /** `kill()`로 받은 시그널 기록 — "클라이언트만 죽였다"를 판별하는 근거 */
  readonly killSignals: (NodeJS.Signals | undefined)[];
  /** 아직 종료하지 않았는가 */
  pending: boolean;
  /** `kill()` 수신 시 동작. 미설정이면 **아무 일도 일어나지 않는다**(죽지 않는 클라이언트) */
  onKill?: (signal: NodeJS.Signals | undefined) => void;
  write(stream: "stdout" | "stderr", chunk: string): void;
  settle(exitCode: number | null): void;
}

export interface DockerStub {
  runner: DockerRunner;
  /** 발생한 모든 호출(run·stop·kill·version…)을 순서대로 */
  invocations: StubInvocation[];
  /** `docker run` 호출만 */
  runs(): StubInvocation[];
  /** 마지막 `docker run` 호출. 없으면 throw */
  lastRun(): StubInvocation;
  /** `run`이 아닌 호출 — 정리(stop/kill/rm)·판정(version/info) 계열 */
  others(): StubInvocation[];
}

/** 호출 하나를 받아 수명·출력·종료를 정하는 함수. 미지정이면 즉시 성공(exit 0) */
export type StubBehavior = (invocation: StubInvocation) => void;

/**
 * `runner.run` 자체가 던지게 만드는 스텁 — `docker` 실행 파일 부재(ENOENT) 재현용.
 * `probeDocker`가 **예외가 아니라 판정으로** 돌려주는지 확인하는 데 쓴다(SANDBOX §3).
 */
export function throwingDockerRunner(error: Error): DockerRunner {
  return {
    run() {
      throw error;
    },
  };
}

export function createDockerStub(behavior?: StubBehavior): DockerStub {
  const invocations: StubInvocation[] = [];

  const runner: DockerRunner = {
    run(options) {
      let settleExit: (code: number | null) => void = () => {};
      const exit = new Promise<number | null>((resolve) => {
        settleExit = resolve;
      });

      const invocation: StubInvocation = {
        args: [...options.args],
        stdin: options.stdin,
        killSignals: [],
        pending: true,
        write(stream, chunk) {
          if (stream === "stdout") options.onStdout?.(chunk);
          else options.onStderr?.(chunk);
        },
        settle(exitCode) {
          if (!invocation.pending) return;
          invocation.pending = false;
          settleExit(exitCode);
        },
      };

      invocations.push(invocation);

      const process: DockerProcess = {
        exit,
        kill(signal) {
          invocation.killSignals.push(signal);
          invocation.onKill?.(signal);
        },
      };

      if (behavior === undefined) {
        // 기본 동작: 즉시 성공. 인자 검증만 하는 테스트가 수명을 신경 쓰지 않게 한다
        queueMicrotask(() => invocation.settle(0));
      } else {
        behavior(invocation);
      }

      return process;
    },
  };

  return {
    runner,
    invocations,
    runs: () => invocations.filter((invocation) => invocation.args[0] === "run"),
    lastRun() {
      const runs = this.runs();
      const last = runs.at(-1);
      if (last === undefined) throw new Error("docker run 호출이 없다");
      return last;
    },
    others: () => invocations.filter((invocation) => invocation.args[0] !== "run"),
  };
}

// ---------------------------------------------------------------------------
// 인자 파싱 — `--flag value`와 `--flag=value` 두 표기를 모두 인정한다.
// 표기 선택은 구현 자유이고 계약이 아니므로, 표기 하나에 못박으면 계약이 아닌 것을
// 계약으로 만드는 셈이 된다.
// ---------------------------------------------------------------------------

export function flagValues(args: readonly string[], ...aliases: string[]): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    for (const alias of aliases) {
      if (arg === alias) {
        const next = args[index + 1];
        if (next !== undefined) values.push(next);
      } else if (arg.startsWith(`${alias}=`)) {
        values.push(arg.slice(alias.length + 1));
      }
    }
  }
  return values;
}

export function hasFlag(args: readonly string[], ...aliases: string[]): boolean {
  return args.some((arg) => aliases.some((alias) => arg === alias || arg.startsWith(`${alias}=`)));
}

/** `-e NAME=value` / `--env NAME=value` / `-e NAME`(호스트 상속) 전부에서 **이름**만 뽑는다 */
export function envNames(args: readonly string[]): string[] {
  return flagValues(args, "-e", "--env").map((entry) => entry.split("=")[0] ?? entry);
}

/** 마운트 표기 2종(`-v src:dst` / `--mount type=bind,source=…,target=…`)을 한 모양으로 */
export interface MountSpec {
  source: string;
  target: string;
  raw: string;
}

export function mounts(args: readonly string[]): MountSpec[] {
  const specs: MountSpec[] = [];

  for (const raw of flagValues(args, "-v", "--volume")) {
    // Linux 절대 경로만 다루면 되므로 `src:dst[:opts]`를 앞 두 조각으로 자른다
    const parts = raw.split(":");
    if (parts.length >= 2) {
      specs.push({ source: parts[0] ?? "", target: parts[1] ?? "", raw });
    }
  }

  for (const raw of flagValues(args, "--mount")) {
    const fields = new Map(
      raw.split(",").map((field) => {
        const [key, ...rest] = field.split("=");
        return [key ?? "", rest.join("=")] as const;
      }),
    );
    const source = fields.get("source") ?? fields.get("src") ?? "";
    const target = fields.get("target") ?? fields.get("destination") ?? fields.get("dst") ?? "";
    if (source !== "" || target !== "") specs.push({ source, target, raw });
  }

  return specs;
}

/** `--label k=v` 값들 */
export function labels(args: readonly string[]): { key: string; value: string }[] {
  return flagValues(args, "-l", "--label").map((entry) => {
    const [key, ...rest] = entry.split("=");
    return { key: key ?? "", value: rest.join("=") };
  });
}

/**
 * 컨테이너를 나중에 지목할 수 있게 하는 식별자 후보(`--name` 값 + 라벨 값).
 * 고아 방지 검증에서 "정리 명령이 **그 컨테이너**를 가리켰는가"를 판정하는 데 쓴다.
 */
export function containerIdentifiers(runArgs: readonly string[]): string[] {
  return [
    ...flagValues(runArgs, "--name"),
    ...labels(runArgs)
      .map((label) => label.value)
      .filter((value) => value !== ""),
  ];
}

export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** 프라미스가 제한 시간 안에 정착하는지 — "매달리지 않는다"를 실패로 바꾸는 장치 */
export async function settlesWithin<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${what}: ${ms}ms 안에 반환하지 않았다`)), ms);
  });
  try {
    return await Promise.race([promise, guard]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
