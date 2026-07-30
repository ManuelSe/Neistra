from __future__ import annotations

from typing import Any


def default_viewer_settings(structure_type: str) -> dict[str, Any]:
    style = "cartoon" if structure_type in {"protein", "complex"} else "ball-and-stick"
    return {
        "representations": [
            {
                "id": "primary",
                "style": style,
                "color_by": "element",
                "custom_color": "#3b82f6",
                "opacity": 1.0,
            }
        ],
        "components": {
            "hydrogens": True,
            "solvent": True,
            "ions": True,
            "ligands": True,
            "protein": True,
        },
        "labels": {
            "atoms": False,
            "residues": False,
            "chains": False,
            "structure": False,
        },
    }
