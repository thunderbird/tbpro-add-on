// German render check for the upload steps (#1088 batch 1): each step mounts
// in English, then follows setLocale(['de']).
import { resetL10n, setLocale } from '@send-frontend/l10n';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { nextTick, type Component } from 'vue';
import FileUploadTemplate from '../FileUploadTemplate.vue';
import ErrorStep from './ErrorStep.vue';
import ExpirationStep from './ExpirationStep.vue';
import PasswordStep from './PasswordStep.vue';
import SuccessStep from './SuccessStep.vue';
import UploadingStep from './UploadingStep.vue';

async function renderInGerman(component: Component, props: object) {
  const wrapper = mount(component, {
    props,
    global: { stubs: { ProgressBar: true } },
  });
  const english = wrapper.text();
  await setLocale(['de']);
  await nextTick();
  return { english, german: wrapper.text(), wrapper };
}

describe('upload steps in German', () => {
  beforeEach(() => resetL10n());

  it('FileUploadTemplate: step counter and default buttons', async () => {
    const { english, german } = await renderInGerman(FileUploadTemplate, {
      step: { stepNumber: 1, totalSteps: 2, title: 'x' },
      showBackButton: true,
      showPrimaryButton: true,
    });
    expect(english).toContain('STEP 1 OF 2');
    expect(english).toContain('Back');
    expect(english).toContain('Next');
    expect(german).toContain('SCHRITT 1 VON 2');
    expect(german).toContain('Zurück');
    expect(german).toContain('Weiter');
  });

  it('PasswordStep', async () => {
    const { english, german, wrapper } = await renderInGerman(PasswordStep, {
      isPasswordProtected: true,
      password: '',
      passwordHint: '',
    });
    expect(english).toContain('Create File Password');
    expect(english).toContain(
      'Protect this file with a password (recommended)'
    );
    expect(german).toContain('Dateipasswort erstellen');
    expect(german).toContain(
      'Diese Datei mit einem Passwort schützen (empfohlen)'
    );
    expect(wrapper.find('#file-password').attributes('placeholder')).toBe(
      'Passwort eingeben'
    );
    expect(wrapper.find('.password-toggle').attributes('aria-label')).toBe(
      'Passwort anzeigen'
    );
  });

  it('ExpirationStep: plural day and hour labels', async () => {
    const { english, german } = await renderInGerman(ExpirationStep, {
      selectedExpiration: '14days',
      customDateTime: '',
      isExtension: true,
    });
    expect(english).toContain('Expire in 24 hours');
    expect(english).toContain('Expire in 14 days (default)');
    expect(english).toContain('Expire in 30 days');
    expect(german).toContain('Ablauf der Datei festlegen');
    expect(german).toContain('Läuft in 24 Stunden ab');
    expect(german).toContain('Läuft in 14 Tagen ab (Standard)');
    expect(german).toContain('Link erstellen');
  });

  it('UploadingStep', async () => {
    const { english, german } = await renderInGerman(UploadingStep, {
      fileUploadStatuses: [],
    });
    expect(english).toContain('Select File Expiration');
    expect(german).toContain('Ablauf der Datei festlegen');
  });

  it('SuccessStep', async () => {
    const { english, german } = await renderInGerman(SuccessStep, {
      shareUrl: 'https://example.test/share/1',
    });
    expect(english).toContain('Your file has been uploaded!');
    expect(german).toContain('Ihre Datei wurde hochgeladen!');
    expect(german).toContain('Kopieren');
  });

  it('ErrorStep', async () => {
    const { english, german } = await renderInGerman(ErrorStep, {
      uploadError: '',
    });
    expect(english).toContain('Upload failed');
    expect(german).toContain('Hochladen fehlgeschlagen');
    expect(german).toContain('Erneut versuchen');
  });
});
