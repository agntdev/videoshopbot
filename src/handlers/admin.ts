import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, inlineButton, inlineKeyboard, isOwner, registerMainMenuItem, requireOwner } from "../toolkit/index.js";
import { ensureProducts, saveState } from "../store.js";

registerMainMenuItem({ label: "Owner desk", data: "admin:open", order: 90 });
const composer = new Composer<Ctx>();

composer.callbackQuery("admin:open", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx as never))) return;
  await ctx.reply("Owner desk", { reply_markup: inlineKeyboard([
    [inlineButton("Edit catalog", "admin:products")],
    [inlineButton("Toggle maintenance", "admin:maintenance")],
    [inlineButton("⬅️ Back", "menu:main")],
  ]) });
});

composer.callbackQuery("admin:products", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx as never))) return;
  const state = await ensureProducts(ctx);
  const rows = Object.values(state.products).map((p) => [inlineButton(`Edit ${p.title}`, `admin:edit:${p.id}`), inlineButton(`${p.visible ? "Hide" : "Show"}`, `admin:toggle:${p.id}`)]);
  await ctx.reply("Choose a catalog item to show or hide.", { reply_markup: inlineKeyboard([...rows, [inlineButton("⬅️ Owner desk", "admin:open")]]) });
});

composer.callbackQuery("admin:maintenance", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx as never))) return;
  const state = await ensureProducts(ctx);
  state.maintenance = !state.maintenance;
  await saveState(ctx, state);
  await ctx.reply(state.maintenance ? "The catalog is now hidden while you refresh it." : "The catalog is live again.");
});

composer.callbackQuery(/^admin:edit:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx as never))) return;
  const state = await ensureProducts(ctx);
  if (!state.products[ctx.match[1]]) { await ctx.reply("That catalog item isn't available."); return; }
  ctx.session.step = "admin_reply";
  ctx.session.supportId = `product:${ctx.match[1]}`;
  await ctx.reply("Send six lines: title, price in Stars, short description, long description, thumbnail file id, video file id.", { reply_markup: { force_reply: true, input_field_placeholder: "Paste the six lines" } });
});

composer.callbackQuery(/^admin:toggle:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx as never))) return;
  const state = await ensureProducts(ctx);
  const product = state.products[ctx.match[1]];
  if (!product) { await ctx.reply("That catalog item isn't available."); return; }
  product.visible = !product.visible;
  await saveState(ctx, state);
  await ctx.reply(product.visible ? "That video is visible in the catalog." : "That video is hidden from the catalog.");
});

// Staff actions are intentionally owner-gated and use the stored buyer id. The
// bot never asks an owner to type a buyer's Telegram id, which Telegram cannot
// safely DM before that buyer has started the bot.
composer.callbackQuery(/^support:resolve:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx as never))) return;
  const state = await ensureProducts(ctx);
  const support = state.supports[ctx.match[1]];
  if (!support) { await ctx.reply("That support message is no longer available."); return; }
  support.status = "resolved";
  await saveState(ctx, state);
  await ctx.editMessageText("Marked resolved.");
});

composer.callbackQuery(/^support:reply:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx as never))) return;
  if (!adminChatId(ctx as never) || !isOwner(ctx as never)) return;
  ctx.session.step = "admin_reply";
  ctx.session.supportId = ctx.match[1];
  await ctx.reply("Write the reply to send to the buyer.", { reply_markup: { force_reply: true, input_field_placeholder: "Write a reply" } });
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "admin_reply") return next();
  if (!(await requireOwner(ctx as never))) return;
  const state = await ensureProducts(ctx);
  const support = ctx.session.supportId ? state.supports[ctx.session.supportId] : undefined;
  if (ctx.session.supportId?.startsWith("product:")) {
    const product = state.products[ctx.session.supportId.slice("product:".length)];
    const fields = ctx.message.text.split("\n").map((line) => line.trim());
    ctx.session.step = undefined;
    ctx.session.supportId = undefined;
    if (!product || fields.length !== 6 || !fields[0] || !/^\d+$/.test(fields[1]) || !fields[2] || !fields[3] || !fields[4] || !fields[5]) {
      await ctx.reply("That format didn't look right. Send exactly six non-empty lines, with a whole-number price.");
      return;
    }
    product.title = fields[0]; product.priceStars = Number(fields[1]); product.shortDescription = fields[2]; product.longDescription = fields[3]; product.thumbnailFileId = fields[4]; product.videoFileId = fields[5];
    await saveState(ctx, state);
    await ctx.reply("Catalog details updated.");
    return;
  }
  ctx.session.step = undefined;
  ctx.session.supportId = undefined;
  if (!support) { await ctx.reply("That support message is no longer available."); return; }
  support.staffResponses.push(ctx.message.text);
  await saveState(ctx, state);
  try {
    await ctx.api.sendMessage(support.buyerTelegramId, `A note from support:\n\n${ctx.message.text}`);
    await ctx.reply("Your reply was sent.");
  } catch {
    await ctx.reply("I couldn't reach that buyer. They may have blocked the bot.");
  }
});

export default composer;
