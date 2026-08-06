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
