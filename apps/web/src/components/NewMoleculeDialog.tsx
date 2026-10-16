import { useEffect, useRef, useState } from "react";
import { ELEMENTS } from "../editing/elements";
import { Modal } from "./Modal";

export interface NewMoleculeInput { name: string; element: string; charge: number | null }
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: NewMoleculeInput, ownsResponse: () => boolean) => Promise<void>;
}

export function NewMoleculeDialog({ open, onOpenChange, onCreate }: Props) {
  const [name, setName] = useState("New molecule");
  const [element, setElement] = useState("C");
  const [charge, setCharge] = useState("0");
  const [unknown, setUnknown] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lifetime = useRef(0);
  useEffect(() => () => { lifetime.current++; }, []);
  const close = (next: boolean) => { if (!next) lifetime.current++; onOpenChange(next); };
  const submit = async () => {
    if (pending) return;
    const owner = ++lifetime.current;
    const ownsResponse = () => lifetime.current === owner;
    setPending(true); setError(null);
    try { await onCreate({ name: name.trim(), element, charge: unknown ? null : Number(charge) }, ownsResponse); }
    catch (failure) { if (ownsResponse()) setError(failure instanceof Error ? failure.message : "Molecule creation failed."); }
    finally { if (ownsResponse()) setPending(false); }
  };
  return <Modal open={open} onOpenChange={close} title="New molecule" description="Start with one atom at the origin, then build in Edit. Chemistry can remain incomplete.">
    <form aria-busy={pending} onSubmit={event => { event.preventDefault(); void submit(); }}>
      <fieldset disabled={pending}>
        <label>Molecule name<input value={name} maxLength={160} onChange={event => setName(event.target.value)} /></label>
        <label>First element<input list="first-atom-elements" value={element} onChange={event => setElement(event.target.value)} /></label>
        <datalist id="first-atom-elements">{ELEMENTS.map(symbol => <option key={symbol} value={symbol} />)}</datalist>
        <label>First formal charge<input type="number" step="1" value={charge} disabled={unknown} onChange={event => setCharge(event.target.value)} /></label>
        <label><input type="checkbox" checked={unknown} onChange={event => setUnknown(event.target.checked)} />Charge unknown</label>
      </fieldset>
      {pending ? <p role="status">Creation continues if you close this dialog.</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <div className="dialog-actions"><button type="button" onClick={() => close(false)}>{pending ? "Close" : "Cancel"}</button>
        <button type="submit" disabled={pending || !name.trim() || !ELEMENTS.includes(element) || (!unknown && (!charge.trim() || !Number.isSafeInteger(Number(charge))))}>{pending ? "Creating…" : "Create molecule"}</button></div>
    </form>
  </Modal>;
}
