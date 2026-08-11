/**
 * 패키지 경계 — `CLI-INTERFACE.md` §1의 기계화.
 *
 * 기대값의 출처는 전부 §1이다:
 *   - §1:15~16 — 패키지 위치·bin 이름·**의존성 예산**(워크스페이스 9패키지 정확히, 외부 0)
 *   - §1:20 — **금지 모듈 6종 / 허용 5종.** 이 파일은 허용 쪽을 닫는다(아래 축 3 참조)
 *   - §1:21 — **CLI는 유일한 조립 지점**이다
 *   - §1:23~26 — 배럴은 런타임 경로가 아니라 *"이 패키지가 무엇으로 이루어져 있는가"*의
 *     지도이고, 소속 기준은 *"모듈의 의도된 표면"*이며, 각 export 줄의 `// §n` 주석이
 *     계약 절과 모듈을 잇는다
 *
 * **소스 텍스트를 정적으로 읽는 이유.** `Object.keys(await import(barrel))`로만 재면
 * **타입 export가 보이지 않는다** — §1:25 기준의 절반이 무단언으로 남는다. 그래서 정적
 * 파싱이 주(主)이고 런타임 네임스페이스는 파서 버그를 잡는 보조다(축 1의 마지막 단언).
 *
 * **예산 게이트(`scripts/check-core-budget.mjs`)와의 관계.** 축 2·3은 그쪽과 겹치지만
 * 그쪽은 통합 게이트에서만 돌고 이쪽은 패키지 스코프에서 돈다 — 병렬 구간에서 먼저
 * 알아채는 것이 목적이다(`packages/memory`의 같은 파일과 같은 문면). 수치의 정본은
 * §1:17이 못박은 대로 **스크립트**이고, 여기의 목록과 어긋나면 스크립트가 이긴다.
 *
 * **여기서 다시 쓰지 않는 것.** *"bin은 배럴을 지나지 않는다"*(§1:23)는
 * `distribution-supply-chain.contract.test.ts:170`이 이미 2건으로 소유한다. 같은 사실을
 * 두 파일이 단언하면 어느 쪽이 정본인지 알 수 없어지므로 여기서는 참조만 한다.
 *
 * `stripCommentsAndStrings`는 같은 디렉터리의 위 파일에도 있다. 공유하지 않고 복제한 것은
 * 의도다 — 이 파일의 판정이 다른 계약 테스트의 헬퍼 변경에 끌려가지 않게 한다.
 * `main.ts`가 `node:sqlite`를 **주석에서만** 언급하는 것이 실측된 함정이라(축 3), 주석
 * 제거 없이 텍스트를 grep하면 오탐이 난다.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as barrelNamespace from "../src/index.ts";

const PACKAGE_DIR = fileURLToPath(new URL("../", import.meta.url));
const SRC_DIR = join(PACKAGE_DIR, "src");
const PACKAGE_JSON = join(PACKAGE_DIR, "package.json");
const WORKSPACE_DIR = join(PACKAGE_DIR, "..", "..");

/** 배럴 자신. 격자의 한쪽 축이므로 모듈 목록에서 뺀다. */
const BARREL_FILE = "index.ts";
/** bin 엔트리. export가 0건이라는 전제 위에서 제외한다 — 그 전제도 아래에서 단언한다. */
const BIN_ENTRY_FILE = "main.ts";

// ---------------------------------------------------------------------------
// 소스 파싱
// ---------------------------------------------------------------------------

/** 주석과 문자열 리터럴 본문을 공백으로 지운다(줄 번호·열 폭 보존). */
function stripCommentsAndStrings(source: string): string {
  let out = "";
  let index = 0;
  const blank = (text: string) => text.replace(/[^\n]/g, " ");
  while (index < source.length) {
    const two = source.slice(index, index + 2);
    if (two === "//") {
      const end = source.indexOf("\n", index);
      const stop = end === -1 ? source.length : end;
      out += blank(source.slice(index, stop));
      index = stop;
      continue;
    }
    if (two === "/*") {
      const end = source.indexOf("*/", index + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += blank(source.slice(index, stop));
      index = stop;
      continue;
    }
    const char = source[index];
    if (char === '"' || char === "'" || char === "`") {
      let cursor = index + 1;
      while (cursor < source.length) {
        if (source[cursor] === "\\") {
          cursor += 2;
          continue;
        }
        if (source[cursor] === char) break;
        cursor += 1;
      }
      // 임포트 지정자를 봐야 하므로 리터럴은 남긴다.
      out += source.slice(index, Math.min(cursor + 1, source.length));
      index = Math.min(cursor + 1, source.length);
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

interface ExportedName {
  readonly name: string;
  /** 타입 전용 export인가 — 런타임 네임스페이스에 나타나지 않는 것의 판별 재료. */
  readonly typeOnly: boolean;
}

interface ParsedModule {
  readonly names: ExportedName[];
  /** 파서가 소비하지 못한 `^export` 줄. 하나라도 있으면 실패한다(fail-closed). */
  readonly unconsumed: string[];
}

const DECLARATION =
  /^export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/;
const TYPE_DECLARATION = /^export\s+(?:declare\s+)?(?:type|interface)\s/;
/** `export {…}` — `from`이 있으면 재수출이고 그 지정자가 3번 그룹이다. */
const BLOCK_AT = /^export\s*\{([^}]*)\}\s*(?:from\s*["']([^"']+)["'])?/;
const BLOCK_ENTRY = /^(type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/;
const EXPORT_KEYWORD = /\bexport\b/g;

/**
 * `export` 키워드가 **문 경계**에 있는가 — 문자열 리터럴 안의 `export`를 배제한다.
 *
 * 줄 단위가 아니라 위치 단위로 스캔하는 이유는 QA-A의 독립 검증이 세 구멍을 실증했기
 * 때문이다: ① 들여쓴 `export`(줄 시작 앵커가 놓친다) ② **한 줄에 두 개**
 * (`export const a = 1; export const b = 2;` — 뒤의 것이 통째로 소실됐다. 실측 확인)
 * ③ 그 둘 다 `^export` 줄 검사에도 걸리지 않아 fail-closed조차 조용했다.
 */
function isStatementBoundary(source: string, at: number): boolean {
  for (let cursor = at - 1; cursor >= 0; cursor -= 1) {
    const char = source[cursor];
    if (char === " " || char === "\t") continue;
    return char === "\n" || char === "\r" || char === ";" || char === "{" || char === "}";
  }
  return true;
}

function parseBlockEntries(
  inner: string,
  push: (name: string, typeOnly: boolean) => void,
  unconsumed: string[],
): void {
  for (const raw of inner.split(",")) {
    const entry = raw.trim();
    if (entry === "") continue;
    const matched = BLOCK_ENTRY.exec(entry);
    if (matched?.[2] === undefined) {
      unconsumed.push(entry);
      continue;
    }
    push(matched[3] ?? matched[2], matched[1] !== undefined);
  }
}

/**
 * 한 모듈이 내보내는 이름 전부.
 *
 * **모듈은 재수출을 쓰지 않는다**(`export {…} from`)는 것이 §1의 격자가 서는 전제다 —
 * 모듈이 남의 것을 되내보내면 *"이 이름의 소유 모듈"*이 하나로 정해지지 않아 축 1의
 * 소스 대응 단언이 의미를 잃는다. 오늘 그런 모듈은 0개이고, 생기면 `unconsumed`로
 * 떨어져 fail-closed 단언이 죽는다(`main.ts` export 0건 전제를 단언한 것과 같은 이유).
 */
function parseModuleExports(source: string): ParsedModule {
  const stripped = stripCommentsAndStrings(source);
  const names: ExportedName[] = [];
  const unconsumed: string[] = [];
  for (const match of stripped.matchAll(EXPORT_KEYWORD)) {
    const at = match.index;
    if (!isStatementBoundary(stripped, at)) continue;
    const rest = stripped.slice(at);
    const declared = DECLARATION.exec(rest);
    if (declared?.[1] !== undefined) {
      names.push({ name: declared[1], typeOnly: TYPE_DECLARATION.test(rest) });
      continue;
    }
    const block = BLOCK_AT.exec(rest);
    if (block?.[1] !== undefined && block[2] === undefined) {
      parseBlockEntries(block[1], (name, typeOnly) => names.push({ name, typeOnly }), unconsumed);
      continue;
    }
    unconsumed.push(rest.split("\n")[0]?.trim() ?? "");
  }
  return { names, unconsumed };
}

interface BarrelEntry {
  readonly name: string;
  /** 재수출 원본 모듈의 `src/` 기준 상대 경로 (`./terminal.ts` → `terminal.ts`). */
  readonly module: string;
  readonly typeOnly: boolean;
}

interface ParsedBarrel {
  readonly entries: BarrelEntry[];
  /** 재수출 블록 수. §1:26의 `// §n` 지도가 세는 단위와 같다. */
  readonly blockCount: number;
  readonly unconsumed: string[];
}

function parseBarrel(source: string): ParsedBarrel {
  const stripped = stripCommentsAndStrings(source);
  const entries: BarrelEntry[] = [];
  const unconsumed: string[] = [];
  let blockCount = 0;
  for (const match of stripped.matchAll(EXPORT_KEYWORD)) {
    const at = match.index;
    if (!isStatementBoundary(stripped, at)) continue;
    const block = BLOCK_AT.exec(stripped.slice(at));
    const specifier = block?.[2];
    if (block?.[1] === undefined || specifier === undefined || !specifier.startsWith("./")) {
      unconsumed.push(stripped.slice(at).split("\n")[0]?.trim() ?? "");
      continue;
    }
    blockCount += 1;
    const module = specifier.slice(2);
    parseBlockEntries(
      block[1],
      (name, typeOnly) => entries.push({ name, module, typeOnly }),
      unconsumed,
    );
  }
  return { entries, blockCount, unconsumed };
}

interface Manifest {
  readonly name?: string;
  readonly bin?: Record<string, string>;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
}

function readManifest(path: string): Manifest {
  return JSON.parse(readFileSync(path, "utf8")) as Manifest;
}

/**
 * `src/**`의 `.ts` 전부 — **재귀로 읽는다.**
 *
 * 비재귀로 쓰면 `src/sub/foo.ts`가 격자에서 조용히 사라진다. 축 3은 예산 게이트가
 * 재귀로 받쳐 주지만 **전단사(축 1)는 이 파일이 유일한 기계라 아무 데서도 안 잡힌다** —
 * 게다가 *"배럴에 안 올리면 조용, 올리면 폭발"*이라는 역인센티브까지 생긴다.
 * 가정이 아니다: `packages/providers/src/anthropic/`이 이미 하위 디렉터리를 쓴다.
 * (`packages/memory`의 같은 파일도 처음부터 `recursive: true`였다.)
 */
function srcFileNames(): string[] {
  if (!existsSync(SRC_DIR)) return [];
  return readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".ts"))
    .map((name) => name.split(sep).join("/"))
    .sort();
}

function moduleFileNames(): string[] {
  return srcFileNames().filter((name) => name !== BARREL_FILE && name !== BIN_ENTRY_FILE);
}

function readSrc(fileName: string): string {
  return readFileSync(join(SRC_DIR, fileName), "utf8");
}

/** 모듈 export 전부 — `이름 → 소유 모듈`. */
function collectModuleExports(): Map<string, ExportedName & { module: string }> {
  const collected = new Map<string, ExportedName & { module: string }>();
  for (const fileName of moduleFileNames()) {
    for (const exported of parseModuleExports(readSrc(fileName)).names) {
      collected.set(exported.name, { ...exported, module: fileName });
    }
  }
  return collected;
}

// ---------------------------------------------------------------------------
// 축 1 — 배럴은 모듈 표면의 전단사다 (§1:23~25)
//
// §1:25의 소속 기준(*"모듈의 의도된 표면"*)은 직전 사이클의 전수 적용에서 **예외 0**으로
// *"모듈이 export하면 배럴에 올린다"*로 떨어졌다. 예외가 없으므로 규칙이고, 규칙이면
// 기계가 지킨다 — 그때 누락 8건을 찾은 것은 사람 눈이었고 이 축이 그 부재를 메운다.
// ---------------------------------------------------------------------------

describe("CLI-INTERFACE §1 — 축 1: 배럴은 모듈 표면의 전단사다", () => {
  it("fail-closed: 대상 모듈이 0건이 아니고 제외 상수가 실재하는 파일을 가리킨다", () => {
    // 경로가 바뀌어 전수가 조용히 축소되면 아래 "누락 0"이 공허하게 참이 된다.
    expect(existsSync(SRC_DIR)).toBe(true);
    expect(moduleFileNames().length).toBeGreaterThan(0);
    expect(existsSync(join(SRC_DIR, BARREL_FILE))).toBe(true);
    expect(existsSync(join(SRC_DIR, BIN_ENTRY_FILE))).toBe(true);
  });

  it("fail-closed: bin 엔트리는 export가 0건이다 — 제외의 전제", () => {
    // `main.ts`를 격자에서 빼는 근거는 "내놓는 것이 없다"이다. export가 생기면
    // 그것은 배럴에 올라야 하는 표면인지부터 판정해야 하므로 제외가 무효가 된다.
    const parsed = parseModuleExports(readSrc(BIN_ENTRY_FILE));
    expect(parsed.names.map((entry) => entry.name)).toEqual([]);
    expect(parsed.unconsumed).toEqual([]);
  });

  it("fail-closed: 파서가 소비하지 못한 `export` 줄이 모듈·배럴 어디에도 없다", () => {
    // 이 단언이 파서의 사각을 흡수한다. `export default`·`export * from`처럼 격자에
    // 들어오지 않는 형태가 추가되면 "누락 0"이 아니라 여기가 먼저 죽는다.
    for (const fileName of moduleFileNames()) {
      expect(parseModuleExports(readSrc(fileName)).unconsumed, `${fileName}`).toEqual([]);
    }
    expect(parseBarrel(readSrc(BARREL_FILE)).unconsumed).toEqual([]);
  });

  it("모듈 → 배럴: 모든 모듈 export가 배럴에 있다 (누락 0)", () => {
    const modules = collectModuleExports();
    const barrelNames = new Set(parseBarrel(readSrc(BARREL_FILE)).entries.map((e) => e.name));
    const missing = [...modules.entries()]
      .filter(([name]) => !barrelNames.has(name))
      .map(([name, meta]) => `${meta.module}:${name}`)
      .sort();
    expect(missing).toEqual([]);
  });

  it("배럴 → 모듈: 배럴의 모든 이름이 어느 모듈의 export다 (유령 0)", () => {
    const modules = collectModuleExports();
    const ghosts = parseBarrel(readSrc(BARREL_FILE))
      .entries.filter((entry) => !modules.has(entry.name))
      .map((entry) => `${entry.module}:${entry.name}`)
      .sort();
    expect(ghosts).toEqual([]);
  });

  it("소스 대응: 배럴이 이름을 매단 모듈이 실제 소유 모듈이다", () => {
    // 이름은 맞는데 다른 모듈에서 끌어온 경우 — 위 두 단언은 통과하고 §1:26의 지도만
    // 조용히 거짓이 된다.
    const modules = collectModuleExports();
    const mismatched = parseBarrel(readSrc(BARREL_FILE))
      .entries.filter((entry) => modules.get(entry.name)?.module !== entry.module)
      .map((entry) => `${entry.name}: 배럴=${entry.module} 실제=${modules.get(entry.name)?.module}`)
      .sort();
    expect(mismatched).toEqual([]);
  });

  it("런타임 교차 검증: 배럴 네임스페이스가 값 export를 전부 담는다", () => {
    // 독립 방법으로 정적 파서를 검증한다. **타입은 여기서 보이지 않으므로 이 단언은
    // 축 1의 보조이지 대체가 아니다** — 타입 쪽 절반은 위의 정적 단언만이 잰다.
    const modules = collectModuleExports();
    const expectedValues = [...modules.values()]
      .filter((entry) => !entry.typeOnly)
      .map((entry) => entry.name)
      .sort();
    const runtime = Object.keys(barrelNamespace as Record<string, unknown>).sort();
    expect(runtime).toEqual(expectedValues);
  });
});

// ---------------------------------------------------------------------------
// 축 2 — 의존성 예산 (§1:15~16)
//
// §1:16은 접속사로 이어진 **두 사실**이다: *"워크스페이스 9패키지 정확히"* **그리고**
// *"외부 런타임 의존성 0"*. §39.1의 정밀화대로 절반씩 센다 — 앞은 집합의 상등이고
// 뒤는 집합의 성질이라, 워크스페이스 패키지 하나가 빠지는 회귀는 앞만 잡는다.
//
// **수치를 여기서 세지 않는다.** §1:17이 못박은 대로 정본은 `scripts/check-core-budget.mjs`
// 이고 이 목록은 그것을 서술한다(이 자리는 이미 두 번 어긋난 적이 있다). 아래 목록과
// 스크립트가 갈라지면 **스크립트가 이긴다** — 그때 고칠 것은 이 배열이다.
//
// `DISTRIBUTION.md` §8의 워크스페이스 전역 단언(`distribution-supply-chain.contract.test.ts:673`
// — *"외부 런타임 의존성은 정확히 2개"*)과 겹쳐 보이지만 **근거 문서가 다르다**: 저쪽은
// 10패키지 합계를 `DISTRIBUTION.md`에 대고 재고, 이쪽은 `cli` 하나를 `CLI-INTERFACE.md`
// §1에 대고 잰다. `providers`가 SDK를 얻어도 저쪽 수는 그대로지만 이쪽은 무관하고,
// `cli`가 외부 의존성을 얻으면 이쪽이 먼저 죽는다.
// ---------------------------------------------------------------------------

/** §1:16이 열거한 워크스페이스 패키지. 정본은 `scripts/check-core-budget.mjs`. */
const BUDGETED_WORKSPACE_DEPS = [
  "@neo-agent/compaction",
  "@neo-agent/core",
  "@neo-agent/gate",
  "@neo-agent/memory",
  "@neo-agent/providers",
  "@neo-agent/sandbox",
  "@neo-agent/store",
  "@neo-agent/tools",
  "@neo-agent/web",
];

/**
 * 예산 게이트 스크립트의 `cli` 항목에서 dependencies 배열 리터럴을 **텍스트로** 뽑는다.
 *
 * **임포트가 아니라 텍스트인 이유.** `scripts/check-core-budget.mjs`는 exports가 없고
 * 임포트 시점에 게이트를 실행해 `process.exit(1)`까지 간다 — 임포트로 `PACKAGES`를 읽으면
 * 이 테스트 파일이 스크립트의 판정에 끌려가 죽는다. 스크립트 자신의 "교차 파일 일치"
 * 검사도 같은 방식(텍스트 추출)이라 선례가 있다.
 *
 * 전처리로 `stripCommentsAndStrings`를 통과시킨다 — 이 헬퍼는 주석만 지우고 문자열
 * 리터럴은 남기므로(:84), 주석 처리된 의존성 줄이 추출에 섞이는 경로가 소스에서 막힌다.
 *
 * **fail-closed.** 앵커가 1회가 아니면(0=서식이 바뀌어 못 찾음, 2+=어느 블록인지 모호)
 * 빈 배열을 돌려주지 않고 `anchorCount`를 그대로 넘긴다 — 호출부가 상등 비교 **전에**
 * 그것을 단언하므로, 추출이 깨진 날의 진단은 "상등 불일치"가 아니라 "추출 실패"를 가리킨다.
 */
interface BudgetScriptCliDeps {
  /** `name: "cli"` 앵커의 출현 수. 정확히 1이어야 추출이 성립한다. */
  readonly anchorCount: number;
  /** 추출된 의존성 이름. 앵커가 1회가 아니면 빈 배열이다. */
  readonly deps: string[];
}

function readBudgetScriptCliDeps(): BudgetScriptCliDeps {
  const source = stripCommentsAndStrings(
    readFileSync(join(WORKSPACE_DIR, "scripts", "check-core-budget.mjs"), "utf8"),
  );
  const anchor = /name:\s*"cli"/g;
  const positions: number[] = [];
  for (let hit = anchor.exec(source); hit !== null; hit = anchor.exec(source)) {
    positions.push(hit.index);
  }
  if (positions.length !== 1) return { anchorCount: positions.length, deps: [] };

  const open = source.indexOf("[", source.indexOf("dependencies:", positions[0] as number));
  if (open === -1) return { anchorCount: 1, deps: [] };
  let depth = 0;
  let close = -1;
  for (let cursor = open; cursor < source.length; cursor += 1) {
    if (source[cursor] === "[") depth += 1;
    else if (source[cursor] === "]") {
      depth -= 1;
      if (depth === 0) {
        close = cursor;
        break;
      }
    }
  }
  if (close === -1) return { anchorCount: 1, deps: [] };

  const literals = source.slice(open, close).match(/"([^"]*)"/g) ?? [];
  return { anchorCount: 1, deps: literals.map((literal) => literal.slice(1, -1)) };
}

describe("CLI-INTERFACE §1 — 축 2: 의존성 예산", () => {
  it("fail-closed: 매니페스트가 실재한다", () => {
    expect(existsSync(PACKAGE_JSON)).toBe(true);
  });

  it("패키지 이름이 @neo-agent/cli다 (§1:15)", () => {
    expect(readManifest(PACKAGE_JSON).name).toBe("@neo-agent/cli");
  });

  it("bin 이름이 neo-agent 하나다 (§1:15)", () => {
    expect(Object.keys(readManifest(PACKAGE_JSON).bin ?? {})).toEqual(["neo-agent"]);
  });

  it("런타임 의존성이 워크스페이스 9패키지와 정확히 일치한다 (§1:16 앞절반)", () => {
    // 상등이지 부분집합이 아니다 — 빠지는 것도 계약 위반이다(§1:16 "정확히").
    const deps = Object.keys(readManifest(PACKAGE_JSON).dependencies ?? {}).sort();
    expect(deps).toEqual([...BUDGETED_WORKSPACE_DEPS].sort());
  });

  it("위 목록이 수치의 정본(예산 게이트 스크립트)과 상등이다 (§1:17)", () => {
    // §1:17 — *"수치의 정본은 `scripts/check-core-budget.mjs`이고 이 문장은 그것을
    // 서술한다"*. 위 `BUDGETED_WORKSPACE_DEPS`도 같은 지위의 **복제본**이었고, 복제가
    // 갈라진 채 양쪽 다 그린인 상태가 이 자리에서 이미 두 번 났다(§1:17의 서술 이력).
    // 이 단언이 죽으면 **스크립트가 이긴다** — 고칠 것은 위 배열이지 스크립트가 아니다
    // (축 2 머리 주석과 같은 방향).
    const extracted = readBudgetScriptCliDeps();
    // 상등 비교 **전에** 추출 자체를 잰다 — 서식이 바뀌어 추출이 깨진 날 빈 배열끼리
    // 맞아떨어지는 공허한 그린이 나오면 이 단언은 아무것도 지키지 않는다.
    expect(extracted.anchorCount).toBe(1);
    expect(extracted.deps.length).toBeGreaterThan(0);
    expect([...extracted.deps].sort()).toEqual([...BUDGETED_WORKSPACE_DEPS].sort());
  });

  it("외부 런타임 의존성이 0건이다 (§1:16 뒷절반)", () => {
    // 앞절반과 겹치지만 재는 것이 다르다: 이쪽은 "무엇이 들어왔나"에 무관하게
    // @neo-agent/ 밖의 것이 하나라도 있으면 죽는다.
    const external = Object.keys(readManifest(PACKAGE_JSON).dependencies ?? {}).filter(
      (name) => !name.startsWith("@neo-agent/"),
    );
    expect(external).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 축 3 — 내장 모듈: 허용 목록을 닫는다 (§1:20)
//
// §1:20은 두 목록을 적는다: 금지 6종(`net`·`tls`·`http`·`https`·`child_process`·`sqlite`)과
// 허용 5종(`fs`·`os`·`path`·`readline`·`tty`). **예산 게이트는 금지 쪽만 검사하므로 목록
// 밖의 것은 통과한다** — 오늘 `cli`가 `node:dns`를 임포트해도 `pnpm check:budget`은 그린이다
// (`memory`·`compaction`의 금지 목록에는 dns가 있는데 `cli`에만 빠져 있다. 실측 확인).
//
// dns를 금지 목록에 더해 막을 수도 있지만 그러면 다음 구멍(`dgram`·`vm`·`worker_threads`…)
// 마다 같은 일을 반복한다. §1:20이 **허용 5종을 이미 열거해 뒀으므로** 방향을 뒤집으면
// 목록 밖 전부가 한 번에 닫힌다. 새 계약을 만드는 것이 아니라 이미 적힌 것을 재는 것이다.
//
// **의도된 마찰이다.** 새 내장이 필요해지면 이 목록을 고치기 전에 §1 개정이 선행한다.
// `node:tty`는 오늘 실사용이 없지만 §1이 허용했으므로 목록에 남긴다 — 이 목록의 정본은
// 실사용이 아니라 계약이다.
//
// **`src/`에만 적용한다.** 테스트는 프로브 목적으로 다른 내장을 쓴다(실측:
// `node:url`·`node:child_process`·`node:stream`). 그것은 §1:20이 말하는 대상이 아니다.
// ---------------------------------------------------------------------------

/** §1:20이 허용한 내장 5종. 여기 없는 `node:*`는 전부 위반이다. */
const ALLOWED_NODE_BUILTINS = ["node:fs", "node:os", "node:path", "node:readline", "node:tty"];

/**
 * 정적 import·**부작용 전용 import**·동적 `import()`·`require()` 네 경로를 모두 센다.
 *
 * 부작용 전용(`import "node:dns";`)이 별도 갈래인 것은 반증으로 발견했다 — `from`이 없어
 * 처음 쓴 세 갈래 정규식이 통째로 놓쳤고, 그 상태에서 이 축이 그린이었다. 임포트를 세는
 * 검사는 "무엇을 바인딩하는가"가 아니라 "무엇을 로드하는가"를 재야 한다.
 */
const IMPORT_SPECIFIER = /(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s+)["']([^"']+)["']/g;

/**
 * `node:` 접두사 **없는** 내장 이름.
 *
 * `import "http"`는 Node에서 여전히 유효하고, 접두사만 보는 검사는 그것을 통과시킨다 —
 * QA-A의 독립 검증이 실증했다(주입 후 이 축 23 passed, 예산 게이트만 exit 1).
 * "허용 목록을 닫았다"는 주장이 절반만 참이 되는 경로였다.
 *
 * 이 목록은 §1:20이 이름을 든 것 + 오늘 Node가 제공하는 흔한 내장이다. 완전하지 않아도
 * **접두사 없는 형태가 무조건 통과하던 상태보다는 닫혀 있고**, 알 수 없는 지정자는
 * 아래에서 워크스페이스/상대 경로가 아닌 한 별도로 걸러진다.
 */
const BARE_BUILTINS = [
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "sqlite",
  "stream",
  "string_decoder",
  "sys",
  "timers",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
];

/** 지정자를 `node:x` 정규형으로 되돌린다. 내장이 아니면 `undefined`. */
function normalizeBuiltin(specifier: string): string | undefined {
  if (specifier.startsWith("node:")) return specifier;
  const root = specifier.split("/")[0] ?? "";
  return BARE_BUILTINS.includes(root) ? `node:${specifier}` : undefined;
}

function importedBuiltins(fileName: string): string[] {
  const stripped = stripCommentsAndStrings(readSrc(fileName));
  return [...stripped.matchAll(IMPORT_SPECIFIER)]
    .map((match) => normalizeBuiltin(match[1] ?? ""))
    .filter((specifier): specifier is string => specifier !== undefined);
}

describe("CLI-INTERFACE §1 — 축 3: 내장 모듈 허용 목록 폐쇄", () => {
  it("fail-closed: 검사 대상 파일이 0건이 아니고 내장 임포트가 실제로 검출된다", () => {
    // 파서가 아무것도 못 찾아도 "허용 목록 밖 0건"은 참이 된다 — 그 공허한 통과를 막는다.
    expect(srcFileNames().length).toBeGreaterThan(0);
    expect(srcFileNames().flatMap(importedBuiltins).length).toBeGreaterThan(0);
  });

  it("src/**가 임포트하는 node 내장은 §1:20 허용 5종의 부분집합이다", () => {
    // 금지 목록이 아니라 허용 목록을 재는 것이 요점이다. `node:dns`처럼 §1:20의
    // 어느 목록에도 없는 것이 여기서 잡힌다(예산 게이트는 통과시킨다).
    const offenders = srcFileNames()
      .flatMap((fileName) =>
        importedBuiltins(fileName)
          .filter((specifier) => !ALLOWED_NODE_BUILTINS.includes(specifier))
          .map((specifier) => `${fileName}: ${specifier}`),
      )
      .sort();
    expect(offenders).toEqual([]);
  });

  it("§1:20이 명시적으로 금지한 6종은 어떤 형태로도 나타나지 않는다", () => {
    // 위 단언에 포함되지만 따로 센다: §1:20의 금지 목록은 *왜* 금지인지가 절마다
    // 다르고(네트워크는 providers, 스폰은 tools, DB는 store의 본업), 이 이름들이
    // 들어오면 경계가 샌 것이지 목록이 낡은 것이 아니다.
    const explicitlyForbidden = [
      "node:net",
      "node:tls",
      "node:http",
      "node:https",
      "node:child_process",
      "node:sqlite",
    ];
    const offenders = srcFileNames()
      .flatMap((fileName) =>
        importedBuiltins(fileName)
          .filter((specifier) => explicitlyForbidden.includes(specifier))
          .map((specifier) => `${fileName}: ${specifier}`),
      )
      .sort();
    expect(offenders).toEqual([]);
  });

  it("허용 목록이 §1:20의 열거와 일치한다 — 목록이 조용히 넓어지지 않는다", () => {
    // 이 파일을 고쳐 새 내장을 통과시키는 것이 §1 개정보다 싸서는 안 된다.
    // 목록을 늘리는 커밋은 이 단언을 함께 고쳐야 하고, 그때 §1을 보게 된다.
    expect([...ALLOWED_NODE_BUILTINS].sort()).toEqual([
      "node:fs",
      "node:os",
      "node:path",
      "node:readline",
      "node:tty",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 축 4 — CLI는 유일한 조립 지점이다 (§1:21)
//
// *"코어·도구·게이트·저장소는 서로를 모른다는 기존 계약들은 전부 «결합은 호스트의 배선
// 한 곳»을 전제한다 — 그 한 곳이 여기다."* 오늘 이 문장을 재는 것이 아무것도 없다.
//
// **재는 방법**: 형제 워크스페이스 패키지를 **2개 이상** 의존하는 패키지가 `cli` 하나다.
// 형제를 여럿 끌어오는 것이 곧 결합이고, 그 자리가 둘이 되는 순간 §1:21은 거짓이 된다.
// (실측: `core` 0개, 나머지 8개는 `@neo-agent/core` 하나, `cli`만 9개.)
//
// **측정 단위는 매니페스트 `dependencies`다**(devDep 엣지 단언만 `devDependencies`).
// 무의존 문면의 단위가 `src/**` 임포트 + `dependencies`인 것은 `TOOLS-INTERFACE.md` §1이
// 명문화했다(2026-08-11 J-1) — `src/**` 쪽 절반은 각 패키지의 boundary 계약 테스트가 잰다.
//
// **정확 개수·외부 의존의 정본은 `scripts/check-core-budget.mjs`다 — 여기는 그래프
// 형태만 잰다.** `gate`가 core를 떼면 여기는 그린이고 예산 게이트가 죽는다(F-4) —
// 그 절반을 다른 파일에 기대고 있다는 사실이 이 축의 범위 서술이다.
//
// **축 4가 덮는 것은 넷의 §1 중 형제 의존 그래프뿐이다**(F-5). 금지 모듈(각 §1:16류)은
// 예산 게이트의 소관이고, *"코어와 게이트의 접점은 `beforeToolCall` 훅 하나"*
// (`APPROVAL-GATE.md` §1)는 매니페스트로 원리상 측정 불가라 여기서 재지 않는다.
//
// **스코프 위반처럼 보이는 것에 대하여.** 이 테스트는 CLI 스코프인데 다른 9패키지의
// 매니페스트를 읽는다. 그래도 소유가 여기인 것은 **재는 대상이 CLI의 계약 문장**이기
// 때문이다 — §1:21은 다른 패키지들에 관한 주장의 형태를 하고 있지만 그 주장의 주어는
// CLI의 지위다. 다른 패키지에 이 검사를 두면 각자가 자기 것만 보게 되어 *"한 곳뿐"*을
// 아무도 세지 않는다.
//
// `providers`의 `@anthropic-ai/sdk`는 외부 의존성이라 형제 계산에서 빠진다.
// ---------------------------------------------------------------------------

/**
 * 워크스페이스 10패키지 전부 — fail-closed의 기대값이자 아래 넷 한정·다섯 분리의 존재 전제.
 *
 * §41.2의 교훈("안전망은 파서보다 거친 단위") 계열이다: 스캔 경로가 어긋나거나
 * `package.json`이 개명·유실되어 패키지 하나가 수집에서 빠지면, 아래 단언들은 전부
 * 공허하게 그린이 되는 대신 **여기서 먼저 죽는다**. 새 패키지를 추가하는 커밋은
 * 이 목록과 §1:16 개정이 같은 diff에 있어야 한다(축 2의 목록과 같은 규율 —
 * 수치의 정본은 `scripts/check-core-budget.mjs`, §1:17).
 */
const WORKSPACE_PACKAGE_NAMES = [
  "@neo-agent/cli",
  "@neo-agent/compaction",
  "@neo-agent/core",
  "@neo-agent/gate",
  "@neo-agent/memory",
  "@neo-agent/providers",
  "@neo-agent/sandbox",
  "@neo-agent/store",
  "@neo-agent/tools",
  "@neo-agent/web",
];

/**
 * `dependencies`와 `devDependencies`가 **같은 디렉터리 스캔 하나**에서 나온다 — 두 필드를
 * 별도 스캔으로 모으면 fail-closed(10개 리터럴)가 한쪽만 덮어 F-3이 devDep 쪽에서
 * 재발한다. 필드가 늘면(peer·optional) 여기에 더해 같은 fail-closed 아래에 둔다.
 */
function workspaceManifests(): { name: string; siblings: string[]; devSiblings: string[] }[] {
  const packagesDir = join(WORKSPACE_DIR, "packages");
  if (!existsSync(packagesDir)) return [];
  const siblingsOf = (record: Record<string, string> | undefined) =>
    Object.keys(record ?? {})
      .filter((dep) => dep.startsWith("@neo-agent/"))
      .sort();
  return readdirSync(packagesDir)
    .map((dir) => join(packagesDir, dir, "package.json"))
    .filter((path) => existsSync(path))
    .map((path) => {
      const manifest = readManifest(path);
      return {
        name: manifest.name ?? path,
        siblings: siblingsOf(manifest.dependencies),
        devSiblings: siblingsOf(manifest.devDependencies),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

describe("CLI-INTERFACE §1 — 축 4: 유일한 조립 지점", () => {
  it("fail-closed: 수집된 워크스페이스가 10개 패키지 리터럴과 정확히 일치한다", () => {
    // "0건 아님 + cli 포함"만 보던 이전 형태는 대상 집합의 *구성*을 안 봤다 — `core`가
    // 스캔에서 빠져도 아래 단언 전부가 공허하게 그린이었다(F-3). 정확 일치라
    // 빠지는 것도 늘어나는 것도 여기서 잡힌다(`toContain` 금지).
    expect(workspaceManifests().map((entry) => entry.name)).toEqual(WORKSPACE_PACKAGE_NAMES);
  });

  it("형제 패키지를 2개 이상 의존하는 패키지는 @neo-agent/cli 하나다 (§1:21)", () => {
    const composers = workspaceManifests()
      .filter((entry) => entry.siblings.length >= 2)
      .map((entry) => entry.name);
    expect(composers).toEqual(["@neo-agent/cli"]);
  });

  it("cli 밖의 패키지는 형제를 최대 하나만 의존한다 — 위 단언의 뒷면", () => {
    // 같은 사실을 반대편에서 센다. 위가 "조립하는 자는 하나"라면 이쪽은
    // "나머지는 조립하지 않는다"이고, 진단 메시지에 위반한 패키지 이름이 남는다.
    const offenders = workspaceManifests()
      .filter((entry) => entry.name !== "@neo-agent/cli")
      .filter((entry) => entry.siblings.length >= 2)
      .map((entry) => `${entry.name}: ${entry.siblings.join(",")}`)
      .sort();
    expect(offenders).toEqual([]);
  });

  it("넷(core·tools·gate·store)의 형제 의존은 @neo-agent/core뿐이다 — §1:21이 기댄 전제", () => {
    // 위 두 단언은 **수**만 센다. QA-A의 독립 검증이 그 사각을 지적했다: `store`가
    // `core`를 떼고 `gate` 하나를 넣으면 형제 수는 1이라 그린인데 §1:21이 전제로
    // 든 *"코어·도구·게이트·저장소는 서로를 모른다"*는 거짓이 된다.
    //
    // **이 사실의 정본은 여기가 아니다** — `CORE-INTERFACE.md` §1 · `TOOLS-INTERFACE.md`
    // §1 · `APPROVAL-GATE.md` §1 · `SESSION-STORE.md` §1이다. §1:21이 그것들을 자기
    // 주장의 전제로 인용하므로 전제 점검으로 여기서 잰다. 이 단언이 죽으면 고칠 곳을
    // 찾을 문서는 CLI-INTERFACE가 아니라 위 넷 중 하나다.
    //
    // 그래서 대상도 **그 넷으로 한정한다** — 이전에는 10패키지 전부에 적용됐는데,
    // 그러면 넷이 아닌 다섯(정본이 각자 따로 있다 — 아래 분리 단언)의 위반까지
    // 이 단언이 죽으면서 진단이 무관한 네 문서로 독자를 보냈다(F-2). 넷의 존재는
    // 위 fail-closed의 10개 리터럴이 보증한다.
    const PREMISE_PACKAGES = [
      "@neo-agent/core",
      "@neo-agent/gate",
      "@neo-agent/store",
      "@neo-agent/tools",
    ];
    const offenders = workspaceManifests()
      .filter((entry) => PREMISE_PACKAGES.includes(entry.name))
      .flatMap((entry) =>
        entry.siblings
          .filter((sibling) => sibling !== "@neo-agent/core")
          .map((sibling) => `${entry.name} → ${sibling}`),
      )
      .sort();
    expect(offenders).toEqual([]);
  });

  it("나머지 다섯 패키지의 형제 목록이 각 정본 문서의 예산과 정확히 일치한다", () => {
    // 넷 한정에서 빠진 다섯의 정본은 CLI-INTERFACE도 위 넷의 §1도 아니라 **각자의
    // 문서**다(J-2로 providers·memory의 예산이 문서에 섰다 — 그전에는 예산 게이트만
    // 알고 있었다). 아래 맵의 각 항목이 그 정본의 앵커다. 이 단언이 죽으면 고칠
    // 문서는 죽은 항목의 주석이 가리키는 곳이다.
    //
    // **정확 개수·외부 의존은 `scripts/check-core-budget.mjs`가 소유한다** — 여기는
    // 형제 그래프만 잰다(F-4와 같은 경계). `providers`의 `@anthropic-ai/sdk`·`zod`류
    // 외부 의존이 이 맵에 없는 것은 그래서다.
    const DOCUMENTED_SIBLINGS: Record<string, string[]> = {
      // `CORE-INTERFACE.md` §8 — `@anthropic-ai/sdk` + core 정확히 2개, 형제는 core 하나
      "@neo-agent/providers": ["@neo-agent/core"],
      // `MEMORY.md` §4.4 — `zod` + core 정확히 2개
      "@neo-agent/memory": ["@neo-agent/core"],
      // `WEB-ACCESS.md` §2 — `zod` + core 정확히 2개
      "@neo-agent/web": ["@neo-agent/core"],
      // `SANDBOX.md` §2 — `zod` + core 정확히 2개
      "@neo-agent/sandbox": ["@neo-agent/core"],
      // `COMPACTION.md` §1(경계 절) — core 하나
      "@neo-agent/compaction": ["@neo-agent/core"],
    };
    const manifests = new Map(workspaceManifests().map((entry) => [entry.name, entry]));
    for (const [name, documented] of Object.entries(DOCUMENTED_SIBLINGS)) {
      // 실패 메시지의 두 번째 인자가 위반 패키지를 식별한다.
      expect(manifests.get(name)?.siblings, name).toEqual(documented);
    }
  });

  it("devDependencies의 형제 엣지는 허용 예외 2건과 정확히 일치한다", () => {
    // 테스트 전용 devDependency는 무의존 계약의 위반이 아니라 확인 수단이다 — 단
    // 그 예외는 **문서가 명문화한 2건뿐**이다: `sandbox → tools`(`SANDBOX.md` §2) ·
    // `tools → gate`(`TOOLS-INTERFACE.md` §1). 둘 다 2026-08-11 J-1 명문화.
    //
    // 이전에는 세 번째 devDep 엣지가 생겨도 리포의 어떤 기계도 세지 않았다(§42.4)
    // — 이 단언이 그 기계다. 새 엣지가 필요한 커밋은 해당 정본 문서 개정과 같은
    // diff에 있어야 한다. 수집은 위 fail-closed가 덮는 같은 스캔에서 나오고 `cli`를
    // 제외하지 않는다 — cli의 devDep에 형제가 생겨도 여기서 잡힌다.
    const edges = workspaceManifests()
      .flatMap((entry) => entry.devSiblings.map((sibling) => `${entry.name} → ${sibling}`))
      .sort();
    expect(edges).toEqual([
      "@neo-agent/sandbox → @neo-agent/tools",
      "@neo-agent/tools → @neo-agent/gate",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 축 5 — 배럴은 지도다 (§1:23 · §1:26)
//
// §1:23이 배럴에 준 성격은 *"이 패키지가 **무엇으로 이루어져 있는가**"*이고, §1:26이
// 그 실체로 지목한 것은 *"각 export 줄의 `// §n` 주석"*이다. 지도이려면 두 가지가
// 성립해야 한다: **자기 내용이 없을 것**(재수출 전용)과 **모든 항목에 좌표가 있을 것**
// (`§n` 주석 전수).
//
// 두 번째의 근거는 실측이다 — 직전 사이클(§39.5)에서 **biome가 같은 소스의 export 문을
// 병합해** 주석 두 줄이 겹쳐 쌓인 전례가 있다. 그때는 "줄 밀림"이 아니라 문장 인접에
// 의한 오독이었다. 지도는 "한 소스 = 한 그룹"을 전제하므로 그 전제가 흔들리면 조용히
// 거짓이 된다.
//
// **이 단언의 한계**: 주석의 *존재*만 재고 **내용의 정확성은 재지 않는다.** `// §99`라고
// 적혀 있어도 통과한다. 내용까지 재려면 계약 문서의 절 번호를 읽어야 하는데, 그것은
// 이 축이 아니라 문서-코드 대조의 몫이다.
// ---------------------------------------------------------------------------

describe("CLI-INTERFACE §1 — 축 5: 배럴은 지도다", () => {
  it("fail-closed: 재수출 블록이 0건이 아니다", () => {
    expect(parseBarrel(readSrc(BARREL_FILE)).blockCount).toBeGreaterThan(0);
  });

  it("배럴은 재수출 전용이다 — 자체 선언이 0건이다 (§1:23)", () => {
    // 배럴이 로직을 갖기 시작하면 지도가 아니라 모듈이 되고, 그 순간 축 1의 전단사
    // 격자에서 배럴 자신이 빠져 있다는 사실이 구멍이 된다.
    //
    // 축 1의 fail-closed(미소비 `export` 줄)도 이것을 잡지만 거기서는 *파서가 모르는
    // 형태*라는 이유로 죽는다. 여기서는 **계약이 금지한다**는 이유로 죽는다 — 진단
    // 메시지가 가리키는 곳이 다르다.
    const stripped = stripCommentsAndStrings(readSrc(BARREL_FILE));
    const selfDeclarations = stripped
      .split("\n")
      .filter((line) => DECLARATION.test(line) || /^export\s+default\b/.test(line))
      .map((line) => line.trim());
    expect(selfDeclarations).toEqual([]);
  });

  it("모든 재수출 블록의 앞줄이 `§`를 포함하는 주석이다 (§1:26)", () => {
    // 주석은 소스 원문에서 읽는다 — 지도의 좌표는 파서가 지운 뒤에는 없다.
    const lines = readSrc(BARREL_FILE).split("\n");
    const uncharted: string[] = [];
    lines.forEach((line, index) => {
      if (!/^export\s*\{/.test(line)) return;
      const previous = (lines[index - 1] ?? "").trim();
      if (previous.startsWith("//") && previous.includes("§")) return;
      uncharted.push(`index.ts:${index + 1}: ${line.trim()}`);
    });
    expect(uncharted).toEqual([]);
  });

  it("좌표가 가리키는 곳이 있다 — 블록에 붙지 않은 `§` 주석 그룹이 0건이다", () => {
    // 위 단언의 뒷면. 블록을 지우고 주석만 남기면 지도에 목적지 없는 좌표가 생긴다.
    //
    // **이 단언이 §39.5의 양태는 잡지 못한다.** biome가 같은 소스의 블록 둘을 병합하면
    // 두 주석 줄이 **인접**해 하나의 그룹이 되고, 그 그룹은 여전히 블록 앞에 붙어 있다
    // — 고아가 생기지 않는다. 주석 *줄* 수로 세면 잡히지만 그러면 `wiring.ts` 블록의
    // 정당한 2줄 좌표(§2 + `DISTRIBUTION.md` §6 단서)가 오탐된다. 실측으로 확인:
    // 오늘 주석 줄 15 · 블록 14다. **§39.5는 이 축으로 닫히지 않는다** — 병합된 좌표와
    // 정당한 여러 줄 좌표는 기계적으로 구별되지 않고, 구별하려면 주석 내용을 읽어야 한다.
    const lines = readSrc(BARREL_FILE).split("\n");
    const orphans: string[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      if (!/^\/\/.*§/.test((lines[index] ?? "").trim())) continue;
      // 이 주석이 속한 그룹의 끝까지 건너뛴다.
      let cursor = index;
      while (cursor + 1 < lines.length && (lines[cursor + 1] ?? "").trim().startsWith("//")) {
        cursor += 1;
      }
      if (!/^export\s*\{/.test(lines[cursor + 1] ?? "")) {
        orphans.push(`index.ts:${index + 1}: ${(lines[index] ?? "").trim()}`);
      }
      index = cursor;
    }
    expect(orphans).toEqual([]);
  });
});
