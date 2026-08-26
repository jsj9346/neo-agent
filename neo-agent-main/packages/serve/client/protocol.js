/**
 * 브라우저가 직접 로드하는 프로토콜 모듈 — 순수 부분. 정본은 `docs/WEB-UI.md` §9.3이고
 * 그 절이 이 자리에 계약 셋을 못박았다: 종료 고지 뒤 재접속 억제 · 서버→클라이언트 푸시
 * 전부를 하나의 `seq`로 보는 갭 판정 · 프레임 판별자의 소진 검사.
 *
 * **이 파일은 화면이 아니다.** §9.3의 표가 층을 둘로 갈랐다 — 레이아웃·스타일·문면은 외부
 * 디자인 도구의 출력이고(§9), 프로토콜 행동은 이 레포가 소유한다. 매니페스트에서 이 파일이
 * 지는 갈래는 `authored`이므로 `prompt`·`sha256`이 뜻을 안 가지고 포매터도 정상으로 걸린다
 * (§9.2).
 *
 * **빌드가 없다**(`TECH-STACK.md` §2 · §9). 그래서 소스가 `.js`이고 타입은 JSDoc으로 적는다.
 * 프레임 정의는 `../src/protocol.ts`에서 타입으로만 들여온다 — §9.3이 요구한 대로 §6의
 * 유니온이 **정의 하나에서 온다**. 사본을 두면 서버가 유니온을 넓혔을 때 이쪽이 안 따라와도
 * 조용히 통과하고, 그 순간 판별자 소진 검사가 아무것도 안 재게 된다.
 *
 * **전송을 모른다.** 이 파일에는 전송의 이름이 낱말로도 오지 않는다 — `../src/protocol.ts`가
 * 같은 자리에서 같은 규율을 쓴다. 전송을 여는 자리는 `./stream.js` 하나다.
 *
 * **런타임 검증 층이 여기 없는 것은 의도다.** 서버 쪽 `src/protocol.ts`는 zod `strictObject`로
 * 미지 필드를 거부하는데, 이 모듈은 의존성 0의 브라우저 코드라 그 수단을 못 쓴다. 그래서 이
 * 파일이 재는 것은 **판별자와 `seq`의 형태**이고 그 전부다 — 프레임 안쪽 필드의 전수 검증은
 * 하지 않는다. 재지 않는 것을 재는 척하지 않는다(`WEB-UI.md` §2.3이 세운 규율).
 */

/** @typedef {import("../src/protocol.ts").Frame} Frame */
/** @typedef {import("../src/protocol.ts").ServerEventFrame} ServerEventFrame */
/** @typedef {import("../src/protocol.ts").ServerStateFrame} ServerStateFrame */
/** @typedef {import("../src/protocol.ts").StateSnapshot} StateSnapshot */
/** @typedef {import("../src/protocol.ts").PendingApproval} PendingApproval */
/** @typedef {import("../src/protocol.ts").ApprovalOutcome} ApprovalOutcome */
/** @typedef {import("../src/protocol.ts").ServerEventFrame["event"]} AgentEvent */

/* -------------------------------------------------------------------------- *
 * 판별자 — 소진 검사가 걸리는 자리
 * -------------------------------------------------------------------------- */

/**
 * `ServerStateFrame`의 `kind` 넷(§6.1). **손 목록이 아니라 유니온에서 키가 강제되는 표다** —
 * 키가 빠지면 `Record`가 미충족이고 없는 키를 더하면 초과 속성이라, 양방향으로 붉어진다.
 * 판별자를 문자열로 늘어놓기만 하면 갈래가 늘 때 이 자리가 조용히 낡는다.
 *
 * @type {Readonly<Record<ServerStateFrame["kind"], true>>}
 */
const STATE_KINDS = {
  handshake: true,
  shutdown: true,
  approval_pending: true,
  approval_settled: true,
};

/* -------------------------------------------------------------------------- *
 * 프레임 읽기 — 모르는 판별자를 조용히 버리지 않는다 (§9.3)
 * -------------------------------------------------------------------------- */

/**
 * 프레임을 못 읽은 이유, 그리고 수열이 계약을 벗어난 이유. 판별자로 닫는다.
 *
 * 이 유니온이 존재하는 이유가 §6.1의 판정 근거 2다 — 모르는 값을 조용히 버리면 서버는
 * 고지했는데 화면에서는 아무 일도 일어나지 않고, 그것이 `ARCHITECTURE.md` §2.6의 silent
 * failure다. 여기서 모르는 값은 **가시적인 값**이 된다.
 *
 * @typedef {| { readonly kind: "malformed_json" }
 *   | { readonly kind: "not_object" }
 *   | { readonly kind: "unknown_type"; readonly type: unknown }
 *   | { readonly kind: "unknown_state_kind"; readonly stateKind: unknown }
 *   | { readonly kind: "bad_seq"; readonly seq: unknown }
 *   | { readonly kind: "not_monotonic"; readonly expected: number; readonly received: number }
 *   | { readonly kind: "handshake_out_of_order"; readonly seq: number }
 *   | { readonly kind: "first_push_not_handshake"; readonly frameType: "event" | "state" }
 * } StreamFault
 */

/**
 * @typedef {| { readonly ok: true; readonly frame: Frame }
 *   | { readonly ok: false; readonly fault: StreamFault }
 * } FrameResult
 */

/**
 * 푸시 프레임의 `seq` 형태를 잰다. §6이 *"연결마다 1부터 단조 증가한다"*고 정했으므로 양의
 * 정수다 — 0·음수·소수는 그 문장이 표현할 수 없는 값이다. 단조성 자체는 한 프레임만 보고는
 * 알 수 없고 `advance`가 잰다.
 *
 * @param {Record<string, unknown>} record
 * @param {unknown} value
 * @returns {FrameResult}
 */
function readPush(record, value) {
  const seq = record.seq;
  if (typeof seq !== "number" || !Number.isInteger(seq) || seq < 1) {
    return { ok: false, fault: { kind: "bad_seq", seq } };
  }
  return { ok: true, frame: /** @type {Frame} */ (value) };
}

/**
 * 스트림이 실어 온 한 줄을 프레임으로 읽는다. 실패는 반환값이지 예외가 아니다 — 예외로 던지면
 * 부르는 쪽의 `catch` 하나가 여러 사유를 뭉개 다시 침묵에 가까워진다.
 *
 * 무엇을 재는지: JSON인가 · 객체인가 · `type`이 넷 중 하나인가 · `state`면 `kind`가 넷 중
 * 하나인가 · 푸시면 `seq`가 양의 정수인가. 그 밖의 필드는 안 잰다(머리 참조).
 *
 * @param {string} text
 * @returns {FrameResult}
 */
export function readFrame(text) {
  /** @type {unknown} */
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, fault: { kind: "malformed_json" } };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, fault: { kind: "not_object" } };
  }
  const record = /** @type {Record<string, unknown>} */ (value);
  switch (record.type) {
    case "req":
    case "res":
      return { ok: true, frame: /** @type {Frame} */ (value) };
    case "event":
      return readPush(record, value);
    case "state": {
      const stateKind = record.kind;
      if (typeof stateKind !== "string" || !Object.hasOwn(STATE_KINDS, stateKind)) {
        return { ok: false, fault: { kind: "unknown_state_kind", stateKind } };
      }
      return readPush(record, value);
    }
    default:
      return { ok: false, fault: { kind: "unknown_type", type: record.type } };
  }
}

/**
 * 프레임이 `seq` 카운터를 드는가. 드는 것은 서버→클라이언트 푸시 둘뿐이다(§6) — 요청의
 * 반쪽은 번호를 안 든다.
 *
 * **`Frame["type"]`에 대한 소진 검사가 이 `switch`다.** 유니온이 자라면 `default`의 `never`
 * 대입이 붉어진다 — §6이 판별자로 닫았다고 적은 것의 기계 판이고, 그것을 재는 수단은
 * `client/tsconfig.json`이 든다(§9.3).
 *
 * @param {Frame} frame
 * @returns {number | null}
 */
export function pushSeq(frame) {
  switch (frame.type) {
    case "req":
      return null;
    case "res":
      return null;
    case "event":
      return frame.seq;
    case "state":
      return frame.seq;
    default: {
      /** @type {never} */
      const unreachable = frame;
      throw new Error(`소진되지 않은 프레임 판별자: ${JSON.stringify(unreachable)}`);
    }
  }
}

/**
 * 푸시 프레임인가. 판정은 `pushSeq` 하나가 지고 이 술어는 그 답을 타입 층으로 옮기기만 한다 —
 * 조건을 여기 다시 적으면 판별자 목록이 두 곳에 살고, 소진 검사가 한쪽만 잡는다.
 *
 * @param {Frame} frame
 * @returns {frame is ServerEventFrame | ServerStateFrame}
 */
function isPush(frame) {
  return pushSeq(frame) !== null;
}

/* -------------------------------------------------------------------------- *
 * 상태 프레임의 처분 — §6.1의 갈래 넷이 화면에서 무엇이 되는가
 * -------------------------------------------------------------------------- */

/**
 * @typedef {| { readonly effect: "replace_snapshot"; readonly snapshot: StateSnapshot }
 *   | { readonly effect: "stop" }
 *   | { readonly effect: "approval_open"; readonly approval: PendingApproval }
 *   | {
 *       readonly effect: "approval_close";
 *       readonly id: string;
 *       readonly outcome: ApprovalOutcome;
 *     }
 * } StateEffect
 */

/**
 * **`ServerStateFrame["kind"]`에 대한 소진 검사가 이 `switch`다.** §6.1이 *"`kind`가 늘 수
 * 있는 것은 프로세스가 새 상태를 소유하기 시작할 때뿐이다."*로 자람에 상한을 걸었고, 그때
 * 이 자리는 조용히 넘어가는 것이 아니라 붉어져야 한다.
 *
 * `shutdown`이 `stop`으로 가는 것이 §9.3 계약 ①의 절반이다 — 나머지 절반인 «다시 붙지
 * 않는다»는 `advance`가 상태로 든다.
 *
 * @param {ServerStateFrame} frame
 * @returns {StateEffect}
 */
export function stateEffect(frame) {
  switch (frame.kind) {
    case "handshake":
      return { effect: "replace_snapshot", snapshot: frame.snapshot };
    case "shutdown":
      return { effect: "stop" };
    case "approval_pending":
      return { effect: "approval_open", approval: frame.approval };
    case "approval_settled":
      return { effect: "approval_close", id: frame.id, outcome: frame.outcome };
    default: {
      /** @type {never} */
      const unreachable = frame;
      throw new Error(`소진되지 않은 상태 판별자: ${JSON.stringify(unreachable)}`);
    }
  }
}

/* -------------------------------------------------------------------------- *
 * 수열 — 하나의 카운터. 갭 판정과 종료 고지가 같은 자리에서 난다
 * -------------------------------------------------------------------------- */

/**
 * 클라이언트가 든 스트림 상태. 판별자로 닫고 옵셔널 조합을 안 쓴다 — 그래야 «갭인데 기대값이
 * 없다»나 «끝났는데 결함이 있다» 같은 무의미한 상태가 표현 자체로 불가능하다.
 *
 * **진행하는 상태는 `live` 하나이고 나머지 셋은 종단이다.** 갭의 처리는 재접속이고(§8),
 * 종료 고지를 받으면 멈추며(§6.1), 결함을 만난 스트림에 프레임을 더 접어 넣는 것은 그
 * 결함이 없었던 척하는 것이다.
 *
 * `lastSeq`가 0이면 아직 아무 푸시도 못 받았다는 뜻이다. 그 자리에 올 수 있는 것은
 * 핸드셰이크뿐이고(§6 — *"첫 프레임은 반드시 핸드셰이크다."*), §6.1이 그 `seq`를 1로 못박았다.
 *
 * @typedef {| { readonly phase: "live"; readonly lastSeq: number }
 *   | {
 *       readonly phase: "gap";
 *       readonly lastSeq: number;
 *       readonly expected: number;
 *       readonly received: number;
 *     }
 *   | { readonly phase: "ended"; readonly lastSeq: number }
 *   | { readonly phase: "broken"; readonly lastSeq: number; readonly fault: StreamFault }
 * } StreamState
 */

/**
 * 연결 하나가 시작하는 자리. **연결마다 1부터**이므로(§6) 재접속은 이 값에서 다시 시작한다 —
 * 이전 연결의 번호를 이어받지 않는다.
 *
 * @type {StreamState}
 */
export const INITIAL_STREAM_STATE = Object.freeze({ phase: "live", lastSeq: 0 });

/**
 * 읽은 결과 하나를 상태에 접는다. `advance`와 갈라 둔 이유는 부르는 쪽이 프레임 자체도 써야
 * 하기 때문이다 — 합쳐 두면 전송 층이 같은 줄을 두 번 파싱한다.
 *
 * @param {StreamState} state
 * @param {FrameResult} read
 * @returns {StreamState}
 */
export function step(state, read) {
  if (state.phase !== "live") return state;
  if (!read.ok) return { phase: "broken", lastSeq: state.lastSeq, fault: read.fault };

  const frame = read.frame;
  // 푸시가 아닌 프레임은 카운터를 안 든다(§6). 그래서 수열에 자국을 안 남긴다.
  if (!isPush(frame)) return state;

  const seq = frame.seq;
  const expected = state.lastSeq + 1;
  const handshake = frame.type === "state" && frame.kind === "handshake";

  // §6.1 — *"첫 프레임이 아닌 자리에 온 핸드셰이크와, 핸드셰이크가 아닌 첫 프레임이 둘 다
  // 판별 가능해진다."* 그 둘이 아래 두 갈래다.
  if (state.lastSeq === 0 && !handshake) {
    return {
      phase: "broken",
      lastSeq: state.lastSeq,
      fault: { kind: "first_push_not_handshake", frameType: frame.type },
    };
  }
  if (state.lastSeq !== 0 && handshake) {
    return {
      phase: "broken",
      lastSeq: state.lastSeq,
      fault: { kind: "handshake_out_of_order", seq },
    };
  }

  // §8 — *"클라이언트는 번호가 건너뛰면 갭으로 판정한다."* 대상은 푸시 전부이고 카운터는
  // 하나다(§6.1). 그래서 `event`와 `state`를 섞은 수열에서도 같은 산술이 선다.
  if (seq > expected) {
    return { phase: "gap", lastSeq: state.lastSeq, expected, received: seq };
  }
  if (seq < expected) {
    // [미규정] §6·§8은 번호가 **뒤로 가거나 겹치는** 경우를 이름 붙이지 않는다. 건너뜀만
    // 갭으로 정의했으므로 이쪽은 갭이 아니고, *"연결마다 1부터 단조 증가한다"*(§6)를 깨는
    // 값이라 정상도 아니다. 조용히 버리는 것만이 금지된 것이 확실하므로(§9.3) 가시적인
    // 결함으로 둔다 — 나중에 갭으로 접는 것은 넓히는 변경이고, 반대는 계약 파기다.
    return {
      phase: "broken",
      lastSeq: state.lastSeq,
      fault: { kind: "not_monotonic", expected, received: seq },
    };
  }

  // §6.1 — *"`shutdown`을 받은 클라이언트는 재접속하지 않는다."*
  if (frame.type === "state" && frame.kind === "shutdown") {
    return { phase: "ended", lastSeq: seq };
  }
  return { phase: "live", lastSeq: seq };
}

/**
 * 스트림이 실어 온 한 줄로 상태를 옮긴다.
 *
 * @param {StreamState} state
 * @param {string} text
 * @returns {StreamState}
 */
export function advance(state, text) {
  return step(state, readFrame(text));
}

/**
 * 연결이 끊겼을 때 다시 붙어도 되는가. **갈래가 하나다**(§9.3) — 고지를 받으면 멈추고 그
 * 밖의 모든 상태에서는 붙는다.
 *
 * 이 함수가 없으면 §11 마지막 행의 채택 근거가 실물을 못 얻는다(§6.1). 전송은 서버가 연결을
 * 닫으면 스스로 다시 붙으므로, 고지를 받고 **스스로 멈추는 것 말고** «영구히 내려갔다»를
 * 표현할 수단이 없다.
 *
 * @param {StreamState} state
 * @returns {boolean}
 */
export function reconnectAllowed(state) {
  return state.phase !== "ended";
}
