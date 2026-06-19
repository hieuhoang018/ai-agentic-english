import { getEnvInt } from '@ai-agentic-english/shared';
import { createApp } from './app';

const port = getEnvInt('PORT', 4002);
const app = createApp();

app.listen(port, () => {
  console.log(`learning-materials-service listening on port ${port}`);
});
