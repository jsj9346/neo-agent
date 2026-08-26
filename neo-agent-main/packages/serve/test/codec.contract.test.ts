/**
 * T-005 — 와이어 인코딩의 계약 검증. 정본은 `docs/WEB-UI.md` §2.1·§6·§6.1·§8이다.
 *
 * **기대값은 구현이 아니라 계약 문서에서만 도출했다.** 구현이 문서와 다르면 이 파일은
 * 문서 편에 선다.
 *
 *   - `WEB-UI.md` §2.1 — 전송이 SSE + POST다. 이 파일이 재는 바이트 형식의 근거이고,
 *                        그 형식이 `packages/serve` 밖으로 안 나가는 것은 §5 규칙 4다
 *   - `WEB-UI.md` §6   — *"`seq`는 두 푸시 프레임이 공유하는 하나의 카운터"*이고
 *                        *"연결마다 1부터 단조 증가한다"* · *"요청 하나에 정확히 하나"* ·
 *                        *"모든 프레임 객체는 알려지지 않은 필드를 거부한다."*
 *   - `WEB-UI.md` §6.1 — *"핸드셰이크는 `seq` 1이다."* · *"번호가 없는 푸시는 잃어도 표가
 *                        안 난다."*
 *   - `WEB-UI.md` §8   — *"이벤트를 재생하지 않는다."* · *"갭의 처리는 재접속이다."* ·
 *                        *"`Last-Event-ID` 요청 헤더를 읽지 않는다"*
 *
 * **단일 카운터 축은 대조군 없이는 공허하다.** 번호가 한 수열이라는 단언은 카운터를 프레임
 * 타입별로 가른 구현에서도 각 수열만 따로 보면 참이므로, 아래 축 1은 타입별 카운터가 냈을
 * 수열을 함께 계산해 그것과 갈리는 것까지 잰다.
 *
 * **이 파일이 재지 못하는 것을 적는다.** §8의 재접속 계약에는 HTTP 요청이 실제로 오는
 * 절반이 있다 — 브라우저가 재접속 헤더를 실어 보냈을 때 서버가 그것을 무시하고 새 스트림을
 * 처음부터 여는가. 이 층에는 요청도 서버도 없으므로 여기서 재는 것은 그 절반의 **선행
 * 조건** 셋뿐이다: 이어받을 번호를 넘길 자리가 없고, 인코더가 보낸 것을 안 들고 있고,
 * 헤더 이름이 코드에 안 나타난다. 요청 층의 단언은 서버와 스트림이 서는 자리의 몫이다.
 * 적지 않으면 이 그린이 재접속 전체가 검증된 것으로 읽힌다(`ARCHITECTURE.md` §2.6).
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이고, 문서를 지목하는 자리는 절 번호와 필드 이름으로 한다.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentEvent } from "@neo-agent/core";
import { describe, expect, test } from "vitest";
// 주석 토큰의 구간을 뽑는 술어의 정본이다(`DOC-CITATION.md` §6 U-b 2026-08-23 판정 —
// 렉서는 공유하고 판정은 복제한다). 아래 축 5가 재는 것은 판정이고, 렉싱은 여기서 받는다.
import { commentTokenSpans } from "../../../scripts/comment-lexer.mjs";
import {
  createPushEncoder,
  decodeRequest,
  INVALID_REQUEST,
  type UnsequencedPush,
} from "../src/codec.ts";
import {
  type ApprovalOutcome,
  type Frame,
  frameSchema,
  type PendingApproval,
  responseFrameSchema,
  type StateSnapshot,
} from "../src/protocol.ts";

// ---------------------------------------------------------------------------
// 픽스처
// ---------------------------------------------------------------------------

const SRC_DIR = fileURLToPath(new URL("../src/", import.meta.url));

/** 원문을 재는 축 둘이 이 값을 본다 — 서명의 매개변수 목록과 아래 축 5의 모집단이다 */
const CODEC_SOURCE = readFileSync(join(SRC_DIR, "codec.ts"), "utf8");

const snapshot: StateSnapshot = {
  sessionId: "s-1",
  transcript: { complete: true, messages: [] },
  pendingApprovals: [],
};

const approval: PendingApproval = {
  id: "ap-1",
  display: "shell: rm -rf /tmp/x",
  requestedAt: 1_700_000_000_000,
  expiresAt: 1_700_000_030_000,
};

const outcome: ApprovalOutcome = { decision: "deny", resolvedBy: "timeout" };

const started: AgentEvent = { type: "agent_start" };
const toolStarted: AgentEvent = {
  type: "tool_start",
  toolCallId: "tc-1",
  toolName: "shell",
  args: { command: "ls" },
};

/**
 * 한 연결이 실제로 내보내는 순서 그대로다 — 핸드셰이크가 먼저이고 그 뒤로 코어 이벤트와
 * 프로세스 상태가 섞인다. 섞이지 않으면 축 1이 재려는 것이 애초에 나타나지 않는다.
 */
const interleaved: readonly UnsequencedPush[] = [
  { type: "state", kind: "handshake", snapshot },
  { type: "event", event: started },
  { type: "state", kind: "approval_pending", approval },
  { type: "event", event: toolStarted },
  { type: "state", kind: "approval_settled", id: approval.id, outcome },
  { type: "state", kind: "shutdown" },
];

/**
 * SSE 이벤트 한 건을 되읽는다. 정본이 든 형식은 `id: <seq>\ndata: <json>\n\n`이고, 이
 * 정규식이 그 형식 전부를 잰다 — 점이 개행에 안 걸리므로 `data:`가 한 줄이라는 것까지
 * 같은 자리에서 재진다.
 *
 * **되읽기가 실패하면 던진다.** 형식이 어긋난 바이트를 조용히 건너뛰면 아래 단언들이
 * 빈 배열 위에서 전부 그린이 된다(`ARCHITECTURE.md` §2.6 가시적 결과).
 */
const readSse = (chunk: string): { readonly id: number; readonly frame: Frame } => {
  const match = /^id: (\d+)\ndata: (.*)\n\n$/.exec(chunk);
  if (match === null) throw new Error(`SSE 형식이 아니다: ${JSON.stringify(chunk)}`);
  const [, id, data] = match;
  return { id: Number(id), frame: frameSchema.parse(JSON.parse(data ?? "")) };
};

/** 푸시 프레임만 `seq`를 든다. 되읽은 프레임에서 그 값을 꺼내는 자리 하나 */
const seqOf = (frame: Frame): number => {
  if (frame.type !== "event" && frame.type !== "state")
    throw new Error(`푸시 프레임이 아니다: ${frame.type}`);
  return frame.seq;
};

// ---------------------------------------------------------------------------
// 축 1 — `seq`는 두 푸시가 공유하는 하나의 카운터다 (§6·§6.1)
// ---------------------------------------------------------------------------

describe("WEB-UI §6.1 — 카운터는 하나다", () => {
  test("event와 state를 섞어 내보내면 seq가 한 수열이다", () => {
    const encoder = createPushEncoder();
    const frames = interleaved.map((push) => readSse(encoder.encode(push)).frame);

    expect(frames.length, "모집단이 비면 아래가 공허하다").toBe(interleaved.length);
    expect(frames.map(seqOf)).toEqual([1, 2, 3, 4, 5, 6]);

    // 섞이지 않았으면 이 축은 아무것도 안 잰다. 두 푸시 타입이 실제로 함께 왔는지 짚는다.
    const kinds = new Set(frames.map((frame) => frame.type));
    expect([...kinds].sort()).toEqual(["event", "state"]);
  });

  test("대조군 — 타입별로 가른 카운터가 낼 수열과 갈린다", () => {
    // 이 짝이 없으면 위 단언은 카운터가 둘인 구현에서도 각 수열이 따로 1부터 단조라는
    // 이유로 통과할 수 있다. 근거는 §6.1이 그 형태를 금한 이유다 — 카운터를 가르면 순서가 도착
    // 순서로만 존재하고, 도착 순서는 전송이 주는 성질이라 §2.1의 전송 무지가 거기서 샌다.
    const perType = { event: 0, state: 0 };
    const split = interleaved.map((push) => ++perType[push.type]);
    expect(split).toEqual([1, 1, 2, 2, 3, 4]);

    const encoder = createPushEncoder();
    const observed = interleaved.map((push) => seqOf(readSse(encoder.encode(push)).frame));
    expect(observed).not.toEqual(split);
  });

  test("핸드셰이크가 첫 푸시이고 그 seq가 1이다", () => {
    const encoder = createPushEncoder();
    const first = readSse(encoder.encode({ type: "state", kind: "handshake", snapshot })).frame;

    expect(first.type).toBe("state");
    expect(first.type === "state" ? first.kind : undefined).toBe("handshake");
    expect(seqOf(first)).toBe(1);
  });

  test("첫 발급은 갈래를 묻지 않고 1이다", () => {
    // 카운터가 갈래를 보기 시작하면 위 축이 핸드셰이크에서만 참이 된다. 첫 푸시가 무엇이든
    // 1이어야 한 카운터다.
    for (const push of interleaved)
      expect(seqOf(readSse(createPushEncoder().encode(push)).frame), `${push.type}`).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 축 2 — SSE 바이트 형식 (§2.1)
// ---------------------------------------------------------------------------

describe("WEB-UI §2.1 — SSE 이벤트의 바이트", () => {
  test("id 줄의 수와 프레임의 seq가 같다", () => {
    const encoder = createPushEncoder();
    for (const push of interleaved) {
      const read = readSse(encoder.encode(push));
      expect(read.id, "id 줄과 프레임이 다른 번호를 든다").toBe(seqOf(read.frame));
    }
  });

  test("내보낸 바이트가 다시 프레임으로 파싱된다", () => {
    // 인코더의 산출이 §6의 프레임 셋 밖으로 나가지 않는다는 것을 런타임 층이 잰다.
    // `readSse`가 이미 `frameSchema`를 통과시키므로 여기서는 실을 값을 그대로 되찾는지 본다.
    const encoder = createPushEncoder();
    const settled = readSse(
      encoder.encode({ type: "state", kind: "approval_settled", id: approval.id, outcome }),
    ).frame;
    expect(settled).toEqual({
      type: "state",
      seq: 1,
      kind: "approval_settled",
      id: approval.id,
      outcome,
    });
  });

  test("개행을 담은 값도 data 줄을 안 끊는다", () => {
    // JSON 문자열 이스케이프가 이 형식의 전제다. 전제가 깨지면 `readSse`가 던진다.
    const display = "line-1\nline-2\n\n";
    const read = readSse(
      createPushEncoder().encode({
        type: "state",
        kind: "approval_pending",
        approval: { ...approval, display },
      }),
    );
    const frame = read.frame;
    expect(
      frame.type === "state" && frame.kind === "approval_pending" ? frame.approval.display : "",
    ).toBe(display);
  });
});

// ---------------------------------------------------------------------------
// 축 3 — 재접속은 재생이 아니다 (§8)
// ---------------------------------------------------------------------------

describe("WEB-UI §8 — 이어받을 자리가 없다", () => {
  test("인코더 생성이 인자를 안 받는다", () => {
    // 이어받을 번호를 넘길 자리가 있으면 재생이 표현 가능해진다. 서명 자체가 그 자리를
    // 안 여는 것이 이 계약의 기계 판이다.
    //
    // **런타임 서명만으로는 못 잰다**(2026-08-25 역검증으로 실측). `Function.length`는
    // 기본값이 붙은 매개변수를 안 세므로 이어받을 번호를 기본값으로 받는 형태가 그대로
    // 통과했다 — 그래서 선언의 매개변수 목록을 원문에서 함께 잰다. 이 텍스트 축이 못 잡는
    // 것은 선언이 다른 형태로 옮겨 가는 경우이고, 그때는 정규식이 못 찾아 던진다.
    expect(createPushEncoder).toHaveLength(0);

    const declaration = /export const createPushEncoder = \(([^)]*)\)/.exec(CODEC_SOURCE);
    if (declaration === null)
      throw new Error("생성 함수 선언을 못 찾았다 — 자리가 바뀌었으면 이 검사를 먼저 고친다");
    expect(declaration[1], "생성 함수가 매개변수를 든다").toBe("");
  });

  test("새 연결의 인코더는 1부터 시작하고 이전 연결과 독립이다", () => {
    const first = createPushEncoder();
    for (const push of interleaved.slice(0, 3)) first.encode(push);

    // 재접속 — `Last-Event-ID`를 실어 보냈든 아니든 새 연결이 받는 첫 번호는 1이다.
    const reconnected = createPushEncoder();
    expect(
      seqOf(readSse(reconnected.encode({ type: "state", kind: "handshake", snapshot })).frame),
    ).toBe(1);

    // 앞 연결은 자기 수열을 이어 간다 — 카운터가 프로세스 전역이면 위 값이 4였을 것이다.
    expect(seqOf(readSse(first.encode({ type: "event", event: started })).frame)).toBe(4);
  });

  test("인코더가 재생에 쓸 표면을 안 든다", () => {
    // 보낸 것을 들고 있으면 그것을 다시 내보내는 경로가 언젠가 생긴다. 표면이 하나뿐인
    // 것이 그 경로를 만들 수 없게 한다.
    expect(Object.keys(createPushEncoder())).toEqual(["encode"]);
  });

  test("Last-Event-ID를 읽는 코드가 src에 0건이고 안 읽는다는 기록은 1건이다", () => {
    // 근거는 §8이다 — SSE가 그 자리에 재생 기제를 마련해 두었으므로 안 쓰는 것이 곧 계약이고
    // 그래서 기록이 남아야 한다. 실물 Node에서 헤더 이름은 소문자로 오므로 대조는
    // 대소문자를 안 가린다.
    //
    // **이 검사가 못 잡는 것을 적는다**(§2.3의 규율): 이름을 변수로 조립해 읽는 형태
    // (`"last" + "-event-id"`)와 헤더 객체를 통째로 순회하는 형태는 텍스트에 안 나타나므로
    // 여기서 안 걸린다. 이 축이 재는 것은 문자열이 코드에 있는가 하나다.
    const files = readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" }).filter((name) =>
      name.endsWith(".ts"),
    );
    expect(files.length, "모집단이 비면 이 축이 공허하다").toBeGreaterThan(0);

    const inComment: string[] = [];
    const inCode: string[] = [];
    for (const name of files) {
      const text = readFileSync(join(SRC_DIR, name), "utf8");
      const spans = commentTokenSpans(text);
      for (const match of text.matchAll(/last-event-id/gi)) {
        const at = match.index;
        const place = `${name}:${at}`;
        if (spans.some((span) => span.pos <= at && at < span.end)) inComment.push(place);
        else inCode.push(place);
      }
    }

    expect(inCode, `읽는 코드 ${inCode.length}건`).toEqual([]);
    expect(inComment, "안 읽는다는 기록이 없다").toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 축 4 — POST 디코더 (§6)
// ---------------------------------------------------------------------------

describe("WEB-UI §6 — 요청 본문의 디코딩", () => {
  test("적합한 본문이 RequestFrame으로 나온다", () => {
    const result = decodeRequest('{"type":"req","id":"r-1","method":"prompt.submit"}');
    expect(result.ok).toBe(true);
    expect(result.ok ? result.frame : undefined).toEqual({
      type: "req",
      id: "r-1",
      method: "prompt.submit",
    });
  });

  test("params는 열린 필드라 형태를 안 묻는다", () => {
    // §6이 그 검증을 각 메서드에 맡겼다. 여기서 좁히면 메서드 표가 자랄 때마다 이 층이
    // 함께 자란다.
    const params = { text: "안녕", nested: [1, { deep: true }] };
    const result = decodeRequest(
      JSON.stringify({ type: "req", id: "r-2", method: "prompt.submit", params }),
    );
    expect(result.ok ? result.frame.params : undefined).toEqual(params);
  });

  test("알려지지 않은 필드가 거부된다", () => {
    const result = decodeRequest(
      '{"type":"req","id":"r-3","method":"prompt.submit","metohd":"오타"}',
    );
    expect(result.ok, "오탈자 필드가 조용히 무시됐다").toBe(false);
  });

  test("실패가 ok:false 응답 프레임으로 나온다", () => {
    const result = decodeRequest('{"type":"req","id":"r-4"}');
    expect(result.ok).toBe(false);
    if (result.ok) return;

    // 응답이 §6의 프레임 셋 안이라는 것을 런타임 층이 잰다 — 부르는 쪽이 그대로 돌려보내면
    // 왕복이 닫힌다.
    expect(responseFrameSchema.safeParse(result.response).success).toBe(true);
    expect(result.response.error.code).toBe(INVALID_REQUEST);
    expect(result.response.error.message.length, "사유가 비었다").toBeGreaterThan(0);
    expect(Object.keys(result.response).sort()).toEqual(["error", "id", "ok", "type"]);
  });

  test("실패해도 보낸 id를 짝지어 돌려준다", () => {
    const result = decodeRequest('{"type":"req","id":"r-5","method":42}');
    expect(result.ok ? undefined : result.response.id).toBe("r-5");
  });

  test("JSON이 아니면 던지지 않고 실패 값으로 나온다", () => {
    for (const body of ["", "{", "req", '{"type":"req",}']) {
      const result = decodeRequest(body);
      expect(result.ok, `${JSON.stringify(body)}가 통과했다`).toBe(false);
      expect(result.ok ? undefined : result.response.id, "짝지을 수단이 없다").toBe("");
    }
  });

  test("객체가 아닌 JSON도 실패다", () => {
    for (const body of ["null", "42", '"req"', "[]"]) {
      const result = decodeRequest(body);
      expect(result.ok, `${body}가 통과했다`).toBe(false);
      expect(result.ok ? undefined : result.response.id).toBe("");
    }
  });
});
