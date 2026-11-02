/* Resolve the Playwright Core and Chromium used by the local browser harnesses. */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function packageVersion(corePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(corePath, "package.json"), "utf8")).version;
  } catch {
    return "0.0.0";
  }
}

function candidateCorePaths() {
  const paths = [];
  const add = value => {
    if (value && !paths.includes(value)) paths.push(value);
  };

  if (process.env.PW_CORE) return [process.env.PW_CORE];

  try {
    add(require.resolve("playwright-core", { paths: [__dirname] }));
  } catch {
    // A project-local install is optional for these machine-local harnesses.
  }

  const home = os.homedir();
  add(path.join(home, ".agent-reach/tools/node/lib/node_modules/@playwright/cli/node_modules/playwright-core"));

  const npxCache = path.join(home, ".npm", "_npx");
  if (fs.existsSync(npxCache)) {
    for (const cacheEntry of fs.readdirSync(npxCache, { withFileTypes: true })) {
      if (!cacheEntry.isDirectory()) continue;
      add(path.join(npxCache, cacheEntry.name, "node_modules/playwright-core"));
      add(path.join(npxCache, cacheEntry.name, "node_modules/@playwright/cli/node_modules/playwright-core"));
    }
  }

  return paths;
}

function loadCore() {
  const found = [];
  for (const corePath of candidateCorePaths()) {
    if (!fs.existsSync(corePath)) continue;
    try {
      const resolvedPath = require.resolve(corePath);
      const core = require(resolvedPath);
      if (core.chromium) {
        found.push({ corePath: fs.statSync(corePath).isDirectory() ? corePath : path.dirname(corePath), core });
      }
    } catch (error) {
      if (process.env.PW_CORE) throw error;
    }
  }

  if (found.length === 0) {
    throw new Error("Could not find playwright-core. Install it in the project or set PW_CORE to its module path.");
  }

  found.sort((a, b) => packageVersion(b.corePath).localeCompare(packageVersion(a.corePath), undefined, { numeric: true }));
  return found.find(({ core }) => fs.existsSync(core.chromium.executablePath())) || found[0];
}

const { corePath, core } = loadCore();
const cachedExecutable = core.chromium.executablePath();
const executablePath = process.env.CHROME_BIN || cachedExecutable;

if (!fs.existsSync(executablePath)) {
  throw new Error(
    `Chromium executable not found at ${executablePath}. Install the browser for ${packageVersion(corePath)} or set CHROME_BIN to an installed Chromium.`,
  );
}

module.exports = { chromium: core.chromium, executablePath };
