// ============================================================================
// devgate/src/detector.js — Detect project type from filesystem
// ============================================================================

const fs = require("fs");
const path = require("path");
const { FRAMEWORKS } = require("./config");

/**
 * Detect project framework from the given directory
 * Returns: { name, language, startCmd, defaultPort, portFlag, icon } or null
 */
function detectProject(dir = process.cwd()) {
  // 1. Try package.json-based detection (Node.js projects)
  const pkgPath = path.join(dir, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      for (const fw of FRAMEWORKS) {
        if (fw.language === "node" && fw.detect && fw.detect(pkg)) {
          return {
            name: fw.name,
            language: fw.language,
            startCmd: fw.startCmd(pkg),
            defaultPort: fw.defaultPort,
            portFlag: fw.portFlag || null,
            envPort: fw.envPort || null,
            icon: fw.icon,
            hasNodeModules: fs.existsSync(path.join(dir, "node_modules")),
            packageManager: detectPackageManager(dir)
          };
        }
      }
    } catch (e) {
      // malformed package.json, skip
    }
  }

  // 2. Try file-based detection (Python, Rust, Go, Ruby, PHP, static)
  for (const fw of FRAMEWORKS) {
    if (fw.detectFile) {
      const filesToCheck = [fw.detectFile, ...(fw.altDetectFiles || [])];
      for (const file of filesToCheck) {
        const filePath = path.join(dir, file);
        if (fs.existsSync(filePath)) {
          // If detectContent is specified, check file contents
          if (fw.detectContent) {
            try {
              const content = fs.readFileSync(filePath, "utf-8");
              if (fw.detectContent.test(content)) {
                return buildResult(fw, dir);
              }
            } catch (e) {
              continue;
            }
          } else {
            return buildResult(fw, dir);
          }
        }
      }
    }
  }

  return null;
}

function buildResult(fw, dir) {
  return {
    name: fw.name,
    language: fw.language,
    startCmd: fw.startCmd(),
    defaultPort: fw.defaultPort,
    portFlag: fw.portFlag || null,
    envPort: fw.envPort || null,
    icon: fw.icon,
    hasNodeModules: fw.language === "node" ? fs.existsSync(path.join(dir, "node_modules")) : null,
    packageManager: fw.language === "node" ? detectPackageManager(dir) : null
  };
}

/**
 * Detect which package manager is in use
 */
function detectPackageManager(dir) {
  if (fs.existsSync(path.join(dir, "bun.lockb")) || fs.existsSync(path.join(dir, "bun.lock"))) return "bun";
  if (fs.existsSync(path.join(dir, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(dir, "yarn.lock"))) return "yarn";
  return "npm";
}

/**
 * Get the install command for the detected package manager
 */
function getInstallCmd(pm) {
  const cmds = { npm: "npm install", yarn: "yarn", pnpm: "pnpm install", bun: "bun install" };
  return cmds[pm] || "npm install";
}

/**
 * Adapt start command to use detected package manager
 */
function adaptStartCmd(startCmd, pm) {
  if (pm === "npm") return startCmd;
  if (startCmd.startsWith("npm run ")) return startCmd.replace("npm run ", `${pm} run `);
  if (startCmd === "npm start") return `${pm} start`;
  if (startCmd.startsWith("npx ")) {
    if (pm === "bun") return startCmd.replace("npx ", "bunx ");
    if (pm === "pnpm") return startCmd.replace("npx ", "pnpm exec ");
    if (pm === "yarn") return startCmd.replace("npx ", "yarn ");
  }
  return startCmd;
}

module.exports = { detectProject, detectPackageManager, getInstallCmd, adaptStartCmd };
