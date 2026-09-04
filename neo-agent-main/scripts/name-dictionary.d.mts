/**
 * `name-dictionary.mjs`(순수 판정)의 타입 선언.
 *
 * `.mjs`는 `tsconfig.json`의 include(`packages` 아래 `.ts`) 밖이라 타입체크를 받지 못한다.
 * 이 파일이 있어야 `packages/cli/test/name-dictionary.contract.test.ts`가 판정 함수를 import할
 * 수 있다. 형태의 정본은 `docs/LORE.md` §4.1(행 문법·토큰 집합)·§4.2(실패 갈래·fail-closed
 * 그물·절 범위)다.
 *
 * **이 파일은 구현 본문을 안 든다** — 값 선언(`declare`)과 타입뿐이다. 형제
 * `scripts/address.d.mts`·`scripts/doc-status.d.mts`·`scripts/doc-citation.d.mts`와 같은
 * 형태다.
 *
 * **신호를 내는 것은 타입체크가 아니라 계약 테스트다.** 이 레포는 `skipLibCheck`가 켜져 있고
 * `.mjs`가 어느 `tsconfig`의 `include`에도 없어 **손으로 쓴 이 선언이 런타임 값과 대조되지
 * 않는다**(`scripts/address.d.mts` 머리와 같은 자리). 그래서 위반 이름 집합처럼 «닫혔다»가
 * 계약인 값은 런타임에서 재는 단언이 그 몫을 든다.
 */

/**
 * §4.1 — 정본 셀의 토큰. **이 유니온이 닫혀 있다는 것이 그 절의 계약이다** — *"정본 셀의
 * 토큰은 닫힌 집합이다"*. 집합 밖의 문자열은 행 파싱 실패이지 새 종류가 아니다.
 */
export type CanonicalToken =
  /** 외부 주소 — 코드 스팬 문서명 + `§<절번호>`. 한 문서를 여럿으로 들면 `§5·§8` */
  | {
      readonly kind: "external";
      /** 코드 스팬 안의 문서명. 경로 구분자를 담지 않는다 */
      readonly doc: string;
      /** `§` 없는 절 번호들. 원문 순서, 중복 없음. 최소 하나 */
      readonly sections: readonly string[];
    }
  /** 내부 주소 — `§<절번호>`. 이 문서(`LORE.md`) 안의 절 */
  | { readonly kind: "internal"; readonly section: string }
  /** 전수 선언 — `전수:` + 외부 주소 하나. 그 §의 표가 드는 정본 집합을 전부 들어야 한다 */
  | { readonly kind: "exhaustive"; readonly doc: string; readonly section: string }
  /** 결손 — `정본 없음:` + `§8 U-<자>`. 계약이 있어야 하는데 없다. 게이트가 «열린 결손»으로 센다 */
  | { readonly kind: "missing"; readonly unresolved: string }
  /** 해당 없음 — `해당 없음:` + 내부 주소 하나. 대응물이 **없어야 맞다**. 결손으로 세지 않는다 */
  | { readonly kind: "not-applicable"; readonly section: string };

/**
 * §4의 이름 사전 행 하나.
 *
 * **가운데 셀이 이 타입에 없다.** §4.1이 그 셀을 *"자유 서술. 이 셀은 의무를 지지 않는다"*로
 * 명시하므로 판정의 입력이 아니고, 타입에 들이면 그 문장이 실물에서 거짓이 된다.
 */
export type DictionaryRow = {
  /** 이름 셀 원문. 볼드 마크업이 그대로 붙어 있고, 슬래시 없음은 검증이 끝난 상태다 */
  readonly name: string;
  /** 1-기반. 출력용이며 판정에 쓰지 않는다 */
  readonly line: number;
  /** 정본 셀의 ` · ` 나열. 최소 하나 — 빈 셀은 파싱 단계에서 걸린다 */
  readonly tokens: readonly CanonicalToken[];
};

/**
 * `parseDictionaryTable`의 실패 사유. **이 유니온이 닫혀 있다.**
 *
 * 앞 셋은 §4.2 표의 실패 갈래이고(각각 「행 파싱 실패」·「이름이 둘」·「정본 셀이 비었다」),
 * 뒤 넷은 §4.2의 fail-closed 그물이다. 그물의 다섯째(주소가 든 문서를 열 수 없다)만 파일
 * I/O가 필요해 여기가 아니라 `judge`가 든다.
 */
export type ParseReason =
  /** 세 셀이 아니거나, 정본 셀에 토큰 집합 밖의 문자열이 있다 */
  | "row-malformed"
  /** 이름 셀이 슬래시로 둘 이상을 묶는다 — Fork의 결손을 가린 형태 */
  | "name-doubled"
  /** 정본 셀에 주소도 결손 토큰도 없다 — 포인터 의무의 정면 위반 */
  | "canonical-empty"
  /** §4 절 범위에 표가 없다 (`## 4.` 절 제목 자체가 없는 경우를 포함한다) */
  | "table-missing"
  /** 표에 데이터 행이 0이다 */
  | "table-empty"
  /** §4 절 범위에 표가 둘 이상이다 */
  | "table-duplicate"
  /** 이름 셀이 중복된다 (볼드·코드 스팬 마크업을 걷고 비교한다) */
  | "name-duplicate";

/** `parseDictionaryTable`의 산출. 실패는 첫 자리에서 멈춘다 — 건너뛴 행을 만들지 않는다. */
export type ParseResult =
  | { readonly ok: true; readonly rows: readonly DictionaryRow[] }
  | { readonly ok: false; readonly reason: ParseReason; readonly detail: string };

/** 게이트 출력의 라벨 하나. */
export type Verdict = { readonly violation: string; readonly detail: string };

/**
 * `judge`의 산출.
 *
 * **`ok: false`는 언제나 위반을 하나 이상 든다.** 한 행이 갈래 여럿에 걸릴 수 있어 첫
 * 위반에서 멈추지 않는다 — 멈추면 한 사이클에 하나씩만 보이고 고치는 사람이 같은 행을 여러
 * 번 왕복한다.
 */
export type Judgement =
  | { readonly ok: true }
  | { readonly ok: false; readonly violations: readonly Verdict[] };

/**
 * 판정에 필요한 문서 지식 전부. **이 모듈은 파일을 안 읽는다** — 실행부
 * (`scripts/check-name-dictionary.mjs`)가 이 값을 만들어 넘긴다.
 */
export type JudgeContext = {
  /** 이 문서(`LORE.md`) 원문. 내부 주소의 § 실재와 §8의 미결 목록이 여기서 나온다 */
  readonly self: string;
  /**
   * 외부 문서명 → 원문. **키가 없으면 「주소가 든 문서를 열 수 없다」이지 통과가 아니다** —
   * §4.2의 fail-closed 그물 다섯째가 이 자리에 산다.
   */
  readonly docs: ReadonlyMap<string, string>;
};

/**
 * §4.2 표의 실패 갈래 **여섯**. 이 이름이 그대로 게이트 출력의 라벨이 된다.
 *
 * **이 대응을 §4.2가 문면으로 확정했다**(2026-09-04 `K-482`) — *"위 표와 이 문단의 문구는
 * 실행부 라벨 «문자열»과 지시 관계이지 축자 동일이 아니다"*. 라벨이 §4.2가 든 개념을
 * 가리키기만 하면 되고 자구가 갈려도 위반이 아니다. 이 집합이 §4.2 표와 1:1이라는 것은
 * 계약이다.
 */
export declare const VIOLATIONS: Readonly<{
  /** 행 파싱 실패 */
  rowMalformed: string;
  /** 이름이 둘 */
  nameDoubled: string;
  /** 정본 셀이 비었다 */
  canonicalEmpty: string;
  /** 정본 § 부재 */
  deadSection: string;
  /** 미결 유령 */
  ghostUnresolved: string;
  /** 전수 미달 */
  exhaustiveShort: string;
}>;

/**
 * §4.2의 fail-closed 그물. 「위반」이 아니라 「잴 수 없다」의 이름이고, 다 통과가 아니라
 * 실패다.
 *
 * 앞 다섯이 §4.2가 문면으로 든 그물이다. `exhaustiveUnsupported`는 그 목록에 없는
 * 여섯째로, 전수 대상이 `EXHAUSTIVE_TARGET` 밖일 때 조용히 통과시키지 않기 위해 이 모듈이
 * 낸다 — §4.2가 이 경우를 규정하지 않는다. [미규정]
 */
export declare const FAIL_CLOSED: Readonly<{
  tableMissing: string;
  tableEmpty: string;
  tableDuplicate: string;
  nameDuplicate: string;
  docUnreadable: string;
  exhaustiveUnsupported: string;
}>;

/**
 * 오늘 전수 선언이 지목할 수 있는 유일한 대상 — `BOUNDARY-LAYERS.md` §2.
 *
 * `boundary-index.mjs`의 `parseLayerTable`이 그 문서·그 절 전용이기 때문이다. 다른 대상을
 * 가리키는 전수 선언이 생기면 이 재사용은 안 맞고 새 판단이 필요하다.
 */
export declare const EXHAUSTIVE_TARGET: Readonly<{ doc: string; section: string }>;

/**
 * 이름 셀의 비교용 정규화. 볼드·이탤릭·코드 스팬 마크업을 걷고 공백을 줄인다.
 * §4.1이 이름 셀에 볼드를 허용하므로 `**Neo**`와 `Neo`는 같은 이름이다.
 */
export declare function normalizeName(cell: string): string;

/**
 * §8이 선언한 미결 항목의 식별자들. **해소된(취소선) 항목도 든다** — §4.2의 「미결 유령」은
 * 결손 토큰의 `U-<자>`가 §8에 **없는** 것을 재지 그 항목이 아직 열려 있는지를 재지 않는다.
 * [미규정]
 */
export declare function collectUnresolvedIds(source: string): string[];

/**
 * 행들이 든 **열린 결손**의 수 — `missing` 토큰만 센다. §4.1이 결손과 해당 없음을 서로 다른
 * 리터럴로 가른 이유가 이 값이다.
 */
export declare function countOpenGaps(rows: readonly DictionaryRow[]): number;

/**
 * §4의 이름 사전 표를 읽는다. 절 범위는 `## 4.`와 그 다음 첫 제목 사이이므로 §4.1·§4.2가
 * 자기 본문에 든 예시 표는 원리적으로 데이터 행이 되지 않는다(§4.2 넷째 불릿).
 */
export declare function parseDictionaryTable(source: string): ParseResult;

/** 행 하나를 §4.2의 실패 갈래에 대조한다. 문서를 여는 부수효과는 `context`가 든다. */
export declare function judge(row: DictionaryRow, context: JudgeContext): Judgement;
