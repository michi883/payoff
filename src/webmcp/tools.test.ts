import { describe, expect, it, vi } from "vitest";
import { BASELINE_VERSION_ID, createCanonicalWorkspace } from "../domain/seed";
import { PayoffStore } from "../domain/store";
import { buildPayoffTools, registerPayoffTools, type AgentCapability } from "./tools";

const options = { signal: new AbortController().signal };

function visualInput(focalAction: string) {
  return {
    setting: "The same family kitchen beside the refrigerator.",
    characters: [
      {
        id: "dad",
        appearance: "Early 40s, short dark hair, charcoal sweater, dark trousers, gentle face that looks tired when distracted.",
        position: "Standing beside the refrigerator.",
        action: "Studies the drawing with his phone lowered.",
      },
    ],
    focal_action: focalAction,
    focal_object: "The daughter's newest drawing.",
    composition: "Keep Dad's gaze, lowered phone, and drawing on one clear sightline.",
    emotional_cue: "Specific recognition.",
    visible_text: "DAD",
    continuity_notes: ["Keep Dad, his clothes, the phone, and the kitchen consistent."],
  };
}

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
    expect(tools.find((tool) => tool.name === "list_story_beats")?.inputSchema).toEqual({
      type: "object",
      properties: {},
      additionalProperties: false,
    });
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
      visual: visualInput("Dad studies the drawing for the first time and understands what it depicts."),
    }, options) as { activeVersionId: string };

    expect(result.activeVersionId).toBe(store.getSnapshot().activeVersionId);
    expect(store.getSnapshot().versions[0].beats[4].title).toBe("A drawing of Dad");
    expect(store.getSnapshot().versions.at(-1)?.beats[4].title).toBe("He sees it");
    expect(store.getSnapshot().versions.at(-1)?.beats[4].visual.contentHash).not.toBe(
      store.getSnapshot().versions[0].beats[4].visual.contentHash,
    );
  });

  it("returns actionable replacement failures instead of opaque callback errors", async () => {
    const store = new PayoffStore({ persist: false, initialState: createCanonicalWorkspace() });
    const replace = buildPayoffTools(store).find((tool) => tool.name === "replace_story_beat")!;
    const replacement = {
      beat_id: "beat-5",
      expected_version: BASELINE_VERSION_ID,
      title: "He sees it",
      action: "Dad studies the drawing for the first time.",
      line: "DAD",
      narrative_role: "turn",
      intended_emotion: "recognition",
      visual: visualInput("Dad studies the drawing for the first time and understands what it depicts."),
    };

    const unknown = await replace.execute({ ...replacement, beat_id: "example_string" }, options) as {
      isError: boolean;
      content: Array<{ text: string }>;
      error: { code: string };
    };
    expect(unknown.isError).toBe(true);
    expect(unknown.error.code).toBe("unknown_beat_id");
    expect(unknown.content[0].text).toMatch(/^Unknown beat_id:/);

    const invalid = await replace.execute({
      beat_id: "beat-5",
      expected_version: BASELINE_VERSION_ID,
      title: "He sees it",
      action: "Dad studies the drawing for the first time.",
      line: "DAD",
      narrative_role: "turn",
      intended_emotion: "recognition",
    }, options) as {
      isError: boolean;
      content: Array<{ text: string }>;
      error: { code: string };
    };
    expect(invalid.isError).toBe(true);
    expect(invalid.error.code).toBe("invalid_replacement_payload");
    expect(invalid.content[0].text).toMatch(/^Invalid replacement payload:/);

    const changed = await replace.execute(replacement, options) as { activeVersionId: string };
    expect(changed.activeVersionId).not.toBe(BASELINE_VERSION_ID);

    const stale = await replace.execute(replacement, options) as {
      isError: boolean;
      content: Array<{ text: string }>;
      error: { code: string };
    };
    expect(stale.isError).toBe(true);
    expect(stale.error.code).toBe("stale_expected_version");
    expect(stale.content[0].text).toMatch(/^Stale expected_version:/);
    expect(store.getSnapshot().versions).toHaveLength(2);
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
      const budget = name === "list_story_beats" ? 12_000 : 1_500;
      expect(JSON.stringify(result).length, `starter ${name}`).toBeLessThanOrEqual(budget);
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

  it("registers writes against the same explicit store that notifies workspace subscribers", async () => {
    const registeredTools: WebMCP.ModelContextTool[] = [];
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool: async (tool: WebMCP.ModelContextTool) => {
          registeredTools.push(tool);
        },
      },
    });
    const store = new PayoffStore({ persist: false, initialState: createCanonicalWorkspace() });
    const subscriber = vi.fn();
    const unsubscribe = store.subscribe(subscriber);
    const cleanup = await registerPayoffTools(undefined, store);
    const replace = registeredTools.find((tool) => tool.name === "replace_story_beat")!;

    const result = await replace.execute({
      beat_id: "beat-5",
      expected_version: BASELINE_VERSION_ID,
      title: "He sees it",
      action: "Dad studies the drawing for the first time.",
      line: "DAD",
      narrative_role: "turn",
      intended_emotion: "recognition",
      visual: visualInput("Dad studies the drawing for the first time and understands what it depicts."),
    }, options) as { activeVersionId: string };

    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(result.activeVersionId).toBe(store.getSnapshot().activeVersionId);
    expect(store.getSnapshot().versions.at(-1)?.beats[4].title).toBe("He sees it");

    cleanup();
    unsubscribe();
    Reflect.deleteProperty(document, "modelContext");
  });
});
