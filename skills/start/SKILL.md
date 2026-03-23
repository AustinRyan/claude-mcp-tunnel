---
name: start
description: Detect the project type, install dependencies if needed, start the dev server, and expose it to the user's phone. The all-in-one command.
argument-hint: "[--port <port>] [--dir <path>]"
allowed-tools: Bash
---

# /devgate:start

Detect the project, start the server, and expose it — all in one command.

## Steps

1. Run the start command:

```bash
npx devgate start
```

2. This will:
   - Detect the project framework from config files (package.json, requirements.txt, etc.)
   - Install dependencies if node_modules is missing
   - Start the dev server with the correct command
   - Wait for the server to be ready
   - Create a tunnel and show the URL + QR code

3. Supports 25+ frameworks: Next.js, Vite, React, Angular, Vue, Svelte, Gatsby, Remix, Nuxt, Astro, Express, FastAPI, Flask, Django, Rails, and more.

## Options

- `--port <n>`: Override the default port
- `--dir <path>`: Specify project directory
- `--local`: Local network only
