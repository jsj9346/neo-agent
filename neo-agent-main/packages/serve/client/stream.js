/**
 * 브라우저가 직접 로드하는 프로토콜 모듈 — 전송에 닿는 부분. 정본은 `docs/WEB-UI.md`
 * §9.3·§2.1·§8이다.
 *
 * **전송을 여는 자리는 이 파일 하나다.** 형제인 `./protocol.js`는 전송의 이름을 낱말로도 안
 * 들고, 화면 자산(§9)은 이 모듈을 부르기만 한다 — §9.3이 *"화면이 지는 것은 배선 하나다"*로
 * 그은 선이 그 배치다.
 *
 * **판정은 여기서 안 한다.** 갭인가·다시 붙어도 되는가·모르는 판별자인가는 전부 `./protocol.js`의
 * 순수 함수가 답하고 이 파일은 그 답에 따라 소켓을 열고 닫을 뿐이다. 그래야 계약 셋이
 * 유닛 테스트로 재진다(§9.3 — 검사의 자리는 `packages/serve/test/`다).
 *
 * **막지 못하는 것을 적는다**(§9.3). 화면이 이 모듈을 안 쓰고 스스로 스트림을 여는 것을 이
 * 배치가 막지는 못한다. 그 자리를 재는 기계를 두지 않기로 한 것이 §9.3의 판정이고 근거는
 * §2.3이다 — 텍스트 스캔은 변수 경유·주석 우회를 그대로 물려받는다.
 */

import {
  INITIAL_STREAM_STATE,
  readFrame,
  reconnectAllowed,
  stateEffect,
  step,
} from "./protocol.js";

/**
 * 스트림을 여는 라우트. `src/server.ts`의 같은 이름과 **같은 값이어야 하고**, 그 대조는
 * `test/server.contract.test.ts`가 잰다 — 브라우저가 빌드 없이 직접 로드하므로(§9 ·
 * `TECH-STACK.md` §2) 이쪽이 `.ts`의 상수를 런타임에 들여올 수단이 없고, 그래서 사본과
 * 대조 검사가 짝이다.
 */
const STREAM_PATH = "/stream";

/**
 * 프로토콜 버전. *"버전은 사람이 올린다"*(§6)이므로 손으로 적은 리터럴이고, 서버 쪽 값과
 * 갈리면 스트림이 열리기도 전에 HTTP 400이 난다(§2.1). 위와 같은 검사가 그 갈림을 잡는다.
 */
const PROTOCOL_VERSION = "1";

/**
 * 버전을 싣는 쿼리의 접두. **자리가 쿼리 문자열인 것이 계약이다**(§6 말미) — 헤더는
 * `EventSource`에 자리가 없고 경로 마디는 §9.1이 닫은 라우트 집합을 다시 연다. 이름은 세부다.
 */
const VERSION_QUERY = "?v=";

/**
 * 메서드 POST가 가는 라우트. `src/server.ts`의 같은 이름과 같은 값이어야 하고, 위 둘과 같은
 * 검사가 그것을 잰다. 정본에는 아직 이 라우트의 자리가 없다(`src/server.ts`의 `[미규정]`).
 */
const METHOD_PATH = "/rpc";

/**
 * 스트림을 여는 URL. **화면이 이 문자열을 짓지 않는다.**
 *
 * §9.3이 프로토콜 행동을 이 레포 소유로 두었고 **버전 핸드셰이크는 프로토콜 행동이다** —
 * 이 셋을 화면이 조립하면 그 조립이 생성 도구의 산물이 되고, §9.3 근거 2가 이름 붙인
 * *"다시 뽑을 때마다 재구현이 되풀이된다"*가 바로 이 자리에 걸린다. 갈리면 결과는 HTTP
 * 400이고 화면에는 «그냥 안 뜬다»로만 보인다.
 *
 * @param {string} origin 서버의 출처. 생략하면 이 모듈을 실어 준 문서의 출처다
 * @returns {string}
 */
export function streamUrl(origin = location.origin) {
  return `${origin}${STREAM_PATH}${VERSION_QUERY}${encodeURIComponent(PROTOCOL_VERSION)}`;
}

/** @typedef {import("./protocol.js").StateEffect} StateEffect */
/** @typedef {import("./protocol.js").StreamFault} StreamFault */
/** @typedef {import("./protocol.js").StreamState} StreamState */
/** @typedef {import("../src/protocol.ts").ServerEventFrame["event"]} AgentEvent */
/** @typedef {import("../src/protocol.ts").RequestFrame} RequestFrame */

/**
 * 화면이 다는 배선. 전부 필수다 — 옵셔널로 두면 «리스너를 안 달아 조용히 버려진» 경로가
 * 생기고, 그것이 §6.1이 갈래 B를 기각한 근거 2였다.
 *
 * @typedef {{
 *   readonly onEvent: (event: AgentEvent) => void,
 *   readonly onEffect: (effect: StateEffect) => void,
 *   readonly onFault: (fault: StreamFault) => void,
 *   readonly onGap: (state: StreamState) => void,
 *   readonly onOffStreamFrame: (frameType: "req" | "res") => void,
 * }} StreamHandlers
 */

/**
 * 스트림을 연다. 반환값은 사용자가 화면을 떠날 때 부르는 닫개 하나다.
 *
 * 재접속의 갈래는 둘뿐이다. **갭이면 다시 연다** — §8이 *"갭의 처리는 재접속이다."*로 정했고
 * 새 연결의 핸드셰이크가 스냅샷을 다시 싣는다. **고지를 받으면 멈춘다** — §6.1. 전송은 서버가
 * 연결을 닫으면 스스로 다시 붙으므로, 멈추려면 이쪽에서 명시적으로 닫아야 한다.
 *
 * **URL을 인자로 받지 않는다**(2026-08-26). 라우트와 버전 파라미터를 짓는 것은 위
 * `streamUrl`이고 화면이 지는 것은 출처 하나다 — §9.3이 *"화면이 지는 것은 배선 하나다"*로
 * 그은 선이 그 배치다.
 *
 * @param {StreamHandlers} handlers
 * @param {string} [origin] 서버의 출처. 생략하면 문서의 출처다
 * @returns {{ close: () => void }}
 */
export function openStream(handlers, origin) {
  const url = origin === undefined ? streamUrl() : streamUrl(origin);
  /** @type {StreamState} */
  let state = INITIAL_STREAM_STATE;
  /** @type {EventSource | null} */
  let source = null;
  let done = false;

  const shut = () => {
    if (source !== null) source.close();
    source = null;
  };

  const open = () => {
    if (done) return;
    // **전송을 개설하는 유일한 자리.** 연결마다 `seq`가 1부터 다시 시작하므로(§6) 상태도
    // 초기값에서 다시 시작한다. `Last-Event-ID`를 실어 재생을 요구하지 않는다 — §8이
    // *"`Last-Event-ID` 요청 헤더를 읽지 않는다"*로 정했고, 안 쓰는 것이 곧 그 계약이다.
    state = INITIAL_STREAM_STATE;
    const opened = new EventSource(url);
    source = opened;
    opened.onmessage = (message) => {
      receive(String(message.data));
    };
    // 전송이 스스로 다시 붙는 것은 여기서 막지 않는다 — 이 상태에서는 그것이 §8의 재접속과
    // 같은 일이다. 멈추는 것은 아래 `ended` 갈래 하나뿐이다.
    opened.onerror = () => {
      if (!reconnectAllowed(state)) {
        done = true;
        shut();
      }
    };
  };

  /** @param {string} text */
  const receive = (text) => {
    const read = readFrame(text);
    state = step(state, read);

    if (read.ok) {
      const frame = read.frame;
      if (frame.type === "event") handlers.onEvent(frame.event);
      else if (frame.type === "state") handlers.onEffect(stateEffect(frame));
      // 요청과 그 응답은 스트림이 아니라 POST가 나른다(§2.1). 여기로 온 것은 계약 밖이므로
      // 조용히 버리지 않고 올린다(§9.3 · `ARCHITECTURE.md` §2.6).
      else handlers.onOffStreamFrame(frame.type);
    }

    switch (state.phase) {
      case "live":
        return;
      case "gap":
        handlers.onGap(state);
        shut();
        open();
        return;
      case "ended":
        done = true;
        shut();
        return;
      case "broken":
        handlers.onFault(state.fault);
        done = true;
        shut();
        return;
      default: {
        /** @type {never} */
        const unreachable = state;
        throw new Error(`소진되지 않은 스트림 상태: ${JSON.stringify(unreachable)}`);
      }
    }
  };

  open();

  return {
    close: () => {
      done = true;
      shut();
    },
  };
}

/**
 * 사용자 개입 하나를 서버로 보낸다. 응답은 스트림이 아니라 이 왕복이 나른다(§2.1).
 *
 * 본문을 여기서 만들지 않는다 — 보내는 프레임은 부르는 쪽이 `RequestFrame`으로 짓고, 이
 * 함수는 그것을 실어 나르기만 한다.
 *
 * **라우트도 화면이 짓지 않는다.** 위 `streamUrl`이 든 근거가 그대로 걸린다 — 두 라우트 중
 * 하나만 이쪽이 들면 나머지 하나가 여전히 화면의 재구현이고, 그 재구현이 갈리면 결과는 404다.
 *
 * @param {RequestFrame} frame
 * @param {string} [origin] 서버의 출처. 생략하면 문서의 출처다
 * @returns {Promise<Response>}
 */
export function sendRequest(frame, origin) {
  const url = `${origin ?? location.origin}${METHOD_PATH}`;
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(frame),
  });
}
