import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ApiError, jobApi } from "../api/client";
import type { Job, JobDefinition, Project } from "../api/types";
import { Modal } from "./Modal";

interface JobSubmitDialogProps {
  open: boolean;
  project: Project | undefined;
  onOpenChange: (open: boolean) => void;
  onSubmitted: (job: Job) => void;
}

function initialParameters(definition: JobDefinition | undefined) {
  return Object.fromEntries(
    Object.entries(definition?.parameter_schema.properties ?? {}).map(
      ([name, schema]) => [
        name,
        "default" in schema
          ? schema.default
          : schema.type === "array"
            ? [0, 0, 0]
            : "",
      ],
    ),
  );
}

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "The job could not be submitted.";
}

export function JobSubmitDialog({
  open,
  project,
  onOpenChange,
  onSubmitted,
}: JobSubmitDialogProps) {
  const definitionsQuery = useQuery({
    queryKey: ["job-definitions"],
    queryFn: jobApi.definitions,
    enabled: open,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const [jobType, setJobType] = useState("");
  const [parameters, setParameters] = useState<Record<string, unknown>>({});
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const definitions = definitionsQuery.data ?? [];
  const definition =
    definitions.find((item) => item.job_type === jobType) ?? definitions[0];

  useEffect(() => {
    if (!open || !definition) return;
    if (jobType !== definition.job_type) setJobType(definition.job_type);
    setParameters(initialParameters(definition));
    setSelected(Object.fromEntries(definition.input_roles.map((role) => [role.role, []])));
  }, [definition, jobType, open]);

  const inputs = useMemo(
    () =>
      definition?.input_roles.flatMap((role) =>
        (selected[role.role] ?? []).map((entry_id) => ({
          role: role.role,
          entry_id,
        })),
      ) ?? [],
    [definition, selected],
  );
  const rolesValid =
    definition?.input_roles.every((role) => {
      const count = selected[role.role]?.length ?? 0;
      return count >= role.minimum && count <= role.maximum;
    }) ?? false;
  const submit = useMutation({
    mutationFn: () =>
      jobApi.submit(project?.id ?? "", definition?.job_type ?? "", parameters, inputs),
    onSuccess: (job) => {
      onSubmitted(job);
      onOpenChange(false);
    },
  });

  const setParameter = (name: string, value: unknown) =>
    setParameters((current) => ({ ...current, [name]: value }));

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Run job"
      description="Choose an installed job definition, immutable structure inputs, and parameters."
    >
      {definitionsQuery.isLoading ? (
        <p className="empty-label">Loading job definitions...</p>
      ) : definitionsQuery.isError ? (
        <p className="inline-error" role="alert">Job definitions are unavailable.</p>
      ) : definitions.length === 0 ? (
        <p className="empty-label">No allowlisted job plugins are installed.</p>
      ) : (
        <form
          className="dialog-form job-submit-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (rolesValid) submit.mutate();
          }}
        >
          <label>
            Job type
            <select value={definition?.job_type} onChange={(event) => setJobType(event.target.value)}>
              {definitions.map((item) => (
                <option key={item.job_type} value={item.job_type}>{item.label}</option>
              ))}
            </select>
          </label>
          <p className="job-definition-description">{definition?.description}</p>
          {definition?.input_roles.map((role) => {
            const eligible =
              project?.entries.filter(
                (entry) =>
                  entry.current_artifact_id &&
                  (role.structure_types.length === 0 || role.structure_types.includes(entry.structure_type)),
              ) ?? [];
            const chosen = selected[role.role] ?? [];
            return (
              <fieldset className="job-input-role" key={role.role}>
                <legend>
                  {role.label} <span>{role.minimum}-{role.maximum}</span>
                </legend>
                {eligible.length === 0 ? (
                  <p className="inline-error">No compatible structures are available.</p>
                ) : (
                  eligible.map((entry) => (
                    <label key={entry.id}>
                      <input
                        type="checkbox"
                        checked={chosen.includes(entry.id)}
                        disabled={!chosen.includes(entry.id) && chosen.length >= role.maximum}
                        onChange={(event) =>
                          setSelected((current) => ({
                            ...current,
                            [role.role]: event.target.checked
                              ? [...chosen, entry.id]
                              : chosen.filter((id) => id !== entry.id),
                          }))
                        }
                      />
                      <span>{entry.name}</span>
                      <small>{entry.structure_type}</small>
                    </label>
                  ))
                )}
              </fieldset>
            );
          })}
          <div className="job-parameter-grid">
            {Object.entries(definition?.parameter_schema.properties ?? {}).map(
              ([name, schema]) => {
                const title = schema.title ?? name;
                const value = parameters[name];
                if (schema.type === "array") {
                  const numbers = Array.isArray(value) ? value.map(Number) : [0, 0, 0];
                  return (
                    <fieldset key={name} className="vector-parameter">
                      <legend>{title}</legend>
                      {numbers.map((item, index) => (
                        <label key={index}>
                          <span>{["X", "Y", "Z"][index] ?? index + 1}</span>
                          <input
                            aria-label={`${title} ${["X", "Y", "Z"][index] ?? index + 1}`}
                            type="number"
                            step="any"
                            value={Number(item)}
                            onChange={(event) => {
                              const next = [...numbers];
                              next[index] = Number(event.target.value);
                              setParameter(name, next);
                            }}
                          />
                        </label>
                      ))}
                    </fieldset>
                  );
                }
                const numeric = schema.type === "integer" || schema.type === "number" || schema.anyOf;
                return (
                  <label key={name}>
                    {title}
                    <input
                      type={numeric ? "number" : "text"}
                      step={schema.type === "integer" ? "1" : "any"}
                      min={typeof schema.minimum === "number" ? schema.minimum : undefined}
                      max={typeof schema.maximum === "number" ? schema.maximum : undefined}
                      value={
                        value === null || value === undefined
                          ? ""
                          : typeof value === "string" || typeof value === "number"
                            ? value
                            : ""
                      }
                      onChange={(event) =>
                        setParameter(
                          name,
                          event.target.value === ""
                            ? schema.anyOf
                              ? null
                              : ""
                            : numeric
                              ? Number(event.target.value)
                              : event.target.value,
                        )
                      }
                    />
                  </label>
                );
              },
            )}
          </div>
          {submit.isError ? <p className="inline-error" role="alert">{errorMessage(submit.error)}</p> : null}
          <div className="dialog-actions">
            <button type="button" className="secondary-button" onClick={() => onOpenChange(false)}>Cancel</button>
            <button type="submit" className="primary-button" disabled={!project || !rolesValid || submit.isPending}>
              Queue job
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
