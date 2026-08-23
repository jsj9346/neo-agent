/**
 * 패키지 경계 — 계약 독립 검증 (QA).
 *
 * 기대값의 출처: `docs/PROVIDERS.md` §2.1(의존성 예산 «`@anthropic-ai/sdk` +
 * `@neo-agent/core` 정확히 2개», 금지 모듈 `node:fs`·`node:sqlite`·`child_process`·
 * `net`·`tls`·`http`·`https`·`dns`, 그리고 «예산은 `package.json`의 `dependencies`
 * 기준이다»)·§2.2(크리덴셜 격리 — «어댑터는 스스로 크리덴셜을 읽지 않는다. API 키는
 * 생성 시 파라미터로만 들어오고, 어댑터 안에 파일·환경 변수·키체인을 읽는 경로가
 * 없다»). **문서만이 기대값의 출처다** — 예산 게이트 스크립트의 목록을 옮겨 적으면
 * 이 파일은 게이트의 사본이지 독립 검증이 아니게 되므로, 여기서 게이트 소스를 읽거나
 * 임포트하지 않는다.
 *
 * **이 검사의 한계 — 리터럴 지정자에 한한다** (2026-08-14 독립 감사 F-2). 아래 정규식은
 * `import("x")`·`require("x")`처럼 **따옴표가 바로 오는** 형태만 잡는다.
 * `const m = "fs"; await import(m)`처럼 변수를 경유하면 이 검사도, 예산 게이트도
 * 못 잡는다 — 둘 다 같은 텍스트 스캔 방식이라 **한계를 공유한다.** 실물로 재현해
 * 확인했다. 이것을 닫으려면 AST 분석이 필요하고 그 판정은 별건이다. 아래의
 * "안 불린 코드 경로에 숨어 있어도"는 **리터럴 지정자에 대해** 참이다.
 *
 * 소스 텍스트를 직접 읽는 이유: "임포트하지 않는다"는 **임포트 그래프의 성질**이라
 * 실행으로는 확인되지 않는다. 금지 모듈은 안 불린 코드 경로에 숨어 있어도 위반이고,
 * 크리덴셜 자가 읽기도 «그 경로가 존재하지 않는다»가 계약이지 «이번 실행에서 안
 * 읽었다»가 계약이 아니다(§2.2의 강제 수단이 «의도가 아니라 능력의 제거»인 이유).
 *
 * 예산 게이트(`scripts/check-core-budget.mjs`)와 항목이 겹치는데도 여기 두는 이유:
 * 그쪽은 통합 게이트에서만 돌고 이쪽은 패키지 스코프 테스트에서 돈다 — 병렬 구간에서
 * 경계 위반을 먼저 알아채는 것이 목적이고, 두 검사가 서로의 회귀를 잡는다. 겹치는
 * 것은 중복이 아니라 **독립 표본 둘**이다.
 *
 * 검사 범위는 `src/`뿐이다. §2.2가 말하는 것은 어댑터 소스이며, `test/`는 픽스처와
 * 라이브 스모크(환경 변수로 키를 받는다)를 포함하므로 계약의 대상이 아니다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC_DIR = fileURLToPath(new URL("../src/", import.meta.url));
const PACKAGE_JSON = fileURLToPath(new URL("../package.json", import.meta.url));

/**
 * 문자열 리터럴이 닫히는 자리를 찾는다. 못 찾으면 `-1` — 그 따옴표는 리터럴의 시작이
 * 아니었다는 뜻이고, 그 판정이 아래 `stripComments`를 안 지우는 쪽으로 넘어지게 한다.
 *
 * `'`·`"`는 한 줄을 넘지 못한다는 문법을 그대로 쓴다. 백틱만 줄을 넘는다.
 */
function literalEnd(text: string, start: number): number {
  const quote = text[start];
  const spansLines = quote === "`";
  for (let cursor = start + 1; cursor < text.length; cursor += 1) {
    const char = text[cursor];
    if (char === "\\") {
      cursor += 1;
      continue;
    }
    if (!spansLines && char === "\n") return -1;
    if (char === quote) return cursor;
  }
  return -1;
}

/**
 * 정규식 리터럴이 닫히는 자리를 찾는다. 그 줄 안에서 못 닫으면 `-1`.
 *
 * `\x` 이스케이프와 문자 클래스 `[...]`를 안다 — 그 둘만 알면 `/a\/b/`·`/[/*]/`·
 * `/["']/`처럼 안에 `/`나 따옴표를 품은 형태가 전부 한 구간으로 잡힌다. 정규식 리터럴은
 * 줄을 넘지 못하므로, 개행을 만나면 그 `/`는 정규식의 시작이 아니었다는 뜻이다.
 *
 * **닫는 후보가 `//`·`/*`를 여는 자리면 닫지 않는다 — `-1`이다.** 이것이 없으면 나눗셈 `/`가
 * 연 유령 구간이 뒤따르는 실물 주석의 **첫 `/`에서 닫히고**, 커서가 그 주석 토큰 한가운데
 * (`//`의 둘째 `/`)에 선다. 그 자리에서 `//*`의 `/*`가 블록 주석으로 읽혀 짝 없으면 **EOF까지
 * 통째로 덮었다**(2026-08-23 `K-244` V-2 — `const r = total / count; //* 메모` 한 줄로 그 아래
 * `process.env` 읽기가 덮여 이 파일의 일곱 단정이 조용한 그린이 됐다). `-1`을 돌리면 호출부가
 * 「그 줄의 나머지를 원문 그대로」로 넘어가므로 방향이 다시 **덜 지우는 쪽** 하나가 된다.
 *
 * 진짜 정규식은 이 자리에 거의 걸리지 않는다 — 닫는 `/` 뒤에 오는 것은 플래그(글자)나
 * 연산자·구분자이고, 안에 `//`를 품은 `/[//]/`는 문자 클래스라 여기까지 오지 않는다.
 * 걸리는 경우(`/a//`)에도 대가는 주석을 덜 벗기는 것뿐이다.
 */
function regexEnd(text: string, start: number): number {
  let inClass = false;
  for (let cursor = start + 1; cursor < text.length; cursor += 1) {
    const char = text[cursor];
    if (char === "\n") return -1;
    if (char === "\\") {
      cursor += 1;
      continue;
    }
    if (inClass) {
      if (char === "]") inClass = false;
      continue;
    }
    if (char === "[") {
      inClass = true;
      continue;
    }
    if (char === "/") {
      const next = text[cursor + 1];
      return next === "/" || next === "*" ? -1 : cursor;
    }
  }
  return -1;
}

/**
 * 주석을 벗긴다 — **문자열 리터럴의 내용은 그대로 남긴다.** 지운 자리는 같은 길이의
 * 공백으로 덮고 줄바꿈은 보존하므로, 벗긴 뒤에도 아래 정규식들이 처분 전과 같은 줄·같은
 * 자리를 본다.
 *
 * **문자열까지 아는 이유**: 이 파일의 단정은 전부 **능력의 부재**를 재고(§2.2의 강제 수단이
 * 의도가 아니라 능력의 제거인 것과 같은 이유), 그런 검사에서 최악은 조용한 그린이다.
 * 따옴표를 모르는 판본은 주소 표기를 담은 줄에서 `//` 뒤를 주석으로 오인해 **그 줄의 나머지
 * 코드를 함께 지운다** — 그 뒤에서 실물이 `process.env`를 읽어도 아무도 못 본다. 그런
 * 리터럴은 오늘 `src/anthropic/registration.ts`에 실제로 있다(`EVIDENCE_URL`).
 *
 * **`/`를 만나면 어느 쪽인지 판정하지 않는다 — 안 지우는 쪽으로 넘어진다.** `//`도 `/*`도
 * 아닌 맨 `/`는 정규식 리터럴을 여는 자리일 수 있다(문법상 정규식은 그 두 표기로 시작할 수
 * 없으므로, 모든 정규식 리터럴의 첫 글자는 맨 `/`다). 정규식인지 나눗셈인지 가리려 들지
 * 않고 둘 다 같이 다룬다 — 같은 줄에서 닫는 `/`를 찾으면 그 구간을 원문 그대로 건너뛰고,
 * 못 찾으면 그 줄의 나머지를 통째로 원문 그대로 둔다. 두 갈래 다 지우지 않는다.
 *
 * 그리고 **닫는 자리가 `//`·`/*`를 여는 `/`면 `regexEnd`가 닫지 않는다**(그 머리 참조) —
 * 그래서 커서가 주석 토큰 한가운데에 서는 일이 없고, 이 함수가 글자를 덮는 자리는 문자열
 * 밖이면서 맨 `/`가 연 구간 밖인, **자기 첫 글자가 곧 토큰의 시작인** `//`·`/*`뿐이다.
 *
 * **한계 — 정직하게 적는다.** 손으로 만든 스캐너이지 렉서가 아니다. **문법상 유효한 소스에서**
 * 남는 한계는 전부 **덜 지우는 쪽**이고, 네 갈래다:
 *
 * - 나눗셈 `/`도 정규식 후보로 다루므로, 한 줄에서 나눗셈 뒤에 붙은 주석은 안 벗겨질 수 있다.
 * - 그 나눗셈 뒤에 붙은 것이 **블록 주석**이어도 마찬가지다 — 닫는 후보가 `/*`를 여는 자리라
 *   `regexEnd`가 `-1`을 돌리고, 그 줄의 나머지가 원문으로 남는다.
 * - **안 닫힌 정규식 후보**(같은 줄에 닫는 `/`가 없다)도 그 줄의 나머지를 원문으로 남긴다.
 * - **안 닫힌 문자열은 다르다** — `literalEnd`가 `-1`이면 커서는 **한 글자만** 전진하고 스캔이
 *   그대로 이어지므로, 그 줄의 `//`는 정상적으로 벗겨진다. 문법상 유효한 소스에서 문자열 밖의
 *   짝 없는 따옴표는 리터럴이 아니라 표기(아포스트로피)이므로 이쪽이 옳다. 문법이 이미 깨진
 *   소스에서만 파서가 문자열로 볼 구간이 덮인다.
 *
 * 그렇게 남은 주석에 적힌 모듈명·`process.env` 표기는 위반으로 서서 **붉게** 드러난다 —
 * 문법이 성립하는 한 오인의 대가가 시끄러운 오탐이지 조용한 그린이 아니다. 공유 렉서
 * (`scripts/comment-lexer.mjs`)를 여기 들이지 않은 것은 이 사이클이 파일마다 **이미 가진
 * 수단**만 마저 걸기로 한 결과이지 그 렉서를 물린 판정이 아니다.
 * (2026-08-23 T-012 — 그 전 판본은 정규식 리터럴을 몰라 `/https?:\/\//` 같은 줄의 실물
 * `process.env` 읽기를 덮었고, 이 파일의 일곱 단정이 전부 조용히 통과했다. 같은 날 `K-244` —
 * 그 보강판도 나눗셈이 연 유령 구간이 실물 주석의 첫 `/`에서 닫히는 바람에 EOF까지 덮었다.)
 */
function stripComments(text: string): string {
  const blank = (chunk: string): string => chunk.replace(/[^\n]/g, " ");
  const kept: string[] = [];
  let keepFrom = 0;
  let cursor = 0;
  while (cursor < text.length) {
    const char = text[cursor];

    if (char === '"' || char === "'" || char === "`") {
      const end = literalEnd(text, cursor);
      cursor = end === -1 ? cursor + 1 : end + 1;
      continue;
    }

    if (char === "/" && text[cursor + 1] === "*") {
      const closed = text.indexOf("*/", cursor + 2);
      const stop = closed === -1 ? text.length : closed + 2;
      kept.push(text.slice(keepFrom, cursor), blank(text.slice(cursor, stop)));
      cursor = stop;
      keepFrom = stop;
      continue;
    }

    if (char === "/" && text[cursor + 1] === "/") {
      const newline = text.indexOf("\n", cursor);
      const stop = newline === -1 ? text.length : newline;
      kept.push(text.slice(keepFrom, cursor), blank(text.slice(cursor, stop)));
      cursor = stop;
      keepFrom = stop;
      continue;
    }

    if (char === "/") {
      const end = regexEnd(text, cursor);
      if (end === -1) {
        const newline = text.indexOf("\n", cursor);
        cursor = newline === -1 ? text.length : newline + 1;
      } else {
        cursor = end + 1;
      }
      continue;
    }

    cursor += 1;
  }
  kept.push(text.slice(keepFrom));
  return kept.join("");
}

/**
 * `src/` 아래 소스 파일들 — **주석을 벗긴 코드**를 돌린다.
 *
 * 아래 판정들이 묻는 것은 이 패키지가 무엇을 **할 수 있는가**이지 주석이 무엇을 말하는가가
 * 아니다. 처분 전에는 이 함수가 원문을 그대로 돌렸고 여섯 자리가 그 원문에 직접 정규식을
 * 걸어, 주석 한 줄이 판정을 **양 방향으로** 뒤집었다(2026-08-22 실측):
 *
 * - 오탐 — 아무 효력 없는 메모가 위반으로 섰다. `process.env`·`import.meta.env`·
 *   `ANTHROPIC_API_KEY`를 주석에 적기만 해도, `express`·`node:fs` 임포트 한 줄을 주석으로
 *   남겨 두기만 해도 red였다.
 * - 조용한 그린 — 실물 `Anthropic` 생성을 통째로 블록 주석으로 돌리면, SDK를 만드는 자리가
 *   **하나도 없는데** 그 주석이 대신 세어져 일곱 검사가 전부 통과했다. 이쪽이 더 나쁘다.
 *
 * **벗기는 자리가 호출부가 아니라 여기인 이유**: 호출부에 맡기면 한 곳만 잊어도 계약이 조용히
 * 거짓이 된다. 필드 이름을 `text`에서 `code`로 바꾼 것도 같은 이유다 — 값의 성격이 바뀌었는데
 * 이름이 그대로면 다음 사람이 원문으로 읽는다.
 */
function sourceFiles(): { name: string; code: string }[] {
  return readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".ts"))
    .map((name) => ({ name, code: stripComments(readFileSync(join(SRC_DIR, name), "utf8")) }));
}

/**
 * 한 파일이 참조하는 모듈 지정자를 전부 뽑는다.
 *
 * 정적 `import`/`export ... from`, 사이드이펙트 `import "x"`, 동적 `import("x")`,
 * `require("x")`를 모두 훑는다. 한 형태만 재면 나머지로 그대로 우회된다.
 */
function moduleSpecifiers(text: string): string[] {
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g, // import ... from "x" / export ... from "x"
    /\bimport\s+["']([^"']+)["']/g, // import "x"
    /\bimport\s*\(\s*["']([^"']+)["']/g, // import("x")
    /\brequire\s*\(\s*["']([^"']+)["']/g, // require("x")
  ];
  const found: string[] = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) found.push(match[1] as string);
  }
  return found;
}

/**
 * 내장 모듈 지정자를 금지 목록과 대조할 이름으로 정규화한다.
 *
 * §2.1의 목록은 `node:fs`처럼 접두형과 `net`처럼 맨 이름을 섞어 쓴다. 둘은 Node에서
 * **같은 모듈**이므로 한쪽만 재면 나머지 절반이 샌다 — `node:` 접두를 벗겨 한 축으로
 * 모은 뒤 대조한다. 서브패스(`fs/promises`·`dns/promises`)도 루트로 접는다:
 * 금지의 근거가 «그 밖의 I/O는 이 패키지의 일이 아니다»라는 **능력**이고, 서브패스는
 * 같은 능력의 다른 입구이기 때문이다.
 */
function builtinRoot(specifier: string): string {
  return specifier.replace(/^node:/, "").split("/")[0] as string;
}

describe("의존성 예산 (PROVIDERS §2.1)", () => {
  it("런타임 의존성은 `@anthropic-ai/sdk`와 `@neo-agent/core` 정확히 2개다", () => {
    // §2.1은 예산을 `package.json`의 `dependencies` 기준으로 정하고 `devDependencies`
    // (타입 정의·컴파일러·테스트 러너)는 세지 않는다 — 그래서 여기서도
    // `dependencies`만 **정확 집합**으로 본다. 초과도 위반이고 누락도 위반이다.
    const manifest = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual([
      "@anthropic-ai/sdk",
      "@neo-agent/core",
    ]);
  });

  it("소스가 예산 밖 런타임 패키지를 임포트하지 않는다", () => {
    // `package.json`이 깨끗해도 소스가 호이스팅된 트랜지티브 패키지를 직접 부르면
    // 예산은 문서상으로만 지켜진다. 내장 모듈(`node:` 접두 또는 Node 빌트인)과
    // 상대 경로를 제외한 나머지는 전부 «워크스페이스 밖 의존»이다.
    const allowed = new Set(["@anthropic-ai/sdk", "@neo-agent/core"]);
    const builtins = new Set([
      "assert",
      "buffer",
      "child_process",
      "crypto",
      "dns",
      "events",
      "fs",
      "http",
      "http2",
      "https",
      "net",
      "os",
      "path",
      "process",
      "sqlite",
      "stream",
      "timers",
      "tls",
      "url",
      "util",
      "worker_threads",
      "zlib",
    ]);
    for (const file of sourceFiles()) {
      for (const specifier of moduleSpecifiers(file.code)) {
        if (specifier.startsWith(".") || specifier.startsWith("/")) continue;
        if (specifier.startsWith("node:") || builtins.has(builtinRoot(specifier))) continue;
        // 스코프 패키지의 서브패스 임포트(`@anthropic-ai/sdk/resources`)도 같은
        // 의존이므로 루트 패키지 이름으로 접어서 본다.
        const root = specifier.startsWith("@")
          ? specifier.split("/").slice(0, 2).join("/")
          : (specifier.split("/")[0] as string);
        expect(allowed.has(root), `${file.name}이 예산 밖 패키지 ${root}를 임포트한다`).toBe(true);
      }
    }
  });
});

describe("금지 모듈 (PROVIDERS §2.1)", () => {
  // §2.1이 이름으로 든 목록 그대로다. 문서가 «네트워크는 SDK를 경유하고, 그 밖의
  // I/O는 이 패키지의 일이 아니다»라고 근거를 밝힌 여덟이며, 이 배열의 출처는
  // 문서 문장 하나뿐이다(게이트 스크립트에서 가져오지 않는다).
  const FORBIDDEN = ["fs", "sqlite", "child_process", "net", "tls", "http", "https", "dns"];

  it("여덟 모듈을 `node:` 접두형·맨 이름 어느 쪽으로도 임포트하지 않는다", () => {
    for (const file of sourceFiles()) {
      for (const specifier of moduleSpecifiers(file.code)) {
        const root = builtinRoot(specifier);
        expect(
          FORBIDDEN.includes(root),
          `${file.name}이 금지 모듈을 임포트한다: ${specifier}`,
        ).toBe(false);
      }
    }
  });

  it("검사기 자신이 접두형과 맨 이름을 둘 다 잡는다 (역검증)", () => {
    // 이 검사가 없으면 «맨 이름만 재는 정규식»으로 퇴화해도 스위트는 초록으로 남는다.
    // 위반 표본을 넣어 실제로 잡히는지를 검사기 수준에서 고정한다.
    const samples = [
      'import { readFileSync } from "node:fs";',
      'import { readFileSync } from "fs";',
      'const cp = require("child_process");',
      'const dns = await import("node:dns/promises");',
      'export { createServer } from "node:https";',
      'import "net";',
    ];
    for (const sample of samples) {
      const roots = moduleSpecifiers(sample).map(builtinRoot);
      expect(
        roots.some((root) => FORBIDDEN.includes(root)),
        sample,
      ).toBe(true);
    }
    // 반대 방향 — 허용된 것을 잘못 잡지 않는다.
    const clean = 'import Anthropic from "@anthropic-ai/sdk";\nimport { x } from "./convert.ts";';
    expect(
      moduleSpecifiers(clean)
        .map(builtinRoot)
        .some((r) => FORBIDDEN.includes(r)),
    ).toBe(false);
  });
});

describe("크리덴셜 격리 (PROVIDERS §2.2)", () => {
  it("환경 변수를 읽지 않는다", () => {
    // §2.2: «어댑터 안에 파일·환경 변수·키체인을 읽는 경로가 없다». 환경 변수는
    // §2.1의 모듈 금지가 막지 못하는 유일한 구멍이라(내장 모듈 없이 닿는다) 소스에서
    // 직접 잰다.
    for (const file of sourceFiles()) {
      expect(/\bprocess\.env\b/.test(file.code), `${file.name}이 process.env를 읽는다`).toBe(false);
      expect(/\bimport\.meta\.env\b/.test(file.code), `${file.name}`).toBe(false);
    }
  });

  it("파일·키체인에서 크리덴셜을 읽는 경로가 없다", () => {
    // 모듈 금지(§2.1)가 능력을 없애는 것이 1차 방어지만, 그 방어가 뚫렸을 때 무엇이
    // 새는지를 이름으로도 고정해 둔다 — 키체인은 애초에 모듈 금지 목록에 없다
    // (`keytar` 같은 네이티브 패키지나 `child_process` 경유 `security(1)` 호출).
    const credentialRead =
      /keytar|libsecret|find-generic-password|wincred|\.netrc|credentials\.json|ANTHROPIC_API_KEY/;
    for (const file of sourceFiles()) {
      expect(credentialRead.test(file.code), `${file.name}에 크리덴셜 자가 읽기 경로가 있다`).toBe(
        false,
      );
    }
  });

  it("SDK 생성 시 `apiKey`를 명시로 넘긴다 — 생략은 SDK의 환경 변수 폴백을 연다", () => {
    // 침묵 실패 경로다. `new Anthropic({...})`에서 `apiKey`를 빼면 **에러가 나지 않고**
    // SDK가 자기 안에서 `ANTHROPIC_API_KEY`를 읽어 동작한다. 그러면 이 패키지 소스
    // 어디에도 환경 변수 문자열이 없는 채로 §2.2가 요구하는 API 키의 파라미터 전용 입구가
    // 깨진다 — 위의 두 검사만으로는 잡히지 않는 구멍이라 별도로 고정한다.
    const constructions = sourceFiles().flatMap((file) =>
      [...file.code.matchAll(/new\s+Anthropic\s*\(([\s\S]*?)\n\s*\}\s*\)/g)].map((match) => ({
        name: file.name,
        args: match[1] as string,
      })),
    );
    expect(constructions.length, "SDK 클라이언트를 만드는 곳이 없다").toBeGreaterThan(0);
    for (const construction of constructions) {
      // 인자가 **주석을 벗긴 코드**라는 것이 이 단정의 전제다. 벗기지 않으면 `// apiKey: …`로
      // 주석 처리된 자리가 검사를 통과시켜 **프로퍼티를 실제로 지운 변경이 그린으로 남는다**
      // (2026-08-14 독립 감사 F-1 — 그 우회를 실물로 재현해 확인했다). 그때 이 한 자리에만
      // 걸었던 것을 오늘은 `sourceFiles`가 파일 전체에 든다 — 여기서 다시 벗기면 아무 일도
      // 일어나지 않으므로, 방어가 실제로 사는 자리를 헷갈리게 만들지 않으려고 그 호출을 뺐다.
      expect(
        /\bapiKey\s*:/.test(construction.args),
        `${construction.name}의 Anthropic 생성이 apiKey를 명시하지 않는다`,
      ).toBe(true);
    }
  });

  // [미규정] §2.2의 `AnthropicClientConfig` 예시 블록에는 `fetch?` 필드가 없는데
  // 구현(`src/anthropic/client.ts`)에는 테스트용 주입 지점으로 있다. 이 절이 정하는
  // 것이 크리덴셜의 유일한 입구가 `apiKey`라는 것인지, 아니면 필드 집합 전체인지가
  // 문서에서 갈리지 않는다. 전자로 읽으면 `fetch?`는 크리덴셜을 나르지 않으므로
  // 무관하고, 후자로 읽으면 문서와 구현이 어긋난다. 임의 판정하지 않고 판정 대상으로
  // 올린다 — 어느 쪽이든 이 파일이 아니라 §2.2의 문면이 정해야 한다.
});
