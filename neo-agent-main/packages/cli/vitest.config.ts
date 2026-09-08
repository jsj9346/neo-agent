import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "cli",
    environment: "node",
    // `TERM=dumb`이면 Node readline이 `terminal: true`를 **그대로 둔 채** 키 핸들러만
    // 축소판(`_ttyWriteDumb`)으로 바꾼다 — 탭 자동완성·방향키 히스토리·라인 되그리기가
    // 전부 죽는데 `rl.terminal`은 계속 `true`라 아무도 강등을 감지하지 못한다.
    // 그 결과 「못 쟀다」가 「어겼다」(red)로 위장한다: 2026-09-07에 이 강등이
    // `input.test.ts` 4건 + `statusline.qa.test.ts` SL-2 1건을 빨갛게 만들어 카드 2장
    // (`K-560`·`K-561`)으로 2일·3사이클을 물었다.
    // 실 터미널 경로를 전제하는 테스트가 이 프로젝트에 있으므로 여기서 환경을 고정한다.
    // 강등이 다른 경로로 들어오는 경우는 이것이 못 막는다 — 그쪽은 `input.test.ts`의
    // `beforeAll` 전제 가드가 red가 아니라 즉시 중단으로 낸다.
    // > 상세: `plans/20260908-input-test-verify-report.md` §3.2 · V-1
    env: { TERM: "xterm" },
    // `*.live.ts`는 옵트인일 때만 **수집**된다 — `DISTRIBUTION.md` §3.5.
    // 수집한 뒤 건너뛰는 것과 애초에 안 들어오는 것은 다르고, 통과로 보이는 것은 전자뿐이다.
    include: [
      "src/**/*.test.ts",
      "test/**/*.test.ts",
      ...(process.env.NEO_DIST_LIVE === "1" ? ["test/**/*.live.ts"] : []),
    ],
  },
});
