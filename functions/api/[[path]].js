import {ApiError,json,assertDb,siteOrigin,fail} from '../_lib/common.js';
import * as auth from '../_lib/auth.js';
import * as device from '../_lib/device.js';
import * as payment from '../_lib/payments.js';
import * as admin from '../_lib/admin.js';
import * as support from '../_lib/support.js';
import * as emailSecurity from '../_lib/email-security.js';
import * as telegram from '../_lib/telegram.js';
import * as telegramLicense from '../_lib/telegram-license.js';
import * as starsMonitor from '../_lib/stars-monitor.js';
import {authorizedScheduledRun} from '../_lib/scheduler-identity.js';
const endpoints={
 'GET /config':payment.plans,
 'GET /telegram/open':telegram.openBot,
 'POST /telegram/link':telegram.startLink,
 'POST /telegram/redeem':telegram.redeem,
 'POST /telegram/device/challenge':telegramLicense.challenge,
 'POST /telegram/device/activate':telegramLicense.activate,
 'POST /telegram/device/verify':telegramLicense.verify,
 'POST /telegram/webhook':telegram.webhook,
 'POST /admin/telegram/configure':telegram.configureWebhook,
 'POST /admin/telegram/plan':telegram.setStarsPlan,
 'GET /admin/telegram/orders':telegram.listTelegramOrders,
 'POST /admin/telegram/refund':telegram.adminRefund,
 'GET /admin/telegram/reconcile/status':starsMonitor.monitorStatus,
 'POST /admin/telegram/reconcile':starsMonitor.adminScan,
 'POST /telegram/reconcile':async ctx=>{
   if(!await authorizedScheduledRun(ctx.request))
     return json({ok:false,error:'UNAUTHORIZED',message:'Unauthorized scheduler'},401);
   return json(await starsMonitor.reconcileStars(ctx.env));
 },
 'GET /auth/me':auth.me,
 'POST /auth/register':emailSecurity.startSignup,
 'POST /auth/signup/verify':emailSecurity.verifySignup,
 'POST /auth/signup/resend':emailSecurity.resendSignup,
 'POST /auth/email/request':emailSecurity.requestVerifyEmail,
 'POST /auth/email/verify':emailSecurity.confirmVerifyEmail,
 'POST /auth/password/request':emailSecurity.requestPasswordReset,
 'POST /auth/password/reset':emailSecurity.confirmPasswordReset,
 'POST /device/change/request':emailSecurity.requestDeviceChange,
 'POST /device/change/confirm':emailSecurity.confirmDeviceChange,
 'POST /auth/login':auth.login,
 'POST /auth/logout':auth.logout,
 'POST /device/login':auth.mobileLogin,
 'POST /device/challenge':device.challenge,
 'POST /device/activate':device.activate,
 'POST /device/verify':device.verify,
 'POST /orders':payment.createInvoice,
 'POST /payments/webhook':payment.webhook,
 'GET /support/mine':support.mine,
 'POST /support/ticket':support.submit,
 'GET /admin/tickets':support.adminList,
 'POST /admin/reply-ticket':support.reply,
 'GET /admin/overview':admin.overview,
 'POST /admin/reset-device':admin.resetDevice,
 'POST /admin/grant':admin.grant,
 'POST /admin/plan':admin.setPlan,
 'POST /admin/block':admin.block
};
export async function onRequest(ctx){try{assertDb(ctx.env);const url=new URL(ctx.request.url);const path='/'+(Array.isArray(ctx.params.path)?ctx.params.path.join('/'):(ctx.params.path||''));if(ctx.request.method!=='GET'&&path!=='/payments/webhook'&&path!=='/telegram/webhook')siteOrigin(ctx.request);const fn=endpoints[ctx.request.method+' '+path];if(!fn)return json({ok:false,error:'NOT_FOUND',message:'المسار غير موجود'},404);return await fn(ctx);}catch(e){if(e instanceof ApiError)return json({ok:false,error:e.code,message:e.message},e.status);console.error('AIM8 API failed:',e?.message||e);return json({ok:false,error:'SERVER_ERROR',message:'حصل خطأ داخلي؛ تحقق من إعدادات السيرفر'},500)}}
