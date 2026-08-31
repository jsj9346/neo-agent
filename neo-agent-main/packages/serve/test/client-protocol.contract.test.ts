/**
 * T-004 · T-005 — 브라우저 프로토콜 모듈의 계약 검증. 정본은 `docs/WEB-UI.md` **§8.1**이고,
 * 그 절의 「계약의 형태」가 이 모듈에 계약 **여섯**을 못박았다. (2026-08-26 재작성 — 그 전까지
 * 이 파일은 멈추는 사유가 하나라는 §9.3의 옛 문면을 축 이름과 근거로 들고 있었고, **그 문면은
 * §8.1 신설과 함께 정본에서 걷혔다** — 그 절이 *"멈추는 사유는 둘이고 연결의 처분은 셋이며, 그
 * 표는 §8.1이 든다"*로 다시 쓰였다. 결함의 처분이 뒤집혔으므로 낡은 축을 남기면 이 파일이
 * 없는 계약을 재게 된다. **2026-08-31 — 그 수가 넷에서 여섯이 됐다**: §8.1이 ⑤·⑥을 더했고
 * 이 머리는 그날까지 「넷」이라 적고 있었다. 손으로 유지되는 수는 이렇게 낡으므로, 이번에는
 * 고치는 데서 그치지 않고 **맨 아래 「모집단의 수」 스위트가 정본 쪽과 자기 쪽 양방향으로
 * 그 수를 센다** — 정본이 ⑦을 더하거나 이 파일의 축이 조용히 줄면 붉어진다.)
 *
 * **기대값은 구현이 아니라 계약 문서에서만 도출했다.** `client/protocol.js`에서 읽은 것은
 * export 이름과 시그니처(타입 선언)뿐이고 값·분기 조건은 읽지 않았다. 구현이 문서와 다르면
 * 이 파일은 문서 편에 선다.
 *
 *   - `WEB-UI.md` §8.1 — 계약 여섯. ① *"입력 알파벳이 연결 사건을 든다"* ② *"처분이 순수
 *                         함수의 답이다"* ③ *"연결의 생멸 사건이 수열 상태를 초기값으로
 *                         되돌리고, 종단은 그 사건을 흡수한다"* ④ *"낡은 연결의 신호는 상태에
 *                         접히지 않는다"* ⑤ *"프레임의 내용은 순수 층이 접수한 뒤에만 화면에
 *                         서고, 접수 여부는 순수 층의 답이다"* ⑥ *"착지가 실패하면 배선은
 *                         멈추고, 그 사실이 던진 층을 안 거치고 화면에 선다"*. 같은 절의
 *                         *"프레임과 연결 사건이 한 알파벳에 든다"*, *"배선은 이 셋을 적용만
 *                         하고 스스로 고르지 않는다"*, *"낡은 연결의 통지가 상태에 도달하지
 *                         않는다"*가 ①·②·④의 근거 문면이다
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
 * **전송은 안 부른다.** 소켓을 여는 자리는 `client/stream.js` 하나이고(§9.3), 이 파일이 그
 * 파일을 안 부르는 것이 그 분리의 표시다. **그래서 여섯 중 넷만 여기서 재진다** — §8.1이
 * 그 경계를 직접 그었다: *"①~③·⑤는 순수 함수의 성질이라 유닛 축이 잰다. ④·⑥은 배선의 것이라
 * 못 잰다"*. 못 재는 둘은 아래 계약 ④ 절과 계약 ⑥ 절이 **커버리지 구멍으로 명시해** 든다 —
 * ⑤도 절반(배선의 급수)은 그 구멍 쪽이다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로 있는
 * 부분 문자열이고, 문서를 지목하는 자리는 절 번호와 필드 이름으로 한다.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AgentMessage } from "@neo-agent/core";
import { describe, expect, test } from "vitest";
import type {
  ConnectionDisposition,
  FrameVerdict,
  StreamFault,
  StreamSignal,
  StreamState,
} from "../client/protocol.js";
import {
  advance,
  applySignal,
  disposition,
  frameVerdict,
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
  // §6.1의 넷째 필드. 이 파일의 축은 클라이언트 상태 기계라 값은 아무 것이어도 되고,
  // 값 도메인을 재는 자리는 `protocol.contract.test.ts`다.
  safety: { approvalMode: "manual", sandbox: "on" },
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
// 계약 ⑤ — 프레임의 내용은 순수 층이 접수한 뒤에만 화면에 선다 (§8.1)
// ---------------------------------------------------------------------------

/** 접수 판정에 쓰는 요청·응답 프레임. 푸시가 아니므로 수열을 안 움직인다(§6) */
const req: Frame = { type: "req", id: "1", method: "prompt.submit", params: { text: "안녕" } };
const res: Frame = { type: "res", id: "1", ok: true };

/** §8.1 접수표의 행 이름. 문면 그대로 옮긴 것이라 이 여섯이 곧 그 표다 */
type AcceptanceRow =
  | "수열에 이어진 푸시"
  | "종료 고지"
  | "푸시가 아닌 프레임"
  | "못 읽은 줄 · 결함으로 판정된 프레임"
  | "갭을 낸 프레임"
  | "종단·갭인 채로 온 프레임";

/** 행 하나를 채우는 사례. `before`는 접기 전 상태, `line`은 와이어에서 온 줄 그대로다 */
type AcceptanceCase = {
  readonly label: string;
  readonly before: StreamState;
  readonly line: string;
};

/**
 * **값의 출처는 §8.1의 접수표이지 구현이 아니다.** 여섯 행과 ○/✗가 그 표에 있는 그대로이고,
 * 넷째 행은 그 절이 결함으로 든 부류를 각각 사례로 든다 — *"못 읽는 JSON, 모르는 판별자,
 * 형태가 틀린 번호, 뒤로 가는 번호, 순서가 틀린 핸드셰이크"* 중 이 표가 이름으로 든 넷
 * (*"순서가 틀린 핸드셰이크 · 핸드셰이크가 아닌 첫 푸시 · 뒤로 간 번호"* + 못 읽은 줄)이다.
 * 그 셋이 특히 이 축의 존재 이유다 — §8.1이 *"읽히기는 하는데 결함인"* 프레임이 배선의 좁은
 * 판정 사이로 빠져나간다고 적은 자리가 그것이다.
 */
const ACCEPTANCE: Readonly<
  Record<AcceptanceRow, { readonly accepted: boolean; readonly cases: readonly AcceptanceCase[] }>
> = {
  // ○ — *"그 프레임의 내용"*이 선다
  "수열에 이어진 푸시": {
    accepted: true,
    cases: [
      { label: "event", before: SAMPLE.live, line: wire(progress(3)) },
      { label: "state", before: SAMPLE.live, line: wire(pending(3)) },
    ],
  },
  // ○ — *"그 내용이 곧 처분이므로 반드시 선다 — 종단이라고 빠지지 않는다"*
  "종료 고지": {
    accepted: true,
    cases: [{ label: "shutdown", before: SAMPLE.live, line: wire(shutdown(3)) }],
  },
  // ○ — 계약 밖이라는 고지가 선다. *"수열을 안 움직이므로 내용의 착지가 아니다"*
  "푸시가 아닌 프레임": {
    accepted: true,
    cases: [
      { label: "req", before: SAMPLE.live, line: wire(req) },
      { label: "res", before: SAMPLE.live, line: wire(res) },
    ],
  },
  // ✗ — 그 자리에 *"결함 문면"*이 선다
  "못 읽은 줄 · 결함으로 판정된 프레임": {
    accepted: false,
    cases: [
      { label: "못 읽는 JSON", before: SAMPLE.live, line: "{" },
      { label: "순서가 틀린 핸드셰이크", before: SAMPLE.live, line: wire(handshake(3)) },
      {
        label: "핸드셰이크가 아닌 첫 푸시",
        before: INITIAL_STREAM_STATE,
        line: wire(progress(1)),
      },
      { label: "뒤로 간 번호", before: SAMPLE.live, line: wire(progress(2)) },
    ],
  },
  // ✗ — 그 자리에 *"갭 문면"*이 선다
  "갭을 낸 프레임": {
    accepted: false,
    cases: [{ label: "건너뛴 번호", before: SAMPLE.live, line: wire(progress(4)) }],
  },
  // ✗ — *"이미 선 종단·갭 문면 그대로"*
  "종단·갭인 채로 온 프레임": {
    accepted: false,
    cases: [
      { label: "ended", before: SAMPLE.ended, line: wire(progress(3)) },
      { label: "broken", before: SAMPLE.broken, line: wire(progress(3)) },
      { label: "gap", before: SAMPLE.gap, line: wire(progress(3)) },
    ],
  },
};

/** 접기 전 상태와 와이어 줄 하나로 답 셋을 받는다 */
const verdictOf = (before: StreamState, line: string): FrameVerdict =>
  frameVerdict(before, readFrame(line));

describe("WEB-UI §8.1 계약 ⑤ — 접수가 착지의 전제다", () => {
  test("접수표 여섯 행 전수 — 각 행의 사례가 그 행의 ○/✗를 낸다", () => {
    // 근거: §8.1 접수표. 값의 출처는 그 표이고, 행이 늘면 `AcceptanceRow`가 미충족·없는 행을
    // 쓰면 초과 속성이라 표 자체가 양방향으로 붉어진다.
    for (const [row, { accepted, cases }] of Object.entries(ACCEPTANCE))
      for (const { label, before, line } of cases)
        expect(verdictOf(before, line).accepted, `${row} / ${label}`).toBe(accepted);
  });

  test("행 안에서는 답이 하나이고 행 사이에서는 갈린다", () => {
    // 역대조. 위 단언은 표를 읽지 않고 상수만 내는 구현에서 절반이 붉지만, 그 절반이 어느
    // 쪽인지를 여기서 함께 잰다 — 답이 한 값으로 뭉치면 접수 판정이 실은 없는 것이다.
    const across = new Set<boolean>();
    for (const [row, { cases }] of Object.entries(ACCEPTANCE)) {
      const answers = new Set(cases.map(({ before, line }) => verdictOf(before, line).accepted));
      expect(answers.size, row).toBe(1);
      for (const answer of answers) across.add(answer);
    }
    expect(across).toEqual(new Set([true, false]));
  });

  test("접수는 프레임만의 함수가 아니다 — 같은 줄이 접기 전 상태에 따라 갈린다", () => {
    // 근거: §8.1 — *"접수의 정의는 상태에서 나온다"*. 이 짝이 없으면 접수를 프레임 하나만
    // 보고 정하는 구현에서도 여섯 행 중 다섯이 그린이다(첫 행과 여섯째 행이 같은 줄이다).
    const line = wire(progress(3));
    expect(verdictOf(SAMPLE.live, line).accepted).toBe(true);
    expect(verdictOf(SAMPLE.ended, line).accepted).toBe(false);
  });

  test("종료 고지는 종단인데도 접수다 — 처분이 «멈춘다»와 함께 선다", () => {
    // 근거: §8.1 접수표 둘째 행 — *"그 내용이 곧 처분이므로 반드시 선다 — 종단이라고 빠지지
    // 않는다"*. 접수를 「처분이 `continue`인가」로 지으면 이 행이 ✗가 되어 종료 고지가 화면에
    // 안 서고, 그러면 사용자는 서버가 내려간 것을 모른 채 멈춘 화면을 본다.
    const verdict = verdictOf(SAMPLE.live, wire(shutdown(3)));
    expect(verdict.state.phase).toBe("ended");
    expect(verdict.disposition).toBe("stop");
    expect(verdict.accepted).toBe(true);
  });

  test("푸시가 아닌 프레임은 접수되지만 수열을 안 움직인다", () => {
    // 근거: §8.1 접수표 셋째 행 — *"수열을 안 움직이므로 내용의 착지가 아니다"*.
    for (const frame of [req, res]) {
      const verdict = verdictOf(SAMPLE.live, wire(frame));
      expect(verdict.accepted, frame.type).toBe(true);
      expect(verdict.state, frame.type).toEqual(SAMPLE.live);
    }
  });

  test("답은 셋이고 그 셋이 §8.1 「계약의 형태」의 필드다", () => {
    // 근거: §8.1 — `FrameVerdict`의 `state`·`disposition`·`accepted`. 전수 표이므로 필드가
    // 늘면 미충족, 없는 필드를 쓰면 초과 속성이라 양방향으로 붉어진다.
    const FIELDS: Readonly<Record<keyof FrameVerdict, true>> = {
      state: true,
      disposition: true,
      accepted: true,
    };
    const verdict = verdictOf(SAMPLE.live, wire(progress(3)));
    expect(Object.keys(verdict).sort()).toEqual(Object.keys(FIELDS).sort());
  });

  test("판정의 정본이 하나다 — 답 셋이 계약 ①·②의 답과 어긋나지 않는다", () => {
    // 근거: §8.1 — *"판정의 정본을 둘이 나눠 가진 자리는 언제나 이렇게 갈리고"* 그 갈림이
    // V-1의 부수 발견과 같은 형태라고 그 절이 적었다. 접수 답이 자기만의 접기를 들면
    // 배선이 든 상태와 갈릴 수 있고, 그 갈림이 정확히 이 계약이 없애려는 것이다.
    for (const [row, { cases }] of Object.entries(ACCEPTANCE))
      for (const { label, before, line } of cases) {
        const untouched = JSON.stringify(before);
        const verdict = verdictOf(before, line);
        const where = `${row} / ${label}`;
        expect(verdict.state, where).toEqual(applySignal(before, lineSignal(line)));
        expect(verdict.disposition, where).toBe(disposition(verdict.state));
        // 접기 전 상태를 안 건드린다 — 배선이 같은 상태로 답을 다시 물을 수 있어야 한다.
        expect(JSON.stringify(before), where).toBe(untouched);
      }
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
// 계약 ⑥ · 계약 ⑤의 배선 절반 (§8.1) · **둘 다 이 축이 못 잰다**
// ---------------------------------------------------------------------------

describe("WEB-UI §8.1 계약 ⑥과 계약 ⑤의 배선 절반 — 이 축의 모집단 밖이다", () => {
  test("[커버리지 구멍] 착지의 실패는 순수 층의 알파벳에 없다", () => {
    // §8.1이 이 한계를 직접 적었다 — *"이 계약은 배선의 성질이라 아래 「검사의 모집단」이 든
    // 순수 함수 축이 못 잰다 — 계약 ④와 같다."* 그 절이 든 이유가 둘이고 첫째가 여기서
    // 관측된다: *"순수 층은 화면을 안 보므로 이 실패를 원리적으로 못 잰다"*.
    //
    // 입력 알파벳은 셋이고(계약 ①) 그 셋 중 어느 것도 화면 층의 던짐을 나르지 않는다. 그래서
    // 아래 답은 내용이 화면에 선 경우와 던진 경우가 글자 하나 안 다르다 — 접수까지가 이
    // 층의 답이고, 그 뒤에 일어난 일은 여기 도달하지 않는다.
    const landed = verdictOf(SAMPLE.live, wire(progress(3)));
    expect(landed.accepted).toBe(true);
    expect(landed.disposition).toBe("continue");

    // 계약 ⑥의 처분은 *"멈춘다"*인데 그 답을 낼 자리가 이 함수에 없다. 순수 층에 접지 않는
    // 것이 §8.1의 판정 그대로다 — *"이것은 스트림의 결함이 아니라 배선의 종단이다."*
    // 아래는 그 사실을 코드로 든 것이지 계약 위반이 아니다. 계약 ⑥의 첫 검증은 브라우저
    // e2e이고, 그 축이 필요로 하는 것은 *"화면이 모르는 판별자를 내는 서버"*다.
    const alphabet: Readonly<Record<StreamSignal["kind"], true>> = {
      opened: true,
      frame: true,
      dropped: true,
    };
    expect(Object.keys(alphabet).sort()).toEqual(["dropped", "frame", "opened"]);
  });

  test("[커버리지 구멍] 급수가 접수 뒤에 오는가는 이 파일이 안 잰다", () => {
    // **계약 ⑤는 절반만 이 축의 모집단 안이다.** 순수 층이 접수 답을 낸다는 절반은 위 계약 ⑤
    // 절이 재고, *"배선은 `accepted`가 참일 때만 그 프레임의 내용을 화면에 급수한다"*는
    // 절반은 소켓을 여는 파일(`client/stream.js`)의 성질이라 여기 안 온다.
    //
    // **그 파일을 부르지 않는 것이 이 파일의 계약이다**(이 파일 머리 — *"전송은 안 부른다"*).
    // 부르는 순간 순수 축과 배선 축의 경계가 사라지고, §9.3이 검사의 자리를 순수 함수로
    // 정한 배치가 이 파일에서 깨진다. 그래서 그 절반은 별도 파일의 축이 진다.
    const accepted = verdictOf(SAMPLE.live, wire(progress(3)));
    const rejected = verdictOf(SAMPLE.live, wire(progress(4)));
    expect([accepted.accepted, rejected.accepted]).toEqual([true, false]);

    // 여기까지가 이 축이 볼 수 있는 전부다 — 답 둘이 갈린다는 것. 배선이 그 갈림을 실제로
    // «내용을 세운다 / 사유를 세운다»로 옮기는가는 관측 불가능하고, **급수를 접수 앞으로
    // 되돌려도 위 단언은 그대로 그린이다.** 그것이 이 블록을 두는 이유다.
    expect(rejected.state.phase).toBe("gap");
    expect(rejected.disposition).toBe("reopen");
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

// ---------------------------------------------------------------------------
// 모집단의 수 — 정본이 든 계약의 수와 이 파일이 든 블록의 수 (§8.1)
// ---------------------------------------------------------------------------

/**
 * **왜 이 스위트가 있는가.** 이 파일의 머리가 2026-08-26부터 2026-08-31까지 계약을 「넷」이라
 * 적고 있었고 그 사이에 정본은 여섯이 됐다. 손으로 유지되는 수는 이렇게 낡고, 낡은 것을
 * 손으로 고치기만 하면 다음 개정에서 같은 일이 다시 난다. 그래서 수를 **두 방향으로** 센다 —
 * 정본이 든 수와 이 파일이 든 블록의 수.
 *
 * **어디까지가 선례이고 어디부터가 새 기계인가.**
 *
 *   - **선례가 있다** — ① 테스트가 `docs/`의 정본 파일을 읽는 것 ② `import.meta.url`로 자기
 *     소스를 읽어 스위트 안의 축 수를 세는 것. 형제 파일 `origin.contract.test.ts`의
 *     「이 파일의 모집단이 닫힌 표다」 스위트가 둘 다 이미 쓴다. **자기를 세지 않는 수단도
 *     그 파일에서 왔다** — 그쪽이 제목이 `역검증`·`모집단`으로 시작하는 축을 모집단에서 빼고,
 *     여기서는 아래 `SELF_EXCLUDED`가 같은 일을 한다.
 *   - **선례가 없다 — 정본 문면에서 계약의 «수»를 뽑는 것.** 그 파일이 하는 정본 읽기는 절의
 *     **부재**를 재는 역검증(있지도 않은 §99.9가 실제로 없다)이지 수의 추출이 아니다. 아래
 *     `contractCountInDoc`이 이 레포의 첫 사례이므로, 정규식과 그 취약성을 여기 적는다.
 *
 * **막지 못하는 것**(§2.3의 규율 — *"막는다고 주장하면서 못 막는 상태"*를 만들지 않는다).
 * 아래 두 정규식은 §8.1의 **문면 표기**에 걸려 있다:
 *
 *   - `CONTRACT_COUNT`는 *"계약인 것은"* 뒤에 굵게 감싼 한글 수사가 오고 `이다`로 닫는 형태를
 *     전제한다. 같은 절의 다른 문장(*"계약인 것은 **낡은 연결의 통지가 상태에 도달하지
 *     않는다**는 것 하나다"*)은 `이다`로 안 닫혀서 안 걸리는데, **그 구분이 문면의 우연이지
 *     구조가 아니다.** 그 문장이 `…**는 것 하나이다`로 다시 쓰이면 이 축은 4가 아니라 1을 재게
 *     된다. 그 오검출은 같은 함수의 **열거 축**이 잡는다 — 뽑은 수사와 열거된 기호의 수가
 *     함께 여섯이어야 통과하므로, 둘 중 하나만 어긋나도 붉다.
 *   - 열거 축은 계약을 `①②③…`으로 매기는 표기를 전제한다. §8.1이 열거를 글머리표나 표로
 *     바꾸면 이 축은 기호를 하나도 못 찾고 **던진다**.
 *   - `sectionOf81`은 §8.1의 표제가 `###`이고 그 안의 소표제가 `####` 이하라는 것을 전제한다.
 *     문서가 절 층을 재편하면 자르는 자리가 어긋난다 — 그 어긋남도 조용하지 않다(자른 본문에
 *     수가 없어져 던진다).
 *   - **그리고 이 축은 수만 잰다.** 정본이 ⑤의 *내용*을 통째로 바꿔 써도 수는 여섯 그대로라
 *     여기서는 안 잡힌다. 그 층을 지는 것은 위의 계약별 스위트이고, 그것은 손으로 유지된다.
 *
 * **못 찾으면 던진다.** 표제를 못 찾거나 수사를 못 뽑으면 0을 세고 통과하는 대신 예외로
 * 죽는다 — `ARCHITECTURE.md` §2.6의 가시적 결과이고, 형제 파일의 스위트 조회가 쓰는 처분과
 * 같다(*"스위트를 찾지 못했다"*).
 */
const WEB_UI_DOC = fileURLToPath(new URL("../../../docs/WEB-UI.md", import.meta.url));

/** 계약을 매기는 기호. §8.1의 열거가 쓰는 표기 그대로다 */
const CONTRACT_MARKS = "①②③④⑤⑥⑦⑧⑨⑩";

/** §8.1이 수를 한글 수사로 적으므로 낱말→수의 표가 필요하다. 열까지 든다 */
const KOREAN_NUMERALS: Readonly<Record<string, number>> = {
  하나: 1,
  둘: 2,
  셋: 3,
  넷: 4,
  다섯: 5,
  여섯: 6,
  일곱: 7,
  여덟: 8,
  아홉: 9,
  열: 10,
};

/** `계약인 것은 **여섯**이다` — 굵게 감싼 한글 수사 하나를 뽑는다 */
const CONTRACT_COUNT = /계약인 것은 \*\*([가-힣]+)\*\*이다/;

/**
 * 이 파일의 계약별 블록 수. **⑤가 둘인 것은 그 계약이 반으로 갈리기 때문이다** — 순수 층의
 * 접수 절반은 위 계약 ⑤ 스위트가 재고, 배선의 급수 절반은 계약 ⑥ 스위트가 커버리지 구멍으로
 * 함께 든다. 키가 빠지면 미충족·없는 키를 더하면 초과 속성이라 이 표 자체도 양방향으로 붉다.
 */
const CONTRACT_BLOCKS: Readonly<Record<string, number>> = {
  "①": 1,
  "②": 1,
  "③": 1,
  "④": 1,
  "⑤": 2,
  "⑥": 1,
};

/** 자기를 세지 않게 모집단에서 빼는 제목 조각. 이 스위트의 제목이 이것을 든다 */
const SELF_EXCLUDED = "모집단의 수";

/**
 * §8.1 본문만 잘라 낸다 — 같거나 더 높은 층의 다음 표제 전까지. 표제를 못 찾으면 던진다.
 *
 * **`#{1,3}`인 것이 계약이다.** §8.1은 자기 안에 `####` 소표제를 여럿 두고 「계약의 형태」가
 * 그중 **맨 마지막**이라, 층을 안 가리고 자르면 본문이 첫 소표제에서 끊겨 수를 못 찾는다.
 */
const sectionOf81 = (doc: string): string => {
  const start = doc.search(/^#{1,3} 8\.1[ .]/m);
  if (start === -1) throw new Error("정본에서 §8.1 표제를 찾지 못했다 — docs/WEB-UI.md");
  const body = doc.slice(start);
  // 표제 줄 자신을 다음 표제 탐색에서 뺀다 — 안 빼면 `^`가 잘라 낸 문자열의 첫 글자에서
  // 그대로 걸려 본문이 한 글자로 줄고, 그러면 아래 수 추출이 «못 찾음»으로 죽는다.
  const afterHeading = body.indexOf("\n");
  if (afterHeading === -1) return body;
  const next = body.slice(afterHeading).search(/^#{1,3} /m);
  return next === -1 ? body : body.slice(0, afterHeading + next);
};

/** §8.1이 든 계약의 수 — 한글 수사와 열거 기호 양쪽에서 뽑는다. 못 뽑으면 던진다 */
const contractCountInDoc = (
  doc: string,
): { readonly spelled: number; readonly enumerated: readonly string[] } => {
  const body = sectionOf81(doc);
  const hit = CONTRACT_COUNT.exec(body);
  if (hit === null)
    throw new Error(`§8.1에서 계약의 수를 뽑지 못했다 — 문면이 다시 쓰였다 (${CONTRACT_COUNT})`);
  const word = hit[1] ?? "";
  const spelled = KOREAN_NUMERALS[word];
  if (spelled === undefined) throw new Error(`§8.1이 든 수사를 못 읽었다 — "${word}"`);
  // 같은 문장의 열거를 함께 센다. 그 줄이 `(2026-08-31 — ⑤·⑥이 붙었다)`처럼 같은 기호를 다시
  // 들 수 있으므로 중복을 접는다.
  const lineStart = body.lastIndexOf("\n", hit.index) + 1;
  const lineEnd = body.indexOf("\n", hit.index);
  const line = body.slice(lineStart, lineEnd === -1 ? body.length : lineEnd);
  const enumerated = [...new Set([...line].filter((ch) => CONTRACT_MARKS.includes(ch)))].sort();
  if (enumerated.length === 0)
    throw new Error("§8.1의 계약 열거에서 기호를 하나도 못 찾았다 — 표기가 바뀌었다");
  return { spelled, enumerated };
};

/** 이 파일의 최상위 `describe` 제목에서 계약 기호를 세어 계약별 블록 수를 만든다 */
const contractBlocksInSelf = (source: string): Readonly<Record<string, number>> => {
  const titles = [...source.matchAll(/\ndescribe\("([^"]+)"/g)].map((hit) => hit[1] ?? "");
  if (titles.length === 0) throw new Error("자기 소스에서 스위트를 하나도 못 찾았다");
  const counted: Record<string, number> = {};
  for (const title of titles) {
    if (title.includes(SELF_EXCLUDED)) continue;
    // 한 제목이 계약 둘을 들 수 있다(계약 ⑥ 스위트가 ⑤의 배선 절반을 함께 든다). 같은 기호가
    // 한 제목에 두 번 나와도 블록은 하나이므로 접는다.
    for (const mark of new Set([...title].filter((ch) => CONTRACT_MARKS.includes(ch))))
      counted[mark] = (counted[mark] ?? 0) + 1;
  }
  return counted;
};

describe("WEB-UI §8.1 — 모집단의 수: 정본의 계약과 이 파일의 블록", () => {
  test("정본 쪽 — §8.1이 드는 계약이 여섯이고, 수사와 열거가 같은 수를 든다", () => {
    // 정본이 ⑦을 더하면 `enumerated`가 일곱이 되어 아래 둘이 함께 붉는다. 수사만 고치고
    // 열거를 안 고쳐도(또는 그 반대여도) 두 값이 갈려 붉는다.
    const { spelled, enumerated } = contractCountInDoc(readFileSync(WEB_UI_DOC, "utf8"));
    expect(spelled).toBe(Object.keys(CONTRACT_BLOCKS).length);
    expect(enumerated).toEqual(Object.keys(CONTRACT_BLOCKS).sort());
  });

  test("자기 쪽 — 계약별 블록 수가 위 표 그대로다", () => {
    // 소스를 읽어 자기 파일의 최상위 스위트 제목을 센다 — 축이 조용히 줄면 여기서 붉는다.
    const self = readFileSync(fileURLToPath(import.meta.url), "utf8");
    expect(contractBlocksInSelf(self)).toEqual(CONTRACT_BLOCKS);
  });

  test("역검증 — 두 셈이 실제로 잡는다", () => {
    // ① 정본 쪽: ⑦이 붙은 가짜 문면에서 일곱을 센다.
    const grown = [
      "### 8.1 가짜 절",
      "",
      "- 계약인 것은 **일곱**이다 — ① 가 ② 나 ③ 다 ④ 라 ⑤ 마 ⑥ 바 ⑦ 사.",
      "",
      "## 9. 다음 절",
    ].join("\n");
    const verdict = contractCountInDoc(grown);
    expect(verdict.spelled).toBe(7);
    expect(verdict.enumerated).toHaveLength(7);
    expect(verdict.spelled).not.toBe(Object.keys(CONTRACT_BLOCKS).length);

    // ② 정본 쪽 fail-closed: 표제가 없거나 수사를 못 뽑으면 0이 아니라 예외다.
    expect(() => contractCountInDoc("## 8. 표제 없음\n\n본문뿐이다.\n")).toThrow(/§8\.1 표제/);
    expect(() => contractCountInDoc("### 8.1 절\n\n수를 안 든다.\n")).toThrow(/계약의 수를 뽑지/);

    // ③ 자기 쪽: 블록이 사라진 가짜 소스에서 그 부재가 보인다.
    const shrunk = '\ndescribe("WEB-UI §8.1 계약 ① — 하나뿐이다", () => {});\n';
    expect(contractBlocksInSelf(shrunk)).toEqual({ "①": 1 });
    expect(contractBlocksInSelf(shrunk)).not.toEqual(CONTRACT_BLOCKS);

    // ④ 자기 쪽: 셈이 자기를 세지 않는다 — 이 스위트의 제목은 모집단 밖이다.
    const withSelf = `\ndescribe("… ${SELF_EXCLUDED} — 계약 ①②③④⑤⑥", () => {});\n`;
    expect(contractBlocksInSelf(`${withSelf}${shrunk}`)).toEqual({ "①": 1 });
  });
});
