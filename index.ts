import { config as loadEnv } from "dotenv";
import express from "express";
import storageManager from "node-persist";

import { registerRoutes } from "./api/simple-router.js";
import { PersistentJson } from "./utils/persistent-json.js";
import { DroplistStorage, Storage, TasksStorage, UsersStorage, XRequestsStorage } from "./types/storage.js";

async function start() {
  const loadEnvResult = loadEnv();
  if (loadEnvResult.error) {
    console.warn(`Error while loading .env: ${loadEnvResult.error}`);
  }

  // Data (memory + json files (synced) currently, could be migrated to a database solution if needed in the future)
  await storageManager.init({ dir: "storage" });
  const storage: Storage = {
    tasks: new PersistentJson<TasksStorage>("tasks", []),
    users: new PersistentJson<UsersStorage>("users", {}),
    xRequests: new PersistentJson<XRequestsStorage>("xRequests", {}),

    droplist: new PersistentJson<DroplistStorage>("droplist", []),
  };

  let isStopping = false;
  process.on("SIGINT", async () => {
    if (isStopping) {
      // Sigint can be fired multiple times
      return;
    }
    isStopping = true;
    console.log("Stopping...");

    await Promise.all(
      Object.values(storage).map((storageItem) => {
        return storageItem.update(() => {}); // Save all memory values to disk
      })
    );
    process.exit();
  });

  // Webserver
  const app = express();
  registerRoutes(app, storage);

  var server = app.listen(process.env.PORT ?? 3001, () => {
    const addressInfo = server.address() as any;
    var host = addressInfo.address;
    var port = addressInfo.port;
    console.log(`Webserver started on ${host}:${port}`);
  });
}

start().catch(console.error);
