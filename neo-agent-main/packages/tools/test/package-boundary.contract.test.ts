/**
 * 패키지 경계와 게이트 접점 — 계약 독립 검증 (QA-A).
 *
 * 기대값의 출처:
 *   - `docs/TOOLS-INTERFACE.md` §1 (의존성 예산 2개, 금지 임포트, 게이트 무의존)
 *   - `docs/TOOLS-INTERFACE.md` §2 (도구 4종, 명시적 배열 등록), §4 (실행 백엔드는 실행자 뒤)
 *   - `docs/TOOLS-INTERFACE.md` §5 (`TOOL_GATE_PROFILES`)
 *
 * 소스 텍스트를 직접 읽는 이유: "셸 도구가 실행 백엔드를 품지 않는다"는 §4의 경계는
 * 런타임 동작이 아니라 **임포트 그래프**의 성질이라 실행으로는 확인되지 않는다.
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createStandardTools,
  createWorkspaceBoundary,
  type ShellExecutor,
  TOOL_GATE_PROFILES,
} from "../src/index.ts";

const SRC_DIR = fileURLToPath(new URL("../src/", import.meta.url));
const PACKAGE_JSON = fileURLToPath(new URL("../package.json", import.meta.url));

function sourceFiles(): { name: string; text: string }[] {
  return readdirSync(SRC_DIR)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => ({ name, text: readFileSync(join(SRC_DIR, name), "utf8") }));
}

describe("패키지 경계 (TOOLS-INTERFACE §1·§4)", () => {
  it("런타임 의존성은 zod와 @neo-agent/core 정확히 2개다", () => {
    const manifest = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual(["@neo-agent/core", "zod"]);
  });

  it("네트워크·DB 모듈을 임포트하지 않는다", () => {
    const forbidden = /from\s+["']node:(net|tls|http|https|sqlite|dgram)["']/;
    for (const file of sourceFiles()) {
      expect(forbidden.test(file.text), `${file.name} imports a forbidden module`).toBe(false);
    }
  });

  it("게이트 패키지를 임포트하지 않는다 — 결합은 호스트 배선 한 곳에서만", () => {
    for (const file of sourceFiles()) {
      expect(file.text.includes("@neo-agent/gate"), `${file.name} imports the gate`).toBe(false);
    }
  });

  it("셸 도구는 실행 백엔드를 직접 품지 않는다 — child_process는 실행자만 안다", () => {
    const byName = new Map(sourceFiles().map((file) => [file.name, file.text]));
    expect(byName.get("shell.ts")).toBeDefined();
    expect(byName.get("shell.ts")?.includes("node:child_process")).toBe(false);

    // 실행 백엔드를 아는 파일이 실행자 하나뿐이어야 교체가 "실행자 교체"로 끝난다
    const spawners = sourceFiles()
      .filter((file) => file.text.includes("node:child_process"))
      .map((file) => file.name);
    expect(spawners).toEqual(["executor.ts"]);
  });
});

describe("게이트 접점 (TOOLS-INTERFACE §2·§5)", () => {
  let sandbox: string;
  let tools: ReturnType<typeof createStandardTools>;

  const noopExecutor: ShellExecutor = {
    async exec() {
      return { exitCode: 0, stdout: "", stderr: "", truncated: false, timedOut: false };
    },
  };

  beforeAll(() => {
    sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-qa-profiles-")));
    mkdirSync(join(sandbox, "ws"), { recursive: true });
    const boundary = createWorkspaceBoundary({
      root: join(sandbox, "ws"),
      home: join(sandbox, "home"),
    });
    tools = createStandardTools({ boundary, executor: noopExecutor });
  });

  afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it("도구 집합은 4종으로 닫힌다", () => {
    expect(tools.map((tool) => tool.name)).toEqual([
      "read_file",
      "write_file",
      "edit_file",
      "shell",
    ]);
  });

  it("도구 이름은 중복되지 않는다", () => {
    const names = tools.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("모든 도구가 모델이 읽을 설명과 UI 라벨을 갖는다", () => {
    for (const tool of tools) {
      expect(tool.label.length, tool.name).toBeGreaterThan(0);
      expect(tool.description.length, tool.name).toBeGreaterThan(0);
    }
  });

  it("게이트 분류 테이블이 도구 4종을 빠짐없이 덮는다 — 누락은 조용한 자동 허용의 씨앗", () => {
    expect(Object.keys(TOOL_GATE_PROFILES).sort()).toEqual(tools.map((tool) => tool.name).sort());
  });

  it("분류 테이블이 가리키는 인자가 실제 스키마에 존재한다", () => {
    const shapeOf = (name: string): Record<string, unknown> => {
      const tool = tools.find((candidate) => candidate.name === name);
      if (tool === undefined) throw new Error(`분류 테이블에만 있고 도구가 없다: ${name}`);
      return (tool.paramsSchema as unknown as { shape: Record<string, unknown> }).shape;
    };

    for (const [name, profile] of Object.entries(TOOL_GATE_PROFILES)) {
      const shape = shapeOf(name);
      if (profile.kind === "shellExec") {
        expect(shape, `${name}.${profile.commandParam}`).toHaveProperty(profile.commandParam);
        if (profile.cwdParam !== undefined) {
          expect(shape, `${name}.${profile.cwdParam}`).toHaveProperty(profile.cwdParam);
        }
      } else {
        expect(shape, `${name}.${profile.pathParam}`).toHaveProperty(profile.pathParam);
      }
    }
  });

  it("도구 등록 순서가 호출 간 안정적이다 — 모델 페이로드 바이트 안정성", () => {
    const boundary = createWorkspaceBoundary({
      root: join(sandbox, "ws"),
      home: join(sandbox, "home"),
    });
    const again = createStandardTools({ boundary, executor: noopExecutor });
    expect(again.map((tool) => tool.name)).toEqual(tools.map((tool) => tool.name));
  });
});
