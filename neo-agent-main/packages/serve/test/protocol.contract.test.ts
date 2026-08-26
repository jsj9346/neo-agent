/**
 * T-004 — 와이어 프로토콜의 계약 검증. 정본은 `docs/WEB-UI.md` §6·§6.1·§7·§3.2다.
 *
 * **기대값은 구현이 아니라 계약 문서에서만 도출했다.** 구현이 문서와 다르면 이 파일은
 * 문서 편에 선다.
 *
 *   - `WEB-UI.md` §6   — 프레임 넷과 판별자 폐쇄, *"모든 프레임 객체는 알려지지 않은
 *                        필드를 거부한다"*, *"`params`·`payload`는 의도적으로 열린 필드이고
 *                        그 검증은 각 메서드가 진다"*, *"`seq`는 두 푸시 프레임이 공유하는
 *                        하나의 카운터"*이고 *"연결마다 1부터 단조 증가한다"*
 *   - `WEB-UI.md` §6.1 — `kind` 넷, *"`shutdown`에 페이로드를 두지 않는다."*,
 *                        `StateSnapshot`·`TranscriptWindow`, *"프로토콜 버전을 여기 싣지 않는다"*,
 *                        *"옵셔널 필드나 감시값(`-1`·빈 배열)이 아니라 판별된 두 갈래로 닫는다"*
 *   - `WEB-UI.md` §7   — `PendingApproval`, *"만료의 기본값은 거부다. 무응답이 허용으로
 *                        읽히는 경로는 존재하지 않는다"*
 *   - `WEB-UI.md` §3.2 — *"§7의 유니온을 §3.2가 하나 넓힌다."* — `resolvedBy`는 셋이다
 *
 * **두 층을 따로 잰다.** 타입 층은 `tsc --noEmit`이 판정자이고(`@ts-expect-error` 구역은
 * 실행되지 않는다), 런타임 층은 zod 스키마의 `safeParse`가 판정자다. 어느 한 층만 재면
 * §6의 «닫는다»가 다른 층에서 거짓인 채로 그린이 된다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이고, 문서를 지목하는 자리는 절 번호와 필드 이름으로 한다.
 */

import type { AgentMessage } from "@neo-agent/core";
import { describe, expect, test } from "vitest";
import {
  type ApprovalOutcome,
  approvalOutcomeSchema,
  type Frame,
  frameSchema,
  type PendingApproval,
  pendingApprovalSchema,
  type ResponseFrame,
  requestFrameSchema,
  responseFrameSchema,
  type ServerEventFrame,
  type ServerStateFrame,
  type StateSnapshot,
  serverEventFrameSchema,
  serverStateFrameSchema,
  stateSnapshotSchema,
  type TranscriptWindow,
  transcriptWindowSchema,
} from "../src/protocol.ts";

// ---------------------------------------------------------------------------
// 픽스처
// ---------------------------------------------------------------------------

/** `CORE-INTERFACE.md` §2의 user 메시지. 코어가 소유한 형태이고 여기서 재선언하지 않는다 */
const message: AgentMessage = {
  id: "5f0b7c1e-2a4d-4b6f-9c8e-1d3a5b7c9e11",
  role: "user",
  content: [{ type: "text", text: "안녕" }],
  timestamp: 1_700_000_000_000,
};

const approval: PendingApproval = {
  id: "ap-1",
  display: "shell: rm -rf /tmp/x",
  requestedAt: 1_700_000_000_000,
  expiresAt: 1_700_000_030_000,
};

const snapshot: StateSnapshot = {
  sessionId: "s-1",
  transcript: { complete: true, messages: [message] },
  pendingApprovals: [approval],
  // §6.1의 넷째 필드 — §9.4 결정 10이 더했다. 값 도메인을 재는 축은 아래 스냅샷 구역이 든다.
  safety: { approvalMode: "manual", sandbox: "on" },
};

const validFrames: Readonly<Record<string, Frame>> = {
  req: { type: "req", id: "1", method: "prompt.submit", params: { text: "안녕" } },
  res: { type: "res", id: "1", ok: true, payload: { accepted: true } },
  event: { type: "event", seq: 1, event: { type: "agent_start" } },
  state: { type: "state", seq: 1, kind: "handshake", snapshot },
};

// ---------------------------------------------------------------------------
// 타입 층 — 실행하지 않는다. 판정자는 `tsc --noEmit`.
//
// **런타임 단언이 아니다.** `@ts-expect-error`는 *에러가 나지 않으면* 컴파일이 실패하므로,
// 이 구역이 잡는 것은 «타입이 느슨해졌다»이지 «값이 틀렸다»가 아니다.
// ---------------------------------------------------------------------------

function acceptResponse(_frame: ResponseFrame): void {}
function acceptWindow(_window: TranscriptWindow): void {}
function acceptState(_frame: ServerStateFrame): void {}

function typeLevelSurface(): void {
  const error = { code: "E_BAD", message: "안 된다" };

  // §6 — 응답의 두 갈래는 `ok`로 닫힌다. 성공 갈래는 오류를 들 수 없다.
  // @ts-expect-error §6 — `ok: true`에 `error`를 함께 실을 수 없다
  acceptResponse({ type: "res", id: "1", ok: true, error });
  // @ts-expect-error §6 — `ok: false`에 `payload`를 함께 실을 수 없다
  acceptResponse({ type: "res", id: "1", ok: false, error, payload: 1 });
  // @ts-expect-error §6 — `ok: false`는 `error`가 필수다
  acceptResponse({ type: "res", id: "1", ok: false });
  acceptResponse({ type: "res", id: "1", ok: true });
  acceptResponse({ type: "res", id: "1", ok: false, error });

  // §6.1 — 트랜스크립트 창의 두 갈래. «온전한데 생략 수가 있다»가 표현되지 않는다.
  // @ts-expect-error §6.1 — `complete: true`에 `omitted`를 실을 수 없다
  acceptWindow({ complete: true, messages: [], omitted: 3 });
  // @ts-expect-error §6.1 — «잘렸는데 생략 수가 없다»도 표현되지 않는다
  acceptWindow({ complete: false, messages: [] });
  acceptWindow({ complete: true, messages: [message] });
  acceptWindow({ complete: false, messages: [message], omitted: 3 });

  // §6.1 — 상태 프레임의 갈래는 서로의 필드를 들 수 없다.
  // @ts-expect-error §6.1 — *"`shutdown`에 페이로드를 두지 않는다."*
  acceptState({ type: "state", seq: 2, kind: "shutdown", snapshot });
  // @ts-expect-error §6.1 — `kind`는 넷으로 닫혔다
  acceptState({ type: "state", seq: 2, kind: "approval_expired" });
  acceptState({ type: "state", seq: 2, kind: "shutdown" });

  // §6.1 — *"프로토콜 버전을 여기 싣지 않는다"*. 실을 자리가 타입에 없다.
  // @ts-expect-error §6.1 — 스냅샷에 프로토콜 버전 필드가 없다
  const _versioned: StateSnapshot = { ...snapshot, protocolVersion: 1 };
  void _versioned;

  // §3.2 — `resolvedBy`는 셋이다. 넷째는 없다.
  const settled: ApprovalOutcome = { decision: "deny", resolvedBy: "shutdown" };
  void settled;
  // @ts-expect-error §3.2 — `resolvedBy`의 값은 셋으로 닫혔다
  const _bogus: ApprovalOutcome = { decision: "deny", resolvedBy: "connection_lost" };
  void _bogus;
}
void typeLevelSurface;

/**
 * 같은 계약을 **신선도를 잃은 값**으로 다시 잰다 — 위 구역과 잡는 것이 다르다.
 *
 * 위의 리터럴들은 TypeScript의 초과 속성 검사가 잡는다. 그 검사는 «갓 만들어진 객체
 * 리터럴»에만 걸리므로, 변수에 담았거나 스프레드로 조립한 프레임은 그 그물을 지나간다 —
 * **그리고 서버가 프레임을 만드는 형태가 그쪽이다.** 이 구역이 재는 것은 판별자 폐쇄가
 * 그 경로에서도 참인가이고, 그것을 세우는 것은 `?: never` 가드다.
 *
 * 2026-08-25 실측: 가드를 떼면 위 구역은 전부 그대로 그린이고 **이 구역만 붉어진다.**
 * 즉 이 구역이 없으면 가드가 계약을 사는지 아무도 안 잰다.
 */
function typeLevelSurfaceWithoutFreshness(): void {
  const error = { code: "E_BAD", message: "안 된다" };

  const okResponse = { type: "res", id: "1", ok: true } as const;
  const okWithError = { ...okResponse, error };
  // @ts-expect-error §6 — 조립된 값에서도 `ok: true`는 `error`를 들 수 없다
  acceptResponse(okWithError);

  const truncated = { complete: false, messages: [message], omitted: 3 } as const;
  const window: TranscriptWindow = truncated;
  void window;

  const completeWindow = { complete: true, messages: [message], omitted: 3 };
  // @ts-expect-error §6.1 — 조립된 값에서도 «온전한데 생략 수가 있다»는 표현되지 않는다
  const _window: TranscriptWindow = completeWindow;
  void _window;

  const shutdownWithPayload = { type: "state", seq: 2, kind: "shutdown", snapshot } as const;
  // @ts-expect-error §6.1 — 조립된 값에서도 `shutdown`은 페이로드를 들 수 없다
  const _state: ServerStateFrame = shutdownWithPayload;
  void _state;
}
void typeLevelSurfaceWithoutFreshness;

/**
 * §6.1 — `kind`를 소진하지 않는 `switch`는 컴파일되지 않는다.
 *
 * `default`에서 `never`에 담아 보는 것이 그 판정 수단이다. 넷째 갈래를 빼면 남는 타입이
 * `never`가 아니므로 아래 `@ts-expect-error`가 실제 에러를 소비한다 — 소진 검사가 헐거워지면
 * 그 에러가 사라지고 **이 파일이 컴파일에 실패한다.**
 */
function nonExhaustive(frame: ServerStateFrame): string {
  switch (frame.kind) {
    case "handshake":
      return "handshake";
    case "shutdown":
      return "shutdown";
    case "approval_pending":
      return "approval_pending";
    default: {
      // @ts-expect-error §6.1 — `approval_settled`를 소진하지 않았다
      const unreachable: never = frame;
      return String(unreachable);
    }
  }
}
void nonExhaustive;

/** 넷을 다 소진하면 `default`에서 `never`가 되고 컴파일된다 — 위 판정의 대조군 */
function exhaustive(frame: ServerStateFrame): string {
  switch (frame.kind) {
    case "handshake":
      return frame.snapshot.sessionId;
    case "shutdown":
      return "shutdown";
    case "approval_pending":
      return frame.approval.id;
    case "approval_settled":
      return frame.outcome.resolvedBy;
    default: {
      const unreachable: never = frame;
      return String(unreachable);
    }
  }
}
void exhaustive;

/** §5 규칙 1·3 — 이벤트 봉투가 나르는 것은 코어의 타입 그대로다 */
function eventFrameCarriesCoreEvent(): void {
  const frame: ServerEventFrame = { type: "event", seq: 7, event: { type: "turn_start" } };
  void frame;
}
void eventFrameCarriesCoreEvent;

// ---------------------------------------------------------------------------
// 1. 미지 필드 거부 — §6. 프레임 타입 넷 각각.
// ---------------------------------------------------------------------------

describe("미지 필드 거부 (§6)", () => {
  for (const [name, frame] of Object.entries(validFrames)) {
    test(`${name} 프레임이 그대로는 통과한다`, () => {
      expect(frameSchema.safeParse(frame).success).toBe(true);
    });

    test(`${name} 프레임에 미지 필드를 더하면 파싱 에러다`, () => {
      const result = frameSchema.safeParse({ ...frame, typo: 1 });
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.issues.some((i) => i.code === "unrecognized_keys")).toBe(true);
    });
  }

  test("중첩된 객체의 미지 필드도 거부한다 — `PendingApproval`(§7)", () => {
    const bad = { ...approval, urgency: "high" };
    expect(pendingApprovalSchema.safeParse(bad).success).toBe(false);
  });

  test("중첩된 객체의 미지 필드도 거부한다 — `StateSnapshot`(§6.1)", () => {
    const bad = { ...snapshot, protocolVersion: 1 };
    expect(stateSnapshotSchema.safeParse(bad).success).toBe(false);
  });

  test("오류 객체의 미지 필드도 거부한다 — §6의 `error`", () => {
    const bad = { type: "res", id: "1", ok: false, error: { code: "E", message: "m", hint: "x" } };
    expect(frameSchema.safeParse(bad).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. 열린 필드 — §6. `params`·`payload`는 검증 대상이 아니다.
// ---------------------------------------------------------------------------

describe("열린 필드 (§6)", () => {
  for (const value of [{ a: 1 }, [1, 2], "문자열", 0, null, true]) {
    test(`params가 ${JSON.stringify(value)}여도 통과한다`, () => {
      const frame = { type: "req", id: "1", method: "m", params: value };
      expect(requestFrameSchema.safeParse(frame).success).toBe(true);
    });

    test(`payload가 ${JSON.stringify(value)}여도 통과한다`, () => {
      const frame = { type: "res", id: "1", ok: true, payload: value };
      expect(responseFrameSchema.safeParse(frame).success).toBe(true);
    });
  }

  test("params가 없어도 통과한다 — 옵셔널이다", () => {
    expect(requestFrameSchema.safeParse({ type: "req", id: "1", method: "m" }).success).toBe(true);
  });

  test("payload가 없어도 통과한다 — 옵셔널이다", () => {
    expect(responseFrameSchema.safeParse({ type: "res", id: "1", ok: true }).success).toBe(true);
  });

  test("`method`는 열려 있지 않다 — 문자열이 아니면 거부한다", () => {
    expect(requestFrameSchema.safeParse({ type: "req", id: "1", method: 7 }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. 응답의 두 갈래 — §6. 런타임 층에서도 섞이지 않는다.
// ---------------------------------------------------------------------------

describe("응답의 두 갈래 (§6)", () => {
  test("`ok: true`에 `error`를 실으면 파싱 에러다", () => {
    const bad = { type: "res", id: "1", ok: true, error: { code: "E", message: "m" } };
    expect(frameSchema.safeParse(bad).success).toBe(false);
  });

  test("`ok: false`에 `payload`를 실으면 파싱 에러다", () => {
    const bad = { type: "res", id: "1", ok: false, error: { code: "E", message: "m" }, payload: 1 };
    expect(frameSchema.safeParse(bad).success).toBe(false);
  });

  test("`ok: false`인데 `error`가 없으면 파싱 에러다", () => {
    expect(frameSchema.safeParse({ type: "res", id: "1", ok: false }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. `seq` — §6 *"연결마다 1부터 단조 증가한다"*.
// ---------------------------------------------------------------------------

describe("seq (§6 · §6.1)", () => {
  test('1이 통과한다 — *"핸드셰이크는 `seq` 1이다."*', () => {
    const frame = { type: "state", seq: 1, kind: "handshake", snapshot };
    expect(serverStateFrameSchema.safeParse(frame).success).toBe(true);
  });

  for (const seq of [0, -1, 1.5, Number.NaN]) {
    test(`${seq}은 통과하지 않는다 — 1부터의 단조 증가가 표현할 수 없는 값이다`, () => {
      const event = { type: "event", seq, event: { type: "agent_start" } };
      expect(serverEventFrameSchema.safeParse(event).success).toBe(false);
      const state = { type: "state", seq, kind: "shutdown" };
      expect(serverStateFrameSchema.safeParse(state).success).toBe(false);
    });
  }

  test("두 푸시 프레임이 같은 필드 이름을 쓴다 — 카운터가 하나인 것의 표면", () => {
    const event = serverEventFrameSchema.parse(validFrames.event);
    const state = serverStateFrameSchema.parse(validFrames.state);
    expect(Object.hasOwn(event, "seq")).toBe(true);
    expect(Object.hasOwn(state, "seq")).toBe(true);
  });

  test("요청·응답 프레임에는 `seq`가 없다 — 푸시가 아니다", () => {
    const req = { type: "req", id: "1", method: "m", seq: 1 };
    expect(frameSchema.safeParse(req).success).toBe(false);
    const res = { type: "res", id: "1", ok: true, seq: 1 };
    expect(frameSchema.safeParse(res).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. 상태 프레임의 갈래 넷 — §6.1.
// ---------------------------------------------------------------------------

describe("상태 프레임의 갈래 넷 (§6.1)", () => {
  const kinds = ["handshake", "shutdown", "approval_pending", "approval_settled"];
  const outcome: ApprovalOutcome = { decision: "allow", resolvedBy: "client" };
  const byKind: Readonly<Record<string, ServerStateFrame>> = {
    handshake: { type: "state", seq: 1, kind: "handshake", snapshot },
    shutdown: { type: "state", seq: 2, kind: "shutdown" },
    approval_pending: { type: "state", seq: 3, kind: "approval_pending", approval },
    approval_settled: { type: "state", seq: 4, kind: "approval_settled", id: "ap-1", outcome },
  };

  test("갈래는 정확히 넷이다", () => {
    expect(Object.keys(byKind).sort()).toEqual([...kinds].sort());
  });

  for (const kind of kinds) {
    test(`${kind}가 통과한다`, () => {
      expect(serverStateFrameSchema.safeParse(byKind[kind]).success).toBe(true);
    });
  }

  test("다섯째 `kind`는 거부한다 — 유니온이 닫혀 있다", () => {
    const bad = { type: "state", seq: 5, kind: "approval_expired" };
    expect(serverStateFrameSchema.safeParse(bad).success).toBe(false);
  });

  test('*"`shutdown`에 페이로드를 두지 않는다."* — 사유를 실으면 파싱 에러다', () => {
    const bad = { type: "state", seq: 2, kind: "shutdown", reason: "SIGTERM" };
    expect(serverStateFrameSchema.safeParse(bad).success).toBe(false);
  });

  test("handshake는 스냅샷이 필수다", () => {
    const bad = { type: "state", seq: 1, kind: "handshake" };
    expect(serverStateFrameSchema.safeParse(bad).success).toBe(false);
  });

  test("approval_settled는 id와 outcome이 필수다", () => {
    const bad = { type: "state", seq: 4, kind: "approval_settled", id: "ap-1" };
    expect(serverStateFrameSchema.safeParse(bad).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. `TranscriptWindow` — §6.1. 판별된 두 갈래이고 감시값이 없다.
// ---------------------------------------------------------------------------

describe("TranscriptWindow (§6.1)", () => {
  test("온전한 창이 통과한다", () => {
    const window: TranscriptWindow = { complete: true, messages: [message] };
    expect(transcriptWindowSchema.safeParse(window).success).toBe(true);
  });

  test("잘린 창이 생략 수와 함께 통과한다", () => {
    const window: TranscriptWindow = { complete: false, messages: [message], omitted: 12 };
    expect(transcriptWindowSchema.safeParse(window).success).toBe(true);
  });

  test("«온전한데 생략 수가 있다»가 파싱 에러다", () => {
    const bad = { complete: true, messages: [message], omitted: 12 };
    expect(transcriptWindowSchema.safeParse(bad).success).toBe(false);
  });

  test("«잘렸는데 생략 수가 없다»가 파싱 에러다", () => {
    const bad = { complete: false, messages: [message] };
    expect(transcriptWindowSchema.safeParse(bad).success).toBe(false);
  });

  test("감시값을 쓰지 않는다 — 생략 수에 `-1`이 들어오면 파싱 에러다", () => {
    const bad = { complete: false, messages: [message], omitted: -1 };
    expect(transcriptWindowSchema.safeParse(bad).success).toBe(false);
  });

  test("메시지는 코어 스키마가 잰다 — 형태가 깨진 메시지는 파싱 에러다", () => {
    const bad = { complete: true, messages: [{ role: "user" }] };
    expect(transcriptWindowSchema.safeParse(bad).success).toBe(false);
  });

  // 이 구역이 재는 것은 **zod가 통과시키는 필드 집합**이지 픽스처의 모양이 아니다.
  // 2026-08-26 §9.4 결정 10이 §6.1에 넷째 필드를 더했고, 그래서 이 축의 이름과 값이
  // 함께 움직였다 — 수만 늘리면 그 축이 새 정본을 재는지 아무도 안 본다.
  test("스냅샷이 드는 것은 넷이다 — §6.1의 열거 그대로", () => {
    const parsed = stateSnapshotSchema.parse(snapshot);
    expect(Object.keys(parsed).sort()).toEqual([
      "pendingApprovals",
      "safety",
      "sessionId",
      "transcript",
    ]);
  });

  test("안전 사실이 빠진 스냅샷은 파싱 에러다 — 옵셔널로 새지 않는다", () => {
    const { safety: _safety, ...withoutSafety } = snapshot;
    expect(stateSnapshotSchema.safeParse(withoutSafety).success).toBe(false);
  });

  // §6.1: *"`packages/cli`의 설정 유니온을 그대로 옮긴 것이고 이 문서가 넓히지 않는다"*.
  // 이 축이 없으면 스키마를 `z.string()`으로 써도 위 축들이 전부 그린이고, 그 문장이
  // 런타임 층에서 안 재진다.
  for (const [label, bad] of [
    ["approvalMode가 목록 밖", { ...snapshot, safety: { approvalMode: "auto", sandbox: "on" } }],
    ["sandbox가 목록 밖", { ...snapshot, safety: { approvalMode: "manual", sandbox: "yes" } }],
    [
      "안전 사실에 없는 키가 실림",
      { ...snapshot, safety: { approvalMode: "manual", sandbox: "on", sandboxImage: "debian" } },
    ],
  ] as const) {
    test(`안전 사실의 값 도메인이 닫혀 있다 — ${label}이면 파싱 에러다`, () => {
      expect(stateSnapshotSchema.safeParse(bad).success).toBe(false);
    });
  }

  for (const approvalMode of ["manual", "off"] as const) {
    for (const sandbox of ["on", "off"] as const) {
      test(`설정 유니온의 조합이 통과한다 — ${approvalMode}/${sandbox}`, () => {
        const value = { ...snapshot, safety: { approvalMode, sandbox } };
        expect(stateSnapshotSchema.safeParse(value).success).toBe(true);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 7. 승인 — §7 · §3.2.
// ---------------------------------------------------------------------------

describe("승인 (§7 · §3.2)", () => {
  test("`PendingApproval`이 드는 것은 넷이다", () => {
    const parsed = pendingApprovalSchema.parse(approval);
    expect(Object.keys(parsed).sort()).toEqual(["display", "expiresAt", "id", "requestedAt"]);
  });

  for (const resolvedBy of ["client", "timeout", "shutdown"]) {
    test(`resolvedBy "${resolvedBy}"가 통과한다 — §3.2가 셋으로 넓혔다`, () => {
      const outcome = { decision: "deny", resolvedBy };
      expect(approvalOutcomeSchema.safeParse(outcome).success).toBe(true);
    });
  }

  test("넷째 `resolvedBy`는 거부한다", () => {
    const bad = { decision: "deny", resolvedBy: "connection_lost" };
    expect(approvalOutcomeSchema.safeParse(bad).success).toBe(false);
  });

  test("`decision`은 둘로 닫혀 있다", () => {
    const bad = { decision: "ask_later", resolvedBy: "client" };
    expect(approvalOutcomeSchema.safeParse(bad).success).toBe(false);
  });

  test("표시 문면을 가공하지 않는다 — 파싱 왕복이 바이트 동일이다", () => {
    const display = "shell: rm -rf /tmp/x\n  · 줄바꿈·공백·유니코드 ✅ 그대로";
    const parsed = pendingApprovalSchema.parse({ ...approval, display });
    expect(parsed.display).toBe(display);
  });
});

// ---------------------------------------------------------------------------
// 8. 이벤트 봉투 — §5 규칙 1·3. 봉투는 우리가 닫고 안의 값은 코어가 소유한다.
// ---------------------------------------------------------------------------

describe("이벤트 봉투 (§5 · §6)", () => {
  test("봉투의 미지 필드는 거부한다", () => {
    const bad = { type: "event", seq: 1, event: { type: "agent_start" }, source: "x" };
    expect(serverEventFrameSchema.safeParse(bad).success).toBe(false);
  });

  test("`event`가 객체가 아니면 거부한다", () => {
    const bad = { type: "event", seq: 1, event: "agent_start" };
    expect(serverEventFrameSchema.safeParse(bad).success).toBe(false);
  });

  test("`event`가 없으면 거부한다 — 빈 봉투를 통과시키지 않는다", () => {
    expect(serverEventFrameSchema.safeParse({ type: "event", seq: 1 }).success).toBe(false);
  });

  test("코어가 이벤트를 넓혀도 봉투가 막지 않는다 — 안쪽은 코어가 소유한다", () => {
    const frame = { type: "event", seq: 1, event: { type: "some_future_event", extra: 1 } };
    expect(serverEventFrameSchema.safeParse(frame).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 9. 프레임 유니온 — §6. 넷이고 그 밖은 없다.
// ---------------------------------------------------------------------------

describe("프레임 유니온 (§6)", () => {
  test("`type`은 넷으로 닫혀 있다", () => {
    expect(Object.keys(validFrames).sort()).toEqual(["event", "req", "res", "state"]);
  });

  test("다섯째 `type`은 거부한다", () => {
    expect(frameSchema.safeParse({ type: "ping", id: "1" }).success).toBe(false);
  });

  test("`type`이 없으면 거부한다", () => {
    expect(frameSchema.safeParse({ id: "1", method: "m" }).success).toBe(false);
  });

  test("전송 이름이 프레임에 나타나지 않는다 — §2.1의 전송 무지", () => {
    const keys = Object.values(validFrames).flatMap((frame) => Object.keys(frame));
    for (const forbidden of ["sse", "event:", "http", "socket", "ws"]) {
      expect(keys.some((key) => key.toLowerCase().includes(forbidden))).toBe(false);
    }
  });
});
