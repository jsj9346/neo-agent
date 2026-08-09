/**
 * 항목 경계와 프롬프트 블록 렌더 — 계약 독립 검증 (QA-A · T-002 선행 작성).
 *
 * 기대값의 출처는 `docs/MEMORY.md`뿐이다:
 *   - §7.3 항목 = 최상위 `- ` 불릿 한 개. 불릿이 아닌 줄은 보존되고 세지 않는다
 *   - §7.3 예산은 파일 전체 문자 수로 센다
 *   - §3.2 블록은 내용이 있을 때만 붙는다. 항목 순서는 파일 순서 그대로
 *
 * **안전**: 메모리 디렉터리는 전부 임시 경로 주입이다.
 */

import { afterEach, describe, expect, it } from "vitest";
import { loadMemory, renderMemoryBlock } from "../src/index.ts";
import { cleanupRoots, newMemoryDir, newRoot, writeMemory } from "./support.ts";

afterEach(() => {
  cleanupRoots();
});

/** 사용자가 파일에 구조를 준 상태 — 우리가 지우지 않는다는 것을 보는 픽스처 */
const STRUCTURED = [
  "# 메모리",
  "",
  "사용자가 직접 쓴 설명 문단이다.",
  "",
  "- 첫 번째 항목",
  "- 두 번째 항목",
  "  - 중첩 불릿은 항목이 아니다",
  "* 별표 불릿도 최상위 `- `가 아니다",
  "",
  "## 섹션 제목",
  "",
  "- 세 번째 항목",
  "",
].join("\n");

function snapshotOf(text: string) {
  const dir = newMemoryDir(newRoot());
  writeMemory(dir, text);
  return loadMemory({ dir });
}

describe("항목 경계 (MEMORY §7.3)", () => {
  it("최상위 `- ` 불릿만 항목이다 — 제목·문단·중첩·별표는 세지 않는다", () => {
    const snapshot = snapshotOf(STRUCTURED);

    expect(snapshot.entries).toHaveLength(3);
  });

  it("불릿이 아닌 줄은 전부 보존된다 — 사용자가 준 구조를 지우지 않는다", () => {
    const snapshot = snapshotOf(STRUCTURED);

    expect(snapshot.text).toBe(STRUCTURED);
    expect(snapshot.text).toContain("# 메모리");
    expect(snapshot.text).toContain("사용자가 직접 쓴 설명 문단이다.");
    expect(snapshot.text).toContain("  - 중첩 불릿은 항목이 아니다");
    expect(snapshot.text).toContain("* 별표 불릿도 최상위 `- `가 아니다");
    expect(snapshot.text).toContain("## 섹션 제목");
  });

  it("항목 본문은 불릿 마커를 제외한 것이다", () => {
    const snapshot = snapshotOf(STRUCTURED);

    // 판정 A-4(§7.4): 중첩 줄은 `content`에 **포함하지 않는다**(첫 줄만). §7.3이
    // 중첩 불릿을 "항목이 아니다"로 이미 배제했다. A-13(삭제 시 남긴다)과 한 쌍이다.
    expect(snapshot.entries[0]?.content).toBe("첫 번째 항목");
    expect(snapshot.entries[1]?.content).toBe("두 번째 항목");
    expect(snapshot.entries[2]?.content).toBe("세 번째 항목");
    // 중첩 줄이 **독립 항목으로** 잡히지는 않는다.
    expect(
      snapshot.entries.some((entry) => entry.content.trim() === "중첩 불릿은 항목이 아니다"),
    ).toBe(false);
  });

  it("index는 1부터 시작하는 연속 번호다 — `/memory remove <n>`의 n과 같다", () => {
    const snapshot = snapshotOf(STRUCTURED);

    expect(snapshot.entries.map((entry) => entry.index)).toEqual([1, 2, 3]);
  });

  it("불릿이 하나도 없어도 로드는 성공하고 항목은 0이다", () => {
    const snapshot = snapshotOf("# 제목만 있는 파일\n\n문단 하나.\n");

    expect(snapshot.exists).toBe(true);
    expect(snapshot.entries).toEqual([]);
    expect(snapshot.chars).toBeGreaterThan(0);
  });

  it("예산은 파일 전체 문자 수다 — 불릿만 세지 않는다", () => {
    const snapshot = snapshotOf(STRUCTURED);
    const bulletChars = snapshot.entries.reduce((sum, entry) => sum + entry.content.length, 0);

    expect(snapshot.chars).toBeGreaterThan(bulletChars);
    expect(snapshot.chars).toBe(STRUCTURED.length);
  });

  it("본문이 비어 있는 `- ` 줄도 항목으로 센다 (판정 A-5)", () => {
    // §7.4 A-5: 규칙은 "최상위 `- ` 불릿 하나 = 항목 하나"이고 본문 유무 조건이 없다.
    // 조건을 더하면 파서가 내용을 해석하기 시작하고, `remove <n>`의 번호가 사용자가
    // 파일에서 세는 것과 어긋난다 — 사용자는 `- ` 줄을 본다.
    const text = "- \n- 진짜 항목\n";
    const snapshot = snapshotOf(text);

    expect(snapshot.text).toBe(text);
    expect(snapshot.entries).toHaveLength(2);
    expect(snapshot.entries[1]?.content).toBe("진짜 항목");
    expect(snapshot.entries[1]?.index).toBe(2);
  });

  it("CRLF 파일은 `\\r` 관대 처리로 인식하고 원본은 보존한다 (판정 A-6)", () => {
    // §7.4 A-6: 정규화하면 §7.3의 "로드 시 무수정"을 어기고, 무시하면 CRLF 사용자의
    // 항목이 프롬프트에서 통째로 사라진다(침묵 실패 — `ARCHITECTURE.md` §2.6).
    const text = "- 첫 항목\r\n- 둘째 항목\r\n";
    const snapshot = snapshotOf(text);

    expect(snapshot.text).toBe(text);
    expect(snapshot.entries).toHaveLength(2);
    // 관대 처리 = 본문에 `\r`가 남지 않는다. 남으면 중복 판정이 CRLF에서 깨진다.
    expect(snapshot.entries[0]?.content).toBe("첫 항목");
    expect(snapshot.entries[1]?.content).toBe("둘째 항목");
  });
});

describe("프롬프트 블록 렌더 (MEMORY §3.2)", () => {
  it("파일이 없으면 undefined — 블록을 붙이지 않는다", () => {
    const dir = newMemoryDir(newRoot());

    expect(renderMemoryBlock(loadMemory({ dir }))).toBeUndefined();
  });

  it("빈 파일이면 undefined — 빈 헤더는 모델에게 잡음이다", () => {
    expect(renderMemoryBlock(snapshotOf(""))).toBeUndefined();
  });

  it("공백만 있는 파일은 블록이 붙지 않는다 (판정 A-7)", () => {
    // §7.4 A-7: "내용이 있다"의 기준은 **trim 후 비어 있지 않은가**이다. A-8과 같은 기준.
    expect(renderMemoryBlock(snapshotOf("\n\n   \n"))).toBeUndefined();
    expect(renderMemoryBlock(snapshotOf("\t \n"))).toBeUndefined();
  });

  it("항목이 있으면 문자열이고 모든 항목 본문을 담는다", () => {
    const block = renderMemoryBlock(snapshotOf(STRUCTURED));

    expect(typeof block).toBe("string");
    expect(block).toContain("첫 번째 항목");
    expect(block).toContain("두 번째 항목");
    expect(block).toContain("세 번째 항목");
  });

  it("항목 순서는 파일 순서 그대로다 — 정렬하지 않는다", () => {
    const block = renderMemoryBlock(snapshotOf("- 나중\n- 먼저\n- 가운데\n"));

    expect(block).toBeDefined();
    const text = block ?? "";
    expect(text.indexOf("나중")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("나중")).toBeLessThan(text.indexOf("먼저"));
    expect(text.indexOf("먼저")).toBeLessThan(text.indexOf("가운데"));
  });

  it("중복 항목은 중복인 채로 렌더된다 — 중복 제거를 하지 않는다", () => {
    const block = renderMemoryBlock(snapshotOf("- 같은 항목\n- 같은 항목\n")) ?? "";
    const occurrences = block.split("같은 항목").length - 1;

    expect(occurrences).toBe(2);
  });

  it("불릿이 0개여도 텍스트가 있으면 블록이 붙는다 (판정 A-8)", () => {
    // §7.4 A-8: "내용"은 **파일 텍스트**다. §7.3이 *"불릿이 아닌 줄은 그대로 보존되고
    // 항목으로 세지 않는다"*고 못박으므로, 블록이 싣는 것은 메모리 파일의 내용이지
    // 항목 목록이 아니다 — 사용자가 제목·문단만 써 뒀는데 프롬프트에서 사라지면
    // 사용자 의도를 도구가 삼킨 것이다.
    const snapshot = snapshotOf("# 제목\n\n사용자 문단.\n");
    const block = renderMemoryBlock(snapshot);

    expect(snapshot.entries).toEqual([]);
    expect(block).toBeDefined();
    expect(block).toContain("# 제목");
    expect(block).toContain("사용자 문단.");
  });

  it("렌더는 스냅샷을 바꾸지 않는다 — 순수 함수다", () => {
    const snapshot = snapshotOf(STRUCTURED);
    const before = snapshot.text;
    const count = snapshot.entries.length;

    renderMemoryBlock(snapshot);
    renderMemoryBlock(snapshot);

    expect(snapshot.text).toBe(before);
    expect(snapshot.entries).toHaveLength(count);
  });
});
