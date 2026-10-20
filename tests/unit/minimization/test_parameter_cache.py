from __future__ import annotations

import threading
import time

import pytest
from molweave_core.jobs import JobCancelled
from molweave_core.minimization.parameter_cache import ParameterCache, fingerprint

from tests.support.minimization import LocalContext


def prepare(cache, destination, key="model", context=None, build=None):
    def generate():
        destination.mkdir()
        (destination / "input.mol2").write_text(key * 100)
        return key * 100

    return cache.prepare(
        "organic",
        fingerprint(key),
        destination,
        context or LocalContext(destination.parent),
        build or generate,
        lambda: (destination / "input.mol2").read_text(),
    )


def test_verified_copies_survive_eviction_and_have_no_partial_publication(tmp_path):
    cache = ParameterCache(tmp_path / "cache", max_entries=1)
    first = prepare(cache, tmp_path / "first")
    assert first.provenance["stored"] and not first.provenance["hit"]
    hit = prepare(cache, tmp_path / "hit")
    assert hit.provenance["hit"] and hit.value == first.value
    prepare(cache, tmp_path / "second", "other")
    assert (tmp_path / "first/input.mol2").read_text() == first.value
    assert len(list(cache.root.glob("organic-*"))) == 1
    assert not list(cache.root.glob(".stage-*"))


@pytest.mark.parametrize("damage", ["checksum", "manifest", "regular_file"])
def test_corruption_is_an_explained_cold_miss(tmp_path, damage):
    cache = ParameterCache(tmp_path / "cache")
    prepare(cache, tmp_path / "initial")
    entry = next(cache.root.glob("organic-*"))
    if damage == "checksum":
        (entry / "input.mol2").write_text("corruption")
    elif damage == "manifest":
        (entry / "manifest.json").write_text('{"schema_version":999}')
    else:
        # Preserve the prior generated directory so the malformed replacement is reversible.
        entry.rename(tmp_path / "prior-cache-entry")
        entry.write_text("not a directory")
    context = LocalContext(tmp_path)
    restored = prepare(cache, tmp_path / "recovered", context=context)
    assert not restored.provenance["hit"] and restored.provenance["stored"]
    assert "Invalid parameter cache entry" in "\n".join(context.messages)
    assert restored.value == "model" * 100


def test_quota_includes_manifests_and_shrink_is_applied_on_reads(tmp_path):
    cache = ParameterCache(tmp_path / "cache", budget=1200)
    for index in range(3):
        prepare(cache, tmp_path / str(index), str(index))
    assert sum(p.stat().st_size for p in cache.root.rglob("*") if p.is_file()) <= 1200
    smaller = ParameterCache(cache.root, budget=200)
    result = prepare(smaller, tmp_path / "small")
    assert not result.provenance["stored"]
    assert sum(p.stat().st_size for p in cache.root.rglob("*") if p.is_file()) <= 200


def test_cancellation_while_another_preparation_owns_the_lock_does_not_poison_cache(tmp_path):
    first = ParameterCache(tmp_path / "cache")
    second = ParameterCache(first.root)
    entered, release = threading.Event(), threading.Event()
    errors = []
    values = []
    context = LocalContext(tmp_path)

    def build():
        entered.set()
        assert release.wait(5)
        destination = tmp_path / "first"
        destination.mkdir()
        (destination / "input.mol2").write_text("validated")
        return "validated"

    def run_first():
        try:
            values.append(prepare(first, tmp_path / "first", build=build))
        except BaseException as error:
            errors.append(error)

    def run_second():
        try:
            prepare(second, tmp_path / "cancelled", context=context)
        except BaseException as error:
            errors.append(error)

    owner = threading.Thread(target=run_first)
    waiter = threading.Thread(target=run_second)
    owner.start()
    try:
        assert entered.wait(5)
        waiter.start()
        time.sleep(0.1)
        context.cancelled = True
        waiter.join(2)
        assert not waiter.is_alive()
    finally:
        release.set()
        owner.join(5)
    assert len(errors) == 1 and isinstance(errors[0], JobCancelled)
    assert values[0].provenance["stored"]
    assert not (tmp_path / "cancelled").exists()
    assert prepare(second, tmp_path / "last").provenance["hit"]


def test_oversized_preparation_is_not_stored_or_used_to_evict_valid_entries(tmp_path):
    cache = ParameterCache(tmp_path / "cache")
    prepare(cache, tmp_path / "small")
    destination = tmp_path / "large"

    def build():
        destination.mkdir()
        with (destination / "input.mol2").open("wb") as stream:
            stream.truncate(16 * 1024**2 + 1)
        return "not cacheable"

    result = prepare(cache, destination, "large", build=build)
    assert result.value == "not cacheable" and not result.provenance["stored"]
    assert len(list(cache.root.glob("organic-*"))) == 1
    assert prepare(cache, tmp_path / "reused").provenance["hit"]
