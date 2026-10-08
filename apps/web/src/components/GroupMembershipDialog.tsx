import { useRef, useState } from "react";
import type { Project } from "../api/types";
import { groupLabels, groupReturnFocus, groupScopeSummary, type GroupScope } from "../groups/membership";
import { Modal } from "./Modal";

export interface GroupDialogRequest {
  mode: "move" | "create";
  scope: GroupScope;
}

export function GroupMembershipDialog({
  project, request, busy, onClose, onSubmit,
}: {
  project: Project;
  request: GroupDialogRequest;
  busy: boolean;
  onClose: () => void;
  onSubmit: (scope: GroupScope, target: { groupId: string } | { name: string }) => Promise<void>;
}) {
  const [groupId, setGroupId] = useState(project.groups[0]?.id ?? "");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const labels = groupLabels(project.groups);
  const isCreate = request.mode === "create";
  const stale = request.scope.projectId !== project.id || request.scope.revision !== project.revision;
  const valid = isCreate ? !!name.trim() : project.groups.some((group) => group.id === groupId);
  return (
    <Modal
      open
      title={isCreate ? "Create group" : "Move to group"}
      description={groupScopeSummary(request.scope)}
      onOpenChange={(open) => { if (!open) onClose(); }}
      returnFocus={() => groupReturnFocus(request.scope, isCreate ? undefined : groupId)}
    >
      <form
        ref={formRef}
        tabIndex={-1}
        className="dialog-form group-membership-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid || busy || stale || submitting.current) return;
          submitting.current = true;
          setPending(true);
          formRef.current?.focus();
          setError(null);
          void (async () => {
            try {
              await onSubmit(request.scope, isCreate ? { name: name.trim() } : { groupId });
              onClose();
            } catch (failure) {
              setError(failure instanceof Error ? failure.message : "Group membership could not be changed.");
            } finally {
              submitting.current = false;
              setPending(false);
            }
          })();
        }}
      >
        {isCreate ? (
          <label>Group name
            <input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
          </label>
        ) : (
          <label>Destination group
            <select value={groupId} onChange={(event) => setGroupId(event.target.value)}>
              {!project.groups.length ? <option value="">No groups available</option> : null}
              {project.groups.map((group) => <option key={group.id} value={group.id}>{labels.get(group.id)}</option>)}
            </select>
          </label>
        )}
        {stale ? <p role="alert">The project changed. Close this dialog and start the action again.</p> : null}
        {error ? <p className="inline-error" role="alert">{error}</p> : null}
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" type="submit" disabled={!valid || busy || pending || stale}>
            {isCreate ? "Create group" : "Move structures"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
