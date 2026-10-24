/**
 * Step-by-step progress for prepare.ts. In a terminal the current step's line is redrawn with its
 * elapsed time and an optional detail (download size, speed); elsewhere (CI logs) each step prints
 * one line when it starts and one when it is done.
 */

/** Sets the detail shown after the step's label, such as "120 / 632 MB (19 %)". */
export type Report = (detail: string) => void;

export type Step = {
  label: string;
  run: (report: Report) => Promise<void> | void;
};

const interactive = process.stdout.isTTY === true;
const redrawInterval = 200;

const formatSeconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

const formatMegabytes = (bytes: number): string => `${(bytes / 1e6).toFixed(0)} MB`;

/** "120 / 632 MB (19 %), 48 MB/s"; without a known total only the received size and speed. */
export const describeTransfer = (received: number, total: number, elapsedMs: number): string => {
  const speed = `${formatMegabytes((received / Math.max(elapsedMs, 1)) * 1000)}/s`;
  if (total <= 0) return `${formatMegabytes(received)}, ${speed}`;
  const percent = Math.floor((received / total) * 100);
  return `${formatMegabytes(received)} / ${formatMegabytes(total)} (${percent} %), ${speed}`;
};

const runStep = async (step: Step, prefix: string): Promise<void> => {
  const started = performance.now();
  let detail = "";
  const line = (): string =>
    [prefix, detail, formatSeconds(performance.now() - started)].filter(Boolean).join(" · ");
  const redraw = (): void => {
    process.stdout.write(`\r\x1b[2K${line()}`);
  };

  if (!interactive) console.log(prefix);
  const timer = interactive ? setInterval(redraw, redrawInterval) : undefined;
  try {
    await step.run((next) => {
      detail = next;
    });
  } finally {
    clearInterval(timer);
    if (interactive) redraw();
    process.stdout.write(interactive ? "\n" : `${line()}\n`);
  }
};

export const runSteps = async (steps: Step[]): Promise<void> => {
  for (const [index, step] of steps.entries()) {
    await runStep(step, `[${index + 1}/${steps.length}] ${step.label}`);
  }
};
