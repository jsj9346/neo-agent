/**
 * 첫 실행 온보딩 — `docs/CLI-INTERFACE.md` §2.3 (시작 시퀀스의 `0c`·`0d`).
 *
 * §2.1의 관문이 정하는 것은 «홈을 만들어도 되는가»의 동의 하나이고, 이 모듈이 지는
 * 것은 **그 동의 뒤에 무엇을 받아 어디에 쓰는가**다. 그전까지 첫 기동은 동의를 받고
 * 곧장 저장소를 열었고, 키를 안 넣은 사용자는 관문을 보지도 못한 채 §4의 크리덴셜
 * fail-closed에서 죽었다.
 *
 * **이 모듈은 화면을 모른다.** 묻고 답받는 일은 `OnboardingIo`로 주입되고, 그 구현
 * (화면·입력 표현)의 소유는 Codex다(루트 AGENTS.md §2 · §2.3 「계약 표면」). 여기 사는
 * 것은 엔진·확인·영속화뿐이다.
 *
 * **`OnboardingIo`가 `TerminalIo`를 상속하지 않는 것이 계약이다**(§2.3). 상속시키면
 * 엔진이 raw 모드·키 바이트를 알게 되고, 그 순간 §2.1이 관문에 대해 지킨 «계약 표면은
 * 키를 알지 않는다»가 온보딩에서만 깨진다.
 */

import type { ModelKeyVerdict } from "@neo-agent/providers";
import type { SearchKeyVerdict } from "@neo-agent/web";
import { writeConfigValue } from "./config-surface.ts";
import { writeCredentialValues } from "./credentials.ts";

/**
 * 온보딩이 묻는 것 — **닫힌 셋**(§2.3). 넷째가 생기려면 §2.3의 표와 §2.1 비용 상한의
 * 기능 층 문장이 함께 개정된다.
 *
 * 이름이 전부 기능 어휘다 — 알약 어휘는 화면 문면에만 살고 식별자에는 오지 않는다
 * (`LORE.md` §6 불변, §2.1의 2026-08-21 개정과 같은 규율).
 */
export type OnboardingStepId = "model" | "model-key" | "search-key";

/**
 * 묻는 순서. **이것이 계약이다**(§2.3) — 확인 호출이 키와 모델을 함께 필요로 하므로
 * 모델이 먼저 정해져야 그 확인이 «사용자가 실제로 쓸 구성»을 재고, 호출이 1회로 닫힌다.
 * 기본 모델로 대신 재면 접근 권한이 모델마다 다른 계정에서 거짓 실패가 나는데, 그때
 * 사용자가 고른 모델은 아직 안 물었으므로 고칠 자리가 없다.
 */
export const ONBOARDING_STEPS: readonly OnboardingStepId[] = Object.freeze([
  "model",
  "model-key",
  "search-key",
] as const);

/**
 * 되묻는 이유. **갈래를 늘리는 것이 아니라 문면의 재료다** — 처분은 어느 `kind`에서도
 * «그 단계를 다시 묻는다» 하나이고, `step`이 그 단계를 고른다(§2.3).
 */
export interface OnboardingRejection {
  readonly step: OnboardingStepId;
  readonly kind: "empty" | "invalid-key" | "unknown-model" | "unverifiable";
  /** 사용자가 무엇을 고쳐야 하는지. 표현 계층이 문면으로 옮긴다 */
  readonly cause: string;
}

/** 표현 계층이 받는 것 */
export interface OnboardingPrompt {
  readonly step: OnboardingStepId;
  /** 건너뛸 수 있는가 — `search-key`만 참이다 */
  readonly skippable: boolean;
  /** 기본값. 있으면 사용자가 수용할 수 있다 — `model`만 든다 */
  readonly defaultValue?: string;
  /** 입력을 화면에 되비추는가 — 키 둘은 거짓이다 */
  readonly echo: boolean;
  /** 직전 시도가 왜 되물어졌는가. 첫 시도에는 없다 */
  readonly rejection?: OnboardingRejection;
}

/** 표현 계층이 돌려주는 것 — **닫힌 셋** */
export type OnboardingAnswer =
  | { readonly kind: "value"; readonly value: string }
  /** `skippable`이 참인 단계에서만 유효하다 */
  | { readonly kind: "skip" }
  /** 중단 입력 셋. 귀결은 Blue Pill과 같다 — 종료 코드 0, 홈 미생성(§2.1·§2.3) */
  | { readonly kind: "abort" };

/** 이미 있어 건너뛴 값의 출처. 화면이 «어디서 찾았는지»를 말해야 한다(§2.3) */
export type OnboardingSkipSource = "env" | "file";

/**
 * Codex가 구현하는 표면. **이 인터페이스가 인계의 전부다**(§2.3).
 */
export interface OnboardingIo {
  ask(prompt: OnboardingPrompt): Promise<OnboardingAnswer>;
  /** 이미 있어 건너뛴 단계를 알린다 — 화면에 남는 것이 계약이다(§2.3) */
  noteSkipped(step: OnboardingStepId, source: OnboardingSkipSource): void;
}

export interface OnboardingVerifier {
  /** `packages/providers` — 모델 메타데이터 조회 1회 */
  modelKey(apiKey: string, model: string): Promise<ModelKeyVerdict>;
  /** `packages/web` — 최소 질의 1회 */
  searchKey(apiKey: string): Promise<SearchKeyVerdict>;
}

/**
 * 온보딩이 **받은** 값만 든다. 이미 있어 건너뛴 키는 여기 없다.
 *
 * **두 키가 옵셔널인 것이 계약이다**(§2.3). 안 받은 값을 채우면 `0d`가 자기가 안 받은
 * 값을 파일에 다시 쓰게 되고, env 갈래에서는 env의 시크릿이 파일로 복사된다 — 시크릿이
 * 원래 없던 자리에 생긴다. **옵셔널이 그 경로를 표현 불가능하게 만든다.**
 */
export interface OnboardingValues {
  readonly model: string;
  readonly apiKey?: string;
  readonly searchApiKey?: string;
}

export type OnboardingOutcome =
  | { readonly kind: "completed"; readonly values: OnboardingValues }
  /** 중단. 호출자는 아무것도 쓰지 않고 종료 코드 0으로 끝낸다 */
  | { readonly kind: "aborted" };

export interface RunOnboardingOptions {
  readonly io: OnboardingIo;
  readonly verifier: OnboardingVerifier;
  /** §3 표의 `model` 기본값. 목록을 두지 않으므로 이 하나가 화면에 보이는 전부다 */
  readonly defaultModel: string;
  /** §4의 로더가 이미 찾은 키. 있으면 그 단계를 묻지 않는다(§2.3) */
  readonly existing: {
    readonly apiKey?: string;
    readonly searchApiKey?: string;
    /** 찾은 자리 — 화면 고지에 실린다. 키가 없으면 의미가 없다 */
    readonly apiKeySource?: OnboardingSkipSource;
    readonly searchApiKeySource?: OnboardingSkipSource;
  };
}

/**
 * 질문 셋을 순서대로 묻고, 받은 값을 확인하고, 결과를 돌려준다. **디스크에 쓰지 않는다** —
 * 쓰기는 `persistOnboarding` 하나이고 호출자가 완주 뒤에만 부른다(§2.3 전부-아니면-전무).
 *
 * **되묻기에 횟수 상한을 두지 않는다**(§2.3). 상한을 두면 «상한 초과»라는 넷째 귀결이
 * 생기는데, 탈출구는 이미 있다(중단 = 취소).
 */
export async function runOnboarding(options: RunOnboardingOptions): Promise<OnboardingOutcome> {
  const { io, verifier, defaultModel, existing } = options;

  // ── 1·2. 쓸 모델과 모델 키. **한 덩어리로 돈다** — 확인 호출 하나가 둘을 함께 재므로
  // (§2.3 「묻는 순서가 계약이다」) 되묻기가 두 단계 사이를 오간다. 모델을 못 찾았다는
  // 판정은 모델 단계로 돌아가야 하고, 그 왕복을 표현하려면 두 단계가 한 루프여야 한다.
  const keyAlreadyPresent = existing.apiKey !== undefined;
  if (keyAlreadyPresent) io.noteSkipped("model-key", existing.apiKeySource ?? "file");

  let model: string | undefined;
  let rejection: OnboardingRejection | undefined;
  let at: "model" | "model-key" = "model";
  /**
   * 두 단계의 산물. **`for(;;)` + `break` 하나로 모으는 것이 의도다** — 모든 탈출이
   * 이 값을 채우고 나가므로 「모델이 안 정해진 채 빠져나가는」 경로가 타입 수준에서
   * 없다. 루프 조건으로 표현하면 그 보장이 컴파일러에 안 보여 죽은 가드가 생긴다.
   */
  let settled: { readonly model: string; readonly apiKey?: string } | undefined;

  for (;;) {
    if (at === "model") {
      // **`config.json`에 값이 있어도 묻는다**(§2.3) — 그 키는 기본값이 있는 선택 키라
      // «있음»이 «사용자가 골랐음»을 뜻하지 않는다.
      const answer = await io.ask({
        step: "model",
        skippable: false,
        defaultValue: defaultModel,
        echo: true,
        ...(rejection === undefined ? {} : { rejection }),
      });
      if (answer.kind === "abort") return { kind: "aborted" };
      // 건너뛸 수 없는 단계의 `skip`은 빈 답과 같게 다룬다 — 표현 계층의 실수를 조용히
      // 값으로 바꾸지 않는다. 기본값 수용은 `skip`이 아니라 기본값을 **값으로** 돌려주는 것이다.
      const raw = answer.kind === "value" ? answer.value.trim() : "";
      if (raw === "") {
        rejection = { step: "model", kind: "empty", cause: "모델 이름이 비어 있다." };
        continue;
      }
      model = raw;
      rejection = undefined;

      // 키가 이미 있으면 **확인도 안 한다**(§2.3) — 그 확인은 우리가 못 고치는 키에
      // 의존하고, 거부되면 오늘 없던 기동 실패가 새로 생긴다.
      if (keyAlreadyPresent) {
        settled = { model: raw };
        break;
      }
      at = "model-key";
      continue;
    }

    // `at`이 여기 오는 유일한 경로가 위에서 `model`을 채운 뒤이므로 실제로는 항상 참이다.
    // 그럼에도 단정이 아니라 분기인 것은, 위 블록이 나중에 갈릴 때 이 자리가 조용히
    // 거짓이 되지 않게 하기 위해서다 — 되돌아가는 것이 안전한 방향이다.
    const chosenModel = model;
    if (chosenModel === undefined) {
      at = "model";
      continue;
    }

    const answer = await io.ask({
      step: "model-key",
      skippable: false,
      echo: false,
      ...(rejection === undefined ? {} : { rejection }),
    });
    if (answer.kind === "abort") return { kind: "aborted" };
    const raw = answer.kind === "value" ? answer.value.trim() : "";
    if (raw === "") {
      rejection = { step: "model-key", kind: "empty", cause: "API 키가 비어 있다." };
      continue;
    }

    // 확인 호출 1회 — 키의 유효성과 모델 이름의 실재를 함께 잰다(§2.3).
    const verdict = await verifier.modelKey(raw, chosenModel);
    if (verdict.kind === "ok") {
      settled = { model: chosenModel, apiKey: raw };
      break;
    }
    // **되묻는 대상만 원인이 고른다**(§2.3). 모델을 못 찾았으면 모델 단계로 돌아간다 —
    // 키 단계에서 되물으면 사용자는 키를 다시 넣을 수밖에 없고 모델은 못 고친다.
    if (verdict.kind === "unknown-model") {
      model = undefined;
      at = "model";
      rejection = { step: "model", kind: "unknown-model", cause: verdict.cause };
      continue;
    }
    rejection = { step: "model-key", kind: verdict.kind, cause: verdict.cause };
  }

  const { model: chosenModel, apiKey } = settled;

  // ── 3. 검색 키. **건너뛸 수 있고, 건너뛰면 저장되지 않는다**(§2.3 결정 4b).
  let searchApiKey: string | undefined;
  if (existing.searchApiKey !== undefined) {
    io.noteSkipped("search-key", existing.searchApiKeySource ?? "file");
  } else {
    rejection = undefined;
    for (;;) {
      const answer = await io.ask({
        step: "search-key",
        skippable: true,
        echo: false,
        ...(rejection === undefined ? {} : { rejection }),
      });
      if (answer.kind === "abort") return { kind: "aborted" };
      if (answer.kind === "skip") break;
      const raw = answer.value.trim();
      if (raw === "") {
        // 빈 값은 건너뛰기가 아니다 — 건너뛰려면 표현 계층이 `skip`을 돌려줘야 한다.
        // 둘을 합치면 «지나간 것»과 «비워 둔 것»이 구별되지 않는다(§2.6).
        rejection = { step: "search-key", kind: "empty", cause: "검색 키가 비어 있다." };
        continue;
      }
      const verdict = await verifier.searchKey(raw);
      if (verdict.kind === "ok") {
        searchApiKey = raw;
        break;
      }
      rejection = { step: "search-key", kind: verdict.kind, cause: verdict.cause };
    }
  }

  return {
    kind: "completed",
    values: {
      model: chosenModel,
      ...(apiKey === undefined ? {} : { apiKey }),
      ...(searchApiKey === undefined ? {} : { searchApiKey }),
    },
  };
}

/**
 * `0d` — 온보딩이 받은 값을 홈에 **얹는다**(§2.3).
 *
 * **디스크에 쓰는 지점은 여기 하나뿐이다.** 그 앞의 어떤 중단도 홈을 만들지 않는다.
 *
 * **통째 교체가 아니다** — 두 파일 다 이미 내용이 있을 수 있고, 통째로 쓰면 온보딩이
 * 안 물은 값이 사라진다. `config.json` 쪽은 §3.2 계약 4의 `set`이 이미 그 형태다
 * (현재 레코드 + 키 하나 → **같은 검증기** → 원자적 쓰기).
 *
 * **순서가 크리덴셜 먼저인 것은 되돌릴 수 없는 쪽을 먼저 확정하기 위해서가 아니다** —
 * 부분 상태는 어차피 자기 치유다(첫 실행 판정의 재료가 `sessions.db` 부재 하나뿐이라
 * 다음 기동이 다시 온보딩을 돌리고, 이미 쓰인 키는 그때 안 묻는다). 순서를 계약으로
 * 들지 않는 이유가 그것이다.
 */
export function persistOnboarding(options: {
  readonly credentialsPath: string;
  readonly configPath: string;
  readonly values: OnboardingValues;
}): void {
  const { credentialsPath, configPath, values } = options;

  writeCredentialValues(credentialsPath, {
    ...(values.apiKey === undefined ? {} : { apiKey: values.apiKey }),
    ...(values.searchApiKey === undefined ? {} : { searchApiKey: values.searchApiKey }),
  });

  const result = writeConfigValue(configPath, "model", values.model);
  if (result.outcome !== "applied") {
    throw new Error(
      `온보딩이 고른 모델을 저장하지 못했다 — ${result.reason}\n\n` +
        `크리덴셜은 ${credentialsPath}에 저장됐다. 다시 실행하면 남은 것부터 묻는다.`,
    );
  }
}
