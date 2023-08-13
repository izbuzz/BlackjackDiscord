// run this file when add or updating new commands
const fs = require("node:fs");
const path = require("node:path");
const { REST, Routes } = require("discord.js");
const { token, cliendId } = require("./config.json");

// register slash commands
const commands = [];
const foldersPath = path.join(__dirname, "commands");
const commandFolder = fs.readdirSync(foldersPath);

for (const file of commandFolder) {
  const filePath = path.join(foldersPath, file);
  const command = require(filePath);
  if ("data" in command && "execute" in command) {
    commands.push(command.data.toJSON());
  } else {
    console.log(`[WARNING] The command at ${filePath} 
      is missing a required "data" or "execute" property.`);
  }
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(token);

(async () => {
  try {
    console.log(`Started refreshing ${commands.length} Slash (/) commands.`);
    // globally update the data
    const data = await rest.put(Routes.applicationGuildCommands(clientId), {
      body: commands,
    });
    console.log(`Successfully reloaded ${data.length} Slash (/) commands.`);
  } catch (error) {
    console.error(error);
  }
})();
