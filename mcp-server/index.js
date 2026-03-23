#!/usr/bin/env node

// ============================================================================
// devgate MCP Server — Expose local dev servers via Model Context Protocol
// ============================================================================
// All logging goes to stderr. stdout is reserved for MCP JSON-RPC protocol.

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { z } = require("zod");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");

const localtunnel = require("localtunnel");
const devgate = require("../src/index.js");

// Track manually spawned backend processes (outside core engine)
const managedBackends = [];
// Track active localtunnel instances for cleanup
const activeLtTunnels = [];

const log = (...args) => process.stderr.write(args.join(" ") + "\n");

/**
 * Check if a port is open on either IPv4 (127.0.0.1) or IPv6 (localhost/::1).
 * Modern frameworks like Vite 8 bind to localhost which may resolve to ::1.
 */
async function checkPortAny(port) {
  const v4 = await devgate.checkPort(port, "127.0.0.1");
  if (v4) return true;
  return devgate.checkPort(port, "localhost");
}

/**
 * Wait for a port to become available on either IPv4 or IPv6.
 */
async function waitForPortAny(port, timeout = 45000, interval = 500) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await checkPortAny(port)) return true;
    await new Promise((r) => setTimeout(r, interval));
  }
  return false;
}

/**
 * Create a public tunnel using localtunnel (pure Node.js, no subprocess).
 * Works inside Claude Desktop's sandbox where bore/SSH cannot.
 */
async function exposeLocaltunnel(port) {
  log(`[tunnel] Trying localtunnel for port ${port}...`);
  const tunnel = await localtunnel({ port });
  activeLtTunnels.push(tunnel);
  tunnel.on("error", (err) => {
    log(`[tunnel] localtunnel error: ${err.message}`);
  });
  tunnel.on("close", () => {
    const idx = activeLtTunnels.indexOf(tunnel);
    if (idx !== -1) activeLtTunnels.splice(idx, 1);
  });
  return {
    url: tunnel.url,
    backend: "localtunnel",
    port,
    process: null,
  };
}

/**
 * Create a public tunnel using cloudflared (Cloudflare Tunnel).
 * Uses trycloudflare.com domain which ISPs/security software do NOT block.
 * No account needed. Requires cloudflared binary installed.
 */
async function exposeCloudflared(port) {
  log(`[tunnel] Trying cloudflared for port ${port}...`);

  // Check if cloudflared is installed
  try {
    require("child_process").execSync("which cloudflared", { stdio: "pipe" });
  } catch {
    throw new Error("cloudflared not installed. Install: brew install cloudflared");
  }

  return new Promise((resolve, reject) => {
    const proc = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${port}`], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let output = "";
    const urlRegex = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/;
    let resolved = false;

    const onData = (chunk) => {
      output += chunk.toString();
      const match = output.match(urlRegex);
      if (match && !resolved) {
        resolved = true;
        managedBackends.push(proc);
        resolve({
          url: match[0],
          backend: "cloudflare",
          port,
          process: proc,
        });
      }
    };

    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);

    proc.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`cloudflared failed to start: ${err.message}`));
      }
    });

    proc.on("exit", (code) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`cloudflared exited with code ${code}`));
      }
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill();
        reject(new Error("cloudflared timed out after 15 seconds"));
      }
    }, 15000);
  });
}

/**
 * Smart tunnel creation. Tries cloudflared first (ISP-safe, trusted domain),
 * then bore, then localtunnel, then SSH, then local IP.
 * If a specific backend is requested, uses that directly.
 */
async function smartExpose(port, preferredBackend) {
  // If user explicitly requested a specific backend, honor it
  if (preferredBackend === "bore" || preferredBackend === "ssh" || preferredBackend === "local") {
    return devgate.autoExpose(port, preferredBackend);
  }
  if (preferredBackend === "cloudflare") {
    return exposeCloudflared(port);
  }
  if (preferredBackend === "localtunnel") {
    const result = await exposeLocaltunnel(port);
    result.note = "localtunnel URLs show a 'Friendly Reminder' page on first visit — click 'Click to Continue' to access the app.";
    return result;
  }

  // Auto mode: cloudflared → bore → localtunnel → SSH → local IP
  const errors = [];

  // 1. Try cloudflared (trusted domain, ISPs don't block trycloudflare.com)
  try {
    return await exposeCloudflared(port);
  } catch (err) {
    log(`[tunnel] cloudflared failed: ${err.message}`);
    errors.push(`cloudflared: ${err.message}`);
  }

  // 2. Try bore (fast, no interstitial)
  try {
    log("[tunnel] Trying bore...");
    return await devgate.autoExpose(port, "bore");
  } catch (err) {
    log(`[tunnel] bore failed: ${err.message}`);
    errors.push(`bore: ${err.message}`);
  }

  // 3. Try localtunnel (pure Node.js, works in sandboxes)
  try {
    const result = await exposeLocaltunnel(port);
    result.errors = errors;
    result.note = "localtunnel URLs show a 'Friendly Reminder' page on first visit — click 'Click to Continue' to access the app.";
    return result;
  } catch (err) {
    log(`[tunnel] localtunnel failed: ${err.message}`);
    errors.push(`localtunnel: ${err.message}`);
  }

  // 4. Try SSH (localhost.run)
  try {
    log("[tunnel] Trying SSH (localhost.run)...");
    const result = await devgate.autoExpose(port, "ssh");
    result.errors = errors;
    return result;
  } catch (err) {
    log(`[tunnel] SSH failed: ${err.message}`);
    errors.push(`ssh: ${err.message}`);
  }

  // 5. Ultimate fallback: local IP
  const localResult = devgate.exposeLocal(port);
  localResult.fallback = true;
  localResult.errors = errors;
  return localResult;
}

// ============================================================================
// Server Setup
// ============================================================================

const server = new McpServer({
  name: "devgate",
  version: require("../package.json").version,
}, {
  capabilities: {
    tools: {},
  },
});

// ============================================================================
// Tool: scan_ports
// ============================================================================

server.tool(
  "scan_ports",
  "Scan common development ports (3000, 5173, 8000, 8080, etc.) for running dev servers. Returns a list of open ports with detected framework information.",
  {
    ports: z
      .array(z.number())
      .optional()
      .describe(
        "Optional list of specific ports to scan. If omitted, scans all common dev ports (3000, 3001, 4200, 5000, 5173, 8000, 8080, 8888, etc.).",
      ),
  },
  async ({ ports }) => {
    log("[scan_ports] Scanning ports...");
    const services = await devgate.scanPorts(ports || undefined);
    if (services.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No running dev servers found on common ports.",
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              found: services.length,
              services: services.map((s) => ({
                port: s.port,
                status: s.status,
                framework: s.framework || "unknown",
                url: `http://127.0.0.1:${s.port}`,
              })),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ============================================================================
// Tool: detect_project
// ============================================================================

server.tool(
  "detect_project",
  "Detect the project framework in a directory by examining package.json, requirements.txt, Cargo.toml, and other markers. Returns framework name, language, start command, default port, and package manager.",
  {
    dir: z
      .string()
      .optional()
      .describe(
        "Absolute path to the project directory. Defaults to the current working directory if not specified.",
      ),
  },
  async ({ dir }) => {
    const targetDir = dir || process.cwd();
    log(`[detect_project] Detecting project in ${targetDir}`);

    if (!fs.existsSync(targetDir)) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Directory does not exist: ${targetDir}`,
          },
        ],
        isError: true,
      };
    }

    const project = devgate.detectProject(targetDir);

    if (!project) {
      return {
        content: [
          {
            type: "text",
            text: `No recognized project framework detected in ${targetDir}. Looked for: package.json (Node.js frameworks), requirements.txt (Python), Cargo.toml (Rust), go.mod (Go), Gemfile (Rails), composer.json (Laravel), and static HTML files.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              framework: project.name,
              language: project.language,
              startCommand: project.startCmd,
              defaultPort: project.defaultPort,
              icon: project.icon,
              packageManager: project.packageManager || null,
              directory: targetDir,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ============================================================================
// Tool: expose_port
// ============================================================================

server.tool(
  "expose_port",
  "Expose a running local port via a public tunnel so it can be accessed from your phone or any device. Returns a public HTTPS URL accessible from anywhere, not just local WiFi.",
  {
    port: z
      .number()
      .describe("The local port number to expose (e.g., 3000, 8080)."),
    backend: z
      .enum(["cloudflare", "localtunnel", "bore", "ssh", "local"])
      .optional()
      .describe(
        'Tunnel backend. Default auto-selects best available. "cloudflare" uses Cloudflare Tunnel (HTTPS, ISP-safe, requires cloudflared). "localtunnel" is pure Node.js. "bore" requires bore-cli. "ssh" uses localhost.run. "local" returns local IP (same WiFi only).',
      ),
  },
  async ({ port, backend }) => {
    log(`[expose_port] Exposing port ${port} via ${backend || "auto"}...`);

    const isOpen = await checkPortAny(port);
    if (!isOpen) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Nothing is running on port ${port}. Start a dev server on that port first, or use the start_and_expose tool to start one automatically.`,
          },
        ],
        isError: true,
      };
    }

    const tunnel = await smartExpose(port, backend || null);
    const localIP = devgate.getLocalIP();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              url: tunnel.url,
              backend: tunnel.backend,
              port: tunnel.port,
              local_ip: localIP,
              fallback: tunnel.fallback || false,
              note: tunnel.note || null,
              errors: tunnel.errors || [],
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ============================================================================
// Tool: start_and_expose
// ============================================================================

server.tool(
  "start_and_expose",
  "Full pipeline: detect the project framework, install dependencies if needed, start the dev server, create a public tunnel, and return the URL. This is the primary tool — use it when someone says 'start my project and give me a link'. Returns a public HTTPS URL accessible from anywhere.",
  {
    dir: z
      .string()
      .optional()
      .describe(
        "Absolute path to the project directory. Defaults to the current working directory.",
      ),
    port: z
      .number()
      .optional()
      .describe(
        "Port to start the dev server on. If omitted, uses the framework's default port.",
      ),
    backend: z
      .enum(["cloudflare", "localtunnel", "bore", "ssh", "local"])
      .optional()
      .describe(
        "Tunnel backend. Default auto-selects best available. cloudflare is preferred (HTTPS, ISP-safe). Options: cloudflare, localtunnel, bore, ssh, local.",
      ),
  },
  async ({ dir, port, backend }) => {
    const targetDir = dir || process.cwd();
    log(`[start_and_expose] Starting pipeline in ${targetDir}`);

    if (!fs.existsSync(targetDir)) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Directory does not exist: ${targetDir}`,
          },
        ],
        isError: true,
      };
    }

    // Step 1: Detect project
    log("[start_and_expose] Detecting project...");
    const project = devgate.detectProject(targetDir);
    if (!project) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Could not detect a project framework in ${targetDir}. Make sure the directory contains a package.json, requirements.txt, Cargo.toml, go.mod, or other project file.`,
          },
        ],
        isError: true,
      };
    }
    log(`[start_and_expose] Detected: ${project.name}`);

    // Step 2: Start server (handles dep install & already-running detection)
    const serverPort = port || project.defaultPort;
    log(`[start_and_expose] Starting server on port ${serverPort}...`);

    let serverResult;
    try {
      serverResult = await devgate.startServer({
        dir: targetDir,
        port: serverPort,
        log: (msg) => log(`[server] ${msg}`),
      });
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Error starting ${project.name} server: ${err.message}`,
          },
        ],
        isError: true,
      };
    }

    log(
      `[start_and_expose] Server ${serverResult.alreadyRunning ? "already running" : "started"} on port ${serverResult.port}`,
    );

    // Step 3: Create tunnel
    log("[start_and_expose] Creating tunnel...");
    let tunnel;
    try {
      tunnel = await smartExpose(serverResult.port, backend || null);
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating tunnel for port ${serverResult.port}: ${err.message}. The server is running but could not be exposed publicly.`,
          },
        ],
        isError: true,
      };
    }

    const localIP = devgate.getLocalIP();

    log(`[start_and_expose] Done! URL: ${tunnel.url}`);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              url: tunnel.url,
              backend: tunnel.backend,
              port: serverResult.port,
              framework: project.name,
              language: project.language,
              local_ip: localIP,
              already_running: serverResult.alreadyRunning || false,
              fallback: tunnel.fallback || false,
              note: tunnel.note || null,
              errors: tunnel.errors || [],
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ============================================================================
// Tool: start_full_stack
// ============================================================================

server.tool(
  "start_full_stack",
  "Start both a backend and frontend server for a full-stack project, then expose the frontend via tunnel. Use this when a project has separate backend (e.g. FastAPI, Express) and frontend (e.g. Vite, Next.js) directories.",
  {
    dir: z
      .string()
      .describe("Absolute path to the project root directory."),
    frontend_dir: z
      .string()
      .describe(
        'Relative path from project root to the frontend directory (e.g. "frontend", "client", "web").',
      ),
    backend_cmd: z
      .string()
      .describe(
        'Command to start the backend server (e.g. "uvicorn backend.app:app --reload --port 8000", "node server.js").',
      ),
    backend_port: z
      .number()
      .describe("Port the backend server will run on (e.g. 8000)."),
    frontend_port: z
      .number()
      .optional()
      .describe(
        "Port the frontend dev server will listen on. Use this when the project's config (e.g. vite.config.js) specifies a non-default port. Does not override the start command — just tells devgate which port to wait for and expose.",
      ),
    backend: z
      .enum(["cloudflare", "localtunnel", "bore", "ssh", "local"])
      .optional()
      .describe(
        "Tunnel backend for the frontend. Defaults to localtunnel (public HTTPS, works everywhere). Options: localtunnel, bore, ssh, local.",
      ),
  },
  async ({ dir, frontend_dir, backend_cmd, backend_port, frontend_port, backend }) => {
    log(`[start_full_stack] Starting full stack in ${dir}`);

    if (!fs.existsSync(dir)) {
      return {
        content: [{ type: "text", text: `Error: Directory does not exist: ${dir}` }],
        isError: true,
      };
    }

    const frontendPath = path.resolve(dir, frontend_dir);
    if (!fs.existsSync(frontendPath)) {
      return {
        content: [{ type: "text", text: `Error: Frontend directory does not exist: ${frontendPath}` }],
        isError: true,
      };
    }

    // ── Step 1: Start backend ──
    // If command starts with a Python tool (uvicorn, gunicorn, flask, etc.)
    // that isn't directly in PATH, use python3 -m instead
    let resolvedCmd = backend_cmd;
    const pythonTools = ["uvicorn", "gunicorn", "flask", "streamlit", "fastapi"];
    const cmdBin = backend_cmd.split(" ")[0];
    if (pythonTools.includes(cmdBin)) {
      try {
        require("child_process").execSync(`which ${cmdBin}`, { stdio: "pipe" });
      } catch {
        resolvedCmd = `python3 -m ${backend_cmd}`;
        log(`[start_full_stack] ${cmdBin} not in PATH, using: ${resolvedCmd}`);
      }
    }

    log(`[start_full_stack] Starting backend: ${resolvedCmd}`);
    const backendAlreadyRunning = await devgate.checkPort(backend_port);
    let backendPid = null;

    if (backendAlreadyRunning) {
      log(`[start_full_stack] Backend already running on port ${backend_port}`);
    } else {
      const parts = resolvedCmd.split(" ");
      const backendProc = spawn(parts[0], parts.slice(1), {
        cwd: dir,
        env: { ...process.env, HOST: "0.0.0.0" },
        stdio: ["pipe", "pipe", "pipe"],
        shell: true,
        detached: false,
      });

      managedBackends.push(backendProc);
      backendPid = backendProc.pid;

      let backendOutput = "";
      backendProc.stdout.on("data", (d) => { backendOutput += d.toString(); });
      backendProc.stderr.on("data", (d) => { backendOutput += d.toString(); });
      backendProc.on("error", (err) => {
        log(`[start_full_stack] Backend error: ${err.message}`);
      });

      log(`[start_full_stack] Waiting for backend on port ${backend_port}...`);
      const backendReady = await devgate.waitForPort(backend_port, 30000);

      if (!backendReady) {
        backendProc.kill();
        return {
          content: [{
            type: "text",
            text: `Error: Backend did not start within 30 seconds on port ${backend_port}.\nCommand: ${backend_cmd}\nOutput:\n${backendOutput.slice(-500)}`,
          }],
          isError: true,
        };
      }
      log(`[start_full_stack] Backend is ready on port ${backend_port}`);
    }

    // ── Step 2: Start frontend ──
    log(`[start_full_stack] Starting frontend in ${frontendPath}`);
    const frontendProject = devgate.detectProject(frontendPath);
    const detectedPort = frontendProject ? frontendProject.defaultPort : 5173;
    const actualFrontendPort = frontend_port || detectedPort;

    let frontendResult;

    // Check if frontend is already running on the expected port
    const frontendAlreadyRunning = await checkPortAny(actualFrontendPort);

    if (frontendAlreadyRunning) {
      log(`[start_full_stack] Frontend already running on port ${actualFrontendPort}`);
      frontendResult = {
        project: frontendProject || { name: "Unknown" },
        port: actualFrontendPort,
        alreadyRunning: true,
      };
    } else if (frontend_port && frontend_port !== detectedPort) {
      // Custom port specified that differs from framework default.
      // Start frontend manually to avoid startServer adding --port flags
      // or waiting for the wrong port. The project config (e.g. vite.config.js)
      // already controls the port.
      if (!frontendProject) {
        return {
          content: [{
            type: "text",
            text: `Error: No frontend framework detected in ${frontendPath}.\nBackend is running on port ${backend_port}.`,
          }],
          isError: true,
        };
      }

      const startCmd = frontendProject.startCmd;
      log(`[start_full_stack] Frontend start: ${startCmd} (waiting for port ${frontend_port})`);

      const fParts = startCmd.split(" ");
      const frontendProc = spawn(fParts[0], fParts.slice(1), {
        cwd: frontendPath,
        env: { ...process.env, HOST: "0.0.0.0" },
        stdio: ["pipe", "pipe", "pipe"],
        shell: true,
        detached: false,
      });

      managedBackends.push(frontendProc);

      let frontendOutput = "";
      frontendProc.stdout.on("data", (d) => { frontendOutput += d.toString(); });
      frontendProc.stderr.on("data", (d) => { frontendOutput += d.toString(); });

      const frontendReady = await waitForPortAny(frontend_port, 45000);
      if (!frontendReady) {
        frontendProc.kill();
        return {
          content: [{
            type: "text",
            text: `Error: Frontend did not start within 45 seconds on port ${frontend_port}.\nCommand: ${startCmd}\nOutput:\n${frontendOutput.slice(-500)}\nBackend is running on port ${backend_port}.`,
          }],
          isError: true,
        };
      }

      frontendResult = {
        project: frontendProject,
        port: frontend_port,
        alreadyRunning: false,
      };
    } else {
      // Default port matches — use devgate's startServer
      try {
        frontendResult = await devgate.startServer({
          dir: frontendPath,
          log: (msg) => log(`[frontend] ${msg}`),
        });
      } catch (err) {
        return {
          content: [{
            type: "text",
            text: `Error starting frontend: ${err.message}\nBackend is running on port ${backend_port}.`,
          }],
          isError: true,
        };
      }
    }

    log(`[start_full_stack] Frontend ready on port ${actualFrontendPort}`);

    // ── Step 3: Expose frontend via tunnel ──
    log("[start_full_stack] Creating tunnel for frontend...");
    let tunnel;
    try {
      tunnel = await smartExpose(actualFrontendPort, backend || null);
    } catch (err) {
      return {
        content: [{
          type: "text",
          text: `Error creating tunnel: ${err.message}\nBackend is running on port ${backend_port}. Frontend is running on port ${actualFrontendPort}.`,
        }],
        isError: true,
      };
    }

    const localIP = devgate.getLocalIP();
    log(`[start_full_stack] Done! Frontend URL: ${tunnel.url}`);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          frontend_url: tunnel.url,
          frontend_port: actualFrontendPort,
          frontend_framework: frontendResult.project.name,
          backend_port: backend_port,
          backend_command: backend_cmd,
          backend_already_running: backendAlreadyRunning,
          tunnel_backend: tunnel.backend,
          local_ip: localIP,
          local_frontend: `http://${localIP}:${actualFrontendPort}`,
          local_backend: `http://${localIP}:${backend_port}`,
          fallback: tunnel.fallback || false,
          note: tunnel.note || null,
        }, null, 2),
      }],
    };
  },
);

// ============================================================================
// Tool: stop_tunnels
// ============================================================================

server.tool(
  "stop_tunnels",
  "Stop all active tunnels and dev servers started by devgate. Cleans up all child processes. Use this when you're done sharing a project or want to free up ports.",
  async () => {
    log("[stop_tunnels] Stopping all tunnels and servers...");

    const tunnelsKilled = devgate.killAllTunnels();
    const serversKilled = devgate.killAllServers();

    // Close localtunnel instances
    for (const lt of activeLtTunnels) {
      try { lt.close(); } catch {}
    }
    const ltClosed = activeLtTunnels.length;
    activeLtTunnels.length = 0;

    // Also kill manually managed backend processes
    let backendsKilled = 0;
    for (const proc of managedBackends) {
      if (proc && !proc.killed) {
        try { proc.kill("SIGTERM"); backendsKilled++; } catch {}
      }
    }
    managedBackends.length = 0;

    const total = tunnelsKilled + ltClosed + serversKilled + backendsKilled;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              tunnels_stopped: tunnelsKilled + ltClosed,
              servers_stopped: serversKilled + backendsKilled,
              message:
                total > 0
                  ? `Stopped ${tunnelsKilled} tunnel(s) and ${serversKilled + backendsKilled} server(s).`
                  : "No active tunnels or servers to stop.",
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ============================================================================
// Tool: get_status
// ============================================================================

server.tool(
  "get_status",
  "Get the current status of all active tunnels and dev servers managed by devgate. Shows URLs, ports, backends, and process info.",
  async () => {
    log("[get_status] Fetching status...");

    const coreTunnels = devgate.getActiveTunnels();
    const ltTunnels = activeLtTunnels.map((lt) => ({
      url: lt.url,
      port: lt.tunnelCluster?.opts?.local_port || null,
      backend: "localtunnel",
      pid: null,
    }));
    const allTunnels = [...coreTunnels.map((t) => ({
      url: t.url,
      port: t.port,
      backend: t.backend,
      pid: t.process ? t.process.pid : null,
    })), ...ltTunnels];
    const localIP = devgate.getLocalIP();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              active_tunnels: allTunnels,
              local_ip: localIP,
              tunnel_count: allTunnels.length,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ============================================================================
// Process Cleanup
// ============================================================================

function cleanup() {
  log("[devgate] Cleaning up tunnels and servers...");
  devgate.killAllTunnels();
  devgate.killAllServers();
  for (const lt of activeLtTunnels) {
    try { lt.close(); } catch {}
  }
  activeLtTunnels.length = 0;
  for (const proc of managedBackends) {
    if (proc && !proc.killed) {
      try { proc.kill("SIGTERM"); } catch {}
    }
  }
  managedBackends.length = 0;
}

process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});
process.on("exit", cleanup);

// ============================================================================
// Start Server
// ============================================================================

async function main() {
  log("[devgate] Starting MCP server...");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("[devgate] MCP server connected and ready.");
}

main().catch((err) => {
  log(`[devgate] Fatal error: ${err.message}`);
  process.exit(1);
});
