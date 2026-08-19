/**
 * 저장 계층 — 원자적 append · 중복 · 예산 · 삭제 — 계약 독립 검증 (QA-A · T-002 선행 작성).
 *
 * 기대값의 출처는 `docs/MEMORY.md`뿐이다:
 *   - §4.3 쓰기는 원자적이다 (임시 파일 + rename). 부분 기록된 파일은 다음 기동을 실패시킨다
 *   - §4.3 중복은 성공으로 보고한다
 *   - §6 예산은 유계이고 초과 시 실패한다. **회전 없음** — 오래된 항목이 사라지지 않는다
 *   - §7.2 `/memory remove <n>`이 쓰는 삭제. 불릿 아닌 줄은 보존
 *   - §7.3 항목은 최상위 `- ` 불릿으로 파일 말미에 append
 *
 * **안전**: 메모리 디렉터리는 전부 임시 경로 주입이다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { chmodSync, existsSync, readdirSync, readFileSync, watch, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendMemoryEntry,
  loadMemory,
  MEMORY_ENTRY_MAX_CHARS,
  MEMORY_FILE_MAX_CHARS,
  removeMemoryEntry,
} from "../src/index.ts";
import {
  bulletBlockOfLength,
  CAN_ENFORCE_PERMISSIONS,
  cleanupRoots,
  MEMORY_FILE,
  memoryExists,
  memoryPath,
  newMemoryDir,
  newRoot,
  readMemory,
  writeMemory,
} from "./support.ts";

afterEach(() => {
  cleanupRoots();
});

/** 항목 상한을 넘지 않으면서 예산을 넘기기에 충분한 길이 */
function safeEntryLength(): number {
  return Math.max(20, Math.min(50, MEMORY_ENTRY_MAX_CHARS));
}

describe("상한 상수 (MEMORY §6 — 수치는 T-009 실측이 확정한다)", () => {
  it("두 상한은 양의 정수이고 항목 상한이 파일 상한보다 작다", () => {
    // 구체 수치를 하드코딩하지 않는다 — M-1이 열려 있고 실측이 값을 바꿀 수 있다.
    // 관계만이 계약이다: "한 항목이 예산의 10%를 넘으면 그건 메모리가 아니라 문서다".
    expect(Number.isInteger(MEMORY_FILE_MAX_CHARS)).toBe(true);
    expect(Number.isInteger(MEMORY_ENTRY_MAX_CHARS)).toBe(true);
    expect(MEMORY_ENTRY_MAX_CHARS).toBeGreaterThanOrEqual(20);
    expect(MEMORY_ENTRY_MAX_CHARS).toBeLessThan(MEMORY_FILE_MAX_CHARS);
  });
});

describe("append 기본 (MEMORY §7.3)", () => {
  it("파일이 없으면 만들고, 항목은 최상위 `- ` 불릿이 된다", () => {
    const dir = newMemoryDir(newRoot());

    const result = appendMemoryEntry(dir, "첫 항목");

    expect(result.status).toBe("stored");
    expect(memoryExists(dir)).toBe(true);
    expect(readMemory(dir)).toContain("- 첫 항목");
    const snapshot = loadMemory({ dir });
    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.entries[0]?.content).toContain("첫 항목");
  });

  it("디렉터리가 없으면 append 시점에 만든다 — 로드는 만들지 않는다", () => {
    const dir = join(newRoot(), "memory");

    appendMemoryEntry(dir, "첫 항목");

    expect(existsSync(dir)).toBe(true);
    expect(loadMemory({ dir }).entries).toHaveLength(1);
  });

  it("기존 내용은 보존되고 새 항목은 말미에 붙는다", () => {
    const dir = newMemoryDir(newRoot());
    const before = "# 제목\n\n설명 문단\n\n- 기존 항목\n";
    writeMemory(dir, before);

    appendMemoryEntry(dir, "새 항목");

    const after = readMemory(dir);
    expect(after.startsWith(before)).toBe(true);
    expect(after).toContain("새 항목");
    expect(after.indexOf("기존 항목")).toBeLessThan(after.indexOf("새 항목"));
    // 불릿 아닌 줄은 그대로다.
    expect(after).toContain("# 제목");
    expect(after).toContain("설명 문단");
  });

  it("반환된 chars는 반영 후 파일 전체 문자 수다", () => {
    const dir = newMemoryDir(newRoot());
    writeMemory(dir, "- 기존 항목\n");

    const result = appendMemoryEntry(dir, "새 항목");
    const text = readMemory(dir);

    expect([text.length, [...text].length]).toContain(result.chars);
    expect(result.chars).toBe(loadMemory({ dir }).chars);
  });

  it("연속 append가 순서대로 쌓인다", () => {
    const dir = newMemoryDir(newRoot());

    appendMemoryEntry(dir, "하나");
    appendMemoryEntry(dir, "둘");
    appendMemoryEntry(dir, "셋");

    const contents = loadMemory({ dir }).entries.map((entry) => entry.content);
    expect(contents).toHaveLength(3);
    expect(contents[0]).toContain("하나");
    expect(contents[1]).toContain("둘");
    expect(contents[2]).toContain("셋");
  });
});

describe("줄바꿈 접기 (MEMORY §7.4 EM-1 — 형식의 소유자가 자기 형식으로 정규화한다)", () => {
  it("여러 줄 content가 한 줄 불릿 하나가 된다", () => {
    // 그대로 쓰면 §7.3의 "항목 = 최상위 불릿 하나"가 깨지고, 둘째 줄부터는 파싱에서
    // 항목으로 안 잡혀 **중복 판정이 영영 성립하지 않는다** — 같은 메모가 호출마다
    // 다시 쌓여 예산을 태운다.
    const dir = newMemoryDir(newRoot());

    appendMemoryEntry(dir, "첫 줄\n둘째 줄");

    const snapshot = loadMemory({ dir });
    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.entries[0]?.content).toContain("첫 줄");
    expect(snapshot.entries[0]?.content).toContain("둘째 줄");
    expect(snapshot.entries[0]?.content).not.toContain("\n");
    // 파일에도 불릿 줄이 하나만 늘어난다.
    expect(
      readMemory(dir)
        .split("\n")
        .filter((line) => line.startsWith("- ")),
    ).toHaveLength(1);
  });

  it("접힌 뒤에는 중복 판정이 성립한다 — EM-1이 막으려던 실패다", () => {
    const dir = newMemoryDir(newRoot());
    appendMemoryEntry(dir, "첫 줄\n둘째 줄");
    const after = readMemory(dir);

    const result = appendMemoryEntry(dir, "첫 줄\n둘째 줄");

    expect(result.status).toBe("duplicate");
    expect(readMemory(dir)).toBe(after);
  });

  it("CRLF·연속 개행이 섞여도 항목은 하나다", () => {
    const dir = newMemoryDir(newRoot());

    appendMemoryEntry(dir, "가\r\n나\n\n다");

    const snapshot = loadMemory({ dir });
    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.entries[0]?.content).not.toMatch(/[\r\n]/);
  });
});

describe("중복 (MEMORY §4.3 — 성공으로 보고한다)", () => {
  it("같은 content 재저장은 duplicate이고 파일이 커지지 않는다", () => {
    const dir = newMemoryDir(newRoot());
    appendMemoryEntry(dir, "같은 내용");
    const after = readMemory(dir);

    const result = appendMemoryEntry(dir, "같은 내용");

    expect(result.status).toBe("duplicate");
    expect(readMemory(dir)).toBe(after);
    expect(loadMemory({ dir }).entries).toHaveLength(1);
  });

  it("중복은 던지지 않는다 — 결과 상태가 의도와 같으므로 실패가 아니다", () => {
    const dir = newMemoryDir(newRoot());
    appendMemoryEntry(dir, "같은 내용");

    expect(() => appendMemoryEntry(dir, "같은 내용")).not.toThrow();
  });

  it("앞뒤 공백만 다른 content도 중복이다 — 정규화 후 완전 일치", () => {
    const dir = newMemoryDir(newRoot());
    appendMemoryEntry(dir, "같은 내용");
    const after = readMemory(dir);

    const result = appendMemoryEntry(dir, "  같은 내용  ");

    expect(result.status).toBe("duplicate");
    expect(readMemory(dir)).toBe(after);
  });

  it("사용자가 에디터로 쓴 항목과도 중복 판정이 된다 — 출처를 구분하지 않는다", () => {
    const dir = newMemoryDir(newRoot());
    writeMemory(dir, "# 제목\n\n- 사용자가 쓴 항목\n");
    const after = readMemory(dir);

    const result = appendMemoryEntry(dir, "사용자가 쓴 항목");

    expect(result.status).toBe("duplicate");
    expect(readMemory(dir)).toBe(after);
  });

  it("대소문자만 다른 content는 별개다 — 정규화는 앞뒤 공백만 (판정 A-9)", () => {
    // §7.4 A-9: 넓히면 "저장했는데 안 보인다"가 생기고, 좁히면 같은 메모가 쌓인다.
    // 판정이 모호해지는 순간 전자가 생기므로 완전 일치 쪽에 붙인다.
    const dir = newMemoryDir(newRoot());
    appendMemoryEntry(dir, "Remember This");

    const result = appendMemoryEntry(dir, "remember this");

    expect(result.status).toBe("stored");
    expect(readMemory(dir)).toContain("Remember This");
    expect(loadMemory({ dir }).entries).toHaveLength(2);
  });

  it("내부 공백이 다르면 별개다 — 정규화가 내부로 번지지 않는다 (판정 A-9)", () => {
    const dir = newMemoryDir(newRoot());
    appendMemoryEntry(dir, "커피를 좋아한다");

    const result = appendMemoryEntry(dir, "커피를  좋아한다");

    expect(result.status).toBe("stored");
    expect(loadMemory({ dir }).entries).toHaveLength(2);
  });

  it("다른 content는 정상 저장된다 — 부분 일치로 중복 처리하지 않는다", () => {
    const dir = newMemoryDir(newRoot());
    appendMemoryEntry(dir, "사용자는 커피를 좋아한다");

    const result = appendMemoryEntry(dir, "사용자는 커피를 좋아한다 그리고 홍차도");

    expect(result.status).toBe("stored");
    expect(loadMemory({ dir }).entries).toHaveLength(2);
  });
});

describe("예산 (MEMORY §6 — 초과 시 실패, 회전 없음)", () => {
  it("파일 예산을 넘기는 append는 실패하고 파일이 변하지 않는다", () => {
    const dir = newMemoryDir(newRoot());
    const near = bulletBlockOfLength(MEMORY_FILE_MAX_CHARS - 10);
    writeMemory(dir, near);
    const before = readFileSync(memoryPath(dir));

    expect(() => appendMemoryEntry(dir, "y".repeat(safeEntryLength()))).toThrow();

    expect(readFileSync(memoryPath(dir)).equals(before)).toBe(true);
  });

  it("회전하지 않는다 — 오래된 항목이 밀려나지 않는다", () => {
    const dir = newMemoryDir(newRoot());
    writeMemory(dir, bulletBlockOfLength(MEMORY_FILE_MAX_CHARS - 10, "오래된 항목"));

    try {
      appendMemoryEntry(dir, "y".repeat(safeEntryLength()));
    } catch {
      // 실패가 계약이다. 여기서 보는 것은 실패 후의 파일 상태다.
    }

    const snapshot = loadMemory({ dir });
    expect(snapshot.text).toContain("오래된 항목");
    expect(snapshot.entries.some((entry) => entry.content.includes("오래된 항목"))).toBe(true);
  });

  it("여유가 있으면 저장된다 — 예산이 무조건 막는 것이 아니다", () => {
    const dir = newMemoryDir(newRoot());
    const room = safeEntryLength() + 40;
    writeMemory(dir, bulletBlockOfLength(MEMORY_FILE_MAX_CHARS - room));

    const result = appendMemoryEntry(dir, "z".repeat(safeEntryLength()));

    expect(result.status).toBe("stored");
    expect(result.chars).toBeLessThanOrEqual(MEMORY_FILE_MAX_CHARS);
  });

  it("정확히 상한에 닿는 append는 저장된다 — 경계는 `<=` (판정 A-10)", () => {
    // §7.4 A-10: "4,000자 상한"의 자연어 의미가 "4,000자까지 된다"이다. `<`면 실제
    // 상한이 3,999가 되어 **문서 수치와 동작이 1 어긋난다.**
    const dir = newMemoryDir(newRoot());
    const entryLength = safeEntryLength();
    const base = bulletBlockOfLength(MEMORY_FILE_MAX_CHARS - (entryLength + 3));
    writeMemory(dir, base);

    const result = appendMemoryEntry(dir, "w".repeat(entryLength));

    const text = readMemory(dir);
    expect(result.status).toBe("stored");
    expect(text.startsWith(base)).toBe(true);
    expect(text).toContain("w".repeat(entryLength));
    expect(text.length).toBe(MEMORY_FILE_MAX_CHARS);
    expect(result.chars).toBe(MEMORY_FILE_MAX_CHARS);
  });

  it("상한을 1자 넘기면 실패한다 — 경계 바로 바깥 (판정 A-10)", () => {
    const dir = newMemoryDir(newRoot());
    const entryLength = safeEntryLength();
    const base = bulletBlockOfLength(MEMORY_FILE_MAX_CHARS - (entryLength + 3) + 1);
    writeMemory(dir, base);

    expect(() => appendMemoryEntry(dir, "w".repeat(entryLength))).toThrow();
    expect(readMemory(dir)).toBe(base);
  });
});

describe("원자성 (MEMORY §4.3 — 임시 파일 + rename)", () => {
  it("성공한 append 뒤 대상 디렉터리에 임시 파일이 남지 않는다", () => {
    const dir = newMemoryDir(newRoot());

    appendMemoryEntry(dir, "첫 항목");
    appendMemoryEntry(dir, "둘째 항목");

    expect(readdirSync(dir)).toEqual([MEMORY_FILE]);
  });

  it("임시 파일은 대상 디렉터리 안에 만들어진다 — cross-device rename 방지", async () => {
    const dir = newMemoryDir(newRoot());
    writeMemory(dir, "- 기존 항목\n");
    const seen = new Set<string>();
    const watcher = watch(dir, (_event, filename) => {
      if (filename !== null) seen.add(String(filename));
    });

    try {
      appendMemoryEntry(dir, "새 항목");
      await new Promise((resolve) => setTimeout(resolve, 200));
    } finally {
      watcher.close();
    }

    // 감시 이벤트 전달은 플랫폼 의존이라, **하나도 못 잡았으면 판정하지 않는다.**
    // 잡혔다면 대상 파일 말고 다른 이름이 반드시 있어야 한다 — 없으면 원본을 직접
    // 열어 쓴 것이거나(원자성 없음) 임시 파일을 다른 파일시스템에 만든 것이다.
    if (seen.size > 0) {
      expect([...seen].filter((name) => name !== MEMORY_FILE).length).toBeGreaterThan(0);
    }
  });

  it.skipIf(!CAN_ENFORCE_PERMISSIONS)(
    "디렉터리에 새 파일을 만들 수 없으면 실패하고 원본이 그대로다",
    () => {
      // 원본을 직접 열어 append하는 구현이면 이 상황에서 **성공해 버린다**(파일 권한은
      // 그대로이므로). 즉 이 테스트가 "원본을 직접 쓰지 않는다"의 검사다.
      const dir = newMemoryDir(newRoot());
      const before = "- 기존 항목\n";
      writeMemory(dir, before);
      chmodSync(dir, 0o500);

      try {
        expect(() => appendMemoryEntry(dir, "새 항목")).toThrow();
        expect(readMemory(dir)).toBe(before);
      } finally {
        chmodSync(dir, 0o700);
      }
    },
  );

  it("이전 크래시가 남긴 임시 파일이 있어도 원본이 부분 기록되지 않는다", () => {
    const dir = newMemoryDir(newRoot());
    const before = "- 기존 항목\n";
    writeMemory(dir, before);
    // 크래시 시뮬레이션: rename 직전에 죽어 임시 파일만 남은 상태.
    writeFileSync(join(dir, `${MEMORY_FILE}.tmp-deadbeef`), "- 부분 기록된 쓰레기", "utf8");
    writeFileSync(join(dir, `.${MEMORY_FILE}.tmp`), "- 또 다른 잔해", "utf8");

    const result = appendMemoryEntry(dir, "새 항목");

    // 판정 A-11(§7.4): 잔해를 **정리하지 않는다.** 정리하려면 "무엇이 우리 임시
    // 파일인가"를 판정해야 하고 그것이 새 표면이며, 오판하면 **도구가 사용자 파일을
    // 지운다.** 원본이 온전하고 잔해가 메모리로 읽히지 않는 것으로 충분하다.
    expect(existsSync(join(dir, `${MEMORY_FILE}.tmp-deadbeef`))).toBe(true);
    expect(existsSync(join(dir, `.${MEMORY_FILE}.tmp`))).toBe(true);
    expect(result.status).toBe("stored");
    const text = readMemory(dir);
    expect(text.startsWith(before)).toBe(true);
    expect(text).toContain("새 항목");
    expect(text).not.toContain("부분 기록된 쓰레기");
    expect(text).not.toContain("또 다른 잔해");

    const snapshot = loadMemory({ dir });
    expect(snapshot.entries).toHaveLength(2);
    expect(snapshot.text).not.toContain("쓰레기");
  });
});

describe("삭제 (MEMORY §7.2 — `/memory remove <n>`)", () => {
  const withStructure = [
    "# 메모리",
    "",
    "사용자 설명 문단",
    "",
    "- 첫 번째",
    "- 두 번째",
    "* 별표는 항목이 아니다",
    "",
    "- 세 번째",
    "",
  ].join("\n");

  it("해당 불릿만 사라지고 불릿 아닌 줄은 전부 보존된다", () => {
    const dir = newMemoryDir(newRoot());
    writeMemory(dir, withStructure);

    removeMemoryEntry(dir, 2);

    const text = readMemory(dir);
    expect(text).toContain("# 메모리");
    expect(text).toContain("사용자 설명 문단");
    expect(text).toContain("* 별표는 항목이 아니다");
    expect(text).toContain("- 첫 번째");
    expect(text).toContain("- 세 번째");
    expect(text).not.toContain("- 두 번째");
  });

  it("번호는 1-기반이고 파일 순서를 따른다", () => {
    const dir = newMemoryDir(newRoot());
    writeMemory(dir, "- 하나\n- 둘\n- 셋\n");

    removeMemoryEntry(dir, 1);

    const contents = loadMemory({ dir }).entries.map((entry) => entry.content);
    expect(contents).toHaveLength(2);
    expect(contents[0]).toContain("둘");
    expect(contents[1]).toContain("셋");
  });

  it("삭제 후 남은 항목의 index가 1..n으로 다시 붙는다", () => {
    const dir = newMemoryDir(newRoot());
    writeMemory(dir, "- 하나\n- 둘\n- 셋\n");

    removeMemoryEntry(dir, 2);

    expect(loadMemory({ dir }).entries.map((entry) => entry.index)).toEqual([1, 2]);
  });

  it("범위 밖 번호는 던진다 — 0·n+1·음수", () => {
    const dir = newMemoryDir(newRoot());
    writeMemory(dir, "- 하나\n- 둘\n");
    const before = readMemory(dir);

    expect(() => removeMemoryEntry(dir, 0)).toThrow();
    expect(() => removeMemoryEntry(dir, 3)).toThrow();
    expect(() => removeMemoryEntry(dir, -1)).toThrow();
    expect(readMemory(dir)).toBe(before);
  });

  it("파일이 없으면 던진다 — 조용히 성공하지 않는다", () => {
    const dir = newMemoryDir(newRoot());

    expect(() => removeMemoryEntry(dir, 1)).toThrow();
    expect(memoryExists(dir)).toBe(false);
  });

  it("마지막 항목을 지워도 파일을 유지한다 — 사용자 텍스트가 남는다 (판정 A-12)", () => {
    // §7.4 A-12: §2.2의 *"빈 파일은 거짓 신호"*는 **우리가 파일을 미리 만드는 것**을
    // 금지한 문장이지, 사용자 편집의 결과로 비게 된 파일을 지우라는 요구가 아니다.
    const dir = newMemoryDir(newRoot());
    writeMemory(dir, "# 제목\n\n- 유일한 항목\n");

    removeMemoryEntry(dir, 1);

    const snapshot = loadMemory({ dir });
    expect(memoryExists(dir)).toBe(true);
    expect(snapshot.exists).toBe(true);
    expect(snapshot.entries).toEqual([]);
    expect(snapshot.text).toContain("# 제목");
  });

  it("항목 삭제 시 딸린 중첩 줄은 남긴다 (판정 A-13)", () => {
    // §7.4 A-13: §7.3 *"불릿이 아닌 줄은 그대로 보존된다."* 고아 줄은 수용한다 —
    // 지우는 쪽이 친절해 보이지만 실은 **도구가 사용자 파일을 다시 쓰는 경로**를
    // 만드는 것이고, 그것이 §7.3이 금지한 방향이다. 정리는 사용자다(§6).
    const dir = newMemoryDir(newRoot());
    writeMemory(dir, "- 첫째\n- 둘째\n  - 딸린 줄\n- 셋째\n");

    removeMemoryEntry(dir, 2);

    const snapshot = loadMemory({ dir });
    expect(snapshot.text).toContain("- 첫째");
    expect(snapshot.text).toContain("- 셋째");
    expect(snapshot.text).not.toContain("- 둘째");
    expect(snapshot.text).toContain("  - 딸린 줄");
    expect(snapshot.entries).toHaveLength(2);
  });

  it("삭제도 원자적이다 — 임시 파일이 남지 않는다", () => {
    const dir = newMemoryDir(newRoot());
    writeMemory(dir, "- 하나\n- 둘\n");

    removeMemoryEntry(dir, 1);

    expect(readdirSync(dir).filter((name) => name !== MEMORY_FILE)).toEqual([]);
  });
});
