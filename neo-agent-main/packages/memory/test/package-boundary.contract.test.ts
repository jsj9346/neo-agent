/**
 * 패키지 경계와 공개 표면 — 계약 독립 검증 (QA-A · T-002 선행 작성).
 *
 * 기대값의 출처: `docs/MEMORY.md` §4.4 — *"`packages/memory`의 예산: `node:fs` 허용,
 * **네트워크·`child_process`·`node:sqlite` 금지**"* 와 그 근거(이 패키지는 denylist
 * 안쪽에 쓰는 유일한 코드이므로 표면이 가장 좁아야 한다), §2.1(경로가 곧 격리),
 * §4.1(공개 표면), §9 M-2(디렉터리는 설정 표면이 아니다).
 * 보조로 배치 스케치가 고정한 이름 목록.
 *
 * 소스 텍스트를 직접 읽는 이유: "임포트하지 않는다"는 임포트 그래프의 성질이라 실행으로
 * 확인되지 않는다. 예산 게이트(`scripts/check-core-budget.mjs`)와 겹치지만 그쪽은 통합
 * 게이트에서만 돌고 이쪽은 패키지 스코프에서 돈다 — 병렬 구간에서 먼저 알아채는 것이 목적.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as barrel from "../src/index.ts";

const PACKAGE_DIR = fileURLToPath(new URL("../", import.meta.url));
const SRC_DIR = join(PACKAGE_DIR, "src");
const PACKAGE_JSON = join(PACKAGE_DIR, "package.json");

function sourceFiles(): { name: string; text: string }[] {
  if (!existsSync(SRC_DIR)) return [];
  return readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".ts"))
    .map((name) => ({ name, text: readFileSync(join(SRC_DIR, name), "utf8") }));
}

describe("의존성 예산 (MEMORY §4.4)", () => {
  it("package.json이 있고 이름이 @neo-agent/memory다", () => {
    expect(existsSync(PACKAGE_JSON)).toBe(true);
    const manifest = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as { name?: string };
    expect(manifest.name).toBe("@neo-agent/memory");
  });

  it("런타임 의존성은 @neo-agent/core와 zod 정확히 2개다", () => {
    expect(existsSync(PACKAGE_JSON)).toBe(true);
    const manifest = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual(["@neo-agent/core", "zod"]);
  });
});

describe("금지 내장 모듈 (MEMORY §4.4 — 표면이 가장 좁아야 한다)", () => {
  it("네트워크·프로세스·DB 모듈을 임포트하지 않는다", () => {
    // 네트워크가 열리면 "오염된 런에서는 쓰지 못한다"(§5)를 강제하는 코드가 스스로
    // 밖에 나갈 수 있게 되어 전제가 무너진다.
    const forbidden =
      /from\s+["']node:(net|tls|http|https|sqlite|child_process|dgram|worker_threads|dns|dns\/promises)["']/;
    expect(sourceFiles().length).toBeGreaterThan(0);
    for (const file of sourceFiles()) {
      expect(forbidden.test(file.text), `${file.name}이 금지 모듈을 임포트한다`).toBe(false);
    }
  });

  it("동적 임포트·require로 우회하지 않는다", () => {
    const sneaky =
      /(?:import|require)\s*\(\s*["']node:(net|tls|http|https|sqlite|child_process|dns)/;
    for (const file of sourceFiles()) {
      expect(sneaky.test(file.text), `${file.name}이 동적 임포트로 우회한다`).toBe(false);
    }
  });

  it("전역 fetch를 쓰지 않는다", () => {
    const usesFetch = /\bfetch\s*\(/;
    for (const file of sourceFiles()) {
      expect(usesFetch.test(file.text), `${file.name}이 전역 fetch를 쓴다`).toBe(false);
    }
  });
});

describe("패키지 무의존 (MEMORY §4.4 — 프로필은 구조적 호환으로 만난다)", () => {
  it("packages/gate·packages/tools를 임포트하지 않는다", () => {
    const forbidden = /from\s+["']@neo-agent\/(gate|tools|cli|store|web|sandbox|compaction)["']/;
    for (const file of sourceFiles()) {
      expect(forbidden.test(file.text), `${file.name}이 다른 패키지를 임포트한다`).toBe(false);
    }
  });
});

describe("공개 표면 (MEMORY §4.1 · 배치 스케치)", () => {
  const expected = [
    "loadMemory",
    "renderMemoryBlock",
    "appendMemoryEntry",
    "removeMemoryEntry",
    "createRememberTool",
    "MEMORY_TOOL_GATE_PROFILES",
    "MEMORY_FILE_NAME",
    "MEMORY_FILE_MAX_CHARS",
    "MEMORY_ENTRY_MAX_CHARS",
  ];

  it("배럴이 계약된 이름을 전부 내보낸다", () => {
    const exported = Object.keys(barrel as Record<string, unknown>);
    for (const name of expected) {
      expect(exported, `${name}이 배럴에 없다`).toContain(name);
    }
  });

  it("쓰기 표면은 하나다 — 다른 모델 도구 팩토리를 내보내지 않는다", () => {
    // §4.1 "추가·수정·삭제 중 추가만 있다". `replace`/`forget`/`batch` 도구가 생기면
    // 이 패키지의 계약이 바뀐 것이다.
    const exported = Object.keys(barrel as Record<string, unknown>);
    const toolFactories = exported.filter((name) => /^create\w*Tool$/.test(name));
    expect(toolFactories).toEqual(["createRememberTool"]);
  });
});
