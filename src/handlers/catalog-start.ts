import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { ensureProducts, productButtons } from "../store.js";

registerMainMenuItem({ label: "Catalog", data: "catalog:start", order: 10 });
const composer = new Composer<Ctx>();

async function showCatalog(ctx: Ctx, edit = false) {
  const state = await ensureProducts(ctx);
  if (state.maintenance) {
    const options = { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back", "menu:main")]]) };
    if (edit) await ctx.editMessageText("The shop is being refreshed. Please check back soon.", options);
    else await ctx.reply("The shop is being refreshed. Please check back soon.", options);
    return;
  }
  const products = Object.values(state.products).filter((p) => p.visible);
  if (products.length === 0) {
    const options = { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back", "menu:main")]]) };
    if (edit) await ctx.editMessageText("The shop is taking a short break. Try again soon.", options);
    else await ctx.reply("The shop is taking a short break. Try again soon.", options);
    return;
  }
  for (const product of products) {
    const options = { reply_markup: inlineKeyboard([productButtons(product), [inlineButton("⬅️ Back", "menu:main")]]) };
    await ctx.replyWithPhoto(product.thumbnailFileId, {
      caption: `${product.title}\n${product.shortDescription}\n⭐ ${product.priceStars} Stars`,
      ...options,
    });
  }
}

composer.callbackQuery("catalog:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showCatalog(ctx);
});

export default composer;
