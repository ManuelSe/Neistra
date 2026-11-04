"""Legacy worker entry point; preserve both imports and python -m execution."""

import importlib
import sys

if __name__ == "__main__":
    from neistra_api.worker import main

    main()
else:
    sys.modules[__name__] = importlib.import_module("neistra_api.worker")
