/**
 * 와이어 프로토콜 — `docs/WEB-UI.md` §6·§6.1·§7·§3.2.
 *
 * 이 파일이 드는 것은 **프레임 넷과 그것이 나르는 값들**이고, 그 전부다. 인코딩(SSE·POST)은
 * `codec.ts`가, 승인 레지스트리는 `approvals.ts`가, 메서드 표는 `methods.ts`가 진다 —
 * §5 규칙 4가 인코딩을 이 패키지 안에 가두었지 이 **파일** 안에 가둔 것이 아니다.
 *
 * **이 프레임 셋은 전송을 모른다**(§6 말미). 아래 어느 타입에도 전송 이름이 나타나지 않으며,
 * 그것이 §2.1의 판정을 되돌릴 수 있게 하는 성질이다. HTTP·SSE·`EventSource`라는 낱말이
 * 이 파일에 주석으로도 오지 않는 것은 실수가 아니라 그 성질의 표시다.
 *
 * **닫는 수단이 둘이고 층이 다르다.**
 *
 *  1. **타입 층** — 판별자로 닫은 유니온. 컴파일러가 소진 검사를 준다.
 *  2. **런타임 층** — zod `strictObject`. §6이 *"모든 프레임 객체는 알려지지 않은 필드를
 *     거부한다"*고 정한 것의 기계 판이다. 오탈자 필드가 조용히 무시돼 서버가 빈 값으로
 *     처리하는 실패를 파싱 시점 에러로 만든다(`ARCHITECTURE.md` §2.6).
 *
 * 두 층이 같은 계약을 두 번 적는 것처럼 보이지만 잡는 것이 다르다 — 타입은 우리 코드가
 * 만드는 프레임을, 스키마는 밖에서 들어온 바이트를 잡는다. 둘이 갈리지 않는 것은
 * 이 파일 말미의 대조와 `protocol.contract.test.ts`가 잰다.
 *
 * **코어 계약을 재선언하지 않는다**(§5 규칙 1·3). `AgentEvent`·`AgentMessage`는
 * `@neo-agent/core`에서 임포트하고, 메시지 검증은 코어가 공개한 `agentMessageSchema`를
 * 그대로 쓴다 — 여기 사본을 두면 코어가 유니온을 넓혔을 때 이쪽이 따라오지 않아도
 * 컴파일이 통과한다.
 */

import { type AgentEvent, type AgentMessage, agentMessageSchema } from "@neo-agent/core";
import { z } from "zod";

// ---------------------------------------------------------------------------
// 타입 — §6·§6.1·§7·§3.2
//
// **`?: never` 가드가 무엇을 사는지가 좁고 정확하다** (2026-08-25 실측 — 가드를 떼고
// 다시 재서 확인했다). 판별자가 리터럴로 박힌 **신선한 객체 리터럴**은 가드가 없어도
// 초과 속성 검사가 잡는다. 잡지 못하는 것은 **신선도를 잃은 값**이다 — 변수에 담았거나
// 스프레드로 조립한 프레임은 초과 속성 검사를 안 받고, 구조적 대입에서 «남는 필드»는
// 허용이므로 `{ ok: true, error }`가 그대로 통과한다.
//
// **그 형태가 서버가 프레임을 만드는 실제 형태다.** 응답·상태 프레임은 조건 분기로
// 조립되지 한 줄 리터럴로 태어나지 않는다. 즉 가드가 없으면 판별자로 닫았다는 문장이
// **하필 우리 코드가 지나는 경로에서만** 거짓이 된다. 런타임 층은 `strictObject`가 이미
// 그 상태를 거부하므로, 가드는 두 층을 같은 자리에서 닫는 수단이다.
//
// 가드를 갈래마다 손으로 유지하는 비용은 그 갈래가 자랄 때 든다. §6.1이 *"`kind`가 늘 수 있는
// 것은 프로세스가 새 상태를 소유하기 시작할 때뿐이다."*로 그 자람에 이미 상한을 걸었다.
// ---------------------------------------------------------------------------

/** 클라이언트 → 서버. 사용자 개입(프롬프트 제출·steer·abort·승인 응답) */
export type RequestFrame = {
  readonly type: "req";
  readonly id: string;
  readonly method: string;
  /**
   * **의도적으로 열린 필드다.** §6이 *"`params`·`payload`는 의도적으로 열린 필드이고 그
   * 검증은 각 메서드가 진다"*고 정했다. 여기서 형태를 좁히면 메서드 표(§12)가 자랄 때마다
   * 이 파일이 함께 자라고, 좁히지 않은 채 검증된 것처럼 읽히면 그것이 더 나쁘다 — 그래서
   * **열려 있다는 사실 자체를 적는다.** 아래 스키마도 같은 이유로 `z.unknown()`이다.
   */
  readonly params?: unknown;
};

/** 서버 → 클라이언트. 요청 하나에 정확히 하나 */
export type ResponseFrame = { readonly type: "res"; readonly id: string } & (
  | {
      readonly ok: true;
      /** `RequestFrame.params`와 같은 이유로 열려 있다 — 검증은 각 메서드가 진다(§6) */
      readonly payload?: unknown;
      readonly error?: never;
    }
  | {
      readonly ok: false;
      readonly error: { readonly code: string; readonly message: string };
      readonly payload?: never;
    }
);

/**
 * 서버 → 클라이언트 푸시 ①. 에이전트 진행 — **코어가 소유한 것**.
 *
 * `event`가 나르는 것은 코어의 타입 그대로다. 승인은 여기 오지 않는다 — §7이
 * *"`AgentEvent`에 승인 이벤트를 더하지 않는다"*를 못박았고, 그 자리를 아래
 * `ServerStateFrame`이 준다.
 */
export type ServerEventFrame = {
  readonly type: "event";
  readonly seq: number;
  readonly event: AgentEvent;
};

/**
 * 서버 → 클라이언트 푸시 ②. 프로세스가 소유한 상태 — **코어가 모르는 것**.
 *
 * > **유니온이 자라는 규칙**(§6.1). *"`kind`가 늘 수 있는 것은 프로세스가 새 상태를
 * > 소유하기 시작할 때뿐이다."* 오늘 소유한 것은 둘 — 대기 승인 레지스트리(§7)와
 * > 프로세스 수명(§3.2)이고, `handshake`는 그 전체의 초기 스냅샷이다.
 * > *"코어가 소유한 것은 `ServerEventFrame`으로 가고, 요청의 반쪽은 `ResponseFrame`으로 간다."*
 *
 * 이 규칙을 여기 적지 않으면 이 프레임이 «나머지 전부»의 자리가 되고, 판별자를 닫아
 * 얻은 것이 «판별자 하나가 무한히 넓다»로 되돌아간다.
 */
export type ServerStateFrame = { readonly type: "state"; readonly seq: number } & (
  | {
      readonly kind: "handshake";
      readonly snapshot: StateSnapshot;
      readonly approval?: never;
      readonly id?: never;
      readonly outcome?: never;
    }
  // *"`shutdown`에 페이로드를 두지 않는다."* §3.2가 두 신호를 가르지 않기로 했으므로 사유가
  // 한 값뿐이고, *"값이 하나인 필드는 표현하지 않는다."*(§6.1)
  | {
      readonly kind: "shutdown";
      readonly snapshot?: never;
      readonly approval?: never;
      readonly id?: never;
      readonly outcome?: never;
    }
  | {
      readonly kind: "approval_pending";
      readonly approval: PendingApproval;
      readonly snapshot?: never;
      readonly id?: never;
      readonly outcome?: never;
    }
  | {
      readonly kind: "approval_settled";
      readonly id: string;
      readonly outcome: ApprovalOutcome;
      readonly snapshot?: never;
      readonly approval?: never;
    }
);

/** §6 — 프레임은 넷이고 판별자로 닫는다 */
export type Frame = RequestFrame | ResponseFrame | ServerEventFrame | ServerStateFrame;

/**
 * 핸드셰이크가 싣는 초기 스냅샷. §8이 복구를 이것 하나로 정했다.
 *
 * **프로토콜 버전을 여기 싣지 않는다**(§6.1). 불일치는 스트림이 열리기 전에 HTTP로
 * 거부되므로 이 프레임에 닿은 연결은 이미 버전이 맞는다 — 싣는 것은 이미 참인 것을
 * 다시 말하는 필드다.
 */
export type StateSnapshot = {
  readonly sessionId: string;
  /** 아래. `CORE-INTERFACE.md` §2 */
  readonly transcript: TranscriptWindow;
  /** §7 */
  readonly pendingApprovals: readonly PendingApproval[];
};

/**
 * 트랜스크립트의 꼬리와 «그 앞이 있는가»를 한 값이 든다.
 *
 * 두 갈래가 서로 다른 필드를 가지므로 «잘렸는데 생략 수가 없다»와 «온전한데 생략 수가
 * 있다»가 둘 다 표현되지 않는다. §6.1이 *"옵셔널 필드나 감시값(`-1`·빈 배열)이 아니라
 * 판별된 두 갈래로 닫는다"*고 정한 자리다 — 표시하지 않으면 화면은 «대화가 중간부터
 * 시작했다»와 «앞이 잘렸다»를 **아무도** 구별할 수 없다.
 *
 * **꼬리 N의 값은 이 파일에 없다.** §6.1이 그것을 세부로 두고 §12의 수치 항에 넘겼으며,
 * 계약인 것은 «상한이 존재한다»와 «잘렸다는 사실이 값에 나타난다» 둘뿐이다. 상한을 재는
 * 자리는 스냅샷을 **만드는** 쪽(§8의 핸드셰이크)이지 이 타입이 아니다.
 */
export type TranscriptWindow =
  | {
      readonly complete: true;
      readonly messages: readonly AgentMessage[];
      readonly omitted?: never;
    }
  | {
      readonly complete: false;
      readonly messages: readonly AgentMessage[];
      readonly omitted: number;
    };

/** §7 — 대기 중인 승인 한 건 */
export type PendingApproval = {
  readonly id: string;
  /** 게이트가 만든 표시 문면. 서버가 가공하지 않는다 */
  readonly display: string;
  readonly requestedAt: number;
  readonly expiresAt: number;
};

/**
 * *"만료의 기본값은 거부다. 무응답이 허용으로 읽히는 경로는 존재하지 않는다"*(§7).
 *
 * *"§7의 유니온을 §3.2가 하나 넓힌다."* `resolvedBy`가 셋인 것이 계약이다 — 종료를
 * `"timeout"`으로 접으면 «아무도 답하지 않았다»와 «서버가 내려갔다»가 트랜스크립트에서
 * 구분되지 않고, 그 둘은 사용자의 다음 행동이 다르다(§3.2 · `ARCHITECTURE.md` §2.6).
 */
export type ApprovalOutcome = {
  readonly decision: "allow" | "deny";
  readonly resolvedBy: "client" | "timeout" | "shutdown";
};

// ---------------------------------------------------------------------------
// 스키마 — 런타임 층. 밖에서 들어온 바이트를 잡는다.
//
// 선언 순서는 의존 순서다(값이므로 호이스팅이 없다). 타입 쪽은 §6 → §6.1 → §7의
// 문서 순서를 따르고 이쪽은 그 역이 되는데, 같은 계약을 두 축으로 읽는 것이라 어느
// 한쪽에 맞춰 다른 쪽을 뒤집을 이유가 없다.
// ---------------------------------------------------------------------------

/**
 * `seq` — *"연결마다 1부터 단조 증가한다"*(§6)이므로 양의 정수다. 0·음수·소수는 그
 * 문장이 표현할 수 없는 값이고, 표현할 수 없는 것을 파싱 시점에 막는 것이 이 파일의 수단이다.
 *
 * **단조성 자체는 여기서 못 잰다** — 한 프레임만 보고는 알 수 없다. 그것을 재는 곳은
 * 카운터를 소유한 쪽(`codec.ts`)과 갭을 판정하는 클라이언트다(§8).
 */
const seqSchema = z.int().positive();

const pendingApprovalSchema = z.strictObject({
  id: z.string(),
  display: z.string(),
  requestedAt: z.number(),
  expiresAt: z.number(),
});

const approvalOutcomeSchema = z.strictObject({
  decision: z.enum(["allow", "deny"]),
  resolvedBy: z.enum(["client", "timeout", "shutdown"]),
});

/**
 * `messages`가 코어의 스키마를 그대로 쓰는 것이 이 파일의 규율이다 — 사본을 두면
 * 코어가 메시지 유니온을 넓혔을 때 이쪽만 낡는다.
 *
 * [미규정] `complete: false`인데 `omitted: 0`인 값을 계약이 금하는지 §6.1이 정하지 않는다.
 * 그 절이 닫은 것은 «두 필드의 조합»이지 «수의 범위»가 아니다. 넓은 쪽(0 허용)으로 두었다 —
 * 나중에 좁히는 것은 값의 부분집합을 거부하는 변경이지만, 넓히는 것은 계약 파기이기 때문이다.
 */
const transcriptWindowSchema = z.discriminatedUnion("complete", [
  z.strictObject({
    complete: z.literal(true),
    messages: z.array(agentMessageSchema),
  }),
  z.strictObject({
    complete: z.literal(false),
    messages: z.array(agentMessageSchema),
    omitted: z.int().nonnegative(),
  }),
]);

const stateSnapshotSchema = z.strictObject({
  sessionId: z.string(),
  transcript: transcriptWindowSchema,
  pendingApprovals: z.array(pendingApprovalSchema),
});

const requestFrameSchema = z.strictObject({
  type: z.literal("req"),
  id: z.string(),
  method: z.string(),
  // 열린 필드(§6). `.optional()`은 «키가 없어도 되고 `undefined`여도 된다»이며 그것이
  // `params?: unknown`의 타입 층 의미와 정확히 같다.
  params: z.unknown().optional(),
});

const responseFrameSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    type: z.literal("res"),
    id: z.string(),
    ok: z.literal(true),
    payload: z.unknown().optional(),
  }),
  z.strictObject({
    type: z.literal("res"),
    id: z.string(),
    ok: z.literal(false),
    error: z.strictObject({ code: z.string(), message: z.string() }),
  }),
]);

const serverEventFrameSchema = z.strictObject({
  type: z.literal("event"),
  seq: seqSchema,
  /**
   * **봉투는 우리가 닫고, 안의 값은 코어가 소유한다.**
   *
   * 코어는 오늘 이벤트 유니온의 zod 스키마를 공개하지 않는다(메시지 쪽은 공개한다 —
   * `agentMessageSchema`). 여기 사본을 쓰면 §5 규칙 1·3이 금한 «코어 계약이 두 곳에
   * 존재하는» 상태가 되고, 코어가 이벤트를 하나 더할 때마다 이 파일이 조용히 낡는다.
   *
   * 그래서 이 자리가 재는 것은 **봉투의 형태 하나**다 — 객체이고 문자열 `type`을 갖는가.
   * 재지 않는 것을 재는 척하지 않는다.
   *
   * [미규정] §6·§6.1은 `event`가 나르는 값을 누가 검증하는지 정하지 않는다. 프레임 자신의
   * 미지 필드 거부는 §6이 정했고 이 `strictObject`가 이행하지만, 그 안쪽은 규정 밖이다.
   * 코어가 이벤트 스키마를 공개하는 날 이 한 줄이 그것으로 바뀐다.
   */
  event: z.custom<AgentEvent>(
    (value) =>
      typeof value === "object" &&
      value !== null &&
      typeof (value as { readonly type?: unknown }).type === "string",
    { error: "AgentEvent 봉투가 아니다 — 객체이고 문자열 type을 가져야 한다" },
  ),
});

const serverStateFrameSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    type: z.literal("state"),
    seq: seqSchema,
    kind: z.literal("handshake"),
    snapshot: stateSnapshotSchema,
  }),
  // 페이로드 없음(§6.1). `strictObject`라 사유·문면을 실으려는 시도가 파싱 에러가 된다.
  z.strictObject({
    type: z.literal("state"),
    seq: seqSchema,
    kind: z.literal("shutdown"),
  }),
  z.strictObject({
    type: z.literal("state"),
    seq: seqSchema,
    kind: z.literal("approval_pending"),
    approval: pendingApprovalSchema,
  }),
  z.strictObject({
    type: z.literal("state"),
    seq: seqSchema,
    kind: z.literal("approval_settled"),
    id: z.string(),
    outcome: approvalOutcomeSchema,
  }),
]);

/**
 * 프레임 넷의 정본 스키마. `type`으로 닫힌 판별 유니온이다.
 *
 * `res`와 `state`가 자기 안에서 다시 판별 유니온인 것이 §6·§6.1의 구조 그대로다 —
 * 바깥은 «어느 프레임인가»를, 안쪽은 «어느 갈래인가»를 가른다.
 */
export const frameSchema = z.discriminatedUnion("type", [
  requestFrameSchema,
  responseFrameSchema,
  serverEventFrameSchema,
  serverStateFrameSchema,
]);

export {
  approvalOutcomeSchema,
  pendingApprovalSchema,
  requestFrameSchema,
  responseFrameSchema,
  serverEventFrameSchema,
  serverStateFrameSchema,
  stateSnapshotSchema,
  transcriptWindowSchema,
};

// ---------------------------------------------------------------------------
// 두 층의 대조 — 컴파일 시점에만 존재한다.
//
// 스키마가 통과시킨 값이 위 타입에 **그대로 들어가는지**를 컴파일러가 잰다. 한쪽만
// 고치면 여기서 깨진다 — 두 층을 두는 대가로 반드시 있어야 하는 그물이다.
//
// 방향이 한쪽인 것에 이유가 있다. 타입 쪽은 `readonly`이고 zod의 산출은 가변이라
// 반대 방향(타입 → 산출)은 `readonly T[]`가 `T[]`에 안 들어가는 것 때문에 구조와
// 무관하게 실패한다. 우리가 알고 싶은 것은 «파싱한 값을 이 타입으로 쓸 수 있는가»이므로
// 이 방향이 그 물음이다.
//
// **이 대조가 못 잡는 것을 함께 적는다**(§2.3 — 검사가 실제보다 넓게 주장하지 않게).
// 구조적 대입은 «남는 필드»를 허용하므로, **스키마에만** 필드가 늘고 타입에는 안 는
// 경우는 여기서 안 걸린다. 그 방향은 키 집합을 세는 런타임 단언이 진다 —
// `protocol.contract.test.ts`가 `StateSnapshot`·`PendingApproval`에 대해 그것을 잰다.
// ---------------------------------------------------------------------------

type SchemaOutputFitsType = z.infer<typeof frameSchema> extends Frame ? true : never;
const _schemaOutputFitsType: SchemaOutputFitsType = true;
void _schemaOutputFitsType;
