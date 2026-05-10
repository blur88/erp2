export function generateBaseSlug(input: string): string {
  const safe = input.slice(0, 256).toLowerCase();
  let result = '';
  let prevDash = false;

  for (const ch of safe) {
    const code = ch.charCodeAt(0);
    if ((code >= 97 && code <= 122) || (code >= 48 && code <= 57)) {
      result += ch;
      prevDash = false;
    } else if (ch === ' ' || ch === '-' || ch === '_') {
      if (!prevDash) {
        result += '-';
        prevDash = true;
      }
    }
  }

  let start = 0;
  let end = result.length;
  while (start < end && result[start] === '-') start++;
  while (end > start && result[end - 1] === '-') end--;
  return result.slice(start, end) || 'entity';
}
