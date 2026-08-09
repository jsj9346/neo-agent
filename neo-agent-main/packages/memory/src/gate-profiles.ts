/**
 * 게이트 분류 테이블 — `docs/APPROVAL-GATE.md` §3, `docs/MEMORY.md` §5.
 *
 * 게이트는 도구 구현을 모른다. "어느 도구가 어떤 행동이고 어느 인자가 무엇인지"를
 * 이 테이블이 설정 데이터로 알려준다 — 두 패키지가 서로를 임포트하지 않고 만나는
 * 지점이다. 타입을 여기서 다시 정의하는 이유는 `packages/gate`를 임포트하면 무의존
 * 계약(§4.4)이 깨지기 때문이며, 게이트의 `GateToolProfile`과 **구조적으로 호환**된다.
 *
 * **등록하지 않는 것은 중립이 아니다.** 테이블에 없는 도구는 `unknown`으로 fail-closed
 * 이므로(§3), 등록을 잊으면 **메모리 저장마다 승인 프롬프트가 뜬다.** 판정은 자동
 * 허용이다 — 승인이 요구되는 것은 되돌리기 어렵거나 범위를 알 수 없는 행동인데
 * 메모리 쓰기는 둘 다 아니고(몇 KB 상한의 append, 사용자가 `/memory`로 언제든 삭제),
 * CLI가 호출과 결과를 렌더링하므로 가시성은 이미 성립한다. `ARCHITECTURE.md` §2.6이
 * 요구하는 것은 가시성이지 마찰이 아니다.
 */

/**
 * `contentParam`은 **표시 전용이며 판정 입력이 아니다** (`APPROVAL-GATE.md` §3 판정
 * B-1, 2026-08-09 정정). 판정 대상(`GateSubject`)에는 인자 필드가 아예 없고 —
 * `remember`에는 게이트가 읽을 판정 축이 존재하지 않으므로 축을 발명하지 않는다 —
 * 프로필의 이 필드는 승인 화면이 *무엇이 저장되려는지* 보이기 위해서만 쓰인다.
 * 필드를 빼면 게이트가 `"content"`라는 인자 이름을 스스로 알아야 하고, 그것은
 * "게이트는 도구 구현을 모른다"를 정면으로 깬다.
 */
export type MemoryToolGateProfile = { kind: "memoryWrite"; contentParam: string };

/**
 * `Object.freeze`로 런타임 동결한다. `Readonly<>`는 타입 수준일 뿐인데, 이 테이블은
 * 게이트 **판정의 입력**이다 — 런타임에 바꿀 수 있으면 판정을 바꿀 수 있다는 뜻이 된다.
 */
export const MEMORY_TOOL_GATE_PROFILES: Readonly<Record<string, MemoryToolGateProfile>> =
  Object.freeze({
    remember: Object.freeze({ kind: "memoryWrite", contentParam: "content" } as const),
  });
