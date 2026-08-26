/**
 * T-004 — 브라우저 프로토콜 모듈의 계약 검증. 정본은 `docs/WEB-UI.md` **§8.1**이고, 그 절의
 * 「계약의 형태」가 이 모듈에 계약 **넷**을 못박았다. (2026-08-26 재작성 — 그 전까지 이 파일은
 * 멈추는 사유가 하나라는 §9.3의 옛 문면을 축 이름과 근거로 들고 있었고, **그 문면은 §8.1
 * 신설과 함께 정본에서 걷혔다** — 그 절이 *"멈추는 사유는 둘이고 연결의 처분은 셋이며, 그
 * 표는 §8.1이 든다"*로 다시 쓰였다. 결함의 처분이 뒤집혔으므로 낡은 축을 남기면 이 파일이
 * 없는 계약을 재게 된다.)
 *
 * **기대값은 구현이 아니라 계약 문서에서만 도출했다.** `client/protocol.js`에서 읽은 것은
 * export 이름과 시그니처(타입 선언)뿐이고 값·분기 조건은 읽지 않았다. 구현이 문서와 다르면
 * 이 파일은 문서 편에 선다.
 *
 *   - `WEB-UI.md` §8.1 — 계약 넷. *"연결의 생멸 사건이 수열 상태를 초기값으로 되돌리고,
 *                         종단은 그 사건을 흡수한다"*, *"프레임과 연결 사건이 한 알파벳에
 *                         든다"*, *"배선은 이 셋을 적용만 하고 스스로 고르지 않는다"*,
 *                         *"낡은 연결의 통지가 상태에 도달하지 않는다"*
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
 * **전송은 안 부른다.** 계약 넷 중 셋이 순수 함수의 성질이고, 소켓을 여는 자리는
 * `client/stream.js` 하나다(§9.3). 이 파일이 그 파일을 안 부르는 것이 그 분리의 표시다.
 * **넷째는 이 축이 못 잰다** — §8.1이 그 사실을 직접 적었고, 아래 계약 ④ 절이 그 한계를
 * 코드로 든다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로 있는
 * 부분 문자열이고, 문서를 지목하는 자리는 절 번호와 필드 이름으로 한다.
 */

import type { AgentMessage } from "@neo-agent/core";
import { describe, expect, test } from "vitest";
import type {
  ConnectionDisposition,
  StreamFault,
  StreamSignal,
  StreamState,
} from "../client/protocol.js";
import {
  advance,
  applySignal,
  disposition,
  INITIAL_STREAM_STATE,
  pushSeq,
  readFrame,
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
const fold = (lines: readonly string[]): StreamState =>
  lines.reduce<StreamState>((state, line) => advance(state, line), INITIAL_STREAM_STATE);

const foldFrames = (frames: readonly Frame[]): StreamState => fold(frames.map(wire));

// ---------------------------------------------------------------------------
// 신호 — §8.1 「계약의 형태」의 알파벳 셋
// ---------------------------------------------------------------------------

const OPENED: StreamSignal = { kind: "opened" };
const dropped = (retrying: boolean): StreamSignal => ({ kind: "dropped", retrying });
const lineSignal = (text: string): StreamSignal => ({ kind: "frame", read: readFrame(text) });
const frameSignal = (frame: Frame): StreamSignal => lineSignal(wire(frame));

/** 신호들을 초기 상태에 차례로 접는다. 프레임과 연결 사건이 같은 알파벳이므로 한 폴드에 든다 */
const foldSignals = (signals: readonly StreamSignal[]): StreamState =>
  signals.reduce<StreamState>((state, signal) => applySignal(state, signal), INITIAL_STREAM_STATE);

/**
 * 전이표·처분표의 행을 채울 phase별 대표 상태. **`Readonly<Record<StreamState["phase"], …>>`가
 * 양방향으로 붉어진다** — phase가 늘면 미충족, 없는 phase를 쓰면 초과 속성이다.
 */
const SAMPLE: Readonly<Record<StreamState["phase"], StreamState>> = {
  live: foldFrames([handshake(1), progress(2)]),
  gap: foldFrames([handshake(1), progress(2), progress(4)]),
  ended: foldFrames([handshake(1), shutdown(2)]),
  broken: fold([wire(handshake(1)), '{"type":"bogus"}']),
};

/**
 * 「전송이 포기했다」 갈래. **이름은 세부이고 출처는 `StreamFault` 유니온 선언이다** — §8.1이
 * 계약으로 든 것은 *"`StreamFault`에 «전송이 포기했다» 갈래가 하나 는다."*와 그 결과가
 * 「멈춘다」로 가서 가시적이라는 것 둘뿐이다.
 */
const GAVE_UP: StreamFault = { kind: "transport_gave_up" };

// ---------------------------------------------------------------------------
// 계약 ① — 입력 알파벳이 연결 사건을 든다 (§8.1)
// ---------------------------------------------------------------------------

describe("WEB-UI §8.1 계약 ① — 프레임과 연결 사건이 한 알파벳에 든다", () => {
  test("신호 갈래 셋이 전부 상태기계의 입력이다", () => {
    // 근거: §8.1 「계약의 형태」 — *"프레임과 연결 사건이 한 알파벳에 든다"*. 전수 표이므로
    // 갈래가 늘면 미충족, 없는 갈래를 더하면 초과 속성이라 양방향으로 붉어진다.
    const alphabet: Readonly<Record<StreamSignal["kind"], StreamSignal>> = {
      opened: OPENED,
      frame: frameSignal(handshake(1)),
      dropped: dropped(true),
    };
    for (const [kind, signal] of Object.entries(alphabet))
      expect(applySignal(INITIAL_STREAM_STATE, signal), kind).toHaveProperty("phase");
  });

  test("연결 사건이 입력이 아니면 이 축이 못 재는 것을 재고 있다 — 개시가 상태를 바꾼다", () => {
    // 역대조. 위 단언은 신호를 통째로 무시하는 함수에서도 그린이다. §8.1이 연결 사건을
    // 알파벳에 들인 이유가 되돌리는 자리를 개설 함수에 두면 *"그 함수를 안 지나는 개설 경로가
    // 하나라도 있을 때 조용히 갈리고"* 그것이 V-1이라는 것이므로, 개시 신호가 실제로 상태를
    // 움직이는지를 함께 잰다.
    const before = SAMPLE.live;
    expect(before).not.toEqual(INITIAL_STREAM_STATE);
    expect(applySignal(before, OPENED)).toEqual(INITIAL_STREAM_STATE);
  });

  test("프레임 갈래는 읽은 결과를 싣고, 접은 결과가 줄을 접은 것과 같다", () => {
    // 근거: §8.1 — *"읽은 결과를 싣는 쪽이 이 레포의 배치와 맞다"*. 알파벳이 하나라는 것은
    // 프레임이 어느 경로로 들어와도 같은 상태를 낸다는 뜻이다 — 갈리면 정본이 둘이 된다.
    const lines = [wire(handshake(1)), wire(progress(2)), wire(progress(4))];
    expect(foldSignals(lines.map(lineSignal))).toEqual(fold(lines));
  });
});

// ---------------------------------------------------------------------------
// 계약 ② — 처분이 순수 함수의 답이다 (§8.1 「멈추는 사유는 둘, 처분은 셋」)
// ---------------------------------------------------------------------------

/**
 * §8.1의 표 네 행을 그대로 옮긴 것이다. 값의 출처는 그 표이지 구현이 아니다.
 *   진행 중 → *"그대로 둔다"* · 갭 → *"다시 연다"* · 종료 고지 → *"멈춘다"* · 결함 → *"멈춘다"*
 */
const DISPOSITION: Readonly<Record<StreamState["phase"], ConnectionDisposition>> = {
  live: "continue",
  gap: "reopen",
  ended: "stop",
  broken: "stop",
};

describe("WEB-UI §8.1 계약 ② — 처분은 한 자리에서만 정해진다", () => {
  test("네 phase의 처분이 §8.1 표와 1:1이다", () => {
    for (const [phase, expected] of Object.entries(DISPOSITION))
      expect(disposition(SAMPLE[phase as StreamState["phase"]]), phase).toBe(expected);
  });

  test("`reopen`은 갭에서만 난다", () => {
    // 근거: §8 — *"갭의 처리는 재접속이다."* 갭 아닌 자리에서 `reopen`이 나면 배선이 갭이
    // 아닌 것을 갭으로 다루게 되고, 갭에서 안 나면 §8이 정의한 유일한 복구 경로가 사라진다.
    const reopening = Object.keys(DISPOSITION).filter(
      (phase) => disposition(SAMPLE[phase as StreamState["phase"]]) === "reopen",
    );
    expect(reopening).toEqual(["gap"]);
  });

  test("`stop`의 사유는 둘이다 — 고지와 결함", () => {
    // 근거: §6.1 — *"`shutdown`을 받은 클라이언트는 재접속하지 않는다."* ·
    // §8.1 — *"계약이 깨진 스트림은 재접속으로 안 낫는다"*.
    const stopping = Object.keys(DISPOSITION).filter(
      (phase) => disposition(SAMPLE[phase as StreamState["phase"]]) === "stop",
    );
    expect(stopping.sort()).toEqual(["broken", "ended"]);
  });

  test("처분은 상태의 함수다 — 몇 번 물어도 같은 답이 온다", () => {
    // 배선이 처분을 1회성 동작으로 쓰므로(같은 갭에 `reopen`이 두 번 나면 안 된다) 순수
    // 함수 쪽이 호출 횟수에 따라 답을 바꾸면 그 배치가 성립하지 않는다.
    for (const phase of Object.keys(DISPOSITION)) {
      const state = SAMPLE[phase as StreamState["phase"]];
      const answers = [disposition(state), disposition(state), disposition(state)];
      expect(new Set(answers).size, phase).toBe(1);
      expect(state, phase).toEqual(SAMPLE[phase as StreamState["phase"]]);
    }
  });
});

// ---------------------------------------------------------------------------
// 계약 ③ — 생멸 사건이 초기값으로 되돌리고, 종단은 그 사건을 흡수한다 (§8.1)
// ---------------------------------------------------------------------------

/** 연결 사건 셋. 프레임 갈래는 §6 축이 따로 재므로 이 표는 생멸 사건만 든다 */
type ConnEvent = "opened" | "dropped(retrying)" | "dropped(gave_up)";

/** 표의 칸이 뜻하는 결과. `reset`=초기값 · `same`=그대로 · `fault`=결함으로 간다 */
type Outcome = "reset" | "same" | "fault";

const CONN_SIGNAL: Readonly<Record<ConnEvent, StreamSignal>> = {
  opened: OPENED,
  "dropped(retrying)": dropped(true),
  "dropped(gave_up)": dropped(false),
};

/**
 * **값의 출처는 §8.1이지 구현의 표가 아니다.**
 *   - 비종단 두 행의 `opened`·`dropped(retrying)` — *"수열 상태의 초기화는 연결의 생멸 사건에
 *     걸리고, 그 사건은 누가 연결을 열고 닫았는지를 가르지 않는다"* ·
 *     *"연결이 선 것과 연결을 잃은 것도 이 점에서 같은 사건이다"*
 *   - 비종단 두 행의 `dropped(gave_up)` — *"다시 안 붙는 쪽은 결함이고 위 표의 «멈춘다»로 가므로"*
 *   - 종단 두 행 전부 — *"종단은 이 사건을 흡수한다"*. 그 문장이 «생멸 사건»을 통째로 들고,
 *     바로 위 문장이 개시와 상실을 같은 사건이라 못박았으므로 세 칸이 함께 «그대로»다.
 */
const TRANSITIONS: Readonly<Record<StreamState["phase"], Readonly<Record<ConnEvent, Outcome>>>> = {
  live: { opened: "reset", "dropped(retrying)": "reset", "dropped(gave_up)": "fault" },
  gap: { opened: "reset", "dropped(retrying)": "reset", "dropped(gave_up)": "fault" },
  ended: { opened: "same", "dropped(retrying)": "same", "dropped(gave_up)": "same" },
  broken: { opened: "same", "dropped(retrying)": "same", "dropped(gave_up)": "same" },
};

describe("WEB-UI §8.1 계약 ③ — 생멸 사건과 수열 상태", () => {
  test("전이표 전수 — 네 phase × 연결 사건 셋", () => {
    for (const [phase, row] of Object.entries(TRANSITIONS)) {
      const before = SAMPLE[phase as StreamState["phase"]];
      for (const [event, expected] of Object.entries(row)) {
        const after = applySignal(before, CONN_SIGNAL[event as ConnEvent]);
        const where = `${phase} + ${event}`;
        if (expected === "reset") expect(after, where).toEqual(INITIAL_STREAM_STATE);
        else if (expected === "same") expect(after, where).toEqual(before);
        // [미규정] 결함으로 갈 때 `lastSeq`가 무엇이 되는지는 §8.1이 정하지 않는다. 타입이
        // 그 필드를 요구하는데 계약은 값을 안 든다 — 그래서 여기서 재는 것은 phase와 사유뿐이다.
        else expect(after, where).toMatchObject({ phase: "broken", fault: GAVE_UP });
      }
    }
  });

  test("V-1 회귀 — 개시 사건 뒤의 `seq` 1 핸드셰이크가 결함이 아니다", () => {
    // 이 축이 이 사이클의 존재 이유다. §6이 카운터를 연결에 귀속시켰으므로(*"연결마다 1부터
    // 단조 증가한다"*) 새 연결의 첫 핸드셰이크는 이전 연결의 번호 위에 떨어지면 안 된다.
    const reopened = foldSignals([
      frameSignal(handshake(1)),
      frameSignal(progress(2)),
      frameSignal(progress(3)),
      OPENED,
      frameSignal(handshake(1)),
    ]);
    expect(reopened).toEqual({ phase: "live", lastSeq: 1 });
    expect(disposition(reopened)).toBe("continue");
  });

  test("역대조 — 개시 사건 없이 온 두 번째 핸드셰이크는 여전히 결함이다", () => {
    // 이 짝이 없으면 위 단언은 핸드셰이크 순서 검사를 없앤 구현에서도 그린이다.
    // 근거: §6 — *"첫 프레임은 반드시 핸드셰이크다."* · §6.1 — *"핸드셰이크는 `seq` 1이다."*
    const state = foldSignals([
      frameSignal(handshake(1)),
      frameSignal(progress(2)),
      frameSignal(handshake(1)),
    ]);
    expect(state.phase).toBe("broken");
    expect(disposition(state)).toBe("stop");
  });

  test("상실 사건도 되돌린다 — 개시 통지에만 기대지 않는다", () => {
    // 근거: §8.1 — *"개시 하나에만 걸지 않는 이유는 그것이 전송의 통지에 의존하기 때문이다"*.
    // 개시 통지가 아예 안 와도 새 연결의 첫 핸드셰이크가 서야 한다.
    const state = foldSignals([
      frameSignal(handshake(1)),
      frameSignal(progress(2)),
      dropped(true),
      frameSignal(handshake(1)),
    ]);
    expect(state).toEqual({ phase: "live", lastSeq: 1 });
  });

  test("초기화는 멱등이다 — 순서·중복이 판정을 못 바꾼다", () => {
    // 근거: §8.1 — *"초기화는 멱등이다"*. 개시와 상실이 연달아 오든 하나만 오든 값이 같다.
    const sequences: readonly (readonly StreamSignal[])[] = [
      [OPENED],
      [dropped(true)],
      [OPENED, OPENED],
      [dropped(true), OPENED],
      [OPENED, dropped(true)],
      [dropped(true), dropped(true), OPENED, OPENED],
    ];
    for (const tail of sequences) {
      const state = tail.reduce<StreamState>(
        (acc, signal) => applySignal(acc, signal),
        SAMPLE.live,
      );
      expect(state, JSON.stringify(tail)).toEqual(INITIAL_STREAM_STATE);
    }
  });

  test("종단은 프레임도 흡수한다 — 고지 뒤에 오는 프레임이 상태를 되돌리지 못한다", () => {
    // 근거: §6.1 — *"`shutdown`을 받은 클라이언트는 재접속하지 않는다."* 되돌아갈 수 있으면
    // 그 계약이 서버가 더 보내는 것만으로 깨진다.
    const state = foldSignals([
      frameSignal(handshake(1)),
      frameSignal(shutdown(2)),
      frameSignal(progress(3)),
    ]);
    expect(state).toEqual(SAMPLE.ended);
    expect(disposition(state)).toBe("stop");
  });

  test("종단 둘이 서로 다른 사유를 유지한다", () => {
    // 흡수가 아무 일도 안 일어나는 것이어야지 다른 종단으로 옮겨 가는 것이 되면 화면이
    // 고지와 결함을 못 가른다. §8.1의 표가 사유를 둘로 나눈 것이 그 구분이다.
    expect(applySignal(SAMPLE.ended, dropped(false)).phase).toBe("ended");
    expect(applySignal(SAMPLE.broken, dropped(false))).toEqual(SAMPLE.broken);
  });
});

// ---------------------------------------------------------------------------
// 상실 신호 — «포기한 것»은 «끊긴 것»과 다르다 (§8.1)
// ---------------------------------------------------------------------------

describe("WEB-UI §8.1 — 상실 신호가 «다시 붙을 것인가»를 함께 든다", () => {
  test("`retrying=true`는 결함이 아니고 처분이 «그대로 둔다»다", () => {
    // 근거: §8.1 — *"상태는 «진행 중»으로 돌아가고 처분은 «그대로 둔다»가 된다"*.
    const state = applySignal(SAMPLE.live, dropped(true));
    expect(state).toEqual(INITIAL_STREAM_STATE);
    expect(state).not.toHaveProperty("fault");
    expect(disposition(state)).toBe("continue");
  });

  test("`retrying=false`는 가시적인 결함이다", () => {
    // 근거: §8.1 — *"다시 안 붙는 쪽은 결함이고 위 표의 «멈춘다»로 가므로"* 가시적이다.
    // 그 갈래가 없으면 §6이 든 유일한 버전 불일치 경로가 화면에 아무 자국을 안 남긴다.
    const state = applySignal(SAMPLE.live, dropped(false));
    expect(state.phase).toBe("broken");
    expect(state).toMatchObject({ fault: GAVE_UP });
    expect(disposition(state)).toBe("stop");
  });

  test("두 갈래가 갈린다 — 같은 상실 신호가 같은 결과를 내면 계약이 없다", () => {
    // 역대조. 위 둘은 `retrying`을 무시하는 구현에서 하나만 그린이므로 함께 세워 둔다.
    expect(applySignal(SAMPLE.live, dropped(true))).not.toEqual(
      applySignal(SAMPLE.live, dropped(false)),
    );
  });

  test("뜨거운 루프 부재 — 갭 뒤에 못 붙으면 처분이 `reopen`을 되풀이하지 않는다", () => {
    // 근거: §8.1 — *"상실 사건의 초기화가 그것을 대신한다"*. 갭인 채로 남기면 재개설이
    // 실패할 때마다 처분이 다시 «다시 연다»를 내고, 그것이 갈래 B의 기각 근거 1이다
    // (*"백오프 없이 즉시 다시 열면 서버가 죽어 있는 동안 뜨거운 루프가 된다"*).
    let state: StreamState = SAMPLE.gap;
    const orders: ConnectionDisposition[] = [];
    for (let i = 0; i < 5; i += 1) {
      state = applySignal(state, dropped(true));
      orders.push(disposition(state));
    }
    expect(orders).toEqual(["continue", "continue", "continue", "continue", "continue"]);
  });

  test("역대조 — 갭 자체는 `reopen`을 낸다", () => {
    // 이 짝이 없으면 위 축은 항상 `continue`를 내는 함수에서도 그린이라 아무것도 보증하지 않는다.
    expect(disposition(SAMPLE.gap)).toBe("reopen");
  });
});

// ---------------------------------------------------------------------------
// 계약 ④ — 낡은 연결의 신호는 상태에 접히지 않는다 (§8.1) · **이 축이 못 잰다**
// ---------------------------------------------------------------------------

describe("WEB-UI §8.1 계약 ④ — 이 축의 모집단 밖이다", () => {
  test("[커버리지 구멍] 순수 층은 낡은 상실 신호가 갓 선 상태를 미는 것을 못 막는다", () => {
    // §8.1이 이 한계를 직접 적었다 — *"이 성질은 배선의 것이라 아래 「검사의 모집단」이 든
    // 순수 함수 축이 재지 못한다"*. 신호에 연결 신원이 실리지 않으므로 순수 함수는 낡은
    // 통지와 지금 연결의 통지를 원리적으로 구별할 수단이 없다. 아래는 그 사실을 코드로
    // 든 것이지 계약 위반이 아니다 — 계약 ④의 첫 검증은 실브라우저 사이클(M2 C2)이다.
    const justOpened = applySignal(SAMPLE.live, OPENED);
    expect(justOpened).toEqual(INITIAL_STREAM_STATE);

    // 닫힌 연결의 뒤늦은 통지 하나가 갓 선 연결을 종단으로 민다. 막는 자리는 배선이고
    // (*"낡은 연결의 통지가 상태에 도달하지 않는다"*), 그 수단은 §8.1이 세부로 뒀다.
    const pushedByStale = applySignal(justOpened, dropped(false));
    expect(pushedByStale.phase).toBe("broken");
  });
});

// ---------------------------------------------------------------------------
// §6.1 · §8 — 푸시 전부가 하나의 `seq` 카운터
// ---------------------------------------------------------------------------

describe("WEB-UI §6.1·§8 — 갭 판정은 한 수열 위에서 난다", () => {
  test("`event`와 `state`를 섞어도 연속이면 진행한다", () => {
    // 근거: §6.1 — 카운터가 하나인 것이 계약이다. 프레임 타입별로 가르면 아래 수열은 각각
    // 1,2 / 1,2,3 이 되어 갭이 원리적으로 안 보인다.
    const state = foldFrames([handshake(1), progress(2), pending(3), progress(4), settled(5)]);
    expect(state).toEqual({ phase: "live", lastSeq: 5 });
  });

  test("1,2,4가 갭으로 판정된다", () => {
    // 근거: §8 — *"클라이언트는 번호가 건너뛰면 갭으로 판정한다."*
    const state = foldFrames([handshake(1), progress(2), progress(4)]);
    expect(state).toEqual({ phase: "gap", lastSeq: 2, expected: 3, received: 4 });
    expect(disposition(state)).toBe("reopen");
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
// §6 · §6.1 — 판별자 소진
// ---------------------------------------------------------------------------

describe("WEB-UI §6·§6.1 — 모르는 판별자가 에러로 나타난다", () => {
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
    // 도는 타입 검사이고, 여기서는 실행한 갈래가 넷 다인 것을 잰다.
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
    // 근거: §8.1 — *"화면이 든 트랜스크립트는 «되돌린다»가 아니라 «대체한다»다"*. 스냅샷이
    // 통째로 실려 나가는 것이 그 «대체»의 재료이고, 부분만 실리면 화면이 누적할 수밖에 없다.
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

// ---------------------------------------------------------------------------
// `StreamFault` 갈래 전수 표 — 이 축이 그 유니온의 유일한 소진 소비자다 (§8.1)
// ---------------------------------------------------------------------------

/**
 * §8.1: *"갈래 전부를 키로 드는 표 하나가 §9.3의 유닛 축에 살고, 키가 빠지면 미충족·없는 키를
 * 더하면 초과 속성이라 양방향으로 붉어진다"*. 그 절이 이 표를 검사 쪽에 둔 근거는 실측이다 —
 * *"이 결함 유니온을 소진 처분하는 소비자가 레포에 0건이다"*. 결함은 갈래가 몇이든 처분이
 * «멈춘다» 하나라 구현 쪽에 소진 `switch`가 자연히 생기지 않는다.
 */
const FAULTS: Readonly<Record<StreamFault["kind"], StreamFault>> = {
  malformed_json: { kind: "malformed_json" },
  not_object: { kind: "not_object" },
  unknown_type: { kind: "unknown_type", type: "notify" },
  unknown_state_kind: { kind: "unknown_state_kind", stateKind: "drain" },
  bad_seq: { kind: "bad_seq", seq: 0 },
  not_monotonic: { kind: "not_monotonic", expected: 3, received: 2 },
  handshake_out_of_order: { kind: "handshake_out_of_order", seq: 3 },
  first_push_not_handshake: { kind: "first_push_not_handshake", frameType: "event" },
  transport_gave_up: { kind: "transport_gave_up" },
};

describe("WEB-UI §8.1 — 결함 갈래 전부의 처분이 «멈춘다» 하나다", () => {
  test("갈래마다 처분이 `stop`이다", () => {
    for (const [kind, fault] of Object.entries(FAULTS))
      expect(disposition({ phase: "broken", lastSeq: 7, fault }), kind).toBe("stop");
  });

  test("표의 키가 각자 자기 갈래를 든다 — 사본이 어긋나면 붉다", () => {
    for (const [kind, fault] of Object.entries(FAULTS)) expect(fault.kind, kind).toBe(kind);
  });

  test("«전송이 포기했다» 갈래가 프레임 읽기와 다른 자리에서 온다", () => {
    // 근거: §8.1 — *"`StreamFault`에 «전송이 포기했다» 갈래가 하나 는다."* 그 갈래는 줄을 못
    // 읽어서 나는 것이 아니라 연결이 다시 안 붙어서 난다. 읽기 경로가 그것을 낼 수 있으면
    // 두 사유가 화면에서 겹친다.
    const readFaults = [
      readFrame("{"),
      readFrame("null"),
      readFrame('{"type":"notify","seq":1}'),
      readFrame('{"type":"state","seq":1,"kind":"drain"}'),
      readFrame('{"type":"event","seq":0,"event":{"type":"agent_start"}}'),
    ];
    for (const read of readFaults) {
      expect(read.ok).toBe(false);
      if (!read.ok) expect(read.fault.kind).not.toBe(GAVE_UP.kind);
    }
  });
});
