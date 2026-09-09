/**
 * 계약 검증 — 셸 학습 키의 `cwd` 바인딩 (`APPROVAL-GATE.md` §4의 2026-09-09 항 넷 ·
 * §2 계층 6 · §7, 보조로 `CLI-INTERFACE.md` §10).
 *
 * 검증 대상은 `src/pipeline.ts`의 `allowlistKey`가 내는 `ApprovalRequest.allowAlwaysKey`다.
 * 기대값은 전부 위 문서에서 뽑았고 구현을 읽어 맞춘 자리는 없다 — 실패하는 단언은
 * 실패한 채로 둔다(구현이 문서와 다르면 테스트는 문서 편이다).
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이고, 갈리는 자리는 인용부호를 벗기고 서술로 썼다. 문서 지목은 절
 * 번호와 필드 이름으로만 한다.
 */

import { describe, expect, it } from "vitest";
import type { AllowlistStore, PathClassifier, PathScope } from "../src/types.ts";
import { makeSeededAllowlist, run } from "./contract-helpers.ts";
import { ch, makeAllowlist, makePrompt, WORKSPACE_ROOT } from "./helpers.ts";

/** 프롬프트에 실린 `allowAlwaysKey`를 꺼낸다 — 프롬프트에 닿았는지도 함께 본다 */
async function keyFor(
  args: Record<string, unknown>,
  overrides: Parameters<typeof run>[0] = {},
): Promise<string | undefined> {
  const prompt = makePrompt({ response: "allow-once" });
  await run({ ...overrides, prompt }, "shell", args);
  if (prompt.last === undefined) throw new Error("프롬프트에 닿지 않았다 — 키를 관측할 수 없다");
  return prompt.last.allowAlwaysKey;
}

/**
 * 루트를 바꿔 끼울 수 있는 classifier. `helpers.ts`의 것은 `/ws` 고정이라
 * "워크스페이스가 다르면 키도 다르다"(§4 — 워크스페이스 상대 경로 기각)를 잴 수 없다.
 */
function makeRootedClassifier(root: string): PathClassifier {
  return {
    resolve(input: string): { path: string; scope: PathScope } {
      const path =
        input === "." || input === "" ? root : input.startsWith("/") ? input : `${root}/${input}`;
      const inside = path === root || path.startsWith(`${root}/`);
      return { path, scope: inside ? "inside" : "outside" };
    },
  };
}

/** classifier가 어떤 경로든 그대로 돌려준다 — `cwd` 필드에 임의 문자를 넣기 위한 것 */
function makeVerbatimClassifier(scope: PathScope = "inside"): PathClassifier {
  return {
    resolve(input: string): { path: string; scope: PathScope } {
      return { path: input === "." ? WORKSPACE_ROOT : input, scope };
    },
  };
}

// ── §4 항1 — 키 형식은 `shell:<cwd>:<정규화된 명령>` ─────────────────────────

describe("§4 (2026-09-09) — 셸 키는 `shell:<cwd>:<정규화된 명령>`이다", () => {
  it("A-1: 지정된 cwd가 키에 들어간다", async () => {
    await expect(keyFor({ command: "npm test", cwd: "pkg/a" })).resolves.toBe(
      `shell:${WORKSPACE_ROOT}/pkg/a:npm test`,
    );
  });

  it('A-2: cwd 미지정은 classifier의 `"."` 해석값으로 안정된다', async () => {
    // §4: cwd 미지정은 워크스페이스 루트로 해석되므로 루트에서 도는 명령의 키는
    // 값 하나로 안정된다. §3의 PathClassifier 계약이 `"."`을 루트로 읽는 주체다.
    const implicit = await keyFor({ command: "npm test" });
    const explicitDot = await keyFor({ command: "npm test", cwd: "." });
    expect(implicit).toBe(`shell:${WORKSPACE_ROOT}:npm test`);
    expect(explicitDot).toBe(implicit);
  });

  it("A-3: 명령 쪽은 정규화된 문자열이다 — 공백 변형이 키를 갈라놓지 않는다", async () => {
    await expect(keyFor({ command: "  npm   test  " })).resolves.toBe(
      `shell:${WORKSPACE_ROOT}:npm test`,
    );
  });
});

// ── §4 항1의 핵심 — cwd 바인딩이 실제로 학습 범위를 좁히는가 ─────────────────

describe("§4 (2026-09-09) — 학습은 「이 디렉터리에서 이 명령」으로 좁혀진다", () => {
  it("B-1: 같은 명령이라도 cwd가 다르면 다른 키다", async () => {
    const a = await keyFor({ command: "npm test", cwd: "pkg/a" });
    const b = await keyFor({ command: "npm test", cwd: "pkg/b" });
    expect(a).not.toBe(b);
  });

  it("B-2: 한 디렉터리에서 학습한 것이 다른 디렉터리를 통과시키지 않는다", async () => {
    // §4: 옛 키는 사용자가 이 에이전트를 띄우는 모든 프로젝트에서 자동 통과했다.
    // **시드를 손으로 적지 않고 게이트가 실제로 학습한 것을 쓴다** — 리터럴 시드를
    // 쓰면 키 형식을 바꾸는 어떤 변이에도 시드가 빗나가 이 검사가 공허하게 통과한다.
    const allowlist = makeAllowlist();
    await run({ allowlist, prompt: makePrompt({ response: "allow-always" }) }, "shell", {
      command: "npm test",
      cwd: "pkg/a",
    });
    expect(allowlist.added).toHaveLength(1);

    const prompt = makePrompt({ response: "allow-once" });
    const verdict = await run({ allowlist, prompt }, "shell", {
      command: "npm test",
      cwd: "pkg/b",
    });
    expect(verdict).toMatchObject({ decision: "allow", layer: "prompt" });
    expect(prompt.calls).toHaveLength(1);
  });

  it("B-2b: 학습한 그 디렉터리는 두 번째 호출에서 묻지 않는다 (B-2의 짝)", async () => {
    // B-2가 「학습이 아무것도 안 됐다」로도 통과하지 않게 하는 대조군이다.
    const allowlist = makeAllowlist();
    await run({ allowlist, prompt: makePrompt({ response: "allow-always" }) }, "shell", {
      command: "npm test",
      cwd: "pkg/a",
    });
    const prompt = makePrompt({ response: "allow-once" });
    const verdict = await run({ allowlist, prompt }, "shell", {
      command: "npm test",
      cwd: "pkg/a",
    });
    expect(verdict).toMatchObject({ decision: "allow", layer: "allowlist" });
    expect(prompt.calls).toHaveLength(0);
  });

  it("B-3: 학습한 그 디렉터리에서는 계층 6에서 통과한다", async () => {
    const allowlist = makeSeededAllowlist([`shell:${WORKSPACE_ROOT}/pkg/a:npm test`]);
    const prompt = makePrompt({ response: "allow-once" });
    const verdict = await run({ allowlist, prompt }, "shell", {
      command: "npm test",
      cwd: "pkg/a",
    });
    expect(verdict).toMatchObject({ decision: "allow", layer: "allowlist" });
    expect(prompt.calls).toHaveLength(0);
  });

  it("B-4: 승인 화면은 cwd 줄을 조건 없이 싣는다 — 키가 화면보다 넓지 않다", async () => {
    // §4: `display`는 `shellExec`에 **언제나** `작업 디렉터리:` 줄을 싣는다.
    // 이 단언이 깨지면 「학습 키가 화면보다 넓지 않다」의 전제가 사라진다.
    for (const args of [{ command: "npm test" }, { command: "npm test", cwd: "pkg/a" }]) {
      const prompt = makePrompt({ response: "allow-once" });
      await run({ prompt }, "shell", args);
      expect(prompt.last?.display, JSON.stringify(args)).toContain("작업 디렉터리:");
    }
  });

  it("B-5: 화면이 보인 cwd 문자열이 키의 cwd 필드와 같다", async () => {
    const prompt = makePrompt({ response: "allow-once" });
    await run({ prompt }, "shell", { command: "npm test", cwd: "pkg/a" });
    const shown = /작업 디렉터리: (.*)$/m.exec(prompt.last?.display ?? "")?.[1];
    expect(shown).toBe(`${WORKSPACE_ROOT}/pkg/a`);
    expect(prompt.last?.allowAlwaysKey).toBe(`shell:${shown ?? ""}:npm test`);
  });
});

// ── §4 항2 — 평문·해석된 절대 경로 ────────────────────────────────────────────

describe("§4 (2026-09-09) — 키는 평문이고 cwd는 해석된 절대 경로다", () => {
  it("C-1: 원문 인자가 아니라 classifier가 해석한 절대 경로가 들어간다", async () => {
    const key = await keyFor({ command: "npm test", cwd: "pkg/a" });
    expect(key).toContain(`${WORKSPACE_ROOT}/pkg/a`);
    expect(key).not.toBe("shell:pkg/a:npm test");
  });

  it("C-2: 해시 표기를 쓰지 않는다 — cwd가 리터럴로 읽힌다", async () => {
    // §6: OpenClaw 2.0 `sha256:cwd-argv:v1:`은 **표기만 기각**이다.
    const key = (await keyFor({ command: "npm test", cwd: "pkg/a" })) ?? "";
    expect(key).not.toMatch(/sha256|^[0-9a-f]{32,}$/i);
    expect(key.startsWith("shell:")).toBe(true);
    expect(key).toContain("/pkg/a");
  });

  it("C-3: 워크스페이스 상대 경로가 아니다 — 루트가 다르면 다른 키다", async () => {
    // §4: 상대면 서로 다른 워크스페이스의 같은 상대 위치가 한 키가 된다.
    const first = await keyFor(
      { command: "npm test", cwd: "pkg/a" },
      { classifier: makeRootedClassifier("/home/u/proj-1") },
    );
    const second = await keyFor(
      { command: "npm test", cwd: "pkg/a" },
      { classifier: makeRootedClassifier("/home/u/proj-2") },
    );
    expect(first).toBe("shell:/home/u/proj-1/pkg/a:npm test");
    expect(second).toBe("shell:/home/u/proj-2/pkg/a:npm test");
    expect(first).not.toBe(second);
  });
});

// ── §4 항3 — `:`·개행이 든 cwd에는 키를 주지 않는다 ──────────────────────────

describe("§4 (2026-09-09) — 키 문법을 깨뜨리는 cwd에는 키가 없다", () => {
  const verbatim = makeVerbatimClassifier();

  it("D-1: cwd에 `:`이 있으면 키를 주지 않는다", async () => {
    await expect(
      keyFor({ command: "npm test", cwd: "/ws:a" }, { classifier: verbatim }),
    ).resolves.toBeUndefined();
  });

  it("D-2: cwd에 개행이 있으면 키를 주지 않는다", async () => {
    await expect(
      keyFor({ command: "npm test", cwd: "/ws/a\nb" }, { classifier: verbatim }),
    ).resolves.toBeUndefined();
  });

  it("D-3: 캐리지 리턴도 같다", async () => {
    await expect(
      keyFor({ command: "npm test", cwd: "/ws/a\rb" }, { classifier: verbatim }),
    ).resolves.toBeUndefined();
  });

  it("D-4: 명령 쪽 `:`은 자유다 — 키가 그대로 주어진다", async () => {
    // §4: 보장이 서면 첫 `:`이 언제나 경계이므로 명령 쪽은 `:`을 자유롭게 가져도 된다.
    await expect(keyFor({ command: "make a:b" })).resolves.toBe(`shell:${WORKSPACE_ROOT}:make a:b`);
  });

  it("D-5: 단사성 — 가드가 없었다면 충돌했을 쌍이 실제로 갈린다", async () => {
    const guarded = await keyFor({ command: "npm test", cwd: "/ws:a" }, { classifier: verbatim });
    const other = await keyFor({ command: "a:npm test", cwd: "." }, { classifier: verbatim });
    // 가드가 없으면 양쪽 모두 `shell:/ws:a:npm test`가 되어 한쪽 승인이 다른 쪽을 통과시킨다.
    expect(other).toBe(`shell:${WORKSPACE_ROOT}:a:npm test`);
    expect(guarded).toBeUndefined();
    expect(guarded).not.toBe(other);
  });

  it("D-6: 문서 §4가 든 예시 쌍은 실제로는 충돌하지 않는다 [문서 부정확]", async () => {
    // §4 단사성 항과 `patterns.ts`의 `cwdBreaksKeySyntax` 주석이 함께 드는 예시는
    // (/ws/a, npm test)와 (/ws, a:npm test)다. 그 둘은 `shell:/ws/a:npm test`와
    // `shell:/ws:a:npm test`라 같은 문자열이 아니다 — 규칙은 옳고 예시가 틀렸다.
    // 실제 충돌 쌍은 D-5가 든 (/ws:a, npm test)와 (/ws, a:npm test)다.
    const docLeft = await keyFor({ command: "npm test", cwd: "/ws/a" }, { classifier: verbatim });
    const docRight = await keyFor({ command: "a:npm test", cwd: "." }, { classifier: verbatim });
    expect(docLeft).toBe("shell:/ws/a:npm test");
    expect(docRight).toBe(`shell:${WORKSPACE_ROOT}:a:npm test`);
    expect(docLeft).not.toBe(docRight);
  });

  it("D-7: 키가 없어도 차단이 아니다 — 프롬프트로 간다(안전한 방향의 오탐)", async () => {
    const prompt = makePrompt({ response: "allow-once" });
    const verdict = await run({ classifier: verbatim, prompt }, "shell", {
      command: "npm test",
      cwd: "/ws:a",
    });
    expect(verdict).toMatchObject({ decision: "allow", layer: "prompt" });
    expect(prompt.last?.display).toContain("/ws:a");
  });

  it("D-8: 셸 키에 개행이 실리는 입력이 없다 — 「한 줄 1키」는 게이트가 지킨다", async () => {
    // `CLI-INTERFACE.md` §10: 「한 줄」을 지키는 것은 이 파일이 아니라 게이트다.
    const cases: Array<Record<string, unknown>> = [
      { command: "npm test", cwd: "/ws/a\nb" },
      { command: "npm test\nls -la", cwd: "." },
      { command: "npm test", cwd: "/ws/a\r\nb" },
      { command: "npm\ttest", cwd: "." },
    ];
    for (const args of cases) {
      const key = await keyFor(args, { classifier: verbatim });
      if (key !== undefined) expect(key, JSON.stringify(args)).not.toMatch(/[\n\r]/);
    }
  });
});

// ── §4 항4 — 옛 형식 키의 마이그레이션이 없다 ────────────────────────────────

describe("§4 (2026-09-09) — 옛 형식 키는 매칭되지 않고 죽은 줄로 남는다", () => {
  it("E-1: 옛 `shell:<명령>` 시드는 새 호출을 통과시키지 않는다", async () => {
    const allowlist = makeSeededAllowlist(["shell:npm test"]);
    const prompt = makePrompt({ response: "allow-once" });
    const verdict = await run({ allowlist, prompt }, "shell", { command: "npm test" });
    expect(verdict).toMatchObject({ decision: "allow", layer: "prompt" });
    expect(allowlist.queried).toContain(`shell:${WORKSPACE_ROOT}:npm test`);
  });

  it("E-2: 게이트는 allowlist에 `has`·`add` 밖의 어떤 것도 부르지 않는다", async () => {
    // §5: allowlist는 **추가만** 일어난다. 삭제·재작성 경로가 열리면 그 계약이 깨진다.
    const touched: string[] = [];
    const base = makeAllowlist([]);
    const spy = new Proxy(base as unknown as Record<string, unknown>, {
      get(target, prop, receiver) {
        if (typeof prop === "string") touched.push(prop);
        return Reflect.get(target, prop, receiver);
      },
    }) as unknown as AllowlistStore;
    await run({ allowlist: spy, prompt: makePrompt({ response: "allow-always" }) }, "shell", {
      command: "npm test",
    });
    expect(new Set(touched)).toEqual(new Set(["has", "add"]));
    expect(base.added).toEqual([`shell:${WORKSPACE_ROOT}:npm test`]);
  });

  it("E-3: 문서가 인정한 좁은 겹침 — 옛 줄이 새 키 모양이면 그대로 맞는다 [미규정]", async () => {
    // §4는 이 겹침을 「거의 언제나 매칭되지 않고」로 인정하고 무시를 실측(모집단
    // 공집합)으로 정당화한다. 즉 아래는 계약 위반이 아니라 **문서가 아는 결과**다.
    // 실사용이 시작돼 모집단이 0을 벗어나면 이 자리가 재도입 트리거의 대상이다.
    const allowlist = makeSeededAllowlist([`shell:${WORKSPACE_ROOT}:npm test`]);
    const verdict = await run({ allowlist }, "shell", { command: "npm test" });
    expect(verdict).toMatchObject({ decision: "allow", layer: "allowlist" });
  });
});

// ── §2 계층 6 — 키 부재 기계의 다른 사용들과의 상호작용 ──────────────────────

describe("§2 계층 6 — 키 부재는 같은 기계의 여러 사용이다", () => {
  it("F-1: 셸 연산자가 있으면 cwd가 멀쩡해도 키가 없다", async () => {
    await expect(keyFor({ command: "ls; rm -rf ~", cwd: "pkg/a" })).resolves.toBeUndefined();
  });

  it("F-2: 위험 플래그가 있으면 키도 없고 allowlist를 조회하지도 않는다", async () => {
    const allowlist = makeSeededAllowlist([]);
    const prompt = makePrompt({ response: "allow-once" });
    await run({ allowlist, prompt }, "shell", { command: "sudo apt update", cwd: "pkg/a" });
    expect(prompt.last?.allowAlwaysKey).toBeUndefined();
    expect(allowlist.queried).toEqual([]);
  });

  it("F-3: 키가 없는데 allow-always가 와도 학습되지 않는다 [미규정]", async () => {
    // §4: `allowAlwaysKey`가 없으면 그 선택지를 제공하지 않는다. 프롬프트 구현이
    // 그럼에도 `allow-always`를 돌려줬을 때의 처리는 계약이 정하지 않는다 —
    // 아래는 침묵 학습이 없음을 못박는 것이고 판정 요청 대상이다.
    const allowlist = makeAllowlist([]);
    const verdict = await run(
      { allowlist, prompt: makePrompt({ response: "allow-always" }) },
      "shell",
      { command: "ls; rm -rf ~" },
    );
    expect(allowlist.added).toEqual([]);
    expect(verdict).toMatchObject({ decision: "allow", layer: "prompt" });
  });
});

// ── §7 미결 — 판정 필요 ──────────────────────────────────────────────────────

describe("§7 미결 — 이 문서가 정하지 않은 자리", () => {
  it("G-1: 워크스페이스 밖 cwd에도 키가 주어진다 [미규정 K-603]", async () => {
    // §7이 2026-09-09에 신설한 미결 그대로다: 게이트는 `shellExec`에 scope 판정을
    // 하지 않으므로 outside여도 키가 만들어지고, 도구는 실행 직전에 그 cwd를 거부한다
    // — 학습은 되고 실행은 안 되는 키다. 갈래 둘 중 어느 쪽인지는 아직 판정 전이므로
    // 이 단언은 **현재 동작을 못박을 뿐 옳다고 주장하지 않는다.**
    const key = await keyFor({ command: "npm test", cwd: "/elsewhere/x" });
    expect(key).toBe("shell:/elsewhere/x:npm test");
  });

  it("G-2: classifier가 빈 경로를 돌려주면 cwd 필드가 빈 키가 된다 [미규정]", async () => {
    // 계약은 classifier가 빈 `path`를 돌려줄 수 있는지 말하지 않는다. 지금은
    // `shell::<명령>`이 되어 「cwd 미지정」과 구별되지 않는 키가 생긴다.
    const empty: PathClassifier = { resolve: () => ({ path: "", scope: "inside" }) };
    await expect(keyFor({ command: "npm test" }, { classifier: empty })).resolves.toBe(
      "shell::npm test",
    );
  });
});

// ── 위조 탐지와 학습 키 — cwd가 키에 들어간 뒤 열린 자리 ─────────────────────

describe("§4 표시 위조 탐지 — cwd도 키에 들어가는 문자열이다", () => {
  const verbatim = makeVerbatimClassifier();
  const CYRILLIC_ES = ch(0x0441); // 라틴 `c`와 눈으로 구분되지 않는다
  const ZWSP = ch(0x200b);

  it("H-1: cwd의 비가시 문자는 표시본에서 가시 표기로 드러난다", async () => {
    // §4: `display`를 만들 때 비가시 문자·동형이의 문자를 탐지해 가시 표기로
    // 이스케이프하고 `warnings`에 싣는다. cwd는 `display`에 실리는 문자열이다.
    // 이스케이프 쪽은 성립한다 — 아래 H-2가 경고·동형이의 쪽을 따로 잰다.
    const prompt = makePrompt({ response: "allow-once" });
    await run({ classifier: verbatim, prompt }, "shell", {
      command: "npm test",
      cwd: `/ws/sr${ZWSP}c`,
    });
    expect(prompt.last?.display).toContain("U+200B");
  });

  it("H-2: cwd의 비가시 문자가 경고에도 실린다", async () => {
    // 같은 문장의 나머지 절반이다 — 이스케이프**하고** `warnings`에 싣는다.
    const prompt = makePrompt({ response: "allow-once" });
    await run({ classifier: verbatim, prompt }, "shell", {
      command: "npm test",
      cwd: `/ws/sr${ZWSP}c`,
    });
    expect(prompt.last?.warnings.join(" ")).toContain("표시 위조");
  });

  it("H-3: cwd의 동형이의 문자가 표시본에서 드러난다", async () => {
    // 명령 쪽이 위조됐을 때와 같은 `<U+…→x>` 표기를 기대한다. 경고 문구로만
    // 알리면 사용자는 키릴 `с`와 라틴 `c`를 눈으로 구분할 수 없다.
    const prompt = makePrompt({ response: "allow-once" });
    await run({ classifier: verbatim, prompt }, "shell", {
      command: "npm test",
      cwd: `/ws/${CYRILLIC_ES}url`,
    });
    expect(prompt.last?.display).toContain("U+0441");
  });

  it("H-4: cwd에 위조 흔적이 있으면 「항상 허용」 키가 사라진다", async () => {
    // `DisplayAnalysis.spoofed`의 근거 그대로다 — 사용자가 본 것과 실행될 것이
    // 다를 수 있는 문자열을 영구 학습시키는 것은 그 자체로 우회 경로다. 2026-09-09
    // 개정으로 cwd가 **영속되는 키의 일부**가 된 뒤 이 자리가 실효를 갖는다.
    for (const cwd of [`/ws/sr${ZWSP}c`, `/ws/${CYRILLIC_ES}url`]) {
      const key = await keyFor({ command: "npm test", cwd }, { classifier: verbatim });
      expect(key, cwd).toBeUndefined();
    }
  });

  it("H-5: 대조 — 명령 쪽 같은 위조는 경고·키 무효화가 모두 성립한다", async () => {
    // 판별력 대조군이다. 같은 문자를 명령에 넣으면 세 효과가 전부 난다 —
    // 즉 위 실패는 검사기가 못 재는 것이 아니라 cwd 경로가 그 기계를 안 타는 것이다.
    const prompt = makePrompt({ response: "allow-once" });
    await run({ classifier: verbatim, prompt }, "shell", {
      command: `npm ${CYRILLIC_ES}test`,
    });
    expect(prompt.last?.display).toContain("U+0441");
    expect(prompt.last?.warnings.join(" ")).toContain("표시 위조");
    expect(prompt.last?.allowAlwaysKey).toBeUndefined();
  });
});

// ── 키에 들어가는 cwd가 어느 계층의 검사도 받지 않는다는 관측 ────────────────

describe("cwd는 키의 일부가 됐지만 계층 2·4의 매칭 대상은 아니다", () => {
  it("I-1: deny 규칙이 cwd에 걸리지 않는다 [미규정]", async () => {
    // §2 계층 2는 「난독화 정규화 후 글로브 매칭」까지만 정하고 **무엇을** 매칭
    // 대상으로 삼는지는 `primary` 규정(§3의 `memoryWrite` 절)이 든다 — `shellExec`의
    // `primary`는 명령이다. cwd가 2026-09-09부터 **영속 키의 일부**가 됐으므로
    // 「사용자가 금지한 디렉터리에서의 실행」이 규칙으로 표현 불가한 상태가 관측된다.
    // 어느 쪽이 옳은지는 계약이 정하지 않았다 — 현재 동작을 못박을 뿐이다.
    const prompt = makePrompt({ response: "allow-once" });
    const verdict = await run({ denyRules: ["**secret**"], prompt }, "shell", {
      command: "ls",
      cwd: "secret-dir",
    });
    expect(verdict).toMatchObject({ decision: "allow", layer: "prompt" });
    expect(prompt.last?.allowAlwaysKey).toBe(`shell:${WORKSPACE_ROOT}/secret-dir:ls`);
  });

  it("I-2: 위험 패턴도 cwd를 보지 않는다 [미규정]", async () => {
    // 같은 자리다. 크리덴셜 경로가 **명령**에 있으면 플래그되어 키가 사라지지만,
    // 같은 경로가 **cwd**에 있으면 플래그되지 않고 그대로 학습 키가 만들어진다.
    const flaggedByCommand = await keyFor({ command: "cat ~/.ssh/id_rsa" });
    const notFlaggedByCwd = await keyFor({ command: "ls", cwd: "/home/u/.ssh" });
    expect(flaggedByCommand).toBeUndefined();
    expect(notFlaggedByCwd).toBe("shell:/home/u/.ssh:ls");
  });
});
