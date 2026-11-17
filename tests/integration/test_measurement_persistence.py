from pathlib import Path

from tests.support.api_client import ApiClient
from tests.support.measurement_reader_qualification import produce_ordered, read_ordered


def test_ordered_cross_entry_measurements_keep_history_and_both_archive_suffixes(
    client: ApiClient,
    tmp_path: Path,
) -> None:
    produced = produce_ordered(client, tmp_path)
    assert produced["ordered_cross_entry_records"] == 3
    result = read_ordered(client, tmp_path)
    assert result["last_update_undo_redo_content_exact_modified_time_monotonic"] is True
    assert len(result["both_suffixes_import_and_reexport"]) == 4
