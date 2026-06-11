import { createApp } from './app';

 const parsedPort = Number.parseInt(process.env.PORT ?? '', 10);
 const port = Number.isFinite(parsedPort) ? parsedPort : 4005;
const app = createApp();

app.listen(port, () => {
  console.log(`notification-service listening on port ${port}`);
});
