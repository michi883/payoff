import type { IncomingMessage, ServerResponse } from "node:http";
import {
  handleAudience,
  handleDiagnose,
  handlePreview,
  handleRevise,
  handleStoryboard,
  type ApiResult,
} from "./handlers.ts";
import { createDemoAIProvider } from "./demoProvider.ts";
import { createGeminiSceneImageProvider } from "./geminiSceneImageProvider.ts";
import { createOpenAIProvider } from "./openaiProvider.ts";
import { handleScene } from "./sceneHandler.ts";

const MAX_REQUEST_BYTES = 4_250_000;

export type PayoffServerConfig = {
  apiKey?: string;
  model?: string;
  geminiApiKey?: string;
  geminiImageModel?: string;
  sceneReviewModel?: string;
};

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > MAX_REQUEST_BYTES) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function send(response: ServerResponse, result: ApiResult) {
  response.statusCode = result.status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (result.allow) response.setHeader("Allow", result.allow);
  response.end(JSON.stringify(result.body));
}

function missingDemoScene(): ApiResult {
  return {
    status: 500,
    body: {
      error: {
        code: "MISSING_DEMO_FIXTURE",
        message: "Missing demo fixture: scene-client-cache",
        retryable: false,
      },
    },
  };
}

/**
 * Creates the same Node request adapter for Vite development and Cloud Run.
 * Providers and their bounded in-memory caches live for the lifetime of one
 * process; all durable creator state remains in the browser's versioned store.
 */
export function createPayoffApiHandler(config: PayoffServerConfig) {
  const provider = createOpenAIProvider({ apiKey: config.apiKey, model: config.model });
  const demoProvider = createDemoAIProvider();
  const sceneProvider = createGeminiSceneImageProvider({
    apiKey: config.geminiApiKey,
    model: config.geminiImageModel,
    reviewApiKey: config.apiKey,
    reviewModel: config.sceneReviewModel,
  });

  return async function handlePayoffApi(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (!path.startsWith("/api/")) return false;

    const demoRequest = request.headers["x-payoff-demo"] === "1";
    try {
      const body = await readBody(request);
      const textProvider = demoRequest ? demoProvider : provider;
      let result: ApiResult;
      switch (path) {
        case "/api/storyboard":
          result = await handleStoryboard(request.method, body, textProvider);
          break;
        case "/api/audience":
          result = await handleAudience(request.method, body, textProvider);
          break;
        case "/api/preview":
          result = await handlePreview(request.method, body, textProvider);
          break;
        case "/api/diagnose":
          result = await handleDiagnose(request.method, body, textProvider);
          break;
        case "/api/revise":
          result = await handleRevise(request.method, body, textProvider);
          break;
        case "/api/scene":
          result = demoRequest
            ? missingDemoScene()
            : await handleScene(request.method, body, sceneProvider);
          break;
        default:
          result = {
            status: 404,
            body: { error: { code: "NOT_FOUND", message: "Unknown Payoff API route.", retryable: false } },
          };
      }
      send(response, result);
    } catch (error) {
      const tooLarge = error instanceof Error && error.message === "REQUEST_TOO_LARGE";
      console.error("[Payoff server]", tooLarge ? "Request body exceeded the configured limit." : error);
      send(response, {
        status: tooLarge ? 413 : 500,
        body: {
          error: {
            code: tooLarge ? "REQUEST_TOO_LARGE" : "SERVER_ERROR",
            message: tooLarge ? "The request is too large." : "Payoff could not process that request.",
            retryable: !tooLarge,
          },
        },
      });
    }
    return true;
  };
}
