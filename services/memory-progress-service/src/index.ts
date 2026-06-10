import { createApp } from './app';

const port = process.env.PORT ? Number(process.env.PORT) : 4003;
const app = createApp();

app.listen(port, () => {
  console.log(`memory-progress-service listening on port ${port}`);
});
