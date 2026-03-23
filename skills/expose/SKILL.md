---
name: expose
description: Expose a local dev server to your phone. Auto-detects running servers, creates a tunnel, shows a QR code you can scan. Use when the user wants to access their local project from their phone or share it with someone.
argument-hint: "[port]"
allowed-tools: Bash
---

# /devgate:expose

Expose a running local dev server to the user's phone via a public tunnel.

## Steps

1. If a port argument is provided, use that port. Otherwise, auto-detect.

2. Run the devgate CLI to expose the port:

```bash
# If port specified:
npx devgate <port>

# If no port (auto-detect):
npx devgate
```

3. The tool will:
   - Scan common dev ports to find running servers
   - Auto-detect the framework (Next.js, Vite, React, etc.)
   - Create a tunnel (tries bore first, then localhost.run via SSH, falls back to local IP)
   - Display a URL and QR code the user can scan with their phone

4. If nothing is running, suggest: `npx devgate start` to auto-detect, install deps, start the server, and expose it.

5. Share the URL with the user. If using Dispatch, this URL can be texted back to the user's phone.

## Options

- `--local` or `-l`: Use local network only (same WiFi, fastest)
- `--bore` or `-b`: Force bore tunnel backend
- `--ssh` or `-s`: Force localhost.run SSH backend
- `--start`: Start the server if nothing is running
- `--port <n>` or `-p <n>`: Specify port explicitly

## Examples

```bash
# Auto-detect and expose
npx devgate

# Expose specific port
npx devgate 3000

# Local network only (same WiFi)
npx devgate 3000 --local

# Auto-start project and expose
npx devgate start
```
