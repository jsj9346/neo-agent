/**
 * 브라우저 모듈의 타입 검사가 **루트 명령에 실제로 걸려 있는가.** 정본은
 * `docs/WEB-UI.md` §9.3과 같은 문서 §9.4 **결정 13**이다.
 *
 * **기대값은 구현이 아니라 계약 문서에서만 도출했다.** 루트 `package.json`에서 읽은 것은
 * 스크립트 문자열이고, 무엇이 거기 있어야 하는가는 아래 두 절이 정한다.
 *
 *   - `WEB-UI.md` §9.3 — *"타입 검사는 이 디렉터리의 별도 `tsconfig.json`이 진다"*, 그리고
 *     *"루트의 타입 검사 명령이 그것을 **함께** 돈다"*. 같은 절이 계약의 외연도 못박았다:
 *     *"계약인 것은 **이 디렉터리가 타입 검사 모집단 안에 든다**는 것 하나다"*
 *   - `WEB-UI.md` §9.4 결정 13 — 배선이 목록 밖 앵커 이름을 쓰는 방향을 닫는 수단이
 *     스캔이 아니라 타입이다. *"목록 밖 이름은 **타입 검사가 컴파일 시점에 붉히고**"* ·
 *     *"§9.3이 이 디렉터리에 타입 검사를 걸어 둔 것(`allowJs`·`checkJs`)이 여기서 값을 낸다."*
 *   - `WEB-UI.md` §9.3 — 검사의 자리도 그 절이 든다: *"검사의 자리는 `packages/serve/test/`다."*
 *
 * ## 왜 이 축이 따로 서는가
 *
 * **결정 13의 강제 수단 전부가 한 줄에 산다.** 루트 타입 검사 명령이 이 디렉터리의 설정을
 * 함께 도는 조각이고, 그 조각이 빠지면 강제가 통째로 죽는데 **그것이 조용하다** — 남은 명령은
 * 성공하고, 목록 밖 이름을 쓴 배선은 아무 데서도 안 붉는다. 루트 `tsconfig.json`의 `include`가
 * `packages/*` 아래의 `.ts`만 들어 이 디렉터리의 `.js`는 그 모집단 밖이고, `checkJs`도 거기
 * 없다. 즉 조각이 빠진 상태와 걸린 상태가 **명령의 종료 코드로 구별되지 않는다.**
 * 그 형태를 `ARCHITECTURE.md` §2.6이 이름 붙였다.
 *
 * **이것은 §2.3·§9.3·§9.4가 세 번 거부한 텍스트 스캔 부류가 아니다.** 그 셋이 거부한 것은
 * 금지된 표기를 원문에서 찾는 검사이고, 못 찾으면 조용히 통과하므로 «막는다면서 못 막는»
 * 상태가 된다. 여기서 묻는 것은 반대 방향이다 — **있어야 할 조각이 있는가**이고, 없으면
 * 붉는다. §9.4 결정 8이 앵커 대조에 대해 같은 비대칭을 적었다.
 *
 * ## 이 파일이 재지 못하는 것
 *
 * **그 명령이 실제로 도는가는 안 잰다.** 여기서 읽는 것은 선언(스크립트 문자열)이고, 그것이
 * CI나 손에서 실제로 실행되는가는 이 모집단 밖이다. 그리고 **그 검사가 무엇을 붉히는가**도 안
 * 잰다 — 그쪽은 `wiring.contract.test.ts`의 `@ts-expect-error` 축이 `pnpm typecheck` 자신의
 * 종료 코드로 진다. 두 축은 서로를 전제한다: 저쪽은 이 조각이 걸려 있다고 가정하고, 이쪽은
 * 걸린 조각이 무엇을 하는지 안 본다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로 있는
 * 부분 문자열이고, 문서를 지목하는 자리는 절 번호와 결정 번호로 한다.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { AUTHORED_ASSET_ROOT } from "../src/assets.ts";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** 워크스페이스 기준 상대 경로. 손으로 적지 않고 루트 상수에서 파생한다 */
const workspacePath = (absolute: string): string =>
  relative(REPO_ROOT, absolute).split(sep).join("/").replace(/\/$/, "");

/**
 * 명령이 들어야 하는 조각. **손으로 적지 않는다** — 디렉터리가 개명되면 이 값이 따라 움직이고,
 * 리터럴로 두면 개명이 아래 축을 조용히 통과시킨다.
 */
const CLIENT_TSCONFIG = `${workspacePath(AUTHORED_ASSET_ROOT)}/tsconfig.json`;

const rootPackage = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as Readonly<{
  scripts?: Readonly<Record<string, string>>;
}>;

const scripts = rootPackage.scripts ?? {};

/**
 * 그 명령이 브라우저 모듈의 설정을 함께 도는가. **순수 함수인 것이 역검증의 조건이다** —
 * 상수를 안에서 읽으면 심은 표본을 이 술어에 먹일 수 없고, 그때 역검증은 실물과 다른 코드를
 * 재게 된다.
 */
const runsClientTypecheck = (script: string): boolean => script.includes(CLIENT_TSCONFIG);

describe("§9.3 — 브라우저 모듈이 타입 검사 모집단 안에 있다", () => {
  test("경로가 손 리터럴이 아니라 루트 상수에서 나온다", () => {
    // 이 단언이 없으면 위 파생이 엉뚱한 값을 내도 아래 축이 그것을 그대로 쓴다.
    expect(CLIENT_TSCONFIG).toBe("packages/serve/client/tsconfig.json");
  });

  test("그 설정 파일이 실재한다 — 명령이 없는 파일을 가리키지 않는다", () => {
    expect(existsSync(join(REPO_ROOT, CLIENT_TSCONFIG)), "설정이 없다").toBe(true);
  });

  test("타입 검사 명령이 실재하고 비어 있지 않다 — 빈 문자열의 조용한 그린이 없다", () => {
    expect(scripts.typecheck, "루트에 타입 검사 명령이 없다").toBeDefined();
    expect((scripts.typecheck ?? "").length).toBeGreaterThan(0);
  });

  test("타입 검사 명령이 브라우저 모듈의 설정을 함께 돈다", () => {
    // §9.3의 계약 그대로다. 이 조각이 빠지면 결정 13의 유일한 강제 수단이 죽고 남은 명령은
    // 성공한다.
    expect(
      runsClientTypecheck(scripts.typecheck ?? ""),
      "타입 검사 명령이 브라우저 모듈의 설정을 안 돈다 — 결정 13의 강제가 조용히 죽었다",
    ).toBe(true);
  });

  test("통합 게이트가 그 명령을 문다 — 조각만 있고 부르는 자리가 없으면 같은 침묵이다", () => {
    // 명령에 조각이 있어도 아무도 그 명령을 안 부르면 강제는 여전히 0이다. 게이트가 이름으로
    // 부르므로 여기서 재는 것은 이름의 포함 하나다.
    expect(scripts.check, "통합 게이트가 없다").toBeDefined();
    expect(scripts.check ?? "", "통합 게이트가 타입 검사를 안 문다").toContain("typecheck");
  });

  test("역검증 — 조각이 빠진 명령을 술어가 실패로 낸다", () => {
    // 술어가 무엇이든 참이라 하면 위 축의 그린이 아무것도 뜻하지 않는다.
    expect(runsClientTypecheck("tsc --noEmit")).toBe(false);
    expect(runsClientTypecheck("")).toBe(false);
  });

  test("역검증 — 다른 설정을 도는 명령도 실패다. 경로가 실제로 대조된다", () => {
    const swapped = (scripts.typecheck ?? "").replace(
      CLIENT_TSCONFIG,
      "packages/core/tsconfig.json",
    );
    expect(swapped, "치환이 아무것도 안 바꿨다 — 이 역검증이 공허하다").not.toBe(
      scripts.typecheck ?? "",
    );
    expect(runsClientTypecheck(swapped)).toBe(false);
  });

  test("역검증 — 조각을 든 명령은 통과한다. 술어가 전부를 거부하는 상태가 아니다", () => {
    expect(runsClientTypecheck(`tsc --noEmit -p ${CLIENT_TSCONFIG}`)).toBe(true);
  });
});
