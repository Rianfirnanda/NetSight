import { test,expect } from '@playwright/test';
test('workspace supports inventory, navigation, appearance and truthful live errors',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
 await expect(page.getByText('You’re exploring a synthetic sample network.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Devices',exact:true}).click();
 await page.getByRole('textbox',{name:'Search devices'}).fill('NAS');await expect(page.locator('tbody tr')).toHaveCount(1);
 await page.getByRole('button',{name:'NAS storage'}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 for(const name of ['Monitoring','Topology','Alerts','Reports','Settings']){await page.getByRole('navigation').getByRole('button',{name,exact:true}).click();await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();}
 await page.getByRole('button',{name:'Switch to light'}).click();await expect(page.locator('.app')).toHaveAttribute('data-theme','light');
 await page.reload();await expect(page.locator('.app')).toHaveAttribute('data-theme','light');
 await page.getByRole('combobox',{name:'Data mode'}).selectOption('live');await expect(page.getByRole('alert')).toContainText('Live collection requires');
 await page.getByRole('combobox',{name:'Data mode'}).selectOption('demo');await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/overview.png',fullPage:true});expect(errors).toEqual([]);
});
test('report export preserves its synthetic source',async({page})=>{await page.goto('/');await page.getByRole('navigation').getByRole('button',{name:'Reports',exact:true}).click();const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export demo observations'}).click();const download=await downloadPromise;expect(download.suggestedFilename()).toBe('netsight-demo-observations.json');const stream=await download.createReadStream();let text='';for await(const chunk of stream!)text+=chunk.toString();expect(JSON.parse(text)).toMatchObject({mode:'demo',source:'Synthetic demo'});});
