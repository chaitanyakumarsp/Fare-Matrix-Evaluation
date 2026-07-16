// ## PrecisionScript
import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// ## PrecisionScript

type BusConfig = {
  origin?: string;
  destination?: string;
  travelDate?: string;
};

function formatDate(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function normalizeDate(value?: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return formatDate(new Date());
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day}/${month}/${year}`;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    return trimmed;
  }

  return formatDate(new Date());
}

function readBusConfig(): BusConfig {
  const configPath = path.resolve(process.cwd(), 'bus-config.json');
  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw) as BusConfig;
  } catch (error) {
    console.warn(`Unable to read bus config from ${configPath}:`, error);
    return {};
  }
}

function writeLog(message: string): void {
  const logDir = path.resolve(process.cwd(), 'logs');
  const logPath = path.join(logDir, 'bus-search.log');

  fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`, 'utf8');
  console.log(message);
}

test.use({
  ignoreHTTPSErrors: true,
  actionTimeout: 90000
});

test.describe('Bus booking search', () => {
  test('Search for bus from origin to destination', async ({ page }) => {
    test.setTimeout(300_000);

    const config = readBusConfig();
    const origin = config.origin?.trim() || 'Hyderabad';
    const destination = config.destination?.trim() || 'Vijayawada';
    const travelDate = normalizeDate(config.travelDate);

    writeLog(`Starting bus search from ${origin} to ${destination} on ${travelDate}`);

    await page.goto('https://www.vkaveribus.com/');
    writeLog('Opened VKA Veris website');

    await page.locator('#rc_select_0').click();
    await page.locator('#rc_select_0').fill(origin);
    await page.waitForTimeout(1000);

    await page.getByText(origin, { exact: true }).first().click();
    writeLog(`Selected origin: ${origin}`);

    await page.locator('#rc_select_1').click();
    await page.locator('#rc_select_1').fill(destination);
    await page.waitForTimeout(1000);

    await page.getByText(destination, { exact: true }).first().click();
    writeLog(`Selected destination: ${destination}`);

    await page.getByRole('textbox', { name: 'Onward' }).click();
    await page.getByRole('textbox', { name: 'Onward' }).fill(travelDate);
    await page.getByRole('textbox', { name: 'Onward' }).press('Enter');
    writeLog(`Filled travel date: ${travelDate}`);

    await page.getByRole('button', { name: 'Search' }).click();
    writeLog('Clicked Search');
    await page.waitForTimeout(5000);
    await page.waitForLoadState('networkidle');
    await page.locator('.footer.dark-bg').scrollIntoViewIfNeeded();

    const cost = page.locator('.ant-row.ant-row-middle.css-p8b6i');
    const seats = page.locator('.ant-alert-message');
    const clockText = page.locator('.clock_text');
    const alertMessages = page.locator('.ant-col.ant-col-4.css-p8b6i');
    const viewSeatsButton = page.locator("button:has-text('VIEW SEATS')");
    const footer = page.locator('.footer.dark-bg');

    const collected = new Set<string>();

    // Ensure screenshots directory exists
    fs.mkdirSync(path.resolve(process.cwd(), 'screenshots'), { recursive: true });

    writeLog('Scrolling for results...');
    while (!(await footer.isVisible())) {
      const values = await cost.allTextContents();
      values.forEach((value) => collected.add(value.trim()));
      await page.mouse.wheel(0, 2000);
      await page.waitForTimeout(10000);
    }

    writeLog(`Final grid count: ${collected.size}`);
    [...collected].forEach((value, index) => {
      writeLog(`Grid ${index}: ${value}`);
    });

    const alertCount = await alertMessages.count();
    writeLog(`Bus count: ${alertCount}`);
    for (let index = 9; index < alertCount; index++) {
      writeLog(`Bus No ${index}: ${await alertMessages.nth(index).innerText()}`);
    }

    const seatCount = await seats.count();
    writeLog(`Seat count: ${seatCount}`);
    for (let index = 0; index < seatCount; index++) {
      writeLog(`Seats ${index}: ${await seats.nth(index).innerText()}`);
    }

    const clockCount = await clockText.count();
    writeLog(`Time count: ${clockCount}`);
    for (let index = 0; index < clockCount; index++) {
      const label = index % 2 === 0 ? 'Start' : 'Arrival';
      writeLog(`(${label}): ${await clockText.nth(index).innerText()}`);
    }

    const count = await viewSeatsButton.count();
    writeLog(`Total View Seats buttons: ${count}`);

    for (let index = 0; index < count; index++) {
      const button = viewSeatsButton.nth(index);
      const section = page.locator('.service-details-container');

      await button.click();
      await page.waitForTimeout(2000);
      await section.waitFor({ state: 'visible', timeout: 10000 });
      await section.hover();
      await page.mouse.wheel(0, 2000);
      await page.waitForTimeout(2000);

      await section.screenshot({
        path: `screenshots/view-seats-${index + 1}.png`
      });
      writeLog(`Captured screenshot for bus ${index + 1}`);
      await page.waitForTimeout(1000);
    }
  });
});
