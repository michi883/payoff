import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StudyApp } from "./StudyApp";

describe("StudyApp", () => {
  it("hides the creative target and begins with an uninterrupted player", () => {
    vi.useFakeTimers();
    render(<StudyApp />);

    expect(screen.queryByText(/oh-shit realization/i)).not.toBeInTheDocument();
    expect(screen.getByText(/No emotional target is shown/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Begin uninterrupted viewing/i }));
    expect(screen.getAllByText("Perfect response")).toHaveLength(2);
    expect(screen.queryByText(/What emotion did the ending leave you with/i)).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
