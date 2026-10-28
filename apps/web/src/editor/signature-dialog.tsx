import type { Stroke } from "@schreibzeug/editor-core";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import { m } from "../paraglide/messages";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

/** The drawing area in CSS pixels; drawn at the screen's pixel density so the strokes stay sharp. */
const WIDTH = 440;
const HEIGHT = 160;
const INK = "#1e3a8a";

/** Where the last signature is kept in this browser, to sign the next PDF with one click. */
const STORAGE_KEY = "schreibzeug:signature";

const isStrokes = (value: unknown): value is Stroke[] =>
  Array.isArray(value) &&
  value.every(
    (stroke) =>
      Array.isArray(stroke) &&
      stroke.every((point) => typeof point?.x === "number" && typeof point?.y === "number"),
  );

/** The last signature, or null when there is none or the browser keeps nothing. */
export const readStoredSignature = (): Stroke[] | null => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    return isStrokes(value) && value.some((stroke) => stroke.length > 0) ? value : null;
  } catch {
    return null;
  }
};

const storeSignature = (strokes: Stroke[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(strokes));
  } catch {
    // Private windows and blocked storage: the signature is used without being kept.
  }
};

/** Draws strokes into the canvas, scaled from the size they were drawn at. */
const paint = (context: CanvasRenderingContext2D, strokes: Stroke[]) => {
  for (const stroke of strokes) {
    const [first, ...rest] = stroke;
    if (!first) continue;
    context.beginPath();
    context.moveTo(first.x, first.y);
    for (const point of rest) context.lineTo(point.x, point.y);
    context.stroke();
  }
};

export type SignatureDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Puts the strokes as ink on the page in view. */
  onInsert: (strokes: Stroke[]) => void;
};

/**
 * A signature to put on a PDF: drawn with the mouse, a pen or a finger, or the last one used in
 * this browser. It goes on the page as ink, sharp at any size; it is no digital signature.
 */
export const SignatureDialog = ({ open, onClose, onInsert }: SignatureDialogProps) => (
  <Dialog open={open} title={m.signature_dialog_title()} wide onClose={onClose}>
    {open && <SignaturePad onClose={onClose} onInsert={onInsert} />}
  </Dialog>
);

const SignaturePad = ({ onClose, onInsert }: Omit<SignatureDialogProps, "open">) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const drawing = useRef(false);
  const [drawn, setDrawn] = useState(false);
  const [stored] = useState(readStoredSignature);
  const [failure, setFailure] = useState<string | null>(null);

  const context = () => canvas.current?.getContext("2d") ?? null;

  useEffect(() => {
    const element = canvas.current;
    const pen = element?.getContext("2d");
    if (!element || !pen) return;
    const ratio = window.devicePixelRatio || 1;
    element.width = WIDTH * ratio;
    element.height = HEIGHT * ratio;
    pen.scale(ratio, ratio);
    pen.lineWidth = 2.5;
    pen.lineCap = "round";
    pen.lineJoin = "round";
    pen.strokeStyle = INK;
  }, []);

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    strokes.current.push([point(event)]);
  };
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    const stroke = strokes.current.at(-1);
    const pen = context();
    if (!drawing.current || !stroke || !pen) return;
    stroke.push(point(event));
    paint(pen, [stroke.slice(-2)]);
    setDrawn(true);
  };
  const end = () => {
    drawing.current = false;
  };
  const clear = () => {
    const element = canvas.current;
    context()?.clearRect(0, 0, element?.width ?? 0, element?.height ?? 0);
    strokes.current = [];
    setDrawn(false);
  };

  const insert = (signature: Stroke[]) => {
    setFailure(null);
    try {
      onInsert(signature);
      storeSignature(signature);
      onClose();
    } catch (error) {
      setFailure(
        m.signature_dialog_failed({ error: error instanceof Error ? error.message : String(error) }),
      );
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-[var(--muted-foreground)]">{m.signature_dialog_intro()}</p>
      <canvas
        ref={canvas}
        aria-label={m.signature_dialog_pad()}
        data-testid="signature-pad"
        style={{ width: WIDTH, height: HEIGHT, touchAction: "none" }}
        className="max-w-full rounded-md border border-[var(--border)] bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      {failure && (
        <p role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
          {failure}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" disabled={!drawn} onClick={clear}>
          {m.common_delete()}
        </Button>
        {stored && (
          <Button variant="outline" onClick={() => insert(stored)}>
            {m.signature_dialog_last()}
          </Button>
        )}
        <span className="flex-1" />
        <Button variant="ghost" onClick={onClose}>
          {m.common_cancel()}
        </Button>
        <Button variant="primary" disabled={!drawn} onClick={() => insert(strokes.current)}>
          {m.common_insert()}
        </Button>
      </div>
    </div>
  );
};
