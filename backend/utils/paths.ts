import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { AppConfig } from '@/types/config';

function getAppRoot(): string {
  return process.cwd();
}

export function getDataDir(): string {
  const appRoot = getAppRoot();
  const candidatePaths = ['data', '../data', '../../data'];

  const resolvedCandidatePaths = candidatePaths.map((relativePath) =>
    path.resolve(appRoot, relativePath),
  );

  const foundPath = resolvedCandidatePaths.find((fullPath) => {
    try {
      return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
    } catch (e) {
      return false;
    }
  });

  return foundPath ?? path.resolve(appRoot, 'data');
}

// Resolves a path inside the data directory.
export function resolveFilesInDataPath(...segments: string[]): string {
  return path.resolve(getDataDir(), ...segments);
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

const appConfigPath = resolveFilesInDataPath('appConfig.yaml');
let config: AppConfig = {};

try {
  if (fs.existsSync(appConfigPath)) {
    const temp_data = fs.readFileSync(appConfigPath, 'utf8');
    config = yaml.load(temp_data) as AppConfig;
  }
} catch (e) {
  console.error('Failed to load appConfig.yaml', e);
}

const currency_unit_symbol = config.currency_unit_symbol || '$';
const pagination_limit = config.pagination_limit ? Number(config.pagination_limit) : 20;

export { currency_unit_symbol, pagination_limit, appConfigPath, config };
