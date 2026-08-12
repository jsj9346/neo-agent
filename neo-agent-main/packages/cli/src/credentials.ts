/**
 * 크리덴셜 로더 — `docs/CLI-INTERFACE.md` §4 (`SAFE-DEFAULTS.md` §3 보호 계약의 구현).
 *
 * 별도 패키지가 아니라 CLI 내부 모듈인 것은 시크릿이 1개이고 소비 지점이 1곳이기
 * 때문이다(§4).
 *
 * 보호 계약 4개 중 이 모듈이 이행하는 것은 둘이다:
 * 1. **600 fail-closed** — 파일이 존재하면 사용 여부와 무관하게 검사한다.
 * 4. **워크스페이스 `.env` 무시** — 구조적 이행이다. 읽는 경로가 env와 전용 파일
 *    두 개뿐이고, `.env`를 스캔하는 코드가 이 파일에 존재하지 않는다.
 *
 * 나머지 둘은 다른 곳이다 — 자기접근 차단은 도구의 denylist, 자식 프로세스 env
 * 스크러빙은 executor. 후자를 위해 **로드한 시크릿 값 목록을 함께 돌려준다**:
 * 값 기반 제거가 성립하려면 executor가 값을 알아야 한다(§4).
 */

import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** 프로바이더 API 키를 담은 env 변수 이름 (§4 우선순위 1) */
export const API_KEY_ENV = "ANTHROPIC_API_KEY";

/** group·other 비트. 하나라도 서 있으면 소유자 외 접근이 가능하다 */
const EXPOSED_BITS = 0o077;
const REQUIRED_MODE = 0o600;

export interface LoadedCredentials {
  /** 프로바이더 어댑터에 넘길 API 키 */
  apiKey: string;
  /**
   * 로드된 시크릿 값 전부. executor의 env 스크러빙 대상이다(§4 보호 계약 3).
   *
   * 파일에서 읽었다면 **키 이름과 무관하게 그 파일의 모든 값**이 들어간다 —
   * 시크릿 전용 파일이므로 거기 적힌 값은 전부 시크릿이고, `ANTHROPIC_API_KEY`가
   * 아닌 줄만 자식 프로세스로 새어 나가는 비대칭을 만들 이유가 없다.
   */
  secretValues: readonly string[];
}

export function defaultCredentialsPath(home?: string): string {
  return join(home ?? homedir(), ".neo-agent", "credentials");
}

/**
 * 크리덴셜을 로드한다. 우선순위는 env → 파일이며, **env가 있으면 파일을 읽지
 * 않는다**(§4).
 *
 * 단 파일의 **권한 검사는 건너뛰지 않는다** — env로 키를 받았어도 느슨한 파일의
 * 존재 자체가 노출 사실이다. 자동 chmod로 조용히 고치지 않는 것도 계약이다
 * (SAFE-DEFAULTS §3.1): 노출돼 있었다는 사실이 사용자에게 보여야 한다.
 */
export function loadCredentials(
  env: NodeJS.ProcessEnv,
  credentialsPath: string,
): LoadedCredentials {
  // 순서가 계약이다 — 사용 여부와 무관한 검사이므로 env 분기보다 앞이다.
  const fileExists = assertSafePermissions(credentialsPath);

  const fromEnv = env[API_KEY_ENV];
  if (fromEnv !== undefined && fromEnv.trim() !== "") {
    // [미규정] 빈 문자열·공백뿐인 env 값의 처리. 값이 없는 변수를 "명시적 제공"으로
    // 보면 그 뒤의 모든 경로가 "키가 있는데 인증이 안 된다"로 흐른다. 부재로 보고
    // 파일로 넘어간다.
    return { apiKey: fromEnv, secretValues: Object.freeze([fromEnv]) };
  }

  if (!fileExists) {
    throw new Error(missingKeyMessage(credentialsPath));
  }

  const entries = parseDotenv(readCredentialsFile(credentialsPath), credentialsPath);
  const apiKey = entries.get(API_KEY_ENV);
  if (apiKey === undefined || apiKey.trim() === "") {
    throw new Error(
      `${credentialsPath}에 ${API_KEY_ENV}가 없다.\n\n${credentialsFileHint(credentialsPath)}`,
    );
  }

  const secretValues = [...new Set([...entries.values()].filter((value) => value !== ""))];
  return { apiKey, secretValues: Object.freeze(secretValues) };
}

/**
 * 파일이 있으면 권한을 검사한다. 반환값은 **존재 여부**다.
 *
 * **판정 기준은 group·other 비트의 존재이지 600과의 상등이 아니다** — `CLI-INTERFACE.md`
 * §4가 정한다. 그래서 `0400`처럼 더 좁은 권한은 통과한다.
 *
 * 근거를 여기 옮겨 적지 않는다(§4가 SAFE-DEFAULTS §3.1까지 짚어 둔다). 한때 이 자리에
 * *"상등으로 볼지 노출 비트로 볼지"*가 열린 물음으로 달려 있었으나 §4가 노출 비트로
 * 닫았고, 그 뒤로도 물음만 남아 있던 것을 2026-08-12에 걷었다.
 */
function assertSafePermissions(credentialsPath: string): boolean {
  let mode: number;
  try {
    mode = statSync(credentialsPath).mode & 0o777;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw new Error(
      `${credentialsPath}의 권한을 확인할 수 없다 (${(error as NodeJS.ErrnoException).code ?? "unknown"}). ` +
        "확인하지 못한 채로는 기동하지 않는다.",
    );
  }

  if ((mode & EXPOSED_BITS) !== 0) {
    throw new Error(
      `${credentialsPath}가 다른 사용자에게 열려 있다 (권한 ${toOctal(mode)}).\n` +
        `neo-agent는 이 파일을 자동으로 고치지 않는다 — 노출돼 있었다는 사실이 보여야 하기 때문이다.\n\n` +
        `  chmod ${toOctal(REQUIRED_MODE)} ${credentialsPath}\n\n` +
        "위 명령으로 권한을 좁힌 뒤 다시 실행하라. 그 사이에 키가 유출됐을 수 있다면 재발급을 권한다.",
    );
  }
  return true;
}

function readCredentialsFile(credentialsPath: string): string {
  try {
    return readFileSync(credentialsPath, "utf8");
  } catch (error) {
    throw new Error(
      `${credentialsPath}를 읽을 수 없다 (${(error as NodeJS.ErrnoException).code ?? "unknown"}).`,
    );
  }
}

/**
 * dotenv형 파싱 — `KEY=value`, `#` 주석, 빈 줄 허용(§4).
 *
 * [미규정] 방언의 범위. 파서 의존성 0이므로 규칙을 좁게 닫았다:
 * `=` 앞뒤 공백 제거, 값 전체를 감싼 따옴표(`"` 또는 `'`) 한 겹 제거, 그 외의
 * 확장(변수 전개·여러 줄 값·`export` 접두)은 지원하지 않는다. **형식이 어긋난 줄은
 * 에러다** — 조용히 건너뛰면 오타 난 줄의 키가 없는 것으로 보여 "키가 없다"는
 * 엉뚱한 안내로 이어진다(침묵 실패).
 */
function parseDotenv(content: string, credentialsPath: string): Map<string, string> {
  const entries = new Map<string, string>();

  content.split("\n").forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) return;

    const separator = line.indexOf("=");
    if (separator <= 0) {
      throw new Error(
        `${credentialsPath}:${index + 1} 형식이 KEY=value가 아니다: ${JSON.stringify(rawLine)}`,
      );
    }

    const key = line.slice(0, separator).trim();
    const value = unquote(line.slice(separator + 1).trim());
    entries.set(key, value);
  });

  return entries;
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    if ((first === '"' || first === "'") && value.endsWith(first)) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * 키가 아예 없을 때의 안내(§4 — "설정 방법(파일 생성 예시 포함)을 안내하고 종료").
 * 대화형 입력 마법사는 MVP에 없다.
 */
function missingKeyMessage(credentialsPath: string): string {
  return (
    `Anthropic API 키를 찾지 못했다.\n\n` +
    `방법 1 — 환경 변수 (일회 실행에 적합):\n` +
    `  ${API_KEY_ENV}=sk-ant-... neo-agent\n\n` +
    credentialsFileHint(credentialsPath)
  );
}

function credentialsFileHint(credentialsPath: string): string {
  return (
    `방법 2 — 크리덴셜 파일:\n` +
    `  mkdir -p ${credentialsPath.slice(0, Math.max(0, credentialsPath.lastIndexOf("/")))}\n` +
    `  printf '${API_KEY_ENV}=sk-ant-...\\n' > ${credentialsPath}\n` +
    `  chmod ${toOctal(REQUIRED_MODE)} ${credentialsPath}\n\n` +
    `이 파일에는 시크릿만 둔다 — 동작 설정은 config.json이다.`
  );
}

function toOctal(mode: number): string {
  return `0${mode.toString(8).padStart(3, "0")}`;
}
