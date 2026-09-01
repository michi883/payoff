import { useSyncExternalStore } from "react";
import { payoffStore, type PayoffStore } from "./store";

export function useWorkspace(store: PayoffStore = payoffStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
