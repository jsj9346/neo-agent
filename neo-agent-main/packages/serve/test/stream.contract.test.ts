/**
 * 스트림 — 계약 검증.
 *
 * 기대값의 출처: `docs/WEB-UI.md` §6(첫 프레임은 반드시 핸드셰이크다)·§6.1(seq가 하나의
 * 카운터 · 핸드셰이크는 seq 1 · state 푸시 넷 · 스냅샷의 꼬리 N과 잘림의 두 갈래)·§7(대기
 * 목록은 핸드셰이크 응답에 실린다)·§8(이벤트를 재생하지 않는다 · 느린 소비자를 무한정
 * 버퍼링하지 않는다 · 클라이언트 연결이 끊겨도 진행 중인 런은 계속된다)·§3.2(2단계 고지와
 * 6단계 닫기를 가른다 · 승인의 종료 사유).
 *
 * ## 무엇을 실물로 재는가
 *
 * 런 생존 축은 **실제 소켓**을 쓴다. 대역만으로 재면 그 축이 증명하는 것은 우리가 만든
 * 대역이 던지지 않는다는 것뿐이고, 실제로 끊긴 소켓에 쓸 때 노드가 무엇을 하는지는 여전히
 * 안 재기 때문이다. 나머지 축은 응답 대역으로 잰다 — 배압은 소켓이 안 빠지는 상황을
 * 만들어야 재지는데 실물로는 그 상황이 타이밍에 달려 재현이 흔들린다.
 *
 * ## 이 파일이 재지 않는 것
 *
 * - **상한 둘의 값** — §12가 꼬리 N과 수치 일반을 세부로 두었다. 아래는 주입한 상한으로만
 *   재고 기본 상수의 값을 단정하지 않는다. 단정하면 그 순간 세부가 계약이 된다.
 * - **바인드와 버전 관문** — §4·§6이고 `server.ts`의 계약이다. 아래 실물 축은 그 관문을
 *   지나기 위해 정본 버전을 실을 뿐 그 관문 자체를 재지 않는다.
 * - **승인 레지스트리의 내부 규칙** — 만료가 거부라는 것과 abort의 처리는 §7이고
 *   `approvals.ts`의 계약이다. 여기서 재는 것은 그 변화가 프레임으로 나가는가뿐이다.
 * - **종료 8단계의 순서** — §3.2이고 `shutdown.ts`의 계약이다. 아래는 그 시퀀스가 쓰는
 *   부품 둘이 각각 고지만 하는지, 닫기만 하는지까지만 본다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의 대조
 * 축(`U-1`·`D-1`·`D-2`)이 걸린다. 그래서 이 주석은 인용부호를 쓰지 않고 전부 서술로 적는다 —
 * 갈리면 벗기라는 그 절의 처방을 자리 전체에 미리 적용한 형태다. 문서를 줄번호로 가리키는
 * 자리는 이 규약의 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { get as httpGet } from "node:http";
import type { AgentEvent, AgentEventListener, AgentMessage, Unsubscribe } from "@neo-agent/core";
import { afterEach, describe, expect, it } from "vitest";
import { createApprovalRegistry } from "../src/approvals.ts";
import type { Frame, ServerStateFrame } from "../src/protocol.ts";
import { frameSchema } from "../src/protocol.ts";
import type { AgentEventBus, ServeServer } from "../src/server.ts";
import {
  createServeServer,
  LOOPBACK_HOST,
  PROTOCOL_VERSION,
  PROTOCOL_VERSION_PARAM,
  STREAM_PATH,
} from "../src/server.ts";
import type {
  SessionSnapshot,
  StreamHub,
  StreamHubOptions,
  StreamResponse,
} from "../src/stream.ts";
import { createStreamHub } from "../src/stream.ts";

/* ------------------------------------------------------------------------ *
 * 도구 — 응답 대역·이벤트 버스 대역·프레임 읽기
 * ------------------------------------------------------------------------ */

/**
 * 응답 대역. `StreamResponse`가 요구하는 것만 든다.
 *
 * 소켓이 안 빠지는 상황은 `stalled`로 만든다 — 켜면 쓴 만큼 미전송 바이트가 그대로 쌓이고,
 * 그것이 §8이 말하는 느린 소비자다.
 */
class ResponseDouble implements StreamResponse {
  head: { readonly status: number; readonly headers: Readonly<Record<string, string>> } | undefined;
  readonly chunks: string[] = [];
  ended = false;
  destroyed = false;
  writableLength = 0;
  stalled = false;
  /** 켜면 쓰기가 던진다 — 상대가 사라진 소켓의 모사다 */
  writeThrows = false;

  readonly #closeListeners: (() => void)[] = [];

  writeHead(status: number, headers: Readonly<Record<string, string>>): unknown {
    this.head = { status, headers: { ...headers } };
    return this;
  }

  write(chunk: string): unknown {
    if (this.writeThrows) throw new Error("소켓이 사라졌다.");
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
    this.emitClose();
    return this;
  }

  on(_event: "close", listener: () => void): unknown {
    this.#closeListeners.push(listener);
    return this;
  }

  emitClose(): void {
    for (const listener of [...this.#closeListeners]) listener();
  }
}

/**
 * 이벤트 버스 대역. `server.ts`의 버스와 같은 표면이고, 방출은 그쪽처럼 순차 await한다 —
 * 리스너 예외를 삼키지 않는 성질까지 같아야 런 생존 축이 실제 배선을 잰다.
 */
class BusDouble implements AgentEventBus {
  readonly #listeners = new Set<AgentEventListener>();

  subscribe(listener: AgentEventListener): Unsubscribe {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  get listenerCount(): number {
    return this.#listeners.size;
  }

  async deliver(event: AgentEvent): Promise<void> {
    const signal = new AbortController().signal;
    for (const listener of [...this.#listeners]) {
      if (!this.#listeners.has(listener)) continue;
      await listener(event, signal);
    }
  }
}

const userMessage = (id: string): AgentMessage => ({
  id,
  role: "user",
  content: [{ type: "text", text: id }],
  timestamp: 0,
});

const turnStart: AgentEvent = { type: "turn_start" };

/** SSE 바이트를 프레임 목록으로 읽는다. 스키마를 통과시켜 봉투가 정본과 맞는지도 함께 잰다 */
function readFrames(chunks: readonly string[]): Frame[] {
  return chunks.map((chunk) => {
    const match = /^id: (\d+)\ndata: (.*)\n\n$/s.exec(chunk);
    if (match === null) throw new Error(`SSE 형식이 아니다 — ${chunk}`);
    const frame = frameSchema.parse(JSON.parse(match[2] ?? ""));
    if (String(readSeq(frame)) !== match[1]) {
      throw new Error(`id 줄과 프레임의 seq가 갈렸다 — ${chunk}`);
    }
    return frame;
  });
}

function readSeq(frame: Frame): number {
  if (frame.type === "event" || frame.type === "state") return frame.seq;
  throw new Error(`푸시 프레임이 아니다 — ${frame.type}`);
}

function stateFrames(frames: readonly Frame[]): ServerStateFrame[] {
  return frames.filter((frame): frame is ServerStateFrame => frame.type === "state");
}

function firstHandshake(
  frames: readonly Frame[],
): Extract<ServerStateFrame, { kind: "handshake" }> {
  const first = frames[0];
  if (first === undefined || first.type !== "state" || first.kind !== "handshake") {
    throw new Error("첫 프레임이 핸드셰이크가 아니다.");
  }
  return first;
}

type Harness = {
  readonly hub: StreamHub;
  readonly bus: BusDouble;
  readonly registry: ReturnType<typeof createApprovalRegistry>;
  readonly errors: unknown[];
  /** 세션 상태. 테스트가 갈아 끼워 런의 진행을 흉내 낸다 */
  session: SessionSnapshot;
  connect(): ResponseDouble;
};

/** 안전 사실의 기본 픽스처(§6.1). 값을 재는 축은 자기 것을 주입한다 */
const DEFAULT_SAFETY: StreamHubOptions["safety"] = { approvalMode: "manual", sandbox: "on" };

function harness(
  options: {
    readonly messages?: readonly AgentMessage[];
    readonly transcriptTailLimit?: number;
    readonly maxBufferedBytes?: number;
    readonly approvalTimeoutMs?: number;
    /** 값으로 받는다 — 함수가 아니다(§6.1의 «기동 시 동결»이 시그니처에 서 있다) */
    readonly safety?: StreamHubOptions["safety"];
  } = {},
): Harness {
  const errors: unknown[] = [];
  const bus = new BusDouble();
  const registry = createApprovalRegistry({
    ...(options.approvalTimeoutMs === undefined ? {} : { timeoutMs: options.approvalTimeoutMs }),
    // 구독자 예외가 승인 접힘을 깨는지는 아래 런 생존 축이 따로 재므로, 그 축 밖에서는
    // 예외를 모아만 둔다.
    onSubscriberError: (error) => {
      errors.push(error);
    },
  });
  const state = {
    session: { sessionId: "session-1", messages: options.messages ?? [] } as SessionSnapshot,
  };

  const hub = createStreamHub({
    session: () => state.session,
    safety: options.safety ?? DEFAULT_SAFETY,
    approvals: registry,
    ...(options.transcriptTailLimit === undefined
      ? {}
      : { transcriptTailLimit: options.transcriptTailLimit }),
    ...(options.maxBufferedBytes === undefined
      ? {}
      : { maxBufferedBytes: options.maxBufferedBytes }),
    onConnectionError: (error) => {
      errors.push(error);
    },
  });

  return {
    hub,
    bus,
    registry,
    errors,
    get session(): SessionSnapshot {
      return state.session;
    },
    set session(next: SessionSnapshot) {
      state.session = next;
    },
    connect(): ResponseDouble {
      const response = new ResponseDouble();
      hub.open({ response, events: bus });
      return response;
    },
  };
}

/* ------------------------------------------------------------------------ *
 * 핸드셰이크 — §6·§6.1·§7
 * ------------------------------------------------------------------------ */

describe("WEB-UI.md §6·§6.1 — 첫 프레임이 핸드셰이크이고 seq가 1이다", () => {
  it("적합 — 첫 푸시가 handshake이고 스냅샷을 싣는다", () => {
    const test = harness({ messages: [userMessage("m1")] });
    const response = test.connect();

    const frames = readFrames(response.chunks);
    const handshake = firstHandshake(frames);
    expect(handshake.seq).toBe(1);
    expect(handshake.snapshot.sessionId).toBe("session-1");
    expect(handshake.snapshot.transcript.messages).toHaveLength(1);
    expect(handshake.snapshot.pendingApprovals).toEqual([]);
  });

  it("적합 — 응답 헤더가 스트림이고 캐시를 두지 않는다", () => {
    const test = harness();
    const response = test.connect();

    expect(response.head?.status).toBe(200);
    expect(response.head?.headers["content-type"]).toContain("text/event-stream");
    expect(response.head?.headers["cache-control"]).toBe("no-store");
  });

  it("적합 — 대기 중인 승인이 핸드셰이크에 실린다 (§7)", async () => {
    const test = harness();
    const pending = test.registry.ask({ display: "rm -rf" }, new AbortController().signal);
    void pending.catch(() => undefined);

    const response = test.connect();
    const handshake = firstHandshake(readFrames(response.chunks));
    expect(handshake.snapshot.pendingApprovals.map((approval) => approval.display)).toEqual([
      "rm -rf",
    ]);

    test.registry.denyAllForShutdown();
    await pending;
  });

  it("적합 — 주입한 안전 사실이 핸드셰이크에 그대로 실린다 (§6.1 · §9.4 결정 10)", () => {
    const test = harness({ safety: { approvalMode: "off", sandbox: "off" } });
    const handshake = firstHandshake(readFrames(test.connect().chunks));
    expect(handshake.snapshot.safety).toEqual({ approvalMode: "off", sandbox: "off" });
  });

  it("적합 — 두 번 연 스냅샷의 안전 사실이 같다. 기동 시 동결이다 (§6.1)", () => {
    const test = harness({ safety: { approvalMode: "off", sandbox: "on" } });
    const first = firstHandshake(readFrames(test.connect().chunks));
    // 사이에 세션이 갈아 끼워져도 이 필드는 세션에서 오지 않는다 — 그래서 안 움직인다.
    test.session = { sessionId: "session-2", messages: [userMessage("m9")] };
    const second = firstHandshake(readFrames(test.connect().chunks));

    expect(second.snapshot.sessionId).toBe("session-2");
    expect(second.snapshot.safety).toEqual(first.snapshot.safety);
  });

  // 위 축이 재는 것은 «오늘 같다»이고, 이 줄이 재는 것은 «다를 수가 없다»다. 허브 옵션이
  // 함수를 받으면 연결마다 다른 값을 돌려주는 소스가 표현 가능해지고, 그때 동결을 지는 것은
  // 주석 한 줄뿐이다(§6.1). 판정자는 `tsc --noEmit`이다.
  it("적합 — 안전 사실은 값으로만 받는다. 함수 소스가 표현 불가능하다 (§6.1)", () => {
    // 이 소스의 타입은 허브 옵션에서 파생되지 않는다 — 파생시키면 옵션이 함수가 되는 날
    // 이 선언 자체가 먼저 깨져서 아래 단정이 무엇 때문에 붉었는지 구별되지 않는다.
    const source = () => ({ approvalMode: "off", sandbox: "off" }) as const;
    // @ts-expect-error §6.1 — 기동 시 동결이므로 연결마다 읽는 소스를 받지 않는다.
    // 옵션이 함수를 받게 되는 순간 이 줄이 «쓰이지 않은 ts-expect-error»로 붉는다.
    const bad: StreamHubOptions["safety"] = source;
    void bad;
    expect(typeof source).toBe("function");
  });

  it("적합 — 이벤트를 재생하지 않는다. 두 번째 연결의 seq도 1부터다 (§8)", async () => {
    const test = harness();
    const first = test.connect();
    await test.bus.deliver(turnStart);

    const second = test.connect();
    expect(readFrames(second.chunks).map(readSeq)).toEqual([1]);
    // 첫 연결은 자기 수열을 그대로 이어 간다 — 두 연결이 카운터를 공유하지 않는다.
    expect(readFrames(first.chunks).map(readSeq)).toEqual([1, 2]);
  });
});

/* ------------------------------------------------------------------------ *
 * 트랜스크립트 상한 — §6.1
 * ------------------------------------------------------------------------ */

describe("WEB-UI.md §6.1 — 스냅샷은 꼬리 N이고 잘림이 값에 나타난다", () => {
  it("적합 — N보다 길면 complete가 거짓이고 omitted가 실제 생략 수다", () => {
    const messages = [1, 2, 3, 4, 5].map((n) => userMessage(`m${String(n)}`));
    const test = harness({ messages, transcriptTailLimit: 3 });

    const transcript = firstHandshake(readFrames(test.connect().chunks)).snapshot.transcript;
    expect(transcript.complete).toBe(false);
    if (transcript.complete) throw new Error("잘린 갈래가 아니다.");
    expect(transcript.omitted).toBe(2);
    // 꼬리다 — 남는 것은 뒤쪽 셋이고 앞쪽 둘이 생략된다.
    expect(transcript.messages.map((message) => message.id)).toEqual(["m3", "m4", "m5"]);
  });

  it("적합 — N 이하면 complete가 참이고 omitted 필드가 아예 없다", () => {
    const messages = [1, 2, 3].map((n) => userMessage(`m${String(n)}`));
    const test = harness({ messages, transcriptTailLimit: 3 });

    const response = test.connect();
    const transcript = firstHandshake(readFrames(response.chunks)).snapshot.transcript;
    expect(transcript.complete).toBe(true);
    // 키가 없는 것이 계약이다 — undefined가 실린 것과 다르다. 와이어 바이트에서 잰다.
    expect(response.chunks[0]).not.toContain("omitted");
    expect(Object.hasOwn(transcript, "omitted")).toBe(false);
  });

  it("적합 — 상한이 없는 상태가 표현되지 않는다", () => {
    for (const bad of [0, -1, 1.5, Number.POSITIVE_INFINITY, Number.NaN]) {
      expect(() =>
        createStreamHub({
          session: () => ({ sessionId: "s", messages: [] }),
          safety: DEFAULT_SAFETY,
          approvals: { list: () => [], subscribe: () => () => undefined },
          transcriptTailLimit: bad,
          onConnectionError: () => undefined,
        }),
      ).toThrow(/꼬리 상한/);
    }
  });
});

/* ------------------------------------------------------------------------ *
 * state 푸시 넷과 단일 카운터 — §6.1·§3.2
 * ------------------------------------------------------------------------ */

describe("WEB-UI.md §6.1 — state 푸시 넷이 전부 나가고 seq는 한 수열이다", () => {
  it("적합 — 런 도중 승인이 뜨면 붙어 있는 연결이 approval_pending을 받는다", async () => {
    const test = harness();
    const response = test.connect();

    const pending = test.registry.ask({ display: "git push" }, new AbortController().signal);
    void pending.catch(() => undefined);

    const frames = stateFrames(readFrames(response.chunks));
    expect(frames.map((frame) => frame.kind)).toEqual(["handshake", "approval_pending"]);
    const announced = frames[1];
    if (announced?.kind !== "approval_pending") throw new Error("approval_pending이 아니다.");
    // 표시 문면은 가공 없이 전달한다(§7) — 바이트 단위 동등이다.
    expect(announced.approval.display).toBe("git push");

    test.registry.denyAllForShutdown();
    await pending;
  });

  it("적합 — 다른 경로로 해소되면 approval_settled가 나가고 사유가 실제 사유다", async () => {
    const test = harness();
    const response = test.connect();

    const pending = test.registry.ask({ display: "묻는다" }, new AbortController().signal);
    void pending.catch(() => undefined);
    const listed = test.registry.list();
    const id = listed[0]?.id ?? "";
    test.registry.settle(id, "deny");
    await pending;

    const settled = stateFrames(readFrames(response.chunks)).at(-1);
    if (settled?.kind !== "approval_settled") throw new Error("approval_settled가 아니다.");
    expect(settled.id).toBe(id);
    expect(settled.outcome).toEqual({ decision: "deny", resolvedBy: "client" });
  });

  it("적합 — 종료로 접힌 승인의 사유가 shutdown이고 timeout으로 접히지 않는다 (§3.2)", async () => {
    const test = harness();
    const response = test.connect();

    const pending = test.registry.ask({ display: "묻는다" }, new AbortController().signal);
    void pending.catch(() => undefined);
    test.registry.denyAllForShutdown();
    await pending;

    const settled = stateFrames(readFrames(response.chunks)).at(-1);
    if (settled?.kind !== "approval_settled") throw new Error("approval_settled가 아니다.");
    expect(settled.outcome.resolvedBy).toBe("shutdown");
  });

  it("적합 — 만료로 접힌 승인의 사유가 timeout이다 (§7)", async () => {
    const test = harness({ approvalTimeoutMs: 5 });
    const response = test.connect();

    const answer = await test.registry.ask({ display: "묻는다" }, new AbortController().signal);
    expect(answer).toBe("deny");

    const settled = stateFrames(readFrames(response.chunks)).at(-1);
    if (settled?.kind !== "approval_settled") throw new Error("approval_settled가 아니다.");
    expect(settled.outcome).toEqual({ decision: "deny", resolvedBy: "timeout" });
  });

  it("적합 — 종료 고지가 나가고 페이로드가 없다 (§3.2 2단계)", () => {
    const test = harness();
    const response = test.connect();

    test.hub.announceShutdown();

    const last = stateFrames(readFrames(response.chunks)).at(-1);
    if (last?.kind !== "shutdown") throw new Error("shutdown이 아니다.");
    // 스트림은 연 채로 둔다 — 고지와 닫기의 시점이 다른 것이 그 절의 판정이다.
    expect(response.ended).toBe(false);
    expect(test.hub.connectionCount).toBe(1);

    test.hub.closeAll();
    expect(response.ended).toBe(true);
    expect(test.hub.connectionCount).toBe(0);
  });

  it("적합 — event와 state가 한 카운터를 나눠 쓴다", async () => {
    const test = harness();
    const response = test.connect();

    await test.bus.deliver(turnStart);
    const pending = test.registry.ask({ display: "묻는다" }, new AbortController().signal);
    void pending.catch(() => undefined);
    await test.bus.deliver(turnStart);
    test.registry.denyAllForShutdown();
    await pending;

    const frames = readFrames(response.chunks);
    expect(frames.map(readSeq)).toEqual([1, 2, 3, 4, 5]);
    expect(frames.map((frame) => frame.type)).toEqual([
      "state",
      "event",
      "state",
      "event",
      "state",
    ]);
  });
});

/* ------------------------------------------------------------------------ *
 * 배압 — §8
 * ------------------------------------------------------------------------ */

describe("WEB-UI.md §8 — 느린 소비자를 무한정 버퍼링하지 않는다", () => {
  it("적합 — 상한을 넘으면 연결이 끊기고 그 사실이 남는다", async () => {
    const test = harness({ maxBufferedBytes: 200 });
    const response = test.connect();
    response.stalled = true;

    let delivered = 0;
    while (!response.destroyed && delivered < 100) {
      await test.bus.deliver(turnStart);
      delivered += 1;
    }

    expect(response.destroyed).toBe(true);
    expect(test.hub.connectionCount).toBe(0);
    // 상한을 넘긴 사실이 어디에도 안 남으면 그 연결이 사라진 이유를 아무도 못 안다.
    expect(test.errors.some((error) => String(error).includes("상한"))).toBe(true);

    // 끊긴 뒤에는 더 쌓이지 않는다 — 버퍼링을 계속하면 상한이 상한이 아니다.
    const after = response.chunks.length;
    await test.bus.deliver(turnStart);
    expect(response.chunks).toHaveLength(after);
  });

  it("역검증 — 상한이 넉넉하면 같은 양을 보내도 끊기지 않는다", async () => {
    const test = harness({ maxBufferedBytes: 10_000_000 });
    const response = test.connect();
    response.stalled = true;

    for (let n = 0; n < 100; n += 1) await test.bus.deliver(turnStart);

    expect(response.destroyed).toBe(false);
    expect(test.hub.connectionCount).toBe(1);
    expect(readFrames(response.chunks)).toHaveLength(101);
  });

  it("적합 — 상한이 없는 상태가 표현되지 않는다", () => {
    for (const bad of [0, -1, Number.POSITIVE_INFINITY, Number.NaN]) {
      expect(() =>
        createStreamHub({
          session: () => ({ sessionId: "s", messages: [] }),
          safety: DEFAULT_SAFETY,
          approvals: { list: () => [], subscribe: () => () => undefined },
          maxBufferedBytes: bad,
          onConnectionError: () => undefined,
        }),
      ).toThrow(/배압 상한/);
    }
  });
});

/* ------------------------------------------------------------------------ *
 * 런 생존 — §8
 * ------------------------------------------------------------------------ */

describe("WEB-UI.md §8 — 연결이 끊겨도 진행 중인 런은 계속된다", () => {
  it("적합 — 죽은 소켓의 쓰기 실패가 방출 경로로 올라가지 않는다", async () => {
    const test = harness();
    const dead = test.connect();
    const alive = test.connect();
    dead.writeThrows = true;

    await expect(test.bus.deliver(turnStart)).resolves.toBeUndefined();

    // 죽은 연결만 사라지고 산 연결은 그대로 받는다.
    expect(test.hub.connectionCount).toBe(1);
    expect(test.errors).toHaveLength(1);
    expect(readFrames(alive.chunks).map(readSeq)).toEqual([1, 2]);
  });

  it("적합 — 승인 구독자 예외가 승인 접힘을 깨지 않는다", async () => {
    const test = harness();
    const dead = test.connect();
    dead.writeThrows = true;

    const pending = test.registry.ask({ display: "묻는다" }, new AbortController().signal);
    // 접힘은 구독자와 무관하게 성립한다 — 여기서 던지면 대기가 영영 안 풀린다.
    test.registry.denyAllForShutdown();
    await expect(pending).resolves.toBe("deny");
  });

  it("적합 — 상대가 끊으면 구독이 걷힌다. 남은 리스너가 0이다", () => {
    const test = harness();
    const response = test.connect();
    expect(test.bus.listenerCount).toBe(1);

    response.emitClose();

    expect(test.bus.listenerCount).toBe(0);
    expect(test.hub.connectionCount).toBe(0);
  });
});

/* ------------------------------------------------------------------------ *
 * 런 생존 — 실물 소켓
 * ------------------------------------------------------------------------ */

const started: ServeServer[] = [];

afterEach(async () => {
  while (started.length > 0) {
    const server = started.pop();
    if (server !== undefined) await server.close();
  }
});

class AgentDouble {
  readonly listeners: AgentEventListener[] = [];

  subscribe(listener: AgentEventListener): Unsubscribe {
    this.listeners.push(listener);
    return () => {
      const at = this.listeners.indexOf(listener);
      if (at !== -1) this.listeners.splice(at, 1);
    };
  }

  async emit(event: AgentEvent): Promise<void> {
    const signal = new AbortController().signal;
    for (const listener of [...this.listeners]) await listener(event, signal);
  }
}

/** 조건이 설 때까지 기다린다. **상한이 있는 루프다** — 안 서면 그 자리에서 실패한다 */
async function until(predicate: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`조건이 서지 않았다 — ${label}`);
}

describe("WEB-UI.md §8 — 실물 소켓에서의 런 생존과 재접속", () => {
  it("적합 — 스트림 중간에 끊어도 런이 계속되고 재접속이 스냅샷을 받는다", async () => {
    const agent = new AgentDouble();
    const state = {
      session: { sessionId: "session-1", messages: [userMessage("m1")] } as SessionSnapshot,
    };
    const errors: unknown[] = [];
    const hub = createStreamHub({
      session: () => state.session,
      safety: DEFAULT_SAFETY,
      approvals: createApprovalRegistry({ onSubscriberError: (error) => errors.push(error) }),
      onConnectionError: (error) => errors.push(error),
    });

    const server = createServeServer({
      host: LOOPBACK_HOST,
      port: 0,
      agent,
      openStream: (open) => hub.open(open),
      handleRequest: (plain) => plain.response.end(),
    });
    started.push(server);
    const address = await server.listen();
    const url = `http://${LOOPBACK_HOST}:${String(address.port)}${STREAM_PATH}?${PROTOCOL_VERSION_PARAM}=${PROTOCOL_VERSION}`;

    const open = async (): Promise<{ chunks: string[]; abort: () => void }> => {
      const chunks: string[] = [];
      return await new Promise((resolve, reject) => {
        const request = httpGet(url, (response) => {
          response.setEncoding("utf8");
          response.on("data", (chunk: string) => chunks.push(chunk));
          resolve({ chunks, abort: () => request.destroy() });
        });
        request.on("error", () => undefined);
        request.setTimeout(5_000, () => reject(new Error("스트림이 안 열렸다.")));
      });
    };

    const first = await open();
    await until(() => first.chunks.length > 0, "첫 핸드셰이크");
    expect(firstHandshake(readFrames(first.chunks)).snapshot.sessionId).toBe("session-1");
    await until(() => hub.connectionCount === 1, "첫 연결 등록");

    first.abort();
    await until(() => hub.connectionCount === 0, "끊긴 연결 정리");

    // 런은 프로세스에 속한다 — 붙어 있는 클라이언트가 0이어도 방출은 그대로 돈다.
    await expect(agent.emit(turnStart)).resolves.toBeUndefined();
    state.session = { sessionId: "session-1", messages: [userMessage("m1"), userMessage("m2")] };
    await expect(agent.emit(turnStart)).resolves.toBeUndefined();

    const second = await open();
    await until(() => second.chunks.length > 0, "재접속 핸드셰이크");
    const handshake = firstHandshake(readFrames(second.chunks));
    // 재접속의 복구 수단은 스냅샷 하나다. 잃은 이벤트를 재생하지 않으므로 seq는 다시 1이다.
    expect(handshake.seq).toBe(1);
    expect(handshake.snapshot.transcript.messages.map((message) => message.id)).toEqual([
      "m1",
      "m2",
    ]);

    second.abort();
    await until(() => hub.connectionCount === 0, "둘째 연결 정리");
    expect(errors).toEqual([]);
  });
});
