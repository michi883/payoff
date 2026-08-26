declare namespace WebMCP {
  interface ModelContextExecuteToolOptions {
    signal?: AbortSignal;
  }

  interface ModelContext {
    executeTool(
      tool: RegisteredTool,
      inputJson: string,
      options?: ModelContextExecuteToolOptions,
    ): Promise<string | null>;
  }
}
