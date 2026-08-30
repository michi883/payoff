import { handleAudience } from "../server/handlers";
import { createOpenAIProvider } from "../server/openaiProvider";
import { createDemoAIProvider } from "../server/demoProvider";
import { isDemoRequest, sendApiResult, type ApiRequest, type ApiResponse } from "./_shared";

export default async function audience(request: ApiRequest, response: ApiResponse) {
  const provider = isDemoRequest(request)
    ? createDemoAIProvider()
    : createOpenAIProvider({ apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL });
  sendApiResult(response, await handleAudience(request.method, request.body, provider));
}
