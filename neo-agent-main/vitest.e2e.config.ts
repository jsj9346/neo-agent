import { defineConfig } from "vitest/config";

/**
 * 브라우저 e2e 하네스 전용 러너 설정 — 정본은 `docs/TECH-STACK.md` §7.1 결정 2·3이다.
 *
 * **루트 `vitest.config.ts`를 안 건드린다.** 그쪽의 `projects: ["packages/*"]`가
 * 결정 3이 말한 *"분리가 파일 이름 규약이 아니라 배치로 강제된다"*의 실물이다 —
 * `e2e/`는 그 글롭 밖이라 `pnpm test`(상시 게이트)에 **원리적으로** 안 집힌다.
 * 이 설정은 `pnpm test:e2e`가 `--config`로 명시 지정할 때만 쓰인다(결정 7 — 호출은
 * 사람이 한다).
 */
export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.test.ts"],

    // 브라우저 기동(크로미움 런치)이 vitest 기본 5초를 넘긴다. 훅 쪽이 더 긴 이유는
    // 서버 기동과 브라우저 런치가 둘 다 `beforeAll`에 서기 때문이다.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
