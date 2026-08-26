# Payoff: WebMCP Challenge

We are building **Payoff** for The WebMCP Challenge, deadline September 3, 2026.

Payoff is an agent-native story room where a human and AI collaborate to shape the **emotional payoff** of a short story.

The creator starts with:

* a topic/theme
* a short-form story format
* the specific emotional response they want the audience to experience, such as "laugh, then have an oh-shit realization"

Payoff generates a visual storyboard. Through WebMCP, an AI agent can inspect the actual storyboard, audience reactions, and emotional target, then modify the shared story workspace as the creator gives direction.

The central loop is:

**Intent → Story → Audience Reaction → Human + AI Revision**

The key insight is that AI should not simply predict what audiences will like. Audience evidence should reveal whether the creator's intended emotion actually landed. The human retains creative judgment while the agent analyzes evidence, reasons about the story structure, and makes requested changes.

A hero interaction should feel like:

> Creator: "I wanted an oh-shit realization. Why are people just sad?"

The agent examines audience reactions and the storyboard, explains what caused the mismatch, proposes a structural change, and uses WebMCP tools to modify the storyboard visibly.

Priorities:

1. Make human-agent collaboration unmistakable.
2. Make WebMCP essential to the experience, not a wrapper around a normal AI app.
3. Keep WebMCP tools relatively primitive and meaningful, such as reading the storyboard/reactions and creating, replacing, or moving story beats.
4. Make the storyboard visibly update when the agent acts.
5. Treat the emotional payoff as the central object of the product.
6. Use real or pre-collected human reaction data for the demo rather than having the same AI invent audience feedback.
7. Optimize for one exceptionally clear, polished, deterministic 60 to 90 second demo workflow rather than broad feature coverage.
8. Keep scope tight enough to ship a complete public web app and open-source repo before the deadline.

First inspect the repository and relevant WebMCP requirements. Then propose the smallest compelling product architecture and implementation plan. Do not start implementation until the plan is coherent and the hero demo flow is explicit.
