import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { ensureProducts, now, nowEpoch, saveState, type SupportMessage } from "../store.js";

registerMainMenuItem({ label: "Support", data: "support:start", order: 20 });
const composer = new Composer<Ctx>();
composer.callbackQuery("support:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "support";
  await ctx.reply("What can we help with? Send a short message.", { reply_markup: { force_reply: true, input_field_placeholder: "Write your message" } });
});

async function adminId(ctx: Ctx) {
  return adminChatId(ctx as never);
}

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "support") return next();
  const text = ctx.message.text.trim();
  ctx.session.step = undefined;
  if (!text) { await ctx.reply("Send a few words so we can help."); return; }
  const state = await ensureProducts(ctx);
  const id = `support-${ctx.chat.id}-${nowEpoch()}`;
  const support: SupportMessage = { id, buyerTelegramId: ctx.from.id, buyerUsername: ctx.from.username, messageText: text, status: "open", createdAt: now(), staffResponses: [] };
  state.supports[id] = support;
  state.supportIds.push(id);
  await saveState(ctx, state);
  const admin = await adminId(ctx);
  if (admin) {
    try { await ctx.api.sendMessage(admin, `New support message\nFrom: ${ctx.from.username ? `@${ctx.from.username}` : ctx.from.id}\nMessage: ${text}`, { reply_markup: inlineKeyboard([[inlineButton("Reply", `support:reply:${id}`), inlineButton("Mark resolved", `support:resolve:${id}`)]]) }); }
    catch { /* support remains stored for the owner */ }
  }
  await ctx.reply(admin ? "Thanks — your message is with the team. We’ll get back to you within a day." : "Thanks — your message is saved. Support notifications aren't set up yet.");
});

export default composer;
