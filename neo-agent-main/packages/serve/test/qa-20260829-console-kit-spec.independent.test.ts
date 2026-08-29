/**
 * 독립 QA — 2026-08-29 재생성 반입물의 **규격 축** (`docs/WEB-UI.md` §9.5 결정 9·10 · §9.6 결정 5).
 *
 * **이 파일이 서는 이유는 커버리지 구멍이다.** §9.5 결정 10이 2026-08-29에 성질 셋을 **규격으로
 * 올렸는데**(*"올린다"* — `composer-input`의 다중행 · 컨트롤 셋의 잠금 · `connection-status`의
 * 명시 고지), 그 셋을 재는 기계가 이 레포 안에 하나도 없다. 오늘 그것을 잰 것은 반입 전
 * 스테이징의 사이클 산출물이고(`plans/`), 그 자리는 매 사이클 새로 만들어지며 공개 트리에
 * 실리지 않는다. 즉 **반입 뒤에는 아무도 안 잰다.**
 *
 * §9.5 결정 9~11이 그 배치를 스스로 이름 붙였다 — *"이 축들은 스테이징에서 붉으므로 헛 반입
 * 한 번이 회차 한 번으로 줄었다"*. 그 문장은 **붉는 시점**을 든 것이지 반입 뒤의 모집단을
 * 비우자는 것이 아니고, 같은 절이 기계가 재는 목록을 열거하며 *"그것도 전부 반입 뒤다"*라
 * 적는다(§9.5 «이 절이 재지 못하는 것»). 이 파일은 그 목록의 빠진 셋을 반입 뒤에서 잰다.
 *
 * ## 기대값의 출처 — 전부 정본이다
 *
 * 구현도 스테이징 검사기도 읽고 기대값을 만들지 않았다. 아래 각 축은 §번호로 근거를 든다.
 *
 * ## 이 파일이 **안 하는 것** — §9.5 결정 11
 *
 * *"관측 동결을 계약으로 쓰지 않는다."* 그래서 아래 어느 축도 「오늘 실물이 우연히 든 값」을
 * 박지 않는다. 재는 것은 정본이 **규격으로 올린 성질** 셋뿐이고, 같은 절이 ㉠에서 떨어뜨린
 * 자리(`connection-status`의 요소 종류 · `transcript`의 명시 `aria-live` · `:root`의
 * `color-scheme`)는 여기서 **안 잰다** — 재면 그 절이 폐기한 프레임을 이 파일이 되살린다.
 *
 * ## 이 파일이 재지 못하는 것
 *
 * 1. **부분 문자열·정규식 대조라 파서가 아니다.** 속성 값 안의 `>`를 태그의 끝으로 읽고,
 *    같은 태그의 중첩을 첫 닫는 태그에서 끊는다. 형제 QA 파일이 같은 한계를 이미 적었다.
 * 2. **잠금이 눈에 어떻게 보이는가는 안 잰다.** §9.6 «이 절이 재지 못하는 것»이 그리기 층을
 *    C2의 브라우저에 맡겼고, 아래 축이 재는 것은 *"잠금이 무동작이면"*(§9.5 결정 10)의
 *    **무동작 여부**이지 그 자국의 크기가 아니다.
 * 3. **프롬프트를 안 연다.** 규격이 원격 프롬프트에 사본으로 사는지는 §9.5가 이미 «재지 못하는
 *    것»으로 적었다.
 *
 * ## 경계 — 계약 승격은 이 파일이 안 정한다
 *
 * 이 파일은 QA 산출물이다. 승격 판정은 `K-352`가 열고, 이 주석은 그 카드를 앞질러 적지 않는다.
 *
 * ## `DOC-CITATION.md` §6 U-b — 이 파일이 지는 인용 계약 (강제 선언)
 *
 * 이 파일은 `packages/serve/test/`에 있어 §6 U-b가 그은 자리 안이다. 그래서 이 파일의 겹화살괄호
 * 표기는 전부 정본(`docs/WEB-UI.md` §9.5·§9.6 · `docs/ARCHITECTURE.md` §2.6)의 문면을 그대로
 * 옮긴 것이고, 정본에 없는 조어는 겹화살괄호로 싣지 않는다. 자리 전량을 도는 대조 축이 이 선언의
 * 참을 파일 단위로 따로 잰다.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { ANCHOR_NAMES } from "../client/anchors.js";
import {
  ASSET_MANIFEST,
  type AssetEntry,
  AUTHORED_ASSET_ROOT,
  assetFilePath,
  isHtmlDocumentEntry,
} from "../src/assets.ts";

// ---------------------------------------------------------------------------
// 실물 — 매니페스트에서 나온 경로로만 연다 (경로를 손으로 적지 않는다)
// ---------------------------------------------------------------------------

/**
 * 화면의 원문. **모집단은 `generated`이면서 HTML 문서인 엔트리**다 — §9.4 결정 8·12가 그
 * 술어를 공유하고, `isHtmlDocumentEntry`가 그 정본이다.
 */
const screenEntries: readonly AssetEntry[] = Object.values(ASSET_MANIFEST).filter(
  (entry) => entry.origin === "generated" && isHtmlDocumentEntry(entry),
);

const screenSource: string = screenEntries
  .map((entry) => readFileSync(assetFilePath(entry), "utf8"))
  .join("\n");

/** 배선의 그리기 층. §9.6 결정 1이 *"DOM을 아는 것은 마지막 하나뿐"*이라 든 자리다 */
const renderSource: string = readFileSync(join(AUTHORED_ASSET_ROOT, "render.js"), "utf8");

const stripComments = (html: string): string => html.replace(/<!--[\s\S]*?-->/g, "");

/** 그 `id`를 든 요소의 **태그 이름과 여는 태그의 속성부**. 없으면 `null` */
function openingTagOf(html: string, id: string): { tag: string; attrs: string } | null {
  const found = new RegExp(`<([a-zA-Z][-a-zA-Z0-9]*)\\b([^<>]*\\bid="${id}"[^<>]*)>`).exec(
    stripComments(html),
  );
  return found === null ? null : { tag: (found[1] ?? "").toLowerCase(), attrs: found[2] ?? "" };
}

// ---------------------------------------------------------------------------
// 모집단 — 이름은 앵커 상수에서 온다. 손으로 옮겨 적지 않는다
// ---------------------------------------------------------------------------

/**
 * 컨트롤 셋. **정본이 한 자리에 열거하지 않으므로 두 항에서 모은다** — §9.5 결정 10이
 * *"`run-abort`·`transcript-load-more`가 §9.6에서 아직 안 붙는 것은 이 판정을 안 미룬다"*로 둘을
 * 이름으로 들고 *"셋은 이 프롬프트가 이미 한 낱말(«컨트롤»)로 묶어 부르는 집합이다"*로 수를
 * 든다. 셋째는 §9.6 결정 2가 *"`composer-submit`의 문면을 배선이 짓지 않는다"*로 든 자리다.
 *
 * **[미규정]** 그 셋의 열거가 정본 한 자리에 없다. 오늘은 두 항을 합쳐 셋이 유일하게 결정되나,
 * 넷째 컨트롤이 화면에 서는 날 이 모집단의 정본이 어디인가가 새로 열린다 — 판정 필요.
 */
const CONTROL_SET = ["composer-submit", "run-abort", "transcript-load-more"] as const;

/** §9.5 결정 10이 다중행을 요구한 자리 */
const MULTILINE_INPUT = "composer-input";

/** §9.5 결정 10이 명시 고지를 요구한 자리 */
const ANNOUNCED_STATUS = "connection-status";

describe("축 0 — 아래 축들이 공집합에서 참이 되지 않는다", () => {
  test("화면이 정확히 하나이고 원문이 비어 있지 않다", () => {
    expect(screenEntries.length).toBe(1);
    expect(screenSource.length).toBeGreaterThan(0);
  });

  test("모집단의 이름이 전부 앵커다 — 이 파일이 화면 밖 이름을 재고 있지 않다", () => {
    // `ANCHOR_NAMES`를 넓은 문자열 배열로 받는다. 좁은 채로 두면 이 축이 **타입으로 이미
    // 참**이 되어 런타임에 아무것도 안 재게 된다 — 형제 계약 테스트가 같은 자리에 쓴 규율이다.
    const anchors: readonly string[] = ANCHOR_NAMES;
    const names: readonly string[] = [...CONTROL_SET, MULTILINE_INPUT, ANNOUNCED_STATUS];
    expect(names.filter((name) => !anchors.includes(name))).toEqual([]);
  });

  test("모집단의 요소가 화면에 전부 실재한다", () => {
    const names: readonly string[] = [...CONTROL_SET, MULTILINE_INPUT, ANNOUNCED_STATUS];
    expect(names.filter((name) => openingTagOf(screenSource, name) === null)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 축 S-1 — 다중행 입력 (§9.5 결정 10)
// ---------------------------------------------------------------------------

/**
 * *"`<input type="text">`는 붙여넣은 줄바꿈을 값 정규화 단계에서 없앤다 — 사용자가 준 것이
 * 소리 없이 갈리는 경로이고 그것이 §2.6이다. 다중행 텍스트를 받는 폼 컨트롤은 HTML에
 * `<textarea>` 하나이므로 **이 항은 요소 이름을 지목한다**"* (§9.5 결정 10).
 *
 * 그래서 이 축만은 표기를 잰다 — §9.5 결정 9의 예외 *"표기가 그 성질의 유일한 철자"*다.
 */
describe("축 S-1 — `composer-input`이 여러 줄을 받는다 (§9.5 결정 10)", () => {
  test("`composer-input`이 `<textarea>`다", () => {
    expect(openingTagOf(screenSource, MULTILINE_INPUT)?.tag).toBe("textarea");
  });

  test('역검증 — `<input type="text">`로 낸 화면이 붉는다 (결정 10이 실측한 그 형태)', () => {
    const regressed = `<label for="composer-input">m</label><input type="text" id="composer-input">`;
    expect(openingTagOf(regressed, MULTILINE_INPUT)?.tag).not.toBe("textarea");
  });

  test("역검증 — 자리가 아예 없으면 그린이 아니라 `null`이다", () => {
    expect(openingTagOf("<div></div>", MULTILINE_INPUT)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 축 S-2 — 컨트롤 셋이 잠금을 지는 요소다 (§9.5 결정 10 · §9.6 결정 5)
// ---------------------------------------------------------------------------

/**
 * *"§9.6 결정 5가 왕복 동안 제출을 잠그기로 했고, **잠금이 무동작이면** 그 항이 «눌렀는데 아무
 * 일도 안 난다»를 막으려 세운 층이 그대로 그 상태가 된다. `disabled`를 지는 것은 폼 컨트롤이고
 * 문면을 지고 눌리는 자리로 이 화면이 쓰는 것은 `<button>`이다"* (§9.5 결정 10).
 *
 * **요소 이름을 재는 근거가 관측이 아니라 정본의 지목이다.** 폼 컨트롤 전체를 열거하면 그것이
 * 곧 §9.5 결정 9가 거부한 «외부 명세의 사본»이 된다 — 정본이 이 화면에 대해 `<button>` 하나를
 * 지목했으므로 그 지목을 그대로 잰다.
 */
describe("축 S-2 — 컨트롤 셋이 활성·잠금을 지는 요소다 (§9.5 결정 10 · §9.6 결정 5)", () => {
  test("컨트롤 셋이 전부 `<button>`이다", () => {
    const wrong = CONTROL_SET.filter((id) => openingTagOf(screenSource, id)?.tag !== "button");
    expect(wrong).toEqual([]);
  });

  test('역검증 — `<div role="button">`으로 낸 컨트롤이 붉는다 (`disabled`가 무동작인 형태)', () => {
    const regressed = `<div role="button" tabindex="0" id="composer-submit">Send</div>`;
    expect(openingTagOf(regressed, "composer-submit")?.tag).not.toBe("button");
  });

  test("역검증 — `<a>`로 낸 컨트롤도 붉는다", () => {
    const regressed = `<a href="#" id="run-abort">Stop run</a>`;
    expect(openingTagOf(regressed, "run-abort")?.tag).not.toBe("button");
  });
});

/**
 * **잠금이 실제로 무동작이 아닌가 — 두 층을 한 축이 잇는다.**
 *
 * §9.5 결정 10의 ㉠이 든 실패는 화면이 잠금을 못 지는 요소를 냈고 배선은 그것을 모른 채
 * `disabled`를 토글하는 것이고, 그 상태는 **조용하다**(`ARCHITECTURE.md` §2.6). 그리기 층이
 * 그 앵커에 `disabled`를 쓰는 것과 화면의 그 자리가 `<button>`인 것이 **둘 다 참일 때만** 잠금이
 * 실물이므로, 어느 한쪽만 재는 축은 이 실패를 못 본다.
 *
 * **표기가 아니라 결합을 잰다.** 그리기 층이 어떤 API로 쓰는가는 세부이나(§9.6 — *"함수
 * 이름·문면·파일 수는 세부"*), `disabled`라는 낱말이 그 앵커 곁에 아예 없으면 결정 5의 잠금이
 * 코드에 없다는 뜻이다.
 */
describe("축 S-2b — 잠금이 무동작이 아니다 (§9.5 결정 10 ㉠ · §9.6 결정 5)", () => {
  test("그리기 층이 `composer-submit`에 `disabled`를 쓴다", () => {
    const line = renderSource
      .split("\n")
      .find((row) => row.includes("composer-submit") && row.includes("disabled"));
    expect(
      line,
      "그리기 층이 그 앵커에 잠금을 안 쓴다 — 결정 5의 잠금이 코드에 없다",
    ).toBeDefined();
  });

  test("그 앵커가 화면에서 `disabled`를 지는 요소다 — 두 층이 맞물린다", () => {
    expect(openingTagOf(screenSource, "composer-submit")?.tag).toBe("button");
  });
});

// ---------------------------------------------------------------------------
// 축 S-3 — 명시 `aria-live` (§9.5 결정 10)
// ---------------------------------------------------------------------------

/**
 * *"성질은 «초점을 안 뺏고 고지된다»이고 `<output>`·`role="status"`의 암묵 live로도 성립한다.
 * 그러나 그것을 기계가 읽으려면 **요소→암묵 role 매핑표를 이 레포가 사본으로 들어야 하고**, 그
 * 사본은 외부 명세를 좇아 낡는다. **그래서 명시 `aria-live="polite"` 하나를 규격이 지목한다** —
 * 사본 없이 같은 것을 재고 … **요소와 role은 자유다**"* (§9.5 결정 10).
 *
 * 그래서 이 축은 `aria-live`의 값 하나만 보고 **요소 종류도 `role`도 안 본다** — 보면 §9.5
 * 결정 11이 폐기한 관측 동결을 이 파일이 되살린다.
 */
describe('축 S-3 — `connection-status`가 명시 `aria-live="polite"`를 든다 (§9.5 결정 10)', () => {
  test('그 자리가 `aria-live="polite"`를 든다', () => {
    expect(openingTagOf(screenSource, ANNOUNCED_STATUS)?.attrs).toMatch(/\baria-live="polite"/);
  });

  test("요소 종류와 `role`은 안 잰다 — 정본이 «요소와 role은 자유다»로 닫았다", () => {
    // 이 축이 성립하는 요소가 하나가 아님을 합성으로 실증한다. 둘 다 규격을 만족한다.
    const asOutput = `<output id="connection-status" aria-live="polite"></output>`;
    const asSpan = `<span id="connection-status" role="status" aria-live="polite"></span>`;
    expect(openingTagOf(asOutput, ANNOUNCED_STATUS)?.attrs).toMatch(/\baria-live="polite"/);
    expect(openingTagOf(asSpan, ANNOUNCED_STATUS)?.attrs).toMatch(/\baria-live="polite"/);
  });

  test("역검증 — 암묵 live만 든 산출이 붉는다 (§9.5 결정 10이 규격을 세운 그 회차의 형태)", () => {
    const implicitOnly = `<output id="connection-status"></output>`;
    expect(openingTagOf(implicitOnly, ANNOUNCED_STATUS)?.attrs ?? "").not.toMatch(
      /\baria-live="polite"/,
    );
  });

  test('역검증 — `aria-live="assertive"`는 «초점을 안 뺏고»가 아니라 붉는다', () => {
    const assertive = `<span id="connection-status" aria-live="assertive"></span>`;
    expect(openingTagOf(assertive, ANNOUNCED_STATUS)?.attrs ?? "").not.toMatch(
      /\baria-live="polite"/,
    );
  });

  test("역검증 — 접두 충돌이 값을 빌려 주지 않는다", () => {
    const neighbour = `<span id="connection-status-label" aria-live="polite">Link</span><span id="connection-status"></span>`;
    expect(openingTagOf(neighbour, ANNOUNCED_STATUS)?.attrs ?? "").not.toMatch(
      /\baria-live="polite"/,
    );
  });
});
