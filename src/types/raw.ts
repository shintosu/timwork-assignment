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
  polygonTransform: Transform;
};

export type Revision = {
  version: string;
  image: string;
  date: string;
  description: string;
  changes: string[];
  imageTransform?: ImageTransform;
  polygon?: Polygon;
};

export type Discipline = {
  image?: string;
  imageTransform?: ImageTransform;
  polygon?: Polygon;

  regions?: Record<
    string,
    {
      polygon?: Polygon;
      revisions: Revision[];
    }
  >;

  revisions: Revision[];
};

export type Drawing = {
  id: string;
  name: string;
  image: string;
  parent: string | null;
  position: {
    vertices: [number, number][];
    imageTransform: Transform;
  } | null;

  disciplines?: Record<string, Discipline>;
};

export type Metadata = {
  project: {
    name: string;
    unit: string;
  };

  disciplines: { name: string }[];

  drawings: Record<string, Drawing>;
};
