const state = {
  month: BudgetStore.getCurrentMonth(),
  data: null,
  mode: "expense",
  editingEntryKey: null,
};

const els = {
  month: document.querySelector("#budgetMonth"),
  form: document.querySelector("#expenseForm"),
  date: document.querySelector("#expenseDate"),
  category: document.querySelector("#expenseCategory"),
  item: document.querySelector("#expenseItem"),
  itemBudgetHint: document.querySelector("#itemBudgetHint"),
  amount: document.querySelector("#expenseAmount"),
  memo: document.querySelector("#expenseMemo"),
  totalBudget: document.querySelector("#totalBudgetText"),
  totalSpent: document.querySelector("#totalSpentText"),
  remaining: document.querySelector("#remainingText"),
  expenseList: document.querySelector("#expenseList"),
  expenseCount: document.querySelector("#expenseCountText"),
  sheetUrlInput: document.querySelector("#sheetUrlInput"),
  saveSheetUrl: document.querySelector("#saveSheetUrlButton"),
  saveStatus: document.querySelector("#saveStatus"),
  tabs: document.querySelectorAll(".entry-tab"),
  categoryField: document.querySelector(".category-field"),
  itemField: document.querySelector(".item-field"),
  submitButton: document.querySelector("#submitEntryButton"),
};

function loadCurrentMonth() {
  state.data = BudgetStore.loadMonth(state.month);
}

function isLocked() {
  return Boolean(state.data?.closed);
}

function refreshBudgetFromSheet() {
  if (isLocked()) return Promise.resolve(false);
  return BudgetStore.loadBudgetFromSheet(state.month)
    .then((payload) => {
      if (!payload) return false;
      state.data = BudgetStore.applyBudgetRows(state.data, payload, state.month);
      BudgetStore.syncWishItems(state.data);
      BudgetStore.saveMonth(state.month, state.data);
      els.saveStatus.textContent = "예산 불러옴";
      render();
      return true;
    })
    .catch(() => {
      els.saveStatus.textContent = "기기에 저장된 예산 사용 중";
      return false;
    });
}

function save(message = "자동 저장됨") {
  BudgetStore.saveMonth(state.month, state.data);
  els.saveStatus.textContent = message;
}

function renderCategoryOptions() {
  els.category.innerHTML = BudgetStore.categories.map((category) => `<option value="${category.id}">${category.name}</option>`).join("");
}

function renderItemOptions() {
  const items = state.data.items[els.category.value] || [];
  els.item.innerHTML = [
    `<option value="">항목 미정</option>`,
    ...items.map((item) => `<option value="${item.id}">${BudgetStore.escapeHtml(item.name || "이름 없는 항목")}</option>`),
  ].join("");
  renderItemBudgetHint();
}

function renderItemBudgetHint() {
  if (!els.itemBudgetHint) return;
  if (state.mode !== "expense") {
    els.itemBudgetHint.textContent = "";
    return;
  }

  const categoryId = els.category.value;
  const item = (state.data.items[categoryId] || []).find((budgetItem) => budgetItem.id === els.item.value);
  const budget = item
    ? BudgetStore.numberValue(item.budget)
    : BudgetStore.getCategoryTotal(state.data, categoryId);
  const spent = item
    ? BudgetStore.getItemSpent(state.data, categoryId, item.name)
    : BudgetStore.getCategorySpent(state.data, categoryId);
  const remaining = budget - spent;
  els.itemBudgetHint.innerHTML = `<strong>남은 예산 ${BudgetStore.formatWon(remaining)}</strong><span>예산 ${BudgetStore.formatWon(budget)} / 지출 ${BudgetStore.formatWon(spent)}</span>`;
  els.itemBudgetHint.classList.toggle("negative", remaining < 0);
}

function renderSummary() {
  const totals = BudgetStore.getTotals(state.data);
  els.totalBudget.textContent = BudgetStore.formatWon(totals.totalBudget);
  els.totalSpent.textContent = BudgetStore.formatWon(totals.totalSpent);
  els.remaining.textContent = BudgetStore.formatWon(totals.remaining);
  els.remaining.classList.toggle("negative", totals.remaining < 0);
}

function attachDebtMeta(entry, item) {
  delete entry.autoDebtPlanId;
  delete entry.autoDebtType;
  delete entry.autoDebtMonth;
  delete entry.manualDebtLinked;
  if (!item?.autoDebtPlanId) return;
  entry.autoDebtPlanId = item.autoDebtPlanId;
  entry.autoDebtType = item.autoDebtType || "principal";
  entry.autoDebtMonth = state.month;
  entry.manualDebtLinked = true;
}

function syncDebtInterestCheck(entry, paid) {
  if (entry.autoDebtPlanId && entry.autoDebtType === "interest") {
    BudgetStore.setDebtRequiredPaid(entry.autoDebtPlanId, state.month, paid, entry.amount);
  }
}

function renderExpenses() {
  const rows = [
    ...state.data.expenses.map((entry) => ({ ...entry, type: "지출" })),
    ...(state.data.incomes || []).map((entry) => ({ ...entry, type: "수입" })),
  ];
  const sorted = rows.sort((a, b) => `${b.date}${b.id}`.localeCompare(`${a.date}${a.id}`));
  els.expenseCount.textContent = `${sorted.length}건`;
  els.expenseList.innerHTML =
    sorted.length === 0
      ? `<p class="empty-state">아직 기록한 내용이 없어요.</p>`
      : sorted
          .map((expense) => {
            const category = BudgetStore.categories.find((item) => item.id === expense.category);
            const sign = expense.type === "수입" ? "+" : "-";
            const title = [category?.name, expense.itemName || expense.item || expense.type].filter(Boolean).join(" · ");
            const memo = expense.memo ? `<small>${BudgetStore.escapeHtml(expense.memo)}</small>` : "";
            const removeButton = expense.autoDebtPlanId && !expense.manualDebtLinked
              ? `<span class="auto-item-label">자동</span>`
              : isLocked()
                ? `<span class="auto-item-label">고정</span>`
                : state.editingEntryKey === `${expense.type}:${expense.id}`
                  ? `
                    <div class="entry-edit-actions">
                      <button class="remove-expense-button" type="button" aria-label="입력 삭제">삭제</button>
                      <button class="cancel-entry-edit-button" type="button" aria-label="수정 취소">취소</button>
                    </div>
                  `
                  : `<button class="edit-entry-button" type="button" aria-label="입력 수정">수정</button>`;
            return `
              <div class="expense-row ${state.editingEntryKey === `${expense.type}:${expense.id}` ? "is-editing-entry" : ""}" data-id="${expense.id}" data-type="${expense.type}">
                <span>${expense.date.slice(5)}</span>
                <strong><i class="entry-sign ${expense.type === "수입" ? "plus" : "minus"}">${sign}</i>${BudgetStore.escapeHtml(title)}${memo}</strong>
                <span class="${expense.type === "수입" ? "income-amount" : "expense-amount"}">${sign} ${BudgetStore.formatWon(expense.amount)}</span>
                ${removeButton}
              </div>
              ${state.editingEntryKey === `${expense.type}:${expense.id}` ? renderEntryEditForm(expense) : ""}
            `;
          })
          .join("");
}

function renderEntryEditForm(entry) {
  if (entry.type === "수입") {
    return `
      <form class="entry-edit-form" data-id="${entry.id}" data-type="${entry.type}">
        <label>날짜<input class="edit-entry-date" type="date" value="${entry.date || BudgetStore.getToday()}" required /></label>
        <label>내용<input class="edit-entry-memo" type="text" value="${BudgetStore.escapeHtml(entry.memo || "")}" /></label>
        <label>금액<input class="edit-entry-amount" type="number" min="0" inputmode="numeric" value="${BudgetStore.numberValue(entry.amount)}" required /></label>
        <button type="submit">수정 저장</button>
      </form>
    `;
  }

  const categoryOptions = BudgetStore.categories
    .map((category) => `<option value="${category.id}" ${entry.category === category.id ? "selected" : ""}>${category.name}</option>`)
    .join("");
  const itemOptions = [
    `<option value="">항목 미정</option>`,
    ...(state.data.items[entry.category] || []).map(
      (item) => `<option value="${BudgetStore.escapeHtml(item.name || "")}" ${entry.itemName === item.name ? "selected" : ""}>${BudgetStore.escapeHtml(item.name || "이름 없는 항목")}</option>`,
    ),
  ].join("");

  return `
    <form class="entry-edit-form" data-id="${entry.id}" data-type="${entry.type}">
      <label>날짜<input class="edit-entry-date" type="date" value="${entry.date || BudgetStore.getToday()}" required /></label>
      <label>분류<select class="edit-entry-category">${categoryOptions}</select></label>
      <label>항목<select class="edit-entry-item">${itemOptions}</select></label>
      <label>금액<input class="edit-entry-amount" type="number" min="0" inputmode="numeric" value="${BudgetStore.numberValue(entry.amount)}" required /></label>
      <label class="entry-edit-wide">메모<input class="edit-entry-memo" type="text" value="${BudgetStore.escapeHtml(entry.memo || "")}" /></label>
      <button type="submit">수정 저장</button>
    </form>
  `;
}

function render() {
  els.month.value = state.month;
  els.sheetUrlInput.value = BudgetStore.getSheetUrl();
  renderMode();
  renderCategoryOptions();
  renderItemOptions();
  renderItemBudgetHint();
  renderSummary();
  renderExpenses();
  renderLockState();
}

function renderLockState() {
  const locked = isLocked();
  [...els.form.elements].forEach((element) => {
    if (element === els.month) return;
    element.disabled = locked;
  });
  els.tabs.forEach((tab) => {
    tab.disabled = locked;
  });
  els.saveSheetUrl.disabled = locked;
  els.saveStatus.textContent = locked ? "결산 종료됨" : els.saveStatus.textContent;
}

function renderMode() {
  els.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === state.mode));
  const isExpense = state.mode === "expense";
  els.categoryField.hidden = !isExpense;
  els.itemField.hidden = !isExpense;
  els.category.required = isExpense;
  els.submitButton.textContent =
    state.mode === "income" ? "수입 추가" : state.mode === "heaven" ? "하늘은행 기록" : "지출 추가";
  renderItemBudgetHint();
}

function bindEvents() {
  els.month.addEventListener("change", () => {
    state.month = els.month.value || BudgetStore.getCurrentMonth();
    loadCurrentMonth();
    render();
    refreshBudgetFromSheet();
  });

  els.category.addEventListener("change", renderItemOptions);
  els.item.addEventListener("change", renderItemBudgetHint);

  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      state.mode = tab.dataset.mode;
      renderMode();
      els.amount.focus();
    });
  });

  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (isLocked()) return;
    const item = (state.data.items[els.category.value] || []).find((budgetItem) => budgetItem.id === els.item.value);
    const entry = {
      id: BudgetStore.makeId(),
      date: els.date.value || BudgetStore.getToday(),
      amount: BudgetStore.numberValue(els.amount.value),
      memo: els.memo.value.trim(),
    };

    if (state.mode === "expense") {
      entry.category = els.category.value;
      entry.itemName = item?.name || "";
      attachDebtMeta(entry, item);
      syncDebtInterestCheck(entry, true);
      state.data.expenses.push(entry);
      BudgetStore.addWishDepositFromExpense(entry);
    } else if (state.mode === "income") {
      entry.item = "수입";
      state.data.incomes = state.data.incomes || [];
      state.data.incomes.push(entry);
    } else {
      entry.item = "하늘은행통장";
      state.data.heaven = state.data.heaven || [];
      state.data.heaven.push(entry);
    }

    els.amount.value = "";
    els.memo.value = "";
    save();
    const syncType = state.mode === "expense" ? "expense" : state.mode;
    const syncCall = state.mode === "expense"
      ? BudgetStore.syncExpense(state.month, entry)
      : BudgetStore.syncEntry(state.month, syncType, entry);
    syncCall
      .then((synced) => {
        els.saveStatus.textContent = synced ? "구글시트에 기록됨" : "기기에 기록됨";
      })
      .catch(() => {
        els.saveStatus.textContent = "기기에 기록됨";
      });
    renderSummary();
    renderItemBudgetHint();
    renderExpenses();
    els.amount.focus();
  });

  els.expenseList.addEventListener("change", (event) => {
    if (!event.target.classList.contains("edit-entry-category")) return;
    const form = event.target.closest(".entry-edit-form");
    const itemSelect = form.querySelector(".edit-entry-item");
    const items = state.data.items[event.target.value] || [];
    itemSelect.innerHTML = [
      `<option value="">항목 미정</option>`,
      ...items.map((item) => `<option value="${BudgetStore.escapeHtml(item.name || "")}">${BudgetStore.escapeHtml(item.name || "이름 없는 항목")}</option>`),
    ].join("");
  });

  els.expenseList.addEventListener("submit", (event) => {
    if (!event.target.classList.contains("entry-edit-form")) return;
    event.preventDefault();
    if (isLocked()) return;
    const form = event.target;
    if (form.dataset.type === "수입") {
      const income = (state.data.incomes || []).find((entry) => entry.id === form.dataset.id);
      if (!income) return;
      income.date = form.querySelector(".edit-entry-date").value || BudgetStore.getToday();
      income.amount = BudgetStore.numberValue(form.querySelector(".edit-entry-amount").value);
      income.memo = form.querySelector(".edit-entry-memo").value.trim();
      if (income.heavenEntryId) {
        const heavenEntry = (state.data.heaven || []).find((entry) => entry.id === income.heavenEntryId);
        if (heavenEntry) {
          heavenEntry.date = income.date;
          heavenEntry.amount = income.amount;
          heavenEntry.memo = income.memo || "수입";
        }
      }
    } else {
      const expense = state.data.expenses.find((entry) => entry.id === form.dataset.id);
      if (!expense) return;
      syncDebtInterestCheck(expense, false);
      BudgetStore.removeWishDepositFromExpense(expense.id);
      const selectedItemName = form.querySelector(".edit-entry-item").value;
      const selectedItem = (state.data.items[form.querySelector(".edit-entry-category").value] || []).find((item) => item.name === selectedItemName);
      expense.date = form.querySelector(".edit-entry-date").value || BudgetStore.getToday();
      expense.category = form.querySelector(".edit-entry-category").value;
      expense.itemName = selectedItemName;
      expense.amount = BudgetStore.numberValue(form.querySelector(".edit-entry-amount").value);
      expense.memo = form.querySelector(".edit-entry-memo").value.trim();
      attachDebtMeta(expense, selectedItem);
      syncDebtInterestCheck(expense, true);
      BudgetStore.addWishDepositFromExpense(expense);
    }
    state.editingEntryKey = null;
    save();
    renderSummary();
    renderItemBudgetHint();
    renderExpenses();
  });

  els.expenseList.addEventListener("click", (event) => {
    if (isLocked()) return;
    const row = event.target.closest(".expense-row");
    if (!row) return;
    const entryKey = `${row.dataset.type}:${row.dataset.id}`;
    if (event.target.classList.contains("edit-entry-button")) {
      state.editingEntryKey = entryKey;
      renderExpenses();
      return;
    }
    if (event.target.classList.contains("cancel-entry-edit-button")) {
      state.editingEntryKey = null;
      renderExpenses();
      return;
    }
    if (!event.target.classList.contains("remove-expense-button")) return;
    if (!confirm("이 입력 기록을 삭제할까요?")) return;
    if (row.dataset.type === "수입") {
      state.data.incomes = (state.data.incomes || []).filter((entry) => entry.id !== row.dataset.id);
    } else {
      const expense = state.data.expenses.find((entry) => entry.id === row.dataset.id);
      if (expense) syncDebtInterestCheck(expense, false);
      BudgetStore.removeWishDepositFromExpense(row.dataset.id);
      state.data.expenses = state.data.expenses.filter((expense) => expense.id !== row.dataset.id);
    }
    state.editingEntryKey = null;
    save();
    renderSummary();
    renderItemBudgetHint();
    renderExpenses();
  });

  els.saveSheetUrl.addEventListener("click", () => {
    if (isLocked()) return;
    BudgetStore.setSheetUrl(els.sheetUrlInput.value.trim());
    els.saveStatus.textContent = BudgetStore.getSheetUrl() ? "연동 주소 저장됨" : "연동 주소 비움";
    refreshBudgetFromSheet();
  });
}

loadCurrentMonth();
els.date.value = BudgetStore.getToday();
bindEvents();
render();
refreshBudgetFromSheet();
