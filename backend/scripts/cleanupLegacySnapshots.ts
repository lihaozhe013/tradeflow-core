import fs from 'node:fs';
import path from 'node:path';
import { getCacheDir, getConfigDir } from '@/utils/paths';

const cacheDir = getCacheDir();
const targets = new Set([
  path.join(cacheDir, 'overview-stats.json'),
  path.join(cacheDir, 'invoice-cache.json'),
  path.join(getConfigDir(), 'invoice-cache.json')
]);

for (const target of targets) {
  try {
    if (!fs.lstatSync(target).isFile()) throw new Error('Expected a regular legacy snapshot file.');
    fs.unlinkSync(target);
    console.info(`Removed legacy business snapshot file: ${target}`);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') continue;
    throw error;
  }
}
