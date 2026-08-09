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

    // `[미규정 A-4]` 중첩 불릿이 딸린 항목의 `content`가 그 이어지는 줄을 포함하는지는
    // 정본이 정하지 않았다("불릿 마커를 제외한 본문"이라고만 한다). 어느 판정이든
    // **각 항목이 자기 첫 줄의 본문을 담는다**는 결과는 같아야 한다.
    expect(snapshot.entries[0]?.content).toContain("첫 번째 항목");
    expect(snapshot.entries[0]?.content.startsWith("- ")).toBe(false);
    expect(snapshot.entries[1]?.content).toContain("두 번째 항목");
    expect(snapshot.entries[2]?.content).toContain("세 번째 항목");
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
    expect([STRUCTURED.length, [...STRUCTURED].length]).toContain(snapshot.chars);
  });

  it("본문이 비어 있는 불릿 줄이 있어도 로드가 던지지 않고 텍스트는 보존된다", () => {
    // `[미규정 A-5]` `- `만 있고 본문이 없는 줄이 항목인지 아닌지는 미규정이다.
    // 판정 중립: 세든 안 세든 **파일이 보존되고 로드가 실패하지 않는다**만 고정한다.
    const text = "- \n- 진짜 항목\n";
    const snapshot = snapshotOf(text);

    expect(snapshot.text).toBe(text);
    expect(snapshot.entries.length).toBeGreaterThanOrEqual(1);
    expect(snapshot.entries.some((entry) => entry.content.includes("진짜 항목"))).toBe(true);
  });

  it("CRLF 줄바꿈 파일도 항목을 인식하고 원본을 보존한다", () => {
    // `[미규정 A-6]` 줄바꿈 스타일은 정본이 정하지 않았다. 사용자가 에디터로 고치는
    // 파일이므로 CRLF가 들어올 수 있다. 판정 중립: 항목 인식은 되어야 하고(0이면
    // 사용자가 쓴 것이 프롬프트에서 사라진다), 원본 바이트는 보존되어야 한다.
    const text = "- 첫 항목\r\n- 둘째 항목\r\n";
    const snapshot = snapshotOf(text);

    expect(snapshot.text).toBe(text);
    expect(snapshot.entries).toHaveLength(2);
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

  it("공백만 있는 파일도 블록이 되지 않거나, 되더라도 빈 문자열이 아니다", () => {
    // `[미규정 A-7]` "내용이 있을 때만"의 경계가 공백뿐인 파일에서 어디인지는 미규정.
    // 판정 중립: `undefined`이거나, 값이면 공백만은 아니다(빈 블록 금지가 §3.2의 취지).
    const block = renderMemoryBlock(snapshotOf("\n\n   \n"));

    if (block !== undefined) {
      expect(block.trim().length).toBeGreaterThan(0);
    }
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

  it("불릿이 없는 파일의 블록 — 판정 중립이되 사용자 텍스트를 잃지 않는다", () => {
    // `[미규정 A-8]` "내용"이 **항목**인지 **파일 텍스트**인지 정본이 구분하지 않는다.
    // 제목·문단만 있는 파일에서 블록을 붙이는가? 어느 판정이든, **붙인다면 그 텍스트를
    // 담아야** 하고(잘라내면 프롬프트와 파일이 어긋난다) 안 붙이면 undefined다.
    const block = renderMemoryBlock(snapshotOf("# 제목\n\n사용자 문단.\n"));

    if (block !== undefined) {
      expect(block).toContain("사용자 문단.");
    }
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
