const state = {
  month: BudgetStore.getCurrentMonth(),
  data: null,
  isEditingBudget: false,
  draggingItem: null,
};

const els = {
  month: document.querySelector("#budgetMonth"),
  carryover: document.querySelector("#carryoverInput"),
  income: document.querySelector("#incomeInput"),
  board: document.querySelector(".budget-board"),
  totalIncome: document.querySelector("#totalIncomeText"),
  totalBudget: document.querySelector("#totalBudgetText"),
  totalSpent: document.querySelector("#totalSpentText"),
  remaining: document.querySelector("#remainingText"),
  savingBudget: document.querySelector("#savingBudgetText"),
  saveStatus: document.querySelector("#saveStatus"),
  toggleBudgetEdit: document.querySelector("#toggleBudgetEditButton"),
  toggleClosingLock: document.querySelector("#toggleClosingLockButton"),
  syncBudget: document.querySelector("#syncBudgetButton"),
  resetMonth: document.querySelector("#resetMonthButton"),
  copyPreviousMonth: document.querySelector("#copyPreviousMonthButton"),
  sheetUrlInput: document.querySelector("#sheetUrlInput"),
  saveSheetUrl: document.querySelector("#saveSheetUrlButton"),
  ledgerPeriod: document.querySelector("#desktopLedgerPeriodText"),
  sownList: document.querySelector("#desktopSownList"),
  harvestList: document.querySelector("#desktopHarvestList"),
};

function loadCurrentMonth() {
  state.data = BudgetStore.loadMonth(state.month);
  if (state.data.closed) state.isEditingBudget = false;
  BudgetStore.syncTitheItems(state.data);
  BudgetStore.syncWishItems(state.data);
  BudgetStore.saveMonth(state.month, state.data);
}

function isLocked() {
  return Boolean(state.data?.closed);
}

function save(message = "자동 저장됨") {
  state.data.income = 0;
  BudgetStore.syncTitheItems(state.data);
  BudgetStore.saveMonth(state.month, state.data);
  els.saveStatus.textContent = message;
}

function syncAutoBudgetRules() {
  BudgetStore.syncTitheItems(state.data);
}

function renderSummary() {
  syncAutoBudgetRules();
  const totals = BudgetStore.getTotals(state.data);
  const savingBudget = getSavingBudgetTotal();
  const savingPercent = totals.totalBudget ? Math.round((savingBudget / totals.totalBudget) * 100) : 0;
  els.totalIncome.textContent = BudgetStore.formatWon(totals.totalIncome);
  els.totalBudget.textContent = BudgetStore.formatWon(totals.totalBudget);
  els.totalSpent.textContent = BudgetStore.formatWon(totals.totalSpent);
  els.remaining.textContent = BudgetStore.formatWon(totals.remaining);
  els.savingBudget.textContent = `${BudgetStore.formatWon(savingBudget)} · ${savingPercent}%`;
  els.remaining.classList.toggle("negative", totals.remaining < 0);
}

function getMobileIncomeTotal() {
  return (state.data.incomes || []).reduce((sum, income) => sum + BudgetStore.numberValue(income.amount), 0);
}

function getSavingBudgetTotal() {
  return BudgetStore.categories.reduce(
    (sum, category) =>
      sum +
      (state.data.items[category.id] || [])
        .filter((item) => item.isSaving)
        .reduce((itemSum, item) => itemSum + BudgetStore.numberValue(item.budget), 0),
    0,
  );
}

function renderBoard() {
  syncAutoBudgetRules();
  if (isLocked()) state.isEditingBudget = false;
  els.toggleBudgetEdit.textContent = isLocked() ? "결산 종료됨" : state.isEditingBudget ? "예산 저장" : "예산 수정";
  els.toggleClosingLock.textContent = isLocked() ? "재수정" : "결산 저장";
  els.toggleClosingLock.classList.toggle("secondary-button", isLocked());
  els.toggleBudgetEdit.disabled = isLocked();
  els.resetMonth.disabled = isLocked();
  els.copyPreviousMonth.disabled = isLocked();
  els.syncBudget.disabled = isLocked();
  els.carryover.disabled = isLocked();
  els.income.disabled = isLocked();
  els.saveStatus.textContent = isLocked() ? "결산 종료됨" : els.saveStatus.textContent;
  els.board.classList.toggle("is-editing-budget", state.isEditingBudget);
  els.board.innerHTML = BudgetStore.categories
    .map((category) => {
      const items = state.data.items[category.id] || [];
      const rows = items
        .map((item, index) => (state.isEditingBudget ? renderEditRow(category, item, index, items) : renderViewRow(category, item)))
        .join("");
      const headerCells = state.isEditingBudget
        ? "<span>내용</span><span>예산</span><span>저축</span><span>순서</span><span></span>"
        : "<span>내용</span><span>예산</span><span>지출</span>";
      const categoryBudget = BudgetStore.getCategoryTotal(state.data, category.id);
      const categorySpent = BudgetStore.getCategorySpent(state.data, category.id);
      const categoryOverClass = !state.isEditingBudget && categorySpent > categoryBudget ? " over-budget" : "";
      const categoryTotalText = state.isEditingBudget
        ? BudgetStore.formatWon(categoryBudget)
        : `${BudgetStore.formatWon(categoryBudget)} / 지출 ${BudgetStore.formatWon(categorySpent)}`;

      return `
        <article class="category-card ${category.id}" data-category="${category.id}">
          <div class="category-head">
            <div>
              <h2>${category.name}</h2>
            </div>
            <strong class="category-total${categoryOverClass}">${categoryTotalText}</strong>
          </div>
          <div class="budget-table" role="table" aria-label="${category.name} 예산">
            <div class="table-row table-header ${state.isEditingBudget ? "budget-edit-header" : ""}" role="row">
              ${headerCells}
            </div>
            <div class="item-list">${rows}</div>
          </div>
          ${state.isEditingBudget ? `<button class="add-item-button" type="button">+ 항목 추가</button>` : ""}
        </article>
      `;
    })
    .join("");
}

function renderViewRow(category, item) {
  const autoSpent = item.autoDebtPlanId
    ? (state.data.expenses || [])
        .filter((expense) => expense.autoDebtPlanId === item.autoDebtPlanId && (expense.autoDebtType || "principal") === item.autoDebtType)
        .reduce((sum, expense) => sum + BudgetStore.numberValue(expense.amount), 0)
    : null;
  const spent = autoSpent ?? BudgetStore.getItemSpent(state.data, category.id, item.name);
  const spentText = BudgetStore.formatWon(spent);
  const isOverBudget = spent > BudgetStore.numberValue(item.budget);
  const budgetText = BudgetStore.formatWon(item.budget);
  const autoLabel = item.autoDebtPlanId || item.autoTitheType ? `<small class="auto-item-label">자동</small>` : "";
  const titheButton = item.autoTitheType === "extra" ? renderTitheRateButton() : "";
  const savingLabel = item.isSaving ? `<small class="saving-item-label">저축</small>` : "";

  return `
    <div class="table-row item-view-row" data-category="${category.id}" data-id="${item.id}">
      <strong>${BudgetStore.escapeHtml(item.name || "이름 없는 항목")}${autoLabel}${savingLabel}${titheButton}</strong>
      <span>${budgetText}</span>
      <span class="${isOverBudget ? "over-budget" : ""}">${spentText}</span>
    </div>
  `;
}

function renderTitheRateButton() {
  return `<button class="edit-tithe-rate-button" type="button">비율 ${BudgetStore.numberValue(state.data.titheExtraRate || 5)}%</button>`;
}

function renderEditRow(category, item, index, items) {
  const nameReadonly = item.autoDebtPlanId || item.autoTitheType ? "readonly" : "";
  const budgetReadonly = item.autoTitheType ? "readonly" : "";
  const autoLabel = item.autoDebtPlanId || item.autoTitheType ? `<small class="auto-item-label">자동</small>` : "";
  const titheButton = item.autoTitheType === "extra" ? renderTitheRateButton() : "";

  return `
    <div class="table-row item-row" data-category="${category.id}" data-id="${item.id}">
      <label class="auto-item-name-wrap">
        <input class="item-name" type="text" value="${BudgetStore.escapeHtml(item.name)}" aria-label="${category.name} 항목 이름" ${nameReadonly} />
        <span>${autoLabel}${titheButton}</span>
      </label>
      <input class="item-budget" type="number" min="0" inputmode="numeric" value="${item.budget || ""}" aria-label="${category.name} 예산 금액" ${budgetReadonly} />
      <label class="saving-check">
        <input class="item-saving" type="checkbox" ${item.isSaving ? "checked" : ""} aria-label="${item.name || "항목"} 저축 표시" />
      </label>
      <div class="move-item-controls">
        <span class="drag-item-handle" draggable="true" title="드래그로 순서 이동" aria-label="드래그로 순서 이동">↕</span>
        <button class="move-item-button" type="button" data-direction="-1" ${index === 0 ? "disabled" : ""} aria-label="${item.name || "항목"} 위로 이동">▲</button>
        <button class="move-item-button" type="button" data-direction="1" ${index === items.length - 1 ? "disabled" : ""} aria-label="${item.name || "항목"} 아래로 이동">▼</button>
      </div>
      ${item.autoDebtPlanId || item.autoTitheType ? "<span></span>" : `<button class="remove-item-button" type="button" aria-label="항목 삭제">×</button>`}
    </div>
  `;
}

function moveBudgetItem(categoryId, itemId, targetId) {
  if (!categoryId || !itemId || !targetId || itemId === targetId) return false;
  const items = state.data.items[categoryId] || [];
  const currentIndex = items.findIndex((item) => item.id === itemId);
  const targetIndex = items.findIndex((item) => item.id === targetId);
  if (currentIndex < 0 || targetIndex < 0) return false;
  const [item] = items.splice(currentIndex, 1);
  items.splice(targetIndex, 0, item);
  return true;
}

function render() {
  els.month.value = state.month;
  els.carryover.value = state.data.carryover || "";
  els.income.value = BudgetStore.formatWon(getMobileIncomeTotal());
  els.sheetUrlInput.value = BudgetStore.getSheetUrl();
  renderBoard();
  renderSummary();
  renderHeavenLedger();
}

function renderHeavenLedger() {
  if (!els.ledgerPeriod) return;
  els.ledgerPeriod.textContent = `${state.month.replace("-", ".")} ~`;
  const heaven = state.data.heaven || [];
  const sown = heaven.filter((entry) => entry.kind !== "harvest");
  const harvest = heaven.filter((entry) => entry.kind === "harvest");
  els.sownList.innerHTML = renderLedgerRows(sown, "sown");
  els.harvestList.innerHTML = renderLedgerRows(harvest, "harvest");
}

function renderLedgerRows(rows, type) {
  let balance = 0;
  if (rows.length === 0) {
    return `<p class="ledger-empty">아직 기록이 없어요.</p>`;
  }

  return [...rows]
    .sort((a, b) => `${a.date}${a.id}`.localeCompare(`${b.date}${b.id}`))
    .map((entry) => {
      balance += BudgetStore.numberValue(entry.amount);
      const amount = type === "sown" ? `+ ${BudgetStore.formatWon(entry.amount)}` : BudgetStore.formatWon(entry.amount);
      return `
        <div class="ledger-row" data-id="${entry.id}" data-kind="${type}">
          <span>${Number(entry.date.slice(8))}일</span>
          <strong>${BudgetStore.escapeHtml(entry.memo || "")}</strong>
          <span>${amount}</span>
          <span>${BudgetStore.formatWon(balance)}</span>
        </div>
      `;
    })
    .join("");
}

function addItem(categoryId) {
  state.data.items[categoryId].push({ id: BudgetStore.makeId(), name: "", budget: 0 });
  save();
  render();
}

function syncBudget() {
  if (isLocked()) return;
  save();
  BudgetStore.syncBudget(state.month, state.data)
    .then((synced) => {
      els.saveStatus.textContent = synced ? "구글시트에 저장됨" : "연동 주소가 필요함";
    })
    .catch(() => {
      els.saveStatus.textContent = "기기에는 저장됨";
    });
}

function bindEvents() {
  els.month.addEventListener("change", () => {
    state.month = els.month.value || BudgetStore.getCurrentMonth();
    state.isEditingBudget = false;
    loadCurrentMonth();
    render();
  });

  els.carryover.addEventListener("input", () => {
    if (isLocked()) return;
    state.data.carryover = BudgetStore.numberValue(els.carryover.value);
    save();
    renderSummary();
  });

  els.income.addEventListener("input", () => {
    render();
  });

  els.toggleBudgetEdit.addEventListener("click", () => {
    if (isLocked()) return;
    state.isEditingBudget = !state.isEditingBudget;
    save(state.isEditingBudget ? "예산 수정 중" : "예산 저장됨");
    if (!state.isEditingBudget) syncBudget();
    render();
  });

  els.syncBudget.addEventListener("click", syncBudget);

  els.toggleClosingLock.addEventListener("click", () => {
    if (state.data.closed && !confirm("이 달 결산을 다시 수정 가능하게 열까요?")) return;
    if (!state.data.closed && !confirm("이 달 결산을 저장하고 입력/수정을 잠글까요?")) return;
    state.data.closed = !state.data.closed;
    state.isEditingBudget = false;
    BudgetStore.saveMonth(state.month, state.data);
    els.saveStatus.textContent = state.data.closed ? "결산 저장됨" : "재수정 가능";
    render();
  });

  els.board.addEventListener("click", (event) => {
    if (isLocked()) return;
    if (event.target.classList.contains("edit-tithe-rate-button")) {
      const nextRate = prompt("3.3% 십일조 비율을 입력해 주세요.", state.data.titheExtraRate || 5);
      if (nextRate === null) return;
      state.data.titheExtraRate = BudgetStore.numberValue(nextRate);
      save("3.3% 십일조 비율 저장됨");
      render();
      return;
    }

    const categoryCard = event.target.closest(".category-card");
    if (!categoryCard || !state.isEditingBudget) return;
    const categoryId = categoryCard.dataset.category;

    if (event.target.classList.contains("add-item-button")) {
      addItem(categoryId);
    }

    if (event.target.classList.contains("remove-item-button")) {
      const row = event.target.closest(".item-row");
      state.data.items[categoryId] = state.data.items[categoryId].filter((item) => item.id !== row.dataset.id);
      save();
      render();
    }

    if (event.target.classList.contains("move-item-button")) {
      const row = event.target.closest(".item-row");
      const items = state.data.items[categoryId];
      const index = items.findIndex((item) => item.id === row.dataset.id);
      const nextIndex = index + Number(event.target.dataset.direction || 0);
      if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return;
      const [item] = items.splice(index, 1);
      items.splice(nextIndex, 0, item);
      save("항목 순서 저장됨");
      render();
    }
  });

  els.board.addEventListener("input", (event) => {
    if (isLocked()) return;
    const row = event.target.closest(".item-row");
    if (!row) return;
    const item = state.data.items[row.dataset.category].find((budgetItem) => budgetItem.id === row.dataset.id);
    if (!item) return;

    if (event.target.classList.contains("item-name")) item.name = event.target.value;
    if (event.target.classList.contains("item-budget")) item.budget = BudgetStore.numberValue(event.target.value);
    if (event.target.classList.contains("item-saving")) item.isSaving = event.target.checked;

    save("예산 수정 중");
    syncAutoBudgetRules();
    renderSummary();
  });

  els.board.addEventListener("change", render);

  els.board.addEventListener("dragstart", (event) => {
    if (!state.isEditingBudget || isLocked()) return;
    if (!event.target.classList.contains("drag-item-handle")) return;
    const row = event.target.closest(".item-row");
    if (!row) return;
    state.draggingItem = { categoryId: row.dataset.category, itemId: row.dataset.id };
    row.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", row.dataset.id);
  });

  els.board.addEventListener("dragover", (event) => {
    if (!state.draggingItem) return;
    const row = event.target.closest(".item-row");
    if (!row || row.dataset.category !== state.draggingItem.categoryId) return;
    event.preventDefault();
    row.classList.add("is-drag-over");
  });

  els.board.addEventListener("dragleave", (event) => {
    const row = event.target.closest(".item-row");
    if (row) row.classList.remove("is-drag-over");
  });

  els.board.addEventListener("drop", (event) => {
    if (!state.draggingItem) return;
    const row = event.target.closest(".item-row");
    if (!row || row.dataset.category !== state.draggingItem.categoryId) return;
    event.preventDefault();
    if (moveBudgetItem(state.draggingItem.categoryId, state.draggingItem.itemId, row.dataset.id)) {
      save("항목 순서 저장됨");
      render();
    }
  });

  els.board.addEventListener("dragend", () => {
    state.draggingItem = null;
    els.board.querySelectorAll(".is-dragging, .is-drag-over").forEach((row) => {
      row.classList.remove("is-dragging", "is-drag-over");
    });
  });

  els.resetMonth.addEventListener("click", () => {
    if (isLocked()) return;
    if (!confirm("이번 달 예산과 지출 기록을 모두 비울까요?")) return;
    state.data = BudgetStore.createMonthData();
    state.isEditingBudget = false;
    save();
    render();
  });

  els.copyPreviousMonth.addEventListener("click", () => {
    if (isLocked()) return;
    const sourceMonth = prompt("가져올 연도-달을 입력해 주세요. 예: 2026-06", BudgetStore.getCurrentMonth());
    if (sourceMonth === null) return;
    const normalizedMonth = sourceMonth.trim();
    if (!/^\d{4}-\d{2}$/.test(normalizedMonth)) {
      els.saveStatus.textContent = "연도-달은 2026-06처럼 입력해 주세요";
      return;
    }
    if (normalizedMonth === state.month) {
      els.saveStatus.textContent = "현재 작성 월과 다른 달을 선택해 주세요";
      return;
    }
    if (!confirm(`${normalizedMonth} 내용을 ${state.month}로 가져올까요? 현재 ${state.month} 내용은 덮어써져요.`)) return;
    const copied = BudgetStore.copyMonthInto(normalizedMonth, state.month);
    if (!copied) {
      els.saveStatus.textContent = `${normalizedMonth}에 가져올 내용이 없어요`;
      return;
    }
    state.data = BudgetStore.loadMonth(state.month);
    state.isEditingBudget = false;
    els.saveStatus.textContent = `${normalizedMonth} 내용을 가져왔어요`;
    render();
  });

  els.saveSheetUrl.addEventListener("click", () => {
    BudgetStore.setSheetUrl(els.sheetUrlInput.value.trim());
    els.saveStatus.textContent = BudgetStore.getSheetUrl() ? "연동 주소 저장됨" : "연동 주소 비움";
  });
}

loadCurrentMonth();
bindEvents();
render();
BudgetStore.refreshFromCloud().then((updated) => {
  if (!updated) return;
  loadCurrentMonth();
  render();
  els.saveStatus.textContent = "구글시트에서 불러옴";
});
