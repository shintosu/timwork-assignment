import type { Metadata, Drawing as RawDrawing } from "../types/raw";
import type {
  DisciplineLayer,
  DrawingLayer,
  LayerKey,
  LayerNode,
  NormalizedMeta,
  RegionLayer,
  RegionRevisionLayer,
  SelfContainedRevisionLayer,
  SimpleRevisionLayer,
} from "../types/normalized";

import {
  makeDisciplineKey,
  makeDrawingKey,
  makeRegionKey,
  makeRevisionKey,
} from "../domain/layerKey";

// polygon mapping is inlined where used (avoid extra helper)

function pushRefGroup(
  refGroups: Record<string, LayerKey[]>,
  relativeTo: string | undefined,
  key: LayerKey,
) {
  if (!relativeTo) return;
  (refGroups[relativeTo] ??= []).push(key);
}

/**
 * Raw metadata.json(assignment shape) -> UI-friendly, lookup-friendly normalized model.
 *
 * Notes:
 * - We intentionally keep `drawingsById` as raw objects (unknown) to avoid over-coupling.
 * - All special cases are handled by emitting different `LayerNode` variants.
 */
export function normalizeMetadata(raw: Metadata): NormalizedMeta {
  const drawingsById: Record<string, unknown> = raw.drawings;
  const layersByKey: Record<LayerKey, LayerNode> = {};
  const childrenByParent: Record<string, string[]> = {};
  const referenceGroups: Record<string, LayerKey[]> = {};

  const drawingEntries: Array<[string, RawDrawing]> = Object.entries(
    raw.drawings ?? {},
  );

  for (const [drawingId, drawing] of drawingEntries) {
    // 1) Drawing layer
    const drawingLayer: DrawingLayer = {
      kind: "drawing",
      key: makeDrawingKey(drawingId),
      drawingId,
      drawingName: drawing.name,
      image: drawing.image,
    };
    layersByKey[drawingLayer.key] = drawingLayer;

    // 2) Drawing tree (parent -> children)
    const parentId = drawing.parent ?? "__root__";
    (childrenByParent[parentId] ??= []).push(drawingId);

    // 3) Disciplines / regions / revisions
    const disciplines = drawing.disciplines ?? {};

    for (const [disciplineKey, discipline] of Object.entries(disciplines)) {
      const disciplineImage =
        discipline.image ??
        // Some special cases (e.g. self-contained revisions) do not have discipline-level image.
        // We still allow a discipline layer for navigation by falling back to the first revision image.
        discipline.revisions?.[0]?.image ??
        drawing.image;

      const disciplineLayerKey = makeDisciplineKey(drawingId, disciplineKey);

      const disciplineLayer: DisciplineLayer = {
        kind: "discipline",
        key: disciplineLayerKey,
        drawingId,
        drawingName: drawing.name,
        discipline: disciplineKey,
        image: disciplineImage,
        imageTransform: discipline.imageTransform,
        polygon: discipline.polygon
          ? {
              vertices: discipline.polygon.vertices,
              transform: discipline.polygon.polygonTransform,
            }
          : undefined,
      };
      layersByKey[disciplineLayer.key] = disciplineLayer;

      // Overlay grouping is based on the reference (relativeTo) image.
      pushRefGroup(
        referenceGroups,
        disciplineLayer.imageTransform?.relativeTo,
        disciplineLayer.key,
      );

      // 3-A) Discipline-level revisions
      for (const rev of discipline.revisions ?? []) {
        const revisionKey = makeRevisionKey({
          drawingId,
          discipline: disciplineKey,
          revision: rev.version,
        });

        const revImage = rev.image;

        // Special case: revision carries its own transform + polygon (e.g. 주민공동시설 건축)
        if (rev.imageTransform && rev.polygon) {
          const node: SelfContainedRevisionLayer = {
            kind: "revision",
            variant: "selfContained",
            key: revisionKey,
            drawingId,
            drawingName: drawing.name,
            discipline: disciplineKey,
            revision: rev.version,
            date: rev.date,
            description: rev.description,
            changes: rev.changes,
            image: revImage,
            imageTransform: rev.imageTransform,
            polygon: {
              vertices: rev.polygon.vertices,
              transform: rev.polygon.polygonTransform,
            },
          };
          layersByKey[node.key] = node;

          pushRefGroup(
            referenceGroups,
            node.imageTransform.relativeTo,
            node.key,
          );
          continue;
        }

        const node: SimpleRevisionLayer = {
          kind: "revision",
          variant: "simple",
          key: revisionKey,
          drawingId,
          drawingName: drawing.name,
          discipline: disciplineKey,
          revision: rev.version,
          date: rev.date,
          description: rev.description,
          changes: rev.changes,
          image: revImage,
        };
        layersByKey[node.key] = node;

        // Simple revisions usually share the discipline's reference image.
        pushRefGroup(
          referenceGroups,
          disciplineLayer.imageTransform?.relativeTo,
          node.key,
        );
      }

      // 3-B) Regions (e.g. 구조 Region A/B)
      const regions = discipline.regions ?? {};
      for (const [regionKey, region] of Object.entries(regions)) {
        const regionLayerKey = makeRegionKey(
          drawingId,
          disciplineKey,
          regionKey,
        );

        const regionLayer: RegionLayer = {
          kind: "region",
          key: regionLayerKey,
          drawingId,
          drawingName: drawing.name,
          discipline: disciplineKey,
          region: regionKey,
          image: disciplineImage,
          polygon: region.polygon
            ? {
                vertices: region.polygon.vertices,
                transform: region.polygon.polygonTransform,
              }
            : undefined,
        };
        layersByKey[regionLayer.key] = regionLayer;

        // Region's own overlay grouping is typically tied to the discipline reference.
        pushRefGroup(
          referenceGroups,
          disciplineLayer.imageTransform?.relativeTo,
          regionLayer.key,
        );

        for (const rev of region.revisions ?? []) {
          const revisionKey = makeRevisionKey({
            drawingId,
            discipline: disciplineKey,
            region: regionKey,
            revision: rev.version,
          });

          if (!rev.imageTransform) {
            // Should be enforced by validation; skip if missing.
            continue;
          }

          const inheritedOrRevPolygon = rev.polygon ?? region.polygon;

          const node: RegionRevisionLayer = {
            kind: "revision",
            variant: "region",
            key: revisionKey,
            drawingId,
            drawingName: drawing.name,
            discipline: disciplineKey,
            region: regionKey,
            revision: rev.version,
            date: rev.date,
            description: rev.description,
            changes: rev.changes,
            image: rev.image,
            imageTransform: rev.imageTransform,
            polygon: inheritedOrRevPolygon
              ? {
                  vertices: inheritedOrRevPolygon.vertices,
                  transform: inheritedOrRevPolygon.polygonTransform,
                }
              : undefined,
          };
          layersByKey[node.key] = node;

          pushRefGroup(
            referenceGroups,
            node.imageTransform.relativeTo,
            node.key,
          );
        }
      }
    }
  }

  for (const ids of Object.values(childrenByParent)) {
    ids.sort();
  }
  for (const keys of Object.values(referenceGroups)) {
    keys.sort();
  }

  return {
    drawingsById,
    layersByKey,
    childrenByParent,
    referenceGroups,
  };
}
