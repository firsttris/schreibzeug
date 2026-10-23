/** A minimal external store: what React's useSyncExternalStore and a Solid signal both need. */
export type Store<S> = {
  get: () => S;
  set: (update: (state: S) => S) => void;
  subscribe: (listener: () => void) => () => void;
};

export const createStore = <S>(initial: S): Store<S> => {
  let state = initial;
  const listeners = new Set<() => void>();

  return {
    get: () => state,
    set: (update) => {
      const next = update(state);
      if (next === state) return;
      state = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
