/**
 * 실물 축 — 문서가 든 컨테이너 실행 명령을 **실제로 띄워** 재는 자리.
 * 정본은 `docs/DISTRIBUTION.md` §3.5의 「게이트는 컨테이너를 안 띄운다」와 「실물 축의 형태」다.
 *
 * 실행 방법:
 *   NEO_DIST_LIVE=1 npx vitest run --project cli packages/cli/test/distribution-doc-command.live.ts
 *
 * ## 옵트인의 형태 — 수집 자체가 안 된다
 *
 * `packages/cli/vitest.config.ts`의 include가 `test` 아래의 `*.live.ts` 묶음을 `NEO_DIST_LIVE=1`일 때만
 * 더한다. 그래서 이 파일은 `pnpm check`의 모집단에 **들어가지 않는다** — §3.5의 표현으로
 * *"들어가지 않은 것과 들어가서 건너뛴 것은 다르고, 통과로 보이는 것은 후자뿐이다"*.
 * 형제 선례(`packages/sandbox/test/docker-live.test.ts`)는 수집한 뒤 `describe.skipIf`로 거르지만,
 * 그 형태는 「건너뛴 것」을 남기므로 이 축은 수집 층에서 가른다(2026-09-05 결정 1).
 *
 * **그러므로 이 파일 안에는 skip이 하나도 없다.** 지원 판정(`judgeLiveSupport`)이 위반을 내면
 * 건너뛰는 것이 아니라 **떨어진다** — §3.5가 *"선언해 놓고 못 재는 것은 fail-closed의 대상이다"*로
 * 못박은 자리이고, 특히 **도커 가용을 skip 조건으로 쓰지 않는다**(그 절이 그 갈래를 기각했다).
 *
 * ## 명령은 문서에서 읽는다
 *
 * 명령 문자열을 이 파일에 하드코딩하지 않는다 — 하면 축이 재는 것이 문서가 아니라 자기 자신이
 * 된다. 추출은 T-001의 헬퍼(`doc-command-axes.ts`)가 하고, 그 fail-closed 그물(절을 못 찾거나
 * `bash` 펜스가 정확히 1건이 아니면 throw)이 이 파일에도 그대로 걸린다. 이 파일이 드는 리터럴은
 * **절 제목 앵커 하나**이고, 절이 개명되면 축은 붉어진다 — 그때 고칠 것은 앵커이지 문서가 아니다.
 *
 * ## 문서의 명령을 그대로는 못 돌린다 — pty
 *
 * `-t`가 호출자에게 TTY를 요구하므로 TTY 없는 실행기에서는 도커가 거부하고, `-t`를 빼면 §7의
 * 거부가 걸린다 — §3.5의 표현으로 *"`--version`도 예외가 아니다"*(§7의 예외는 `serve` 하나다).
 * 그래서 pty를 만들어 부르며, 수단은 §9가 README의 설치 절차를 검증할 때 쓴 `script -qec … /dev/null`
 * 그대로다 — §3.5가 *"새로 발명하지 않는다"*고 적은 자리다.
 *
 * ## 치환 셋 — 문서의 명령을 무엇으로 바꿔 부르는가
 *
 * **무엇을 바꿔 부르는지 안 적으면 축이 「문서의 명령」을 재는지 「고쳐 만든 것」을 재는지 흐려진다.**
 * 셋 중 첫째만 §3.5가 sanction한 것이고 나머지 둘은 실행 환경의 요구다. **앞의 둘은 문자열 수술이
 * 아니라 자식 프로세스의 환경으로** 건다 — 블록은 바이트 그대로 셸에 넘어가고, `$HOME`·`$PWD`는
 * 그 셸이 우리가 준 값으로 편다. 셋째는 부르기 **전에** 디렉터리를 만드는 것이라 명령 자체를 안
 * 건드리며, 그 경로 계산(`mountSources`)만 파생 사본에서 치환한다. 그래서 어느 갈래에서도
 * 「고쳐 만든 명령」이라는 제3의 문자열이 실행되지 않는다.
 *
 * | 치환 | 무엇으로 | 왜 |
 * |---|---|---|
 * | `$HOME` | `mkdtemp` 디렉터리 (자식 env의 `HOME`) | §3.5 — *"홈은 임시 디렉터리를 마운트한다"*. 검증이 실사용 세션 DB를 만지지 않게 한다 |
 * | `$PWD` | 워크스페이스 루트 (자식 cwd + env의 `PWD`) | vitest `cli` 프로젝트의 cwd는 `packages/cli`다. 그대로 두면 명령 마지막 인자(워크스페이스 루트 상대 경로)가 컨테이너 안에 없다 |
 * | 마운트 원본 디렉터리 | 부르기 전에 만든다 | 없으면 도커 데몬이 root 소유로 만들고, `-u`로 낮춘 uid가 그 아래를 못 쓴다 |
 *
 * 첫째 치환의 귀결을 §3.5가 자백으로 적어 두었다 — *"축이 재는 것은 이 명령 형태가 이 이미지에서
 * 기동에 성공하는가이지, 사용자의 실제 홈에서 도는가가 아니다"*. 이 파일은 그 자백의 이행이다.
 *
 * ## 이 축이 재지 못하는 것
 *
 * §3.5의 다섯이 그대로 걸린다 — ① 이미지의 실제 내용 ② 인자의 의미 ③ 실사용 홈에서의 동작
 * ④ 문서가 안 든 명령 ⑤ 실물 축을 실제로 돌렸는가. 전문은 `doc-command-axes.ts`의 머리가 들고,
 * 여기서 다시 서술하지 않는다(같은 사실을 두 곳에서 각자의 말로 적으면 한쪽이 낡는다).
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractCommandBlock, judgeLiveSupport, parseDockerRun } from "./doc-command-axes.ts";

/** 워크스페이스 루트. `packages/cli/test` → `packages/cli` → `packages` → 루트 */
const WORKSPACE_ROOT = resolve(import.meta.dirname, "..", "..", "..");

/**
 * 절 앵커 — 이 파일이 드는 유일한 명령 관련 리터럴이다. 명령 자체가 아니라 **어느 절을 읽을지**만
 * 든다(2026-09-05 실측: 이 절의 `bash` 펜스는 정확히 1건).
 */
const SECTION_HEADING = "### 3.3 컨테이너 실행 — 이미지를 굽지 않는다 (2026-09-05 확정)";

/**
 * 기대 종료 코드·기대 출력을 확인하려고 붙이는 인자. `--version`을 고른 것은 §3.3의 실측이
 * 그것으로 이뤄졌고, 그 명령이 홈에 아무것도 안 쓰기 때문이다(위 치환 표 첫째 줄의 목적).
 */
const VERSION_FLAG = "--version";

/** 실물 기동은 이미지 pull까지 낄 수 있다. 넉넉히 주되 무한 대기는 만들지 않는다 */
const RUN_TIMEOUT_MS = 300_000;

interface LiveRun {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * 제어문자 제거 — §3.5가 *"대조 전에 제어문자를 걷는다"*고 적은 자리.
 *
 * **NUL 하나만 겨누지 않는다.** 1회 관측을 완전한 목록으로 읽으면 다음에 다른 제어문자가
 * 붙었을 때 대조가 조용히 어긋나고, 그 어긋남은 문서가 낡은 것처럼 보인다. 그래서 C0 전
 * 구간과 DEL을 걷는다. 줄바꿈(`\r\n`)과 색 이스케이프의 ESC도 여기서 함께 걷힌다.
 *
 * 정규식이 아니라 코드포인트 필터인 이유는 제어문자를 정규식 리터럴에 적는 것이 린터의 금지
 * 대상이기 때문이다 — 같은 판정을 규칙을 끄지 않고 표현한다.
 *
 * **[미규정 — 판정 필요] §3.5의 「NUL 한 바이트」 서술이 이 필터로 재현되지 않는다.**
 * 2026-09-05 T-008 구현 중 바이트 단위로 다시 재니 출력 앞의 두 글자는 제어문자가 아니라
 * 인쇄 가능한 캐럿 표기 `^@`(U+005E U+0040)였다 — 코드포인트 열이 `[94, 64, 48, 46, 49, 46,
 * 48, 13, 10]`이다. pty의 line discipline이 컨테이너가 tty에 쓴 NUL을 캐럿 표기로 **에코한**
 * 것으로 보이며, 그래서 **제어문자를 걷어도 이 두 글자는 남는다.** 걷어 내면 문자열 상등이
 * 선다는 그 절의 문장은 이 머신에서 참이 아니다.
 *
 * 그래서 이 파일의 대조는 상등이 아니라 **포함**이다. `^@`를 따로 걷는 규칙을 여기서 만들지
 * 않는다 — 그것은 §3.5가 sanction하지 않은 새 정규화이고, 출력의 앞머리를 임의로 지우는 축은
 * 진짜 앞머리 오염도 함께 지운다. 서술을 고칠지(이 절의 실측 문단)는 문서 쪽 판정이다.
 */
function stripControlCharacters(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) continue;
    out += char;
  }
  return out;
}

/** 그 이름의 실행 파일을 이 머신에서 띄울 수 있는가. 스폰 자체가 실패하면 없는 것이다 */
function canSpawn(binary: string, args: readonly string[]): boolean {
  const probe = spawnSync(binary, [...args], { encoding: "utf8" });
  return probe.error === undefined;
}

/**
 * `-v` 값의 원본 쪽(콜론 앞)을 워크스페이스 루트·임시 홈으로 편 목록.
 *
 * 파서는 셸을 안 부르므로 `$HOME`·`$PWD`가 문자 그대로 남는다(그것이 정적 축이 문서를 재는
 * 방식이다). 여기서만 그 둘을 편다 — 위 치환 표의 둘째·셋째가 만나는 자리다.
 */
function mountSources(block: string, home: string): string[] {
  const parsed = parseDockerRun(block);
  if (!parsed.ok) {
    throw new Error(`§3.3의 명령을 파싱하지 못했다: ${parsed.reason}`);
  }
  const sources: string[] = [];
  for (const option of parsed.run.options) {
    if (option.flag !== "-v" && option.flag !== "--volume") continue;
    const value = option.value ?? "";
    const [source] = value.split(":");
    if (source === undefined || source === "") continue;
    sources.push(source.replaceAll("$PWD", WORKSPACE_ROOT).replaceAll("$HOME", home));
  }
  return sources;
}

describe("DISTRIBUTION §3.5 — 실물 축 (옵트인)", () => {
  let home = "";
  let block = "";
  let run: LiveRun | undefined;

  beforeAll(() => {
    // ① 지원 판정을 **먼저** 부른다. 위반이면 skip이 아니라 fail이다.
    const support = judgeLiveSupport({
      platform: process.platform,
      hasDocker: canSpawn("docker", ["--version"]),
      // 데몬 접근 가부는 이 판정의 대상이 아니다 — 거부는 아래 실 기동에서 그대로 드러난다
      hasScript: canSpawn("script", ["--version"]),
    });
    if (support.length > 0) {
      throw new Error(
        `실물 축을 이 머신에서 잴 수 없다 (NEO_DIST_LIVE=1은 잴 수 있다는 선언이다):\n${support
          .map((violation) => `  - [${violation.axis}/${violation.rule}] ${violation.detail}`)
          .join("\n")}`,
      );
    }

    // ② 명령은 문서에서 읽는다. 그물은 헬퍼가 든다.
    block = extractCommandBlock(
      readFileSync(join(WORKSPACE_ROOT, "docs", "DISTRIBUTION.md"), "utf8"),
      SECTION_HEADING,
    );

    // ③ 치환 1 — 임시 홈. `realpathSync`는 `/tmp`가 심볼릭 링크인 머신에서 마운트 원본과
    //    컨테이너 안 경로가 갈리지 않게 한다.
    home = realpathSync(mkdtempSync(join(tmpdir(), "neo-dist-live-")));

    // ④ 치환 3 — 마운트 원본을 미리 만든다.
    for (const source of mountSources(block, home)) {
      mkdirSync(source, { recursive: true });
    }

    // ⑤ pty 경유 실행. 치환 1·2는 자식의 env·cwd로 걸리고 블록은 바이트 그대로 넘어간다.
    const result = spawnSync("script", ["-qec", `${block} ${VERSION_FLAG}`, "/dev/null"], {
      cwd: WORKSPACE_ROOT,
      env: { ...process.env, HOME: home, PWD: WORKSPACE_ROOT },
      encoding: "utf8",
      timeout: RUN_TIMEOUT_MS,
    });
    if (result.error !== undefined) {
      throw new Error(`script를 띄우지 못했다: ${result.error.message}`);
    }
    run = {
      status: result.status,
      stdout: stripControlCharacters(result.stdout ?? ""),
      stderr: stripControlCharacters(result.stderr ?? ""),
    };
  }, RUN_TIMEOUT_MS);

  afterAll(() => {
    if (home !== "") rmSync(home, { recursive: true, force: true });
  });

  it("문서의 명령이 pty 아래에서 종료 코드 0으로 끝난다", () => {
    expect(run).toBeDefined();
    expect(run?.status, `stdout=${run?.stdout} stderr=${run?.stderr}`).toBe(0);
  });

  it("출력이 이 트리의 버전 정본과 같은 문자열을 낸다", () => {
    // 버전을 리터럴로 적지 않는다 — §4가 버전 정본을 하나로 두었고, 여기 적으면 정본이 둘이 된다.
    const manifest = readFileSync(join(WORKSPACE_ROOT, "packages", "cli", "package.json"), "utf8");
    const version = (JSON.parse(manifest) as { version?: unknown }).version;
    expect(typeof version).toBe("string");
    expect(run?.stdout).toContain(String(version));
  });

  it("실사용 홈이 아니라 임시 홈을 마운트했다", () => {
    // §3.5의 자백을 단정으로 옮긴다 — 이 축은 사용자의 실제 홈에서 도는가를 재지 않는다.
    expect(home).not.toBe(process.env.HOME ?? "");
    expect(home.startsWith(realpathSync(tmpdir()))).toBe(true);
  });
});
