import { createApp } from './app';

const port = process.env.PORT ? Number(process.env.PORT) : 4004;
const app = createApp();

app.listen(port, () => {
  console.log(`ai-tutor-service listening on port ${port}`);
});
