/**
 * 진단 명령 `neo-agent doctor` — `docs/CLI-INTERFACE.md` §5.1.
 *
 * **시작 시퀀스를 타지 않고 검사기만 공유한다**(계약 1). `startCli`를 부르지 않으므로
 * 홈이 생기지 않고(§2 4단계), 첫 기동 관문이 열리지 않으며(§2.1), 세션이 만들어지지
 * 않는다(§2 5단계) — 셋 다 계약 5가 이름으로 금지한 것이다.
 *
 * **모으는 자리는 검사기 안이 아니라 여기다.** `readConfigRecord`·`validateConfigRecord`·
 * `loadCredentials`·`loadMemory`·`probeDocker`·`probeSandboxImage`는 오늘 그대로 던지거나
 * 판정을 돌려주고, 이 파일이 축마다 그것을 잡아 판정 한 줄로 옮긴다. **검사기를 고치지
 * 않는 것이 「복제하지 않는다」의 가장 강한 형태다**(§5.1 계약 1) — 고치는 순간 기동이
 * 보는 것과 진단이 보는 것이 갈릴 표면이 생긴다.
 *
 * **경로 해석 함수를 새로 쓰지 않는다**(계약 2). `defaultConfigPath`·
 * `defaultCredentialsPath`·`defaultMemoryDir`를 그대로 부른다 — 안 그러면 doctor가 본
 * 파일과 기동이 읽는 파일이 갈리고, 그 갈림은 「doctor가 정상이라 한 상태에서 기동이
 * 죽는」 형태로만 관측된다.
 *
 * **출력에 ANSI를 섞지 않는다**(§5.1 계약 9 — 근거는 여전히 계약 8이다). 이 명령의
 * 정상 경로는 파이프이고 TTY 없이 도는 것이 계약이므로, 색을 섞으면 자동 점검이 받는
 * 것이 이스케이프 낀 문자열이 된다.
 */

import { loadMemory } from "@neo-agent/memory";
import type { DockerAvailability, SandboxImageAvailability } from "@neo-agent/sandbox";
import {
  type CliConfig,
  defaultConfigPath,
  readConfigRecord,
  validateConfigRecord,
} from "./config.ts";
import {
  API_KEY_ENV,
  defaultCredentialsPath,
  type LoadedCredentials,
  loadCredentials,
  SEARCH_API_KEY_ENV,
} from "./credentials.ts";
import { defaultMemoryDir } from "./memory.ts";
import { type CliDeps, describeShellRecoveryChoices, resolveFactories } from "./wiring.ts";

/** 진단 축 — 닫힌 목록. 추가는 `CLI-INTERFACE.md` §5.1의 개정이다 */
export type DoctorAxis =
  | "config"
  | "model-credentials"
  | "search-credentials"
  | "memory"
  | "docker"
  | "sandbox-image";

/**
 * 한 축의 판정. **불가능한 상태를 타입이 배제한다** — `problem`에만 다음 행동이 있고,
 * `skipped`에만 이유가 있으며, `ok`는 둘 다 갖지 않는다.
 */
export type DoctorVerdict =
  | { readonly status: "ok"; readonly observed: string }
  | { readonly status: "problem"; readonly cause: string; readonly nextAction: string }
  | { readonly status: "skipped"; readonly reason: string };

export interface DoctorFinding {
  readonly axis: DoctorAxis;
  readonly verdict: DoctorVerdict;
}

export interface DoctorReport {
  /** 축 순서는 고정이고 `DOCTOR_AXES`의 선언 순서가 정본이다 */
  readonly findings: readonly DoctorFinding[];
  /** `status === "problem"`인 축의 수. 종료 코드가 이 값 하나만 본다 */
  readonly problemCount: number;
}

/** 검사기에 넘길 자리들. 축 정의의 「다음 행동」도 이것을 받는다 */
export interface DoctorContext {
  readonly configPath: string;
  readonly credentialsPath: string;
  readonly memoryDir: string;
  /** `config` 축이 통과했을 때만 있다 — 실패하면 무엇을 잴지 모른다(계약 3) */
  readonly config?: CliConfig;
}

export interface DoctorAxisMeta {
  /** 화면에 나가는 사람 언어 축 이름. 문면은 세부다 */
  readonly label: string;
  /** `problem` 판정에 실리는 다음 행동. 원인은 검사기가 **낸** 문면이 든다(계약 6 — 던짐·반환값·경고 콜백을 가리지 않는다) */
  readonly nextAction: (context: DoctorContext) => string;
}

/**
 * 완전 레코드 — **축이 늘면 컴파일이 깨진다**(§5.1 계약 2·6 · §3.2 계약 8과 같은 수단).
 * 선언 순서가 보고서의 축 순서이고, 그 순서는 §5.1 축 표의 행 순서다.
 */
export const DOCTOR_AXES: Record<DoctorAxis, DoctorAxisMeta> = {
  config: {
    label: "설정 파일",
    nextAction: (context) =>
      `${context.configPath}를 고치거나 지운다 — 파일이 없으면 여덟 키 전부 기본값으로 돈다.`,
  },
  "model-credentials": {
    label: "모델 열쇠",
    nextAction: (context) =>
      `${API_KEY_ENV}를 환경 변수로 주거나 ${context.credentialsPath}에 ${API_KEY_ENV}=... 한 줄로 넣는다 (파일 권한은 600).`,
  },
  "search-credentials": {
    label: "검색 열쇠",
    nextAction: (context) =>
      `${SEARCH_API_KEY_ENV}를 환경 변수로 주거나 ${context.credentialsPath}에 넣으면 web_search가 등록된다. 웹 검색을 쓰지 않을 것이면 그대로 두어도 기동은 막히지 않는다.`,
  },
  memory: {
    label: "메모리",
    nextAction: (context) =>
      `${context.memoryDir} 아래의 소유자와 권한을 확인한다 — chmod 600으로 좁히면 경고가 사라진다.`,
  },
  docker: {
    label: "셸 격리 (Docker)",
    // **시작 시퀀스 5b와 같은 자리를 공유한다**(§5.1 계약 6 — *"시작 시퀀스에 이미 그
    // 문면이 있는 자리는 함수로 추출해 공유한다"*). 문면의 정본은 `wiring.ts`의
    // `describeShellRecoveryChoices` 하나이고, 여기에 복사본을 두면 같은 상황의 안내가
    // 두 문면이 된다. 원인(`reason`)과 색은 이 자리에 들어오지 않는다: 원인은 `cause`가
    // 지고(계약 6이 두 필드를 갈랐다) 색은 계약 8이 막는다.
    nextAction: () => describeShellRecoveryChoices(),
  },
  "sandbox-image": {
    label: "샌드박스 이미지",
    nextAction: (context) =>
      `docker pull ${context.config?.sandboxImage ?? "설정의 sandboxImage"}로 이미지를 받아 둔다 — 진단은 받아오지 않는다(계약 5).`,
  },
};

/** 선언 순서를 값으로 고정한다 — 보고서의 축 순서가 이 배열이다 */
const AXIS_ORDER = Object.keys(DOCTOR_AXES) as readonly DoctorAxis[];

/**
 * 축 여섯을 전량 판정한다(계약 4). **한 축의 실패가 다른 축을 멈추지 않는다** — 계약 3이
 * 든 사례들만 예외이고 그것도 `skipped`로 보인다 — 어느 사례가 왜 서는지는 그 계약이 항마다
 * 들고 여기서 다시 세지 않는다(§5.1 계약 4).
 *
 * `CliDeps`를 받는 것은 그것이 이미 호스트가 준 값의 표면이기 때문이다(§1) — `env`·
 * `home`·`io`·`factories`가 전부 거기 있고, `docker`·`sandbox-image` 축이
 * `resolveFactories(deps.factories)`를 지나야 검사가 실물 소켓 없이 이 축들을 구동할 수
 * 있다. **새 주입 표면을 만들지 않는다.**
 *
 * **상태를 하나도 바꾸지 않는다**(계약 5). 부르는 검사기 여섯 중 어느 것도 디렉터리·
 * 파일을 만들지 않고(`loadMemory`는 디렉터리가 없으면 빈 스냅샷을 돌려준다), 이미지
 * 프로브는 로컬 조회라 pull 경로를 갖지 않는다.
 */
export async function runDoctor(deps: CliDeps): Promise<DoctorReport> {
  const factories = resolveFactories(deps.factories);

  const configPath = defaultConfigPath(deps.home);
  const credentialsPath = defaultCredentialsPath(deps.home);
  const memoryDir = defaultMemoryDir(deps.home);

  const verdicts = new Map<DoctorAxis, DoctorVerdict>();

  // ── config ────────────────────────────────────────────────────────────────
  // **파일 부재는 `ok`다.** §3이 파일 없음을 유효한 상태로 두고 `readConfigRecord`가 그
  // 갈래를 `undefined`로 **구별해 돌려주는 것이 계약**이다. `problem`으로 접으면 계약 3에
  // 의해 `docker`·`sandbox-image`가 함께 `skipped`가 되어, 설정 파일이 없는 **정상**
  // 호스트에서 축 셋이 한꺼번에 무너진다.
  let config: CliConfig | undefined;
  try {
    const record = readConfigRecord(configPath);
    config = validateConfigRecord(record ?? {}, configPath);
    verdicts.set("config", {
      status: "ok",
      observed:
        record === undefined
          ? `설정 파일이 없다 (${configPath}) — 여덟 키 전부 기본값으로 돈다`
          : `${configPath} — 키 ${Object.keys(record).length}개가 검증을 지났다`,
    });
  } catch (error) {
    verdicts.set("config", problemOf("config", error, { configPath, credentialsPath, memoryDir }));
  }

  // 축 정의의 「다음 행동」이 받는 자리. `config`는 그 축이 통과했을 때만 실린다(계약 3).
  const context: DoctorContext = {
    configPath,
    credentialsPath,
    memoryDir,
    ...(config === undefined ? {} : { config }),
  };

  // ── model-credentials ─────────────────────────────────────────────────────
  let credentials: LoadedCredentials | undefined;
  try {
    credentials = loadCredentials(deps.env, credentialsPath);
    verdicts.set("model-credentials", {
      status: "ok",
      observed: `${API_KEY_ENV}를 찾았고 ${credentialsPath}의 권한 검사도 지났다`,
    });
  } catch (error) {
    verdicts.set("model-credentials", problemOf("model-credentials", error, context));
  }

  // ── search-credentials ────────────────────────────────────────────────────
  // **`model-credentials`가 `problem`이면 이 축은 `skipped`다**(계약 3 셋째 사례).
  // 크리덴셜 로더가 그 앞에서 던져 검색 열쇠를 **읽지 못했기 때문**이지 열쇠가 없어서가
  // 아니다 — 계약 2가 이 축에 배정한 반환값이 애초에 존재하지 않는다.
  if (credentials === undefined) {
    verdicts.set("search-credentials", {
      status: "skipped",
      reason: `모델 열쇠 축이 문제라 크리덴셜 로더가 그 앞에서 던졌다 — ${SEARCH_API_KEY_ENV}를 읽지 못한 것이지 없다는 뜻이 아니다`,
    });
  } else if (credentials.searchApiKey === undefined) {
    // **이 축이 계약 6의 유일한 예외이고, 그 예외는 이제 문면에 있다** (2026-09-06 —
    // `DR-2`가 §5.1 계약 6의 정정으로 닫혔다). 이 축의 검사기는 그 축에 대해 아무 문면도
    // 내지 않는다 — 계약 2가 배정한 것이 **반환값의 부재**라서다(`loadCredentials`는 검색
    // 열쇠가 없어도 던지지 않는다). 그래서 doctor가 원인을 「다시 쓰는」 것이 아니라
    // **처음 쓰는** 유일한 자리이고, 비우면 문제 축이 원인 없이 화면에 서서 §2.6이 이름
    // 붙인 방향으로 떨어진다.
    verdicts.set("search-credentials", {
      status: "problem",
      cause: `${SEARCH_API_KEY_ENV}가 환경 변수에도 ${credentialsPath}에도 없다`,
      nextAction: DOCTOR_AXES["search-credentials"].nextAction(context),
    });
  } else {
    verdicts.set("search-credentials", {
      status: "ok",
      observed: `${SEARCH_API_KEY_ENV}를 찾았다 — web_search가 등록된다`,
    });
  }

  // ── memory ────────────────────────────────────────────────────────────────
  // **권한 경고를 잡아 두고 화면으로 흘리지 않는다.** doctor의 출력은 보고서 한 벌이고,
  // 경고가 그 밖으로 새면 같은 사실이 두 문면으로 나간다. 이 축이 경고를 `problem`으로
  // 세는 것이 기동과 갈리는 유일한 자리이며(§5.1 계약 2), **기동의 판정은 그대로다.**
  const memoryWarnings: string[] = [];
  try {
    const snapshot = loadMemory({
      dir: memoryDir,
      onWarning: (message) => memoryWarnings.push(message),
    });
    if (memoryWarnings.length > 0) {
      verdicts.set("memory", {
        status: "problem",
        cause: memoryWarnings.join("\n"),
        nextAction: DOCTOR_AXES.memory.nextAction(context),
      });
    } else {
      verdicts.set("memory", {
        status: "ok",
        observed: snapshot.exists
          ? `${memoryDir} — 항목 ${snapshot.entries.length}개 · ${snapshot.chars}자`
          : `메모리 파일이 아직 없다 (${memoryDir}) — 빈 메모리로 돈다`,
      });
    }
  } catch (error) {
    // **경고는 실패가 아니다 — 「첫 실패까지」가 경고를 지우지 않는다**(§5.1 계약 4).
    // 이 축의 검사기는 문면을 두 채널로 낸다(`MEMORY.md` §2.2가 권한 갈래와 못 읽는
    // 갈래를 따로 있는 두 행으로 규정했다). 둘이 함께 나는 호스트에서 던짐만 싣고
    // 경고를 버리면 사용자의 다음 행동을 가리키던 문장이 화면에서 사라지고, 그 문장은
    // doctor의 다른 어느 자리에도 없다(`ARCHITECTURE.md` §2.6).
    //
    // **결합은 이 호출 자리에서 한다 — `problemOf`에 얹지 않는다.** 그 함수는 던짐만
    // 다루는 자리이고 §5.1 「이 절이 낳는 실물 변경」 9가 그 문면을 수정 대상에서 명시로
    // 뺐다. 경고 채널을 그리로 밀면 계약과 실물이 그 자리에서 갈린다.
    verdicts.set("memory", withPriorWarnings(problemOf("memory", error, context), memoryWarnings));
  }

  // ── docker · sandbox-image ────────────────────────────────────────────────
  // 두 축이 같은 두 조건에 함께 걸린다(계약 3 첫째·둘째 사례): `sandbox: "off"`는 쓰지
  // 않을 수단이라 부재가 결손이 아니고, `config` 축이 문제면 **무엇을 잴지 모른다**.
  //
  // **조건을 헬퍼로 빼지 않는다** — 그러면 `config`의 좁힘이 이 자리에서 사라지고,
  // 「설정이 없는데 이미지를 조회한다」는 **불가능한 상태의 대비값**(`?? ""` 같은 것)을
  // 아래에 두게 된다. 조건을 인라인으로 두면 타입이 그 상태를 애초에 배제한다.
  if (config === undefined || config.sandbox === "off") {
    const reason =
      config === undefined
        ? "설정 파일 축이 문제라 무엇을 잴지 모른다 — 기본값으로 재면 사용자 파일과 다른 것을 잰다"
        : '설정이 sandbox: "off"다 — 쓰지 않을 수단의 부재는 결손이 아니다';
    verdicts.set("docker", { status: "skipped", reason });
    verdicts.set("sandbox-image", { status: "skipped", reason });
  } else {
    const availability = await probeDockerSafely(factories);
    verdicts.set(
      "docker",
      availability.available
        ? { status: "ok", observed: `docker ${availability.version} — 데몬에 닿았다` }
        : {
            status: "problem",
            cause: availability.reason,
            nextAction: DOCTOR_AXES.docker.nextAction(context),
          },
    );

    // **`docker` 축의 실패를 이 축의 `skipped` 조건으로 삼지 않는다** — 계약 3은 이 축의
    // `skipped`를 **프로브 자신의 「못 물었다」**로만 연다. 데몬이 죽었으면 프로브가
    // `unknown`으로 답하므로 결과는 같고, 원인은 위 축에 한 번만 실린다.
    verdicts.set(
      "sandbox-image",
      verdictForImage(await probeImage(factories, config.sandboxImage), context),
    );
  }

  const findings: DoctorFinding[] = AXIS_ORDER.map((axis) => ({
    axis,
    // 위 여섯 갈래가 전부 채웠다. 비어 있으면 축 하나가 조용히 빠진 것이므로 던진다 —
    // 「판정 없는 축」이 화면에서 「괜찮다」로 읽히는 것이 §2.6이 막는 그 방향이다.
    verdict: mustHave(verdicts, axis),
  }));

  return {
    findings,
    // **`skipped`는 세지 않는다**(계약 3·7).
    problemCount: findings.filter((finding) => finding.verdict.status === "problem").length,
  };
}

/**
 * 보고서를 화면 문자열로. **이 산출이 계약으로 지는 것은 §5.1 계약 9가 든다** — 목록은
 * 그 절 하나에 두고 이 자리는 지목만 한다. 같은 목록이 두 곳에 있어 서로 갈린 것이 그
 * 계약을 낳은 결함이므로(2026-09-06 F-2), 고쳐 적는 것이 아니라 없애는 것이 처방이다.
 *
 * **[미규정 DR-3]** 그래서 이 마커가 덮는 자리는 **표시 형식**으로 좁아진다 — 배치·문면·
 * 요약 줄의 모양, 그리고 이 함수의 이름과 시그니처. §5.1은 *"보고서 렌더링"*을 이 파일의
 * 몫으로만 두었을 뿐 그것들을 정하지 않았다. 문면은 §7의 표시 문구 규약대로 세부로 두고,
 * **이 열린 판정을 정할 정본은 `docs/CLI-INTERFACE.md` §12**다(`MARKERS.md` §4.1 셋째 항).
 */
export function renderDoctorReport(report: DoctorReport): string {
  const lines: string[] = [`neo-agent doctor — 축 ${report.findings.length}개`, ""];

  for (const { axis, verdict } of report.findings) {
    const { label } = DOCTOR_AXES[axis];
    if (verdict.status === "ok") {
      lines.push(`${label} — ok`, `  본 것: ${verdict.observed}`);
    } else if (verdict.status === "problem") {
      lines.push(
        `${label} — 문제`,
        ...indented("원인", verdict.cause),
        `  다음: ${verdict.nextAction}`,
      );
    } else {
      // **이유 없는 `skipped`를 내지 않는다**(계약 3) — 안 내면 「안 쟀다」가 화면에서
      // 「괜찮다」로 읽힌다.
      lines.push(`${label} — 건너뜀`, `  이유: ${verdict.reason}`);
    }
    lines.push("");
  }

  const skipped = report.findings.filter((finding) => finding.verdict.status === "skipped").length;
  lines.push(
    report.problemCount === 0
      ? "문제 0건 — 이 호스트에서 잰 축 전부가 통과했다."
      : `문제 ${report.problemCount}건 — 각 축의 「다음」을 처리한 뒤 다시 실행한다.`,
  );
  if (skipped > 0) {
    // `skipped`가 종료 코드에 기여하지 않는다는 것을 화면이 말한다 — 안 말하면 0으로
    // 끝난 진단에서 건너뛴 축이 「통과」로 읽힌다.
    lines.push(`건너뜀 ${skipped}건은 이 구성에서 모집단 밖이라 종료 코드에 들어가지 않는다.`);
  }

  return `${lines.join("\n")}\n`;
}

/** 여러 줄짜리 원인도 들여쓰기를 잃지 않게 한다 — 권한 경고가 실제로 여러 줄이다 */
function indented(field: string, text: string): readonly string[] {
  const [first, ...rest] = text.split("\n");
  return [`  ${field}: ${first ?? ""}`, ...rest.map((line) => `        ${line}`)];
}

/**
 * 이미지 실재 프로브 호출. 던지지 않는 계약이지만(`SANDBOX.md` §3) **여기서도 감싼다** —
 * 주입된 러너가 던지면 축 하나의 사고가 나머지 다섯을 함께 삼키고, 그것이 계약 4가
 * 막는 형태다.
 */
async function probeImage(
  factories: ReturnType<typeof resolveFactories>,
  image: string,
): Promise<SandboxImageAvailability> {
  try {
    return await factories.probeSandboxImage({ image });
  } catch (error) {
    return { kind: "unknown", image, reason: describeError(error) };
  }
}

/**
 * Docker 가용 판정 호출. **`probeImage`와 같은 이유로 감싼다** — 그 함수의 근거가
 * 이 자리에도 글자 그대로 걸린다: 던지지 않는 계약이지만(`SANDBOX.md` §3) 주입된
 * 러너가 던지면 축 하나의 사고가 나머지 다섯을 함께 삼킨다.
 *
 * **형제 축만 감싸고 이 축을 비워 두면 계약 4의 「축 독립」이 여섯 중 다섯에만 선다**
 * (2026-09-06 전수 대조 F-2). 같은 위험·같은 계약에 반대 처우를 둘 근거가 없다.
 *
 * 던짐을 `available: false`로 옮기는 것이 판정을 왜곡하지 않는 이유: 이 축이 재는 것은
 * 「셸 격리 수단이 쓸 수 있는 상태인가」이고, 판정기 자신이 터진 호스트에서 그 답은
 * 「아니오」다. 원인은 `reason`이 그대로 들어 화면에서 구별된다.
 */
async function probeDockerSafely(
  factories: ReturnType<typeof resolveFactories>,
): Promise<DockerAvailability> {
  try {
    return await factories.probeDocker();
  } catch (error) {
    return { available: false, reason: describeError(error) };
  }
}

/** 프로브의 닫힌 3갈래를 §5.1의 판정으로 옮긴다 — `unknown`은 `problem`이 아니라 `skipped`다 */
function verdictForImage(
  availability: SandboxImageAvailability,
  context: DoctorContext,
): DoctorVerdict {
  switch (availability.kind) {
    case "present":
      return {
        status: "ok",
        observed: `${availability.image}가 이 호스트에 있다 (${availability.imageId})`,
      };
    case "absent":
      return {
        status: "problem",
        cause: availability.reason,
        nextAction: DOCTOR_AXES["sandbox-image"].nextAction(context),
      };
    case "unknown":
      // **못 잰 것을 결손으로 세지 않는다**(계약 3 넷째 사례). 세면 이미지가 실제로 있는
      // 호스트에서 참인 얼굴을 한 거짓이 나가고, 그 거짓이 낳는 다음 행동은 이미 있는
      // 이미지를 받으러 가는 것이다.
      return { status: "skipped", reason: availability.reason };
  }
}

/** 검사기가 던진 문면을 그대로 `cause`로 옮긴다 — **doctor가 원인을 다시 쓰지 않는다**(계약 6) */
function problemOf(axis: DoctorAxis, error: unknown, context: DoctorContext): DoctorVerdict {
  return {
    status: "problem",
    cause: describeError(error),
    nextAction: DOCTOR_AXES[axis].nextAction(context),
  };
}

/**
 * 그 실행에서 **이미 나온** 경고를 던짐 문면 앞에 잇는다 — **한 축의 `cause`는 그 실행에서
 * 그 축의 검사기가 낸 문면 전부다**(§5.1 계약 4). doctor는 순서대로 잇기만 하므로 이것은
 * 계약 6의 예외가 아니다: 두 문면 다 검사기가 냈고 여기서 보태거나 줄이는 것이 없다.
 *
 * 잇는 문자는 경고만 난 갈래가 쓰는 것과 같은 개행이고, 그래서 여러 줄이 된 `cause`를
 * `indented`가 그대로 받는다.
 *
 * **`problem`이 아닌 판정과 경고 0건은 그대로 통과시킨다** — 이 함수가 판정을 만들지
 * 않는다는 것이 `problemOf`와 갈리는 자리다.
 */
function withPriorWarnings(verdict: DoctorVerdict, warnings: readonly string[]): DoctorVerdict {
  if (verdict.status !== "problem" || warnings.length === 0) return verdict;
  return { ...verdict, cause: [...warnings, verdict.cause].join("\n") };
}

function mustHave(
  verdicts: ReadonlyMap<DoctorAxis, DoctorVerdict>,
  axis: DoctorAxis,
): DoctorVerdict {
  const verdict = verdicts.get(axis);
  if (verdict === undefined) {
    throw new Error(`doctor: ${axis} 축이 판정 없이 보고서에 들어가려 했다 — 배선 결함이다.`);
  }
  return verdict;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
