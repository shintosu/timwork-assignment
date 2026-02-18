import type { z } from "zod";
import { MetadataZ, DrawingZ, DisciplineZ, RevisionZ, PolygonZ } from "./raw.zod";

export type ValidationIssue = {
  path: PropertyKey[];
  message: string;
};

export type ValidationOk = {
  ok: true;
  data: z.infer<typeof MetadataZ>;
  warnings: string[];
};

export type ValidationFail = {
  ok: false;
  errors: ValidationIssue[];
};

export type ValidationResult = ValidationOk | ValidationFail;

/**
 * Validate metadata.json against Zod schema + assignment-specific invariants.
 * - Hard errors (fail build in dev): key/id mismatch, missing parent, invalid discipline key, region revision missing imageTransform
 * - Soft warnings: imageTransform.relativeTo does not match a known image filename in dataset
 */
export function validateMetadata(json: unknown): ValidationResult {
  const parsed = MetadataZ.safeParse(json);
  if (!parsed.success) {
    const issues: ValidationIssue[] = parsed.error.issues.map((i) => ({
      path: i.path,
      message: i.message,
    }));
    return { ok: false, errors: issues };
  }

  const data: z.infer<typeof MetadataZ> = parsed.data;
  const errors: ValidationIssue[] = [];
  const warnings: string[] = [];

  const allowedDisciplines = new Set(data.disciplines.map((d) => d.name));

  // Collect known image filenames from drawing/discipline/revision nodes
  const knownImages = new Set<string>();

  type Drawing = z.infer<typeof DrawingZ>;
  type Discipline = z.infer<typeof DisciplineZ>;
  type Revision = z.infer<typeof RevisionZ>;
  type RegionEntry = { polygon?: z.infer<typeof PolygonZ>; revisions: Revision[] };
  type DrawingsMap = Record<string, Drawing>;
  type DisciplinesMap = Record<string, Discipline>;
  type RegionsMap = Record<string, RegionEntry>;

  const drawings = data.drawings as DrawingsMap;
  const emptyDisciplines: DisciplinesMap = {};
  const emptyRegions: RegionsMap = {};

  for (const k in drawings) {
    const d = drawings[k];
    knownImages.add(d.image);

    const disc = (d.disciplines ?? emptyDisciplines) as DisciplinesMap;

    // Rule: key === drawing.id
    if (k !== d.id) {
      errors.push({
        path: ["drawings", k, "id"],
        message: "drawings key must equal drawing.id",
      });
    }

    // Rule: parent exists
    if (d.parent && !(d.parent in data.drawings)) {
      errors.push({
        path: ["drawings", k, "parent"],
        message: `parent does not exist: ${d.parent}`,
      });
    }

    // Rule: discipline key must be allowed
    for (const discKeyName in disc) {
      if (!allowedDisciplines.has(discKeyName)) {
        errors.push({
          path: ["drawings", k, "disciplines", discKeyName],
          message: "unknown discipline key",
        });
      }
    }

    for (const _discKey in disc) {
      const discVal = disc[_discKey];
      if (discVal.image) knownImages.add(discVal.image);
      for (const rev of discVal.revisions) {
        knownImages.add(rev.image);
      }
      const regions = (discVal.regions ?? emptyRegions) as RegionsMap;
      for (const _regionKey in regions) {
        const region = regions[_regionKey];
        for (const rev of region.revisions) {
          knownImages.add(rev.image);
        }
      }
    }
  }

  // Soft check helper for relativeTo mapping
  const checkRelativeTo = (
    rel: string | undefined,
    path: (string | number)[],
  ) => {
    if (!rel) return;
    if (!knownImages.has(rel)) {
      warnings.push(
        `relativeTo not found among known images: ${rel} at ${path.join(".")}`,
      );
    }
  };

  // Hard rule: region revisions must have imageTransform
  for (const k in drawings) {
    const d = drawings[k];
    const disc = (d.disciplines ?? emptyDisciplines) as DisciplinesMap;

    for (const discKey in disc) {
      const discVal = disc[discKey];
      // Discipline-level relativeTo warning
      checkRelativeTo(discVal.imageTransform?.relativeTo, [
        "drawings",
        k,
        "disciplines",
        discKey,
        "imageTransform",
        "relativeTo",
      ]);

      // Revision-level relativeTo warning
      for (let idx = 0; idx < discVal.revisions.length; idx++) {
        const rev = discVal.revisions[idx]!;
        checkRelativeTo(rev.imageTransform?.relativeTo, [
          "drawings",
          k,
          "disciplines",
          discKey,
          "revisions",
          idx,
          "imageTransform",
          "relativeTo",
        ]);
      }

      // Regions
      const regions = (discVal.regions ?? emptyRegions) as RegionsMap;
      for (const regionKey in regions) {
        const regionVal = regions[regionKey];
        for (let idx = 0; idx < regionVal.revisions.length; idx++) {
          const rev = regionVal.revisions[idx]!;
          if (!rev.imageTransform) {
            errors.push({
              path: [
                "drawings",
                k,
                "disciplines",
                discKey,
                "regions",
                regionKey,
                "revisions",
                idx,
                "imageTransform",
              ],
              message: "region revision requires imageTransform",
            });
          }
          checkRelativeTo(rev.imageTransform?.relativeTo, [
            "drawings",
            k,
            "disciplines",
            discKey,
            "regions",
            regionKey,
            "revisions",
            idx,
            "imageTransform",
            "relativeTo",
          ]);
        }
      }
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, data, warnings };
}

export function formatValidationIssues(issues: ValidationIssue[]): string {
  return issues
    .map((i) => {
      const path = i.path.map((seg) =>
        typeof seg === "symbol" ? seg.toString() : String(seg),
      );
      return `- ${path.join(".")} :: ${i.message}`;
    })
    .join("\n");
}
