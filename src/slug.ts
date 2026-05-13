const MAX_SLUG_LEN = 32;

export function slugify(input: string): string {
  const s = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const capped = s.slice(0, MAX_SLUG_LEN).replace(/-+$/g, "");
  return capped || "pin";
}

export function uniqueAlias(base: string, taken: Set<string>): string {
  const slug = slugify(base);
  if (!taken.has(slug)) return slug;
  let i = 2;
  while (taken.has(`${slug}-${i}`)) i++;
  return `${slug}-${i}`;
}
