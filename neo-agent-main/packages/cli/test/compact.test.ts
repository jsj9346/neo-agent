/**
 * 압축 오케스트레이션 단위 테스트 — `docs/COMPACTION.md` §3·§6·§7.
 *
 * 컨트롤러를 직접 몰아서 본다(전체 조립을 태우지 않는다). 관심사는 **CLI가 소유한
 * 것**뿐이다: 판정을 언제 건너뛰는가, 무엇을 보이는가, 실패·취소를 어떻게 세는가.
 * 판정 규칙 자체(`shouldCompact`)와 cut 규칙(`planCompaction`)은 compaction 패키지의
 * 테스트가 본다 — 여기서 다시 검증하면 같은 계약이 두 곳에 살게 된다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import type {
  AgentMessage,
  AssistantMessage,
  ModelClient,
  ModelRequest,
  ModelStreamEvent,
  UserMessage,
} from "@neo-agent/core";
import type { SessionBranch, StoredSession } from "@neo-agent/store";
import { describe, expect, it } from "vitest";
import {
  type CompactionSettings,
  createCompactionController,
  SUMMARY_MAX_TOKENS,
} from "../src/compact.ts";
import { stripAnsi } from "./integration-harness.ts";

const WINDOW = 200_000;

const DEFAULT_SETTINGS: CompactionSettings = {
  compactionAuto: true,
  compactionThreshold: 0.75,
  compactionKeepRecentTurns: 2,
};

let messageSeq = 0;

function user(text: string): UserMessage {
  messageSeq += 1;
  return {
    id: `u${messageSeq}`,
    role: "user",
    content: [{ type: "text", text }],
    timestamp: 1_000 + messageSeq,
  };
}

/** `tokens`가 그 응답이 본 컨텍스트 전부다 — `measureContextTokens`의 합산 대상 */
function assistant(text: string, tokens: number): AssistantMessage {
  messageSeq += 1;
  return {
    id: `a${messageSeq}`,
    role: "assistant",
    content: [{ type: "text", text }],
    stopReason: "end_turn",
    usage: { input: tokens, cacheRead: 0, cacheWrite: 0, output: 0 },
    timestamp: 1_000 + messageSeq,
  };
}

/**
 * user 턴 4개짜리 트랜스크립트. 마지막 어시스턴트의 usage가 `tokens`다.
 *
 * user 턴이 유지 기준(2)보다 많아야 `planCompaction`이 `plan`을 낸다 — 그보다 적으면
 * `not-possible`이고, 그 경로는 따로 본다.
 */
function transcript(tokens: number): AgentMessage[] {
  return [
    user("첫 질문"),
    assistant("첫 답", Math.floor(tokens / 2)),
    user("둘째 질문"),
    assistant("둘째 답", Math.floor(tokens / 2)),
    user("셋째 질문"),
    assistant("셋째 답", Math.floor(tokens / 2)),
    user("넷째 질문"),
    assistant("넷째 답", tokens),
  ];
}

function session(overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    id: "parent-0000-1111-2222",
    title: "테스트 대화",
    workspaceRoot: "/tmp/ws",
    systemPrompt: "SP",
    model: "test-model",
    createdAt: 1,
    updatedAt: 2,
    parentSessionId: null,
    ...overrides,
  };
}

/** 요약 한 번을 돌려주거나, 대본이 정한 방식으로 실패하는 최소 클라이언트 */
class SummaryModel implements ModelClient {
  readonly modelId = "test-model";
  readonly requests: ModelRequest[] = [];
  /** 매 호출의 결말. 소진되면 마지막 것을 반복한다 */
  #script: ("ok" | "error" | "abort")[];

  constructor(script: ("ok" | "error" | "abort")[] = ["ok"]) {
    this.#script = [...script];
  }

  get callCount(): number {
    return this.requests.length;
  }

  async *stream(request: ModelRequest, _signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
    this.requests.push(request);
    const outcome = this.#script.length > 1 ? this.#script.shift() : this.#script[0];
    const usage = { input: 10, cacheRead: 0, cacheWrite: 0, output: 5 };

    if (outcome === "abort") {
      // 실제 어댑터가 취소를 인코딩하는 형태 그대로 — throw하지 않는다(코어 §8).
      yield {
        type: "done",
        message: {
          role: "assistant",
          content: [],
          stopReason: "aborted",
          usage,
          timestamp: Date.now(),
        },
      };
      return;
    }

    if (outcome === "error") {
      yield {
        type: "done",
        message: {
          role: "assistant",
          content: [],
          stopReason: "error",
          errorMessage: "프로바이더가 500을 돌려줬다",
          usage,
          timestamp: Date.now(),
        },
      };
      return;
    }

    yield {
      type: "done",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "## Goal\n요약문이다." }],
        stopReason: "end_turn",
        usage,
        timestamp: Date.now(),
      },
    };
  }
}

interface Rig {
  output: string;
  branches: { parentId: string; branch: SessionBranch }[];
  switched: { session: StoredSession; messages: readonly AgentMessage[] }[];
  model: SummaryModel;
  /** `withCompaction`이 넘긴 signal — Ctrl+C 통로의 관측 지점 */
  signals: AbortSignal[];
}

function createRig(options: {
  settings?: Partial<CompactionSettings>;
  messages?: AgentMessage[];
  session?: StoredSession;
  script?: ("ok" | "error" | "abort")[];
  /** 압축 구간에 진입하면 즉시 취소한다 — Ctrl+C의 모사 */
  cancelOnEnter?: boolean;
}) {
  const chunks: string[] = [];
  const branches: Rig["branches"] = [];
  const switched: Rig["switched"] = [];
  const signals: AbortSignal[] = [];
  const model = new SummaryModel(options.script ?? ["ok"]);

  let current = options.session ?? session();
  let messages = options.messages ?? transcript(160_000);

  const controller = createCompactionController({
    settings: { ...DEFAULT_SETTINGS, ...options.settings },
    contextWindowTokens: WINDOW,
    client: model,
    store: {
      branchSession(parentId, branch): StoredSession {
        branches.push({ parentId, branch });
        return session({ id: `child-${branches.length}`, parentSessionId: parentId });
      },
    },
    systemPrompt: "SP",
    model: "test-model",
    notify: (text) => chunks.push(`${text}\n`),
    withCompaction: async (run) => {
      const abort = new AbortController();
      signals.push(abort.signal);
      if (options.cancelOnEnter) abort.abort();
      return await run(abort.signal);
    },
    runtime: {
      session: () => current,
      messages: () => messages,
      switchTo: async (next, nextMessages) => {
        switched.push({ session: next, messages: nextMessages });
        current = next;
        messages = [...nextMessages];
      },
    },
  });

  return {
    controller,
    branches,
    switched,
    model,
    signals,
    /**
     * 압축 뒤에 대화가 더 진행된 상태를 만든다.
     *
     * 분기 직후의 트랜스크립트는 `[요약, ...최근 K턴]`이라 요약할 구간이 남지 않아
     * 곧바로 `not-possible`이다(§3 "분기 직후의 오판은 구조적으로 무해하다"). 두 번째
     * 압축을 보려면 그 사이에 대화가 자라야 한다 — 실사용의 순서이기도 하다.
     */
    setMessages(next: AgentMessage[]): void {
      messages = next;
    },
    get output(): string {
      return stripAnsi(chunks.join(""));
    },
  };
}

describe("자동 트리거 판정 (COMPACTION §3)", () => {
  it("임계 미달이면 모델을 부르지 않는다", async () => {
    // 0.75 × 200_000 = 150_000. 100_000은 미달이다.
    const rig = createRig({ messages: transcript(100_000) });
    await rig.controller.auto();

    expect(rig.model.callCount).toBe(0);
    expect(rig.branches).toHaveLength(0);
    expect(rig.output).toBe("");
  });

  it("임계 초과면 압축한다", async () => {
    const rig = createRig({ messages: transcript(160_000) });
    await rig.controller.auto();

    expect(rig.model.callCount).toBe(1);
    expect(rig.branches).toHaveLength(1);
  });

  it("compactionAuto가 false면 임계를 넘어도 아무 일도 없다", async () => {
    // 근거: §3 표의 키가 "자동 압축 트리거"를 끄는 스위치다. 수동은 여전히 열려 있다.
    const rig = createRig({
      settings: { compactionAuto: false },
      messages: transcript(190_000),
    });
    await rig.controller.auto();

    expect(rig.model.callCount).toBe(0);

    await rig.controller.manual();
    expect(rig.model.callCount).toBe(1);
  });

  it("수동은 임계 미달이어도 실행한다", async () => {
    // 근거: §3 "`/compact`는 같은 경로의 수동 발동이다(임계 미달이어도 실행)"
    const rig = createRig({ messages: transcript(1_000) });
    await rig.controller.manual();

    expect(rig.model.callCount).toBe(1);
    expect(rig.branches).toHaveLength(1);
  });
});

describe("분기 실행과 표시 의무 (COMPACTION §6)", () => {
  it("요약을 자식의 첫 메시지로, 유지 구간을 id 그대로 넘긴다", async () => {
    const messages = transcript(160_000);
    const rig = createRig({ messages });
    await rig.controller.auto();

    const [first] = rig.branches;
    expect(first).toBeDefined();
    if (!first) return;

    expect(first.parentId).toBe("parent-0000-1111-2222");
    expect(first.branch.summaryMessage.role).toBe("user");
    expect(first.branch.summaryMessage.content).toEqual([
      { type: "text", text: "## Goal\n요약문이다." },
    ]);

    // cut은 뒤에서 2번째 user 경계 — 마지막 두 user 턴과 그 사이가 원문 유지다.
    const keptIds = first.branch.keptMessages.map((message) => message.id);
    expect(keptIds).toEqual(messages.slice(-4).map((message) => message.id));

    // 새 Agent의 트랜스크립트는 [요약, ...kept]다(§6 3단계)
    const [handoff] = rig.switched;
    expect(handoff?.session.id).toBe("child-1");
    expect(handoff?.messages[0]).toBe(first.branch.summaryMessage);
    expect(handoff?.messages).toHaveLength(first.branch.keptMessages.length + 1);
  });

  it("표시 4요소가 전부 나온다 — 발생 사실·before 토큰·유지 범위·새 세션 id", async () => {
    // 근거: §6 "표시 의무: 압축이 일어났다는 사실, before 컨텍스트 토큰,
    //       유지 범위(최근 K턴), 새 세션 id. 자동이든 수동이든 같다"
    const rig = createRig({ messages: transcript(160_000) });
    await rig.controller.auto();

    const output = rig.output;
    expect(output).toContain("압축 완료");
    expect(output).toContain("160,000");
    expect(output).toContain("최근 2턴");
    expect(output).toContain("child-1");
  });

  it("진행 표시가 요약 호출 전에 나간다", async () => {
    // 근거: §6 "압축 중에는 진행 표시를 하고 입력을 받지 않는다"
    const rig = createRig({ messages: transcript(160_000) });
    await rig.controller.auto();

    const output = rig.output;
    expect(output).toContain("압축 중");
    expect(output.indexOf("압축 중")).toBeLessThan(output.indexOf("압축 완료"));
  });

  it("요약 요청은 도구 없이, 배선 상수의 maxTokens로 나간다", async () => {
    const rig = createRig({ messages: transcript(160_000) });
    await rig.controller.auto();

    const [request] = rig.model.requests;
    expect(request?.tools).toEqual([]);
    expect(request?.maxTokens).toBe(SUMMARY_MAX_TOKENS);
  });

  it("부모가 있는 세션은 hasPreviousSummary로 전달된다", async () => {
    // 근거: §2 "부모가 있는 세션의 첫 메시지가 요약이다 — 마커 문자열이 없다".
    // 관측 가능한 형태: 첫 메시지(이전 요약)가 요약 대상에서 빠지고 previousSummary로
    // 프롬프트에 실린다.
    const messages = transcript(160_000);
    const rig = createRig({
      messages,
      session: session({ parentSessionId: "grandparent" }),
    });
    await rig.controller.auto();

    const body = rig.model.requests[0]?.messages[0];
    const text =
      body?.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("") ?? "";
    expect(text).toContain("<previous-summary>");
    expect(text).toContain("첫 질문");
  });
});

describe("실패 처리와 자동 중지 (COMPACTION §7)", () => {
  it("요약 실패는 경고만 남기고 대화를 건드리지 않는다", async () => {
    const rig = createRig({ messages: transcript(160_000), script: ["error"] });
    await rig.controller.auto();

    expect(rig.branches).toHaveLength(0);
    expect(rig.switched).toHaveLength(0);
    expect(rig.output).toContain("압축에 실패했다");
    expect(rig.output).toContain("대화는 그대로다");
  });

  it("자동이 연속 2회 실패하면 중지하고 대안을 1회만 안내한다", async () => {
    // 근거: §7 "자동 압축이 연속 2회 실패하거나 not-possible로 판정되면 그 프로세스
    //       에서 자동 트리거를 중지하고 사유와 대안을 1회 안내한다"
    const rig = createRig({ messages: transcript(160_000), script: ["error"] });

    await rig.controller.auto();
    expect(rig.output).not.toContain("자동 압축을 중지한다");

    await rig.controller.auto();
    expect(rig.output).toContain("자동 압축을 중지한다");
    expect(rig.output).toContain("/compact");
    expect(rig.output).toContain("/new");

    // 세 번째 auto는 조용하다 — 모델도 부르지 않고 안내도 반복하지 않는다
    const callsBefore = rig.model.callCount;
    await rig.controller.auto();
    expect(rig.model.callCount).toBe(callsBefore);
    expect(rig.output.match(/자동 압축을 중지한다/g)).toHaveLength(1);
  });

  it("not-possible 자동 판정은 즉시 자동을 중지한다", async () => {
    // user 턴이 유지 기준(2) 이하 — 요약할 구간이 없다.
    const rig = createRig({
      messages: [user("하나뿐인 질문"), assistant("답", 160_000)],
    });
    await rig.controller.auto();

    expect(rig.model.callCount).toBe(0);
    expect(rig.output).toContain("자동 압축을 중지한다");
  });

  it("not-possible 수동 판정은 사유만 보이고 자동을 끄지 않는다", async () => {
    const rig = createRig({
      messages: [user("하나뿐인 질문"), assistant("답", 160_000)],
    });
    await rig.controller.manual();

    expect(rig.output).toContain("압축할 수 없다");
    expect(rig.output).not.toContain("자동 압축을 중지한다");
  });

  it("수동 성공은 자동을 재개시킨다", async () => {
    // 근거: §7 "수동 /compact는 항상 시도할 수 있고, 성공하면 자동이 재개된다"
    const rig = createRig({ messages: transcript(160_000), script: ["error", "error", "ok"] });

    await rig.controller.auto();
    await rig.controller.auto();
    expect(rig.output).toContain("자동 압축을 중지한다");

    // 중지 상태에서도 수동은 시도된다
    await rig.controller.manual();
    expect(rig.branches).toHaveLength(1);

    // 재개 확인 — 대화가 더 자란 뒤의 자동이 다시 모델을 부른다
    rig.setMessages(transcript(160_000));
    const callsBefore = rig.model.callCount;
    await rig.controller.auto();
    expect(rig.model.callCount).toBeGreaterThan(callsBefore);
  });

  it("분기 직후의 자동 판정은 모델을 부르지 않고 끝난다", async () => {
    // 근거: §3 "분기 직후의 오판은 구조적으로 무해하다 — 계획 단계에서 요약할 구간이
    //       비어 '압축 불가'로 판정되고 모델 호출 없이 끝난다"
    const rig = createRig({ messages: transcript(160_000) });
    await rig.controller.manual();

    const callsBefore = rig.model.callCount;
    await rig.controller.auto();
    expect(rig.model.callCount).toBe(callsBefore);
  });
});

describe("취소 (COMPACTION §6·A-1)", () => {
  it("취소는 구 세션을 유지하고 가시적으로 끝난다", async () => {
    const rig = createRig({ messages: transcript(160_000), script: ["abort"] });
    await rig.controller.auto();

    expect(rig.branches).toHaveLength(0);
    expect(rig.switched).toHaveLength(0);
    expect(rig.output).toContain("압축을 취소했다");
    expect(rig.output).not.toContain("압축에 실패했다");
  });

  it("취소는 연속 실패 카운트에 들어가지 않는다 (A-1)", async () => {
    // 근거: A-1 — 두 번 취소했다고 자동 압축이 꺼지면 사용자가 하지 않은 설정
    //       변경이 일어난다.
    const rig = createRig({ messages: transcript(160_000), script: ["abort"] });

    await rig.controller.auto();
    await rig.controller.auto();
    await rig.controller.auto();

    expect(rig.output).not.toContain("자동 압축을 중지한다");
    expect(rig.model.callCount).toBe(3);
  });

  it("요약 성공 뒤 분기 전에 도착한 취소도 취소다", async () => {
    // 되돌릴 수 있는 마지막 자리 — 분기는 한 트랜잭션이라 시작하면 지점이 없다.
    const rig = createRig({ messages: transcript(160_000), cancelOnEnter: true });
    await rig.controller.auto();

    expect(rig.model.callCount).toBe(1);
    expect(rig.branches).toHaveLength(0);
    expect(rig.output).toContain("압축을 취소했다");
  });

  it("압축 구간에 signal이 주어진다 — Ctrl+C의 통로", async () => {
    const rig = createRig({ messages: transcript(160_000) });
    await rig.controller.auto();

    expect(rig.signals).toHaveLength(1);
  });
});

describe("컨트롤러가 세션 교체를 따라간다", () => {
  it("두 번째 압축은 첫 압축의 자식에서 분기한다", async () => {
    // 세션을 값이 아니라 함수로 받는 이유 — 값이면 두 번째가 낡은 부모를 가리키고,
    // 저장소는 superseded 부모에서의 재분기를 거부한다(SESSION-STORE §5).
    const rig = createRig({ messages: transcript(160_000) });

    await rig.controller.manual();
    expect(rig.branches[0]?.parentId).toBe("parent-0000-1111-2222");

    // 압축 뒤로 대화가 더 진행됐다 — 그래야 요약할 구간이 다시 생긴다
    rig.setMessages(transcript(160_000));
    await rig.controller.manual();
    expect(rig.branches[1]?.parentId).toBe("child-1");
  });
});

describe("주입 형태", () => {
  it("설정 3키가 그대로 판정에 쓰인다", async () => {
    // keepRecentTurns를 3으로 올리면 유지 구간이 넓어진다(cut이 앞으로 당겨진다).
    const messages = transcript(160_000);
    const rig = createRig({
      messages,
      settings: { compactionKeepRecentTurns: 3 },
    });
    await rig.controller.manual();

    expect(rig.branches[0]?.branch.keptMessages.map((m) => m.id)).toEqual(
      messages.slice(-6).map((m) => m.id),
    );
    expect(rig.output).toContain("최근 3턴");
  });

  it("threshold를 낮추면 더 이른 시점에 트리거된다", async () => {
    const low = createRig({
      messages: transcript(100_000),
      settings: { compactionThreshold: 0.4 },
    });
    await low.controller.auto();
    expect(low.model.callCount).toBe(1);

    const high = createRig({ messages: transcript(100_000) });
    await high.controller.auto();
    expect(high.model.callCount).toBe(0);
  });
});

describe("표시의 정직성", () => {
  it("before 토큰을 잴 수 없으면 0으로 적지 않는다", async () => {
    // 유효 어시스턴트 usage가 없는 트랜스크립트 — 0은 "컨텍스트가 비어 있었다"는
    // 다른 사실이다(§3의 "유효 usage가 없으면" 경로).
    const rig = createRig({
      messages: [user("하나"), user("둘"), user("셋"), user("넷")],
    });
    await rig.controller.manual();

    expect(rig.branches).toHaveLength(1);
    expect(rig.output).toContain("측정 불가");
    expect(rig.output).not.toMatch(/압축 전\s+0 토큰/);
  });
});

describe("정리", () => {
  it("사용한 메시지 시퀀스가 테스트 간 충돌하지 않는다", () => {
    // id 중복은 `branchSession`이 거부하는 조건이다(store E-26) — 픽스처가 그 조건을
    // 우연히 만들지 않는지 확인한다.
    const a = transcript(1);
    const b = transcript(1);
    const ids = new Set([...a, ...b].map((message) => message.id));
    expect(ids.size).toBe(a.length + b.length);
  });
});
