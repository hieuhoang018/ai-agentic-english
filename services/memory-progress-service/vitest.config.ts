import { mergeConfig, defineConfig } from 'vitest/config';
import baseConfig from '@ai-agentic-english/config/vitest.config';

export default mergeConfig(baseConfig, defineConfig({}));
