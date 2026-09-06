/**
 * `@neo-agent/sandbox` 공개 표면 — `docs/SANDBOX.md` §2.
 *
 * 이 배럴이 드는 것 — 가용 판정(`probeDocker` — 조건부 노출의 근거), 이미지 실재 프로브
 * (`probeSandboxImage` — §3이 2026-09-06에 신설했고 소비자는 `neo-agent doctor`의
 * `sandbox-image` 축 하나다), 실행자(`createDockerShellExecutor` — `HostShellExecutor`의
 * 교체물). 배선은 CLI 한 곳이다.
 *
 * 수를 세는 서술을 쓰지 않는다 — 이 자리가 정확히 그 부패로 한 번 거짓이 됐다(표면이
 * 셋이 된 순간 「두 가지」가 틀렸다).
 */

export {
  type DockerAvailability,
  type DockerProcess,
  type DockerRunner,
  type DockerRunOptions,
  type ProbeSandboxImageOptions,
  probeDocker,
  probeSandboxImage,
  type SandboxImageAvailability,
} from "./docker.ts";
export { createDockerShellExecutor, type DockerShellExecutorOptions } from "./executor.ts";
