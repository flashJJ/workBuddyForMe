import { generateKeyPairSync } from 'node:crypto';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { expect, test, type Page } from '@playwright/test';

type Envelope<T> = { data?: T };

async function skipOnboardingIfShown(page: Page): Promise<void> {
  const wizard = page.getByRole('dialog', { name: '首次使用向导' });
  try {
    await wizard.waitFor({ state: 'visible', timeout: 5_000 });
  } catch {
    return;
  }
  await page.getByRole('button', { name: '跳过' }).click();
  await expect(wizard).toBeHidden();
}

async function sampleSkill(page: Page): Promise<Buffer> {
  const sample = await page.request.get('/api/capabilities/sample?kind=skill');
  expect(sample.ok()).toBeTruthy();
  return Buffer.from(await sample.body());
}

function bumpVersion(zip: Buffer, version: string): Buffer {
  const files = unzipSync(new Uint8Array(zip));
  const manifest = JSON.parse(strFromU8(files['wbfm-capability.json']!)) as Record<string, unknown>;
  files['wbfm-capability.json'] = strToU8(JSON.stringify({ ...manifest, version }, null, 2));
  return Buffer.from(zipSync(files));
}

test.describe('v2.12 能力包收口', () => {
  test('健康自检：检查全部后出现正常徽章与空孤儿列表', async ({ page }) => {
    await page.request.put('/api/settings', { data: { hasOnboarded: true } });
    const installed = await page.request.post('/api/capabilities/install', {
      multipart: {
        file: { name: 'skill.zip', mimeType: 'application/zip', buffer: await sampleSkill(page) },
      },
    });
    expect(installed.status()).toBe(201);
    const capability = ((await installed.json()) as Envelope<{ id: string }>).data!;

    await page.goto('/capabilities');
    await skipOnboardingIfShown(page);
    await page.getByTestId('capability-health-check').click();
    await expect(page.getByTestId('capability-health-summary')).toContainText('0 有损坏');
    await expect(page.getByTestId(`capability-health-${capability.id}`)).toHaveText('正常');
    await expect(page.getByTestId('capability-orphans')).toContainText('没有无主目录');

    await page.request.delete(`/api/capabilities/${capability.id}`);
  });

  test('升级对话框：选择高版本 ZIP → 成功 → 版本更新', async ({ page }) => {
    await page.request.put('/api/settings', { data: { hasOnboarded: true } });
    const v1 = await sampleSkill(page);
    const installed = await page.request.post('/api/capabilities/install', {
      multipart: { file: { name: 'skill.zip', mimeType: 'application/zip', buffer: v1 } },
    });
    expect(installed.status()).toBe(201);
    const capability = ((await installed.json()) as Envelope<{ id: string }>).data!;

    await page.goto('/capabilities');
    await skipOnboardingIfShown(page);
    await page.getByTestId(`capability-upgrade-${capability.id}`).click();
    await expect(page.getByTestId('capability-upgrade-dialog')).toBeVisible();
    await page.getByTestId('capability-upgrade-file').setInputFiles({
      name: 'skill-v2.zip',
      mimeType: 'application/zip',
      buffer: bumpVersion(v1, '2.0.0'),
    });
    await page.getByTestId('capability-upgrade-confirm').click();
    await expect(page.getByText('升级成功')).toBeVisible();
    await expect(page.getByTestId(`capability-version-${capability.id}`)).toContainText('v2.0.0');

    await page.request.delete(`/api/capabilities/${capability.id}`);
  });

  test('信任库与 require 策略：保存后未签名包安装被拒', async ({ page }) => {
    await page.request.put('/api/settings', { data: { hasOnboarded: true } });
    const { publicKey } = generateKeyPairSync('ed25519');
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

    await page.goto('/settings');
    await skipOnboardingIfShown(page);
    await page.getByTestId('capability-trust-section').scrollIntoViewIfNeeded();
    await page.getByTestId('capability-trust-policy-require').click();
    await page.getByTestId('capability-trust-key-id').fill('e2e-local');
    await page.getByTestId('capability-trust-label').fill('E2E 本地密钥');
    await page.getByTestId('capability-trust-pem').fill(pem);
    await page.getByTestId('capability-trust-add').click();
    await expect(page.getByTestId('capability-trust-remove-e2e-local')).toBeVisible();
    await page.getByTestId('capability-trust-save').click();
    await expect(page.getByText('签名设置已保存')).toBeVisible();

    const rejected = await page.request.post('/api/capabilities/install', {
      multipart: {
        file: { name: 'unsigned.zip', mimeType: 'application/zip', buffer: await sampleSkill(page) },
      },
    });
    expect(rejected.status()).toBe(422);

    await page.request.put('/api/settings', {
      data: { capabilitySignaturePolicy: 'warn', capabilityTrustedKeys: [] },
    });
  });
});
