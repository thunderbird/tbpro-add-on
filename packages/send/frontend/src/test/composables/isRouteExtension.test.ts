import { useIsRouteExtension } from '@send-frontend/composables/isRouteExtension';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { createRouter, createWebHistory, type Router } from 'vue-router';

// Mock router instance
let mockRouter: Router | null;

// Mock vue-router
vi.mock('vue-router', async () => {
  const actual = await vi.importActual('vue-router');
  return {
    ...actual,
    useRouter: () => mockRouter,
  };
});

describe('useIsRouteExtension', () => {
  beforeEach(() => {
    // Create a fresh router instance for each test
    mockRouter = createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/', component: {} },
        { path: '/test', component: {} },
      ],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return true when isExtension query parameter is "true"', async () => {
    // Navigate to route with isExtension=true
    await mockRouter.push('/test?isExtension=true');
    await nextTick();

    const { isRouteExtension } = useIsRouteExtension();

    expect(isRouteExtension.value).toBe(true);
  });

  it('should return false when isExtension query parameter is "false"', async () => {
    // Navigate to route with isExtension=false
    await mockRouter.push('/test?isExtension=false');
    await nextTick();

    const { isRouteExtension } = useIsRouteExtension();

    expect(isRouteExtension.value).toBe(false);
  });

  it('should return false when isExtension query parameter is missing', async () => {
    // Navigate to route without isExtension parameter
    await mockRouter.push('/test');
    await nextTick();

    const { isRouteExtension } = useIsRouteExtension();

    expect(isRouteExtension.value).toBe(false);
  });

  it('should return false when isExtension query parameter has other values', async () => {
    // Test with various non-"true" values
    const testValues = ['True', 'TRUE', '1', 'yes', 'on', ''];

    for (const value of testValues) {
      await mockRouter.push(`/test?isExtension=${value}`);
      await nextTick();

      const { isRouteExtension } = useIsRouteExtension();

      expect(isRouteExtension.value).toBe(false);
    }
  });

  it('should be reactive to route changes', async () => {
    // Start with no parameter
    await mockRouter.push('/test');
    await nextTick();

    const { isRouteExtension } = useIsRouteExtension();

    expect(isRouteExtension.value).toBe(false);

    // Change to isExtension=true
    await mockRouter.push('/test?isExtension=true');
    await nextTick();

    expect(isRouteExtension.value).toBe(true);

    // Change back to no parameter
    await mockRouter.push('/test');
    await nextTick();

    expect(isRouteExtension.value).toBe(false);
  });

  it('should handle multiple query parameters correctly', async () => {
    // Navigate to route with multiple query parameters including isExtension=true
    await mockRouter.push('/test?foo=bar&isExtension=true&baz=qux');
    await nextTick();

    const { isRouteExtension } = useIsRouteExtension();

    expect(isRouteExtension.value).toBe(true);
  });

  it('should handle router being null or undefined gracefully', async () => {
    // Mock router as null
    mockRouter = null;

    const { isRouteExtension } = useIsRouteExtension();

    expect(isRouteExtension.value).toBe(false);
  });
});
