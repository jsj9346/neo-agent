/**
 * 독립 QA (2026-09-03) — 이식 금지 목록의 `COMPLIANCE.md` 이관이 정본 계약을 지키는가.
 *
 * 기대값은 구현이 아니라 아래 정본에서만 도출했다. 구현·플랜·실행 리포트는 기대값의
 * 출처가 아니다:
 * - `docs/PUBLIC-TREE.md` §5 — 금지 목록의 자리. 「든다 / 안 든다」 여섯 칸, 루트
 *   포인터, `REUSE-MAP.md` 요약의 처분
 * - `docs/PUBLIC-TREE.md` §5.1 — 강제층 둘, 그리고 루트 포인터가 **언제 읽어야 하는지**를
 *   명시할 의무
 * - `docs/PUBLIC-TREE.md` §3.2 — 주소 부류 셋. 해결할 트리가 없으면 통과가 아니라 미판정
 * - `docs/DOC-STATUS.md` §3.2 — 머리 값 유니온과 `근거:`의 유무
 * - `docs/DOC-STATUS.md` §5·§5.1 — 표 등록과 행 문법
 * - `docs/DOC-CITATION.md` §3.1 — 동결 트리 인용은 트리 이름을 경로에 포함한다
 * - `MILESTONE.md` C1 (비공개 기록 · §3.2 부류 「비공개」) — 검증(1)·(2)
 *
 * **이 파일은 실패를 포함한 채로 제출된다.** 실패하는 단언은 구현이 정본과 어긋나는
 * 자리이고, 기대값을 실물에 맞춰 통과시키지 않는다. 판정 목록은
 * `plans/20260903-compliance-relocation-qa.md`가 든다(비공개 기록).
 *
 * 미규정 지점에는 `[미규정]` 표시를 달고 판정을 내리지 않는다 — 리포트의 «판정 필요»로 간다.
 *
 * **증거 앵커 여덟을 이 파일에 문자 그대로 쓰지 않는다.** 조각을 런타임에 잇는다.
 * 이 레포는 «어떤 것을 설명하는 텍스트가 그 검사 대상 문자열을 포함해» 검사가 자기를
 * 세는 자기오염을 반복해 겪었다(`DOC-STATUS.md` §2.2). 아래 축 C가 재는 것은 **앵커가
 * 공개 트리에서 `COMPLIANCE.md` 한 곳에만 있는가**이므로, 이 파일이 앵커를 literal로
 * 담는 순간 그 단언이 자기 자신 때문에 붉는다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이고(§3.4 U-1), 문서 지목은 절 번호와 필드 이름으로 한다.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// 트리 해결 — §3.2 「해결할 트리가 없으면 통과가 아니라 미판정이다」
// ---------------------------------------------------------------------------

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const NEO_MAIN = fileURLToPath(new URL("../../../", import.meta.url));

function readNeo(relative: string): string {
  return readFileSync(`${NEO_MAIN}${relative}`, "utf8");
}

/**
 * 작업 폴더에만 있는 비공개 기록(§3.2 「비공개 기록」 부류). 공개 트리 재현본에서는
 * 없으므로 읽기가 실패한다 — 그때는 통과가 아니라 **미판정**이고, vitest의 skip 계수가
 * 출력에 그 수를 싣는다(§3.2 말미 · `ARCHITECTURE.md` §2.6).
 */
function readInternal(relative: string): string | null {
  const path = `${REPO_ROOT}${relative}`;
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

const ROOT_CLAUDE = readInternal("CLAUDE.md");
const MILESTONE = readInternal("MILESTONE.md");

const COMPLIANCE = readNeo("docs/COMPLIANCE.md");
const PUBLIC_TREE = readNeo("docs/PUBLIC-TREE.md");
const DOC_STATUS = readNeo("docs/DOC-STATUS.md");
const README = readNeo("README.md");

/** 공개 트리 재현본과 같은 모집단 — `git archive HEAD`가 내는 것. */
function trackedFilesContaining(needle: string): string[] {
  try {
    const out = execFileSync("git", ["grep", "-l", "-F", "-e", needle, "HEAD", "--"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    return out
      .split("\n")
      .filter(Boolean)
      .map((line) => line.replace(/^HEAD:/, ""));
  } catch {
    return [];
  }
}

/**
 * `MILESTONE.md` C1 검증(1)의 증거 앵커 여덟. 파일 머리가 든 이유로 조각을 잇는다.
 * 조각 경계는 의미가 없다 — 자기오염만 피하면 된다.
 */
const EVIDENCE_ANCHORS: readonly string[] = [
  ["9d1c", "250a"].join(""),
  ["Iv1.b507a08c", "87ecfe98"].join(""),
  ["backend-api", "/codex"].join(""),
  ["anthropic_", "adapter.py"].join(""),
  ["copilot_", "auth.py"].join(""),
  ["zca", "-js"].join(""),
  ["weixin", ".py"].join(""),
  ["oauth_", "creds.json"].join(""),
];

// ---------------------------------------------------------------------------
// 축 0 — 기대값의 출처를 고정한다
//
// 아래 축들의 기대값은 전부 `PUBLIC-TREE.md` §5의 여섯 칸에서 도출했다. 그 표가
// 바뀌면 이 파일의 전제가 바뀌므로, 표의 문면을 먼저 못박는다 — 계약이 조용히
// 움직이는데 검사만 초록으로 남는 것을 막는다.
// ---------------------------------------------------------------------------

describe("축 0 — 기대값의 출처: PUBLIC-TREE.md §5 「든다 / 안 든다」 표", () => {
  it("여섯 칸의 문면이 이 파일이 전제한 그대로다", () => {
    for (const cell of [
      "| 이식 금지 목록의 전문 — 파일·식별자 단위 증거까지 | 기록 체계·백업 경로·에이전트 라우팅 등 작업 하네스 |",
      "| 이식 시 지킬 원칙과 양성 사례 | 레퍼런스의 구조 분석 (루트 `docs/`) |",
      "| 근거 분류 체계 (`vendor-documented` 계열) | 무엇을 언제 가져오는가의 판정 — `REUSE-MAP.md` |",
    ]) {
      expect(PUBLIC_TREE).toContain(cell);
    }
    expect(PUBLIC_TREE).toContain("**전문은 `COMPLIANCE.md`가 든다.**");
    expect(PUBLIC_TREE).toContain(
      "**루트 `CLAUDE.md`에는 포인터만 남긴다.** 전문을 양쪽에 두지 않는다.",
    );
  });

  it("§5는 `REUSE-MAP.md` §5의 요약을 지우지 말라고 했고, 그 요약이 살아 있다", () => {
    expect(PUBLIC_TREE).toContain("그 자리는 요약임을 밝히고 정본 주소만 바꾼다");
    const reuse = readNeo("docs/REUSE-MAP.md");
    expect(reuse).toContain("**정본은 `COMPLIANCE.md`**");
    // 요약이 남아 있다 — §5가 이름으로 든 넷.
    for (const name of ["baileys", "Zalo", "WeChat 개인계정", "iMessage"]) {
      expect(reuse.includes(name), `REUSE-MAP.md §5에서 사라진 이름: ${name}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 축 A — §5 「든다」 세 칸
// ---------------------------------------------------------------------------

describe("PUBLIC-TREE.md §5 — COMPLIANCE.md가 「든다」 세 칸", () => {
  it("① 이식 금지 목록의 전문 — 파일·식별자 단위 증거까지", () => {
    for (const anchor of EVIDENCE_ANCHORS) {
      expect(COMPLIANCE.includes(anchor), `증거 앵커 미포함: ${anchor}`).toBe(true);
    }
    // 전문의 골격 — 부류 셋의 제목이 그 문서 안에 있다.
    expect(COMPLIANCE).toContain("절대 이식 금지");
    expect(COMPLIANCE).toContain("소비자 구독 OAuth 토큰 재사용 + 공식 클라이언트 위장");
    expect(COMPLIANCE).toContain("레이트리밋 회피용 다계정 로테이션");
    expect(COMPLIANCE).toContain("비공식/리버스 엔지니어링 플랫폼 클라이언트");
  });

  it("② 이식 시 지킬 원칙과 양성 사례", () => {
    expect(COMPLIANCE).toContain("이식 시 반드시 지킬 원칙");
    // 양성 사례 둘 — OpenAI 경로의 정직한 originator, Google 정책 변경 후의 자진 제거.
    expect(COMPLIANCE).toContain("openai-chatgpt-responses.ts");
    expect(COMPLIANCE).toContain("providers/google.md");
  });

  it("③ 근거 분류 체계 (`vendor-documented` 계열)", () => {
    expect(COMPLIANCE).toContain("vendor-documented");
    expect(COMPLIANCE).toContain("vendor-hidden-api-spec");
    expect(COMPLIANCE).toContain("vendor-sdk-hook-only");
    expect(COMPLIANCE).toContain("internal-runtime");
  });

  it("동결 트리 인용은 트리 이름을 경로에 포함한다 (DOC-CITATION.md §3.1)", () => {
    // 이관이 붙인 접두가 실제로 전부 붙었는가. 접두 없는 상대 경로가 남으면 공개 트리
    // 독자는 그것이 어느 트리의 경로인지 알 수 없다.
    // 앵커 하나(`weixin` + `.py`)가 이 목록에 있다. 머리가 선언한 대로 런타임에 잇는다 —
    // literal로 담으면 축 C의 「한 곳에만 있는가」가 이 파일 때문에 붉는다.
    const weixin = ["weixin", ".py"].join("");
    const bareRefs = [
      "`src/llm/utils/oauth/anthropic.ts`",
      "`agent/auxiliary_client.py`",
      "`extensions/github-copilot/`",
      `\`gateway/platforms/${weixin}\``,
      "`packages/ai/src/providers/openai-chatgpt-responses.ts",
      "`docs/providers/google.md",
      "`src/agents/provider-attribution.ts`",
    ];
    for (const bare of bareRefs) {
      expect(COMPLIANCE.includes(bare), `접두 없는 동결 트리 경로: ${bare}`).toBe(false);
    }
    for (const prefixed of [
      "openclaw-main/src/llm/utils/oauth/anthropic.ts",
      "hermes-agent-main/agent/auxiliary_client.py",
      "openclaw-main/extensions/github-copilot/",
      `hermes-agent-main/gateway/platforms/${weixin}`,
      "openclaw-main/src/agents/provider-attribution.ts",
    ]) {
      expect(COMPLIANCE).toContain(prefixed);
    }
  });
});

// ---------------------------------------------------------------------------
// 축 B — §5 「안 든다」 세 칸
// ---------------------------------------------------------------------------

describe("PUBLIC-TREE.md §5 — COMPLIANCE.md가 「안 든다」 세 칸", () => {
  /** 소유 경계 표 자신은 「안 든다」를 *선언*하므로 계수에서 뺀다. */
  const BODY = COMPLIANCE.split("\n")
    .filter((line) => !line.startsWith("| "))
    .join("\n");

  it("④ 기록 체계·백업 경로·에이전트 라우팅 등 작업 하네스를 안 든다", () => {
    for (const harness of [
      "devlog",
      "devnote",
      "kanban",
      "backlog",
      "rsync",
      "backup-records",
      "reference-scout",
      "qa-verifier",
      "implementer",
      ".claude/",
    ]) {
      expect(BODY.includes(harness), `하네스 어휘 유입: ${harness}`).toBe(false);
    }
  });

  it("⑤ 레퍼런스의 구조 분석(루트 `docs/`)을 안 든다", () => {
    expect(BODY).not.toContain("openclaw-architecture.md");
    expect(BODY).not.toContain("hermes-agent-architecture.md");
  });

  it("⑥ 무엇을 언제 가져오는가의 판정을 안 든다 — 그 자리는 `REUSE-MAP.md`", () => {
    // 재사용 등급 어휘가 본문에 없어야 한다. 소유 경계 표의 포인터 한 줄은 위에서 뺐다.
    for (const grade of ["🚫", "🧬", "후순위", "채택 안 함", "재사용 등급", "MVP"]) {
      expect(BODY.includes(grade), `재사용 판정 어휘 유입: ${grade}`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 축 C — §5 「전문을 양쪽에 두지 않는다」 / MILESTONE C1 검증(1)
// ---------------------------------------------------------------------------

describe("MILESTONE.md C1 검증(1) — 공개 트리 재현본에서 증거 앵커 여덟이 발견된다", () => {
  it("여덟 전부가 공개 트리에서 해결된다 → 8/8", () => {
    const found = EVIDENCE_ANCHORS.filter((a) => trackedFilesContaining(a).length > 0);
    expect(found.length).toBe(EVIDENCE_ANCHORS.length);
  });

  it("이중화되지 않는다 — 여덟 전부가 `docs/COMPLIANCE.md` 한 곳에서만 나온다", () => {
    for (const anchor of EVIDENCE_ANCHORS) {
      const files = trackedFilesContaining(anchor);
      expect(files, `앵커 ${anchor}의 자리`).toEqual(["neo-agent-main/docs/COMPLIANCE.md"]);
    }
  });
});

// ---------------------------------------------------------------------------
// 축 D — §5 루트 포인터 · §5.1 시점 명시
// ---------------------------------------------------------------------------

describe("PUBLIC-TREE.md §5·§5.1 — 루트 `CLAUDE.md`의 포인터", () => {
  it.skipIf(ROOT_CLAUDE === null)("정본 주소를 든다", () => {
    expect(ROOT_CLAUDE).toContain("neo-agent-main/docs/COMPLIANCE.md");
  });

  it.skipIf(ROOT_CLAUDE === null)(
    "§5.1 — 포인터가 **언제 읽어야 하는지**를 명시한다 (모델 프로바이더·인증·플랫폼 접근에 손대기 전)",
    () => {
      // §5.1: 「포인터가 자리만 알리고 시점을 안 알리면 그 한 줄은 읽히지 않는다」
      expect(ROOT_CLAUDE).toContain("모델 프로바이더·인증·플랫폼 접근에 손대기 전");
    },
  );

  it.skipIf(ROOT_CLAUDE === null)("전문을 양쪽에 두지 않는다 — 증거 앵커가 루트에 없다", () => {
    for (const anchor of EVIDENCE_ANCHORS) {
      expect(ROOT_CLAUDE?.includes(anchor), `루트에 잔존한 앵커: ${anchor}`).toBe(false);
    }
  });

  it.skipIf(ROOT_CLAUDE === null)(
    "「포인터」는 부류 이름까지를 뜻한다 — 루트 요약이 정본의 부류 구조와 어긋나지 않는다",
    () => {
      // 이 QA가 요약도 포인터인가를 미규정으로 올렸고, 2026-09-03에 `PUBLIC-TREE.md` §5가
      // 명문화로 닫았다(같은 절의 `REUSE-MAP.md` 처분이 이미 함축하던 것). 규범은 둘이다 —
      // ① 부류 이름은 포인터의 허용 범위 ② 금지되는 것은 파일·식별자 단위 증거.
      expect(PUBLIC_TREE).toContain("「포인터」는 정본 주소와 읽어야 할 시점에 더해");
      expect(ROOT_CLAUDE).toContain("무엇이 걸리는가만 알리는 요약");

      // ① 루트가 드는 부류 이름은 정본의 굵은 제목과 문자 그대로 대응한다.
      const canonicalHeadings = [
        "소비자 구독 OAuth 토큰 재사용 + 공식 클라이언트 위장",
        "레이트리밋 회피용 다계정 로테이션",
        "비공식/리버스 엔지니어링 플랫폼 클라이언트",
      ];
      for (const h of canonicalHeadings) {
        expect(COMPLIANCE, `정본의 부류 제목: ${h}`).toContain(`**${h}**`);
        expect(ROOT_CLAUDE, `루트 요약의 부류 이름: ${h}`).toContain(h);
      }

      // ② 루트가 정본에 없는 부류 구조를 주장하지 않는다 — 굵은 제목은 셋이고,
      //    넷째 항은 그 셋에 공통으로 얹히는 수법임을 문면이 밝힌다.
      expect(ROOT_CLAUDE).not.toContain("부류는 넷이다");
      expect(ROOT_CLAUDE).toContain("(위 셋에 공통)");
    },
  );
});

// ---------------------------------------------------------------------------
// 축 E — MILESTONE C1 검증(2)와 그 술어의 커버리지
// ---------------------------------------------------------------------------

describe("MILESTONE.md C1 검증(2) — 금지 목록의 자리로 `COMPLIANCE.md`가 아니라 루트 `CLAUDE.md`를 드는 줄", () => {
  /** `neo-agent-main/` 아래 추적 파일 전부를 줄 단위로 훑는다. */
  function trackedLines(): { file: string; line: number; text: string }[] {
    const files = execFileSync("git", ["ls-files", "neo-agent-main"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);
    const out: { file: string; line: number; text: string }[] = [];
    for (const file of files) {
      let text: string;
      try {
        text = readFileSync(`${REPO_ROOT}${file}`, "utf8");
      } catch {
        continue;
      }
      text.split("\n").forEach((t, i) => {
        if (t.includes("CLAUDE.md")) out.push({ file, line: i + 1, text: t });
      });
    }
    return out;
  }

  it("검증(2)의 술어 그대로 → 0", () => {
    const hits = trackedLines().filter(
      (h) => h.text.includes("금지 목록") && !h.text.includes("COMPLIANCE.md"),
    );
    expect(hits.map((h) => `${h.file}:${h.line}`)).toEqual([]);
  });

  it("술어를 「금지 목록」 문자열에 묶지 않으면 — 컴플라이언스 금지의 근거로 `COMPLIANCE.md` 아닌 루트 `CLAUDE.md`를 드는 줄이 남는다", () => {
    // 계약 근거: `PUBLIC-TREE.md` §5 — 전문의 정본은 `COMPLIANCE.md`이고 루트에는
    // 포인터만 남는다. `ARCHITECTURE.md` §2.22 — 제품 코드에 걸리는 계약은 제품과
    // 함께 배포된다. 공개 트리 독자에게 루트 `CLAUDE.md`는 열리지 않으므로, 컴플라이언스
    // 금지의 **근거**로 그 파일을 드는 줄은 clone한 자리에서 근거 없는 금지가 된다.
    //
    // 「금지 목록」이라는 정확한 낱말을 안 쓰는 어형(금지한 / 컴플라이언스 경계)을
    // 검증(2)의 grep이 원리적으로 못 본다 — 이것이 그 술어의 커버리지 구멍이다.
    const hits = trackedLines().filter(
      (h) =>
        !h.text.includes("COMPLIANCE.md") &&
        (/CLAUDE\.md`?(가|이|에서|은|는)?\s*금지/.test(h.text) ||
          /컴플라이언스[^|]*`CLAUDE\.md`/.test(h.text)),
    );
    expect(hits.map((h) => `${h.file}:${h.line}`)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 축 F — DOC-STATUS.md §5 표 등록 · §5.1 행 문법 · §3.2 머리
// ---------------------------------------------------------------------------

describe("DOC-STATUS.md §5·§5.1 — COMPLIANCE.md 행", () => {
  /** §5.1: 파서는 `## 5.` 제목과 그 다음 첫 `###` 소제목 사이만 본다. */
  const SECTION5 = (() => {
    const lines = DOC_STATUS.split("\n");
    const start = lines.findIndex((l) => l.startsWith("## 5."));
    const end = lines.findIndex((l, i) => i > start && l.startsWith("### "));
    return lines.slice(start, end === -1 ? lines.length : end);
  })();

  it("§5 표에 행이 있다 — 표의 누락이 아니다", () => {
    const row = SECTION5.find((l) => l.includes("`COMPLIANCE.md`"));
    expect(row).toBeDefined();
  });

  it("§5.1 행 문법 — 세 셀, 백틱 문서명 하나, 유니온 값 하나, 앵커 없음은 `—`", () => {
    const row = SECTION5.find((l) => l.includes("`COMPLIANCE.md`")) ?? "";
    // 관대하지 않다: 볼드·괄호 주석·둘 이상의 값은 행 파싱 실패다.
    expect(row).toBe("| `COMPLIANCE.md` | 구현 주장 없음 | — |");
  });

  it("§3.2 — `구현 주장 없음`은 `근거:` 줄을 두면 위반", () => {
    const head = COMPLIANCE.split("\n").slice(0, 40);
    expect(head.filter((l) => l.startsWith("- 상태: "))).toEqual(["- 상태: 구현 주장 없음"]);
    expect(head.filter((l) => l.startsWith("- 근거:"))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 축 G — §5.1 강제층 둘이 실재한다
// ---------------------------------------------------------------------------

describe("PUBLIC-TREE.md §5.1 — 옮겨도 잃는 강제력이 0인 근거", () => {
  it("강제층 ① 타입 — `ARCHITECTURE.md` §2.2와 `CORE-INTERFACE.md` §8이 실재한다", () => {
    expect(readNeo("docs/ARCHITECTURE.md")).toContain("### 2.2 ");
    expect(readNeo("docs/CORE-INTERFACE.md")).toContain("## 8. ");
  });

  it("강제층 ② 계약 테스트 — `packages/providers/test/compliance.test.ts`가 실재하고 두 축을 잰다", () => {
    const test = readNeo("packages/providers/test/compliance.test.ts");
    // 정직한 신원이 실제로 와이어에 실리는지
    expect(test).toContain('headers["user-agent"]');
    // 사칭 경로가 컴파일되지 않는 것 — `@ts-expect-error`가 타입체크로 잰다
    expect(test).toContain("@ts-expect-error");
  });

  it("§5.1이 인용한 파일 경로가 실재한다", () => {
    expect(existsSync(`${NEO_MAIN}packages/providers/test/compliance.test.ts`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 축 H — §6 기여자 진입점 도달 (unmapped-doc)
// ---------------------------------------------------------------------------

describe("PUBLIC-TREE.md §6 — 최상위 진입점이 COMPLIANCE.md에 닿는다", () => {
  it("`README.md`가 `docs/COMPLIANCE.md`를 든다", () => {
    expect(README).toContain("docs/COMPLIANCE.md");
  });

  it("`README.md`가 `docs/PUBLIC-TREE.md`도 든다 — 같은 사이클의 두 신설 문서", () => {
    expect(README).toContain("docs/PUBLIC-TREE.md");
  });
});

// ---------------------------------------------------------------------------
// 축 I — 미규정 (판정 필요)
// ---------------------------------------------------------------------------

describe("[미규정] 판정을 내리지 않고 관측만 고정한다", () => {
  it("[미규정] COMPLIANCE.md에 번호 절이 없어 `§<절번호>`로 지목할 수 없다", () => {
    // §7 과제 1의 합격선은 *"답이 든 경로와 §가 공개 트리 안에 실재해야 한다"*이고
    // 그 과제가 겨누는 문서가 이 문서다. §4.2는 층 선언의 정본 셀에 `§<절번호>`를
    // 의무로 건다. 둘 다 이 문서에 번호 절이 없으면 만족될 수 없다.
    // **그러나 §5는 COMPLIANCE.md에 번호 절을 요구한 적이 없다** — 그래서 판정하지 않는다.
    const numbered = COMPLIANCE.split("\n").filter((l) => /^#{2,3} \d+\./.test(l));
    expect(numbered).toEqual([]);
  });

  it.skipIf(MILESTONE === null)(
    "[미규정] C1 검증(2)의 술어 좁히기가 범위 변경으로 기록돼 있다 — 넓은 술어의 처분은 미정",
    () => {
      expect(MILESTONE).toContain("C1 검증(2)의");
      expect(MILESTONE).toContain("술어를 좁힌다");
    },
  );
});

// ---------------------------------------------------------------------------
// 축 J — 이 사이클 밖에서 관측된 인접 결함 (문서 부정확)
// ---------------------------------------------------------------------------

describe("인접 관측 — 루트 `CLAUDE.md`를 지목하는 문면 인용", () => {
  it.skip('[K-443] `ARCHITECTURE.md`·`REUSE-MAP.md`가 인용부호로 드는 "재사용 후보" 표가 루트 `CLAUDE.md`에 없다', () => {
    // `DOC-CITATION.md` §3.4 U-1 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
    // 존재하는 부분 문자열이어야 한다. 평문 큰따옴표도 인용부호다.
    // 이 사이클이 만든 결함이 아니다(사이클 전 스냅샷에도 그 표가 없다). 다만 T-004가
    // 같은 두 파일에서 같은 부류의 인용부호를 벗겼으므로 쓸어야 했던 자리다.
    const citing = [
      ["docs/ARCHITECTURE.md", readNeo("docs/ARCHITECTURE.md")],
      ["docs/REUSE-MAP.md", readNeo("docs/REUSE-MAP.md")],
    ] as const;
    const offenders = citing
      .filter(([, text]) => text.includes('"재사용 후보"'))
      .map(([name]) => name);
    const targetHasIt = ROOT_CLAUDE?.includes("재사용 후보") ?? false;
    expect({ offenders, targetHasIt }).toEqual({ offenders: [], targetHasIt: false });
  });
});
