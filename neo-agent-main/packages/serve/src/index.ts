/**
 * `@neo-agent/serve` 공개 배럴.
 *
 * 웹 UI 서버·프로토콜의 문 하나다. 계약 정본은 `docs/WEB-UI.md`이며, 이 패키지가
 * 드는 것은 `@neo-agent/core`와 `zod` 둘뿐이다(§2.2) — 조립은 `packages/cli`가
 * 독점하므로 `store`·`gate`·`providers`는 배선으로 들어오지 임포트로 들어오지 않는다.
 *
 * **여기 오르는 것의 기준은 `CLI-INTERFACE.md` §1의 배럴 규율 그대로다** — *"모듈의
 * 의도된 표면"*이되 **소비자 없는 표면을 열지 않는다.** 이 패키지의 소비자는 오늘
 * `packages/cli`의 배선 하나이므로, 아래 열거는 **그 배선이 실제로 집는 이름**이다.
 * 모듈이 export하는 것을 전부 밀어 올리면 이 배럴이 지도가 아니라 사본이 되고, 그때
 * 이 표면의 소비자가 누구인지가 파일마다 흩어진다.
 *
 * **그래서 여기 없는 것이 곧 내부다.** 프레임 타입·스키마·인코더·매니페스트 조회처럼
 * 패키지 안에서만 쓰이는 표면은 자기 모듈에 남는다 — 필요해지는 날 그 줄을 여는 것이
 * 편집 하나이고, 미리 열어 두면 그 편집이 일어난 적 없다는 사실이 사라진다.
 *
 * 각 블록 앞의 `// §n` 주석이 계약 절과 모듈을 잇는 지도다.
 */

// §7·§3.2 승인 왕복 — 프로세스에 하나인 대기 레지스트리. `gate`의 프롬프트 자리에 그대로 앉는다
export { type ApprovalRegistry, createApprovalRegistry } from "./approvals.ts";
// §9.1 정적 자산 서빙 — 고정 매니페스트 하나
export { type AssetHandler, createAssetHandler } from "./assets.ts";
// §2.1·§5 규칙 4·§6 왕복의 인코딩 — 본문 읽기·요청 프레임 디코딩·응답 프레임 인코딩.
// 배선이 하는 일은 마지막 산물을 응답 객체에 옮겨 싣는 것뿐이다
export { decodeRequest, encodeResponse, readRequestBody } from "./codec.ts";
// §6·§11 메서드 표와 디스패처 — 미분류 기본 거부가 여기서 선다
export {
  createDispatcher,
  createMethodTable,
  type Dispatcher,
  type MethodDeps,
  type RunControl,
  type TranscriptReader,
} from "./methods.ts";
// §2.1·§4·§6 HTTP 서버 — 루프백 고정, 버전 관문, 라우팅 둘
export {
  type AgentEventSource,
  createServeServer,
  LOOPBACK_HOST,
  METHOD_PATH,
  type PlainRequest,
  type ServeAddress,
  type ServeServer,
  STREAM_PATH,
  type StreamOpen,
} from "./server.ts";
// §3.2 종료 시퀀스 8단계와 그 신호 배선
export {
  installShutdownSignals,
  type ShutdownOutcome,
  type ShutdownPorts,
  type SignalHost,
} from "./shutdown.ts";
// §6.1·§8 스트림 허브 — 핸드셰이크 스냅샷·푸시·배압
export {
  createStreamHub,
  type SessionSnapshot,
  type StreamHub,
  // 배선이 안전 사실 둘을 그 이름으로 집는다 — `CliConfig`의 두 필드가 §6.1의 값 도메인에
  // 대입되는 컴파일 축이 `packages/cli/src/serve.ts`에 서고, 그 축이 이 이름을 요구한다.
  // `SessionSnapshot`이 오른 근거와 같은 형태다(배선이 자리를 타입으로 적는다).
  type StreamHubOptions,
} from "./stream.ts";
