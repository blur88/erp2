import { Response } from 'express';

export function normalizeIds(value: string | string[] | undefined): string[] | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value : [value];
}

export function toDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  return new Date(value);
}

export function sendExcel(res: Response, buffer: Buffer, name: string): void {
  const date = new Date().toISOString().split('T')[0];
  const safeName = encodeURIComponent(name);
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${safeName}-${date}.xlsx"; filename*=UTF-8''${safeName}-${date}.xlsx`,
  });
  res.send(buffer);
}
