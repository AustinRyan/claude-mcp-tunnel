#!/usr/bin/env node
// ============================================================================
// devgate CLI — Expose your local dev server to your phone in one command
// ============================================================================

const { scanPorts, checkPort, waitForPort } = require("../src/scanner");
const { detectProject } = require("../src/detector");
const { autoExpose, killAllTunnels, getLocalIP } = require("../src/tunnel");
const { startServer, killAllServers } = require("../src/starter");
const {
  printLogo, printScanResults, printDetectedProject, printTunnelResult,
  printError, printWarning, printInfo, printSpinner, printSuccess
} = require("../src/display");
const { c } = require("../src/config");

// ─── Parse CLI args ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = {};
const positional = [];

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--help" || arg === "-h") { flags.help = true; }
  else if (arg === "--version" || arg === "-v") { flags.version = true; }
  else if (arg === "--local" || arg === "-l") { flags.backend = "local"; }
  else if (arg === "--bore" || arg === "-b") { flags.backend = "bore"; }
  else if (arg === "--ssh" || arg === "-s") { flags.backend = "ssh"; }
  else if (arg === "--start") { flags.start = true; }
  else if (arg === "--port" || arg === "-p") { flags.port = parseInt(args[++i]); }
  else if (arg === "--dir" || arg === "-d") { flags.dir = args[++i]; }
  else if (arg === "--quiet" || arg === "-q") { flags.quiet = true; }
  else if (arg.startsWith("-")) { printError(`Unknown flag: ${arg}`); process.exit(1); }
  else { positional.push(arg); }
}

const command = positional[0] || "expose";
const commandArg = positional[1];

// ─── Commands ───────────────────────────────────────────────────────────────

async function main() {
  if (flags.version) {
    const pkg = require("../package.json");
    console.log(`devgate v${pkg.version}`);
    process.exit(0);
  }

  if (flags.help || command === "help") {
    printHelp();
    process.exit(0);
  }

  switch (command) {
    case "expose":
      await cmdExpose();
      break;
    case "scan":
      await cmdScan();
      break;
    case "start":
      await cmdStart();
      break;
    case "detect":
      await cmdDetect();
      break;
    case "ip":
      cmdIP();
      break;
    default:
      // If the command looks like a port number, treat it as expose
      if (/^\d+$/.test(command)) {
        flags.port = parseInt(command);
        await cmdExpose();
      } else {
        printError(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
      }
  }
}

// ─── expose ─────────────────────────────────────────────────────────────────

async function cmdExpose() {
  if (!flags.quiet) printLogo();

  let port = flags.port || (commandArg ? parseInt(commandArg) : null);
  let project = null;

  // If no port specified, try to auto-detect
  if (!port) {
    // First check if anything is already running
    const spinner = printSpinner("Scanning for running dev servers...");
    const services = await scanPorts();
    
    if (services.length > 0) {
      spinner.stop(`Found ${services.length} running service${services.length > 1 ? "s" : ""}`);
      port = services[0].port;
      project = { name: services[0].framework || "Dev Server", icon: "🔗" };
      
      if (services.length > 1) {
        printInfo(`Multiple servers found. Using port ${port} (${services[0].framework || "first found"})`);
        printInfo(`Specify a port with: devgate expose <port>`);
      }
    } else if (flags.start) {
      spinner.stop("No running servers found");
      // Try to detect and start the project
      return await cmdStart();
    } else {
      spinner.fail("No running dev servers found");
      
      // Try to detect project for helpful messaging
      const detected = detectProject(flags.dir);
      if (detected) {
        printInfo(`Detected ${detected.icon} ${detected.name} project`);
        printInfo(`Start it with: devgate start`);
        printInfo(`Or start it yourself and run: devgate expose`);
      } else {
        printInfo("Start your dev server first, then run: devgate expose");
        printInfo("Or specify a port: devgate expose 3000");
      }
      process.exit(1);
    }
  } else {
    // Verify the port is actually in use
    const portOpen = await checkPort(port);
    if (!portOpen) {
      if (flags.start) {
        return await cmdStart();
      }
      printError(`Nothing is running on port ${port}`);
      printInfo("Start your server first, or use: devgate start");
      process.exit(1);
    }
  }

  // Create the tunnel
  const tunnelSpinner = printSpinner("Creating tunnel...");
  
  try {
    const tunnel = await autoExpose(port, flags.backend);
    tunnelSpinner.stop(`Tunnel created via ${tunnel.backend}`);

    // Detect project info for display
    if (!project) {
      const detected = detectProject(flags.dir);
      project = detected || null;
    }

    printTunnelResult(tunnel, project);

    // Keep process alive
    if (tunnel.process) {
      printInfo("Tunnel is running. Press Ctrl+C to stop.");
      
      // Keep alive until killed
      await new Promise((resolve) => {
        tunnel.process.on("exit", () => {
          printWarning("Tunnel disconnected.");
          resolve();
        });
      });
    } else {
      // Local mode — just display and exit
      printInfo("Open this URL on your phone (same WiFi network required).");
    }
  } catch (err) {
    tunnelSpinner.fail("Tunnel creation failed");
    printError(err.message);
    process.exit(1);
  }
}

// ─── scan ───────────────────────────────────────────────────────────────────

async function cmdScan() {
  if (!flags.quiet) printLogo();

  const spinner = printSpinner("Scanning ports...");
  const services = await scanPorts();
  spinner.stop(`Scanned ${require("../src/config").COMMON_DEV_PORTS.length} ports`);
  
  printScanResults(services);
}

// ─── start ──────────────────────────────────────────────────────────────────

async function cmdStart() {
  if (!flags.quiet) printLogo();

  const dir = flags.dir || process.cwd();

  // Detect project
  const spinner = printSpinner("Detecting project...");
  const project = detectProject(dir);
  
  if (!project) {
    spinner.fail("Could not detect project type");
    printError("No recognized project found in this directory.");
    printInfo("Supported: Next.js, Vite, React, Angular, Vue, Svelte, Gatsby, Remix, Nuxt, Astro,");
    printInfo("          Express, Fastify, NestJS, Flask, FastAPI, Django, Streamlit, Rails, Laravel,");
    printInfo("          Hugo, Jekyll, Go, Rust, and static HTML.");
    process.exit(1);
  }
  
  spinner.stop(`Detected ${project.icon} ${project.name}`);
  
  if (!flags.quiet) printDetectedProject(project);

  // Start the server
  try {
    const server = await startServer({
      dir,
      port: flags.port,
      log: (msg) => console.log(`  ${msg}`)
    });

    // Now expose it
    const port = server.port;
    const tunnelSpinner = printSpinner("Creating tunnel...");
    
    try {
      const tunnel = await autoExpose(port, flags.backend);
      tunnelSpinner.stop(`Tunnel created via ${tunnel.backend}`);
      printTunnelResult(tunnel, project);

      // Keep process alive
      if (tunnel.process) {
        await new Promise((resolve) => {
          tunnel.process.on("exit", () => {
            printWarning("Tunnel disconnected.");
            resolve();
          });
        });
      }
    } catch (err) {
      tunnelSpinner.fail("Tunnel creation failed");
      printError(err.message);
      printInfo(`Server is still running on port ${port}`);
      printInfo(`Try: devgate expose ${port} --local`);
    }
  } catch (err) {
    printError(err.message);
    process.exit(1);
  }
}

// ─── detect ─────────────────────────────────────────────────────────────────

async function cmdDetect() {
  if (!flags.quiet) printLogo();

  const dir = flags.dir || process.cwd();
  const project = detectProject(dir);

  if (project) {
    printDetectedProject(project);
  } else {
    printWarning("No recognized project found in this directory.");
  }
}

// ─── ip ─────────────────────────────────────────────────────────────────────

function cmdIP() {
  const ip = getLocalIP();
  console.log(ip);
}

// ─── help ───────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
${c.cyan}${c.bold}  devgate${c.reset} — Expose your local dev server to your phone in one command.
  Zero accounts. Zero config. Just works.

${c.bold}  USAGE${c.reset}

    devgate                    Auto-detect running server and expose it
    devgate ${c.dim}<port>${c.reset}              Expose a specific port
    devgate start              Detect project, start server, and expose
    devgate scan               Show all running dev servers
    devgate detect             Show detected project type
    devgate ip                 Print your local IP address

${c.bold}  OPTIONS${c.reset}

    -p, --port ${c.dim}<port>${c.reset}          Use a specific port
    -d, --dir ${c.dim}<path>${c.reset}            Project directory (default: cwd)
    -l, --local                Use local network only (same WiFi)
    -b, --bore                 Force bore as tunnel backend
    -s, --ssh                  Force localhost.run (SSH) as backend
    --start                    Start the dev server if not running
    -q, --quiet                Minimal output
    -v, --version              Show version
    -h, --help                 Show this help

${c.bold}  EXAMPLES${c.reset}

    ${c.dim}# Expose whatever's running (auto-detect)${c.reset}
    devgate

    ${c.dim}# Expose port 3000 specifically${c.reset}
    devgate 3000

    ${c.dim}# Detect project, install deps, start, and expose${c.reset}
    devgate start

    ${c.dim}# Just show me the local IP URL (fastest)${c.reset}
    devgate 3000 --local

    ${c.dim}# Use bore for a public URL${c.reset}
    devgate 3000 --bore

    ${c.dim}# Scan what's running${c.reset}
    devgate scan

${c.bold}  TUNNEL BACKENDS${c.reset} (auto-selected, best available)

    ${c.green}bore${c.reset}           Fastest. Requires: cargo install bore-cli
    ${c.green}localhost.run${c.reset}  Zero install. Uses SSH (already on your machine)
    ${c.green}local${c.reset}          Same WiFi only. No tunnel, just your IP

${c.bold}  SUPPORTED FRAMEWORKS${c.reset}

    ${c.cyan}Node.js:${c.reset}  Next.js, Vite, React, Angular, Vue, Svelte, Gatsby,
              Remix, Nuxt, Astro, Express, Fastify, NestJS, Storybook,
              Docusaurus, Eleventy
    ${c.cyan}Python:${c.reset}   FastAPI, Flask, Django, Streamlit
    ${c.cyan}Other:${c.reset}    Rust, Go, Rails, Laravel, Hugo, Jekyll, Static HTML
`);
}

// ─── Run ────────────────────────────────────────────────────────────────────

main().catch((err) => {
  printError(err.message);
  killAllTunnels();
  killAllServers();
  process.exit(1);
});
