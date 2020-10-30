const discord = require("discord.js");
const low = require("lowdb");
const fs = require("lowdb/adapters/FileSync");

// Initialize the database
const adapter = new fs("./data/members.json");
const db = low(adapter);
db.defaults({ servers: [] }).write();

/**
 * Environment variables that manage the connection to Discord.
 * @param authToken {string} The authentication token of the Discord bot.
 */
const authToken = process.env.BOT_AUTHTOKEN;

/**
 * Environment variables that manage the messages the bot sends
 * @param defaultMessage {string} The default message that is sent randomly.
 * @param defaultYesMessage {string} The default message when someone sends "yes" to the bot
 * @param defaultNoMessage {string} The default message when someone sends "stop" to the bot
 * @param defaultErrorMessage {string} The default error message.
 */
const defaultMessage = process.env.BOT_DEFAULTMESSAGE;
const defaultYesMessage = process.env.BOT_DEFAULTYESMESSAGE;
const defaultNoMessage = process.env.BOT_DEFAULTNOMESSAGE;
const defaultErrorMessage = process.env.BOT_ERRORMESSAGE;

/**
 * Environment variables that manage timing-based options.
 * @param authToken {string}
 */
const interval = process.env.BOT_INTERVAL;
const maxTime = process.env.BOT_MAXTIME;

// Code to connect the bot to Discord
const client = new discord.Client();
client.login(authToken);

/**
 * Returns a list of all servers that the bot is connected to, among with the members that the bot can find on those servers
 */
const getAllUsers = () => {
  let servers = [];

  client.guilds.cache.forEach((server) => {
    let members = [];
    server.members.cache.forEach((member) => members.push(member));

    servers.push({
      id: server.id,
      name: server.name,
      active: true,
      members: members,
    });
  });

  return servers;
};

/**
 * Initializes the database by writing all users that the bot can see across all servers to the DB
 */
const initializeDatabase = () => {
  console.log("INITIALIZE");
  let serverDatabase = db.get("servers");
  let list = getAllUsers();

  list.forEach((server) => {
    let foundServer = serverDatabase.find({ id: server.id }).value();

    let memberList = [];
    server.members.forEach((member) => {
      let isAdmin =
        member.roles.cache.find((role) => role.name === "Admin") !== undefined;

      if (!member.user.bot) {
        memberList.push({
          id: member.id,
          username: member.user.username + "#" + member.user.discriminator,
          admin: isAdmin,
          permit: true,
        });
      }
    });

    if (foundServer === undefined) {
      serverDatabase
        .push({
          id: server.id,
          name: server.name,
          active: true,
          members: memberList,
        })
        .write();
    } else {
      let members = foundServer.members;
      memberList = memberList.concat(members);

      serverDatabase
        .find({ id: server.id })
        .assign({ members: memberList })
        .write();
    }
  });
};

/**
 * Refreshes the list of members for one particular server. Is executed every time a message is received.
 * @param {string} id the ID of the server whose memberlist shall be updated
 */
const refreshDatabase = (id) => {
  console.log("REFRESHING");
  let serverDatabase = db.get("servers").find({ id: id });
  let serverMembers = client.guilds.cache.get(id).members.cache;
  let foundServer = serverDatabase.value();

  if (foundServer === undefined) {
    initializeDatabase();
  } else {
    serverMembers.forEach((member) => {
      let foundMember = serverDatabase.find({ id: member.id }).value();

      if (foundMember === undefined) {
        if (!member.user.bot) {
          let isAdmin =
            member.roles.cache.find((role) => role.name === "Admin") !==
            undefined;

          let memberList = serverDatabase.value().members;
          memberList.push({
            id: member.id,
            username: member.user.username + "#" + member.user.discriminator,
            admin: isAdmin,
            permit: true,
          });

          serverDatabase.assign({ members: memberList }).write();
        }
      } else {
        serverDatabase
          .find({ id: member.id })
          .assign({ admin: adminRole !== undefined })
          .write();
      }
    });
  }
};

/**
 * Returns a specific user's information from the database
 * @param {string} memberId the ID of the member that shall be found
 */
const getMember = (memberId) => {
  let servers = db.get("servers").value();
  var member;

  servers.forEach((server) => {
    let members = server.members.filter((member) => {
      return member.id === memberId;
    });

    if (members.length !== 0) member = members[0];
  });

  return member;
};

const getServer = (authorId) => {
  let member = getMember(authorId);
  let server = db
    .get("servers")
    .find({ members: [member] })
    .value();

  return server;
};

/**
 * Edits the database to allow or disallow the bot to send random messages to specific users
 * @param {number} mode the editMode (0 = remove, 1 = add)
 * @param {string} memberId the Id of the member whose mode shall be changed
 */
const managePermit = (mode, memberId) => {
  let serverData = getServer(memberId);

  if (serverData !== undefined) {
    serverData.members.forEach((member, i) => {
      if (member.id == memberId) {
        member.permit = mode;

        db.get("server")
          .find({ id: serverData.id })
          .assign({ members: serverData.members })
          .write();
      }
    });
  }
};

/**
 * Sends a message to a random user on a given server
 * @param {string} id the ID of the server affected
 */
const sendMessage = (id) => {
  console.log("SENDMESSAGE");
  let server = db.get("servers").find({ id: id }).value();

  if (!server.active) {
    return;
  } else {
    let members = server.members;

    var invalid = true;
    var randomMember;
    while (invalid) {
      randomMember = members[Math.floor(Math.random() * members.length)];

      if (randomMember !== undefined) {
        if (randomMember.permit) invalid = false;
      }
    }

    console.log(randomMember.username);

    if (client.users.cache.get(randomMember.id) !== undefined) {
      client.users.cache
        .get(randomMember.id)
        .send(defaultMessage.replace(/['"]+/g, ""));
    } else {
      console.log("Skipped because of invalid user error.");
    }
  }
};

/**
 * Function that sends a message to a random user on every server at a random interval.
 */
const sendAutomatic = () => {
  let waitTime = 1000 * Math.floor(Math.random() * maxTime);
  setTimeout(() => {
    db.get("servers")
      .value()
      .forEach((server) => sendMessage(server.id));
  }, waitTime);
};

/**
 * Checks if a user is an administrator based on the message they sent in.
 * @param {*} message The message a user sent
 */
const authenticate = (message) => {
  let member = getMember(message.author.id);

  var isAdmin = false;
  if (member !== undefined) {
    if (member.admin) {
      isAdmin = true;
    }
  }

  return isAdmin;
};

const setActive = (active, authorId) => {
  let server = getServer(authorId);

  if (server !== undefined) {
    db.get("servers")
      .find({ id: server.id })
      .assign({ active: active })
      .write();
  }
};

const fire = (authorId) => {
  let server = getServer(authorId);
  if (server !== undefined) {
    sendMessage(server.id);
  }
};

/**
 * Function that is triggered every time the bot receives a message.
 */
client.on("message", (message) => {
  if (message.guild !== null) refreshDatabase(message.guild.id);

  if (message.content === "!help" || message.content === "help") {
    message.channel.send(
      "Hi, I'm ShishaBot. I randomly ask people if they want to smoke Hookah (ger. Shisha) with me. \n" +
        "I can do a couple of things, such as:\n" +
        " - `help`: Show this menu\n" +
        " - `amadmin`: Tell you if you are a server administrator\n" +
        " - `stop`: Avoid sending you messages\n" +
        " - `fwiend?`: Get me to send you messages"
    );

    if (authenticate(message)) {
      message.channel.send(
        "Additional commands for administrators (such as you):\n" +
          " - `fire`: Show this menu\n" +
          " - `activate`: Activate\n" +
          " - `deactivate`: Deactivate\n"
      );
    }
  }

  if (message.content === "amadmin") {
    message.channel.send(authenticate(message).toString());
  }

  if (message.content === "activate") {
    if (authenticate(message)) {
      setActive(true, message.author.id);
    } else {
      message.channel.send("Error: Insufficient permissions.");
    }
  }

  if (message.content === "deactivate") {
    if (authenticate(message)) {
      setActive(false, message.author.id);
    } else {
      message.channel.send("Error: Insufficient permissions.");
    }
  }

  if (message.content === "fire") {
    if (authenticate(message)) {
      message.channel.send("Firing.");
      fire(message.author.id);
    } else {
      message.channel.send("Error: Insufficient permissions.");
    }
  }

  if (message.content == "stop") {
    managePermit(false, message.author.id);
    message.channel.send(defaultNoMessage.replace(/['"]+/g, ""));
  }

  if (message.content == "fwiend?") {
    managePermit(true, message.author.id);
    message.channel.send(defaultYesMessage.replace(/['"]+/g, ""));
  }
});

/**
 * Function that is triggered on start of the bot.
 */
client.once("ready", () => {
  console.log("Ready!");
  client.user.setStatus("online");
  client.user.setActivity("Shisha / Hookah", { type: "COMPETING" });

  initializeDatabase();

  sendAutomatic();
  setInterval(sendAutomatic, 1000 * interval);
});
