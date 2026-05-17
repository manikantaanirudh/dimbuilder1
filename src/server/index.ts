import { createApp } from "./app";
import { loadAppConfig } from "./config/loadAppConfig";
import { createDatabase } from "./db/database";

const config = loadAppConfig();
const db = createDatabase(config.paths.databaseFile);

createApp(db, config).listen(config.server.port, config.server.host, () => {
  console.log(`${config.application.productName} API listening on http://${config.server.host}:${config.server.port}`);
});
