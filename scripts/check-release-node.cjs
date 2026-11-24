const { readFileSync } = require('node:fs');
const path = require('node:path');

function checkReleaseNode() {
  const nvmrcPath = path.resolve(__dirname, '../.nvmrc');
  let expectedMajor;
  try {
    expectedMajor = readFileSync(nvmrcPath, 'utf8').trim();
  } catch (error) {
    console.error(`Cannot read .nvmrc to verify the release-test Node version. ${error.message}`);
    return 1;
  }

  if (!/^[1-9][0-9]*$/.test(expectedMajor)) {
    console.error(`Unsupported .nvmrc value ${JSON.stringify(expectedMajor)}. Use a positive integer Node major.`);
    return 1;
  }

  const actualMajor = process.versions.node.split('.')[0];
  if (actualMajor !== expectedMajor) {
    console.error(`Release tests expected Node.js ${expectedMajor}, but are running Node.js ${process.version}. Run \`nvm use\` from the repository root and retry.`);
    return 1;
  }

  console.log(`Release tests are running on Node.js ${process.version}.`);
  return 0;
}

process.exitCode = checkReleaseNode();
