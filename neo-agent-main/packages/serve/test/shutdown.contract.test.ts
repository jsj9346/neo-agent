/**
 * 종료 시퀀스 — 계약 검증.
 *
 * 기대값의 출처: `docs/WEB-UI.md` §3.2(순서 여덟 · 1이 7보다 앞 · 3이 4보다 앞 · 2와 6을
 * 가른다 · 유예의 존재와 만료 시 런 중단 · 두 번째 신호는 앞당기되 건너뛰지 않는다 · 종료 코드
 * 표 · 8은 중단된 것이 있을 때만) · §7(만료의 기본값은 거부) · §8(프로세스 종료는 런을
 * 중단시키고 그 사실이 트랜스크립트에 남는다) · `docs/CORE-INTERFACE.md` §9 불변 조건 2(모든
 * 런은 완결된 이벤트 시퀀스로 끝난다) · `docs/CLI-INTERFACE.md` §2(상속하는 종료 열거 —
 * `waitForIdle` 다음이 인플라이트 압축 대기이고 그 다음이 `store.close`).
 *
 * ## 무엇을 실물로 재는가
 *
 * 스트림 허브와 승인 레지스트리는 **실물**을 쓴다. 2단계와 6단계가 갈려 있다는 계약은 고지
 * 뒤에도 응답이 안 끝났다는 사실로만 재지는데, 그것은 대역이 아니라 그 두 함수의 실제 구현이
 * 답하는 물음이다. 승인 쪽도 같다 — 종료가 만료를 안 기다린다는 것은 레지스트리가 실제로 접는
 * 경로를 지나야 재진다.
 *
 * 저장소·코어·수락 게이트는 대역이다. 앞의 둘은 이 패키지 밖의 계약이고, 수락 게이트는 열린
 * 연결이 남았을 때의 대기를 시험해야 해서 완료 시점을 검사가 쥐어야 한다.
 *
 * ## 이 파일이 재지 않는 것
 *
 * - **유예와 만료의 값** — §12가 수치를 세부로 두었다. 아래는 주입한 값으로만 재고 기본
 *   상수의 값을 단정하지 않는다. 단정하면 그 순간 세부가 계약이 된다.
 * - **승인 레지스트리의 내부 규칙** — 만료가 거부라는 것과 abort의 처리는 §7이고
 *   `approvals.ts`의 계약이다. 여기서 재는 것은 종료 경로가 그 접힘을 부르는가와 사유가
 *   무엇인가뿐이다.
 * - **스트림의 내용** — 핸드셰이크와 배압은 §6.1·§8이고 `stream.ts`의 계약이다. 여기서 보는
 *   프레임은 종료 고지 하나다.
 * - **코어의 런 수명** — 이벤트 시퀀스를 닫는 것은 코어의 불변 조건이고, 아래 대역은 그
 *   계약을 지키는 코어를 흉내 내어 종료가 그 닫힘을 실제로 기다리는지만 잰다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의 대조
 * 축(`U-1`·`D-1`·`D-2`)이 걸린다. 그래서 이 주석은 인용부호를 쓰지 않고 전부 서술로 적는다 —
 * 갈리면 벗기라는 그 절의 처방을 자리 전체에 미리 적용한 형태다. 문서를 줄번호로 가리키는
 * 자리는 이 규약의 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 이름으로 한다.
 */

import type { AgentEvent, AgentMessage, Unsubscribe } from "@neo-agent/core";
import { describe, expect, it } from "vitest";
import type { ApprovalRegistry } from "../src/approvals.ts";
import { createApprovalRegistry } from "../src/approvals.ts";
import type { Frame } from "../src/protocol.ts";
import { frameSchema } from "../src/protocol.ts";
import type { AgentEventBus } from "../src/server.ts";
import type { ShutdownOutcome, ShutdownPorts, SignalHost } from "../src/shutdown.ts";
import { beginShutdown, installShutdownSignals, SHUTDOWN_SIGNALS } from "../src/shutdown.ts";
import type { StreamHub, StreamResponse } from "../src/stream.ts";
import { createStreamHub } from "../src/stream.ts";

/* ------------------------------------------------------------------------ *
 * 도구 — 응답 대역·이벤트 버스 대역·코어 대역
 * ------------------------------------------------------------------------ */

/** 응답 대역. `StreamResponse`가 요구하는 것만 든다 */
class FakeResponse implements StreamResponse {
  readonly chunks: string[] = [];
  ended = false;
  destroyed = false;
  status: number | undefined;
  #onClose: (() => void) | undefined;

  writeHead(status: number): this {
    this.status = status;
    return this;
  }

  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }

  end(): this {
    this.ended = true;
    this.#onClose?.();
    return this;
  }

  destroy(): this {
    this.destroyed = true;
    this.#onClose?.();
    return this;
  }

  get writableLength(): number {
    return 0;
  }

  on(event: "close", listener: () => void): this {
    if (event === "close") this.#onClose = listener;
    return this;
  }

  /** 지금까지 받은 프레임 전부. SSE 봉투를 벗기고 프레임 셋으로 판정한다 */
  frames(): Frame[] {
    return this.chunks.flatMap((chunk) =>
      chunk
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => frameSchema.parse(JSON.parse(line.slice("data: ".length)))),
    );
  }
}

/** 이벤트 버스 대역. 스트림 허브가 붙는 자리이고 이 검사에서는 아무것도 안 흘린다 */
const idleBus: AgentEventBus = {
  subscribe(): Unsubscribe {
    return () => undefined;
  },
};

/**
 * 코어 대역. `CORE-INTERFACE.md` §9 불변 조건 2를 지키는 코어를 흉내 낸다 — 런이 시작하면
 * `agent_start`가 나가고, 어떻게 끝나든 `agent_end`가 닫는다.
 *
 * `waitForIdle`은 대기 수단이므로 던지지 않는다(같은 문서 §4). 런이 없으면 즉시 resolve한다.
 */
class FakeCore {
  readonly events: AgentEvent[] = [];
  readonly abortReasons: (string | undefined)[] = [];
  #settleRun: (() => void) | undefined;
  #idle: Promise<void> = Promise.resolve();

  /** 런을 연다. 중단되거나 스스로 끝날 때까지 idle이 아니다 */
  startRun(): void {
    this.events.push({ type: "agent_start" });
    this.#idle = new Promise<void>((resolve) => {
      this.#settleRun = () => {
        this.#settleRun = undefined;
        this.events.push({ type: "agent_end", messages: [] });
        resolve();
      };
    });
  }

  /** 런이 스스로 끝났다 */
  finishRun(): void {
    this.#settleRun?.();
  }

  waitForIdle(): Promise<void> {
    return this.#idle;
  }

  abort(reason?: string): void {
    this.abortReasons.push(reason);
    // 코어의 중단도 시퀀스를 닫는다. 닫지 않으면 불변 조건 2가 깨지고, 그 상태를 흉내 내면
    // 이 검사가 재는 것이 코어의 결함이 된다.
    this.#settleRun?.();
  }
}

type Harness = {
  readonly ports: ShutdownPorts;
  /** 단계가 불린 순서. 숫자가 §3.2 열거의 자리다 */
  readonly log: string[];
  readonly core: FakeCore;
  readonly approvals: ApprovalRegistry;
  readonly hub: StreamHub;
  readonly notices: string[];
  readonly errors: unknown[];
  /** 열린 연결 하나를 만든다 */
  openConnection(): FakeResponse;
  /** 1단계의 대기를 푼다. 부르지 않으면 열린 요청이 안 끝난 상태다 */
  releaseAccept(): void;
};

type HarnessOptions = {
  /** 압축 대기가 도는 시간. 생략하면 즉시 끝난다 */
  readonly compaction?: () => Promise<void>;
  /** 수락 게이트가 바로 끝나지 않게 한다 */
  readonly holdAccept?: boolean;
  readonly approvalTimeoutMs?: number;
  readonly transcript?: readonly AgentMessage[];
};

function makeHarness(options: HarnessOptions = {}): Harness {
  const log: string[] = [];
  const notices: string[] = [];
  const errors: unknown[] = [];
  const core = new FakeCore();

  const approvals = createApprovalRegistry({
    timeoutMs: options.approvalTimeoutMs ?? 60_000,
    onSubscriberError: (error) => errors.push(error),
  });

  const hub = createStreamHub({
    session: () => ({ sessionId: "s-1", messages: options.transcript ?? [] }),
    approvals,
    onConnectionError: (error) => errors.push(error),
  });

  let releaseAccept: () => void = () => undefined;
  const accepted = options.holdAccept
    ? new Promise<void>((resolve) => {
        releaseAccept = resolve;
      })
    : Promise.resolve();

  const ports: ShutdownPorts = {
    server: {
      close: () => {
        log.push("1:stop-accepting");
        // 완료 표시는 **붙들었을 때만** 남긴다. 즉시 끝나는 대역에서는 이 `then`이 1단계
        // 직후의 마이크로태스크에서 도는데, 그것은 시퀀스가 그 완료를 어디서 기다리는가와
        // 무관하다 — 남기면 순서 축이 대역의 스케줄링을 재게 된다. 기다리는 자리는 아래
        // 붙드는 축이 잰다.
        return options.holdAccept === true
          ? accepted.then(() => {
              log.push("1:accepted");
            })
          : accepted;
      },
    },
    streams: {
      announceShutdown: () => {
        log.push("2:announce");
        hub.announceShutdown();
      },
      closeAll: () => {
        log.push("6:close-streams");
        hub.closeAll();
      },
    },
    approvals: {
      denyAllForShutdown: () => {
        log.push("3:deny-approvals");
        approvals.denyAllForShutdown();
      },
    },
    run: {
      waitForIdle: async () => {
        log.push("4:wait-idle");
        await core.waitForIdle();
        log.push("4:idle");
      },
      abort: (reason) => {
        log.push("abort");
        core.abort(reason);
      },
    },
    waitForInFlightCompaction: async () => {
      log.push("5:wait-compaction");
      await options.compaction?.();
      log.push("5:compacted");
    },
    store: {
      close: () => {
        log.push("7:close-store");
      },
    },
    notify: (message) => {
      log.push("8:notify");
      notices.push(message);
    },
    onStepError: (error) => {
      errors.push(error);
    },
  };

  return {
    ports,
    log,
    core,
    approvals,
    hub,
    notices,
    errors,
    openConnection: () => {
      const response = new FakeResponse();
      hub.open({ response, events: idleBus });
      return response;
    },
    releaseAccept: () => {
      releaseAccept();
    },
  };
}

/** 신호 호스트 대역. 프로세스 전역을 안 건드리고 리스너 수를 셀 수 있다 */
class FakeSignalHost implements SignalHost {
  readonly #listeners = new Map<string, Set<() => void>>();

  on(signal: string, listener: () => void): this {
    const set = this.#listeners.get(signal) ?? new Set<() => void>();
    set.add(listener);
    this.#listeners.set(signal, set);
    return this;
  }

  off(signal: string, listener: () => void): this {
    this.#listeners.get(signal)?.delete(listener);
    return this;
  }

  count(): number {
    let total = 0;
    for (const set of this.#listeners.values()) total += set.size;
    return total;
  }

  send(signal: string): void {
    for (const listener of [...(this.#listeners.get(signal) ?? [])]) listener();
  }
}

const indexOfStep = (log: readonly string[], step: string): number => log.indexOf(step);

/* ------------------------------------------------------------------------ *
 * 축 1 — 여덟 단계가 적힌 순서대로 일어난다 (§3.2)
 * ------------------------------------------------------------------------ */

describe("종료 순서 — WEB-UI.md §3.2", () => {
  it("여덟 단계가 열거된 순서대로 불린다", async () => {
    const harness = makeHarness();
    const outcome = await beginShutdown(harness.ports, { graceMs: 5_000 }).finished;

    expect(outcome.exitCode).toBe(0);
    expect(harness.log).toEqual([
      "1:stop-accepting",
      "2:announce",
      "3:deny-approvals",
      "4:wait-idle",
      "4:idle",
      "5:wait-compaction",
      "5:compacted",
      "6:close-streams",
      "7:close-store",
    ]);
    // 8은 중단된 것이 있을 때만 남는다. 이 경로에는 없다.
    expect(harness.notices).toEqual([]);
  });

  it("3이 4보다 앞이다 — 승인 비우기가 idle 대기를 앞선다", async () => {
    const harness = makeHarness();
    await beginShutdown(harness.ports, { graceMs: 5_000 }).finished;

    expect(indexOfStep(harness.log, "3:deny-approvals")).toBeLessThan(
      indexOfStep(harness.log, "4:wait-idle"),
    );
  });

  it("1이 7보다 앞이다 — 수락 중지가 저장소 닫기를 앞서고, 열린 요청이 끝난 뒤에 7이 간다", async () => {
    const harness = makeHarness({ holdAccept: true });
    const run = beginShutdown(harness.ports, { graceMs: 5_000 });

    // 열린 요청이 남아 있는 동안에는 저장소가 닫히지 않는다. 닫히면 그 요청이 만든 이벤트가
    // 영속되지 않는다 — 그것이 1이 7보다 앞인 근거다.
    await new Promise((resolve) => setImmediate(resolve));
    expect(harness.log).not.toContain("7:close-store");
    expect(harness.log).toContain("6:close-streams");

    harness.releaseAccept();
    await run.finished;

    expect(indexOfStep(harness.log, "1:stop-accepting")).toBeLessThan(
      indexOfStep(harness.log, "7:close-store"),
    );
    expect(indexOfStep(harness.log, "1:accepted")).toBeLessThan(
      indexOfStep(harness.log, "7:close-store"),
    );
  });

  it("5가 4와 7 사이다 — 인플라이트 압축을 기다린 뒤에 저장소를 닫는다", async () => {
    let released: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      released = resolve;
    });
    const harness = makeHarness({ compaction: () => held });
    const run = beginShutdown(harness.ports, { graceMs: 5_000 });

    await new Promise((resolve) => setImmediate(resolve));
    expect(harness.log).toContain("5:wait-compaction");
    expect(harness.log).not.toContain("7:close-store");

    released();
    await run.finished;

    expect(indexOfStep(harness.log, "5:compacted")).toBeLessThan(
      indexOfStep(harness.log, "7:close-store"),
    );
  });
});

/* ------------------------------------------------------------------------ *
 * 축 2 — 고지(2)와 닫기(6)가 갈려 있다 (§3.2)
 * ------------------------------------------------------------------------ */

describe("고지와 닫기 — WEB-UI.md §3.2", () => {
  it("고지 뒤에도 스트림이 열려 있고 6에서 닫힌다", async () => {
    let released: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      released = resolve;
    });
    const harness = makeHarness({ compaction: () => held });
    const response = harness.openConnection();
    expect(response.ended).toBe(false);

    const run = beginShutdown(harness.ports, { graceMs: 5_000 });
    await new Promise((resolve) => setImmediate(resolve));

    // 2가 지났고 6은 아직이다. 유예가 도는 이 구간이 이 계약이 겨눈 자리다 — 붙여 두면
    // 사용자는 아무것도 못 본 채 화면이 멈춘 것을 본다.
    const kinds = response
      .frames()
      .filter((frame) => frame.type === "state")
      .map((frame) => frame.kind);
    expect(kinds).toContain("shutdown");
    expect(response.ended).toBe(false);

    released();
    await run.finished;
    expect(response.ended).toBe(true);
  });

  it("종료 고지 프레임에 페이로드가 없다", async () => {
    const harness = makeHarness();
    const response = harness.openConnection();
    await beginShutdown(harness.ports, { graceMs: 5_000 }).finished;

    const shutdownFrames = response
      .frames()
      .filter((frame) => frame.type === "state" && frame.kind === "shutdown");
    expect(shutdownFrames).toHaveLength(1);
    expect(Object.keys(shutdownFrames[0] ?? {}).sort()).toEqual(["kind", "seq", "type"]);
  });
});

/* ------------------------------------------------------------------------ *
 * 축 3 — 대기 승인은 만료를 안 기다리고 종료 사유로 접힌다 (§3.2·§7)
 * ------------------------------------------------------------------------ */

describe("승인 비우기 — WEB-UI.md §3.2 순서 3단계", () => {
  it("대기 승인이 만료를 기다리지 않고 즉시 shutdown 사유로 접힌다", async () => {
    // 만료를 아주 길게 둔다. 종료가 만료를 기다린다면 이 검사가 끝나지 않는다.
    const harness = makeHarness({ approvalTimeoutMs: 3_600_000 });
    const controller = new AbortController();
    const asked = harness.approvals.ask({ display: "rm -rf /" }, controller.signal);
    expect(harness.approvals.list()).toHaveLength(1);

    const response = harness.openConnection();
    const outcome = await beginShutdown(harness.ports, { graceMs: 5_000 }).finished;

    await expect(asked).resolves.toBe("deny");
    expect(harness.approvals.list()).toEqual([]);
    expect(outcome.exitCode).toBe(0);

    const settled = response
      .frames()
      .filter((frame) => frame.type === "state" && frame.kind === "approval_settled");
    expect(settled).toHaveLength(1);
    const frame = settled[0];
    if (frame === undefined || frame.type !== "state" || frame.kind !== "approval_settled") {
      throw new Error("승인 해소 프레임이 없다");
    }
    // 종료를 timeout으로 접지 않는 것이 §3.2의 판정이다 — 아무도 답하지 않은 것과 서버가
    // 내려간 것은 사용자의 다음 행동이 다르다.
    expect(frame.outcome).toEqual({ decision: "deny", resolvedBy: "shutdown" });
  });

  it("승인 비우기가 idle 대기보다 먼저라 종료가 만료만큼 지연되지 않는다", async () => {
    const harness = makeHarness({ approvalTimeoutMs: 3_600_000 });
    const controller = new AbortController();
    // 승인이 풀려야 런이 끝나는 상황을 만든다 — 게이트가 승인을 기다리는 도구 실행 안이다.
    harness.core.startRun();
    const asked = harness.approvals.ask({ display: "shell" }, controller.signal);
    void asked.then(() => {
      harness.core.finishRun();
    });

    const outcome = await beginShutdown(harness.ports, { graceMs: 5_000 }).finished;

    // 4가 만료까지 붙들리지 않았으므로 중단 경로로 가지 않았다.
    expect(outcome.abortedRun).toBe(false);
    expect(harness.core.abortReasons).toEqual([]);
    expect(harness.core.events.map((event) => event.type)).toEqual(["agent_start", "agent_end"]);
  });
});

/* ------------------------------------------------------------------------ *
 * 축 4 — 유예 만료의 중단과 종료 코드 (§3.2·§8)
 * ------------------------------------------------------------------------ */

describe("유예와 종료 코드 — WEB-UI.md §3.2", () => {
  it("유예가 만료하면 런을 중단시키고 그 뒤로 6·7·8이 돈다. 종료 코드는 0이다", async () => {
    const harness = makeHarness();
    harness.core.startRun();

    const outcome = await beginShutdown(harness.ports, { graceMs: 10 }).finished;

    expect(outcome.abortedRun).toBe(true);
    // 유예 만료로 런을 중단시킨 경우를 포함해 0이다 — 요청받은 종료는 성공했고 런 중단은
    // §8이 이미 정상 경로로 정의한 것이다.
    expect(outcome.exitCode).toBe(0);
    expect(outcome.failures).toEqual([]);

    expect(harness.core.abortReasons).toHaveLength(1);
    expect(harness.core.abortReasons[0]).toBeTypeOf("string");

    // 중단된 런의 이벤트 시퀀스가 닫힌다 — CORE-INTERFACE.md §9 불변 조건 2.
    expect(harness.core.events.map((event) => event.type)).toEqual(["agent_start", "agent_end"]);

    // 건너뛰지 않는다.
    expect(indexOfStep(harness.log, "abort")).toBeLessThan(
      indexOfStep(harness.log, "6:close-streams"),
    );
    expect(harness.log).toContain("7:close-store");
    expect(harness.log).toContain("8:notify");
  });

  it("8은 중단된 것이 있을 때만 남는다", async () => {
    const quiet = makeHarness();
    await beginShutdown(quiet.ports, { graceMs: 5_000 }).finished;
    expect(quiet.notices).toEqual([]);

    const aborted = makeHarness();
    aborted.core.startRun();
    await beginShutdown(aborted.ports, { graceMs: 10 }).finished;
    expect(aborted.notices).toHaveLength(1);
    expect(aborted.notices[0]).toBeTypeOf("string");
    expect(aborted.notices[0]).not.toBe("");
  });

  it("유예 값이 유한한 양수가 아니면 시작에서 던진다", () => {
    const harness = makeHarness();
    expect(() => beginShutdown(harness.ports, { graceMs: 0 })).toThrow(/유한한 양수/);
    expect(() => beginShutdown(harness.ports, { graceMs: Number.POSITIVE_INFINITY })).toThrow(
      /유한한 양수/,
    );
    expect(() => beginShutdown(harness.ports, { graceMs: -1 })).toThrow(/유한한 양수/);
  });

  it("단계가 실패하면 종료 코드가 비영이고 나머지 단계는 그대로 돈다", async () => {
    const harness = makeHarness();
    const failing: ShutdownPorts = {
      ...harness.ports,
      approvals: {
        denyAllForShutdown: () => {
          harness.log.push("3:deny-approvals");
          throw new Error("승인 구독자가 던졌다");
        },
      },
    };

    const outcome = await beginShutdown(failing, { graceMs: 5_000 }).finished;

    expect(outcome.exitCode).toBe(1);
    expect(outcome.failures).toHaveLength(1);
    // 실패한 단계가 나머지를 건너뛰지 않는다 — 건너뛰면 스트림도 저장소도 안 닫힌 채 남는다.
    expect(harness.log).toContain("6:close-streams");
    expect(harness.log).toContain("7:close-store");
    // 사유가 조용히 사라지지 않는다.
    expect(harness.errors).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------------ *
 * 축 5 — 두 번째 신호 (§3.2)
 * ------------------------------------------------------------------------ */

describe("두 번째 신호 — WEB-UI.md §3.2", () => {
  it("유예를 앞당기되 6·7·8은 그대로 돈다", async () => {
    const harness = makeHarness();
    harness.core.startRun();

    const started = Date.now();
    const run = beginShutdown(harness.ports, { graceMs: 3_600_000 });
    await new Promise((resolve) => setImmediate(resolve));
    run.expedite();
    const outcome = await run.finished;

    expect(outcome.expedited).toBe(true);
    expect(outcome.abortedRun).toBe(true);
    expect(outcome.exitCode).toBe(0);
    // 유예를 다 기다렸다면 이 검사가 한 시간 걸린다.
    expect(Date.now() - started).toBeLessThan(60_000);

    // 순서는 건너뛰지 않는다.
    expect(harness.log).toContain("6:close-streams");
    expect(harness.log).toContain("7:close-store");
    expect(harness.log).toContain("8:notify");
    expect(harness.core.events.map((event) => event.type)).toEqual(["agent_start", "agent_end"]);
  });

  it("세 번째 이상의 앞당기기가 새 행동을 더하지 않는다", async () => {
    const harness = makeHarness();
    harness.core.startRun();

    const run = beginShutdown(harness.ports, { graceMs: 3_600_000 });
    await new Promise((resolve) => setImmediate(resolve));
    run.expedite();
    run.expedite();
    run.expedite();
    const outcome = await run.finished;

    expect(outcome.exitCode).toBe(0);
    expect(harness.core.abortReasons).toHaveLength(1);
    expect(harness.log.filter((entry) => entry === "7:close-store")).toHaveLength(1);
  });

  it("종료가 끝난 뒤의 앞당기기는 아무 일도 하지 않는다", async () => {
    const harness = makeHarness();
    const run = beginShutdown(harness.ports, { graceMs: 5_000 });
    const outcome = await run.finished;
    expect(() => {
      run.expedite();
    }).not.toThrow();
    expect(outcome.exitCode).toBe(0);
  });
});

/* ------------------------------------------------------------------------ *
 * 축 6 — 개시자는 신호뿐이다 (§3.2)
 * ------------------------------------------------------------------------ */

describe("신호 배선 — WEB-UI.md §3.2", () => {
  it("개시자 집합이 SIGINT과 SIGTERM 둘이고 두 신호를 가르지 않는다", async () => {
    expect([...SHUTDOWN_SIGNALS]).toEqual(["SIGINT", "SIGTERM"]);

    for (const signal of SHUTDOWN_SIGNALS) {
      const harness = makeHarness();
      const host = new FakeSignalHost();
      const codes: number[] = [];
      const signals = installShutdownSignals(harness.ports, {
        host,
        graceMs: 5_000,
        setExitCode: (code) => codes.push(code),
      });

      host.send(signal);
      const outcome: ShutdownOutcome = await signals.finished;

      expect(outcome.exitCode).toBe(0);
      expect(codes).toEqual([0]);
      expect(harness.log).toContain("7:close-store");
      // 리스너를 걷지 않으면 프로세스가 종료 뒤에도 루프에 붙들린다.
      expect(host.count()).toBe(0);
    }
  });

  it("첫 신호가 시작하고 그 뒤의 신호는 앞당기기로 간다", async () => {
    const harness = makeHarness();
    harness.core.startRun();
    const host = new FakeSignalHost();
    const signals = installShutdownSignals(harness.ports, { host, graceMs: 3_600_000 });

    host.send("SIGTERM");
    await new Promise((resolve) => setImmediate(resolve));
    // 다른 신호로 와도 같은 자리다 — 두 신호를 가르지 않는다.
    host.send("SIGINT");

    const outcome = await signals.finished;
    expect(outcome.expedited).toBe(true);
    expect(outcome.abortedRun).toBe(true);
    expect(harness.log.filter((entry) => entry === "1:stop-accepting")).toHaveLength(1);
  });

  it("신호가 오기 전에는 아무 단계도 돌지 않는다", async () => {
    const harness = makeHarness();
    const host = new FakeSignalHost();
    const signals = installShutdownSignals(harness.ports, { host, graceMs: 5_000 });

    await new Promise((resolve) => setImmediate(resolve));
    expect(harness.log).toEqual([]);
    expect(host.count()).toBe(SHUTDOWN_SIGNALS.length);

    signals.dispose();
    expect(host.count()).toBe(0);
  });

  it("종료 코드가 비영이면 그 값이 실린다", async () => {
    const harness = makeHarness();
    const failing: ShutdownPorts = {
      ...harness.ports,
      store: {
        close: () => {
          throw new Error("저장소를 닫지 못했다");
        },
      },
    };
    const host = new FakeSignalHost();
    const codes: number[] = [];
    const signals = installShutdownSignals(failing, {
      host,
      graceMs: 5_000,
      setExitCode: (code) => codes.push(code),
    });

    host.send("SIGINT");
    const outcome = await signals.finished;

    expect(outcome.exitCode).toBe(1);
    expect(codes).toEqual([1]);
    // 비영을 값으로 세분하지 않는다.
    expect(new Set(codes).size).toBe(1);
  });
});
