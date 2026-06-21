// @ts-check
import { spawn, execFile } from "node:child_process";
import { createServer }    from "node:http";
import { existsSync }      from "node:fs";
import { join, dirname }   from "node:path";
import { fileURLToPath }   from "node:url";

const ROOT         = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_PORT  = Number(process.env.PORT ?? 8080);
const CONTROL_PORT = 8090;

/** @type {import("node:child_process").ChildProcess | null} */
let serverProcess = null;
let restarting    = false;

// ── Server lifecycle ──────────────────────────────────────────────────────────

function buildProject() {
  return new Promise((resolve, reject) => {
    console.log("[launcher] TypeScript não compilado — executando npm run build...");
    const p = spawn("npm", ["run", "build"], {
      cwd:   ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    p.on("exit",  (code) => (code === 0 ? resolve(undefined) : reject(new Error(`tsc saiu com código ${code}`))));
    p.on("error", reject);
  });
}

function spawnServer() {
  const entry = join(ROOT, "dist", "server", "index.js");
  serverProcess = spawn(process.execPath, [entry], {
    cwd:   ROOT,
    stdio: "inherit",
    env:   { ...process.env, PORT: String(SERVER_PORT) },
  });

  serverProcess.on("exit", (code, signal) => {
    console.log("[launcher] servidor encerrado (code=" + (code ?? "null") + ", signal=" + (signal ?? "null") + ")");
    serverProcess = null;
    if (!restarting) {
      console.log("[launcher] reiniciando em 2s...");
      setTimeout(spawnServer, 2000);
    }
  });

  serverProcess.on("error", (err) => {
    console.error("[launcher] falha ao iniciar servidor: " + err.message);
    serverProcess = null;
  });
}

async function startServer() {
  const entry = join(ROOT, "dist", "server", "index.js");
  if (!existsSync(entry)) await buildProject();
  spawnServer();
}

// ── Health check ──────────────────────────────────────────────────────────────

async function checkOnline() {
  try {
    await fetch("http://localhost:" + SERVER_PORT, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

function shutdown() {
  serverProcess?.kill();
  process.exit(0);
}
process.on("SIGINT",  shutdown);
process.on("SIGTERM", shutdown);

// ── Control panel HTML ────────────────────────────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Broadcast Info Display — Launcher</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      background: #080a0f;
      color: #d0d4e0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .panel {
      width: 380px;
      background: #10131e;
      border: 1px solid #1c2035;
    }

    .panel-header {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 16px 18px;
      border-bottom: 1px solid #1c2035;
    }

    .logo {
      width: 38px;
      height: 38px;
      background: #1e40af;
      display: grid;
      place-items: center;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 1px;
      color: #fff;
      flex-shrink: 0;
    }

    .header-text .title {
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.4px;
      color: #e2e5f0;
    }

    .header-text .sub {
      font-size: 11px;
      color: #3d4460;
      margin-top: 3px;
    }

    .panel-body {
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: #3d4460;
    }

    .status-badge {
      display: flex;
      align-items: center;
      gap: 7px;
    }

    .led {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #3d4460;
      transition: background 0.3s, box-shadow 0.3s;
      flex-shrink: 0;
    }
    .led.online  { background: #16a34a; box-shadow: 0 0 7px 1px rgba(22,163,74,0.5); }
    .led.offline { background: #dc2626; box-shadow: 0 0 7px 1px rgba(220,38,38,0.4); }

    .status-label {
      font-size: 12px;
      font-weight: 600;
      color: #5a6275;
    }
    .status-label.online  { color: #16a34a; }
    .status-label.offline { color: #dc2626; }

    .url-block {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .url-row {
      display: flex;
      border: 1px solid #1c2035;
    }

    .url-display {
      flex: 1;
      padding: 8px 11px;
      font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
      font-size: 12px;
      color: #7dd3fc;
      background: #0c0e18;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .btn-copy {
      padding: 0 13px;
      background: #1c2035;
      color: #5a6275;
      border: none;
      border-left: 1px solid #1c2035;
      cursor: pointer;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1px;
      transition: background 0.15s, color 0.15s;
    }
    .btn-copy:hover  { background: #252a40; color: #d0d4e0; }
    .btn-copy.copied { color: #16a34a; }

    .divider { border: none; border-top: 1px solid #1c2035; }

    .btn-open {
      display: block;
      width: 100%;
      padding: 10px;
      background: #1e40af;
      color: #fff;
      border: none;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.4px;
      transition: background 0.15s;
      text-align: center;
    }
    .btn-open:hover { background: #1d3a9f; }

    .btn-restart {
      width: 100%;
      padding: 9px;
      background: transparent;
      color: #3d4460;
      border: 1px solid #1c2035;
      cursor: pointer;
      font-size: 12px;
      letter-spacing: 0.3px;
      transition: border-color 0.15s, color 0.15s;
    }
    .btn-restart:hover    { border-color: #2d3450; color: #7880a0; }
    .btn-restart:disabled { color: #2a2f45; cursor: not-allowed; }

    .error {
      display: none;
      padding: 8px 11px;
      background: rgba(220,38,38,0.08);
      border: 1px solid rgba(220,38,38,0.25);
      color: #fca5a5;
      font-size: 12px;
    }
    .error.visible { display: block; }

    .panel-footer {
      padding: 10px 18px;
      border-top: 1px solid #1c2035;
      font-size: 10px;
      color: #252a40;
      letter-spacing: 0.5px;
    }
  </style>
</head>
<body>
  <div class="panel">
    <div class="panel-header">
      <div class="logo">BI</div>
      <div class="header-text">
        <div class="title">Broadcast Info Display</div>
        <div class="sub">Raspberry Pi HDMI source · controle local</div>
      </div>
    </div>

    <div class="panel-body">

      <div class="row">
        <span class="label">Servidor</span>
        <div class="status-badge">
          <span class="led"          id="led"></span>
          <span class="status-label" id="status-label">verificando...</span>
        </div>
      </div>

      <div class="url-block">
        <span class="label">Endereço</span>
        <div class="url-row">
          <span class="url-display" id="url-display">http://localhost:8080</span>
          <button class="btn-copy"  id="btn-copy">COPIAR</button>
        </div>
      </div>

      <hr class="divider" />

      <button class="btn-open"    id="btn-open">Abrir no navegador</button>
      <button class="btn-restart" id="btn-restart">Reiniciar servidor</button>

      <div class="error" id="error"></div>

    </div>

    <div class="panel-footer">painel de controle · porta ${CONTROL_PORT} · atualiza a cada 3s</div>
  </div>

  <script>
    const led         = document.getElementById('led');
    const statusLabel = document.getElementById('status-label');
    const urlDisplay  = document.getElementById('url-display');
    const btnCopy     = document.getElementById('btn-copy');
    const btnOpen     = document.getElementById('btn-open');
    const btnRestart  = document.getElementById('btn-restart');
    const errorEl     = document.getElementById('error');

    function showError(msg) {
      errorEl.textContent = msg;
      errorEl.classList.add('visible');
    }
    function clearError() {
      errorEl.classList.remove('visible');
    }

    function applyStatus(online, port) {
      const cls = online ? 'online' : 'offline';
      led.className           = 'led ' + cls;
      statusLabel.className   = 'status-label ' + cls;
      statusLabel.textContent = online ? 'Online' : 'Offline';
      const addr = 'http://localhost:' + port;
      urlDisplay.textContent = addr;
      btnOpen.dataset.url    = addr;
    }

    async function pollStatus() {
      try {
        const res  = await fetch('/api/status', { signal: AbortSignal.timeout(3000) });
        const data = await res.json();
        applyStatus(data.online, data.port);
      } catch {
        applyStatus(false, 8080);
      }
      setTimeout(pollStatus, 3000);
    }

    btnCopy.addEventListener('click', async () => {
      const url = urlDisplay.textContent;
      try {
        await navigator.clipboard.writeText(url);
        btnCopy.textContent = 'COPIADO';
        btnCopy.classList.add('copied');
        setTimeout(() => {
          btnCopy.textContent = 'COPIAR';
          btnCopy.classList.remove('copied');
        }, 2000);
      } catch {
        showError('Permissão de clipboard negada. Copie manualmente: ' + url);
      }
    });

    btnOpen.addEventListener('click', () => {
      const url = btnOpen.dataset.url || 'http://localhost:8080';
      window.open(url, '_blank');
    });

    btnRestart.addEventListener('click', async () => {
      clearError();
      btnRestart.disabled    = true;
      btnRestart.textContent = 'Reiniciando...';
      try {
        const res = await fetch('/api/restart', {
          method: 'POST',
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        applyStatus(false, 8080);
      } catch (err) {
        showError('Erro ao reiniciar: ' + err.message);
      } finally {
        btnRestart.disabled    = false;
        btnRestart.textContent = 'Reiniciar servidor';
      }
    });

    pollStatus();
  </script>
</body>
</html>`;

// ── Control panel HTTP server ──────────────────────────────────────────────────

const control = createServer(async (req, res) => {
  const url    = req.url?.split("?")[0] ?? "/";
  const method = req.method ?? "GET";

  if (url === "/" && method === "GET") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(HTML);
    return;
  }

  if (url === "/api/status" && method === "GET") {
    const online = await checkOnline();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ online, port: SERVER_PORT }));
    return;
  }

  if (url === "/api/restart" && method === "POST") {
    restarting = true;

    const respawn = () => {
      restarting = false;
      spawnServer();
    };

    if (serverProcess) {
      serverProcess.once("exit", respawn);
      serverProcess.kill();
    } else {
      respawn();
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

// ── Boot ──────────────────────────────────────────────────────────────────────

await startServer();

control.listen(CONTROL_PORT, "127.0.0.1", () => {
  const controlUrl = "http://localhost:" + CONTROL_PORT;
  console.log("[launcher] painel de controle: " + controlUrl);
  console.log("[launcher] servidor broadcast: http://localhost:" + SERVER_PORT);

  if (process.platform === "win32") {
    execFile("cmd", ["/c", "start", "", controlUrl], (err) => {
      if (err) console.warn("[launcher] falha ao abrir browser: " + err.message);
    });
  }
});
