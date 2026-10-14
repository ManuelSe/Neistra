"""Frozen structural conversion from viewer schema 1 to 2; no molecular inference.

Shared by migration 0014 and legacy archive import. Keep its ID derivation stable:
the same legacy object must retain identity in live, checkpoint, scene and history
snapshots even when its membership or appearance differs between snapshots.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any
from uuid import NAMESPACE_URL, uuid5


def upgrade_surface_settings(settings: dict[str, Any], entry_id: str) -> dict[str, Any]:
    if "surface_objects" in settings or settings.get("schema_version", 1) != 1:
        raise ValueError("Conflicting legacy and current surface definitions")
    result = deepcopy(settings)
    result.pop("schema_version", None)
    surfaces: list[dict[str, Any]] = []

    def surface(key: str, name: str, source: dict[str, Any], **appearance: Any) -> None:
        surfaces.append(
            {
                "id": str(uuid5(NAMESPACE_URL, f"neistra/viewer-v2/{entry_id}/{key}")),
                "name": name,
                "visible": True,
                "source": source,
                "appearance": {
                    "color_by": "element",
                    "custom_color": "#3b82f6",
                    "opacity": 0.45,
                    "mode": "solid",
                    "inherit_atom_colors": True,
                    **appearance,
                },
            }
        )

    representations = result.get("representations", [])
    for representation in representations:
        if representation.get("style") == "surface":
            surface(
                f"entry/{representation['id']}",
                f"Entry surface {len(surfaces) + 1}",
                {"kind": "entry"},
                **{
                    field: representation[field]
                    for field in ("color_by", "custom_color", "opacity")
                    if field in representation
                },
            )
    result["representations"] = [item for item in representations if item.get("style") != "surface"]
    fragment = result.pop("selection_surface", None)
    if fragment is not None:
        surface("fragment", "Fragment surface", {"kind": "fragment", **fragment})
    pocket = result.pop("selection_pocket_surface", None)
    if pocket is not None:
        surface("pocket", "Protein pocket", {"kind": "pocket", **pocket})
    result["schema_version"] = 2
    result["surface_objects"] = surfaces
    return result
