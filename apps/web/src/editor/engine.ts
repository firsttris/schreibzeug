import { type Converter, converterPath, createConverter, type WorkerLike } from "@schreibzeug/editor-core";

/**
 * Where the engine is served: a folder named after the prepared engine, which browsers keep for
 * good (engine-plugin.ts, apps/server/src/web.ts cacheControlOf).
 */
export const ENGINE_PATH = import.meta.env.ENGINE_PATH;

/** A converter (x2t in a worker) from the engine the app was built with. */
export const newConverter = (): Converter =>
  createConverter(() => new Worker(converterPath(ENGINE_PATH)) as unknown as WorkerLike);
