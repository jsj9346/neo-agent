/**
 * 앵커 실재의 전수 대조. 정본은 `docs/WEB-UI.md` §9.4 결정 7·8이다.
 *
 * **기대값은 구현이 아니라 계약 문서에서만 도출했다.** 구현이 문서와 다르면 이 파일은 문서
 * 편에 선다.
 *
 *   - `WEB-UI.md` §9.4 결정 7 — 화면이 지는 것은 *"자리(앵커)만 제공"*이고
 *     *"앵커 이름의 닫힌 집합은 이 레포가 정본으로 들고"* 그 *"자리는 `packages/serve/client/`의
 *     상수"*다. 그 상수가 `client/anchors.js`이고 이 파일이 그것을 임포트한다 — 기대 이름을
 *     여기 다시 적으면 정본이 둘이 된다
 *   - `WEB-UI.md` §9.4 결정 8 — *"앵커의 실재를 계약 테스트가 전수 대조한다."* 화면이 앵커를
 *     안 들면 배선은 그릴 자리를 못 찾고 *"그 실패는 **조용하다**"* — 화면은 뜨는데 아무것도
 *     안 나온다(`ARCHITECTURE.md` §2.6)
 *   - `WEB-UI.md` §9.1·§9.2 — 모집단의 출처. 대조 대상은 매니페스트가 든 엔트리이고, 그
 *     닫힌 표가 곧 «화면의 전부»다
 *
 * ## 방향이 반대라는 것이 이 검사의 근거다
 *
 * §2.3·§9.3이 거부한 것은 «금지된 표기를 찾는» 텍스트 스캔이고, 못 찾으면 조용히 통과하므로
 * «막는다면서 못 막는» 상태가 된다. **이 대조는 «필수인 이름이 있는가»를 묻고 못 찾으면
 * 붉는다** — 결정 8이 그 대비를 근거로 들었다. 변수 경유·주석 우회가 이 방향에서는 위반을
 * 숨기지 못하고 오히려 붉힌다.
 *
 * ## 오늘 이 그린이 뜻하지 않는 것
 *
 * **오늘 모집단이 공집합이다.** §9.4가 *"오늘 반입할 수 있는 화면이 원격에 0장이다"*를
 * 스스로 적었고 매니페스트의 `generated` 엔트리가 0건이라, 실물 축은 **공집합에서 참**이다.
 * 이 파일의 그린을 «화면이 앵커를 든다»로 읽으면 틀린다 — 그 축은 **자산이 반입된 뒤에 처음
 * 힘을 갖는다.** 형제 `assets.contract.test.ts`의 `sha256` 축이 오늘 정확히 같은 상태이고
 * 같은 규율로 그것을 적는다.
 *
 * 그래서 이 파일은 **주입 매니페스트로 비-공집합 경로를 함께 잰다.** 공집합에서만 도는 검사는
 * 자기가 무엇을 재는지 증명하지 못하고 «항상 참인 단언»과 구별되지 않는다 — 아래 역검증이
 * 앵커 하나를 뺀 화면에서 실패 목록이 실제로 채워지는 것을 보인다.
 *
 * ## 이 검사가 재지 못하는 것 — 셋
 *
 * 1. **이름의 존재이지 그 자리가 옳은가가 아니다.** 결정 8이 그 한계를 스스로 적었다 —
 *    *"이름의 존재이지 그 자리가 옳은가가 아니다"*. 트랜스크립트 앵커가 푸터에 붙어 있어도 이
 *    검사는 그린이고, 뒤엣것은 루트 `MILESTONE.md`의 C2(브라우저 검증)가 진다.
 * 2. **부분 문자열 대조라 태그 안인지 모른다.** 주석이나 문자열 리터럴 안의 `id="transcript"`도
 *    존재로 읽는다. 이 방향의 오류는 검사를 **관대하게** 만들지 엄격하게 만들지 않으므로 옳은
 *    화면을 붉히지 않는다 — 파서를 들이는 값보다 §2.2의 의존성 예산이 크다.
 * 3. **배선이 목록 밖의 이름을 쓰는 것은 여기서 안 잡힌다.** 그 축의 모집단은 DOM 배선
 *    모듈인데 오늘 0건이다(§9.4 결정 7의 순서 — 이름이 먼저 서고 배선이 나중이다).
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로 있는
 * 부분 문자열이고, 문서를 지목하는 자리는 절 번호와 필드 이름으로 한다.
 */

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { ANCHOR_NAMES } from "../client/anchors.js";
import {
  ASSET_MANIFEST,
  type AssetEntry,
  type AssetManifest,
  assetFilePath,
  isHtmlDocumentEntry,
} from "../src/assets.ts";

// ---------------------------------------------------------------------------
// 표기와 대조 — 순수 함수 하나가 실물 런과 역검증을 함께 진다
// ---------------------------------------------------------------------------

/**
 * 앵커의 표기. **하나로 닫혀 있다** — 생성 화면의 HTML에서 앵커는 `id="<이름>"`이다.
 *
 * `data-*`를 함께 받지 않는 이유는 대조의 술어가 하나로 닫히기 때문이다. 표기가 둘이면 이
 * 함수가 둘 다 받아야 하고, 그 순간 «어느 쪽으로 써도 된다»가 규격이 되어 원격 프롬프트의
 * 인자가 흐려진다. 닫는 따옴표를 함께 드는 것이 접두 충돌을 막는다 — `id="transcript"`가
 * `transcript-truncation`을 채운 것으로 읽히지 않는다(아래 축이 그것을 잰다).
 */
const anchorMarkup = (name: string): string => `id="${name}"`;

/** 대조 대상 하나에서 못 찾은 이름들 */
type AnchorFinding = {
  readonly route: string;
  readonly missing: readonly string[];
};

/**
 * 대조의 모집단. **`generated`이면서 HTML 문서인 엔트리**다(§9.4 결정 8 — 앵커를 지는 것은
 * 외부 도구가 뽑은 화면이다).
 *
 * «HTML 문서인가»의 술어를 이 파일이 따로 들지 않는다 — `src/assets.ts`가 export하는
 * `isHtmlDocumentEntry` 하나를 CSP(결정 9)와 함께 쓴다. 두 자리가 각자 판별을 들면 따로 낡고
 * 문서 판별의 정본이 둘이 된다.
 */
function documentEntries(manifest: AssetManifest): readonly (readonly [string, AssetEntry])[] {
  return Object.entries(manifest).filter(
    ([, entry]) => entry.origin === "generated" && isHtmlDocumentEntry(entry),
  );
}

/**
 * §9.4 결정 8의 전수 대조. **원문 문자열 → 실패 목록의 순수 함수다.**
 *
 * 읽기를 인자로 받는 이유는 형제 `assets.contract.test.ts`가 같은 자리에서 든 것과 같다 —
 * 실물 런은 디스크이고 역검증은 메모리인데, 역검증이 실물과 다른 코드를 재면 아무것도 못
 * 잡는다. 심은 위반이 잡히는 것은 그 코드가 실물 런의 코드일 때만 뜻을 가진다.
 *
 * 등급을 매기지 않고 목록만 낸다 — 통과의 조건은 목록이 비는 것이다.
 */
function auditAnchors(
  manifest: AssetManifest,
  read: (entry: AssetEntry) => string,
  names: readonly string[],
): AnchorFinding[] {
  const findings: AnchorFinding[] = [];
  for (const [route, entry] of documentEntries(manifest)) {
    const source = read(entry);
    const missing = names.filter((name) => !source.includes(anchorMarkup(name)));
    if (missing.length > 0) findings.push({ route, missing });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// 실물 — 디스크를 읽는다
// ---------------------------------------------------------------------------

const readFromDisk = (entry: AssetEntry): string => readFileSync(assetFilePath(entry), "utf8");

const REAL = auditAnchors(ASSET_MANIFEST, readFromDisk, ANCHOR_NAMES);

// ---------------------------------------------------------------------------
// 주입 — 역검증의 수단
// ---------------------------------------------------------------------------

/**
 * 앵커를 든 화면 하나. **이름을 손으로 적지 않는다** — 상수에서 나오므로 집합이 자라면 이
 * 픽스처가 자동으로 따라간다. 손으로 적으면 그것이 곧 이름의 두 번째 정본이 된다.
 */
const screenWith = (names: readonly string[]): string =>
  [
    "<!doctype html>",
    '<html lang="ko">',
    "<body>",
    ...names.map((name) => `  <div ${anchorMarkup(name)}></div>`),
    "</body>",
    "</html>",
  ].join("\n");

const htmlEntry = (file: string): AssetEntry => ({
  origin: "generated",
  file,
  contentType: "text/html; charset=utf-8",
  prompt: "ui_kits/console/Console.prompt.md",
  pulledAt: "2026-08-26",
  sha256: "0".repeat(64),
});

/** 주입 매니페스트 하나와 그 원문. 라우트 키는 §9.4 결정 5가 든 `/`다 */
function injected(source: string): {
  manifest: AssetManifest;
  read: (entry: AssetEntry) => string;
} {
  return { manifest: { "/": htmlEntry("index.html") }, read: () => source };
}

const auditOf = (source: string, names: readonly string[] = ANCHOR_NAMES): AnchorFinding[] => {
  const { manifest, read } = injected(source);
  return auditAnchors(manifest, read, names);
};

// ---------------------------------------------------------------------------

describe("앵커 집합 (WEB-UI §9.4 결정 7)", () => {
  test("집합이 비어 있지 않다 — 빈 목록의 조용한 그린을 통과로 읽지 않는다", () => {
    // 목록이 비면 아래 대조가 «못 찾은 이름 0»으로 전건 그린이 된다(`ARCHITECTURE.md` §2.6).
    expect(ANCHOR_NAMES.length).toBeGreaterThan(0);
  });

  test("이름에 중복이 없다", () => {
    expect(new Set(ANCHOR_NAMES).size).toBe(ANCHOR_NAMES.length);
  });

  test("동결돼 있다 — 소비자가 제자리에서 목록을 고치지 못한다", () => {
    expect(Object.isFrozen(ANCHOR_NAMES)).toBe(true);
  });

  test("이름이 `id` 속성 값으로 쓸 수 있는 형태다", () => {
    // 표기가 `id="<이름>"`이므로 공백·따옴표·꺾쇠가 들면 그 표기 자체가 깨진다.
    for (const name of ANCHOR_NAMES) {
      expect(name, `${name}이 앵커 이름으로 쓸 수 없는 형태다`).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  test("§9.4 결정 10의 안전 사실 둘이 자리를 갖는다", () => {
    // 그 결정이 이름으로 든 유일한 둘이다 — *"승인 모드가 `off`임 · 셸이 호스트에서 돎"*.
    // 나머지 이름은 세부라 여기서 리터럴로 고정하지 않는다(§9.4 — "이름의 실제 값은 세부다").
    const names: readonly string[] = ANCHOR_NAMES;
    expect(names).toContain("safety-approval-mode");
    expect(names).toContain("safety-sandbox");
  });
});

describe("전수 대조 — 실물 (WEB-UI §9.4 결정 8)", () => {
  test("오늘 모집단이 공집합이다 — 머리의 0건 서술이 낡았다면 여기가 붉는다", () => {
    // 이 축이 있어야 위 그린이 «화면이 앵커를 든다»로 안 읽힌다. 자산이 반입되는 날 이 축이
    // 먼저 붉고, 그때 고칠 것은 이 단언이 아니라 **머리의 서술**이다.
    expect(documentEntries(ASSET_MANIFEST)).toEqual([]);
  });

  test("실물 대조에 위반이 없다", () => {
    expect(REAL).toEqual([]);
  });
});

describe("주입 매니페스트 — 공집합 아닌 곳에서 실제로 도는가", () => {
  test("앵커를 다 든 화면은 통과한다", () => {
    expect(auditOf(screenWith(ANCHOR_NAMES))).toEqual([]);
  });

  test("역검증 — 이름 하나를 빼면 정확히 그 이름이 목록에 나온다", () => {
    for (const dropped of ANCHOR_NAMES) {
      const source = screenWith(ANCHOR_NAMES.filter((name) => name !== dropped));
      expect(auditOf(source), `${dropped}을 뺐는데 안 잡혔다`).toEqual([
        { route: "/", missing: [dropped] },
      ]);
    }
  });

  test("역검증 — 앵커가 하나도 없는 화면은 전건이 나온다", () => {
    const findings = auditOf("<!doctype html><body>아무것도 없다</body>");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.missing).toEqual([...ANCHOR_NAMES]);
  });

  test("표기가 하나로 닫혀 있다 — `data-anchor`도 홑따옴표도 통과시키지 않는다", () => {
    for (const markup of [
      (name: string) => `data-anchor="${name}"`,
      (name: string) => `id='${name}'`,
      (name: string) => `ID="${name}"`,
    ]) {
      const source = ANCHOR_NAMES.map((name) => `<div ${markup(name)}></div>`).join("\n");
      expect(auditOf(source)[0]?.missing, "다른 표기가 앵커로 읽혔다").toEqual([...ANCHOR_NAMES]);
    }
  });

  test("이름이 서로의 접두여도 갈린다", () => {
    // `transcript`와 `transcript-truncation`처럼 접두 관계인 이름이 실재하므로, 닫는
    // 따옴표를 안 들면 앞엣것 하나가 뒤엣것을 채운 것으로 읽힌다.
    const prefixes = ANCHOR_NAMES.filter((name) =>
      ANCHOR_NAMES.some((other) => other !== name && other.startsWith(name)),
    );
    expect(prefixes.length, "접두 관계인 이름이 없어 이 축이 공허하다").toBeGreaterThan(0);

    for (const prefix of prefixes) {
      const longer = ANCHOR_NAMES.filter((name) => name !== prefix && name.startsWith(prefix));
      const source = screenWith([prefix]);
      const missing = auditOf(source)[0]?.missing ?? [];
      for (const name of longer) {
        expect(missing, `${prefix}이 ${name}을 채운 것으로 읽혔다`).toContain(name);
      }
    }
  });

  test("`generated`라도 HTML 문서가 아니면 모집단 밖이다", () => {
    // 하위 리소스는 앵커를 지지 않는다. 술어는 CSP와 공유하는 `isHtmlDocumentEntry` 하나다.
    const script: AssetEntry = {
      origin: "generated",
      file: "app.js",
      contentType: "text/javascript; charset=utf-8",
      prompt: "ui_kits/console/Console.prompt.md",
      pulledAt: "2026-08-26",
      sha256: "0".repeat(64),
    };
    expect(isHtmlDocumentEntry(script)).toBe(false);
    expect(auditAnchors({ "/app.js": script }, () => "앵커가 하나도 없다", ANCHOR_NAMES)).toEqual(
      [],
    );
  });

  test("`authored` 모듈은 모집단 밖이다 — 앵커를 지는 것은 화면이다", () => {
    const module: AssetEntry = {
      origin: "authored",
      file: "anchors.js",
      contentType: "text/javascript; charset=utf-8",
    };
    expect(
      auditAnchors({ "/client/anchors.js": module }, () => "앵커가 하나도 없다", ANCHOR_NAMES),
    ).toEqual([]);
  });

  test("모집단 판별이 CSP와 같은 술어를 쓴다", () => {
    // R-6 — 두 자리가 각자 판별을 들면 따로 낡는다. 이 축이 그 공유를 못박는다.
    expect(isHtmlDocumentEntry(htmlEntry("index.html"))).toBe(true);
    expect(documentEntries({ "/": htmlEntry("index.html") }).map(([route]) => route)).toEqual([
      "/",
    ]);
  });
});
