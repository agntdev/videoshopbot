import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { ensureProducts, productButtons } from "../store.js";

const composer = new Composer<Ctx>();
composer.callbackQuery(/^product:details:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = ctx.match[1];
  const state = await ensureProducts(ctx);
  const product = state.products[id];
  if (!product || !product.visible) {
    await ctx.reply("I couldn't find that video. Open the catalog to try again.");
    return;
  }
  await ctx.replyWithPhoto(product.thumbnailFileId, {
    caption: `${product.title}\n\n${product.longDescription}\n\n⭐ ${product.priceStars} Stars`,
    reply_markup: inlineKeyboard([productButtons(product), [inlineButton("⬅️ Catalog", "catalog:start")]]),
  });
});
export default composer;
