import { z } from "zod";

const FilenameZ = z.string().transform((f) =>
  f.startsWith("/drawings/") ? f : `/drawings/${f}`,
);

export const TransformZ = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  scale: z.number().default(1),
  rotation: z.number().default(0),
});

export const ImageTransformZ = TransformZ.extend({
  relativeTo: z
    .string()
    .optional()
    .transform((f) => (f ? (f.startsWith("/drawings/") ? f : `/drawings/${f}`) : undefined)),
});

export const PolygonZ = z.object({
  vertices: z.array(z.tuple([z.number(), z.number()])),
  polygonTransform: TransformZ,
});

export const RevisionZ = z.object({
  version: z.string(),
  image: FilenameZ,
  date: z.string(),
  description: z.string(),
  changes: z.array(z.string()),
  imageTransform: ImageTransformZ.optional(),
  polygon: PolygonZ.optional(),
});

export const DisciplineZ = z.object({
  image: FilenameZ.optional(),
  imageTransform: ImageTransformZ.optional(),
  polygon: PolygonZ.optional(),
  regions: z
    .record(
      z.string(),
      z.object({
        polygon: PolygonZ.optional(),
        revisions: z.array(RevisionZ).min(1),
      }),
    )
    .optional(),
  // 일부 공종(예: 구조)은 리전 하위에서만 리비전을 관리하므로 누락될 수 있다.
  // 누락 시 빈 배열로 정칙화하여 일관된 접근 보장.
  revisions: z.array(RevisionZ).default([]),
});

export const DrawingZ = z.object({
  id: z.string(),
  name: z.string(),
  image: FilenameZ,
  parent: z.string().nullable(),
  position: z
    .object({
      vertices: z.array(z.tuple([z.number(), z.number()])),
      imageTransform: TransformZ,
    })
    .nullable(),
  disciplines: z.record(z.string(), DisciplineZ).optional(),
});

export const MetadataZ = z.object({
  project: z.object({ name: z.string(), unit: z.string() }),
  disciplines: z.array(z.object({ name: z.string() })),
  drawings: z.record(z.string(), DrawingZ),
});

export type MetadataZType = z.infer<typeof MetadataZ>;
