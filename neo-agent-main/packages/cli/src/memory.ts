/**
 * 메모리 디렉터리 경로 — `docs/MEMORY.md` §2·§9 M-2, `docs/CLI-INTERFACE.md` §3.
 *
 * **설정 키가 아니다.** 위치는 `~/.neo-agent/memory/` 고정이고 config로 바꿀 수 없다
 * (M-2 닫힘). 웹의 "완화 설정 표면을 만들지 않는다"와 근거가 다르다 — 메모리는
 * **경로가 곧 격리**다: `~/.neo-agent/` 아래라서 `packages/tools`의 크리덴셜
 * denylist가 파일 도구 3종을 전부 막고, 그래서 `remember`가 에이전트에게 유일한
 * 문이 된다. 이 경로를 열면 사용자가 워크스페이스를 가리킬 수 있고 그 순간
 * `write_file` 한 번으로 예산·표시·오염 정책이 전부 우회된다.
 *
 * 그래서 이 파일에는 함수 하나뿐이고, allowlist·크리덴셜 경로와 같은 모양이다 —
 * 같은 디렉터리 아래의 같은 성격의 경로이므로 다른 형태를 만들 이유가 없다.
 */

import { homedir } from "node:os";
import { join } from "node:path";

/** `~/.neo-agent/memory` (§2). `home`은 테스트가 임시 홈을 주입하는 자리다 */
export function defaultMemoryDir(home?: string): string {
  return join(home ?? homedir(), ".neo-agent", "memory");
}
