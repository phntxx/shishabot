const discord = require("discord.js");

const low = require("lowdb");
const fs = require("lowdb/adapters/FileSync");

const adapter = new fs("members.json");
const db = low(adapter);

db.defaults({ members: [] }).write();

const authToken = "";
const serverID = "";
const adminRoleID = "";

const defaultMessage =
  "Hast du Lust Shisha zu rauchen? Do you want to smoke hookah with me?";
const defaultNoMessage = "Plötzlich elit geworden?";
const defaultYesMessage = "fwiend.";
const defaultNoErrorMessage =
  "uff, irgendwas is schief gelaufen. uhm, sth went wrong";
const defaultYesErrorMessage = "we awe awweady fwiends ow something went wwong";

// Code to connect the bot to Discord
const client = new discord.Client();
client.login(authToken);

var active = false;

// Update the database.
const refreshMembers = () => {
  let memberDataBase = db.get("members");
  let members = getAllUsers();

  members.forEach((member) => {
    let foundMember = memberDataBase.find({ id: member.id }).value();
    let adminRole = member.roles.cache.find((role) => role.id === adminRoleID);

    if (foundMember === undefined) {
      if (!member.user.bot) {
        memberDataBase
          .push({
            id: member.id,
            username: member.username,
            admin: adminRole !== undefined,
            permit: true,
          })
          .write();
      }
    } else {
      memberDataBase
        .find({ id: member.id })
        .assign({ admin: adminRole !== undefined })
        .write();
    }
  });
};

const getAllUsers = () => {
  const list = client.guilds.cache.get(serverID);

  let members = [];
  list.members.cache.forEach((member) => members.push(member));

  return members;
};

const getMember = (id) => {
  return db.get("members").find({ id: id }).value();
};

const managePermit = (mode, id) => {
  let member = db.get("members").find({ id: id });
  let memberData = member.value();

  // mode 1 -> add
  // mode 0 -> remove
  if (memberData !== undefined) {
    memberData.permit = mode === 1;
    member.assign(memberData).write();
    return "success";
  } else {
    return "error";
  }
};

const sendMessage = () => {
  let members = db.get("members").value();

  var invalid = true;
  var randomMember;
  while (invalid) {
    randomMember = members[Math.floor(Math.random() * members.length)];

    if (randomMember.permit) {
      invalid = false;
    }
  }

  if (client.users.cache.get(randomMember.id) !== undefined) {
    client.users.cache.get(randomMember.id).send(defaultMessage);
  } else {
    console.error("Skipped because of invalid user error.");
  }
};

const sendAutomatic = () => {
  console.log(
    active ? "Automatic sending active" : "Automatic sending inactive."
  );

  if (active) {
    let time = Math.floor(Math.random() * 60 * 60 * 24) + 10;
    console.log("Waiting " + time + "s");
    setTimeout(sendMessage, 1000 * time);
  }
};

// Function that handles I/O between users and the bot.
client.on("message", (message) => {
  refreshMembers();

  if (message.content == "ping") {
    message.channel.send("pong");
  }

  if (message.content === "amadmin") {
    let member = getMember(message.author.id);
    message.channel.send(member.admin ? "Yes" : "No");
  }

  if (message.content === "activate") {
    if (getMember(message.author.id).admin) {
      active = true;
      sendAutomatic();
      message.channel.send("Activating.");
    } else {
      message.channel.send("Error: Insufficient permissions.");
    }
  }

  if (message.content === "deactivate") {
    if (getMember(message.author.id).admin) {
      active = false;
      message.channel.send("Deactivating.");
    } else {
      message.channel.send("Error: Insufficient permissions.");
    }
  }

  if (message.content === "fire") {
    if (getMember(message.author.id).admin) {
      message.channel.send("Firing.");
      sendMessage();
    } else {
      message.channel.send("Error: Insufficient permissions.");
    }
  }

  if (message.content == "stop") {
    let code = managerPermit(0, message.author.id);

    if (code === "success") {
      message.channel.send(defaultNoMessage);
    } else {
      message.channel.send(defaultNoErrorMessage);
    }
  }

  if (message.content == "fwiend?") {
    let code = managePermit(1, message.author.id);

    if (code === "success") {
      message.channel.send(defaultYesMessage);
    } else {
      message.channel.send(defaultYesErrorMessage);
    }
  }
});

// Code that runs once the bot is ready
client.once("ready", () => {
  console.log("Ready!");
  client.user.setStatus("online");
  client.user.setActivity("Shisha / Hookah", { type: "PLAYING" });

  refreshMembers();

  sendAutomatic();
  setInterval(sendAutomatic, 1000 * 60 * 60);
});
