import type { Guild } from 'discord.js';
import type { CommandIds } from './help.view.js';

const cache = new Map<string, CommandIds>();

/** Identifiants des commandes enregistrées sur le serveur (mis en cache ; vide si Discord ne répond pas). */
export async function commandIds(guild: Guild): Promise<CommandIds> {
  const hit = cache.get(guild.id);
  if (hit) return hit;
  const ids = new Map<string, string>();
  try {
    for (const cmd of (await guild.commands.fetch()).values()) ids.set(cmd.name, cmd.id);
  } catch {
    // sans identifiants, le guide affiche les commandes en texte simple
  }
  cache.set(guild.id, ids);
  return ids;
}
