import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import type { Command } from './types.js';

declare module 'discord.js' {
  interface Client {
    commands: Collection<string, Command>;
  }
}

export function createClient(): Client {
  const client = new Client({
    // MessageContent (privilégié, à activer dans le portail) : lecture du contenu uniquement dans le salon de comptage.
    // Partials.Message : recevoir les modifications de messages non gardés en cache (salon de comptage).
    partials: [Partials.Message],
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.MessageContent],
  });
  client.commands = new Collection();
  return client;
}
