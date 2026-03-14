export default class RegisterScene extends Phaser.Scene {

  constructor() {
    super("RegisterScene");
  }

  preload() {

    this.load.image("bg", "assets/nen_1.png");
    this.load.image("icon", "assets/ui/cotyphu.png");
    this.load.image("panel", "assets/ui/panel.png");
  }

  showAlert(message){

    const { width, height } = this.scale;

    const container = this.add.container(width/2, height/2);

    // nền
    const bg = this.add.rectangle(0,0,320,150,0x000000,0.75)
    .setStrokeStyle(4,0xffc66d)
    .setOrigin(0.5);

    // text
    const text = this.add.text(0,-10,message,{
      fontFamily:"Signika",
      fontSize:"20px",
      color:"#fff6d7",
      align:"center",
      wordWrap:{width:260}
    }).setOrigin(0.5);

    // button
    const btn = this.add.text(0,45,"OK",{
      fontFamily:"Signika",
      fontSize:"22px",
      color:"#3b1b00",
      backgroundColor:"#ffa63c",
      padding:{x:20,y:8}
    })
    .setOrigin(0.5)
    .setInteractive();

    btn.on("pointerdown",()=>{
      container.destroy();
    });

    container.add([bg,text,btn]);
  }

  create() {

    const { width, height } = this.scale;

    // BACKGROUND
    const bg = this.add.image(width / 2, height / 2, "bg");
    bg.setScale(Math.max(width / bg.width, height / bg.height));
    bg.setDepth(-10);

    // PANEL
    const panelWidth = 420;
    const panelHeight = 420;

    const panelX = width / 2;
    const panelY = height / 2 + 10;

    this.createDashedPanel(panelX, panelY, panelWidth, panelHeight, 22);

    // LOGO
    const logo = this.add.image(panelX, panelY - 225, "icon");
    logo.setScale(0.9);
    logo.setDepth(5);

    // TITLE
    this.add.text(panelX, panelY - 125, "ĐĂNG KÝ", {
      fontFamily: "Signika",
      fontSize: "30px",
      color: "#3c2a12",
      fontStyle: "bold",
    }).setOrigin(0.5);

    // FORM HTML
    const form = document.createElement("div");

    form.style.position = "absolute";
    form.style.top = "50%";
    form.style.left = "50%";
    form.style.transform = "translate(-50%, -35%)";
    form.style.display = "flex";
    form.style.flexDirection = "column";
    form.style.gap = "18px";
    form.style.width = "260px";

    form.innerHTML = `

    <input id="username" class="gameInput" placeholder="Tài khoản"/>
    <input id="email" class="gameInput" placeholder="Email"/>
    <input id="password" class="gameInput" type="password" placeholder="Mật khẩu"/>

    <button id="registerBtn" class="gameBtn">
      Đăng ký
    </button>

    `;

    document.body.appendChild(form);

    const btn = document.getElementById("registerBtn");

    btn.onclick = async () => {

    const username = document.getElementById("username").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    // ===== CHECK RỖNG =====
    if(!username || !email || !password){
        this.showAlert("Vui lòng nhập đầy đủ thông tin");
        return;
    }

    // ===== CHECK KHOẢNG TRẮNG =====
    if(username.includes(" ") || email.includes(" ") || password.includes(" ")){
        alert("Thông tin không được chứa khoảng trắng");
        return;
    }

    // ===== GỬI SERVER =====
    const res = await fetch("http://localhost:3000/register",{

        method:"POST",

        headers:{
        "Content-Type":"application/json"
        },

        body:JSON.stringify({
        username,
        email,
        password
        })

    });

    const data = await res.json();

    alert(data.message);

    };

    // GAME STYLE
    const style = document.createElement("style");

    style.innerHTML = `

    .gameInput{

      all:unset;
      padding:12px;

      color:#5b1f07;

      border-radius:10px;

      border-top:3px solid #a38643;
      border-left:3px solid #a38643;
      border-bottom:1px solid #a38643;
      border-right:1px solid #a38643;

      background:#ecc383;

      font-family:Signika;
      font-size:16px;
      font-weight:bold;

      box-shadow:
      inset 0 3px 6px rgba(0,0,0,0.2);

    }

    .gameInput::placeholder{
      color:#fff6d7;
    }

    .gameBtn{

      padding:12px;

      border-radius:16px;
      border:2.5px solid #6a3a10;

      background: linear-gradient(
      to bottom,
      #ffa63c,
      #f07e2a 60%,
      #d8611a
      );

      color:#3b1b00;

      font-family:Signika;
      font-size:18px;
      font-weight:bold;

      box-shadow:
      inset 0 2px 0 rgba(255,255,255,0.6),
      0 5px 0 #5a2c0d;

      cursor:pointer;

      transition:0.15s;

    }

    .gameBtn:hover{

      filter:brightness(1.1);

    }

    .gameBtn:active{

      transform:translateY(4px);

      box-shadow:
      inset 0 2px 0 rgba(255,255,255,0.4),
      0 1px 0 #5a2c0d;

    }

    `;

    document.head.appendChild(style);

  }

createDashedPanel(x, y, w, h, radius) {

  const g = this.add.graphics();

  const left = x - w / 2;
  const top = y - h / 2;

  // nền panel
  g.fillStyle(0xffe7c3, 1);
  g.fillRoundedRect(left, top, w, h, radius);

  g.lineStyle(3, 0xb7a36d);

  const inset = 12;
  const r = radius - inset / 2;

  const iL = left + inset;
  const iR = x + w / 2 - inset;
  const iT = top + inset;
  const iB = y + h / 2 - inset;

  const drawD = (x1, y1, x2, y2) => {

    const dist = Phaser.Math.Distance.Between(x1, y1, x2, y2);
    const angle = Phaser.Math.Angle.Between(x1, y1, x2, y2);

    for (let i = 0; i < dist; i += 18) {

      g.beginPath();

      g.moveTo(
        x1 + Math.cos(angle) * i,
        y1 + Math.sin(angle) * i
      );

      g.lineTo(
        x1 + Math.cos(angle) * (i + 10),
        y1 + Math.sin(angle) * (i + 10)
      );

      g.strokePath();
    }
  };

  // ===== TOP (chia 2 đoạn để chừa chữ) =====

  const gap = 120;

  drawD(iL + r, iT, x - gap, iT);
  drawD(x + gap, iT, iR - r, iT);

  // ===== RIGHT =====
  drawD(iR, iT + r, iR, iB - r);

  // ===== BOTTOM =====
  drawD(iR - r, iB, iL + r, iB);

  // ===== LEFT =====
  drawD(iL, iB - r, iL, iT + r);

  // ===== CORNER ARCS =====

  const drawArc = (cx, cy, start, end) => {

    const step = 0.2;

    for (let a = start; a < end; a += step) {

      const x1 = cx + Math.cos(a) * r;
      const y1 = cy + Math.sin(a) * r;

      const x2 = cx + Math.cos(a + step / 2) * r;
      const y2 = cy + Math.sin(a + step / 2) * r;

      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.strokePath();
    }
  };

  drawArc(iL + r, iT + r, Math.PI, Math.PI * 1.5);      // top-left
  drawArc(iR - r, iT + r, Math.PI * 1.5, Math.PI * 2);  // top-right
  drawArc(iR - r, iB - r, 0, Math.PI / 2);              // bottom-right
  drawArc(iL + r, iB - r, Math.PI / 2, Math.PI);        // bottom-left
}

}