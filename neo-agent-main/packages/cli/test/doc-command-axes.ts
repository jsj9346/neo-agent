/**
 * 문서가 든 실행 명령을 재는 축의 **순수 판정 층** — 정본은 `docs/DISTRIBUTION.md` §3.5.
 *
 * 그 절이 세운 모집단은 명령 전체가 아니라 그 절의 표현으로 *"정본이 이 트리에 있는 부품"*이고,
 * 축은 다섯이다 — A-1 bin 경로 · A-2 이미지 태그 · A-3 홈 경로 · A-4 uid 인자 · A-5 사본 일치.
 * 이 파일은 그 다섯의 판정과, 실물 축의 지원 여부 판정 하나를 **문자열만 받는 순수 함수**로 든다.
 *
 * **파일시스템도 프로세스도 만지지 않는다.** 경로를 여는 것과 판정하는 것을 가르는 이유는 둘이다 —
 * ① 축이 그린인 것과 축이 없는 것을 구별하려면 변조한 입력에 판정을 걸어야 하는데, 판정이 경로를
 * 품고 있으면 작업 트리의 파일을 변조하는 수밖에 없다 ② 이 저장소가 이미 그 층을 가른다
 * (`scripts/name-dictionary.mjs`(순수) ↔ `scripts/check-name-dictionary.mjs`(I/O),
 * `scripts/doc-citation.mjs` ↔ `scripts/check-doc-citation.mjs`).
 *
 * **이 파일은 테스트가 아니다** — `packages/cli/vitest.config.ts`의 include가 `*.test.ts`와
 * (옵트인일 때만) `*.live.ts`를 들므로 이 이름은 어느 갈래에도 안 걸려 vitest가 수집하지 않는다.
 * 같은 디렉터리의 `support.ts`·`harness.ts`·`probe-docker.ts`가 같은 형태다.
 * **`scripts/`에 두지 않는 것도 §3.5의 판정이다** — 그 절이 여섯째 게이트 스크립트를 기각했고,
 * `packages/cli/test/`의 헬퍼는 그 기각에 걸리지 않는다.
 *
 * ## fail-closed 그물
 *
 * 추출기는 대상 절을 **제목 문자열**로 찾는다(줄번호가 아니다). 절을 못 찾거나, 그 절에서 `bash`
 * 펜스를 정확히 1건 뽑지 못하면 빈 값을 돌려주지 않고 throw한다 — §3.5의 근거 그대로
 * *"0건은 절이 개명·이동돼 축이 조용히 죽은 것이고, 2건 이상은 어느 것이 대상인지 모르는 것이다"*.
 *
 * **그래서 절 제목이 개명되면 이 축은 붉어진다. 그것이 의도된 동작이다.** 개명이 정당한 경우에도
 * 축은 발화하며, 그때 고칠 것은 **축이지 문서가 아니다** — 추출기의 앵커를 새 제목으로 옮긴다.
 * 개명에 조용한 축은 개명을 못 잡는 축이므로, 이 발화는 비용이 아니라 이 층이 사는 이유다.
 *
 * ## 이 축이 재지 못하는 것 — §3.5의 다섯을 **전부** 옮긴다
 *
 * 셋만 적으면 읽는 사람이 그것을 완전한 목록으로 읽으므로 다섯을 다 든다.
 *
 * 1. **이미지의 실제 내용.** `bookworm` 태그가 무엇을 담는지, 그 안의 Node 패치 버전이 몇인지는
 *    원격 레지스트리의 것이라 우리 자산이 아니다. A-2가 재는 것은 태그 문자열의 major뿐이다.
 * 2. **인자의 의미.** `--rm`·`-e HOME`·`-w`가 있는지는 재지만 그것들이 무엇을 하는지는 안 잰다.
 *    의미는 실물 기동만 알고, 실물 축은 게이트 밖이다.
 * 3. **실사용 홈에서의 동작.** 실물 축은 임시 디렉터리를 홈으로 마운트하므로, 재는 것은 이 명령
 *    형태가 이 이미지에서 기동에 성공하는가이지 사용자의 실제 홈에서 도는가가 아니다.
 * 4. **문서가 안 든 명령.** 축의 입력이 문서에 적힌 블록이므로, 적혀 있지 않은 절차는 원리적으로
 *    모집단 밖이다.
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

// ---------------------------------------------------------------------------
// 판정 결과 — 축마다 닫힌 규칙 유니온을 갖는다
//
// 축과 규칙을 한 문자열로 뭉치지 않는 이유: 축은 §3.5 표의 다섯 행이라 문서가 정하고,
// 규칙은 이 층의 세부라 구현이 정한다. 둘을 갈라 두면 축이 늘거나 줄 때 타입이 발화한다.
// ---------------------------------------------------------------------------

/** §3.5 표의 행 다섯 + 실물 축 지원 판정. 이 유니온이 늘면 §3.5가 먼저 바뀐 것이다 */
export type Axis = "A-1" | "A-2" | "A-3" | "A-4" | "A-5" | "LIVE";

export type BinPathRule =
  | "docker-run-unparsable"
  | "command-missing"
  | "link-target-unreadable"
  | "divergent";

export type ImageTagRule =
  | "docker-run-unparsable"
  | "image-tag-missing"
  | "floating-tag"
  | "tag-major-unreadable"
  | "shim-constant-missing"
  | "major-mismatch";

export type HomePathRule =
  | "docker-run-unparsable"
  | "home-mount-missing"
  | "home-mount-ambiguous"
  | "mount-spec-unreadable"
  | "mount-asymmetric"
  | "source-set-mismatch"
  | "source-literal-missing"
  | "source-literal-ambiguous"
  | "code-disagrees"
  | "doc-code-mismatch";

export type UidArgRule =
  | "docker-run-unparsable"
  | "uid-flag-missing"
  | "guard-missing"
  | "mode-bits-unread"
  | "owner-read";

export type CopyParityRule = "empty-block" | "divergent";

export type LiveSupportRule = "platform" | "docker" | "script";

/** 위반 하나. `detail`은 사람이 읽는 자리이고 기계 판정은 `axis`+`rule`로 한다 */
export type Violation =
  | { readonly axis: "A-1"; readonly rule: BinPathRule; readonly detail: string }
  | { readonly axis: "A-2"; readonly rule: ImageTagRule; readonly detail: string }
  | { readonly axis: "A-3"; readonly rule: HomePathRule; readonly detail: string }
  | { readonly axis: "A-4"; readonly rule: UidArgRule; readonly detail: string }
  | { readonly axis: "A-5"; readonly rule: CopyParityRule; readonly detail: string }
  | { readonly axis: "LIVE"; readonly rule: LiveSupportRule; readonly detail: string };

// ---------------------------------------------------------------------------
// 블록 추출기 — 절은 제목 문자열로 찾는다
// ---------------------------------------------------------------------------

/**
 * `markdown`에서 제목이 `sectionHeading`인 절을 잡고, 그 절 안의 `bash` 펜스 **본문**을 돌려준다.
 *
 * `sectionHeading`은 `#` 마커를 포함한 제목 줄 전체다(예: `### 3.1 …`). 절의 끝은 같은 깊이
 * 이하의 다음 제목이며, 펜스 안의 `#` 줄은 제목으로 세지 않는다.
 *
 * 돌려주는 것은 여는 펜스 다음 줄부터 닫는 펜스 앞 줄까지를 `\n`으로 이은 것이고 **정규화하지
 * 않는다** — A-5가 두 사본의 바이트 일치를 재므로 공백 하나도 보존해야 한다.
 *
 * 아래 넷은 전부 throw다(그물):
 * - 제목을 0건 잡음 (절이 개명·이동됐다)
 * - 제목을 2건 이상 잡음 (어느 절이 대상인지 모른다)
 * - 절 안의 `bash` 펜스가 0건 또는 2건 이상
 * - 펜스가 닫히지 않음
 */
export function extractCommandBlock(markdown: string, sectionHeading: string): string {
  const section = sliceSection(markdown, sectionHeading);
  const fences = collectBashFences(section, sectionHeading);
  const [only] = fences;
  if (fences.length !== 1 || only === undefined) {
    throw new Error(
      `${sectionHeading}: bash 펜스를 정확히 1건 뽑지 못했다 (${fences.length}건). ` +
        "0건은 절이 개명·이동돼 축이 조용히 죽은 것이고, 2건 이상은 어느 것이 대상인지 모르는 것이다.",
    );
  }
  return only;
}

function sliceSection(markdown: string, sectionHeading: string): string {
  const wanted = sectionHeading.trim();
  const level = headingLevel(wanted);
  if (level === undefined) {
    throw new Error(`절 제목이 아니다 (\`#\` 마커가 없다): ${sectionHeading}`);
  }

  const lines = markdown.split("\n");
  const starts: number[] = [];
  let inFence = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (line.trimEnd() === wanted) starts.push(index);
  }

  const [start] = starts;
  if (starts.length !== 1 || start === undefined) {
    throw new Error(
      `절 제목을 정확히 1건 잡지 못했다 (${starts.length}건): ${sectionHeading}. ` +
        "절이 개명·이동됐다면 고칠 것은 이 앵커이지 문서가 아니다.",
    );
  }

  let end = lines.length;
  inFence = false;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const depth = headingLevel(line.trimEnd());
    if (depth !== undefined && depth <= level) {
      end = index;
      break;
    }
  }

  return lines.slice(start + 1, end).join("\n");
}

function headingLevel(line: string): number | undefined {
  const match = /^(#{1,6})\s+\S/.exec(line);
  return match?.[1]?.length;
}

function collectBashFences(section: string, sectionHeading: string): string[] {
  const lines = section.split("\n");
  const blocks: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if ((lines[index] ?? "").trimEnd() !== "```bash") continue;
    let close = index + 1;
    while (close < lines.length && (lines[close] ?? "").trimEnd() !== "```") close += 1;
    if (close >= lines.length) {
      throw new Error(`${sectionHeading}: bash 펜스가 닫히지 않았다`);
    }
    blocks.push(lines.slice(index + 1, close).join("\n"));
    index = close;
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// docker 명령 파서
//
// A-1(마지막 인자) · A-2(이미지) · A-3(마운트) · A-4(`-u`)가 전부 같은 명령을 다른 각도로
// 보므로 파서를 한 자리에 둔다. 넷이 각자 정규식을 들면 한쪽만 낡는 실패가 가능해지고, 그
// 상태에서도 각 축은 자기 자리에서 그린이다.
//
// **모르는 옵션을 만나면 파싱 실패다.** 옵션이 값을 받는지 아닌지를 모르면 그다음 토큰이
// 이미지인지 값인지도 모르는데, 추측하면 축이 엉뚱한 문자열을 재고도 그린이 된다. 문서의
// 명령 모양이 바뀌면 축이 붉어지는 쪽이 맞다.
// ---------------------------------------------------------------------------

const VALUE_FLAGS = new Set(["-v", "-w", "-u", "-e", "--volume", "--workdir", "--user", "--env"]);
const BOOLEAN_FLAGS = new Set(["-i", "-t", "--rm", "--interactive", "--tty"]);

export interface DockerRunOption {
  readonly flag: string;
  readonly value: string | undefined;
}

export interface DockerRun {
  readonly options: readonly DockerRunOption[];
  readonly image: string;
  /** 이미지 뒤에 오는 것 전부. 이 명령에서는 `node <bin>` 두 토큰이다 */
  readonly command: readonly string[];
}

export type DockerRunParse =
  | { readonly ok: true; readonly run: DockerRun }
  | { readonly ok: false; readonly reason: string };

/**
 * `docker run …` 한 줄(줄바꿈 이음 포함)을 옵션·이미지·명령으로 가른다.
 *
 * 셸을 부르지 않는다 — 따옴표만 벗기고 `$PWD`·`$(id -u)` 같은 확장은 **문자 그대로 남긴다**.
 * 축이 재는 것이 실행 결과가 아니라 문서에 적힌 문자열이기 때문이다.
 *
 * 한계: 따옴표 밖의 `$( … )`처럼 공백을 품은 확장은 토큰이 갈린다. 문서의 명령은 그 자리를
 * 전부 따옴표로 감싸고 있고, 감싸지 않게 바뀌면 파싱이 실패해 축이 붉어진다.
 */
export function parseDockerRun(block: string): DockerRunParse {
  const tokens = tokenizeShell(block);
  if (tokens[0] !== "docker" || tokens[1] !== "run") {
    return { ok: false, reason: "`docker run`으로 시작하지 않는다" };
  }

  const options: DockerRunOption[] = [];
  let index = 2;
  while (index < tokens.length) {
    const token = tokens[index] ?? "";
    if (!token.startsWith("-")) break;

    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      const flag = eq === -1 ? token : token.slice(0, eq);
      if (VALUE_FLAGS.has(flag)) {
        if (eq !== -1) {
          options.push({ flag, value: token.slice(eq + 1) });
          index += 1;
          continue;
        }
        const value = tokens[index + 1];
        if (value === undefined) return { ok: false, reason: `${flag}에 값이 없다` };
        options.push({ flag, value });
        index += 2;
        continue;
      }
      if (BOOLEAN_FLAGS.has(flag)) {
        options.push({ flag, value: undefined });
        index += 1;
        continue;
      }
      return { ok: false, reason: `모르는 옵션: ${flag}` };
    }

    // 짧은 플래그 묶음(`-it`)을 글자 단위로 푼다. 값을 받는 글자를 만나면 그 뒤가 값이다.
    let consumedNext = false;
    let failure: string | undefined;
    for (let cursor = 1; cursor < token.length; cursor += 1) {
      const flag = `-${token[cursor] ?? ""}`;
      if (BOOLEAN_FLAGS.has(flag)) {
        options.push({ flag, value: undefined });
        continue;
      }
      if (VALUE_FLAGS.has(flag)) {
        const inline = token.slice(cursor + 1);
        if (inline !== "") {
          options.push({ flag, value: inline });
        } else {
          const value = tokens[index + 1];
          if (value === undefined) {
            failure = `${flag}에 값이 없다`;
            break;
          }
          options.push({ flag, value });
          consumedNext = true;
        }
        break;
      }
      failure = `모르는 옵션: ${flag}`;
      break;
    }
    if (failure !== undefined) return { ok: false, reason: failure };
    index += consumedNext ? 2 : 1;
  }

  const image = tokens[index];
  if (image === undefined) return { ok: false, reason: "이미지 인자가 없다" };
  return { ok: true, run: { options, image, command: tokens.slice(index + 1) } };
}

/** 따옴표를 아는 최소 토크나이저. `\` + 줄바꿈은 잇고, 따옴표는 벗기되 내용은 그대로 둔다 */
function tokenizeShell(source: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let started = false;
  let index = 0;

  const flush = (): void => {
    if (started) tokens.push(current);
    current = "";
    started = false;
  };

  while (index < source.length) {
    const char = source[index] ?? "";
    if (char === "\\" && source[index + 1] === "\n") {
      index += 2;
      continue;
    }
    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      flush();
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      started = true;
      let cursor = index + 1;
      while (cursor < source.length && source[cursor] !== char) {
        current += source[cursor] ?? "";
        cursor += 1;
      }
      index = cursor + 1;
      continue;
    }
    started = true;
    current += char;
    index += 1;
  }
  flush();
  return tokens;
}

// ---------------------------------------------------------------------------
// A-1 — bin 경로
// ---------------------------------------------------------------------------

/**
 * `packages/cli`의 `bin` 필드는 그 패키지 디렉터리 기준 상대 경로다. 워크스페이스 기준으로
 * 맞춰야 §3.3 명령의 마지막 인자·§3.1의 `ln -s` 대상과 같은 축에 놓인다.
 */
const CLI_PACKAGE_DIR = "packages/cli";

/**
 * A-1 — §3.3 명령의 마지막 인자와 §3.1의 `ln -s` 대상이 `packages/cli`의 `bin` 필드가
 * 가리키는 파일과 같은가.
 *
 * `linkLine`은 `ln -s` 호출을 담은 문자열(§3.1의 블록 전체를 줘도 된다)이고, `binField`는
 * 매니페스트에서 읽은 값 그대로다(오늘 `./bin/neo-agent.mjs`). `ln -s` 대상의 `$PWD/` 접두는
 * 걷어 낸 뒤 대조한다 — 접두가 워크스페이스 루트를 가리키는 것은 §3.1의 계약이고, 안 걷으면
 * 축이 형태 차이를 위반으로 낸다.
 *
 * **파일 실재는 이 함수가 안 잰다** — I/O라 호출자(계약 테스트)의 몫이다.
 *
 * **기존 두 파일과의 관계.** `distribution-qa-b.contract.test.ts`가 `neo-agent-main/README.md`의
 * `ln -s` 줄을 리터럴로 단정하고 shim 실재를 보며, `distribution-supply-chain.contract.test.ts`가
 * `bin` 필드를 단정한다. 즉 A-1의 재료 넷 중 셋이 이미 재지고 있고, 이 축이 더하는 것은
 * **§3.3 명령의 마지막 인자**와 **넷의 상호 수렴**이다. 관계를 안 적으면 실패했을 때 세 파일이
 * 서로 다른 문면으로 붉어지고, 저쪽의 하드코딩 리터럴이 이 축과 갈라져도 아무도 모른다.
 *
 * **`git clone` URL과 `pnpm install`은 모집단 밖이다** — 이 트리에 정본이 없어 대조가 성립하지
 * 않는다(§3.5). 들어오는 것은 `ln -s` 대상 한 줄뿐이다.
 */
export function judgeBinPath(block: string, linkLine: string, binField: string): Violation[] {
  const parsed = parseDockerRun(block);
  if (!parsed.ok) {
    return [{ axis: "A-1", rule: "docker-run-unparsable", detail: parsed.reason }];
  }

  const violations: Violation[] = [];
  const last = parsed.run.command.at(-1);
  if (last === undefined) {
    violations.push({
      axis: "A-1",
      rule: "command-missing",
      detail: "이미지 뒤에 실행할 명령이 없다 — 마지막 인자를 잴 수 없다",
    });
  }

  const targets = [...linkLine.matchAll(/\bln\s+-s\s+(\S+)/g)].map((match) => match[1] ?? "");
  const [linkTarget] = targets;
  if (targets.length !== 1 || linkTarget === undefined) {
    violations.push({
      axis: "A-1",
      rule: "link-target-unreadable",
      detail: `\`ln -s\` 대상을 정확히 1건 뽑지 못했다 (${targets.length}건)`,
    });
  }

  if (last === undefined || linkTarget === undefined) return violations;

  const fromLink = stripQuotes(linkTarget).replace(/^\$PWD\//, "");
  const fromManifest = `${CLI_PACKAGE_DIR}/${binField.replace(/^\.\//, "")}`;
  const converged = new Set([last, fromLink, fromManifest]);
  if (converged.size !== 1) {
    violations.push({
      axis: "A-1",
      rule: "divergent",
      detail: `수렴하지 않는다 — 명령 마지막 인자 ${last} · ln -s 대상 ${fromLink} · bin 필드 ${fromManifest}`,
    });
  }
  return violations;
}

function stripQuotes(value: string): string {
  const match = /^(["'])(.*)\1$/s.exec(value);
  return match?.[2] ?? value;
}

// ---------------------------------------------------------------------------
// A-2 — 이미지 태그
// ---------------------------------------------------------------------------

/**
 * A-2 — 태그의 major가 shim의 Node 하한 상수와 같고, 태그가 `latest`가 아닌가.
 *
 * **재는 것은 태그 문자열의 major뿐이다.** 그 태그가 담은 실제 Node 패치 버전은 원격
 * 레지스트리의 것이라 우리 자산이 아니다(위 머리의 한계 1).
 *
 * `shimSource`는 `packages/cli/bin/neo-agent.mjs`의 **텍스트**다. shim을 import하지 않는 것이
 * 계약이다 — import하면 그 파일이 자기 버전 게이트를 돌리고, 통과하면 `main.ts`까지 끌고 온다.
 * 상수는 주석과 문자열을 지운 뒤에 찾는다: 주석 줄이 앞에서 첫 매치를 가로채는 오탐과, 실물
 * 선언을 주석으로 돌리고 다른 값으로 되살렸는데 주석 쪽이 여전히 옳은 값을 들어 통과하는
 * 위조를 둘 다 막는다.
 *
 * **§3.3은 이 축 때문에 개정되지 않는다.** 그 절이 고정 태그의 강제 지점이 없다고 적은 것은
 * **사용자가 치는 명령**에 대해 참이고, A-2가 강제하는 것은 **문서가 든 명령**이다. 둘은 다른
 * 대상이다 — §3.5가 명시적으로 그렇게 적었다.
 */
export function judgeImageTag(block: string, shimSource: string): Violation[] {
  const parsed = parseDockerRun(block);
  if (!parsed.ok) {
    return [{ axis: "A-2", rule: "docker-run-unparsable", detail: parsed.reason }];
  }

  const violations: Violation[] = [];
  const image = parsed.run.image;
  const colon = image.lastIndexOf(":");
  const tag = colon === -1 ? undefined : image.slice(colon + 1);

  if (tag === undefined || tag === "") {
    violations.push({
      axis: "A-2",
      rule: "image-tag-missing",
      detail: `이미지에 태그가 없다: ${image} — 태그 없는 참조는 \`latest\`와 같다`,
    });
  } else if (tag === "latest") {
    violations.push({
      axis: "A-2",
      rule: "floating-tag",
      detail: "태그가 `latest`다 — 같은 명령이 시점마다 다르게 동작한다",
    });
  }

  const majorMatch = tag === undefined ? null : /^(\d+)/.exec(tag);
  const tagMajor = majorMatch?.[1];
  if (tag !== undefined && tag !== "" && tagMajor === undefined) {
    violations.push({
      axis: "A-2",
      rule: "tag-major-unreadable",
      detail: `태그에서 major를 읽지 못했다: ${tag}`,
    });
  }

  const constants = [
    ...stripCommentsAndStrings(shimSource).matchAll(/^const MIN_NODE_MAJOR = (\d+);$/gm),
  ].map((match) => match[1] ?? "");
  const [shimMajor] = constants;
  if (constants.length !== 1 || shimMajor === undefined) {
    violations.push({
      axis: "A-2",
      rule: "shim-constant-missing",
      detail: `shim에서 \`MIN_NODE_MAJOR\` 선언을 정확히 1건 뽑지 못했다 (${constants.length}건)`,
    });
    return violations;
  }

  if (tagMajor !== undefined && tagMajor !== shimMajor) {
    violations.push({
      axis: "A-2",
      rule: "major-mismatch",
      detail: `태그 major ${tagMajor} ≠ MIN_NODE_MAJOR ${shimMajor}`,
    });
  }
  return violations;
}

// ---------------------------------------------------------------------------
// A-3 — 홈 경로
// ---------------------------------------------------------------------------

/**
 * §3.5가 A-3의 정본으로 든 네 파일 — `packages/cli/src`의 홈 경로 계산.
 *
 * 이 목록이 재료 **개수**의 정본이다. 넷을 못 찾으면(개명·이동) 축이 조용히 좁아지므로,
 * 판정은 라벨 집합이 이것과 같은지를 먼저 본다.
 *
 * §3.5 미결: 이 넷 중 무엇이 `.neo-agent` 이름의 정본인지는 아직 정해지지 않았다. 정본이
 * 없으므로 **넷의 합의 자체가 대조 상대**이고, 합의가 깨지면 축은 대조할 값을 잃는다.
 * 상수 하나로 모으는 변경은 §3.5가 명시적으로 사정거리 밖에 두었다.
 */
export const HOME_SOURCE_FILES = [
  "config.ts",
  "credentials.ts",
  "allowlist.ts",
  "memory.ts",
] as const;

export interface HomeSource {
  /** `packages/cli/src` 기준 파일 이름 */
  readonly file: string;
  readonly source: string;
}

/**
 * A-3 — 마운트 원본·대상의 디렉터리 이름이 코드가 홈 아래에 쓰는 이름과 같은가.
 *
 * 원본과 대상을 **각각** 잰다(§3.5 표의 문면이 마운트 원본·대상 양쪽을 든다). 한쪽만 재면
 * 비대칭 마운트가 통과한다.
 *
 * 마운트 스펙은 `<원본>:<대상>` 두 조각이어야 한다. 세 조각(`:ro` 같은 모드 접미)이 붙으면
 * 문서의 명령이 실제로 바뀐 것이므로 축이 붉어지는 쪽이 맞다.
 */
export function judgeHomePath(block: string, sources: readonly HomeSource[]): Violation[] {
  const parsed = parseDockerRun(block);
  if (!parsed.ok) {
    return [{ axis: "A-3", rule: "docker-run-unparsable", detail: parsed.reason }];
  }

  const violations: Violation[] = [];

  const mounts = parsed.run.options
    .filter(
      (option) =>
        (option.flag === "-v" || option.flag === "--volume") && option.value !== undefined,
    )
    .map((option) => option.value ?? "")
    .filter((value) => value.includes("$HOME"));
  const [mount] = mounts;
  if (mounts.length === 0) {
    violations.push({
      axis: "A-3",
      rule: "home-mount-missing",
      detail: "`$HOME`을 담은 `-v` 마운트가 없다",
    });
  } else if (mounts.length > 1) {
    violations.push({
      axis: "A-3",
      rule: "home-mount-ambiguous",
      detail: `\`$HOME\` 마운트가 ${mounts.length}건이라 어느 것이 대상인지 모른다`,
    });
  }

  let mountName: string | undefined;
  if (mounts.length === 1 && mount !== undefined) {
    const parts = mount.split(":");
    if (parts.length !== 2) {
      violations.push({
        axis: "A-3",
        rule: "mount-spec-unreadable",
        detail: `마운트 스펙이 원본:대상 두 조각이 아니다: ${mount}`,
      });
    } else {
      const sourceName = homeChildName(parts[0] ?? "");
      const targetName = homeChildName(parts[1] ?? "");
      if (sourceName === undefined || targetName === undefined) {
        violations.push({
          axis: "A-3",
          rule: "mount-spec-unreadable",
          detail: `마운트 원본·대상이 \`$HOME/<이름>\` 형태가 아니다: ${mount}`,
        });
      } else if (sourceName !== targetName) {
        violations.push({
          axis: "A-3",
          rule: "mount-asymmetric",
          detail: `마운트 원본 ${sourceName} ≠ 대상 ${targetName}`,
        });
      } else {
        mountName = sourceName;
      }
    }
  }

  const labels = sources.map((entry) => entry.file).sort();
  const expected = [...HOME_SOURCE_FILES].sort();
  if (labels.join(",") !== expected.join(",")) {
    violations.push({
      axis: "A-3",
      rule: "source-set-mismatch",
      detail: `홈 경로 계산 재료가 ${expected.join(",")}가 아니다: ${labels.join(",") || "(없음)"}`,
    });
  }

  const codeNames = new Set<string>();
  for (const entry of sources) {
    const found = [
      ...stripCommentsAndStrings(entry.source, { keepStrings: true }).matchAll(
        /join\(\s*home\s*\?\?\s*homedir\(\)\s*,\s*"([^"]+)"/g,
      ),
    ].map((match) => match[1] ?? "");
    const [name] = found;
    if (found.length === 0 || name === undefined) {
      violations.push({
        axis: "A-3",
        rule: "source-literal-missing",
        detail: `${entry.file}에서 홈 아래 이름 리터럴을 찾지 못했다`,
      });
      continue;
    }
    if (found.length > 1) {
      violations.push({
        axis: "A-3",
        rule: "source-literal-ambiguous",
        detail: `${entry.file}에 홈 아래 이름 리터럴이 ${found.length}건 있다: ${found.join(",")}`,
      });
      continue;
    }
    codeNames.add(name);
  }

  if (codeNames.size > 1) {
    violations.push({
      axis: "A-3",
      rule: "code-disagrees",
      detail: `코드 네 자리의 합의가 깨졌다: ${[...codeNames].join(",")}`,
    });
    return violations;
  }

  const [codeName] = [...codeNames];
  if (mountName !== undefined && codeName !== undefined && mountName !== codeName) {
    violations.push({
      axis: "A-3",
      rule: "doc-code-mismatch",
      detail: `문서의 마운트 이름 ${mountName} ≠ 코드의 이름 ${codeName}`,
    });
  }
  return violations;
}

/** `$HOME/<이름>`에서 `<이름>`. 형태가 아니면 undefined */
function homeChildName(spec: string): string | undefined {
  const match = /^\$HOME\/([^/]+)$/.exec(spec);
  return match?.[1];
}

// ---------------------------------------------------------------------------
// A-4 — uid 인자
// ---------------------------------------------------------------------------

/** §3.3의 uid 행이 이름으로 지목하는 크리덴셜 권한 검사 */
const PERMISSION_GUARD = "assertSafePermissions";

/**
 * A-4 — `-u` 인자가 있고, 그 필요를 낳는 권한 검사가 여전히 모드 비트만 보는가.
 *
 * 판별은 둘이다 — 본문이 모드 비트를 읽고(`mode`·`0o…` 계열), 소유자를 읽지 않는다
 * (`uid`·`gid`·`getuid`·`geteuid`가 본문에 없다). **판별 전에 주석과 문자열 리터럴을 벗긴다** —
 * 벗기지 않으면 주석 한 줄로 축을 속일 수 있다(예산 게이트가 2026-08-22에 같은 위조형 우회를
 * 닫았다).
 *
 * 함수를 import하지 않는다. 재는 것이 무엇을 돌려주는가가 아니라 **무엇을 읽는가**라 소스
 * 텍스트가 대상이다. 지목은 이름으로 한다 — §3.5가 §3.3의 줄번호 인용을 걷은 그 형태다.
 *
 * ## 이 판별의 한계 — 근사이므로 전부 적는다
 *
 * §3.5의 문면은 권한 검사가 모드 비트만 본다는 것이고, 이 판별은 그것을 「소유자를 안 읽는다」로
 * 옮긴 근사다. 못 잡는 형태와 헛짚는 형태를 다 든다:
 *
 * 1. **헬퍼로 감싼 소유자 검사.** 본문이 `isOwnedByMe(path)`를 부르고 그 함수가 `uid`를 읽으면
 *    이 축은 못 본다. 본문 텍스트만 보기 때문이다.
 * 2. **다른 이름으로 읽는 소유자.** 구조 분해 개명(`const { uid: owner } = statSync(p)`)은
 *    잡지만, 계산된 접근(`stat[key]`)이나 별칭 상수는 못 잡는다.
 * 3. **모드 비트를 다른 이름으로 읽는 경우.** 헬퍼가 모드를 대신 읽어 본문에 `mode`도 `0o…`도
 *    안 남으면 위반으로 난다 — 거짓 위반이지만 fail-closed 방향이라 받는다.
 * 4. **읽고 아무것도 안 하는 본문.** 이 축은 텍스트를 보지 거동을 안 본다. 모드 비트를 읽고
 *    판정에 안 쓰는 본문도 통과한다.
 * 5. **함수 형태.** `function <이름>` 과 `const <이름> = … => …` 둘만 본문으로 인식한다.
 *    클래스 메서드나 객체 프로퍼티로 옮기면 못 찾은 것으로 처리돼 위반이 난다(fail-closed).
 * 6. **자리.** 이름이 지목한 함수 본문만 본다. 호출자 쪽에서 소유자를 검사해도 이 축 밖이다.
 *
 * `-u`에 대해서도 **있는지만** 재고 그것이 무엇을 하는지는 안 잰다(머리의 한계 2).
 */
export function judgeUidArg(block: string, credentialsSource: string): Violation[] {
  const parsed = parseDockerRun(block);
  if (!parsed.ok) {
    return [{ axis: "A-4", rule: "docker-run-unparsable", detail: parsed.reason }];
  }

  const violations: Violation[] = [];
  const hasUid = parsed.run.options.some(
    (option) => option.flag === "-u" || option.flag === "--user",
  );
  if (!hasUid) {
    violations.push({
      axis: "A-4",
      rule: "uid-flag-missing",
      detail: "명령에 `-u` 인자가 없다",
    });
  }

  const body = extractFunctionBody(stripCommentsAndStrings(credentialsSource), PERMISSION_GUARD);
  if (body === undefined) {
    violations.push({
      axis: "A-4",
      rule: "guard-missing",
      detail: `\`${PERMISSION_GUARD}\`의 본문을 찾지 못했다 — 개명·이동됐다면 고칠 것은 이 지목이다`,
    });
    return violations;
  }

  if (!/\bmode\b/i.test(body) && !/\b0o[0-7]+\b/.test(body)) {
    violations.push({
      axis: "A-4",
      rule: "mode-bits-unread",
      detail: `\`${PERMISSION_GUARD}\` 본문이 모드 비트를 읽지 않는다`,
    });
  }

  const owner = [...body.matchAll(/\b(uid|gid|getuid|geteuid)\b/g)].map((match) => match[1] ?? "");
  if (owner.length > 0) {
    violations.push({
      axis: "A-4",
      rule: "owner-read",
      detail: `\`${PERMISSION_GUARD}\` 본문이 소유자를 읽는다: ${[...new Set(owner)].join(",")}`,
    });
  }
  return violations;
}

/**
 * 이름으로 지목한 함수의 본문(중괄호 안)을 돌려준다. 입력은 **주석과 문자열이 이미 지워진**
 * 소스여야 한다 — 그래야 중괄호 세기가 안전하다.
 */
function extractFunctionBody(stripped: string, name: string): string | undefined {
  const declaration = new RegExp(`(?:function\\s+${name}\\b|const\\s+${name}\\s*=)`).exec(stripped);
  if (declaration === null) return undefined;

  let parens = 0;
  let open = -1;
  for (let index = declaration.index; index < stripped.length; index += 1) {
    const char = stripped[index];
    if (char === "(") parens += 1;
    else if (char === ")") parens -= 1;
    else if (char === "{" && parens === 0) {
      open = index;
      break;
    }
  }
  if (open === -1) return undefined;

  let depth = 0;
  for (let index = open; index < stripped.length; index += 1) {
    const char = stripped[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return stripped.slice(open + 1, index);
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// A-5 — 사본 일치
// ---------------------------------------------------------------------------

/**
 * A-5 — §3.3의 명령 블록과 `neo-agent-main/README.md`의 명령 블록이 문자 그대로 같은가.
 *
 * **정규화 없이 대조한다.** 공백 하나가 갈리는 것도 어긋남이다 — 두 사본이 손으로 유지된다는
 * 것이 이 축의 전제이고, 정규화하면 그 전제가 재는 대상을 지운다.
 *
 * §3.1과 `neo-agent-main/README.md`의 「설치」 절은 이 축의 대상이 **아니다**(§3.5가 §3.3만 든다).
 * 2026-09-05 실측으로 그 둘은 바이트 일치가 아니다 — §3.1은 두 줄에 후행 주석이 있고 README
 * 쪽에는 PATH 안내 줄이 하나 더 있다. 게다가 그 README 절은 `bash` 펜스를 2건 들어(설치와
 * 되돌리기) 추출기의 그물이 먼저 발화한다. A-5를 그쪽으로 넓히면 축이 붉어지고, 그것은 문서
 * 결함이 아니라 축의 오적용이다.
 */
export function judgeCopyParity(docBlock: string, readmeBlock: string): Violation[] {
  if (docBlock === "" || readmeBlock === "") {
    return [
      {
        axis: "A-5",
        rule: "empty-block",
        detail: "두 사본 중 하나가 비어 있다 — 추출이 대상을 못 찾은 것과 구별되지 않는다",
      },
    ];
  }
  if (docBlock !== readmeBlock) {
    return [
      {
        axis: "A-5",
        rule: "divergent",
        detail:
          "§3.3의 명령 블록과 `neo-agent-main/README.md`의 명령 블록이 바이트 일치하지 않는다",
      },
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// 실물 축 지원 판정
// ---------------------------------------------------------------------------

export interface LiveSupport {
  /** `process.platform` */
  readonly platform: string;
  readonly hasDocker: boolean;
  readonly hasScript: boolean;
}

/**
 * 실물 축을 이 머신에서 돌릴 수 있는가. 셋 중 하나라도 없으면 **위반**이다.
 *
 * 이것이 §3.5의 *"선언해 놓고 못 재는 것은 fail-closed의 대상이다"*를 담는 자리다. 옵트인
 * 환경변수는 이 머신이 그 축을 지원한다는 선언이므로, 선언해 놓고 못 재면 건너뛰는 것이 아니라
 * 떨어져야 한다 — 도커가 없어 건너뛴 것이 통과로 보이는 함정이 이 절이 겨누는 결함 그 자체다.
 *
 * **순수 함수인 것이 핵심이다.** 실물 축 자체는 `pnpm check`의 모집단 밖이지만, 이 판정을
 * 순수 함수로 뽑아 두면 그 fail-closed 규칙은 게이트 **안에서** 조합 전수로 측정된다.
 *
 * **`platform !== "linux"`도 위반이다.** §3.5는 실물 축이 Linux 전용이라고 적으면서 근거로
 * `script`의 인자 형태가 OS마다 다르다는 것을 든다. 그 문장은 「다른 OS에서는 축을 안 만든다」로도
 * 읽히지만 이 층은 「다른 OS에서 켜면 실패」로 읽었다 — 전자를 택하면 비-Linux에서 옵트인을 켠
 * 사람이 **조용한 통과**를 보게 되고, 그것이 fail-closed 규칙이 막으려던 바로 그 상태다.
 */
export function judgeLiveSupport(support: LiveSupport): Violation[] {
  const violations: Violation[] = [];
  if (support.platform !== "linux") {
    violations.push({
      axis: "LIVE",
      rule: "platform",
      detail: `실물 축은 Linux 전용이다 (platform=${support.platform})`,
    });
  }
  if (!support.hasDocker) {
    violations.push({
      axis: "LIVE",
      rule: "docker",
      detail: "도커를 찾지 못했다 — 옵트인을 켜 놓고 못 재는 것은 건너뛸 일이 아니다",
    });
  }
  if (!support.hasScript) {
    violations.push({
      axis: "LIVE",
      rule: "script",
      detail: "`script`(util-linux)를 찾지 못했다 — pty 없이는 문서의 명령을 재현할 수 없다",
    });
  }
  return violations;
}

// ---------------------------------------------------------------------------
// 렉서 — 이 파일 안에서 자족한다
//
// `distribution-supply-chain.contract.test.ts`가 같은 이름의 도우미를 갖지만 **거기서
// 가져오지 않는다**: 그 파일은 `*.test.ts`라 import하는 순간 그쪽 `describe`가 이 컨텍스트에서
// 다시 등록된다. `DOC-CITATION.md` §6 U-b가 판정 층의 복제를 기본값으로 두었고, 파일-로컬
// 스캐너는 그 규칙이 든 렉서 정본의 모집단 밖이다.
// ---------------------------------------------------------------------------

/** 주석과 (기본적으로) 문자열 리터럴 내용을 공백으로 지운다 — 줄 수와 자리는 보존된다 */
function stripCommentsAndStrings(source: string, options?: { keepStrings?: boolean }): string {
  let out = "";
  let index = 0;
  const blank = (text: string): string => text.replace(/[^\n]/g, " ");
  while (index < source.length) {
    const two = source.slice(index, index + 2);
    if (two === "//") {
      const end = source.indexOf("\n", index);
      const stop = end === -1 ? source.length : end;
      out += blank(source.slice(index, stop));
      index = stop;
      continue;
    }
    if (two === "/*") {
      const end = source.indexOf("*/", index + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += blank(source.slice(index, stop));
      index = stop;
      continue;
    }
    const char = source[index];
    if (char === '"' || char === "'" || char === "`") {
      let cursor = index + 1;
      while (cursor < source.length) {
        if (source[cursor] === "\\") {
          cursor += 2;
          continue;
        }
        if (source[cursor] === char) break;
        cursor += 1;
      }
      const literal = source.slice(index, Math.min(cursor + 1, source.length));
      out += options?.keepStrings === true ? literal : char + blank(literal.slice(1, -1)) + char;
      index = Math.min(cursor + 1, source.length);
      continue;
    }
    out += char ?? "";
    index += 1;
  }
  return out;
}
