import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);

async function importDir(dirName) {
  const dir = path.join(here, dirName);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.js'));
  const modules = [];
  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(dir, file)).href);
    modules.push({ file, ...mod.default });
  }
  return modules;
}

/** Charge src/commands/*.js : chaque fichier exporte { data, execute }. */
export async function loadCommands() {
  const commands = new Map();
  for (const cmd of await importDir('commands')) {
    if (!cmd.data || !cmd.execute) {
      console.warn(`[commands] ${cmd.file} ignoré : il manque "data" ou "execute"`);
      continue;
    }
    commands.set(cmd.data.name, cmd);
  }
  return commands;
}

/** Charge src/events/*.js : chaque fichier exporte { name, once?, execute }. */
export async function loadEvents() {
  return (await importDir('events')).filter((evt) => {
    if (!evt.name || !evt.execute) {
      console.warn(`[events] ${evt.file} ignoré : il manque "name" ou "execute"`);
      return false;
    }
    return true;
  });
}
