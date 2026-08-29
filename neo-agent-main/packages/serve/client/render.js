/**
 * 배선의 **그리기 층** — 정본은 `docs/WEB-UI.md` §9.6이다.
 *
 * 결정 1의 층 셋째이자 *"DOM을 아는 것은 마지막 하나뿐이다"*의 그 하나다. 형제
 * `./state.js`(접기)와 `./view.js`(뷰)는 순수하고, 이 파일만 요소를 만진다 —
 * *"순수 층과 그리기 층이 같은 파일에 살지 않는다."* 섞이면
 * *"「이번 사이클에 안 재지는 것이 무엇인가」를 말할 모집단이 없어지고, node의 계약 테스트가
 * 그리기 층을 함께 임포트하게 된다."*
 *
 * ## 판정을 안 한다 (결정 1)
 *
 * *"그리기 층은 판정을 안 한다. 분기가 필요하면 그 분기는 ①이나 ②로 간다."* 그래서 이 파일에
 * 오는 값은 이미 완성된 문자열과 불리언이고, 여기서 상태를 보고 갈래를 고르는 자리가 없다.
 *
 * **그럼에도 분기가 셋 있고 전부 결정 7이 요구한 위임의 기계다.** 그 항이
 * *"항목의 컨트롤은 위임 리스너 하나가 받는다"*로 컨테이너 한 자리에 리스너를 두게 했으므로,
 * 온 클릭이 **자기 컨트롤의 것인가**를 가르는 자리가 반드시 생긴다 — 그것은 화면 상태를 보고
 * 무엇을 그릴지 고르는 판정이 아니라 이벤트의 출처를 가리는 라우팅이다. 답의 유효성 판정
 * 자체는 순수 층이 진다(`./view.js`의 `approvalAnswerOf`).
 *
 * ## DOM 전역은 여기서도 안 읽는다 (결정 10)
 *
 * *"DOM 전역에 닿는 자리는 부트 하나이고, 나머지는 인자로 받는다"* 그리고 *"앵커 원천·요소
 * 생성·요청 id 발급이 전부 주입이다."* 그래서 이 파일에는 `document`도 `window`도 없다 —
 * 요소는 인자로 오고, 새 노드를 만드는 수단도 인자로 온다.
 *
 * **[정정 — 2026-08-29] 위 인용이 «읽는»이었고 그것이 개정으로 낡았다.** 그 항이 읽기만
 * 들고 있던 것을 DOM 전역에 닿는 것 전부로 넓혔는데(`K-376`), **이 파일이 지는 것은 안
 * 바뀐다** — 넓어진 것은 부트의 경계이고 그리기 층이 쓰는 자리는 그대로 앵커다. 같은 항이
 * 그 오독을 명시로 막는다: *"넓어지는 것은 부트의 경계이지 그리기 층의 모집단이 아니다."*
 * 고친 것은 인용의 문자열 하나이고, 이 절의 제목이 여전히 «읽는»인 것은 이 파일에 대해
 * 참인 서술이 그것이기 때문이다(닿는 것 자체가 0건이다).
 *
 * ## 전량 재구성이다 (결정 8)
 *
 * *"쓰는 자리의 내용은 매번 통째로 다시 짓는다."* 부분 갱신은
 * *"「화면은 상태의 함수다」를 깨고 낡은 노드가 남는 경로를 열며, 그 실패는 화면에만
 * 나타나므로 서버가 원리적으로 못 잰다."* **대가는 정본이 적었다** — 그리기마다 텍스트 선택과
 * 스크롤 위치가 사라지고, 그 소실이 실제로 쓰기를 방해할 때가 트리거다.
 *
 * ## 마크업을 짓지 않는다 (결정 9)
 *
 * *"배선이 마크업을 짓지 않는다."* 노드는 만들되 문자열을 HTML로 해석시키지 않는다 — 서버가
 * 나르는 문면(승인의 `display`, 메시지의 텍스트)이 마크업으로 읽히는 경로를 아예 없앤다.
 * 이 파일에 `innerHTML` 부류가 0건인 것이 그 계약의 실물이고, **CSP는 이 자리를 반쯤만
 * 막는다**(같은 항) — 그래서 배치로 막는다.
 *
 * ## 이 파일이 재지 못하는 것
 *
 * **아무도 이 층을 이번 사이클에 실행으로 재지 않는다.** §9.6이 그 사실을 스스로 들었다 —
 * *"그리기 층을 이번 사이클에서 아무도 재지 않는다."* 가짜 DOM을 들이는 갈래는 그 절이
 * 기각했고(*"손으로 만든 가짜를 상대로 재면 재는 것이 그 가짜다"*), 첫 측정은 실브라우저를
 * 붙이는 다음 사이클이다. 그래서 이 파일은 **면적을 줄이는 것**으로만 방어한다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로 있는
 * 부분 문자열이고, 문서를 지목하는 자리는 절 번호와 결정 번호로 한다.
 */

import { approvalAnswerOf } from "./view.js";

/** @typedef {import("./view.js").AnchorValues} AnchorValues */
/** @typedef {import("./view.js").WiredAnchor} WiredAnchor */
/** @typedef {import("../src/approvals.ts").ApprovalAnswer} ApprovalAnswer */

/**
 * 부트가 연 앵커 요소들. **키가 `WiredAnchor`로 강제되는 표다** — 배선 집합이 자라면 이
 * 타입이 함께 자라고, 그리기가 안 받은 자리를 쓰는 코드는 컴파일에서 붉는다.
 *
 * @typedef {Readonly<Record<WiredAnchor, HTMLElement>>} AnchorElements
 */

/**
 * 새 노드를 만드는 수단. **주입이다**(결정 10) — 전역을 여기서 읽으면 이 모듈이 브라우저
 * 환경을 요구하고, 그 요구가 §9.6이 이 층에 대해 남긴 유일한 방어(면적 축소)를 무르게 한다.
 *
 * @typedef {(tag: string) => HTMLElement} CreateElement
 */

/**
 * 승인 항목이 자기 `id`를 나르는 자리. **표기가 데이터 속성인 것은 결정 7이 들었고**
 * (*"항목의 데이터 속성이다"*) **이름은 세부다**(같은 항 — *"표기의 실제 이름은 세부다"*).
 */
const APPROVAL_ID_ATTR = "data-approval-id";

/** 승인 항목의 컨트롤이 자기 답을 나르는 자리. 위와 같은 갈래다 */
const APPROVAL_ANSWER_ATTR = "data-approval-answer";

/** 위임 리스너가 자기 컨트롤을 알아보는 선택자. 위 상수에서 파생한다 — 사본을 두지 않는다 */
const APPROVAL_CONTROL_SELECTOR = `[${APPROVAL_ANSWER_ATTR}]`;

/** 트랜스크립트 항목이 자기 메시지 `id`를 나르는 자리(결정 4의 동일성). 이름은 세부다 */
const MESSAGE_ID_ATTR = "data-message-id";

/** 트랜스크립트 항목이 자기 역할을 나르는 자리. 화면이 그것으로 모양을 가를 수 있다 */
const MESSAGE_ROLE_ATTR = "data-message-role";

/**
 * 문면 한 줄을 노드 하나로 만든다. **`textContent`뿐이다**(결정 9) — 문자열이 마크업으로
 * 읽히는 경로가 이 함수에 없다.
 *
 * @param {CreateElement} create
 * @param {string} tag
 * @param {string} text
 * @returns {HTMLElement}
 */
function textNode(create, tag, text) {
  const node = create(tag);
  node.textContent = text;
  return node;
}

/**
 * 트랜스크립트 항목 하나를 짓는다.
 *
 * @param {CreateElement} create
 * @param {AnchorValues["transcript"][number]} item
 * @returns {HTMLElement}
 */
function transcriptNode(create, item) {
  const node = create("article");
  node.setAttribute(MESSAGE_ID_ATTR, item.id);
  node.setAttribute(MESSAGE_ROLE_ATTR, item.role);
  node.append(
    textNode(create, "h3", item.label),
    ...item.lines.map((line) => textNode(create, "p", line)),
  );
  return node;
}

/**
 * 승인 항목 하나를 짓는다. **답 셋이 전부 컨트롤이 된다**(결정 7 — 부분집합 금지) 그리고
 * 항목과 컨트롤이 자기 `id`·답을 데이터 속성으로 나른다.
 *
 * **리스너를 여기서 안 단다.** 결정 7 — *"리스너를 항목마다 달지 않는다."* 전량 재구성이
 * 매번 노드를 갈아 끼우므로 *"지워진 노드에 남은 리스너가 조용히 사는 경로가 열린다."*
 *
 * @param {CreateElement} create
 * @param {AnchorValues["approval"][number]} item
 * @returns {HTMLElement}
 */
function approvalNode(create, item) {
  const node = create("article");
  node.setAttribute(APPROVAL_ID_ATTR, item.id);

  const controls = create("div");
  controls.append(
    ...item.answers.map((choice) => {
      const button = textNode(create, "button", choice.label);
      // 기본값이 `submit`이라 폼 안에서 페이지를 다시 싣는다. 그 재적재는 스트림을 끊고
      // 화면 상태를 통째로 잃으므로 §2.6의 형태에 가깝다.
      button.setAttribute("type", "button");
      button.setAttribute(APPROVAL_ID_ATTR, item.id);
      button.setAttribute(APPROVAL_ANSWER_ATTR, choice.answer);
      return button;
    }),
  );

  node.append(textNode(create, "p", item.display), controls);
  return node;
}

/**
 * 자리별 값을 앵커에 쓴다. **쓰는 자리 셋은 전량 재구성이고**(결정 8) `composer-submit`은
 * 잠금 토글 하나다(결정 2 — *"이 사이클이 그 버튼에 쓰는 것은 잠금 상태뿐이고 내용이 아니다"*).
 *
 * **`composer-input`에 안 쓴다.** 결정 2가 그 자리를 *"**읽는 자리**"*로 분류했고, 위
 * `AnchorValues`에 그 키가 아예 없어 여기서 쓸 값 자체가 없다. **제출 뒤에도 비우지
 * 않는다** — 비움도 쓰기다.
 *
 * @param {AnchorElements} elements
 * @param {AnchorValues} values
 * @param {CreateElement} create
 * @returns {void}
 */
export function paint(elements, values, create) {
  elements.transcript.replaceChildren(
    ...values.transcript.map((item) => transcriptNode(create, item)),
  );
  elements.approval.replaceChildren(...values.approval.map((item) => approvalNode(create, item)));
  elements["connection-status"].textContent = values["connection-status"].text;
  // 분기 없이 잠금을 켜고 끈다. `if`로 갈라 두 문을 쓰면 그 갈림이 이 층의 판정처럼 보인다.
  elements["composer-submit"].toggleAttribute("disabled", values["composer-submit"].disabled);
}

/**
 * 제출을 서버로 보낼 자리를 연다. **읽는 자리에서 읽는 유일한 코드가 여기다.**
 *
 * **[미규정] 앵커의 요소 종류를 정본이 안 든다.** §9.4 결정 7·결정 8이 계약으로 든 것은
 * `id="<이름>"`의 실재뿐이고, `composer-input`이 어떤 요소인가는 화면(§9)의 몫이라 이 층이
 * 단정할 수 없다. 그래서 값 자리를 구조로만 읽고, 없으면 빈 문자열이 된다 — 빈 프롬프트는
 * 서버가 `invalid_params`로 거부하고 그 거부는 결정 6이 이미 가시적으로 만든다. 조용히
 * 사라지는 갈래가 아니다.
 *
 * @param {AnchorElements} elements
 * @param {(text: string) => void} onSubmit
 * @returns {void}
 */
export function attachPromptSubmit(elements, onSubmit) {
  const input = /** @type {{ readonly value?: string }} */ (
    /** @type {unknown} */ (elements["composer-input"])
  );
  elements["composer-submit"].addEventListener("click", () => {
    onSubmit(input.value ?? "");
  });
}

/**
 * 승인 컨트롤의 클릭을 **컨테이너 하나에서** 받는다 (결정 7).
 *
 * *"위임은 컨테이너가 앵커라는 사실에서 공짜로 나온다."* 그리고 이 배치는 §9.4 결정 13의
 * 통로 밖이 아니다 — 그 항이 닫은 것은 **앵커를 여는** 자리이고,
 * *"컨테이너 안에 자기가 만든 노드를 다루는 것은 앵커 조회가 아니다."*
 *
 * @param {AnchorElements} elements
 * @param {(approvalId: string, answer: ApprovalAnswer) => void} onAnswer
 * @returns {void}
 */
export function attachApprovalAnswers(elements, onAnswer) {
  elements.approval.addEventListener("click", (event) => {
    const target = /** @type {Element | null} */ (event.target);
    // 클릭이 컨트롤 밖(컨테이너 여백·문면)에서 났다. 위임이 반드시 낳는 갈래다.
    const control = target?.closest(APPROVAL_CONTROL_SELECTOR) ?? null;
    if (control === null) return;

    const approvalId = control.getAttribute(APPROVAL_ID_ATTR);
    const answer = approvalAnswerOf(control.getAttribute(APPROVAL_ANSWER_ATTR));
    // 속성이 짝을 잃은 노드는 우리가 만든 것이 아니다. 서버의 답 집합 밖도 마찬가지다 —
    // 판정 자체는 순수 층이 지고 여기서는 그 답을 쓴다.
    if (approvalId === null || answer === null) return;

    onAnswer(approvalId, answer);
  });
}
