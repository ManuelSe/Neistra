"""Isolated direct-plugin CPU qualification; does not measure browser latency."""

from __future__ import annotations

import argparse
import cProfile
import gc
import gzip
import hashlib
import io
import json
import os
import platform
import pstats
import resource
import statistics
import sys
import tempfile
import time
import tracemalloc
import zipfile
from importlib.metadata import version
from pathlib import Path


def digest(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    ).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--implementation-root", type=Path, required=True)
    parser.add_argument("--fixture-root", type=Path, required=True)
    parser.add_argument("--label", required=True)
    parser.add_argument("--profile", choices=["small", "pocket", "18k"], required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--repeats", type=int, default=5)
    parser.add_argument("--instrument", action="store_true")
    args = parser.parse_args()
    if args.repeats < 1:
        parser.error("--repeats must be positive")
    impl = args.implementation_root.resolve()
    sys.path.insert(0, str(impl / "packages/neistra_core/src"))
    started = time.perf_counter()
    from neistra_core.adapters.defaults import create_default_registry
    from neistra_core.jobs import InputArtifact, ResultArtifact
    from neistra_core.minimization.quick_contracts import QuickCapture, QuickParameters
    from neistra_core.minimization.quick_plugin import execute
    from neistra_core.selection import AtomReference, SelectionV1

    registry = create_default_registry()
    fixtures = args.fixture_root
    sources = {}
    fixture_hashes = {}
    if args.profile == "small":
        path = fixtures / "quick-minimization/New_molecule.sdf"
        data = path.read_bytes()
        fixture_hashes[str(path.relative_to(fixtures))] = hashlib.sha256(data).hexdigest()
        sources["ligand"] = registry.for_format("sdf").parse(data, path.name).structures[0]
    else:
        path = fixtures / "minimization/1stp-protein-prepared.pdb"
        data = path.read_bytes()
        fixture_hashes[str(path.relative_to(fixtures))] = hashlib.sha256(data).hexdigest()
        text = data.decode()
        for i in range(1 if args.profile == "pocket" else 8):
            # Match the native browser fixture construction, including 3dp PDB X.
            shifted = "\n".join(
                line[:30] + f"{float(line[30:38]) + 60 * i:8.3f}" + line[38:]
                if line.startswith(("ATOM  ", "HETATM"))
                else line
                for line in text.split("\n")
            )
            sources[f"protein-{i}"] = (
                registry.for_format("pdb").parse(shifted.encode(), f"protein-{i}.pdb").structures[0]
            )
        path = fixtures / "minimization/1stp-biotin-prepared.mol"
        data = path.read_bytes()
        fixture_hashes[str(path.relative_to(fixtures))] = hashlib.sha256(data).hexdigest()
        sources["ligand"] = registry.for_format("mol").parse(data, "biotin.mol").structures[0]
    captures, inputs, input_hashes = [], [], {}
    for key, source in sorted(sources.items()):
        data = source.to_bytes()
        sha = hashlib.sha256(data).hexdigest()
        input_hashes[key] = sha
        captures.append(
            QuickCapture(
                entry_id=key,
                artifact_id=f"artifact-{key}",
                sha256=sha,
                conformer_id=source.active_conformer_id,
                atom_ids=sorted(a.id for a in source.atoms),
            )
        )
        inputs.append(
            InputArtifact(
                entry_id=key,
                entry_name=key,
                structure_type=source.structure_type,
                role="calculation",
                artifact_id=f"artifact-{key}",
                sha256=sha,
                media_type="application/vnd.molweave.normalized-structure+json",
                filename=f"{key}.normalized.json",
                data=data,
            )
        )
    selection = SelectionV1(
        atoms=[
            AtomReference(structure_id="ligand", atom_id=atom.id)
            for atom in sources["ligand"].atoms
        ]
    )
    parameters = QuickParameters(
        requested_selection=selection,
        selection=selection,
        captured_inputs=captures,
        expand_hydrogens=True,
        max_iterations=500,
    )

    class Context:
        def __init__(self, directory):
            self.work_directory = directory
            self.messages = []

        def checkpoint(self):
            return None

        def is_cancelled(self):
            return False

        def progress(self, value, message):
            return None

        def stdout(self, message):
            self.messages.append(message)

        def stderr(self, message):
            self.messages.append(message)

        def sleep(self, seconds):
            return None

        def publish_artifact(self, **kwargs):
            return ResultArtifact(**kwargs)

    last_scientific = None

    def run_once():
        nonlocal last_scientific
        with tempfile.TemporaryDirectory(prefix="neistra137-c5-job-") as directory:
            context = Context(Path(directory))
            before = time.perf_counter()
            result = execute(parameters, tuple(inputs), context)
            elapsed = time.perf_counter() - before
            proposal = json.loads(next(a.data for a in result.artifacts if a.role == "proposal"))
            report = proposal["report"]
            model = next(a for a in result.artifacts if a.role == "model")
            with zipfile.ZipFile(io.BytesIO(model.data)) as archive:
                model_record = json.loads(archive.read("local-model.json"))
            stable_report = {
                k: v for k, v in report.items() if k not in {"timings", "elapsed_seconds"}
            }
            scientific = {
                "entries": proposal["entries"],
                "report": stable_report,
                "effective_field": result.values.get("effective_field"),
                "model": model_record,
            }
            last_scientific = scientific
            assert report["outcome"] in {"converged", "improved"}, report
            assert report["method"] == "MMFF94" and report["final_context_verified"]
            assert not report["geometry_violations"] and not report["new_severe_overlaps"]
            assert report["termination_kind"] != "budget_limit", report
            return {
                "execute_wall_seconds": elapsed,
                "report_elapsed_seconds": report["elapsed_seconds"],
                "stages": report["timings"],
                "iterations": report["iterations"],
                "evaluations": report["evaluations"],
                "outcome": report["outcome"],
                "termination_kind": report["termination_kind"],
                "modeled_atoms": sum(len(v) for v in report["modeled_atoms"].values()),
                "helpers": report["helper_count"],
                "caps": report["cap_count"],
                "scientific_sha256": digest(scientific),
                "peak_rss_bytes": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024,
            }

    samples = []
    for i in range(args.repeats + 1):
        gc.collect()
        row = run_once()
        row["phase"] = "cold" if i == 0 else "warm"
        samples.append(row)
    timings = [row["execute_wall_seconds"] for row in samples[1:]]
    assert len({row["scientific_sha256"] for row in samples}) == 1, samples
    instrument = {}
    if args.instrument:
        gc.collect()
        profiler = cProfile.Profile()
        profiler.enable()
        profiled = run_once()
        profiler.disable()
        output = io.StringIO()
        pstats.Stats(profiler, stream=output).strip_dirs().sort_stats("cumulative").print_stats(35)
        instrument["cprofile"] = output.getvalue()
        gc.collect()
        tracemalloc.start()
        measured = run_once()
        current, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        instrument.update(
            {
                "traced_current_bytes": current,
                "traced_peak_bytes": peak,
                "profiled_scientific_sha256": profiled["scientific_sha256"],
                "memory_scientific_sha256": measured["scientific_sha256"],
            }
        )
    roots = {
        name: str(Path(module.__file__).resolve())
        for name, module in sys.modules.items()
        if name.startswith(("neistra_core", "molweave_core")) and getattr(module, "__file__", None)
    }
    assert all(Path(path).is_relative_to(impl) for path in roots.values()), roots
    source_hashes = {
        str(path.relative_to(impl)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted((impl / "packages/neistra_core/src").rglob("*.py"))
    }
    scientific_path = args.output.with_name(args.output.stem + "-scientific.json.gz")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    scientific_path.write_bytes(
        gzip.compress(
            json.dumps(
                last_scientific, sort_keys=True, separators=(",", ":"), allow_nan=False
            ).encode(),
            mtime=0,
        )
    )
    result = {
        "label": args.label,
        "profile": args.profile,
        "implementation_root": str(impl),
        "benchmark_script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "scientific_document": scientific_path.name,
        "scientific_document_sha256": hashlib.sha256(scientific_path.read_bytes()).hexdigest(),
        "source_identity_sha256": digest(source_hashes),
        "source_identities": source_hashes,
        "fixtures": fixture_hashes,
        "input_sha256": input_hashes,
        "parameters_sha256": digest(parameters.model_dump(mode="json")),
        "captured_atoms": sum(len(source.atoms) for source in sources.values()),
        "samples": samples,
        "warm_median_seconds": statistics.median(timings),
        "warm_min_seconds": min(timings),
        "warm_max_seconds": max(timings),
        "versions": {name: version(name) for name in ("rdkit", "numpy", "scipy")},
        "python": platform.python_version(),
        "platform": platform.platform(),
        "cpu_count": os.cpu_count(),
        "cpu_model": next(
            (
                line.partition(":")[2].strip()
                for line in Path("/proc/cpuinfo").read_text().splitlines()
                if line.startswith("model name")
            ),
            platform.processor(),
        ),
        "memory_total_kib": next(
            (
                int(line.split()[1])
                for line in Path("/proc/meminfo").read_text().splitlines()
                if line.startswith("MemTotal:")
            ),
            None,
        ),
        "command": sys.argv,
        "load_average": os.getloadavg(),
        "elapsed_process_seconds": time.perf_counter() - started,
        "environment": {
            name: os.environ.get(name)
            for name in (
                "OPENBLAS_NUM_THREADS",
                "OMP_NUM_THREADS",
                "NEISTRA_PERFORMANCE",
                "NEISTRA_AMBERTOOLS_PREFIX",
            )
        },
        "instrumentation": instrument,
        "scope": (
            "direct plugin CPU including immutable-source read/assembly/optimization/serialization;"
            " "
            "excludes worker spawn, DB/API, browser and artifact-store publication"
        ),
    }
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(
        json.dumps(
            {
                key: result[key]
                for key in (
                    "label",
                    "profile",
                    "captured_atoms",
                    "warm_median_seconds",
                    "warm_min_seconds",
                    "warm_max_seconds",
                )
            }
        )
    )


if __name__ == "__main__":
    main()
