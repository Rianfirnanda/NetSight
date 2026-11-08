import { test, expect } from '@playwright/test';

test('desktop discovery refreshes real-source inventory and saves aliases through IPC', async ({ page }) => {
  // This fixture tests the IPC contract only; it does not emulate a Windows LAN.
  await page.addInitScript(() => {
    let alias = '';
    let notes = '';
    const calls: { command: string; args: Record<string, unknown> }[] = [];
    Object.assign(window, {
      isTauri: true,
      __ipcCalls: calls,
      __TAURI_INTERNALS__: {
        invoke: async (command: string, args: Record<string, unknown> = {}) => {
          calls.push({ command, args });
          if (command === 'lab_status') return { running:false, phase:'Idle', target:'', gateway:'', forwarded:0, bytes:0, remaining:0, restoration:'', error:null };
          if (command === 'snapshot') return {
            adapters: [], samples: [], events: [], collectedAt: new Date().toISOString(),
            devices: [{ id: 'neighbor-1', name: alias || 'Device 192.168.1.2', ip: '192.168.1.2', mac: '02:11:22:33:44:55', vendor: 'Unknown', source: 'Windows neighbor table', status: 'Reachable', lastSeen: Date.now(), interface: '12', alias, notes }],
          };
          if (command === 'discovery_scopes') return [{ address: '192.168.1.10', interface: 'Ethernet', prefix: 24, targets: 253 }];
          if (command === 'discover_devices') return 253;
          if (command === 'save_device') { alias = String(args.alias); notes = String(args.notes); return null; }
          throw new Error(`Unexpected IPC command: ${command}`);
        },
      },
    });
  });
  await page.goto('/');
  await expect(page.getByRole('combobox', { name: 'Data mode' })).toHaveValue('live');
  await page.getByRole('navigation').getByRole('button', { name: 'Devices', exact: true }).click();
  await page.getByRole('button', { name: 'Discover subnet', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Discovery complete');
  await page.getByRole('button', { name: 'Device 192.168.1.2', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Windows neighbor table');
  await dialog.getByLabel('Display name').fill('Office printer');
  await dialog.getByLabel('Notes', { exact: true }).fill('Reception');
  await dialog.getByRole('button', { name: 'Save details' }).click();
  await expect(dialog.getByRole('status')).toHaveText('Device details saved on this computer.');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Office printer', exact: true })).toBeVisible();
  const calls = await page.evaluate(() => (window as unknown as { __ipcCalls: { command: string; args: object }[] }).__ipcCalls);
  expect(calls).toContainEqual({ command: 'discover_devices', args: { address: '192.168.1.10' } });
  expect(calls).toContainEqual({ command: 'save_device', args: { id: 'neighbor-1', alias: 'Office printer', notes: 'Reception' } });
  await page.screenshot({ path: 'test-results/devices-console.png', fullPage: true });
});
