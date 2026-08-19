/**
 * argv 파싱 계약 — `docs/CLI-INTERFACE.md` §5.
 *
 * "argv는 최소로 닫는다: `neo-agent`(새 세션) · `neo-agent --resume <접두>`(재개) ·
 * `--help` · `--version`. 그 외 조작은 전부 REPL 슬래시 명령이다."
 *
 * 반환 타입의 형태는 문서가 정하지 않았으므로(구현 세부), 검증은 **네 입력이 서로
 * 구별되는 결과를 낳는가**와 **재개 접두가 보존되는가**에 둔다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { loadCliModule, pickExport } from "./harness.ts";

let parseArgs: (argv: string[]) => unknown;

beforeAll(async () => {
  const module = await loadCliModule("args.ts");
  parseArgs = pickExport(module, ["parseArgs", "parseArgv", "parseCliArgs"], "argv 파서");
});

/** 결과를 비교 가능한 문자열로 — 형태를 모르므로 구조 전체를 본다 */
function shape(value: unknown): string {
  return JSON.stringify(value, (_key, item) => (typeof item === "function" ? "[fn]" : item));
}

describe("argv 파서 (CLI-INTERFACE §5)", () => {
  it("인자 없음 — 새 세션", () => {
    expect(() => parseArgs([])).not.toThrow();
    expect(parseArgs([])).toBeDefined();
  });

  it("--resume <접두> — 접두 문자열이 결과에 보존된다", () => {
    const parsed = parseArgs(["--resume", "3f2a1b"]);
    expect(shape(parsed)).toContain("3f2a1b");
  });

  it("--help", () => {
    expect(() => parseArgs(["--help"])).not.toThrow();
    expect(parseArgs(["--help"])).toBeDefined();
  });

  it("--version", () => {
    expect(() => parseArgs(["--version"])).not.toThrow();
    expect(parseArgs(["--version"])).toBeDefined();
  });

  it("네 입력은 서로 구별되는 결과를 낳는다", () => {
    // 구별되지 않으면 호출부가 분기할 수 없다 — 파서의 존재 이유가 사라진다.
    const results = new Map<string, string>([
      ["(없음)", shape(parseArgs([]))],
      ["--resume", shape(parseArgs(["--resume", "3f2a1b"]))],
      ["--help", shape(parseArgs(["--help"]))],
      ["--version", shape(parseArgs(["--version"]))],
    ]);
    expect(new Set(results.values()).size).toBe(4);
  });

  // ---------------------------------------------------------------------------
  // [미규정] 판정 필요 — 아래 두 경우는 CLI-INTERFACE §5가 규정하지 않았다.
  //   (a) 미지의 argv (`neo-agent --yolo`)의 처리: 에러인가 무시인가.
  //       §5는 "argv는 최소로 닫는다"고만 하고 닫힌 목록 밖의 처리를 말하지 않는다.
  //       설정 파일의 미지 키는 §3이 "시작 시 에러"로 명시했고 근거(침묵 실패 금지,
  //       §2.6)는 argv에도 그대로 적용될 것으로 보이나, **문서에 없으므로 여기서
  //       판정하지 않는다.**
  //   (b) `--resume`에 접두 인자가 없을 때(`neo-agent --resume`).
  // 임의 판정을 피해 단언하지 않고, 관찰된 동작만 기록한다.
  // ---------------------------------------------------------------------------
  it("[미규정] 미지 argv·인자 없는 --resume의 동작을 관찰만 한다 (판정 필요)", () => {
    const observe = (argv: string[]): string => {
      try {
        return `ok: ${shape(parseArgs(argv))}`;
      } catch (error) {
        return `throw: ${error instanceof Error ? error.message : String(error)}`;
      }
    };
    const unknownFlag = observe(["--yolo"]);
    const bareResume = observe(["--resume"]);
    // 단언하지 않는다 — 판정은 설계자의 몫이다. 결과는 실패 메시지로 남기지 않으므로
    // 보고서에 옮겨 적는다.
    expect(typeof unknownFlag).toBe("string");
    expect(typeof bareResume).toBe("string");
  });
});
