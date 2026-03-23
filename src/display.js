// ============================================================================
// devgate/src/display.js — Pretty terminal output
// ============================================================================

const { c } = require("./config");

let qrcode;
try { qrcode = require("qrcode-terminal"); } catch { qrcode = null; }

const LOGO = `
${c.cyan}${c.bold}  ╔══════════════════════════╗
  ║       ${c.white}⚡ devgate ⚡${c.cyan}       ║
  ║  ${c.dim}localhost → your phone${c.reset}${c.cyan}${c.bold}  ║
  ╚══════════════════════════╝${c.reset}
`;

function printLogo() {
  console.log(LOGO);
}

function printScanResults(services) {
  if (services.length === 0) {
    console.log(`\n${c.yellow}  No dev servers found on common ports.${c.reset}`);
    console.log(`${c.dim}  Start your project first, or use: devgate start${c.reset}\n`);
    return;
  }

  console.log(`\n${c.bold}  Found ${services.length} running service${services.length > 1 ? "s" : ""}:${c.reset}\n`);

  for (const svc of services) {
    const fw = svc.framework ? `${c.cyan}${svc.framework}${c.reset}` : `${c.dim}unknown${c.reset}`;
    const status = svc.status ? `${c.green}${svc.status}${c.reset}` : `${c.yellow}?${c.reset}`;
    console.log(`  ${c.bold}:${svc.port}${c.reset}  →  ${fw}  (HTTP ${status})`);
  }
  console.log();
}

function printDetectedProject(project) {
  console.log(`\n${c.bold}  Detected project:${c.reset}`);
  console.log(`  ${project.icon}  ${c.cyan}${project.name}${c.reset} (${project.language})`);
  console.log(`  ${c.dim}Start: ${project.startCmd}${c.reset}`);
  console.log(`  ${c.dim}Port:  ${project.defaultPort}${c.reset}`);
  if (project.packageManager && project.packageManager !== "npm") {
    console.log(`  ${c.dim}PM:    ${project.packageManager}${c.reset}`);
  }
  console.log();
}

function printTunnelResult(tunnel, project = null) {
  const width = 50;
  const line = "═".repeat(width);
  const pad = (str, len) => str + " ".repeat(Math.max(0, len - stripAnsi(str).length));

  console.log();
  console.log(`  ${c.green}${c.bold}╔${line}╗${c.reset}`);
  
  if (project) {
    console.log(`  ${c.green}${c.bold}║${c.reset}  ${project.icon}  ${c.bold}${project.name}${c.reset} is now exposed!${" ".repeat(Math.max(0, width - 7 - project.name.length - 15))}${c.green}${c.bold}║${c.reset}`);
  } else {
    console.log(`  ${c.green}${c.bold}║${c.reset}  ${c.bold}Port ${tunnel.port} is now exposed!${c.reset}${" ".repeat(Math.max(0, width - 25))}${c.green}${c.bold}║${c.reset}`);
  }
  
  console.log(`  ${c.green}${c.bold}╠${line}╣${c.reset}`);

  // URL display
  const urlLabel = tunnel.backend === "local" ? "📱 Local URL:" : "🌍 Public URL:";
  console.log(`  ${c.green}${c.bold}║${c.reset}                                                  ${c.green}${c.bold}║${c.reset}`);
  console.log(`  ${c.green}${c.bold}║${c.reset}  ${urlLabel}                                       ${c.green}${c.bold}║${c.reset}`);
  console.log(`  ${c.green}${c.bold}║${c.reset}  ${c.bold}${c.cyan}${tunnel.url}${c.reset}${" ".repeat(Math.max(0, width - 2 - tunnel.url.length))}${c.green}${c.bold}║${c.reset}`);
  console.log(`  ${c.green}${c.bold}║${c.reset}                                                  ${c.green}${c.bold}║${c.reset}`);

  // Backend info
  const backendInfo = `via ${tunnel.backend}`;
  console.log(`  ${c.green}${c.bold}║${c.reset}  ${c.dim}${backendInfo}${c.reset}${" ".repeat(Math.max(0, width - 2 - backendInfo.length))}${c.green}${c.bold}║${c.reset}`);

  if (tunnel.fallback && tunnel.errors?.length) {
    console.log(`  ${c.green}${c.bold}║${c.reset}  ${c.yellow}⚠ Fell back to local (same WiFi only)${c.reset}${" ".repeat(Math.max(0, width - 40))}${c.green}${c.bold}║${c.reset}`);
  }

  if (tunnel.backend === "local") {
    console.log(`  ${c.green}${c.bold}║${c.reset}  ${c.dim}Requires same WiFi network${c.reset}${" ".repeat(Math.max(0, width - 28))}${c.green}${c.bold}║${c.reset}`);
  }

  console.log(`  ${c.green}${c.bold}╠${line}╣${c.reset}`);
  console.log(`  ${c.green}${c.bold}║${c.reset}  ${c.dim}Press Ctrl+C to stop${c.reset}${" ".repeat(Math.max(0, width - 22))}${c.green}${c.bold}║${c.reset}`);
  console.log(`  ${c.green}${c.bold}╚${line}╝${c.reset}`);
  console.log();

  // QR Code
  if (qrcode) {
    console.log(`  ${c.bold}Scan this QR code on your phone:${c.reset}\n`);
    qrcode.generate(tunnel.url, { small: true }, (code) => {
      // Indent QR code
      const lines = code.split("\n");
      for (const line of lines) {
        console.log(`    ${line}`);
      }
      console.log();
    });
  }
}

function printError(msg) {
  console.error(`\n  ${c.red}${c.bold}✖ Error:${c.reset} ${msg}\n`);
}

function printWarning(msg) {
  console.log(`  ${c.yellow}⚠ ${msg}${c.reset}`);
}

function printSuccess(msg) {
  console.log(`  ${c.green}✔ ${msg}${c.reset}`);
}

function printInfo(msg) {
  console.log(`  ${c.cyan}ℹ ${msg}${c.reset}`);
}

function printSpinner(msg) {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write(`\r  ${c.cyan}${frames[i % frames.length]}${c.reset} ${msg}`);
    i++;
  }, 80);
  return {
    stop: (finalMsg) => {
      clearInterval(interval);
      process.stdout.write(`\r  ${c.green}✔${c.reset} ${finalMsg || msg}\n`);
    },
    fail: (finalMsg) => {
      clearInterval(interval);
      process.stdout.write(`\r  ${c.red}✖${c.reset} ${finalMsg || msg}\n`);
    }
  };
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

module.exports = {
  printLogo, printScanResults, printDetectedProject, printTunnelResult,
  printError, printWarning, printSuccess, printInfo, printSpinner, stripAnsi
};
