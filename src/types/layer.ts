export type RenderableLayer = {
  key: string;
  imageSrc: string;

  opacity: number;

  transform: {
    x: number;
    y: number;
    scale: number;
    rotation: number;
  };

  meta: {
    drawingName?: string;
    discipline?: string;
    revision?: string;
  };
};
