/**
 * 브라우저가 직접 로드하는 프로토콜 모듈 — 전송에 닿는 부분. 정본은 `docs/WEB-UI.md`
 * §9.3·§2.1·§8이다.
 *
 * **전송을 여는 자리는 이 파일 하나다.** 형제인 `./protocol.js`는 전송의 이름을 낱말로도 안
 * 들고, 화면 자산(§9)은 이 모듈을 부르기만 한다 — §9.3이 *"화면이 지는 것은 배선 하나다"*로
 * 그은 선이 그 배치다.
 *
 * **판정은 여기서 안 한다.** 갭인가·연결을 어떻게 할 것인가·모르는 판별자인가는 전부
 * `./protocol.js`의 순수 함수가 답하고 이 파일은 그 답에 따라 소켓을 열고 닫을 뿐이다. 그래야
 * 계약이 유닛 테스트로 재진다(§9.3 — 검사의 자리는 `packages/serve/test/`다).
 *
 * **이 파일이 얇은 것이 §8.1의 처분이다.** 그 절이 검사의 모집단을 넓히는 대신
 * *"배선을 넓히지 않고 배선을 얇게 만든다"*를 골랐다 — 연결 개시·상실까지 상태기계의 입력이
 * 되므로, 오늘까지 이 파일에 남아 있던 판정이 순수 함수 쪽으로 넘어간다.
 *
 * **막지 못하는 것을 적는다**(§9.3 · §2.3). 둘이다.
 * 1. 화면이 이 모듈을 안 쓰고 스스로 스트림을 여는 것을 이 배치가 막지는 못한다. 그 자리를
 *    재는 기계를 두지 않기로 한 것이 §9.3의 판정이고 근거는 §2.3이다 — 텍스트 스캔은
 *    변수 경유·주석 우회를 그대로 물려받는다.
 * 2. §8.1 — *"남는 배선은 **전송의 이벤트를 위 신호로 옮기는 층** 하나이고, 그 층이 틀린
 *    신호를 짓는 것은 유닛 축이 못 잡는다."* 아래 `open`의 세 핸들러(개시·프레임·상실)와
 *    낡은 연결을 거르는 술어가 그 층이다. *"실제 브라우저를 붙이는 사이클이 그 자리의 첫
 *    검증이다."*
 */

import {
  applySignal,
  disposition,
  INITIAL_STREAM_STATE,
  readFrame,
  stateEffect,
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
/** @typedef {import("./protocol.js").StreamSignal} StreamSignal */
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
 * **처분은 셋이고 멈추는 사유는 둘이다**(§8.1의 표). 진행 중이면 그대로 두고, **갭이면 다시
 * 연다** — §8이 *"갭의 처리는 재접속이다."*로 정했고 새 연결의 핸드셰이크가 스냅샷을 다시
 * 싣는다. **멈추는 것은 종료 고지**(§6.1 — *"`shutdown`을 받은 클라이언트는 재접속하지
 * 않는다."*)**와 계약 결함 둘**이다(§8.1 — *"계약이 깨진 스트림은 재접속으로 안 낫는다."*).
 * 전송은 서버가 연결을 닫으면 스스로 다시 붙으므로, 멈추려면 이쪽에서 명시적으로 닫아야 한다.
 *
 * **그 셋을 이 함수가 고르지 않는다.** `disposition`이 답하고 여기서는 적용만 한다 — §8.1이
 * *"배선은 이 셋을 적용만 하고 스스로 고르지 않는다"*로 처분의 정본을 한 자리로 못박았다.
 * 배선이 phase 이름으로 답을 다시 지으면 둘이 갈리고, 그 갈림이 검증 리포트 V-1의 부수
 * 발견이었다.
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
  /**
   * **되돌리는 자리가 여기가 아니다.** 초기화는 §8.1의 계약 ③대로 연결의 생멸 사건에
   * 걸리고(`applySignal`), 이 대입은 그 사건이 오기 전의 값을 정할 뿐이라 한 번만 난다.
   * 개설 함수 안에서 다시 대입하면 *"그 함수를 안 지나는 개설 경로"*(§8.1)에서 조용히 갈리고,
   * 그것이 V-1이다. 널 표현을 두지 않는 이유는 판별자로 닫은 `StreamState`를 되돌리는 일이
   * 되기 때문이다.
   *
   * @type {StreamState}
   */
  let state = INITIAL_STREAM_STATE;
  /** @type {EventSource | null} */
  let source = null;
  let done = false;

  const shut = () => {
    if (source !== null) source.close();
    source = null;
  };

  /**
   * 신호 하나를 접고, 그 결과에 따라 화면에 알리고 연결을 처분한다.
   *
   * **phase가 바뀐 신호에서만 움직인다.** `disposition`은 **상태의 함수**인데 다시 열기·멈추기·
   * 화면 통지는 **1회성 동작**이다. 갭이 이제 지속하는 상태이므로(개설 함수의 즉시 초기화가
   * 걷혔다) 전이 없이 적용하면 같은 갭에 «다시 연다»가 되풀이된다 — §8.1이 갈래 B를 기각한
   * 근거 1(뜨거운 루프)이 채택 갈래 안에서 되살아나는 자리다.
   *
   * @param {StreamSignal} signal
   */
  const apply = (signal) => {
    const before = state.phase;
    state = applySignal(state, signal);
    if (state.phase === before) return;

    // **화면 통지는 phase가 정한다.** 처분(아래)과 달리 이쪽은 갈래마다 다른 동작이라 한
    // 자리로 모을 것이 없다. `transport_gave_up`도 여기로 나가므로 §12의 「낡은 자산 캐시
    // 안내 문면」 항이 화면에서 자국을 얻는다(§8.1 — *"다시 안 붙는 쪽은 결함이고 위 표의
    // «멈춘다»로 가므로 **가시적이다.**"*).
    switch (state.phase) {
      case "gap":
        handlers.onGap(state);
        break;
      case "broken":
        handlers.onFault(state.fault);
        break;
      default:
        break;
    }

    // **처분은 여기서 고르지 않는다** — 위 `disposition` 하나가 답하고 이 `switch`는 그 답을
    // 소진할 뿐이다. `ConnectionDisposition`에 갈래가 늘면 `default`의 `never` 대입이 붉어진다.
    const next = disposition(state);
    switch (next) {
      case "continue":
        return;
      case "reopen":
        shut();
        open();
        return;
      case "stop":
        done = true;
        shut();
        return;
      default: {
        /** @type {never} */
        const unreachable = next;
        throw new Error(`소진되지 않은 연결 처분: ${JSON.stringify(unreachable)}`);
      }
    }
  };

  const open = () => {
    if (done) return;
    // **전송을 개설하는 유일한 자리.** 다만 **연결이 서는 유일한 자리는 아니다** — §2.1의
    // 전송은 스스로도 다시 붙고, 그 경로가 이 함수를 안 지난다. 그래서 수열 상태를 여기서
    // 되돌리지 않는다(§8.1 — *"수열 상태의 초기화는 연결의 생멸 사건에 걸리고, 그 사건은
    // 누가 연결을 열고 닫았는지를 가르지 않는다."*). `Last-Event-ID`를 실어 재생을 요구하지
    // 않는 것은 그대로다 — §8이 *"`Last-Event-ID` 요청 헤더를 읽지 않는다"*로 정했고, 안
    // 쓰는 것이 곧 그 계약이다.
    const opened = new EventSource(url);
    source = opened;

    /**
     * 계약 ④ — *"상태에 접히는 신호는 그것을 낸 연결이 아직 현재 연결일 때의 것뿐이다."*
     * (§8.1). 갭의 «다시 연다»가 프레임을 처리하는 도중에 소켓을 갈아 끼우므로 닫힌 연결의
     * 통지가 뒤늦게 도착하는 창이 열리고, 그 통지 하나가 갓 선 연결의 상태를 밀면 결과가
     * V-1과 같다. **수단은 세부다** — 여기서는 인스턴스 동일성으로 잰다.
     */
    const current = () => source === opened;

    opened.onopen = () => {
      if (current()) apply({ kind: "opened" });
    };
    opened.onmessage = (message) => {
      if (current()) receive(String(message.data));
    };
    opened.onerror = () => {
      if (!current()) return;
      // **[추정] 이 한 줄이 «전송이 포기했는가»의 판정 전부다.** §8.1은 *"클라이언트가 받는
      // 연결 상실 신호는 «다시 붙을 것인가»를 함께 든다"*까지만 정하고, 그 값을 전송의
      // 어느 상수에서 읽을지는 정하지 않는다. 판정이 «포기했는가»이므로 종단값을 재고,
      // 재시도가 남은 두 값(`CONNECTING`·`OPEN`)은 «다시 붙는다»로 읽는다. 실브라우저를
      // 붙이는 사이클(M2 C2)이 이 줄의 첫 검증이다.
      const gaveUp = opened.readyState === EventSource.CLOSED;
      apply({ kind: "dropped", retrying: !gaveUp });
    };
  };

  /** @param {string} text */
  const receive = (text) => {
    const read = readFrame(text);

    if (read.ok) {
      const frame = read.frame;
      if (frame.type === "event") handlers.onEvent(frame.event);
      else if (frame.type === "state") handlers.onEffect(stateEffect(frame));
      // 요청과 그 응답은 스트림이 아니라 POST가 나른다(§2.1). 여기로 온 것은 계약 밖이므로
      // 조용히 버리지 않고 올린다(§9.3 · `ARCHITECTURE.md` §2.6).
      else handlers.onOffStreamFrame(frame.type);
    }

    // 읽은 결과를 그대로 신호에 싣는다 — 같은 줄을 두 번 파싱하지 않기 위해 순수 층이
    // 와이어 줄이 아니라 `FrameResult`를 받는다(§8.1).
    apply({ kind: "frame", read });
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
