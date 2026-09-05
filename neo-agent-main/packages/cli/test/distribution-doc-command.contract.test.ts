/**
 * 문서가 든 실행 명령을 재는 축 — 정본은 `docs/DISTRIBUTION.md` §3.5.
 *
 * 그 절이 세운 모집단은 명령 전체가 아니라 "정본이 이 트리에 있는 부품"이고, 축은 다섯이다 —
 * A-1 bin 경로 · A-2 이미지 태그 · A-3 홈 경로 · A-4 uid 인자 · A-5 사본 일치. 이 파일은 그
 * 다섯을 이 트리의 실물에 대고 재고, 그다음 **축이 그린인 것과 축이 없는 것을 구별한다**.
 *
 * **판정 로직은 이 파일에 없다.** 순수 판정 층은 `doc-command-axes.ts`가 들고 여기는 I/O와
 * 단정만 진다 — 판정이 경로를 품으면 역검증이 작업 트리의 파일을 변조하는 수밖에 없기 때문이다.
 *
 * **왜 새 파일인가.** §3.5의 「자리」 문단이 둘을 함께 기각했다 — 여섯째 `check-*.mjs`를 세우는
 * 것과, "공급망 계약 테스트에 합치지 않는다". 그쪽 대상은 매니페스트와 shim이고 이쪽은 문서
 * 문면이라, 실패 메시지가 섞이면 무엇이 깨졌는지가 흐려진다.
 *
 * ## 오늘 다섯 축 전부 위반이 0이다 — 그래서 역검증이 이 파일의 절반이다
 *
 * 축이 처음부터 그린이면 「검사가 있다」와 「검사가 대상을 못 찾았다」가 관측상 같다
 * (`ARCHITECTURE.md` §2.6). 아래 「역검증」 describe가 변조한 **문자열**을 판정 함수에 먹여
 * 위반이 실제로 나오는지 본다. **고의 위반은 전부 문자열 변조이고 작업 트리를 만지지 않는다** —
 * `distribution-supply-chain.contract.test.ts`가 세운 규율이되, 그쪽이 `mkdtemp` 사본을 쓴 자리를
 * 이쪽은 판정 층이 순수 함수라 사본조차 필요 없다.
 *
 * ## 이 축이 재지 못하는 것 — §3.5의 다섯
 *
 * 셋만 적으면 읽는 사람이 그것을 완전한 목록으로 읽으므로 다섯을 다 든다. 전문은
 * `doc-command-axes.ts` 머리가 들고, 여기서는 이 파일의 단정에 걸리는 형태로 줄여 적는다.
 *
 * 1. **이미지의 실제 내용.** `bookworm` 태그가 담은 Node 패치 버전은 원격 레지스트리의 것이다 —
 *    "A-2가 재는 것은 태그 문자열의 major뿐이다".
 * 2. **인자의 의미.** `--rm`·`-e HOME`·`-w`가 있는지는 재지만 "그것들이 무엇을 하는지는 안 잰다".
 * 3. **실사용 홈에서의 동작.** 실물 축이 임시 홈을 마운트하므로 재는 것은 기동 성공 여부다.
 * 4. **문서가 안 든 명령.** 축의 입력이 문서에 적힌 블록이라 원리적으로 모집단 밖이다.
 * 5. **실물 축을 실제로 돌렸는가.** 옵트인이라 사람이 부르고, 부르지 않은 것을 재는 기계는 없다.
 *
 * ## 인용 계약 — `DOC-CITATION.md` §6 U-b
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 함수·필드 이름으로 한다.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type DockerRun,
  extractCommandBlock,
  HOME_SOURCE_FILES,
  type HomeSource,
  judgeBinPath,
  judgeCopyParity,
  judgeHomePath,
  judgeImageTag,
  judgeLiveSupport,
  judgeUidArg,
  parseDockerRun,
  type Violation,
} from "./doc-command-axes.ts";

// ---------------------------------------------------------------------------
// 자리 — 절은 제목 문자열로 지목한다 (줄번호가 아니다)
// ---------------------------------------------------------------------------

/** `packages/cli/test` → 워크스페이스 루트 */
const WORKSPACE = resolve(import.meta.dirname, "..", "..", "..");

const DISTRIBUTION_PATH = join(WORKSPACE, "docs", "DISTRIBUTION.md");
/** `neo-agent-main/README.md`. 맨 이름으로 쓰지 않는다 — `scripts/spy-docker/README.md`가 있다 */
const README_PATH = join(WORKSPACE, "README.md");
const SHIM_PATH = join(WORKSPACE, "packages", "cli", "bin", "neo-agent.mjs");
const CLI_MANIFEST_PATH = join(WORKSPACE, "packages", "cli", "package.json");
const CREDENTIALS_PATH = join(WORKSPACE, "packages", "cli", "src", "credentials.ts");
const CLI_SRC_DIR = join(WORKSPACE, "packages", "cli", "src");

/**
 * 절 앵커 셋. 개명되면 추출기의 그물이 발화해 이 파일이 붉어지고, **그때 고칠 것은 이 상수이지
 * 문서가 아니다** — "0건은 절이 개명·이동돼 축이 조용히 죽은 것이고, 2건 이상은 어느 것이
 * 대상인지 모르는 것이다".
 */
const SECTION_CONTAINER = "### 3.3 컨테이너 실행 — 이미지를 굽지 않는다 (2026-09-05 확정)";
const SECTION_INSTALL = "### 3.1 설치 절차 (README가 담을 것)";
const README_SECTION_CONTAINER = "## 컨테이너로 실행하기 (선택)";

const read = (path: string): string => readFileSync(path, "utf8");

const DISTRIBUTION_MD = read(DISTRIBUTION_PATH);
const README_MD = read(README_PATH);

/** §3.3의 `docker run` 블록. A-1·A-2·A-3·A-4·A-5가 전부 이것을 다른 각도로 본다 */
const DOC_BLOCK = extractCommandBlock(DISTRIBUTION_MD, SECTION_CONTAINER);
/** `neo-agent-main/README.md`의 사본. A-5의 대조 상대다 */
const README_BLOCK = extractCommandBlock(README_MD, README_SECTION_CONTAINER);
/**
 * §3.1의 설치 블록. **여기서 A-1에 들어오는 것은 `ln -s` 대상 한 줄뿐이다** — §3.5가
 * "§3.1을 통째로 넣지 않는다"고 적었고, "그 절의 `git clone` URL과 `pnpm install`은 이 트리에
 * 정본이 없어 위와 같은 대조가 성립하지 않는다".
 */
const INSTALL_BLOCK = extractCommandBlock(DISTRIBUTION_MD, SECTION_INSTALL);

const SHIM_SOURCE = read(SHIM_PATH);
const CREDENTIALS_SOURCE = read(CREDENTIALS_PATH);
const CLI_BIN_FIELD = ((): string => {
  const manifest = JSON.parse(read(CLI_MANIFEST_PATH)) as { bin?: Record<string, string> };
  const value = manifest.bin?.["neo-agent"];
  if (value === undefined) throw new Error("`packages/cli`의 `bin` 필드에 `neo-agent`가 없다");
  return value;
})();

/** §3.5가 A-3의 정본으로 든 네 파일. 개수의 정본은 헬퍼의 `HOME_SOURCE_FILES`다 */
const HOME_SOURCES: readonly HomeSource[] = HOME_SOURCE_FILES.map((file) => ({
  file,
  source: read(join(CLI_SRC_DIR, file)),
}));

/** 위반을 기계 판정용 라벨로. `detail`은 사람이 읽는 자리라 대조에 쓰지 않는다 */
const labels = (violations: readonly Violation[]): string[] =>
  violations.map((violation) => `${violation.axis}:${violation.rule}`);

/** 파싱 성공을 단정하고 결과를 돌려준다 — 실패하면 그 자체가 발견이다 */
function parsedRun(block: string): DockerRun {
  const parsed = parseDockerRun(block);
  if (!parsed.ok) throw new Error(`§3.3의 명령을 파싱하지 못했다: ${parsed.reason}`);
  return parsed.run;
}

// ---------------------------------------------------------------------------
// 전제 — 이것이 틀리면 이 파일의 모든 단정이 무의미하다
// ---------------------------------------------------------------------------

describe("전제", () => {
  it("워크스페이스 루트 계산이 맞다", () => {
    expect(existsSync(join(WORKSPACE, "pnpm-workspace.yaml"))).toBe(true);
    const root = JSON.parse(read(join(WORKSPACE, "package.json"))) as { name?: string };
    expect(root.name).toBe("neo-agent-workspace");
  });

  it("절 앵커 셋이 각각 대상 절에서 `bash` 펜스를 정확히 1건 뽑았다", () => {
    // 그물이 발화하면 위 상수 계산에서 이미 throw했다. 여기서는 뽑힌 것이 실제로 그 명령인지 본다.
    expect(DOC_BLOCK).toContain("docker run");
    expect(README_BLOCK).toContain("docker run");
    expect(INSTALL_BLOCK).toContain("ln -s");
  });

  it("README 쪽 앵커는 컨테이너 절이다 — 「설치」 절이 아니다", () => {
    // §3.5가 A-5의 대상으로 든 것은 §3.3 하나다. README의 `## 설치` 절은 `bash` 펜스를 2건 들어
    // (설치와 되돌리기) 추출기의 그물이 먼저 발화하고, 그것은 문서 결함이 아니라 축의 오적용이다.
    expect(README_SECTION_CONTAINER).toBe("## 컨테이너로 실행하기 (선택)");
    expect(README_MD).toContain(README_SECTION_CONTAINER);
  });
});

// ---------------------------------------------------------------------------
// A-5 — 사본 일치
//
// §3.5 표: "§3.3의 명령 블록과 `neo-agent-main/README.md`의 명령 블록이 문자 그대로 같다".
// 그 절이 "A-5가 가장 싸고 가장 많이 잡는다"고 든 축이다.
//
// **§3.1↔README 「설치」는 이 축의 대상이 아니다.** 2026-09-05 실측으로 그 둘은 바이트 일치가
// 아니다 — §3.1은 두 줄에 후행 주석이 달려 있고 README 쪽에는 PATH 안내 줄이 하나 더 있다.
// A-5를 그쪽으로 넓히려는 다음 사이클은 그 전에 README `## 설치` 절의 `bash` 펜스 2건에서
// 먼저 죽는다. 넓힌 뒤 붉어지는 것은 문서 결함이 아니라 축의 오적용이다.
//
// 대조는 정규화 없이 한다 — 두 사본이 손으로 유지된다는 것이 이 축의 전제이고, 정규화하면
// 그 전제가 재는 대상을 지운다.
// ---------------------------------------------------------------------------

describe("A-5 사본 일치", () => {
  it("§3.3의 명령 블록과 `neo-agent-main/README.md`의 명령 블록이 바이트 일치한다", () => {
    expect(labels(judgeCopyParity(DOC_BLOCK, README_BLOCK))).toEqual([]);
  });

  it("두 사본이 비어 있지 않다 — 빈 블록의 일치는 축의 죽음과 구별되지 않는다", () => {
    expect(DOC_BLOCK.length).toBeGreaterThan(0);
    expect(README_BLOCK).toBe(DOC_BLOCK);
  });
});

// ---------------------------------------------------------------------------
// A-1 — bin 경로
//
// §3.5 표: "§3.3 명령의 마지막 인자와 §3.1의 `ln -s` 대상이 `packages/cli`의 `bin` 필드가
// 가리키는 파일과 같고, 그 파일이 실재한다".
//
// **기존 두 파일과의 중복 관계** (실측 2026-09-05):
//   - `distribution-qa-b.contract.test.ts` — `neo-agent-main/README.md`의 `ln -s` 줄을
//     리터럴로 단정하고 shim 실재를 본다.
//   - `distribution-supply-chain.contract.test.ts` — `packages/cli`의 `bin` 필드를 단정한다.
// 즉 A-1의 재료 넷 중 셋이 이미 재지고 있고, **이 축이 더하는 것은 §3.3 명령의 마지막 인자와
// 넷의 상호 수렴**이다. 관계를 안 적으면 ① 실패했을 때 세 파일이 서로 다른 문면으로 붉어지고
// ② `distribution-qa-b`의 하드코딩 리터럴이 이 축과 갈라져도 아무도 모른다.
//
// **`git clone` URL과 `pnpm install`에 대한 단정은 여기에 없다** — 모집단 밖이다.
// ---------------------------------------------------------------------------

describe("A-1 bin 경로", () => {
  it("네 재료가 수렴한다 (판정)", () => {
    expect(labels(judgeBinPath(DOC_BLOCK, INSTALL_BLOCK, CLI_BIN_FIELD))).toEqual([]);
  });

  it("재료 넷이 각각 `packages/cli/bin/neo-agent.mjs`다", () => {
    const expected = "packages/cli/bin/neo-agent.mjs";

    // ① §3.3 명령의 마지막 인자
    expect(parsedRun(DOC_BLOCK).command.at(-1)).toBe(expected);

    // ② §3.1의 `ln -s` 대상 — `$PWD/` 접두를 걷는다. 접두가 워크스페이스 루트를 가리키는 것은
    //    §3.1의 계약이고, 안 걷으면 축이 형태 차이를 위반으로 낸다.
    const target = /\bln\s+-s\s+"([^"]+)"/.exec(INSTALL_BLOCK)?.[1];
    expect(target).toBeDefined();
    expect(target?.replace(/^\$PWD\//, "")).toBe(expected);

    // ③ `packages/cli`의 `bin` 필드 (패키지 디렉터리 상대)
    expect(`packages/cli/${CLI_BIN_FIELD.replace(/^\.\//, "")}`).toBe(expected);

    // ④ 실재 — 이것만 I/O다
    expect(existsSync(join(WORKSPACE, expected))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// A-2 — 이미지 태그
//
// §3.5 표: "태그의 major가 shim의 Node 하한 상수와 같다. 태그가 `latest`가 아니다".
//
// **재는 것은 태그 문자열의 major뿐이다.** 그 태그가 담은 실제 Node 패치 버전은 원격
// 레지스트리의 것이라 우리 자산이 아니다 — §3.5가 "A-2가 재는 것은 태그 문자열의 major뿐이다"로
// 못박은 한계다. 이미지가 실제로 그 major의 Node를 담고 있는지는 실물 축만 안다.
//
// **§3.3은 이 축 때문에 개정되지 않는다.** 그 절이 고정 태그의 강제 지점이 없다고 적은 것은
// **사용자가 치는 명령**에 대해 참이고, A-2가 강제하는 것은 **문서가 든 명령**이다.
// §3.5가 명시적으로 그렇게 적었다 — "둘은 다른 대상이므로 §3.3은 개정되지 않는다".
//
// shim을 import하지 않는다 — import하면 그 파일이 자기 버전 게이트를 돌리고, 통과하면
// `main.ts`까지 끌고 온다. 상수는 텍스트에서 뽑는다.
// ---------------------------------------------------------------------------

describe("A-2 이미지 태그", () => {
  it("태그 major가 shim의 하한 상수와 같고 `latest`가 아니다 (판정)", () => {
    expect(labels(judgeImageTag(DOC_BLOCK, SHIM_SOURCE))).toEqual([]);
  });

  it("태그의 major와 `MIN_NODE_MAJOR`가 같은 값이다", () => {
    const tag = parsedRun(DOC_BLOCK).image.split(":").at(-1);
    expect(tag).toBeDefined();
    const tagMajor = /^(\d+)/.exec(tag ?? "")?.[1];
    const shimMajor = /^const MIN_NODE_MAJOR = (\d+);$/m.exec(SHIM_SOURCE)?.[1];
    expect(shimMajor).toBeDefined();
    expect(tagMajor).toBe(shimMajor);
  });

  it("태그가 `latest`가 아니다", () => {
    expect(parsedRun(DOC_BLOCK).image.split(":").at(-1)).not.toBe("latest");
  });

  it("shim 상수를 텍스트로 뽑는다 — 이 파일도 헬퍼도 shim을 import하지 않는다", () => {
    for (const source of [
      read(import.meta.filename),
      read(join(import.meta.dirname, "doc-command-axes.ts")),
    ]) {
      expect(source).not.toMatch(/import\s*\([^)]*neo-agent\.mjs/);
      expect(source).not.toMatch(/from\s+["'][^"']*neo-agent\.mjs["']/);
    }
  });
});

// ---------------------------------------------------------------------------
// A-3 — 홈 경로
//
// §3.5 표: "마운트 원본·대상의 디렉터리 이름이 코드가 홈 아래에 쓰는 이름과 같다".
// 정본은 `packages/cli/src`의 홈 경로 계산 넷이다.
//
// **원본과 대상을 각각 잰다.** §3.5 표의 문면이 마운트 원본·대상 양쪽을 들고, 한쪽만 재면
// 비대칭 마운트가 통과한다.
//
// **넷의 합의 자체가 대조 상대다.** §3.5 미결 2가 "오늘 그 문자열은 `packages/cli/src`의 네
// 파일에 각각 리터럴로 산다"고 적었고 그중 무엇이 정본인지는 안 정했다 — 정본이 없으므로
// 합의가 깨지면 축은 대조할 값을 잃는다. 상수 하나로 모으는 변경(`K-503`)은 이 사이클 밖이다.
// ---------------------------------------------------------------------------

describe("A-3 홈 경로", () => {
  it("마운트 원본·대상과 코드 네 자리가 같은 이름이다 (판정)", () => {
    expect(labels(judgeHomePath(DOC_BLOCK, HOME_SOURCES))).toEqual([]);
  });

  it("마운트 원본과 대상을 각각 잰다", () => {
    const mounts = parsedRun(DOC_BLOCK)
      .options.filter((option) => option.flag === "-v")
      .map((option) => option.value ?? "")
      .filter((value) => value.includes("$HOME"));
    expect(mounts).toHaveLength(1);
    const [source, target] = (mounts[0] ?? "").split(":");
    expect(source).toBe("$HOME/.neo-agent");
    expect(target).toBe("$HOME/.neo-agent");
  });

  it("`src` 네 파일의 리터럴이 하나로 합의하고, 재료 개수도 넷이다", () => {
    // 개수를 단정하는 것이 검사가 조용히 좁아지는 것을 막는 유일한 수단이다.
    expect(HOME_SOURCES).toHaveLength(4);
    expect(HOME_SOURCES.map((entry) => entry.file).sort()).toEqual([
      "allowlist.ts",
      "config.ts",
      "credentials.ts",
      "memory.ts",
    ]);
    const names = new Set(
      HOME_SOURCES.map(
        (entry) => /join\(\s*home\s*\?\?\s*homedir\(\)\s*,\s*"([^"]+)"/.exec(entry.source)?.[1],
      ),
    );
    expect([...names]).toEqual([".neo-agent"]);
  });
});

// ---------------------------------------------------------------------------
// A-4 — uid 인자
//
// §3.5 표: "`-u` 인자가 있고, 그 필요를 낳는 권한 검사가 여전히" — 그 절의 표현으로
// "모드 비트만" 본다. 정본은 `packages/cli/src/credentials.ts`의 `assertSafePermissions`이고,
// §3.5가 §3.3의 줄번호 인용을 걷으면서 "지목을 함수 이름으로 바꾸면 A-4가 그 실재를 잰다"고
// 적었다 — 그래서 이 파일도 그 함수를 **이름으로만** 지목한다.
//
// ## 이 판별은 근사다 — 한계를 전부 든다
//
// 「모드 비트만 본다」를 「모드 비트를 읽고 소유자를 안 읽는다」로 옮겼다. 판별 전에 주석과
// 문자열 리터럴을 벗기므로 주석 한 줄로 축을 속일 수는 없으나, 아래는 못 잡거나 헛짚는다:
//
//   1. 헬퍼로 감싼 소유자 검사 — 본문이 `isOwnedByMe(path)`를 부르고 그 함수가 `uid`를 읽으면
//      못 본다. 본문 텍스트만 보기 때문이다.
//   2. 다른 이름으로 읽는 소유자 — 계산된 접근(`stat[key]`)이나 별칭 상수는 못 잡는다.
//   3. 모드 비트를 헬퍼가 대신 읽어 본문에 `mode`도 `0o…`도 안 남는 경우 — 거짓 위반이 난다
//      (fail-closed 방향이라 받는다).
//   4. 읽고 아무것도 안 하는 본문 — 텍스트를 보지 거동을 안 보므로 통과한다.
//   5. 함수 형태 — `function <이름>`과 `const <이름> = … => …` 둘만 본문으로 인식한다.
//      클래스 메서드나 객체 프로퍼티로 옮기면 못 찾은 것으로 처리돼 위반이 난다(fail-closed).
//   6. 자리 — 이름이 지목한 함수 본문만 본다. 호출자 쪽 소유자 검사는 축 밖이다.
//
// **`-u`에 대해서는 있는지만 재고 그것이 무엇을 하는지는 안 잰다** — §3.5의 한계 ②가
// `--rm`·`-e HOME`·`-w`에 대해 든 것과 같은 자리다.
// ---------------------------------------------------------------------------

describe("A-4 uid 인자", () => {
  it("`-u`가 있고 권한 검사가 모드 비트만 본다 (판정)", () => {
    expect(labels(judgeUidArg(DOC_BLOCK, CREDENTIALS_SOURCE))).toEqual([]);
  });

  it("명령에 `-u` 인자가 있다", () => {
    expect(parsedRun(DOC_BLOCK).options.some((option) => option.flag === "-u")).toBe(true);
  });

  it("`assertSafePermissions`를 이름으로 지목한다 — 소스 줄번호 지목이 0건이다", () => {
    expect(CREDENTIALS_SOURCE).toContain("function assertSafePermissions");
    for (const source of [
      read(import.meta.filename),
      read(join(import.meta.dirname, "doc-command-axes.ts")),
    ]) {
      expect(source).not.toMatch(/credentials\.ts:\d+/);
    }
  });

  it("함수를 못 찾으면 실패한다 — 개명 시 조용한 통과가 없다", () => {
    const renamed = CREDENTIALS_SOURCE.replace(
      /function assertSafePermissions\b/,
      "function assertSafeMode",
    );
    expect(renamed).not.toBe(CREDENTIALS_SOURCE);
    expect(labels(judgeUidArg(DOC_BLOCK, renamed))).toContain("A-4:guard-missing");
  });
});

// ---------------------------------------------------------------------------
// 역검증 — 축이 그린인 것과 축이 없는 것을 구별한다
//
// 오늘 다섯 축 전부 위반이 0이므로, 이 describe가 없으면 위의 단정 전부가 「아무것도 안 재고
// 통과」와 관측상 같다(`ARCHITECTURE.md` §2.6).
//
// **변조는 전부 문자열이다.** 작업 트리의 파일도, 그 사본도 만들지 않는다 — 판정 층이 순수
// 함수라 그럴 필요가 없고, 트리를 만지면 테스트가 중간에 죽었을 때 되돌릴 수단이 없다.
//
// 대조는 「어떤 규칙이 났는가」로 하되 `toContain`이다. `toEqual`로 정확 일치를 걸면 한 변조가
// 규칙 둘을 낼 때 물린다 — 예: `node:latest`는 `floating-tag`와 `tag-major-unreadable`을
// 함께 낸다(`latest`에는 읽을 major가 없다).
// ---------------------------------------------------------------------------

describe("역검증 — 변조한 입력에서 축이 떨어진다", () => {
  it("① 명령의 마지막 인자를 다른 경로로 → A-1 위반", () => {
    const mutated = DOC_BLOCK.replace(
      "node packages/cli/bin/neo-agent.mjs",
      "node packages/cli/bin/other.mjs",
    );
    expect(mutated).not.toBe(DOC_BLOCK);
    expect(labels(judgeBinPath(mutated, INSTALL_BLOCK, CLI_BIN_FIELD))).toContain("A-1:divergent");
  });

  it("② `ln -s` 대상을 다른 파일로 → A-1 위반", () => {
    const mutated = INSTALL_BLOCK.replace(
      "$PWD/packages/cli/bin/neo-agent.mjs",
      "$PWD/packages/cli/bin/other.mjs",
    );
    expect(mutated).not.toBe(INSTALL_BLOCK);
    expect(labels(judgeBinPath(DOC_BLOCK, mutated, CLI_BIN_FIELD))).toContain("A-1:divergent");
  });

  it("③ 태그를 `node:22-bookworm`으로 → A-2 major 불일치", () => {
    const mutated = DOC_BLOCK.replace("node:24-bookworm", "node:22-bookworm");
    expect(mutated).not.toBe(DOC_BLOCK);
    expect(labels(judgeImageTag(mutated, SHIM_SOURCE))).toContain("A-2:major-mismatch");
  });

  it("④ 태그를 `node:latest`로 → A-2 `latest` 금지", () => {
    const mutated = DOC_BLOCK.replace("node:24-bookworm", "node:latest");
    expect(mutated).not.toBe(DOC_BLOCK);
    // `latest`에는 읽을 major가 없어 `tag-major-unreadable`도 함께 난다. 재는 것은
    // 「위반이 났는가」이지 「위반이 정확히 하나인가」가 아니다.
    expect(labels(judgeImageTag(mutated, SHIM_SOURCE))).toContain("A-2:floating-tag");
  });

  it("⑤ 마운트 대상만 `.neo-agent2`로 → A-3 원본·대상 비대칭", () => {
    const mutated = DOC_BLOCK.replace(
      '"$HOME/.neo-agent:$HOME/.neo-agent"',
      '"$HOME/.neo-agent:$HOME/.neo-agent2"',
    );
    expect(mutated).not.toBe(DOC_BLOCK);
    expect(labels(judgeHomePath(mutated, HOME_SOURCES))).toContain("A-3:mount-asymmetric");
  });

  it("⑥ `src` 리터럴 하나만 다른 이름으로 → A-3 합의 깨짐", () => {
    const mutated = HOME_SOURCES.map((entry, index) =>
      index === 0
        ? { file: entry.file, source: entry.source.replace('".neo-agent"', '".neo-agent-x"') }
        : entry,
    );
    expect(mutated[0]?.source).not.toBe(HOME_SOURCES[0]?.source);
    expect(labels(judgeHomePath(DOC_BLOCK, mutated))).toContain("A-3:code-disagrees");
  });

  it("⑦ `src` 재료를 셋으로 줄임 → A-3 개수 위반", () => {
    expect(labels(judgeHomePath(DOC_BLOCK, HOME_SOURCES.slice(0, 3)))).toContain(
      "A-3:source-set-mismatch",
    );
  });

  // ⑦-b는 플랜 §4 T-007의 표에 없다. `/verify`(2026-09-05 QA F-4)가 이 구멍을 냈다 —
  // §3.5 표 A-3의 「재는 것」 문면(*"마운트 원본·대상의 디렉터리 이름이 코드가 홈 아래에 쓰는
  // 이름과 같다"*)을 곧이곧대로 구현한 규칙은 `A-3:doc-code-mismatch` 하나인데, ⑤(비대칭)·
  // ⑥(코드 합의 깨짐)·⑦(개수) 어느 것도 그 규칙을 내지 않아 **표제 규칙만 역검증이 없었다.**
  // 문서 쪽 마운트 이름을 원본·대상 **양쪽** 바꾸면 대칭은 유지된 채 코드와만 갈린다.
  it("⑦-b 문서 마운트 이름만 양쪽 개명 → A-3 문서↔코드 불일치", () => {
    const mutated = DOC_BLOCK.replaceAll("$HOME/.neo-agent", "$HOME/.neoagent");
    expect(mutated).not.toBe(DOC_BLOCK);
    expect(labels(judgeHomePath(mutated, HOME_SOURCES))).toContain("A-3:doc-code-mismatch");
  });

  it("⑧ `-u` 인자 제거 → A-4 위반", () => {
    const mutated = DOC_BLOCK.replace('-u "$(id -u):$(id -g)" ', "");
    expect(mutated).not.toBe(DOC_BLOCK);
    expect(labels(judgeUidArg(mutated, CREDENTIALS_SOURCE))).toContain("A-4:uid-flag-missing");
  });

  it("⑨ 권한 검사 본문에 `getuid` 추가 → A-4 소유자 읽기", () => {
    const mutated = CREDENTIALS_SOURCE.replace(
      "function assertSafePermissions(credentialsPath: string): boolean {",
      "function assertSafePermissions(credentialsPath: string): boolean {\n  const owner = process.getuid?.();",
    );
    expect(mutated).not.toBe(CREDENTIALS_SOURCE);
    expect(labels(judgeUidArg(DOC_BLOCK, mutated))).toContain("A-4:owner-read");
  });

  it("⑩ 같은 것을 주석 안에 추가 → 위반 아님 (벗기기가 판별 앞에 선다)", () => {
    const mutated = CREDENTIALS_SOURCE.replace(
      "function assertSafePermissions(credentialsPath: string): boolean {",
      "function assertSafePermissions(credentialsPath: string): boolean {\n  // process.getuid?.() 를 여기서 부르지 않는다",
    );
    expect(mutated).not.toBe(CREDENTIALS_SOURCE);
    expect(labels(judgeUidArg(DOC_BLOCK, mutated))).toEqual([]);
  });

  it("⑪ README 사본에 공백 하나 추가 → A-5 위반", () => {
    expect(labels(judgeCopyParity(DOC_BLOCK, `${README_BLOCK} `))).toContain("A-5:divergent");
  });

  it("⑫ 절에서 `bash` 펜스 제거 (0건) → 그물 발화", () => {
    const mutated = DISTRIBUTION_MD.replace(
      `\`\`\`bash\n${DOC_BLOCK}\n\`\`\``,
      `\`\`\`text\n${DOC_BLOCK}\n\`\`\``,
    );
    expect(mutated).not.toBe(DISTRIBUTION_MD);
    expect(() => extractCommandBlock(mutated, SECTION_CONTAINER)).toThrow(/0건/);
  });

  it("⑬ 절에 `bash` 펜스 하나 추가 (2건) → 그물 발화", () => {
    const mutated = DISTRIBUTION_MD.replace(
      SECTION_CONTAINER,
      `${SECTION_CONTAINER}\n\n\`\`\`bash\necho 두 번째 펜스\n\`\`\``,
    );
    expect(mutated).not.toBe(DISTRIBUTION_MD);
    expect(() => extractCommandBlock(mutated, SECTION_CONTAINER)).toThrow(/2건/);
  });

  it("⑭ 절 제목 개명 (절 부재) → 그물 발화", () => {
    const mutated = DISTRIBUTION_MD.replace(SECTION_CONTAINER, "### 3.3 컨테이너 실행 (개명됨)");
    expect(mutated).not.toBe(DISTRIBUTION_MD);
    expect(() => extractCommandBlock(mutated, SECTION_CONTAINER)).toThrow(/절 제목을 정확히 1건/);
  });

  // ⑮~⑱ — 실물 축의 fail-closed 계약. 실물 축 자체는 `pnpm check`의 모집단 밖이지만,
  // 판정이 순수 함수라 **그 규칙은 게이트 안에서** 조합 전수로 측정된다.
  // 근거는 §3.5의 "선언해 놓고 못 재는 것은 fail-closed의 대상이다"이고, 비-Linux를 위반으로
  // 두는 것은 그 문장을 「다른 OS에서 켜면 실패」로 읽은 판정이다(플랜 착수 전 결정 3).

  it("⑮ 비-Linux 플랫폼 → LIVE 위반", () => {
    expect(
      labels(judgeLiveSupport({ platform: "darwin", hasDocker: true, hasScript: true })),
    ).toContain("LIVE:platform");
  });

  it("⑯ 도커 없음 → LIVE 위반 (선언해 놓고 못 잼)", () => {
    expect(
      labels(judgeLiveSupport({ platform: "linux", hasDocker: false, hasScript: true })),
    ).toContain("LIVE:docker");
  });

  it("⑰ `script` 없음 → LIVE 위반 (선언해 놓고 못 잼)", () => {
    expect(
      labels(judgeLiveSupport({ platform: "linux", hasDocker: true, hasScript: false })),
    ).toContain("LIVE:script");
  });

  it("⑱ 셋 다 만족 → 위반 없음", () => {
    expect(
      labels(judgeLiveSupport({ platform: "linux", hasDocker: true, hasScript: true })),
    ).toEqual([]);
  });
});
