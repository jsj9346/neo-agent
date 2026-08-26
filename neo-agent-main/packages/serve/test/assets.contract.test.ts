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
 * ## 오늘 이 그린이 뜻하지 않는 것
 *
 * **오늘 `generated` 엔트리가 0건이다.** 반입 화면 자산이 아직 없고 매니페스트에 있는 것은
 * 전부 §9.3·§9.4가 이 레포의 소유로 판정한 `authored` 갈래다. 그래서 `sha256` 대조 축은 **공집합에서
 * 참**이고, 이 파일의 그린을 반입 자산이 검증된 것으로 읽으면 틀린다. 그 축이 죽은 코드가
 * 아니라는 것은 실물이 아니라 표본으로 선다 — 아래 역검증이 한 바이트를 뒤집어 잡히는 것을
 * 보인다.
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
 * 이 파일은 그 상수(`MANIFEST_EXEMPT_FILES`)를 import해 쓰고 자기 목록을 따로 들지 않는다 —
 * 따로 들면 제외의 정본이 둘이 되고, 그것이 §9.2가 이미 거부한 형태다.
 *
 * **그래서 이 파일은 오늘 전 축 그린이다.** 낡은 red 서술을 남겨 두면 다음 감사가 닫힌 것을
 * 열린 것으로 읽는다(2026-08-26 · QA D-3 처분).
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로 있는
 * 부분 문자열이고, 문서를 지목하는 자리는 절 번호와 필드 이름으로 한다.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  ASSET_MANIFEST,
  type AssetEntry,
  type AssetManifest,
  AUTHORED_ASSET_ROOT,
  assetRoot,
  GENERATED_ASSET_ROOT,
  MANIFEST_EXEMPT_FILES,
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
  exempt: readonly string[],
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
      if (exempt.includes(file)) continue;
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
const REAL = auditManifest(ASSET_MANIFEST, DISK, MANIFEST_EXEMPT_FILES);

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
    // 오늘 이 단언이 red다. 근거와 처분 행선지는 이 파일 머리의 `[미규정]` 절이 든다 —
    // §9.3이 놓으라 한 `tsconfig.json`을 §9.1이 미등재로 읽고, 제외 목록의 정본은
    // `src/assets.ts`이지 이 파일이 아니다.
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
        only(auditManifest(ASSET_MANIFEST, planted, MANIFEST_EXEMPT_FILES), "unregistered").map(
          (finding) => `${finding.origin}:${finding.file}`,
        ),
        `${origin} 루트에 심은 파일이 안 잡힌다`,
      ).toContain(`${origin}:rogue.css`);
    }
  });

  test("역검증 — 매니페스트에 있는데 파일이 없으면 떨어진다", () => {
    const emptied: RootViews = { generated: EMPTY_ROOT, authored: EMPTY_ROOT };
    expect(
      only(auditManifest(ASSET_MANIFEST, emptied, MANIFEST_EXEMPT_FILES), "missing")
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
      only(auditManifest(ASSET_MANIFEST, nested, MANIFEST_EXEMPT_FILES), "unregistered").map(
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
    expect(MANIFEST_EXEMPT_FILES, "제외의 정본은 `src/assets.ts`다").toContain(".gitkeep");
  });
});

// ---------------------------------------------------------------------------
// §9.2 — `sha256` 대조. 갈래 비대칭
// ---------------------------------------------------------------------------

describe("§9.2 `sha256` — `generated`에만 걸린다", () => {
  test("오늘 `generated`가 0건이라 이 축은 공집합에서 참이다", () => {
    // **이 단언은 금지가 아니라 표지다.** 반입 자산이 실제로 들어오는 날 red가 나고, 그때
    // 고칠 것은 이 수가 아니라 이 파일 머리의 0건 서술이다 — 그것을 안 고치면 다음이 이
    // 파일의 그린을 반입 자산이 검증된 것으로 읽는다.
    expect(entriesOf("generated"), "머리의 0건 서술이 낡았다 — 함께 고친다").toEqual([]);
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
      auditManifest(ASSET_MANIFEST, reformattedRoot, MANIFEST_EXEMPT_FILES),
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
