/**
 * 브라우저 e2e의 **서버 하네스** — 조립 실물을 인프로세스로 띄우고, 대체하는 것은 모델과
 * `probeDocker` 둘뿐이다(A). 그 밖에 이 파일이 채우는 `CliDeps`·`ServeOptions`의 호스트
 * 대역(B)·구성·관측(C) 자리는 대체가 아니라, 실 프로세스 엔트리가 밖에서 채우는 값을 이
 * 안에서 이행한 것이다.
 *
 * 정본은 `docs/TECH-STACK.md` §7.1 결정 4(모의 범위)·결정 5(포트 0)다.
 *
 * **여기서 재려는 것은 부품이 아니라 조립이 실제로 브라우저에 닿는가다.** 그래서 이 파일이
 * 대체하는 것은 딱 둘이고, 둘 다 대체하지 않으면 검사가 성립하지 않는 자리다:
 *
 * 1. **모델** — 네트워크로 나갈 수 없고(§7.1 결정 4), 브라우저가 볼 문면이 결정적이어야
 *    3단계(SSE 렌더링)의 단정이 값을 갖는다.
 * 2. **`probeDocker`** — 샌드박스 기본값이 `on`이라 조립의 시작 시퀀스가 Docker 가용성을
 *    반드시 판정하는데, 주입이 없으면 그 판정이 실제 `docker version` 스폰이 된다. 증상은
 *    붉은 단정이 아니라 **느려짐**이라 사람 눈에 안 보인다(`ARCHITECTURE.md` §2.6).
 *
 * **그 밖은 전부 실물이다** — 저장소·게이트·경계·도구·서버·스트림·승인 레지스트리·소켓·
 * 화면 자산. `resolveFactories()`가 나머지를 채우고, 이 파일은 그 위에 두 키만 얹는다.
 *
 * **`probeDocker` 주입의 기계 방어가 이 디렉터리를 안 덮는다.** 예산 게이트의 교차 검사는
 * `packages/cli/test/`의 최상위 `.test.ts`만 순회하고 `startCli` 임포트를 신호로 쓰는데,
 * 하네스는 자리도 다르고 `runServe`를 부른다. 즉 결정 3이 대가로 든 두 모집단(인용·예산)
 * 밖에 셋째가 있다 — 그래서 옆 `harness.e2e.test.ts`의 모의 범위 단정이 그 자리를 사람
 * 대신 잰다. 그 단정이 이 파일의 게이트다.
 *
 * **`~/.neo-agent/`를 건드리지 않는다.** 홈과 워크스페이스는 `mkdtemp`로 만들고 `stop()`이
 * 지운다. 실사용 DB에 닿는 경로가 이 파일에 없다는 것이 그 계약의 형태다.
 *
 * 이 파일은 테스트가 아니다(`*.e2e.test.ts`가 아니므로 e2e 러너가 수집하지 않는다).
 */

import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import {
  API_KEY_ENV,
  type CliDeps,
  type OutputSink,
  resolveFactories,
  runServe,
  type ServeOptions,
  type WiringFactories,
} from "@neo-agent/cli";

// ─────────────────────────────────────────────────────────────────────────────
// 타입 — 루트에서 닿는 패키지가 `@neo-agent/cli` 하나뿐이므로 전부 그 표면에서 뽑는다.
//
// 하네스가 사는 자리는 워크스페이스 패키지가 아니라 루트의 별도 디렉터리다(결정 3).
// 그래서 `@neo-agent/core`·`@neo-agent/serve`를 이름으로 임포트할 수단이 없고, 있어도
// 넣지 않는다 — 루트에 워크스페이스 의존을 더하는 것은 공급망 계약의 매니페스트 대조를
// 다시 여는 자리다(결정 8). **아래 유도가 그 제약의 이행이자, 두 키가 실제로
// `WiringFactories`의 멤버라는 컴파일 시점 증명이다.**
// ─────────────────────────────────────────────────────────────────────────────

/** 모델 클라이언트 — 배선이 여는 팩토리의 반환 타입이 그 정의다 */
type ModelClient = ReturnType<WiringFactories["createModelClient"]>;

/** 모델이 내는 스트림 이벤트 하나 */
type ModelStreamEvent =
  ReturnType<ModelClient["stream"]> extends AsyncIterable<infer Event> ? Event : never;

/** `onListening`이 받는 실주소 */
type ServeAddress = Parameters<NonNullable<ServeOptions["onListening"]>>[0];

/** 신호 리스너를 다는 자리 */
type SignalHost = NonNullable<ServeOptions["signals"]>;

/** 종료를 시작시키는 신호 이름 */
type ShutdownSignal = Parameters<SignalHost["on"]>[0];

// ─────────────────────────────────────────────────────────────────────────────
// 모의 범위 — 이 배열이 결정 4의 실물이다.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 하네스가 `deps.factories`에 채우는 키의 **전부**.
 *
 * `satisfies`가 두 이름이 실제 팩토리 멤버임을 컴파일 시점에 잡고(오타는 여기서 붉는다),
 * 옆 테스트의 모의 범위 단정이 **실행 시점에** 이 배열과 실제로 채워진 키 집합의 상등을
 * 잰다. 둘이 함께 있어야 「A의 모의 집합은 이 배열과 같다」가 서술이 아니라 검사가 된다 —
 * B·C의 같은 역할(선언↔실물)은 아래 H-7이 진다.
 */
export const MOCKED_FACTORY_KEYS = [
  "createModelClient",
  "probeDocker",
] as const satisfies readonly (keyof WiringFactories)[];

type MockedFactoryKey = (typeof MOCKED_FACTORY_KEYS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// 호스트 대역·구성 관측 — B·C의 실물(§7.1 결정 4 A·B·C 표 그대로).
//
// 이 셋은 모의가 아니다 — 실 프로세스 엔트리(`packages/cli/src/main.ts`)가 밖에서 채우는
// 자리를 이 하네스가 대신 채우는 것뿐이다(B). C는 무엇도 대체하지 않는다. 아래 H-7이
// `Object.keys(harness.deps)`·`harness.serveOptionKeys`와 이 배열들의 상등을 잰다.
// ─────────────────────────────────────────────────────────────────────────────

/** `CliDeps`의 B열(호스트 대역) 여섯 키. */
export const CLIDEPS_HOST_KEYS = [
  "argv",
  "env",
  "cwd",
  "home",
  "io",
  "version",
] as const satisfies readonly (keyof CliDeps)[];

/** `ServeOptions`의 B열(호스트 대역) 셋. */
export const SERVE_OPTIONS_HOST_KEYS = [
  "signals",
  "setExitCode",
  "out",
] as const satisfies readonly (keyof ServeOptions)[];

/** `ServeOptions`의 C열(구성·관측) 둘. `port`는 결정 5의 값, `onListening`은 그 되받이다. */
export const SERVE_OPTIONS_CONFIG_KEYS = [
  "port",
  "onListening",
] as const satisfies readonly (keyof ServeOptions)[];

// ─────────────────────────────────────────────────────────────────────────────
// 결정적 모의 모델 — 브라우저가 볼 문면의 출처
// ─────────────────────────────────────────────────────────────────────────────

/** 설정과 모델 클라이언트가 함께 드는 식별자. 실물 모델 id와 헷갈리지 않게 접두를 둔다 */
export const HARNESS_MODEL_ID = "e2e-harness/local";

/** 첫 턴이 내는 텍스트. 브라우저 쪽 3단계(SSE 렌더링)가 화면에서 되찾을 문면이다 */
export const HARNESS_TEXT_REPLY = "하네스가 낸 결정적 응답입니다.";

/** 승인을 트립시키는 도구. 워크스페이스 안 파일 쓰기는 자동 허용 대상이 아니다 */
export const HARNESS_APPROVAL_TOOL = "write_file";

/** 그 도구가 쓰는 워크스페이스 상대 경로 */
export const HARNESS_APPROVAL_TARGET = "harness-approved.txt";

/** 그 도구가 쓰는 내용 */
export const HARNESS_APPROVAL_BODY = "승인 왕복이 실제로 돌았다.\n";

/** 도구 결과를 받은 뒤 런을 닫는 텍스트. 재개의 관측 가능한 형태다 */
export const HARNESS_CLOSING_REPLY = "승인된 작업을 마쳤습니다.";

/** 승인 축이 쓰는 도구 호출 id. 이벤트 프레임에서 되찾는 값이다 */
export const HARNESS_TOOL_CALL_ID = "e2e-harness-call-1";

const USAGE = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 };

/**
 * 결정적 모의 모델 — 호출 순서 하나로만 갈린다.
 *
 * 1회차: 텍스트 한 턴. 2회차: 승인을 트립시키는 도구 호출 한 턴. 3회차 이후: 도구 결과를
 * 받아 런을 닫는 텍스트.
 *
 * **3회차가 있어야 승인 축이 선다.** 승인 뒤 런이 실제로 재개됐는지는 도구가 돌았다는
 * 사실만으로 부족하고, 모델이 한 번 더 불렸다는 것이 그 재개의 관측 가능한 형태다.
 *
 * 요청과 취소 신호를 받지 않는 것이 의도다 — 출력이 입력에 안 걸리는 것이 결정성의 형태다.
 */
export function createHarnessModel(): ModelClient {
  let call = 0;
  return {
    modelId: HARNESS_MODEL_ID,
    async *stream(): AsyncIterable<ModelStreamEvent> {
      call += 1;
      if (call === 2) {
        const args = { path: HARNESS_APPROVAL_TARGET, content: HARNESS_APPROVAL_BODY };
        yield {
          type: "toolcall",
          toolCallId: HARNESS_TOOL_CALL_ID,
          toolName: HARNESS_APPROVAL_TOOL,
          args,
        };
        yield {
          type: "done",
          message: {
            role: "assistant",
            content: [
              {
                type: "toolCall",
                toolCallId: HARNESS_TOOL_CALL_ID,
                toolName: HARNESS_APPROVAL_TOOL,
                args,
              },
            ],
            stopReason: "tool_use",
            usage: USAGE,
            timestamp: Date.now(),
          },
        };
        return;
      }
      const text = call === 1 ? HARNESS_TEXT_REPLY : HARNESS_CLOSING_REPLY;
      yield { type: "text_delta", text };
      yield {
        type: "done",
        message: {
          role: "assistant",
          content: [{ type: "text", text }],
          stopReason: "end_turn",
          usage: USAGE,
          timestamp: Date.now(),
        },
      };
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 하네스
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 신호 호스트의 실물 이행(B) — 실 프로세스 엔트리가 밖에서 받아 채우는 자리를 이 검사
 * 안에서 대신 채운다. **실신호를 쓰지 않는다** — `process.kill`로 자기 프로세스에 보내면
 * vitest 워커가 함께 죽는다. `packages/serve`가 이 자리를 옵션으로 연 이유가 그것이다.
 */
function fakeSignals(): SignalHost & { send(signal: ShutdownSignal): void; count(): number } {
  const listeners = new Map<ShutdownSignal, Set<() => void>>();
  return {
    on(signal, listener) {
      const bucket = listeners.get(signal) ?? new Set<() => void>();
      bucket.add(listener);
      listeners.set(signal, bucket);
      return undefined;
    },
    off(signal, listener) {
      listeners.get(signal)?.delete(listener);
      return undefined;
    },
    send(signal) {
      for (const listener of [...(listeners.get(signal) ?? [])]) listener();
    },
    count: () => [...listeners.values()].reduce((total, bucket) => total + bucket.size, 0),
  };
}

/** 서버 로그로 향하는 고지를 모아 두는 싱크. 진단이 사라지지 않게 전부 붙든다 */
function captureSink(): OutputSink & { text(): string } {
  const written: string[] = [];
  return {
    write(text: string): void {
      written.push(text);
    },
    text: () => written.join(""),
  };
}

export interface HarnessOptions {
  /**
   * 모델 클라이언트를 갈아 끼운다. 생략하면 위 결정적 모의다.
   *
   * **이 자리가 `factories`가 아닌 것이 의도다** — 팩토리 객체를 통째로 받으면 호출자가
   * `probeDocker` 주입을 조용히 덮어쓸 수 있고, 그러면 실제 `docker version`이 스폰되면서
   * 모의 범위 단정도 함께 무너진다.
   */
  readonly model?: ModelClient;
}

export interface Harness {
  /** 브라우저가 열 주소. 커널이 고른 실포트가 들어 있다 */
  readonly url: string;
  readonly port: number;
  /** 임시 뿌리. `stop()`이 지운다 */
  readonly root: string;
  readonly home: string;
  readonly workspace: string;
  /**
   * 조립에 넘어간 의존 묶음 그대로. **모의 범위 단정의 관측점이다** — 여기의
   * `factories` 키 집합이 곧 이 하네스가 대체한 것의 전부다.
   */
  readonly deps: CliDeps;
  /**
   * `runServe`에 넘긴 옵션 상수의 `Object.keys()` 그대로(B·C 합). **B·C 모의 범위
   * 단정의 관측점이다** — `CLIDEPS_HOST_KEYS`(B)·`SERVE_OPTIONS_HOST_KEYS`(B)·
   * `SERVE_OPTIONS_CONFIG_KEYS`(C)와의 상등을 옆 테스트(H-7)가 잰다.
   */
  readonly serveOptionKeys: readonly string[];
  /** 서버 로그로 나간 고지 전부. 실패 진단이 여기에 있다 */
  log(): string;
  /** 종료 시퀀스를 신호로 구동하고 임시 뿌리를 지운다. 두 번 불러도 안전하다 */
  stop(): Promise<number>;
}

/**
 * 조립 실물을 인프로세스로 띄운다.
 *
 * **포트는 0이다**(결정 5) — 커널이 고른 주소를 `onListening`으로 잡는다. 고정 포트를 쓰면
 * 스위트 둘이 겹치는 순간 `EADDRINUSE`로 죽고, 그 실패는 하네스 결함처럼 보이지 않는다.
 */
export async function startHarness(options: HarnessOptions = {}): Promise<Harness> {
  const root = mkdtempSync(join(tmpdir(), "neo-e2e-harness-"));
  const home = join(root, "home");
  const workspace = join(root, "ws");
  const stateDir = join(home, ".neo-agent");
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  // 조립이 이 디렉터리의 권한을 검사하고 느슨하면 경고를 낸다. `mkdir`의 모드는 umask에
  // 깎이므로(개발 VPS의 기본 umask에서 0775가 된다) 만든 뒤 명시로 조인다 — 안 조이면
  // 모든 기동의 로그 첫 줄이 권한 경고이고, 그러면 진짜 경고가 그 안에 묻힌다.
  chmodSync(stateDir, 0o700);
  writeFileSync(join(stateDir, "config.json"), JSON.stringify({ model: HARNESS_MODEL_ID }));
  // 첫 기동 관문을 지난 홈으로 만든다 — 판정 재료가 `sessions.db`의 부재 하나뿐이라 빈
  // 파일 하나면 된다(0바이트는 SQLite가 유효한 빈 DB로 취급한다). 모드를 명시하는 것은
  // umask가 권한을 깎아 경고가 새로 나가는 것을 막기 위해서다.
  const dbPath = join(stateDir, "sessions.db");
  writeFileSync(dbPath, "");
  chmodSync(dbPath, 0o600);

  const input = new PassThrough();
  const output = new PassThrough() as PassThrough & { columns?: number };
  output.columns = 80;
  output.resume();

  const model = options.model ?? createHarnessModel();

  // **이 객체 리터럴이 모의의 전부다.** 키를 더하는 순간 옆 테스트의 상등 단정이 붉는다.
  const factories: Pick<WiringFactories, MockedFactoryKey> = {
    createModelClient: () => model,
    // Docker에 닿지 않는 갈래. 불가용은 에러가 아니라 셸 도구를 안 싣는 정상 분기이고,
    // 이 하네스가 재는 한 턴은 셸을 쓰지 않는다.
    probeDocker: async () => ({
      available: false,
      reason: "e2e 하네스는 Docker 판정을 주입한다 — 실제 docker를 스폰하지 않는다",
    }),
  };

  const sink = captureSink();
  const signals = fakeSignals();
  const deps: CliDeps = {
    argv: ["serve"],
    env: { [API_KEY_ENV]: "e2e-harness-key" },
    cwd: workspace,
    home,
    io: { input, output },
    version: "0.0.0-e2e",
    factories,
  };

  let address: ServeAddress | undefined;
  let settled = false;
  // **B·C의 실물이다.** `satisfies ServeOptions`가 리터럴의 freshness를 지켜 excess
  // property check를 계속 세운다(결정 4 §157 — "B의 아홉은 전부 프로세스가 주는 값의
  // 타입이 막는다"). `port: 0`은 리터럴 그대로 남긴다 — 변수로 옮기면
  // `packages/cli/test/webui-e2e-wiring.qa.test.ts`의 F-1·F-2가 이 소스를 문자열로 읽어
  // `/\bport:\s*0\b/`로 찾는 것이 조용히 안 잡히거나 되레 붉는다.
  const serveOptions = {
    port: 0,
    signals,
    setExitCode: () => undefined,
    out: sink,
    onListening: (bound) => {
      address = bound;
    },
  } satisfies ServeOptions;
  const exit = runServe(deps, serveOptions);
  void exit.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );

  // 기동이 실패하면 `exit`가 먼저 끝난다 — 그 갈래를 붙들지 않으면 진단이 사라지고
  // 증상은 훅 타임아웃뿐이다.
  const deadline = Date.now() + 30_000;
  while (address === undefined && !settled && Date.now() < deadline) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  if (address === undefined) {
    const code = settled ? await exit : undefined;
    rmSync(root, { recursive: true, force: true });
    throw new Error(
      settled
        ? `하네스 기동이 바인드 전에 끝났다 (코드 ${String(code)}) — 로그: ${sink.text()}`
        : `하네스가 30초 안에 바인드되지 않았다 — 로그: ${sink.text()}`,
    );
  }

  const port = address.port;
  let stopped: Promise<number> | undefined;

  return {
    url: `http://127.0.0.1:${String(port)}`,
    port,
    root,
    home,
    workspace,
    deps,
    serveOptionKeys: Object.keys(serveOptions),
    log: () => sink.text(),
    stop: () => {
      stopped ??= (async () => {
        signals.send("SIGINT" as ShutdownSignal);
        try {
          return await exit;
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      })();
      return stopped;
    },
  };
}

/**
 * 실물 기본 팩토리의 키 전부. 모의 범위 단정이 「나머지는 실물이다」 쪽을 재는 재료다.
 *
 * 상등만으로는 부족하다 — 두 키가 실제 팩토리 표면의 부분집합이어야 그 상등이 뜻을 갖고,
 * 표면이 자라면(팩토리가 늘면) 이 목록도 함께 자라 그 사실이 단정에 보인다.
 */
export function realFactoryKeys(): readonly string[] {
  return Object.keys(resolveFactories());
}
