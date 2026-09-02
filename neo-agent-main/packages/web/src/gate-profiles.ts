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

/**
 * **2갈래 유니온이다**(`WEB-ACCESS.md` §6 「`web_search` 프로필이 사는 자리」, 2026-09-02).
 *
 * `queryParam`은 `urlParam`과 같은 자리다 — **표시 전용이고 판정 입력이 아니다**
 * (`APPROVAL-GATE.md` §3 판정 B-1). 필드를 빼면 게이트가 `"query"`라는 인자 이름을 스스로
 * 알아야 하고, 그것이 *"게이트는 도구 구현을 모른다"*를 정면으로 깬다.
 */
export type WebToolGateProfile =
  | { kind: "webFetch"; urlParam: string }
  | { kind: "webSearch"; queryParam: string };

/**
 * `Object.freeze`로 런타임 동결한다(§9 A-16). `Readonly<>`는 타입 수준일 뿐인데,
 * 이 테이블은 게이트 **판정의 입력**이다 — 런타임에 바꿀 수 있으면 판정을 바꿀 수
 * 있다는 뜻이 된다.
 */
export const WEB_TOOL_GATE_PROFILES: Readonly<Record<string, WebToolGateProfile>> = Object.freeze({
  web_fetch: Object.freeze({ kind: "webFetch", urlParam: "url" } as const),
  // **테이블은 늘지 않는다 — 엔트리가 는다**(§6·`TOOLS-INTERFACE.md` §5). 소유 규칙이
  // 나누는 단위는 패키지이지 도구이고, 도구마다 테이블을 쪼개면 호스트의 병합 줄이
  // 도구 수만큼 자라 그 줄이 곧 새 누락 자리가 된다. 그래서 CLI의 3-테이블 스프레드는
  // 무변경이고, 이 파일이 얻는 것은 줄 하나다.
  web_search: Object.freeze({ kind: "webSearch", queryParam: "query" } as const),
});
