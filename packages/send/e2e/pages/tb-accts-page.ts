import { expect, type Page, type Locator } from '@playwright/test';
import { TB_ACCTS_EMAIL, TB_ACCTS_PWORD, TIMEOUT_1_SECOND, TIMEOUT_10_SECONDS, TIMEOUT_30_SECONDS } from '../const/const';

export class TBAcctsPage {
  readonly page: Page;
  readonly signInUsingTBAcctsBtn: Locator;
  readonly signInHeaderText: Locator;
  readonly userAvatar: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
  readonly localDevEmailInput: Locator;
  readonly localDevpasswordInput: Locator;
  readonly localDevLoginContinueBtn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.signInUsingTBAcctsBtn = this.page.getByTestId('login-button-tbpro');
    this.signInHeaderText = this.page.getByText('Sign in to your account');
    this.userAvatar = this.page.getByTestId('avatar-default');
    this.emailInput = this.page.getByTestId('username-input');
    this.passwordInput = this.page.getByTestId('password-input');
    this.signInButton = this.page.getByTestId('submit-btn');
    
    this.localDevEmailInput = this.page.getByTestId('login-email-input');
    this.localDevpasswordInput = this.page.getByTestId('login-password-input');
    this.localDevLoginContinueBtn = this.page.getByTestId('login-continue-button');
  }

  /**
   * Sign in to TB Accounts using the provided email and password.
   */
  async signIn() {
    console.log('signing in to TB Accounts');
    expect(TB_ACCTS_EMAIL, 'getting ACCTS_OIDC_EMAIL env var').toBeTruthy();
    expect(TB_ACCTS_PWORD, 'getting ACCTS_OIDC_PWORD env var').toBeTruthy();
    await expect(this.emailInput).toBeVisible({ timeout: TIMEOUT_30_SECONDS });
    await this.emailInput.fill(String(TB_ACCTS_EMAIL));
    await this.page.waitForTimeout(TIMEOUT_1_SECOND);
    await this.passwordInput.fill(String(TB_ACCTS_PWORD));
    await this.page.waitForTimeout(TIMEOUT_1_SECOND);
    await this.signInButton.click({ force: true });
    await this.page.waitForTimeout(TIMEOUT_10_SECONDS);
  }

  /**
   * Sign in when running TB Send on the local dev stack and not using TB Accounts OIDC; just local password
   */
  async localSendSignIn() {
    expect(TB_ACCTS_EMAIL, 'getting TB_ACCTS_EMAIL env var').toBeTruthy();
    expect(TB_ACCTS_PWORD, 'getting TB_ACCTS_PWORD env var').toBeTruthy();
    await expect(this.localDevEmailInput).toBeVisible({ timeout: TIMEOUT_30_SECONDS });
    await expect(this.localDevLoginContinueBtn).toBeVisible();
    await this.localDevEmailInput.fill(TB_ACCTS_EMAIL);
    await this.page.waitForTimeout(TIMEOUT_1_SECOND);
    await this.localDevpasswordInput.fill(TB_ACCTS_PWORD);
    await this.page.waitForTimeout(TIMEOUT_1_SECOND);
    await this.localDevLoginContinueBtn.click();
    await this.page.waitForTimeout(TIMEOUT_10_SECONDS);
  }
}
