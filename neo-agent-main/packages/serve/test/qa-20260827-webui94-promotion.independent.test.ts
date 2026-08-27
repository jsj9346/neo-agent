/**
 * 독립 QA — 2026-08-27. 검증 대상 넷과 정본 다섯 절의 대조.
 *
 * **검증 대상** (디스패치가 지정한 것 그대로):
 *   - `packages/serve/test/assets.contract.test.ts`
 *   - `packages/serve/test/client-typecheck.contract.test.ts`
 *   - `packages/serve/client/wiring.js`
 *   - `packages/serve/test/wiring.contract.test.ts`
 *
 * **정본**: `docs/WEB-UI.md` §9.4(결정 5 · 결정 13) · §9.5(결정 1 · 결정 4) · §9.3.
 *
 * **이 파일은 계약 테스트가 아니라 QA 산출물이다.** 등급과 재현 방법은
 * `plans/20260827-webui94-qa.md`가 든다. 여기 그린이 계약의 강제를 뜻하지 않는다 —
 * §9.4 결정 13이 *"텍스트 스캔을 계약으로 올리지 않는다"*로 그은 경계와 같은 자리다.
 *
 * ## 등급 표기와 단정의 방향
 *
 * 등급은 셋이다 — `[계약 위반]` · `[문서 부정확]` · `[미규정]`. 여기에 재는 자리가 아예
 * 없는 것을 `[커버리지 구멍]`으로 따로 든다.
 *
 * **판정을 든 단정은 계약 기대값이 아니라 오늘의 동작을 못박는다.** 결함 있는 값을 그대로
 * 고정하고 판정은 마커와 위 산출물이 든다 — 그래야 그 결함이 처분되는 날 단정이 붉어
 * 처분자가 마커를 함께 걷는다(`MARKERS.md` §4.2). 계약 기대값을 단정으로 두면 처분 전까지
 * 이 파일이 상주 red가 되고, 그때 새로 난 red가 묻힌다.
 *
 * ## 기대값의 출처
 *
 * 구현을 읽고 기대값을 만들지 않았다. 각 축이 §번호로 근거를 들고, 정본이 안 든 것은
 * `[미규정]`으로 표시하고 임의 판정하지 않는다. 검증 대상이 문서와 다르면 이 파일은 문서
 * 편에 서고 red를 그대로 남긴다.
 *
 * ## 이 파일이 재지 못하는 것
 *
 * 1. **원격을 열지 않는다.** `prompt` 주소가 실재하는지는 §9.2가 이미 한계로 적었다.
 * 2. **브라우저를 대신하지 않는다.** 앵커의 자리가 옳은가·화면이 실제로 그려지는가는 루트
 *    `MILESTONE.md`의 C2가 진다.
 * 3. **원문 대조 축은 부분 문자열이다.** 아래 「원문을 읽는」 축들은 대상 파일의 텍스트를
 *    읽으므로 주석 안의 표기도 존재로 읽는다. 그 방향이 안전한 자리에서만 쓴다 —
 *    전부 「있어야 할 것이 있는가」이지 「금지된 것이 없는가」가 아니다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로 있는
 * 부분 문자열이고, 문서를 지목하는 자리는 절 번호와 결정 번호로 한다.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { ASSET_MANIFEST, AUTHORED_ASSET_ROOT, isHtmlDocumentEntry } from "../src/assets.ts";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const TEST_DIR = fileURLToPath(new URL("./", import.meta.url));

const workspacePath = (absolute: string): string =>
  relative(REPO_ROOT, absolute).split(sep).join("/").replace(/\/$/, "");

const readRepo = (path: string): string => readFileSync(join(REPO_ROOT, path), "utf8");
const readTest = (file: string): string => readFileSync(join(TEST_DIR, file), "utf8");

/**
 * 줄 전체가 주석인 JSONC를 판다. **줄 안쪽 주석은 안 다룬다** — 대상 셋(루트·베이스·클라이언트
 * 설정)이 전부 전줄 주석만 쓰는 것을 아래 축 0이 잰다. 다루는 척하면 이 파서가 문자열 안의
 * `//`를 잘라 조용히 다른 값을 낸다.
 */
function parseJsonc(text: string): unknown {
  return JSON.parse(
    text
      .split("\n")
      .map((line) => (/^\s*\/\//.test(line) ? "" : line))
      .join("\n"),
  );
}

type TsConfig = {
  readonly extends?: string;
  readonly include?: readonly string[];
  readonly compilerOptions?: Readonly<Record<string, unknown>>;
};

const CLIENT_TSCONFIG_PATH = `${workspacePath(AUTHORED_ASSET_ROOT)}/tsconfig.json`;
const CLIENT_TSCONFIG_TEXT = readRepo(CLIENT_TSCONFIG_PATH);
const BASE_TSCONFIG_TEXT = readRepo("tsconfig.base.json");
const ROOT_TSCONFIG_TEXT = readRepo("tsconfig.json");

const clientTsConfig = parseJsonc(CLIENT_TSCONFIG_TEXT) as TsConfig;
const baseTsConfig = parseJsonc(BASE_TSCONFIG_TEXT) as TsConfig;
const rootTsConfig = parseJsonc(ROOT_TSCONFIG_TEXT) as TsConfig;

const CLIENT_TYPECHECK_TEST = readTest("client-typecheck.contract.test.ts");
const ASSETS_CONTRACT_TEST = readTest("assets.contract.test.ts");
const WIRING_CONTRACT_TEST = readTest("wiring.contract.test.ts");

/* ========================================================================= *
 * 축 0 — 아래 축들이 공집합에서 참이 되지 않는다
 * ========================================================================= */

describe("축 0 — 재료가 실재한다", () => {
  test("설정 셋과 대상 테스트 셋을 실제로 읽었다", () => {
    for (const [label, text] of [
      ["client/tsconfig.json", CLIENT_TSCONFIG_TEXT],
      ["tsconfig.base.json", BASE_TSCONFIG_TEXT],
      ["tsconfig.json", ROOT_TSCONFIG_TEXT],
      ["client-typecheck.contract.test.ts", CLIENT_TYPECHECK_TEST],
      ["assets.contract.test.ts", ASSETS_CONTRACT_TEST],
      ["wiring.contract.test.ts", WIRING_CONTRACT_TEST],
    ] as const) {
      expect(text.length, `${label}이 비었다`).toBeGreaterThan(0);
    }
  });

  test("JSONC 파서가 값을 실제로 냈다 — 빈 객체의 조용한 그린이 아니다", () => {
    expect(Object.keys(clientTsConfig.compilerOptions ?? {}).length).toBeGreaterThan(0);
    expect(Object.keys(baseTsConfig.compilerOptions ?? {}).length).toBeGreaterThan(0);
  });

  test("대상 설정이 전줄 주석만 쓴다 — 위 파서의 전제", () => {
    // 줄 안쪽 주석이 있으면 위 파서가 그것을 못 걷고 `JSON.parse`가 던진다. 던지지 않았다는
    // 것만으로는 전제가 안 서므로(값이 우연히 유효할 수 있다) 표기를 직접 센다.
    for (const [label, text] of [
      ["client/tsconfig.json", CLIENT_TSCONFIG_TEXT],
      ["tsconfig.base.json", BASE_TSCONFIG_TEXT],
    ] as const) {
      const inline = text
        .split("\n")
        .filter((line) => line.includes("//") && !/^\s*\/\//.test(line))
        .filter((line) => !line.includes("http://") && !line.includes("https://"));
      expect(inline, `${label}에 줄 안쪽 주석이 있다`).toEqual([]);
    }
  });
});

/* ========================================================================= *
 * 축 1 — §9.3의 설정 항 넷이 값 수준에서 아무 데서도 안 재진다
 *
 * §9.3이 이 디렉터리에 건 것은 파일의 존재가 아니라 **검사**다:
 * *"타입 검사는 이 디렉터리의 별도 `tsconfig.json`이 진다"*, 그리고 하위 항 넷 —
 * *"`allowJs`·`checkJs`"* · *"`lib`에 `DOM`을 더한다"* · *"`noEmit`"* · 모집단(`.js`).
 * §9.4 결정 13은 그 배치가 자기 강제 수단이라고 명시로 잇는다:
 * *"§9.3이 이 디렉터리에 타입 검사를 걸어 둔 것(`allowJs`·`checkJs`)이 여기서 값을 낸다."*
 *
 * **검증 대상 `client-typecheck.contract.test.ts`가 재는 것은 셋뿐이다** — 설정 파일의
 * 실재 · 루트 명령이 그 경로를 든다는 것 · 통합 게이트가 그 명령을 문다는 것. 설정의 **값**은
 * 한 자리도 안 읽는다. 아래가 그 공백을 이름으로 든다.
 * ========================================================================= */

const clientOptions = clientTsConfig.compilerOptions ?? {};

describe("축 1 — 브라우저 모듈 타입 검사 설정의 값 (WEB-UI §9.3 · 결정 13)", () => {
  test("적합 — `allowJs`·`checkJs`가 둘 다 참이다", () => {
    expect(clientOptions.allowJs, "§9.3이 든 `allowJs`가 참이 아니다").toBe(true);
    expect(clientOptions.checkJs, "§9.3이 든 `checkJs`가 참이 아니다").toBe(true);
  });

  test("적합 — `lib`이 `DOM`을 들고 `noEmit`이 참이다", () => {
    expect(clientOptions.lib, "§9.3의 `DOM`이 이 설정에 없다").toContain("DOM");
    expect(clientOptions.noEmit, "§9.3의 `noEmit`이 참이 아니다").toBe(true);
  });

  test("적합 — 모집단이 `.js`다", () => {
    expect(clientTsConfig.include ?? [], "이 설정이 `.js`를 모집단으로 안 든다").toContain(
      "**/*.js",
    );
  });

  test("[커버리지 구멍] 검증 대상이 그 설정의 바이트를 한 번도 안 읽는다", () => {
    // §9.3의 하위 항 넷이 계약인데, 검증 대상은 설정 **파일의 실재**만 잰다.
    //
    // **이름의 부재로 재지 않는다** — 그 파일의 머리 주석이 §9.3을 인용하며 `allowJs`·`checkJs`를
    // 이미 문자열로 든다. 재는 것은 한 겹 아래다: 설정의 바이트를 안 읽으면 그 값을 잴 수
    // 없으므로, 「어느 `readFileSync`도 그 경로를 안 연다」가 공백의 정확한 형태다.
    const reads = [...CLIENT_TYPECHECK_TEST.matchAll(/readFileSync\(([^)]*)\)/g)].map(
      (match) => match[1] ?? "",
    );
    expect(reads.length, "그 파일에 파일 읽기가 없다 — 이 축이 공허하다").toBeGreaterThan(0);
    expect(
      reads.filter((args) => args.includes("CLIENT_TSCONFIG")),
      "검증 대상이 그 설정을 읽고 있다면 이 발견은 낡았다",
    ).toEqual([]);
    // 대신 여는 것은 실재 하나다 — 그것이 이 발견의 대비쌍이다.
    expect(CLIENT_TYPECHECK_TEST, "실재 축조차 없다면 발견의 형태가 다르다").toContain(
      "existsSync(join(REPO_ROOT, CLIENT_TSCONFIG))",
    );
  });

  test("[커버리지 구멍] 오늘 이 설정의 값을 재는 유일한 술어가 `false`도 통과시킨다", () => {
    // 형제 QA(`qa-20260827-webui94-anchor-funnel.independent.test.ts` 축 3)가 이 자리를 재되
    // 술어가 원문 포함이다. `"checkJs": false`도 그 문자열을 들으므로 참이 된다 — 즉 값이
    // 뒤집혀도 아무 데서도 안 붉는다. `ARCHITECTURE.md` §2.6이 이름 붙인 형태다.
    const textPredicate = (config: string): boolean => config.includes("checkJs");
    const flipped = CLIENT_TSCONFIG_TEXT.replace('"checkJs": true', '"checkJs": false');
    expect(flipped, "치환이 아무것도 안 바꿨다 — 이 축이 공허하다").not.toBe(CLIENT_TSCONFIG_TEXT);
    expect(textPredicate(flipped), "원문 포함 술어가 뒤집힌 값을 잡는다면 이 발견은 낡았다").toBe(
      true,
    );
    // 값 술어는 같은 표본을 잡는다 — 처분의 방향이 여기라는 것.
    expect(((parseJsonc(flipped) as TsConfig).compilerOptions ?? {}).checkJs).toBe(false);
  });

  test("역검증 — 값 술어가 전부를 참이라 하지 않는다", () => {
    const stripped = CLIENT_TSCONFIG_TEXT.replace('"allowJs": true,', "");
    expect(stripped).not.toBe(CLIENT_TSCONFIG_TEXT);
    expect(((parseJsonc(stripped) as TsConfig).compilerOptions ?? {}).allowJs).toBeUndefined();
  });
});

/* ========================================================================= *
 * 축 2 — §9.3이 DOM 전역의 누출을 막는 쪽을 아무 기계도 안 잰다
 *
 * 그 절이 설정을 가른 근거의 절반이 이것이다 —
 * *"설정을 가르지 않으면 DOM 전역이 `src/` 전체로 새어"*
 * *"서버 코드가 브라우저 API를 쓰는 것을 타입이 안 막게 된다."*
 * 그 성질을 세우는 것은 `tsconfig.base.json`의 `lib`에 `DOM`이 **없다**는 사실 하나다.
 * ========================================================================= */

describe("축 2 — DOM 경계의 반대편 (WEB-UI §9.3)", () => {
  test("적합 — `tsconfig.base.json`의 `lib`에 `DOM`이 없다", () => {
    const lib = (baseTsConfig.compilerOptions ?? {}).lib;
    expect(Array.isArray(lib), "`lib`이 배열이 아니다 — 아래 단언이 공허하다").toBe(true);
    expect(lib as readonly string[], "베이스 설정에 DOM이 새어 있다").not.toContain("DOM");
    expect((lib as readonly string[]).length, "`lib`이 비었다").toBeGreaterThan(0);
  });

  test("적합 — 루트 설정이 `checkJs`를 안 든다", () => {
    // 이것이 참이라야 *"이 디렉터리가 타입 검사 모집단 안에 든다"*가 뜻을 갖는다 — 루트가
    // `.js`를 검사하면 브라우저 모듈의 검사자가 둘이 되고, 그때 축 1의 공백이 다른 모양이 된다.
    expect((rootTsConfig.compilerOptions ?? {}).checkJs).toBeUndefined();
    expect((baseTsConfig.compilerOptions ?? {}).checkJs).toBeUndefined();
  });

  test("[커버리지 구멍] 이 둘을 재는 자리가 `packages/*/test/` 어디에도 없었다", () => {
    // 이 파일이 서기 전의 사실을 못박는다. 모집단은 이 파일을 뺀 형제 전부이고, 재는 것은
    // 「베이스 설정을 여는 자리가 있는가」다 — 열지 않으면 값을 잴 수 없다.
    const siblings = ["assets.contract.test.ts", "client-typecheck.contract.test.ts"];
    for (const file of siblings) {
      expect(
        readTest(file).includes("tsconfig.base"),
        `${file}이 베이스 설정을 연다면 이 발견은 낡았다`,
      ).toBe(false);
    }
  });
});

/* ========================================================================= *
 * 축 3 — 실증: `checkJs`가 결정 13의 강제를 실제로 진다
 *
 * 위 두 축은 값을 읽을 뿐이다. 그 값이 **무엇을 지는가**는 컴파일러가 답해야 하고, 답하지
 * 않으면 축 1의 발견이 「설정 항 하나가 안 재진다」는 형식적 지적으로만 남는다.
 *
 * 재는 것 셋:
 *   ① `checkJs`가 켜져 있으면 목록 밖 앵커 이름이 컴파일에서 붉는다 (결정 13의 계약)
 *   ② 꺼져 있으면 **같은 코드가 조용히 통과한다** (그 강제가 이 한 값에 산다는 실증)
 *   ③ 실제 `Document`가 통로의 원천 타입에 대입된다 — 오늘 아무 기계도 안 재는 자리다
 *
 * **왜 이 배치인가.** 검증 대상 `wiring.contract.test.ts`의 `@ts-expect-error` 축은 `.ts`
 * 파일에 살아 **루트** 타입 검사가 판정한다. 즉 그 축은 `checkJs`가 꺼져도 그대로 그린이다 —
 * 그 축의 그린은 브라우저 모듈 자신이 검사받는다는 것을 뜻하지 않는다.
 * ========================================================================= */

const TSC = join(REPO_ROOT, "node_modules", ".bin", "tsc");
const scratch = mkdtempSync(join(tmpdir(), "neo-qa-webui94-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** 임시 프로그램 하나를 컴파일해 진단을 낸다. 종료 코드가 아니라 출력을 돌려준다 */
function typecheck(probe: string, options: Readonly<Record<string, unknown>>): string {
  writeFileSync(join(scratch, "package.json"), JSON.stringify({ type: "module" }));
  writeFileSync(join(scratch, "probe.js"), probe);
  const config = join(scratch, `tsconfig.${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(
    config,
    JSON.stringify({
      extends: join(REPO_ROOT, "tsconfig.base.json"),
      compilerOptions: { types: [], noEmit: true, ...options },
      include: ["probe.js"],
    }),
  );
  try {
    execFileSync(TSC, ["--noEmit", "-p", config], { cwd: REPO_ROOT, encoding: "utf8" });
    return "";
  } catch (error) {
    return String((error as { stdout?: string }).stdout ?? "");
  }
}

/** 임시 프로그램에서 통로를 여는 상대 지정자. 손으로 적으면 자리가 바뀔 때 조용히 낡는다 */
const WIRING_SPECIFIER = relative(scratch, join(AUTHORED_ASSET_ROOT, "wiring.js"))
  .split(sep)
  .join("/");

const OFF_LIST_PROBE = [
  `import { anchorElement } from "${WIRING_SPECIFIER}";`,
  "/** @param {Document} doc */",
  "export function boom(doc) {",
  '  return [anchorElement(doc, "definitely-not-an-anchor"), anchorElement(doc, "transcript")];',
  "}",
  "",
].join("\n");

const CLIENT_LIKE = { allowJs: true, checkJs: true, lib: ["ES2024", "DOM"] } as const;

describe("축 3 — `checkJs`가 무엇을 지는가 (WEB-UI §9.3 · §9.4 결정 13)", () => {
  test("적합 — 통로가 실제 `Document`를 원천으로 받는다", () => {
    // 검증 대상의 런타임 축은 전부 가짜 원천을 주입한다. 그래서 통로의 시그니처가 실제 DOM과
    // 어긋나도 그 축들은 전부 그린이다 — 이 축이 그 공백을 메운다. `assets.ts`가 같은 형태를
    // 이미 쓴다(`ServerResponse extends AssetResponse` 컴파일 대조).
    const diagnostics = typecheck(
      [
        `import { anchorElement } from "${WIRING_SPECIFIER}";`,
        "/** @param {Document} doc */",
        "export function ok(doc) {",
        '  return anchorElement(doc, "transcript");',
        "}",
        "",
      ].join("\n"),
      CLIENT_LIKE,
    );
    expect(diagnostics, "실제 `Document`가 통로의 원천 타입에 안 맞는다").toBe("");
  }, 60_000);

  test("적합 — `checkJs`가 켜지면 목록 밖 이름이 붉는다", () => {
    const diagnostics = typecheck(OFF_LIST_PROBE, CLIENT_LIKE);
    expect(diagnostics, "결정 13의 강제가 안 선다").toContain("definitely-not-an-anchor");
    expect(diagnostics, "목록 안 이름까지 붉었다 — 술어가 전부를 거부한다").not.toContain(
      "transcript'",
    );
  }, 60_000);

  test("[커버리지 구멍] `checkJs`가 꺼지면 같은 코드가 조용히 통과한다", () => {
    const diagnostics = typecheck(OFF_LIST_PROBE, { ...CLIENT_LIKE, checkJs: false });
    expect(
      diagnostics,
      "`checkJs`가 꺼져도 붉는다면 이 발견은 낡았다 — 강제가 그 값에 안 산다",
    ).toBe("");
  }, 60_000);
});

/* ========================================================================= *
 * 축 4 — §9.5 결정 4의 진입점 술어가 실행 스크립트를 **과소 계수**한다
 *
 * 그 항이 세는 대상을 못박았다: *"진입점은 실행되는 스크립트다"*. 무엇이 실행되는가는 정본이
 * 열거하지 않고 브라우저가 정한다.
 *
 * 검증 대상 `assets.contract.test.ts`의 술어는 실행 갈래를 넷으로 든다(`""`·`module`·
 * `text/javascript`·`application/javascript`). 그 밖의 자바스크립트 미디어 타입과, `type`이
 * 아닌 속성에 `type`이 접미로 붙은 형태(`data-type`)가 **0으로 세어진다.**
 *
 * **방향이 문제다.** 결정 4가 요구하는 것이 *"정확히 하나"*라 과대 계수는 축을 붉히지만
 * **과소 계수는 조용히 통과한다** — 둘째 진입점이 실재하는데 하나로 세어진다. 그 술어의 주석은
 * 반대로 적는다: *"대개 이 축을 붉히는 쪽으로 넘어진다"*.
 *
 * ## 아래 단정들은 계약을 재지 않는다 — **오늘의 동작을 못박는다**
 *
 * 판정은 `[계약 위반 — V-1]`·`[계약 위반 — V-2]` 마커와 `plans/20260827-webui94-qa.md`가 들고,
 * 단정은 결함 있는 오늘의 값을 그대로 고정한다. 그래서 그 결함이 처분되는 날 **이 단정이
 * 붉고**, 처분자가 마커를 함께 걷게 된다(`MARKERS.md` §4.2 — 판정이 내려지면 셋을 한 커밋에).
 *
 * 계약 기대값을 단정으로 두는 갈래를 안 고른 이유는 그것이 처분 전까지 항상 red라서다 —
 * red가 상주하면 그 파일의 red가 신호이기를 그만두고, 그때 새로 난 red가 묻힌다.
 * **각 단정에 대비쌍을 함께 둔다** — 없으면 못박은 값이 술어가 통째로 눈먼 상태와 구별되지
 * 않는다.
 * ========================================================================= */

/**
 * 검증 대상의 술어를 **원문에서 복원한 사본**이다. 사본인 것이 이 축의 한계이고, 사본이
 * 낡는 것은 아래 첫 축이 원문 대조로 막는다 — 실물의 열거가 바뀌면 그 축이 먼저 붉는다.
 */
const COPIED_EXECUTABLE_TYPES = ["", "module", "text/javascript", "application/javascript"];

function copiedExecutableScriptTags(html: string): readonly string[] {
  const tags: string[] = [];
  for (const match of html.matchAll(/<script\b[^>]*>/gi)) {
    const tag = match[0];
    const type = /\btype\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1]?.trim().toLowerCase();
    if (type === undefined || COPIED_EXECUTABLE_TYPES.includes(type.split(";")[0]?.trim() ?? ""))
      tags.push(tag);
  }
  return tags;
}

/** HTML이 실행하는 미디어 타입의 essence. 표준의 열거이지 이 파일의 발명이 아니다 */
const JAVASCRIPT_MIME_ESSENCES = [
  "application/ecmascript",
  "application/javascript",
  "application/x-ecmascript",
  "application/x-javascript",
  "text/ecmascript",
  "text/javascript",
  "text/jscript",
  "text/livescript",
  "text/x-ecmascript",
  "text/x-javascript",
];

const SCREEN_HTML = readFileSync(
  join(REPO_ROOT, "packages/serve/assets", ASSET_MANIFEST["/"].file),
  "utf8",
);

describe("축 4 — 진입점 술어의 과소 계수 (WEB-UI §9.5 결정 4)", () => {
  test("사본이 실물과 같다 — 아래 축들이 다른 코드를 재지 않는다", () => {
    for (const type of COPIED_EXECUTABLE_TYPES) {
      expect(
        ASSETS_CONTRACT_TEST.includes(`"${type}"`),
        `실물의 열거에 ${type || "빈 문자열"}이 없다 — 사본이 낡았다`,
      ).toBe(true);
    }
    expect(ASSETS_CONTRACT_TEST).toContain("EXECUTABLE_SCRIPT_TYPES");
    expect(
      copiedExecutableScriptTags(SCREEN_HTML),
      "실물 화면에서 사본이 실물과 다른 수를 낸다",
    ).toHaveLength(1);
  });

  /**
   * [계약 위반 — V-1] 술어가 실행 갈래를 넷으로 들어 **브라우저가 실행하는 미디어 타입
   * 여덟을 데이터로 읽는다.**
   *
   * - **계약대로면**: 아래 `missed`가 빈 목록이어야 한다. §9.5 결정 4가
   *   *"진입점은 실행되는 스크립트다"*로 세는 대상을 못박았고, 무엇이 실행되는가는 정본이
   *   열거하지 않고 브라우저가 정한다.
   * - **오늘은**: 여덟이 빠진다(`application/ecmascript` · `application/x-ecmascript` ·
   *   `application/x-javascript` · `text/ecmascript` · `text/jscript` · `text/livescript` ·
   *   `text/x-ecmascript` · `text/x-javascript`).
   * - **왜 조용한가**: 결정 4가 요구하는 것이 *"스크립트 진입점은 정확히 하나다."*라
   *   **과대 계수는 붉고 과소 계수는 통과한다.** 둘째 진입점이 저 타입 중 하나로 실재하면
   *   `assets.contract.test.ts`의 그 축은 1을 세고 그린이다.
   * - **아래 단정은 계약을 재지 않는다 — 오늘의 동작을 못박는다.** 처분되면 이 단정이
   *   붉고, 그때 처분자가 이 마커를 함께 걷는다.
   * - 판정: `plans/20260827-webui94-qa.md` V-1
   */
  test("[계약 위반 — V-1] 오늘의 동작 — 실행 미디어 타입 여덟이 0으로 세어진다", () => {
    const missed = JAVASCRIPT_MIME_ESSENCES.filter(
      (essence) =>
        copiedExecutableScriptTags(`<script type="${essence}" src="/client/x.js"></script>`)
          .length === 0,
    );
    expect(missed, "V-1이 처분됐다면 이 목록이 비고 마커를 걷을 때다").toEqual([
      "application/ecmascript",
      "application/x-ecmascript",
      "application/x-javascript",
      "text/ecmascript",
      "text/jscript",
      "text/livescript",
      "text/x-ecmascript",
      "text/x-javascript",
    ]);
    // 대비쌍 — 목록에 든 둘은 정상적으로 실행으로 세어진다. 없으면 위 목록이 술어가 전부를
    // 데이터라 하는 상태와 구별되지 않는다.
    expect(missed).not.toContain("text/javascript");
    expect(missed).not.toContain("application/javascript");
  });

  /**
   * [계약 위반 — V-2] `\btype` 앞의 하이픈이 단어 경계라 `data-type="json"`이 `type`
   * 속성으로 읽힌다.
   *
   * - **계약대로면**: `<script data-type="json" src="…">`는 `type` 속성이 **없는** 고전
   *   스크립트이므로 브라우저가 실행한다 — 아래 수가 **1**이어야 한다.
   * - **오늘은**: 0이다. 데이터 블록으로 분류된다.
   * - **V-1과 따로 드는 근거는 처분이 다르다는 것이다** — V-1은 목록의 외연이고 이것은
   *   정규식의 경계다. 목록을 넓혀도 이 갈래는 그대로 남는다.
   * - **아래 단정은 계약을 재지 않는다 — 오늘의 동작을 못박는다.**
   * - 판정: `plans/20260827-webui94-qa.md` V-2
   */
  test("[계약 위반 — V-2] 오늘의 동작 — `data-type` 속성이 진입점을 0으로 만든다", () => {
    expect(
      copiedExecutableScriptTags('<script data-type="json" src="/client/x.js"></script>'),
      "V-2가 처분됐다면 이 수가 1이 되고 마커를 걷을 때다",
    ).toHaveLength(0);
    // 대비쌍 — 같은 태그에서 `data-` 접두만 걷으면 실행으로 세어진다. 즉 이 0을 만드는 것이
    // 태그의 다른 성질이 아니라 그 접두 하나다.
    expect(
      copiedExecutableScriptTags('<script src="/client/x.js"></script>'),
      "접두 없는 같은 태그도 0이면 원인이 다른 데 있다",
    ).toHaveLength(1);
  });

  test("[계약 위반 — V-1] 오늘의 동작 — 그래서 둘째 진입점이 실재해도 축이 하나로 센다", () => {
    // 결정 4가 든 것은 *"스크립트 진입점은 정확히 하나다."*이고, 아래 화면에는 실행되는
    // 스크립트가 둘이다. 실물 축이 쓰는 술어는 1을 낸다 — 위반이 조용히 통과한다.
    // 이것이 V-1의 **귀결**이므로 같은 마커를 단다(MARKERS.md §3.3 — 계수 단위는 판정이다).
    const planted = SCREEN_HTML.replace(
      "</body>",
      '<script type="text/ecmascript" src="/client/second.js"></script></body>',
    );
    expect(planted, "치환이 아무것도 안 바꿨다").not.toBe(SCREEN_HTML);
    expect(
      copiedExecutableScriptTags(planted),
      "V-1이 처분됐다면 이 수가 2가 되고 마커를 걷을 때다",
    ).toHaveLength(1);
  });

  test("역검증 — 같은 술어가 `module` 둘째는 잡는다. 눈이 통째로 먼 것이 아니다", () => {
    const planted = SCREEN_HTML.replace(
      "</body>",
      '<script type="module" src="/client/second.js"></script></body>',
    );
    expect(copiedExecutableScriptTags(planted)).toHaveLength(2);
  });

  test("[문서 부정확] 그 술어의 한계 목록이 대소문자를 한계로 든다 — 실물은 흡수한다", () => {
    // 실물 주석이 *"`type` 값이 따옴표 없이 적히거나 대소문자가 섞인 변형은 아래 정규식의
    // 외연 밖이다"*라 적는다. 뒤엣것은 거짓이다 — 정규식의 `i` 플래그와 `.toLowerCase()`가
    // 둘 다 걸려 있다. 한계를 실제보다 넓게 적는 것은 과대주장의 거울이고, 그 대가는 실재하는
    // 한계(위 두 축)가 목록에 없다는 것이다.
    expect(
      copiedExecutableScriptTags('<script TYPE="MODULE" src="/client/x.js"></script>'),
      "대소문자가 실제로 한계라면 이 발견은 낡았다",
    ).toHaveLength(1);
    expect(ASSETS_CONTRACT_TEST, "실물 주석이 그 한계를 안 든다면 이 발견은 낡았다").toContain(
      "대소문자가 섞인 변형",
    );
  });
});

/* ========================================================================= *
 * 축 5 — §9.3의 명령 조각 술어 [미규정]
 *
 * 검증 대상 `client-typecheck.contract.test.ts`가 쓰는 술어는 부분 문자열 포함이다. §9.3이
 * *"파일 이름·명령의 형태는 세부이며"*라 적었으므로 이 자리를 위반으로 판정하지 않는다 —
 * 관측만 남기고 등급은 산출물이 든다.
 * ========================================================================= */

const rootScripts =
  (JSON.parse(readRepo("package.json")) as { scripts?: Readonly<Record<string, string>> })
    .scripts ?? {};

describe("축 5 — 명령 조각 술어 (WEB-UI §9.3)", () => {
  test("적합 — 오늘 실물 명령이 그 설정을 프로젝트로 돈다", () => {
    expect(rootScripts.typecheck ?? "").toContain(`-p ${CLIENT_TSCONFIG_PATH}`);
  });

  test("[미규정] 같은 술어가 실행되지 않는 자리의 같은 경로도 참으로 낸다", () => {
    const contains = (script: string): boolean => script.includes(CLIENT_TSCONFIG_PATH);
    expect(contains(`tsc --noEmit # ${CLIENT_TSCONFIG_PATH}`)).toBe(true);
    expect(contains(`echo ${CLIENT_TSCONFIG_PATH} && tsc --noEmit`)).toBe(true);
    // 위 둘 다 브라우저 모듈을 **안 돈다**. 정본이 명령의 형태를 세부로 두었으므로 판정은
    // 산출물이 「판정 필요」로 올린다.
  });
});

/* ========================================================================= *
 * 축 6 — §9.4 결정 5가 명시로 든 값 둘
 *
 * 그 항의 문면이 값을 셋 든다 — 키 `/` · 파일 `index.html` · 미디어 타입
 * `text/html; charset=utf-8`. 앞 둘은 재는 자리가 있고(형제 계약 테스트) **뒤엣것은 없다**:
 * 오늘 매니페스트의 미디어 타입을 보는 술어는 전부 `text/html` 접두 판별이라
 * `charset`이 빠져도 그린이다.
 * ========================================================================= */

describe("축 6 — 결정 5가 든 미디어 타입 (WEB-UI §9.4 결정 5)", () => {
  test("적합 — 오늘 실물이 그 값 그대로다", () => {
    expect(ASSET_MANIFEST["/"].file).toBe("index.html");
    expect(ASSET_MANIFEST["/"].contentType).toBe("text/html; charset=utf-8");
  });

  test("[커버리지 구멍] 접두 술어가 `charset` 없는 값도 통과시킨다", () => {
    const trimmed = { ...ASSET_MANIFEST["/"], contentType: "text/html" };
    expect(
      isHtmlDocumentEntry(trimmed),
      "접두 술어가 이것을 문서가 아니라 한다면 이 발견은 낡았다",
    ).toBe(true);
    // 즉 결정 5가 명시로 든 값에서 벗어나도 결정 8·9·12의 축이 전부 그린이다.
    expect(
      ASSETS_CONTRACT_TEST.includes('ASSET_MANIFEST["/"].contentType'),
      "검증 대상이 그 값을 재고 있다면 이 발견은 낡았다",
    ).toBe(false);
  });
});

/* ========================================================================= *
 * 축 7 — 결정 13이 통로의 수에 건 것의 관측 [미규정]
 *
 * 그 항이 *"앵커를 여는 통로는 하나이고"*라 적었으나, 통로가 둘이 되는 것을 재는 수단은
 * 그 항이 정확히 거부한 스캔뿐이다(*"텍스트 스캔을 계약으로 올리지 않는다"*). 그래서 아래는
 * 계약 축이 아니라 **관측**이고, 등급은 [미규정]이다.
 * ========================================================================= */

describe("축 7 — 통로의 수 (WEB-UI §9.4 결정 13)", () => {
  test("[미규정] 오늘 `/client/`에서 조회 API를 부르는 자리가 한 곳이다", () => {
    const wiring = readFileSync(join(AUTHORED_ASSET_ROOT, "wiring.js"), "utf8");
    const calls = [...wiring.matchAll(/\.getElementById\s*\(/g)];
    expect(calls, "조회 호출이 사라졌다 — 통로가 통로가 아니게 됐다").toHaveLength(1);
    // 스캔이 계약이 아니므로 이 수가 늘어도 위반으로 판정하지 않는다. 관측만 남긴다.
  });

  test("적합 — 검증 대상 테스트가 통로의 반환 동일성을 잰다", () => {
    // 통로가 사본을 만들면 배선이 화면의 그 자리를 못 채운다. 검증 대상에 그 축이 있다.
    expect(WIRING_CONTRACT_TEST).toContain("통로가 사본을 만들지 않는다");
  });
});
