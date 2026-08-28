/**
 * 독립 QA — `docs/WEB-UI.md` §9.4(결정 5·7·8·9·10·12·13) · §6.1(`StateSnapshot` 절) · §9.1 ·
 * §9.2 · §9.3 · §9.5 결정 4 · §9.6 결정 12 그리고 `docs/CLI-INTERFACE.md` §7.1.
 *
 * [처분됨 — K-361 · 2026-08-28] 이 열거는 §9.4 결정 7·8·9·10과 결정 12만 들고 있었다. 본문이
 * 실제로 대조 상대로 드는 §9.4 결정 13(축 1) · 결정 5(축 2의 하한) · §9.5 결정 4 · §9.6 결정 12가
 * 빠져 있었다. **규정은 처음부터 지켜졌고 틀린 것은 열거의 완전성이다** — `CLI-INTERFACE.md`
 * §7.1이 2026-08-21에 자기 열거에 대해 같은 판정을 쓴 형태 그대로다.
 *
 * **기대값은 위 문서에서만 뽑았다.** 구현을 열어 관찰한 동작에 맞춰 세운 축이 이
 * 파일에 없다. 실패하는 축은 실패한 채로 둔다 — 구현이 문서와 갈리면 이 파일은 문서 편이다.
 *
 * 형제 `qa-20260826-webui.independent.test.ts`와 다른 파일이고 그쪽을 고치지 않는다. 구현자
 * 계약 테스트(`anchors.contract.test.ts`·`assets.serving.contract.test.ts`)와 같은 결론에 닿는
 * 자리가 있으나 **재는 방식을 일부러 달리했다** — 같은 하네스를 공유하면 둘 다 같은 오해를
 * 공유하는 경우를 못 잡는다.
 *
 * ## 이 파일이 지는 다섯 축
 *
 * 1. 앵커 집합이 닫혀 있는가 — 목록 밖 이름을 배선이 쓰면 보이는가. **이 축이 잡는 것은
 *    인용부호 리터럴로 적힌 조회뿐이고**, 오늘 그 모집단이 공집합이다. 판정에 언제 힘을
 *    갖는가를 함께 적는다(2026-08-27 좁힘 — K-316. 조회 통로는 이미 섰으나 인자가 변수라
 *    이 스캐너의 물음 밖이다).
 * 2. 앵커 전수 대조가 **공집합 아닌 곳에서** 실제로 붉는가 — 디스크 경로와 메모리 픽스처 둘로.
 *    **2026-08-27 반입으로 실물 모집단이 섰다** — 그 축이 이제 반입된 화면을 실제로 읽는다.
 * 3. `safety`의 값 도메인이 `packages/cli/src/config.ts`의 유니온과 **집합으로** 같은가 —
 *    타입 쪽과 zod 쪽 둘 다.
 * 4. `config.sandbox === "off"` ⟺ 「셸이 호스트에서 돈다」 동치가 오늘 서는가 — 조립을 실제로
 *    돌려 `selectShell` 세 갈래를 전수로.
 * 5. CSP 헤더의 **값**이 결정 9를 만족하는가 — 존재만 재지 않는다.
 *
 * 등급 표기: `[계약 위반]` · `[문서 부정확]` · `[미규정]`. 판정 목록의 정본은
 * `plans/20260826-webui-94-serve-qa.md`다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 이 파일의 주석은 정본 문면을 인용부호로 감싸지 않고
 * 전부 서술로 적는다. 지목은 절 번호와 필드 이름으로 한다.
 */

import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import type { ModelClient, ModelStreamEvent } from "@neo-agent/core";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../cli/src/config.ts";
import type { CliApp, CliDeps } from "../../cli/src/wiring.ts";
import { startCli } from "../../cli/src/wiring.ts";
import { ANCHOR_NAMES } from "../client/anchors.js";
import type { AssetEntry, AssetManifest } from "../src/assets.ts";
import {
  ASSET_MANIFEST,
  AUTHORED_ASSET_ROOT,
  assetFilePath,
  createAssetHandler,
  GENERATED_ASSET_ROOT,
  isHtmlDocumentEntry,
  MANIFEST_EXEMPTIONS,
} from "../src/assets.ts";
import { stateSnapshotSchema } from "../src/protocol.ts";

/**
 * Docker 가용 판정의 결과 모양.
 *
 * `@neo-agent/sandbox`를 임포트하지 않는 이유는 §2.2의 의존성 예산이다 — `packages/serve`가
 * 드는 것은 코어와 zod 둘뿐이고, 테스트가 그 밖의 형제 패키지를 이름으로 들이면 이 디렉터리의
 * 경계 단정이 재는 그림이 흐려진다. 여기서 필요한 것은 주입점에 넣을 값의 모양 하나다.
 */
type DockerVerdict =
  | { readonly available: true; readonly version: string }
  | { readonly available: false; readonly reason: string };

/* ------------------------------------------------------------------------- *
 * 공용 도구
 * ------------------------------------------------------------------------- */

/** 응답 하나의 관측 — `writeHead`/`end`가 이 파일이 보는 전부다 */
type Written = {
  status: number | undefined;
  headers: Record<string, string>;
  body: string;
};

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** 자산 핸들러에 한 왕복을 먹인다. `end`가 비동기 경로에서 오므로 틱을 준다 */
async function exchange(
  manifest: AssetManifest,
  contents: string,
  request: { method?: string; url?: string },
): Promise<Written> {
  const written: Written = { status: undefined, headers: {}, body: "" };
  const response = {
    writeHead(status: number, headers: Readonly<Record<string, string>>): unknown {
      written.status = status;
      written.headers = { ...headers };
      return undefined;
    },
    end(body: string | Uint8Array): unknown {
      written.body = typeof body === "string" ? body : new TextDecoder().decode(body);
      return undefined;
    },
  };
  const handler = createAssetHandler({
    manifest,
    readAsset: () => Promise.resolve(new TextEncoder().encode(contents)),
    onReadError: (error) => {
      throw error;
    },
  });
  handler({ request, response });
  await tick();
  await tick();
  return written;
}

/* ========================================================================= *
 * 축 1 — 앵커 집합이 닫혀 있는가 (§9.4 결정 7)
 *
 * 결정 7이 가른 것은 층이다: 화면은 자리(앵커)만 주고 `/client/`의 모듈이 그 자리를 채운다.
 * 그래서 **닫힘은 양쪽에서 물어야 한다** — 화면 쪽은 축 2(전수 대조)가 재고, 배선 쪽은 이
 * 축이 잰다. 배선이 목록 밖 이름으로 DOM을 찾으면 그 자리는 화면에 없고, 실패는 조용하다
 * (`getElementById`가 null을 돌려주고 그리기가 그냥 안 일어난다 — `ARCHITECTURE.md` §2.6).
 *
 * **결정 7이 정한 순서가 셋째 칸까지 찼다.** 이름이 상수로 먼저 서고, 화면이 그 이름을 들고
 * 오고(2026-08-27 반입), 그다음에 배선이 붙는다 — 마지막 칸이 2026-08-28에 찼다
 * (`client/state.js` · `client/view.js` · `client/render.js` · `client/main.js`). **그래서 아래
 * 실물 축의 그린은 배선이 없어서가 아니라 배선이 §9.4 결정 13의 통로를 지켜 조회 인자를
 * 변수로 넘겨서 참이다.** 스캐너가 실제로 무엇을 잡는지는 심은 원문으로 증명한다.
 *
 * **[처분됨 — K-361 · 2026-08-28] 표지를 걷지 않고 뒤집는다.** 위 문단은 `5712ea1`까지 **배선이
 * 0건인 동안 이 축의 모집단이 비어 있다**고 적고, 이어 **아래 실물 축이 배선 0건을 단언한다**고
 * 적고 있었다. 앞엣것은 배선 사이클(`aa489c0`)이 거짓으로 만들었다 — 그 커밋은 아래 둘째
 * 단언 하나만 현행화하고 이 머리를 안 건드렸다. **뒤엣것은 K-316 좁힘 이후로도 이미
 * 거짓이었다**: 아래 실물 축이 단언하는 것은 배선 0건이 아니라 리터럴로 적힌 조회 0건이고,
 * 바로 아래 K-316 블록이 그 구별을 명시로 적는다. 즉 한 머리 안에서 두 문단이 서로를
 * 반증하고 있었다. **모집단이 다시 비면 아래 첫 단언이 먼저 붉고**, 그때 아래 그린이
 * 무의미해진 것을 사람이 아니라 검사가 말한다(`ARCHITECTURE.md` §2.6).
 *
 * **[처분됨 — K-316 · 2026-08-27] 이 축의 단언이 기대는 낱말의 뜻을 여기 적는다.** 결정 7이 든
 * 배선은 화면이 준 자리를 채우는 층이고, **조회 통로 자체는 그 층보다 먼저 섰다**
 * (`client/wiring.js`). 그 통로가 DOM 조회 API를 실제로 부르는데 인자가 변수라 아래 스캐너가
 * 그것을 안 본다. 그래서 아래 실물 축이 단언하는 것은 「DOM 조회 0건」이 아니라
 * **「인용부호 리터럴로 적힌 DOM 조회 0건」**이고, 그 좁힘 없이 적으면 §2.3이 이름 붙인
 * 형태(검사가 실제보다 넓게 주장하는 것)를 이 축이 저지른다. **그 좁힘이 오늘 이 축의 값을
 * 정한다** — §9.4 결정 13이 든 재도입 트리거(배선이 통로 밖에서 DOM을 여는 것이 실제로
 * 관측될 때)를 실물로 관측하는 자리가 여기이고, `client/` 전수를 이 방향으로 훑는 축은 오늘
 * 이 파일 하나다(형제 둘은 모집단이 `wiring.js` 한 파일이다).
 * ========================================================================= */

/**
 * 주석을 걷어 낸 본문 — 아래 스캐너 둘이 보는 입력이다.
 *
 * 형제 `qa-20260826-webui.independent.test.ts`가 텍스트 축에 이미 쓰는 형태를 그대로 세웠다.
 * 그 파일과 이 파일이 주석 처분에서 갈려 있던 것이 오늘까지의 비대칭이고, 한쪽만 고치면
 * 다음 사람이 그 갈림을 다시 만난다.
 */
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * 스캐너가 보는 모듈 하나. 원문이 아니라 **주석을 걷은 본문**을 든다.
 *
 * **왜 여기서 좁히는가.** 아래 두 스캐너가 재려는 것은 브라우저가 실제로 하는 일이다 — DOM
 * 조회를 부르는가, 그 모듈을 받아 가는가. 주석은 둘 중 어느 것도 일으키지 않으므로, 주석
 * 안의 표기를 세는 술어는 자기 주장에 대해 거짓 양성을 낸다. 특히 JSDoc의 타입 참조가 그
 * 형태다 — 타입만 들여오는 참조는 브라우저가 그 파일을 받아 가게 만들지 않는다.
 *
 * **좁혀도 fail-closed는 안 풀린다.** 런타임 임포트(정적·동적 모두)와 실제 조회 호출은 코드
 * 줄에 있으므로 그대로 잡힌다. 그것을 아래 역검증 축이 매 런 고정한다.
 *
 * 실물과 심은 표본이 **같은 통로**를 지나게 하려고 함수로 뺐다 — 실물만 좁히면 역검증이
 * 재는 것이 실물이 지나는 경로와 달라진다.
 */
const scannable = (file: string, raw: string): { file: string; source: string } => ({
  file,
  source: stripComments(raw),
});

/** `client/` 아래의 브라우저 모듈 전부. 자산이 아닌 파일(§9.2)은 뺀다 */
function clientModules(): readonly { file: string; source: string }[] {
  return readdirSync(AUTHORED_ASSET_ROOT)
    .filter((file) => file.endsWith(".js"))
    .map((file) => scannable(file, readFileSync(join(AUTHORED_ASSET_ROOT, file), "utf8")));
}

/**
 * 원문에서 **DOM 조회에 쓰인 앵커 이름**을 뽑는다.
 *
 * 표기는 §9.4 결정 7이 화면 쪽에 정한 `id` 하나에 대응하는 셋이다 — `getElementById("x")` ·
 * `querySelector("#x")` · `querySelectorAll("#x")`. 리터럴만 본다: 변수를 경유한 조회는 이
 * 스캐너가 못 보고, **그 한계를 여기 적는 것이 이 축의 절반이다**(§2.3 — 검사가 실제보다 넓게
 * 주장하지 않게).
 *
 * 방향이 §9.4 결정 8과 같다는 것이 이 스캐너가 성립하는 근거다: 이것이 묻는 것은 찾은
 * 이름이 목록 안인가이고, 변수 경유로 숨기면 그 조회는 **아예 안 잡히므로 위반이 없는 것으로
 * 읽힌다.** 그래서 이 축은 텍스트 스캔의 알려진 결함을 그대로 물려받는다 — 완전한 강제가
 * 아니고, 배선이 실제로 붙는 날 이 축이 무엇을 못 재는지가 판정 재료가 된다.
 *
 * 입력은 `scannable`이 주는 **주석 걷은 본문**이다. 주석 안의 조회 표기는 브라우저가 부르지
 * 않으므로 이 스캐너의 물음 밖이다.
 */
function domAnchorLookups(source: string): readonly string[] {
  const found: string[] = [];
  const patterns = [
    /getElementById\(\s*["'`]([^"'`]*)["'`]\s*\)/g,
    /querySelector(?:All)?\(\s*["'`]#([^"'`\s>[\].]*)["'`]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const name = match[1];
      if (name !== undefined) found.push(name);
    }
  }
  return found;
}

/** 목록 밖 이름을 쓴 자리들. 비어야 통과다 */
function offListLookups(
  modules: readonly { file: string; source: string }[],
  names: readonly string[],
): readonly { file: string; name: string }[] {
  const allowed = new Set(names);
  return modules.flatMap(({ file, source }) =>
    domAnchorLookups(source)
      .filter((name) => !allowed.has(name))
      .map((name) => ({ file, name })),
  );
}

/**
 * `anchors.js`를 **받아 가는** 모듈들. 자기 자신은 뺀다.
 *
 * 입력은 `scannable`이 주는 주석 걷은 본문이다 — 이 술어가 재려는 것은 브라우저가 그 파일을
 * 받아 갈 경로가 있는가이고, 주석 안의 이름은 그 경로를 만들지 않는다. 문자열 포함으로 남겨
 * 둔 이유는 정적·동적 임포트와 매니페스트 키 표기를 한 술어로 덮기 위해서다.
 *
 * **못 보는 것**: 이름을 런타임에 조립해 부르는 동적 임포트. 위 `domAnchorLookups`가 변수
 * 경유 조회에 대해 적은 한계와 같은 부류이고, 이 방향도 안 잡히면 위반이 없는 것으로 읽힌다.
 */
function anchorsImporters(modules: readonly { file: string; source: string }[]): readonly string[] {
  return modules
    .filter(({ file, source }) => file !== "anchors.js" && source.includes("anchors.js"))
    .map(({ file }) => file);
}

describe("축 1 — 앵커 집합의 닫힘 (WEB-UI §9.4 결정 7)", () => {
  it("리터럴로 적힌 DOM 조회가 오늘 0건이다 — 이 축의 그린은 여기서만 뜻을 갖는다", () => {
    // **판정에 반드시 붙는 조건**: 아래 «위반 0건»은 **이 스캐너가 잡는 형태의** DOM 조회가
    // 0건이라서 참이다. 그 형태의 조회가 생기는 날 이 단언이 **먼저** 붉고, 그때 고칠 것은
    // 이 단언이지 위반 축이 아니다.
    //
    // [처분됨 — K-316 · 2026-08-27] 이 자리는 그 근거를 「DOM 조회가 0건이라서 참이다」로
    // 적고 있었고 **그 문장은 오늘 거짓이다** — `client/wiring.js`의 조회 통로가 DOM 조회
    // API를 실제로 부른다. 여기서 안 잡히는 이유는 조회가 없어서가 아니라 인자가 변수라서다
    // (아래 「변수 경유 조회」 축이 그 형태를 표본으로 고정한다). 좁히지 않으면 검사가 실제보다
    // 넓게 주장하는 형태(§2.3)를 이 축이 저지른다.
    const modules = clientModules();
    expect(modules.length, "브라우저 모듈이 0건이면 스캐너가 죽은 것이다").toBeGreaterThan(0);
    const lookups = modules.flatMap(({ file, source }) =>
      domAnchorLookups(source).map((name) => ({ file, name })),
    );
    expect(
      lookups,
      "리터럴 DOM 조회가 생겼다 — 이 축이 힘을 얻었으니 이 단언을 걷고 아래 위반 축을 정본으로 삼아라",
    ).toEqual([]);
  });

  it("목록 밖 이름을 쓴 배선이 없다 — 오늘은 리터럴 조회의 공집합에서 참이다", () => {
    expect(offListLookups(clientModules(), ANCHOR_NAMES)).toEqual([]);
  });

  it("역검증 — 심은 목록 밖 이름을 스캐너가 세 표기 모두에서 잡는다", () => {
    const planted = [
      scannable("planted-a.js", 'const el = document.getElementById("transcript-foot");'),
      scannable("planted-b.js", 'root.querySelector("#gate-panel");'),
      scannable("planted-c.js", 'root.querySelectorAll("#safety-banner");'),
    ];
    expect(offListLookups(planted, ANCHOR_NAMES)).toEqual([
      { file: "planted-a.js", name: "transcript-foot" },
      { file: "planted-b.js", name: "gate-panel" },
      { file: "planted-c.js", name: "safety-banner" },
    ]);
  });

  it("역검증 — 목록 안 이름만 쓴 배선은 통과한다", () => {
    const wired = ANCHOR_NAMES.map((name, index) =>
      scannable(`wired-${String(index)}.js`, `document.getElementById("${name}");`),
    );
    expect(offListLookups(wired, ANCHOR_NAMES)).toEqual([]);
  });

  it("역검증 — 주석 안의 조회 표기는 안 잡고, 같은 표기가 코드 줄에 있으면 잡는다", () => {
    // **이 축이 없으면 「주석을 걷었다」가 「아무것도 안 잰다」와 구별되지 않는다.** 짝을
    // 이루는 두 표본이 같은 낱말을 들고 주석인가 코드인가에서만 갈린다 — 그래서 답이 갈리는
    // 원인이 주석 처분 하나로 좁혀진다.
    const commented = scannable(
      "commented.js",
      [
        "/**",
        ' * 머리가 예시로 root.querySelectorAll("#safety-banner")를 든다',
        " */",
        '// document.getElementById("transcript-foot");',
        '/* root.querySelector("#gate-panel"); */',
        "",
      ].join("\n"),
    );
    expect(offListLookups([commented], ANCHOR_NAMES), "주석 안의 표기가 잡혔다").toEqual([]);

    const live = scannable(
      "live.js",
      'document.getElementById("transcript-foot");\nroot.querySelector("#gate-panel");\n',
    );
    expect(offListLookups([live], ANCHOR_NAMES), "코드 줄의 표기를 놓쳤다").toEqual([
      { file: "live.js", name: "transcript-foot" },
      { file: "live.js", name: "gate-panel" },
    ]);
  });

  it("변수 경유 조회는 이 스캐너가 못 본다 — 한계를 단언으로 못박는다", () => {
    // 못 보는 것을 그린으로 두면 다음이 이 축을 완전한 강제로 읽는다. 이 단언이 붉어지는
    // 날은 스캐너가 넓어진 날이다.
    //
    // [처분됨 — K-316 · 2026-08-27] 이 자리는 미규정 등급을 달고 있었고, 그 등급이 든
    // 물음은 「그때 판정할 것은 §9.4가 이 방향을 요구하는가다」였다. **정본이 그 방향을 이미
    // 규정했고, 수단은 스캔이 아니라 타입이다** — `WEB-UI.md` §9.4 결정 13이 목록 밖 이름을
    // 타입 검사로 닫으면서 변수를 거친 조회도 넓은 문자열 타입이 유니온에 대입되지 않아 같은
    // 자리에서 함께 붉는다고 든다. 같은 항이 텍스트 스캔을 이 절의 강제 수단으로 올리는 것을
    // 명시로 배제하며 **이 축을 이름으로 지목한다.** 회색지대 조건이 소진됐으므로 등급을
    // 걷되(`MARKERS.md` §4.2 — 절 번호 참조를 남긴다) **축은 남긴다**: 이 단언이 이 스캐너의
    // 외연을 매 런 고정하고, 붉어지는 날 열리는 것은 그 배제의 재판정이다.
    const evasive = [
      scannable("evasive.js", 'const id = "gate-panel"; document.getElementById(id);'),
    ];
    expect(offListLookups(evasive, ANCHOR_NAMES)).toEqual([]);
  });

  it("[미규정] `/client/anchors.js`를 런타임으로 받아 가는 배선이 오늘 `view.js` 하나다", () => {
    // §9.2의 자산 정의는 *"자산은 브라우저가 URL로 받아 가는 종류의 파일"*이고, 같은 항이
    // 2026-08-27에 **판별을 종류로** 못박았다 — *"오늘 화면이 그 파일을 실제로 여는가는 정의에
    // 들지 않는다"*. **그래서 이 등재는 자산 정의를 만족한다** — 이 자리가 한때 그 반대를
    // 정의의 옛 문면(「종류의 파일」이 아직 안 붙어 있던 2026-08-26 판) 위에서 적고 있었고,
    // 그 명시가 선 근거로 정본이 이름 붙인 오독 셋 중 하나가 그것이다.
    //
    // **그럼에도 등급을 남긴다.** 닫힌 것은 「등재가 정의를 만족하는가」이고, 열린 채 남은 것은
    // 진입점이 형제를 임포트할 의무를 지는가다 — §9.5 결정 4가 그것을 안 들고 2026-08-27
    // 판정도 미규정을 유지했다. 아래 두 단언은 그 상태를 매 런 고정한다.
    //
    // **이 축이 재는 것은 받아 감이지 낱말의 출현이 아니다.** 그래서 술어의 입력이 주석 걷은
    // 본문이다 — 타입만 들여오는 JSDoc 참조는 브라우저가 그 파일을 받아 가게 만들지 않으므로
    // 이 물음에 대해 거짓 양성이다.
    //
    // [처분됨 — K-341 · 2026-08-28] 이 자리는 둘째 단언을 `[]`로 적고 그 위에
    // *"런타임 임포트가 생기면 이 단언이 붉는 것이 옳고, 그때 열리는 것은 등재가 자산 정의를
    // 만족하는가라는 위 물음 자체다"*로 **자기가 붉을 날을 예고하고 있었다.** 그날이
    // 2026-08-28이다 — §9.6 결정 12가 지목한 배선 사이클이 `main.js`의 임포트 그래프를 채웠고
    // `view.js`가 `ANCHOR_NAMES`를 런타임으로 들여온다. **예고한 물음은 열리지 않는다**:
    // 위 문단이 이미 적은 대로 §9.2가 판별을 종류로 못박아 도달은 등재의 조건이 아니고,
    // 도달이 생긴 것은 그 판정을 흔들지 않는다(오히려 근거가 한 겹 는다).
    //
    // **등급은 남는다.** 닫힌 것은 여전히 「등재가 정의를 만족하는가」뿐이고, 진입점이 형제를
    // 임포트할 의무를 지는가는 §9.5 결정 4가 2026-08-27에 **미규정 유지**로 판정한 그대로다
    // (§9.6 결정 12도 그것을 뒤집지 않고 트리거 발동 사실만 적었다). 이 축이 매 런 고정하는
    // 사실이 「0건」에서 「`view.js` 하나」로 바뀐 것이지 물음이 닫힌 것이 아니다.
    expect(Object.keys(ASSET_MANIFEST)).toContain("/client/anchors.js");
    expect(anchorsImporters(clientModules())).toEqual(["view.js"]);
  });

  it("역검증 — 주석 안의 `anchors.js`는 받아 감이 아니고, 코드 줄의 임포트는 받아 감이다", () => {
    // 위 단언의 그린이 「받아 갈 배선이 0건이다」이지 「스캐너가 죽었다」가 아님을 매 런
    // 고정한다. 두 표본이 같은 이름을 들고 주석인가 코드인가에서만 갈린다.
    const typeOnly = scannable(
      "type-only.js",
      [
        "/**",
        ' * @typedef {import("./anchors.js").AnchorName} AnchorName',
        " */",
        "export const noop = () => undefined;",
        "",
      ].join("\n"),
    );
    expect(anchorsImporters([typeOnly]), "주석 안의 이름이 받아 감으로 읽혔다").toEqual([]);

    const runtime = [
      scannable("static.js", 'import { ANCHOR_NAMES } from "./anchors.js";\n'),
      scannable("dynamic.js", 'const m = await import("./anchors.js");\n'),
    ];
    expect(anchorsImporters(runtime), "런타임 임포트를 놓쳤다").toEqual([
      "static.js",
      "dynamic.js",
    ]);

    // 자기 자신은 여전히 빠진다 — 좁힘이 그 제외를 무르게 하지 않았다.
    expect(anchorsImporters([scannable("anchors.js", 'export const x = "anchors.js";\n')])).toEqual(
      [],
    );
  });

  it("집합 자체의 성질 — 비지 않고, 중복이 없고, 동결돼 있다", () => {
    expect(ANCHOR_NAMES.length).toBeGreaterThan(0);
    expect(new Set(ANCHOR_NAMES).size).toBe(ANCHOR_NAMES.length);
    expect(Object.isFrozen(ANCHOR_NAMES)).toBe(true);
  });

  it("§9.4 결정 10의 안전 사실 둘이 앵커 집합에 자리를 갖는다", () => {
    // 결정 10 말미가 그 자리를 결정 7의 앵커 집합 안이라고 정했다. 이름 둘의 실제 값은
    // 세부(§12)이므로 리터럴로 고정하는 대신 **둘이 서로 다른 자리로 실재하는가**를 잰다 —
    // 하나로 합치면 승인 모드와 셸 갈래가 한 자리를 다투고, §7.1은 그 둘을 각각 계약으로 든다.
    //
    // **이 축은 그 대신 접두 규약에 결합된다 — 그리고 그 규약은 계약이 아니다**
    // (2026-08-28 판정 · `K-361`). 아래 술어가 안전 앵커를 `safety-` 접두로 고르는데, 결정 7
    // 말미가 이름의 실제 값을 §12의 세부로 두었고 §9.6의 범위 표는 두 이름을 실물로 들 뿐
    // 접두를 규약으로 세우는 항이 아니다. 즉 어느 절도 그 접두를 계약으로 안 든다.
    //
    // **그럼에도 계약으로 승격하지 않는다.** 접두가 바뀌면 이 술어가 빈 배열을 내고 이 축이
    // **붉으므로** 결합의 방향이 오탐이고, §2.3이 이름 붙인 형태(검사가 실제보다 넓게
    // 주장하는 것)의 반대라 조용한 실패를 안 만든다. 올리는 것은 결정 7이 명시로 세부에 둔
    // 것을 계약으로 되가져오는 일이다. **그래서 앵커가 개명되는 날 고칠 것은 계약이 아니라
    // 이 술어이고**, 그 사실을 여기 적는 것이 이 판정이 요구하는 전부다.
    const safetyAnchors = ANCHOR_NAMES.filter((name) => name.startsWith("safety-"));
    expect(safetyAnchors.length, "안전 사실 둘의 자리가 둘이 아니다").toBe(2);
  });
});

/* ========================================================================= *
 * 축 2 — 전수 대조가 공집합 아닌 곳에서 실제로 붉는가 (§9.4 결정 8)
 *
 * 결정 8이 이 대조를 계약으로 든 근거는 방향이다 — 못 찾으면 붉는다. 제출 시점에는 실물
 * 모집단이 공집합이라 항상 참인 단언과 구별되지 않았고, 아래는 **독립 재구현**한 감사
 * 함수로 그 구별을 만든다: 디스크를 실제로 읽는 경로 하나와 메모리 픽스처 여럿.
 *
 * **2026-08-27 반입이 실물 모집단을 세웠다.** 그 구별은 그대로 둔다 — 심은 표본으로 세운
 * 역검증이 없으면 실물 그린이 다시 «항상 참»과 구별되지 않는다. 바뀐 것은 아래 첫 두 축의
 * 모집단이고, 그 둘이 이제 반입된 화면 하나를 실제로 잰다.
 * ========================================================================= */

/** 앵커의 표기 — 결정 7이 화면에 요구한 `id` 하나 */
const markup = (name: string): string => `id="${name}"`;

/** 대조 대상 하나에서 못 찾은 이름들. 목록이 비면 통과다 */
type Missing = { route: string; missing: readonly string[] };

/**
 * 전수 대조의 독립 구현. 구현자 계약 테스트의 함수를 임포트하지 않는다 — 그것을 쓰면 두
 * 파일이 같은 오해를 공유할 때 둘 다 그린이 된다.
 *
 * 모집단은 `generated`이면서 `text/html`인 엔트리다(결정 8 — 앵커를 지는 것은 외부 도구가
 * 뽑은 화면이다). 판별을 이 파일이 직접 적는 것도 같은 근거다.
 */
function auditScreens(
  manifest: AssetManifest,
  read: (entry: AssetEntry) => string,
  names: readonly string[],
): readonly Missing[] {
  const findings: Missing[] = [];
  for (const [route, entry] of Object.entries(manifest)) {
    if (entry.origin !== "generated") continue;
    if (!entry.contentType.toLowerCase().startsWith("text/html")) continue;
    const source = read(entry);
    const missing = names.filter((name) => !source.includes(markup(name)));
    if (missing.length > 0) findings.push({ route, missing });
  }
  return findings;
}

const screenWith = (names: readonly string[]): string =>
  ["<!doctype html>", "<body>", ...names.map((n) => `<div ${markup(n)}></div>`), "</body>"].join(
    "\n",
  );

const generatedEntry = (file: string, contentType = "text/html; charset=utf-8"): AssetEntry => ({
  origin: "generated",
  file,
  contentType,
  prompt: "ui_kits/console/console.prompt.md",
  pulledAt: "2026-08-26",
  sha256: "0".repeat(64),
});

describe("축 2 — 앵커 전수 대조 (WEB-UI §9.4 결정 8)", () => {
  it("실물 모집단이 섰다 — 아래 그린이 이제 화면 하나를 실제로 잰다", () => {
    // [처분됨 — 2026-08-27 반입] 이 자리는 "실물 모집단이 공집합이다"를 단언으로 못박아, 아래
    // 그린을 "화면이 앵커를 든다"로 읽지 않게 한 표지였다. 반입 사이클이 그 전제를 없앴다 —
    // 표지를 걷지 않고 뒤집는다. 모집단이 다시 비면 이 단언이 **먼저** 붉고, 그때 아래 그린이
    // 무의미해진 것을 사람이 아니라 검사가 말한다(`ARCHITECTURE.md` §2.6).
    // 넓은 타입으로 읽는다 — `as const`가 오늘의 값에 맞춰 판별자를 한 갈래로 좁혀 두어
    // 그대로 비교하면 겹치지 않는 비교가 되고, 그 순간 이 축이 타입에서 사라진다.
    const manifest: AssetManifest = ASSET_MANIFEST;
    const screens = Object.entries(manifest).filter(
      ([, entry]) =>
        entry.origin === "generated" && entry.contentType.toLowerCase().startsWith("text/html"),
    );
    // 결정 12가 이 모집단에 상한을 함께 걸었다 — `generated` HTML 문서는 많아야 하나다.
    // **하한의 정본은 반입이 아니라 §9.4 결정 5다** — 그 항이 `generated` 키를 `/`(`index.html` ·
    // `text/html; charset=utf-8`)와 `/tokens.css`로 **규범으로** 닫는다. 둘이 만나 정확히 하나가 된다.
    //
    // [처분됨 — K-361 · 2026-08-28] 이 자리는 `5712ea1`까지 **하한은 이 반입이 세웠다**고 적어
    // 하한을 관측에 귀속하고 있었다. 결정 5가 2026-08-27에 관측형 서술을 규범형으로 바꾸며
    // 그 근거를 스스로 적었다 — 관측형은 실물이 움직일 때마다 조용히 낡고, 규범형은 어긋나는
    // 순간 위반이다. 이 문장이 그 자리에서 관측형으로 되돌아가 있었다.
    expect(screens, "화면 모집단이 하나가 아니다").toHaveLength(1);
  });

  it("실물 매니페스트에 위반이 없다 — 반입된 화면을 디스크에서 읽어 전수 대조한다", () => {
    const read = (entry: AssetEntry): string => readFileSync(assetFilePath(entry), "utf8");
    expect(auditScreens(ASSET_MANIFEST, read, ANCHOR_NAMES)).toEqual([]);
  });

  it("디스크 경로가 실제로 돈다 — 실재하는 빈 파일을 화면으로 두면 전건이 붉는다", () => {
    // **모의 읽기가 아니라 `assetFilePath` + 디스크다.** 반입 자산 루트에 실재하는 파일
    // (`.gitkeep` — §9.2가 자산 아닌 파일로 든 배치 수단)을 화면 엔트리로 가리켜, 경로 조립과
    // 읽기가 실물에서 도는 것을 보인다. 레포에 파일을 새로 쓰지 않는 것이 이 선택의 이유다.
    const placeholder = MANIFEST_EXEMPTIONS.find(
      (exemption) => exemption.origin === "generated" && exemption.file === ".gitkeep",
    );
    expect(placeholder, "§9.2가 든 배치 수단이 사라졌다").toBeDefined();
    const entry = generatedEntry(placeholder?.file ?? ".gitkeep");
    expect(assetFilePath(entry).startsWith(GENERATED_ASSET_ROOT)).toBe(true);

    const read = (target: AssetEntry): string => readFileSync(assetFilePath(target), "utf8");
    const findings = auditScreens({ "/": entry }, read, ANCHOR_NAMES);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.missing).toEqual([...ANCHOR_NAMES]);
  });

  it("앵커를 다 든 화면은 통과한다", () => {
    expect(
      auditScreens(
        { "/": generatedEntry("index.html") },
        () => screenWith(ANCHOR_NAMES),
        ANCHOR_NAMES,
      ),
    ).toEqual([]);
  });

  it("역검증 — 이름 하나를 빼면 정확히 그 이름이 목록에 온다", () => {
    for (const dropped of ANCHOR_NAMES) {
      const source = screenWith(ANCHOR_NAMES.filter((name) => name !== dropped));
      expect(
        auditScreens({ "/": generatedEntry("index.html") }, () => source, ANCHOR_NAMES),
        `${dropped}을 뺐는데 안 잡혔다`,
      ).toEqual([{ route: "/", missing: [dropped] }]);
    }
  });

  it("역검증 — 접두 관계인 이름이 서로를 채우지 않는다", () => {
    const prefixes = ANCHOR_NAMES.filter((name) =>
      ANCHOR_NAMES.some((other) => other !== name && other.startsWith(name)),
    );
    expect(prefixes.length, "접두 관계가 없어 이 축이 공허하다").toBeGreaterThan(0);
    for (const prefix of prefixes) {
      const longer = ANCHOR_NAMES.filter((name) => name !== prefix && name.startsWith(prefix));
      const source = screenWith([prefix]);
      const found = auditScreens({ "/": generatedEntry("index.html") }, () => source, ANCHOR_NAMES);
      for (const name of longer) {
        expect(found[0]?.missing, `${prefix}이 ${name}을 채운 것으로 읽혔다`).toContain(name);
      }
    }
  });

  it("역검증 — 다른 표기는 앵커로 안 읽힌다", () => {
    for (const alternate of [
      (name: string) => `data-anchor="${name}"`,
      (name: string) => `id='${name}'`,
      (name: string) => `id=${name}`,
    ]) {
      const source = ANCHOR_NAMES.map((name) => `<div ${alternate(name)}></div>`).join("\n");
      const found = auditScreens({ "/": generatedEntry("index.html") }, () => source, ANCHOR_NAMES);
      expect(found[0]?.missing, "다른 표기가 앵커로 읽혔다").toEqual([...ANCHOR_NAMES]);
    }
  });

  it("적합 — 대소문자만 다른 화면도 결정 8의 모집단에 든다", () => {
    // **이 축은 V-1의 처분 자리다**(2026-08-26). 제출 시점에 이 단정은 구현의 술어가 그것을
    // 화면으로 **안** 봤다를 재며 붉은 채로 섰다 — 미디어 타입은 HTTP에서 대소문자를 안
    // 가리므로 `TEXT/HTML` 엔트리도 브라우저가 HTML 문서로 팔고, 그런데 구현의 술어가
    // 그것을 빠뜨렸다. 결정 8의 전수 대조와 결정 9의 CSP가 **같은 술어를 쓰므로** 매니페스트의
    // 대소문자 하나가 두 계약을 동시에 조용히 비우는 자리였다.
    //
    // 처분 뒤 이 축은 **고친 계약을 잰다.** 단정을 뒤집으면서 이름과 등급도 함께 뒤집는다 —
    // 재는 것과 반대를 말하는 축은 붉어져도 원인을 잘못 읽히고, 그것이 이 레포가 이미 이름
    // 붙인 형태다(`K-303`이 그 실물이다).
    //
    // **[처분됨 — K-361 · 2026-08-28] 아래 픽스처는 오늘 매니페스트에 설 수 있는 엔트리가
    // 아니다.** 위 문단이 대소문자 무관을 근거로 그것을 정당한 화면처럼 읽게 하는데, 그 서술이
    // 쓰인 2026-08-26 뒤에 §9.2가 `contentType`의 정규형을 확정했다 — 소문자이고 양끝 공백이
    // 없는 MIME 타입 문자열이며, 대소문자·여백 변형은 다른 표기가 아니라 위반이고 그 형식은
    // 표의 불변 조건이 잰다. 즉 `TEXT/HTML`은 **화면이 아니라 매니페스트 위반**이다.
    //
    // **그래도 축은 남긴다 — 이것은 방어 심층이다.** 재는 것이 매니페스트의 적법성이 아니라
    // 술어의 관대함이기 때문이다: 결정 8의 전수 대조와 결정 9의 CSP가 같은 술어를 쓰므로
    // `isHtmlDocumentEntry`가 이 방향으로 미끄러지면 두 계약이 함께 조용해진다. 정규형을 재는
    // 자리가 붉기 전에 이 축이 그 술어를 고정한다.
    const screen = generatedEntry("index.html", "TEXT/HTML; charset=utf-8");
    const mine = auditScreens({ "/": screen }, () => "앵커가 하나도 없다", ANCHOR_NAMES);
    expect(mine, "이 파일의 감사는 그것을 화면으로 본다").toHaveLength(1);
    expect(isHtmlDocumentEntry(screen), "구현의 술어가 그것을 화면으로 안 본다").toBe(true);
  });

  it("적합 — `authored`인데 `text/html`인 엔트리는 결정 8의 대조 밖이다 (§9.4 결정 12)", () => {
    // §9.4 결정 8은 앵커를 지는 것을 화면이라 하고 §9.3의 표는 화면을 `generated`로 둔다.
    // 그래서 모집단이 `generated`인 것은 문서를 따른 결과다 — 다만 **판별자를 잘못 적은
    // 반입**(화면을 `authored`로 등재)이 이 대조를 통째로 빠져나가는 것을 어느 문서도 다루지
    // 않았다. 오늘 그 상태를 만들 사람은 매니페스트를 손으로 쓰는 사람 하나다(§9.2).
    //
    // **2026-08-27에 §9.4 결정 12가 이 자리를 규정했다 — 그래서 등급을 걷는다.** 그 항이
    // 고른 것은 모집단을 넓히는 쪽이 아니다: 판별자가 `authored`이면서 미디어 타입이 HTML
    // 문서인 조합 자체를 매니페스트에서 금지한다. 그러므로 아래 빈 결과는 결함이 아니라
    // **문서가 정한 대로**이고, 이 축이 재는 것은 결정 8의 모집단이 여전히 좁다는 사실이다.
    //
    // **이 축은 그 금지를 재지 않는다.** 금지가 실제로 서는가는 매니페스트의 형태를 재는
    // 자리(`assets.contract.test.ts`)의 몫이고, 여기서 그것을 겸하면 매니페스트를 재는
    // 자리가 둘이 된다. 그 자리가 서면 아래 픽스처는 실물에 없는 조합을 심은 표본으로
    // 남는다 — 그때 이 축이 무엇을 재는지 다시 읽어야 한다.
    const mislabeled: AssetEntry = {
      origin: "authored",
      file: "index.html",
      contentType: "text/html; charset=utf-8",
    };
    expect(auditScreens({ "/": mislabeled }, () => "앵커가 하나도 없다", ANCHOR_NAMES)).toEqual([]);
  });
});

/* ========================================================================= *
 * 축 3 — `safety`의 값 도메인 (§6.1 `StateSnapshot` 절 · §9.4 결정 10)
 *
 * §6.1은 두 값이 `packages/cli`의 설정 유니온을 그대로 옮긴 것이고 이 문서가 넓히지 않는다고
 * 적었다. **«그대로»는 집합 동일성이지 포함이 아니다.** 그래서 아래는 두 쪽의 **받아들이는
 * 값의 집합**을 각각 실측해 비교한다 — 타입 축은 컴파일 시점에만 존재하므로 런타임에서
 * 재려면 각 층의 판정자를 실제로 돌리는 수밖에 없다.
 * ========================================================================= */

/** 두 쪽에 함께 먹여 볼 후보. 계약이 든 넷과, 넓힘·오타의 대표를 함께 넣는다 */
const APPROVAL_CANDIDATES = ["manual", "off", "on", "auto", "ask", "OFF", ""] as const;
const SANDBOX_CANDIDATES = ["on", "off", "manual", "auto", "docker", "ON", ""] as const;

/** zod 층이 받는가 — 스냅샷 스키마를 통째로 돌린다(필드 하나만 갈아 끼운다) */
function snapshotAccepts(safety: { approvalMode: string; sandbox: string }): boolean {
  return stateSnapshotSchema.safeParse({
    sessionId: "s-1",
    transcript: { complete: true, messages: [] },
    pendingApprovals: [],
    safety,
  }).success;
}

/** `packages/cli`의 설정 로더가 받는가 — 임시 홈에 실제 파일을 쓰고 돌린다 */
function configAccepts(key: "approvalMode" | "sandbox", value: string): boolean {
  const home = mkdtempSync(join(tmpdir(), "neo-qa-safety-"));
  try {
    const path = join(home, "config.json");
    writeFileSync(path, JSON.stringify({ [key]: value }));
    // 부르는 것은 `packages/cli/src/config.ts`의 로더 하나다 — 그것이 곧 §6.1이 말하는
    // 설정 유니온의 판정자이고, 도메인의 사본을 이 파일이 따로 적으면 정본이 둘이 된다.
    loadConfig(path);
    return true;
  } catch {
    return false;
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

describe("축 3 — safety 값 도메인의 집합 동일성 (WEB-UI §6.1)", () => {
  it("zod 층이 받는 approvalMode 집합", () => {
    const accepted = APPROVAL_CANDIDATES.filter((value) =>
      snapshotAccepts({ approvalMode: value, sandbox: "on" }),
    );
    expect([...accepted].sort()).toEqual(["manual", "off"]);
  });

  it("zod 층이 받는 sandbox 집합", () => {
    const accepted = SANDBOX_CANDIDATES.filter((value) =>
      snapshotAccepts({ approvalMode: "manual", sandbox: value }),
    );
    expect([...accepted].sort()).toEqual(["off", "on"]);
  });

  it("`safety`가 옵셔널이 아니다 — 안전 사실 없는 스냅샷은 표현 불가능이다", () => {
    expect(
      stateSnapshotSchema.safeParse({
        sessionId: "s-1",
        transcript: { complete: true, messages: [] },
        pendingApprovals: [],
      }).success,
    ).toBe(false);
  });

  it("스냅샷의 필드가 §6.1이 든 넷과 집합으로 같다", () => {
    const parsed = stateSnapshotSchema.safeParse({
      sessionId: "s-1",
      transcript: { complete: true, messages: [] },
      pendingApprovals: [],
      safety: { approvalMode: "off", sandbox: "off" },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success ? Object.keys(parsed.data).sort() : []).toEqual([
      "pendingApprovals",
      "safety",
      "sessionId",
      "transcript",
    ]);
  });

  it("`packages/cli` 설정 로더가 받는 두 집합 — 비교가 공허하지 않은 것을 먼저 못박는다", () => {
    // 두 probe가 똑같이 고장 나면(예: 둘 다 전건 거부) 아래 [핵심] 축이 조용히 그린이 된다.
    // 그래서 cli 쪽 집합도 계약 값으로 직접 고정한다 — 이쪽 리터럴의 정본은 §6.1이 이름으로
    // 든 `CliConfig.approvalMode`·`CliConfig.sandbox`이고, 그 값은 `SAFE-DEFAULTS.md` §1·§2다.
    expect(
      APPROVAL_CANDIDATES.filter((value) => configAccepts("approvalMode", value)).toSorted(),
    ).toEqual(["manual", "off"]);
    expect(
      SANDBOX_CANDIDATES.filter((value) => configAccepts("sandbox", value)).toSorted(),
    ).toEqual(["off", "on"]);
  });

  it("[핵심] zod 층과 `packages/cli` 설정 로더의 도메인이 집합으로 같다", () => {
    const serveApproval = APPROVAL_CANDIDATES.filter((value) =>
      snapshotAccepts({ approvalMode: value, sandbox: "on" }),
    );
    const cliApproval = APPROVAL_CANDIDATES.filter((value) => configAccepts("approvalMode", value));
    expect([...cliApproval].sort(), "approvalMode 도메인이 두 층에서 갈렸다").toEqual(
      [...serveApproval].sort(),
    );

    const serveSandbox = SANDBOX_CANDIDATES.filter((value) =>
      snapshotAccepts({ approvalMode: "manual", sandbox: value }),
    );
    const cliSandbox = SANDBOX_CANDIDATES.filter((value) => configAccepts("sandbox", value));
    expect([...cliSandbox].sort(), "sandbox 도메인이 두 층에서 갈렸다").toEqual(
      [...serveSandbox].sort(),
    );
  });

  it("역검증 — 도메인이 한쪽으로 넓은 짝을 비교기가 잡는다", () => {
    // 위 축이 둘 다 같은 것을 받는다를 실제로 재는지 보인다. 넓힘·좁힘 둘 다 잡혀야 한다.
    const widened = ["manual", "off", "auto"];
    const narrowed = ["manual"];
    const base = ["manual", "off"];
    expect([...widened].sort()).not.toEqual([...base].sort());
    expect([...narrowed].sort()).not.toEqual([...base].sort());
  });

  it("적합 — 한 방향 축이 왜 모자란가 (처분 뒤 — D-1의 근거를 남긴다)", () => {
    // **제출 시점의 판정은 [문서 부정확]이었다**: `packages/cli/src/serve.ts`의 컴파일 축이
    // `Pick<CliConfig, …> extends 스냅샷의 safety` **하나**여서 부분집합 판정이었고, 그래서
    // §6.1이 정면으로 금한 방향(스냅샷 쪽이 넓어지는 것)이 그린으로 통과했다. 같은 날 실행
    // 사이클이 그 자리에 **역방향 축을 더해** 집합 동일성으로 닫았다.
    //
    // 이 축은 그대로 둔다 — 재는 것이 배선의 오늘 상태가 아니라 **한 방향 축이 원리적으로
    // 무엇을 놓치는가**이고, 그 사실은 처분 뒤에도 참이다. 다음에 누가 축 하나를 지우면
    // 무엇이 열리는지가 여기 남는다. 아래 모사 타입이 그 비대칭을 컴파일러로 증명한다.
    type CliSide = { readonly approvalMode: "manual" | "off"; readonly sandbox: "on" | "off" };
    type WidenedSnapshot = {
      readonly approvalMode: "manual" | "off";
      readonly sandbox: "on" | "off" | "auto";
    };
    type NarrowedCli = { readonly approvalMode: "manual" | "off"; readonly sandbox: "off" };
    type SnapshotSide = CliSide;

    // 스냅샷이 넓어져도 부분집합 판정은 참이다.
    const widenedStillFits: CliSide extends WidenedSnapshot ? true : false = true;
    // cli가 좁아져도 부분집합 판정은 참이다.
    const narrowedStillFits: NarrowedCli extends SnapshotSide ? true : false = true;

    expect(widenedStillFits).toBe(true);
    expect(narrowedStillFits).toBe(true);
    // 즉 한 방향만 두면 그 두 방향은 어느 기계도 안 잰다 — 그래서 배선이 양방향으로 섰다.
  });
});

/* ========================================================================= *
 * 축 4 — `config.sandbox === "off"` ⟺ 「셸이 호스트에서 돈다」
 *
 * `CLI-INTERFACE.md` §7.1이 안전 사실 둘을 계약으로 들면서 셸 쪽 항목의 출처를 5b 판정 동결로
 * 두고, 그 항목의 문면도 `sandbox: "off"` 하나만 든다. §9.4 결정 10은 같은 사실을 브라우저
 * 화면이 지속 표시하라고 하는데 §6.1의 `safety.sandbox`는 **설정에서** 온다. 두 출처가 같은
 * 것을 말해야 한다는 요구를 어느 문서도 적지 않으므로, 이 축이 재는 것은 **오늘의 동치가
 * 실제로 서는가**다 — 안 서면 화면이 격리 여부를 거짓으로 말한다.
 *
 * 모집단은 `selectShell`의 세 갈래 전부다. 조립을 실제로 돌린다 — 소스를 읽어 갈래를 세는
 * 것으로는 그 갈래에서 셸 도구가 실제로 등록되는가를 못 잰다.
 * ========================================================================= */

const QA_MODEL = "qa-webui94/local";

function silentModel(): ModelClient {
  return {
    modelId: QA_MODEL,
    async *stream(): AsyncIterable<ModelStreamEvent> {
      yield {
        type: "done",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "qa" }],
          stopReason: "end_turn",
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          timestamp: Date.now(),
        },
      };
    },
  };
}

type ShellRun = {
  app: CliApp;
  hostExecutorCalls: number;
  sandboxExecutorCalls: number;
  dockerProbes: number;
};

let started: CliApp | undefined;
let scratch: string | undefined;

afterEach(async () => {
  await started?.shutdown();
  started = undefined;
  if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true });
  scratch = undefined;
});

/**
 * 조립을 한 번 돌린다. `serve` 갈래로 부르는 이유는 §9.4·§6.1이 재는 호스트가 그쪽이고,
 * REPL 진입(`run()`)을 지나지 않아 화면 부작용이 없기 때문이다.
 *
 * 대역은 셋뿐이고 셋 다 계약이 연 주입점이다 — 모델(네트워크로 나갈 수 없다), Docker 판정
 * (머신 상태에 좌우되면 안 된다), 실행자 팩토리(어느 쪽이 불렸는지를 세야 한다).
 */
async function runAssembly(options: {
  sandbox: "on" | "off";
  docker: DockerVerdict;
}): Promise<ShellRun> {
  const root = mkdtempSync(join(tmpdir(), "neo-qa-shell-"));
  scratch = root;
  const home = join(root, "home");
  const workspace = join(root, "ws");
  mkdirSync(join(home, ".neo-agent"), { recursive: true });
  mkdirSync(workspace, { recursive: true });
  writeFileSync(
    join(home, ".neo-agent", "config.json"),
    JSON.stringify({ model: QA_MODEL, sandbox: options.sandbox }),
  );
  // §3.1 — `serve`는 첫 기동일 수 없다. 판정 재료가 `sessions.db`의 부재 하나뿐이라 빈 파일
  // 하나면 지나간 홈이 된다. 모드를 명시하는 것은 권한 경고가 새로 나가지 않게 하기 위해서다.
  const db = join(home, ".neo-agent", "sessions.db");
  writeFileSync(db, "");
  chmodSync(db, 0o600);

  const counters = { host: 0, sandboxed: 0, probes: 0 };
  const output = Object.assign(new PassThrough(), {
    write: (): boolean => true,
  }) as unknown as CliDeps["io"]["output"];

  const deps: CliDeps = {
    argv: ["serve"],
    env: { ANTHROPIC_API_KEY: "qa-webui94-key" },
    cwd: workspace,
    home,
    io: { input: new PassThrough(), output },
    version: "0.0.0-qa",
    out: { write: () => undefined },
    factories: {
      probeDocker: async (): Promise<DockerVerdict> => {
        counters.probes += 1;
        return options.docker;
      },
      createModelClient: () => silentModel(),
      createExecutor: () => {
        counters.host += 1;
        return {
          exec: async () => ({
            stdout: "",
            stderr: "",
            exitCode: 0,
            truncated: false,
            timedOut: false,
          }),
        };
      },
      createSandboxExecutor: () => {
        counters.sandboxed += 1;
        return {
          exec: async () => ({
            stdout: "",
            stderr: "",
            exitCode: 0,
            truncated: false,
            timedOut: false,
          }),
        };
      },
    },
  };

  const app = await startCli(deps, { kind: "serve" });
  started = app;
  return {
    app,
    hostExecutorCalls: counters.host,
    sandboxExecutorCalls: counters.sandboxed,
    dockerProbes: counters.probes,
  };
}

/** 「셸이 호스트에서 돈다」의 관측 가능한 형태 — 호스트 실행자가 서고 셸 도구가 등록됐다 */
function shellRunsOnHost(run: ShellRun): boolean {
  const registered = run.app.parts.tools.some((tool) => tool.name === "shell");
  return registered && run.hostExecutorCalls === 1 && run.sandboxExecutorCalls === 0;
}

describe("축 4 — sandbox off ⟺ 셸이 호스트에서 돈다 (CLI-INTERFACE §7.1 · WEB-UI §9.4 결정 10)", () => {
  it('갈래 1 — sandbox "off"에서 셸이 호스트에서 돈다', async () => {
    const run = await runAssembly({
      sandbox: "off",
      // 불리면 안 되는 갈래다(§2 단계 5b — 옵트아웃에서는 판정 자체를 하지 않는다).
      docker: { available: false, reason: "이 값이 쓰이면 판정이 일어난 것이다" },
    });
    expect(run.app.parts.shell.kind).toBe("host");
    expect(run.dockerProbes, "옵트아웃인데 Docker 판정이 일어났다").toBe(0);
    expect(shellRunsOnHost(run)).toBe(true);
    expect(run.app.parts.config.sandbox).toBe("off");
  }, 20_000);

  it('갈래 2 — sandbox "on" + Docker 가용에서는 호스트에서 안 돈다', async () => {
    const run = await runAssembly({
      sandbox: "on",
      docker: { available: true, version: "qa-29.0.0" },
    });
    expect(run.app.parts.shell.kind).toBe("sandbox");
    expect(run.app.parts.tools.some((tool) => tool.name === "shell")).toBe(true);
    expect(run.hostExecutorCalls, "호스트 실행자가 섰다").toBe(0);
    expect(shellRunsOnHost(run)).toBe(false);
  }, 20_000);

  it('갈래 3 — sandbox "on" + Docker 불가용에서는 셸이 아예 없다', async () => {
    const run = await runAssembly({
      sandbox: "on",
      docker: { available: false, reason: "QA가 고정한 불가용" },
    });
    expect(run.app.parts.shell.kind).toBe("unavailable");
    // §7.1이 이 갈래를 호스트 실행으로 세우면 상태줄이 거짓말한다고 못박은 자리다.
    expect(run.app.parts.tools.some((tool) => tool.name === "shell")).toBe(false);
    expect(run.hostExecutorCalls).toBe(0);
    expect(run.sandboxExecutorCalls).toBe(0);
    expect(shellRunsOnHost(run)).toBe(false);
  }, 20_000);

  it("동치가 세 갈래 전수에서 선다 — 설정 값 하나가 화면의 사실을 결정한다", async () => {
    const cases: { sandbox: "on" | "off"; docker: DockerVerdict }[] = [
      { sandbox: "off", docker: { available: true, version: "qa-29.0.0" } },
      { sandbox: "on", docker: { available: true, version: "qa-29.0.0" } },
      { sandbox: "on", docker: { available: false, reason: "QA가 고정한 불가용" } },
    ];
    for (const scenario of cases) {
      const run = await runAssembly(scenario);
      const fromConfig = run.app.parts.config.sandbox === "off";
      expect(
        shellRunsOnHost(run),
        `sandbox=${scenario.sandbox} docker=${String(scenario.docker.available)}에서 동치가 깨졌다`,
      ).toBe(fromConfig);
      // §6.1의 스냅샷이 싣는 값도 같은 출처여야 한다 — 화면이 읽는 것은 이 값이다.
      expect(run.app.parts.shell.kind === "host").toBe(fromConfig);
      await started?.shutdown();
      started = undefined;
      if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true });
      scratch = undefined;
    }
  }, 40_000);
});

/* ========================================================================= *
 * 축 5 — CSP 헤더의 **값** (§9.4 결정 9)
 *
 * 결정 9가 계약으로 든 것은 셋이다: HTML 문서 응답이 `default-src 'self'`를 싣는다 · 인라인
 * 스크립트가 함께 막힌다 · 인라인 스타일은 허용한다. **존재만 재면 `default-src *`도 그린이
 * 되므로** 아래는 지시어 표로 갈라 값을 잰다.
 * ========================================================================= */

/** `name value…; name value…`를 지시어 표로 가른다 */
function directives(value: string): Map<string, readonly string[]> {
  const table = new Map<string, readonly string[]>();
  for (const part of value.split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    const [name, ...rest] = tokens;
    if (name !== undefined) table.set(name.toLowerCase(), rest);
  }
  return table;
}

/** 인라인 스크립트가 실제로 도는가 — 스타일은 결정 9가 명시로 연 예외라 뺀다 */
function reopensInlineScript(value: string): boolean {
  const table = directives(value);
  const effective =
    table.get("script-src") ?? table.get("script-src-elem") ?? table.get("default-src") ?? [];
  if (effective.includes("'unsafe-inline'") || effective.includes("'unsafe-eval'")) return true;
  for (const [name, values] of table) {
    if (name === "style-src" || name === "style-src-elem" || name === "style-src-attr") continue;
    if (values.includes("'unsafe-inline'") || values.includes("'unsafe-eval'")) return true;
  }
  return false;
}

const DOCUMENT_ROUTE = "/";
const documentManifest: AssetManifest = { [DOCUMENT_ROUTE]: generatedEntry("index.html") };

async function documentCsp(): Promise<string> {
  const written = await exchange(documentManifest, "<!doctype html>", {
    method: "GET",
    url: DOCUMENT_ROUTE,
  });
  expect(written.status).toBe(200);
  const header = written.headers["content-security-policy"];
  expect(header, "HTML 문서 응답에 CSP가 없다").toBeDefined();
  return header ?? "";
}

describe("축 5 — CSP 값 (WEB-UI §9.4 결정 9)", () => {
  it("`default-src`가 정확히 `'self'`다 — 이름만 재지 않는다", async () => {
    expect(directives(await documentCsp()).get("default-src")).toEqual(["'self'"]);
  });

  it("인라인 스크립트를 다시 여는 지시어가 없다", async () => {
    expect(reopensInlineScript(await documentCsp())).toBe(false);
  });

  it("역검증 — 인라인을 다시 여는 값들을 술어가 실제로 잡는다", () => {
    for (const bad of [
      "default-src 'self' 'unsafe-inline'",
      "default-src 'self'; script-src 'self' 'unsafe-inline'",
      "default-src 'self'; script-src-elem 'self' 'unsafe-inline'",
      "default-src 'self'; script-src 'self' 'unsafe-eval'",
      "default-src 'self'; connect-src 'self' 'unsafe-inline'",
    ]) {
      expect(reopensInlineScript(bad), `${bad}이 안 잡혔다`).toBe(true);
    }
    // 스타일만 여는 것은 결정 9가 명시로 허용한 형태다 — 이것까지 잡으면 술어가 넓다.
    expect(reopensInlineScript("default-src 'self'; style-src 'self' 'unsafe-inline'")).toBe(false);
  });

  it("인라인 스타일은 허용된다 — 겸사겸사 막지 않는다", async () => {
    expect(directives(await documentCsp()).get("style-src")).toContain("'unsafe-inline'");
  });

  it("`'self'`가 남아 있다 — 결정 9는 `K-287`(동일 오리진 우회)을 닫지 않는다", async () => {
    const table = directives(await documentCsp());
    const connect = table.get("connect-src") ?? table.get("default-src") ?? [];
    expect(connect, "동일 오리진 연결이 막혔다 — 결정 9가 정한 범위를 넘는다").toContain("'self'");
  });

  it("와일드카드·외부 호스트를 여는 소스가 하나도 없다", async () => {
    const value = await documentCsp();
    for (const [name, values] of directives(value)) {
      for (const source of values) {
        expect(source, `${name}이 와일드카드를 연다`).not.toBe("*");
        expect(source, `${name}이 외부 스킴을 연다`).not.toMatch(/^https?:/);
      }
    }
  });

  it("문서가 아닌 응답에는 실리지 않는다 — 실물 매니페스트의 문서 아닌 엔트리 전수", async () => {
    // [처분됨 — 2026-08-27 반입] 반입 전에는 매니페스트에 HTML 문서가 0건이라 «키 전부를 돈다»와
    // «문서 아닌 키를 돈다»가 같은 루프였다. 반입이 그 둘을 갈랐다 — 좁히지 않으면 이 축이 문서
    // 라우트까지 붉혀 **결정 9가 요구한 것을 위반으로 읽는다.** 좁히는 것은 모집단이지 판정이
    // 아니다: 물음은 그대로 «문서가 아닌 응답이 이 헤더를 얻는가»다.
    //
    // 판별을 이 파일이 다시 적는다 — 구현의 술어를 부르면 그 술어가 미끄러진 날 이 축도 함께
    // 미끄러지고, 그것이 이 파일이 머리에 적은 «같은 하네스를 공유하지 않는다»의 자리다.
    const routes = Object.entries(ASSET_MANIFEST).filter(
      ([, entry]) => !entry.contentType.toLowerCase().startsWith("text/html"),
    );
    expect(routes.length, "문서 아닌 엔트리가 0건이다 — 이 축의 모집단이 비었다").toBeGreaterThan(
      0,
    );
    for (const [route] of routes) {
      const written = await exchange(ASSET_MANIFEST, "export const x = 1;", {
        method: "GET",
        url: route,
      });
      expect(written.status).toBe(200);
      expect(
        written.headers["content-security-policy"],
        `${route}이 문서 헤더를 얻었다`,
      ).toBeUndefined();
    }
  });

  it("실물 라우트 중 이 헤더를 내는 것이 문서 라우트와 정확히 같다", async () => {
    // [처분됨 — 2026-08-27 반입] 이 자리는 미규정 등급을 달고 있었고, 그것이 든 판정은 "결정 9의
    // 헤더가 오늘 제품 경로에서 한 번도 안 나간다"였다 — 위 축들의 그린이 주입 매니페스트 덕임을
    // 다음 사람이 오독하지 않게 한 자리다. 반입 사이클이 `generated` 문서 하나를 매니페스트에
    // 세워 **그 전제가 사라졌으므로 등급을 뗀다**(`MARKERS.md` §3.2·§4.2 — 닫힌 판정에 열린
    // 마커를 남기지 않는다). 대응하는 정본 미결 항은 없다: 그 마커가 든 것은 문서의 회색지대가
    // 아니라 이 레포 실물의 모집단이었다.
    //
    // 단언은 지우지 않고 뒤집는다. 이제 재는 것이 **어느 라우트가 이 헤더를 내는가**이고, 답이
    // 문서 라우트 집합과 정확히 같아야 한다 — 한쪽으로 어긋나면 문서가 CSP를 잃은 것이고
    // (결정 9 정면 위반), 다른 쪽으로 어긋나면 문서 아닌 응답이 그것을 얻은 것이다.
    const emitted: string[] = [];
    const documents: string[] = [];
    for (const [route, entry] of Object.entries(ASSET_MANIFEST)) {
      if (entry.contentType.toLowerCase().startsWith("text/html")) documents.push(route);
      const written = await exchange(ASSET_MANIFEST, "x", { method: "GET", url: route });
      if (written.headers["content-security-policy"] !== undefined) emitted.push(route);
    }
    expect(
      documents.length,
      "문서 엔트리가 0건이다 — 이 축이 다시 공집합에서 참이 됐다",
    ).toBeGreaterThan(0);
    expect([...emitted].sort()).toEqual([...documents].sort());
  });

  it("루트 `/`가 실물에서 문서를 내고 그 응답이 결정 9의 **값**을 싣는다", async () => {
    // [처분됨 — 2026-08-27 반입] 반입 전에는 루트를 여는 키가 없어 404였고, 이 자리는 그 사실과
    // «그래서 CSP가 걸릴 문서도 없다»를 함께 못박았다. 결정 5의 키 `/`가 서면서 둘 다 뒤집힌다.
    //
    // **값까지 여기서 잰다.** 이 축이 머리에 든 것이 «존재만 재지 않는다»인데, 반입 전에는 값을
    // 재는 자리가 전부 주입 매니페스트였다 — 즉 그 주장이 실물 경로에서는 한 번도 안 섰다.
    const written = await exchange(ASSET_MANIFEST, "<!doctype html>", { method: "GET", url: "/" });
    expect(written.status).toBe(200);
    const header = written.headers["content-security-policy"];
    expect(header, "실물 문서 응답에 CSP가 없다").toBeDefined();
    expect(directives(header ?? "").get("default-src")).toEqual(["'self'"]);
    expect(reopensInlineScript(header ?? "")).toBe(false);
  });

  /* ----------------------------------------------------------------------- *
   * [처분됨 — V-1] 문서 판별이 대소문자를 가려 같은 미디어 타입이 CSP를 잃던 자리
   *
   * 미디어 타입은 대소문자를 안 가리는 것이 HTTP의 규칙이라 `TEXT/HTML; charset=utf-8`로
   * 나간 응답을 브라우저는 그대로 HTML 문서로 판다. 즉 그것은 결정 9가 말하는 HTML 문서
   * 응답이고, 그 자리에 CSP가 실려야 한다. 오늘 판별은 접두 비교를 대소문자 그대로 하므로
   * 그 응답이 **CSP 없이** 나간다.
   *
   * **이것이 결정 9가 겨눈 바로 그 침묵 조합이다.** 그 결정의 근거는 레포 밖 참조 위반이
   * 반입하는 사람의 화면에서는 성공하고 오프라인 머신에서만 깨진다는 것이었는데, 판별이
   * 미끄러지면 CSP 자체가 안 실려 그 위반이 온라인에서도 안 보인다. 그리고 같은 술어를
   * 결정 8의 전수 대조가 함께 쓰므로, **매니페스트의 대소문자 오타 하나가 두 계약을 동시에
   * 조용히 무력화한다.**
   *
   * 오늘 모집단이 공집합이라(결정 5 — 반입할 화면이 0장) 실현된 위반은 없었다. 아래 두 단정은
   * **문서 편에 서서 실패한 채로 제출됐고**, 같은 날 실행 사이클이 `src/assets.ts`의 술어를
   * 소문자로 내려 처분했다 — 계약이 이미 함축한 것이라 §9.4의 개정 없이 닫혔다. 단정은
   * 그대로이고 바뀐 것은 등급과 이 문단의 시제다.
   * ----------------------------------------------------------------------- */

  it("적합 — `TEXT/HTML`도 HTML 문서다 (처분 뒤)", () => {
    expect(isHtmlDocumentEntry(generatedEntry("index.html", "TEXT/HTML; charset=utf-8"))).toBe(
      true,
    );
  });

  it("적합 — 대소문자만 다른 문서 응답도 CSP를 싣는다 (처분 뒤)", async () => {
    const written = await exchange(
      { "/": generatedEntry("index.html", "TEXT/HTML; charset=utf-8") },
      "<!doctype html>",
      { method: "GET", url: "/" },
    );
    expect(written.status).toBe(200);
    // 응답이 실제로 HTML로 나가는 것을 먼저 못박는다 — 이 줄이 통과해야 위 판정이 성립한다.
    expect(written.headers["content-type"]).toBe("TEXT/HTML; charset=utf-8");
    expect(written.headers["content-security-policy"], "HTML 문서인데 CSP가 없다").toBeDefined();
  });

  it("[미규정] `application/xhtml+xml`은 판별 밖이다 — 오늘 그 경로가 열리지 않는다", () => {
    // `src/assets.ts`가 같은 한계를 자기 주석에 적었고, 오늘 그 경로가 안 열리는 근거는 결정
    // 5다(열리는 `generated` 키가 둘이고 문서는 앞엣것 하나). 위 대소문자 건과 등급을 가르는
    // 것도 그것이다 — 이쪽은 **다른 미디어 타입**이라 결정 9가 요구하는지가 문서에 없다.
    expect(isHtmlDocumentEntry(generatedEntry("index.xhtml", "application/xhtml+xml"))).toBe(false);
  });
});
