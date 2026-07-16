const DEMO_GATE_MODES = ["disabled", "simulated"];
const DEMO_GATE_SCENARIOS = ["pass", "block_kyt", "block_authorization"];
const MAINNET_CHAIN_ID = 177;
const SIMULATION_DISCLAIMER =
  "SIMULATED DISPLAY ONLY: no request was sent to BlockSec or Primus.";

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function resolveDemoGateMode(chainId, configuredMode = process.env.DEMO_GATE_MODE) {
  const mode = configuredMode || (Number(chainId) === MAINNET_CHAIN_ID ? "disabled" : "simulated");
  if (!DEMO_GATE_MODES.includes(mode)) {
    throw httpError(
      `DEMO_GATE_MODE must be one of: ${DEMO_GATE_MODES.join(", ")}`,
      503
    );
  }
  if (Number(chainId) === MAINNET_CHAIN_ID && mode === "simulated") {
    throw httpError(
      "DEMO_GATE_MODE=simulated is forbidden on HashKey mainnet (chainId 177)",
      503
    );
  }
  return mode;
}

function disabledVerification() {
  return {
    mode: "disabled",
    simulated: false,
    providerConnected: false,
    scenario: null,
    decision: "not_run",
    results: [],
    disclaimer:
      "Verification gates were not run. This repository has no live BlockSec or Primus integration.",
  };
}

function gateResult({ gate, provider, status, displayText, reason }) {
  return {
    gate,
    provider,
    status,
    displayText,
    reason,
    mock: true,
    providerConnected: false,
  };
}

function evaluateDemoGates(scenario = "pass") {
  if (!DEMO_GATE_SCENARIOS.includes(scenario)) {
    throw httpError(
      `demoScenario must be one of: ${DEMO_GATE_SCENARIOS.join(", ")}`,
      400
    );
  }

  const kytBlocked = scenario === "block_kyt";
  const authorizationBlocked = scenario === "block_authorization";
  const results = [
    gateResult({
      gate: "kyt_aml",
      provider: "BlockSec",
      status: kytBlocked ? "blocked" : "passed",
      displayText: kytBlocked ? "BlockSec 已检查 · 已阻断" : "BlockSec 已检查",
      reason: kytBlocked
        ? "Simulated high-risk fund-source signal"
        : "Simulated clean fund-source result",
    }),
    gateResult({
      gate: "payer_authorization",
      provider: "Primus",
      status: kytBlocked ? "not_run" : authorizationBlocked ? "blocked" : "passed",
      displayText: kytBlocked
        ? "Primus 未执行"
        : authorizationBlocked
          ? "Primus 验证未通过"
          : "Primus 已验证",
      reason: kytBlocked
        ? "Skipped because the simulated KYT gate blocked first"
        : authorizationBlocked
          ? "Simulated missing or invalid payer mandate"
          : "Simulated identity and mandate result",
    }),
  ];
  const blockedBy = kytBlocked
    ? "kyt_aml"
    : authorizationBlocked
      ? "payer_authorization"
      : null;

  return {
    mode: "simulated",
    simulated: true,
    providerConnected: false,
    scenario,
    decision: blockedBy ? "block" : "allow",
    blockedBy,
    results,
    disclaimer: SIMULATION_DISCLAIMER,
  };
}

module.exports = {
  DEMO_GATE_MODES,
  DEMO_GATE_SCENARIOS,
  SIMULATION_DISCLAIMER,
  disabledVerification,
  evaluateDemoGates,
  resolveDemoGateMode,
};
