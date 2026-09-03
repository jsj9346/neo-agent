/**
 * 공개 트리 주소 해결 — `PUBLIC-TREE.md` §3의 기계화(순수 판정 표면).
 *
 * **기대값의 출처는 둘뿐이다.** `docs/PUBLIC-TREE.md` §1·§3.1~§3.5·§6 문면과
 * `scripts/address.d.mts`의 시그니처·JSDoc. **`scripts/address.mjs`의 구현 본문은 열지
 * 않았다** — 이 파일을 쓰는 동안 그 파일을 한 번도 읽지 않았고, 실행부
 * (`scripts/check-address.mjs`)도 열지 않았다. 형제 `doc-citation.contract.test.ts`·
 * `doc-status.contract.test.ts`가 같은 격리를 든다. 구현이 문서와 어긋나면 **문서가 이긴다** —
 * 실패는 실패인 채로 남긴다.
 *
 * 축은 §3의 절 번호를 딴다:
 *   - 축 0  — §3.3·§3.2 표면 상수(부류 셋·위반 여섯·접두 목록 둘). 「닫혔다」가 계약인 값은
 *     `skipLibCheck` 아래에서 타입이 안 재므로 런타임 단언이 그 몫을 든다(`address.d.mts` 머리)
 *   - 축 1  — §1: 문서 머리의 `- 근거:` 줄이 §3 모집단 밖이라는 것과, **그 예외가 머리 밖으로
 *     안 넓어진다는 것**. 그리고 §3.1의 재료(코드 스팬)에 억제·인용 블록 예외가 없다는 것(§3.4)
 *   - 축 2  — §3.1: 꼴 넷의 판별. 접두 뒤 경계, 넷째 꼴(경로 구분자 없음 · 대문자 시작 · `.md`
 *     종료 · **스팬 전체**), 「넷 중 어디에도 안 걸리면 주소가 아니다」
 *   - 축 3  — §3.1 제외 셋(꺾쇠 자리표·줄임표 / 글롭 별표 / 줄번호·절번호 꼬리)의 양성·음성
 *   - 축 4  — 꼴 우선순위. §3.1 *"비공개·동결 접두를 먼저 본다"* + `address.d.mts`
 *     `AddressForm`의 *"작은 번호가 이긴다"*(꼴 ① vs 꼴 ④)
 *   - 축 5  — §3.2: 해결 순서 3단과 「첫 적중이 답 · 부류는 착지가 정한다」
 *   - 축 6  — §3.2: 그림자. `shadowed-address`와 **실패가 아닌 자리 둘**(디렉터리 주소 ·
 *     부류가 같은 파일 둘)
 *   - 축 7  — §3.2·§3.3: 위반 여섯의 양성 사례
 *   - 축 8  — §3.3·§3.4: `dead-section`의 **범위 한정**과 탈출 표기 `§<절번호>(구)`
 *   - 축 9  — §3.2: 미판정(`unjudged`) 갈래 — 통과가 아니라 계수 대상이고 이 갈래에서만
 *     부류를 접두가 준다
 *   - 축 10 — §6: `unmapped-doc`. **원문 문자열을 안 받는다**(*"새 순회를 만들지 않는다"*)
 *   - 축 11 — §3.5: 순수성. 이 모듈은 트리를 안 읽는다 — 판정은 넘겨받은 컨텍스트만 본다
 *
 * **이 파일이 안 재는 것(커버리지 귀속처를 남긴다 — 안 적으면 그린으로 오인된다).**
 *   - §3.1 모집단 파일 집합(공개 트리 추적 `.md` 스물다섯) · §3.5 fail-closed 그물 셋 ·
 *     출력 형식(위반 행 · 부류별 요약 · 미판정 수) — 전부 **실행부**의 계약이고 그 파일은
 *     이 사이클에 아직 없다. 플랜 T-003·T-008의 몫이다
 *   - §3.1 «코드 주석은 안 잰다»(§9 U-b) · §9 U-a·U-f — 정본이 스스로 안 닫은 자리
 *   - §3.5 «게이트가 잡지 못하는 것»(절이 실재해도 문면 대조는 안 한다) — 부재의 계약이라
 *     축 7의 `sectionsOf` 단언이 간접으로만 든다
 *   - §4·§5·§7 — 이 모듈의 표면이 아니다
 *
 * **[미규정] 표시가 붙은 단언은 정본이 값을 안 정한 자리다.** 임의 판정하지 않고 계약이
 * 실제로 요구하는 만큼만 좁혀 걸었다. 목록은 각 단언의 주석에 있다.
 *
 * ---
 *
 * ## 대조 원장 — 계약 항목 53 중 44 대조 (2026-09-03)
 *
 * 항목은 §1·§3.1~§3.5·§6을 문장 단위로 끊어 센 것이다. **미대조 아홉은 전부 귀속처가
 * 있다** — 안 적으면 대조하지 않은 항목이 그린으로 오인된다.
 *
 * | § | 항목 | 판정 |
 * |---|---|---|
 * | §1 | 머리 `- 근거:` 줄이 모집단 밖 / 예외가 머리 밖으로 안 넓어짐 / 예외 목록 없음 | 대조 3/3 |
 * | §3.1 | 꼴 ①~④ · 접두 뒤 경계 · 넷 밖은 주소 아님 · 맨 이름의 부류 · 접두 우선 · 꼴 우선순위 · 제외 셋(자리표·글롭·꼬리 둘) | 대조 13/15 |
 * | §3.1 | 모집단 파일 집합(추적 `.md` 전부) | 미대조 — 실행부의 순회이고 이 모듈의 표면이 아니다 |
 * | §3.1 | 코드 주석은 안 잰다 | 미대조 — 정본 미결(§9 U-b) |
 * | §3.2 | 권위 셋 분리 · 부류 셋 · 접두 목록 둘 · 해결 순서 3단 · 맨 이름 색인 · 미해결 갈림 · 추적 질의 · 그림자 셋 · 비공개 허용 · 미판정 | 대조 13/13 |
 * | §3.3 | Address 형태 · 위반 여섯 · Verdict 세 갈래 · 유니온 분리 · dead-section · unmapped-doc | 대조 6/7 |
 * | §3.3 | §4.2가 이 부류에 귀속시킨 측정 | **문서 부정확** — 아래 F-2 |
 * | §3.4 | `§<절번호>(구)` 인식 · 나머지 둘은 파서 대상 아님 · 억제 없음 | 대조 4/5 |
 * | §3.4 | 범위 표기 끝점의 접두 | 미대조 — 정정 작업(T-004)의 대상이지 이 모듈의 표면이 아니다 |
 * | §3.5 | 판정/실행부 분리(트리를 안 읽는다) · 문면 대조를 안 한다 | 대조 2/7 |
 * | §3.5 | 판정 안 된 문서 · 출력 형식 · fail-closed 그물 셋 · 착지 순서 | 미대조 — 실행부(T-003·T-008) |
 * | §3.5 | 맨 이름이 여는 새 구멍 | 미대조 — 정본 미결(§9 U-f) |
 * | §6 | 원문을 안 받는다 · 진입점 둘의 합집합 | 대조 2/3 |
 * | §6 | 진입점이 모집단에 든다 | 미대조 — 실행부 |
 *
 * ## 발견 — 등급별
 *
 * **계약 위반 1 (F-1).** 절번호 꼬리 앞의 공백이 안 벗겨진다. 「축 3: 절번호 꼬리와 경로
 * 사이의 공백」의 `it` 둘이 **실패 상태로 남아 있다** — 구현이 문서와 어긋나면 문서가
 * 이긴다. 원인 쪽(구분자 표기)은 §3.1이 안 정했으나 **결과 쪽은 정했다**: 같은 행이
 * *"벗기고 경로만 해결하며"*라 적었고 §2·§3.1의 근거가 오탐 0이다. 파서는 공백형을
 * 받아들이면서(`ok: true` · `section` 추출) 경로에 공백을 남겨, 멀쩡한 주소를
 * `dead-public`으로 거짓 적발할 수 있다. 2026-09-03 코퍼스 실측 0건이라 착지 첫날 레드는
 * 안 는다.
 *
 * **문서 부정확 1 (F-2).** §4.2 *"그 §의 실재는 §3.3의 `dead-section`이 잰다"*가 실물에서
 * 거짓이다. 같은 절이 정한 정본 셀 문법이 *"백틱으로 감싼 문서명 하나 + `§<절번호>`"* —
 * § 번호가 스팬 밖 — 인데, 좁은 범위의 `dead-section`은 그 꼴에 반응하지 않는다. 실제로
 * 재는 것은 §4.4의 별도 갈래다. 축 8의 증인 `it`이 이 자리를 고정한다.
 *
 * **미규정(판정 필요) 5.** 각각 `[미규정]` 주석이 붙어 있다 —
 * ① 공개 트리 최상위 엔트리 목록의 파생(디스크인가 추적인가. `address.d.mts`가 이미 든다)
 * ② 접두·잘린 글롭 경로의 끝 슬래시 표기 ③ `candidatePaths`의 중복 제거 여부
 * ④ 짝이 안 맞는 백틱의 침묵(형제 규약은 같은 자리에 라벨 있는 실패를 뒀다)
 * ⑤ `unmappedDocs`의 중복 입력 처리.
 *
 * ---
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로 있는 부분 문자열이어야
 * 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 문서를 줄번호로 가리키는 자리는 두지 않았다 —
 * 지목은 절 번호와 필드 이름으로 한다.
 */

import { describe, expect, it } from "vitest";
import {
  type AddressContext,
  type AddressLanding,
  type AddressRead,
  candidatePaths,
  classOf,
  codeSpans,
  documentSections,
  FROZEN_TREES,
  HEAD_LINE_LIMIT,
  judgeAddress,
  PRIVATE_RECORD_PREFIXES,
  PRODUCT_TREE,
  readAddress,
  resolveAddress,
  unmappedDocs,
  VIOLATIONS,
} from "../../../scripts/address.mjs";

// ---------------------------------------------------------------------------
// 고정 재료 — 전부 정본 문면에서 왔다
// ---------------------------------------------------------------------------

/**
 * §3.1 꼴 ①의 재료. *"레포 루트를 읽고 아래 두 목록을 뺀 나머지"*.
 *
 * **[미규정] 이 목록의 파생이 디스크인가 추적인가를 정본이 안 정했다**(`address.d.mts`
 * `readAddress`의 JSDoc이 같은 자리를 미규정으로 든다). 이 파일은 목록을 **주입**하므로
 * 그 물음에 안 걸린다 — 값은 §2가 실물로 든 루트 엔트리에서 골랐다.
 */
const TOP_LEVEL = [
  ".gitignore",
  "LICENSE",
  "README.md",
  "THIRD_PARTY_NOTICES.md",
  "neo-agent-main",
];

/** 판정 대상 문서. §3.2 해결 순서의 첫 자리를 정한다. */
const DOC_PATH = "neo-agent-main/docs/PUBLIC-TREE.md";

type Kind = "file" | "directory" | "absent";
type Tree = Readonly<Record<string, Kind>>;

/** 경로 표기의 끝 슬래시 유무는 정본이 안 정했다 — 조회를 그 양쪽에 관대하게 둔다. [미규정] */
function probeFrom(tree: Tree) {
  return (path: string): Kind => {
    const bare = path.replace(/\/+$/, "");
    return tree[path] ?? tree[bare] ?? tree[`${bare}/`] ?? "absent";
  };
}

type CtxOptions = {
  docPath?: string;
  publicTree?: Tree;
  recordTree?: Tree;
  /** 이 실행 환경에 없는 트리의 접두. §3.2 마지막 문단 — 없으면 미판정이다 */
  absentTrees?: readonly string[];
  basenames?: Readonly<Record<string, readonly string[]>>;
  sections?: Readonly<Record<string, readonly string[]>>;
};

function makeContext(options: CtxOptions = {}): AddressContext {
  const absent = (options.absentTrees ?? []).map((t) => t.replace(/\/+$/, ""));
  const basenames = options.basenames ?? {};
  const sections = options.sections ?? {};
  return {
    docPath: options.docPath ?? DOC_PATH,
    probePublic: probeFrom(options.publicTree ?? {}),
    probeRecord: probeFrom(options.recordTree ?? {}),
    treePresent: (prefix) => !absent.includes(prefix.replace(/\/+$/, "")),
    basenameIndex: new Map(Object.entries(basenames)),
    sectionsOf: (path) => sections[path] ?? [],
  };
}

type OkRead = Extract<AddressRead, { ok: true }>;
type BadRead = Extract<AddressRead, { ok: false }>;

/**
 * 주소로 읽혔다는 것을 **단언으로 만든다.** 비단언 분기는 *"0건인데 통과"*를 침묵으로
 * 바꾼다 — 형제 계약 테스트가 2026-08-13에 실제로 밟은 함정이라 여기서 반복하지 않는다.
 */
function asAddress(text: string, entries: readonly string[] = TOP_LEVEL): OkRead {
  const read = readAddress(text, entries);
  expect(read.ok, `주소로 안 읽혔다: ${text}`).toBe(true);
  return read as OkRead;
}

function notAddress(text: string, entries: readonly string[] = TOP_LEVEL): BadRead {
  const read = readAddress(text, entries);
  expect(read.ok, `주소로 읽혔다(모집단 밖이어야 한다): ${text}`).toBe(false);
  return read as BadRead;
}

function texts(source: string): string[] {
  return codeSpans(source).map((span) => span.text);
}

// ---------------------------------------------------------------------------
// 축 0 — 표면 상수 (§3.2 표 · §3.3 유니온)
// ---------------------------------------------------------------------------

describe("PUBLIC-TREE §3.3 — 축 0: 위반 이름 여섯이 닫혀 있다", () => {
  it("VIOLATIONS의 값이 §3.3 유니온의 여섯과 정확히 같다", () => {
    expect([...Object.values(VIOLATIONS)].sort()).toEqual([
      "ambiguous-basename",
      "dead-public",
      "dead-record",
      "dead-section",
      "shadowed-address",
      "unmapped-doc",
    ]);
  });

  it("키 여섯이 값 여섯과 1:1이다 — 라벨이 겹치면 출력이 갈래를 못 가른다", () => {
    const values = Object.values(VIOLATIONS);
    expect(new Set(values).size).toBe(values.length);
    expect(Object.keys(VIOLATIONS)).toHaveLength(6);
  });

  /**
   * §3.3 — *"`DOC-CITATION.md`의 위반 유니온과 합치지 않는다. 그쪽은 형식이고 이쪽은
   * 존재다."* 그 문서 §3.2의 갈래 둘은 `unpinned-doc-line`·`self-section-line`이고
   * (형제 `doc-citation.contract.test.ts`가 같은 값을 든다), 이름이 겹치면 §1이 그은 경계가
   * 그 순간 거짓이 된다.
   */
  it("DOC-CITATION의 위반 이름과 한 자리도 안 겹친다", () => {
    const citation = ["unpinned-doc-line", "self-section-line"];
    const overlap = Object.values(VIOLATIONS).filter((name) =>
      citation.includes(name as (typeof citation)[number]),
    );
    expect(overlap).toEqual([]);
  });
});

describe("PUBLIC-TREE §3.2 — 축 0: 접두 목록 둘은 닫힌 목록이다", () => {
  /** §3.2 표 둘째 행 — 열하나를 이름으로 든다. 끝 슬래시 표기까지 그 표를 그대로 옮겼다. */
  it("PRIVATE_RECORD_PREFIXES가 §3.2 표의 열하나와 같다", () => {
    expect([...PRIVATE_RECORD_PREFIXES].sort()).toEqual(
      [
        ".claude/",
        "CLAUDE.md",
        "devlog.md",
        "devnotes/",
        "idea.md",
        "kanban.md",
        "backlog.md",
        "MILESTONE.md",
        "milestones/",
        "docs/",
        "plans/",
      ].sort(),
    );
  });

  /** §3.2 표 셋째 행 · `address.d.mts` — *"`DOC-CITATION.md` §3.1이 든 값과 같다"*. */
  it("FROZEN_TREES가 동결 스냅샷 둘이다", () => {
    expect([...FROZEN_TREES].sort()).toEqual(["hermes-agent-main/", "openclaw-main/"]);
  });

  /** §3.2 — 해결 순서의 둘째 자리. **[미규정] 끝 슬래시 표기는 정본이 안 정했다.** */
  it("PRODUCT_TREE가 제품 트리를 가리킨다", () => {
    expect(PRODUCT_TREE.replace(/\/+$/, "")).toBe("neo-agent-main");
  });

  /** §3.5 — *"`check-doc-status.mjs`의 대상은 머리 40줄"*. §1 예외가 사는 창이다. */
  it("HEAD_LINE_LIMIT가 40이다", () => {
    expect(HEAD_LINE_LIMIT).toBe(40);
  });
});

describe("PUBLIC-TREE §3.2 — 축 0: classOf는 착지 «경로»의 부류다", () => {
  it.each([
    ["neo-agent-main/docs/PUBLIC-TREE.md", "public"],
    ["neo-agent-main/README.md", "public"],
    ["LICENSE", "public"],
    ["docs/openclaw-architecture.md", "internal"],
    ["CLAUDE.md", "internal"],
    ["plans/20260903-x.md", "internal"],
    ["devnotes/20260903-devnote.md", "internal"],
    ["openclaw-main/docs/x.md", "frozen"],
    ["hermes-agent-main/SECURITY.md", "frozen"],
  ])("%s → %s", (path, cls) => {
    expect(classOf(path)).toBe(cls);
  });
});

// ---------------------------------------------------------------------------
// 축 1 — §1 예외와 §3.1의 재료
// ---------------------------------------------------------------------------

describe("PUBLIC-TREE §1 — 축 1: 문서 머리의 `- 근거:` 줄은 모집단 밖이다", () => {
  /**
   * §1 — *"두 게이트가 같은 문자열에 반대 요구를 걸면 어느 쪽도 지킬 수 없다."*
   * `DOC-STATUS.md` §3.2가 `구현 전`의 앵커를 **아직 없어야 하는 경로**로 정의한다.
   */
  it("머리 창 안의 `- 근거:` 줄에 있는 스팬은 안 잡힌다", () => {
    const source = [
      "# 제목",
      "",
      "- 상태: 구현 전",
      "- 근거: `neo-agent-main/scripts/NOT-YET.mjs`",
      "",
      "본문의 `neo-agent-main/docs/PUBLIC-TREE.md`",
    ].join("\n");
    expect(texts(source)).toEqual(["neo-agent-main/docs/PUBLIC-TREE.md"]);
  });

  /**
   * **예외가 머리 밖으로 안 넓어진다.** §1이 뺀 것은 *"문서 머리의"* 그 줄 하나이고
   * (`address.d.mts` `HEAD_LINE_LIMIT`가 같은 자리를 든다), §1 자신이 바로 다음 문단에서
   * *"예외 목록을 두지 않는다"*고 적었다. 꼴만 같은 본문 줄까지 빠지면 그 문장이 거짓이 된다.
   */
  it("머리 창 밖의 같은 꼴 줄은 모집단 안이다", () => {
    const filler = Array.from({ length: HEAD_LINE_LIMIT - 5 }, () => "채움 줄");
    const source = [
      "# 제목",
      "",
      "- 상태: 구현 전",
      "- 근거: `neo-agent-main/scripts/IN-HEAD.mjs`",
      "",
      ...filler,
      "- 근거: `neo-agent-main/scripts/OUT-OF-HEAD.mjs`",
    ].join("\n");
    const found = texts(source);
    expect(found).toContain("neo-agent-main/scripts/OUT-OF-HEAD.mjs");
    expect(found).not.toContain("neo-agent-main/scripts/IN-HEAD.mjs");
  });

  it("`- 근거:`가 아닌 머리 줄의 스팬은 안 빠진다", () => {
    const source = [
      "# 제목",
      "",
      "- 상태: 구현 완료",
      "- 관련: `neo-agent-main/docs/LORE.md`",
    ].join("\n");
    expect(texts(source)).toEqual(["neo-agent-main/docs/LORE.md"]);
  });
});

describe("PUBLIC-TREE §3.1·§3.4 — 축 1: 코드 스팬 수집에 예외가 없다", () => {
  it("펜스 안은 마스킹되고 줄번호는 1-기반이다", () => {
    const source = [
      "본문 `A-DOC.md`",
      "```ts",
      "const x = `B-DOC.md`;",
      "```",
      "끝 `C-DOC.md`",
    ].join("\n");
    expect(codeSpans(source)).toEqual([
      { text: "A-DOC.md", line: 1 },
      { text: "C-DOC.md", line: 5 },
    ]);
  });

  /** §3.4 — *"억제 목록도 인용 블록 예외도 두지 않는다."* */
  it("인용 블록 안의 스팬도 잡힌다", () => {
    expect(texts("> 인용 안의 `Q-DOC.md`")).toEqual(["Q-DOC.md"]);
  });

  /**
   * **[미규정 — 판정 필요] 짝이 안 맞는 백틱은 조용히 사라진다.**
   *
   * §3.1은 오탐 0만 근거로 들고 미탐을 안 다뤘다(§9 U-a가 미탐 쪽을 자백한다). 형제 규약은
   * 같은 자리에 **라벨 있는 실패**를 뒀다 — `DOC-CITATION.md` §3.4 Q-7의 갈래 둘. 이쪽에는
   * 대응물이 없어, 백틱 하나가 빠지면 그 줄의 주소가 판정에서 통째로 빠지고 게이트는 초록을
   * 낸다. 오늘은 형제 게이트(`check-doc-citation.mjs`)가 `docs/*.md`에서 그 꼴을 먼저
   * 붉히므로 실질 노출은 없다. **이 `it`은 현재 동작을 증인으로 고정할 뿐 판정하지 않는다.**
   */
  it("[미규정] 닫히지 않은 백틱의 내용은 스팬으로 안 잡힌다", () => {
    expect(texts("본문 `neo-agent-main/docs/PUBLIC-TREE.md 와 닫히지 않음")).toEqual([]);
  });

  /** §3.3 — *"파일명은 이 타입에 없다"* · `line`은 *"출력용이며 판정에 쓰지 않는다"*. */
  it("Address의 필드는 text·line 둘뿐이다 — 파일명이 없다", () => {
    const [span] = codeSpans("`neo-agent-main/README.md`");
    expect(span).toBeDefined();
    expect(Object.keys(span as object).sort()).toEqual(["line", "text"]);
  });

  /** `readAddress`는 줄을 안 받는다 — 판정이 `line`에 안 걸린다는 것의 표면 증거다. */
  it("readAddress는 (text, topLevelEntries) 둘만 받는다", () => {
    expect(readAddress.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 축 2 — §3.1 꼴 넷
// ---------------------------------------------------------------------------

describe("PUBLIC-TREE §3.1 — 축 2: 꼴 ①~③(접두)", () => {
  it.each([
    ["공개 최상위 접두 + 구분자", "neo-agent-main/docs/PUBLIC-TREE.md", 1, "public"],
    ["공개 최상위 접두 = 문자열 끝", "LICENSE", 1, "public"],
    ["비공개 접두(디렉터리)", ".claude/agents/qa-verifier.md", 2, "internal"],
    ["비공개 접두(루트 문서)", "devlog.md", 2, "internal"],
    ["비공개 접두 `docs/`", "docs/openclaw-architecture.md", 2, "internal"],
    ["동결 접두", "openclaw-main/src/gateway.ts", 3, "frozen"],
    ["동결 접두", "hermes-agent-main/SECURITY.md", 3, "frozen"],
  ])("%s — %s은 꼴 %i이고 접두 부류는 %s다", (_label, text, form, cls) => {
    const read = asAddress(text);
    expect(read.form).toBe(form);
    expect(read.prefixClass).toBe(cls);
    expect(read.path).toBe(text);
  });

  /** §3.1 — *"접두 뒤에는 경로 구분자가 오거나 문자열이 끝나야 한다."* */
  it.each([
    "neo-agent-mainX/docs/PUBLIC-TREE.md",
    "neo-agent-main2",
    "openclaw-main-fork/src/x.ts",
    "docsX/thing.md",
  ])("접두를 «접두사»로만 공유하는 문자열은 주소가 아니다 — %s", (text) => {
    expect(notAddress(text).reason).toBe("no-form");
  });
});

describe("PUBLIC-TREE §3.1 — 축 2: 꼴 ④(맨 문서 이름)", () => {
  /** *"경로 구분자를 안 갖고 대문자로 시작해 `.md`로 끝나는 스팬 전체"* + *"맨 이름의 부류는 공개다."* */
  it.each(["PUBLIC-TREE.md", "DOC-CITATION.md", "README.md", "LORE.md", "COMPLIANCE.md"])(
    "%s은 꼴 ④ 또는 그보다 앞선 꼴로 읽히고 부류 후보가 있다",
    (text) => {
      const read = asAddress(text, ["neo-agent-main"]);
      expect(read.form).toBe(4);
      expect(read.path).toBe(text);
      expect(read.prefixClass).toBe("public");
    },
  );

  /** *"스팬 전체"* — 이름 앞뒤에 다른 글자가 붙으면 그 스팬은 맨 이름이 아니다. */
  it.each([
    ["소문자 시작", "readme.md"],
    ["`.md`가 아니다", "PUBLIC-TREE.mdx"],
    ["확장자 없음", "PUBLIC-TREE"],
    ["경로 구분자를 가졌다", "packages/cli/test/README.md"],
    ["스팬 전체가 아니다 — 산문이 섞였다", "PUBLIC-TREE.md 참조"],
    ["스팬 전체가 아니다 — 앞에 글자", "see PUBLIC-TREE.md"],
    ["MIME 타입", "application/json"],
    ["패키지 이름", "@neo-agent/core"],
    ["문맥에 기대는 상대 언급", "main.ts"],
    ["문맥에 기대는 상대 언급", "styles.css"],
  ])("%s — %s은 주소가 아니다", (_label, text) => {
    expect(notAddress(text, ["neo-agent-main"]).reason).toBe("no-form");
  });
});

// ---------------------------------------------------------------------------
// 축 3 — §3.1 제외 셋
// ---------------------------------------------------------------------------

describe("PUBLIC-TREE §3.1 — 축 3: 꺾쇠 자리표·줄임표를 뺀다", () => {
  /**
   * 셋 다 «뺀 규칙이 없었다면 주소였을» 문자열이다 — 그래야 `placeholder`가 실제로 그
   * 자리에서 발화하는지가 재진다(음성 대조군이 아니라 원인 격리).
   */
  it.each([
    "neo-agent-main/docs/<이름>.md",
    "neo-agent-main/docs/…/PUBLIC-TREE.md",
    "plans/YYYYMMDD-<이름>.md",
    "milestones/<번호>.md",
  ])("자리표가 섞이면 주소가 아니다 — %s", (text) => {
    expect(notAddress(text).reason).toBe("placeholder");
  });

  /** 규약이 표기 틀을 드는 실물. `§<절번호>`·`:<줄번호>`가 그 자리다. */
  it.each(["<절번호>", "§<절번호>", ":<줄번호>", "§<절번호>(구)"])(
    "표기 틀 자체는 주소가 아니다 — %s",
    (text) => {
      expect(notAddress(text).ok).toBe(false);
    },
  );
});

describe("PUBLIC-TREE §3.1 — 축 3: 글롭 별표", () => {
  /** *"첫 별표 앞의 마지막 경로 구분자까지로 잘라 남은 접두를 판정한다."* */
  it.each([
    ["neo-agent-main/packages/*/src", "neo-agent-main/packages", 1],
    ["neo-agent-main/docs/*.md", "neo-agent-main/docs", 1],
    ["openclaw-main/src/**/*.ts", "openclaw-main/src", 3],
    ["devnotes/*-devnote.md", "devnotes", 2],
  ])("%s은 %s까지 잘려 꼴 %i로 판정된다", (text, cut, form) => {
    const read = asAddress(text);
    expect(read.form).toBe(form);
    // **[미규정] 잘린 접두의 끝 슬래시 표기를 정본이 안 정했다.** 계약이 요구하는 것은
    // «어디까지 잘리는가»이므로 그 한 자리만 재고 표기는 정규화한다.
    expect(read.path.replace(/\/+$/, "")).toBe(cut);
  });

  /** *"자를 것이 없으면 주소가 아니다."* */
  it.each(["*.md", "*", "*-devnote.md", "PUBLIC-*.md"])(
    "첫 별표 앞에 구분자가 없으면 주소가 아니다 — %s",
    (text) => {
      expect(notAddress(text).reason).toBe("glob-unanchored");
    },
  );
});

describe("PUBLIC-TREE §3.1 — 축 3: 줄번호·절번호 꼬리를 벗긴다", () => {
  /**
   * 2026-09-03 명문화 콜아웃 — *"코퍼스의 실물은 `:80-85`·`:115,167`·`:1674-1692` 꼴이다."*
   * 좁게 읽으면 **동결 트리의 실재 파일 열둘이 착지 첫날 `dead-record`로 거짓 적발된다.**
   */
  it.each([
    ["단일", "openclaw-main/docs/providers/google.md:80", "openclaw-main/docs/providers/google.md"],
    ["범위", "hermes-agent-main/SECURITY.md:58-65", "hermes-agent-main/SECURITY.md"],
    ["목록", "openclaw-main/src/gateway.ts:115,167", "openclaw-main/src/gateway.ts"],
    ["넓은 범위", "openclaw-main/docs/agent-loop.md:1674-1692", "openclaw-main/docs/agent-loop.md"],
  ])("%s 줄번호 꼬리가 벗겨진다 — %s", (_label, text, path) => {
    const read = asAddress(text);
    expect(read.path).toBe(path);
    expect(read.section).toBeNull();
  });

  it("절번호 꼬리는 벗겨져 `section`으로 간다 — 꼴 ④", () => {
    const read = asAddress("PUBLIC-TREE.md§3.2", ["neo-agent-main"]);
    expect(read.path).toBe("PUBLIC-TREE.md");
    expect(read.section).toBe("3.2");
    expect(read.retired).toBe(false);
  });

  it("절번호 꼬리는 벗겨져 `section`으로 간다 — 경로 꼴", () => {
    const read = asAddress("neo-agent-main/docs/PUBLIC-TREE.md§3.5");
    expect(read.path).toBe("neo-agent-main/docs/PUBLIC-TREE.md");
    expect(read.section).toBe("3.5");
  });
});

/**
 * **[계약 위반 — 판정 필요] 절번호 꼬리 앞의 공백이 안 벗겨진다.**
 *
 * §3.1 표는 구분자를 안 정했으므로, 공백을 받는지 여부는 원인 쪽에서 미규정이다. 그러나
 * **결과 쪽은 미규정이 아니다** — 같은 행이 *"벗기고 **경로만** 해결하며"*라고 적었고,
 * §2·§3.1이 이 게이트의 근거로 든 것이 **오탐 0**이다. 파서는 공백형을 **받아들이면서**
 * (`ok: true`, `section`을 뽑는다) 경로에 공백을 남기므로, 그 경로는 어느 트리에서도 안
 * 풀려 멀쩡한 주소가 `dead-public`으로 거짓 적발된다. §3.1의 2026-09-03 콜아웃이
 * *"동결 트리의 실재 파일 열둘이 착지 첫날 `dead-record`로 거짓 적발된다"*며 좁은 읽기를
 * 물리친 것과 **같은 형태의 결함**이다.
 *
 * 아래 둘은 한 뿌리의 두 증상이다. 2026-09-03 코퍼스 실측으로는 두 꼴 다 0건이라 착지 첫날
 * 레드가 늘지는 않는다 — **오늘 안 터진다는 것이 규칙이 맞다는 뜻은 아니다.**
 */
describe("PUBLIC-TREE §3.1 — 축 3: 절번호 꼬리와 경로 사이의 공백", () => {
  it("경로 꼴 — 공백이 경로에 남으면 안 된다", () => {
    const read = asAddress("neo-agent-main/docs/PUBLIC-TREE.md §3.5");
    expect(read.section).toBe("3.5");
    expect(read.path).toBe("neo-agent-main/docs/PUBLIC-TREE.md");
  });

  /**
   * 같은 뿌리의 둘째 증상 — 남은 공백 때문에 스팬이 §3.1 꼴 ④의 *"`.md`로 끝나는 스팬
   * 전체"*를 못 만족해 **모집단에서 통째로 빠진다.** 파서가 경로 꼴에서는 같은 입력을
   * 받으므로, 공백을 안 받는다는 해석도 일관되지 않는다.
   */
  it("꼴 ④ — 공백으로 나뉜 절번호가 붙어도 주소다", () => {
    const read = asAddress("PUBLIC-TREE.md §3.2", ["neo-agent-main"]);
    expect(read.path).toBe("PUBLIC-TREE.md");
    expect(read.section).toBe("3.2");
  });
});

// ---------------------------------------------------------------------------
// 축 4 — 꼴 우선순위
// ---------------------------------------------------------------------------

describe("PUBLIC-TREE §3.1 — 축 4: 꼴 우선순위는 작은 번호가 이긴다", () => {
  /**
   * §3.1 — *"다만 **비공개·동결 접두를 먼저 본다**: `CLAUDE.md`·`MILESTONE.md`처럼 이 꼴과
   * 접두 목록에 동시에 걸리는 이름이 있다."* 이것이 꼴 ②가 꼴 ④를 이긴다는 뜻이고,
   * `address.d.mts` `AddressForm`이 *"작은 번호가 이긴다"*로 일반화한다.
   */
  it.each(["CLAUDE.md", "MILESTONE.md", "kanban.md", "backlog.md", "idea.md", "devlog.md"])(
    "%s은 꼴 ④가 아니라 꼴 ②로 읽히고 부류 후보가 비공개다",
    (text) => {
      const read = asAddress(text);
      expect(read.form).toBe(2);
      expect(read.prefixClass).toBe("internal");
    },
  );

  /**
   * 꼴 ① vs 꼴 ④ — 둘 다 걸리는 실물이 `README.md`·`THIRD_PARTY_NOTICES.md`다.
   * `address.d.mts`가 *"꼴 ①이 꼴 ④를 이기는 것(2026-09-03 유저 결정)"*으로 못박았다.
   */
  it.each(["README.md", "THIRD_PARTY_NOTICES.md"])(
    "%s은 공개 최상위 엔트리이므로 꼴 ①이 이긴다",
    (text) => {
      const read = asAddress(text);
      expect(read.form).toBe(1);
      expect(read.prefixClass).toBe("public");
    },
  );

  /** 같은 이름이라도 최상위 엔트리 목록에 없으면 꼴 ④로 떨어진다 — 판별이 목록에 걸린다. */
  it("최상위 엔트리에 없으면 같은 이름이 꼴 ④가 된다", () => {
    expect(asAddress("README.md", ["neo-agent-main"]).form).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 축 5 — §3.2 해결 순서
// ---------------------------------------------------------------------------

describe("PUBLIC-TREE §3.2 — 축 5: 해결 순서 3단", () => {
  /** *"인용한 문서의 디렉터리 → `neo-agent-main/` → 레포 루트."* */
  it("candidatePaths가 세 자리를 그 순서로 낸다", () => {
    expect(candidatePaths("scripts/address.mjs", "neo-agent-main/docs/PUBLIC-TREE.md")).toEqual([
      "neo-agent-main/docs/scripts/address.mjs",
      "neo-agent-main/scripts/address.mjs",
      "scripts/address.mjs",
    ]);
  });

  /** 인용 문서가 제품 트리 루트에 있으면 앞의 둘이 같은 자리다. **[미규정] 중복 제거 여부.** */
  it("첫 자리는 인용 문서의 디렉터리, 마지막 자리는 레포 루트다", () => {
    const cands = candidatePaths("docs/PUBLIC-TREE.md", "neo-agent-main/README.md");
    expect(cands[0]).toBe("neo-agent-main/docs/PUBLIC-TREE.md");
    expect(cands.at(-1)).toBe("docs/PUBLIC-TREE.md");
  });

  /** §3.2 — *"첫 적중이 답이고 착지한 트리가 부류다."* */
  it("첫 적중이 답이고 부류는 착지가 정한다 — 접두가 아니다", () => {
    // 접두로는 비공개(`docs/`)인데 공개 트리에 착지한다. §3.2가 «51자리가 갈렸다»고 든 자리.
    const read = asAddress("docs/PUBLIC-TREE.md");
    expect(read.prefixClass).toBe("internal");
    const context = makeContext({
      docPath: "neo-agent-main/README.md",
      publicTree: { "neo-agent-main/docs/PUBLIC-TREE.md": "file" },
    });
    expect(judgeAddress(read, context)).toEqual({ ok: true, cls: "public" });
  });

  it("resolveAddress는 첫 적중을 맨 앞에 두고 목록을 전부 돌려준다", () => {
    const read = asAddress("docs/SHADOW.md");
    const landings: AddressLanding[] = resolveAddress(read, {
      docPath: DOC_PATH,
      probePublic: probeFrom({ "neo-agent-main/docs/SHADOW.md": "file" }),
      probeRecord: probeFrom({ "docs/SHADOW.md": "file" }),
      basenameIndex: new Map(),
    });
    expect(landings.map((l) => l.path)).toEqual([
      "neo-agent-main/docs/SHADOW.md",
      "docs/SHADOW.md",
    ]);
    expect(landings.map((l) => l.cls)).toEqual(["public", "internal"]);
  });

  /**
   * §3.2 — *"맨 이름 꼴은 디렉터리를 걷지 않는다. 공개 트리에 추적된 `.md`의 **파일명 색인**
   * 에서 찾는다."*
   */
  it("맨 이름 꼴은 파일명 색인에서만 풀린다 — 디렉터리를 안 걷는다", () => {
    const read = asAddress("LORE.md", ["neo-agent-main"]);
    const landings = resolveAddress(read, {
      docPath: DOC_PATH,
      // 색인에 없지만 «디렉터리를 걸으면» 풀릴 자리를 트리에 심어 둔다
      probePublic: probeFrom({ "neo-agent-main/docs/LORE.md": "file" }),
      probeRecord: probeFrom({}),
      basenameIndex: new Map(),
    });
    expect(landings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 축 6 — 그림자
// ---------------------------------------------------------------------------

describe("PUBLIC-TREE §3.2 — 축 6: 그림자가 실패인 자리와 아닌 자리", () => {
  /** *"착지 후보가 둘 이상인데 부류가 갈리면 실패다."* */
  it("파일 둘의 부류가 갈리면 shadowed-address다", () => {
    const read = asAddress("docs/SHADOW.md");
    const verdict = judgeAddress(
      read,
      makeContext({
        publicTree: { "neo-agent-main/docs/SHADOW.md": "file" },
        recordTree: { "docs/SHADOW.md": "file" },
      }),
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.violation).toBe("shadowed-address");
  });

  /**
   * 실패가 아닌 자리 ① — **디렉터리 주소**(실물 75). *"부류는 갈리지만 디렉터리 주소가
   * 뜻하는 것은 자리이지 대상이 아니고, 첫 적중이 정확히 쓰는 사람이 뜻한 자리다."*
   */
  it("디렉터리 주소는 부류가 갈려도 실패가 아니다 — 첫 적중이 답이다", () => {
    const read = asAddress("docs/");
    const verdict = judgeAddress(
      read,
      makeContext({
        publicTree: { "neo-agent-main/docs/": "directory" },
        recordTree: { "docs/": "directory" },
      }),
    );
    expect(verdict).toEqual({ ok: true, cls: "public" });
  });

  /**
   * 실패가 아닌 자리 ② — **부류가 같은 파일 둘**(실물 5 — 루트와 공개 트리 양쪽에 추적되는
   * 무시 규칙 파일). *"부류는 안 갈리고 지목만 갈린다."*
   */
  it("부류가 같은 파일 둘은 실패가 아니다", () => {
    const read = asAddress(".gitignore");
    const verdict = judgeAddress(
      read,
      makeContext({
        publicTree: { "neo-agent-main/.gitignore": "file", ".gitignore": "file" },
      }),
    );
    expect(verdict).toEqual({ ok: true, cls: "public" });
  });

  /** *"예외 목록이 아니라 판정이다 — 둘 다 술어가 「부류가 갈리는가」 하나다."* */
  it("디렉터리와 파일이 섞여도 부류가 안 갈리면 통과다", () => {
    const read = asAddress("docs/");
    const verdict = judgeAddress(
      read,
      makeContext({ publicTree: { "neo-agent-main/docs/": "directory", "docs/": "file" } }),
    );
    expect(verdict).toEqual({ ok: true, cls: "public" });
  });
});

// ---------------------------------------------------------------------------
// 축 7 — 위반 여섯의 양성 사례
// ---------------------------------------------------------------------------

describe("PUBLIC-TREE §3.3 — 축 7: dead-public", () => {
  it("공개 부류인데 공개 트리에서 안 풀리면 dead-public이다", () => {
    const read = asAddress("neo-agent-main/docs/NOT-THERE.md");
    const verdict = judgeAddress(read, makeContext());
    expect(verdict).toEqual({
      ok: false,
      violation: "dead-public",
      detail: expect.any(String),
    });
  });

  /**
   * §3.4 첫 행 — *"세 트리 어디에서도 해결되지 않는 이름"*을 코드 스팬으로 쓰면 위반이다.
   * *"억제 목록도 인용 블록 예외도 두지 않는다."* 원격 디자인 시스템의 루트 규약 파일이
   * 그 실물이다(트리 밖 자산 다섯 자리).
   */
  it("맨 이름이 색인 0건이면 dead-public이다 — 트리 밖 자산에 억제가 없다", () => {
    const read = asAddress("SKILL.md", ["neo-agent-main"]);
    const verdict = judgeAddress(read, makeContext({ basenames: {} }));
    expect(verdict.ok === false && verdict.violation).toBe("dead-public");
  });

  /**
   * §3.2 — *"공개 부류의 해결은 「추적되는가」로 묻는다 — 디스크에 있는가가 아니다."*
   * **침묵 실패 후보다**: 추적 안 되는 파일에 기대 풀리는 주소는 작업 폴더에서만 초록이고
   * 재현본(§7 재현 방법 — `git archive` + 추적 오라클 복원)에서 죽는다.
   */
  it("작업 폴더에는 있으나 추적 안 되면 dead-public이다", () => {
    const read = asAddress("neo-agent-main/docs/UNTRACKED.md");
    const verdict = judgeAddress(
      read,
      makeContext({
        publicTree: {},
        recordTree: { "neo-agent-main/docs/UNTRACKED.md": "file" },
      }),
    );
    expect(verdict.ok === false && verdict.violation).toBe("dead-public");
  });
});

describe("PUBLIC-TREE §3.3 — 축 7: dead-record", () => {
  /** *"비공개·동결 부류인데 그 트리가 있는데도 해결되지 않는다."* */
  it("비공개 트리가 있는데 안 풀리면 dead-record다", () => {
    const read = asAddress(".claude/agents/NOT-THERE.md");
    const verdict = judgeAddress(read, makeContext({ recordTree: {} }));
    expect(verdict).toEqual({
      ok: false,
      violation: "dead-record",
      detail: expect.any(String),
    });
  });

  it("동결 트리가 있는데 안 풀리면 dead-record다", () => {
    const read = asAddress("openclaw-main/src/NOT-THERE.ts");
    const verdict = judgeAddress(read, makeContext({ recordTree: {} }));
    expect(verdict.ok === false && verdict.violation).toBe("dead-record");
  });

  /**
   * §3.2 — *"비공개 기록 주소를 금지하지 않는다."* 작업 폴더에서 실제로 풀리면 통과이고
   * 부류는 착지가 internal로 준다. §3.5가 «`dead-record` 0»을 그 판정의 근거로 든다.
   */
  it("작업 폴더에서 풀리는 비공개 주소는 통과하고 부류가 internal이다", () => {
    const read = asAddress("devnotes/20260903-devnote.md");
    const verdict = judgeAddress(
      read,
      makeContext({ recordTree: { "devnotes/20260903-devnote.md": "file" } }),
    );
    expect(verdict).toEqual({ ok: true, cls: "internal" });
  });
});

describe("PUBLIC-TREE §3.3 — 축 7: ambiguous-basename", () => {
  /** *"맨 문서 이름이 공개 트리의 파일명 색인에서 둘 이상에 걸린다."* */
  it("색인이 둘 이상이면 ambiguous-basename이다", () => {
    const read = asAddress("README.md", ["neo-agent-main"]);
    const verdict = judgeAddress(
      read,
      makeContext({
        basenames: {
          "README.md": ["neo-agent-main/README.md", "neo-agent-main/scripts/spy-docker/README.md"],
        },
      }),
    );
    expect(verdict).toEqual({
      ok: false,
      violation: "ambiguous-basename",
      detail: expect.any(String),
    });
  });

  /** 색인의 「없다」가 키 부재와 빈 배열 둘로 표현될 수 있다 — 둘이 갈리면 침묵 통과가 난다. */
  it("색인 값이 빈 배열이어도 0건과 같은 판정이다", () => {
    const read = asAddress("GONE.md", ["neo-agent-main"]);
    const verdict = judgeAddress(read, makeContext({ basenames: { "GONE.md": [] } }));
    expect(verdict.ok === false && verdict.violation).toBe("dead-public");
  });

  it("색인이 하나면 통과하고 부류는 공개다", () => {
    const read = asAddress("PUBLIC-TREE.md", ["neo-agent-main"]);
    const verdict = judgeAddress(
      read,
      makeContext({ basenames: { "PUBLIC-TREE.md": ["neo-agent-main/docs/PUBLIC-TREE.md"] } }),
    );
    expect(verdict).toEqual({ ok: true, cls: "public" });
  });
});

describe("PUBLIC-TREE §3.3 — 축 7: shadowed-address (fail-closed 그물 셋째)", () => {
  it("부류가 갈린 파일 둘은 어떤 조합에서도 실패다", () => {
    const read = asAddress("docs/REUSE-MAP.md");
    const verdict = judgeAddress(
      read,
      makeContext({
        publicTree: { "neo-agent-main/docs/REUSE-MAP.md": "file" },
        recordTree: { "docs/REUSE-MAP.md": "file" },
      }),
    );
    expect(verdict.ok === false && verdict.violation).toBe("shadowed-address");
  });
});

/**
 * **입력 꼴의 선택.** 아래는 절번호 꼬리를 **붙여 쓴** 꼴을 쓴다 — 공백형은 같은 축 3의
 * 「절번호 꼬리와 경로 사이의 공백」이 든 결함 때문에 읽기 단계에서 죽어, 여기 쓰면 판정
 * 함수가 아예 안 돌아 `dead-section` 판정 자체가 안 재진다. 결함은 그 축이 들고, 이 축은
 * 판정을 잰다.
 */
describe("PUBLIC-TREE §3.3 — 축 7: dead-section", () => {
  it("착지한 문서에 그 절이 없으면 dead-section이다", () => {
    const read = asAddress("PUBLIC-TREE.md§9.9", ["neo-agent-main"]);
    const verdict = judgeAddress(
      read,
      makeContext({
        basenames: { "PUBLIC-TREE.md": ["neo-agent-main/docs/PUBLIC-TREE.md"] },
        sections: { "neo-agent-main/docs/PUBLIC-TREE.md": ["3", "3.1", "3.2"] },
      }),
    );
    expect(verdict).toEqual({
      ok: false,
      violation: "dead-section",
      detail: expect.any(String),
    });
  });

  it("절이 실재하면 통과다 — 문면 대조는 이 게이트 밖이다 (§3.5)", () => {
    const read = asAddress("PUBLIC-TREE.md§3.2", ["neo-agent-main"]);
    const verdict = judgeAddress(
      read,
      makeContext({
        basenames: { "PUBLIC-TREE.md": ["neo-agent-main/docs/PUBLIC-TREE.md"] },
        sections: { "neo-agent-main/docs/PUBLIC-TREE.md": ["3", "3.1", "3.2"] },
      }),
    );
    expect(verdict).toEqual({ ok: true, cls: "public" });
  });

  it("documentSections가 절 제목의 번호만 낸다 — 본문의 숫자는 절이 아니다", () => {
    const source = [
      "# 제목",
      "",
      "## 1. 경계",
      "",
      "### 3.1 무엇이 주소인가",
      "",
      "본문에 3.9라고 적혀 있어도 절이 아니다",
      "",
      "## 3. 주소",
    ].join("\n");
    expect(documentSections(source)).toEqual(["1", "3.1", "3"]);
  });
});

describe("PUBLIC-TREE §6 — 축 7·축 10: unmapped-doc", () => {
  /** *"최상위 진입점이 들지 않는 문서가 공개 트리의 문서 디렉터리에 있다."* */
  it("진입점 둘의 합집합에 없는 문서를 낸다", () => {
    const docs = [
      "neo-agent-main/docs/PUBLIC-TREE.md",
      "neo-agent-main/docs/MARKERS.md",
      "neo-agent-main/docs/DOC-CITATION.md",
    ];
    const fromReadme = ["neo-agent-main/docs/PUBLIC-TREE.md"];
    const fromContributing = ["neo-agent-main/docs/DOC-CITATION.md"];
    expect(unmappedDocs(docs, [...fromReadme, ...fromContributing])).toEqual([
      "neo-agent-main/docs/MARKERS.md",
    ]);
  });

  /** *"어느 쪽이 어느 문서를 드는지는 이 규약이 정하지 않는다 — 합집합이 전부이면 된다."* */
  it("합집합이 전부를 덮으면 0건이다", () => {
    const docs = ["neo-agent-main/docs/A.md", "neo-agent-main/docs/B.md"];
    expect(unmappedDocs(docs, docs)).toEqual([]);
  });

  it("착지 집합에만 있는 자리는 결과에 안 샌다", () => {
    expect(unmappedDocs(["neo-agent-main/docs/A.md"], ["neo-agent-main/README.md"])).toEqual([
      "neo-agent-main/docs/A.md",
    ]);
  });

  /**
   * **[미규정] 입력에 중복이 있으면 출력도 중복이다.** §6은 결과를 집합으로도 목록으로도
   * 안 못박았다. 오늘 재료(추적 `.md` 목록)에는 중복이 없어 실질 노출이 없지만, §3.5가
   * 출력에 **수**를 싣도록 요구하므로 재료가 바뀌면 그 수가 흔들린다. 판정 필요.
   */
  it("[미규정] 중복 입력은 중복으로 나온다", () => {
    expect(unmappedDocs(["a", "a", "b"], ["b"])).toEqual(["a", "a"]);
  });

  /**
   * §6 — *"재료가 §3의 게이트가 이미 모으는 주소 집합이라 **새 순회를 만들지 않는다**."*
   * `address.d.mts`가 *"원문 문자열을 안 받는 것이 이 시그니처의 요점"*이라 못박았다.
   */
  it("원문 문자열을 안 받는다 — 인자 둘 다 집합이다", () => {
    expect(unmappedDocs.length).toBe(2);
    // 두 집합만으로 결정된다는 것: 같은 집합이면 어떤 원문이 있든 결과가 같다
    expect(unmappedDocs(["x"], ["x"])).toEqual([]);
    expect(unmappedDocs(["x"], [])).toEqual(["x"]);
  });
});

// ---------------------------------------------------------------------------
// 축 8 — dead-section의 범위 한정 · §3.4 탈출 표기
// ---------------------------------------------------------------------------

describe("PUBLIC-TREE §3.3 — 축 8: dead-section은 같은 스팬 안에서만 발화한다", () => {
  /**
   * 문서 이름 스팬 + **바깥**의 평문 `§N`은 이 판정의 대상이 아니다. 넓히면 §3.1의
   * *"모집단 판별이 문자열 안에서 끝난다"* 불변과 정면으로 부딪친다. 이 사이클은 좁은
   * 범위만 구현하고 그 물음을 안 닫는다(§9 U-a와 같은 벽).
   */
  it("스팬 바깥의 §N에는 반응하지 않는다", () => {
    const spans = codeSpans("`PUBLIC-TREE.md` §9.9가 정본이다");
    expect(spans.map((s) => s.text)).toEqual(["PUBLIC-TREE.md"]);
    const read = asAddress("PUBLIC-TREE.md", ["neo-agent-main"]);
    expect(read.section).toBeNull();
    const verdict = judgeAddress(
      read,
      makeContext({
        basenames: { "PUBLIC-TREE.md": ["neo-agent-main/docs/PUBLIC-TREE.md"] },
        sections: { "neo-agent-main/docs/PUBLIC-TREE.md": ["3", "3.1"] },
      }),
    );
    expect(verdict).toEqual({ ok: true, cls: "public" });
  });

  it("절 스팬만 따로 있는 자리도 dead-section을 안 낸다 — 주소가 아니다", () => {
    // `§3.9`는 §3.1의 꼴 넷 어디에도 안 걸린다
    expect(readAddress("§3.9", TOP_LEVEL).ok).toBe(false);
  });

  /**
   * **[문서 부정확 — 판정 필요] §4.2가 `dead-section`에 귀속시킨 측정이 실제로는 안 선다.**
   *
   * §4.2는 *"정본 셀은 포인터 의무다 … **그 §의 실재는 §3.3의 `dead-section`이 잰다**"*라고
   * 적었다. 그런데 같은 절이 정한 정본 셀의 문법은 *"백틱으로 감싼 문서명 하나 +
   * `§<절번호>`"* — 즉 **§ 번호가 스팬 밖**이다. 좁은 범위(같은 스팬)의 `dead-section`은
   * 정확히 그 꼴에 반응하지 않으므로, §4.2의 저 문장은 실물에서 거짓이다.
   *
   * 실제로 그 의무를 재는 것은 §4.4의 별도 갈래(*"정본 § 부재"*)이고, 그쪽은 다른 게이트
   * (`check-boundary-index.mjs`)가 든다. **처방은 이 파일이 정하지 않는다** — §3.3의 범위를
   * 넓히거나(§3.1 «판별이 문자열 안에서 끝난다»와 충돌한다 · §9 U-a와 같은 벽), §4.2의
   * 귀속을 §4.4로 고치거나 둘 중 하나이고, 그것은 설계 판정이다.
   *
   * 이 `it`은 **현재 범위의 참을 증인으로 고정한다** — 좁은 범위가 §8 재논의 후보로 열려
   * 있는 상태에서 구현을 위반으로 몰지 않기 위해서다. 범위가 넓어지면 이 단언이 붉어지고,
   * 그때 이 주석이 왜 바뀌는지를 든다.
   */
  it("[문서 부정확] §4.2 정본 셀 꼴의 §는 이 판정의 대상이 아니다", () => {
    const cell = "| 승인 게이트 | `packages/gate/src` | `APPROVAL-GATE.md` §2 |";
    expect(texts(cell)).toEqual(["packages/gate/src", "APPROVAL-GATE.md"]);
    const read = asAddress("APPROVAL-GATE.md", ["neo-agent-main"]);
    // 스팬 밖의 `§2`는 이 스팬에 안 들어온다 — 그래서 dead-section이 원리적으로 못 잰다
    expect(read.section).toBeNull();
  });
});

describe("PUBLIC-TREE §3.4 — 축 8: 탈출 표기 셋 중 파서가 아는 것은 하나다", () => {
  /** 표 셋째 행 — *"지금은 없어진 절을 가리킨다 → `§<절번호>(구)`"*. */
  it("`§<절번호>(구)`가 붙으면 retired다", () => {
    const read = asAddress("PUBLIC-TREE.md§9.9(구)", ["neo-agent-main"]);
    expect(read.retired).toBe(true);
    expect(read.path).toBe("PUBLIC-TREE.md");
  });

  it("retired 표기가 붙은 자리는 dead-section이 아니다", () => {
    const read = asAddress("PUBLIC-TREE.md§9.9(구)", ["neo-agent-main"]);
    const verdict = judgeAddress(
      read,
      makeContext({
        basenames: { "PUBLIC-TREE.md": ["neo-agent-main/docs/PUBLIC-TREE.md"] },
        sections: { "neo-agent-main/docs/PUBLIC-TREE.md": ["3", "3.1"] },
      }),
    );
    expect(verdict).toEqual({ ok: true, cls: "public" });
  });

  it("표기가 없으면 retired가 아니다", () => {
    expect(asAddress("PUBLIC-TREE.md§3.1", ["neo-agent-main"]).retired).toBe(false);
    expect(asAddress("neo-agent-main/docs/LORE.md").retired).toBe(false);
  });

  /**
   * 나머지 둘은 **파서의 대상이 아니다.**
   *   - 첫 행(*"코드 스팬을 쓰지 않는다. 이름으로만 쓴다"*) — 백틱이 없으면 `codeSpans`가
   *     애초에 안 집는다. 파서가 산문을 읽어 봐주는 자리가 없다
   *   - 둘째 행(*"그 트리 접두를 붙인다"*) — 접두가 붙으면 꼴 ②·③으로 평범하게 읽힐 뿐,
   *     별도 표기가 아니다
   */
  it("첫째 표기(이름으로만 쓴다)는 코드 스팬이 아니라 파서에 안 온다", () => {
    expect(texts("원격 디자인 시스템의 SKILL.md는 세 트리 밖이다")).toEqual([]);
  });

  it("둘째 표기(트리 접두)는 별도 표기가 아니라 꼴 ③으로 읽힌다", () => {
    const read = asAddress("hermes-agent-main/MEMORY.md");
    expect(read.form).toBe(3);
    expect(read.retired).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 축 9 — 미판정
// ---------------------------------------------------------------------------

describe("PUBLIC-TREE §3.2 — 축 9: 트리 부재는 통과가 아니라 미판정이다", () => {
  /**
   * *"해결할 트리가 없으면 통과가 아니라 미판정이다. 그 주소들을 조용히 통과시키면 게이트가
   * 실행 환경에 따라 다른 것을 재면서 같은 초록을 낸다 — `ARCHITECTURE.md` §2.6이 금지하는
   * 침묵 경로다."*
   */
  it("비공개 트리가 없으면 unjudged이고 부류를 접두가 준다", () => {
    const read = asAddress(".claude/agents/qa-verifier.md");
    const verdict = judgeAddress(read, makeContext({ absentTrees: [".claude/"] }));
    expect(verdict).toEqual({ ok: true, cls: "internal", unjudged: true });
  });

  it("동결 트리가 없으면 unjudged이고 부류가 frozen이다", () => {
    const read = asAddress("openclaw-main/src/gateway.ts");
    const verdict = judgeAddress(read, makeContext({ absentTrees: ["openclaw-main/"] }));
    expect(verdict).toEqual({ ok: true, cls: "frozen", unjudged: true });
  });

  /**
   * 미판정은 **위반이 아니라 계수 대상**이므로 `ok: true`이면서 `unjudged`를 든다.
   * 그 표지가 없으면 §3.5가 요구하는 «미판정 수»를 실행부가 원리적으로 못 센다.
   */
  it("미판정 갈래는 통과 갈래와 구별된다 — unjudged 표지가 실제로 붙는다", () => {
    const absentRead = asAddress("plans/20260903-x.md");
    const absent = judgeAddress(absentRead, makeContext({ absentTrees: ["plans/"] }));
    const presentRead = asAddress("plans/20260903-x.md");
    const present = judgeAddress(
      presentRead,
      makeContext({ recordTree: { "plans/20260903-x.md": "file" } }),
    );
    expect(absent).not.toEqual(present);
    expect("unjudged" in absent).toBe(true);
    expect("unjudged" in present).toBe(false);
  });

  /**
   * §3.2 표 첫 행 — 공개 부류의 「그 트리가 없으면」 칸은 *"— 재현본에도 있다"*다. 즉 공개
   * 트리의 부재는 물음이 아니고, 그것을 물어 미판정으로 넘기면 **§7의 재현본에서 죽는 주소가
   * 조용히 초록**이 된다(§2가 든 오늘의 비대칭을 그대로 물려받는 자리다).
   */
  it("공개 부류는 트리 부재를 주장해도 미판정으로 안 샌다", () => {
    const path = asAddress("neo-agent-main/docs/GONE.md");
    expect(judgeAddress(path, makeContext({ absentTrees: ["neo-agent-main"] }))).toEqual({
      ok: false,
      violation: "dead-public",
      detail: expect.any(String),
    });
    const bare = asAddress("GONE.md", ["neo-agent-main"]);
    const verdict = judgeAddress(bare, makeContext({ absentTrees: ["neo-agent-main"] }));
    expect(verdict.ok === false && verdict.violation).toBe("dead-public");
  });

  /** 공개 트리는 항상 있다 — 게이트가 그 안에서 돈다. 미판정은 공개 부류에 안 난다. */
  it("트리가 있으면 미판정이 아니라 판정이 난다", () => {
    const read = asAddress(".claude/agents/qa-verifier.md");
    const verdict = judgeAddress(
      read,
      makeContext({ recordTree: { ".claude/agents/qa-verifier.md": "file" } }),
    );
    expect(verdict).toEqual({ ok: true, cls: "internal" });
  });
});

// ---------------------------------------------------------------------------
// 축 11 — 순수성
// ---------------------------------------------------------------------------

describe("PUBLIC-TREE §3.5 — 축 11: 이 모듈은 트리를 안 읽는다", () => {
  /**
   * *"판정과 실행부를 파일로 가른다."* `address.d.mts` — *"이 모듈은 트리를 안 읽는다. 실행부가
   * 이 값을 만들어 넘긴다."* 그러므로 **실물로 존재하는 경로**라도 컨텍스트가 없다고 하면
   * 없는 것이다. 이 단언이 깨지면 계약 테스트가 계약이 아니라 실물의 사진이 된다.
   */
  it("디스크에 실재하는 경로도 컨텍스트가 비면 dead-public이다", () => {
    const read = asAddress("neo-agent-main/docs/PUBLIC-TREE.md");
    expect(judgeAddress(read, makeContext()).ok).toBe(false);
  });

  it("디스크에 없는 경로도 컨텍스트가 있다고 하면 통과다", () => {
    const read = asAddress("neo-agent-main/docs/NEVER-EXISTED.md");
    const verdict = judgeAddress(
      read,
      makeContext({ publicTree: { "neo-agent-main/docs/NEVER-EXISTED.md": "file" } }),
    );
    expect(verdict).toEqual({ ok: true, cls: "public" });
  });

  it("codeSpans·readAddress·unmappedDocs는 문자열/집합만 받는다", () => {
    expect(codeSpans.length).toBe(1);
    expect(readAddress.length).toBe(2);
    expect(judgeAddress.length).toBe(2);
    expect(unmappedDocs.length).toBe(2);
  });
});
