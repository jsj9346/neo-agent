/**
 * 와이어 인코딩 — `docs/WEB-UI.md` §2.1·§6·§6.1·§8.
 *
 * 이 파일이 드는 것은 **프레임과 바이트 사이의 변환 전부**다. 서버→클라이언트 푸시를 SSE
 * 이벤트로 내보내는 인코더, 그 왕복의 반쪽인 `ResponseFrame`을 HTTP 응답의 바이트로 옮기는
 * 인코더, 그리고 클라이언트→서버 POST 본문을 `RequestFrame`으로 읽는 디코더다. 프레임 셋
 * 자체는 `protocol.ts`가, 승인 레지스트리는 `approvals.ts`가, 메서드 표는 `methods.ts`가
 * 진다.
 *
 * **응답 인코더가 이 파일에 있는 것이 §5 규칙 4다**(2026-08-26 이관). 그전까지 그 반쪽은
 * `packages/cli`가 들고 있었고 — 직렬화 형식·`content-type`·상태 코드·`content-length`가
 * 전부 거기서 결정됐다 — 그 배치에서는 §2.1 말미의 *"훗날 전송을 바꾼다면 그것은
 * `packages/serve` 안의 인코더 교체이고 `core`·`cli`·프레임 타입은 손대지 않는다"*가 실물에서
 * 거짓이었다. 같은 근거로 본문을 읽는 쪽(아래 `readRequestBody`)과 그 상한도 이 파일이 든다:
 * 바이트가 프레임이 되는 경로의 어느 마디도 배선에 남기지 않는 것이 그 문장을 참으로 만드는
 * 조건이다.
 *
 * **여기가 전송을 아는 유일한 층이다.** §5 규칙 4가 *"인코딩은 `packages/serve` 안에만
 * 산다"*고 정했고, §2.1이 그 인코딩의 실물을 SSE + POST로 못박았다. 그래서 `protocol.ts`가
 * 전송 이름을 한 낱말도 안 쓰는 것과 이 파일이 SSE를 이름으로 부르는 것은 같은 규율의 양면이다
 * — 훗날 전송을 바꾸는 일이 이 파일의 교체로 끝나게 하려면 전송 이름이 정확히 여기까지만
 * 내려와 있어야 한다.
 *
 * **번호를 매기는 자리가 이 파일 하나인 것이 계약이다**(§6·§6.1). 아래 `createPushEncoder`가
 * 유일한 번호 발급기이고, 그 인코더는 **번호가 없는 푸시만** 받는다. 부르는 쪽이 `seq`를
 * 실을 수 없으므로 카운터를 프레임 타입별로 가르는 형태가 표현 불가능해진다.
 *
 * **밖에서 온 바이트만 스키마로 잰다.** 나가는 프레임은 `protocol.ts`가 타입 층으로 이미
 * 닫았고(판별자 유니온 + `?: never` 가드), 그 파일 머리가 두 층의 몫을 그렇게 갈랐다 —
 * 타입은 우리 코드가 만드는 프레임을, 스키마는 밖에서 들어온 바이트를 잡는다. 나가는 쪽에
 * 파싱을 한 겹 더 두면 같은 것을 두 번 재면서 두 층의 경계만 흐려진다.
 */

import type { IncomingMessage } from "node:http";
import type {
  RequestFrame,
  ResponseFrame,
  ServerEventFrame,
  ServerStateFrame,
} from "./protocol.ts";
import { requestFrameSchema } from "./protocol.ts";

// ---------------------------------------------------------------------------
// 인코딩 — 서버 → 클라이언트 (§2.1·§6·§6.1·§8)
// ---------------------------------------------------------------------------

/**
 * `seq`를 뺀 푸시 프레임. 인코더가 받는 값이고, 번호는 인코더만 매긴다.
 *
 * 분배 조건부로 갈래마다 `seq`를 뺀다 — `Omit`을 유니온에 통째로 걸면 키가 교집합으로 접혀
 * 판별자 폐쇄가 무너진다. 갈래 목록을 여기 다시 적지 않는 것이 요점이다: `protocol.ts`가
 * `kind`를 하나 늘리면 이 타입이 자동으로 따라오고, 따라오지 않으면 소진 검사가 깨진다.
 */
type Unsequenced<T> = T extends unknown ? Omit<T, "seq"> : never;

/** 서버가 밀어내는 두 프레임(§6·§6.1) — 번호가 붙기 전의 형태 */
export type UnsequencedPush = Unsequenced<ServerEventFrame> | Unsequenced<ServerStateFrame>;

/**
 * 연결 하나의 푸시 인코더. **연결마다 새로 만든다.**
 *
 * 그것이 §6의 *"연결마다 1부터 단조 증가한다"*를 이 층에서 참으로 만드는 유일한 배선이고,
 * §8의 *"이벤트를 재생하지 않는다"*가 요구하는 것이기도 하다 — 이어받을 자리가 아예 없어야
 * 재생이 표현 불가능해진다.
 */
export type PushEncoder = {
  /**
   * 다음 번호를 매겨 SSE 이벤트 한 건의 바이트를 낸다.
   *
   * `event`와 `state` 어느 쪽이 오든 같은 카운터에서 번호를 받는다. 그것이 §6.1이
   * *"`seq`가 하나의 카운터인 것이 계약이다"*로 든 것이고, 근거는 순서다 — 카운터를
   * 프레임 타입별로 가르면 승인 해소가 어느 도구 이벤트 앞인지 뒤인지가 **도착 순서로만**
   * 존재하게 되고, 도착 순서는 전송이 주는 성질이라 §2.1이 세운 전송 무지가 거기서 샌다.
   */
  readonly encode: (push: UnsequencedPush) => string;
};

/**
 * 푸시 인코더를 만든다. **인자를 받지 않는 것이 계약의 일부다.**
 *
 * 이어받을 번호를 넘길 자리가 없으므로 재접속이 이전 지점에서 이어질 수 있는 경로가
 * 존재하지 않는다(§8). 인자 하나가 생기는 순간 재생이 표현 가능해지고, 그때 이 문단이
 * 거짓이 된다.
 */
export const createPushEncoder = (): PushEncoder => {
  // 첫 발급이 1이다(§6.1) — 핸드셰이크가 첫 푸시이므로 그 프레임의 번호가 1이 된다.
  // `protocol.ts`의 `seqSchema`가 양의 정수를 요구하는 것과 같은 사실의 두 표현이다.
  let next = 1;
  return {
    encode: (push) => encodeSseEvent(next++, push),
  };
};

/**
 * SSE 이벤트 한 건의 바이트. 형식은 `id: <seq>\ndata: <json>\n\n`이다.
 *
 * **`data:`가 한 줄인 것은 우연이 아니다.** `JSON.stringify`는 문자열 안의 개행을 `\n`
 * 두 글자로 이스케이프하므로 산출에 날 개행이 없고, 그래서 이 형식이 다중 줄 `data:`
 * 조립을 필요로 하지 않는다. 그 성질이 깨지는 인코딩(예: 정렬 옵션으로 들여쓴 JSON)으로
 * 바꾸면 이 한 줄 가정이 조용히 거짓이 된다.
 *
 * **`Last-Event-ID` 요청 헤더를 읽지 않는다**(§8). SSE는 `id:`를 받은 브라우저가 재접속
 * 때 그 값을 요청 헤더로 되돌려 보내는 재생 기제를 표준으로 마련해 두었고, 이 문서는
 * 그것을 **안 쓰는 것을 계약으로** 삼았다 — 갭의 처리는 재접속이고 복구는 핸드셰이크
 * 스냅샷 하나다. 그래서 `id:`를 내보내는 이유는 재생이 아니라 갭 판정이다(§6.1). 안 읽는
 * 것이 계약이므로 여기 명시적으로 적는다. 적지 않으면 다음이 «표준이 주니까 켠다»로 읽는다.
 */
const encodeSseEvent = (seq: number, push: UnsequencedPush): string => {
  // 번호를 붙인 결과가 **다시 프레임이라는 것**을 컴파일러가 잰다. 이 한 줄이 없으면
  // 인코더의 산출은 `JSON.stringify`가 받는 익명 객체일 뿐이라, `protocol.ts`가 갈래를
  // 늘렸을 때 여기서 빠진 필드를 아무도 안 잡는다.
  const frame: ServerEventFrame | ServerStateFrame = { ...push, seq };
  return `id: ${seq}\ndata: ${JSON.stringify(frame)}\n\n`;
};

// ---------------------------------------------------------------------------
// 인코딩 — 응답 프레임 (§2.1·§5 규칙 4·§6)
// ---------------------------------------------------------------------------

/**
 * 응답 프레임 하나의 전송 표현. **상태 코드·헤더·본문이 한 값이다.**
 *
 * 셋을 한 값으로 묶는 것이 이 타입의 요점이다 — 갈라 놓으면 부르는 쪽이 헤더만 쓰고 본문을
 * 다른 데서 짓는 형태가 표현 가능해지고, 그 순간 인코딩이 다시 두 자리에 산다. 부르는 쪽이
 * 하는 일은 이 값을 응답 객체에 옮겨 싣는 것뿐이고, 옮길 것이 무엇인지를 고르지 않는다.
 */
export type EncodedResponse = {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
};

/**
 * `ResponseFrame` 하나를 HTTP 응답의 바이트로 옮긴다.
 *
 * **`ok: false`도 상태 200이다.** §6이 왕복을 *"요청 하나에 정확히 하나"*로 정했고 그 하나가
 * 응답 프레임이므로, 실패의 정체는 프레임의 `error`가 나른다. HTTP 상태로 한 번 더 가르면
 * 같은 사실이 두 층에 실려 클라이언트가 어느 쪽을 읽어야 하는지가 갈리고, 그때 프레임 층의
 * `error`가 조용히 죽는다(`ARCHITECTURE.md` §2.6). 상태가 프레임이 아닌 것을 말하는 자리는
 * 프레임을 만들 수조차 없는 실패(본문을 못 읽음·라우트 밖)이고 그것은 이 함수 밖이다.
 *
 * `cache-control: no-store`는 왕복의 반쪽이 캐시 대상이 아니기 때문이고, §9.1의 자산 갈래가
 * 든 근거와 같다.
 */
export const encodeResponse = (frame: ResponseFrame): EncodedResponse => {
  const body = JSON.stringify(frame);
  return {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-length": String(Buffer.byteLength(body, "utf8")),
      "cache-control": "no-store",
    },
    body,
  };
};

// ---------------------------------------------------------------------------
// 디코딩 — 클라이언트 → 서버 (§2.1·§6)
// ---------------------------------------------------------------------------

/**
 * POST 본문의 상한(바이트).
 *
 * **[미규정]** §8이 상한을 정한 것은 서버→클라이언트 방향이고 반대 방향에는 어느 절도 상한을
 * 두지 않았다. 상한 없이 두면 본문 하나가 메모리를 무제한 먹는데, 그것은 §8이 반대 방향에서
 * 이름 붙여 막은 것과 같은 형태다 — 그래서 유한한 값을 둔다. 값은 세부이고 계약으로 삼지
 * 않는다. **자리가 이 패키지인 것은 세부가 아니다**: 상한은 바이트가 프레임이 되는 경로의
 * 마디이고, 배선이 들면 §2.1 말미의 되돌림 문장이 그만큼 거짓이 된다.
 *
 * 배럴에 올리지 않는다 — 이 값을 읽는 소비자가 없고, 강제하는 자리는 바로 아래 함수다
 * (`index.ts` 머리의 *"여기 없는 것이 곧 내부다"*).
 */
export const MAX_REQUEST_BODY_BYTES = 1_048_576;

/**
 * POST 본문을 문자열로 읽는다. **상한을 넘으면 던진다.**
 *
 * 던지는 것이 값으로 답하는 `decodeRequest`와 갈리는 이유는 층이 다르기 때문이다 — 여기서
 * 실패하면 프레임을 만들 재료 자체가 없어 `ResponseFrame`으로 답할 수 없다. 부르는 쪽이 그
 * 실패를 HTTP 층에서 답하는 것이 그 귀결이고, 잊으면 거절이 밖으로 나가 조용히 끝나지
 * 않는다(`ARCHITECTURE.md` §2.6).
 */
export const readRequestBody = (request: IncomingMessage): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > MAX_REQUEST_BODY_BYTES) {
        reject(
          new Error(
            `요청 본문이 상한을 넘었다 — ${String(size)} > ${String(MAX_REQUEST_BODY_BYTES)} 바이트.`,
          ),
        );
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });

/**
 * 본문을 읽지 못했을 때의 오류 코드.
 *
 * [미규정] §6은 `ResponseFrame`의 `error`가 `code`·`message`를 든다고만 정하고 코드의
 * 어휘를 정하지 않는다. 그래서 이 층은 **자기가 내는 한 가지만** 이름 붙이고 어휘를
 * 열지 않는다 — 메서드가 내는 코드는 그 메서드의 몫이다(§6의 *"`params`·`payload`는
 * 의도적으로 열린 필드이고 그 검증은 각 메서드가 진다"*와 같은 가름).
 */
export const INVALID_REQUEST = "invalid_request";

/**
 * 디코딩의 결과. **판별된 두 갈래이고 성공도 실패도 아닌 값이 표현되지 않는다.**
 *
 * 실패 갈래가 `ResponseFrame`을 통째로 드는 것은 §6이 *"요청 하나에 정확히 하나"*로 정한
 * 왕복을 이 층에서 끊기지 않게 하기 위함이다 — 부르는 쪽이 프레임을 다시 조립할 필요 없이
 * 그대로 돌려보내면 그 계약이 지켜진다.
 */
export type DecodedRequest =
  | { readonly ok: true; readonly frame: RequestFrame }
  | { readonly ok: false; readonly response: Extract<ResponseFrame, { readonly ok: false }> };

/**
 * POST 본문을 `RequestFrame`으로 읽는다. 실패는 `ok: false` 응답 프레임이다.
 *
 * 실패가 던지지 않고 값으로 나오는 것이 이 서명의 요점이다 — 부르는 쪽이 잊어도 조용히
 * 성공으로 읽히는 경로가 없다(`ARCHITECTURE.md` §2.6).
 *
 * 실패 사유(JSON 문법 오류인지 스키마 위반인지)는 `message`가 그대로 나른다. 문면을
 * 감추지 않는 것은 §4가 노출을 루프백으로 고정해 이 응답을 받는 쪽이 같은 기계의 브라우저
 * 하나뿐이기 때문이다.
 */
export const decodeRequest = (body: string): DecodedRequest => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (cause) {
    return failure("", cause instanceof Error ? cause.message : "본문이 JSON이 아니다");
  }

  const result = requestFrameSchema.safeParse(parsed);
  if (!result.success) return failure(salvageId(parsed), result.error.message);
  return { ok: true, frame: result.data };
};

/**
 * 파싱에 실패한 본문에서 상관 식별자만 건져 본다.
 *
 * [미규정] §6은 요청과 응답이 `id`로 짝지어진다고만 정하고 **본문을 읽지 못했을 때** 그
 * 자리에 무엇이 오는지 정하지 않는다. 여기서 고른 것은 보낸 값이 있으면 그것을 쓰고
 * 없으면 빈 문자열을 쓰는 쪽이다 — 없는 식별자를 지어내면 클라이언트가 짝지을 수 없는
 * 것을 짝으로 읽고, 그것이 이 레포가 가장 피하는 종류의 조용한 실패다. 빈 문자열은
 * 짝지을 수단이 없다는 사실을 그대로 나르는 값이다.
 */
const salvageId = (parsed: unknown): string => {
  if (typeof parsed !== "object" || parsed === null) return "";
  const id: unknown = (parsed as { readonly id?: unknown }).id;
  return typeof id === "string" ? id : "";
};

const failure = (id: string, message: string): DecodedRequest => ({
  ok: false,
  response: { type: "res", id, ok: false, error: { code: INVALID_REQUEST, message } },
});
