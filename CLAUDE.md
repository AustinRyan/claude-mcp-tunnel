# DEVGATE — Claude Code Build Prompt

## What We Are Building

**devgate** is an MCP (Model Context Protocol) server that exposes local dev servers to your phone in one command. It integrates with Claude Desktop, Cowork, and Dispatch so you can text from your phone "start my project and give me a URL" and get back a working link.

It also ships as a standalone CLI (`npx devgate`) for non-Claude users.

### The Core Problem

You text Claude Dispatch from your phone: "start my March Madness project and give me a link I can open on my phone." Claude needs to:

1. Detect what framework the project uses
2. Install dependencies if needed
3. Start the dev server
4. Create a public tunnel so your phone can reach it
5. Return the URL

### Architecture

The project has two layers:

**Core Engine** (already built in `src/`):
- `src/config.js` — Framework definitions (25+), port lists, tunnel backend configs
- `src/scanner.js` — Port scanning, HTTP service identification
- `src/detector.js` — Project detection from filesystem (package.json, requirements.txt, etc.)
- `src/starter.js` — Dev server startup with dep installation and package manager detection
- `src/tunnel.js` — Tunnel manager: bore → localhost.run (SSH) → local IP fallback
- `src/display.js` — Terminal formatting, QR codes
- `src/index.js` — Public API exports

**MCP Server** (to be built):
- `mcp-server/index.js` — MCP server entry point using `@modelcontextprotocol/sdk`
- Exposes tools: `expose_port`, `scan_ports`, `detect_project`, `start_and_expose`, `stop_tunnels`, `get_status`
- Registers in Claude Desktop via `claude_desktop_config.json`

**CLI** (already built in `bin/devgate.js`):
- Standalone CLI for non-Claude users
- Uses the same core engine

---

## RULES — READ THESE BEFORE WRITING ANY CODE

### Code Quality Rules

1. **This is a complete, production-ready tool. Not an MVP. Not a prototype.** Write every function, every error handler, every edge case. Do not leave TODOs, placeholders, or "implement later" comments.

2. **Never use fake data, mock data, or placeholder values.** Every function must do real work. If a function scans ports, it scans real ports. If it starts a server, it starts a real server. No stubs.

3. **Never silently swallow errors.** Every catch block must either handle the error meaningfully or propagate it with context. No empty catch blocks. No `catch(e) {}`.

4. **Stop and tell me if you hit a problem.** If something doesn't work, if a dependency is missing, if an approach won't work, if you're unsure about a design decision — STOP. Explain the problem. Do not guess, do not hack around it, do not ship broken code. I'd rather know about a problem than discover it later.

5. **Test after every phase.** After completing each phase, run the code and verify it works before moving to the next phase. Show me the output. If tests fail, fix them before proceeding.

6. **No unnecessary dependencies.** The core engine uses only `qrcode-terminal`. The MCP server should use only `@modelcontextprotocol/sdk` and the core engine. Do not add lodash, chalk, commander, or any other library unless absolutely necessary and you explain why.

7. **Write real error messages.** "Something went wrong" is not acceptable. Error messages must tell the user what failed, why, and what to do about it.

8. **Handle process cleanup.** Tunnels and dev servers are child processes. They MUST be killed on exit, on SIGINT, on SIGTERM, on uncaught exceptions. Zombie processes are unacceptable.

### MCP-Specific Rules

9. **Follow the MCP SDK patterns exactly.** Use `@modelcontextprotocol/sdk` and follow the official server implementation pattern. Do not invent custom transport or protocol handling.

10. **Every tool must have a complete JSON schema.** Input parameters must be fully typed with descriptions. No `any` types, no missing descriptions.

11. **Tool responses must be structured and useful.** Return structured data Claude can act on — URLs, port numbers, framework names, status messages. Not just "done."

12. **The MCP server must work with stdio transport.** This is what Claude Desktop uses. It reads from stdin, writes to stdout. All logging goes to stderr, NEVER stdout.

### Project Structure Rules

13. **Do not modify existing core files** (`src/config.js`, `src/scanner.js`, `src/detector.js`, `src/tunnel.js`, `src/starter.js`, `src/display.js`, `src/index.js`, `bin/devgate.js`) unless there is a bug. The core is built. The MCP layer wraps it.

14. **Keep the MCP server in `mcp-server/`** directory, separate from the core and CLI.

15. **Update package.json** to include the MCP server entry point and any new dependencies.

16. **Write a clear install guide** in the README that shows exactly how to add this to Claude Desktop's `claude_desktop_config.json`.

---

## BUILD PHASES

Execute these phases in order. Complete each phase fully. Test after each phase. Do not skip ahead.

### Phase 1: MCP Server Foundation

**Goal:** A working MCP server that starts, connects via stdio, and lists its tools.

**Tasks:**
1. Install `@modelcontextprotocol/sdk` 
2. Create `mcp-server/index.js` with the MCP server boilerplate
3. Register 6 tools with complete schemas (implement as stubs that return "not implemented" — this is the ONLY phase where stubs are allowed):
   - `scan_ports` — Scan for running dev servers
   - `detect_project` — Detect project framework from directory
   - `expose_port` — Expose a running port via tunnel
   - `start_and_expose` — Detect project, start server, create tunnel, return URL
   - `stop_tunnels` — Kill all active tunnels
   - `get_status` — Show active tunnels and servers
4. Create `mcp-server/package.json` for the MCP server
5. **Test:** Run the server with stdio and verify it responds to `tools/list`

### Phase 2: Implement scan_ports and detect_project

**Goal:** The two read-only tools work end-to-end.

**Tasks:**
1. Wire `scan_ports` to call `src/scanner.js` `scanPorts()` and return structured results
2. Wire `detect_project` to call `src/detector.js` `detectProject()` and return framework info
3. Handle the `dir` parameter — default to cwd, validate path exists
4. **Test:** Run the MCP server locally. Call both tools. Verify real results (scan actual ports, detect an actual project in a test directory).

### Phase 3: Implement expose_port

**Goal:** Expose a port through the tunnel fallback chain and return a URL.

**Tasks:**
1. Wire `expose_port` to call `src/tunnel.js` `autoExpose()`
2. Accept parameters: `port` (required), `backend` (optional: "bore", "ssh", "local")
3. Return: `{ url, backend, port, local_ip }`
4. Handle errors: port not open, tunnel timeout, bore not installed
5. **Test:** Start a simple HTTP server on port 3000 manually. Call `expose_port` with port 3000. Verify you get a working URL.

### Phase 4: Implement start_and_expose

**Goal:** The full pipeline — detect, install, start, tunnel, return URL.

**Tasks:**
1. Wire `start_and_expose` to orchestrate: `detectProject()` → `startServer()` → `autoExpose()`
2. Accept parameters: `dir` (optional), `port` (optional), `backend` (optional)
3. Return: `{ url, backend, port, framework, local_ip }`
4. Handle the full error chain: project not detected, deps install fails, server doesn't start, tunnel fails
5. If server is already running on the target port, skip starting and go straight to tunnel
6. **Test:** Point it at a real project directory. Verify it detects, starts, and exposes.

### Phase 5: Implement stop_tunnels and get_status

**Goal:** Cleanup and status tools.

**Tasks:**
1. `stop_tunnels` — Kill all active tunnel processes and server processes. Return count of killed processes.
2. `get_status` — Return list of active tunnels (URL, port, backend) and active servers (framework, port, pid)
3. **Test:** Start a tunnel, verify `get_status` shows it, call `stop_tunnels`, verify cleanup.

### Phase 6: Integration Testing & Install Guide

**Goal:** End-to-end verification and documentation.

**Tasks:**
1. Write the Claude Desktop config snippet for `claude_desktop_config.json`
2. Update README.md with MCP server install instructions
3. Test the full flow: configure in Claude Desktop → open Claude Desktop → verify tools appear → call `start_and_expose` on a real project
4. Verify the MCP server handles concurrent calls gracefully
5. Verify cleanup happens on server shutdown
6. Write a brief `mcp-server/README.md` with troubleshooting

### Phase 7: Polish

**Goal:** Production-ready finish.

**Tasks:**
1. Add the `mcp-server` entry to root `package.json` 
2. Ensure `npx devgate` CLI still works independently
3. Verify the Claude Code plugin skills still reference the CLI correctly
4. Run through the Dispatch use case mentally: "text from phone → Cowork uses MCP tool → returns URL" — make sure every response has the info needed
5. Final scan of all files for TODOs, placeholders, or incomplete code

---

## CONTEXT

### How MCP Servers Work with Claude Desktop

Claude Desktop reads `claude_desktop_config.json` to find MCP servers. Each server is a process that communicates via stdio. The config looks like:

```json
{
  "mcpServers": {
    "devgate": {
      "command": "node",
      "args": ["/absolute/path/to/devgate/mcp-server/index.js"]
    }
  }
}
```

Claude Desktop starts the process, sends JSON-RPC messages over stdin, reads responses from stdout. All console.log/debug output MUST go to stderr, not stdout, or it will corrupt the protocol.

### How Dispatch Uses This

User texts from phone → Dispatch sends to Cowork on desktop → Cowork sees the MCP tools → Cowork calls `start_and_expose` → gets URL back → Cowork replies with the URL → user opens it on their phone.

The MCP tool response is what Cowork sees. It needs to contain the URL prominently so Cowork includes it in the reply to the user's phone.

### Tunnel Backends

1. **bore** — `bore local <port> --to bore.pub`. Requires `cargo install bore-cli` or `brew install bore-cli`. Fastest, most reliable. No account. URL format: `http://bore.pub:XXXXX`
2. **localhost.run** — `ssh -R 80:localhost:<port> nokey@localhost.run`. Zero install, uses SSH. No account. URL format: `https://XXXXX.lhr.life`
3. **Local IP** — Just returns `http://<local-ip>:<port>`. Same WiFi only. Always works as fallback.

Auto-selection: bore (if installed) → localhost.run (if SSH available) → local IP.

### Existing Core API (src/index.js exports)

```javascript
const devgate = require("./src/index.js");

// Scanning
const services = await devgate.scanPorts();
// → [{ port: 3000, status: 200, framework: "Next.js", ... }]

// Detection
const project = devgate.detectProject("/path/to/project");
// → { name: "Next.js", language: "node", startCmd: "npm run dev", defaultPort: 3000, icon: "▲", ... }

// Tunneling
const tunnel = await devgate.autoExpose(3000);
// → { backend: "bore", url: "http://bore.pub:12345", port: 3000, process: ChildProcess }

const tunnel = await devgate.autoExpose(3000, "local");
// → { backend: "local", url: "http://192.168.1.50:3000", port: 3000, process: null }

// Server starting
const server = await devgate.startServer({ dir: "/path", port: 3000, log: console.log });
// → { project: {...}, port: 3000, pid: 12345, process: ChildProcess }

// Cleanup
devgate.killAllTunnels();   // → number of killed tunnels
devgate.killAllServers();   // → number of killed servers

// Info
devgate.getLocalIP();       // → "192.168.1.50"
devgate.getActiveTunnels(); // → [{ backend, url, port, process }]
```

---

## START

Begin with Phase 1. Read the existing code in `src/` first to understand the API. Then build the MCP server foundation. Test it. Tell me the results. Then move to Phase 2.
