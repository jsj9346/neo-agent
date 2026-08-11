/**
 * 배포 계약의 독립 검증 — `docs/DISTRIBUTION.md` §3.2(bin shim) · §4(버전 정본) ·
 * §8(공급망).
 *
 * **작성 규율(QA-A)**: 기대값은 전부 위 문서에서 도출했고, 구현 코드를 읽어 얻은
 * 값을 기대값으로 적지 않았다. 구현 모듈을 임포트하지 않으며(임포트하면 검사할
 * 것이 없다) 캐스트도 쓰지 않는다 — 여기서 다루는 대상은 전부 **파일의 내용과
 * 프로세스의 관측 가능한 거동**이지 타입이 아니다.
 *
 * 왜 이 파일이 필요한가 — 세 절의 강제 수단은 `scripts/check-core-budget.mjs`
 * 하나인데, **그 게이트 자신을 검사하는 것은 아무것도 없었다.** 게이트가 조용히
 * 대상을 놓치면(파일 개명·목록 누락·정규식 노후화) "검사 없음"과 "통과"가
 * 구분되지 않는다(`ARCHITECTURE.md` §2.6). 그래서 이 파일의 절반은 **게이트를
 * 고의로 위반시켜 떨어지는지 보는 역검증**이며, 고의 위반은 전부 레포가 아니라
 * `mkdtemp` 복사본에서 한다 — 테스트가 중간에 죽어도 작업 트리가 더럽혀지지 않는
 * 유일한 방법이다.
 */

import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** `packages/cli/test` → 워크스페이스 루트 */
const WORKSPACE = resolve(import.meta.dirname, "..", "..", "..");
const SHIM = join(WORKSPACE, "packages", "cli", "bin", "neo-agent.mjs");
const REGISTRATION = join(
  WORKSPACE,
  "packages",
  "providers",
  "src",
  "anthropic",
  "registration.ts",
);
const GATE = join(WORKSPACE, "scripts", "check-core-budget.mjs");

const read = (path: string): string => readFileSync(path, "utf8");
const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(read(path)) as Record<string, unknown>;

/** 워크스페이스가 실제로 여기다 — 경로 계산이 어긋나면 이 파일 전체가 무의미하다 */
it("워크스페이스 루트 계산이 맞다 (이 파일의 모든 단정의 전제)", () => {
  expect(existsSync(join(WORKSPACE, "pnpm-workspace.yaml"))).toBe(true);
  expect(readJson(join(WORKSPACE, "package.json")).name).toBe("neo-agent-workspace");
});

/** 루트 1 + `packages/*` 전부. 목록을 하드코딩하지 않고 디스커버리한다 */
function manifestPaths(root: string): string[] {
  const paths = [join(root, "package.json")];
  for (const entry of readdirSync(join(root, "packages"), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(root, "packages", entry.name, "package.json");
    if (existsSync(path)) paths.push(path);
  }
  return paths.sort();
}

/**
 * `DISTRIBUTION.md` §4가 "각 `package.json`"이라고 쓴 것의 실제 개수. 이 수를 여기
 * 고정해 두는 이유는 게이트가 **한 개라도 빠뜨린 채 통과**하는 것을 잡기 위해서다
 * — 빠뜨린 게이트도 "통과"라고 출력한다.
 */
const MANIFEST_COUNT = 11;

// ---------------------------------------------------------------------------
// §3.2 — bin 진입점과 shim의 표면
// ---------------------------------------------------------------------------

describe("DISTRIBUTION §3.2 — bin shim", () => {
  it("bin은 `packages/cli/bin/neo-agent.mjs`를 가리킨다", () => {
    // §3.2: "bin은 `packages/cli/bin/neo-agent.mjs`(순수 JS)를 가리킨다."
    // 게이트는 이것을 검사하지 않는다 — bin이 `./src/main.ts`로 되돌아가도 게이트는 통과한다.
    const manifest = readJson(join(WORKSPACE, "packages", "cli", "package.json"));
    expect(manifest.bin).toEqual({ "neo-agent": "./bin/neo-agent.mjs" });
    expect(existsSync(SHIM)).toBe(true);
  });

  it("shim은 순수 JS다 — `.mjs` 확장자이고 JS 파서가 그대로 받는다", () => {
    expect(SHIM.endsWith(".mjs")).toBe(true);
    const checked = spawnSync(process.execPath, ["--check", SHIM], { encoding: "utf8" });
    expect(checked.status, checked.stderr).toBe(0);
  });

  it("shim은 심볼릭 링크로 실행되므로 git에 실행 비트(100755)로 기록된다 (§2.1)", () => {
    // §2.1: "심볼릭 링크 경유 실행은 shim의 실행 비트에 의존하므로 그 파일은 git에
    // `100755`로 기록된다." 워킹 트리 권한이 아니라 **git 인덱스의 모드**가 계약이다
    // — clone한 트리에서 실행 가능해야 하기 때문이다.
    const line = execFileSync("git", ["ls-files", "-s", "--", "packages/cli/bin/neo-agent.mjs"], {
      cwd: WORKSPACE,
      encoding: "utf8",
    }).trim();
    expect(line, "shim이 git에 추적되지 않는다").not.toBe("");
    expect(line.split(" ")[0]).toBe("100755");
  });

  it("shim에 shebang이 있다 — 링크가 PATH에서 직접 실행되는 형태다 (§3.1)", () => {
    expect(read(SHIM).startsWith("#!/usr/bin/env node\n")).toBe(true);
  });

  it("정적 import가 0건이다", () => {
    // §3.2: "shim은 그 외 어떤 것도 import하지 않는다." 정적 임포트는 모듈 본문보다
    // 먼저 평가되므로, 하나라도 있으면 버전 게이트보다 먼저 실행된다.
    const source = read(SHIM);
    const stripped = stripCommentsAndStrings(source);
    expect(matchAllOf(stripped, /(?:^|[\s;}])import\s+[^(]/g), "정적 import 선언").toEqual([]);
    expect(matchAllOf(stripped, /(?:^|[\s;}])export\s/g), "re-export").toEqual([]);
    expect(matchAllOf(stripped, /\brequire\s*\(/g), "require() 호출").toEqual([]);
  });

  it("동적 import 대상이 `../src/main.ts` 하나뿐이다", () => {
    const stripped = stripCommentsAndStrings(read(SHIM), { keepStrings: true });
    const targets = [...stripped.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)].map(
      (match) => match[1] ?? "",
    );
    expect(targets).toEqual(["../src/main.ts"]);
    for (const target of targets) expect(existsSync(resolve(dirname(SHIM), target))).toBe(true);
  });

  it("shim이 만지는 `process`는 versions·stderr·exit 셋뿐이다", () => {
    // §3.2: "`main.ts`는 여전히 `process.*`를 읽는 유일한 곳이다. shim은 읽지 않고
    // 판정만 한다 — `process.versions`는 조립에 흘려보낼 값이 아니라 shim 자신의
    // 실행 가부 조건이다." 즉 env·argv·cwd 같은 **조립에 흘러갈 수 있는 값**은
    // shim이 건드리지 않는다.
    const stripped = stripCommentsAndStrings(read(SHIM));
    const members = new Set(
      [...stripped.matchAll(/\bprocess\.([A-Za-z_$][\w$]*)/g)].map((match) => match[1]),
    );
    expect([...members].sort()).toEqual(["exit", "stderr", "versions"]);
  });

  it("최소 Node 하한은 24다 (TECH-STACK §2 · §3.2)", () => {
    const literal = /^const MIN_NODE_MAJOR = (\d+);$/m.exec(read(SHIM));
    expect(literal, "MIN_NODE_MAJOR 상수를 찾지 못했다").not.toBeNull();
    expect(literal?.[1]).toBe("24");
  });

  it("11개 매니페스트 전부의 engines.node가 `>=24`다", () => {
    const paths = manifestPaths(WORKSPACE);
    expect(paths).toHaveLength(MANIFEST_COUNT);
    for (const path of paths) {
      const manifest = readJson(path) as { engines?: { node?: string } };
      expect(manifest.engines?.node, path).toBe(">=24");
    }
  });
});

// ---------------------------------------------------------------------------
// CLI-INTERFACE §1 — bin은 배럴을 지나지 않는다.
//
// 위 describe가 shim의 정적 import를 재는 것과 **같은 축의 한 칸 아래**다: shim →
// `main.ts` → `wiring.ts`로 내려오는 사슬에서 정적 import가 금지되는 이유가 매 칸
// 같기 때문이다(`node:sqlite` 경고 필터가 store 로드보다 먼저 서야 한다).
//
// 이 검사가 없으면 §1의 **축이 되는 사실 주장**이 주석으로만 지켜진다. 누군가
// `main.ts`에 `import { runCli } from "./index.ts"`를 쓰면 ① §1이 조용히 거짓이 되고
// ② 경고 억제가 함께 깨진다 — 둘 다 게이트가 그린인 채로.
// ---------------------------------------------------------------------------

describe("CLI-INTERFACE §1 — bin은 배럴을 지나지 않는다", () => {
  const MAIN = join(WORKSPACE, "packages", "cli", "src", "main.ts");

  it("정적 import가 `node:fs`·`node:os` 둘뿐이다", () => {
    // §1/§2: 배럴은 런타임 경로가 아니다. `main.ts`는 `./wiring.ts`를 **동적으로**
    // 부르고, 정적으로 남는 것은 `node:sqlite`를 끌어올 수 없는 것뿐이다
    // (main.ts 헤더: "규율의 대상은 무엇을 임포트하는가이지 정적 임포트의 존재
    // 자체가 아니다 — node:os·node:fs는 그 경로에 없어서 위에 있어도 된다").
    const stripped = stripCommentsAndStrings(read(MAIN), { keepStrings: true });
    const specs = [...stripped.matchAll(/(?:^|[\s;}])import\s[^(]*?from\s*["']([^"']+)["']/g)].map(
      (match) => match[1] ?? "",
    );
    expect(specs.sort()).toEqual(["node:fs", "node:os"]);
  });

  it("`./index.ts`를 어떤 형태로도 임포트하지 않는다", () => {
    // 정적·동적을 가리지 않는다 — 배럴을 지나면 `wiring.ts` **말고도** 모든 모듈이
    // 함께 평가되므로 동적이어도 경고 필터보다 넓은 것을 끌어온다.
    const stripped = stripCommentsAndStrings(read(MAIN), { keepStrings: true });
    const targets = [
      ...stripped.matchAll(/\bimport\s*(?:\(\s*)?["']([^"']+)["']/g),
      ...stripped.matchAll(/\bfrom\s*["']([^"']+)["']/g),
    ].map((match) => match[1] ?? "");

    for (const target of targets) {
      expect(target, "main.ts가 배럴을 지난다 — §1의 사실 주장이 깨졌다").not.toMatch(
        /(^|\/)index(\.ts)?$/,
      );
    }
    expect(targets).toContain("./wiring.ts");
  });
});

// ---------------------------------------------------------------------------
// §3.2 — shim의 거동. 실제 shim 파일을 격리 복사본에서 실행한다.
//
// 격리하는 이유: 진짜 `../src/main.ts`를 로드하면 §7(TTY 요구)이 먼저 걸려 shim의
// 거동과 main의 거동이 섞인다. 복사본에 마커만 찍는 스텁을 두면 **shim이 자기
// 대상을 실제로 로드했다**를 직접 관측할 수 있다.
// ---------------------------------------------------------------------------

describe("DISTRIBUTION §3.2 — shim 거동", () => {
  let sandbox = "";
  let spoof = "";

  beforeAll(() => {
    sandbox = mkdtempSync(join(tmpdir(), "neo-qa-shim-"));
    mkdirSync(join(sandbox, "bin"));
    mkdirSync(join(sandbox, "src"));
    cpSync(SHIM, join(sandbox, "bin", "neo-agent.mjs"));
    // 타입 표기를 넣어 **타입 스트리핑이 실제로 일어났는지**까지 같이 본다.
    writeFileSync(
      join(sandbox, "src", "main.ts"),
      "const marker: string = 'NEO_QA_MAIN_LOADED';\nprocess.stdout.write(marker + '\\n');\n",
    );
    spoof = join(sandbox, "spoof.mjs");
    writeFileSync(
      spoof,
      'Object.defineProperty(process.versions, "node", { value: process.env.NEO_QA_SPOOF_NODE, configurable: true, enumerable: true });\n',
    );
  });

  afterAll(() => {
    if (sandbox) rmSync(sandbox, { recursive: true, force: true });
  });

  const runShim = (spoofed?: string) =>
    spawnSync(
      process.execPath,
      spoofed === undefined
        ? [join(sandbox, "bin", "neo-agent.mjs")]
        : ["--import", `file://${spoof}`, join(sandbox, "bin", "neo-agent.mjs")],
      {
        encoding: "utf8",
        env: { ...process.env, NEO_QA_SPOOF_NODE: spoofed ?? "" },
      },
    );

  it("게이트를 통과하면 `../src/main.ts`를 로드한다", () => {
    const result = runShim();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("NEO_QA_MAIN_LOADED");
  });

  it("하한 미만이면 stderr에 원인·현재·요구·다음 행동을 쓰고 비정상 종료한다", () => {
    const result = runShim("20.11.0");
    expect(result.status).not.toBe(0);
    // §3.2: "원인·현재 버전·요구 버전·다음 행동을 담은 메시지를 stderr에 쓰고 비정상 종료"
    expect(result.stderr).toContain("20.11.0"); // 현재 버전
    expect(result.stderr).toContain("24"); // 요구 버전
    expect(result.stderr).toMatch(/원인/); // 원인
    expect(result.stderr).toMatch(/다음 행동/); // 다음 행동
    // 진단은 stdout을 오염시키지 않는다. 그리고 main은 로드되지 않았다.
    expect(result.stdout).toBe("");
  });

  it("하한 경계 — 23은 거부, 24는 통과", () => {
    expect(runShim("23.99.99").status).not.toBe(0);
    const passing = runShim("24.0.0");
    expect(passing.status, passing.stderr).toBe(0);
    expect(passing.stdout).toContain("NEO_QA_MAIN_LOADED");
  });

  it("major를 읽을 수 없으면 fail-closed다 — 통과가 아니라 실패", () => {
    // [문서상 미규정] §3.2는 "major가 최소선 미만이면"만 규정하고 파싱 불가를 말하지
    // 않는다. 그러나 통과시키면 그 다음에 나오는 것이 정확히 이 파일이 대체하려던
    // 암호 같은 실패이고, 그것은 §2.6(silent/암호 실패 금지)이 금지한 **결과**다.
    // 원인 쪽이 미규정이어도 금지된 결과가 나오면 위반이므로 실패를 단정한다.
    for (const bogus of ["", "not-a-version", "x.y.z"]) {
      const result = runShim(bogus);
      expect(result.status, `spoof=${JSON.stringify(bogus)}`).not.toBe(0);
      expect(result.stdout).toBe("");
    }
  });

  it("실제 트리의 실제 shim은 이 머신의 Node를 거부하지 않는다", () => {
    // 격리 복사본이 아니라 진짜 bin을 돌린다. §7(TTY)이 걸려 실패하더라도, 그 실패가
    // **shim의 버전 게이트가 아니어야** 한다 — 즉 shim은 통과시켰다.
    const result = spawnSync(process.execPath, [SHIM, "--version"], { encoding: "utf8" });
    expect(result.stderr).not.toContain("이 Node 버전으로는 실행할 수 없습니다");
    expect(result.stderr).not.toMatch(/ERR_UNKNOWN_FILE_EXTENSION|ERR_MODULE_NOT_FOUND/);
  });
});

// ---------------------------------------------------------------------------
// §4 — 버전 정본의 단일성
// ---------------------------------------------------------------------------

describe("DISTRIBUTION §4 — 버전 정본", () => {
  it("정본은 registration.ts의 `NEO_AGENT_USER_AGENT` 하나뿐이다", () => {
    const declarations = [
      ...read(REGISTRATION).matchAll(/^export const NEO_AGENT_USER_AGENT = "neo-agent\/([^"]+)"/gm),
    ];
    expect(declarations, "정본 선언은 정확히 1건이어야 한다").toHaveLength(1);
    expect(declarations.map((match) => match[1])).toEqual([
      expect.stringMatching(/^\d+\.\d+\.\d+$/),
    ]);
  });

  it("11개 매니페스트의 version이 전부 정본과 같다", () => {
    const canonical = /^export const NEO_AGENT_USER_AGENT = "neo-agent\/([^"]+)"/m.exec(
      read(REGISTRATION),
    )?.[1];
    const paths = manifestPaths(WORKSPACE);
    expect(paths).toHaveLength(MANIFEST_COUNT);
    for (const path of paths) expect(readJson(path).version, path).toBe(canonical);
  });

  it("providers는 파일을 읽지 않는다 — 그것이 정본을 코드에 둔 근거다", () => {
    // §4: "`providers`는 예산 게이트가 `node:fs`를 금지하는 패키지이고 (…) 버전을
    // 읽으려고 파일 읽기를 여는 것은 그 격리를 versioning 편의와 맞바꾸는 것이다."
    // 게이트와 별개로 여기서도 독립 확인한다.
    for (const file of walkSources(join(WORKSPACE, "packages", "providers", "src"))) {
      expect(read(file), file).not.toMatch(/["']node:(fs|fs\/promises|child_process)["']/);
    }
  });
});

// ---------------------------------------------------------------------------
// §4 · §3.2 — 게이트 역검증. 전부 `mkdtemp` 복사본에서만 위반시킨다.
// ---------------------------------------------------------------------------

describe("예산 게이트 역검증 — 위반이 실제로 떨어지는가", () => {
  let fixture = "";

  beforeAll(() => {
    fixture = mkdtempSync(join(tmpdir(), "neo-qa-gate-"));
    mkdirSync(join(fixture, "scripts"));
    cpSync(GATE, join(fixture, "scripts", "check-core-budget.mjs"));
    cpSync(join(WORKSPACE, "package.json"), join(fixture, "package.json"));
    for (const entry of readdirSync(join(WORKSPACE, "packages"), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const from = join(WORKSPACE, "packages", entry.name);
      const to = join(fixture, "packages", entry.name);
      mkdirSync(to, { recursive: true });
      // 게이트가 읽는 것만 복사한다 — package.json · src/ · (cli의) bin/ · test/
      //
      // `test/`가 목록에 들어온 것은 2026-08-10에 게이트가 `probeDocker` 주입 규율을
      // 강제하기 시작하면서다(`SANDBOX.md` §3). **이 목록은 게이트에서 파생된 사실**이라
      // 게이트가 읽는 것이 늘면 여기도 늘어야 한다 — 안 늘리면 복사본이 원본과 달라져
      // 아래 "픽스처의 타당성"이 정확히 그 사실을 잡는다(실제로 잡았다). 전체 2MB라
      // 복사 비용은 문제가 되지 않는다.
      for (const part of ["package.json", "src", "bin", "test"]) {
        if (existsSync(join(from, part))) {
          cpSync(join(from, part), join(to, part), { recursive: true });
        }
      }
    }
  });

  afterAll(() => {
    if (fixture) rmSync(fixture, { recursive: true, force: true });
  });

  const runGate = (root: string) =>
    spawnSync(process.execPath, [join(root, "scripts", "check-core-budget.mjs")], {
      encoding: "utf8",
    });

  /** 파일을 바꿔 게이트를 돌리고 **반드시** 원복한다 */
  function withMutation<T>(path: string, mutate: (source: string) => string, body: () => T): T {
    const original = readFileSync(path);
    try {
      writeFileSync(path, mutate(original.toString("utf8")));
      return body();
    } finally {
      writeFileSync(path, original);
    }
  }

  it("복사본이 원본과 동일하게 통과한다 (픽스처의 타당성)", () => {
    const real = runGate(WORKSPACE);
    expect(real.status, real.stderr).toBe(0);
    const copied = runGate(fixture);
    expect(copied.status, copied.stderr).toBe(0);
    // 아래 세 단정이 재는 것은 **복사본과 원본이 같은 판정을 냈는가**이지 **검사가 몇
    // 개인가**가 아니다. 위 두 줄이 exit 0을 확인한 뒤라 `n/n` 형태는 논리적으로 이미
    // 정해져 있다 — 게이트는 `failures`가 비어 있고 notes 수가 기댓값과 다를 때만 실패를
    // 적으므로, exit 0이면 출력은 항상 `n/n`이다. 즉 이 단정들은 **개수를 밖에서 붙잡지
    // 않는다**(2026-08-10 독립 검증 F-2).
    //
    // 개수를 붙잡는 것은 **각 검사의 존재를 하나씩 못 박는 전용 역검증들**이다(교차 검사
    // 5종 전부 보유 — 5번은 아래 세 건). 손으로 적던 `"4/4"`를 버린 근거(검사가 늘 때마다
    // 고쳐야 하는 수치이고 그 값은 원본이 이미 말한다)는 유지보수 관점에서 여전히
    // 유효하되, **"원본이 말한다"와 "원본이 맞는지 밖에서 잰다"는 다른 일**이다.
    //
    // 그럼에도 남기는 이유: 복사본이 낙후되면 이 대조가 실제로 잡는다(2026-08-10에
    // `test/` 누락을 여기서 잡았다). 지우면 그 확인마저 사라진다.
    const total = /교차 파일 일치 통과 — (\d+)\/(\d+)건/.exec(real.stdout);
    expect(total, real.stdout).not.toBeNull();
    expect(total?.[1]).toBe(total?.[2]);
    expect(copied.stdout).toContain(`${total?.[1]}/${total?.[2]}`);
  });

  it("11개 매니페스트를 하나씩 어긋나게 하면 11번 모두 잡힌다 (version)", () => {
    const paths = manifestPaths(fixture);
    expect(paths).toHaveLength(MANIFEST_COUNT);
    const caught: string[] = [];
    for (const path of paths) {
      withMutation(
        path,
        (source) => source.replace(/"version": "[^"]+"/, '"version": "9.9.9-qa"'),
        () => {
          const result = runGate(fixture);
          if (result.status !== 0 && result.stderr.includes(path)) caught.push(path);
        },
      );
    }
    expect(caught).toEqual(paths);
    // 원복 확인 — 픽스처가 다시 통과해야 한다
    expect(runGate(fixture).status).toBe(0);
  });

  it("11개 매니페스트를 하나씩 어긋나게 하면 11번 모두 잡힌다 (engines.node)", () => {
    const paths = manifestPaths(fixture);
    const caught: string[] = [];
    for (const path of paths) {
      withMutation(
        path,
        (source) => source.replace(/"node": ">=24"/, '"node": ">=22"'),
        () => {
          const result = runGate(fixture);
          if (result.status !== 0 && result.stderr.includes(path)) caught.push(path);
        },
      );
    }
    expect(caught).toEqual(paths);
    expect(runGate(fixture).status).toBe(0);
  });

  it("engines.node를 지우거나 대조 불가 형태로 바꾸면 잡힌다", () => {
    const path = join(fixture, "packages", "core", "package.json");
    for (const replacement of ['"node": "^24"', '"node": ">=24 <26"', '"node": 24']) {
      withMutation(
        path,
        (source) => source.replace(/"node": ">=24"/, replacement),
        () => expect(runGate(fixture).status, replacement).not.toBe(0),
      );
    }
    expect(runGate(fixture).status).toBe(0);
  });

  it("정본 리터럴을 바꾸면 떨어진다 (§4 역방향)", () => {
    withMutation(
      join(fixture, "packages", "providers", "src", "anthropic", "registration.ts"),
      (source) => source.replace('"neo-agent/0.1.0"', '"neo-agent/0.2.0"'),
      () => {
        const result = runGate(fixture);
        expect(result.status).not.toBe(0);
        // 하나가 아니라 11곳 전부가 어긋난 것으로 보고돼야 한다
        expect(result.stderr.match(/version이 버전 정본과 어긋난다/g)).toHaveLength(MANIFEST_COUNT);
      },
    );
    expect(runGate(fixture).status).toBe(0);
  });

  it("정본 상수의 이름이 바뀌면 통과가 아니라 실패다", () => {
    withMutation(
      join(fixture, "packages", "providers", "src", "anthropic", "registration.ts"),
      (source) => source.replace("NEO_AGENT_USER_AGENT", "NEO_AGENT_UA"),
      () => expect(runGate(fixture).status).not.toBe(0),
    );
  });

  it("shim에 정적 import를 넣으면 떨어진다 — 회피 표기까지", () => {
    // 셰뱅 **뒤**의 현실적인 자리에 넣는다. 붙여쓰기·줄바꿈·부작용 임포트 등
    // 정규식이 놓치기 쉬운 표기를 함께 시도해, 게이트가 형태에 취약하지 않은지 본다.
    const shim = join(fixture, "packages", "cli", "bin", "neo-agent.mjs");
    const injections = [
      'import { readFileSync } from "node:fs";',
      'import"node:fs";',
      'import{readFileSync}from"node:fs";',
      'import * as fs\n  from "node:fs";',
      'import "../src/main.ts";', // 허용 대상이라도 정적이면 안 된다
      'import { x } from "./helper.mjs";',
      'const { readFileSync } = await import("node:fs");', // 동적이어도 대상이 다르면 안 된다
    ];
    const caught: string[] = [];
    for (const injected of injections) {
      withMutation(
        shim,
        (source) => source.replace("#!/usr/bin/env node\n", `#!/usr/bin/env node\n${injected}\n`),
        () => {
          if (runGate(fixture).status !== 0) caught.push(injected);
        },
      );
    }
    expect(caught).toEqual(injections);
    expect(runGate(fixture).status).toBe(0);
  });

  it("shim의 동적 import 대상을 바꾸면 떨어진다", () => {
    withMutation(
      join(fixture, "packages", "cli", "bin", "neo-agent.mjs"),
      (source) => source.replace('import("../src/main.ts")', 'import("../src/other.ts")'),
      () => expect(runGate(fixture).status).not.toBe(0),
    );
  });

  it("shim의 MIN_NODE_MAJOR를 바꾸면 떨어진다", () => {
    withMutation(
      join(fixture, "packages", "cli", "bin", "neo-agent.mjs"),
      (source) => source.replace("const MIN_NODE_MAJOR = 24;", "const MIN_NODE_MAJOR = 22;"),
      () => {
        const result = runGate(fixture);
        expect(result.status).not.toBe(0);
        expect(result.stderr.match(/engines\.node가 shim의 Node 최소선과 어긋난다/g)).toHaveLength(
          MANIFEST_COUNT,
        );
      },
    );
  });

  it("shim과 wiring.ts의 종료 코드가 어긋나면 떨어진다", () => {
    withMutation(
      join(fixture, "packages", "cli", "bin", "neo-agent.mjs"),
      (source) =>
        source.replace("const EXIT_STARTUP_FAILED = 1;", "const EXIT_STARTUP_FAILED = 2;"),
      () => expect(runGate(fixture).status).not.toBe(0),
    );
  });

  it("fail-closed — 검사 대상 파일이 사라지면 통과가 아니라 실패다", () => {
    const targets = [
      join(fixture, "packages", "cli", "bin", "neo-agent.mjs"),
      join(fixture, "packages", "providers", "src", "anthropic", "registration.ts"),
      join(fixture, "packages", "cli", "src", "wiring.ts"),
      join(fixture, "package.json"),
      join(fixture, "packages", "core", "package.json"),
    ];
    for (const target of targets) {
      const away = `${target}.qa-moved`;
      renameSync(target, away);
      try {
        const result = runGate(fixture);
        expect(result.status, `${target}가 사라졌는데 게이트가 통과했다`).not.toBe(0);
      } finally {
        renameSync(away, target);
      }
    }
    expect(runGate(fixture).status).toBe(0);
  });

  it("fail-closed — 예산 목록에 없는 패키지가 늘어나면 실패다", () => {
    // 새 패키지가 등재 없이 추가되면 그 패키지는 **무검사 상태**다. 개수 대조가
    // 그것을 잡는다.
    const added = join(fixture, "packages", "qa-unregistered");
    mkdirSync(join(added, "src"), { recursive: true });
    writeFileSync(
      join(added, "package.json"),
      JSON.stringify({ name: "@neo-agent/qa", version: "0.1.0", engines: { node: ">=24" } }),
    );
    try {
      expect(runGate(fixture).status).not.toBe(0);
    } finally {
      rmSync(added, { recursive: true, force: true });
    }
    expect(runGate(fixture).status).toBe(0);
  });

  // 아래 세 건은 교차 검사 5번(`probeDocker` 주입 강제 — `SANDBOX.md` §3)의 **존재**를
  // 못 박는다. 나머지 네 검사는 각각 전용 역검증을 갖고 있었는데 이것만 없어서,
  // **검사 블록을 통째로 지우고 `EXPECTED_CONSISTENCY_NOTES`를 낮추면 게이트도 스위트도
  // 그대로 그린**이었다(2026-08-10 독립 검증 F-1로 실증). 규율을 기계로 옮기면 그 기계를
  // 지키는 것이 다시 규율이 되므로, 검사 추가와 그 검사의 역검증은 같은 자리에 둔다.
  //
  // **셋은 서로를 덮지 않는다**(분별 역검증으로 확인). 대상 선정의 두 형태(명명 임포트 ·
  // 네임스페이스 임포트)와 검사가 죽은 상태를 각각 하나씩 잡으므로, 파서에서 네임스페이스
  // 수집만 빠지면 세 번째만 빨간불이 되고 나머지 둘은 통과한다.

  it("주입 없이 `startCli`를 부르는 테스트가 들어오면 떨어진다 (§3 probeDocker 주입 강제)", () => {
    const planted = join(fixture, "packages", "cli", "test", "qa-missing-injection.test.ts");
    // 심을 내용의 임포트 문을 **조립해서** 만든다. 통째로 적으면 게이트가 *이 파일*을
    // `startCli` 호출자로 오인해 여기에도 주입을 요구한다 — 주입 판정이 파일 전체
    // 텍스트 매칭이라는 §3의 한계가 이 자리에서 그대로 나타난다.
    const callee = "startCli";
    writeFileSync(
      planted,
      `import { ${callee} } from "../src/wiring.ts";\n${callee}(deps, args);\n`,
    );
    try {
      const result = runGate(fixture);
      expect(result.status, "주입 없는 테스트가 들어왔는데 게이트가 통과했다").not.toBe(0);
      // 파일명을 지목해야 한다 — "어딘가 위반이 있다"로는 고칠 자리를 못 찾는다
      expect(result.stderr).toContain("qa-missing-injection.test.ts");
    } finally {
      rmSync(planted, { force: true });
    }
    expect(runGate(fixture).status).toBe(0);
  });

  it("네임스페이스 임포트로 `startCli`를 부르는 미주입 테스트도 잡힌다 (§3 한계 3번 폐지)", () => {
    const planted = join(fixture, "packages", "cli", "test", "qa-namespace-injection.test.ts");
    // 위 테스트와 같은 이유로 **조립**한다. 다만 여기서는 바인딩 이름(`ns`)도 함께
    // 조립해야 한다 — 통째로 적으면 게이트가 이 파일에서 네임스페이스 바인딩을 수집한
    // 뒤 `<바인딩>.startCli` 사용까지 찾아내 *이 파일*을 호출자로 오인한다. 2026-08-10에
    // 명명 임포트 쪽에서 실제로 밟은 함정이고, 파서가 넓어진 만큼 이쪽에도 생겼다.
    const ns = "wiring";
    const callee = "startCli";
    writeFileSync(
      planted,
      `import * as ${ns} from "../src/wiring.ts";\nawait ${ns}.${callee}(deps, args);\n`,
    );
    try {
      const result = runGate(fixture);
      expect(result.status, "네임스페이스 미주입 호출자가 들어왔는데 게이트가 통과했다").not.toBe(
        0,
      );
      expect(result.stderr).toContain("qa-namespace-injection.test.ts");
    } finally {
      rmSync(planted, { force: true });
    }
    expect(runGate(fixture).status).toBe(0);
  });

  it("fail-closed — `startCli`를 부르는 테스트가 0건이면 통과가 아니다", () => {
    const testDir = join(fixture, "packages", "cli", "test");
    const moved = readdirSync(testDir).filter((name) => name.endsWith(".test.ts"));
    expect(moved.length, "픽스처에 cli 테스트가 복사되지 않았다").toBeGreaterThan(0);
    for (const name of moved) renameSync(join(testDir, name), join(testDir, `${name}.qa-moved`));
    try {
      const result = runGate(fixture);
      expect(result.status, "검사 대상이 0건인데 게이트가 통과했다").not.toBe(0);
      expect(result.stderr).toContain("startCli를 부르는 테스트를 1건도 찾지 못했다");
    } finally {
      for (const name of moved) renameSync(join(testDir, `${name}.qa-moved`), join(testDir, name));
    }
    expect(runGate(fixture).status).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §8 — 공급망
// ---------------------------------------------------------------------------

describe("DISTRIBUTION §8 — 공급망", () => {
  const manifests = () =>
    manifestPaths(WORKSPACE).map((path) => ({ path, manifest: readJson(path) }));

  it("의존성에 범위 지정자가 0건이다 — 전부 정확 핀", () => {
    // §8 ✅채택: "의존성 정확 핀 — 현재 `^`/`~` 범위를 정확 버전으로 바꾼다."
    // `workspace:*`는 레지스트리 해석이 아니라 워크스페이스 링크 프로토콜이므로
    // 범위 지정자가 아니다.
    const exact = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
    const seen: string[] = [];
    for (const { path, manifest } of manifests()) {
      for (const group of [
        "dependencies",
        "devDependencies",
        "peerDependencies",
        "optionalDependencies",
      ]) {
        const entries = manifest[group] as Record<string, string> | undefined;
        for (const [name, spec] of Object.entries(entries ?? {})) {
          seen.push(`${path}:${group}:${name}`);
          if (spec === "workspace:*") continue;
          expect(spec, `${path} → ${group}.${name}`).toMatch(exact);
        }
      }
    }
    expect(seen.length).toBeGreaterThan(0);
  });

  it("외부 런타임 의존성은 정확히 2개다", () => {
    // §8: "외부 런타임 의존성은 **2개**(`@anthropic-ai/sdk`, `zod`)"
    const external = new Set<string>();
    for (const { manifest } of manifests()) {
      for (const name of Object.keys((manifest.dependencies ?? {}) as Record<string, string>)) {
        if (!name.startsWith("@neo-agent/")) external.add(name);
      }
    }
    expect([...external].sort()).toEqual(["@anthropic-ai/sdk", "zod"]);
  });

  it("외부 개발 의존성의 집합이 고정돼 있다", () => {
    // [미규정 — 판정 필요] §8은 "개발 의존성 3종"이라 쓰지만 워크스페이스 전체의
    // 외부 devDependency는 **4종**이다(@biomejs/biome · @types/node · typescript ·
    // vitest). "3종"이 `packages/*`에 공통으로 들어가는 셋(@types/node·typescript·
    // vitest, biome은 루트 전용)을 가리키는 것인지, 서술이 부정확한 것인지는 계약
    // 소유자(Architect)가 판정할 일이다. 여기서는 어느 쪽 수도 단정하지 않고
    // **집합의 드리프트만** 고정한다 — 새 도구가 조용히 늘어나는 것은 §8의 취지
    // ("표면이 작을 때 싸게 조인다")에 어긋나므로 어느 판정이든 잡혀야 한다.
    const rootOnly = new Set<string>();
    const perPackage = new Set<string>();
    for (const { path, manifest } of manifests()) {
      const target = path === join(WORKSPACE, "package.json") ? rootOnly : perPackage;
      for (const name of Object.keys((manifest.devDependencies ?? {}) as Record<string, string>)) {
        if (!name.startsWith("@neo-agent/")) target.add(name);
      }
    }
    expect([...perPackage].sort()).toEqual(["@types/node", "typescript", "vitest"]);
    expect([...rootOnly].sort()).toEqual(["@biomejs/biome", "@types/node", "typescript", "vitest"]);
  });

  it("pnpm-workspace.yaml이 minimumReleaseAge와 blockExoticSubdeps를 선언한다", () => {
    const source = read(join(WORKSPACE, "pnpm-workspace.yaml"));
    expect(source).toMatch(/^minimumReleaseAge:\s*2880\s*$/m);
    expect(source).toMatch(/^blockExoticSubdeps:\s*true\s*$/m);
  });

  it("두 설정을 pnpm이 실제로 인식한다 — 오타 키는 조용히 무시되기 때문이다", () => {
    // 실측(QA-A): pnpm 10.34.5는 `pnpm-workspace.yaml`의 **알 수 없는 키를 경고 없이
    // 무시한다.** 따라서 "YAML에 줄이 있다"는 설정이 살아 있다는 증거가 아니다.
    // pnpm 자신에게 되물어 값이 돌아오는 것까지가 실효 확인이다.
    for (const [key, expected] of [
      ["minimumReleaseAge", "2880"],
      ["blockExoticSubdeps", "true"],
    ] as const) {
      const result = spawnSync("pnpm", ["config", "get", key], {
        cwd: WORKSPACE,
        encoding: "utf8",
      });
      expect(result.status, `${key}: ${result.stderr}`).toBe(0);
      expect(result.stdout.trim(), key).toBe(expected);
    }
  }, 60_000);

  it("packageManager가 pnpm 버전을 고정한다", () => {
    // §8: "`packageManager` 필드로 pnpm 버전 고정". §8이 함께 명시한 두 한계 —
    // 강제 양태가 거부가 아닌 **자동 전환**이고, `+sha512.` 해시는 corepack이 없으면
    // 검증되지 않는다 — 는 프로세스 거동이라 이 정적 단정의 범위 밖이다(리포트에
    // 실측을 기록했다). 여기서는 필드의 형태만 고정한다.
    const root = readJson(join(WORKSPACE, "package.json"));
    expect(root.packageManager, "packageManager 필드가 없다").toMatch(
      /^pnpm@\d+\.\d+\.\d+\+sha512\.[0-9a-f]{128}$/,
    );
  });

  it("잠금 파일의 specifier가 매니페스트와 한 글자도 다르지 않다", () => {
    // `pnpm install --frozen-lockfile`이 검사하는 바로 그 조건의 정적 등가물.
    // (실제 `--frozen-lockfile` 실행은 부수효과가 있어 스위트 밖에서 실측했다.)
    const lock = parseLockImporters(read(join(WORKSPACE, "pnpm-lock.yaml")));
    expect(Object.keys(lock).sort()).toEqual(
      manifestPaths(WORKSPACE)
        .map((path) => {
          const dir = dirname(path);
          return dir === WORKSPACE ? "." : dir.slice(WORKSPACE.length + 1);
        })
        .sort(),
    );
    for (const [importer, specs] of Object.entries(lock)) {
      const manifestPath =
        importer === "."
          ? join(WORKSPACE, "package.json")
          : join(WORKSPACE, importer, "package.json");
      const manifest = readJson(manifestPath);
      const declared: Record<string, string> = {};
      for (const group of ["dependencies", "devDependencies"]) {
        Object.assign(declared, (manifest[group] ?? {}) as Record<string, string>);
      }
      expect(specs, importer).toEqual(declared);
    }
  });
});

// ---------------------------------------------------------------------------
// 도우미 — 전부 이 파일 안에서 자족한다(구현 하네스를 재사용하지 않는다)
// ---------------------------------------------------------------------------

/** 주석과 (기본적으로) 문자열 리터럴 내용을 공백으로 지운다 — 주석 속 `import`는 위반이 아니다 */
function stripCommentsAndStrings(source: string, options?: { keepStrings?: boolean }): string {
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

function matchAllOf(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].map((match) => match[0].trim());
}

function* walkSources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkSources(path);
    else if (entry.name.endsWith(".ts")) yield path;
  }
}

/**
 * `pnpm-lock.yaml`의 `importers:` 블록만 읽어 `{ importer: { dep: specifier } }`를 만든다.
 * YAML 파서를 새로 들이지 않는 이유는 §8 그 자체다 — 의존성 2개를 검사하려고
 * 세 번째 의존성을 넣지 않는다. 들여쓰기가 고정된 구간이라 줄 단위로 충분하다.
 */
function parseLockImporters(source: string): Record<string, Record<string, string>> {
  const lines = source.split("\n");
  const start = lines.indexOf("importers:");
  if (start === -1) throw new Error("pnpm-lock.yaml에 importers 블록이 없다");
  const importers: Record<string, Record<string, string>> = {};
  let current: Record<string, string> | null = null;
  let dependency = "";
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "") continue;
    if (!line.startsWith("  ")) break; // importers 블록의 끝
    const indent = line.length - line.trimStart().length;
    const text = line.trim();
    if (indent === 2 && text.endsWith(":")) {
      current = {};
      importers[text.slice(0, -1).replace(/^'|'$/g, "")] = current;
      continue;
    }
    if (indent === 4) continue; // dependencies / devDependencies 등 그룹 이름
    if (indent === 6 && text.endsWith(":")) {
      dependency = text.slice(0, -1).replace(/^'|'$/g, "");
      continue;
    }
    if (indent === 8 && text.startsWith("specifier: ") && current !== null) {
      current[dependency] = text.slice("specifier: ".length).replace(/^'|'$/g, "");
    }
  }
  return importers;
}
