import { useEffect, useRef, useState } from "react";
import { interactionApi } from "../api/client";
import { useInteractionStore } from "../store/interactions";
import type { InteractionInput } from "./types";

export function interactionKey(projectId: string, inputs: InteractionInput[]) {
  return JSON.stringify([projectId, "interaction-v1", [...inputs].sort((a, b) => a.entry_id.localeCompare(b.entry_id))]);
}

export function useInteractions(projectId: string, inputs: InteractionInput[], paused: boolean) {
  const state = useInteractionStore();
  const setProject = state.setProject;
  const [feedback, setFeedback] = useState<{ key: string; loading: boolean; error: string | null }>({ key: "", loading: false, error: null });
  const generation = useRef(0);
  const [retry, setRetry] = useState(0);
  const key = interactionKey(projectId, inputs);
  const inputRef = useRef(inputs); inputRef.current = inputs;
  const enabled = state.projectId === projectId && state.choices.types.length > 0 && (state.choices.intra || state.choices.inter);
  // Hiding/deleting an entry can reuse a complete immutable superset result.
  // Revealing a new or changed artifact still requires fresh analysis.
  const cachedInputs = new Map(state.cache?.result.inputs.map(input => [input.entry_id, input.artifact_id]));
  const cached = state.projectId === projectId && state.cache && inputs.every(input => cachedInputs.get(input.entry_id) === input.artifact_id) ? state.cache.result : null;
  useEffect(() => { setProject(projectId); }, [projectId, setProject]);
  useEffect(() => {
    const current = ++generation.current;
    if (!enabled || paused || cached || !inputRef.current.length) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setFeedback({ key, loading: true, error: null });
      void interactionApi.analyze(projectId, inputRef.current, controller.signal).then(result => {
        if (generation.current === current && !controller.signal.aborted) useInteractionStore.getState().publish(projectId, key, result);
      }).catch((error: unknown) => {
        if (generation.current === current && !controller.signal.aborted) setFeedback({ key, loading: false, error: error instanceof Error ? error.message : "Interaction analysis unavailable." });
      });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [key, projectId, enabled, paused, cached, retry]);
  return { choices: state.projectId === projectId ? state.choices : { types: [], intra: false, inter: true }, result: cached, loading: enabled && !paused && !cached && feedback.key === key && feedback.loading, error: !cached && feedback.key === key ? feedback.error : null, enabled, retry: () => setRetry(value => value + 1) };
}
