export type RuntimeConfig = Readonly<{
  demoMode: boolean;
  debugMode: boolean;
  resetDemoWorkspace: boolean;
}>;

function readRuntimeConfig(): RuntimeConfig {
  const browserWindow = (globalThis as typeof globalThis & {
    window?: { location: { href: string } };
  }).window;
  if (!browserWindow) {
    return Object.freeze({ demoMode: false, debugMode: false, resetDemoWorkspace: false });
  }
  const parameters = new URL(browserWindow.location.href).searchParams;
  const demoMode = parameters.get("demo") === "1";
  return Object.freeze({
    demoMode,
    debugMode: parameters.get("debug") === "1",
    resetDemoWorkspace: demoMode && parameters.get("reset") === "1",
  });
}

/** Parsed once when the application starts. Feature code consumes only these narrow flags. */
export const runtimeConfig = readRuntimeConfig();
