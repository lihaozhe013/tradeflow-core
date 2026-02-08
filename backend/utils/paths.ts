import fs from "fs";
import path from "path";

export function getAppRoot(): string {
  return process.cwd();
}

export function getDataDir(): string {
  const appRoot = getAppRoot();
  const candidatePaths = [
    'data',
    '../data',
    '../../data'
  ];
  for (const relativePath of candidatePaths) {
    const fullPath = path.resolve(appRoot, relativePath);
    try {
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
        return fullPath;
      }
    } catch (e) {
    }
  }
  return path.resolve(appRoot, "data");
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

// Optional: resolve a path in the log directory under data/log.
export function getLogDir(): string {
  return path.resolve(getDataDir(), "log");
}


const appConfigPath = resolveFilesInDataPath("appConfig.json");
let currency_unit_symbol = "¥";
try {
  if (fs.existsSync(appConfigPath)) {
    const temp_data = fs.readFileSync(appConfigPath, 'utf8');
    const json = JSON.parse(temp_data);
    if(json.currency_symbol) {
        currency_unit_symbol = json.currency_symbol;
    }
  }
} catch (e) {
}
export { currency_unit_symbol, appConfigPath };