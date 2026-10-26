import { ChannelType, channelMention, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { defineCommand } from '../types.js';
import { prisma } from '../../infrastructure/prisma.js';
import { isBotAdmin } from '../../core/permissions.js';
import { ensureMember } from '../../modules/community/member.service.js';
import { credit, debit, getBalance, InsufficientFundsError } from '../../modules/economy/economy.service.js';
import { autocompleteShopItem, buildShopAdminGroup, handleShopAdmin } from '../../modules/shop/shop.admin.js';
import { buildGroupHugAdminGroup, handleGroupHugAdmin } from '../../modules/events/grouphug.admin.js';
import { buildLevelsAdminGroup, handleLevelsAdmin } from '../../modules/progression/levels.admin.js';
import { buildLotteryAdminGroup, handleLotteryAdmin } from '../../modules/lottery/lottery.admin.js';
import { buildAchievementsAdminGroup, handleAchievementsAdmin } from '../../modules/achievements/achievements.admin.js';
import { buildCountingAdminGroup, handleCountingAdmin } from '../../modules/counting/counting.admin.js';
import { buildMessagesAdminGroup, handleMessagesAdmin } from '../../modules/moderation/messages.admin.js';
import { buildCommandsAdminGroup, handleCommandsAdmin } from '../../modules/settings/commands.admin.js';
import { getJackpot } from '../../modules/casino/slots.service.js';
import { openAdminPanel } from '../../modules/admin/panel.controller.js';
import { FEATURES, featureInfo, isFeatureEnabled, setFeatureEnabled, type FeatureKey } from '../../modules/features/features.js';
import { applyFeatureEffects } from '../../modules/features/features.effects.js';
import { formatAmount, getSettings, updateCurrency, updateStartingBalance, updateDailyAmount, updateWeeklyAmount, updateXpSettings, updateBlackjackLimits, updateSlotLimits, updateDuelLimits } from '../../modules/settings/settings.service.js';

const MAX_AMOUNT = 1_000_000;

/** Résout le membre ciblé par l'option `membre`, en créant son profil si besoin. */
async function resolveTarget(interaction: ChatInputCommandInteraction<'cached'>) {
  const target = interaction.options.getMember('membre');
  if (!target) return { error: 'Ce membre ne fait pas (ou plus) partie du serveur.' as string } as const;
  if (target.user.bot) return { error: 'Les bots n’ont pas de bourse, même Voltron.' as string } as const;
  return { error: undefined, member: await ensureMember(target), guildMember: target } as const;
}

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Outils réservés aux administrateurs du serveur')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('crediter')
        .setDescription('Ajoute de la monnaie à la bourse d’un membre')
        .addUserOption((o) => o.setName('membre').setDescription('Membre à créditer').setRequired(true))
        .addIntegerOption((o) => o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1).setMaxValue(MAX_AMOUNT))
        .addStringOption((o) => o.setName('raison').setDescription('Motif (visible dans l’historique)').setMaxLength(100)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('debiter')
        .setDescription('Retire de la monnaie de la bourse d’un membre')
        .addUserOption((o) => o.setName('membre').setDescription('Membre à débiter').setRequired(true))
        .addIntegerOption((o) => o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1).setMaxValue(MAX_AMOUNT))
        .addStringOption((o) => o.setName('raison').setDescription('Motif (visible dans l’historique)').setMaxLength(100)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('solde')
        .setDescription('Consulte la bourse d’un membre')
        .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('monnaie')
        .setDescription('Renomme la monnaie du serveur')
        .addStringOption((o) => o.setName('singulier').setDescription('Ex. : écu').setRequired(true).setMaxLength(30))
        .addStringOption((o) => o.setName('pluriel').setDescription('Ex. : écus').setRequired(true).setMaxLength(30))
        .addStringOption((o) => o.setName('symbole').setDescription('Emoji ou symbole, ex. : 🪙 (vide pour aucun)').setMaxLength(20)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('bienvenue')
        .setDescription('Règle le solde offert à l’ouverture d’une bourse')
        .addIntegerOption((o) => o.setName('montant').setDescription('Montant offert').setRequired(true).setMinValue(0).setMaxValue(MAX_AMOUNT)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('quotidien')
        .setDescription('Règle le montant de la récompense quotidienne')
        .addIntegerOption((o) => o.setName('montant').setDescription('Montant par jour').setRequired(true).setMinValue(0).setMaxValue(MAX_AMOUNT)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('hebdo')
        .setDescription('Règle le montant de la récompense hebdomadaire')
        .addIntegerOption((o) => o.setName('montant').setDescription('Montant par semaine').setRequired(true).setMinValue(0).setMaxValue(MAX_AMOUNT)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('xp')
        .setDescription('Affiche ou règle les gains d’expérience')
        .addIntegerOption((o) => o.setName('par_message').setDescription('XP par message (0 = désactivé)').setMinValue(0).setMaxValue(1000))
        .addIntegerOption((o) => o.setName('delai_message').setDescription('Secondes minimum entre deux messages comptés (0 = tous)').setMinValue(0).setMaxValue(86400))
        .addIntegerOption((o) => o.setName('par_tranche_vocal').setDescription('XP par tranche de vocal (0 = désactivé)').setMinValue(0).setMaxValue(1000))
        .addIntegerOption((o) => o.setName('tranche_vocal').setDescription('Durée d’une tranche de vocal, en minutes').setMinValue(1).setMaxValue(1440)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('blackjack')
        .setDescription('Règle les mises autorisées au blackjack')
        .addIntegerOption((o) => o.setName('min').setDescription('Mise minimale').setRequired(true).setMinValue(1))
        .addIntegerOption((o) => o.setName('max').setDescription('Mise maximale').setRequired(true).setMinValue(1)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('machine')
        .setDescription('Règle la machine à sous (sans option : affiche)')
        .addIntegerOption((o) => o.setName('prix').setDescription('Prix fixe d’un tour').setMinValue(1).setMaxValue(100000))
        .addIntegerOption((o) => o.setName('part_triple').setDescription('% de la cagnotte gagné par un triple autre que les loutres').setMinValue(1).setMaxValue(100))
        .addIntegerOption((o) => o.setName('cagnotte_depart').setDescription('Cagnotte de départ après un jackpot').setMinValue(0).setMaxValue(1000000)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('duel')
        .setDescription('Règle les mises autorisées en duel')
        .addIntegerOption((o) => o.setName('min').setDescription('Mise minimale').setRequired(true).setMinValue(1))
        .addIntegerOption((o) => o.setName('max').setDescription('Mise maximale').setRequired(true).setMinValue(1)),
    )
    .addSubcommand((sub) => sub.setName('stats').setDescription('Vue d’ensemble de l’économie du serveur'))
    .addSubcommand((sub) => sub.setName('panneau').setDescription('Ouvre le panneau de contrôle complet (privé)'))
    .addSubcommand((sub) =>
      sub
        .setName('message')
        .setDescription('Écrit un message en tant que Voltron')
        .addStringOption((o) => o.setName('texte').setDescription('Texte (\\n pour un retour à la ligne)').setRequired(true).setMaxLength(2000))
        .addChannelOption((o) => o.setName('salon').setDescription('Salon (par défaut : celui-ci)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread))
        .addStringOption((o) => o.setName('repondre_a').setDescription('ID d’un message du salon auquel répondre')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('fonction')
        .setDescription('Active ou désactive une fonctionnalité')
        .addStringOption((o) => o.setName('nom').setDescription('Fonctionnalité').setRequired(true).addChoices(...FEATURES.map((f) => ({ name: `${f.emoji} ${f.label}`, value: f.key }))))
        .addBooleanOption((o) => o.setName('active').setDescription('true = active, false = en pause').setRequired(true)),
    )
    .addSubcommandGroup((group) => buildShopAdminGroup(group))
    .addSubcommandGroup((group) => buildGroupHugAdminGroup(group))
    .addSubcommandGroup((group) => buildLevelsAdminGroup(group))
    .addSubcommandGroup((group) => buildLotteryAdminGroup(group))
    .addSubcommandGroup((group) => buildAchievementsAdminGroup(group))
    .addSubcommandGroup((group) => buildCountingAdminGroup(group))
    .addSubcommandGroup((group) => buildMessagesAdminGroup(group))
    .addSubcommandGroup((group) => buildCommandsAdminGroup(group)),

  async autocomplete(interaction) {
    if (!isBotAdmin(interaction.member)) return void (await interaction.respond([]));
    if (interaction.options.getSubcommandGroup(false) === 'boutique') return autocompleteShopItem(interaction);
    await interaction.respond([]);
  },

  async execute({ interaction }) {
    // Vérification côté serveur : la visibilité de la commande ne suffit pas.
    if (!isBotAdmin(interaction.member)) {
      await interaction.reply({ content: 'Cette commande est réservée à l’intendance de Voltron.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (interaction.options.getSubcommandGroup(false) === 'boutique') return handleShopAdmin(interaction);
    if (interaction.options.getSubcommandGroup(false) === 'calin') return handleGroupHugAdmin(interaction);
    if (interaction.options.getSubcommandGroup(false) === 'niveaux') return handleLevelsAdmin(interaction);
    if (interaction.options.getSubcommandGroup(false) === 'tombola') return handleLotteryAdmin(interaction);
    if (interaction.options.getSubcommandGroup(false) === 'succes') return handleAchievementsAdmin(interaction);
    if (interaction.options.getSubcommandGroup(false) === 'comptage') return handleCountingAdmin(interaction);
    if (interaction.options.getSubcommandGroup(false) === 'messages') return handleMessagesAdmin(interaction);
    if (interaction.options.getSubcommandGroup(false) === 'commandes') return handleCommandsAdmin(interaction);

    const sub = interaction.options.getSubcommand(true);
    const settings = await getSettings(interaction.guildId);
    const reply = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

    if (sub === 'monnaie') {
      const updated = await updateCurrency(interaction.guildId, {
        singular: interaction.options.getString('singulier', true).trim(),
        plural: interaction.options.getString('pluriel', true).trim(),
        symbol: interaction.options.getString('symbole')?.trim() ?? '',
      });
      await reply(`Monnaie mise à jour. Aperçu : ${formatAmount(1, updated)} · ${formatAmount(25, updated)}`);
      return;
    }

    if (sub === 'bienvenue') {
      const updated = await updateStartingBalance(interaction.guildId, interaction.options.getInteger('montant', true));
      await reply(`Les prochaines bourses ouvriront avec ${formatAmount(updated.startingBalance, updated)}. Les bourses existantes ne changent pas.`);
      return;
    }

    if (sub === 'quotidien') {
      const updated = await updateDailyAmount(interaction.guildId, interaction.options.getInteger('montant', true));
      await reply(`La récompense quotidienne vaut désormais ${formatAmount(updated.dailyAmount, updated)}.`);
      return;
    }

    if (sub === 'hebdo') {
      const updated = await updateWeeklyAmount(interaction.guildId, interaction.options.getInteger('montant', true));
      await reply(`La récompense hebdomadaire vaut désormais ${formatAmount(updated.weeklyAmount, updated)}.`);
      return;
    }

    if (sub === 'xp') {
      const changes = {
        xpPerMessage: interaction.options.getInteger('par_message') ?? undefined,
        xpMessageCooldownSeconds: interaction.options.getInteger('delai_message') ?? undefined,
        xpPerVoiceInterval: interaction.options.getInteger('par_tranche_vocal') ?? undefined,
        voiceIntervalMinutes: interaction.options.getInteger('tranche_vocal') ?? undefined,
      };
      const updated = Object.values(changes).some((v) => v !== undefined) ? await updateXpSettings(interaction.guildId, changes) : settings;
      await reply(
        [
          `**Messages :** +${updated.xpPerMessage} XP, au plus un message compté toutes les ${updated.xpMessageCooldownSeconds} s`,
          `**Vocal :** +${updated.xpPerVoiceInterval} XP par tranche de ${updated.voiceIntervalMinutes} min`,
        ].join('\n'),
      );
      return;
    }

    if (sub === 'blackjack') {
      const min = interaction.options.getInteger('min', true);
      const max = interaction.options.getInteger('max', true);
      if (min > max) return void (await reply('La mise minimale doit être inférieure ou égale à la maximale.'));
      const updated = await updateBlackjackLimits(interaction.guildId, min, max);
      await reply(`Blackjack : mises de ${formatAmount(updated.blackjackMinBet, updated)} à ${formatAmount(updated.blackjackMaxBet, updated)}.`);
      return;
    }

    if (sub === 'machine') {
      const changes = {
        slotBet: interaction.options.getInteger('prix') ?? undefined,
        slotJackpotSeed: interaction.options.getInteger('cagnotte_depart') ?? undefined,
        slotTriplePercent: interaction.options.getInteger('part_triple') ?? undefined,
      };
      const updated = Object.values(changes).some((v) => v !== undefined) ? await updateSlotLimits(interaction.guildId, changes) : settings;
      const jackpot = await getJackpot(interaction.guildId);
      await reply(
        [
          `**Prix du tour :** ${formatAmount(updated.slotBet, updated)}`,
          `**Cagnotte :** ${formatAmount(jackpot.pool, updated)} actuellement · repart à ${formatAmount(updated.slotJackpotSeed, updated)} après un jackpot`,
          `**Gains :** trois loutres = toute la cagnotte · trois autres identiques = ${updated.slotTriplePercent} % de la cagnotte`,
          jackpot.lastWinnerDiscordId ? `**Dernier jackpot :** ${formatAmount(jackpot.lastWonAmount ?? 0, updated)} par <@${jackpot.lastWinnerDiscordId}>` : '',
        ].filter(Boolean).join('\n'),
      );
      return;
    }

    if (sub === 'duel') {
      const min = interaction.options.getInteger('min', true);
      const max = interaction.options.getInteger('max', true);
      if (min > max) return void (await reply('La mise minimale doit être inférieure ou égale à la maximale.'));
      const updated = await updateDuelLimits(interaction.guildId, min, max);
      await reply(`Duel : mises de ${formatAmount(updated.duelMinStake, updated)} à ${formatAmount(updated.duelMaxStake, updated)}.`);
      return;
    }

    if (sub === 'panneau') return openAdminPanel(interaction);

    if (sub === 'message') {
      const text = interaction.options.getString('texte', true).replaceAll('\\n', '\n').trim();
      const target = interaction.options.getChannel('salon') ?? interaction.channel;
      const channel = target && interaction.guild.channels.cache.get(target.id);
      if (!channel || !channel.isTextBased() || !channel.isSendable()) return void (await reply('Je ne peux pas écrire dans ce salon.'));
      const perms = channel.permissionsFor(interaction.guild.members.me!);
      if (!perms.has(PermissionFlagsBits.ViewChannel) || !perms.has(PermissionFlagsBits.SendMessages)) return void (await reply(`Je n’ai pas le droit d’écrire dans ${channelMention(channel.id)}.`));
      const replyTo = interaction.options.getString('repondre_a')?.trim();
      try {
        await channel.send({ content: text, allowedMentions: { parse: ['users', 'roles'] }, ...(replyTo ? { reply: { messageReference: replyTo, failIfNotExists: true } } : {}) });
      } catch (err) {
        if (replyTo) return void (await reply('Message introuvable dans ce salon : vérifie l’identifiant (clic droit → Copier l’identifiant du message).'));
        throw err;
      }
      await reply(`Message envoyé dans ${channelMention(channel.id)}.`);
      return;
    }

    if (sub === 'fonction') {
      const name = interaction.options.getString('nom', true) as FeatureKey;
      const active = interaction.options.getBoolean('active', true);
      const updated = await setFeatureEnabled(interaction.guildId, name, active);
      await applyFeatureEffects(interaction.guild, [name], (k) => isFeatureEnabled(updated, k));
      await reply(`${isFeatureEnabled(updated, name) ? '🟢 Activé' : '⛔ En pause'} : ${featureInfo(name).label}.`);
      return;
    }

    if (sub === 'stats') {
      const [members, accounts, totals] = await Promise.all([
        prisma.member.count({ where: { guildId: interaction.guildId, leftAt: null } }),
        prisma.account.count({ where: { member: { guildId: interaction.guildId } } }),
        prisma.account.aggregate({ where: { member: { guildId: interaction.guildId } }, _sum: { balance: true }, _max: { balance: true } }),
      ]);
      await reply(
        [
          `**Membres présents :** ${members}`,
          `**Bourses ouvertes :** ${accounts}`,
          `**Monnaie en circulation :** ${formatAmount(totals._sum.balance ?? 0, settings)}`,
          `**Plus grosse bourse :** ${formatAmount(totals._max.balance ?? 0, settings)}`,
        ].join('\n'),
      );
      return;
    }

    const resolved = await resolveTarget(interaction);
    if (resolved.error !== undefined) {
      await reply(resolved.error);
      return;
    }
    const { member, guildMember } = resolved;

    if (sub === 'solde') {
      await reply(`Bourse de **${guildMember.displayName}** : ${formatAmount(await getBalance(member.id), settings)}`);
      return;
    }

    const amount = interaction.options.getInteger('montant', true);
    const reason = interaction.options.getString('raison');
    const base = { memberId: member.id, amount, actorDiscordId: interaction.user.id, reason };

    if (sub === 'crediter') {
      const tx = await credit({ ...base, type: 'ADMIN_CREDIT' });
      await reply(`**${formatAmount(amount, settings)}** ajouté(s) à la bourse de **${guildMember.displayName}**. Nouveau solde : ${formatAmount(tx.balanceAfter, settings)}`);
      return;
    }

    if (sub === 'debiter') {
      try {
        const tx = await debit({ ...base, type: 'ADMIN_DEBIT' });
        await reply(`**${formatAmount(amount, settings)}** retiré(s) de la bourse de **${guildMember.displayName}**. Nouveau solde : ${formatAmount(tx.balanceAfter, settings)}`);
      } catch (err) {
        if (err instanceof InsufficientFundsError) {
          await reply(`Impossible : **${guildMember.displayName}** n’a que ${formatAmount(err.balance, settings)}.`);
          return;
        }
        throw err;
      }
    }
  },
});
