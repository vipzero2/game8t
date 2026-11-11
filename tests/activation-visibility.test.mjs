import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Telegram customers always have a standalone activate-code form',()=>{
 const page=read('public/activate.html'),js=read('public/assets/main.js');
 assert.match(page,/data-page="activate"/);
 assert.match(page,/id="activationForm"/);
 assert.match(page,/id="activationCode"/);
 assert.match(page,/id="activationSubmit"/);
 assert.match(page,/href="dashboard.html"/);
 assert.match(js,/else if\(page==='activate'\)activateInit\(\)/);
 assert.match(js,/post\('\/telegram\/redeem',\{code\}\)/);
 assert.match(js,/next==='activate.html'|includes\(next\)/);
 assert.doesNotMatch(page,/\d+\s*⭐|stars_price/);
});
test('Dashboard has a clear activation link above account panels',()=>{
 const dash=read('public/dashboard.html');
 assert.ok(dash.indexOf('id="quickActivation"')>0);
 assert.ok(dash.indexOf('id="quickActivation"')<dash.indexOf('id="accountStatus"'));
 assert.match(dash,/href="activate.html"/);
});
test('Admin shows Telegram paid orders first and keeps legacy orders labeled',()=>{
 const admin=read('public/admin.html'),js=read('public/assets/main.js');
 assert.ok(admin.indexOf('id="telegramPayments"')<admin.indexOf('طلبات الدفع القديمة'));
 assert.match(admin,/id="adminTelegramOrders"/);
 assert.match(admin,/id="refreshTelegramPayments"/);
 assert.match(js,/api\('\/admin\/telegram\/orders'\)/);
 assert.match(js,/\$\('telegramPaymentCount'\)/);
});
test('Telegram success directs users to the activation form',()=>{
 const bot=read('functions/_lib/telegram.js');
 assert.match(bot,/\/activate\.html',null,m\.from/);
});
