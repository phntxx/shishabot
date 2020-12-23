const discord = require("discord.js");
const postgres = require("pg");
const fs = require("fs");

const settingsData = fs.readFileSync("../conf/settings.json");
const settings = JSON.parse(settingsData);

/**
 * Variable definitions to connect the bot to Discord and the PostgreSQL database.
 */
const discordClient = new discord.Client();
discordClient.login(settings.discord.authToken);

postgres.defaults.ssl = false;
const databaseClient = new postgres.Client(settings.postgres);
databaseClient.connect();

const createTables = () => {
  databaseClient.query(
    "CREATE TABLE IF NOT EXISTS Member (id SERIAL PRIMARY KEY, userid VARCHAR NOT NULL UNIQUE, username VARCHAR NOT NULL, permission BOOLEAN NOT NULL DEFAULT true)"
  );
  databaseClient.query(
    "CREATE TABLE IF NOT EXISTS Server (id SERIAL PRIMARY KEY, serverid VARCHAR NOT NULL UNIQUE, name VARCHAR NOT NULL, enabled BOOLEAN NOT NULL DEFAULT true)"
  );
  databaseClient.query(
    "CREATE TABLE IF NOT EXISTS MemberOfServer (id SERIAL PRIMARY KEY, serverid VARCHAR references Server(serverid) ON DELETE CASCADE ON UPDATE CASCADE, memberid VARCHAR references Member(userid) ON DELETE CASCADE ON UPDATE CASCADE, unique (serverid, memberid))"
  );
  databaseClient.query(
    "CREATE TABLE IF NOT EXISTS AdministratorOfServer (id SERIAL PRIMARY KEY, serverid VARCHAR references Server(serverid) ON DELETE CASCADE ON UPDATE CASCADE, memberid VARCHAR references Member(userid) ON DELETE CASCADE ON UPDATE CASCADE, unique (serverid, memberid))"
  );
};

/**
 * Wrapper-function for database queries
 * @param {*} mode the type of query that shall be performed
 * @param {*} value the values that the query shall be filtered with
 * @param {*} callback the function that is performed after the data has been retrieved
 */
const check = (mode, value, callback) => {
  let query = { text: "", values: [] };

  switch (mode) {
    case "member":
      query.text = "SELECT COUNT(*) FROM member WHERE userid=$1";
      query.values = [value];
      break;
    case "server":
      query.text = "SELECT COUNT(*) FROM server WHERE serverid=$1";
      query.values = [value];
      break;
    case "enabledserver":
      query.text = "SELECT serverid FROM server WHERE enabled=true";
      break;
    case "memberofserver":
      query.text =
        "SELECT COUNT(*) FROM memberofserver WHERE serverid=$1 AND memberid=$2";
      query.values = value;
      break;
    case "adminofserver":
      query.text =
        "SELECT COUNT(*) FROM administratorofserver WHERE serverid=$1 AND memberid=$2";
      query.values = value;
      break;
    case "admin":
      query.text =
        "SELECT * FROM server, administratorofserver WHERE server.serverid=administratorofserver.serverid AND memberid=$1";
      query.values = [value];
  }

  if (query.text !== "" && query.values.length != 0) {
    databaseClient.query(query).then((res) => callback(res.rows));
  }
};

/**
 * Updates the database every time a new message is received.
 * @param {Message} m the message that was received by the bot
 */
const updateDatabase = (m) => {
  if (!m.author.bot && !m.author.system) {
    check("member", m.author.id, (rows) => {
      if (rows[0].count == 0) add("user", m.author);
    });

    if (m.channel.type === "text") {
      check("server", m.channel.guild.id, (rows) => {
        if (rows[0].count == 0) add("server", m.channel.guild);
      });

      check("memberofserver", [m.channel.guild.id, m.author.id], (rows) => {
        if (rows[0].count == 0) add("member", m);
      });

      check("adminofserver", [m.channel.guild.id, m.author.id], (rows) => {
        rules = [m.member.hasPermission("ADMINISTRATOR"), rows[0].count != 0];

        if (rules[0] && !rules[1]) add("administrator", m);
        if (!rules[0] && rules[1]) remove("administrator", m);
      });
    }
  }
};

/**
 * Function that adds something to the database
 * @param {string} mode the type of the item that shall be added
 * @param {any} data the data the item shall be populated with
 */
const add = (mode, data) => {
  let query = { text: "", values: [] };
  switch (mode) {
    case "user":
      query.text = "INSERT INTO member(userid, username) VALUES ($1, $2)";
      query.values = [data.id, `${data.username}#${data.discriminator}`];
      break;
    case "server":
      query.text = "INSERT INTO server(serverid, name) VALUES ($1, $2)";
      query.values = [data.id, data.name];
      break;
    case "member":
      query.text =
        "INSERT INTO memberofserver(serverid, memberid) VALUES ($1, $2)";
      query.values = [data.channel.guild.id, data.author.id];
      break;
    case "administrator":
      query.text =
        "INSERT INTO administratorofserver(serverid, memberid) VALUES ($1, $2)";
      query.values = [data.channel.guild.id, data.author.id];
      break;
    default:
      break;
  }

  if (query.text !== "" && query.values.length != 0) {
    databaseClient.query(query);
  }
};

const remove = (mode, data) => {
  if (mode === "administrator") {
    databaseClient.query({
      text:
        "DELETE FROM administratorofserver WHERE serverid=$1 AND memberid=$2",
      values: [data.channel.guild.id, data.author.id],
    });
  }
};

/**
 * Function that updates user and server permissions
 * @param {*} mode The type of permission that shall be modified
 * @param {*} data The ID of the respective user or server
 */
const updatePermissions = (mode, data) => {
  let query = { text: "", values: [data] };
  switch (mode) {
    case "userenable":
      query.text = "UPDATE member SET permission=true WHERE userid=$1";
      break;
    case "userdisable":
      query.text = "UPDATE member SET permission=false WHERE userid=$1";
      break;
    case "serverenable":
      query.text = "UPDATE server SET enable=true WHERE serverid=$1";
      break;
    case "serverdisable":
      query.text = "UPDATE server SET enable=false WHERE serverid=$1";
      break;
    default:
      break;
  }

  if (query.text !== "") databaseClient.query(query);
};

/**
 * Function that fires the bot to send a message to a random enabled person on every enabled server
 * @param {*} server (optional)
 */
const send = (server = 0) => {
  if (server == 0) {
    check("enabledserver", [], (rows) => {
      rows.forEach((row) => send(row.serverid));
    });
  }

  if (server !== 0) {
    databaseClient
      .query({
        text:
          "SELECT memberofserver.memberid FROM memberofserver, member WHERE member.userid=memberofserver.memberid AND memberofserver.serverid=$1 AND member.permission=true ORDER BY random() LIMIT 1",
        values: [server],
      })
      .then((res) => {
        res.rows.forEach((row) => {
          discordClient.users.cache
            .get(row.memberid)
            .send(settings.messages.default.replace(/['"]+/g, ""));
        });
      });
  }
};

const sendMessage = () => {
  let time = 1000 * Math.floor(Math.random() * settings.timing.wait);
  setTimeout(send, time);
};

const botWasMentioned = (m) => {
  if (m.channel.type === "text" && m.mentions.members.first() !== undefined) {
    return m.mentions.members.first().id === settings.discord.clientId;
  } else {
    return false;
  }
};

/**
 * The function that handles received messages.
 * The database is updated with every message, but a response is only sent when the bot is mentioned or the message is received via DM.
 */
discordClient.on("message", (message) => {
  if (!message.author.bot && !message.author.system) {
    updateDatabase(message);

    let content = message.content.toLowerCase();

    if (botWasMentioned(message)) {
      if (content.includes("!enable")) {
        check(
          "adminofserver",
          [message.channel.guild.id, message.author.id],
          (rows) => {
            if (rows.length !== 0)
              updatePermissions("serverenable", message.channel.guild.id);
            message.channel.send(
              `Shishabot is enabled on ${message.channel.guild.name}.`
            );
          }
        );
      }

      if (content.includes("!disable")) {
        check(
          "adminofserver",
          [message.channel.guild.id, message.author.id],
          (rows) => {
            if (rows.length !== 0)
              updatePermissions("serverdisable", message.channel.guild.id);
            message.channel.send(
              `Shishabot is disabled on ${message.channel.guild.name}.`
            );
          }
        );
      }
    }

    if (botWasMentioned(message) || message.channel.type === "dm") {
      if (content.includes("!help")) {
        message.channel.send(
          "Hi, I'm ShishaBot. I randomly ask people if they want to smoke Hookah (ger. Shisha) with me. \n" +
            "I can do a couple of things, such as:\n" +
            " - `!help`: Show this menu\n" +
            " - `!amadministrator`: Tell you if you are a server administrator\n" +
            " - `!stop`: Get me to stop sending you messages\n" +
            " - `!start`: Get me to start sending you messages"
        );

        if (message.channel.type === "dm") {
          check("admin", message.author.id, (rows) => {
            if (rows.length !== 0) {
              message.channel.send(
                "For administrators, I can do a couple of other things too, such as:\n" +
                  " - `!fire`: Send a message to a random user on every server that you are the admin of\n" +
                  " - `!enable`: Enable me on every server that you are the admin of\n" +
                  " - `!disable`: Disable me on every server that you are the admin of\n"
              );
            }
          });
        } else if (botWasMentioned(message)) {
          check(
            "adminofserver",
            [message.channel.guild.id, message.author.id],
            (rows) => {
              if (rows.length !== 0) {
                message.channel.send(
                  "For administrators, I can do a couple of other things too, such as:\n" +
                    " - `!fire`: Send a message to a random user of this server\n" +
                    " - `!enable`: Enable me on this server\n" +
                    " - `!disable`: Disable me on this server\n"
                );
              }
            }
          );
        }
      }

      if (content.includes("!fire")) {
        if (message.channel.type === "dm") {
          check("admin", message.author.id, (rows) => {
            rows.forEach((row) => send(row.serverid));
          });
        } else if (botWasMentioned(message)) {
          check(
            "adminofserver",
            [message.channel.guild.id, message.author.id],
            (rows) => {
              if (rows.length !== 0) send(message.channel.guild.id);
            }
          );
        }
      }

      if (content.includes("!stop")) {
        updatePermissions("userdisable", message.author.id);
        message.channel.send(settings.messages.deactivate);
      }

      if (content.includes("!start")) {
        updatePermissions("userenable", message.author.id);
        message.channel.send(settings.messages.activate);
      }

      if (content.includes("!amadministrator")) {
        if (message.channel.type === "dm") {
          check("admin", message.author.id, (rows) => {
            let servers = [];
            rows.forEach((row) => servers.push(row.name));

            if (servers.length !== 0) {
              message.channel.send(`You are admin on: ${servers.join(", ")}`);
            } else {
              message.channel.send(
                "You are no administrator on any server I know."
              );
            }
          });
        } else if (botWasMentioned(message)) {
          check(
            "adminofserver",
            [message.channel.guild.id, message.author.id],
            (rows) => {
              message.channel.send(rows.length !== 0);
            }
          );
        }
      }
    }

    if (message.channel.type === "dm") {
      if (content.includes("yes") || content.includes("ja")) {
        message.channel.send(settings.messages.yes);
      }

      if (content.includes("no") || content.includes("nein")) {
        message.channel.send(settings.messages.no);
      }
    }
  }
});

/**
 * The function that runs once the bot is connected with Discord, thereby up and running.
 * Think of this like you would of a "main"-function.
 */

createTables();

discordClient.once("ready", () => {
  discordClient.user.setStatus("online");
  discordClient.user.setActivity("Shisha / Hookah", { type: "COMPETING" });
});

setInterval(sendMessage, settings.timing.interval);
