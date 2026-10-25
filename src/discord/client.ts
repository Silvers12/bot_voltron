import { Client, Collection, GatewayIntentBits } from 'discord.js';
import type { Command } from './types.js';

declare module 'discord.js' {
  interface Client {
    commands: Collection<string, Command>;
  }
}

export function createClient(): Client {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates],
  });
  client.commands = new Collection();
  return client;
}
