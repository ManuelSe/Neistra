"""Run against each checkout's real API, core and existing rich reader harness."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import molweave_api.main
import molweave_core.molecular
from molweave_api.archive_service import APPLICATION_VERSION
from molweave_api.main import create_app
from molweave_api.settings import Settings

from tests.support.api_client import ApiClient
from tests.support.selection_reader_qualification import gesture_project, produce, read_gestures


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["produce", "read"])
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--implementation-root", type=Path, required=True)
    parser.add_argument("--expected-version", required=True)
    parser.add_argument("--expect-new-names", action="store_true")
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    implementation = args.implementation_root.resolve()
    assert APPLICATION_VERSION == args.expected_version
    modules = [molweave_api.main, molweave_core.molecular]
    for module in modules:
        assert Path(module.__file__).resolve().is_relative_to(implementation)
    data = args.data_dir.resolve()
    app = create_app(Settings(data_dir=data, database_url=f"sqlite:///{data / 'molweave.db'}"))
    client = ApiClient(app)
    try:
        result = (
            produce(client, data, gesture_project(client))
            if args.mode == "produce"
            else read_gestures(client, data, args.expected_version)
        )
        # This boundary check uses the producing archive bytes and actual HTTP
        # handlers, including the preceding release's filename restriction.
        archive = (data / "moved.molweave.zip").read_bytes()
        legacy = client.post(
            "/api/v1/projects/import-archive",
            files={
                "file": ("qualification.molweave.zip", archive, "application/zip"),
            },
        )
        assert legacy.status_code == 201, legacy.text
        current = client.post(
            "/api/v1/projects/import-archive",
            files={
                "file": ("qualification.neistra.zip", archive, "application/zip"),
            },
        )
        assert current.status_code == (201 if args.expect_new_names else 422), current.text
        if not args.expect_new_names:
            assert current.json()["detail"]["code"] == "unsupported_project_archive_extension"
        result.update(
            application_version=APPLICATION_VERSION,
            implementation_root=str(implementation),
            api_module=molweave_api.main.__file__,
            core_module=molweave_core.molecular.__file__,
            legacy_suffix_http=legacy.status_code,
            new_suffix_http=current.status_code,
            expect_new_names=args.expect_new_names,
        )
        args.evidence.write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result, indent=2))
    finally:
        app.state.engine.dispose()


if __name__ == "__main__":
    main()
