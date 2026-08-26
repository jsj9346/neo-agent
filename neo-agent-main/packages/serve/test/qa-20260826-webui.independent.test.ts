/**
 * 독립 QA — `docs/WEB-UI.md` §2·§2.1·§2.2·§3·§3.1·§3.2·§4·§5·§6·§6.1·§7·§8·§8.1·§9.1·§9.2·§9.3·§10·§11·§12.
 *
 * **이 파일은 구현을 읽고 쓰지 않았다.** 기대값은 전부 위 문서에서 뽑았고, 실물은 그 뒤에
 * 열었다. 그래서 아래에는 «구현이 이러니 이게 맞겠지»로 세운 축이 없다 — 실패하는 축은
 * 실패한 채로 둔다(정본 편이다).
 *
 * 이미 `packages/serve/test/`의 아홉 파일이 도는 축은 여기서 되풀이하지 않는 것이 원칙이나,
 * **지정된 여덟 자리는 독립적으로 다시 잰다** — 같은 결론에 두 경로로 닿는 것이 이 파일의
 * 몫이고, 재는 방식이 다르면 한쪽만 통과하는 상태가 발견이 된다.
 *
 * 등급 표기: `[계약 위반]` · `[문서 부정확]` · `[미규정]`.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 이 파일의 주석은 정본 문면을 인용부호로 감싸지
 * 않고 전부 서술로 적는다. 지목은 절 번호로 한다.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { get as httpGet } from "node:http";
import { fileURLToPath } from "node:url";
import type { AgentEvent, AgentEventListener, AgentMessage, Unsubscribe } from "@neo-agent/core";
import { afterEach, describe, expect, it } from "vitest";
import type { ApprovalChange } from "../src/approvals.ts";
import { createApprovalRegistry } from "../src/approvals.ts";
import { ASSET_MANIFEST } from "../src/assets.ts";
import * as codec from "../src/codec.ts";
import type { Frame } from "../src/protocol.ts";
import { frameSchema } from "../src/protocol.ts";
import type { AgentEventBus, ServeServer } from "../src/server.ts";
import {
  createServeServer,
  LOOPBACK_HOST,
  PROTOCOL_VERSION,
  PROTOCOL_VERSION_PARAM,
  STREAM_PATH,
} from "../src/server.ts";
import type { SessionSnapshot, StreamResponse } from "../src/stream.ts";
import { createStreamHub } from "../src/stream.ts";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const SERVE_SRC = fileURLToPath(new URL("../src/", import.meta.url));
const CLIENT_DIR = fileURLToPath(new URL("../client/", import.meta.url));
const doc = (name: string): string => readFileSync(`${REPO}docs/${name}`, "utf8");
const src = (path: string): string => readFileSync(`${REPO}${path}`, "utf8");

/* ------------------------------------------------------------------------ *
 * 도구
 * ------------------------------------------------------------------------ */

class ResponseDouble implements StreamResponse {
  head: { status: number; headers: Record<string, string> } | undefined;
  readonly chunks: string[] = [];
  ended = false;
  destroyed = false;
  writableLength = 0;
  /** 켠 뒤에는 쓴 만큼 미전송 바이트가 쌓인다 — §8이 말하는 느린 소비자다 */
  stalled = false;

  writeHead(status: number, headers: Readonly<Record<string, string>>): unknown {
    this.head = { status, headers: { ...headers } };
    return this;
  }
  write(chunk: string): unknown {
    this.chunks.push(chunk);
    if (this.stalled) this.writableLength += chunk.length;
    return true;
  }
  end(): unknown {
    this.ended = true;
    return this;
  }
  destroy(): unknown {
    this.destroyed = true;
    return this;
  }
  on(_event: "close", _listener: () => void): unknown {
    return this;
  }
  /** 이 연결이 실제로 받은 푸시 프레임들 */
  frames(): Frame[] {
    return this.chunks.map((chunk) => {
      const line = chunk.split("\n").find((part) => part.startsWith("data: "));
      return frameSchema.parse(JSON.parse((line ?? "data: {}").slice("data: ".length)));
    });
  }
}

class BusDouble implements AgentEventBus {
  readonly #listeners = new Set<AgentEventListener>();
  subscribe(listener: AgentEventListener): Unsubscribe {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
  async emit(event: AgentEvent): Promise<void> {
    for (const listener of [...this.#listeners])
      await listener(event, new AbortController().signal);
  }
}

const textMessage = (id: string, text: string): AgentMessage => ({
  id,
  role: "user",
  content: [{ type: "text", text }],
  timestamp: 0,
});

const anEvent = (): AgentEvent => ({ type: "run_start", runId: "r-qa" }) as unknown as AgentEvent;

/** `src/` 트리의 모든 `.ts` 본문 */
function sourcesOf(dir: string): { name: string; text: string }[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => ({ name: entry.name, text: readFileSync(dir + entry.name, "utf8") }));
}

/** 주석을 걷어 낸 본문 — 텍스트 축이 주석의 문장에 걸려 거짓 양성을 내지 않게 한다 */
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ======================================================================== *
 * QA-1 · §4 — 바인드는 상수이고 그 값이 루프백이며 생성 함수의 인자다
 * ======================================================================== */

describe("QA-1 · §4 — 노출은 루프백 하나다", () => {
  const servers: ServeServer[] = [];
  afterEach(async () => {
    for (const server of servers.splice(0)) await server.close().catch(() => undefined);
  });

  const make = (host: string): ServeServer =>
    createServeServer({
      host: host as typeof LOOPBACK_HOST,
      port: 0,
      agent: { subscribe: () => () => undefined },
      openStream: () => undefined,
      handleRequest: ({ response }) => {
        response.writeHead(204, {});
        response.end();
      },
    });

  it("상수의 값이 실제로 루프백 주소다 — 상수라는 것만으로는 부족하다", () => {
    // §4는 루프백 고정을 정하고 그 위에 인증·TLS를 설계하지 않는 근거를 세운다. 상수가
    // 존재하는지가 아니라 그 값이 루프백인지가 그 근거를 지탱한다.
    expect(LOOPBACK_HOST === "127.0.0.1" || LOOPBACK_HOST === "::1").toBe(true);
  });

  it("실제로 바인드된 주소가 루프백이고 외부 인터페이스가 아니다", async () => {
    const server = make(LOOPBACK_HOST);
    servers.push(server);
    const address = await server.listen();
    expect(address.host).toBe(LOOPBACK_HOST);
  });

  it("타입을 우회한 값은 생성에서 거부된다 — 설정·env·argv 어디서도 못 덮어쓴다", () => {
    for (const host of ["0.0.0.0", "::", "127.0.0.2", "localhost", ""]) {
      expect(() => make(host)).toThrow();
    }
  });

  it("역검증 — 이 축이 실제로 잡는다: 루프백 하나만 통과한다", () => {
    expect(() => make(LOOPBACK_HOST)).not.toThrow();
  });

  it("바인드가 서버 생성 함수의 인자다 — 흔적이 실물로 서 있다", () => {
    // §4가 흔적으로 든 형태. 자리를 안 열어 두면 노출을 여는 날 서버 본체가 재작성된다.
    const text = stripComments(src("packages/serve/src/server.ts"));
    expect(/host\s*:\s*BindHost/.test(text)).toBe(true);
    // 그리고 그 자리는 선택적이 아니어야 한다 — 기본값이 있으면 인자가 장식이 된다.
    expect(/host\?\s*:/.test(text)).toBe(false);
  });

  it("`src/`가 `process.env`·`process.argv`를 읽지 않는다 — 덮어쓰기 경로가 존재하지 않는다", () => {
    for (const file of sourcesOf(SERVE_SRC)) {
      const text = stripComments(file.text);
      expect({ file: file.name, env: /process\.env/.test(text) }).toEqual({
        file: file.name,
        env: false,
      });
      expect({ file: file.name, argv: /process\.argv/.test(text) }).toEqual({
        file: file.name,
        argv: false,
      });
    }
  });
});

/* ======================================================================== *
 * QA-2 · §5 규칙 1·3 — 코어 계약이 이 문서 때문에 넓어지지 않았다
 * ======================================================================== */

describe("QA-2 · §5 규칙 1·3 — `packages/core`가 안 바뀌었다", () => {
  it("이번 사이클의 워킹트리에서 `packages/core`에 변경이 0건이다", () => {
    const out = execFileSync(
      "git",
      ["status", "--porcelain", "--", "neo-agent-main/packages/core"],
      { cwd: `${REPO}..`, encoding: "utf8" },
    );
    expect(out.trim()).toBe("");
  });

  it("코어가 `serve`를 모른다 — 역방향 임포트가 없다(§2)", () => {
    // `git grep`은 매치가 0건이면 종료 코드 1로 나간다 — 그것이 이 축의 통과 조건이다.
    let hits = "";
    try {
      hits = execFileSync(
        "git",
        ["grep", "-l", "-e", "@neo-agent/serve", "-e", "packages/serve", "--", "packages/core"],
        { cwd: REPO, encoding: "utf8" },
      ).trim();
    } catch {
      hits = "";
    }
    expect(hits).toBe("");
  });

  it("`AgentEvent`에 전송 식별자가 없다 — 연결·소켓·클라이언트 id가 안 는다", () => {
    const text = stripComments(src("packages/core/src/events.ts"));
    for (const forbidden of ["connectionId", "socket", "clientId", "streamId", "seq"]) {
      expect({ forbidden, present: text.includes(forbidden) }).toEqual({
        forbidden,
        present: false,
      });
    }
  });

  it("`serve`가 `core` 밖의 형제 패키지를 임포트하지 않는다 — `web`도 포함(§2·§2.2)", () => {
    for (const file of sourcesOf(SERVE_SRC)) {
      const siblings = [...file.text.matchAll(/from\s+"(@neo-agent\/[a-z-]+)"/g)].map((m) => m[1]);
      expect({ file: file.name, siblings: [...new Set(siblings)] }).toEqual({
        file: file.name,
        siblings: siblings.length === 0 ? [] : ["@neo-agent/core"],
      });
    }
  });
});

/* ======================================================================== *
 * QA-3 · §5 규칙 4 — 인코딩은 `packages/serve` 안에만 사는가
 * ======================================================================== */

describe("QA-3 · §5 규칙 4 — 인코딩의 자리", () => {
  it("[계약 위반] 응답 프레임을 바이트로 옮기는 인코딩이 `packages/cli`에 산다", () => {
    // §5 규칙 4는 인코딩이 `packages/serve` 안에만 산다고 정하고, 그것이 `core`·`cli`로
    // 들어가면 경계가 샌 것이라고 적는다. §2.1이 전송을 SSE + POST로 정했으므로 왕복의
    // 반쪽(ResponseFrame → 바이트 + Content-Type + 상태 코드)도 그 인코딩이다.
    //
    // 실물: `packages/serve/src/codec.ts`는 푸시의 인코더와 요청 본문의 디코더 둘만 든다.
    // 응답 프레임의 직렬화와 그 HTTP 표현은 `packages/cli/src/serve.ts`가 한다.
    const cli = stripComments(src("packages/cli/src/serve.ts"));
    const encodesFrameInCli =
      /JSON\.stringify\(\s*frame\s*\)/.test(cli) && /application\/json/.test(cli);

    // 기대값은 정본에서만 나온다: cli가 프레임을 바이트로 옮기지 않는다.
    expect({ where: "packages/cli/src/serve.ts", encodesFrame: encodesFrameInCli }).toEqual({
      where: "packages/cli/src/serve.ts",
      encodesFrame: false,
    });
  });

  it("[계약 위반] 원인 — `codec.ts`에 응답 프레임의 인코더가 없다. 짝이 하나 빈다", () => {
    const exported = Object.keys(codec);
    // 푸시 인코더와 요청 디코더는 있다. 왕복의 반쪽(ResponseFrame → 바이트)만 자리가
    // 없고, 그래서 그 일을 `packages/cli`가 대신 한다.
    expect(exported).toContain("createPushEncoder");
    expect(exported).toContain("decodeRequest");
    expect(exported.some((name) => /encodeResponse|responseEncoder|encodeFrame/i.test(name))).toBe(
      true,
    );
  });
});

/* ======================================================================== *
 * QA-4 · §6·§6.1 — 첫 프레임은 핸드셰이크, `seq`는 두 푸시에 대해 한 수열
 * ======================================================================== */

describe("QA-4 · §6·§6.1 — 한 카운터", () => {
  it("핸드셰이크가 첫 푸시이고 그 번호가 1이다", () => {
    const response = new ResponseDouble();
    const hub = createStreamHub({
      session: (): SessionSnapshot => ({ sessionId: "s", messages: [] }),
      // §6.1의 넷째 필드. 이 파일의 축은 값이 아니라 형태라 픽스처는 기본값이다.
      safety: { approvalMode: "manual", sandbox: "on" },
      approvals: createApprovalRegistry({ onSubscriberError: () => undefined }),
      onConnectionError: () => undefined,
    });
    hub.open({ response, events: new BusDouble() });

    const [first] = response.frames();
    expect(first).toMatchObject({ type: "state", kind: "handshake", seq: 1 });
  });

  it("`event`와 `state`가 카운터를 나눠 쓰지 않는다 — 섞어도 1,2,3,…이다", async () => {
    const response = new ResponseDouble();
    const bus = new BusDouble();
    const registry = createApprovalRegistry({ onSubscriberError: () => undefined });
    const hub = createStreamHub({
      session: (): SessionSnapshot => ({ sessionId: "s", messages: [] }),
      // §6.1의 넷째 필드. 이 파일의 축은 값이 아니라 형태라 픽스처는 기본값이다.
      safety: { approvalMode: "manual", sandbox: "on" },
      approvals: registry,
      onConnectionError: () => undefined,
    });
    hub.open({ response, events: bus });

    await bus.emit(anEvent()); // seq 2 — event
    const controller = new AbortController();
    void registry.ask({ display: "d" }, controller.signal).catch(() => undefined); // seq 3 — state
    await bus.emit(anEvent()); // seq 4 — event
    hub.announceShutdown(); // seq 5 — state

    const frames = response.frames();
    expect(frames.map((frame) => (frame as { seq: number }).seq)).toEqual([1, 2, 3, 4, 5]);
    expect(frames.map((frame) => frame.type)).toEqual([
      "state",
      "event",
      "state",
      "event",
      "state",
    ]);
    registry.denyAllForShutdown();
  });

  it("연결마다 1부터다 — 이어받을 자리가 없다(§8, 이벤트 재생 없음)", () => {
    const session = (): SessionSnapshot => ({ sessionId: "s", messages: [] });
    const hub = createStreamHub({
      session,
      // §6.1의 넷째 필드. 이 파일의 축은 값이 아니라 형태라 픽스처는 기본값이다.
      safety: { approvalMode: "manual", sandbox: "on" },
      approvals: createApprovalRegistry({ onSubscriberError: () => undefined }),
      onConnectionError: () => undefined,
    });
    const a = new ResponseDouble();
    const b = new ResponseDouble();
    hub.open({ response: a, events: new BusDouble() });
    hub.open({ response: b, events: new BusDouble() });
    expect((a.frames()[0] as { seq: number }).seq).toBe(1);
    expect((b.frames()[0] as { seq: number }).seq).toBe(1);
  });
});

/* ======================================================================== *
 * QA-5 · §3.2 — 종료 8단계의 두 순서 요구
 * ======================================================================== */

describe("QA-5 · §3.2 — 3이 4보다 앞이고 1이 7보다 앞이다", () => {
  /** 순서를 기록하는 포트 묶음. 단계마다 이름 하나를 남긴다 */
  const record = async (graceMs: number): Promise<string[]> => {
    const { beginShutdown } = await import("../src/shutdown.ts");
    const log: string[] = [];
    let releaseClose = (): void => undefined;
    const closed = new Promise<void>((resolve) => {
      releaseClose = resolve;
    });

    const run = beginShutdown(
      {
        server: {
          close: () => {
            log.push("1-begin");
            return closed.then(() => {
              log.push("1-done");
            });
          },
        },
        streams: {
          announceShutdown: () => {
            log.push("2");
          },
          closeAll: () => {
            log.push("6");
            // 열려 있던 연결이 6에서 닫히면 그때 1이 완료된다 — 실물의 순서다.
            releaseClose();
          },
        },
        approvals: {
          denyAllForShutdown: () => {
            log.push("3");
          },
        },
        run: {
          waitForIdle: async () => {
            log.push("4");
          },
          abort: () => {
            log.push("abort");
          },
        },
        waitForInFlightCompaction: async () => {
          log.push("5");
        },
        store: {
          close: () => {
            log.push("7");
          },
        },
        notify: () => {
          log.push("8");
        },
        onStepError: () => undefined,
      },
      { graceMs },
    );
    await run.finished;
    return log;
  };

  it("3이 4보다 앞이다 — 승인 비우기가 idle 대기를 앞선다", async () => {
    const log = await record(500);
    expect(log.indexOf("3")).toBeLessThan(log.indexOf("4"));
  });

  it("1이 7보다 앞이다 — 수락 중지의 개시도 완료도 저장소 닫기를 앞선다", async () => {
    const log = await record(500);
    expect(log.indexOf("1-begin")).toBeLessThan(log.indexOf("7"));
    expect(log.indexOf("1-done")).toBeLessThan(log.indexOf("7"));
  });

  it("2와 6이 갈려 있다 — 고지 뒤 유예가 도는 동안 스트림이 열려 있다", async () => {
    const log = await record(500);
    expect(log.indexOf("2")).toBeLessThan(log.indexOf("4"));
    expect(log.indexOf("4")).toBeLessThan(log.indexOf("6"));
  });

  it("여덟 단계가 열거된 순서 그대로다", async () => {
    const log = await record(500);
    expect(log.filter((step) => /^[2-7]$/.test(step))).toEqual(["2", "3", "4", "5", "6", "7"]);
  });
});

/* ======================================================================== *
 * QA-6 · §7 — 만료가 거부이고 무응답이 허용으로 읽히는 경로가 없다
 * ======================================================================== */

describe("QA-6 · §7 — 만료는 거부다", () => {
  it("아무도 답하지 않으면 게이트가 deny를 받는다", async () => {
    const registry = createApprovalRegistry({ timeoutMs: 5, onSubscriberError: () => undefined });
    const answer = await registry.ask({ display: "rm -rf /" }, new AbortController().signal);
    expect(answer).toBe("deny");
  });

  it("만료의 사유가 timeout이고 판정이 deny다 — 두 값 다 계약이다(§3.2)", async () => {
    const registry = createApprovalRegistry({ timeoutMs: 5, onSubscriberError: () => undefined });
    const changes: ApprovalChange[] = [];
    registry.subscribe((change) => changes.push(change));
    await registry.ask({ display: "d" }, new AbortController().signal);
    expect(changes.at(-1)).toMatchObject({
      kind: "settled",
      outcome: { decision: "deny", resolvedBy: "timeout" },
    });
  });

  it("유한한 만료가 없는 상태가 표현되지 않는다 — 0·음수·Infinity가 생성에서 거부된다", () => {
    for (const timeoutMs of [0, -1, Number.POSITIVE_INFINITY, Number.NaN]) {
      expect(() =>
        createApprovalRegistry({ timeoutMs, onSubscriberError: () => undefined }),
      ).toThrow();
    }
  });

  it("종료로 접힌 승인이 timeout으로 접히지 않는다 — 사유가 shutdown이다(§3.2)", async () => {
    const registry = createApprovalRegistry({
      timeoutMs: 60_000,
      onSubscriberError: () => undefined,
    });
    const changes: ApprovalChange[] = [];
    registry.subscribe((change) => changes.push(change));
    const pending = registry.ask({ display: "d" }, new AbortController().signal);
    registry.denyAllForShutdown();
    expect(await pending).toBe("deny");
    expect(changes.at(-1)).toMatchObject({
      kind: "settled",
      outcome: { decision: "deny", resolvedBy: "shutdown" },
    });
  });

  it("[미규정] 답 집합 밖의 값이 allow로 접힌다 — 타입 층 하나만 그 문을 막는다", () => {
    // §7이 계약으로 든 것은 «만료가 거부»이고, 답 집합 밖의 문자열은 무응답이 아니므로
    // 그 계약이 직접 걸리지는 않는다. 그럼에도 축을 두는 이유는 **이 레포가 같은 자리에서
    // 반대로 하기 때문**이다 — `server.ts`는 바인드 호스트에 대해 타입을 우회해 들어온 값을
    // 생성에서 던지고(§4), `protocol.ts`는 밖에서 온 바이트를 런타임 층으로 다시 잰다.
    // 승인의 답만 타입 층 하나에 맡겨져 있고, 그 층을 지나면 deny가 아닌 것이 전부 allow가 된다.
    //
    // 판정 필요: 이 자리에 런타임 fail-closed를 둘 것인가.
    const registry = createApprovalRegistry({
      timeoutMs: 60_000,
      onSubscriberError: () => undefined,
    });
    void registry.ask({ display: "d" }, new AbortController().signal).catch(() => undefined);
    const settled = (
      registry as unknown as {
        settle(id: string, answer: string): { status: string; outcome?: { decision: string } };
      }
    ).settle("approval-1", "yes-please");
    expect({ decision: settled.outcome?.decision }).toEqual({ decision: "deny" });
  });

  it("구독자가 던져도 대기가 알려진 채 접힘 없이 사라지지 않는다", async () => {
    // §6.1은 `approval_settled`가 없으면 화면의 프롬프트가 남는다고 적고, 그것을 그 갈래를
    // 만든 이유로 든다. 아래 배치에서 구독자 하나가 `pending`을 이미 받았으므로, 그 뒤
    // `settled`가 안 오면 화면에 답할 수 없는 프롬프트가 남는다(`ARCHITECTURE.md` §2.6).
    //
    // **판정 완료(U-2 · 2026-08-26): 싱크 없는 구성을 API가 더는 허용하지 않는다.**
    // `onSubscriberError`가 선택적이 아니게 됐고(`approvals.ts` 선언부 — `stream.ts`의
    // `onConnectionError`·`methods.ts`의 `onRunError`와 같은 근거), 부분 전달로 접히는
    // 대기는 그 사실을 성한 구독자에게 알린 뒤에 사라진다. 이 축이 재는 것은 그 뒷문장이라
    // 판정 뒤에도 그대로 선다 — 싱크가 있어도 알리고 접는가는 별개 성질이다.
    const sunk: unknown[] = [];
    const registry = createApprovalRegistry({
      timeoutMs: 60_000,
      onSubscriberError: (error) => sunk.push(error),
    });
    const seen: ApprovalChange[] = [];
    registry.subscribe((change) => seen.push(change));
    registry.subscribe(() => {
      throw new Error("구독자 실패");
    });

    await registry.ask({ display: "d" }, new AbortController().signal).catch(() => undefined);

    // 삼켜지지 않았다 — 던진 것은 싱크로 갔다.
    expect(sunk.length).toBeGreaterThan(0);
    const opened = seen
      .filter((change) => change.kind === "pending")
      .map((change) => change.approval.id);
    const closed = seen.filter((change) => change.kind === "settled").map((change) => change.id);
    expect({ opened, closed }).toEqual({ opened, closed: opened });
  });
});

/* ======================================================================== *
 * QA-7 · §8 — 재접속이 스냅샷을 받고, 그 사이 런이 죽지 않는다
 * ======================================================================== */

describe("QA-7 · §8 — 실물 소켓에서의 재접속과 런 생존", () => {
  const servers: ServeServer[] = [];
  afterEach(async () => {
    for (const server of servers.splice(0)) await server.close().catch(() => undefined);
  });

  it("끊고 다시 붙으면 새 핸드셰이크 스냅샷을 받고, 그 사이 이벤트 방출이 안 던진다", async () => {
    // 트랜스크립트는 «런이 계속 돌았다»의 대역이다 — 첫 연결 뒤에 자란다.
    let messages: AgentMessage[] = [textMessage("m-1", "첫 턴")];
    const registry = createApprovalRegistry({
      timeoutMs: 60_000,
      onSubscriberError: () => undefined,
    });
    let deliver: AgentEventListener | undefined;

    const hub = createStreamHub({
      session: (): SessionSnapshot => ({ sessionId: "s-qa", messages }),
      // §6.1의 넷째 필드. 이 파일의 축은 값이 아니라 형태라 픽스처는 기본값이다.
      safety: { approvalMode: "manual", sandbox: "on" },
      approvals: registry,
      onConnectionError: () => undefined,
    });

    const server = createServeServer({
      host: LOOPBACK_HOST,
      port: 0,
      agent: {
        subscribe: (listener) => {
          deliver = listener;
          return () => {
            deliver = undefined;
          };
        },
      },
      openStream: (open) => hub.open(open),
      handleRequest: ({ response }) => {
        response.writeHead(404, {});
        response.end();
      },
    });
    servers.push(server);
    const address = await server.listen();
    const url = `http://${address.host}:${String(address.port)}${STREAM_PATH}?${PROTOCOL_VERSION_PARAM}=${PROTOCOL_VERSION}`;

    const firstFrameOf = (): Promise<Frame> =>
      new Promise<Frame>((resolve, reject) => {
        const req = httpGet(url, (res) => {
          res.setEncoding("utf8");
          let buffer = "";
          res.on("data", (chunk: string) => {
            buffer += chunk;
            const end = buffer.indexOf("\n\n");
            if (end < 0) return;
            const line = buffer
              .slice(0, end)
              .split("\n")
              .find((part) => part.startsWith("data: "));
            req.destroy(); // 여기서 연결을 끊는다 — §8의 «연결이 끊겨도»
            resolve(frameSchema.parse(JSON.parse((line ?? "").slice("data: ".length))));
          });
        });
        req.on("error", () => undefined);
        setTimeout(() => reject(new Error("스트림이 열리지 않았다")), 4000).unref();
      });

    const first = await firstFrameOf();
    expect(first).toMatchObject({ type: "state", kind: "handshake", seq: 1 });

    // 연결이 끊긴 뒤에도 코어의 방출 경로가 살아 있어야 한다 — 그것이 «런이 계속된다»다.
    await new Promise((resolve) => setTimeout(resolve, 30));
    await expect(deliver?.(anEvent(), new AbortController().signal)).resolves.toBeUndefined();

    // 런이 한 턴 더 돌았다.
    messages = [...messages, textMessage("m-2", "둘째 턴")];

    const second = await firstFrameOf();
    expect(second).toMatchObject({ type: "state", kind: "handshake", seq: 1 });
    const snapshot = (second as { snapshot: { transcript: { messages: AgentMessage[] } } })
      .snapshot;
    expect(snapshot.transcript.messages.map((message) => message.id)).toEqual(["m-1", "m-2"]);
  });
});

/* ======================================================================== *
 * QA-8 · §9.1 — 요청 문자열이 파일 경로에 닿지 않는다
 * ======================================================================== */

describe("QA-8 · §9.1 — traversal은 표현 불가능한 것이다", () => {
  it("`packages/serve`에 요청 URL을 `join`·`resolve`에 넘기는 코드가 존재하지 않는다", () => {
    // §9.1이 이 성질 자체를 계약으로 든다. 축은 파일 경로를 만드는 호출의 인자가 전부
    // 이 패키지 안의 값인가»이고, 요청에서 온 이름이 그 인자에 나타나면 위반이다.
    const requestNames = /\b(request|req|url|pathname|headers|body|params|query)\b/;
    for (const file of sourcesOf(SERVE_SRC)) {
      const text = stripComments(file.text);
      const calls = [
        ...text.matchAll(/\b(?:join|resolve|normalize|readFile|readFileSync)\s*\(([^)]*)\)/g),
      ];
      for (const call of calls) {
        const args = call[1] ?? "";
        expect({ file: file.name, call: call[0], tainted: requestNames.test(args) }).toEqual({
          file: file.name,
          call: call[0],
          tainted: false,
        });
      }
    }
  });

  it("역검증 — 이 소스 축이 실제로 위반을 잡는다", () => {
    // 일부러 위반을 넣은 합성 소스. 축이 이것을 못 잡으면 위 축의 초록은 «없다»가 아니라
    // «못 본다»다 — 그 상태가 이 레포가 이름 붙인 «막는다면서 못 막는» 형태다(§2.3).
    const requestNames = /\b(request|req|url|pathname|headers|body|params|query)\b/;
    const injected = `const file = join(ASSET_ROOT, request.url ?? "/");`;
    const calls = [
      ...injected.matchAll(/\b(?:join|resolve|normalize|readFile|readFileSync)\s*\(([^)]*)\)/g),
    ];
    expect(calls.length).toBeGreaterThan(0);
    expect(requestNames.test(calls[0]?.[1] ?? "")).toBe(true);
  });

  it("`packages/cli`의 serve 배선도 같다 — 이 층에서 새면 §9.1이 무의미해진다", () => {
    const text = stripComments(src("packages/cli/src/serve.ts"));
    expect(/\b(?:join|resolve)\s*\([^)]*\b(?:request|url|pathname)\b/.test(text)).toBe(false);
  });

  it("표에 없는 키는 값이 아니라 부재다 — 상속 속성도 라우트가 안 된다", async () => {
    const { lookupAsset } = await import("../src/assets.ts");
    for (const key of [
      "/../../etc/passwd",
      "/client/../src/server.ts",
      "/constructor",
      "/__proto__",
      "/client/",
      "/client",
      "",
    ]) {
      expect({ key, entry: lookupAsset(key) }).toEqual({ key, entry: undefined });
    }
  });

  it("역검증 — 표에 있는 키는 열린다", async () => {
    const { lookupAsset } = await import("../src/assets.ts");
    for (const key of Object.keys(ASSET_MANIFEST)) {
      expect(lookupAsset(key)).toBeDefined();
    }
  });
});

/* ======================================================================== *
 * QA-9 · §10 — 절차가 실재하고 정지 상한의 관계를 든다
 * ======================================================================== */

describe("QA-9 · §10 — 상주 절차의 착지", () => {
  const distribution = doc("DISTRIBUTION.md");

  it("§10이 지목한 절차가 `DISTRIBUTION.md` §11로 실재한다", () => {
    expect(/^## 11\. /m.test(distribution)).toBe(true);
  });

  it("그 절이 정지 상한의 관계를 든다 — 우리 유예가 systemd의 상한보다 작아야 한다", () => {
    const section = distribution.slice(distribution.indexOf("## 11."));
    expect(section).toContain("TimeoutStopSec");
    expect(/유예[^\n]*보다[^\n]*크게|보다 넉넉히 크게/.test(section)).toBe(true);
    expect(section).toContain("SIGKILL");
  });

  it("그 절이 유예 값을 옮겨 적지 않는다 — 같은 수가 두 자리에 살면 한쪽이 낡는다", () => {
    const section = distribution.slice(distribution.indexOf("## 11."));
    const graceMs = /DEFAULT_GRACE_MS\s*=\s*([0-9_]+)/.exec(src("packages/serve/src/shutdown.ts"));
    expect(graceMs).not.toBeNull();
    const seconds = String(Number((graceMs?.[1] ?? "0").replace(/_/g, "")) / 1000);
    expect(section.includes(`TimeoutStopSec=${seconds}`)).toBe(false);
  });

  it("§10이 유닛 파일을 자산으로 반입하지 않는다 — 레포에 `.service`가 0건이다", () => {
    const out = execFileSync("git", ["ls-files", "*.service"], {
      cwd: REPO,
      encoding: "utf8",
    }).trim();
    expect(out).toBe("");
  });
});

/* ======================================================================== *
 * QA-10 · §6.1 — 스냅샷 상한이 «조용한 재접속 고리»를 성립 불가능하게 하는가
 * ======================================================================== */

describe("QA-10 · §6.1 — 스냅샷 상한과 §8 버퍼 상한의 관계", () => {
  it("잔여 경로가 실재하고, 정본이 그 사실을 든다 (2026-08-26 §6.1 개정)", () => {
    // §6.1은 상한을 두는 결정적 근거로, 스냅샷이 §8의 느린 소비자 상한을 넘으면
    // 열자마자 닫히고 재접속이 같은 스냅샷을 다시 보내는 고리가 생긴다는 것을 든다.
    // 그리고 그 상한을 그 고리를 성립할 수 없게 하는 수단이라고 적는다.
    //
    // 그런데 §6.1은 메시지 하나의 내용 가공과 바이트 캡을 둘 다 근거를 대어 뺐으므로
    // 꼬리 N은 **개수** 상한이고 메시지 크기는 무한하다. 구현이 고른 §8의 버퍼 상한은
    // **바이트**다([미규정] — §8은 무엇을 세는지 정하지 않는다). 두 상한의 단위가 다르면
    // N개가 상한 안에 든다는 것이 보장되지 않는다.
    //
    // 2026-08-26 — 이 축이 그 사실을 반증으로 냈고, 정본이 주장을 좁히는 쪽으로 개정됐다.
    // 그래서 이 축이 재는 것이 둘로 바뀐다: 잔여 경로가 실제로 있다는 것과, 정본이 그것을
    // 적고 있다는 것. 뒤쪽이 이 축의 값이다 — 누가 주장을 다시 성립 불가능 쪽으로
    // 넓히면서 단위를 안 맞추면 여기가 붉어진다.
    //
    // 아래는 정본이 그린 그 시나리오 그대로다: 기본 상한 둘을 그대로 쓰고, 꼬리 N 안에
    // 드는 트랜스크립트가 버퍼 상한을 넘는다.
    const bulky = Array.from({ length: 200 }, (_, index) =>
      textMessage(`m-${String(index)}`, "가".repeat(40_000)),
    );
    const dropped: unknown[] = [];
    const hub = createStreamHub({
      session: (): SessionSnapshot => ({ sessionId: "s", messages: bulky }),
      // §6.1의 넷째 필드. 이 파일의 축은 값이 아니라 형태라 픽스처는 기본값이다.
      safety: { approvalMode: "manual", sandbox: "on" },
      approvals: createApprovalRegistry({ onSubscriberError: () => undefined }),
      onConnectionError: (error) => dropped.push(error),
    });

    const response = new ResponseDouble();
    response.stalled = true; // §8이 말하는 느린 소비자
    hub.open({ response, events: new BusDouble() });

    // ① 잔여 경로는 실재한다 — 꼬리 N 안에 드는 트랜스크립트가 버퍼 상한을 넘겨 끊긴다.
    expect({ droppedOnHandshake: response.destroyed }).toEqual({ droppedOnHandshake: true });

    // ② 정본이 그 사실을 든다. 주장이 다시 넓어지는 것을 막는 가드다.
    const webui = doc("WEB-UI.md");
    const section = webui.slice(
      webui.indexOf("#### 스냅샷의 상한"),
      webui.indexOf("#### 레퍼런스 대비"),
    );
    expect(section).not.toContain("그 고리를 성립할 수 없게 하는 수단이다");
    expect(section).toContain("두 상한의 단위가 다르다");
    expect(section).toContain("재도입 트리거");
  });

  it("근거 — 잘림은 표현되지만 그 창이 버퍼 상한 밑이라는 보장은 없다", () => {
    // 잘림 표현 자체는 계약대로 선다(이 축은 통과해야 한다).
    const response = new ResponseDouble();
    const hub = createStreamHub({
      session: (): SessionSnapshot => ({
        sessionId: "s",
        messages: Array.from({ length: 5 }, (_, i) => textMessage(`m-${String(i)}`, "x")),
      }),
      // §6.1의 넷째 필드. 이 파일의 축은 값이 아니라 형태라 픽스처는 기본값이다.
      safety: { approvalMode: "manual", sandbox: "on" },
      approvals: createApprovalRegistry({ onSubscriberError: () => undefined }),
      transcriptTailLimit: 2,
      onConnectionError: () => undefined,
    });
    hub.open({ response, events: new BusDouble() });
    const snapshot = (response.frames()[0] as { snapshot: { transcript: unknown } }).snapshot;
    expect(snapshot.transcript).toEqual({
      complete: false,
      messages: [textMessage("m-3", "x"), textMessage("m-4", "x")],
      omitted: 3,
    });
  });
});

/* ======================================================================== *
 * QA-11 · §6 말미·§9.3 — 스트림을 여는 이름을 누가 드는가
 * ======================================================================== */

describe("QA-11 · §6 말미·§9.3 — 라우트와 버전 파라미터의 소유", () => {
  it("[문서 부정확] 브라우저 모듈이 라우트도 버전 파라미터도 들지 않는다", () => {
    // §6 말미는 버전을 스트림을 여는 GET 요청의 쿼리 문자열에 싣기로 정하고, 이름은
    // 세부이되 양쪽이 같은 이름을 쓰는 것은 §9.3이 프로토콜 행동을 이 레포 소유로 둔
    // 결과라고 적는다. 그런데 실물에서 브라우저 쪽 이름은 이 레포에 없다 —
    // `client/stream.js`가 URL 하나를 인자로 받고, 그 URL을 짓는 것은 화면(§9의 외부
    // 생성물)이다. 즉 양쪽이 같은 이름을 쓰는 성질이 배선에서 서지 않는다.
    const clientText = readdirSync(CLIENT_DIR)
      .filter((name) => name.endsWith(".js"))
      .map((name) => stripComments(readFileSync(CLIENT_DIR + name, "utf8")))
      .join("\n");

    expect({
      holdsRoute: clientText.includes(STREAM_PATH),
      holdsVersionParam: new RegExp(`["'\`][?&]?${PROTOCOL_VERSION_PARAM}=`).test(clientText),
    }).toEqual({ holdsRoute: true, holdsVersionParam: true });
  });

  it("근거 — 서버 쪽은 두 이름을 상수로 든다", () => {
    expect(STREAM_PATH.startsWith("/")).toBe(true);
    expect(PROTOCOL_VERSION_PARAM.length).toBeGreaterThan(0);
  });

  it("§9.3 계약 셋은 브라우저 모듈에 코드로 산다 — 이 자리는 서 있다", () => {
    // ①이 잡는 이름은 2026-08-26에 옮겼다. 재는 성질은 그대로 — 계약 ①이 코드로 사는가다.
    // 바뀐 것은 그 계약이 사는 자리다. §9.3은 멈추는 사유를 하나로 적고 있었고 같은 날
    // 그 자리를 §8.1로 넘겼다 — 처분은 셋(그대로 둔다·다시 연다·멈춘다)이고 멈추는 사유는
    // 둘(종료 고지·계약 파손)이며, 그 표를 §8.1이 든다. 그래서 ①의 증거는 재접속 허용
    // 여부를 답하던 불리언 술어가 아니라 §8.1이 타입 이름으로 든 연결의 처분, 곧 그 처분을
    // 답하는 순수 함수다. §8.1의 계약 ②가 그 답의 자리를 순수 함수 하나로 못박는다.
    const text = readFileSync(`${CLIENT_DIR}protocol.js`, "utf8");
    expect(text).toContain("disposition"); // ① 고지 뒤 재접속 억제 — §8.1의 처분 표
    expect(text).toContain("lastSeq"); // ② 한 수열의 갭 판정
    expect(text).toContain("never"); // ③ 판별자 소진 검사
  });
});

/* ======================================================================== *
 * QA-12 · §11·§12 — 미분류 기본 거부와 종료의 부재
 * ======================================================================== */

describe("QA-12 · §11·§12 — 표에 없으면 닫힌다", () => {
  const servers: ServeServer[] = [];
  afterEach(async () => {
    for (const server of servers.splice(0)) await server.close().catch(() => undefined);
  });

  it("표에 없는 이름이 조용히 통과하지 않는다 — 응답이 정확히 하나이고 ok가 거짓이다", async () => {
    const { createDispatcher, createMethodTable } = await import("../src/methods.ts");
    const dispatch = createDispatcher(
      createMethodTable({
        run: { prompt: async () => undefined, steer: () => undefined, abort: () => undefined },
        approvals: { settle: () => ({ status: "unknown" }) },
        transcript: { read: async () => [] },
        onRunError: () => undefined,
      }),
    );
    for (const method of [
      "shutdown",
      "serve.stop",
      "process.exit",
      "__proto__",
      "constructor",
      "",
    ]) {
      const frame = await dispatch({ type: "req", id: "x", method });
      expect({ method, ok: frame.ok }).toEqual({ method, ok: false });
    }
  });

  it("역검증 — 표에 있는 다섯은 열린다. 위 축이 «표가 비어도 통과»가 아니다", async () => {
    const { createDispatcher, createMethodTable, METHOD_NAMES } = await import("../src/methods.ts");
    const dispatch = createDispatcher(
      createMethodTable({
        run: { prompt: async () => undefined, steer: () => undefined, abort: () => undefined },
        approvals: {
          settle: () => ({
            status: "settled",
            outcome: { decision: "deny", resolvedBy: "client" },
          }),
        },
        transcript: { read: async () => [textMessage("m-1", "x")] },
        onRunError: () => undefined,
      }),
    );
    const params: Record<string, unknown> = {
      "run.prompt": { text: "안녕" },
      "run.steer": { text: "잠깐" },
      "run.abort": {},
      "approval.settle": { id: "approval-1", answer: "deny" },
      "session.history": { before: "m-1" },
    };
    for (const method of METHOD_NAMES) {
      const frame = await dispatch({ type: "req", id: "x", method, params: params[method] });
      expect({ method, ok: frame.ok }).toEqual({ method, ok: true });
    }
  });

  it("종료를 뜻하는 이름이 표에 0건이다(§3.2 — 미결이 아니라 판정이다)", async () => {
    const { METHOD_NAMES } = await import("../src/methods.ts");
    expect(
      METHOD_NAMES.filter((name) => /shut|stop|exit|quit|kill|terminate|drain/i.test(name)),
    ).toEqual([]);
  });

  it("§12가 적은 다섯과 실물의 이름이 갈리지 않는다", async () => {
    const { METHOD_NAMES } = await import("../src/methods.ts");
    const section = doc("WEB-UI.md");
    for (const name of METHOD_NAMES) {
      expect({ name, inDoc: section.includes(`\`${name}\``) }).toEqual({ name, inDoc: true });
    }
  });
});
