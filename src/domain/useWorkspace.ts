import { useSyncExternalStore } from "react";
import { payoffStore } from "./store";

export function useWorkspace() {
  return useSyncExternalStore(payoffStore.subscribe, payoffStore.getSnapshot, payoffStore.getSnapshot);
}
