/**
 * 예산 게이트 ↔ 설계 문서 금지 목록 — 전 패키지 대조 (QA 독립 검증 · T-003).
 *
 * **재는 것 하나뿐이다**: 게이트(`scripts/check-core-budget.mjs`)의 `forbiddenModules`가
 * 막는 모듈 집합과, 그 패키지의 설계 문서가 명시 열거한 금지 모듈 집합이 **열한 패키지
 * 전부에서 같은가**. 양방향이다 — 한 방향(문서 ⊆ 게이트)만 재면 문서가 낡는 것을 못 잡는다.
 *
 * ---
 *
 * ## 자리가 `packages/cli/test/`인 이유
 *
 * 이 검사는 한 패키지가 아니라 **열한 패키지 전부와 게이트**를 대상으로 하는 **횡단 검사**다.
 * 같은 성격의 횡단 검사가 이미 이 디렉터리에 산다 — `doc-status.contract.test.ts`(문서 지위
 * 선언 전체) · `distribution-supply-chain.contract.test.ts`(게이트 자신의 강제가 살아 있는가).
 * `providers/test/`에 두면 그 패키지 것이 아닌 열 패키지의 계약을 그 패키지가 소유하게 된다.
 *
 * `cli` 패키지의 `src/`는 이 파일이 임포트하지 않는다 — 자리만 여기이고 대상은 레포 전체다.
 *
 * ---
 *
 * ## 기대값의 출처 — 구현이 아니다
 *
 * - **게이트 쪽**: `scripts/check-core-budget.mjs` 원문의 `PACKAGES`(`IO_MODULES` 참조는 전개).
 * - **문서 쪽**: 아래 `DOC_BY_PACKAGE`가 드는 열한 문서의 **금지 선언 줄**.
 * - **추출 규약**: `plans/20260824-budget-gate-parity-plan.md` §9.1 R-1~R-8.
 * - **방향의 근거**: `docs/ARCHITECTURE.md` §2.6 — 못 찾은 것은 통과가 아니라 검사가 죽은 것이다.
 *
 * 규약 여덟을 코드가 어디서 지는지:
 *
 * | 규약 | 이 파일의 자리 |
 * |---|---|
 * | R-1 앵커 — `- **금지 모듈**: `로 정확히 시작하는 줄 | `ANCHOR` · `documentedForbidden` ② |
 * | R-2 모수 — 그 줄의 백틱 스팬 **전부**(첫 마침표에서 끊지 않는다) | `backticked` |
 * | R-3 그 줄에 금지 모듈 외의 백틱이 없다 | 집합 동일성이 흡수한다(아래 R-3의 강제자 문단) |
 * | R-4 표기는 `node:` 접두 | 축 3 |
 * | R-5 근거 문장은 다음 줄(들) | 강제 대상 아님 — R-3의 결과로 따라온다 |
 * | R-6 문서당 정확히 하나(0도 2 이상도 실패) | `documentedForbidden` ① |
 * | R-7 앵커는 `**금지 내장 모듈**`과 다른 문자열(오늘 그 형태를 쓰는 문서는 0건) | 축 5 역검증 ④ |
 * | R-8 매핑표가 게이트 `PACKAGES`와 1:1 | 축 2 |
 * | R-9 계수는 느슨하게 · 추출은 엄격하게 · 중복은 실패 | `LOOSE_ANCHOR` · `documentedForbidden` ①②③ |
 *
 * **R-9는 2026-08-24 판정이다.** T-003이 `[미규정]`으로 올린 셋(U-1 들여쓴 앵커 · U-2 중복 백틱 ·
 * U-3 콜론 뒤 공백 없음)에 대한 답이고, 셋 다 **오늘 실물에서 위반 0건이라 조용히 지나가던**
 * 자리였다. 계수와 추출을 다른 술어로 가르는 것이 이 규약의 전부다 — 하나로 두면 「거의 앵커」인
 * 줄이 양쪽 모두에 안 잡혀 무시된다.
 *
 * **R-3의 강제자는 별도 단정이 아니라 집합 동일성이다.** 금지 모듈 아닌 백틱이 그 줄에 있으면
 * 모수에 섞여 들어와 게이트 집합과 갈리므로 축 1이 붉어진다. 오늘 `CLI-INTERFACE.md` §1이
 * 정확히 그 상태다(허용 모듈·닫힌 목록 예시가 같은 줄에 있어 모수가 15가 된다).
 *
 * ---
 *
 * ## 「11」은 세 자리를 묶는 결합이다
 *
 * `EXPECTED_PACKAGE_COUNT`가 11이 아니면 이 파일이 스스로 실패한다. 패키지가 늘거나 줄면
 * **넷을 함께 고쳐야 한다**: ① 게이트의 `PACKAGES` ② 그 패키지의 설계 문서(앵커 줄 신설)
 * ③ 아래 `DOC_BY_PACKAGE` 매핑 ④ 이 상수. 넷 중 하나만 고치면 나머지가 조용히 낡는다 —
 * 특히 ③을 빠뜨리면 새 패키지가 **대조 없이 통과**한다. 그 침묵을 막으려고 상수가 있다.
 *
 * 그래서 **패키지 이름 목록을 하드코딩하지 않는다.** 모수는 게이트 원문에서 뽑고, 매핑표는
 * 그 모수와 1:1임을 축 2가 잰다(게이트 자신이 `discoverManifests`에서 쓰는 규율과 같다).
 *
 * ---
 *
 * ## 이 파일이 증명하지 **않는** 것
 *
 * 1. **허용 목록 축을 재지 않는다.** `CLI-INTERFACE.md` §1의 닫힌 허용 목록(그 여집합을
 *    금지로 읽으면 `cli`는 `node:dns`도 금지다)은 **다른 축**이고 2026-08-11에 판정됐으며
 *    재는 기계가 `package-boundary.contract.test.ts` 축 3에 따로 있다. 여기의 모수는 문서의
 *    **명시 금지 열거**뿐이다.
 * 2. **서브패스를 재지 않는다.** 게이트는 정확 문자열 대조라 `node:fs/promises` 계열이 어느
 *    항에도 안 걸린다. 문서·게이트·경계 테스트 세 층의 기준이 갈려 있는 자리이고, 이 파일은
 *    문서 ↔ 게이트만 붙인다.
 * 3. **금지가 옳은가를 재지 않는다.** 두 자리가 같은 것을 말하는지만 잰다. 어떤 모듈을 막을
 *    근거가 있는가는 설계 판단이지 이 검사의 물음이 아니다.
 * 4. **게이트가 실제로 임포트를 잡는가를 재지 않는다.** 그것은 게이트 자신의 일이고, 그 강제가
 *    살아 있는지는 `distribution-supply-chain.contract.test.ts`가 든다. 여기는 **선언 대 선언**이다.
 * 5. **의존성 예산(`dependencies`) 축을 재지 않는다.**
 *
 * ---
 *
 * ---
 *
 * ## `DOC-CITATION.md` §6 U-b — 이 파일이 지는 인용 계약 (강제 선언)
 *
 * 이 파일은 각 패키지의 `test/` 디렉터리(U-b가 자리라 부르는 것)에 산다. §6 U-b의 2026-08-17
 * 판정이 **대조 축**(U-1 ·
 * D-1 · D-2)이 걸리는 자리를 이 디렉터리까지 넓혔고, 2026-08-19 판정이 그 강제를 게이트가
 * 아니라 **각 파일 자신의 머리**에 두었다. **이 덩어리가 그 선언이다.**
 *
 * **무엇을 인용하나.** 이 파일이 가리키는 자리는 셋이다.
 *
 * 1. `docs/` 아래 설계 문서 — 아래 `DOC_BY_PACKAGE`가 드는 열한 건과 `ARCHITECTURE.md` §2.6.
 *    **가리키기만 하고 문면을 옮겨 적지 않는다** — 이 검사가 재는 것은 문면이 아니라 그
 *    문서에서 뽑은 **집합**이고, 그 추출은 런타임에 원문을 읽어서 한다(`documentedForbidden`).
 * 2. 게이트 원문 `scripts/check-core-budget.mjs` — 같은 이유로 런타임에 읽는다.
 * 3. 추출 규약이 사는 `plans/20260824-budget-gate-parity-plan.md` §9.1(R-1~R-9).
 *
 * 지목은 전부 **경로·§번호·규칙 이름의 코드 표기**로 한다. **줄번호를 쓰지 않는다** — 그 축
 * (§3.1)의 범위를 위 판정이 정하지 않았으나, 이 파일이 가리키는 세 자리는 전부 정정 주석이
 * 쌓이며 자라는 대상이라 줄번호가 밀린다.
 *
 * **어느 축이 걸리나.** 대조 축뿐이다 — 인용부호로 감싼 문면은 코퍼스에 문자 그대로 있어야
 * 한다(U-1). 형식 축(D-3 · D-4 · D-5)과 줄번호 축(§3.1)은 그 판정이 넓히지 않았으므로 이
 * 자리에 안 걸린다. 다만 **형식 축 미확장이 대조 면제는 아니다**(2026-08-18 판정).
 *
 * **그래서 이 파일의 주석은 인용부호를 쓰지 않는다.** 회피가 아니라 대조 축을 지키는 가장 싼
 * 방법이다 — 위 1·2가 문면을 옮겨 적지 않는 구조라 대조에 걸릴 인용부호가 애초에 설 자리가
 * 없다. 옮겨 적을 일이 생기면 그때는 인용부호를 쓰고 코퍼스와 문자 그대로 맞추는 것이 계약이지,
 * 인용부호를 피하는 것이 계약인 것은 아니다. **이 선언 자신도 인용부호를 새로 들이지 않는다.**
 *
 * **강제는 이 머리가 지고, 그것이 실재하는지는 다른 파일이 잰다** —
 * `packages/providers/test/ub-guard-scope.qa.test.ts`가 자리 전량을 훑어 머리 덩어리의 선언을
 * 실단언으로 든다. 그 축이 이 파일을 붉힌 것이 이 절이 선 계기다(2026-08-24).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

/**
 * 게이트를 **텍스트로** 읽는다. 임포트하지 않는 이유는 `check-core-budget.mjs`가 exports 없는
 * 실행 스크립트이고 최상위에서 `process.exit(1)`을 부르기 때문이다 — 임포트하면 게이트가 붉은
 * 날에 이 워커가 통째로 죽고, 진단이 계약 위반이 아니라 테스트 파일 소실로 나타난다.
 */
const BUDGET_GATE = read("../../../scripts/check-core-budget.mjs");

/**
 * `.mjs` 원문에서 주석을 지운다 — 지운 자리는 **같은 길이의 공백**, 줄바꿈은 남긴다.
 *
 * **왜 필요한가**: 텍스트로 읽으면 주석에 적힌 옛 목록이 실물 선언보다 앞설 때 대조가 실물이
 * 아니라 주석을 본다. 2026-08-22 실측이 두 방향을 다 재현했다 — 게이트가 `node:dns` 금지를
 * 실제로 잃었는데 주석에 남은 옛 목록이 집합 대조를 그대로 통과시켰고(조용한 통과), 반대로
 * 아무 효력 없는 주석 한 줄이 통과하던 대조를 붉혔다(오탐). 이 게이트 파일은 항마다 근거를
 * 산문으로 길게 다는 형태라 그 위험이 특히 크다 — `forbiddenModules:`라는 문자열이 주석에
 * 적히기만 해도 아래 lazy 정규식이 그것을 문다.
 *
 * **`typescript` 파서를 끌어오지 않는다** — 공유 렉서(`scripts/comment-lexer.mjs`)가 그것을
 * 임포트하고 순비용 3.5배가 실측됐다(`plans/20260823-check-core-budget-verify-report.md` §4).
 * 게이트 자신도 같은 이유로 손으로 만든 스캐너를 쓴다.
 *
 * **한계를 정직하게 적는다**: 문자열·정규식 리터럴 안의 `//`·`/*`를 문법으로 모른다. 오인하면
 * 덜 지우거나 더 지우는데, **두 방향 다 드러난다** — 덜 지우면 주석의 모듈명이 모수에 섞여
 * 집합 대조가 붉고, 더 지우면 대상 슬라이스가 사라져 아래 `throw`가 선다. 조용히 통과하는
 * 방향이 없다(`docs/ARCHITECTURE.md` §2.6).
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (chunk) => chunk.replace(/[^\n]/g, " "));
}

/** 주석 벗긴 게이트 원문 — 아래 두 추출이 같은 텍스트를 본다 */
const GATE_CODE = stripComments(BUDGET_GATE);

/**
 * 게이트 `PACKAGES`의 항 이름을 **원문에서** 뽑는다. 이름 목록을 하드코딩하지 않는 것이
 * 이 검사의 모수 규율이다 — 하드코딩하면 패키지가 늘 때 새 항이 조용히 대조 밖에 선다.
 *
 * 0건이면 던진다. 항 이름의 표기가 바뀌어 검사가 죽은 상태와 위반이 없는 상태는 구분되지
 * 않으므로 0건은 통과가 아니다(게이트 자신의 `soleLiteral` 규율과 같다).
 */
function gatePackageNames(gateCode: string = GATE_CODE): string[] {
  const names = [...gateCode.matchAll(/name:\s*"([^"]+)"/g)].map((match) => match[1] as string);
  if (names.length === 0) {
    throw new Error(
      "게이트에서 PACKAGES 항 이름을 1건도 뽑지 못했다 — 0건은 통과가 아니라 검사가 죽은 것이다",
    );
  }
  return names;
}

/**
 * 게이트의 한 패키지 항이 막는 모듈 집합. `IO_MODULES` 참조는 전개한다.
 *
 * 뽑지 못하면 `[]`가 아니라 던진다 — 0건을 통과로 읽으면 항 이름이 바뀌어 검사가 조용히 죽은
 * 상태와 금지가 비어 있는 상태가 구분되지 않는다.
 */
function gateForbidden(packageName: string, gateCode: string = GATE_CODE): string[] {
  const entry = new RegExp(
    `name:\\s*"${packageName}"[\\s\\S]*?forbiddenModules:\\s*(\\[[\\s\\S]*?\\]|IO_MODULES)`,
  ).exec(gateCode);
  if (entry === null) {
    throw new Error(`게이트에서 ${packageName} 항의 forbiddenModules를 뽑지 못했다`);
  }
  const body = entry[1] ?? "";
  const source =
    body === "IO_MODULES" ? (/IO_MODULES = \[([\s\S]*?)\]/.exec(gateCode)?.[1] ?? "") : body;
  const modules = [...source.matchAll(/"([^"]+)"/g)].map((match) => match[1] as string);
  if (modules.length === 0) {
    throw new Error(`게이트 ${packageName} 항의 forbiddenModules에서 모듈을 1건도 뽑지 못했다`);
  }
  return sortedSet(modules);
}

/**
 * R-8 — 패키지 → 문서 매핑. **이 표는 검사가 스스로 든다.**
 *
 * 게이트에는 문서 경로가 없고 문서에는 패키지 이름이 없으므로 둘을 잇는 표가 어딘가에 있어야
 * 하는데, 그 표가 낡으면 대조가 엉뚱한 문서를 본다. 그래서 축 2가 이 표와 게이트 `PACKAGES`의
 * 1:1을 잰다 — 표에만 있는 항도, 게이트에만 있는 항도 실패다.
 *
 * §번호는 대조 대상 절의 주소이고, 실제 추출은 문서 전체에서 앵커 줄을 찾는다(R-1). 절 안으로
 * 범위를 좁히지 않는 이유는 R-6이 문서당 하나를 요구하기 때문이다 — 절 밖에 같은 형태의 줄이
 * 생기면 그것 자체가 실패여야 하고, 절로 좁히면 그 줄이 보이지 않는다.
 */
const DOC_BY_PACKAGE: Readonly<
  Record<string, { readonly file: string; readonly section: string }>
> = {
  core: { file: "CORE-INTERFACE.md", section: "§1" },
  providers: { file: "PROVIDERS.md", section: "§2.1" },
  tools: { file: "TOOLS-INTERFACE.md", section: "§1" },
  gate: { file: "APPROVAL-GATE.md", section: "§1" },
  compaction: { file: "COMPACTION.md", section: "§1" },
  web: { file: "WEB-ACCESS.md", section: "§2" },
  sandbox: { file: "SANDBOX.md", section: "§2" },
  memory: { file: "MEMORY.md", section: "§4.4" },
  cli: { file: "CLI-INTERFACE.md", section: "§1" },
  store: { file: "SESSION-STORE.md", section: "§1" },
  serve: { file: "WEB-UI.md", section: "§2.2" },
};

/**
 * 게이트 항 수와 매핑 항 수가 함께 걸리는 상수. 위 머리의 결합 문단이
 * 이 값을 고칠 때 무엇을 함께 고쳐야 하는지를 든다.
 */
const EXPECTED_PACKAGE_COUNT = 11;

/**
 * R-1 — 앵커. 뒤의 공백 한 칸까지가 앵커다. **추출**은 이 문자열로 정확히 시작하는 줄만 읽는다.
 *
 * R-7 — `**금지 내장 모듈**`은 이 문자열과 갈린다. **2026-08-25 정정**: 이 자리는
 * `docs/WEB-UI.md`에 그 형태의 아홉 열거가 살아 있고 그 패키지는 게이트 `PACKAGES` 밖이라고
 * 적고 있었는데, 같은 날 두 절이 함께 거짓이 됐다 — 그 문서가 앵커를 이 문자열로 개명했고
 * (`WEB-UI.md` §2.2의 2026-08-25 개정 항) `serve`가 `PACKAGES`에 들어왔다. **규약은 남는다**:
 * 오늘 그 형태를 쓰는 문서가 0건이라는 것이 앞으로도 0건이라는 뜻은 아니고, 느슨한 계수
 * 술어가 그 형태로 넓어지면 「거의 앵커」가 조용히 모수에 섞인다. 축 5 역검증 ④가 그 경계를
 * 합성 표본으로 고정한다.
 */
const ANCHOR = "- **금지 모듈**: ";

/**
 * R-9 — **계수 술어는 느슨하다.** 들여쓰기가 있어도, 콜론 뒤 공백이 없어도 **센다.**
 *
 * 추출 술어(`ANCHOR`의 엄격 `startsWith`)와 **일부러 다르다.** 둘이 같으면 「거의 앵커」인 줄이
 * 계수에도 안 잡히고 추출에도 안 잡혀 **조용히 무시**된다 — 그 침묵이 이 규약이 닫는 자리다.
 * 느슨한 계수가 1이 아니면 실패이고, 그 하나가 엄격 술어에 안 맞아도 실패다.
 *
 * **2026-08-24 판정** (`plans/20260824-budget-gate-parity-plan.md` §9.1 R-9). 이 자리는 T-003이
 * `[미규정]`으로 올린 U-1(들여쓴 앵커)·U-3(콜론 뒤 공백 없음)이었고, 그때 구현은 둘 다 엄격
 * 술어 하나로만 봐서 **문서에 최상위 앵커 하나 + 들여쓴 앵커 하나가 함께 있으면 들여쓴 쪽이
 * 계수에 안 잡혔다.** R-9가 계수와 추출을 갈라 그 경로를 닫는다.
 */
const LOOSE_ANCHOR = /^\s*- \*\*금지 모듈\*\*:/;

/** 문서 한 줄에서 백틱으로 감싼 토큰 전부 — R-2. **첫 마침표에서 끊지 않는다.** */
function backticked(line: string): string[] {
  return [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1] as string);
}

/** 중복을 접고 정렬한다 — 대조 단위는 **집합**이다(규약이 집합이라 부른다) */
function sortedSet(modules: readonly string[]): string[] {
  return [...new Set(modules)].sort();
}

/** R-9 — 느슨한 계수 술어에 맞는 줄들. 「거의 앵커」인 줄도 여기서는 센다 */
function looseAnchorLines(doc: string): string[] {
  return doc.split("\n").filter((line) => LOOSE_ANCHOR.test(line));
}

/**
 * 문서가 명시 열거한 금지 모듈 집합. 실패 갈래가 넷이고 **전부 던진다** — 조용히 `[]`를 돌려주면
 * 검사가 대상을 놓친 상태와 위반이 없는 상태가 구분되지 않는다(`docs/ARCHITECTURE.md` §2.6).
 *
 * 1. **R-6·R-9 — 느슨한 계수가 1이 아니다.** 0건은 통과가 아니라 검사가 죽은 것이고, 2건 이상이면
 *    다른 패키지의 금지를 재서술한 줄과 그 패키지 자신의 줄이 구별되지 않는다.
 * 2. **R-9 — 그 하나가 엄격 술어에 안 맞는다.** 계수는 통과했는데 추출이 못 읽는 상태이므로,
 *    그냥 넘기면 그 줄이 **조용히 무시**된다. 계수를 느슨하게 만든 목적이 정확히 이 갈래를
 *    보이게 하는 것이다.
 * 3. **R-2 — 백틱 스팬이 0건이다.**
 * 4. **R-2·U-2 판정 — 백틱에 중복이 있다.** 아래 문단 참조.
 *
 * **중복이 실패인 이유 (2026-08-24 판정 · §9.1 R-9).** R-2가 대조 단위를 집합이라 부르므로 중복을
 * 접어도 대조 결과는 같다. 그래서 T-003은 이 자리를 `[미규정]`으로 올렸다 — 접으면 문서의 중복
 * 열거가 **영원히 안 보이고**, 다중집합으로 재면 규약이 금지하지 않은 것을 red로 만든다. 판정은
 * 앵커 줄이 **닫힌 열거**라는 성격을 근거로 삼았다: 닫힌 열거에 같은 항이 두 번 있는 것은 그
 * 자체로 문서 결함이므로 red로 낸다. 대조는 여전히 집합으로 하되, **중복은 대조 전에** 걸린다.
 */
function documentedForbidden(packageName: string, docSource?: string): string[] {
  const mapped = DOC_BY_PACKAGE[packageName];
  if (mapped === undefined) {
    throw new Error(`${packageName}: DOC_BY_PACKAGE에 문서 매핑이 없다 — 대조할 정본이 없다`);
  }
  const where = `docs/${mapped.file} ${mapped.section}`;
  const doc = docSource ?? read(`../../../docs/${mapped.file}`);

  // R-9 ① 느슨한 계수 — 들여쓰기·콜론 뒤 공백을 가리지 않고 센다.
  const counted = looseAnchorLines(doc);
  if (counted.length !== 1) {
    throw new Error(
      `${where}: 앵커 줄이 ${counted.length}건이다(1건이어야 한다). ` +
        `계수는 ${LOOSE_ANCHOR.source}에 맞는 줄을 전부 세므로 들여쓴 줄도 콜론 뒤 공백이 없는 ` +
        `줄도 여기 든다(R-9). 0건은 통과가 아니라 검사가 죽은 것이고, 2건 이상이면 어느 줄이 ` +
        `${packageName}의 것인지 구별되지 않는다`,
    );
  }

  // R-9 ② 엄격 추출 — 계수된 그 하나가 앵커 문자열로 정확히 시작해야 한다.
  const line = counted[0] as string;
  if (!line.startsWith(ANCHOR)) {
    throw new Error(
      `${where}: 앵커 줄 1건을 셌으나 엄격 술어에 맞지 않는다 — 줄머리가 ` +
        `${JSON.stringify(ANCHOR)}(들여쓰기 0 · 콜론 뒤 공백 1)이어야 한다(R-9). ` +
        `실물: ${JSON.stringify(line.slice(0, ANCHOR.length + 2))}`,
    );
  }

  const modules = backticked(line);
  if (modules.length === 0) {
    throw new Error(`${where}: 앵커 줄에서 백틱 스팬을 1건도 뽑지 못했다`);
  }

  // R-9 ③ 중복 — 닫힌 열거에 같은 항이 두 번 있는 것은 문서 결함이다.
  const deduped = sortedSet(modules);
  if (deduped.length !== modules.length) {
    const repeated = sortedSet(modules.filter((m, at) => modules.indexOf(m) !== at));
    throw new Error(
      `${where}: 앵커 줄의 백틱에 중복이 있다 — ${JSON.stringify(repeated)}. ` +
        `대조는 집합으로 하지만 중복은 대조 전에 걸린다(R-9): 접으면 문서의 중복 열거가 ` +
        `영원히 안 보인다`,
    );
  }
  return deduped;
}

/**
 * 모수는 **게이트 원문**이다. 이 배열이 비면 위 `gatePackageNames`가 이미 던졌다.
 *
 * 모듈 스코프에서 뽑는 이유는 아래 축 1이 패키지마다 `describe`를 세우기 때문이다 — 그래야
 * 어느 패키지 항이 붉은지가 **행마다** 보인다. 이 자리가 던지면 파일이 수집 단계에서 죽는데,
 * 그것도 fail-closed 방향이다(게이트를 못 읽는 상태를 통과로 읽지 않는다).
 */
const GATE_PACKAGES = gatePackageNames();

/* ------------------------------------------------------------------------ *
 * 축 1 — 항별 양방향 집합 동일성 (이 파일의 본론)
 * ------------------------------------------------------------------------ */

describe("금지 모듈 집합 — 설계 문서 ↔ 예산 게이트", () => {
  for (const packageName of GATE_PACKAGES) {
    const mapped = DOC_BY_PACKAGE[packageName];
    const label =
      mapped === undefined ? "(문서 매핑 없음)" : `docs/${mapped.file} ${mapped.section}`;

    describe(`${packageName} ↔ ${label}`, () => {
      it("집합이 같다 (양방향)", () => {
        const gate = gateForbidden(packageName);
        const doc = documentedForbidden(packageName);
        // `toEqual`은 정렬된 두 배열을 그대로 대조하므로 A−B와 B−A가 **한 단정에서** 갈린다.
        // 한 방향만 재면(문서 ⊆ 게이트) 문서가 낡는 것을 못 잡는다.
        expect(doc, `${packageName}: 문서 열거와 게이트 forbiddenModules가 다르다`).toEqual(gate);
      });

      it("R-4 — 문서 표기가 전부 `node:` 접두다", () => {
        // 게이트는 임포트 지정자를 **정확 문자열**로 대조한다. 접두 없는 표기(`net`)는
        // 게이트 키와 다른 문자열이라, 집합 대조가 통과하더라도 사람이 눈으로 맞춰야 하는
        // 상태로 되돌아간다. 2026-08-14 `providers` V-1이 정확히 그 형태였다.
        for (const module of documentedForbidden(packageName)) {
          expect(module.startsWith("node:"), `${label}의 \`${module}\`에 node: 접두가 없다`).toBe(
            true,
          );
        }
      });
    });
  }
});

/* ------------------------------------------------------------------------ *
 * 축 2 — 모수 자체의 건전성 (R-8 · 「10」의 결합)
 * ------------------------------------------------------------------------ */

describe("모수 — 게이트 PACKAGES와 문서 매핑표", () => {
  it("게이트 항이 11개다", () => {
    // 이 수가 바뀌면 게이트·문서·매핑표·이 상수를 **함께** 고쳐야 한다(머리 참조).
    // 수만 고치고 나머지를 안 고치면 새 패키지가 대조 없이 통과한다.
    expect(GATE_PACKAGES).toHaveLength(EXPECTED_PACKAGE_COUNT);
  });

  it("R-8 — 매핑표와 게이트 PACKAGES가 1:1이다", () => {
    // 표에만 있는 항: 게이트에서 사라진 패키지를 계속 대조하는 상태.
    // 게이트에만 있는 항: 새 패키지가 **무대조**로 통과하는 상태 — 이쪽이 침묵 실패다.
    expect([...GATE_PACKAGES].sort()).toEqual(Object.keys(DOC_BY_PACKAGE).sort());
  });

  it("매핑표의 항 수도 11이다", () => {
    expect(Object.keys(DOC_BY_PACKAGE)).toHaveLength(EXPECTED_PACKAGE_COUNT);
  });

  it("게이트 항 이름에 중복이 없다", () => {
    // 중복이 있으면 `gateForbidden`의 lazy 정규식이 **첫 항**만 물어, 뒤 항의 금지가
    // 대조 밖에 선다. 오늘 0건이지만 그 침묵을 여기서 막는다.
    expect(GATE_PACKAGES).toEqual([...new Set(GATE_PACKAGES)]);
  });

  it("매핑표가 가리키는 문서가 전부 실재한다", () => {
    for (const [packageName, { file }] of Object.entries(DOC_BY_PACKAGE)) {
      expect(() => read(`../../../docs/${file}`), `${packageName}의 정본 ${file}`).not.toThrow();
    }
  });
});

/* ------------------------------------------------------------------------ *
 * 축 3 — 게이트 쪽 추출이 죽으면 던진다 (0건 ≠ 통과)
 * ------------------------------------------------------------------------ */

describe("게이트 추출 — 0건은 통과가 아니다", () => {
  it("항 이름을 1건도 못 뽑으면 던진다", () => {
    expect(() => gatePackageNames("const PACKAGES = [];")).toThrow(/1건도 뽑지 못했다/);
  });

  it("항은 있는데 forbiddenModules를 못 뽑으면 던진다", () => {
    expect(() => gateForbidden("core", 'name: "core", dependencies: ["zod"],')).toThrow(
      /뽑지 못했다/,
    );
  });

  it("forbiddenModules가 비면 던진다", () => {
    expect(() => gateForbidden("core", 'name: "core",\n forbiddenModules: [],')).toThrow(
      /1건도 뽑지 못했다/,
    );
  });

  it("IO_MODULES 참조를 전개한다", () => {
    // `core`·`gate`가 배열 리터럴이 아니라 참조로 적혀 있다. 전개하지 않으면 그 두 항이
    // 빈 집합이 되어 대조가 무의미해진다.
    const gate = gateForbidden("core");
    expect(gate).toContain("node:fs");
    expect(gate.length).toBeGreaterThan(1);
    expect(gateForbidden("gate")).toEqual(gate);
  });

  it("주석에 적힌 옛 목록을 모수로 삼지 않는다", () => {
    // 형제 파일(`packages/providers/test/docs-gate-parity.qa.test.ts`)의 머리가 든 실측:
    // 주석에 남은 옛 목록이 집합 대조를 그대로 통과시켰다. 그 형태를 표본으로 고정한다.
    const withStaleComment = [
      '// name: "core", forbiddenModules: ["node:없는것"],',
      'name: "core",',
      'forbiddenModules: ["node:fs"],',
    ].join("\n");
    expect(gateForbidden("core", stripComments(withStaleComment))).toEqual(["node:fs"]);
  });
});

/* ------------------------------------------------------------------------ *
 * 축 4 — 문서 쪽 추출 규약 (R-1 · R-2 · R-6 · R-7)
 * ------------------------------------------------------------------------ */

describe("문서 추출 규약 — R-1 · R-2 · R-6 · R-7", () => {
  it("R-6 — 앵커 줄이 0건이면 던진다", () => {
    expect(() => documentedForbidden("core", "금지 모듈이 산문으로만 적힌 문서다.\n")).toThrow(
      /앵커 줄이 0건이다/,
    );
  });

  it("R-6 — 앵커 줄이 2건이면 던진다", () => {
    const twice = [
      "- **금지 모듈**: `node:fs`",
      "본문 한 줄.",
      "- **금지 모듈**: `node:net`",
      "",
    ].join("\n");
    expect(() => documentedForbidden("core", twice)).toThrow(/앵커 줄이 2건이다/);
  });

  it("R-2 — 첫 마침표에서 끊지 않는다", () => {
    // 형제 파일의 `documented()` 파서가 오늘 첫 마침표까지로 끊는다. 그 절단이 남아 있으면
    // 근거 문장을 같은 줄에 쓰는 순간 열거가 잘리고, 잘린 만큼이 조용히 대조 밖에 선다.
    const line = "- **금지 모듈**: `node:fs`. 그리고 `node:net`·`node:tls`\n";
    expect(documentedForbidden("core", line)).toEqual(["node:fs", "node:net", "node:tls"]);
  });

  it("R-1 — 줄머리가 아니면 앵커가 아니다", () => {
    // 문장 중간의 볼드(오늘 `TOOLS-INTERFACE.md` §1·`APPROVAL-GATE.md` §1의 형태)는 읽지
    // 않는다. 읽으면 앵커가 규약이 아니라 어림이 된다.
    const midSentence = "이 패키지는 - **금지 모듈**: `node:fs`를 임포트하지 않는다.\n";
    expect(() => documentedForbidden("core", midSentence)).toThrow(/앵커 줄이 0건이다/);
  });

  it("R-7 — `**금지 내장 모듈**` 형태의 줄은 읽지 않는다", () => {
    // 2026-08-25까지 `docs/WEB-UI.md`가 그 형태를 썼고, 같은 날 개명되어 오늘 그 형태를
    // 쓰는 문서는 0건이다. 그래도 이 단정은 남는다 — 술어가 그 형태로 넓어지는 회귀를
    // 막는 것이 R-7이고, 실물 표본이 사라졌다고 규약이 사라지지는 않는다.
    const other = "- **금지 내장 모듈**: `node:https`·`node:net`\n";
    expect(() => documentedForbidden("core", other)).toThrow(/앵커 줄이 0건이다/);
  });

  it("R-2 — 백틱이 0건이면 던진다", () => {
    expect(() => documentedForbidden("core", "- **금지 모듈**: 없음\n")).toThrow(
      /백틱 스팬을 1건도 뽑지 못했다/,
    );
  });

  it("R-9 — 계수는 느슨하고 추출은 엄격하다 (두 술어가 다르다)", () => {
    // 이 둘이 같은 술어면 「거의 앵커」인 줄이 계수에도 추출에도 안 잡혀 조용히 무시된다.
    // 술어가 갈려 있다는 것 자체를 표본으로 고정한다.
    const indented = "  - **금지 모듈**: `node:fs`";
    const noSpace = "- **금지 모듈**:`node:fs`";
    for (const line of [indented, noSpace]) {
      expect(LOOSE_ANCHOR.test(line), `계수 술어가 ${JSON.stringify(line)}을 놓친다`).toBe(true);
      expect(line.startsWith(ANCHOR), `추출 술어가 ${JSON.stringify(line)}을 받아들인다`).toBe(
        false,
      );
    }
    // 규약을 지킨 줄은 양쪽 다 통과한다 — 느슨함이 엄격함을 덮지 않는다.
    const conforming = "- **금지 모듈**: `node:fs`";
    expect(LOOSE_ANCHOR.test(conforming)).toBe(true);
    expect(conforming.startsWith(ANCHOR)).toBe(true);
  });

  it("매핑에 없는 패키지를 물으면 던진다", () => {
    // 축 2가 1:1을 재지만, 그 사이를 빠져나가도 여기서 라벨 있는 실패가 선다.
    expect(() => documentedForbidden("없는패키지", "- **금지 모듈**: `node:fs`\n")).toThrow(
      /문서 매핑이 없다/,
    );
  });
});

/* ------------------------------------------------------------------------ *
 * 축 5 — 역검증. 이 대조가 통과만 확인하는 형태로 퇴화하지 않았음을 고정한다.
 *
 * 일부러 위반을 심어 **실제로 잡히는지** 본다. 다섯 갈래를 전부 합성 표본으로 돌린다 —
 * 실물 `docs/`·게이트를 만지지 않으므로 원복이 필요 없다.
 * ------------------------------------------------------------------------ */

describe("역검증 — 심은 위반이 실제로 잡힌다", () => {
  const SAMPLE_GATE = [
    'name: "core",',
    'forbiddenModules: ["node:fs", "node:net", "node:tls"],',
  ].join("\n");
  const SAMPLE_DOC = "- **금지 모듈**: `node:fs`·`node:net`·`node:tls`\n";

  it("양성 대조군 — 안 건드린 표본은 같다", () => {
    // 위반 케이스만 있으면 무엇을 먹여도 갈리는 검사와 구별되지 않는다.
    expect(documentedForbidden("core", SAMPLE_DOC)).toEqual(gateForbidden("core", SAMPLE_GATE));
  });

  it("① 문서에서 모듈 하나를 빼면 갈린다", () => {
    const doc = "- **금지 모듈**: `node:fs`·`node:net`\n";
    expect(documentedForbidden("core", doc)).not.toEqual(gateForbidden("core", SAMPLE_GATE));
  });

  it("② 게이트에서 모듈 하나를 빼면 갈린다", () => {
    const gate = SAMPLE_GATE.replace('"node:tls", ', "").replace(', "node:tls"', "");
    expect(gateForbidden("core", gate)).not.toContain("node:tls");
    expect(documentedForbidden("core", SAMPLE_DOC)).not.toEqual(gateForbidden("core", gate));
  });

  it("③ 표기를 맨 이름으로 되돌리면 갈린다", () => {
    const doc = "- **금지 모듈**: `fs`·`net`·`tls`\n";
    const documented = documentedForbidden("core", doc);
    expect(documented).not.toEqual(gateForbidden("core", SAMPLE_GATE));
    // 축 1의 R-4 단정도 같은 표본에서 선다.
    expect(documented.every((module) => module.startsWith("node:"))).toBe(false);
  });

  it("④ 앵커 줄을 통째로 지우면 실패다 — 못 찾음은 통과가 아니다", () => {
    expect(() => documentedForbidden("core", SAMPLE_DOC.replace(ANCHOR, "- 금지: "))).toThrow(
      /앵커 줄이 0건이다/,
    );
  });

  it("⑤ 같은 형태의 줄을 하나 더 넣으면 실패다", () => {
    expect(() => documentedForbidden("core", SAMPLE_DOC + SAMPLE_DOC)).toThrow(/앵커 줄이 2건이다/);
  });

  it("⑥ 게이트에 항이 늘고 매핑표가 안 늘면 1:1이 깨진다", () => {
    // 새 패키지가 **무대조**로 통과하는 침묵 경로. 축 2가 그것을 잡는다.
    const grown = [...gatePackageNames(GATE_CODE), "새패키지"];
    expect([...grown].sort()).not.toEqual(Object.keys(DOC_BY_PACKAGE).sort());
  });

  /* -- R-9 판정(2026-08-24)이 새로 닫은 세 갈래 -------------------------------- *
   * 셋 다 판정 전에는 **조용히 지나가던** 경로다. ⑦은 무시됐고, ⑧은 0건으로 보고돼 사유가
   * 실제 원인과 갈렸으며, ⑨는 접혀서 안 보였다. 여기서 red가 나는 것이 판정의 이행이다. */

  it("⑦ 들여쓴 앵커를 하나 더하면 실패다 — 조용히 무시되지 않는다 (R-9 · U-1)", () => {
    // 판정 전 구현은 엄격 술어 하나로만 세어 이 표본을 **1건**으로 읽고 통과시켰다.
    // 느슨한 계수가 그 하나를 더 보므로 이제 2건이다.
    const withIndented = `${SAMPLE_DOC}  - **금지 모듈**: \`node:fs\`\n`;
    expect(() => documentedForbidden("core", withIndented)).toThrow(/앵커 줄이 2건이다/);
    // 역·역검증 — 엄격 술어만으로 세면 오늘도 1건이라 통과한다(닫힌 구멍의 표본).
    expect(withIndented.split("\n").filter((line) => line.startsWith(ANCHOR))).toHaveLength(1);
  });

  it("⑧ 콜론 뒤 공백을 빼면 실패다 — 0건이 아니라 엄격 술어 불일치로 (R-9 · U-3)", () => {
    const noSpace = SAMPLE_DOC.replace(ANCHOR, "- **금지 모듈**:");
    expect(() => documentedForbidden("core", noSpace)).toThrow(/엄격 술어에 맞지 않는다/);
    // 사유가 갈리는 것이 이 갈래의 값이다 — 판정 전에는 같은 표본이 앵커 0건으로 보고돼
    // 사람이 원인(공백 한 칸)에 도달하지 못했다.
    expect(() => documentedForbidden("core", noSpace)).not.toThrow(/앵커 줄이 0건이다/);
  });

  it("⑨ 같은 모듈을 두 번 쓰면 실패다 (R-9 · U-2)", () => {
    const duplicated = "- **금지 모듈**: `node:fs`·`node:fs`·`node:net`·`node:tls`\n";
    expect(() => documentedForbidden("core", duplicated)).toThrow(/백틱에 중복이 있다/);
    // 중복이 무엇인지가 메시지에 든다 — 없으면 긴 열거에서 사람이 찾아야 한다.
    expect(() => documentedForbidden("core", duplicated)).toThrow(/node:fs/);
    // 판정 전 동작(접기)이면 이 표본이 그대로 통과했음을 함께 고정한다.
    const folded = [...new Set(["node:fs", "node:fs", "node:net", "node:tls"])].sort();
    expect(folded).toEqual(gateForbidden("core", SAMPLE_GATE));
  });
});

/* ------------------------------------------------------------------------ *
 * 축 6 — 자리 규율. 이 파일이 어느 패키지의 `src/`도 임포트하지 않는다.
 * ------------------------------------------------------------------------ */

describe("자리 규율", () => {
  it("이 파일은 어느 패키지의 src/도 임포트하지 않는다", () => {
    // 횡단 검사가 한 패키지의 구현에 묶이면 그 패키지 것이 된다. 대조는 문서와 게이트
    // **원문**만으로 성립해야 한다.
    const self = read("./budget-gate-parity.qa.test.ts");
    const specifiers = [...stripComments(self).matchAll(/from\s*["']([^"']+)["']/g)].map(
      (match) => match[1] as string,
    );
    expect(specifiers.length).toBeGreaterThan(0);
    for (const specifier of specifiers) {
      expect(specifier, `${specifier}가 src/를 가리킨다`).not.toMatch(/src\//);
      expect(specifier, `${specifier}가 @neo-agent 패키지를 가리킨다`).not.toMatch(/^@neo-agent\//);
    }
  });
});
