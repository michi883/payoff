import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StudyApp } from "./StudyApp";
import { CANONICAL_STUDY } from "../domain/seed";
import { decodeStudyStimulus, encodeStudyStimulus } from "./share";

describe("StudyApp", () => {
  it("hides the creative target and begins with an uninterrupted player", () => {
    vi.useFakeTimers();
    render(<StudyApp />);

    expect(screen.queryByText(/oh-shit realization/i)).not.toBeInTheDocument();
    expect(screen.getByText(/No emotional target is shown/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Begin uninterrupted viewing/i }));
    expect(screen.getAllByText("Dad, look")).toHaveLength(2);
    expect(screen.queryByText(/What emotion did the ending leave you with/i)).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("round-trips a shareable target-free study stimulus", () => {
    const encoded = encodeStudyStimulus(CANONICAL_STUDY);
    const decoded = decodeStudyStimulus(encoded);
    expect(decoded?.storyVersionId).toBe("looks-great-v1");
    expect(decoded?.beats).toHaveLength(6);
    expect("intendedEmotion" in (decoded?.beats[0] ?? {})).toBe(false);
  });
});
