/**
 * `remember` 도구 계약 — 계약 독립 검증 (QA-A · T-002 선행 작성).
 *
 * 기대값의 출처는 `docs/MEMORY.md`뿐이다:
 *   - §4.1 인자는 `content` 하나. 경로 인자가 없어 traversal 표면이 없다. 1종·1액션
 *   - §4.2 설명문에 반드시 있어야 하는 세 사실
 *   - §4.3 결과 계약 5행 + `source`는 항상 `"local"` + 쓰기는 원자적
 *   - §5 오염된 런에서는 저장하지 않고 오염을 사유로 실패한다
 *   - §6 예산 초과 결과에 사용량·상한·`/memory`·재시도 금지
 * 보조로 `docs/CORE-INTERFACE.md` §6(`z.strictObject` 필수, 실패는 throw, 결과는 프롬프트),
 * `docs/APPROVAL-GATE.md` §3(`memoryWrite` 프로필에 인자 필드가 없다).
 *
 * **안전**: `MemoryToolDeps.dir`은 언제나 임시 경로다. 실제 홈에 닿는 경로가 없다.
 */

import { chmodSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createRememberTool,
  loadMemory,
  MEMORY_ENTRY_MAX_CHARS,
  MEMORY_FILE_MAX_CHARS,
  MEMORY_TOOL_GATE_PROFILES,
} from "../src/index.ts";
import {
  bulletBlockOfLength,
  CAN_ENFORCE_PERMISSIONS,
  cleanupRoots,
  memoryPath,
  newMemoryDir,
  newRoot,
  readMemory,
  runExpectingFailure,
  textOf,
  toolContext,
  writeMemory,
} from "./support.ts";

afterEach(() => {
  cleanupRoots();
});

function toolFor(dir: string, tainted: () => boolean = () => false) {
  return createRememberTool({ dir, isRunTainted: tainted });
}

async function execute(tool: ReturnType<typeof toolFor>, content: string) {
  return (await tool.execute({ content }, toolContext())) as {
    content: readonly { type: string }[];
    source: string;
  };
}

/**
 * §4.2의 "세 사실" 검사. **문구가 아니라 사실을 본다** — 문구는 조정 가능 범위(정본 머리말)
 * 이므로 특정 문장을 하드코딩하면 구현의 재량이 사라진다. 각 사실을 여러 표현으로 덮는
 * 느슨한 대안 집합으로 검사한다. 언어는 판정 A-14로 **영어**가 확정됐지만(§7.4),
 * 대안 집합에서 한국어를 빼지 않는다 — 사실 검사와 언어 검사는 별개의 계약이고,
 * 언어는 전용 테스트가 따로 고정한다. 여기서 겸하면 실패 원인이 뭉뚱그려진다.
 */
const FACT_PATTERNS: Record<string, readonly RegExp[]> = {
  "사실 1 — 저장된 내용은 다음 세션부터 프롬프트에 나타난다": [
    /(next|future|later|following|upcoming|subsequent)\s+\w*\s*(session|conversation|chat|run)|다음\s*(세션|대화)|이후\s*(세션|대화)/i,
  ],
  "사실 2 — 수정·삭제는 사용자가 한다": [
    /\buser\b|사용자/i,
    /\b(edit|edits|editing|delete|deletes|deleting|remove|removes|removing|change|changes|curate|curates|clean|cleans|prune)\b|수정|삭제|정리/i,
  ],
  "사실 3 — 예산이 유계이고 가득 차면 저장이 실패한다": [
    /\b(limit|limited|budget|cap|capped|quota|bounded|full|size)\b|상한|예산|한도|가득/i,
    /\b(fail|fails|failed|failure|refuse|refused|refuses|reject|rejected|rejects|cannot|can't|won't|declin\w*)\b|실패|저장되지/i,
  ],
};

describe("등록 표면 (CORE-INTERFACE §6 · MEMORY §4.4)", () => {
  it("이름은 `remember`이고 라벨·설명이 비어 있지 않다", () => {
    const tool = toolFor(newMemoryDir(newRoot()));

    expect(tool.name).toBe("remember");
    expect(tool.label.trim().length).toBeGreaterThan(0);
    expect(tool.description.trim().length).toBeGreaterThan(0);
  });
});

describe("설명문의 세 사실 (MEMORY §4.2 — 빠지면 모델이 예측 가능하게 오작동한다)", () => {
  for (const [fact, patterns] of Object.entries(FACT_PATTERNS)) {
    it(`${fact}`, () => {
      const description = toolFor(newMemoryDir(newRoot())).description;

      for (const pattern of patterns) {
        expect(pattern.test(description), `${fact} — 설명문에서 찾지 못했다:\n${description}`).toBe(
          true,
        );
      }
    });
  }

  it("설명문은 영어다 — 텍스트의 수신자가 언어를 정한다 (판정 A-14)", () => {
    // §7.4 A-14: `APPROVAL-GATE.md` §4의 확정 판정 그대로 — 설명문을 읽는 것은
    // 모델이다. CLI 표시(`/memory`·시작 표시)는 사용자 언어이고 이것과 다른 자리다.
    const description = toolFor(newMemoryDir(newRoot())).description;

    expect(/[가-힣]/.test(description)).toBe(false);
    expect(/[a-z]/i.test(description)).toBe(true);
  });

  it("항목이 한 줄임을 선제적으로 알린다 (판정 EM-1)", () => {
    // EM-1: 변형이 조용하면 §2.6 위반이다. 결과로 알리는 것에 더해 **설명문이
    // 선제적으로** 알려야 모델이 여러 줄을 넣고 놀라지 않는다.
    const description = toolFor(newMemoryDir(newRoot())).description;

    expect(
      /(single line|one line|single-line|newline|line break|linebreak)/i.test(description),
    ).toBe(true);
  });

  it("존재하지 않는 액션을 광고하지 않는다 — 1종·1액션(§4.1)", () => {
    const description = toolFor(newMemoryDir(newRoot())).description;

    // `forget`·`replace`는 존재하지 않는다. 설명문이 이것들을 부르라고 하면 모델이
    // 없는 도구를 호출한다(§4.2 사실 2가 막으려는 것과 같은 실패).
    expect(/\bcall\s+forget\b|\bforget\s+tool\b|\breplace\s+tool\b/i.test(description)).toBe(false);
  });
});

describe("인자 스키마 (MEMORY §4.1 · CORE-INTERFACE §6)", () => {
  it("content 하나만 받는다", () => {
    const schema = toolFor(newMemoryDir(newRoot())).paramsSchema;

    expect(schema.safeParse({ content: "무언가" }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ content: "" }).success).toBe(false);
    expect(schema.safeParse({ content: 42 }).success).toBe(false);
  });

  it("닫힌 객체다 — 모르는 필드는 거부한다", () => {
    const schema = toolFor(newMemoryDir(newRoot())).paramsSchema;

    expect(schema.safeParse({ content: "x", extra: 1 }).success).toBe(false);
  });

  it("경로·타깃·액션 인자가 없다 — traversal 표면 자체가 없다", () => {
    const schema = toolFor(newMemoryDir(newRoot())).paramsSchema;

    // 경로 인자가 있으면 `resolve()` 봉쇄 판정이 필요해진다. 없다는 것이 계약이다.
    expect(schema.safeParse({ content: "x", path: "../../etc/passwd" }).success).toBe(false);
    expect(schema.safeParse({ content: "x", target: "USER.md" }).success).toBe(false);
    expect(schema.safeParse({ content: "x", action: "replace" }).success).toBe(false);
  });

  it("항목 상한을 스키마가 강제한다", () => {
    const schema = toolFor(newMemoryDir(newRoot())).paramsSchema;

    expect(schema.safeParse({ content: "a".repeat(MEMORY_ENTRY_MAX_CHARS) }).success).toBe(true);
    expect(schema.safeParse({ content: "a".repeat(MEMORY_ENTRY_MAX_CHARS + 1) }).success).toBe(
      false,
    );
  });
});

describe("저장 성공 (MEMORY §4.3 1행)", () => {
  it("파일에 기록되고 source는 local이다", async () => {
    const dir = newMemoryDir(newRoot());
    const result = await execute(toolFor(dir), "사용자는 TypeScript를 쓴다");

    // 메모리는 디스크에서 온다 — 오염 전파의 방향은 반대다.
    expect(result.source).toBe("local");
    expect(readMemory(dir)).toContain("사용자는 TypeScript를 쓴다");
  });

  it("결과 텍스트에 남은 예산과 '다음 세션부터 반영'이 있다", async () => {
    const dir = newMemoryDir(newRoot());
    const text = textOf(await execute(toolFor(dir), "무언가 기억할 것"));

    expect(text.trim().length).toBeGreaterThan(0);
    // `[미규정 A-15]` 사용량 표기 형식(콤마·`n/N`·백분율)은 미규정이다. 숫자와 예산을
    // 시사하는 어휘가 있다는 것만 본다.
    expect(/\d/.test(text)).toBe(true);
    expect(/(remain|left|budget|limit|used|of\s+\d|\/\s*\d|남은|예산|사용|상한)/i.test(text)).toBe(
      true,
    );
    for (const pattern of FACT_PATTERNS[
      "사실 1 — 저장된 내용은 다음 세션부터 프롬프트에 나타난다"
    ] ?? []) {
      expect(pattern.test(text), `결과 텍스트에 지연 반영 안내가 없다:\n${text}`).toBe(true);
    }
  });

  it("여러 줄 content는 접히고 그 사실이 결과에 나타난다 (판정 EM-1)", async () => {
    // §7.4 EM-1: 형식의 소유자가 자기 형식으로 정규화하는 것은 사용자 파일을 다시
    // 쓰는 것과 다른 자리이되, **조용하면 안 된다**(`ARCHITECTURE.md` §2.6).
    const dir = newMemoryDir(newRoot());
    const result = await execute(toolFor(dir), "첫 줄\n둘째 줄");
    const text = textOf(result);

    expect(loadMemory({ dir }).entries).toHaveLength(1);
    // 문구는 재량이므로 **변형을 언급한다**는 사실만 느슨하게 본다.
    expect(
      /(single line|one line|single-line|newline|line break|linebreak|fold|join)/i.test(text),
    ).toBe(true);
  });

  it("한 줄 content에는 접었다는 안내가 붙지 않는다 — 대조군", async () => {
    // 변형이 없었는데 변형을 알리면 그것도 부정확한 표시다.
    const dir = newMemoryDir(newRoot());
    const text = textOf(await execute(toolFor(dir), "한 줄짜리 메모"));

    expect(/(single line|one line|single-line|newline|line break|linebreak|fold)/i.test(text)).toBe(
      false,
    );
  });

  it("파일이 없던 상태에서도 성공한다 — 첫 remember가 파일을 만든다", async () => {
    const dir = join(newRoot(), "memory");

    await execute(toolFor(dir), "첫 항목");

    expect(existsSync(memoryPath(dir))).toBe(true);
  });
});

describe("중복 (MEMORY §4.3 4행 — 성공으로 보고한다)", () => {
  it("두 번째 저장은 실패가 아니고 파일이 커지지 않는다", async () => {
    const dir = newMemoryDir(newRoot());
    const tool = toolFor(dir);
    await execute(tool, "같은 내용");
    const after = readMemory(dir);

    const result = await execute(tool, "같은 내용");

    expect(result.source).toBe("local");
    expect(readMemory(dir)).toBe(after);
    // `[미규정 A-16]` "이미 있음"의 문구는 미규정이다. 모델이 재저장을 반복하지 않도록
    // 상태를 알린다는 사실만 느슨하게 본다.
    expect(/(already|exist|duplicate|same|stored|이미|중복|있)/i.test(textOf(result))).toBe(true);
  });
});

describe("예산 초과 (MEMORY §4.3 2행 · §6)", () => {
  /** 예산이 거의 찬 파일을 만들고, 넘치는 저장을 시도해 결과 텍스트를 돌려준다 */
  async function overflow(): Promise<{ dir: string; message: string; before: Buffer }> {
    const dir = newMemoryDir(newRoot());
    writeMemory(dir, bulletBlockOfLength(MEMORY_FILE_MAX_CHARS - 10, "오래된 항목"));
    const before = readFileSync(memoryPath(dir));
    const entryLength = Math.max(20, Math.min(50, MEMORY_ENTRY_MAX_CHARS));
    const message = await runExpectingFailure(toolFor(dir), {
      content: "y".repeat(entryLength),
    });
    return { dir, message, before };
  }

  it("실패하고 파일이 변하지 않는다 — 회전 없음", async () => {
    const { dir, message, before } = await overflow();

    expect(message.trim().length).toBeGreaterThan(0);
    expect(readFileSync(memoryPath(dir)).equals(before)).toBe(true);
    expect(readMemory(dir)).toContain("오래된 항목");
  });

  it("결과 텍스트에 사용량·상한 숫자와 `/memory` 안내가 있다", async () => {
    const { message } = await overflow();

    expect(/\d/.test(message)).toBe(true);
    // `/memory`는 사용자가 정리하는 유일한 경로다(§7.2) — 이름이 결과에 있어야 한다.
    expect(message).toContain("/memory");
  });

  it("결과 텍스트가 재시도를 막는다 — 실패는 정상 상태다", async () => {
    const { message } = await overflow();

    // `[미규정 A-17]` "재시도하지 말라"의 문구는 미규정이다. 재시도·반복을 다루는
    // 표현이 있다는 것만 느슨하게 본다(없으면 hermes #42405의 루프가 재현된다).
    expect(/(retry|again|repeat|재시도|반복|다시)/i.test(message)).toBe(true);
  });
});

describe("오염된 런 (MEMORY §5 — 저장하지 않고 오염을 사유로 실패)", () => {
  it("저장하지 않는다 — 파일이 만들어지지도 않는다", async () => {
    const dir = newMemoryDir(newRoot());

    const message = await runExpectingFailure(
      toolFor(dir, () => true),
      {
        content: "웹 페이지가 기억하라고 지시한 내용",
      },
    );

    // 핵심 단정: 디스크가 바뀌지 않는다.
    expect(existsSync(memoryPath(dir))).toBe(false);
    expect(message.trim().length).toBeGreaterThan(0);
  });

  it("기존 파일도 바뀌지 않는다", async () => {
    const dir = newMemoryDir(newRoot());
    writeMemory(dir, "- 기존 항목\n");
    const before = readFileSync(memoryPath(dir));

    await runExpectingFailure(
      toolFor(dir, () => true),
      { content: "새로 기억할 것" },
    );

    expect(readFileSync(memoryPath(dir)).equals(before)).toBe(true);
  });

  it("결과가 오염 사실과 사용자에게 제안하라는 것을 담는다", async () => {
    const dir = newMemoryDir(newRoot());

    const message = await runExpectingFailure(
      toolFor(dir, () => true),
      { content: "무언가" },
    );

    // `[미규정 A-18]` 오염 사유의 문구는 미규정이다(정본은 "오염 사실 + 사용자에게 직접
    // 제안하라"만 요구). 두 사실 각각을 느슨한 대안으로 본다.
    expect(/(taint|tainted|external|untrusted|web|network|오염|외부)/i.test(message)).toBe(true);
    expect(/(user|ask|suggest|tell|사용자|제안|말)/i.test(message)).toBe(true);
  });

  it("오염 여부는 호출마다 평가된다 — 생성 시점에 굳지 않는다", async () => {
    const dir = newMemoryDir(newRoot());
    let tainted = false;
    const tool = toolFor(dir, () => tainted);

    await execute(tool, "오염 전에 저장한 것");
    expect(readMemory(dir)).toContain("오염 전에 저장한 것");
    const after = readMemory(dir);

    tainted = true;
    await runExpectingFailure(tool, { content: "오염 후에 저장하려던 것" });

    expect(readMemory(dir)).toBe(after);
  });

  it("중복이어도 오염 런에서는 실패한다 — 오염 검사가 앞선다", async () => {
    const dir = newMemoryDir(newRoot());
    writeMemory(dir, "- 이미 있는 항목\n");
    const before = readFileSync(memoryPath(dir));

    const message = await runExpectingFailure(
      toolFor(dir, () => true),
      {
        content: "이미 있는 항목",
      },
    );

    expect(/(taint|tainted|external|untrusted|오염|외부)/i.test(message)).toBe(true);
    expect(readFileSync(memoryPath(dir)).equals(before)).toBe(true);
  });

  it.skipIf(!CAN_ENFORCE_PERMISSIONS)(
    "쓸 수 없는 디렉터리에서도 같은 오염 사유로 실패한다 — 디스크에 닿기 전 첫 분기",
    async () => {
      const root = newRoot();
      const tainted = newMemoryDir(root, "tainted");
      const readOnly = newMemoryDir(root, "read-only");
      chmodSync(readOnly, 0o500);

      try {
        const normalMessage = await runExpectingFailure(
          toolFor(tainted, () => true),
          {
            content: "무언가",
          },
        );
        const readOnlyMessage = await runExpectingFailure(
          toolFor(readOnly, () => true),
          {
            content: "무언가",
          },
        );
        const notTaintedMessage = await runExpectingFailure(
          toolFor(readOnly, () => false),
          {
            content: "무언가",
          },
        );

        const taintPattern = /(taint|tainted|external|untrusted|오염|외부)/i;
        // 오염이면 권한과 무관하게 같은 사유다.
        expect(taintPattern.test(normalMessage)).toBe(true);
        expect(taintPattern.test(readOnlyMessage)).toBe(true);
        // 권한 실패가 오염 사유를 밀어내지 않는다 = 디스크를 만지기 전에 갈라졌다.
        expect(/(EACCES|permission|denied|권한)/i.test(readOnlyMessage)).toBe(false);
        // 대조군: 오염이 아니면 사유가 다르다(같으면 위 단정이 무의미해진다).
        expect(taintPattern.test(notTaintedMessage)).toBe(false);
      } finally {
        chmodSync(readOnly, 0o700);
      }
    },
  );
});

describe("게이트 프로필 (MEMORY §4.4 · APPROVAL-GATE §3)", () => {
  it("`remember`가 memoryWrite로 등록돼 있다 — 미등록이면 매번 승인 프롬프트다", () => {
    expect(Object.keys(MEMORY_TOOL_GATE_PROFILES)).toEqual(["remember"]);
    expect(MEMORY_TOOL_GATE_PROFILES.remember?.kind).toBe("memoryWrite");
  });

  it("프로필 키가 도구 이름과 같다 — 배선이 어긋나면 fail-closed로 떨어진다", () => {
    const tool = toolFor(newMemoryDir(newRoot()));

    expect(Object.keys(MEMORY_TOOL_GATE_PROFILES)).toContain(tool.name);
  });

  /**
   * 2026-08-09 재도출 (판정 B-1 — `APPROVAL-GATE.md` §3 개정).
   * 초판의 *"프로필과 subject 양쪽에 인자 필드가 없다"*는 **명시적으로 철회**됐다.
   * 판정 표면(subject)과 표시 표면이 파이프라인에서 분리돼 있고, 프로필의
   * `contentParam`은 **표시 전용**이다 — 없으면 게이트가 `"content"`라는 인자 이름을
   * 스스로 알아야 하고 그것이 "게이트는 도구 구현을 모른다"(§3 머리)를 깬다.
   * **subject 쪽 "인자 필드 없음"은 `packages/gate`가 소유하며 QA-B가 검증한다**
   * (이 패키지는 `packages/gate`를 임포트하지 않으므로 subject를 만들 수 없다).
   */
  it("프로필은 kind와 표시용 contentParam 두 개다 (APPROVAL-GATE §3 판정 B-1)", () => {
    const profile = MEMORY_TOOL_GATE_PROFILES.remember;

    expect(profile).toBeDefined();
    expect(Object.keys(profile ?? {}).sort()).toEqual(["contentParam", "kind"]);
  });

  it("판정 축을 발명하지 않는다 — 경로·URL·cwd 필드가 없다", () => {
    // "게이트가 읽을 수 있는 판정 축이 그 도구에 존재하지 않을 때 축을 발명하지
    // 않는다"(§3). `remember`에는 경로 인자가 아예 없으므로 `pathParam`·`urlParam`에
    // 대응하는 것이 없다. `scope` 판정도 없다 — 있으면 계층 0에서 항상 block된다.
    const profile = MEMORY_TOOL_GATE_PROFILES.remember as Record<string, unknown>;

    for (const field of ["pathParam", "urlParam", "cwdParam", "commandParam", "scope"]) {
      expect(profile[field], `${field}가 프로필에 있다`).toBeUndefined();
    }
  });

  it("contentParam이 실재하는 인자 이름을 가리킨다 — 아니면 표시가 비어 버린다", () => {
    // `display`는 **저장될 내용을 보여야** 한다(§3·§4). 프로필이 없는 인자 이름을
    // 가리키면 게이트는 `content`를 읽지 못하고, 판정 B-2에 따라 **경고 + 플래그**로
    // 떨어져 자동 허용이 무효가 된다 — 매 저장이 프롬프트가 되는 회귀다.
    const tool = toolFor(newMemoryDir(newRoot()));
    const contentParam = MEMORY_TOOL_GATE_PROFILES.remember?.contentParam;

    expect(typeof contentParam).toBe("string");
    expect(tool.paramsSchema.safeParse({ [String(contentParam)]: "저장될 내용" }).success).toBe(
      true,
    );
  });

  it("테이블과 각 프로필이 런타임 동결돼 있다 — 판정의 입력이기 때문이다", () => {
    expect(Object.isFrozen(MEMORY_TOOL_GATE_PROFILES)).toBe(true);
    expect(Object.isFrozen(MEMORY_TOOL_GATE_PROFILES.remember)).toBe(true);

    const table = MEMORY_TOOL_GATE_PROFILES as Record<string, { kind: string }>;
    try {
      table.remember = { kind: "fileRead" };
    } catch {
      // strict 모드에서는 던진다 — 어느 쪽이든 값이 바뀌지 않는 것이 계약이다.
    }
    expect(MEMORY_TOOL_GATE_PROFILES.remember?.kind).toBe("memoryWrite");
  });
});
