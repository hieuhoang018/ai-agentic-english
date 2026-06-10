import { describe, expect, it } from 'vitest';
import { SHARED_PACKAGE_NAME } from '../index';

describe('shared package', () => {
  it('exports a package name placeholder', () => {
    expect(SHARED_PACKAGE_NAME).toBe('@ai-agentic-english/shared');
  });
});
