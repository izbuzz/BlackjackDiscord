const {
  SlashCommandBuilder,
  EmbedBuilder,
  ComponentType,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("blackjack")
    .setDescription("Start a blackjack game"),

  async execute(interaction) {
    const players = new Set();
    const host = interaction.user;
    players.add(host);

    // create the buttons
    const join = new ButtonBuilder()
      .setCustomId("join")
      .setLabel("Join Game")
      .setStyle(ButtonStyle.Primary);

    const start = new ButtonBuilder()
      .setCustomId("start")
      .setLabel("Start")
      .setStyle(ButtonStyle.Success);

    const cancel = new ButtonBuilder()
      .setCustomId("cancel")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger);
    const row = new ActionRowBuilder().addComponents(join, start, cancel);

    const embed = new EmbedBuilder()
      .setTitle("Blackjack")
      .setDescription(`${host.username} has started a blackjack game!`)
      .addFields({
        name: "Players",
        value: host.username,
      });

    const message = await interaction.reply({
      embeds: [embed],
      components: [row],
    });

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
    });

    // listen for player joins and other actions
    collector.on("collect", async (i) => {
      // anyone can join
      if (i.customId === "join") {
        if (!players.has(i.user)) {
          players.add(i.user);
          embed.setFields({
            name: "Players",
            value: [...players].map((p) => p.username).join("\n"),
          });
          await interaction.editReply({ embeds: [embed] });
          await i.reply({ content: "Joined game", ephemeral: true });
        } else {
          await i.reply({
            content: "You are already in the game",
            ephemeral: true,
          });
        }
        return;
      }

      // host only commands
      if (i.user !== host) {
        await i.reply({ content: "You are not the host", ephemeral: true });
        return;
      }

      if (i.customId === "start") {
        collector.stop();
        await i.reply({ content: "Game started", ephemeral: true });
        await startGame(interaction, players);
      }

      if (i.customId === "cancel") {
        collector.stop();
        await i.reply("Game ended by host");
        return;
      }
    });
  },
};

// start the game
async function startGame(interaction, players) {
  // the bot is the dealer
  const dealer = interaction.client.user;
  players.add(dealer);
  // this can get a little slow...
  const deck = [];
  // use 2 decks
  for (let i = 0; i < 8; i++) {
    // 11 = J, 12 = Q, 13 = K, 14 = A
    deck.push(2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14);
  }
  shuffle(deck);

  // start game
  const playerHands = new Map();
  const embed = new EmbedBuilder().setTitle("Blackjack!");
  for (const player of players) {
    // each player gets two cards
    const hand = [deck.pop(), deck.pop()];
    playerHands.set(player, hand);

    // hide dealer's first card
    if (player === dealer) {
      embed.addFields({
        name: "Dealer",
        value:
          "?, " +
          hand
            .slice(1)
            .map((c) => printCard(c))
            .join(", "),
        inline: false,
      });
    } else {
      // players' hands
      embed.addFields({
        name: player.username,
        value: hand.map((c) => printCard(c)).join(", "),
        inline: false,
      });
    }
  }

  // game controls
  const hit = new ButtonBuilder()
    .setCustomId("hit")
    .setLabel("Hit")
    .setStyle(ButtonStyle.Primary);

  const stand = new ButtonBuilder()
    .setCustomId("stand")
    .setLabel("Stand")
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder().addComponents(hit, stand);
  await interaction.editReply({ embeds: [embed], components: [row] });

  // begin turns
  for (const player of players) {
    // send turn message
    embed.setDescription(
      `It is ${player.username}'s turn! You have 60 seconds or your stolen goods are forfeit`,
    );
    const message = await interaction.editReply({ embeds: [embed] });

    // dealer's turn
    if (player === dealer) {
      const hand = playerHands.get(player);
      let score = sumHand(hand);

      // dealer keeps hitting until 17
      while (score < 17) {
        hand.push(deck.pop());
        score = sumHand(hand);
      }
      editEmbedField(embed, "Dealer", hand.map((c) => printCard(c)).join(", "));
      // dealer went above 21
      if (score > 21) {
        editEmbedField(
          embed,
          "Dealer",
          "Busted! " + hand.map((c) => printCard(c)).join(", "),
        );
        playerHands.delete(player);
      }

      await interaction.editReply({ embeds: [embed] });
      continue;
    }

    // player's turn
    // only the current player can tap the buttons
    const filter = async (i) => {
      if (i.user.id !== player.id) {
	await i.reply({ content: "Not your turn yet", ephemeral: true });
	return false;
      }
      return true;
    }

    try {
      let move = await message.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: filter,
        time: 60_000,
      });

      // check for player's move, null check is to ensure a move
      // was actually chosen
      while (move && move.customId !== "stand") {
        if (move.customId === "hit") {
          await move.reply({ content: "You chose to hit", ephemeral: true });
          const hand = playerHands.get(player);
          hand.push(deck.pop());

          // player went above 21
          if (sumHand(hand) > 21) {
            editEmbedField(
              embed,
              player.username,
              "Busted! " + hand.map((c) => printCard(c)).join(", "),
            );
            playerHands.delete(player);

            await interaction.editReply({ embeds: [embed] });
            continue;
          }

          editEmbedField(
            embed,
            player.username,
            hand.map((c) => printCard(c)).join(", "),
          );
          const reply = await interaction.editReply({ embeds: [embed] });

          move = await reply.awaitMessageComponent({
            componentType: ComponentType.Button,
            filter: filter,
            time: 60_000,
          });
        }
      }
      // user chose to stand
      await move.reply({ content: "You chose to stand", ephemeral: true });
    } catch (error) {
      console.log(error);
    }
  }

  // all players had a turn, game has ende so decide the winner
  let winner;
  let max = 0;
  for (const [player, hand] of playerHands.entries()) {
    let score = sumHand(hand);

    if (score > max) {
      max = score;
      winner = player;
    }
  }

  if (!winner) {
    embed.setDescription("No one won...");
  } else {
    embed.setDescription(`${winner.username} has won!`);
  }
  await interaction.editReply({ embeds: [embed] });
}

/**
 * Edits the field of an embed
 * @param {Embed} embed embed to change the field of
 * @param {string} name name of the field to change
 * @param {string} value value to set the field to
 */
function editEmbedField(embed, name, value) {
  for (let field of embed.data.fields) {
    if (field.name === name) {
      field.value = value;
      return;
    }
  }
}

/**
 * Shuffle an array **in place**
 * @param {Array} a array to be shuffled
 */
function shuffle(a) {
  // modifies in place
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    // swap
    [a[i], a[j]] = [a[j], a[i]];
  }
}

/**
 * Sum of a hand of card according to Blackjack rules
 * @param {Array} hand array of cards to be summed
 * @return {number} value of the hand
 */
function sumHand(hand) {
  let score = 0;
  let aces = 0;
  for (const card of hand) {
    // J, Q, K are worth 10
    if (card > 10 && card < 14) {
      score += 10;
      // aces are worth 11, usually
    } else if (card === 14) {
      score += 11;
      aces++;
    } else {
      // rest are as is
      score += card;
    }
  }
  // if there are aces and the score is above 21,
  // the value of the ace is negated to 1
  while (score > 21 && aces > 0) {
    score -= 10;
    aces--;
  }
  return score;
}

/**
 * String representation of card, which is represented using ints
 * @param {int} card int representation of card
 * @return {string} string representation of card
 */
function printCard(card) {
  switch (card) {
    case 11:
      return "J";
    case 12:
      return "Q";
    case 13:
      return "K";
    case 14:
      return "A";
    // other cards are the value itself
    default:
      return card;
  }
}

