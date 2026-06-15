import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Droplet, 
  Send, 
  RefreshCw, 
  Trash2, 
  UserPlus, 
  Sliders, 
  Check, 
  Bot, 
  Info, 
  CheckCircle, 
  MapPin, 
  Bell, 
  Calendar, 
  ToggleLeft, 
  Globe
} from "lucide-react";

interface DistrictWithSchedule {
  name: string;
  code: string;
  baseDate: string;
  step?: number;
  schedule: string[];
  isTodayWater: boolean;
}

interface BotStatus {
  isConfigured: boolean;
  botDetails: {
    id?: number;
    first_name?: string;
    username?: string;
    isFake?: boolean;
  } | null;
  webhookUrl: string;
  appName: string;
}

interface Subscription {
  chatId: string;
  districtCode: string;
  districtName: string;
  username?: string;
  createdAt: string;
}

export default function App() {
  // Tabs: 'donetsk' | 'makeevka'
  const [activeTab, setActiveTab] = useState<"donetsk" | "makeevka">("donetsk");
  
  // Data State
  const [districtsData, setDistrictsData] = useState<{
    donetsk: DistrictWithSchedule[];
    makeevka: DistrictWithSchedule[];
    metadata: {
      lastScrapedTime: string;
      scrapeStatus: string;
      totalCount: number;
    };
  } | null>(null);

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  
  // Interaction & UI State
  const [isScraping, setIsScraping] = useState(false);
  const [isAlerting, setIsAlerting] = useState(false);
  const [alertSummary, setAlertSummary] = useState<{
    success: boolean;
    sentCount: number;
    errorCount: number;
    targets: string[];
  } | null>(null);

  // Manual mock subscription Form
  const [formChatId, setFormChatId] = useState("");
  const [formDistrictCode, setFormDistrictCode] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState(false);

  // Search filter
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch all initial data
  const loadAllData = async () => {
    try {
      // 1. Fetch districts
      const resDistricts = await fetch("/api/districts");
      if (resDistricts.ok) {
        const data = await resDistricts.json();
        setDistrictsData(data);
      }

      // 2. Fetch bot status
      const resBot = await fetch("/api/bot-status");
      if (resBot.ok) {
        const data = await resBot.json();
        setBotStatus(data);
      }

      // 3. Fetch subscriptions
      const resSubs = await fetch("/api/subscriptions");
      if (resSubs.ok) {
        const data = await resSubs.json();
        setSubscriptions(data);
      }
    } catch (e) {
      console.error("Failed to load dashboard data:", e);
    }
  };

  useEffect(() => {
    loadAllData();
    const interval = setInterval(loadAllData, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, []);

  // Force Scripter execution
  const triggerScrape = async () => {
    setIsScraping(true);
    try {
      const res = await fetch("/api/scrape-now", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        await loadAllData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsScraping(false);
    }
  };

  // Dispatch live alerts to actual + simulated subscribers
  const triggerSendAlerts = async () => {
    setIsAlerting(true);
    setAlertSummary(null);
    try {
      const res = await fetch("/api/send-alerts", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setAlertSummary(data);
        await loadAllData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsAlerting(false);
    }
  };

  // Add mock subscriber
  const handleAddMockSub = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess(false);

    if (!formChatId || !formDistrictCode) {
      setFormError("Заполните Chat ID и выберите район");
      return;
    }

    const allList = districtsData 
      ? [...districtsData.donetsk, ...districtsData.makeevka]
      : [];
    const dist = allList.find(d => d.code === formDistrictCode);

    if (!dist) {
      setFormError("Район не найден.");
      return;
    }

    try {
      const res = await fetch("/api/subscriptions/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: formChatId.trim(),
          districtCode: formDistrictCode,
          districtName: dist.name,
          username: formUsername.trim() || undefined
        })
      });

      if (res.ok) {
        setFormSuccess(true);
        setFormChatId("");
        setFormUsername("");
        // Load updated list
        const resSubs = await fetch("/api/subscriptions");
        if (resSubs.ok) {
          const data = await resSubs.json();
          setSubscriptions(data);
        }
      } else {
        const err = await res.json();
        setFormError(err.error || "Ошибка подписки");
      }
    } catch (err: any) {
      setFormError(err.message || "Не удалось отправить запрос");
    }
  };

  // Unsubscribe chatId
  const handleUnsubscribe = async (chatId: string) => {
    if (!confirm(`Удалить подписку для Chat ID: ${chatId}?`)) return;
    try {
      const res = await fetch(`/api/subscriptions/${chatId}`, { method: "DELETE" });
      if (res.ok) {
        setSubscriptions(prev => prev.filter(s => s.chatId !== chatId));
      }
    } catch (e) {
      console.error("Failed to delete subscription:", e);
    }
  };

  // Filter list of districts based on search query
  const getFilteredDistricts = () => {
    if (!districtsData) return [];
    const list = activeTab === "donetsk" ? districtsData.donetsk : districtsData.makeevka;
    if (!searchQuery) return list;
    return list.filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()));
  };

  const currentDistricts = getFilteredDistricts();
  
  // Total counts for dashboard indicators
  const stats = {
    donetskTotal: districtsData?.donetsk.length || 0,
    makeevkaTotal: districtsData?.makeevka.length || 0,
    subsTotal: subscriptions.length,
    waterTodayCount: districtsData
      ? [...districtsData.donetsk, ...districtsData.makeevka].filter(d => d.isTodayWater).length
      : 0
  };

  return (
    <div id="portal-root" className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-sky-500 selection:text-white">
      {/* Dynamic Background Water Bubbles Decoration */}
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-sky-950/40 to-slate-900 pointer-events-none z-0" />

      {/* Main Container */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        
        {/* Header Layout */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-sky-900/40 pb-6 mb-8 gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-sky-500/10 p-3 rounded-2xl border border-sky-400/20 text-sky-400 self-start shadow-inner shadow-sky-500/10">
              <Droplet className="w-8 h-8 animate-pulse text-sky-400" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
                Донецк Вода <span className="text-sky-400 text-xl font-normal py-0.5 px-2 bg-sky-950/80 border border-sky-500/20 rounded-full">Бот-Панель</span>
              </h1>
              <p className="text-slate-400 text-sm mt-1 max-w-lg">
                Интерактивный шлюз для парсинга графиков подачи воды и управления Telegram-рассылкой по районам г. Донецка и г. Макеевки.
              </p>
            </div>
          </div>

          {/* Scrape Info Block */}
          <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-2xl md:text-right flex flex-col justify-between self-stretch md:self-auto min-w-[280px]">
            <div className="flex justify-between items-center md:justify-end gap-3">
              <span className="text-xs text-slate-400">Парсер сайта:</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                districtsData?.metadata.scrapeStatus.includes("Успешно") 
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
              }`}>
                {districtsData?.metadata.scrapeStatus || "Загрузка..."}
              </span>
            </div>
            
            <div className="text-slate-300 text-xs mt-2">
              Последняя синхронизация: <strong className="text-slate-100">{districtsData?.metadata.lastScrapedTime || "Загрузка..."}</strong>
            </div>

            <button
              onClick={triggerScrape}
              disabled={isScraping}
              className="mt-3 flex items-center justify-center gap-2 text-xs font-semibold bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-400/20 py-1.5 px-3 rounded-xl transition duration-200"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScraping ? "animate-spin" : ""}`} />
              Спарсить водадонбасса.рф
            </button>
          </div>
        </header>

        {/* Dashboard Bento Stat Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-800/60 border border-slate-700/80 p-5 rounded-3xl flex items-center gap-4">
            <div className="p-3 bg-sky-500/10 rounded-2xl border border-sky-500/20 text-sky-400">
              <Droplet className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{stats.waterTodayCount}</div>
              <div className="text-xs text-slate-400 mt-0.5">Района с водой сегодня</div>
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/80 p-5 rounded-3xl flex items-center gap-4">
            <div className="p-3 bg-cyan-500/10 rounded-2xl border border-cyan-500/20 text-cyan-400">
              <Bell className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{stats.subsTotal}</div>
              <div className="text-xs text-slate-400 mt-0.5">Активных подписчика</div>
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/80 p-5 rounded-3xl flex items-center gap-4">
            <div className="p-3 bg-violet-500/10 rounded-2xl border border-violet-500/20 text-violet-400">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-semibold text-white truncate max-w-[150px]">
                {botStatus?.isConfigured && botStatus.botDetails?.username
                  ? `@${botStatus.botDetails.username}` 
                  : "Оффлайн (нет токена)"}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">Статус Telegram-бота</div>
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/80 p-5 rounded-3xl flex items-center gap-4">
            <div className="p-3 bg-slate-700/50 rounded-2xl border border-slate-600/50 text-slate-300">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{stats.donetskTotal + stats.makeevkaTotal}</div>
              <div className="text-xs text-slate-400 mt-0.5">Всего локаций в базе</div>
            </div>
          </div>
        </section>

        {/* Major Content Split Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Left Columns: Location Schedules and Tabs */}
          <main className="lg:col-span-2 space-y-6">
            
            {/* Nav & Filters bar */}
            <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex bg-slate-900 border border-slate-700 p-1.5 rounded-2xl w-full sm:w-auto">
                <button
                  onClick={() => { setActiveTab("donetsk"); setSearchQuery(""); }}
                  className={`flex-1 sm:flex-initial py-2 px-6 rounded-xl text-sm font-bold transition duration-150 ${
                    activeTab === "donetsk"
                      ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  🏙️ Донецк ({stats.donetskTotal})
                </button>
                <button
                  onClick={() => { setActiveTab("makeevka"); setSearchQuery(""); }}
                  className={`flex-1 sm:flex-initial py-2 px-6 rounded-xl text-sm font-bold transition duration-150 ${
                    activeTab === "makeevka"
                      ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  🏭 Макеевка ({stats.makeevkaTotal})
                </button>
              </div>

              {/* Search input */}
              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Поиск района..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-2xl py-2 px-4 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition"
                />
              </div>
            </div>

            {/* Districts List Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {districtsData ? (
                currentDistricts.length > 0 ? (
                  currentDistricts.map((district) => {
                    return (
                      <motion.div
                        layout
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={district.code}
                        className={`bg-slate-800/50 border rounded-3xl p-5 hover:border-slate-600 transition flex flex-col justify-between ${
                          district.isTodayWater 
                            ? "border-sky-500/40 bg-sky-950/10 shadow-lg shadow-sky-500/5" 
                            : "border-slate-700/80"
                        }`}
                      >
                        <div>
                          {/* Title & Today Status Badge */}
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <span className="flex items-center gap-1.5 text-slate-300 font-semibold text-base">
                              <MapPin className="w-4 h-4 text-sky-400 opacity-80" />
                              {district.name}
                            </span>
                            {district.isTodayWater ? (
                              <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-400/20 py-1 px-2.5 rounded-full animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                Вода сегодня!
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-500 font-bold bg-slate-800 border border-slate-700/60 py-0.5 px-2 rounded-full">
                                Ожидание
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-slate-400 flex items-center gap-1 mb-4">
                            <span>Периодичность:</span>
                            <strong className="text-slate-200">раз в {district.step || 3} дня</strong>
                            <span className="mx-1">•</span>
                            <span>Код: {district.code}</span>
                          </div>

                          {/* Dynamic Schedule Dates representation */}
                          <div className="space-y-2 mt-2">
                            <div className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-sky-400" />
                              Даты подачи на неделю:
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              {district.schedule.map((dateStr, idx) => {
                                const isDateToday = dateStr === `${("0" + new Date().getDate()).slice(-2)}.${("0" + (new Date().getMonth() + 1)).slice(-2)}.${new Date().getFullYear()}`;
                                return (
                                  <div 
                                    key={idx} 
                                    className={`text-[11px] py-1 px-2 rounded-xl text-center border font-mono transition duration-150 ${
                                      isDateToday 
                                        ? "bg-sky-500/10 border-sky-400 text-sky-300 font-bold" 
                                        : "bg-slate-900/60 border-slate-800 text-slate-300"
                                    }`}
                                  >
                                    {dateStr}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Direct Subscribe Interaction Trigger */}
                        <div className="mt-5 pt-4 border-t border-slate-700/60 flex items-center justify-between gap-2">
                          <button
                            onClick={() => {
                              setFormDistrictCode(district.code);
                              // Smooth scroll to subscription form
                              document.getElementById("form-anchor")?.scrollIntoView({ behavior: "smooth" });
                            }}
                            className="text-xs font-medium text-slate-400 hover:text-sky-400 transition flex items-center gap-1"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            Прописать подписку
                          </button>

                          <span className="text-[10px] text-slate-500 font-mono">База: {district.baseDate}</span>
                        </div>
                      </motion.div>
                    );
                  })
                ) : (
                  <div className="col-span-1 md:col-span-2 text-center py-12 bg-slate-800/20 border border-dashed border-slate-800 rounded-3xl text-slate-500">
                    Районы по запросу "{searchQuery}" не найдены.
                  </div>
                )
              ) : (
                <div className="col-span-1 md:col-span-2 text-center py-20">
                  <RefreshCw className="w-8 h-8 text-sky-500 animate-spin mx-auto mb-3" />
                  <span className="text-sm text-slate-400">Загрузка базы данных водоснабжения...</span>
                </div>
              )}
            </div>

            {/* Telegram Bot Instructions Guides */}
            <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 border border-slate-700/80 p-6 rounded-3xl space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Info className="w-5 h-5 text-sky-400" />
                Инструкция по настройке Telegram-бота
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300">
                <div className="space-y-3 bg-slate-900/40 p-4 rounded-2xl border border-slate-800">
                  <div className="flex items-center gap-2 text-slate-100 font-bold">
                    <span className="bg-sky-500 text-slate-900 w-5 h-5 rounded-full flex items-center justify-center text-xs">1</span>
                    Регистрация бота:
                  </div>
                  <p>
                    Найдите бота <strong className="text-white">@BotFather</strong> в Telegram.
                    Отправьте команду <span className="font-mono text-sky-300 font-bold">/newbot</span>. Получите ваш уникальный <strong className="text-white">Токен API (Token)</strong>.
                  </p>
                </div>

                <div className="space-y-3 bg-slate-900/40 p-4 rounded-2xl border border-slate-800">
                  <div className="flex items-center gap-2 text-slate-100 font-bold">
                    <span className="bg-sky-500 text-slate-900 w-5 h-5 rounded-full flex items-center justify-center text-xs">2</span>
                    Подключение Токена:
                  </div>
                  <p>
                    Перейдите в настройки AI Studio, откройте раздел <strong className="text-white">Secrets / Переменные</strong>.
                    Добавьте переменную <span className="font-mono text-sky-300 font-bold">TELEGRAM_BOT_TOKEN</span> и вставьте ваш Token.
                  </p>
                </div>
              </div>

              <div className="pt-2 text-xs text-slate-400 bg-sky-950/25 border border-sky-500/10 p-4 rounded-2xl flex items-start gap-2.5">
                <CheckCircle className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-200 block mb-0.5">Вэбхук настроен автоматически!</strong>
                  Наш сервер автоматически регистрирует хук на серверах Telegram. Вам больше ничего не нужно делать. При отправке пользователем сообщения, бот проснётся в контейнере, посчитает даты и вернёт ответ!
                </div>
              </div>
            </div>

          </main>

          {/* Right Columns: Subscriptions Control Panel & Simulation Area */}
          <aside className="space-y-6">

            {/* Subscriptions Management Board */}
            <div className="bg-slate-800/80 border border-slate-700/80 p-6 rounded-3xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Bell className="w-5 h-5 text-sky-400" />
                  Управление подписчиками
                </h3>
                <span className="bg-sky-500/10 text-sky-400 text-xs font-bold px-2 py-0.5 rounded-full border border-sky-500/20">
                  {subscriptions.length} активных
                </span>
              </div>

              {/* Subscriber alerts button controller */}
              <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl space-y-3 text-center">
                <div className="text-xs text-slate-400">
                  Хотите имитировать запуск ежедневной утренней рассылки для активных подписчиков на воду на сегодня?
                </div>
                <button
                  onClick={triggerSendAlerts}
                  disabled={isAlerting || subscriptions.length === 0}
                  className="w-full bg-sky-500 hover:bg-sky-600 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-xs transition duration-150 flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                >
                  <Send className="w-3.5 h-3.5" />
                  {isAlerting ? "Запускается рассылка..." : "📢 Разослать оповещения сегодня"}
                </button>
              </div>

              {/* Alert Result Modal */}
              {alertSummary && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl text-xs text-slate-300 space-y-2"
                >
                  <div className="font-bold text-emerald-400 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" />
                    Рассылка завершена!
                  </div>
                  <ul className="space-y-1 mt-1 text-[11px]">
                    <li>Отправлено сообщений: <strong className="text-white">{alertSummary.sentCount}</strong></li>
                    <li>Ошибок доставки: <strong className="text-white">{alertSummary.errorCount}</strong></li>
                    {alertSummary.targets.length > 0 && (
                      <li className="text-slate-400 truncate">Кому: {alertSummary.targets.join(", ")}</li>
                    )}
                  </ul>
                  <button 
                    onClick={() => setAlertSummary(null)}
                    className="text-[10px] text-sky-400 hover:underline pt-1 block"
                  >
                    Скрыть отчет
                  </button>
                </motion.div>
              )}

              {/* Subscriptions Mini-Table */}
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {subscriptions.length > 0 ? (
                  subscriptions.map((sub) => (
                    <div key={sub.chatId} className="bg-slate-900/60 hover:bg-slate-900 border border-slate-800 p-3 rounded-2xl flex items-center justify-between gap-2 text-xs">
                      <div>
                        <div className="font-bold text-slate-200">
                          {sub.username ? `@${sub.username}` : `ИД: ${sub.chatId}`}
                        </div>
                        <div className="text-slate-400 text-[11px] mt-0.5">
                          Подписка: <span className="text-sky-300 font-semibold">{sub.districtName}</span>
                        </div>
                        <div className="text-[9px] text-slate-500 font-mono mt-1">
                          ID: {sub.chatId} • {new Date(sub.createdAt).toLocaleDateString('ru-RU')}
                        </div>
                      </div>

                      <button
                        onClick={() => handleUnsubscribe(sub.chatId)}
                        className="p-1 px-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                        title="Удалить подписку"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-slate-500 text-xs">
                    Нет активных подписчиков. Текстовые подписки появятся здесь, когда пользователи активируют бота в Telegram.
                  </div>
                )}
              </div>
            </div>

            {/* Manual Staging Form Section */}
            <div id="form-anchor" className="bg-slate-800/80 border border-slate-700/80 p-6 rounded-3xl space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-sky-400" />
                Тестирование & Подписка
              </h3>

              <p className="text-xs text-slate-400">
                Зарегистрируйте свой Chat ID (или любой тестовый ID, например <code className="bg-slate-900 py-0.5 px-1.5 rounded transition font-mono border border-slate-800">12345</code>), чтобы смоделировать и протестировать напоминания бота!
              </p>

              <form onSubmit={handleAddMockSub} className="space-y-3.5">
                {formError && (
                  <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs p-3 rounded-xl">
                    {formError}
                  </div>
                )}

                {formSuccess && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs p-3 rounded-xl flex items-center gap-1.5">
                    <Check className="w-4 h-4" />
                    Подписчик успешно добавлен
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Телеграм Chat ID / Костыль</label>
                  <input
                    type="text"
                    placeholder="Например: 123456789"
                    value={formChatId}
                    onChange={(e) => setFormChatId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-705 p-2.5 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Имя пользователя / Ник</label>
                  <input
                    type="text"
                    placeholder="Например: water_tester"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-705 p-2.5 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Район подписки</label>
                  <select
                    value={formDistrictCode}
                    onChange={(e) => setFormDistrictCode(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-705 p-2.5 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500"
                    required
                  >
                    <option value="">-- Выберите район --</option>
                    {districtsData && (
                      <>
                        <optgroup label="Донецк">
                          {districtsData.donetsk.map(d => (
                            <option key={d.code} value={d.code}>{d.name}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Макеевка">
                          {districtsData.makeevka.map(d => (
                            <option key={d.code} value={d.code}>{d.name}</option>
                          ))}
                        </optgroup>
                      </>
                    )}
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full bg-sky-500 hover:bg-sky-600 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-xs transition duration-150 flex items-center justify-center gap-1.5 cursor-pointer mt-2"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Создать подписку
                </button>
              </form>
            </div>

          </aside>

        </div>

      </div>
    </div>
  );
}
