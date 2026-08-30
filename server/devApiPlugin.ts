import type { Plugin } from "vite";
import { createPayoffApiHandler, type PayoffServerConfig } from "./httpApi.ts";

export function payoffApiPlugin(config: PayoffServerConfig): Plugin {
  const handleApi = createPayoffApiHandler(config);
  return {
    name: "payoff-server-ai",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!(await handleApi(request, response))) next();
      });
    },
  };
}
