import { describe, expect, it } from "vitest";
import { converterPath, createConverter, type WorkerLike } from "../src/converter";

type Sent = { id: number; bytes: Uint8Array; from: string; to: string };

const fakeWorker = () => {
  const sent: Sent[] = [];
  let terminated = 0;
  const worker: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage: (message) => sent.push(message as Sent),
    terminate: () => {
      terminated += 1;
    },
  };
  const reply = (data: { id: number; bytes?: Uint8Array; error?: string }) =>
    worker.onmessage?.({ data } as MessageEvent);
  return { worker, sent, reply, terminated: () => terminated };
};

describe("converterPath", () => {
  it("points to the worker below the engine root", () => {
    expect(converterPath()).toBe("/engine/frame/x2t/worker.js");
    expect(converterPath("/assets/engine/")).toBe("/assets/engine/frame/x2t/worker.js");
  });
});

describe("createConverter", () => {
  it("starts the worker only when the first conversion is asked for", () => {
    let created = 0;
    createConverter(() => {
      created += 1;
      return fakeWorker().worker;
    });
    expect(created).toBe(0);
  });

  it("sends a copy of the bytes with the formats and resolves with the reply", async () => {
    const fake = fakeWorker();
    const converter = createConverter(() => fake.worker);
    const input = new Uint8Array([1, 2, 3]);

    const result = converter.convert(input, "docx", "bin");
    const [message] = fake.sent;
    expect(message).toMatchObject({ from: "docx", to: "bin" });
    expect(message?.bytes).toEqual(input);
    expect(message?.bytes).not.toBe(input);

    fake.reply({ id: message?.id ?? 0, bytes: new Uint8Array([9]) });
    await expect(result).resolves.toEqual(new Uint8Array([9]));
  });

  it("matches replies to their requests", async () => {
    const fake = fakeWorker();
    const converter = createConverter(() => fake.worker);
    const first = converter.convert(new Uint8Array([1]), "docx", "bin");
    const second = converter.convert(new Uint8Array([2]), "bin", "docx");

    fake.reply({ id: fake.sent[1]?.id ?? 0, bytes: new Uint8Array([22]) });
    fake.reply({ id: fake.sent[0]?.id ?? 0, bytes: new Uint8Array([11]) });

    await expect(first).resolves.toEqual(new Uint8Array([11]));
    await expect(second).resolves.toEqual(new Uint8Array([22]));
  });

  it("rejects with the worker's error", async () => {
    const fake = fakeWorker();
    const converter = createConverter(() => fake.worker);
    const result = converter.convert(new Uint8Array([1]), "docx", "bin");
    fake.reply({ id: fake.sent[0]?.id ?? 0, error: "x2t could not convert docx to bin (code 89)" });
    await expect(result).rejects.toThrow("code 89");
  });

  it("fails open requests and stops the worker on terminate", async () => {
    const fake = fakeWorker();
    const converter = createConverter(() => fake.worker);
    const result = converter.convert(new Uint8Array([1]), "docx", "bin");
    converter.terminate();
    await expect(result).rejects.toThrow("closed");
    expect(fake.terminated()).toBe(1);
  });

  it("fails open requests when the worker crashes and starts a new one next time", async () => {
    const fakes = [fakeWorker(), fakeWorker()];
    let index = 0;
    const converter = createConverter(() => (fakes[index++] as ReturnType<typeof fakeWorker>).worker);
    const result = converter.convert(new Uint8Array([1]), "docx", "bin");
    fakes[0]?.worker.onerror?.({ message: "out of memory" } as ErrorEvent);
    await expect(result).rejects.toThrow("out of memory");

    void converter.convert(new Uint8Array([2]), "docx", "bin").catch(() => {});
    expect(fakes[1]?.sent).toHaveLength(1);
  });
});
