import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createPayoffApiHandler } from "./httpApi.ts";

const host = "0.0.0.0";
const port = Number.parseInt(process.env.PORT ?? "8080", 10);
const distRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const indexPath = resolve(distRoot, "index.html");

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be a valid TCP port.");
}

const api = createPayoffApiHandler({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL,
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiImageModel: process.env.GEMINI_IMAGE_MODEL,
  sceneReviewModel: process.env.OPENAI_SCENE_REVIEW_MODEL,
});

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function sendJson(response: ServerResponse, status: number, body: Record<string, unknown>) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(body));
}

async function sendFile(request: IncomingMessage, response: ServerResponse, filePath: string, immutable: boolean) {
  const details = await stat(filePath);
  if (!details.isFile()) return false;
  response.statusCode = 200;
  response.setHeader("Content-Type", contentTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream");
  response.setHeader("Content-Length", details.size);
  response.setHeader("Cache-Control", immutable ? "public, max-age=31536000, immutable" : "no-cache");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (request.method === "HEAD") {
    response.end();
    return true;
  }
  createReadStream(filePath).pipe(response);
  return true;
}

async function serveFrontend(request: IncomingMessage, response: ServerResponse, pathname: string) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.statusCode = 405;
    response.setHeader("Allow", "GET, HEAD");
    response.end("Method Not Allowed");
    return;
  }

  const decoded = decodeURIComponent(pathname);
  const relative = decoded.replace(/^\/+/, "");
  if (relative) {
    const candidate = resolve(distRoot, relative);
    if (candidate !== distRoot && candidate.startsWith(`${distRoot}${sep}`)) {
      try {
        if (await sendFile(request, response, candidate, relative.startsWith("assets/"))) return;
      } catch (error) {
        const missing = error && typeof error === "object" && "code" in error && error.code === "ENOENT";
        if (!missing) throw error;
      }
    }
    if (extname(relative)) {
      response.statusCode = 404;
      response.end("Not Found");
      return;
    }
  }
  await sendFile(request, response, indexPath, false);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/healthz") {
      sendJson(response, 200, { status: "ok" });
      return;
    }
    if (await api(request, response)) return;
    await serveFrontend(request, response, url.pathname);
  } catch (error) {
    console.error("[Payoff server] Unhandled request failure.", error);
    if (!response.headersSent) sendJson(response, 500, { error: { code: "SERVER_ERROR", message: "Payoff could not process that request." } });
    else response.destroy();
  }
});

server.requestTimeout = 610_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 5_000;

server.on("clientError", (_error, socket) => {
  socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
});

const shutdown = (signal: string) => {
  console.info(`[Payoff server] ${signal} received; draining connections.`);
  server.close((error) => {
    if (error) {
      console.error("[Payoff server] Graceful shutdown failed.", error);
      process.exitCode = 1;
    }
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

server.listen(port, host, () => {
  console.info(`[Payoff server] Listening on http://${host}:${port}`);
});
