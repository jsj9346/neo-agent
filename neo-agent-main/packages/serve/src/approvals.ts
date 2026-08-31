/**
 * 대기 승인 레지스트리 — `docs/WEB-UI.md` §7·§3.2.
 *
 * §7이 이 설계의 유일한 진짜 난점이라 부른 자리이고, 그 절이 답을 셋으로 요약한다.
 * 이 파일은 그 셋을 구조로 이행한다.
 *
 *  1. **코어는 승인을 모른다.** 이 파일은 `@neo-agent/core`에서 아무 승인 타입도
 *     가져오지 않고 코어에 아무것도 더하지 않는다 — 코어 관점에서 사람 승인 대기는
 *     늦게 resolve되는 도구 호출일 뿐이다(§5 규칙 1·3).
 *  2. *"승인은 연결이 아니라 프로세스의 대기 레지스트리에 귀속한다."* 이 파일의 어느
 *     함수도 연결·요청·소켓을 인자로 받지 않는다 — **받을 자리가 없는 것이 그 계약의
 *     기계 판이다.** *"요청을 만든 연결이 사라져도 레코드는 남고, 붙어 있는 아무
 *     클라이언트나 응답할 수 있다."*
 *  3. *"만료의 기본값은 거부이지 허용이 아니다."* 이 파일에서 `decision`이 allow가 되는
 *     경로는 **클라이언트가 답 집합 안의 값으로 명시하게 답한 한 자리뿐**이고, 만료·종료·중단은
 *     전부 deny로 간다. 무응답이 허용으로 읽히는 경로는 존재하지 않는다. **답 집합 밖의 값도
 *     무응답과 같이 취급한다** — 타입이 그 갈래를 막지만 타입 하나에 맡기지 않는 근거는
 *     `settle`이 든다(2026-08-26).
 *
 * ## 게이트 계약을 임포트하지 않고 구현한다
 *
 * `ApprovalPrompt`는 `@neo-agent/gate`의 타입인데 **이 패키지는 그것을 들 수 없다** —
 * §2.2의 예산이 `@neo-agent/core`와 `zod` 둘이고, 그 절이 gate는 배선으로 들어오지
 * 임포트로 들어오지 않는다고 적는다. 그래서 이 파일은 **구조적으로만** 그 계약을 만족한다:
 * 아래 `ApprovalAsk`는 게이트 요청이 가진 필드 중 이 레지스트리가 실제로 읽는 것만 들고
 * (그래서 게이트의 요청 타입이 이쪽에 대입된다), `ApprovalAnswer`는 게이트 응답 셋과 같은
 * 리터럴 유니온이다.
 *
 * **그 대입이 실제로 성립하는지를 재는 자리는 `packages/cli`다** — 조립을 독점하는 쪽만
 * 두 타입을 함께 볼 수 있다. 여기서 그것을 재려면 gate를 임포트해야 하고 그것이 곧 예산
 * 위반이므로, 이 파일이 지는 것은 구조뿐이고 증명은 배선 쪽이 진다.
 *
 * ## 이 레지스트리가 나르지 못하는 것 — 두 자리
 *
 * **[미규정]** 게이트 요청은 `warnings`와 `allowAlwaysKey`를 함께 드는데 §7의
 * `PendingApproval`은 `id`·`display`·`requestedAt`·`expiresAt` 넷으로 닫혀 있어 그 둘을
 * 실을 자리가 없다. `CLI-INTERFACE.md` §9는 *"`warnings`는 `display` 인접에 시각 강조로
 * 표시한다."*를 요구하고 `allowAlwaysKey`가 없으면 항상 허용 선택지를 제공하지 않는 것도
 * 같은 절의 계약인데, 브라우저 쪽 소비자는 오늘 그 둘을 받지 못한다.
 *
 * **그래서 이 파일은 두 필드를 읽되 프레임으로 나르지 않는다.**
 *
 *  - `warnings`는 여기서 **버린다**. `display`에 이어 붙이는 것은 §7이 금한 가공이므로
 *    할 수 없고, `PendingApproval`에 필드를 더하는 것은 정본이 닫은 타입을 넓히는 일이라
 *    이 작업의 권한 밖이다. 손실을 여기 적어 두는 것이 오늘 할 수 있는 전부다.
 *  - `allowAlwaysKey`는 **판정에만 쓴다**. 키가 없는 요청에 항상 허용이 오면 아래
 *    `settle`이 거부한다(fail-closed) — 클라이언트가 알 수 없는 것을 눌렀을 때 조용히
 *    학습되는 것보다 낫다.
 *
 * ## 만료 값은 세부다
 *
 * *"타임아웃 값은 세부다"*이고 계약인 것은 *"유한한 만료가 존재한다는 것"*과 *"만료가
 * 거부라는 것"* 둘뿐이다(§7). 그래서 기본값은 상수로 두되 export하지 않고, 옵션으로
 * 덮어쓸 수 있게 하되 **유한한 양수만 받는다** — 무한·0을 허용하면 계약의 앞 절반이
 * 표현 가능한 상태로 열린다.
 */

import type { Unsubscribe } from "@neo-agent/core";
import type { ApprovalOutcome, PendingApproval } from "./protocol.ts";

/**
 * 응답 셋의 실물. **타입이 이 배열에서 파생하는 것이 요점이다** — 런타임 검사와 타입이 갈릴
 * 수 있는 형태를 아예 만들지 않는다. 넷째가 생기면 여기 한 줄이고, 그 한 줄이 타입과 아래
 * `settle`의 관문에 동시에 반영된다.
 */
const APPROVAL_ANSWERS = ["allow-once", "allow-always", "deny"] as const;

/**
 * 게이트가 돌려받는 응답 셋. **게이트 타입의 사본이 아니라 이 레지스트리가 만들 수 있는
 * 값의 닫힌 집합이다** — 이 유니온이 게이트 쪽보다 좁으면 대입은 여전히 성립하고, 넓어질
 * 수 있는 방향은 배선이 컴파일에서 잡는다.
 */
export type ApprovalAnswer = (typeof APPROVAL_ANSWERS)[number];

/** 위 배열의 조회 형태. `settle`의 런타임 관문이 이것으로 선다 */
const APPROVAL_ANSWER_SET: ReadonlySet<string> = new Set(APPROVAL_ANSWERS);

/**
 * 이 레지스트리가 승인 요청에서 실제로 읽는 필드. 게이트 요청 타입은 이보다 넓으므로
 * 그대로 대입된다.
 *
 * `subject`·`toolName`을 안 받는 것이 의도다 — 판정은 게이트가 이미 끝냈고 여기 남은 일은
 * 사람에게 묻는 것뿐이라, 판정 표면을 다시 들면 이 파일이 그것을 볼 수 있다는 사실만으로
 * 다음이 여기에 판정을 얹는다.
 */
export type ApprovalAsk = {
  /** 게이트가 만든 표시 문면. *"표시 문면은 가공 없이 전달한다."*(§7) */
  readonly display: string;
  /** §9의 경고. 위 머리가 적은 대로 오늘 나를 자리가 없다 */
  readonly warnings?: readonly string[];
  /** 없으면 항상 허용을 제공하지 않는다(`CLI-INTERFACE.md` §9) */
  readonly allowAlwaysKey?: string;
};

/**
 * 레지스트리의 상태 변화. **프레임이 아니다** — §6.1의 `approval_pending`·
 * `approval_settled`로 옮기는 것은 스트림의 일이고, 이 파일은 인코딩을 모른다.
 *
 * 갈래가 둘인 것에 불변 조건이 하나 걸린다: **모든 `settled` 앞에는 같은 `id`의 `pending`이
 * 있었다.** 종료 뒤에 들어온 요청도 그 순서로 나간다 — 즉시 거부되더라도 먼저 나타났다가
 * 접히는 것이 실제로 일어난 일이고, 화면이 그 둘을 짝으로 읽을 수 있어야 한다.
 */
export type ApprovalChange =
  | { readonly kind: "pending"; readonly approval: PendingApproval }
  | { readonly kind: "settled"; readonly id: string; readonly outcome: ApprovalOutcome };

export type ApprovalChangeListener = (change: ApprovalChange) => void;

/**
 * `settle`의 결과. **던지지 않고 닫힌 갈래로 답한다** — 메서드 층(§11)이 이것을 응답
 * 프레임으로 옮기고, 어느 갈래도 조용히 성공으로 읽히지 않는다.
 */
export type SettleResult =
  | { readonly status: "settled"; readonly outcome: ApprovalOutcome }
  /** 그런 id의 대기 승인이 없다 — 이미 접혔거나 애초에 없었다 */
  | { readonly status: "unknown" }
  /** 항상 허용을 제공하지 않는 요청에 항상 허용이 왔다(`CLI-INTERFACE.md` §9) */
  | { readonly status: "always-unavailable" };

export type ApprovalRegistry = {
  /**
   * 게이트의 승인 훅이 부른다. 레코드를 넣고 응답·만료·종료·중단 중 하나까지 기다린다.
   *
   * **abort는 reject다**(`CLI-INTERFACE.md` §9) — 사용자가 거부한 것과 런이 끊긴 것은
   * 다른 사실이고, 취소의 block 변환은 게이트 몫이다. 여기서 deny를 지어내면 그 구분이
   * 트랜스크립트에서 사라진다.
   */
  ask(request: ApprovalAsk, signal: AbortSignal): Promise<ApprovalAnswer>;
  /** 대기 중인 승인 전부. 핸드셰이크 스냅샷(§6.1)이 이것을 싣는다 */
  list(): readonly PendingApproval[];
  /** 붙어 있는 아무 클라이언트나 부를 수 있다(§7) */
  settle(id: string, answer: ApprovalAnswer): SettleResult;
  /** §3.2 순서 3단계 — *"대기 중인 승인을 전부 거부로 settle한다"* */
  denyAllForShutdown(): void;
  subscribe(listener: ApprovalChangeListener): Unsubscribe;
};

export type ApprovalRegistryOptions = {
  /**
   * 만료까지의 시간(ms). 값은 세부이고 계약은 유한한 만료의 존재다(§7).
   * 유한한 양수가 아니면 생성에서 던진다.
   */
  readonly timeoutMs?: number;
  /** 시계 주입. 기본은 `Date.now` */
  readonly now?: () => number;
  /**
   * 구독자가 던진 예외의 행선지. **선택적이지 않다.**
   *
   * 선택적으로 두면 기본값 갈래가 둘뿐인데 **둘 다 계약을 깬다.** 던지면 그 예외가
   * 만료 타이머 콜백 밖으로 나가는 uncaught가 되어 `serve` 프로세스를 통째로 죽이는데,
   * 그것은 §3.2가 정한 어느 종료 경로도 아니다. 삼키면 `ARCHITECTURE.md` §2.6의 침묵
   * 실패다 — 화면은 `pending`을 받아 놓고 `settled`를 못 받은 채 남는다(§6.1이
   * `approval_settled` 갈래를 만든 이유가 그것이다).
   *
   * 그래서 자리를 비워 둘 수 없게 한다. `stream.ts`의 `onConnectionError`,
   * `methods.ts`의 `onRunError`가 같은 근거로 같은 자리에 서 있다.
   */
  readonly onSubscriberError: (error: unknown) => void;
};

/**
 * 기본 만료. **export하지 않는다** — 값을 밖에서 읽을 수 있으면 그 값을 단정하는 검사가
 * 생기고, 그 순간 세부가 계약이 된다(§7).
 */
const DEFAULT_TIMEOUT_MS = 5 * 60_000;

type PendingRecord = {
  readonly approval: PendingApproval;
  readonly allowAlways: boolean;
  readonly resolve: (answer: ApprovalAnswer) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
  readonly detachAbort: () => void;
};

class Registry implements ApprovalRegistry {
  readonly #pending = new Map<string, PendingRecord>();
  readonly #listeners = new Set<ApprovalChangeListener>();
  readonly #timeoutMs: number;
  readonly #now: () => number;
  readonly #onSubscriberError: (error: unknown) => void;

  /** 종료가 시작된 뒤인가. §3.2 3단계 이후에 온 요청이 만료까지 기다리지 않게 한다 */
  #closed = false;

  constructor(options: ApprovalRegistryOptions) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error(
        `승인 만료는 유한한 양수여야 한다 — 받은 값: ${String(timeoutMs)}. 유한한 만료의 존재가 WEB-UI.md §7의 계약이다.`,
      );
    }
    this.#timeoutMs = timeoutMs;
    this.#now = options.now ?? Date.now;
    this.#onSubscriberError = options.onSubscriberError;
  }

  ask(request: ApprovalAsk, signal: AbortSignal): Promise<ApprovalAnswer> {
    if (signal.aborted) {
      // 레코드를 만들기 전에 끝낸다 — 만들면 아무도 못 볼 대기가 목록에 잠깐 나타난다.
      return Promise.reject(new Error("승인 프롬프트가 중단으로 취소됐다."));
    }

    const requestedAt = this.#now();

    // *"`id`는 추측 불가여야 한다"*(§7 · 2026-08-30 확정 — §4.1 결정 8이 낳았다). 근거는 이
    // 절 자신이 든다: 승인을 연결이 아니라 프로세스에 귀속시켰고 *"그 귀속의 손잡이가 `id`
    // 하나"*라서, 값이 순번이면 그 손잡이를 아무나 짚어 귀속이 무의미해진다. 「항상 허용」이
    // 그 왕복의 답 중 하나라는 것이 대가를 비대칭으로 만든다 — *"한 번 맞히면 권한 게이트가
    // 통째로 걷힌다"*.
    //
    // **수단은 §2.2의 예산 밖이 아니다.** `crypto.randomUUID()`는 Node의 Web Crypto 전역이라
    // 임포트가 없고, *"§2.2의 허용 내장 넷은 임포트를 재는 목록이다"*(§7). 이 파일의 임포트
    // 줄은 그대로 둘이고 `node:crypto`는 여기 없다.
    //
    // **도구 호출 id를 쓰지 않는 근거는 그대로 살아 있다** — 그것은 모델이 만든 값이라
    // 유일성을 우리가 보증하지 못한다. 순번이 죽었다고 이 문장이 함께 죽지 않는다.
    //
    // **접두 `approval-`을 걷는다.** *"어떤 표기인가는 §12의 세부이고, 계약인 것은 추측
    // 불가라는 성질과 프로세스 안 유일성 둘이다."*(§7) — 접두는 그 둘 어느 쪽도 나르지
    // 않으면서 구조처럼 보여 짚을 것을 준다(옛 표기가 실제로 테스트의 `"approval-1"` 리터럴을
    // 낳았다). `packages/store`의 세션 id가 같은 이유로 맨 UUID이고, `packages/web`이 접두를
    // 다는 것은 그 값이 HTML 본문이라는 남의 이름 공간에 들어가기 때문이다 — 이 id는 아래
    // `#pending` 하나만 산다.
    //
    // 프로세스 안 유일성을 순번은 구조로 줬고 여기서는 CSPRNG의 122비트가 준다. 충돌 회피
    // 루프를 두지 않는 것은 그 갈래가 도달 불가라 재는 검사를 쓸 수 없는 죽은 코드이기
    // 때문이다.
    const id = crypto.randomUUID();

    const approval: PendingApproval = {
      id,
      // 자르지도 정규화하지도 재포맷하지도 않는다. 게이트의 위조 탐지가 만든 문자열이라
      // 한 바이트라도 손대면 그 탐지가 무의미해진다(`CLI-INTERFACE.md` §9).
      display: request.display,
      requestedAt,
      expiresAt: requestedAt + this.#timeoutMs,
    };

    return new Promise<ApprovalAnswer>((resolve, reject) => {
      const onAbort = (): void => {
        const record = this.#take(id);
        if (record === undefined) return;
        record.reject(new Error("승인 프롬프트가 중단으로 취소됐다."));
        // **[미규정]** 중단은 §6.1의 `resolvedBy` 셋 어디에도 없다. 그럼에도 화면에
        // 알리는 쪽을 골랐다 — 안 알리면 다른 탭의 프롬프트가 답할 수 없는 채로 남고,
        // 그 상태는 `ARCHITECTURE.md` §2.6이 금한 결과다. 값은 client로 둔다: `serve`에서
        // 런을 끊는 것은 §11의 중단 메서드이므로 클라이언트가 사유인 것이 사실이고,
        // deny인 것은 게이트가 취소를 block으로 옮기기 때문이다. 이 접힘이 나르지 못하는
        // 것은 거부와 중단의 구분이며, 그것을 살리려면 §6.1의 유니온을 넓혀야 한다.
        this.#notify({
          kind: "settled",
          id,
          outcome: { decision: "deny", resolvedBy: "client" },
        });
      };

      const timer = setTimeout(() => {
        const record = this.#take(id);
        if (record === undefined) return;
        // 만료가 곧 거부다. 여기서 allow를 만드는 갈래는 없다(§7).
        const outcome: ApprovalOutcome = { decision: "deny", resolvedBy: "timeout" };
        record.resolve("deny");
        this.#notify({ kind: "settled", id, outcome });
      }, this.#timeoutMs);

      signal.addEventListener("abort", onAbort, { once: true });

      this.#pending.set(id, {
        approval,
        allowAlways: request.allowAlwaysKey !== undefined,
        resolve,
        reject,
        timer,
        detachAbort: () => {
          signal.removeEventListener("abort", onAbort);
        },
      });

      if (!this.#notify({ kind: "pending", approval })) {
        // 구독자가 던지면 레코드를 남기지 않는다 — 남기면 아무도 모르는 대기가 만료까지
        // 살아 종료를 늦춘다(§3.2가 3을 4보다 앞에 둔 이유와 같은 손실이다).
        //
        // **그러나 조용히 지우지도 않는다.** 이 방출은 부분 전달이다 — 던진 구독자 앞뒤로
        // 성한 구독자들이 `pending`을 이미 받았고, 그들에게 `settled`가 안 가면 화면에
        // 답할 수 없는 프롬프트가 남는다. 그것이 §6.1이 `approval_settled` 갈래를 만들며
        // 든 손실이고 `ARCHITECTURE.md` §2.6이 금한 결과다. 접히는 것을 알리는 것이 이
        // 레지스트리가 접기로 한 판정과 같은 값으로 사는 유일한 방법이다.
        //
        // **게이트에는 거부로 답한다. 던지지 않는다.** 여기서 reject하면 이 Promise를
        // 안 기다리는 호출자에게서 unhandled rejection이 되는데, 이 실패는 런이 끊긴
        // 사실(`CLI-INTERFACE.md` §9의 abort)이 아니라 고지가 깨진 사실이라 그 시끄러운
        // 갈래를 쓸 이유가 없다. 사유는 이미 싱크로 갔고, 사용자에게 «막혔다»가 닿는 것이
        // §7의 fail-closed 그대로다 — 종료 갈래가 바로 이 형태로 접는다.
        //
        // **[미규정]** 부분 전달 실패는 §6.1의 `resolvedBy` 셋 어디에도 없다. 위 abort
        // 갈래와 같은 자리이고 같은 값을 고른다 — 사유를 만든 것이 붙어 있던 구독자,
        // 즉 클라이언트 쪽 전송이므로 client가 셋 중 가장 덜 틀리다. 이 접힘이 나르지
        // 못하는 것은 «전달이 깨져서 접혔다»는 사실이고, 그것을 살리려면 §6.1의 유니온을
        // 넓혀야 한다.
        this.#settle(id, { decision: "deny", resolvedBy: "client" }, "deny");
        return;
      }

      if (this.#closed) {
        // 종료가 이미 3단계를 지난 뒤에 온 요청이다. 만료까지 기다리게 두면 §3.2가
        // 3을 4보다 앞에 두어 막으려던 것 — *"종료가 만료 시간만큼 지연된다."* — 이
        // 그대로 일어난다. 그래서 같은 사유로 즉시 접는다.
        this.#settle(id, { decision: "deny", resolvedBy: "shutdown" }, "deny");
      }
    });
  }

  list(): readonly PendingApproval[] {
    return [...this.#pending.values()].map((record) => record.approval);
  }

  settle(id: string, answer: ApprovalAnswer): SettleResult {
    const record = this.#pending.get(id);
    if (record === undefined) return { status: "unknown" };
    // **답 집합 밖의 값은 거부다**(§7 — *"무응답이 허용으로 읽히는 경로는 존재하지 않는다."*).
    //
    // 타입은 이 갈래를 표현 불가능하게 만들지만 타입 하나에 맡기지 않는다: 이 메서드는 배럴이
    // 공개하는 표면 위에 있고(`index.ts`), 이 레포는 같은 형태의 자리에서 이미 반대로 한다 —
    // `server.ts`의 바인드 호스트는 타입을 우회해 들어온 값을 생성에서 던지고 그 근거로
    // *"컴파일러 하나에 맡기면 계약이 소스 언어에 의존하게 된다"*를 들며, `protocol.ts`는 밖에서
    // 온 바이트에 런타임 층을 다시 건다. 그 규율에서 이 자리만 빠져 있었고, 빠진 결과가
    // «deny가 아닌 것은 전부 allow»였다(2026-08-26 QA U-1).
    //
    // **모르는 답을 `unknown`으로 돌려보내지 않는다.** 그러면 레코드가 만료까지 살아 남아
    // 그동안 화면에는 답할 수 없는 프롬프트가 남고, 그것이 §3.2가 3을 4보다 앞에 두어 막으려던
    // 손실과 같은 형태다. 접는 쪽이 fail-closed이고 사용자에게도 가시적이다.
    if (!APPROVAL_ANSWER_SET.has(answer)) {
      const outcome: ApprovalOutcome = { decision: "deny", resolvedBy: "client" };
      this.#settle(id, outcome, "deny");
      return { status: "settled", outcome };
    }
    if (answer === "allow-always" && !record.allowAlways) {
      // 제공하지 않은 선택지가 눌렸다. 항상 허용을 한 번 허용으로 낮춰 통과시키면 사용자가
      // 누른 것과 다른 일이 일어나고, 그대로 학습시키면 게이트가 닫아 둔 문이 열린다.
      return { status: "always-unavailable" };
    }
    const outcome: ApprovalOutcome = {
      decision: answer === "deny" ? "deny" : "allow",
      resolvedBy: "client",
    };
    this.#settle(id, outcome, answer);
    return { status: "settled", outcome };
  }

  denyAllForShutdown(): void {
    // 이 자리가 §3.2 순서의 3단계다. **자체 만료를 기다리지 않는다** — 4단계의
    // `waitForIdle()`이 6단계에서 끊길 클라이언트의 답을 기다리게 되기 때문이다.
    this.#closed = true;
    for (const id of [...this.#pending.keys()]) {
      // 종료를 timeout으로 접지 않는 이유는 §2.6이다 — 아무도 답하지 않은 것과 서버가
      // 내려간 것은 사용자의 다음 행동이 다르다(§3.2).
      //
      // **이 루프는 구독자 사정으로 끊기지 않는다.** 한 건의 구독자 예외가 나머지 대기를
      // 안 비우면 그 대기들은 영영 접히지 않는데, 예외의 행선지가 필수 싱크가 된 지금
      // `#settle`이 던지는 갈래 자체가 표현되지 않는다 — 모아서 전파하던 층이 그래서 없다.
      this.#settle(id, { decision: "deny", resolvedBy: "shutdown" }, "deny");
    }
  }

  subscribe(listener: ApprovalChangeListener): Unsubscribe {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** 레코드를 꺼내며 타이머·abort 구독을 함께 걷는다. 없으면 undefined — 두 번 접히지 않는다 */
  #take(id: string): PendingRecord | undefined {
    const record = this.#pending.get(id);
    if (record === undefined) return undefined;
    this.#pending.delete(id);
    clearTimeout(record.timer);
    record.detachAbort();
    return record;
  }

  /**
   * 접는 순서가 계약이다: **상태를 먼저 바꾸고, 기다리던 쪽을 풀고, 그다음 알린다.**
   * 구독자가 던져도 레지스트리와 게이트 쪽은 이미 정합이다.
   */
  #settle(id: string, outcome: ApprovalOutcome, answer: ApprovalAnswer): void {
    const record = this.#take(id);
    if (record === undefined) return;
    record.resolve(answer);
    this.#notify({ kind: "settled", id, outcome });
  }

  /**
   * 변화를 구독자 전원에게 전달한다. **던지지 않는다** — 싱크가 필수이므로 예외의 행선지가
   * 항상 있고, 방출이 위로 던지면 그 예외가 만료 타이머 콜백 밖으로 나가는 uncaught가 된다.
   *
   * 돌려주는 것은 **전원에게 닿았는가**다. 이 값이 있어야 부분 전달을 부르는 쪽이
   * 알 수 있고, 몰라도 되게 두면 «성한 구독자는 pending을 받았는데 아무도 그 사실을
   * 모른다»가 된다(위 `ask`가 그 갈래를 소비한다).
   */
  #notify(change: ApprovalChange): boolean {
    let delivered = true;
    for (const listener of [...this.#listeners]) {
      if (!this.#listeners.has(listener)) continue;
      try {
        listener(change);
      } catch (error) {
        // 한 구독자의 실패가 나머지 전달을 막지 않는다 — 코어 이미터와 같은 처방이다.
        delivered = false;
        this.#onSubscriberError(error);
      }
    }
    return delivered;
  }
}

/**
 * 대기 승인 레지스트리를 만든다.
 *
 * **프로세스에 하나다.** 연결마다 만들면 §7이 승인을 프로세스에 귀속시켜 얻으려던 것이
 * 연결 수명에 다시 묶인다 — 그 배선을 소유하는 자리는 `packages/cli`다.
 *
 * **인자를 생략할 수 없다.** `onSubscriberError`가 필수이기 때문이고, 기본 인자를 남겨
 * 두면 그 필수가 «부르는 쪽이 아무것도 안 줘도 되는 것»으로 되돌아간다.
 */
export function createApprovalRegistry(options: ApprovalRegistryOptions): ApprovalRegistry {
  return new Registry(options);
}
