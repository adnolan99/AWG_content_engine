import "dotenv/config";
import { loadConfig } from "./config.js";
import { getDb } from "./queue/db.js";
import { createQueueServer } from "./queue/server.js";
import { startScheduler } from "./scheduler.js";

function log(message: string) {
  const time = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${time} [engine] ${message}`);
}

async function main() {
  // Load config and initialize database
  const config = loadConfig();
  getDb();
  log("Database initialized");

  // Start the review queue web UI
  const port = parseInt(process.env.QUEUE_PORT || "4000", 10);
  const queueApp = createQueueServer();
  queueApp.listen(port, () => {
    log(`Review queue UI running at http://localhost:${port}/queue`);
  });

  // Start the scheduler
  startScheduler();

  log("AWG Content Engine is running");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
