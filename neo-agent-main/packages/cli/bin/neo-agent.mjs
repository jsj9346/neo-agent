#!/usr/bin/env node
/**
 * `neo-agent` bin 진입점 — `docs/DISTRIBUTION.md` §3.2.
 *
 * **이 파일이 하는 일은 둘뿐이다**: ① Node 버전 게이트 ② 통과하면 `../src/main.ts`를
 * 동적 import. 그 외 어떤 것도 하지 않는다.
 *
 * 왜 순수 JS인가 — 닭과 달걀이다. 타입 스트리핑이 없는 Node에서 `.ts`를 실행하면
 * `ERR_UNKNOWN_FILE_EXTENSION`류의 암호 같은 실패로 죽는다. 버전을 검사하는 코드가
 * `.ts`면 그 코드부터 실행되지 않는다. `package.json`의 `engines`는 `pnpm install`
 * 시점에만 보이므로 실행 시점을 지키지 못한다.
 *
 * **정적 `import`가 0건이다.** 설계 계약(§3.2 "shim은 그 외 어떤 것도 import하지
 * 않는다")이고, 예산 게이트가 이 파일의 임포트 지정자를 뽑아 기계적으로 강제한다.
 * 정적 임포트는 모듈 본문보다 먼저 평가되므로, 하나라도 있으면 그것이 실패하는
 * 저버전 Node에서 게이트 메시지 대신 그 실패가 먼저 나온다 — 이 파일의 존재 이유가
 * 그 순간 사라진다.
 *
 * `main.ts`가 `process.*`를 읽는 유일한 곳이라는 계약은 유지된다. shim은
 * `process.versions`를 **조립에 흘려보내지 않고 자기 실행 가부만 판정한다**.
 */

/**
 * 지원 Node 하한. `TECH-STACK.md` §2가 정한 24이며 **모든 `package.json`의
 * `engines.node`와 같은 값이어야 한다** — 일치는 예산 게이트가 강제한다
 * (`DISTRIBUTION.md` §3.2 마지막 항 · §4).
 */
const MIN_NODE_MAJOR = 24;

/**
 * 기동 실패 종료 코드.
 *
 * **중복이다.** `packages/cli/src/wiring.ts`의 `EXIT_STARTUP_FAILED = 1`과 같은 값을
 * 써야 하지만 여기서 import할 수 없다 — 그것은 `.ts`이고, `.ts`를 로드하기 전에
 * 판정하는 것이 이 파일의 존재 이유다. 값을 여기 리터럴로 적고 그 사실을 이 주석으로
 * 밝힌다. 동기화는 예산 게이트가 본다.
 */
const EXIT_STARTUP_FAILED = 1;

const currentMajor = Number.parseInt(process.versions.node.split(".")[0], 10);

// fail-closed — major를 못 읽으면(NaN) 통과가 아니라 실패다. 판정할 수 없는 것을
// 통과시키면 그 다음에 나오는 것이 바로 이 파일이 대체하려던 암호 같은 실패다.
if (!Number.isInteger(currentMajor) || currentMajor < MIN_NODE_MAJOR) {
  process.stderr.write(
    [
      "neo-agent: 이 Node 버전으로는 실행할 수 없습니다.",
      "",
      `  원인      neo-agent는 TypeScript 소스를 빌드 없이 그대로 실행합니다. 그러려면 Node의 네이티브 타입 스트리핑이 필요한데, Node ${MIN_NODE_MAJOR} 미만에는 없습니다.`,
      `  현재      Node ${process.versions.node}`,
      `  요구      Node ${MIN_NODE_MAJOR} 이상`,
      `  다음 행동  Node ${MIN_NODE_MAJOR} 이상을 설치한 뒤 다시 실행하세요. 버전 관리자를 쓴다면 예: nvm install ${MIN_NODE_MAJOR} && nvm use ${MIN_NODE_MAJOR}`,
      "",
    ].join("\n"),
  );
  process.exit(EXIT_STARTUP_FAILED);
}

await import("../src/main.ts");
