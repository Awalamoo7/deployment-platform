import "dotenv/config";
import express from "express";
import cors from "cors";
import router from "./routes.js";
import { initDB } from "./db.js";

const app = express();
const PORT = Number(process.env["PORT"] ?? 4000);

app.use(cors());
app.use(express.json());
app.use(router);

initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err: unknown) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });
