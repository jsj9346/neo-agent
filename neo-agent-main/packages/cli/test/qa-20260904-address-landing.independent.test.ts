/**
 * 독립 QA (2026-09-04 · T-008) — §3.2 P-1 판정 착지가 정본 계약을 지키는가.
 *
 * **기대값은 아래 정본 문면에서만 도출했다.** 구현 diff·플랜·devnote·실행 리포트는 기대값의
 * 출처가 아니다. 대상은 `neo-agent-main/scripts/address.mjs`(순수 판정) ·
 * `neo-agent-main/scripts/address.d.mts`(타입 선언) · `neo-agent-main/scripts/check-address.mjs`(실행부).
 *
 * - `docs/PUBLIC-TREE.md` §3.2 — 부류 권위 셋, 접두 표, 「그 트리가 있는가」의 단위(2026-09-04
 *   확정), 활성 마일스톤 슬롯 제거(2026-09-04 확정), 착지 순서 콜아웃
 * - `docs/PUBLIC-TREE.md` §3.3 — 위반 여섯 · `AddressVerdict` · `PresentTrees`(*"**디렉터리
 *   접두만 원소가 된다**"*)
 * - `docs/PUBLIC-TREE.md` §3.5 — 게이트의 자리, 출력, **fail-closed 그물 넷**
 * - `docs/PUBLIC-TREE.md` §7 — 재현 방법(`git archive` + 추적 오라클 복원)
 * - `docs/PUBLIC-TREE.md` §9 U-e — 재현본 실측값(위반 0 · 미판정 419)
 *
 * ---
 *
 * **왜 실행부를 프로세스로 띄우는가 — 축 B가 이 파일의 존재 이유다.** 형제
 * `address.contract.test.ts`는 `scripts/address.mjs`만 임포트한다(그 파일 120줄). 그래서
 * §3.5 fail-closed 넷째 그물의 **정의역 선택**(설정 목록인가 디스크인가)과 `presentTrees`의
 * 파생은 `check-address.mjs` 안에 있으면서 **어떤 자동 검사에도 안 걸린다.** 정의역을
 * 디스크로 바꾸면 작업 폴더에서는 초록이고 재현본에서만 붉는데(축 B의 마지막 케이스가 그
 * 반사실을 실측한다), 그 비대칭이 정확히 §2·§3.2가 금지한 모양이다. 순수 함수만 재는 검사는
 * 그 변형을 원리적으로 못 본다 — `hasDirectoryPrefix`의 시그니처가 안 바뀌기 때문이다.
 *
 * **이 파일은 실패를 포함한 채로 제출된다.** 실패하는 단언은 실물이 정본 문면과 어긋나는
 * 자리이고, 기대값을 실물에 맞춰 통과시키지 않는다. 등급과 재현 방법은
 * `plans/20260904-public-tree-s32-landing-verify-report.md`가 든다(비공개 기록 — §3.2 부류
 * 「비공개」이므로 재현본에서는 안 열린다).
 *
 * **`src/`를 고치지 않는다.** 실행부의 변형이 필요한 케이스는 전부 **임시 디렉터리의 사본**을
 * 고친다 — 원본 두 파일은 읽기만 한다.
 *
 * 미규정 지점에는 `[미규정]` 표시를 달고 판정하지 않는다 — 리포트의 «판정 필요»로 간다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이고(§3.4 U-1), 문서 지목은 절 번호와 필드 이름으로 한다.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  type AddressContext,
  type AddressRead,
  type AddressVerdict,
  FROZEN_TREES,
  judgeAddress,
  PRIVATE_RECORD_PREFIXES,
  readAddress,
} from "../../../scripts/address.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const SCRIPTS = fileURLToPath(new URL("../../../scripts/", import.meta.url));

const scratch: string[] = [];
function workspace(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `qa-address-${label}-`));
  scratch.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 축 A의 재료 — 순수 판정에 넣는 문맥. 값은 전부 정본 문면에서 옮겼다
// ---------------------------------------------------------------------------

/**
 * §3.2(2026-09-04 확정)가 **이름으로 든** 디렉터리 접두 일곱 —
 * *"`.claude/`·`devnotes/`·`milestones/`·`docs/`·`plans/`·`openclaw-main/`·`hermes-agent-main/`"*.
 * 런타임 상수에서 파생하지 않는다. 파생하면 이 픽스처가 구현의 표류를 물려받아 §3.3이 자백한
 * «단위 자체를 재는 눈이 어디에도 없었다»는 상태로 되돌아간다.
 */
const INTERNAL_DIR_PREFIXES = [".claude/", "devnotes/", "milestones/", "docs/", "plans/"];
const FROZEN_DIR_PREFIXES = ["openclaw-main/", "hermes-agent-main/"];

/** §3.2가 이름으로 든 **파일 접두** 다섯. 슬롯 이름은 2026-09-04에 목록에서 빠졌다. */
const INTERNAL_FILE_PREFIXES = ["CLAUDE.md", "devlog.md", "idea.md", "kanban.md", "backlog.md"];

/** §3.1 꼴 ①의 재료. 이 파일은 목록을 **주입**하므로 파생의 미규정([미규정])에 안 걸린다. */
const TOP_LEVEL = [
  ".gitignore",
  "LICENSE",
  "README.md",
  "THIRD_PARTY_NOTICES.md",
  "neo-agent-main",
];

const DOC_PATH = "neo-agent-main/docs/PUBLIC-TREE.md";

type OkRead = Extract<AddressRead, { ok: true }>;

function asAddress(text: string): OkRead {
  const read = readAddress(text, TOP_LEVEL);
  expect(read.ok, `주소로 안 읽혔다: ${text}`).toBe(true);
  return read as OkRead;
}

/** 위반 이름을 꺼낸다. 통과 갈래면 `null`이므로 «통과했다»가 조용히 초록이 되지 않는다. */
function violationOf(verdict: AddressVerdict): string | null {
  return verdict.ok ? null : verdict.violation;
}

/** 아무것도 안 풀리는 트리. 미해결 갈래만 재려는 것이므로 착지를 0으로 고정한다. */
function contextWith(presentTrees: readonly string[]): AddressContext {
  return {
    docPath: DOC_PATH,
    probePublic: () => "absent",
    probeRecord: () => "absent",
    presentTrees: new Set(presentTrees),
    basenameIndex: new Map(),
    sectionsOf: () => [],
  };
}

// ---------------------------------------------------------------------------
// 축 A — 순수 판정. §3.2 2026-09-04 확정 둘
// ---------------------------------------------------------------------------

describe("축 A — §3.2: 활성 마일스톤 슬롯이 접두 목록에서 빠졌다", () => {
  /** 이름을 코드 스팬 없이 조립한다(§3.4 넷째 행의 자기 적용). literal로 쓰면 이 파일이 §3의 게이트 대상은 아니나 표기 규칙과 어긋난다. */
  const SLOT = `MILESTONE${".md"}`;

  it("PRIVATE_RECORD_PREFIXES에 슬롯 이름이 없다", () => {
    expect(PRIVATE_RECORD_PREFIXES).not.toContain(SLOT);
  });

  it("아카이브 디렉터리는 목록에 남는다 — *“아카이브는 디렉터리이고 항상 있다”*", () => {
    expect(PRIVATE_RECORD_PREFIXES).toContain("milestones/");
  });

  it("목록이 §3.2 표의 열과 정확히 같다 — 슬롯이 빠져 열이다", () => {
    expect([...PRIVATE_RECORD_PREFIXES].sort()).toEqual(
      [...INTERNAL_DIR_PREFIXES, ...INTERNAL_FILE_PREFIXES].sort(),
    );
  });

  it("슬롯 이름의 코드 스팬은 꼴 ④로 읽혀 부류가 공개다 — 환경과 무관하게 dead-public이다", () => {
    const read = asAddress(SLOT);
    expect(read.form).toBe(4);
    expect(read.prefixClass).toBe("public");

    // 내부 트리를 전부 쥔 환경에서도, 하나도 없는 환경에서도 같은 판정이어야 한다.
    for (const trees of [[...INTERNAL_DIR_PREFIXES, ...FROZEN_DIR_PREFIXES], []]) {
      expect(violationOf(judgeAddress(read, contextWith(trees)))).toBe("dead-public");
    }
  });
});

describe("축 A — §3.2: 「그 트리가 있는가」의 단위는 접두가 아니라 부류다", () => {
  it("파일 접두 다섯 전부 — 같은 부류의 디렉터리 접두가 «하나라도» 있으면 dead-record다", () => {
    for (const prefix of INTERNAL_FILE_PREFIXES) {
      for (const only of INTERNAL_DIR_PREFIXES) {
        const verdict = judgeAddress(asAddress(prefix), contextWith([only]));
        expect(violationOf(verdict), `${prefix} × ${only}`).toBe("dead-record");
      }
    }
  });

  it("그 부류의 디렉터리 접두가 하나도 없으면 파일 접두는 미판정이다 — 재현본의 값이다", () => {
    for (const prefix of INTERNAL_FILE_PREFIXES) {
      const verdict = judgeAddress(asAddress(prefix), contextWith(FROZEN_DIR_PREFIXES));
      expect(verdict, prefix).toEqual({ ok: true, cls: "internal", unjudged: true });
    }
  });

  it("다른 부류의 디렉터리 접두는 답이 안 된다 — 동결 트리가 있어도 비공개 파일 접두는 미판정", () => {
    const verdict = judgeAddress(asAddress("kanban.md"), contextWith(["openclaw-main/"]));
    expect(verdict).toEqual({ ok: true, cls: "internal", unjudged: true });
  });

  it("디렉터리 접두의 판정은 하나도 안 바뀐다 — 자기 실재로만 답한다", () => {
    // `docs/` 자신이 없으면, 같은 부류의 `plans/`가 있어도 미판정이다.
    const absent = judgeAddress(asAddress("docs/nope.md"), contextWith(["plans/"]));
    expect(absent).toEqual({ ok: true, cls: "internal", unjudged: true });

    // 자신이 있으면 dead-record다.
    const present = judgeAddress(asAddress("docs/nope.md"), contextWith(["docs/"]));
    expect(violationOf(present)).toBe("dead-record");
  });

  it("동결 부류는 이 결정으로 아무것도 안 움직인다 — 접두 둘이 다 디렉터리다", () => {
    expect([...FROZEN_TREES].every((prefix) => prefix.endsWith("/"))).toBe(true);
    for (const prefix of FROZEN_TREES) {
      const other = FROZEN_TREES.find((one) => one !== prefix) as string;
      const verdict = judgeAddress(asAddress(`${prefix}nope.ts`), contextWith([other]));
      expect(verdict, `${prefix} (다른 접두만 실재)`).toEqual({
        ok: true,
        cls: "frozen",
        unjudged: true,
      });
    }
  });

  it("공개 부류는 트리 부재를 주장해도 미판정으로 안 샌다 — §3.2 표 첫 행", () => {
    const verdict = judgeAddress(asAddress("neo-agent-main/nope.md"), contextWith([]));
    expect(violationOf(verdict)).toBe("dead-public");
  });
});

// ---------------------------------------------------------------------------
// 축 B — 실행부. 픽스처 트리에 실물 게이트를 띄운다
// ---------------------------------------------------------------------------

type GateResult = { status: number; out: string };

/**
 * 픽스처 공개 트리를 만든다. §7의 재현본과 같은 모양이다 — 추적 오라클(`git init && add &&
 * commit`)이 복원된 트리에 실행부 사본을 놓는다.
 *
 * @param spans `neo-agent-main/docs/SPEC.md` 본문에 넣을 줄들
 * @param presentDirs 픽스처 루트에 **실재시킬** 내부·동결 디렉터리 접두
 */
function fixture(label: string, spans: readonly string[], presentDirs: readonly string[]): string {
  const root = workspace(label);
  mkdirSync(join(root, "neo-agent-main/docs"), { recursive: true });
  mkdirSync(join(root, "neo-agent-main/scripts"), { recursive: true });
  for (const name of ["address.mjs", "check-address.mjs"]) {
    cpSync(join(SCRIPTS, name), join(root, "neo-agent-main/scripts", name));
  }
  // 내부·동결 트리는 작업 폴더에는 있으나 git 추적 밖에 두는 것이 이 픽스처의 설계다(§3.2 —
  // 비공개·동결 부류의 해결은 작업 폴더의 실재로 묻고, 공개 부류만 추적성으로 묻는다).
  writeFileSync(
    join(root, ".gitignore"),
    [...INTERNAL_DIR_PREFIXES, ...FROZEN_DIR_PREFIXES, ...INTERNAL_FILE_PREFIXES]
      .map((prefix) => `/${prefix}`)
      .join("\n"),
  );
  writeFileSync(
    join(root, "neo-agent-main/README.md"),
    "# README\n\n- `neo-agent-main/docs/SPEC.md`\n",
  );
  writeFileSync(join(root, "neo-agent-main/CONTRIBUTING.md"), "# CONTRIBUTING\n");
  writeFileSync(
    join(root, "neo-agent-main/docs/SPEC.md"),
    ["# SPEC", "", "## 1. 자리", "", ...spans, ""].join("\n"),
  );
  for (const prefix of presentDirs) {
    const dir = join(root, prefix.replace(/\/+$/, ""));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "keep.txt"), "keep\n");
  }
  gitInit(root);
  return root;
}

function gitInit(root: string): void {
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, "-c", "user.email=qa@local", "-c", "user.name=qa", ...args], {
      stdio: "pipe",
    });
  git("init", "-q");
  git("add", "-A");
  git("commit", "-qm", "fixture");
}

function runGate(root: string): GateResult {
  const result = spawnSync("node", [join(root, "neo-agent-main/scripts/check-address.mjs")], {
    encoding: "utf8",
  });
  return { status: result.status ?? -1, out: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

/** 실행부 사본에 문자열 치환을 건다. **사본만 고친다 — `src/`는 안 건드린다.** */
function patch(root: string, relative: string, from: string, to: string): void {
  const path = join(root, relative);
  const source = readFileSync(path, "utf8");
  expect(source.includes(from), `치환 대상이 없다: ${from}`).toBe(true);
  writeFileSync(path, source.replace(from, to));
}

describe("축 B — §3.2 실행부: 파일 접두가 부류 단위로 판정된다", () => {
  it("`devlog.md`가 안 풀리고 `devnotes/`가 있으면 게이트가 dead-record로 붉는다", () => {
    const gate = runGate(fixture("b1", ["근거는 `devlog.md`가 든다."], ["devnotes/"]));
    expect(gate.status).toBe(1);
    expect(gate.out).toContain("[dead-record]");
    expect(gate.out).toContain("devlog.md");
  });

  it("「하나라도」 — 그 부류의 디렉터리 접두가 `plans/` 하나뿐이어도 dead-record다", () => {
    const gate = runGate(fixture("b2", ["근거는 `devlog.md`가 든다."], ["plans/"]));
    expect(gate.status).toBe(1);
    expect(gate.out).toContain("[dead-record]");
  });

  it("내부 디렉터리 접두가 하나도 없으면 미판정이고 게이트는 초록이다 — 재현본의 성질", () => {
    const gate = runGate(fixture("b3", ["근거는 `devlog.md`가 든다."], []));
    expect(gate.status).toBe(0);
    expect(gate.out).toContain("미판정 1");
    expect(gate.out).toContain("위반 0");
  });

  it("대조군 — 디렉터리 접두는 원래부터 발화한다", () => {
    const gate = runGate(fixture("b4", ["자리는 `devnotes/nope.md`다."], ["devnotes/"]));
    expect(gate.status).toBe(1);
    expect(gate.out).toContain("[dead-record]");
  });

  it("디렉터리 접두는 자기 실재로만 답한다 — `docs/` 부재 + `plans/` 실재는 미판정", () => {
    const gate = runGate(fixture("b5", ["자리는 `docs/nope.md`다."], ["plans/"]));
    expect(gate.status).toBe(0);
    expect(gate.out).toContain("미판정 1");
  });

  it("슬롯 이름은 두 환경에서 같은 판정을 받는다 — dead-public", () => {
    const span = `\`MILESTONE${".md"}\``;
    for (const dirs of [[...INTERNAL_DIR_PREFIXES, ...FROZEN_DIR_PREFIXES], []]) {
      const gate = runGate(fixture(`b6-${dirs.length}`, [`슬롯은 ${span}다.`], dirs));
      expect(gate.status, `실재 디렉터리 ${dirs.length}개`).toBe(1);
      expect(gate.out).toContain("[dead-public]");
    }
  });
});

describe("축 B — §3.5 fail-closed 넷째 그물: 정의역은 설정 목록이다", () => {
  /**
   * §3.5 — *"접두 표의 어느 부류에 디렉터리 접두가 하나도 없다"*.
   *
   * **정의역이 「설정 목록」인 근거는 §3.2가 건 다른 불변이다**(문면에 낱말은 없다):
   * *"재현본은 안 바뀐다 … §9 U-e가 실측한 값이 그대로 선다"*. 재현본에는 디렉터리 접두가
   * 원리적으로 0이므로, 디스크를 정의역으로 읽으면 이 그물이 재현본에서 **항상** 발화해
   * 그 불변(위반 0)이 깨진다. 아래 마지막 케이스가 그 반사실을 실측으로 든다.
   */
  it("비공개 목록에서 디렉터리 꼴을 전부 빼면 fail-closed로 죽는다 (역검증)", () => {
    const root = fixture("b7", ["`devlog.md`"], ["devnotes/", "plans/"]);
    for (const prefix of INTERNAL_DIR_PREFIXES) {
      patch(root, "neo-agent-main/scripts/address.mjs", `  "${prefix}",\n`, "");
    }
    const gate = runGate(root);
    expect(gate.status).toBe(1);
    expect(gate.out).toContain("[fail-closed]");
    expect(gate.out).toContain("디렉터리 접두가 하나도 없다");
    expect(gate.out).toContain("비공개 기록");
  });

  it("동결 목록에서 디렉터리 꼴을 전부 빼면 fail-closed로 죽는다 (역검증)", () => {
    const root = fixture("b8", ["`devlog.md`"], ["devnotes/"]);
    patch(
      root,
      "neo-agent-main/scripts/address.mjs",
      `"${FROZEN_DIR_PREFIXES[0]}", "${FROZEN_DIR_PREFIXES[1]}"`,
      '"openclaw.md", "hermes.md"',
    );
    const gate = runGate(root);
    expect(gate.status).toBe(1);
    expect(gate.out).toContain("[fail-closed]");
    expect(gate.out).toContain("동결 레퍼런스");
  });

  it("디스크에 디렉터리 접두가 0이어도 이 그물은 발화하지 않는다", () => {
    const gate = runGate(fixture("b9", ["`neo-agent-main/README.md`"], []));
    expect(gate.status).toBe(0);
    expect(gate.out).not.toContain("fail-closed");
  });

  it("[반사실] 정의역을 디스크로 바꾸면 재현본이 붉는다 — 이 그물이 정의역에 민감하다", () => {
    const root = repro("b10");
    patch(
      root,
      "neo-agent-main/scripts/check-address.mjs",
      "hasDirectoryPrefix(prefixes)",
      "hasDirectoryPrefix([...presentTrees])",
    );
    const gate = runGate(root);
    expect(gate.status, "디스크 정의역은 재현본에서 fail-closed여야 한다").toBe(1);
    expect(gate.out).toContain("[fail-closed]");
  });
});

// ---------------------------------------------------------------------------
// 축 C — 재현본 회귀 (§7 재현 방법 · §9 U-e 실측값)
// ---------------------------------------------------------------------------

/**
 * §7의 재현본. *"`git archive HEAD | tar -x`로 공개 트리 재현본을 만들고 **추적 오라클을
 * 복원한 뒤**"*. 워킹트리의 미커밋 변경까지 재려고 `git stash create`의 스냅샷을 쓴다 —
 * 그것은 스태시 **목록에 안 남으므로** 다른 작업과 충돌하지 않는다(`git stash` 자체는 남는다).
 */
function repro(label: string): string {
  const root = workspace(label);
  const stage = workspace(`${label}-tar`);
  const snapshot =
    execFileSync("git", ["-C", REPO_ROOT, "stash", "create"], { encoding: "utf8" }).trim() ||
    "HEAD";
  const archive = execFileSync("git", ["-C", REPO_ROOT, "archive", snapshot], {
    maxBuffer: 512 * 1024 * 1024,
  });
  const tarball = join(stage, "repro.tar");
  writeFileSync(tarball, archive);
  execFileSync("tar", ["-x", "-f", tarball, "-C", root]);
  gitInit(root);
  return root;
}

type Summary = {
  documents: number;
  spans: number;
  addresses: number;
  public: number;
  internal: number;
  frozen: number;
  unjudged: number;
};

function parseSummary(out: string): Summary {
  const pick = (label: string, pattern: RegExp): number => {
    const found = pattern.exec(out);
    const digits = found?.[1];
    expect(digits, `게이트 출력에 «${label}»이 없다:\n${out}`).toBeTypeOf("string");
    return Number(String(digits).replace(/,/g, ""));
  };
  return {
    documents: pick("문서", /문서 (\d+)개/),
    spans: pick("코드 스팬", /코드 스팬 ([\d,]+)/),
    addresses: pick("주소", /주소 ([\d,]+)/),
    public: pick("공개", /공개 ([\d,]+) ·/),
    internal: pick("비공개", /비공개 ([\d,]+) ·/),
    frozen: pick("동결", /동결 ([\d,]+)\)/),
    unjudged: pick("미판정", /미판정 ([\d,]+)/),
  };
}

let reproGate: GateResult | null = null;
function reproRun(): GateResult {
  if (reproGate === null) reproGate = runGate(repro("c"));
  return reproGate;
}

describe("축 C — §7·§9 U-e: 재현본 회귀", () => {
  it("§9 U-e — 재현본에서 게이트가 실제로 돌고 위반이 0이다", () => {
    const gate = reproRun();
    expect(gate.status, gate.out).toBe(0);
    expect(gate.out).toContain("위반 0");
  });

  it("§3.2 — 재현본에는 디렉터리 접두가 없으므로 그 부류 전체가 미판정이다", () => {
    // 구조적 불변: 미판정 = 비공개 + 동결. 착지가 없으므로 이 갈래에서만 접두가 부류를 말한다.
    const summary = parseSummary(reproRun().out);
    expect(summary.unjudged).toBe(summary.internal + summary.frozen);
    expect(summary.unjudged).toBeGreaterThan(0);
  });

  it.skip("[K-476] §9 U-e가 실측한 미판정 419가 오늘 재현되지 않는다", () => {
    const summary = parseSummary(reproRun().out);
    // §3.2가 *"재현본은 안 바뀐다 … §9 U-e가 실측한 값이 그대로 선다"*로 이 수에 불변을
    // 걸었다. 판정 모듈 교체가 원인이 **아니다** — 같은 코퍼스에서 착지 전후 스크립트가
    // 같은 값을 낸다(리포트 F-1의 A/B). 원인은 코퍼스 증가이고, 문면의 수가 낡았다.
    // `K-476` 처분 시 스킵을 풀고 기대값을 그 시점 실측으로 갱신한다.
    expect(summary.unjudged).toBe(419);
  });
});

let workdirGate: GateResult | null = null;
function workdirRun(): GateResult {
  if (workdirGate === null) {
    const result = spawnSync("node", [join(SCRIPTS, "check-address.mjs")], { encoding: "utf8" });
    workdirGate = {
      status: result.status ?? -1,
      out: `${result.stdout ?? ""}${result.stderr ?? ""}`,
    };
  }
  return workdirGate;
}

describe("축 C — §3.5: 작업 폴더의 게이트 출력", () => {
  it("§3.5 — 성공도 조용하지 않다: 부류별 요약과 미판정 수를 함께 낸다", () => {
    const { status, out } = workdirRun();
    expect(status, out).toBe(0);
    expect(out).toMatch(/문서 \d+개 · 코드 스팬 \d+ · 주소 \d+/);
    expect(out).toMatch(/공개 \d+ · 비공개 \d+ · 동결 \d+/);
    expect(out).toMatch(/미판정 \d+/);
    expect(out).toContain("위반 0");
  });

  it("§3.2 — 작업 폴더는 접두를 다 쥐므로 미판정이 0이다", () => {
    expect(parseSummary(workdirRun().out).unjudged).toBe(0);
  });

  it("[미규정] `presentTrees`는 디렉터리인지를 안 묻는다 — 같은 이름의 «파일»도 트리로 센다", () => {
    // §3.2는 *"그 부류의 디렉터리 접두 중 하나라도 작업 폴더에 있으면"*이라 적을 뿐,
    // 그 실재가 디렉터리여야 하는지를 안 정했다. 아래는 오늘의 동작을 기록만 한다.
    const root = fixture("c3", ["`devlog.md`"], []);
    writeFileSync(join(root, "plans"), "디렉터리가 아니라 파일이다\n");
    const gate = runGate(root);
    expect(gate.status).toBe(1);
    expect(gate.out).toContain("[dead-record]");
  });
});
