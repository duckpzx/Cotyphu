import db from "./src/server/config/db.js";

async function run() {
  try {
    const [cols] = await db.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'cotyphu' AND TABLE_NAME = 'users'"
    );
    const colNames = cols.map(c => c.COLUMN_NAME);
    console.log("Current user columns:", colNames);
    if (!colNames.includes("tarot_levels")) {
      await db.query("ALTER TABLE users ADD COLUMN tarot_levels JSON NULL");
      console.log("Added tarot_levels column");
    } else {
      console.log("tarot_levels already exists");
    }
    if (!colNames.includes("tarot_luck_pity")) {
      await db.query("ALTER TABLE users ADD COLUMN tarot_luck_pity JSON NULL");
      console.log("Added tarot_luck_pity column");
    } else {
      console.log("tarot_luck_pity already exists");
    }
  } catch (e) {
    console.error("Migration error:", e);
  } finally {
    process.exit(0);
  }
}

run();
