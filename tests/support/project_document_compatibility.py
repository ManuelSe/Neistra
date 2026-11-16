"""Exact documented project-default conversion for current reader qualifications.

Import only in the current schema-3 process. The actual preceding process keeps
its own helpers; no earlier API implementation is emulated by this conversion.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from molweave_api.schemas import EntryRead, ProjectRead


def expected_project(document: dict[str, Any]) -> dict[str, Any]:
    """Retain every preceding field while applying only the declared migration."""
    result = deepcopy(document)
    target = ProjectRead.model_fields["schema_version"].default
    if result.get("schema_version") == 2 and target == 3:
        default = EntryRead.model_fields["ligand_designation"].get_default(
            call_default_factory=True,
        )
        assert default is not None
        for entry in result["entries"]:
            assert "ligand_designation" not in entry, (
                "Schema-2 producer emitted unknown ligand state"
            )
            entry["ligand_designation"] = default.model_dump(mode="json")
        result["schema_version"] = 3
    return result
