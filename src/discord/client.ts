import { Client, Collection, GatewayIntentBits } from 'discord.js';
import type { Command } from './types.js';

declare module 'discord.js' {
  interface Client {
    commands: Collection<string, Command>;
  }
}

export function createClient(): Client {
  const client = new Client({
    // MessageContent (privilégié, à activer dans le portail) : lecture du contenu uniquement dans le salon de comptage.
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.MessageContent],
  });
  client.commands = new Collection();
  return client;
}
