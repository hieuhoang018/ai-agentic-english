import { createApp } from './app';

const port = process.env.PORT ? Number(process.env.PORT) : 4001;
const app = createApp();

app.listen(port, () => {
  console.log(`user-service listening on port ${port}`);
});
