import { useId } from "react";
import type { PropertyPresentation } from "../ligandProperties/useProperties";
import type { LigandPropertySession } from "../ligandProperties/session";
import { profileInputAuthority } from "./authority";
import { evaluateProfile } from "./evaluate";
import { profileComparison } from "./comparison";
import { ProfileComparison } from "./ProfileComparison";
import { profileConstraints } from "./validate";
import type { ProfileStatus } from "./types";
import type { ProfilePresentation } from "./useProfiles";
import "./profiles.css";

const outcomeLabels: Record<ProfileStatus | "missing", string> = {
  pass: "Met", fail: "Not met", pending: "Updating", unavailable: "Unavailable", error: "Error",
  stale: "Unavailable", preview: "Preview unavailable", cancelled: "Cancelled", missing: "Missing value",
};
const operators = { lt: "<", le: "≤", gt: ">", ge: "≥" };
export function ProfileReadout({ profiles, properties, session, propertyStatus, showComparison = false }: {
  profiles: ProfilePresentation; properties: PropertyPresentation; session: LigandPropertySession; propertyStatus: string; showComparison?: boolean;
}) {
  const id = useId(), { registry, selectedId } = profiles;
  const profile = registry?.profiles.find(profile => profile.id === selectedId);
  const comparison = showComparison && registry && profile && properties.target
    ? profileComparison(registry, selectedId, profileInputAuthority(properties, session, profiles.selection, registry, selectedId)) : null;
  const evaluation = comparison ? comparison.evaluation : registry && profile && (properties.target || profile.availability === "unavailable")
    ? evaluateProfile(registry, selectedId, profileInputAuthority(properties, session, profiles.selection, registry, selectedId)) : null;
  let status = "No profile selected.";
  if (profiles.error) status = "Profile options could not be loaded. Property updates remain independent.";
  else if (profiles.loading) status = "Loading profile options…";
  else if (selectedId && !profile) status = "Selected profile is unavailable in the current catalog.";
  else if (profile?.availability === "unavailable") status = profile.unavailable_reason ?? "This profile is unavailable.";
  else if (profile) {
    if (!properties.target) status = "Choose a current ligand to assess this profile.";
    else if (evaluation?.status === "pass") status = "Within profile criteria.";
    else if (evaluation?.status === "fail") status = evaluation.complete ? "Outside profile criteria." : "Outside profile criteria; remaining values are updating or unavailable.";
    else if (evaluation?.status === "pending") status = "Updating profile…";
    else if (evaluation?.status === "preview") status = "Preview — profile unavailable.";
    else if (evaluation?.status === "cancelled") status = "Profile update cancelled.";
    else if (evaluation?.status === "error") status = "Profile assessment could not be completed.";
    else if (evaluation?.reason === "profile_descriptor_method_mismatch") status = "Profile unavailable — the property method does not match this catalog.";
    else if (evaluation?.reason === "source_profile_charged_representation_unsupported") status = "Profile unavailable — this definition requires a representation without formally charged atoms.";
    else if (evaluation?.reason === "source_profile_charge_qualification_missing") status = "Profile unavailable — atomic charge qualification is missing.";
    else status = "Profile unavailable for the current molecular representation.";
  }
  const constraints = registry && profile ? profileConstraints(registry, profile.id) : [];
  return <div className="ligand-profile">
    <div className="ligand-profile-choice"><label htmlFor={id}>Profile</label>
      <select id={id} value={selectedId} onChange={event => profiles.select(event.target.value)}>
        <option value="">No profile</option>
        {selectedId && !profile ? <option value={selectedId}>Unavailable profile ({selectedId})</option> : null}
        {registry?.profiles.map(option => <option key={option.id} value={option.id}>{option.name}{option.availability === "unavailable" && !option.name.toLowerCase().includes("unavailable") ? " — unavailable" : ""}</option>)}
      </select>
    </div>
    <p role="status" className="ligand-profile-status"><span className="sr-only">{propertyStatus} </span>{status}</p>
    {showComparison && !selectedId ? <p>Choose a profile to compare properties.</p> : null}
    {comparison ? <ProfileComparison comparison={comparison} /> : null}
    {profiles.error ? <button type="button" className="ligand-properties-action ligand-profile-retry" onClick={profiles.retry}>Retry profiles</button> : null}
    {profile && registry ? <details className="ligand-profile-details"><summary>Criteria and sources</summary>
      <p>{profile.description}</p>
      <p>Definition {profile.definition_version} · Catalog {registry.registry_version}</p>
      {evaluation?.reason ? <p>Assessment: {evaluation.reason.replaceAll("_", " ")}</p> : null}
      {profile.unavailable_reason ? <p>{profile.unavailable_reason}</p> : null}
      {profile.missing_inputs.length ? <p>Required inputs: {profile.missing_inputs.join(", ")}</p> : null}
      {constraints.length ? <dl className="ligand-profile-criteria">{constraints.map(constraint => {
        const definition = registry.descriptors.find(definition => definition.id === constraint.descriptor_id)!;
        const outcome = evaluation?.criteria.find(outcome => outcome.constraint.id === constraint.id);
        return <div key={constraint.id}><dt>{definition.name}</dt><dd>
          <span>Value: {outcome?.value === null || outcome?.value === undefined ? "Unavailable" : String(outcome.value)}{outcome?.value !== null && outcome?.value !== undefined && definition.unit ? ` ${definition.unit}` : ""}</span>
          <span>Criterion: {operators[constraint.operator]} {String(constraint.limit)}{definition.unit ? ` ${definition.unit}` : ""}</span>
          <span>{outcome ? outcomeLabels[outcome.status] : "Unassessed"}</span>
          {outcome?.reason ? <span>{outcome.reason.replaceAll("_", " ")}</span> : null}
        </dd></div>;
      })}</dl> : null}
      {profile.adaptations.length ? <><h4>Adaptations</h4><ul>{profile.adaptations.map(item => <li key={item}>{item}</li>)}</ul></> : null}
      <h4>Sources</h4><ul>{registry.sources.filter(source => profile.source_ids.includes(source.id)).map(source => <li key={source.id}>
        <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> · DOI {source.doi}<p>{source.scope}</p>
      </li>)}</ul>
      <p>Method {registry.descriptor_method.implementation_version} · Policy {registry.descriptor_method.policy_version} · Library {registry.descriptor_method.library_version}</p>
      {registry.limitations.map(item => <p key={item}>{item}</p>)}
    </details> : null}
  </div>;
}
