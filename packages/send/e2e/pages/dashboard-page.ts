import { type Page, type Locator } from '@playwright/test';

import { 
  TB_ACCTS_EMAIL,
} from "../const/const";

export class DashboardPage {
  readonly page: Page;
  readonly tbProHdrLogo: Locator;
  readonly sendStorageHdr: Locator;
  readonly logoutBtn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.tbProHdrLogo = this.page.locator('.header-logo');
    this.sendStorageHdr = this.page.getByRole('heading', { name: 'Send Storage' })
    this.logoutBtn = this.page.getByTestId('log-out-button');
  }
}
