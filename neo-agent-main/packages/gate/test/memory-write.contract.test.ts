/**
 * `memoryWrite` 분류 계약 (T-003).
 *
 * 기대값의 출처는 정본 설계 문서뿐이다:
 * - `docs/APPROVAL-GATE.md` §2 계층 5(정책 매트릭스에 `memoryWrite` 추가 + 오염 런
 *   사전 고지), §3 `memoryWrite` 분류 절, §4(공개 인터페이스)
 * - `docs/MEMORY.md` §5(오염 정책 · 게이트 측 필요 변경 2건)
 *
 * **2026-08-09 재도출.** 초판은 구현보다 먼저 쓰였고, 그 과정에서 올린
 * `[미규정 B-1~B-5]` 5건이 전량 판정되어 `APPROVAL-GATE.md` §2 계층 5·§3이
 * 개정됐다. 이 파일은 **개정된 문서에서 다시 도출한 것**이지 구현에 맞춘 것이
 * 아니다. 초판이 굳혔던 구 계약(프로필에 인자 필드가 없다)은 정정됐다.
 *
 * 개정으로 확정된 것 — 더 이상 판정 중립이 아니다:
 * - **B-1** 프로필은 `contentParam`을 갖는다(표시 전용, 판정 입력 아님). 그리고
 *   판정·매칭의 1차 대상(`primary`)은 `content`가 아니라 **도구 이름**이다
 * - **B-2** `content` 판독 실패는 `unknown`이 아니라 `memoryWrite` 유지 + 경고 + 플래그
 * - **B-3** 표시 위조 탐지는 `content`에 적용되고 자동 허용을 **무효화한다**
 * - **B-4** deny 규칙은 `primary`(=도구 이름)에 걸린다 — `remember`로 도구를 막을 수 있다
 * - **B-5** 오염 런의 `memoryWrite` 프롬프트는 **"허용해도 저장되지 않는다"를 사전 고지**한다
 *   (식별은 export된 `MEMORY_TAINT_REFUSAL_WARNING` 값으로 — 문면은 재량)
 *
 * 남은 미규정은 `[미규정 B-6]` 하나다(표시 상한 초과 content). 판정 기준은 그대로
 * *"원인 쪽이 미규정이어도 문서가 금지한 결과가 나오면 위반이다"*이다.
 *
 * 상세는 `plans/20260809-qa-b-t003-memory-gate-report.md`.
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
import { escapeInvisibles } from "../src/display.ts";
import { MEMORY_TAINT_REFUSAL_WARNING, TAINT_WARNING } from "../src/pipeline.ts";
import { asBlock, makePermissiveAllowlist, run } from "./contract-helpers.ts";
import { makeAllowlist, makePrompt, PROFILES } from "./helpers.ts";
import {
  CONTENT_PARAM,
  CUSTOM_CONTENT_PARAM,
  CUSTOM_MEMORY_TOOL_NAME,
  callGate,
  MEMORY_TOOL_NAME,
  MEMORY_WRITE_PROFILE,
  makeMemoryGate,
  makeRecordingClassifier,
  PROFILES_WITH_CUSTOM_MEMORY,
  requestOf,
  runMemory,
  subjectOf,
  ZWSP,
} from "./memory-write-helpers.ts";

/**
 * 인자 이름. **테스트가 이 이름을 아는 근거는 프로필**(`contentParam`)이지 게이트가
 * 아니다 — 게이트가 이 이름을 상수로 알면 §3 머리("게이트는 도구 구현을 모른다")가
 * 거짓이 되고, 그것을 가르는 것이 `CUSTOM_CONTENT_PARAM` 테스트다.
 */
const CONTENT_KEY = CONTENT_PARAM;

const PLAIN_CONTENT = "사용자는 답변을 한국어로 받길 원한다";

/** 항목 하나의 저장 요청 — 계약이 정한 유일한 인자 형태 */
function memoryArgs(content: unknown = PLAIN_CONTENT): Record<string, unknown> {
  return { [CONTENT_KEY]: content };
}

/**
 * 오염을 통해 프롬프트까지 밀어낸다.
 *
 * `memoryWrite`는 무오염·무플래그에서 자동 허용이므로(§2 계층 5), 프롬프트에 실리는
 * 값(`subject`·`display`·`warnings`·`allowAlwaysKey`)을 관측하려면 **계약이 인정한
 * 무효화 경로**를 타야 한다. 오염(계층 4b)이 그 경로이고, `memoryWrite`도 예외가
 * 아니라는 것이 계약이다(§2 계층 5 — "자동 허용에 예외를 만들지 않는다").
 */
async function promptViaTaint(
  args: unknown,
  response: "allow-once" | "allow-always" | "deny" = "allow-once",
) {
  const prompt = makePrompt({ response });
  const allowlist = makeAllowlist();
  const gate = makeMemoryGate({ prompt, allowlist });
  gate.noteToolResult({ source: "network" });
  const decision = await callGate(gate, MEMORY_TOOL_NAME, args);
  return { decision, prompt, allowlist };
}

// ---------------------------------------------------------------------------
// 계약 1 — 프로필 등록 시 subject는 `{ kind: "memoryWrite" }`이고 인자를 읽지 않는다
// ---------------------------------------------------------------------------

describe('계약 1 — subject는 `{ kind: "memoryWrite" }` 하나이고 인자를 읽지 않는다', () => {
  it("판정 대상은 '이 도구가 불렸다'는 사실 하나다 — 필드가 더 붙지 않는다", async () => {
    // §3: "판정 대상은 '이 도구가 불렸다'는 사실 하나다 — 인자를 읽지 않는다"
    const { prompt } = await promptViaTaint(memoryArgs());
    expect(subjectOf(prompt.last)).toEqual({ kind: "memoryWrite" });
  });

  it("인자에 `path`·`url`·`cwd`를 심어도 subject에 나타나지 않는다", async () => {
    // 다른 분류의 인자 이름을 그대로 넣어 본다. 게이트가 인자를 판정 축으로 삼는
    // 순간 이 도구는 파일/웹 분류로 새고, 경로로 환원되면 계층 0(denied)에 걸려
    // **항상 block**된다 — §3이 판정 오용이라 부른 바로 그 결과다.
    const { prompt } = await promptViaTaint({
      [CONTENT_KEY]: PLAIN_CONTENT,
      path: "/etc/passwd",
      url: "https://evil.example/x",
      cwd: "/",
      command: "rm -rf /",
    });
    expect(subjectOf(prompt.last)).toEqual({ kind: "memoryWrite" });
  });

  it("경로 판정기(classifier)에 아무것도 묻지 않는다 — `scope` 판정이 없다", async () => {
    // §3: "`scope` 판정도 없다. (…) 경로로 환원해 classifier에 물으면 계층 0에
    // 걸려 항상 block된다." 그래서 "물었는가"가 위반의 관측값이다.
    const classifier = makeRecordingClassifier();
    const verdict = await runMemory({ classifier }, MEMORY_TOOL_NAME, memoryArgs());
    expect(verdict.decision).toBe("allow");
    expect(classifier.seen).toEqual([]);
  });

  it("`contentParam`은 프로필에만 있고 subject로 새지 않는다 — 표시 전용이다", async () => {
    // §3(정정): "프로필은 `contentParam`을 갖는다 — **표시 전용이고 판정 입력이
    // 아니다**." 판정 표면과 표시 표면이 갈린다는 것이 계약이므로, 프로필에 필드가
    // 생겼다고 subject가 함께 넓어지면 그 분리가 무너진 것이다
    const { prompt } = await promptViaTaint(memoryArgs());
    const subject = subjectOf(prompt.last);
    expect(subject).toEqual({ kind: "memoryWrite" });
    expect(Object.keys(subject)).toEqual(["kind"]);
  });
});

// ---------------------------------------------------------------------------
// 계약 2 — 무오염·무플래그에서 자동 허용(`layer: "policy-matrix"`), 프롬프트 0회
// ---------------------------------------------------------------------------

describe("계약 2 — 무오염·무플래그에서 자동 허용", () => {
  it("`layer`는 `policy-matrix`다", async () => {
    // §2 계층 5: 자동 허용 대상은 둘 — 워크스페이스 안 파일 읽기와 `memoryWrite`
    const verdict = await runMemory({}, MEMORY_TOOL_NAME, memoryArgs());
    expect(verdict).toEqual({ decision: "allow", layer: "policy-matrix" });
  });

  it("프롬프트(`ApprovalPrompt.ask`)에 닿지 않는다 — 호출 0회", async () => {
    // 프롬프트를 `deny`로 세팅해 둔다: 닿기만 하면 판정이 block으로 뒤집히므로
    // "닿지 않았다"가 결과로도 드러난다
    const prompt = makePrompt({ response: "deny" });
    const verdict = await runMemory({ prompt }, MEMORY_TOOL_NAME, memoryArgs());
    expect(verdict).toEqual({ decision: "allow", layer: "policy-matrix" });
    expect(prompt.calls).toEqual([]);
  });

  it("계층 6(allowlist)에 도달조차 하지 않는다", async () => {
    // 무엇이든 학습됐다고 답하는 allowlist를 끼운다. 계층 6에 닿았다면 판정은
    // `layer: "allowlist"`로 나갔을 것이다 — 자동 허용이 계층 5에서 났음을
    // 계층 값과 조회 이력 양쪽으로 못박는다
    const allowlist = makePermissiveAllowlist();
    const verdict = await runMemory({ allowlist }, MEMORY_TOOL_NAME, memoryArgs());
    expect(verdict).toEqual({ decision: "allow", layer: "policy-matrix" });
    expect(allowlist.queried).toEqual([]);
  });

  it('`mode: "off"`에서는 계층 3에서 나간다 — 자동 허용보다 앞이라는 위치가 계약이다', async () => {
    // §2 계층 3. `memoryWrite`가 계층 5의 대상이 됐다고 해서 앞선 계층의 위치가
    // 흔들리지 않는다는 회귀 방지
    const verdict = await runMemory({ mode: "off" }, MEMORY_TOOL_NAME, memoryArgs());
    expect(verdict).toEqual({ decision: "allow", layer: "mode-off" });
  });
});

// ---------------------------------------------------------------------------
// 계약 3 — 오염 상태에서는 자동 허용이 무효가 되어 프롬프트로 간다 (이중 실행)
// ---------------------------------------------------------------------------

describe("계약 3 — 오염 상태에서 자동 허용 무효화 (이중 실행)", () => {
  /**
   * **이중 실행이 계약이다**(§2 계층 4b, 판정 C-6). 오염 상태는 게이트
   * 인스턴스(=`beforeToolCall`)에만 존재하고 그 경로는 `layer`를 떨구므로:
   *   (a) 무오염 `evaluate`로 계층을 직접 확인하고,
   *   (b) 오염 상태에서 훅으로 `{decision, reason}`과 프롬프트 도달을 확인한다.
   *
   * `evaluate`에 오염 인자를 더해 계층을 직접 관측하게 하는 안은 **기각된 판정**이다
   * — 테스트 편의를 위해 판정 함수의 표면을 넓히는 일이다. 그래서 이 파일 어디에도
   * `evaluate`에 오염을 넘기는 호출이 없다.
   */
  it("(a) 무오염에서는 `policy-matrix`, (b) 오염에서는 프롬프트에 닿는다", async () => {
    const args = memoryArgs();

    // (a) 무오염 — 계층을 직접 본다
    const clean = await runMemory(
      { prompt: makePrompt({ response: "deny" }) },
      MEMORY_TOOL_NAME,
      args,
    );
    expect(clean, "무오염 기준 계층").toEqual({ decision: "allow", layer: "policy-matrix" });

    // (b) 오염 — 훅으로 판정과 프롬프트 도달을 본다
    const { decision, prompt } = await promptViaTaint(args, "allow-once");
    expect(prompt.calls, "오염됐는데 프롬프트에 닿지 않았다 = 자동 허용이 살아 있다").toHaveLength(
      1,
    );
    expect(decision).toEqual({ decision: "allow" });
  });

  it("오염 프롬프트에서 사용자가 거부하면 block이고 사유가 모델에게 보인다", async () => {
    // §2 계층 7: deny는 `{ decision: "block", reason }`으로 모델에게 보인다
    // (침묵 거부 금지). 사유 **문면**은 구현 재량이라 문자열을 고정하지 않는다
    const { decision, prompt } = await promptViaTaint(memoryArgs(), "deny");
    expect(prompt.calls).toHaveLength(1);
    expect(decision.decision).toBe("block");
    const reason = (decision as { reason?: unknown }).reason;
    expect(typeof reason).toBe("string");
    expect(String(reason).length).toBeGreaterThan(0);
  });

  it("오염 경고가 프롬프트에 실린다 — 식별은 export된 `TAINT_WARNING`으로 한다", async () => {
    // §2 계층 4b(판정 C-9): 문면은 재량이되 게이트가 **안정된 식별 값**을 export
    // 한다. 그래서 검사도 문면이 아니라 그 값에 건다
    const { prompt } = await promptViaTaint(memoryArgs());
    expect(requestOf(prompt.last).warnings).toContain(TAINT_WARNING);
  });

  it("`memoryWrite`도 오염 앞에서 예외가 아니다 — 면제는 기각된 판정이다", async () => {
    // §2 계층 5: "자동 허용에 예외를 만들지 않는다. (…) 면제(4b를 `memoryWrite`에
    // 한해 끄는 것)는 여전히 기각이다 — 오염 방어가 **도구 한 곳**에만 남아 나중에
    // 그 검사가 사라지면 조용히 무방비가 된다"
    const { prompt } = await promptViaTaint(memoryArgs());
    expect(prompt.calls).toHaveLength(1);
    expect(subjectOf(prompt.last).kind).toBe("memoryWrite");
  });

  it('오염 런 프롬프트는 "허용해도 저장되지 않는다"를 **사전 고지**한다 (판정 B-5)', async () => {
    // §2 계층 5(2026-08-09 추가): "오염 런의 `memoryWrite` 프롬프트는 '허용해도
    // 저장되지 않는다'를 경고로 싣는다. (…) 사용자가 버튼을 누르는 시점에는 아직
    // 모른다, 그리고 가시성 원칙이 보호하려는 것은 바로 그 시점의 판단이다."
    //
    // 문면은 재량이므로 export된 안정 식별자에 검사를 건다(판정 C-9와 같은 근거)
    const { prompt } = await promptViaTaint(memoryArgs());
    const warnings = requestOf(prompt.last).warnings;
    expect(warnings).toContain(MEMORY_TAINT_REFUSAL_WARNING);
  });

  it("사전 고지는 오염 경고와 **별개의 값**이다 — 둘 다 실린다", async () => {
    // 두 경고는 다른 것을 말한다: 4b 경고는 "왜 다시 묻는가", 사전 고지는 "허용해도
    // 결과가 없다". 하나로 합치면 둘 중 하나가 사용자에게 전달되지 않는다
    expect(MEMORY_TAINT_REFUSAL_WARNING).not.toBe(TAINT_WARNING);
    const { prompt } = await promptViaTaint(memoryArgs());
    const warnings = requestOf(prompt.last).warnings;
    expect(warnings).toContain(TAINT_WARNING);
    expect(warnings).toContain(MEMORY_TAINT_REFUSAL_WARNING);
  });

  it("사전 고지는 `memoryWrite` 전용이다 — 다른 도구의 오염 프롬프트에는 없다", async () => {
    // 거부하는 것은 `remember`뿐이다(`MEMORY.md` §5). 다른 도구의 프롬프트에 이
    // 문장이 실리면 **거짓말**이 된다 — 그 허용은 실제로 이행된다
    const prompt = makePrompt({ response: "allow-once" });
    const gate = makeMemoryGate({ prompt });
    gate.noteToolResult({ source: "network" });
    await callGate(gate, "read_file", { path: "src/a.ts" });
    const warnings = requestOf(prompt.last).warnings;
    expect(warnings).toContain(TAINT_WARNING);
    expect(warnings).not.toContain(MEMORY_TAINT_REFUSAL_WARNING);
  });

  it("사전 고지는 **오염 때문에** 프롬프트로 갔을 때만 실린다", async () => {
    // 위조 흔적으로 프롬프트에 도달한 무오염 호출은 저장이 실제로 일어난다.
    // 여기에 "저장되지 않는다"를 실으면 승인 화면이 거짓말하는 것이고, 그것은
    // §4가 게이트 전체를 무의미하게 만든다고 한 바로 그 상태다
    const prompt = makePrompt({ response: "allow-once" });
    await runMemory({ prompt }, MEMORY_TOOL_NAME, memoryArgs(`메모${ZWSP}입니다`));
    const warnings = requestOf(prompt.last).warnings;
    expect(warnings).not.toContain(TAINT_WARNING);
    expect(warnings).not.toContain(MEMORY_TAINT_REFUSAL_WARNING);
  });
});

// ---------------------------------------------------------------------------
// 계약 4 — 위험 패턴은 `memoryWrite`에 해당 없음
// ---------------------------------------------------------------------------

describe('계약 4 — 위험 패턴 매칭 대상이 아니다 ("해당 없음"이 계약대로인가)', () => {
  /**
   * **재도출(2026-08-09).** 초판은 *"`memoryWrite`는 `appliesTo: command|path`
   * 어디에도 해당하지 않으므로 패턴 매칭 대상이 아니다"*라는 전제로 썼는데, 그 전제는
   * 실측과 달랐다 — 구현은 **셸이 아닌 모든 분류에 `"path"` 목록을 적용한다**.
   * 그래서 "해당 없음"이 성립하는 실제 근거는 `appliesTo`가 아니라 **매칭 대상
   * 텍스트**다.
   *
   * §3(2026-08-09 추가): *"판정·매칭의 1차 대상(`primary`)은 `content`가 아니라
   * **도구 이름**이다. (…) 위험 패턴이 산문에 걸린다 — `~/.ssh/id_rsa`를 **언급만
   * 한** 메모가 플래그된다. 크리덴셜 경로 패턴은 접촉하는 명령을 잡으라고 만든
   * 것이지 그것을 말하는 문장을 잡으라고 만든 것이 아니다."*
   *
   * 관측 가능한 결과는 셋이다:
   *   (1) 무오염에서 여전히 계층 5로 자동 허용된다
   *   (2) 프롬프트에 도달했을 때 `위험 패턴(...)` 경고가 붙지 않는다
   *   (3) content를 겨냥한 deny 규칙이 계층 2에서 차단하지 않는다
   */
  const CREDENTIAL_ISH = "배포 키는 ~/.ssh/id_rsa 에 있고 자격증명은 ~/.aws/credentials 다";
  const COMMAND_ISH = "정리할 때 sudo rm -rf /var/tmp/build 를 쓰면 된다고 사용자가 말했다";

  it("content에 크리덴셜 경로가 들어 있어도 자동 허용이 유지된다", async () => {
    // `credential-path` 패턴은 `appliesTo: "both"`라, content가 판정 대상 텍스트로
    // 새는 순간 플래그가 서고 자동 허용이 깨진다 — 그 누출을 결과로 잡는다
    const prompt = makePrompt({ response: "deny" });
    const verdict = await runMemory({ prompt }, MEMORY_TOOL_NAME, memoryArgs(CREDENTIAL_ISH));
    expect(verdict).toEqual({ decision: "allow", layer: "policy-matrix" });
    expect(prompt.calls).toEqual([]);
  });

  it("content에 위험한 셸 명령 문자열이 들어 있어도 자동 허용이 유지된다", async () => {
    const prompt = makePrompt({ response: "deny" });
    const verdict = await runMemory({ prompt }, MEMORY_TOOL_NAME, memoryArgs(COMMAND_ISH));
    expect(verdict).toEqual({ decision: "allow", layer: "policy-matrix" });
    expect(prompt.calls).toEqual([]);
  });

  it("프롬프트에 도달해도 `위험 패턴(...)` 경고는 붙지 않는다", async () => {
    // 오염으로 프롬프트까지 밀어낸 뒤 경고 목록을 본다. 오염 경고는 있어야 하고
    // 위험 패턴 경고는 없어야 한다 — 후자가 있으면 content가 패턴 매칭에 들어갔다는 뜻
    const { prompt } = await promptViaTaint(memoryArgs(CREDENTIAL_ISH));
    const warnings = requestOf(prompt.last).warnings;
    expect(warnings).toContain(TAINT_WARNING);
    expect(warnings.filter((w) => w.startsWith("위험 패턴("))).toEqual([]);
  });

  it("deny 규칙이 content 문자열로 `memoryWrite`를 차단하지 않는다", async () => {
    // §3: "사용자가 명령·경로를 겨냥해 쓴 `*.env*` 같은 규칙이 '`.env` 파일을
    // 선호한다'는 메모에 걸려 **계층 2에서 우회 불가로 차단**된다. 계층 2는 모드보다
    // 앞이라 `off`로도 안 풀린다." — 그래서 이것이 금지된 결과다
    for (const rule of ["**자격증명**", "**.env**", "**id_rsa**"]) {
      const verdict = await runMemory(
        { denyRules: [rule] },
        MEMORY_TOOL_NAME,
        memoryArgs(`${CREDENTIAL_ISH} 그리고 .env 파일을 선호한다`),
      );
      expect(verdict, `deny 규칙 "${rule}"이 메모 본문에 걸렸다`).toEqual({
        decision: "allow",
        layer: "policy-matrix",
      });
    }
  });

  it("deny 규칙은 **도구 이름**에 걸린다 — 사용자가 `remember`로 도구를 막을 수 있다 (판정 B-4)", async () => {
    // §3(2026-08-09): "부수 귀결(의도한 것): 사용자는 deny 규칙 `remember`로 메모리
    // 도구 자체를 막을 수 있다 — `unknown` 도구가 이미 그렇게 동작하고, 도구 단위
    // 금지는 사용자의 정당한 의사표시다."
    const verdict = await runMemory(
      { denyRules: [MEMORY_TOOL_NAME] },
      MEMORY_TOOL_NAME,
      memoryArgs(),
    );
    expect(asBlock(verdict).layer).toBe("deny-rule");
  });

  it('도구 이름 deny 규칙은 `mode: "off"`로도 풀리지 않는다 — 계층 2가 모드보다 앞이다', async () => {
    const verdict = await runMemory(
      { denyRules: [MEMORY_TOOL_NAME], mode: "off" },
      MEMORY_TOOL_NAME,
      memoryArgs(),
    );
    expect(asBlock(verdict).layer).toBe("deny-rule");
  });
});

// ---------------------------------------------------------------------------
// 계약 5 — `allowAlwaysKey`를 주지 않는다
// ---------------------------------------------------------------------------

describe("계약 5 — `allowAlwaysKey`가 없다", () => {
  it("프롬프트에 도달했을 때 `allowAlwaysKey`가 `undefined`다", async () => {
    // §3: "자동 허용 대상이라 학습할 것이 없고, 키를 주면 오염·위험 플래그로
    // 프롬프트에 도달했을 때의 '항상 허용'이 그 예외 상황을 영구 학습해 버린다"
    const { prompt } = await promptViaTaint(memoryArgs());
    expect(requestOf(prompt.last).allowAlwaysKey).toBeUndefined();
  });

  it("`allow-always`로 응답해도 allowlist가 자라지 않는다", async () => {
    // 키가 없으면 "항상 허용" 선택지 자체가 제공되지 않는다(§4). 그래도 응답이
    // 들어온 경우까지 결과로 못박는다 — 학습이 일어나면 그것이 위반이다
    const { allowlist } = await promptViaTaint(memoryArgs(), "allow-always");
    expect(allowlist.added).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 계약 6 — `display`가 저장될 내용을 보인다
// ---------------------------------------------------------------------------

describe("계약 6 — `display`가 저장될 내용을 보인다", () => {
  /**
   * §3: "`display`는 저장될 내용을 보여야 한다. 자동 허용이라 평소엔 프롬프트가
   * 뜨지 않지만, 플래그로 프롬프트에 도달했을 때 사용자가 **무엇이 저장되려는지**
   * 못 보면 그 승인은 §2 계층 4b가 만들려던 판단 기회가 아니다."
   *
   * **문구는 재량이고 내용이 보인다는 사실이 계약**이므로, 표시 형식·라벨·줄바꿈에
   * 결합하지 않고 "내용 문자열이 표시본 안에 있는가"만 본다.
   */
  it("저장될 content가 표시본 안에 나타난다", async () => {
    const { prompt } = await promptViaTaint(memoryArgs(PLAIN_CONTENT));
    expect(requestOf(prompt.last).display).toContain(PLAIN_CONTENT);
  });

  it("도구 이름도 함께 보인다 — 무엇이 판정됐는지 사용자가 안다", async () => {
    const { prompt } = await promptViaTaint(memoryArgs());
    expect(requestOf(prompt.last).display).toContain(MEMORY_TOOL_NAME);
  });

  it("어느 인자를 읽을지는 **프로필이 정한다** — 게이트는 인자 이름을 모른다 (판정 B-1)", async () => {
    // §3(정정): "프로필에 필드가 없으면 게이트는 `\"content\"`라는 **인자 이름을
    // 스스로 알아야** 하고, 그것은 '게이트는 도구 구현을 모른다'(§3 머리)를 정면으로
    // 깬다." — 그래서 프로필이 다른 이름을 주면 게이트가 **그 이름을** 읽어야 한다
    const body = "다른 이름으로 넘긴 메모 본문";
    const prompt = makePrompt({ response: "allow-once" });
    const gate = makeMemoryGate({ prompt, toolProfiles: { ...PROFILES_WITH_CUSTOM_MEMORY } });
    gate.noteToolResult({ source: "network" });
    await callGate(gate, CUSTOM_MEMORY_TOOL_NAME, {
      [CUSTOM_CONTENT_PARAM]: body,
      // 게이트가 `"content"`를 상수로 알고 있으면 이쪽이 표시되고 테스트가 깨진다
      content: "게이트가 상수로 알면 안 되는 값",
    });
    const display = requestOf(prompt.last).display;
    expect(display).toContain(body);
    expect(display).not.toContain("게이트가 상수로 알면 안 되는 값");
  });

  it("프로필이 가리키지 않은 인자는 표시되지 않는다 — 표시도 설정을 따른다", async () => {
    const { prompt } = await promptViaTaint({
      [CONTENT_KEY]: PLAIN_CONTENT,
      note: "프로필이 가리키지 않는 인자",
    });
    const display = requestOf(prompt.last).display;
    expect(display).toContain(PLAIN_CONTENT);
    expect(display).not.toContain("프로필이 가리키지 않는 인자");
  });

  it("표시 위조 탐지가 다른 분류와 동일하게 적용된다 — 비가시 문자가 이스케이프된다", async () => {
    // §3 마지막 불릿: "표시 위조 탐지(§4)는 다른 분류와 동일하게 적용된다 —
    // `content`는 모델이 제어하는 문자열이다."
    //
    // 이스케이프 **표기**는 게이트 자신이 export한 `escapeInvisibles`를 오라클로
    // 쓴다(문면에 결합하지 않기 위해). 원문 비가시 문자가 표시본에 그대로 남는
    // 것이 §4가 금지한 결과다 — 승인 화면이 거짓말하면 게이트 전체가 무의미하다
    const spoofed = `기억할 것${ZWSP}: 배포 비밀번호는 hunter2`;
    const { prompt } = await promptViaTaint(memoryArgs(spoofed));
    const request = requestOf(prompt.last);
    expect(request.display).not.toContain(ZWSP);
    expect(request.display).toContain(escapeInvisibles(spoofed));
  });

  it("비가시 문자가 있으면 위조 경고가 추가로 실린다", async () => {
    // §4: "비가시 문자·동형이의 문자를 탐지해 가시 표기로 이스케이프하고
    // `warnings`에 싣는다." 경고 **문면**은 사용자 언어이고 재량이므로 문자열에
    // 결합하지 않고, 같은 조건의 **대조군**(위조 없는 content)과 개수를 비교한다 —
    // 문면 무관하게 "위조 때문에 경고가 하나 더 생겼다"만 관측한다
    const control = await promptViaTaint(memoryArgs("메모입니다"));
    const spoofed = await promptViaTaint(memoryArgs(`메모${ZWSP}입니다`));
    expect(requestOf(control.prompt.last).warnings).toContain(TAINT_WARNING);
    expect(requestOf(spoofed.prompt.last).warnings.length).toBeGreaterThan(
      requestOf(control.prompt.last).warnings.length,
    );
  });
});

// ---------------------------------------------------------------------------
// 계약 8 — 미등록 도구는 여전히 `unknown` fail-closed (회귀 방지)
// ---------------------------------------------------------------------------

describe("계약 8 — 미등록 도구는 여전히 `unknown` fail-closed", () => {
  it("프로필에 없는 도구는 프롬프트로 가고 subject가 `unknown`이다", async () => {
    const prompt = makePrompt({ response: "deny" });
    const verdict = await runMemory({ prompt }, "totally_unregistered", memoryArgs());
    expect(asBlock(verdict).layer).toBe("prompt");
    expect(subjectOf(prompt.last)).toEqual({
      kind: "unknown",
      toolName: "totally_unregistered",
    });
  });

  it('`remember`를 등록하지 않으면 저장마다 프롬프트가 뜬다 — "등록하지 않는 것은 중립이 아니다"', async () => {
    // §2 계층 5의 근거를 결과로 못박는다. 이 테스트가 초록인 동안 "등록을 잊으면
    // 조용한 자동 허용"이 아니라 "매번 프롬프트"라는 fail-closed가 성립한다
    const prompt = makePrompt({ response: "allow-once" });
    const verdict = await run(
      { prompt, toolProfiles: { ...PROFILES } },
      MEMORY_TOOL_NAME,
      memoryArgs(),
    );
    expect(verdict).toEqual({ decision: "allow", layer: "prompt" });
    expect(subjectOf(prompt.last)).toEqual({ kind: "unknown", toolName: MEMORY_TOOL_NAME });
  });

  it("`memoryWrite` 등록이 다른 도구의 판정을 바꾸지 않는다", async () => {
    // 프로필 테이블에 항목 하나가 늘어난 것이 기존 분류에 새지 않는지
    const inside = await runMemory({}, "read_file", { path: "src/a.ts" });
    expect(inside).toEqual({ decision: "allow", layer: "policy-matrix" });

    const prompt = makePrompt({ response: "deny" });
    const write = await runMemory({ prompt }, "write_file", { path: "src/a.ts" });
    expect(asBlock(write).layer).toBe("prompt");
  });

  it("프로필 형태는 `{ kind, contentParam }`이다 — 표시 전용 필드 하나 (판정 B-1)", () => {
    // **재도출(2026-08-09).** 초판은 `toEqual({ kind: "memoryWrite" })`로 구 계약을
    // 굳혔고 주석에 "여기에 `contentParam`이 생기면 §3 개정이 먼저다"라고 조건을
    // 달아 뒀다 — 그 개정이 일어났다(§3 정정, 판정 B-1). 테이블은 설정 데이터라
    // 형태 자체가 계약이다
    expect(MEMORY_WRITE_PROFILE).toEqual({ kind: "memoryWrite", contentParam: CONTENT_PARAM });
  });
});

// ---------------------------------------------------------------------------
// 판정 B-2·B-3 — 개정으로 확정됐다 (더 이상 판정 중립이 아니다)
// ---------------------------------------------------------------------------

describe("판정 B-2 — `content` 판독 실패는 `unknown`이 아니라 `memoryWrite` + 경고 + 플래그", () => {
  /**
   * §3(2026-08-09 추가): *"`content`를 문자열로 읽지 못하면 `unknown`으로 떨어뜨리지
   * 않는다. 분류는 `memoryWrite`로 유지하고, **읽지 못했다는 사정을 `warnings`에
   * 싣고 플래그 처리**해 자동 허용을 무효화한다. `unknown`으로 보내지 않는 이유는
   * 불투명 origin에서와 **같다**: 그쪽 `display`가 '게이트 프로필에 등록되지
   * 않았다'는 **거짓 사유**를 보인다. (…) fail-closed는 지켜지되 그 통화가
   * **오분류가 아니라 마찰**이다."*
   */
  const UNREADABLE: readonly unknown[] = [42, null, undefined, { nested: "x" }, ["a"], true];

  it("분류가 `memoryWrite`로 유지된다 — `unknown`으로 떨어지지 않는다", async () => {
    for (const bad of UNREADABLE) {
      const prompt = makePrompt({ response: "allow-once" });
      await runMemory({ prompt }, MEMORY_TOOL_NAME, { [CONTENT_KEY]: bad });
      expect(subjectOf(prompt.last), `content=${JSON.stringify(bad)}`).toEqual({
        kind: "memoryWrite",
      });
    }
  });

  it("자동 허용이 무효화되어 프롬프트로 간다 — 조용히 허용하지 않는다", async () => {
    for (const bad of UNREADABLE) {
      const prompt = makePrompt({ response: "allow-once" });
      const verdict = await runMemory({ prompt }, MEMORY_TOOL_NAME, { [CONTENT_KEY]: bad });
      expect(verdict.layer, `content=${JSON.stringify(bad)}`).toBe("prompt");
      expect(prompt.calls).toHaveLength(1);
    }
  });

  it("읽지 못했다는 사정이 `warnings`에 실린다", async () => {
    // 문면은 사용자 언어이고 재량이므로, 정상 content일 때(무오염 = 프롬프트 없음)와
    // 비교하는 대신 "경고가 하나 이상 있다"로만 검사한다 — 이 경로는 경고가 유일한
    // 설명 수단이다
    const prompt = makePrompt({ response: "allow-once" });
    await runMemory({ prompt }, MEMORY_TOOL_NAME, { [CONTENT_KEY]: 42 });
    expect(requestOf(prompt.last).warnings.length).toBeGreaterThan(0);
  });

  it("인자 객체 자체가 없어도 같다 — `unknown`으로 새지 않는다", async () => {
    for (const args of [{}, undefined, null, "문자열", 7]) {
      const prompt = makePrompt({ response: "allow-once" });
      const verdict = await runMemory({ prompt }, MEMORY_TOOL_NAME, args);
      expect(subjectOf(prompt.last), `args=${JSON.stringify(args)}`).toEqual({
        kind: "memoryWrite",
      });
      expect(verdict.layer, `args=${JSON.stringify(args)}`).toBe("prompt");
    }
  });

  it("`display`가 거짓 사유를 보이지 않는다 — 미등록 도구 문면이 나오면 안 된다", async () => {
    // `unknown`으로 보냈다면 화면에 "게이트 프로필에 등록되지 않았다"가 뜬다.
    // 그 문면은 `unknown`의 것이므로, 같은 게이트에서 실제 미등록 도구를 돌려
    // 얻은 표시본과 **달라야** 한다 — 문자열을 고정하지 않고 대조로 검사한다
    const unknownPrompt = makePrompt({ response: "allow-once" });
    await runMemory({ prompt: unknownPrompt }, "totally_unregistered", memoryArgs());
    const unknownDisplay = requestOf(unknownPrompt.last).display;

    const prompt = makePrompt({ response: "allow-once" });
    await runMemory({ prompt }, MEMORY_TOOL_NAME, { [CONTENT_KEY]: 42 });
    const memoryDisplay = requestOf(prompt.last).display;

    const unknownBody = unknownDisplay.split("\n").slice(1).join("\n");
    expect(memoryDisplay).not.toContain(unknownBody);
  });

  it("판독 실패에도 `allowAlwaysKey`는 없다 — 플래그 경로에서 학습하지 않는다", async () => {
    const allowlist = makeAllowlist();
    const prompt = makePrompt({ response: "allow-always" });
    await runMemory({ prompt, allowlist }, MEMORY_TOOL_NAME, { [CONTENT_KEY]: 42 });
    expect(requestOf(prompt.last).allowAlwaysKey).toBeUndefined();
    expect(allowlist.added).toEqual([]);
  });
});

describe("판정 B-3 — 위조 흔적은 `content`에서 탐지되고 자동 허용을 무효화한다", () => {
  /**
   * §3(2026-08-09 추가): *"표시 위조 탐지는 `content`에 적용되고, 위조 흔적은 다른
   * 분류와 똑같이 자동 허용을 무효화한다. `content`는 모델이 제어하는 문자열이고,
   * **메모리는 이후 모든 세션의 시스템 프롬프트에 실린다** — 비가시 문자·동형이의
   * 문자가 들어간 문자열을 마찰 없이 영속시키는 것은 게이트가 막으려는 바로 그
   * 경로의 가장 오래 가는 형태다."*
   */
  it("비가시 문자가 섞인 content는 **오염 없이도** 프롬프트로 간다", async () => {
    const prompt = makePrompt({ response: "allow-once" });
    const verdict = await runMemory({ prompt }, MEMORY_TOOL_NAME, memoryArgs(`메모${ZWSP}입니다`));
    expect(verdict.layer).toBe("prompt");
    expect(prompt.calls).toHaveLength(1);
  });

  it("표시본이 위조를 드러낸다 — 원문 비가시 문자가 남지 않는다", async () => {
    const spoofed = `메모${ZWSP}입니다`;
    const prompt = makePrompt({ response: "allow-once" });
    await runMemory({ prompt }, MEMORY_TOOL_NAME, memoryArgs(spoofed));
    const display = requestOf(prompt.last).display;
    expect(display).not.toContain(ZWSP);
    expect(display).toContain(escapeInvisibles(spoofed));
  });

  it("위조 흔적이 있으면 `allowAlwaysKey`도 없다 — 영속 학습으로 새지 않는다", async () => {
    const allowlist = makeAllowlist();
    const prompt = makePrompt({ response: "allow-always" });
    await runMemory({ prompt, allowlist }, MEMORY_TOOL_NAME, memoryArgs(`메모${ZWSP}입니다`));
    expect(requestOf(prompt.last).allowAlwaysKey).toBeUndefined();
    expect(allowlist.added).toEqual([]);
  });

  it("위조가 없으면 자동 허용이 그대로다 — 무효화는 위조에만 붙는다", async () => {
    const prompt = makePrompt({ response: "deny" });
    const verdict = await runMemory({ prompt }, MEMORY_TOOL_NAME, memoryArgs("메모입니다"));
    expect(verdict).toEqual({ decision: "allow", layer: "policy-matrix" });
    expect(prompt.calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 미규정 — 판정 중립 테스트 (남은 것 1건)
// ---------------------------------------------------------------------------

describe("미규정 — 판정 중립", () => {
  it("[미규정 B-6] 표시 상한을 넘는 content의 자동 허용 여부", async () => {
    // 게이트는 메모리 예산(`MEMORY.md` §6의 항목 400자)을 모른다 — 예산은 도구
    // 소유다. 그래서 게이트가 보는 content는 표시 상한(4,096자)을 넘을 수 있다.
    //
    // 판정 B-3은 **비가시·동형이의 문자**를 위조 흔적으로 확정했지만, §3·§4 어디에도
    // **표시 잘림**이 위조 흔적인지에 대한 언급이 없다. 잘림은 사용자를 속이려는
    // 문자가 아니라 우리 상한의 결과다.
    //
    // **금지된 결과**: 잘렸는데 사용자에게 잘렸다는 사실이 안 보이는 것 —
    // 그러면 "저장될 내용을 보인다"(§3)가 거짓이 된다
    const long = "가".repeat(9000);
    const prompt = makePrompt({ response: "allow-once" });
    const verdict = await runMemory({ prompt }, MEMORY_TOOL_NAME, memoryArgs(long));
    if (prompt.calls.length === 0) {
      expect(verdict).toEqual({ decision: "allow", layer: "policy-matrix" });
    } else {
      const request = requestOf(prompt.last);
      const shownWhole = request.display.includes(long);
      expect(
        shownWhole || request.warnings.length > 0,
        "표시가 잘렸는데 잘렸다는 경고가 없다",
      ).toBe(true);
    }
  });

  // `[미규정 B-1~B-5]`는 2026-08-09 전량 판정되어 위쪽 확정 테스트로 옮겼다:
  //   B-1 → 계약 1(`contentParam`이 subject로 새지 않는다)·계약 6(프로필이 인자를 정한다)·계약 8(프로필 형태)
  //   B-2 → "판정 B-2" describe 블록
  //   B-3 → "판정 B-3" describe 블록
  //   B-4 → 계약 4(deny 규칙은 도구 이름에 걸린다 / content에는 안 걸린다)
  //   B-5 → 계약 3(사전 고지 4건)
});
