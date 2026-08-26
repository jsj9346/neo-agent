/**
 * T-006 — 대기 승인 레지스트리의 계약 검증. 정본은 `docs/WEB-UI.md` §7·§3.2와
 * `docs/CLI-INTERFACE.md` §9다.
 *
 * **기대값은 구현이 아니라 계약 문서에서만 도출했다.** 구현이 문서와 다르면 이 파일은
 * 문서 편에 선다.
 *
 *   - `WEB-UI.md` §7   — *"승인은 연결이 아니라 프로세스의 대기 레지스트리에 귀속한다."*,
 *                        *"요청을 만든 연결이 사라져도 레코드는 남고, 붙어 있는 아무
 *                        클라이언트나 응답할 수 있다."*, *"만료의 기본값은 거부이지 허용이
 *                        아니다."*, *"표시 문면은 가공 없이 전달한다."*, 그리고 계약이
 *                        *"유한한 만료가 존재한다는 것"*과 *"만료가 거부라는 것"* 둘뿐이라는 것
 *   - `WEB-UI.md` §3.2 — 순서 3단계가 *"대기 중인 승인을 전부 거부로 settle한다"*,
 *                        그 사유가 timeout이 아니라 shutdown이라는 것, 그리고 3이 4보다 앞이
 *                        아니면 *"종료가 만료 시간만큼 지연된다."*
 *   - `CLI-INTERFACE.md` §9 — abort에서 ask가 reject한다는 것(deny를 지어내지 않는다),
 *                        `allowAlwaysKey`가 없으면 항상 허용을 제공하지 않는다는 것
 *
 * **만료 값을 단정하는 축이 이 파일에 없다.** §7이 그 값을 세부로 두었으므로 여기서 재는
 * 것은 언제나 주입한 값이고, 기본 상수는 모듈 밖에서 읽을 수조차 없어야 한다 — 아래 마지막
 * 스위트가 그것을 잰다. 그 축이 없으면 다음이 상수를 export하고 그 값을 단정하는 검사를
 * 붙이며, 그 순간 세부가 계약이 된다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 문서를 지목하는
 * 자리는 절 번호와 필드 이름으로 하고 줄번호로 하지 않는다.
 */

import { describe, expect, test } from "vitest";
import {
  type ApprovalChange,
  type ApprovalRegistry,
  createApprovalRegistry,
} from "../src/approvals.ts";

/**
 * 주입 만료. **이 값은 계약이 아니라 이 파일의 픽스처다** — 아래 어느 단정도 기본 상수를
 * 읽지 않는다. 실시간 타이머를 쓰는 이유는 만료가 이벤트 루프 위에 산다는 사실 자체가
 * 재는 대상의 일부이기 때문이다(§3.2가 그 한계를 명시한 자리와 같은 성질).
 */
const TIMEOUT_MS = 20;

/**
 * 구독자 예외의 행선지. **선택적이 아니므로**(`approvals.ts` 선언부) 이 파일의 축들도
 * 자리를 채워야 한다.
 *
 * 삼키지 않고 던지게 두는 이유는 아래 축 대부분이 **던지지 않는 구독자**를 두기 때문이다 —
 * 여기 무엇이 오면 그것은 재려던 것이 아니라 결함이고, 조용히 모아 두면 그 결함이 그린으로
 * 지나간다. 던지는 구독자를 일부러 두는 축은 자기 자리에서 자기 싱크를 준다.
 */
const rejectSubscriberError = (error: unknown): never => {
  throw new Error(`이 축은 던지는 구독자를 두지 않는다 — ${String(error)}`);
};

/** 변화를 순서대로 모으는 구독자. 스트림(§6.1)이 앉을 자리를 테스트가 대신 앉는다 */
function recorder(registry: ApprovalRegistry): {
  changes: ApprovalChange[];
  stop: () => void;
} {
  const changes: ApprovalChange[] = [];
  const stop = registry.subscribe((change) => {
    changes.push(change);
  });
  return { changes, stop };
}

function settledChanges(changes: readonly ApprovalChange[]): ApprovalChange[] {
  return changes.filter((change) => change.kind === "settled");
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe("만료 — 기본값은 거부다 (§7)", () => {
  test("응답 없이 만료하면 deny이고 사유가 timeout이다", async () => {
    const registry = createApprovalRegistry({
      timeoutMs: TIMEOUT_MS,
      onSubscriberError: rejectSubscriberError,
    });
    const { changes } = recorder(registry);

    const answer = await registry.ask({ display: "rm -rf ." }, new AbortController().signal);

    expect(answer).toBe("deny");
    expect(settledChanges(changes)).toEqual([
      {
        kind: "settled",
        id: expect.any(String),
        outcome: { decision: "deny", resolvedBy: "timeout" },
      },
    ]);
    // 만료가 목록을 비운다 — 접힌 승인이 대기로 남으면 핸드셰이크 스냅샷이 거짓을 싣는다.
    expect(registry.list()).toEqual([]);
  });

  test("만료로 allow가 되는 갈래가 없다 — 어떤 사유의 allow도 나오지 않는다", async () => {
    const registry = createApprovalRegistry({
      timeoutMs: TIMEOUT_MS,
      onSubscriberError: rejectSubscriberError,
    });
    const { changes } = recorder(registry);

    await registry.ask({ display: "무응답" }, new AbortController().signal);
    await registry.ask({ display: "무응답 둘" }, new AbortController().signal);

    for (const change of settledChanges(changes)) {
      expect(change.kind === "settled" && change.outcome.decision).toBe("deny");
    }
  });

  test("만료 뒤에는 같은 id로 접을 수 없다 — 두 번 접히지 않는다", async () => {
    const registry = createApprovalRegistry({
      timeoutMs: TIMEOUT_MS,
      onSubscriberError: rejectSubscriberError,
    });
    const pending = registry.ask({ display: "곧 만료" }, new AbortController().signal);
    const id = registry.list()[0]?.id ?? "";

    await pending;

    expect(registry.settle(id, "allow-once")).toEqual({ status: "unknown" });
  });

  test("유한한 만료가 존재한다 — 무한·0·음수는 생성에서 거부된다", () => {
    // 계약의 앞 절반이다. 이 셋을 받으면 만료가 없는 레지스트리가 표현 가능해진다.
    expect(() =>
      createApprovalRegistry({
        timeoutMs: Number.POSITIVE_INFINITY,
        onSubscriberError: rejectSubscriberError,
      }),
    ).toThrow();
    expect(() =>
      createApprovalRegistry({ timeoutMs: 0, onSubscriberError: rejectSubscriberError }),
    ).toThrow();
    expect(() =>
      createApprovalRegistry({ timeoutMs: -1, onSubscriberError: rejectSubscriberError }),
    ).toThrow();
    expect(() =>
      createApprovalRegistry({ timeoutMs: Number.NaN, onSubscriberError: rejectSubscriberError }),
    ).toThrow();
  });

  test("대기 레코드의 만료 시각이 요청 시각보다 뒤다", () => {
    const registry = createApprovalRegistry({
      timeoutMs: TIMEOUT_MS,
      now: () => 1_000,
      onSubscriberError: rejectSubscriberError,
    });
    void registry.ask({ display: "시각" }, new AbortController().signal);

    const approval = registry.list()[0];
    expect(approval?.requestedAt).toBe(1_000);
    // 주입한 만료로만 잰다 — 기본 상수는 이 파일이 모른다.
    expect(approval?.expiresAt).toBe(1_000 + TIMEOUT_MS);

    registry.denyAllForShutdown();
  });
});

describe("종료 — 사유가 timeout이 아니다 (§3.2 순서 3단계)", () => {
  test("종료 경로로 비우면 deny이고 사유가 shutdown이다", async () => {
    const registry = createApprovalRegistry({
      timeoutMs: 60_000,
      onSubscriberError: rejectSubscriberError,
    });
    const { changes } = recorder(registry);
    const pending = registry.ask({ display: "종료 중" }, new AbortController().signal);

    registry.denyAllForShutdown();

    expect(await pending).toBe("deny");
    expect(settledChanges(changes)).toEqual([
      {
        kind: "settled",
        id: expect.any(String),
        outcome: { decision: "deny", resolvedBy: "shutdown" },
      },
    ]);
  });

  test("만료를 기다리지 않는다 — 만료보다 훨씬 먼저 접힌다", async () => {
    // 3이 4보다 앞인 것의 값이다. 기다리면 종료가 만료 시간만큼 지연된다(§3.2).
    const registry = createApprovalRegistry({
      timeoutMs: 60_000,
      onSubscriberError: rejectSubscriberError,
    });
    const startedAt = Date.now();
    const pending = registry.ask({ display: "즉시 접힘" }, new AbortController().signal);

    registry.denyAllForShutdown();
    await pending;

    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(registry.list()).toEqual([]);
  });

  test("대기 여럿을 전부 비운다", async () => {
    const registry = createApprovalRegistry({
      timeoutMs: 60_000,
      onSubscriberError: rejectSubscriberError,
    });
    const signal = new AbortController().signal;
    const all = Promise.all([
      registry.ask({ display: "하나" }, signal),
      registry.ask({ display: "둘" }, signal),
      registry.ask({ display: "셋" }, signal),
    ]);
    expect(registry.list()).toHaveLength(3);

    registry.denyAllForShutdown();

    expect(await all).toEqual(["deny", "deny", "deny"]);
    expect(registry.list()).toEqual([]);
  });

  test("종료 뒤에 온 요청도 만료를 기다리지 않고 shutdown으로 접힌다", async () => {
    // 1단계(수락 중지)와 4단계(waitForIdle) 사이에 새 승인이 뜰 수 있다. 그것이 만료까지
    // 살면 3을 4보다 앞에 둔 이유가 그대로 무너진다.
    const registry = createApprovalRegistry({
      timeoutMs: 60_000,
      onSubscriberError: rejectSubscriberError,
    });
    registry.denyAllForShutdown();
    const { changes } = recorder(registry);

    expect(await registry.ask({ display: "늦게 온 승인" }, new AbortController().signal)).toBe(
      "deny",
    );
    expect(settledChanges(changes)).toEqual([
      {
        kind: "settled",
        id: expect.any(String),
        outcome: { decision: "deny", resolvedBy: "shutdown" },
      },
    ]);
    expect(registry.list()).toEqual([]);
  });
});

describe("귀속 — 연결이 아니라 프로세스다 (§7)", () => {
  test("구독을 끊어도 대기 레코드가 남고 새 구독자가 목록을 받는다", async () => {
    // 구독 하나가 곧 붙어 있는 클라이언트 하나다. 그것이 사라지는 것으로 대기가 사라지면
    // 승인이 연결에 귀속한 것이다.
    const registry = createApprovalRegistry({
      timeoutMs: 60_000,
      onSubscriberError: rejectSubscriberError,
    });
    const first = recorder(registry);
    const pending = registry.ask({ display: "연결이 끊겨도 남는다" }, new AbortController().signal);
    const before = registry.list();
    expect(before).toHaveLength(1);

    first.stop();

    expect(registry.list()).toEqual(before);

    // 새 연결이 핸드셰이크에서 받는 것이 이 목록이다(§6.1의 `handshake` 스냅샷).
    const second = recorder(registry);
    const id = before[0]?.id ?? "";
    expect(registry.settle(id, "allow-once")).toEqual({
      status: "settled",
      outcome: { decision: "allow", resolvedBy: "client" },
    });
    expect(await pending).toBe("allow-once");
    expect(settledChanges(second.changes)).toHaveLength(1);
  });

  test("첫 구독자가 던져도 나머지 구독자가 변화를 받는다", () => {
    const registry = createApprovalRegistry({
      timeoutMs: 60_000,
      onSubscriberError: () => {
        /* 이 테스트가 재는 것은 전달이지 행선지가 아니다 */
      },
    });
    registry.subscribe(() => {
      throw new Error("구독자가 던진다");
    });
    const good = recorder(registry);

    void registry.ask({ display: "전달" }, new AbortController().signal);

    // **재는 것은 첫 구독자의 예외가 뒤 구독자의 전달을 막지 않는다는 것이다.**
    //
    // 2026-08-26(U-2)에 이 자리의 개수가 1에서 2로 옮겨졌다. 방출이 부분 실패로 판정되면
    // 레지스트리가 그 대기를 즉시 거부로 접는데, **접히는 것도 이 구독자에게 온다** —
    // `pending`을 받은 구독자에게 `settled`가 안 가면 화면에 답할 수 없는 프롬프트가
    // 남기 때문이다(§6.1 · `ARCHITECTURE.md` §2.6). 재는 성질은 그대로이고, 그래서
    // 개수 대신 갈래의 순서를 단정한다.
    expect(good.changes.map((change) => change.kind)).toEqual(["pending", "settled"]);
    registry.denyAllForShutdown();
  });
});

describe("응답 — 클라이언트만 allow를 만든다 (§7 · `CLI-INTERFACE.md` §9)", () => {
  test("allow-once와 allow-always가 allow로, deny가 deny로 접힌다", async () => {
    const registry = createApprovalRegistry({
      timeoutMs: 60_000,
      onSubscriberError: rejectSubscriberError,
    });
    const signal = new AbortController().signal;

    const once = registry.ask({ display: "한 번" }, signal);
    registry.settle(registry.list()[0]?.id ?? "", "allow-once");
    expect(await once).toBe("allow-once");

    const always = registry.ask({ display: "항상", allowAlwaysKey: "shell:ls" }, signal);
    registry.settle(registry.list()[0]?.id ?? "", "allow-always");
    expect(await always).toBe("allow-always");

    const denied = registry.ask({ display: "거부" }, signal);
    const denyResult = registry.settle(registry.list()[0]?.id ?? "", "deny");
    expect(denyResult).toEqual({
      status: "settled",
      outcome: { decision: "deny", resolvedBy: "client" },
    });
    expect(await denied).toBe("deny");
  });

  test("`allowAlwaysKey`가 없는 요청에 항상 허용이 오면 거부된다 — 대기가 남는다", async () => {
    // 제공하지 않은 선택지다. 한 번 허용으로 낮춰 통과시키면 사용자가 누른 것과 다른 일이
    // 일어나고, 그대로 학습시키면 게이트가 닫아 둔 문이 열린다.
    const registry = createApprovalRegistry({
      timeoutMs: 60_000,
      onSubscriberError: rejectSubscriberError,
    });
    const pending = registry.ask({ display: "키 없음" }, new AbortController().signal);
    const id = registry.list()[0]?.id ?? "";

    expect(registry.settle(id, "allow-always")).toEqual({ status: "always-unavailable" });
    expect(registry.list()).toHaveLength(1);

    registry.denyAllForShutdown();
    expect(await pending).toBe("deny");
  });

  test("모르는 id는 조용히 성공하지 않는다", () => {
    const registry = createApprovalRegistry({
      timeoutMs: 60_000,
      onSubscriberError: rejectSubscriberError,
    });
    expect(registry.settle("approval-999", "allow-once")).toEqual({ status: "unknown" });
  });
});

describe("중단 — ask는 reject한다 (`CLI-INTERFACE.md` §9)", () => {
  test("abort가 오면 ask가 reject하고 deny를 지어내지 않는다", async () => {
    const registry = createApprovalRegistry({
      timeoutMs: 60_000,
      onSubscriberError: rejectSubscriberError,
    });
    const controller = new AbortController();
    const pending = registry.ask({ display: "중단될 승인" }, controller.signal);

    controller.abort();

    await expect(pending).rejects.toThrow();
    expect(registry.list()).toEqual([]);
  });

  test("이미 중단된 signal이면 대기 레코드를 만들지 않는다", async () => {
    const registry = createApprovalRegistry({
      timeoutMs: 60_000,
      onSubscriberError: rejectSubscriberError,
    });
    const controller = new AbortController();
    controller.abort();

    await expect(registry.ask({ display: "이미 중단" }, controller.signal)).rejects.toThrow();
    expect(registry.list()).toEqual([]);
  });
});

describe("표시 문면 — 가공 없이 전달한다 (§7 · `CLI-INTERFACE.md` §9)", () => {
  test("바이트가 그대로 보존된다", () => {
    // 게이트의 위조 탐지(비가시·동형이의 문자)가 만든 문자열이라, 자르거나 정규화하거나
    // 재포맷하면 그 탐지가 무의미해진다. 그래서 비가시 문자·결합 문자·여러 줄을 함께 싣는다.
    const display = "rm -rf / ​́ 두 줄\n  들여쓴 둘째 줄\t끝";
    const registry = createApprovalRegistry({
      timeoutMs: 60_000,
      onSubscriberError: rejectSubscriberError,
    });

    void registry.ask({ display, warnings: ["비가시 문자"] }, new AbortController().signal);

    const carried = registry.list()[0]?.display ?? "";
    expect(carried).toBe(display);
    expect([...new TextEncoder().encode(carried)]).toEqual([...new TextEncoder().encode(display)]);
    expect(carried.split("\n")).toHaveLength(display.split("\n").length);

    registry.denyAllForShutdown();
  });
});

describe("변화의 순서 — 모든 접힘 앞에 대기가 있었다 (§6.1)", () => {
  test("pending이 먼저 나가고 settled가 같은 id로 뒤따른다", async () => {
    const registry = createApprovalRegistry({
      timeoutMs: TIMEOUT_MS,
      onSubscriberError: rejectSubscriberError,
    });
    const { changes } = recorder(registry);

    await registry.ask({ display: "짝" }, new AbortController().signal);

    expect(changes).toHaveLength(2);
    expect(changes[0]?.kind).toBe("pending");
    expect(changes[1]?.kind).toBe("settled");
    const pendingId = changes[0]?.kind === "pending" ? changes[0].approval.id : "";
    const settledId = changes[1]?.kind === "settled" ? changes[1].id : "";
    expect(settledId).toBe(pendingId);
  });

  test("대기 여럿의 id가 서로 다르다", async () => {
    const registry = createApprovalRegistry({
      timeoutMs: 60_000,
      onSubscriberError: rejectSubscriberError,
    });
    const signal = new AbortController().signal;
    void registry.ask({ display: "가" }, signal);
    void registry.ask({ display: "나" }, signal);
    void registry.ask({ display: "다" }, signal);

    const ids = registry.list().map((approval) => approval.id);
    expect(new Set(ids).size).toBe(ids.length);

    registry.denyAllForShutdown();
    await wait(0);
  });
});

describe("만료 값은 세부다 (§7)", () => {
  test("기본 만료 상수를 모듈 밖에서 읽을 수 없다", async () => {
    // **이 축이 만료 상수의 값을 단정하는 검사를 구조로 불가능하게 만든다.** 값이 export되면
    // 다음이 그것을 단정하는 검사를 붙일 수 있고, 그 순간 세부가 계약이 된다. 여기서 재는
    // 것은 그 자리가 애초에 없다는 것이다.
    const module = (await import("../src/approvals.ts")) as Record<string, unknown>;
    const exported = Object.entries(module).filter(([, value]) => typeof value === "number");
    expect(exported).toEqual([]);
  });
});
