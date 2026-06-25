const state = {
  wishes: BudgetStore.loadWishes(),
  editingWishId: null,
};

const els = {
  form: document.querySelector("#wishForm"),
  name: document.querySelector("#wishName"),
  target: document.querySelector("#wishTarget"),
  startDate: document.querySelector("#wishStartDate"),
  dueDate: document.querySelector("#wishDueDate"),
  note: document.querySelector("#wishNote"),
  list: document.querySelector("#wishList"),
  targetTotal: document.querySelector("#wishTargetTotal"),
  savedTotal: document.querySelector("#wishSavedTotal"),
  fulfilledCount: document.querySelector("#wishFulfilledCount"),
};

function saveWishes() {
  BudgetStore.saveWishes(state.wishes);
}

function syncCurrentBudgetWishes() {
  const month = BudgetStore.getCurrentMonth();
  const data = BudgetStore.loadMonth(month);
  BudgetStore.syncWishItems(data);
  BudgetStore.saveMonth(month, data);
}

function today() {
  return BudgetStore.getToday();
}

function getSaved(wish) {
  return (wish.deposits || []).reduce((sum, deposit) => sum + BudgetStore.numberValue(deposit.amount), 0);
}

function getProgress(wish) {
  if (!BudgetStore.numberValue(wish.target)) return 0;
  return Math.min(100, Math.round((getSaved(wish) / BudgetStore.numberValue(wish.target)) * 100));
}

function renderSummary() {
  const activeWishes = state.wishes.filter((wish) => !wish.fulfilledDate);
  const targetTotal = activeWishes.reduce((sum, wish) => sum + BudgetStore.numberValue(wish.target), 0);
  const savedTotal = activeWishes.reduce((sum, wish) => sum + getSaved(wish), 0);
  const fulfilledCount = state.wishes.filter((wish) => wish.fulfilledDate).length;

  els.targetTotal.textContent = BudgetStore.formatWon(targetTotal);
  els.savedTotal.textContent = BudgetStore.formatWon(savedTotal);
  els.fulfilledCount.textContent = `${fulfilledCount}개`;
}

function renderWishes() {
  const sorted = [...state.wishes].sort((a, b) => {
    if (!!a.fulfilledDate !== !!b.fulfilledDate) return a.fulfilledDate ? 1 : -1;
    if (!!a.dueDate !== !!b.dueDate) return a.dueDate ? -1 : 1;
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    return b.startDate.localeCompare(a.startDate);
  });

  els.list.innerHTML =
    sorted.length === 0
      ? `<p class="empty-state">아직 담아둔 요망사항이 없어요.</p>`
      : sorted.map(renderWishCard).join("");
}

function renderWishCard(wish) {
  const saved = getSaved(wish);
  const remaining = Math.max(0, BudgetStore.numberValue(wish.target) - saved);
  const progress = getProgress(wish);
  const dueDate = wish.dueDate ? `<span class="wish-date due">목표기일 ${wish.dueDate}</span>` : "";
  const isEditing = state.editingWishId === wish.id;
  const latestDeposits = [...(wish.deposits || [])]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)
    .map(
      (deposit) => `
        <div class="wish-deposit-row">
          <span>${deposit.date.slice(5)}</span>
          <strong>${BudgetStore.formatWon(deposit.amount)}</strong>
          <small>${BudgetStore.escapeHtml(deposit.memo || "")}</small>
          <button class="remove-wish-deposit-button" type="button" data-deposit-id="${deposit.id}" aria-label="모은 금액 취소">취소</button>
        </div>
      `,
    )
    .join("");

  return `
    <article class="wish-card ${wish.fulfilledDate ? "fulfilled" : ""}" data-id="${wish.id}">
      <div class="wish-card-head">
        <div>
          <span class="wish-date">담은 날 ${wish.startDate}</span>
          ${dueDate}
          <h2>${BudgetStore.escapeHtml(wish.name)}</h2>
        </div>
        <button class="edit-wish-button" type="button" aria-label="요망사항 수정">수정</button>
      </div>
      ${wish.note ? `<p class="wish-note">${BudgetStore.escapeHtml(wish.note)}</p>` : ""}
      ${
        isEditing
          ? `
            <form class="wish-edit-form">
              <label>
                요망사항
                <input class="wish-edit-name" type="text" value="${BudgetStore.escapeHtml(wish.name)}" required />
              </label>
              <label>
                목표 금액
                <input class="wish-edit-target" type="number" min="0" inputmode="numeric" value="${BudgetStore.numberValue(wish.target)}" required />
              </label>
              <label>
                담은 날짜
                <input class="wish-edit-start-date" type="date" value="${wish.startDate || today()}" required />
              </label>
              <label>
                목표기일
                <input class="wish-edit-due-date" type="date" value="${wish.dueDate || ""}" />
              </label>
              <label class="wish-edit-note-wrap">
                메모
                <input class="wish-edit-note" type="text" value="${BudgetStore.escapeHtml(wish.note || "")}" />
              </label>
              <div class="wish-edit-actions">
                <button type="submit">수정 저장</button>
                <button class="cancel-wish-edit-button" type="button">취소</button>
                <button class="remove-wish-button" type="button">삭제</button>
              </div>
            </form>
          `
          : ""
      }
      <div class="wish-progress">
        <span style="width:${progress}%"></span>
      </div>
      <div class="wish-numbers">
        <span>목표 ${BudgetStore.formatWon(wish.target)}</span>
        <span>모음 ${BudgetStore.formatWon(saved)}</span>
        <span>남음 ${BudgetStore.formatWon(remaining)}</span>
      </div>
      <form class="wish-deposit-form">
        <input class="wish-deposit-date" type="date" value="${today()}" aria-label="모은 날짜" />
        <input class="wish-deposit-amount" type="number" min="0" inputmode="numeric" placeholder="이번 달 모은 금액" aria-label="모은 금액" />
        <input class="wish-deposit-memo" type="text" placeholder="메모" aria-label="모은 금액 메모" />
        <button type="submit">담기</button>
      </form>
      <div class="wish-deposit-list">
        ${latestDeposits || `<p class="wish-empty">아직 모은 기록이 없어요.</p>`}
      </div>
      <div class="wish-fulfill">
        ${
          wish.fulfilledDate
            ? `
              <strong>결실일 ${wish.fulfilledDate}</strong>
              <span>${BudgetStore.escapeHtml(wish.fulfilledMemo || "")}</span>
              <button class="undo-fulfill-wish-button" type="button">결실 취소</button>
            `
            : `
              <input class="wish-fulfilled-date" type="date" aria-label="결실일" />
              <input class="wish-fulfilled-memo" type="text" placeholder="예: 구매 완료, 플로잉 받음, 선물 받음" aria-label="결실 메모" />
              <button class="fulfill-wish-button" type="button">결실로 표시</button>
            `
        }
      </div>
    </article>
  `;
}

function render() {
  renderSummary();
  renderWishes();
}

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  state.wishes.push({
    id: BudgetStore.makeId(),
    name: els.name.value.trim(),
    target: BudgetStore.numberValue(els.target.value),
    startDate: els.startDate.value || today(),
    dueDate: els.dueDate.value || "",
    note: els.note.value.trim(),
    deposits: [],
    fulfilledDate: "",
    fulfilledMemo: "",
  });

  els.form.reset();
  els.startDate.value = today();
  saveWishes();
  syncCurrentBudgetWishes();
  render();
});

els.list.addEventListener("submit", (event) => {
  if (event.target.classList.contains("wish-edit-form")) {
    event.preventDefault();
    const card = event.target.closest(".wish-card");
    const wish = state.wishes.find((item) => item.id === card.dataset.id);
    if (!wish) return;
    wish.name = card.querySelector(".wish-edit-name").value.trim();
    wish.target = BudgetStore.numberValue(card.querySelector(".wish-edit-target").value);
    wish.startDate = card.querySelector(".wish-edit-start-date").value || today();
    wish.dueDate = card.querySelector(".wish-edit-due-date").value || "";
    wish.note = card.querySelector(".wish-edit-note").value.trim();
    state.editingWishId = null;
    saveWishes();
    syncCurrentBudgetWishes();
    render();
    return;
  }

  if (!event.target.classList.contains("wish-deposit-form")) return;
  event.preventDefault();
  const card = event.target.closest(".wish-card");
  const wish = state.wishes.find((item) => item.id === card.dataset.id);
  if (!wish) return;

  const amount = BudgetStore.numberValue(card.querySelector(".wish-deposit-amount").value);
  if (amount <= 0) return;

  wish.deposits = wish.deposits || [];
  wish.deposits.push({
    id: BudgetStore.makeId(),
    date: card.querySelector(".wish-deposit-date").value || today(),
    amount,
    memo: card.querySelector(".wish-deposit-memo").value.trim(),
  });

  saveWishes();
  render();
});

els.list.addEventListener("click", (event) => {
  const card = event.target.closest(".wish-card");
  if (!card) return;
  const wish = state.wishes.find((item) => item.id === card.dataset.id);
  if (!wish) return;

  if (event.target.classList.contains("edit-wish-button")) {
    state.editingWishId = state.editingWishId === wish.id ? null : wish.id;
    render();
  }

  if (event.target.classList.contains("cancel-wish-edit-button")) {
    state.editingWishId = null;
    render();
  }

  if (event.target.classList.contains("remove-wish-button")) {
    const saved = getSaved(wish);
    const message = saved > 0
      ? `"${wish.name}"에는 모은 기록 ${BudgetStore.formatWon(saved)}이 있어요. 정말 삭제할까요?`
      : `"${wish.name}" 요망사항을 정말 삭제할까요?`;
    if (!confirm(message)) return;
    state.wishes = state.wishes.filter((item) => item.id !== wish.id);
    saveWishes();
    syncCurrentBudgetWishes();
    render();
  }

  if (event.target.classList.contains("remove-wish-deposit-button")) {
    const deposit = (wish.deposits || []).find((item) => item.id === event.target.dataset.depositId);
    if (!deposit) return;
    if (!confirm(`${BudgetStore.formatWon(deposit.amount)} 모은 기록을 취소할까요?`)) return;
    wish.deposits = (wish.deposits || []).filter((item) => item.id !== deposit.id);
    saveWishes();
    render();
  }

  if (event.target.classList.contains("fulfill-wish-button")) {
    if (!confirm(`"${wish.name}"을 결실로 표시할까요? 이후에도 결실 취소로 되돌릴 수 있어요.`)) return;
    wish.fulfilledDate = card.querySelector(".wish-fulfilled-date").value || today();
    wish.fulfilledMemo = card.querySelector(".wish-fulfilled-memo").value.trim();
    saveWishes();
    syncCurrentBudgetWishes();
    render();
  }

  if (event.target.classList.contains("undo-fulfill-wish-button")) {
    if (!confirm(`"${wish.name}"의 결실 표시를 취소하고 다시 요망사항으로 돌릴까요?`)) return;
    wish.fulfilledDate = "";
    wish.fulfilledMemo = "";
    saveWishes();
    syncCurrentBudgetWishes();
    render();
  }
});

els.startDate.value = today();
render();
