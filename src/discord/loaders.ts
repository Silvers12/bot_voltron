import { dirnameOf } from '../core/paths.js';
import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import type { Command, Event } from './types.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('loader');
const here = dirnameOf(import.meta.url);

async function importDir<T>(dirName: string): Promise<Array<{ file: string; mod: T }>> {
  const dir = path.join(here, dirName);
  const files = (await readdir(dir)).filter((f) => /\.(ts|js)$/.test(f) && !f.endsWith('.d.ts'));
  const out: Array<{ file: string; mod: T }> = [];
  for (const file of files) {
    const imported = await import(pathToFileURL(path.join(dir, file)).href);
    out.push({ file, mod: imported.default as T });
  }
  return out;
}

export async function loadCommands(): Promise<Map<string, Command>> {
  const commands = new Map<string, Command>();
  for (const { file, mod } of await importDir<Command>('commands')) {
    if (!mod?.data || !mod.execute) {
      log.warn(`${file} ignoré : export par défaut invalide`);
      continue;
    }
    commands.set(mod.data.name, mod);
  }
  return commands;
}

export async function loadEvents(): Promise<Event[]> {
  const events: Event[] = [];
  for (const { file, mod } of await importDir<Event>('events')) {
    if (!mod?.name || !mod.execute) {
      log.warn(`${file} ignoré : export par défaut invalide`);
      continue;
    }
    events.push(mod);
  }
  return events;
}
