import type { ApiResult } from "../server/handlers";

export type ApiRequest = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
};
export type ApiResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

export function sendApiResult(response: ApiResponse, result: ApiResult) {
  response.statusCode = result.status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  if (result.allow) response.setHeader("Allow", result.allow);
  response.end(JSON.stringify(result.body));
}

export function isDemoRequest(request: ApiRequest) {
  const value = request.headers?.["x-payoff-demo"];
  return value === "1" || (Array.isArray(value) && value.includes("1"));
}
