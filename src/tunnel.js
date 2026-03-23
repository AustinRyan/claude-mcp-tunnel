// ============================================================================
// devgate/src/tunnel.js — Tunnel manager with multiple backends
// ============================================================================

const { spawn, execSync } = require("child_process");
const os = require("os");
const { TUNNEL_BACKENDS, c } = require("./config");

// Track active tunnels for cleanup
const activeTunnels = [];

/**
 * Get the local network IP address
 */
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "127.0.0.1";
}

/**
 * Check if a command exists on the system
 */
function commandExists(cmd) {
  try {
    execSync(`which ${cmd} 2>/dev/null || where ${cmd} 2>NUL`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a local network URL (same WiFi)
 */
function exposeLocal(port) {
  const ip = getLocalIP();
  const url = `http://${ip}:${port}`;
  return { backend: "local", url, ip, port, process: null };
}

/**
 * Create a tunnel via bore
 */
function exposeBore(port) {
  return new Promise((resolve, reject) => {
    const backend = TUNNEL_BACKENDS.bore;
    
    if (!commandExists("bore")) {
      reject(new Error(`bore not installed. Install: ${backend.installHint}`));
      return;
    }

    const args = backend.buildArgs(port);
    const proc = spawn("bore", args, { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    let resolved = false;

    const onData = (data) => {
      output += data.toString();
      if (!resolved) {
        const url = backend.parseUrl(output);
        if (url) {
          resolved = true;
          const tunnel = { backend: "bore", url, port, process: proc };
          activeTunnels.push(tunnel);
          resolve(tunnel);
        }
      }
    };

    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);

    proc.on("error", (err) => {
      if (!resolved) reject(new Error(`bore failed: ${err.message}`));
    });

    proc.on("exit", (code) => {
      if (!resolved) reject(new Error(`bore exited with code ${code}`));
    });

    // Timeout after 15 seconds
    setTimeout(() => {
      if (!resolved) {
        proc.kill();
        reject(new Error("bore timed out waiting for URL"));
      }
    }, 15000);
  });
}

/**
 * Create a tunnel via localhost.run (SSH-based, no install needed)
 */
function exposeSSH(port) {
  return new Promise((resolve, reject) => {
    const backend = TUNNEL_BACKENDS.ssh;
    const args = backend.buildArgs(port);
    
    const proc = spawn("ssh", args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, SSH_AUTH_SOCK: "" }  // prevent agent issues
    });

    let output = "";
    let resolved = false;

    const onData = (data) => {
      output += data.toString();
      if (!resolved) {
        const url = backend.parseUrl(output);
        if (url) {
          resolved = true;
          const tunnel = { backend: "localhost.run", url, port, process: proc };
          activeTunnels.push(tunnel);
          resolve(tunnel);
        }
      }
    };

    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);

    proc.on("error", (err) => {
      if (!resolved) reject(new Error(`SSH tunnel failed: ${err.message}`));
    });

    proc.on("exit", (code) => {
      if (!resolved) reject(new Error(`SSH tunnel exited with code ${code}. Is SSH available?`));
    });

    // Timeout after 20 seconds (SSH can be slow to negotiate)
    setTimeout(() => {
      if (!resolved) {
        proc.kill();
        reject(new Error("SSH tunnel timed out. Try: devgate --local"));
      }
    }, 20000);
  });
}

/**
 * Auto-expose with fallback chain: bore → localhost.run → local IP
 */
async function autoExpose(port, preferredBackend = null) {
  const errors = [];

  // If a specific backend is requested
  if (preferredBackend === "local") return exposeLocal(port);
  if (preferredBackend === "bore") return exposeBore(port);
  if (preferredBackend === "ssh") return exposeSSH(port);

  // Auto fallback chain
  // 1. Try bore (fastest, most reliable)
  if (commandExists("bore")) {
    try {
      return await exposeBore(port);
    } catch (err) {
      errors.push(`bore: ${err.message}`);
    }
  }

  // 2. Try localhost.run via SSH (no install needed)
  if (commandExists("ssh")) {
    try {
      return await exposeSSH(port);
    } catch (err) {
      errors.push(`localhost.run: ${err.message}`);
    }
  }

  // 3. Fall back to local network
  const local = exposeLocal(port);
  local.fallback = true;
  local.errors = errors;
  return local;
}

/**
 * Kill all active tunnels
 */
function killAllTunnels() {
  let killed = 0;
  for (const tunnel of activeTunnels) {
    if (tunnel.process) {
      try {
        tunnel.process.kill("SIGTERM");
        killed++;
      } catch {}
    }
  }
  activeTunnels.length = 0;
  return killed;
}

/**
 * Get list of active tunnels
 */
function getActiveTunnels() {
  return activeTunnels.filter(t => t.process === null || !t.process.killed);
}

// Cleanup on exit
process.on("SIGINT", () => { killAllTunnels(); process.exit(0); });
process.on("SIGTERM", () => { killAllTunnels(); process.exit(0); });
process.on("exit", () => killAllTunnels());

module.exports = {
  getLocalIP, commandExists, exposeLocal, exposeBore, exposeSSH,
  autoExpose, killAllTunnels, getActiveTunnels
};
