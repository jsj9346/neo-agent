/**
 * 패키지 경계와 게이트 접점 — 계약 독립 검증 (QA-A).
 *
 * 기대값의 출처:
 *   - `docs/TOOLS-INTERFACE.md` §1 (의존성 예산 2개, **금지 모듈** 일곱, 게이트 무의존)
 *   - `docs/TOOLS-INTERFACE.md` §2 (도구 4종, 명시적 배열 등록), §4 (실행 백엔드는 실행자 뒤)
 *   - `docs/TOOLS-INTERFACE.md` §5 (`TOOL_GATE_PROFILES`)
 *
 * 소스 텍스트를 직접 읽는 이유: "셸 도구가 실행 백엔드를 품지 않는다"는 §4의 경계는
 * 런타임 동작이 아니라 **임포트 그래프**의 성질이라 실행으로는 확인되지 않는다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
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

/**
 * 주석 본문을 공백으로 지운다(줄 번호·열 폭 보존). **문자열 리터럴은 남긴다** — 아래
 * 경계 단정이 보는 것이 임포트 지정자, 즉 문자열 안이기 때문이다. 그래서 이 함수가 하는
 * 일은 «문자열을 건너뛰며 주석만 지운다»이고, 문자열 안의 `//`에 속지 않는 것이 요점이다.
 *
 * **파일-로컬 복제다.** `packages/cli/test/package-boundary.contract.test.ts`에 같은
 * 술어가 있고 공유하지 않았다 — 그 파일의 머리가 적는 이유(계약 판정이 다른 테스트의 헬퍼
 * 변경에 끌려가지 않게 한다)가 여기에도 그대로 선다. 렉싱 정본(`scripts/comment-lexer.mjs`)을
 * 안 부르는 것은 그쪽이 `typescript` 파서를 세우기 때문이다 — 이 패키지의 런타임 예산은
 * 둘이고(위 `:43` 단정) 판정 하나를 위해 파서를 끌어올 자리가 아니다.
 */
function stripComments(source: string): string {
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
      out += source.slice(index, Math.min(cursor + 1, source.length));
      index = Math.min(cursor + 1, source.length);
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

/**
 * `src/`의 모듈들. `text`는 **주석을 벗긴** 원문이다 — 아래 단정들이 재는 것은 임포트
 * 그래프이지 사람이 적어 둔 설명이 아니다. 특히 실행 백엔드를 아는 파일을 **세는** 단정
 * (`:63`)은 양방향으로 샌다: 주석의 언급이 목록을 부풀리고, 반대로 실물이 주석 안에만
 * 있어도 목록에 든다.
 */
function sourceFiles(): { name: string; text: string }[] {
  return readdirSync(SRC_DIR)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => ({ name, text: stripComments(readFileSync(join(SRC_DIR, name), "utf8")) }));
}

describe("패키지 경계 (TOOLS-INTERFACE §1·§4)", () => {
  it("런타임 의존성은 zod와 @neo-agent/core 정확히 2개다", () => {
    const manifest = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual(["@neo-agent/core", "zod"]);
  });

  it("네트워크·DB 모듈과 그 우회로를 임포트하지 않는다", () => {
    // §1의 **금지 모듈** 열거 일곱과 같은 집합이다. `node:worker_threads`가 드는 근거는
    // 앞의 네트워크 금지와 같다 — 워커가 자기 컨텍스트에서 여는 소켓은 이 금지를 돌아가는
    // 경로이므로, 함께 막지 않으면 차단이 반쪽이 된다(2026-08-24 열거 편입).
    const forbidden = /from\s+["']node:(net|tls|http|https|sqlite|dgram|worker_threads)["']/;
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
