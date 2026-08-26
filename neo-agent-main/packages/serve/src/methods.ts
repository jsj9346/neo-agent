/**
 * 메서드 표 — `docs/WEB-UI.md` §11·§12·§6·§3.2.
 *
 * 이 파일이 지는 것은 **셋**이다. 요청 프레임의 `method`를 처리기로 옮기는 표(§12), 그 표에
 * 없는 이름의 처분(§11), 그리고 잘린 트랜스크립트의 앞부분을 주는 세션 조회(§6.1)다.
 * 프레임 셋은 `protocol.ts`가, 바이트 변환은 `codec.ts`가, 승인 레지스트리는 `approvals.ts`가
 * 진다 — 이 파일은 그 셋을 **부르는 자리**다.
 *
 * ## 표에 없으면 거부다 (§11)
 *
 * §11이 미분류 메서드 기본 거부를 채택하며 *"메서드 표에 없으면 거부이고, 등록을 빠뜨리면
 * 열리는 것이 아니라 닫힌다"*고 적었다. 아래 표는 `Record<MethodName, ...>`로 만들어지므로
 * 이름 하나를 빠뜨리면 컴파일이 깨지고, 표에 없는 이름이 들어오면 조회가 `undefined`를 내
 * 거부로 간다. **열림이 기본값이 되는 경로가 없다** — 처리기를 못 찾은 자리에서 요청이
 * 통과하는 갈래가 아예 표현되지 않는다.
 *
 * ## 종료는 이 표에 오르지 않는다 (§3.2)
 *
 * *"서버를 내리는 메서드를 두지 않는다."* 그리고 그것은 §11의 기본 거부가 자동으로
 * 처리하는 것이 아니라 §3.2가 명시적으로 내린 판정이다 — *"종료는 그 표에 오르지 않는다"*
 * (§12 — 미결이 아니라 판정이다). 근거 셋을 그 절이 든다: ① §4가 루프백으로 닫아 인증을
 * 설계하지 않았으므로 누가 이것을 누를 수 있는가를 판정할 수단이 없고 ② §10이 수명을
 * systemd에 맡겼는데 프로세스가 스스로를 내리는 경로를 열면 그 소유가 갈리며 ③ §11이 이미
 * 재시작 관리를 안 하기로 했다. 종료의 개시자는 프로세스 신호뿐이다.
 *
 * **그래서 이 파일에 종료 경로가 없는 것은 누락이 아니라 계약이다.** 적지 않으면 다음이
 * 표를 채우다가 그 자리를 빈칸으로 읽는다.
 *
 * ## 이름의 점은 권한 축이 아니다 (§11)
 *
 * 아래 이름들이 `run.`·`approval.`·`session.` 접두를 갖는 것은 **묶어 읽기 위한 표기일
 * 뿐**이고 스코프가 아니다. §11이 역할·스코프 체계를 배제하며 *"스코프가 전부 최고 권한으로
 * 수렴한다"*고 적었으므로, 이 접두에 권한을 매다는 코드가 생기면 그것이 그 판정을 되돌리는
 * 자리다. 표에 있는가 없는가가 이 층의 유일한 판정이다.
 *
 * ## 이 파일이 아는 표면과 모르는 표면
 *
 * 코어·게이트·저장소를 **통째로 받지 않는다.** 아래 셋은 이 표가 실제로 부르는 것만 든
 * 좁은 포트이고, 코어 인스턴스와 승인 레지스트리가 그대로 대입된다. `packages/serve`의 예산은
 * `@neo-agent/core`와 `zod` 둘이라(§2.2) 저장소는 임포트로 들어올 수 없고, 그래서 트랜스크립트
 * 판독기가 포트인 것은 취향이 아니라 예산의 귀결이다.
 *
 * **HTTP를 모른다.** 이 파일이 받는 것은 `RequestFrame`이고 내는 것은 `ResponseFrame`이다 —
 * POST 본문을 읽어 프레임으로 만드는 것은 `codec.ts`의 `decodeRequest`이고, 그것을 부르고
 * 응답을 실어 보내는 것은 서버 배선의 몫이다. 그 선이 §5 규칙 4를 이 파일에서 참으로 만든다.
 */

import type { AgentMessage, UserMessageInput } from "@neo-agent/core";
import { z } from "zod";
import type { ApprovalAnswer, SettleResult } from "./approvals.ts";
import type { ApprovalOutcome, RequestFrame, ResponseFrame, TranscriptWindow } from "./protocol.ts";

// ---------------------------------------------------------------------------
// 오류 코드 — §6
//
// `codec.ts`가 세운 가름을 그대로 잇는다: 그 층은 자기가 내는 하나(`invalid_request`)만
// 이름 붙이고 어휘를 열지 않았고, 여기서부터는 메서드 층의 어휘다. §6은 `error`가 `code`와
// `message`를 든다고만 정하고 어휘를 정하지 않으므로, 아래 일곱은 이 층이 실제로 낼 수 있는
// 갈래를 하나도 빠짐없이 이름 붙인 것이다 — 이름 없는 실패가 남으면 그 자리가 조용해진다
// (`ARCHITECTURE.md` §2.6).
// ---------------------------------------------------------------------------

/** 표에 없는 이름(§11). **이것이 기본값이다** */
export const UNKNOWN_METHOD = "unknown_method";
/** 인자가 그 메서드의 스키마를 어겼다(§6 — 검증은 각 메서드가 진다) */
export const INVALID_PARAMS = "invalid_params";
/** 이미 활성 런이 있어 새 프롬프트를 시작할 수 없다(`CORE-INTERFACE.md` §4 불변 조건 7) */
export const RUN_ACTIVE = "run_active";
/** 개입할 활성 런이 없거나 그 런이 닫히는 중이다(같은 불변 조건) */
export const RUN_IDLE = "run_idle";
/** 그런 id의 대기 승인이 없다 — 이미 접혔거나 애초에 없었다(§7) */
export const APPROVAL_UNKNOWN = "approval_unknown";
/** 항상 허용을 제공하지 않는 요청에 항상 허용이 왔다(`CLI-INTERFACE.md` §9) */
export const APPROVAL_ALWAYS_UNAVAILABLE = "approval_always_unavailable";
/** 세션 조회가 받은 기준 메시지가 트랜스크립트에 없다 */
export const UNKNOWN_MESSAGE = "unknown_message";
/**
 * 처리기가 예상 밖으로 던졌다.
 *
 * 이 코드가 나가는 것은 **버그**이고 그래서 문면을 감추지 않는다. 잡지 않으면 요청 하나에
 * 응답이 하나라는 §6의 계약이 그 요청에서만 깨지고, 클라이언트 쪽에서 그것은 «아무 일도
 * 일어나지 않음»과 구분되지 않는다 — 잡아서 이름 붙이는 쪽이 §2.6이다.
 */
export const HANDLER_FAILED = "handler_failed";

// ---------------------------------------------------------------------------
// 표의 이름 — §12
// ---------------------------------------------------------------------------

/**
 * 메서드 표의 초기 목록. §12가 최소 집합을 다섯으로 들었고 이 배열이 그 다섯이다 —
 * 프롬프트 제출·중단·개입·승인 응답·세션 조회.
 *
 * **이 배열이 이름의 유일한 자리다.** 아래 처리기 맵이 `Record<MethodName, …>`이므로 여기에
 * 이름을 더하면 처리기를 쓸 때까지 컴파일이 깨지고, 처리기만 쓰면 이 배열에 없어 표에 안
 * 오른다. 두 자리가 갈리는 상태가 표현되지 않는다.
 */
export const METHOD_NAMES = [
  "run.prompt",
  "run.steer",
  "run.abort",
  "approval.settle",
  "session.history",
] as const;

export type MethodName = (typeof METHOD_NAMES)[number];

// ---------------------------------------------------------------------------
// 트랜스크립트 창 — §6.1
//
// §6.1이 스냅샷에 **꼬리 N** 상한을 걸고 *"생략된 앞부분은 §12의 메서드 표가 든 세션 조회가
// 준다."*로 그 앞부분의 자리를 이 파일에 넘겼다. 그래서 상한을 재는 함수가 여기 산다.
//
// **N은 상수 하나여야 한다.** 핸드셰이크 스냅샷을 뜨는 쪽과 조회가 서로 다른 N을 쓰면
// «스냅샷이 든 `omitted`»와 «조회가 실제로 돌려주는 수»가 갈리고, 그 갈림은 화면에서
// 조용하다. 그래서 상수를 export하지 않고 **함수를 export한다** — 스냅샷 쪽은 아래
// `takeTailWindow`를 부르지 자기 상수를 두지 않는다. 값을 안 내보내므로 그 값을 단정하는
// 검사도 생기지 않는다(§12 — 값은 세부다. `approvals.ts`가 만료에 대해 쓴 것과 같은 수단).
// ---------------------------------------------------------------------------

/**
 * 꼬리 N. **export하지 않는다.** 계약인 것은 *"상한이 존재한다"*와 잘림의 표현 둘뿐이고
 * 값은 §12의 수치 항이 든 세부다.
 */
const TRANSCRIPT_WINDOW_LIMIT = 200;

/**
 * 트랜스크립트의 꼬리를 창으로 만든다. 핸드셰이크 스냅샷(§6.1)이 이것을 부른다.
 *
 * 잘림이 값에 나타나는 것이 §6.1의 계약 절반이다 — 잘렸으면 `omitted`가 **실제 생략 수**이고
 * 온전하면 그 필드가 아예 없다. 옵셔널 필드나 감시값으로 접지 않는다.
 */
export const takeTailWindow = (
  messages: readonly AgentMessage[],
  limit: number = TRANSCRIPT_WINDOW_LIMIT,
): TranscriptWindow => {
  if (messages.length <= limit) return { complete: true, messages };
  return {
    complete: false,
    messages: messages.slice(messages.length - limit),
    omitted: messages.length - limit,
  };
};

/** `takeWindowBefore`의 결과. 못 찾은 것과 빈 창을 가른다 — 둘 다 «메시지 0건»이기 때문이다 */
export type WindowLookup =
  | { readonly found: true; readonly window: TranscriptWindow }
  | { readonly found: false };

/**
 * 기준 메시지 **앞**의 창을 낸다. 세션 조회가 이것을 부른다.
 *
 * 인자가 «어디부터 거슬러 올라가는가»인 것은 §6.1의 흔적을 이행한 형태다 — 그 절이
 * *"더 오래된 히스토리를 같은 메서드에 파라미터로"*를 성질만 가져오고 자리를 §12의 메서드
 * 표로 넘겼다. 창이 다시 `TranscriptWindow`이므로 앞이 더 남았으면 `complete: false`가 되고,
 * 클라이언트는 같은 메서드를 한 번 더 불러 계속 거슬러 올라간다. **별도 엔드포인트가 늘지
 * 않는다.**
 *
 * **`limit`을 요청이 주지 않는다.** §6.1이 *"상한을 요청 파라미터로 받지 않는다."*를 정했고,
 * 이 인자는 그 상한을 재는 순수 함수의 인자이지 요청의 자리가 아니다 — 아래 처리기는 기본값을
 * 그대로 쓰고 요청에서 온 값을 여기 넘기는 경로가 없다.
 */
export const takeWindowBefore = (
  messages: readonly AgentMessage[],
  beforeId: string,
  limit: number = TRANSCRIPT_WINDOW_LIMIT,
): WindowLookup => {
  const index = messages.findIndex((message) => message.id === beforeId);
  // 못 찾은 것을 빈 창으로 접지 않는다. 접으면 클라이언트가 «앞이 없다»로 읽고 거슬러
  // 올라가기를 멈추는데, 실제로는 잘못된 기준을 보낸 것이다(`ARCHITECTURE.md` §2.6).
  if (index < 0) return { found: false };
  return { found: true, window: takeTailWindow(messages.slice(0, index), limit) };
};

// ---------------------------------------------------------------------------
// 포트 — 이 표가 부르는 것만
// ---------------------------------------------------------------------------

/**
 * 런 제어. `Agent`가 그대로 대입된다.
 *
 * `Agent`를 통째로 받지 않는 것이 §5 규칙 2와 같은 근거다 — 이 타입에는 구독도 상태 읽기도
 * 없고, 이 표가 실제로 부르는 셋뿐이다.
 */
export type RunControl = {
  /**
   * 새 런을 시작한다. **반환된 Promise는 런 전체의 수명이다** — 이 표는 그것을 기다리지
   * 않는다(아래 처리기의 주석이 근거를 든다).
   */
  prompt(text: string): Promise<void>;
  /** 진행 중인 런에 끼어든다 */
  steer(message: UserMessageInput): void;
  /** 활성 런 중단 + 큐 비움 */
  abort(reason?: string): void;
};

/** 승인 응답. `ApprovalRegistry`가 그대로 대입된다 — `settle` 하나만 본다(§7) */
export type ApprovalResponder = {
  settle(id: string, answer: ApprovalAnswer): SettleResult;
};

/**
 * 세션 조회가 읽는 원본.
 *
 * §6.1이 *"조회가 읽는 것은 버퍼가 아니라"* 저장소가 이미 영속한 것이라고 적었고, 그래서
 * 이 포트가 가리켜야 할 곳은 저장소다. 그 배선은 `packages/cli`가 소유한다 — §2.2의 예산이
 * `@neo-agent/core`와 `zod` 둘이라 이 패키지가 저장소를 임포트할 수 없기 때문이다.
 *
 * **[미규정]** §6.1은 조회의 원본을 저장소로 적었으나, 이 포트가 코어의 인메모리
 * 트랜스크립트를 가리켜도 타입은 성립한다. 어느 쪽을 물리느냐는 배선의 판정이고 이 파일이
 * 강제할 수단이 없다 — 강제하려면 저장소 타입을 임포트해야 하고 그것이 곧 예산 위반이다.
 */
export type TranscriptReader = {
  /** 세션의 트랜스크립트 전부를 오래된 것부터 */
  read(): Promise<readonly AgentMessage[]>;
};

export type MethodDeps = {
  readonly run: RunControl;
  readonly approvals: ApprovalResponder;
  readonly transcript: TranscriptReader;
  /**
   * 런이 실패로 끝났을 때. **선택적이지 않다.**
   *
   * `run.prompt`는 런을 기다리지 않으므로(§8) 그 Promise의 거절을 받을 자리가 이 표 안에
   * 없다. 자리를 안 두면 거절이 unhandled rejection이 되어 `serve` 프로세스가 통째로
   * 죽는데, 그것은 §3.2가 정한 어느 종료 경로도 아니다 — 6·7·8이 통째로 안 돈다.
   * 선택적으로 두면 배선이 잊을 수 있고, 잊은 자리는 첫 실패 런에서만 드러난다.
   */
  readonly onRunError: (error: unknown) => void;
};

// ---------------------------------------------------------------------------
// 처리기 — §6·§7·§8
// ---------------------------------------------------------------------------

/**
 * 처리기의 결과. `ResponseFrame`이 아니라 그 **속**이다 — `type`·`id`는 아래 디스패처가
 * 붙인다. 처리기가 프레임을 통째로 만들면 요청 id를 자기 손으로 옮겨야 하고, 그 자리가
 * 처리기 수만큼 늘어나면 언젠가 하나가 짝을 잘못 붙인다.
 */
export type MethodResult =
  | { readonly ok: true; readonly payload?: unknown }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } };

export type MethodHandler = (params: unknown) => Promise<MethodResult>;

/**
 * 이름 → 처리기. **`Map`인 것에 이유가 있다** — 객체로 두면 `__proto__`·`constructor` 같은
 * 이름이 조회에서 상속 속성을 맞혀 표에 없는 이름이 처리기를 얻는다. `Map`은 자기가 담은
 * 키만 안다.
 */
export type MethodTable = ReadonlyMap<string, MethodHandler>;

const failure = (code: string, message: string): MethodResult => ({
  ok: false,
  error: { code, message },
});

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** 프롬프트·개입이 나르는 것은 오늘 텍스트 하나다 */
const textParams = z.strictObject({
  /**
   * **[미규정]** §12는 인자를 구현에 넘겼고 코어의 `UserMessageInput`은 이미지·다중 블록을
   * 표현할 수 있다. 오늘은 텍스트 하나만 받는다 — 화면이 아직 없어 다른 블록을 만들 소비자가
   * 없고, 나중에 넓히는 것은 받는 값의 집합을 키우는 방향이라 이미 보내던 요청을 깨지 않는다.
   *
   * 빈 문자열을 거부하는 것도 같은 방향이다. 빈 프롬프트로 시작된 런은 모델에 아무것도 묻지
   * 않은 채 돌고, 그 결과는 화면에서 «아무 일도 없었다»와 구분되지 않는다.
   */
  text: z.string().min(1),
});

const abortParams = z.strictObject({
  /** 중단 사유. 없으면 코어의 기본 문면이 트랜스크립트에 남는다 */
  reason: z.string().optional(),
});

/**
 * 승인 응답의 셋. `approvals.ts`의 `ApprovalAnswer`와 **같은 집합이어야 하고**, 아래 대조가
 * 그것을 컴파일 시점에 잰다 — 한쪽만 넓히면 여기서 깨진다.
 */
const approvalAnswerSchema = z.enum(["allow-once", "allow-always", "deny"]);

type AnswerSchemaMatchesPort =
  z.infer<typeof approvalAnswerSchema> extends ApprovalAnswer
    ? ApprovalAnswer extends z.infer<typeof approvalAnswerSchema>
      ? true
      : never
    : never;
const _answerSchemaMatchesPort: AnswerSchemaMatchesPort = true;
void _answerSchemaMatchesPort;

const settleParams = z.strictObject({
  id: z.string(),
  answer: approvalAnswerSchema,
});

const historyParams = z.strictObject({
  /**
   * 클라이언트가 든 가장 오래된 메시지의 id. 그 **앞**의 창이 돌아온다.
   *
   * 상한을 안 받는 것이 §6.1이다. 기준을 옵셔널로 두어 «없으면 꼬리»로 폴백하지도 않는다 —
   * 그 폴백은 핸드셰이크 스냅샷과 같은 값을 다른 문으로 내는 것이고, 값이 갈리기 시작하면
   * 어느 쪽이 참인지 화면이 판정할 수 없다.
   */
  before: z.string(),
});

const buildHandlers = (deps: MethodDeps): Readonly<Record<MethodName, MethodHandler>> => ({
  /**
   * 프롬프트 제출. **런의 끝을 기다리지 않는다.**
   *
   * §8이 *"클라이언트 연결이 끊겨도 진행 중인 런은 계속된다."*로 런을 프로세스에 귀속시켰고,
   * 진행은 §6의 푸시 프레임이 나른다. 여기서 런을 await하면 요청 하나에 응답 하나라는 계약이
   * 런 시간만큼 늘어지고, 그 사이 승인이 뜨면 답할 클라이언트가 자기 응답을 기다리느라
   * 못 답하는 형태가 된다. **그래서 이 응답이 뜻하는 것은 «런이 끝났다»가 아니라 «받았다»다.**
   */
  "run.prompt": async (params) => {
    const parsed = textParams.safeParse(params);
    if (!parsed.success) return failure(INVALID_PARAMS, parsed.error.message);

    let run: Promise<void>;
    try {
      run = deps.run.prompt(parsed.data.text);
    } catch (error) {
      // 코어 계약(`CORE-INTERFACE.md` §4 불변 조건 7)이 이 호출에 대해 드는 throw 조건은
      // «이미 활성 런이 있다» 하나다. 다른 이유로 던지면 그것은 코어 계약 위반이고, 그때도
      // 문면은 그대로 나가므로 이 코드가 사실을 감추지 않는다.
      return failure(RUN_ACTIVE, messageOf(error));
    }
    // 거절을 버리지 않는다. 버리면 unhandled rejection이고, 그 죽음은 §3.2의 순서를 통째로
    // 건너뛴다. 여기서 응답을 바꾸지는 않는다 — 이 응답은 이미 나갔거나 나가는 중이다.
    run.catch((error: unknown) => {
      deps.onRunError(error);
    });
    return { ok: true };
  },

  /** 개입. 활성 런이 없으면 거부다 — 다음 런까지 살아남는 주입을 만들지 않는다 */
  "run.steer": async (params) => {
    const parsed = textParams.safeParse(params);
    if (!parsed.success) return failure(INVALID_PARAMS, parsed.error.message);
    try {
      deps.run.steer({ role: "user", content: [{ type: "text", text: parsed.data.text }] });
    } catch (error) {
      // 같은 불변 조건의 반대편이다 — 활성 런이 없거나 그 런이 닫히는 중이다.
      return failure(RUN_IDLE, messageOf(error));
    }
    return { ok: true };
  },

  /**
   * 중단.
   *
   * **[미규정]** 코어의 `abort`는 void이고 활성 런이 없으면 아무 일도 하지 않는다. 그래서
   * 이 응답은 «무엇을 끊었다»가 아니라 «끊으라는 말을 전달했다»이고, 실제로 무엇이 끊겼는지는
   * 이벤트 스트림이 나른다. 대상 유무를 여기서 답하려면 코어가 그것을 돌려줘야 하는데
   * 그 표면을 넓히는 것은 §5 규칙 1·3이 금한 자리다.
   */
  "run.abort": async (params) => {
    const parsed = abortParams.safeParse(params);
    if (!parsed.success) return failure(INVALID_PARAMS, parsed.error.message);
    deps.run.abort(parsed.data.reason);
    return { ok: true };
  },

  /**
   * 승인 응답. *"붙어 있는 아무 클라이언트나 응답할 수 있다"*(§7)이므로 이 메서드는 연결을
   * 인자로 받지 않는다 — 받을 자리가 없는 것이 그 계약의 기계 판이다.
   */
  "approval.settle": async (params) => {
    const parsed = settleParams.safeParse(params);
    if (!parsed.success) return failure(INVALID_PARAMS, parsed.error.message);

    const result = deps.approvals.settle(parsed.data.id, parsed.data.answer);
    switch (result.status) {
      case "settled": {
        const outcome: ApprovalOutcome = result.outcome;
        return { ok: true, payload: { outcome } };
      }
      case "unknown":
        return failure(
          APPROVAL_UNKNOWN,
          `대기 중인 승인이 아니다 — ${parsed.data.id}. 이미 접혔거나 애초에 없었다.`,
        );
      case "always-unavailable":
        return failure(
          APPROVAL_ALWAYS_UNAVAILABLE,
          "이 요청은 항상 허용을 제공하지 않는다. 한 번 허용 또는 거부로 답한다.",
        );
      default: {
        // 갈래가 늘면 여기서 컴파일이 깨진다. 조용히 성공으로 접히는 기본값을 두지 않는다.
        const exhaustive: never = result;
        return exhaustive;
      }
    }
  },

  /**
   * 세션 조회. §6.1이 잘림을 타입으로 만들며 **그 앞부분에 도달할 유일한 경로**로 지목한
   * 자리다 — *"이제 그 자리가 비어 있으면 잘린 앞부분에 도달할 경로가 아예 없다."*
   */
  "session.history": async (params) => {
    const parsed = historyParams.safeParse(params);
    if (!parsed.success) return failure(INVALID_PARAMS, parsed.error.message);

    const messages = await deps.transcript.read();
    const lookup = takeWindowBefore(messages, parsed.data.before);
    if (!lookup.found) {
      return failure(
        UNKNOWN_MESSAGE,
        `트랜스크립트에 없는 메시지를 기준으로 받았다 — ${parsed.data.before}.`,
      );
    }
    return { ok: true, payload: { window: lookup.window } };
  },
});

/**
 * 메서드 표를 만든다.
 *
 * **표를 값으로 내는 것이 의도다.** 디스패처가 표를 인자로 받으므로 «표에서 항목을 빼면
 * 그 메서드가 닫히는가»를 밖에서 잴 수 있고, 그 역검증이 §11의 기본 거부가 실제로 서 있음을
 * 증명하는 유일한 수단이다 — 있는 것만 재는 검사는 표가 비어도 통과한다.
 */
export const createMethodTable = (deps: MethodDeps): MethodTable =>
  new Map<string, MethodHandler>(Object.entries(buildHandlers(deps)));

export type Dispatcher = (frame: RequestFrame) => Promise<ResponseFrame>;

/**
 * 요청 프레임 하나를 응답 프레임 하나로 옮긴다. *"요청 하나에 정확히 하나"*(§6).
 *
 * 던지지 않는다 — 던지면 그 요청에 대해 응답이 0건이 되고, 클라이언트가 보는 것은 §2.6이
 * 금한 침묵이다. 표에 없는 이름도, 인자 위반도, 처리기의 버그도 전부 `ok: false`인 프레임
 * 하나로 나간다.
 */
export const createDispatcher =
  (table: MethodTable): Dispatcher =>
  async (frame) => {
    const handler = table.get(frame.method);
    if (handler === undefined) {
      // §11의 기본 거부가 서는 자리. 이름을 그대로 돌려주는 것은 §12가 문면에 요구하는
      // 유일한 것(침묵하지 않는다)을 이 자리에서 이행하는 방식이다.
      return response(
        frame.id,
        failure(UNKNOWN_METHOD, `메서드 표에 없는 이름이다 — ${frame.method}.`),
      );
    }

    let result: MethodResult;
    try {
      result = await handler(frame.params);
    } catch (error) {
      result = failure(HANDLER_FAILED, messageOf(error));
    }
    return response(frame.id, result);
  };

const response = (id: string, result: MethodResult): ResponseFrame => {
  if (!result.ok) return { type: "res", id, ok: false, error: result.error };
  // `payload`가 없는 성공에 `payload: undefined` 키를 남기지 않는다 — §6이 프레임에 모르는
  // 필드를 금했고, 값이 `undefined`인 키는 직렬화에서 사라져 있는 것도 없는 것도 아닌 상태가 된다.
  return result.payload === undefined
    ? { type: "res", id, ok: true }
    : { type: "res", id, ok: true, payload: result.payload };
};
