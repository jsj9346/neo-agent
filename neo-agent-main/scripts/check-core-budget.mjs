/**
 * 코어 의존성 예산 게이트.
 *
 * `docs/CORE-INTERFACE.md` §1 — 코어의 런타임 의존성은 `zod` 하나이고, 코어
 * 소스는 I/O성 내장 모듈을 임포트하지 않는다. 파일을 만지는 것은 도구 구현이고
 * DB를 만지는 것은 세션 저장소이며, 둘 다 코어 밖이다.
 *
 * 이 검사가 없으면 경계는 리뷰어의 기억력에만 의존한다.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CORE = new URL("../packages/core/", import.meta.url).pathname;
const ALLOWED_DEPENDENCIES = ["zod"];
const FORBIDDEN_MODULES = [
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

const failures = [];

const manifest = JSON.parse(readFileSync(join(CORE, "package.json"), "utf8"));
const dependencies = Object.keys(manifest.dependencies ?? {}).sort();
if (dependencies.join() !== [...ALLOWED_DEPENDENCIES].sort().join()) {
  failures.push(
    `dependencies가 예산을 벗어났다: ${JSON.stringify(dependencies)} (허용: ${JSON.stringify(ALLOWED_DEPENDENCIES)})`,
  );
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

for (const file of sourceFiles(join(CORE, "src"))) {
  const specifiers = importSpecifiers(readFileSync(file, "utf8"));
  for (const specifier of specifiers) {
    if (FORBIDDEN_MODULES.includes(specifier)) {
      failures.push(`${file}: I/O성 모듈 임포트 금지 — "${specifier}"`);
    }
    const isRelative = specifier.startsWith(".");
    const isBuiltin = specifier.startsWith("node:");
    if (!isRelative && !isBuiltin && !ALLOWED_DEPENDENCIES.includes(specifier)) {
      failures.push(`${file}: 예산 밖 의존성 임포트 — "${specifier}"`);
    }
  }
}

if (failures.length > 0) {
  console.error("코어 의존성 예산 위반:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`코어 의존성 예산 통과 (dependencies: ${JSON.stringify(dependencies)})`);
