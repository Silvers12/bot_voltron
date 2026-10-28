import { randomInt } from 'node:crypto';
import { userMention, type Message } from 'discord.js';
import { prisma } from '../../infrastructure/prisma.js';
import { createLogger } from '../../core/logger.js';
import { isAllowedGuild } from '../../core/config.js';
import { ensureMember } from '../community/member.service.js';
import { getBalance, debit } from '../economy/economy.service.js';
import { formatAmount, getSettings } from '../settings/settings.service.js';
import { isFeatureEnabled } from '../features/features.js';
import { evaluateExpression } from './expression.js';
import type { Counting } from '../../generated/prisma/client.js';

import { botName } from '../../core/identity.js';
const log = createLogger('comptage');

export const CHECK = '✅';
export const CROSS = '❌';
/** Identifiant de compteur réservé à Voltron lui-même (jamais un id de membre). */
const SELF_ID = 'voltron';

export async function getCounting(guildId: string): Promise<Counting> {
  return prisma.counting.upsert({ where: { guildId }, create: { guildId }, update: {} });
}

/** Remise à zéro par l'intendance. */
export async function resetCounting(guildId: string): Promise<Counting> {
  return prisma.counting.upsert({ where: { guildId }, create: { guildId }, update: { current: 0, lastMemberId: null } });
}

/**
 * Traite un message du salon de comptage. Tout message qui n'est pas le bon nombre (texte compris)
 * est une erreur : le salon ne sert qu'à compter. Une bonne réponse avance le compteur de façon atomique :
 * si deux membres répondent en même temps, le second est évalué contre le nouveau nombre.
 */
export async function handleCountingMessage(message: Message) {
  // Voltron peut compter lui-même (via /admin message) ; les autres bots sont ignorés.
  const isSelf = message.author.id === message.client.user.id;
  if (!message.inGuild() || !isAllowedGuild(message.guildId) || (message.author.bot && !isSelf) || (!isSelf && !message.member)) return;
  const s = await getSettings(message.guildId);
  if (!s.countingChannelId || message.channelId !== s.countingChannelId || !isFeatureEnabled(s, 'comptage')) return;

  const parsed = evaluateExpression(message.content);
  if (isSelf && parsed === null) return; // ses propres messages de jeu (❌, pile ou face) ne sont pas des tentatives

  const member = isSelf ? null : await ensureMember(message.member!);
  const counterId = member ? member.id : SELF_ID;
  const state = await getCounting(message.guildId);
  const expected = state.current + 1;

  let failure: string | null = null;
  if (parsed === null) failure = 'ici on ne fait que compter';
  else if (parsed.kind === 'not_integer') failure = 'ce n’est pas un nombre entier';
  else if (state.lastMemberId === counterId) failure = 'on ne compte pas deux fois de suite';
  else if (parsed!.kind === 'integer' && parsed.value !== expected) failure = `il fallait **${expected}**`;

  if (!failure) {
    const { count } = await prisma.counting.updateMany({ where: { guildId: message.guildId, current: state.current }, data: { current: expected, lastMemberId: counterId, best: Math.max(state.best, expected) } });
    if (count === 0) return handleCountingMessage(message); // quelqu'un a été plus rapide : on réévalue
    await message.react(CHECK).catch(() => undefined);
    return;
  }

  // Erreur : croix, amende, pile ou face.
  const { count } = await prisma.counting.updateMany({ where: { guildId: message.guildId, current: state.current }, data: { failures: { increment: 1 } } });
  if (count === 0) return handleCountingMessage(message);
  await message.react(CROSS).catch(() => undefined);

  const fine = member ? Math.min(s.countingFine, await getBalance(member.id)) : 0;
  if (member && fine > 0) await debit({ memberId: member.id, amount: fine, type: 'COUNTING_FINE', actorDiscordId: 'voltron', reason: `Comptage : erreur à ${expected}` });

  const restart = randomInt(2) === 0;
  await prisma.counting.update({ where: { guildId: message.guildId }, data: { current: restart ? 0 : state.current, lastMemberId: null } });
  log.info(`${message.author.id} se trompe à ${expected} (${failure}) : amende ${fine}, ${restart ? 'retour à 1' : `on continue à ${state.current + 1}`}`);

  const fineText = !member ? `${botName()} se confond en excuses, pas d’amende pour une loutre.` : fine > 0 ? `Amende de **${formatAmount(fine, s)}**${fine < s.countingFine ? ' (toute la bourse !)' : ''}.` : 'Bourse vide, pas d’amende cette fois.';
  const coin = restart
    ? `🪙 **Face !** On recommence à **1**.`
    : `🪙 **Pile !** On continue : prochain nombre **${state.current + 1}**.`;
  await message.channel.send({
    content: `${CROSS} ${member ? userMention(message.author.id) : `${botName()}`} s’est trompé : ${failure}. ${fineText}\n${botName()} lance la pièce… ${coin}`,
    allowedMentions: { users: [message.author.id] },
  }).catch((err) => log.warn('Message de comptage impossible', err));
}
