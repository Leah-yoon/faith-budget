const state = {
  month: BudgetStore.getCurrentMonth(),
  data: null,
  mode: "sown",
  editingHeavenId: null,
};

const els = {
  month: document.querySelector("#budgetMonth"),
  form: document.querySelector("#heavenForm"),
  date: document.querySelector("#heavenDate"),
  memo: document.querySelector("#heavenMemo"),
  assetType: document.querySelector("#heavenAssetType"),
  assetTypeTabs: document.querySelectorAll(".asset-type-tab"),
  amount: document.querySelector("#heavenAmount"),
  tabs: document.querySelectorAll(".heaven-tab"),
  submit: document.querySelector("#submitHeavenButton"),
  recentList: document.querySelector("#heavenRecentList"),
  count: document.querySelector("#heavenCountText"),
  sheetUrlInput: document.querySelector("#sheetUrlInput"),
  saveSheetUrl: document.querySelector("#saveSheetUrlButton"),
  saveStatus: document.querySelector("#saveStatus"),
};

function loadCurrentMonth() {
  state.data = BudgetStore.loadMonth(state.month);
  state.data.heaven = state.data.heaven || [];
}

function save(message = "자동 저장됨") {
  BudgetStore.saveMonth(state.month, state.data);
  els.saveStatus.textContent = message;
}

function renderMode() {
  els.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === state.mode));
  els.submit.textContent = state.mode === "sown" ? "심은 기록 추가" : "거둔 기록 추가";
  els.memo.placeholder = state.mode === "sown" ? "예: 하나님께서 말씀하신 곳" : "예: 하나님이 공급하신 것";
}

function renderAssetTypeTabs(value = els.assetType.value || "현금") {
  els.assetType.value = value;
  els.assetTypeTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.assetType === value);
  });
}

function renderAssetTypeEditButtons(value = "현금") {
  return `
    <div class="asset-type-tabs edit-asset-type-tabs" role="group" aria-label="하늘은행 형태 수정">
      ${["현금", "현물", "서비스"]
        .map(
          (type) => `<button class="asset-type-tab edit-asset-type-tab ${type === value ? "active" : ""}" type="button" data-asset-type="${type}">${type}</button>`,
        )
        .join("")}
    </div>
    <input class="edit-entry-asset-type" type="hidden" value="${value}" />
  `;
}

function renderLedger() {
  const rows = [...(state.data.heaven || [])].sort((a, b) => `${b.date}${b.id}`.localeCompare(`${a.date}${a.id}`));
  els.count.textContent = `${rows.length}건`;
  els.recentList.innerHTML =
    rows.length === 0
      ? `<p class="empty-state">아직 기록이 없어요.</p>`
      : rows
          .map((entry) => {
            const isHarvest = entry.kind === "harvest";
            const label = isHarvest ? "거두기" : "심기";
            const sign = isHarvest ? "-" : "+";
            const assetType = entry.assetType || "현금";
            const actions =
              state.editingHeavenId === entry.id
                ? `
                  <div class="entry-edit-actions">
                    <button class="remove-ledger-button remove-expense-button" type="button" aria-label="기록 삭제">삭제</button>
                    <button class="cancel-entry-edit-button" type="button" aria-label="수정 취소">취소</button>
                  </div>
                `
                : `<button class="edit-entry-button" type="button" aria-label="기록 수정">수정</button>`;
            return `
              <div class="expense-row heaven-entry-row ${state.editingHeavenId === entry.id ? "is-editing-entry" : ""}" data-id="${entry.id}">
                <span>${entry.date.slice(5)}</span>
                <strong><i class="entry-sign ${isHarvest ? "minus" : "plus"}">${sign}</i>${label}<small>${assetType} · ${BudgetStore.escapeHtml(entry.memo || "")}</small></strong>
                <span class="${isHarvest ? "expense-amount" : "income-amount"}">${sign} ${BudgetStore.formatWon(entry.amount)}</span>
                ${actions}
              </div>
              ${state.editingHeavenId === entry.id ? renderHeavenEditForm(entry) : ""}
            `;
          })
          .join("");
}

function renderHeavenEditForm(entry) {
  return `
    <form class="entry-edit-form" data-id="${entry.id}">
      <label>날짜<input class="edit-entry-date" type="date" value="${entry.date || BudgetStore.getToday()}" required /></label>
      <label>
        구분
        <select class="edit-entry-kind">
          <option value="sown" ${entry.kind !== "harvest" ? "selected" : ""}>심기</option>
          <option value="harvest" ${entry.kind === "harvest" ? "selected" : ""}>거두기</option>
        </select>
      </label>
      <label>
        형태
        ${renderAssetTypeEditButtons(entry.assetType || "현금")}
      </label>
      <label>금액<input class="edit-entry-amount" type="number" min="0" inputmode="numeric" value="${BudgetStore.numberValue(entry.amount)}" required /></label>
      <label class="entry-edit-wide">내용<input class="edit-entry-memo" type="text" value="${BudgetStore.escapeHtml(entry.memo || "")}" required /></label>
      <button type="submit">수정 저장</button>
    </form>
  `;
}

function render() {
  els.month.value = state.month;
  els.sheetUrlInput.value = BudgetStore.getSheetUrl();
  renderMode();
  renderAssetTypeTabs();
  renderLedger();
}

function bindEvents() {
  els.month.addEventListener("change", () => {
    state.month = els.month.value || BudgetStore.getCurrentMonth();
    loadCurrentMonth();
    render();
  });

  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      state.mode = tab.dataset.mode;
      renderMode();
      els.memo.focus();
    });
  });

  els.assetTypeTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      renderAssetTypeTabs(tab.dataset.assetType);
    });
  });

  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const entry = {
      id: BudgetStore.makeId(),
      date: els.date.value || BudgetStore.getToday(),
      kind: state.mode,
      item: state.mode === "sown" ? "심은 기록" : "거둔 기록",
      assetType: els.assetType.value || "현금",
      amount: BudgetStore.numberValue(els.amount.value),
      memo: els.memo.value.trim(),
    };

    state.data.heaven.push(entry);
    els.amount.value = "";
    els.memo.value = "";
    save();

    BudgetStore.syncEntry(state.month, "heaven", entry)
      .then((synced) => {
        els.saveStatus.textContent = synced ? "구글시트에 기록됨" : "기기에 기록됨";
      })
      .catch(() => {
        els.saveStatus.textContent = "기기에 기록됨";
      });

    renderLedger();
    els.memo.focus();
  });

  els.recentList.addEventListener("submit", (event) => {
    if (!event.target.classList.contains("entry-edit-form")) return;
    event.preventDefault();
    const form = event.target;
    const entry = (state.data.heaven || []).find((item) => item.id === form.dataset.id);
    if (!entry) return;
    entry.date = form.querySelector(".edit-entry-date").value || BudgetStore.getToday();
    entry.kind = form.querySelector(".edit-entry-kind").value;
    entry.item = entry.kind === "sown" ? "심은 기록" : "거둔 기록";
    entry.assetType = form.querySelector(".edit-entry-asset-type").value || "현금";
    entry.amount = BudgetStore.numberValue(form.querySelector(".edit-entry-amount").value);
    entry.memo = form.querySelector(".edit-entry-memo").value.trim();
    state.editingHeavenId = null;
    save();
    renderLedger();
  });

  els.recentList.addEventListener("click", (event) => {
    if (event.target.classList.contains("edit-asset-type-tab")) {
      const form = event.target.closest(".entry-edit-form");
      form.querySelector(".edit-entry-asset-type").value = event.target.dataset.assetType;
      form.querySelectorAll(".edit-asset-type-tab").forEach((tab) => {
        tab.classList.toggle("active", tab === event.target);
      });
      return;
    }

    const row = event.target.closest(".expense-row");
    if (!row) return;
    if (event.target.classList.contains("edit-entry-button")) {
      state.editingHeavenId = row.dataset.id;
      renderLedger();
      return;
    }
    if (event.target.classList.contains("cancel-entry-edit-button")) {
      state.editingHeavenId = null;
      renderLedger();
      return;
    }
    if (!event.target.classList.contains("remove-ledger-button")) return;
    if (!confirm("이 하늘은행 기록을 삭제할까요?")) return;
    state.data.heaven = state.data.heaven.filter((entry) => entry.id !== row.dataset.id);
    state.editingHeavenId = null;
    save();
    renderLedger();
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
BudgetStore.refreshFromCloud().then((updated) => {
  if (!updated) return;
  loadCurrentMonth();
  render();
  els.saveStatus.textContent = "구글시트에서 불러옴";
});
