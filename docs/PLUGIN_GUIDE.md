# Job Plugin Guide

Status: MolWeave v0.1 generic job interface. Docking is not implemented in the
core application.

## Registration

A plugin is installed Python code exposing one `JobPlugin` object. Runtime
uploads and arbitrary command strings are not accepted. API and worker must run
with the same package, allowlist, and targets:

```bash
export MOLWEAVE_JOB_PLUGIN_ALLOWLIST=acme.docking
export MOLWEAVE_JOB_PLUGIN_TARGETS=acme_docking.molweave_plugin:plugin
```

An installed package should also declare the standard entry-point group:

```toml
[project.entry-points."molweave.jobs"]
acme-docking = "acme_docking.molweave_plugin:plugin"
```

Discovery occurs only at process startup. The object `name` must be allowlisted.
Restart API and worker after installing or changing a plugin. Configured targets
support source checkouts; entry points are the distribution mechanism.

## Definition

Public types live in `molweave_core.jobs`. A future docking package uses generic
role strings without adding docking models to MolWeave core:

```python
from pydantic import BaseModel, ConfigDict, Field
from molweave_core.jobs import (
    InputRole, JobDefinition, ResourcePolicy, ResultRole,
)

NORMALIZED = "application/vnd.molweave.normalized-structure+json"

class DockParameters(BaseModel):
    model_config = ConfigDict(extra="forbid")
    center: tuple[float, float, float]
    size: tuple[float, float, float]
    exhaustiveness: int = Field(default=8, ge=1, le=128)
    pose_count: int = Field(default=10, ge=1, le=100)

definition = JobDefinition(
    job_type="acme.docking.pose_search",
    implementation_version="2.3.1",
    label="Pose search",
    description="Search poses with the installed Acme engine.",
    parameter_model=DockParameters,
    input_roles=(
        InputRole(
            role="receptor", label="Receptor", minimum=1, maximum=1,
            structure_types=("protein", "complex"),
        ),
        InputRole(
            role="ligand", label="Ligand", minimum=1, maximum=1,
            structure_types=("ligand",),
        ),
    ),
    result_roles=(
        ResultRole(
            role="poses", label="Pose table",
            media_types=("application/json",),
        ),
        ResultRole(
            role="pose", label="Importable pose",
            media_types=(NORMALIZED,), importable_structure=True,
        ),
    ),
    resources=ResourcePolicy(
        wall_time_seconds=3600,
        cancellation_grace_seconds=5,
        max_result_artifacts=101,
        max_result_bytes=500 * 1024 * 1024,
        cpu_time_seconds=3600,
        memory_bytes=8 * 1024 * 1024 * 1024,
    ),
)
```

The API validates the Pydantic object, role cardinality, declared structure
types, and artifact availability before enqueueing. The plugin must validate
method-specific chemistry and units. Reject unsupported receptor/ligand
preparation explicitly; do not infer it silently.

The configured target and entry point resolve to a concrete plugin object:

```python
class AcmeDockingPlugin:
    name = "acme.docking"

    def definitions(self):
        return (definition,)

    def execute(self, job_type, parameters, inputs, context):
        if job_type != definition.job_type:
            raise ValueError(f"Unsupported job type: {job_type}")
        return execute_docking(job_type, parameters, inputs, context)


plugin = AcmeDockingPlugin()
```

The object is structural: importing and type-checking it against `JobPlugin`
is sufficient; subclassing a framework base class is not required.

## Input Artifacts

`execute` receives `InputArtifact` objects in submission order. Select by
`input.role`, then use:

- `entry_id`, `entry_name`, and `structure_type` for identity and messages.
- `artifact_id` and `sha256` for provenance.
- `media_type` and `filename` for validation and display.
- `read_bytes()` for immutable normalized bytes.

Parse bytes with `NormalizedStructureV1.from_bytes`. Do not open a user path:
the runner supplies bytes and a private `context.work_directory`. If a library
requires files, write only inside that directory with plugin-controlled names.

## Execution And Events

The exact execution point is `JobPlugin.execute` inside the spawned worker child,
after the parent re-hashes inputs and parameters are revalidated:

```python
from molweave_core.jobs import JobContext, JobResult
from molweave_core.molecular import NormalizedStructureV1

def execute_docking(job_type, parameters, inputs, context: JobContext) -> JobResult:
    receptor_input = next(item for item in inputs if item.role == "receptor")
    ligand_input = next(item for item in inputs if item.role == "ligand")
    receptor = NormalizedStructureV1.from_bytes(receptor_input.read_bytes())
    ligand = NormalizedStructureV1.from_bytes(ligand_input.read_bytes())

    validate_preparation(receptor, ligand, parameters)
    context.stdout("Validated receptor and ligand preparation")
    context.progress(5, "Preparing search")
    context.checkpoint()

    poses = run_python_engine(
        receptor,
        ligand,
        parameters,
        on_iteration=lambda done, total: (
            context.checkpoint(),
            context.progress(5 + 85 * done / total, f"Searching {done}/{total}"),
        ),
    )
```

Use `context.checkpoint()` in expensive loops and `context.sleep()` for waits.
Use `context.stdout()` and `context.stderr()` for durable logs; ordinary Python
stdout/stderr is captured too. Progress is monotonic from 0 to 100 with a concise
message. Do not start work that can outlive `execute`.

## Poses, Scores, And Import

Core results are generic artifacts and JSON values. The plugin owns score
meaning, sign, unit, ranking, and engine provenance:

```python
    pose_artifacts = tuple(
        context.publish_artifact(
            role="pose",
            filename=f"pose-{index:03d}.normalized.json",
            media_type=NORMALIZED,
            data=pose.structure.to_bytes(),
            metadata={
                "rank": index,
                "score": pose.score,
                "score_unit": "kcal/mol",
                "receptor_artifact_sha256": receptor_input.sha256,
                "ligand_artifact_sha256": ligand_input.sha256,
            },
        )
        for index, pose in enumerate(poses, start=1)
    )
    table = context.publish_artifact(
        role="poses",
        filename="poses.json",
        media_type="application/json",
        data=encode_pose_table(poses),
    )
    context.progress(100, "Published poses and scores")
    return JobResult(
        artifacts=(table, *pose_artifacts),
        values={
            "pose_count": len(poses),
            "scores": [
                {"rank": i, "value": pose.score, "unit": "kcal/mol"}
                for i, pose in enumerate(poses, start=1)
            ],
        },
        message="Pose search completed",
    )
```

Every role/media type must match the definition. Importable pose bytes must be
`NormalizedStructureV1`; the parent validates this before publication. The UI
downloads any result and offers Import only for importable roles. Import creates
an undoable entry linked to job/result, implementation, canonical parameters,
receptor/ligand entry IDs, and immutable input hashes.

## Failure And Recovery

Raise an exception with an actionable message for invalid chemistry or engine
failure. The runner records `plugin_execution_failed`; malformed output becomes
`invalid_plugin_result`. Cancellation raises `JobCancelled` at a checkpoint, or
the parent terminates after the grace period. Wall-time violation and lost
child/worker processes have separate codes. v0.1 never retries automatically.

## Docking Integration Checklist

1. Package a `JobPlugin` object and declare `molweave.jobs` metadata.
2. Add the same plugin name to API and worker deployment allowlists.
3. Declare a stable job type and version; change the version when execution or
   scoring behavior changes.
4. Declare generic receptor/ligand roles, exact cardinality, and accepted types.
5. Define strict parameters including search box/grid units, exhaustiveness,
   seeds, and output count.
6. Parse immutable normalized bytes and validate method-specific preparation;
   surface every warning or rejection.
7. Execute only in `JobPlugin.execute`, use the private work directory, report
   progress/logs, and check cancellation throughout expensive work.
8. Return score tables with explicit units and engine version; return each
   importable pose as normalized structure bytes.
9. Declare every result role/media type and mark only normalized structures as
   importable.
10. Test success, deterministic failure, cancellation, limits, worker loss,
    downloads, result import/undo, and archive round trips before enablement.

`packages/molweave_demo_plugin` is the runnable reference. It uses the same
registry, child runner, event ledger, validation, result publication, and import
path that a future docking package will use.
