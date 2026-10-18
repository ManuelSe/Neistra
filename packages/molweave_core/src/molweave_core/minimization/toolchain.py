"""Operator-installed native tooling. Jobs never download or install software."""

from __future__ import annotations

import hashlib
import json
import os
import platform
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path

from molweave_core.jobs import JobContext
from molweave_core.minimization.contracts import CalculationError

BUILD = "cuda_None_nompi_py312h4265c8b_104"
PACKAGE_SHA256 = "ce9fdcbdba9d665cb1d85f4d9df1c4bc70770a20b4ce25b43d69381f3027bfef"
PROGRAMS = ("antechamber", "sqm", "am1bcc", "atomtype", "bondtype", "tleap")
NATIVE_FILES = (
    *(f"bin/{name}" for name in PROGRAMS),
    "bin/teLeap",
    "amber.sh",
    *(f"bin/wrapped_progs/{name}" for name in ("antechamber", "am1bcc", "atomtype", "bondtype")),
)
DATA_FILES = (
    "dat/leap/parm/gaff.dat",
    "dat/antechamber/BCCPARM.DAT",
    "dat/leap/cmd/leaprc.gaff",
    "dat/leap/cmd/leaprc.protein.ff14SB",
    "dat/leap/parm/frcmod.ff14SB",
    "dat/leap/parm/parm10.dat",
    "dat/leap/parm/frcmod.tip3p",
    "dat/leap/lib/amino12.lib",
    "dat/leap/lib/aminont12.lib",
    "dat/leap/lib/aminoct12.lib",
    "dat/leap/lib/solvents.lib",
    "dat/antechamber/APS.DAT",
    "dat/antechamber/ATCOR.DAT",
    "dat/antechamber/ATOMTYPE_BCC.DEF",
    "dat/antechamber/ATOMTYPE_GFF.DEF",
    "dat/antechamber/ATOMTYPE_CHECK.TAB",
    "dat/antechamber/BONDTYPE_CHECK.TAB",
    "dat/antechamber/ATOM_EQU.TYPE",
    "dat/antechamber/CONNECT.TPL",
)


@dataclass(frozen=True)
class AmberTools:
    prefix: Path
    provenance: dict[str, object]

    @classmethod
    def discover(cls, prefix: Path | None = None) -> AmberTools:
        if platform.system() != "Linux" or platform.machine() != "x86_64":
            raise CalculationError(
                "toolchain_platform", "This model is qualified for Linux x86-64."
            )
        configured = os.environ.get("MOLWEAVE_AMBERTOOLS_PREFIX")
        if prefix is None and not configured:
            raise CalculationError(
                "toolchain_unavailable",
                "Install the locked AmberTools environment and set "
                "MOLWEAVE_AMBERTOOLS_PREFIX for both API and worker.",
            )
        root = (prefix or Path(str(configured))).resolve()
        try:
            metadata = json.loads((root / f"conda-meta/ambertools-24.8-{BUILD}.json").read_text())
            if metadata.get("sha256") != PACKAGE_SHA256:
                raise ValueError("AmberTools package checksum differs from the qualified build")
            paths = [*NATIVE_FILES, *DATA_FILES]
            checksums = {
                name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in paths
            }
            if "Version 1.81" not in (root / DATA_FILES[0]).read_text().splitlines()[0]:
                raise ValueError("Expected GAFF 1.81 parameter data")
            if any(not os.access(root / "bin" / name, os.X_OK) for name in PROGRAMS):
                raise ValueError("Native program is not executable")
            packages = sorted(
                (json.loads(p.read_text()) for p in (root / "conda-meta").glob("*.json")),
                key=lambda p: str(p.get("name")),
            )
            environment = [
                {k: p.get(k) for k in ("name", "version", "build", "sha256")} for p in packages
            ]
            environment_digest = hashlib.sha256(
                json.dumps(environment, sort_keys=True, separators=(",", ":")).encode()
            ).hexdigest()
            qualified = json.loads(Path(__file__).with_name("amber-local-v1.json").read_text())
            if (
                checksums != qualified["files"]
                or environment_digest != qualified["environment_sha256"]
            ):
                raise ValueError(
                    "Native programs, scientific data or dependencies differ from the model lock"
                )
        except (OSError, ValueError, KeyError) as error:
            raise CalculationError(
                "toolchain_invalid", f"Invalid locked AmberTools: {error}"
            ) from error
        return cls(
            root,
            {
                "ambertools": "24.8",
                "build": BUILD,
                "package_sha256": PACKAGE_SHA256,
                "files": checksums,
                "environment": environment,
                "environment_sha256": environment_digest,
                "lock_sha256": qualified["lock_sha256"],
            },
        )

    def run(
        self,
        program: str,
        arguments: list[str],
        directory: Path,
        context: JobContext,
        deadline: float,
    ) -> str:
        if program not in {"antechamber", "tleap"}:
            raise ValueError("Program is not an allowlisted parameterization entry point")
        context.checkpoint()
        environment = {
            **os.environ,
            "AMBERHOME": str(self.prefix),
            "PATH": f"{self.prefix / 'bin'}:{os.defpath}",
            "OMP_NUM_THREADS": "1",
            "OPENBLAS_NUM_THREADS": "1",
        }
        log_path = directory / f"{program}.log"
        with log_path.open("wb") as log:
            process = subprocess.Popen(
                [str(self.prefix / "bin" / program), *arguments],
                cwd=directory,
                env=environment,
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=log,
            )
            try:
                while process.poll() is None:
                    context.checkpoint()
                    if time.monotonic() >= deadline:
                        raise CalculationError(
                            "parameterization_timeout", "Parameterization exceeded 240 seconds"
                        )
                    if log_path.stat().st_size > 8 * 1024 * 1024:
                        raise CalculationError(
                            "native_log_limit", "Native calculation log exceeded 8 MiB"
                        )
                    time.sleep(0.02)
            finally:
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=0.5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=1)
        if log_path.stat().st_size > 8 * 1024 * 1024:
            raise CalculationError("native_log_limit", "Native calculation log exceeded 8 MiB")
        text = log_path.read_text(errors="replace")
        context.stdout(f"{program}: exited {process.returncode}; detailed log retained")
        if process.returncode:
            raise CalculationError(
                "parameterization_failed", f"{program} failed; inspect its calculation log"
            )
        return text
