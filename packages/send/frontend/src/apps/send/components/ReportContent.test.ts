import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReportContent from './ReportContent.vue';

const { call, capture, params } = vi.hoisted(() => ({
  call: vi.fn(),
  capture: vi.fn(),
  params: { value: {} as Record<string, string> },
}));

vi.mock('@send-frontend/stores/api-store', () => ({
  default: () => ({ api: { call } }),
}));
vi.mock('@send-frontend/stores/metrics', () => ({
  default: () => ({ metrics: { capture } }),
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: params.value }),
}));

const props = { uploadId: 'upload-1', containerId: 'container-1' };

async function confirmReport() {
  const wrapper = mount(ReportContent, { props });
  await wrapper.find('a.link').trigger('click');
  await wrapper.find('a.link').trigger('click');
  return wrapper;
}

describe('ReportContent.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    call.mockResolvedValue({ message: 'reported successfully' });
  });

  it('sends the share link id so a logged-out recipient can report (#1008)', async () => {
    params.value = { linkId: 'link-1' };
    await confirmReport();

    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith(
      'containers/container-1/report',
      { uploadId: 'upload-1', linkId: 'link-1' },
      'POST'
    );
  });

  it('omits linkId outside a share link', async () => {
    params.value = {};
    await confirmReport();

    expect(call).toHaveBeenCalledWith(
      'containers/container-1/report',
      { uploadId: 'upload-1' },
      'POST'
    );
  });

  it('has no hidden click targets at either step (#1009)', async () => {
    const wrapper = mount(ReportContent, { props });
    expect(wrapper.html()).not.toContain('transparent');
    await wrapper.find('a.link').trigger('click');
    expect(wrapper.html()).not.toContain('transparent');
    expect(wrapper.findAll('[class*="link"]')).toHaveLength(1);
  });
});
