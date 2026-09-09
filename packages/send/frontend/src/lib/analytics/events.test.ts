import { describe, expect, it } from 'vitest';
import { ANALYTICS_EVENTS } from './events';

const SNAKE_CASE = /^[a-z]+(_[a-z]+)*$/;

describe('ANALYTICS_EVENTS catalog', () => {
  const names = Object.values(ANALYTICS_EVENTS);

  it('uses object_action snake_case names (no dots, no camelCase)', () => {
    for (const name of names) {
      expect(name, `event "${name}" must be snake_case`).toMatch(SNAKE_CASE);
      expect(name).not.toContain('.');
      expect(name).not.toMatch(/[A-Z]/);
    }
  });

  it('has unique event names', () => {
    expect(new Set(names).size).toBe(names.length);
  });

  it('has at least one _ separator per name (object_action)', () => {
    for (const name of names) {
      expect(name.includes('_'), `event "${name}" must be object_action`).toBe(
        true
      );
    }
  });
});
