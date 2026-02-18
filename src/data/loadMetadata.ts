import type { Metadata } from "../types/raw";
import {
  validateMetadata,
  formatValidationIssues,
} from "../validation/validateMetadata.zod";

let cached: Metadata | null = null;

export async function loadMetadata(options?: {
  /** e.g. "/metadata.json". Defaults to Vite's public root path. */
  url?: string;
  /** Force re-fetch even if cached. */
  force?: boolean;
}): Promise<Metadata> {
  const url = options?.url ?? "/metadata.json";
  const force = options?.force ?? false;

  if (!force && cached) return cached;

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(
      `Failed to load metadata (${res.status} ${res.statusText}) from ${url}`,
    );
  }

  const json = (await res.json()) as unknown;

  const result = validateMetadata(json);

  if (!result.ok) {
    if (import.meta.env.DEV) {
      throw new Error(
        `metadata validation failed.\n${formatValidationIssues(result.errors)}`,
      );
    }
    // In production, log and proceed with raw data to avoid blocking UI.
    // Normalizer has defensive fallbacks.
    console.error("[metadata] validation errors:", result.errors);
    cached = json as Metadata;
    return cached;
  }

  if (result.warnings.length) {
    console.warn("[metadata] warnings:", result.warnings);
  }

  cached = result.data as Metadata;
  return cached;
}
