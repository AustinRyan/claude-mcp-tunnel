// ============================================================================
// devgate/src/config.js — Framework definitions, port maps, tunnel backends
// ============================================================================

const COMMON_DEV_PORTS = [
  3000, 3001, 3002, 3003, 3005, 4000, 4200, 4321, 5000, 5001,
  5173, 5174, 5500, 5555, 6006, 8000, 8080, 8081, 8443, 8501,
  8787, 8888, 9000, 9090, 1313, 4321, 2222, 24678
];

// Framework detection rules — ordered by specificity (most specific first)
const FRAMEWORKS = [
  // --- Node.js Frameworks ---
  {
    name: "Next.js",
    language: "node",
    detect: (pkg) => pkg.dependencies?.next || pkg.devDependencies?.next,
    startCmd: (pkg) => pkg.scripts?.dev ? "npm run dev" : "npx next dev",
    defaultPort: 3000,
    portFlag: "--port",
    icon: "▲"
  },
  {
    name: "Nuxt",
    language: "node",
    detect: (pkg) => pkg.dependencies?.nuxt || pkg.devDependencies?.nuxt,
    startCmd: () => "npm run dev",
    defaultPort: 3000,
    portFlag: "--port",
    icon: "💚"
  },
  {
    name: "Remix",
    language: "node",
    detect: (pkg) => pkg.dependencies?.["@remix-run/react"] || pkg.devDependencies?.["@remix-run/dev"],
    startCmd: () => "npm run dev",
    defaultPort: 5173,
    portFlag: "--port",
    icon: "💿"
  },
  {
    name: "SvelteKit",
    language: "node",
    detect: (pkg) => pkg.devDependencies?.["@sveltejs/kit"],
    startCmd: () => "npm run dev",
    defaultPort: 5173,
    portFlag: "--port",
    icon: "🔥"
  },
  {
    name: "Astro",
    language: "node",
    detect: (pkg) => pkg.dependencies?.astro || pkg.devDependencies?.astro,
    startCmd: () => "npm run dev",
    defaultPort: 4321,
    portFlag: "--port",
    icon: "🚀"
  },
  {
    name: "Gatsby",
    language: "node",
    detect: (pkg) => pkg.dependencies?.gatsby || pkg.devDependencies?.gatsby,
    startCmd: (pkg) => pkg.scripts?.develop ? "npm run develop" : "npx gatsby develop",
    defaultPort: 8000,
    portFlag: "-p",
    icon: "💜"
  },
  {
    name: "Vite",
    language: "node",
    detect: (pkg) => pkg.devDependencies?.vite && !pkg.devDependencies?.["@sveltejs/kit"] && !pkg.devDependencies?.["@remix-run/dev"],
    startCmd: (pkg) => pkg.scripts?.dev ? "npm run dev" : "npx vite",
    defaultPort: 5173,
    portFlag: "--port",
    icon: "⚡"
  },
  {
    name: "Create React App",
    language: "node",
    detect: (pkg) => pkg.dependencies?.["react-scripts"],
    startCmd: () => "npm start",
    defaultPort: 3000,
    envPort: "PORT",
    icon: "⚛️"
  },
  {
    name: "Angular",
    language: "node",
    detect: (pkg) => pkg.dependencies?.["@angular/core"] || pkg.devDependencies?.["@angular/cli"],
    startCmd: (pkg) => pkg.scripts?.start ? "npm start" : "npx ng serve",
    defaultPort: 4200,
    portFlag: "--port",
    icon: "🅰️"
  },
  {
    name: "Vue CLI",
    language: "node",
    detect: (pkg) => pkg.devDependencies?.["@vue/cli-service"],
    startCmd: () => "npm run serve",
    defaultPort: 8080,
    portFlag: "--port",
    icon: "🟢"
  },
  {
    name: "Nest.js",
    language: "node",
    detect: (pkg) => pkg.dependencies?.["@nestjs/core"],
    startCmd: (pkg) => pkg.scripts?.["start:dev"] ? "npm run start:dev" : "npm start",
    defaultPort: 3000,
    portFlag: null,
    icon: "🐱"
  },
  {
    name: "Express",
    language: "node",
    detect: (pkg) => pkg.dependencies?.express && !pkg.dependencies?.next && !pkg.dependencies?.["@nestjs/core"],
    startCmd: (pkg) => pkg.scripts?.dev ? "npm run dev" : (pkg.scripts?.start ? "npm start" : "node index.js"),
    defaultPort: 3000,
    portFlag: null,
    icon: "🚂"
  },
  {
    name: "Fastify",
    language: "node",
    detect: (pkg) => pkg.dependencies?.fastify,
    startCmd: (pkg) => pkg.scripts?.dev ? "npm run dev" : "npm start",
    defaultPort: 3000,
    portFlag: null,
    icon: "🏎️"
  },
  {
    name: "Storybook",
    language: "node",
    detect: (pkg) => pkg.devDependencies?.storybook || pkg.scripts?.storybook,
    startCmd: () => "npm run storybook",
    defaultPort: 6006,
    portFlag: "-p",
    icon: "📖"
  },
  {
    name: "Docusaurus",
    language: "node",
    detect: (pkg) => pkg.dependencies?.["@docusaurus/core"],
    startCmd: () => "npm start",
    defaultPort: 3000,
    portFlag: "--port",
    icon: "🦖"
  },
  {
    name: "Eleventy",
    language: "node",
    detect: (pkg) => pkg.devDependencies?.["@11ty/eleventy"],
    startCmd: () => "npx eleventy --serve",
    defaultPort: 8080,
    portFlag: "--port",
    icon: "🎈"
  },
  {
    name: "Node.js (generic)",
    language: "node",
    detect: (pkg) => pkg.scripts?.dev || pkg.scripts?.start,
    startCmd: (pkg) => pkg.scripts?.dev ? "npm run dev" : "npm start",
    defaultPort: 3000,
    portFlag: null,
    icon: "🟩"
  },

  // --- Python Frameworks ---
  {
    name: "Streamlit",
    language: "python",
    detectFile: "requirements.txt",
    detectContent: /streamlit/i,
    startCmd: () => "streamlit run app.py",
    defaultPort: 8501,
    portFlag: "--server.port",
    icon: "🎈"
  },
  {
    name: "FastAPI",
    language: "python",
    detectFile: "requirements.txt",
    detectContent: /fastapi/i,
    startCmd: () => "uvicorn main:app --reload",
    defaultPort: 8000,
    portFlag: "--port",
    icon: "⚡"
  },
  {
    name: "Django",
    language: "python",
    detectFile: "manage.py",
    startCmd: () => "python manage.py runserver",
    defaultPort: 8000,
    portFlag: null,
    icon: "🎸"
  },
  {
    name: "Flask",
    language: "python",
    detectFile: "requirements.txt",
    detectContent: /flask/i,
    startCmd: () => "flask run",
    defaultPort: 5000,
    portFlag: "--port",
    icon: "🧪"
  },

  // --- Rust ---
  {
    name: "Rust (Cargo)",
    language: "rust",
    detectFile: "Cargo.toml",
    startCmd: () => "cargo run",
    defaultPort: 8080,
    portFlag: null,
    icon: "🦀"
  },

  // --- Go ---
  {
    name: "Go",
    language: "go",
    detectFile: "go.mod",
    startCmd: () => "go run .",
    defaultPort: 8080,
    portFlag: null,
    icon: "🐹"
  },

  // --- Ruby ---
  {
    name: "Rails",
    language: "ruby",
    detectFile: "Gemfile",
    detectContent: /rails/i,
    startCmd: () => "rails server",
    defaultPort: 3000,
    portFlag: "-p",
    icon: "💎"
  },

  // --- PHP ---
  {
    name: "Laravel",
    language: "php",
    detectFile: "artisan",
    startCmd: () => "php artisan serve",
    defaultPort: 8000,
    portFlag: "--port",
    icon: "🐘"
  },

  // --- Static Site Generators ---
  {
    name: "Hugo",
    language: "go",
    detectFile: "hugo.toml",
    altDetectFiles: ["hugo.yaml", "config.toml"],
    startCmd: () => "hugo server",
    defaultPort: 1313,
    portFlag: "--port",
    icon: "📝"
  },
  {
    name: "Jekyll",
    language: "ruby",
    detectFile: "_config.yml",
    detectContent: null,
    startCmd: () => "jekyll serve",
    defaultPort: 4000,
    portFlag: "--port",
    icon: "💎"
  },

  // --- Static HTML (fallback) ---
  {
    name: "Static HTML",
    language: "static",
    detectFile: "index.html",
    startCmd: () => "npx serve -l 3000",
    defaultPort: 3000,
    portFlag: "-l",
    icon: "📄"
  }
];

// Tunnel backends — ordered by preference
const TUNNEL_BACKENDS = {
  bore: {
    name: "bore",
    description: "Fast Rust-based tunnel via bore.pub (no account needed)",
    command: "bore",
    checkCmd: "bore --version",
    buildArgs: (port) => ["local", String(port), "--to", "bore.pub"],
    parseUrl: (output) => {
      // bore outputs: "listening at bore.pub:XXXXX"
      const match = output.match(/bore\.pub:(\d+)/);
      return match ? `http://bore.pub:${match[1]}` : null;
    },
    requiresInstall: true,
    installHint: "cargo install bore-cli OR brew install bore-cli"
  },
  ssh: {
    name: "localhost.run",
    description: "SSH-based tunnel (zero install, no account)",
    command: "ssh",
    checkCmd: "ssh -V",
    buildArgs: (port) => [
      "-tt",  // force tty for URL output
      "-o", "StrictHostKeyChecking=no",
      "-o", "ServerAliveInterval=30",
      "-o", "LogLevel=ERROR",
      "-R", `80:localhost:${port}`,
      "nokey@localhost.run"
    ],
    parseUrl: (output) => {
      // localhost.run outputs URLs like https://XXXXX.lhr.life or https://XXXXX.localhost.run
      const match = output.match(/(https?:\/\/[a-zA-Z0-9-]+\.[a-zA-Z0-9.-]+)/);
      return match ? match[1] : null;
    },
    requiresInstall: false,
    installHint: null
  },
  local: {
    name: "Local Network",
    description: "Same-WiFi access via local IP (fastest, most reliable)",
    command: null,
    requiresInstall: false
  }
};

// ANSI color helpers
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgGreen: "\x1b[42m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m"
};

module.exports = { COMMON_DEV_PORTS, FRAMEWORKS, TUNNEL_BACKENDS, c };
