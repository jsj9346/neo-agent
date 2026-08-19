/**
 * T-011 통합 시나리오 — 조립된 전체가 계약대로 도는가 (QA-B).
 *
 * 단위 계약 테스트가 부품 하나씩을 문서에 대조한다면, 여기서 재는 것은 **부품이
 * 다 맞는데 합치면 안 되는** 경우다. 그래서 모의를 최소로 둔다: 실제 SQLite 저장소,
 * 실제 승인 게이트, 실제 워크스페이스 경계·도구 4종, 실제 CLI 렌더러·승인 프롬프트·
 * allowlist 파일이 돌고, 모의인 것은 모델·터미널 스트림·사용자가 누르는 키뿐이다.
 * 조립은 `integration-harness.ts`가 `CLI-INTERFACE.md` §2 시퀀스대로 한다.
 *
 * 기대값의 출처(구현 코드가 아니다):
 *   - `CLI-INTERFACE.md` §2(시작 시퀀스)·§6(세션 수명주기)·§7(렌더링)·§9(승인 UI)·§10(allowlist)
 *   - `SESSION-STORE.md` §4(저장 시점·구독 순서)·§5(재개 검증)
 *   - `APPROVAL-GATE.md` §2(파이프라인 순서)·§4(배선·수신자 규칙)·§5(allowlist 예외)
 *   - `CORE-INTERFACE.md` §3(구독 순서대로 await)·§7(block reason은 모델에게 간다)
 *
 * ── 이 파일이 재지 **않는** 것 ──────────────────────────────────────────────
 * 조립 지점(`src/wiring.ts`) 자체의 계약은 `wiring.contract.test.ts`가 잰다. 둘은
 * 다른 질문이다 — **손으로 올바르게 조립한 이 파일은 `wiring.ts`가 순서를 뒤집어도
 * 전부 통과한다.** 그래서 화면 표시가 조립 지점에 달린 두 항목(재개 직후 과거 대화
 * 표시 §6, 워크스페이스 불일치 안내 문구 §6)의 **표시** 부분은 그쪽에 있고,
 * 여기서는 그 표시를 만들 재료가 실제로 손에 들어오는지까지 본다.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRig, MODEL_ID, type Rig, SYSTEM_PROMPT, wireAgent } from "./integration-harness.ts";

let rig: Rig;

const newSession = (): string =>
  rig.store.createSession({
    workspaceRoot: rig.workspaceRoot,
    systemPrompt: SYSTEM_PROMPT,
    model: MODEL_ID,
  }).id;

const resumeContext = () => ({
  workspaceRoot: rig.workspaceRoot,
  systemPrompt: SYSTEM_PROMPT,
  model: MODEL_ID,
});

/** 워크스페이스 안의 쓰기 대상 — 매트릭스상 자동 허용이 아니라 프롬프트로 간다 */
const TARGET = "note.txt";
const writeCall = (toolCallId: string, text = "내용") => ({
  toolCallId,
  toolName: "write_file",
  args: { path: TARGET, content: text },
});

beforeEach(() => {
  rig = createRig();
});

afterEach(() => {
  rig.cleanup();
});

// ───────────────────────────────────────────────────────────────────────────
// 시나리오 1 — 대화 1턴: 저장과 표시, 그리고 그 순서
// ───────────────────────────────────────────────────────────────────────────

describe("시나리오 1 — 대화 1턴 (SESSION-STORE §4, CLI-INTERFACE §7)", () => {
  it("한 턴이 DB에 저장되고 화면에도 나온다", async () => {
    const sessionId = newSession();
    const wired = wireAgent(rig, sessionId, [{ text: "반갑다" }]);

    await wired.agent.prompt("안녕");
    await wired.agent.waitForIdle();

    // 저장 — user·assistant 두 메시지가 seq 순으로 남는다
    const rows = rig.messageRows(sessionId);
    expect(rows.map((row) => row.role)).toEqual(["user", "assistant"]);
    expect(rows.map((row) => row.seq)).toEqual([1, 2]);

    // 표시 — 사용자 메시지는 항상 렌더하고(§7), 어시스턴트 응답은 스트리밍된다
    expect(rig.out.text).toContain("안녕");
    expect(rig.out.text).toContain("반갑다");
  });

  /**
   * §4: "저장소는 CLI 렌더러보다 먼저 구독한다. …그 순서는 **사용자가 화면에서 본
   * 것은 이미 저장된 것**이라는 뜻이 된다."
   *
   * 리스너 등록 순서를 들여다보는 대신 계약의 **결과**를 잰다: `message_end`를
   * 그리는 그 순간에 해당 행이 DB에 있는가. 등록 순서가 맞아도 코어가 리스너를
   * 병렬로 돌리면 이 성질은 깨지므로, 이쪽이 실제로 지켜야 할 것에 더 가깝다
   * (CORE-INTERFACE §3의 "구독 순서대로 await"가 여기서 소비된다).
   */
  it("렌더된 메시지는 렌더 시점에 이미 저장돼 있다", async () => {
    const sessionId = newSession();
    const wired = wireAgent(rig, sessionId, [{ text: "반갑다" }]);

    await wired.agent.prompt("안녕");
    await wired.agent.waitForIdle();

    expect(wired.renderProbes.length).toBeGreaterThan(0);
    expect(wired.renderProbes.filter((probe) => !probe.savedAtRenderTime)).toEqual([]);
  });

  /**
   * **위 검사가 실제로 순서를 잰다는 보증(대조군).** 배선을 뒤집으면 깨져야 한다.
   * 깨지지 않는다면 위 테스트는 무엇을 재는지 알 수 없는 초록불이다.
   *
   * `rendererFirst`는 계약이 허용하는 배선이 아니다 — 오직 검사기의 민감도를
   * 보이기 위해서만 쓴다.
   */
  it("[대조군] 렌더러를 먼저 구독하면 '본 것은 저장된 것'이 깨진다", async () => {
    const sessionId = newSession();
    const wired = wireAgent(rig, sessionId, [{ text: "반갑다" }], { rendererFirst: true });

    await wired.agent.prompt("안녕");
    await wired.agent.waitForIdle();

    expect(wired.renderProbes.some((probe) => !probe.savedAtRenderTime)).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 시나리오 2 — 도구 호출 → 승인 → 실행
// ───────────────────────────────────────────────────────────────────────────

describe("시나리오 2 — 승인 후 실행 (CLI-INTERFACE §9, APPROVAL-GATE §2)", () => {
  it("워크스페이스 안 쓰기는 프롬프트를 거쳐 allow-once로 실행된다", async () => {
    const sessionId = newSession();
    rig.queueApprovalKeys("y");
    const wired = wireAgent(rig, sessionId, [
      { toolCalls: [writeCall("c1", "저장된 내용")] },
      { text: "썼다" },
    ]);

    await wired.agent.prompt("파일 써줘");
    await wired.agent.waitForIdle();

    // 프롬프트가 실제로 떴다 — 워크스페이스 안 **쓰기**는 자동 허용이 아니다
    expect(rig.promptRequests).toHaveLength(1);
    expect(rig.promptRequests[0]?.toolName).toBe("write_file");

    // 도구가 실제로 돌았다
    expect(readFileSync(join(rig.workspaceRoot, TARGET), "utf8")).toBe("저장된 내용");

    // 결과가 화면에 남았다(§7 — tool_start/tool_end)
    expect(rig.out.text).toContain("write_file");

    // 도구 결과가 트랜스크립트에 저장됐다
    expect(rig.messageRows(sessionId).map((row) => row.role)).toEqual([
      "user",
      "assistant",
      "toolResult",
      "assistant",
    ]);
  });

  /**
   * §9: "**`display`는 가공 없이 그대로 표시한다.** 색상·테두리 장식은 `display`
   * 문자열 **밖**에만 붙인다 — 문자열 내용을 자르거나 정규화하거나 재포맷하면
   * 게이트의 위조 탐지가 무의미해진다."
   *
   * ANSI를 벗기지 않은 **원문**에서 바이트 동일성을 본다. 벗긴 텍스트로 보면
   * "장식을 문자열 안에 섞어 넣은" 위반이 통과해 버린다.
   */
  it("게이트가 만든 display가 화면에 바이트 그대로 나온다", async () => {
    const sessionId = newSession();
    rig.queueApprovalKeys("y");
    const wired = wireAgent(rig, sessionId, [{ toolCalls: [writeCall("c1")] }, { text: "끝" }]);

    await wired.agent.prompt("파일 써줘");
    await wired.agent.waitForIdle();

    const display = rig.promptRequests[0]?.display;
    expect(display).toBeDefined();
    expect(rig.out.raw).toContain(display as string);
  });

  /**
   * §9: "`allowAlwaysKey`가 없으면 '항상 허용'을 제공하지 않는다." 뒤집으면,
   * **있으면 제공해야** allow-always 경로(시나리오 4)가 성립한다. 여기서는
   * 게이트가 이 요청에 키를 실어 보냈다는 전제를 고정한다.
   */
  it("워크스페이스 안 쓰기 요청에는 allowAlwaysKey가 실린다", async () => {
    const sessionId = newSession();
    rig.queueApprovalKeys("y");
    const wired = wireAgent(rig, sessionId, [{ toolCalls: [writeCall("c1")] }, { text: "끝" }]);

    await wired.agent.prompt("파일 써줘");
    await wired.agent.waitForIdle();

    expect(rig.promptRequests[0]?.allowAlwaysKey).toBeDefined();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 시나리오 3 — deny
// ───────────────────────────────────────────────────────────────────────────

describe("시나리오 3 — deny (APPROVAL-GATE §2·§4, CORE-INTERFACE §7)", () => {
  it("거부하면 도구가 실행되지 않고 런은 계속된다", async () => {
    const sessionId = newSession();
    rig.queueApprovalKeys("n");
    const wired = wireAgent(rig, sessionId, [
      { toolCalls: [writeCall("c1")] },
      { text: "알겠다, 안 쓴다" },
    ]);

    await wired.agent.prompt("파일 써줘");
    await wired.agent.waitForIdle();

    // 실행되지 않았다
    expect(() => readFileSync(join(rig.workspaceRoot, TARGET), "utf8")).toThrow();
    // 런은 끊기지 않고 다음 턴으로 갔다 — 침묵 종료가 아니다
    expect(wired.model.callCount).toBe(2);
    expect(rig.out.text).toContain("알겠다, 안 쓴다");
  });

  /**
   * §2 계층 7: "deny는 `{ decision: "block", reason }`으로 **모델에게 보인다**
   * (침묵 거부 금지, CORE-INTERFACE §7)."
   *
   * 다음 모델 호출이 실제로 받은 메시지에서 확인한다 — 훅 반환값만 보면 코어가
   * 그것을 트랜스크립트에 넣었는지는 알 수 없다.
   */
  it("block 사유가 다음 모델 호출의 메시지에 담겨 모델에게 간다", async () => {
    const sessionId = newSession();
    rig.queueApprovalKeys("n");
    const wired = wireAgent(rig, sessionId, [{ toolCalls: [writeCall("c1")] }, { text: "알겠다" }]);

    await wired.agent.prompt("파일 써줘");
    await wired.agent.waitForIdle();

    expect(rig.blockReasons).toHaveLength(1);
    const reason = rig.blockReasons[0] as string;

    const secondRequest = wired.model.requests[1];
    expect(secondRequest).toBeDefined();
    const delivered = JSON.stringify(secondRequest?.messages);
    expect(delivered).toContain(reason);
  });

  /**
   * §9: "deny 시 CLI는 자체 사유 문자열을 만들지 않는다 — 모델에게 가는 `reason`은
   * 게이트가 만든다(영어, 게이트 §4의 수신자 규칙)."
   *
   * 게이트가 만든 문자열이 **그대로** 모델에게 갔는지는 위에서 봤고, 여기서는
   * 그 문자열이 사용자 언어(한국어)로 오염되지 않았는지를 본다. CLI가 자기
   * 사유를 덧붙였다면 승인 UI의 한국어가 섞여 들어온다.
   */
  it("모델에게 가는 사유에 CLI의 사용자 언어 문구가 섞이지 않는다", async () => {
    const sessionId = newSession();
    rig.queueApprovalKeys("n");
    const wired = wireAgent(rig, sessionId, [{ toolCalls: [writeCall("c1")] }, { text: "알겠다" }]);

    await wired.agent.prompt("파일 써줘");
    await wired.agent.waitForIdle();

    const reason = rig.blockReasons[0] as string;
    expect(reason).not.toMatch(/[가-힣]/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 시나리오 4 — allow-always
// ───────────────────────────────────────────────────────────────────────────

describe("시나리오 4 — allow-always (CLI-INTERFACE §10, APPROVAL-GATE §5)", () => {
  it("항상 허용은 allowlist 파일에 키를 남기고 같은 호출은 다시 묻지 않는다", async () => {
    const sessionId = newSession();
    // 키는 하나만 준비한다 — 두 번째 호출이 프롬프트로 가면 응답이 없어 매달린다.
    // 그 자체가 "다시 묻지 않는다"의 실패 신호가 되도록 의도한 배치다.
    rig.queueApprovalKeys("a");
    const wired = wireAgent(rig, sessionId, [
      { toolCalls: [writeCall("c1", "첫 번째")] },
      { toolCalls: [writeCall("c2", "두 번째")] },
      { text: "둘 다 썼다" },
    ]);

    await wired.agent.prompt("두 번 써줘");
    await wired.agent.waitForIdle();

    // 프롬프트는 한 번뿐이다
    expect(rig.promptRequests).toHaveLength(1);

    // **파일**에 키가 남았다 — 메모리 반영만으로는 §10의 "다음 세션에 남는다"가 아니다
    const key = rig.promptRequests[0]?.allowAlwaysKey as string;
    const persisted = readFileSync(rig.allowlistPath, "utf8").split("\n");
    expect(persisted).toContain(key);

    // 두 번째 호출도 실제로 실행됐다
    expect(readFileSync(join(rig.workspaceRoot, TARGET), "utf8")).toBe("두 번째");
    expect(rig.allowlistWarnings).toEqual([]);
  });

  /**
   * §5(게이트): "allowlist는 동결의 **명시적 예외**다 — 세션 중 **추가만** 일어난다."
   * §10(CLI): "시작 시 1회 로드하고 재읽기하지 않는다."
   *
   * 파일에 미리 키가 있으면 프롬프트 자체가 뜨지 않아야 한다 — 다음 세션에 남는다는
   * 것의 실체다. 위 테스트가 남긴 키를 **새 rig**가 읽는 형태로 검증한다.
   */
  it("이전 세션이 남긴 키는 새 프로세스에서 프롬프트 없이 통과한다", async () => {
    // allowlist는 **생성 시 1회** 읽으므로(§10), 키는 rig가 만들어지기 전에 놓여
    // 있어야 한다. `seedAllowlist`가 워크스페이스 경로를 알려주는 이유가 그것이다 —
    // 키에 절대 경로가 들어가는데 그 경로는 rig가 만들어질 때 정해진다.
    const seeded = createRig({
      seedAllowlist: (workspace) => [`fileWrite:${join(workspace, TARGET)}`],
    });
    try {
      const sessionId = seeded.store.createSession({
        workspaceRoot: seeded.workspaceRoot,
        systemPrompt: SYSTEM_PROMPT,
        model: MODEL_ID,
      }).id;
      // 승인 키를 하나도 준비하지 않는다 — 프롬프트가 뜨면 응답이 없어 매달리고,
      // 그 자체가 "묻지 않는다"의 실패 신호가 된다.
      const wired = wireAgent(seeded, sessionId, [
        { toolCalls: [writeCall("c1", "학습된 허용")] },
        { text: "썼다" },
      ]);

      await wired.agent.prompt("파일 써줘");
      await wired.agent.waitForIdle();

      expect(seeded.promptRequests).toEqual([]);
      expect(readFileSync(join(seeded.workspaceRoot, TARGET), "utf8")).toBe("학습된 허용");
    } finally {
      seeded.cleanup();
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 시나리오 5 — 재개
// ───────────────────────────────────────────────────────────────────────────

describe("시나리오 5 — 재개 (CLI-INTERFACE §6, SESSION-STORE §5)", () => {
  it("재개한 세션이 과거 트랜스크립트를 싣고 seq가 이어진다", async () => {
    const sessionId = newSession();
    const first = wireAgent(rig, sessionId, [{ text: "첫 응답" }]);
    await first.agent.prompt("첫 질문");
    await first.agent.waitForIdle();
    first.detach();

    // §6의 재개 경로: loadSession → 반환 배열을 AgentSessionInit.messages로
    const loaded = rig.store.loadSession(sessionId, resumeContext());
    expect(loaded.messages).toHaveLength(2);

    rig.out.clear();
    const second = wireAgent(rig, sessionId, [{ text: "두 번째 응답" }], {
      messages: loaded.messages,
    });
    await second.agent.prompt("두 번째 질문");
    await second.agent.waitForIdle();

    // seq가 이어 붙는다 — 재개가 새 세션을 만들지 않았다
    expect(rig.messageRows(sessionId).map((row) => row.seq)).toEqual([1, 2, 3, 4]);
    // 과거 메시지가 다시 저장되지 않았다(INSERT OR IGNORE의 실체, §3)
    expect(rig.messageRows(sessionId)).toHaveLength(4);
  });

  /**
   * §6: "**재개 시 과거 대화는 이벤트로 재방출되지 않는다**(2026-08-06 실측 확정).
   * 렌더러는 `loadSession` 반환 배열로 직접 그린다."
   *
   * 재방출되면 렌더러가 과거 대화를 두 번 그리고, 저장소는 이미 저장한 것을
   * 다시 받는다. 배선 직후 프롬프트 전까지 화면이 비어 있어야 한다.
   */
  it("재개는 과거 대화를 이벤트로 재방출하지 않는다", async () => {
    const sessionId = newSession();
    const first = wireAgent(rig, sessionId, [{ text: "첫 응답" }]);
    await first.agent.prompt("첫 질문");
    await first.agent.waitForIdle();
    first.detach();

    const loaded = rig.store.loadSession(sessionId, resumeContext());
    rig.out.clear();
    const second = wireAgent(rig, sessionId, [{ text: "두 번째 응답" }], {
      messages: loaded.messages,
    });

    // 배선만 하고 아무것도 하지 않았다
    expect(rig.out.raw).toBe("");
    expect(second.renderProbes).toEqual([]);
  });

  /**
   * §6: "재개 직후 '어디까지 진행된 세션인지'가 화면에 보여야 한다는 것이 계약이다
   * (§2.6) — 빈 화면으로 이어가면 사용자는 어느 대화에 접속했는지 모른다."
   *
   * 화면에 그리는 주체는 조립 지점이므로 **표시 자체는 `wiring.contract.test.ts`가
   * 잰다**. 여기서는 그리기에 필요한 재료가 실제로 손에 들어오는지까지 본다 —
   * 재료가 없으면 조립 지점이 아무리 잘 짜여도 계약을 이행할 수 없다.
   */
  it("과거 대화를 그릴 재료가 loadSession 반환값에 들어 있다", async () => {
    const sessionId = newSession();
    const first = wireAgent(rig, sessionId, [{ text: "첫 응답" }]);
    await first.agent.prompt("첫 질문");
    await first.agent.waitForIdle();
    first.detach();

    const loaded = rig.store.loadSession(sessionId, resumeContext());
    const flattened = JSON.stringify(loaded.messages);
    expect(flattened).toContain("첫 질문");
    expect(flattened).toContain("첫 응답");
    expect(loaded.session.id).toBe(sessionId);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 시나리오 6 — 워크스페이스 불일치
// ───────────────────────────────────────────────────────────────────────────

describe("시나리오 6 — 워크스페이스 불일치 재개 (CLI-INTERFACE §6, SESSION-STORE §5)", () => {
  it("다른 워크스페이스에서 재개하면 거부되고 세션은 손상되지 않는다", async () => {
    const sessionId = newSession();
    const first = wireAgent(rig, sessionId, [{ text: "첫 응답" }]);
    await first.agent.prompt("첫 질문");
    await first.agent.waitForIdle();
    first.detach();

    const before = rig.messageRows(sessionId).length;
    const elsewhere = join(rig.sandbox, "다른-워크스페이스");

    let caught: unknown;
    try {
      rig.store.loadSession(sessionId, { ...resumeContext(), workspaceRoot: elsewhere });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    // 부분 기동 금지(§2) — 거부된 재개가 트랜스크립트를 건드리지 않는다
    expect(rig.messageRows(sessionId)).toHaveLength(before);
  });

  /**
   * §6: "세션에 기록된 워크스페이스 경로를 **표시하고** '그 디렉터리에서 다시 실행'을
   * 안내한다."
   *
   * 안내 문구를 만드는 것은 조립 지점이므로 문구 자체는 `wiring.contract.test.ts`가
   * 잰다. 여기서는 **기록된 경로를 CLI가 손에 넣을 수 있는가**를 본다 — 경로를
   * 얻을 방법이 없으면 그 안내는 어느 조립으로도 만들 수 없다.
   */
  it("기록된 워크스페이스 경로를 CLI가 얻을 수 있다", async () => {
    const sessionId = newSession();

    const recorded = rig.store
      .listSessions()
      .find((session) => session.id === sessionId)?.workspaceRoot;

    expect(recorded).toBe(rig.workspaceRoot);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 판정 기록 — 이 파일이 물었던 것과 그 처분 (QA-B / T-011)
 *
 * I-1·I-3·I-4는 **2026-08-06에**, I-2는 **2026-08-11에** 판정됐다. 2026-08-06
 * 판정 정본은 `plans/20260806-cli-qa-report.md` §4(조치 불필요 15건)이고, I-2의
 * 정본은 `CLI-INTERFACE.md` §1·§6이다. 열린 판정이 하나도 없으므로
 * 미규정 마커를 달지 않는다 — **닫힌 항목이 마커를 유지하면 진짜 열린 항목이 묻힌다.**
 *
 * I-1·I-2는 `wiring.contract.test.ts`의 W-3·W-4와 **같은 항목**이며(리포트가
 * `I-1·W-3`·`I-2·W-4`로 묶어 처분했다) 그쪽 말미 블록의 판정 기록과 같은 내용이다.
 *
 * ── I-1: 재개 직후 과거 대화의 **표시 범위** (= W-3) ────────────────────────
 *   물음: §6은 "표시 범위(마지막 몇 턴)는 구현 세부이되, 재개 직후 '어디까지 진행된
 *   세션인지'가 화면에 보여야 한다는 것이 계약"이라고 한다. 계약과 세부의 경계가
 *   "무엇이 보이면 계약을 이행한 것인가"에서 갈린다.
 *   **판정 — 조치 불필요** (2026-08-06). 구현이 **전체 트랜스크립트를 렌더**하므로
 *   "어디까지 진행됐는지 보인다"가 충족되고, **범위 수치는 세부**다
 *   (`CLI-INTERFACE.md` §12가 "표시 세부"로 분류한 미결이 그 세부 쪽이다).
 *   이 파일이 "재료가 손에 들어온다"까지만 단언하고 표시 판정을 wiring 쪽에 두는
 *   배치는 그대로 옳다 — 표시는 조립 지점에 달려 있다(위 머리 주석).
 *
 * ── I-2: 과거 대화를 그리는 함수의 소유 모듈 (= W-4) ────────────────────────
 *   물음: §6은 "렌더러는 loadSession 반환 배열로 직접 그린다"고만 하고 그 표면이
 *   어디 사는지를 정하지 않는다(renderer인지 wiring인지).
 *   **판정 — `renderer.ts`가 소유하고 배럴에 노출된다** (2026-08-11,
 *   `CLI-INTERFACE.md` §6). 라이브 이벤트 렌더러와 재개 트랜스크립트 렌더러는
 *   **같은 모듈**이어야 한다 — 둘은 같은 `OutputSink`에 같은 표기 규약(역할 접두·
 *   도구 줄·트렁케이션)으로 쓰고, 한쪽만 바뀌면 **같은 대화가 재개 전후로 다르게
 *   보인다.** 조립(`wiring.ts`) 소유안을 택하지 않은 이유가 그것이다: 조립은
 *   *언제 그리는가*를 정하고, *어떻게 그리는가*는 렌더러 하나에 모은다.
 *   같은 판정이 §6에 계약 하나를 더 올렸다 — 재개 트랜스크립트는 도구 결과를
 *   **"실행되지 않음"으로 그리지 않는다**(과거 트랜스크립트엔 도구 이벤트가 없어
 *   §7 규칙을 그대로 쓰면 실행됐던 도구가 전부 미실행으로 보인다). 재개 경로의
 *   실패 판정 근거는 `isError`뿐이다. 두 계약 모두 `renderer.contract.test.ts`가
 *   단언한다.
 *   배럴 노출 판정의 상세(2026-08-06 판정의 무엇이 거짓이었는가)는
 *   `wiring.contract.test.ts` 말미의 W-4에 있다 — 같은 항목이므로 **정정은 반드시
 *   두 파일 동시에**.
 *   > 발견 정본: `plans/20260811-marker-hygiene-qa-report.md`
 *
 * ── I-3: 승인 대기 중 렌더러 출력과 프롬프트 출력의 싱크 공유 ────────────────
 *   물음: §9는 "승인 대기와 모델 스트리밍은 겹치지 않는다"고 하므로 한 싱크를
 *   공유해도 충돌하지 않지만, **둘이 같은 싱크여야 한다는 규정은 없다.**
 *   **판정 — 조치 불필요** (2026-08-06). 현 구현이 동일 싱크이고 §9의 **비중첩
 *   보장**으로 충돌이 없으므로 규정을 두지 않는다. 하네스가 같은 싱크로 조립한 것은
 *   실물과 일치한다. 다르게 조립할 근거가 생기면 시나리오 2의 `display` 검사 위치가
 *   바뀐다는 사실은 그대로 유효하다.
 *
 * ── I-4: 게이트 block 사유의 언어 검사 강도 ─────────────────────────────────
 *   물음: §4는 `reason`을 "영어"로 규정하는데 테스트는 한글이 섞이지 않는지까지만
 *   본다. 더 강한 판정 기준이 필요한가.
 *   **판정 — 조치 불필요** (2026-08-06). 계약은 *"CLI가 자기 사유를 덧붙이지
 *   않는가"*이고 지금 검사로 충분하다. "영어인가"를 기계적으로 판정할 수단이 없다는
 *   당시 사유가 판정으로 지지됐다.
 * ═══════════════════════════════════════════════════════════════════════════ */
