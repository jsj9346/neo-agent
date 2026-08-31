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
 * **§8.1의 계약 여섯 중 이 파일이 지는 것은 ④와 ⑤의 배선 절반 둘이다**(2026-08-31 — ⑤ 신설).
 * ④는 낡은 연결의 통지를 거르는 술어(`open` 안의 `current`)이고, ⑤는 아래 `receive`의
 * **순서**다 — 순수 층이 답하고, 접수한 프레임만 화면에 급수하고, 전이의 종단은 그 뒤다.
 * **둘 다 «배선은 순수 층의 판정 뒤에만 움직인다» 하나이고, 판정을 여기서 다시 짓지 않는다.**
 * ⑥은 이 파일의 계약이 아니다 — *"화면 층이 던지면 배선은 그 자리에서 멈춘다"*의 포획은
 * 화면을 부르는 자리에 서고, 이 파일이 그 처분에 내주는 것은 반환값의 닫개 하나다(자국의
 * 자리는 §9.6 결정 13이 든다).
 *
 * **막지 못하는 것을 적는다**(§9.3 · §2.3). 둘이다.
 * 1. 화면이 이 모듈을 안 쓰고 스스로 스트림을 여는 것을 이 배치가 막지는 못한다. 그 자리를
 *    재는 기계를 두지 않기로 한 것이 §9.3의 판정이고 근거는 §2.3이다 — 텍스트 스캔은
 *    변수 경유·주석 우회를 그대로 물려받는다.
 * 2. §8.1 — *"①~③·⑤는 순수 함수의 성질이라 유닛 축이 잰다. ④·⑥은 배선의 것이라 못 잰다."*
 *    **이 파일이 지는 절반이 정확히 그 «못 재는» 쪽이다.** ④의 술어, ⑤의 **순서**(순수 층은
 *    자기가 언제 불렸는지를 모르므로 급수가 앞이어도 `frameVerdict`의 답은 같다), 그리고
 *    *"남는 배선은 **전송의 이벤트를 위 신호로 옮기는 층** 하나이고, 그 층이 틀린 신호를
 *    짓는 것은 유닛 축이 못 잡는다"* — 아래 `open`의 세 핸들러가 그 층이다. ⑤의 순서는
 *    소스 텍스트를 정적으로 훑는 축이 한 겹 덮을 수 있으나 그 축이 재는 것은 텍스트이고,
 *    나머지는 *"실제 브라우저를 붙이는 사이클이 그 자리의 첫 검증이다."*
 */

import {
  applySignal,
  disposition,
  frameVerdict,
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

/** @typedef {import("./protocol.js").ConnectionDisposition} ConnectionDisposition */
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
   * 전이 하나를 종단한다 — 화면에 알리고 연결을 처분한다. 신호 갈래 둘(`apply`)과 프레임
   * 갈래(`receive`)가 이 자리를 함께 쓴다.
   *
   * **여기서 판정하지 않는다.** 두 인자는 전부 부르는 쪽이 순수 층에서 받아 온 값이다 —
   * `before`는 접기 전의 phase이고 `next`는 접은 뒤 상태의 처분이다. 이 함수가 하는 것은
   * «전이가 났는가»의 비교와 그 답의 소진뿐이다.
   *
   * **phase가 바뀐 신호에서만 움직인다.** `disposition`은 **상태의 함수**인데 다시 열기·멈추기·
   * 화면 통지는 **1회성 동작**이다. 갭이 이제 지속하는 상태이므로(개설 함수의 즉시 초기화가
   * 걷혔다) 전이 없이 적용하면 같은 갭에 «다시 연다»가 되풀이된다 — §8.1이 갈래 B를 기각한
   * 근거 1(뜨거운 루프)이 채택 갈래 안에서 되살아나는 자리다. **계약 ⑤가 붙은 뒤에도 이
   * 게이트가 그대로인 것이 중요하다**: 갭인 채로 프레임이 계속 오면 `frameVerdict`는 매번
   * `reopen`을 답하지만 그 프레임들은 phase를 안 옮기므로 이 비교에서 걸러진다.
   *
   * @param {StreamState["phase"]} before 접기 전의 phase
   * @param {ConnectionDisposition} next 접은 뒤 상태의 처분 — 순수 층이 답한 값이다
   */
  const settle = (before, next) => {
    if (state.phase === before) return;

    // **화면 통지는 phase가 정한다.** 처분(아래)과 달리 이쪽은 갈래마다 다른 동작이라 한
    // 자리로 모을 것이 없다. `transport_gave_up`도 여기로 나가므로 §12의 「낡은 자산 캐시
    // 안내 문면」 항이 화면에서 자국을 얻는다(§8.1 — *"다시 안 붙는 쪽은 결함이고 위 표의
    // «멈춘다»로 가므로 **가시적이다.**"*).
    //
    // **이 둘은 접수 여부로 안 가른다.** 계약 ⑤가 세우지 못하게 한 것은 **프레임의 내용**이고,
    // 여기서 서는 것은 그 자리를 대신하는 **사유**다 — §8.1 *"버리는 것이 아니다. (…) 내용
    // 대신 사유가 선다."* 사유까지 접수에 매달면 그것이야말로 `ARCHITECTURE.md` §2.6의
    // 침묵 실패다.
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

    // **처분은 여기서 고르지 않는다** — `disposition` 하나가 답하고 이 `switch`는 그 답을
    // 소진할 뿐이다. `ConnectionDisposition`에 갈래가 늘면 `default`의 `never` 대입이 붉어진다.
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

  /**
   * **연결 사건** 하나를 접고 그 전이를 종단한다.
   *
   * **프레임은 이 자리를 안 지난다.** 프레임을 접는 자리는 `receive`의 `frameVerdict` 하나이고
   * (§8.1 계약 ⑤), 같은 프레임을 여기서 또 접으면 접수 답이 가리키는 상태와 배선이 든 상태가
   * 갈린다 — `protocol.js`가 `FrameVerdict.state`에 남긴 계약이 그것이다. **그 오용을 주석이
   * 아니라 타입으로 닫는다**: 인자에서 프레임 갈래를 빼면 `apply({ kind: "frame", … })`가
   * 타입 오류라 두 번 접는 경로가 표현 불가능해진다.
   *
   * @param {Exclude<StreamSignal, { readonly kind: "frame" }>} signal
   */
  const apply = (signal) => {
    const before = state.phase;
    state = applySignal(state, signal);
    settle(before, disposition(state));
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

  /**
   * 스트림이 실어 온 줄 하나를 처리한다.
   *
   * **순서가 계약이다**(§8.1 계약 ⑤ — *"프레임의 내용은 순수 층이 그것을 접수한 뒤에만 화면에
   * 선다. 접수 여부는 순수 층의 답이고 배선이 다시 짓지 않는다."*). 셋이 이 순서로 선다.
   *
   * 1. **순수 층이 답한다.** 상태가 여기서 전진한다 — 화면을 부르기 **전**이므로 수열의 전진이
   *    화면의 성패에 안 매달린다. 급수가 앞이면 화면 층의 던짐이 검사를 통째로 건너뛰어 수열이
   *    안 오르고 다음 프레임이 갭으로 읽혀 «원인과 다른 이름»이 뜨는데, 이 순서에서는 그
   *    오진이 *"표현 불가능해진다"*(§8.1).
   * 2. **접수면 급수한다.**
   * 3. **전이가 났으면 화면에 알리고 처분한다.**
   *
   * **[추정] 급수와 처분의 상대 순서 — 정본이 안 정한다.** §8.1은 «판정이 급수보다 앞»만 정하고
   * 급수와 처분의 앞뒤는 안 든다. 급수를 앞에 두는 근거는 접수표의 종료 고지 행이다 —
   * *"그 내용이 곧 처분이므로 반드시 선다 — 종단이라고 빠지지 않는다."* 처분이 먼저면 `stop`이
   * 소켓을 닫은 **뒤에** 그 고지를 급수하게 되고, 갭의 «다시 연다»가 **프레임 처리 도중에
   * 소켓을 갈아 끼우는** 창을 급수 앞에 여는 형태가 되어 계약 ④의 자리를 넓힌다.
   *
   * **그 창이 이 순서에서는 아예 안 열린다** — 급수는 `accepted`를 요구하고, `accepted`는 접은
   * 뒤가 `gap`이 아님을 함의하며, `reopen`은 `gap`에서만 난다. 즉 **급수 뒤에 오는 처분은
   * `continue`거나 `stop`이고 소켓 교체는 그 사이에 못 낀다.**
   *
   * @param {string} text
   */
  const receive = (text) => {
    // 읽기와 접기를 갈라 둔 덕에 같은 줄을 두 번 파싱하지 않는다 — 순수 층이 와이어 줄이
    // 아니라 `FrameResult`를 받는 이유가 그것이다(§8.1).
    const read = readFrame(text);
    const before = state.phase;

    // ① 판정 — **상태가 여기서 전진한다.** 셋(다음 상태·처분·접수)이 한 답에서 나오고, 그래서
    // 이 프레임에 대해 `applySignal`을 따로 부르지 않는다(`protocol.js`의 `FrameVerdict` 계약).
    const verdict = frameVerdict(state, read);
    state = verdict.state;

    // ② 급수 — **접수한 프레임의 내용만 선다.** `read.ok`는 판정이 아니라 판별자 좁히기다:
    // `accepted`가 참이면 이미 읽힌 줄이고(순수 층의 정의 첫 항), 이 항 없이는 `read.frame`에
    // 닿을 수 없다. **배선이 «읽혔으면 급수한다»를 스스로 판정하는 것은 §9.6이 기각한 갈래**
    // 이므로 게이트의 앞자리를 `accepted`가 진다.
    if (verdict.accepted && read.ok) {
      const frame = read.frame;
      if (frame.type === "event") handlers.onEvent(frame.event);
      else if (frame.type === "state") handlers.onEffect(stateEffect(frame));
      // 요청과 그 응답은 스트림이 아니라 POST가 나른다(§2.1). 여기로 온 것은 계약 밖이므로
      // 조용히 버리지 않고 올린다(§9.3 · `ARCHITECTURE.md` §2.6). 접수표가 이 행을 ○로 두되
      // *"수열을 안 움직이므로 내용의 착지가 아니다"*라고 적는다 — 서는 것은 고지다.
      else handlers.onOffStreamFrame(frame.type);
    }

    // ③ 종단 — 접수가 거짓이었던 자리에 **사유**가 서는 곳이 여기다(§8.1 — *"버리는 것이
    // 아니다."*). 처분도 순수 층의 답을 그대로 넘긴다.
    settle(before, verdict.disposition);
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
