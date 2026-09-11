import { useEffect, useRef, useState } from "react";
import type { ExpandSelection } from "../selection/expansion";

export function SelectionExpansion({ expand, contextKey, disabled }: {
  expand: ExpandSelection;
  contextKey: string;
  disabled: boolean;
}) {
  const [distance, setDistance] = useState("4");
  const [granularity, setGranularity] = useState<"atom" | "residue">("atom");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), [contextKey]);
  const cancel = () => {
    pending.current?.abort();
    pending.current = null;
    setRunning(false);
    setFailed(false);
    setMessage("Distance expansion cancelled.");
  };
  const run = async () => {
    const controller = new AbortController();
    pending.current?.abort();
    pending.current = controller;
    setRunning(true);
    setMessage(null);
    setFailed(false);
    try {
      const count = await expand(Number(distance), granularity, controller.signal);
      if (pending.current === controller && !controller.signal.aborted) {
        setMessage(`Selection expanded to ${count} atoms.`);
      }
    } catch (error) {
      if (pending.current === controller) {
        const cancelled = controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError");
        setFailed(!cancelled);
        setMessage(cancelled ? "Distance expansion cancelled." :
          error instanceof Error ? error.message : "Distance expansion failed.");
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
      {message ? <p role={failed ? "alert" : "status"}>{message}</p> : null}
    </fieldset>
  );
}
