const state = {
  month: BudgetStore.getCurrentMonth(),
  data: null,
  editingIncomeId: null,
};

const els = {
  month: document.querySelector("#budgetMonth"),
  form: document.querySelector("#incomeForm"),
  date: document.querySelector("#incomeDate"),
  amount: document.querySelector("#incomeAmount"),
  memo: document.querySelector("#incomeMemo"),
  plannedIncome: document.querySelector("#plannedIncomeText"),
  recordedIncome: document.querySelector("#recordedIncomeText"),
  totalIncome: document.querySelector("#totalIncomeText"),
  incomeList: document.querySelector("#incomeList"),
  incomeCount: document.querySelector("#incomeCountText"),
  sheetUrlInput: document.querySelector("#sheetUrlInput"),
  saveSheetUrl: document.querySelector("#saveSheetUrlButton"),
  saveStatus: document.querySelector("#saveStatus"),
};

function loadCurrentMonth() {
  state.data = BudgetStore.loadMonth(state.month);
}

function save(message = "자동 저장됨") {
  BudgetStore.saveMonth(state.month, state.data);
  els.saveStatus.textContent = message;
}

function getRecordedIncome() {
  return (state.data.incomes || []).reduce((sum, income) => sum + BudgetStore.numberValue(income.amount), 0);
}

function renderSummary() {
  const planned = BudgetStore.numberValue(state.data.income);
  const recorded = getRecordedIncome();
  const carryover = BudgetStore.numberValue(state.data.carryover);

  els.plannedIncome.textContent = BudgetStore.formatWon(planned);
  els.recordedIncome.textContent = BudgetStore.formatWon(recorded);
  els.totalIncome.textContent = BudgetStore.formatWon(carryover + planned + recorded);
}

function renderIncomes() {
  const rows = [...(state.data.incomes || [])].sort((a, b) => `${b.date}${b.id}`.localeCompare(`${a.date}${a.id}`));
  els.incomeCount.textContent = `${rows.length}건`;
  els.incomeList.innerHTML =
    rows.length === 0
      ? `<p class="empty-state">아직 기록한 수입이 없어요.</p>`
      : rows
          .map((income) => {
            const memo = income.memo ? `<small>${BudgetStore.escapeHtml(income.memo)}</small>` : "";
            const actions =
              state.editingIncomeId === income.id
                ? `
                  <div class="entry-edit-actions">
                    <button class="remove-expense-button" type="button" aria-label="수입 삭제">삭제</button>
                    <button class="cancel-entry-edit-button" type="button" aria-label="수정 취소">취소</button>
                  </div>
                `
                : `<button class="edit-entry-button" type="button" aria-label="수입 수정">수정</button>`;
            return `
              <div class="expense-row ${state.editingIncomeId === income.id ? "is-editing-entry" : ""}" data-id="${income.id}">
                <span>${income.date.slice(5)}</span>
                <strong>수입${memo}</strong>
                <span>${BudgetStore.formatWon(income.amount)}</span>
                ${actions}
              </div>
              ${state.editingIncomeId === income.id ? renderIncomeEditForm(income) : ""}
            `;
          })
          .join("");
}

function renderIncomeEditForm(income) {
  return `
    <form class="entry-edit-form" data-id="${income.id}">
      <label>날짜<input class="edit-entry-date" type="date" value="${income.date || BudgetStore.getToday()}" required /></label>
      <label>내용<input class="edit-entry-memo" type="text" value="${BudgetStore.escapeHtml(income.memo || "")}" /></label>
      <label>금액<input class="edit-entry-amount" type="number" min="0" inputmode="numeric" value="${BudgetStore.numberValue(income.amount)}" required /></label>
      <button type="submit">수정 저장</button>
    </form>
  `;
}

function render() {
  els.month.value = state.month;
  els.sheetUrlInput.value = BudgetStore.getSheetUrl();
  renderSummary();
  renderIncomes();
}

function bindEvents() {
  els.month.addEventListener("change", () => {
    state.month = els.month.value || BudgetStore.getCurrentMonth();
    loadCurrentMonth();
    render();
  });

  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const income = {
      id: BudgetStore.makeId(),
      date: els.date.value || BudgetStore.getToday(),
      item: "수입",
      amount: BudgetStore.numberValue(els.amount.value),
      memo: els.memo.value.trim(),
    };
    const heavenEntry = {
      id: BudgetStore.makeId(),
      date: income.date,
      kind: "harvest",
      item: "거둔 기록",
      assetType: "현금",
      amount: income.amount,
      memo: income.memo || "수입",
      sourceIncomeId: income.id,
    };
    income.heavenEntryId = heavenEntry.id;

    state.data.incomes = state.data.incomes || [];
    state.data.heaven = state.data.heaven || [];
    state.data.incomes.push(income);
    state.data.heaven.push(heavenEntry);
    els.amount.value = "";
    els.memo.value = "";
    save();

    Promise.all([
      BudgetStore.syncEntry(state.month, "income", income),
      BudgetStore.syncEntry(state.month, "heaven", heavenEntry),
    ])
      .then((synced) => {
        els.saveStatus.textContent = synced.some(Boolean) ? "구글시트에 기록됨" : "기기에 기록됨";
      })
      .catch(() => {
        els.saveStatus.textContent = "기기에 기록됨";
      });

    renderSummary();
    renderIncomes();
    els.amount.focus();
  });

  els.incomeList.addEventListener("submit", (event) => {
    if (!event.target.classList.contains("entry-edit-form")) return;
    event.preventDefault();
    const form = event.target;
    const income = (state.data.incomes || []).find((item) => item.id === form.dataset.id);
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
    state.editingIncomeId = null;
    save();
    renderSummary();
    renderIncomes();
  });

  els.incomeList.addEventListener("click", (event) => {
    const row = event.target.closest(".expense-row");
    if (!row) return;
    if (event.target.classList.contains("edit-entry-button")) {
      state.editingIncomeId = row.dataset.id;
      renderIncomes();
      return;
    }
    if (event.target.classList.contains("cancel-entry-edit-button")) {
      state.editingIncomeId = null;
      renderIncomes();
      return;
    }
    if (!event.target.classList.contains("remove-expense-button")) return;
    if (!confirm("이 수입 기록을 삭제할까요?")) return;
    const income = (state.data.incomes || []).find((item) => item.id === row.dataset.id);
    state.data.incomes = (state.data.incomes || []).filter((item) => item.id !== row.dataset.id);
    if (income?.heavenEntryId) {
      state.data.heaven = (state.data.heaven || []).filter((entry) => entry.id !== income.heavenEntryId);
    }
    state.editingIncomeId = null;
    save();
    renderSummary();
    renderIncomes();
  });

  els.saveSheetUrl.addEventListener("click", () => {
    BudgetStore.setSheetUrl(els.sheetUrlInput.value.trim());
    els.saveStatus.textContent = BudgetStore.getSheetUrl() ? "연동 주소 저장됨" : "연동 주소 비움";
  });
}

loadCurrentMonth();
els.date.value = BudgetStore.getToday();
bindEvents();
render();
