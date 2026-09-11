import { useEffect, useRef, useState } from "react";
import type { ExpandSelection } from "../selection/expansion";

export function SelectionExpansion({ expand, contextKey, disabled, onMessage }: {
  expand: ExpandSelection;
  contextKey: string;
  disabled: boolean;
  onMessage?: (text: string | null, failed: boolean) => void;
}) {
  const [distance, setDistance] = useState("4");
  const [granularity, setGranularity] = useState<"atom" | "residue">("atom");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const report = (text: string | null, failed: boolean) => {
    setMessage(text); setFailed(failed); onMessage?.(text, failed);
  };
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), [contextKey]);
  const cancel = () => {
    pending.current?.abort();
    pending.current = null;
    setRunning(false);
    report("Distance expansion cancelled.", false);
  };
  const run = async () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.closest<HTMLElement>(".selection-palette")?.focus();
    const controller = new AbortController();
    pending.current?.abort();
    pending.current = controller;
    setRunning(true);
    report(null, false);
    try {
      const count = await expand(Number(distance), granularity, controller.signal);
      if (pending.current === controller && !controller.signal.aborted) {
        report(`Selection expanded to ${count} atoms.`, false);
      }
    } catch (error) {
      if (pending.current === controller) {
        const cancelled = controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError");
        report(cancelled ? "Distance expansion cancelled." :
          error instanceof Error ? error.message : "Distance expansion failed.", !cancelled);
      }
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setRunning(false);
      }
    }
  };
  return (
    <fieldset className="selection-style-group">
      <legend>Expand selection by distance</legend>
      <p className="selection-style-help">
        Search all project entries, including hidden entries, in their current shared
        coordinate frame. Keep selected atoms; complete residues may extend beyond the cutoff.
      </p>
      <form className="selection-expansion-form" onSubmit={(event) => {
        event.preventDefault();
        void run();
      }}>
        <label>Distance (Å)<input type="number" step="any" required
          value={distance} onChange={(event) => setDistance(event.target.value)}
          disabled={running || disabled} /></label>
        <label>Expand to<select value={granularity}
          onChange={(event) => setGranularity(event.target.value as "atom" | "residue")}
          disabled={running || disabled}>
          <option value="atom">Matching atoms</option>
          <option value="residue">Complete residues</option>
        </select></label>
        <button type="submit" className="secondary-button" disabled={running || disabled}>
          {running ? "Expanding…" : "Expand selection"}
        </button>
        {running ? <button type="button" className="secondary-button" onClick={cancel}>
          Cancel expansion
        </button> : null}
      </form>
      {!onMessage && message ? <p role={failed ? "alert" : "status"}>{message}</p> : null}
    </fieldset>
  );
}
