// ============================================================================
// devgate/src/scanner.js — Scan for running dev servers on common ports
// ============================================================================

const net = require("net");
const http = require("http");
const { COMMON_DEV_PORTS } = require("./config");

/**
 * Check if a single port is open
 */
function checkPort(port, host = "127.0.0.1", timeout = 300) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.on("connect", () => { socket.destroy(); resolve(true); });
    socket.on("timeout", () => { socket.destroy(); resolve(false); });
    socket.on("error", () => { socket.destroy(); resolve(false); });
    socket.connect(port, host);
  });
}

/**
 * Try to identify what's running on a port via HTTP
 */
async function identifyService(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/`, { timeout: 1500 }, (res) => {
      const headers = res.headers;
      let info = { port, status: res.statusCode, headers: {} };

      // Grab identifying headers
      if (headers["x-powered-by"]) info.poweredBy = headers["x-powered-by"];
      if (headers.server) info.server = headers.server;

      // Read a small chunk of body for framework detection
      let body = "";
      res.on("data", (chunk) => {
        body += chunk.toString();
        if (body.length > 2000) res.destroy();
      });
      res.on("end", () => {
        info.framework = detectFrameworkFromResponse(body, headers, port);
        resolve(info);
      });
      res.on("error", () => resolve(info));
    });
    req.on("error", () => resolve({ port, status: null, framework: null }));
    req.on("timeout", () => { req.destroy(); resolve({ port, status: null, framework: null }); });
  });
}

/**
 * Guess framework from HTTP response
 */
function detectFrameworkFromResponse(body, headers, port) {
  const poweredBy = (headers["x-powered-by"] || "").toLowerCase();
  const server = (headers.server || "").toLowerCase();
  const bodyLower = body.toLowerCase();

  if (poweredBy.includes("next.js") || bodyLower.includes("__next")) return "Next.js";
  if (poweredBy.includes("nuxt")) return "Nuxt";
  if (bodyLower.includes("__remix")) return "Remix";
  if (bodyLower.includes("__sveltekit")) return "SvelteKit";
  if (bodyLower.includes("gatsby")) return "Gatsby";
  if (bodyLower.includes("vite") || bodyLower.includes("/@vite")) return "Vite";
  if (bodyLower.includes("webpack") || bodyLower.includes("bundle.js")) return "Webpack Dev Server";
  if (bodyLower.includes("angular")) return "Angular";
  if (bodyLower.includes("storybook")) return "Storybook";
  if (poweredBy.includes("express")) return "Express";
  if (server.includes("uvicorn")) return "FastAPI/Uvicorn";
  if (server.includes("gunicorn")) return "Gunicorn";
  if (server.includes("werkzeug") || server.includes("flask")) return "Flask";
  if (server.includes("django")) return "Django";
  if (bodyLower.includes("streamlit")) return "Streamlit";
  if (server.includes("hugo")) return "Hugo";
  if (port === 6006) return "Storybook";
  if (port === 8501) return "Streamlit";
  if (port === 4200) return "Angular";
  if (port === 1313) return "Hugo";

  return null;
}

/**
 * Scan all common dev ports and return what's running
 */
async function scanPorts(customPorts = null) {
  const ports = customPorts || COMMON_DEV_PORTS;
  
  // Check all ports in parallel (fast)
  const results = await Promise.all(
    ports.map(async (port) => {
      const isOpen = await checkPort(port);
      if (!isOpen) return null;
      const info = await identifyService(port);
      return info;
    })
  );

  return results.filter(Boolean);
}

/**
 * Wait for a port to become available (after starting a server)
 */
async function waitForPort(port, timeout = 30000, interval = 500) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await checkPort(port)) return true;
    await new Promise(r => setTimeout(r, interval));
  }
  return false;
}

module.exports = { checkPort, identifyService, scanPorts, waitForPort };
