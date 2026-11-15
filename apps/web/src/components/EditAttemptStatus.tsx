import { LoaderCircle, CircleHelp, Check, AlertTriangle } from "lucide-react";
import type { EditAttemptSnapshot } from "../editing/attempt";
interface Props {
  attempt: EditAttemptSnapshot; onCheck?: () => Promise<void>; onReview?: () => Promise<void>;
  onContinue?: () => Promise<void>; reviewCurrent?: boolean;
}
export function EditAttemptStatus({ attempt, onCheck, onReview, onContinue, reviewCurrent }: Props) {
  if (attempt.phase === "idle") return null;
  const working = attempt.phase === "submitting" || attempt.phase === "reconciling";
  const missingIdentity = Boolean(attempt.journalRecovery && !attempt.journalRecovery.acknowledged);
  const unknown = attempt.phase === "unknown" || missingIdentity;
  const canReview = attempt.canReview ?? (attempt.phase === "unknown" && !attempt.acknowledged);
  const label = attempt.phase === "submitting" ? "Applying…" : attempt.phase === "reconciling" ? "Checking edit status…"
    : attempt.phase === "saved" ? "Saved" : attempt.phase === "not_applied" ? "Not applied" : "Status unknown";
  return <div className="edit-attempt-status" data-phase={attempt.phase}>
    <p role="status">{working ? <LoaderCircle size={14} className="edit-progress-icon" aria-hidden="true" />
      : unknown ? <CircleHelp size={14} aria-hidden="true" /> : attempt.phase === "saved" ? <Check size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}
      <strong>{label}</strong>{attempt.identity ? <span> · {attempt.identity.targetLabel}</span> : null}
      {attempt.feedback ? <span> · {attempt.feedback.warnings.length} warnings</span> : null}</p>
    {unknown ? <p>Earlier edit outcome is unknown. It may still arrive.</p> : null}
    {attempt.error ? <p role={attempt.phase === "not_applied" ? "alert" : "status"}>{attempt.error}</p> : null}
    {onCheck && (["submitting", "unknown", "reconciling"].includes(attempt.phase) || attempt.error || missingIdentity) ? <button type="button"
      disabled={attempt.phase === "reconciling"} onClick={() => void onCheck()}>Check edit status</button> : null}
    {canReview ? <>
      <p>Review the latest structure and history before continuing. Continuing does not retry or undo that edit.</p>
      {onReview ? <button type="button" onClick={() => void onReview()}>Review current state</button> : null}
      {attempt.review ? <>
        <p>Reviewed revision {attempt.review.revision}. {attempt.review.identityUnavailable ? "Current project and history refreshed; earlier edit identity is unavailable." : attempt.review.artifactId ? "Current structure verified." : "Earlier target is absent."}</p>
        <p>Next undo: {attempt.review.undo ?? "None"}. Next redo: {attempt.review.redo ?? "None"}.</p>
        {!reviewCurrent ? <p role="status">Project changed — review again.</p> : null}
        {onContinue ? <button type="button" disabled={!reviewCurrent} onClick={() => void onContinue()}>Continue editing current state</button> : null}
      </> : null}
    </> : null}
    {attempt.journalRecovery?.acknowledged ? <p>Earlier edit identity remains unavailable; this project’s acknowledgment is retained.</p> : null}
    {attempt.acknowledged ? <p>Continuing from reviewed revision {attempt.acknowledged.revision}; this earlier outcome remains recorded.</p> : null}
    {(attempt.previous?.length ?? 0) > 0 ? <details><summary>Earlier edit records</summary>{attempt.previous!.map(record => <p key={record.identity?.id}>
      {record.identity?.targetLabel}: {record.identity?.operation} — {record.phase === "unknown" ? "outcome unknown; may still arrive" : record.phase}.
    </p>)}</details> : null}
  </div>;
}
