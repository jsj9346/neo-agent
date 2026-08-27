/**
 * T-010 — 정적 자산 서빙의 계약 검증. 정본은 `docs/WEB-UI.md` §9·§9.1·§9.2·§9.3이다.
 *
 * **기대값은 구현이 아니라 계약 문서에서만 도출했다.** 구현이 문서와 다르면 이 파일은
 * 문서 편에 선다.
 *
 *   - `WEB-UI.md` §9.1 — *"표에 없으면 404다."*, *"불변 캐시를 두지 않는다."*,
 *                        *"`Content-Type`은 엔트리가 직접 든다."*, 그리고 접두 매칭·
 *                        와일드카드·디렉터리 인덱스·SPA 폴백의 부재와, 요청에서 온 문자열이
 *                        파일 경로에 안 닿는다는 계약
 *   - `WEB-UI.md` §9.2 — `AssetEntry`의 두 갈래와 그 필드, *"자산은 `src/` 밖에 놓는다."*,
 *                        *"해시는 런타임이 재지 않는다."*
 *   - `WEB-UI.md` §9.3 — 갈래마다 디렉터리를 가르는 근거
 *
 * **이 파일이 지지 않는 축과 그 자리.** §9.1의 양방향 집합 동일성(매니페스트 ↔ 실물)과
 * §9.2의 `sha256` 대조, 그리고 `biome.json`이 자산 디렉터리를 제외하는가는 형제
 * `assets.contract.test.ts`가 진다. 여기서 재는 것은 **서빙 경로**다 — 표 조회·응답 헤더·
 * 파일 경로의 출처·갈래 판별이다. 두 자리를 가르는 이유는 모집단이 다르기 때문이다:
 * 그쪽은 디렉터리를 돌고 이쪽은 요청을 돈다.
 *
 * **2026-08-27 — `generated` 엔트리 둘이 섰다**(§9.4 결정 5의 `/`와 `/tokens.css`). 그래서
 * 이 파일의 두 자리가 그 반입으로 뜻이 바뀌었다.
 *
 *   - **`/`가 더 이상 "표에 없는 경로"가 아니다.** 그 키가 표에 명시로 있는 것 자체가 결정 5의
 *     계약이고 — *"§9.1이 디렉터리 인덱스를 두지 않기로 했으므로 루트를 여는 키가 표에
 *     명시로 있어야 하고"* — 그래서 아래 404 모집단에서 그것을 뺐다. 디렉터리 인덱스의
 *     부재는 `/`가 닫혀 있는 것으로 재는 것이 아니라 **`/`는 열리는데 `/index.html`은 404인
 *     비대칭**으로 잰다. 조립하는 구현이라면 둘 다 열린다.
 *   - **CSP 축이 실물 엔트리를 지난다.** 그때까지 그 describe는 주입 픽스처만 써서
 *     "실물 `/`가 CSP를 싣는가"를 되풀이해 재는 기계가 0건이었다. 주입 축은 남는다 —
 *     하위 리소스 쪽 대조가 거기 있고 실물에는 그 갈래의 짝(문서 아닌 `generated`)이 하나뿐이다.
 *
 * **두 층을 따로 잰다.** 타입 층은 `tsc --noEmit`이 판정자이고(`@ts-expect-error` 구역은
 * 실행되지 않는다), 런타임 층은 핸들러가 응답에 쓴 값이 판정자다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이고, 문서를 지목하는 자리는 절 번호와 필드 이름으로 한다.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  ASSET_MANIFEST,
  type AssetEntry,
  type AssetExchange,
  type AssetHandler,
  type AssetResponse,
  AUTHORED_ASSET_ROOT,
  assetFilePath,
  assetRoot,
  createAssetHandler,
  GENERATED_ASSET_ROOT,
  lookupAsset,
  MANIFEST_EXEMPTIONS,
} from "../src/assets.ts";

// ---------------------------------------------------------------------------
// 타입 층 — 판별 유니온이 무의미한 상태를 배제하는가 (§9.2)
// ---------------------------------------------------------------------------

// **런타임 단언이 아니다.** `@ts-expect-error`는 에러가 나지 않으면 컴파일이 실패하므로,
// 이 구역은 실행되지 않아도 매 타입 검사에서 판정된다.
{
  const _authoredCarriesNoProvenance: AssetEntry = {
    origin: "authored",
    file: "protocol.js",
    contentType: "text/javascript; charset=utf-8",
    // @ts-expect-error §9.2 — 재생성 기록 세 필드는 `generated` 갈래에만 걸린다
    sha256: "0".repeat(64),
  };

  const _authoredCarriesNoPrompt: AssetEntry = {
    origin: "authored",
    file: "stream.js",
    contentType: "text/javascript; charset=utf-8",
    // @ts-expect-error §9.2 — 같은 근거. 우리 소스의 출처는 이 레포 자신이다
    prompt: "components/stream/Stream.prompt.md",
  };

  // @ts-expect-error §9.2 — `generated`는 `prompt`·`pulledAt`·`sha256`을 반드시 든다
  const _generatedNeedsProvenance: AssetEntry = {
    origin: "generated",
    file: "app.css",
    contentType: "text/css; charset=utf-8",
  };

  const _originIsClosed: AssetEntry = {
    // @ts-expect-error §9.2 — 갈래는 둘로 닫혔다
    origin: "vendored",
    file: "app.css",
    contentType: "text/css; charset=utf-8",
  };

  void _authoredCarriesNoProvenance;
  void _authoredCarriesNoPrompt;
  void _generatedNeedsProvenance;
  void _originIsClosed;
}

// ---------------------------------------------------------------------------
// 응답 스파이
// ---------------------------------------------------------------------------

type Written = {
  status: number;
  headers: Record<string, string>;
  body: string | Uint8Array;
};

function spyResponse(): { response: AssetResponse; done: Promise<Written> } {
  let seen: Written | undefined;
  let settle: (written: Written) => void = () => {};
  const done = new Promise<Written>((resolve) => {
    settle = resolve;
  });
  const response: AssetResponse = {
    writeHead(status, headers) {
      if (seen !== undefined) throw new Error("응답 머리를 두 번 썼다.");
      seen = { status, headers: { ...headers }, body: "" };
      return undefined;
    },
    end(body) {
      if (seen === undefined) throw new Error("머리 없이 본문을 썼다.");
      seen.body = body;
      settle(seen);
      return undefined;
    },
  };
  return { response, done };
}

/**
 * 요청 하나를 태우고 응답을 돌려준다.
 *
 * 핸들러가 `void`를 돌려주므로(`server.ts`의 라우팅 표면이 그 형태다) 완료를 기다릴
 * 손잡이가 없다. 대신 응답이 실제로 끝나는 자리에서 풀리는 약속을 만들고 그것을 기다린다.
 *
 * **이벤트 루프를 턴 수로 세지 않는다.** 그렇게 짜 뒀다가 2026-08-26에 실측으로 깨졌다 —
 * 디스크 읽기는 스레드풀에서 벽시계 시간을 쓰는데 `setImmediate` 회전은 마이크로초 만에
 * 상한을 태워, 부하가 걸린 전체 실행에서만 붉어지는 흔들리는 검사가 됐다. 상한은 시간으로
 * 두고, 넘기면 통과가 아니라 실패다(`ARCHITECTURE.md` §2.6).
 */
async function exchange(
  handler: AssetHandler,
  request: AssetExchange["request"],
): Promise<Written> {
  const spy = spyResponse();
  handler({ request, response: spy.response });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error("핸들러가 상한 안에 아무 응답도 쓰지 않았다."));
    }, 5000);
  });
  try {
    return await Promise.race([spy.done, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

const noReadErrors = (): AssetHandler =>
  createAssetHandler({
    onReadError: (error) => {
      throw new Error(`읽기 실패가 없어야 하는 자리다 — ${String(error)}`);
    },
  });

// ---------------------------------------------------------------------------

describe("고정 매니페스트 (WEB-UI §9.1·§9.2)", () => {
  test("`generated`가 여는 키가 §9.4 결정 5의 둘이다 — 총 개수는 이 축이 재는 것이 아니다", () => {
    // 넓은 타입으로 읽는다 — `as const`가 갈래를 하나로 좁혀 두어 좁은 타입에서는 이 축이
    // 런타임 값을 재는 것이 아니라 타입 좁힘을 재게 된다.
    const entries: readonly [string, AssetEntry][] = Object.entries(ASSET_MANIFEST);

    // **총 개수를 단언하지 않는다**(2026-08-26 — 이 축이 `toHaveLength(2)`와 갈래 배열을
    // 함께 들고 있었고, §9.4 결정 7의 앵커 상수가 등재되면서 붉었다). 총 개수는 `authored`가
    // 늘 때마다 손으로 따라가야 하는 수다 — 계약 테스트에 그런 수를 남기면 그것 자체가 새
    // 부패 후보가 된다. 자산이 실재하는가는 이 파일이 아니라 형제 `assets.contract.test.ts`의
    // 집합 동일성이 진다.
    //
    // **한때 이 자리가 "`generated` 0건"의 표지였다.** 2026-08-27 반입이 그것을 붉혔고, 지우지
    // 않고 방향을 뒤집었다. 재는 것이 `generated` 쪽 **키 이름**인 근거는 §9.4 결정 5가 그
    // 둘을 이름으로 못박았다는 것이다 — 그 항이 `/index.html`을 거부하며 *"키가 `/index.html`이
    // 아니라 `/`인 것이 계약이다."*라 적고, `src/assets.ts`의 매니페스트 주석도 *"계약인 것은
    // §9.4 결정 5가 못박은 키 이름"*이라 적으며 그것을 계약 테스트가 잰다고 말한다. 이 축이
    // 그 문장을 참으로 만드는 자리다. 셋째가 생기는 날 붉는 것이 옳다 — 그때 열리는 것은 이
    // 수가 아니라 결정 5이고, 같은 사실을 §12도 규격으로 든다.
    expect(entries.length, "매니페스트가 비었다 — 아래 축이 공허하다").toBeGreaterThan(0);
    expect(
      entries
        .filter(([, entry]) => entry.origin === "generated")
        .map(([route]) => route)
        .sort(),
      "`generated`가 여는 키가 결정 5의 둘이 아니다",
    ).toEqual(["/", "/tokens.css"]);
  });

  test("키가 `/`로 시작하는 완전한 경로 문자열이다", () => {
    for (const route of Object.keys(ASSET_MANIFEST)) {
      expect(route.startsWith("/"), `${route}이 절대 경로가 아니다`).toBe(true);
    }
  });

  test("`file`이 디렉터리 바로 아래의 파일명이다 — 하위 디렉터리를 두지 않는다", () => {
    for (const entry of Object.values(ASSET_MANIFEST)) {
      expect(entry.file).not.toContain("/");
      expect(entry.file).not.toBe("..");
    }
  });

  test("`Content-Type`을 엔트리가 직접 든다 — 확장자에서 유추하지 않는다", () => {
    for (const entry of Object.values(ASSET_MANIFEST)) {
      expect(entry.contentType.length).toBeGreaterThan(0);
    }
  });

  test("`.gitkeep`은 자산이 아니므로 등재되지 않고, 제외를 코드가 명시한다", () => {
    // §9.1의 실물 → 매니페스트 축이 이 파일을 위반으로 읽지 않게 하는 자리다. 그 축 자체는
    // 형제 `assets.contract.test.ts`가 재고, 여기서는 제외 선언이 실재하는지만 잰다.
    // **갈래와 함께 잰다** — §9.2가 2026-08-27에 제외의 단위를 갈래와 파일명의 짝으로 닫았고,
    // 이름만 재면 그 짝이 풀려도 이 단언이 조용히 통과한다.
    expect(MANIFEST_EXEMPTIONS).toContainEqual({ origin: "generated", file: ".gitkeep" });
    for (const entry of Object.values(ASSET_MANIFEST)) {
      expect(entry.file).not.toBe(".gitkeep");
    }
  });
});

describe("갈래가 정하는 상수 루트 (WEB-UI §9.1·§9.2·§9.3)", () => {
  test("루트가 갈래마다 다르고 둘 다 `src/` 밖이다", () => {
    expect(assetRoot("generated")).toBe(GENERATED_ASSET_ROOT);
    expect(assetRoot("authored")).toBe(AUTHORED_ASSET_ROOT);
    expect(GENERATED_ASSET_ROOT).not.toBe(AUTHORED_ASSET_ROOT);
    for (const root of [GENERATED_ASSET_ROOT, AUTHORED_ASSET_ROOT]) {
      expect(root.includes(`${"src"}/`), `${root}이 src 안이다`).toBe(false);
    }
  });

  test("루트가 이 패키지의 `assets/`·`client/`다", () => {
    const packageRoot = fileURLToPath(new URL("../", import.meta.url));
    expect(GENERATED_ASSET_ROOT).toBe(join(packageRoot, "assets/"));
    expect(AUTHORED_ASSET_ROOT).toBe(join(packageRoot, "client/"));
  });

  test("파일 경로가 루트와 엔트리의 `file` 둘로만 이뤄진다", () => {
    for (const entry of Object.values(ASSET_MANIFEST)) {
      expect(assetFilePath(entry)).toBe(join(assetRoot(entry.origin), entry.file));
    }
  });

  test("표본 `generated` 엔트리는 반입 자산 루트를 가리킨다", () => {
    // **표본을 남기는 이유가 2026-08-27 반입으로 바뀌었다.** 그때까지는 실물이 0건이라 표본
    // 말고 잴 것이 없었다. 이제 실물 둘을 위 「파일 경로가 루트와 엔트리의 `file` 둘로만
    // 이뤄진다」가 매니페스트 전수로 돌므로, 여기 표본이 지는 것은 **표에 없는 파일명**에서도
    // 같은 규칙이 서는가다 — 그 축이 표의 오늘 내용에 기대어 통과하는 것이 아님을 보인다.
    const sample: AssetEntry = {
      origin: "generated",
      file: "app.css",
      contentType: "text/css; charset=utf-8",
      prompt: "ui_kits/console/console.prompt.md",
      pulledAt: "2026-08-25",
      sha256: "0".repeat(64),
    };
    expect(assetFilePath(sample)).toBe(join(GENERATED_ASSET_ROOT, "app.css"));
  });
});

describe("표에 없으면 404다 (WEB-UI §9.1)", () => {
  // **`/`가 이 목록에서 빠진 것이 2026-08-27 반입의 결과다.** 그때까지 그 경로는 표에 없어
  // 404였고 이 목록이 그것을 쟀다. §9.4 결정 5가 그 키를 열었으므로 이제 `/`는 "표에 없는
  // 경로"가 아니다 — 여기 남겨 두면 이 축이 재는 것이 "표에 없으면 닫힌다"에서 "루트는
  // 닫혀 있다"로 조용히 바뀌고, 뒤엣것은 정본이 든 계약의 반대다.
  //
  // **디렉터리 인덱스의 부재는 아래 비대칭이 대신 잰다** — `/`는 열리는데 `/index.html`은
  // 404다. URL에서 파일 경로를 조립하는 구현이라면 둘 다 열리므로, 그 짝이 이 목록에
  // 남아 있는 `/index.html` 하나로 성립한다.
  const misses = [
    "/index.html",
    "/client/",
    "/client",
    "/client/protocol.js/",
    "/client/protocol.js.map",
    "/CLIENT/protocol.js",
    "/client/protocol%2Ejs",
    "/../../etc/passwd",
    "/client/../../../etc/passwd",
    "/client/..%2f..%2fetc%2fpasswd",
    "/proto__/protocol.js",
    "/constructor",
    "/toString",
  ];

  for (const path of misses) {
    test(`404 — ${path}`, async () => {
      const written = await exchange(noReadErrors(), { method: "GET", url: path });
      expect(written.status).toBe(404);
    });
  }

  test("traversal이 표를 통과해 파일을 열지 못한다", async () => {
    // 이 축이 재는 것은 검사가 아니라 도달 불가다. 요청 문자열이 파일 경로에 안 닿으므로
    // 읽기 자체가 시도되지 않아야 한다 — 시도되면 아래 리더가 그 사실을 든다.
    const attempted: string[] = [];
    const handler = createAssetHandler({
      readAsset: (path) => {
        attempted.push(path);
        return Promise.resolve(new Uint8Array());
      },
      onReadError: () => {
        throw new Error("읽기 실패가 없어야 하는 자리다.");
      },
    });
    for (const path of misses) {
      await exchange(handler, { method: "GET", url: path });
    }
    expect(attempted).toEqual([]);
  });

  test("접두가 맞아도 열리지 않는다 — 접두 매칭이 없다", async () => {
    const written = await exchange(noReadErrors(), {
      method: "GET",
      url: "/client/protocol.js/extra",
    });
    expect(written.status).toBe(404);
  });

  test("디렉터리 인덱스도 SPA 폴백도 없다", async () => {
    // `/client/`는 실물 디렉터리이고 그 안에 등재된 파일이 여럿이다 — 인덱스를 두는 구현이면
    // 여기서 무언가가 나온다. `/app`은 SPA 폴백의 자리다.
    for (const path of ["/client/", "/app"]) {
      const written = await exchange(noReadErrors(), { method: "GET", url: path });
      expect(written.status, `${path}이 폴백을 얻었다`).toBe(404);
    }
  });

  test("`/`가 열리는 것은 표의 키여서이지 인덱스여서가 아니다 — `/index.html`이 404다", async () => {
    // §9.4 결정 5의 비대칭이다. 조립하거나 인덱스를 두는 구현이라면 `/`와 `/index.html`이
    // 같은 파일을 열어 **둘 다** 200이 된다. 여기서는 앞엣것만 열리고 뒤엣것은 표에 없어
    // 닫히므로, 그 차이가 «경로를 조립하지 않는다»의 관측 가능한 형태다. 같은 항이 키 둘이
    // 한 파일을 여는 것도 함께 거부한다 — *"둘 다 두지 않는다"*.
    const root = await exchange(noReadErrors(), { method: "GET", url: "/" });
    const explicit = await exchange(noReadErrors(), { method: "GET", url: "/index.html" });
    expect(root.status, "결정 5가 연 루트 키가 안 열린다").toBe(200);
    expect(explicit.status, "한 파일을 키 둘이 연다").toBe(404);
  });

  test("쿼리 문자열은 키에 안 섞이고 조각도 아니다", async () => {
    const written = await exchange(noReadErrors(), {
      method: "GET",
      url: "/client/protocol.js?v=1",
    });
    expect(written.status).toBe(200);
  });

  test("표 조회가 상속 속성을 라우트로 읽지 않는다", () => {
    expect(lookupAsset("constructor")).toBeUndefined();
    expect(lookupAsset("__proto__")).toBeUndefined();
    expect(lookupAsset("/client/protocol.js")).toBe(ASSET_MANIFEST["/client/protocol.js"]);
  });
});

describe("서빙 (WEB-UI §9.1)", () => {
  test("등재된 자산이 실물 그대로 나간다", async () => {
    const written = await exchange(noReadErrors(), { method: "GET", url: "/client/protocol.js" });
    expect(written.status).toBe(200);
    const onDisk = readFileSync(join(AUTHORED_ASSET_ROOT, "protocol.js"));
    expect(Buffer.from(written.body as Uint8Array).equals(onDisk)).toBe(true);
  });

  test("`Content-Type`이 엔트리의 값 그대로다", async () => {
    const written = await exchange(noReadErrors(), { method: "GET", url: "/client/stream.js" });
    expect(written.headers["content-type"]).toBe(ASSET_MANIFEST["/client/stream.js"].contentType);
  });

  test("불변 캐시를 두지 않는다 — `immutable`도 `max-age`도 없다", async () => {
    for (const path of ["/client/protocol.js", "/client/stream.js"]) {
      const written = await exchange(noReadErrors(), { method: "GET", url: path });
      const rendered = Object.entries(written.headers)
        .map(([name, value]) => `${name}: ${value}`)
        .join("\n");
      expect(rendered).not.toContain("immutable");
      expect(rendered).not.toContain("max-age");
    }
  });

  test("자산은 GET으로만 받는다", async () => {
    for (const method of ["POST", "PUT", "DELETE", "HEAD", undefined]) {
      const written = await exchange(noReadErrors(), { method, url: "/client/protocol.js" });
      expect(written.status, `${String(method)}이 자산을 얻었다`).toBe(405);
    }
  });

  test("표에 없는 경로는 메서드와 무관하게 404다", async () => {
    const written = await exchange(noReadErrors(), { method: "POST", url: "/nope.js" });
    expect(written.status).toBe(404);
  });
});

describe("HTML 문서 응답의 CSP (WEB-UI §9.4 결정 9)", () => {
  // **주입 매니페스트가 이 축의 수단이다 — 그러나 판정의 전부는 아니다.** 2026-08-27 이전에는
  // 이 갈래를 타는 실물 엔트리가 없어 주입이 전부였고, 그래서 "실물 `/`가 CSP를 싣는가"를
  // 되풀이해 재는 기계가 0건이었다. 반입이 그 엔트리를 만들었으므로 아래에 **실물 축**을
  // 함께 둔다. 주입 축은 남는다 — 하위 리소스 쪽 대조(문서 아닌 `generated`)와 실패 응답
  // 갈래가 거기 있고, 그것을 실물로 재려면 매니페스트에 없는 엔트리가 필요하다.
  //
  // **문서 응답과 하위 리소스 응답을 둘 다 재는 것이 이 절의 요구다** — 넓게 실으면 재는
  // 것보다 넓게 주장하게 된다(§2.3).
  const DOCUMENT: AssetEntry = {
    origin: "generated",
    file: "index.html",
    contentType: "text/html; charset=utf-8",
    prompt: "ui_kits/console/console.prompt.md",
    pulledAt: "2026-08-26",
    sha256: "0".repeat(64),
  };

  const withDocument = (): AssetHandler =>
    createAssetHandler({
      manifest: { "/": DOCUMENT },
      readAsset: () => Promise.resolve(new TextEncoder().encode("<!doctype html>")),
      onReadError: () => {
        throw new Error("읽기 실패가 없어야 하는 자리다.");
      },
    });

  /** `name value…; name value…` 꼴을 지시어 표로 가른다 */
  const directivesOf = (value: string): Map<string, readonly string[]> => {
    const table = new Map<string, readonly string[]>();
    for (const part of value.split(";")) {
      const tokens = part
        .trim()
        .split(/\s+/)
        .filter((token) => token.length > 0);
      const [name, ...rest] = tokens;
      if (name !== undefined) table.set(name.toLowerCase(), rest);
    }
    return table;
  };

  const cspOfDocument = async (): Promise<string> => {
    const written = await exchange(withDocument(), { method: "GET", url: "/" });
    expect(written.status).toBe(200);
    const header = written.headers["content-security-policy"];
    expect(header, "HTML 문서 응답에 CSP가 없다").toBeDefined();
    return header ?? "";
  };

  test("HTML 문서 응답이 CSP를 싣는다", async () => {
    await cspOfDocument();
  });

  test("값이 `default-src 'self'`를 든다", async () => {
    // 이름만 재면 `default-src *`도 전 축 그린이다. 결정 9가 계약으로 든 것은 이 값이다.
    expect(directivesOf(await cspOfDocument()).get("default-src")).toEqual(["'self'"]);
  });

  test("인라인 스크립트를 다시 여는 지시어가 없다", async () => {
    // 결정 9의 첫 하위 항 — *"인라인 스크립트가 함께 막히는 것은 부수가 아니라 값이다."*
    // `script-src`가 아예 없으면 `default-src`를 물려받고, 있으면 그 값이 인라인을 다시 열지
    // 않아야 한다. 스타일은 명시로 허용된 예외이므로 모집단에서 뺀다.
    const table = directivesOf(await cspOfDocument());
    const script = table.get("script-src") ?? table.get("default-src") ?? [];
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
    for (const [name, values] of table) {
      if (name === "style-src") continue;
      expect(values, `${name}이 인라인을 다시 연다`).not.toContain("'unsafe-inline'");
    }
  });

  test("인라인 스타일은 허용된다 — 겸사겸사 막지 않는다", async () => {
    // 결정 9의 둘째 하위 항. `ui_kits/cli/`가 실증한 무빌드 형태가 화면별 CSS를 인라인
    // `<style>`로 들므로, 이것을 막으면 이 절이 킷의 형태를 필요 이상으로 좁힌다.
    expect(directivesOf(await cspOfDocument()).get("style-src")).toContain("'unsafe-inline'");
  });

  // -------------------------------------------------------------------------
  // 실물 축 — 반입된 화면이 실제로 이 갈래를 탄다 (2026-08-27)
  // -------------------------------------------------------------------------

  /** 실물 매니페스트의 `/`를 디스크에서 태워 CSP 헤더를 꺼낸다 */
  const cspOfRealScreen = async (): Promise<string> => {
    const written = await exchange(noReadErrors(), { method: "GET", url: "/" });
    expect(written.status, "반입된 화면이 200으로 안 나간다").toBe(200);
    const header = written.headers["content-security-policy"];
    expect(header, "실물 화면 응답에 CSP가 없다").toBeDefined();
    return header ?? "";
  };

  test("실물 `/`가 CSP를 싣고 값이 `default-src 'self'`를 든다", async () => {
    // **이 축이 없으면 결정 9는 주입 픽스처에서만 참이다.** 그 상태에서 실물 화면이 헤더를
    // 못 받는 회귀는 전 축 그린으로 통과하고, 위반은 사용자의 오프라인 머신에서만 드러난다 —
    // 결정 9가 겨눈 것이 정확히 그 지연된 침묵이다(`ARCHITECTURE.md` §2.6).
    //
    // **이 축이 도는 표가 주입이 아니라 실물이라는 것을 함께 든다.** `noReadErrors()`는
    // 매니페스트를 안 넘겨 `createAssetHandler`의 기본값을 타므로 여기 도는 것이
    // `ASSET_MANIFEST`이고, 그 표의 `/`가 §9.4 결정 5의 화면 엔트리다. 이 단언이 없으면
    // 아래 축이 언제 다시 주입으로 미끄러졌는지 읽는 사람이 알 수 없다.
    expect(ASSET_MANIFEST["/"].origin, "실물 `/`가 화면 엔트리가 아니다").toBe("generated");
    expect(directivesOf(await cspOfRealScreen()).get("default-src")).toEqual(["'self'"]);
  });

  test("실물 화면의 값이 주입 픽스처의 값과 같다 — 두 축이 따로 낡지 않는다", async () => {
    // 값의 리터럴을 이 파일이 다시 적지 않는다. 적으면 `src/assets.ts`의 상수와 이 파일이
    // 값의 정본을 둘로 나눠 갖게 되고, 그것이 이 레포가 되풀이해 이름 붙인 형태다. 대신 두
    // 모집단이 같은 문자열을 받는 것을 재면, 위 주입 축이 든 판정 넷(`default-src`의 값 ·
    // 인라인 스크립트 · 인라인 스타일 · 지시어 전수)이 실물 화면으로 그대로 옮겨 온다.
    expect(await cspOfRealScreen()).toBe(await cspOfDocument());
  });

  test("실물 하위 리소스에는 없다 — `generated` `/tokens.css`", async () => {
    // 위 주입 축의 실물 판이다. 화면과 같은 갈래(`generated`)이면서 문서가 아닌 엔트리가
    // 매니페스트에 실재하므로, 갈래가 아니라 **미디어 타입**이 헤더를 가르는 것이 여기서
    // 실물로 선다.
    const written = await exchange(noReadErrors(), { method: "GET", url: "/tokens.css" });
    expect(written.status).toBe(200);
    expect(
      written.headers["content-security-policy"],
      "`/tokens.css`가 문서 헤더를 얻었다",
    ).toBeUndefined();
  });

  test("문서가 아닌 응답에는 없다 — `authored` `.js`", async () => {
    for (const path of ["/client/protocol.js", "/client/anchors.js"]) {
      const written = await exchange(noReadErrors(), { method: "GET", url: path });
      expect(written.status).toBe(200);
      expect(
        written.headers["content-security-policy"],
        `${path}이 문서 헤더를 얻었다`,
      ).toBeUndefined();
    }
  });

  test("문서가 아닌 응답에는 없다 — `generated` 하위 리소스", async () => {
    const handler = createAssetHandler({
      manifest: {
        "/tokens.css": {
          origin: "generated",
          file: "tokens.css",
          contentType: "text/css; charset=utf-8",
          prompt: "ui_kits/console/console.prompt.md",
          pulledAt: "2026-08-26",
          sha256: "0".repeat(64),
        },
      },
      readAsset: () => Promise.resolve(new TextEncoder().encode(":root{}")),
      onReadError: () => {
        throw new Error("읽기 실패가 없어야 하는 자리다.");
      },
    });
    const written = await exchange(handler, { method: "GET", url: "/tokens.css" });
    expect(written.status).toBe(200);
    expect(written.headers["content-security-policy"]).toBeUndefined();
  });

  test("404·405·500에는 실리지 않는다 — 문서를 낸 응답이 아니다", async () => {
    const broken = createAssetHandler({
      manifest: { "/": DOCUMENT },
      readAsset: () => Promise.reject(new Error("ENOENT")),
      onReadError: () => {},
    });
    const miss = await exchange(noReadErrors(), { method: "GET", url: "/nope" });
    const wrongMethod = await exchange(withDocument(), { method: "POST", url: "/" });
    const failed = await exchange(broken, { method: "GET", url: "/" });
    expect(miss.status).toBe(404);
    expect(wrongMethod.status).toBe(405);
    expect(failed.status).toBe(500);
    for (const written of [miss, wrongMethod, failed]) {
      expect(written.headers["content-security-policy"]).toBeUndefined();
    }
  });
});

describe("읽기 실패는 조용하지 않다 (ARCHITECTURE §2.6)", () => {
  test("매니페스트가 든 파일을 못 읽으면 500이고 사유가 밖으로 나간다", async () => {
    const seen: unknown[] = [];
    const handler = createAssetHandler({
      readAsset: () => Promise.reject(new Error("ENOENT")),
      onReadError: (error) => {
        seen.push(error);
      },
    });
    const written = await exchange(handler, { method: "GET", url: "/client/protocol.js" });
    expect(written.status).toBe(500);
    expect(seen).toHaveLength(1);
  });

  test("읽기 실패가 404로 접히지 않는다 — 배치 깨짐과 미등록이 구분된다", async () => {
    const handler = createAssetHandler({
      readAsset: () => Promise.reject(new Error("EACCES")),
      onReadError: () => {},
    });
    const broken = await exchange(handler, { method: "GET", url: "/client/protocol.js" });
    const missing = await exchange(handler, { method: "GET", url: "/client/absent.js" });
    expect(broken.status).toBe(500);
    expect(missing.status).toBe(404);
  });
});

describe("해시는 런타임이 재지 않는다 (WEB-UI §9.2)", () => {
  test("서빙 모듈이 `node:crypto`를 들지 않는다", () => {
    // §9.2가 재는 자리를 `packages/serve/test/`로 두었고, §2.2의 허용 내장 넷에
    // `node:crypto`가 없는 것과 그 사실이 맞물린다. 실제 해시 대조는 형제 파일이 진다.
    const source = readFileSync(
      fileURLToPath(new URL("../src/assets.ts", import.meta.url)),
      "utf8",
    );
    expect(source).not.toContain(`${"node"}:crypto`);
    expect(source).not.toContain("createHash");
  });

  test("자산 하나를 서빙해도 엔트리의 해시 필드를 읽지 않는다", async () => {
    // `generated` 표본을 매니페스트로 넣고, 그 엔트리의 `sha256` 접근을 게터로 감시한다.
    let touched = 0;
    const entry = {
      origin: "generated" as const,
      file: "app.css",
      contentType: "text/css; charset=utf-8",
      prompt: "ui_kits/console/console.prompt.md",
      pulledAt: "2026-08-25",
      get sha256(): string {
        touched += 1;
        return "0".repeat(64);
      },
    };
    const handler = createAssetHandler({
      manifest: { "/app.css": entry },
      readAsset: () => Promise.resolve(new Uint8Array([1, 2, 3])),
      onReadError: () => {
        throw new Error("읽기 실패가 없어야 하는 자리다.");
      },
    });
    const written = await exchange(handler, { method: "GET", url: "/app.css" });
    expect(written.status).toBe(200);
    expect(touched).toBe(0);
  });
});
