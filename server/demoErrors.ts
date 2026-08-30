export class DemoFixtureError extends Error {
  fixture: string;

  constructor(fixture: string, detail?: string) {
    super(`Missing demo fixture: ${fixture}${detail ? ` (${detail})` : ""}`);
    this.name = "DemoFixtureError";
    this.fixture = fixture;
  }
}
