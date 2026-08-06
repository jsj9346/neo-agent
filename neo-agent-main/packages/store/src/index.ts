/**
 * `@neo-agent/store` 공개 배럴.
 *
 * 세션 저장소 — 코어 이벤트 스트림의 구독자이며 CLI 렌더러와 같은 자리에 앉는다.
 * 코어는 저장소를 모른다. 계약 정본은 `docs/SESSION-STORE.md`.
 *
 * 의존성 예산: `@neo-agent/core` + `zod`. 본업상 `node:fs`·`node:sqlite`는 허용하되
 * 네트워크·프로세스 스폰은 예산 게이트가 기계적으로 차단한다 — 대화 전문을 보관하는
 * 패키지가 바깥으로 나가는 경로를 만들지 않는다(SESSION-STORE §1).
 */

export {};
