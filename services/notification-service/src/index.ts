import { createApp } from './app';

const port = process.env.PORT ? Number(process.env.PORT) : 4005;
const app = createApp();

app.listen(port, () => {
  console.log(`notification-service listening on port ${port}`);
});
