export function generateBaseSlug(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');

  return slug || 'entity';
}
