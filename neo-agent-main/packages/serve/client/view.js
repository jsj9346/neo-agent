/**
 * 배선의 **뷰 층** — 정본은 `docs/WEB-UI.md` §9.6이다.
 *
 * 결정 1의 층 둘째다: *"**뷰** — 화면 상태에서 자리별로 그릴 값을 낸다"*. 같은 항이
 * *"①②는 순수하고 시그니처에 DOM 타입도 DOM 전역도 안 낸다"*로 이 파일의 순수성을 계약으로
 * 들었고, 그래서 여기 있는 것은 값을 값으로 옮기는 함수뿐이다 — 노드도 요소도 만들지 않는다.
 *
 * ## 이 층이 문면을 짓는다 — 한 자리만 빼고
 *
 * 결정 1이 *"그리기 층은 판정을 안 한다. 분기가 필요하면 그 분기는 ①이나 ②로 간다."*로
 * 닫았으므로 «어느 상태가 어떤 문장이 되는가»는 여기서 끝나야 한다. 그리기 층이 받는 것은
 * 이미 완성된 문자열이고, 그 배치가 아니면 그 층에 판정이 생긴다.
 *
 * **예외가 `composer-submit`이다.** 결정 2가 *"`composer-submit`의 문면을 배선이 짓지
 * 않는다."*로 그 자리의 소유를 화면에 두었다(처분은 재생성 사이클 `K-329`). 그래서 아래
 * 뷰 값이 그 자리에 대해 드는 것은 **잠금 불리언 하나**이고 문자열이 없다.
 *
 * ## 배선 집합의 상수가 여기 산다 (결정 11)
 *
 * *"부트가 여는 이름의 집합이 위 범위 표의 기계 판이다."* 아래 `WIRED_ANCHORS`가 그 집합이고
 * 부트는 이것을 **순회해서** 앵커를 연다 — 이름을 부트가 다시 적으면 그 목록이 사본이 되고,
 * 사본은 낡는다(`./anchors.js`가 같은 근거로 자기 배열을 표에서 파생한다).
 *
 * **`./anchors.js`의 값을 런타임에 받아 온다.** 타입만 들여오면 이 집합이 전체 목록의
 * 부분집합이라는 사실이 `Extract`의 컴파일 축 하나에만 걸리고, 그 축은 두 이름이 **함께**
 * 사라질 때 `never`로 붕괴해 죽는다(`./wiring.js`가 안전 사실 둘에 대해 실측으로 적어 둔
 * 형태). 값에서 걸러 내면 붕괴해도 배열이 비고, 빈 배열은 계약 테스트가 잡는다.
 *
 * ## 이 파일이 재지 못하는 것
 *
 * **순수성을 타입 검사가 안 재준다** — 근거는 형제 `./state.js` 머리와 같다
 * (`client/tsconfig.json`이 `lib: DOM`이다). 남는 수단은 텍스트 스캔과 사람의 검토다.
 *
 * **문면 자체는 아무도 안 잰다.** 문면은 §12가 드는 세부이고, 계약 테스트가 리터럴을 고정하면
 * 그 순간 세부가 계약이 된다 — `./wiring.js`가 안전 표시에 대해 쓴 규율 그대로다. 재지는
 * 것은 «비어 있지 않은가»와 «구별되는가»이지 «무엇이라 쓰였는가»가 아니다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로 있는
 * 부분 문자열이고, 문서를 지목하는 자리는 절 번호와 결정 번호로 한다.
 */

import { ANCHOR_NAMES } from "./anchors.js";
import { anchorElement } from "./wiring.js";

/** @typedef {import("./anchors.js").AnchorName} AnchorName */
/** @typedef {import("./state.js").ConnectionNarration} ConnectionNarration */
/** @typedef {import("./state.js").RequestOutcome} RequestOutcome */
/** @typedef {import("./state.js").ScreenState} ScreenState */
/** @typedef {import("./protocol.js").StreamFault} StreamFault */
/** @typedef {import("../src/approvals.ts").ApprovalAnswer} ApprovalAnswer */
/** @typedef {import("../src/protocol.ts").StateSnapshot["transcript"]["messages"][number]} AgentMessage */
/** @typedef {AgentMessage["content"][number]} MessageContent */

/* -------------------------------------------------------------------------- *
 * 배선 집합 — §9.6 범위 표의 기계 판 (결정 11)
 * -------------------------------------------------------------------------- */

/**
 * 이번 사이클에 배선하는 앵커 이름. **범위 표의 「붙는다」 다섯 그대로다.**
 *
 * 안 붙는 넷(`transcript-truncation`·`transcript-load-more`·`run-abort`와 안전 사실 둘 중
 * 어느 것도)이 여기 없는 것은 누락이 아니라 그 표의 판정이다 — 그 표가
 * *"관측이 아니라 **판정**이다"*를 스스로 적었고, *"안 붙는 자리의 앵커는 화면에 그대로 있고
 * 비어 있다."*
 *
 * @typedef {Extract<
 *   AnchorName,
 *   "transcript" | "composer-input" | "composer-submit" | "approval" | "connection-status"
 * >} WiredAnchor
 */

/**
 * 위 유니온의 표. **손 목록이 아니라 키가 강제되는 표다** — 이름 하나가 `./anchors.js`에서
 * 사라지거나 개명되면 `Extract`가 그것을 떨궈 여기가 초과 속성으로 붉는다(`./anchors.js`의
 * `ANCHOR_TABLE`과 같은 형태).
 *
 * @type {Readonly<Record<WiredAnchor, true>>}
 */
const WIRED_TABLE = {
  transcript: true,
  "composer-input": true,
  "composer-submit": true,
  approval: true,
  "connection-status": true,
};

/**
 * 부트가 여는 이름 전부. **전체 목록에서 걸러 낸다** — 그래서 부분집합인 것이 구성으로
 * 참이고, 별도의 대조가 그 사실을 다시 지을 필요가 없다. 순서는 `./anchors.js`의 것이고
 * 뜻이 없다.
 *
 * @type {readonly WiredAnchor[]}
 */
export const WIRED_ANCHORS = Object.freeze(
  /** @type {WiredAnchor[]} */ (ANCHOR_NAMES.filter((name) => Object.hasOwn(WIRED_TABLE, name))),
);

/**
 * 배선하는 앵커를 **한 번에** 연다 (결정 11).
 *
 * *"그릴 때가 되어서야 열면 승인 앵커의 부재가 첫 승인이 뜰 때까지 안 드러난다 — 늦게
 * 드러나는 실패를 만들지 않는다."* 통로가 못 찾으면 던지고(§9.4 결정 13) 이 함수는 그 던짐을
 * **안 잡는다** — *"잡아서 화면에 쓰려면 그 자리도 앵커라 같은 실패에 걸린다."*
 *
 * **원천이 인자다.** 그래서 이 함수에 DOM 타입도 DOM 전역도 안 난다 — `./wiring.js`의
 * `AnchorSource`가 이미 쓴 배치이고, node 환경의 계약 테스트가 이 함수를 그대로 부를 수 있는
 * 근거다.
 *
 * @template {object} E
 * @param {import("./wiring.js").AnchorSource<E>} source
 * @returns {Readonly<Record<WiredAnchor, E>>}
 */
export function openWiredAnchors(source) {
  /** @type {Partial<Record<WiredAnchor, E>>} */
  const opened = {};
  for (const name of WIRED_ANCHORS) {
    opened[name] = anchorElement(source, name);
  }
  // 전부 채워졌다는 것은 위 배열이 `WIRED_TABLE`의 키 집합과 같다는 사실에서 온다. 그 동일성은
  // 컴파일(초과 속성·미충족)과 계약 테스트의 다섯 이름 대조가 함께 진다.
  return /** @type {Readonly<Record<WiredAnchor, E>>} */ (opened);
}

/* -------------------------------------------------------------------------- *
 * 승인의 답 — 서버의 집합 그대로 (결정 7)
 * -------------------------------------------------------------------------- */

/**
 * 답 → 그 자리의 문면. **키가 `ApprovalAnswer`로 강제되는 표다** — 서버의 집합
 * (`../src/approvals.ts`의 `APPROVAL_ANSWERS`)이 넓어지면 키가 미충족이라 붉고, 좁아지면
 * 초과 속성이라 붉는다.
 *
 * 결정 7 — *"낼 수 있는 답의 집합은 서버의 것 그대로다"*. *"배선이 부분집합을 고르면 그
 * 좁힘이 어디에도 안 적힌 사본이 되고"* 그 사본이 화면에서 조용히 답을 지운다.
 *
 * @type {Readonly<Record<ApprovalAnswer, string>>}
 */
const ANSWER_LABELS = {
  "allow-once": "한 번 허용",
  "allow-always": "항상 허용",
  deny: "거부",
};

/**
 * 낼 수 있는 답 전부. 위 표에서 파생한다.
 *
 * @type {readonly ApprovalAnswer[]}
 */
export const APPROVAL_ANSWERS = Object.freeze(
  /** @type {ApprovalAnswer[]} */ (Object.keys(ANSWER_LABELS)),
);

/**
 * 데이터 속성에서 읽은 문자열이 답인가. **위 표가 판정의 유일한 근거다.**
 *
 * 이 술어가 있는 이유는 결정 7이 요구한 위임이다 — 컨테이너 하나가 클릭을 받으므로 그 클릭이
 * 자기 컨트롤의 것인지, 그리고 그 컨트롤이 든 답이 집합 안인지를 가르는 자리가 필요하고,
 * 그 판정은 그리기 층이 아니라 이 순수 층의 몫이다(결정 1).
 *
 * @param {string | null} raw
 * @returns {ApprovalAnswer | null}
 */
export function approvalAnswerOf(raw) {
  if (raw === null) return null;
  if (!Object.hasOwn(ANSWER_LABELS, raw)) return null;
  return /** @type {ApprovalAnswer} */ (raw);
}

/* -------------------------------------------------------------------------- *
 * 자리별 값
 * -------------------------------------------------------------------------- */

/**
 * 트랜스크립트 항목 하나의 그릴 값. `id`는 §9.6 결정 4가 정한 동일성이고 그리기 층이 그것을
 * 데이터 속성으로 나른다.
 *
 * **줄의 배열인 것은 세부다.** 계약인 것은 그리기 층이 이 값을 받아 분기 없이 그릴 수 있다는
 * 것이고, 그래서 여기 오는 것은 이미 완성된 문자열이다.
 *
 * @typedef {{
 *   readonly id: string,
 *   readonly role: AgentMessage["role"],
 *   readonly label: string,
 *   readonly lines: readonly string[],
 * }} TranscriptItemView
 */

/**
 * 승인 항목 하나의 그릴 값. **답 셋이 그대로 실린다**(결정 7).
 *
 * @typedef {{
 *   readonly id: string,
 *   readonly display: string,
 *   readonly answers: readonly { readonly answer: ApprovalAnswer, readonly label: string }[],
 * }} ApprovalItemView
 */

/**
 * 자리별 그릴 값 전부.
 *
 * **키가 앵커 이름인 것이 의도다** — 그리기 층이 같은 이름으로 요소를 찾으므로 대응이 눈으로
 * 대조된다. `composer-input`의 자리가 여기 **없는 것도 계약이다**: 결정 2가 그 자리를
 * *"**읽는 자리**"*로 분류했고, 값이 있으면 그리기 층이 그것을 쓸 수 있게 된다.
 *
 * @typedef {{
 *   readonly transcript: readonly TranscriptItemView[],
 *   readonly approval: readonly ApprovalItemView[],
 *   readonly "connection-status": { readonly text: string },
 *   readonly "composer-submit": { readonly disabled: boolean },
 * }} AnchorValues
 */

/**
 * 역할 → 그 자리의 문면. 키가 강제되는 표다 — 코어가 역할을 더하면 붉는다.
 *
 * @type {Readonly<Record<AgentMessage["role"], string>>}
 */
const ROLE_LABELS = {
  user: "사용자",
  assistant: "에이전트",
  toolResult: "도구 결과",
};

/**
 * 내용 블록 하나를 줄로 옮긴다.
 *
 * **`MessageContent`에 대한 소진 검사가 이 `switch`다.** 텍스트가 아닌 블록을 버리면 화면에
 * 그 메시지가 빈 줄로 서고, 그것이 §2.6의 형태다 — 무엇이 왔는지 모르는 것보다 «이미지가
 * 왔다»가 낫다.
 *
 * @param {MessageContent} block
 * @returns {string}
 */
function lineOfBlock(block) {
  switch (block.type) {
    case "text":
      return block.text;
    case "thinking":
      return `[사고] ${block.text}`;
    case "toolCall":
      // 결정 14 — *"`args`가 `undefined`면 그 조각을 통째로 비운다"*. `JSON.stringify(undefined)`가
      // 값 `undefined`를 내고 보간이 그것을 리터럴로 화면에 심는데, 그것은 «없음»이 아니라 다른
      // 사실이다: *"버려도 되는 것은 «없음»을 그대로 나타내는 것뿐이고, 없음을 «undefined»라는
      // 다른 사실처럼 나타내는 것은 아니다."* `ToolCallContent.args`는 `unknown` 타입의 **필수**
      // 프로퍼티이므로(`packages/core/src/messages.ts`) 이 구멍은 타입이 아니라 런타임 표현의
      // 것이고, 방어도 여기서 한다 — 코어에 선택 필드를 새로 열지 않는다.
      // **`{}`(빈 객체)는 안 건드린다** — 그것은 «인자 없이 호출했다»는 별개의 사실이다.
      return block.args === undefined
        ? `[도구 호출] ${block.toolName}`
        : `[도구 호출] ${block.toolName} ${JSON.stringify(block.args)}`;
    case "image":
      return `[이미지 ${block.mimeType}]`;
    default: {
      /** @type {never} */
      const unreachable = block;
      throw new Error(`소진되지 않은 내용 판별자: ${JSON.stringify(unreachable)}`);
    }
  }
}

/**
 * 내용 블록 밖에 있는, 그래도 보여야 하는 사실.
 *
 * 코어가 이 둘을 필드로 든 근거가 침묵 금지다 — `errorMessage`는
 * *"stopReason이 "error"·"aborted"일 때의 원인. 침묵 실패 금지(ARCHITECTURE §2.6)"*이고
 * `isError`는 도구 결과가 실패였다는 사실이다. 안 그리면 화면에서 그 둘이 정상과 구분되지
 * 않는다.
 *
 * **`AgentMessage["role"]`에 대한 소진 검사가 이 `switch`다.**
 *
 * @param {AgentMessage} message
 * @returns {readonly string[]}
 */
function extraLines(message) {
  switch (message.role) {
    case "user":
      return [];
    case "assistant":
      return message.errorMessage === undefined ? [] : [`[중단] ${message.errorMessage}`];
    case "toolResult":
      return message.isError ? ["[도구 실패]"] : [];
    default: {
      /** @type {never} */
      const unreachable = message;
      throw new Error(`소진되지 않은 역할 판별자: ${JSON.stringify(unreachable)}`);
    }
  }
}

/**
 * 메시지 하나의 그릴 값.
 *
 * @param {AgentMessage} message
 * @returns {TranscriptItemView}
 */
function transcriptItem(message) {
  return {
    id: message.id,
    role: message.role,
    label: ROLE_LABELS[message.role],
    lines: [...message.content.map(lineOfBlock), ...extraLines(message)],
  };
}

/* -------------------------------------------------------------------------- *
 * 세션 서술 — 연결의 처분과 요청의 결과가 한 자리에 선다 (결정 6)
 * -------------------------------------------------------------------------- */

/**
 * 결함 → 문면. 키가 `StreamFault["kind"]`로 강제되는 표다 — `./protocol.js`가 그 유니온에
 * *"소진 `switch`가 안 생긴다"*고 적었으므로 갈래가 늘어도 그 파일은 조용한데, **이 표는
 * 붉는다.** 화면에 이름 없는 결함이 서는 것을 막는 자리가 여기다.
 *
 * @type {Readonly<Record<StreamFault["kind"], string>>}
 */
const FAULT_LABELS = {
  malformed_json: "프레임이 JSON이 아니다",
  not_object: "프레임이 객체가 아니다",
  unknown_type: "모르는 프레임 종류가 왔다",
  unknown_state_kind: "모르는 상태 종류가 왔다",
  bad_seq: "수열 번호의 형태가 계약 밖이다",
  not_monotonic: "수열 번호가 뒤로 갔다",
  handshake_out_of_order: "핸드셰이크가 첫 프레임이 아닌 자리에 왔다",
  first_push_not_handshake: "첫 프레임이 핸드셰이크가 아니다",
  transport_gave_up: "전송이 재접속을 포기했다 — 자산 캐시가 낡았을 수 있다",
};

/**
 * 계약 밖 응답의 사유 → 문면. 위와 같은 형태의 표다.
 *
 * @type {Readonly<Record<Extract<RequestOutcome, { kind: "off_contract" }>["reason"], string>>}
 */
const OFF_CONTRACT_LABELS = {
  not_a_response: "응답 자리에 응답이 아닌 프레임이 왔다",
  id_mismatch: "응답의 요청 id가 보낸 것과 다르다",
  error_shape: "실패 응답이 코드와 문면을 안 들었다",
};

/**
 * 연결이 지금 무엇을 하고 있는가.
 *
 * **`ConnectionNarration`에 대한 소진 검사가 이 `switch`다.**
 *
 * @param {ConnectionNarration} connection
 * @returns {string}
 */
function connectionText(connection) {
  switch (connection.kind) {
    case "connecting":
      return "연결 중";
    case "connected":
      return "연결됨";
    case "gap":
      return "끊김 — 다시 연결하는 중";
    case "fault":
      return `연결 결함 — ${FAULT_LABELS[connection.fault.kind]}`;
    case "stopped":
      return "서버가 종료를 고지했다 — 다시 연결하지 않는다";
    case "off_stream_frame":
      return `계약 밖 프레임이 스트림으로 왔다 — ${connection.frameType}`;
    default: {
      /** @type {never} */
      const unreachable = connection;
      throw new Error(`소진되지 않은 서술 판별자: ${JSON.stringify(unreachable)}`);
    }
  }
}

/**
 * 마지막 요청 왕복이 무엇이 됐는가. 결정 6 — 버리면 *"그것이 정확히 §2.6의 침묵 실패다."*
 *
 * 빈 문자열은 «아직 왕복이 없다» 하나뿐이고, 그 밖의 모든 갈래가 자국을 남긴다.
 *
 * **`RequestOutcome`에 대한 소진 검사가 이 `switch`다.**
 *
 * @param {RequestOutcome} request
 * @returns {string}
 */
function requestText(request) {
  switch (request.kind) {
    case "none":
      return "";
    case "accepted":
      return "요청이 접수됐다";
    case "failed":
      return `요청 실패 — ${request.code}: ${request.message}`;
    case "rejected":
      return `요청을 보내지 못했다 — ${request.reason}`;
    case "unreadable":
      return `응답을 읽지 못했다 — ${FAULT_LABELS[request.fault.kind]}`;
    case "off_contract":
      return `계약 밖 응답 — ${OFF_CONTRACT_LABELS[request.reason]}`;
    default: {
      /** @type {never} */
      const unreachable = request;
      throw new Error(`소진되지 않은 왕복 판별자: ${JSON.stringify(unreachable)}`);
    }
  }
}

/* -------------------------------------------------------------------------- *
 * 화면 상태 → 자리별 값
 * -------------------------------------------------------------------------- */

/**
 * 화면 상태에서 자리별로 그릴 값을 낸다. **같은 상태는 같은 값이다** — 이 함수가 순수한 것이
 * 「화면은 상태의 함수다」의 절반이고, 나머지 절반인 전량 재구성은 `./render.js`가 진다
 * (결정 8).
 *
 * **`connection-status`가 둘을 함께 나른다**(결정 6). 연결의 처분과 요청의 결과를 한 자리가
 * 지는 것이 이 절이 *"가장 큰 빚"*으로 이름 붙인 것이고, 여기서는 **덮어쓰지 않고 이어
 * 붙인다** — 그래야 두 서술이 서로를 지우는 관측(그 항이 든 트리거)이 실제로 났을 때 그것이
 * 자리의 부족으로 보이지 그리기의 결함으로 보이지 않는다.
 *
 * @param {ScreenState} state
 * @returns {AnchorValues}
 */
export function viewOf(state) {
  const parts = [connectionText(state.connection), requestText(state.request)];
  return {
    transcript: state.transcript.map(transcriptItem),
    approval: state.approvals.map((approval) => ({
      id: approval.id,
      display: approval.display,
      answers: APPROVAL_ANSWERS.map((answer) => ({ answer, label: ANSWER_LABELS[answer] })),
    })),
    "connection-status": { text: parts.filter((part) => part.length > 0).join(" · ") },
    // 결정 2 — 이 자리에 문면이 없다. 배선이 쓰는 것은 잠금뿐이고, 잠금의 원천은 결정 5의
    // 제출 왕복이다.
    "composer-submit": { disabled: state.submit.phase === "in_flight" },
  };
}
