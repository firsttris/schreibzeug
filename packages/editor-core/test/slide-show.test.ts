import { describe, expect, it } from "vitest";
import { createSlideShow, hideShowElement, SLIDE_SHOW_ELEMENT } from "../src/slide-show";

const END_MESSAGE = "Ende der Bildschirmpräsentation. Zum Beenden klicken.";

const recording = () => {
  const calls: unknown[][] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, ...args]);
    };
  const element = { hidden: true } as HTMLElement;
  const input = { blur: record("blur") } as unknown as HTMLElement;
  const page = { element: () => element, activeElement: () => input, focus: record("focus") };
  const show = createSlideShow(
    {
      StartDemonstrationFromCurrentSlide: record("fromCurrent"),
      StartDemonstrationFromBeginning: record("fromBeginning"),
      EndDemonstration: record("end"),
      DemonstrationNextSlide: record("next"),
      DemonstrationPrevSlide: record("previous"),
      DemonstrationEndShowMessage: record("endMessage"),
    },
    page,
    END_MESSAGE,
  );
  return { calls, element, page, show };
};

describe("slide show", () => {
  it("shows the element, lets the engine have the keys and starts from the current slide", () => {
    const { calls, element, show } = recording();
    show.start("current");
    expect(element.hidden).toBe(false);
    expect(calls).toEqual([
      ["focus"],
      ["blur"],
      ["endMessage", END_MESSAGE],
      ["fromCurrent", SLIDE_SHOW_ELEMENT],
    ]);
  });

  it("steps through the slides and ends", () => {
    const { calls, element, page, show } = recording();
    show.start("beginning");
    show.next();
    show.previous();
    show.end();
    hideShowElement(page);
    expect(calls.slice(3)).toEqual([["fromBeginning", SLIDE_SHOW_ELEMENT], ["next"], ["previous"], ["end"]]);
    expect(element.hidden).toBe(true);
  });
});
