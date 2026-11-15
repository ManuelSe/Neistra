"""Fast publication of already verified, same-filesystem staged molecular bytes."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session
from uuid6 import uuid7

from neistra_api.import_export import NORMALIZED_MEDIA_TYPE, safe_display_filename
from neistra_api.models import Artifact


@dataclass(frozen=True, slots=True)
class StagedArtifact:
    path: Path
    destination: Path
    relative_path: str
    size: int
    sha256: str


def publish_staged_artifact(
    session: Session,
    staged: StagedArtifact,
    filename: str,
) -> Artifact:
    """Run only in the final locked transaction after off-loop verification.

    Output bytes were fsynced in the private managed work directory. Moving them
    on the same filesystem avoids hashing/writing a full structure under the lock.
    Canonical identity/history still publish through the existing transaction.
    """
    artifact = session.scalar(select(Artifact).where(Artifact.sha256 == staged.sha256))
    if artifact is not None:
        return artifact
    staged.destination.parent.mkdir(parents=True, exist_ok=True)
    if not staged.destination.exists():
        os.replace(staged.path, staged.destination)
    artifact = Artifact(
        id=str(uuid7()),
        sha256=staged.sha256,
        size=staged.size,
        relative_path=staged.relative_path,
        filename=safe_display_filename(filename),
        media_type=NORMALIZED_MEDIA_TYPE,
    )
    session.add(artifact)
    session.flush()
    return artifact
