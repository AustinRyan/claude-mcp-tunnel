// ============================================================================
// devgate/src/index.js — Public API for programmatic use
// ============================================================================

const { scanPorts, checkPort, waitForPort } = require("./scanner");
const { detectProject, detectPackageManager } = require("./detector");
const { autoExpose, exposeLocal, exposeBore, exposeSSH, killAllTunnels, getActiveTunnels, getLocalIP } = require("./tunnel");
const { startServer, killAllServers } = require("./starter");

module.exports = {
  // Scanner
  scanPorts,
  checkPort,
  waitForPort,

  // Detector
  detectProject,
  detectPackageManager,

  // Tunnel
  autoExpose,
  exposeLocal,
  exposeBore,
  exposeSSH,
  killAllTunnels,
  getActiveTunnels,
  getLocalIP,

  // Server
  startServer,
  killAllServers
};
