const BudgetStore = (() => {
  const STORAGE_KEY = "faith-budget-app-v2";
  const SHEET_URL_KEY = "faith-budget-sheet-url";
  const CLOUD_SYNCED_AT_KEY = "faith-budget-cloud-synced-at";
  const WISH_STORAGE_KEY = "faith-budget-wishes-v1";
  const DEBT_STORAGE_KEY = "faith-budget-debt-plans-v1";
  const DEFAULT_SHEET_URL = "https://script.google.com/macros/s/AKfycbycvhYGy4NH9V0WlRVXuadXB2FGhXzuBGa-ZPsm-TTGstkWYMh_XJfMCm1Y0M6Gl043/exec";
  let suppressCloudSync = false;
  let cloudSyncTimer = null;
  let cloudReady = false;
  let pendingCloudSnapshot = false;

  const categories = [
    {
      id: "obligation",
      name: "의무사항",
    },
    {
      id: "need",
      name: "필요사항",
    },
    {
      id: "sow",
      name: "심고거둠",
    },
    {
      id: "wish",
      name: "요망사항",
    },
  ];

  const defaultItems = {
    obligation: ["십일조", "공과금", "월세", "회비", "빚갚기", "마중물", "핸드폰요금"],
    need: ["생활비", "용돈", "데이트비용", "교통비", "저축", "감사헌금", "구독료", "경조사예비비"],
    sow: ["3.3% 십일조"],
    wish: [""],
  };

  function getCurrentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  function getToday() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function makeId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function numberValue(value) {
    return Math.max(0, Number(value || 0));
  }

  function formatWon(value) {
    return `${Number(value || 0).toLocaleString("ko-KR")}원`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function loadAllMonths() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveAllMonths(allMonths) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allMonths));
    queueCloudSnapshot();
  }

  function loadWishes() {
    try {
      return JSON.parse(localStorage.getItem(WISH_STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveWishes(wishes) {
    localStorage.setItem(WISH_STORAGE_KEY, JSON.stringify(wishes));
    queueCloudSnapshot();
  }

  function loadDebtPlans() {
    try {
      return JSON.parse(localStorage.getItem(DEBT_STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveDebtPlans(plans) {
    localStorage.setItem(DEBT_STORAGE_KEY, JSON.stringify(plans));
    syncDebtPlansToStoredMonths();
    queueCloudSnapshot();
  }

  function setDebtRequiredPaid(planId, month, paid, requiredAmount) {
    const plans = loadDebtPlans();
    const plan = plans.find((item) => item.id === planId);
    if (!plan) return;
    plan.records = plan.records || {};
    plan.records[month] = plan.records[month] || { requiredPaid: false, requiredAmount: plan.requiredMonthly || 0, amount: 0 };
    plan.records[month].requiredPaid = Boolean(paid);
    if (requiredAmount !== undefined) {
      plan.records[month].requiredAmount = numberValue(requiredAmount);
    }
    localStorage.setItem(DEBT_STORAGE_KEY, JSON.stringify(plans));
    queueCloudSnapshot();
  }

  function getPreviousMonth(month) {
    const [year, monthNumber] = month.split("-").map(Number);
    const date = new Date(year, monthNumber - 2, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function moveDateToMonth(date, month) {
    const day = Math.min(Number(String(date || "").slice(8, 10)) || 1, new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate());
    return `${month}-${String(day).padStart(2, "0")}`;
  }

  function createMonthData(month = getCurrentMonth(), previousData = null) {
    if (previousData) return cloneMonthData(month, previousData);

    const data = {
      carryover: 0,
      income: 0,
      titheExtraRate: 5,
      closed: false,
      items: Object.fromEntries(
        categories.map((category) => [
          category.id,
          defaultItems[category.id].map((name) => ({ id: makeId(), name, budget: 0 })),
        ]),
      ),
      expenses: [],
      incomes: [],
      heaven: [],
    };
    syncTitheItems(data);
    return data;
  }

  function cloneMonthData(month, previousData) {
    const totals = getTotals(previousData);
    const data = {
      carryover: Math.max(0, totals.remaining),
      income: 0,
      titheExtraRate: previousData.titheExtraRate === undefined ? 5 : numberValue(previousData.titheExtraRate),
      closed: false,
      items: Object.fromEntries(
        categories.map((category) => [
          category.id,
          (previousData.items?.[category.id] || []).map((item) => ({
            ...item,
            id: makeId(),
          })),
        ]),
      ),
      expenses: (previousData.expenses || []).map((expense) => ({
        ...expense,
        id: makeId(),
        date: moveDateToMonth(expense.date, month),
        autoDebtMonth: expense.autoDebtMonth ? month : expense.autoDebtMonth,
      })),
      incomes: [],
      heaven: [],
    };
    syncTitheItems(data);
    return data;
  }

  function loadMonth(month) {
    const allMonths = loadAllMonths();
    const data = allMonths[month] || createMonthData(month);
    data.expenses = data.expenses || [];
    data.incomes = data.incomes || [];
    data.heaven = data.heaven || [];
    data.closed = Boolean(data.closed);
    syncTitheItems(data);
    syncWishItems(data);
    syncDebtItemsAndExpenses(month, data);
    allMonths[month] = data;
    saveAllMonths(allMonths);
    return data;
  }

  function copyPreviousMonthInto(month) {
    return copyMonthInto(getPreviousMonth(month), month);
  }

  function copyMonthInto(sourceMonth, targetMonth) {
    const allMonths = loadAllMonths();
    const sourceData = allMonths[sourceMonth];
    if (!sourceData) return null;
    const data = cloneMonthData(targetMonth, sourceData);
    allMonths[targetMonth] = data;
    saveAllMonths(allMonths);
    return data;
  }

  function syncTitheItems(data) {
    data.items = data.items || {};
    data.items.obligation = data.items.obligation || [];
    data.items.sow = data.items.sow || [];
    data.titheExtraRate = data.titheExtraRate === undefined ? 5 : numberValue(data.titheExtraRate);

    data.items.obligation = data.items.obligation.filter((item) => item.autoTitheType !== "extra" && item.name !== "3.3% 십일조");

    const titheItem = upsertAutoBudgetItem(
      data.items.obligation,
      (item) => item.autoTitheType === "tithe" || item.name === "십일조",
      {
        autoTitheType: "tithe",
        name: "십일조",
      },
    );
    const taxItem = upsertAutoBudgetItem(
      data.items.obligation,
      (item) => item.autoTitheType === "incomeTax" || item.name === "세금(3.3%)",
      {
        autoTitheType: "incomeTax",
        name: "세금(3.3%)",
      },
    );
    const extraItem = upsertAutoBudgetItem(
      data.items.sow,
      (item) => item.autoTitheType === "extra" || item.name === "3.3% 십일조",
      {
        autoTitheType: "extra",
        name: "3.3% 십일조",
      },
    );

    const remainingBudget = categories.reduce(
      (sum, category) =>
        sum +
        (data.items[category.id] || [])
          .filter((item) => !item.autoTitheType)
          .reduce((itemSum, item) => itemSum + numberValue(item.budget), 0),
      0,
    );
    const titheRate = 10;
    const taxRate = 3.3;
    const extraRate = numberValue(data.titheExtraRate);
    const remainingRate = Math.max(0, 100 - titheRate - taxRate - extraRate);
    const totalBudget = remainingRate > 0 ? remainingBudget / (remainingRate / 100) : remainingBudget;

    titheItem.budget = Math.round(totalBudget * (titheRate / 100));
    taxItem.budget = Math.round(totalBudget * (taxRate / 100));
    extraItem.budget = Math.round(totalBudget * (extraRate / 100));
  }

  function syncWishItems(data) {
    data.items = data.items || {};
    data.items.wish = data.items.wish || [];
    const wishes = loadWishes().filter((wish) => !wish.fulfilledDate);
    const activeWishIds = new Set(wishes.map((wish) => wish.id));

    data.items.wish = data.items.wish.filter((item) => !item.wishId || activeWishIds.has(item.wishId));

    wishes.forEach((wish) => {
      const existing = data.items.wish.find((item) => item.wishId === wish.id || item.name === wish.name);
      if (existing) {
        existing.wishId = wish.id;
        existing.name = wish.name;
        return;
      }

      data.items.wish.push({
        id: makeId(),
        wishId: wish.id,
        name: wish.name,
        budget: 0,
      });
    });
  }

  function addWishDepositFromExpense(expense) {
    if (expense.category !== "wish" || !expense.itemName) return;
    const wishes = loadWishes();
    const wish = wishes.find((item) => !item.fulfilledDate && item.name === expense.itemName);
    if (!wish) return;

    wish.deposits = wish.deposits || [];
    const existing = wish.deposits.find((deposit) => deposit.sourceExpenseId === expense.id);
    if (existing) {
      existing.date = expense.date;
      existing.amount = numberValue(expense.amount);
      existing.memo = expense.memo || "지출 기록에서 자동 추가";
    } else {
      wish.deposits.push({
        id: makeId(),
        date: expense.date,
        amount: numberValue(expense.amount),
        memo: expense.memo || "지출 기록에서 자동 추가",
        sourceExpenseId: expense.id,
      });
    }

    saveWishes(wishes);
  }

  function removeWishDepositFromExpense(expenseId) {
    const wishes = loadWishes();
    let changed = false;
    wishes.forEach((wish) => {
      const before = (wish.deposits || []).length;
      wish.deposits = (wish.deposits || []).filter((deposit) => deposit.sourceExpenseId !== expenseId);
      if (wish.deposits.length !== before) changed = true;
    });

    if (changed) saveWishes(wishes);
  }

  function getDebtCategory(plan) {
    return plan.kind === "debt" ? "obligation" : "need";
  }

  function getDebtRecord(plan, month) {
    const records = plan.records || {};
    return records[month] || { requiredPaid: false, requiredAmount: plan.requiredMonthly || 0, amount: 0 };
  }

  function getDebtItemName(plan) {
    const prefix = plan.kind === "debt" ? "[빚갚기]" : "[저축]";
    const fallback = plan.kind === "debt" ? "빚갚기" : "저축";
    return `${prefix} ${plan.name || fallback}`;
  }

  function getDebtPaidTotalBefore(plan, month) {
    return Object.entries(plan.records || {})
      .filter(([recordMonth]) => recordMonth < month)
      .reduce((sum, [, record]) => sum + numberValue(record.amount), 0);
  }

  function isDebtClosedBeforeMonth(plan, month) {
    return numberValue(plan.total) > 0 && getDebtPaidTotalBefore(plan, month) >= numberValue(plan.total);
  }

  function upsertAutoBudgetItem(items, match, values) {
    const existing = items.find(match);
    if (existing) {
      Object.assign(existing, values);
      return existing;
    }

    const item = { id: makeId(), ...values };
    items.push(item);
    return item;
  }

  function syncDebtItemsAndExpenses(month, data) {
    data.items = data.items || {};
    data.expenses = data.expenses || [];
    categories.forEach((category) => {
      data.items[category.id] = data.items[category.id] || [];
    });

    const plans = loadDebtPlans();
    const activePlanIds = new Set(plans.map((plan) => plan.id));
    const existingAutoBudgets = new Map();

    categories.forEach((category) => {
      data.items[category.id].forEach((item) => {
        if (item.autoDebtPlanId && item.autoDebtType) {
          existingAutoBudgets.set(`${item.autoDebtPlanId}:${item.autoDebtType}`, numberValue(item.budget));
        }
      });
    });

    categories.forEach((category) => {
      data.items[category.id] = data.items[category.id].filter((item) => !item.autoDebtPlanId);
    });
    data.expenses = data.expenses.filter((expense) => !expense.autoDebtPlanId || activePlanIds.has(expense.autoDebtPlanId));

    plans.forEach((plan) => {
      if (isDebtClosedBeforeMonth(plan, month)) {
        data.expenses = data.expenses.filter((expense) => !(expense.autoDebtPlanId === plan.id && expense.autoDebtMonth === month));
        return;
      }

      const category = getDebtCategory(plan);
      const record = getDebtRecord(plan, month);
      const itemName = getDebtItemName(plan);
      const amount = numberValue(record.amount);
      const interestName = `${itemName} 이자`;
      const interestBudget = existingAutoBudgets.has(`${plan.id}:interest`) ? existingAutoBudgets.get(`${plan.id}:interest`) : numberValue(plan.requiredMonthly);

      upsertAutoBudgetItem(
        data.items[category],
        (item) => item.autoDebtPlanId === plan.id && item.autoDebtType === "principal",
        {
          autoDebtPlanId: plan.id,
          autoDebtType: "principal",
          name: itemName,
          budget: existingAutoBudgets.has(`${plan.id}:principal`) ? existingAutoBudgets.get(`${plan.id}:principal`) : amount,
          isSaving: plan.kind === "saving",
        },
      );

      if (numberValue(plan.requiredMonthly) > 0) {
        upsertAutoBudgetItem(
          data.items[category],
          (item) => item.autoDebtPlanId === plan.id && item.autoDebtType === "interest",
          {
            autoDebtPlanId: plan.id,
            autoDebtType: "interest",
            name: interestName,
            budget: interestBudget,
          },
        );
      } else {
        data.items[category] = data.items[category].filter((item) => !(item.autoDebtPlanId === plan.id && item.autoDebtType === "interest"));
      }

      const existingExpense = data.expenses.find(
        (expense) => expense.autoDebtPlanId === plan.id && expense.autoDebtMonth === month && (expense.autoDebtType || "principal") === "principal",
      );
      if (amount > 0) {
        const values = {
          id: existingExpense?.id || makeId(),
          date: `${month}-01`,
          category,
          itemName,
          amount,
          memo: plan.kind === "debt" ? "빚갚기에서 자동 반영" : "저축에서 자동 반영",
          autoDebtPlanId: plan.id,
          autoDebtType: "principal",
          autoDebtMonth: month,
        };

        if (existingExpense) {
          Object.assign(existingExpense, values);
        } else {
          data.expenses.push(values);
        }
      } else if (existingExpense) {
        data.expenses = data.expenses.filter((expense) => expense !== existingExpense);
      }

      const existingInterestExpense = data.expenses.find(
        (expense) => expense.autoDebtPlanId === plan.id && expense.autoDebtMonth === month && expense.autoDebtType === "interest",
      );
      if (numberValue(plan.requiredMonthly) > 0 && record.requiredPaid && interestBudget > 0) {
        const values = {
          id: existingInterestExpense?.id || makeId(),
          date: `${month}-01`,
          category,
          itemName: interestName,
          amount: interestBudget,
          memo: "이자 체크에서 자동 반영",
          autoDebtPlanId: plan.id,
          autoDebtType: "interest",
          autoDebtMonth: month,
        };

        if (existingInterestExpense) {
          Object.assign(existingInterestExpense, values);
        } else {
          data.expenses.push(values);
        }
      } else if (existingInterestExpense) {
        data.expenses = data.expenses.filter((expense) => expense !== existingInterestExpense);
      }
    });
  }

  function syncDebtPlansToStoredMonths() {
    const allMonths = loadAllMonths();
    Object.entries(allMonths).forEach(([month, data]) => {
      syncDebtItemsAndExpenses(month, data);
      allMonths[month] = data;
    });
    saveAllMonths(allMonths);
  }

  function saveMonth(month, data) {
    syncTitheItems(data);
    const allMonths = loadAllMonths();
    allMonths[month] = data;
    saveAllMonths(allMonths);
  }

  function getCategoryTotal(data, categoryId) {
    return (data.items[categoryId] || []).reduce((sum, item) => sum + numberValue(item.budget), 0);
  }

  function getItemSpent(data, categoryId, itemName) {
    return data.expenses
      .filter((expense) => expense.category === categoryId && expense.itemName === itemName)
      .reduce((sum, expense) => sum + numberValue(expense.amount), 0);
  }

  function getCategorySpent(data, categoryId) {
    return data.expenses
      .filter((expense) => expense.category === categoryId)
      .reduce((sum, expense) => sum + numberValue(expense.amount), 0);
  }

  function getTotals(data) {
    const totalBudget = categories.reduce((sum, category) => sum + getCategoryTotal(data, category.id), 0);
    const totalSpent = data.expenses.reduce((sum, expense) => sum + numberValue(expense.amount), 0);
    const mobileIncome = (data.incomes || []).reduce((sum, income) => sum + numberValue(income.amount), 0);
    const totalIncome = numberValue(data.carryover) + mobileIncome;
    return {
      totalBudget,
      totalSpent,
      totalIncome,
      remaining: totalBudget - totalSpent,
    };
  }

  function getSheetUrl() {
    return DEFAULT_SHEET_URL;
  }

  function setSheetUrl(url) {
    localStorage.setItem(SHEET_URL_KEY, url);
  }

  function postToSheet(payload) {
    const sheetUrl = getSheetUrl();
    if (!sheetUrl) return Promise.resolve(false);

    return fetch(sheetUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    }).then(() => true);
  }

  function getCloudSnapshot() {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      months: loadAllMonths(),
      wishes: loadWishes(),
      debts: loadDebtPlans(),
    };
  }

  function snapshotHasData(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return false;
    const months = snapshot.months || {};
    const hasMonthData = Object.values(months).some((month) => {
      if (!month || typeof month !== "object") return false;
      const hasExpenses = (month.expenses || []).length > 0;
      const hasIncomes = (month.incomes || []).length > 0;
      const hasHeaven = (month.heaven || []).length > 0;
      const hasBudget = Object.values(month.items || {}).some((items) =>
        (items || []).some((item) => item.name || numberValue(item.budget) > 0),
      );
      return hasExpenses || hasIncomes || hasHeaven || hasBudget || numberValue(month.carryover) > 0;
    });
    return hasMonthData || (snapshot.wishes || []).length > 0 || (snapshot.debts || []).length > 0;
  }

  function saveCloudSnapshot() {
    if (suppressCloudSync) return Promise.resolve(false);
    if (!cloudReady) {
      pendingCloudSnapshot = true;
      return Promise.resolve(false);
    }
    const snapshot = getCloudSnapshot();
    if (!snapshotHasData(snapshot)) return Promise.resolve(false);
    pendingCloudSnapshot = false;
    return postToSheet({
      type: "snapshot",
      snapshot,
    })
      .then((synced) => {
        if (synced) localStorage.setItem(CLOUD_SYNCED_AT_KEY, String(Date.now()));
        return synced;
      })
      .catch(() => false);
  }

  function queueCloudSnapshot() {
    if (suppressCloudSync) return;
    if (!cloudReady) {
      pendingCloudSnapshot = true;
      return;
    }
    window.clearTimeout(cloudSyncTimer);
    cloudSyncTimer = window.setTimeout(saveCloudSnapshot, 450);
  }

  function loadCloudSnapshot() {
    const sheetUrl = getSheetUrl();
    if (!sheetUrl) return Promise.resolve(null);

    return new Promise((resolve, reject) => {
      const callbackName = `faithBudgetSnapshot_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const script = document.createElement("script");
      const separator = sheetUrl.includes("?") ? "&" : "?";

      window[callbackName] = (payload) => {
        cleanup();
        resolve(payload);
      };

      function cleanup() {
        delete window[callbackName];
        script.remove();
      }

      script.onerror = () => {
        cleanup();
        reject(new Error("Budget snapshot load failed"));
      };

      script.src = `${sheetUrl}${separator}type=snapshot&callback=${encodeURIComponent(callbackName)}`;
      document.body.appendChild(script);
    });
  }

  function applyCloudSnapshot(payload) {
    const snapshot = payload && Object.prototype.hasOwnProperty.call(payload, "snapshot") ? payload.snapshot : payload;
    if (!snapshot || typeof snapshot !== "object") return false;
    if (!Object.prototype.hasOwnProperty.call(snapshot, "months")) return false;
    if (!snapshotHasData(snapshot) && snapshotHasData(getCloudSnapshot())) return false;

    suppressCloudSync = true;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot.months || {}));
      localStorage.setItem(WISH_STORAGE_KEY, JSON.stringify(snapshot.wishes || []));
      localStorage.setItem(DEBT_STORAGE_KEY, JSON.stringify(snapshot.debts || []));
      localStorage.setItem(CLOUD_SYNCED_AT_KEY, String(Date.now()));
    } finally {
      suppressCloudSync = false;
    }
    return true;
  }

  function refreshFromCloud() {
    return loadCloudSnapshot()
      .then((payload) => {
        const applied = applyCloudSnapshot(payload);
        if (!applied && payload?.ok && payload.snapshot === null) {
          cloudReady = true;
          saveCloudSnapshot();
        }
        return applied;
      })
      .catch(() => false)
      .finally(() => {
        cloudReady = true;
        if (pendingCloudSnapshot) saveCloudSnapshot();
      });
  }

  function loadBudgetFromSheet(month) {
    const sheetUrl = getSheetUrl();
    if (!sheetUrl) return Promise.resolve(null);

    return new Promise((resolve, reject) => {
      const callbackName = `faithBudgetCallback_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const script = document.createElement("script");
      const separator = sheetUrl.includes("?") ? "&" : "?";

      window[callbackName] = (payload) => {
        cleanup();
        resolve(payload);
      };

      function cleanup() {
        delete window[callbackName];
        script.remove();
      }

      script.onerror = () => {
        cleanup();
        reject(new Error("Budget sheet load failed"));
      };

      script.src = `${sheetUrl}${separator}type=budget&month=${encodeURIComponent(month)}&callback=${encodeURIComponent(callbackName)}`;
      document.body.appendChild(script);
    });
  }

  function applyBudgetRows(data, payload, month = "") {
    if (!payload || !Array.isArray(payload.rows)) return data;

    data.carryover = numberValue(payload.carryover);
    data.income = 0;
    data.items = Object.fromEntries(categories.map((category) => [category.id, []]));

    payload.rows.forEach((row) => {
      const category = categories.find((item) => item.name === row.category);
      if (!category) return;
      data.items[category.id].push({
        id: makeId(),
        name: row.item || "",
        budget: numberValue(row.budget),
      });
    });

    categories.forEach((category) => {
      if (data.items[category.id].length === 0) {
        data.items[category.id].push({ id: makeId(), name: "", budget: 0 });
      }
    });

    syncTitheItems(data);
    syncWishItems(data);
    syncDebtItemsAndExpenses(month, data);
    return data;
  }

  function syncBudget(month, data) {
    const rows = categories.flatMap((category) =>
      (data.items[category.id] || []).map((item) => ({
        category: category.name,
        item: item.name || "",
        budget: numberValue(item.budget),
      })),
    );

    return postToSheet({
      type: "budget",
      month,
      carryover: numberValue(data.carryover),
      income: (data.incomes || []).reduce((sum, income) => sum + numberValue(income.amount), 0),
      rows,
    });
  }

  function syncExpense(month, expense) {
    const category = categories.find((item) => item.id === expense.category)?.name || "";
    return postToSheet({
      type: "expense",
      month,
      date: expense.date,
      category,
      item: expense.itemName,
      amount: expense.amount,
      memo: expense.memo || "",
      user: "나",
    });
  }

  function syncEntry(month, type, entry) {
    return postToSheet({
      type,
      month,
      date: entry.date,
      category: entry.category || "",
      item: entry.itemName || entry.item || "",
      amount: entry.amount,
      memo: entry.memo || "",
      user: "나",
    });
  }

  function syncMonthlyReport(report) {
    return postToSheet({
      type: "monthlyReport",
      report,
    });
  }

  return {
    categories,
    copyMonthInto,
    copyPreviousMonthInto,
    createMonthData,
    escapeHtml,
    formatWon,
    getCategorySpent,
    getCategoryTotal,
    getCurrentMonth,
    getItemSpent,
    getSheetUrl,
    getToday,
    getTotals,
    refreshFromCloud,
    loadAllMonths,
    loadCloudSnapshot,
    loadWishes,
    loadDebtPlans,
    applyBudgetRows,
    applyCloudSnapshot,
    addWishDepositFromExpense,
    loadBudgetFromSheet,
    loadMonth,
    makeId,
    numberValue,
    saveMonth,
    saveWishes,
    saveDebtPlans,
    setDebtRequiredPaid,
    syncTitheItems,
    syncWishItems,
    removeWishDepositFromExpense,
    setSheetUrl,
    saveCloudSnapshot,
    syncBudget,
    syncEntry,
    syncExpense,
    syncMonthlyReport,
  };
})();
