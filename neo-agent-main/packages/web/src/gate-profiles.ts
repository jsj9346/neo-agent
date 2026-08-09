/**
 * 게이트 분류 테이블 — `docs/WEB-ACCESS.md` §6, `docs/TOOLS-INTERFACE.md` §5.
 *
 * 게이트는 도구 구현을 모른다. "어느 도구가 어떤 행동이고 어느 인자가 URL인지"를
 * 이 테이블이 설정 데이터로 알려준다 — 두 패키지가 서로를 임포트하지 않고 만나는
 * 지점이다. 타입을 여기서 다시 정의하는 이유는 `packages/gate`를 임포트하면 무의존
 * 계약(§2)이 깨지기 때문이며, 게이트의 `GateToolProfile`과 **구조적으로 호환**된다.
 *
 * **테이블에 없는 도구는 게이트가 fail-closed로 다룬다**(항상 승인 프롬프트).
 * 등록을 잊어도 조용한 자동 허용이 되지 않는다.
 */

export type WebToolGateProfile = { kind: "webFetch"; urlParam: string };

/**
 * `Object.freeze`로 런타임 동결한다(§9 A-16). `Readonly<>`는 타입 수준일 뿐인데,
 * 이 테이블은 게이트 **판정의 입력**이다 — 런타임에 바꿀 수 있으면 판정을 바꿀 수
 * 있다는 뜻이 된다.
 */
export const WEB_TOOL_GATE_PROFILES: Readonly<Record<string, WebToolGateProfile>> = Object.freeze({
  web_fetch: Object.freeze({ kind: "webFetch", urlParam: "url" } as const),
});
