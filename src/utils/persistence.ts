/**
 * Persistence utility - JSON file-based storage for positions and state.
 * Stores data in the project's data/ directory (gitignored).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'data');

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function saveJson<T>(filename: string, data: T): void {
  ensureDataDir();
  const filePath = join(DATA_DIR, filename);
  try {
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Failed to save ${filename}:`, error);
  }
}

export function loadJson<T>(filename: string, defaultValue: T): T {
  const filePath = join(DATA_DIR, filename);
  try {
    if (!existsSync(filePath)) return defaultValue;
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`Failed to load ${filename}, using default:`, error);
    return defaultValue;
  }
}

export function deleteJson(filename: string): void {
  const filePath = join(DATA_DIR, filename);
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  } catch (error) {
    console.warn(`Failed to delete ${filename}:`, error);
  }
}
