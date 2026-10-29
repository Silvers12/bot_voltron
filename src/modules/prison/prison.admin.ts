import { MessageFlags, userMention, type ChatInputCommandInteraction, type SlashCommandSubcommandGroupBuilder } from 'discord.js';
import { prisma } from '../../infrastructure/prisma.js';
import { findMember } from '../community/member.service.js';
import { formatRemaining, imprison, isImprisoned, prisonRemainingMs, release } from './prison.service.js';

export const PRISON_SUBCOMMANDS = ['liberer', 'envoyer', 'detenus'] as const;

/** Sous-commandes de prison, rangées dans le groupe /admin comptage (limite Discord de 25 entrées par commande). */
export function addPrisonSubcommands(group: SlashCommandSubcommandGroupBuilder) {
  return group
    .addSubcommand((sub) => sub.setName('liberer').setDescription('Libère un membre avant la fin de sa peine').addUserOption((o) => o.setName('membre').setDescription('Membre à libérer').setRequired(true)))
    .addSubcommand((sub) =>
      sub.setName('envoyer').setDescription('Envoie un membre en prison').addUserOption((o) => o.setName('membre').setDescription('Membre à enfermer').setRequired(true))
        .addIntegerOption((o) => o.setName('minutes').setDescription('Durée (par défaut : réglage du serveur)').setMinValue(1).setMaxValue(10_080)),
    )
    .addSubcommand((sub) => sub.setName('detenus').setDescription('Membres actuellement en prison'));
}

export async function handlePrisonAdmin(interaction: ChatInputCommandInteraction<'cached'>) {
  const sub = interaction.options.getSubcommand(true);
  const reply = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

  if (sub === 'detenus') {
    const inside = await prisma.member.findMany({ where: { guildId: interaction.guildId, prisonUntil: { gt: new Date() } }, orderBy: { prisonUntil: 'asc' } });
    await reply(inside.length ? inside.map((m) => `🔒 ${userMention(m.discordUserId)} · encore ${formatRemaining(prisonRemainingMs(m))}`).join('\n') : 'Personne en prison.');
    return;
  }

  const guildMember = interaction.options.getMember('membre');
  if (!guildMember) return void (await reply('Ce membre n’est pas sur le serveur.'));
  const member = await findMember(interaction.guildId, guildMember.id);

  if (sub === 'liberer') {
    if (!member || !isImprisoned(member)) {
      await release(guildMember, member);
      return void (await reply(`${userMention(guildMember.id)} n’était pas en prison (rôle retiré au cas où).`));
    }
    await release(guildMember, member);
    await reply(`🔓 ${userMention(guildMember.id)} est libéré.`);
    return;
  }

  if (guildMember.user.bot) return void (await reply('Pas de prison pour les bots.'));
  if (!member) return void (await reply('Ce membre n’a pas encore de fiche.'));
  const { until, roleGiven } = await imprison(guildMember, member, `Décision de ${interaction.user.tag}`, interaction.options.getInteger('minutes') ?? undefined);
  await reply(`🔒 ${userMention(guildMember.id)} en prison jusqu’à <t:${Math.floor(until.getTime() / 1000)}:t>.${roleGiven ? '' : ' Le rôle Prison n’a pas pu être donné (permission « Gérer les rôles » ?).'}`);
}
