# claude-mcp-tunnel

**An MCP server that exposes your local dev servers to your phone through Claude Desktop.**

Text Claude from your phone: *"Start my project and give me a link"* — get back a working URL.

Zero accounts. Zero config. Works with 25+ frameworks.

[![claude-mcp-tunnel MCP server](https://glama.ai/mcp/servers/AustinRyan/claude-mcp-tunnel/badges/card.svg)](https://glama.ai/mcp/servers/AustinRyan/claude-mcp-tunnel)

---

## What Is This?

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that gives Claude Desktop the ability to:

1. **Detect** what framework your project uses (Next.js, Vite, FastAPI, etc.)
2. **Start** the dev server and install dependencies if needed
3. **Tunnel** it so your phone (or anyone) can reach it
4. **Return the URL** so you can open it immediately

It also ships as a standalone CLI (`npx claude-mcp-tunnel`) for use without Claude.

---

## Quick Start — MCP Server (Claude Desktop)

### Option A: Install via npm (easiest)

```bash
npm install -g claude-mcp-tunnel
```

Then add to your Claude Desktop config:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "claude-mcp-tunnel": {
      "command": "claude-mcp-tunnel-server"
    }
  }
}
```

### Option B: Clone from GitHub

```bash
git clone https://github.com/AustinRyan/claude-mcp-tunnel.git
cd claude-mcp-tunnel
npm install
```

Then add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "claude-mcp-tunnel": {
      "command": "node",
      "args": ["/absolute/path/to/claude-mcp-tunnel/mcp-server/index.js"]
    }
  }
}
```

Replace `/absolute/path/to/claude-mcp-tunnel` with where you cloned the repo.

### Install cloudflared (required for public tunnels)

```bash
# macOS
brew install cloudflared

# Linux
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared
```

### Restart Claude Desktop

Close and reopen Claude Desktop. The tools will appear automatically.

### Use it

In Claude Desktop, say:

> "Expose port 3000 and give me a URL"

or

> "Start the project at /path/to/my-app and give me a link I can open on my phone"

---

## MCP Tools

| Tool | Description |
|------|-------------|
| `scan_ports` | Scan common dev ports (3000, 5173, 8080, etc.) for running servers |
| `detect_project` | Detect project framework from a directory |
| `expose_port` | Expose a running port via tunnel, return a public URL |
| `start_and_expose` | Full pipeline: detect framework, install deps, start server, tunnel, return URL |
| `start_full_stack` | Start both backend + frontend for full-stack projects, expose frontend |
| `stop_tunnels` | Kill all active tunnels and servers |
| `get_status` | Show all active tunnels, ports, and URLs |

### Example: Full-Stack Project

For a project with a FastAPI backend and Vite frontend:

> "Start the full stack project at /path/to/my-app — the frontend is in the `frontend/` directory, the backend runs with `uvicorn backend.app:app --reload --port 8000`"

Claude calls `start_full_stack` → starts backend on 8000 → starts frontend on 5173 → tunnels the frontend → returns the URL.

---

## Use with Claude Dispatch

Text from your phone via Dispatch:

> "Start my project and give me a link I can open on my phone"

The flow:
```
Phone → Dispatch → Cowork (your Mac) → MCP tool → URL back to phone
```

Claude calls `start_and_expose`, gets the tunnel URL, and texts it back to you.

---

## Standalone CLI (No Claude Required)

Works as a regular CLI tool for anyone:

```bash
# Use directly (no install needed)
npx claude-mcp-tunnel

# Or install globally
npm install -g claude-mcp-tunnel
```

### CLI Commands

```bash
# Auto-detect running server and expose it
claude-mcp-tunnel

# Expose a specific port
claude-mcp-tunnel 3000

# Detect project, install deps, start server, expose — all in one
claude-mcp-tunnel start

# Scan what's running on common dev ports
claude-mcp-tunnel scan

# Get your local IP
claude-mcp-tunnel ip
```

### CLI Flags

| Flag | Short | Description |
|------|-------|-------------|
| `--port <n>` | `-p` | Specify port |
| `--dir <path>` | `-d` | Project directory |
| `--local` | `-l` | Local network only (same WiFi) |
| `--bore` | `-b` | Force bore tunnel |
| `--ssh` | `-s` | Force localhost.run tunnel |
| `--start` | | Start server if not running |
| `--quiet` | `-q` | Minimal output |
| `--version` | `-v` | Show version |
| `--help` | `-h` | Show help |

---

## Tunnel Backends

Auto-selects the best available backend. No accounts required for any of them.

| Backend | Speed | Install Required | Access |
|---------|-------|------------------|--------|
| **Cloudflare Tunnel** | Fast | `brew install cloudflared` | Public HTTPS (anywhere) |
| **bore** | Fast | `brew install bore-cli` | Public (anywhere) |
| **localtunnel** | Good | None (pure Node.js) | Public (anywhere) |
| **localhost.run** | Good | None (uses SSH) | Public (anywhere) |
| **Local IP** | Instant | None | Same WiFi only |

Fallback order: Cloudflare → bore → localtunnel → localhost.run → local IP.

Cloudflare Tunnel is recommended — it produces HTTPS URLs on a trusted domain (`trycloudflare.com`) that ISPs and security software won't block.

---

## Supported Frameworks (25+)

**Node.js:** Next.js, Vite, Create React App, Angular, Vue CLI, SvelteKit, Gatsby, Remix, Nuxt, Astro, Express, Fastify, NestJS, Storybook, Docusaurus, Eleventy

**Python:** FastAPI, Flask, Django, Streamlit

**Other:** Rust (Cargo), Go, Ruby on Rails, Laravel (PHP), Hugo, Jekyll, Static HTML

Automatically detects the framework, determines the correct start command, and handles package manager differences (npm, yarn, pnpm, bun).

---

## How It Works

```
Your Phone                    Your Computer
    │                              │
    │  "start my project"          │
    │  (via Dispatch/Claude)       │
    │─────────────────────────────>│
    │                              │  MCP server:
    │                              │  1. Detects framework (Vite)
    │                              │  2. Installs deps (npm install)
    │                              │  3. Starts server (npm run dev)
    │                              │  4. Creates Cloudflare tunnel
    │                              │
    │  https://xyz.trycloudflare.com
    │<─────────────────────────────│
    │                              │
    │  Open URL on phone           │
    │  App loads through tunnel    │
    │                              │
```

---

## Programmatic API

```javascript
const tunnel = require("claude-mcp-tunnel");

// Scan for running servers
const services = await tunnel.scanPorts();

// Detect project type
const project = tunnel.detectProject("/path/to/project");

// Start a server
const server = await tunnel.startServer({ dir: "/path/to/project" });

// Create a tunnel
const result = await tunnel.autoExpose(3000);
console.log(result.url); // https://abc123.lhr.life

// Cleanup
tunnel.killAllTunnels();
tunnel.killAllServers();
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Tools don't appear in Claude Desktop | Restart Claude Desktop. If using npm, verify `claude-mcp-tunnel-server` is in your PATH (`which claude-mcp-tunnel-server`). |
| "Cannot find module" errors | Run `npm install -g claude-mcp-tunnel` to reinstall, or `npm install` if using the cloned repo. |
| Tunnel URL blocked by ISP | Install cloudflared (`brew install cloudflared`). Cloudflare Tunnel uses `trycloudflare.com` which ISPs trust. |
| Vite "host not allowed" error | Add `server: { allowedHosts: true }` to your `vite.config.js`. |
| Tunnel fails, only local IP works | Install cloudflared. Without it, falls back to bore → localtunnel → SSH → local IP. |
| Server starts but wrong port | Check your project's config (e.g. `vite.config.js`) for hardcoded ports. Pass the correct port via `frontend_port`. |
| MCP server crashes silently | Check Claude Desktop's MCP logs. Server logs go to stderr. |

---

## Project Structure

```
claude-mcp-tunnel/
├── mcp-server/
│   └── index.js          # MCP server (7 tools, stdio transport)
├── src/
│   ├── index.js           # Public API exports
│   ├── config.js           # Framework definitions (25+)
│   ├── scanner.js          # Port scanning & service detection
│   ├── detector.js         # Project framework detection
│   ├── starter.js          # Dev server startup & deps
│   ├── tunnel.js           # Tunnel manager (bore/SSH/local)
│   └── display.js          # Terminal formatting & QR codes
├── bin/
│   └── devgate.js          # CLI entry point
├── skills/                 # Claude Code plugin skills
└── package.json
```

---

## License

MIT