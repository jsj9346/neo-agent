/**
 * allowlist 파일 **왕복** 계약 — `docs/CLI-INTERFACE.md` §10 · `docs/APPROVAL-GATE.md` §4·§5.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일이 재는 축은 하나다: **게이트가 낸 키가 파일을 왕복해 다음 프로세스에서
 * 그대로 매칭되는가.** `K-598`(2026-09-09)이 셸 키에 작업 디렉터리를 넣으면서
 * allowlist 파일이 **해석된 절대 경로**라는 새 입력을 받게 됐고, 선행 QA
 * (`plans/20260909-gate-cwd-key-qa-report.md` §3 「재지 못한 축」 1·3)가 파일 구현과
 * 실파일 왕복을 재지 못한 축으로 명시했다.
 *
 * ## 이 파일은 게이트를 부르지 않는다 — 가드의 회귀를 못 잡는다
 *
 * 아래 표본은 게이트가 낼 수 있는 키의 **리터럴**이고, 키를 발급하는 경로
 * (`packages/gate/src/pipeline.ts`의 `allowlistKey`)를 지나지 않는다. 그래서
 * `pathBreaksKeySyntax`를 통째로 지워도 이 파일은 초록이다 — 여기서 재는 것은 파일
 * 구현의 왕복이지 가드가 아니다. **회귀망으로 세지 말 것.** 가드를 잡는 자리는
 * `packages/gate/test/key-line-safety.contract.test.ts`의 L-1 셋째와 L-3·L-4다.
 *
 * 계약:
 *   CLI §10 "포맷: 한 줄 = 키 하나(UTF-8). 키 형식은 게이트가 정의한다"
 *   CLI §10 "이 구현은 받은 키를 그대로 한 줄로 쓰며 자체 이스케이프를 하지 않는다 —
 *           여기서 이스케이프를 시작하면 읽는 쪽에 대응 디코더가 필요해지고, 그 순간
 *           키 형식의 정본이 둘이 된다"
 *   CLI §10 "**게이트가 내는 키는 `String.prototype.trim`에 불변이고, 그래서 이 구현의
 *           읽기 트림이 왕복을 깨지 않는다**"
 *   CLI §10 "**그 트림은 손편집 관용이다** — BOM으로 시작하는 파일, CRLF 줄, 들여쓴
 *           줄이 그대로 읽힌다"
 *   CLI §10 "`add`는 메모리와 파일 append에 동시 반영"
 *   CLI §10 "**append 실패는 조용히 넘기지 않는다**"
 *   GATE §5 "**allowlist는 동결의 명시적 예외다** — 세션 중 **추가만** 일어난다"
 *   GATE §4 "이 키는 `~/.neo-agent/allowlist`에 **영속**되므로 나중에 표기를 바꾸면
 *           사용자의 학습이 통째로, 그리고 이유 없이 무효가 되기 때문이다"
 *
 * 기대값은 전부 위 문면에서 뽑았고 구현을 보고 맞추지 않았다. 붉은 채로 남는 단언이
 * 있으면 그것이 판정이다(`/verify` 원칙 — 검증은 문서 편에 선다).
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAllowlistStore } from "../src/allowlist.ts";

let home: string;
let path: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "neo-allowlist-rt-"));
  mkdirSync(join(home, ".neo-agent"));
  path = join(home, ".neo-agent", "allowlist");
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

/** 다음 프로세스 시작을 흉내낸다 — 스토어를 새로 연다(§10: 재읽기 없음, 로드는 시작 1회) */
function reopen() {
  return createAllowlistStore(path);
}

function lines(): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line !== "");
}

/**
 * 게이트가 실제로 낼 수 있는 키 표본. 출처는 `packages/gate/src/pipeline.ts`의
 * `allowlistKey` 문형이고, 각 항의 「낼 수 있는가」 근거를 함께 든다.
 *
 * **꼬리 공백·탭 경로는 여기서 뺐다** (2026-09-09 · `K-607`). 이 표본이 성립하려면
 * 그 키를 게이트가 실제로 낼 수 있어야 하는데, §10이 트림 불변을 계약으로 세우고
 * `pathBreaksKeySyntax`가 그것을 강제한 뒤로는 발급되지 않는다 — 전제가 거짓이 된
 * 표본이라 여기 남으면 이 파일이 **없는 계약**을 재게 된다. 옮겨 간 자리는
 * `packages/gate/test/key-line-safety.contract.test.ts`의 L-3(파이프라인 층)과
 * L-4(원시함수의 정의역)이고, 거기서는 **키를 주지 않는 것**이 기대값이다.
 */
const KEYS: readonly { label: string; key: string; why: string }[] = [
  {
    label: "shell — cwd 미지정(워크스페이스 루트)",
    key: "shell:/ws:npm test",
    why: 'APPROVAL-GATE §4 — `cwd` 미지정은 classifier의 `"."` 해석값으로 안정된다',
  },
  {
    label: "shell — cwd에 공백",
    key: "shell:/ws/My Documents/proj:npm test",
    why: "POSIX 디렉터리 이름은 공백을 갖는다. `cwdBreaksKeySyntax`는 `:`·개행만 막는다",
  },
  {
    label: "shell — cwd에 비ASCII(UTF-8)",
    key: "shell:/ws/프로젝트:npm test",
    why: "§10 포맷이 UTF-8이다",
  },
  {
    label: "shell — 명령 쪽에 `:`",
    key: "shell:/ws:git log --pretty=format:%h",
    why: "APPROVAL-GATE §4 — 첫 `:`이 경계이므로 명령 쪽은 `:`을 자유롭게 갖는다",
  },
  {
    label: "webFetch — 비기본 포트",
    key: "webFetch:https://example.com:8443",
    why: "APPROVAL-GATE §4 — `URL.origin` 직렬화 그대로",
  },
  {
    label: "fileWrite — 평범한 경로",
    key: "fileWrite:/ws/src/a.ts",
    why: "APPROVAL-GATE §7 — 파일 도구는 해석된 절대 경로가 키다",
  },
  {
    label: "fileWrite — 이름 가운데에 공백",
    key: "fileWrite:/ws/my docs/a.ts",
    why:
      "트림은 **양끝**만 걷는다. 가운데 공백은 트림 불변이므로 §4의 파일 도구 경로 " +
      "가드에 걸리지 않고, 그래서 이 키는 실제로 발급된다",
  },
  {
    label: "fileEdit — 경로에 `:`",
    key: "fileEdit:/ws/a:b.ts",
    why:
      "APPROVAL-GATE §4 — 파일 키는 첫 `:`이 경계이고 그 뒤가 전부 경로라, `cwd`와 달리 " +
      "`:`을 막지 않는다(비대칭은 의도된 것이다)",
  },
];

/** 표본을 순서로 집는다. 없는 자리를 조용히 건너뛰면 그 줄을 안 재고도 초록이 된다 */
function entryAt(index: number): { label: string; key: string; why: string } {
  const entry = KEYS[index];
  if (entry === undefined) throw new Error(`표본이 ${index + 1}개보다 적다 — 단언이 공허해진다`);
  return entry;
}

describe("R-1 왕복 단사성 — add한 키가 다음 프로세스에서 그대로 매칭된다 (CLI §10 · GATE §4)", () => {
  for (const { label, key, why } of KEYS) {
    it(`${label}`, () => {
      const store = createAllowlistStore(path, {
        onWarning: (message) => {
          throw new Error(`append가 실패했다(경고): ${message}`);
        },
      });
      store.add(key);
      expect(store.has(key), "같은 세션에서 매칭되지 않았다").toBe(true);

      expect(reopen().has(key), `다음 세션에서 학습이 사라졌다 — 경고 없이. ${why}`).toBe(true);
    });
  }
});

describe("R-2 쓰기는 축자적이다 — 받은 키를 그대로 한 줄로 쓴다 (CLI §10)", () => {
  it("파일의 한 줄이 키와 문자 그대로 같다", () => {
    const store = createAllowlistStore(path, { onWarning: () => {} });
    for (const { key } of KEYS) store.add(key);
    expect(lines()).toEqual(KEYS.map(({ key }) => key));
  });
});

describe("R-3 읽기 트림이 왕복을 깨지 않는다 — 게이트가 트림 불변 키만 내기 때문이다 (CLI §10)", () => {
  // **2026-09-09에 이 절의 계약이 바뀌었다** (`K-607`). 그전 판은 §10의 "이 구현은 받은
  // 키를 그대로 한 줄로 쓰며 자체 이스케이프를 하지 않는다 — 여기서 이스케이프를 시작하면
  // 읽는 쪽에 대응 디코더가 필요해지고, 그 순간 키 형식의 정본이 둘이 된다"에서 **읽기도
  // 문자 항등이어야 한다**를 도출했고, 그 도출이 읽기 트림과 충돌해 붉었다. §10이 그
  // 충돌을 트림 쪽이 아니라 **발급 쪽**에서 닫았다: 게이트가 트림 불변 키만 내므로 읽기
  // 트림은 왕복에 영향이 없다. 축자성 계약이 걸리는 자리는 **쓰기**이고 그것은 위 R-2다.
  //
  // 그래서 이 절이 재는 것은 둘이다 — ① 게이트가 낼 수 있는 키가 파일에 있으면 그대로
  // 읽힌다 ② 트림이 **사는 값**(손편집 관용)이 실제로 산다. ②가 없으면 트림을 지워
  // 문자 항등으로 되돌리는 변경이 이 파일을 통과한다.

  it("게이트가 낼 수 있는 키는 파일에 그대로 있으면 그대로 읽힌다", () => {
    // 전제 확인 — 표본 전량이 트림 불변인가. 아니면 §10의 보장 밖 키를 재는 것이 되고
    // 아래 단언은 계약이 아니라 구현의 사진이 된다.
    for (const { key, label } of KEYS) {
      expect(key, `표본이 게이트의 트림 불변 보장 밖이다 — ${label}`).toBe(key.trim());
    }

    writeFileSync(path, `${KEYS.map(({ key }) => key).join("\n")}\n`, "utf8");
    const store = reopen();
    for (const { key, label } of KEYS) {
      expect(store.has(key), `파일에 그대로 있는 키를 못 읽었다 — ${label}`).toBe(true);
    }
  });

  it("손편집 관용 — BOM으로 시작하는 파일, CRLF 줄, 들여쓴 줄이 그대로 읽힌다", () => {
    // §10이 트림을 손편집 관용으로 명문화했고, 그 관용이 계약인 이유는 게이트가 파일을
    // 재읽기하지 않아(GATE §5) **파일을 고치는 것이 학습을 회수하는 유일한 수단**이기
    // 때문이다(GATE §4). 즉 손으로 고친 파일이 안 읽히면 회수 수단 자체가 없어진다.
    // 손편집의 세 형태를 각각 다른 줄에 심는다. 앞 두 줄은 CRLF, 마지막은 LF다.
    const hand = `\uFEFF${entryAt(0).key}\r\n  ${entryAt(1).key}\r\n\t${entryAt(2).key}\n`;
    writeFileSync(path, hand, "utf8");

    const store = reopen();
    for (const index of [0, 1, 2]) {
      const { key, label } = entryAt(index);
      expect(store.has(key), `손편집한 줄을 못 읽었다 — ${label}`).toBe(true);
    }
  });
});

describe("R-4 추가만 — 재add가 줄을 늘리지 않는다 (GATE §5)", () => {
  it("두 세션에 걸쳐 같은 키를 add해도 파일 줄 수가 그대로다", () => {
    // §5가 allowlist를 「추가만」으로 못박은 것의 짝: 이미 학습된 키는 다시 쓰이지
    // 않아야 한다. 재로드가 원본 키를 복원하지 못하면 이 성질이 세션마다 깨지고
    // 파일이 무한히 자란다 — GATE §4의 트림 불변 항이 그 실패 양태를 든다.
    const s1 = createAllowlistStore(path, { onWarning: () => {} });
    for (const { key } of KEYS) s1.add(key);
    const after1 = lines().length;

    const s2 = createAllowlistStore(path, { onWarning: () => {} });
    for (const { key } of KEYS) s2.add(key);

    expect(lines().length, "같은 키가 세션마다 다시 append됐다").toBe(after1);
  });
});

describe("R-5 UTF-8 (CLI §10)", () => {
  it("비ASCII 키가 바이트 수준에서 UTF-8로 왕복한다", () => {
    const key = "fileWrite:/ws/문서/설계.md";
    const store = createAllowlistStore(path, { onWarning: () => {} });
    store.add(key);
    expect(readFileSync(path, "utf8")).toBe(`${key}\n`);
    expect(reopen().has(key)).toBe(true);
  });
});
