import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { AppConfig } from '@/types/config';
import { logger } from '@/utils/logger';

function getAppRoot(): string {
  return process.cwd();
}

export function getConfigDir(): string {
  const appRoot = getAppRoot();
  const candidatePaths = ['config', '../config', '../../config'];
  const resolvedCandidatePaths = candidatePaths.map((relativePath) =>
    path.resolve(appRoot, relativePath),
  );
  const foundPath = resolvedCandidatePaths.find((fullPath) => {
    try {
      return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
    } catch (e) {
      logger.warn(`Error checking config path: ${fullPath}`, e);
      return false;
    }
  });
  return foundPath ?? path.resolve(appRoot, 'config');
}

export function getCacheDir(): string {
  const appRoot = getAppRoot();
  const candidatePaths = ['cache', '../cache', '../../cache'];
  const resolvedCandidatePaths = candidatePaths.map((relativePath) =>
    path.resolve(appRoot, relativePath),
  );
  const foundPath = resolvedCandidatePaths.find((fullPath) => {
    try {
      return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
    } catch (e) {
      logger.warn(`Error checking cache path: ${fullPath}`, e);
      return false;
    }
  });

  const finalPath = foundPath ?? path.resolve(appRoot, 'cache');
  ensureDirSync(finalPath); // Ensure cache dir always exists
  return finalPath;
}

// Resolves a path inside the config directory.
export function resolveFilesInConfigPath(...segments: string[]): string {
  return path.resolve(getConfigDir(), ...segments);
}

// Resolves a path inside the cache directory.
export function resolveFilesInCachePath(...segments: string[]): string {
  return path.resolve(getCacheDir(), ...segments);
}

// Ensures a directory exists (mkdir -p behavior).
export function ensureDirSync(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Ensures the parent directory for a file path exists.
export function ensureFileDirSync(filePath: string): void {
  ensureDirSync(path.dirname(filePath));
}

const appConfigPath = resolveFilesInConfigPath('config.yaml');
let config: AppConfig = {};

try {
  if (fs.existsSync(appConfigPath)) {
    const temp_data = fs.readFileSync(appConfigPath, 'utf8');
    config = yaml.load(temp_data) as AppConfig;
  }
} catch (e) {
  logger.error('Failed to load config.yaml', e);
}

const currency_unit_symbol = config.currency_unit_symbol || '$';
const pagination_limit = config.pagination_limit ? Number(config.pagination_limit) : 20;

export { currency_unit_symbol, pagination_limit, appConfigPath, config };
