import fs from 'fs';
import { ensureFileDirSync, resolveFilesInDataPath } from '@/utils/paths';

export interface CacheEntry {
  last_updated?: string;
  [key: string]: unknown;
}

export function generateCacheKey(
  startDate: string,
  endDate: string,
  customerCode?: string,
  productModel?: string,
  type: string = 'outbound',
): string {
  const customer = customerCode || 'All';
  const product = productModel || 'All';
  return `${type}_${startDate}_${endDate}_${customer}_${product}`;
}

export function generateDetailCacheKey(
  startDate: string,
  endDate: string,
  customerCode?: string,
  productModel?: string,
  type: string = 'outbound',
): string {
  const customer = customerCode || 'All';
  const product = productModel || 'All';
  return `detail_${type}_${startDate}_${endDate}_${customer}_${product}`;
}

export function getCacheFilePath(): string {
  return resolveFilesInDataPath('analysis-cache.json');
}

/**
 * Clear expired cache data (over 30 days)
 */
export function cleanExpiredCache(
  cacheData: Record<string, CacheEntry>,
): Record<string, CacheEntry> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const cleanedData: Record<string, CacheEntry> = {};
  let cleanedCount = 0;

  Object.entries(cacheData).forEach(([key, data]) => {
    if (data.last_updated) {
      const lastUpdated = new Date(data.last_updated);
      if (lastUpdated >= thirtyDaysAgo) {
        cleanedData[key] = data;
      } else {
        cleanedCount++;
      }
    } else {
      cleanedData[key] = data;
    }
  });

  if (cleanedCount > 0) {
    console.info(`Cleared ${cleanedCount} expired analysis caches`);
  }

  return cleanedData;
}

/**
 * Read analysis Cache Data
 */
export function readCache(): Record<string, CacheEntry> {
  const cacheFile = getCacheFilePath();
  if (fs.existsSync(cacheFile)) {
    const json = fs.readFileSync(cacheFile, 'utf-8');
    const cacheData = JSON.parse(json) as Record<string, CacheEntry>;
    return cleanExpiredCache(cacheData);
  }
  return {};
}

/**
 * write analysis Cache Data
 */
export function writeCache(cacheData: Record<string, CacheEntry>): boolean {
  const cacheFile = getCacheFilePath();
  // Ensure parent directory exists to avoid ENOENT
  ensureFileDirSync(cacheFile);
  const cleanedData = cleanExpiredCache(cacheData);
  fs.writeFileSync(cacheFile, JSON.stringify(cleanedData, null, 2), 'utf-8');
  return true;
}
