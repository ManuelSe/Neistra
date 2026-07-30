from molweave_core.adapters.ligand import (
    Mol2Adapter,
    MolAdapter,
    SdfAdapter,
    SmilesAdapter,
    XyzAdapter,
)
from molweave_core.adapters.macromolecular import MmcifAdapter, PdbAdapter
from molweave_core.adapters.registry import AdapterRegistry


def create_default_registry() -> AdapterRegistry:
    return AdapterRegistry(
        [
            PdbAdapter(),
            MmcifAdapter(),
            SdfAdapter(),
            MolAdapter(),
            Mol2Adapter(),
            XyzAdapter(),
            SmilesAdapter(),
        ]
    )
