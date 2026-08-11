/**
 * 패키지 경계 — `CLI-INTERFACE.md` §1의 기계화.
 *
 * 기대값의 출처는 전부 §1이다:
 *   - §1:15~16 — 패키지 위치·bin 이름·**의존성 예산**(워크스페이스 9패키지 정확히, 외부 0)
 *   - §1:20 — **금지 모듈 6종 / 허용 5종.** 이 파일은 허용 쪽을 닫는다(아래 축 3 참조)
 *   - §1:21 — **CLI는 유일한 조립 지점**이다
 *   - §1:23~25 — 배럴은 런타임 경로가 아니라 *"이 패키지가 무엇으로 이루어져 있는가"*의
 *     지도이고, 소속 기준은 *"모듈의 의도된 표면"*이며, 각 export 줄의 `// §n` 주석이
 *     계약 절과 모듈을 잇는다
 *
 * **소스 텍스트를 정적으로 읽는 이유.** `Object.keys(await import(barrel))`로만 재면
 * **타입 export가 보이지 않는다** — §1:24 기준의 절반이 무단언으로 남는다. 그래서 정적
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
import { join } from "node:path";
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
const BLOCK_OPEN = /^export\s*\{/;
const BLOCK_ENTRY = /^(type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/;

/** 한 모듈이 내보내는 이름 전부. `export {…} from`(재수출)은 모듈에서는 쓰이지 않는다. */
function parseModuleExports(source: string): ParsedModule {
  const lines = stripCommentsAndStrings(source).split("\n");
  const names: ExportedName[] = [];
  const unconsumed: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!/^export\b/.test(line)) continue;
    const declared = DECLARATION.exec(line);
    if (declared?.[1] !== undefined) {
      names.push({ name: declared[1], typeOnly: TYPE_DECLARATION.test(line) });
      continue;
    }
    if (BLOCK_OPEN.test(line)) {
      let buffer = line;
      let cursor = index;
      while (!buffer.includes("}") && cursor + 1 < lines.length) {
        cursor += 1;
        buffer += `\n${lines[cursor]}`;
      }
      const inner = buffer.slice(buffer.indexOf("{") + 1, buffer.lastIndexOf("}"));
      for (const raw of inner.split(",")) {
        const entry = raw.trim();
        if (entry === "") continue;
        const matched = BLOCK_ENTRY.exec(entry);
        if (matched?.[2] === undefined) {
          unconsumed.push(entry);
          continue;
        }
        names.push({ name: matched[3] ?? matched[2], typeOnly: matched[1] !== undefined });
      }
      index = cursor;
      continue;
    }
    unconsumed.push(line.trim());
  }
  return { names, unconsumed };
}

interface BarrelEntry {
  readonly name: string;
  /** 재수출 원본 모듈의 파일명 (`./terminal.ts` → `terminal.ts`). */
  readonly module: string;
  readonly typeOnly: boolean;
}

interface ParsedBarrel {
  readonly entries: BarrelEntry[];
  /** 재수출 블록 수. §1:25의 `// §n` 지도가 세는 단위와 같다. */
  readonly blockCount: number;
  readonly unconsumed: string[];
}

const REEXPORT = /export\s*\{([^}]*)\}\s*from\s*["']\.\/([\w.-]+)["']\s*;/g;

function parseBarrel(source: string): ParsedBarrel {
  const stripped = stripCommentsAndStrings(source);
  const entries: BarrelEntry[] = [];
  const unconsumed: string[] = [];
  let blockCount = 0;
  for (const match of stripped.matchAll(REEXPORT)) {
    blockCount += 1;
    const module = match[2] ?? "";
    for (const raw of (match[1] ?? "").split(",")) {
      const entry = raw.trim();
      if (entry === "") continue;
      const parsed = BLOCK_ENTRY.exec(entry);
      if (parsed?.[2] === undefined) {
        unconsumed.push(entry);
        continue;
      }
      entries.push({
        name: parsed[3] ?? parsed[2],
        module,
        typeOnly: parsed[1] !== undefined,
      });
    }
  }
  // 재수출 블록으로 소비되지 않은 `^export` 줄 — `export default`·`export * from`·
  // 자체 선언이 들어오면 여기 남는다(축 5가 재수출 전용을 별도로 단언한다).
  const consumedLines = new Set<number>();
  for (const match of stripped.matchAll(REEXPORT)) {
    const start = stripped.slice(0, match.index).split("\n").length - 1;
    const span = match[0].split("\n").length;
    for (let offset = 0; offset < span; offset += 1) consumedLines.add(start + offset);
  }
  stripped.split("\n").forEach((line, index) => {
    if (!/^export\b/.test(line)) return;
    if (consumedLines.has(index)) return;
    unconsumed.push(line.trim());
  });
  return { entries, blockCount, unconsumed };
}

interface Manifest {
  readonly name?: string;
  readonly bin?: Record<string, string>;
  readonly dependencies?: Record<string, string>;
}

function readManifest(path: string): Manifest {
  return JSON.parse(readFileSync(path, "utf8")) as Manifest;
}

function moduleFileNames(): string[] {
  if (!existsSync(SRC_DIR)) return [];
  return readdirSync(SRC_DIR)
    .filter((name) => name.endsWith(".ts"))
    .filter((name) => name !== BARREL_FILE && name !== BIN_ENTRY_FILE)
    .sort();
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
// 축 1 — 배럴은 모듈 표면의 전단사다 (§1:23~24)
//
// §1:24의 소속 기준(*"모듈의 의도된 표면"*)은 직전 사이클의 전수 적용에서 **예외 0**으로
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
    // 이름은 맞는데 다른 모듈에서 끌어온 경우 — 위 두 단언은 통과하고 §1:25의 지도만
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
const BUILTIN_SPECIFIER =
  /(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s+)["'](node:[a-z][a-z0-9/._-]*)["']/g;

function importedBuiltins(fileName: string): string[] {
  const stripped = stripCommentsAndStrings(readSrc(fileName));
  return [...stripped.matchAll(BUILTIN_SPECIFIER)].map((match) => match[1] ?? "");
}

/** 축 3의 대상 — 배럴·bin 엔트리를 포함한 `src/**` 전부. */
function allSrcFileNames(): string[] {
  if (!existsSync(SRC_DIR)) return [];
  return readdirSync(SRC_DIR)
    .filter((name) => name.endsWith(".ts"))
    .sort();
}

describe("CLI-INTERFACE §1 — 축 3: 내장 모듈 허용 목록 폐쇄", () => {
  it("fail-closed: 검사 대상 파일이 0건이 아니고 내장 임포트가 실제로 검출된다", () => {
    // 파서가 아무것도 못 찾아도 "허용 목록 밖 0건"은 참이 된다 — 그 공허한 통과를 막는다.
    expect(allSrcFileNames().length).toBeGreaterThan(0);
    expect(allSrcFileNames().flatMap(importedBuiltins).length).toBeGreaterThan(0);
  });

  it("src/**가 임포트하는 node 내장은 §1:20 허용 5종의 부분집합이다", () => {
    // 금지 목록이 아니라 허용 목록을 재는 것이 요점이다. `node:dns`처럼 §1:20의
    // 어느 목록에도 없는 것이 여기서 잡힌다(예산 게이트는 통과시킨다).
    const offenders = allSrcFileNames()
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
    const offenders = allSrcFileNames()
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
// **스코프 위반처럼 보이는 것에 대하여.** 이 테스트는 CLI 스코프인데 다른 9패키지의
// 매니페스트를 읽는다. 그래도 소유가 여기인 것은 **재는 대상이 CLI의 계약 문장**이기
// 때문이다 — §1:21은 다른 패키지들에 관한 주장의 형태를 하고 있지만 그 주장의 주어는
// CLI의 지위다. 다른 패키지에 이 검사를 두면 각자가 자기 것만 보게 되어 *"한 곳뿐"*을
// 아무도 세지 않는다.
//
// `providers`의 `@anthropic-ai/sdk`는 외부 의존성이라 형제 계산에서 빠진다.
// ---------------------------------------------------------------------------

function workspaceManifests(): { name: string; siblings: string[] }[] {
  const packagesDir = join(WORKSPACE_DIR, "packages");
  if (!existsSync(packagesDir)) return [];
  return readdirSync(packagesDir)
    .map((dir) => join(packagesDir, dir, "package.json"))
    .filter((path) => existsSync(path))
    .map((path) => {
      const manifest = readManifest(path);
      return {
        name: manifest.name ?? path,
        siblings: Object.keys(manifest.dependencies ?? {})
          .filter((dep) => dep.startsWith("@neo-agent/"))
          .sort(),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

describe("CLI-INTERFACE §1 — 축 4: 유일한 조립 지점", () => {
  it("fail-closed: 워크스페이스 매니페스트 수집이 0건이 아니다", () => {
    // 경로가 어긋나 0건이 되면 아래 "조립 지점은 하나"가 공허하게 참이 된다.
    expect(workspaceManifests().length).toBeGreaterThan(0);
    expect(workspaceManifests().map((entry) => entry.name)).toContain("@neo-agent/cli");
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
});

// ---------------------------------------------------------------------------
// 축 5 — 배럴은 지도다 (§1:23 · §1:25)
//
// §1:23이 배럴에 준 성격은 *"이 패키지가 **무엇으로 이루어져 있는가**"*이고, §1:25가
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

  it("모든 재수출 블록의 앞줄이 `§`를 포함하는 주석이다 (§1:25)", () => {
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
