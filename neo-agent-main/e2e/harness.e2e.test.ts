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

import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  abortStartup,
  CLIDEPS_HOST_KEYS,
  type Harness,
  MOCKED_FACTORY_KEYS,
  realFactoryKeys,
  requireHandle,
  SERVE_OPTIONS_CONFIG_KEYS,
  SERVE_OPTIONS_HOST_KEYS,
  startHarness,
} from "./harness.ts";

/** 첫 하네스의 임시 뿌리. 마지막 축이 `afterAll` **뒤에** 이 경로의 부재를 잰다 */
let firstRoot: string | undefined;

describe("TECH-STACK §7.1 — 서버 하네스", () => {
  describe("기동한 하네스 하나", () => {
    // **선언 타입이 `| undefined`인 것이 계약이다.** `beforeAll`이 던지면 vitest는 아래
    // 축들을 건너뛰면서도 `afterAll`은 돌린다 — 그때 무가드로 역참조하면 정리가
    // TypeError로 접히고, 실패 목록의 첫 줄이 기동의 진짜 원인 대신 그 TypeError가 된다.
    let harnessHandle: Harness | undefined;
    const harness = (): Harness => requireHandle(harnessHandle, "하네스");

    beforeAll(async () => {
      harnessHandle = await startHarness();
      firstRoot = harnessHandle.root;
    });

    afterAll(async () => {
      await harnessHandle?.stop();
    });

    it("H-1 실주소를 돌려주고 포트가 0이 아니다", () => {
      // 커널이 고른 포트가 `onListening`을 지나 하네스 밖으로 나왔다는 것의 형태다.
      // `0`이 남아 있으면 주소를 못 잡은 것이고, 그 증상은 다음 축의 연결 거부다.
      expect(harness().port).not.toBe(0);
      expect(Number.isInteger(harness().port)).toBe(true);
      expect(harness().port).toBeGreaterThan(0);
      expect(harness().url).toBe(`http://127.0.0.1:${String(harness().port)}`);
    });

    it("H-2 화면 뿌리가 200을 돌려준다", async () => {
      // 실물 소켓 · 실물 자산이다. 자산 배선이 빠지면 여기가 404로 갈린다.
      const response = await fetch(`${harness().url}/`);
      expect(response.status, `로그: ${harness().log()}`).toBe(200);
      await response.text();
    });

    it("H-3 두 번째 하네스를 겹쳐 띄워도 EADDRINUSE가 안 난다 (결정 5)", async () => {
      // **겹쳐서 띄우는 것이 이 축의 전부다.** 순차 기동만 재면 고정 포트로도 통과한다 —
      // 닫힌 포트는 대개 곧바로 다시 바인드되기 때문이다. 첫 하네스가 아직 살아 있는
      // 동안 둘째가 서는 것이 포트 0이 실제로 사 준 성질이다.
      const second = await startHarness();
      try {
        expect(second.port).not.toBe(0);
        expect(second.port).not.toBe(harness().port);
        const response = await fetch(`${second.url}/`);
        expect(response.status).toBe(200);
        await response.text();
      } finally {
        await second.stop();
      }
      // 둘째가 접혀도 첫째는 그대로 응답한다 — 종료가 서로를 넘어가지 않는다.
      const still = await fetch(`${harness().url}/`);
      expect(still.status).toBe(200);
      await still.text();
    });

    it("H-4 모의 범위 — 채운 팩토리 키가 {createModelClient, probeDocker}와 정확 상등이다", () => {
      const filled = Object.keys(harness().deps.factories ?? {}).sort();
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
      expect(harness().home.startsWith(harness().root)).toBe(true);
      expect(harness().workspace.startsWith(harness().root)).toBe(true);
      expect(harness().deps.home).toBe(harness().home);
      expect(harness().deps.cwd).toBe(harness().workspace);
      expect(existsSync(harness().root)).toBe(true);
      // 상태 디렉터리를 0700으로 조여 두지 않으면 기동마다 권한 경고가 로그 첫 줄로
      // 나가고, 그러면 진짜 경고가 그 상시 소음에 묻힌다.
      expect(harness().log()).not.toContain("readable by other users");
    });

    it("H-7 B·C 키 집합 — 선언과 실물이 정확 상등이다 (§7.1 결정 4)", () => {
      // ① CliDeps의 B열. `factories`는 A(모의)의 자리이므로 뺀다 — 나머지가 B의 전부다.
      const filledDeps = Object.keys(harness().deps)
        .filter((key) => key !== "factories")
        .sort();
      const declaredDeps = [...CLIDEPS_HOST_KEYS].sort();
      expect(filledDeps, `실제 CliDeps 키(factories 제외): ${JSON.stringify(filledDeps)}`).toEqual(
        declaredDeps,
      );

      // ② ServeOptions의 B·C열. `harness.serveOptionKeys`는 하네스가 `runServe`에 넘긴
      //    옵션 상수의 `Object.keys()` 그대로다(선언 배열을 이어 붙여 재구성하지 않는다) —
      //    그래야 이 축이 「선언 = 선언」이 아니라 「선언 = 실물」을 잰다.
      const filledServe = [...harness().serveOptionKeys].sort();
      const declaredServe = [...SERVE_OPTIONS_HOST_KEYS, ...SERVE_OPTIONS_CONFIG_KEYS].sort();
      expect(filledServe, `실제 ServeOptions 키: ${JSON.stringify(filledServe)}`).toEqual(
        declaredServe,
      );
    });
  });

  it("H-6 스위트가 접히면 임시 디렉터리가 사라진다", () => {
    // 위 `describe`의 `afterAll`이 이미 돌았다 — 이 축이 그 정리의 사후 관측이다.
    expect(firstRoot, "첫 하네스가 뜨지 않았다").toBeDefined();
    expect(existsSync(String(firstRoot))).toBe(false);
  });

  describe("H-8 기동 실패 갈래 — 조립이 던지며 끝나도 정리가 돈다", () => {
    // **H-6이 재는 정리는 성공한 기동의 것이다.** 실패한 기동의 정리는 그 축이 원리적으로
    // 못 잰다 — 하네스가 안 서면 `firstRoot`가 없다. 그런데 그 갈래야말로 임시 트리가
    // 남기 쉬운 자리이고, 남은 트리는 다음 실행이 아니라 **다음 사람**이 발견한다.
    //
    // `startHarness`로는 이 갈래를 몰 수 없다. `runServe`는 조립 실패를 스스로 잡아
    // `EXIT_STARTUP_FAILED`를 **돌려주므로**(`packages/cli/src/serve.ts`) 거절이 밖으로
    // 안 나온다. 그래서 실패 갈래의 마무리가 `abortStartup`이라는 이름을 갖고, 이 축이
    // 그 함수에 거절을 직접 먹인다 — 재현이 「인위 실패를 주입한다」의 실물이다.

    function tempRoot(): string {
      return mkdtempSync(join(tmpdir(), "neo-e2e-abort-"));
    }

    it("거절로 끝난 기동에서도 임시 뿌리가 지워지고 진단이 선다", async () => {
      const root = tempRoot();
      // `await exit`를 재던지던 시절에는 이 호출 자체가 「boom」으로 터졌고, 그러면
      // 아래 두 단정이 볼 것이 없었다 — 뿌리는 남고 진단 Error는 만들어지지도 않았다.
      const failure = await abortStartup(Promise.reject(new Error("boom")), true, root, "로그본문");

      expect(existsSync(root), `거절 갈래에서 임시 뿌리가 남았다 — ${root}`).toBe(false);
      expect(failure).toBeInstanceOf(Error);
      // 거절의 사유가 진단에 실린다. 「코드 undefined」로 뭉개지면 원인을 다시 찾아야 한다.
      expect(failure.message).toContain("boom");
      expect(failure.message).toContain("로그본문");
      // TypeError가 아니라 하네스의 문장이다 — 이것이 원 증상과 갈리는 지점이다.
      expect(failure).not.toBeInstanceOf(TypeError);
    });

    it("값으로 끝난 기동에서는 종료 코드가 진단에 실린다", async () => {
      const root = tempRoot();
      const failure = await abortStartup(Promise.resolve(3), true, root, "로그본문");

      expect(existsSync(root)).toBe(false);
      expect(failure.message).toContain("코드 3");
      expect(failure.message).toContain("로그본문");
    });

    it("아직 안 끝난 기동은 기다리지 않고 시한 초과로 갈린다", async () => {
      const root = tempRoot();
      // 안 끝난 약속을 `settled: false`로 넘긴다. 여기서 기다려 버리면 이 함수가 그대로
      // 멈추고 증상이 다시 훅 타임아웃 하나로 뭉개진다 — 그래서 안 기다리는 것이 계약이다.
      const failure = await abortStartup(new Promise<number>(() => undefined), false, root, "로그");

      expect(existsSync(root)).toBe(false);
      expect(failure.message).toContain("30초");
    });
  });

  it("H-9 셋업이 실패한 스위트의 읽기는 무엇이 안 섰는지를 든다", () => {
    // 공유 핸들이 `| undefined`가 되면서 읽는 자리에 좁힘이 생겼고, 그 좁힘의 자리가
    // 진단이다. 비어 있을 때 나오는 것이 `Cannot read properties of undefined`가 아니라
    // 이름을 든 문장이어야, 실패 목록의 첫 줄이 여전히 셋업의 진짜 원인을 가리킨다.
    expect(() => requireHandle(undefined, "브라우저")).toThrowError(/브라우저/);
    expect(() => requireHandle(undefined, "브라우저")).toThrowError(/beforeAll/);
    // 채워져 있으면 그대로 지나간다 — 관문이 정상 갈래를 막지 않는다.
    expect(requireHandle("핸들", "무엇")).toBe("핸들");
  });
});
