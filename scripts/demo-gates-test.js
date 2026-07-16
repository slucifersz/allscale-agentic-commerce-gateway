const assert = require("assert/strict");
const {
  DEMO_GATE_SCENARIOS,
  disabledVerification,
  evaluateDemoGates,
  resolveDemoGateMode,
} = require("../server/demo-gates");

assert.equal(resolveDemoGateMode(31337, ""), "simulated");
assert.equal(resolveDemoGateMode(177, ""), "disabled");
assert.equal(resolveDemoGateMode(133, "disabled"), "disabled");
assert.throws(
  () => resolveDemoGateMode(177, "simulated"),
  /forbidden on HashKey mainnet/
);

const disabled = disabledVerification();
assert.equal(disabled.decision, "not_run");
assert.equal(disabled.providerConnected, false);

for (const scenario of DEMO_GATE_SCENARIOS) {
  const verification = evaluateDemoGates(scenario);
  assert.equal(verification.scenario, scenario);
  assert.equal(verification.simulated, true);
  assert.equal(verification.providerConnected, false);
  assert.match(verification.disclaimer, /no request was sent/i);
  assert.equal(verification.results.length, 2);
  assert.ok(verification.results.every((result) => result.mock === true));
}

assert.equal(evaluateDemoGates("pass").decision, "allow");
assert.equal(evaluateDemoGates("block_kyt").blockedBy, "kyt_aml");
assert.equal(
  evaluateDemoGates("block_authorization").blockedBy,
  "payer_authorization"
);
assert.throws(() => evaluateDemoGates("unknown"), /demoScenario must be one of/);

console.log("Demo gate scenario tests passed.");
