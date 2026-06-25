const state = {
  month: BudgetStore.getCurrentMonth(),
  data: null,
  chartMonths: BudgetStore.numberValue(document.querySelector(".closing-page")?.dataset.chartMonths) || 6,
};

const els = {
  month: document.querySelector("#closingMonth"),
  totalIncome: document.querySelector("#closingIncomeText"),
  totalSpent: document.querySelector("#closingSpentText"),
  remaining: document.querySelector("#closingRemainingText"),
  heaven: document.querySelector("#closingHeavenText"),
  debt: document.querySelector("#closingDebtText"),
  incomePanelTotal: document.querySelector("#incomePanelTotal"),
  expensePanelTotal: document.querySelector("#expensePanelTotal"),
  heavenPanelTotal: document.querySelector("#heavenPanelTotal"),
  debtPanelTotal: document.querySelector("#debtPanelTotal"),
  incomeBreakdown: document.querySelector("#incomeBreakdown"),
  expenseBreakdown: document.querySelector("#expenseBreakdown"),
  heavenBreakdown: document.querySelector("#heavenBreakdown"),
  debtBreakdown: document.querySelector("#debtBreakdown"),
  sixMonthChart: document.querySelector("#sixMonthChart"),
  fulfilledWishTotal: document.querySelector("#fulfilledWishTotal"),
  fulfilledWishList: document.querySelector("#fulfilledWishList"),
};

function loadCurrentMonth() {
  state.data = BudgetStore.loadMonth(state.month);
}

function sum(rows) {
  return rows.reduce((total, row) => total + BudgetStore.numberValue(row.amount), 0);
}

function getIncomeRows() {
  const planned = [];
  if (BudgetStore.numberValue(state.data.carryover) > 0) {
    planned.push({ label: "지난달 이월", amount: state.data.carryover });
  }
  return [
    ...planned,
    ...(state.data.incomes || []).map((income) => ({
      label: income.memo || "수입",
      amount: income.amount,
      date: income.date,
    })),
  ];
}

function getExpenseRowsByCategory() {
  return BudgetStore.categories.map((category) => ({
    label: category.name,
    budget: BudgetStore.getCategoryTotal(state.data, category.id),
    amount: BudgetStore.getCategorySpent(state.data, category.id),
  }));
}

function getHeavenRows() {
  const heaven = state.data.heaven || [];
  const sown = heaven.filter((entry) => entry.kind !== "harvest");
  const harvest = heaven.filter((entry) => entry.kind === "harvest");
  return [
    { label: "심은 기록", amount: sum(sown), count: sown.length },
    { label: "거둔 기록", amount: sum(harvest), count: harvest.length },
  ];
}

function getDebtRows() {
  const debtPlans = BudgetStore.loadDebtPlans();
  return debtPlans.map((plan) => {
    const total = BudgetStore.numberValue(plan.total);
    const paid = Object.values(plan.records || {}).reduce((totalPaid, record) => totalPaid + BudgetStore.numberValue(record.amount), 0);
    const remaining = Math.max(0, total - paid);
    const progress = total ? Math.min(100, Math.round((paid / total) * 100)) : 0;
    return {
      label: `${plan.kind === "debt" ? "부채" : "적금"} · ${plan.name}`,
      total,
      paid,
      remaining,
      progress,
      kind: plan.kind,
    };
  });
}

function renderList(container, rows, options = {}) {
  container.innerHTML =
    rows.length === 0
      ? `<p class="empty-state">아직 기록이 없어요.</p>`
      : rows
          .map((row) => {
            const meta = row.date ? `<small>${row.date.slice(5)}</small>` : row.count !== undefined ? `<small>${row.count}건</small>` : "";
            const sub = row.budget !== undefined ? `<small>예산 ${BudgetStore.formatWon(row.budget)}</small>` : meta;
            const value = options.remaining ? BudgetStore.formatWon(row.budget - row.amount) : BudgetStore.formatWon(row.amount);
            return `
              <div class="closing-row">
                <span>${BudgetStore.escapeHtml(row.label)}${sub}</span>
                <strong>${value}</strong>
              </div>
            `;
          })
          .join("");
}

function renderDebtList(container, rows) {
  container.innerHTML =
    rows.length === 0
      ? `<p class="empty-state">아직 빚갚기나 저축 계획이 없어요.</p>`
      : rows
          .map((row) => {
            const actionLabel = row.kind === "debt" ? "갚음" : "모음";
            const remainingLabel = row.kind === "debt" ? "남은 부채" : "남은 목표";
            return `
              <div class="closing-row closing-debt-row ${row.kind}">
                <span>
                  ${BudgetStore.escapeHtml(row.label)}
                  <small>${actionLabel} ${BudgetStore.formatWon(row.paid)} / 총 ${BudgetStore.formatWon(row.total)}</small>
                  <i class="closing-progress" aria-label="${row.progress}%">
                    <b style="width:${row.progress}%"></b>
                  </i>
                </span>
                <strong>
                  ${BudgetStore.formatWon(row.remaining)}
                  <small>${remainingLabel}</small>
                </strong>
              </div>
            `;
          })
          .join("");
}

function getFulfilledWishRows() {
  const closingYear = state.month.slice(0, 4);
  return BudgetStore.loadWishes()
    .filter((wish) => wish.fulfilledDate && wish.fulfilledDate.slice(0, 4) === closingYear)
    .sort((a, b) => b.fulfilledDate.localeCompare(a.fulfilledDate))
    .map((wish) => ({
      name: wish.name || "이름 없는 결실",
      amount: BudgetStore.numberValue(wish.target),
      date: wish.fulfilledDate,
    }));
}

function renderFulfilledWishes() {
  if (!els.fulfilledWishTotal || !els.fulfilledWishList) return;
  const year = state.month.slice(0, 4);
  const rows = getFulfilledWishRows();
  const total = rows.reduce((sum, row) => sum + BudgetStore.numberValue(row.amount), 0);
  els.fulfilledWishTotal.textContent = `${year}년 ${BudgetStore.formatWon(total)}`;
  els.fulfilledWishList.innerHTML =
    rows.length === 0
      ? `<p class="empty-state">아직 ${year}년에 기록된 결실이 없어요.</p>`
      : rows
          .map(
            (row) => `
              <div class="fulfilled-wish-row">
                <strong>${BudgetStore.escapeHtml(row.name)}</strong>
                <span>${BudgetStore.formatWon(row.amount)}</span>
                <small>${row.date}</small>
              </div>
            `,
          )
          .join("");
}

function getPreviousMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getRecentMonths() {
  const months = [state.month];
  while (months.length < state.chartMonths) {
    months.unshift(getPreviousMonth(months[0]));
  }
  return months;
}

function getMonthIncome(data) {
  const incomeRows = [
    { amount: data.carryover },
    ...(data.incomes || []),
  ];
  return incomeRows.reduce((total, row) => total + BudgetStore.numberValue(row.amount), 0);
}

function getDebtRemainingAtMonth(month) {
  return BudgetStore.loadDebtPlans()
    .filter((plan) => plan.kind === "debt")
    .reduce((sum, plan) => {
      const paid = Object.entries(plan.records || {})
        .filter(([recordMonth]) => recordMonth <= month)
        .reduce((total, [, record]) => total + BudgetStore.numberValue(record.amount), 0);
      return sum + Math.max(0, BudgetStore.numberValue(plan.total) - paid);
    }, 0);
}

function getSavingAssetAtMonth(month) {
  return BudgetStore.loadDebtPlans()
    .filter((plan) => plan.kind === "saving")
    .reduce(
      (sum, plan) =>
        sum +
        Object.entries(plan.records || {})
          .filter(([recordMonth]) => recordMonth <= month)
          .reduce((total, [, record]) => total + BudgetStore.numberValue(record.amount), 0),
      0,
    );
}

function getAssetTotalAtMonth(month, data, totals) {
  return totals.remaining + getSavingAssetAtMonth(month);
}

function renderFlowChart() {
  const months = getRecentMonths();
  const allMonths = BudgetStore.loadAllMonths();
  const rows = months.map((month) => {
    const data = allMonths[month] || BudgetStore.createMonthData();
    const totals = BudgetStore.getTotals(data);
    return {
      month,
      income: getMonthIncome(data),
      spent: totals.totalSpent,
      debtRemaining: getDebtRemainingAtMonth(month),
      assetTotal: getAssetTotalAtMonth(month, data, totals),
    };
  });
  const values = rows.flatMap((row) => [row.income, row.spent, row.debtRemaining, row.assetTotal]);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(1, ...values);
  const valueRange = Math.max(1, maxValue - minValue);
  const width = 720;
  const height = 260;
  const padding = 34;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const xStep = chartWidth / Math.max(1, rows.length - 1);
  const point = (value, index) => {
    const x = padding + xStep * index;
    const y = height - padding - ((value - minValue) / valueRange) * chartHeight;
    return `${x},${y}`;
  };
  const incomePoints = rows.map((row, index) => point(row.income, index)).join(" ");
  const spentPoints = rows.map((row, index) => point(row.spent, index)).join(" ");
  const debtPoints = rows.map((row, index) => point(row.debtRemaining, index)).join(" ");
  const assetPoints = rows.map((row, index) => point(row.assetTotal, index)).join(" ");
  const gridLines = [0, 0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const y = height - padding - ratio * chartHeight;
      return `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" class="chart-grid-line" />`;
    })
    .join("");

  const labels = rows
    .map((row, index) => {
      const [incomeX, incomeY] = point(row.income, index).split(",");
      const [spentX, spentY] = point(row.spent, index).split(",");
      const [debtX, debtY] = point(row.debtRemaining, index).split(",");
      const [assetX, assetY] = point(row.assetTotal, index).split(",");
      const valueLabel = (x, y, value, className, dy) =>
        `<text x="${x}" y="${Number(y) + dy}" class="chart-value-label ${className}">${formatChartValue(value)}</text>`;
      return `
        <g>
          <circle cx="${incomeX}" cy="${incomeY}" r="4.5" class="chart-dot income-dot" />
          <circle cx="${spentX}" cy="${spentY}" r="4.5" class="chart-dot spent-dot" />
          <circle cx="${debtX}" cy="${debtY}" r="4.5" class="chart-dot debt-dot" />
          <circle cx="${assetX}" cy="${assetY}" r="4.5" class="chart-dot asset-dot" />
          ${valueLabel(incomeX, incomeY, row.income, "income-value", -10)}
          ${valueLabel(spentX, spentY, row.spent, "spent-value", 18)}
          ${valueLabel(debtX, debtY, row.debtRemaining, "debt-value", -22)}
          ${valueLabel(assetX, assetY, row.assetTotal, "asset-value", 30)}
          <text x="${incomeX}" y="${height - 8}" class="chart-svg-label">${row.month.slice(5)}월</text>
        </g>
      `;
    })
    .join("");

  els.sixMonthChart.innerHTML = `
    <div class="line-chart-legend">
      <span><i class="income-key"></i>수입</span>
      <span><i class="spent-key"></i>지출</span>
      <span><i class="debt-key"></i>빚갚기 잔액</span>
      <span><i class="asset-key"></i>자산 총액</span>
    </div>
    <svg class="line-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="최근 ${rows.length}개월 수입, 지출, 빚갚기 잔액, 자산 총액 꺾은선 그래프">
      ${gridLines}
      <polyline class="chart-line income-line" points="${incomePoints}" />
      <polyline class="chart-line spent-line" points="${spentPoints}" />
      <polyline class="chart-line debt-line" points="${debtPoints}" />
      <polyline class="chart-line asset-line" points="${assetPoints}" />
      ${labels}
    </svg>
    <div class="line-chart-values" style="--chart-month-count: ${rows.length}">
      ${rows
        .map(
          (row) => `
            <div>
              <strong>${row.month.slice(5)}월</strong>
              <span>수입 ${BudgetStore.formatWon(row.income)}</span>
              <span>지출 ${BudgetStore.formatWon(row.spent)}</span>
              <span>빚 ${BudgetStore.formatWon(row.debtRemaining)}</span>
              <span>자산 ${BudgetStore.formatWon(row.assetTotal)}</span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function formatChartValue(value) {
  const number = BudgetStore.numberValue(value);
  if (number >= 10000) return `${Math.round(number / 10000).toLocaleString("ko-KR")}만`;
  return number.toLocaleString("ko-KR");
}

function render() {
  const totals = BudgetStore.getTotals(state.data);
  const incomeRows = getIncomeRows();
  const expenseRows = getExpenseRowsByCategory();
  const heavenRows = getHeavenRows();
  const debtRows = getDebtRows();
  const incomeTotal = incomeRows.reduce((total, row) => total + BudgetStore.numberValue(row.amount), 0);
  const heavenSown = heavenRows[0]?.amount || 0;
  const heavenHarvest = heavenRows[1]?.amount || 0;
  const debtPlans = debtRows.filter((row) => row.kind === "debt");
  const debtPaid = debtPlans.reduce((total, row) => total + BudgetStore.numberValue(row.paid), 0);
  const debtTotal = debtPlans.reduce((total, row) => total + BudgetStore.numberValue(row.total), 0);
  const debtRemaining = debtPlans.reduce((total, row) => total + BudgetStore.numberValue(row.remaining), 0);

  els.month.value = state.month;
  els.totalIncome.textContent = BudgetStore.formatWon(incomeTotal);
  els.totalSpent.textContent = BudgetStore.formatWon(totals.totalSpent);
  els.remaining.textContent = BudgetStore.formatWon(totals.remaining);
  els.remaining.classList.toggle("negative", totals.remaining < 0);
  els.heaven.textContent = `${BudgetStore.formatWon(heavenSown)} / ${BudgetStore.formatWon(heavenHarvest)}`;
  els.debt.textContent = debtTotal ? `${BudgetStore.formatWon(debtPaid)} / ${BudgetStore.formatWon(debtTotal)}` : "0원";

  els.incomePanelTotal.textContent = BudgetStore.formatWon(incomeTotal);
  els.expensePanelTotal.textContent = BudgetStore.formatWon(totals.totalSpent);
  els.heavenPanelTotal.textContent = `${BudgetStore.formatWon(heavenSown)} / ${BudgetStore.formatWon(heavenHarvest)}`;
  els.debtPanelTotal.textContent = debtTotal
    ? `남은 부채 ${BudgetStore.formatWon(debtRemaining)}`
    : "0원";
  renderList(els.incomeBreakdown, incomeRows);
  renderList(els.expenseBreakdown, expenseRows);
  renderList(els.heavenBreakdown, heavenRows);
  renderDebtList(els.debtBreakdown, debtRows);
  renderFlowChart();
  renderFulfilledWishes();
}

els.month.addEventListener("change", () => {
  state.month = els.month.value || BudgetStore.getCurrentMonth();
  loadCurrentMonth();
  render();
});

loadCurrentMonth();
render();
