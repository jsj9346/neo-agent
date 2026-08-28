/**
 * 브라우저 e2e 하네스가 제 위치를 아는 자리.
 *
 * 이 디렉터리는 `docs/TECH-STACK.md` §7.1 결정 3이 정한 루트의 별도 디렉터리이고,
 * 워크스페이스 패키지가 아니므로 `package.json`을 갖지 않는다. 즉 여기서 레포 안의
 * 다른 파일에 닿는 수단은 이 모듈이 계산하는 절대 경로뿐이다.
 *
 * **이 파일이 배선의 일부인 이유** — 옆 `tsconfig.json`의 `include`가 이 디렉터리의
 * 모든 `.ts`를 무는데 입력이 0건이면 `tsc`가 TS18003(No inputs were found)으로
 * **붉는다.** 즉 결정 2가 요구한 「타입 검사 모집단 안」은 이 디렉터리에 `.ts`가
 * 하나라도 있어야 성립한다.
 */

import { fileURLToPath } from "node:url";

/** 이 디렉터리(`neo-agent-main/e2e/`)의 절대 경로. 끝에 구분자가 붙는다. */
export const E2E_DIR = fileURLToPath(new URL(".", import.meta.url));

/** 워크스페이스 루트(`neo-agent-main/`)의 절대 경로. 끝에 구분자가 붙는다. */
export const WORKSPACE_ROOT = fileURLToPath(new URL("../", import.meta.url));
