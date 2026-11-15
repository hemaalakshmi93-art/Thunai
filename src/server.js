import { createApp } from './app.js';
import { config } from './config.js';
import { runTick } from './services/reminders.js';
import { createStore } from './store/index.js';

const store = await createStore();
const server = createApp(store).listen(config.port, () => {
  console.log(`Thunai listening on :${config.port} (store=${config.store})`);
});

// Optional in-process scheduler (Cloud Run min-instances=1). Cloud Scheduler is the default path.
let timer;
if (config.reminders.internalTick) {
  timer = setInterval(() => runTick(store).catch((e) => console.error('tick error', e.message)), 60_000);
}

const shutdown = () => { clearInterval(timer); server.close(() => process.exit(0)); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
