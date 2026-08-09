/**
 * `@neo-agent/sandbox` 공개 표면 — `docs/SANDBOX.md` §2.
 *
 * 두 가지뿐이다: 가용 판정(`probeDocker` — 조건부 노출의 근거)과 실행자
 * (`createDockerShellExecutor` — `HostShellExecutor`의 교체물). 배선은 CLI 한 곳이다.
 */

export {
  type DockerAvailability,
  type DockerProcess,
  type DockerRunner,
  type DockerRunOptions,
  probeDocker,
} from "./docker.ts";
export { createDockerShellExecutor, type DockerShellExecutorOptions } from "./executor.ts";
