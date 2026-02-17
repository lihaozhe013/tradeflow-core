import fs from 'fs';
import { ensureFileDirSync, resolveFilesInDataPath } from '@/utils/paths';

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
export function cleanExpiredCache<T extends Record<string, any>>(cacheData: T): T {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const cleanedData: Record<string, any> = {};
  let cleanedCount = 0;

  Object.entries(cacheData).forEach(([key, data]) => {
    const d: any = data as any;
    if (d && d.last_updated) {
      const lastUpdated = new Date(d.last_updated);
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
    console.log(`Cleared ${cleanedCount} expired analysis caches`);
  }

  return cleanedData as T;
}

/**
 * Read analysis Cache Data
 */
export function readCache(): Record<string, any> {
  const cacheFile = getCacheFilePath();
  if (fs.existsSync(cacheFile)) {
    try {
      const json = fs.readFileSync(cacheFile, 'utf-8');
      const cacheData = JSON.parse(json);
      return cleanExpiredCache(cacheData);
    } catch (e) {
      console.error('Failed to read the analysis cache:', e);
      return {};
    }
  }
  return {};
}

/**
 * write analysis Cache Data
 */
export function writeCache(cacheData: Record<string, any>): boolean {
  const cacheFile = getCacheFilePath();
  try {
    // Ensure parent directory exists to avoid ENOENT
    ensureFileDirSync(cacheFile);
    const cleanedData = cleanExpiredCache(cacheData);
    fs.writeFileSync(cacheFile, JSON.stringify(cleanedData, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Failed to write the analysis cache:', e);
    return false;
  }
}
