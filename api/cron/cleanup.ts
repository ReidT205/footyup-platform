import { cleanup } from "../../src/handlers/cleanup.js";
import { getDeps } from "../../src/lib/deps.js";
import { endpoint } from "../../src/lib/http.js";

export const GET = endpoint("cron.cleanup", (req) => cleanup(req, getDeps()));
