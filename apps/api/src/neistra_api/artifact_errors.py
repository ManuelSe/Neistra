"""Artifact boundary failures shared without importing publication services."""


class ArtifactNotFoundError(LookupError):
    pass


class ArtifactIntegrityError(LookupError):
    pass
