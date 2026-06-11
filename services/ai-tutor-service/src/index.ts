import { createApp } from './app';

const parsedPort = Number.parseInt(process.env.PORT ?? '', 10);
const port = Number.isFinite(parsedPort) ? parsedPort : 4004;
const app = createApp();

app.listen(port, () => {
  console.log(`ai-tutor-service listening on port ${port}`);
});
