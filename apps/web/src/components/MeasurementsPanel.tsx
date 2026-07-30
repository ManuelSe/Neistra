import { Eye, EyeOff, Ruler, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { projectApi } from "../api/client";
import type {
  Contact,
  Measurement,
  MeasurementKind,
  NormalizedStructure,
  Project,
  Selection,
} from "../api/types";
import {
  formatMeasurement,
  measurementValue,
} from "../measurements/geometry";
import { canonicalSelection } from "../selection/selection";
import { IconButton } from "./IconButton";

interface MeasurementsPanelProps {
  project: Project;
  selection: Selection;
  structures: Map<string, NormalizedStructure>;
  busy: boolean;
  onCreate: (name: string, kind: MeasurementKind) => void;
  onUpdate: (measurement: Measurement, name: string, visible: boolean) => void;
  onDelete: (measurement: Measurement) => void;
  onSelectContact: (selection: Selection) => void;
}

export function MeasurementsPanel({
  project,
  selection,
  structures,
  busy,
  onCreate,
  onUpdate,
  onDelete,
  onSelectContact,
}: MeasurementsPanelProps) {
  const [name, setName] = useState("");
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [contactEntry, setContactEntry] = useState(project.entries[0]?.id ?? "");
  const [cutoff, setCutoff] = useState("2");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactBusy, setContactBusy] = useState(false);
  const availableKinds = useMemo(
    () =>
      ([
        ["distance", 2],
        ["angle", 3],
        ["dihedral", 4],
      ] as const).filter(([, count]) => count === selection.atoms.length),
    [selection.atoms.length],
  );

  return (
    <div className="measurements-panel">
      <section className="measurement-create">
        <label>
          Measurement name
          <input
            value={name}
            placeholder="Measurement name"
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <div className="measurement-kind-buttons">
          {(["distance", "angle", "dihedral"] as const).map((kind) => {
            const required = { distance: 2, angle: 3, dihedral: 4 }[kind];
            return (
              <button
                type="button"
                key={kind}
                disabled={
                  selection.atoms.length !== required || !name.trim() || busy
                }
                onClick={() => {
                  onCreate(name.trim(), kind);
                  setName("");
                }}
              >
                <Ruler size={14} /> {kind}
              </button>
            );
          })}
        </div>
        {availableKinds.length === 0 ? (
          <p className="empty-label">
            Select 2 atoms for distance, 3 for angle, or 4 for dihedral.
          </p>
        ) : null}
      </section>

      <section className="measurement-list" aria-label="Measurements">
        {project.measurements.map((measurement) => {
          const value = measurementValue(
            measurement.kind,
            measurement.atom_references,
            structures,
          );
          const draft = draftNames[measurement.id] ?? measurement.name;
          return (
            <div key={measurement.id} className="measurement-row">
              <div>
                <input
                  aria-label={`Name for ${measurement.name}`}
                  value={draft}
                  onChange={(event) =>
                    setDraftNames((current) => ({
                      ...current,
                      [measurement.id]: event.target.value,
                    }))
                  }
                />
                <small>
                  {measurement.kind} · {formatMeasurement(measurement.kind, value)}
                </small>
              </div>
              <IconButton
                label={`Save name for ${measurement.name}`}
                disabled={!draft.trim() || draft === measurement.name || busy}
                onClick={() =>
                  onUpdate(measurement, draft.trim(), measurement.visible)
                }
              >
                <Save size={14} />
              </IconButton>
              <IconButton
                label={`${measurement.visible ? "Hide" : "Show"} ${measurement.name}`}
                onClick={() =>
                  onUpdate(measurement, measurement.name, !measurement.visible)
                }
              >
                {measurement.visible ? <Eye size={14} /> : <EyeOff size={14} />}
              </IconButton>
              <IconButton
                label={`Delete measurement ${measurement.name}`}
                onClick={() => onDelete(measurement)}
              >
                <Trash2 size={14} />
              </IconButton>
            </div>
          );
        })}
        {project.measurements.length === 0 ? (
          <p className="empty-label">No measurements</p>
        ) : null}
      </section>

      <section className="contacts-panel">
        <h3>Close contacts</h3>
        <div className="form-row">
          <label>
            Structure
            <select
              value={contactEntry}
              onChange={(event) => setContactEntry(event.target.value)}
            >
              {project.entries
                .filter((entry) => entry.current_artifact_id)
                .map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Cutoff (Å)
            <input
              type="number"
              min="0.1"
              max="10"
              step="0.1"
              value={cutoff}
              onChange={(event) => setCutoff(event.target.value)}
            />
          </label>
        </div>
        <button
          type="button"
          className="secondary-button"
          disabled={!contactEntry || contactBusy}
          onClick={() => {
            setContactBusy(true);
            setContactError(null);
            void projectApi
              .contacts(project, contactEntry, Number(cutoff), 0.5)
              .then(setContacts)
              .catch((error: unknown) =>
                setContactError(
                  error instanceof Error ? error.message : "Contact search failed.",
                ),
              )
              .finally(() => setContactBusy(false));
          }}
        >
          Find contacts
        </button>
        {contactError ? <p className="inline-error">{contactError}</p> : null}
        <div className="contact-results">
          {contacts.map((contact) => (
            <button
              type="button"
              key={`${contact.atom_1.atom_id}-${contact.atom_2.atom_id}`}
              onClick={() =>
                onSelectContact(
                  canonicalSelection(
                    [contact.atom_1, contact.atom_2],
                    "atom",
                    "inspector",
                  ),
                )
              }
            >
              Atoms {contact.atom_1.atom_id}-{contact.atom_2.atom_id}
              <span>{contact.distance.toFixed(2)} Å</span>
            </button>
          ))}
          {!contactBusy && contacts.length === 0 ? (
            <span className="empty-label">No contact results</span>
          ) : null}
        </div>
      </section>
    </div>
  );
}
