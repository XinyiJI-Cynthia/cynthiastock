const STORAGE_KEY = "stock-brief-watchlist-v1";
const CACHE_KEY = "stock-brief-cache-v1";
const GDELT_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";

const DEFAULT_STOCKS = [
  {
    id: "sany-heavy",
    name: "三一重工",
    code: "600031",
    exchange: "sh",
    domesticTerms: ["三一重工", "三一", "工程机械", "挖掘机销量", "基建投资"],
    globalTerms: ["SANY Heavy Industry", "Sany Group", "construction machinery", "excavator sales"],
    officialUrl: "https://www.sse.com.cn/assortment/stock/list/info/company/index.shtml?COMPANY_CODE=600031",
    sector: "工程机械"
  },
  {
    id: "northern-rare-earth",
    name: "北方稀土",
    code: "600111",
    exchange: "sh",
    domesticTerms: ["北方稀土", "稀土价格", "氧化镨钕", "稀土出口", "磁材"],
    globalTerms: ["China Northern Rare Earth", "Northern Rare Earth", "rare earth prices", "NdPr oxide"],
    officialUrl: "https://www.sse.com.cn/assortment/stock/list/info/company/index.shtml?COMPANY_CODE=600111",
    sector: "稀土"
  }
];

const COMMON_RULES = {
  positive: [
    ["中标", "订单或项目落地"],
    ["签约", "订单或合作落地"],
    ["订单增长", "订单改善"],
    ["回购", "公司回购"],
    ["增持", "股东或管理层增持"],
    ["业绩预增", "业绩预告改善"],
    ["利润增长", "盈利改善"],
    ["净利润增长", "盈利改善"],
    ["营收增长", "收入改善"],
    ["价格上涨", "产品价格上行"],
    ["涨价", "产品价格上行"],
    ["供应收紧", "供给端收紧"],
    ["供给收紧", "供给端收紧"],
    ["需求回暖", "需求改善"],
    ["需求增长", "需求改善"],
    ["政策支持", "政策支持"],
    ["补贴", "政策或财政支持"],
    ["wins contract", "contract win"],
    ["contract win", "contract win"],
    ["new order", "order improvement"],
    ["buyback", "company buyback"],
    ["profit rises", "profit improvement"],
    ["profit growth", "profit improvement"],
    ["revenue growth", "revenue improvement"],
    ["prices rise", "product price rise"],
    ["price rises", "product price rise"],
    ["supply tight", "supply tightening"],
    ["demand rebounds", "demand improvement"],
    ["policy support", "policy support"]
  ],
  negative: [
    ["减持", "股东减持"],
    ["处罚", "监管或处罚事项"],
    ["调查", "调查事项"],
    ["诉讼", "诉讼事项"],
    ["亏损", "亏损"],
    ["业绩预亏", "业绩预告转弱"],
    ["业绩预减", "业绩预告转弱"],
    ["利润下降", "盈利下滑"],
    ["净利润下降", "盈利下滑"],
    ["营收下降", "收入下滑"],
    ["价格下跌", "产品价格下行"],
    ["降价", "产品价格下行"],
    ["需求疲软", "需求偏弱"],
    ["需求下降", "需求偏弱"],
    ["出口下降", "出口偏弱"],
    ["召回", "产品召回"],
    ["事故", "事故事项"],
    ["制裁", "外部限制或制裁"],
    ["禁令", "外部限制或禁令"],
    ["违约", "信用风险"],
    ["债务压力", "债务压力"],
    ["停产", "生产中断"],
    ["sell-down", "shareholder sell-down"],
    ["investigation", "investigation"],
    ["lawsuit", "lawsuit"],
    ["loss", "loss"],
    ["profit warning", "profit warning"],
    ["profit falls", "profit decline"],
    ["revenue falls", "revenue decline"],
    ["prices fall", "product price fall"],
    ["price falls", "product price fall"],
    ["demand weak", "weak demand"],
    ["sanction", "external restriction"],
    ["ban", "external restriction"],
    ["default", "credit risk"]
  ]
};

const STOCK_RULES = {
  "600031": {
    positive: [
      ["挖掘机销量增长", "工程机械销量改善"],
      ["基建投资加速", "工程机械需求改善"],
      ["设备更新", "设备更新需求"],
      ["excavator sales rise", "construction machinery demand"],
      ["infrastructure spending", "infrastructure demand"]
    ],
    negative: [
      ["挖掘机销量下降", "工程机械销量偏弱"],
      ["房地产投资下降", "下游需求偏弱"],
      ["construction machinery sales fall", "construction machinery demand weak"]
    ]
  },
  "600111": {
    positive: [
      ["稀土价格上涨", "稀土价格上行"],
      ["氧化镨钕上涨", "核心产品价格上行"],
      ["配额收紧", "供给端收紧"],
      ["rare earth prices rise", "rare earth price rise"],
      ["ndpr prices rise", "core product price rise"]
    ],
    negative: [
      ["稀土价格下跌", "稀土价格下行"],
      ["氧化镨钕下跌", "核心产品价格下行"],
      ["配额增加", "供给增加"],
      ["rare earth prices fall", "rare earth price fall"],
      ["oversupply", "oversupply pressure"]
    ]
  }
};

const SOURCE_HINTS = {
  domestic: ["cn", "eastmoney", "sina", "stcn", "cnstock", "cls", "yicai", "caixin", "jrj", "10jqka"],
  global: ["reuters", "bloomberg", "marketwatch", "ft.com", "nikkei", "wsj", "cnbc", "mining.com"]
};

const signalText = {
  positive: "利好",
  negative: "利空",
  neutral: "中性",
  mixed: "多空都有",
  pending: "待判断"
};

const AI_NATURE_TYPES = {
  "明显利好": "positive",
  "偏利好": "positive",
  "中性": "neutral",
  "偏利空": "negative",
  "明显利空": "negative",
  "无法判断": "pending"
};

const els = {};
const state = {
  stocks: loadStocks(),
  activeStockId: "",
  quotes: new Map(),
  items: [],
  sourceFilter: "all",
  signalFilter: "all",
  rangeDays: 7,
  loading: false,
  errors: [],
  lastUpdated: null
};

document.addEventListener("DOMContentLoaded", init);
registerServiceWorker();

function init() {
  bindElements();
  state.activeStockId = state.stocks[0]?.id || "";
  attachEvents();
  hydrateCache();
  renderAll();
  refreshAll();
  window.setInterval(() => {
    if (!state.lastUpdated || Date.now() - state.lastUpdated.getTime() > 30 * 60 * 1000) {
      refreshAll();
    }
  }, 60 * 1000);
}

function bindElements() {
  els.lastUpdated = document.querySelector("#lastUpdated");
  els.refreshButton = document.querySelector("#refreshButton");
  els.settingsButton = document.querySelector("#settingsButton");
  els.quoteStrip = document.querySelector("#quoteStrip");
  els.stockTabs = document.querySelector("#stockTabs");
  els.rangeSelect = document.querySelector("#rangeSelect");
  els.sourceFilter = document.querySelector("#sourceFilter");
  els.signalFilter = document.querySelector("#signalFilter");
  els.summaryGrid = document.querySelector("#summaryGrid");
  els.feedTitle = document.querySelector("#feedTitle");
  els.feedMeta = document.querySelector("#feedMeta");
  els.officialLink = document.querySelector("#officialLink");
  els.statusLine = document.querySelector("#statusLine");
  els.feedList = document.querySelector("#feedList");
  els.settingsDialog = document.querySelector("#settingsDialog");
  els.watchlistEditor = document.querySelector("#watchlistEditor");
  els.newName = document.querySelector("#newName");
  els.newCode = document.querySelector("#newCode");
  els.newExchange = document.querySelector("#newExchange");
  els.addStockButton = document.querySelector("#addStockButton");
  els.resetStocksButton = document.querySelector("#resetStocksButton");
}

function attachEvents() {
  els.refreshButton.addEventListener("click", refreshAll);
  els.rangeSelect.addEventListener("change", () => {
    state.rangeDays = Number(els.rangeSelect.value);
    refreshAll();
  });
  els.stockTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-stock-id]");
    if (!button) return;
    state.activeStockId = button.dataset.stockId;
    renderAll();
  });
  els.sourceFilter.addEventListener("click", (event) => {
    const button = event.target.closest("[data-source]");
    if (!button) return;
    state.sourceFilter = button.dataset.source;
    updateSegmented(els.sourceFilter, "source", state.sourceFilter);
    renderFeed();
    renderSummary();
  });
  els.signalFilter.addEventListener("click", (event) => {
    const button = event.target.closest("[data-signal]");
    if (!button) return;
    state.signalFilter = button.dataset.signal;
    updateSegmented(els.signalFilter, "signal", state.signalFilter);
    renderFeed();
    renderSummary();
  });
  els.settingsButton.addEventListener("click", () => {
    renderWatchlistEditor();
    if (typeof els.settingsDialog.showModal === "function") {
      els.settingsDialog.showModal();
    } else {
      els.settingsDialog.setAttribute("open", "");
    }
  });
  els.addStockButton.addEventListener("click", addStockFromForm);
  els.resetStocksButton.addEventListener("click", () => {
    state.stocks = cloneStocks(DEFAULT_STOCKS);
    saveStocks();
    state.activeStockId = state.stocks[0].id;
    renderWatchlistEditor();
    renderAll();
    refreshAll();
  });
  els.watchlistEditor.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-stock]");
    if (!button) return;
    removeStock(button.dataset.removeStock);
  });
}

async function refreshAll() {
  if (!state.stocks.length || state.loading) return;
  state.loading = true;
  state.errors = [];
  renderStatus("正在更新公开来源...");
  renderQuotes();

  const [quoteResult, newsResult] = await Promise.allSettled([
    loadQuotes(),
    loadNews()
  ]);

  if (quoteResult.status === "rejected") {
    state.errors.push(`行情：${friendlyError(quoteResult.reason)}`);
  }
  if (newsResult.status === "rejected") {
    state.errors.push(`新闻：${friendlyError(newsResult.reason)}`);
  }

  state.loading = false;
  state.lastUpdated = new Date();
  persistCache();
  renderAll();
}

async function loadQuotes() {
  const symbols = state.stocks.map((stock) => stock.symbol);
  let quotes;
  try {
    quotes = await fetchServerQuotes(symbols);
  } catch (serverError) {
    try {
      quotes = await fetchSinaQuotes(symbols);
    } catch (sinaError) {
      quotes = await fetchTencentQuotes(symbols);
    }
  }
  quotes.forEach((quote) => state.quotes.set(quote.symbol, quote));
}

async function fetchServerQuotes(symbols) {
  const url = new URL("./api/quotes", window.location.href);
  url.searchParams.set("symbols", symbols.join(","));
  const response = await fetchWithTimeout(url.toString(), 7000);
  if (!response.ok) throw new Error("同源行情接口未可用");
  const data = await response.json();
  if (!Array.isArray(data.quotes) || !data.quotes.length) throw new Error("同源行情无返回");
  return data.quotes;
}

async function fetchSinaQuotes(symbols) {
  await loadScript(`https://hq.sinajs.cn/list=${symbols.join(",")}`, "gbk", 8000);
  const quotes = symbols.map(parseSinaQuote).filter(Boolean);
  if (!quotes.length) throw new Error("新浪行情无返回");
  return quotes;
}

function parseSinaQuote(symbol) {
  const raw = window[`hq_str_${symbol}`];
  if (!raw) return null;
  const parts = raw.split(",");
  const current = toNumber(parts[3]);
  const prevClose = toNumber(parts[2]);
  const change = current !== null && prevClose ? current - prevClose : null;
  const pct = change !== null && prevClose ? (change / prevClose) * 100 : null;
  return {
    provider: "新浪行情",
    symbol,
    name: parts[0] || findStockBySymbol(symbol)?.name || symbol,
    code: symbol.slice(2),
    open: toNumber(parts[1]),
    prevClose,
    price: current,
    high: toNumber(parts[4]),
    low: toNumber(parts[5]),
    volume: toNumber(parts[8]),
    amount: toNumber(parts[9]),
    change,
    pct,
    time: [parts[30], parts[31]].filter(Boolean).join(" ")
  };
}

async function fetchTencentQuotes(symbols) {
  await loadScript(`https://qt.gtimg.cn/q=${symbols.join(",")}`, "gbk", 8000);
  const quotes = symbols.map(parseTencentQuote).filter(Boolean);
  if (!quotes.length) throw new Error("腾讯行情无返回");
  return quotes;
}

function parseTencentQuote(symbol) {
  const raw = window[`v_${symbol}`];
  if (!raw) return null;
  const parts = raw.split("~");
  const current = toNumber(parts[3]);
  const prevClose = toNumber(parts[4]);
  const change = toNumber(parts[31]) ?? (current !== null && prevClose ? current - prevClose : null);
  const pct = toNumber(parts[32]) ?? (change !== null && prevClose ? (change / prevClose) * 100 : null);
  return {
    provider: "腾讯行情",
    symbol,
    name: parts[1] || findStockBySymbol(symbol)?.name || symbol,
    code: parts[2] || symbol.slice(2),
    open: toNumber(parts[5]),
    prevClose,
    price: current,
    high: toNumber(parts[33]),
    low: toNumber(parts[34]),
    volume: toNumber(parts[6]),
    amount: toNumber(parts[37]),
    change,
    pct,
    time: parts[30] || ""
  };
}

async function loadNews() {
  try {
    const articles = await fetchPortfolioNews();
    state.items = dedupeArticles(articles).sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    state.errors.push(friendlyError(error));
    state.items = [];
  }
}

async function fetchPortfolioNews() {
  const query = buildPortfolioNewsQuery();
  const directUrl = new URL(GDELT_ENDPOINT);
  directUrl.searchParams.set("query", query);
  directUrl.searchParams.set("mode", "ArtList");
  directUrl.searchParams.set("format", "json");
  directUrl.searchParams.set("maxrecords", "40");
  directUrl.searchParams.set("sort", "datedesc");
  directUrl.searchParams.set("timespan", `${state.rangeDays}d`);

  const data = await fetchNewsJson(query, directUrl.toString());
  const articles = Array.isArray(data.articles) ? data.articles : [];
  const cutoff = Date.now() - state.rangeDays * 24 * 60 * 60 * 1000;
  return articles
    .map((article) => {
      const directStock = state.stocks.find(
        (stock) => stock.code === String(article.stockCode || "")
      );
      const match = directStock
        ? { stock: directStock, score: relevanceScore(article, directStock) }
        : state.stocks
          .map((stock) => ({ stock, score: relevanceScore(article, stock) }))
          .sort((a, b) => b.score - a.score)[0];
      if (!match || match.score <= 0) return null;

      const language = String(article.language || "").toLowerCase();
      const fallbackBucket = article.sourceBucket
        || (language.includes("chinese") ? "domestic" : "global");
      const normalized = normalizeArticle(article, match.stock, fallbackBucket);
      return {
        ...normalized,
        signal: classifyArticle(normalized, match.stock)
      };
    })
    .filter((article) => article && article.title && article.url)
    .filter((article) => article.signal.scope !== "无关")
    .filter((article) => !article.timestamp || article.timestamp >= cutoff)
    .slice(0, 36);
}

async function fetchNewsJson(query, directUrl) {
  try {
    const staticUrl = new URL("./data/news.json", window.location.href);
    staticUrl.searchParams.set("v", String(Math.floor(Date.now() / 300000)));
    const response = await fetchWithTimeout(staticUrl.toString(), 8000);
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.articles) && data.articles.length) return data;
    }
  } catch (staticError) {
    // The scheduled data file may not exist before the first workflow run.
  }

  const proxyUrl = new URL("./api/news", window.location.href);
  proxyUrl.searchParams.set("query", query);
  proxyUrl.searchParams.set("timespan", `${state.rangeDays}d`);
  proxyUrl.searchParams.set("maxrecords", "40");

  try {
    const response = await fetchWithTimeout(proxyUrl.toString(), 9000);
    const contentType = response.headers.get("content-type") || "";
    if (response.ok && contentType.includes("application/json")) {
      return response.json();
    }
  } catch (proxyError) {
    // Static-only hosts do not have the proxy route, so fall through to the public API.
  }

  const response = await fetchWithTimeout(directUrl, 10000);
  if (!response.ok) throw new Error(`新闻接口 ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error((await response.text()).slice(0, 160));
  }
  return response.json();
}

function buildPortfolioNewsQuery() {
  const compactTerms = state.stocks
    .flatMap((stock) => [stock.name, ...(stock.globalTerms || []).slice(0, 1)])
    .map((term) => String(term || "").trim())
    .filter(Boolean);
  const expression = Array.from(new Set(compactTerms))
    .slice(0, 8)
    .map(quoteGdeltTerm)
    .join(" OR ");
  return `(${expression})`;
}

function quoteGdeltTerm(term) {
  const clean = term.replace(/["“”]/g, "").trim();
  return clean.includes(" ") ? `"${clean}"` : clean;
}

function normalizeArticle(article, stock, sourceBucket) {
  const url = article.url || article.url_mobile || "";
  const domain = article.domain || getHostname(url);
  const timestamp = parseGdeltDate(article.seendate || article.seenDate || article.date);
  const sourceCountry = article.sourcecountry || article.sourceCountry || "";
  const language = article.language || "";
  const hintedBucket = inferSourceBucket(domain, sourceCountry, sourceBucket);
  return {
    id: hashString(`${stock.id}-${url}-${article.title || ""}`),
    stockId: stock.id,
    stockName: stock.name,
    sourceBucket: hintedBucket,
    queryBucket: sourceBucket,
    title: article.title || "",
    url,
    domain,
    language,
    sourceCountry,
    aiNature: article.aiNature || "",
    aiConfidence: article.aiConfidence || "",
    aiScope: article.aiScope || "",
    aiReason: article.aiReason || "",
    aiImpact: article.aiImpact || "",
    aiSuggestion: article.aiSuggestion || "",
    aiModel: article.aiModel || "",
    aiAnalyzedAt: article.aiAnalyzedAt || "",
    timestamp,
    seenAt: timestamp ? new Date(timestamp) : null
  };
}

function inferSourceBucket(domain, sourceCountry, fallback) {
  const lowerDomain = String(domain || "").toLowerCase();
  const lowerCountry = String(sourceCountry || "").toLowerCase();
  if (lowerCountry.includes("china") || lowerCountry === "cn") return "domestic";
  if (lowerDomain.endsWith(".cn") || SOURCE_HINTS.domestic.some((hint) => lowerDomain.includes(hint))) return "domestic";
  if (SOURCE_HINTS.global.some((hint) => lowerDomain.includes(hint))) return "global";
  return fallback;
}

function relevanceScore(article, stock) {
  const text = normalizeText(`${article.title} ${article.domain}`);
  const strongTerms = [stock.name, stock.code, ...(stock.globalTerms || []).slice(0, 2)];
  const sectorTerms = [...(stock.domesticTerms || []), ...(stock.globalTerms || [])];
  let score = 0;
  strongTerms.forEach((term) => {
    if (term && text.includes(normalizeText(term))) score += 3;
  });
  sectorTerms.forEach((term) => {
    if (term && text.includes(normalizeText(term))) score += 1;
  });
  return score;
}

function classifyArticle(article, stock) {
  const aiSignal = buildAiSignal(article);
  if (aiSignal) return aiSignal;

  const text = normalizeText(`${article.title} ${article.domain}`);
  const stockRules = STOCK_RULES[stock.code] || { positive: [], negative: [] };
  const positives = collectRuleHits(text, [...COMMON_RULES.positive, ...stockRules.positive]);
  const negatives = collectRuleHits(text, [...COMMON_RULES.negative, ...stockRules.negative]);

  if (positives.length && negatives.length) {
    return {
      type: "mixed",
      label: signalText.mixed,
      source: "rules",
      terms: uniqueTerms([...positives, ...negatives]).slice(0, 5),
      reason: `同时命中利好和利空词：${formatReasons([...positives, ...negatives])}`
    };
  }
  if (positives.length) {
    return {
      type: "positive",
      label: signalText.positive,
      source: "rules",
      terms: uniqueTerms(positives).slice(0, 5),
      reason: `命中利好词：${formatReasons(positives)}`
    };
  }
  if (negatives.length) {
    return {
      type: "negative",
      label: signalText.negative,
      source: "rules",
      terms: uniqueTerms(negatives).slice(0, 5),
      reason: `命中利空词：${formatReasons(negatives)}`
    };
  }
  return {
    type: "pending",
    label: signalText.pending,
    source: "rules",
    terms: [],
    reason: "AI尚未完成逐条研判；关键词规则也未给出明确方向。"
  };
}

function buildAiSignal(article) {
  const nature = String(article.aiNature || "").trim();
  if (!nature) return null;
  const type = AI_NATURE_TYPES[nature] || "pending";
  const terms = [
    article.aiScope ? { term: article.aiScope, reason: "影响范围" } : null,
    article.aiConfidence ? { term: `置信度：${article.aiConfidence}`, reason: "模型置信度" } : null
  ].filter(Boolean);
  return {
    type,
    label: nature,
    source: "ai",
    terms,
    reason: article.aiReason || "模型未提供判断依据。",
    impact: article.aiImpact || "尚无清晰影响路径。",
    suggestion: article.aiSuggestion || "等待更多公开信息确认。",
    confidence: article.aiConfidence || "低",
    scope: article.aiScope || "待核验",
    model: article.aiModel || "GitHub Models"
  };
}

function collectRuleHits(text, rules) {
  return rules
    .filter(([term]) => text.includes(normalizeText(term)))
    .map(([term, reason]) => ({ term, reason }));
}

function uniqueTerms(hits) {
  const seen = new Set();
  return hits.filter((hit) => {
    const key = normalizeText(hit.term);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatReasons(hits) {
  return uniqueTerms(hits)
    .slice(0, 4)
    .map((hit) => `${hit.term}（${hit.reason}）`)
    .join("、");
}

function dedupeArticles(articles) {
  const seen = new Map();
  articles.forEach((article) => {
    const key = normalizeUrl(article.url) || normalizeText(article.title);
    if (!key) return;
    const existing = seen.get(key);
    if (!existing || article.timestamp > existing.timestamp) {
      seen.set(key, article);
    }
  });
  return Array.from(seen.values());
}

function renderAll() {
  renderStocks();
  renderQuotes();
  renderSummary();
  renderFeed();
  renderLastUpdated();
}

function renderStocks() {
  els.stockTabs.innerHTML = state.stocks.map((stock) => `
    <button class="stock-tab ${stock.id === state.activeStockId ? "is-active" : ""}" type="button" data-stock-id="${escapeHtml(stock.id)}">
      <strong>${escapeHtml(stock.name)}</strong>
      <span>${escapeHtml(stock.exchange.toUpperCase())}${escapeHtml(stock.code)} · ${escapeHtml(stock.sector || "自选")}</span>
    </button>
  `).join("");
}

function renderQuotes() {
  if (!state.stocks.length) {
    els.quoteStrip.innerHTML = "";
    return;
  }
  els.quoteStrip.innerHTML = state.stocks.map((stock) => {
    const quote = state.quotes.get(stock.symbol);
    const changeClass = quoteClass(quote?.pct);
    const price = quote?.price !== null && quote?.price !== undefined ? quote.price.toFixed(2) : "--";
    const change = quote?.pct !== null && quote?.pct !== undefined
      ? `${formatSigned(quote.change, 2)} / ${formatSigned(quote.pct, 2)}%`
      : "等待行情";
    const highLow = quote?.high && quote?.low ? `高 ${quote.high.toFixed(2)} · 低 ${quote.low.toFixed(2)}` : "高低价待更新";
    const provider = quote?.provider || "公开行情";
    const time = quote?.time || "未返回时间";
    return `
      <article class="quote-card">
        <div class="quote-head">
          <div>
            <div class="quote-name">${escapeHtml(stock.name)}</div>
            <div class="quote-code">${escapeHtml(stock.exchange.toUpperCase())}${escapeHtml(stock.code)}</div>
          </div>
          <span class="quote-change ${changeClass}">${escapeHtml(change)}</span>
        </div>
        <div class="quote-price">${escapeHtml(price)}</div>
        <div class="quote-foot">
          <span>${escapeHtml(highLow)}</span>
          <span>${escapeHtml(provider)}</span>
          <span>${escapeHtml(time)}</span>
        </div>
      </article>
    `;
  }).join("");
}

function renderSummary() {
  const active = getActiveStock();
  if (!active) {
    els.summaryGrid.innerHTML = "";
    return;
  }
  const scoped = state.items.filter((item) => item.stockId === active.id);
  const visible = filteredItems();
  const positive = scoped.filter((item) => item.signal.type === "positive").length;
  const negative = scoped.filter((item) => item.signal.type === "negative").length;
  const neutral = scoped.filter((item) => ["neutral", "mixed", "pending"].includes(item.signal.type)).length;
  const aiCount = scoped.filter((item) => item.signal.source === "ai").length;
  const latest = scoped[0]?.seenAt ? formatDateTime(scoped[0].seenAt) : "暂无";
  els.summaryGrid.innerHTML = `
    <article class="summary-card">
      <div class="summary-label">利好消息</div>
      <div class="summary-value">${positive}</div>
      <div class="summary-note">AI逐条研判 · 共 ${aiCount} 条</div>
    </article>
    <article class="summary-card">
      <div class="summary-label">利空消息</div>
      <div class="summary-value">${negative}</div>
      <div class="summary-note">区分基本面与交易信号</div>
    </article>
    <article class="summary-card">
      <div class="summary-label">当前筛选</div>
      <div class="summary-value">${visible.length}</div>
      <div class="summary-note">最新：${escapeHtml(latest)} · 中性/待确认 ${neutral}</div>
    </article>
  `;
}

function renderFeed() {
  const stock = getActiveStock();
  if (!stock) {
    els.feedList.innerHTML = "";
    return;
  }
  els.feedTitle.textContent = `${stock.name} 信息流`;
  els.feedMeta.textContent = `${stock.exchange.toUpperCase()}${stock.code} · ${state.rangeDays === 1 ? "24小时" : `${state.rangeDays}天`}`;
  els.officialLink.href = stock.officialUrl || "https://www.sse.com.cn/disclosure/listedinfo/announcement/";

  const items = filteredItems();
  renderStatus();

  if (!items.length) {
    const message = state.loading
      ? "正在读取公开来源。"
      : "当前筛选下没有可展示的信息，或公开接口暂未返回相关结果。";
    els.feedList.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
    return;
  }

  els.feedList.innerHTML = items.map((item) => `
    <article class="feed-item">
      <div class="feed-topline">
        <a class="feed-title" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a>
        <span class="signal-pill ${escapeHtml(item.signal.type)}">${escapeHtml(item.signal.label)}</span>
      </div>
      <div class="item-meta">
        <span>${item.sourceBucket === "domestic" ? "国内" : "国外"}</span>
        <span>${escapeHtml(item.domain || "来源未知")}</span>
        <span>${item.seenAt ? escapeHtml(formatDateTime(item.seenAt)) : "时间未知"}</span>
      </div>
      ${renderAnalysis(item.signal)}
      ${renderTags(item.signal.terms)}
    </article>
  `).join("");
}

function renderAnalysis(signal) {
  if (signal.source !== "ai") {
    return `
      <div class="analysis-source">规则后备标签</div>
      <p class="reason">${escapeHtml(signal.reason)}</p>
    `;
  }
  return `
    <dl class="analysis-detail">
      <div>
        <dt>判断依据</dt>
        <dd>${escapeHtml(signal.reason)}</dd>
      </div>
      <div>
        <dt>影响路径</dt>
        <dd>${escapeHtml(signal.impact)}</dd>
      </div>
      <div>
        <dt>观察建议</dt>
        <dd>${escapeHtml(signal.suggestion)}</dd>
      </div>
    </dl>
  `;
}

function renderTags(terms) {
  if (!terms.length) return "";
  return `<div class="tags">${terms.map((hit) => `<span class="tag">${escapeHtml(hit.term)}</span>`).join("")}</div>`;
}

function renderStatus(forcedText = "") {
  if (forcedText) {
    els.statusLine.textContent = forcedText;
    return;
  }
  if (state.loading) {
    els.statusLine.textContent = "正在更新公开来源...";
    return;
  }
  if (state.errors.length) {
    els.statusLine.textContent = `部分来源未返回：${Array.from(new Set(state.errors)).slice(0, 2).join("；")}`;
    return;
  }
  const total = state.items.filter((item) => item.stockId === state.activeStockId).length;
  els.statusLine.textContent = total ? `已读取 ${total} 条，按发布时间倒序。` : "暂无接口返回。";
}

function renderLastUpdated() {
  els.lastUpdated.textContent = state.lastUpdated
    ? `更新于 ${formatDateTime(state.lastUpdated)}`
    : "等待更新";
}

function filteredItems() {
  return state.items.filter((item) => {
    if (item.stockId !== state.activeStockId) return false;
    if (state.sourceFilter !== "all" && item.sourceBucket !== state.sourceFilter) return false;
    if (state.signalFilter === "all") return true;
    if (state.signalFilter === "neutral") return ["neutral", "mixed", "pending"].includes(item.signal.type);
    return item.signal.type === state.signalFilter;
  });
}

function renderWatchlistEditor() {
  els.watchlistEditor.innerHTML = state.stocks.map((stock) => `
    <div class="watch-row">
      <div>
        <strong>${escapeHtml(stock.name)}</strong>
        <span>${escapeHtml(stock.exchange.toUpperCase())}${escapeHtml(stock.code)}</span>
      </div>
      <button class="small-danger" type="button" data-remove-stock="${escapeHtml(stock.id)}">移除</button>
    </div>
  `).join("");
}

function addStockFromForm() {
  const name = els.newName.value.trim();
  const code = els.newCode.value.trim();
  const exchange = els.newExchange.value;
  if (!name || !/^\d{6}$/.test(code)) {
    window.alert("请填写股票名称和6位股票代码。");
    return;
  }
  const stock = normalizeStock({
    id: `${exchange}-${code}-${Date.now()}`,
    name,
    code,
    exchange,
    domesticTerms: [name, code],
    globalTerms: [name, code],
    officialUrl: code.startsWith("6")
      ? `https://www.sse.com.cn/assortment/stock/list/info/company/index.shtml?COMPANY_CODE=${code}`
      : "https://www.szse.cn/disclosure/listed/notice/index.html",
    sector: "自选"
  });
  state.stocks.push(stock);
  state.activeStockId = stock.id;
  saveStocks();
  els.newName.value = "";
  els.newCode.value = "";
  renderWatchlistEditor();
  renderAll();
  refreshAll();
}

function removeStock(id) {
  if (state.stocks.length <= 1) {
    window.alert("关注列表至少保留一只股票。");
    return;
  }
  state.stocks = state.stocks.filter((stock) => stock.id !== id);
  if (!state.stocks.some((stock) => stock.id === state.activeStockId)) {
    state.activeStockId = state.stocks[0].id;
  }
  saveStocks();
  renderWatchlistEditor();
  renderAll();
  refreshAll();
}

function updateSegmented(container, dataName, value) {
  container.querySelectorAll(`[data-${dataName}]`).forEach((button) => {
    button.classList.toggle("is-active", button.dataset[dataName] === value);
  });
}

function loadStocks() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (Array.isArray(stored) && stored.length) return stored.map(normalizeStock);
  } catch (error) {
    console.warn("watchlist restore failed", error);
  }
  return cloneStocks(DEFAULT_STOCKS);
}

function saveStocks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.stocks));
}

function cloneStocks(stocks) {
  return stocks.map((stock) => normalizeStock(JSON.parse(JSON.stringify(stock))));
}

function normalizeStock(stock) {
  const exchange = stock.exchange || (String(stock.code).startsWith("6") ? "sh" : "sz");
  const symbol = `${exchange}${stock.code}`;
  return {
    ...stock,
    id: stock.id || symbol,
    exchange,
    symbol,
    domesticTerms: stock.domesticTerms?.length ? stock.domesticTerms : [stock.name, stock.code],
    globalTerms: stock.globalTerms?.length ? stock.globalTerms : [stock.name, stock.code],
    officialUrl: stock.officialUrl || "https://www.sse.com.cn/disclosure/listedinfo/announcement/",
    sector: stock.sector || "自选"
  };
}

function hydrateCache() {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (!cache) return;
    state.items = Array.isArray(cache.items)
      ? cache.items.map((item) => ({ ...item, seenAt: item.seenAt ? new Date(item.seenAt) : null }))
      : [];
    state.lastUpdated = cache.lastUpdated ? new Date(cache.lastUpdated) : null;
    if (Array.isArray(cache.quotes)) {
      cache.quotes.forEach(([symbol, quote]) => state.quotes.set(symbol, quote));
    }
  } catch (error) {
    console.warn("cache restore failed", error);
  }
}

function persistCache() {
  const cache = {
    items: state.items,
    lastUpdated: state.lastUpdated?.toISOString() || null,
    quotes: Array.from(state.quotes.entries())
  };
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

function getActiveStock() {
  return state.stocks.find((stock) => stock.id === state.activeStockId) || state.stocks[0] || null;
}

function findStockBySymbol(symbol) {
  return state.stocks.find((stock) => stock.symbol === symbol);
}

function loadScript(src, charset = "utf-8", timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    let done = false;
    const timer = window.setTimeout(() => {
      if (done) return;
      done = true;
      script.remove();
      reject(new Error("行情脚本超时"));
    }, timeoutMs);

    script.src = `${src}${src.includes("?") ? "&" : "?"}_=${Date.now()}`;
    script.charset = charset;
    script.onload = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      script.remove();
      resolve();
    };
    script.onerror = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      script.remove();
      reject(new Error("行情脚本加载失败"));
    };
    document.head.appendChild(script);
  });
}

function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal })
    .catch((error) => {
      if (controller.signal.aborted) throw new Error("请求超时");
      throw error;
    })
    .finally(() => window.clearTimeout(timer));
}

function quoteClass(pct) {
  if (pct > 0) return "positive";
  if (pct < 0) return "negative";
  return "neutral";
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatSigned(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "--";
  const number = Number(value);
  return `${number > 0 ? "+" : ""}${number.toFixed(digits)}`;
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function parseGdeltDate(value) {
  if (!value) return 0;
  const text = String(value);
  if (/^\d{14}$/.test(text)) {
    const year = text.slice(0, 4);
    const month = text.slice(4, 6);
    const day = text.slice(6, 8);
    const hour = text.slice(8, 10);
    const minute = text.slice(10, 12);
    const second = text.slice(12, 14);
    return Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`) || 0;
  }
  if (/^\d{8}T\d{6}Z$/.test(text)) {
    return Date.parse(`${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T${text.slice(9, 11)}:${text.slice(11, 13)}:${text.slice(13, 15)}Z`) || 0;
  }
  return Date.parse(text) || 0;
}

function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (error) {
    return "";
  }
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((key) => parsed.searchParams.delete(key));
    return parsed.toString();
  } catch (error) {
    return url || "";
  }
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return `item-${Math.abs(hash)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("service worker registration failed", error);
    });
  });
}

function friendlyError(error) {
  const message = String(error?.message || error || "接口异常");
  if (message.includes("Failed to fetch")) return "外部接口暂不可达";
  if (message.includes("signal is aborted") || message.includes("aborted") || message.includes("timeout")) return "请求超时";
  if (message.includes("NetworkError")) return "网络请求失败";
  return message;
}
