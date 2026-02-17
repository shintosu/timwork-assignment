import type { Metadata } from "../types/raw";

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

  // NOTE: We trust the assignment data shape at runtime for now.
  // TODO: setup zod type validation
  cached = json as Metadata;

  return cached;
}
