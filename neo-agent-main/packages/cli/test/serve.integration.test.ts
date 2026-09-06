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
import { createServer, get as httpGet, request as httpRequest } from "node:http";
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
import { dockerAvailable, sandboxImageProbeForbidden } from "./probe-docker.ts";

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
      probeSandboxImage: sandboxImageProbeForbidden(),
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

/**
 * 메서드 POST 하나. 응답 프레임을 돌려준다.
 *
 * **§4.1의 관문을 우리 화면과 같은 모양으로 지난다.** POST는 안전하지 않은 메서드라
 * 검사 1·2·3을 전부 받는다 — `Host`는 `node:http`가 `host`·`port`에서 짓고,
 * `content-type: application/json`은 원래부터 실려 있었으며, `Origin` 하나가 빠져 있었다.
 *
 * 그 `Origin`을 **실포트로 짓는다.** 이 하네스는 서버를 `port: 0`으로 띄우고 커널이 준
 * 주소를 잡으므로 상수 포트로 지은 값은 여기서 거절된다 — §4.1 결정 2가 허용 집합의 출처를
 * 바인드된 실주소로 못박은 것이("기대값은 서버가 알고, 요청이 준 값은 기대값에 들어가지
 * 않는다") 이 자리에서 그대로 재진다. 그래서 아래는 상수가 아니라 호출자가 넘긴 `port`를 쓴다.
 *
 * **관문을 우회하지 않는다** — 테스트 전용 플래그·환경변수를 만들지 않고 브라우저가
 * 붙일 헤더를 정직하게 싣는다.
 */
function postMethod(port: number, frame: unknown): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(frame);
    const request = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path: "/rpc",
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: `http://127.0.0.1:${String(port)}`,
          "content-length": Buffer.byteLength(body),
        },
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

/**
 * 메서드 표가 사는 라우트. 위 `postMethod`가 상수 없이 같은 값을 든다 — 이 이름은 아래
 * 안전한 메서드 축이 그 라우트를 가리킨다는 것을 문장으로 만들기 위한 것이고, 라우트
 * 상수의 정본은 이 파일이 아니라 서버 쪽이다(그 대조는 `packages/serve/test/`의 몫이다).
 */
const METHOD_PATH = "/rpc";

interface PlainResponse {
  status: number | undefined;
  body: string;
}

/**
 * 헤더를 손으로 지어 보내는 최소 요청 하나. 프레임을 모르고 상태 코드와 본문만 돌려준다.
 *
 * **`postMethod`와 갈라 두는 이유가 둘이다.** ① 그쪽은 우리 화면의 정상 POST를 흉내내므로
 * `content-type`과 `Origin`을 항상 싣는데, 안전한 메서드의 축은 **그 둘이 없는 요청**이
 * 관문을 지나는가를 재야 한다 — 주소창 내비게이션이 그 모양이고 §4.1 강제 수단이 통과해야
 * 할 조합으로 그것을 든다 ② 안전하지 않은 메서드가 아니므로 응답이 JSON이라는 보장이 없다.
 *
 * `Host`는 넘기지 않으면 `node:http`가 `host`·`port`에서 짓는다 — 그 값이 §4.1 결정 2의
 * 허용 Host 집합 안이라 검사 1을 지난다. 넘기면 그 값이 그대로 나가고, 그것이 검사 1을
 * 밖에서 재는 수단이다.
 */
function sendPlain(
  port: number,
  method: string,
  options: {
    path?: string;
    headers?: Record<string, string | number>;
    body?: string;
    /**
     * 응답의 끝을 안 기다리고 헤더에서 판정한다. **스트림 라우트를 재는 자리에만 쓴다** —
     * 그 라우트가 거절을 안 하면 응답이 안 끝나므로, 기다리는 형태면 실패가 붉은 단정이
     * 아니라 30초 타임아웃으로 나온다.
     */
    headersOnly?: boolean;
  } = {},
): Promise<PlainResponse> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path: options.path ?? METHOD_PATH,
        method,
        headers: options.headers ?? {},
      },
      (response) => {
        if (options.headersOnly === true) {
          resolve({ status: response.statusCode, body: "" });
          request.destroy();
          return;
        }
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          text += chunk;
        });
        response.on("end", () => {
          resolve({ status: response.statusCode, body: text });
        });
      },
    );
    request.on("error", reject);
    request.end(options.body);
  });
}

/**
 * 안전한 메서드가 메서드 표에 닿지 못했는가의 판정. 기대값의 출처는 §4.1 결정 5와 결정 3이다.
 *
 * - 결정 5 — 상태를 바꾸는 것은 메서드 표뿐이고 그 표의 왕복은 POST 하나다. 상태를 바꾸는
 *   라우트를 안전한 메서드로 여는 것을 그 절이 금지한다. 그래서 이 라우트의 `GET`·`HEAD`는
 *   디스패처에 닿으면 안 된다.
 * - 결정 3 — 안전한 메서드는 검사 2·3의 모집단 밖이고 검사 1만 받는다. 그래서 허용 Host로
 *   보낸 요청이 **403을 받으면 그것이 곧 그 모집단 분할의 위반**이다. 이 단정을 따로 두는
 *   것은 실패했을 때 어느 절이 깨진 것인지를 메시지가 스스로 말하게 하기 위해서다.
 *
 * [미규정] 405라는 **값 자체**는 정본이 못박지 않았다. 결정 4가 라우트별 응답을 405·400·404로
 * 열거하며 지나가듯 들 뿐이고, 문면이 계약인 자리는 §12가 관문의 거절(403)에 대해서만 든다.
 * 그래서 위 두 줄(디스패치 안 됨 · 403 아님)이 정본에서 나온 것이고, 아래 405 등식은 그
 * 열거에 기댄 것이다 — 구현이 404를 고르면 결정 5는 여전히 지켜진 채 이 줄만 붉는다.
 */
function assertSafeMethodDidNotDispatch(method: string, response: PlainResponse): void {
  expect(
    response.status,
    `${method}가 403을 받았다 — 관문이 안전한 메서드에 검사 2·3을 걸고 있다는 뜻이고 §4.1 결정 3의 모집단 분할 위반이다`,
  ).not.toBe(403);
  expect(
    response.status,
    `${method}가 2xx를 받았다 — 메서드 표가 안전한 메서드에 열려 있다면 §4.1 결정 5 위반이다`,
  ).not.toBeLessThan(400);
  expect(response.body, `${method} 응답에 메서드 표의 응답 프레임이 실렸다`).not.toContain(
    '"type":"res"',
  );
  // [미규정] — 위 주석의 근거로 이 등식만 결정 4의 열거에 기댄다.
  expect(response.status, `${method}가 405가 아닌 ${String(response.status)}를 받았다`).toBe(405);
}

/**
 * 허용 밖 `Host`가 라우팅 앞에서 거절됐는가의 판정. 출처는 §4.1 결정 3의 검사 1(모집단이
 * 모든 요청이다) · 결정 4(관문은 라우팅보다 앞의 한 자리다) · 결정 6(상태 코드는 403이다).
 *
 * **이 축이 없으면 위 축이 거짓 그린을 낼 수 있다.** 관문이 안전한 메서드를 통째로 면제하면
 * 위 축은 그대로 405를 받아 초록인데, 검사 1의 모집단이 새어 리바인딩 문이 열린 상태가 된다.
 */
function assertHostGateRejected(response: PlainResponse): void {
  expect(
    response.status,
    `허용 밖 Host의 GET이 ${String(response.status)}를 받았다 — 라우팅에 닿았다면 검사 1의 모집단이 안전한 메서드에서 새고 있다`,
  ).toBe(403);
}

/** 역검증용 정적 응답 서버. 실물이 아니라 위 판정 함수 자신을 재는 자리다 */
async function withStubServer(
  status: number,
  body: string,
  fn: (port: number) => Promise<void>,
): Promise<void> {
  const server = createServer((_request, response) => {
    response.writeHead(status, { "content-type": "text/plain" });
    response.end(body);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  try {
    await fn(port);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }
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
    // 돌고, 그때도 아래 왕복은 전부 그대로 통과한다 — 즉 이 단정 없이는 승인이 실제로
    // 막고 있었는가를 이 축이 안 재게 된다.
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

  /**
   * S-12 ~ S-15 — §4.1 결정 5의 불변을 **배선이 사는 자리**에서 잰다.
   *
   * **왜 여기인가.** 메서드 표의 디스패처를 배선하는 것은 `packages/cli/src/serve.ts`의
   * `handlePlain`이고 그 함수는 export되지 않는다. 그리고 `packages/serve`는 `@neo-agent/cli`를
   * 임포트할 수 없다(§2.2의 계약이고 그 패키지의 경계 테스트가 잰다). 그쪽에서 이 축을 쓰면
   * 실물이 아니라 테스트가 만든 스텁을 재게 되므로 집이 이 파일이다.
   *
   * **재는 문장 셋.**
   * ① 결정 5 — 상태를 바꾸는 라우트를 안전한 메서드로 여는 것을 그 절이 금지한다. 그래서
   *    메서드 표의 라우트에 `GET`·`HEAD`를 보내면 디스패처가 안 불리고 런이 시작되지 않는다.
   * ② 결정 3 — 안전한 메서드는 검사 2·3의 모집단 밖이다. 그래서 허용 Host로 보낸 안전한
   *    메서드는 관문을 **지나** 라우트의 거절에 닿는다(403이 아니다).
   * ③ 결정 3의 검사 1 — 모집단이 모든 요청이다. 그래서 허용 밖 Host의 안전한 메서드는
   *    라우팅보다 앞에서 거절된다(결정 4·결정 6).
   *
   * ②와 ③은 서로의 거짓 그린을 막는다 — 관문이 안전한 메서드를 통째로 면제해도 ②는 초록이고,
   * 관문이 안전한 메서드에 검사 셋을 다 걸어도 ③은 초록이다. 둘을 함께 둔 것이 이 축의 내용이다.
   */
  it("S-12 메서드 표에 GET을 보내면 디스패처가 안 불리고 런이 시작되지 않는다", async () => {
    seedReturningHome();
    const rig = createRig();
    const running = await start(rig);

    const stream = openStream(running.port);
    await waitUntil(
      () => stream.frames.length > 0,
      () => `핸드셰이크가 오지 않았다 (상태 ${String(stream.status)})`,
    );

    // 미끼는 **유효한 요청 프레임 그대로**다. 본문 하나로 디스패치하는 배선이라면 이것으로
    // 런이 시작되고, 메서드로 먼저 가르는 배선이라면 본문은 읽히지도 않는다.
    // `Origin`을 일부러 안 싣는다 — 안전한 메서드는 검사 3의 모집단 밖이므로 그것이 있어야
    // 지나는 관문이라면 그 자체가 결정 3 위반이다.
    const baitFrame = {
      type: "req",
      id: "safe-method-bait",
      method: "run.prompt",
      params: { text: "GET으로 런이 시작되는가" },
    };
    const bait = JSON.stringify(baitFrame);
    const response = await sendPlain(running.port, "GET", {
      body: bait,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(bait),
      },
    });
    assertSafeMethodDidNotDispatch("GET", response);

    // 런이 안 섰다는 것의 첫 관측. 시작됐다면 이 창 안에 코어 이벤트가 하나는 온다.
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(
      streamEvents(stream).map((event) => event.type),
      "안전한 메서드가 코어 이벤트를 냈다 — 런이 시작된 것이다",
    ).toEqual([]);

    // **여기가 위 침묵의 역검증이다.** 스트림이 안 붙었거나 관측이 죽어 있어도, 또는 미끼
    // 프레임이 애초에 디스패치될 수 없는 모양이었어도 위 단정은 그대로 초록이다. 그래서
    // **같은 프레임을 바이트 그대로** POST로 한 번 더 보낸다 — 이것이 런을 시작시키므로
    // 위의 침묵을 설명하는 것은 메서드 하나만 남는다.
    const accepted = await postMethod(running.port, baitFrame);
    expect(
      accepted,
      "같은 프레임의 POST가 거절됐다 — 미끼가 애초에 디스패치 불가였거나 GET이 이미 런을 시작시킨 것이다",
    ).toMatchObject({ type: "res", id: "safe-method-bait", ok: true });

    await waitUntil(
      () => streamEvents(stream).some((event) => event.type === "agent_end"),
      () =>
        `런이 닫히지 않았다 — 본 이벤트: ${JSON.stringify(
          streamEvents(stream).map((event) => event.type),
        )} · 로그: ${rig.sink.text()}`,
      15_000,
    );

    // **위 대기만으로는 이 수가 안 닫힌다**(변이 실측). 미끼가 늦게 런을 세우면 첫 `agent_end`가
    // 그 런의 것이 되어 대기가 먼저 풀리고, 그 순간 둘째 런의 시작은 아직 안 와 있다. 창을
    // 하나 더 두는 것이 그 갈래를 닫는다.
    await new Promise((resolve) => setTimeout(resolve, 250));

    // 시작된 런이 정확히 하나다. 미끼가 하나를 더 시작시켰다면 이 수가 둘이 된다.
    const starts = streamEvents(stream).filter((event) => event.type === "agent_start");
    expect(
      starts.length,
      `런이 하나가 아니다 — 안전한 메서드가 하나를 더 시작시켰다. 본 이벤트: ${JSON.stringify(
        streamEvents(stream).map((event) => event.type),
      )}`,
    ).toBe(1);

    stream.close();
    running.signals.send("SIGINT");
    await expect(running.exit).resolves.toBe(0);
  }, 30_000);

  it("S-13 메서드 표에 HEAD를 보내도 같다", async () => {
    seedReturningHome();
    const rig = createRig();
    const running = await start(rig);

    const stream = openStream(running.port);
    await waitUntil(
      () => stream.frames.length > 0,
      () => `핸드셰이크가 오지 않았다 (상태 ${String(stream.status)})`,
    );

    const baitFrame = {
      type: "req",
      id: "safe-method-bait",
      method: "run.prompt",
      params: { text: "HEAD로 런이 시작되는가" },
    };
    const bait = JSON.stringify(baitFrame);
    const response = await sendPlain(running.port, "HEAD", {
      body: bait,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(bait),
      },
    });
    // HEAD의 응답은 본문을 안 나르므로 이 축이 기대는 것은 상태 코드와 런의 부재다.
    assertSafeMethodDidNotDispatch("HEAD", response);

    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(
      streamEvents(stream).map((event) => event.type),
      "안전한 메서드가 코어 이벤트를 냈다 — 런이 시작된 것이다",
    ).toEqual([]);

    // S-12와 같은 역검증 — 같은 프레임을 바이트 그대로 POST로 보내 관측 채널과 미끼의
    // 디스패치 가능성을 함께 보인다.
    const accepted = await postMethod(running.port, baitFrame);
    expect(
      accepted,
      "같은 프레임의 POST가 거절됐다 — 미끼가 애초에 디스패치 불가였거나 HEAD가 이미 런을 시작시킨 것이다",
    ).toMatchObject({ type: "res", id: "safe-method-bait", ok: true });

    await waitUntil(
      () => streamEvents(stream).some((event) => event.type === "agent_end"),
      () => `런이 닫히지 않았다 — 로그: ${rig.sink.text()}`,
      15_000,
    );
    // S-12와 같은 근거의 둘째 창 — 늦게 서는 런을 위 대기가 안 가른다.
    await new Promise((resolve) => setTimeout(resolve, 250));
    const starts = streamEvents(stream).filter((event) => event.type === "agent_start");
    expect(
      starts.length,
      `런이 하나가 아니다 — 안전한 메서드가 하나를 더 시작시켰다. 본 이벤트: ${JSON.stringify(
        streamEvents(stream).map((event) => event.type),
      )}`,
    ).toBe(1);

    stream.close();
    running.signals.send("SIGINT");
    await expect(running.exit).resolves.toBe(0);
  }, 30_000);

  it("S-14 허용 밖 Host의 GET은 라우팅 앞에서 거절된다 — 검사 1의 모집단은 모든 요청이다", async () => {
    seedReturningHome();
    const rig = createRig();
    const running = await start(rig);

    // 리바인딩이 우리 서버에 닿는 모양이다 — 연결은 루프백이고 이름만 공격자의 것이다.
    const rejected = await sendPlain(running.port, "GET", {
      headers: { host: "attacker.example" },
    });
    assertHostGateRejected(rejected);

    // 결정 5가 안전한 메서드로 열린다고 든 라우트가 둘이다 — 스트림 개설과 정적 자산.
    // 한쪽만 재면 나머지가 관문 밖에 선 상태를 못 본다(결정 4가 자리를 하나로 둔 근거다).
    const rejectedRoot = await sendPlain(running.port, "GET", {
      path: "/",
      headers: { host: "attacker.example" },
    });
    assertHostGateRejected(rejectedRoot);

    const rejectedStream = await sendPlain(running.port, "GET", {
      path: "/stream?v=1",
      headers: { host: "attacker.example" },
      headersOnly: true,
    });
    assertHostGateRejected(rejectedStream);

    running.signals.send("SIGINT");
    await expect(running.exit).resolves.toBe(0);
  }, 30_000);

  it("S-15 위 두 판정이 실제로 위반을 잡는다 (역검증)", async () => {
    // 위반 ① — 안전한 메서드에 메서드 표가 답한다. 결정 5가 금지한 형태다.
    await withStubServer(200, JSON.stringify({ type: "res", id: "x", ok: true }), async (port) => {
      const response = await sendPlain(port, "GET");
      expect(() => {
        assertSafeMethodDidNotDispatch("GET", response);
      }).toThrow();
    });

    // 위반 ② — 관문이 안전한 메서드를 403으로 막는다. 결정 3의 모집단 분할 위반이다.
    await withStubServer(403, "거절", async (port) => {
      const response = await sendPlain(port, "GET");
      expect(() => {
        assertSafeMethodDidNotDispatch("GET", response);
      }).toThrow();
    });

    // 대조 ③ — 라우트의 거절만 통과한다.
    await withStubServer(405, "method not allowed", async (port) => {
      const response = await sendPlain(port, "GET");
      expect(() => {
        assertSafeMethodDidNotDispatch("GET", response);
      }).not.toThrow();
    });

    // 위반 ④ — 허용 밖 Host가 라우팅에 닿아 라우트의 거절을 받는다. 검사 1의 모집단이
    // 안전한 메서드에서 새는 형태이고, S-12·S-13만으로는 초록인 채로 남는 자리다.
    await withStubServer(405, "method not allowed", async (port) => {
      const response = await sendPlain(port, "GET", { headers: { host: "attacker.example" } });
      expect(() => {
        assertHostGateRejected(response);
      }).toThrow();
    });

    // 대조 ⑤ — 관문의 거절만 통과한다.
    await withStubServer(403, "거절", async (port) => {
      const response = await sendPlain(port, "GET", { headers: { host: "attacker.example" } });
      expect(() => {
        assertHostGateRejected(response);
      }).not.toThrow();
    });
  }, 30_000);

  it("S-9 이 파일이 조립 진입점을 이름으로 든다 — 예산 게이트의 모집단 안이다", () => {
    // 위 `ASSEMBLY_ENTRY`의 선언이 근거를 든다. 이 단정은 그 임포트가 쓰이지 않는다는
    // 이유로 걷히는 것을 막는다 — 걷히는 순간 이 파일은 probeDocker 교차 검사 밖으로 빠진다.
    expect(ASSEMBLY_ENTRY).toBe(startCli);
    expect(typeof ASSEMBLY_ENTRY).toBe("function");
  });
});
