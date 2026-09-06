/**
 * argv 파싱 계약 — `docs/CLI-INTERFACE.md` §5.
 *
 * §5는 argv를 여섯으로 닫는다 — `neo-agent`(새 세션) · `neo-agent --resume <접두>`(재개) ·
 * `neo-agent serve`(웹 UI 서버) · `neo-agent doctor`(진단 — §5.1) · `--help` · `--version`.
 * 그 밖의 조작은 전부 REPL 슬래시 명령이고, 목록 밖의 argv와 인자 없는 `--resume`은
 * 사용법 에러다.
 *
 * **위 목록을 인용부호로 감싸 옮기지 않는다.** §5의 그 문장은 갈래가 늘 때마다 함께
 * 바뀌고(2026-08-25 `serve` · 2026-09-06 `doctor`), 인용부호를 달아 두면 그때마다 이
 * 주석이 §3.4 U-1 위반이 된다 — 실제로 2026-09-06까지 이 자리가 다섯짜리 옛 문면을
 * 인용부호에 담고 있었다. `check:citations`는 `docs/*.md`만 보므로 기계가 이 자리를
 * 안 잡는다. 그래서 여기는 인용이 아니라 **서술**이다.
 *
 * 반환 타입의 형태는 문서가 정하지 않았으므로(구현 세부), 검증은 **여섯 입력이 서로
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

  it("serve — 위치 인자 하나가 닫힌 목록 안이다 (§5)", () => {
    // §5가 `neo-agent serve`(웹 UI 서버)를 닫힌 목록에 든다. 위치 인자는 이 하나뿐이고,
    // 목록 **안**이므로 사용법 에러가 아니다.
    expect(() => parseArgs(["serve"])).not.toThrow();
    expect(parseArgs(["serve"])).toBeDefined();
  });

  it("doctor — 위치 인자 둘째가 닫힌 목록 안이다 (§5·§5.1)", () => {
    // §5가 `neo-agent doctor`(진단 — §5.1)를 닫힌 목록에 든다. 위치 인자는 `serve`와
    // 이것 둘이고, 목록 **안**이므로 사용법 에러가 아니다.
    expect(() => parseArgs(["doctor"])).not.toThrow();
    expect(parseArgs(["doctor"])).toBeDefined();
  });

  it("여섯 입력은 서로 구별되는 결과를 낳는다", () => {
    // 구별되지 않으면 호출부가 분기할 수 없다 — 파서의 존재 이유가 사라진다.
    // `serve`가 다섯째로 든 뒤 이 축은 하나를 더 진다: `main.ts`가 TTY 부재 거부의
    // 면제를 **이 파서의 답 하나**로 판정하므로(§2.2 계약 2), `serve`의 결과가 다른
    // 넷 중 무엇과라도 같아지면 면제가 그 갈래로 새거나 `serve`에서 사라진다.
    //
    // `doctor`가 여섯째로 들며 **같은 몫이 그 갈래에도 걸린다**(§2.2 계약 2·4 ·
    // §5.1 계약 8) — 면제 대상이 둘이 됐고, 둘의 면제 근거는 서로 다르다(`serve`는
    // 승인자의 이전, `doctor`는 승인의 부재 — §2.2 계약 5의 표). 근거가 다르다는 것은
    // 이 축이 재는 것을 바꾸지 않는다: 재는 것은 여전히 **답이 갈래마다 다른가**이고,
    // `doctor`의 결과가 다른 다섯 중 무엇과라도 같아지면 면제가 그 갈래로 새거나
    // `doctor`에서 사라진다.
    //
    // **모집단이 이 표에 손으로 적혀 있다는 것이 이 축의 한계다.** 재는 것은 갈래 수가
    // 아니라 여기 적힌 입력들의 결과 집합 크기이므로, §5에 갈래가 늘어도 이 축은
    // 자기가 낡았다고 말하지 않는다 — 2026-09-06에 `doctor`가 `CliArgs`에 들어온 뒤에도
    // 다섯짜리 이 축이 그대로 그린이었다(실측). 갈래를 더하는 사이클이 이 표에 행을
    // 함께 더한다. **닫힌 목록 자체를 기계가 재는 자리는 §5.1 계약 2의 `DOCTOR_AXES`
    // 같은 완전 레코드이지 이 축이 아니다.**
    const results = new Map<string, string>([
      ["(없음)", shape(parseArgs([]))],
      ["--resume", shape(parseArgs(["--resume", "3f2a1b"]))],
      ["serve", shape(parseArgs(["serve"]))],
      ["doctor", shape(parseArgs(["doctor"]))],
      ["--help", shape(parseArgs(["--help"]))],
      ["--version", shape(parseArgs(["--version"]))],
    ]);
    expect(new Set(results.values()).size).toBe(6);
  });

  // ---------------------------------------------------------------------------
  // 이 두 경우는 2026-08-06에 판정돼 §5가 든다: 닫힌 목록 밖의 argv와 인자 없는
  // `--resume`은 사용법 에러다. 근거는 §3의 미지 키와 같다 — 오타의 침묵 무시 차단
  // (§2.6). 그 전까지 이 자리는 관찰만 하는 미규정 마커 테스트였고, 판정이 끝난 뒤에도
  // 마커가 남아 있었다(2026-08-20 K-005에서 걷음). 관찰은 아무것도 못 잡으므로
  // 단언으로 올린다.
  // ---------------------------------------------------------------------------
  it("닫힌 목록 밖의 argv는 사용법 에러다 (§5)", () => {
    expect(() => parseArgs(["--yolo"])).toThrow();
    expect(() => parseArgs(["-h"])).toThrow();
    expect(() => parseArgs(["resume", "3f2a1b"])).toThrow();
    // 닫힌 목록 **안**의 플래그라도 남는 인자가 붙으면 목록 밖의 형태다
    expect(() => parseArgs(["--help", "extra"])).toThrow();
    // 위치 인자도 같다. **문면이 무엇인가는 정본이 정하지 않았고**(구현이 `[미규정]`으로
    // 표시했다) 여기서 단정하지 않는다 — 재는 것은 «조용히 통과하지 않는다»뿐이다.
    expect(() => parseArgs(["serve", "extra"])).toThrow();
    expect(() => parseArgs(["Serve"])).toThrow();
    // `doctor`도 같다. 이 던짐은 종료 코드 하나만 정하지 않는다 — 파싱이 던지면
    // `main.ts`가 TTY 면제를 주지 않으므로(§2.2 계약 4 — fail-closed), 같은 입력이
    // TTY 아래에서는 사용법 에러(§5.1 계약 7)이고 비-TTY에서는 TTY 거부다. 그 두
    // 갈래를 실제로 재는 것은 스폰 하네스이고 여기는 던짐까지만 잰다.
    expect(() => parseArgs(["doctor", "extra"])).toThrow();
    expect(() => parseArgs(["Doctor"])).toThrow();
  });

  it("인자 없는 --resume은 사용법 에러다 (§5)", () => {
    expect(() => parseArgs(["--resume"])).toThrow();
    expect(() => parseArgs(["--resume", "   "])).toThrow();
  });
});
