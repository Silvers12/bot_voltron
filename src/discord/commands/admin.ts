import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { defineCommand } from '../types.js';
import { prisma } from '../../infrastructure/prisma.js';
import { ensureMember } from '../../modules/community/member.service.js';
import { credit, debit, getBalance, InsufficientFundsError } from '../../modules/economy/economy.service.js';
import { formatAmount, getSettings, updateCurrency, updateStartingBalance } from '../../modules/settings/settings.service.js';

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
    .addSubcommand((sub) => sub.setName('stats').setDescription('Vue d’ensemble de l’économie du serveur')),

  async execute({ interaction }) {
    // Vérification côté serveur : la visibilité de la commande ne suffit pas.
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: 'Cette commande est réservée aux administrateurs.', flags: MessageFlags.Ephemeral });
      return;
    }

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
