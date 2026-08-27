import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { payoffApiPlugin } from "./server/devApiPlugin.ts";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    base: process.env.GITHUB_ACTIONS ? "/payoff/" : "/",
    plugins: [
      react(),
      payoffApiPlugin({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL }),
    ],
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
      exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
    },
  };
});
