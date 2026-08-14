/**
 * 문서 ↔ 기계 대조 — QA 독립 검증 (T-008).
 *
 * **이 파일의 주제는 `package-boundary.contract.test.ts`와 정반대다.** 그쪽은 «게이트를
 * 보지 않는 것»이 값이라 기대값을 문서에서만 뽑는다. 여기는 «문서와 게이트가 같은 것을
 * 말하는가»가 주제이므로 **둘 다 읽는 것이 목적**이다 — 한쪽만 읽으면 대조가 성립하지
 * 않는다. 두 파일은 겹치지 않는다.
 *
 * 왜 필요한가: 2026-08-14까지 `PROVIDERS.md` §2.1이 금지 모듈 여덟을 선언하는 동안
 * 예산 게이트는 다섯만 쟀고, **그 어긋남을 재는 기계가 하나도 없었다**
 * (`plans/20260814-providers-doc-verify-report.md` V-1). 같은 사이클이 §2.2 코드블록과
 * `client.ts`의 필드 수 어긋남도 같은 이유로 놓쳤다(같은 리포트 D-1). 선언과 집행 사이의
 * 간격은 사람이 볼 때만 보이는 자리였고, 이 파일이 그 자리에 기계를 놓는다.
 *
 * `ARCHITECTURE.md` 머리의 «규범적 수» 예외가 요구하는 «그 수를 실제로 재는 검사»가
 * 금지 목록에 대해서는 존재하지 않았다는 것과 같은 사실이다.
 *
 * 기대값의 출처는 **정본 문서**이고, 게이트·구현은 **대조 상대**다. 어긋나면 문서가 옳다.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const PROVIDERS_DOC = read("../../../docs/PROVIDERS.md");
const SESSION_STORE_DOC = read("../../../docs/SESSION-STORE.md");
const BUDGET_GATE = read("../../../scripts/check-core-budget.mjs");
const CLIENT_SRC = read("../src/anthropic/client.ts");

/**
 * 게이트의 한 패키지 항에서 `forbiddenModules` 문자열을 뽑는다.
 *
 * 임포트하지 않고 텍스트로 읽는 이유는 `check-core-budget.mjs`가 exports 없는 실행
 * 스크립트이고 최상위에서 `process.exit(1)`을 부르기 때문이다 — 임포트하면 이 워커가
 * 죽는다(`DOC-CITATION.md` §4가 판정과 실행부를 파일로 가른 것과 같은 이유).
 *
 * 뽑지 못하면 `[]`가 아니라 던진다. 0건을 통과로 읽으면 «항 이름이 바뀌어 검사가 조용히
 * 죽은 상태»와 «위반이 없는 상태»가 구분되지 않는다(게이트 자신의 `soleLiteral` 규율).
 */
function gateForbiddenModules(packageName: string, gateSource: string = BUDGET_GATE): string[] {
  const entry = new RegExp(
    `name:\\s*"${packageName}"[\\s\\S]*?forbiddenModules:\\s*(\\[[\\s\\S]*?\\]|IO_MODULES)`,
  ).exec(gateSource);
  if (entry === null) {
    throw new Error(`게이트에서 ${packageName} 항의 forbiddenModules를 뽑지 못했다`);
  }
  const body = entry[1] ?? "";
  const source =
    body === "IO_MODULES" ? (/IO_MODULES = \[([\s\S]*?)\]/.exec(gateSource)?.[1] ?? "") : body;
  const modules = [...source.matchAll(/"([^"]+)"/g)].map((match) => match[1] as string);
  if (modules.length === 0) {
    throw new Error(`${packageName} 항의 forbiddenModules에서 모듈을 1건도 뽑지 못했다`);
  }
  return modules.sort();
}

/** 문서 한 줄에서 백틱으로 감싼 토큰을 뽑는다 */
function backticked(line: string): string[] {
  return [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1] as string);
}

/** `이름?: 타입` 꼴에서 필드 이름과 선택성을 뽑는다 — 주석 줄은 건너뛴다 */
function interfaceFields(block: string): { name: string; optional: boolean }[] {
  const fields: { name: string; optional: boolean }[] = [];
  for (const raw of block.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;
    const match = /^([A-Za-z_$][\w$]*)(\??)\s*:/.exec(line);
    if (match) fields.push({ name: match[1] as string, optional: match[2] === "?" });
  }
  return fields;
}

/** `interface <이름> {` 부터 짝이 맞는 `}` 직전까지 */
function interfaceBody(source: string, name: string): string {
  const start = source.indexOf(`interface ${name} {`);
  if (start === -1) throw new Error(`${name} 인터페이스를 찾지 못했다`);
  const end = source.indexOf("\n}", start);
  if (end === -1) throw new Error(`${name} 인터페이스의 끝을 찾지 못했다`);
  return source.slice(start, end);
}

describe("PROVIDERS §2.1 금지 모듈 ↔ 예산 게이트 `providers` 항", () => {
  /**
   * §2.1의 문면. **문서가 정본이므로 기대값은 여기서만 나온다.**
   * §2.1이 든 표기 규칙(«표기는 게이트 키 형태(`node:` 접두)로 쓴다»)이 참이면 문서에서
   * 뽑은 문자열이 게이트 키와 **그대로** 같아야 한다 — 정규화 없이 대조하는 이유다.
   */
  const documented = (): string[] => {
    const line = PROVIDERS_DOC.split("\n").find((candidate) =>
      candidate.startsWith("**금지 모듈**:"),
    );
    if (line === undefined) throw new Error("§2.1의 금지 모듈 줄을 찾지 못했다");
    return backticked(line).sort();
  };

  it("집합이 같다", () => {
    expect(gateForbiddenModules("providers")).toEqual(documented());
  });

  it("문서 표기가 전부 게이트 키 형태(`node:` 접두)다", () => {
    // §2.1의 표기 규칙 자체가 계약이다. 접두가 빠진 항목은 게이트 키와 «다른 문자열»이라
    // 위 집합 대조가 통과해도 사람이 눈으로 맞춰야 하는 상태로 되돌아간다.
    for (const module of documented()) {
      expect(module.startsWith("node:"), `§2.1의 \`${module}\`에 node: 접두가 없다`).toBe(true);
    }
  });

  it("검사기가 어긋남을 실제로 잡는다 (역검증)", () => {
    // 위 두 검사가 통과만 확인하는 형태로 퇴화하지 않았음을 표본으로 고정한다.
    const injected = BUDGET_GATE.replace('      "node:dns",\n', "");
    const parsed = gateForbiddenModules("providers", injected);
    expect(parsed).not.toContain("node:dns");
    expect(parsed).not.toEqual(documented());
  });
});

describe("SESSION-STORE §1 금지 목록 ↔ 예산 게이트 `store` 항", () => {
  /**
   * §1의 문면은 맨 이름(`child_process`·`net`…)이고 게이트 키는 `node:` 접두다.
   * `PROVIDERS.md` §2.1은 2026-08-14에 표기를 게이트 키로 통일했으나 이 문서는 그 범위
   * 밖이었으므로(플랜 §8 결정 2), 여기서는 접두를 붙여 대조한다. **이 정규화가 필요한
   * 것 자체가 «문서↔게이트 대조가 눈으로만 된다»는 상태의 잔존이다.**
   */
  const documented = (): string[] => {
    const line = SESSION_STORE_DOC.split("\n").find((candidate) =>
      candidate.includes("store가 임포트하지 않는 모듈"),
    );
    if (line === undefined) throw new Error("§1의 금지 목록 줄을 찾지 못했다");
    // **열거는 첫 마침표에서 끝난다.** 같은 줄 뒤쪽이 «`node:fs`는 허용한다»를 들고
    // 있어서, 줄 전체의 백틱을 걷으면 허용 모듈이 금지 목록으로 섞여 들어온다
    // (이 파서의 초판이 실제로 그렇게 틀렸다).
    const enumeration = /임포트하지 않는 모듈:([^.]*)\./.exec(line);
    if (enumeration === null) throw new Error("§1의 금지 열거 구간을 끊지 못했다");
    const modules = backticked(enumeration[1] as string).map((module) =>
      module.startsWith("node:") ? module : `node:${module}`,
    );
    if (modules.length === 0) throw new Error("§1의 금지 열거에서 모듈을 1건도 뽑지 못했다");
    return modules.sort();
  };

  it("문서가 든 금지 모듈이 전부 게이트에 있다", () => {
    const gate = gateForbiddenModules("store");
    for (const module of documented()) {
      expect(gate, `SESSION-STORE §1의 ${module}이 게이트 store 항에 없다`).toContain(module);
    }
  });

  it("`node:fs`·`node:sqlite`는 금지되지 않는다 — store의 본업이다", () => {
    // §1: «`node:fs`는 허용한다 — 디렉터리 생성과 권한 확인에 필요하다» · 의존성 줄이
    // `node:sqlite`(내장)를 든다. 게이트를 넓히다 본업을 막는 회귀를 여기서 고정한다.
    const gate = gateForbiddenModules("store");
    expect(gate).not.toContain("node:fs");
    expect(gate).not.toContain("node:sqlite");
  });

  it("검사기가 누락을 실제로 잡는다 (역검증)", () => {
    // T-004가 처분한 형태가 «문서가 든 `dns`를 게이트가 안 든다»였다. 그 형태를 표본으로
    // 재현해, 이 대조가 통과만 확인하는 검사로 퇴화하지 않았음을 고정한다.
    const injected = gateForbiddenModules("store").filter((module) => module !== "node:dns");
    expect(documented()).toContain("node:dns");
    expect(injected).not.toContain("node:dns");
  });

  it("게이트가 문서보다 넓은 항에는 근거 주석이 있다", () => {
    // 문서에 없는 금지를 게이트가 들면, 근거가 없는 한 다음 감사가 «게이트가 틀렸다»와
    // «문서가 낡았다» 중 어느 쪽인지 알 수 없다. store 항은 `dgram`·`worker_threads`가
    // 그 자리다.
    const entry = /name:\s*"store"[\s\S]*?forbiddenModules:/.exec(BUDGET_GATE)?.[0] ?? "";
    const wider = gateForbiddenModules("store").filter((m) => !documented().includes(m));
    expect(wider.sort()).toEqual(["node:dgram", "node:worker_threads"]);
    for (const module of wider) {
      expect(entry, `${module}이 문서 밖 금지인데 주석이 그것을 밝히지 않는다`).toContain(
        module.replace("node:", ""),
      );
    }
  });
});

describe("PROVIDERS §2.2 `AnthropicClientConfig` 블록 ↔ `client.ts`", () => {
  const docFields = (): { name: string; optional: boolean }[] =>
    interfaceFields(interfaceBody(PROVIDERS_DOC, "AnthropicClientConfig"));
  const srcFields = (): { name: string; optional: boolean }[] =>
    interfaceFields(interfaceBody(CLIENT_SRC, "AnthropicClientConfig"));

  it("필드 이름과 선택성이 1:1이다", () => {
    const key = (field: { name: string; optional: boolean }) =>
      `${field.name}${field.optional ? "?" : ""}`;
    expect(docFields().map(key).sort()).toEqual(srcFields().map(key).sort());
  });

  it("§2.2가 «유일한 입구»라 부르는 필드가 `apiKey`이고 필수다", () => {
    // 블록이 §2.2의 «유일한 입구» 주장의 근거이므로, `apiKey`가 선택 필드가 되면 그
    // 주장이 무너진다 — SDK의 환경 변수 폴백이 열리기 때문이다.
    expect(srcFields()).toContainEqual({ name: "apiKey", optional: false });
    expect(docFields()).toContainEqual({ name: "apiKey", optional: false });
  });

  it("검사기가 필드 누락을 실제로 잡는다 (역검증)", () => {
    // D-1이 정확히 «문서 블록에 필드 하나가 없다»는 형태였다. 그 형태를 표본으로 재현한다.
    const stripped = interfaceBody(PROVIDERS_DOC, "AnthropicClientConfig")
      .split("\n")
      .filter((line) => !line.includes("fetch?"))
      .join("\n");
    expect(interfaceFields(stripped).map((f) => f.name)).not.toContain("fetch");
    expect(interfaceFields(stripped).length).toBe(srcFields().length - 1);
  });
});

describe("DOC-CITATION U-1 — 이 사이클이 들여온 인용의 문면 일치", () => {
  /**
   * 대상은 `PROVIDERS.md` §2.2가 **§2.1을 지목하며** 인용부호로 감싼 문면이다.
   * U-1: «인용부호로 감싼 문면은 대상 문서에 문자 그대로 존재하는 부분 문자열이어야 한다».
   * D-6에 따라 이 규칙은 `docs/*.md` 안에 쓰인 인용에 걸리므로 대상 자리가 맞다.
   *
   * **처분됨 (2026-08-14).** 이 절은 T-008이 red로 제출했고, §2.2가 «네트워크는 SDK를
   * 경유한다»로 종결형 의역을 하고 있었다. 처분은 **인용부호를 벗겨 서술로 바꾸는 것**이었고
   * (§2.1의 원문은 «…경유하고, 그 밖의 I/O는…»이라 종결형 부분 문자열이 존재하지 않는다),
   * 그래서 그 항목은 목록에서 빠졌다 — 인용이 사라졌으므로 대조할 대상이 없다.
   *
   * **목록이 손으로 유지된다는 것이 이 절의 약점이다.** 새 인용이 §2.2에 추가되면 여기
   * 등록되지 않는 한 안 걸린다. 인용 자리를 문서에서 열거하는 것은 `check-doc-citation.mjs`의
   * 범위이고, 그쪽은 형식만 보고 문면 일치는 보지 않는다(`DOC-CITATION.md` §4가 그 경계를
   * 명시한다). 이 간격의 처분은 별건이다.
   */
  const cited = (quote: string): void => {
    const occurrences = PROVIDERS_DOC.split(quote).length - 1;
    expect(
      occurrences,
      `«${quote}»가 인용 자리 밖(원문)에 존재하지 않는다 — 인용 자리 자신만 ${occurrences}건`,
    ).toBeGreaterThan(1);
  };

  it("«스스로 크리덴셜을 읽지 않는다» — §2.2 자기 문면", () => {
    cited("스스로 크리덴셜을 읽지 않는다");
  });

  it("«유일한 입구» — §2.2 코드블록 주석", () => {
    cited("유일한 입구");
  });

  it("의역이 다시 들어오지 않는다 — §2.1의 종결형 변형", () => {
    // 처분된 위반의 재발 방어. 이 문자열은 §2.1 원문에 없으므로 문서 어디에도
    // 나타나서는 안 된다 — 나타나면 누군가 다시 종결형으로 의역한 것이다.
    expect(PROVIDERS_DOC).not.toContain("네트워크는 SDK를 경유한다");
  });
});
