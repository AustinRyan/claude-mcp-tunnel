// ============================================================================
// devgate/src/starter.js — Start dev servers with auto-detection
// ============================================================================

const { spawn, execSync } = require("child_process");
const path = require("path");
const { detectProject, getInstallCmd, adaptStartCmd } = require("./detector");
const { checkPort, waitForPort } = require("./scanner");
const { c } = require("./config");

// Track started servers
const activeServers = [];

/**
 * Install dependencies if node_modules is missing
 */
async function installDepsIfNeeded(project, dir, log) {
  if (project.language === "node" && project.hasNodeModules === false) {
    const cmd = getInstallCmd(project.packageManager);
    log(`${c.yellow}Installing dependencies (${cmd})...${c.reset}`);
    try {
      execSync(cmd, { cwd: dir, stdio: "pipe", timeout: 120000 });
      log(`${c.green}Dependencies installed.${c.reset}`);
      return true;
    } catch (err) {
      throw new Error(`Failed to install dependencies: ${err.message}`);
    }
  }
  return false;
}

/**
 * Start a dev server for the detected project
 */
async function startServer(options = {}) {
  const dir = options.dir || process.cwd();
  const log = options.log || console.log;
  const customPort = options.port || null;

  // Detect the project
  const project = detectProject(dir);
  if (!project) {
    throw new Error("Could not detect project type. Is there a package.json, requirements.txt, or other config file?");
  }

  const port = customPort || project.defaultPort;

  // Check if something is already running on this port
  if (await checkPort(port)) {
    log(`${c.yellow}Port ${port} already in use — using existing server.${c.reset}`);
    return { project, port, pid: null, alreadyRunning: true };
  }

  // Install deps if needed
  await installDepsIfNeeded(project, dir, log);

  // Adapt start command for package manager
  let startCmd = project.startCmd;
  if (project.packageManager) {
    startCmd = adaptStartCmd(startCmd, project.packageManager);
  }

  // Add port flag if a custom port was specified
  if (customPort && project.portFlag) {
    startCmd += ` ${project.portFlag} ${customPort}`;
  }

  log(`${c.cyan}Starting ${project.icon} ${project.name} on port ${port}...${c.reset}`);
  log(`${c.dim}  $ ${startCmd}${c.reset}`);

  // Build environment
  const env = { ...process.env };
  if (project.envPort && customPort) {
    env[project.envPort] = String(customPort);
  }
  // Make Vite/Next.js accessible from network by default
  env.HOST = "0.0.0.0";

  // Split command for spawn
  const parts = startCmd.split(" ");
  const cmd = parts[0];
  const args = parts.slice(1);

  const proc = spawn(cmd, args, {
    cwd: dir,
    env,
    stdio: ["pipe", "pipe", "pipe"],
    detached: false,
    shell: true
  });

  const serverInfo = { project, port, pid: proc.pid, process: proc };
  activeServers.push(serverInfo);

  // Pipe output to a buffer for debugging (don't show to user by default)
  let serverOutput = "";
  proc.stdout.on("data", (d) => { serverOutput += d.toString(); });
  proc.stderr.on("data", (d) => { serverOutput += d.toString(); });

  proc.on("error", (err) => {
    log(`${c.red}Server failed to start: ${err.message}${c.reset}`);
  });

  proc.on("exit", (code) => {
    if (code && code !== 0 && code !== null) {
      log(`${c.red}Server exited with code ${code}${c.reset}`);
      if (serverOutput.includes("EADDRINUSE")) {
        log(`${c.yellow}Port ${port} is already in use.${c.reset}`);
      }
    }
  });

  // Wait for the server to be ready
  log(`${c.dim}Waiting for server to be ready...${c.reset}`);
  const ready = await waitForPort(port, 45000);

  if (!ready) {
    proc.kill();
    throw new Error(`Server did not start within 45 seconds on port ${port}.\nOutput:\n${serverOutput.slice(-500)}`);
  }

  log(`${c.green}Server is ready on port ${port}.${c.reset}`);
  return serverInfo;
}

/**
 * Kill all started servers
 */
function killAllServers() {
  let killed = 0;
  for (const server of activeServers) {
    if (server.process && !server.process.killed) {
      try {
        server.process.kill("SIGTERM");
        killed++;
      } catch {}
    }
  }
  activeServers.length = 0;
  return killed;
}

// Cleanup on exit
process.on("SIGINT", () => { killAllServers(); });
process.on("SIGTERM", () => { killAllServers(); });

module.exports = { startServer, killAllServers, activeServers };
