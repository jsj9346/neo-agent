/**
 * 난독화 정규화 — `docs/APPROVAL-GATE.md` §2의 deny 규칙·위험 패턴 전처리.
 *
 * **순서가 계약이다: 비가시 유니코드 검사 → NFKC 정규화.** 역순이면 NFKC가
 * 일부 비가시 코드포인트를 접거나 지우면서 "무엇이 숨어 있었는지"의 증거가
 * 사라지고, 전각 동형이의어(`ｒｍ`) 우회 탐지도 흔적을 잃는다. hermes
 * `tools/threat_patterns.py`가 같은 이유로 RAW 입력에서 먼저 검사한다.
 *
 * 정규화는 **매칭 전용**이다. 사용자에게 보이는 문자열은 `display.ts`가 원문
 * 기준으로 만든다 — 정규화된 텍스트를 보여주면 "우리가 본 것"과 "사용자가 본 것"이
 * 어긋나고, 그 어긋남 자체가 표시 위조의 통로가 된다.
 *
 * 이 파일의 문자 목록은 전부 `\uXXXX` 이스케이프로 적는다. 비가시 문자를 소스에
 * 리터럴로 박으면 리뷰어가 무엇이 들어 있는지 볼 수 없다 — 비가시 문자를 다루는
 * 모듈이 스스로 비가시 문자를 숨기는 것은 앞뒤가 맞지 않는다.
 */

/**
 * 분석 입력 상한. 이 위는 문자 순회·정규식 비용이 그대로 공격 표면이 된다
 * (모델이 만든 거대 인자로 판정기를 묶어 두는 경로). 초과분은 잘라서 분석하고
 * 잘렸다는 사실을 결과에 싣는다 — 조용히 통과시키지 않는다.
 */
export const MAX_ANALYSIS_CHARS = 64 * 1024;

/**
 * 비가시·서식 제어 문자. `\t`·`\n`·`\r`은 **제외**한다 — 셸에서 줄바꿈은
 * 의미 있는 연산자이고, 이걸 "비가시 문자"로 지워 버리면 복합 명령이
 * 단일 명령으로 위장된다(allowlist 학습 우회 경로).
 *
 * 포함: C0/C1 제어(탭·개행·복귀 제외), `\p{Cf}`(ZWSP·ZWJ·BOM·방향 재정의·불가시
 * 연산자), 짝 없는 서로게이트, 유니코드 줄/문단 구분자, 그리고 공백처럼 보이지만
 * ASCII 공백이 아닌 것들(NBSP·전각 공백·한글 채움 문자).
 *
 * `v` 플래그의 집합 차집합(`[...]--[\t\n\r]`)으로 쓴 이유는 소스에 제어 문자를
 * 리터럴로 넣지 않기 위해서다 — 비가시 문자를 다루는 모듈이 스스로 비가시
 * 문자를 숨기면 리뷰어가 목록을 검증할 수 없다.
 */
export const INVISIBLE_PATTERN =
  /[[\p{Cc}\p{Cf}\p{Cs}\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\u115F\u1160\u3164\uFFA0]--[\t\n\r]]/gv;

/**
 * 문자 체계를 넘나드는 동형이의(confusable) 표. NFKC는 이것들을 건드리지 않는다 —
 * 키릴 `а`와 라틴 `a`는 정규화상 서로 다른 문자다. 완전한 방어는 TR#39
 * confusable 데이터베이스가 필요하지만 그건 의존성 예산 밖이다(예산: core 1개).
 * 그래서 **셸 명령에 실제로 쓰이는 라틴 글자에 대응하는 것만** 담는다 — 목록이
 * 완전하지 않다는 사실은 숨기지 않는다(게이트는 보안 경계가 아니다).
 */
const CONFUSABLES: ReadonlyMap<string, string> = new Map([
  // 키릴 소문자
  ["а", "a"],
  ["е", "e"],
  ["о", "o"],
  ["р", "p"],
  ["с", "c"],
  ["у", "y"],
  ["х", "x"],
  ["і", "i"],
  ["ѕ", "s"],
  ["ԁ", "d"],
  ["ј", "j"],
  ["ӏ", "l"],
  ["к", "k"],
  ["м", "m"],
  ["н", "h"],
  ["в", "b"],
  ["т", "t"],
  // 키릴 대문자
  ["А", "A"],
  ["В", "B"],
  ["Е", "E"],
  ["К", "K"],
  ["М", "M"],
  ["Н", "H"],
  ["О", "O"],
  ["Р", "P"],
  ["С", "C"],
  ["Т", "T"],
  ["Х", "X"],
  // 그리스
  ["α", "a"],
  ["ο", "o"],
  ["ρ", "p"],
  ["ν", "v"],
  ["ε", "e"],
  ["ι", "i"],
  ["κ", "k"],
  ["υ", "u"],
  ["Α", "A"],
  ["Β", "B"],
  ["Ε", "E"],
  ["Κ", "K"],
  ["Μ", "M"],
  ["Ν", "N"],
  ["Ο", "O"],
  ["Ρ", "P"],
  ["Τ", "T"],
  ["Χ", "X"],
]);

export interface ConfusableHit {
  /** `U+0430` 형식 */
  readonly codePoint: string;
  /** 접었을 때의 라틴 문자 */
  readonly folded: string;
}

export interface NormalizationResult {
  /** NFKC + 비가시 제거 + 수평 공백 축약. 줄바꿈은 연산자라 보존한다 */
  readonly canonical: string;
  /**
   * deny 글로브·위험 패턴을 시도할 후보 전부(canonical 포함, 중복 제거).
   * 인용부호 삽입(`git st""atus`)·백슬래시(`r\m`)·동형이의 변형을 편 것들이다.
   * **모든 후보에 대해 매칭한다** — 한 변형만 보면 나머지가 우회로가 된다.
   */
  readonly variants: readonly string[];
  /** 원문(NFKC 이전)에서 발견한 비가시 문자. `U+200B` 형식 */
  readonly invisible: readonly string[];
  /** NFKC가 원문을 실제로 바꿨는가 = 전각·호환 문자 변형의 흔적 */
  readonly nfkcChanged: boolean;
  /** 문자 체계를 넘나드는 동형이의 문자 발견 내역 */
  readonly confusables: readonly ConfusableHit[];
  /** 입력이 상한을 넘어 잘렸는가 */
  readonly truncated: boolean;
}

export function formatCodePoint(char: string): string {
  return `U+${(char.codePointAt(0) ?? 0xfffd).toString(16).toUpperCase().padStart(4, "0")}`;
}

/** 수평 공백만 한 칸으로 접고, 줄바꿈은 `\n` 하나로 남긴다(연산자 신호 보존) */
function collapseWhitespace(text: string): string {
  return text
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n[ \n]*/g, "\n")
    .trim();
}

function foldConfusables(text: string): { folded: string; hits: ConfusableHit[] } {
  const hits: ConfusableHit[] = [];
  let folded = "";
  for (const char of text) {
    const replacement = CONFUSABLES.get(char);
    if (replacement === undefined) {
      folded += char;
      continue;
    }
    folded += replacement;
    hits.push({ codePoint: formatCodePoint(char), folded: replacement });
  }
  return { folded, hits };
}

/**
 * 인용부호 삽입 변형을 편다: `git st""atus` → `git status`.
 * 정직한 인용(`echo "a b"`)까지 함께 펴지지만, 이 결과는 **매칭 후보로만** 쓰이므로
 * 방향이 안전하다 — 더 많이 걸리는 쪽으로 틀린다.
 */
function stripQuotes(text: string): string {
  return text.replace(/["']/g, "");
}

/** 백슬래시 변형을 편다: `r\m` → `rm`, 줄 이음(`\`+개행)도 함께 잇는다 */
function stripBackslashes(text: string): string {
  return text.replace(/\\\n/g, "").replace(/\\/g, "");
}

/**
 * 난독화 정규화. 반환의 `canonical`은 allowlist 키·표시 보조에, `variants`는
 * deny 글로브·위험 패턴 매칭에 쓴다.
 */
export function normalizeForMatching(input: string): NormalizationResult {
  const truncated = input.length > MAX_ANALYSIS_CHARS;
  const raw = truncated ? input.slice(0, MAX_ANALYSIS_CHARS) : input;

  // 1) 비가시 검사는 RAW에서 — NFKC가 지우기 전에 본다(순서 계약)
  const invisible: string[] = [];
  const seen = new Set<string>();
  for (const match of raw.matchAll(INVISIBLE_PATTERN)) {
    const label = formatCodePoint(match[0]);
    if (seen.has(label)) continue;
    seen.add(label);
    invisible.push(label);
  }

  // 2) NFKC — 전각·호환 변형(`ｒｍ` → `rm`)을 접는다
  const normalized = raw.normalize("NFKC");
  const nfkcChanged = normalized !== raw;

  // 3) 비가시 제거 후 공백 축약
  const stripped = normalized.replace(INVISIBLE_PATTERN, "");
  const canonical = collapseWhitespace(stripped);

  // 4) 매칭 후보 조립 — 인용부호·백슬래시·동형이의 변형의 조합
  const { folded, hits } = foldConfusables(canonical);
  const bases = hits.length > 0 ? [canonical, folded] : [canonical];
  const variants: string[] = [];
  const known = new Set<string>();
  for (const base of bases) {
    for (const candidate of [
      base,
      stripQuotes(base),
      stripBackslashes(base),
      stripBackslashes(stripQuotes(base)),
    ]) {
      const trimmed = collapseWhitespace(candidate);
      if (trimmed.length === 0 || known.has(trimmed)) continue;
      known.add(trimmed);
      variants.push(trimmed);
    }
  }

  return {
    canonical,
    variants,
    invisible,
    nfkcChanged,
    confusables: hits,
    truncated,
  };
}

/**
 * deny 규칙 글로브 → 정규식. 방언은 `*`(구분자 `/` 제외 임의)·`**`(구분자 포함
 * 임의)·`?`(구분자 아닌 한 글자) 셋으로 닫는다(APPROVAL-GATE §7 미결의 구현 확정).
 * 나머지 문자는 전부 리터럴이다 — 정규식 메타문자를 그대로 쓰게 두면 사용자가
 * 의도치 않은 패턴을 만들고, ReDoS 표면을 설정 파일로 여는 셈이 된다.
 *
 * 매칭은 **전체 일치**다. 부분 일치를 원하면 양끝에 `**`를 붙인다 — 규칙이
 * 어디까지 걸리는지가 눈으로 보이는 쪽을 택했다.
 */
type GlobAtom =
  | { kind: "char"; value: string }
  /** `?` — 구분자가 아닌 한 글자 */
  | { kind: "one" }
  /** `*` — 구분자를 넘지 않는 임의 길이 */
  | { kind: "segment" }
  /** `**` — 구분자를 포함한 임의 길이 */
  | { kind: "any" };

function parseGlob(glob: string): GlobAtom[] {
  const atoms: GlobAtom[] = [];
  let index = 0;
  while (index < glob.length) {
    const char = glob[index] ?? "";
    if (char === "*") {
      let run = 0;
      while (glob[index] === "*") {
        run += 1;
        index += 1;
      }
      atoms.push(run >= 2 ? { kind: "any" } : { kind: "segment" });
      continue;
    }
    index += 1;
    atoms.push(char === "?" ? { kind: "one" } : { kind: "char", value: char });
  }
  return atoms;
}

/**
 * 글로브 매칭 — **정규식을 쓰지 않는다.**
 *
 * 정규식으로 번역하면 `**a**b**c**`처럼 와일드카드가 리터럴로 분리된 규칙이
 * 세제곱 백트래킹을 만든다. 연속된 `*`를 접는 것만으로는 못 막는다 — 접히지 않는
 * 것은 사이에 리터럴이 낀 경우이기 때문이다. deny 규칙은 사용자가 쓰지만 **판정
 * 대상 텍스트는 모델이 제어**하므로, 그대로 두면 모델이 긴 문자열 하나로 게이트를
 * 멈출 수 있다 — 판정기가 멈추는 것은 게이트가 없는 것과 같다(QA 검증에서 발견).
 *
 * 대신 표준 와일드카드 DP로 매칭한다. 최악 O(텍스트 × 패턴)이 보장되고 백트래킹이
 * 존재하지 않는다. 각 칸은 "텍스트 i글자와 패턴 j원자가 매칭 가능한가"다.
 */
function matchGlobAtoms(atoms: readonly GlobAtom[], text: string): boolean {
  const patternLength = atoms.length;
  let previous = new Uint8Array(patternLength + 1);
  let current = new Uint8Array(patternLength + 1);

  // 빈 텍스트: 선두의 와일드카드들만 빈 매칭으로 통과한다
  previous[0] = 1;
  for (let j = 0; j < patternLength; j += 1) {
    const atom = atoms[j];
    if (previous[j] !== 1 || atom === undefined) break;
    if (atom.kind !== "any" && atom.kind !== "segment") break;
    previous[j + 1] = 1;
  }

  for (let i = 1; i <= text.length; i += 1) {
    const char = text[i - 1] ?? "";
    current.fill(0);
    for (let j = 1; j <= patternLength; j += 1) {
      const atom = atoms[j - 1];
      if (atom === undefined) continue;
      switch (atom.kind) {
        case "char":
          current[j] = previous[j - 1] === 1 && char === atom.value ? 1 : 0;
          break;
        case "one":
          current[j] = previous[j - 1] === 1 && char !== "/" ? 1 : 0;
          break;
        case "segment":
          // 빈 매칭(같은 글자에서 다음 원자로) 또는 한 글자 더 삼키기
          current[j] = current[j - 1] === 1 || (previous[j] === 1 && char !== "/") ? 1 : 0;
          break;
        case "any":
          current[j] = current[j - 1] === 1 || previous[j] === 1 ? 1 : 0;
          break;
      }
    }
    const swap = previous;
    previous = current;
    current = swap;
  }

  return previous[patternLength] === 1;
}

/** 컴파일된 deny 규칙 매처. 규칙당 1회 파싱하고 호출마다 선형 매칭한다 */
export function compileGlob(glob: string): (text: string) => boolean {
  const atoms = parseGlob(glob);
  return (text: string) => matchGlobAtoms(atoms, text);
}
