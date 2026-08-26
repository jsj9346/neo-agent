/**
 * 스트림 — `docs/WEB-UI.md` §6.1·§8.
 *
 * 이 파일이 지는 것은 **연결 하나의 수명**이다. 핸드셰이크(§6·§6.1), `state` 푸시 넷(§6.1),
 * 느린 소비자의 상한(§8), 그리고 연결이 끊겨도 런이 계속되는 성질(§8)이다. 바인드와 버전
 * 관문은 `server.ts`가, 번호 발급과 바이트 형식은 `codec.ts`가, 프레임 셋은 `protocol.ts`가,
 * 승인 레지스트리는 `approvals.ts`가, 종료 순서는 `shutdown.ts`가 진다.
 *
 * ## 첫 프레임이 핸드셰이크다 (§6·§6.1)
 *
 * §6이 *"첫 프레임은 반드시 핸드셰이크다"*로 정했고 §6.1이 그 프레임의 번호를 1로 못박았다.
 * 아래 `start`가 스냅샷을 먼저 만들고, 응답 헤더를 쓰고, 핸드셰이크를 밀어낸 **뒤에야**
 * 구독을 붙이는 것이 그 두 문장의 배선이다. 순서를 뒤집으면 코어 이벤트가 핸드셰이크보다
 * 앞에 나갈 수 있고, 그러면 §6.1이 클라이언트에서 기계로 재기로 한 성질 — 핸드셰이크가
 * 아닌 첫 프레임을 판별할 수 있다는 것 — 이 서버 쪽에서 이미 거짓이 된다.
 *
 * 그 셋이 **한 동기 블록 안에** 있는 것이 스냅샷과 구독 사이의 창을 0으로 만든다. 이벤트
 * 전달은 await 지점에서만 끼어들 수 있으므로, 동기 블록이 끊기지 않는 한 스냅샷을 뜬 뒤
 * 구독이 서기 전에 잃는 이벤트가 존재하지 않는다.
 *
 * ## 상한 둘 — 트랜스크립트와 버퍼
 *
 * §6.1이 스냅샷의 트랜스크립트를 꼬리 N으로 자르고, §8이 느린 소비자의 버퍼에 상한을 건다.
 * **두 상한은 서로를 요구한다.** 그 절이 적은 대로, 스냅샷이 버퍼 상한을 넘으면 열자마자
 * 닫히고 재접속이 같은 스냅샷을 다시 보내는 고리가 생기며 그 고리는 화면에 아무 자국을
 * 안 남긴다. 그래서 이 파일은 상한 둘을 함께 든다.
 *
 * **N도 버퍼 상한도 값은 세부다**(§12의 수치 항). 아래 두 상수를 export하지 않는 이유가
 * 그것이고, 대신 생성 옵션으로 받는다 — `approvals.ts`가 만료 값에 대해 쓴 형태 그대로다.
 *
 * **이 옵션은 §6.1이 금한 요청 파라미터가 아니다.** 그 절이 막은 것은 *"상한을 요청
 * 파라미터로 받지 않는다"*이고 근거는 파라미터를 안 주면 전량으로 폴백하는 경로였다. 여기
 * 옵션은 조립이 프로세스 기동 때 주는 값이고 요청이 닿지 않으며, 아래 검증이 유한한 양의
 * 정수만 받으므로 **상한이 없는 상태가 표현되지 않는다.** 켜고 끄는 자리가 아니다.
 *
 * ## 연결이 끊겨도 런은 계속된다 (§8)
 *
 * 그 문장이 이 파일에서 실물을 얻는 자리는 **예외를 밖으로 안 내보내는 것**이다. 코어 구독은
 * `server.ts`의 버스 하나가 들고 그 버스는 리스너 예외를 삼키지 않는데, 이 파일의 리스너가
 * 죽은 소켓에 쓰다 던지면 그 예외가 코어의 방출 경로로 올라간다 — 즉 브라우저 탭 하나가
 * 닫히는 것이 런을 깨뜨린다. 그래서 아래 푸시는 쓰기 실패를 잡아 **그 연결만** 닫고,
 * 사유는 생성 때 받은 오류 싱크로 보낸다.
 *
 * 승인 레지스트리 쪽도 같다. `approvals.ts`의 통지는 구독자 예외를 모아 다시 던지므로,
 * 이 파일의 승인 리스너가 던지면 승인 접힘 자체가 실패한다.
 *
 * **오류 싱크가 선택적이지 않은 이유가 여기 있다.** 기본값을 두면 갈래가 둘뿐인데 둘 다
 * 계약을 깬다 — 던지는 기본값은 위 문단이 막으려는 것이고, 삼키는 기본값은
 * `ARCHITECTURE.md` §2.6이 금한 조용한 실패다. 그래서 그 자리를 호출자가 반드시 소유한다.
 *
 * ## 이벤트를 재생하지 않는다 (§8)
 *
 * 연결마다 `codec.ts`의 인코더를 새로 만드는 것이 그 계약의 배선이다. 그 인코더는 이어받을
 * 번호를 받는 인자가 없으므로 재생이 표현 불가능하고, 갭을 만난 클라이언트가 하는 일은
 * 재접속 하나다 — 그때 받는 것이 새 핸드셰이크 스냅샷이다.
 *
 * **하트비트를 두지 않는다.** SSE에는 주석 줄로 연결을 데워 두는 관행이 있는데, 그것은
 * 번호가 없는 푸시다. §6.1이 갭 판정을 한 카운터에 걸었고 *"번호가 없는 푸시는 잃어도 표가
 * 안 난다"*고 적었으므로, 그런 줄을 넣는 순간 이 연결 위에 카운터 밖의 트래픽이 생긴다.
 * 필요해지면 그것은 이 파일의 재량이 아니라 §6.1의 개정이다.
 */

import type { ServerResponse } from "node:http";
import type { AgentEvent, AgentEventListener, AgentMessage, Unsubscribe } from "@neo-agent/core";
import type { ApprovalChange, ApprovalChangeListener } from "./approvals.ts";
import { createPushEncoder, type UnsequencedPush } from "./codec.ts";
// 꼬리 창을 만드는 규칙은 `methods.ts`가 소유한다. 그 파일의 머리가 그 소유를 선언하고,
// 근거는 «스냅샷이 든 `omitted`»와 «조회가 실제로 돌려주는 수»가 갈리면 그 갈림이 화면에서
// 조용하다는 것이다(§6.1 · `ARCHITECTURE.md` §2.6). 그래서 여기에 두 번째 구현을 두지 않는다.
import { takeTailWindow } from "./methods.ts";
import type { PendingApproval, StateSnapshot, TranscriptWindow } from "./protocol.ts";
import type { AgentEventBus, StreamOpen } from "./server.ts";

// ---------------------------------------------------------------------------
// 상수 — §6.1·§8·§12
// ---------------------------------------------------------------------------

/**
 * 한 연결이 안고 있어도 되는 미전송 바이트의 상한. 넘으면 연결을 닫는다(§8).
 *
 * [미규정] §8은 *"느린 소비자를 무한정 버퍼링하지 않는다"*와 상한 초과 시 연결을 닫는 것만
 * 정하고 **무엇을 세는 상한인지는 정하지 않는다.** 바이트로 골랐다 — 프레임 수로 세면 큰
 * 프레임 하나가 상한 안에서 메모리를 얼마든지 쓸 수 있어 그 절이 막으려던 것이 안 막힌다.
 *
 * 재는 수단은 `writableLength`다. `write()`의 반환값은 수위 표시에 불과해 그것이 거짓이어도
 * 노드는 계속 버퍼링하므로, 그 값으로는 무한정 버퍼링이 실제로 시작됐는지 알 수 없다.
 */
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;

/**
 * 스트림 응답의 헤더.
 *
 * 캐시를 끄는 것은 §9.1이 정적 자산에 대해 *"불변 캐시를 두지 않는다"*로 쓴 것과 같은 규율의
 * 이 자리 판이다 — 이 응답은 시간에 따라 자라는 푸시열이라 어느 캐시에도 넣을 것이 아니다.
 */
const STREAM_HEADERS: Readonly<Record<string, string>> = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-store",
  connection: "keep-alive",
};

// ---------------------------------------------------------------------------
// 이 파일이 밖에서 받는 표면
// ---------------------------------------------------------------------------

/**
 * 이 파일이 응답에서 실제로 쓰는 것만 든 표면. `node:http`의 `ServerResponse`가 그대로
 * 대입된다(파일 말미가 그것을 컴파일러로 잰다).
 *
 * 통째로 받지 않는 이유는 `approvals.ts`가 게이트 요청을 좁혀 받는 이유와 같다 — 표면이
 * 넓으면 이 파일이 그것을 볼 수 있다는 사실만으로 다음이 여기에 다른 일을 얹는다. 좁히면
 * 대역으로 부를 수 있게 되는 것은 부수 효과이지 목적이 아니다.
 */
export type StreamResponse = {
  writeHead(status: number, headers: Readonly<Record<string, string>>): unknown;
  write(chunk: string): unknown;
  end(): unknown;
  destroy(): unknown;
  /** 아직 소켓 밖으로 나가지 못한 바이트. 배압을 재는 값이다(§8) */
  readonly writableLength: number;
  /** 상대가 끊었을 때 알림. 그때 이 연결은 구독을 걷고 사라진다 */
  on(event: "close", listener: () => void): unknown;
};

/** 스냅샷이 싣는 세션 상태. 자르기 전의 트랜스크립트 전량을 든다 */
export type SessionSnapshot = {
  readonly sessionId: string;
  readonly messages: readonly AgentMessage[];
};

/**
 * 세션 상태를 읽는 자리. **두 값을 한 번에 돌려준다.**
 *
 * 세션 id와 트랜스크립트를 각각 읽으면 그 사이에 세션이 바뀔 수 있고, 그러면 한 스냅샷이
 * 서로 다른 두 세션을 담는다. 그 상태는 화면에서 판별 불가능하다.
 */
export type SessionSnapshotSource = () => SessionSnapshot;

/**
 * 승인 레지스트리에서 이 파일이 쓰는 둘. `approvals.ts`의 레지스트리가 그대로 대입된다.
 *
 * *"승인은 연결이 아니라 프로세스의 대기 레지스트리에 귀속한다"*(§7)이므로 여기 오는 것은
 * 프로세스에 하나인 레지스트리이고, 연결은 그 위에 붙었다 떨어진다.
 */
export type ApprovalSource = {
  list(): readonly PendingApproval[];
  subscribe(listener: ApprovalChangeListener): Unsubscribe;
};

/**
 * 스트림 하나를 여는 데 필요한 것. `server.ts`의 `StreamOpen`이 그대로 대입된다(말미의 대조).
 *
 * `request`를 안 받는 것이 의도다. 버전 관문은 `server.ts`가 이미 지났고 이 파일이 요청에서
 * 더 읽을 것이 없다 — 읽을 수 있으면 §9.1이 자산 경로에 대해 세운 규율이 이 층에서 샌다.
 */
export type StreamOpening = {
  readonly response: StreamResponse;
  readonly events: AgentEventBus;
};

export type StreamHubOptions = {
  readonly session: SessionSnapshotSource;
  readonly approvals: ApprovalSource;
  /** 꼬리 N. 생략하면 위 상수. 유한한 양의 정수여야 한다(§6.1) */
  readonly transcriptTailLimit?: number;
  /** 배압 상한(바이트). 생략하면 위 상수. 유한한 양수여야 한다(§8) */
  readonly maxBufferedBytes?: number;
  /**
   * 연결 하나가 실패한 사유의 행선지. **선택적이지 않다** — 이 파일 머리가 근거를 든다.
   *
   * 여기 오는 것은 쓰기 실패와 배압 초과이고, 둘 다 그 연결만의 사건이다. 런도 다른 연결도
   * 이것으로 끊기지 않는다(§8).
   */
  readonly onConnectionError: (error: unknown) => void;
};

export type StreamHub = {
  /** 버전 관문을 지난 요청 하나에 스트림을 연다 */
  open(opening: StreamOpening): void;
  /** 지금 붙어 있는 연결 수. §3.2의 종료 시퀀스가 읽는다 */
  readonly connectionCount: number;
  /**
   * §3.2 순서 2단계 — *"연결 중인 클라이언트에 알린다. 스트림은 연 채로 둔다"*.
   *
   * 그래서 이 함수는 고지만 하고 아무것도 닫지 않는다. 닫는 것은 6단계이고 아래가 그것이다.
   */
  announceShutdown(): void;
  /** §3.2 순서 6단계 — 스트림 닫기 */
  closeAll(): void;
};

// ---------------------------------------------------------------------------
// 트랜스크립트 상한 — §6.1
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 연결 하나
// ---------------------------------------------------------------------------

class StreamConnection {
  readonly #response: StreamResponse;
  readonly #maxBufferedBytes: number;
  readonly #onError: (error: unknown) => void;
  readonly #onRelease: () => void;
  /** 연결마다 새 인코더 — 번호가 1부터이고 이어받을 자리가 없다(§6·§8) */
  readonly #encoder = createPushEncoder();
  #unsubscribes: Unsubscribe[] = [];
  #closed = false;

  constructor(
    response: StreamResponse,
    maxBufferedBytes: number,
    onError: (error: unknown) => void,
    onRelease: () => void,
  ) {
    this.#response = response;
    this.#maxBufferedBytes = maxBufferedBytes;
    this.#onError = onError;
    this.#onRelease = onRelease;
  }

  get closed(): boolean {
    return this.#closed;
  }

  /**
   * 스냅샷을 싣고 스트림을 연다. **동기 하나**인 것이 이 파일 머리가 든 계약이다.
   *
   * 스냅샷을 헤더보다 먼저 만드는 이유는 실패 갈래다 — 세션을 못 읽으면 이 요청은 스트림이
   * 아니라 오류로 끝나야 하고, 헤더가 이미 `text/event-stream`으로 나간 뒤에는 그럴 수 없다.
   */
  start(snapshot: StateSnapshot, events: AgentEventBus, approvals: ApprovalSource): void {
    // 상대가 이미 끊었으면 여기서 끝난다. 이 리스너를 먼저 다는 이유는 아래 쓰기들이
    // 그 사실을 모른 채 도는 구간을 없애기 위함이다.
    this.#response.on("close", () => {
      this.#release();
    });

    try {
      this.#response.writeHead(200, STREAM_HEADERS);
    } catch (error) {
      this.#fail(error);
      return;
    }

    this.#push({ type: "state", kind: "handshake", snapshot });
    if (this.#closed) return;

    // 핸드셰이크 뒤에 붙는다. 앞에 붙이면 코어 이벤트가 첫 프레임이 될 수 있다(§6).
    this.#unsubscribes.push(events.subscribe(this.#onEvent));
    this.#unsubscribes.push(approvals.subscribe(this.#onApprovalChange));
  }

  /** §3.2 2단계의 고지. 페이로드가 없다(§6.1) */
  announceShutdown(): void {
    this.#push({ type: "state", kind: "shutdown" });
  }

  /** 정상 종료 — 상대에게 끝을 알리고 자원을 놓는다 */
  close(): void {
    if (this.#closed) return;
    this.#release();
    try {
      this.#response.end();
    } catch (error) {
      // 이미 사라진 소켓이다. 여기서 다시 실패해도 할 일이 없지만 삼키지는 않는다.
      this.#onError(error);
    }
  }

  /**
   * 코어 이벤트를 나른다.
   *
   * **동기로 끝나고 배압을 기다리지 않는다.** 버스는 리스너를 순차 await하므로 여기서
   * drain을 기다리면 느린 연결 하나가 다른 연결과 코어의 진행을 붙든다. §8이 그 상황에
   * 정한 처방은 기다리는 것이 아니라 **상한을 넘으면 닫는 것**이다.
   */
  readonly #onEvent: AgentEventListener = (event: AgentEvent): void => {
    this.#push({ type: "event", event });
  };

  /**
   * 승인 레지스트리의 변화를 §6.1의 두 갈래로 옮긴다.
   *
   * **이 둘이 없으면 무엇이 깨지는지를 그 절이 구체적으로 적는다** — 런 도중에 뜬 승인은
   * 재접속해야 보이고, 다른 탭이 답한 뒤에도 이쪽 프롬프트가 남는다. 즉 이 리스너가 §7의
   * 귀속을 연결 수명에서 풀어 놓는 자리다.
   */
  readonly #onApprovalChange: ApprovalChangeListener = (change: ApprovalChange): void => {
    if (change.kind === "pending") {
      this.#push({ type: "state", kind: "approval_pending", approval: change.approval });
      return;
    }
    this.#push({
      type: "state",
      kind: "approval_settled",
      id: change.id,
      // 사유를 접지 않고 그대로 나른다(§3.2). 화면이 아무도 답하지 않은 것과 서버가
      // 내려간 것을 가를 수 있는 것이 그 유니온이 셋인 이유다.
      outcome: change.outcome,
    });
  };

  /**
   * 푸시 하나. **번호는 인코더가 매긴다** — 이 파일에 카운터가 없는 것이 §6.1의
   * *"`seq`가 하나의 카운터인 것이 계약이다"*가 배선에서 참인 이유다.
   */
  #push(push: UnsequencedPush): void {
    if (this.#closed) return;

    let chunk: string;
    try {
      chunk = this.#encoder.encode(push);
    } catch (error) {
      this.#fail(error);
      return;
    }

    try {
      this.#response.write(chunk);
    } catch (error) {
      this.#fail(error);
      return;
    }

    if (this.#response.writableLength > this.#maxBufferedBytes) {
      this.#dropForBackpressure();
    }
  }

  /**
   * *"상한을 넘으면 연결을 닫는다"*(§8). **`end()`가 아니라 끊는다** — 상대가 안 읽어서
   * 쌓인 상황이라 정중한 종료는 그 버퍼가 빠질 때까지 다시 기다리는 일이 된다.
   *
   * *"닫힌 클라이언트는 재접속으로 스냅샷을 다시 받는다"*이므로 여기서 잃는 푸시를 따로
   * 복구하지 않는다. 그 경로는 같은 절이 이미 정의했다.
   */
  #dropForBackpressure(): void {
    this.#release();
    try {
      this.#response.destroy();
    } catch (error) {
      this.#onError(error);
      return;
    }
    // 상한 초과는 계약이 정한 정상 경로이지만, 알리지 않으면 이 연결이 사라진 이유가
    // 아무 데도 안 남는다(`ARCHITECTURE.md` §2.6). 사유를 싱크로 보낸다.
    this.#onError(
      new Error(
        `스트림 소비자가 상한을 넘겨 연결을 끊었다 — 미전송 ${String(this.#response.writableLength)} 바이트, 상한 ${String(this.#maxBufferedBytes)} 바이트.`,
      ),
    );
  }

  /** 쓰기가 실패했다. 그 연결만 접고 사유를 싱크로 보낸다 — 런은 계속된다(§8) */
  #fail(error: unknown): void {
    this.#release();
    this.#onError(error);
  }

  /**
   * 구독을 걷고 허브에서 빠진다. **응답에 손대지 않는다** — 상대가 끊어서 온 경로와
   * 우리가 닫는 경로가 이 함수를 공유하고, 앞쪽에서는 쓸 응답이 이미 없다.
   */
  #release(): void {
    if (this.#closed) return;
    this.#closed = true;
    const unsubscribes = this.#unsubscribes;
    this.#unsubscribes = [];
    for (const off of unsubscribes) off();
    this.#onRelease();
  }
}

// ---------------------------------------------------------------------------
// 허브 — 연결들을 든다
// ---------------------------------------------------------------------------

class StreamHubImpl implements StreamHub {
  readonly #connections = new Set<StreamConnection>();
  readonly #options: StreamHubOptions;
  /** 주어졌을 때만 값이 있다. 기본값은 `takeTailWindow`가 든다(소유는 `methods.ts`) */
  readonly #transcriptTailLimit: number | undefined;
  readonly #maxBufferedBytes: number;

  constructor(
    options: StreamHubOptions,
    transcriptTailLimit: number | undefined,
    maxBufferedBytes: number,
  ) {
    this.#options = options;
    this.#transcriptTailLimit = transcriptTailLimit;
    this.#maxBufferedBytes = maxBufferedBytes;
  }

  get connectionCount(): number {
    return this.#connections.size;
  }

  open(opening: StreamOpening): void {
    let snapshot: StateSnapshot;
    try {
      const session = this.#options.session();
      snapshot = {
        sessionId: session.sessionId,
        transcript: takeTailWindow(session.messages, this.#transcriptTailLimit),
        // *"대기 목록은 핸드셰이크 응답에 실린다"*(§7) — 붙자마자 무엇이 답을 기다리는지
        // 알아야 한다. 연결 도중의 발생과 해소는 위 리스너가 나른다.
        pendingApprovals: [...this.#options.approvals.list()],
      };
    } catch (error) {
      // 스트림 헤더가 아직 안 나갔으므로 오류로 끝낼 수 있다. 조용히 200을 내고 아무것도
      // 안 보내는 갈래를 만들지 않는다(§12 · `ARCHITECTURE.md` §2.6).
      this.#options.onConnectionError(error);
      failOpen(opening.response, this.#options.onConnectionError);
      return;
    }

    const connection = new StreamConnection(
      opening.response,
      this.#maxBufferedBytes,
      this.#options.onConnectionError,
      () => {
        this.#connections.delete(connection);
      },
    );
    this.#connections.add(connection);
    connection.start(snapshot, opening.events, this.#options.approvals);
  }

  announceShutdown(): void {
    for (const connection of [...this.#connections]) {
      connection.announceShutdown();
    }
  }

  closeAll(): void {
    for (const connection of [...this.#connections]) {
      connection.close();
    }
  }
}

/** 스냅샷을 못 만든 요청의 끝. 스트림이 아니라 오류로 끝난다 */
function failOpen(response: StreamResponse, onError: (error: unknown) => void): void {
  try {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.write("세션 상태를 읽지 못해 스트림을 열 수 없다.");
    response.end();
  } catch (error) {
    onError(error);
  }
}

/**
 * 스트림 허브를 만든다. **프로세스에 하나다** — 승인 레지스트리와 같은 근거이고, 배선을
 * 소유하는 자리는 `packages/cli`다.
 */
export function createStreamHub(options: StreamHubOptions): StreamHub {
  const transcriptTailLimit = options.transcriptTailLimit;
  if (
    transcriptTailLimit !== undefined &&
    (!Number.isInteger(transcriptTailLimit) || transcriptTailLimit <= 0)
  ) {
    throw new Error(
      `트랜스크립트 꼬리 상한은 유한한 양의 정수여야 한다 — 받은 값: ${String(transcriptTailLimit)}. 상한의 존재가 WEB-UI.md §6.1의 계약이다.`,
    );
  }

  const maxBufferedBytes = options.maxBufferedBytes ?? MAX_BUFFERED_BYTES;
  if (!Number.isFinite(maxBufferedBytes) || maxBufferedBytes <= 0) {
    throw new Error(
      `배압 상한은 유한한 양수여야 한다 — 받은 값: ${String(maxBufferedBytes)}. 상한의 존재가 WEB-UI.md §8의 계약이다.`,
    );
  }

  return new StreamHubImpl(options, transcriptTailLimit, maxBufferedBytes);
}

// ---------------------------------------------------------------------------
// 이음매 대조 — 컴파일 시점에만 존재한다.
//
// 이 파일이 좁혀 받은 두 표면에 실물이 실제로 대입되는지를 컴파일러가 잰다. 좁혀 받는 것의
// 대가는 실물과 갈릴 수 있다는 것이고, 이 두 줄이 그 대가를 무르는 그물이다.
// ---------------------------------------------------------------------------

type ServerResponseFits = ServerResponse extends StreamResponse ? true : never;
const _serverResponseFits: ServerResponseFits = true;
void _serverResponseFits;

type StreamOpenFits = StreamOpen extends StreamOpening ? true : never;
const _streamOpenFits: StreamOpenFits = true;
void _streamOpenFits;
