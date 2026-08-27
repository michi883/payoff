import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import {
  handleAudience,
  handleDiagnose,
  handlePreview,
  handleRevise,
  handleStoryboard,
  type ApiResult,
} from "./handlers.ts";
import { createOpenAIProvider } from "./openaiProvider.ts";

async function readBody(request: IncomingMessage) {
  let value = "";
  for await (const chunk of request) {
    value += chunk.toString();
    if (value.length > 100_000) throw new Error("REQUEST_TOO_LARGE");
  }
  return value;
}

function send(response: ServerResponse, result: ApiResult) {
  response.statusCode = result.status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  if (result.allow) response.setHeader("Allow", result.allow);
  response.end(JSON.stringify(result.body));
}

export function payoffApiPlugin(config: { apiKey?: string; model?: string }): Plugin {
  const provider = createOpenAIProvider(config);
  const handlers = {
    "/api/storyboard": handleStoryboard,
    "/api/audience": handleAudience,
    "/api/preview": handlePreview,
    "/api/diagnose": handleDiagnose,
    "/api/revise": handleRevise,
  } as const;
  return {
    name: "payoff-server-ai",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = new URL(request.url ?? "/", "http://localhost").pathname;
        const handler = handlers[path as keyof typeof handlers];
        if (!handler) return next();
        try {
          const body = await readBody(request);
          const result = await handler(request.method, body, provider);
          send(response, result);
        } catch (error) {
          const tooLarge = error instanceof Error && error.message === "REQUEST_TOO_LARGE";
          send(response, {
            status: tooLarge ? 413 : 500,
            body: { error: { code: tooLarge ? "REQUEST_TOO_LARGE" : "SERVER_ERROR", message: tooLarge ? "The request is too large." : "Payoff could not process that request.", retryable: !tooLarge } },
          });
        }
      });
    },
  };
}
