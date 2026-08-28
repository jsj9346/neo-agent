/**
 * 크로미움을 여는 **유일한 통로** — 정본은 `docs/TECH-STACK.md` §7.1 결정 6이다.
 *
 * 그 결정이 정한 것은 둘이다: ① 브라우저 바이너리를 설치 전제로 만들지 않는다 ② 부재는
 * 건너뛰기가 아니라 **실패**다. 그래서 이 모듈에는 `it.skip`도, 조건부 건너뛰기도, 자동
 * 확보(내려받기)도 없다. 부재는 던져서 알리고, 그 문면이 ① 무엇이 없는지 ② 무엇을 하면
 * 되는지를 함께 든다 — `docs/ARCHITECTURE.md` §2.6이 요구하는 형태다.
 *
 * ## 확보 판정을 「경로 존재」로 하지 않는 이유 (2026-08-28 실측)
 *
 * 자연스러운 구현은 `existsSync(chromium.executablePath())`인데 **이 환경에서 그것은 거짓
 * 부재를 낸다.** 실측:
 *
 * - `chromium.executablePath()` → `~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`
 * - 그 경로는 실재하지 **않는다**. 이 머신에 있는 것은 헤드리스 셸
 *   (`chromium_headless_shell-1234`)이지 full 크로미움(`chromium-1234`)이 아니다.
 * - 그런데 `chromium.launch({ headless: true })`는 **성공한다**. Playwright가 헤드리스에서는
 *   셸 쪽 실행 파일을 열기 때문이다.
 *
 * 즉 `executablePath()`가 드는 경로는 **헤드리스 기동이 실제로 여는 경로가 아니다.** 그것을
 * 관문으로 쓰면 도는 환경에서 붉고, 그 문면이 사람에게 필요 없는 full 크로미움 다운로드를
 * 시킨다 — 침묵 실패의 거울상(거짓 실패)이고, 결정 6이 겨눈 것과 방향만 반대인 같은 결함이다.
 *
 * **그래서 판정은 기동 자체가 한다.** 실제로 열어 보고, 열리면 확보된 것이고 안 열리면 아니다.
 * 이것이 리비전 정합(핀한 `playwright` 버전이 기대하는 리비전 = 기설치 셸의 리비전인가)까지
 * 한 번에 재는 유일한 방법이기도 하다 — 어긋나면 Playwright가 없는 리비전 경로를 열려다 죽는다.
 *
 * ## 문면이 무엇을 근거로 「없다」고 말하는가
 *
 * 실패 문면은 영어 원문을 정규식으로 갈라 판정하지 않는다. 대신 **실측한 것만 적는다** —
 * 기대 리비전(공개 API가 주는 경로에서 읽는다) · 브라우저 루트 · 그 루트에 실제로 있는
 * 항목 목록. 목록을 그대로 실으면 「없다」와 「리비전이 어긋난다」가 읽는 사람 눈에서 갈린다.
 * 판정 근거를 남의 에러 문자열에 걸면 그쪽 문면이 바뀌는 날 조용히 오분류한다.
 */

import { readdirSync } from "node:fs";
import { sep } from "node:path";
import type { Browser } from "playwright";
import { chromium } from "playwright";

/** 기본 브라우저 캐시 위치를 못 읽었을 때 문면에 넣는 값. */
const UNKNOWN = "<알 수 없음>";

/**
 * 헤드리스 크로미움을 연다. 이 하네스에서 브라우저를 여는 자리는 여기 하나다.
 *
 * 열지 못하면 던진다 — 건너뛰지 않는다(§7.1 결정 6). 원인은 `cause`로 보존한다.
 */
export async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch({ headless: true });
  } catch (cause) {
    throw new Error(browserUnavailableMessage(cause), { cause });
  }
}

/**
 * 기동 실패를 사람이 다음 행동으로 옮길 수 있는 문면으로 바꾼다.
 *
 * 내보내는 이유는 이 문면 자체가 결정 6의 산출이라 검증 대상이기 때문이다 — 축이 문면을
 * 재려고 브라우저를 일부러 지우는 일이 없게 한다.
 *
 * **[미규정]** §7.1 결정 6이 정하는 것은 **부재**의 처분(건너뛰지 말고 실패로 내라)뿐이고,
 * 「브라우저는 있는데 못 연다」(호스트 공유 라이브러리 결여·샌드박스 거부 등)의 문면은
 * 정하지 않는다. 여기서는 그 둘을 **문면으로 가르지 않고** 실측 목록과 원인 원문을 함께
 * 실어 읽는 사람이 가르게 두었다 — 설치 명령이 항상 실려서 부재가 아닐 때는 도움이 안 되는
 * 줄이 하나 남는 대가를 치른다. 갈라 쓰려면 판정 근거가 필요한데, 이 자리에서 쓸 수 있는
 * 것은 playwright의 영어 에러 문자열뿐이고 그것에 판정을 걸면 그쪽 문면이 바뀌는 날 조용히
 * 오분류한다. **덜 나쁜 쪽(항상 실린다)을 골랐고 그 선택은 계약이 아니다** — 뒤집을 자리는
 * 이 파일이 아니라 §7.1 결정 6이다.
 */
export function browserUnavailableMessage(cause: unknown): string {
  const install = describeInstallation();
  return [
    "[e2e] 크로미움을 열지 못했다.",
    "이 하네스는 브라우저 부재를 건너뛰지 않고 실패로 낸다 (docs/TECH-STACK.md §7.1 결정 6).",
    "",
    "무엇이 없는가 — 아래는 전부 이 실행에서 실측한 값이다:",
    `  기대 리비전    : ${install.revision}`,
    `  브라우저 루트  : ${install.root}`,
    `  루트의 내용물  : ${install.entries}`,
    "  (헤드리스 기동은 chromium_headless_shell-<리비전> 쪽 실행 파일을 연다.",
    "   위 목록에 그 이름이 없거나 리비전이 기대값과 다르면 그것이 원인이다.)",
    "",
    "무엇을 하면 되는가 — 이 명령은 자동으로 실행되지 않는다. 발자국을 알고 치른다:",
    "  pnpm exec playwright install --only-shell chromium   # 헤드리스 셸만 (이 하네스가 실제로 쓴다)",
    "  pnpm exec playwright install chromium                # full 크로미움까지 받는다",
    "",
    "playwright가 낸 원인 문면 (못 연 실행 파일의 실제 경로를 든다):",
    indent(describeCause(cause)),
  ].join("\n");
}

/** 이 실행이 실제로 보고 있는 브라우저 설치 상태. 전부 실측이고 추정이 없다. */
function describeInstallation(): { revision: string; root: string; entries: string } {
  const executable = readExecutablePath();
  const { revision, root } = splitAtRevision(executable);
  return { revision, root, entries: readEntries(root) };
}

/** 공개 API가 드는 실행 파일 경로. 이 값은 **기대**이지 실재의 증거가 아니다(머리 주석). */
function readExecutablePath(): string | undefined {
  try {
    return chromium.executablePath();
  } catch {
    return undefined;
  }
}

/**
 * `<루트>/chromium-<리비전>/...` 에서 루트와 리비전 세그먼트를 가른다.
 *
 * 세그먼트를 이름으로 찾는다 — 위에서 몇 번 올라가면 루트인지를 세면 경로 모양이 바뀌는 날
 * 조용히 엉뚱한 디렉터리를 읽는다.
 */
function splitAtRevision(executable: string | undefined): { revision: string; root: string } {
  const fallbackRoot = process.env.PLAYWRIGHT_BROWSERS_PATH ?? UNKNOWN;
  if (executable === undefined) {
    return { revision: UNKNOWN, root: fallbackRoot };
  }
  const segments = executable.split(sep);
  const at = segments.findIndex((segment) => /^chromium-\d+$/.test(segment));
  if (at < 0) {
    return { revision: UNKNOWN, root: fallbackRoot };
  }
  return {
    revision: segments[at] ?? UNKNOWN,
    root: segments.slice(0, at).join(sep) || sep,
  };
}

/** 브라우저 루트에 **실제로** 있는 것. 이것이 부재와 리비전 어긋남을 눈으로 가른다. */
function readEntries(root: string): string {
  if (root === UNKNOWN) {
    return UNKNOWN;
  }
  try {
    const entries = readdirSync(root).sort();
    return entries.length > 0 ? entries.join(", ") : "<비어 있다>";
  } catch (error) {
    return `<읽을 수 없다: ${error instanceof Error ? error.message : String(error)}>`;
  }
}

function describeCause(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }
  return String(cause);
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}
