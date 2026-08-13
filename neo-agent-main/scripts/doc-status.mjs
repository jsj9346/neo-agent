/**
 * 문서 지위 선언의 **순수 판정**. 정본은 `docs/DOC-STATUS.md` §3·§3.3이다.
 *
 * **이 파일은 부작용이 없다.** 파일을 읽지 않고, 아무것도 출력하지 않고, 프로세스를
 * 끝내지 않는다. 게이트 실행부는 `check-doc-status.mjs`에 있고 이 모듈을 임포트한다.
 *
 * **왜 두 파일인가.** 처음에는 한 파일이었고, 계약 테스트가 순수 함수만 쓰는데도
 * 임포트 순간 게이트 전체가 돌았다 — 실물 `docs/`가 레드인 날이면 `process.exit(1)`이
 * vitest 워커를 죽여 **"계약 위반"이 "테스트 파일이 사라짐"으로 나타난다.**
 * (`package-boundary.contract.test.ts`가 예산 게이트를 임포트 대신 텍스트로 읽는 이유가
 * 정확히 같은 함정이다.)
 *
 * `import.meta.main` 가드로 막지 않은 것은 의도다 — 그 속성은 Node 24.2.0에서 들어왔고
 * 이 워크스페이스의 `engines`는 `>=24`다. 24.0~24.1에서는 `undefined`라 가드가 거짓이 되어
 * **게이트 본문이 통째로 건너뛰어지고 `check:docs`가 조용히 exit 0**이 된다. 침묵 통과는
 * 이 게이트가 존재하는 이유 그 자체이므로(`ARCHITECTURE.md` §2.6), 런타임 조건 대신
 * 파일 경계로 갈랐다. 조건이 없으면 틀릴 수도 없다.
 */

/** `docs/DOC-STATUS.md` §3.2의 닫힌 유니온. 값에 한정·괄호·마크업을 붙일 수 없다. */
const STATUS_VALUES = {
  "구현 완료": "implemented",
  "구현 전": "not-yet",
  "구현 주장 없음": "no-claim",
};

/** 앵커를 요구하는 값. `no-claim`만 `근거:`가 **금지**된다(§3.2). */
const ANCHORED_KINDS = new Set(["implemented", "not-yet"]);

/**
 * §3.3 — 머리는 머리에 있다. 본문 인용까지 읽으면 자기오염이 되살아난다.
 * 이 상한을 늘리려면 `DOC-STATUS.md` §3.3을 먼저 고친다.
 */
export const HEAD_LINE_LIMIT = 40;

/** 줄 시작에 고정한다 — 선행 공백도 `>` 인용도 받지 않는다(§3.3). */
const STATUS_LINE = /^- 상태: (.*)$/;
const ANCHOR_LINE = /^- 근거: (.*)$/;

function fieldValues(headLines, pattern) {
  const values = [];
  for (const line of headLines) {
    const match = pattern.exec(line);
    // [미규정] 값 끝의 공백만 지운다. `DOC-STATUS.md` §3.3은 "정확 일치"만 말하고
    // 후행 공백을 규정하지 않는다. 보이지 않는 문자로 게이트가 깨지는 쪽이 나쁘다고
    // 보아 관용했으나 문서가 정한 바는 아니다 — 판정 필요.
    if (match) values.push(match[1].replace(/\s+$/, ""));
  }
  return values;
}

/**
 * 문서 소스 텍스트 → 파싱 결과. **파일 I/O를 하지 않는다.**
 *
 * 판정을 순수하게 유지하는 것이 계약 테스트의 전제다 — 픽스처 파일도, 테스트용
 * 환경변수 손잡이도 없이 일곱 갈래를 전부 돌릴 수 있다.
 *
 * @param {string} source
 * @returns {{kind: string, anchor?: string} | {violation: string, detail: string}}
 */
export function parseDocStatus(source) {
  const headLines = source.split("\n").slice(0, HEAD_LINE_LIMIT);
  const statuses = fieldValues(headLines, STATUS_LINE);

  if (statuses.length === 0) {
    return { violation: "missing", detail: `머리 ${HEAD_LINE_LIMIT}줄 안에 "- 상태:" 줄이 없다` };
  }
  if (statuses.length > 1) {
    return { violation: "duplicate", detail: `"- 상태:" 줄이 ${statuses.length}개다` };
  }

  const raw = statuses[0];
  const kind = STATUS_VALUES[raw];
  if (!kind) {
    const allowed = Object.keys(STATUS_VALUES).join(" | ");
    return { violation: "unknown-value", detail: `"${raw}" — 허용값은 ${allowed}` };
  }

  const anchors = fieldValues(headLines, ANCHOR_LINE);
  // [미규정] `- 근거:` 줄이 둘 이상인 경우를 `DOC-STATUS.md` §3.1의 일곱 위반이 규정하지
  // 않는다(§3.3의 "정확히 1개"는 `상태:` 줄만 센다). 임의로 새 위반 종류를 만들지 않고
  // fail-closed 방향(거부)으로 `duplicate`에 합쳐 둔다 — 모호한 선언을 통과시키는 것보다
  // 낫다. 판정 필요.
  if (anchors.length > 1) {
    return { violation: "duplicate", detail: `"- 근거:" 줄이 ${anchors.length}개다` };
  }

  if (ANCHORED_KINDS.has(kind)) {
    if (anchors.length === 0) {
      return { violation: "anchor-required", detail: `"${raw}"는 "- 근거:" 줄을 요구한다` };
    }
    return { kind, anchor: anchors[0] };
  }

  if (anchors.length > 0) {
    return { violation: "anchor-forbidden", detail: `"${raw}"에는 "- 근거:"를 둘 수 없다` };
  }
  return { kind };
}

/**
 * 파싱 결과 + 앵커 존재 여부 → 판정. **경로 판정을 주입받으므로 여기도 순수하다.**
 *
 * `not-yet`이 앵커를 들고 그 앵커가 **존재하면** 위반이라는 것이 이 게이트의 핵심이다 —
 * F-1 6건이 정확히 이 형태였고, 이 판정 덕에 구현이 착지하는 순간 게이트가 깨진다.
 *
 * 성공 갈래가 `status`를 **통째로** 들고 다니는 것이 계약이다(§3.1). `kind`와 옵셔널
 * `anchor`로 평탄화하면 `{kind:"no-claim", anchor:"x"}` 같은 무의미 상태가 다시 표현
 * 가능해진다 — §3.1이 *"`근거:` 줄의 존재 여부가 kind에 의해 완전히 결정된다"*고 못박은
 * 성질이 판정 경계에서 풀린다. 문서 이름은 이 타입에 없다: 게이트 루프가 파일명과 짝짓는다.
 *
 * @param {{kind: string, anchor?: string} | {violation: string, detail: string}} parsed
 * @param {boolean} anchorExists
 * @returns {{ok: true, status: object} | {ok: false, violation: string, detail: string}}
 */
export function judge(parsed, anchorExists) {
  if ("violation" in parsed) {
    return { ok: false, violation: parsed.violation, detail: parsed.detail };
  }
  if (parsed.kind === "implemented" && !anchorExists) {
    return { ok: false, violation: "anchor-missing", detail: `앵커 "${parsed.anchor}"가 없다` };
  }
  if (parsed.kind === "not-yet" && anchorExists) {
    return {
      ok: false,
      violation: "anchor-present",
      detail: `"구현 전"인데 앵커 "${parsed.anchor}"가 존재한다 — 머리가 낡았다`,
    };
  }
  return { ok: true, status: parsed };
}
