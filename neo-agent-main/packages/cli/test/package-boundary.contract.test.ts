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
