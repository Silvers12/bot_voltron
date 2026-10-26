import { channelMention, ChannelType, MessageFlags, roleMention, type ChatInputCommandInteraction, type SlashCommandSubcommandGroupBuilder } from 'discord.js';
import { prisma } from '../../infrastructure/prisma.js';
import { roleAssignabilityProblem } from '../../core/roles.js';
import { getSettings, updateLevelSettings } from '../settings/settings.service.js';
import { listLevelRoles, resyncAllLevels, xpToReach } from './levels.service.js';

export function buildLevelsAdminGroup(group: SlashCommandSubcommandGroupBuilder) {
  return group
    .setName('niveaux')
    .setDescription('Niveaux et rôles de palier')
    .addSubcommand((sub) =>
      sub
        .setName('ajouter-role')
        .setDescription('Attribue un rôle à partir d’un niveau')
        .addIntegerOption((o) => o.setName('niveau').setDescription('Niveau requis').setRequired(true).setMinValue(1).setMaxValue(1000))
        .addRoleOption((o) => o.setName('role').setDescription('Rôle de palier').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('retirer-role')
        .setDescription('Supprime le palier d’un niveau')
        .addIntegerOption((o) => o.setName('niveau').setDescription('Niveau du palier').setRequired(true).setMinValue(1)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('salon')
        .setDescription('Salon des annonces de montée de niveau (sans option : désactive)')
        .addChannelOption((o) => o.setName('salon').setDescription('Salon textuel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('courbe')
        .setDescription('Règle la courbe : XP pour le niveau suivant = base + pas × niveau')
        .addIntegerOption((o) => o.setName('base').setDescription('XP pour le niveau 1').setRequired(true).setMinValue(1).setMaxValue(100000))
        .addIntegerOption((o) => o.setName('pas').setDescription('XP ajoutée à chaque niveau').setRequired(true).setMinValue(0).setMaxValue(100000)),
    )
    .addSubcommand((sub) => sub.setName('recalculer').setDescription('Recalcule les niveaux et réapplique les rôles de tous les membres'))
    .addSubcommand((sub) => sub.setName('lister').setDescription('Affiche la courbe et les paliers'));
}

export async function handleLevelsAdmin(interaction: ChatInputCommandInteraction<'cached'>) {
  const sub = interaction.options.getSubcommand(true);
  const guildId = interaction.guildId;
  const reply = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

  if (sub === 'ajouter-role') {
    const level = interaction.options.getInteger('niveau', true);
    const role = interaction.options.getRole('role', true);
    const problem = roleAssignabilityProblem(interaction.guild, role.id);
    if (problem) return void (await reply(`Impossible d’utiliser ce rôle : ${problem}`));
    await prisma.levelRole.upsert({
      where: { guildId_level: { guildId, level } },
      create: { guildId, level, roleId: role.id },
      update: { roleId: role.id },
    }).catch(async (err) => {
      if (typeof err === 'object' && err && 'code' in err && err.code === 'P2002') throw new Error('Ce rôle est déjà utilisé pour un autre palier.');
      throw err;
    });
    await reply(`Niveau ${level} → ${roleMention(role.id)}. Lance \`/admin niveaux recalculer\` pour l’appliquer aux membres qui ont déjà ce niveau.`);
    return;
  }

  if (sub === 'retirer-role') {
    const level = interaction.options.getInteger('niveau', true);
    const { count } = await prisma.levelRole.deleteMany({ where: { guildId, level } });
    await reply(count ? `Palier du niveau ${level} supprimé. Les rôles déjà attribués ne sont pas retirés automatiquement : \`/admin niveaux recalculer\` le fera.` : 'Aucun palier à ce niveau.');
    return;
  }

  if (sub === 'salon') {
    const channel = interaction.options.getChannel('salon');
    await updateLevelSettings(guildId, { levelUpChannelId: channel?.id ?? null });
    await reply(channel ? `Les montées de niveau seront annoncées dans ${channelMention(channel.id)}.` : 'Annonces de niveau désactivées.');
    return;
  }

  if (sub === 'courbe') {
    const updated = await updateLevelSettings(guildId, {
      levelBaseXp: interaction.options.getInteger('base', true),
      levelStepXp: interaction.options.getInteger('pas', true),
    });
    await reply(`Courbe mise à jour. ${curveSummary(updated)}\nLance \`/admin niveaux recalculer\` pour appliquer la nouvelle courbe.`);
    return;
  }

  if (sub === 'recalculer') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const n = await resyncAllLevels(interaction.guild);
    await interaction.editReply(`${n} membre(s) recalculé(s), rôles de palier réappliqués.`);
    return;
  }

  if (sub === 'lister') {
    const s = await getSettings(guildId);
    const tiers = await listLevelRoles(guildId);
    const lines = tiers.length ? tiers.map((t) => `• Niveau ${t.level} (${xpToReach(t.level, s)} XP) → ${roleMention(t.roleId)}`) : ['*Aucun palier. Utilise `/admin niveaux ajouter-role`.*'];
    await reply([curveSummary(s), `**Annonces :** ${s.levelUpChannelId ? channelMention(s.levelUpChannelId) : 'désactivées'}`, '', '**Paliers :**', ...lines].join('\n'));
  }
}

function curveSummary(s: { levelBaseXp: number; levelStepXp: number }): string {
  const marks = [1, 5, 10, 20, 30].map((l) => `niv. ${l} à ${xpToReach(l, s)} XP`).join(', ');
  return `**Courbe :** base ${s.levelBaseXp}, pas ${s.levelStepXp} (${marks})`;
}
