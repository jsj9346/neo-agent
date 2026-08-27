/**
 * 독립 QA — `docs/WEB-UI.md` §9.4의 2026-08-27 신설 결정 셋(11·12·13)과 그 셋이 지목하는
 * 결정 1·5·7·8·10, 그리고 §9.1·§9.2·§9.3·§6.1의 `StateSnapshot` 절과
 * `docs/CLI-INTERFACE.md` §7.1.
 *
 * **기대값은 위 문서에서만 뽑았다.** 구현을 열어 관찰한 동작에 기대값을 맞춘 축이 이 파일에
 * 없다. 구현이 문서와 갈리면 이 파일은 문서 편에 서고 red를 그대로 남긴다.
 *
 * 형제 둘(`qa-20260826-webui.independent.test.ts` ·
 * `qa-20260826-webui94-anchors.independent.test.ts`)과 다른 파일이고 그쪽을 고치지 않는다.
 * 구현자 계약 테스트(`assets.contract.test.ts` · `anchors.contract.test.ts` ·
 * `wiring.contract.test.ts`)와 같은 대상을 보는 자리가 있으나 **재는 방식을 일부러 달리했다** —
 * 같은 하네스를 공유하면 둘 다 같은 오해를 공유하는 경우를 못 잡는다. 그래서 감사 함수는 전부
 * 이 파일이 다시 썼고, 판별 술어만은 일부러 구현의 것을 그대로 부른다(축 1의 물음이 그 술어
 * 자신이기 때문이다).
 *
 * ## 이 파일이 지는 일곱 축
 *
 * 1. 문서 판별 술어가 **전송이 실제로 나르는 미디어 타입**과 같은 것을 문서로 보는가.
 *    결정 8·9·12가 술어 하나를 공유하므로 그 술어의 구멍은 셋을 동시에 비운다.
 * 2. 결정 5가 키에 건 계약 둘 — 한 파일을 두 키가 열지 않는 것, `generated` 키가 그 항이 든
 *    둘 밖으로 나가지 않는 것 — 을 오늘 무엇이 재는가.
 * 3. 결정 13의 강제 수단이 기대는 타입 검사 배치(§9.3)가 **명령에 실제로 걸려 있는가.**
 * 4. 조회 통로가 문서가 든 세 성질을 지는가, 그리고 문서가 스스로 적은 한계의 실물은 무엇인가.
 * 5. 결정 11의 표시 판정이 자기 자리를 타입으로 강제한다는 주장이 참인가.
 * 6. §9.2의 자산 아닌 파일 목록이 갈래를 가리는가.
 * 7. 형제 독립 QA가 세운 배선 스캐너가 오늘 실재하는 통로를 보는가.
 *
 * 등급 표기: `[계약 위반]` · `[문서 부정확]` · `[미규정]`. 판정 목록의 정본은
 * `plans/20260827-webui-94-anchor-funnel-qa.md`다.
 *
 * ## 오늘 red인 축이 있다 — 그대로 둔다
 *
 * 축 1의 공백 갈래가 red다. 기대값이 문서에서 나왔고 구현이 그것과 갈리므로, 이 파일은 기대값을
 * 구현에 맞춰 내리지 않는다. 처분은 이 파일이 아니라 `src/`와 §9.4가 진다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로 있는
 * 부분 문자열이고, 문서를 지목하는 자리는 절 번호와 결정 번호로 한다.
 */

import { readdirSync, readFileSync } from "node:fs";
import { createServer, get } from "node:http";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import type { AnchorName } from "../client/anchors.js";
import { ANCHOR_NAMES } from "../client/anchors.js";
import type { AnchorSource } from "../client/wiring.js";
import { anchorElement, safetyDisplay } from "../client/wiring.js";
import type { AssetEntry, AssetManifest } from "../src/assets.ts";
import {
  ASSET_MANIFEST,
  AUTHORED_ASSET_ROOT,
  createAssetHandler,
  GENERATED_ASSET_ROOT,
  isHtmlDocumentEntry,
  MANIFEST_EXEMPT_FILES,
} from "../src/assets.ts";
import { LOOPBACK_HOST } from "../src/server.ts";

/* ------------------------------------------------------------------------- *
 * 공용 도구 — 응답 관측과 경로
 * ------------------------------------------------------------------------- */

type Written = {
  status: number | undefined;
  headers: Record<string, string>;
};

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** 자산 핸들러에 한 왕복을 먹이고 응답 머리만 관측한다 */
async function head(manifest: AssetManifest, url: string): Promise<Written> {
  const written: Written = { status: undefined, headers: {} };
  const handler = createAssetHandler({
    manifest,
    readAsset: () => Promise.resolve(new TextEncoder().encode("<!doctype html>")),
    onReadError: (error) => {
      throw error;
    },
  });
  handler({
    request: { method: "GET", url },
    response: {
      writeHead(status: number, headers: Readonly<Record<string, string>>): unknown {
        written.status = status;
        written.headers = { ...headers };
        return undefined;
      },
      end(): unknown {
        return undefined;
      },
    },
  });
  await tick();
  await tick();
  return written;
}

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** 워크스페이스 기준 상대 경로. 손으로 적지 않고 루트 상수에서 파생한다 */
const workspacePath = (absolute: string): string =>
  relative(REPO_ROOT, absolute).split(sep).join("/").replace(/\/$/, "");

/* ========================================================================= *
 * 축 1 — 문서 판별 술어가 전송이 나르는 것과 같은 것을 문서로 보는가
 *
 * §9.4 결정 12가 판별의 술어를 하나로 못박았다 — *"판별의 술어는 결정 8·9가 이미 공유하는 그것
 * 하나를 그대로 쓴다."* 그래서 그 술어가 놓치는 엔트리는 **셋을 동시에** 빠져나간다: 앵커 전수
 * 대조(결정 8)도, CSP(결정 9)도, `authored` 문서 금지(결정 12)도 안 걸린다.
 *
 * 결정 12는 그 방향의 오타를 이 절의 상시 실패 형태로 이미 이름 붙였고, 앞의 둘로
 * *"미디어 타입의 대소문자"*와 `sha256`을 들었다. 대소문자는 2026-08-26 독립 QA가 V-1로
 * 잡아 술어가 흡수했다. **이 축이 묻는 것은 같은 부류의 셋째다** — 값 앞의 공백이다.
 *
 * 기대값의 근거는 문서 하나가 아니라 결정 9의 판정 형태다. 그 항이 CSP를 고른 이유는 4-①의
 * 위반이 *"사용자의 오프라인 머신에서만 깨진다"*는 것이었고, 그래서 이 술어가 재야 하는 것은
 * 매니페스트에 적힌 글자가 아니라 **브라우저가 무엇으로 받는가**다. 아래 첫 축이 그 답을
 * 실측으로 만든다.
 * ========================================================================= */

/** 매니페스트가 그 값을 실었을 때 브라우저가 실제로 받는 미디어 타입 */
async function deliveredContentType(raw: string): Promise<string | undefined> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": raw });
    response.end("");
  });
  await new Promise<void>((resolve) => {
    server.listen(0, LOOPBACK_HOST, () => {
      resolve();
    });
  });
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  const received = await new Promise<string | undefined>((resolve, reject) => {
    get({ host: LOOPBACK_HOST, port, path: "/" }, (response) => {
      response.resume();
      response.on("end", () => {
        resolve(response.headers["content-type"]);
      });
    }).on("error", reject);
  });
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
  return received;
}

const documentEntry = (contentType: string): AssetEntry => ({
  origin: "generated",
  file: "index.html",
  contentType,
  prompt: "ui_kits/console/Console.prompt.md",
  pulledAt: "2026-08-27",
  sha256: "0".repeat(64),
});

const LEADING_SPACE = " text/html; charset=utf-8";

describe("축 1 — 문서 판별 술어 (WEB-UI §9.4 결정 8·9·12의 공유 술어)", () => {
  test("적합 — 소문자와 대문자 표기가 둘 다 문서다", () => {
    expect(isHtmlDocumentEntry(documentEntry("text/html; charset=utf-8"))).toBe(true);
    expect(isHtmlDocumentEntry(documentEntry("TEXT/HTML; charset=utf-8"))).toBe(true);
  });

  test("적합 — 하위 리소스는 문서가 아니다. 술어가 전부를 참이라 하지 않는다", () => {
    expect(isHtmlDocumentEntry(documentEntry("text/javascript; charset=utf-8"))).toBe(false);
    expect(isHtmlDocumentEntry(documentEntry("text/css; charset=utf-8"))).toBe(false);
  });

  test("실측 — 값 앞의 공백은 전송에서 벗겨지고 브라우저는 문서 타입을 받는다", async () => {
    // 이 축이 아래 두 축의 기대값을 만든다. 매니페스트에 적힌 글자와 브라우저가 받는 값이
    // 갈리므로, 술어가 앞엣것만 보면 화면은 문서로 뜨는데 문서의 의무는 아무것도 안 진다.
    expect(await deliveredContentType(LEADING_SPACE)).toBe("text/html; charset=utf-8");
    expect(await deliveredContentType("\ttext/html; charset=utf-8")).toBe(
      "text/html; charset=utf-8",
    );
  });

  test("[계약 위반] 앞에 공백이 붙은 표기도 문서여야 한다", () => {
    // 근거는 위 실측이다 — 브라우저가 HTML 문서로 파는 응답이므로 결정 8·9·12의 의무가 그대로
    // 걸린다. 대소문자 갈래를 술어가 흡수한 것과 같은 부류이고, 결정 12가 그 부류를
    // *"미디어 타입의 대소문자"*라는 이름으로 이미 들었다.
    expect(isHtmlDocumentEntry(documentEntry(LEADING_SPACE))).toBe(true);
    expect(isHtmlDocumentEntry(documentEntry("\ttext/html; charset=utf-8"))).toBe(true);
  });

  test("[계약 위반] 그 엔트리의 응답에서 CSP가 조용히 사라진다", async () => {
    // 결정 9가 CSP를 고른 근거가 침묵이었다. 이 자리는 그 근거가 그대로 서는 자리다 — 화면은
    // 뜨고, 외부 호스트 참조는 막히지 않으며, 아무 신호도 없다.
    const planted: AssetManifest = { "/": documentEntry(LEADING_SPACE) };
    const written = await head(planted, "/");
    expect(written.status).toBe(200);
    expect(Object.keys(written.headers)).toContain("content-security-policy");
  });

  test("역검증 — 같은 하네스가 정상 표기에서는 CSP를 낸다", async () => {
    // 위 축의 red가 하네스의 결함이 아님을 매 런 고정한다. 두 표본이 공백 하나에서만 갈린다.
    const planted: AssetManifest = { "/": documentEntry("text/html; charset=utf-8") };
    const written = await head(planted, "/");
    expect(written.status).toBe(200);
    expect(written.headers["content-security-policy"]).toBe(
      "default-src 'self'; style-src 'self' 'unsafe-inline'",
    );
  });

  test("역검증 — 문서가 아닌 응답에는 그 헤더가 없다", async () => {
    const planted: AssetManifest = {
      "/client/x.js": { origin: "authored", file: "protocol.js", contentType: "text/javascript" },
    };
    const written = await head(planted, "/client/x.js");
    expect(written.status).toBe(200);
    expect(Object.keys(written.headers)).not.toContain("content-security-policy");
  });

  test("오늘 실물 매니페스트에는 이 갈래의 엔트리가 없다 — 위 red는 술어의 결함이다", () => {
    // 실물 위반과 술어 결함을 가른다. 이 단언이 붉어지는 날은 실물이 그 갈래를 얻은 날이고,
    // 그때는 등급이 술어 결함에서 실물 위반으로 올라간다.
    const suspicious = Object.entries(ASSET_MANIFEST).filter(
      ([, entry]) => entry.contentType !== entry.contentType.trim(),
    );
    expect(suspicious).toEqual([]);
  });
});

/* ========================================================================= *
 * 축 2 — 결정 5가 키에 건 계약 둘
 *
 * 그 항이 두 문장을 계약으로 든다. 하나는
 * *"키가 `/index.html`이 아니라 `/`인 것이 계약이다."*이고, 다른 하나는 같은 파일을 두 키가
 * 여는 배치를 두고 *"둘 다 두지 않는다"*라 적은 것이다. 뒤엣것이 든 근거는 §9.1의 집합
 * 동일성이 파일 쪽에서 1:N이 되어 양방향의 절반이 죽는다는 것이다.
 *
 * **오늘 그 둘을 재는 기계가 없다.** §9.1의 집합 동일성 검사는 등재 여부만 보므로 두 키가 한
 * 파일을 가리켜도 양쪽 축이 다 그린이고, 결정 12의 검사는 문서의 **개수**만 센다. 아래가 그
 * 자리를 채운다.
 * ========================================================================= */

/** 결정 5가 든 `generated` 키 둘. 이 파일이 문서에서 옮겨 적은 상수다 */
const DECISION_5_GENERATED_ROUTES: readonly string[] = ["/", "/tokens.css"];

/** 같은 파일을 여는 키가 둘 이상인 자리. 갈래가 다르면 다른 파일이므로 갈래를 키에 넣는다 */
function sharedTargets(
  manifest: AssetManifest,
): readonly { readonly target: string; readonly routes: readonly string[] }[] {
  const byTarget = new Map<string, string[]>();
  for (const [route, entry] of Object.entries(manifest)) {
    const target = `${entry.origin}:${entry.file}`;
    const seen = byTarget.get(target);
    if (seen === undefined) byTarget.set(target, [route]);
    else seen.push(route);
  }
  return [...byTarget]
    .filter(([, routes]) => routes.length > 1)
    .map(([target, routes]) => ({ target, routes: [...routes].sort() }))
    .sort((left, right) => left.target.localeCompare(right.target));
}

/** 결정 5가 든 둘 밖으로 나간 `generated` 키 */
function offSpecGeneratedRoutes(manifest: AssetManifest): readonly string[] {
  return Object.entries(manifest)
    .filter(([, entry]) => entry.origin === "generated")
    .map(([route]) => route)
    .filter((route) => !DECISION_5_GENERATED_ROUTES.includes(route))
    .sort();
}

describe("축 2 — 결정 5의 키 계약 (WEB-UI §9.4 결정 5 · §9.1)", () => {
  test("실물 — 한 파일을 두 키가 열지 않는다", () => {
    expect(sharedTargets(ASSET_MANIFEST)).toEqual([]);
  });

  test("역검증 — 같은 파일을 두 키로 심으면 그 짝을 이름으로 든다", () => {
    const planted: AssetManifest = {
      ...ASSET_MANIFEST,
      "/wiring.js": { origin: "authored", file: "wiring.js", contentType: "text/javascript" },
    };
    expect(sharedTargets(planted)).toEqual([
      { target: "authored:wiring.js", routes: ["/client/wiring.js", "/wiring.js"] },
    ]);
  });

  test("역검증 — 갈래가 다른 같은 파일명은 다른 파일이므로 안 잡는다", () => {
    // 루트가 갈래마다 다르므로(§9.1) 같은 이름이 두 갈래에 있는 것은 충돌이 아니다. 이 축이
    // 없으면 위 술어가 갈래를 안 보는 상태와 구별되지 않는다.
    const planted: AssetManifest = {
      "/a.css": { origin: "authored", file: "tokens.css", contentType: "text/css" },
      "/b.css": {
        origin: "generated",
        file: "tokens.css",
        contentType: "text/css",
        prompt: "ui_kits/console/Tokens.prompt.md",
        pulledAt: "2026-08-27",
        sha256: "0".repeat(64),
      },
    };
    expect(sharedTargets(planted)).toEqual([]);
  });

  test("실물 — `generated` 키가 결정 5의 둘 밖으로 안 나갔다 (모집단이 섰다)", () => {
    // [처분됨 — 2026-08-27 반입] 이 자리는 "`generated`가 0건이라 위 술어의 모집단이 비었다"를
    // 단언으로 못박아, 자산이 반입되는 날 먼저 붉게 해 둔 표지였다. 그날이 왔다 — 반입 사이클이
    // `generated` 엔트리 둘을 매니페스트에 세웠다. **표지를 걷지 않고 뒤집는다**: 모집단이 비지
    // 않았음을 먼저 못박고 그 위에서 결정 5의 계약을 잰다. 단언을 지우면 이 축이 다시 "공집합에서
    // 참"으로 미끄러져도 안 보인다(`ARCHITECTURE.md` §2.6).
    // 넓은 타입으로 읽는다 — `as const`가 오늘의 값에 맞춰 판별자를 한 갈래로 좁혀 두어
    // 그대로 비교하면 겹치지 않는 비교가 되고, 그 순간 이 축이 타입에서 사라진다.
    const manifest: AssetManifest = ASSET_MANIFEST;
    const generated = Object.values(manifest).filter((entry) => entry.origin === "generated");
    expect(
      generated.length,
      "`generated`가 0건이다 — 이 축이 다시 공집합에서 참이 됐다",
    ).toBeGreaterThan(0);
    expect(offSpecGeneratedRoutes(ASSET_MANIFEST)).toEqual([]);
  });

  test("역검증 — 루트를 여는 키가 `/index.html`이면 잡힌다", () => {
    const planted: AssetManifest = { "/index.html": documentEntry("text/html; charset=utf-8") };
    expect(offSpecGeneratedRoutes(planted)).toEqual(["/index.html"]);
    // 결정 5가 든 키는 통과한다 — 술어가 전부를 붉히는 상태가 아니다.
    expect(offSpecGeneratedRoutes({ "/": documentEntry("text/html; charset=utf-8") })).toEqual([]);
  });

  test("역검증 — `authored` 키는 이 술어의 모집단 밖이다", () => {
    // 결정 5의 2026-08-27 명시가 `authored` 집합의 정본을 매니페스트 자신으로 두었으므로,
    // 그 갈래를 이 술어가 붉히면 문서가 안 든 금지를 검사가 발명하는 것이 된다.
    expect(offSpecGeneratedRoutes(ASSET_MANIFEST)).toEqual([]);
    expect(Object.keys(ASSET_MANIFEST).length).toBeGreaterThan(2);
  });
});

/* ========================================================================= *
 * 축 3 — 결정 13의 강제 수단이 기대는 배치가 명령에 걸려 있는가
 *
 * 결정 13이 고른 수단은 검사가 아니라 도달 불가이고, 그것을 실제로 세우는 것은 §9.3이
 * 이 디렉터리에 걸어 둔 타입 검사다. 그 절이 *"타입 검사는 이 디렉터리의 별도
 * `tsconfig.json`이 진다"*로 자리를 정하고, 계약인 것은
 * *"이 디렉터리가 타입 검사 모집단 안에 든다"*는 것 하나라 적었다.
 *
 * **그 배치가 오늘 한 줄에 산다** — 루트 `package.json`의 타입 검사 스크립트가 그 설정을 함께
 * 도는 조각이다. 그 조각이 빠지면 결정 13의 유일한 강제 수단이 통째로 죽는데 **그것이
 * 조용하다**: 남은 명령은 성공하고, 목록 밖 이름을 쓴 배선은 아무 데서도 안 붉는다.
 * 오늘 그 자리를 재는 기계가 없어 이 축이 그것을 잰다.
 * ========================================================================= */

const CLIENT_TSCONFIG = `${workspacePath(AUTHORED_ASSET_ROOT)}/tsconfig.json`;

const rootPackage = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as Readonly<{
  scripts?: Readonly<Record<string, string>>;
}>;

const typecheckScript = rootPackage.scripts?.typecheck ?? "";

/** 그 명령이 브라우저 모듈의 설정을 함께 도는가 */
const runsClientTypecheck = (script: string): boolean => script.includes(CLIENT_TSCONFIG);

describe("축 3 — 브라우저 모듈이 타입 검사 모집단 안에 있는가 (WEB-UI §9.3 · 결정 13)", () => {
  test("경로를 손으로 적지 않는다 — 루트 상수에서 나온다", () => {
    // 디렉터리가 개명되면 이 단언이 함께 붉는다. 문자열을 손으로 적으면 개명이 아래 축을
    // 조용히 통과시킨다.
    expect(CLIENT_TSCONFIG).toBe("packages/serve/client/tsconfig.json");
  });

  test("타입 검사 명령이 비어 있지 않다 — 조용한 그린을 통과로 읽지 않는다", () => {
    expect(typecheckScript.length).toBeGreaterThan(0);
  });

  test("타입 검사 명령이 브라우저 모듈의 설정을 함께 돈다", () => {
    expect(runsClientTypecheck(typecheckScript)).toBe(true);
  });

  test("역검증 — 그 조각이 빠진 명령을 술어가 실패로 낸다", () => {
    expect(runsClientTypecheck("tsc --noEmit")).toBe(false);
    expect(runsClientTypecheck(typecheckScript.replace(CLIENT_TSCONFIG, "packages/core"))).toBe(
      false,
    );
  });

  test("그 설정이 실재하고 `.js`를 모집단으로 든다", () => {
    const config = readFileSync(join(AUTHORED_ASSET_ROOT, "tsconfig.json"), "utf8");
    expect(config).toContain("checkJs");
    expect(config).toContain("allowJs");
    expect(config).toContain("*.js");
  });

  test("이 디렉터리의 소스가 전부 `.js`다 — 다른 확장자는 그 모집단 밖으로 샌다", () => {
    // 설정의 `include`가 `.js`만 드므로, 브라우저 모듈이 다른 확장자로 놓이면 §9.3이 세운
    // 경계 밖에 조용히 앉는다. 자산 아닌 파일(§9.2)은 이 물음 밖이다.
    const strays = readdirSync(AUTHORED_ASSET_ROOT).filter(
      (file) => !file.endsWith(".js") && !MANIFEST_EXEMPT_FILES.includes(file),
    );
    expect(strays).toEqual([]);
  });
});

/* ========================================================================= *
 * 축 4 — 조회 통로 (§9.4 결정 13)
 *
 * 그 항이 통로에 건 성질은 셋이다 — 인자의 타입이 앵커 이름의 유니온이라는 것,
 * *"배선은 DOM 조회 API를 직접 부르지 않는다."*는 것, *"못 찾으면 던진다."*는 것.
 * 앞의 둘은 타입 층이고 뒤엣것은 런타임이다.
 *
 * 아래는 구현자 계약 테스트가 이미 재는 자리를 되풀이하지 않는다. 여기서 묻는 것은 그 항이
 * 스스로 든 *"막지 못하는 것"*이 오늘 실물에서 어떤 모양인가다.
 * ========================================================================= */

type FakeElement = { readonly tag: string };

const emptySource: AnchorSource<FakeElement> = {
  getElementById: () => null,
};

/**
 * 원천이 `undefined`를 돌려주는 배치. **타입이 이것을 금지한다** — 통로의 원천 타입이 요소
 * 아니면 `null`이라 이 값은 단언을 거쳐야 들어온다. 그래서 아래 축은 위반이 아니라 한계다.
 *
 * **[처분됨 — K-315 · 2026-08-27]** 위 문장은 **쓰인 시점에는 부정확했고 지금은 참이다.** 당시
 * 통로의 요소 타입 파라미터가 무제약이라 `AnchorSource<요소 | undefined>`가 단언 없이 성립했고,
 * 이 배치를 실제로 막고 있던 것은 타입이 아니라 이 파일이 `FakeElement`로 좁게 인스턴스화했다는
 * 사실이었다. 처분이 그 파라미터를 `object`로 제약해 문장을 참으로 만들었다 — 원문을 걷지 않고
 * 남기는 것은 그것이 이 축을 세운 근거이기 때문이다(정본: `WEB-UI.md` §9.4 결정 13).
 */
const undefinedSource = {
  getElementById: () => undefined,
} as unknown as AnchorSource<FakeElement>;

describe("축 4 — 조회 통로의 한계 (WEB-UI §9.4 결정 13)", () => {
  test("적합 — 못 찾으면 던진다. 이름 전량에서", () => {
    expect(ANCHOR_NAMES.length).toBeGreaterThan(0);
    for (const name of ANCHOR_NAMES) {
      expect(() => anchorElement(emptySource, name), `${name}: 조용히 흘렸다`).toThrow();
    }
  });

  test("적합 — 원천이 `undefined`를 돌려주어도 흘리지 않고 던진다", () => {
    // [처분됨 — K-315 · 2026-08-27] 이 자리는 미규정 등급을 달고 **그 흘림을 단언으로
    // 못박고** 있었다. 근거는 *"오늘의 방어는 `null` 하나이고, 그 좁힘을 받쳐 주는 것은
    // 타입뿐이다"*였고, 그 등급이 든 물음(「방어가 `null` 하나인 것이 계약인가」)을 처분이
    // 닫았다 — 결정 13이 던짐을 요구하며 쓴 말이 `null`이 아니라 *"빈 값"*이므로 `undefined`도
    // 그 외연 안이고, 통로가 타입(요소 파라미터의 `object` 제약)과 런타임(`=== undefined`
    // 병기) 둘로 그것을 닫았다. **축을 걷지 않고 방향을 뒤집는다** — 되돌아가면 이 단언이
    // 먼저 붉는다.
    expect(() => anchorElement(undefinedSource, "transcript"), "빈 값을 조용히 흘렸다").toThrow();
  });

  test("[미규정] 원천을 쥔 코드가 목록 밖 이름으로 직접 조회하는 것은 타입이 안 막는다", () => {
    // 결정 13이 *"막지 못하는 것"*으로 스스로 든 자리의 실물이다. 통로의 원천 타입이 조회
    // 인자를 넓은 문자열로 열어 두므로, 원천을 받은 자리에서의 우회는 컴파일에서 안 붉는다.
    // 그 항이 그것을 사람의 검토에 맡기기로 했으므로 위반으로 판정하지 않는다.
    const bypass = (source: AnchorSource<FakeElement>): FakeElement | null =>
      source.getElementById("gate-panel");
    expect(bypass(emptySource)).toBeNull();
    const names: readonly string[] = ANCHOR_NAMES;
    expect(names, "표본이 목록 안으로 들어왔다").not.toContain("gate-panel");
  });
});

/* ========================================================================= *
 * 축 5 — 결정 11의 표시 판정이 자기 자리를 타입으로 강제하는가
 *
 * 결정 11이 자리 쪽의 승계를 끊으며 *"앵커는 값과 무관하게 항상 있다."*를 들었고, 판정의
 * 모집단을 배선으로 두었다. 구현은 그 판정이 채우는 두 자리의 이름을 `Extract`로 앵커 이름의
 * 유니온에서 걸러 내고, **그 목록에서 두 이름이 빠지거나 이름이 바뀌면 반환 리터럴이 컴파일에서
 * 붉는다**고 적는다.
 *
 * **그 주장이 절반만 참이다.** 한쪽만 빠지면 붉지만, 둘 다 빠지거나 둘 다 개명되면
 * `Extract`가 `never`로 붕괴하고 그 순간 목표 타입이 빈 객체 타입이 되어 초과 속성 검사가
 * 통째로 죽는다. 아래 타입 표본이 그 붕괴를 기계로 못박는다 — 이 줄이 컴파일된다는 사실 자체가
 * 주장의 반증이고, 훗날 타입 검사가 좁아지면 이 자리가 먼저 붉어 그 사실을 알린다.
 * ========================================================================= */

/** 목록에서 두 이름이 다 사라진 상태의 모형. `Extract`가 `never`로 붕괴한다 */
type CollapsedSlots = Readonly<Record<Extract<AnchorName, "없는-이름-a" | "없는-이름-b">, boolean>>;

/**
 * 붕괴한 목표 타입에 두 키를 든 리터럴이 그대로 들어간다. **이 선언이 컴파일되는 것이 이 축의
 * 관측값이다** — 초과 속성 검사가 살아 있다면 여기가 컴파일 에러여야 한다.
 */
const collapsed: CollapsedSlots = {
  "safety-approval-mode": true,
  "safety-sandbox": false,
};

/** 한쪽만 남은 상태의 모형. 이쪽에서는 초과 속성 검사가 살아 있다 */
type OneSlot = Readonly<Record<Extract<AnchorName, "safety-approval-mode">, boolean>>;

/**
 * **대비쌍이다.** 위 붕괴가 «타입이 원래 아무것도 안 잰다»가 아니라 `never`에서만 죽는다는
 * 것을 이 줄이 보인다 — 아래 지시자가 에러를 못 잡으면 `pnpm typecheck`가 실패하므로, 두
 * 표본의 답이 갈리는 원인이 `Extract`의 붕괴 하나로 좁혀진다.
 */
function oneSlotStillChecks(): OneSlot {
  return {
    "safety-approval-mode": true,
    // @ts-expect-error §9.4 결정 11 — 남은 이름이 하나면 목록 밖 키가 초과 속성으로 붉는다.
    "safety-sandbox": false,
  };
}

describe("축 5 — 표시 판정의 타입 가드 (WEB-UI §9.4 결정 11)", () => {
  test("[문서 부정확] 두 이름이 함께 사라지면 타입 가드가 붕괴한다", () => {
    // 붕괴의 관측값은 위 선언이 컴파일된다는 것이고, 여기서는 그 값이 실제로 두 키를 든
    // 객체임을 런타임으로 확인한다. 목표 타입이 키를 하나도 요구하지 않는데 값은 둘을 든다.
    expect(Object.keys(collapsed).sort()).toEqual(["safety-approval-mode", "safety-sandbox"]);
  });

  test("대비쌍 — 한쪽만 남으면 같은 형태가 컴파일에서 붉는다", () => {
    // 위 축의 그린이 «타입이 원래 아무것도 안 잰다»가 아님을 매 런 고정한다. 판정은
    // `pnpm typecheck`가 낸다 — 그 함수 안의 지시자가 에러를 못 잡으면 거기서 멈춘다.
    expect(oneSlotStillChecks).toBeTypeOf("function");
  });

  test("오늘 그 붕괴가 안 일어난다 — 두 이름이 목록에 실재한다", () => {
    const names: readonly string[] = ANCHOR_NAMES;
    expect(names).toContain("safety-approval-mode");
    expect(names).toContain("safety-sandbox");
  });

  test("실제 안전망은 런타임 축이다 — 판정의 키가 앵커 목록 안이다", () => {
    // 위 붕괴가 뜻하는 것은 이 계약을 타입이 아니라 **런타임 단언이** 진다는 것이다. 판정이
    // 드는 키 전부가 앵커 목록 안인지를 여기서 직접 잰다 — 이름을 리터럴로 적지 않고 판정의
    // 반환에서 뽑으므로 개명이 이 축을 조용히 통과하지 못한다.
    const shown = safetyDisplay({ approvalMode: "off", sandbox: "off" });
    const names: readonly string[] = ANCHOR_NAMES;
    const keys = Object.keys(shown);
    expect(keys.length, "판정이 아무 자리도 안 든다").toBe(2);
    for (const key of keys) expect(names, `${key}: 판정의 키가 앵커 목록 밖이다`).toContain(key);
  });

  test("적합 — 판정이 두 자리를 서로 독립으로 든다", () => {
    // 결정 11이 승계한 것은 표시의 내용이고, `CLI-INTERFACE.md` §7.1의 내용 표가 두 항목을
    // 각자의 행으로 든다. 한 판정이 둘을 함께 켜면 화면이 사용자가 안 내린 결정을 지어낸다.
    expect(safetyDisplay({ approvalMode: "off", sandbox: "on" })).toEqual({
      "safety-approval-mode": true,
      "safety-sandbox": false,
    });
    expect(safetyDisplay({ approvalMode: "manual", sandbox: "off" })).toEqual({
      "safety-approval-mode": false,
      "safety-sandbox": true,
    });
    expect(safetyDisplay({ approvalMode: "manual", sandbox: "on" })).toEqual({
      "safety-approval-mode": false,
      "safety-sandbox": false,
    });
  });
});

/* ========================================================================= *
 * 축 6 — 자산 아닌 파일 목록이 갈래를 가리는가 (§9.2)
 *
 * §9.2가 *"루트에는 자산이 아닌 파일이 놓일 수 있고, 그것은 매니페스트에 등재되지 않는다"*를
 * 확정하며 오늘의 둘을 이름으로 들었고, 뒤엣것을 `client/tsconfig.json`이라 **갈래를 붙여**
 * 적었다. 같은 절이 §9.1의 축에 대해 *"모집단은 갈래마다 자기 디렉터리다"*라 적는다.
 *
 * **구현의 목록은 평면이다.** 파일명만 들고 갈래를 안 물으므로, 문서가 한쪽 갈래에만 놓기로 한
 * 이름이 다른 갈래에서도 조용히 제외된다. 아래가 그 비대칭을 못박는다 — 오늘 실물에는 그런
 * 파일이 없으므로 위반이 아니라 판정 필요다.
 * ========================================================================= */

/** §9.1의 실물 쪽 축을 독립으로 다시 쓴다. 등재도 제외도 아닌 파일이 나오면 잡는다 */
function unregistered(
  manifest: AssetManifest,
  origin: AssetEntry["origin"],
  files: readonly string[],
  exempt: readonly string[],
): readonly string[] {
  const registered = new Set(
    Object.values(manifest)
      .filter((entry) => entry.origin === origin)
      .map((entry) => entry.file),
  );
  return files.filter((file) => !exempt.includes(file) && !registered.has(file)).sort();
}

describe("축 6 — 제외 목록과 갈래 (WEB-UI §9.2 · §9.1)", () => {
  test("적합 — 목록이 오늘 둘이고 §9.2가 든 이름 그대로다", () => {
    // 셋째가 붙는 순간이 그 절이 든 트리거다. 이 단언이 그 순간을 붉힌다.
    expect([...MANIFEST_EXEMPT_FILES].sort()).toEqual([".gitkeep", "tsconfig.json"]);
  });

  test("적합 — 각 갈래의 실물이 자기 제외 항을 실제로 갖는다", () => {
    expect(readdirSync(GENERATED_ASSET_ROOT)).toContain(".gitkeep");
    expect(readdirSync(AUTHORED_ASSET_ROOT)).toContain("tsconfig.json");
  });

  test("[미규정] 갈래를 바꿔 놓은 같은 이름도 조용히 제외된다", () => {
    // 문서는 뒤엣것을 `client/tsconfig.json`이라 갈래를 붙여 들었는데, 목록이 평면이라 반입
    // 자산 루트의 같은 이름도 제외된다. 반대 방향도 같다. 오늘 실물에 그 파일이 없으므로
    // 위반은 아니고, 정해야 할 것은 제외가 파일명인가 갈래별 자리인가다.
    expect(
      unregistered(ASSET_MANIFEST, "generated", ["tsconfig.json"], MANIFEST_EXEMPT_FILES),
    ).toEqual([]);
    expect(unregistered(ASSET_MANIFEST, "authored", [".gitkeep"], MANIFEST_EXEMPT_FILES)).toEqual(
      [],
    );
  });

  test("역검증 — 제외 목록 밖의 이름은 두 갈래 어디서든 잡힌다", () => {
    expect(unregistered(ASSET_MANIFEST, "generated", ["stray.js"], MANIFEST_EXEMPT_FILES)).toEqual([
      "stray.js",
    ]);
    expect(unregistered(ASSET_MANIFEST, "authored", ["stray.js"], MANIFEST_EXEMPT_FILES)).toEqual([
      "stray.js",
    ]);
    // 등재된 파일은 안 잡힌다 — 술어가 전부를 붉히는 상태가 아니다.
    expect(unregistered(ASSET_MANIFEST, "authored", ["wiring.js"], MANIFEST_EXEMPT_FILES)).toEqual(
      [],
    );
  });
});

/* ========================================================================= *
 * 축 7 — 형제 독립 QA의 배선 스캐너가 오늘의 통로를 보는가
 *
 * `qa-20260826-webui94-anchors.independent.test.ts`가 배선 쪽 닫힘을 리터럴 스캔으로 재고, 그
 * 축의 그린이 **모집단이 공집합일 때만** 뜻을 갖는다고 스스로 적었다. 그 파일이 함께 적은
 * 한계가 변수를 거친 조회를 못 본다는 것이다.
 *
 * **그 한계가 오늘 실물이 됐다.** 조회 통로가 붙었고 그것이 조회 API를 부르는데, 인자가 변수라
 * 스캐너가 0을 낸다. 즉 그 축의 안전줄(배선이 붙는 날 먼저 붉는다)이 안 당겨졌다. 결정 13이
 * 텍스트 스캔을 강제 수단으로 안 올린 근거가 여기서 실물을 얻는다.
 *
 * **[처분됨 — K-316 · 2026-08-27]** 위 관측은 그대로 참이고 축도 그대로다. 바뀐 것은 **그것이
 * 더 이상 열린 판정이 아니라는 것**이다 — 형제 파일의 안전줄이 실제 닿는 범위(인용부호 리터럴
 * 조회)로 좁혀졌고, 그 파일의 같은 등급도 함께 걷혔다. 이 축이 남는 이유는 그 좁힘이 옳다는
 * 근거를 실물로 계속 재기 때문이다(`WEB-UI.md` §9.4 결정 13).
 * ========================================================================= */

const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** 리터럴로 적힌 조회 이름만 뽑는다. 형제 파일의 술어를 독립으로 다시 쓴 것이다 */
function literalLookups(source: string): readonly string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/getElementById\(\s*["'`]([^"'`]*)["'`]\s*\)/g)) {
    const name = match[1];
    if (name !== undefined) found.push(name);
  }
  return found;
}

describe("축 7 — 배선 스캐너의 사각 (WEB-UI §9.4 결정 13)", () => {
  test("통로가 조회 API를 부르는데 리터럴 스캐너는 0을 낸다", () => {
    // [처분됨 — K-316 · 2026-08-27] 이 자리는 미규정 등급을 달고 있었고 그 등급이 든 열린
    // 판정이 **K-316 자신**이었다. 그 카드가 닫히며 처분이 정해졌으므로 등급을 걷는다 —
    // 닫힌 항목이 마커를 유지하면 진짜 열린 항목이 묻힌다(`MARKERS.md` §4.2). 남기는 참조는
    // `WEB-UI.md` §9.4 결정 13이고, 단언은 그대로다.
    const body = stripComments(readFileSync(join(AUTHORED_ASSET_ROOT, "wiring.js"), "utf8"));
    expect(body, "통로가 조회 API를 안 부른다 — 이 축의 전제가 사라졌다").toContain(
      "getElementById(",
    );
    expect(literalLookups(body), "스캐너가 변수 경유 조회를 보기 시작했다").toEqual([]);
  });

  test("역검증 — 같은 스캐너가 리터럴 조회는 잡는다", () => {
    expect(literalLookups('document.getElementById("gate-panel");')).toEqual(["gate-panel"]);
    expect(literalLookups(stripComments('// document.getElementById("gate-panel");'))).toEqual([]);
  });

  test("적합 — 그래서 이 방향을 재는 것은 스캔이 아니라 통로의 인자 타입이다", () => {
    // 결정 13이 텍스트 스캔을 계약으로 안 올린 근거가 이것이고, 그 대신 세운 것이 조회의 단일
    // 통로다. 그 통로가 실재하고 이름 전량을 받는다는 것을 여기서 함께 못박는다.
    expect(anchorElement).toBeTypeOf("function");
    for (const name of ANCHOR_NAMES) {
      const source: AnchorSource<FakeElement> = { getElementById: () => ({ tag: name }) };
      expect(anchorElement(source, name)).toEqual({ tag: name });
    }
  });
});
