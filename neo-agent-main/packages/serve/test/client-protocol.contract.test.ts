/**
 * T-012 — 브라우저 프로토콜 모듈의 계약 검증. 정본은 `docs/WEB-UI.md` §9.3이고, 그 절이 이
 * 모듈에 계약 셋을 못박았다.
 *
 * **기대값은 구현이 아니라 계약 문서에서만 도출했다.** 구현이 문서와 다르면 이 파일은 문서
 * 편에 선다.
 *
 *   - `WEB-UI.md` §9.3 — *"재접속 억제·갭 판정·판별자 소진을 순수 함수로 갈라 유닛 테스트가
 *                         잰다."*, *"우리 정책은 갈래가 하나다"* — 고지를 받으면 멈춘다
 *   - `WEB-UI.md` §6   — *"첫 프레임은 반드시 핸드셰이크다."*, *"연결마다 1부터 단조
 *                         증가한다"*, 프레임 넷과 판별자 폐쇄
 *   - `WEB-UI.md` §6.1 — *"핸드셰이크는 `seq` 1이다."*, *"`shutdown`을 받은 클라이언트는
 *                         재접속하지 않는다."*, `kind` 넷, *"모르는 판별자 값은 닫힌 유니온의
 *                         파싱 에러이므로 가시적이다"*
 *   - `WEB-UI.md` §8   — *"클라이언트는 번호가 건너뛰면 갭으로 판정한다."*,
 *                         *"갭의 처리는 재접속이다."*
 *
 * **픽스처의 타입은 `../src/protocol.ts`에서 온다.** 그것이 §9.3이 요구한 배치다 — 프레임
 * 유니온의 정의가 하나이고, 브라우저 모듈은 그 정의를 JSDoc으로 들여온다. 여기 사본을 두면
 * 서버가 유니온을 넓혔을 때 이 검증이 옛 계약을 재게 된다.
 *
 * **전송은 안 부른다.** 계약 셋은 전부 순수 함수이고, 소켓을 여는 자리는 `client/stream.js`
 * 하나다(§9.3). 이 파일이 그 파일을 안 부르는 것이 그 분리의 표시다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로 있는
 * 부분 문자열이고, 문서를 지목하는 자리는 절 번호와 필드 이름으로 한다.
 */

import type { AgentMessage } from "@neo-agent/core";
import { describe, expect, test } from "vitest";
import {
  advance,
  INITIAL_STREAM_STATE,
  pushSeq,
  readFrame,
  reconnectAllowed,
  stateEffect,
} from "../client/protocol.js";
import type {
  ApprovalOutcome,
  Frame,
  PendingApproval,
  ServerStateFrame,
  StateSnapshot,
} from "../src/protocol.ts";

// ---------------------------------------------------------------------------
// 픽스처 — 프레임은 정본 타입으로 짓고 와이어에서처럼 문자열로 건넨다
// ---------------------------------------------------------------------------

const message: AgentMessage = {
  id: "3c8f2a10-91b4-4d27-8f6e-0a5c1e7d9b33",
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

const outcome: ApprovalOutcome = { decision: "deny", resolvedBy: "shutdown" };

const snapshot: StateSnapshot = {
  sessionId: "s-1",
  transcript: { complete: true, messages: [message] },
  pendingApprovals: [approval],
};

const handshake = (seq: number): Frame => ({ type: "state", seq, kind: "handshake", snapshot });
const shutdown = (seq: number): Frame => ({ type: "state", seq, kind: "shutdown" });
const pending = (seq: number): Frame => ({
  type: "state",
  seq,
  kind: "approval_pending",
  approval,
});
const settled = (seq: number): Frame => ({
  type: "state",
  seq,
  kind: "approval_settled",
  id: approval.id,
  outcome,
});
const progress = (seq: number): Frame => ({ type: "event", seq, event: { type: "agent_start" } });

const wire = (frame: Frame): string => JSON.stringify(frame);

/** 와이어 줄들을 초기 상태에 차례로 접는다. 부작용이 없으므로 순서가 전부다 */
const fold = (lines: readonly string[]): ReturnType<typeof advance> =>
  lines.reduce<ReturnType<typeof advance>>(
    (state, line) => advance(state, line),
    INITIAL_STREAM_STATE,
  );

const foldFrames = (frames: readonly Frame[]): ReturnType<typeof advance> => fold(frames.map(wire));

// ---------------------------------------------------------------------------
// 계약 ① — 고지 뒤 재접속 금지 (§9.3 · §6.1)
// ---------------------------------------------------------------------------

/**
 * 정책에 `disconnects`번 묻고 붙어도 된다는 답이 몇 번 나오는지 센다. 재접속 시도의 수를 순수 함수의
 * 반환으로 재는 수단이고, 소켓을 열지 않으므로 세는 것이 곧 계약이다.
 */
const reconnectAttempts = (state: ReturnType<typeof advance>, disconnects: number): number => {
  let attempts = 0;
  for (let i = 0; i < disconnects; i += 1) if (reconnectAllowed(state)) attempts += 1;
  return attempts;
};

describe("WEB-UI §9.3 계약 ① — 종료 고지를 받으면 멈춘다", () => {
  test("`shutdown`을 받은 뒤 재접속 시도가 0건이다", () => {
    const state = foldFrames([handshake(1), progress(2), shutdown(3)]);
    expect(state.phase).toBe("ended");
    expect(reconnectAttempts(state, 5)).toBe(0);
  });

  test("역대조 — 고지가 없으면 같은 횟수만큼 붙는다", () => {
    // 이 짝이 없으면 위 단언은 항상 0을 내는 정책에서도 그린이다.
    const state = foldFrames([handshake(1), progress(2)]);
    expect(state.phase).toBe("live");
    expect(reconnectAttempts(state, 5)).toBe(5);
  });

  test("갈래가 하나다 — 갭도 결함도 재접속을 막지 않는다", () => {
    // 근거: §9.3 — *"우리 정책은 갈래가 하나다"*. 멈추는 사유는 고지 하나뿐이고, §8이 갭의
    // 처리를 재접속으로 정했으므로 갭에서 멈추면 복구 경로가 사라진다.
    const gapped = foldFrames([handshake(1), progress(2), progress(4)]);
    expect(gapped.phase).toBe("gap");
    expect(reconnectAttempts(gapped, 3)).toBe(3);

    const broken = fold([wire(handshake(1)), '{"type":"bogus"}']);
    expect(broken.phase).toBe("broken");
    expect(reconnectAttempts(broken, 3)).toBe(3);
  });

  test("고지 뒤에 오는 프레임이 상태를 되돌리지 못한다", () => {
    // 종단 상태다. 되돌아갈 수 있으면 고지를 받고 멈춘다는 계약이 서버가 더 보내는 것만으로 깨진다.
    const state = foldFrames([handshake(1), shutdown(2), progress(3)]);
    expect(state.phase).toBe("ended");
    expect(reconnectAttempts(state, 3)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 계약 ② — 푸시 전부가 하나의 `seq` 카운터 (§6.1 · §8)
// ---------------------------------------------------------------------------

describe("WEB-UI §6.1·§8 계약 ② — 갭 판정은 한 수열 위에서 난다", () => {
  test("`event`와 `state`를 섞어도 연속이면 진행한다", () => {
    // 근거: §6.1 — 카운터가 하나인 것이 계약이다. 프레임 타입별로 가르면 아래 수열은 각각
    // 1,2 / 1,2,3 이 되어 갭이 원리적으로 안 보인다.
    const state = foldFrames([handshake(1), progress(2), pending(3), progress(4), settled(5)]);
    expect(state).toEqual({ phase: "live", lastSeq: 5 });
  });

  test("1,2,4가 갭으로 판정된다", () => {
    const state = foldFrames([handshake(1), progress(2), progress(4)]);
    expect(state).toEqual({ phase: "gap", lastSeq: 2, expected: 3, received: 4 });
  });

  test("섞인 수열에서도 1,2,4가 갭으로 판정된다", () => {
    // 건너뛴 자리가 `state`이고 도착한 것이 `event`인 경우, 그리고 그 반대.
    expect(foldFrames([handshake(1), pending(2), progress(4)])).toEqual({
      phase: "gap",
      lastSeq: 2,
      expected: 3,
      received: 4,
    });
    expect(foldFrames([handshake(1), progress(2), settled(4)])).toEqual({
      phase: "gap",
      lastSeq: 2,
      expected: 3,
      received: 4,
    });
  });

  test("첫 프레임은 핸드셰이크이고 그 `seq`는 1이다", () => {
    // 근거: §6 — *"첫 프레임은 반드시 핸드셰이크다."* · §6.1 — *"핸드셰이크는 `seq` 1이다."*
    // 그 절이 판별 가능해진다고 적은 두 형태가 아래 둘이다.
    const notHandshakeFirst = foldFrames([progress(1)]);
    expect(notHandshakeFirst.phase).toBe("broken");
    expect(notHandshakeFirst).toMatchObject({
      fault: { kind: "first_push_not_handshake", frameType: "event" },
    });

    const handshakeLater = foldFrames([handshake(1), progress(2), handshake(3)]);
    expect(handshakeLater.phase).toBe("broken");
    expect(handshakeLater).toMatchObject({ fault: { kind: "handshake_out_of_order", seq: 3 } });

    // 첫 푸시가 핸드셰이크라도 번호가 1이 아니면 갭이다 — 앞의 것을 잃은 것과 구별되지 않는다.
    expect(foldFrames([handshake(2)])).toEqual({
      phase: "gap",
      lastSeq: 0,
      expected: 1,
      received: 2,
    });
  });

  test("`seq`가 뒤로 가면 결함이다 — 갭이 아니다", () => {
    // [미규정] §6·§8은 번호가 뒤로 가거나 겹치는 경우를 이름 붙이지 않는다. 건너뜀만 갭으로
    // 정의했으므로 갭이 아니고, *"연결마다 1부터 단조 증가한다"*(§6)를 깨므로 정상도 아니다.
    // 확실한 것은 조용히 버리면 안 된다는 것뿐이라 가시적인 결함으로 둔다.
    const state = foldFrames([handshake(1), progress(2), progress(2)]);
    expect(state.phase).toBe("broken");
    expect(state).toMatchObject({ fault: { kind: "not_monotonic", expected: 3, received: 2 } });
  });

  test("푸시가 아닌 프레임은 수열에 자국을 안 남긴다", () => {
    // 근거: §6 — `seq`를 드는 것은 서버→클라이언트 푸시 둘이다. 요청의 반쪽이 카운터를 밀면
    // 갭 판정이 왕복 횟수에 따라 흔들린다.
    const res: Frame = { type: "res", id: "1", ok: true, payload: { accepted: true } };
    const state = fold([wire(handshake(1)), wire(res), wire(progress(2))]);
    expect(state).toEqual({ phase: "live", lastSeq: 2 });
  });

  test("`seq`가 양의 정수가 아니면 결함이다", () => {
    for (const seq of [0, -1, 1.5]) {
      const state = fold([`{"type":"event","seq":${seq},"event":{"type":"agent_start"}}`]);
      expect(state.phase, `seq=${seq}`).toBe("broken");
      expect(state).toMatchObject({ fault: { kind: "bad_seq", seq } });
    }
  });
});

// ---------------------------------------------------------------------------
// 계약 ③ — 판별자 소진 (§6 · §6.1 · §9.3)
// ---------------------------------------------------------------------------

describe("WEB-UI §6·§6.1 계약 ③ — 모르는 판별자가 에러로 나타난다", () => {
  test("모르는 `type`이 결함이다", () => {
    const read = readFrame('{"type":"notify","seq":1}');
    expect(read.ok).toBe(false);
    expect(read).toMatchObject({ fault: { kind: "unknown_type", type: "notify" } });

    // 상태로도 나타난다 — 근거: §6.1의 판정 근거 2. 리스너가 없어 조용히 버려지는 것이 그
    // 절이 갈래 B를 기각한 이유이고, 여기서는 상태가 바뀌므로 화면이 그것을 볼 수 있다.
    const state = fold([wire(handshake(1)), '{"type":"notify","seq":2}']);
    expect(state.phase).toBe("broken");
  });

  test("모르는 `kind`가 결함이다", () => {
    const read = readFrame('{"type":"state","seq":1,"kind":"drain"}');
    expect(read.ok).toBe(false);
    expect(read).toMatchObject({ fault: { kind: "unknown_state_kind", stateKind: "drain" } });

    const state = fold(['{"type":"state","seq":1,"kind":"drain"}']);
    expect(state.phase).toBe("broken");
  });

  test("`kind` 넷은 전부 읽힌다", () => {
    // 위 단언의 짝이다. 넷 중 하나라도 거부되면 모르는 것을 거부한다는 계약이 아는 것도 거부한다로
    // 되고, 그 상태에서도 앞 테스트는 그린이다.
    for (const frame of [handshake(1), shutdown(1), pending(1), settled(1)])
      expect(readFrame(wire(frame)).ok, JSON.stringify(frame)).toBe(true);
  });

  test("JSON이 아니거나 객체가 아니면 결함이다", () => {
    expect(readFrame("{").ok).toBe(false);
    expect(readFrame("{")).toMatchObject({ fault: { kind: "malformed_json" } });
    expect(readFrame("null")).toMatchObject({ fault: { kind: "not_object" } });
    expect(readFrame("[]")).toMatchObject({ fault: { kind: "not_object" } });
    expect(readFrame('"state"')).toMatchObject({ fault: { kind: "not_object" } });
  });

  test("`stateEffect`가 `kind` 넷을 전부 처분한다", () => {
    // 이 함수가 §9.3이 요구한 소진 검사의 자리다. 타입 층의 판정자는 `client/tsconfig.json`을
    // 도는 타입 검사이고(T-013), 여기서는 실행한 갈래가 넷 다인 것을 잰다.
    const kinds: ServerStateFrame["kind"][] = [
      "handshake",
      "shutdown",
      "approval_pending",
      "approval_settled",
    ];
    const frames = [handshake(1), shutdown(1), pending(1), settled(1)] as ServerStateFrame[];
    expect(frames.map((frame) => frame.kind)).toEqual(kinds);
    expect(frames.map((frame) => stateEffect(frame).effect)).toEqual([
      "replace_snapshot",
      "stop",
      "approval_open",
      "approval_close",
    ]);
    expect(stateEffect(frames[0] as ServerStateFrame)).toEqual({
      effect: "replace_snapshot",
      snapshot,
    });
    expect(stateEffect(frames[3] as ServerStateFrame)).toEqual({
      effect: "approval_close",
      id: approval.id,
      outcome,
    });
  });

  test("`pushSeq`가 프레임 타입 넷을 전부 처분한다", () => {
    const req: Frame = { type: "req", id: "1", method: "prompt.submit", params: { text: "안녕" } };
    const res: Frame = { type: "res", id: "1", ok: true };
    expect([req, res, progress(7), pending(9)].map((frame) => pushSeq(frame))).toEqual([
      null,
      null,
      7,
      9,
    ]);
  });
});
