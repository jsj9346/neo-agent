/**
 * `probeDocker` 주입 헬퍼 — QA-C(T-014) 소유.
 *
 * **왜 이 파일이 있는가.** `sandbox`의 기본값이 `"on"`이므로(`SANDBOX.md` §3)
 * `startCli`는 시작 시퀀스 5b에서 반드시 Docker 가용성을 판정한다. 주입이 없으면
 * 그 판정이 **실제 `docker version` 프로세스 스폰**이 되고, 그러면 CLI 스위트의
 * 결과가 테스트 머신의 Docker 설치·데몬 상태·권한에 좌우된다 — 같은 테스트가
 * 어느 머신에서는 셸 4종을, 다른 머신에서는 5종을 보는 것이다. 게이트가 머신에
 * 따라 갈리면 게이트가 아니다.
 *
 * `WiringFactories.probeDocker`가 열려 있는 이유가 정확히 이것이라고 구현이
 * 주석으로 밝히고 있다(`src/wiring.ts` — "여기가 열려 있지 않으면 세 갈래
 * (가용/불가용/옵트아웃)의 검증이 테스트 머신의 Docker 설치 여부에 좌우된다").
 * **`startCli`를 부르는 모든 테스트는 셋 중 하나를 명시 주입한다.**
 *
 * **이것은 규율이 아니라 게이트가 강제하는 계약이다** (2026-08-10 판정 D-1) —
 * `scripts/check-core-budget.mjs`의 교차 파일 검사 5번이 `startCli`를 부르는
 * `*.test.ts`에 주입이 있는지 보고, 없으면 `pnpm check`가 실패한다. 잊어도 테스트는
 * 통과하고 느려질 뿐이라 사람 눈에는 안 보이기 때문이다(`ARCHITECTURE.md` §2.6).
 *
 * **계약 문면도, 그 검사가 무엇을 못 잡는지도 `docs/SANDBOX.md` §3이 정본이다.**
 * 여기서 범위를 다시 서술하지 않는다 — 2026-08-10 독립 검증(F-V3)이 이 자리의 서술이
 * 낡아 게이트를 실제보다 좁게 말하고 있는 것을 잡았고, 원인은 같은 사실을 두 곳에서
 * 각자의 말로 적은 것이었다.
 *
 * **이 파일을 쓰는 것이 유일한 이행 방법은 아니다.** 계약은 "주입했는가"이지
 * "이 헬퍼를 들였는가"가 아니라서, 다른 작성자의 하네스에 의존하지 않아야 할 이유가
 * 있으면 자체 스텁을 `factories.probeDocker`에 넣어도 된다(`distribution-qa-b`가 그렇다).
 *
 * 이 파일은 테스트가 아니다(`*.test.ts`가 아니므로 vitest가 수집하지 않는다).
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import type { DockerAvailability, SandboxImageAvailability } from "@neo-agent/sandbox";

/** 표시에 쓰이는 서버 버전 문자열. 실물과 헷갈리지 않게 `test-` 접두를 둔다 */
export const PROBE_VERSION = "test-29.6.2";

/**
 * Docker 가용 — `sandbox: "on"`에서 `DockerShellExecutor`가 선택되는 갈래.
 *
 * 실제 데몬에 닿지 않는다. 이 갈래에서 배선이 만드는 실행자는 컨테이너를 띄우기
 * 전까지 아무것도 하지 않으므로(생성은 인자 조립뿐) 실물 팩토리를 그대로 써도
 * 프로세스가 뜨지 않는다.
 */
export function dockerAvailable(
  version: string = PROBE_VERSION,
): () => Promise<DockerAvailability> {
  return async () => ({ available: true, version });
}

/**
 * Docker 불가용 — 셸 도구를 등록하지 않는 갈래(**에러가 아니다**, `SANDBOX.md` §3).
 *
 * 기본 `reason`을 "permission denied"로 둔 것은 2026-08-09 실측(개발 VPS)의 실제
 * 양태이기 때문이다 — 미설치가 아니라 **데몬 접근 거부**가 흔한 실패다.
 */
export function dockerUnavailable(
  reason = "docker version이 종료 코드 1로 끝났다: permission denied while trying to connect to the Docker daemon socket",
): () => Promise<DockerAvailability> {
  return async () => ({ available: false, reason });
}

/**
 * 판정이 **일어나면 안 되는** 갈래용 — `sandbox: "off"`.
 *
 * §5b는 "`sandbox: "off"`면 판정 자체를 하지 않는다(쓰지 않을 사실을 알아내려고
 * 기동을 늦출 이유가 없다)"이다. 그 계약은 "불리지 않았다"를 관측해야 검증되므로
 * 불리면 기동을 실패시키는 값을 준다.
 */
export function dockerProbeForbidden(): () => Promise<DockerAvailability> {
  return async () => {
    throw new Error(
      'probeDocker가 불렸다 — sandbox: "off"에서는 Docker 판정을 하지 않는 것이 계약이다(CLI-INTERFACE §2 단계 5b).',
    );
  };
}

/**
 * 이미지 실재 프로브가 **불리면 안 되는** 갈래용 — `SANDBOX.md` §3.
 *
 * **왜 기본이 「금지」인가.** `probeSandboxImage`의 소비자는 오늘 `doctor` 하나이고
 * **시작 시퀀스 5b는 그것을 부르지 않는다**(같은 절의 이미지 프로브 항 4). 그래서
 * `startCli`·`runCli`를 부르되 진단을 부르지 않는 테스트에서는 이 팩토리가 한 번도
 * 불리지 않는 것이 계약이다 — 불리는 순간 그것은 실물 docker에 닿을 뻔했다는 신호이므로
 * 조용히 값을 돌려주는 대신 던진다.
 *
 * **주입을 게이트가 요구하는 이유는 그 파일이 오늘 부르기 때문이 아니라 부를 수 있기
 * 때문이다** — argv가 `doctor`이면 `runCli`가 여기에 닿는다. 게이트는 argv를 못 보므로
 * 닿을 수 있는 쪽으로 넘어지고(`scripts/check-core-budget.mjs`의 `INJECTION_ENTRY_POINTS`),
 * 그 요구를 이 스텁이 값싸게 채운다. 진단을 실제로 재는 테스트는 이것을 쓰지 않고
 * 세 갈래(`present`·`absent`·`unknown`)를 자기가 낸다.
 */
export function sandboxImageProbeForbidden(): (options: {
  image: string;
}) => Promise<SandboxImageAvailability> {
  return async ({ image }) => {
    throw new Error(
      `probeSandboxImage가 불렸다(${image}) — 이 테스트는 진단(doctor)을 부르지 않으므로 이 프로브에 닿을 수 없는 것이 계약이다(SANDBOX.md §3).`,
    );
  };
}
