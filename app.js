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
 let financeTransactions = [];
 let activeFinancePeriod = "month";
 let activeFinanceTypeFilter = "all";
 let activeFinanceCategoryFilter = "all";

 function parseTransactionDate(dateString) {
   if (!dateString) return new Date(0);
   const parsed = new Date(`${dateString}T12:00:00`);
   return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
 }

 function getTransactionsForPeriod(period, transactions = financeTransactions) {
   const now = new Date();
   const days = { today: 1, week: 7, month: 30, "3months": 90, "6months": 180, year: 365 }[period] || 30;
   const cutoff = new Date(now);
   cutoff.setDate(now.getDate() - days);
   return transactions.filter((transaction) => parseTransactionDate(transaction.transaction_date) >= cutoff);
 }

 function populateFinanceCategoryFilter(transactions = financeTransactions) {
   const categoryFilter = document.querySelector("#finance-category-filter");
   if (!categoryFilter) return;
   const categories = [...new Set((transactions || []).map((transaction) => transaction.category || "Outros"))].sort();
   const previousValue = categories.includes(activeFinanceCategoryFilter) ? activeFinanceCategoryFilter : "all";
   categoryFilter.innerHTML = `<option value="all">Todas</option>${categories.map((category) => `<option value="${category}">${category}</option>`).join("")}`;
   activeFinanceCategoryFilter = previousValue;
   categoryFilter.value = previousValue;
 }

 function getVisibleFinanceTransactions() {
   const periodTransactions = getTransactionsForPeriod(activeFinancePeriod, financeTransactions);
   const byType = activeFinanceTypeFilter === "all" ? periodTransactions : periodTransactions.filter((transaction) => transaction.type === activeFinanceTypeFilter);
   if (activeFinanceCategoryFilter === "all") return byType;
   return byType.filter((transaction) => (transaction.category || "Outros") === activeFinanceCategoryFilter);
 }

 function renderRecurringExpenses(transactions = []) {
   const panel = document.querySelector("#recurring-panel");
   if (!panel) return;

   const windowStart = new Date();
   windowStart.setMonth(windowStart.getMonth() - 6);
   const recurringMap = new Map();

   transactions
     .filter((transaction) => transaction.type === "expense" && parseTransactionDate(transaction.transaction_date) >= windowStart)
     .forEach((transaction) => {
       const key = `${(transaction.category || "Outros").toLowerCase()}::${(transaction.description || "Outros").trim().toLowerCase()}`;
       const entry = recurringMap.get(key) || {
         description: transaction.description || "Despesa",
         category: transaction.category || "Outros",
         count: 0,
         total: 0,
         amount: Number(transaction.amount || 0)
       };

       entry.count += 1;
       entry.total += Number(transaction.amount || 0);
       if (!entry.amount || Number(transaction.amount || 0) > entry.amount) entry.amount = Number(transaction.amount || 0);
       recurringMap.set(key, entry);
     });

   const recurring = Array.from(recurringMap.values())
     .filter((entry) => entry.count >= 2)
     .sort((left, right) => right.total - left.total)
     .slice(0, 4);

   if (!recurring.length) {
     panel.innerHTML = '<p class="empty-state">Nenhuma despesa recorrente detectada.</p>';
     return;
   }

   panel.innerHTML = recurring.map((entry) => `
     <div class="account-row">
       <div class="account-meta">
         <span class="account-color orange"></span>
         <div><strong>${entry.description}</strong><small>${entry.category} · ${entry.count}x no período</small></div>
       </div>
       <strong>${money(entry.total)}</strong>
     </div>
   `).join("");
 }

 function renderHistoryPanel(transactions = []) {
   const panel = document.querySelector("#history-panel");
   if (!panel) return;
   if (!transactions.length) {
     panel.innerHTML = '<p class="empty-state">Sem movimentações neste período.</p>';
     return;
   }

   const totals = transactions.reduce((result, transaction) => {
     const type = transaction.type || "expense";
     result[type] = (result[type] || 0) + Number(transaction.amount || 0);
     return result;
   }, { income: 0, expense: 0, investment: 0 });

   const referenceTransactions = financeTransactions.length ? financeTransactions : transactions;
   const monthlyTotals = {};
   referenceTransactions.forEach((transaction) => {
     const date = parseTransactionDate(transaction.transaction_date);
     const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
     if (!monthlyTotals[monthKey]) monthlyTotals[monthKey] = { income: 0, expense: 0, investment: 0 };
     const type = transaction.type || "expense";
     monthlyTotals[monthKey][type] = (monthlyTotals[monthKey][type] || 0) + Number(transaction.amount || 0);
   });
   const monthlyEntries = Object.entries(monthlyTotals).sort(([left], [right]) => left.localeCompare(right));
   const lastThreeMonths = monthlyEntries.slice(-3);
   const averageIncome = lastThreeMonths.length ? lastThreeMonths.reduce((sum, [, value]) => sum + Number(value.income || 0), 0) / lastThreeMonths.length : totals.income;
   const averageExpense = lastThreeMonths.length ? lastThreeMonths.reduce((sum, [, value]) => sum + Number(value.expense || 0), 0) / lastThreeMonths.length : totals.expense;
   const forecast = Math.max(averageIncome - averageExpense, 0);

   const fixedCategories = ["Moradia", "Saúde", "Educação", "Transporte", "Investimentos", "Contas", "Internet", "Energia", "Água", "Seguro"];
   const expenseTotals = {};
   transactions.filter((transaction) => transaction.type === "expense").forEach((transaction) => {
     const key = transaction.category || "Outros";
     expenseTotals[key] = (expenseTotals[key] || 0) + Number(transaction.amount || 0);
   });
   const fixedSpend = Object.entries(expenseTotals)
     .filter(([category]) => fixedCategories.includes(category) || ["moradia", "saude", "educacao", "transporte", "investimentos", "contas", "internet", "energia", "agua", "seguro"].includes((category || "").toLowerCase()))
     .reduce((sum, [, value]) => sum + value, 0);
   const variableSpend = Object.entries(expenseTotals)
     .filter(([category]) => !fixedCategories.includes(category) && !["moradia", "saude", "educacao", "transporte", "investimentos", "contas", "internet", "energia", "agua", "seguro"].includes((category || "").toLowerCase()))
     .reduce((sum, [, value]) => sum + value, 0);

   const biggestIncome = [...transactions].filter((item) => item.type === "income").sort((left, right) => Number(right.amount || 0) - Number(left.amount || 0))[0];
   const biggestExpense = [...transactions].filter((item) => item.type === "expense").sort((left, right) => Number(right.amount || 0) - Number(left.amount || 0))[0];
   const topMovements = [...transactions]
     .slice()
     .sort((left, right) => parseTransactionDate(right.transaction_date) - parseTransactionDate(left.transaction_date))
     .slice(0, 3)
     .map((transaction) => `
       <div class="account-row">
         <div class="account-meta">
           <span class="account-color ${transaction.type === "income" ? "green" : transaction.type === "investment" ? "purple" : "orange"}"></span>
           <div><strong>${transaction.description}</strong><small>${new Date(`${transaction.transaction_date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</small></div>
         </div>
         <strong>${transaction.type === "income" ? "+" : "−"}${money(transaction.amount)}</strong>
       </div>
     `).join("");

   const summary = [
     { label: "Entradas", value: money(totals.income), color: "green" },
     { label: "Gastos", value: money(totals.expense), color: "orange" },
     { label: "Investimentos", value: money(totals.investment), color: "purple" },
     { label: "Fixas", value: money(fixedSpend), color: "blue" },
     { label: "Variáveis", value: money(variableSpend), color: "orange" },
     { label: "Próximo mês", value: money(forecast), color: "green" }
   ];
   const detail = [
     biggestIncome ? { label: "Receita maior", value: money(biggestIncome.amount), color: "green" } : null,
     biggestExpense ? { label: "Gasto maior", value: money(biggestExpense.amount), color: "orange" } : null
   ].filter(Boolean);

   panel.innerHTML = `${summary.map(({ label, value, color }) => `
     <div class="account-row">
       <div class="account-meta">
         <span class="account-color ${color}"></span>
         <div><strong>${label}</strong><small>${label === "Próximo mês" ? "Média dos últimos 3 meses" : "Período atual"}</small></div>
       </div>
       <strong>${value}</strong>
     </div>
   `).join("")}
   ${detail.length ? `<div class="account-row"><div class="account-meta"><span class="account-color blue"></span><div><strong>${detail[0].label}</strong><small>Movimento destaque</small></div></div><strong>${detail[0].value}</strong></div>` : ""}
   ${topMovements ? `<div class="mini-stack">${topMovements}</div>` : ""}`;
 }

 function renderMonthlyReport(transactions = []) {
   const reportPanel = document.querySelector("#monthly-report-panel");
   if (!reportPanel) return;
   const expenseTransactions = transactions.filter((transaction) => transaction.type === "expense");
   if (!expenseTransactions.length) {
     reportPanel.innerHTML = '<tbody><tr><td colspan="3" class="empty-state">Ainda não há relatório para este período.</td></tr></tbody>';
     return;
   }

   const totals = {};
   expenseTransactions.forEach((transaction) => {
     const key = transaction.category || "Outros";
     totals[key] = (totals[key] || 0) + Number(transaction.amount || 0);
   });

   const totalSpent = Object.values(totals).reduce((sum, value) => sum + value, 0) || 1;
   const rows = Object.entries(totals)
     .sort(([, left], [, right]) => right - left)
     .map(([category, value]) => `
       <tr>
         <td>${category}</td>
         <td>${money(value)}</td>
         <td>${((value / totalSpent) * 100).toFixed(1)}%</td>
       </tr>
     `)
     .join("");

   reportPanel.innerHTML = `<tbody>${rows}</tbody>`;
 }

 function renderTrendSummary(transactions = []) {
   const summaryPanel = document.querySelector("#trend-summary");
   const chartPanel = document.querySelector("#trend-chart");
   const comparisonPanel = document.querySelector("#comparison-panel");
   if (!summaryPanel || !chartPanel || !comparisonPanel) return;

   const today = new Date();
   const months = Array.from({ length: 6 }, (_, index) => {
     const monthDate = new Date(today.getFullYear(), today.getMonth() - (5 - index), 1);
     const monthKey = monthDate.toISOString().slice(0, 7);
     const monthTransactions = transactions.filter((transaction) => {
       if (!transaction.transaction_date) return false;
       const parsed = parseTransactionDate(transaction.transaction_date);
       return parsed.getFullYear() === monthDate.getFullYear() && parsed.getMonth() === monthDate.getMonth();
     });
     const totals = monthTransactions.reduce((result, transaction) => {
       const type = transaction.type || "expense";
       result[type] = (result[type] || 0) + Number(transaction.amount || 0);
       return result;
     }, { income: 0, expense: 0, investment: 0 });
     return {
       key: monthKey,
       label: monthDate.toLocaleString("pt-BR", { month: "short" }),
       income: totals.income,
       expense: totals.expense,
       balance: totals.income - totals.expense - totals.investment
     };
   });

   const currentMonth = months[months.length - 1];
   const previousMonth = months[months.length - 2] || currentMonth;
   const incomeDelta = currentMonth.income - previousMonth.income;
   const expenseDelta = currentMonth.expense - previousMonth.expense;
   const balanceDelta = currentMonth.balance - previousMonth.balance;

   summaryPanel.style.display = "grid";
   summaryPanel.style.gridTemplateColumns = "repeat(3, minmax(0, 1fr))";
   summaryPanel.style.gap = "12px";
   summaryPanel.innerHTML = `
     <div class="trend-summary-block" style="padding: 12px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px;">
       <span style="display:block; color:#9da5c3; font-size: 11px; margin-bottom: 6px;">Entradas</span>
       <strong style="display:block; font-size: 18px;">${money(currentMonth.income)}</strong>
       <small style="color: ${incomeDelta >= 0 ? '#71d9a2' : '#ff9d8a'};">${incomeDelta >= 0 ? "+" : ""}${money(incomeDelta)}</small>
     </div>
     <div class="trend-summary-block" style="padding: 12px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px;">
       <span style="display:block; color:#9da5c3; font-size: 11px; margin-bottom: 6px;">Gastos</span>
       <strong style="display:block; font-size: 18px;">${money(currentMonth.expense)}</strong>
       <small style="color: ${expenseDelta >= 0 ? '#ffb778' : '#71d9a2'};">${expenseDelta >= 0 ? "+" : ""}${money(expenseDelta)}</small>
     </div>
     <div class="trend-summary-block" style="padding: 12px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px;">
       <span style="display:block; color:#9da5c3; font-size: 11px; margin-bottom: 6px;">Saldo</span>
       <strong style="display:block; font-size: 18px;">${money(currentMonth.balance)}</strong>
       <small style="color: ${balanceDelta >= 0 ? '#71d9a2' : '#ff9d8a'};">${balanceDelta >= 0 ? "+" : ""}${money(balanceDelta)}</small>
     </div>
   `;

   const maxValue = Math.max(1, ...months.flatMap((item) => [item.income, item.expense]));
   chartPanel.innerHTML = months.map((item) => {
     const incomeHeight = (item.income / maxValue) * 100;
     const expenseHeight = (item.expense / maxValue) * 100;
     return `
       <div class="trend-column" style="display:flex; flex-direction:column; align-items:center; gap:8px; width:100%;">
         <div class="trend-bars" style="height: 120px; display: flex; align-items: end; justify-content: center; gap: 4px; width: 100%;">
           <span style="display:block; width: 10px; height: ${Math.max(incomeHeight, 8)}%; background: linear-gradient(180deg, #7fd1ff, #5d7cff); border-radius: 8px 8px 0 0;" title="Entradas ${money(item.income)}"></span>
           <span style="display:block; width: 10px; height: ${Math.max(expenseHeight, 8)}%; background: linear-gradient(180deg, #ffce90, #ff8f6b); border-radius: 8px 8px 0 0;" title="Gastos ${money(item.expense)}"></span>
         </div>
         <small style="color:#9da5c3; text-transform: capitalize;">${item.label}</small>
       </div>
     `;
   }).join("");

   const comparisonRows = months.map((item, index) => {
     const previous = months[index - 1] || item;
     const delta = item.balance - previous.balance;
     return `
       <tr>
         <td>${item.label}</td>
         <td>${money(item.income)}</td>
         <td>${money(item.expense)}</td>
         <td>${money(item.balance)}</td>
         <td class="${delta >= 0 ? "positive" : "negative"}">${delta >= 0 ? "+" : ""}${money(delta)}</td>
       </tr>
     `;
   }).join("");

   comparisonPanel.innerHTML = `<tbody>${comparisonRows}</tbody>`;
 }

 function renderTransaction(transaction) {
   const isIncome = transaction.type === "income";
   const iconClass = isIncome ? "income-icon" : transaction.type === "investment" ? "invest-icon" : "food-icon";
   const icon = isIncome ? "↓" : transaction.type === "investment" ? "↗" : "⌁";
   const date = new Date(`${transaction.transaction_date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
   const row = document.createElement("div");
   row.className = "transaction";
   row.dataset.transactionId = transaction.id;
   row.innerHTML = `
     <div class="transaction-icon ${iconClass}">${icon}</div>
     <div class="transaction-info"><strong></strong><span>${date} · ${transactionLabels[transaction.type] || "Lançamento"} · ${transaction.category}</span></div>
     <strong class="transaction-value ${isIncome ? "positive" : ""}">${isIncome ? "+" : "−"} ${money(transaction.amount)}</strong>
     <div class="transaction-actions">
       <button class="edit-button" data-transaction-action="edit" aria-label="Editar lançamento">✎</button>
       <button class="more-button" aria-label="Excluir lançamento">×</button>
     </div>
   `;
   row.querySelector(".transaction-info strong").textContent = transaction.description;
   return row;
 }

 function getBudgetProfile(categoryTotals = {}) {
   const categories = Object.keys(categoryTotals);
   const totalSpent = Object.values(categoryTotals).reduce((sum, value) => sum + value, 0);
   const averageSpend = categories.length ? totalSpent / categories.length : 0;
   const baseBudget = Math.max(averageSpend * 1.2, 250);
   const fixedCategories = ["Moradia", "Saúde", "Educação", "Transporte", "Investimentos", "Contas"];

   return Object.fromEntries(categories.map((label) => {
     const spent = categoryTotals[label] || 0;
     const recommended = fixedCategories.includes(label)
       ? Math.max(spent * 1.15, baseBudget * 1.5)
       : Math.max(spent * 1.25, baseBudget * 0.9);
     return [label, recommended];
   }));
 }

 function renderBudgetSummary(transactions = []) {
   const budgetPanel = document.querySelector("#budget-panel");
   if (!budgetPanel) return;
 
   const categoryTotals = {};
   transactions.filter((transaction) => transaction.type === "expense").forEach((transaction) => {
     const key = transaction.category || "Outros";
     categoryTotals[key] = (categoryTotals[key] || 0) + Number(transaction.amount || 0);
   });
 
   const budgetProfile = getBudgetProfile(categoryTotals);
   const fixedCategories = ["Moradia", "Saúde", "Educação", "Transporte", "Investimentos", "Contas"];
   const fixedSpend = Object.entries(categoryTotals)
     .filter(([label]) => fixedCategories.includes(label))
     .reduce((sum, [, value]) => sum + value, 0);
   const variableSpend = Object.entries(categoryTotals)
     .filter(([label]) => !fixedCategories.includes(label))
     .reduce((sum, [, value]) => sum + value, 0);
 
   const categories = Object.keys(categoryTotals);
   const budgetRows = categories.map((label) => {
     const spent = categoryTotals[label] || 0;
     const limit = budgetProfile[label] || Math.max((Object.values(categoryTotals).reduce((sum, value) => sum + value, 0) / Math.max(categories.length, 1)) * 0.8, 250);
     const status = spent > limit ? "Acima" : spent > limit * 0.75 ? "Quase" : "Dentro";
     const priority = fixedCategories.includes(label) ? "Fixa" : "Variável";
     return `
       <div class="budget-row">
         <div>
           <strong>${label}</strong>
           <small>${money(spent)} / ${money(limit)} · ${priority}</small>
         </div>
         <span class="status ${status === "Acima" ? "danger" : status === "Quase" ? "warn" : "good"}">${status}</span>
       </div>
     `;
   });
 
   const summary = `
     <div class="account-row">
       <div class="account-meta">
         <span class="account-color blue"></span>
         <div><strong>Fixas</strong><small>Despesas essenciais</small></div>
       </div>
       <strong>${money(fixedSpend)}</strong>
     </div>
     <div class="account-row">
       <div class="account-meta">
         <span class="account-color orange"></span>
         <div><strong>Variáveis</strong><small>Gastos flexíveis</small></div>
       </div>
       <strong>${money(variableSpend)}</strong>
     </div>
   `;
 
   budgetPanel.innerHTML = budgetRows.length
     ? `${summary}${budgetRows.join("")}`
     : '<p class="empty-state">Ainda não há gastos para comparar com o orçamento.</p>';
 }

 function renderSavingsGoals(transactions = []) {
   const goalsPanel = document.querySelector("#goals-panel");
   const summaryList = document.querySelector(".goal-list");
   if (!goalsPanel && !summaryList) return;
 
   const totals = transactions.reduce((result, transaction) => {
     const type = transaction.type || "expense";
     result[type] = (result[type] || 0) + Number(transaction.amount || 0);
     return result;
   }, { income: 0, expense: 0, investment: 0 });
 
   const available = Math.max(totals.income - totals.expense - totals.investment, 0);
   const targetBase = Math.max(available * 0.4, 1500);
   const emergencyTarget = Math.max(targetBase * 2.5, 2500);
   const travelTarget = Math.max(targetBase * 1.5, 1800);
   const techTarget = Math.max(targetBase, 1200);
 
   const goals = [
     { label: "Reserva de emergência", target: emergencyTarget, current: Math.min(available * 0.42, emergencyTarget), tone: "blue", icon: "⌂", priority: "Alta", status: "Em andamento" },
     { label: "Viagem", target: travelTarget, current: Math.min(available * 0.28, travelTarget), tone: "violet", icon: "✦", priority: "Média", status: "Próximo passo" },
     { label: "Notebook", target: techTarget, current: Math.min(available * 0.35, techTarget), tone: "orange", icon: "◇", priority: "Alta", status: "Foco do mês" }
   ];

   const goalMarkup = goals.map((goal) => {
     const percentage = goal.target > 0 ? Math.min((goal.current / goal.target) * 100, 100) : 0;
     const priorityClass = goal.priority === "Alta" ? "goal-priority goal-priority-high" : goal.priority === "Média" ? "goal-priority goal-priority-medium" : "goal-priority goal-priority-low";
     return `
       <div class="goal">
         <div class="goal-icon ${goal.tone}">${goal.icon}</div>
         <div class="goal-info">
           <div>
             <strong>${goal.label}</strong>
             <span>${Math.round(percentage)}%</span>
           </div>
           <div class="goal-meta-row">
             <span class="${priorityClass}">${goal.priority}</span>
             <small>${goal.status}</small>
           </div>
           <div class="mini-track"><i style="width:${percentage}%"></i></div>
           <small>${money(goal.current)} de ${money(goal.target)}</small>
         </div>
       </div>
     `;
   }).join("");

   if (goalsPanel) goalsPanel.innerHTML = goalMarkup;
   if (summaryList) summaryList.innerHTML = goalMarkup;
 }

 function renderInvestmentSummary(transactions = []) {
   const investmentsPanel = document.querySelector("#investments-panel");
   const yieldPanel = document.querySelector("#yield-panel");
   if (!investmentsPanel || !yieldPanel) return;

   const investmentTransactions = transactions.filter((transaction) => transaction.type === "investment");
   const totalInvested = investmentTransactions.reduce((sum, item) => sum + Number(item.amount || 0), 0);
   const income = transactions.filter((item) => item.type === "income").reduce((sum, item) => sum + Number(item.amount || 0), 0);
   const expense = transactions.filter((item) => item.type === "expense").reduce((sum, item) => sum + Number(item.amount || 0), 0);
   const available = Math.max(income - expense - totalInvested, 0);
   const reserve = Math.max(totalInvested * 0.42, 0);
   const netPerformance = Math.max(totalInvested * 0.08, 0);
   const yieldRate = totalInvested ? (netPerformance / totalInvested) * 100 : 0;
   const totalPatrimony = totalInvested + available;

   investmentsPanel.innerHTML = `
     <div class="account-row">
       <div class="account-meta">
         <span class="account-color purple"></span>
         <div><strong>Patrimônio investido</strong><small>Aplicado até hoje</small></div>
       </div>
       <strong>${money(totalInvested)}</strong>
     </div>
     <div class="account-row">
       <div class="account-meta">
         <span class="account-color blue"></span>
         <div><strong>Reserva de renda</strong><small>Acumulado em carteira</small></div>
       </div>
       <strong>${money(reserve)}</strong>
     </div>
     <div class="account-row">
       <div class="account-meta">
         <span class="account-color green"></span>
         <div><strong>Em caixa</strong><small>Dinheiro disponível</small></div>
       </div>
       <strong>${money(available)}</strong>
     </div>
   `;

   yieldPanel.innerHTML = `
     <div class="account-row">
       <div class="account-meta">
         <span class="account-color green"></span>
         <div><strong>Rendimento bruto</strong><small>Estimado</small></div>
       </div>
       <strong>${money(netPerformance)}</strong>
     </div>
     <div class="account-row">
       <div class="account-meta">
         <span class="account-color purple"></span>
         <div><strong>Rentabilidade</strong><small>Porcentagem anual</small></div>
       </div>
       <strong>${yieldRate.toFixed(1)}%</strong>
     </div>
     <div class="account-row">
       <div class="account-meta">
         <span class="account-color orange"></span>
         <div><strong>Patrimônio total</strong><small>Investimento + disponível</small></div>
       </div>
       <strong>${money(totalPatrimony)}</strong>
     </div>
   `;
 }

 function renderFinanceBreakdown(transactions = [], totals = {}) {
   const categoryList = document.querySelector("#category-list");
   const accountSummary = document.querySelector("#account-summary");
   const accountsPanel = document.querySelector("#accounts-panel");
   const walletPanel = document.querySelector("#wallet-panel");
   if (!categoryList || !accountSummary || !accountsPanel || !walletPanel) return;

   const categoryTotals = {};
   transactions.filter((transaction) => transaction.type === "expense").forEach((transaction) => {
     const key = transaction.category || "Outros";
     categoryTotals[key] = (categoryTotals[key] || 0) + Number(transaction.amount || 0);
   });

   const sortedCategories = Object.entries(categoryTotals).sort(([, left], [, right]) => right - left).slice(0, 4);
   if (!sortedCategories.length) {
     categoryList.innerHTML = '<p class="empty-state">Nenhuma categoria registrada ainda.</p>';
   } else {
     const maxValue = Math.max(...sortedCategories.map(([, value]) => value));
     categoryList.innerHTML = sortedCategories.map(([category, value]) => {
       const percentage = Math.max(18, (value / maxValue) * 100);
       const tone = category.toLowerCase().includes("aliment") ? "green" : category.toLowerCase().includes("morad") || category.toLowerCase().includes("luz") ? "orange" : category.toLowerCase().includes("trans") ? "blue" : "purple";
       return `
         <div class="account-row">
           <div class="account-meta">
             <span class="account-color ${tone}"></span>
             <div><strong>${category}</strong><small>${money(value)}</small></div>
           </div>
           <div style="width: 56px; height: 8px; border-radius: 999px; background: rgba(255,255,255,.06); overflow: hidden;">
             <div style="height: 100%; width: ${percentage}%; border-radius: inherit; background: linear-gradient(90deg, #8b9dff, #8ae0c0);"></div>
           </div>
         </div>
       `;
     }).join("");
   }

   const income = Number(totals.income || 0);
   const expense = Number(totals.expense || 0);
   const investment = Number(totals.investment || 0);
   const available = Math.max(income - expense, 0);
   const accountRows = [
     { label: "Disponível", value: money(available), color: "green" },
     { label: "Gastos do mês", value: money(expense), color: "orange" },
     { label: "Investido", value: money(investment), color: "purple" },
     { label: "Saldo líquido", value: money(income - expense - investment), color: "blue" }
   ];

   accountSummary.innerHTML = accountRows.map(({ label, value, color }) => `
     <div class="account-row">
       <div class="account-meta">
         <span class="account-color ${color}"></span>
         <div><strong>${label}</strong><small>Resumo real</small></div>
       </div>
       <strong>${value}</strong>
     </div>
   `).join("");

   const expenseByType = transactions.filter((transaction) => transaction.type === "expense");
   const incomeByType = transactions.filter((transaction) => transaction.type === "income");
   const walletValue = incomeByType.reduce((sum, item) => sum + Number(item.amount || 0), 0) - expenseByType.reduce((sum, item) => sum + Number(item.amount || 0), 0);
   const baseAccounts = [
     { label: "Conta principal", value: money(Math.max(income - expense, 0)), note: "Disponível" },
     { label: "Cartão", value: money(Math.max(expense * 0.35, 0)), note: "Fatura" },
     { label: "Poupança", value: money(Math.max(investment, 0)), note: "Reserva" }
   ];

   accountsPanel.innerHTML = baseAccounts.map(({ label, value, note }) => `
     <div class="account-row">
       <div class="account-meta">
         <span class="account-color ${label.includes("Cartão") ? "orange" : label.includes("Poupança") ? "purple" : "blue"}"></span>
         <div><strong>${label}</strong><small>${note}</small></div>
       </div>
       <strong>${value}</strong>
     </div>
   `).join("");

   const forecast = Math.max(income - expense + Math.max(investment * 0.12, 0), 0);
   const reserveTarget = Math.max(income * 0.2, 0);
   walletPanel.innerHTML = `
     <div class="account-row">
       <div class="account-meta">
         <span class="account-color green"></span>
         <div><strong>Dinheiro disponível</strong><small>Para uso imediato</small></div>
       </div>
       <strong>${money(Math.max(walletValue, 0))}</strong>
     </div>
     <div class="account-row">
       <div class="account-meta">
         <span class="account-color blue"></span>
         <div><strong>Entradas líquidas</strong><small>Receitas menos gastos</small></div>
       </div>
       <strong>${money(income - expense)}</strong>
     </div>
     <div class="account-row">
       <div class="account-meta">
         <span class="account-color purple"></span>
         <div><strong>Fluxo previsto</strong><small>Próximo mês</small></div>
       </div>
       <strong>${money(forecast)}</strong>
     </div>
     <div class="account-row">
       <div class="account-meta">
         <span class="account-color orange"></span>
         <div><strong>Reserva mínima</strong><small>Margem de segurança</small></div>
       </div>
       <strong>${money(reserveTarget)}</strong>
     </div>
   `;

   renderBudgetSummary(transactions);
   renderSavingsGoals(transactions);
   renderInvestmentSummary(transactions);
 }

 function refreshFinancePeriodView() {
   const visibleTransactions = getVisibleFinanceTransactions();
   const totals = visibleTransactions.reduce((result, transaction) => {
     const type = transaction.type || "expense";
     result[type] = (result[type] || 0) + Number(transaction.amount || 0);
     return result;
   }, { income: 0, expense: 0, investment: 0 });

   const financeTypeFilter = document.querySelector("#finance-type-filter");
   const financeCategoryFilter = document.querySelector("#finance-category-filter");
   if (financeTypeFilter) financeTypeFilter.value = activeFinanceTypeFilter;
   if (financeCategoryFilter) financeCategoryFilter.value = activeFinanceCategoryFilter;

   if (transactionList) {
     transactionList.innerHTML = "";
     if (!visibleTransactions.length) {
       transactionList.innerHTML = '<p class="empty-state">Nenhum lançamento registrado neste período.</p>';
     } else {
       visibleTransactions
         .slice()
         .sort((left, right) => parseTransactionDate(right.transaction_date) - parseTransactionDate(left.transaction_date))
         .forEach((transaction) => transactionList.appendChild(renderTransaction(transaction)));
     }
   }

   document.querySelector("#income-value").textContent = money(totals.income);
   document.querySelector("#expense-value").textContent = money(totals.expense);
   document.querySelector("#investment-value").textContent = money(totals.investment);
   document.querySelector("#balance-value").textContent = money(totals.income - totals.expense - totals.investment);
   document.querySelector("#balance-income").textContent = money(totals.income);

   renderFinanceBreakdown(visibleTransactions, totals);
   renderBudgetSummary(visibleTransactions);
   renderSavingsGoals(visibleTransactions);
   renderInvestmentSummary(visibleTransactions);
   renderRecurringExpenses(financeTransactions);
   renderHistoryPanel(visibleTransactions);
   renderMonthlyReport(visibleTransactions);
   renderTrendSummary(financeTransactions);
 }

 async function loadFinance() {
   if (!transactionList) return;
   try {
     const result = await api("/api/transactions");
     financeTransactions = result.transactions || [];
     populateFinanceCategoryFilter(financeTransactions);
     refreshFinancePeriodView();
   } catch (error) {
     transactionList.innerHTML = `<p class="empty-state">${error.message}</p>`;
     const categoryList = document.querySelector("#category-list");
     const accountSummary = document.querySelector("#account-summary");
     const accountsPanel = document.querySelector("#accounts-panel");
     const walletPanel = document.querySelector("#wallet-panel");
     const budgetPanel = document.querySelector("#budget-panel");
     const goalsPanel = document.querySelector("#goals-panel");
     const investmentsPanel = document.querySelector("#investments-panel");
     const yieldPanel = document.querySelector("#yield-panel");
     const historyPanel = document.querySelector("#history-panel");
     if (categoryList) categoryList.innerHTML = `<p class="empty-state">${error.message}</p>`;
     if (accountSummary) accountSummary.innerHTML = `<p class="empty-state">${error.message}</p>`;
     if (accountsPanel) accountsPanel.innerHTML = `<p class="empty-state">${error.message}</p>`;
     if (walletPanel) walletPanel.innerHTML = `<p class="empty-state">${error.message}</p>`;
     if (budgetPanel) budgetPanel.innerHTML = `<p class="empty-state">${error.message}</p>`;
     if (goalsPanel) goalsPanel.innerHTML = `<p class="empty-state">${error.message}</p>`;
     if (investmentsPanel) investmentsPanel.innerHTML = `<p class="empty-state">${error.message}</p>`;
     if (yieldPanel) yieldPanel.innerHTML = `<p class="empty-state">${error.message}</p>`;
     if (historyPanel) historyPanel.innerHTML = `<p class="empty-state">${error.message}</p>`;
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
     activeFinancePeriod = button.dataset.period || "month";
     refreshFinancePeriodView();
     showToast(`Período: ${button.textContent.trim()}`);
   });
 });

 const financeTypeFilter = document.querySelector("#finance-type-filter");
 const financeCategoryFilter = document.querySelector("#finance-category-filter");

 if (financeTypeFilter) {
   financeTypeFilter.addEventListener("change", (event) => {
     activeFinanceTypeFilter = event.target.value || "all";
     refreshFinancePeriodView();
   });
 }

 if (financeCategoryFilter) {
   financeCategoryFilter.addEventListener("change", (event) => {
     activeFinanceCategoryFilter = event.target.value || "all";
     refreshFinancePeriodView();
   });
 }

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
const modalTitle = document.querySelector("#modal-title");
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

let transactionBeingEdited = null;

function openModal(type = "expense", transaction = null) {
  if (!modal) return;
  transactionBeingEdited = transaction;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  const typeField = modal.querySelector('[name="type"]');
  const descriptionField = modal.querySelector('[name="description"]');
  const amountField = modal.querySelector('[name="amount"]');
  const categoryField = modal.querySelector('[name="category"]');
  const dateField = modal.querySelector('[name="transaction_date"]');
  const noteField = modal.querySelector('[name="note"]');
  if (typeField) typeField.value = transaction?.type || type;
  if (descriptionField) descriptionField.value = transaction?.description || "";
  if (amountField) amountField.value = transaction ? Number(transaction.amount || 0).toFixed(2) : "";
  if (categoryField) categoryField.value = transaction?.category || categoryField.value || "Outros";
  if (dateField) dateField.value = transaction?.transaction_date || new Date().toISOString().slice(0, 10);
  if (noteField) noteField.value = transaction?.note || "";
  if (modalTitle) modalTitle.textContent = transaction ? "Editar lançamento" : "Adicionar lançamento";
  const submitButton = modal.querySelector('button[type="submit"]');
  if (submitButton) submitButton.textContent = transaction ? "Salvar alterações" : "Salvar lançamento";
  const firstField = modal.querySelector("input");
  if (firstField) firstField.focus();
}

function closeModal() {
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  transactionBeingEdited = null;
  if (modalTitle) modalTitle.textContent = "Adicionar lançamento";
  const submitButton = modal.querySelector('button[type="submit"]');
  if (submitButton) submitButton.textContent = "Salvar lançamento";
  const form = document.querySelector("#transaction-form");
  if (form && typeof form.reset === "function") form.reset();
  const dateField = form?.querySelector('[name="transaction_date"]');
  if (dateField) dateField.value = new Date().toISOString().slice(0, 10);
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
    const payload = Object.fromEntries(formData);
    try {
      if (transactionBeingEdited) {
        await api(`/api/transactions/${transactionBeingEdited.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        showToast("Lançamento atualizado.");
      } else {
        await api("/api/transactions", { method: "POST", body: JSON.stringify(payload) });
        showToast("Lançamento adicionado com sucesso.");
      }
      closeModal();
      if (form && typeof form.reset === "function") form.reset();
      if (transactionDateField) transactionDateField.value = new Date().toISOString().slice(0, 10);
      await loadFinance();
    } catch (error) {
      showToast(error.message);
    }
  });
}

if (transactionList) {
  transactionList.addEventListener("click", async (event) => {
    const editButton = event.target.closest(".edit-button");
    if (editButton) {
      const row = editButton.closest(".transaction");
      const transactionId = Number(row?.dataset.transactionId);
      if (!transactionId) return;
      const transaction = financeTransactions.find((item) => Number(item.id) === transactionId);
      if (transaction) openModal(transaction.type, transaction);
      return;
    }

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
