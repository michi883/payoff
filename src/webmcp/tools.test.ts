import { describe, expect, it, vi } from "vitest";
import { BASELINE_VERSION_ID, createCanonicalWorkspace } from "../domain/seed";
import { PayoffStore } from "../domain/store";
import { buildPayoffTools, registerPayoffTools, type AgentCapability } from "./tools";

const options = { signal: new AbortController().signal };

describe("Payoff WebMCP tools", () => {
  it("exposes primitive story and preview tools with correct annotations", () => {
    const tools = buildPayoffTools(new PayoffStore({ persist: false }));
    expect(tools.map((tool) => tool.name)).toEqual([
      "get_story_brief",
      "list_story_beats",
      "get_ai_preview",
      "get_audience_reactions",
      "create_story_beat",
      "replace_story_beat",
      "move_story_beat",
      "save_ai_preview",
    ]);
    expect(tools.slice(0, 4).every((tool) => tool.annotations?.readOnlyHint)).toBe(true);
    expect(tools[3].annotations?.untrustedContentHint).toBe(true);
    expect(tools.slice(4).every((tool) => tool.annotations?.readOnlyHint === false)).toBe(true);
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
    const store = new PayoffStore({ persist: false, initialState: createCanonicalWorkspace() });
    const tools = buildPayoffTools(store);
    const replace = tools.find((tool) => tool.name === "replace_story_beat")!;
    const result = await replace.execute({
      beat_id: "beat-5",
      expected_version: BASELINE_VERSION_ID,
      title: "He sees it",
      action: "Dad studies the drawing for the first time.",
      line: "DAD",
      narrative_role: "turn",
      intended_emotion: "recognition",
      art_key: "phone_dad_drawing",
    }, options) as { activeVersionId: string };

    expect(result.activeVersionId).toBe(store.getSnapshot().activeVersionId);
    expect(store.getSnapshot().versions[0].beats[4].title).toBe("The payoff");
    expect(store.getSnapshot().versions.at(-1)?.beats[4].title).toBe("He sees it");
  });

  it("reads the locally created deterministic starter without agent build calls", async () => {
    const store = new PayoffStore({ persist: false });
    store.selectStarter();
    const tools = buildPayoffTools(store);
    const briefTool = tools.find((tool) => tool.name === "get_story_brief")!;
    const beatsTool = tools.find((tool) => tool.name === "list_story_beats")!;
    const brief = await briefTool.execute({}, options) as { active_version: string; workflow_stage: string };
    const board = await beatsTool.execute({}, options) as { beats: Array<Record<string, unknown>> };

    expect(brief.active_version).toBe(BASELINE_VERSION_ID);
    expect(brief.workflow_stage).toBe("storyboard");
    expect(board.beats).toHaveLength(6);
    expect(store.getSnapshot().versions).toHaveLength(1);
  });

  it("saves a version-bound preview without adding human responses", async () => {
    const store = new PayoffStore({ persist: false, initialState: createCanonicalWorkspace() });
    const tools = buildPayoffTools(store);
    const save = tools.find((tool) => tool.name === "save_ai_preview")!;
    const read = tools.find((tool) => tool.name === "get_ai_preview")!;
    await save.execute({
      expected_version: BASELINE_VERSION_ID,
      summary: "Different viewing lenses may disagree on whether the ending repairs the guilt.",
      perspectives: [
        { persona: "impatient_casual", likely_response: "Gets the pattern quickly.", watch_for: "May predict the reveal." },
        { persona: "emotionally_sensitive", likely_response: "Feels the withdrawal sharply.", watch_for: "Warmth may not erase guilt." },
      ],
      disagreements: ["The final beat may feel warm or overly neat."],
    }, options);
    const preview = await read.execute({}, options) as Record<string, unknown>;
    expect(preview.provisional).toBe(true);
    expect(preview.label).toBe("AI-simulated, not human evidence");
    expect(store.getSnapshot().reactionSet.responses).toHaveLength(0);
  });

  it("keeps seeded read outputs within the recommended character budget", async () => {
    const tools = buildPayoffTools(new PayoffStore({ persist: false }));
    for (const name of ["get_story_brief", "list_story_beats", "get_audience_reactions"]) {
      const tool = tools.find((candidate) => candidate.name === name)!;
      const result = await tool.execute({}, options);
      expect(JSON.stringify(result).length, name).toBeLessThanOrEqual(1500);
    }
    const store = new PayoffStore({ persist: false });
    store.selectStarter();
    for (const name of ["get_story_brief", "list_story_beats", "get_audience_reactions"]) {
      const tool = buildPayoffTools(store).find((candidate) => candidate.name === name)!;
      const result = await tool.execute({}, options);
      expect(JSON.stringify(result).length, `starter ${name}`).toBeLessThanOrEqual(1500);
    }
  });

  it("reports WebMCP unavailable when the page cannot publish tools", async () => {
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: undefined,
    });
    const capabilities: AgentCapability[] = [];

    const cleanup = await registerPayoffTools((capability) => capabilities.push(capability));

    expect(capabilities).toEqual(["webmcp-unavailable"]);
    cleanup();
    Reflect.deleteProperty(document, "modelContext");
  });

  it("distinguishes registered tools from a real tool invocation", async () => {
    const registrationSignals: AbortSignal[] = [];
    const registeredTools: WebMCP.ModelContextTool[] = [];
    const registerTool = vi.fn(async (tool: WebMCP.ModelContextTool, registration?: WebMCP.ModelContextRegisterToolOptions) => {
      registeredTools.push(tool);
      if (registration?.signal) registrationSignals.push(registration.signal);
    });
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { registerTool },
    });

    const capabilities: AgentCapability[] = [];
    const cleanup = await registerPayoffTools((capability) => capabilities.push(capability));
    expect(registerTool).toHaveBeenCalledTimes(8);
    expect(capabilities).toEqual(["tools-exposed"]);
    expect(registrationSignals.every((signal) => !signal.aborted)).toBe(true);

    await registeredTools[0].execute({}, options);
    expect(capabilities).toEqual(["tools-exposed", "agent-interacted"]);
    await registeredTools[1].execute({}, options);
    expect(capabilities).toEqual(["tools-exposed", "agent-interacted"]);

    cleanup();
    expect(registrationSignals.every((signal) => signal.aborted)).toBe(true);
    Reflect.deleteProperty(document, "modelContext");
  });
});
