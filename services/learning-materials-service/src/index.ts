import { createApp } from './app';

const port = process.env.PORT ? Number(process.env.PORT) : 4002;
const app = createApp();

app.listen(port, () => {
  console.log(`learning-materials-service listening on port ${port}`);
});
