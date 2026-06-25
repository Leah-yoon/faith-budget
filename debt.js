const state = {
  plans: BudgetStore.loadDebtPlans(),
  editingPlanId: null,
  draggingPlanId: null,
};

const els = {
  addPanel: document.querySelector("#debtAddPanel"),
  formSummary: document.querySelector("#debtFormSummary"),
  form: document.querySelector("#debtPlanForm"),
  kind: document.querySelector("#debtKind"),
  name: document.querySelector("#debtName"),
  total: document.querySelector("#debtTotal"),
  required: document.querySelector("#debtRequired"),
  startMonth: document.querySelector("#debtStartMonth"),
  dueDate: document.querySelector("#debtDueDate"),
  submit: document.querySelector("#submitDebtPlanButton"),
  cancelEdit: document.querySelector("#cancelDebtEditButton"),
  deletePlan: document.querySelector("#deleteDebtPlanButton"),
  list: document.querySelector("#debtPlanList"),
  overview: document.querySelector("#debtOverview"),
  debtRemainingTotal: document.querySelector("#debtRemainingTotal"),
  requiredThisMonthTotal: document.querySelector("#requiredThisMonthTotal"),
  savingTargetTotal: document.querySelector("#savingTargetTotal"),
};

function currentMonth() {
  return BudgetStore.getCurrentMonth();
}

function isLocked() {
  return Boolean(BudgetStore.loadMonth(currentMonth()).closed);
}

function savePlans() {
  BudgetStore.saveDebtPlans(state.plans);
}

function addMonths(month, count) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + count, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthDiff(startMonth, endMonth) {
  const [startYear, start] = startMonth.split("-").map(Number);
  const [endYear, end] = endMonth.split("-").map(Number);
  return (endYear - startYear) * 12 + (end - start);
}

function getPlanMonths(plan) {
  const endMonth = plan.dueDate ? addMonths(plan.dueDate.slice(0, 7), 3) : addMonths(currentMonth(), 35);
  const count = Math.max(12, monthDiff(plan.startMonth, endMonth) + 1);
  return Array.from({ length: count }, (_, index) => addMonths(plan.startMonth, index));
}

function isPlanActiveInMonth(plan, month) {
  if (month < plan.startMonth) return false;
  if (!plan.dueDate) return true;
  return month <= addMonths(plan.dueDate.slice(0, 7), 3);
}

function getRecord(plan, month) {
  plan.records = plan.records || {};
  plan.records[month] = plan.records[month] || { requiredPaid: false, requiredAmount: plan.requiredMonthly || 0, amount: 0 };
  if (plan.records[month].requiredAmount === undefined) {
    plan.records[month].requiredAmount = plan.requiredMonthly || 0;
  }
  return plan.records[month];
}

function getPaidTotal(plan) {
  return Object.values(plan.records || {}).reduce((sum, record) => sum + BudgetStore.numberValue(record.amount), 0);
}

function getRemaining(plan) {
  return Math.max(0, BudgetStore.numberValue(plan.total) - getPaidTotal(plan));
}

function renderSummary() {
  const debtRemaining = state.plans
    .filter((plan) => plan.kind === "debt")
    .reduce((sum, plan) => sum + getRemaining(plan), 0);
  const requiredThisMonth = state.plans.reduce((sum, plan) => {
    const record = getRecord(plan, currentMonth());
    return record.requiredPaid ? sum : sum + BudgetStore.numberValue(record.requiredAmount);
  }, 0);
  const savingTarget = state.plans
    .filter((plan) => plan.kind === "saving")
    .reduce((sum, plan) => sum + BudgetStore.numberValue(plan.total), 0);

  els.debtRemainingTotal.textContent = BudgetStore.formatWon(debtRemaining);
  els.requiredThisMonthTotal.textContent = BudgetStore.formatWon(requiredThisMonth);
  els.savingTargetTotal.textContent = BudgetStore.formatWon(savingTarget);
}

function renderPlans() {
  renderOverview();
  els.list.innerHTML =
    state.plans.length === 0
      ? `<p class="empty-state">아직 추가한 부채나 적금 계획이 없어요.</p>`
      : renderExecutionTable();
  renderLockState();
}

function renderLockState() {
  const locked = isLocked();
  [...els.form.elements].forEach((element) => {
    element.disabled = locked;
  });
  els.list.querySelectorAll("input, button").forEach((element) => {
    element.disabled = locked || element.disabled;
  });
}

function resetPlanForm() {
  state.editingPlanId = null;
  els.form.reset();
  els.startMonth.value = currentMonth();
  els.formSummary.textContent = "계획 추가";
  els.submit.textContent = "실행서에 추가";
  els.cancelEdit.hidden = true;
  els.deletePlan.hidden = true;
}

function startEditPlan(plan) {
  state.editingPlanId = plan.id;
  els.kind.value = plan.kind;
  els.name.value = plan.name || "";
  els.total.value = plan.total || "";
  els.required.value = plan.requiredMonthly || "";
  els.startMonth.value = plan.startMonth || currentMonth();
  els.dueDate.value = plan.dueDate || "";
  els.formSummary.textContent = "계획 수정";
  els.submit.textContent = "수정 저장";
  els.cancelEdit.hidden = false;
  els.deletePlan.hidden = false;
  els.addPanel.open = true;
  els.name.focus();
}

function renderOverview() {
  els.overview.innerHTML =
    state.plans.length === 0
      ? ""
      : `
        <div class="debt-overview-wrap">
          <table class="debt-overview-table">
            <thead>
              <tr>
                <th>구분</th>
                <th>내용</th>
                <th>총액</th>
                <th>실행</th>
                <th>남음</th>
                <th>진행</th>
                <th>목표일</th>
                <th>이번 달</th>
              </tr>
            </thead>
            <tbody>
              ${state.plans.map(renderOverviewRow).join("")}
            </tbody>
          </table>
        </div>
      `;
}

function renderOverviewRow(plan) {
  const paid = getPaidTotal(plan);
  const remaining = getRemaining(plan);
  const progress = BudgetStore.numberValue(plan.total) ? Math.min(100, Math.round((paid / BudgetStore.numberValue(plan.total)) * 100)) : 0;
  const currentRecord = getRecord(plan, currentMonth());
  const label = plan.kind === "debt" ? "상환" : "저축";
  const monthRequired = plan.requiredMonthly ? (currentRecord.requiredPaid ? "이자 완료" : "이자 체크 전") : "-";

  return `
    <tr class="${plan.kind}">
      <td><span class="overview-kind">${plan.kind === "debt" ? "부채" : "적금"}</span></td>
      <td class="overview-name">${BudgetStore.escapeHtml(plan.name)}</td>
      <td>${BudgetStore.formatWon(plan.total)}</td>
      <td>${BudgetStore.formatWon(paid)} <small>${label}</small></td>
      <td>${BudgetStore.formatWon(remaining)}</td>
      <td>
        <div class="debt-overview-progress" aria-label="${progress}%">
          <span style="width:${progress}%"></span>
        </div>
        <strong>${progress}%</strong>
      </td>
      <td>${plan.dueDate ? formatDate(plan.dueDate) : "-"}</td>
      <td>${monthRequired}</td>
    </tr>
  `;
}

function renderExecutionTable() {
  const months = getAllMonths();
  const planHeaders = state.plans
    .map(
      (plan) => `
        <th colspan="2" class="${plan.kind} debt-plan-draggable" data-plan-id="${plan.id}">
          <div class="debt-table-title">
            <span class="drag-plan-handle" draggable="true" title="드래그로 순서 이동" aria-label="드래그로 순서 이동">↔</span>
            <span class="debt-plan-kind">${plan.kind === "debt" ? "부채" : "적금"}</span>
            <strong>${BudgetStore.escapeHtml(plan.name)}</strong>
            <small>
              ${BudgetStore.formatWon(plan.total)}
              ${plan.dueDate ? ` · 목표 ${formatDate(plan.dueDate)}` : ""}
              ${plan.requiredMonthly ? ` · 이자: 월 ${BudgetStore.formatWon(plan.requiredMonthly)}` : " · 이자 없음"}
            </small>
            <div class="debt-plan-actions">
              <button class="edit-plan-button" type="button" data-plan-id="${plan.id}" aria-label="${plan.name} 수정">수정</button>
            </div>
          </div>
        </th>
      `,
    )
    .join("");
  const subHeaders = state.plans
    .map(() => `<th>넣은/갚은 금액</th><th>남은 금액</th>`)
    .join("");
  const bodyRows = months.map((month, index) => renderMonthRow(month, index)).join("");

  return `
    <div class="debt-execution-wrap">
      <table class="debt-execution-table">
        <thead>
          <tr>
            <th rowspan="2" class="month-head">월</th>
            ${planHeaders}
          </tr>
          <tr>${subHeaders}</tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `;
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${Number(year.slice(2))}.${Number(month)}.${Number(day)}`;
}

function getAllMonths() {
  const monthSet = new Set();
  state.plans.forEach((plan) => {
    getPlanMonths(plan).forEach((month) => monthSet.add(month));
  });
  return [...monthSet].sort();
}

function getBalanceUntil(plan, month) {
  const months = getPlanMonths(plan).filter((item) => item <= month).sort();
  const paid = months.reduce((total, item) => total + BudgetStore.numberValue(getRecord(plan, item).amount), 0);
  return Math.max(0, BudgetStore.numberValue(plan.total) - paid);
}

function isCompleteBefore(plan, month) {
  const months = getPlanMonths(plan).filter((item) => item < month).sort();
  if (months.length === 0) return false;
  const paid = months.reduce((total, item) => total + BudgetStore.numberValue(getRecord(plan, item).amount), 0);
  return BudgetStore.numberValue(plan.total) > 0 && paid >= BudgetStore.numberValue(plan.total);
}

function renderMonthRow(month, index) {
  const cells = state.plans
    .map((plan) => {
      const isInactiveAfterEnd = (plan.dueDate && month > plan.dueDate.slice(0, 7)) || isCompleteBefore(plan, month);
      if (isInactiveAfterEnd) {
        return `
          <td class="due-passed-cell"></td>
          <td class="due-passed-cell"></td>
        `;
      }

      if (!isPlanActiveInMonth(plan, month)) {
        return `<td class="inactive-cell"></td><td class="inactive-cell"></td>`;
      }

      const record = getRecord(plan, month);
      const balance = getBalanceUntil(plan, month);
      return `
        <td>
          <label class="payment-input-wrap">
            <input class="required-paid-input" data-plan-id="${plan.id}" data-month="${month}" type="checkbox" ${record.requiredPaid ? "checked" : ""} />
            <input class="month-paid-input" data-plan-id="${plan.id}" data-month="${month}" type="number" min="0" inputmode="numeric" value="${record.amount || ""}" aria-label="${plan.name} ${month} 실행금액" />
          </label>
        </td>
        <td><strong>${BudgetStore.formatWon(balance)}</strong></td>
      `;
    })
    .join("");

  return `
    <tr>
      <th>${index + 1}개월<br /><small>${month}</small></th>
      ${cells}
    </tr>
  `;
}

function render() {
  renderSummary();
  renderPlans();
}

function movePlanBefore(planId, targetPlanId) {
  if (!planId || !targetPlanId || planId === targetPlanId) return false;
  const currentIndex = state.plans.findIndex((item) => item.id === planId);
  const targetIndex = state.plans.findIndex((item) => item.id === targetPlanId);
  if (currentIndex < 0 || targetIndex < 0) return false;
  const [plan] = state.plans.splice(currentIndex, 1);
  state.plans.splice(targetIndex, 0, plan);
  return true;
}

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (isLocked()) return;
  const values = {
    kind: els.kind.value,
    name: els.name.value.trim(),
    total: BudgetStore.numberValue(els.total.value),
    requiredMonthly: BudgetStore.numberValue(els.required.value),
    startMonth: els.startMonth.value || currentMonth(),
    dueDate: els.dueDate.value,
  };

  if (state.editingPlanId) {
    const plan = state.plans.find((item) => item.id === state.editingPlanId);
    if (plan) Object.assign(plan, values);
  } else {
    state.plans.push({
      id: BudgetStore.makeId(),
      ...values,
      records: {},
    });
  }

  resetPlanForm();
  savePlans();
  render();
});

els.cancelEdit.addEventListener("click", resetPlanForm);

els.deletePlan.addEventListener("click", () => {
  if (isLocked() || !state.editingPlanId) return;
  const plan = state.plans.find((item) => item.id === state.editingPlanId);
  if (!plan) return;
  if (!confirm(`"${plan.name}" 계획을 삭제할까요? 입력한 진행 기록도 같이 삭제돼요.`)) return;
  state.plans = state.plans.filter((item) => item.id !== state.editingPlanId);
  resetPlanForm();
  savePlans();
  render();
});

els.list.addEventListener("change", (event) => {
  if (isLocked()) return;
  const planId = event.target.dataset.planId;
  const month = event.target.dataset.month;
  if (!planId || !month) return;
  const plan = state.plans.find((item) => item.id === planId);
  if (!plan) return;
  const record = getRecord(plan, month);

  if (event.target.classList.contains("required-paid-input")) {
    record.requiredPaid = event.target.checked;
  }

  if (event.target.classList.contains("month-paid-input")) {
    record.amount = BudgetStore.numberValue(event.target.value);
  }

  savePlans();
  render();
});

els.list.addEventListener("click", (event) => {
  if (isLocked()) return;
  if (event.target.classList.contains("edit-plan-button")) {
    const plan = state.plans.find((item) => item.id === event.target.dataset.planId);
    if (!plan) return;
    startEditPlan(plan);
  }
});

els.list.addEventListener("dragstart", (event) => {
  if (isLocked()) return;
  if (!event.target.classList.contains("drag-plan-handle")) return;
  const header = event.target.closest(".debt-plan-draggable");
  if (!header) return;
  state.draggingPlanId = header.dataset.planId;
  header.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", header.dataset.planId);
});

els.list.addEventListener("dragover", (event) => {
  if (!state.draggingPlanId) return;
  const header = event.target.closest(".debt-plan-draggable");
  if (!header) return;
  event.preventDefault();
  header.classList.add("is-drag-over");
});

els.list.addEventListener("dragleave", (event) => {
  const header = event.target.closest(".debt-plan-draggable");
  if (header) header.classList.remove("is-drag-over");
});

els.list.addEventListener("drop", (event) => {
  if (!state.draggingPlanId) return;
  const header = event.target.closest(".debt-plan-draggable");
  if (!header) return;
  event.preventDefault();
  if (movePlanBefore(state.draggingPlanId, header.dataset.planId)) {
    savePlans();
    render();
  }
});

els.list.addEventListener("dragend", () => {
  state.draggingPlanId = null;
  els.list.querySelectorAll(".is-dragging, .is-drag-over").forEach((item) => {
    item.classList.remove("is-dragging", "is-drag-over");
  });
});

resetPlanForm();
render();
BudgetStore.refreshFromCloud().then((updated) => {
  if (!updated) return;
  state.plans = BudgetStore.loadDebtPlans();
  resetPlanForm();
  render();
});
