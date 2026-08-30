import { isDemoRequest, sendApiResult, type ApiRequest, type ApiResponse } from "./_shared";
import { handleScene } from "../server/sceneHandler";
import { createGeminiSceneImageProvider } from "../server/geminiSceneImageProvider";

export default async function scene(request: ApiRequest, response: ApiResponse) {
  if (isDemoRequest(request)) {
    sendApiResult(response, {
      status: 500,
      body: { error: { code: "MISSING_DEMO_FIXTURE", message: "Missing demo fixture: scene-client-cache", retryable: false } },
    });
    return;
  }
  const provider = createGeminiSceneImageProvider({
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_IMAGE_MODEL,
    reviewApiKey: process.env.OPENAI_API_KEY,
    reviewModel: process.env.OPENAI_SCENE_REVIEW_MODEL,
  });
  sendApiResult(response, await handleScene(request.method, request.body, provider));
}
