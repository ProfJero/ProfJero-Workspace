// js/pages/finance.js
import { db, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, serverTimestamp, Timestamp, setDoc } from '../firebase-config.js';
import { showToast, escapeHtml, formatDate, timeAgo, formatCurrency } from '../utils/helpers.js';
import { onSnapshot, getDoc } from '../firebase-config.js';

let currentUser = null;
let currentPeriod = 'month';
let transactionsCache = [];
let budgetsCache = [];
let accountsCache = [];
let invoicesCache = [];
let projectsCache = [];
let financialGoalsCache = [];
let goalsCache = [];
let paymentHistoryCache = [];
let invoiceTimelineCache = [];
let pendingApprovalsCache = [];
let paymentListeners = {};
let debtsCache = [];
let subscriptionsCache = [];
let recurringBillsCache = [];

// Pagination settings
const ITEMS_PER_PAGE = 5;
let currentPage = 1;
let totalPages = 1;
let currentInvoicePage = 1;
let totalInvoicePages = 1;
const INVOICES_PER_PAGE = 5;

const PAYMENT_CATEGORY_MAPPING = {
    default: 'payment_received',
};

// Business Settings (user configurable)
let businessSettings = {
    name: 'ProfJero WorkSpace',
    address: '123 Business Street, Accra, Ghana',
    phone: '+233 20 000 0000',
    email: 'info@profjero.com',
    logo: null,
    prefix: 'PJ',
    paymentDetails: {
        bankName: '',
        accountName: '',
        accountNumber: '',
        bankCode: '',
        mobileMoney: '',
        mobileMoneyName: '',
        paymentInstructions: 'Please include invoice number in payment reference'
    }
};

// Helper function to get category icon
function getCategoryIcon(category) {
    const icons = {
        salary: 'fa-money-bill-wave',
        freelance: 'fa-laptop-code',
        investment: 'fa-chart-line',
        payment_received: 'fa-hand-holding-usd',
        gift: 'fa-gift',
        food: 'fa-utensils',
        transport: 'fa-car',
        housing: 'fa-home',
        utilities: 'fa-bolt',
        entertainment: 'fa-film',
        shopping: 'fa-shopping-bag',
        health: 'fa-heartbeat',
        education: 'fa-graduation-cap',
        bills: 'fa-file-invoice'
    };
    return icons[category] || 'fa-tag';
}

function getCategoryColor(category) {
    const colors = {
        salary: '#10b981',
        freelance: '#8b5cf6',
        investment: '#06b6d4',
        payment_received: '#f59e0b',
        gift: '#ec4899',
        food: '#f59e0b',
        transport: '#3b82f6',
        housing: '#8b5cf6',
        utilities: '#06b6d4',
        entertainment: '#ec4899',
        shopping: '#f59e0b',
        health: '#ef4444',
        education: '#10b981',
        bills: '#6366f1'
    };
    return colors[category] || '#64748b';
}

export async function renderFinancePage(user) {
    currentUser = user;
    await loadBusinessSettings();
    await loadAllData();
    
    return `
        <div class="space-y-6 animate-fade-in-up">
            <!-- Header -->
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 class="text-3xl font-bold" style="color: var(--text-primary);">Finance Manager</h1>
                    <p class="text-muted mt-1">AI-powered financial management - Track, analyze, and optimize your finances</p>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button id="financial-health-btn" class="px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-all hover:shadow-md" style="background: linear-gradient(135deg, #8b5cf6, #06b6d4); color: white;">
                        <i class="fas fa-heartbeat"></i>
                        <span>Health Score</span>
                    </button>
                    <button id="pending-approvals-btn" class="px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-all hover:shadow-md" style="background: #f59e0b; color: white;">
                        <i class="fas fa-clock"></i>
                        <span>Pending</span>
                        <span id="pending-count" class="px-2 py-0.5 rounded-full text-xs" style="background: white; color: #f59e0b;">0</span>
                    </button>
                    <button id="add-transaction-btn" class="px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                        <i class="fas fa-plus"></i> Add
                    </button>
                    <button id="create-invoice-btn" class="px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-all hover:shadow-md" style="background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary);">
                        <i class="fas fa-file-invoice"></i> Invoice
                    </button>
                    <button id="business-settings-btn" class="px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-all hover:shadow-md" style="background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary);">
                        <i class="fas fa-cog"></i>
                    </button>
                </div>
            </div>

            <!-- AI Financial Advisor Summary -->
            <div id="ai-advisor-summary" class="glass-card rounded-xl p-4 border-l-4" style="border-left-color: var(--deep-blue);">
                <div class="flex items-start gap-3">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald));">
                        <i class="fas fa-robot text-white"></i>
                    </div>
                    <div class="flex-1">
                        <div class="flex items-center gap-2">
                            <h4 class="font-semibold">AI Financial Advisor</h4>
                            <span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(16,185,129,0.15); color: #10b981;">Live</span>
                        </div>
                        <p id="ai-advisor-message" class="text-sm text-muted">Loading insights...</p>
                    </div>
                </div>
            </div>

            <!-- Balance Cards -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div class="glass-card rounded-xl p-5 transition-all hover:shadow-lg">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-muted">Total Balance</span>
                        <i class="fas fa-wallet text-2xl" style="color: var(--deep-blue);"></i>
                    </div>
                    <div class="text-2xl md:text-3xl font-bold" id="total-balance" style="color: var(--text-primary);">₵0</div>
                    <div class="text-xs text-muted mt-1">Net worth</div>
                </div>
                <div class="glass-card rounded-xl p-5 transition-all hover:shadow-lg">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-muted">Total Income</span>
                        <i class="fas fa-arrow-up text-2xl" style="color: var(--emerald);"></i>
                    </div>
                    <div class="text-2xl md:text-3xl font-bold" id="total-income" style="color: var(--emerald);">₵0</div>
                    <div class="text-xs text-muted mt-1">This period</div>
                </div>
                <div class="glass-card rounded-xl p-5 transition-all hover:shadow-lg">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-muted">Total Expenses</span>
                        <i class="fas fa-arrow-down text-2xl" style="color: #ef4444;"></i>
                    </div>
                    <div class="text-2xl md:text-3xl font-bold" id="total-expenses" style="color: #ef4444;">₵0</div>
                    <div class="text-xs text-muted mt-1">This period</div>
                </div>
                <div class="glass-card rounded-xl p-5 transition-all hover:shadow-lg">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-muted">Net Profit</span>
                        <i class="fas fa-chart-line text-2xl" style="color: #8b5cf6;"></i>
                    </div>
                    <div class="text-2xl md:text-3xl font-bold" id="total-profit" style="color: #8b5cf6;">₵0</div>
                    <div class="text-xs text-muted mt-1">This period</div>
                </div>
            </div>

            <!-- Period Tabs -->
            <div class="flex flex-wrap gap-2 border-b border-custom pb-2">
                <button class="period-tab px-3 md:px-4 py-2 rounded-lg transition-all text-sm md:text-base" data-period="week"><i class="fas fa-calendar-week mr-1"></i> Week</button>
                <button class="period-tab px-3 md:px-4 py-2 rounded-lg transition-all text-sm md:text-base" data-period="month"><i class="fas fa-calendar-alt mr-1"></i> Month</button>
                <button class="period-tab px-3 md:px-4 py-2 rounded-lg transition-all text-sm md:text-base" data-period="quarter"><i class="fas fa-calendar-plus mr-1"></i> Quarter</button>
                <button class="period-tab px-3 md:px-4 py-2 rounded-lg transition-all text-sm md:text-base" data-period="half-year"><i class="fas fa-calendar-half mr-1"></i> Half Year</button>
                <button class="period-tab px-3 md:px-4 py-2 rounded-lg transition-all text-sm md:text-base" data-period="year"><i class="fas fa-calendar-year mr-1"></i> Year</button>
                <button class="period-tab px-3 md:px-4 py-2 rounded-lg transition-all text-sm md:text-base" data-period="all"><i class="fas fa-history mr-1"></i> All</button>
            </div>

            <!-- Cash Flow Intelligence -->
            <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div class="glass-card rounded-xl p-3 text-center">
                    <div class="text-xs text-muted">Money In</div>
                    <div class="text-lg font-bold text-emerald-500" id="cash-in">₵0</div>
                </div>
                <div class="glass-card rounded-xl p-3 text-center">
                    <div class="text-xs text-muted">Money Out</div>
                    <div class="text-lg font-bold text-red-500" id="cash-out">₵0</div>
                </div>
                <div class="glass-card rounded-xl p-3 text-center">
                    <div class="text-xs text-muted">Remaining</div>
                    <div class="text-lg font-bold" id="cash-remaining" style="color: var(--text-primary);">₵0</div>
                </div>
                <div class="glass-card rounded-xl p-3 text-center">
                    <div class="text-xs text-muted">Expected Bills</div>
                    <div class="text-lg font-bold" id="expected-bills" style="color: #f59e0b;">₵0</div>
                </div>
                <div class="glass-card rounded-xl p-3 text-center">
                    <div class="text-xs text-muted">Free Cash</div>
                    <div class="text-lg font-bold" id="free-cash" style="color: #8b5cf6;">₵0</div>
                </div>
            </div>

            <!-- Lifestyle Analysis & Spending Habits -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div class="glass-card rounded-xl p-4 lg:col-span-2">
                    <h3 class="font-semibold mb-3"><i class="fas fa-chart-pie mr-2"></i>Spending Habits</h3>
                    <div id="spending-habits-container">
                        <div class="text-center py-4 text-muted">Loading spending analysis...</div>
                    </div>
                </div>
                <div class="glass-card rounded-xl p-4">
                    <h3 class="font-semibold mb-3"><i class="fas fa-balance-scale mr-2"></i>Lifestyle Analysis</h3>
                    <div id="lifestyle-analysis">
                        <div class="text-center py-4 text-muted">Loading...</div>
                    </div>
                </div>
            </div>

            <!-- Needs vs Wants & Impulse Spending -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div class="glass-card rounded-xl p-4">
                    <h3 class="font-semibold mb-3"><i class="fas fa-arrows-left-right mr-2"></i>Needs vs Wants</h3>
                    <div id="needs-wants-container">
                        <div class="text-center py-4 text-muted">Loading...</div>
                    </div>
                </div>
                <div class="glass-card rounded-xl p-4">
                    <h3 class="font-semibold mb-3"><i class="fas fa-exclamation-triangle mr-2" style="color: #f59e0b;"></i>Impulse Spending</h3>
                    <div id="impulse-spending-container">
                        <div class="text-center py-4 text-muted">Loading...</div>
                    </div>
                </div>
            </div>

            <!-- Debt Manager - Lending & Borrowing -->
            <div class="glass-card rounded-xl p-4">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
                    <h3 class="font-semibold"><i class="fas fa-hand-holding-usd mr-2" style="color: #f59e0b;"></i>Debt Manager</h3>
                    <div class="flex gap-2 flex-wrap">
                        <button id="add-lent-debt-btn" class="text-sm px-3 py-1.5 rounded-lg" style="background: var(--deep-blue); color: white;">
                            <i class="fas fa-arrow-right mr-1"></i> Money Lent
                        </button>
                        <button id="add-borrowed-debt-btn" class="text-sm px-3 py-1.5 rounded-lg" style="background: #ef4444; color: white;">
                            <i class="fas fa-arrow-left mr-1"></i> Money Borrowed
                        </button>
                    </div>
                </div>
                <div id="debts-container" class="space-y-2">
                    <div class="text-center py-4 text-muted">Loading debts...</div>
                </div>
            </div>

            <!-- Subscription Tracker -->
            <div class="glass-card rounded-xl p-4">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
                    <h3 class="font-semibold"><i class="fas fa-repeat mr-2" style="color: #8b5cf6;"></i>Subscriptions</h3>
                    <button id="add-subscription-btn" class="text-sm text-deep-blue hover:underline"><i class="fas fa-plus"></i> Add Subscription</button>
                </div>
                <div id="subscriptions-container" class="space-y-2">
                    <div class="text-center py-4 text-muted">Loading subscriptions...</div>
                </div>
            </div>

            <!-- Bill Predictor -->
            <div class="glass-card rounded-xl p-4">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
                    <h3 class="font-semibold"><i class="fas fa-calendar-check mr-2" style="color: #06b6d4;"></i>Bill Predictor</h3>
                    <span id="bill-count-badge" class="text-xs px-2 py-1 rounded-full" style="background: rgba(6,182,212,0.15); color: #06b6d4;">0 upcoming bills</span>
                </div>
                <div id="bills-container" class="space-y-2">
                    <div class="text-center py-4 text-muted">Loading bills...</div>
                </div>
            </div>

            <!-- Smart Budget Coach -->
            <div class="glass-card rounded-xl p-4">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
                    <h3 class="font-semibold"><i class="fas fa-brain mr-2" style="color: var(--emerald);"></i>Smart Budget Coach</h3>
                    <button id="manage-budgets-btn" class="text-sm text-deep-blue hover:underline"><i class="fas fa-edit"></i> Manage Budgets</button>
                </div>
                <div id="budgets-container" class="space-y-3">
                    <div class="text-center py-4 text-muted">Loading budgets...</div>
                </div>
            </div>

            <!-- Savings Coach -->
            <div class="glass-card rounded-xl p-4">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
                    <h3 class="font-semibold"><i class="fas fa-piggy-bank mr-2" style="color: #10b981;"></i>Savings Coach</h3>
                    <button id="add-goal-btn" class="text-sm text-deep-blue hover:underline"><i class="fas fa-plus"></i> Set Goal</button>
                </div>
                <div id="savings-coach-container" class="space-y-3">
                    <div class="text-center py-4 text-muted">Loading savings goals...</div>
                </div>
            </div>

            <!-- Financial Health Score -->
            <div class="glass-card rounded-xl p-4">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
                    <h3 class="font-semibold"><i class="fas fa-heartbeat mr-2" style="color: #8b5cf6;"></i>Financial Health Score</h3>
                    <button id="refresh-health-btn" class="text-sm text-deep-blue hover:underline"><i class="fas fa-sync"></i> Refresh</button>
                </div>
                <div id="health-score-container">
                    <div class="text-center py-4 text-muted">Calculating...</div>
                </div>
            </div>

            <!-- Charts Row -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div class="glass-card rounded-xl p-4">
                    <h3 class="font-semibold mb-3 text-base md:text-lg"><i class="fas fa-chart-pie mr-2"></i>Expense by Category</h3>
                    <div class="w-full h-64 md:h-72"><canvas id="expense-chart"></canvas></div>
                </div>
                <div class="glass-card rounded-xl p-4">
                    <h3 class="font-semibold mb-3 text-base md:text-lg"><i class="fas fa-chart-line mr-2"></i>Monthly Trend</h3>
                    <div class="w-full h-64 md:h-72"><canvas id="trend-chart"></canvas></div>
                </div>
            </div>

            <!-- Invoices -->
            <div class="glass-card rounded-xl p-4">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
                    <h3 class="font-semibold"><i class="fas fa-file-invoice-dollar mr-2"></i>Invoices</h3>
                    <button id="new-invoice-btn" class="text-sm text-deep-blue hover:underline"><i class="fas fa-plus"></i> New Invoice</button>
                </div>
                <div id="invoices-container" class="space-y-2">
                    <div class="text-center py-4 text-muted">No invoices yet</div>
                </div>
                <div id="invoice-pagination" class="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-4 border-t" style="border-color: var(--border-color);">
                    <div class="text-sm text-muted">
                        Showing <span id="invoice-start">0</span> - <span id="invoice-end">0</span> of <span id="invoice-total">0</span> invoices
                    </div>
                    <div class="flex items-center gap-2">
                        <button id="prev-invoice-page" class="px-4 py-2 rounded-lg border transition-all hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" style="border-color: var(--border-color); color: var(--text-primary);" disabled>
                            <i class="fas fa-chevron-left"></i> Previous
                        </button>
                        <span id="invoice-page-info" class="text-sm text-muted">Page 1 of 1</span>
                        <button id="next-invoice-page" class="px-4 py-2 rounded-lg border transition-all hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" style="border-color: var(--border-color); color: var(--text-primary);" disabled>
                            Next <i class="fas fa-chevron-right"></i>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Monthly Financial Review -->
            <div class="glass-card rounded-xl p-4">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
                    <h3 class="font-semibold"><i class="fas fa-file-alt mr-2" style="color: var(--deep-blue);"></i>Monthly Financial Review</h3>
                    <button id="generate-review-btn" class="text-sm px-4 py-2 rounded-lg" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                        <i class="fas fa-file-pdf mr-1"></i> Generate Review
                    </button>
                </div>
                <div id="monthly-review-container" class="text-center text-muted text-sm">
                    Click "Generate Review" to create your monthly financial summary
                </div>
            </div>

            <!-- Search and Filter -->
            <div class="glass-card rounded-xl p-4">
                <div class="flex flex-col md:flex-row gap-3">
                    <div class="flex-1 relative">
                        <i class="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-muted"></i>
                        <input type="text" id="transaction-search" placeholder="Search transactions..." 
                               class="w-full pl-10 pr-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                               style="background: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);">
                    </div>
                    <select id="transaction-type-filter" class="px-4 py-2 rounded-lg border w-full md:w-auto focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);">
                        <option value="all">All Types</option>
                        <option value="income">Income</option>
                        <option value="expense">Expenses</option>
                    </select>
                    <select id="transaction-category-filter" class="px-4 py-2 rounded-lg border w-full md:w-auto focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);">
                        <option value="all">All Categories</option>
                    </select>
                    <select id="transaction-goal-filter" class="px-4 py-2 rounded-lg border w-full md:w-auto focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);">
                        <option value="all">All Goals</option>
                    </select>
                </div>
            </div>

            <!-- Transactions List -->
            <div id="transactions-container" class="space-y-3">
                <div class="text-center py-12"><i class="fas fa-spinner fa-spin mr-2 text-muted"></i> Loading transactions...</div>
            </div>

            <!-- Pagination Controls -->
            <div id="pagination-controls" class="flex flex-col sm:flex-row items-center justify-between gap-4 glass-card rounded-xl p-4">
                <div class="text-sm text-muted">
                    Showing <span id="page-start">0</span> - <span id="page-end">0</span> of <span id="total-items">0</span> transactions
                </div>
                <div class="flex items-center gap-2">
                    <button id="prev-page" class="px-4 py-2 rounded-lg border transition-all hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed" style="border-color: var(--border-color); color: var(--text-primary);" disabled>
                        <i class="fas fa-chevron-left"></i> Previous
                    </button>
                    <span id="page-info" class="text-sm text-muted">Page 1 of 1</span>
                    <button id="next-page" class="px-4 py-2 rounded-lg border transition-all hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed" style="border-color: var(--border-color); color: var(--text-primary);" disabled>
                        Next <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
                <div class="flex items-center gap-2">
                    <label class="text-sm text-muted">Items per page:</label>
                    <select id="items-per-page" class="px-3 py-1.5 rounded-lg border focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);">
                        <option value="5">5</option>
                        <option value="10">10</option>
                        <option value="25">25</option>
                        <option value="50">50</option>
                    </select>
                </div>
            </div>
        </div>
    `;
}

// Load all data on page load
async function loadAllData() {
    await Promise.all([
        loadTransactions(),
        loadBudgets(),
        loadInvoices(),
        loadProjects(),
        loadFinancialGoals(),
        loadGoals(),
        loadPaymentHistory(),
        loadInvoiceTimeline(),
        loadDebts(),
        loadSubscriptions(),
        loadRecurringBills()
    ]);
    await runAllAnalyses();
    setupEventListeners();
    populateGoalFilters();
    currentPage = 1;
    currentInvoicePage = 1;
    applyPagination();
    renderInvoicePage();
    setupPaymentApprovalListener();
}

// Load business settings from Firestore
async function loadBusinessSettings() {
    if (!currentUser) return;
    
    try {
        const settingsDoc = await getDoc(doc(db, 'businessSettings', currentUser.uid));
        if (settingsDoc.exists()) {
            const data = settingsDoc.data();
            businessSettings = {
                ...businessSettings,
                ...data,
                paymentDetails: {
                    ...businessSettings.paymentDetails,
                    ...data.paymentDetails
                }
            };
            localStorage.setItem('businessSettings', JSON.stringify(businessSettings));
            console.log('✅ Business settings loaded from Firestore');
            return;
        }
    } catch (error) {
        console.log('⚠️ Could not load from Firestore, checking localStorage:', error);
    }
    
    const saved = localStorage.getItem('businessSettings');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            businessSettings = {
                ...businessSettings,
                ...parsed,
                paymentDetails: {
                    ...businessSettings.paymentDetails,
                    ...parsed.paymentDetails
                }
            };
            console.log('✅ Business settings loaded from localStorage');
        } catch (e) {
            console.error('Failed to parse business settings:', e);
        }
    }
}

// Save business settings
async function saveBusinessSettings(settings) {
    if (!currentUser) {
        localStorage.setItem('businessSettings', JSON.stringify(settings));
        businessSettings = settings;
        return;
    }
    
    try {
        await setDoc(doc(db, 'businessSettings', currentUser.uid), {
            ...settings,
            updatedAt: serverTimestamp()
        }, { merge: true });
        
        localStorage.setItem('businessSettings', JSON.stringify(settings));
        businessSettings = settings;
        console.log('✅ Business settings saved to Firestore and localStorage');
    } catch (error) {
        console.error('❌ Failed to save business settings:', error);
        localStorage.setItem('businessSettings', JSON.stringify(settings));
        businessSettings = settings;
    }
}

// ============================================
// 1. LENDING & BORROWING MODULE (DEBT MANAGER)
// ============================================
async function loadDebts() {
    try {
        const q = query(collection(db, 'debts'), where('userId', '==', currentUser.uid), orderBy('dueDate', 'asc'));
        const querySnapshot = await getDocs(q);
        debtsCache = querySnapshot.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data(),
            dueDate: doc.data().dueDate?.toDate?.() || new Date(doc.data().dueDate),
            dateLent: doc.data().dateLent?.toDate?.() || new Date(doc.data().dateLent),
            createdAt: doc.data().createdAt?.toDate?.() || new Date()
        }));
        renderDebts();
        updateDebtSummary();
    } catch (error) {
        console.error('Error loading debts:', error);
    }
}

function renderDebts() {
    const container = document.getElementById('debts-container');
    if (!container) return;

    if (debtsCache.length === 0) {
        container.innerHTML = `
            <div class="text-center py-4 text-muted">
                <i class="fas fa-hand-holding-usd text-2xl mb-2"></i>
                <p>No debts tracked. Start tracking money you lent or borrowed.</p>
            </div>
        `;
        return;
    }

    const lentDebts = debtsCache.filter(d => d.type === 'lent');
    const borrowedDebts = debtsCache.filter(d => d.type === 'borrowed');

    container.innerHTML = `
        ${lentDebts.length > 0 ? `
            <div class="mb-3">
                <h4 class="text-sm font-semibold text-emerald-500 mb-2"><i class="fas fa-arrow-right mr-1"></i> Money Lent (${lentDebts.length})</h4>
                ${lentDebts.map(d => renderDebtCard(d, 'lent')).join('')}
            </div>
        ` : ''}
        ${borrowedDebts.length > 0 ? `
            <div class="mb-3">
                <h4 class="text-sm font-semibold text-red-500 mb-2"><i class="fas fa-arrow-left mr-1"></i> Money Borrowed (${borrowedDebts.length})</h4>
                ${borrowedDebts.map(d => renderDebtCard(d, 'borrowed')).join('')}
            </div>
        ` : ''}
        ${lentDebts.length === 0 && borrowedDebts.length === 0 ? `
            <div class="text-center py-4 text-muted">No debts tracked</div>
        ` : ''}
    `;
}

function renderDebtCard(debt, type) {
    const statusColors = {
        pending: '#f59e0b',
        'partially-paid': '#8b5cf6',
        paid: '#10b981',
        overdue: '#ef4444'
    };
    
    const statusIcons = {
        pending: 'fa-clock',
        'partially-paid': 'fa-half',
        paid: 'fa-check-circle',
        overdue: 'fa-exclamation-triangle'
    };

    const isOverdue = debt.status !== 'paid' && new Date(debt.dueDate) < new Date();
    const displayStatus = isOverdue && debt.status !== 'overdue' ? 'overdue' : debt.status || 'pending';
    const remaining = debt.amount - (debt.paidAmount || 0);
    const progress = debt.amount > 0 ? ((debt.paidAmount || 0) / debt.amount) * 100 : 0;

    return `
        <div class="glass-card rounded-xl p-3 transition-all hover:shadow-md" style="border-left: 3px solid ${type === 'lent' ? '#10b981' : '#ef4444'};">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div class="flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-semibold">${escapeHtml(debt.borrowerName || debt.lenderName || 'Unknown')}</span>
                        ${debt.phone ? `<span class="text-xs text-muted">📱 ${escapeHtml(debt.phone)}</span>` : ''}
                        <span class="text-xs px-2 py-0.5 rounded-full" style="background: ${statusColors[displayStatus] || '#6b7280'}20; color: ${statusColors[displayStatus] || '#6b7280'};">
                            <i class="fas ${statusIcons[displayStatus] || 'fa-circle'} text-xs mr-1"></i>
                            ${displayStatus.replace('-', ' ').toUpperCase()}
                        </span>
                        ${debt.interest ? `<span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(139,92,246,0.15); color: #8b5cf6;">${debt.interest}%</span>` : ''}
                    </div>
                    <div class="text-sm text-muted mt-1">
                        ${debt.purpose ? `📝 ${escapeHtml(debt.purpose)}` : ''}
                        ${debt.notes ? ` • 💬 ${escapeHtml(debt.notes)}` : ''}
                    </div>
                    <div class="text-xs text-muted mt-1">
                        ${type === 'lent' ? 'Lent' : 'Borrowed'}: ${formatDate(debt.dateLent || debt.createdAt)} • Due: ${formatDate(debt.dueDate)}
                        ${isOverdue && debt.status !== 'paid' ? ' ⚠️ OVERDUE' : ''}
                    </div>
                </div>
                <div class="text-right min-w-[120px]">
                    <div class="font-bold text-lg">${formatCurrency(remaining, 'GHS')}</div>
                    <div class="text-xs text-muted">of ${formatCurrency(debt.amount, 'GHS')}</div>
                    <div class="text-xs text-emerald-500">Paid: ${formatCurrency(debt.paidAmount || 0, 'GHS')}</div>
                </div>
            </div>
            <div class="mt-2">
                <div class="h-1.5 rounded-full overflow-hidden" style="background: var(--border-color);">
                    <div class="h-full rounded-full transition-all" style="width: ${Math.min(progress, 100)}%; background: ${progress > 80 ? '#10b981' : progress > 50 ? '#f59e0b' : '#ef4444'};"></div>
                </div>
            </div>
            <div class="flex gap-2 mt-2 flex-wrap">
                ${debt.status !== 'paid' ? `
                    <button onclick="window.FinanceApp.recordDebtPayment('${debt.id}')" class="text-xs px-2.5 py-1 rounded-lg" style="background: var(--emerald); color: white;">
                        <i class="fas fa-money-bill-wave mr-1"></i> Record Payment
                    </button>
                ` : ''}
                <button onclick="window.FinanceApp.editDebt('${debt.id}')" class="text-xs px-2.5 py-1 rounded-lg" style="background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary);">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="window.FinanceApp.deleteDebt('${debt.id}')" class="text-xs px-2.5 py-1 rounded-lg" style="background: var(--bg-secondary); border: 1px solid var(--border-color); color: #ef4444;">
                    <i class="fas fa-trash"></i>
                </button>
                ${debt.reminderSchedule ? `
                    <span class="text-xs px-2.5 py-1 rounded-lg" style="background: rgba(59,130,246,0.15); color: #3b82f6;">
                        <i class="fas fa-bell"></i> Reminders: ${debt.reminderSchedule}
                    </span>
                ` : ''}
            </div>
        </div>
    `;
}

function updateDebtSummary() {
    const totalLent = debtsCache.filter(d => d.type === 'lent').reduce((s, d) => s + (d.amount - (d.paidAmount || 0)), 0);
    const totalBorrowed = debtsCache.filter(d => d.type === 'borrowed').reduce((s, d) => s + (d.amount - (d.paidAmount || 0)), 0);
    
    const summaryEl = document.getElementById('debt-summary');
    if (summaryEl) {
        summaryEl.textContent = `Lent: ${formatCurrency(totalLent, 'GHS')} | Borrowed: ${formatCurrency(totalBorrowed, 'GHS')}`;
    }
}

// ============================================
// 2. SPENDING HABIT ANALYSIS
// ============================================
function analyzeSpendingHabits() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthExpenses = transactionsCache.filter(t => t.date >= startOfMonth && t.type === 'expense');
    
    const totalSpent = monthExpenses.reduce((s, t) => s + t.amount, 0);
    
    if (totalSpent === 0) {
        document.getElementById('spending-habits-container').innerHTML = `
            <div class="text-center py-4 text-muted">No expense data for this month</div>
        `;
        return;
    }

    const categoryTotals = {};
    monthExpenses.forEach(t => {
        categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
    });

    const sorted = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
    const categoryNames = {
        food: 'Food', transport: 'Transport', housing: 'Housing', utilities: 'Utilities',
        entertainment: 'Entertainment', shopping: 'Shopping', health: 'Health', 
        education: 'Education', bills: 'Bills', 'other-expense': 'Other'
    };

    let html = '<div class="space-y-2">';
    
    // Bar chart visualization
    const maxAmount = sorted.length > 0 ? sorted[0][1] : 1;
    sorted.slice(0, 8).forEach(([category, amount]) => {
        const percentage = (amount / totalSpent * 100).toFixed(1);
        const barWidth = (amount / maxAmount * 100).toFixed(0);
        const color = getCategoryColor(category);
        
        html += `
            <div>
                <div class="flex justify-between text-sm">
                    <span>${categoryNames[category] || category}</span>
                    <span class="font-semibold">${percentage}%</span>
                </div>
                <div class="h-5 rounded-lg overflow-hidden flex items-center px-2 text-xs text-white font-medium" style="background: ${color}40; color: ${color};">
                    <div class="h-full rounded-lg transition-all" style="width: ${barWidth}%; background: ${color};"></div>
                    <span class="ml-2">${formatCurrency(amount, 'GHS')}</span>
                </div>
            </div>
        `;
    });
    html += '</div>';

    // Add insight
    if (sorted.length > 0) {
        const topCategory = sorted[0][0];
        const topPercentage = (sorted[0][1] / totalSpent * 100).toFixed(1);
        const topName = categoryNames[topCategory] || topCategory;
        
        // Check consistency over last 3 months
        let consistentInsight = '';
        const last3Months = getCategoryTrend(topCategory);
        if (last3Months.length >= 3) {
            const avg = last3Months.reduce((a, b) => a + b, 0) / last3Months.length;
            const current = sorted[0][1] / totalSpent * 100;
            if (Math.abs(current - avg) < 5) {
                consistentInsight = ` "${topName} has consistently been your largest expense over the last three months."`;
            }
        }

        html += `
            <div class="mt-3 p-3 rounded-lg" style="background: var(--bg-primary); border-left: 3px solid ${getCategoryColor(topCategory)};">
                <p class="text-sm text-muted">
                    <i class="fas fa-lightbulb mr-1" style="color: #f59e0b;"></i>
                    Your largest expense this month is <strong>${topName}</strong> at ${topPercentage}% of total spending.
                    ${consistentInsight}
                </p>
            </div>
        `;
    }

    document.getElementById('spending-habits-container').innerHTML = html;
}

function getCategoryTrend(category) {
    const now = new Date();
    const trends = [];
    
    for (let i = 0; i < 3; i++) {
        const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);
        const monthTransactions = transactionsCache.filter(t => 
            t.date >= month && t.date <= monthEnd && 
            t.category === category && t.type === 'expense'
        );
        const total = monthTransactions.reduce((s, t) => s + t.amount, 0);
        const monthExpenses = transactionsCache.filter(t => 
            t.date >= month && t.date <= monthEnd && t.type === 'expense'
        );
        const monthTotal = monthExpenses.reduce((s, t) => s + t.amount, 0);
        trends.push(monthTotal > 0 ? (total / monthTotal) * 100 : 0);
    }
    
    return trends;
}

// ============================================
// 3. LIFESTYLE ANALYSIS
// ============================================
function analyzeLifestyle() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthIncome = transactionsCache.filter(t => t.date >= startOfMonth && t.type === 'income')
        .reduce((s, t) => s + t.amount, 0);
    const monthExpenses = transactionsCache.filter(t => t.date >= startOfMonth && t.type === 'expense')
        .reduce((s, t) => s + t.amount, 0);
    
    const container = document.getElementById('lifestyle-analysis');
    
    if (monthIncome === 0 && monthExpenses === 0) {
        container.innerHTML = '<div class="text-center py-4 text-muted">No data for this month</div>';
        return;
    }

    const savings = monthIncome - monthExpenses;
    const savingsRate = monthIncome > 0 ? (savings / monthIncome * 100) : 0;
    
    let status, statusColor, statusIcon, message;
    
    if (savingsRate > 20) {
        status = 'Living Below Your Means';
        statusColor = '#10b981';
        statusIcon = 'fa-arrow-up';
        message = `Excellent! Your income exceeds your expenses. Savings rate: ${savingsRate.toFixed(0)}%`;
    } else if (savingsRate > 0) {
        status = 'Living Within Your Means';
        statusColor = '#f59e0b';
        statusIcon = 'fa-equals';
        message = `Healthy. No concern. Savings rate: ${savingsRate.toFixed(0)}%`;
    } else {
        status = 'Living Above Your Means';
        statusColor = '#ef4444';
        statusIcon = 'fa-arrow-down';
        message = `⚠️ Warning! Expenses exceed income. Deficit: ${formatCurrency(Math.abs(savings), 'GHS')} this month.`;
    }

    container.innerHTML = `
        <div class="text-center mb-3">
            <div class="text-3xl font-bold" style="color: ${statusColor};">${status}</div>
            <div class="text-sm text-muted mt-1">${message}</div>
        </div>
        <div class="grid grid-cols-2 gap-2 text-center">
            <div class="glass-card rounded-lg p-2">
                <div class="text-xs text-muted">Income</div>
                <div class="font-bold text-emerald-500">${formatCurrency(monthIncome, 'GHS')}</div>
            </div>
            <div class="glass-card rounded-lg p-2">
                <div class="text-xs text-muted">Expenses</div>
                <div class="font-bold text-red-500">${formatCurrency(monthExpenses, 'GHS')}</div>
            </div>
            <div class="glass-card rounded-lg p-2 col-span-2">
                <div class="text-xs text-muted">Savings Rate</div>
                <div class="font-bold" style="color: ${savingsRate >= 0 ? '#10b981' : '#ef4444'};">${savingsRate.toFixed(0)}%</div>
                <div class="h-1.5 rounded-full overflow-hidden mt-1" style="background: var(--border-color);">
                    <div class="h-full rounded-full transition-all" style="width: ${Math.min(Math.abs(savingsRate), 100)}%; background: ${savingsRate >= 0 ? '#10b981' : '#ef4444'};"></div>
                </div>
            </div>
        </div>
    `;
}

// ============================================
// 4. IMPULSE SPENDING DETECTION
// ============================================
function detectImpulseSpending() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Categories considered impulse spending
    const impulseCategories = ['entertainment', 'food', 'shopping'];
    
    const monthTransactions = transactionsCache.filter(t => 
        t.date >= startOfMonth && t.type === 'expense'
    );
    
    const impulseSpending = monthTransactions.filter(t => impulseCategories.includes(t.category));
    const totalImpulse = impulseSpending.reduce((s, t) => s + t.amount, 0);
    const totalSpent = monthTransactions.reduce((s, t) => s + t.amount, 0);
    
    const container = document.getElementById('impulse-spending-container');
    
    if (totalSpent === 0) {
        container.innerHTML = '<div class="text-center py-4 text-muted">No spending data available</div>';
        return;
    }

    // Calculate average daily impulse spending for comparison
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dailyImpulseAvg = totalImpulse / daysInMonth;
    
    // Check for unusual spikes (last 7 days vs previous weeks)
    const lastWeekStart = new Date(now);
    lastWeekStart.setDate(now.getDate() - 7);
    const lastWeekEnd = new Date(now);
    
    const lastWeekTransactions = transactionsCache.filter(t => 
        t.date >= lastWeekStart && t.date <= lastWeekEnd && 
        t.type === 'expense' && impulseCategories.includes(t.category)
    );
    const lastWeekTotal = lastWeekTransactions.reduce((s, t) => s + t.amount, 0);
    const lastWeekAvg = lastWeekTransactions.length > 0 ? lastWeekTotal / lastWeekTransactions.length : 0;
    
    // Get previous week for comparison
    const prevWeekStart = new Date(lastWeekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWeekEnd = new Date(lastWeekStart);
    prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);
    
    const prevWeekTransactions = transactionsCache.filter(t => 
        t.date >= prevWeekStart && t.date <= prevWeekEnd && 
        t.type === 'expense' && impulseCategories.includes(t.category)
    );
    const prevWeekTotal = prevWeekTransactions.reduce((s, t) => s + t.amount, 0);
    const prevWeekAvg = prevWeekTransactions.length > 0 ? prevWeekTotal / prevWeekTransactions.length : 0;
    
    let html = '';
    
    // Show recent impulse purchases
    const recentImpulse = impulseSpending
        .sort((a, b) => b.date - a.date)
        .slice(0, 5);
    
    if (recentImpulse.length > 0) {
        html += `
            <div class="space-y-1 mb-3">
                <div class="text-xs text-muted">Recent impulse purchases</div>
                ${recentImpulse.map(t => `
                    <div class="flex justify-between items-center text-sm p-1.5 rounded" style="background: var(--bg-primary);">
                        <span>${formatDate(t.date)} - ${escapeHtml(t.description)}</span>
                        <span class="font-semibold text-red-500">${formatCurrency(t.amount, 'GHS')}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    // Add insight
    const impulsePercentage = (totalImpulse / totalSpent * 100).toFixed(1);
    let insight = '';
    
    if (lastWeekAvg > prevWeekAvg * 1.3 && prevWeekAvg > 0) {
        const increase = ((lastWeekAvg - prevWeekAvg) / prevWeekAvg * 100).toFixed(0);
        insight = `⚠️ Entertainment and fast food spending increased by ${increase}% compared to your average.`;
    } else if (impulsePercentage > 40) {
        insight = `⚠️ ${impulsePercentage}% of your spending is on entertainment and dining out. Consider meal prepping to save more.`;
    } else if (impulsePercentage < 20) {
        insight = `✅ Great job! Only ${impulsePercentage}% of your spending is on discretionary items.`;
    } else {
        insight = `${impulsePercentage}% of your spending is on entertainment and dining out.`;
    }
    
    html += `
        <div class="p-3 rounded-lg" style="background: var(--bg-primary); border-left: 3px solid #f59e0b;">
            <div class="flex justify-between text-sm">
                <span>Impulse spending this month</span>
                <span class="font-bold">${formatCurrency(totalImpulse, 'GHS')}</span>
            </div>
            <div class="flex justify-between text-sm text-muted">
                <span>${impulsePercentage}% of total spending</span>
                <span>${recentImpulse.length} transactions</span>
            </div>
            <p class="text-sm text-muted mt-2">${insight}</p>
        </div>
    `;
    
    container.innerHTML = html;
}

// ============================================
// 5. FINANCIAL HEALTH SCORE
// ============================================
function calculateFinancialHealthScore() {
    const container = document.getElementById('health-score-container');
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Calculate metrics
    const monthIncome = transactionsCache.filter(t => t.date >= startOfMonth && t.type === 'income')
        .reduce((s, t) => s + t.amount, 0);
    const monthExpenses = transactionsCache.filter(t => t.date >= startOfMonth && t.type === 'expense')
        .reduce((s, t) => s + t.amount, 0);
    
    // Income Stability (based on consistency of income over last 3 months)
    let incomeStability = 0;
    const incomeHistory = [];
    for (let i = 0; i < 3; i++) {
        const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);
        const total = transactionsCache.filter(t => 
            t.date >= month && t.date <= monthEnd && t.type === 'income'
        ).reduce((s, t) => s + t.amount, 0);
        incomeHistory.push(total);
    }
    if (incomeHistory.length >= 2) {
        const avg = incomeHistory.reduce((a, b) => a + b, 0) / incomeHistory.length;
        const variance = incomeHistory.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / incomeHistory.length;
        const stdDev = Math.sqrt(variance);
        incomeStability = avg > 0 ? Math.max(0, 100 - (stdDev / avg) * 100) : 0;
    }
    
    // Savings Rate
    const savingsRate = monthIncome > 0 ? ((monthIncome - monthExpenses) / monthIncome * 100) : 0;
    const savingsScore = Math.min(100, Math.max(0, (savingsRate / 50) * 100));
    
    // Debt Score (based on debt to income ratio)
    const totalDebt = debtsCache.filter(d => d.status !== 'paid').reduce((s, d) => s + (d.amount - (d.paidAmount || 0)), 0);
    const debtRatio = monthIncome > 0 ? (totalDebt / monthIncome) : 0;
    const debtScore = Math.min(100, Math.max(0, 100 - (debtRatio * 100)));
    
    // Impulse Spending Score
    const impulseCategories = ['entertainment', 'food', 'shopping'];
    const impulseTotal = transactionsCache.filter(t => 
        t.date >= startOfMonth && t.type === 'expense' && impulseCategories.includes(t.category)
    ).reduce((s, t) => s + t.amount, 0);
    const impulseRatio = monthExpenses > 0 ? (impulseTotal / monthExpenses) : 0;
    const impulseScore = Math.min(100, Math.max(0, 100 - (impulseRatio * 100)));
    
    // Investment Score
    const investmentTotal = transactionsCache.filter(t => 
        t.category === 'investment' && t.type === 'income'
    ).reduce((s, t) => s + t.amount, 0);
    const investmentRatio = monthIncome > 0 ? (investmentTotal / monthIncome * 100) : 0;
    const investmentScore = Math.min(100, Math.max(0, (investmentRatio / 20) * 100));
    
    // Bills Score (on-time payments)
    const billTransactions = transactionsCache.filter(t => 
        t.category === 'bills' || t.category === 'utilities'
    );
    const billsScore = 100; // Default to good, could be enhanced with actual bill payment data
    
    // Calculate overall score
    const weights = {
        incomeStability: 0.20,
        savings: 0.20,
        debt: 0.18,
        impulse: 0.15,
        investment: 0.12,
        bills: 0.15
    };
    
    const overallScore = Math.round(
        incomeStability * weights.incomeStability +
        savingsScore * weights.savings +
        debtScore * weights.debt +
        impulseScore * weights.impulse +
        investmentScore * weights.investment +
        billsScore * weights.bills
    );
    
    const scoreColor = overallScore >= 80 ? '#10b981' : overallScore >= 60 ? '#f59e0b' : '#ef4444';
    const scoreLabel = overallScore >= 80 ? 'Excellent' : overallScore >= 60 ? 'Good' : 'Needs Improvement';
    
    container.innerHTML = `
        <div class="text-center">
            <div class="relative inline-block">
                <svg class="w-24 h-24">
                    <circle cx="48" cy="48" r="40" fill="none" stroke="var(--border-color)" stroke-width="8"/>
                    <circle cx="48" cy="48" r="40" fill="none" stroke="${scoreColor}" stroke-width="8"
                            stroke-dasharray="${overallScore * 2.51} 251.2"
                            stroke-linecap="round"
                            transform="rotate(-90 48 48)"/>
                </svg>
                <div class="absolute inset-0 flex flex-col items-center justify-center">
                    <span class="text-2xl font-bold" style="color: ${scoreColor};">${overallScore}</span>
                    <span class="text-xs text-muted">/100</span>
                </div>
            </div>
            <div class="mt-2">
                <span class="px-3 py-1 rounded-full text-sm font-semibold" style="background: ${scoreColor}20; color: ${scoreColor};">
                    ${scoreLabel}
                </span>
            </div>
        </div>
        <div class="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3">
            ${Object.entries({
                'Income Stability': incomeStability,
                'Savings': savingsScore,
                'Debt': debtScore,
                'Impulse': impulseScore,
                'Investment': investmentScore,
                'Bills': billsScore
            }).map(([label, value]) => `
                <div class="text-center p-1.5 rounded-lg" style="background: var(--bg-primary);">
                    <div class="text-xs text-muted">${label}</div>
                    <div class="text-sm font-bold" style="color: ${value >= 70 ? '#10b981' : value >= 50 ? '#f59e0b' : '#ef4444'};">${Math.round(value)}%</div>
                </div>
            `).join('')}
        </div>
    `;
}

// ============================================
// 6. CASH FLOW INTELLIGENCE
// ============================================
function updateCashFlowIntelligence() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    const monthIncome = transactionsCache.filter(t => t.date >= startOfMonth && t.type === 'income')
        .reduce((s, t) => s + t.amount, 0);
    const monthExpenses = transactionsCache.filter(t => t.date >= startOfMonth && t.type === 'expense')
        .reduce((s, t) => s + t.amount, 0);
    
    const remaining = monthIncome - monthExpenses;
    
    // Expected bills (based on past bill patterns)
    const billCategories = ['bills', 'utilities'];
    const pastBills = transactionsCache.filter(t => 
        billCategories.includes(t.category) && t.type === 'expense'
    );
    
    // Predict bills based on average of last 3 months
    let expectedBills = 0;
    for (let i = 0; i < 3; i++) {
        const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);
        const total = transactionsCache.filter(t => 
            t.date >= month && t.date <= monthEnd && 
            billCategories.includes(t.category) && t.type === 'expense'
        ).reduce((s, t) => s + t.amount, 0);
        expectedBills += total;
    }
    expectedBills = expectedBills / 3;
    
    const freeCash = remaining - expectedBills;
    
    document.getElementById('cash-in').textContent = formatCurrency(monthIncome, 'GHS');
    document.getElementById('cash-out').textContent = formatCurrency(monthExpenses, 'GHS');
    document.getElementById('cash-remaining').textContent = formatCurrency(remaining, 'GHS');
    document.getElementById('expected-bills').textContent = formatCurrency(expectedBills, 'GHS');
    document.getElementById('free-cash').textContent = formatCurrency(freeCash, 'GHS');
    
    // Color coding
    document.getElementById('free-cash').style.color = freeCash >= 0 ? '#10b981' : '#ef4444';
}

// ============================================
// 7. MONTHLY FINANCIAL REVIEW
// ============================================
async function generateMonthlyReview() {
    const now = new Date();
    const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    const monthTransactions = transactionsCache.filter(t => t.date >= startOfMonth && t.date <= endOfMonth);
    const monthIncome = monthTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const monthExpenses = monthTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const savings = monthIncome - monthExpenses;
    
    // Find largest expense category
    const expenseByCategory = {};
    monthTransactions.filter(t => t.type === 'expense').forEach(t => {
        expenseByCategory[t.category] = (expenseByCategory[t.category] || 0) + t.amount;
    });
    const sortedExpenses = Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1]);
    const largestExpense = sortedExpenses.length > 0 ? sortedExpenses[0] : ['None', 0];
    const categoryNames = {
        food: 'Food', transport: 'Transport', housing: 'Housing', utilities: 'Utilities',
        entertainment: 'Entertainment', shopping: 'Shopping', health: 'Health', 
        education: 'Education', bills: 'Bills', 'other-expense': 'Other'
    };
    
    // Find best saving week
    let bestSavingWeek = 'N/A';
    let bestSavingAmount = 0;
    for (let week = 0; week < 4; week++) {
        const weekStart = new Date(startOfMonth);
        weekStart.setDate(weekStart.getDate() + week * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const weekIncome = transactionsCache.filter(t => 
            t.date >= weekStart && t.date <= weekEnd && t.type === 'income'
        ).reduce((s, t) => s + t.amount, 0);
        const weekExpenses = transactionsCache.filter(t => 
            t.date >= weekStart && t.date <= weekEnd && t.type === 'expense'
        ).reduce((s, t) => s + t.amount, 0);
        const weekSavings = weekIncome - weekExpenses;
        if (weekSavings > bestSavingAmount) {
            bestSavingAmount = weekSavings;
            bestSavingWeek = `Week ${week + 1}`;
        }
    }
    
    // Find worst spending day
    const spendingByDay = {};
    monthTransactions.filter(t => t.type === 'expense').forEach(t => {
        const day = t.date.toDateString();
        spendingByDay[day] = (spendingByDay[day] || 0) + t.amount;
    });
    const sortedDays = Object.entries(spendingByDay).sort((a, b) => b[1] - a[1]);
    const worstSpendingDay = sortedDays.length > 0 ? sortedDays[0] : ['None', 0];
    
    // Impulse purchases
    const impulseCategories = ['entertainment', 'food', 'shopping'];
    const impulseTotal = monthTransactions.filter(t => 
        t.type === 'expense' && impulseCategories.includes(t.category)
    ).reduce((s, t) => s + t.amount, 0);
    
    // Recommendations
    const recommendations = [];
    const savingsRate = monthIncome > 0 ? (savings / monthIncome * 100) : 0;
    if (savingsRate < 20) {
        recommendations.push('Your savings rate is below 20%. Consider reducing discretionary spending to increase savings.');
    }
    if (impulseTotal > monthExpenses * 0.3) {
        recommendations.push('High impulse spending detected. Try meal prepping and limiting dining out.');
    }
    if (sortedExpenses.length > 0 && sortedExpenses[0][1] > monthExpenses * 0.4) {
        const topCat = categoryNames[sortedExpenses[0][0]] || sortedExpenses[0][0];
        recommendations.push(`Your ${topCat} spending is ${(sortedExpenses[0][1]/monthExpenses*100).toFixed(0)}% of total expenses. Consider looking for ways to reduce this.`);
    }
    if (recommendations.length === 0) {
        recommendations.push('Great job! You\'re maintaining a healthy financial balance. Keep it up!');
    }
    
    // Generate review HTML
    const reviewHtml = `
        <div class="space-y-3 p-4 rounded-xl" style="background: var(--bg-primary);">
            <h4 class="text-lg font-bold" style="color: var(--text-primary);">Financial Summary — ${monthName}</h4>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div class="text-center p-2 rounded-lg" style="background: var(--bg-secondary);">
                    <div class="text-xs text-muted">Income</div>
                    <div class="font-bold text-emerald-500">${formatCurrency(monthIncome, 'GHS')}</div>
                </div>
                <div class="text-center p-2 rounded-lg" style="background: var(--bg-secondary);">
                    <div class="text-xs text-muted">Expenses</div>
                    <div class="font-bold text-red-500">${formatCurrency(monthExpenses, 'GHS')}</div>
                </div>
                <div class="text-center p-2 rounded-lg" style="background: var(--bg-secondary);">
                    <div class="text-xs text-muted">Savings</div>
                    <div class="font-bold" style="color: ${savings >= 0 ? '#10b981' : '#ef4444'};">${formatCurrency(savings, 'GHS')}</div>
                </div>
                <div class="text-center p-2 rounded-lg" style="background: var(--bg-secondary);">
                    <div class="text-xs text-muted">Largest Expense</div>
                    <div class="font-bold text-sm">${categoryNames[largestExpense[0]] || largestExpense[0]}</div>
                    <div class="text-xs text-muted">${formatCurrency(largestExpense[1], 'GHS')}</div>
                </div>
                <div class="text-center p-2 rounded-lg" style="background: var(--bg-secondary);">
                    <div class="text-xs text-muted">Best Saving Week</div>
                    <div class="font-bold text-sm">${bestSavingWeek}</div>
                    <div class="text-xs text-muted">${formatCurrency(bestSavingAmount, 'GHS')}</div>
                </div>
                <div class="text-center p-2 rounded-lg" style="background: var(--bg-secondary);">
                    <div class="text-xs text-muted">Worst Spending Day</div>
                    <div class="font-bold text-sm">${worstSpendingDay[0] !== 'None' ? new Date(worstSpendingDay[0]).toLocaleDateString() : 'None'}</div>
                    <div class="text-xs text-muted">${formatCurrency(worstSpendingDay[1], 'GHS')}</div>
                </div>
            </div>
            <div class="p-3 rounded-lg" style="background: var(--bg-secondary);">
                <div class="text-sm font-semibold">Impulse Purchases</div>
                <div class="text-sm text-muted">${formatCurrency(impulseTotal, 'GHS')} spent on entertainment, food, and shopping this month.</div>
            </div>
            <div class="p-3 rounded-lg" style="background: var(--bg-secondary); border-left: 3px solid #f59e0b;">
                <div class="text-sm font-semibold">📋 Recommendations</div>
                <ul class="text-sm text-muted list-disc list-inside">
                    ${recommendations.map(r => `<li>${r}</li>`).join('')}
                </ul>
            </div>
            <div class="flex gap-2">
                <button onclick="window.FinanceApp.exportReviewPDF()" class="flex-1 py-2 rounded-lg font-semibold text-sm" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                    <i class="fas fa-file-pdf mr-1"></i> Export as PDF
                </button>
                <button onclick="window.FinanceApp.shareReview()" class="flex-1 py-2 rounded-lg font-semibold text-sm" style="background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary);">
                    <i class="fas fa-share-alt mr-1"></i> Share
                </button>
            </div>
        </div>
    `;
    
    document.getElementById('monthly-review-container').innerHTML = reviewHtml;
    document.getElementById('monthly-review-container').className = '';
}

// ============================================
// 8. NEEDS VS WANTS ANALYSIS
// ============================================
function analyzeNeedsVsWants() {
    const container = document.getElementById('needs-wants-container');
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Need categories (essential)
    const needCategories = ['housing', 'utilities', 'bills', 'health', 'education', 'transport'];
    // Want categories (non-essential)
    const wantCategories = ['entertainment', 'shopping', 'food']; // food can be either, but we'll treat dining out as want
    
    const monthTransactions = transactionsCache.filter(t => t.date >= startOfMonth && t.type === 'expense');
    
    let needsTotal = 0;
    let wantsTotal = 0;
    let uncategorizedTotal = 0;
    
    monthTransactions.forEach(t => {
        if (needCategories.includes(t.category)) {
            needsTotal += t.amount;
        } else if (wantCategories.includes(t.category)) {
            wantsTotal += t.amount;
        } else {
            // For food, we need to check if it's dining out or groceries
            // For now, let's check if it contains keywords
            if (t.category === 'food') {
                const desc = t.description.toLowerCase();
                if (desc.includes('restaurant') || desc.includes('kfc') || desc.includes('pizza') || 
                    desc.includes('burger') || desc.includes('dining') || desc.includes('eat out') ||
                    desc.includes('takeout') || desc.includes('take-out')) {
                    wantsTotal += t.amount;
                } else {
                    needsTotal += t.amount;
                }
            } else {
                uncategorizedTotal += t.amount;
            }
        }
    });
    
    const total = needsTotal + wantsTotal + uncategorizedTotal;
    
    if (total === 0) {
        container.innerHTML = '<div class="text-center py-4 text-muted">No expense data for this month</div>';
        return;
    }
    
    const needsPercentage = (needsTotal / total * 100).toFixed(0);
    const wantsPercentage = (wantsTotal / total * 100).toFixed(0);
    
    const needsColor = '#10b981';
    const wantsColor = '#f59e0b';
    
    let advice = '';
    if (parseInt(wantsPercentage) > 30) {
        advice = 'Your discretionary spending increased this month. Consider reducing non-essential purchases if you\'re working toward your savings goal.';
    } else if (parseInt(wantsPercentage) < 15) {
        advice = 'Excellent work! You\'re keeping discretionary spending very low.';
    } else {
        advice = 'You have a healthy balance between needs and wants.';
    }
    
    container.innerHTML = `
        <div class="space-y-3">
            <div class="flex justify-center gap-6">
                <div class="text-center">
                    <div class="text-2xl font-bold" style="color: ${needsColor};">${needsPercentage}%</div>
                    <div class="text-xs text-muted">Needs</div>
                </div>
                <div class="text-center">
                    <div class="text-2xl font-bold" style="color: ${wantsColor};">${wantsPercentage}%</div>
                    <div class="text-xs text-muted">Wants</div>
                </div>
                <div class="text-center">
                    <div class="text-2xl font-bold" style="color: #6b7280;">${(100 - parseInt(needsPercentage) - parseInt(wantsPercentage))}%</div>
                    <div class="text-xs text-muted">Other</div>
                </div>
            </div>
            <div class="h-3 rounded-full overflow-hidden flex">
                <div class="h-full" style="width: ${needsPercentage}%; background: ${needsColor};"></div>
                <div class="h-full" style="width: ${wantsPercentage}%; background: ${wantsColor};"></div>
                <div class="h-full" style="width: ${100 - parseInt(needsPercentage) - parseInt(wantsPercentage)}%; background: #6b7280;"></div>
            </div>
            <div class="flex justify-between text-xs text-muted">
                <span>Needs: ${formatCurrency(needsTotal, 'GHS')}</span>
                <span>Wants: ${formatCurrency(wantsTotal, 'GHS')}</span>
            </div>
            <div class="p-2 rounded-lg" style="background: var(--bg-primary); border-left: 3px solid #f59e0b;">
                <p class="text-sm text-muted">${advice}</p>
            </div>
        </div>
    `;
}

// ============================================
// 9. SMART BUDGET COACH
// ============================================
function updateSmartBudgetCoach() {
    const container = document.getElementById('budgets-container');
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const categoryNames = {
        food: 'Food & Dining', transport: 'Transport', housing: 'Housing', 
        utilities: 'Utilities', entertainment: 'Entertainment', shopping: 'Shopping', 
        health: 'Health', education: 'Education', bills: 'Bills', 'other-expense': 'Other'
    };
    
    const monthExpenses = transactionsCache.filter(t => t.date >= startOfMonth && t.type === 'expense');
    
    if (budgetsCache.length === 0) {
        container.innerHTML = `
            <div class="text-center py-4 text-muted">No budgets set. Click "Manage Budgets" to start planning.</div>
            <div class="mt-2 p-3 rounded-lg" style="background: var(--bg-primary); border-left: 3px solid var(--deep-blue);">
                <p class="text-sm text-muted">
                    <i class="fas fa-lightbulb mr-1" style="color: #f59e0b;"></i>
                    Based on your spending patterns, here are some suggested budgets:
                </p>
                ${getSuggestedBudgets().map(s => `
                    <div class="flex justify-between text-sm mt-1">
                        <span>${categoryNames[s.category] || s.category}</span>
                        <span class="font-semibold">${formatCurrency(s.amount, 'GHS')}</span>
                    </div>
                `).join('')}
            </div>
        `;
        return;
    }
    
    let html = '';
    budgetsCache.forEach(budget => {
        const spent = monthExpenses.filter(t => t.category === budget.category).reduce((s, t) => s + t.amount, 0);
        const percentage = (spent / budget.amount) * 100;
        const isOver = percentage > 100;
        const status = isOver ? 'Over budget' : percentage > 80 ? 'Near limit' : 'On track';
        const statusColor = isOver ? '#ef4444' : percentage > 80 ? '#f59e0b' : '#10b981';
        
        html += `
            <div>
                <div class="flex justify-between text-sm">
                    <span>${categoryNames[budget.category] || budget.category}</span>
                    <span class="${isOver ? 'text-red-500' : ''}">${formatCurrency(spent, 'GHS')} / ${formatCurrency(budget.amount, 'GHS')}</span>
                </div>
                <div class="h-2 rounded-full overflow-hidden" style="background: var(--border-color);">
                    <div class="h-full rounded-full transition-all" style="width: ${Math.min(percentage, 100)}%; background: ${statusColor};"></div>
                </div>
                <div class="flex justify-between text-xs mt-0.5">
                    <span style="color: ${statusColor};">${status}</span>
                    <span class="text-muted">${percentage.toFixed(0)}%</span>
                </div>
            </div>
        `;
    });
    
    // Add AI insight
    const totalBudgeted = budgetsCache.reduce((s, b) => s + b.amount, 0);
    const totalSpent = monthExpenses.reduce((s, t) => s + t.amount, 0);
    const overBudget = budgetsCache.filter(b => {
        const spent = monthExpenses.filter(t => t.category === b.category).reduce((s, t) => s + t.amount, 0);
        return spent > b.amount;
    });
    
    let insight = '';
    if (overBudget.length > 0) {
        const categories = overBudget.map(b => categoryNames[b.category] || b.category).join(', ');
        insight = `⚠️ You've exceeded your budget in: ${categories}. Consider adjusting your spending or budget.`;
    } else if (totalSpent < totalBudgeted * 0.7) {
        insight = `✅ You're spending below your total budget. Great job! You have room to save more.`;
    } else if (totalSpent > totalBudgeted * 0.9) {
        insight = `⚠️ You're approaching your total budget limit. ${totalBudgeted - totalSpent > 0 ? `Only ${formatCurrency(totalBudgeted - totalSpent, 'GHS')} remaining.` : ''}`;
    } else {
        insight = `📊 You're on track with your budget. Keep up the good work!`;
    }
    
    html += `
        <div class="mt-3 p-3 rounded-lg" style="background: var(--bg-primary); border-left: 3px solid #f59e0b;">
            <p class="text-sm text-muted">
                <i class="fas fa-robot mr-1" style="color: var(--deep-blue);"></i>
                ${insight}
            </p>
        </div>
    `;
    
    container.innerHTML = html;
}

function getSuggestedBudgets() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthExpenses = transactionsCache.filter(t => t.date >= startOfMonth && t.type === 'expense');
    
    const categoryTotals = {};
    monthExpenses.forEach(t => {
        categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
    });
    
    // If no data, return default suggestions
    if (Object.keys(categoryTotals).length === 0) {
        return [
            { category: 'food', amount: 1000 },
            { category: 'transport', amount: 500 },
            { category: 'utilities', amount: 400 },
            { category: 'entertainment', amount: 300 }
        ];
    }
    
    // Use 120% of average monthly spending as suggested budget
    const suggestions = Object.entries(categoryTotals).map(([category, total]) => ({
        category: category,
        amount: Math.round(total * 1.2 / 100) * 100 // Round to nearest 100
    }));
    
    // Sort by amount descending and take top 5
    return suggestions.sort((a, b) => b.amount - a.amount).slice(0, 5);
}

// ============================================
// 10. SAVINGS COACH
// ============================================
function updateSavingsCoach() {
    const container = document.getElementById('savings-coach-container');
    
    if (financialGoalsCache.length === 0) {
        container.innerHTML = `
            <div class="text-center py-4 text-muted">No savings goals set. Click "Set Goal" to get started.</div>
            <div class="mt-2 p-3 rounded-lg" style="background: var(--bg-primary); border-left: 3px solid #10b981;">
                <p class="text-sm text-muted">
                    <i class="fas fa-lightbulb mr-1" style="color: #f59e0b;"></i>
                    Saving just ${formatCurrency(200, 'GHS')} per month can build a ${formatCurrency(2400, 'GHS')} emergency fund in a year.
                </p>
            </div>
        `;
        return;
    }
    
    const now = new Date();
    let html = '';
    
    financialGoalsCache.forEach(goal => {
        const progress = (goal.currentAmount / goal.targetAmount) * 100;
        const remaining = goal.targetAmount - goal.currentAmount;
        
        // Calculate monthly savings needed
        const monthsRemaining = Math.max(1, (goal.targetDate - now) / (1000 * 60 * 60 * 24 * 30));
        const monthlyNeeded = remaining / monthsRemaining;
        
        // Get average monthly savings from transactions
        let avgMonthlySavings = 0;
        for (let i = 0; i < 3; i++) {
            const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);
            const monthIncome = transactionsCache.filter(t => 
                t.date >= month && t.date <= monthEnd && t.type === 'income'
            ).reduce((s, t) => s + t.amount, 0);
            const monthExpenses = transactionsCache.filter(t => 
                t.date >= month && t.date <= monthEnd && t.type === 'expense'
            ).reduce((s, t) => s + t.amount, 0);
            avgMonthlySavings += (monthIncome - monthExpenses);
        }
        avgMonthlySavings = avgMonthlySavings / 3;
        
        let insight = '';
        if (avgMonthlySavings >= monthlyNeeded) {
            insight = `✅ You're on track! Save ${formatCurrency(monthlyNeeded, 'GHS')} monthly to reach your goal in ${Math.round(monthsRemaining)} months.`;
        } else {
            const shortfall = monthlyNeeded - avgMonthlySavings;
            insight = `⚠️ You need to save ${formatCurrency(monthlyNeeded, 'GHS')} monthly to reach your goal in ${Math.round(monthsRemaining)} months.`;
            
            // Find potential savings from impulse spending
            const impulseCategories = ['entertainment', 'food', 'shopping'];
            const monthExpenses = transactionsCache.filter(t => 
                t.date >= new Date(now.getFullYear(), now.getMonth(), 1) && 
                t.type === 'expense' && 
                impulseCategories.includes(t.category)
            );
            const impulseTotal = monthExpenses.reduce((s, t) => s + t.amount, 0);
            const avgDailyImpulse = monthExpenses.length > 0 ? impulseTotal / 30 : 0;
            
            if (avgDailyImpulse > 10 && avgDailyImpulse * 30 > monthlyNeeded) {
                insight += ` Reduce entertainment spending by ${formatCurrency(Math.min(shortfall, avgDailyImpulse * 30), 'GHS')} per month to reach your goal ${Math.round(shortfall / (avgDailyImpulse * 30) * monthsRemaining)} months earlier.`;
            }
        }
        
        html += `
            <div class="glass-card rounded-xl p-3">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div>
                        <div class="font-semibold">🎯 ${escapeHtml(goal.name)}</div>
                        <div class="text-sm text-muted">Target: ${formatCurrency(goal.targetAmount, 'GHS')}</div>
                        <div class="text-sm text-muted">Progress: ${progress.toFixed(0)}%</div>
                    </div>
                    <div class="text-right">
                        <div class="text-lg font-bold" style="color: ${progress >= 100 ? '#10b981' : '#f59e0b'};">${formatCurrency(goal.currentAmount, 'GHS')}</div>
                        <div class="text-xs text-muted">of ${formatCurrency(goal.targetAmount, 'GHS')}</div>
                    </div>
                </div>
                <div class="mt-2">
                    <div class="h-2 rounded-full overflow-hidden" style="background: var(--border-color);">
                        <div class="h-full rounded-full transition-all" style="width: ${Math.min(progress, 100)}%; background: ${progress >= 100 ? '#10b981' : progress > 50 ? '#f59e0b' : '#ef4444'};"></div>
                    </div>
                </div>
                <div class="mt-2 p-2 rounded-lg text-sm" style="background: var(--bg-primary);">
                    <p class="text-muted">${insight}</p>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// ============================================
// 11. SUBSCRIPTION TRACKER
// ============================================
async function loadSubscriptions() {
    try {
        const q = query(collection(db, 'subscriptions'), where('userId', '==', currentUser.uid), orderBy('nextRenewal', 'asc'));
        const querySnapshot = await getDocs(q);
        subscriptionsCache = querySnapshot.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data(),
            nextRenewal: doc.data().nextRenewal?.toDate?.() || new Date(doc.data().nextRenewal),
            createdAt: doc.data().createdAt?.toDate?.() || new Date()
        }));
        renderSubscriptions();
    } catch (error) {
        console.error('Error loading subscriptions:', error);
    }
}

function renderSubscriptions() {
    const container = document.getElementById('subscriptions-container');
    if (!container) return;

    if (subscriptionsCache.length === 0) {
        container.innerHTML = `
            <div class="text-center py-4 text-muted">
                <i class="fas fa-repeat text-2xl mb-2"></i>
                <p>No subscriptions tracked. Add your recurring subscriptions to get reminders.</p>
            </div>
        `;
        return;
    }

    const now = new Date();
    const sevenDays = new Date(now);
    sevenDays.setDate(sevenDays.getDate() + 7);

    container.innerHTML = subscriptionsCache.map(sub => {
        const daysUntilRenewal = Math.ceil((sub.nextRenewal - now) / (1000 * 60 * 60 * 24));
        const isUpcoming = daysUntilRenewal <= 7 && daysUntilRenewal > 0;
        const isOverdue = daysUntilRenewal < 0;
        const statusColor = isOverdue ? '#ef4444' : isUpcoming ? '#f59e0b' : '#10b981';
        
        return `
            <div class="glass-card rounded-xl p-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 transition-all hover:shadow-md">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background: ${sub.color || '#8b5cf6'}20;">
                        <i class="fas ${sub.icon || 'fa-repeat'}" style="color: ${sub.color || '#8b5cf6'};"></i>
                    </div>
                    <div>
                        <div class="font-semibold">${escapeHtml(sub.name)}</div>
                        <div class="text-sm text-muted">${formatCurrency(sub.amount, 'GHS')} ${sub.frequency || 'monthly'}</div>
                        ${sub.category ? `<div class="text-xs text-muted">${escapeHtml(sub.category)}</div>` : ''}
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-sm" style="color: ${statusColor};">
                        ${isOverdue ? '⚠️ Overdue' : isUpcoming ? `Renews in ${daysUntilRenewal} days` : `Renews in ${daysUntilRenewal} days`}
                    </div>
                    <div class="text-xs text-muted">Next: ${formatDate(sub.nextRenewal)}</div>
                    <div class="flex gap-1 mt-1 justify-end">
                        <button onclick="window.FinanceApp.editSubscription('${sub.id}')" class="text-xs px-2 py-0.5 rounded" style="background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary);">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="window.FinanceApp.deleteSubscription('${sub.id}')" class="text-xs px-2 py-0.5 rounded" style="background: var(--bg-secondary); border: 1px solid var(--border-color); color: #ef4444;">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// 12. BILL PREDICTOR
// ============================================
async function loadRecurringBills() {
    try {
        const q = query(collection(db, 'recurringBills'), where('userId', '==', currentUser.uid), orderBy('nextDue', 'asc'));
        const querySnapshot = await getDocs(q);
        recurringBillsCache = querySnapshot.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data(),
            nextDue: doc.data().nextDue?.toDate?.() || new Date(doc.data().nextDue),
            createdAt: doc.data().createdAt?.toDate?.() || new Date()
        }));
        renderBills();
    } catch (error) {
        console.error('Error loading recurring bills:', error);
    }
}

function renderBills() {
    const container = document.getElementById('bills-container');
    if (!container) return;

    // Also auto-detect bills from transactions
    detectRecurringBillsFromTransactions();

    const allBills = [...recurringBillsCache];
    const now = new Date();
    const thirtyDays = new Date(now);
    thirtyDays.setDate(thirtyDays.getDate() + 30);

    const upcomingBills = allBills.filter(b => b.nextDue <= thirtyDays && b.nextDue >= now);
    const overdueBills = allBills.filter(b => b.nextDue < now);

    document.getElementById('bill-count-badge').textContent = `${upcomingBills.length} upcoming bills`;

    if (allBills.length === 0 && !hasDetectedBills) {
        container.innerHTML = `
            <div class="text-center py-4 text-muted">
                <i class="fas fa-calendar-check text-2xl mb-2"></i>
                <p>No bills tracked. Add recurring bills or they will be auto-detected from your transactions.</p>
            </div>
        `;
        return;
    }

    const sortedBills = [...allBills].sort((a, b) => a.nextDue - b.nextDue);
    
    container.innerHTML = sortedBills.map(bill => {
        const daysUntilDue = Math.ceil((bill.nextDue - now) / (1000 * 60 * 60 * 24));
        const isOverdue = daysUntilDue < 0;
        const isUpcoming = daysUntilDue <= 7 && daysUntilDue >= 0;
        const statusColor = isOverdue ? '#ef4444' : isUpcoming ? '#f59e0b' : '#06b6d4';
        const statusLabel = isOverdue ? 'Overdue' : isUpcoming ? 'Due soon' : `Due in ${daysUntilDue} days`;
        
        return `
            <div class="glass-card rounded-xl p-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 transition-all hover:shadow-md" style="border-left: 3px solid ${statusColor};">
                <div>
                    <div class="font-semibold">${escapeHtml(bill.name)}</div>
                    <div class="text-sm text-muted">${escapeHtml(bill.category || 'Bill')} • ${bill.frequency || 'monthly'}</div>
                    <div class="text-xs text-muted">${formatDate(bill.nextDue)}</div>
                </div>
                <div class="text-right">
                    <div class="font-bold">${formatCurrency(bill.estimatedAmount || bill.amount, 'GHS')}</div>
                    <div class="text-xs" style="color: ${statusColor};">${statusLabel}</div>
                    <button onclick="window.FinanceApp.markBillPaid('${bill.id}')" class="text-xs px-2 py-0.5 rounded mt-1" style="background: var(--emerald); color: white;">
                        <i class="fas fa-check"></i> Mark Paid
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

let hasDetectedBills = false;

function detectRecurringBillsFromTransactions() {
    const billCategories = ['bills', 'utilities', 'rent', 'insurance'];
    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    
    const recentBills = transactionsCache.filter(t => 
        t.date >= threeMonthsAgo && 
        t.type === 'expense' && 
        billCategories.includes(t.category)
    );
    
    // Group by description to find recurring patterns
    const billGroups = {};
    recentBills.forEach(t => {
        const key = t.description.toLowerCase().trim();
        if (!billGroups[key]) billGroups[key] = [];
        billGroups[key].push(t);
    });
    
    // Find transactions that appear at least 2 times in 3 months
    const detectedBills = [];
    Object.entries(billGroups).forEach(([description, transactions]) => {
        if (transactions.length >= 2) {
            const avgAmount = transactions.reduce((s, t) => s + t.amount, 0) / transactions.length;
            // Sort by date
            const sorted = transactions.sort((a, b) => a.date - b.date);
            const lastDate = sorted[sorted.length - 1].date;
            const nextDue = new Date(lastDate);
            nextDue.setMonth(nextDue.getMonth() + 1);
            
            // Check if this bill is already in cache
            const exists = recurringBillsCache.some(b => 
                b.name.toLowerCase() === description && 
                Math.abs((b.estimatedAmount || b.amount) - avgAmount) < 50
            );
            
            if (!exists) {
                detectedBills.push({
                    name: description,
                    category: transactions[0].category || 'bill',
                    amount: avgAmount,
                    estimatedAmount: avgAmount,
                    frequency: 'monthly',
                    nextDue: nextDue,
                    isAutoDetected: true,
                    userId: currentUser.uid,
                    createdAt: serverTimestamp()
                });
            }
        }
    });
    
    // Save detected bills
    if (detectedBills.length > 0) {
        hasDetectedBills = true;
        detectedBills.forEach(async (bill) => {
            try {
                await addDoc(collection(db, 'recurringBills'), bill);
            } catch (e) {
                console.error('Error saving detected bill:', e);
            }
        });
        // Reload bills after saving
        setTimeout(loadRecurringBills, 1000);
    }
}

// ============================================
// 13. FINANCIAL ADVISOR
// ============================================
function updateFinancialAdvisor() {
    const messageEl = document.getElementById('ai-advisor-message');
    if (!messageEl) return;
    
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    
    // Current month vs last month
    const currentIncome = transactionsCache.filter(t => t.date >= startOfMonth && t.type === 'income')
        .reduce((s, t) => s + t.amount, 0);
    const currentExpenses = transactionsCache.filter(t => t.date >= startOfMonth && t.type === 'expense')
        .reduce((s, t) => s + t.amount, 0);
    const currentSavings = currentIncome - currentExpenses;
    
    const lastIncome = transactionsCache.filter(t => t.date >= lastMonth && t.date <= lastMonthEnd && t.type === 'income')
        .reduce((s, t) => s + t.amount, 0);
    const lastExpenses = transactionsCache.filter(t => t.date >= lastMonth && t.date <= lastMonthEnd && t.type === 'expense')
        .reduce((s, t) => s + t.amount, 0);
    const lastSavings = lastIncome - lastExpenses;
    
    let messages = [];
    
    // Income comparison
    if (currentIncome > lastIncome && lastIncome > 0) {
        const increase = ((currentIncome - lastIncome) / lastIncome * 100).toFixed(0);
        messages.push(`You earned ${increase}% more than last month.`);
        if (currentSavings - lastSavings < 0) {
            messages.push(`But your savings increased by only ${lastSavings > 0 ? ((currentSavings - lastSavings) / lastSavings * 100).toFixed(0) : '0'}%. Consider allocating part of the additional income toward your emergency fund.`);
        }
    } else if (currentIncome < lastIncome && lastIncome > 0) {
        const decrease = ((lastIncome - currentIncome) / lastIncome * 100).toFixed(0);
        messages.push(`Your income decreased by ${decrease}% compared to last month.`);
    }
    
    // Spending advice
    const impulseCategories = ['entertainment', 'food'];
    const impulseSpending = transactionsCache.filter(t => 
        t.date >= startOfMonth && t.type === 'expense' && impulseCategories.includes(t.category)
    ).reduce((s, t) => s + t.amount, 0);
    
    if (impulseSpending > 300) {
        messages.push(`You've spent ${formatCurrency(impulseSpending, 'GHS')} on eating out this month. Preparing more meals at home could help you save toward your goals.`);
    }
    
    // Debt advice
    const totalDebt = debtsCache.filter(d => d.status !== 'paid').reduce((s, d) => s + (d.amount - (d.paidAmount || 0)), 0);
    if (totalDebt > 1000) {
        messages.push(`You have ${formatCurrency(totalDebt, 'GHS')} in outstanding debt. Consider prioritizing debt repayment to reduce interest costs.`);
    }
    
    // Savings rate advice
    const savingsRate = currentIncome > 0 ? (currentSavings / currentIncome * 100) : 0;
    if (savingsRate < 10 && currentIncome > 0) {
        messages.push(`Your savings rate is only ${savingsRate.toFixed(0)}%. Try to increase it to at least 20% for better financial security.`);
    } else if (savingsRate > 30) {
        messages.push(`Excellent savings rate of ${savingsRate.toFixed(0)}%! You're building wealth effectively.`);
    }
    
    // Goal progress
    financialGoalsCache.forEach(goal => {
        const progress = goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount * 100) : 0;
        if (progress < 50 && goal.targetDate - now < 90 * 24 * 60 * 60 * 1000) {
            messages.push(`Your goal "${goal.name}" is only ${progress.toFixed(0)}% complete with ${Math.ceil((goal.targetDate - now) / (1000 * 60 * 60 * 24))} days remaining.`);
        }
    });
    
    // Default message if no insights
    if (messages.length === 0) {
        messages.push('Your finances look stable. Keep up the good habits!');
    }
    
    // Select a random message if multiple, or show the most important one
    const selectedMessage = messages.length > 1 ? messages[Math.floor(Math.random() * messages.length)] : messages[0];
    messageEl.textContent = selectedMessage;
}

// ============================================
// RUN ALL ANALYSES
// ============================================
async function runAllAnalyses() {
    analyzeSpendingHabits();
    analyzeLifestyle();
    detectImpulseSpending();
    calculateFinancialHealthScore();
    updateCashFlowIntelligence();
    analyzeNeedsVsWants();
    updateSmartBudgetCoach();
    updateSavingsCoach();
    updateFinancialAdvisor();
    
    // Generate monthly review if it's near end of month or on demand
    const now = new Date();
    if (now.getDate() >= 25) {
        await generateMonthlyReview();
    }
}

// ============================================
// LOAD FUNCTIONS (from original)
// ============================================
async function loadTransactions() {
    try {
        const q = query(collection(db, 'transactions'), where('userId', '==', currentUser.uid), orderBy('date', 'desc'));
        const querySnapshot = await getDocs(q);
        transactionsCache = querySnapshot.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data(), 
            date: doc.data().date?.toDate?.() || new Date(doc.data().date) || new Date(),
            goalId: doc.data().goalId || null,
            goalName: doc.data().goalName || null
        }));
        updateStats();
        filterAndRenderTransactions();
        if (typeof Chart !== 'undefined') { drawExpenseChart(); drawTrendChart(); }
    } catch (error) { 
        console.error('Error loading transactions:', error); 
    }
}

async function loadBudgets() {
    try {
        const q = query(collection(db, 'budgets'), where('userId', '==', currentUser.uid));
        const querySnapshot = await getDocs(q);
        budgetsCache = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateSmartBudgetCoach();
    } catch (error) { console.error('Error loading budgets:', error); }
}

async function loadInvoices() {
    try {
        const q = query(collection(db, 'invoices'), where('userId', '==', currentUser.uid), orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        invoicesCache = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderInvoices();
    } catch (error) { console.error('Error loading invoices:', error); }
}

async function loadPaymentHistory() {
    try {
        const q = query(collection(db, 'paymentHistory'), where('userId', '==', currentUser.uid), orderBy('paymentDate', 'desc'));
        const querySnapshot = await getDocs(q);
        paymentHistoryCache = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) { console.error('Error loading payment history:', error); }
}

async function loadInvoiceTimeline() {
    try {
        const q = query(collection(db, 'invoiceTimeline'), where('userId', '==', currentUser.uid), orderBy('timestamp', 'desc'));
        const querySnapshot = await getDocs(q);
        invoiceTimelineCache = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) { console.error('Error loading invoice timeline:', error); }
}

async function loadProjects() {
    try {
        const q = query(collection(db, 'projects'), where('userId', '==', currentUser.uid));
        const querySnapshot = await getDocs(q);
        projectsCache = querySnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name, client: doc.data().client }));
    } catch (error) { console.error('Error loading projects:', error); }
}

async function loadFinancialGoals() {
    try {
        const q = query(collection(db, 'financialGoals'), where('userId', '==', currentUser.uid));
        const querySnapshot = await getDocs(q);
        financialGoalsCache = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateSavingsCoach();
    } catch (error) { console.error('Error loading goals:', error); }
}

async function loadGoals() {
    try {
        const q = query(collection(db, 'goals'), where('userId', '==', currentUser.uid));
        const querySnapshot = await getDocs(q);
        goalsCache = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                startDate: data.startDate?.toDate?.() || new Date(data.startDate),
                endDate: data.endDate?.toDate?.() || new Date(data.endDate)
            };
        });
        goalsCache = goalsCache.filter(g => g.status !== 'completed' && g.status !== 'cancelled');
    } catch (error) {
        console.error('Error loading goals for finance:', error);
    }
}

function populateGoalFilters() {
    const goalFilter = document.getElementById('transaction-goal-filter');
    if (!goalFilter) return;
    
    const savingsGoals = goalsCache.filter(g => g.category === 'savings' || g.category === 'financial');
    
    if (savingsGoals.length === 0) {
        goalFilter.innerHTML = `<option value="all">All Goals</option><option value="none">No Goal</option>`;
        return;
    }
    
    goalFilter.innerHTML = `
        <option value="all">All Goals</option>
        <option value="none">No Goal</option>
        ${savingsGoals.map(g => `<option value="${g.id}">${escapeHtml(g.title)}</option>`).join('')}
    `;
}

// ============================================
// CORE FUNCTIONS (from original)
// ============================================
function updateStats() {
    const now = new Date();
    let filtered = [...transactionsCache];
    
    if (currentPeriod === 'week') {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        filtered = filtered.filter(t => t.date >= startOfWeek);
    } else if (currentPeriod === 'month') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        filtered = filtered.filter(t => t.date >= startOfMonth);
    } else if (currentPeriod === 'quarter') {
        const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        filtered = filtered.filter(t => t.date >= quarterStart);
    } else if (currentPeriod === 'half-year') {
        const halfStart = new Date(now.getFullYear(), now.getMonth() < 6 ? 0 : 6, 1);
        filtered = filtered.filter(t => t.date >= halfStart);
    } else if (currentPeriod === 'year') {
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        filtered = filtered.filter(t => t.date >= startOfYear);
    }
    
    const totalIncome = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalExpenses = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const totalProfit = totalIncome - totalExpenses;
    
    const allTimeIncome = transactionsCache.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const allTimeExpenses = transactionsCache.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const allTimeBalance = allTimeIncome - allTimeExpenses;
    
    const paymentReceivedCount = transactionsCache.filter(t => t.category === 'payment_received' && t.type === 'income').length;
    const paymentReceivedTotal = transactionsCache.filter(t => t.category === 'payment_received' && t.type === 'income')
        .reduce((s, t) => s + t.amount, 0);
    
    document.getElementById('total-balance').textContent = formatCurrency(allTimeBalance, 'GHS');
    document.getElementById('total-income').textContent = formatCurrency(totalIncome, 'GHS');
    document.getElementById('total-expenses').textContent = formatCurrency(totalExpenses, 'GHS');
    document.getElementById('total-profit').textContent = formatCurrency(totalProfit, 'GHS');
    document.getElementById('payment-received-count').textContent = paymentReceivedCount;
    document.getElementById('payment-received-total').textContent = formatCurrency(paymentReceivedTotal, 'GHS');
    
    // Update cash flow intelligence
    updateCashFlowIntelligence();
}

function filterAndRenderTransactions() {
    let filtered = [...transactionsCache];
    const searchInput = document.getElementById('transaction-search');
    if (searchInput?.value) {
        const query = searchInput.value.toLowerCase();
        filtered = filtered.filter(t => t.description?.toLowerCase().includes(query) || t.category?.toLowerCase().includes(query));
    }
    const typeFilter = document.getElementById('transaction-type-filter');
    if (typeFilter?.value !== 'all') filtered = filtered.filter(t => t.type === typeFilter.value);
    const categoryFilter = document.getElementById('transaction-category-filter');
    if (categoryFilter?.value !== 'all') filtered = filtered.filter(t => t.category === categoryFilter.value);
    const goalFilter = document.getElementById('transaction-goal-filter');
    if (goalFilter?.value === 'none') filtered = filtered.filter(t => !t.goalId);
    else if (goalFilter?.value !== 'all' && goalFilter?.value) filtered = filtered.filter(t => t.goalId === goalFilter.value);
    filtered.sort((a, b) => b.date - a.date);
    
    const totalItems = filtered.length;
    const itemsPerPage = parseInt(document.getElementById('items-per-page')?.value) || ITEMS_PER_PAGE;
    totalPages = Math.ceil(totalItems / itemsPerPage);
    
    if (currentPage > totalPages) currentPage = totalPages || 1;
    
    renderTransactions(filtered);
    updatePaginationControls(totalItems);
}

function renderTransactions(transactions) {
    const container = document.getElementById('transactions-container');
    if (!container) return;
    
    const itemsPerPage = parseInt(document.getElementById('items-per-page')?.value) || ITEMS_PER_PAGE;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, transactions.length);
    const pageItems = transactions.slice(startIndex, endIndex);
    
    if (transactions.length === 0) {
        container.innerHTML = `
            <div class="glass-card rounded-xl p-12 text-center">
                <i class="fas fa-receipt text-6xl mb-4 text-muted"></i>
                <h3 class="text-xl font-semibold mb-2">No transactions</h3>
                <p class="text-muted">Start tracking your income and expenses</p>
                <button id="empty-add-btn" class="mt-4 px-5 py-2 rounded-lg transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                    <i class="fas fa-plus mr-1"></i> Add Transaction
                </button>
            </div>
        `;
        document.getElementById('empty-add-btn')?.addEventListener('click', () => window.FinanceApp.showAddTransactionModal());
        return;
    }
    
    if (pageItems.length === 0) {
        currentPage = Math.max(1, currentPage - 1);
        renderTransactions(transactions);
        return;
    }
    
    const grouped = {};
    pageItems.forEach(t => {
        const key = t.date.toDateString();
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(t);
    });
    
    container.innerHTML = Object.entries(grouped).map(([date, items]) => `
        <div class="space-y-2">
            <div class="flex items-center gap-2">
                <div class="w-1 h-6 rounded-full" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald));"></div>
                <h3 class="font-semibold">${formatDateHeader(date)}</h3>
                <span class="text-xs text-muted">(${items.length} items)</span>
            </div>
            ${items.map(t => `
                <div class="glass-card rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all hover:shadow-md">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" 
                            style="background: ${t.type === 'income' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}">
                            <i class="fas ${t.type === 'income' ? 'fa-arrow-up text-emerald-500' : 'fa-arrow-down text-red-500'}"></i>
                        </div>
                        <div>
                            <div class="font-semibold break-words flex items-center gap-2 flex-wrap">
                                <span>${escapeHtml(t.description)}</span>
                                ${t.category === 'payment_received' ? '<span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(16,185,129,0.15); color: #10b981;">💰 Payment</span>' : ''}
                                ${t.invoiceNumber ? `<span class="text-xs" style="color: var(--deep-blue);">📄 ${escapeHtml(t.invoiceNumber)}</span>` : ''}
                            </div>
                            <div class="text-xs" style="color: var(--text-muted);">
                                <i class="fas ${getCategoryIcon(t.category)} mr-1"></i>
                                ${t.category?.replace('-', ' ') || 'Uncategorized'}
                            </div>
                            ${t.goalName ? `<div class="text-xs" style="color: var(--deep-blue);"><i class="fas fa-bullseye"></i> ${escapeHtml(t.goalName)}</div>` : ''}
                        </div>
                    </div>
                    <div class="flex items-center justify-between sm:justify-end gap-3">
                        <div class="text-right">
                            <div class="font-bold ${t.type === 'income' ? 'text-emerald-500' : 'text-red-500'}">
                                ${t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount, 'GHS')}
                            </div>
                            <div class="text-xs" style="color: var(--text-muted);">${t.date.toLocaleDateString()}</div>
                        </div>
                        <div class="flex gap-1">
                            <button onclick="window.FinanceApp.editTransaction('${t.id}')" class="p-1 rounded transition-all hover:bg-gray-100 dark:hover:bg-gray-700" title="Edit">
                                <i class="fas fa-edit" style="color: var(--text-muted);"></i>
                            </button>
                            <button onclick="window.FinanceApp.deleteTransaction('${t.id}')" class="p-1 rounded transition-all hover:bg-red-100 dark:hover:bg-red-900/20" title="Delete">
                                <i class="fas fa-trash text-red-500"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `).join('');
    
    document.getElementById('page-start').textContent = startIndex + 1;
    document.getElementById('page-end').textContent = endIndex;
    document.getElementById('total-items').textContent = transactions.length;
}

function updatePaginationControls(totalItems) {
    const itemsPerPage = parseInt(document.getElementById('items-per-page')?.value) || ITEMS_PER_PAGE;
    totalPages = Math.ceil(totalItems / itemsPerPage);
    
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    const pageInfo = document.getElementById('page-info');
    
    if (prevBtn) {
        prevBtn.disabled = currentPage <= 1;
        prevBtn.onclick = () => { if (currentPage > 1) { currentPage--; applyPagination(); } };
    }
    
    if (nextBtn) {
        nextBtn.disabled = currentPage >= totalPages;
        nextBtn.onclick = () => { if (currentPage < totalPages) { currentPage++; applyPagination(); } };
    }
    
    if (pageInfo) {
        pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1}`;
    }
}

function applyPagination() {
    filterAndRenderTransactions();
}

function renderInvoicePage() {
    const totalInvoices = invoicesCache.length;
    const itemsPerPage = INVOICES_PER_PAGE;
    totalInvoicePages = Math.ceil(totalInvoices / itemsPerPage);
    
    if (currentInvoicePage > totalInvoicePages) currentInvoicePage = totalInvoicePages || 1;
    
    const startIndex = (currentInvoicePage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalInvoices);
    const pageInvoices = invoicesCache.slice(startIndex, endIndex);
    
    renderInvoices(pageInvoices);
    updateInvoicePaginationControls(totalInvoices);
}

function updateInvoicePaginationControls(totalInvoices) {
    const itemsPerPage = INVOICES_PER_PAGE;
    totalInvoicePages = Math.ceil(totalInvoices / itemsPerPage);
    
    const prevBtn = document.getElementById('prev-invoice-page');
    const nextBtn = document.getElementById('next-invoice-page');
    const pageInfo = document.getElementById('invoice-page-info');
    const startEl = document.getElementById('invoice-start');
    const endEl = document.getElementById('invoice-end');
    const totalEl = document.getElementById('invoice-total');
    
    const startIndex = (currentInvoicePage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalInvoices);
    
    if (startEl) startEl.textContent = totalInvoices > 0 ? startIndex + 1 : 0;
    if (endEl) endEl.textContent = endIndex;
    if (totalEl) totalEl.textContent = totalInvoices;
    
    if (prevBtn) {
        prevBtn.disabled = currentInvoicePage <= 1;
        prevBtn.onclick = () => { if (currentInvoicePage > 1) { currentInvoicePage--; renderInvoicePage(); } };
    }
    
    if (nextBtn) {
        nextBtn.disabled = currentInvoicePage >= totalInvoicePages;
        nextBtn.onclick = () => { if (currentInvoicePage < totalInvoicePages) { currentInvoicePage++; renderInvoicePage(); } };
    }
    
    if (pageInfo) {
        pageInfo.textContent = `Page ${currentInvoicePage} of ${totalInvoicePages || 1}`;
    }
}

function renderInvoices(invoicesToRender) {
    const container = document.getElementById('invoices-container');
    if (!container) return;
    
    const invoices = invoicesToRender || invoicesCache;
    
    if (invoices.length === 0) { 
        container.innerHTML = '<div class="text-center py-4 text-muted">No invoices yet</div>'; 
        return; 
    }
    
    const statusColors = { 
        draft: '#6b7280', 
        sent: '#3b82f6', 
        pending: '#f59e0b', 
        'partially-paid': '#8b5cf6',
        paid: '#10b981', 
        overdue: '#ef4444', 
        cancelled: '#6b7280',
        refunded: '#ec4899' 
    };
    
    const statusIcons = {
        draft: 'fa-file',
        sent: 'fa-paper-plane',
        pending: 'fa-clock',
        'partially-paid': 'fa-half',
        paid: 'fa-check-circle',
        overdue: 'fa-exclamation-triangle',
        cancelled: 'fa-ban',
        refunded: 'fa-undo'
    };
    
    container.innerHTML = invoices.map(inv => `
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-3 rounded-lg transition-all hover:shadow-md" style="background: var(--bg-primary);">
            <div>
                <div class="font-semibold">${inv.invoiceNumber}</div>
                <div class="text-xs" style="color: var(--text-muted);">${escapeHtml(inv.clientName)} | ${formatDate(inv.date)}</div>
                ${inv.sharedAt ? '<span class="text-xs px-2 py-0.5 rounded-full mt-1 inline-block" style="background: rgba(59,130,246,0.15); color: #3b82f6;"><i class="fas fa-share-alt text-xs"></i> Shared</span>' : ''}
            </div>
            <div class="text-left sm:text-right">
                <div class="font-bold">${formatCurrency(inv.total, 'GHS')}</div>
                <span class="text-xs px-2 py-0.5 rounded-full" style="background: ${statusColors[inv.status]}20; color: ${statusColors[inv.status]}">
                    <i class="fas ${statusIcons[inv.status] || 'fa-file-invoice'} text-xs mr-1"></i> ${inv.status.replace('-', ' ').toUpperCase()}
                </span>
            </div>
            <div class="flex gap-1 flex-wrap">
                <button onclick="window.FinanceApp.viewInvoice('${inv.id}')" class="p-1 rounded hover:bg-gray-100"><i class="fas fa-eye text-muted"></i></button>
                <button onclick="window.FinanceApp.exportInvoicePDF('${inv.id}')" class="p-1 rounded hover:bg-gray-100"><i class="fas fa-download text-muted"></i></button>
                <button onclick="window.FinanceApp.recordPayment('${inv.id}')" class="p-1 rounded hover:bg-gray-100"><i class="fas fa-money-bill text-muted"></i></button>
                <button onclick="window.shareInvoice('${inv.id}')" class="p-1 rounded hover:bg-gray-100" title="Share with client">
                    <i class="fas fa-share-alt" style="color: var(--deep-blue);"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function formatDateHeader(dateStr) {
    const date = new Date(dateStr);
    const today = new Date().toDateString();
    if (dateStr === today) return 'Today';
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    if (dateStr === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function drawExpenseChart() {
    const canvas = document.getElementById('expense-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const expenses = transactionsCache.filter(t => t.date >= startOfMonth && t.type === 'expense');
    const categoryTotals = {};
    expenses.forEach(t => { categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount; });
    if (window.expenseChart) window.expenseChart.destroy();
    window.expenseChart = new Chart(canvas, { type: 'doughnut', data: { labels: Object.keys(categoryTotals), datasets: [{ data: Object.values(categoryTotals), backgroundColor: ['#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#6366f1','#14b8a6','#f97316','#84cc16'] }] }, options: { responsive: true, maintainAspectRatio: true } });
}

function drawTrendChart() {
    const canvas = document.getElementById('trend-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    const months = []; const incomeData = []; const expenseData = [];
    for (let i = 5; i >= 0; i--) {
        const date = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
        const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        const monthTransactions = transactionsCache.filter(t => t.date >= date && t.date <= monthEnd);
        months.push(date.toLocaleDateString('en-US', { month: 'short' }));
        incomeData.push(monthTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0));
        expenseData.push(monthTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0));
    }
    if (window.trendChart) window.trendChart.destroy();
    window.trendChart = new Chart(canvas, { type: 'line', data: { labels: months, datasets: [{ label: 'Income', data: incomeData, borderColor: '#10b981', tension: 0.4, fill: true }, { label: 'Expenses', data: expenseData, borderColor: '#ef4444', tension: 0.4, fill: true }] }, options: { responsive: true, maintainAspectRatio: true } });
}

function setupEventListeners() {
    document.querySelectorAll('.period-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            currentPeriod = tab.dataset.period;
            document.querySelectorAll('.period-tab').forEach(t => { t.style.background = 'var(--bg-secondary)'; t.style.color = 'var(--text-muted)'; });
            tab.style.background = 'linear-gradient(135deg, var(--deep-blue), var(--emerald))';
            tab.style.color = 'white';
            currentPage = 1;
            updateStats(); filterAndRenderTransactions(); drawTrendChart();
        });
    });
    document.querySelector('.period-tab[data-period="month"]')?.click();
    
    document.getElementById('transaction-search')?.addEventListener('input', () => { currentPage = 1; filterAndRenderTransactions(); });
    document.getElementById('transaction-type-filter')?.addEventListener('change', () => { currentPage = 1; filterAndRenderTransactions(); });
    document.getElementById('transaction-category-filter')?.addEventListener('change', () => { currentPage = 1; filterAndRenderTransactions(); });
    document.getElementById('transaction-goal-filter')?.addEventListener('change', () => { currentPage = 1; filterAndRenderTransactions(); });
    document.getElementById('items-per-page')?.addEventListener('change', () => { currentPage = 1; applyPagination(); });
    document.getElementById('pending-approvals-btn')?.addEventListener('click', () => showPendingApprovals());
    document.getElementById('financial-health-btn')?.addEventListener('click', () => {
        document.getElementById('health-score-container').scrollIntoView({ behavior: 'smooth' });
        calculateFinancialHealthScore();
    });
    document.getElementById('refresh-health-btn')?.addEventListener('click', calculateFinancialHealthScore);
    document.getElementById('generate-review-btn')?.addEventListener('click', generateMonthlyReview);
    
    document.getElementById('add-transaction-btn')?.addEventListener('click', () => window.FinanceApp.showAddTransactionModal());
    document.getElementById('manage-budgets-btn')?.addEventListener('click', () => window.FinanceApp.showBudgetModal());
    document.getElementById('create-invoice-btn')?.addEventListener('click', () => window.FinanceApp.showInvoiceModal());
    document.getElementById('new-invoice-btn')?.addEventListener('click', () => window.FinanceApp.showInvoiceModal());
    document.getElementById('add-goal-btn')?.addEventListener('click', () => window.FinanceApp.showAddGoalModal());
    document.getElementById('business-settings-btn')?.addEventListener('click', () => window.FinanceApp.showBusinessSettings());
    
    // Debt Manager buttons
    document.getElementById('add-lent-debt-btn')?.addEventListener('click', () => window.FinanceApp.showAddDebtModal('lent'));
    document.getElementById('add-borrowed-debt-btn')?.addEventListener('click', () => window.FinanceApp.showAddDebtModal('borrowed'));
    document.getElementById('add-subscription-btn')?.addEventListener('click', () => window.FinanceApp.showAddSubscriptionModal());
    
    const categoryFilter = document.getElementById('transaction-category-filter');
    if (categoryFilter) {
        categoryFilter.innerHTML = `
            <option value="all">All Categories</option>
            <optgroup label="Income">
                <option value="salary">Salary</option>
                <option value="freelance">Freelance</option>
                <option value="investment">Investment</option>
                <option value="payment_received">Payment Received</option>
                <option value="gift">Gift</option>
            </optgroup>
            <optgroup label="Expenses">
                <option value="food">Food & Dining</option>
                <option value="transport">Transport</option>
                <option value="housing">Housing</option>
                <option value="utilities">Utilities</option>
                <option value="entertainment">Entertainment</option>
                <option value="shopping">Shopping</option>
                <option value="health">Health</option>
                <option value="education">Education</option>
                <option value="bills">Bills</option>
            </optgroup>
        `;
    }
}

function generateInvoiceNumber() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear()).slice(-2);
    const prefix = businessSettings.prefix || 'PJ';
    
    const currentMonthInvoices = invoicesCache.filter(inv => {
        const invDate = new Date(inv.date);
        return invDate.getMonth() === now.getMonth() && 
               invDate.getFullYear() === now.getFullYear();
    });
    
    const count = currentMonthInvoices.length + 1;
    const sequence = String(count).padStart(4, '0');
    
    return `${prefix}${month}${year}${sequence}`;
}

// ============================================
// SHARE INVOICE
// ============================================
window.shareInvoice = async function(invoiceId) {
    const invoice = invoicesCache.find(i => i.id === invoiceId);
    if (!invoice) {
        showToast('Invoice not found', 'error');
        return;
    }

    const modalHtml = `
        <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.FinanceApp.closeModal()">
            <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color); z-10;">
                    <div>
                        <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">
                            <i class="fas fa-share-alt mr-2" style="color: var(--deep-blue);"></i>Share Invoice
                        </h2>
                        <p class="text-xs md:text-sm text-muted mt-1">Send invoice link to client</p>
                    </div>
                    <button onclick="window.FinanceApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                        <i class="fas fa-times text-muted"></i>
                    </button>
                </div>
                
                <form id="share-invoice-form" class="p-5 space-y-4">
                    <div class="bg-primary p-3 rounded-lg" style="background: var(--bg-primary);">
                        <div class="text-sm" style="color: var(--text-primary);">
                            <strong>Invoice:</strong> ${invoice.invoiceNumber}
                        </div>
                        <div class="text-sm" style="color: var(--text-primary);">
                            <strong>Client:</strong> ${escapeHtml(invoice.clientName)}
                        </div>
                        <div class="text-sm" style="color: var(--text-primary);">
                            <strong>Amount:</strong> ${formatCurrency(invoice.total, 'GHS')}
                        </div>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">
                            <i class="fas fa-phone mr-1"></i>Client Phone Number
                        </label>
                        <div class="relative">
                            <span class="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted">+233</span>
                            <input type="tel" id="client-phone-share" placeholder="24XXXXXXXX" required
                                   class="w-full pl-16 pr-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"
                                   value="${invoice.clientPhone || ''}">
                        </div>
                        <p class="text-xs text-muted mt-1">Client will receive a verification code via SMS</p>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">
                            <i class="fas fa-envelope mr-1"></i>Client Email (Optional)
                        </label>
                        <input type="email" id="client-email-share" placeholder="client@example.com"
                               class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                               style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"
                               value="${invoice.clientEmail || ''}">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">
                            <i class="fas fa-link mr-1"></i>Share Link
                        </label>
                        <div class="flex gap-2">
                            <input type="text" id="share-link" readonly
                                   class="flex-1 px-3 py-2 rounded-lg border bg-gray-100 text-sm"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"
                                   value="Enter client phone to generate link">
                            <button type="button" onclick="window.copyShareLink()" 
                                    class="px-4 py-2 rounded-lg font-semibold transition-all hover:shadow-md"
                                    style="background: var(--deep-blue); color: white;">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                        <p class="text-xs text-muted mt-1">Share this link with your client. They can view and pay the invoice.</p>
                    </div>
                    
                    <div class="flex flex-col sm:flex-row gap-3 pt-2 border-t" style="border-color: var(--border-color);">
                        <button type="submit" id="generate-share-btn" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                            <i class="fas fa-send mr-1"></i> Generate & Send Link
                        </button>
                        <button type="button" onclick="window.FinanceApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
                            Close
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.getElementById('modal-container').innerHTML = modalHtml;
    document.getElementById('modal-container').style.pointerEvents = 'auto';
    
    // Rest of share invoice logic...
};

window.copyShareLink = function() {
    const linkInput = document.getElementById('share-link');
    if (linkInput && linkInput.value && linkInput.value !== 'Enter client phone to generate link') {
        linkInput.select();
        document.execCommand('copy');
        showToast('Link copied to clipboard!', 'success');
    } else {
        showToast('Generate a link first', 'error');
    }
};

function setupPaymentApprovalListener() {
    if (!currentUser) return;
    
    if (paymentListeners.approvals) {
        paymentListeners.approvals();
    }
    
    const paymentRef = collection(db, 'paymentHistory');
    const q = query(
        paymentRef,
        where('userId', '==', currentUser.uid),
        where('status', '==', 'pending_approval'),
        orderBy('createdAt', 'desc')
    );
    
    paymentListeners.approvals = onSnapshot(q, (snapshot) => {
        pendingApprovalsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updatePendingCount();
    }, (error) => {
        console.error('Payment approval listener error:', error);
    });
}

function updatePendingCount() {
    const countEl = document.getElementById('pending-count');
    if (countEl) {
        countEl.textContent = pendingApprovalsCache.length;
    }
}

function showPendingApprovals() {
    if (pendingApprovalsCache.length === 0) {
        showToast('No pending approvals', 'info');
        return;
    }
    
    const modalHtml = `
        <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.FinanceApp.closeModal()">
            <div class="rounded-2xl w-full max-w-3xl mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color); z-10;">
                    <div>
                        <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">
                            <i class="fas fa-clock mr-2" style="color: #f59e0b;"></i>Pending Approvals
                        </h2>
                        <p class="text-xs md:text-sm text-muted mt-1">Review and confirm client payments</p>
                    </div>
                    <button onclick="window.FinanceApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                        <i class="fas fa-times text-muted"></i>
                    </button>
                </div>
                
                <div class="p-5 space-y-4">
                    ${pendingApprovalsCache.map(payment => `
                        <div class="glass-card rounded-xl p-4">
                            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                                <div>
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <span class="font-semibold">${payment.invoiceNumber}</span>
                                        <span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(245,158,11,0.15); color: #f59e0b;">
                                            <i class="fas fa-clock mr-1"></i>Pending
                                        </span>
                                    </div>
                                    <div class="text-sm text-muted mt-1">
                                        <div>Client: ${escapeHtml(payment.clientName || 'N/A')}</div>
                                        <div>Phone: ${escapeHtml(payment.clientPhone || 'N/A')}</div>
                                        <div>Amount: <span class="font-semibold">${formatCurrency(payment.amount, 'GHS')}</span></div>
                                        ${payment.partialPayment ? '<div class="text-xs text-muted">⚠️ Partial payment</div>' : ''}
                                    </div>
                                </div>
                                <div class="flex gap-2">
                                    <button onclick="window.FinanceApp.approvePayment('${payment.id}', '${payment.invoiceId}')" class="px-4 py-2 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: var(--emerald); color: white;">
                                        <i class="fas fa-check mr-1"></i> Approve
                                    </button>
                                    <button onclick="window.FinanceApp.rejectPayment('${payment.id}')" class="px-4 py-2 rounded-lg font-semibold border transition-all hover:bg-red-100" style="border-color: var(--border-color); color: #ef4444;">
                                        <i class="fas fa-times mr-1"></i> Reject
                                    </button>
                                </div>
                            </div>
                            <div class="text-xs text-muted mt-2">
                                Requested: ${formatDate(payment.createdAt)}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('modal-container').innerHTML = modalHtml;
    document.getElementById('modal-container').style.pointerEvents = 'auto';
}

// ============================================
// FINANCE APP - MAIN OBJECT (extended)
// ============================================
window.FinanceApp = {
    // Business Settings
    showBusinessSettings: () => {
        const settings = businessSettings;
        
        const modalHtml = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.FinanceApp.closeModal()">
                <div class="rounded-2xl w-full max-w-2xl mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color); z-10;">
                        <div>
                            <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-building mr-2" style="color: var(--deep-blue);"></i>Business Settings
                            </h2>
                            <p class="text-xs md:text-sm text-muted mt-1">Configure your business details for invoices</p>
                        </div>
                        <button onclick="window.FinanceApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="business-settings-form" class="p-5 space-y-4">
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Business Name</label>
                                <input type="text" name="name" value="${escapeHtml(settings.name || '')}" class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Invoice Prefix</label>
                                <input type="text" name="prefix" value="${escapeHtml(settings.prefix || 'PJ')}" maxlength="4" placeholder="e.g., PJ" class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <p class="text-xs text-muted mt-1">Format: PREFIX + MMYY + SEQUENCE (e.g., PJ07260001)</p>
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Address</label>
                            <input type="text" name="address" value="${escapeHtml(settings.address || '')}" class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Phone Number</label>
                                <input type="text" name="phone" value="${escapeHtml(settings.phone || '')}" class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Email</label>
                                <input type="email" name="email" value="${escapeHtml(settings.email || '')}" class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Logo</label>
                            <div class="flex items-center gap-4 flex-wrap">
                                ${settings.logo ? `<img src="${settings.logo}" alt="Logo" class="h-16 w-auto rounded-lg object-contain" id="logo-preview">` : ''}
                                <div>
                                    <input type="file" id="logo-upload" accept="image/*" class="hidden">
                                    <button type="button" onclick="document.getElementById('logo-upload').click()" class="px-4 py-2 rounded-lg border text-sm" style="border-color: var(--border-color); color: var(--text-primary);">
                                        <i class="fas fa-upload mr-1"></i> Upload Logo
                                    </button>
                                    ${settings.logo ? `<button type="button" onclick="window.FinanceApp.removeLogo()" class="px-4 py-2 rounded-lg border text-sm text-red-500" style="border-color: var(--border-color);">Remove</button>` : ''}
                                    <input type="hidden" id="logo-remove" name="removeLogo" value="false">
                                </div>
                            </div>
                            <p class="text-xs text-muted mt-1">Logo will be stored in the cloud and visible across all devices</p>
                            <p class="text-xs text-muted">Maximum size: 500KB (JPG, PNG, GIF)</p>
                        </div>
                        
                        <div class="border-t pt-4" style="border-color: var(--border-color);">
                            <h3 class="text-sm font-semibold mb-3" style="color: var(--text-primary);">Payment Details</h3>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Mobile Money Number</label>
                                    <input type="text" name="mobileMoney" value="${escapeHtml(settings.paymentDetails?.mobileMoney || '')}" placeholder="e.g., 0244XXXXXX" class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                </div>
                                <div>
                                    <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Mobile Money Name</label>
                                    <input type="text" name="mobileMoneyName" value="${escapeHtml(settings.paymentDetails?.mobileMoneyName || '')}" placeholder="e.g., ProfJero" class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    <p class="text-xs text-muted mt-1">Name on the mobile money account</p>
                                </div>
                            </div>
                            <div class="mt-2">
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Payment Instructions</label>
                                <input type="text" name="paymentInstructions" value="${escapeHtml(settings.paymentDetails?.paymentInstructions || '')}" placeholder="e.g., Please include invoice number in payment reference" class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2 border-t" style="border-color: var(--border-color);">
                            <button type="submit" id="save-business-settings-btn" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-1"></i> Save Settings
                            </button>
                            <button type="button" onclick="window.FinanceApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.getElementById('modal-container').innerHTML = modalHtml;
        document.getElementById('modal-container').style.pointerEvents = 'auto';
        
        // Logo upload handler
        document.getElementById('logo-upload')?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                if (file.size > 500 * 1024) {
                    showToast('Logo file too large. Maximum size is 500KB.', 'error');
                    return;
                }
                
                const reader = new FileReader();
                reader.onload = (event) => {
                    const dataUrl = event.target.result;
                    const preview = document.getElementById('logo-preview') || document.createElement('img');
                    if (!preview.id) {
                        preview.id = 'logo-preview';
                        preview.className = 'h-16 w-auto rounded-lg object-contain';
                        const container = document.querySelector('.flex.items-center.gap-4');
                        container.insertBefore(preview, container.firstChild);
                    }
                    preview.src = dataUrl;
                    document.getElementById('business-settings-form').dataset.logoData = dataUrl;
                    showToast('Logo uploaded! Click Save Settings to store it.', 'success');
                };
                reader.readAsDataURL(file);
            }
        });
        
        document.getElementById('business-settings-form').onsubmit = async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('save-business-settings-btn');
            setButtonLoading(submitBtn, true);
            
            try {
                const formData = new FormData(e.target);
                const removeLogo = document.getElementById('logo-remove')?.value === 'true';
                
                let logoData = businessSettings.logo;
                const newLogoData = document.getElementById('business-settings-form').dataset.logoData;
                
                if (newLogoData) {
                    logoData = newLogoData;
                } else if (removeLogo) {
                    logoData = null;
                }
                
                const settingsData = {
                    name: formData.get('name'),
                    address: formData.get('address'),
                    phone: formData.get('phone'),
                    email: formData.get('email'),
                    prefix: formData.get('prefix') || 'PJ',
                    logo: logoData,
                    paymentDetails: {
                        mobileMoney: formData.get('mobileMoney') || '',
                        mobileMoneyName: formData.get('mobileMoneyName') || '',
                        paymentInstructions: formData.get('paymentInstructions') || ''
                    }
                };
                
                await saveBusinessSettings(settingsData);
                showToast('Business settings saved successfully!', 'success');
                window.FinanceApp.closeModal();
                await loadAllData();
            } catch (error) {
                console.error('Error saving settings:', error);
                showToast('Failed to save settings: ' + error.message, 'error');
            } finally {
                setButtonLoading(submitBtn, false, '<i class="fas fa-save mr-1"></i> Save Settings');
            }
        };
    },
    
    removeLogo: async function() {
        if (!confirm('Remove the business logo?')) return;
        
        try {
            const settingsData = {
                ...businessSettings,
                logo: null
            };
            await saveBusinessSettings(settingsData);
            const preview = document.getElementById('logo-preview');
            if (preview) preview.remove();
            const removeBtn = document.querySelector('[onclick="window.FinanceApp.removeLogo()"]');
            if (removeBtn) removeBtn.remove();
            showToast('Logo removed successfully!', 'success');
            await loadAllData();
        } catch (error) {
            console.error('Error removing logo:', error);
            showToast('Failed to remove logo: ' + error.message, 'error');
        }
    },
    
    // Add Transaction
    showAddTransactionModal: () => {
        const goalOptions = goalsCache
            .filter(g => g.category === 'savings' || g.category === 'financial')
            .map(g => `<option value="${g.id}">${escapeHtml(g.title)} (${formatCurrency(g.currentAmount || 0, 'GHS')}/${formatCurrency(g.targetAmount || 0, 'GHS')})</option>`)
            .join('');
        
        // Add need/want toggle for expense transactions
        const needWantHtml = `
            <div>
                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Classification</label>
                <div class="flex gap-2 p-1 rounded-xl" style="background: var(--bg-primary);">
                    <button type="button" id="need-btn" class="flex-1 py-2 rounded-lg font-semibold transition-all text-sm" style="background: #10b981; color: white;">
                        <i class="fas fa-check mr-1"></i> Need
                    </button>
                    <button type="button" id="want-btn" class="flex-1 py-2 rounded-lg font-semibold transition-all text-sm" style="background: var(--bg-secondary); color: var(--text-muted);">
                        <i class="fas fa-star mr-1"></i> Want
                    </button>
                </div>
                <input type="hidden" name="classification" id="selected-classification" value="need">
                <p class="text-xs text-muted mt-1">Classify this expense as a Need (essential) or Want (discretionary)</p>
            </div>
        `;
        
        const modalHtml = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.FinanceApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto transform transition-all max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color); z-index: 10;">
                        <div>
                            <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">Add Transaction</h2>
                            <p class="text-xs md:text-sm text-muted mt-1">Record your income or expense</p>
                        </div>
                        <button onclick="window.FinanceApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    
                    <form id="add-transaction-form" class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Transaction Type</label>
                            <div class="flex gap-2 p-1 rounded-xl" style="background: var(--bg-primary);">
                                <button type="button" id="type-expense" class="flex-1 py-2.5 rounded-lg font-semibold transition-all text-sm md:text-base" style="background: #ef4444; color: white;">
                                    <i class="fas fa-arrow-down mr-1"></i> Expense
                                </button>
                                <button type="button" id="type-income" class="flex-1 py-2.5 rounded-lg font-semibold transition-all text-sm md:text-base" style="background: var(--bg-secondary); color: var(--text-muted);">
                                    <i class="fas fa-arrow-up mr-1"></i> Income
                                </button>
                            </div>
                            <input type="hidden" name="type" id="selected-type" value="expense">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Category</label>
                            <select name="category" id="transaction-category-select" class="w-full px-3 md:px-4 py-2.5 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all text-sm md:text-base" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);" required>
                                <option value="food"><i class="fas fa-utensils"></i> Food & Dining</option>
                                <option value="transport"><i class="fas fa-car"></i> Transport</option>
                                <option value="housing"><i class="fas fa-home"></i> Housing</option>
                                <option value="utilities"><i class="fas fa-bolt"></i> Utilities</option>
                                <option value="entertainment"><i class="fas fa-film"></i> Entertainment</option>
                                <option value="shopping"><i class="fas fa-shopping-bag"></i> Shopping</option>
                                <option value="health"><i class="fas fa-heartbeat"></i> Health</option>
                                <option value="education"><i class="fas fa-graduation-cap"></i> Education</option>
                                <option value="bills"><i class="fas fa-file-invoice"></i> Bills</option>
                                <option value="other-expense"><i class="fas fa-ellipsis-h"></i> Other</option>
                            </select>
                        </div>
                        
                        ${needWantHtml}
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Amount</label>
                            <div class="relative">
                                <span class="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted">₵</span>
                                <input type="number" name="amount" step="0.01" required placeholder="0.00" class="w-full pl-8 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-deep-blue transition-all text-sm md:text-base" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Description</label>
                            <input type="text" name="description" required placeholder="e.g., Grocery shopping, Salary deposit" class="w-full px-3 md:px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-deep-blue transition-all text-sm md:text-base" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Link to Goal (Optional)</label>
                            <select name="goalId" id="transaction-goal-select" class="w-full px-3 md:px-4 py-2.5 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all text-sm md:text-base" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <option value="">None</option>
                                ${goalOptions}
                            </select>
                            <p class="text-xs text-muted mt-1">
                                <i class="fas fa-info-circle mr-1"></i>
                                Link this transaction to a savings goal. Income will increase savings, expenses will decrease it.
                            </p>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Date</label>
                            <input type="date" name="date" value="${new Date().toISOString().split('T')[0]}" class="w-full px-3 md:px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-deep-blue transition-all text-sm md:text-base" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Notes <span class="text-xs text-muted">(Optional)</span></label>
                            <textarea name="notes" rows="2" placeholder="Additional notes..." class="w-full px-3 md:px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-deep-blue transition-all text-sm md:text-base" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></textarea>
                        </div>
                        
                        <div class="sticky bottom-0 pt-4 pb-2 mt-2 flex flex-col sm:flex-row gap-3" style="background: var(--bg-secondary);">
                            <button type="submit" id="save-transaction-btn" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02] text-sm md:text-base" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-1"></i> Save Transaction
                            </button>
                            <button type="button" onclick="window.FinanceApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700 text-sm md:text-base" style="background: var(--bg-primary); color: var(--text-muted); border-color: var(--border-color);">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.getElementById('modal-container').innerHTML = modalHtml;
        document.getElementById('modal-container').style.pointerEvents = 'auto';
        
        const expenseBtn = document.getElementById('type-expense');
        const incomeBtn = document.getElementById('type-income');
        const typeInput = document.getElementById('selected-type');
        const categorySelect = document.getElementById('transaction-category-select');
        const needBtn = document.getElementById('need-btn');
        const wantBtn = document.getElementById('want-btn');
        const classificationInput = document.getElementById('selected-classification');
        const needWantDiv = document.querySelector('.flex.gap-2.p-1.rounded-xl:has(#need-btn)');
        
        // Classification toggle
        if (needBtn && wantBtn && classificationInput) {
            needBtn.addEventListener('click', () => {
                needBtn.style.background = '#10b981';
                needBtn.style.color = 'white';
                wantBtn.style.background = 'var(--bg-secondary)';
                wantBtn.style.color = 'var(--text-muted)';
                classificationInput.value = 'need';
            });
            
            wantBtn.addEventListener('click', () => {
                wantBtn.style.background = '#f59e0b';
                wantBtn.style.color = 'white';
                needBtn.style.background = 'var(--bg-secondary)';
                needBtn.style.color = 'var(--text-muted)';
                classificationInput.value = 'want';
            });
        }
        
        const updateCategories = (isExpense) => {
            if (isExpense) {
                categorySelect.innerHTML = `
                    <option value="food"><i class="fas fa-utensils"></i> Food & Dining</option>
                    <option value="transport"><i class="fas fa-car"></i> Transport</option>
                    <option value="housing"><i class="fas fa-home"></i> Housing</option>
                    <option value="utilities"><i class="fas fa-bolt"></i> Utilities</option>
                    <option value="entertainment"><i class="fas fa-film"></i> Entertainment</option>
                    <option value="shopping"><i class="fas fa-shopping-bag"></i> Shopping</option>
                    <option value="health"><i class="fas fa-heartbeat"></i> Health</option>
                    <option value="education"><i class="fas fa-graduation-cap"></i> Education</option>
                    <option value="bills"><i class="fas fa-file-invoice"></i> Bills</option>
                    <option value="other-expense"><i class="fas fa-ellipsis-h"></i> Other</option>
                `;
                // Show classification for expenses
                if (needWantDiv) needWantDiv.style.display = 'flex';
            } else {
                categorySelect.innerHTML = `
                    <option value="salary"><i class="fas fa-money-bill-wave"></i> Salary</option>
                    <option value="freelance"><i class="fas fa-laptop-code"></i> Freelance</option>
                    <option value="investment"><i class="fas fa-chart-line"></i> Investment</option>
                    <option value="gift"><i class="fas fa-gift"></i> Gift</option>
                    <option value="other-income"><i class="fas fa-ellipsis-h"></i> Other Income</option>
                `;
                // Hide classification for income
                if (needWantDiv) needWantDiv.style.display = 'none';
            }
        };
        
        expenseBtn.addEventListener('click', () => {
            expenseBtn.style.background = '#ef4444';
            expenseBtn.style.color = 'white';
            incomeBtn.style.background = 'var(--bg-secondary)';
            incomeBtn.style.color = 'var(--text-muted)';
            typeInput.value = 'expense';
            updateCategories(true);
        });
        
        incomeBtn.addEventListener('click', () => {
            incomeBtn.style.background = 'linear-gradient(135deg, var(--deep-blue), var(--emerald))';
            incomeBtn.style.color = 'white';
            expenseBtn.style.background = 'var(--bg-secondary)';
            expenseBtn.style.color = 'var(--text-muted)';
            typeInput.value = 'income';
            updateCategories(false);
        });
        
        document.getElementById('add-transaction-form').onsubmit = async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('save-transaction-btn');
            setButtonLoading(submitBtn, true);
            
            try {
                const data = new FormData(e.target);
                const goalId = data.get('goalId') || null;
                let goalName = null;
                const classification = data.get('classification') || 'need';
                
                if (goalId) {
                    const goal = goalsCache.find(g => g.id === goalId);
                    if (goal) {
                        goalName = goal.title;
                        const transactionType = data.get('type');
                        const amount = parseFloat(data.get('amount'));
                        const currentAmount = goal.currentAmount || 0;
                        let newAmount = currentAmount;
                        
                        if (transactionType === 'income') {
                            newAmount = currentAmount + amount;
                        } else if (transactionType === 'expense') {
                            newAmount = Math.max(0, currentAmount - amount);
                        }
                        
                        await updateDoc(doc(db, 'goals', goalId), {
                            currentAmount: newAmount,
                            updatedAt: serverTimestamp(),
                            lastUpdated: serverTimestamp()
                        });
                    }
                }
                
                await addDoc(collection(db, 'transactions'), {
                    type: data.get('type'),
                    category: data.get('category'),
                    amount: parseFloat(data.get('amount')),
                    description: data.get('description'),
                    notes: data.get('notes') || '',
                    date: new Date(data.get('date')),
                    goalId: goalId,
                    goalName: goalName,
                    classification: data.get('type') === 'expense' ? classification : null,
                    userId: currentUser.uid,
                    createdAt: serverTimestamp()
                });
                
                showToast('Transaction added successfully!', 'success');
                window.FinanceApp.closeModal();
                await loadAllData();
            } catch (error) {
                console.error('Error adding transaction:', error);
                showToast('Failed to add transaction', 'error');
            } finally {
                setButtonLoading(submitBtn, false, '<i class="fas fa-save mr-1"></i> Save Transaction');
            }
        };
    },
    
    // Budget Modal
    showBudgetModal: () => {
        const expenseCategories = [
            { value: 'food', label: 'Food & Dining', icon: 'fa-utensils' },
            { value: 'transport', label: 'Transport', icon: 'fa-car' },
            { value: 'housing', label: 'Housing', icon: 'fa-home' },
            { value: 'utilities', label: 'Utilities', icon: 'fa-bolt' },
            { value: 'entertainment', label: 'Entertainment', icon: 'fa-film' },
            { value: 'shopping', label: 'Shopping', icon: 'fa-shopping-bag' },
            { value: 'health', label: 'Health', icon: 'fa-heartbeat' },
            { value: 'education', label: 'Education', icon: 'fa-graduation-cap' },
            { value: 'bills', label: 'Bills', icon: 'fa-file-invoice' }
        ];
        
        const modalHtml = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.FinanceApp.closeModal()">
                <div class="rounded-2xl w-full max-w-lg mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div><h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">Set Monthly Budgets</h2><p class="text-xs md:text-sm text-muted mt-1">Set spending limits for each category</p></div>
                        <button onclick="window.FinanceApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition"><i class="fas fa-times text-muted"></i></button>
                    </div>
                    <form id="budget-form" class="p-5 space-y-4">
                        ${expenseCategories.map(cat => {
                            const existingBudget = budgetsCache.find(b => b.category === cat.value);
                            return `<div><label class="block text-sm font-semibold mb-2"><i class="fas ${cat.icon} mr-2"></i>${cat.label}</label><input type="number" name="budget-${cat.value}" step="100" value="${existingBudget?.amount || ''}" placeholder="Monthly budget" class="w-full px-3 md:px-4 py-2 border rounded-lg text-sm md:text-base focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></div>`;
                        }).join('')}
                        <div class="sticky bottom-0 pt-4 pb-2 flex flex-col sm:flex-row gap-3" style="background: var(--bg-secondary);">
                            <button type="submit" id="save-budgets-btn" class="flex-1 py-2.5 rounded-lg font-semibold text-sm md:text-base transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;"><i class="fas fa-save mr-1"></i> Save Budgets</button>
                            <button type="button" onclick="window.FinanceApp.closeModal()" class="flex-1 py-2.5 rounded-lg border text-sm md:text-base transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="background: var(--bg-primary); color: var(--text-muted); border-color: var(--border-color);">Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.getElementById('modal-container').innerHTML = modalHtml;
        document.getElementById('modal-container').style.pointerEvents = 'auto';
        
        document.getElementById('budget-form').onsubmit = async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('save-budgets-btn');
            setButtonLoading(submitBtn, true);
            
            try {
                const formData = new FormData(e.target);
                for (const cat of expenseCategories) {
                    const amount = parseFloat(formData.get(`budget-${cat.value}`));
                    const existingBudget = budgetsCache.find(b => b.category === cat.value);
                    if (amount && amount > 0) {
                        if (existingBudget) await updateDoc(doc(db, 'budgets', existingBudget.id), { amount: amount, updatedAt: serverTimestamp() });
                        else await addDoc(collection(db, 'budgets'), { category: cat.value, amount: amount, userId: currentUser.uid, createdAt: serverTimestamp() });
                    } else if (existingBudget) await deleteDoc(doc(db, 'budgets', existingBudget.id));
                }
                showToast('Budgets saved!', 'success');
                window.FinanceApp.closeModal();
                await loadAllData();
            } catch (error) {
                console.error('Error saving budgets:', error);
                showToast('Failed to save budgets', 'error');
            } finally {
                setButtonLoading(submitBtn, false, '<i class="fas fa-save mr-1"></i> Save Budgets');
            }
        };
    },
    
    // Add Goal Modal
    showAddGoalModal: () => {
        const modalHtml = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.FinanceApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="border-color: var(--border-color); background: var(--bg-secondary);">
                        <div><h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);"><i class="fas fa-bullseye mr-2"></i>Financial Goal</h2><p class="text-xs md:text-sm text-muted mt-1">Set a savings or financial target</p></div>
                        <button onclick="window.FinanceApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition"><i class="fas fa-times text-muted"></i></button>
                    </div>
                    <form id="goal-form" class="p-5 space-y-4">
                        <div><label class="block text-sm font-semibold mb-2">Goal Name</label><input type="text" name="name" required placeholder="e.g., Emergency Fund, Vacation Savings" class="w-full px-3 md:px-4 py-2 border rounded-lg text-sm md:text-base focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></div>
                        <div><label class="block text-sm font-semibold mb-2">Target Amount</label><input type="number" name="targetAmount" step="1000" required placeholder="0.00" class="w-full px-3 md:px-4 py-2 border rounded-lg text-sm md:text-base focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></div>
                        <div><label class="block text-sm font-semibold mb-2">Current Amount</label><input type="number" name="currentAmount" step="100" value="0" placeholder="0.00" class="w-full px-3 md:px-4 py-2 border rounded-lg text-sm md:text-base focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></div>
                        <div><label class="block text-sm font-semibold mb-2">Target Date</label><input type="date" name="targetDate" required class="w-full px-3 md:px-4 py-2 border rounded-lg text-sm md:text-base focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></div>
                        <div class="flex flex-col sm:flex-row gap-3 pt-4"><button type="submit" id="create-goal-btn" class="flex-1 py-2.5 rounded-lg font-semibold text-sm md:text-base transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">Create Goal</button><button type="button" onclick="window.FinanceApp.closeModal()" class="flex-1 py-2.5 rounded-lg border text-sm md:text-base transition-all hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button></div>
                    </form>
                </div>
            </div>
        `;
        document.getElementById('modal-container').innerHTML = modalHtml;
        document.getElementById('modal-container').style.pointerEvents = 'auto';
        
        document.getElementById('goal-form').onsubmit = async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('create-goal-btn');
            setButtonLoading(submitBtn, true);
            
            try {
                const data = new FormData(e.target);
                await addDoc(collection(db, 'financialGoals'), { 
                    name: data.get('name'), 
                    targetAmount: parseFloat(data.get('targetAmount')), 
                    currentAmount: parseFloat(data.get('currentAmount')), 
                    targetDate: new Date(data.get('targetDate')), 
                    userId: currentUser.uid, 
                    createdAt: serverTimestamp() 
                });
                showToast('Goal created!', 'success');
                window.FinanceApp.closeModal();
                await loadAllData();
            } catch (error) {
                console.error('Error creating goal:', error);
                showToast('Failed to create goal', 'error');
            } finally {
                setButtonLoading(submitBtn, false, 'Create Goal');
            }
        };
    },
    
    // Invoice Modal (original)
    showInvoiceModal: () => {
        const clientOptions = projectsCache.filter(p => p.client).map(p => `<option value="${escapeHtml(p.client)}">${escapeHtml(p.client)}</option>`).join('');
        
        const modalHtml = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.FinanceApp.closeModal()">
                <div class="rounded-2xl w-full max-w-2xl mx-auto max-h-[90vh] overflow-y-auto transform transition-all" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-file-invoice mr-2" style="color: var(--deep-blue);"></i>Create Invoice
                            </h2>
                            <p class="text-xs md:text-sm text-muted mt-1">Generate a professional invoice for your client</p>
                        </div>
                        <button onclick="window.FinanceApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="invoice-form" class="p-5 space-y-4">
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Client Name</label>
                                <input type="text" name="clientName" required placeholder="Client name" 
                                       class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Client Email</label>
                                <input type="email" name="clientEmail" placeholder="client@example.com" 
                                       class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Client Phone</label>
                            <div class="relative">
                                <span class="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted">+233</span>
                                <input type="tel" name="clientPhone" placeholder="24XXXXXXXX" 
                                       class="w-full pl-16 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <p class="text-xs text-muted mt-1">Optional - for sharing invoice link</p>
                        </div>
                        
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Invoice Date</label>
                                <input type="date" name="date" value="${new Date().toISOString().split('T')[0]}" required 
                                       class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Due Date</label>
                                <input type="date" name="dueDate" value="${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}" required 
                                       class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Status</label>
                            <select name="status" class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <option value="draft">Draft</option>
                                <option value="sent">Sent</option>
                                <option value="pending">Pending/Unpaid</option>
                            </select>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Invoice Items</label>
                            <div id="invoice-items-container" class="space-y-2">
                                <div class="invoice-item grid grid-cols-12 gap-2">
                                    <div class="col-span-6">
                                        <input type="text" name="item_description[]" placeholder="Description" class="w-full px-2 py-2 border rounded-lg text-sm" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    </div>
                                    <div class="col-span-2">
                                        <input type="number" name="item_quantity[]" placeholder="Qty" value="1" step="1" class="w-full px-2 py-2 border rounded-lg text-sm" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    </div>
                                    <div class="col-span-3">
                                        <input type="number" name="item_price[]" placeholder="Price" step="0.01" class="w-full px-2 py-2 border rounded-lg text-sm" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    </div>
                                    <div class="col-span-1">
                                        <button type="button" class="remove-item-btn w-full py-2 text-red-500 hover:text-red-700">✕</button>
                                    </div>
                                </div>
                            </div>
                            <button type="button" id="add-item-btn" class="mt-2 text-sm text-deep-blue hover:underline">
                                <i class="fas fa-plus"></i> Add Item
                            </button>
                        </div>
                        
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Tax Rate (%)</label>
                                <input type="number" name="taxRate" step="0.1" value="0" 
                                       class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Discount (%)</label>
                                <input type="number" name="discount" step="0.1" value="0" 
                                       class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Notes</label>
                            <textarea name="notes" rows="2" placeholder="Payment terms, thank you message, etc." 
                                      class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></textarea>
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button type="submit" id="create-invoice-btn-submit" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02] text-sm" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-1"></i> Create Invoice
                            </button>
                            <button type="button" onclick="window.FinanceApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700 text-sm" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.getElementById('modal-container').innerHTML = modalHtml;
        document.getElementById('modal-container').style.pointerEvents = 'auto';
        
        let itemCount = 1;
        document.getElementById('add-item-btn')?.addEventListener('click', () => {
            itemCount++;
            const container = document.getElementById('invoice-items-container');
            const newItem = document.createElement('div');
            newItem.className = 'invoice-item grid grid-cols-12 gap-2';
            newItem.innerHTML = `
                <div class="col-span-6"><input type="text" name="item_description[]" placeholder="Description" class="w-full px-2 py-2 border rounded-lg text-sm" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></div>
                <div class="col-span-2"><input type="number" name="item_quantity[]" placeholder="Qty" value="1" step="1" class="w-full px-2 py-2 border rounded-lg text-sm" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></div>
                <div class="col-span-3"><input type="number" name="item_price[]" placeholder="Price" step="0.01" class="w-full px-2 py-2 border rounded-lg text-sm" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></div>
                <div class="col-span-1"><button type="button" class="remove-item-btn w-full py-2 text-red-500 hover:text-red-700">✕</button></div>
            `;
            container.appendChild(newItem);
            newItem.querySelector('.remove-item-btn').addEventListener('click', () => newItem.remove());
        });
        
        document.querySelectorAll('.remove-item-btn').forEach(btn => {
            btn.addEventListener('click', () => btn.closest('.invoice-item')?.remove());
        });
        
        document.getElementById('invoice-form').onsubmit = async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('create-invoice-btn-submit');
            setButtonLoading(submitBtn, true);
            
            try {
                const formData = new FormData(e.target);
                
                const descriptions = formData.getAll('item_description[]');
                const quantities = formData.getAll('item_quantity[]');
                const prices = formData.getAll('item_price[]');
                
                const items = [];
                let subtotal = 0;
                
                for (let i = 0; i < descriptions.length; i++) {
                    if (descriptions[i]) {
                        const qty = parseFloat(quantities[i]) || 0;
                        const price = parseFloat(prices[i]) || 0;
                        const total = qty * price;
                        subtotal += total;
                        items.push({ description: descriptions[i], quantity: qty, price: price, total: total });
                    }
                }
                
                const taxRate = parseFloat(formData.get('taxRate')) || 0;
                const discount = parseFloat(formData.get('discount')) || 0;
                const taxAmount = (subtotal - discount) * (taxRate / 100);
                const total = subtotal - discount + taxAmount;
                
                const invoiceNumber = generateInvoiceNumber();
                const status = formData.get('status') || 'draft';
                const clientPhone = formData.get('clientPhone') || '';
                
                const invoiceData = {
                    invoiceNumber: invoiceNumber,
                    clientName: formData.get('clientName'),
                    clientEmail: formData.get('clientEmail') || '',
                    clientPhone: clientPhone,
                    date: new Date(formData.get('date')),
                    dueDate: new Date(formData.get('dueDate')),
                    items: items,
                    subtotal: subtotal,
                    discount: discount,
                    taxRate: taxRate,
                    taxAmount: taxAmount,
                    total: total,
                    notes: formData.get('notes') || '',
                    status: status,
                    amountPaid: 0,
                    balanceDue: total,
                    userId: currentUser.uid,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                };
                
                await addDoc(collection(db, 'invoices'), invoiceData);
                
                await addDoc(collection(db, 'invoiceTimeline'), {
                    invoiceNumber: invoiceNumber,
                    action: 'created',
                    description: `Invoice ${invoiceNumber} created`,
                    userId: currentUser.uid,
                    timestamp: serverTimestamp()
                });
                
                showToast(`Invoice ${invoiceNumber} created successfully!`, 'success');
                window.FinanceApp.closeModal();
                await loadAllData();
            } catch (error) {
                console.error('Error creating invoice:', error);
                showToast('Failed to create invoice', 'error');
            } finally {
                setButtonLoading(submitBtn, false, '<i class="fas fa-save mr-1"></i> Create Invoice');
            }
        };
    },
    
    // Record Payment
    recordPayment: async (invoiceId) => {
        const invoice = invoicesCache.find(i => i.id === invoiceId);
        if (!invoice) return;
        
        const balanceDue = invoice.total - (invoice.amountPaid || 0);
        
        const modalHtml = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.FinanceApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-money-bill mr-2" style="color: var(--deep-blue);"></i>Record Payment
                            </h2>
                            <p class="text-xs md:text-sm text-muted mt-1">${invoice.invoiceNumber} - ${escapeHtml(invoice.clientName)}</p>
                        </div>
                        <button onclick="window.FinanceApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="payment-form" class="p-5 space-y-4">
                        <div class="bg-primary p-3 rounded-lg" style="background: var(--bg-primary);">
                            <div class="flex justify-between text-sm">
                                <span style="color: var(--text-muted);">Total Invoice:</span>
                                <span class="font-bold">${formatCurrency(invoice.total, 'GHS')}</span>
                            </div>
                            <div class="flex justify-between text-sm">
                                <span style="color: var(--text-muted);">Amount Paid:</span>
                                <span class="font-bold text-emerald-500">${formatCurrency(invoice.amountPaid || 0, 'GHS')}</span>
                            </div>
                            <div class="flex justify-between text-sm font-bold">
                                <span style="color: var(--text-muted);">Balance Due:</span>
                                <span style="color: ${balanceDue > 0 ? '#ef4444' : '#10b981'};">${formatCurrency(balanceDue, 'GHS')}</span>
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Payment Amount</label>
                            <input type="number" name="paymentAmount" step="0.01" required max="${balanceDue}" placeholder="0.00" 
                                   class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            <p class="text-xs text-muted mt-1">Maximum: ${formatCurrency(balanceDue, 'GHS')}</p>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Payment Date</label>
                            <input type="date" name="paymentDate" value="${new Date().toISOString().split('T')[0]}" required
                                   class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Payment Method</label>
                            <select name="paymentMethod" class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <option value="cash">Cash</option>
                                <option value="bank_transfer">Bank Transfer</option>
                                <option value="mobile_money">Mobile Money</option>
                                <option value="card">Card Payment</option>
                                <option value="cheque">Cheque</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Reference / Notes</label>
                            <input type="text" name="reference" placeholder="Transaction reference or notes"
                                   class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button type="submit" id="record-payment-btn" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02] text-sm" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-1"></i> Record Payment
                            </button>
                            <button type="button" onclick="window.FinanceApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700 text-sm" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.getElementById('modal-container').innerHTML = modalHtml;
        document.getElementById('modal-container').style.pointerEvents = 'auto';
        
        document.getElementById('payment-form').onsubmit = async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('record-payment-btn');
            setButtonLoading(submitBtn, true);
            
            try {
                const formData = new FormData(e.target);
                const paymentAmount = parseFloat(formData.get('paymentAmount'));
                const paymentDate = new Date(formData.get('paymentDate'));
                const paymentMethod = formData.get('paymentMethod');
                const reference = formData.get('reference') || '';
                
                if (paymentAmount > balanceDue) {
                    showToast('Payment amount cannot exceed balance due', 'error');
                    setButtonLoading(submitBtn, false, '<i class="fas fa-save mr-1"></i> Record Payment');
                    return;
                }
                
                const newAmountPaid = (invoice.amountPaid || 0) + paymentAmount;
                let newStatus = invoice.status;
                
                if (newAmountPaid >= invoice.total) {
                    newStatus = 'paid';
                } else if (newAmountPaid > 0) {
                    newStatus = 'partially-paid';
                }
                
                await updateDoc(doc(db, 'invoices', invoiceId), {
                    amountPaid: newAmountPaid,
                    balanceDue: invoice.total - newAmountPaid,
                    status: newStatus,
                    updatedAt: serverTimestamp()
                });
                
                await addDoc(collection(db, 'paymentHistory'), {
                    invoiceId: invoiceId,
                    invoiceNumber: invoice.invoiceNumber,
                    amount: paymentAmount,
                    paymentDate: paymentDate,
                    paymentMethod: paymentMethod,
                    reference: reference,
                    userId: currentUser.uid,
                    createdAt: serverTimestamp()
                });
                
                await addDoc(collection(db, 'invoiceTimeline'), {
                    invoiceNumber: invoice.invoiceNumber,
                    action: 'payment_received',
                    description: `Payment of ${formatCurrency(paymentAmount, 'GHS')} received. ${newStatus === 'paid' ? 'Invoice fully paid!' : `Balance due: ${formatCurrency(invoice.total - newAmountPaid, 'GHS')}`}`,
                    userId: currentUser.uid,
                    timestamp: serverTimestamp()
                });
                
                showToast(`Payment of ${formatCurrency(paymentAmount, 'GHS')} recorded successfully!`, 'success');
                window.FinanceApp.closeModal();
                await loadAllData();
            } catch (error) {
                console.error('Error recording payment:', error);
                showToast('Failed to record payment', 'error');
            } finally {
                setButtonLoading(submitBtn, false, '<i class="fas fa-save mr-1"></i> Record Payment');
            }
        };
    },
    
    // View Invoice
    viewInvoice: async (invoiceId) => {
        const invoice = invoicesCache.find(i => i.id === invoiceId);
        if (!invoice) return;
        
        const paymentHistory = paymentHistoryCache.filter(p => p.invoiceId === invoiceId);
        const timeline = invoiceTimelineCache.filter(t => t.invoiceNumber === invoice.invoiceNumber);
        
        const statusColors = { 
            draft: '#6b7280', 
            sent: '#3b82f6', 
            pending: '#f59e0b', 
            'partially-paid': '#8b5cf6',
            paid: '#10b981', 
            overdue: '#ef4444', 
            cancelled: '#6b7280',
            refunded: '#ec4899' 
        };
        
        const settings = businessSettings;
        
        const modalHtml = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.FinanceApp.closeModal()">
                <div class="rounded-2xl w-full max-w-4xl mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color); z-10;">
                        <div>
                            <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-file-invoice mr-2"></i>Invoice ${invoice.invoiceNumber}
                            </h2>
                        </div>
                        <div class="flex gap-2 flex-wrap">
                            <button onclick="window.FinanceApp.exportInvoicePDF('${invoiceId}')" class="px-3 py-1.5 rounded-lg text-sm" style="background: var(--deep-blue); color: white;">
                                <i class="fas fa-download"></i> PDF
                            </button>
                            <button onclick="window.FinanceApp.recordPayment('${invoiceId}')" class="px-3 py-1.5 rounded-lg text-sm" style="background: var(--emerald); color: white;">
                                <i class="fas fa-money-bill"></i> Payment
                            </button>
                            <button onclick="window.shareInvoice('${invoiceId}')" class="px-3 py-1.5 rounded-lg text-sm" style="background: var(--gold); color: white;">
                                <i class="fas fa-share-alt"></i> Share
                            </button>
                            <button onclick="window.FinanceApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition">
                                <i class="fas fa-times text-muted"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div id="invoice-preview" class="p-8" style="background: white; color: #1a1a2e;">
                        <div class="invoice-container" style="max-width: 900px; margin: 0 auto;">
                            <div class="flex justify-between items-start mb-8" style="border-bottom: 3px solid #1a1a2e; padding-bottom: 20px;">
                                <div>
                                    ${settings.logo ? `<img src="${settings.logo}" alt="${escapeHtml(settings.name)}" style="max-height: 80px; object-fit: contain; margin-bottom: 10px;">` : ''}
                                    <h1 style="font-size: 28px; font-weight: 700; color: #1a1a2e; margin: 0;">${escapeHtml(settings.name || 'ProfJero WorkSpace')}</h1>
                                    ${settings.address ? `<p style="color: #666; font-size: 13px; margin: 4px 0;">${escapeHtml(settings.address)}</p>` : ''}
                                    ${settings.phone ? `<p style="color: #666; font-size: 13px; margin: 2px 0;">📞 ${escapeHtml(settings.phone)}</p>` : ''}
                                    ${settings.email ? `<p style="color: #666; font-size: 13px; margin: 2px 0;">✉️ ${escapeHtml(settings.email)}</p>` : ''}
                                </div>
                                <div style="text-align: right;">
                                    <h2 style="font-size: 32px; font-weight: 700; color: #1a1a2e; margin: 0;">INVOICE</h2>
                                    <p style="color: #666; font-size: 14px; margin: 4px 0;"># ${invoice.invoiceNumber}</p>
                                    <p style="display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 600; background: ${statusColors[invoice.status]}20; color: ${statusColors[invoice.status]};">
                                        ${invoice.status.replace('-', ' ').toUpperCase()}
                                    </p>
                                </div>
                            </div>
                            
                            <div class="grid grid-cols-2 gap-8 mb-8" style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px;">
                                <div>
                                    <p style="color: #666; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Bill To:</p>
                                    <p style="font-size: 16px; font-weight: 600; margin: 4px 0; color: #1a1a2e;">${escapeHtml(invoice.clientName)}</p>
                                    ${invoice.clientEmail ? `<p style="color: #666; font-size: 14px; margin: 2px 0;">${escapeHtml(invoice.clientEmail)}</p>` : ''}
                                    ${invoice.clientPhone ? `<p style="color: #666; font-size: 14px; margin: 2px 0;">📞 ${escapeHtml(invoice.clientPhone)}</p>` : ''}
                                </div>
                                <div style="text-align: right;">
                                    <p style="color: #666; font-size: 13px; margin: 2px 0;"><strong>Invoice Date:</strong> ${formatDate(invoice.date)}</p>
                                    <p style="color: #666; font-size: 13px; margin: 2px 0;"><strong>Due Date:</strong> ${formatDate(invoice.dueDate)}</p>
                                    ${invoice.dueDate && new Date(invoice.dueDate) < new Date() && invoice.status !== 'paid' && invoice.status !== 'cancelled' ? 
                                        `<p style="color: #ef4444; font-size: 13px; font-weight: 600;">⚠️ OVERDUE</p>` : ''}
                                </div>
                            </div>
                            
                            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                                <thead>
                                    <tr style="background: #f8f9fa; border-bottom: 2px solid #1a1a2e;">
                                        <th style="text-align: left; padding: 12px 8px; font-size: 13px; font-weight: 600; color: #1a1a2e;">Description</th>
                                        <th style="text-align: center; padding: 12px 8px; font-size: 13px; font-weight: 600; color: #1a1a2e;">Qty</th>
                                        <th style="text-align: right; padding: 12px 8px; font-size: 13px; font-weight: 600; color: #1a1a2e;">Unit Price</th>
                                        <th style="text-align: right; padding: 12px 8px; font-size: 13px; font-weight: 600; color: #1a1a2e;">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${invoice.items.map((item, index) => `
                                        <tr style="border-bottom: ${index === invoice.items.length - 1 ? '2px solid #1a1a2e' : '1px solid #e5e7eb'};">
                                            <td style="padding: 12px 8px; font-size: 14px; color: #1a1a2e;">${escapeHtml(item.description)}</td>
                                            <td style="text-align: center; padding: 12px 8px; font-size: 14px; color: #1a1a2e;">${item.quantity}</td>
                                            <td style="text-align: right; padding: 12px 8px; font-size: 14px; color: #1a1a2e;">${formatCurrency(item.price, 'GHS')}</td>
                                            <td style="text-align: right; padding: 12px 8px; font-size: 14px; color: #1a1a2e; font-weight: 600;">${formatCurrency(item.total, 'GHS')}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td colspan="3" style="text-align: right; padding: 10px 8px; font-size: 14px; color: #666;">Subtotal:</td>
                                        <td style="text-align: right; padding: 10px 8px; font-size: 14px; color: #1a1a2e;">${formatCurrency(invoice.subtotal, 'GHS')}</td>
                                    </tr>
                                    ${invoice.discount > 0 ? `
                                        <tr>
                                            <td colspan="3" style="text-align: right; padding: 6px 8px; font-size: 14px; color: #666;">Discount (${invoice.discount}%):</td>
                                            <td style="text-align: right; padding: 6px 8px; font-size: 14px; color: #ef4444;">-${formatCurrency(invoice.discount, 'GHS')}</td>
                                        </tr>
                                    ` : ''}
                                    ${invoice.taxRate > 0 ? `
                                        <tr>
                                            <td colspan="3" style="text-align: right; padding: 6px 8px; font-size: 14px; color: #666;">Tax (${invoice.taxRate}%):</td>
                                            <td style="text-align: right; padding: 6px 8px; font-size: 14px; color: #1a1a2e;">${formatCurrency(invoice.taxAmount, 'GHS')}</td>
                                        </tr>
                                    ` : ''}
                                    <tr style="border-top: 3px solid #1a1a2e; background: #f8f9fa;">
                                        <td colspan="3" style="text-align: right; padding: 15px 8px; font-size: 18px; font-weight: 700; color: #1a1a2e;">Total Due:</td>
                                        <td style="text-align: right; padding: 15px 8px; font-size: 20px; font-weight: 700; color: #1a1a2e;">${formatCurrency(invoice.total, 'GHS')}</td>
                                    </tr>
                                </tfoot>
                            </table>
                            
                            <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
                                    <div>
                                        <p style="font-size: 12px; color: #666; margin: 0;">Total Invoice</p>
                                        <p style="font-size: 16px; font-weight: 600; color: #1a1a2e; margin: 2px 0;">${formatCurrency(invoice.total, 'GHS')}</p>
                                    </div>
                                    <div>
                                        <p style="font-size: 12px; color: #666; margin: 0;">Amount Paid</p>
                                        <p style="font-size: 16px; font-weight: 600; color: #10b981; margin: 2px 0;">${formatCurrency(invoice.amountPaid || 0, 'GHS')}</p>
                                    </div>
                                    <div>
                                        <p style="font-size: 12px; color: #666; margin: 0;">Balance Due</p>
                                        <p style="font-size: 16px; font-weight: 600; color: ${(invoice.balanceDue || invoice.total) > 0 ? '#ef4444' : '#10b981'}; margin: 2px 0;">${formatCurrency(invoice.balanceDue || invoice.total, 'GHS')}</p>
                                    </div>
                                </div>
                            </div>
                            
                            ${paymentHistory.length > 0 ? `
                                <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                                    <h4 style="font-size: 14px; font-weight: 600; color: #1a1a2e; margin: 0 0 10px 0;">Payment History</h4>
                                    ${paymentHistory.map(p => `
                                        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                                            <span style="font-size: 13px; color: #1a1a2e;">${formatDate(p.paymentDate)}</span>
                                            <span style="font-size: 13px; color: #1a1a2e;">${p.paymentMethod}</span>
                                            <span style="font-size: 13px; font-weight: 600; color: #10b981;">${formatCurrency(p.amount, 'GHS')}</span>
                                            ${p.reference ? `<span style="font-size: 12px; color: #666;">${escapeHtml(p.reference)}</span>` : ''}
                                        </div>
                                    `).join('')}
                                </div>
                            ` : ''}
                            
                            ${timeline.length > 0 ? `
                                <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                                    <h4 style="font-size: 14px; font-weight: 600; color: #1a1a2e; margin: 0 0 10px 0;">Invoice Timeline</h4>
                                    ${timeline.map(t => `
                                        <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e5e7eb;">
                                            <span style="font-size: 13px; color: #1a1a2e;">${escapeHtml(t.description)}</span>
                                            <span style="font-size: 12px; color: #666;">${formatDate(t.timestamp)}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            ` : ''}
                            
                            <div style="margin: 30px 0; padding: 20px; background: #f8f9fa; border-radius: 8px;">
                                <h4 style="font-size: 14px; font-weight: 600; color: #1a1a2e; margin: 0 0 10px 0;">Payment Details</h4>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                                    ${settings.paymentDetails?.mobileMoney ? `
                                        <div>
                                            <p style="font-size: 12px; color: #666; margin: 0;">Mobile Money</p>
                                            <p style="font-size: 14px; color: #1a1a2e; margin: 2px 0; font-weight: 500;">${escapeHtml(settings.paymentDetails.mobileMoney)}</p>
                                            ${settings.paymentDetails?.mobileMoneyName ? `<p style="font-size: 12px; color: #666; margin: 0;">Name: ${escapeHtml(settings.paymentDetails.mobileMoneyName)}</p>` : ''}
                                        </div>
                                    ` : ''}
                                    ${settings.paymentDetails?.paymentInstructions ? `
                                        <div style="grid-column: 1 / -1;">
                                            <p style="font-size: 12px; color: #666; margin: 0;">Payment Instructions</p>
                                            <p style="font-size: 13px; color: #666; margin: 2px 0;">${escapeHtml(settings.paymentDetails.paymentInstructions)}</p>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                            
                            ${invoice.notes ? `
                                <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-left: 4px solid #1a1a2e; border-radius: 4px;">
                                    <p style="font-size: 13px; color: #666; margin: 0;">${escapeHtml(invoice.notes)}</p>
                                </div>
                            ` : ''}
                            
                            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
                                <p style="font-size: 13px; color: #999; margin: 0;">Thank you for your business!</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="sticky bottom-0 p-4 border-t flex gap-3 flex-wrap" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        ${invoice.status === 'draft' ? `
                            <button onclick="window.FinanceApp.updateInvoiceStatus('${invoiceId}', 'sent')" class="flex-1 py-2 rounded-lg font-semibold transition-all" style="background: #3b82f6; color: white;">
                                <i class="fas fa-paper-plane mr-1"></i> Mark as Sent
                            </button>
                        ` : ''}
                        ${invoice.status === 'sent' || invoice.status === 'pending' ? `
                            <button onclick="window.FinanceApp.recordPayment('${invoiceId}')" class="flex-1 py-2 rounded-lg font-semibold transition-all" style="background: var(--emerald); color: white;">
                                <i class="fas fa-money-bill mr-1"></i> Record Payment
                            </button>
                        ` : ''}
                        ${invoice.status !== 'cancelled' && invoice.status !== 'paid' && invoice.status !== 'refunded' ? `
                            <button onclick="window.FinanceApp.updateInvoiceStatus('${invoiceId}', 'cancelled')" class="flex-1 py-2 rounded-lg font-semibold border transition-all hover:bg-red-100" style="border-color: var(--border-color); color: #ef4444;">
                                <i class="fas fa-ban mr-1"></i> Cancel Invoice
                            </button>
                        ` : ''}
                        ${invoice.status === 'cancelled' ? `
                            <button onclick="window.FinanceApp.updateInvoiceStatus('${invoiceId}', 'draft')" class="flex-1 py-2 rounded-lg font-semibold border transition-all" style="border-color: var(--border-color); color: var(--text-primary);">
                                <i class="fas fa-undo mr-1"></i> Restore Invoice
                            </button>
                        ` : ''}
                        <button onclick="window.FinanceApp.exportInvoicePDF('${invoiceId}')" class="flex-1 py-2 rounded-lg font-semibold transition-all" style="background: var(--deep-blue); color: white;">
                            <i class="fas fa-download mr-1"></i> Download PDF
                        </button>
                        <button onclick="window.shareInvoice('${invoiceId}')" class="flex-1 py-2 rounded-lg font-semibold transition-all" style="background: var(--gold); color: white;">
                            <i class="fas fa-share-alt mr-1"></i> Share
                        </button>
                        <button onclick="window.FinanceApp.deleteInvoice('${invoiceId}')" class="flex-1 py-2 rounded-lg font-semibold border transition-all hover:bg-red-100" style="border-color: var(--border-color); color: #ef4444;">
                            <i class="fas fa-trash mr-1"></i> Delete
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('modal-container').innerHTML = modalHtml;
        document.getElementById('modal-container').style.pointerEvents = 'auto';
        
        await addDoc(collection(db, 'invoiceTimeline'), {
            invoiceNumber: invoice.invoiceNumber,
            action: 'viewed',
            description: 'Invoice viewed',
            userId: currentUser.uid,
            timestamp: serverTimestamp()
        });
        
        await loadInvoiceTimeline();
    },
    
    updateInvoiceStatus: async (invoiceId, status) => {
        try {
            const invoice = invoicesCache.find(i => i.id === invoiceId);
            if (!invoice) return;
            
            await updateDoc(doc(db, 'invoices', invoiceId), {
                status: status,
                updatedAt: serverTimestamp()
            });
            
            await addDoc(collection(db, 'invoiceTimeline'), {
                invoiceNumber: invoice.invoiceNumber,
                action: `status_changed_to_${status}`,
                description: `Invoice status changed to ${status.replace('-', ' ').toUpperCase()}`,
                userId: currentUser.uid,
                timestamp: serverTimestamp()
            });
            
            showToast(`Invoice marked as ${status.replace('-', ' ').toUpperCase()}!`, 'success');
            window.FinanceApp.closeModal();
            await loadAllData();
        } catch (error) {
            console.error('Error updating invoice status:', error);
            showToast('Failed to update invoice status', 'error');
        }
    },
    
    deleteInvoice: async (invoiceId) => {
        if (confirm('Delete this invoice?')) {
            try {
                const invoice = invoicesCache.find(i => i.id === invoiceId);
                await deleteDoc(doc(db, 'invoices', invoiceId));
                
                const paymentHistoryQuery = query(collection(db, 'paymentHistory'), where('invoiceId', '==', invoiceId));
                const paymentHistorySnapshot = await getDocs(paymentHistoryQuery);
                paymentHistorySnapshot.docs.forEach(doc => deleteDoc(doc.ref));
                
                const timelineQuery = query(collection(db, 'invoiceTimeline'), where('invoiceNumber', '==', invoice?.invoiceNumber));
                const timelineSnapshot = await getDocs(timelineQuery);
                timelineSnapshot.docs.forEach(doc => deleteDoc(doc.ref));
                
                showToast('Invoice deleted', 'success');
                window.FinanceApp.closeModal();
                await loadAllData();
            } catch (error) {
                console.error('Error deleting invoice:', error);
                showToast('Failed to delete invoice', 'error');
            }
        }
    },
    
    exportInvoicePDF: async (invoiceId) => {
        const invoice = invoicesCache.find(i => i.id === invoiceId);
        if (!invoice) return;
        
        const settings = businessSettings;
        const statusColors = { 
            draft: '#6b7280', 
            sent: '#3b82f6', 
            pending: '#f59e0b', 
            'partially-paid': '#8b5cf6',
            paid: '#10b981', 
            overdue: '#ef4444', 
            cancelled: '#6b7280',
            refunded: '#ec4899' 
        };
        
        const paymentHistory = paymentHistoryCache.filter(p => p.invoiceId === invoiceId);
        
        const printContent = `
            <div style="padding: 40px; font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; background: white; color: #1a1a2e;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a1a2e; padding-bottom: 20px; margin-bottom: 30px;">
                    <div>
                        ${settings.logo ? `<img src="${settings.logo}" alt="${escapeHtml(settings.name)}" style="max-height: 80px; object-fit: contain; margin-bottom: 10px;">` : ''}
                        <h1 style="font-size: 28px; font-weight: 700; color: #1a1a2e; margin: 0;">${escapeHtml(settings.name || 'ProfJero WorkSpace')}</h1>
                        ${settings.address ? `<p style="color: #666; font-size: 13px; margin: 4px 0;">${escapeHtml(settings.address)}</p>` : ''}
                        ${settings.phone ? `<p style="color: #666; font-size: 13px; margin: 2px 0;">📞 ${escapeHtml(settings.phone)}</p>` : ''}
                        ${settings.email ? `<p style="color: #666; font-size: 13px; margin: 2px 0;">✉️ ${escapeHtml(settings.email)}</p>` : ''}
                    </div>
                    <div style="text-align: right;">
                        <h2 style="font-size: 32px; font-weight: 700; color: #1a1a2e; margin: 0;">INVOICE</h2>
                        <p style="color: #666; font-size: 14px; margin: 4px 0;"># ${invoice.invoiceNumber}</p>
                        <p style="display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 600; background: ${statusColors[invoice.status]}20; color: ${statusColors[invoice.status]};">
                            ${invoice.status.replace('-', ' ').toUpperCase()}
                        </p>
                    </div>
                </div>
                
                <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
                    <div>
                        <p style="color: #666; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Bill To:</p>
                        <p style="font-size: 16px; font-weight: 600; margin: 4px 0;">${escapeHtml(invoice.clientName)}</p>
                        ${invoice.clientEmail ? `<p style="color: #666; font-size: 14px; margin: 2px 0;">${escapeHtml(invoice.clientEmail)}</p>` : ''}
                        ${invoice.clientPhone ? `<p style="color: #666; font-size: 14px; margin: 2px 0;">📞 ${escapeHtml(invoice.clientPhone)}</p>` : ''}
                    </div>
                    <div style="text-align: right;">
                        <p style="color: #666; font-size: 13px; margin: 2px 0;"><strong>Invoice Date:</strong> ${formatDate(invoice.date)}</p>
                        <p style="color: #666; font-size: 13px; margin: 2px 0;"><strong>Due Date:</strong> ${formatDate(invoice.dueDate)}</p>
                    </div>
                </div>
                
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                    <thead>
                        <tr style="background: #f8f9fa; border-bottom: 2px solid #1a1a2e;">
                            <th style="text-align: left; padding: 12px 8px; font-size: 13px; font-weight: 600;">Description</th>
                            <th style="text-align: center; padding: 12px 8px; font-size: 13px; font-weight: 600;">Qty</th>
                            <th style="text-align: right; padding: 12px 8px; font-size: 13px; font-weight: 600;">Unit Price</th>
                            <th style="text-align: right; padding: 12px 8px; font-size: 13px; font-weight: 600;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${invoice.items.map((item, index) => `
                            <tr style="border-bottom: ${index === invoice.items.length - 1 ? '2px solid #1a1a2e' : '1px solid #e5e7eb'};">
                                <td style="padding: 12px 8px; font-size: 14px;">${escapeHtml(item.description)}</td>
                                <td style="text-align: center; padding: 12px 8px; font-size: 14px;">${item.quantity}</td>
                                <td style="text-align: right; padding: 12px 8px; font-size: 14px;">${formatCurrency(item.price, 'GHS')}</td>
                                <td style="text-align: right; padding: 12px 8px; font-size: 14px; font-weight: 600;">${formatCurrency(item.total, 'GHS')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr><td colspan="3" style="text-align: right; padding: 10px 8px; font-size: 14px; color: #666;">Subtotal:</td><td style="text-align: right; padding: 10px 8px; font-size: 14px;">${formatCurrency(invoice.subtotal, 'GHS')}</td></tr>
                        ${invoice.discount > 0 ? `<tr><td colspan="3" style="text-align: right; padding: 6px 8px; font-size: 14px; color: #666;">Discount (${invoice.discount}%):</td><td style="text-align: right; padding: 6px 8px; font-size: 14px; color: #ef4444;">-${formatCurrency(invoice.discount, 'GHS')}</td></tr>` : ''}
                        ${invoice.taxRate > 0 ? `<tr><td colspan="3" style="text-align: right; padding: 6px 8px; font-size: 14px; color: #666;">Tax (${invoice.taxRate}%):</td><td style="text-align: right; padding: 6px 8px; font-size: 14px;">${formatCurrency(invoice.taxAmount, 'GHS')}</td></tr>` : ''}
                        <tr style="border-top: 3px solid #1a1a2e; background: #f8f9fa;">
                            <td colspan="3" style="text-align: right; padding: 15px 8px; font-size: 18px; font-weight: 700;">Total Due:</td>
                            <td style="text-align: right; padding: 15px 8px; font-size: 20px; font-weight: 700;">${formatCurrency(invoice.total, 'GHS')}</td>
                        </tr>
                    </tfoot>
                </table>
                
                <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
                        <div>
                            <p style="font-size: 12px; color: #666; margin: 0;">Total Invoice</p>
                            <p style="font-size: 16px; font-weight: 600; color: #1a1a2e; margin: 2px 0;">${formatCurrency(invoice.total, 'GHS')}</p>
                        </div>
                        <div>
                            <p style="font-size: 12px; color: #666; margin: 0;">Amount Paid</p>
                            <p style="font-size: 16px; font-weight: 600; color: #10b981; margin: 2px 0;">${formatCurrency(invoice.amountPaid || 0, 'GHS')}</p>
                        </div>
                        <div>
                            <p style="font-size: 12px; color: #666; margin: 0;">Balance Due</p>
                            <p style="font-size: 16px; font-weight: 600; color: ${(invoice.balanceDue || invoice.total) > 0 ? '#ef4444' : '#10b981'}; margin: 2px 0;">${formatCurrency(invoice.balanceDue || invoice.total, 'GHS')}</p>
                        </div>
                    </div>
                </div>
                
                ${paymentHistory.length > 0 ? `
                    <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                        <h4 style="font-size: 14px; font-weight: 600; margin: 0 0 10px 0;">Payment History</h4>
                        ${paymentHistory.map(p => `
                            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                                <span style="font-size: 13px;">${formatDate(p.paymentDate)}</span>
                                <span style="font-size: 13px;">${p.paymentMethod}</span>
                                <span style="font-size: 13px; font-weight: 600; color: #10b981;">${formatCurrency(p.amount, 'GHS')}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                
                <div style="margin: 30px 0; padding: 20px; background: #f8f9fa; border-radius: 8px;">
                    <h4 style="font-size: 14px; font-weight: 600; margin: 0 0 10px 0;">Payment Details</h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        ${settings.paymentDetails?.mobileMoney ? `
                            <div>
                                <p style="font-size: 12px; color: #666; margin: 0;">Mobile Money</p>
                                <p style="font-size: 14px; margin: 2px 0; font-weight: 500;">${escapeHtml(settings.paymentDetails.mobileMoney)}</p>
                                ${settings.paymentDetails?.mobileMoneyName ? `<p style="font-size: 12px; color: #666; margin: 0;">Name: ${escapeHtml(settings.paymentDetails.mobileMoneyName)}</p>` : ''}
                            </div>
                        ` : ''}
                        ${settings.paymentDetails?.paymentInstructions ? `
                            <div style="grid-column: 1 / -1;">
                                <p style="font-size: 12px; color: #666; margin: 0;">Payment Instructions</p>
                                <p style="font-size: 13px; color: #666; margin: 2px 0;">${escapeHtml(settings.paymentDetails.paymentInstructions)}</p>
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                ${invoice.notes ? `
                    <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-left: 4px solid #1a1a2e; border-radius: 4px;">
                        <p style="font-size: 13px; color: #666; margin: 0;">${escapeHtml(invoice.notes)}</p>
                    </div>
                ` : ''}
                
                <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
                    <p style="font-size: 13px; color: #999; margin: 0;">Thank you for your business!</p>
                </div>
            </div>
        `;
        
        const originalTitle = document.title;
        document.title = `Invoice_${invoice.invoiceNumber}`;
        
        const printWindow = window.open('', '_blank', 'width=1000,height=800');
        printWindow.document.write(`
            <html>
                <head>
                    <title>Invoice ${invoice.invoiceNumber}</title>
                    <style>
                        @page { margin: 20px; }
                        body { margin: 0; padding: 20px; background: white; }
                    </style>
                </head>
                <body>${printContent}</body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
        
        document.title = originalTitle;
        showToast('Print window opened. Save as PDF using browser print dialog.', 'info');
    },
    
    // Edit Transaction
    editTransaction: async (id) => {
        const transaction = transactionsCache.find(t => t.id === id);
        if (!transaction) return;
        const dateValue = transaction.date.toISOString().split('T')[0];
        
        const goalOptions = goalsCache
            .filter(g => g.category === 'savings' || g.category === 'financial')
            .map(g => `<option value="${g.id}" ${g.id === transaction.goalId ? 'selected' : ''}>${escapeHtml(g.title)}</option>`)
            .join('');
        
        const modalHtml = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.FinanceApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">Edit Transaction</h2>
                        <button onclick="window.FinanceApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition"><i class="fas fa-times text-muted"></i></button>
                    </div>
                    <form id="edit-transaction-form" class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Type</label>
                            <select name="type" class="w-full px-3 md:px-4 py-2 border rounded-lg text-sm md:text-base focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <option value="expense" ${transaction.type === 'expense' ? 'selected' : ''}>Expense</option>
                                <option value="income" ${transaction.type === 'income' ? 'selected' : ''}>Income</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Category</label>
                            <input type="text" name="category" value="${transaction.category}" placeholder="Category" class="w-full px-3 md:px-4 py-2 border rounded-lg text-sm md:text-base focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Amount</label>
                            <input type="number" name="amount" step="0.01" value="${transaction.amount}" required class="w-full px-3 md:px-4 py-2 border rounded-lg text-sm md:text-base focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Description</label>
                            <input type="text" name="description" value="${escapeHtml(transaction.description)}" required class="w-full px-3 md:px-4 py-2 border rounded-lg text-sm md:text-base focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Link to Goal</label>
                            <select name="goalId" class="w-full px-3 md:px-4 py-2 border rounded-lg text-sm md:text-base focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <option value="">None</option>
                                ${goalOptions}
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Date</label>
                            <input type="date" name="date" value="${dateValue}" class="w-full px-3 md:px-4 py-2 border rounded-lg text-sm md:text-base focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        <div class="sticky bottom-0 pt-4 pb-2 flex flex-col sm:flex-row gap-3" style="background: var(--bg-secondary);">
                            <button type="submit" id="edit-transaction-btn" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">Save Changes</button>
                            <button type="button" onclick="window.FinanceApp.closeModal()" class="flex-1 py-2.5 rounded-lg border transition-all hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.getElementById('modal-container').innerHTML = modalHtml;
        document.getElementById('edit-transaction-form').onsubmit = async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('edit-transaction-btn');
            setButtonLoading(submitBtn, true);
            
            try {
                const data = new FormData(e.target);
                const goalId = data.get('goalId') || null;
                let goalName = null;
                
                if (goalId) {
                    const goal = goalsCache.find(g => g.id === goalId);
                    if (goal) goalName = goal.title;
                }
                
                await updateDoc(doc(db, 'transactions', id), { 
                    type: data.get('type'), 
                    category: data.get('category'), 
                    amount: parseFloat(data.get('amount')), 
                    description: data.get('description'), 
                    date: new Date(data.get('date')),
                    goalId: goalId,
                    goalName: goalName,
                    updatedAt: serverTimestamp() 
                });
                showToast('Transaction updated!', 'success');
                window.FinanceApp.closeModal();
                await loadAllData();
            } catch (error) {
                console.error('Error updating transaction:', error);
                showToast('Failed to update transaction', 'error');
            } finally {
                setButtonLoading(submitBtn, false, 'Save Changes');
            }
        };
    },
    
    deleteTransaction: async (id) => {
        if (confirm('Delete this transaction?')) { 
            try {
                await deleteDoc(doc(db, 'transactions', id)); 
                showToast('Transaction deleted', 'success'); 
                await loadAllData();
            } catch (error) {
                console.error('Error deleting transaction:', error);
                showToast('Failed to delete transaction', 'error');
            }
        }
    },
    
    // ============================================
    // DEBT MANAGER FUNCTIONS
    // ============================================
    showAddDebtModal: (type) => {
        const typeLabel = type === 'lent' ? 'Money Lent' : 'Money Borrowed';
        const personLabel = type === 'lent' ? "Borrower's Name" : "Lender's Name";
        const personPlaceholder = type === 'lent' ? "e.g., Kwame Mensah" : "e.g., Bank XYZ";
        
        const modalHtml = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.FinanceApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-hand-holding-usd mr-2" style="color: ${type === 'lent' ? '#10b981' : '#ef4444'};"></i>${typeLabel}
                            </h2>
                            <p class="text-xs md:text-sm text-muted mt-1">Track ${type === 'lent' ? 'money you lent' : 'money you borrowed'}</p>
                        </div>
                        <button onclick="window.FinanceApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="add-debt-form" class="p-5 space-y-4">
                        <input type="hidden" name="type" value="${type}">
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">${personLabel} *</label>
                            <input type="text" name="personName" required placeholder="${personPlaceholder}" 
                                   class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Phone Number</label>
                            <div class="relative">
                                <span class="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted">+233</span>
                                <input type="tel" name="phone" placeholder="24XXXXXXXX" 
                                       class="w-full pl-16 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Amount *</label>
                            <input type="number" name="amount" step="0.01" required placeholder="0.00" 
                                   class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Purpose</label>
                            <input type="text" name="purpose" placeholder="e.g., School fees, Business loan" 
                                   class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Date ${type === 'lent' ? 'Lent' : 'Borrowed'} *</label>
                                <input type="date" name="dateLent" value="${new Date().toISOString().split('T')[0]}" required 
                                       class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Due Date *</label>
                                <input type="date" name="dueDate" value="${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}" required 
                                       class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Interest Rate (%) <span class="text-xs text-muted">(Optional)</span></label>
                            <input type="number" name="interest" step="0.1" placeholder="e.g., 5" 
                                   class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Reminder Schedule</label>
                            <select name="reminderSchedule" class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <option value="none">No reminders</option>
                                <option value="weekly">Weekly</option>
                                <option value="biweekly">Bi-weekly</option>
                                <option value="monthly">Monthly</option>
                            </select>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Notes</label>
                            <textarea name="notes" rows="2" placeholder="Additional notes..." 
                                      class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></textarea>
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button type="submit" id="save-debt-btn" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02] text-sm" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-1"></i> Save ${typeLabel}
                            </button>
                            <button type="button" onclick="window.FinanceApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700 text-sm" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.getElementById('modal-container').innerHTML = modalHtml;
        document.getElementById('modal-container').style.pointerEvents = 'auto';
        
        document.getElementById('add-debt-form').onsubmit = async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('save-debt-btn');
            setButtonLoading(submitBtn, true);
            
            try {
                const formData = new FormData(e.target);
                const debtType = formData.get('type');
                const amount = parseFloat(formData.get('amount'));
                const interest = formData.get('interest') ? parseFloat(formData.get('interest')) : null;
                
                const debtData = {
                    type: debtType,
                    [debtType === 'lent' ? 'borrowerName' : 'lenderName']: formData.get('personName'),
                    phone: formData.get('phone') || '',
                    amount: amount,
                    paidAmount: 0,
                    purpose: formData.get('purpose') || '',
                    dateLent: new Date(formData.get('dateLent')),
                    dueDate: new Date(formData.get('dueDate')),
                    interest: interest,
                    status: 'pending',
                    notes: formData.get('notes') || '',
                    reminderSchedule: formData.get('reminderSchedule') || 'none',
                    userId: currentUser.uid,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                };
                
                await addDoc(collection(db, 'debts'), debtData);
                
                showToast(`${debtType === 'lent' ? 'Lent' : 'Borrowed'} ${formatCurrency(amount, 'GHS')} recorded!`, 'success');
                window.FinanceApp.closeModal();
                await loadAllData();
            } catch (error) {
                console.error('Error saving debt:', error);
                showToast('Failed to save debt', 'error');
            } finally {
                setButtonLoading(submitBtn, false, '<i class="fas fa-save mr-1"></i> Save');
            }
        };
    },
    
    recordDebtPayment: async (debtId) => {
        const debt = debtsCache.find(d => d.id === debtId);
        if (!debt) return;
        
        const remaining = debt.amount - (debt.paidAmount || 0);
        
        const modalHtml = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.FinanceApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-money-bill mr-2" style="color: var(--deep-blue);"></i>Record Debt Payment
                            </h2>
                            <p class="text-xs md:text-sm text-muted mt-1">${debt.type === 'lent' ? 'Payment from' : 'Payment to'} ${escapeHtml(debt.borrowerName || debt.lenderName)}</p>
                        </div>
                        <button onclick="window.FinanceApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="debt-payment-form" class="p-5 space-y-4">
                        <div class="bg-primary p-3 rounded-lg" style="background: var(--bg-primary);">
                            <div class="flex justify-between text-sm">
                                <span style="color: var(--text-muted);">Total Amount:</span>
                                <span class="font-bold">${formatCurrency(debt.amount, 'GHS')}</span>
                            </div>
                            <div class="flex justify-between text-sm">
                                <span style="color: var(--text-muted);">Paid:</span>
                                <span class="font-bold text-emerald-500">${formatCurrency(debt.paidAmount || 0, 'GHS')}</span>
                            </div>
                            <div class="flex justify-between text-sm font-bold">
                                <span style="color: var(--text-muted);">Remaining:</span>
                                <span style="color: ${remaining > 0 ? '#ef4444' : '#10b981'};">${formatCurrency(remaining, 'GHS')}</span>
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Payment Amount</label>
                            <input type="number" name="paymentAmount" step="0.01" required max="${remaining}" placeholder="0.00" 
                                   class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            <p class="text-xs text-muted mt-1">Maximum: ${formatCurrency(remaining, 'GHS')}</p>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Payment Date</label>
                            <input type="date" name="paymentDate" value="${new Date().toISOString().split('T')[0]}" required
                                   class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Notes</label>
                            <input type="text" name="notes" placeholder="Payment reference or notes"
                                   class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button type="submit" id="record-debt-payment-btn" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02] text-sm" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-1"></i> Record Payment
                            </button>
                            <button type="button" onclick="window.FinanceApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700 text-sm" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.getElementById('modal-container').innerHTML = modalHtml;
        document.getElementById('modal-container').style.pointerEvents = 'auto';
        
        document.getElementById('debt-payment-form').onsubmit = async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('record-debt-payment-btn');
            setButtonLoading(submitBtn, true);
            
            try {
                const formData = new FormData(e.target);
                const paymentAmount = parseFloat(formData.get('paymentAmount'));
                
                if (paymentAmount > remaining) {
                    showToast('Payment amount cannot exceed remaining balance', 'error');
                    setButtonLoading(submitBtn, false, '<i class="fas fa-save mr-1"></i> Record Payment');
                    return;
                }
                
                const newPaid = (debt.paidAmount || 0) + paymentAmount;
                let newStatus = 'pending';
                if (newPaid >= debt.amount) {
                    newStatus = 'paid';
                } else if (newPaid > 0) {
                    newStatus = 'partially-paid';
                }
                
                await updateDoc(doc(db, 'debts', debtId), {
                    paidAmount: newPaid,
                    status: newStatus,
                    updatedAt: serverTimestamp()
                });
                
                // Record payment in payment history
                await addDoc(collection(db, 'debtPayments'), {
                    debtId: debtId,
                    amount: paymentAmount,
                    paymentDate: new Date(formData.get('paymentDate')),
                    notes: formData.get('notes') || '',
                    userId: currentUser.uid,
                    createdAt: serverTimestamp()
                });
                
                showToast(`Payment of ${formatCurrency(paymentAmount, 'GHS')} recorded!`, 'success');
                window.FinanceApp.closeModal();
                await loadAllData();
            } catch (error) {
                console.error('Error recording debt payment:', error);
                showToast('Failed to record payment', 'error');
            } finally {
                setButtonLoading(submitBtn, false, '<i class="fas fa-save mr-1"></i> Record Payment');
            }
        };
    },
    
    editDebt: async (debtId) => {
        const debt = debtsCache.find(d => d.id === debtId);
        if (!debt) return;
        
        const typeLabel = debt.type === 'lent' ? 'Money Lent' : 'Money Borrowed';
        const personLabel = debt.type === 'lent' ? "Borrower's Name" : "Lender's Name";
        const personValue = debt.borrowerName || debt.lenderName || '';
        
        const modalHtml = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.FinanceApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-edit mr-2"></i>Edit ${typeLabel}
                            </h2>
                        </div>
                        <button onclick="window.FinanceApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="edit-debt-form" class="p-5 space-y-4">
                        <input type="hidden" name="debtId" value="${debtId}">
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">${personLabel}</label>
                            <input type="text" name="personName" value="${escapeHtml(personValue)}" required 
                                   class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Phone Number</label>
                            <div class="relative">
                                <span class="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted">+233</span>
                                <input type="tel" name="phone" value="${escapeHtml(debt.phone || '')}" 
                                       class="w-full pl-16 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Amount</label>
                            <input type="number" name="amount" step="0.01" value="${debt.amount}" required 
                                   class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Amount Paid</label>
                            <input type="number" name="paidAmount" step="0.01" value="${debt.paidAmount || 0}" 
                                   class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Status</label>
                            <select name="status" class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <option value="pending" ${debt.status === 'pending' ? 'selected' : ''}>Pending</option>
                                <option value="partially-paid" ${debt.status === 'partially-paid' ? 'selected' : ''}>Partially Paid</option>
                                <option value="paid" ${debt.status === 'paid' ? 'selected' : ''}>Paid</option>
                                <option value="overdue" ${debt.status === 'overdue' ? 'selected' : ''}>Overdue</option>
                            </select>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Date ${debt.type === 'lent' ? 'Lent' : 'Borrowed'}</label>
                                <input type="date" name="dateLent" value="${debt.dateLent.toISOString().split('T')[0]}" required 
                                       class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Due Date</label>
                                <input type="date" name="dueDate" value="${debt.dueDate.toISOString().split('T')[0]}" required 
                                       class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Purpose</label>
                            <input type="text" name="purpose" value="${escapeHtml(debt.purpose || '')}" 
                                   class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Interest Rate (%)</label>
                            <input type="number" name="interest" step="0.1" value="${debt.interest || ''}" 
                                   class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Notes</label>
                            <textarea name="notes" rows="2" 
                                      class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">${escapeHtml(debt.notes || '')}</textarea>
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button type="submit" id="edit-debt-btn" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02] text-sm" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-1"></i> Update
                            </button>
                            <button type="button" onclick="window.FinanceApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700 text-sm" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.getElementById('modal-container').innerHTML = modalHtml;
        document.getElementById('modal-container').style.pointerEvents = 'auto';
        
        document.getElementById('edit-debt-form').onsubmit = async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('edit-debt-btn');
            setButtonLoading(submitBtn, true);
            
            try {
                const formData = new FormData(e.target);
                const amount = parseFloat(formData.get('amount'));
                const paidAmount = parseFloat(formData.get('paidAmount')) || 0;
                const status = formData.get('status');
                const interest = formData.get('interest') ? parseFloat(formData.get('interest')) : null;
                
                await updateDoc(doc(db, 'debts', debtId), {
                    [debt.type === 'lent' ? 'borrowerName' : 'lenderName']: formData.get('personName'),
                    phone: formData.get('phone') || '',
                    amount: amount,
                    paidAmount: paidAmount,
                    purpose: formData.get('purpose') || '',
                    dateLent: new Date(formData.get('dateLent')),
                    dueDate: new Date(formData.get('dueDate')),
                    interest: interest,
                    status: status,
                    notes: formData.get('notes') || '',
                    updatedAt: serverTimestamp()
                });
                
                showToast('Debt updated successfully!', 'success');
                window.FinanceApp.closeModal();
                await loadAllData();
            } catch (error) {
                console.error('Error updating debt:', error);
                showToast('Failed to update debt', 'error');
            } finally {
                setButtonLoading(submitBtn, false, '<i class="fas fa-save mr-1"></i> Update');
            }
        };
    },
    
    deleteDebt: async (debtId) => {
        if (!confirm('Delete this debt record?')) return;
        
        try {
            await deleteDoc(doc(db, 'debts', debtId));
            showToast('Debt deleted', 'success');
            await loadAllData();
        } catch (error) {
            console.error('Error deleting debt:', error);
            showToast('Failed to delete debt', 'error');
        }
    },
    
    // ============================================
    // SUBSCRIPTION FUNCTIONS
    // ============================================
    showAddSubscriptionModal: () => {
        const modalHtml = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.FinanceApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-repeat mr-2" style="color: #8b5cf6;"></i>Add Subscription
                            </h2>
                            <p class="text-xs md:text-sm text-muted mt-1">Track your recurring subscriptions</p>
                        </div>
                        <button onclick="window.FinanceApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="add-subscription-form" class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Subscription Name *</label>
                            <input type="text" name="name" required placeholder="e.g., Netflix, Spotify" 
                                   class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Category</label>
                            <input type="text" name="category" placeholder="e.g., Entertainment, Software" 
                                   class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Amount *</label>
                            <input type="number" name="amount" step="0.01" required placeholder="0.00" 
                                   class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Frequency</label>
                            <select name="frequency" class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <option value="monthly">Monthly</option>
                                <option value="yearly">Yearly</option>
                                <option value="quarterly">Quarterly</option>
                                <option value="weekly">Weekly</option>
                            </select>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Next Renewal Date *</label>
                            <input type="date" name="nextRenewal" value="${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}" required 
                                   class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Icon (optional)</label>
                            <select name="icon" class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <option value="fa-repeat">🔄 Default</option>
                                <option value="fa-film">🎬 Movies</option>
                                <option value="fa-music">🎵 Music</option>
                                <option value="fa-cloud">☁️ Cloud</option>
                                <option value="fa-server">💻 Hosting</option>
                                <option value="fa-brain">🧠 AI</option>
                                <option value="fa-fire">🔥 Firebase</option>
                                <option value="fa-file-pdf">📄 Adobe</option>
                                <option value="fa-globe">🌐 Domain</option>
                            </select>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Color</label>
                            <input type="color" name="color" value="#8b5cf6" 
                                   class="w-full h-10 rounded-lg border focus:ring-2 focus:ring-deep-blue cursor-pointer"
                                   style="background: var(--bg-primary); border-color: var(--border-color);">
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button type="submit" id="save-subscription-btn" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02] text-sm" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-1"></i> Add Subscription
                            </button>
                            <button type="button" onclick="window.FinanceApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700 text-sm" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.getElementById('modal-container').innerHTML = modalHtml;
        document.getElementById('modal-container').style.pointerEvents = 'auto';
        
        document.getElementById('add-subscription-form').onsubmit = async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('save-subscription-btn');
            setButtonLoading(submitBtn, true);
            
            try {
                const formData = new FormData(e.target);
                const subscriptionData = {
                    name: formData.get('name'),
                    category: formData.get('category') || '',
                    amount: parseFloat(formData.get('amount')),
                    frequency: formData.get('frequency') || 'monthly',
                    nextRenewal: new Date(formData.get('nextRenewal')),
                    icon: formData.get('icon') || 'fa-repeat',
                    color: formData.get('color') || '#8b5cf6',
                    userId: currentUser.uid,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                };
                
                await addDoc(collection(db, 'subscriptions'), subscriptionData);
                
                showToast('Subscription added successfully!', 'success');
                window.FinanceApp.closeModal();
                await loadAllData();
            } catch (error) {
                console.error('Error adding subscription:', error);
                showToast('Failed to add subscription', 'error');
            } finally {
                setButtonLoading(submitBtn, false, '<i class="fas fa-save mr-1"></i> Add Subscription');
            }
        };
    },
    
    editSubscription: async (subId) => {
        const sub = subscriptionsCache.find(s => s.id === subId);
        if (!sub) return;
        
        const modalHtml = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.FinanceApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-edit mr-2"></i>Edit Subscription
                            </h2>
                        </div>
                        <button onclick="window.FinanceApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="edit-subscription-form" class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Subscription Name</label>
                            <input type="text" name="name" value="${escapeHtml(sub.name)}" required 
                                   class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Category</label>
                            <input type="text" name="category" value="${escapeHtml(sub.category || '')}" 
                                   class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Amount</label>
                            <input type="number" name="amount" step="0.01" value="${sub.amount}" required 
                                   class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Frequency</label>
                            <select name="frequency" class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <option value="monthly" ${sub.frequency === 'monthly' ? 'selected' : ''}>Monthly</option>
                                <option value="yearly" ${sub.frequency === 'yearly' ? 'selected' : ''}>Yearly</option>
                                <option value="quarterly" ${sub.frequency === 'quarterly' ? 'selected' : ''}>Quarterly</option>
                                <option value="weekly" ${sub.frequency === 'weekly' ? 'selected' : ''}>Weekly</option>
                            </select>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Next Renewal Date</label>
                            <input type="date" name="nextRenewal" value="${sub.nextRenewal.toISOString().split('T')[0]}" required 
                                   class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue text-sm"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button type="submit" id="edit-subscription-btn" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02] text-sm" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-1"></i> Update
                            </button>
                            <button type="button" onclick="window.FinanceApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700 text-sm" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.getElementById('modal-container').innerHTML = modalHtml;
        document.getElementById('modal-container').style.pointerEvents = 'auto';
        
        document.getElementById('edit-subscription-form').onsubmit = async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('edit-subscription-btn');
            setButtonLoading(submitBtn, true);
            
            try {
                const formData = new FormData(e.target);
                await updateDoc(doc(db, 'subscriptions', subId), {
                    name: formData.get('name'),
                    category: formData.get('category') || '',
                    amount: parseFloat(formData.get('amount')),
                    frequency: formData.get('frequency'),
                    nextRenewal: new Date(formData.get('nextRenewal')),
                    updatedAt: serverTimestamp()
                });
                
                showToast('Subscription updated!', 'success');
                window.FinanceApp.closeModal();
                await loadAllData();
            } catch (error) {
                console.error('Error updating subscription:', error);
                showToast('Failed to update subscription', 'error');
            } finally {
                setButtonLoading(submitBtn, false, '<i class="fas fa-save mr-1"></i> Update');
            }
        };
    },
    
    deleteSubscription: async (subId) => {
        if (!confirm('Delete this subscription?')) return;
        
        try {
            await deleteDoc(doc(db, 'subscriptions', subId));
            showToast('Subscription deleted', 'success');
            await loadAllData();
        } catch (error) {
            console.error('Error deleting subscription:', error);
            showToast('Failed to delete subscription', 'error');
        }
    },
    
    // ============================================
    // BILL FUNCTIONS
    // ============================================
    markBillPaid: async (billId) => {
        try {
            const bill = recurringBillsCache.find(b => b.id === billId);
            if (!bill) return;
            
            // Update next due date based on frequency
            const nextDue = new Date(bill.nextDue);
            if (bill.frequency === 'monthly') {
                nextDue.setMonth(nextDue.getMonth() + 1);
            } else if (bill.frequency === 'yearly') {
                nextDue.setFullYear(nextDue.getFullYear() + 1);
            } else if (bill.frequency === 'quarterly') {
                nextDue.setMonth(nextDue.getMonth() + 3);
            } else if (bill.frequency === 'weekly') {
                nextDue.setDate(nextDue.getDate() + 7);
            }
            
            await updateDoc(doc(db, 'recurringBills', billId), {
                nextDue: nextDue,
                updatedAt: serverTimestamp(),
                lastPaid: serverTimestamp()
            });
            
            // Also record as a transaction
            await addDoc(collection(db, 'transactions'), {
                type: 'expense',
                category: 'bills',
                amount: bill.estimatedAmount || bill.amount || 0,
                description: `Bill payment: ${bill.name}`,
                notes: `Paid on ${new Date().toLocaleDateString()}`,
                date: new Date(),
                userId: currentUser.uid,
                createdAt: serverTimestamp()
            });
            
            showToast(`Bill "${bill.name}" marked as paid!`, 'success');
            await loadAllData();
        } catch (error) {
            console.error('Error marking bill as paid:', error);
            showToast('Failed to mark bill as paid', 'error');
        }
    },
    
    // ============================================
    // MONTHLY REVIEW FUNCTIONS
    // ============================================
    exportReviewPDF: async () => {
        const reviewContent = document.getElementById('monthly-review-container');
        if (!reviewContent) return;
        
        const printContent = `
            <div style="padding: 40px; font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; background: white;">
                ${reviewContent.innerHTML}
            </div>
        `;
        
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        printWindow.document.write(`
            <html>
                <head>
                    <title>Monthly Financial Review</title>
                    <style>
                        @page { margin: 20px; }
                        body { margin: 0; padding: 20px; background: white; font-family: Arial, sans-serif; }
                        .glass-card { background: #f8f9fa; border-radius: 8px; padding: 15px; margin-bottom: 10px; }
                    </style>
                </head>
                <body>${printContent}</body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
        showToast('Print window opened. Save as PDF using browser print dialog.', 'info');
    },
    
    shareReview: async () => {
        const reviewContent = document.getElementById('monthly-review-container');
        if (!reviewContent) return;
        
        const text = reviewContent.textContent;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Monthly Financial Review',
                    text: text,
                });
                showToast('Review shared!', 'success');
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Error sharing:', error);
                    showToast('Failed to share', 'error');
                }
            }
        } else {
            // Fallback: copy to clipboard
            try {
                await navigator.clipboard.writeText(text);
                showToast('Review copied to clipboard!', 'success');
            } catch (error) {
                console.error('Error copying:', error);
                showToast('Failed to copy', 'error');
            }
        }
    },
    
    // ============================================
    // APPROVAL FUNCTIONS
    // ============================================
    approvePayment: async function(paymentId, invoiceId) {
        try {
            const paymentRef = doc(db, 'paymentHistory', paymentId);
            const paymentSnap = await getDoc(paymentRef);
            
            if (!paymentSnap.exists()) {
                showToast('Payment not found', 'error');
                return;
            }
            
            const payment = paymentSnap.data();
            const paymentAmount = payment.amount || 0;
            
            await updateDoc(paymentRef, {
                status: 'approved',
                approvedAt: serverTimestamp(),
                approvedBy: currentUser.uid
            });
            
            const invoiceRef = doc(db, 'invoices', invoiceId);
            const invoiceSnap = await getDoc(invoiceRef);
            
            if (invoiceSnap.exists()) {
                const invoice = invoiceSnap.data();
                const newAmountPaid = (invoice.amountPaid || 0) + paymentAmount;
                const newStatus = newAmountPaid >= (invoice.total || 0) ? 'paid' : 'partially-paid';
                
                await updateDoc(invoiceRef, {
                    amountPaid: newAmountPaid,
                    balanceDue: (invoice.total || 0) - newAmountPaid,
                    status: newStatus,
                    updatedAt: serverTimestamp()
                });
                
                const clientName = payment.clientName || invoice.clientName || 'Client';
                const invoiceNumber = invoice.invoiceNumber || 'N/A';
                
                await addDoc(collection(db, 'transactions'), {
                    type: 'income',
                    category: 'payment_received',
                    amount: paymentAmount,
                    description: `Payment received for Invoice ${invoiceNumber} - ${clientName}`,
                    date: new Date(),
                    notes: `Payment approved by ${currentUser.displayName || currentUser.email || 'Admin'}. Invoice: ${invoiceNumber}. Client: ${clientName}`,
                    userId: currentUser.uid,
                    invoiceId: invoiceId,
                    invoiceNumber: invoiceNumber,
                    paymentId: paymentId,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
                
                showToast(`Payment of ${formatCurrency(paymentAmount, 'GHS')} approved and added to income!`, 'success');
                
                await addDoc(collection(db, 'invoiceTimeline'), {
                    invoiceNumber: invoiceNumber,
                    action: 'payment_approved_and_income_created',
                    description: `Payment of ${formatCurrency(paymentAmount, 'GHS')} approved. Income transaction created. Invoice status: ${newStatus}`,
                    userId: currentUser.uid,
                    timestamp: serverTimestamp()
                });
            }
            
            showToast('Payment approved successfully!', 'success');
            window.FinanceApp.closeModal();
            await loadAllData();
            
        } catch (error) {
            console.error('Error approving payment:', error);
            showToast('Failed to approve payment', 'error');
        }
    },
    
    rejectPayment: async function(paymentId) {
        if (!confirm('Reject this payment request?')) return;
        
        try {
            const paymentRef = doc(db, 'paymentHistory', paymentId);
            await updateDoc(paymentRef, {
                status: 'rejected',
                rejectedAt: serverTimestamp(),
                rejectedBy: currentUser.uid
            });
            
            showToast('Payment rejected', 'warning');
            window.FinanceApp.closeModal();
            await loadAllData();
            
        } catch (error) {
            console.error('Error rejecting payment:', error);
            showToast('Failed to reject payment', 'error');
        }
    },
    
    closeModal: () => { 
        const c = document.getElementById('modal-container'); 
        if (c) { 
            c.innerHTML = ''; 
            c.style.pointerEvents = 'none'; 
        } 
    }
};

// Helper function for loading buttons
function setButtonLoading(button, isLoading, originalText = null) {
    if (!button) return;
    
    if (isLoading) {
        button.disabled = true;
        button.dataset.originalText = originalText || button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Loading...';
    } else {
        button.disabled = false;
        button.innerHTML = button.dataset.originalText || originalText || button.innerHTML;
    }
}

function getStatusColor(status) {
    const colors = {
        draft: '#6b7280',
        sent: '#3b82f6',
        pending: '#f59e0b',
        'partially-paid': '#8b5cf6',
        paid: '#10b981',
        overdue: '#ef4444',
        cancelled: '#6b7280',
        refunded: '#ec4899'
    };
    return colors[status] || '#6b7280';
}

function generateAccessToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
}

// Get client by phone number
async function getClientByPhone(phone) {
    try {
        if (!currentUser) return null;
        const q = query(collection(db, 'clients'), 
            where('phone', '==', phone),
            where('userId', '==', currentUser.uid)
        );
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const doc = querySnapshot.docs[0];
            return { id: doc.id, ...doc.data() };
        }
        return null;
    } catch (error) {
        console.error('Error getting client:', error);
        return null;
    }
}

// Get or create client token
async function getOrCreateClientToken(phone, email, name) {
    try {
        if (!currentUser) throw new Error('No current user');
        
        let client = await getClientByPhone(phone);
        
        if (client) {
            if (email && !client.email) {
                await updateDoc(doc(db, 'clients', client.id), {
                    email: email,
                    updatedAt: serverTimestamp()
                });
            }
            if (client.accessToken) return client.accessToken;
        } else {
            const token = generateAccessToken();
            const clientData = {
                phone: phone,
                email: email || '',
                name: name || 'Client',
                accessToken: token,
                status: 'active',
                userId: currentUser.uid,
                createdAt: serverTimestamp(),
                lastLogin: serverTimestamp()
            };
            const docRef = await addDoc(collection(db, 'clients'), clientData);
            client = { id: docRef.id, ...clientData };
            return token;
        }
        
        const token = generateAccessToken();
        await updateDoc(doc(db, 'clients', client.id), {
            accessToken: token,
            userId: currentUser.uid,
            updatedAt: serverTimestamp()
        });
        return token;
        
    } catch (error) {
        console.error('Error getting client token:', error);
        throw error;
    }
}

// Export for module
export async function loadFinanceData() {
    await loadAllData();
}

// Make share functions globally available
window.shareInvoice = window.shareInvoice || function(invoiceId) {};
window.copyShareLink = window.copyShareLink || function() {};
window.loadFinanceData = loadFinanceData;