import type { ButtonInteraction, GuildMember } from 'discord.js';
import type { Member } from '../generated/prisma/client.js';

export interface ButtonContext {
  interaction: ButtonInteraction<'cached'>;
  guildMember: GuildMember;
  member: Member;
}

type ButtonHandler = (ctx: ButtonContext) => Promise<void>;

const buttonHandlers = new Map<string, ButtonHandler>();

/** Associe un identifiant de bouton (customId) à son traitement. */
export function registerButton(customId: string, handler: ButtonHandler) {
  buttonHandlers.set(customId, handler);
}

export function getButtonHandler(customId: string): ButtonHandler | undefined {
  return buttonHandlers.get(customId);
}
