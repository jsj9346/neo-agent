/**
 * 상태줄 조립·절단 단위 테스트 — `docs/CLI-INTERFACE.md` §7.1.
 *
 * 재는 것은 `src/status.ts`의 순수 함수 하나뿐이다. 하단 고정 영역이 몇 행을 걷고 몇
 * 행을 그리는가는 이 파일이 재지 않는다 — 그 축은 독립 검증이 따로 든다.
 *
 * **문면을 리터럴로 고정하지 않는다.** §7 말미가 그 정책의 정본이고 §7.1 말미가 이 절에
 * 그대로 걸었다 — 표시 문구는 세부이므로 여기서 특정 문자열을 그대로 단언하면 세부가
 * 사실상 계약이 되고, 문구를 다듬는 일이 계약 변경으로 나타난다. 그래서 이 파일이 재는
 * 것은 넷뿐이다:
 *
 *   1. **비개행** — 반환 문자열에 개행이 없는가. 개행이 하나 새면 걷는 행 수와 그린 행
 *      수가 그 즉시 어긋난다(§7.1 — 단위성).
 *   2. **폭** — 표시 폭이 터미널 폭을 넘지 않는가. 전각으로도 잰다.
 *   3. **구별과 비침묵** — 보호가 내려온 상태와 기본값 상태의 출력이 서로 갈리는가,
 *      내려온 쪽이 비어 있지 않은가. 계약 항목 둘 각각에 한 쌍씩.
 *   4. **전역성** — 어떤 입력에서도 던지지 않는가. 이 함수는 코어가 await하는 리스너
 *      안에서 불리므로 여기서 던지면 에이전트 런 전체가 실패한다(§7 머리).
 *
 * 리터럴이 나오는 자리는 둘뿐이고 둘 다 §7 말미가 허용으로 든 형태다 — 같은 문면의
 * 있음과 없음을 서로 다른 상태에서 재는 대비쌍, 그리고 테스트가 주입한 데이터가 그대로
 * 통과했는지 확인하는 단언. 짝 없는 단독 리터럴은 이 파일에 없다.
 *
 * **폭 상한을 `columns`로 잰다.** 구현은 한 칸을 덜 쓰지만(플랜 §8.2 A-2 — 정확히
 * `columns`칸을 쓰고 개행을 내면 즉시 감싸는 터미널 회피) 그것은 추정이고 세부이므로 이
 * 파일이 기계로 고정하지 않는다. 폭의 자[尺]는 절단이 쓰는 것과 같은 `displayWidth`이고,
 * 그 자 자체의 정확성은 이 파일이 아니라 `terminal.test.ts`가 잰다.
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
import { formatStatus, type StatusFields } from "../src/status.ts";
import { displayWidth } from "../src/terminal.ts";

/** 기본값 — 보호가 하나도 안 내려왔고 세부 셋도 비어 있는 상태 */
const BASE: StatusFields = {
  approvalMode: "manual",
  shellOnHost: false,
  model: "",
  usage: undefined,
  sessionId: undefined,
};

function fields(patch: Partial<StatusFields> = {}): StatusFields {
  return { ...BASE, ...patch };
}

const USAGE = { input: 128_450, output: 9_812, cacheRead: 64_000, cacheWrite: 512 };

/** 폭이 넘치도록 만든 입력들 — 전각·반각·섞임을 각각 한 줄씩 */
const OVERFLOW_CASES: { label: string; value: StatusFields }[] = [
  {
    label: "전각만",
    value: fields({
      approvalMode: "off",
      shellOnHost: true,
      model: "아주아주긴한글모델이름을넣어폭을훌쩍넘긴다",
      usage: USAGE,
      sessionId: "가나다라마바사아자차카타파하",
    }),
  },
  {
    label: "반각만",
    value: fields({
      approvalMode: "off",
      shellOnHost: true,
      model: "some-very-long-model-identifier-that-will-not-fit-anywhere",
      usage: USAGE,
      sessionId: "0123456789abcdef0123456789abcdef",
    }),
  },
  {
    label: "섞임",
    value: fields({
      approvalMode: "off",
      shellOnHost: true,
      model: "모델claude-옵스-미리보기-2026년판",
      usage: USAGE,
      sessionId: "8f3a-세션-c1d2",
    }),
  },
  {
    label: "세부만",
    value: fields({ model: "한글model섞인이름", usage: USAGE, sessionId: "0123456789" }),
  },
];

/**
 * 터미널 폭 후보. 0 이하와 1·2 같은 극단을 함께 넣는다 — 아무것도 못 담는 폭에서
 * 한 행을 지키는 유일한 답이 빈 문자열이고, 그 자리가 절단의 도피처가 되기 쉽다.
 */
const COLUMN_CASES = [-40, -1, 0, 1, 2, 3, 4, 5, 7, 10, 13, 20, 40, 80, 200];

describe("formatStatus — 1행 제약 (§7.1)", () => {
  it("반환 문자열에 개행이 없다", () => {
    for (const { label, value } of OVERFLOW_CASES) {
      for (const columns of COLUMN_CASES) {
        const line = formatStatus(value, columns);
        expect(line.includes("\n"), `${label} · columns=${columns} — LF`).toBe(false);
        expect(line.includes("\r"), `${label} · columns=${columns} — CR`).toBe(false);
      }
    }
  });

  it("제어 문자가 든 값을 받아도 개행이 새지 않는다", () => {
    // 폭 계산은 제어 문자를 0칸으로 세므로(`terminal.ts`) 개행이 든 설정 한 줄이
    // 폭을 하나도 안 건드린 채 상태줄을 2행으로 만들 수 있다.
    const dirty = fields({
      approvalMode: "off",
      model: "모델\n둘째줄\r셋째\t넷째[31m다섯",
      sessionId: "세션\nid",
    });
    for (const columns of COLUMN_CASES) {
      const line = formatStatus(dirty, columns);
      expect(line.includes("\n"), `columns=${columns} — LF`).toBe(false);
      expect(line.includes("\r"), `columns=${columns} — CR`).toBe(false);
    }
  });

  it("표시 폭이 터미널 폭을 넘지 않는다 — 전각으로도", () => {
    for (const { label, value } of OVERFLOW_CASES) {
      for (const columns of COLUMN_CASES) {
        const line = formatStatus(value, columns);
        const room = Math.max(0, columns);
        expect(displayWidth(line), `${label} · columns=${columns}`).toBeLessThanOrEqual(room);
      }
    }
  });

  it("담을 폭이 없으면 아무것도 그리지 않는다", () => {
    // 0 이하 폭에서 한 행을 지키는 답은 빈 문자열뿐이다. 여기서 무언가를 내보내면
    // 그것이 감싸여 하단 영역의 행 수가 어긋난다.
    for (const { label, value } of OVERFLOW_CASES) {
      for (const columns of [-40, -1, 0]) {
        expect(formatStatus(value, columns), `${label} · columns=${columns}`).toBe("");
      }
    }
  });
});

describe("formatStatus — 구별과 비침묵 (§7.1 · §7 말미)", () => {
  it("승인 모드가 내려온 세션과 기본값 세션의 출력이 갈리고, 내려온 쪽이 비어 있지 않다", () => {
    const off = formatStatus(fields({ approvalMode: "off" }), 80);
    const manual = formatStatus(fields({ approvalMode: "manual" }), 80);

    expect(off, "승인 모드가 내려온 쪽").not.toBe(manual);
    expect(off.length, "내려온 쪽이 비어 있으면 침묵이다").toBeGreaterThan(0);
  });

  it("셸이 호스트로 내려온 세션과 기본값 세션의 출력이 갈리고, 내려온 쪽이 비어 있지 않다", () => {
    const host = formatStatus(fields({ shellOnHost: true }), 80);
    const sandboxed = formatStatus(fields({ shellOnHost: false }), 80);

    expect(host, "셸이 호스트로 내려온 쪽").not.toBe(sandboxed);
    expect(host.length, "내려온 쪽이 비어 있으면 침묵이다").toBeGreaterThan(0);
  });

  it("두 계약 항목이 기본값이고 세부가 비면 상태줄이 비어 있다", () => {
    // §7.1 — 기본값일 때는 표시하지 않는다. 상태줄은 정상이라는 것을 말하는 자리가
    // 아니고, 그 상태를 매 순간 선언하면 정작 내려간 순간의 대비가 죽는다.
    expect(formatStatus(fields(), 80)).toBe("");
  });

  it("계약 항목 둘이 함께 내려오면 하나만 내려온 것과도 갈린다", () => {
    const both = formatStatus(fields({ approvalMode: "off", shellOnHost: true }), 80);
    const onlyApproval = formatStatus(fields({ approvalMode: "off" }), 80);
    const onlyShell = formatStatus(fields({ shellOnHost: true }), 80);

    expect(both).not.toBe(onlyApproval);
    expect(both).not.toBe(onlyShell);
    expect(onlyApproval).not.toBe(onlyShell);
  });

  it("좁은 폭에서도 계약 항목이 내려온 세션은 침묵하지 않는다", () => {
    // 절단이 계약 항목을 통째로 삼키면 보호가 꺼진 사실이 화면에서 사라진다.
    for (const columns of [10, 13, 20, 40]) {
      const off = formatStatus(
        fields({ approvalMode: "off", model: "한글이름의긴모델", usage: USAGE }),
        columns,
      );
      const manual = formatStatus(
        fields({ approvalMode: "manual", model: "한글이름의긴모델", usage: USAGE }),
        columns,
      );
      expect(off.length, `columns=${columns} — 비침묵`).toBeGreaterThan(0);
      expect(off, `columns=${columns} — 구별`).not.toBe(manual);
    }
  });

  it("주입한 세부 값이 폭이 넉넉하면 그대로 통과한다", () => {
    // 리터럴이 아니라 주입 데이터 확인이다(§7 말미의 허용 갈래). 세부 셋이 조용히
    // 버려지지 않는지만 잰다 — 어떤 문구로 감싸는지는 재지 않는다.
    const model = "injected-model-id";
    const sessionId = "0f1e2d3c";
    const line = formatStatus(fields({ model, sessionId }), 200);

    expect(line).toContain(model);
    expect(line).toContain(sessionId);
  });

  it("사용량이 도착한 세션과 아직 없는 세션의 출력이 갈린다", () => {
    const withUsage = formatStatus(fields({ model: "m", usage: USAGE }), 200);
    const without = formatStatus(fields({ model: "m", usage: undefined }), 200);

    expect(withUsage).not.toBe(without);
    expect(withUsage.length).toBeGreaterThan(without.length);
  });
});

describe("formatStatus — 전역성 (§7 머리 · 리스너 예외는 런을 실패시킨다)", () => {
  const HOSTILE: { label: string; value: StatusFields; columns: number }[] = [
    { label: "값이 없는 필드", value: fields(), columns: 80 },
    {
      label: "빈 문자열",
      value: fields({ approvalMode: "off", model: "", sessionId: "" }),
      columns: 80,
    },
    { label: "음수 columns", value: fields({ approvalMode: "off" }), columns: -7 },
    { label: "0 columns", value: fields({ shellOnHost: true }), columns: 0 },
    { label: "소수 columns", value: fields({ model: "m", usage: USAGE }), columns: 12.7 },
    { label: "NaN columns", value: fields({ model: "m" }), columns: Number.NaN },
    { label: "무한 columns", value: fields({ model: "m" }), columns: Number.POSITIVE_INFINITY },
    {
      label: "비유한 usage",
      value: fields({
        usage: {
          input: Number.NaN,
          output: Number.POSITIVE_INFINITY,
          cacheRead: -1,
          cacheWrite: 0.5,
        },
      }),
      columns: 80,
    },
    // 타입 밖에서 온 값 — 배선이 어긋나면 실제로 닿는 형태다
    { label: "빈 객체", value: {} as StatusFields, columns: 80 },
    {
      label: "문자열 아닌 세부",
      value: { ...BASE, model: 42 as unknown as string } as StatusFields,
      columns: 80,
    },
    {
      label: "usage가 null",
      value: { ...BASE, usage: null as unknown as undefined },
      columns: 80,
    },
  ];

  for (const { label, value, columns } of HOSTILE) {
    it(`던지지 않고 문자열을 돌려준다 — ${label}`, () => {
      let line: string | undefined;
      expect(() => {
        line = formatStatus(value, columns);
      }).not.toThrow();
      expect(typeof line).toBe("string");
      expect(line?.includes("\n")).toBe(false);
    });
  }
});
