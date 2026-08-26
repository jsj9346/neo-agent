/**
 * 패키지 경계와 의존성 예산 — 계약 검증.
 *
 * 기대값의 출처: `docs/WEB-UI.md` §2(신규 패키지는 `packages/serve` 하나 · 코어와의
 * 방향 · `packages/web`과의 무관 · 조립 독점)·§2.2(의존성 예산 둘 · **허용 내장 모듈**
 * 넷 · **금지 모듈** 아홉)·§2.3(그 계약을 무엇이 강제하고 **무엇을 강제하지 못하는가**).
 *
 * **소스 텍스트를 직접 읽는 이유**: "`node:tls`를 쓰지 않는다"는 런타임 동작이 아니라
 * **임포트 그래프의 성질**이라 실행으로는 확인되지 않는다. 예산 게이트
 * (`scripts/check-core-budget.mjs`)와 겹치는 항목이 있지만, 그쪽은 통합 게이트에서만
 * 돌고 이쪽은 패키지 스코프 테스트에서 돈다 — 이 패키지만 돌리는 개발 루프에서 경계
 * 위반을 먼저 알아채는 것이 목적이다.
 *
 * ---
 *
 * **이 검사가 무엇을 강제하지 못하는가 — §2.3을 복제한다.**
 *
 * 그 절이 "임포트 예산은 손수 짠 WebSocket을 막지 못한다"를 실측 근거와 함께 든다:
 * `http.Server`의 `upgrade` 이벤트는 `node:net` 임포트 없이 duplex 소켓을 넘겨주고,
 * 핸드셰이크의 SHA-1은 `node:crypto` 없이 전역 `crypto.subtle`로 계산된다. **아래 어느
 * 단정도 그 경로를 막지 않는다.** 막는 것은 §2.1의 판정이고 그것을 재는 기계는 없다.
 *
 * 그래서 이 파일은 그 자리에 근사 검사를 두지 않는다 — §2.3이 "근사 검사를 만들지
 * 않는다"를 판정으로 적었고, 재도입 트리거를 `packages/serve/src`에 그 리스너가 실제로
 * 나타나는 시점으로 뒀다. **그때 필요한 것은 검사가 아니라 그 절의 개정이다.**
 *
 * **오늘 `src/`가 골격뿐이라 임포트 그래프가 비어 있다.** 아래 허용 내장 폐쇄 스위트가
 * 관측하는 집합은 오늘 공집합이고, 그 축은 공집합에서 참이다 — **이 그린을 "예산이
 * 검증됐다"로 읽지 않는다.** 그 축이 실제로 일하기 시작하는 것은 서버·자산 모듈이
 * 착지한 뒤다. 반대로 금지 아홉 스위트와 의존성 예산 스위트는 오늘도 실물을 잰다.
 *
 * ---
 *
 * **이 파일이 지지 않는 축과 그 자리:**
 *
 * - **문서 §2.2 ↔ 게이트 `PACKAGES`의 금지 집합 동일성** — `packages/cli/test/
 *   budget-gate-parity.qa.test.ts`가 양방향으로 잰다. 여기서 아홉을 다시 문서에서
 *   파싱하면 파서가 둘이 되고 둘이 갈리는 날 어느 쪽이 정본인지 알 수 없어진다.
 * - **형제 패키지 의존 엣지(매니페스트 층)** — `packages/cli/test/
 *   package-boundary.contract.test.ts`의 `DOCUMENTED_SIBLINGS`가 잰다.
 * - **§2의 "역방향 임포트는 존재하지 않는다"(코어 → serve)** — 예산 게이트가 `core`의
 *   `dependencies`를 `["zod"]`로 **정확 일치** 판정하므로 매니페스트 층에서 이미 닫혀
 *   있다. 여기서 코어를 열어 다시 재지 않는다.
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
 * 주석 본문을 공백으로 지운다(줄 번호·열 폭 보존). **문자열 리터럴은 남긴다** — 아래
 * 경계 단정이 보는 것이 임포트 지정자, 즉 문자열 안이기 때문이다. 그래서 이 함수가 하는
 * 일은 문자열을 건너뛰며 주석만 지우는 것이고, 문자열 안의 `//`에 안 속는 것이 요점이다
 * (이 패키지의 소스는 SSE 경로·자산 라우트 리터럴을 들게 된다).
 *
 * 주석을 지우는 이유는 이 레포의 문체 때문이다 — 금지 대상을 이름으로 부르며 쓰지
 * 않는다고 적는 줄이 흔해서, 주석을 그대로 두면 그 줄이 전부 오탐이 된다.
 *
 * **파일-로컬 복제다.** `packages/cli/test/package-boundary.contract.test.ts`에 같은
 * 술어가 있고 공유하지 않았다 — 그 파일의 머리가 적는 이유(계약 판정이 다른 테스트의 헬퍼
 * 변경에 끌려가지 않게 한다)가 여기에도 그대로 선다. 렉싱 정본(`scripts/comment-lexer.mjs`)을
 * 안 부르는 것은 그쪽이 `typescript` 파서를 세우기 때문이고, 이 패키지의 런타임 예산은
 * 둘이라(아래 첫 단정) 판정 하나를 위해 파서를 끌어올 자리가 아니다.
 */
function stripComments(source: string): string {
  let out = "";
  let index = 0;
  const blank = (text: string) => text.replace(/[^\n]/g, " ");
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
      out += source.slice(index, Math.min(cursor + 1, source.length));
      index = Math.min(cursor + 1, source.length);
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

/** `src/`의 모듈들 — 주석을 벗긴 원문. 이 스위트의 모든 단정이 임포트 그래프를 묻는다. */
function sourceFiles(): { name: string; text: string }[] {
  const files = readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".ts"))
    .map((name) => ({ name, text: stripComments(readFileSync(join(SRC_DIR, name), "utf8")) }));
  // 0건은 통과가 아니라 **검사가 죽은 것**이다(`ARCHITECTURE.md` §2.6). 배럴 하나는
  // 골격 단계에도 반드시 있다.
  if (files.length === 0) {
    throw new Error("packages/serve/src에서 .ts를 1건도 찾지 못했다 — 검사가 죽었다");
  }
  return files;
}

/**
 * §2.2의 **금지 모듈** 아홉 — 그 절의 열거 그대로다.
 *
 * 리터럴로 든다. 문서를 여기서 다시 파싱하지 않는 이유는 머리가 적었다(파서가 둘이
 * 되면 갈리는 날 정본을 못 고른다). 목록이 문서에서 **줄면** 아래 길이 단언이 붉어져
 * 손으로 고치게 만드는 것이 의도다. 문서에서 **늘어난** 경우는 이 리터럴이 조용히
 * 낡을 수 있으나, 실제 위반은 아래 허용 내장 폐쇄 스위트가 잡는다 — 그쪽은 허용 넷의
 * 부분집합 단언이라 새 내장이 무엇이든 걸린다.
 */
const FORBIDDEN_BUILTINS = [
  "node:https",
  "node:net",
  "node:tls",
  "node:sqlite",
  "node:child_process",
  "node:dns",
  "node:dgram",
  "node:worker_threads",
  "node:cluster",
] as const;

/**
 * §2.2의 **허용 내장 모듈** 넷 — `node:http`(본업)·`node:fs`(§9의 정적 자산)·
 * `node:path`·`node:url`.
 *
 * **[미규정]** — 서브경로 지정자(`node:fs/promises`)를 이 넷이 덮는지 §2.2가 정하지
 * 않았다. 여기서는 **정확 일치로만** 통과시킨다. 자산 서빙이 그것을 필요로 하면 이
 * 단정이 붉어지고, 그때 결정할 자리는 이 파일이 아니라 §2.2다 — fail-closed가 미규정을
 * 조용히 넘기는 것보다 낫다.
 */
const ALLOWED_BUILTINS = ["node:http", "node:fs", "node:path", "node:url"] as const;

/** 워크스페이스 형제 중 `serve`가 임포트할 수 있는 것은 `core` 하나다(§2·§2.2). */
const FORBIDDEN_SIBLINGS = [
  "@neo-agent/cli",
  "@neo-agent/compaction",
  "@neo-agent/gate",
  "@neo-agent/memory",
  "@neo-agent/providers",
  "@neo-agent/sandbox",
  "@neo-agent/store",
  "@neo-agent/tools",
  "@neo-agent/web",
] as const;

/**
 * 소스에 나타난 `node:*` 지정자 전부.
 *
 * 임포트 문형(`from`·`import()`·`require()`)을 가리지 않고 **`node:`로 시작하는 따옴표
 * 문자열 전부**를 센다. 넓게 잡는 것이 의도다 — 문형별 정규식은 새 문형이 생길 때마다
 * 조용히 새는데, 이 축은 허용 밖을 전부 위반으로 읽으므로 넓은 쪽이 fail-closed다.
 */
function builtinSpecifiers(): { name: string; specifier: string }[] {
  const found: { name: string; specifier: string }[] = [];
  for (const file of sourceFiles()) {
    for (const match of file.text.matchAll(/["'`](node:[^"'`]*)["'`]/g)) {
      const specifier = match[1];
      if (specifier !== undefined) found.push({ name: file.name, specifier });
    }
  }
  return found;
}

describe("의존성 예산 (WEB-UI §2.2)", () => {
  it("런타임 의존성은 `@neo-agent/core`와 `zod` 정확히 2개다", () => {
    // 외부 런타임 의존성 0이 계약이다(§2). `zod`는 새 의존성이 아니라 이미 트리에 있는
    // 것이고, §6의 «알려지지 않은 필드를 거부한다»를 실제로 재는 수단이다.
    const manifest = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual(["@neo-agent/core", "zod"]);
  });

  it("매니페스트가 형제 패키지를 `core` 말고는 들지 않는다", () => {
    // "조립은 `packages/cli`가 독점하므로" `store`·`gate`·`providers`는 배선으로
    // 들어오지 임포트로 들어오지 않는다(§2.2).
    const manifest = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
      dependencies?: Record<string, string>;
    };
    for (const sibling of FORBIDDEN_SIBLINGS) {
      expect(manifest.dependencies ?? {}, `매니페스트가 ${sibling}을 든다`).not.toHaveProperty(
        sibling,
      );
    }
  });
});

describe("금지 모듈 아홉 (WEB-UI §2.2)", () => {
  it("금지 목록이 9종이다 — §2.2의 열거와 같은 수", () => {
    // 수를 단정하는 이유: 목록이 줄면 이 줄이 붉어진다. 게이트와의 집합 동일성은
    // `packages/cli/test/budget-gate-parity.qa.test.ts`가 문서 쪽에서 잰다.
    expect(FORBIDDEN_BUILTINS).toHaveLength(9);
    expect([...FORBIDDEN_BUILTINS]).toEqual([...new Set(FORBIDDEN_BUILTINS)]);
  });

  it("허용 넷과 금지 아홉이 겹치지 않는다", () => {
    // 겹치면 아래 두 축이 서로를 무르고, 어느 쪽이 이기는지가 단정 순서에 달리게 된다.
    const allowed = new Set<string>(ALLOWED_BUILTINS);
    for (const forbidden of FORBIDDEN_BUILTINS) {
      expect(allowed.has(forbidden), `${forbidden}이 양쪽에 있다`).toBe(false);
    }
  });

  it("금지 아홉을 각각 임포트하지 않는다", () => {
    // `node:https`·`node:tls` 금지가 §4의 "TLS를 설계하지 않는다"의 기계 판이다.
    // `node:net` 금지는 raw 소켓 — 루프백 바인드는 `node:http`의 listen()이 한다.
    // `node:sqlite`·`node:child_process`·`node:dns`는 저장소·프로세스 스폰·이름 해석이
    // 각각 store·tools·web의 본업이라는 경계다. `node:cluster`는 §3.3이 데몬화 금지의
    // 남은 문을 닫으려고 넣었다.
    for (const file of sourceFiles()) {
      for (const forbidden of FORBIDDEN_BUILTINS) {
        const pattern = new RegExp(`["'\`]${forbidden.replace(/[/:]/g, "\\$&")}["'\`]`);
        expect(pattern.test(file.text), `${file.name}이 ${forbidden}을 임포트한다`).toBe(false);
      }
    }
  });
});

describe("허용 내장의 폐쇄 (WEB-UI §2.2 — 부분집합 단언)", () => {
  it("허용 목록이 4종이다", () => {
    // §2.2가 "허용이 닫힌 목록임은 경계 테스트가 부분집합 단언으로 진다"고 이 자리를
    // 지목한다 — 예산 게이트의 `PACKAGES` 항에는 «허용» 필드가 없어 이 축은 여기서만
    // 선다.
    expect(ALLOWED_BUILTINS).toHaveLength(4);
    expect([...ALLOWED_BUILTINS]).toEqual([...new Set(ALLOWED_BUILTINS)]);
  });

  it("`src/`가 쓰는 내장이 허용 넷의 부분집합이다", () => {
    // **이 축이 이 파일의 fail-closed 축이다.** 위 금지 아홉 스위트는 열거된 것만 막지만
    // 여기는 허용 밖 전부를 막는다 — `node:crypto`처럼 아홉에 없는 내장도, 훗날
    // 문서가 금지에 더할 무엇도 이 줄에 먼저 걸린다.
    const allowed = new Set<string>(ALLOWED_BUILTINS);
    for (const { name, specifier } of builtinSpecifiers()) {
      expect(allowed.has(specifier), `${name}이 허용 밖 내장 ${specifier}을 쓴다`).toBe(true);
    }
  });
});

describe("패키지 무의존 (WEB-UI §2)", () => {
  it("`src/`가 `core` 밖의 형제 패키지를 임포트하지 않는다", () => {
    // "`packages/serve`는 `packages/web`과 무관하다" — 이름이 비슷하나 후자는
    // `web_fetch`이고 이 패키지는 우리 서버다. 나머지 형제도 같다:
    // "`packages/serve`는 다른 패키지를 직접 들지 않는다".
    for (const file of sourceFiles()) {
      for (const sibling of FORBIDDEN_SIBLINGS) {
        expect(file.text.includes(sibling), `${file.name}이 ${sibling}을 임포트한다`).toBe(false);
      }
    }
  });
});
