import type { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandSubcommandGroupBuilder } from 'discord.js';
import { MessageFlags, roleMention } from 'discord.js';
import { formatAmount, getSettings } from '../settings/settings.service.js';
import { createItem, findItemByName, listItems, roleAssignabilityProblem, updateItem, type ItemInput } from './shop.service.js';

const MAX_PRICE = 10_000_000;

/** Déclare les sous-commandes `/admin boutique …`. */
export function buildShopAdminGroup(group: SlashCommandSubcommandGroupBuilder) {
  return group
    .setName('boutique')
    .setDescription('Gestion des articles de la boutique')
    .addSubcommand((sub) =>
      sub
        .setName('ajouter')
        .setDescription('Met un nouvel article en vente')
        .addStringOption((o) => o.setName('nom').setDescription('Nom de l’article').setRequired(true).setMaxLength(60))
        .addIntegerOption((o) => o.setName('prix').setDescription('Prix').setRequired(true).setMinValue(0).setMaxValue(MAX_PRICE))
        .addStringOption((o) => o.setName('description').setDescription('Texte affiché sur la fiche').setMaxLength(300))
        .addStringOption((o) => o.setName('emoji').setDescription('Emoji affiché devant le nom').setMaxLength(20))
        .addRoleOption((o) => o.setName('role').setDescription('Rôle attribué à l’achat (article de type rôle)'))
        .addBooleanOption((o) => o.setName('titre').setDescription('Article de type titre : le nom est affiché sur le profil de l’acheteur'))
        .addIntegerOption((o) => o.setName('stock').setDescription('Stock initial (vide = illimité)').setMinValue(0))
        .addIntegerOption((o) => o.setName('max_par_membre').setDescription('Exemplaires max par membre (vide = illimité)').setMinValue(1))
        .addIntegerOption((o) => o.setName('ordre').setDescription('Ordre d’affichage (petit = en haut)')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('modifier')
        .setDescription('Modifie un article existant (seuls les champs fournis changent)')
        .addStringOption((o) => o.setName('article').setDescription('Article').setRequired(true).setAutocomplete(true))
        .addIntegerOption((o) => o.setName('prix').setDescription('Nouveau prix').setMinValue(0).setMaxValue(MAX_PRICE))
        .addStringOption((o) => o.setName('nom').setDescription('Nouveau nom').setMaxLength(60))
        .addStringOption((o) => o.setName('description').setDescription('Nouvelle description').setMaxLength(300))
        .addStringOption((o) => o.setName('emoji').setDescription('Nouvel emoji').setMaxLength(20))
        .addIntegerOption((o) => o.setName('stock').setDescription('Nouveau stock (-1 = illimité)').setMinValue(-1))
        .addIntegerOption((o) => o.setName('max_par_membre').setDescription('Nouvelle limite (-1 = illimitée)').setMinValue(-1))
        .addIntegerOption((o) => o.setName('ordre').setDescription('Ordre d’affichage')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('retirer')
        .setDescription('Retire un article de la vente (les exemplaires déjà achetés sont conservés)')
        .addStringOption((o) => o.setName('article').setDescription('Article').setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remettre')
        .setDescription('Remet en vente un article retiré')
        .addStringOption((o) => o.setName('article').setDescription('Article').setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((sub) => sub.setName('lister').setDescription('Liste tous les articles, y compris retirés'));
}

/** Autocomplétion des noms d'articles (actifs et retirés). */
export async function autocompleteShopItem(interaction: AutocompleteInteraction<'cached'>) {
  const query = interaction.options.getFocused().toLowerCase();
  const items = await listItems(interaction.guildId, { includeInactive: true });
  await interaction.respond(
    items
      .filter((i) => i.name.toLowerCase().includes(query))
      .slice(0, 25)
      .map((i) => ({ name: `${i.name}${i.active ? '' : ' (retiré)'}`.slice(0, 100), value: i.name })),
  );
}

export async function handleShopAdmin(interaction: ChatInputCommandInteraction<'cached'>) {
  const sub = interaction.options.getSubcommand(true);
  const settings = await getSettings(interaction.guildId);
  const reply = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
  const opt = interaction.options;

  if (sub === 'lister') {
    const items = await listItems(interaction.guildId, { includeInactive: true });
    if (!items.length) return void (await reply('Aucun article. Utilise `/admin boutique ajouter`.'));
    const lines = items.map((i) => {
      const flags = [
        i.active ? '' : '**retiré**',
        i.stock === null ? 'stock ∞' : `stock ${i.stock}`,
        i.maxPerMember === null ? '' : `max ${i.maxPerMember}/membre`,
        i.kind === 'ROLE' && i.roleId ? `rôle ${roleMention(i.roleId)}` : i.kind === 'TITLE' ? 'titre' : '',
      ].filter(Boolean).join(', ');
      return `• ${i.emoji ? i.emoji + ' ' : ''}**${i.name}** — ${formatAmount(i.price, settings)} (${flags})`;
    });
    await reply(lines.join('\n').slice(0, 1900));
    return;
  }

  if (sub === 'ajouter') {
    const name = opt.getString('nom', true).trim();
    if (await findItemByName(interaction.guildId, name)) return void (await reply(`Un article nommé **${name}** existe déjà.`));
    const role = opt.getRole('role');
    const isTitle = opt.getBoolean('titre') ?? false;
    if (role && isTitle) return void (await reply('Un article est soit un rôle, soit un titre, pas les deux.'));
    if (role) {
      const problem = roleAssignabilityProblem(interaction.guild, role.id);
      if (problem) return void (await reply(`Impossible d’utiliser ce rôle : ${problem}`));
    }
    const item = await createItem(interaction.guildId, {
      name,
      price: opt.getInteger('prix', true),
      description: opt.getString('description'),
      emoji: opt.getString('emoji')?.trim() || null,
      kind: role ? 'ROLE' : isTitle ? 'TITLE' : 'COLLECTIBLE',
      roleId: role?.id ?? null,
      stock: opt.getInteger('stock'),
      maxPerMember: opt.getInteger('max_par_membre') ?? (role || isTitle ? 1 : null),
      sortOrder: opt.getInteger('ordre') ?? 0,
    });
    await reply(`**${item.name}** est en vente pour ${formatAmount(item.price, settings)}${role ? ` et donne le rôle ${roleMention(role.id)}` : isTitle ? ' comme titre de profil' : ''}.`);
    return;
  }

  // modifier / retirer / remettre : article ciblé par son nom
  const existing = await findItemByName(interaction.guildId, opt.getString('article', true));
  if (!existing) return void (await reply('Article introuvable. Utilise l’autocomplétion pour le choisir.'));

  if (sub === 'retirer') {
    await updateItem(existing.id, { active: false });
    await reply(`**${existing.name}** est retiré de la vente. Les exemplaires déjà achetés restent dans les inventaires.`);
    return;
  }
  if (sub === 'remettre') {
    await updateItem(existing.id, { active: true });
    await reply(`**${existing.name}** est de nouveau en vente.`);
    return;
  }
  if (sub === 'modifier') {
    const changes: Partial<ItemInput> = {};
    const newName = opt.getString('nom')?.trim();
    if (newName && newName !== existing.name) {
      if (await findItemByName(interaction.guildId, newName)) return void (await reply(`Un article nommé **${newName}** existe déjà.`));
      changes.name = newName;
    }
    const price = opt.getInteger('prix'); if (price !== null) changes.price = price;
    const description = opt.getString('description'); if (description !== null) changes.description = description;
    const emoji = opt.getString('emoji'); if (emoji !== null) changes.emoji = emoji.trim() || null;
    const stock = opt.getInteger('stock'); if (stock !== null) changes.stock = stock < 0 ? null : stock;
    const max = opt.getInteger('max_par_membre'); if (max !== null) changes.maxPerMember = max < 0 ? null : max;
    const order = opt.getInteger('ordre'); if (order !== null) changes.sortOrder = order;
    if (!Object.keys(changes).length) return void (await reply('Aucun changement fourni.'));
    const updated = await updateItem(existing.id, changes);
    await reply(`**${updated.name}** mis à jour : ${formatAmount(updated.price, settings)}, stock ${updated.stock ?? '∞'}, max/membre ${updated.maxPerMember ?? '∞'}.`);
  }
}
