const fs = require("fs");
const path = require("path");
const solc = require("solc");

function collectSoliditySources(rootDir) {
  const sources = {};
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      Object.assign(sources, collectSoliditySources(absolutePath));
      continue;
    }
    if (!entry.name.endsWith(".sol")) continue;

    const relativePath = path
      .relative(process.cwd(), absolutePath)
      .split(path.sep)
      .join("/");
    sources[relativePath] = { content: fs.readFileSync(absolutePath, "utf8") };
  }

  return sources;
}

function compileContracts() {
  const sources = collectSoliditySources(path.resolve(process.cwd(), "contracts"));
  const input = {
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = output.errors || [];
  const fatal = errors.filter((error) => error.severity === "error");
  if (fatal.length > 0) {
    throw new Error(fatal.map((error) => error.formattedMessage).join("\n"));
  }

  return output.contracts;
}

function getArtifact(contractName) {
  const contracts = compileContracts();
  for (const fileContracts of Object.values(contracts)) {
    if (fileContracts[contractName]) {
      const contract = fileContracts[contractName];
      return {
        abi: contract.abi,
        bytecode: `0x${contract.evm.bytecode.object}`,
      };
    }
  }
  throw new Error(`Contract not found: ${contractName}`);
}

if (require.main === module) {
  const contractName = process.argv[2] || "SettlementGateway";
  const artifact = getArtifact(contractName);
  console.log(
    JSON.stringify(
      {
        contractName,
        abiEntries: artifact.abi.length,
        bytecodeBytes: (artifact.bytecode.length - 2) / 2,
      },
      null,
      2
    )
  );
}

module.exports = { compileContracts, getArtifact };
