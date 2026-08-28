/**
 * 배선의 **접기 층** — 정본은 `docs/WEB-UI.md` §9.6이다.
 *
 * 그 절의 결정 1이 배선을 층 셋으로 갈랐다. ① **접기** — *"입력 하나를 화면 상태에 접는다"* ·
 * ② **뷰**(`./view.js`) · ③ **그리기**(`./render.js`). 이 파일이 ①이고, 같은 항이
 * *"①②는 순수하고 시그니처에 DOM 타입도 DOM 전역도 안 낸다"*로 그 순수성을 계약으로 들었다.
 * 그래서 이 모듈에는 브라우저 전역이 최상위에도 함수 안에도 없다 — 형제
 * `./wiring.js`가 조회 통로에 대해 이미 쓴 규율이고, 그 배치가 node 환경의 계약 테스트가
 * 이 모듈을 그대로 임포트할 수 있는 근거다.
 *
 * **전송도 모른다.** 여는 것도 보내는 것도 `./stream.js`의 몫이고, 이 파일이 받는 것은 그
 * 전송이 이미 실어 온 값(콜백 다섯이 나르는 것)과 사용자의 제스처, 그리고 요청 왕복의
 * 결과뿐이다.
 *
 * ## 입력 알파벳이 하나다 (결정 3)
 *
 * 그 항이 *"접기의 입력 알파벳은 하나이고 판별자로 닫는다."*로 열고, 콜백마다 따로 그리면
 * *"그리는 자리가 다섯이 되고"* 「화면은 상태의 함수다」가 성립을 멈춘다고 적었다. 아래
 * `WiringSignal`이 그 알파벳이고 `openStream`의 다섯(`onEvent`·`onEffect`·`onFault`·`onGap`·
 * `onOffStreamFrame`)과 사용자 제스처 둘, 요청 왕복의 결과 둘이 한 유니온에 든다. §8.1이
 * 프레임과 연결 사건을 한 알파벳에 넣은 것과 같은 근거이고, 그 판정이 낳은 것이 형제
 * `./protocol.js`의 `applySignal`이다.
 *
 * ## 와이어 텍스트를 읽는 자리는 `readFrame` 하나다
 *
 * 요청의 응답 본문은 **텍스트**로 이 층에 오고 그것을 읽는 것은 `./protocol.js`의 `readFrame`
 * 이다. 새 파서를 두면 §6.1의 판별자 폐쇄에 사본이 하나 더 생기고, 그 사본은 서버가 유니온을
 * 넓혔을 때 조용히 낡는다 — `protocol.js`가 프레임 정의를 `../src/protocol.ts` 하나에서
 * 들여오는 것과 같은 근거다.
 *
 * **다만 `readFrame`이 재는 것은 판별자와 `seq`의 형태뿐이다** — 그 파일이 스스로
 * *"프레임 안쪽 필드의 전수 검증은 하지 않는다"*고 적었다. 그래서 응답의 안쪽(`ok`·`error`)을
 * 읽는 자리에서 이 파일이 런타임 형태를 한 번 더 확인하고, 어긋나면 조용히 성공으로 접지
 * 않고 가시적인 처분으로 낸다(`ARCHITECTURE.md` §2.6).
 *
 * ## 이 파일이 재지 못하는 것
 *
 * **순수성을 타입 검사가 안 재준다.** `client/tsconfig.json`이 `lib: DOM`이라 이 파일 안의
 * DOM 전역 참조는 컴파일에서 안 붉는다(§9.3이 설정을 가른 것은 서버 쪽 경계이지 이 방향이
 * 아니다). 남는 강제 수단은 텍스트 스캔과 사람의 검토뿐이고, 그것은 §2.3이 이름 붙인
 * *"검사가 실제보다 넓게 주장하는"* 상태를 피하려고 여기 적는다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로 있는
 * 부분 문자열이고, 문서를 지목하는 자리는 절 번호와 결정 번호로 한다.
 */

import { readFrame } from "./protocol.js";

/** @typedef {import("../src/protocol.ts").PendingApproval} PendingApproval */
/** @typedef {import("../src/protocol.ts").RequestFrame} RequestFrame */
/** @typedef {import("../src/protocol.ts").ServerEventFrame["event"]} AgentEvent */
/** @typedef {import("../src/protocol.ts").StateSnapshot} StateSnapshot */
/** @typedef {import("../src/protocol.ts").StateSnapshot["transcript"]["messages"][number]} AgentMessage */
/** @typedef {import("../src/approvals.ts").ApprovalAnswer} ApprovalAnswer */
/** @typedef {import("../src/methods.ts").MethodName} MethodName */
/** @typedef {import("./protocol.js").StateEffect} StateEffect */
/** @typedef {import("./protocol.js").StreamFault} StreamFault */

/* -------------------------------------------------------------------------- *
 * 입력 — 알파벳 하나 (결정 3)
 * -------------------------------------------------------------------------- */

/**
 * 배선 상태기계의 입력. **판별자로 닫는다.**
 *
 * 갈래가 어디서 오는지:
 *
 * - `event`·`effect`·`fault`·`gap`·`off_stream_frame` — `openStream`의 다섯 콜백. 부트가
 *   그대로 옮긴다(결정 12 — *"부트가 하는 것은 셋뿐이다"*)
 * - `prompt_submitted`·`approval_answered` — 사용자 제스처. **요청 id를 함께 싣는다**:
 *   결정 10이 *"요청 id를 순수 층이 짓지 않는다."*로 발급을 부작용으로 판정했고
 *   *"순수 함수는 id를 **받아서** `RequestFrame`을 짓는다."*
 * - `response_body`·`request_rejected` — 요청 왕복의 결과 둘. 결정 6이
 *   *"요청의 응답을 버리지 않는다"*로 이 둘을 요구한다. 앞엣것은 응답 **본문 텍스트**이고
 *   (읽는 것은 아래 `readResponse`의 `readFrame` 하나다) 뒤엣것은 전송이 거부한 경우다
 *
 * **왕복의 결과가 자기 `requestId`를 든다.** 안 들면 승인 응답 하나가 제출 잠금을 푸는
 * 경로가 열리고, 그것은 사용자가 누른 것과 무관한 자리가 움직이는 형태다. 결정 5의 잠금이
 * *"왕복 동안"*으로 정의됐으므로 **어느 왕복인가**가 상태에 있어야 그 문장이 성립한다.
 *
 * @typedef {| { readonly kind: "event"; readonly event: AgentEvent }
 *   | { readonly kind: "effect"; readonly effect: StateEffect }
 *   | { readonly kind: "fault"; readonly fault: StreamFault }
 *   | { readonly kind: "gap" }
 *   | { readonly kind: "off_stream_frame"; readonly frameType: "req" | "res" }
 *   | { readonly kind: "prompt_submitted"; readonly requestId: string }
 *   | {
 *       readonly kind: "approval_answered";
 *       readonly requestId: string;
 *       readonly approvalId: string;
 *       readonly answer: ApprovalAnswer;
 *     }
 *   | { readonly kind: "response_body"; readonly requestId: string; readonly body: string }
 *   | { readonly kind: "request_rejected"; readonly requestId: string; readonly reason: string }
 * } WiringSignal
 */

/* -------------------------------------------------------------------------- *
 * 화면 상태 — 서버가 준 것과 배선이 낸 요청의 왕복뿐 (결정 2)
 * -------------------------------------------------------------------------- */

/**
 * 연결이 지금 무엇을 하고 있는가. **닫힌 알파벳이고 통지가 아니라 파생이다.**
 *
 * `./stream.js`가 화면에 알리는 것은 나쁜 소식 둘뿐이다(`onGap`·`onFault`) — 최초 연결
 * 성립과 갭 회복에는 통지 갈래가 없다(2026-08-28 실측). 그래서 «연결됨»을 통지에서 받지
 * 않고 **핸드셰이크 수신 자체**에서 파생한다: `replace_snapshot`은 최초 연결과 재접속 회복이
 * 둘 다 지나는 자리이고, `receive`가 phase와 무관하게 정상 프레임을 전부 콜백에 넘기므로 이
 * 파생이 실물로 성립한다. 이 파생은 2026-08-28 사용자 결정이고, 반대 갈래(§8.1의 통지 집합에
 * «연결 성립»을 더하는 것)는 `./stream.js` 개정을 범위에 들이므로 안 골랐다.
 *
 * **`stopped`가 따로 서는 이유.** §6.1이 종료 고지에 대해 *"고지는 화면에 아무 결과를 안
 * 낳는다"*를 실패로 이름 붙였다 — 고지를 받고도 자국이 없으면 그 실패가 그대로 선다.
 *
 * **`gap`이 수치를 안 든다.** `onGap`이 나르는 것은 `StreamState` 유니온 전부이고 거기서
 * `expected`·`received`를 꺼내려면 부트가 phase로 갈라야 하는데, 결정 12가 부트의 판정을
 * 0으로 못박았다. 수치는 진단 세부이고 «끊겼다»는 사실이 이 자리의 계약이다.
 *
 * @typedef {| { readonly kind: "connecting" }
 *   | { readonly kind: "connected" }
 *   | { readonly kind: "gap" }
 *   | { readonly kind: "fault"; readonly fault: StreamFault }
 *   | { readonly kind: "stopped" }
 *   | { readonly kind: "off_stream_frame"; readonly frameType: "req" | "res" }
 * } ConnectionNarration
 */

/**
 * 마지막 요청 왕복의 결과. 결정 6 — *"요청의 응답을 버리지 않는다"*.
 *
 * 갈래가 여섯인 것은 **실제로 갈리는 처분이 여섯이기 때문**이다. 성공과 실패를 가르고,
 * 실패 안에서 서버가 이름 붙인 실패(§11의 어휘)와 전송의 거부와 계약 밖 응답을 가른다 —
 * 뭉치면 사용자의 다음 행동이 다른 것들이 한 문면으로 접힌다(§6.1이 `resolvedBy`에 대해
 * 쓴 근거와 같은 형태).
 *
 * @typedef {| { readonly kind: "none" }
 *   | { readonly kind: "accepted"; readonly requestId: string }
 *   | {
 *       readonly kind: "failed";
 *       readonly requestId: string;
 *       readonly code: string;
 *       readonly message: string;
 *     }
 *   | { readonly kind: "rejected"; readonly requestId: string; readonly reason: string }
 *   | { readonly kind: "unreadable"; readonly requestId: string; readonly fault: StreamFault }
 *   | {
 *       readonly kind: "off_contract";
 *       readonly requestId: string;
 *       readonly reason: "not_a_response" | "id_mismatch" | "error_shape";
 *     }
 * } RequestOutcome
 */

/**
 * 제출 왕복의 상태 = **잠금의 원천**(결정 5).
 *
 * 판별자로 닫아 «잠겨 있는데 어느 요청인지 모른다»가 표현되지 않게 한다. 그 요청 id가 있어야
 * 잠금을 푸는 것이 **그 왕복의 응답**이라고 말할 수 있다.
 *
 * @typedef {| { readonly phase: "idle" }
 *   | { readonly phase: "in_flight"; readonly requestId: string }
 * } SubmitState
 */

/**
 * 화면 상태. 결정 2 — *"화면 상태가 드는 것은 서버가 준 것과 배선이 낸 요청의 왕복뿐이다 —
 * 사용자가 치고 있는 텍스트는 안 든다."*
 *
 * **입력 텍스트의 필드가 없는 것이 계약이다.** 있으면 서버 프레임 하나가 입력 중인 텍스트를
 * 덮어쓰는 경로가 표현 가능해지고, 그것이 *"사용자가 친 것이 조용히 사라지는 경로"*다.
 *
 * **연결의 처분과 요청의 결과를 두 필드로 나눠 든다.** 결정 6이 한 **자리**
 * (`connection-status`)에 둘을 실었지 한 **필드**에 접으라고 하지 않았다 — 접으면 나중 것이
 * 앞엣것을 지워 그 항이 스스로 든 빚(*"둘이 서로를 덮는다"*)이 상태 층에서 미리 실현된다.
 * 둘을 한 문면으로 합치는 것은 뷰의 몫이다(`./view.js`).
 *
 * **트랜스크립트의 잘림(`omitted`)을 안 든다.** §9.6 범위 표가 `transcript-truncation`·
 * `transcript-load-more`를 이번에 안 붙이기로 했고, 안 그릴 값을 상태에 두면 그 자리가
 * 「붙어 있다」로 읽힌다.
 *
 * @typedef {{
 *   readonly transcript: readonly AgentMessage[],
 *   readonly approvals: readonly PendingApproval[],
 *   readonly connection: ConnectionNarration,
 *   readonly request: RequestOutcome,
 *   readonly submit: SubmitState,
 * }} ScreenState
 */

/**
 * 배선이 시작하는 자리. **«연결 중»이 초기값이다** — 첫 핸드셰이크가 오기 전의 화면이
 * «연결됨»이면 그것은 아직 참이 아닌 사실을 화면이 지어내는 것이다.
 *
 * @type {ScreenState}
 */
export const INITIAL_SCREEN_STATE = Object.freeze({
  transcript: Object.freeze([]),
  approvals: Object.freeze([]),
  connection: Object.freeze({ kind: "connecting" }),
  request: Object.freeze({ kind: "none" }),
  submit: Object.freeze({ phase: "idle" }),
});

/* -------------------------------------------------------------------------- *
 * 트랜스크립트 — 동일성은 메시지 `id`다 (결정 4)
 * -------------------------------------------------------------------------- */

/**
 * 메시지 하나를 트랜스크립트에 넣는다. **`id`로 찾아 있으면 대체하고 없으면 뒤에 붙인다.**
 *
 * 결정 4가 수명주기 셋(`message_start`·`message_update`·`message_end`)을 *"같은 한 동작"*으로
 * 정했다 — 코어가 *"스트리밍 초안과 그 최종 메시지가 같은 id를 갖는다"*를 계약으로 들므로
 * (`packages/core/src/messages.ts`) 셋을 갈래로 나눌 필요가 없고, *"나누면 그 갈림이 곧 중복
 * 항목의 경로다."*
 *
 * @param {readonly AgentMessage[]} transcript
 * @param {AgentMessage} message
 * @returns {readonly AgentMessage[]}
 */
function upsertMessage(transcript, message) {
  const at = transcript.findIndex((item) => item.id === message.id);
  if (at < 0) return [...transcript, message];
  return transcript.map((item, index) => (index === at ? message : item));
}

/**
 * 대기 승인 하나를 넣는다. 같은 `id`가 이미 있으면 대체다 — 서버가 같은 승인을 두 번 열면
 * 화면에 같은 항목이 둘 서는 것이 결정 4가 트랜스크립트에 대해 막은 형태와 같다.
 *
 * @param {readonly PendingApproval[]} approvals
 * @param {PendingApproval} approval
 * @returns {readonly PendingApproval[]}
 */
function upsertApproval(approvals, approval) {
  const at = approvals.findIndex((item) => item.id === approval.id);
  if (at < 0) return [...approvals, approval];
  return approvals.map((item, index) => (index === at ? approval : item));
}

/**
 * 에이전트 이벤트 하나를 접는다.
 *
 * **`AgentEvent`에 대한 소진 검사가 이 `switch`다**(결정 4). 코어가 이벤트를 더한 날 이
 * 자리가 붉고, *"그때 판정할 것이 «이 이벤트가 트랜스크립트에 실리는가»다."* `default`로
 * 흘리는 갈래는 §9.6이 기각했다 — §9.3 근거 3이 생성 도구의 기본값으로 이름 붙인
 * *"모르는 판별자를 조용히 버리고"*를 우리 손으로 되풀이하게 되기 때문이다.
 *
 * **나머지 일곱이 트랜스크립트를 안 움직이는 것도 결정이다.** `agent_end`가 그 런의 메시지를
 * 다시 싣지만 *"그것들은 이미 수명주기로 왔고"*, `tool_*` 셋의 결과는 `ToolResultMessage`가
 * 되어 같은 수명주기로 온다.
 *
 * @param {ScreenState} state
 * @param {AgentEvent} event
 * @returns {ScreenState}
 */
function foldEvent(state, event) {
  switch (event.type) {
    case "message_start":
    case "message_update":
    case "message_end":
      return { ...state, transcript: upsertMessage(state.transcript, event.message) };
    case "agent_start":
    case "agent_end":
    case "turn_start":
    case "turn_end":
    case "tool_start":
    case "tool_update":
    case "tool_end":
      return state;
    default: {
      /** @type {never} */
      const unreachable = event;
      throw new Error(`소진되지 않은 이벤트 판별자: ${JSON.stringify(unreachable)}`);
    }
  }
}

/**
 * 상태 프레임의 처분 하나를 접는다.
 *
 * **스냅샷은 대체다**(결정 4 · §8.1) — *"누적하지 않는다."* 누적하면 스냅샷이 이미 든 꼬리와
 * 겹쳐 같은 메시지가 두 번 서고, 그 중복은 화면에만 나타나므로 서버가 원리적으로 못 잰다.
 *
 * **승인의 시작도 스냅샷이다**(결정 7) — *"상태는 스냅샷의 `pendingApprovals`에서 시작해
 * `approval_open`이 더하고 `approval_close`가 뺀다"*. `stateEffect`가 이미 그 넷을 갈라
 * 두었으므로 *"배선이 다시 판정할 것이 없다."*
 *
 * **`StateEffect`에 대한 소진 검사가 이 `switch`다.**
 *
 * @param {ScreenState} state
 * @param {StateEffect} effect
 * @returns {ScreenState}
 */
function foldEffect(state, effect) {
  switch (effect.effect) {
    case "replace_snapshot":
      return {
        ...state,
        transcript: effect.snapshot.transcript.messages,
        approvals: effect.snapshot.pendingApprovals,
        // 핸드셰이크 수신이 «연결됨»의 유일한 원천이다 — 위 `ConnectionNarration` 참조.
        connection: { kind: "connected" },
      };
    case "stop":
      return { ...state, connection: { kind: "stopped" } };
    case "approval_open":
      return { ...state, approvals: upsertApproval(state.approvals, effect.approval) };
    case "approval_close":
      return {
        ...state,
        approvals: state.approvals.filter((item) => item.id !== effect.id),
      };
    default: {
      /** @type {never} */
      const unreachable = effect;
      throw new Error(`소진되지 않은 처분 판별자: ${JSON.stringify(unreachable)}`);
    }
  }
}

/* -------------------------------------------------------------------------- *
 * 요청 왕복 — 응답을 버리지 않는다 (결정 6)
 * -------------------------------------------------------------------------- */

/**
 * 이 왕복이 제출의 것이면 잠금을 푼다. **성공이든 실패든 푼다** — 결정 5가 잠금을
 * *"왕복 동안"*으로 정의했으므로 왕복이 끝나면 그 근거가 사라진다. 안 풀면 한 번 실패한
 * 뒤로 사용자가 영영 못 누르는 화면이 된다.
 *
 * @param {SubmitState} submit
 * @param {string} requestId
 * @returns {SubmitState}
 */
function releaseSubmit(submit, requestId) {
  if (submit.phase !== "in_flight") return submit;
  if (submit.requestId !== requestId) return submit;
  return { phase: "idle" };
}

/**
 * 응답 본문 텍스트 하나를 처분으로 읽는다.
 *
 * **파싱은 `readFrame` 하나다.** 새 파서를 두지 않는 근거는 이 파일 머리가 든다.
 *
 * **그 뒤의 확인은 파싱이 아니라 형태 검사다.** `readFrame`이 `res`에 대해 재는 것은
 * `type`뿐이고 (*"프레임 안쪽 필드의 전수 검증은 하지 않는다"*), 그래서 `ok`·`error`의 실제
 * 형태를 여기서 한 번 본다. 타입이 참이라고 믿고 그냥 읽으면 형태가 어긋난 본문 하나가
 * 이 순수 함수를 던지게 하고, 그 던짐은 부트의 응답 급수에서 삼켜져 **아무 자국도 안
 * 남긴다** — 정확히 §2.6이 금한 형태다.
 *
 * **`id` 대조도 여기서 한다.** §6이 *"요청 하나에 정확히 하나"*로 응답을 요청에 묶었으므로
 * 다른 `id`의 응답을 우리 요청의 결과로 읽는 것은 계약 밖이다.
 *
 * @param {string} requestId
 * @param {string} body
 * @returns {RequestOutcome}
 */
function readResponse(requestId, body) {
  const read = readFrame(body);
  if (!read.ok) return { kind: "unreadable", requestId, fault: read.fault };

  const frame = read.frame;
  if (frame.type !== "res") return { kind: "off_contract", requestId, reason: "not_a_response" };
  if (frame.id !== requestId) return { kind: "off_contract", requestId, reason: "id_mismatch" };

  // 타입이 든 것과 바이트가 든 것을 가르는 자리. `readFrame`이 안 재는 안쪽을 본다.
  const record = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (frame));
  if (record.ok === true) return { kind: "accepted", requestId };

  const error = record.error;
  if (typeof error !== "object" || error === null) {
    return { kind: "off_contract", requestId, reason: "error_shape" };
  }
  const detail = /** @type {Record<string, unknown>} */ (error);
  const code = detail.code;
  const message = detail.message;
  if (typeof code !== "string" || typeof message !== "string") {
    return { kind: "off_contract", requestId, reason: "error_shape" };
  }
  return { kind: "failed", requestId, code, message };
}

/* -------------------------------------------------------------------------- *
 * 접기 — 신호 하나를 화면 상태에 접는다
 * -------------------------------------------------------------------------- */

/**
 * 신호 하나를 접는다. **`WiringSignal`에 대한 소진 검사가 이 `switch`다.**
 *
 * **제스처는 트랜스크립트에 아무것도 안 더한다**(결정 5) — *"낙관적 그리기를 하지 않는다"*.
 * 제출한 프롬프트가 화면에 처음 서는 것은 서버가 그것을 메시지로 돌려줄 때이고, 미리 그리면
 * 스냅샷 대체와 겹쳐 같은 메시지가 두 번 서거나 서버가 받지 않은 것이 화면에 남는다.
 * *"그 대신 창이 하나 열린다"* — 그 창을 메우는 것이 제출 잠금이다.
 *
 * **승인 응답은 잠그지 않는다.** 결정 5의 잠금은 제출에 대한 것이고, 승인 항목은 서버가
 * `approval_settled`를 밀 때 사라진다(결정 7의 `approval_close`). 두 제스처가 공통으로 하는
 * 것은 직전 왕복의 결과 표시를 지우는 것뿐이다 — 새 왕복이 시작했는데 앞 왕복의 실패가
 * 그대로 서 있으면 그 문면이 지금의 사실이 아니다.
 *
 * @param {ScreenState} state
 * @param {WiringSignal} signal
 * @returns {ScreenState}
 */
export function foldSignal(state, signal) {
  switch (signal.kind) {
    case "event":
      return foldEvent(state, signal.event);
    case "effect":
      return foldEffect(state, signal.effect);
    case "fault":
      return { ...state, connection: { kind: "fault", fault: signal.fault } };
    case "gap":
      return { ...state, connection: { kind: "gap" } };
    case "off_stream_frame":
      // 스트림으로 온 요청·응답은 계약 밖이다(§2.1이 그 반쪽을 POST에 두었다). `stream.js`가
      // *"조용히 버리지 않고 올린다"*고 적었으므로 이 층도 버리지 않는다.
      return {
        ...state,
        connection: { kind: "off_stream_frame", frameType: signal.frameType },
      };
    case "prompt_submitted":
      return {
        ...state,
        submit: { phase: "in_flight", requestId: signal.requestId },
        request: { kind: "none" },
      };
    case "approval_answered":
      return { ...state, request: { kind: "none" } };
    case "response_body":
      return {
        ...state,
        request: readResponse(signal.requestId, signal.body),
        submit: releaseSubmit(state.submit, signal.requestId),
      };
    case "request_rejected":
      return {
        ...state,
        request: { kind: "rejected", requestId: signal.requestId, reason: signal.reason },
        submit: releaseSubmit(state.submit, signal.requestId),
      };
    default: {
      /** @type {never} */
      const unreachable = signal;
      throw new Error(`소진되지 않은 신호 판별자: ${JSON.stringify(unreachable)}`);
    }
  }
}

/* -------------------------------------------------------------------------- *
 * 요청 프레임 — id는 받아서 쓴다 (결정 10)
 * -------------------------------------------------------------------------- */

/**
 * 프롬프트 제출의 메서드 이름. **`MethodName`으로 좁혀 두는 것이 강제 수단이다** — 표에 없는
 * 이름을 적으면 컴파일이 깨진다(`../src/methods.ts`의 `METHOD_NAMES`가 그 표다). §11이
 * *"메서드 표에 없으면 거부"*로 닫았으므로 오타는 런타임에 `unknown_method`가 되고, 그
 * 거부는 화면에 뜨긴 하나 컴파일에서 잡는 편이 낫다.
 *
 * @type {MethodName}
 */
const PROMPT_METHOD = "run.prompt";

/**
 * 승인 응답의 메서드 이름. 위와 같은 강제를 받는다.
 *
 * @type {MethodName}
 */
const SETTLE_METHOD = "approval.settle";

/**
 * 프롬프트 제출 요청을 짓는다.
 *
 * **`id`를 받는다** — 결정 10이 *"발급은 부작용이라 순수 층에 넣으면 그 축이 «같은 입력에 같은
 * 출력»을 잃는다"*로 그 자리를 부트에 두었다.
 *
 * **`params`의 형태는 서버 스키마의 사본이다.** `RequestFrame.params`가 §6대로 열린 필드라
 * 타입이 이 자리를 안 재고, 어긋나면 서버가 `invalid_params`로 답한다 — 그 실패는 결정 6이
 * 이미 가시적으로 만든다. 사본을 없애려면 메서드별 파라미터 타입을 서버가 공개해야 하고
 * 그것은 §9.6의 범위 밖이다.
 *
 * @param {string} id
 * @param {string} text
 * @returns {RequestFrame}
 */
export function promptRequest(id, text) {
  return { type: "req", id, method: PROMPT_METHOD, params: { text } };
}

/**
 * 승인 응답 요청을 짓는다. `answer`가 `ApprovalAnswer`로 닫혀 있으므로 배선이 서버의 답 셋
 * 밖을 보내는 경로가 표현되지 않는다(결정 7 — *"낼 수 있는 답의 집합은 서버의 것 그대로다"*).
 *
 * @param {string} id 요청 id (부트가 발급)
 * @param {string} approvalId 대기 승인의 id
 * @param {ApprovalAnswer} answer
 * @returns {RequestFrame}
 */
export function approvalRequest(id, approvalId, answer) {
  return { type: "req", id, method: SETTLE_METHOD, params: { id: approvalId, answer } };
}
