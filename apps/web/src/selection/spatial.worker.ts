/// <reference lib="webworker" />

import {
  computeSpatialSelection,
  type SpatialRequest,
} from "./spatial";

self.onmessage = (event: MessageEvent<SpatialRequest>) => {
  self.postMessage(computeSpatialSelection(event.data));
};
