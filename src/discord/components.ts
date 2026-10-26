import type { ButtonInteraction, GuildMember, ModalSubmitInteraction, StringSelectMenuInteraction } from 'discord.js';
import type { Member } from '../generated/prisma/client.js';

export interface ButtonContext {
  interaction: ButtonInteraction<'cached'>;
  guildMember: GuildMember;
  member: Member;
  /** Partie variable du customId pour un bouton enregistré par préfixe */
  arg: string;
}

export interface SelectContext {
  interaction: StringSelectMenuInteraction<'cached'>;
  guildMember: GuildMember;
  member: Member;
  values: string[];
}

export interface ModalContext {
  interaction: ModalSubmitInteraction<'cached'>;
  guildMember: GuildMember;
  member: Member;
  /** Partie variable du customId */
  arg: string;
}

type ModalHandler = (ctx: ModalContext) => Promise<void>;
const modalPrefixes: Array<{ prefix: string; handler: ModalHandler }> = [];

/** Formulaire (modale) dont le customId est `prefix + argument`. */
export function registerModalPrefix(prefix: string, handler: ModalHandler) {
  modalPrefixes.push({ prefix, handler });
}

export function resolveModal(customId: string): { handler: ModalHandler; arg: string } | undefined {
  const byPrefix = modalPrefixes.find((p) => customId.startsWith(p.prefix));
  return byPrefix ? { handler: byPrefix.handler, arg: customId.slice(byPrefix.prefix.length) } : undefined;
}

type ButtonHandler = (ctx: ButtonContext) => Promise<void>;
type SelectHandler = (ctx: SelectContext) => Promise<void>;

const buttons = new Map<string, ButtonHandler>();
const buttonPrefixes: Array<{ prefix: string; handler: ButtonHandler }> = [];
const selects = new Map<string, SelectHandler>();

/** Bouton à identifiant exact. */
export function registerButton(customId: string, handler: ButtonHandler) {
  buttons.set(customId, handler);
}

/** Bouton dont le customId est `prefix + argument` (ex. `shop:buy:<itemId>`). */
export function registerButtonPrefix(prefix: string, handler: ButtonHandler) {
  buttonPrefixes.push({ prefix, handler });
}

export function registerSelect(customId: string, handler: SelectHandler) {
  selects.set(customId, handler);
}

export function resolveButton(customId: string): { handler: ButtonHandler; arg: string } | undefined {
  const exact = buttons.get(customId);
  if (exact) return { handler: exact, arg: '' };
  const byPrefix = buttonPrefixes.find((p) => customId.startsWith(p.prefix));
  return byPrefix ? { handler: byPrefix.handler, arg: customId.slice(byPrefix.prefix.length) } : undefined;
}

export function resolveSelect(customId: string): SelectHandler | undefined {
  return selects.get(customId);
}
