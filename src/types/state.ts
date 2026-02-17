import type { LayerKey } from "./normalized";

export type AppState = {
  data: {
    status: "idle" | "loading" | "ready" | "error";
  };

  nav: {
    selectedKey?: LayerKey;
  };

  viewer: {
    baseKey?: LayerKey;
    overlayKey?: LayerKey;
    overlayOpacity: number;
    alignMode: "none" | "imageTransform";
  };
};
