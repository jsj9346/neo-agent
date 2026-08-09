/**
 * 메모리 로드 계약 — 계약 독립 검증 (QA-A · T-002 선행 작성).
 *
 * 기대값의 출처는 `docs/MEMORY.md`뿐이다:
 *   - §2.2 표 4행 (없음 / 읽힘 / 못 읽음 / 권한 600 아님) + 심볼릭 링크 거부
 *   - §3.1 두 상태 (스냅샷은 로드 시점 동결, 디스크는 갱신)
 *   - §7.3 로드 시점에 파일을 고치지 않는다 (정렬·중복 제거·형식 교정 0)
 *
 * 이름과 파일 경계는 Architect의 모듈 배치 스케치가 고정했다. 동작은 정본이 정한다.
 *
 * **안전**: 메모리 디렉터리는 전부 임시 경로 주입이다. 실제 홈을 읽지도 쓰지도 않는다.
 */

import { chmodSync, existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendMemoryEntry, loadMemory, MEMORY_FILE_NAME } from "../src/index.ts";
import {
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

describe("파일 이름 상수 (MEMORY §2)", () => {
  it("메모리 정본 파일 이름은 MEMORY.md다", () => {
    expect(MEMORY_FILE_NAME).toBe(MEMORY_FILE);
  });
});

describe("파일·디렉터리가 없을 때 (MEMORY §2.2 1행)", () => {
  it("디렉터리가 없어도 빈 메모리로 정상 로드한다", () => {
    const dir = join(newRoot(), "memory");

    const snapshot = loadMemory({ dir });

    expect(snapshot.exists).toBe(false);
    expect(snapshot.entries).toEqual([]);
    expect(snapshot.text).toBe("");
    expect(snapshot.chars).toBe(0);
  });

  it("로드는 디렉터리도 파일도 만들지 않는다 — 빈 파일은 거짓 신호다", () => {
    const root = newRoot();
    const dir = join(root, "memory");

    loadMemory({ dir });

    expect(existsSync(dir)).toBe(false);
    expect(existsSync(join(dir, MEMORY_FILE))).toBe(false);
  });

  it("디렉터리는 있고 파일만 없을 때도 같다 — 파일을 만들지 않는다", () => {
    const dir = newMemoryDir(newRoot());

    const snapshot = loadMemory({ dir });

    expect(snapshot.exists).toBe(false);
    expect(snapshot.entries).toEqual([]);
    expect(memoryExists(dir)).toBe(false);
  });

  it("파일이 없어도 경고를 내지 않는다 — 정상 상태다", () => {
    const dir = newMemoryDir(newRoot());
    const warnings: string[] = [];

    loadMemory({ dir, onWarning: (message) => warnings.push(message) });

    expect(warnings).toEqual([]);
  });
});

describe("파일이 있고 읽힐 때 (MEMORY §2.2 2행)", () => {
  it("스냅샷은 파일 내용 그대로이고 chars는 파일 전체 문자 수다", () => {
    const dir = newMemoryDir(newRoot());
    const text = "# 메모리\n\n설명 문단\n\n- 첫 항목\n- 둘째 항목\n";
    writeMemory(dir, text);

    const snapshot = loadMemory({ dir });

    expect(snapshot.exists).toBe(true);
    expect(snapshot.text).toBe(text);
    // 예산은 파일 전체 문자 수로 센다(§7.3) — 불릿만 세면 실제 비용을 반영하지 않는다.
    // `[미규정 A-1]` 문자 수의 단위(UTF-16 코드 유닛 / 코드 포인트)는 정해지지 않았다.
    // 둘 중 어느 쪽이든 통과하되, 파일 전체를 센다는 것만 고정한다.
    expect([text.length, [...text].length]).toContain(snapshot.chars);
    expect(snapshot.chars).toBeGreaterThan(snapshot.entries.length);
  });

  it("빈 파일은 exists=true이고 항목 0이다 — 없는 것과 구별된다", () => {
    const dir = newMemoryDir(newRoot());
    writeMemory(dir, "");

    const snapshot = loadMemory({ dir });

    expect(snapshot.exists).toBe(true);
    expect(snapshot.entries).toEqual([]);
    expect(snapshot.chars).toBe(0);
  });
});

describe("파일이 있는데 못 읽을 때 (MEMORY §2.2 3행 — 읽기 실패 ≠ 빈 메모리)", () => {
  it.skipIf(!CAN_ENFORCE_PERMISSIONS)("로드가 던진다 — 빈 것으로 읽지 않는다", () => {
    const dir = newMemoryDir(newRoot());
    writeMemory(dir, "- 잃으면 안 되는 항목\n");
    chmodSync(memoryPath(dir), 0o000);

    // 빈 메모리로 읽고 첫 쓰기에서 전체를 덮으면 메모리가 조용히 소실된다.
    expect(() => loadMemory({ dir })).toThrow();
  });

  it.skipIf(!CAN_ENFORCE_PERMISSIONS)("던진 뒤에도 파일 내용은 그대로다", () => {
    const dir = newMemoryDir(newRoot());
    const text = "- 잃으면 안 되는 항목\n";
    writeMemory(dir, text);
    chmodSync(memoryPath(dir), 0o000);

    expect(() => loadMemory({ dir })).toThrow();

    chmodSync(memoryPath(dir), 0o600);
    expect(readMemory(dir)).toBe(text);
  });

  it.skipIf(!CAN_ENFORCE_PERMISSIONS)("에러는 사람이 읽을 수 있는 사유를 담는다", () => {
    const dir = newMemoryDir(newRoot());
    writeMemory(dir, "- 항목\n");
    chmodSync(memoryPath(dir), 0o000);

    let caught: unknown;
    try {
      loadMemory({ dir });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message.trim().length).toBeGreaterThan(0);
  });

  it.skipIf(!CAN_ENFORCE_PERMISSIONS)("읽기 실패는 경고로 강등되지 않는다", () => {
    const dir = newMemoryDir(newRoot());
    writeMemory(dir, "- 항목\n");
    chmodSync(memoryPath(dir), 0o000);
    const warnings: string[] = [];

    expect(() => loadMemory({ dir, onWarning: (m) => warnings.push(m) })).toThrow();
  });
});

describe("권한이 600이 아닐 때 (MEMORY §2.2 4행 — 경고만, 진행)", () => {
  it("644면 경고가 나오고 로드는 성공한다 — 크리덴셜 fail-closed와 다르다", () => {
    const dir = newMemoryDir(newRoot());
    const text = "- 항목 하나\n";
    writeMemory(dir, text, 0o644);
    const warnings: string[] = [];

    const snapshot = loadMemory({ dir, onWarning: (message) => warnings.push(message) });

    // 경고 문구는 재량이고, **경고가 나온다는 사실이 계약**이다.
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings.every((w) => w.trim().length > 0)).toBe(true);
    expect(snapshot.exists).toBe(true);
    expect(snapshot.text).toBe(text);
    expect(snapshot.entries).toHaveLength(1);
  });

  it("경고 콜백이 없어도 던지지 않는다 — 경고를 버릴 뿐이다", () => {
    const dir = newMemoryDir(newRoot());
    writeMemory(dir, "- 항목\n", 0o666);

    expect(() => loadMemory({ dir })).not.toThrow();
    expect(loadMemory({ dir }).entries).toHaveLength(1);
  });

  it("600이면 경고가 없다", () => {
    const dir = newMemoryDir(newRoot());
    writeMemory(dir, "- 항목\n", 0o600);
    const warnings: string[] = [];

    loadMemory({ dir, onWarning: (message) => warnings.push(message) });

    expect(warnings).toEqual([]);
  });

  it("400(더 좁은 권한)에서도 로드는 성공한다 — 경고 여부는 판정 중립", () => {
    // `[미규정 A-2]` 정본은 "권한이 600이 아님"이라고만 쓴다. 600보다 **좁은** 권한이
    // 경고 대상인지는 정해지지 않았다. 어느 판정이든 **로드가 실패하면 안 된다**는
    // 결과만 고정한다(메모리는 시크릿이 아니고 마찰을 물리지 않는다).
    const dir = newMemoryDir(newRoot());
    const text = "- 항목\n";
    writeMemory(dir, text, 0o400);
    const warnings: string[] = [];

    const snapshot = loadMemory({ dir, onWarning: (message) => warnings.push(message) });

    expect(snapshot.text).toBe(text);
    expect(snapshot.entries).toHaveLength(1);
  });
});

describe("심볼릭 링크 (MEMORY §2.2 — denylist 격리가 깨진다)", () => {
  it("메모리 디렉터리가 심볼릭 링크면 거부한다", () => {
    const root = newRoot();
    const real = newMemoryDir(root, "real-memory");
    writeMemory(real, "- 링크 너머의 항목\n");
    const link = join(root, "memory");
    symlinkSync(real, link, "dir");

    // 링크로 밖을 가리키면 "denylist 안에 있으면서 실체는 밖"이 되어 §2.1의 격리가
    // 깨진다. 빈 메모리로 조용히 진행하는 것도 거부가 아니다.
    expect(() => loadMemory({ dir: link })).toThrow();
  });

  it("실제 디렉터리(링크 아님)는 거부되지 않는다 — 과차단 방지", () => {
    const dir = newMemoryDir(newRoot());
    writeMemory(dir, "- 항목\n");

    expect(() => loadMemory({ dir })).not.toThrow();
  });

  it("MEMORY.md 파일 자체가 심볼릭 링크일 때 — 거부하거나, 빈 것으로 읽지 않는다", () => {
    // `[미규정 A-3]` 정본은 **디렉터리**가 심볼릭 링크인 경우만 규정한다. 파일이
    // 링크인 경우는 미규정이다. 같은 근거(실체가 격리 밖)가 적용될 수도, 파일은
    // denylist 경로 판정과 무관하다고 볼 수도 있다.
    // 판정 중립: 어느 쪽으로 가든 **"조용히 빈 메모리"만은 금지**다(§2.2 3행의 정신).
    const root = newRoot();
    const dir = newMemoryDir(root);
    const outside = join(root, "outside.md");
    writeFileSync(outside, "- 링크 너머의 항목\n", "utf8");
    symlinkSync(outside, memoryPath(dir), "file");

    let snapshot: ReturnType<typeof loadMemory> | undefined;
    try {
      snapshot = loadMemory({ dir });
    } catch {
      snapshot = undefined;
    }

    if (snapshot !== undefined) {
      expect(snapshot.text).toContain("링크 너머의 항목");
      expect(snapshot.entries).toHaveLength(1);
    }
  });
});

describe("로드는 파일을 고치지 않는다 (MEMORY §7.3)", () => {
  const messy = [
    "## 제목이 먼저 온다",
    "",
    "- 나중 항목",
    "- 먼저 항목",
    "- 나중 항목",
    "",
    "설명 문단이 사이에 있다",
    "-   공백이 여러 개인 항목",
    "",
  ].join("\n");

  it("로드 전후 파일 바이트가 동일하다 — 정렬·중복 제거·형식 교정 0", () => {
    const dir = newMemoryDir(newRoot());
    writeMemory(dir, messy);
    const before = readFileSync(memoryPath(dir));

    loadMemory({ dir });
    loadMemory({ dir });

    expect(readFileSync(memoryPath(dir)).equals(before)).toBe(true);
  });

  it("중복 항목이 로드에서 제거되지 않는다 — 중복 검사는 쓰기 시점만이다", () => {
    const dir = newMemoryDir(newRoot());
    writeMemory(dir, messy);

    const snapshot = loadMemory({ dir });
    const duplicated = snapshot.entries.filter((entry) => entry.content.includes("나중 항목"));

    expect(duplicated.length).toBe(2);
  });

  it("항목 순서가 파일 순서 그대로다 — 정렬하지 않는다", () => {
    const dir = newMemoryDir(newRoot());
    writeMemory(dir, messy);

    const contents = loadMemory({ dir }).entries.map((entry) => entry.content);

    expect(contents[0]).toContain("나중 항목");
    expect(contents[1]).toContain("먼저 항목");
    expect(contents[2]).toContain("나중 항목");
  });

  it("스냅샷의 text가 원본 문자열과 같다 — 재작성 경로가 없다", () => {
    const dir = newMemoryDir(newRoot());
    writeMemory(dir, messy);

    expect(loadMemory({ dir }).text).toBe(messy);
  });
});

describe("두 상태 — 스냅샷은 동결, 디스크는 갱신 (MEMORY §3.1)", () => {
  it("append 후에도 스냅샷 값은 불변이고 새 로드는 갱신을 본다", () => {
    const dir = newMemoryDir(newRoot());
    writeMemory(dir, "- 기존 항목\n");

    const snapshot = loadMemory({ dir });
    const frozenText = snapshot.text;
    const frozenCount = snapshot.entries.length;
    const frozenChars = snapshot.chars;

    appendMemoryEntry(dir, "세션 중에 저장한 항목");

    // 스냅샷: 세션 중 절대 불변 — 시스템 프롬프트가 이것을 소비한다.
    expect(snapshot.text).toBe(frozenText);
    expect(snapshot.entries).toHaveLength(frozenCount);
    expect(snapshot.chars).toBe(frozenChars);
    expect(snapshot.text).not.toContain("세션 중에 저장한 항목");

    // 디스크: 즉시 반영 — 도구 응답과 다음 세션의 스냅샷이 이것을 소비한다.
    const reloaded = loadMemory({ dir });
    expect(reloaded.entries).toHaveLength(frozenCount + 1);
    expect(reloaded.text).toContain("세션 중에 저장한 항목");
    expect(readMemory(dir)).toContain("세션 중에 저장한 항목");
  });

  it("파일이 없던 상태의 스냅샷도 첫 저장 후 불변이다", () => {
    const dir = newMemoryDir(newRoot());

    const snapshot = loadMemory({ dir });
    expect(snapshot.exists).toBe(false);

    appendMemoryEntry(dir, "첫 항목");

    expect(snapshot.exists).toBe(false);
    expect(snapshot.entries).toEqual([]);
    expect(snapshot.text).toBe("");
    expect(loadMemory({ dir }).entries).toHaveLength(1);
  });
});
