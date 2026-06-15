import { Telegraf, Markup } from 'telegraf';
import { getWaterSchedule, isTodayWater, ALL_DISTRICTS, District } from './parser';
import { saveSubscription, removeSubscription, getSubscriptions, TelegramSubscription } from './db';

const token = process.env.TELEGRAM_BOT_TOKEN;
export const isBotAvailable = !!token;

let bot: Telegraf | null = null;

if (isBotAvailable && token) {
  try {
    bot = new Telegraf(token);
    setupBotHandlers(bot);
    console.log("🤖 Telegram Bot initialized successfully.");
  } catch (error) {
    console.error("❌ Failed to initialize Telegraf:", error);
  }
} else {
  console.log("⚠️ TELEGRAM_BOT_TOKEN is not defined in environment variables. Bot operations are disabled.");
}

export function getBotInstance(): Telegraf | null {
  return bot;
}

/**
 * Configure Telegraf Bot Commands and Interaction Handlers
 */
function setupBotHandlers(bot: Telegraf) {
  // Start greeting
  bot.command('start', async (ctx) => {
    const username = ctx.from?.username || ctx.from?.first_name || "друг";
    const welcomeText = `👋 Здравствуйте, ${username}! 

Я бот-помощник по графику подачи воды в г. Донецк и г. Макеевка.
Данные тянутся напрямую с официального интерактивного портала вводадонбасса.рф (возродимдонбасс.рф) посредством парсинга!

Я могу:
1️⃣ Показывать актуальные графики подачи по районам.
2️⃣ Оповещать вас утром в день подачи воды в вашем районе.

Используйте меню ниже, чтобы начать! 👇`;

    return ctx.reply(welcomeText, getMainMenuKeyboard());
  });

  // Base buttons handler
  bot.hears('📋 Расписание воды', async (ctx) => {
    return sendDistrictSelectionList(ctx, 'schedule');
  });

  bot.hears('🔔 Подписаться на район', async (ctx) => {
    return sendDistrictSelectionList(ctx, 'subscribe');
  });

  bot.hears('❓ Мой статус', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const list = await getSubscriptions();
    const activeSub = list.find(s => s.chatId === chatId);

    if (activeSub) {
      const schedule = getWaterSchedule(
        ALL_DISTRICTS.find(d => d.code === activeSub.districtCode)?.baseDate || "01.08.2025",
        5,
        ALL_DISTRICTS.find(d => d.code === activeSub.districtCode)?.step || 3
      );
      const isWaterToday = isTodayWater(schedule);

      return ctx.reply(
        `🔔 **Ваша активная подписка:**\n` +
        `📍 Район: **${activeSub.districtName}**\n` +
        `📅 Подключена: ${new Date(activeSub.createdAt).toLocaleDateString('ru-RU')}\n\n` +
        `💧 Ближайшие подачи: ${schedule.slice(0, 3).join(', ')}\n` +
        `${isWaterToday ? '🎉 **СЕГОДНЯ ДЕНЬ ВОДЫ в вашем районе!** 💧' : '⏳ Сегодня подачи воды нет.'}`,
        { parse_mode: 'Markdown' }
      );
    } else {
      return ctx.reply(
        "🪹 У вас нет активных подписок. Выберите '🔔 Подписаться на район' в меню, чтобы получать утренние уведомления!",
        getMainMenuKeyboard()
      );
    }
  });

  bot.hears('🔕 Отписаться', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const didRemove = await removeSubscription(chatId);
    
    if (didRemove) {
      return ctx.reply("🔕 Вы успешно отписались от уведомлений. Рассылка для вас приостановлена.", getMainMenuKeyboard());
    } else {
      return ctx.reply("У вас не было активных подписок.");
    }
  });

  // Commands map
  bot.command('schedule', async (ctx) => {
    return sendDistrictSelectionList(ctx, 'schedule');
  });

  bot.command('subscribe', async (ctx) => {
    return sendDistrictSelectionList(ctx, 'subscribe');
  });

  bot.command('status', async (ctx) => {
    // trigger status logic
    const chatId = String(ctx.chat.id);
    const list = await getSubscriptions();
    const activeSub = list.find(s => s.chatId === chatId);
    if (activeSub) {
      return ctx.reply(`🔔 Ваша подписка: ${activeSub.districtName}`);
    } else {
      return ctx.reply("У вас нет активной подписки.");
    }
  });

  // Callback queries
  bot.on('callback_query', async (ctx) => {
    const callbackData = (ctx.callbackQuery as any).data;
    if (!callbackData) return;

    try {
      const [action, code] = callbackData.split(':');
      const district = ALL_DISTRICTS.find(d => d.code === code);

      if (!district) {
        return ctx.answerCbQuery("Ошибка: район не найден в базе.");
      }

      if (action === 'sched') {
        const schedule = getWaterSchedule(district.baseDate, 5, district.step || 3);
        const isWaterTd = isTodayWater(schedule);
        
        let response = `📍 **${district.name}**\n`;
        response += `💧 Периодичность: раз в ${district.step || 3} дня.\n\n`;
        response += `🕒 Ближайшие даты подачи воды:\n`;
        
        schedule.forEach((dateStr, idx) => {
          const isToday = isTodayStr(dateStr);
          response += `${idx === 0 && isToday ? '🔴' : '🔹'} ${dateStr}${isToday ? ' (Сегодня! 💧)' : ''}\n`;
        });

        response += `\n_${isWaterTd ? '🎉 СЕГОДНЯ ВОДА ПОДАЕТСЯ!' : '⏳ Сегодня подачи нет.'}_\n`;
        response += `\n*Источник:* официальный портала водадонбасса.рф`;

        await ctx.editMessageText(response, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([
          [Markup.button.callback('🔔 Подписаться на этот район', `sub:${district.code}`)]
        ]) });
        return ctx.answerCbQuery();
      }

      if (action === 'sub') {
        const chatId = String(ctx.chat?.id || ctx.from.id);
        const username = ctx.from.username || ctx.from.first_name || "User";

        const sub: TelegramSubscription = {
          chatId,
          districtCode: district.code,
          districtName: district.name,
          username,
          createdAt: new Date().toISOString()
        };

        await saveSubscription(sub);
        await ctx.editMessageText(
          `🎉 **Отличные новости!**\n\n` +
          `Вы успешно подписались на оповещения для района:\n` +
          `📍 **${district.name}**\n\n` +
          `Я буду присылать вам напоминание каждое утро (около 08:00) в день подачи воды, чтобы вы не забыли сделать запасы! 🪣💧`,
          { parse_mode: 'Markdown' }
        );
        return ctx.answerCbQuery("Подписка оформлена!");
      }

    } catch (err: any) {
      console.error("Callback query error:", err);
      return ctx.answerCbQuery("Прозошла ошибка при обработке.");
    }
  });
}

function isTodayStr(dateStr: string): boolean {
  const today = new Date();
  const d = ("0" + today.getDate()).slice(-2);
  const m = ("0" + (today.getMonth() + 1)).slice(-2);
  const y = today.getFullYear();
  return `${d}.${m}.${y}` === dateStr;
}

/**
 * Returns the primary reply keyboard markup
 */
function getMainMenuKeyboard() {
  return Markup.keyboard([
    ['📋 Расписание воды', '🔔 Подписаться на район'],
    ['❓ Мой статус', '🔕 Отписаться']
  ]).resize();
}

/**
 * Sends inline buttons list of districts to select for an action
 */
async function sendDistrictSelectionList(ctx: any, purpose: 'schedule' | 'subscribe') {
  const prefix = purpose === 'schedule' ? 'sched' : 'sub';
  
  // Split districts into chunks of inline buttons
  const buttons = ALL_DISTRICTS.map(d => {
    const isDonetsk = d.code.startsWith('donetsk');
    const cleanName = d.name.replace(" район", "").replace(" (общий)", " (общий)");
    const tag = isDonetsk ? "🏙️" : "🏭";
    return Markup.button.callback(`${tag} ${cleanName}`, `${prefix}:${d.code}`);
  });

  const keyboard: any[] = [];
  for (let i = 0; i < buttons.length; i += 2) {
    keyboard.push(buttons.slice(i, i + 2));
  }

  const text = purpose === 'schedule' 
    ? "🗺️ Выберите интересующий район г. Донецка или г. Макеевки, чтобы узнать его график воды:\n*(🏙️ — Донецк, 🏭 — Макеевка)*"
    : "🔔 Выберите район для ежедневной подписки на воду:\n*(🏙️ — Донецк, 🏭 — Макеевка)*";

  return ctx.reply(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(keyboard)
  });
}

/**
 * Function to run daily notification dispatch (e.g. at 08:00 AM)
 * Iterates through active subscribers, checks if TODAY is water day of their district, and sends tele-messages!
 */
export async function dispatchDailyNotifications(): Promise<{ sentCount: number, errorCount: number, targets: string[] }> {
  if (!bot) {
    throw new Error("Bot instance is not initialized or missing token");
  }

  const subscriptions = await getSubscriptions();
  let sentCount = 0;
  let errorCount = 0;
  const targets: string[] = [];

  for (const sub of subscriptions) {
    try {
      const district = ALL_DISTRICTS.find(d => d.code === sub.districtCode);
      if (!district) continue;

      const schedule = getWaterSchedule(district.baseDate, 5, district.step || 3);
      if (isTodayWater(schedule)) {
        // Today is a water day!!! Alert subscriber
        const alertMsg = `📢 **ВНИМАНИЕ! СЕГОДНЯ ДЕНЬ ВОДЫ!** 💧\n\n` +
          `📍 Сегодня подача воды в вашем районе: **${sub.districtName}**!\n` +
          `Не забудьте вовремя наполнить все емкости и сделать запас. 🪣🌊\n\n` +
          `⏳ Следующая подача по графику: через ${district.step || 3} дня.`;

        await bot.telegram.sendMessage(sub.chatId, alertMsg, { parse_mode: 'Markdown' });
        targets.push(`chat:${sub.chatId} (${sub.districtName})`);
        sentCount++;
      }
    } catch (error) {
      console.error(`Failed to send alert to chat:${sub.chatId}`, error);
      errorCount++;
    }
  }

  return { sentCount, errorCount, targets };
}
