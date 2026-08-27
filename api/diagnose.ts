import { handleDiagnose } from "../server/handlers";
import { createOpenAIProvider } from "../server/openaiProvider";
import { sendApiResult, type ApiRequest, type ApiResponse } from "./_shared";

export default async function diagnose(request: ApiRequest, response: ApiResponse) {
  const provider = createOpenAIProvider({ apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL });
  sendApiResult(response, await handleDiagnose(request.method, request.body, provider));
}
