/**
 * 독립 QA — `docs/WEB-UI.md` **§8.1 계약 ⑤**(「판정이 착지보다 앞이다」 항 전체 — 접수표 여섯
 * 행과 「계약의 형태」)를 대상 둘에 건다. 곁따라 같은 문서 **§9.6 「기각한 갈래」**의
 * *"배선이 «읽혔으면 급수한다»를 스스로 판정한다"* 행이 절반 ②의 근거로 선다.
 *
 * | 절반 | 대상 | 수단 |
 * |---|---|---|
 * | ① 순수 층의 접수 판정 | `packages/serve/client/protocol.js` | 실행 |
 * | ② 배선의 급수 순서 | `packages/serve/client/stream.js` | 소스 텍스트 정적 스캔 |
 *
 * **기대값은 정본에서만 나왔다.** 구현이 자기 주석에 적어 둔 근거·표·도출은 판정 재료로 쓰지
 * 않았다 — 구현이 «이렇게 도니 이것이 맞다»고 적은 것을 그대로 받으면 그것은 검증이 아니다.
 * 절반 ①의 여섯 행은 **정본 원문을 런타임에 파싱해서** 기대값을 만든다(축 A-2·A-3): 표가
 * 움직이거나 실물이 움직이면 한쪽만으로 붉는다.
 *
 * ## 이 파일이 안 하는 것
 *
 * - **`src/`·`client/`를 고치지 않는다.** 고칠 자리를 찾으면 코드가 아니라 보고로 간다.
 * - **다른 테스트 파일을 안 고친다.** `qa-20260828-webui96-wiring.independent.test.ts`는 수단의
 *   선례로 읽기만 했다(주석·문자열을 걷는 추출기와 본문 잘라내기).
 * - **`stream.js`를 모듈로 임포트하지 않는다.** 임포트하면 `EventSource` 전역이 필요해진다 —
 *   그 파일을 실행으로 재는 것은 브라우저 축의 일이고 이 사이클 범위 밖이다.
 * - **새 의존성 0.** node 환경 · `node:fs`와 vitest만 쓴다.
 *
 * ## 못 재는 것 — 명시로 적는다 (§2.3)
 *
 * 1. **절반 ②는 텍스트다.** §9.3이 그 부류를 거부하며 든 문면이 그대로 걸린다 —
 *    *"텍스트 스캔은 변수 경유·주석 우회를 물려받아 막는다고 주장하면서 못 막는 상태를 새로
 *    만든다"*. 변수 경유(`const h = handlers; h.onEvent(…)`)와 간접 호출은 이 축이 못 잡고,
 *    그 구멍을 축 B-14가 **역검증으로 실증**한다(잡히지 않는다는 것을 단언으로 못박는다).
 * 2. **계약 ⑤의 배선 절반을 실행으로 재는 것은 이 파일이 아니다.** §8.1이 *"①~③·⑤는 순수
 *    함수의 성질이라 유닛 축이 잰다. ④·⑥은 배선의 것이라 못 잰다"*로 순수/배선을 갈랐고,
 *    ⑤의 **순서**는 그 갈림의 경계에 산다 — 순수 층은 자기가 언제 불렸는지 모르므로 절반 ①이
 *    아무리 그린이어도 급수가 앞인 배치를 못 잡는다. 그 자리의 첫 실행 검증은 실브라우저다.
 * 3. **절반 ②는 `receive` 한 함수만 본다.** 전송의 다른 콜백이 화면에 직접 급수하는 배치는
 *    이 축의 모집단 밖이다.
 * 4. **접수 ✗ 자리에 서는 «사유»의 문면을 안 잰다.** 정본이 *"버리는 것이 아니다."*로 그 자리를
 *    채웠는지는 화면의 성질이고, §9가 화면을 외부에 맡겼다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로 있는
 * 부분 문자열이고, 문서를 지목하는 자리는 절 번호와 계약 번호로 한다.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import type { FrameVerdict, StreamFault, StreamState } from "../client/protocol.js";
import { applySignal, frameVerdict, INITIAL_STREAM_STATE, readFrame } from "../client/protocol.js";
import type { Frame, PendingApproval, StateSnapshot } from "../src/protocol.ts";

/* -------------------------------------------------------------------------- *
 * 원문 읽기 — 기대값의 원천
 * -------------------------------------------------------------------------- */

const REPO = new URL("../../../", import.meta.url);
const readRepo = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, REPO)), "utf8");

const WEB_UI = readRepo("docs/WEB-UI.md");
const CLIENT_STREAM = readRepo("packages/serve/client/stream.js");

/* ========================================================================== *
 * 절반 ① — 순수 층의 접수 판정 (§8.1 계약 ⑤ · 접수표 여섯 행)
 *
 * 읽은 것은 export 이름과 시그니처뿐이고, 값과 분기 조건은 정본에서 도출했다.
 * ========================================================================== */

/** 접수표 한 행 — 정본 원문에서 파싱한다 */
type AcceptanceRow = { readonly frame: string; readonly accepted: boolean };

/**
 * §8.1 「판정이 착지보다 앞이다」 항의 접수표를 원문에서 읽는다.
 *
 * **손으로 옮겨 적지 않는 것이 이 축의 값이다.** 옮겨 적으면 표가 개정될 때 사본이 조용히
 * 낡고, 그 순간 이 파일은 정본이 아니라 자기 사본을 재게 된다.
 */
const parseAcceptanceTable = (markdown: string): readonly AcceptanceRow[] => {
  const at = markdown.indexOf("#### 판정이 착지보다 앞이다");
  if (at < 0) throw new Error("§8.1의 「판정이 착지보다 앞이다」 항을 못 찾았다.");
  const next = markdown.indexOf("\n#### ", at + 1);
  const section = markdown.slice(at, next < 0 ? undefined : next);
  const header = section.indexOf("| 프레임 | 접수 |");
  if (header < 0) throw new Error("접수표의 머리를 못 찾았다 — 표의 열이 바뀌었다.");

  const rows: AcceptanceRow[] = [];
  for (const line of section.slice(header).split("\n")) {
    if (!line.startsWith("|")) break;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    const frame = cells[0] ?? "";
    const mark = cells[1] ?? "";
    if (frame === "프레임" || /^-+$/.test(frame)) continue;
    if (mark !== "○" && mark !== "✗") {
      throw new Error(`접수 칸이 ○/✗가 아니다 — ${line}`);
    }
    rows.push({ frame, accepted: mark === "○" });
  }
  return rows;
};

const ACCEPTANCE_TABLE = parseAcceptanceTable(WEB_UI);

/* -------------------------------------------------------------------------- *
 * 사례 — 와이어 줄과 접기 전 상태. 형태의 출처는 `src/protocol.ts`의 타입이다
 * -------------------------------------------------------------------------- */

const SNAPSHOT: StateSnapshot = {
  sessionId: "qa-session",
  transcript: { complete: true, messages: [] },
  pendingApprovals: [],
  safety: { approvalMode: "manual", sandbox: "on" },
};

const APPROVAL: PendingApproval = {
  id: "a-1",
  display: "qa",
  requestedAt: 1,
  expiresAt: 2,
};

const eventAt = (seq: number): Frame => ({
  type: "event",
  seq,
  event: { type: "agent_start" },
});
const handshakeAt = (seq: number): Frame => ({
  type: "state",
  seq,
  kind: "handshake",
  snapshot: SNAPSHOT,
});
const shutdownAt = (seq: number): Frame => ({ type: "state", seq, kind: "shutdown" });
const pendingAt = (seq: number): Frame => ({
  type: "state",
  seq,
  kind: "approval_pending",
  approval: APPROVAL,
});
const REQ: Frame = { type: "req", id: "q-1", method: "run.prompt" };
const RES: Frame = { type: "res", id: "q-1", ok: true };

const wire = (frame: Frame): string => JSON.stringify(frame);

const LIVE: StreamState = { phase: "live", lastSeq: 3 };
const ENDED: StreamState = { phase: "ended", lastSeq: 3 };
const GAP: StreamState = { phase: "gap", lastSeq: 3, expected: 4, received: 6 };
const MALFORMED: StreamFault = { kind: "malformed_json" };
const BROKEN: StreamState = { phase: "broken", lastSeq: 3, fault: MALFORMED };

type Case = { readonly label: string; readonly before: StreamState; readonly line: string };

/**
 * 접수표의 행마다 사례를 든다. **키는 정본 표의 행 이름 그대로**이고, 축 A-2가 그 집합을
 * 원문과 양방향으로 대조한다 — 행이 늘면 미충족, 없는 행을 쓰면 초과다.
 *
 * 넷째 행의 사례는 §8.1이 결함으로 든 부류를 이름으로 훑는다 — *"못 읽는 JSON, 모르는
 * 판별자, 형태가 틀린 번호, 뒤로 가는 번호, 순서가 틀린 핸드셰이크"*에 §8.1이 계약 ⑤ 문단에서
 * 따로 든 *"핸드셰이크가 아닌 첫 푸시"*를 더한 여섯이다. **그 부류가 이 계약의 존재 이유다** —
 * *"읽히기는 하는데 결함인"* 프레임이 배선의 좁은 판정 사이로 빠져나가는 자리다.
 */
const CASES: Readonly<Record<string, readonly Case[]>> = {
  "수열에 이어진 푸시": [
    { label: "event", before: LIVE, line: wire(eventAt(4)) },
    { label: "state(approval_pending)", before: LIVE, line: wire(pendingAt(4)) },
    { label: "첫 푸시인 핸드셰이크", before: INITIAL_STREAM_STATE, line: wire(handshakeAt(1)) },
  ],
  "종료 고지": [{ label: "shutdown", before: LIVE, line: wire(shutdownAt(4)) }],
  "푸시가 아닌 프레임": [
    { label: "req", before: LIVE, line: wire(REQ) },
    { label: "res", before: LIVE, line: wire(RES) },
  ],
  "못 읽은 줄 · 결함으로 판정된 프레임": [
    { label: "못 읽는 JSON", before: LIVE, line: "{" },
    { label: "객체가 아니다", before: LIVE, line: "[]" },
    { label: "모르는 판별자(type)", before: LIVE, line: '{"type":"qa_unknown"}' },
    {
      label: "모르는 판별자(state kind)",
      before: LIVE,
      line: '{"type":"state","seq":4,"kind":"qa_unknown"}',
    },
    {
      label: "형태가 틀린 번호",
      before: LIVE,
      line: '{"type":"event","seq":"4","event":{"type":"agent_start"}}',
    },
    { label: "뒤로 가는 번호", before: LIVE, line: wire(eventAt(3)) },
    { label: "순서가 틀린 핸드셰이크", before: LIVE, line: wire(handshakeAt(4)) },
    {
      label: "핸드셰이크가 아닌 첫 푸시",
      before: INITIAL_STREAM_STATE,
      line: wire(eventAt(1)),
    },
  ],
  "갭을 낸 프레임": [
    { label: "건너뛴 번호(event)", before: LIVE, line: wire(eventAt(6)) },
    { label: "건너뛴 번호(state)", before: LIVE, line: wire(pendingAt(9)) },
  ],
  "종단·갭인 채로 온 프레임": [
    { label: "ended", before: ENDED, line: wire(eventAt(4)) },
    { label: "broken", before: BROKEN, line: wire(eventAt(4)) },
    { label: "gap", before: GAP, line: wire(eventAt(4)) },
  ],
};

const verdictOf = (before: StreamState, line: string): FrameVerdict =>
  frameVerdict(before, readFrame(line));

describe("절반 ① — 순수 층의 접수 판정 (§8.1 계약 ⑤)", () => {
  test("A-1 역검증 — 접수표 파싱이 실물을 얻는다", () => {
    // 파서가 헛돌면 아래 전수 축이 0행을 돌고 조용히 그린이 된다(§2.6의 형태).
    expect(ACCEPTANCE_TABLE).toHaveLength(6);
    expect(ACCEPTANCE_TABLE.filter((row) => row.accepted)).toHaveLength(3);
    expect(ACCEPTANCE_TABLE.filter((row) => !row.accepted)).toHaveLength(3);
    expect(ACCEPTANCE_TABLE[0]?.frame).toBe("수열에 이어진 푸시");
    expect(() => parseAcceptanceTable("# 표가 없는 문서")).toThrow();
    expect(() => parseAcceptanceTable("#### 판정이 착지보다 앞이다\n본문뿐")).toThrow();
  });

  test("A-2 접수표의 행 집합과 이 파일의 사례 표가 서로를 소진한다", () => {
    const inDoc = [...ACCEPTANCE_TABLE.map((row) => row.frame)].sort();
    const inFile = Object.keys(CASES).sort();
    expect(inFile, "정본 표와 사례 표가 갈렸다 — 한쪽만 움직였다").toEqual(inDoc);
  });

  test("A-3 전수 — 각 사례가 정본 표가 든 ○/✗를 낸다", () => {
    for (const { frame, accepted } of ACCEPTANCE_TABLE) {
      const cases = CASES[frame] ?? [];
      expect(cases.length, `사례가 없는 행 — ${frame}`).toBeGreaterThan(0);
      for (const { label, before, line } of cases) {
        expect(verdictOf(before, line).accepted, `${frame} / ${label}`).toBe(accepted);
      }
    }
  });

  test("A-4 답이 한 값으로 뭉치지 않는다 — 행 안에서 하나, 행 사이에서 갈린다", () => {
    // 이 짝이 없으면 `accepted`가 상수인 구현에서도 위 전수의 절반이 그린이다.
    const across = new Set<boolean>();
    for (const [frame, cases] of Object.entries(CASES)) {
      const answers = new Set(cases.map(({ before, line }) => verdictOf(before, line).accepted));
      expect(answers.size, frame).toBe(1);
      for (const answer of answers) across.add(answer);
    }
    expect(across).toEqual(new Set([true, false]));
  });

  test("A-5 접수는 프레임만의 함수가 아니다 — 같은 줄이 접기 전 상태에 따라 갈린다", () => {
    // 근거: §8.1 — *"접수의 정의는 상태에서 나온다 — 새 술어를 발명하지 않는다."* 첫 행과
    // 여섯째 행이 **같은 줄**이므로, 프레임 하나만 보고 정하는 구현은 여섯 행 중 다섯이
    // 그린인 채로 이 축에서만 붉는다.
    const line = wire(eventAt(4));
    expect(verdictOf(LIVE, line).accepted).toBe(true);
    for (const before of [ENDED, BROKEN, GAP]) {
      expect(verdictOf(before, line).accepted, before.phase).toBe(false);
    }
  });

  test("A-6 접수의 정의 세 항이 각각 필요조건이다 — 상태에서 도출된다", () => {
    // 근거: §8.1 — *"프레임을 읽었고, 접기 전 상태가 «진행 중»이었으며, 접은 뒤 상태가 결함도
    // 갭도 아니면"* 접수다. 세 항을 하나씩 깨뜨려 각각이 ✗를 내는지 본다.
    // ① 안 읽힌 줄
    expect(verdictOf(LIVE, "{").accepted, "읽기 실패인데 접수했다").toBe(false);
    // ② 접기 전이 «진행 중»이 아니다 — 종단 둘과 갭
    for (const before of [ENDED, BROKEN, GAP]) {
      const verdict = verdictOf(before, wire(eventAt(4)));
      expect(verdict.accepted, `${before.phase}인 채로 온 프레임을 접수했다`).toBe(false);
      expect(verdict.state, `${before.phase}가 프레임에 밀렸다`).toEqual(before);
    }
    // ③ 접은 뒤가 결함이거나 갭이다
    expect(verdictOf(LIVE, wire(handshakeAt(4))).state.phase).toBe("broken");
    expect(verdictOf(LIVE, wire(handshakeAt(4))).accepted).toBe(false);
    expect(verdictOf(LIVE, wire(eventAt(6))).state.phase).toBe("gap");
    expect(verdictOf(LIVE, wire(eventAt(6))).accepted).toBe(false);
  });

  test("A-7 접은 뒤가 «종단»인 것은 ✗의 사유가 아니다 — 종료 고지가 그 반례다", () => {
    // 근거: §8.1 접수표 둘째 행 — *"그 내용이 곧 처분이므로 반드시 선다 — 종단이라고 빠지지
    // 않는다"*. 접수를 처분이 `continue`인가로 지으면 이 행이 ✗가 되고, 그러면 사용자는 서버가
    // 내려간 것을 모른 채 멈춘 화면을 본다.
    const verdict = verdictOf(LIVE, wire(shutdownAt(4)));
    expect(verdict.state.phase).toBe("ended");
    expect(verdict.disposition).toBe("stop");
    expect(verdict.accepted).toBe(true);
  });

  test("A-8 셋째 행은 수열을 안 움직인다 — 접수 ○가 «내용의 착지»와 같은 말이 아니다", () => {
    // 근거: §8.1 접수표 셋째 행의 세 번째 칸 — *"수열을 안 움직이므로 내용의 착지가 아니다"*.
    for (const frame of [REQ, RES]) {
      const verdict = verdictOf(LIVE, wire(frame));
      expect(verdict.accepted, frame.type).toBe(true);
      expect(verdict.state, frame.type).toEqual(LIVE);
      expect(verdict.disposition, frame.type).toBe("continue");
    }
  });

  test("A-9 순수 층이 답 셋을 한 자리에서 낸다 — 「계약의 형태」의 필드 전수", () => {
    // 근거: §8.1 「계약의 형태」의 `FrameVerdict` — `state`·`disposition`·`accepted`.
    // 표를 `Record`로 두므로 필드가 늘면 미충족, 없는 필드를 쓰면 초과라 양방향으로 붉는다.
    const FIELDS: Readonly<Record<keyof FrameVerdict, true>> = {
      state: true,
      disposition: true,
      accepted: true,
    };
    const verdict = verdictOf(LIVE, wire(eventAt(4)));
    expect(Object.keys(verdict).sort()).toEqual(Object.keys(FIELDS).sort());
    expect(typeof verdict.accepted).toBe("boolean");
  });

  test("A-10 답의 `state`가 신호 경로의 접기와 같다 — 배선이 두 번 접을 이유가 없다", () => {
    // 근거: §8.1 「계약의 형태」 — `FrameVerdict.state`는 *"접은 뒤"*의 상태이고, 계약 ①의
    // 알파벳이 프레임을 같은 자리에서 든다. 두 경로가 갈리면 배선이 어느 것을 들든 «판정의
    // 정본이 둘»이 되고, 그 갈림이 계약 ②·⑤가 없애려는 형태 그대로다.
    for (const cases of Object.values(CASES)) {
      for (const { label, before, line } of cases) {
        const read = readFrame(line);
        expect(frameVerdict(before, read).state, label).toEqual(
          applySignal(before, { kind: "frame", read }),
        );
      }
    }
  });

  test("A-11 [미규정] 표 셋째 행과 여섯째 행이 같은 입력에서 겹친다", () => {
    // `req`·`res`가 갭/종단인 채로 오면 셋째 행(*"푸시가 아닌 프레임"* ○)과 여섯째 행
    // (*"종단·갭인 채로 온 프레임"* ✗)이 **둘 다** 걸린다. 셋째 행의 문면에는 상태 한정이
    // 없다. 표만 읽으면 답이 둘인데, 같은 절의 정의문(*"접기 전 상태가 «진행 중»이었으며"*)은
    // 여섯째 행 편이다 — 그래서 임의 판정하지 않고 **정의문을 기대값으로 쓰고 겹침을 보고로
    // 올린다**(등급: 문서 부정확 — 표의 셋째 행이 정의보다 넓게 주장한다).
    for (const before of [GAP, ENDED, BROKEN]) {
      for (const frame of [REQ, RES]) {
        expect(verdictOf(before, wire(frame)).accepted, `${before.phase}/${frame.type}`).toBe(
          false,
        );
      }
    }
  });
});

/* ========================================================================== *
 * 절반 ② — 배선의 급수 순서 (정적 스캔)
 *
 * 오늘 이 자리를 실행으로 재는 축이 레포에 0건이다 — `client/stream.js`를 **모듈로 임포트하는
 * 테스트가 0건**이고, 그것이 이 절반이 서는 이유다. 재는 것은 둘이다.
 *   ① 화면 급수 호출이 **접수 분기 안**에 있는가
 *   ② 그 분기의 조건이 **순수 층의 답**인가 — 배선이 자기 술어를 다시 짓지 않는가
 *      (§9.6 기각표 — *"배선이 «읽혔으면 급수한다»를 스스로 판정한다"*)
 *
 * 수단의 선례는 `qa-20260828-webui96-wiring.independent.test.ts`의 `executableOf`·`paintBody`다
 * (읽기만 했고 그 파일은 안 고친다). **텍스트 `grep`으로 세지 않는다** — 주석이 히트에 섞이면
 * 술어가 자기 이름보다 넓게 주장한다.
 * ========================================================================== */

/** 주석만 걷어낸 코드. 문자열은 남는다 — 배선이 phase 이름을 리터럴로 다시 짓는지 봐야 한다 */
const codeOf = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** 여는 괄호/중괄호의 짝을 찾는다. `open`은 여는 문자의 인덱스여야 한다 */
const matchAt = (text: string, open: number, pair: "()" | "{}"): number => {
  const opener = pair[0];
  const closer = pair[1];
  if (text[open] !== opener) throw new Error(`여는 자리가 ${pair}가 아니다.`);
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === opener) depth += 1;
    else if (text[index] === closer) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error(`${pair}의 짝을 못 찾았다.`);
};

/**
 * 스트림이 실어 온 줄 하나를 처리하는 함수의 본문을 잘라 낸다.
 *
 * 이름을 앵커로 쓰므로 개명되면 **조용히 통과하는 것이 아니라 던진다** — 못 찾으면 통과가
 * 곧 §2.6의 형태다.
 */
const receiveBody = (source: string): string => {
  const code = codeOf(source);
  const at = code.indexOf("const receive = (");
  if (at < 0) throw new Error("`receive`를 못 찾았다 — 배선의 프레임 처리 진입점이 개명됐다.");
  const arrow = code.indexOf("=>", at);
  const open = code.indexOf("{", arrow);
  if (arrow < 0 || open < 0) throw new Error("`receive`의 본문 여는 자리를 못 찾았다.");
  return code.slice(open, matchAt(code, open, "{}") + 1);
};

const RECEIVE = receiveBody(CLIENT_STREAM);

/** 급수 게이트 — 접수 답을 조건으로 든 분기 하나 */
type Gate = { readonly condition: string; readonly start: number; readonly end: number };

const gateOf = (body: string): Gate => {
  for (const match of body.matchAll(/\bif\s*\(/g)) {
    const open = (match.index ?? 0) + match[0].length - 1;
    const close = matchAt(body, open, "()");
    const condition = body.slice(open + 1, close);
    if (!condition.includes("accepted")) continue;
    const blockOpen = body.indexOf("{", close);
    if (blockOpen < 0) throw new Error("급수 게이트의 블록을 못 찾았다.");
    if (body.slice(close + 1, blockOpen).trim() !== "") {
      throw new Error("급수 게이트가 블록으로 안 열린다 — 이 축이 못 읽는 형태다.");
    }
    return { condition, start: blockOpen, end: matchAt(body, blockOpen, "{}") };
  }
  throw new Error("접수 답을 조건으로 든 분기를 못 찾았다 — 계약 ⑤의 게이트가 없다.");
};

/** 화면 급수 호출 — 이름과 위치 */
type Dispatch = { readonly name: string; readonly at: number };

const dispatchesIn = (body: string): readonly Dispatch[] =>
  [...body.matchAll(/handlers\.(\w+)\s*\(/g)].map((match) => ({
    name: match[1] ?? "",
    at: match.index ?? 0,
  }));

/** `stream.js`가 요구하는 콜백 이름 — 손으로 안 적고 그 파일의 타입 선언에서 파생한다 */
const parseHandlerNames = (source: string): readonly string[] => {
  const end = source.indexOf("} StreamHandlers");
  if (end < 0) throw new Error("`StreamHandlers` 정의를 못 찾았다.");
  const start = source.lastIndexOf("@typedef", end);
  return [
    ...new Set(
      [...source.slice(start, end).matchAll(/readonly (on\w+):/g)].map((match) => match[1] ?? ""),
    ),
  ];
};

const HANDLER_NAMES = parseHandlerNames(CLIENT_STREAM);
const PHASE_LITERALS = ['"live"', '"gap"', '"ended"', '"broken"'];

describe("절반 ② — 배선의 급수 순서 (정적 스캔 · §8.1 계약 ⑤ · §9.6 기각표)", () => {
  test("B-1 역검증 — 추출기가 주석 속 표기를 실행 코드로 읽지 않는다", () => {
    const sample = [
      "/** handlers.onEvent(x) 를 부르지 말라 */",
      "// handlers.onEvent(y);",
      "handlers.onEvent(z);",
      "const url = https://example.test; // 주소는 안 잘린다",
    ].join("\n");
    expect(dispatchesIn(codeOf(sample))).toHaveLength(1);
    expect(codeOf(sample)).toContain("https://example.test");
  });

  test("B-2 역검증 — `receive` 절단이 실물을 얻는다", () => {
    expect(RECEIVE.length).toBeGreaterThan(80);
    expect(RECEIVE).toContain("readFrame(");
    expect(RECEIVE.startsWith("{")).toBe(true);
    expect(RECEIVE.endsWith("}")).toBe(true);
    expect(() => receiveBody("export function nothing() {}")).toThrow();
  });

  test("B-3 절단의 전제 — `receive` 본문의 문자열이 괄호를 안 품는다", () => {
    // 이 축들은 주석만 걷은 텍스트 위에서 괄호를 센다. 문자열 안에 괄호가 들어오면 짝맞추기가
    // 속으므로 **전제를 축으로 못박는다** — 깨지면 아래 축들의 수단을 다시 판정해야 한다.
    // (본문에 문자열이 아예 없는 것은 아니다 — 프레임 판별자 리터럴이 산다.)
    const literals = [...RECEIVE.matchAll(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g)].map(
      (match) => match[0],
    );
    for (const literal of literals) {
      expect(literal, `문자열이 괄호를 품는다 — ${literal}`).not.toMatch(/[(){}]/);
    }
    expect(RECEIVE, "템플릿 리터럴은 치환 자리로 괄호를 들여올 수 있다").not.toContain("`");
  });

  test("B-4 급수 게이트가 있고 그 조건이 순수 층의 답이다 (§9.6 기각표)", () => {
    // 근거: §8.1 계약 ⑤ — *"접수 여부는 순수 층의 답이고 배선이 다시 짓지 않는다."*
    // 조건이 접수 답을 **함의**해야 하므로: 접수를 조건에 들되(①) 부정하지 않고(②)
    // 선언(`||`)으로 넓히지 않으며(③) phase 이름으로 술어를 다시 짓지 않는다(④).
    const gate = gateOf(RECEIVE);
    expect(gate.condition, "①").toContain("accepted");
    expect(gate.condition.replace(/\s+/g, ""), "② 접수를 부정한 게이트다").not.toContain(
      "!verdict",
    );
    expect(gate.condition, "③ 선언이 게이트를 접수보다 넓힌다").not.toContain("||");
    for (const literal of PHASE_LITERALS) {
      expect(gate.condition, `④ 배선이 술어를 다시 짓는다 — ${literal}`).not.toContain(literal);
    }
  });

  test("B-5 화면 급수 호출이 전부 접수 분기 안에 있다", () => {
    // 근거: §8.1 계약 ⑤ — *"프레임의 내용은 순수 층이 그것을 접수한 뒤에만 화면에 선다."*
    const gate = gateOf(RECEIVE);
    const dispatches = dispatchesIn(RECEIVE);
    expect(dispatches.length, "급수 호출을 하나도 못 찾았다 — 추출이 헛돌았다").toBeGreaterThan(0);
    for (const { name, at } of dispatches) {
      expect(at > gate.start && at < gate.end, `게이트 밖에서 급수한다 — ${name}`).toBe(true);
    }
    // **이 축의 폭**: 정본은 ✗ 자리의 «사유»를 `receive` 안에서 세우는 배치를 금지하지
    // 않는다. 오늘 실물이 사유를 다른 함수에 두므로 «receive 안의 호출은 전부 게이트 안»이
    // 성립하고, 배치가 바뀌면 이 축의 전제를 다시 판정해야 한다.
  });

  test("B-6 역검증 — 급수를 게이트 밖으로 옮기면 축 B-5가 붉는다", () => {
    // 원문에 실제로 위반을 심어, 술어가 그것을 잡는지 본다. 심은 자리는 게이트 **뒤**이고
    // 여전히 `receive` 안이다 — 이 계약이 정확히 금지하는 형태다.
    const anchor = "settle(before, verdict.disposition);";
    expect(CLIENT_STREAM, "심을 앵커가 사라졌다 — 역검증이 헛돈다").toContain(anchor);
    const planted = CLIENT_STREAM.replace(anchor, `handlers.onEvent(read);\n    ${anchor}`);
    expect(planted).not.toBe(CLIENT_STREAM);

    const body = receiveBody(planted);
    const gate = gateOf(body);
    const outside = dispatchesIn(body).filter(({ at }) => at < gate.start || at > gate.end);
    expect(outside.map(({ name }) => name)).toEqual(["onEvent"]);
  });

  test("B-7 역검증 — 게이트 조건에서 접수를 걷으면 축 B-4가 붉는다", () => {
    // 배선이 «읽혔으면 급수한다»를 스스로 판정하는 형태(§9.6 기각표)를 심는다.
    const planted = CLIENT_STREAM.replace("verdict.accepted && read.ok", "read.ok");
    expect(planted, "심을 앵커가 사라졌다 — 역검증이 헛돈다").not.toBe(CLIENT_STREAM);
    expect(() => gateOf(receiveBody(planted))).toThrow();
  });

  test("B-8 접수 ○ 셋이 각각 착지를 얻는다 — 게이트 안이 프레임 갈래를 안 좁힌다", () => {
    // 근거: §8.1 접수표의 ○ 세 행. 게이트가 접수보다 **좁으면** 종료 고지가 화면에 안 서고
    // (*"종단이라고 빠지지 않는다"*) 계약 밖 프레임의 고지도 사라진다.
    const gate = gateOf(RECEIVE);
    const inside = new Set(
      dispatchesIn(RECEIVE)
        .filter(({ at }) => at > gate.start && at < gate.end)
        .map(({ name }) => name),
    );
    expect(inside.size, "게이트 안의 급수 갈래가 셋이 아니다").toBe(3);
    for (const name of inside) {
      expect(HANDLER_NAMES, `타입에 없는 콜백을 부른다 — ${name}`).toContain(name);
    }
  });

  test("B-9 접수 ✗ 자리의 «사유»가 사라지지 않는다 — 나머지 콜백 둘이 산다", () => {
    // 근거: §8.1 — *"버리는 것이 아니다."* ✗ 셋의 자리에는 사유가 선다. 이 파일이 재는 것은
    // 그 사유의 **문면**이 아니라 콜백이 실제로 불리는 자리가 있는가 하나다(못 재는 것 4).
    const gate = gateOf(RECEIVE);
    const inside = new Set(
      dispatchesIn(RECEIVE)
        .filter(({ at }) => at > gate.start && at < gate.end)
        .map(({ name }) => name),
    );
    const reasons = HANDLER_NAMES.filter((name) => !inside.has(name));
    expect(reasons.length, "사유를 나르는 콜백이 둘이 아니다").toBe(2);
    const code = codeOf(CLIENT_STREAM);
    for (const name of reasons) {
      const total = dispatchesIn(code).filter((call) => call.name === name).length;
      expect(total, `사유가 어디서도 안 선다 — ${name}`).toBeGreaterThan(0);
      expect(
        dispatchesIn(RECEIVE).some((call) => call.name === name),
        `사유가 접수 게이트에 매달렸다 — ${name}`,
      ).toBe(false);
    }
  });

  test("B-10 판정과 수열 전진이 급수보다 앞이다", () => {
    // 근거: §8.1 계약 ⑤ — *"급수가 검사보다 앞이면 화면 층의 던짐이 검사를 통째로 건너뛰어
    // 수열이 안 오르고"* 다음 프레임이 갭으로 읽힌다. 그래서 재는 것이 둘이다 — 판정 호출이
    // 앞인가, 그리고 **상태 대입**이 앞인가.
    const verdictAt = RECEIVE.indexOf("frameVerdict(");
    const assignAt = RECEIVE.search(/(?<![.\w])state\s*=(?!=)/);
    const firstDispatch = dispatchesIn(RECEIVE)[0]?.at ?? -1;
    expect(verdictAt, "판정 호출을 못 찾았다").toBeGreaterThan(0);
    expect(assignAt, "수열 상태 대입을 못 찾았다").toBeGreaterThan(0);
    expect(firstDispatch, "급수 호출을 못 찾았다").toBeGreaterThan(0);
    expect(verdictAt, "판정이 급수보다 뒤다").toBeLessThan(firstDispatch);
    expect(assignAt, "수열 전진이 급수보다 뒤다 — 화면의 성패에 매달린다").toBeLessThan(
      firstDispatch,
    );
  });

  test("B-11 배선이 같은 프레임을 두 번 접지 않는다", () => {
    // 근거: §8.1 「계약의 형태」 — 답 셋이 한 자리에서 나므로 프레임을 다시 접을 자리가 없다.
    // 두 번 접으면 카운터가 두 번 전진하고 접수 답이 가리키는 상태와 배선이 든 상태가 갈린다.
    expect(RECEIVE, "프레임을 두 번 접는다").not.toContain("applySignal(");
    expect(codeOf(CLIENT_STREAM), "신호 경로 자체가 사라졌다 — 이 축의 전제가 깨졌다").toContain(
      "applySignal(",
    );
  });

  test("B-12 처분도 순수 층의 답 그대로 넘어간다 — 배선이 phase로 다시 짓지 않는다", () => {
    // 근거: §8.1 계약 ② — *"배선은 이 셋을 적용만 하고 스스로 고르지 않는다"*. 계약 ⑤의
    // 게이트가 순수 층의 답인 것과 같은 형태이고, 둘 중 하나만 지키면 정본이 다시 둘이 된다.
    const at = RECEIVE.indexOf("settle(");
    expect(at, "종단 호출을 못 찾았다").toBeGreaterThan(0);
    const args = RECEIVE.slice(at + "settle".length);
    const call = args.slice(0, matchAt(args, args.indexOf("("), "()") + 1);
    expect(call, "처분을 배선이 다시 짓는다").toContain("disposition");
    for (const literal of PHASE_LITERALS) {
      expect(RECEIVE, `배선이 phase 이름을 다시 든다 — ${literal}`).not.toContain(literal);
    }
  });

  test("B-13 [미규정] 급수와 처분의 상대 순서를 정본이 안 정한다", () => {
    // §8.1이 정한 것은 판정이 급수보다 앞이라는 것뿐이고, 급수와 처분의 앞뒤는 어느 절도 안
    // 든다. 접수표 둘째 행(*"그 내용이 곧 처분이므로 반드시 선다"*)은 둘 다에서 만족될 수
    // 있다 — 처분이 소켓을 닫아도 콜백은 불린다. 그래서 **임의로 판정하지 않고 오늘의 순서를
    // 사실로 기록한다**: 급수가 앞이다. 뒤집히면 이 축이 붉고, 그때 판정할 것은 어느 순서가
    // 계약인가이지 구현이 바뀌었나가 아니다. 판정 필요.
    const firstDispatch = dispatchesIn(RECEIVE)[0]?.at ?? -1;
    expect(firstDispatch).toBeGreaterThan(0);
    expect(firstDispatch).toBeLessThan(RECEIVE.indexOf("settle("));
  });

  test("B-14 [한계] 이 스캔이 변수 경유 급수를 못 잡는다 — 구멍을 단언으로 못박는다", () => {
    // §9.3의 거부 근거가 그대로 걸린다 — *"텍스트 스캔은 변수 경유·주석 우회를 물려받아
    // 막는다고 주장하면서 못 막는 상태를 새로 만든다"*. 아래는 계약 ⑤를 실제로 깨는 원문인데
    // 위 축들이 **전부 그린이다.** 그 사실을 단언으로 남겨 두면, 훗날 축이 강해졌을 때 이
    // 축이 붉어 「못 재는 것」 목록을 함께 고치게 된다.
    const anchor = "settle(before, verdict.disposition);";
    const planted = CLIENT_STREAM.replace(
      anchor,
      `const sink = handlers;\n    sink.onEvent(read);\n    ${anchor}`,
    );
    expect(planted).not.toBe(CLIENT_STREAM);
    const body = receiveBody(planted);
    const gate = gateOf(body);
    const outside = dispatchesIn(body).filter(({ at }) => at < gate.start || at > gate.end);
    expect(outside, "구멍이 막혔다면 위 「못 재는 것」 1을 고쳐야 한다").toEqual([]);
  });
});
