"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";

export interface HighlightState {
  /** source_id (e.g. "rec_007") that the user is hovering in the chat pane. */
  sourceId: string | null;
}

interface HighlightContextValue {
  highlight: HighlightState;
  setHighlight: (sourceId: string | null) => void;
}

const HighlightContext = createContext<HighlightContextValue>({
  highlight: { sourceId: null },
  setHighlight: () => {},
});

export function HighlightProvider({ children }: { children: ReactNode }) {
  const [sourceId, setSourceId] = useState<string | null>(null);

  const setHighlight = useCallback((next: string | null) => {
    setSourceId(next);
  }, []);

  return (
    <HighlightContext.Provider value={{ highlight: { sourceId }, setHighlight }}>
      {children}
    </HighlightContext.Provider>
  );
}

export function useHighlight(): HighlightContextValue {
  return useContext(HighlightContext);
}
