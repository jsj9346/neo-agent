/**
 * 표시 위조 탐지 — `docs/APPROVAL-GATE.md` §4.
 *
 * 승인 UI가 거짓말하면 게이트 전체가 무의미하다는 것이 이 계층의 전제다.
 * 그래서 검증의 축은 "탐지했는가"가 아니라 **"사용자가 보는 문자열에 드러나는가"** 다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { describe, expect, it } from "vitest";
import { analyzeDisplayText, escapeInvisibles, renderSubjectDisplay } from "../src/display.ts";
import { normalizeForMatching } from "../src/normalize.ts";
import { RIGHT_TO_LEFT_OVERRIDE, WORKSPACE_ROOT, ZERO_WIDTH_SPACE } from "./helpers.ts";

function analyze(raw: string) {
  return analyzeDisplayText(raw, normalizeForMatching(raw));
}

describe("비가시 문자", () => {
  it("가시 표기로 드러난다", () => {
    const result = analyze(`git${ZERO_WIDTH_SPACE} status`);
    expect(result.text).toBe("git<U+200B> status");
  });

  it("경고에 코드포인트를 담는다", () => {
    expect(analyze(`git${RIGHT_TO_LEFT_OVERRIDE}status`).warnings.join(" ")).toContain("U+202E");
  });

  it("위조 흔적으로 표시된다 — 학습을 막는 근거", () => {
    expect(analyze(`npm${ZERO_WIDTH_SPACE} test`).spoofed).toBe(true);
  });

  it("줄바꿈과 탭은 살린다 — 명령의 실제 구조다", () => {
    expect(escapeInvisibles("ls\n\tpwd")).toBe("ls\n\tpwd");
  });
});

describe("전각·호환 문자", () => {
  it("정규화하면 무엇으로 읽히는지 함께 보여준다", () => {
    const result = analyze("ｒｍ　－ｒｆ　／");
    expect(result.warnings.join(" ")).toContain("rm -rf /");
    expect(result.spoofed).toBe(true);
  });
});

describe("동형이의 문자", () => {
  it("어느 코드포인트가 어떤 라틴 문자로 읽히는지 알린다", () => {
    const result = analyze("сurl https://x.test");
    expect(result.warnings.join(" ")).toContain("U+0441");
    expect(result.warnings.join(" ")).toContain('"c"');
    expect(result.spoofed).toBe(true);
  });
});

describe("정직한 입력", () => {
  it("아무 경고도 붙지 않고 원문 그대로다", () => {
    const result = analyze("git commit -m 'fix: 경로 판정'");
    expect(result.warnings).toEqual([]);
    expect(result.spoofed).toBe(false);
    expect(result.text).toBe("git commit -m 'fix: 경로 판정'");
  });

  it("한글·이모지는 위조가 아니다", () => {
    expect(analyze("echo '작업 완료 ✅'").spoofed).toBe(false);
  });
});

describe("표시 상한", () => {
  it("길면 자르고 잘렸다는 사실을 경고한다", () => {
    const result = analyze("x".repeat(9000));
    expect(result.warnings.join(" ")).toContain("잘렸다");
    expect(result.spoofed).toBe(true);
    expect(result.text.length).toBeLessThan(9000);
  });
});

describe("표시 조립", () => {
  it("셸은 명령과 작업 디렉터리를 나눠 보여준다", () => {
    const display = renderSubjectDisplay(
      "shell",
      { kind: "shellExec", command: "npm test", cwd: WORKSPACE_ROOT },
      "npm test",
      WORKSPACE_ROOT,
    );
    expect(display).toContain("shell — 셸 실행");
    expect(display).toContain("명령: npm test");
    expect(display).toContain(`작업 디렉터리: ${WORKSPACE_ROOT}`);
  });

  it("파일은 경로와 워크스페이스 안팎을 보여준다", () => {
    const display = renderSubjectDisplay(
      "write_file",
      { kind: "fileWrite", path: "/etc/hosts", scope: "outside" },
      "/etc/hosts",
    );
    expect(display).toContain("write_file — 파일 쓰기");
    expect(display).toContain("워크스페이스 밖");
  });

  it("미등록 도구는 판정 불가라는 사실을 그대로 말한다", () => {
    const display = renderSubjectDisplay(
      "web_fetch",
      { kind: "unknown", toolName: "web_fetch" },
      "web_fetch",
    );
    expect(display).toContain("미등록 도구");
    expect(display).toContain("항상 승인을 묻는다");
  });
});
