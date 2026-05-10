import { generateBaseSlug } from './slug.util';

describe('generateBaseSlug', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(generateBaseSlug('Acme Corporation')).toBe('acme-corporation');
  });

  it('strips special characters', () => {
    expect(generateBaseSlug("O'Brien & Sons")).toBe('obrien-sons');
  });

  it('collapses multiple spaces and hyphens', () => {
    expect(generateBaseSlug('Foo  --  Bar')).toBe('foo-bar');
  });

  it('trims leading/trailing hyphens', () => {
    expect(generateBaseSlug('  Hello World  ')).toBe('hello-world');
  });

  it('handles all-special-character input with fallback', () => {
    expect(generateBaseSlug('!!!')).toBe('entity');
  });

  it('handles empty string with fallback', () => {
    expect(generateBaseSlug('')).toBe('entity');
  });
});
