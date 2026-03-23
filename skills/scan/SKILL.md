---
name: scan
description: Scan for running dev servers on common ports and identify what frameworks are running. Use when the user wants to see what's running locally.
allowed-tools: Bash
---

# /devgate:scan

Scan all common development ports and show what's running.

## Steps

1. Run the scan command:

```bash
npx devgate scan
```

2. This will check ports 3000-3003, 4200, 5173-5174, 8000, 8080, 8888, and others.
3. For each open port, it identifies the framework via HTTP response headers.
4. Report findings to the user.
