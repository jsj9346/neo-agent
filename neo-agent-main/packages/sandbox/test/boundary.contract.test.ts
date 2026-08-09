/**
 * 패키지 경계 — 계약 독립 검증 (QA-B, 구현보다 먼저 작성).
 *
 * 기대값의 출처:
 *   - `docs/SANDBOX.md` §2 (의존성 예산 정확히 2개, 허용/금지 내장 모듈,
 *     `packages/tools` 미임포트, Docker HTTP API가 아니라 CLI)
 *
 * **소스 텍스트를 직접 읽는 이유**: "`packages/tools`를 임포트하지 않는다"와
 * "`node:net`을 쓰지 않는다"는 런타임 동작이 아니라 **임포트 그래프의 성질**이라
 * 실행으로는 확인되지 않는다. 예산 게이트(`scripts/check-core-budget.mjs`)와
 * 이중으로 두는 이유는, 게이트는 CI 스크립트라 이 패키지의 테스트만 돌리는 개발
 * 루프에서 빠지기 때문이다.
 *
 * 이 파일은 `src`를 **임포트하지 않는다** — 구현 전에도 실행되어 스캐폴드가
 * 경계를 지키는지 보게 하려는 의도다.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC_DIR = fileURLToPath(new URL("../src/", import.meta.url));
const PACKAGE_JSON = fileURLToPath(new URL("../package.json", import.meta.url));

function sourceFiles(): { name: string; text: string }[] {
  return readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".ts"))
    .map((name) => ({ name, text: readFileSync(join(SRC_DIR, name), "utf8") }));
}

describe("의존성 예산 (SANDBOX §2)", () => {
  it("런타임 의존성은 `@neo-agent/core`와 `zod` 정확히 2개다", () => {
    const manifest = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual(["@neo-agent/core", "zod"]);
  });

  it("`@neo-agent/tools`는 devDependency다 — 타입 호환 확인용이지 런타임 결합이 아니다", () => {
    const manifest = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(manifest.dependencies ?? {}).not.toHaveProperty("@neo-agent/tools");
    expect(manifest.devDependencies ?? {}).toHaveProperty("@neo-agent/tools");
  });
});

describe("임포트 경계 (SANDBOX §2)", () => {
  it("`src/**`가 `@neo-agent/tools`를 임포트하지 않는다 — 구조적 타입 호환만", () => {
    // 임포트가 생기면 `ShellExecutor` 계약이 "구조적 호환"에서 "상속"으로 바뀌고,
    // 게이트가 `PathClassifier`를 임포트 없이 만족시키는 패턴이 깨진다.
    for (const file of sourceFiles()) {
      expect(file.text.includes("@neo-agent/tools"), `${file.name}가 tools를 임포트한다`).toBe(
        false,
      );
    }
  });

  it("`src/**`가 `@neo-agent/gate`·`@neo-agent/web`을 임포트하지 않는다", () => {
    for (const file of sourceFiles()) {
      for (const forbidden of ["@neo-agent/gate", "@neo-agent/web", "@neo-agent/cli"]) {
        expect(file.text.includes(forbidden), `${file.name}가 ${forbidden}를 임포트한다`).toBe(
          false,
        );
      }
    }
  });

  it("금지 내장 모듈(파일·네트워크·DB)을 임포트하지 않는다", () => {
    // 샌드박스가 파일이나 네트워크에 직접 닿을 이유가 없다(§2). 특히 `node:net`은
    // Docker **HTTP API**로 가는 문이고, 소켓 접근 코드를 갖는 것 자체가 §1의
    // 위험(데몬은 호스트 root 권한)을 우리 코드 안으로 들이는 일이다.
    const forbidden =
      /from\s+["']node:(fs|fs\/promises|net|tls|http|https|sqlite|dgram|worker_threads)["']/;
    for (const file of sourceFiles()) {
      expect(forbidden.test(file.text), `${file.name}가 금지 모듈을 임포트한다`).toBe(false);
    }
  });

  it("Docker와의 접점은 CLI 호출뿐이다 — 소켓 경로 문자열이 소스에 없다", () => {
    for (const file of sourceFiles()) {
      expect(file.text.includes("docker.sock"), `${file.name}가 소켓 경로를 안다`).toBe(false);
      expect(file.text.includes("/var/run/docker"), `${file.name}가 소켓 경로를 안다`).toBe(false);
    }
  });

  it("`node:child_process`는 허용된다 — 다만 아는 파일은 하나여야 한다", () => {
    // 스폰 지점이 흩어지면 "docker CLI 호출이 본업"이라는 경계가 서서히 무너진다.
    // 구현 전에는 0개이므로 상한만 본다(1개 이하).
    const spawners = sourceFiles()
      .filter((file) => file.text.includes("node:child_process"))
      .map((file) => file.name);
    expect(spawners.length).toBeLessThanOrEqual(1);
  });
});
