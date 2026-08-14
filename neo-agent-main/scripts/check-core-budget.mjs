/**
 * 패키지별 의존성 예산 게이트.
 *
 * 각 패키지가 무엇에 의존해도 되는지는 설계 문서가 정한 경계다. 이 검사가 없으면
 * 경계는 리뷰어의 기억력에만 의존한다.
 *
 * - `core`   — `docs/CORE-INTERFACE.md` §1: 런타임 의존성은 `zod` 하나. I/O성 내장
 *              모듈을 임포트하지 않는다(파일은 도구 구현, DB는 세션 저장소의 일이고
 *              둘 다 코어 밖이다).
 * - `providers` — `docs/PROVIDERS.md` §2.2: 어댑터는 API 키를 **파라미터로만** 받고
 *              스스로 크리덴셜을 읽지 않는다. 파일·DB·프로세스 스폰 경로를 막아
 *              "시크릿 자가 읽기"를 구조적으로 불가능하게 한다.
 *              (2026-08-14까지 이 항은 `docs/SAFE-DEFAULTS.md` §3을 가리켰으나 그 절은
 *              이 계약을 든 적이 없다 — 일곱 항 중 유일하게 착지하지 않던 자리였다.
 *              앵커: `31abb2a`. 예산은 `docs/PROVIDERS.md` §2.1이 든다.)
 * - `tools`  — `docs/TOOLS-INTERFACE.md` §1: 파일·셸이 본업이므로 `node:fs`·
 *              `node:child_process`는 허용하되, 네트워크와 DB는 막는다. 파일·셸
 *              도구가 직접 소켓을 열 이유가 없다.
 * - `gate`   — `docs/APPROVAL-GATE.md` §1: 게이트는 순수 판정 로직이다. 파일·
 *              프롬프트·경로 판정을 전부 주입받으므로 I/O가 필요 없고, 판정 모듈이
 *              스스로 프로세스를 스폰하거나 네트워크에 나가는 경로를 기계적으로 막는다.
 * - `web`    — `docs/WEB-ACCESS.md` §2: 네트워크가 **본업**이라 `node:https`·`node:dns`·
 *              `node:net`이 열린다. 금지는 정확히 역방향(파일·프로세스·DB) —
 *              `tools`가 받는 금지와 **대칭**이라 두 패키지가 서로의 일을 대신할 수 없다.
 * - `sandbox`— `docs/SANDBOX.md` §2: `docker` CLI 호출이 본업이라 `child_process`만
 *              열린다. 파일·네트워크는 전부 막는다.
 * - `memory` — `docs/MEMORY.md` §4.4: 메모리 파일 하나를 읽고 쓰는 것이 전부라
 *              `node:fs`만 열린다. 네트워크·프로세스 스폰·DB는 전부 막는다 —
 *              **`~/.neo-agent/` 안에 쓰는 유일한 패키지**이므로(`tools`의 denylist가
 *              거부하는 바로 그 영역) 표면을 최소로 유지하는 것이 격리의 전제다.
 *
 * 이 스크립트는 예산 외에 **교차 파일 일치**도 검사한다(`docs/DISTRIBUTION.md` §4 ·
 * §3.2 마지막 항). 같은 사실이 두 곳 이상에 적혀 있는데 언어가 그것을 묶어 주지
 * 못하는 자리들이며, 묶어 주는 유일한 기계가 여기다 — 특히 `bin/neo-agent.mjs`는
 * `.mjs`라 tsc(`tsconfig.json`의 include가 `packages` 아래 `.ts`뿐이고 `allowJs`
 * 미설정)와 vitest(include가 `.test.ts`뿐)의 범위 **밖**이다. 즉 shim의 의미적
 * 계약을 검사하는 주체는 이 게이트가 유일하다.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** I/O성 내장 모듈 — 대부분의 패키지에서 금지된다 */
const IO_MODULES = [
  "node:fs",
  "node:net",
  "node:http",
  "node:https",
  "node:sqlite",
  "node:child_process",
  "node:worker_threads",
  "node:dgram",
  "node:tls",
];

const PACKAGES = [
  {
    name: "core",
    dependencies: ["zod"],
    forbiddenModules: IO_MODULES,
  },
  {
    name: "providers",
    dependencies: ["@anthropic-ai/sdk", "@neo-agent/core"],
    // 어댑터는 HTTP를 SDK 경유로만 쓴다. 직접 소켓을 열 이유도, 크리덴셜을 읽을
    // 이유도 없다. child_process까지 막는 것은 `cat ~/.neo-agent/credentials`가
    // 파일 임포트 금지의 우회로가 되기 때문이다.
    // 목록은 `docs/PROVIDERS.md` §2.1이 든 여덟과 일치한다 — 2026-08-14까지 이 항이
    // 다섯뿐이라 `node:http`·`node:https`·`node:dns`가 어느 기계에도 안 걸렸다.
    // 맨 이름(`https`)은 예산 밖 의존성 검사가 잡지만 `node:` 접두형은 그 검사를
    // 건너뛰므로, 누락이 정확히 접두형에서만 샜다(`plans/20260814-providers-doc-verify-report.md` V-1).
    forbiddenModules: [
      "node:fs",
      "node:sqlite",
      "node:child_process",
      "node:net",
      "node:tls",
      "node:http",
      "node:https",
      "node:dns",
    ],
  },
  {
    name: "tools",
    dependencies: ["@neo-agent/core", "zod"],
    // 파일·셸이 본업이라 `node:fs`/`node:child_process`/`node:path`/`node:os`는
    // 허용한다. 금지 대상은 네트워크와 DB — 도구가 직접 소켓을 열거나 상태 저장소를
    // 만지기 시작하면 경계(세션 저장소는 별도)가 무너진다. `dgram`/`worker_threads`는
    // 문서가 명시한 목록 밖이지만 같은 목적(네트워크 접근·우회 차단)이라 함께 막는다.
    forbiddenModules: [
      "node:net",
      "node:tls",
      "node:http",
      "node:https",
      "node:sqlite",
      "node:dgram",
      "node:worker_threads",
    ],
  },
  {
    name: "gate",
    dependencies: ["@neo-agent/core"],
    // 게이트는 판정만 한다. allowlist 영속화·승인 프롬프트·경로 실체 판정을 전부
    // 주입받으므로 I/O가 필요 없다. 여기서 fs/child_process가 열리면 "판정 모듈이
    // 스스로 실행한다"는 경계 붕괴가 조용히 시작된다.
    forbiddenModules: IO_MODULES,
  },
  {
    name: "compaction",
    dependencies: ["@neo-agent/core"],
    // 압축은 판정·계획·요약 생성만 안다(docs/COMPACTION.md §1). 저장소를 모르고
    // 산출물을 값으로 돌려주며, 모델 호출은 주입된 ModelClient가 유일한 출구다.
    // 트랜스크립트 전문을 다루는 패키지가 디스크·네트워크로 나가는 경로를 기계
    // 차단한다. 문서 명시 8종(fs·sqlite·child_process·net·tls·http·https·dns)에
    // `dgram`·`worker_threads`를 더한 것은 tools·store·cli 항목과 같은 근거
    // (네트워크 접근·우회 차단)의 일관 적용이다.
    forbiddenModules: [
      "node:fs",
      "node:sqlite",
      "node:child_process",
      "node:net",
      "node:tls",
      "node:http",
      "node:https",
      "node:dns",
      "node:dgram",
      "node:worker_threads",
    ],
  },
  {
    name: "web",
    dependencies: ["@neo-agent/core", "zod"],
    // 본업은 네트워크다(docs/WEB-ACCESS.md §2) — `node:https`·`node:dns`·`node:net`·
    // `node:url`이 이 패키지의 도구다. 금지는 역방향: 웹 도구가 파일·프로세스·DB에
    // 닿을 이유가 없다. `tools`가 정확히 반대 금지(네트워크 차단)를 받는 것과 대칭이라
    // **두 패키지가 서로의 일을 대신할 수 없다**. `node:sqlite`는 양쪽 모두 금지 —
    // 대칭의 예외가 아니라 둘 다의 관할 밖이다.
    forbiddenModules: [
      "node:fs",
      "node:child_process",
      "node:sqlite",
      "node:os",
      "node:worker_threads",
    ],
  },
  {
    name: "sandbox",
    dependencies: ["@neo-agent/core", "zod"],
    // `docker` CLI 호출이 본업이라 `child_process`만 열린다(docs/SANDBOX.md §2).
    // Docker HTTP API를 쓰려면 `node:net`으로 유닉스 소켓에 직접 붙어야 하는데,
    // 소켓 접근 코드를 갖는 것 자체가 §1의 위험(데몬은 호스트 root)을 우리 코드
    // 안으로 들이는 일이다. 그래서 CLI 호출로 못박고 net을 막는다.
    forbiddenModules: [
      "node:fs",
      "node:https",
      "node:http",
      "node:net",
      "node:tls",
      "node:sqlite",
      "node:dgram",
      "node:worker_threads",
    ],
  },
  {
    name: "memory",
    dependencies: ["@neo-agent/core", "zod"],
    // 메모리 파일 하나가 전부라 `node:fs`·`node:path`만 쓴다(docs/MEMORY.md §4.4).
    // 금지는 `web`이 받는 것과 반대 방향이 아니라 **거의 전부** — 이 패키지는
    // `~/.neo-agent/memory/` 안에 쓰는 유일한 코드이고, 그 특권의 대가로 표면이
    // 가장 좁아야 한다. 네트워크가 열리면 "오염된 런에서는 쓰지 못한다"(§5)를
    // 강제하는 코드가 스스로 외부에 나갈 수 있게 되어 전제가 무너진다.
    forbiddenModules: [
      "node:net",
      "node:tls",
      "node:http",
      "node:https",
      "node:sqlite",
      "node:child_process",
      "node:dgram",
      "node:worker_threads",
      "node:dns",
    ],
  },
  {
    name: "cli",
    dependencies: [
      "@neo-agent/compaction",
      "@neo-agent/core",
      "@neo-agent/gate",
      "@neo-agent/memory",
      "@neo-agent/providers",
      "@neo-agent/sandbox",
      "@neo-agent/store",
      "@neo-agent/tools",
      "@neo-agent/web",
    ],
    // CLI는 조립·렌더링·입력이 본업이다(docs/CLI-INTERFACE.md §1). `node:fs`(설정·
    // 크리덴셜·allowlist 파일)·`node:readline`·`node:tty`는 허용하되, 네트워크는
    // providers(SDK 경유), 프로세스 스폰은 tools(executor), DB는 store의 본업이므로
    // 막는다 — CLI가 직접 하기 시작하면 경계가 샌다. 외부 런타임 의존성 0이 계약.
    forbiddenModules: [
      "node:net",
      "node:tls",
      "node:http",
      "node:https",
      "node:sqlite",
      "node:child_process",
      "node:dgram",
      "node:worker_threads",
    ],
  },
  {
    name: "store",
    dependencies: ["@neo-agent/core", "zod"],
    // 저장소는 `node:fs`(디렉터리 생성·권한 확인)와 `node:sqlite`(본업)를 쓴다 —
    // 다른 패키지의 IO_MODULES를 그대로 복사하면 본업이 막힌다. 금지 대상은
    // 네트워크와 프로세스 스폰: 대화 전문을 보관하는 패키지가 바깥으로 나가는
    // 경로를 기계적으로 차단한다(docs/SESSION-STORE.md §1).
    // 문서 명시 6종(child_process·net·tls·http·https·dns)에 `dgram`·`worker_threads`를
    // 더한 것은 compaction 항과 같은 근거(네트워크 접근·우회 차단)의 일관 적용이다.
    // `node:dns`는 2026-08-14까지 빠져 있었다 — 문서가 금지로 선언한 모듈이
    // 레포 전체에서 compaction 항에만 있었다(같은 날 providers에서 같은 형태를 처분).
    forbiddenModules: [
      "node:net",
      "node:tls",
      "node:http",
      "node:https",
      "node:dns",
      "node:child_process",
      "node:dgram",
      "node:worker_threads",
    ],
  },
];

const failures = [];

/**
 * 읽히지 않으면 실패로 적고 `null`을 준다 — 예외로 죽으면 원인이 스택 트레이스에 묻힌다.
 *
 * **자리가 여기인 이유**: 예산 루프와 교차 파일 검사가 **둘 다** 쓴다. 원래는 아래
 * 교차 파일 절에만 있었고 예산 루프는 `readFileSync`를 맨몸으로 불렀는데, 그쪽이
 * 던지면 fail-closed는 성립하지만(비영 종료) **무엇을 못 읽었는지가 스택에 묻힌다**
 * (2026-08-10 T-006). 같은 파일 안에서 한쪽만 진단이 좋을 이유가 없다.
 */
function readOrFail(path, what) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    failures.push(`${what}를 읽을 수 없다 — ${path} (${error.code ?? error.message})`);
    return null;
  }
}

/** 소스 파일에서 임포트 지정자만 뽑는다 — 주석에 적힌 모듈명은 위반이 아니다 */
function importSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /(?:^|[\s;}])(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    /(?:^|[\s;}])import\s*["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) specifiers.push(match[1]);
    }
  }
  return specifiers;
}

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) yield path;
  }
}

/** 서브패스 임포트(`@scope/pkg/sub`)도 그 패키지에 대한 의존으로 센다 */
function packageOf(specifier) {
  const segments = specifier.split("/");
  return specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
}

const summary = [];

for (const pkg of PACKAGES) {
  const root = new URL(`../packages/${pkg.name}/`, import.meta.url).pathname;

  const manifestSource = readOrFail(
    join(root, "package.json"),
    `${pkg.name} 패키지의 package.json`,
  );
  if (manifestSource === null) continue;

  let manifest;
  try {
    manifest = JSON.parse(manifestSource);
  } catch (error) {
    failures.push(`${pkg.name}: package.json을 파싱할 수 없다 — ${error.message}`);
    continue;
  }

  const dependencies = Object.keys(manifest.dependencies ?? {}).sort();
  const allowed = [...pkg.dependencies].sort();
  if (dependencies.join() !== allowed.join()) {
    failures.push(
      `${pkg.name}: dependencies가 예산을 벗어났다 — ${JSON.stringify(dependencies)} (허용: ${JSON.stringify(allowed)})`,
    );
  }

  // 순회 자체가 던질 수 있다(디렉터리 개명·이동). 그 경우도 원인을 문장으로 남긴다.
  const srcDir = join(root, "src");
  let files;
  try {
    files = [...sourceFiles(srcDir)];
  } catch (error) {
    failures.push(`${pkg.name}: src/를 훑을 수 없다 — ${srcDir} (${error.code ?? error.message})`);
    continue;
  }
  // 대상이 0건이면 통과가 아니다 — 이 루프의 유일한 실패 양태가 "검사가 대상을 놓치는
  // 것"이고, 그렇게 되면 검사가 없는 것과 통과가 구분되지 않는다(§2.6). 같은 파일의
  // `soleLiteral`이 "0건도 실패"로 세운 규율을 여기에도 적용한다.
  if (files.length === 0) {
    failures.push(
      `${pkg.name}: ${srcDir}에서 검사 대상 소스를 1건도 찾지 못했다 — 대상이 없으면 통과가 아니라 검사가 죽은 것이다`,
    );
    continue;
  }

  for (const file of files) {
    const source = readOrFail(file, `${pkg.name}의 소스 파일`);
    if (source === null) continue;
    for (const specifier of importSpecifiers(source)) {
      if (pkg.forbiddenModules.includes(specifier)) {
        failures.push(`${file}: I/O성 모듈 임포트 금지 — "${specifier}"`);
      }
      const isRelative = specifier.startsWith(".");
      const isBuiltin = specifier.startsWith("node:");
      if (!isRelative && !isBuiltin && !pkg.dependencies.includes(packageOf(specifier))) {
        failures.push(`${file}: 예산 밖 의존성 임포트 — "${specifier}"`);
      }
    }
  }

  summary.push(`${pkg.name}: ${JSON.stringify(dependencies)}`);
}

// ---------------------------------------------------------------------------
// 교차 파일 일치 검사 (`docs/DISTRIBUTION.md` §4 · §3.2 마지막 항)
//
// **전부 fail-closed.** 검사 대상을 못 찾으면 통과가 아니라 실패다. 이 게이트의
// 유일한 실패 양태는 "파일이 이동·개명돼 검사가 조용히 죽는 것"이고, 그렇게 죽으면
// 검사가 없는 것과 통과가 구분되지 않는다(`ARCHITECTURE.md` §2.6).
// ---------------------------------------------------------------------------

/** 정본과 파생이 사는 자리. 못 읽으면 그것 자체가 실패다 */
const CONSISTENCY_PATHS = {
  /** 버전 정본 — `DISTRIBUTION.md` §4 */
  registration: new URL("../packages/providers/src/anthropic/registration.ts", import.meta.url)
    .pathname,
  /** Node 최소선·종료 코드 정본 — `DISTRIBUTION.md` §3.2 */
  shim: new URL("../packages/cli/bin/neo-agent.mjs", import.meta.url).pathname,
  /** shim이 리터럴로 중복해 적은 종료 코드의 원본 */
  wiring: new URL("../packages/cli/src/wiring.ts", import.meta.url).pathname,
  rootManifest: new URL("../package.json", import.meta.url).pathname,
  packagesDir: new URL("../packages/", import.meta.url).pathname,
  /** `probeDocker` 주입 규율의 검사 대상 — `SANDBOX.md` §3 */
  cliTestDir: new URL("../packages/cli/test/", import.meta.url).pathname,
};

/** `startCli`를 부르는 테스트가 반드시 함께 들여야 하는 주입 헬퍼 — `SANDBOX.md` §3 */
const PROBE_DOCKER_HELPER = "./probe-docker.ts";

/** shim이 유일하게 들여도 되는 것 — `DISTRIBUTION.md` §3.2 "그 외 어떤 것도 import하지 않는다" */
const SHIM_ALLOWED_IMPORT = "../src/main.ts";

const notes = [];

/**
 * 정확히 1건 매치되는 리터럴을 뽑는다. 0건(이름이 바뀌었다)도 2건 이상(어느 것이
 * 정본인지 모른다)도 실패다 — 둘 다 검사가 대상을 놓친 상태다.
 */
function soleLiteral(source, pattern, path, what) {
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) {
    failures.push(
      `${path}: ${what}를 정확히 1건 뽑지 못했다(${matches.length}건). 이름·형태가 바뀌면 검사가 조용히 죽으므로 이것 자체가 실패다`,
    );
    return null;
  }
  return matches[0][1];
}

/**
 * 비교 대상 `package.json`을 디스커버리한다 — 목록을 하드코딩하면 패키지가 늘 때
 * 조용히 빠진다. 대신 **개수**를 예산 목록과 대조해, 못 찾은 것도 예산에 없는 것도
 * 실패로 만든다.
 */
function discoverManifests() {
  const collected = [];

  const rootSource = readOrFail(CONSISTENCY_PATHS.rootManifest, "루트 package.json");
  if (rootSource !== null) {
    collected.push({ path: CONSISTENCY_PATHS.rootManifest, manifest: JSON.parse(rootSource) });
  }

  let entries = [];
  try {
    entries = readdirSync(CONSISTENCY_PATHS.packagesDir, { withFileTypes: true });
  } catch (error) {
    failures.push(
      `packages/ 디렉터리를 읽을 수 없다 — ${CONSISTENCY_PATHS.packagesDir} (${error.code ?? error.message})`,
    );
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = join(CONSISTENCY_PATHS.packagesDir, entry.name, "package.json");
    let source;
    try {
      source = readFileSync(path, "utf8");
    } catch {
      continue; // package.json이 없는 디렉터리는 패키지가 아니다 — 부족분은 아래 개수 검사가 잡는다
    }
    collected.push({ path, manifest: JSON.parse(source) });
  }

  // 루트 1 + 예산 목록의 패키지 수. 적으면 검사가 대상을 놓친 것이고, 많으면 예산
  // 목록(PACKAGES)에 등재되지 않은 패키지가 있다는 뜻이라 그쪽도 무검사 상태다.
  const expected = PACKAGES.length + 1;
  if (collected.length !== expected) {
    failures.push(
      `버전·Node 일치 검사의 대상 package.json이 ${collected.length}개다(예상 ${expected} = 루트 1 + 예산 목록 ${PACKAGES.length}). 적으면 검사가 대상을 놓친 것이고, 많으면 예산 목록 밖의 패키지가 있는 것이다`,
    );
  }

  return collected;
}

const manifests = discoverManifests();

// 1. 버전 정본 일치 — `NEO_AGENT_USER_AGENT`가 정본, `package.json`의 version이 파생
const registrationSource = readOrFail(CONSISTENCY_PATHS.registration, "버전 정본(registration.ts)");
if (registrationSource !== null) {
  const canonicalVersion = soleLiteral(
    registrationSource,
    /^export const NEO_AGENT_USER_AGENT = "neo-agent\/([^"]*)"/gm,
    CONSISTENCY_PATHS.registration,
    "NEO_AGENT_USER_AGENT의 `neo-agent/` 접두 리터럴",
  );
  if (canonicalVersion !== null) {
    let mismatches = 0;
    for (const { path, manifest } of manifests) {
      if (manifest.version !== canonicalVersion) {
        mismatches += 1;
        failures.push(
          `${path}: version이 버전 정본과 어긋난다 — ${JSON.stringify(manifest.version)} ≠ "${canonicalVersion}" (정본: ${CONSISTENCY_PATHS.registration}의 NEO_AGENT_USER_AGENT)`,
        );
      }
    }
    if (mismatches === 0) {
      notes.push(
        `버전 정본 — neo-agent/${canonicalVersion} = package.json ${manifests.length}곳의 version`,
      );
    }
  }
}

// 2·3·4. shim이 정본인 것들 — Node 최소선, 임포트 범위, 종료 코드
const shimSource = readOrFail(CONSISTENCY_PATHS.shim, "bin shim(neo-agent.mjs)");
if (shimSource !== null) {
  // 2. Node 최소선 일치 — shim의 상수와 모든 engines.node
  const minNodeMajor = soleLiteral(
    shimSource,
    /^const MIN_NODE_MAJOR = (\d+);/gm,
    CONSISTENCY_PATHS.shim,
    "MIN_NODE_MAJOR 상수",
  );
  if (minNodeMajor !== null) {
    let mismatches = 0;
    for (const { path, manifest } of manifests) {
      const range = manifest.engines?.node;
      const parsed = typeof range === "string" ? /^>=\s*(\d+)$/.exec(range) : null;
      if (parsed === null) {
        mismatches += 1;
        failures.push(
          `${path}: engines.node가 없거나 대조할 수 없는 형태다 — ${JSON.stringify(range)} (요구 형태: ">=${minNodeMajor}")`,
        );
        continue;
      }
      if (parsed[1] !== minNodeMajor) {
        mismatches += 1;
        failures.push(
          `${path}: engines.node가 shim의 Node 최소선과 어긋난다 — ${JSON.stringify(range)} ≠ ">=${minNodeMajor}" (정본: ${CONSISTENCY_PATHS.shim}의 MIN_NODE_MAJOR)`,
        );
      }
    }
    if (mismatches === 0) {
      notes.push(
        `Node 최소선 — shim의 MIN_NODE_MAJOR=${minNodeMajor} = package.json ${manifests.length}곳의 engines.node ">=${minNodeMajor}"`,
      );
    }
  }

  // 3. shim의 임포트 범위 — `../src/main.ts` 하나뿐이고, 그것도 동적이어야 한다.
  //    정적 임포트는 모듈 본문보다 먼저 평가되므로 하나라도 있으면 버전 게이트보다
  //    먼저 실행된다 — shim의 존재 이유가 그 순간 사라진다(§3.2).
  const shimSpecifiers = importSpecifiers(shimSource);
  const dynamicSpecifiers = [...shimSource.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)].map(
    (match) => match[1],
  );
  const foreign = shimSpecifiers.filter((specifier) => specifier !== SHIM_ALLOWED_IMPORT);
  if (shimSpecifiers.length === 0) {
    failures.push(
      `${CONSISTENCY_PATHS.shim}: 임포트 지정자를 1건도 뽑지 못했다 — shim은 "${SHIM_ALLOWED_IMPORT}"를 동적 import해야 하고, 뽑히지 않는다는 것은 검사가 대상을 놓쳤다는 뜻이다`,
    );
  } else if (foreign.length > 0) {
    failures.push(
      `${CONSISTENCY_PATHS.shim}: shim은 "${SHIM_ALLOWED_IMPORT}" 외 어떤 것도 import하지 않는다(DISTRIBUTION.md §3.2) — ${JSON.stringify(foreign)}`,
    );
  } else if (shimSpecifiers.length !== dynamicSpecifiers.length) {
    failures.push(
      `${CONSISTENCY_PATHS.shim}: "${SHIM_ALLOWED_IMPORT}"를 정적으로 import한다 — 정적 임포트는 버전 게이트보다 먼저 평가되므로 동적 import여야 한다(DISTRIBUTION.md §3.2)`,
    );
  } else {
    notes.push(
      `shim 임포트 범위 — 동적 "${SHIM_ALLOWED_IMPORT}" ${shimSpecifiers.length}건뿐, 그 외 0건`,
    );
  }

  // 4. 기동 실패 종료 코드 일치 — shim은 wiring.ts를 import할 수 없어(그것이 `.ts`라는
  //    것이 shim의 존재 이유다) 값을 리터럴로 중복한다. §4가 명시한 두 검사(버전·Node)와
  //    같은 종류의 중복이므로 같은 자리에서 묶는다 — 계약의 강화이지 변경이 아니다.
  const shimExitCode = soleLiteral(
    shimSource,
    /^const EXIT_STARTUP_FAILED = (\d+);/gm,
    CONSISTENCY_PATHS.shim,
    "EXIT_STARTUP_FAILED 상수",
  );
  const wiringSource = readOrFail(CONSISTENCY_PATHS.wiring, "종료 코드 원본(wiring.ts)");
  if (shimExitCode !== null && wiringSource !== null) {
    const wiringExitCode = soleLiteral(
      wiringSource,
      /^export const EXIT_STARTUP_FAILED = (\d+);/gm,
      CONSISTENCY_PATHS.wiring,
      "EXIT_STARTUP_FAILED 상수",
    );
    if (wiringExitCode !== null) {
      if (shimExitCode !== wiringExitCode) {
        failures.push(
          `${CONSISTENCY_PATHS.shim}: EXIT_STARTUP_FAILED가 wiring.ts와 어긋난다 — ${shimExitCode} ≠ ${wiringExitCode} (${CONSISTENCY_PATHS.wiring})`,
        );
      } else {
        notes.push(
          `기동 실패 종료 코드 — shim의 리터럴 ${shimExitCode} = wiring.ts의 EXIT_STARTUP_FAILED`,
        );
      }
    }
  }
}

// 5. `probeDocker` 주입 규율 — `docs/SANDBOX.md` §3.
//
// `sandbox` 기본값이 `"on"`이라 `startCli`는 시작 시퀀스 5b에서 반드시 Docker 가용성을
// 판정한다. 테스트가 그 판정을 주입하지 않으면 **실제 `docker version` 프로세스가
// 스폰**되고, 그 순간 게이트의 결과가 테스트 머신의 Docker 설치·데몬 상태·권한에
// 좌우된다 — 머신에 따라 갈리는 게이트는 게이트가 아니다.
//
// **규율만으로는 약한 이유**가 이 검사의 존재 이유다: 주입을 잊어도 테스트는 통과하고
// 느려질 뿐이라 **실패가 보이지 않는다**(`ARCHITECTURE.md` §2.6의 최상위 심각도).
// 2026-08-09 QA-C가 `src/` 변경이라 판정으로 올렸고 2026-08-10 판정 D-1이 여기로 정했다.
//
// **검사 대상은 "헬퍼를 들였는가"가 아니라 "주입했는가"다.** 초판은 `./probe-docker.ts`
// 임포트를 요구했는데, 그 형태로 돌리자마자 `distribution-qa-b.contract.test.ts`가
// 걸렸다 — 그 파일은 QA-B의 독립 검증이라 **다른 작성자의 하네스를 일부러 쓰지 않고**
// 자체 `noDocker()`를 주입한다(파일 머리말에 근거가 있다). 규율은 지켰는데 대리 지표가
// 틀린 것이고, 그 상태에서 테스트를 고치면 **독립 검증의 독립성을 검사 편의로 지우는**
// 일이 된다. 규율에는 정당한 형태가 둘 이상 있다.
//
// 정적 검사가 못 잡는 것을 **전부** 정직하게 적는다(목록이 있으면 읽는 사람은 그것을
// 완전한 목록으로 읽으므로 늘어날 때도 줄어들 때도 함께 고친다 — §8 D-3과 같은 규율).
//
// **목록의 정본은 `docs/SANDBOX.md` §3이고 여기가 같은 목록을 갖는다.** 한쪽만 고치면
// 그 순간 "완전한 목록으로 읽힌다"는 병리가 그대로 재발한다 — 2026-08-10 독립 검증이
// 위성 문서 두 곳(probe-docker.ts·spy-docker/README.md)에서 그것을 실제로 잡았고(C-V1),
// 그 뒤로 위성은 목록을 자기 말로 다시 적지 않고 §3을 가리키기만 한다.
//
//   1. **대상 선정이 보는 표기는 둘뿐이다** — 명명 임포트 바인딩과 네임스페이스 **점
//      접근**(`w.startCli`). 그 밖의 표기는 같은 파일에서 직접 부르는데도 빠진다:
//      `w?.startCli` · `w["startCli"]` · `const { startCli } = w` · 동적 import 구조 분해
//      (전부 2026-08-10 실측). **형태를 쫓아 아래 정규식을 넓혀도 끝나지 않는다.**
//   2. `startCli`를 헬퍼로 감싸 **간접 호출** — 이름이 아예 안 나와 대상에서 빠진다.
//      1번이 표기의 문제라면 이쪽은 파일 경계의 문제다.
//   3. factories를 **다른 파일에서 조립**해 넘김 — 주입했는데 이름이 여기 없어 **오탐**.
//   4. 주입 판정이 **파일 전체 텍스트 매칭**이라, 주입이 아닌 언급(구조 분해·단정·타입
//      표기)만 있어도 통과한다. 이것은 정적으로 닫히지 않는다.
//
// 한때 "네임스페이스 임포트는 통째로 안 잡힌다"가 이 목록에 있었고, 2026-08-10에 아래
// `namespaceBindings`+`callsStartCli`로 **그중 점 접근 형태를** 닫았다. 닫힌 것은 그 한
// 형태뿐이고 나머지는 1번에 남아 있다.
//
// **2번을 정적으로 닫지 않는다**(2026-08-10 판정 D-3) — 닫으려면 임포트 그래프를 따라가야
// 하고, 그러면 계약과 이 기계 사이의 거리가 지금보다 훨씬 멀어진다. 그런 파일은 현재
// 0건이고, 생기면 하네스로 관측한다.
//
// 즉 계약("주입했는가")과 이 기계("그 이름이 그 모양으로 파일 어딘가에 있는가") 사이에
// 거리가 있다 — 이 검사는 계약의 **근사**이지 계약 자체가 아니다(§3). 실제 호출 0회를
// 재는 것은 `scripts/spy-docker/`의 하네스다 — 이 검사는 "잊었는가"를 막고 하네스는
// "정말 0회인가"를 잰다.
//
// **이 검사의 존재는 `distribution-supply-chain.contract.test.ts`가 지킨다** — 주입 없는
// 테스트를 심어 떨어지는지, 대상 0건에서 실패하는지 두 건으로. 없으면 이 블록을 지우고
// 아래 상수를 낮추는 것만으로 강제가 조용히 사라진다(2026-08-10 독립 검증 F-1).
{
  /** 블록 주석과 온전한 주석 줄만 지운다. 문자열 안의 `//`를 건드리지 않으려고 줄 중간은 남긴다 */
  const stripComments = (source) =>
    source
      .replaceAll(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        return !trimmed.startsWith("//") && !trimmed.startsWith("*");
      })
      .join("\n");

  /** `import { a, b as c, type D } from "..."`의 바인딩 이름들 */
  const importedNames = (source) => {
    const names = [];
    for (const match of source.matchAll(
      /import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*["'][^"']+["']/g,
    )) {
      for (const part of match[1].split(",")) {
        const name = part
          .trim()
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/)[0]
          ?.trim();
        if (name) names.push(name);
      }
    }
    return names;
  };

  /** `import * as X from "..."`의 네임스페이스 바인딩 이름들 */
  const namespaceBindings = (source) =>
    [...source.matchAll(/import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s*from\s*["'][^"']+["']/g)].map(
      (match) => match[1],
    );

  // 대상 선정은 **두 형태**를 본다 — 명명 임포트(`import { startCli }`)와 네임스페이스
  // 임포트(`import * as w` 후 `w.startCli(...)`).
  //
  // 네임스페이스 쪽을 `importedNames`에 얹지 않고 따로 모으는 이유: 그 임포트가 바인딩하는
  // 이름은 `w`이지 `startCli`가 아니다. `importedNames(...).includes("startCli")`는
  // 바인딩 목록에 `w`를 더해도 여전히 거짓이라, **소스에서 `w.startCli` 사용을 찾는**
  // 두 번째 단계가 있어야 성립한다.
  //
  // 아래 정규식에 끼워 넣는 것은 위 패턴이 식별자 문법(`[A-Za-z_$][\w$]*`)으로만 캡처한
  // 이름이므로 메타문자가 들어올 수 없다. 패턴을 넓힐 일이 생기면 이스케이프를 함께 넣는다.
  const callsStartCli = (stripped) =>
    importedNames(stripped).includes("startCli") ||
    namespaceBindings(stripped).some((ns) =>
      new RegExp(`\\b${ns}\\s*\\.\\s*startCli\\b`).test(stripped),
    );

  let entries = [];
  try {
    entries = readdirSync(CONSISTENCY_PATHS.cliTestDir, { withFileTypes: true });
  } catch (error) {
    failures.push(
      `cli 테스트 디렉터리를 읽을 수 없다 — ${CONSISTENCY_PATHS.cliTestDir} (${error.code ?? error.message})`,
    );
  }

  const callers = [];
  const missing = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".test.ts")) continue;
    const path = join(CONSISTENCY_PATHS.cliTestDir, entry.name);
    const source = readOrFail(path, `cli 테스트 파일`);
    if (source === null) continue;

    const stripped = stripComments(source);
    if (!callsStartCli(stripped)) continue;

    callers.push(entry.name);
    // 주입의 두 형태를 모두 받는다 — 공용 헬퍼를 들이거나, 자기 스텁을 factories에
    // 얹거나. 후자는 `probeDocker:` / `{ probeDocker }` / `{ probeDocker, ... }`로 나타난다.
    const injected =
      importSpecifiers(stripped).includes(PROBE_DOCKER_HELPER) ||
      /\bprobeDocker\b\s*[:,}]/.test(stripped);
    if (!injected) missing.push(entry.name);
  }

  if (callers.length === 0) {
    // 대상 0건은 통과가 아니다. 파일이 옮겨졌거나 `startCli`가 개명됐다는 뜻이고,
    // 그 상태에서 조용히 통과하면 검사가 없는 것과 구분되지 않는다.
    failures.push(
      `${CONSISTENCY_PATHS.cliTestDir}: startCli를 부르는 테스트를 1건도 찾지 못했다 — 대상이 없으면 검사가 죽은 것이다`,
    );
  } else if (missing.length > 0) {
    failures.push(
      `${JSON.stringify(missing)}: startCli를 부르면서 probeDocker를 주입하지 않았다. ` +
        `주입이 없으면 시작 시퀀스 5b가 실제 docker를 스폰해 게이트가 머신 상태에 좌우된다(SANDBOX.md §3) — ` +
        `"${PROBE_DOCKER_HELPER}"의 dockerAvailable()/dockerUnavailable()/dockerProbeForbidden() 중 하나를 ` +
        `startCli의 factories.probeDocker에 넣거나, 그 헬퍼를 쓰지 않는 이유가 있으면 자체 스텁을 같은 자리에 넣는다`,
    );
  } else {
    notes.push(
      `probeDocker 주입 — startCli를 부르는 cli 테스트 ${callers.length}곳 전부가 판정을 주입(공용 헬퍼 또는 자체 스텁)`,
    );
  }
}

// 마지막 fail-closed 그물 — 위 다섯 검사는 각각 실패를 적거나 통과를 적는다. 둘 다
// 없는 상태는 "검사가 실행되지 않았다"는 뜻이고, 그것은 통과가 아니다. 나중에 이
// 블록을 고치다 조용히 빠져나가는 경로가 생겨도 여기서 걸린다.
const EXPECTED_CONSISTENCY_NOTES = 5;
if (failures.length === 0 && notes.length !== EXPECTED_CONSISTENCY_NOTES) {
  failures.push(
    `교차 파일 일치 검사 ${EXPECTED_CONSISTENCY_NOTES}건 중 ${notes.length}건만 판정됐다 — 판정되지 않은 검사는 통과가 아니다`,
  );
}

if (failures.length > 0) {
  console.error("게이트 위반 — 의존성 예산 / 교차 파일 일치:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`의존성 예산 통과 — ${summary.join(" / ")}`);
console.log(`교차 파일 일치 통과 — ${notes.length}/${EXPECTED_CONSISTENCY_NOTES}건:`);
for (const note of notes) console.log(`  - ${note}`);
