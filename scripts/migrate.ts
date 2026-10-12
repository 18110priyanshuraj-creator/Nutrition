import "dotenv/config";
import { getDb } from "../src/lib/db";
getDb();
console.log("Database migrations are up to date. SQLite path: "+(process.env.DATABASE_PATH||"./data/mynutri.sqlite"));