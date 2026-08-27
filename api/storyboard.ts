import { handleStoryboard } from "../server/handlers";
import { createOpenAIProvider } from "../server/openaiProvider";
import { sendApiResult, type ApiRequest, type ApiResponse } from "./_shared";

export default async function storyboard(request: ApiRequest, response: ApiResponse) {
  const provider = createOpenAIProvider({ apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL });
  sendApiResult(response, await handleStoryboard(request.method, request.body, provider));
}
