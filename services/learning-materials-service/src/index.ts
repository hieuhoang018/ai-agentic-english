import { createApp } from './app';

const parsedPort = Number.parseInt(process.env.PORT ?? '', 10);
const port = Number.isFinite(parsedPort) ? parsedPort : 4002;
const app = createApp();

app.listen(port, () => {
  console.log(`learning-materials-service listening on port ${port}`);
});
