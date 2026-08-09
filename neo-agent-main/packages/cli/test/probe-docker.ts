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
 * 이 파일은 테스트가 아니다(`*.test.ts`가 아니므로 vitest가 수집하지 않는다).
 */

import type { DockerAvailability } from "@neo-agent/sandbox";

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
