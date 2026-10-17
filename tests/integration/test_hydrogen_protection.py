from molweave_core.hydrogen_protection import protection_facts
from molweave_core.molecular import NormalizedStructureV1

from tests.integration.test_archive_roundtrip import export_archive, import_archive
from tests.integration.test_ligand_edits import structure
from tests.support.api_client import ApiClient
from tests.support.editing_fixture import build_fixture
from tests.support.hydrogen_fixture import model


def test_protection_extension_survives_native_archive_and_originals(client: ApiClient) -> None:
    before = model("[2H]CC")
    project = import_archive(client, build_fixture(before))["project"]
    entry = project["entries"][0]
    original_path = f"/api/v1/projects/{project['id']}/entries/{entry['id']}/original"
    original = client.get(original_path).content
    archive = export_archive(client, project["id"], "protected")
    reopened = import_archive(client, client.get(archive["artifact"]["download_url"]).content)[
        "project"
    ]
    retained = NormalizedStructureV1.model_validate(
        structure(client, reopened["id"], reopened["entries"][0]["id"])
    )
    assert retained == before
    assert any(f.isotope == 2 for f in protection_facts(retained).values())
    assert client.get(original_path).content == original
