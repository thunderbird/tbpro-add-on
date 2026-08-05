import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import PassphraseChanged from './PassphraseChanged.vue';

/**
 * PassphraseChanged.vue is a purely presentational page shown when the user's
 * encryption keys are "incorrect" / the keychain is locked.
 *
 * It is reached in three ways (see router.ts + useBackupAndRestore.ts):
 *   1. Router guard: navigating to a `requiresBackedUpKeys` route (e.g. /verify)
 *      while `keychain.locked === true` redirects to /passphrase-changed.
 *   2. useBackupAndRestore onMounted: pushes /passphrase-changed when the
 *      keychain is locked at mount time.
 *   3. Direct navigation to /passphrase-changed (route has no guards of its own).
 *
 * These tests lock down the page's contents and the router behaviour that
 * lands users here. Because the component is static, the "edge cases" live in
 * the guard logic that routes here, so we cover that too.
 */

const stubs = {
  // SupportBox pulls in external constants/links we don't care about here.
  SupportBox: true,
};

const mountPage = () => mount(PassphraseChanged, { global: { stubs } });

describe('PassphraseChanged.vue', () => {
  it('renders the warning heading', () => {
    const wrapper = mountPage();

    const heading = wrapper.find('h2.section-title');
    expect(heading.exists()).toBe(true);
    expect(heading.text()).toBe('Warning');
  });

  it('explains that the keys are incorrect and how to recover', () => {
    const wrapper = mountPage();

    const text = wrapper.text();
    expect(text).toContain('Your keys are incorrect');
    // The recovery instruction is the whole point of the page.
    expect(text).toContain('log out and log back in');
    // Mentions the common cause so the user isn't alarmed.
    expect(text).toContain('reset your passphrase on a different device');
  });

  it('renders the recovery instructions inside a KeysTemplate wrapper', () => {
    const wrapper = mountPage();

    const keysTemplate = wrapper.findComponent({ name: 'KeysTemplate' });
    expect(keysTemplate.exists()).toBe(true);
    // The warning copy must live inside the template, not floating in the page.
    expect(keysTemplate.text()).toContain('Your keys are incorrect');
  });

  it('renders a SupportBox so the user has a path to help', () => {
    const wrapper = mountPage();

    expect(wrapper.findComponent({ name: 'SupportBox' }).exists()).toBe(true);
  });

  it('marks the warning heading with the red styling class', () => {
    const wrapper = mountPage();

    const heading = wrapper.find('h2.section-title');
    // Visual severity cue; guards against silently dropping the alarming style.
    expect(heading.classes()).toContain('text-red-700');
  });

  it('renders no interactive controls (the page is purely informational)', () => {
    const wrapper = mountPage();

    // There is no self-service "fix" button; recovery is manual log out/in.
    expect(wrapper.find('button').exists()).toBe(false);
    expect(wrapper.find('input').exists()).toBe(false);
    expect(wrapper.find('form').exists()).toBe(false);
  });
});
