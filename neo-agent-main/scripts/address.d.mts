/**
 * `address.mjs`(순수 판정)의 타입 선언.
 *
 * `.mjs`는 `tsconfig.json`의 include(`packages` 아래 `.ts`) 밖이라 타입체크를 받지 못한다.
 * 이 파일이 있어야 `packages/cli/test/address.contract.test.ts`가 판정 함수를 import할 수
 * 있다. 형태의 정본은 `docs/PUBLIC-TREE.md` §3.3이다.
 *
 * **이 파일은 구현 본문을 안 든다** — 값 선언(`declare`)과 타입뿐이다. 형제
 * `scripts/doc-citation.d.mts`·`scripts/doc-status.d.mts`와 같은 형태다.
 *
 * **신호를 내는 것은 타입체크가 아니라 계약 테스트다.** 이 레포는 `skipLibCheck`가 켜져
 * 있고 `.mjs`가 어느 `tsconfig`의 `include`에도 없어 **손으로 쓴 이 선언이 런타임 값과
 * 대조되지 않는다**(`DOC-CITATION.md` §3.4 P-6의 2026-08-16 정정과 같은 자리). 그래서
 * 위반 이름 집합처럼 «닫혔다»가 계약인 값은 런타임에서 재는 단언이 그 몫을 든다.
 */

/**
 * 코드 스팬 하나에서 뽑은 주소.
 *
 * **파일명이 이 타입에 없다** — 순수 판정은 소스 텍스트만 받으므로 파일명을 원리적으로
 * 만들 수 없다. 게이트 루프가 짝지어 출력한다(§3.3).
 */
export type Address = {
  readonly text: string;
  /** 1-기반. 출력용이며 판정에 쓰지 않는다. */
  readonly line: number;
};

/** §3.2 — 부류 셋. 이 유니온이 닫혀 있다는 것이 그 절의 불변이다. */
export type AddressClass = "public" | "internal" | "frozen";

/** §3.1 — 모집단에서 빠지는 사유 셋. 「주소가 아니다」의 갈래이지 위반이 아니다. */
export type NotAddressReason =
  /** 꺾쇠 자리표나 줄임표를 포함한다 — 규약이 표기 틀을 드는 자리다 */
  | "placeholder"
  /** 글롭 별표가 있는데 첫 별표 앞에 자를 경로 구분자가 없다 */
  | "glob-unanchored"
  /** 꼴 넷 어디에도 안 걸린다 — 오탐 0의 근거이자 §9 U-a의 자백이다 */
  | "no-form";

/**
 * §3.1의 꼴 넷. 숫자가 그 절 표의 행 순서이고, **작은 번호가 이긴다** — 꼴 ①이 꼴 ④를
 * 이기는 것(2026-09-03 유저 결정)과 §3.1이 *"비공개·동결 접두를 먼저 본다"*고 적은 것이
 * 한 순서로 표현된다.
 */
export type AddressForm = 1 | 2 | 3 | 4;

/**
 * 코드 스팬을 §3.1의 꼴로 읽은 결과.
 *
 * `prefixClass`는 **미해결의 처분만** 정한다(§3.2의 셋째 행). 부류는 착지가 정하므로
 * 판정이 성공한 자리에서는 이 값이 답이 아니다 — 유일한 예외가 미판정 갈래이고, 그때만
 * 접두가 부류를 대신 말한다.
 */
export type AddressRead =
  | { readonly ok: false; readonly reason: NotAddressReason }
  | {
      readonly ok: true;
      readonly form: AddressForm;
      /** 꼬리·글롭을 벗긴 경로. 꼴 ④에서는 맨 문서 이름 */
      readonly path: string;
      /** 꼴 ②·③에서 걸린 접두. 트리 실재를 묻는 키다. 꼴 ①·④에서는 접두 자체 또는 `null` */
      readonly prefix: string | null;
      readonly prefixClass: AddressClass;
      /** 꼬리에서 벗긴 절 번호(`§` 없음). `dead-section`이 쓴다 */
      readonly section: string | null;
      /** §3.4의 탈출 표기 `§<절번호>(구)`가 붙어 있었다 */
      readonly retired: boolean;
    };

/** 해결이 착지한 자리. `kind`가 «파일인가»를 들어야 그림자 판정이 파일에 한해 선다(§3.2). */
export type AddressLanding = {
  readonly path: string;
  readonly kind: "file" | "directory";
  readonly cls: AddressClass;
};

/**
 * §3.3 — 위반 여섯. **이 이름이 그대로 게이트 출력의 라벨이다.**
 *
 * **`DOC-CITATION.md`의 위반 유니온과 합치지 않는다** — 그쪽은 형식이고 이쪽은 존재다.
 * 한 유니온에 담으면 그 문서 §1이 자기 경계로 그어 둔 줄이 그 순간 거짓이 된다.
 */
export type AddressViolation =
  /** 공개 부류인데 공개 트리에서 해결되지 않는다 */
  | "dead-public"
  /** 비공개·동결 부류인데 그 트리가 있는데도 해결되지 않는다 */
  | "dead-record"
  /** 맨 문서 이름이 공개 트리의 파일명 색인에서 둘 이상에 걸린다 (§3.2) */
  | "ambiguous-basename"
  /** 착지 후보가 둘 이상인데 부류가 갈린다 (§3.2) */
  | "shadowed-address"
  /** 문서 이름 뒤의 `§<절번호>`가 그 문서에 없는 절이다 */
  | "dead-section"
  /** 최상위 진입점이 들지 않는 문서가 공개 트리의 문서 디렉터리에 있다 (§6) */
  | "unmapped-doc";

/**
 * 판정의 산출(§3.3).
 *
 * 미판정 갈래가 `ok: true`인 것은 «위반이 아니다»를 뜻할 뿐 «통과»가 아니다 — §3.5가
 * 게이트에 **미판정 수를 출력에 싣도록** 요구하는 근거다.
 */
export type AddressVerdict =
  /** 부류는 착지한 트리가 정한다 (§3.2) */
  | { readonly ok: true; readonly cls: AddressClass }
  /** 트리가 없어 해결을 물을 수 없었다. 통과가 아니라 계수 대상이고, 이 갈래에서만 부류를 접두가 준다 */
  | { readonly ok: true; readonly cls: AddressClass; readonly unjudged: true }
  | { readonly ok: false; readonly violation: AddressViolation; readonly detail: string };

/**
 * 트리 오라클. **둘인 것이 계약이다**(§3.2) — 공개 부류는 「추적되는가」로, 비공개·동결은
 * 작업 폴더의 실재로 묻는다. 하나로 합치면 재현본에서 죽는 주소가 작업 폴더에서만 초록이 된다.
 */
export type TreeProbe = (path: string) => "file" | "directory" | "absent";

/**
 * §3.2 — 미판정의 오라클. **디렉터리 접두만 원소가 된다** — 파일 접두는 자기 실재로
 * 「트리가 있는가」에 답할 수 없으므로 여기 안 들어오고, 그 부류의 판정이 이 집합에서
 * 파생된다(§3.3 타입 스케치 그대로).
 *
 * **접두 하나를 묻는 술어가 아니라 집합인 것이 계약이다**(§3.3) — 술어를 주입받는 꼴로
 * 두면 접두 단위 읽기를 언제든 다시 표현할 수 있고, 2026-09-04까지 실물이 정확히 그
 * 모양이었다. 부류 단위 파생을 순수 판정 쪽에 두어야 그 단위가 계약 테스트의 사정거리에 든다.
 */
export type PresentTrees = ReadonlySet<string>;

/**
 * 판정에 필요한 트리 지식 전부. **이 모듈은 트리를 안 읽는다** — 실행부
 * (`scripts/check-address.mjs`)가 이 값을 만들어 넘긴다.
 */
export type AddressContext = {
  /** 인용한 문서의 레포 루트 기준 경로. 해결 순서의 첫 자리를 정한다 */
  readonly docPath: string;
  /** 공개 트리 — 추적 목록으로 답한다 */
  readonly probePublic: TreeProbe;
  /** 비공개·동결 트리 — 작업 폴더의 실재로 답한다 */
  readonly probeRecord: TreeProbe;
  /**
   * 이 실행 환경에 실재하는 **디렉터리 접두**의 집합. 없으면 미판정이다(§3.2).
   *
   * 파일 접두는 원소가 아니다 — 그 부류의 디렉터리 접두 중 **하나라도** 이 집합에 있으면
   * 트리가 있는 것이고, 그 파생은 판정 모듈이 진다(§3.2 2026-09-04 확정 · §3.3).
   */
  readonly presentTrees: PresentTrees;
  /** 맨 이름 → 추적 경로들. 모집단은 `neo-agent-main/` 한정이다(2026-09-03 유저 결정) */
  readonly basenameIndex: ReadonlyMap<string, readonly string[]>;
  /** 착지한 문서의 절 번호 전부. `documentSections`가 만든다 */
  readonly sectionsOf: (path: string) => readonly string[];
};

/** §3.2 해결 순서의 둘째 자리. */
export declare const PRODUCT_TREE: string;

/** §3.2 — 비공개 기록 접두. 닫힌 목록이고 정본은 그 절의 표다. */
export declare const PRIVATE_RECORD_PREFIXES: readonly string[];

/** §3.2 — 동결 레퍼런스 트리. `DOC-CITATION.md` §3.1이 든 값과 같다. */
export declare const FROZEN_TREES: readonly string[];

/**
 * §3.5 fail-closed 넷째 그물의 재료 — 접두 목록에 디렉터리 꼴이 하나라도 있는가.
 *
 * **대상은 설정 목록(`PRIVATE_RECORD_PREFIXES`·`FROZEN_TREES`)이지 디스크가 아니다** —
 * 근거는 `address.mjs`의 같은 함수 주석과 `check-address.mjs`의 호출부 주석이 든다.
 */
export declare function hasDirectoryPrefix(prefixes: readonly string[]): boolean;

/** §3.3의 위반 여섯. 값이 그대로 게이트 출력의 라벨이다. */
export declare const VIOLATIONS: {
  readonly deadPublic: "dead-public";
  readonly deadRecord: "dead-record";
  readonly ambiguousBasename: "ambiguous-basename";
  readonly shadowedAddress: "shadowed-address";
  readonly deadSection: "dead-section";
  readonly unmappedDoc: "unmapped-doc";
};

/** 문서 머리의 범위. §1이 모집단에서 뺀 `- 근거:` 줄은 **머리의** 그 줄 하나다. */
export declare const HEAD_LINE_LIMIT: number;

/**
 * 문서에서 코드 스팬을 전부 뽑는다(§3.1의 재료). 펜스는 마스킹하고, 머리의 `- 근거:` 줄은
 * 뺀다(§1 예외). **주소인지는 여기서 안 묻는다** — 그것은 `readAddress`의 몫이다.
 */
export declare function codeSpans(source: string): Address[];

/**
 * §3.1 — 코드 스팬 하나를 꼴 넷에 맞춰 읽는다. **모집단 판별이 이 함수 안에서 끝난다.**
 *
 * `topLevelEntries`는 공개 트리 최상위 엔트리다. **[미규정]** 그 목록의 파생이 디스크인가
 * 추적인가를 정본이 안 정했고, 이 모듈은 받기만 하고 정하지 않는다.
 */
export declare function readAddress(text: string, topLevelEntries: readonly string[]): AddressRead;

/** §3.2 — **착지 경로**의 부류. 인용 문자열이 아니라 해결된 경로에 건다. */
export declare function classOf(path: string): AddressClass;

/** §3.2 — 해결 순서: 인용한 문서의 디렉터리 → `neo-agent-main/` → 레포 루트. 첫 적중이 답이다. */
export declare function candidatePaths(path: string, docPath: string): string[];

/**
 * 주소가 어디에 착지하는가. 첫 적중이 답이지만 **목록은 전부** 돌려준다 —
 * `shadowed-address`가 둘 이상의 착지를 보고 판정한다.
 */
export declare function resolveAddress(
  read: Extract<AddressRead, { ok: true }>,
  context: Pick<AddressContext, "docPath" | "probePublic" | "probeRecord" | "basenameIndex">,
): AddressLanding[];

/** 절 제목의 번호 전부. `AddressContext.sectionsOf`의 재료다. */
export declare function documentSections(source: string): string[];

/** §3.2·§3.3 — 주소 하나의 판정. */
export declare function judgeAddress(
  read: Extract<AddressRead, { ok: true }>,
  context: AddressContext,
): AddressVerdict;

/**
 * §6 — 최상위 진입점이 들지 않는 문서.
 *
 * **원문 문자열을 안 받는 것이 이 시그니처의 요점이다** — §6이 *"새 순회를 만들지 않는다"*고
 * 못박았으므로 재료는 §3이 이미 모은 주소의 **착지 집합**뿐이다.
 */
export declare function unmappedDocs(
  docs: readonly string[],
  entryLandings: Iterable<string>,
): string[];
