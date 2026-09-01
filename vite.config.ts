import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { payoffApiPlugin } from "./server/devApiPlugin.ts";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const providerCallsDisabled = process.env.PAYOFF_DISABLE_PROVIDER_CALLS === "1";
  return {
    base: process.env.GITHUB_ACTIONS ? "/payoff/" : "/",
    plugins: [
      react(),
      payoffApiPlugin({
        apiKey: providerCallsDisabled ? undefined : env.OPENAI_API_KEY,
        model: env.OPENAI_MODEL,
        geminiApiKey: providerCallsDisabled ? undefined : env.GEMINI_API_KEY,
        geminiImageModel: env.GEMINI_IMAGE_MODEL,
        sceneReviewModel: providerCallsDisabled ? undefined : env.OPENAI_SCENE_REVIEW_MODEL,
      }),
    ],
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
      exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
    },
  };
});
