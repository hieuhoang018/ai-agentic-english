import { getEnvInt } from '@ai-agentic-english/shared';
import { createApp } from './app';

const port = getEnvInt('PORT', 4001);
const app = createApp();

app.listen(port, () => {
  console.log(`user-service listening on port ${port}`);
});
