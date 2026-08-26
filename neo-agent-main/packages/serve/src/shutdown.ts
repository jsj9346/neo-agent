/**
 * 종료 시퀀스 — `docs/WEB-UI.md` §3.2.
 *
 * 이 파일이 지는 것은 **순서 하나**다. §3.2가 8단계를 열거하며 *"순서 자체가 계약이다"*를
 * 세 자리에서 명시했고(1 < 7 · 3 < 4 · 2와 6의 분리), 그 셋이 각각 무엇을 막는지를 그 절이
 * 든다. 여기 있는 코드는 그 열거를 그대로 옮긴 것이고, 단계의 **내용**은 전부 다른 파일이
 * 진다 — 수락 중지는 `server.ts`, 고지와 닫기는 `stream.ts`, 승인 비우기는 `approvals.ts`,
 * 런 제어는 코어다. 이 파일은 그 넷을 **부르는 순서**이지 그 넷을 아는 자리가 아니다.
 *
 * ## 개시자는 신호뿐이다
 *
 * *"프로세스 신호뿐이다 — `SIGINT`과 `SIGTERM`."* 그리고 *"서버를 내리는 메서드를 두지
 * 않는다."* 뒤 문장이 겨눈 것은 §6의 메서드 표이고 그 자리는 `methods.ts`가 이미 비운 채로
 * 닫혀 있다 — 이 파일이 내보내는 것은 와이어에서 부를 수 있는 이름이 아니라 배선과 검사가
 * 부르는 함수다. **두 신호를 가르지 않는다**: 아래 리스너는 어느 신호로 왔는지 보지 않는다.
 *
 * ## 1의 개시와 1의 완료가 같은 시점이 아니다
 *
 * §3.2가 1을 *"리스너를 닫는다. 새 연결도 새 요청도 받지 않는다"*로 적고, 1이 7보다 앞인
 * 근거를 *"저장소가 닫힌 뒤 들어온 요청이 이벤트를 만들면 그 이벤트는 영속되지 않는다"*로
 * 든다. `node:http`의 `close`는 **리스너를 즉시 닫고** 이미 열린 연결이 끝날 때까지 기다려
 * resolve하는데, 우리 스트림은 6단계까지 열려 있는 것이 계약이므로 그 Promise를 1의 자리에서
 * 기다리면 6이 영영 오지 않는다.
 *
 * **그래서 1에서 부르고 7 앞에서 기다린다.** 부르는 시점이 1의 자리이고 — 그때 리스너가
 * 닫혀 새 요청이 끊긴다 — 기다리는 것은 그 근거가 요구하는 것, 즉 «아직 도는 요청이 없다»를
 * `store.close()` 앞에서 확보하는 일이다. 두 조각이 갈리는 것은 이 파일의 재량이 아니라
 * 그 계약을 둘 다 지키는 유일한 배치다.
 *
 * ## 유예는 루프 위에서만 유한하다
 *
 * §3.2가 이 한계를 이름으로 적고 *"적지 않으면 다음이 이 상한을 무조건적 보장으로 읽는다"*고
 * 처방까지 냈다. **여기 상한은 `setTimeout`이고 타이머는 이벤트 루프 위에 산다** — 루프가
 * 얼면 이 상한도 안 돈다. 루프 밖 워치독은 `node:worker_threads`를 요구하고 그것이 §2.2의
 * 금지 목록에 있으므로 우리 수단이 아니며, 그 자리는 §10이 든 systemd의 정지 상한이 진다.
 *
 * **값은 세부다.** 계약인 것은 *"상한의 존재"*뿐이므로 아래 상수를 export하지 않고 옵션으로만
 * 덮어쓰게 한다 — `approvals.ts`가 만료에, `stream.ts`가 배압에 쓴 형태 그대로다.
 *
 * ## 실패한 단계가 나머지를 건너뛰지 않는다
 *
 * 한 단계가 던지면 그 자리에서 멈추는 것이 가장 손쉬운 배치인데, 그러면 3이 던졌을 때 스트림도
 * 저장소도 안 닫힌 채 프로세스가 남는다. 그래서 아래는 단계마다 잡아 **사유를 싱크로 보내고
 * 계속 간다.** 그리고 실패가 하나라도 있으면 종료 코드가 비영이다 — §3.2의 종료 코드 표가
 * *"종료 순서 자체가 실패했다"*에 그것을 배정했다. **비영을 값으로 세분하지 않는다**(같은 절).
 */

import type { ApprovalRegistry } from "./approvals.ts";
import type { ServeServer } from "./server.ts";
import type { StreamHub } from "./stream.ts";

// ---------------------------------------------------------------------------
// 상수 — §3.2·§12
// ---------------------------------------------------------------------------

/**
 * 4·5의 대기에 걸리는 유예(ms). **export하지 않는다** — 값을 밖에서 읽을 수 있으면 그 값을
 * 단정하는 검사가 생기고, 그 순간 세부가 계약이 된다(§3.2 · §12).
 */
const DEFAULT_GRACE_MS = 20_000;

/**
 * 유예 만료로 런을 중단시킬 때 코어에 넘기는 사유. 트랜스크립트에 남는 문면이다.
 *
 * §8이 *"진행 중인 런은 중단되고 그 사실이 트랜스크립트에 남는다"*를 요구하고 §3.2가 그것을
 * 유예의 존재 이유로 든다 — 남기는 것은 우리가 하는 일인데 `SIGKILL`을 맞으면 그 기회를
 * 못 받는다. 사유를 비우면 코어의 기본 문면이 남고, 그것은 사용자가 누른 중단과 구분되지
 * 않는다.
 */
const ABORT_REASON = "서버 종료 유예가 만료되어 런을 중단했다.";

/** 8단계의 문면. **중단된 것이 있을 때만 나간다**(§3.2) */
const ABORTED_NOTICE =
  "진행 중이던 런을 종료 유예 안에 끝내지 못해 중단했다. 그 사실은 트랜스크립트에 남았다.";

/**
 * 개시자. §3.2가 *"프로세스 신호뿐이다"*로 닫은 집합이고 **두 신호를 가르지 않는다** —
 * 아래 리스너는 어느 쪽으로 왔는지 보지 않는다.
 */
export const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM"] as const;

export type ShutdownSignal = (typeof SHUTDOWN_SIGNALS)[number];

// ---------------------------------------------------------------------------
// 포트 — 8단계가 부르는 것만
//
// 실물을 통째로 받지 않는다. 이 파일이 `ServeServer`를 통째로 들면 종료 도중에 `listen()`을
// 부를 수 있게 되고, `StreamHub`를 통째로 들면 종료 도중에 새 스트림을 열 수 있게 된다 —
// 표면이 넓으면 그것을 볼 수 있다는 사실만으로 다음이 여기에 다른 일을 얹는다.
//
// 좁힌 표면에 실물이 실제로 대입되는지는 파일 말미가 컴파일러로 잰다.
// ---------------------------------------------------------------------------

/** 1단계 — 수락 중지. `ServeServer`가 그대로 대입된다 */
export type AcceptGate = {
  /** 리스너를 닫는다. 반환된 Promise는 열려 있던 연결까지 끝난 시점에 resolve한다 */
  close(): Promise<void>;
};

/** 2·6단계 — 고지와 닫기. `StreamHub`가 그대로 대입된다 */
export type ShutdownStreams = {
  /** 2단계. **고지만 하고 아무것도 닫지 않는다**(§3.2) */
  announceShutdown(): void;
  /** 6단계 */
  closeAll(): void;
};

/** 3단계 — 승인 비우기. `ApprovalRegistry`가 그대로 대입된다 */
export type ShutdownApprovals = {
  denyAllForShutdown(): void;
};

/**
 * 4단계와 유예 만료의 중단. 코어의 `Agent`가 그대로 대입된다.
 *
 * `prompt`도 `subscribe`도 안 받는 것이 의도다 — 종료 중에 새 런을 시작할 수 있는 표면이
 * 여기 있으면 1이 막은 문 옆에 두 번째 문이 난다.
 */
export type ShutdownRunControl = {
  /** *"진행 중인 런을 기다린다"*. 대기 수단이므로 던지지 않는다(`CORE-INTERFACE.md` §4) */
  waitForIdle(): Promise<void>;
  /** 유예가 만료됐을 때만 불린다. 사유가 트랜스크립트에 남는다(§8) */
  abort(reason?: string): void;
};

/** 7단계 — 저장소. 동기 `close()`를 가진 실물이 그대로 대입된다 */
export type ShutdownStore = {
  close(): void | Promise<void>;
};

export type ShutdownPorts = {
  readonly server: AcceptGate;
  readonly streams: ShutdownStreams;
  readonly approvals: ShutdownApprovals;
  readonly run: ShutdownRunControl;
  /**
   * 5단계 — 인플라이트 압축 대기. **`waitForIdle()`이 이것을 대신하지 않는다**
   * (`CLI-INTERFACE.md` §2): 자동 압축은 런이 resolve된 **뒤에** 도므로 그동안 코어는 이미
   * idle이고, 기다리지 않으면 7이 압축의 쓰기보다 먼저 간다. 그 손실은 조용하다.
   *
   * 도는 압축이 없으면 즉시 resolve하는 것이 이 포트의 계약이다.
   */
  readonly waitForInFlightCompaction: () => Promise<void>;
  readonly store: ShutdownStore;
  /**
   * 8단계의 표시가 나가는 자리. §3.2가 *"`serve`의 표준 출력은 대개 저널로 간다"*고 적었으므로
   * 이 싱크의 실물은 배선이 고른다.
   */
  readonly notify: (message: string) => void;
  /**
   * 단계가 실패한 사유의 행선지. **선택적이지 않다.**
   *
   * 기본값을 두면 갈래가 둘인데 둘 다 계약을 깬다 — 던지는 기본값은 나머지 단계를 건너뛰고,
   * 삼키는 기본값은 종료가 절반만 돌았다는 사실을 아무 데도 안 남긴다
   * (`ARCHITECTURE.md` §2.6). `stream.ts`가 연결 오류 싱크에 대해 쓴 것과 같은 근거다.
   */
  readonly onStepError: (error: unknown) => void;
};

// ---------------------------------------------------------------------------
// 결과 — §3.2 종료 코드 표
// ---------------------------------------------------------------------------

export type ShutdownOutcome = {
  /**
   * §3.2의 표 그대로다. 순서대로 끝나면 0이고 **유예 만료로 런을 중단시킨 경우를 포함한다** —
   * 그 절이 *"요청받은 종료는 성공했고, 런 중단은 §8이 이미 정상 경로로 정의한 것"*이라
   * 적었다. 순서 자체가 실패하면 1이고, **비영을 값으로 세분하지 않는다.**
   */
  readonly exitCode: 0 | 1;
  /** 유예 만료로 런을 중단시켰는가. 8단계가 이 값으로 갈린다 */
  readonly abortedRun: boolean;
  /** 두 번째 신호가 유예를 앞당겼는가 */
  readonly expedited: boolean;
  /** 실패한 단계의 사유. 비어 있으면 순서가 그대로 돌았다는 뜻이다 */
  readonly failures: readonly unknown[];
};

export type ShutdownOptions = {
  /** 4·5의 유예(ms). 생략하면 위 상수. 유한한 양수여야 한다(§3.2) */
  readonly graceMs?: number;
};

export type ShutdownRun = {
  /** 8단계까지 끝난 시점에 resolve한다. **던지지 않는다** — 실패는 결과가 든다 */
  readonly finished: Promise<ShutdownOutcome>;
  /**
   * 두 번째 신호. *"유예를 즉시 끝낸다. 순서는 건너뛰지 않는다."*(§3.2)
   *
   * 앞당기는 것은 **4·5의 유예 하나**다. 만료 뒤의 중단 정착 대기는 앞당기지 않는다 — 그
   * 대기가 있는 이유가 *"중단 사실이 트랜스크립트에 남은 뒤 6으로 간다"*이고, 그것까지
   * 앞당기면 유예 만료 경로가 지키려던 것(`CORE-INTERFACE.md` §9 불변 조건 2의 완결된 이벤트
   * 시퀀스)을 잃는다. **6·7·8은 그대로 돈다.**
   *
   * 세 번째 이상은 여기로 다시 떨어지고 새 행동을 더하지 않는다 — §3.2가 *"세 번째 이상은
   * 정하지 않는다"*로 그 자리를 OS에 넘겼다.
   */
  expedite(): void;
};

// ---------------------------------------------------------------------------
// 유예 — 하나의 창
// ---------------------------------------------------------------------------

/**
 * 유한한 창 하나. 만료하거나 앞당겨지면 resolve한다.
 *
 * `setTimeout`이 이벤트 루프 위에 사는 것이 이 파일 머리가 적은 한계의 실물이다.
 */
class GraceWindow {
  #timer: ReturnType<typeof setTimeout> | undefined;
  #settle: () => void = () => undefined;
  readonly reached: Promise<void>;

  constructor(ms: number) {
    this.reached = new Promise<void>((resolve) => {
      this.#settle = resolve;
      // 이 타이머는 unref하지 않는다. 종료 도중에 다른 핸들이 전부 빠졌을 때 이것마저
      // 루프를 안 붙들면 프로세스가 6·7·8을 남긴 채 빠져나가고, 그러면 종료 코드를 싣는
      // 자리도 함께 사라진다 — 상한이 지키려던 것을 상한이 없애는 형태다.
      this.#timer = setTimeout(() => {
        this.#timer = undefined;
        resolve();
      }, ms);
    });
  }

  /** 창을 즉시 닫는다. 이미 닫혔으면 아무 일도 없다 */
  expedite(): void {
    this.dispose();
    this.#settle();
  }

  dispose(): void {
    if (this.#timer === undefined) return;
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }
}

/** 창 안에 끝났는가. `expired`는 창이 먼저 닫혔다는 뜻이지 일이 실패했다는 뜻이 아니다 */
type WindowResult = "done" | "expired";

// ---------------------------------------------------------------------------
// 시퀀스 — §3.2의 여덟 단계
// ---------------------------------------------------------------------------

class ShutdownSequence {
  readonly #ports: ShutdownPorts;
  readonly #graceMs: number;
  readonly #failures: unknown[] = [];
  #expedited = false;
  #abortedRun = false;
  /** 지금 열려 있는 창. 두 번째 신호가 이것을 닫는다 */
  #window: GraceWindow | undefined;
  #finished = false;

  constructor(ports: ShutdownPorts, graceMs: number) {
    this.#ports = ports;
    this.#graceMs = graceMs;
  }

  expedite(): void {
    if (this.#finished) return;
    this.#expedited = true;
    this.#window?.expedite();
  }

  async run(): Promise<ShutdownOutcome> {
    // ── 1. 수락 중지 ─────────────────────────────────────────────────────────
    // 부르는 것이 1의 자리다. 완료를 기다리는 자리는 6 뒤이고 머리가 근거를 든다.
    const accepted = this.#beginStopAccepting();

    // ── 2. 종료 고지 ─────────────────────────────────────────────────────────
    // 6과 가른다(§3.2). 붙여 두면 유예가 도는 동안 사용자는 화면이 멈춘 것을 본다.
    this.#sync(() => {
      this.#ports.streams.announceShutdown();
    });

    // ── 3. 승인 비우기 ───────────────────────────────────────────────────────
    // **4보다 앞인 것이 계약이다.** 뒤로 가면 4의 `waitForIdle()`이 6에서 끊길 클라이언트의
    // 답을 기다리고, 풀리는 것은 §7의 만료뿐이라 종료가 만료 시간만큼 지연된다.
    this.#sync(() => {
      this.#ports.approvals.denyAllForShutdown();
    });

    // ── 4·5. 진행 중인 런과 인플라이트 압축 ──────────────────────────────────
    // 유예는 둘의 대기 **전체**에 하나로 걸린다(§3.2).
    const settled = await this.#within(async () => {
      await this.#async(() => this.#ports.run.waitForIdle());
      await this.#async(() => this.#ports.waitForInFlightCompaction());
    });

    if (settled === "expired") {
      // *"상한을 넘으면 런을 중단시키고, 중단 사실이 트랜스크립트에 남은 뒤 6으로 간다.
      // 건너뛰지 않는다."*
      this.#abortedRun = true;
      this.#sync(() => {
        this.#ports.run.abort(ABORT_REASON);
      });
      // 중단이 이벤트 시퀀스를 닫을 시간을 준다(`CORE-INTERFACE.md` §9 불변 조건 2).
      // 이 창은 앞당기지 않는다 — `expedite`의 주석이 근거를 든다.
      const drained = await this.#within(
        async () => {
          await this.#async(() => this.#ports.run.waitForIdle());
        },
        { expeditable: false },
      );
      if (drained === "expired") {
        // 중단마저 정착하지 않았다. 여기서 더 기다리면 systemd의 정지 상한을 넘겨 6·7·8이
        // 통째로 안 도는 쪽이 되므로 계속 가되, 조용히 가지는 않는다(§2.6).
        this.#fail(new Error("런 중단이 유예 안에 정착하지 않아 종료를 계속 진행한다."));
      }
    }

    // ── 6. 스트림 닫기 ───────────────────────────────────────────────────────
    this.#sync(() => {
      this.#ports.streams.closeAll();
    });

    // ── 1의 완료 ─────────────────────────────────────────────────────────────
    // 7 앞에서 기다린다. 이 자리가 *"저장소가 닫힌 뒤 들어온 요청"*을 실제로 없애는 곳이다.
    await this.#finishStopAccepting(accepted);

    // ── 7. 저장소 ────────────────────────────────────────────────────────────
    await this.#async(async () => {
      await this.#ports.store.close();
    });

    // ── 8. 마무리 표시 ───────────────────────────────────────────────────────
    // *"중단된 것이 있으면 그 사실을 남기고"* — 없으면 아무것도 남기지 않는다. CLI가 매번
    // 인사를 남기는 것은 그 자리에 사람이 있기 때문이고 여기는 그렇지 않다(§3.2).
    if (this.#abortedRun) {
      this.#sync(() => {
        this.#ports.notify(ABORTED_NOTICE);
      });
    }

    this.#finished = true;
    this.#window?.dispose();
    this.#window = undefined;

    return {
      exitCode: this.#failures.length === 0 ? 0 : 1,
      abortedRun: this.#abortedRun,
      expedited: this.#expedited,
      failures: [...this.#failures],
    };
  }

  /**
   * 1단계를 개시한다. **리스너는 이 호출로 닫힌다** — 돌아온 Promise가 마저 기다리는 것은
   * 이미 열려 있던 연결이고, 그 대기의 자리는 6 뒤다(머리 참조).
   *
   * 거절을 여기서 바로 받아 두는 것이 의도다 — 나중에 await할 때까지 매달아 두면 그 사이에
   * unhandled rejection이 되고, 그 죽음은 §3.2의 순서를 통째로 건너뛴다.
   */
  #beginStopAccepting(): Promise<void> {
    let closing: Promise<void>;
    try {
      closing = this.#ports.server.close();
    } catch (error) {
      this.#fail(error);
      return Promise.resolve();
    }
    return closing.then(
      () => undefined,
      (error: unknown) => {
        this.#fail(error);
      },
    );
  }

  /**
   * 1의 완료를 7 앞에서 기다린다.
   *
   * **[미규정]** §3.2는 이 대기에 상한을 정하지 않는다. 그래도 무한정 기다리는 갈래를 두지
   * 않았다 — 응답하지 않는 요청 하나가 종료 전체를 붙들면 남는 것은 `SIGKILL`이고, 그 시점은
   * 6이 이미 지나 스트림이 닫힌 뒤라 **저장소만 안 닫힌 채** 죽는다. 그래서 같은 유예를 한 창
   * 더 열고, 만료하면 사유를 남긴 채 7로 간다. 창의 시계는 여기서 시작한다 — 1의 자리에서
   * 열면 4·5가 유예를 다 쓴 것만으로 이 창이 이미 만료된 상태가 된다.
   *
   * **이 창은 앞당기지 않는다.** 앞당기면 두 번째 신호가 1과 7 사이의 순서를 지우는데, 그것은
   * §3.2가 두 번째 신호에 대해 *"순서는 건너뛰지 않는다"*로 못박은 것과 반대 방향이다.
   */
  async #finishStopAccepting(accepted: Promise<void>): Promise<void> {
    const result = await this.#within(
      async () => {
        await accepted;
      },
      { expeditable: false },
    );
    if (result === "expired") {
      this.#fail(new Error("열려 있던 요청이 유예 안에 끝나지 않아 저장소를 먼저 닫는다."));
    }
  }

  /** 창 하나 안에서 일을 기다린다. 일이 던지는 것은 아래 래퍼들이 이미 잡았다 */
  async #within(
    work: () => Promise<void>,
    options: { readonly expeditable?: boolean } = {},
  ): Promise<WindowResult> {
    const window = new GraceWindow(this.#graceMs);
    const expeditable = options.expeditable ?? true;
    if (expeditable) {
      this.#window = window;
      // 두 번째 신호가 이 창이 열리기 **전에** 왔을 수 있다. 그 사실을 잃으면 앞당기기가
      // 조용히 사라진다.
      if (this.#expedited) window.expedite();
    }
    try {
      return await Promise.race<WindowResult>([
        work().then(() => "done" as const),
        window.reached.then(() => "expired" as const),
      ]);
    } finally {
      window.dispose();
      if (expeditable) this.#window = undefined;
    }
  }

  /** 동기 단계 하나. 던지면 사유를 남기고 다음 단계로 간다 */
  #sync(step: () => void): void {
    try {
      step();
    } catch (error) {
      this.#fail(error);
    }
  }

  /** 비동기 단계 하나. 같은 규율이다 */
  async #async(step: () => Promise<void>): Promise<void> {
    try {
      await step();
    } catch (error) {
      this.#fail(error);
    }
  }

  #fail(error: unknown): void {
    this.#failures.push(error);
    try {
      this.#ports.onStepError(error);
    } catch {
      // 싱크마저 던졌다. 여기서 다시 알릴 곳이 없고, 이 예외로 남은 단계를 건너뛰는 것은
      // 이 파일 머리가 막기로 한 바로 그 결과다.
    }
  }
}

/**
 * 종료 시퀀스를 시작한다. **부르는 것은 신호 리스너다** — 와이어에서 이 자리에 닿는 경로가
 * 없다는 것이 §3.2의 판정이고 §6의 메서드 표가 그 기계 판이다.
 */
export function beginShutdown(ports: ShutdownPorts, options: ShutdownOptions = {}): ShutdownRun {
  const graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
  if (!Number.isFinite(graceMs) || graceMs <= 0) {
    throw new Error(
      `종료 유예는 유한한 양수여야 한다 — 받은 값: ${String(graceMs)}. 상한의 존재가 WEB-UI.md §3.2의 계약이다.`,
    );
  }

  const sequence = new ShutdownSequence(ports, graceMs);
  return {
    finished: sequence.run(),
    expedite: () => {
      sequence.expedite();
    },
  };
}

// ---------------------------------------------------------------------------
// 신호 배선 — §3.2
// ---------------------------------------------------------------------------

/**
 * 신호 리스너를 다는 자리. `process`가 그대로 대입된다.
 *
 * 전역을 직접 부르지 않고 포트로 받는 이유는 검사 때문만이 아니다 — 프로세스 전역을 이 파일이
 * 직접 만지면 한 프로세스에 하나뿐인 자원을 여기서 소유하게 되고, 조립이 그것을 되돌릴 수단이
 * 없어진다.
 */
export type SignalHost = {
  on(signal: ShutdownSignal, listener: () => void): unknown;
  off(signal: ShutdownSignal, listener: () => void): unknown;
};

export type ShutdownSignalOptions = ShutdownOptions & {
  /** 생략하면 프로세스 전역 */
  readonly host?: SignalHost;
  /**
   * 종료 코드를 싣는 자리. 생략하면 `process.exitCode`에 싣는다.
   *
   * **`process.exit()`를 부르지 않는다.** 그것은 남은 콜백과 아직 안 빠진 쓰기를 잘라 내므로,
   * 8단계까지 돌아 놓고 마지막에 그 결과를 버리는 형태가 된다. 여기서 코드만 싣고 리스너를
   * 걷으면 루프에 남은 핸들이 없어 프로세스가 스스로 그 코드로 빠져나간다.
   */
  readonly setExitCode?: (code: number) => void;
};

export type ShutdownSignals = {
  /** 신호가 와서 8단계까지 끝난 시점에 resolve한다. 신호 전에는 pending이다 */
  readonly finished: Promise<ShutdownOutcome>;
  /**
   * 신호 리스너를 걷는다. 종료가 끝나면 자동으로 불린다.
   *
   * 걷지 않으면 신호 리스너가 루프를 붙들어 프로세스가 종료 뒤에도 안 빠져나간다.
   */
  dispose(): void;
};

/**
 * `SIGINT`·`SIGTERM`에 종료 시퀀스를 건다. **개시 경로는 이것 하나다**(§3.2).
 *
 * 첫 신호가 시퀀스를 시작하고, 그 뒤의 신호는 전부 앞당기기로 간다 — *"같은 신호가 다시 오면
 * 유예를 즉시 끝낸다"*이고, 두 신호를 가르지 않으므로 다른 신호가 와도 같은 자리다.
 */
export function installShutdownSignals(
  ports: ShutdownPorts,
  options: ShutdownSignalOptions = {},
): ShutdownSignals {
  const host = options.host ?? process;
  const setExitCode =
    options.setExitCode ??
    ((code: number): void => {
      process.exitCode = code;
    });

  let started: ShutdownRun | undefined;
  let disposed = false;
  let settle: (outcome: ShutdownOutcome) => void = () => undefined;
  const finished = new Promise<ShutdownOutcome>((resolve) => {
    settle = resolve;
  });

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    for (const signal of SHUTDOWN_SIGNALS) host.off(signal, onSignal);
  };

  function onSignal(): void {
    if (started !== undefined) {
      // 두 번째 이상. 순서를 건너뛰지 않고 유예만 앞당긴다(§3.2).
      started.expedite();
      return;
    }
    // 옵션을 그대로 넘긴다. 유예 값을 여기서 다시 조립하면 `exactOptionalPropertyTypes`
    // 아래에서 «주지 않았다»가 «undefined를 주었다»로 바뀐다.
    started = beginShutdown(ports, options);
    void started.finished.then((outcome) => {
      setExitCode(outcome.exitCode);
      dispose();
      settle(outcome);
    });
  }

  for (const signal of SHUTDOWN_SIGNALS) host.on(signal, onSignal);

  return { finished, dispose };
}

// ---------------------------------------------------------------------------
// 이음매 대조 — 컴파일 시점에만 존재한다.
//
// 좁혀 받은 포트에 실물이 실제로 대입되는지를 컴파일러가 잰다. `stream.ts` 말미가 응답과
// 개설 표면에 대해 쓴 것과 같은 그물이고, 좁혀 받는 것의 대가를 무르는 자리다.
// ---------------------------------------------------------------------------

type ServeServerFits = ServeServer extends AcceptGate ? true : never;
const _serveServerFits: ServeServerFits = true;
void _serveServerFits;

type StreamHubFits = StreamHub extends ShutdownStreams ? true : never;
const _streamHubFits: StreamHubFits = true;
void _streamHubFits;

type ApprovalRegistryFits = ApprovalRegistry extends ShutdownApprovals ? true : never;
const _approvalRegistryFits: ApprovalRegistryFits = true;
void _approvalRegistryFits;

type SignalHostFits = typeof process extends SignalHost ? true : never;
const _signalHostFits: SignalHostFits = true;
void _signalHostFits;
