/**
 * `comment-lexer.mjs`(소속 술어)의 타입 선언.
 *
 * `.mjs`는 `tsconfig.json`의 include(`packages` 아래 `.ts`) 밖이라 타입체크를 받지 못한다.
 * 이 파일이 있어야 계약 테스트와 검증기가 술어를 import할 수 있다. 형태의 정본은
 * `docs/DOC-CITATION.md` §6 U-b의 2026-08-18 둘째 판정과 2026-08-19 판정이다.
 *
 * **손으로 쓴 이 선언은 런타임 값과 자동으로 대조되지 않는다** — `skipLibCheck`가 켜져 있고
 * `.mjs`가 어느 `tsconfig`의 `include`에도 없다(§3.4 P-6의 2026-08-16 정정이 같은 자리를
 * 든다). export가 하나 늘어도, 아래 유니온이 실제 값과 갈려도 `pnpm typecheck`은 조용하다.
 * **그 대조는 계약 테스트가 든다** — `packages/cli/test/doc-citation.contract.test.ts`가
 * `.d.mts` ↔ 런타임 export 패리티를 재는 자리이고, 그것이 이 파일의 유일한 강제 수단이다.
 */

/**
 * 주석 토큰 하나의 원문 좌표. 반열린 구간 `[pos, end)`이고 여는 표기와 닫는 표기를 전부
 * 포함한다. `end`는 줄바꿈을 안 담는다 — 줄 주석의 토큰은 줄 끝에서 끝난다.
 *
 * 이름이 `TextSpan`(`doc-citation.d.mts`)과 다른 것은 좌표계가 아니라 필드 이름이 다르기
 * 때문이다. `pos`·`end`는 TypeScript 파서의 `CommentRange`가 쓰는 이름이고, 사본 넷이 그
 * 이름으로 서 있었으므로 통합에서 바꾸지 않았다.
 */
export type CommentTokenSpan = {
  readonly pos: number;
  readonly end: number;
};

/**
 * 렉싱 수단의 이름. **닫힌 유니온이고 «기타»가 없다.**
 *
 * 열린 `string`으로 두면 셋째 수단이 조용히 들어온다 — 정본이 수단을 확장자로 고르라고 했고
 * 새 확장자 부류가 언젠가 붙을 텐데, 타입이 아무 말도 안 하면 그 승격이 어디에도 안 드러난다.
 * 닫아 두면 승격이 **선언을 고쳐야만** 들어온다. (신호를 내는 것은 타입체크가 아니라 위 머리가
 * 든 계약 테스트다.)
 */
export type LexerKind = "typescript" | "shell";

/**
 * 대상 하나 — 수단을 고르는 **자리**와, 그 수단이 재는 **원문**.
 *
 * 둘이 한 값인 것은 확장자가 없는 대상 때문이다: 그런 자리에서는 경로만으로 수단이 안 갈리고
 * 첫 줄의 셔뱅까지 봐야 한다.
 */
export type LexTarget = {
  readonly path: string;
  readonly source: string;
};

/**
 * §6 U-b 2026-08-18 후속 판정 — 주석 토큰의 구간들(TypeScript 파서 경로). 소속은 렉싱이
 * 정하고 줄 모양이 아니다. `pos` 오름차순이고 구간은 겹치지 않는다.
 */
export declare function commentTokenSpans(source: string): CommentTokenSpan[];

/**
 * §6 U-b 2026-08-19 판정 — 주석 토큰의 구간들(셸 경로). 인용부호 구간(홑따옴표 포함)과
 * 이스케이프가 `#`의 판별에 먼저 걸리고, 꼬리 주석도 토큰이다. 셸의 낱말 경계 규칙보다 넓게
 * 읽는다.
 */
export declare function shellCommentTokenSpans(source: string): CommentTokenSpan[];

/** 수단 이름의 닫힌 목록. 런타임에서 동결돼 있고 `LexerKind`와 원소가 같아야 한다. */
export declare const LEXER_KINDS: readonly LexerKind[];

/**
 * 확장자 → 수단. 정본이 «한 자리에 둔다»고 한 분기의 그 자리다.
 *
 * **판정의 정본은 이 표가 아니라 `lexerKindFor`다** — 표는 확장자 갈래만 담으므로 직접 읽는
 * 소비자는 셔뱅 갈래를 잃는다. 키는 소문자 확장자이고 앞의 점을 포함한다.
 */
export declare const EXTENSION_LEXERS: Readonly<Record<string, LexerKind>>;

/**
 * 이 대상을 어떤 수단으로 읽는가. **수단이 없으면 던진다** — 빈 배열은 «주석이 없다»와
 * «읽을 줄 모른다»를 같은 값으로 만든다(§6 U-b · `Q-7`).
 *
 * @throws 이 자리에 수단이 없을 때
 */
export declare function lexerKindFor(target: LexTarget): LexerKind;

/**
 * 대상의 주석 토큰 구간들. 수단을 고르고 그 수단으로 잰다. 소속 술어는 확장자를 묻지 않는다 —
 * 확장자가 고르는 것은 수단이지 어느 파일이 재기는가가 아니다.
 *
 * @throws 이 자리에 수단이 없을 때
 */
export declare function commentTokenSpansFor(target: LexTarget): CommentTokenSpan[];
