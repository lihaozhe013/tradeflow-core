import { expect } from 'vitest';
import type { Response } from 'superagent';

export interface XlsxExportAssertion {
  status: number;
  contentType: string;
  contentDisposition: string;
  bufferLength: number;
}

export function assertXlsxExport(res: Response): XlsxExportAssertion {
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toContain(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  expect(res.headers['content-disposition']).toContain('attachment');
  const body: unknown = res.body;
  const length =
    typeof body === 'string' ? Buffer.byteLength(body) : body instanceof Buffer ? body.length : 0;
  expect(length).toBeGreaterThan(0);
  return {
    status: res.status,
    contentType: String(res.headers['content-type']),
    contentDisposition: String(res.headers['content-disposition']),
    bufferLength: length
  };
}

/** Flip a JSON body value to a different unique value using a suffix counter. */
export function uniqueSuffix(): string {
  return `t${Date.now()}${Math.floor(Math.random() * 1e6)}`;
}
