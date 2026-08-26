/**
 * 정적 자산 서빙 — `docs/WEB-UI.md` §9·§9.1·§9.2·§9.3.
 *
 * 이 파일이 지는 것은 **둘**이다. URL을 파일에 여는 닫힌 표(§9.1)와, 그 표가 서빙 계약과
 * 재생성 기록을 함께 드는 형태(§9.2)다. 표의 실물과 표를 대조하는 것 — 매니페스트의 모든
 * 파일이 실재하고 그 루트의 모든 파일이 등재됐는가, 그리고 `generated` 엔트리의 해시가
 * 맞는가 — 은 이 파일이 아니라 `packages/serve/test/`가 진다(§9.2 — "해시는 런타임이 재지
 * 않는다.").
 *
 * ## 경로를 조립하지 않는다 (§9.1)
 *
 * §9.1이 "URL 경로에서 파일 경로를 조립하지 않는다."로 열고 "요청에서 온 문자열이 파일 경로에
 * 들어가지 않는다."를 계약으로 든다. 그래서 아래에서 요청이 하는 일은 **표의 키를 고르는 것
 * 하나**다. 파일을 여는 경로는 "엔트리의 갈래가 정하는 상수 루트"와 엔트리의 `file`뿐이고
 * 후자는 매니페스트가 든 리터럴이다.
 *
 * 그 결과가 §9.1이 적은 것이다 — "그래서 traversal은 검사 대상이 아니라 표현 불가능한 것이
 * 된다." 아래 어디에도 요청 문자열을 `join`·`resolve`에 넘기는 자리가 없으므로 막을 것이
 * 남지 않는다. `/../../etc/passwd` 같은 요청이 404가 되는 것은 검사를 통과하지 못해서가
 * 아니라 **그 키가 표에 없어서**다.
 *
 * "표에 없으면 404다."이고 "접두 매칭·와일드카드·디렉터리 인덱스·SPA 폴백을 두지 않는다."
 * 그래서 아래 조회는 정확 일치 하나이고, 등록을 빠뜨린 자산은 열리는 것이 아니라 닫힌다.
 *
 * ## 루트가 둘인 것이 계약을 넓히지 않는다 (§9.1·§9.2·§9.3)
 *
 * §9.3이 갈래를 둘로 열었다 — 화면은 외부 도구의 출력이고(`generated`) 프로토콜 행동은 이
 * 레포가 쓴다(`authored`). §9.1이 그 자리에서 "루트가 갈래마다 다른 것이 이 계약을 넓히지
 * 않는다"고 적는다: "루트를 고르는 것은 판별자이지 요청이 아니므로" 요청 문자열이 닿지
 * 않는다는 성질은 갈래 수와 무관하다. 아래 `assetRoot`가 그 판별자 하나만 본다.
 *
 * 디렉터리를 가르는 이유는 §9.2의 두 축(포매터 제외·해시 대조)과 §9.1의 집합 동일성이
 * **디렉터리를 모집단으로 삼기** 때문이다 — "모집단은 갈래마다 자기 디렉터리다".
 *
 * ## `packages/serve/assets/`의 `.gitkeep`
 *
 * 오늘 `generated` 엔트리가 0건이라 그 루트가 비어 있는데, git이 빈 디렉터리를 추적하지
 * 않고 `DISTRIBUTION.md` §2가 clone한 트리를 그대로 런타임으로 쓴다. 그래서 새 클론에서
 * 루트가 통째로 사라지고, 그때 §9.1의 집합 동일성이 재는 모집단과 `biome.json`의 제외 항이
 * 함께 없는 곳을 가리킨다. `.gitkeep`이 그 자리를 잡는다.
 *
 * **`.gitkeep`은 자산이 아니므로 아래 매니페스트에 등재하지 않는다.** 배치 수단이고, 그것을
 * 등재하면 §9.2의 재생성 기록 세 필드를 물어야 하는데 답이 없다. 대신 그 미등재가 §9.1의
 * 집합 동일성 중 루트 쪽 축에서 위반으로 읽히므로, **그 축을 재는 계약 테스트가 이 파일
 * 이름을 명시적으로 제외한다** — 제외를 코드가 들지 않으면 다음이 그것을 자산으로 오해하거나
 * 검사를 느슨하게 고쳐 통과시킨다.
 *
 * ## 불변 캐시를 두지 않는다 (§9.1)
 *
 * §6이 "버전이 갈리는 유일한 경우는 브라우저가 낡은 자산을 캐시한 것"이라 적었고 §9.1이
 * "불변 캐시를 두지 않는다."로 그 경로를 닫았다. 아래 응답은 `max-age`도 `immutable`도 싣지
 * 않는다.
 *
 * [미규정] §9.1은 **불변 캐시를 금지할 뿐 명시적 무캐시 지시를 요구하지 않는다.**
 * `cache-control: no-store`를 싣는 쪽을 골랐다 — 지시가 아예 없으면 휴리스틱 캐시가 서고,
 * 그것이 §6이 이름 붙인 그 실패(낡은 자산이 새 서버를 오해하는 것)를 조용히 되살린다.
 * 골라야 했던 이유는 무캐시가 계약이라서가 아니라 **부재가 중립이 아니기** 때문이다. 뒤집을
 * 자리는 이 파일이 아니라 §9.1이다.
 */

import { readFile } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LOOPBACK_HOST } from "./server.ts";

// ---------------------------------------------------------------------------
// 자산의 갈래와 루트 — §9.2·§9.3
// ---------------------------------------------------------------------------

/**
 * 자산 하나. 서빙 계약과 재생성 기록을 한 엔트리가 함께 든다(§9.2).
 *
 * "목록을 둘로 나누지 않는다." 서빙 표와 출처 표가 갈리면 그 둘 사이의 일치가 새 부패
 * 후보가 되기 때문이다. 갈래가 둘인 근거는 §9.3 — "파생물과 우리 소스는 지는 의무가 다르다".
 *
 * 판별 유니온이라 `authored`에 `prompt`·`pulledAt`·`sha256`을 적는 것이 **컴파일되지
 * 않는다.** §9.2가 "판별자가 그 차이를 값에서 가른다"고 적은 자리이고, 옵셔널 필드로 두면
 * 그 문장이 타입에서 거짓이 된다 — 출처 없는 파생물과 출처를 참칭하는 우리 소스가 둘 다
 * 표현 가능해진다.
 */
export type AssetEntry =
  | {
      /** 외부 도구가 뽑아 반입한 파생물 (§9) */
      readonly origin: "generated";
      /** 반입 자산 디렉터리 바로 아래의 파일명. 하위 디렉터리를 두지 않는다 */
      readonly file: string;
      /** 응답의 Content-Type. 확장자에서 유추하지 않는다 (§9.1) */
      readonly contentType: string;
      /** 이 파일을 낳은 원격 디자인 시스템의 프롬프트 경로 */
      readonly prompt: string;
      /** 그 프롬프트로 뽑아 반입한 날짜 */
      readonly pulledAt: string;
      /** 반입 시점 파일의 SHA-256. 반입 후 변조를 계약 테스트가 이것으로 잰다 */
      readonly sha256: string;
    }
  | {
      /** 이 레포가 손으로 쓴 브라우저 소스 (§9.3) */
      readonly origin: "authored";
      /** 클라이언트 소스 디렉터리 바로 아래의 파일명 */
      readonly file: string;
      readonly contentType: string;
    };

/** URL 경로 → 자산. 이 표에 없는 URL은 404다 */
export type AssetManifest = Readonly<Record<string, AssetEntry>>;

/**
 * 반입 자산의 루트. §9.2가 "자산은 `packages/serve/assets/`에 놓고"로 든 자리다.
 *
 * "자산은 `src/` 밖에 놓는다." — `src/`는 손으로 쓴 정본이고 자산은 파생물이라 같은 트리에
 * 섞으면 손질 금지가 지켜지는지를 배치로 가를 수 없게 된다.
 */
export const GENERATED_ASSET_ROOT = fileURLToPath(new URL("../assets/", import.meta.url));

/**
 * 브라우저 모듈의 루트. §9.3이 "자리는 `src/` 밖이고 반입 자산과도 디렉터리를 가른다"로 든
 * 자리다. 여기 있는 것은 파생물이 아니라 이 레포의 정본이므로 포매터가 정상적으로 걸린다.
 */
export const AUTHORED_ASSET_ROOT = fileURLToPath(new URL("../client/", import.meta.url));

/**
 * 갈래가 정하는 상수 루트(§9.1). **인자는 판별자 하나이고 요청이 아니다.**
 *
 * `switch`가 갈래를 소진한다 — 갈래가 셋이 되는 날 이 함수가 먼저 컴파일 에러가 되고, 그때
 * 새 루트를 정하는 것은 §9.2의 개정이지 여기의 기본값이 아니다.
 */
export function assetRoot(origin: AssetEntry["origin"]): string {
  switch (origin) {
    case "generated":
      return GENERATED_ASSET_ROOT;
    case "authored":
      return AUTHORED_ASSET_ROOT;
    default: {
      const exhaustive: never = origin;
      throw new Error(`알 수 없는 자산 갈래다 — ${String(exhaustive)}.`);
    }
  }
}

// ---------------------------------------------------------------------------
// 매니페스트 — §9.1·§9.2
// ---------------------------------------------------------------------------

/**
 * 고정 매니페스트. "매니페스트는 `src/` 안의 `.ts`다."이고 "`as const`로 닫아 라우트 집합이
 * 타입 레벨에서 닫힌다."
 *
 * **오늘 엔트리는 전부 `authored`이고 `generated`는 0건이다.** 반입 자산이 없어(§12 — 화면
 * 자산은 아직 뽑지 않았다) 여기 있는 것은 §9.3이 이 레포의 소유로 판정한 프로토콜 행동
 * 모듈과, §9.4 결정 7이 이 레포의 정본으로 판정한 앵커 상수, 그리고 결정 13이 이 레포의
 * 소유로 판정한 배선 층의 순수 부분뿐이다. **이 상태를 반입 자산이
 * 검증된 것으로 읽지 않는다** — `sha256` 대조 축은 오늘 공집합에서 참이고, 그 사실을 계약
 * 테스트의 머리가 든다.
 *
 * **개수를 이 자리에 적지 않는다.** 적으면 자산이 늘 때마다 손으로 따라가야 하는 수가 되고,
 * 그것이 이 레포가 되풀이해 이름 붙인 부패 형태다. 계약인 것은 `generated`가 0건이라는 사실
 * 하나이고 그것을 계약 테스트가 잰다.
 *
 * 키를 `/client/` 아래에 둔 것은 세부다. 근거는 충돌 회피다 — 갈래가 둘이라 루트는 갈렸으나
 * URL 공간은 하나이므로, 반입 화면 자산이 같은 파일명을 들고 오는 날 두 갈래가 한 키를
 * 다투게 된다. 접두를 나눠도 **접두 매칭이 생기지는 않는다**: 아래 조회는 이 키 문자열
 * 전체의 정확 일치 하나다.
 */
export const ASSET_MANIFEST = {
  "/client/anchors.js": {
    // §9.4 결정 7의 앵커 상수. `authored`인 근거는 §9.3의 표 그대로다 — 이 파일은 화면이
    // 아니라 화면과 배선이 공유하는 이름의 정본이고, 그것을 이 레포가 쓴다.
    //
    // **등재하는 쪽을 고른 것이 판단이다.** §9.2의 자산 정의는 «브라우저가 URL로 받아 가는
    // 것»인데 오늘 이 파일을 받아 가는 배선이 0건이라(DOM 배선 모듈이 아직 없다) 등재는
    // «배선이 이것을 임포트할 것이다»라는 내다봄 위에 선다. 반대 갈래(`MANIFEST_EXEMPT_FILES`에
    // 넣기)도 §9.1의 집합 동일성을 그린으로 통과하므로 **기계가 안 가른다.** 등재를 고른
    // 근거는 그 제외 목록이 §9.2가 «배치를 다시 볼 트리거»로 정한 자리라는 것이다 — 그
    // 신호는 «자산 아닌 파일이 늘었다»이지 «자산인데 빼고 싶다»가 아니고, 브라우저가 로드할
    // `.js`를 거기 넣으면 그 트리거가 잘못된 이유로 당겨진다.
    origin: "authored",
    file: "anchors.js",
    contentType: "text/javascript; charset=utf-8",
  },
  "/client/protocol.js": {
    origin: "authored",
    file: "protocol.js",
    contentType: "text/javascript; charset=utf-8",
  },
  "/client/stream.js": {
    origin: "authored",
    file: "stream.js",
    contentType: "text/javascript; charset=utf-8",
  },
  "/client/wiring.js": {
    // §9.4 결정 13의 조회 통로. `authored`인 근거는 §9.3의 표 그대로다 — 이 파일은 화면이
    // 아니라 화면이 준 자리를 채우는 층이고, 그 층을 이 레포가 소유한다.
    //
    // **`K-311`이 연 물음의 둘째 실물이 이 등재다.** 위 `/client/anchors.js`와 같은 상태다 —
    // 오늘 이 모듈을 브라우저가 받아 갈 배선이 0건이라, 등재는 배선이 이것을 임포트하리라는
    // 내다봄 위에 선다. **그 카드의 처분을 이 등재가 앞당기지 않는다**: 형제와 같은
    // 갈래를 고르는 것이 판단이고, 갈래를 달리 고르면 같은 디렉터리 안에서 처분이 갈려
    // 그 물음이 파일마다 따로 열린다.
    origin: "authored",
    file: "wiring.js",
    contentType: "text/javascript; charset=utf-8",
  },
} as const satisfies AssetManifest;

/** 열려 있는 라우트의 전부. 타입 레벨에서 닫힌 집합이다(§9.1) */
export type AssetRoute = keyof typeof ASSET_MANIFEST;

/**
 * 이 엔트리가 **HTML 문서**인가. §9.4 결정 8의 전수 대조와 결정 9의 CSP가 **같은 술어를
 * 쓴다** — 두 자리가 각자 판별을 들면 따로 낡고 «문서 판별의 정본이 둘»이 된다.
 *
 * 판별의 입력은 엔트리의 `contentType`이고 **요청에서 오는 값이 아니다.** 매니페스트가 든
 * 리터럴이므로 §9.1의 *"요청에서 온 문자열이 파일 경로에 들어가지 않는다."*가 이 술어에도
 * 그대로 선다 — 요청이 문서 판별을 흔들 자리가 없다.
 *
 * **미디어 타입은 대소문자를 안 가리고 값 앞의 공백도 안 가린다.** 둘은 같은 술어의 같은
 * 부류이고, 독립 QA가 각각 잡았다 — 2026-08-26 V-1(대소문자) · 2026-08-27 V-2(선행 공백).
 * `TEXT/HTML`을 든 엔트리는 브라우저가 HTML 문서로 파고, 값 앞에 공백·탭을 둔 엔트리는
 * **전송이 그것을 벗겨** 브라우저가 받는 값이 `text/html`이 된다. 그러므로 **둘 다 이 술어의
 * 참이어야 한다.** 안 그러면 매니페스트의 글자 하나가 결정 9의 CSP와 결정 8의 전수 대조를
 * **동시에** 비운다 — 술어를 공유하는 것의 대가가 그 자리에서 두 배가 되고, 그 형태가 결정 9의
 * 채택 근거였던 침묵 실패 그 자체다. 계약이 이미 함축한 것이라 §9.4의 개정 없이 여기서 닫는다.
 *
 * **두 부류를 함께 드는 것이 이 문단의 일이다.** 앞엣것만 이름으로 남으면 다음이 이 술어의
 * 방어 범위를 대소문자로만 읽고, 같은 부류의 셋째를 새 물음으로 연다. 결정 12가 그 방향을
 * 이미 이름 붙였다 — *"이것이 매니페스트 손 기입의 오타가 계약을 조용히 비우는 셋째 자리다."*
 *
 * **반대 독해도 적는다**(2026-08-27 독립 QA가 함께 남겼다). §9.2는 `contentType` 값의 **정규형을
 * 정하지 않는다.** 그래서 위 둘을 술어의 구멍이 아니라 매니페스트 값의 형식 계약 부재로 읽는
 * 갈래가 있고, 그 갈래를 고르면 처분은 이 술어가 아니라 §9.2의 개정이다. **이 사이클은 술어
 * 쪽을 골랐고, 그것이 뒤집힐 자리는 이 파일이 아니라 §9.2다** — 정규형이 정본에 서면 그때
 * 여기의 정규화가 중복이 되고, 걷는 것은 그 개정의 일이지 여기의 기본값이 아니다.
 *
 * **[미규정] 접두 판별의 한계**: `text/html` 아닌 문서 타입이 훗날 생기면 이 술어가 그것을
 * 조용히 빠뜨린다. 오늘 그 경로가 안 열리는 근거는 §9.4 결정 5다 — 열리는 `generated` 키가
 * `/`와 `/tokens.css` 둘뿐이고 문서는 앞엣것 하나다. **그 수가 늘면 여기의 기본값을 넓히는
 * 것이 아니라 §9.4의 개정이 선행이다.**
 */
export function isHtmlDocumentEntry(entry: AssetEntry): boolean {
  return entry.contentType.trim().toLowerCase().startsWith("text/html");
}

/**
 * HTML 문서 응답이 싣는 CSP(§9.4 결정 9). **값이 계약이다.**
 *
 * - `default-src 'self'` — 결정 9가 든 그대로다. 4-①(*"레포 밖을 참조하지 않는다"*)이 오늘
 *   아무 기계도 안 재는 유일한 항인데, 그 위반은 **반입하는 사람의 화면에서는 성공하고
 *   사용자의 오프라인 머신에서만 깨진다.** CSP가 그 조합을 표현 불가능으로 만든다.
 * - **인라인 스크립트가 함께 막히는 것은 부수가 아니라 값이다** — 결정 9의 첫 하위 항이
 *   그것을 계약으로 들었다. `script-src`를 여기 따로 두지 않는 이유가 그것이다: 두면
 *   `default-src`를 물려받는 성질이 끊기고, 그 순간 인라인을 다시 여는 지시어가 이 문자열에
 *   들어올 자리가 생긴다.
 * - `style-src 'self' 'unsafe-inline'` — 결정 9가 인라인 **스타일**은 명시로 허용했다
 *   (*"이 판정이 겨눈 것은 외부 호스트이고 인라인 스타일은 거기에 기여하지 않는다"*).
 *   겸사겸사 막으면 무빌드 킷의 형태를 필요 이상으로 좁힌다.
 *
 * **이 헤더는 `K-287`을 닫지 않는다.** 그 카드가 든 우회 — 반입 자산이 이 레포의 프로토콜
 * 모듈을 안 쓰고 **스스로** 스트림을 여는 것 — 은 동일 오리진이라 `'self'`가 허용한다.
 * 결정 9의 셋째 하위 항이 그것을 명시로 적었고, 안 적으면 다음이 이 헤더를 그 카드의
 * 처분으로 읽는다.
 */
const HTML_DOCUMENT_CSP = "default-src 'self'; style-src 'self' 'unsafe-inline'";

/**
 * 매니페스트가 등재하지 않는 **자산 아닌 파일**. §9.1의 집합 동일성 중 루트 쪽 축이 이것을
 * 제외하고, 그 개념의 정본은 §9.2다(2026-08-26 개정 — 그 전까지 정본에 개념이 없어 이 목록이
 * 근거 없이 서 있었다).
 *
 * 상수로 드는 이유는 그 제외가 검사 쪽의 임의 판단이 아니라 이 표의 성질이기 때문이다 —
 * 검사가 자기 목록을 따로 들면 제외의 정본이 둘이 된다.
 *
 * - `.gitkeep` — 배치 수단. git이 빈 디렉터리를 추적하지 않는다
 * - `tsconfig.json` — §9.3이 요구한 타입 검사 설정. 브라우저에 나가지 않는다
 *
 * **셋째가 붙는 순간이 §9.2가 든 트리거다** — 그때 열리는 것은 이 목록이 아니라 배치다.
 */
export const MANIFEST_EXEMPT_FILES: readonly string[] = [".gitkeep", "tsconfig.json"];

// ---------------------------------------------------------------------------
// 표의 불변 조건 — 타입이 진다
// ---------------------------------------------------------------------------

/** 디렉터리 구분자도 상위 지목도 없는 이름. 그 밖은 `never`가 된다 */
type BareFileName<S extends string> = S extends `${string}/${string}`
  ? never
  : S extends "." | ".."
    ? never
    : S;

type ManifestFileNames = (typeof ASSET_MANIFEST)[AssetRoute]["file"];

/**
 * §9.2의 "하위 디렉터리를 두지 않는다"를 타입이 잰다.
 *
 * 유니온을 튜플로 감싸 분배를 막는다 — 분배시키면 한 엔트리가 위반해도 나머지가 살아남아
 * 유니온이 비지 않는다. 런타임 검사로 두지 않는 이유는 이 값들이 전부 리터럴이기 때문이다:
 * 위반은 실행이 아니라 편집 시점에 존재한다.
 */
type ManifestFilesAreBare = [ManifestFileNames] extends [BareFileName<ManifestFileNames>]
  ? true
  : never;
const _manifestFilesAreBare: ManifestFilesAreBare = true;

/** §9.1의 "키는 `/`로 시작하는 완전한 경로 문자열이고"를 타입이 잰다 */
type RoutesAreAbsolute = [AssetRoute] extends [`/${string}`] ? true : never;
const _routesAreAbsolute: RoutesAreAbsolute = true;

// ---------------------------------------------------------------------------
// 조회와 파일 경로
// ---------------------------------------------------------------------------

/**
 * URL 경로로 엔트리를 찾는다. **정확 일치 하나다**(§9.1).
 *
 * `Object.hasOwn`을 쓰는 이유는 상속 속성이 라우트로 읽히지 않게 하기 위해서다 — 없으면
 * `/constructor` 같은 요청이 표에 없는데도 값을 얻는다. 표에 없으면 `undefined`이고 그것을
 * 404로 옮기는 것은 아래 핸들러다.
 */
export function lookupAsset(
  pathname: string,
  manifest: AssetManifest = ASSET_MANIFEST,
): AssetEntry | undefined {
  return Object.hasOwn(manifest, pathname) ? manifest[pathname] : undefined;
}

/**
 * 엔트리가 가리키는 파일의 절대 경로.
 *
 * **인자에 요청이 없다.** 두 조각 다 이 파일 안의 값이다 — 루트는 갈래가 고른 상수이고
 * `file`은 매니페스트가 든 리터럴이다. 시그니처가 그 사실을 든다.
 */
export function assetFilePath(entry: AssetEntry): string {
  return join(assetRoot(entry.origin), entry.file);
}

// ---------------------------------------------------------------------------
// HTTP 표면 — §2.1
// ---------------------------------------------------------------------------

/**
 * 이 파일이 응답에서 실제로 쓰는 것만 든 표면. `node:http`의 `ServerResponse`가 그대로
 * 대입된다(파일 말미가 그것을 컴파일러로 잰다).
 *
 * 통째로 받지 않는 이유는 `stream.ts`가 같은 자리에서 든 것과 같다 — 표면이 넓으면 이
 * 파일이 그것을 볼 수 있다는 사실만으로 다음이 여기에 다른 일을 얹는다.
 */
export type AssetResponse = {
  writeHead(status: number, headers: Readonly<Record<string, string>>): unknown;
  end(body: string | Uint8Array): unknown;
};

/**
 * 요청에서 이 파일이 읽는 것 **둘**. 그 밖을 안 받는 것이 §9.1의 기계 판이다 — 헤더도
 * 본문도 안 보므로 그것들이 파일 경로에 닿는 배선이 표현되지 않는다.
 */
export type AssetRequest = {
  readonly method?: string | undefined;
  readonly url?: string | undefined;
};

/** `server.ts`의 `PlainRequest`가 그대로 대입된다(말미의 대조) */
export type AssetExchange = {
  readonly request: AssetRequest;
  readonly response: AssetResponse;
};

/**
 * 자산 파일을 읽는 자리. 기본값은 `node:fs`이고 인자로 열어 둔 것은 검사가 읽기 실패
 * 경로를 재기 위해서다 — 그 경로를 못 재면 500 갈래가 죽은 코드로 남는다.
 */
export type AssetReader = (path: string) => Promise<Uint8Array>;

const readFromDisk: AssetReader = (path) =>
  new Promise((resolve, reject) => {
    readFile(path, (error, contents) => {
      if (error !== null) reject(error);
      else resolve(contents);
    });
  });

export type AssetHandlerOptions = {
  /** 생략하면 위 고정 매니페스트 */
  readonly manifest?: AssetManifest;
  /** 생략하면 디스크 */
  readonly readAsset?: AssetReader;
  /**
   * 읽기 실패의 행선지. **선택적이지 않다.**
   *
   * 매니페스트가 든 파일을 못 읽는 것은 §9.1의 집합 동일성이 깨졌다는 뜻이고, 그것이
   * 조용하면 화면이 빈 채로 뜨는 것 말고는 아무 신호가 없다. 클라이언트는 500을 받고
   * 프로세스는 이 자리로 받는다.
   */
  readonly onReadError: (error: unknown, pathname: string) => void;
};

export type AssetHandler = (exchange: AssetExchange) => void;

/**
 * 자산 요청을 처리한다.
 *
 * **이 핸들러는 자기 앞의 라우팅을 모른다.** `server.ts`가 스트림 라우트를 먼저 가르듯,
 * 메서드 엔드포인트(§11)도 이 핸들러 앞에서 갈린다 — 여기 도달한 요청은 이미 자산 요청으로
 * 판정된 것이고, 그래서 표에 없으면 다른 데로 넘기는 것이 아니라 404다. 폴백 갈래가
 * 없는 것이 §9.1의 "SPA 폴백을 두지 않는다"의 배선 판이다.
 */
export function createAssetHandler(options: AssetHandlerOptions): AssetHandler {
  const manifest = options.manifest ?? ASSET_MANIFEST;
  const readAsset = options.readAsset ?? readFromDisk;

  return ({ request, response }) => {
    // 요청 라인의 경로를 절대 URL로 만들어 읽는다. 기준 오리진은 상수다 — `server.ts`가
    // 라우팅에서 든 근거와 같고, 여기서 쓰는 것은 `pathname`뿐이라 오리진의 값은 결과에
    // 안 나타난다. 이 문자열이 가는 곳은 아래 표 조회 하나이고 파일 경로가 아니다.
    const pathname = new URL(request.url ?? "/", `http://${LOOPBACK_HOST}`).pathname;

    const entry = lookupAsset(pathname, manifest);
    if (entry === undefined) {
      // 메서드보다 표를 먼저 본다. 표에 없는 경로는 존재하지 않으므로 그것이 어떤 메서드로
      // 왔는지는 답의 일부가 아니다 — 405를 먼저 내면 없는 자산의 존재를 메서드별로
      // 알려 주게 된다.
      plainText(response, 404, "요청한 경로는 자산 표에 없다.");
      return;
    }

    // 자산은 읽기다. 다른 메서드를 여기서 받아 주면 표가 쓰기 표면이 되고, 그것은 §11의
    // 메서드 표가 지는 일이다.
    if (request.method !== "GET") {
      plainText(response, 405, "자산은 GET으로만 받는다.", { allow: "GET" });
      return;
    }

    readAsset(assetFilePath(entry)).then(
      (contents) => {
        response.writeHead(200, {
          // "`Content-Type`은 엔트리가 직접 든다." 확장자에서 유추하지 않으므로 확장자→MIME
          // 테이블도, 알 수 없는 확장자의 기본값을 정하는 물음도 생기지 않는다(§9.1).
          "content-type": entry.contentType,
          "content-length": String(contents.byteLength),
          // 불변 캐시를 두지 않는다(§9.1). 파일 머리의 [미규정]이 이 값의 근거를 든다.
          "cache-control": "no-store",
          // CSP는 **문서 응답에만** 싣는다(§9.4 결정 9). `.js`·`.css`는 문서가 아니라 하위
          // 리소스이고, CSP는 문서가 자기 로드 정책을 선언하는 헤더다 — 모든 응답에 넓게
          // 실으면 재는 것보다 넓게 주장하게 되고 그것이 §2.3이 이름 붙인 형태다.
          ...(isHtmlDocumentEntry(entry) ? { "content-security-policy": HTML_DOCUMENT_CSP } : {}),
        });
        response.end(contents);
      },
      (error: unknown) => {
        // 표는 이 파일이 실재한다고 말했는데 못 읽었다. 조용히 404로 접지 않는다 — 접으면
        // 배치가 깨진 상태가 정상적인 미등록과 구분되지 않는다.
        options.onReadError(error, pathname);
        plainText(response, 500, "자산을 읽지 못했다.");
      },
    );
  };
}

function plainText(
  response: AssetResponse,
  status: number,
  body: string,
  headers: Readonly<Record<string, string>> = {},
): void {
  response.writeHead(status, {
    ...headers,
    "content-type": "text/plain; charset=utf-8",
  });
  response.end(body);
}

// ---------------------------------------------------------------------------
// 밖에서 오는 타입이 위 표면에 맞는가 — 컴파일러가 잰다
// ---------------------------------------------------------------------------

type ServerResponseFits = ServerResponse extends AssetResponse ? true : never;
const _serverResponseFits: ServerResponseFits = true;

type IncomingMessageFits = IncomingMessage extends AssetRequest ? true : never;
const _incomingMessageFits: IncomingMessageFits = true;
