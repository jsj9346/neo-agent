/**
 * 서버 하네스 자체를 재는 축 — `docs/TECH-STACK.md` §7.1 결정 4(모의 범위)·결정 5(포트 0).
 *
 * **여기서 재는 것은 시나리오가 아니라 하네스다.** C2의 네 단계(브라우저 로드 → 제출 →
 * 렌더 → 승인 왕복)는 `webui-turn.e2e.test.ts`가 재고, 이 파일은 그 시나리오가 딛고 설
 * 바닥이 계약대로인가를 잰다: 실주소가 나오는가, 겹쳐 띄워도 안 죽는가, 서버가 실제로
 * 응답하는가, **무엇을 모의했는가**, 임시 뿌리가 사라지는가.
 *
 * **모의 범위 단정이 이 파일의 중심이다.** 예산 게이트의 `probeDocker` 교차 검사는
 * `packages/cli/test/`만 순회하므로 이 디렉터리를 안 덮고, 나머지를 함께 스텁해도 다른
 * 축은 전부 그린이다 — 즉 그 단정이 없으면 결정 4는 문서에만 있는 서술로 남는다.
 *
 * 브라우저를 쓰지 않는다. 그런데도 자리가 `e2e/`인 이유는 이 파일이 재는 대상이
 * `e2e/harness.ts`이고, 그 모듈이 상시 러너의 글롭 밖에 살기 때문이다.
 */

import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Harness, MOCKED_FACTORY_KEYS, realFactoryKeys, startHarness } from "./harness.ts";

/** 첫 하네스의 임시 뿌리. 마지막 축이 `afterAll` **뒤에** 이 경로의 부재를 잰다 */
let firstRoot: string | undefined;

describe("TECH-STACK §7.1 — 서버 하네스", () => {
  describe("기동한 하네스 하나", () => {
    let harness: Harness;

    beforeAll(async () => {
      harness = await startHarness();
      firstRoot = harness.root;
    });

    afterAll(async () => {
      await harness.stop();
    });

    it("H-1 실주소를 돌려주고 포트가 0이 아니다", () => {
      // 커널이 고른 포트가 `onListening`을 지나 하네스 밖으로 나왔다는 것의 형태다.
      // `0`이 남아 있으면 주소를 못 잡은 것이고, 그 증상은 다음 축의 연결 거부다.
      expect(harness.port).not.toBe(0);
      expect(Number.isInteger(harness.port)).toBe(true);
      expect(harness.port).toBeGreaterThan(0);
      expect(harness.url).toBe(`http://127.0.0.1:${String(harness.port)}`);
    });

    it("H-2 화면 뿌리가 200을 돌려준다", async () => {
      // 실물 소켓 · 실물 자산이다. 자산 배선이 빠지면 여기가 404로 갈린다.
      const response = await fetch(`${harness.url}/`);
      expect(response.status, `로그: ${harness.log()}`).toBe(200);
      await response.text();
    });

    it("H-3 두 번째 하네스를 겹쳐 띄워도 EADDRINUSE가 안 난다 (결정 5)", async () => {
      // **겹쳐서 띄우는 것이 이 축의 전부다.** 순차 기동만 재면 고정 포트로도 통과한다 —
      // 닫힌 포트는 대개 곧바로 다시 바인드되기 때문이다. 첫 하네스가 아직 살아 있는
      // 동안 둘째가 서는 것이 포트 0이 실제로 사 준 성질이다.
      const second = await startHarness();
      try {
        expect(second.port).not.toBe(0);
        expect(second.port).not.toBe(harness.port);
        const response = await fetch(`${second.url}/`);
        expect(response.status).toBe(200);
        await response.text();
      } finally {
        await second.stop();
      }
      // 둘째가 접혀도 첫째는 그대로 응답한다 — 종료가 서로를 넘어가지 않는다.
      const still = await fetch(`${harness.url}/`);
      expect(still.status).toBe(200);
      await still.text();
    });

    it("H-4 모의 범위 — 채운 팩토리 키가 {createModelClient, probeDocker}와 정확 상등이다", () => {
      const filled = Object.keys(harness.deps.factories ?? {}).sort();
      const declared = [...MOCKED_FACTORY_KEYS].sort();

      // ① 선언과 실물의 상등. 하네스가 키를 하나라도 더 채우면 여기서 갈린다.
      expect(filled).toEqual(declared);
      // ② 그 집합이 정확히 둘이고, 이름이 모델과 Docker 판정이다.
      expect(filled).toEqual(["createModelClient", "probeDocker"]);

      // ③ **나머지가 실물이라는 쪽.** 상등만으로는 「둘만 모의했다」까지고,
      //    「나머지가 존재한다」는 실물 기본 팩토리의 표면이 든다. 저장소·게이트·도구·
      //    경계·실행자가 그 표면에 있고 위 집합에 없다는 것이 결정 4의 기계 판이다.
      const real = realFactoryKeys();
      for (const key of filled) expect(real).toContain(key);
      const untouched = real.filter((key) => !filled.includes(key));
      expect(untouched.length, `실물로 남은 팩토리: ${JSON.stringify(untouched)}`).toBeGreaterThan(
        0,
      );
      for (const key of [
        "openStore",
        "createGate",
        "createTools",
        "createBoundary",
        "createWebTool",
        "createMemoryTool",
      ]) {
        expect(untouched, `${key}가 모의됐다 — 결정 4 위반`).toContain(key);
      }
    });

    it("H-5 임시 홈·워크스페이스를 쓴다 — 실사용 DB에 닿지 않는다", () => {
      // `~/.neo-agent/`를 건드리지 않는다는 계약의 관측 가능한 형태. 홈이 임시 뿌리
      // 아래에 있으면 실사용 경로에 닿는 수단 자체가 없다.
      expect(harness.home.startsWith(harness.root)).toBe(true);
      expect(harness.workspace.startsWith(harness.root)).toBe(true);
      expect(harness.deps.home).toBe(harness.home);
      expect(harness.deps.cwd).toBe(harness.workspace);
      expect(existsSync(harness.root)).toBe(true);
      // 상태 디렉터리를 0700으로 조여 두지 않으면 기동마다 권한 경고가 로그 첫 줄로
      // 나가고, 그러면 진짜 경고가 그 상시 소음에 묻힌다.
      expect(harness.log()).not.toContain("readable by other users");
    });
  });

  it("H-6 스위트가 접히면 임시 디렉터리가 사라진다", () => {
    // 위 `describe`의 `afterAll`이 이미 돌았다 — 이 축이 그 정리의 사후 관측이다.
    expect(firstRoot, "첫 하네스가 뜨지 않았다").toBeDefined();
    expect(existsSync(String(firstRoot))).toBe(false);
  });
});
