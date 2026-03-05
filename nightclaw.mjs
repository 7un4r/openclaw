#!/usr/bin/env node

import module from "node:module";

const MIN_NODE_MAJOR = 22;
const MIN_NODE_MINOR = 12;
const MIN_NODE_VERSION = `${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}`;

const parseNodeVersion = (rawVersion) => {
  const [majorRaw = "0", minorRaw = "0"] = rawVersion.split(".");
  return {
    major: Number(majorRaw),
    minor: Number(minorRaw),
  };
};

const isSupportedNodeVersion = (version) =>
  version.major > MIN_NODE_MAJOR ||
  (version.major === MIN_NODE_MAJOR && version.minor >= MIN_NODE_MINOR);

const ensureSupportedNodeVersion = () => {
  if (isSupportedNodeVersion(parseNodeVersion(process.versions.node))) {
    return;
  }

  process.stderr.write(
    `nightclaw: Node.js v${MIN_NODE_VERSION}+ is required (current: v${process.versions.node}).\n` +
      "If you use nvm, run:\n" +
      "  nvm install 22\n" +
      "  nvm use 22\n" +
      "  nvm alias default 22\n",
  );
  process.exit(1);
};

ensureSupportedNodeVersion();

// https://nodejs.org/api/module.html#module-compile-cache
if (module.enableCompileCache && !process.env.NODE_DISABLE_COMPILE_CACHE) {
  try {
    module.enableCompileCache();
  } catch {
    // Ignore errors
  }
}

const isModuleNotFoundError = (err) =>
  err && typeof err === "object" && "code" in err && err.code === "ERR_MODULE_NOT_FOUND";

const installProcessWarningFilter = async () => {
  // Keep bootstrap warnings consistent with the TypeScript runtime.
  for (const specifier of ["./dist/warning-filter.js", "./dist/warning-filter.mjs"]) {
    try {
      const mod = await import(specifier);
      if (typeof mod.installProcessWarningFilter === "function") {
        mod.installProcessWarningFilter();
        return;
      }
    } catch (err) {
      if (isModuleNotFoundError(err)) {
        continue;
      }
      throw err;
    }
  }
};

await installProcessWarningFilter();

const tryImport = async (specifier) => {
  try {
    await import(specifier);
    return true;
  } catch (err) {
    // Only swallow missing-module errors; rethrow real runtime errors.
    if (isModuleNotFoundError(err)) {
      return false;
    }
    throw err;
  }
};

if (await tryImport("./dist/entry.js")) {
  // OK
} else if (await tryImport("./dist/entry.mjs")) {
  // OK
} else {
  // Fallback: run directly from TypeScript source via jiti.
  // This activates when installed via `npm install -g github:r1skarctic/nightclaw`
  // (where no build step runs and dist/ is absent). jiti is listed in
  // `dependencies` so it is always installed alongside the package.
  try {
    const { createJiti } = await import("jiti");
    const jiti = createJiti(import.meta.url);
    await jiti.import("./src/entry.ts");
  } catch (err) {
    if (isModuleNotFoundError(err)) {
      throw new Error(
        "nightclaw: missing dist/entry.(m)js (build output) and jiti is unavailable. " +
          "Run `pnpm install && pnpm build` to build the project first.",
      );
    }
    throw err;
  }
}
