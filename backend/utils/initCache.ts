import fs from 'fs';
import { resolveFilesInCachePath } from './paths';

export function initCacheFiles() {
  const cacheFiles = [
    { name: 'analysis-cache.json', defaultContent: '{}' },
    { name: 'invoice-cache.json', defaultContent: '{}' },
    { name: 'overview-stats.json', defaultContent: '{}' }
  ];

  for (const file of cacheFiles) {
    const filePath = resolveFilesInCachePath(file.name);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, file.defaultContent, 'utf8');
    }
  }
}
