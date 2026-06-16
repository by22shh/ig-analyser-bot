export function stripSectionMarkers(value: string): string {
  return value
    .replace(/^\s*\[\[SECTION\]\]\s*\n?/gimu, "")
    .replace(/\[\[SECTION\]\]\s*/giu, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function stripSectionMarkersFromJson(value: unknown): unknown {
  if (typeof value === "string") return stripSectionMarkers(value);
  if (Array.isArray(value)) return value.map(stripSectionMarkersFromJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, stripSectionMarkersFromJson(item)])
  );
}
