/**
 * HTTP 서버 — `docs/WEB-UI.md` §2.1·§3·§4·§6·§12.
 *
 * 이 파일이 지는 것은 **넷**이다. 바인드(§4), 스트림 개설의 버전 관문(§6), 코어 구독의
 * 소유(§5 규칙 2), 그리고 요청을 갈래로 넘기는 라우팅(§2.1)이다. 스트림의 내용
 * (핸드셰이크·푸시·배압)은 `stream.ts`가, 메서드 표는 `methods.ts`가, 정적 자산은
 * `assets.ts`가, 종료 순서는 `shutdown.ts`가 진다 — 이 파일은 그 넷을 **부르는 자리**이지
 * 그 넷을 아는 자리가 아니다.
 *
 * ## 바인드 — 상수이되 인자다 (§4)
 *
 * §4가 두 문장을 함께 요구한다. *"바인드 호스트는 상수이고 설정·env·argv 어디서도 덮어쓸
 * 수 없다."*와, 흔적만 남기는 것으로 든 *"서버 생성 함수의 인자로 받는 형태"*다. 둘이
 * 부딪히는 것처럼 보이지만 부딪히지 않는다 — **인자의 타입이 값 하나로 닫혀 있으면** 자리는
 * 열려 있고 값은 하나다. 그래서 아래 `BindHost`는 리터럴 타입이고, 다른 값을 넘기는 코드는
 * 컴파일되지 않으며 컴파일러를 우회해 들어온 값은 생성에서 던진다.
 *
 * 이 형태가 §4의 *"만들지 않으면 잘못 켤 수 없다"*를 지키는 이유는 **설정 항목이 생기지
 * 않기 때문**이다. 이 파일은 `process.env`도 `process.argv`도 읽지 않는다 — 읽는 코드가
 * 없으므로 env·argv 갈래는 막히는 것이 아니라 존재하지 않는다.
 *
 * 노출을 여는 날 바뀌는 것은 그 인자의 출처와 리터럴 타입뿐이고 아래 서버 본체는
 * 재작성되지 않는다. 그것이 §4가 이 흔적으로 사려던 것이다.
 *
 * ## 버전 관문 — 스트림이 열리기 전에 (§6)
 *
 * §6이 *"버전은 스트림을 여는 요청이 싣고 불일치는 스트림이 열리기 전에 HTTP 상태로
 * 거부된다"*로 착지시켰고 §2.1이 그 상태를 *"열리기도 전의 HTTP 400"*으로 적었다. 그래서
 * 이 파일의 관문은 응답 헤더를 `text/event-stream`으로 쓰기 **전**에 서고, 관문을 통과하지
 * 못한 요청은 `openStream`에 도달하지 않는다. *"협상·다운그레이드 없이"*이므로 낮은 버전을
 * 낮은 계약으로 받아 주는 갈래가 없다.
 *
 * **버전을 무엇에 싣는가는 이 사이클이 정했고 정본은 §6 말미다** — 스트림을 여는 GET
 * 요청의 쿼리 문자열이다. 근거 둘은 그 절이 든다(브라우저 쪽 소비자가 요청 헤더를 못 실고,
 * 경로에 실으면 §9.1이 닫은 라우트 표가 열린다). 이 파일은 그 판정을 이행할 뿐이다.
 *
 * ## 구독은 프로세스가 소유한다 (§5 규칙 2 · §8)
 *
 * 코어 구독은 **연결이 아니라 이 서버가 하나** 든다. §8이 *"클라이언트 연결이 끊겨도 진행
 * 중인 런은 계속된다"*를 정했고, 구독을 연결에 매달면 그 문장이 배선에서 거짓이 된다 —
 * 마지막 연결이 끊기는 순간 코어가 아무에게도 안 들리는 상태로 계속 돈다. 아래 버스가
 * 그 하나의 구독을 받아 붙어 있는 연결들에 나눈다.
 *
 * *"구독은 `subscribe()`로만 한다."* 이 파일이 코어에서 받는 타입은 `subscribe` 하나만
 * 가진 구조라, *"코어 인스턴스에 콜백 속성을 대입하는 형태"*가 **표현되지 않는다** — 대입할
 * 속성이 타입에 없다.
 *
 * 구독이 바인드보다 앞인 것도 계약이다. §3의 기동 순서가 저장소 구독을 서버 바인드 앞에
 * 두고 그 근거를 *"서버 바인드가 저장소 구독보다 뒤인 이유"*로 적는데, 같은 근거가 이
 * 자리에도 선다 — 클라이언트가 붙어 이벤트를 받기 시작했는데 코어 구독이 아직 안 서 있으면
 * 그 사이의 이벤트는 아무 데도 안 간다.
 */

import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer as createHttpServer } from "node:http";
import type { AgentEvent, AgentEventListener, Unsubscribe } from "@neo-agent/core";

// ---------------------------------------------------------------------------
// 상수 — §4·§6·§12
// ---------------------------------------------------------------------------

/**
 * 바인드 호스트. §4가 *"원격 접속은 SSH 포트포워딩으로만 한다"*로 닫은 노출의 실물이다.
 *
 * [미규정] §4는 루프백을 정하면서 **주소 계열을 정하지 않는다.** IPv4 리터럴을 골랐다 —
 * 계열을 안 고르면 상수가 둘이 되어야 하고(`127.0.0.1`과 `::1`) 그 순간 §4가 상수 하나로
 * 얻으려던 성질이 약해진다. 대가는 정직하게 적는다: 이름 `localhost`가 `::1`로 풀리는
 * 환경에서 브라우저가 그 이름으로 오면 연결이 거부되고, 그때 옳은 주소는 이 리터럴이다.
 */
export const LOOPBACK_HOST = "127.0.0.1";

/**
 * 바인드 호스트의 타입. **값이 하나인 타입이다.**
 *
 * §4의 *"설정·env·argv 어디서도 덮어쓸 수 없다"*가 여기서 타입 층으로 선다 — 이 타입에
 * 넣을 수 있는 값이 위 상수 하나뿐이므로 다른 주소를 넘기는 호출은 컴파일되지 않는다.
 */
export type BindHost = typeof LOOPBACK_HOST;

/**
 * 기본 포트. §12가 *"기본값이 존재한다는 것이 계약이고 값은 아니다"*로 든 자리다.
 *
 * 그래서 이 값을 단정하는 검사를 두지 않는다 — 두면 세부가 계약이 된다. 잰다면 존재와
 * 범위(특권 포트 밖의 정수)이지 값이 아니다.
 */
export const DEFAULT_PORT = 14017;

/**
 * 스트림을 여는 라우트. §2.1의 SSE 스트림 하나가 여기 붙는다.
 *
 * 이 라우트가 상수인 것은 §9.1이 자산에 대해 쓴 수단과 같은 근거다 — 요청에서 온 문자열로
 * 라우트를 조립하지 않으므로 열리는 경로의 집합이 이 파일 안에서 닫힌다.
 */
export const STREAM_PATH = "/stream";

/**
 * 메서드 POST가 오는 라우트. §2.1이 클라이언트→서버를 개별 POST로 정했고 §11이 그 표를 닫았다.
 *
 * **[미규정]** `WEB-UI.md`는 그 POST가 **어느 경로로 오는지**를 어느 절도 정하지 않는다 —
 * §9.1이 닫은 것은 자산 라우트뿐이다. 여기서 고른 값이 계약이 아니라는 것을 적어 둔다: 정할
 * 자리는 `WEB-UI.md`이고, 정해질 때까지 이 상수 하나가 그 자리를 대신한다. **자산 갈래와
 * 접두가 겹치지 않는 값**이어야 한다는 것만이 오늘 실제로 걸리는 제약이다(§9.1의 라우트
 * 집합이 `/client/` 아래다).
 *
 * **자리가 이 파일인 것은 미규정이 아니다**(2026-08-26 이관). 바로 위 상수가 든 근거가 그대로
 * 걸린다 — 열리는 경로의 집합이 이 파일 안에서 닫혀야 하고, 그중 하나만 배선이 들면 «오늘
 * 열려 있는 라우트 셋»의 정본이 패키지 경계를 넘어 흩어진다. §2.1 말미가 전송 변경에서 `cli`를
 * 빼 둔 것도 같은 사실의 다른 표현이다.
 */
export const METHOD_PATH = "/rpc";

/**
 * 프로토콜 버전. *"버전은 사람이 올린다"*(§6)이므로 손으로 적은 리터럴이고, 자동 증가·생성
 * 경로를 두지 않는다.
 *
 * **`package.json`의 버전과 잇지 않는다.** 이으면 패키지 판올림이 프로토콜 버전을 올리게
 * 되는데 그것이 §6이 금한 자동 증가다. 이 값이 오르는 유일한 경우는 프레임 셋(§6)이 갈려
 * 낡은 자산이 새 서버를 오해할 수 있게 될 때다.
 *
 * [미규정] §6은 버전의 **표현**(수인지 문자열인지)을 정하지 않는다. 문자열로 둔다 — 쿼리
 * 문자열이 나르는 것이 문자열이라 수로 두면 비교 전에 파싱이 한 겹 끼고, 그 파싱은
 * `"1.0"`·`" 1"` 같은 입력에서 정확 일치를 느슨하게 만든다. 문자열 동등 비교가 §6의
 * *"정확히 일치할 때만"*을 그대로 잰다.
 */
export const PROTOCOL_VERSION = "1";

/** 버전을 싣는 쿼리 파라미터 이름. 자리의 정본은 §6 말미다 */
export const PROTOCOL_VERSION_PARAM = "v";

// ---------------------------------------------------------------------------
// 코어 구독 — §5 규칙 2 · §8
// ---------------------------------------------------------------------------

/**
 * 서버가 코어에서 받는 표면. **`subscribe` 하나다.**
 *
 * `Agent`를 통째로 받지 않는 것이 §5 규칙 2의 기계 판이다 — 이 타입에는 대입할 콜백 속성이
 * 없고 런을 시작할 수단도 없다. 코어 인스턴스가 그대로 대입되므로 배선 쪽은 아무것도 더
 * 하지 않는다.
 */
export type AgentEventSource = {
  subscribe(listener: AgentEventListener): Unsubscribe;
};

/**
 * 붙어 있는 연결들이 코어 이벤트를 받는 자리. 코어 구독 하나를 여럿에게 나눈다.
 *
 * 이 버스가 있는 이유는 §8이다 — 구독이 연결에 매달리면 마지막 연결이 끊기는 순간 코어
 * 구독이 사라지고, 그때 *"진행 중인 런은 계속된다"*는 배선에서 거짓이 된다. 버스는
 * 프로세스 수명을 살고 연결은 그 위에 붙었다 떨어진다.
 */
export type AgentEventBus = {
  subscribe(listener: AgentEventListener): Unsubscribe;
};

/**
 * 버스의 전달은 **코어 이미터의 성질을 그대로 물려받는다** — 구독 순서대로 순차 await하고,
 * 리스너 예외는 삼키지 않되 나머지 전달을 취소하지 않는다.
 *
 * 이 선택은 `CORE-INTERFACE.md` §9 불변 조건 2가 리스너 단위로 깨지지 않게 한다. 예외를
 * 삼키면 화면이 조용히 뒤처지고(`ARCHITECTURE.md` §2.6), 중간에 끊으면 짝 없는 종료
 * 이벤트를 받는 연결이 생긴다.
 *
 * **느린 소비자의 상한은 여기 없다.** §8이 그 상한을 연결의 성질로 정했으므로 재는 자리는
 * 연결을 소유한 층이다 — 버스가 그것을 대신 재면 한 연결의 느림이 다른 연결의 이벤트를
 * 끊는다.
 */
class EventBus implements AgentEventBus {
  readonly #listeners = new Set<AgentEventListener>();

  subscribe(listener: AgentEventListener): Unsubscribe {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** 코어 구독이 부르는 자리. 이 서버 밖에서 이벤트를 밀어 넣을 수 없다 */
  readonly deliver: AgentEventListener = async (
    event: AgentEvent,
    signal: AbortSignal,
  ): Promise<void> => {
    const failures: unknown[] = [];
    for (const listener of [...this.#listeners]) {
      // 전달 도중에 끊긴 연결의 리스너는 건너뛴다 — 스냅샷을 뜬 뒤에 지워졌을 수 있다.
      if (!this.#listeners.has(listener)) continue;
      try {
        await listener(event, signal);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) {
      throw new AggregateError(failures, `${String(failures.length)} 건의 이벤트 전달이 실패했다.`);
    }
  };
}

// ---------------------------------------------------------------------------
// 서버 — §2.1·§4·§6
// ---------------------------------------------------------------------------

/** 스트림 개설 요청. 버전이 정확히 일치한 요청만 여기 도달한다(§6) */
export type StreamOpen = {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  /** 이 연결이 코어 이벤트를 받는 자리(§8) */
  readonly events: AgentEventBus;
};

/** 스트림 밖의 요청 — 메서드 POST(§11)와 정적 자산(§9.1)이 여기로 간다 */
export type PlainRequest = {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
};

export type ServeAddress = {
  readonly host: BindHost;
  readonly port: number;
};

export type ServeServerOptions = {
  /**
   * 바인드 호스트. §4의 흔적이 요구한 *"서버 생성 함수의 인자로 받는 형태"*다.
   *
   * 선택적으로 두지 않는다 — 기본값을 두면 인자가 장식이 되고, 그때 이 자리는 §4가 사려던
   * 것(출처만 바뀌면 되는 형태)을 실제로는 안 판다.
   */
  readonly host: BindHost;
  /** 생략하면 `DEFAULT_PORT`. 0을 주면 커널이 고른다(검사가 쓴다) */
  readonly port?: number;
  /** 코어. §5 규칙 2대로 `subscribe` 하나만 본다 */
  readonly agent: AgentEventSource;
  /**
   * 버전 관문을 지난 스트림 개설. **선택적이지 않다** — 없으면 스트림 라우트가 조용히
   * 404가 되고, 그것이 §12가 계약으로 든 비침묵의 반대다.
   */
  readonly openStream: (open: StreamOpen) => void;
  /** 그 밖의 모든 요청. 같은 이유로 선택적이지 않다 */
  readonly handleRequest: (plain: PlainRequest) => void;
};

export type ServeServer = {
  readonly host: BindHost;
  /** 설정된 포트. 0이면 바인드 뒤 `address`가 실제 포트를 든다 */
  readonly port: number;
  /** 바인드된 실주소. `listen()` 전에는 `undefined`다 */
  readonly address: ServeAddress | undefined;
  readonly events: AgentEventBus;
  /** 코어를 구독하고 바인드한다. 순서가 그것이다(§3) */
  listen(): Promise<ServeAddress>;
  /**
   * 새 연결을 그만 받고 구독을 끊는다.
   *
   * **§3.2의 종료 시퀀스가 아니다.** 열려 있는 스트림을 끊는 것과 그 순서(고지·승인 접기·
   * 유예)는 그 절이 정하고 `shutdown.ts`가 이행한다. 이 함수는 그 시퀀스가 쓰는 부품이며,
   * 열린 연결이 남아 있으면 `node:http`의 `close`는 그것들이 끝날 때까지 기다린다.
   */
  close(): Promise<void>;
};

/**
 * 서버를 만든다. **바인드하지 않는다** — 바인드는 `listen()`이 한다.
 *
 * 생성과 바인드를 가르는 이유는 §3의 기동 순서다. 그 순서에서 서버 바인드는 마지막 직전
 * 단계이고, 그 앞의 단계들이 서는 동안 서버 객체는 이미 존재해야 배선이 한 자리에 모인다.
 */
export function createServeServer(options: ServeServerOptions): ServeServer {
  const host = options.host;
  // 타입 층을 우회해 들어온 값(`any` 경유·JS 호출자·JSON 설정)을 여기서 막는다. §4가
  // 계약으로 건 것은 값이지 표기가 아니므로, 컴파일러 하나에 맡기면 계약이 소스 언어에
  // 의존하게 된다.
  if (host !== LOOPBACK_HOST) {
    throw new Error(
      `바인드 호스트는 ${LOOPBACK_HOST} 하나다 — 받은 값: ${String(host)}. 노출은 WEB-UI.md §4가 루프백으로 고정했다.`,
    );
  }

  const port = options.port ?? DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`포트는 0..65535의 정수여야 한다 — 받은 값: ${String(port)}.`);
  }

  const bus = new EventBus();
  const http = createHttpServer((request, response) => {
    route(request, response, bus, options);
  });

  let unsubscribe: Unsubscribe | undefined;
  let address: ServeAddress | undefined;

  return {
    host,
    port,
    get address(): ServeAddress | undefined {
      return address;
    },
    events: bus,
    listen: () =>
      new Promise<ServeAddress>((resolve, reject) => {
        if (unsubscribe !== undefined) {
          reject(new Error("이미 바인드된 서버다."));
          return;
        }
        // 구독이 먼저다(§3). 바인드가 먼저면 첫 클라이언트가 붙는 것과 구독이 서는 것
        // 사이에 이벤트가 아무 데도 안 가는 창이 생긴다.
        unsubscribe = options.agent.subscribe(bus.deliver);

        const onError = (error: Error): void => {
          unsubscribe?.();
          unsubscribe = undefined;
          reject(error);
        };
        http.once("error", onError);
        http.listen(port, host, () => {
          http.removeListener("error", onError);
          address = boundAddress(http, host);
          resolve(address);
        });
      }),
    close: () =>
      new Promise<void>((resolve, reject) => {
        // 받는 것을 먼저 멈추고 구독을 끊는다. 반대 순서면 이미 붙어 있는 연결이 이벤트를
        // 못 받는 채로 살아 있는 구간이 생긴다.
        http.close((error) => {
          unsubscribe?.();
          unsubscribe = undefined;
          address = undefined;
          if (error !== undefined && error !== null) reject(error);
          else resolve();
        });
      }),
  };
}

/**
 * 바인드된 실주소를 읽는다.
 *
 * `node:http`의 `address()`는 파이프에서 문자열을, 미바인드에서 `null`을 낸다. 우리는
 * 위에서 TCP 포트로만 바인드하므로 그 갈래들은 도달 불가능인데, **도달 불가능을 조용한
 * 기본값으로 접지 않는다**(`ARCHITECTURE.md` §2.6) — 접으면 바인드가 실패한 서버가 포트 0을
 * 든 채 정상으로 읽힌다.
 */
function boundAddress(http: Server, host: BindHost): ServeAddress {
  const bound = http.address();
  if (bound === null || typeof bound === "string") {
    throw new Error(`바인드 주소를 읽지 못했다 — ${String(bound)}.`);
  }
  return { host, port: bound.port };
}

// ---------------------------------------------------------------------------
// 라우팅과 버전 관문 — §2.1·§6
// ---------------------------------------------------------------------------

function route(
  request: IncomingMessage,
  response: ServerResponse,
  events: AgentEventBus,
  options: ServeServerOptions,
): void {
  // 요청 라인의 경로를 절대 URL로 만들어 읽는다. **기준 오리진은 상수다** — 요청의
  // `Host` 헤더를 쓰면 밖에서 온 문자열이 파싱의 입력이 되고, §9.1이 자산 경로에 대해
  // 세운 규율이 라우팅에서 새는 자리가 된다. 여기서 쓰는 것은 `pathname`뿐이라 오리진의
  // 값은 결과에 안 나타난다.
  const url = new URL(request.url ?? "/", `http://${LOOPBACK_HOST}`);

  if (url.pathname !== STREAM_PATH) {
    options.handleRequest({ request, response });
    return;
  }

  // *"우리 스트림을 여는 것은 HTTP GET이지"* — §6.1이 핸드셰이크가 응답 프레임이 아닌
  // 근거로 든 사실이다. 다른 메서드는 그 자리에 오는 것이 아니므로 거부한다.
  if (request.method !== "GET") {
    plainText(response, 405, "스트림 개설은 GET이다.", { Allow: "GET" });
    return;
  }

  const version = url.searchParams.get(PROTOCOL_VERSION_PARAM);
  if (version !== PROTOCOL_VERSION) {
    // 관문이 스트림 헤더보다 앞이다(§6·§2.1). 여기서 나가는 응답은 `text/event-stream`이
    // 아니고, 이 요청은 `openStream`에 도달하지 않는다.
    //
    // 협상하지 않는다 — 낮은 버전을 낮은 계약으로 받아 주는 갈래가 없다(§6). 문면은 §12가
    // 세부로 두었고 계약인 것은 침묵하지 않는 것뿐이라, 받은 값과 기대값을 함께 적는다.
    plainText(
      response,
      400,
      `프로토콜 버전이 맞지 않는다 — 서버 ${PROTOCOL_VERSION}, 요청 ${version ?? "없음"}. 새로고침이 필요하다.`,
    );
    return;
  }

  options.openStream({ request, response, events });
}

function plainText(
  response: ServerResponse,
  status: number,
  body: string,
  headers: Readonly<Record<string, string>> = {},
): void {
  response.writeHead(status, {
    ...headers,
    "content-type": "text/plain; charset=utf-8",
  });
  response.end(body);
}
