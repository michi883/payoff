import { describe, expect, it, vi } from "vitest";
import { BASELINE_VERSION_ID } from "../domain/seed";
import { PayoffStore } from "../domain/store";
import { buildPayoffTools, registerPayoffTools } from "./tools";

const options = { signal: new AbortController().signal };

describe("Payoff WebMCP tools", () => {
  it("exposes the exact six primitive tools with correct annotations", () => {
    const tools = buildPayoffTools(new PayoffStore({ persist: false }));
    expect(tools.map((tool) => tool.name)).toEqual([
      "get_story_brief",
      "list_story_beats",
      "get_audience_reactions",
      "create_story_beat",
      "replace_story_beat",
      "move_story_beat",
    ]);
    expect(tools.slice(0, 3).every((tool) => tool.annotations?.readOnlyHint)).toBe(true);
    expect(tools[2].annotations?.untrustedContentHint).toBe(true);
    expect(tools.slice(3).every((tool) => tool.annotations?.readOnlyHint === false)).toBe(true);
    expect(tools.every((tool) => tool.name.length <= 30)).toBe(true);
    expect(tools.every((tool) => tool.description.length <= 500)).toBe(true);
  });

  it("returns no invented audience evidence before imports", async () => {
    const tools = buildPayoffTools(new PayoffStore({ persist: false }));
    const reactionTool = tools.find((tool) => tool.name === "get_audience_reactions")!;
    const result = await reactionTool.execute({}, options) as Record<string, unknown>;
    expect(result.valid_response_count).toBe(0);
    expect(result.note).toMatch(/No human responses/);
    expect(result.ending_emotions).toEqual({});
  });

  it("uses the same store command path for a visible replacement", async () => {
    const store = new PayoffStore({ persist: false });
    const tools = buildPayoffTools(store);
    const replace = tools.find((tool) => tool.name === "replace_story_beat")!;
    const result = await replace.execute({
      beat_id: "beat-5",
      expected_version: BASELINE_VERSION_ID,
      title: "Warmly, again",
      action: "Mom taps a suggested response without listening.",
      line: "Make it sound more maternal",
      narrative_role: "turn",
      intended_emotion: "recognition",
      art_key: "mother_autoreply",
    }, options) as { activeVersionId: string };

    expect(result.activeVersionId).toBe(store.getSnapshot().activeVersionId);
    expect(store.getSnapshot().versions[0].beats[4].title).toBe("One unheard note");
    expect(store.getSnapshot().versions.at(-1)?.beats[4].title).toBe("Warmly, again");
  });

  it("keeps seeded read outputs within the recommended character budget", async () => {
    const tools = buildPayoffTools(new PayoffStore({ persist: false }));
    for (const name of ["get_story_brief", "list_story_beats", "get_audience_reactions"]) {
      const tool = tools.find((candidate) => candidate.name === name)!;
      const result = await tool.execute({}, options);
      expect(JSON.stringify(result).length, name).toBeLessThanOrEqual(1500);
    }
  });

  it("registers all tools and unregisters them through one abort signal", async () => {
    const registrationSignals: AbortSignal[] = [];
    const registerTool = vi.fn(async (_tool: WebMCP.ModelContextTool, registration?: WebMCP.ModelContextRegisterToolOptions) => {
      if (registration?.signal) registrationSignals.push(registration.signal);
    });
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { registerTool },
    });

    const statuses: string[] = [];
    const cleanup = await registerPayoffTools((status) => statuses.push(status));
    expect(registerTool).toHaveBeenCalledTimes(6);
    expect(statuses).toEqual(["registering", "ready"]);
    expect(registrationSignals.every((signal) => !signal.aborted)).toBe(true);

    cleanup();
    expect(registrationSignals.every((signal) => signal.aborted)).toBe(true);
    Reflect.deleteProperty(document, "modelContext");
  });
});
