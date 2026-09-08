/**
 * 크리덴셜 로더 — `docs/CLI-INTERFACE.md` §4 (`SAFE-DEFAULTS.md` §3 보호 계약의 구현).
 *
 * 별도 패키지가 아니라 CLI 내부 모듈인 것은 시크릿 종류가 둘이고 각각의 소비 지점이
 * 하나씩이라 간접 계층이 사는 자리가 아직 없기 때문이다(§4). 2026-09-02 개정 —
 * 검색 API 키가 같은 파일의 두 번째 항목이 되며 수가 낡았다(`docs/WEB-ACCESS.md` §3.2).
 * **판정은 그대로이고 근거의 수만 고쳤다.**
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

import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
/**
 * 출처의 정의역은 **여기서 다시 쓰지 않고 온보딩 계약에서 가져온다**(§2.3 「계약 표면」이
 * `noteSkipped(step, source: "env" | "file")`로 그 열거를 든다). 유니온 리터럴을 두 파일에
 * 복제하면 한쪽에 셋째 값이 생기는 날 다른 쪽이 조용히 안 따라온다 — 화면이 못 말하는
 * 출처가 생기는 형태다. **타입 전용 임포트라 런타임 의존은 생기지 않는다**(`onboarding.ts`가
 * 이 모듈의 `writeCredentialValues`를 값으로 부르므로, 값 임포트였다면 순환이었다).
 */
import type { OnboardingSkipSource } from "./onboarding.ts";

/** 모델 프로바이더 API 키를 담은 env 변수 이름 (§4 우선순위 1) */
export const API_KEY_ENV = "ANTHROPIC_API_KEY";

/**
 * 검색 프로바이더 API 키를 담은 env 변수 이름 (§4 「대상 키 둘」의 두 번째).
 *
 * 이 키의 부재는 기동 실패가 아니다 — `docs/WEB-ACCESS.md` §3.2 등록 항이
 * "검색 키가 없으면 도구를 등록하지 않는다. 기동은 막지 않는다"로 정한다.
 */
export const SEARCH_API_KEY_ENV = "TAVILY_API_KEY";

/** group·other 비트. 하나라도 서 있으면 소유자 외 접근이 가능하다 */
const EXPOSED_BITS = 0o077;
const REQUIRED_MODE = 0o600;
const DIRECTORY_MODE = 0o700;

export interface LoadedCredentials {
  /** 모델 프로바이더 어댑터에 넘길 API 키. 두 경로 모두 없으면 기동이 실패하므로 항상 있다 */
  apiKey: string;
  /**
   * 검색 프로바이더 API 키. **없어도 기동한다** — 없으면 `web_search`를 등록하지
   * 않을 뿐이다(§4 「대상 키 둘」·`docs/WEB-ACCESS.md` §3.2 등록 항). 등록 판단의
   * 소유자는 배선이고 이 모듈은 있고 없음만 돌려준다.
   */
  searchApiKey?: string;
  /**
   * 로드된 시크릿 값 전부. executor의 env 스크러빙 대상이다(§4 보호 계약 3).
   *
   * **두 갈래의 합집합이다**(§4). 즉 "파일을 읽었으면 키 이름과 무관하게 그 파일의
   * 모든 값이 들어가고, env로 온 값도 함께 들어간다" — 시크릿 전용 파일이므로 거기
   * 적힌 값은 전부 시크릿이고, `ANTHROPIC_API_KEY`가 아닌 줄만 자식 프로세스로 새어
   * 나가는 비대칭을 만들 이유가 없다.
   *
   * 합집합인 것이 계약인 이유: 모델 키를 env로 준 설치에서도 파일의 값들이 스크러빙
   * 대상에 들어가야 보호 계약 3이 **env 갈래에서도** 참이 된다. env 갈래에서 파일
   * 값을 빼면 그 갈래에서만 자식 프로세스로 시크릿이 새어 나간다.
   */
  secretValues: readonly string[];
}

/**
 * 「읽기」의 반환 — `docs/CLI-INTERFACE.md` §4의 **로더 분할**(2026-09-08, `K-573`).
 *
 * `LoadedCredentials`와 갈리는 것은 **모델 키의 부재를 실패로 옮기는가** 하나다. 이
 * 레코드는 안 옮긴다 — 첫 실행 온보딩 경로에서는 그 부재가 실패가 아니라 **입력**이기
 * 때문이다(§2.3). 그래서 `apiKey`가 옵셔널이고, 그 옵셔널이 두 경로의 차이 전부다.
 *
 * **600 fail-closed는 이 층에 있다.** 파일이 존재하면 사용 여부와 무관하게 검사하므로
 * (§4 보호 계약 1) 온보딩도 그 검사를 받는다 — §2.3 `0a`의 크리덴셜 축이 이것이다.
 */
export interface CredentialsProbe {
  /** 없을 수 있다 — 그것이 이 레코드의 존재 이유다 */
  apiKey?: string;
  searchApiKey?: string;
  /**
   * `apiKey`를 **어디서 찾았는가**. 키를 찾았을 때만 있다 — 값이 없으면 출처도 없다.
   *
   * **이 필드가 이 레코드에 있는 것이 계약이다**(§2.3 「이미 있는 값은 묻지 않는다」).
   * 그 소절은 건너뛴 사실과 «값을 어디서 찾았는지»가 화면에 남는 것을 계약으로 들고,
   * 같은 소절이 *"판정기를 새로 만들지 않고 §4의 로더를 그대로 쓴다"*를 함께 든다.
   * 출처를 호출자가 env를 다시 들여다봐 파생하면 **§4의 키별 우선순위 판정기가 둘이
   * 되고**, 갈리는 날 화면이 «파일에서 찾았다»고 거짓을 말한다. 우선순위를 아는 자리는
   * `resolveKey` 하나뿐이므로 출처도 거기서 값과 **함께** 나온다.
   *
   * `LoadedCredentials`에는 이 필드가 없다 — 출처를 필요로 하는 것은 온보딩 고지
   * 하나이고, 그 경로가 쓰는 레코드는 이쪽이다(§4 로더 분할).
   */
  apiKeySource?: OnboardingSkipSource;
  /** `searchApiKey`의 출처. 위와 같은 규율이고 키가 없으면 없다 */
  searchApiKeySource?: OnboardingSkipSource;
  /** 두 갈래의 합집합. 근거는 `LoadedCredentials.secretValues`가 든다 */
  secretValues: readonly string[];
  /** 파일이 실재했는가. 안내 문면이 두 갈래로 갈리므로 호출자가 필요로 한다 */
  fileExists: boolean;
}

export function defaultCredentialsPath(home?: string): string {
  return join(home ?? homedir(), ".neo-agent", "credentials");
}

/**
 * 크리덴셜을 로드한다. 키 하나를 두고 우선순위는 env → 파일이며, **우선순위는 키마다
 * 독립이다**(§4). env의 그 키가 "있으면 그 키에 한해 파일 값을 쓰지 않는다" — 한 키를
 * env로 준 것이 다른 키의 파일 값을 가리지 않는다.
 *
 * 파일의 **권한 검사는 어느 갈래에서도 건너뛰지 않는다** — env로 키를 받았어도 느슨한
 * 파일의 존재 자체가 노출 사실이다. 자동 chmod로 조용히 고치지 않는 것도 계약이다
 * (SAFE-DEFAULTS §3.1): 노출돼 있었다는 사실이 사용자에게 보여야 한다.
 *
 * 실패는 **모델 키의 부재 하나뿐**이다. 검색 키가 없으면 `searchApiKey`가 없는 채로
 * 돌아간다 — "검색 키의 부재는 이 안내에 끼지 않는다"(§4 키 부재 항).
 */
export function loadCredentials(
  env: NodeJS.ProcessEnv,
  credentialsPath: string,
): LoadedCredentials {
  const probe = probeCredentials(env, credentialsPath);

  // **부재 판정은 여기 하나다.** 이 줄이 「읽기」와 갈리는 지점 전부이고, 첫 실행
  // 온보딩은 위 `probeCredentials`까지만 쓴다(§2.3 · §4 로더 분할).
  if (probe.apiKey === undefined) {
    throw new Error(
      probe.fileExists
        ? `${credentialsPath}에 ${API_KEY_ENV}가 없다.\n\n${credentialsFileHint(credentialsPath)}`
        : missingKeyMessage(credentialsPath),
    );
  }

  return {
    apiKey: probe.apiKey,
    ...(probe.searchApiKey === undefined ? {} : { searchApiKey: probe.searchApiKey }),
    secretValues: probe.secretValues,
  };
}

/**
 * 「읽기」 — 두 경로에서 키를 찾되 **부재를 실패로 옮기지 않는다**(§4 로더 분할).
 *
 * 600 fail-closed·형식 오류·읽기 실패는 여전히 던진다. 갈리는 것은 모델 키의 부재
 * 하나뿐이고, 그것을 실패로 옮기는 자리는 `loadCredentials`다.
 */
export function probeCredentials(
  env: NodeJS.ProcessEnv,
  credentialsPath: string,
): CredentialsProbe {
  // 순서가 계약이다 — 사용 여부와 무관한 검사이므로 어느 키의 갈래보다도 앞이다.
  // 키별 우선순위를 「env로 받은 키가 있으면 파일 갈래로 안 간다」의 형태로 짜면 이
  // 검사가 갈래 안으로 밀려 들어가 보호 계약 1이 함께 무너진다(§4).
  const fileExists = assertSafePermissions(credentialsPath);

  // 파일은 **키와 무관하게** 한 번 읽는다. 키별 독립 우선순위이므로 어느 한 키가 env에
  // 있다는 사실로 파일 읽기를 건너뛸 수 없다 — 건너뛰면 다른 키의 파일 값이 안 읽힌다.
  //
  // [미규정] 두 키가 **모두** env에 있을 때도 파일을 파싱하는가. 문서는 정하지 않는다.
  // 파싱한다 — 그래야 `secretValues` 합집합(§4)이 그 구성에서도 성립하고, 형식이 어긋난
  // 파일이 갈래에 따라 보였다 안 보였다 하지 않는다. 대가는 그 구성에서 파일 형식 오류가
  // 기동을 막는다는 것이고, 이는 fail-closed 방향이라 받아들인다.
  const entries = fileExists
    ? parseDotenv(readCredentialsFile(credentialsPath), credentialsPath)
    : new Map<string, string>();

  const secretValues = new Set<string>();
  for (const value of entries.values()) {
    if (value !== "") secretValues.add(value);
  }

  const apiKey = resolveKey(env, entries, API_KEY_ENV, secretValues);
  const searchApiKey = resolveKey(env, entries, SEARCH_API_KEY_ENV, secretValues);

  // 값과 출처를 **한 스프레드로** 싣는다 — 「출처는 값이 있을 때만 있다」가 이 형태로
  // 강제된다. 따로 실으면 값 없이 출처만 있는 무의미한 조합이 표현 가능해진다.
  return {
    ...(apiKey === undefined ? {} : { apiKey: apiKey.value, apiKeySource: apiKey.source }),
    ...(searchApiKey === undefined
      ? {}
      : { searchApiKey: searchApiKey.value, searchApiKeySource: searchApiKey.source }),
    secretValues: Object.freeze([...secretValues]),
    fileExists,
  };
}

/** 찾은 값과 **그것을 찾은 자리**. 둘은 한 판정에서 함께 나오므로 함께 다닌다 */
interface ResolvedKey {
  readonly value: string;
  readonly source: OnboardingSkipSource;
}

/**
 * 키 하나를 env → 파일 순으로 찾는다. 값을 찾았고 그것이 **env에서 왔다면** 스크러빙
 * 집합에 넣는다 — 파일 값은 호출자가 이미 통째로 넣었다(§4 합집합).
 *
 * **출처를 값과 함께 돌려주는 것이 이 함수의 계약이다**(§2.3 · `CredentialsProbe.apiKeySource`).
 * env 갈래와 파일 갈래를 아는 자리가 여기 하나이므로, 출처를 밖에서 다시 계산하면 §4의
 * 우선순위 판정기가 둘이 된다. 반환 자리마다 리터럴을 적는 것이 아니라 **갈래를 고르는
 * `return`이 곧 출처를 정하는 `return`**이다 — 둘이 어긋날 자리가 없다.
 *
 * [미규정] 빈 문자열·공백뿐인 값의 처리. 값이 없는 변수를 "명시적 제공"으로 보면 그
 * 뒤의 모든 경로가 "키가 있는데 인증이 안 된다"로 흐른다. 부재로 보고 다음 자리로
 * 넘어간다 — env가 그러면 파일로, 파일이 그러면 부재로.
 */
function resolveKey(
  env: NodeJS.ProcessEnv,
  entries: Map<string, string>,
  name: string,
  secretValues: Set<string>,
): ResolvedKey | undefined {
  const fromEnv = env[name];
  if (fromEnv !== undefined && fromEnv.trim() !== "") {
    secretValues.add(fromEnv);
    return { value: fromEnv, source: "env" };
  }

  const fromFile = entries.get(name);
  if (fromFile !== undefined && fromFile.trim() !== "") {
    return { value: fromFile, source: "file" };
  }

  return undefined;
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
 *
 * **이 안내가 나가는 것은 `returning` 경로다**(2026-09-08 — §4의 키 부재 항). 첫 실행
 * 경로에서는 모델 키의 부재가 실패가 아니라 온보딩의 **입력**이므로 이 자리에 닿지
 * 않는다 — 그 갈래의 정본은 §2.3이다.
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

/**
 * 온보딩이 받은 키를 `credentials`에 **얹는다** — `docs/CLI-INTERFACE.md` §2.3의 `0d`.
 *
 * **통째 교체가 아니다.** 파일에 이미 다른 키가 있을 수 있고(§2.3 「이미 있는 값은 묻지
 * 않는다」가 그 조합을 든다), 통째로 쓰면 온보딩이 안 물은 값이 사라진다. 그래서 줄
 * 단위로 얹는다 — **주석과 줄 순서가 보존된다**(`config.json`의 JSON 재직렬화가 들여쓰기만
 * 잃는 것과 달리, dotenv에는 주석이 있어 파싱→재직렬화가 사용자의 글을 지운다).
 *
 * **받지 않은 키는 안 쓴다.** 인자가 옵셔널인 것이 그 강제이고, 그래서 env로 온 시크릿이
 * 파일로 복사되는 경로가 표현 불가능하다(§2.3 계약 표면).
 *
 * 원자적 쓰기·디렉터리 700·파일 600은 `config-surface.ts`의 형태와 같다. 쓰다 죽어서
 * 읽을 수 없는 파일이 남으면 다음 기동이 자기 fail-closed에 걸려 죽는다 — 온보딩이 자기
 * 산출물로 사용자를 못 뜨는 프로세스에 보내는 형태다(§2.3).
 */
export function writeCredentialValues(
  credentialsPath: string,
  values: { readonly apiKey?: string; readonly searchApiKey?: string },
): void {
  const pending = new Map<string, string>();
  if (values.apiKey !== undefined) pending.set(API_KEY_ENV, values.apiKey);
  if (values.searchApiKey !== undefined) pending.set(SEARCH_API_KEY_ENV, values.searchApiKey);
  if (pending.size === 0) return;

  const existing = assertSafePermissions(credentialsPath)
    ? readCredentialsFile(credentialsPath)
    : undefined;

  // 형식이 어긋난 파일 위에 얹지 않는다 — fail-closed. 한 줄만 고쳐 다시 쓰면 사용자가
  // 안 고친 위반을 조용히 덮는 것이 되고, 어느 쪽이 의도였는지 알 방법이 없다
  // (§3.2 계약 4가 `/config set`에 대해 이미 든 근거).
  if (existing !== undefined) parseDotenv(existing, credentialsPath);

  const lines = existing === undefined ? [] : existing.split("\n");
  const replaced = new Set<string>();

  const merged = lines.map((rawLine) => {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) return rawLine;
    const separator = line.indexOf("=");
    if (separator <= 0) return rawLine;
    const key = line.slice(0, separator).trim();
    const value = pending.get(key);
    if (value === undefined) return rawLine;
    replaced.add(key);
    return `${key}=${value}`;
  });

  while (merged.length > 0 && merged[merged.length - 1]?.trim() === "") merged.pop();
  for (const [key, value] of pending) {
    if (!replaced.has(key)) merged.push(`${key}=${value}`);
  }

  writeCredentialsAtomically(credentialsPath, `${merged.join("\n")}\n`);
}

/** 임시 파일 + rename. 임시 파일은 **대상 디렉터리 안**이어야 rename이 원자적이다 */
function writeCredentialsAtomically(credentialsPath: string, text: string): void {
  const directory = dirname(credentialsPath);
  const temporary = join(directory, `.${basename(credentialsPath)}.tmp-${crypto.randomUUID()}`);

  try {
    mkdirSync(directory, { recursive: true, mode: DIRECTORY_MODE });
  } catch (error) {
    throw new Error(
      `${directory}를 만들 수 없다 (${errorCode(error)}). 크리덴셜은 저장되지 않았고 기존 파일은 그대로다.`,
    );
  }

  try {
    writeFileSync(temporary, text, { encoding: "utf8", mode: REQUIRED_MODE });
  } catch (error) {
    throw new Error(
      `${credentialsPath}에 쓸 수 없다 (${errorCode(error)}). 크리덴셜은 저장되지 않았고 기존 파일은 그대로다.`,
    );
  }

  try {
    renameSync(temporary, credentialsPath);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // 임시 파일 정리는 최선 노력이다. 실패해도 원본은 그대로이므로 계약은 지켜진다.
    }
    throw new Error(
      `${credentialsPath}를 교체할 수 없다 (${errorCode(error)}). 크리덴셜은 저장되지 않았고 기존 파일은 그대로다.`,
    );
  }
}

function errorCode(error: unknown): string {
  return (error as NodeJS.ErrnoException).code ?? "unknown";
}
