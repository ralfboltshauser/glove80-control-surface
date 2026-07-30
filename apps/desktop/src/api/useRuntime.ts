import { useCallback, useEffect, useRef, useState } from "react";

import type {
  AppBackend,
  AppViewState,
  RuntimeCommand,
} from "../domain/types";
import { createBackend } from "./backend";

interface RuntimeController {
  state?: AppViewState;
  error?: string;
  pending: boolean;
  dispatch: (command: RuntimeCommand) => Promise<AppViewState>;
  clearError: () => void;
}

export function useRuntime(): RuntimeController {
  const backend = useRef<AppBackend | undefined>(undefined);
  const backendInstance = backend.current ?? (backend.current = createBackend());
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [state, setState] = useState<AppViewState>();
  const [error, setError] = useState<string>();
  const [pendingCount, setPendingCount] = useState(0);
  const acceptedRevision = useRef(-1);
  const acceptState = useCallback((nextState: AppViewState) => {
    if (nextState.revision < acceptedRevision.current) return;
    acceptedRevision.current = nextState.revision;
    setState(nextState);
    setError(undefined);
  }, []);

  useEffect(() => {
    let active = true;
    const unsubscribe = backendInstance.subscribe?.((nextState) => {
      if (active) {
        acceptState(nextState);
      }
    });
    setPendingCount((count) => count + 1);
    backendInstance
      .bootstrap()
      .then((nextState) => {
        if (active) {
          acceptState(nextState);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(errorMessage(reason));
        }
      })
      .finally(() => {
        setPendingCount((count) => Math.max(0, count - 1));
      });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [acceptState, backendInstance]);

  const dispatch = useCallback((command: RuntimeCommand) => {
    setPendingCount((count) => count + 1);
    const result = queue.current.then(() =>
      backendInstance.dispatch(command),
    );
    queue.current = result.catch(() => undefined);
    result
      .then((nextState) => {
        acceptState(nextState);
      })
      .catch((reason: unknown) => {
        setError(errorMessage(reason));
      })
      .finally(() => {
        setPendingCount((count) => Math.max(0, count - 1));
      });
    return result;
  }, [acceptState, backendInstance]);

  return {
    state,
    error,
    pending: pendingCount > 0,
    dispatch,
    clearError: () => setError(undefined),
  };
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message;
  }
  return typeof reason === "string"
    ? reason
    : "The command could not be completed.";
}
