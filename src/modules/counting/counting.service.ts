import { randomInt } from 'node:crypto';
import { userMention, type Message, type PartialMessage } from 'discord.js';
import { prisma } from '../../infrastructure/prisma.js';
import { createLogger } from '../../core/logger.js';
import { isAllowedGuild } from '../../core/config.js';
import { ensureMember } from '../community/member.service.js';
import { getBalance, credit, debit } from '../economy/economy.service.js';
import { formatAmount, getSettings } from '../settings/settings.service.js';
import { isFeatureEnabled } from '../features/features.js';
import { evaluateExpression } from './expression.js';
import { formatRemaining, imprison, isImprisoned, prisonRemainingMs } from '../prison/prison.service.js';
import { buildPrisonMessage } from '../prison/prison.view.js';
import type { Counting } from '../../generated/prisma/client.js';

import { botName } from '../../core/identity.js';
const log = createLogger('comptage');

export const CHECK = '✅';
export const CROSS = '❌';
export const LOCK = '🔒';
export const POLICE = '🚔';
/** Durée de conservation des messages de comptage servant à détecter les modifications. */
const MESSAGE_RETENTION_DAYS = 30;
/** Identifiant de compteur réservé à Voltron lui-même (jamais un id de membre). */
const SELF_ID = 'voltron';

export async function getCounting(guildId: string): Promise<Counting> {
  return prisma.counting.upsert({ where: { guildId }, create: { guildId }, update: {} });
}

/** Remise à zéro par l'intendance. */
export async function resetCounting(guildId: string): Promise<Counting> {
  return prisma.counting.upsert({ where: { guildId }, create: { guildId }, update: { current: 0, lastMemberId: null } });
}

/** Écart jusqu'à la prochaine surprise : entre la moitié et une fois et demie l'intervalle moyen, jamais moins de 2. */
function nextGap(every: number): number {
  const min = Math.max(2, Math.ceil(every / 2)), max = Math.max(min, Math.floor(every * 1.5));
  return randomInt(min, max + 1);
}

/**
 * Récompense surprise : la prochaine est programmée à un nombre de bons comptes aléatoire après la précédente
 * (en moyenne `countingRewardEvery`, jamais deux de suite). Le seuil est secret, personne ne peut le viser.
 */
async function maybeReward(message: Message<true>, memberId: string, number: number, correctTotal: number, nextRewardAt: number, s: Awaited<ReturnType<typeof getSettings>>) {
  const guildId = message.guildId;
  if (s.countingRewardEvery <= 0 || s.countingRewardMax <= 0) return;
  if (nextRewardAt === 0 || nextRewardAt > correctTotal) {
    if (nextRewardAt === 0) await prisma.counting.update({ where: { guildId }, data: { nextRewardAt: correctTotal + nextGap(s.countingRewardEvery) } });
    return;
  }
  // Verrou : un seul message déclenche la surprise, le seuil est repoussé dans la même requête.
  const { count } = await prisma.counting.updateMany({ where: { guildId, nextRewardAt }, data: { nextRewardAt: correctTotal + nextGap(s.countingRewardEvery) } });
  if (count === 0) return;
  const amount = randomInt(Math.min(s.countingRewardMin, s.countingRewardMax), Math.max(s.countingRewardMin, s.countingRewardMax) + 1);
  await credit({ memberId, amount, type: 'COUNTING_REWARD', actorDiscordId: 'voltron', reason: `Comptage : surprise au nombre ${number}` });
  await message.react('🎁').catch(() => undefined);
  await message.channel.send({
    content: `🎁 **Surprise !** ${userMention(message.author.id)} trouve **${formatAmount(amount, s)}** cachés sous le nombre **${number}**. ${botName()} les y avait glissés.`,
    allowedMentions: { users: [message.author.id] },
  }).catch((err) => log.warn('Message de récompense impossible', err));
  log.info(`${message.author.id} gagne ${amount} au nombre ${number}`);
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
  if (member && isImprisoned(member)) {
    // Un prisonnier ne joue pas : son message est effacé (ou verrouillé) sans toucher à la chaîne.
    const deleted = await message.delete().then(() => true).catch(() => false);
    if (!deleted) await message.react(LOCK).catch(() => undefined);
    await message.channel.send({ content: `${LOCK} ${userMention(message.author.id)}, tu es en prison encore **${formatRemaining(prisonRemainingMs(member))}** : pas de comptage pour toi.`, allowedMentions: { users: [message.author.id] } }).catch(() => undefined);
    return;
  }
  const counterId = member ? member.id : SELF_ID;
  const state = await getCounting(message.guildId);
  const expected = state.current + 1;

  let failure: string | null = null;
  if (parsed === null) failure = 'ici on ne fait que compter';
  else if (parsed.kind === 'not_integer') failure = 'ce n’est pas un nombre entier';
  else if (state.lastMemberId === counterId) failure = 'on ne compte pas deux fois de suite';
  else if (parsed!.kind === 'integer' && parsed.value !== expected) failure = `il fallait **${expected}**`;

  if (!failure) {
    const { count } = await prisma.counting.updateMany({ where: { guildId: message.guildId, current: state.current }, data: { current: expected, lastMemberId: counterId, best: Math.max(state.best, expected), correctTotal: { increment: 1 } } });
    if (count === 0) return handleCountingMessage(message); // quelqu'un a été plus rapide : on réévalue
    if (member) await recordMessage(message, member.id, expected, true);
    await message.react(CHECK).catch(() => undefined);
    if (member) await maybeReward(message, member.id, expected, state.correctTotal + 1, state.nextRewardAt, s);
    return;
  }

  // Erreur : croix, amende, pile ou face.
  const { count } = await prisma.counting.updateMany({ where: { guildId: message.guildId, current: state.current }, data: { failures: { increment: 1 } } });
  if (count === 0) return handleCountingMessage(message);
  if (member) await recordMessage(message, member.id, expected, false);
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

/** Garde la trace d'un message évalué, pour repérer ensuite les modifications après coup. */
async function recordMessage(message: Message<true>, memberId: string, number: number, accepted: boolean) {
  await prisma.countingMessage.create({ data: { messageId: message.id, guildId: message.guildId, memberId, content: message.content, number, accepted } }).catch((err) => log.warn('Trace de comptage impossible', err));
}

/** Purge des traces anciennes (appelée périodiquement). */
export async function pruneCountingMessages(): Promise<void> {
  await prisma.countingMessage.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - MESSAGE_RETENTION_DAYS * 86_400_000) } } });
}

/**
 * Message du salon de comptage modifié après coup. Si le contenu n'est plus celui qui a été évalué,
 * l'auteur part en prison ; la chaîne, elle, continue comme si de rien n'était.
 */
export async function handleCountingEdit(newMessage: Message | PartialMessage) {
  if (!newMessage.inGuild() || !isAllowedGuild(newMessage.guildId)) return;
  const s = await getSettings(newMessage.guildId);
  if (!s.countingChannelId || newMessage.channelId !== s.countingChannelId || !isFeatureEnabled(s, 'comptage')) return;
  const trace = await prisma.countingMessage.findUnique({ where: { messageId: newMessage.id } });
  if (!trace) return; // pas une tentative de comptage connue (message du bot, ancien message…)
  const message = newMessage.partial ? await newMessage.fetch().catch(() => null) : newMessage;
  if (!message || message.content === trace.content || !message.editedTimestamp) return; // aperçu de lien, pas une vraie modification

  const guildMember = message.member ?? await message.guild.members.fetch(message.author.id).catch(() => null);
  const member = await prisma.member.findUnique({ where: { id: trace.memberId } });
  if (!guildMember || !member) return;

  const { until, roleGiven } = await imprison(guildMember, member, `Comptage : message ${trace.number} modifié après coup`);
  // La trace garde le contenu d'origine : chaque nouvelle modification est comparée au vrai message, pas au précédent faux.
  await message.react(POLICE).catch(() => undefined);
  const state = await getCounting(message.guildId);
  const original = trace.accepted ? `Le vrai message était « ${trace.content} » (${trace.number}, accepté).` : `Le message d’origine était « ${trace.content} » (refusé).`;
  const payload = await buildPrisonMessage(guildMember, {
    lines: [
      `Message modifié après coup : « ${message.content.slice(0, 20)} »`,
      trace.accepted ? `Vrai message : « ${trace.content.slice(0, 20)} » (${trace.number} ✅)` : `Message d’origine : « ${trace.content.slice(0, 20)} » (❌)`,
    ],
    next: state.current + 1,
    minutes: s.prisonMinutes,
    until,
  }).catch((err) => { log.warn('Carte de prison impossible', err); return null; });
  await message.channel.send(payload ?? {
    content: `${POLICE} ${userMention(message.author.id)} a modifié son message après coup. ${original} La chaîne continue : prochain nombre **${state.current + 1}**.\n${LOCK} Direction la prison jusqu’à <t:${Math.floor(until.getTime() / 1000)}:t> : plus aucun jeu d’ici là.`,
    allowedMentions: { users: [message.author.id] },
  }).catch((err) => log.warn('Message de prison impossible', err));
  if (!roleGiven) log.warn(`${message.author.id} : rôle Prison non attribué`);
  log.info(`${message.author.id} modifie son message ${trace.number} (« ${trace.content} » → « ${message.content} »)`);
}
