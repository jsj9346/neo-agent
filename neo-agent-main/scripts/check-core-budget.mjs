/**
 * 패키지별 의존성 예산 게이트.
 *
 * 각 패키지가 무엇에 의존해도 되는지는 설계 문서가 정한 경계다. 이 검사가 없으면
 * 경계는 리뷰어의 기억력에만 의존한다.
 *
 * - `core`   — `docs/CORE-INTERFACE.md` §1: 런타임 의존성은 `zod` 하나. I/O성 내장
 *              모듈을 임포트하지 않는다(파일은 도구 구현, DB는 세션 저장소의 일이고
 *              둘 다 코어 밖이다).
 * - `providers` — `docs/SAFE-DEFAULTS.md` §3: 어댑터는 API 키를 **파라미터로만** 받고
 *              스스로 크리덴셜을 읽지 않는다. 파일·DB·프로세스 스폰 경로를 막아
 *              "시크릿 자가 읽기"를 구조적으로 불가능하게 한다.
 * - `tools`  — `docs/TOOLS-INTERFACE.md` §1: 파일·셸이 본업이므로 `node:fs`·
 *              `node:child_process`는 허용하되, 네트워크와 DB는 막는다. 파일·셸
 *              도구가 직접 소켓을 열 이유가 없다.
 * - `gate`   — `docs/APPROVAL-GATE.md` §1: 게이트는 순수 판정 로직이다. 파일·
 *              프롬프트·경로 판정을 전부 주입받으므로 I/O가 필요 없고, 판정 모듈이
 *              스스로 프로세스를 스폰하거나 네트워크에 나가는 경로를 기계적으로 막는다.
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
    forbiddenModules: ["node:fs", "node:sqlite", "node:child_process", "node:net", "node:tls"],
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
    name: "store",
    dependencies: ["@neo-agent/core", "zod"],
    // 저장소는 `node:fs`(디렉터리 생성·권한 확인)와 `node:sqlite`(본업)를 쓴다 —
    // 다른 패키지의 IO_MODULES를 그대로 복사하면 본업이 막힌다. 금지 대상은
    // 네트워크와 프로세스 스폰: 대화 전문을 보관하는 패키지가 바깥으로 나가는
    // 경로를 기계적으로 차단한다(docs/SESSION-STORE.md §1).
    forbiddenModules: [
      "node:net",
      "node:tls",
      "node:http",
      "node:https",
      "node:child_process",
      "node:dgram",
      "node:worker_threads",
    ],
  },
];

const failures = [];

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

  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const dependencies = Object.keys(manifest.dependencies ?? {}).sort();
  const allowed = [...pkg.dependencies].sort();
  if (dependencies.join() !== allowed.join()) {
    failures.push(
      `${pkg.name}: dependencies가 예산을 벗어났다 — ${JSON.stringify(dependencies)} (허용: ${JSON.stringify(allowed)})`,
    );
  }

  for (const file of sourceFiles(join(root, "src"))) {
    for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
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

if (failures.length > 0) {
  console.error("의존성 예산 위반:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`의존성 예산 통과 — ${summary.join(" / ")}`);
