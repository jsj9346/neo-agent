/**
 * T-017 — 자산 매니페스트와 실물의 대조. 정본은 `docs/WEB-UI.md` §9.1·§9.2·§9.3이다.
 *
 * **기대값은 구현이 아니라 계약 문서에서만 도출했다.** 구현이 문서와 다르면 이 파일은 문서
 * 편에 서고 red를 그대로 남긴다.
 *
 *   - `WEB-UI.md` §9.1 — 양방향 집합 동일성. *"매니페스트의 모든 `file`이 자기 갈래의 루트에
 *                        실재하고, 그 루트의 모든 파일이 매니페스트에 등재된다"*, 그리고
 *                        *"모집단은 갈래마다 자기 디렉터리다"*
 *   - `WEB-UI.md` §9.2 — `sha256` 대조와 *"포매터를 자산 디렉터리에서 뺀다."*, 그리고
 *                        *"해시는 런타임이 재지 않는다."*
 *   - `WEB-UI.md` §9.3 — 갈래마다 지는 의무가 다르다는 것. `prompt`·`pulledAt`·`sha256`과
 *                        포매터 제외는 `generated`에만 걸린다
 *
 * **형제와 모집단이 다르다.** `assets.serving.contract.test.ts`는 요청을 돌고 이 파일은
 * 디렉터리를 돈다. 그쪽이 재는 서빙 경로(표 조회·응답 헤더·갈래 판별)를 여기서 되풀이하지
 * 않는다.
 *
 * **정정 (2026-09-02 · `plans/20260902-webui96-decision15-plan.md` T-003).** 위 *「이 파일은
 * 디렉터리를 돈다」*가 오늘 이 파일의 모집단을 다 안 든다. §9.6 결정 15의 승격이 **화면
 * 원문(`assets/index.html`)을 읽는 축들**(§9.4 결정 4·5·11 · §9.5 결정 5·10)을 이 파일로
 * 옮겼으므로, 모집단은 이제 셋이다 — ① 매니페스트와 디스크 디렉터리 ② 화면 원문 ③ 그리기 층
 * 원문(`client/render.js`). ③은 축 하나만 연다 — §9.5 결정 10의 잠금은 화면과 그리기 층이 둘 다
 * 참일 때만 실물이라 어느 한쪽만 재는 축이 그 실패를 못 본다. 형제와 갈리는 것은 여전히
 * «요청을 돌지 않는다»이고, 그것만 이 문단이 든다. 원문은 남긴다 — 지우면 다음이 이 파일을
 * 디렉터리 전용으로 다시 읽는다.
 *
 * ## 오늘 이 그린이 뜻하는 것과 뜻하지 않는 것
 *
 * **2026-08-27 — `generated` 엔트리가 처음으로 섰고 `sha256` 대조 축이 공집합을 벗어났다.**
 * 화면(`/` · `index.html`)과 그 화면이 여는 평평해진 토큰(`/tokens.css`) 둘이다(§9.4 결정 5).
 * 그때까지 이 축은 잴 것이 없어 참이었고 — 그 상태에서 이 파일의 그린을 «반입 자산이
 * 검증됐다»로 읽는 것이 정확히 틀린 읽기였다 — 오늘은 그 둘의 바이트를 실제로 읽어 표와
 * 대조한다. 아래 역검증은 그 자리에 남는다: 실물이 생겼다고 해서 축이 무엇을 재는지
 * 스스로 증명하게 되는 것은 아니다.
 *
 * **`sha256`이 출처를 증명하지 않는다.** §9.2가 그 한계를 적었다 — 이 해시는 *"반입 후
 * 변조"*만 잡는다. 반입물이 정말 그 프롬프트에서 나왔는지는 재지 못하며, 재려면 원격을 열어야
 * 하는데 정본이 원격이라는 것이 §9의 전제다.
 *
 * ## 자산 아닌 파일의 자리 — 닫혔다 (2026-08-26)
 *
 * 한때 이 자리가 red였다. §9.1의 실물 쪽 축이 `authored` 루트에서 `tsconfig.json`을 미등재
 * 위반으로 읽었는데 그 파일은 §9.3이 직접 놓은 것이라, 한 절이 놓으라 한 파일을 다른 절이
 * 금지하는 형태였다. **정본이 그 자리를 만들어 닫았다** — §9.2가 *"루트에는 자산이 아닌 파일이
 * 놓일 수 있고, 그것은 매니페스트에 등재되지 않는다"*를 확정하고 오늘의 둘을 이름으로 들며,
 * *"목록의 정본은 `packages/serve/src/assets.ts`의 상수 하나다"*로 검사가 읽을 자리까지 정했다.
 * 이 파일은 그 상수(`MANIFEST_EXEMPTIONS`)를 import해 쓰고 자기 목록을 따로 들지 않는다 —
 * 따로 들면 제외의 정본이 둘이 되고, 그것이 §9.2가 이미 거부한 형태다.
 *
 * **그래서 이 파일은 오늘 전 축 그린이다.** 낡은 red 서술을 남겨 두면 다음 감사가 닫힌 것을
 * 열린 것으로 읽는다(2026-08-26 · QA D-3 처분).
 *
 * ## 매니페스트의 **형태**도 여기서 잰다 — §9.4 결정 12 (2026-08-27)
 *
 * 이 파일의 마지막 describe가 재는 것은 실물과의 대조가 아니라 표 자신의 형태다. 결정 12가
 * 금지한 조합은 둘이고 그 근거는 §9.4가 든다 — *"화면은 `generated`뿐이다 — `authored` HTML
 * 문서를 두지 않는다"*, 그리고 *"`generated` HTML 문서는 많아야 하나다"*. 뒤엣것이 둘이 되는
 * 것은 결정 1의 트리거가 발동했다는 뜻이고, 결정 12는 *"그 발동을 사람이 알아채는 것에 맡기지
 * 않는다"*고 적었다.
 *
 * **자리가 여기인 것은 매니페스트를 재는 자리가 둘이 되지 않게 하기 위해서다.** 표의 형태에
 * 대한 계약(집합 동일성 · `sha256` · 포매터 제외)이 이미 이 파일에 산다.
 *
 * ### 이것은 §2.3·§9.3이 거부한 텍스트 스캔 부류가 **아니다**
 *
 * 그 둘이 거부한 것은 금지된 표기를 원문에서 찾는 검사이고, 못 찾으면 조용히 통과하므로
 * 막는다면서 못 막는 상태가 된다. 여기서 세는 것은 원문의 표기가 아니라 **닫힌 표의 엔트리
 * 전부**라 그 결함이 원리적으로 안 걸린다 — 결정 12가 같은 근거를 스스로 적었다:
 * *"모집단이 닫힌 표이므로 이 검사는 전수이고"*, *"여기서 세는 것은 원문의 표기가 아니라 표의
 * 엔트리 전부다"*. **이 문단을 걷지 않는다** — 안 적으면 다음이 이 축을 거부된 부류로 읽고
 * 함께 걷어낸다.
 *
 * ### 술어를 따로 들지 않는다
 *
 * 문서 판별은 `src/assets.ts`가 export하는 `isHtmlDocumentEntry` 하나이고, 그것이 결정 8의
 * 전수 대조·결정 9의 CSP와 같은 술어다 — 결정 12가 *"판별의 술어는 결정 8·9가 이미 공유하는
 * 그것 하나를 그대로 쓴다"*로 못박았다. 두 자리가 각자 판별을 들면 따로 낡고 문서 판별의
 * 정본이 둘이 된다. 그 대가를 2026-08-26 독립 QA가 V-1로 실물에서 냈다 — 미디어 타입의
 * 대소문자 하나가 결정 8과 결정 9를 동시에 비웠다.
 *
 * ### 오늘 실물 위반이 0이다
 *
 * 결정 12가 *"오늘 실물 위반은 0이다"*라 적고 그 근거로 `authored` 엔트리가 전부 자바스크립트라는
 * 것을 든다. **2026-08-27 반입이 HTML 문서 엔트리 하나를 만들었다** — 화면(`/`)이고 갈래가
 * `generated`다. 그래서 첫째 갈래(`authored` HTML 문서)는 여전히 공집합에서 참이고, 둘째
 * 갈래(*"`generated` HTML 문서는 많아야 하나다"*)만 실물 하나를 모집단으로 돈다. 처음부터
 * 그린인 축은 자기가 무엇을 재는지 증명하지 못하므로 아래 주입 역검증 셋이 **같은 순수
 * 함수**를 지나 그 구별을 만든다 — 역검증이 실물과 다른 코드를 재면 아무것도 못 잡는다.
 *
 * ## 표에 걸린 나머지 계약 셋도 여기서 잰다 — §9.4 결정 5 · §9.5 결정 1·4 (2026-08-27)
 *
 * 셋 다 «닫힌 표의 전수»라 위 결정 12 축과 같은 부류이고, 자리가 여기인 근거도 같다 — 표를
 * 재는 자리를 둘로 만들지 않는다. 셋이 승격된 경위는 `plans/20260827-webui94-K-313.md`가 든다.
 *
 *   - **§9.4 결정 5 (일반형)** — *"키 둘이 한 파일을 열면"*의 금지를 **짝을 한정하지 않고**
 *     잰다. 형제 `assets.serving.contract.test.ts`가 재는 것은 `/`↔`/index.html` 그 짝
 *     하나이고, §9.1의 집합 동일성은 등재 여부만 봐서 1:N을 그린으로 통과시킨다
 *   - **§9.5 결정 1** — *"매니페스트의 두 `generated` 엔트리가 같은 `prompt` 값을 든다."*
 *     `src/assets.ts`가 화면 엔트리 주석에 그것을 계약이라 적는 자리다
 *   - **§9.5 결정 4** — *"스크립트 진입점은 정확히 하나다."* 화면 원문을 읽으므로 부분 문자열
 *     매칭의 한계를 물려받고, 그 목록을 그 축의 술어 주석이 든다.
 *     **정정 (2026-09-02 · 같은 플랜 T-003)** — 한때 이 자리가 *「이 하나만 화면 원문을
 *     읽는다」*였다. §9.6 결정 15의 승격이 §9.4 결정 4·5·11 축을 들여오면서 거짓이 됐다 —
 *     원문을 읽는 축은 이제 여럿이고, 부분 문자열 매칭의 한계는 그 전부에 걸린다
 *
 * ## §9.6 결정 15의 승격 — 화면 원문을 읽는 축 셋이 여기로 왔다 (2026-09-02)
 *
 * 결정 15가 *존재·전수* 부류를 계약으로 올리기로 판정했고, 그 목록의 §9.4·§9.5 몫이 이 파일로
 * 왔다 — **§9.4 결정 4**(반입물은 평면이고 자기완결이다) · **§9.4 결정 5의 인라인 금지 갈래** ·
 * **§9.4 결정 11**(컨트롤 셋이 문면을 든다, §9.6 결정 2와 함께) · **§9.5 결정 5**(리터럴 색값) ·
 * **§9.5 결정 6**(평평화) · **§9.5 결정 7**(원격 마커) · **§9.5 결정 10**(규격으로 오른 성질
 * 셋 — 다중행 입력·컨트롤 잠금 요소·명시 `aria-live`). 원본은 2026-08-27과 2026-08-29의 독립
 * QA 둘이었고, **승격은 이동이지 복제가 아니다** — 원본에서 걷는 것은 같은 사이클의 뒤 작업이
 * 한다.
 *
 * **컨트롤 셋의 열거는 그 둘이 따로 들던 것을 이 파일에서 하나로 합쳤다** — `CONTROL_SET` 하나가
 * 문면 축(§9.4 결정 11)과 잠금 축(§9.5 결정 10)을 함께 지고, 그 상수의 주석이 `[미규정]` 표시를
 * 단독으로 든다. 둘로 두면 넷째 컨트롤이 서는 날 한쪽만 늘어난다.
 *
 * 옮기면서 **오늘 관측을 단정하던 자리를 존재·최소 성립으로 완화했다**(§9.5 결정 11의 규율 —
 * 관측 동결을 계약으로 올리지 않는다). 완화한 자리는 그 테스트의 주석이 이름으로 든다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로 있는
 * 부분 문자열이고, 문서를 지목하는 자리는 절 번호와 필드 이름으로 한다.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { ANCHOR_NAMES } from "../client/anchors.js";
import {
  ASSET_MANIFEST,
  type AssetEntry,
  type AssetManifest,
  AUTHORED_ASSET_ROOT,
  assetFilePath,
  assetRoot,
  GENERATED_ASSET_ROOT,
  isExemptFile,
  isHtmlDocumentEntry,
  MANIFEST_EXEMPTIONS,
  type ManifestExemption,
} from "../src/assets.ts";

// ---------------------------------------------------------------------------
// 갈래 — 모집단의 축
// ---------------------------------------------------------------------------

type AssetOrigin = AssetEntry["origin"];

/**
 * 도는 갈래 전부. `assetRoot`가 갈래마다 루트를 정하므로 이 열거가 곧 모집단의 축이다.
 *
 * 아래 타입이 이 열거를 판별자 유니온에 묶는다 — 갈래가 셋이 되는 날 여기가 먼저 컴파일
 * 에러가 된다. 손 열거로 두면 새 갈래의 루트가 조용히 모집단 밖에 남고, 그 미탐이 이 파일이
 * 막으려는 바로 그 형태다.
 */
const ORIGINS = ["generated", "authored"] as const;

type OriginsAreClosed = [Exclude<AssetOrigin, (typeof ORIGINS)[number]>] extends [never]
  ? true
  : never;
const _originsAreClosed: OriginsAreClosed = true;

// ---------------------------------------------------------------------------
// 대조 — 순수 함수 하나가 실물 런과 역검증을 함께 진다
// ---------------------------------------------------------------------------

/**
 * 한 갈래의 루트를 읽는 수단. 실물은 디스크이고 역검증은 메모리다.
 *
 * 순수 함수 하나에 둘을 다 물리는 이유는 역검증이 실물과 다른 코드를 재면 아무것도 못 잡기
 * 때문이다 — 심은 위반이 잡히는 것은 그 코드가 실물 런의 코드일 때만 뜻을 가진다.
 */
type AssetRootView = {
  /** 루트에 실재하는 파일. 하위 디렉터리는 `a/b` 꼴로 온다 */
  readonly files: readonly string[];
  /** 파일의 바이트. 루트에 없으면 `undefined` */
  readonly read: (file: string) => Uint8Array | undefined;
};

type RootViews = Readonly<Record<AssetOrigin, AssetRootView>>;

type Finding =
  /** 매니페스트 → 실물: 표가 든 파일이 자기 갈래의 루트에 없다 */
  | { readonly axis: "missing"; readonly origin: AssetOrigin; readonly file: string }
  /** 실물 → 매니페스트: 루트의 파일이 표에도 제외 목록에도 없다 */
  | { readonly axis: "unregistered"; readonly origin: AssetOrigin; readonly file: string }
  /** §9.2의 해시 대조. `generated`에만 걸린다 */
  | {
      readonly axis: "hash";
      readonly origin: "generated";
      readonly file: string;
      readonly expected: string;
      readonly actual: string;
    };

const sha256Hex = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/**
 * §9.1의 양방향 집합 동일성과 §9.2의 해시 대조를 함께 낸다. **양쪽 다 fail-closed다.**
 *
 * 등급을 매기지 않고 목록만 낸다 — 통과의 조건은 목록이 비는 것이다. 해시 축이
 * `generated`에만 걸리는 것은 §9.2의 판정 그대로이고, `authored`의 바이트는 이 함수가 아예
 * 읽지 않는다. 그 비대칭이 포맷 명령이 우리 소스를 고치는 것을 위반으로 만들지 않는 이유다.
 */
function auditManifest(
  manifest: AssetManifest,
  roots: RootViews,
  exempt: readonly ManifestExemption[],
): Finding[] {
  const findings: Finding[] = [];
  const entries = Object.entries(manifest);

  // 매니페스트 → 실물.
  for (const [, entry] of entries) {
    if (!roots[entry.origin].files.includes(entry.file))
      findings.push({ axis: "missing", origin: entry.origin, file: entry.file });
  }

  // 실물 → 매니페스트. 갈래마다 자기 디렉터리를 돈다(§9.1).
  for (const origin of ORIGINS) {
    const registered = new Set(
      entries.filter(([, entry]) => entry.origin === origin).map(([, entry]) => entry.file),
    );
    for (const file of roots[origin].files) {
      // **갈래를 함께 묻는다**(§9.2 — 2026-08-27). 이 루프가 갈래별인데 술어가 이름만 보면
      // 한 갈래에만 놓기로 한 이름이 다른 갈래에서도 조용히 빠져나간다.
      if (isExemptFile(exempt, origin, file)) continue;
      if (!registered.has(file)) findings.push({ axis: "unregistered", origin, file });
    }
  }

  // §9.2의 해시 대조. 파일이 없는 경우는 위 축이 이미 냈으므로 여기서 되풀이하지 않는다.
  for (const [, entry] of entries) {
    if (entry.origin !== "generated") continue;
    const bytes = roots.generated.read(entry.file);
    if (bytes === undefined) continue;
    const actual = sha256Hex(bytes);
    if (actual !== entry.sha256.toLowerCase())
      findings.push({
        axis: "hash",
        origin: "generated",
        file: entry.file,
        expected: entry.sha256.toLowerCase(),
        actual,
      });
  }

  return findings;
}

const only = (findings: readonly Finding[], axis: Finding["axis"]): Finding[] =>
  findings.filter((finding) => finding.axis === axis);

// ---------------------------------------------------------------------------
// 실물 — 디스크를 읽는다
// ---------------------------------------------------------------------------

/**
 * 갈래의 루트를 디스크에서 읽는다. **모두 동기다.**
 *
 * 이벤트 루프 회전으로 비동기 완료를 기다리는 형태를 안 쓴다 — 디스크 읽기는 스레드풀의
 * 벽시계를 쓰므로 그 형태는 단독 실행에서 그린이고 부하 걸린 전량 실행에서만 붉어진다
 * (2026-08-25 실측). 여기서는 기다릴 것 자체를 만들지 않는다.
 */
function diskRoot(origin: AssetOrigin): AssetRootView {
  const dir = assetRoot(origin);
  const files = readdirSync(dir, { recursive: true, encoding: "utf8" })
    .map((name) => name.split(sep).join("/"))
    .filter((name) => statSync(join(dir, name)).isFile())
    .sort();
  return {
    files,
    read: (file) =>
      files.includes(file) ? new Uint8Array(readFileSync(join(dir, file))) : undefined,
  };
}

const DISK: RootViews = { generated: diskRoot("generated"), authored: diskRoot("authored") };
const REAL = auditManifest(ASSET_MANIFEST, DISK, MANIFEST_EXEMPTIONS);

const manifestEntries = Object.values(ASSET_MANIFEST) as readonly AssetEntry[];
const entriesOf = (origin: AssetOrigin): readonly AssetEntry[] =>
  manifestEntries.filter((entry) => entry.origin === origin);

// ---------------------------------------------------------------------------
// 메모리 루트 — 역검증의 수단
// ---------------------------------------------------------------------------

function memoryRoot(files: Readonly<Record<string, Uint8Array>>): AssetRootView {
  const names = Object.keys(files).sort();
  return { files: names, read: (file) => files[file] };
}

const EMPTY_ROOT: AssetRootView = memoryRoot({});
const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text);

/** 포맷 명령이 하는 일 하나 — 들여쓰기 폭만 바꾼다. 바이트는 달라지고 뜻은 그대로다 */
function reformatted(bytes: Uint8Array): Uint8Array {
  return bytesOf(new TextDecoder().decode(bytes).replace(/^( +)/gm, "$1$1"));
}

const same = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length && left.every((byte, at) => byte === right[at]);

// ---------------------------------------------------------------------------
// §9.1 — 양방향 집합 동일성
// ---------------------------------------------------------------------------

describe("§9.1 양방향 집합 동일성 — 매니페스트와 실물", () => {
  test("모집단이 비어 있지 않다 — 빈 표의 조용한 그린을 통과로 읽지 않는다", () => {
    // `ARCHITECTURE.md` §2.6 가시적 결과. 아래 축이 전부 위반 목록형이라, 표가 비면 목록이
    // 비어 조용히 그린이 된다. 루트 쪽도 같은 이유로 함께 잰다.
    expect(manifestEntries.length, "매니페스트가 비었다").toBeGreaterThan(0);
    expect(
      DISK.generated.files.length + DISK.authored.files.length,
      "두 루트가 모두 비었다 — 검사가 죽었다",
    ).toBeGreaterThan(0);
    expect(ORIGINS.map((origin) => assetRoot(origin))).toEqual([
      GENERATED_ASSET_ROOT,
      AUTHORED_ASSET_ROOT,
    ]);
  });

  test("매니페스트 → 실물 — 모든 `file`이 자기 갈래의 루트에 실재한다", () => {
    expect(
      only(REAL, "missing").map((finding) => `${finding.origin}:${finding.file}`),
      "표가 들었는데 루트에 없는 파일",
    ).toEqual([]);
  });

  test("실물 → 매니페스트 — 루트의 모든 파일이 등재돼 있다", () => {
    // 오늘 이 단언은 그린이다. 한때 red였고 그것을 닫은 것은 정본의 개정이다 — §9.3이 놓으라
    // 한 `tsconfig.json`을 §9.1이 미등재로 읽던 자리이고, 근거와 처분은 이 파일 머리의
    // 「자산 아닌 파일의 자리」 절이 든다. 제외 목록의 정본은 `src/assets.ts`이지 이 파일이
    // 아니다.
    expect(
      only(REAL, "unregistered").map((finding) => `${finding.origin}:${finding.file}`),
      "루트에 있는데 매니페스트에도 제외 목록에도 없는 파일",
    ).toEqual([]);
  });

  test("역검증 — 매니페스트에 없는 파일을 루트에 심으면 떨어진다", () => {
    for (const origin of ORIGINS) {
      const rogue = memoryRoot({ "rogue.css": bytesOf("심은 파일\n") });
      const planted: RootViews =
        origin === "generated"
          ? { generated: rogue, authored: DISK.authored }
          : { generated: DISK.generated, authored: rogue };
      expect(
        only(auditManifest(ASSET_MANIFEST, planted, MANIFEST_EXEMPTIONS), "unregistered").map(
          (finding) => `${finding.origin}:${finding.file}`,
        ),
        `${origin} 루트에 심은 파일이 안 잡힌다`,
      ).toContain(`${origin}:rogue.css`);
    }
  });

  test("역검증 — 매니페스트에 있는데 파일이 없으면 떨어진다", () => {
    const emptied: RootViews = { generated: EMPTY_ROOT, authored: EMPTY_ROOT };
    expect(
      only(auditManifest(ASSET_MANIFEST, emptied, MANIFEST_EXEMPTIONS), "missing")
        .map((finding) => finding.file)
        .sort(),
      "표의 파일이 하나도 없는데 위반이 안 난다",
    ).toEqual(manifestEntries.map((entry) => entry.file).sort());
  });

  test("역검증 — 하위 디렉터리의 파일도 미등재로 잡힌다", () => {
    // §9.2가 `file`을 디렉터리 바로 아래의 파일명으로 닫았으므로 표는 `a/b`를 들 수 없다.
    // 그래서 하위 디렉터리에 놓인 것은 등재가 원리적으로 불가능하고, 이 축이 그것을 조용히
    // 넘기면 자산을 한 겹 아래에 두는 것이 검사를 피하는 길이 된다.
    const nested: RootViews = {
      generated: memoryRoot({ "vendor/app.css": bytesOf("body{}\n") }),
      authored: DISK.authored,
    };
    expect(
      only(auditManifest(ASSET_MANIFEST, nested, MANIFEST_EXEMPTIONS), "unregistered").map(
        (finding) => finding.file,
      ),
    ).toContain("vendor/app.css");
  });
});

// ---------------------------------------------------------------------------
// `.gitkeep` — 제외의 자리
// ---------------------------------------------------------------------------

describe("`.gitkeep` — 배치 수단이지 자산이 아니다", () => {
  test("`.gitkeep`이 실재하고 매니페스트에 없다", () => {
    expect(DISK.generated.files, "자산 루트의 자리를 잡는 파일이 없다").toContain(".gitkeep");
    expect(manifestEntries.map((entry) => entry.file)).not.toContain(".gitkeep");
  });

  test("`.gitkeep`이 위반으로 잡히지 않는다", () => {
    expect(only(REAL, "unregistered").filter((finding) => finding.file === ".gitkeep")).toEqual([]);
  });

  test("역검증 — 제외 목록에서 빼면 잡힌다", () => {
    // 위 단언이 제외 때문에 통과하는지, 아니면 축이 아예 안 도는지를 가른다. 제외를 지우면
    // 잡혀야 이 자리가 뜻을 가진다.
    expect(
      only(auditManifest(ASSET_MANIFEST, DISK, []), "unregistered").map((finding) => finding.file),
    ).toContain(".gitkeep");
    expect(MANIFEST_EXEMPTIONS, "제외의 정본은 `src/assets.ts`다").toContainEqual({
      origin: "generated",
      file: ".gitkeep",
    });
  });

  test("제외는 갈래에 묶인다 — 이름이 같아도 다른 갈래에서는 제외가 아니다", () => {
    // §9.2 2026-08-27 확정. 맨 이름 목록이던 시절 이 자리가 조용히 통과했고, 그 상태를
    // 독립 QA가 미규정으로 이름 붙여 두었다. 오늘은 판정이 섰으므로 축이 그 판정을 잰다.
    expect(isExemptFile(MANIFEST_EXEMPTIONS, "generated", ".gitkeep")).toBe(true);
    expect(isExemptFile(MANIFEST_EXEMPTIONS, "authored", ".gitkeep")).toBe(false);
    expect(isExemptFile(MANIFEST_EXEMPTIONS, "authored", "tsconfig.json")).toBe(true);
    expect(isExemptFile(MANIFEST_EXEMPTIONS, "generated", "tsconfig.json")).toBe(false);
  });

  test("역검증 — 갈래를 바꿔 놓은 같은 이름은 미등재로 잡힌다", () => {
    // 위 술어 단언이 목록의 값만 재고 검사에 안 닿는 상태와 구별한다. 두 갈래 각각에 상대의
    // 제외 이름을 심으면 둘 다 붉어야 한다 — 맨 이름 목록에서는 둘 다 조용했다.
    const planted: RootViews = {
      generated: memoryRoot({ "tsconfig.json": bytesOf("{}\n") }),
      authored: memoryRoot({ ".gitkeep": bytesOf("") }),
    };
    expect(
      only(auditManifest(ASSET_MANIFEST, planted, MANIFEST_EXEMPTIONS), "unregistered").map(
        (finding) => `${finding.origin}:${finding.file}`,
      ),
    ).toEqual(["generated:tsconfig.json", "authored:.gitkeep"]);
  });
});

// ---------------------------------------------------------------------------
// §9.2 — `sha256` 대조. 갈래 비대칭
// ---------------------------------------------------------------------------

describe("§9.2 `sha256` — `generated`에만 걸린다", () => {
  test("두 갈래 다 모집단이 비어 있지 않다 — 해시 축이 다시 공집합으로 돌아가지 않았다", () => {
    // **이 자리는 표지였고, 표지가 하라고 적어 둔 일을 한 뒤 방향을 뒤집어 남긴 것이다.**
    // 2026-08-27 반입이 옛 단언(`generated`가 0건)을 붉혔고, 그때 함께 고친 것은 이 수가
    // 아니라 이 파일 머리의 0건 서술이다. 표지를 지우면 그 자리의 축이 죽으므로 지우지
    // 않는다 — 묻는 것이 "아직 0건인가"에서 "다시 0건이 되지 않았는가"로 바뀐다.
    //
    // 뒤집은 방향이 옳은 이유: 아래 해시 축이 위반 **목록형**이라 `generated`가 다시 비면
    // 목록도 비어 조용히 그린이 된다(`ARCHITECTURE.md` §2.6). 반입물을 지우고 표에서
    // 걷어내는 변경이 전 축 그린으로 통과하는 것이 그 형태다.
    expect(
      entriesOf("generated").length,
      "`generated`가 0건 — 해시 축이 다시 공집합에서 참이 됐다",
    ).toBeGreaterThan(0);
    expect(entriesOf("authored").length, "표가 갈래 하나도 안 든다").toBeGreaterThan(0);
  });

  test("실물의 해시 대조에 위반이 없다", () => {
    expect(only(REAL, "hash")).toEqual([]);
  });

  test("`authored` 엔트리는 재생성 기록 세 필드를 안 든다", () => {
    // §9.2 — *"판별자가 그 차이를 값에서 가른다"*. 타입 층은 형제가 재고 여기서는 값을 잰다.
    for (const entry of entriesOf("authored")) {
      for (const field of ["prompt", "pulledAt", "sha256"]) {
        expect(Object.hasOwn(entry, field), `${entry.file}이 ${field}을 든다`).toBe(false);
      }
    }
  });

  test("역검증 — `generated` 파일 한 바이트를 고치면 떨어진다", () => {
    const bytes = bytesOf(":root {\n  --neo-green: #00ff41;\n}\n");
    const manifest: AssetManifest = {
      "/app.css": {
        origin: "generated",
        file: "app.css",
        contentType: "text/css; charset=utf-8",
        prompt: "tokens/color.css",
        pulledAt: "2026-08-25",
        sha256: sha256Hex(bytes),
      },
    };
    const intact: RootViews = { generated: memoryRoot({ "app.css": bytes }), authored: EMPTY_ROOT };
    expect(auditManifest(manifest, intact, []), "손 안 댄 표본이 이미 붉다").toEqual([]);

    const flipped = Uint8Array.from(bytes);
    flipped[0] = (flipped[0] ?? 0) ^ 0x01;
    expect(same(bytes, flipped), "변이가 바이트를 안 바꿨다").toBe(false);

    const tampered: RootViews = {
      generated: memoryRoot({ "app.css": flipped }),
      authored: EMPTY_ROOT,
    };
    expect(only(auditManifest(manifest, tampered, []), "hash")).toHaveLength(1);
  });

  test("역검증 — `authored` 파일을 포맷해도 떨어지지 않는다", () => {
    // 갈래 비대칭의 역검증이다. 같은 형태의 변경이 한 갈래에서는 위반이고 다른 갈래에서는
    // 아니어야 §9.2의 판정이 실물에 선다.
    const files: Record<string, Uint8Array> = {};
    let changed = 0;
    for (const file of DISK.authored.files) {
      const original = DISK.authored.read(file) ?? bytesOf("");
      const formatted = reformatted(original);
      if (!same(original, formatted)) changed += 1;
      files[file] = formatted;
    }
    expect(changed, "표본에 들여쓰기가 없어 변이가 공허하다").toBeGreaterThan(0);

    // **판정이 통째로 같아야 한다.** 위반 목록이 아니라 목록 전체를 대조하는 이유는, 다른
    // 축이 내고 있는 판정까지 포함해 포맷이 아무것도 안 바꾼다는 것을 재기 위해서다.
    const reformattedRoot: RootViews = { generated: DISK.generated, authored: memoryRoot(files) };
    expect(
      auditManifest(ASSET_MANIFEST, reformattedRoot, MANIFEST_EXEMPTIONS),
      "`authored` 갈래에 내용 축이 걸려 있다",
    ).toEqual(REAL);
  });
});

// ---------------------------------------------------------------------------
// §9.2·§9.3 — 포매터 제외의 비대칭
// ---------------------------------------------------------------------------

/** 레포 루트. `biome.json`과 두 자산 루트를 같은 기준으로 잰다 */
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

const workspacePath = (absolute: string): string =>
  relative(REPO_ROOT, absolute).split(sep).join("/").replace(/\/$/, "");

/** `!` 부정 패턴에서 글로브 꼬리를 벗겨 디렉터리 경로로 만든다 */
const negatedDirectory = (pattern: string): string | undefined =>
  pattern.startsWith("!")
    ? pattern
        .slice(1)
        .replace(/\/?\*+$/, "")
        .replace(/\/$/, "")
    : undefined;

describe("§9.2 포매터 제외 — 설정의 한 줄을 정본에 잇는다", () => {
  // §9.2가 *"포매터를 자산 디렉터리에서 뺀다."*를 계약으로 들었는데 설정의 그 한 줄을 정본에
  // 잇는 것이 아무것도 없어 누가 지워도 안 붉어진다. 근거를 주석으로 달 수 없다는 것이
  // 실측으로 확인됐으므로(엄격 JSON이라 `parse` 에러가 난다) 이 단언이 그 자리를 대신한다.
  const config: unknown = JSON.parse(readFileSync(join(REPO_ROOT, "biome.json"), "utf8"));
  const includes = (config as { files?: { includes?: readonly string[] } }).files?.includes ?? [];
  const excluded = new Set(
    includes.map(negatedDirectory).filter((entry): entry is string => entry !== undefined),
  );

  test("설정이 부정 패턴을 실제로 든다 — 빈 목록의 조용한 그린이 없다", () => {
    expect(includes.length, "`files.includes`가 비었다").toBeGreaterThan(0);
    expect(excluded.size, "부정 패턴이 하나도 없다 — 파서가 죽었다").toBeGreaterThan(0);
  });

  test("반입 자산 루트가 포매터 대상에서 빠져 있다", () => {
    // 안 빼면 포맷 명령이 반입 자산을 재작성해 위 해시 축이 깨진다 — §9가 금지한 손질을
    // 도구가 대신 하는 경로다.
    expect(excluded, "자산 루트가 제외되지 않았다").toContain(workspacePath(GENERATED_ASSET_ROOT));
  });

  test("우리 소스 루트는 빠져 있지 않다 — 이 비대칭이 §9.3 판정의 기계 판이다", () => {
    // §9.3 — 이 모듈은 파생물이 아니라 정본이라 포매터가 정상적으로 걸린다. 여기까지 빼면
    // 갈래를 가른 판정이 설정에서 지워진다.
    expect(excluded, "우리 소스 루트까지 제외됐다").not.toContain(
      workspacePath(AUTHORED_ASSET_ROOT),
    );
  });

  test("역검증 — 두 단언이 공허하지 않다", () => {
    // **설정 파일을 실제로 고쳐 재지 않는다.** 같은 트리를 도는 다른 검사가 그 창을 읽으므로,
    // 읽어 온 목록을 손에 들고 양쪽으로 흔든다.
    const setOf = (patterns: readonly string[]): Set<string> =>
      new Set(
        patterns.map(negatedDirectory).filter((entry): entry is string => entry !== undefined),
      );

    // 자산 제외 항을 지우면 위 단언이 선다.
    const erased = setOf(
      includes.filter(
        (pattern) => negatedDirectory(pattern) !== workspacePath(GENERATED_ASSET_ROOT),
      ),
    );
    expect(erased.size, "지운 항 말고 남는 부정 패턴이 없어 변이가 공허하다").toBeGreaterThan(0);
    expect(erased).not.toContain(workspacePath(GENERATED_ASSET_ROOT));

    // 우리 소스 루트를 빼는 항을 심으면 그것도 잡힌다 — 아래 부정 단언이 술어의 눈멀음으로
    // 통과하는 것이 아님을 보인다.
    const planted = setOf([...includes, `!${workspacePath(AUTHORED_ASSET_ROOT)}/**`]);
    expect(planted).toContain(workspacePath(AUTHORED_ASSET_ROOT));
  });

  test("경로를 손으로 적지 않는다 — 루트 상수에서 나온다", () => {
    // 개명이 이 단언을 조용히 통과시키지 못하게 하는 자리다. 위 둘이 비교하는 문자열은
    // `src/assets.ts`의 루트 상수에서 파생되므로, 디렉터리가 바뀌면 설정과 함께 붉어진다.
    expect(workspacePath(GENERATED_ASSET_ROOT)).toBe("packages/serve/assets");
    expect(workspacePath(AUTHORED_ASSET_ROOT)).toBe("packages/serve/client");
    expect(negatedDirectory("packages/serve/assets/**")).toBeUndefined();
    expect(negatedDirectory("!packages/serve/assets/**")).toBe("packages/serve/assets");
    expect(negatedDirectory("!packages/serve/assets")).toBe("packages/serve/assets");
  });
});

// ---------------------------------------------------------------------------
// §9.4 결정 12 — 매니페스트의 형태. `authored` HTML 문서를 두지 않는다
// ---------------------------------------------------------------------------

/**
 * 결정 12가 금지한 조합 둘. **등급을 매기지 않고 목록만 낸다** — 통과의 조건은 목록이 비는
 * 것이다. 위 `Finding`과 갈래를 합치지 않는 이유는 모집단이 다르기 때문이다: 저쪽은 표와
 * 디스크를 대조하고 이쪽은 표만 본다.
 */
type ShapeFinding =
  /** 판별자가 `authored`인데 미디어 타입이 HTML 문서다 — 결정 8의 대조를 통째로 빠져나간다 */
  | {
      readonly axis: "authored-document";
      readonly route: string;
      readonly contentType: string;
    }
  /** `generated` HTML 문서가 둘 이상이다 — 결정 1의 트리거가 발동했다는 뜻이다 */
  | { readonly axis: "screen-count"; readonly routes: readonly string[] };

/**
 * §9.4 결정 12의 전수 감사. **입력은 매니페스트 하나이고 디스크를 안 읽는다.**
 *
 * 모듈 상수를 직접 읽지 않는 근거는 위 `auditManifest`와 같다 — 상수를 안에서 읽으면 주입
 * 경로가 없어져 역검증이 실물과 다른 코드를 재게 되고, 그때 심은 위반이 잡히는 것은 아무
 * 뜻도 없다. 실물 런은 아래에서 `ASSET_MANIFEST`를 **인자로** 넘겨 돈다. 그래서 표에 엔트리가
 * 느는 것이 이 함수의 형태를 안 건드린다.
 *
 * 문서 판별은 `src/assets.ts`의 술어 하나다. 미디어 타입의 대소문자도 그 술어가 흡수하므로
 * 여기서 다시 소문자로 내리지 않는다 — 내리면 판별이 두 자리에 생긴다.
 */
function auditManifestShape(manifest: AssetManifest): ShapeFinding[] {
  const findings: ShapeFinding[] = [];
  const documents = Object.entries(manifest).filter(([, entry]) => isHtmlDocumentEntry(entry));

  for (const [route, entry] of documents) {
    if (entry.origin === "authored")
      findings.push({ axis: "authored-document", route, contentType: entry.contentType });
  }

  const screens = documents
    .filter(([, entry]) => entry.origin === "generated")
    .map(([route]) => route)
    .sort();
  if (screens.length > 1) findings.push({ axis: "screen-count", routes: screens });

  return findings;
}

/**
 * 위반이 든 **자리**를 꺼낸다. `filter`가 아니라 `flatMap`인 것은 갈래를 좁히기 위해서다 —
 * 좁히지 않으면 `route`·`routes`에 닿을 수 없다.
 */
const authoredDocuments = (findings: readonly ShapeFinding[]): string[] =>
  findings.flatMap((finding) => (finding.axis === "authored-document" ? [finding.route] : []));

const screenLists = (findings: readonly ShapeFinding[]): string[][] =>
  findings.flatMap((finding) => (finding.axis === "screen-count" ? [[...finding.routes]] : []));

const SHAPE = auditManifestShape(ASSET_MANIFEST);

/** HTML 문서 엔트리 하나. 갈래만 다르고 미디어 타입은 같다 */
const authoredDocument = (file: string, contentType = "text/html; charset=utf-8"): AssetEntry => ({
  origin: "authored",
  file,
  contentType,
});

/**
 * **`prompt`는 산출 파일 이름에서 조립하지 않는다.** 한때 이 자리가
 * `` `ui_kits/console/${file}.prompt.md` ``였고, 그것은 §9.5 결정 1이 명시로 기각한 갈래를
 * 픽스처가 실물로 든 것이었다 — *"프롬프트는 킷 하나에 하나다 — 산출 파일마다 두지 않는다"*.
 * 값은 매니페스트가 든 실물과 같은 표기를 쓴다(킷 이름을 base로 하는 소문자).
 */
const KIT_PROMPT = "ui_kits/console/console.prompt.md";

const generatedDocument = (file: string): AssetEntry => ({
  origin: "generated",
  file,
  contentType: "text/html; charset=utf-8",
  prompt: KIT_PROMPT,
  pulledAt: "2026-08-27",
  sha256: sha256Hex(bytesOf(file)),
});

describe("§9.4 결정 12 — 매니페스트의 형태", () => {
  test("실물에 위반이 0건이다 — `authored` 엔트리가 전부 자바스크립트다", () => {
    expect(SHAPE, "매니페스트가 결정 12를 어긴다").toEqual([]);
  });

  test("HTML 문서 엔트리가 화면 하나다 — 위 축이 공집합에서 돌지 않는다", () => {
    // **이 자리도 표지였다.** 옛 단언은 "HTML 문서 엔트리 0건"이었고 화면이 반입되는 날
    // 붉으라고 놓인 것이었다. 2026-08-27에 실제로 붉었고, 그때 고친 것은 이 수가 아니라 이
    // 파일 머리의 0건 서술이다. 지우지 않고 방향을 뒤집어 남긴다.
    //
    // **재는 것은 아래쪽 경계다.** 결정 12의 *"`generated` HTML 문서는 많아야 하나다"*는
    // 위쪽 상한이고 그것은 위 `SHAPE` 축이 잰다. 여기서 묻는 것은 그 모집단이 실제로 차
    // 있는가이고, 근거는 §9.4 결정 1(*"화면은 하나다."*)과 결정 5가 그 키를 `/`로 못박은
    // 것이다. 화면이 사라지면 위 목록형 축 둘도, 결정 8의 앵커 대조도, 결정 9의 CSP도
    // 함께 조용한 그린으로 돌아간다(`ARCHITECTURE.md` §2.6).
    //
    // 갈래를 함께 재는 이유는 결정 12의 첫째 갈래가 "`authored`이면서 HTML 문서"이기
    // 때문이다 — 화면 하나가 `authored`로 적혔어도 개수 단언만으로는 그린이다.
    const documents = manifestEntries.filter((entry) => isHtmlDocumentEntry(entry));
    expect(
      documents.map((entry) => `${entry.origin}:${entry.file}`),
      "HTML 문서 엔트리가 `generated` 화면 하나가 아니다",
    ).toEqual(["generated:index.html"]);
    expect(manifestEntries.length, "표가 비었다 — 감사가 죽었다").toBeGreaterThan(0);
    expect(
      entriesOf("authored").length,
      "표가 `authored`를 하나도 안 든다 — 첫째 갈래의 모집단이 없다",
    ).toBeGreaterThan(0);
  });

  test("역검증 — `authored` HTML 문서를 심으면 그 자리를 이름으로 든다", () => {
    const planted: AssetManifest = {
      ...ASSET_MANIFEST,
      "/console.html": authoredDocument("console.html"),
    };
    expect(
      authoredDocuments(auditManifestShape(planted)),
      "심은 조합이 안 잡힌다 — 결정 12의 첫째 갈래가 죽었다",
    ).toEqual(["/console.html"]);
    // 심은 것 말고는 아무것도 안 붉는다 — 위 실물 축이 그린인 것이 이 축의 눈멀음이 아니다.
    expect(screenLists(auditManifestShape(planted))).toEqual([]);
  });

  test("역검증 — 대소문자만 다른 미디어 타입도 잡힌다", () => {
    // 2026-08-26 독립 QA의 V-1이 연 방향이다. 매니페스트의 대소문자 하나가 결정 8과 결정 9를
    // 동시에 비웠고, 그 술어를 공유하므로 이 축도 같은 방향으로 눈이 멀 수 있다.
    const planted: AssetManifest = {
      ...ASSET_MANIFEST,
      "/console.html": authoredDocument("console.html", "TEXT/HTML; charset=utf-8"),
    };
    expect(
      authoredDocuments(auditManifestShape(planted)),
      "대소문자만 다른 표기가 빠져나간다",
    ).toEqual(["/console.html"]);
  });

  test("역검증 — `generated` HTML 문서 둘을 심으면 둘 다 이름으로 든다", () => {
    const one: AssetManifest = { "/": generatedDocument("index.html") };
    expect(
      auditManifestShape(one),
      "화면 하나가 이미 붉다 — 상한이 하나가 아니라 0이 됐다",
    ).toEqual([]);

    const two: AssetManifest = { ...one, "/second.html": generatedDocument("second.html") };
    expect(
      screenLists(auditManifestShape(two)),
      "둘째 화면이 안 잡힌다 — 결정 1의 트리거가 사람의 눈에 맡겨진다",
    ).toEqual([["/", "/second.html"]]);
    expect(authoredDocuments(auditManifestShape(two))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §9.4 결정 5 — 한 파일을 키 둘이 열지 않는다. **짝을 한정하지 않는 일반형**
// ---------------------------------------------------------------------------

/**
 * 두 키가 같은 파일을 여는 자리. **비어야 통과다.**
 *
 * 결정 5가 이 금지를 든 근거는 §9.1의 «양방향»이다 — *"키 둘이 한 파일을 열면 §9.1의 집합
 * 동일성이 파일 쪽에서 1:N이 되고, 그 비대칭이 검사의 「양방향」을 반쪽으로 만든다."* 위
 * §9.1 축이 재는 것은 **등재 여부**(빠진 파일 · 미등재 파일)뿐이라 1:N을 그린으로 통과시킨다:
 * 두 키가 한 파일을 열어도 그 파일은 등재돼 있고 표의 모든 `file`이 실재한다.
 *
 * **형제가 재는 것은 그 짝 하나다.** `assets.serving.contract.test.ts`가 `/`↔`/index.html`을
 * 200/404로 갈라 결정 5의 비대칭을 든다. 그것은 **오늘 실재하는 위험 하나**의 축이고, 결정 5의
 * 문면은 짝을 한정하지 않는다. 여기서 재는 것이 그 일반형이다 — 임의의 두 키가 대상이다.
 *
 * **동일성의 단위는 디스크 경로다.** 갈래가 루트를 가르므로(§9.2) 같은 `file` 이름이라도 갈래가
 * 다르면 다른 파일이고, 그 해소를 서빙이 쓰는 술어(`assetFilePath`)로 한다 — 여기서 경로를 다시
 * 조립하면 서빙이 여는 파일과 이 축이 세는 파일이 갈릴 수 있다.
 */
function duplicateTargets(manifest: AssetManifest): { file: string; routes: string[] }[] {
  const byFile = new Map<string, string[]>();
  for (const [route, entry] of Object.entries(manifest)) {
    const path = assetFilePath(entry);
    byFile.set(path, [...(byFile.get(path) ?? []), route]);
  }
  return [...byFile.entries()]
    .filter(([, routes]) => routes.length > 1)
    .map(([file, routes]) => ({ file: workspacePath(file), routes: [...routes].sort() }))
    .sort((left, right) => left.file.localeCompare(right.file));
}

describe("§9.4 결정 5 — 한 파일을 두 키가 열지 않는다 (일반형)", () => {
  test("실물에 1:N이 0건이다", () => {
    expect(duplicateTargets(ASSET_MANIFEST), "한 파일을 키 둘이 연다").toEqual([]);
  });

  test("모집단이 비어 있지 않다 — 빈 표의 조용한 그린을 통과로 읽지 않는다", () => {
    expect(Object.keys(ASSET_MANIFEST).length, "표가 비었다 — 이 축이 죽었다").toBeGreaterThan(1);
  });

  test("역검증 — 같은 파일을 여는 둘째 키를 심으면 그 파일과 키 둘을 이름으로 든다", () => {
    // 형제 축이 든 짝을 그대로 심는다 — 그 축이 없어도 이 일반형이 같은 위반을 잡는가.
    const planted: AssetManifest = { ...ASSET_MANIFEST, "/index.html": ASSET_MANIFEST["/"] };
    expect(duplicateTargets(planted), "심은 1:N이 안 잡힌다").toEqual([
      { file: "packages/serve/assets/index.html", routes: ["/", "/index.html"] },
    ]);
  });

  test("역검증 — 형제 축이 안 든 짝도 잡는다. 이 축의 값이 거기 있다", () => {
    // `/`↔`/index.html`이 아닌 임의의 짝. 형제 축은 이것을 그대로 통과시킨다.
    const planted: AssetManifest = {
      ...ASSET_MANIFEST,
      "/client/funnel.js": ASSET_MANIFEST["/client/wiring.js"],
    };
    expect(duplicateTargets(planted), "짝을 한정하지 않는 일반형이 아니다").toEqual([
      {
        file: "packages/serve/client/wiring.js",
        routes: ["/client/funnel.js", "/client/wiring.js"],
      },
    ]);
  });

  test("역검증 — 갈래가 다르면 같은 `file` 이름이라도 다른 파일이다", () => {
    // 루트가 갈리므로(§9.2) 이름이 같아도 1:N이 아니다. 술어가 이름만 보면 여기서 거짓 양성이
    // 나고, 그 순간 이 축이 정상 배치를 위반이라 부른다.
    const planted: AssetManifest = {
      "/a.css": {
        origin: "generated",
        file: "same.js",
        contentType: "text/css",
        prompt: "p",
        pulledAt: "2026-08-27",
        sha256: "0".repeat(64),
      },
      "/b.js": { origin: "authored", file: "same.js", contentType: "text/javascript" },
    };
    expect(duplicateTargets(planted), "갈래가 다른 동명 파일을 1:N으로 읽었다").toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §9.5 결정 1 — 한 킷이 낸 `generated` 엔트리들이 같은 `prompt`를 든다
// ---------------------------------------------------------------------------

/**
 * `generated` 엔트리가 든 `prompt` 값 전부. **중복을 접지 않고 그대로 낸다** — 접으면 아래
 * 축이 모집단 크기를 못 잰다.
 */
const generatedPrompts = (manifest: AssetManifest): readonly string[] =>
  Object.values(manifest).flatMap((entry) => (entry.origin === "generated" ? [entry.prompt] : []));

describe("§9.5 결정 1 — 프롬프트는 킷 하나에 하나", () => {
  test("`generated` 엔트리 전부가 같은 `prompt`를 든다", () => {
    // 결정 1이 든 것은 *"킷이 내는 것은 화면과 평평해진 토큰 파일 둘이고, 매니페스트의 두
    // `generated` 엔트리가 같은 `prompt` 값을 든다."*이고, `src/assets.ts`가 화면 엔트리의
    // 주석에 그것을 계약이라 적는다. 가르면 평평화 규격이 어느 쪽에 사는지가 새 물음이 되고
    // 화면과 토큰의 규격이 따로 낡는다.
    //
    // **모집단의 한계를 함께 적는다.** 이 축은 「`generated` 전부」를 「한 킷」과 같은 것으로
    // 읽는다. 그 동일시가 서는 근거는 §9.4 결정 1(화면은 하나)과 결정 12(`generated` HTML
    // 문서는 많아야 하나)이고, 둘 다 위 축들이 잰다. 화면이 둘째를 얻는 날 킷도 둘이 되므로
    // 이 축은 그때 **결정 1의 트리거와 함께 열린다** — 그 순간 여기서 재야 하는 것은 「전부가
    // 한 값」이 아니라 「킷마다 한 값」이고, 킷의 경계를 매니페스트가 오늘 안 든다.
    const prompts = generatedPrompts(ASSET_MANIFEST);
    expect(prompts.length, "`generated` 엔트리가 없다 — 이 축이 공집합에서 돈다").toBeGreaterThan(
      1,
    );
    expect(new Set(prompts).size, "한 킷의 산출이 프롬프트를 둘 이상 든다").toBe(1);
  });

  test("그 값이 비어 있지 않다 — 빈 문자열의 조용한 일치가 아니다", () => {
    for (const prompt of generatedPrompts(ASSET_MANIFEST)) {
      expect(prompt.length, "`prompt`가 비었다").toBeGreaterThan(0);
    }
  });

  test("역검증 — 한 엔트리의 `prompt`를 갈라 놓으면 집합의 크기가 2가 된다", () => {
    const planted = generatedPrompts({
      ...ASSET_MANIFEST,
      "/tokens.css": { ...ASSET_MANIFEST["/tokens.css"], prompt: "ui_kits/other/other.prompt.md" },
    });
    expect(new Set(planted).size, "갈라 놓은 값이 안 잡힌다").toBe(2);
  });
});

// ---------------------------------------------------------------------------
// §9.5 결정 4 — 화면의 스크립트 진입점이 정확히 하나다
// ---------------------------------------------------------------------------

/**
 * 화면 원문에서 **실행되는** `<script>` 여는 태그를 센다.
 *
 * 결정 4가 그 수를 계약으로 든 근거는 층이다 — *"진입점이 둘이면 로드 순서가 화면의 성질이
 * 되고, §9.3이 배선에 준 소유가 그만큼 화면으로 샌다."* 같은 항이 세는 대상도 못박았다:
 * *"진입점은 실행되는 스크립트다"* — 비실행 `type`의 데이터 블록은 로드 순서에 기여하지
 * 않으므로 이 수에 안 든다. 그래서 아래 술어가 `type`을 보고 갈래를 가른다.
 *
 * **이 술어가 재지 못하는 것을 적는다 — 이것은 원문의 부분 문자열 매칭이지 HTML 파싱이
 * 아니다.** §9.4 결정 8이 자기 대조에 대해 적은 한계와 같은 부류다(*"그 대조는 부분 문자열이라
 * 주석이나 문자열 안의 표기도 존재로 읽으므로"*). 구체적으로 셋이 안 잡힌다 — ① 주석
 * (`<!-- … -->`)이나 다른 요소의 텍스트 안에 적힌 `<script` 표기를 실물로 읽는다 ② 반대로
 * 스크립트를 **런타임에 만들어 붙이는** 코드(`document.createElement("script")`)는 원문에
 * 태그가 없으므로 0으로 센다 ③ `type` 값이 따옴표 없이 적히거나 대소문자가 섞인 변형은 아래
 * 정규식의 외연 밖이다. **안 적으면 `WEB-UI.md` §2.3이 이름 붙인 형태**(검사가 실제보다 넓게
 * 주장하는 것)**가 된다.** 그럼에도 이 축이 서는 근거는 방향이다: 결정 4가 요구하는 것은
 * «정확히 하나»라 **0이어도 붉으므로**, 못 보는 자리가 위반을 침묵으로 만드는 것이 아니라
 * 대개 이 축을 붉히는 쪽으로 넘어진다.
 *
 * 실행 갈래의 판별은 HTML의 규칙 그대로다 — `type`이 없거나, 비었거나, `module`이거나,
 * 자바스크립트 미디어 타입이면 실행된다. 그 밖(`application/json`·`importmap` 등)은 데이터다.
 */
const EXECUTABLE_SCRIPT_TYPES = ["", "module", "text/javascript", "application/javascript"];

function executableScriptTags(html: string): readonly string[] {
  const tags: string[] = [];
  for (const match of html.matchAll(/<script\b[^>]*>/gi)) {
    const tag = match[0];
    const type = /\btype\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1]?.trim().toLowerCase();
    if (type === undefined || EXECUTABLE_SCRIPT_TYPES.includes(type.split(";")[0]?.trim() ?? ""))
      tags.push(tag);
  }
  return tags;
}

/** 화면 원문. `generated` HTML 문서가 이 하나라는 것은 위 결정 12 축이 이미 잰다 */
const screenSource = (): string =>
  readFileSync(join(assetRoot("generated"), ASSET_MANIFEST["/"].file), "utf8");

describe("§9.5 결정 4 — 화면의 스크립트 진입점", () => {
  test("실행되는 `<script>`가 정확히 하나다", () => {
    expect(
      executableScriptTags(screenSource()),
      "화면의 스크립트 진입점이 하나가 아니다",
    ).toHaveLength(1);
  });

  test("그 하나가 매니페스트 키를 연다 — 진입점이 표 밖을 가리키지 않는다", () => {
    // 결정 4의 앞엣것(*"화면이 여는 참조는 반입 시점에 매니페스트가 든 키뿐이고"*)이 이
    // 태그에 대해 서는가. 키 자체의 값은 세부이므로(같은 항) 리터럴을 여기 적지 않고 표에서
    // 받는다.
    const [tag] = executableScriptTags(screenSource());
    const src = /\bsrc\s*=\s*["']([^"']*)["']/i.exec(tag ?? "")?.[1];
    expect(src, "진입점이 `src`를 안 든다").toBeDefined();
    expect(Object.keys(ASSET_MANIFEST), "진입점이 매니페스트 키가 아니다").toContain(src);
  });

  test("역검증 — 둘째 실행 스크립트를 심으면 잡힌다", () => {
    const planted = screenSource().replace(
      "</body>",
      '<script type="module" src="/client/second.js"></script></body>',
    );
    expect(executableScriptTags(planted), "심은 둘째 진입점이 안 잡힌다").toHaveLength(2);
  });

  test("역검증 — 0건도 붉는다. 방향이 「많아야 하나」가 아니라 「정확히 하나」다", () => {
    const stripped = screenSource().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
    expect(executableScriptTags(stripped), "진입점을 걷었는데 이 축이 그린이다").toHaveLength(0);
  });

  test("역검증 — 비실행 `type`의 데이터 블록은 이 수에 안 든다", () => {
    // 결정 4가 *"진입점은 실행되는 스크립트다"*로 명시한 자리다. 데이터 블록을 세면 화면이
    // 정당한 형태를 쓰는 날 이 축이 거짓 양성을 낸다.
    const planted = screenSource().replace(
      "</body>",
      '<script type="application/json" id="x">{}</script>' +
        '<script type="importmap">{"imports":{}}</script></body>',
    );
    expect(executableScriptTags(planted), "데이터 블록이 진입점으로 세어졌다").toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// §9.6 결정 15 승격 — 화면 원문을 읽는 축들. §9.4 결정 4 · 5(인라인 금지) · 11 (2026-09-02)
// ---------------------------------------------------------------------------

/**
 * 아래 셋은 2026-08-27 독립 QA(`qa-20260827-asset-import.independent.test.ts`)의 축 1·축 2 일부·
 * 축 3-b였고, §9.6 결정 15가 *존재·전수* 부류를 계약으로 올리기로 판정하면서 여기로 왔다.
 * **승격은 이동이지 복제가 아니다** — 원본에서 걷는 것은 같은 사이클의 뒤 작업이 한다.
 *
 * **기대값의 출처는 정본이다.** 아래 술어와 수는 전부 §9.4 결정 4·5·11과 §9.6 결정 2의 문면에서
 * 나왔고, 옮기면서 **오늘 관측을 단정하던 두 자리를 존재·최소 성립으로 완화했다**(§9.5 결정 11의
 * 규율 — 관측 동결을 계약으로 올리지 않는다). 완화한 자리는 그 테스트의 주석이 이름으로 든다.
 *
 * **이 축들이 재지 못하는 것 — 원문 훑기의 한계를 물려받는다.**
 *
 * 1. **부분 문자열·정규식 대조라 HTML 파싱이 아니다.** §9.4 결정 8이 자기 대조에 대해 적은
 *    한계와 같은 부류다(*"그 대조는 부분 문자열이라 주석이나 문자열 안의 표기도 존재로 읽으므로"*).
 * 2. **정적 대조라 브라우저를 대신하지 않는다.** 앵커·컨트롤의 자리가 옳은가는 루트 `MILESTONE.md`의
 *    C2가 진다.
 * 3. **`opensOutsideRepo`가 스킴을 열거한다 — 정본과 어긋나는 자리다.** 결정 4-③ⓐ는
 *    *"①의 판별은 스킴 목록이 아니라 네트워크로 나가는가다 — 스킴을 열거하면 손으로 유지되는
 *    목록이 된다"*로 술어의 형태를 직접 정했는데, 아래 술어는 원본 QA가 쓰던 스킴 목록 그대로다.
 *    **[미규정 아님 — 승격이 물려받은 결함이다]** 이 사이클은 이관만 하므로 술어를 다시 짜지
 *    않고 그 사실을 여기 적는다. 오늘 이것이 무엇을 흘리는지는 좁다 — `data:`·`blob:`·`mailto:`가
 *    목록 밖이라 ① 축을 안 붉히지만, ③ 축(모든 참조가 매니페스트 키다)이 전수로 그 셋을 붉힌다.
 */

/** HTML 주석을 지운다 — 주석 안의 표기를 실물로 읽지 않게 */
const stripHtmlComments = (html: string): string => html.replace(/<!--[\s\S]*?-->/g, "");

/** CSS 주석을 지운다 */
const stripCssComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** `<style>` 블록의 본문 전부 */
function styleBlocks(html: string): string[] {
  return [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1] ?? "");
}

type HtmlAttribute = { readonly name: string; readonly value: string };

/** 겹따옴표로 닫힌 속성 전부. 표기를 하나로 닫는 것은 §9.4 결정 8의 규율과 같다 */
function htmlAttributes(html: string): HtmlAttribute[] {
  return [...html.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"/g)].map((m) => ({
    name: (m[1] ?? "").toLowerCase(),
    value: m[2] ?? "",
  }));
}

/**
 * §9.4 결정 4-③ⓒ의 모집단 — *"브라우저가 로드하는 참조와 **이동 링크(`<a href>`)가 함께 들고**,
 * 프래그먼트 전용(`#…`)은 밖이다"*. `for`·`aria-labelledby` 같은 문서 안 지목은 여기 없다.
 *
 * **`action`·`formaction`이 빠져 있는 것이 계약이다** (2026-08-30 판정 · 승격하며 정정). 원본 QA는
 * 2026-08-27자라 그 둘을 목록에 들고 있었는데, 결정 4-③ⓒ가 뒤에 *"제출(`<form action>`·
 * `formaction`)은 이 모집단에 넣지 않는다"*로 그것을 명시로 뺐다 — *"같은 능력의 철자가 둘이라
 * 열거가 손 목록이 되고, 그 부류는 결정 9의 `form-action 'none'`이 능력 쪽에서 통째로 닫는다."*
 * 계약 테스트는 구현이 아니라 정본에서 기대값을 받으므로 여기서는 정본 쪽을 따른다. 오늘 판정은
 * 안 갈린다 — 화면의 `<form`·`formaction` 표기가 0건이다.
 */
const RESOURCE_ATTRIBUTES = new Set([
  "href",
  "src",
  "srcset",
  "poster",
  "data",
  "cite",
  "background",
  "manifest",
  "ping",
  "xlink:href",
]);

/** CSS가 여는 참조 — `url(...)`과 `@import`의 문자열 형태 둘 다 */
function cssReferences(css: string): string[] {
  const source = stripCssComments(css);
  const found: string[] = [];
  for (const m of source.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi))
    found.push((m[2] ?? "").trim());
  for (const m of source.matchAll(/@import\s+(['"])([^'"]*)\1/gi)) found.push((m[2] ?? "").trim());
  return found;
}

/** 화면이 여는 참조 전부 — 속성과 CSS `url()`·`@import` 둘 다 */
function references(html: string): string[] {
  const source = stripHtmlComments(html);
  const found: string[] = [];
  for (const attribute of htmlAttributes(source)) {
    if (!RESOURCE_ATTRIBUTES.has(attribute.name)) continue;
    for (const candidate of attribute.value.split(",")) {
      const url = candidate.trim().split(/\s+/)[0] ?? "";
      if (url !== "") found.push(url);
    }
  }
  for (const block of styleBlocks(source)) found.push(...cssReferences(block));
  return found;
}

/** 레포 밖을 여는 참조인가 — 위 3번이 이 술어의 한계를 든다 */
function opensOutsideRepo(reference: string): boolean {
  return /^(?:https?|ftps?|wss?):/i.test(reference) || reference.startsWith("//");
}

/** 문서 안 지목(조각)인가 — 로드가 아니라 같은 문서의 자리다 */
const isFragmentOnly = (reference: string): boolean => reference.startsWith("#");

const manifestKeys = (): ReadonlySet<string> => new Set(Object.keys(ASSET_MANIFEST));

/**
 * `generated`이면서 HTML 문서가 **아닌** 엔트리 — 평평해진 토큰이다(§9.4 결정 5).
 *
 * **키를 리터럴로 안 적고 표에서 받는다.** 그것이 하나라는 것은 결정 5가 `generated` 키를 둘로
 * 닫고 위 결정 12 축이 그중 HTML 문서를 하나로 잰 결과다. 하나가 아니면 여기서 던진다 — 조용히
 * 첫째를 고르면 이 아래 축들이 어느 파일을 재는지가 소리 없이 갈린다(`ARCHITECTURE.md` §2.6).
 */
function tokensPair(): readonly [string, AssetEntry] {
  const found = (
    Object.entries(ASSET_MANIFEST) as ReadonlyArray<readonly [string, AssetEntry]>
  ).filter(([, entry]) => entry.origin === "generated" && !isHtmlDocumentEntry(entry));
  const first = found[0];
  if (found.length !== 1 || first === undefined)
    throw new Error("`generated` 비-문서 엔트리가 하나가 아니다 — §9.4 결정 5가 닫은 둘이 아니다.");
  return first;
}

const tokensKey = (): string => tokensPair()[0];
const tokensSource = (): string => readFileSync(assetFilePath(tokensPair()[1]), "utf8");

/**
 * 화면의 실행 스크립트 진입점이 여는 키. **리터럴을 안 적는다** — 위 §9.5 결정 4 축이 쓴 것과
 * 같은 규율이고(*"키 자체의 값은 세부이므로 리터럴을 여기 적지 않고 표에서 받는다"*), 그 축이
 * 진입점의 수와 `src`의 실재를 이미 전수로 잰다.
 */
function entryPointReference(): string {
  const [tag] = executableScriptTags(screenSource());
  const src = /\bsrc\s*=\s*["']([^"']*)["']/i.exec(tag ?? "")?.[1];
  if (src === undefined)
    throw new Error("화면의 실행 진입점이 `src`를 안 든다 — §9.5 결정 4 축이 먼저 붉는다.");
  return src;
}

describe("§9.4 결정 4 — 반입물은 평면이고 자기완결이다", () => {
  test("모집단이 공집합이 아니다 — 화면 원문과 토큰 원문이 둘 다 비어 있지 않다", () => {
    expect(screenSource().length, "화면 원문이 비었다").toBeGreaterThan(0);
    expect(tokensSource().length, "토큰 원문이 비었다").toBeGreaterThan(0);
  });

  test("모집단이 공집합이 아니다 — 화면이 실제로 참조를 연다", () => {
    // 이 가드가 없으면 아래 ①·③ 축이 참조 0건짜리 화면에서 공허하게 그린이 된다.
    expect(references(screenSource()).length, "화면이 참조를 하나도 안 연다").toBeGreaterThan(0);
  });

  test("① 화면이 레포 밖을 안 연다 — CDN·원격 호스트 0건", () => {
    expect(references(screenSource()).filter(opensOutsideRepo), "화면이 레포 밖을 연다").toEqual(
      [],
    );
  });

  test("① 토큰이 레포 밖을 안 연다 — `@import`도 `url()`도 0건", () => {
    expect(cssReferences(tokensSource()).filter(opensOutsideRepo), "토큰이 레포 밖을 연다").toEqual(
      [],
    );
  });

  test("③ 화면이 여는 **모든** 참조가 매니페스트 키의 정확 일치다", () => {
    const opened = references(screenSource()).filter((r) => !isFragmentOnly(r));
    const keys = manifestKeys();
    expect(
      opened.length,
      "프래그먼트 아닌 참조가 0건이다 — 이 축이 공집합에서 돈다",
    ).toBeGreaterThan(0);
    expect(
      opened.filter((r) => !keys.has(r)),
      "화면이 표 밖의 참조를 연다",
    ).toEqual([]);
  });

  test("③ 화면이 토큰 키와 스크립트 진입점을 둘 다 연다", () => {
    // **완화 (2026-09-02 승격)** — 원본 QA는 `toEqual([tokensKey, "/client/main.js"])`로 개수와
    // 이름을 함께 박았다. 그 「둘」은 정본이 닫은 수가 아니라 오늘 관측이다: 결정 5가 닫은 것은
    // `generated` 키이고, 같은 항이 `authored` 집합에 대해 *"그날의 실물이지 닫힌 열거가
    // 아니다"*라 적었으므로 화면이 정당하게 셋째 키를 여는 날이 온다. 진입점의 이름도 §9.5
    // 결정 4가 세부로 남긴 값이다. 그래서 여기서 재는 것은 **존재**이고, 「표 밖을 안 연다」는
    // 바로 위 ③ 축이 전수로 진다.
    const opened = references(screenSource());
    expect(opened, "화면이 토큰을 참조로 안 연다").toContain(tokensKey());
    expect(opened, "화면이 스크립트 진입점을 안 연다").toContain(entryPointReference());
  });

  /**
   * **[문서 부정확 — 처분 대기]** §9.4 결정 4-②의 문면은 *"상위·하위 디렉터리를 참조하지
   * 않는다"*인데, §9.5 결정 4가 화면에 `/client/<진입점>.js`를 열게 하므로 **문면 그대로 재면
   * 실물이 떨어진다.** 해소는 같은 항의 ③이 든다 — *"③이 있어서 ②가 기계적으로 성립한다"*.
   * 그래서 이 축이 재는 것은 ③이 정하는 술어이고(상대 경로·상위 지목 없음 + 매니페스트 키),
   * 문면 쪽 처분은 이 파일이 하지 않는다. **여기서 정본을 고치지 않는다.**
   *
   * 이 관측은 2026-08-27 독립 QA가 세웠고 §9.6 결정 15의 승격이 표시째로 실어 왔다. 처분은
   * 이 사이클 밖이다.
   */
  test("② 상대 경로·상위 지목이 0건이다 (③이 정하는 술어로 잰다)", () => {
    const opened = references(screenSource()).filter((r) => !isFragmentOnly(r));
    expect(
      opened.filter((r) => !r.startsWith("/")),
      "절대 표기가 아닌 참조가 있다",
    ).toEqual([]);
    expect(
      opened.filter((r) => r.includes("../") || r.includes("./")),
      "상위·현재 디렉터리 지목이 있다",
    ).toEqual([]);
  });

  test("② 문면 그대로의 판정 — 화면이 여는 하위 경로 참조가 실재하고 그것이 키다", () => {
    // 이 단언이 [문서 부정확]의 실물이다. 붉히지 않는 이유는 ③이 그 자리를 허용하기 때문이고,
    // 붉혀야 한다고 읽는 갈래가 있으면 처분은 이 파일이 아니라 §9.4 결정 4-②의 개정이다.
    //
    // **완화 (2026-09-02 승격)** — 원본 QA는 `toEqual(["/client/main.js"])`로 이름을 박았다.
    // 그 값은 §9.5 결정 4가 세부로 남긴 것이라 계약이 아니다. 재는 것을 셋으로 갈라 적는다.
    const nested = references(screenSource()).filter((r) => r.slice(1).includes("/"));
    expect(
      nested.length,
      "하위 경로 참조가 0건이다 — 이 [문서 부정확] 관측이 공허해졌다",
    ).toBeGreaterThan(0);
    const keys = manifestKeys();
    expect(
      nested.filter((r) => !keys.has(r)),
      "하위 경로 참조가 표 밖을 가리킨다",
    ).toEqual([]);
    expect(nested, "진입점이 그 하위 경로 참조에 안 든다").toContain(entryPointReference());
  });

  test("역검증 — CDN·프로토콜 상대·상위 지목·미등재 키가 전부 잡힌다", () => {
    const bad = `<!DOCTYPE html><html><head>
      <link rel="stylesheet" href="https://cdn.example.com/x.css">
      <link rel="stylesheet" href="//cdn.example.com/y.css">
      <link rel="stylesheet" href="../up.css">
      <link rel="stylesheet" href="/nope.css">
      <style>@import "https://fonts.googleapis.com/css2?family=X";
      body{background:url(https://cdn.example.com/z.png)}</style>
      </head><body><script type="module" src="/client/main.js"></script></body></html>`;
    const opened = references(bad).filter((r) => !isFragmentOnly(r));
    const keys = manifestKeys();
    expect(opened.filter(opensOutsideRepo).length, "레포 밖 참조가 안 잡힌다").toBe(4);
    expect(opened.filter((r) => !keys.has(r)).length, "미등재 키가 안 잡힌다").toBe(6);
    expect(opened.filter((r) => r.includes("../")).length, "상위 지목이 안 잡힌다").toBe(1);
  });

  test("역검증 — 참조가 하나도 없는 화면에서는 축이 공허하게 참이 된다", () => {
    // 그래서 위 가드가 «참조가 0이 아님»을 먼저 잰다. 이 단언은 그 필요를 실물로 든다.
    expect(references("<!DOCTYPE html><html><body></body></html>")).toEqual([]);
  });

  test("모집단이 요소로 갈린다 — 제출(`<form action>`·`formaction`)은 밖이다", () => {
    // 결정 4-③ⓒ의 2026-08-30 판정을 술어에 건 자리다. 이 단언이 붉으면 누군가 위
    // `RESOURCE_ATTRIBUTES`에 `action`·`formaction`을 되돌린 것이고, 그것은 정본이 명시로
    // 기각한 갈래(*"같은 능력의 철자가 둘이라 열거가 손 목록이 된다"*)로 돌아가는 것이다.
    const submitting =
      `<form method="post" action="https://evil.example.com/x">` +
      `<button type="submit" formaction="https://evil.example.com/y">go</button></form>`;
    expect(references(submitting), "제출 목적지가 참조 모집단에 들어왔다").toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §9.4 결정 5 — 토큰을 화면에 인라인하지 않는다
// ---------------------------------------------------------------------------

/**
 * 결정 5의 이 갈래는 위 「한 파일을 두 키가 열지 않는다」 축과 같은 항의 다른 문장이다 —
 * *"토큰을 화면에 인라인하지 않는다."* 근거도 그 항이 든다: 인라인의 유일한 값(*"참조가 0이
 * 된다"*)이 §9.3의 배선 참조 때문에 성립하지 않고, 남는 것은 대가뿐이다 — *"화면이 둘째를 얻는
 * 날 토큰이 복제되고, `sha256`·`prompt`가 파일 단위라 「토큰만 다시 뽑았다」를 엔트리 하나로
 * 표현할 수 없게 된다."*
 *
 * **모집단이 위 결정 5 축과 다르다.** 저쪽은 표를 돌고 이쪽은 화면 원문을 돈다. 그래서 같은
 * 결정 번호를 이고도 `describe`가 둘이다.
 */
describe("§9.4 결정 5 — 토큰을 화면에 인라인하지 않는다", () => {
  test("화면이 커스텀 프로퍼티를 정의하지 않는다", () => {
    const defined = styleBlocks(screenSource())
      .flatMap((block) => stripCssComments(block).split(/[{;]/))
      .filter((fragment) => /^\s*--[a-zA-Z0-9-]+\s*:/.test(fragment));
    expect(defined, "화면이 토큰을 인라인으로 정의한다").toEqual([]);
  });

  test("대신 화면이 토큰 키를 참조로 연다", () => {
    // 위 부재 단언은 **토큰이 아예 없는 화면에서도 참이다.** 이 자리가 그 공허를 막는다 —
    // 결정 5가 요구한 것은 「인라인 대신 참조」이지 「토큰 없음」이 아니다.
    expect(references(screenSource()), "화면이 토큰 키를 안 연다").toContain(tokensKey());
  });

  test("역검증 — 화면이 토큰을 인라인하면 잡힌다", () => {
    const inlined = "<style>:root{--bg:#090D0B}</style>";
    const defined = styleBlocks(inlined)
      .flatMap((block) => stripCssComments(block).split(/[{;]/))
      .filter((fragment) => /^\s*--[a-zA-Z0-9-]+\s*:/.test(fragment));
    expect(defined.length, "심은 인라인 정의가 안 잡힌다").toBe(1);
  });
});

// ---------------------------------------------------------------------------
// §9.4 결정 11 · §9.6 결정 2 — 컨트롤 셋이 문면을 든다
// ---------------------------------------------------------------------------

/**
 * §9.4 결정 11이 «정상»의 모집단을 가르며 컨트롤을 명시로 뺐다 — *"«정상»의 모집단은 배선이 값을
 * 채우는 앵커다"*이고 *"컨트롤의 레이블처럼 문면이 정적인 자리는 여기 들지 않는다"*이며 *"그
 * 문면은 화면이 지고, 비어 있으면 규격 미달이다"*. §9.6 결정 2가 `composer-submit`에 대해 같은
 * 것을 다시 적는다 — *"그 자리는 화면 몫이고 오늘 비어 있는 것이 규격 미달이다."*
 *
 * ## 만족 형태 — 정본 두 자리가 쓰는 낱말이 «문면»이므로 둘뿐이다
 *
 * ① 요소 안의 비지 않은 텍스트 ② 그 `id`를 가리키는 `<label for>`의 비지 않은 텍스트.
 *
 * **`aria-label`·`aria-labelledby`·`title`만 붙은 컨트롤은 만족이 아니다.** 그 셋은 접근 가능한
 * 이름을 주지만 화면에는 여전히 글자 없는 컨트롤로 뜬다. 정본이 요구한 것은 그 문면(사람 눈에
 * 보이거나 최소한 문서에 텍스트로 실재하는 것)이고, §9.4 결정 11이 미달의 실물을 부를 때 쓴 말도
 * *"접근 가능한 이름이 없는 컨트롤 셋이 그 실물이었다"*라 접근 가능한 이름 쪽이 아니라 그 문면
 * 쪽을 겨눈다. 아래 역검증이 `aria-*`만 든 합성 입력을 붉혀 이 배제를 실물로 잰다.
 */

/**
 * **컨트롤 셋 — 이 파일에서 이 열거는 하나다.** 두 계약이 같은 모집단을 쓴다: **문면**(§9.4 결정
 * 11 · §9.6 결정 2, 바로 아래 절)과 **잠금**(§9.5 결정 10 · §9.6 결정 5, 파일 끝의 승격 절).
 * 열거를 둘로 두면 넷째 컨트롤이 서는 날 한쪽만 늘어나고 그 어긋남은 조용하다
 * (`ARCHITECTURE.md` §2.6). 그래서 상수도 `[미규정]` 표시도 이 자리 하나다.
 *
 * 셋을 모으는 근거는 정본 두 자리다 — §9.6 결정 2가 `composer-submit`을 이름으로 들고, §9.5
 * 결정 10이 *"`run-abort`·`transcript-load-more`가 §9.6에서 아직 안 붙는 것은 이 판정을 안
 * 미룬다"*로 나머지 둘을 이름으로 들며 *"셋은 이 프롬프트가 이미 한 낱말(«컨트롤»)로 묶어 부르는
 * 집합이다"*로 수를 든다.
 *
 * **[미규정]** 그럼에도 그 셋의 **열거**가 정본 한 자리에 없다. §9.4 결정 11은 *"컨트롤 셋"*이라
 * 부를 뿐이고, 위 둘을 합쳐야 셋이 유일하게 결정된다. 아래 첫 테스트가 이 목록을 앵커 집합에
 * 대는 것이 그 부재에 댈 수 있는 전부다 — **넷째 컨트롤이 화면에 서는 날 이 모집단의 정본이
 * 어디인가가 새로 열린다.** 임의 판정하지 않고 표시만 남긴다.
 */
const CONTROL_SET = ["composer-submit", "run-abort", "transcript-load-more"] as const;

/**
 * `id="<이름>"`를 든 요소의 본문 — 여는 태그를 찾아 같은 이름의 닫는 태그까지.
 *
 * **한계 둘.** ① 같은 태그가 자기 안에 중첩되면 첫 닫는 태그에서 끊긴다 — 컨트롤 셋은
 * `<button>`이고 `<button>`은 자기를 품지 못하므로 오늘 실물에 안 닿는다(§9.5 결정 10이
 * *"문면을 지고 눌리는 자리로 이 화면이 쓰는 것은"* `<button>`이라 적는다). ② 속성 값 안의 `>`를
 * 태그의 끝으로 읽는다. 둘 다 위 절 머리가 든 1번(부분 문자열 대조)과 같은 부류다.
 */
function elementBodyById(html: string, id: string): string | null {
  const source = stripHtmlComments(html);
  const opening = new RegExp(`<([a-zA-Z][-a-zA-Z0-9]*)\\b([^<>]*\\bid="${id}"[^<>]*)>`).exec(
    source,
  );
  if (opening === null) return null;
  const tag = (opening[1] ?? "").toLowerCase();
  const rest = source.slice(opening.index + opening[0].length);
  const closing = rest.toLowerCase().indexOf(`</${tag}>`);
  return closing === -1 ? null : rest.slice(0, closing);
}

/**
 * 요소 본문에서 문면을 뽑는다 — 태그를 지우고 공백을 접는다.
 *
 * **문자 참조(`&#9671;`)를 안 지운다.** 그것도 화면에 글자로 뜨므로 넓은 쪽 읽기를 고른 것이고,
 * 좁게 읽으면 이 축이 정본에 없는 판정(장식 글리프는 문면이 아니다)을 스스로 만들게 된다. 오늘
 * 실물의 컨트롤 셋에는 문자 참조가 0건이라 이 선택이 오늘의 판정을 안 움직인다.
 */
const captionText = (fragment: string): string =>
  fragment
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** 그 `id`를 가리키는 `<label for>`의 비지 않은 문면 전부 — 만족 형태 ② */
function labelCaptionsFor(html: string, id: string): string[] {
  const source = stripHtmlComments(html);
  const forMark = new RegExp(`\\bfor="${id}"`);
  return [...source.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi)]
    .filter((match) => forMark.test(match[1] ?? ""))
    .map((match) => captionText(match[2] ?? ""))
    .filter((text) => text !== "");
}

/** 만족 형태 ①②를 합친 것. `aria-label`·`aria-labelledby`·`title`은 여기 안 든다 */
function captionsOf(html: string, id: string): string[] {
  const body = elementBodyById(html, id);
  const own = body === null ? "" : captionText(body);
  return [...(own === "" ? [] : [own]), ...labelCaptionsFor(html, id)];
}

describe("§9.4 결정 11 · §9.6 결정 2 — 컨트롤 셋이 문면을 든다", () => {
  test("모집단 셋이 앵커 이름이다 — 이 축이 화면 밖 이름을 재고 있지 않다", () => {
    const strays = CONTROL_SET.filter((id) => !ANCHOR_NAMES.includes(id));
    expect(strays, "컨트롤 이름이 앵커 집합 밖이다").toEqual([]);
  });

  test("화면이 컨트롤 셋의 요소를 실제로 든다 — 모집단이 공집합에서 참이 아니다", () => {
    const absent = CONTROL_SET.filter((id) => elementBodyById(screenSource(), id) === null);
    expect(absent, "화면이 컨트롤 요소를 안 든다").toEqual([]);
  });

  test("컨트롤 셋이 전부 비지 않은 문면을 든다", () => {
    const blank = CONTROL_SET.filter((id) => captionsOf(screenSource(), id).length === 0);
    expect(blank, "문면이 빈 컨트롤이 있다 — 규격 미달이다").toEqual([]);
  });

  test("역검증 — 실물에서 컨트롤 셋의 본문을 비우면 정확히 셋이 붉는다", () => {
    const blanked = CONTROL_SET.reduce(
      (html, id) =>
        html.replace(
          new RegExp(`(<button\\b[^<>]*\\bid="${id}"[^<>]*>)[\\s\\S]*?(</button>)`),
          "$1$2",
        ),
      screenSource(),
    );
    const blank = CONTROL_SET.filter((id) => captionsOf(blanked, id).length === 0);
    expect(blank, "비운 본문이 안 잡힌다").toEqual([...CONTROL_SET]);
  });

  test("역검증 — 빈 버튼(문면 0)을 낸 합성 화면이 붉는다", () => {
    const empty = `<button type="button" id="composer-submit" class="btn btn-primary"></button>`;
    expect(captionsOf(empty, "composer-submit")).toEqual([]);
  });

  test("역검증 — 공백·주석만 든 본문은 문면이 아니다", () => {
    const whitespace = `<button id="run-abort">\n   \t </button>`;
    const commented = `<button id="run-abort"><!-- Stop run --></button>`;
    expect(captionsOf(whitespace, "run-abort")).toEqual([]);
    expect(captionsOf(commented, "run-abort")).toEqual([]);
  });

  test("역검증 — `aria-label`·`aria-labelledby`·`title`만 든 컨트롤은 만족이 아니다", () => {
    const ariaLabel = `<button id="run-abort" aria-label="Stop run" title="Stop run"></button>`;
    const ariaLabelledby = `<span id="stop-label">Stop run</span><button id="run-abort" aria-labelledby="stop-label"></button>`;
    expect(captionsOf(ariaLabel, "run-abort")).toEqual([]);
    expect(captionsOf(ariaLabelledby, "run-abort")).toEqual([]);
  });

  test("만족 형태 ②가 죽어 있지 않다 — `<label for>`의 문면이 만족을 준다", () => {
    const labelled = `<label class="sr-only" for="run-abort">Stop run</label><button id="run-abort"></button>`;
    expect(captionsOf(labelled, "run-abort")).toEqual(["Stop run"]);
    const emptyLabel = `<label for="run-abort"> </label><button id="run-abort"></button>`;
    expect(captionsOf(emptyLabel, "run-abort")).toEqual([]);
  });

  test("접두 충돌이 문면을 빌려 주지 않는다", () => {
    const neighbour = `<button id="run-abort-confirm">Really stop</button><label for="run-abort-confirm">Confirm</label><button id="run-abort"></button>`;
    expect(captionsOf(neighbour, "run-abort")).toEqual([]);
    expect(captionsOf(neighbour, "run-abort-confirm")).toEqual(["Really stop", "Confirm"]);
  });
});

// ---------------------------------------------------------------------------
// §9.6 결정 15 승격 — §9.5 결정 5(리터럴 색값) · 6(평평화) · 7(원격 마커) (2026-09-02)
// ---------------------------------------------------------------------------

/**
 * 아래 둘은 2026-08-27 독립 QA(`qa-20260827-asset-import.independent.test.ts`)의 축 6과 축 7의
 * §9.5 결정 7 테스트였고, §9.6 결정 15가 *존재·전수* 부류를 계약으로 올리기로 판정하면서 여기로
 * 왔다. **승격은 이동이지 복제가 아니다** — 원본에서 걷는 것은 같은 사이클의 뒤 작업이 한다.
 *
 * **축 7의 나머지는 안 옮겼다.** 넷은 이 파일이 이미 같은 판정을 지고 있고(§9.2 해시 대조와 그
 * 역검증 · §9.5 결정 1의 `prompt` 일치 · `authored`가 재생성 세 필드를 안 든다 · §9.5 결정 4의
 * 진입점 축), 둘은 **결정 15의 승격 목록 밖**이다(§9.4 결정 6의 `prompt` 경로 형태 · §9.2의
 * `sha256`·`pulledAt`이 엔트리마다 따로 선다). 목록 밖의 둘은 원본 QA에 그대로 남는다 —
 * 옮기면 결정 15가 안 낸 판정을 이 사이클이 대신 내는 것이 된다.
 *
 * **기대값의 출처는 정본이다.** 아래 술어는 §9.5 결정 5·6·7의 문면에서 나왔고, 옮기면서 **오늘
 * 관측을 단정하던 세 자리를 완화했다**(§9.5 결정 11의 규율 — 관측 동결을 계약으로 올리지
 * 않는다). 완화한 자리는 그 테스트의 주석이 이름으로 든다.
 *
 * **표기를 지목하는 자리가 하나 있고 그것이 정당한 근거를 적는다.** 결정 7 축은 `@dsCard`라는
 * 문자열을 그대로 든다. §9.5 결정 9가 *"규격은 성질로 적고 표기로 적지 않는다. 예외는 표기가 그
 * 성질의 유일한 철자이거나, 성질을 기계가 읽는 유일한 수단일 때다"*로 그 예외를 열어 두었고,
 * 「원격 마커를 안 걷었다」는 결정을 기계가 읽는 수단은 그 마커의 표기뿐이다.
 *
 * **이 축들이 재지 못하는 것.**
 *
 * 1. **원문 훑기라 CSS 파싱이 아니다.** 색 술어의 모집단은 `<style>` 블록의 **선언 값**과 **속성
 *    값** 둘이고, 그 밖(주석 안·텍스트 노드·런타임이 만드는 인라인 스타일)은 안 본다.
 * 2. **«리터럴 색값»의 외연을 정본이 안 든다.** 아래 `NAMED_COLORS`는 CSS 명세의 사본이고 정본이
 *    지목한 목록이 아니다 — **[미규정]**. `transparent`·`currentcolor`를 뺀 것도 이 파일의
 *    판정이다(결정 5가 겨눈 것은 *"라이트 팔레트가 켜져도 안 갈리는 자리"*이고 그 둘은 팔레트에
 *    기여하지 않는다). 정본이 외연을 들면 이 목록이 그 사본이 된다.
 * 3. **정적 대조라 브라우저를 대신하지 않는다.** 라이트 팔레트가 실제로 갈리는가는 루트
 *    `MILESTONE.md`의 C2가 진다.
 */

/**
 * HTML 문자 참조를 지운다. **이것이 없으면 색 술어가 반드시 거짓 위반을 낸다** — `&#9671;`의
 * `#9671`이 16진 색 패턴에 그대로 걸린다(`K-326` ④가 실측한 실패다).
 */
function stripCharacterReferences(source: string): string {
  return source.replace(/&(?:#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, " ");
}

/**
 * CSS **선언 값**만 뽑는다. 선택자를 모집단에서 빼는 것이 이 함수의 일이다 — `#transcript{`는
 * 중괄호 **밖**이라 안 걸리고 `#composer-input:focus-visible`의 의사 클래스도 마찬가지다.
 */
function cssDeclarationValues(css: string): string[] {
  const values: string[] = [];
  for (const block of stripCssComments(css).matchAll(/\{([^{}]*)\}/g)) {
    for (const declaration of (block[1] ?? "").split(";")) {
      const colon = declaration.indexOf(":");
      if (colon === -1) continue;
      values.push(declaration.slice(colon + 1));
    }
  }
  return values;
}

/** CSS 이름 있는 색. 위 2번이 이 목록의 출처와 한계를 든다 */
const NAMED_COLORS = new Set([
  "aliceblue",
  "antiquewhite",
  "aqua",
  "aquamarine",
  "azure",
  "beige",
  "bisque",
  "black",
  "blanchedalmond",
  "blue",
  "blueviolet",
  "brown",
  "burlywood",
  "cadetblue",
  "chartreuse",
  "chocolate",
  "coral",
  "cornflowerblue",
  "cornsilk",
  "crimson",
  "cyan",
  "darkblue",
  "darkcyan",
  "darkgoldenrod",
  "darkgray",
  "darkgreen",
  "darkgrey",
  "darkkhaki",
  "darkmagenta",
  "darkolivegreen",
  "darkorange",
  "darkorchid",
  "darkred",
  "darksalmon",
  "darkseagreen",
  "darkslateblue",
  "darkslategray",
  "darkslategrey",
  "darkturquoise",
  "darkviolet",
  "deeppink",
  "deepskyblue",
  "dimgray",
  "dimgrey",
  "dodgerblue",
  "firebrick",
  "floralwhite",
  "forestgreen",
  "fuchsia",
  "gainsboro",
  "ghostwhite",
  "gold",
  "goldenrod",
  "gray",
  "green",
  "greenyellow",
  "grey",
  "honeydew",
  "hotpink",
  "indianred",
  "indigo",
  "ivory",
  "khaki",
  "lavender",
  "lavenderblush",
  "lawngreen",
  "lemonchiffon",
  "lightblue",
  "lightcoral",
  "lightcyan",
  "lightgoldenrodyellow",
  "lightgray",
  "lightgreen",
  "lightgrey",
  "lightpink",
  "lightsalmon",
  "lightseagreen",
  "lightskyblue",
  "lightslategray",
  "lightslategrey",
  "lightsteelblue",
  "lightyellow",
  "lime",
  "limegreen",
  "linen",
  "magenta",
  "maroon",
  "mediumaquamarine",
  "mediumblue",
  "mediumorchid",
  "mediumpurple",
  "mediumseagreen",
  "mediumslateblue",
  "mediumspringgreen",
  "mediumturquoise",
  "mediumvioletred",
  "midnightblue",
  "mintcream",
  "mistyrose",
  "moccasin",
  "navajowhite",
  "navy",
  "oldlace",
  "olive",
  "olivedrab",
  "orange",
  "orangered",
  "orchid",
  "palegoldenrod",
  "palegreen",
  "paleturquoise",
  "palevioletred",
  "papayawhip",
  "peachpuff",
  "peru",
  "pink",
  "plum",
  "powderblue",
  "purple",
  "rebeccapurple",
  "red",
  "rosybrown",
  "royalblue",
  "saddlebrown",
  "salmon",
  "sandybrown",
  "seagreen",
  "seashell",
  "sienna",
  "silver",
  "skyblue",
  "slateblue",
  "slategray",
  "slategrey",
  "snow",
  "springgreen",
  "steelblue",
  "tan",
  "teal",
  "thistle",
  "tomato",
  "turquoise",
  "violet",
  "wheat",
  "white",
  "whitesmoke",
  "yellow",
  "yellowgreen",
]);

const COLOR_FUNCTION =
  /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|device-cmyk)\s*\(/i;

/** `#rgb`·`#rgba`·`#rrggbb`·`#rrggbbaa`만. 길이를 닫는 것이 CSS 식별자 오인을 줄인다 */
const HEX_COLOR =
  /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])/;

/** 색 값이 나타날 수 있는 표시용 속성 — 인라인 SVG의 `fill="#…"`이 여기서 잡힌다 */
const PRESENTATIONAL_ATTRIBUTES = new Set([
  "style",
  "fill",
  "stroke",
  "stop-color",
  "flood-color",
  "lighting-color",
  "bgcolor",
  "color",
  "bordercolor",
]);

type ColorFinding = { readonly where: string; readonly text: string };

/**
 * 원문에서 리터럴 색값을 찾는다.
 *
 * **모집단은 둘이다** — `<style>` 블록의 **선언 값**과 **속성 값**. 앞엣것이 선택자를 빼고,
 * 뒤엣것이 *"속성 뒤를 통째로 빼면 인라인 SVG의 `fill="#…"`이 조용히 샌다"*(`K-326` ④의
 * 반대 함정)를 막는다.
 */
function literalColors(html: string): ColorFinding[] {
  const found: ColorFinding[] = [];

  const scan = (where: string, raw: string, withNames: boolean): void => {
    const text = stripCharacterReferences(raw);
    if (HEX_COLOR.test(text)) found.push({ where: `${where} (hex)`, text: raw.trim() });
    if (COLOR_FUNCTION.test(text)) found.push({ where: `${where} (function)`, text: raw.trim() });
    if (!withNames) return;
    // `:`·`;`도 구분자다. 없으면 `style="color:black"`의 토큰이 `color:black`이 되어 이름
    // 대조가 조용히 빗나간다 — 아래 역검증이 실제로 그 구멍을 잡았다.
    for (const token of text.split(/[\s,()/:;]+/)) {
      if (NAMED_COLORS.has(token.toLowerCase())) {
        found.push({ where: `${where} (named)`, text: raw.trim() });
        break;
      }
    }
  };

  for (const block of styleBlocks(html)) {
    for (const value of cssDeclarationValues(block)) scan("css-declaration", value, true);
  }
  for (const attribute of htmlAttributes(html)) {
    scan(
      `attribute:${attribute.name}`,
      attribute.value,
      PRESENTATIONAL_ATTRIBUTES.has(attribute.name),
    );
  }
  return found;
}

/**
 * 한 선택자가 여는 블록 **전부**에서 커스텀 프로퍼티 선언을 모은다.
 *
 * **블록이 하나라고 전제하지 않는다.** 원본 QA는 `.exec`로 첫 블록만 봤는데, 실물 토큰은
 * `:root`를 다섯 번, `[data-theme="light"]`를 두 번 연다 — 첫 블록만 보면 나머지가 모집단
 * 밖으로 조용히 빠진다(`ARCHITECTURE.md` §2.6).
 */
function customPropertiesIn(css: string, selector: string): Map<string, string> {
  const declarations = new Map<string, string>();
  const blocks = new RegExp(`${selector}\\s*\\{([^{}]*)\\}`, "g");
  for (const block of stripCssComments(css).matchAll(blocks)) {
    for (const declaration of (block[1] ?? "").matchAll(/(--[\w-]+)\s*:([^;}]*)/g)) {
      declarations.set(declaration[1] ?? "", (declaration[2] ?? "").trim());
    }
  }
  return declarations;
}

/** 화면이 `var(--…)`로 여는 커스텀 프로퍼티 전부 */
const tokensOpenedByScreen = (html: string): ReadonlySet<string> =>
  new Set([...html.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1] ?? ""));

const isColorValue = (value: string): boolean =>
  HEX_COLOR.test(value) ||
  COLOR_FUNCTION.test(value) ||
  value.split(/[\s,()/]+/).some((token) => NAMED_COLORS.has(token.toLowerCase()));

describe("§9.5 결정 5·6 — 리터럴 색값과 평평화", () => {
  test("결정 5 — **화면**에 리터럴 색값이 0건이다", () => {
    // *"색은 토큰 참조로만 쓴다 — 리터럴 색값을 두지 않는다."* 실측이 이 항을 만들었다:
    // 원격 킷이 `var(--bg)` 바로 옆에 `#04070A`를 하드코딩했다.
    expect(literalColors(screenSource()), "화면이 리터럴 색값을 든다").toEqual([]);
  });

  test("결정 5의 모집단이 `tokens.css`를 포함하지 않는다 — 토큰의 리터럴은 정상이다", () => {
    // 토큰이 리터럴을 안 들면 토큰이 성립하지 않는다. 이 단언이 모집단의 경계를 실물로 세워
    // 위 축이 «아무 파일에나 걸리는 금지»로 읽히지 않게 한다.
    expect(HEX_COLOR.test(tokensSource()), "토큰이 리터럴 색을 하나도 안 든다").toBe(true);
  });

  test("거짓 위반 방지 — HTML 문자 참조가 색으로 안 읽힌다 (합성 픽스처)", () => {
    // `K-326` ④가 실측한 실패 — `&#9671;`의 `#9671`이 16진 패턴에 그대로 걸린다.
    const synthetic = `<div style="content:'&#9671;&#10003;&#8856;'"></div>`;
    expect(/&#\d{3,};/.test(synthetic)).toBe(true);
    expect(literalColors(synthetic)).toEqual([]);
  });

  test("거짓 위반 방지 — CSS 선택자와 `white-space`가 색으로 안 읽힌다 (합성 픽스처)", () => {
    // **완화 (2026-09-02 승격)** — 원본 QA는 실물 화면에 `"white-space:nowrap"`과
    // `"#transcript{"`가 **문자 그대로** 있다고 단정했다. 그 둘은 정본이 요구하는 문면이
    // 아니라 2026-08-29 재생성이 우연히 든 표기다(§9.5 결정 11 — 관측 동결을 계약으로
    // 올리지 않는다. 같은 축의 문자 참조 자리는 원본 QA가 이미 같은 이유로 합성 픽스처로
    // 바꿨다). 재는 것은 술어이지 오늘의 철자가 아니므로 술어를 합성 픽스처로 잰다.
    // **함정을 진짜로 든 픽스처다.** `#facade`는 여섯 자 전부가 16진이라 선택자를 모집단에서
    // 안 빼면 그대로 걸리고, `white-space`는 토큰 분리자에 `-`를 넣는 순간 `white`가 이름 있는
    // 색으로 읽힌다. 실물 화면의 `#transcript`는 `t`·`r`·`n`·`s`가 16진이 아니라 이 함정을
    // 애초에 안 밟는다 — 원본 QA가 박아 둔 실물 문자열은 그래서 재는 것이 없었다.
    const synthetic = `<style>#facade{white-space:nowrap}#composer-input:focus-visible{outline:var(--focus-ring)}</style>`;
    expect(HEX_COLOR.test("#facade"), "픽스처가 함정을 안 든다 — 이 역검증이 공허하다").toBe(true);
    expect(literalColors(synthetic), "선택자나 `white-space`가 색으로 읽혔다").toEqual([]);
    // 모집단 가드 — 실물 화면이 실제로 선언을 든다. 술어가 빈 입력에서 참이 되고 있지 않다.
    expect(
      styleBlocks(screenSource()).flatMap(cssDeclarationValues).length,
      "화면의 `<style>` 선언이 0건 — 위 색 축이 공집합에서 참이 된다",
    ).toBeGreaterThan(0);
  });

  test("역검증 — `var(--bg)` 옆의 리터럴이 잡힌다 (결정 5가 실측한 그 형태)", () => {
    const bad = "<style>body{background:#04070A;background:var(--bg)}</style>";
    expect(literalColors(bad).map((f) => f.where)).toContain("css-declaration (hex)");
  });

  test('역검증 — 인라인 SVG의 `fill="#…"`이 안 샌다 (반대 함정)', () => {
    const bad = `<svg><rect fill="#0f0"></rect></svg>`;
    expect(literalColors(bad).map((f) => f.where)).toContain("attribute:fill (hex)");
  });

  test("역검증 — `rgba()`·이름 있는 색도 잡힌다", () => {
    expect(literalColors("<style>a{color:rgba(1,2,3,.5)}</style>").length).toBeGreaterThan(0);
    expect(literalColors("<style>a{color:white}</style>").length).toBeGreaterThan(0);
    expect(literalColors(`<div style="color:black"></div>`).length).toBeGreaterThan(0);
  });

  test("결정 5의 근거가 실물에서 선다 — 화면이 여는 색 토큰을 라이트 팔레트가 전부 다시 든다", () => {
    // 결정 5의 근거는 *"토큰의 라이트 팔레트는 `[data-theme="light"]`로 갈리므로 리터럴을 든
    // 자리는 그 속성이 켜져도 안 갈린다"*이다. 그 근거가 서려면 **화면이 여는 색 토큰이
    // 실제로 그 속성에서 갈려야** 한다 — 안 갈리는 토큰이 있으면 리터럴을 없앤 것으로 얻은
    // 것이 그만큼 없다.
    //
    // **완화 (2026-09-02 승격)** — 원본 QA는 `--bg`·`--surface`·`--text`·`--accent`·
    // `--prov-user`·`--prov-blocked` 여섯을 **손 목록**으로 박았다. 정본은 그 여섯을 안 들고,
    // 손 목록은 토큰이 늘 때 조용히 낡는다(§9.5 결정 11). 모집단을 실물에서 파생한다 —
    // 화면이 `var()`로 여는 것 중 `:root`가 리터럴 색으로 정의한 것 전부.
    const tokens = tokensSource();
    const root = customPropertiesIn(tokens, ":root");
    const light = customPropertiesIn(tokens, '\\[data-theme="light"\\]');
    expect(light.size, "라이트 팔레트 블록이 없거나 비었다").toBeGreaterThan(0);

    const openedColors = [...tokensOpenedByScreen(screenSource())].filter((name) => {
      const value = root.get(name);
      return value !== undefined && isColorValue(value);
    });
    expect(
      openedColors.length,
      "화면이 여는 색 토큰이 0건 — 이 축이 공집합에서 참이 된다",
    ).toBeGreaterThan(0);
    expect(
      openedColors.filter((name) => !light.has(name)),
      "라이트 팔레트가 안 다시 드는 색 토큰을 화면이 연다",
    ).toEqual([]);
  });

  test("결정 6 — 평평화가 이어붙이기가 아니다. `@import`가 0건이다", () => {
    // *"원격의 `styles.css`를 그대로 반입하지 않는다"* — 그것은 `@import url('tokens/…')`
    // 여섯 줄의 집합자다. 0은 정본이 닫은 수이지 오늘 관측이 아니다.
    expect(stripCssComments(tokensSource()), "토큰이 `@import`를 든다").not.toMatch(/@import/i);
  });

  test("결정 6 — 평평화가 남긴 참조에 상대 경로 표기가 0건이다", () => {
    // **완화 (2026-09-02 승격)** — 원본 QA는 `url()`이 **하나도** 없다고 단정했다. 정본이
    // 닫은 것은 그 수가 아니다: 결정 6이 겨눈 것은 *"레포 밖을 여는 줄"*이고(그 축은 위
    // §9.4 결정 4-① 자리가 이미 잰다), 결정 4-②ⓑ가 겨눈 것은 **상대 경로 표기**(`../`·
    // `foo/bar.css`·`@import url('tokens/…')`)다 — *"매니페스트 키의 절대 표기가 중간 `/`를
    // 드는 것은 ②의 대상이 아니다."* 레포 안의 절대 키를 여는 `url()`은 정본이 허용하므로
    // 0건을 계약으로 올리면 그 산출이 붉는다. 오늘 그 목록은 비어 있다.
    const opened = cssReferences(tokensSource());
    expect(
      opened.filter((r) => !r.startsWith("/")),
      "토큰이 절대 표기가 아닌 참조를 연다",
    ).toEqual([]);
    expect(
      opened.filter((r) => r.includes("../") || r.includes("./")),
      "토큰이 상위·현재 디렉터리를 지목한다",
    ).toEqual([]);
  });

  test("결정 6 — 타이포 폴백이 완비돼 웹폰트 없이도 선다", () => {
    // *"`typography.css`의 `--font-mono`·`--font-sans`가 시스템 폴백을 완비하므로, 웹폰트가
    // 없어도 시스템 보고는 고정폭이고 산문은 비례폭이다."* 두 이름은 정본이 직접 지목한다.
    const tokens = tokensSource();
    const mono = /--font-mono\s*:([^;}]*)/.exec(tokens)?.[1] ?? "";
    const sans = /--font-sans\s*:([^;}]*)/.exec(tokens)?.[1] ?? "";
    expect(/\b(?:monospace|ui-monospace)\b/.test(mono), "`--font-mono`에 고정폭 폴백이 없다").toBe(
      true,
    );
    expect(/\b(?:sans-serif|system-ui)\b/.test(sans), "`--font-sans`에 비례폭 폴백이 없다").toBe(
      true,
    );
  });

  test("역검증 — Google Fonts `@import`를 그대로 이어붙인 토큰은 잡힌다", () => {
    // 결정 6이 실물로 든 그 형태다 — *"`tokens/fonts.css`는 Google Fonts `@import` 한 줄이
    // 전부다. 그대로 이어붙이면 첫 반입이 결정 4-①을 깬다."*
    const bad =
      "@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono');\n:root{--bg:#000}";
    expect(stripCssComments(bad)).toMatch(/@import/i);
    expect(cssReferences(bad).filter(opensOutsideRepo).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// §9.5 결정 7 — 반입물이 들고 오는 원격 마커를 걷지 않는다
// ---------------------------------------------------------------------------

describe("§9.5 결정 7 — 원격 마커를 안 걷는다", () => {
  test("화면 첫 줄의 `@dsCard` 마커가 살아 있다", () => {
    // *"원격 킷의 `index.html`은 첫 줄이 `<!-- @dsCard … -->`이고 원격 앱의 카드 색인이
    // 그것을 읽는다. 걷는 것이 §9가 금지한 손질이고 `sha256`이 그것을 붉힌다."*
    //
    // **이 축이 해시 축과 겹치지 않는 이유.** `sha256`은 **반입 후 변조**만 잡는다(§9.2) —
    // 마커를 걷은 채 반입하고 그 바이트로 해시를 적으면 해시 축은 그린이다. 이 축은 그
    // 경로를 붉힌다.
    //
    // 표기(`@dsCard`)를 지목하는 근거는 §9.5 결정 9의 예외다 — 「마커를 안 걷었다」는 결정을
    // 기계가 읽는 수단이 그 표기뿐이다. 마커 **본문**은 안 잰다(원격의 소관이고 갈려도 이 계약은
    // 안 깨진다).
    expect(screenSource().split("\n")[0] ?? "", "화면 첫 줄이 원격 마커가 아니다").toMatch(
      /^<!--\s*@dsCard\b/,
    );
  });

  test("역검증 — 마커를 걷은 화면은 잡힌다", () => {
    const stripped = screenSource().split("\n").slice(1).join("\n");
    expect(stripped.split("\n")[0] ?? "").not.toMatch(/^<!--\s*@dsCard\b/);
  });
});

// ---------------------------------------------------------------------------
// §9.6 결정 15 승격 — §9.5 결정 10이 규격으로 올린 성질 셋 (2026-09-02)
// ---------------------------------------------------------------------------

/**
 * 아래 다섯 하위 절은 2026-08-29 독립 QA(`qa-20260829-console-kit-spec.independent.test.ts`)가
 * 든 전부였고, §9.6 결정 15가 *존재·전수* 부류를 계약으로 올리기로 판정하면서 여기로 왔다.
 * **승격은 이동이지 복제가 아니다** — 그 QA 파일은 같은 사이클(2026-09-02)에 **삭제됐다.**
 * 열여섯을 하나도 안 남기고 옮겼으므로 원본에 남을 것이 없었다.
 *
 * 그 QA가 선 이유는 커버리지 구멍이었다. §9.5 결정 10이 성질 셋을 **규격으로 올렸는데**
 * (`composer-input`의 다중행 · 컨트롤 셋의 잠금 · `connection-status`의 명시 고지), 반입 뒤에
 * 그 셋을 재는 기계가 이 레포에 하나도 없었다. 그때 그것을 잰 것은 반입 전 스테이징의 사이클
 * 산출물이고, 그 자리는 매 사이클 새로 만들어져 공개 트리에 안 실린다 — 즉 **반입 뒤에는 아무도
 * 안 쟀다.**
 *
 * **기대값의 출처는 정본이다.** 아래 술어는 §9.5 결정 9·10·11과 §9.6 결정 5의 문면에서 나왔고,
 * 구현도 스테이징 검사기도 읽고 만들지 않았다.
 *
 * ## 이 절이 **안 재는 것** — §9.5 결정 11
 *
 * *"관측 동결을 계약으로 쓰지 않는다."* 그래서 아래 어느 축도 「오늘 실물이 우연히 든 값」을 안
 * 박는다. 재는 것은 정본이 **규격으로 올린 성질** 셋뿐이고, 같은 절이 ㉠에서 떨어뜨린
 * 자리(`connection-status`의 **요소 종류** · `transcript`의 명시 `aria-live` · `:root`의
 * `color-scheme`)는 여기서 **안 잰다** — 재면 그 절이 폐기한 프레임을 이 파일이 되살린다.
 *
 * ## 이 절이 재지 못하는 것
 *
 * 1. **부분 문자열·정규식 대조라 파서가 아니다.** `openingTagOf`는 속성 값 안의 `>`를 태그의
 *    끝으로 읽는다 — 위 §9.4 결정 11 절의 `elementBodyById`가 든 한계와 같은 부류다.
 * 2. **잠금이 눈에 어떻게 보이는가는 안 잰다.** 아래 축이 재는 것은 *"잠금이 무동작이면"*(§9.5
 *    결정 10)의 **무동작 여부**이지 그 자국의 크기가 아니다. 그리기 층의 눈은 §9.6 «이 절이 재지
 *    못하는 것»이 C2의 브라우저에 맡겼다.
 * 3. **프롬프트를 안 연다.** 규격이 원격 프롬프트에 사본으로 사는지는 §9.5가 이미 «재지 못하는
 *    것»으로 적었다.
 */

/** §9.5 결정 10이 다중행을 요구한 자리 */
const MULTILINE_INPUT = "composer-input";

/** §9.5 결정 10이 명시 고지를 요구한 자리 */
const ANNOUNCED_STATUS = "connection-status";

/**
 * 배선의 그리기 층 원문. §9.6 결정 1이 *"DOM을 아는 것은 마지막 하나뿐"*이라 든 자리다.
 *
 * **이 파일에서 이것을 읽는 축은 아래 S-2b 하나뿐이다** — 잠금은 화면과 그리기 층이 **둘 다**
 * 참일 때만 실물이라 어느 한쪽만 재는 축이 그 실패를 못 본다. 배선 전반을 도는 것은 형제
 * 파일들의 몫이고 이 파일이 그리로 넓어지는 것이 아니다.
 */
const renderSource = (): string => readFileSync(join(AUTHORED_ASSET_ROOT, "render.js"), "utf8");

/**
 * 그 `id`를 든 요소의 **태그 이름과 여는 태그의 속성부**. 없으면 `null`.
 *
 * 여는 태그를 찾는 정규식은 위 `elementBodyById`와 같은 모양이고 한계도 같다 — 저쪽이 본문을
 * 돌려주고 이쪽이 태그와 속성을 돌려준다. 아래 셋이 재는 것은 본문이 아니라 **요소의 종류와
 * 속성**이라 여기서 갈린다.
 */
function openingTagOf(html: string, id: string): { tag: string; attrs: string } | null {
  const found = new RegExp(`<([a-zA-Z][-a-zA-Z0-9]*)\\b([^<>]*\\bid="${id}"[^<>]*)>`).exec(
    stripHtmlComments(html),
  );
  return found === null ? null : { tag: (found[1] ?? "").toLowerCase(), attrs: found[2] ?? "" };
}

describe("§9.5 결정 10 — 규격으로 오른 성질 셋", () => {
  describe("축 0 — 아래 축들이 공집합에서 참이 되지 않는다", () => {
    test("화면이 정확히 하나이고 원문이 비어 있지 않다", () => {
      // **위 §9.4 결정 12 축과 겹치지 않는다.** 저쪽이 든 것은 *"`generated` HTML 문서는 많아야
      // 하나다"*라 **0에서도 참**이다. 이 자리가 닫는 것은 그 0이다 — 화면이 없으면 아래 축
      // 전부가 조용히 그린이 된다(`ARCHITECTURE.md` §2.6).
      const screens = manifestEntries.filter(
        (entry) => entry.origin === "generated" && isHtmlDocumentEntry(entry),
      );
      expect(screens, "화면이 정확히 하나가 아니다").toHaveLength(1);
      expect(screenSource().length, "화면 원문이 비었다").toBeGreaterThan(0);
    });

    test("모집단의 이름이 전부 앵커다 — 이 절이 화면 밖 이름을 재고 있지 않다", () => {
      // `ANCHOR_NAMES`를 넓은 문자열 배열로 받는다. 좁은 채로 두면 이 축이 **타입으로 이미
      // 참**이 되어 런타임에 아무것도 안 재게 된다 — 형제 계약 테스트가 같은 자리에 쓴 규율이다.
      const anchors: readonly string[] = ANCHOR_NAMES;
      const names: readonly string[] = [...CONTROL_SET, MULTILINE_INPUT, ANNOUNCED_STATUS];
      expect(names.filter((name) => !anchors.includes(name))).toEqual([]);
    });

    test("모집단의 요소가 화면에 전부 실재한다", () => {
      const names: readonly string[] = [...CONTROL_SET, MULTILINE_INPUT, ANNOUNCED_STATUS];
      expect(names.filter((name) => openingTagOf(screenSource(), name) === null)).toEqual([]);
    });
  });

  /**
   * *"`<input type="text">`는 붙여넣은 줄바꿈을 값 정규화 단계에서 없앤다 — 사용자가 준 것이
   * 소리 없이 갈리는 경로이고 그것이 §2.6이다. 다중행 텍스트를 받는 폼 컨트롤은 HTML에
   * `<textarea>` 하나이므로 **이 항은 요소 이름을 지목한다**"* (§9.5 결정 10).
   *
   * 그래서 이 축만은 표기를 잰다 — §9.5 결정 9의 예외 *"표기가 그 성질의 유일한 철자"*다.
   */
  describe("축 S-1 — `composer-input`이 여러 줄을 받는다 (§9.5 결정 10)", () => {
    test("`composer-input`이 `<textarea>`다", () => {
      expect(openingTagOf(screenSource(), MULTILINE_INPUT)?.tag).toBe("textarea");
    });

    test('역검증 — `<input type="text">`로 낸 화면이 붉는다 (결정 10이 실측한 그 형태)', () => {
      const regressed = `<label for="composer-input">m</label><input type="text" id="composer-input">`;
      expect(openingTagOf(regressed, MULTILINE_INPUT)?.tag).not.toBe("textarea");
    });

    test("역검증 — 자리가 아예 없으면 그린이 아니라 `null`이다", () => {
      expect(openingTagOf("<div></div>", MULTILINE_INPUT)).toBeNull();
    });
  });

  /**
   * *"§9.6 결정 5가 왕복 동안 제출을 잠그기로 했고, **잠금이 무동작이면** 그 항이 «눌렀는데 아무
   * 일도 안 난다»를 막으려 세운 층이 그대로 그 상태가 된다. `disabled`를 지는 것은 폼 컨트롤이고
   * 문면을 지고 눌리는 자리로 이 화면이 쓰는 것은 `<button>`이다"* (§9.5 결정 10).
   *
   * **요소 이름을 재는 근거가 관측이 아니라 정본의 지목이다.** 폼 컨트롤 전체를 열거하면 그것이
   * 곧 §9.5 결정 9가 거부한 «외부 명세의 사본»이 된다 — 정본이 이 화면에 대해 `<button>` 하나를
   * 지목했으므로 그 지목을 그대로 잰다.
   */
  describe("축 S-2 — 컨트롤 셋이 활성·잠금을 지는 요소다 (§9.5 결정 10 · §9.6 결정 5)", () => {
    test("컨트롤 셋이 전부 `<button>`이다", () => {
      const wrong = CONTROL_SET.filter((id) => openingTagOf(screenSource(), id)?.tag !== "button");
      expect(wrong).toEqual([]);
    });

    test('역검증 — `<div role="button">`으로 낸 컨트롤이 붉는다 (`disabled`가 무동작인 형태)', () => {
      const regressed = `<div role="button" tabindex="0" id="composer-submit">Send</div>`;
      expect(openingTagOf(regressed, "composer-submit")?.tag).not.toBe("button");
    });

    test("역검증 — `<a>`로 낸 컨트롤도 붉는다", () => {
      const regressed = `<a href="#" id="run-abort">Stop run</a>`;
      expect(openingTagOf(regressed, "run-abort")?.tag).not.toBe("button");
    });
  });

  /**
   * **잠금이 실제로 무동작이 아닌가 — 두 층을 한 축이 잇는다.**
   *
   * §9.5 결정 10의 ㉠이 든 실패는 화면이 잠금을 못 지는 요소를 냈고 배선은 그것을 모른 채
   * `disabled`를 토글하는 것이고, 그 상태는 **조용하다**(`ARCHITECTURE.md` §2.6). 그리기 층이
   * 그 앵커에 `disabled`를 쓰는 것과 화면의 그 자리가 `<button>`인 것이 **둘 다 참일 때만** 잠금이
   * 실물이므로, 어느 한쪽만 재는 축은 이 실패를 못 본다.
   *
   * **표기가 아니라 결합을 잰다.** 그리기 층이 어떤 API로 쓰는가는 세부이나(§9.6 — *"함수
   * 이름·문면·파일 수는 세부"*), `disabled`라는 낱말이 그 앵커 곁에 아예 없으면 결정 5의 잠금이
   * 코드에 없다는 뜻이다.
   */
  describe("축 S-2b — 잠금이 무동작이 아니다 (§9.5 결정 10 ㉠ · §9.6 결정 5)", () => {
    test("그리기 층이 `composer-submit`에 `disabled`를 쓴다", () => {
      const line = renderSource()
        .split("\n")
        .find((row) => row.includes("composer-submit") && row.includes("disabled"));
      expect(
        line,
        "그리기 층이 그 앵커에 잠금을 안 쓴다 — 결정 5의 잠금이 코드에 없다",
      ).toBeDefined();
    });

    test("그 앵커가 화면에서 `disabled`를 지는 요소다 — 두 층이 맞물린다", () => {
      expect(openingTagOf(screenSource(), "composer-submit")?.tag).toBe("button");
    });
  });

  /**
   * *"성질은 «초점을 안 뺏고 고지된다»이고 `<output>`·`role="status"`의 암묵 live로도 성립한다.
   * 그러나 그것을 기계가 읽으려면 **요소→암묵 role 매핑표를 이 레포가 사본으로 들어야 하고**, 그
   * 사본은 외부 명세를 좇아 낡는다. **그래서 명시 `aria-live="polite"` 하나를 규격이 지목한다** —
   * 사본 없이 같은 것을 재고 … **요소와 role은 자유다**"* (§9.5 결정 10).
   *
   * 그래서 이 축은 `aria-live`의 값 하나만 보고 **요소 종류도 `role`도 안 본다** — 보면 §9.5
   * 결정 11이 폐기한 관측 동결을 이 파일이 되살린다.
   */
  describe('축 S-3 — `connection-status`가 명시 `aria-live="polite"`를 든다 (§9.5 결정 10)', () => {
    test('그 자리가 `aria-live="polite"`를 든다', () => {
      expect(openingTagOf(screenSource(), ANNOUNCED_STATUS)?.attrs).toMatch(/\baria-live="polite"/);
    });

    test("요소 종류와 `role`은 안 잰다 — 정본이 «요소와 role은 자유다»로 닫았다", () => {
      // 이 축이 성립하는 요소가 하나가 아님을 합성으로 실증한다. 둘 다 규격을 만족한다.
      const asOutput = `<output id="connection-status" aria-live="polite"></output>`;
      const asSpan = `<span id="connection-status" role="status" aria-live="polite"></span>`;
      expect(openingTagOf(asOutput, ANNOUNCED_STATUS)?.attrs).toMatch(/\baria-live="polite"/);
      expect(openingTagOf(asSpan, ANNOUNCED_STATUS)?.attrs).toMatch(/\baria-live="polite"/);
    });

    test("역검증 — 암묵 live만 든 산출이 붉는다 (§9.5 결정 10이 규격을 세운 그 회차의 형태)", () => {
      const implicitOnly = `<output id="connection-status"></output>`;
      expect(openingTagOf(implicitOnly, ANNOUNCED_STATUS)?.attrs ?? "").not.toMatch(
        /\baria-live="polite"/,
      );
    });

    test('역검증 — `aria-live="assertive"`는 «초점을 안 뺏고»가 아니라 붉는다', () => {
      const assertive = `<span id="connection-status" aria-live="assertive"></span>`;
      expect(openingTagOf(assertive, ANNOUNCED_STATUS)?.attrs ?? "").not.toMatch(
        /\baria-live="polite"/,
      );
    });

    test("역검증 — 접두 충돌이 값을 빌려 주지 않는다", () => {
      const neighbour = `<span id="connection-status-label" aria-live="polite">Link</span><span id="connection-status"></span>`;
      expect(openingTagOf(neighbour, ANNOUNCED_STATUS)?.attrs ?? "").not.toMatch(
        /\baria-live="polite"/,
      );
    });
  });
});
