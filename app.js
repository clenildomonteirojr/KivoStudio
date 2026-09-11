 const authScreen = document.querySelector("#auth-screen");
 const authForm = document.querySelector("#auth-form");
 const authToggle = document.querySelector("#auth-toggle");
 const authTitle = document.querySelector("#auth-title");
 const authSubtitle = document.querySelector("#auth-subtitle");
 const authSubmit = document.querySelector("#auth-submit");
 const authError = document.querySelector("#auth-error");
 let registerMode = false;
 let currentUser = null;

 async function api(path, options = {}) {
   let response;
   try {
     response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
   } catch {
     throw new Error("Não foi possível conectar ao servidor. Inicie o Kivo pelo arquivo iniciar-kivo.bat.");
   }

   const body = await response.text();
   let data = {};
   if (body) {
     try {
       data = JSON.parse(body);
     } catch {
       throw new Error("O servidor retornou uma resposta inválida.");
     }
   }

   if (!response.ok) throw new Error(data.error || `O servidor recusou a operação (${response.status}).`);
   return data;
 }

 const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
 const transactionLabels = { income: "Entrada", expense: "Gasto", investment: "Investimento" };

 function renderTransaction(transaction) {
   const isIncome = transaction.type === "income";
   const iconClass = isIncome ? "income-icon" : transaction.type === "investment" ? "invest-icon" : "food-icon";
   const icon = isIncome ? "↓" : transaction.type === "investment" ? "↗" : "⌁";
   const date = new Date(`${transaction.transaction_date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
   const row = document.createElement("div");
   row.className = "transaction";
   row.dataset.transactionId = transaction.id;
   row.innerHTML = `<div class="transaction-icon ${iconClass}">${icon}</div><div class="transaction-info"><strong></strong><span>${date} · ${transactionLabels[transaction.type] || "Lançamento"} · ${transaction.category}</span></div><strong class="transaction-value ${isIncome ? "positive" : ""}">${isIncome ? "+" : "−"} ${money(transaction.amount)}</strong><button class="more-button" aria-label="Excluir lançamento">×</button>`;
   row.querySelector(".transaction-info strong").textContent = transaction.description;
   return row;
 }

 async function loadFinance() {
   if (!transactionList) return;
   try {
     const result = await api("/api/transactions");
     transactionList.innerHTML = "";
     if (!result.transactions.length) {
       transactionList.innerHTML = '<p class="empty-state">Nenhum lançamento registrado ainda.</p>';
     } else {
       result.transactions.forEach((transaction) => transactionList.appendChild(renderTransaction(transaction)));
     }
     const { income = 0, expense = 0, investment = 0 } = result.totals || {};
     document.querySelector("#income-value").textContent = money(income);
     document.querySelector("#expense-value").textContent = money(expense);
     document.querySelector("#investment-value").textContent = money(investment);
     document.querySelector("#balance-value").textContent = money(income - expense - investment);
     document.querySelector("#balance-income").textContent = money(income);
   } catch (error) {
     transactionList.innerHTML = `<p class="empty-state">${error.message}</p>`;
   }
 }
 function setAuthMode() {
   if (!authTitle || !authSubtitle || !authSubmit || !authToggle || !authForm) return;
   authTitle.textContent = registerMode ? "Criar sua conta" : "Entrar no Kivo";
   authSubtitle.textContent = registerMode ? "Use um código de convite para criar sua conta." : "Acesse seus dados salvos com segurança.";
   authSubmit.textContent = registerMode ? "Criar conta" : "Entrar";
   authToggle.textContent = registerMode ? "Já tenho uma conta" : "Ainda não tenho uma conta";
   authForm.querySelectorAll(".register-field").forEach((field) => { field.hidden = !registerMode; });
   if (authForm.elements.confirm_password) authForm.elements.confirm_password.required = registerMode;
   authForm.elements.password.autocomplete = registerMode ? "new-password" : "current-password";
 }

 async function authenticate(event) {
   event.preventDefault();
   authError.textContent = "";
   const data = Object.fromEntries(new FormData(authForm));
   if (!registerMode) {
     delete data.invite_code;
     delete data.confirm_password;
   }
   try {
     const result = await api(registerMode ? "/api/register" : "/api/login", { method: "POST", body: JSON.stringify(data) });
     currentUser = result.user;
     authScreen.hidden = true;
     document.querySelectorAll(".profile-copy strong").forEach((item) => { item.textContent = `Olá, ${currentUser.username}`; });
     await Promise.all([loadTasks(), loadFinance()]);
   } catch (error) {
     authError.textContent = error.message;
   }
 }

 if (authToggle && authForm) {
   authToggle.addEventListener("click", () => { registerMode = !registerMode; if (authForm) authForm.reset(); setAuthMode(); });
 }
 if (authForm) authForm.addEventListener("submit", authenticate);
 document.querySelectorAll(".period-button").forEach((button) => {
   button.addEventListener("click", () => {
     document.querySelectorAll(".period-button").forEach((item) => item.classList.toggle("active", item === button));
     showToast(`Período: ${button.textContent.trim()}`);
   });
 });
 setAuthMode();

 const logoutButton = document.querySelector("#logout-button");
 if (logoutButton) {
   logoutButton.addEventListener("click", async () => {
     try {
       await api("/api/logout", { method: "POST" });
     } catch (error) {
       if (authError) authError.textContent = error.message;
       return;
     }
     currentUser = null;
     if (authForm) authForm.reset();
     registerMode = false;
     setAuthMode();
     if (authScreen) authScreen.hidden = false;
   });
 }

 const navItems = document.querySelectorAll(".nav-item");
const views = document.querySelectorAll(".view");
const breadcrumbTitle = document.querySelector("#breadcrumb-title");
const sidebar = document.querySelector(".sidebar");
const mobileMenu = document.querySelector(".mobile-menu");
const toast = document.querySelector("#toast");
const modal = document.querySelector("#transaction-modal");
const taskModal = document.querySelector("#task-modal");
const transactionList = document.querySelector("#transaction-list");
const taskForm = document.querySelector("#task-form");
const taskModalTitle = document.querySelector("#task-modal-title");
const taskModalEyebrow = document.querySelector("#task-modal-eyebrow");
const taskSubmitButton = document.querySelector("#task-submit-button");

const viewTitles = { finance: "Finanças", kanban: "Quadro Kanban", courses: "Meus cursos", settings: "Configurações" };

function switchView(viewName) {
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.view === viewName));
  views.forEach((view) => view.classList.toggle("active-view", view.id === `${viewName}-view`));
  breadcrumbTitle.textContent = viewTitles[viewName];
  sidebar.classList.remove("open");
}

navItems.forEach((item) => item.addEventListener("click", () => switchView(item.dataset.view)));
mobileMenu.addEventListener("click", () => sidebar.classList.toggle("open"));

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2800);
}

function openModal(type = "expense") {
  if (!modal) return;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  const typeField = modal.querySelector('[name="type"]');
  if (typeField) typeField.value = type;
  const firstField = modal.querySelector("input");
  if (firstField) firstField.focus();
}

function closeModal() {
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

let taskBeingEdited = null;

function openTaskModal(card = null) {
  taskBeingEdited = card;
  taskModal.classList.add("open");
  taskModal.setAttribute("aria-hidden", "false");
  taskModalTitle.textContent = card ? "Editar tarefa" : "Adicionar tarefa";
  taskModalEyebrow.textContent = card ? "EDITAR CARTÃO" : "NOVO CARTÃO";
  taskSubmitButton.textContent = card ? "Salvar alterações" : "Adicionar ao quadro";
  if (card) {
    taskForm.elements.title.value = card.querySelector("h4").textContent;
    taskForm.elements.category.value = card.querySelector(".tag").className.match(/tag-(blue|purple|green|orange|pink)/)?.[1] || "blue";
    taskForm.elements.deadline.value = card.querySelector(".task-date").textContent.replace(/^[◷✓]\s*/, "");
  }
  taskModal.querySelector("input").focus();
}

function closeTaskModal() {
  if (taskModal) {
    taskModal.classList.remove("open");
    taskModal.setAttribute("aria-hidden", "true");
  }
  taskBeingEdited = null;
  if (taskForm) taskForm.reset();
  if (taskModalTitle) taskModalTitle.textContent = "Adicionar tarefa";
  if (taskModalEyebrow) taskModalEyebrow.textContent = "NOVO CARTÃO";
  if (taskSubmitButton) taskSubmitButton.textContent = "Adicionar ao quadro";
}

const addTransactionButton = document.querySelector("#add-transaction-button");
const quickExpenseButton = document.querySelector("#quick-expense");
const quickIncomeButton = document.querySelector("#quick-income");
const modalCloseButton = document.querySelector("[data-close-modal]");
const taskCloseButton = document.querySelector("[data-close-task-modal]");

if (addTransactionButton) addTransactionButton.addEventListener("click", () => openModal("expense"));
if (quickExpenseButton) quickExpenseButton.addEventListener("click", () => openModal("expense"));
if (quickIncomeButton) quickIncomeButton.addEventListener("click", () => openModal("income"));
if (modalCloseButton) modalCloseButton.addEventListener("click", closeModal);
if (modal) modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});
if (taskCloseButton) taskCloseButton.addEventListener("click", closeTaskModal);
if (taskModal) taskModal.addEventListener("click", (event) => {
  if (event.target === taskModal) closeTaskModal();
});

const transactionForm = document.querySelector("#transaction-form");
if (transactionForm) {
  const transactionDateField = transactionForm.querySelector('[name="transaction_date"]');
  if (transactionDateField) transactionDateField.value = new Date().toISOString().slice(0, 10);

  transactionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      await api("/api/transactions", { method: "POST", body: JSON.stringify(Object.fromEntries(formData)) });
      closeModal();
      if (form && typeof form.reset === "function") form.reset();
      if (transactionDateField) transactionDateField.value = new Date().toISOString().slice(0, 10);
      await loadFinance();
      showToast("Lançamento adicionado com sucesso.");
    } catch (error) {
      showToast(error.message);
    }
  });
}

if (transactionList) {
  transactionList.addEventListener("click", async (event) => {
    const button = event.target.closest(".more-button");
    if (!button) return;
    const row = button.closest(".transaction");
    if (!row?.dataset.transactionId) return;
    if (!window.confirm("Excluir este lançamento?")) return;
    try {
      await api(`/api/transactions/${row.dataset.transactionId}`, { method: "DELETE" });
      await loadFinance();
      showToast("Lançamento excluído.");
    } catch (error) {
      showToast(error.message);
    }
  });
}

function createTaskCard(title, category = "blue", deadline = "Hoje") {
  const card = document.createElement("article");
  card.className = "task-card";
  card.draggable = true;
  const labels = { blue: "Planejamento", purple: "Estudos", green: "Finanças", orange: "Pessoal", pink: "Projeto" };
  card.innerHTML = `<div class="task-card-top"><span class="tag tag-${category}">${labels[category]}</span><div class="task-actions"><button type="button" data-task-action="edit" aria-label="Editar tarefa">✎</button><button type="button" data-task-action="complete" aria-label="Concluir tarefa">✓</button><button type="button" data-task-action="delete" aria-label="Excluir tarefa">×</button></div></div><h4></h4><div class="task-card-footer"><span class="task-date">◷ ${deadline}</span><div class="assignee avatar avatar-tiny">VS</div></div>`;
  card.querySelector("h4").textContent = title.trim();
  const list = document.querySelector('[data-status="todo"]');
  list.appendChild(card);
  makeDraggable(card);
  return card;
}

function renderTask(task) {
  const card = createTaskCard(task.title, task.category, task.deadline);
  card.dataset.taskId = task.id;
  if (task.status === "done") {
    document.querySelector('[data-status="done"]').appendChild(card);
    card.classList.add("completed");
    card.querySelector(".task-date").textContent = "✓ Concluído";
    card.querySelector('[data-task-action="complete"]').setAttribute("aria-label", "Reabrir tarefa");
  }
}

async function loadTasks() {
  const result = await api("/api/tasks");
  document.querySelectorAll(".task-list").forEach((list) => { list.innerHTML = ""; });
  result.tasks.forEach(renderTask);
  updateTaskCounts();
}

document.querySelector("#add-task-button").addEventListener("click", () => openTaskModal());

if (taskForm) {
  taskForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const title = String(formData.get("title") || "").trim();
    const category = formData.get("category");
    const deadline = formData.get("deadline");
    if (!title) {
      showToast("Informe um título para a tarefa.");
      return;
    }
    if (taskBeingEdited) {
      const labels = { blue: "Planejamento", purple: "Estudos", green: "Finanças", orange: "Pessoal", pink: "Projeto" };
      await api(`/api/tasks/${taskBeingEdited.dataset.taskId}`, { method: "PATCH", body: JSON.stringify({ title, category, deadline }) });
      taskBeingEdited.querySelector("h4").textContent = title;
      taskBeingEdited.querySelector(".tag").className = `tag tag-${category}`;
      taskBeingEdited.querySelector(".tag").textContent = labels[category];
      taskBeingEdited.querySelector(".task-date").textContent = taskBeingEdited.classList.contains("completed") ? "✓ Concluído" : `◷ ${deadline}`;
      showToast("Tarefa atualizada.");
    } else {
      const result = await api("/api/tasks", { method: "POST", body: JSON.stringify({ title, category, deadline }) });
      const card = createTaskCard(title, category, deadline);
      card.dataset.taskId = result.id;
      showToast("Tarefa adicionada ao quadro.");
    }
    closeTaskModal();
    updateTaskCounts();
  });
}

let draggedCard = null;
function makeDraggable(card) {
  card.addEventListener("dragstart", () => {
    draggedCard = card;
    card.classList.add("dragging");
  });
  card.addEventListener("dragend", () => {
    draggedCard = null;
    card.classList.remove("dragging");
  });
}

function updateBalance(delta) {
  const balance = document.querySelector("#balance-value");
  const current = Number(balance.textContent.replace(/[^\d,-]/g, "").replace(/\./g, "").replace(",", "."));
  balance.textContent = (current + delta).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function updateTaskCounts() {
  const allTasks = document.querySelectorAll(".task-card");
  const navCount = document.querySelector('.nav-item[data-view="kanban"] .nav-count');
  if (navCount) navCount.textContent = allTasks.length;
  document.querySelectorAll(".kanban-column").forEach((column) => {
    const list = column.querySelector(".task-list");
    const count = column.querySelector(".task-count");
    if (list && count) count.textContent = list.children.length;
  });
}

document.querySelectorAll(".task-card").forEach(makeDraggable);
document.querySelectorAll(".task-card").forEach((card) => {
  const oldButton = card.querySelector(".task-card-top > button");
  if (oldButton) oldButton.remove();
  const actions = document.createElement("div");
  actions.className = "task-actions";
  actions.innerHTML = '<button type="button" data-task-action="edit" aria-label="Editar tarefa">✎</button><button type="button" data-task-action="complete" aria-label="Concluir tarefa">✓</button><button type="button" data-task-action="delete" aria-label="Excluir tarefa">×</button>';
  card.querySelector(".task-card-top").appendChild(actions);
  if (card.classList.contains("completed")) {
    actions.querySelector('[data-task-action="complete"]').setAttribute("aria-label", "Reabrir tarefa");
  }
});
document.querySelectorAll(".task-list").forEach((list) => {
  list.addEventListener("dragover", (event) => event.preventDefault());
  list.addEventListener("drop", () => {
    if (!draggedCard) return;
    list.appendChild(draggedCard);
    updateTaskCounts();
    showToast("Tarefa movida.");
  });
});

document.querySelectorAll(".add-card-button").forEach((button) => {
  button.addEventListener("click", () => {
    openTaskModal();
  });
});

document.querySelectorAll(".toggle input").forEach((toggle) => {
  toggle.addEventListener("change", () => showToast(toggle.checked ? "Preferência ativada." : "Preferência desativada."));
});

document.querySelectorAll(".workspace-switcher .icon-button, .notification").forEach((button) => {
  button.addEventListener("click", () => showToast(button.classList.contains("notification") ? "Você não tem novas notificações." : "Você já está no workspace pessoal."));
});

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "income") openModal("income");
    if (action === "expense") openModal("expense");
    if (action === "investment") openModal("investment");
    if (action === "note") {
      const note = window.prompt("Qual nota você quer registrar?");
      if (note && note.trim()) showToast("Nota salva com sucesso.");
    }
    if (action === "add-course") {
      const course = window.prompt("Nome do curso:");
      if (course && course.trim()) showToast(`Curso "${course.trim()}" adicionado.`);
    }
    if (action === "edit-profile") {
      const name = window.prompt("Como você quer ser chamada?", "Vitória");
      if (name && name.trim()) {
        document.querySelectorAll(".profile-copy strong").forEach((element) => {
          element.textContent = `Olá, ${name.trim()}`;
        });
        showToast("Perfil atualizado.");
      }
    }
  });
});

document.querySelectorAll(".text-button").forEach((button) => {
  if (button.id === "auth-toggle") return;
  button.addEventListener("click", () => showToast(`${button.textContent.replace("→", "").trim()} em breve.`));
});

const createGoalButton = document.querySelector("#create-goal-button");
if (createGoalButton) {
  createGoalButton.addEventListener("click", () => {
    const goal = window.prompt("Nome da nova meta:");
    if (goal && goal.trim()) showToast(`Meta "${goal.trim()}" criada.`);
  });
}

document.querySelectorAll(".board-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".board-tab").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    showToast(`Aba "${tab.textContent}" selecionada.`);
  });
});

const filterButton = document.querySelector(".filter-button");
if (filterButton) {
  filterButton.addEventListener("click", () => {
    const overdue = [...document.querySelectorAll(".task-card")].filter((card) => card.querySelector(".overdue"));
    const shouldHide = overdue.some((card) => card.hidden === false);
    document.querySelectorAll(".task-card").forEach((card) => {
      card.hidden = shouldHide && !card.querySelector(".overdue");
    });
    showToast(shouldHide ? "Mostrando tarefas prioritárias." : "Mostrando todas as tarefas.");
  });
}

document.querySelectorAll(".round-arrow").forEach((button) => {
  button.addEventListener("click", () => showToast(`Abrindo próxima aula: ${button.closest(".course-card").querySelector(".course-footer span").textContent.replace("Próxima aula: ", "")}.`));
});

function handleMoreButton(button, event) {
    event.stopPropagation();
    const item = button.closest(".transaction, .task-card, .kanban-column");
    const name = item?.querySelector("strong, h4, h3")?.textContent || "item";
    if (window.confirm(`Remover ${name}?`)) {
      if (item.classList.contains("transaction") || item.classList.contains("task-card")) {
        item.remove();
        updateTaskCounts();
        showToast("Item removido.");
      } else {
        showToast("Ações da coluna disponíveis em breve.");
      }
    }
}

const transactionListPanel = document.querySelector(".transaction-list");
if (transactionListPanel) {
  transactionListPanel.addEventListener("click", (event) => {
    const button = event.target.closest(".more-button");
    if (button) handleMoreButton(button, event);
  });
}

const kanbanBoard = document.querySelector(".kanban-board");
if (kanbanBoard) {
  kanbanBoard.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-task-action]");
    if (!actionButton) return;
    event.stopPropagation();
    const card = actionButton.closest(".task-card");
    const action = actionButton.dataset.taskAction;
    if (action === "edit") {
      openTaskModal(card);
      return;
    }
    if (action === "delete") {
      const title = card.querySelector("h4").textContent;
      if (window.confirm(`Excluir a tarefa "${title}"?`)) {
        api(`/api/tasks/${card.dataset.taskId}`, { method: "DELETE" }).then(() => {
          card.remove();
          updateTaskCounts();
          showToast("Tarefa excluída.");
        }).catch((error) => showToast(error.message));
      }
      return;
    }
    const destination = card.closest('[data-status="done"]') ? "todo" : "done";
    api(`/api/tasks/${card.dataset.taskId}`, { method: "PATCH", body: JSON.stringify({ status: destination }) }).then(() => {
      document.querySelector(`[data-status="${destination}"]`).appendChild(card);
      card.classList.toggle("completed", destination === "done");
      const date = card.querySelector(".task-date");
      date.textContent = destination === "done" ? "✓ Concluído" : "◷ Hoje";
      actionButton.setAttribute("aria-label", destination === "done" ? "Reabrir tarefa" : "Concluir tarefa");
      updateTaskCounts();
      showToast(destination === "done" ? "Tarefa concluída." : "Tarefa reaberta.");
    }).catch((error) => showToast(error.message));
  });
}

if (authScreen) authScreen.hidden = false;

const searchTasksButton = document.querySelector(".toolbar-actions .icon-button");
if (searchTasksButton) {
  searchTasksButton.addEventListener("click", () => {
    const term = window.prompt("Buscar tarefa:");
    if (term === null) return;
    const normalizedTerm = term.trim().toLowerCase();
    document.querySelectorAll(".task-card").forEach((card) => {
      card.hidden = normalizedTerm !== "" && !card.textContent.toLowerCase().includes(normalizedTerm);
    });
    showToast(normalizedTerm ? `Busca por "${term.trim()}".` : "Busca limpa.");
  });
}
