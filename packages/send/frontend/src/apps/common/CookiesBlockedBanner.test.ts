import { getByTestId } from '@send-frontend/lib/testUtils';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CookiesBlockedBanner from './CookiesBlockedBanner.vue';

const { probeResult, refetchMock } = vi.hoisted(() => {
  return { probeResult: vi.fn(), refetchMock: vi.fn() };
});

vi.mock('@send-frontend/stores/api-store', () => ({
  default: () => ({
    api: { call: vi.fn() },
  }),
}));

// Mock vue-query — the component only reads `data` and calls `refetch`.
vi.mock('@tanstack/vue-query', () => ({
  useQuery: () => {
    return {
      data: { value: probeResult() },
      refetch: refetchMock,
    };
  },
}));

/**
 * Bugzilla 2064458: the banner must only ever appear on a *positive* 'blocked'
 * probe answer. 'unknown' (offline user, older backend) and loading states
 * stay hidden — a false blocked-cookies warning sends users to change a
 * Thunderbird setting that was never the problem.
 */
describe('CookiesBlockedBanner.vue', () => {
  beforeEach(() => {
    probeResult.mockReturnValue('blocked');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the banner when the probe answers blocked', () => {
    const wrapper = mount(CookiesBlockedBanner);

    expect(wrapper.find(getByTestId('cookies-blocked-banner')).exists()).toBe(
      true
    );
    expect(
      wrapper.find(getByTestId('cookies-blocked-banner-body')).exists()
    ).toBe(true);
  });

  it('hides the banner when the probe answers enabled', () => {
    probeResult.mockReturnValue('enabled');
    const wrapper = mount(CookiesBlockedBanner);

    expect(wrapper.find(getByTestId('cookies-blocked-banner')).exists()).toBe(
      false
    );
  });

  it('hides the banner when the probe is inconclusive (unknown)', () => {
    probeResult.mockReturnValue('unknown');
    const wrapper = mount(CookiesBlockedBanner);

    expect(wrapper.find(getByTestId('cookies-blocked-banner')).exists()).toBe(
      false
    );
  });

  it('hides the banner while the probe is still loading', () => {
    probeResult.mockReturnValue(undefined);
    const wrapper = mount(CookiesBlockedBanner);

    expect(wrapper.find(getByTestId('cookies-blocked-banner')).exists()).toBe(
      false
    );
  });

  it('is not dismissible (no close button)', () => {
    const wrapper = mount(CookiesBlockedBanner);

    expect(wrapper.find(getByTestId('close-button')).exists()).toBe(false);
  });

  it('retry button refetches the probe query', async () => {
    const wrapper = mount(CookiesBlockedBanner);

    await wrapper
      .find(getByTestId('cookies-blocked-banner-retry'))
      .trigger('click');

    expect(refetchMock).toHaveBeenCalled();
  });
});
