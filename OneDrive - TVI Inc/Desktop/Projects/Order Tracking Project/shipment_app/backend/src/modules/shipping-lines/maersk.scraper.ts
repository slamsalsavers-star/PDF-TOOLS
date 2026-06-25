import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER_SCRIPT = path.resolve(__dirname, '../../../../scripts/maersk_scraper.js');

export async function runScraper(bookingNumber: string, _line: Record<string, unknown>) {
  try {
    const { stdout, stderr } = await execFileAsync('node', [SCRAPER_SCRIPT, bookingNumber], {
      timeout: 60_000,
    });

    const raw = stdout + stderr;
    const jsonStart = raw.indexOf('{');
    if (jsonStart === -1) {
      return { success: false, error: 'Scraper returned no JSON output' };
    }

    const data = JSON.parse(raw.slice(jsonStart));
    return data;
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Scraper failed' };
  }
}
