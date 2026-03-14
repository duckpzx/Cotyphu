// Server.js
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

import userService from "./src/server/services/user.service.js";
import characterService from "./src/server/services/character.service.js";

const app = express();

// tạo __dirname cho ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname)));
console.log("🚀 Server đang chạy...");

const players = {};

io.on("connection", (socket) => {
  console.log("\n========== NEW CONNECTION ==========");
  console.log("✅ Player connected:", socket.id);
  console.log("👥 Current players before:", Object.keys(players));

  // Tạo player placeholder (sẽ được cập nhật khi client gửi thông tin nhân vật)
  players[socket.id] = {
    id: socket.id,
    index: 0,
    skin: 1,
    characterName: "Minotaur",
    name: "Player"
  };

  console.log("👥 Current players after:", Object.keys(players));

  // Khi client gửi event 'join', cập nhật thông tin skin/characterName và broadcast cho tất cả
  socket.on("join", (data) => {
    const skin = data?.skin || players[socket.id].skin;
    const characterName = data?.characterName || players[socket.id].characterName;
    const name = data?.name || players[socket.id].name;

    players[socket.id] = {
      ...players[socket.id],
      skin,
      characterName,
      name,
    };

    console.log("📥 Player joined:", players[socket.id]);

    // Gửi danh sách players hiện tại cho player mới (đã bao gồm info của tất cả người chơi)
    socket.emit("currentPlayers", players);

    // Báo cho tất cả người khác về player mới (với skin/characterName đúng)
    socket.broadcast.emit("newPlayer", players[socket.id]);
  });

  // Lắng nghe sự kiện di chuyển
  socket.on("move", (data) => {
    console.log("🎲 Move from:", socket.id, "to:", data.index);
    if (players[socket.id]) {
      players[socket.id].index = data.index;
      io.emit("playerMoved", {
        id: socket.id,
        index: data.index,
        skin: players[socket.id].skin,
        characterName: players[socket.id].characterName,
        name: players[socket.id].name,
      });
    }
  });

  socket.on("rollDice", (data) => {
    console.log("🎲 Roll from:", socket.id, "value:", data.diceValue);
    io.emit("playerRolled", {
      id: socket.id,
      diceValue: data.diceValue,
      characterName: players[socket.id]?.characterName,
      name: players[socket.id]?.name,
    });
  });

  socket.on("disconnect", () => {
    console.log("\n========== DISCONNECT ==========");
    console.log("❌ Player disconnected:", socket.id);
    delete players[socket.id];
    console.log("👥 Remaining players:", Object.keys(players));
    io.emit("playerDisconnected", socket.id);
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post("/register", async (req,res)=>{

  const {username,email,password} = req.body;

  const result = await userService.register(
    username,
    email,
    password
  );

  res.json(result);

});

app.post("/login", async (req,res)=>{

  const {username,password} = req.body;

  const result = await userService.login(
    username,
    password
  );

  res.json(result);

});

app.get("/characters", async (req,res)=>{

  try{

    const result = await characterService.getCharacters();

    res.json(result);

  }catch(err){

    console.error(err);

    res.status(500).json({
      success:false,
      message:"Server error"
    });

  }

});

app.post("/create-character", async (req, res) => {

  try{

    const { user_id, character_id, name } = req.body;

    if(!user_id || !character_id || !name){
      return res.json({
        success:false,
        message:"Thiếu dữ liệu"
      });
    }

    const result = await characterService.createCharacter(
      user_id,
      character_id,
      name
    );

    res.json(result);

  }catch(err){

    console.error(err);

    res.status(500).json({
      success:false,
      message:"Server error"
    });

  }

});

server.listen(3000, () => {
  console.log("✅ Server ready at http://localhost:3000");
});