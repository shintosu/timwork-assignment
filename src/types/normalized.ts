export type LayerKey = string;

export type Transform = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

export type ImageTransform = Transform & {
  relativeTo?: string;
};

export type Polygon = {
  vertices: [number, number][];
  transform: Transform;
};

type LayerBase = {
  key: LayerKey;
  drawingId: string;
  drawingName: string;
  image: string;
};

export type DrawingLayer = LayerBase & {
  kind: "drawing";
};

export type DisciplineLayer = LayerBase & {
  kind: "discipline";
  discipline: string;
  imageTransform?: ImageTransform;
  polygon?: Polygon;
};

export type RegionLayer = LayerBase & {
  kind: "region";
  discipline: string;
  region: string;
  polygon?: Polygon;
};

type RevisionLayerBase = LayerBase & {
  kind: "revision";
  discipline: string;
  revision: string;
  date?: string;
  description?: string;
  changes?: string[];
};

export type SimpleRevisionLayer = RevisionLayerBase & {
  variant: "simple";
  region?: never;
  imageTransform?: never;
  polygon?: never;
};

export type RegionRevisionLayer = RevisionLayerBase & {
  variant: "region";
  region: string;
  imageTransform: ImageTransform;
  polygon?: Polygon;
};

export type SelfContainedRevisionLayer = RevisionLayerBase & {
  variant: "selfContained";
  region?: never;
  imageTransform: ImageTransform;
  polygon: Polygon;
};

export type LayerNode =
  | DrawingLayer
  | DisciplineLayer
  | RegionLayer
  | SimpleRevisionLayer
  | RegionRevisionLayer
  | SelfContainedRevisionLayer;

export type NormalizedMeta = {
  drawingsById: Record<string, unknown>;

  layersByKey: Record<LayerKey, LayerNode>;

  childrenByParent: Record<string, string[]>;

  // relativeTo 기준으로 오버레이 후보 찾기
  referenceGroups: Record<string, LayerKey[]>;
};
