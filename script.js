/**
 * Conversor de Moedas - Portfólio
 * API: Frankfurter (sem API key).
 * Docs: https://frankfurter.dev / API pública: https://api.frankfurter.dev
 */

const API_BASE = "https://api.frankfurter.dev/v1";

const STORAGE_KEY = "currency_converter_v1";
const CACHE_KEY = "currency_rates_cache_v1";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

// DOM
const amountEl = document.getElementById("amount");
const fromEl = document.getElementById("from");
const toEl = document.getElementById("to");
const convertBtn = document.getElementById("convert");
const refreshBtn = document.getElementById("refresh");
const swapBtn = document.getElementById("swap");
const resultText = document.getElementById("resultText");
const rateText = document.getElementById("rateText");
const badge = document.getElementById("badge");
const updatedEl = document.getElementById("updated");
const errorEl = document.getElementById("error");

// Currencies (pode expandir, mas já cobre as mais usadas no BR)
const POPULAR = ["BRL", "USD", "EUR", "GBP", "JPY", "ARS", "CLP", "MXN", "CAD", "AUD", "CHF", "CNY"];

// State
let ratesBase = "EUR"; // Frankfurter usa EUR como base em muitos endpoints
let latestRates = null; // { date, base, rates: { USD: 1.0, ... } }

function formatMoney(value, currency) {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
  } catch {
    // fallback se currency inválida
    return value.toFixed(2) + " " + currency;
  }
}

function showStatus(text, kind = "ready") {
  badge.textContent = text;
  badge.style.borderColor =
    kind === "ok" ? "rgba(51,209,122,.45)" :
    kind === "bad" ? "rgba(255,77,77,.35)" :
    "rgba(255,255,255,.12)";
  badge.style.background =
    kind === "ok" ? "rgba(51,209,122,.12)" :
    kind === "bad" ? "rgba(255,77,77,.12)" :
    "rgba(0,0,0,.18)";
}

function showError(msg) {
  errorEl.hidden = false;
  errorEl.textContent = msg;
  showStatus("Erro", "bad");
}

function clearError() {
  errorEl.hidden = true;
  errorEl.textContent = "";
}

function savePrefs() {
  const data = {
    amount: amountEl.value,
    from: fromEl.value,
    to: toEl.value
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.amount != null) amountEl.value = data.amount;
    if (data.from) fromEl.value = data.from;
    if (data.to) toEl.value = data.to;
  } catch {}
}

function setUpdated(dateStr, source = "API") {
  const now = new Date();
  const date = dateStr ? new Date(dateStr) : null;
  const label = date ? `Cotação (${source}) • data: ${date.toLocaleDateString("pt-BR")}` : `Atualizado • ${now.toLocaleString("pt-BR")}`;
  updatedEl.textContent = label;
}

function cacheSave(payload) {
  const data = { savedAt: Date.now(), payload };
  localStorage.setItem(CACHE_KEY, JSON.stringify(data));
}

function cacheLoad() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.savedAt || !data?.payload) return null;
    const age = Date.now() - data.savedAt;
    if (age > CACHE_TTL_MS) return null;
    return data.payload;
  } catch {
    return null;
  }
}

async function fetchLatestRates() {
  // Endpoint: /latest (retorna base, date e rates)
  const res = await fetch(`${API_BASE}/latest`);
  if (!res.ok) throw new Error("Falha ao buscar cotações.");
  return res.json();
}

function buildCurrencyOptions(codes) {
  fromEl.innerHTML = "";
  toEl.innerHTML = "";

  codes.forEach(code => {
    const opt1 = document.createElement("option");
    opt1.value = code;
    opt1.textContent = code;
    fromEl.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = code;
    opt2.textContent = code;
    toEl.appendChild(opt2);
  });
}

function getAllCodesFromRates(payload) {
  const codes = new Set(Object.keys(payload.rates || {}));
  if (payload.base) codes.add(payload.base);
  return Array.from(codes).sort();
}

function ensurePopularFirst(allCodes) {
  const popular = POPULAR.filter(c => allCodes.includes(c));
  const rest = allCodes.filter(c => !POPULAR.includes(c));
  return [...popular, ...rest];
}

function convertWithRates(amount, from, to, payload) {
  const { base, rates } = payload;

  if (!Number.isFinite(amount) || amount < 0) return null;
  if (from === to) return amount;

  // Se for a moeda base
  if (from === base) {
    const rateTo = rates[to];
    if (!rateTo) return null;
    return amount * rateTo;
  }

  // Se converter PARA a base
  if (to === base) {
    const rateFrom = rates[from];
    if (!rateFrom) return null;
    return amount / rateFrom;
  }

  // Cross via base: from -> base -> to
  const rateFrom = rates[from];
  const rateTo = rates[to];
  if (!rateFrom || !rateTo) return null;

  const inBase = amount / rateFrom;
  return inBase * rateTo;
}

function renderResult() {
  clearError();

  if (!latestRates) {
    resultText.textContent = "—";
    rateText.textContent = "—";
    return;
  }

  const amount = Number(amountEl.value);
  const from = fromEl.value;
  const to = toEl.value;

  if (!amountEl.value.trim()) {
    resultText.textContent = "Digite um valor";
    rateText.textContent = "—";
    return;
  }

  const converted = convertWithRates(amount, from, to, latestRates);
  if (converted == null) {
    showError("Não foi possível converter. Verifique moedas e conexão.");
    return;
  }

  resultText.textContent = `${formatMoney(amount, from)} → ${formatMoney(converted, to)}`;

  // mostrar taxa aproximada: 1 from = x to
  const one = convertWithRates(1, from, to, latestRates);
  if (one != null) {
    rateText.textContent = `Taxa: 1 ${from} ≈ ${one.toFixed(6)} ${to} • Base: ${latestRates.base}`;
  } else {
    rateText.textContent = `Base: ${latestRates.base}`;
  }

  showStatus("OK", "ok");
  savePrefs();
}

async function init({ forceRefresh = false } = {}) {
  showStatus("Carregando…");
  clearError();

  try {
    let payload = !forceRefresh ? cacheLoad() : null;

    if (!payload) {
      payload = await fetchLatestRates();
      cacheSave(payload);
      setUpdated(payload.date, "API");
    } else {
      setUpdated(payload.date, "cache");
    }

    latestRates = payload;
    ratesBase = payload.base || "EUR";

    const allCodes = getAllCodesFromRates(payload);
    const ordered = ensurePopularFirst(allCodes);
    buildCurrencyOptions(ordered);

    // defaults bons pra BR
    fromEl.value = ordered.includes("BRL") ? "BRL" : ratesBase;
    toEl.value = ordered.includes("USD") ? "USD" : ratesBase;

    loadPrefs();
    renderResult();
    showStatus("Pronto");
  } catch (e) {
    latestRates = null;
    showError("Não consegui carregar as cotações agora. Tenta novamente em 'Atualizar cotação'.");
  }
}

// Events
convertBtn.addEventListener("click", renderResult);
refreshBtn.addEventListener("click", () => init({ forceRefresh: true }));

swapBtn.addEventListener("click", () => {
  const a = fromEl.value;
  fromEl.value = toEl.value;
  toEl.value = a;
  renderResult();
});

amountEl.addEventListener("input", () => {
  // converte em tempo real
  renderResult();
});

fromEl.addEventListener("change", renderResult);
toEl.addEventListener("change", renderResult);

// Start
init();
