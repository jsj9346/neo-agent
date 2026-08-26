/**
 * T-009 — 메서드 표의 계약 검증. 정본은 `docs/WEB-UI.md` §11·§12·§6·§6.1·§3.2·§8이다.
 *
 * **기대값은 구현이 아니라 계약 문서에서만 도출했다.** 구현이 문서와 다르면 이 파일은
 * 문서 편에 선다.
 *
 *   - `WEB-UI.md` §11   — *"메서드 표에 없으면 거부이고, 등록을 빠뜨리면 열리는 것이 아니라
 *                         닫힌다"* · *"스코프가 전부 최고 권한으로 수렴한다"*
 *   - `WEB-UI.md` §12   — 최소 집합 다섯 · *"종료는 그 표에 오르지 않는다"* ·
 *                         *"이제 그 자리가 비어 있으면 잘린 앞부분에 도달할 경로가 아예 없다."*
 *   - `WEB-UI.md` §3.2  — *"서버를 내리는 메서드를 두지 않는다."*
 *   - `WEB-UI.md` §6    — *"요청 하나에 정확히 하나"* · *"모든 프레임 객체는 알려지지 않은
 *                         필드를 거부한다."*
 *   - `WEB-UI.md` §6.1  — *"생략된 앞부분은 §12의 메서드 표가 든 세션 조회가 준다."* ·
 *                         *"상한을 요청 파라미터로 받지 않는다."*
 *   - `WEB-UI.md` §8    — *"클라이언트 연결이 끊겨도 진행 중인 런은 계속된다."*
 *
 * **기본 거부 축은 대조군 없이는 공허하다.** 다섯이 통과한다는 단언은 표가 아무 이름이나
 * 받는 구현에서도 참이므로, 아래 축 2는 **표에서 항목을 하나씩 빼 보고** 그때마다 그 이름이
 * 닫히는지를 잰다. 그 역검증이 §11의 *"등록을 빠뜨리면 열리는 것이 아니라 닫힌다"*가 실제로
 * 서 있음을 보이는 유일한 수단이다.
 *
 * **이 파일이 재지 못하는 것을 적는다.** ① 종료 축이 재는 것은 **이름**뿐이다 — 표의 어느
 * 처리기가 프로세스를 내리는 코드를 부르는지는 여기서 안 보이고, §3.2의 그 판정이 실물에서
 * 서는 것은 종료의 개시자가 신호뿐이라는 배선 쪽에서 잰다. ② `session.history`의 원본이
 * 저장소인지 인메모리 트랜스크립트인지도 여기서 안 보인다 — 이 층이 받는 것은 포트이고
 * 무엇을 물릴지는 배선의 판정이다(§6.1이 저장소로 적었다). ③ 요청이 실제 HTTP로 오는 절반도
 * 밖이다. 적지 않으면 이 그린이 메서드 층 전체가 검증된 것으로 읽힌다(`ARCHITECTURE.md` §2.6).
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이고, 문서를 지목하는 자리는 절 번호와 필드 이름으로 한다.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AgentMessage, UserMessageInput } from "@neo-agent/core";
import { describe, expect, test } from "vitest";
import type { ApprovalAnswer, SettleResult } from "../src/approvals.ts";
import {
  APPROVAL_ALWAYS_UNAVAILABLE,
  APPROVAL_UNKNOWN,
  createDispatcher,
  createMethodTable,
  HANDLER_FAILED,
  INVALID_PARAMS,
  METHOD_NAMES,
  type MethodDeps,
  type MethodName,
  type MethodTable,
  RUN_ACTIVE,
  RUN_IDLE,
  takeTailWindow,
  takeWindowBefore,
  UNKNOWN_MESSAGE,
  UNKNOWN_METHOD,
} from "../src/methods.ts";
import { type RequestFrame, responseFrameSchema } from "../src/protocol.ts";

// ---------------------------------------------------------------------------
// 픽스처
// ---------------------------------------------------------------------------

const DOC = readFileSync(
  fileURLToPath(new URL("../../../docs/WEB-UI.md", import.meta.url)),
  "utf8",
);

const message = (index: number): AgentMessage => ({
  id: `m-${String(index)}`,
  role: "user",
  content: [{ type: "text", text: `메시지 ${String(index)}` }],
  timestamp: 1_700_000_000_000 + index,
});

const transcriptOf = (count: number): AgentMessage[] =>
  Array.from({ length: count }, (_, index) => message(index));

type Recorder = {
  readonly prompts: string[];
  readonly steers: UserMessageInput[];
  readonly aborts: (string | undefined)[];
  readonly settles: { id: string; answer: ApprovalAnswer }[];
  readonly runErrors: unknown[];
};

type StubOptions = {
  readonly transcript?: readonly AgentMessage[];
  readonly promptResult?: () => Promise<void>;
  readonly promptThrows?: Error;
  readonly steerThrows?: Error;
  readonly settleResult?: SettleResult;
  readonly readThrows?: Error;
};

const stub = (
  options: StubOptions = {},
): { readonly deps: MethodDeps; readonly seen: Recorder } => {
  const seen: Recorder = { prompts: [], steers: [], aborts: [], settles: [], runErrors: [] };
  const deps: MethodDeps = {
    run: {
      prompt: (text) => {
        seen.prompts.push(text);
        if (options.promptThrows) throw options.promptThrows;
        return options.promptResult ? options.promptResult() : Promise.resolve();
      },
      steer: (input) => {
        seen.steers.push(input);
        if (options.steerThrows) throw options.steerThrows;
      },
      abort: (reason) => {
        seen.aborts.push(reason);
      },
    },
    approvals: {
      settle: (id, answer) => {
        seen.settles.push({ id, answer });
        return (
          options.settleResult ?? {
            status: "settled",
            outcome: { decision: "allow", resolvedBy: "client" },
          }
        );
      },
    },
    transcript: {
      read: () => {
        if (options.readThrows) return Promise.reject(options.readThrows);
        return Promise.resolve(options.transcript ?? []);
      },
    },
    onRunError: (error) => {
      seen.runErrors.push(error);
    },
  };
  return { deps, seen };
};

const request = (method: string, params?: unknown): RequestFrame =>
  params === undefined
    ? { type: "req", id: "req-1", method }
    : { type: "req", id: "req-1", method, params };

/** 응답이 항상 프레임이라는 것을 모든 축이 함께 잰다(§6) */
const call = async (
  frame: RequestFrame,
  deps: MethodDeps,
  table?: MethodTable,
): Promise<ReturnType<typeof responseFrameSchema.parse>> => {
  const response = await createDispatcher(table ?? createMethodTable(deps))(frame);
  // 나가는 프레임을 스키마로 다시 잰다. 요청 id가 그대로 실렸는지도 아래에서 함께 본다.
  const parsed = responseFrameSchema.parse(response);
  expect(parsed.id).toBe(frame.id);
  return parsed;
};

const errorOf = (parsed: ReturnType<typeof responseFrameSchema.parse>): string => {
  if (parsed.ok) throw new Error(`거부를 기대했으나 성공했다 — ${JSON.stringify(parsed)}`);
  return parsed.error.code;
};

const payloadOf = (parsed: ReturnType<typeof responseFrameSchema.parse>): unknown => {
  if (!parsed.ok) throw new Error(`성공을 기대했으나 거부됐다 — ${JSON.stringify(parsed)}`);
  return parsed.payload;
};

// ---------------------------------------------------------------------------
// 축 1 — 표에 없으면 거부다 (§11)
// ---------------------------------------------------------------------------

describe("축 1 — 미분류 메서드 기본 거부 (§11)", () => {
  test("표에 없는 이름이 ok:false로 거부된다", async () => {
    const { deps } = stub();
    const parsed = await call(request("run.restart", { text: "안녕" }), deps);
    expect(errorOf(parsed)).toBe(UNKNOWN_METHOD);
  });

  test("빈 문자열·공백·대소문자만 다른 이름도 전부 거부다", async () => {
    const { deps } = stub();
    for (const name of ["", " ", "run.prompt ", "RUN.PROMPT", "run", "prompt"]) {
      const parsed = await call(request(name, { text: "안녕" }), deps);
      expect(errorOf(parsed), name).toBe(UNKNOWN_METHOD);
    }
  });

  test("상속 속성 이름이 처리기를 얻지 못한다", async () => {
    // 표가 평범한 객체이면 이 이름들이 조회에서 상속 속성을 맞혀, 표에 없는 이름이 처리기를
    // 얻는 상태가 된다. 그 형태는 §11의 기본 거부가 이름 하나에서만 뚫리는 자리다.
    const { deps } = stub();
    for (const name of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      const parsed = await call(request(name, {}), deps);
      expect(errorOf(parsed), name).toBe(UNKNOWN_METHOD);
    }
  });

  test("거부에도 응답은 정확히 하나이고 요청 id를 그대로 든다 (§6)", async () => {
    const { deps } = stub();
    const frame: RequestFrame = { type: "req", id: "상관-식별자-42", method: "없는.이름" };
    const parsed = await call(frame, deps);
    expect(parsed.id).toBe("상관-식별자-42");
    expect(errorOf(parsed)).toBe(UNKNOWN_METHOD);
  });
});

// ---------------------------------------------------------------------------
// 축 2 — 역검증. 표에서 빼면 닫힌다 (§11)
// ---------------------------------------------------------------------------

describe("축 2 — 등록을 빠뜨리면 닫힌다 (역검증 · §11)", () => {
  const validParams: Readonly<Record<MethodName, unknown>> = {
    "run.prompt": { text: "안녕" },
    "run.steer": { text: "이쪽으로" },
    "run.abort": {},
    "approval.settle": { id: "approval-1", answer: "deny" },
    "session.history": { before: "m-1" },
  };

  test("전체 표에서는 다섯이 전부 통과한다", async () => {
    for (const name of METHOD_NAMES) {
      const { deps } = stub({ transcript: transcriptOf(3) });
      const parsed = await call(request(name, validParams[name]), deps);
      expect(parsed.ok, name).toBe(true);
    }
  });

  test("항목 하나를 빼면 그 이름만 거부로 바뀐다", async () => {
    for (const removed of METHOD_NAMES) {
      const { deps } = stub({ transcript: transcriptOf(3) });
      const full = createMethodTable(deps);
      const reduced: MethodTable = new Map([...full].filter(([name]) => name !== removed));

      const denied = await call(request(removed, validParams[removed]), deps, reduced);
      expect(errorOf(denied), removed).toBe(UNKNOWN_METHOD);

      for (const other of METHOD_NAMES) {
        if (other === removed) continue;
        const parsed = await call(request(other, validParams[other]), deps, reduced);
        expect(parsed.ok, `${removed} 제거 후 ${other}`).toBe(true);
      }
    }
  });

  test("빈 표에서는 다섯 전부가 거부다", async () => {
    const { deps } = stub({ transcript: transcriptOf(3) });
    const empty: MethodTable = new Map();
    for (const name of METHOD_NAMES) {
      const parsed = await call(request(name, validParams[name]), deps, empty);
      expect(errorOf(parsed), name).toBe(UNKNOWN_METHOD);
    }
  });
});

// ---------------------------------------------------------------------------
// 축 3 — 종료가 표에 없다 (§3.2 · §12)
// ---------------------------------------------------------------------------

describe("축 3 — 종료를 뜻하는 이름이 0건이다 (§3.2)", () => {
  // 종료를 뜻할 법한 어휘. 넓게 잡는 방향이라 틀려도 위반을 안 늘린다.
  const SHUTDOWN_LEXICON = [
    "shutdown",
    "shut",
    "exit",
    "quit",
    "terminate",
    "kill",
    "halt",
    "stop",
    "close",
    "drain",
    "restart",
    "reboot",
    "poweroff",
  ];

  test("이름 목록에 종료 어휘가 0건이다", () => {
    const hits = METHOD_NAMES.filter((name) =>
      SHUTDOWN_LEXICON.some((word) => name.toLowerCase().includes(word)),
    );
    expect(hits).toEqual([]);
  });

  test("표의 키가 이름 목록과 정확히 같다", () => {
    // 목록에 없는 이름으로 처리기가 등록되면 위 축이 그것을 못 본다. 두 자리를 여기서 잇는다.
    const { deps } = stub();
    expect([...createMethodTable(deps).keys()].sort()).toEqual([...METHOD_NAMES].sort());
  });

  test("종료를 뜻하는 요청은 기본 거부에 걸린다", async () => {
    const { deps } = stub();
    for (const name of ["shutdown", "server.shutdown", "run.stop", "session.close"]) {
      const parsed = await call(request(name, {}), deps);
      expect(errorOf(parsed), name).toBe(UNKNOWN_METHOD);
    }
  });
});

// ---------------------------------------------------------------------------
// 축 4 — 세션 조회가 생략분을 준다 (§6.1 · §12)
// ---------------------------------------------------------------------------

describe("축 4 — 세션 조회가 잘린 앞부분을 준다 (§6.1)", () => {
  /**
   * 상한의 값을 단정하지 않는다(§12 — 값은 세부다). 잘린 창의 길이가 곧 그 상한이므로,
   * 이 함수는 그것을 **읽어서** 상한을 넘긴 트랜스크립트를 만들 뿐 어떤 수도 기대값으로
   * 쓰지 않는다. 상한이 바뀌어도 아래 축들은 그대로 선다.
   */
  const tailLimit = (): number => {
    let count = 8;
    for (;;) {
      const probe = takeTailWindow(transcriptOf(count));
      if (!probe.complete) return probe.messages.length;
      count *= 4;
      if (count > 100_000) throw new Error("상한을 넘기지 못했다 — 꼬리 N이 유한하지 않다.");
    }
  };

  const overflowing = (
    extra: number,
  ): { messages: AgentMessage[]; omitted: number; oldestHeld: string } => {
    const messages = transcriptOf(tailLimit() + extra);
    const window = takeTailWindow(messages);
    if (window.complete) throw new Error("상한을 넘겼는데 잘리지 않았다.");
    const oldest = window.messages[0];
    if (oldest === undefined) throw new Error("꼬리 창이 비었다.");
    return { messages, omitted: window.omitted, oldestHeld: oldest.id };
  };

  test("complete:false 스냅샷의 생략분을 실제로 돌려준다", async () => {
    // 생략분이 창 하나에 담기는 크기다 — 한 번의 조회로 전부 돌아와야 한다.
    const { messages, omitted, oldestHeld } = overflowing(5);
    const { deps } = stub({ transcript: messages });

    const parsed = await call(request("session.history", { before: oldestHeld }), deps);
    const payload = payloadOf(parsed) as { window: { messages: AgentMessage[] } };

    // 스냅샷이 생략했다고 말한 수와 조회가 실제로 돌려준 수가 같아야 한다. 갈리면 화면은
    // 앞부분을 다 봤다고 믿으면서 못 본 메시지를 남긴다.
    expect(payload.window.messages).toHaveLength(omitted);
    expect(payload.window.messages).toEqual(messages.slice(0, omitted));
  });

  test("끝까지 거슬러 올라가면 complete:true로 닫힌다", async () => {
    // 생략분이 창 하나에 안 담기는 크기다 — 같은 메서드를 여러 번 불러야 앞에 닿는다.
    const { messages, oldestHeld } = overflowing(tailLimit() * 2 + 3);
    const { deps } = stub({ transcript: messages });

    let cursor = oldestHeld;
    const collected: AgentMessage[] = [];
    for (let hop = 0; hop < 64; hop++) {
      const parsed = await call(request("session.history", { before: cursor }), deps);
      const payload = payloadOf(parsed) as {
        window:
          | { complete: true; messages: AgentMessage[] }
          | { complete: false; messages: AgentMessage[]; omitted: number };
      };
      collected.unshift(...payload.window.messages);
      if (payload.window.complete) {
        // 모아 놓은 것이 잘린 앞부분 전체다 — 도달할 경로가 실제로 존재한다.
        const held = messages.findIndex((entry) => entry.id === oldestHeld);
        expect(collected).toEqual(messages.slice(0, held));
        return;
      }
      const next = payload.window.messages[0];
      if (next === undefined) throw new Error("잘렸다면서 빈 창을 돌려줬다.");
      cursor = next.id;
    }
    throw new Error("64회 안에 앞부분에 도달하지 못했다.");
  });

  test("트랜스크립트에 없는 기준은 빈 창이 아니라 거부다", async () => {
    const { deps } = stub({ transcript: transcriptOf(5) });
    const parsed = await call(request("session.history", { before: "없는-id" }), deps);
    expect(errorOf(parsed)).toBe(UNKNOWN_MESSAGE);
  });

  test("맨 앞 메시지를 기준으로 주면 온전한 빈 창이다", async () => {
    const { deps } = stub({ transcript: transcriptOf(5) });
    const parsed = await call(request("session.history", { before: "m-0" }), deps);
    expect(payloadOf(parsed)).toEqual({ window: { complete: true, messages: [] } });
  });

  test("잘린 창에는 omitted가, 온전한 창에는 그 필드가 없다 (§6.1)", () => {
    const messages = transcriptOf(10);
    expect(takeTailWindow(messages, 10)).toEqual({ complete: true, messages });
    expect(takeTailWindow(messages, 4)).toEqual({
      complete: false,
      messages: messages.slice(6),
      omitted: 6,
    });
    const lookup = takeWindowBefore(messages, "m-9", 4);
    expect(lookup).toEqual({
      found: true,
      window: { complete: false, messages: messages.slice(5, 9), omitted: 5 },
    });
    expect(takeWindowBefore(messages, "없는-id", 4)).toEqual({ found: false });
  });

  test("상한을 요청 파라미터로 받지 않는다 (§6.1)", async () => {
    const { messages, omitted, oldestHeld } = overflowing(5);
    const { deps } = stub({ transcript: messages });
    // 상한을 실어 보내는 요청은 미지 필드라 파싱에서 죽는다 — 켜고 끄는 자리가 없다.
    const rejected = await call(request("session.history", { before: oldestHeld, limit: 1 }), deps);
    expect(errorOf(rejected)).toBe(INVALID_PARAMS);
    // 그리고 상한이 파라미터로 뚫리지 않았다는 것을 정상 요청의 결과가 다시 든다.
    const parsed = await call(request("session.history", { before: oldestHeld }), deps);
    const payload = payloadOf(parsed) as { window: { messages: AgentMessage[] } };
    expect(payload.window.messages).toHaveLength(omitted);
  });
});

// ---------------------------------------------------------------------------
// 축 5 — §12의 항이 실물 이름과 일치한다
// ---------------------------------------------------------------------------

describe("축 5 — 문서와 실물의 이름이 갈리지 않는다 (§12)", () => {
  const ITEM = (() => {
    const line = DOC.split("\n").find((entry) => entry.startsWith("- **메서드 표의 초기 목록**"));
    if (line === undefined) {
      throw new Error("WEB-UI.md §12에서 메서드 표 항을 찾지 못했다 — 개명됐거나 사라졌다.");
    }
    return line;
  })();

  /** 코드 표기 중 `a.b` 꼴만 이름 후보로 본다. 인자 이름은 점이 없어 걸리지 않는다 */
  const documented = new Set(
    [...ITEM.matchAll(/`([a-z]+\.[a-z]+)`/g)].map((match) => match[1] as string),
  );

  test("문서가 든 이름과 실물 표가 양방향으로 같다", () => {
    expect([...documented].sort()).toEqual([...METHOD_NAMES].sort());
  });

  test("문서 항이 최소 집합 다섯을 그대로 든다", () => {
    for (const word of ["프롬프트 제출", "중단", "개입", "승인 응답", "세션 조회"]) {
      expect(ITEM, word).toContain(word);
    }
  });

  test("문서 항이 종료가 오르지 않는다는 판정을 계속 든다 (§3.2)", () => {
    expect(ITEM).toContain("종료는 그 표에 오르지 않는다");
  });

  test("각 메서드의 인자 이름이 문서에 실재한다", () => {
    for (const argument of ["text", "reason", "id", "answer", "before"]) {
      expect(ITEM, argument).toContain(`\`${argument}\``);
    }
  });
});

// ---------------------------------------------------------------------------
// 축 6 — 최소 집합 다섯이 실제로 그 일을 한다 (§12 · §7 · §8)
// ---------------------------------------------------------------------------

describe("축 6 — 다섯이 각자의 일을 부른다", () => {
  test("프롬프트 제출이 런을 시작한다", async () => {
    const { deps, seen } = stub();
    const parsed = await call(request("run.prompt", { text: "첫 프롬프트" }), deps);
    expect(parsed.ok).toBe(true);
    expect(seen.prompts).toEqual(["첫 프롬프트"]);
  });

  test("프롬프트 제출이 런의 끝을 기다리지 않는다 (§8)", async () => {
    // 영원히 settle하지 않는 런. 응답이 그래도 돌아오지 않으면 요청 하나에 응답 하나라는
    // 계약이 런 시간만큼 늘어진다.
    const { deps, seen } = stub({ promptResult: () => new Promise<void>(() => undefined) });
    const parsed = await call(request("run.prompt", { text: "긴 런" }), deps);
    expect(parsed.ok).toBe(true);
    expect(seen.prompts).toEqual(["긴 런"]);
  });

  test("런이 실패하면 그 사실이 버려지지 않는다", async () => {
    const failure = new Error("모델 호출이 실패했다");
    const { deps, seen } = stub({ promptResult: () => Promise.reject(failure) });
    const parsed = await call(request("run.prompt", { text: "실패할 런" }), deps);
    expect(parsed.ok).toBe(true);
    // 거절이 처리되는 것은 마이크로태스크 뒤다.
    await Promise.resolve();
    await Promise.resolve();
    expect(seen.runErrors).toEqual([failure]);
  });

  test("이미 활성 런이 있으면 프롬프트가 거부된다", async () => {
    const { deps } = stub({ promptThrows: new Error("An agent run is already active.") });
    const parsed = await call(request("run.prompt", { text: "둘째 프롬프트" }), deps);
    expect(errorOf(parsed)).toBe(RUN_ACTIVE);
  });

  test("개입이 사용자 메시지로 전달된다", async () => {
    const { deps, seen } = stub();
    const parsed = await call(request("run.steer", { text: "이쪽으로" }), deps);
    expect(parsed.ok).toBe(true);
    expect(seen.steers).toEqual([{ role: "user", content: [{ type: "text", text: "이쪽으로" }] }]);
  });

  test("활성 런이 없으면 개입이 거부된다", async () => {
    const { deps } = stub({ steerThrows: new Error("No active run to steer.") });
    const parsed = await call(request("run.steer", { text: "이쪽으로" }), deps);
    expect(errorOf(parsed)).toBe(RUN_IDLE);
  });

  test("중단이 사유와 함께, 그리고 사유 없이 전달된다", async () => {
    const { deps, seen } = stub();
    expect((await call(request("run.abort", { reason: "사용자 취소" }), deps)).ok).toBe(true);
    expect((await call(request("run.abort", {}), deps)).ok).toBe(true);
    expect(seen.aborts).toEqual(["사용자 취소", undefined]);
  });

  test("승인 응답이 레지스트리로 간다 (§7)", async () => {
    const { deps, seen } = stub({
      settleResult: { status: "settled", outcome: { decision: "allow", resolvedBy: "client" } },
    });
    const parsed = await call(
      request("approval.settle", { id: "approval-3", answer: "allow-once" }),
      deps,
    );
    expect(payloadOf(parsed)).toEqual({ outcome: { decision: "allow", resolvedBy: "client" } });
    expect(seen.settles).toEqual([{ id: "approval-3", answer: "allow-once" }]);
  });

  test("대기 중이 아닌 승인은 거부로 답한다", async () => {
    const { deps } = stub({ settleResult: { status: "unknown" } });
    const parsed = await call(
      request("approval.settle", { id: "approval-9", answer: "deny" }),
      deps,
    );
    expect(errorOf(parsed)).toBe(APPROVAL_UNKNOWN);
  });

  test("제공하지 않은 항상 허용은 한 번 허용으로 낮춰지지 않는다", async () => {
    const { deps } = stub({ settleResult: { status: "always-unavailable" } });
    const parsed = await call(
      request("approval.settle", { id: "approval-4", answer: "allow-always" }),
      deps,
    );
    expect(errorOf(parsed)).toBe(APPROVAL_ALWAYS_UNAVAILABLE);
  });
});

// ---------------------------------------------------------------------------
// 축 7 — 인자 검증은 각 메서드가 진다 (§6)
// ---------------------------------------------------------------------------

describe("축 7 — 인자 위반이 조용히 통과하지 않는다 (§6)", () => {
  const violations: readonly (readonly [MethodName, unknown])[] = [
    ["run.prompt", undefined],
    ["run.prompt", {}],
    ["run.prompt", { text: "" }],
    ["run.prompt", { text: 42 }],
    ["run.prompt", { text: "안녕", 오탈자: 1 }],
    ["run.steer", { message: "안녕" }],
    ["run.abort", { reason: 7 }],
    ["run.abort", { resaon: "오탈자" }],
    ["approval.settle", { id: "approval-1" }],
    ["approval.settle", { id: "approval-1", answer: "allow" }],
    ["approval.settle", { id: "approval-1", answer: "deny", always: true }],
    ["session.history", {}],
    ["session.history", { before: 3 }],
  ];

  test("전부 invalid_params로 거부된다", async () => {
    for (const [name, params] of violations) {
      const { deps } = stub({ transcript: transcriptOf(3) });
      const parsed = await call(request(name, params), deps);
      expect(errorOf(parsed), `${name} ${JSON.stringify(params)}`).toBe(INVALID_PARAMS);
    }
  });

  test("인자 위반은 그 메서드의 부수 효과를 남기지 않는다", async () => {
    const { deps, seen } = stub({ transcript: transcriptOf(3) });
    const table = createMethodTable(deps);
    for (const [name, params] of violations) {
      await call(request(name, params), deps, table);
    }
    expect(seen.prompts).toEqual([]);
    expect(seen.steers).toEqual([]);
    expect(seen.aborts).toEqual([]);
    expect(seen.settles).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 축 8 — 디스패처가 던지지 않는다 (§6 · `ARCHITECTURE.md` §2.6)
// ---------------------------------------------------------------------------

describe("축 8 — 요청 하나에 응답이 반드시 하나다 (§6)", () => {
  test("처리기가 던져도 응답 프레임 하나로 나간다", async () => {
    const { deps } = stub({ readThrows: new Error("저장소를 읽지 못했다") });
    const parsed = await call(request("session.history", { before: "m-0" }), deps);
    expect(errorOf(parsed)).toBe(HANDLER_FAILED);
    if (parsed.ok) throw new Error("거부를 기대했다.");
    // 문면을 감추지 않는다 — 받는 쪽은 같은 기계의 브라우저 하나다(§4).
    expect(parsed.error.message).toContain("저장소를 읽지 못했다");
  });

  test("모든 오류 코드가 서로 다르다", () => {
    const codes = [
      UNKNOWN_METHOD,
      INVALID_PARAMS,
      RUN_ACTIVE,
      RUN_IDLE,
      APPROVAL_UNKNOWN,
      APPROVAL_ALWAYS_UNAVAILABLE,
      UNKNOWN_MESSAGE,
      HANDLER_FAILED,
    ];
    expect(new Set(codes).size).toBe(codes.length);
  });
});
