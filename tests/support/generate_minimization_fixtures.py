"""Offline prepared native-browser fixtures; never used by production minimization.

Run with the repository API/core/demo PYTHONPATH (see the fixture README).
Archives preserve explicitly assigned canonical chemistry that PDB cannot encode.
"""

from __future__ import annotations

import argparse
import tempfile
from pathlib import Path

from molweave_api.database import Base
from molweave_api.main import create_app
from molweave_api.settings import Settings
from molweave_core.adapters.defaults import create_default_registry

from tests.integration.test_archive_roundtrip import export_archive
from tests.integration.test_minimization_apply import seeded_project
from tests.support.api_client import ApiClient
from tests.support.minimization import combined, molecule, peptide, translated


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--benchmark", action="store_true", help="Only export prepared1STP PDB/MOL")
    args = parser.parse_args()
    output = Path(__file__).parents[1] / "fixtures/minimization"
    if args.benchmark:
        from molweave_core.molecular import NormalizedStructureV1

        registry = create_default_registry()
        for stem, format_name in [("protein", "pdb"), ("biotin", "mol")]:
            structure = NormalizedStructureV1.from_bytes(
                (output / f"1stp-{stem}.normalized.json").read_bytes()
            )
            native = registry.for_format(format_name).export(structure, f"1stp-{stem}-prepared")
            (output / f"1stp-{stem}-prepared.{format_name}").write_bytes(native.data)
        return
    ligand = translated(molecule(), (2.0, 4.0, 3.5))
    with tempfile.TemporaryDirectory(prefix="neistra-minimization-fixtures-") as directory:
        settings = Settings(
            data_dir=Path(directory),
            database_url=f"sqlite:///{directory}/fixture.db",
            auto_create_schema=True,
        )
        app = create_app(settings)
        Base.metadata.create_all(app.state.engine)
        client = ApiClient(app)
        specimens = {
            "isolated": (molecule(),),
            "separate": (peptide(), ligand),
            "same-entry": (combined(peptide(), ligand),),
        }
        for name, structures in specimens.items():
            project = seeded_project(client, *structures)
            exported = export_archive(client, project["id"], f"fixture-{name}")
            data = client.get(exported["artifact"]["download_url"]).content
            (output / f"{name}.molweave.zip").write_bytes(data)
        app.state.engine.dispose()
    native = create_default_registry().for_format("mol").export(molecule("C" * 80), "long-alkane")
    (output / "long-alkane.mol").write_bytes(native.data)


if __name__ == "__main__":
    main()
