/**
 * 브라우저 e2e 하네스 배선의 독립 검증 — 정본은 docs/TECH-STACK.md §7 표 넷째 행과
 * §7.1(결정 1~9), 그리고 루트 MILESTONE.md의 C2다.
 *
 * 작성 규율: 기대값은 전부 위 두 문서에서 도출했고 하네스 구현에서 읽지 않았다. e2e
 * 디렉터리의 모듈을 하나도 임포트하지 않는다 — 임포트하면 이 파일이 상시 게이트 안에서
 * 하네스를 실행하게 되고, 그 순간 §7.1 결정 2가 게이트 밖으로 뺀 것을 이 검사가 도로
 * 끌어들인다. 여기서 다루는 대상은 전부 파일의 내용과 프로세스의 관측 가능한 거동이다.
 *
 * 왜 자리가 여기인가 — 배선의 소유가 루트이고, 이 디렉터리가 이미 조립 계약을 재는
 * 자리다. e2e 디렉터리 쪽에는 하네스를 실제로 띄워야만 재지는 축만 둔다.
 *
 * 이 파일이 재지 않는 것: §7.1 결정 4의 모의 범위는 하네스를 기동해야 관측되므로
 * e2e/qa-contract.e2e.test.ts가 진다. 그 축은 상시 게이트 밖이다.
 *
 * 인용 계약 — DOC-CITATION.md §6 U-b. 이 자리에 걸리는 것은 대조 축(U-1·D-1·D-2)이고,
 * 이 파일의 주석은 인용부호를 쓰지 않는다 — 대조받지 않는 인용부호는 원문이 이렇다는
 * 신호만 주고 그 신호가 참인지 아무도 묻지 않는다. 문서 지목은 절 번호와 결정 번호로
 * 하고 줄번호를 쓰지 않는다.
 */

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/** packages/cli/test → 워크스페이스 루트 */
const WORKSPACE = resolve(import.meta.dirname, "..", "..", "..");
const E2E_DIR = join(WORKSPACE, "e2e");
const ROOT_MANIFEST = join(WORKSPACE, "package.json");
const VITEST_BIN = join(WORKSPACE, "node_modules", "vitest", "vitest.mjs");
const TSC_BIN = join(WORKSPACE, "node_modules", "typescript", "bin", "tsc");

const read = (path: string): string => readFileSync(path, "utf8");
const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(read(path)) as Record<string, unknown>;

const scripts = (): Record<string, string> =>
  (readJson(ROOT_MANIFEST).scripts ?? {}) as Record<string, string>;

/** e2e 디렉터리 안의 모든 .ts 이름. 손 목록을 두면 파일이 늘 때 모집단이 조용히 낡는다 */
function e2eSources(): string[] {
  return readdirSync(E2E_DIR)
    .filter((name) => name.endsWith(".ts"))
    .sort();
}

/** 그중 러너가 테스트로 볼 후보 — vitest 기본 테스트 글롭의 이름 규약 */
const DEFAULT_TEST_NAME = /\.(?:test|spec)\.(?:[cm])?[jt]sx?$/;

/** 주석과 문자열 리터럴 내용을 지운다 — 주석에 적힌 표기는 호출이 아니다 */
function stripCommentsAndStrings(source: string, options?: { keepStrings?: boolean }): string {
  let out = "";
  let index = 0;
  const blank = (text: string): string => text.replace(/[^\n]/g, " ");
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
      const literal = source.slice(index, Math.min(cursor + 1, source.length));
      out += options?.keepStrings === true ? literal : char + blank(literal.slice(1, -1)) + char;
      index = Math.min(cursor + 1, source.length);
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

/** 러너가 실제로 수집하는 파일 목록. 설정 이름을 인자로 받아 두 러너를 같은 수단으로 잰다 */
function collectedFiles(config: string): string[] {
  const result = spawnSync(
    process.execPath,
    [VITEST_BIN, "list", "--config", config, "--filesOnly"],
    { cwd: WORKSPACE, encoding: "utf8", env: cleanEnv() },
  );
  expect(result.status, `vitest list ${config}: ${result.stderr}`).toBe(0);
  return result.stdout
    .split("\n")
    .map((line) => line.replace(/^\[[^\]]*\]\s*/, "").trim())
    .filter((line) => line !== "");
}

/** 자식 vitest가 부모 런의 워커 변수를 물려받지 않게 한다 */
function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("VITEST")) continue;
    env[key] = value;
  }
  return { ...env, ...extra };
}

// ---------------------------------------------------------------------------
// §7.1 결정 3 · 결정 2 — 분리. 상시 러너가 하네스를 원리적으로 안 집는가
// ---------------------------------------------------------------------------

describe("TECH-STACK §7.1 결정 3 — 분리는 배치가 강제한다", () => {
  it("A-1 상시 러너의 프로젝트 글롭이 packages 아래 한 단계다", () => {
    // 결정 3이 자리를 그 글롭 밖의 루트 별도 디렉터리로 정했고, 그 밖은 원리적으로 안
    // 집힌다는 것이 분리의 근거다. 글롭이 넓어지면 그 근거가 통째로 죽는다.
    const config = read(join(WORKSPACE, "vitest.config.ts"));
    const stripped = stripCommentsAndStrings(config, { keepStrings: true });
    const projects = /projects:\s*\[([^\]]*)\]/.exec(stripped);
    expect(projects, "상시 러너 설정에서 프로젝트 목록을 찾지 못했다").not.toBeNull();
    const entries = [...(projects?.[1] ?? "").matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
    expect(entries).toEqual(["packages/*"]);
  });

  it("A-2 상시 러너가 수집하는 파일에 e2e 디렉터리가 0건이다", () => {
    const files = collectedFiles("vitest.config.ts");
    expect(files.length, "상시 러너가 아무 파일도 수집하지 않았다").toBeGreaterThan(0);
    const leaked = files.filter((file) => file.startsWith("e2e/") || file.includes("/e2e/"));
    expect(leaked, "하네스가 상시 게이트 안으로 들어왔다").toEqual([]);
  });

  it("A-3 그 0건이 이름 규약 덕이 아니다 — 이름은 이미 기본 글롭에 부합한다", () => {
    // 결정 3이 이름 규약 갈래를 기각한 근거가 이름 하나를 잘못 붙이는 날 하네스가 조용히
    // 게이트 안으로 들어온다는 것이었다. 그 기각이 실물로 서려면 e2e 쪽 파일 이름이
    // 상시 러너의 기본 테스트 글롭에 부합하는데도 안 집혀야 한다 — 안 부합하면 위 축은
    // 배치가 아니라 이름이 만든 결과이고 결정 3은 아직 안 재진 것이다.
    const named = e2eSources().filter((name) => DEFAULT_TEST_NAME.test(name));
    expect(named.length, "e2e 디렉터리에 기본 글롭에 부합하는 이름이 0건이다").toBeGreaterThan(0);

    const rootFiles = collectedFiles("vitest.config.ts");
    const e2eFiles = collectedFiles("vitest.e2e.config.ts");
    for (const name of named) {
      expect(
        rootFiles.some((file) => file.endsWith(name)),
        `${name}: 상시 러너가 집었다`,
      ).toBe(false);
    }
    // 수집 수단 자체가 e2e 디렉터리를 볼 수 있다는 것의 확인. 이것이 없으면 위 false는
    // 수단이 그 자리를 원래 못 보는 것으로도 참이 된다.
    expect(e2eFiles.length, "전용 러너도 아무 파일을 못 봤다").toBeGreaterThan(0);
    expect(e2eFiles.every((file) => file.startsWith("e2e/"))).toBe(true);
  });

  it("A-4 e2e 디렉터리가 워크스페이스 패키지가 아니다", () => {
    expect(existsSync(join(E2E_DIR, "package.json"))).toBe(false);
    const workspace = read(join(WORKSPACE, "pnpm-workspace.yaml"));
    const globs = [...workspace.matchAll(/^\s*-\s*["']?([^"'\s]+)["']?\s*$/gm)].map((m) => m[1]);
    expect(globs).toEqual(["packages/*"]);
  });

  it("A-5 하네스가 packages/serve/test 안에 없다", () => {
    // 결정 3이 그 자리를 기각한 근거는 serve가 cli를 개발 의존으로 얻어야 한다는 것이다.
    const serveTests = join(WORKSPACE, "packages", "serve", "test");
    const names = existsSync(serveTests) ? readdirSync(serveTests) : [];
    expect(names.filter((name) => name.includes("harness"))).toEqual([]);
    const serveManifest = readJson(join(WORKSPACE, "packages", "serve", "package.json"));
    const serveDev = Object.keys(
      (serveManifest.devDependencies ?? {}) as Record<string, string>,
    ).sort();
    expect(serveDev).not.toContain("@neo-agent/cli");
  });
});

// ---------------------------------------------------------------------------
// §7.1 결정 2 — 편입. 하네스 소스가 게이트의 타입 검사 모집단 안인가
// ---------------------------------------------------------------------------

describe("TECH-STACK §7.1 결정 2 — 타입 검사는 게이트 안에 남는다", () => {
  it("B-1 게이트가 타입 검사를 부르고, 그 타입 검사가 e2e 프로그램을 부른다", () => {
    const all = scripts();
    expect(all.check, "check 스크립트가 없다").toBeDefined();
    expect(all.check).toContain("typecheck");
    expect(all.typecheck, "typecheck 스크립트가 없다").toBeDefined();
    expect(all.typecheck).toContain("e2e/tsconfig.json");
  });

  it("B-2 그 프로그램이 e2e 디렉터리의 .ts를 남김없이 문다 (실측 파일 목록)", () => {
    // include 표기를 읽어 추론하지 않고 컴파일러에게 되묻는다. 표기가 맞아도 확장자나
    // 해석 규칙 때문에 실제 프로그램에서 빠지는 갈래가 있고, 그 갈래는 조용하다.
    const result = spawnSync(
      process.execPath,
      [TSC_BIN, "--noEmit", "--listFiles", "-p", "e2e/tsconfig.json"],
      { cwd: WORKSPACE, encoding: "utf8", env: cleanEnv() },
    );
    expect(result.status, `타입 검사가 오늘 붉다: ${result.stdout}`).toBe(0);
    const listed = result.stdout.split("\n").map((line) => line.trim());
    const sources = e2eSources();
    expect(sources.length, "e2e 디렉터리에 .ts가 0건이다").toBeGreaterThan(0);
    for (const name of sources) {
      const path = join(E2E_DIR, name);
      expect(listed, `${name}: 타입 검사 모집단 밖이다`).toContain(path);
    }
  }, 120_000);

  it("B-3 역검증 — 그 설정 모양이 타입 오류를 실제로 붉힌다", () => {
    // B-2가 재는 것은 모집단이고 이 축이 재는 것은 그 모집단이 판정을 내리는가다. 둘이
    // 갈리면 파일은 들어 있는데 아무것도 안 걸러지는 검사가 남는다.
    const fixture = mkdtempSync(join(WORKSPACE, ".qa-e2e-typecheck-"));
    try {
      cpSync(join(E2E_DIR, "tsconfig.json"), join(fixture, "tsconfig.json"));
      writeFileSync(join(fixture, "ok.ts"), "export const ok: number = 1;\n");
      const clean = spawnSync(process.execPath, [TSC_BIN, "--noEmit", "-p", fixture], {
        cwd: WORKSPACE,
        encoding: "utf8",
        env: cleanEnv(),
      });
      expect(clean.status, `픽스처가 애초에 붉다: ${clean.stdout}`).toBe(0);

      writeFileSync(join(fixture, "probe.ts"), "export const bad: number = 'not a number';\n");
      const dirty = spawnSync(process.execPath, [TSC_BIN, "--noEmit", "-p", fixture], {
        cwd: WORKSPACE,
        encoding: "utf8",
        env: cleanEnv(),
      });
      expect(dirty.status, "타입 오류를 심었는데 통과했다").not.toBe(0);
      expect(dirty.stdout).toContain("probe.ts");
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  }, 120_000);
});

// ---------------------------------------------------------------------------
// §7 표 넷째 행 · §7.1 결정 7 — 실행은 상시 게이트 밖
// ---------------------------------------------------------------------------

describe("TECH-STACK §7 표 · §7.1 결정 7 — 게이트 편입 0", () => {
  it("C-1 게이트 스크립트가 e2e 실행을 부르지 않는다 (전이 포함)", () => {
    const all = scripts();
    const seen = new Set<string>();
    const visit = (name: string): string[] => {
      if (seen.has(name)) return [];
      seen.add(name);
      const body = all[name] ?? "";
      const called = [...body.matchAll(/pnpm\s+([A-Za-z0-9:_-]+)/g)].map((m) => m[1] ?? "");
      return [name, ...called.flatMap(visit)];
    };
    const reachable = visit("check");
    expect(reachable, "게이트가 자기 자신을 못 폈다").toContain("typecheck");
    expect(reachable, "e2e 실행이 상시 게이트 안으로 들어왔다").not.toContain("test:e2e");
    for (const name of reachable) {
      expect(all[name] ?? "", `${name}: 게이트 경로가 e2e 러너를 직접 부른다`).not.toContain(
        "vitest.e2e.config.ts",
      );
    }
  });

  it("C-2 e2e 실행은 전용 설정을 명시로 지목한다", () => {
    const all = scripts();
    expect(all["test:e2e"], "test:e2e 스크립트가 없다").toBeDefined();
    expect(all["test:e2e"]).toContain("vitest.e2e.config.ts");
    // 러너는 이미 있는 것을 그대로 쓴다 (결정 1) — 별도 러너 이름이 들어오면 갈린다.
    expect(all["test:e2e"]).not.toContain("playwright test");
  });

  it("C-3 전용 설정이 e2e 자리만 수집한다", () => {
    const config = read(join(WORKSPACE, "vitest.e2e.config.ts"));
    const stripped = stripCommentsAndStrings(config, { keepStrings: true });
    const include = /include:\s*\[([^\]]*)\]/.exec(stripped);
    expect(include, "전용 설정에서 수집 목록을 찾지 못했다").not.toBeNull();
    const globs = [...(include?.[1] ?? "").matchAll(/["']([^"']+)["']/g)].map((m) => m[1] ?? "");
    expect(globs.length).toBeGreaterThan(0);
    for (const glob of globs) expect(glob.startsWith("e2e/")).toBe(true);
  });

  it("C-4 [미규정] e2e 자리의 테스트 이름이 전용 설정의 수집 규약과 어긋나지 않는다", () => {
    // §7.1은 전용 러너의 수집 규약을 정하지 않는다. 그런데 오늘의 규약은 이름 규약이고,
    // 그 규약에서 빗나간 이름이 e2e 자리에 들어오면 그 파일은 상시 러너도 전용 러너도
    // 안 집는 상태가 된다 — 검사 없음과 통과가 구분되지 않는 결과다. 원인 쪽이
    // 미규정이어도 그 결과는 ARCHITECTURE §2.6이 금지한 부류이므로 오늘 값을 붙든다.
    // 판정이 필요한 것은 이 축의 등급이지 오늘 실물이 아니다 — 리포트에 올렸다.
    const e2eFiles = collectedFiles("vitest.e2e.config.ts").map((file) => file.split("/").pop());
    const orphans = e2eSources().filter(
      (name) => DEFAULT_TEST_NAME.test(name) && !e2eFiles.includes(name),
    );
    expect(orphans, "어느 러너도 안 집는 테스트 파일이 e2e 자리에 있다").toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §7.1 결정 6 — 브라우저 부재는 건너뛰기가 아니라 실패
// ---------------------------------------------------------------------------

describe("TECH-STACK §7.1 결정 6 — 부재는 실패다", () => {
  const empty = mkdtempSync(join(tmpdir(), "neo-qa-no-browser-"));
  afterAll(() => rmSync(empty, { recursive: true, force: true }));

  it("D-1 e2e 자리에 건너뛰기 호출이 0건이다", () => {
    const found: string[] = [];
    for (const name of e2eSources()) {
      const code = stripCommentsAndStrings(read(join(E2E_DIR, name)));
      if (/\b(?:it|test|describe)\s*\.\s*(?:skip|skipIf|runIf|todo)\b/.test(code)) found.push(name);
      if (/\bctx\s*\.\s*skip\s*\(/.test(code)) found.push(name);
    }
    expect(found, "브라우저 축이 건너뛸 수 있는 자리가 있다").toEqual([]);
  });

  it("D-2 어떤 스크립트도 브라우저를 자동으로 내려받지 않는다", () => {
    for (const [name, body] of Object.entries(scripts())) {
      expect(body, `${name}: 명령이 브라우저를 조용히 확보한다`).not.toMatch(
        /playwright\s+install/,
      );
    }
  });

  it("D-3 브라우저를 여는 자리가 하나다", () => {
    const openers: string[] = [];
    for (const name of e2eSources()) {
      const code = stripCommentsAndStrings(read(join(E2E_DIR, name)));
      if (/\b(?:chromium|firefox|webkit)\s*\.\s*launch(?:Persistent\w*)?\s*\(/.test(code)) {
        openers.push(name);
      }
    }
    expect(openers).toEqual(["browser.ts"]);
  });

  it("D-4 그 관문을 실제로 지나는 축이 최소 하나 있다", () => {
    // 관문만 있고 그것을 지나는 축이 0건이면 브라우저 없이도 전용 명령이 초록으로 끝난다.
    // 결정 6이 금지한 결과가 파일 구성만으로 성립하는 갈래이고, 오늘 그것을 막는 것은
    // 브라우저 축의 존재뿐이라 그 존재를 여기서 붙든다.
    const users = e2eSources().filter((name) => {
      if (!DEFAULT_TEST_NAME.test(name)) return false;
      const code = stripCommentsAndStrings(read(join(E2E_DIR, name)), { keepStrings: true });
      return /launchBrowser/.test(code);
    });
    expect(users.length, "브라우저를 여는 테스트 축이 0건이다").toBeGreaterThan(0);
  });

  it("D-5 브라우저가 없으면 비영 종료하고 문면이 다음 행동을 든다", () => {
    // 브라우저 캐시를 빈 디렉터리로 돌려 부재를 만든다. 실제 브라우저를 지우지 않으므로
    // 이 축은 이 머신에 브라우저가 있든 없든 같은 값을 낸다.
    const result = spawnSync(
      process.execPath,
      [VITEST_BIN, "run", "--config", "vitest.e2e.config.ts", "e2e/browser.e2e.test.ts"],
      {
        cwd: WORKSPACE,
        encoding: "utf8",
        env: cleanEnv({ PLAYWRIGHT_BROWSERS_PATH: empty }),
      },
    );
    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status, `부재인데 초록으로 끝났다: ${output}`).not.toBe(0);
    // 건너뛴 것이 아니라 실패다.
    expect(output).toMatch(/failed/);
    expect(output, "부재가 건너뛰기로 처분됐다").not.toMatch(/\bskipped\b/);
    // 문면이 다음 행동을 든다.
    expect(output, "설치 명령이 문면에 없다").toMatch(/playwright install/);
    // 그리고 그 실패가 수집 0건과 구별된다 — 종료 코드는 둘 다 비영이라 문면이 가른다.
    expect(output, "부재 실패가 수집 0건과 구별되지 않는다").not.toContain("No test files found");
  }, 180_000);

  it("D-6 수집 0건도 비영 종료다 — 위 축의 구별이 뜻을 갖는 전제", () => {
    const result = spawnSync(
      process.execPath,
      [
        VITEST_BIN,
        "run",
        "--config",
        "vitest.e2e.config.ts",
        "e2e/this-file-does-not-exist.e2e.test.ts",
      ],
      { cwd: WORKSPACE, encoding: "utf8", env: cleanEnv() },
    );
    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status, "수집 0건인데 초록으로 끝났다").not.toBe(0);
    expect(output).toContain("No test files found");
  }, 180_000);
});

// ---------------------------------------------------------------------------
// §7.1 결정 1 · 결정 8 · 결정 9 — 도구 표면
// ---------------------------------------------------------------------------

describe("TECH-STACK §7.1 결정 1·8·9 — 도구 표면", () => {
  const manifests = (): { path: string; manifest: Record<string, unknown> }[] => {
    const paths = [ROOT_MANIFEST];
    for (const entry of readdirSync(join(WORKSPACE, "packages"), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(WORKSPACE, "packages", entry.name, "package.json");
      if (existsSync(path)) paths.push(path);
    }
    return paths.sort().map((path) => ({ path, manifest: readJson(path) }));
  };

  it("E-1 새 외부 개발 의존성이 playwright 하나이고 정확 핀이다", () => {
    const root = readJson(ROOT_MANIFEST);
    const dev = (root.devDependencies ?? {}) as Record<string, string>;
    expect(dev.playwright, "루트가 playwright를 개발 의존으로 안 든다").toBeDefined();
    expect(dev.playwright).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("E-2 기각된 갈래 둘이 매니페스트 어디에도 없다", () => {
    // 결정 1이 브라우저 모드와 전용 러너를 각각 기각했다. 이름이 트리에 들어오면 그
    // 기각이 죽은 것이므로 워크스페이스 전량에서 본다.
    for (const { path, manifest } of manifests()) {
      for (const group of ["dependencies", "devDependencies"]) {
        for (const name of Object.keys((manifest[group] ?? {}) as Record<string, string>)) {
          expect(name, `${path}: 기각된 갈래가 들어왔다`).not.toBe("@playwright/test");
          expect(name, `${path}: 기각된 갈래가 들어왔다`).not.toMatch(/^@vitest\/browser/);
        }
      }
    }
  });

  it("E-3 e2e 자리가 러너를 둘로 늘리지 않는다", () => {
    for (const name of e2eSources()) {
      const code = stripCommentsAndStrings(read(join(E2E_DIR, name)), { keepStrings: true });
      const specs = [...code.matchAll(/\bfrom\s*["']([^"']+)["']/g)].map((m) => m[1] ?? "");
      expect(specs, `${name}: 전용 러너를 들여온다`).not.toContain("@playwright/test");
      if (DEFAULT_TEST_NAME.test(name)) {
        expect(specs, `${name}: 단정을 vitest에서 안 받는다`).toContain("vitest");
      }
    }
  });

  it("E-4 시각 회귀를 두지 않는다 (결정 9)", () => {
    for (const name of e2eSources()) {
      const code = stripCommentsAndStrings(read(join(E2E_DIR, name)));
      expect(code, `${name}: 스크린샷을 찍는다`).not.toMatch(/\.\s*screenshot\s*\(/);
      expect(code, `${name}: 시각 스냅샷을 재운다`).not.toMatch(
        /toMatchSnapshot|toHaveScreenshot|toMatchImageSnapshot/,
      );
    }
  });

  it("E-5 배포 문서의 개발 의존성 종수와 이름이 playwright를 든다 (결정 8)", () => {
    const distribution = read(join(WORKSPACE, "docs", "DISTRIBUTION.md"));
    expect(distribution, "배포 문서가 playwright를 안 든다").toContain("playwright");
    // 종수와 집합의 분담은 그 문서와 공급망 계약 테스트가 진다 — 여기서는 둘이 같은
    // 사이클에 움직였는지만 본다.
    const contract = read(
      join(WORKSPACE, "packages", "cli", "test", "distribution-supply-chain.contract.test.ts"),
    );
    expect(contract, "공급망 계약이 playwright를 집합에 안 든다").toContain("playwright");
  });

  it("E-6 [미규정] 루트에 워크스페이스 개발 의존이 하나 늘었고 그 수를 아무도 안 잰다", () => {
    // §7.1은 외부 개발 의존성의 수만 계약으로 든다. 하네스가 조립을 열려고 루트에 붙인
    // 워크스페이스 엣지는 그 계약의 모집단 밖이고, 공급망 계약 테스트도 이름 접두로
    // 걸러 낸다. 즉 이 엣지는 오늘 어느 검사도 안 잰다 — 결정 3이 packages/serve/test를
    // 기각한 근거가 정확히 같은 부류의 엣지였다. 등급 판정은 계약 소유자의 몫이므로
    // 오늘 값을 붙들기만 한다.
    const root = readJson(ROOT_MANIFEST);
    const dev = (root.devDependencies ?? {}) as Record<string, string>;
    const workspaceEdges = Object.keys(dev)
      .filter((name) => name.startsWith("@neo-agent/"))
      .sort();
    expect(workspaceEdges).toEqual(["@neo-agent/cli"]);
  });
});

// ---------------------------------------------------------------------------
// §7.1 결정 4 · 결정 5 — 하네스가 무엇을 실물로 두는가 (정적으로 재지는 만큼)
// ---------------------------------------------------------------------------

describe("TECH-STACK §7.1 결정 4·5 — 조립 실물과 포트", () => {
  it("F-1 하네스가 서버에 넘기는 포트가 0이다", () => {
    const code = stripCommentsAndStrings(read(join(E2E_DIR, "harness.ts")), { keepStrings: true });
    expect(code, "포트를 0으로 안 받는다").toMatch(/\bport:\s*0\b/);
  });

  it("F-2 e2e 자리에 고정 포트가 박혀 있지 않다", () => {
    for (const name of e2eSources()) {
      const code = stripCommentsAndStrings(read(join(E2E_DIR, name)), { keepStrings: true });
      const literals = [...code.matchAll(/\b(?:127\.0\.0\.1|localhost):(\d{2,5})\b/g)].map(
        (m) => m[1] ?? "",
      );
      expect(literals, `${name}: 고정 포트가 박혔다`).toEqual([]);
      const ports = [...code.matchAll(/\bport:\s*(\d+)/g)].map((m) => m[1] ?? "");
      for (const value of ports) expect(value, `${name}: 고정 포트를 넘긴다`).toBe("0");
    }
  });

  it("F-3 e2e 자리가 실 모델 SDK를 직접 열지 않는다", () => {
    // 결정 4가 실 API로 도는 e2e를 금지한다. 모의 모델이 조립의 팩토리로 들어가는 것과
    // 하네스가 SDK를 직접 여는 것은 다른 일이고, 뒤엣것은 키와 과금을 e2e에 들인다.
    for (const name of e2eSources()) {
      const code = stripCommentsAndStrings(read(join(E2E_DIR, name)), { keepStrings: true });
      const specs = [...code.matchAll(/\bfrom\s*["']([^"']+)["']/g)].map((m) => m[1] ?? "");
      expect(specs, `${name}: 모델 SDK를 직접 연다`).not.toContain("@anthropic-ai/sdk");
    }
  });

  it("F-4 하네스가 실사용 상태 디렉터리에 닿지 않는다", () => {
    const code = stripCommentsAndStrings(read(join(E2E_DIR, "harness.ts")), { keepStrings: true });
    expect(code, "실사용 홈을 쓴다").not.toMatch(/homedir\s*\(/);
    expect(code, "임시 뿌리를 안 만든다").toMatch(/mkdtempSync/);
  });

  it("F-5 결정 4 개정(2026-08-28, K-369) 전 옛 문구가 e2e 자리에 재발하지 않는다", () => {
    // 이 축은 오늘의 grep을 대체하는 것이 아니라, 오늘 손으로 닫은 것(T-003, K-369)을
    // 다음부터 기계가 지키게 하는 것이다 — 없으면 다음 개정에서 같은 형태(문서가 바뀐
    // 뒤에도 주석이 옛 문면을 든 채 남는 것)가 다시 난다. 여섯 문구는 결정 4가 개정되기
    // 전 실제로 이 디렉터리에 있었고 오늘 정정된 것들이다. 주석·문자열을 안 지우고
    // 그대로 찾는다 — 문구가 문자열 리터럴 안에 있어도 재발이기 때문이다.
    const STALE_PHRASES = [
      "모의는 모델 하나뿐",
      "모의는 모델뿐",
      "모델이 유일한 모의",
      "모델을 유일한 모의로 정했으므로",
      "모의로 두는 것은 모델뿐인가",
      "신호 호스트의 모의",
    ];
    const offenders: string[] = [];
    for (const name of e2eSources()) {
      const code = read(join(E2E_DIR, name));
      for (const phrase of STALE_PHRASES) {
        if (code.includes(phrase)) offenders.push(`${name}: "${phrase}"`);
      }
    }
    expect(offenders, "결정 4 개정 전 옛 문구가 재발했다").toEqual([]);
  });
});
