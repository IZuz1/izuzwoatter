import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { 
  getWaterSchedule, 
  isTodayWater, 
  ALL_DISTRICTS, 
  DONETSK_DISTRICTS, 
  MAKEYEVKA_DISTRICTS, 
  scrapeLiveWaterDatabase 
} from "./src/parser";
import { 
  getSubscriptions, 
  saveSubscription, 
  removeSubscription, 
  TelegramSubscription 
} from "./src/db";
import { 
  getBotInstance, 
  isBotAvailable, 
  dispatchDailyNotifications 
} from "./src/bot";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Support JSON request bodies
  app.use(express.json());

  // In-memory cache of scraped districts
  let runtimeDonetsk = DONETSK_DISTRICTS;
  let runtimeMakeevka = MAKEYEVKA_DISTRICTS;
  let lastScrapedTime = "Ни разу (используются встроенные)";
  let scrapeStatus = "Готов к работе";

  // Trigger initial asynchronous scrape in background to keep startup instant
  scrapeLiveWaterDatabase().then((res) => {
    if (res.isScraped) {
      runtimeDonetsk = res.donetsk;
      runtimeMakeevka = res.makeevka;
      lastScrapedTime = new Date().toLocaleTimeString("ru-RU") + " " + new Date().toLocaleDateString("ru-RU");
      scrapeStatus = "Успешно обновлено с сайта";
    } else {
      scrapeStatus = "Ошибка парсинга, активен встроенный кэш";
    }
  }).catch((err) => {
    scrapeStatus = `Ошибка: ${err.message}`;
  });

  // API: Health probe
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  // API: Get parsed database of Donetsk and Makeevka districts and dynamic water calendars
  app.get("/api/districts", (req, res) => {
    const formatDistricts = (list: typeof DONETSK_DISTRICTS) => {
      return list.map(d => {
        const schedule = getWaterSchedule(d.baseDate, 7, d.step || 3);
        return {
          ...d,
          schedule,
          isTodayWater: isTodayWater(schedule)
        };
      });
    };

    res.json({
      donetsk: formatDistricts(runtimeDonetsk),
      makeevka: formatDistricts(runtimeMakeevka),
      metadata: {
        lastScrapedTime,
        scrapeStatus,
        totalCount: runtimeDonetsk.length + runtimeMakeevka.length
      }
    });
  });

  // API: Trigger live manual scraping on demand
  app.post("/api/scrape-now", async (req, res) => {
    try {
      scrapeStatus = "Выполняется парсинг...";
      const result = await scrapeLiveWaterDatabase();
      if (result.isScraped) {
        runtimeDonetsk = result.donetsk;
        runtimeMakeevka = result.makeevka;
        lastScrapedTime = new Date().toLocaleTimeString("ru-RU") + " " + new Date().toLocaleDateString("ru-RU");
        scrapeStatus = "Успешно обновлено с сайта";
        res.json({ success: true, count: runtimeDonetsk.length + runtimeMakeevka.length });
      } else {
        scrapeStatus = "Ошибка: сайт вернул некорректный ответ";
        res.status(500).json({ success: false, message: scrapeStatus });
      }
    } catch (e: any) {
      scrapeStatus = `Ошибка: ${e.message}`;
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // API: Subscriptions management
  app.get("/api/subscriptions", async (req, res) => {
    try {
      const subs = await getSubscriptions();
      res.json(subs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/subscriptions/manual", async (req, res) => {
    const { chatId, districtCode, districtName, username } = req.body;
    if (!chatId || !districtCode || !districtName) {
      return res.status(400).json({ error: "chatId, districtCode, and districtName are required fields" });
    }

    try {
      const sub: TelegramSubscription = {
        chatId,
        districtCode,
        districtName,
        username: username || "Аноним",
        createdAt: new Date().toISOString()
      };
      await saveSubscription(sub);
      res.json({ success: true, subscription: sub });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/subscriptions/:chatId", async (req, res) => {
    try {
      const deleted = await removeSubscription(req.params.chatId);
      res.json({ success: deleted });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // API: Get bot configuration and endpoint state
  app.get("/api/bot-status", async (req, res) => {
    const bot = getBotInstance();
    let telegramInfo: any = null;

    if (bot) {
      try {
        telegramInfo = await bot.telegram.getMe();
      } catch (err: any) {
        console.warn("Could not fetch bot information from Telegram servers:", err.message);
        telegramInfo = { name: "Загрузка...", isFake: true };
      }
    }

    res.json({
      isConfigured: isBotAvailable,
      botDetails: telegramInfo,
      webhookUrl: process.env.APP_URL ? `${process.env.APP_URL}/api/telegram-webhook` : "Не назначен",
      appName: "Донецк Вода-Оповещатель"
    });
  });

  // API: Manual trigger to send Telegram Alerts for water today
  app.post("/api/send-alerts", async (req, res) => {
    try {
      const stats = await dispatchDailyNotifications();
      res.json({ success: true, ...stats });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // API: Telegram Bot webhook endpoint
  app.post("/api/telegram-webhook", (req, res) => {
    const bot = getBotInstance();
    if (bot) {
      bot.handleUpdate(req.body, res);
    } else {
      res.status(404).send("Bot is disabled");
    }
  });

  // Register Webhook to Telegram
  const bot = getBotInstance();
  if (bot && process.env.APP_URL) {
    const webhookUrl = `${process.env.APP_URL}/api/telegram-webhook`;
    console.log(`📡 Registering Telegram webhook callback: ${webhookUrl}`);
    bot.telegram.setWebhook(webhookUrl)
      .then((success) => {
        if (success) {
          console.log(`✅ Webhook registered successfully in Telegram cloud servers: ${webhookUrl}`);
        } else {
          console.warn(`❌ Telegram rejected webhook registration for ${webhookUrl}`);
        }
      })
      .catch((err) => {
        console.error("❌ Error registering Telegram Webhook callback:", err);
      });
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Water Schedule server listening on port ${PORT}`);
  });
}

startServer();
