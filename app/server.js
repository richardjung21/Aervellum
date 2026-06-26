const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  getArchiveCount,
  getArchivePage,
  getConfig,
  getNote,
  listNotes,
  saveNote,
  transcribe,
} = require("./local-service");

const host = process.env.AERVELLUM_HOST || process.env.VELLUM_HOST || "127.0.0.1";
const port = Number.parseInt(process.env.AERVELLUM_PORT || process.env.VELLUM_PORT || "3210", 10);
const appDir = __dirname;
const assets = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/renderer.js", ["renderer.js", "text/javascript; charset=utf-8"]],
]);

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

async function readBody(request, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/api/config") {
    sendJson(response, 200, await getConfig());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    const config = await getConfig();
    sendJson(response, config.binaryReady && config.modelReady ? 200 : 503, {
      ok: config.binaryReady && config.modelReady,
      service: "aervellum",
      ...config,
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/notes") {
    sendJson(response, 200, { notes: await listNotes() });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/archive") {
    sendJson(response, 200, await getArchiveCount());
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/archive/")) {
    sendJson(response, 200, await getArchivePage(url.pathname.slice("/api/archive/".length)));
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/notes/")) {
    const id = decodeURIComponent(url.pathname.slice("/api/notes/".length));
    sendJson(response, 200, await getNote(id));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/transcribe") {
    const wavBytes = await readBody(request, 500 * 1024 * 1024);
    const result = await transcribe({
      wavBytes,
      language: url.searchParams.get("language") || "auto",
    });
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/notes") {
    const body = await readBody(request, 1024 * 1024);
    let payload;
    try {
      payload = JSON.parse(body.toString("utf8"));
    } catch {
      const error = new Error("The note request is not valid JSON.");
      error.statusCode = 400;
      throw error;
    }
    sendJson(response, 200, await saveNote(payload));
    return;
  }

  if (request.method === "GET" && assets.has(url.pathname)) {
    const [filename, contentType] = assets.get(url.pathname);
    const content = await fs.readFile(path.join(appDir, filename));
    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'",
      "Permissions-Policy": "microphone=(self)",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
    response.end(content);
    return;
  }

  sendJson(response, 404, { error: "Not found." });
}

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error(error);
    if (!response.headersSent) {
      sendJson(response, error.statusCode || 500, {
        error: error.message || "The local server encountered an error.",
      });
    } else {
      response.destroy();
    }
  });
});

server.listen(port, host, () => {
  console.log(`Aervellum private host listening on http://${host}:${port}`);
});
