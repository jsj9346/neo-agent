/**
 * 독립 QA — 2026-08-27 자산 매니페스트·서빙 재검증.
 *
 * **검증 대상 셋** — `packages/serve/src/assets.ts` ·
 * `packages/serve/test/assets.contract.test.ts` · `packages/serve/test/assets.serving.contract.test.ts`.
 *
 * **정본** — `docs/WEB-UI.md` §9.1 · §9.2(자산의 정의 · 제외 목록 · `contentType` 정규형) ·
 * §9.5(결정 1 · 결정 2 · 결정 4). 기대값은 그 절들에서만 도출했다. 구현이 문서와 다른 자리는
 * **기대값을 구현에 맞춰 통과시킨 것이 아니라** 판정을 마커로 세우고 단정은 오늘의 결함
 * 동작을 못박는다(`MARKERS.md` §4.2 — 처분되는 날 그 단정이 붉어 마커를 함께 걷게 한다).
 * 그 전환의 근거는 축 1의 머리 주석이 든다.
 *
 * **이 파일은 계약 테스트가 아니라 QA 산출물이다.** §9.4 결정 13이 *"텍스트 스캔을 계약으로
 * 올리지 않는다"*로 그 경계를 그었고, 아래 축 6·7이 정확히 그 부류의 스캔이다 — 한계를 각
 * 축의 주석이 든다. 판정 목록과 재현 방법은 `plans/20260827-webui92-qa.md`가 든다.
 *
 * **형제 산출물과 겹치지 않게 고른 축이다.** `qa-20260827-asset-import.independent.test.ts`가
 * §9.4 결정 4·5·8·9·12와 §9.5 결정 1·5·6·7을 이미 돈다. 여기 있는 것은 **그 어느 파일도 안
 * 재는 자리**다:
 *
 *   - 축 1 — 파싱 불가능한 요청 타깃에서 «표에 없으면 404다»가 서는가
 *            (**계약 위반 V-1** — 단정은 오늘의 결함 동작을 못박아 그린이고, 판정은 마커가 든다)
 *   - 축 2 — 점 세그먼트·프로토콜 상대 표기가 표 밖에서 표 안으로 접히는 것 ([미규정] 관측)
 *   - 축 3 — §9.2의 `contentType` 정규형을 **런타임이** 잰다 (오늘 타입 하나에만 산다)
 *   - 축 4 — 제외 목록이 정본이 이름으로 든 두 쌍 그대로인가 · 자산 종류를 제외로 빼지 않는가
 *   - 축 5 — 엔트리의 필드 집합이 §9.2의 것 정확히 그대로인가 (§9.5 결정 4의 «필드» 절반)
 *   - 축 6 — 매니페스트 키의 사본이 코드 어디에도 없는가 (§9.5 결정 2 ②)
 *   - 축 7 — `packages/serve`에 요청 문자열을 경로 조립에 넘기는 코드가 없는가 (§9.1)
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로 있는
 * 부분 문자열이고, 문서를 지목하는 자리는 절 번호와 결정 번호로 한다. 이 파일이 스스로 지은
 * 문장은 겹화살괄호가 아니라 홑낫표(`「…」`)로 감싼다 — 두 표기를 섞으면 다음이 이 파일의
 * 겹화살괄호를 전부 정본 대조 대상으로 읽는다.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  ASSET_MANIFEST,
  type AssetEntry,
  type AssetManifest,
  type AssetResponse,
  assetRoot,
  createAssetHandler,
  isExemptFile,
  MANIFEST_EXEMPTIONS,
  type ManifestExemption,
} from "../src/assets.ts";

const manifestEntries = Object.values(ASSET_MANIFEST) as readonly AssetEntry[];
const manifestRoutes = Object.keys(ASSET_MANIFEST);

// ---------------------------------------------------------------------------
// 동기 스파이 — 404·405는 핸들러가 **동기로** 쓴다
// ---------------------------------------------------------------------------

/**
 * 형제 계약 테스트의 스파이는 약속을 기다린다. 여기서는 **던지는 갈래**를 재야 하므로
 * 동기로 본다 — 던지면 약속이 영원히 안 풀려 `await`가 상한까지 매달리고, 그 상한 실패는
 * "무엇이 일어났나"를 안 말한다.
 */
function syncSpy(): { response: AssetResponse; seen: () => number | undefined } {
  let status: number | undefined;
  return {
    response: {
      writeHead(code) {
        status = code;
        return undefined;
      },
      end() {
        return undefined;
      },
    },
    seen: () => status,
  };
}

const handler = createAssetHandler({
  onReadError: () => {
    /* 이 축들은 읽기까지 가지 않는다 */
  },
});

/** 요청 하나를 동기로 태운다. 던지면 그 예외를 결과로 든다 */
function probe(url: string | undefined): {
  status: number | undefined;
  thrown?: unknown;
} {
  const spy = syncSpy();
  try {
    handler({ request: { method: "GET", url }, response: spy.response });
  } catch (error) {
    return { status: spy.seen(), thrown: error };
  }
  return { status: spy.seen() };
}

/**
 * 200 갈래는 디스크 읽기를 지나므로 동기 스파이가 못 본다. 그 갈래만 기다린다 — **상한을
 * 시간으로 둔다.** 형제 계약 테스트가 2026-08-26에 이벤트 루프 턴 수로 재다 깨진 자리이고,
 * 넘기면 통과가 아니라 실패다(`ARCHITECTURE.md` §2.6).
 */
function probeSettled(url: string | undefined): Promise<number | undefined> {
  const spy = syncSpy();
  handler({ request: { method: "GET", url }, response: spy.response });
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const poll = (): void => {
      const status = spy.seen();
      if (status !== undefined) resolve(status);
      else if (Date.now() > deadline) reject(new Error("핸들러가 상한 안에 아무 응답도 안 썼다."));
      else setTimeout(poll, 5);
    };
    poll();
  });
}

// ---------------------------------------------------------------------------
// 축 0 — 아래 축들이 공집합에서 참이 되지 않는다
// ---------------------------------------------------------------------------

describe("축 0 — 모집단", () => {
  test("매니페스트와 제외 목록이 둘 다 비어 있지 않다", () => {
    expect(manifestEntries.length, "표가 비었다 — 아래 전 축이 공허하다").toBeGreaterThan(0);
    expect(MANIFEST_EXEMPTIONS.length, "제외 목록이 비었다").toBeGreaterThan(0);
  });

  test("동기 스파이가 실제로 상태를 잡는다 — 스파이의 눈멀음이 아니다", () => {
    // 이 축이 없으면 아래 `status === undefined`가 "핸들러가 안 썼다"인지 "스파이가 못
    // 봤다"인지 안 갈린다.
    expect(probe("/nope.js").status, "평범한 미스에서도 상태를 못 잡는다").toBe(404);
    expect(probe("/nope.js").thrown).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 축 1 — §9.1 «표에 없으면 404다»가 파싱 불가능한 요청 타깃에서 서는가
// ---------------------------------------------------------------------------

/**
 * §9.1이 *"표에 없으면 404다."*로 열고, 그 전건에 예외를 두지 않는다 — 키의 집합이 표이고
 * 그 밖은 전부 닫힌다. 표 조회의 입력은 `new URL(request.url ?? "/", …).pathname`인데
 * **그 파싱이 던지는 요청 타깃이 있다.**
 *
 * 아래 셋은 전부 Node의 HTTP 파서를 통과해 `request.url`로 그대로 실린다(실측 — 원시 소켓에
 * `GET // HTTP/1.1`을 쓰면 리스너가 `"//"`를 본다). 즉 밖에서 오는 값이고, 표에 없으므로
 * §9.1이 요구하는 답은 404다. 오늘의 답은 **응답 없음 + 예외**다.
 *
 * **부류는 침묵 실패다**(`ARCHITECTURE.md` §2.6). 클라이언트는 상태줄을 못 받고, 프로세스
 * 쪽에서는 `onReadError`가 아니라 요청 리스너의 예외로 나간다 — §9.1이 읽기 실패에 대해 세운
 * 500 경로(*"조용히 404로 접지 않는다"*)조차 안 지난다.
 *
 * **`server.ts`가 같은 파싱을 먼저 한다는 것이 이 판정을 안 무른다.** 그쪽(`src/server.ts`의
 * 라우팅)이 먼저 던지므로 실물의 증상은 요청 리스너 예외이지만, `createAssetHandler`는
 * 패키지 배럴이 export하는 표면(`src/index.ts:24`)이고 §9.1은 그 표면의 계약이다. 원인 쪽이
 * 어디든 문서가 든 답이 안 나오면 위반이다. **처분 자리가 둘인 것은 보드의 `K-327`이 든다** —
 * 같은 파싱 자리, 같은 `try` 공백이다.
 *
 * ## 아래 단정들은 계약을 재지 않는다 — **오늘의 동작을 못박는다**
 *
 * 판정은 `[계약 위반 — V-1]` 마커와 `plans/20260827-webui92-qa.md`가 들고, 단정은 결함 있는
 * 오늘의 값을 그대로 고정한다. 그래서 그 결함이 처분되는 날 **이 단정이 붉고**, 처분자가
 * 마커를 함께 걷게 된다(`MARKERS.md` §4.2 — 판정이 내려지면 셋을 한 커밋에).
 *
 * 계약 기대값(404)을 단정으로 두는 갈래를 안 고른 이유는 그것이 처분 전까지 항상 red라서다 —
 * red가 상주하면 그 파일의 red가 신호이기를 그만두고, 그때 새로 난 red가 묻힌다. **각 단정에
 * 대비쌍을 함께 둔다** — 없으면 못박은 값이 술어가 통째로 눈먼 상태와 구별되지 않는다.
 */
const UNPARSEABLE_TARGETS = ["//", "///", "/\\"];

describe("축 1 — 표에 없으면 404다 (§9.1) · 파싱 불가능한 요청 타깃", () => {
  /**
   * [계약 위반 — V-1] 표 조회 앞의 URL 파싱이 감싸여 있지 않아, 파싱이 던지는 요청 타깃에서
   * 핸들러가 **응답을 하나도 안 쓰고 예외로 나간다.**
   *
   * - **계약대로면**: 아래 `thrown`이 전건 `undefined`이고 `status`가 전건 `404`여야 한다.
   *   §9.1이 *"표에 없으면 404다."*라 적고 그 전건에 예외를 두지 않는다 — `//`·`///`·`/\`는
   *   표의 키가 아니므로 답이 404다.
   * - **오늘은**: 셋 다 `TypeError`(`ERR_INVALID_URL`)이고 상태는 `undefined`다.
   *   자리는 `packages/serve/src/assets.ts:570`이고 `try`가 없다.
   * - **왜 조용한가**: 404도 500도 아니라 **응답 자체가 없다.** `onReadError`도 안 지나므로
   *   프로세스 쪽 신호도 이 파일이 세운 경로로는 안 나온다.
   * - **아래 단정은 계약을 재지 않는다 — 오늘의 동작을 못박는다.** 처분되면 이 단정이 붉고,
   *   그때 처분자가 이 마커를 함께 걷는다. 처분 자리: 보드 `K-327`.
   * - 판정: `plans/20260827-webui92-qa.md` V-1
   */
  test("[계약 위반 — V-1] 오늘의 동작 — 파싱이 던지는 타깃에서 응답이 0건이다", () => {
    const observed = UNPARSEABLE_TARGETS.map((target) => {
      const result = probe(target);
      return {
        target,
        status: result.status,
        code: (result.thrown as { code?: string } | undefined)?.code,
      };
    });
    expect(
      observed,
      "V-1이 처분됐다면 이 목록이 전건 `status: 404`가 되고 마커를 걷을 때다",
    ).toEqual([
      { target: "//", status: undefined, code: "ERR_INVALID_URL" },
      { target: "///", status: undefined, code: "ERR_INVALID_URL" },
      { target: "/\\", status: undefined, code: "ERR_INVALID_URL" },
    ]);
  });

  test("[계약 위반 — V-1] 대비쌍 — 평범한 표 밖 경로는 404가 실제로 나온다", () => {
    // 없으면 위 `status: undefined`가 「핸들러가 404를 아예 안 낸다」는 상태와 구별되지 않는다.
    // 즉 위에서 못박은 것이 술어의 통째 눈멀음이 아니라 **파싱 갈래 하나**임을 이 쌍이 든다.
    for (const target of ["/etc/passwd", "/../../etc/passwd", "/nope.js"]) {
      const result = probe(target);
      expect(result.thrown, `${target}이 던졌다 — V-1의 외연이 더 넓다`).toBeUndefined();
      expect(result.status, `${target}이 404를 안 받았다`).toBe(404);
    }
    // 표의 키는 던지지 않고 열린다(200은 비동기라 여기서 안 잰다 — 축 2가 든다).
    expect(probe("/client/protocol.js").thrown).toBeUndefined();
  });

  test("[계약 위반 — V-1] 던지는 입력이 실제로 Node의 요청 타깃 문법 안에 있다", () => {
    // 이 축이 「있을 수 없는 입력」을 재는 것이 아님을 든다. 파싱이 던지는 것 자체를 핸들러
    // 밖에서, 같은 인자로 재현한다. 이 셋이 원시 소켓을 통과하는 것은 실측으로 확인했고
    // (`GET // HTTP/1.1` → 리스너가 `"//"`를 본다) 그 사실은 판정 리포트가 든다.
    for (const target of UNPARSEABLE_TARGETS) {
      expect(
        () => new URL(target, "http://127.0.0.1"),
        `${JSON.stringify(target)}이 안 던진다 — 위 축의 전제가 낡았다`,
      ).toThrow();
    }
    // 대비쌍 — 같은 기준 오리진에서 평범한 경로는 안 던진다.
    expect(() => new URL("/etc/passwd", "http://127.0.0.1")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 축 2 — [미규정] 표기 정규화가 표 밖을 표 안으로 접는다
// ---------------------------------------------------------------------------

describe("축 2 — [미규정] 오늘 실물 관측 · 표기 정규화", () => {
  test("[미규정] 점 세그먼트 표기가 표의 키로 접혀 200이 된다", async () => {
    // **판정하지 않는다.** §9.1은 *"키는 `/`로 시작하는 완전한 경로 문자열이고"*라 적을 뿐
    // 조회의 입력이 「요청 타깃 원문」인지 「URI 정규화 후의 경로」인지를 안 든다. 문면대로
    // 원문을 재면 아래는 위반이고(표에 없는 문자열이 200을 받는다), RFC 3986의 등가 표기로
    // 읽으면 정상이다. 어느 쪽인지는 §9.1이 정할 자리다.
    //
    // 이 축이 오늘의 답을 그대로 적어 두는 이유는, 답이 조용히 바뀌는 것을 막기 위해서다.
    const observed: (readonly [string, number | undefined])[] = [];
    for (const target of [
      "/./",
      "/a/../",
      "/client/./protocol.js",
      "/client/../client/protocol.js",
    ])
      observed.push([target, await probeSettled(target)]);
    expect(observed).toEqual([
      ["/./", 200],
      ["/a/../", 200],
      ["/client/./protocol.js", 200],
      ["/client/../client/protocol.js", 200],
    ]);
  });

  test("[미규정] 프로토콜 상대 표기의 호스트가 무시되고 경로만 남는다", async () => {
    // 같은 부류다. `//example.com/client/protocol.js`는 표의 키가 아니지만 파싱 후 경로가
    // 키와 같아 열린다. 위험은 traversal이 아니라 「표의 키 집합보다 열리는 표기가 넓다」는
    // 사실 자체이고, 그 폭을 정본이 안 든다.
    expect(await probeSettled("//example.com/client/protocol.js")).toBe(200);
  });

  test("[미규정] 요청 타깃이 없으면 화면이 나간다", async () => {
    // `request.url`이 없을 때 `"/"`로 접는 것은 구현의 기본값이고 §9.1에 근거가 없다.
    // 2026-08-27 반입 전에는 이 기본값이 404였고(표에 `/`가 없었다) 반입이 그 뜻을 바꿨다 —
    // 값을 안 바꾸고도 답이 바뀐 자리라 적어 둔다.
    expect(await probeSettled(undefined)).toBe(200);
  });

  test("표기 정규화가 traversal을 열지는 않는다 — 위 관측이 그 판정을 안 흔든다", () => {
    // 정규화가 넓히는 것은 「키에 도달하는 표기」뿐이고 키 집합 자체는 그대로다.
    for (const target of [
      "/../../etc/passwd",
      "/client/../../../etc/passwd",
      "/client/..%2f..%2fetc%2fpasswd",
      "/client/protocol%2Ejs",
    ]) {
      expect(probe(target).status, `${target}이 열렸다`).toBe(404);
    }
  });
});

// ---------------------------------------------------------------------------
// 축 3 — §9.2 `contentType` 정규형. **런타임이 잰다**
// ---------------------------------------------------------------------------

/**
 * §9.2 — *"소문자이고 양끝 공백이 없는"* MIME 타입 문자열이고 *"이 형식은 표의 불변 조건이
 * 잰다"*.
 *
 * **오늘 그 불변 조건은 `src/assets.ts` 안의 비공개 타입 별칭 하나뿐이다**
 * (`NormalizedContentType` → `ManifestContentTypesAreNormalized`). 그 별칭이 export되지
 * 않으므로 **어떤 테스트도 그것을 역검증할 수 없고**, 별칭이 공허해지는 편집(예: 조건절을
 * 걷어 `S`를 그대로 돌려주는 것)은 전 축 그린으로 통과한다. 형제 불변 조건 둘은 그렇지
 * 않다 — `assets.serving.contract.test.ts`가 「키가 `/`로 시작한다」와 「`file`에 `/`가 없다」를
 * 런타임으로 한 번 더 재므로, 타입이 죽어도 성질 자체는 남아서 재어진다.
 *
 * 그래서 이 축이 **성질을 직접** 잰다. 술어를 여기서 새로 드는 것이 정본을 둘로 만드는 것이
 * 아닌 근거: 정본은 §9.2의 문면이고 타입도 이 축도 그 문면의 사본이다 — 사본이 둘이면
 * 하나가 낡을 때 다른 하나가 붉는다.
 */
const isNormalizedContentType = (value: string): boolean =>
  value === value.toLowerCase() && value === value.trim();

describe("축 3 — `contentType` 정규형 (§9.2)", () => {
  test("표의 모든 `contentType`이 정규형이다", () => {
    const violations = manifestEntries
      .filter((entry) => !isNormalizedContentType(entry.contentType))
      .map((entry) => `${entry.origin}:${entry.file} → ${JSON.stringify(entry.contentType)}`);
    expect(violations, "정규형을 벗어난 `contentType`이 있다").toEqual([]);
    expect(manifestEntries.length, "표가 비어 이 축이 공허하다").toBeGreaterThan(0);
  });

  test("역검증 — 대소문자·양끝 공백 넷이 전부 잡힌다", () => {
    // §9.2가 *"오타 부류 넷(대소문자·선행 공백 등)"*이라 이름 붙인 그 넷이다. 하나라도
    // 안 잡히면 이 축이 정본보다 좁다.
    for (const bad of [
      "TEXT/HTML; charset=utf-8",
      "text/html; charset=UTF-8",
      " text/css; charset=utf-8",
      "text/css; charset=utf-8 ",
      "text/css; charset=utf-8\t",
    ]) {
      expect(isNormalizedContentType(bad), `${JSON.stringify(bad)}이 안 잡힌다`).toBe(false);
    }
  });

  test("역검증 — 실물 값들은 통과한다. 술어가 전건을 붉히는 것이 아니다", () => {
    for (const good of ["text/html; charset=utf-8", "text/css; charset=utf-8", "text/javascript"]) {
      expect(isNormalizedContentType(good)).toBe(true);
    }
  });

  test("[미규정] 정규형이 «MIME 타입 문자열»인가는 이 축이 안 잰다", () => {
    // §9.2는 *"MIME 타입 문자열"*이라 적지만 그 문법(type/subtype)을 재는 것은 정하지 않았고,
    // 확장자 유추와 닫힌 유니온은 §9.4 기각표가 이미 죽인 갈래다. 여기서는 **오늘의 값이
    // 실제로 `type/subtype` 꼴인 것**만 관측으로 남긴다 — 판정이 아니다.
    for (const entry of manifestEntries) {
      expect(entry.contentType.split(";")[0]).toMatch(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/);
    }
  });
});

// ---------------------------------------------------------------------------
// 축 4 — §9.2 제외 목록과 자산의 정의
// ---------------------------------------------------------------------------

/**
 * §9.2 — *"루트에는 자산이 아닌 파일이 놓일 수 있고, 그것은 매니페스트에 등재되지 않는다"*.
 * 그 목록을 정본이 **이름으로** 든다: *"오늘 둘이다"* — `.gitkeep`과 `client/tsconfig.json`.
 * 그리고 *"제외의 단위는 «갈래 + 파일명» 쌍이다"*.
 *
 * 형제 계약 테스트는 그 두 쌍이 **들어 있는가**만 잰다(`toContainEqual`). 셋째 쌍이 붙어도
 * 그린이다 — 그런데 §9.2가 *"어느 갈래든 그 목록이 셋째 쌍을 얻을 때"*를 **배치를 다시 볼
 * 트리거**로 정했으므로, 그 발동이 오늘 아무 기계에도 안 걸린다. 이 축이 그 자리를 든다.
 */
const EXEMPTIONS_IN_DOC: readonly ManifestExemption[] = [
  { origin: "generated", file: ".gitkeep" },
  { origin: "authored", file: "tsconfig.json" },
];

const pairOf = (exemption: ManifestExemption): string => `${exemption.origin}:${exemption.file}`;

/** 브라우저가 URL로 받아 가는 종류의 확장자. §9.2의 자산 정의를 이 축이 쓰는 형태 */
const ASSET_KIND_SUFFIXES = [".html", ".htm", ".css", ".js", ".mjs", ".svg", ".png", ".woff2"];

describe("축 4 — 제외 목록과 자산의 정의 (§9.2)", () => {
  test("제외가 정본이 이름으로 든 두 쌍 그대로다 — 셋째 쌍이 붙으면 붉는다", () => {
    expect(
      [...MANIFEST_EXEMPTIONS].map(pairOf).sort(),
      "제외 목록이 정본의 두 쌍과 다르다 — §9.2의 트리거가 발동했거나 목록이 낡았다",
    ).toEqual([...EXEMPTIONS_IN_DOC].map(pairOf).sort());
  });

  test('제외된 파일이 자산 종류가 아니다 — *"판별은 종류이지 도달이 아니다"*', () => {
    // 제외의 축은 「열지 말아야 할 것」이다. 브라우저가 받아 갈 종류를 여기 넣으면 §9.2가
    // 배치를 다시 볼 트리거로 정한 신호가 **잘못된 이유로** 당겨진다(`src/assets.ts`의
    // `/client/anchors.js` 주석이 그 갈래를 이미 기각한다).
    const wrong = MANIFEST_EXEMPTIONS.filter((exemption) =>
      ASSET_KIND_SUFFIXES.some((suffix) => exemption.file.toLowerCase().endsWith(suffix)),
    ).map(pairOf);
    expect(wrong, "자산 종류의 파일이 제외 목록에 있다").toEqual([]);
  });

  test("역검증 — 자산 종류를 제외로 넣으면 위 술어가 잡는다", () => {
    const planted: readonly ManifestExemption[] = [
      ...MANIFEST_EXEMPTIONS,
      { origin: "authored", file: "wiring.js" },
    ];
    const wrong = planted
      .filter((exemption) =>
        ASSET_KIND_SUFFIXES.some((suffix) => exemption.file.toLowerCase().endsWith(suffix)),
      )
      .map(pairOf);
    expect(wrong).toEqual(["authored:wiring.js"]);
  });

  test("제외된 파일이 실제로 그 갈래의 루트에 있다 — 죽은 제외가 아니다", () => {
    // 없는 파일을 제외로 들고 있으면 그 줄은 아무것도 안 하는데 목록의 크기만 차지하고,
    // 위 트리거의 셈이 그만큼 틀어진다.
    for (const exemption of MANIFEST_EXEMPTIONS) {
      const files = readdirSync(assetRoot(exemption.origin), { recursive: true, encoding: "utf8" });
      expect(files, `${pairOf(exemption)}이 루트에 없다`).toContain(exemption.file);
    }
  });

  test("제외된 파일이 매니페스트에도 있지 않다 — 두 자리에 동시에 서지 않는다", () => {
    for (const exemption of MANIFEST_EXEMPTIONS) {
      const registered = manifestEntries.some(
        (entry) => entry.origin === exemption.origin && entry.file === exemption.file,
      );
      expect(registered, `${pairOf(exemption)}이 표와 제외에 동시에 있다`).toBe(false);
    }
  });

  test("역검증 — `isExemptFile`이 갈래를 실제로 본다", () => {
    expect(isExemptFile(MANIFEST_EXEMPTIONS, "generated", ".gitkeep")).toBe(true);
    expect(isExemptFile(MANIFEST_EXEMPTIONS, "authored", ".gitkeep")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 축 5 — 엔트리의 필드 집합. §9.2의 두 갈래 정확히 그대로
// ---------------------------------------------------------------------------

/**
 * §9.2의 타입이 갈래마다 필드를 든다. 형제 계약 테스트는 `authored`가 재생성 세 필드를
 * **안 드는가**만 잰다 — **여분의 필드**는 어느 축도 안 본다.
 *
 * 여기가 자리인 근거는 §9.5 결정 4다: *"진입점의 지목을 값(상수·필드)으로 세우지 않는다"*.
 * 그 금지의 «필드» 절반이 오늘 아무 기계에도 안 걸린다 — 매니페스트에 `entry: true` 같은
 * 필드가 붙어도 붉는 것이 없다. 필드 집합을 닫으면 그 갈래가 표현 불가능해지고, 덤으로
 * §9.4 결정 12가 이름 붙인 «손 기입의 오타»(필드 이름을 잘못 적어 계약이 조용히 비는 것)가
 * 같은 축에 걸린다.
 */
const FIELDS: Readonly<Record<AssetEntry["origin"], readonly string[]>> = {
  generated: ["contentType", "file", "origin", "prompt", "pulledAt", "sha256"],
  authored: ["contentType", "file", "origin"],
};

const fieldViolations = (manifest: AssetManifest): string[] =>
  Object.entries(manifest).flatMap(([route, entry]) => {
    const actual = Object.keys(entry).sort();
    const expected = [...FIELDS[entry.origin]].sort();
    return actual.length === expected.length && actual.every((name, at) => name === expected[at])
      ? []
      : [`${route} → ${actual.join(",")}`];
  });

describe("축 5 — 엔트리의 필드 집합 (§9.2 · §9.5 결정 4)", () => {
  test("모든 엔트리의 필드가 자기 갈래의 것 정확히 그대로다", () => {
    expect(fieldViolations(ASSET_MANIFEST), "필드가 정본의 갈래와 다르다").toEqual([]);
    expect(manifestRoutes.length, "표가 비어 이 축이 공허하다").toBeGreaterThan(0);
  });

  test("역검증 — 진입점을 지목하는 여분의 필드를 심으면 잡힌다", () => {
    const planted: AssetManifest = {
      ...ASSET_MANIFEST,
      "/client/main.js": {
        ...ASSET_MANIFEST["/client/main.js"],
        // 결정 4가 기각한 갈래를 실물로 든다.
        entryPoint: true,
      } as unknown as AssetEntry,
    };
    expect(fieldViolations(planted)).toEqual([
      "/client/main.js → contentType,entryPoint,file,origin",
    ]);
  });

  test("역검증 — 필드 하나를 빠뜨려도 잡힌다", () => {
    const { sha256: _dropped, ...rest } = ASSET_MANIFEST["/tokens.css"];
    const planted: AssetManifest = { ...ASSET_MANIFEST, "/tokens.css": rest as AssetEntry };
    expect(fieldViolations(planted)).toEqual([
      "/tokens.css → contentType,file,origin,prompt,pulledAt",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 축 6 — §9.5 결정 2 ② 매니페스트 키의 사본이 없다
// ---------------------------------------------------------------------------

const PACKAGE_ROOT = fileURLToPath(new URL("../", import.meta.url));

/** `src/`·`client/`의 소스 전부. 테스트는 제품이 아니므로 모집단 밖이다 */
function productSources(): { name: string; text: string }[] {
  const found: { name: string; text: string }[] = [];
  for (const dir of ["src", "client"]) {
    for (const file of readdirSync(join(PACKAGE_ROOT, dir), {
      recursive: true,
      encoding: "utf8",
    })) {
      if (!/\.(ts|js)$/.test(file)) continue;
      found.push({
        name: `${dir}/${file}`,
        text: readFileSync(join(PACKAGE_ROOT, dir, file), "utf8"),
      });
    }
  }
  return found;
}

/**
 * 한 파일이 든 매니페스트 키의 수. **따옴표 리터럴만 센다.**
 *
 * **한계를 적는다 — 이것은 텍스트 스캔이고, §9.4 결정 13이 그 부류를 계약으로 올리기를
 * 거부했다.** 변수로 조립한 키, 백틱 안의 산문(오늘 `client/main.js`의 주석이 그 형태다),
 * 조각으로 쪼갠 표기를 못 본다. 그럼에도 이 축을 두는 근거는 방향이다 — 결정 2 ②가 겨눈
 * 것은 «사본이 하나 는다»이고, 손으로 적은 목록은 대개 리터럴로 적힌다. 못 보는 자리가
 * 남는다는 것을 안 적으면 §2.3이 이름 붙인 형태가 된다.
 *
 * **`"/"`는 세지 않는다.** 한 글자짜리 키라 URL 기준 오리진의 기본값 같은 무관한 자리에서
 * 그대로 나타나고(오늘 `src/server.ts`가 그렇다), 그것을 「키 목록의 사본」으로 읽으면 이
 * 축이 거짓 양성을 낸다.
 */
const countedRoutes = manifestRoutes.filter((route) => route !== "/");

const routeLiteralsIn = (text: string): string[] =>
  countedRoutes.filter((route) => text.includes(`"${route}"`) || text.includes(`'${route}'`));

describe("축 6 — 참조 키의 정본은 매니페스트 자신이다 (§9.5 결정 2 ②)", () => {
  test("모집단이 비어 있지 않다", () => {
    expect(countedRoutes.length, "셀 키가 없다").toBeGreaterThan(0);
    expect(productSources().length, "소스를 하나도 못 읽었다").toBeGreaterThan(0);
  });

  test("`src/assets.ts` 밖에 키 목록의 사본이 없다", () => {
    // 결정 2 ② — *"별도 상수를 세우면 사본이 하나 는다"*. 한 파일이 키를 **둘 이상** 들면
    // 그것이 목록이다. 하나만 드는 것은 지목이라 이 축의 대상이 아니다.
    const copies = productSources()
      .filter((file) => file.name !== "src/assets.ts")
      .map((file) => ({ name: file.name, routes: routeLiteralsIn(file.text) }))
      .filter((file) => file.routes.length > 1);
    expect(copies, "매니페스트 키의 목록이 두 자리에 산다").toEqual([]);
  });

  test("역검증 — 심은 사본이 잡힌다", () => {
    const planted = `const KEYS = [${countedRoutes.map((route) => `"${route}"`).join(", ")}];`;
    expect(routeLiteralsIn(planted).length).toBe(countedRoutes.length);
  });

  test("역검증 — 술어가 매니페스트 자신은 든다. 눈이 먼 것이 아니다", () => {
    const manifestSource = productSources().find((file) => file.name === "src/assets.ts");
    expect(manifestSource, "`src/assets.ts`를 못 읽었다").toBeDefined();
    expect(routeLiteralsIn(manifestSource?.text ?? "")).toEqual(countedRoutes);
  });
});

// ---------------------------------------------------------------------------
// 축 7 — §9.1 요청 문자열이 경로 조립에 안 닿는다. **패키지 전수**
// ---------------------------------------------------------------------------

/**
 * §9.1이 그 계약의 모집단을 직접 든다 — *"`packages/serve`에 요청 URL을 `path.join`·
 * `path.resolve`에 넘기는 코드가 **존재하지 않는 것**이 이 절의 계약이다"*(강조는 정본).
 * 형제 계약 테스트 둘은 **핸들러의 행동**만 잰다: 미스 목록이 읽기를 시도하지 않는가,
 * `assetFilePath`가 루트와 `file`로만 이뤄지는가. 둘 다 참이어도 다른 모듈이 요청 문자열로
 * 경로를 조립하면 그 축들은 그대로 그린이다.
 *
 * **한계 — 이것도 텍스트 스캔이다.** 같은 줄에 안 적힌 조립(중간 변수를 거치는 형태)을 못
 * 본다. 그래서 축을 둘로 나눈다: ① `node:path`를 임포트하는 **모듈의 집합**이 하나인가
 * (이쪽은 스캔이 아니라 집합의 크기라 우회가 어렵다) ② 그 하나의 호출 자리에 요청에서 온
 * 이름이 안 적혔는가.
 */
const REQUEST_FLAVORED = ["request", "req.", "pathname", ".url", "url."];

function pathImporters(): { name: string; names: string[] }[] {
  const found: { name: string; names: string[] }[] = [];
  for (const file of productSources()) {
    for (const match of file.text.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']node:path["']/g)) {
      const names = (match[1] ?? "")
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name.length > 0);
      found.push({ name: file.name, names });
    }
  }
  return found;
}

/** `join(`·`resolve(`가 나타난 줄 중 요청에서 온 이름을 같은 줄에 든 것 */
function assemblyLines(text: string, names: readonly string[]): string[] {
  if (names.length === 0) return [];
  const call = new RegExp(`\\b(${names.join("|")})\\s*\\(`);
  return text
    .split("\n")
    .filter((line) => call.test(line) && REQUEST_FLAVORED.some((mark) => line.includes(mark)));
}

describe("축 7 — 요청 문자열이 경로 조립에 안 닿는다 (§9.1)", () => {
  test("`node:path`를 임포트하는 제품 모듈이 `src/assets.ts` 하나다", () => {
    expect(
      pathImporters().map((file) => file.name),
      "경로 조립 수단을 든 모듈이 하나가 아니다 — 모집단이 넓어졌다",
    ).toEqual(["src/assets.ts"]);
  });

  test("그 모듈의 조립 자리에 요청에서 온 이름이 없다", () => {
    const violations = pathImporters().flatMap((file) => {
      const source = productSources().find((entry) => entry.name === file.name);
      return assemblyLines(source?.text ?? "", file.names).map(
        (line) => `${file.name}: ${line.trim()}`,
      );
    });
    expect(violations, "요청 문자열이 경로 조립에 닿는 줄이 있다").toEqual([]);
  });

  test("역검증 — 심은 조립 줄이 잡힌다", () => {
    const planted = "const path = join(GENERATED_ASSET_ROOT, new URL(request.url).pathname);\n";
    expect(assemblyLines(planted, ["join"])).toHaveLength(1);
  });

  test("역검증 — 술어가 정상 조립 줄을 안 붉힌다", () => {
    expect(assemblyLines("return join(assetRoot(entry.origin), entry.file);\n", ["join"])).toEqual(
      [],
    );
  });

  test("역검증 — 임포트 스캔이 실제로 무언가를 찾는다", () => {
    expect(pathImporters().length, "임포트를 하나도 못 찾았다 — 스캔이 죽었다").toBeGreaterThan(0);
    expect(pathImporters()[0]?.names, "임포트 이름을 못 갈랐다").toContain("join");
  });
});
