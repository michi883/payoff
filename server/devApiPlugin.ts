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
import { handleScene } from "./sceneHandler.ts";
import { createGeminiSceneImageProvider } from "./geminiSceneImageProvider.ts";
import { createDemoAIProvider } from "./demoProvider.ts";

async function readBody(request: IncomingMessage) {
  let value = "";
  for await (const chunk of request) {
    value += chunk.toString();
    if (value.length > 4_250_000) throw new Error("REQUEST_TOO_LARGE");
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

export function payoffApiPlugin(config: {
  apiKey?: string;
  model?: string;
  geminiApiKey?: string;
  geminiImageModel?: string;
  sceneReviewModel?: string;
}): Plugin {
  const provider = createOpenAIProvider(config);
  const demoProvider = createDemoAIProvider();
  const sceneProvider = createGeminiSceneImageProvider({
    apiKey: config.geminiApiKey,
    model: config.geminiImageModel,
    reviewApiKey: config.apiKey,
    reviewModel: config.sceneReviewModel,
  });
  const handlers = {
    "/api/storyboard": handleStoryboard,
    "/api/audience": handleAudience,
    "/api/preview": handlePreview,
    "/api/diagnose": handleDiagnose,
    "/api/revise": handleRevise,
    "/api/scene": (method: string | undefined, body: unknown, textProvider: typeof provider) => {
      void textProvider;
      return handleScene(method, body, sceneProvider);
    },
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
          const demoRequest = request.headers["x-payoff-demo"] === "1";
          if (demoRequest && path === "/api/scene") {
            send(response, {
              status: 500,
              body: { error: { code: "MISSING_DEMO_FIXTURE", message: "Missing demo fixture: scene-client-cache", retryable: false } },
            });
            return;
          }
          const result = await handler(request.method, body, demoRequest ? demoProvider : provider);
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
