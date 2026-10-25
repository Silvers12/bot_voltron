import type { ChatInputCommandInteraction, Client, ClientEvents, GuildMember, RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import type { Member } from '../generated/prisma/client.js';

/** Contexte fourni à chaque commande : le membre est déjà créé/à jour en base. */
export interface CommandContext {
  interaction: ChatInputCommandInteraction<'cached'>;
  guildMember: GuildMember;
  member: Member;
}

export interface Command {
  data: { name: string; toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody };
  execute(ctx: CommandContext): Promise<void>;
}

export interface Event<K extends keyof ClientEvents = keyof ClientEvents> {
  name: K;
  once?: boolean;
  execute(client: Client<true>, ...args: ClientEvents[K]): Promise<void> | void;
}

export function defineCommand(command: Command): Command {
  return command;
}

export function defineEvent<K extends keyof ClientEvents>(event: Event<K>): Event<K> {
  return event;
}
