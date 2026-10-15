import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CoachDemo } from "@/components/exercise/CoachDemo";
import { ANIMATED_COACH_EXERCISES, COACH_STILL_POSES, coachDemoKind } from "@/components/exercise/coachPoses";
import { exercises } from "@/lib/data/exercises";

afterEach(() => vi.unstubAllGlobals());

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe("coach demonstration", () => {
  it("only refers to exercises that exist in the library", () => {
    const ids = new Set(exercises.map((ex) => ex.id));
    for (const id of [...ANIMATED_COACH_EXERCISES, ...Object.keys(COACH_STILL_POSES)]) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it("renders nothing for an exercise without a demonstration", () => {
    const { container } = render(<CoachDemo exerciseId="ex_unknown" name="x" locale="en" />);
    expect(container).toBeEmptyDOMElement();
    expect(coachDemoKind("toString")).toBeNull();
  });

  it("plays the animated loop with pause, speed and guide controls", () => {
    render(<CoachDemo exerciseId="ex_glute_bridge" name="پل باسن" locale="fa" />);
    expect(screen.getByRole("img", { name: /مربی ورزشکار در باشگاه.*پل باسن/ })).toBeInTheDocument();
    const pause = screen.getByRole("button", { name: "توقف نمایش" });
    fireEvent.click(pause);
    expect(screen.getByRole("button", { name: "پخش نمایش" })).toBeInTheDocument();

    const slow = screen.getByRole("button", { name: "آهسته" });
    expect(slow).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(slow);
    expect(slow).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "عادی" })).toHaveAttribute("aria-pressed", "false");

    const guide = screen.getByRole("button", { name: "خط راهنما" });
    expect(guide).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(guide);
    expect(guide).toHaveAttribute("aria-pressed", "false");
    // Demo controls never use aria-expanded, which the library uses to find card toggles.
    expect(document.querySelector("[aria-expanded]")).toBeNull();
  });

  it("starts paused when the system asks for reduced motion", () => {
    stubReducedMotion(true);
    render(<CoachDemo exerciseId="ex_glute_bridge" name="Glute Bridge" locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Play demonstration" }));
    expect(screen.getByRole("button", { name: "Pause demonstration" })).toBeInTheDocument();
  });

  it("shows a labelled still for exercises without an animation", () => {
    render(<CoachDemo exerciseId="ex_wall_sit" name="Wall Sit" locale="en" />);
    expect(screen.getByRole("img", { name: /key position of Wall Sit/ })).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
