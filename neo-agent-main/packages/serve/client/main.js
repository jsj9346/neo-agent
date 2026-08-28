/**
 * 화면이 여는 **스크립트 진입점** — 정본은 `docs/WEB-UI.md` §9.5 결정 4이고, 이 파일이 실제로
 * 하는 일의 정본은 같은 문서 §9.6 결정 10·11·12다.
 *
 * §9.5 결정 4가 한 문장에 둘을 든다:
 * *"화면이 여는 참조는 반입 시점에 매니페스트가 든 키뿐이고, 스크립트 진입점은 정확히 하나다."*
 * 앞엣것의 **선행 조건**이 이 파일이다 — 같은 항이
 * *"키가 먼저 서 있어야 프롬프트가 그것을 인자로 들 수 있고"*로 순서를 적었고, 이 파일과
 * `src/assets.ts`의 `/client/main.js` 엔트리가 그 키를 세운다.
 *
 * **파일 이름은 계약이 아니다.** 결정 4가 *"그 키의 실제 값은 세부이고 §12가 든다"*로 닫았고,
 * `main.js`는 2026-08-27에 고른 값이다. 바꾸려면 이 파일과 매니페스트 엔트리, 그리고 킷
 * 프롬프트가 인자로 받는 참조 키를 함께 고친다 — 계약인 것은 그 셋이 같은 값을 든다는 것이다.
 *
 * ## 이 모듈이 지는 것은 하나다
 *
 * 화면이 여는 `<script type="module">`이 이 키 **하나**다. 근거는 층이다 — 진입점이 둘이면
 * 로드 순서가 화면의 성질이 되고, 결정 4가 그 대가를 적었다:
 * *"§9.3이 배선에 준 소유가 그만큼 화면으로 샌다."*
 *
 * **[정정 — 2026-08-27] 이 자리는 「나머지 `/client/*.js`는 이 모듈의 임포트 그래프로 딸려
 * 온다」라 적고 있었고 그것이 오늘 거짓이다.** 이 파일의 실행 코드는 말미의 `export {}`
 * 하나라 임포트 그래프가 비어 있고, 형제 넷 중 어느 것도 여기서 안 열린다. 딸려 옴은 배선이
 * 붙는 날 생기는 성질이지 오늘의 사실이 아니다.
 *
 * **[정정 — 2026-08-28] 그 「배선이 붙는 날」이 왔다.** §9.6 결정 12가
 * *"`main.js`의 임포트 그래프가 이 사이클에 처음으로 찬다."*로 이 사이클을 지목했고, 아래
 * 임포트 넷이 형제 일곱을 전부 연다(직접 넷 — `render`·`state`·`stream`·`view`, 그 넷이 다시
 * `protocol`·`wiring`·`anchors`). 즉 2026-08-27 정정이 「오늘의 사실이 아니다」로 적은 딸려
 * 옴이 오늘의 사실이 됐다. **그렇다고 그 딸려 옴이 계약이 된 것은 아니다** — 아래 `[미규정]`
 * 절이 그 자리를 그대로 든다.
 *
 * ## 이 모듈이 하는 것은 셋이고, 판정은 0이다
 *
 * 결정 12 — *"부트가 하는 것은 셋뿐이다 — 원천 주입 · 스트림 개설 · 리스너 등록. 판정은
 * 0이다"*. 그 셋에 딸린 넷째가 **응답 급수**다: 요청의 응답 본문을 접기 층에 넘기는 일이고,
 * 값을 보고 갈래를 고르지 않으므로 판정이 아니다(파싱과 성공·실패 판정은 전부 `./state.js`가
 * `readFrame`으로 진다).
 *
 * **주입이 셋이다**(결정 10): 앵커 원천(`document`) · 요소 생성 수단 · 요청 id 발급.
 * *"요청 id를 순수 층이 짓지 않는다."* — 발급은 부작용이라 순수 층에 넣으면 그 축이
 * *"«같은 입력에 같은 출력»을 잃는다."*
 *
 * **DOM 전역을 읽는 자리가 이 파일 하나다**(결정 10). 형제 여섯 중 어느 것도 `document`를
 * 안 읽고, 그리기 층조차 요소를 인자로 받는다 — *"경계가 한 자리로 닫혀야 「무엇이 안
 * 재지는가」가 파일 하나로 말해진다."*
 *
 * **전송 전역은 이 파일로 안 끌어올린다**(같은 항). `EventSource`·`fetch`·`location`은
 * `./stream.js`가 이미 지고 있고, 옮기는 것은 §9.3이 그은 선을 다시 그리는 일이다.
 *
 * **[정정 — 2026-08-28] 이 절은 「오늘 이 모듈은 부작용도 임포트도 안 낸다」라는 제목으로
 * 서 있었고, 그 아래 문단이 형제를 임포트하지 않는 갈래를 「의도적으로 안 골랐다」로 적었다.**
 * 그 근거는 *"오늘 부를 것이 없는 모듈을 임포트하는 것은 도달 가능성을 실제로 만드는 것이
 * 아니라 **지어내는** 것"*이었고, 이 사이클이 그 전제를 없앴다 — 부를 것이 생겼다.
 * 함께 서 있던 **[정정 — 2026-08-27]** 은 그 절의 근거가 한때 「채울 화면이 아직 없다」였음을
 * 적은 것이고, 그 화면은 2026-08-27 반입으로 이미 실재한다.
 *
 * ## 이 파일이 매니페스트에 등재된 근거
 *
 * §9.2의 자산 정의는 *"자산은 브라우저가 URL로 받아 가는 종류의 파일"*이고, 같은 항이
 * **판별을 종류로 못박는다**(2026-08-27 명시) — *"오늘 화면이 그 파일을 실제로 여는가는
 * 정의에 들지 않는다"*. 그래서 등재는 형제들에 대해서도 내다봄이 아니라 정의 위에 서고,
 * 이 파일은 화면 원문이 실제로 여는 유일한 `<script>`라 실물이 한 겹 더 있다.
 *
 * **[정정 — 2026-08-27] 이 문단은 「그 화면이 오늘 0장이라 등재는 형제 넷과 같이 내다봄
 * 위에 선다」라 적고 있었다.** 화면 0장이 낡은 것이 절반이고, 나머지 절반은 그 내다봄 서술
 * 자체가 §9.2의 종류 명시로 근거를 잃은 것이다 — 그 명시가 선 근거로 정본이 이름 붙인 오독
 * 셋 중 하나가 이 문단이다.
 *
 * ## [미규정] 이 그래프가 형제 전부를 덮는지 재는 기계가 없다
 *
 * 위 명시가 닫은 것은 「등재가 자산 정의를 만족하는가」이고, **임포트 의무는 안 닫혔다.**
 * 정본은 진입점이 **하나**라는 것만 정하고, 그 하나가 매니페스트의 `authored` 집합을 전부
 * 끌어오는가는 안 든다(2026-08-27 판정 — 미규정 유지). 오늘 그것을 재는 검사도 없어, 배선이
 * 붙는 날 임포트를 빠뜨리면 **조용하다** — §9.1의 집합 동일성은 파일의 실재와 등재만 보고
 * 도달 가능성은 안 본다(`ARCHITECTURE.md` §2.6). 오늘 그 공백이 위험하지 않은 이유는 덮을
 * 그래프 자체가 없다는 것뿐이고, 그것은 배선이 붙는 순간 사라지는 근거다. **뒤집을 자리는
 * 이 파일이 아니라 §9.5 결정 4다** — 그 항이 도달 가능성을 계약으로 올리면 그때 서는 것은
 * 관행이 아니라 검사다.
 *
 * **[정정 — 2026-08-28] 그 트리거가 발동했다.** §9.6 결정 12가 같은 자리를 지목하며
 * *"**그날 위험이 하나 열린다.**"* 그리고 *"**오늘까지 그것이 위험하지 않았던 유일한 근거가
 * «덮을 그래프 자체가 없다»였다.**"*로 적었고, *"이 사이클이 그 근거를 없앤다."* 같은 항이
 * **미규정을 뒤집지는 않았다** — *"이 절이 그것을 뒤집지 않는다 — 트리거가 발동했다는 사실만
 * 적는다."* 그래서 위 문단은 그대로 서 있고, 여기 적히는 것은 그 사실 하나다. 오늘 이
 * 그래프는 형제 일곱을 전부 덮지만, **그것은 관행이지 검사가 아니다.**
 */

import { attachApprovalAnswers, attachPromptSubmit, paint } from "./render.js";
import { approvalRequest, foldSignal, INITIAL_SCREEN_STATE, promptRequest } from "./state.js";
import { openStream, sendRequest } from "./stream.js";
import { openWiredAnchors, viewOf } from "./view.js";

/** @typedef {import("../src/protocol.ts").RequestFrame} RequestFrame */
/** @typedef {import("./state.js").ScreenState} ScreenState */
/** @typedef {import("./state.js").WiringSignal} WiringSignal */

/**
 * 주입 ① — 앵커 원천. **배선 집합 상수를 순회해서 한 번에 연다**(결정 11). 이 파일에 앵커
 * 이름이 리터럴로 없는 것이 그 순회의 실물이고, 못 찾으면 통로가 던지며 **여기서 안 잡는다**
 * (§9.4 결정 13 · §9.6 결정 11 — *"그 던짐을 잡지 않는다."*).
 */
const anchors = openWiredAnchors(document);

/**
 * 주입 ② — 요소 생성 수단. 그리기 층이 전역을 안 읽는 근거다(결정 10).
 *
 * @type {import("./render.js").CreateElement}
 */
const create = (tag) => document.createElement(tag);

/**
 * 주입 ③ — 요청 id 발급. **수단은 세부다**(결정 10 · §12). 단조 카운터인 것은 한 문서 안에서
 * 유일하면 충분하기 때문이고, 요청의 짝을 맞추는 것은 서버가 §6대로 같은 `id`를 돌려주는
 * 것뿐이다.
 */
let issued = 0;
const nextRequestId = () => {
  issued += 1;
  return `c${issued}`;
};

/** @type {ScreenState} */
let state = INITIAL_SCREEN_STATE;

/**
 * 신호 하나를 접고 그린다. **접기 → 뷰 → 그리기가 이 한 줄에 있다**(결정 1) — 그리는 자리가
 * 하나인 것이 「화면은 상태의 함수다」의 실물이고, 콜백마다 그리면 그 자리가 다섯이 된다
 * (결정 3이 기각한 갈래).
 *
 * @param {WiringSignal} signal
 * @returns {void}
 */
const push = (signal) => {
  state = foldSignal(state, signal);
  paint(anchors, viewOf(state), create);
};

/**
 * 요청 하나를 보내고 그 **결과를 급수한다** (결정 6 — *"요청의 응답을 버리지 않는다"*).
 *
 * 본문 텍스트를 읽어 그대로 접기 층에 넘기고, 전송이 거부하면 그 사실을 넘긴다. **여기서
 * 갈래를 고르지 않는다** — 성공인가 실패인가는 접기가 `readFrame`으로 판정한다(결정 12의
 * *"판정은 0이다"*).
 *
 * @param {string} requestId
 * @param {RequestFrame} frame
 * @returns {void}
 */
const deliver = (requestId, frame) => {
  void sendRequest(frame)
    .then((response) => response.text())
    .then(
      (body) => {
        push({ kind: "response_body", requestId, body });
      },
      (reason) => {
        push({ kind: "request_rejected", requestId, reason: String(reason) });
      },
    );
};

// 리스너 등록 — 제스처는 신호가 되고, 같은 자리에서 요청이 나간다. 제스처가 트랜스크립트에
// 아무것도 안 더하는 것이 결정 5의 낙관적 그리기 부재다.
attachPromptSubmit(anchors, (text) => {
  const requestId = nextRequestId();
  push({ kind: "prompt_submitted", requestId });
  deliver(requestId, promptRequest(requestId, text));
});

attachApprovalAnswers(anchors, (approvalId, answer) => {
  const requestId = nextRequestId();
  push({ kind: "approval_answered", requestId, approvalId, answer });
  deliver(requestId, approvalRequest(requestId, approvalId, answer));
});

// 첫 그리기. 스트림을 열기 전에 «연결 중»이 서야 첫 프레임까지의 창이 빈 화면이 아니다
// (`ARCHITECTURE.md` §2.6).
paint(anchors, viewOf(state), create);

// 스트림 개설 — 콜백 다섯이 그대로 알파벳의 다섯 갈래가 된다(결정 3). `onGap`이 나르는
// `StreamState`를 안 쓰는 것은 그 값을 갈라 읽는 것이 부트의 판정이 되기 때문이다.
openStream({
  onEvent: (event) => {
    push({ kind: "event", event });
  },
  onEffect: (effect) => {
    push({ kind: "effect", effect });
  },
  onFault: (fault) => {
    push({ kind: "fault", fault });
  },
  onGap: () => {
    push({ kind: "gap" });
  },
  onOffStreamFrame: (frameType) => {
    push({ kind: "off_stream_frame", frameType });
  },
});
