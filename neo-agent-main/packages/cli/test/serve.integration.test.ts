/**
 * `neo-agent serve` 통합 — 실물 소켓 위에서 기동 → 스트림 → 프롬프트 → 이벤트 → 종료.
 *
 * 정본은 `docs/WEB-UI.md` §3·§3.1·§3.2·§8과 `docs/CLI-INTERFACE.md` §1·§2·§2.1이다.
 *
 * **자리가 `packages/cli/test/`인 것에 근거가 둘이다.** ① `packages/serve/test/`에 두려면
 * `serve`가 `cli`를 devDep으로 얻어야 하는데 그 패키지의 경계 테스트가 형제 devDep 엣지를
 * 정확한 수로 상등 단언한다 ② 이 디렉터리는 예산 게이트의 `probeDocker` 주입 교차 검사가
 * 훑는 모집단이라, 주입을 잊으면 `pnpm check`가 붉어진다(잊어도 테스트는 통과하고 느려질
 * 뿐이라 사람 눈에는 안 보인다).
 *
 * **여기서 재는 것은 배선이지 부품이 아니다.** 프레임 스키마·`seq` 수열·배압·종료 8단계의
 * 순서는 `packages/serve/test/`의 계약 테스트가 각각 이미 잰다. 이 파일이 재는 것은 그
 * 부품들이 **조립에 실제로 물렸는가**이고, 그래서 단정의 대상은 전부 조립이 소유한 순서와
 * 이음매다.
 *
 * **모의로 두는 것은 셋뿐이다** — 모델(네트워크로 나갈 수 없다), 터미널 스트림, 신호 호스트.
 * 저장소·게이트·경계·도구·서버·스트림·승인 레지스트리는 전부 실물이고, 소켓도 실물이다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. **이 파일은 정본
 * 문면을 인용부호로 감싸지 않는다** — 전부 서술로 옮겼다. 문서를 줄번호로 가리키는 자리는
 * 이 규약의 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호로 한다.
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { get as httpGet, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import type {
  AgentEvent,
  AgentEventListener,
  ModelClient,
  ModelStreamEvent,
} from "@neo-agent/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { API_KEY_ENV } from "../src/credentials.ts";
import { runServe, type ServeOptions } from "../src/serve.ts";
import type { OutputSink } from "../src/terminal.ts";
import {
  type CliDeps,
  EXIT_STARTUP_FAILED,
  resolveFactories,
  runCli,
  startCli,
} from "../src/wiring.ts";
import { dockerAvailable } from "./probe-docker.ts";

/**
 * `startCli`를 이름으로 들이는 이유는 예산 게이트의 교차 검사 때문이다.
 *
 * 그 검사는 `startCli`를 부르는 cli 테스트가 `probeDocker`를 주입했는지를 보는데, 판정
 * 재료가 임포트한 이름이다. 이 파일은 `runServe`를 지나 그 함수에 닿으므로 이름을 안 들면
 * 검사의 모집단 밖으로 빠지고, 그러면 주입을 빠뜨린 날 실제 `docker version`이 스폰되면서
 * 게이트는 그린이다. **이 한 줄이 그 구멍을 막는다** — 아래 `it`이 같은 사실을 단정으로도
 * 든다.
 */
const ASSEMBLY_ENTRY = startCli;

const UNKNOWN_MODEL = "serve-integration/local";

/** 승인 왕복 축이 쓰는 도구 호출 id. 모의 모델이 내고 이벤트 프레임에서 되찾는 값이다 */
const APPROVAL_TOOL_CALL_ID = "serve-integration-call-1";

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

async function waitUntil(
  predicate: () => boolean,
  describeFailure: () => string,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await tick();
  }
  throw new Error(describeFailure());
}

/** 한 턴을 그대로 되돌려주는 최소 모델. 네트워크로 나가지 않는다 */
function localModel(): ModelClient {
  let turn = 0;
  return {
    modelId: UNKNOWN_MODEL,
    async *stream(): AsyncIterable<ModelStreamEvent> {
      turn += 1;
      const text = `turn-${String(turn)}`;
      yield { type: "text_delta", text };
      yield {
        type: "done",
        message: {
          role: "assistant",
          content: [{ type: "text", text }],
          stopReason: "end_turn",
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
          timestamp: Date.now(),
        },
      };
    },
  };
}

/**
 * 게이트를 트립시키는 최소 모델. 첫 턴에 워크스페이스 안 파일 쓰기를 호출하고, 그 결과를
 * 받은 둘째 턴에 텍스트로 닫는다. 네트워크로 나가지 않는 것은 위와 같다.
 *
 * **`write_file`인 것에 근거가 있다.** 게이트의 판정 순서에서 워크스페이스 안 파일 쓰기는
 * 자동 허용 대상이 아니고(자동 허용은 안쪽 읽기와 메모리 쓰기 둘뿐이다) 하드라인·deny
 * 규칙에도 안 걸리므로, 기본 모드에서 승인 프롬프트 계층까지 내려온다 — 즉 이 도구 하나가
 * 사람 승인을 요구하는 가장 짧은 경로다.
 *
 * **둘째 턴이 있어야 이 축이 선다.** 승인 뒤 런이 실제로 재개됐는지는 도구가 돌았다는
 * 사실만으로는 부족하고, 모델이 한 번 더 불렸다는 것이 그 재개의 관측 가능한 형태다.
 */
function approvalModel(path: string, content: string): ModelClient {
  let turn = 0;
  return {
    modelId: UNKNOWN_MODEL,
    async *stream(): AsyncIterable<ModelStreamEvent> {
      turn += 1;
      if (turn === 1) {
        yield {
          type: "toolcall",
          toolCallId: APPROVAL_TOOL_CALL_ID,
          toolName: "write_file",
          args: { path, content },
        };
        yield {
          type: "done",
          message: {
            role: "assistant",
            content: [
              {
                type: "toolCall",
                toolCallId: APPROVAL_TOOL_CALL_ID,
                toolName: "write_file",
                args: { path, content },
              },
            ],
            stopReason: "tool_use",
            usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
            timestamp: Date.now(),
          },
        };
        return;
      }
      const text = `turn-${String(turn)}`;
      yield { type: "text_delta", text };
      yield {
        type: "done",
        message: {
          role: "assistant",
          content: [{ type: "text", text }],
          stopReason: "end_turn",
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
          timestamp: Date.now(),
        },
      };
    },
  };
}

/**
 * 신호 호스트의 모의. **실신호를 쓰지 않는다** — `process.kill`로 자기 프로세스에 보내면
 * vitest 워커가 함께 죽는다. `packages/serve`가 이 자리를 포트로 연 이유가 그것이다.
 */
interface FakeSignals {
  on(signal: string, listener: () => void): unknown;
  off(signal: string, listener: () => void): unknown;
  send(signal: string): void;
  count(): number;
}

function fakeSignals(): FakeSignals {
  const listeners = new Map<string, Set<() => void>>();
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

/** 조립·서버가 내는 고지를 받아 두는 최소 싱크. 터미널을 모른다 */
function captureSink(): OutputSink & { text(): string } {
  const written: string[] = [];
  return {
    write(text: string): void {
      written.push(text);
    },
    text: () => written.join(""),
  };
}

let root: string;
let home: string;
let workspace: string;
let disposers: (() => void)[] = [];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "neo-serve-int-"));
  home = join(root, "home");
  workspace = join(root, "ws");
  mkdirSync(join(home, ".neo-agent"), { recursive: true });
  mkdirSync(workspace, { recursive: true });
  writeFileSync(join(home, ".neo-agent", "config.json"), JSON.stringify({ model: UNKNOWN_MODEL }));
  disposers = [];
});

afterEach(() => {
  for (const dispose of disposers.reverse()) dispose();
  rmSync(root, { recursive: true, force: true });
});

/**
 * 3c의 존재 검사를 지난 홈으로 만든다 — 판정 재료는 `sessions.db`의 부재 하나뿐이라
 * 빈 파일 하나면 된다(0바이트는 SQLite가 유효한 빈 DB로 취급한다). 모드를 명시하는 것은
 * umask가 mode를 깎아 권한 경고가 새로 나가는 것을 막기 위해서다.
 */
function seedReturningHome(): void {
  const path = join(home, ".neo-agent", "sessions.db");
  writeFileSync(path, "");
  chmodSync(path, 0o600);
}

interface Rig {
  deps: CliDeps;
  input: PassThrough & { on: PassThrough["on"] };
  /** `deps.io.input`에 붙은 리스너 이름들 — `repl.start()`의 유일한 관측 가능한 행위다 */
  inputListeners: string[];
  marks: string[];
  sink: OutputSink & { text(): string };
}

interface RigOptions {
  deps?: Partial<CliDeps>;
  /**
   * 모델 클라이언트를 갈아 끼운다. **`deps.factories`로 주지 않는 것이 의도다** — 아래
   * `createRig`가 `factories`를 채운 **뒤** `...options.deps`를 펼치므로, 그 자리로 넘긴
   * 팩토리는 `probeDocker`·`openStore` 주입을 통째로 덮어쓴다. 덮어쓰면 예산 게이트의
   * 교차 검사가 요구한 주입이 사라져 실제 `docker version`이 스폰된다(그리고 그 증상은
   * 붉은 단정이 아니라 느려짐이다).
   */
  model?: ModelClient;
}

/**
 * 전부 실물에 위임하는 관측 래퍼 — 대체가 아니라 감싸기다. 유일한 예외가 모델 클라이언트다.
 */
function createRig(options: RigOptions = {}): Rig {
  const input = new PassThrough();
  const output = new PassThrough() as PassThrough & { columns?: number };
  output.columns = 80;
  output.resume();

  // `repl.start()`의 스파이. 그 함수가 밖에서 관측되는 유일한 방식이 입력 스트림에
  // readline이 붙는 것이고, 그것은 리스너 등록으로 나타난다. `Repl` 객체는 조립 안에서
  // 만들어져 밖으로 나오지 않으므로 메서드에 직접 스파이를 걸 자리가 없다.
  const inputListeners: string[] = [];
  const originalOn = input.on.bind(input);
  input.on = ((event: string, listener: (...args: unknown[]) => void) => {
    inputListeners.push(event);
    return originalOn(event, listener);
  }) as typeof input.on;

  const marks: string[] = [];
  const defaults = resolveFactories();
  const model = options.model ?? localModel();

  const deps: CliDeps = {
    argv: ["serve"],
    env: { [API_KEY_ENV]: "serve-integration-key" },
    cwd: workspace,
    home,
    io: { input, output },
    version: "0.0.0-test",
    factories: {
      openStore: (storeOptions) => {
        const store = defaults.openStore(storeOptions);
        return {
          ...store,
          attach: (agent, sessionId) => {
            marks.push("store:attach");
            return store.attach(agent, sessionId);
          },
        };
      },
      // 예산 게이트의 교차 검사가 요구하는 주입. 없으면 시작 시퀀스 5b가 실제 docker를
      // 스폰해 이 스위트의 결과가 테스트 머신에 좌우된다.
      probeDocker: dockerAvailable(),
      createModelClient: () => model,
      ...(options.deps?.factories ?? {}),
    },
    ...options.deps,
  };

  return { deps, input: input as Rig["input"], inputListeners, marks, sink: captureSink() };
}

/** 열려 있는 SSE 스트림 하나. 도착한 프레임을 순서대로 모은다 */
interface StreamProbe {
  frames: Record<string, unknown>[];
  status: number | undefined;
  close(): void;
}

function openStream(port: number, version = "1"): StreamProbe {
  const frames: Record<string, unknown>[] = [];
  const probe: StreamProbe = {
    frames,
    status: undefined,
    close: () => undefined,
  };
  let buffer = "";
  const request = httpGet({ host: "127.0.0.1", port, path: `/stream?v=${version}` }, (response) => {
    probe.status = response.statusCode;
    response.setEncoding("utf8");
    response.on("data", (chunk: string) => {
      buffer += chunk;
      // 형식은 `id: <seq>\ndata: <json>\n\n`이다. `data:`가 한 줄인 것은 인코더의 성질이다.
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        for (const line of block.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          frames.push(JSON.parse(line.slice("data: ".length)) as Record<string, unknown>);
        }
        boundary = buffer.indexOf("\n\n");
      }
    });
    response.on("error", () => undefined);
  });
  request.on("error", () => undefined);
  probe.close = () => {
    request.destroy();
  };
  return probe;
}

/** 도착한 프레임 중 코어 이벤트를 실은 것들의 속. 순서는 도착 순서 그대로다 */
function streamEvents(probe: StreamProbe): Record<string, unknown>[] {
  return probe.frames
    .filter((frame) => frame.type === "event")
    .map((frame) => frame.event as Record<string, unknown>);
}

/** 메서드 POST 하나. 응답 프레임을 돌려준다 */
function postMethod(port: number, frame: unknown): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(frame);
    const request = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path: "/rpc",
        method: "POST",
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) },
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          text += chunk;
        });
        response.on("end", () => {
          try {
            resolve(JSON.parse(text) as Record<string, unknown>);
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      },
    );
    request.on("error", reject);
    request.end(body);
  });
}

interface Running {
  exit: Promise<number>;
  port: number;
  signals: FakeSignals;
}

/** 서버를 띄우고 실주소를 잡는다. 종료는 호출자가 신호로 낸다 */
async function start(rig: Rig, extra: ServeOptions = {}): Promise<Running> {
  const signals = fakeSignals();
  let address: { port: number } | undefined;
  const exit = runServe(rig.deps, {
    port: 0,
    signals,
    setExitCode: () => undefined,
    out: rig.sink,
    ...extra,
    // 주소를 잡는 것은 이 하네스의 몫이므로 스프레드 **뒤**다 — 앞에 두면 호출자가
    // 자기 `onListening`을 줄 때 주소가 조용히 안 잡히고, 그 증상은 5초 타임아웃이다.
    onListening: (bound) => {
      address = bound;
      extra.onListening?.(bound);
    },
  });
  // 기동이 실패하면 `exit`가 먼저 끝난다 — 그 갈래를 여기서 붙들어 두면 진단이 사라진다.
  let settled = false;
  void exit.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await waitUntil(
    () => address !== undefined || settled,
    () => `서버가 바인드되지 않았다 — 고지: ${rig.sink.text()}`,
  );
  if (address === undefined) {
    throw new Error(`기동이 바인드 전에 끝났다 (코드 ${String(await exit)}) — ${rig.sink.text()}`);
  }
  const running: Running = { exit, port: address.port, signals };
  disposers.push(() => {
    signals.send("SIGINT");
  });
  return running;
}

describe("WEB-UI §3 — serve 기동·왕복·종료", () => {
  it("S-1 기동 → 스트림 개설 → 프롬프트 POST → 이벤트 수신 → 종료", async () => {
    seedReturningHome();
    const rig = createRig();
    const running = await start(rig);

    const stream = openStream(running.port);
    await waitUntil(
      () => stream.frames.length > 0,
      () => `핸드셰이크가 오지 않았다 (상태 ${String(stream.status)})`,
    );

    // 첫 프레임은 반드시 핸드셰이크이고 `seq`가 1이다(§6·§6.1).
    const handshake = stream.frames[0];
    expect(handshake?.type).toBe("state");
    expect(handshake?.kind).toBe("handshake");
    expect(handshake?.seq).toBe(1);

    const accepted = await postMethod(running.port, {
      type: "req",
      id: "r1",
      method: "run.prompt",
      params: { text: "안녕" },
    });
    // 이 응답이 뜻하는 것은 런이 끝났다가 아니라 받았다다(§8이 런을 프로세스에 귀속시켰다).
    expect(accepted).toMatchObject({ type: "res", id: "r1", ok: true });

    await waitUntil(
      () => stream.frames.some((frame) => frame.type === "event"),
      () =>
        `에이전트 이벤트가 스트림에 오지 않았다 — 받은 프레임 ${String(stream.frames.length)}건`,
    );

    // 이벤트가 코어 구독을 지나 브라우저 쪽으로 온 것이므로 시퀀스가 핸드셰이크 뒤에 이어진다.
    const events = stream.frames.filter((frame) => frame.type === "event");
    expect(events.length).toBeGreaterThan(0);
    expect(Number(events[0]?.seq)).toBeGreaterThan(1);

    stream.close();
    running.signals.send("SIGINT");
    // 신호로 시작된 종료가 순서대로 끝나면 코드는 0이다(§3.2의 종료 코드 표).
    await expect(running.exit).resolves.toBe(0);
  }, 30_000);

  it("S-2 저장소 구독이 서버 바인드보다 먼저다", async () => {
    seedReturningHome();
    const rig = createRig();
    const running = await start(rig, {
      onListening: () => {
        rig.marks.push("server:listen");
      },
    });

    // §3이 기동 시퀀스에 더한 둘의 순서. 뒤집히면 클라이언트가 붙어 이벤트를 받기 시작한
    // 뒤에도 저장소가 구독 전인 창이 생기고, 그 창의 이벤트는 영속되지 않는다.
    const attachAt = rig.marks.indexOf("store:attach");
    const listenAt = rig.marks.indexOf("server:listen");
    expect(attachAt, `관측한 순서: ${JSON.stringify(rig.marks)}`).toBeGreaterThanOrEqual(0);
    expect(listenAt, `관측한 순서: ${JSON.stringify(rig.marks)}`).toBeGreaterThan(attachAt);

    running.signals.send("SIGINT");
    await running.exit;
  }, 30_000);

  it("S-3 웹 리스너가 던져도 런이 계속된다", async () => {
    seedReturningHome();
    const rig = createRig();
    const seen: string[] = [];
    const thrower: AgentEventListener = (event: AgentEvent) => {
      seen.push(event.type);
      throw new Error("serve-integration-boom");
    };
    const running = await start(rig, { subscribers: [thrower] });

    const accepted = await postMethod(running.port, {
      type: "req",
      id: "r1",
      method: "run.prompt",
      params: { text: "안녕" },
    });
    expect(accepted).toMatchObject({ ok: true });

    await waitUntil(
      () => seen.includes("agent_end"),
      () => `런의 이벤트 시퀀스가 닫히지 않았다 — 본 이벤트: ${JSON.stringify(seen)}`,
    );
    expect(seen[0]).toBe("agent_start");

    // **시퀀스가 닫혔다는 것만으로는 이 축이 안 선다.** 코어는 런이 실패해도 종료 이벤트를
    // 내므로(불변 조건 2의 완결된 시퀀스), 예외가 전파돼 런이 실패한 경우에도 위 단정은
    // 그대로 그린이다 — 변이 실측으로 확인했다. 갈리는 자리는 **런이 성공으로 끝났는가**이고,
    // 그 관측점은 배선이 코어의 런 프로미스에 붙여 둔 거절 싱크 하나다.
    await waitUntil(
      () => rig.sink.text().includes("웹 이벤트 전달"),
      () => `삼킨 예외의 사유가 서버 로그에 안 나갔다 — 로그: ${rig.sink.text()}`,
    );
    expect(rig.sink.text()).toContain("serve-integration-boom");
    // 전파됐다면 코어가 런을 끝내고 프롬프트가 거절돼 이 문면이 함께 나간다.
    expect(rig.sink.text(), "런이 구독자 예외로 실패했다").not.toContain(
      "neo-agent serve: 런 실패",
    );

    running.signals.send("SIGINT");
    await expect(running.exit).resolves.toBe(0);
  }, 30_000);

  it("S-4 sessions.db가 없으면 비영으로 끝나고 열린 포트가 0이다", async () => {
    // 홈은 있고 DB만 없다 — 3c의 판정 재료가 DB의 부재 하나뿐이라는 것의 실물이다.
    const rig = createRig();
    const code = await runServe(rig.deps, {
      port: 0,
      signals: fakeSignals(),
      setExitCode: () => undefined,
      out: rig.sink,
      onListening: () => {
        rig.marks.push("server:listen");
      },
    });

    expect(code).toBe(EXIT_STARTUP_FAILED);
    expect(code).not.toBe(0);
    // 바인드가 시퀀스의 맨 뒤이므로 이 거부를 브라우저에 보이는 경로가 구조적으로 없다.
    expect(rig.marks).not.toContain("server:listen");

    // 원인과 다음 행동을 담은 에러로 종료한다(§2 말미의 실패 갈래). 다음 행동의 실물은
    // §2.1이 문면으로 든 것 그대로다.
    const text = rig.sink.text();
    expect(text).toContain("sessions.db");
    expect(text).toContain("먼저 `neo-agent`를 한 번 실행한다");

    // 4가 홈을 만드는 유일한 단계이므로, 거부가 4보다 앞이면 DB가 생기지 않는다.
    expect(existsSync(join(home, ".neo-agent", "sessions.db"))).toBe(false);
  }, 30_000);

  it("S-5 워크스페이스가 설치 트리와 겹치면 그 고지가 serve에서도 도달한다", async () => {
    seedReturningHome();
    const rig = createRig({ deps: { installRoot: workspace } });
    const running = await start(rig);

    // `DISTRIBUTION.md` §6의 고지는 경계가 아니라 고지다 — 기동을 막지 않고 싱크로 나간다.
    // 그 싱크가 serve에서는 서버 로그이므로, 이 단정이 도달 경로가 바뀐 자리를 잰다.
    expect(rig.sink.text()).toContain("설치 트리");

    running.signals.send("SIGINT");
    await running.exit;
  }, 30_000);

  it("S-6 REPL에 진입하지 않는다 — 입력에 아무것도 붙지 않는다", async () => {
    seedReturningHome();
    const rig = createRig();
    const running = await start(rig);

    // `repl.start()`가 하는 일은 readline을 입력에 붙이는 것이다. 붙지 않았다는 것이
    // 그 함수가 안 불렸다는 것의 관측 가능한 형태다.
    expect(rig.inputListeners).toEqual([]);
    // 시작 화면은 `run()`의 첫 줄이다. 그것이 없다는 것이 같은 사실의 두 번째 증거다 —
    // 슬래시 명령 안내는 배너에만 있고 이 호스트에는 그 명령 자체가 없다.
    expect(rig.sink.text()).not.toContain("/help");

    running.signals.send("SIGINT");
    await running.exit;
  }, 30_000);

  it("S-7 종료 뒤에 신호 리스너가 남지 않는다", async () => {
    seedReturningHome();
    const rig = createRig();
    const running = await start(rig);
    expect(running.signals.count()).toBeGreaterThan(0);

    running.signals.send("SIGINT");
    await running.exit;

    // 걷지 않으면 신호 리스너가 이벤트 루프를 붙들어 종료 뒤에도 프로세스가 안 빠져나간다.
    expect(running.signals.count()).toBe(0);
  }, 30_000);

  it("S-8 runCli의 serve 갈래가 §3.1 거부까지 닿고 REPL을 열지 않는다", async () => {
    // DB가 없는 홈으로 `runCli(["serve"])`를 부른다. 조립이 3c에서 던지고 그 문면이
    // 호스트가 준 고지 싱크로 나가며, 그 사이 어느 지점에서도 readline이 붙지 않는다.
    const rig = createRig();
    const code = await runCli({ ...rig.deps, argv: ["serve"], out: rig.sink });

    expect(code).toBe(EXIT_STARTUP_FAILED);
    expect(rig.sink.text()).toContain("먼저 `neo-agent`를 한 번 실행한다");
    expect(rig.inputListeners).toEqual([]);
  }, 30_000);

  /**
   * S-8b — 라우팅 자체는 **소스로** 잰다.
   *
   * **왜 실행으로 못 재는가.** 라우팅이 새면 `serve` 갈래가 `startCli` + `run()`으로 흘러
   * REPL이 열리고 그 기동은 끝나지 않는다. 그런데 라우팅이 **서 있을** 때도 `runCli`를 지난
   * 기동은 끝나지 않는다 — 포트를 열고 신호를 기다리는 것이 정상 동작이기 때문이다. 두
   * 갈래가 모두 «안 끝난다»라 종료로는 갈리지 않고, 갈리게 하려면 이 검사가 기본 포트 값을
   * 붙들어야 하는데 그 값은 §12가 세부로 둔 것이라 단정 대상이 아니다.
   *
   * **위 S-8이 이 축을 대신하지 못한다.** 그 기동은 3c에서 던지므로 라우팅이 새도 같은
   * 문면과 같은 종료 코드가 나온다 — 실측으로 확인했다.
   *
   * **그래서 이 단정이 재는 것은 분기의 존재와 자리다.** 한계도 함께 적는다: 분기가 실제로
   * 그 갈래에서만 도는지는 재지 않는다.
   */
  it("S-8b runCli가 serve를 조립보다 먼저 가른다 (소스 축)", () => {
    const source = readFileSync(join(import.meta.dirname, "..", "src", "wiring.ts"), "utf8");
    const start = source.indexOf("export async function runCli");
    expect(start, "runCli를 찾지 못했다 — 개명됐으면 이 검사가 죽은 것이다").toBeGreaterThan(-1);
    const body = source.slice(start);

    const branchAt = body.search(/args\.kind === "serve"[\s\S]{0,80}?runServe\(/);
    const assembleAt = body.indexOf("await startCli(deps, args)");
    expect(branchAt, "serve 갈래가 runServe로 가지 않는다").toBeGreaterThan(-1);
    expect(assembleAt, "조립 호출을 찾지 못했다").toBeGreaterThan(-1);
    expect(branchAt, "serve 분기가 조립 호출보다 뒤에 있다").toBeLessThan(assembleAt);
  });

  /**
   * S-10 — 승인 왕복 1회.
   *
   * **S-1이 이 축을 대신하지 못한다.** 그쪽 모의 모델은 도구를 부르지 않아 게이트가 판정할
   * 대상이 아예 없고, 그래서 승인 프롬프트 배선이 통째로 빠져 있어도 S-1은 그린이다 —
   * `runServe`가 조립에 넘기는 `approvalPrompt` 한 줄을 지워도 마찬가지다.
   *
   * **여기서 재는 것은 넷의 맞물림이다.** ① 게이트가 승인 프롬프트로 내려와 프로세스의
   * 대기 레지스트리를 부르는가 ② 그 대기가 §6.1의 `approval_pending`으로 SSE에 나가는가
   * ③ `approval.settle` POST가 그 대기를 허용으로 접는가 ④ 접힘이 게이트로 돌아가 런이
   * 실제로 재개되는가. 부품 각각은 `packages/serve/test/`와 `packages/gate/test/`가 이미
   * 재고, 이 축이 재는 것은 그 넷이 한 프로세스에서 이어지는가다.
   *
   * 모의로 두는 것은 S-1과 같은 셋뿐이다 — 게이트·승인 레지스트리·도구·소켓은 전부 실물이다.
   */
  it("S-10 승인 왕복 1회 — 게이트 트립 → 승인 프레임 → settle POST → 런 재개", async () => {
    seedReturningHome();
    const target = "approved-by-web.txt";
    const body = "승인 왕복이 실제로 돌았다.\n";
    const rig = createRig({ model: approvalModel(target, body) });
    const running = await start(rig);

    const stream = openStream(running.port);
    await waitUntil(
      () => stream.frames.length > 0,
      () => `핸드셰이크가 오지 않았다 (상태 ${String(stream.status)})`,
    );
    // 핸드셰이크 스냅샷의 대기 목록은 비어 있다 — 아직 어떤 런도 없었다(§6.1·§7).
    const snapshot = stream.frames[0]?.snapshot as { pendingApprovals?: unknown[] } | undefined;
    expect(stream.frames[0]?.kind).toBe("handshake");
    expect(snapshot?.pendingApprovals).toEqual([]);

    const accepted = await postMethod(running.port, {
      type: "req",
      id: "r1",
      method: "run.prompt",
      params: { text: "파일 하나 써 줘" },
    });
    expect(accepted).toMatchObject({ type: "res", id: "r1", ok: true });

    // ── 승인 요청이 스트림으로 나온다. 이 프레임이 없으면 화면은 런이 멈춘 이유를 알 수
    //    없고, 그 상태는 응답이 느린 것과 구분되지 않는다(§6.1이 이 갈래를 만든 근거다).
    await waitUntil(
      () => stream.frames.some((frame) => frame.kind === "approval_pending"),
      () =>
        `승인 요청 프레임이 오지 않았다 — 받은 프레임 ${JSON.stringify(
          stream.frames.map((frame) => frame.kind ?? frame.type),
        )} · 로그: ${rig.sink.text()}`,
    );
    const pendingFrame = stream.frames.find((frame) => frame.kind === "approval_pending");
    expect(pendingFrame?.type).toBe("state");
    const approval = pendingFrame?.approval as {
      id: string;
      display: string;
      requestedAt: number;
      expiresAt: number;
    };
    expect(typeof approval.id).toBe("string");
    // 게이트가 만든 표시 문면이 가공 없이 도달한다(§7) — 도구 이름과 대상 경로가 그 안에 있다.
    expect(approval.display).toContain("write_file");
    expect(approval.display).toContain(target);
    // 유한한 만료가 존재한다는 것이 계약이고 값은 세부다(§7). 그래서 값이 아니라 부등호를 잰다.
    expect(approval.expiresAt).toBeGreaterThan(approval.requestedAt);

    // **승인 전에 파일이 없다는 것이 이 축의 절반이다.** 게이트가 안 서 있으면 도구가 먼저
    // 돌고, 그때도 아래 왕복은 전부 그대로 통과한다 — 즉 이 단정 없이는 «승인이 실제로
    // 막고 있었는가»를 이 축이 안 재게 된다.
    expect(existsSync(join(workspace, target)), "승인 전에 도구가 이미 돌았다").toBe(false);

    // ── 붙어 있는 클라이언트가 답한다. 연결을 인자로 받는 자리가 없다는 것이 §7의 귀속이다.
    const settledResponse = await postMethod(running.port, {
      type: "req",
      id: "a1",
      method: "approval.settle",
      params: { id: approval.id, answer: "allow-once" },
    });
    expect(settledResponse).toMatchObject({
      type: "res",
      id: "a1",
      ok: true,
      payload: { outcome: { decision: "allow", resolvedBy: "client" } },
    });

    // 접힘도 프레임으로 나간다 — 다른 탭에 답할 수 없는 프롬프트가 남지 않는 근거다(§6.1).
    await waitUntil(
      () =>
        stream.frames.some(
          (frame) => frame.kind === "approval_settled" && frame.id === approval.id,
        ),
      () => "승인 접힘 프레임이 오지 않았다",
    );

    // ── 런이 재개된다. 재개의 관측점은 둘이다: 도구가 실제로 돌았는가와 모델이 한 번 더
    //    불렸는가. 앞만 재면 도구 결과를 받고 멈춘 런도 통과한다.
    await waitUntil(
      () => streamEvents(stream).some((event) => event.type === "agent_end"),
      () =>
        `런이 닫히지 않았다 — 본 이벤트: ${JSON.stringify(
          streamEvents(stream).map((event) => event.type),
        )} · 로그: ${rig.sink.text()}`,
      15_000,
    );

    const toolEnd = streamEvents(stream).find((event) => event.type === "tool_end");
    expect(toolEnd, "도구 실행이 이벤트로 나오지 않았다").toBeDefined();
    expect(toolEnd?.toolCallId).toBe(APPROVAL_TOOL_CALL_ID);
    expect(toolEnd?.isError, `도구가 실패했다: ${JSON.stringify(toolEnd?.result)}`).toBe(false);
    expect(readFileSync(join(workspace, target), "utf8")).toBe(body);

    const assistantTexts = streamEvents(stream)
      .filter((event) => event.type === "message_end")
      .map(
        (event) => event.message as { role?: string; content?: { type: string; text?: string }[] },
      )
      .filter((message) => message.role === "assistant")
      .flatMap((message) =>
        (message.content ?? [])
          .filter((block) => block.type === "text")
          .map((block) => block.text ?? ""),
      );
    expect(assistantTexts, "승인 뒤 모델이 다시 불리지 않았다").toContain("turn-2");

    // 런이 실패로 끝났으면 배선이 붙여 둔 거절 싱크에 그 사유가 남는다(S-3과 같은 관측점).
    expect(rig.sink.text(), "런이 실패로 끝났다").not.toContain("neo-agent serve: 런 실패");

    stream.close();
    running.signals.send("SIGINT");
    await expect(running.exit).resolves.toBe(0);
  }, 30_000);

  /**
   * S-11 — 안전 사실 둘이 설정에서 화면까지 닿는다 (`WEB-UI.md` §6.1 · §9.4 결정 10 ·
   * `CLI-INTERFACE.md` §7.1).
   *
   * **부품 축이 이것을 대신하지 못한다.** `packages/serve`의 스트림 축은 주입한 값이
   * 스냅샷에 실리는가까지만 재므로, 배선이 설정을 안 읽고 상수를 넘겨도 전부 그린이다.
   * 여기서 재는 것은 **출처**다 — 기본값이 아닌 설정을 홈에 두고, 그 값이 실물 소켓의
   * 핸드셰이크에서 그대로 나오는가.
   *
   * 기본값이 아닌 값을 고르는 것이 이 축의 전부다. 기본값(`manual`/`on`)으로 재면 배선이
   * 설정을 무시하고 리터럴을 넘겨도 구별되지 않는다.
   */
  it("S-11 안전 사실 둘이 설정에서 핸드셰이크 스냅샷까지 닿는다", async () => {
    seedReturningHome();
    writeFileSync(
      join(home, ".neo-agent", "config.json"),
      JSON.stringify({ approvalMode: "off", sandbox: "off" }),
    );
    const rig = createRig();
    const running = await start(rig);

    const stream = openStream(running.port);
    await waitUntil(
      () => stream.frames.length > 0,
      () => `핸드셰이크가 오지 않았다 (상태 ${String(stream.status)})`,
    );

    expect(stream.frames[0]?.kind).toBe("handshake");
    const snapshot = stream.frames[0]?.snapshot as { safety?: unknown } | undefined;
    expect(snapshot?.safety).toEqual({ approvalMode: "off", sandbox: "off" });

    stream.close();
    running.signals.send("SIGINT");
    await expect(running.exit).resolves.toBe(0);
  }, 15_000);

  it("S-9 이 파일이 조립 진입점을 이름으로 든다 — 예산 게이트의 모집단 안이다", () => {
    // 위 `ASSEMBLY_ENTRY`의 선언이 근거를 든다. 이 단정은 그 임포트가 쓰이지 않는다는
    // 이유로 걷히는 것을 막는다 — 걷히는 순간 이 파일은 probeDocker 교차 검사 밖으로 빠진다.
    expect(ASSEMBLY_ENTRY).toBe(startCli);
    expect(typeof ASSEMBLY_ENTRY).toBe("function");
  });
});
