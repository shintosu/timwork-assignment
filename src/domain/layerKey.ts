import type { LayerKey } from "../types/normalized";

export type LayerKeyKind = "drawing" | "discipline" | "region" | "revision";

export type ParsedLayerKey =
  | {
      kind: "drawing";
      drawingId: string;
    }
  | {
      kind: "discipline";
      drawingId: string;
      discipline: string;
    }
  | {
      kind: "region";
      drawingId: string;
      discipline: string;
      region: string;
    }
  | {
      kind: "revision";
      drawingId: string;
      discipline: string;
      region?: string;
      revision: string;
    };

/** drawing:{drawingId} */
export function makeDrawingKey(drawingId: string): LayerKey {
  return `drawing:${drawingId}`;
}

/** discipline:{drawingId}:{discipline} */
export function makeDisciplineKey(
  drawingId: string,
  discipline: string,
): LayerKey {
  return `discipline:${drawingId}:${discipline}`;
}

/** region:{drawingId}:{discipline}:{region} */
export function makeRegionKey(
  drawingId: string,
  discipline: string,
  region: string,
): LayerKey {
  return `region:${drawingId}:${discipline}:${region}`;
}

/** revision:{drawingId}:{discipline}:{region?}:{revision}
 * region이 없는 경우 빈 세그먼트("")를 유지한다.
 * e.g. revision:101:구조::REV1
 */
export function makeRevisionKey(params: {
  drawingId: string;
  discipline: string;
  revision: string;
  region?: string;
}): LayerKey {
  const regionSeg = params.region ?? "";
  return `revision:${params.drawingId}:${params.discipline}:${regionSeg}:${params.revision}`;
}

export function isLayerKey(value: string): value is LayerKey {
  return (
    value.startsWith("drawing:") ||
    value.startsWith("discipline:") ||
    value.startsWith("region:") ||
    value.startsWith("revision:")
  );
}

/**
 * 문자열 LayerKey를 구조화된 객체로 파싱한다.
 * 형식이 잘못된 경우 null 반환.
 */
export function parseLayerKey(key: LayerKey | string): ParsedLayerKey | null {
  const parts = key.split(":");
  const kind = parts[0] as LayerKeyKind | undefined;

  if (!kind) return null;

  switch (kind) {
    case "drawing": {
      if (parts.length !== 2) return null;
      const [, drawingId] = parts;
      if (!drawingId) return null;
      return { kind, drawingId };
    }

    case "discipline": {
      if (parts.length !== 3) return null;
      const [, drawingId, discipline] = parts;
      if (!drawingId || !discipline) return null;
      return { kind, drawingId, discipline };
    }

    case "region": {
      if (parts.length !== 4) return null;
      const [, drawingId, discipline, region] = parts;
      if (!drawingId || !discipline || !region) return null;
      return { kind, drawingId, discipline, region };
    }

    case "revision": {
      if (parts.length !== 5) return null;
      const [, drawingId, discipline, regionSeg, revision] = parts;
      if (!drawingId || !discipline || !revision) return null;
      return {
        kind,
        drawingId,
        discipline,
        region: regionSeg || undefined,
        revision,
      };
    }

    default:
      return null;
  }
}
