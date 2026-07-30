// Vercel serverless entry. The rewrite in vercel.json maps /v1/* here, and
// the Express app also mounts under /v1, so paths line up in both dev and prod.
import { createApp } from "../src/app.js";

export default createApp();
