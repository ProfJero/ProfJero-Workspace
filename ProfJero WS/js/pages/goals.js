// js/pages/goals.js
import { db, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, serverTimestamp } from '../firebase-config.js';
import { showToast, escapeHtml, formatDate, timeAgo, formatCurrency } from '../utils/helpers.js';

let currentUser = null;
let goalsCache = [];
let milestonesCache = [];
let goalNotesCache = [];
let goalAnalyticsCache = [];
let projectsCache = [];
let transactionsCache = [];
let tasksCache = [];
let currentView = 'grid';

// Category configuration with Font Awesome icons
const goalCategories = {
    personal: { icon: 'fa-user', color: '#8b5cf6', label: 'Personal' },
    professional: { icon: 'fa-briefcase', color: '#3b82f6', label: 'Professional' },
    health: { icon: 'fa-heartbeat', color: '#ec4899', label: 'Health' },
    financial: { icon: 'fa-coins', color: '#10b981', label: 'Financial' },
    learning: { icon: 'fa-graduation-cap', color: '#f59e0b', label: 'Learning' },
    fitness: { icon: 'fa-dumbbell', color: '#ef4444', label: 'Fitness' },
    community: { icon: 'fa-hand-holding-heart', color: '#6366f1', label: 'Community Impact' },
    spiritual: { icon: 'fa-pray', color: '#8b5cf6', label: 'Spiritual' },
    savings: { icon: 'fa-piggy-bank', color: '#06b6d4', label: 'Savings Goal' }
};

// Motivational Quotes
const motivationalQuotes = [
    { quote: "The secret of getting ahead is getting started.", author: "Mark Twain" },
    { quote: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
    { quote: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
    { quote: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
    { quote: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
    { quote: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
    { quote: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" }
];

// Smart Goal Advisor - Recommendations based on goal status
const goalAdvisorTips = {
    'not-started': [
        { tip: "Break your goal into smaller, actionable steps to get started.", priority: 'high' },
        { tip: "Set a specific start date and commit to taking the first action today.", priority: 'high' },
        { tip: "Share your goal with someone who can hold you accountable.", priority: 'medium' },
        { tip: "Create a vision board or write down why this goal matters to you.", priority: 'low' }
    ],
    'in-progress': [
        { tip: "You're making progress! Review your milestones and celebrate small wins.", priority: 'high' },
        { tip: "Consider increasing your daily effort by 10% to accelerate progress.", priority: 'medium' },
        { tip: "Track your progress weekly to stay motivated and adjust your strategy.", priority: 'high' },
        { tip: "Connect with others working on similar goals for support and ideas.", priority: 'low' }
    ],
    'on-hold': [
        { tip: "Re-evaluate your priorities and schedule dedicated time for this goal.", priority: 'high' },
        { tip: "Break down the next step into something you can do in 5 minutes.", priority: 'high' },
        { tip: "Identify what's blocking you and find a way around it.", priority: 'medium' },
        { tip: "Set a specific date to resume work on this goal.", priority: 'medium' }
    ],
    'overdue': [
        { tip: "Reassess your timeline and adjust your deadline to be realistic.", priority: 'high' },
        { tip: "Focus on the most critical tasks first to make immediate progress.", priority: 'high' },
        { tip: "Consider reducing the scope of your goal to make it achievable.", priority: 'medium' },
        { tip: "Seek help or delegate tasks to speed up progress.", priority: 'low' }
    ]
};

export async function renderGoalsPage(user) {
    currentUser = user;
    
    return `
        <div class="space-y-6 animate-fade-in-up">
            <!-- Header -->
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 class="text-3xl font-bold" style="color: var(--text-primary);">🎯 Goals & Objectives</h1>
                    <p class="text-muted mt-1">Set, track, and achieve your goals with smart insights</p>
                </div>
                <div class="flex gap-3 flex-wrap">
                    <button id="add-goal-btn" class="px-5 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                        <i class="fas fa-plus"></i>
                        <span>New Goal</span>
                    </button>
                    <button id="add-savings-goal-btn" class="px-5 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all hover:shadow-md" style="background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary);">
                        <i class="fas fa-piggy-bank"></i>
                        <span>Savings Goal</span>
                    </button>
                    <button id="add-learning-goal-btn" class="px-5 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all hover:shadow-md" style="background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary);">
                        <i class="fas fa-graduation-cap"></i>
                        <span>Learning Goal</span>
                    </button>
                    <button id="add-milestone-btn" class="px-5 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all hover:shadow-md" style="background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary);">
                        <i class="fas fa-flag-checkered"></i>
                        <span>Add Milestone</span>
                    </button>
                </div>
            </div>
            
            <!-- Motivational Quote -->
            <div class="glass-card rounded-xl p-4 text-center" id="quote-container">
                <div class="flex items-center justify-center gap-3">
                    <i class="fas fa-quote-left text-2xl" style="color: var(--deep-blue);"></i>
                    <div>
                        <p class="text-lg font-medium italic" style="color: var(--text-primary);" id="quote-text">Loading inspiration...</p>
                        <p class="text-sm text-muted mt-1" id="quote-author">— Unknown</p>
                    </div>
                    <i class="fas fa-quote-right text-2xl" style="color: var(--deep-blue);"></i>
                </div>
            </div>
            
            <!-- Stats Dashboard -->
            <div class="grid grid-cols-2 md:grid-cols-7 gap-3">
                <div class="glass-card p-3 rounded-xl text-center cursor-pointer hover:shadow-lg transition-all" data-filter="all">
                    <div class="text-xl font-bold" id="stat-total" style="color: var(--deep-blue);">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-flag"></i> Total</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center cursor-pointer hover:shadow-lg transition-all" data-filter="in-progress">
                    <div class="text-xl font-bold" id="stat-progress" style="color: var(--gold);">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-spinner"></i> In Progress</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center cursor-pointer hover:shadow-lg transition-all" data-filter="completed">
                    <div class="text-xl font-bold" id="stat-completed" style="color: var(--emerald);">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-check-circle"></i> Completed</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center cursor-pointer hover:shadow-lg transition-all" data-filter="on-hold">
                    <div class="text-xl font-bold" id="stat-hold" style="color: #f59e0b;">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-pause"></i> On Hold</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center cursor-pointer hover:shadow-lg transition-all" data-filter="not-started">
                    <div class="text-xl font-bold" id="stat-notstarted" style="color: #8b5cf6;">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-hourglass-start"></i> Not Started</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center cursor-pointer hover:shadow-lg transition-all" data-filter="overdue">
                    <div class="text-xl font-bold" id="stat-overdue" style="color: #ef4444;">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-exclamation-triangle"></i> Overdue</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center cursor-pointer hover:shadow-lg transition-all" data-filter="savings">
                    <div class="text-xl font-bold" id="stat-savings" style="color: #06b6d4;">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-piggy-bank"></i> Savings</div>
                </div>
            </div>
            
            <!-- Smart Alerts & Advisor -->
            <div id="smart-alerts-container" class="space-y-2"></div>
            
            <!-- Filters & Search -->
            <div class="glass-card rounded-xl p-4">
                <div class="flex flex-col md:flex-row gap-3">
                    <div class="flex-1 relative">
                        <i class="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-muted"></i>
                        <input type="text" id="goal-search" placeholder="Search goals..." 
                               class="w-full pl-10 pr-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all" 
                               style="background: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);">
                    </div>
                    
                    <select id="goal-filter-status" class="px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all" style="background: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);">
                        <option value="all">All Status</option>
                        <option value="not-started">Not Started</option>
                        <option value="in-progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="on-hold">On Hold</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                    
                    <select id="goal-filter-category" class="px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all" style="background: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);">
                        <option value="all">All Categories</option>
                        ${Object.entries(goalCategories).map(([key, cat]) => 
                            `<option value="${key}"><i class="fas ${cat.icon}"></i> ${cat.label}</option>`
                        ).join('')}
                    </select>
                    
                    <select id="goal-filter-priority" class="px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all" style="background: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);">
                        <option value="all">All Priority</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                    </select>
                    
                    <button id="clear-filters" class="px-4 py-2 rounded-lg transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="color: var(--text-muted);">
                        <i class="fas fa-times"></i> Clear
                    </button>
                </div>
            </div>
            
            <!-- View Tabs -->
            <div class="flex flex-wrap gap-2 border-b border-custom pb-2">
                <button class="view-tab px-4 py-2 rounded-lg transition-all active" data-view="grid" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                    <i class="fas fa-th-large mr-1"></i> Grid
                </button>
                <button class="view-tab px-4 py-2 rounded-lg transition-all" data-view="list" style="background: var(--bg-secondary); color: var(--text-muted);">
                    <i class="fas fa-list mr-1"></i> List
                </button>
                <button class="view-tab px-4 py-2 rounded-lg transition-all" data-view="timeline" style="background: var(--bg-secondary); color: var(--text-muted);">
                    <i class="fas fa-clock mr-1"></i> Timeline
                </button>
                <button class="view-tab px-4 py-2 rounded-lg transition-all" data-view="analytics" style="background: var(--bg-secondary); color: var(--text-muted);">
                    <i class="fas fa-chart-pie mr-1"></i> Analytics
                </button>
                <button class="view-tab px-4 py-2 rounded-lg transition-all" data-view="advisor" style="background: var(--bg-secondary); color: var(--text-muted);">
                    <i class="fas fa-lightbulb mr-1"></i> Advisor
                </button>
            </div>
            
            <!-- Goals Container -->
            <div id="goals-container" class="space-y-4">
                <div class="text-center py-12">
                    <div class="animate-pulse"><i class="fas fa-spinner fa-spin mr-2 text-muted"></i> Loading goals...</div>
                </div>
            </div>
        </div>
    `;
}

export async function loadGoalsData() {
    if (!currentUser) return;
    await Promise.all([
        loadGoals(),
        loadMilestones(),
        loadGoalNotes(),
        loadGoalAnalytics(),
        loadProjects(),
        loadTransactions(),
        loadTasks()
    ]);
    
    setupEventListeners();
    filterAndRenderGoals();
    updateStats();
    updateQuote();
    checkSmartAlerts();
    checkGoalAdvisor();
}

async function loadGoals() {
    try {
        const q = query(
            collection(db, 'goals'),
            where('userId', '==', currentUser.uid),
            orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        goalsCache = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                startDate: data.startDate?.toDate?.() || new Date(data.startDate),
                endDate: data.endDate?.toDate?.() || new Date(data.endDate),
                createdAt: data.createdAt?.toDate?.() || new Date(),
                updatedAt: data.updatedAt?.toDate?.() || new Date(),
                lastUpdated: data.lastUpdated?.toDate?.() || new Date(data.createdAt)
            };
        });
    } catch (error) {
        console.error('Error loading goals:', error);
        if (error.code === 'permission-denied') {
            showToast('Please set up goals collection in Firebase', 'info');
        }
    }
}

async function loadMilestones() {
    try {
        const q = query(
            collection(db, 'milestones'),
            where('userId', '==', currentUser.uid)
        );
        const querySnapshot = await getDocs(q);
        milestonesCache = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                dueDate: data.dueDate?.toDate?.() || new Date(data.dueDate),
                completedAt: data.completedAt?.toDate?.() || null,
                createdAt: data.createdAt?.toDate?.() || new Date()
            };
        });
    } catch (error) {
        console.error('Error loading milestones:', error);
    }
}

async function loadGoalNotes() {
    try {
        const q = query(
            collection(db, 'goalNotes'),
            where('userId', '==', currentUser.uid),
            orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        goalNotesCache = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate?.() || new Date()
            };
        });
    } catch (error) {
        console.error('Error loading goal notes:', error);
    }
}

async function loadGoalAnalytics() {
    try {
        const q = query(
            collection(db, 'goalAnalytics'),
            where('userId', '==', currentUser.uid)
        );
        const querySnapshot = await getDocs(q);
        goalAnalyticsCache = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                date: data.date?.toDate?.() || new Date(data.date)
            };
        });
    } catch (error) {
        console.error('Error loading goal analytics:', error);
        goalAnalyticsCache = [];
    }
}

async function loadProjects() {
    try {
        const q = query(collection(db, 'projects'), where('userId', '==', currentUser.uid));
        const querySnapshot = await getDocs(q);
        projectsCache = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('Error loading projects:', error);
    }
}

async function loadTransactions() {
    try {
        const q = query(collection(db, 'transactions'), where('userId', '==', currentUser.uid));
        const querySnapshot = await getDocs(q);
        transactionsCache = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                date: data.date?.toDate?.() || new Date(data.date)
            };
        });
    } catch (error) {
        console.error('Error loading transactions:', error);
    }
}

async function loadTasks() {
    try {
        const q = query(collection(db, 'tasks'), where('userId', '==', currentUser.uid));
        const querySnapshot = await getDocs(q);
        tasksCache = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                dueDate: data.dueDate?.toDate?.() || new Date(data.dueDate),
                createdAt: data.createdAt?.toDate?.() || new Date()
            };
        });
    } catch (error) {
        console.error('Error loading tasks:', error);
    }
}

function updateStats() {
    const total = goalsCache.length;
    const inProgress = goalsCache.filter(g => g.status === 'in-progress').length;
    const completed = goalsCache.filter(g => g.status === 'completed').length;
    const onHold = goalsCache.filter(g => g.status === 'on-hold').length;
    const notStarted = goalsCache.filter(g => g.status === 'not-started').length;
    const savingsGoals = goalsCache.filter(g => g.category === 'savings').length;
    const overdue = goalsCache.filter(g => {
        if (g.status === 'completed' || g.status === 'cancelled') return false;
        if (!g.endDate) return false;
        return g.endDate < new Date();
    }).length;
    
    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-progress').textContent = inProgress;
    document.getElementById('stat-completed').textContent = completed;
    document.getElementById('stat-hold').textContent = onHold;
    document.getElementById('stat-notstarted').textContent = notStarted;
    document.getElementById('stat-overdue').textContent = overdue;
    document.getElementById('stat-savings').textContent = savingsGoals;
}

function updateQuote() {
    const randomQuote = motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];
    const quoteText = document.getElementById('quote-text');
    const quoteAuthor = document.getElementById('quote-author');
    if (quoteText) quoteText.textContent = randomQuote.quote;
    if (quoteAuthor) quoteAuthor.textContent = `— ${randomQuote.author}`;
}

// Smart Alerts System
function checkSmartAlerts() {
    const container = document.getElementById('smart-alerts-container');
    if (!container) return;
    
    const alerts = [];
    const now = new Date();
    
    goalsCache.forEach(goal => {
        if (goal.status === 'completed' || goal.status === 'cancelled') return;
        
        const lastUpdate = goal.lastUpdated || goal.createdAt;
        const daysSinceUpdate = Math.floor((now - lastUpdate) / (1000 * 60 * 60 * 24));
        
        if (daysSinceUpdate > 10 && goal.status === 'in-progress') {
            alerts.push({
                type: 'warning',
                icon: 'fa-clock',
                message: `"${goal.title}" hasn't been updated in ${daysSinceUpdate} days. Time to review your progress!`,
                goalId: goal.id,
                priority: 'high'
            });
        }
        
        if (goal.endDate && goal.status === 'in-progress') {
            const totalDuration = goal.endDate - goal.startDate;
            const elapsed = now - goal.startDate;
            const expectedProgress = totalDuration > 0 ? Math.min((elapsed / totalDuration) * 100, 100) : 0;
            const actualProgress = goal.progress || 0;
            
            if (actualProgress < expectedProgress - 20) {
                alerts.push({
                    type: 'danger',
                    icon: 'fa-exclamation-triangle',
                    message: `"${goal.title}" is falling behind schedule. You're at ${actualProgress}% but should be at ${Math.round(expectedProgress)}%`,
                    goalId: goal.id,
                    priority: 'high'
                });
            }
        }
        
        if (goal.endDate) {
            const daysUntilDeadline = Math.ceil((goal.endDate - now) / (1000 * 60 * 60 * 24));
            if (daysUntilDeadline <= 3 && daysUntilDeadline > 0 && goal.status !== 'completed') {
                alerts.push({
                    type: 'info',
                    icon: 'fa-hourglass-end',
                    message: `"${goal.title}" is due in ${daysUntilDeadline} days! Focus on completing it.`,
                    goalId: goal.id,
                    priority: 'high'
                });
            }
        }
    });
    
    if (alerts.length === 0) {
        container.innerHTML = `
            <div class="glass-card rounded-xl p-3 text-center" style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2);">
                <p class="text-sm" style="color: var(--emerald);"><i class="fas fa-check-circle mr-2"></i>All goals are on track! Keep up the great work! 🎉</p>
            </div>
        `;
        return;
    }
    
    const topAlerts = alerts.slice(0, 3);
    container.innerHTML = topAlerts.map(alert => {
        const colors = {
            danger: { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.2)', text: '#ef4444' },
            warning: { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.2)', text: '#f59e0b' },
            info: { bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.2)', text: '#3b82f6' }
        };
        const color = colors[alert.type] || colors.info;
        
        return `
            <div class="glass-card rounded-xl p-3 flex items-center justify-between cursor-pointer hover:shadow-md transition-all" 
                 style="background: ${color.bg}; border: 1px solid ${color.border};" 
                 onclick="window.GoalsApp.viewGoal('${alert.goalId}')">
                <div class="flex items-center gap-3">
                    <i class="fas ${alert.icon}" style="color: ${color.text};"></i>
                    <p class="text-sm" style="color: var(--text-primary);">${alert.message}</p>
                </div>
                <button onclick="event.stopPropagation(); window.GoalsApp.dismissAlert('${alert.goalId}')" class="text-muted hover:text-primary">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    }).join('');
}

// Goal Advisor System
function checkGoalAdvisor() {
    const advisorTips = [];
    const now = new Date();
    
    goalsCache.forEach(goal => {
        if (goal.status === 'completed' || goal.status === 'cancelled') return;
        
        let statusKey = goal.status;
        if (goal.endDate && goal.endDate < now && goal.status !== 'completed') {
            statusKey = 'overdue';
        }
        
        const tips = goalAdvisorTips[statusKey] || goalAdvisorTips['not-started'];
        const randomTip = tips[Math.floor(Math.random() * tips.length)];
        
        if (randomTip) {
            advisorTips.push({
                goalId: goal.id,
                title: goal.title,
                tip: randomTip.tip,
                priority: randomTip.priority,
                status: statusKey
            });
        }
    });
    
    window._advisorTips = advisorTips;
}

function renderAdvisorView() {
    const tips = window._advisorTips || [];
    
    if (tips.length === 0) {
        return `
            <div class="glass-card rounded-xl p-12 text-center">
                <i class="fas fa-lightbulb text-6xl mb-4 text-muted"></i>
                <h3 class="text-xl font-semibold mb-2" style="color: var(--text-primary);">No advice needed!</h3>
                <p class="text-muted">All your goals are on track. Keep up the great work!</p>
            </div>
        `;
    }
    
    const highPriority = tips.filter(t => t.priority === 'high');
    const mediumPriority = tips.filter(t => t.priority === 'medium');
    const lowPriority = tips.filter(t => t.priority === 'low');
    
    return `
        <div class="space-y-4">
            <div class="glass-card rounded-xl p-4">
                <h3 class="font-semibold mb-3" style="color: var(--text-primary);">
                    <i class="fas fa-lightbulb mr-2" style="color: var(--gold);"></i>Smart Goal Advisor
                </h3>
                <p class="text-sm text-muted mb-4">Personalized recommendations to help you achieve your goals faster</p>
                
                ${highPriority.length > 0 ? `
                    <div class="mb-4">
                        <h4 class="text-sm font-semibold mb-2" style="color: #ef4444;"><i class="fas fa-arrow-up mr-1"></i>Priority Actions</h4>
                        ${highPriority.map(t => `
                            <div class="p-3 rounded-lg mb-2 cursor-pointer hover:shadow-md transition-all" style="background: rgba(239, 68, 68, 0.05); border-left: 3px solid #ef4444;" onclick="window.GoalsApp.viewGoal('${t.goalId}')">
                                <div class="flex items-start gap-2">
                                    <i class="fas fa-bullseye text-xs mt-1" style="color: #ef4444;"></i>
                                    <div>
                                        <div class="text-sm font-medium" style="color: var(--text-primary);">${escapeHtml(t.title)}</div>
                                        <div class="text-sm" style="color: var(--text-secondary);">${t.tip}</div>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                
                ${mediumPriority.length > 0 ? `
                    <div class="mb-4">
                        <h4 class="text-sm font-semibold mb-2" style="color: #f59e0b;"><i class="fas fa-minus mr-1"></i>Recommended Actions</h4>
                        ${mediumPriority.map(t => `
                            <div class="p-3 rounded-lg mb-2 cursor-pointer hover:shadow-md transition-all" style="background: rgba(245, 158, 11, 0.05); border-left: 3px solid #f59e0b;" onclick="window.GoalsApp.viewGoal('${t.goalId}')">
                                <div class="flex items-start gap-2">
                                    <i class="fas fa-bullseye text-xs mt-1" style="color: #f59e0b;"></i>
                                    <div>
                                        <div class="text-sm font-medium" style="color: var(--text-primary);">${escapeHtml(t.title)}</div>
                                        <div class="text-sm" style="color: var(--text-secondary);">${t.tip}</div>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                
                ${lowPriority.length > 0 ? `
                    <div>
                        <h4 class="text-sm font-semibold mb-2" style="color: #10b981;"><i class="fas fa-arrow-down mr-1"></i>Optional Suggestions</h4>
                        ${lowPriority.map(t => `
                            <div class="p-3 rounded-lg mb-2 cursor-pointer hover:shadow-md transition-all" style="background: rgba(16, 185, 129, 0.05); border-left: 3px solid #10b981;" onclick="window.GoalsApp.viewGoal('${t.goalId}')">
                                <div class="flex items-start gap-2">
                                    <i class="fas fa-bullseye text-xs mt-1" style="color: #10b981;"></i>
                                    <div>
                                        <div class="text-sm font-medium" style="color: var(--text-primary);">${escapeHtml(t.title)}</div>
                                        <div class="text-sm" style="color: var(--text-secondary);">${t.tip}</div>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

function filterAndRenderGoals() {
    let filtered = [...goalsCache];
    
    const searchInput = document.getElementById('goal-search');
    if (searchInput && searchInput.value) {
        const query = searchInput.value.toLowerCase();
        filtered = filtered.filter(g => 
            g.title?.toLowerCase().includes(query) || 
            g.description?.toLowerCase().includes(query)
        );
    }
    
    const statusFilter = document.getElementById('goal-filter-status');
    if (statusFilter && statusFilter.value !== 'all') {
        filtered = filtered.filter(g => g.status === statusFilter.value);
    }
    
    const categoryFilter = document.getElementById('goal-filter-category');
    if (categoryFilter && categoryFilter.value !== 'all') {
        filtered = filtered.filter(g => g.category === categoryFilter.value);
    }
    
    const priorityFilter = document.getElementById('goal-filter-priority');
    if (priorityFilter && priorityFilter.value !== 'all') {
        filtered = filtered.filter(g => g.priority === priorityFilter.value);
    }
    
    filtered.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        const priorityDiff = (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1);
        if (priorityDiff !== 0) return priorityDiff;
        if (a.endDate && b.endDate) return a.endDate - b.endDate;
        return 0;
    });
    
    renderGoals(filtered);
}

function renderGoals(goals) {
    const container = document.getElementById('goals-container');
    if (!container) return;
    
    const view = document.querySelector('.view-tab.active')?.dataset.view || 'grid';
    
    if (view === 'advisor') {
        container.className = 'space-y-6';
        container.innerHTML = renderAdvisorView();
        return;
    }
    
    if (goals.length === 0) {
        container.innerHTML = `
            <div class="glass-card rounded-xl p-12 text-center">
                <i class="fas fa-bullseye text-6xl mb-4 text-muted"></i>
                <h3 class="text-xl font-semibold mb-2" style="color: var(--text-primary);">No goals yet</h3>
                <p class="text-muted">Start by creating your first goal!</p>
                <button id="empty-state-add-btn" class="mt-4 px-5 py-2 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                    <i class="fas fa-plus mr-1"></i> Create Goal
                </button>
            </div>
        `;
        const emptyBtn = document.getElementById('empty-state-add-btn');
        if (emptyBtn) emptyBtn.onclick = () => window.GoalsApp.showAddGoalModal();
        return;
    }
    
    if (view === 'grid') {
        container.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';
        container.innerHTML = goals.map(goal => createGoalCard(goal)).join('');
    } else if (view === 'list') {
        container.className = 'space-y-3';
        container.innerHTML = goals.map(goal => createGoalListItem(goal)).join('');
    } else if (view === 'timeline') {
        container.className = 'space-y-4';
        container.innerHTML = goals.map(goal => createGoalTimeline(goal)).join('');
    } else if (view === 'analytics') {
        container.className = 'space-y-6';
        container.innerHTML = renderAnalytics(goals);
        // Initialize charts after rendering
        setTimeout(() => {
            initAnalyticsCharts();
        }, 100);
    }
}

function createGoalCard(goal) {
    const category = goalCategories[goal.category] || goalCategories.personal;
    const statusConfig = {
        'not-started': { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', label: 'Not Started', icon: 'fa-hourglass-start' },
        'in-progress': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', label: 'In Progress', icon: 'fa-spinner' },
        'completed': { color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', label: 'Completed', icon: 'fa-check-circle' },
        'on-hold': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', label: 'On Hold', icon: 'fa-pause' },
        'cancelled': { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', label: 'Cancelled', icon: 'fa-ban' }
    };
    
    const priorityConfig = {
        high: { color: '#ef4444', label: 'High', icon: 'fa-arrow-up' },
        medium: { color: '#f59e0b', label: 'Medium', icon: 'fa-minus' },
        low: { color: '#10b981', label: 'Low', icon: 'fa-arrow-down' }
    };
    
    const progress = goal.progress || 0;
    const status = goal.status || 'not-started';
    const config = statusConfig[status];
    const priority = priorityConfig[goal.priority] || priorityConfig.medium;
    const isOverdue = goal.endDate && goal.endDate < new Date() && status !== 'completed' && status !== 'cancelled';
    
    let daysRemaining = null;
    let countdownText = '';
    if (goal.endDate) {
        const now = new Date();
        const diffTime = goal.endDate - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 0) {
            daysRemaining = diffDays;
            countdownText = `${diffDays} days remaining`;
        } else if (diffDays === 0) {
            countdownText = 'Today is the deadline!';
        } else if (status !== 'completed') {
            countdownText = '⏰ Overdue';
        }
    }
    
    const lastUpdate = goal.lastUpdated || goal.createdAt;
    const daysSinceUpdate = Math.floor((new Date() - lastUpdate) / (1000 * 60 * 60 * 24));
    let inactivityWarning = '';
    if (daysSinceUpdate > 10 && status === 'in-progress') {
        inactivityWarning = `<span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b;"><i class="fas fa-clock mr-1"></i>${daysSinceUpdate} days inactive</span>`;
    }
    
    const goalMilestones = milestonesCache.filter(m => m.goalId === goal.id);
    const completedMilestones = goalMilestones.filter(m => m.completed);
    const milestoneProgress = goalMilestones.length > 0 ? Math.round((completedMilestones.length / goalMilestones.length) * 100) : 0;
    const totalProgress = Math.max(progress, milestoneProgress);
    const project = goal.projectId ? projectsCache.find(p => p.id === goal.projectId) : null;
    const goalNotes = goalNotesCache.filter(n => n.goalId === goal.id);
    const recentNotes = goalNotes.slice(0, 2);
    
    let savingsData = null;
    if (goal.category === 'savings' && goal.targetAmount) {
        const savedAmount = goal.currentAmount || 0;
        const targetAmount = goal.targetAmount;
        const remaining = Math.max(0, targetAmount - savedAmount);
        const savingsProgress = targetAmount > 0 ? Math.min(Math.round((savedAmount / targetAmount) * 100), 100) : 0;
        
        savingsData = {
            savedAmount,
            targetAmount,
            remaining,
            savingsProgress,
            isComplete: savingsProgress >= 100
        };
    }
    
    return `
        <div class="glass-card rounded-xl p-4 transition-all hover:shadow-lg cursor-pointer" onclick="window.GoalsApp.viewGoal('${goal.id}')">
            <div class="flex justify-between items-start mb-2">
                <div class="flex items-center gap-2">
                    <i class="fas ${category.icon}" style="color: ${category.color};"></i>
                    <h3 class="font-semibold" style="color: var(--text-primary);">${escapeHtml(goal.title)}</h3>
                </div>
                <span class="text-xs px-2 py-0.5 rounded-full" style="background: ${config.bg}; color: ${config.color};">
                    <i class="fas ${config.icon} text-xs mr-1"></i>${config.label}
                </span>
            </div>
            
            ${goal.description ? `<p class="text-sm text-muted mb-2 line-clamp-2">${escapeHtml(goal.description)}</p>` : ''}
            
            <div class="flex flex-wrap gap-2 mb-2">
                <span class="text-xs px-2 py-0.5 rounded-full" style="background: ${category.color}20; color: ${category.color};">
                    <i class="fas ${category.icon}"></i> ${category.label}
                </span>
                <span class="text-xs px-2 py-0.5 rounded-full" style="background: ${priority.color}20; color: ${priority.color};">
                    <i class="fas ${priority.icon}"></i> ${priority.label}
                </span>
                ${project ? `<span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6;"><i class="fas fa-project-diagram"></i> ${escapeHtml(project.name)}</span>` : ''}
                ${isOverdue ? `<span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(239, 68, 68, 0.15); color: #ef4444;"><i class="fas fa-clock mr-1"></i>Overdue</span>` : ''}
                ${countdownText ? `<span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(16, 185, 129, 0.15); color: #10b981;"><i class="fas fa-hourglass-half mr-1"></i>${countdownText}</span>` : ''}
                ${inactivityWarning}
            </div>
            
            ${savingsData ? `
                <div class="mb-3 p-3 rounded-lg" style="background: rgba(6, 182, 212, 0.1);">
                    <div class="flex items-center justify-between mb-1">
                        <span style="color: var(--text-primary); font-weight: 600;"><i class="fas fa-piggy-bank mr-1"></i>Savings Goal</span>
                        ${savingsData.isComplete ? '<span style="color: var(--emerald); font-weight: 600;"><i class="fas fa-check-circle"></i> Complete!</span>' : ''}
                    </div>
                    <div class="grid grid-cols-2 gap-2 mb-2">
                        <div>
                            <div class="text-xs text-muted">Target</div>
                            <div class="font-bold" style="color: var(--text-primary);">${formatCurrency(savingsData.targetAmount, 'GHS')}</div>
                        </div>
                        <div>
                            <div class="text-xs text-muted">Saved</div>
                            <div class="font-bold" style="color: var(--emerald);">${formatCurrency(savingsData.savedAmount, 'GHS')}</div>
                        </div>
                        <div>
                            <div class="text-xs text-muted">Remaining</div>
                            <div class="font-bold" style="color: ${savingsData.remaining > 0 ? '#ef4444' : 'var(--emerald)'};">${formatCurrency(savingsData.remaining, 'GHS')}</div>
                        </div>
                    </div>
                    <div>
                        <div class="flex justify-between text-xs text-muted">
                            <span>${savingsData.savingsProgress}%</span>
                        </div>
                        <div class="w-full h-2 rounded-full overflow-hidden" style="background: var(--border-color);">
                            <div class="h-full rounded-full transition-all" style="width: ${savingsData.savingsProgress}%; background: linear-gradient(90deg, #06b6d4, var(--emerald));"></div>
                        </div>
                    </div>
                </div>
            ` : `
                <div class="mt-2">
                    <div class="flex justify-between text-xs text-muted mb-1">
                        <span>Progress</span>
                        <span>${totalProgress}%</span>
                    </div>
                    <div class="w-full h-2 rounded-full overflow-hidden" style="background: var(--border-color);">
                        <div class="h-full rounded-full transition-all" style="width: ${totalProgress}%; background: linear-gradient(90deg, var(--deep-blue), ${totalProgress >= 100 ? 'var(--emerald)' : 'var(--gold)'});"></div>
                    </div>
                </div>
            `}
            
            ${goal.category === 'learning' ? `
                <div class="mt-2 p-2 rounded-lg" style="background: rgba(245, 158, 11, 0.1);">
                    <div class="flex items-center gap-4 text-xs">
                        <span style="color: var(--text-primary);"><i class="fas fa-clock"></i> ${goal.studyHours || 0}h studied</span>
                        <span style="color: var(--text-primary);"><i class="fas fa-graduation-cap"></i> ${goal.coursesCompleted || 0} courses</span>
                    </div>
                </div>
            ` : ''}
            
            ${goal.endDate && goal.category !== 'savings' ? `
                <div class="mt-2 text-xs text-muted">
                    <i class="fas fa-calendar-alt mr-1"></i> Target: ${formatDate(goal.endDate)}
                </div>
            ` : ''}
            
            ${recentNotes.length > 0 ? `
                <div class="mt-2 border-t pt-2" style="border-color: var(--border-color);">
                    <div class="text-xs text-muted"><i class="fas fa-sticky-note mr-1"></i>Latest reflections:</div>
                    ${recentNotes.map(note => `
                        <div class="text-xs truncate" style="color: var(--text-secondary);">${escapeHtml(note.content ? note.content.substring(0, 60) : '')}${note.content && note.content.length > 60 ? '...' : ''}</div>
                    `).join('')}
                </div>
            ` : ''}
            
            <div class="flex gap-2 mt-3 pt-2 border-t" style="border-color: var(--border-color);">
                <button onclick="event.stopPropagation(); window.GoalsApp.addNote('${goal.id}')" class="flex-1 py-1.5 text-xs rounded-lg transition-all hover:shadow-md" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color);">
                    <i class="fas fa-sticky-note mr-1"></i> Reflect
                </button>
                <button onclick="event.stopPropagation(); window.GoalsApp.updateProgress('${goal.id}')" class="flex-1 py-1.5 text-xs rounded-lg transition-all hover:shadow-md" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color);">
                    <i class="fas fa-chart-line mr-1"></i> Update
                </button>
                <button onclick="event.stopPropagation(); window.GoalsApp.editGoal('${goal.id}')" class="flex-1 py-1.5 text-xs rounded-lg transition-all hover:shadow-md" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color);">
                    <i class="fas fa-edit mr-1"></i> Edit
                </button>
            </div>
        </div>
    `;
}

function createGoalListItem(goal) {
    const category = goalCategories[goal.category] || goalCategories.personal;
    const statusConfig = {
        'not-started': { color: '#8b5cf6', label: 'Not Started', icon: 'fa-hourglass-start' },
        'in-progress': { color: '#f59e0b', label: 'In Progress', icon: 'fa-spinner' },
        'completed': { color: '#10b981', label: 'Completed', icon: 'fa-check-circle' },
        'on-hold': { color: '#f59e0b', label: 'On Hold', icon: 'fa-pause' },
        'cancelled': { color: '#ef4444', label: 'Cancelled', icon: 'fa-ban' }
    };
    
    const progress = goal.progress || 0;
    const status = goal.status || 'not-started';
    const config = statusConfig[status];
    const isOverdue = goal.endDate && goal.endDate < new Date() && status !== 'completed' && status !== 'cancelled';
    
    let daysRemaining = null;
    if (goal.endDate) {
        const now = new Date();
        const diffTime = goal.endDate - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 0) daysRemaining = diffDays;
    }
    
    const project = goal.projectId ? projectsCache.find(p => p.id === goal.projectId) : null;
    
    return `
        <div class="glass-card rounded-xl p-4 transition-all hover:shadow-lg cursor-pointer" onclick="window.GoalsApp.viewGoal('${goal.id}')">
            <div class="flex flex-col md:flex-row md:items-center gap-3">
                <div class="flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                        <i class="fas ${category.icon}" style="color: ${category.color};"></i>
                        <h3 class="font-semibold" style="color: var(--text-primary);">${escapeHtml(goal.title)}</h3>
                        <span class="text-xs px-2 py-0.5 rounded-full" style="background: ${config.color}20; color: ${config.color};">
                            <i class="fas ${config.icon} text-xs mr-1"></i>${config.label}
                        </span>
                        ${isOverdue ? `<span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(239, 68, 68, 0.15); color: #ef4444;"><i class="fas fa-clock mr-1"></i>Overdue</span>` : ''}
                        ${daysRemaining ? `<span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(16, 185, 129, 0.15); color: #10b981;"><i class="fas fa-hourglass-half mr-1"></i>${daysRemaining}d left</span>` : ''}
                        ${project ? `<span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6;"><i class="fas fa-project-diagram"></i> ${escapeHtml(project.name)}</span>` : ''}
                    </div>
                    ${goal.description ? `<p class="text-sm text-muted mt-1">${escapeHtml(goal.description)}</p>` : ''}
                </div>
                <div class="flex items-center gap-4">
                    <div class="w-32">
                        <div class="flex justify-between text-xs text-muted">
                            <span>${progress}%</span>
                        </div>
                        <div class="w-full h-1.5 rounded-full overflow-hidden" style="background: var(--border-color);">
                            <div class="h-full rounded-full transition-all" style="width: ${progress}%; background: linear-gradient(90deg, var(--deep-blue), ${progress >= 100 ? 'var(--emerald)' : 'var(--gold)'});"></div>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="event.stopPropagation(); window.GoalsApp.addNote('${goal.id}')" class="p-2 rounded-lg transition-all hover:bg-gray-100 dark:hover:bg-gray-700" title="Add Reflection">
                            <i class="fas fa-sticky-note" style="color: var(--text-muted);"></i>
                        </button>
                        <button onclick="event.stopPropagation(); window.GoalsApp.updateProgress('${goal.id}')" class="p-2 rounded-lg transition-all hover:bg-gray-100 dark:hover:bg-gray-700" title="Update Progress">
                            <i class="fas fa-chart-line" style="color: var(--text-muted);"></i>
                        </button>
                        <button onclick="event.stopPropagation(); window.GoalsApp.editGoal('${goal.id}')" class="p-2 rounded-lg transition-all hover:bg-gray-100 dark:hover:bg-gray-700" title="Edit Goal">
                            <i class="fas fa-edit" style="color: var(--text-muted);"></i>
                        </button>
                        <button onclick="event.stopPropagation(); window.GoalsApp.deleteGoal('${goal.id}')" class="p-2 rounded-lg transition-all hover:bg-red-100 dark:hover:bg-red-900/20" title="Delete Goal">
                            <i class="fas fa-trash" style="color: #ef4444;"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function createGoalTimeline(goal) {
    const category = goalCategories[goal.category] || goalCategories.personal;
    const statusConfig = {
        'not-started': { color: '#8b5cf6', label: 'Not Started', icon: 'fa-hourglass-start' },
        'in-progress': { color: '#f59e0b', label: 'In Progress', icon: 'fa-spinner' },
        'completed': { color: '#10b981', label: 'Completed', icon: 'fa-check-circle' },
        'on-hold': { color: '#f59e0b', label: 'On Hold', icon: 'fa-pause' },
        'cancelled': { color: '#ef4444', label: 'Cancelled', icon: 'fa-ban' }
    };
    
    const progress = goal.progress || 0;
    const status = goal.status || 'not-started';
    const config = statusConfig[status];
    const goalMilestones = milestonesCache.filter(m => m.goalId === goal.id);
    const completedMilestones = goalMilestones.filter(m => m.completed);
    const goalNotes = goalNotesCache.filter(n => n.goalId === goal.id);
    
    let daysRemaining = null;
    if (goal.endDate) {
        const now = new Date();
        const diffTime = goal.endDate - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 0) daysRemaining = diffDays;
    }
    
    const lastUpdate = goal.lastUpdated || goal.createdAt;
    const daysSinceUpdate = Math.floor((new Date() - lastUpdate) / (1000 * 60 * 60 * 24));
    
    return `
        <div class="glass-card rounded-xl p-4 transition-all hover:shadow-lg">
            <div class="flex justify-between items-start mb-2">
                <div>
                    <div class="flex items-center gap-2 flex-wrap">
                        <i class="fas ${category.icon}" style="color: ${category.color};"></i>
                        <h3 class="font-semibold" style="color: var(--text-primary);">${escapeHtml(goal.title)}</h3>
                        <span class="text-xs px-2 py-0.5 rounded-full" style="background: ${config.color}20; color: ${config.color};">
                            <i class="fas ${config.icon} text-xs mr-1"></i>${config.label}
                        </span>
                        ${daysRemaining ? `<span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(16, 185, 129, 0.15); color: #10b981;"><i class="fas fa-hourglass-half mr-1"></i>${daysRemaining}d left</span>` : ''}
                        ${daysSinceUpdate > 10 && status === 'in-progress' ? `<span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b;"><i class="fas fa-clock mr-1"></i>${daysSinceUpdate}d inactive</span>` : ''}
                    </div>
                    ${goal.description ? `<p class="text-sm text-muted">${escapeHtml(goal.description)}</p>` : ''}
                </div>
                <div class="text-right text-sm" style="color: var(--text-muted);">
                    ${goal.endDate ? `Target: ${formatDate(goal.endDate)}` : ''}
                </div>
            </div>
            
            <div class="mt-3">
                <div class="flex justify-between text-xs text-muted">
                    <span>Progress: ${progress}%</span>
                    <span>${completedMilestones.length}/${goalMilestones.length} Milestones</span>
                </div>
                <div class="w-full h-2 rounded-full overflow-hidden" style="background: var(--border-color);">
                    <div class="h-full rounded-full transition-all" style="width: ${progress}%; background: linear-gradient(90deg, var(--deep-blue), ${progress >= 100 ? 'var(--emerald)' : 'var(--gold)'});"></div>
                </div>
            </div>
            
            ${goalMilestones.length > 0 ? `
                <div class="relative pl-6 mt-3">
                    ${goalMilestones.map((milestone, index) => `
                        <div class="relative pb-3 ${index === goalMilestones.length - 1 ? '' : 'border-l-2'}" style="border-color: var(--border-color);">
                            <div class="absolute -left-2 top-0 w-4 h-4 rounded-full ${milestone.completed ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}"></div>
                            <div class="flex items-center gap-2">
                                <span class="text-sm ${milestone.completed ? 'line-through' : ''}" style="color: ${milestone.completed ? 'var(--text-muted)' : 'var(--text-primary)'};">${escapeHtml(milestone.title)}</span>
                                ${milestone.completed ? '<i class="fas fa-check-circle text-emerald-500"></i>' : ''}
                                ${milestone.dueDate ? `<span class="text-xs text-muted">Due: ${formatDate(milestone.dueDate)}</span>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            ` : `
                <div class="text-sm text-muted mt-2">No milestones set</div>
            `}
            
            ${goalNotes.length > 0 ? `
                <div class="mt-3 pt-2 border-t" style="border-color: var(--border-color);">
                    <div class="text-xs font-semibold text-muted"><i class="fas fa-sticky-note mr-1"></i>Latest Reflections</div>
                    ${goalNotes.slice(0, 2).map(note => `
                        <div class="text-xs mt-1 p-2 rounded" style="background: var(--bg-primary); color: var(--text-secondary);">
                            ${escapeHtml(note.content ? note.content.substring(0, 100) : '')}${note.content && note.content.length > 100 ? '...' : ''}
                            <span class="text-muted"> - ${timeAgo(note.createdAt)}</span>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
            
            <div class="flex gap-2 mt-3 pt-2 border-t" style="border-color: var(--border-color);">
                <button onclick="window.GoalsApp.viewGoal('${goal.id}')" class="px-3 py-1 text-sm rounded-lg transition-all hover:shadow-md" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color);">
                    <i class="fas fa-eye mr-1"></i> View Details
                </button>
                <button onclick="window.GoalsApp.addNote('${goal.id}')" class="px-3 py-1 text-sm rounded-lg transition-all hover:shadow-md" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color);">
                    <i class="fas fa-sticky-note mr-1"></i> Add Reflection
                </button>
            </div>
        </div>
    `;
}

// ============= ANALYTICS FUNCTIONS =============

function renderAnalytics(goals) {
    if (goals.length === 0) {
        return `
            <div class="glass-card rounded-xl p-12 text-center">
                <i class="fas fa-chart-pie text-6xl mb-4 text-muted"></i>
                <h3 class="text-xl font-semibold mb-2" style="color: var(--text-primary);">No data to analyze</h3>
                <p class="text-muted">Create some goals to see analytics and insights here</p>
            </div>
        `;
    }

    const total = goals.length;
    const completed = goals.filter(g => g.status === 'completed').length;
    const inProgress = goals.filter(g => g.status === 'in-progress').length;
    const onHold = goals.filter(g => g.status === 'on-hold').length;
    const notStarted = goals.filter(g => g.status === 'not-started').length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    const categoryStats = {};
    goals.forEach(g => {
        const cat = g.category || 'personal';
        if (!categoryStats[cat]) categoryStats[cat] = { total: 0, completed: 0, progress: 0 };
        categoryStats[cat].total++;
        if (g.status === 'completed') categoryStats[cat].completed++;
        categoryStats[cat].progress += g.progress || 0;
    });
    
    const priorityStats = { high: 0, medium: 0, low: 0 };
    goals.forEach(g => {
        if (g.priority) priorityStats[g.priority]++;
        else priorityStats.medium++;
    });
    
    const avgProgress = total > 0 ? Math.round(goals.reduce((sum, g) => sum + (g.progress || 0), 0) / total) : 0;
    
    const progressOverTime = goalAnalyticsCache
        .filter(a => goals.some(g => g.id === a.goalId))
        .sort((a, b) => a.date - b.date);
    
    const learningGoals = goals.filter(g => g.category === 'learning');
    const totalStudyHours = learningGoals.reduce((sum, g) => sum + (g.studyHours || 0), 0);
    const coursesCompleted = learningGoals.reduce((sum, g) => sum + (g.coursesCompleted || 0), 0);
    const completedLearningGoals = learningGoals.filter(g => g.status === 'completed').length;
    
    const savingsGoals = goals.filter(g => g.category === 'savings');
    const totalSavingsTarget = savingsGoals.reduce((sum, g) => sum + (g.targetAmount || 0), 0);
    const totalSavingsCurrent = savingsGoals.reduce((sum, g) => sum + (g.currentAmount || 0), 0);
    const savingsProgress = totalSavingsTarget > 0 ? Math.round((totalSavingsCurrent / totalSavingsTarget) * 100) : 0;
    const completedSavingsGoals = savingsGoals.filter(g => g.status === 'completed').length;
    
    // Generate unique IDs for charts
    const chartIds = {
        category: 'category-chart-' + Date.now(),
        priority: 'priority-chart-' + Date.now(),
        status: 'status-chart-' + Date.now(),
        progress: 'progress-chart-' + Date.now()
    };
    
    return `
        <div class="space-y-6" id="analytics-container">
            <!-- Quick Stats Cards -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="glass-card p-4 rounded-xl text-center">
                    <div class="text-3xl font-bold" style="color: var(--deep-blue);">${total}</div>
                    <div class="text-xs text-muted">Total Goals</div>
                </div>
                <div class="glass-card p-4 rounded-xl text-center">
                    <div class="text-3xl font-bold" style="color: var(--emerald);">${completionRate}%</div>
                    <div class="text-xs text-muted">Completion Rate</div>
                </div>
                <div class="glass-card p-4 rounded-xl text-center">
                    <div class="text-3xl font-bold" style="color: var(--gold);">${avgProgress}%</div>
                    <div class="text-xs text-muted">Average Progress</div>
                </div>
                <div class="glass-card p-4 rounded-xl text-center">
                    <div class="text-3xl font-bold" style="color: #8b5cf6;">${inProgress}</div>
                    <div class="text-xs text-muted">Active Goals</div>
                </div>
            </div>
            
            <!-- Charts Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Status Distribution Chart -->
                <div class="glass-card rounded-xl p-4">
                    <h4 class="font-semibold mb-3" style="color: var(--text-primary);">
                        <i class="fas fa-chart-pie mr-2" style="color: var(--deep-blue);"></i>Status Distribution
                    </h4>
                    <div class="w-full h-64">
                        <canvas id="${chartIds.status}"></canvas>
                    </div>
                </div>
                
                <!-- Category Breakdown Chart -->
                <div class="glass-card rounded-xl p-4">
                    <h4 class="font-semibold mb-3" style="color: var(--text-primary);">
                        <i class="fas fa-chart-bar mr-2" style="color: var(--emerald);"></i>Category Breakdown
                    </h4>
                    <div class="w-full h-64">
                        <canvas id="${chartIds.category}"></canvas>
                    </div>
                </div>
                
                <!-- Priority Distribution Chart -->
                <div class="glass-card rounded-xl p-4">
                    <h4 class="font-semibold mb-3" style="color: var(--text-primary);">
                        <i class="fas fa-chart-doughnut mr-2" style="color: var(--gold);"></i>Priority Distribution
                    </h4>
                    <div class="w-full h-64">
                        <canvas id="${chartIds.priority}"></canvas>
                    </div>
                </div>
                
                <!-- Progress Over Time Chart -->
                <div class="glass-card rounded-xl p-4">
                    <h4 class="font-semibold mb-3" style="color: var(--text-primary);">
                        <i class="fas fa-chart-line mr-2" style="color: #8b5cf6;"></i>Progress Over Time
                    </h4>
                    <div class="w-full h-64">
                        <canvas id="${chartIds.progress}"></canvas>
                    </div>
                </div>
            </div>
            
            <!-- Learning Progress -->
            ${learningGoals.length > 0 ? `
                <div class="glass-card p-4 rounded-xl">
                    <h4 class="font-semibold mb-3" style="color: var(--text-primary);">
                        <i class="fas fa-graduation-cap mr-2" style="color: var(--gold);"></i>Learning Progress
                    </h4>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div class="text-center p-2 rounded" style="background: var(--bg-primary);">
                            <div class="text-lg font-bold" style="color: var(--gold);">${learningGoals.length}</div>
                            <div class="text-xs text-muted">Learning Goals</div>
                        </div>
                        <div class="text-center p-2 rounded" style="background: var(--bg-primary);">
                            <div class="text-lg font-bold" style="color: var(--deep-blue);">${totalStudyHours}h</div>
                            <div class="text-xs text-muted">Study Hours</div>
                        </div>
                        <div class="text-center p-2 rounded" style="background: var(--bg-primary);">
                            <div class="text-lg font-bold" style="color: var(--emerald);">${coursesCompleted}</div>
                            <div class="text-xs text-muted">Courses Completed</div>
                        </div>
                        <div class="text-center p-2 rounded" style="background: var(--bg-primary);">
                            <div class="text-lg font-bold" style="color: #8b5cf6;">${completedLearningGoals}</div>
                            <div class="text-xs text-muted">Goals Completed</div>
                        </div>
                    </div>
                    <div class="mt-3">
                        <div class="flex justify-between text-xs text-muted">
                            <span>Learning Progress</span>
                            <span>${learningGoals.length > 0 ? Math.round(learningGoals.reduce((sum, g) => sum + (g.progress || 0), 0) / learningGoals.length) : 0}%</span>
                        </div>
                        <div class="w-full h-2 rounded-full overflow-hidden" style="background: var(--border-color);">
                            <div class="h-full rounded-full transition-all" style="width: ${learningGoals.length > 0 ? Math.round(learningGoals.reduce((sum, g) => sum + (g.progress || 0), 0) / learningGoals.length) : 0}%; background: linear-gradient(90deg, var(--gold), var(--emerald));"></div>
                        </div>
                    </div>
                </div>
            ` : ''}
            
            <!-- Savings Progress -->
            ${savingsGoals.length > 0 ? `
                <div class="glass-card p-4 rounded-xl">
                    <h4 class="font-semibold mb-3" style="color: var(--text-primary);">
                        <i class="fas fa-piggy-bank mr-2" style="color: #06b6d4;"></i>Savings Progress
                    </h4>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div class="text-center p-2 rounded" style="background: var(--bg-primary);">
                            <div class="text-lg font-bold" style="color: #06b6d4;">${savingsGoals.length}</div>
                            <div class="text-xs text-muted">Savings Goals</div>
                        </div>
                        <div class="text-center p-2 rounded" style="background: var(--bg-primary);">
                            <div class="text-lg font-bold" style="color: var(--deep-blue);">${formatCurrency(totalSavingsTarget, 'GHS')}</div>
                            <div class="text-xs text-muted">Total Target</div>
                        </div>
                        <div class="text-center p-2 rounded" style="background: var(--bg-primary);">
                            <div class="text-lg font-bold" style="color: var(--emerald);">${formatCurrency(totalSavingsCurrent, 'GHS')}</div>
                            <div class="text-xs text-muted">Total Saved</div>
                        </div>
                        <div class="text-center p-2 rounded" style="background: var(--bg-primary);">
                            <div class="text-lg font-bold" style="color: #8b5cf6;">${completedSavingsGoals}</div>
                            <div class="text-xs text-muted">Goals Completed</div>
                        </div>
                    </div>
                    <div class="mt-3">
                        <div class="flex justify-between text-xs text-muted">
                            <span>Overall Savings Progress</span>
                            <span>${savingsProgress}%</span>
                        </div>
                        <div class="w-full h-2 rounded-full overflow-hidden" style="background: var(--border-color);">
                            <div class="h-full rounded-full transition-all" style="width: ${savingsProgress}%; background: linear-gradient(90deg, #06b6d4, var(--emerald));"></div>
                        </div>
                    </div>
                </div>
            ` : ''}
            
            <!-- Category Details -->
            <div class="glass-card p-4 rounded-xl">
                <h4 class="font-semibold mb-3" style="color: var(--text-primary);">
                    <i class="fas fa-list mr-2" style="color: var(--deep-blue);"></i>Category Details
                </h4>
                <div class="space-y-2 max-h-64 overflow-y-auto">
                    ${Object.entries(categoryStats).map(([cat, stats]) => {
                        const category = goalCategories[cat] || goalCategories.personal;
                        const catProgress = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
                        const avgCatProgress = stats.total > 0 ? Math.round(stats.progress / stats.total) : 0;
                        return `
                            <div class="p-3 rounded-lg" style="background: var(--bg-primary);">
                                <div class="flex justify-between items-center mb-1">
                                    <div>
                                        <i class="fas ${category.icon}" style="color: ${category.color};"></i>
                                        <span class="font-medium ml-2" style="color: var(--text-primary);">${category.label}</span>
                                        <span class="text-xs text-muted ml-2">(${stats.total} goals)</span>
                                    </div>
                                    <div class="flex gap-3 text-xs">
                                        <span style="color: var(--emerald);">${stats.completed} completed</span>
                                        <span style="color: var(--text-muted);">Avg: ${avgCatProgress}%</span>
                                    </div>
                                </div>
                                <div class="w-full h-1.5 rounded-full overflow-hidden" style="background: var(--border-color);">
                                    <div class="h-full rounded-full transition-all" style="width: ${catProgress}%; background: ${category.color};"></div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
            
            <!-- Progress Over Time Details -->
            ${progressOverTime.length > 0 ? `
                <div class="glass-card p-4 rounded-xl">
                    <h4 class="font-semibold mb-3" style="color: var(--text-primary);">
                        <i class="fas fa-history mr-2" style="color: #8b5cf6;"></i>Recent Progress Updates
                    </h4>
                    <div class="space-y-2 max-h-48 overflow-y-auto">
                        ${progressOverTime.slice(0, 10).map(a => {
                            const goal = goals.find(g => g.id === a.goalId);
                            return goal ? `
                                <div class="flex justify-between items-center p-2 rounded" style="background: var(--bg-primary);">
                                    <span class="text-sm" style="color: var(--text-primary);">${escapeHtml(goal.title)}</span>
                                    <div class="flex items-center gap-2">
                                        <span class="text-xs text-muted">${formatDate(a.date)}</span>
                                        <span class="text-sm font-semibold" style="color: var(--deep-blue);">${a.progress}%</span>
                                    </div>
                                </div>
                            ` : '';
                        }).join('')}
                        ${progressOverTime.length > 10 ? `<div class="text-center text-xs text-muted">+ ${progressOverTime.length - 10} more updates</div>` : ''}
                    </div>
                </div>
            ` : ''}
            
            <!-- Goal Advisor Insights -->
            <div class="glass-card p-4 rounded-xl" style="border-left: 4px solid #8b5cf6;">
                <h4 class="font-semibold mb-2" style="color: var(--text-primary);">
                    <i class="fas fa-lightbulb mr-2" style="color: #8b5cf6;"></i>Analytics Insights
                </h4>
                <div class="space-y-1 text-sm" style="color: var(--text-secondary);">
                    ${total > 0 ? `
                        <p>📊 You have <strong style="color: var(--text-primary);">${total}</strong> goals with a <strong style="color: var(--text-primary);">${completionRate}%</strong> completion rate.</p>
                        ${inProgress > 0 ? `<p>🔄 <strong style="color: var(--text-primary);">${inProgress}</strong> goals are currently in progress. Keep pushing!</p>` : ''}
                        ${notStarted > 0 ? `<p>⏳ <strong style="color: var(--text-primary);">${notStarted}</strong> goals haven't been started yet. Time to take action!</p>` : ''}
                        ${onHold > 0 ? `<p>⏸️ <strong style="color: var(--text-primary);">${onHold}</strong> goals are on hold. Consider reviewing them.</p>` : ''}
                        ${completionRate === 100 ? `<p>🎉 Amazing! All your goals are completed! You're on fire!</p>` : ''}
                        ${completionRate < 30 && total > 3 ? `<p>💡 Tip: Focus on completing your most important goals first.</p>` : ''}
                        ${savingsGoals.length > 0 ? `<p>💰 You have <strong style="color: var(--text-primary);">${savingsGoals.length}</strong> savings goals with a total of <strong style="color: var(--text-primary);">${formatCurrency(totalSavingsCurrent, 'GHS')}</strong> saved out of <strong style="color: var(--text-primary);">${formatCurrency(totalSavingsTarget, 'GHS')}</strong>.</p>` : ''}
                        ${learningGoals.length > 0 ? `<p>📚 You've completed <strong style="color: var(--text-primary);">${coursesCompleted}</strong> courses and studied <strong style="color: var(--text-primary);">${totalStudyHours}h</strong> across ${learningGoals.length} learning goals.</p>` : ''}
                    ` : ''}
                </div>
            </div>
            
            <!-- Refresh Button -->
            <div class="text-center">
                <button onclick="window.GoalsApp.refreshAnalytics()" class="px-6 py-2 rounded-lg font-semibold transition-all hover:shadow-md" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color);">
                    <i class="fas fa-sync-alt mr-2"></i> Refresh Analytics
                </button>
            </div>
        </div>
    `;
}

function initAnalyticsCharts() {
    setTimeout(() => {
        // Check if Chart.js is available
        if (typeof Chart === 'undefined') {
            // Load Chart.js dynamically if not available
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
            script.onload = () => {
                setTimeout(() => initAnalyticsCharts(), 100);
            };
            document.head.appendChild(script);
            return;
        }
        
        // Status Chart (Doughnut)
        const statusCanvas = document.querySelector('canvas[id^="status-chart-"]');
        if (statusCanvas) {
            const statusData = {
                labels: ['Completed', 'In Progress', 'On Hold', 'Not Started'],
                datasets: [{
                    data: [
                        goalsCache.filter(g => g.status === 'completed').length,
                        goalsCache.filter(g => g.status === 'in-progress').length,
                        goalsCache.filter(g => g.status === 'on-hold').length,
                        goalsCache.filter(g => g.status === 'not-started').length
                    ],
                    backgroundColor: ['#10b981', '#f59e0b', '#f59e0b', '#8b5cf6'],
                    borderWidth: 0
                }]
            };
            new Chart(statusCanvas, {
                type: 'doughnut',
                data: statusData,
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#333' }
                        }
                    }
                }
            });
        }
        
        // Category Chart (Bar)
        const categoryCanvas = document.querySelector('canvas[id^="category-chart-"]');
        if (categoryCanvas) {
            const categoryStats = {};
            goalsCache.forEach(g => {
                const cat = g.category || 'personal';
                if (!categoryStats[cat]) categoryStats[cat] = 0;
                categoryStats[cat]++;
            });
            
            const categoryLabels = Object.keys(categoryStats).map(cat => {
                const catData = goalCategories[cat] || goalCategories.personal;
                return catData.label;
            });
            const categoryData = Object.values(categoryStats);
            const categoryColors = Object.keys(categoryStats).map(cat => {
                const catData = goalCategories[cat] || goalCategories.personal;
                return catData.color;
            });
            
            new Chart(categoryCanvas, {
                type: 'bar',
                data: {
                    labels: categoryLabels,
                    datasets: [{
                        label: 'Number of Goals',
                        data: categoryData,
                        backgroundColor: categoryColors,
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { stepSize: 1, color: getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#666' },
                            grid: { color: getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim() || '#ddd' }
                        },
                        x: {
                            ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#666' },
                            grid: { display: false }
                        }
                    }
                }
            });
        }
        
        // Priority Chart (Doughnut)
        const priorityCanvas = document.querySelector('canvas[id^="priority-chart-"]');
        if (priorityCanvas) {
            const priorityData = {
                labels: ['High', 'Medium', 'Low'],
                datasets: [{
                    data: [
                        goalsCache.filter(g => g.priority === 'high').length,
                        goalsCache.filter(g => g.priority === 'medium' || !g.priority).length,
                        goalsCache.filter(g => g.priority === 'low').length
                    ],
                    backgroundColor: ['#ef4444', '#f59e0b', '#10b981'],
                    borderWidth: 0
                }]
            };
            new Chart(priorityCanvas, {
                type: 'doughnut',
                data: priorityData,
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#333' }
                        }
                    }
                }
            });
        }
        
        // Progress Over Time Chart (Line)
        const progressCanvas = document.querySelector('canvas[id^="progress-chart-"]');
        if (progressCanvas) {
            const progressData = goalAnalyticsCache
                .filter(a => goalsCache.some(g => g.id === a.goalId))
                .sort((a, b) => a.date - b.date);
            
            if (progressData.length > 0) {
                const dateMap = {};
                progressData.forEach(a => {
                    const dateKey = a.date.toDateString();
                    if (!dateMap[dateKey]) dateMap[dateKey] = { total: 0, count: 0 };
                    dateMap[dateKey].total += a.progress;
                    dateMap[dateKey].count++;
                });
                
                const dates = Object.keys(dateMap);
                const avgProgress = dates.map(d => Math.round(dateMap[d].total / dateMap[d].count));
                
                new Chart(progressCanvas, {
                    type: 'line',
                    data: {
                        labels: dates.map(d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
                        datasets: [{
                            label: 'Average Progress',
                            data: avgProgress,
                            borderColor: '#8b5cf6',
                            backgroundColor: 'rgba(139, 92, 246, 0.1)',
                            tension: 0.4,
                            fill: true,
                            pointBackgroundColor: '#8b5cf6'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: {
                            legend: {
                                position: 'top',
                                labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#333' }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                max: 100,
                                ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#666' },
                                grid: { color: getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim() || '#ddd' }
                            },
                            x: {
                                ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#666' },
                                grid: { display: false }
                            }
                        }
                    }
                });
            } else {
                progressCanvas.parentElement.innerHTML = `
                    <div class="flex items-center justify-center h-full">
                        <p class="text-sm text-muted">No progress data available yet</p>
                    </div>
                `;
            }
        }
    }, 150);
}

function setupEventListeners() {
    document.querySelectorAll('.view-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.view-tab').forEach(t => {
                t.classList.remove('active');
                t.style.background = 'var(--bg-secondary)';
                t.style.color = 'var(--text-muted)';
            });
            this.classList.add('active');
            this.style.background = 'linear-gradient(135deg, var(--deep-blue), var(--emerald))';
            this.style.color = 'white';
            filterAndRenderGoals();
        });
    });
    
    const searchInput = document.getElementById('goal-search');
    if (searchInput) searchInput.addEventListener('input', () => filterAndRenderGoals());
    
    ['goal-filter-status', 'goal-filter-category', 'goal-filter-priority'].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.addEventListener('change', () => filterAndRenderGoals());
    });
    
    const clearBtn = document.getElementById('clear-filters');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            document.getElementById('goal-search').value = '';
            document.getElementById('goal-filter-status').value = 'all';
            document.getElementById('goal-filter-category').value = 'all';
            document.getElementById('goal-filter-priority').value = 'all';
            filterAndRenderGoals();
        });
    }
    
    document.querySelectorAll('[data-filter]').forEach(stat => {
        stat.addEventListener('click', function() {
            const filter = this.dataset.filter;
            if (filter === 'all') {
                document.getElementById('goal-filter-status').value = 'all';
            } else {
                document.getElementById('goal-filter-status').value = filter;
            }
            filterAndRenderGoals();
        });
    });
    
    document.getElementById('add-goal-btn')?.addEventListener('click', () => window.GoalsApp.showAddGoalModal());
    document.getElementById('add-savings-goal-btn')?.addEventListener('click', () => window.GoalsApp.showAddSavingsGoalModal());
    document.getElementById('add-learning-goal-btn')?.addEventListener('click', () => window.GoalsApp.showAddLearningGoalModal());
    document.getElementById('add-milestone-btn')?.addEventListener('click', () => window.GoalsApp.showAddMilestoneModal());
    
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'g') {
            e.preventDefault();
            window.GoalsApp.showAddGoalModal();
        }
    });
}

// ============= GLOBAL GOALS APP OBJECT =============

window.GoalsApp = {
    refreshAnalytics: function() {
        showToast('Refreshing analytics...', 'info');
        const view = document.querySelector('.view-tab.active')?.dataset.view || 'grid';
        if (view === 'analytics') {
            filterAndRenderGoals();
            setTimeout(() => {
                initAnalyticsCharts();
                showToast('Analytics refreshed!', 'success');
            }, 200);
        } else {
            const analyticsTab = document.querySelector('.view-tab[data-view="analytics"]');
            if (analyticsTab) analyticsTab.click();
        }
    },
    
    showAddGoalModal: function() {
        // ... keep existing function
    },
    
    showAddSavingsGoalModal: function() {
        // ... keep existing function
    },
    
    showAddLearningGoalModal: function() {
        // ... keep existing function
    },
    
    showAddMilestoneModal: function() {
        // ... keep existing function
    },
    
    addNote: function(goalId) {
        // ... keep existing function
    },
    
    viewGoal: function(goalId) {
        // ... keep existing function
    },
    
    editGoal: async function(goalId) {
        // ... keep existing function
    },
    
    deleteGoal: async function(goalId) {
        // ... keep existing function
    },
    
    deleteNote: async function(noteId) {
        // ... keep existing function
    },
    
    updateProgress: function(goalId) {
        // ... keep existing function
    },
    
    saveProgress: async function(goalId) {
        // ... keep existing function
    },
    
    toggleMilestone: async function(milestoneId, completed) {
        // ... keep existing function
    },
    
    deleteMilestone: async function(milestoneId) {
        // ... keep existing function
    },
    
    dismissAlert: function(goalId) {
        updateDoc(doc(db, 'goals', goalId), {
            lastUpdated: serverTimestamp()
        }).then(() => {
            checkSmartAlerts();
        }).catch(console.error);
    },
    
    closeModal: function() {
        const container = document.getElementById('modal-container');
        if (container) {
            container.innerHTML = '';
            container.style.pointerEvents = 'none';
        }
    }
};

window.closeModal = window.GoalsApp.closeModal;

// Global GoalsApp Object
window.GoalsApp = {
    showAddGoalModal: function() {
        const today = new Date().toISOString().split('T')[0];
        const projectOptions = projectsCache
            .filter(p => !p.archived)
            .map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
            .join('');
        
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.GoalsApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto transform transition-all" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-bullseye mr-2" style="color: var(--deep-blue);"></i>Create New Goal
                            </h2>
                            <p class="text-xs text-muted">Set a new goal and track your progress</p>
                        </div>
                        <button onclick="window.GoalsApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="add-goal-form" class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Goal Title *</label>
                            <input type="text" name="title" required placeholder="What do you want to achieve?" 
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Description</label>
                            <textarea name="description" rows="3" placeholder="Describe your goal in detail..."
                                      class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></textarea>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Category</label>
                                <select name="category" class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                        style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    ${Object.entries(goalCategories).map(([key, cat]) => 
                                        `<option value="${key}"><i class="fas ${cat.icon}"></i> ${cat.label}</option>`
                                    ).join('')}
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Priority</label>
                                <select name="priority" class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                        style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    <option value="high">High</option>
                                    <option value="medium" selected>Medium</option>
                                    <option value="low">Low</option>
                                </select>
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Link to Project (Optional)</label>
                            <select name="projectId" class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                    style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <option value="">None</option>
                                ${projectOptions}
                            </select>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Start Date</label>
                                <input type="date" name="startDate" value="${today}"
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Target Date</label>
                                <input type="date" name="endDate"
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Initial Progress (%)</label>
                            <input type="range" name="progress" min="0" max="100" value="0"
                                   class="w-full cursor-pointer" id="goal-progress-slider">
                            <div class="text-right text-sm text-muted mt-1" id="goal-progress-display">0%</div>
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button type="submit" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-1"></i> Create Goal
                            </button>
                            <button type="button" onclick="window.GoalsApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        const container = document.getElementById('modal-container');
        if (container) {
            container.innerHTML = html;
            container.style.pointerEvents = 'auto';
            
            const slider = document.getElementById('goal-progress-slider');
            const display = document.getElementById('goal-progress-display');
            if (slider && display) {
                slider.oninput = () => display.textContent = `${slider.value}%`;
            }
            
            document.getElementById('add-goal-form').onsubmit = async (e) => {
                e.preventDefault();
                const submitBtn = e.target.querySelector('button[type="submit"]');
                const originalText = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Creating...';
                submitBtn.disabled = true;
                
                try {
                    const formData = new FormData(e.target);
                    const goalData = {
                        title: formData.get('title'),
                        description: formData.get('description') || '',
                        category: formData.get('category'),
                        priority: formData.get('priority'),
                        projectId: formData.get('projectId') || null,
                        status: 'not-started',
                        progress: parseInt(formData.get('progress')) || 0,
                        startDate: formData.get('startDate') ? new Date(formData.get('startDate')) : null,
                        endDate: formData.get('endDate') ? new Date(formData.get('endDate')) : null,
                        userId: currentUser.uid,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                        lastUpdated: serverTimestamp()
                    };
                    
                    await addDoc(collection(db, 'goals'), goalData);
                    showToast('Goal created successfully! 🎯', 'success');
                    window.GoalsApp.closeModal();
                    await loadGoals();
                    filterAndRenderGoals();
                    updateStats();
                    checkSmartAlerts();
                } catch (error) {
                    console.error('Error creating goal:', error);
                    showToast('Failed to create goal. Please try again.', 'error');
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                }
            };
        }
    },
    
    showAddSavingsGoalModal: function() {
        const today = new Date().toISOString().split('T')[0];
        
        // Calculate total savings from transactions
        const savingsTransactions = transactionsCache.filter(t => 
            (t.category === 'savings' || t.category === 'investment') && t.type === 'income'
        );
        const totalSaved = savingsTransactions.reduce((sum, t) => sum + t.amount, 0);
        
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.GoalsApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto transform transition-all" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-piggy-bank mr-2" style="color: #06b6d4;"></i>New Savings Goal
                            </h2>
                            <p class="text-xs text-muted">Set a financial savings target with finance integration</p>
                        </div>
                        <button onclick="window.GoalsApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="add-savings-goal-form" class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Savings Goal Title *</label>
                            <input type="text" name="title" required placeholder="e.g., Buy New Laptop" 
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Description</label>
                            <textarea name="description" rows="2" placeholder="What are you saving for?"
                                      class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></textarea>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Target Amount (GHS) *</label>
                                <input type="number" name="targetAmount" step="100" required placeholder="e.g., 8000" 
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Current Savings (GHS)</label>
                                <input type="number" name="currentAmount" step="100" placeholder="e.g., 5500" value="${totalSaved || 0}"
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Target Date</label>
                                <input type="date" name="endDate" value="${today}"
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Priority</label>
                                <select name="priority" class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                        style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    <option value="high">High</option>
                                    <option value="medium" selected>Medium</option>
                                    <option value="low">Low</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                            <p class="text-xs" style="color: var(--text-muted);">
                                <i class="fas fa-info-circle mr-1" style="color: var(--deep-blue);"></i>
                                Your savings will be automatically tracked from your finance transactions. 
                                Current total savings: <strong>${formatCurrency(totalSaved, 'GHS')}</strong>
                            </p>
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button type="submit" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, #06b6d4, var(--emerald)); color: white;">
                                <i class="fas fa-piggy-bank mr-1"></i> Create Savings Goal
                            </button>
                            <button type="button" onclick="window.GoalsApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        const container = document.getElementById('modal-container');
        if (container) {
            container.innerHTML = html;
            container.style.pointerEvents = 'auto';
            
            document.getElementById('add-savings-goal-form').onsubmit = async (e) => {
                e.preventDefault();
                const submitBtn = e.target.querySelector('button[type="submit"]');
                const originalText = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Creating...';
                submitBtn.disabled = true;
                
                try {
                    const formData = new FormData(e.target);
                    const goalData = {
                        title: formData.get('title'),
                        description: formData.get('description') || '',
                        category: 'savings',
                        priority: formData.get('priority'),
                        targetAmount: parseFloat(formData.get('targetAmount')) || 0,
                        currentAmount: parseFloat(formData.get('currentAmount')) || 0,
                        status: 'in-progress',
                        progress: 0,
                        startDate: new Date(),
                        endDate: formData.get('endDate') ? new Date(formData.get('endDate')) : null,
                        userId: currentUser.uid,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                        lastUpdated: serverTimestamp()
                    };
                    
                    await addDoc(collection(db, 'goals'), goalData);
                    showToast('Savings goal created successfully! 💰', 'success');
                    window.GoalsApp.closeModal();
                    await loadGoals();
                    filterAndRenderGoals();
                    updateStats();
                    checkSmartAlerts();
                } catch (error) {
                    console.error('Error creating savings goal:', error);
                    showToast('Failed to create savings goal. Please try again.', 'error');
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                }
            };
        }
    },
    
    showAddLearningGoalModal: function() {
        const today = new Date().toISOString().split('T')[0];
        
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.GoalsApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto transform transition-all" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-graduation-cap mr-2" style="color: var(--gold);"></i>New Learning Goal
                            </h2>
                            <p class="text-xs text-muted">Track your learning progress with courses and study hours</p>
                        </div>
                        <button onclick="window.GoalsApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="add-learning-goal-form" class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Learning Goal Title *</label>
                            <input type="text" name="title" required placeholder="e.g., Complete JavaScript Course" 
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Description</label>
                            <textarea name="description" rows="2" placeholder="What do you want to learn?"
                                      class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></textarea>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Study Hours</label>
                                <input type="number" name="studyHours" step="0.5" placeholder="0" value="0"
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Courses Completed</label>
                                <input type="number" name="coursesCompleted" step="1" placeholder="0" value="0"
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Target Date</label>
                                <input type="date" name="endDate" value="${today}"
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Priority</label>
                                <select name="priority" class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                        style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    <option value="high">High</option>
                                    <option value="medium" selected>Medium</option>
                                    <option value="low">Low</option>
                                </select>
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Initial Progress (%)</label>
                            <input type="range" name="progress" min="0" max="100" value="0"
                                   class="w-full cursor-pointer" id="learning-progress-slider">
                            <div class="text-right text-sm text-muted mt-1" id="learning-progress-display">0%</div>
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button type="submit" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--gold), var(--emerald)); color: white;">
                                <i class="fas fa-graduation-cap mr-1"></i> Create Learning Goal
                            </button>
                            <button type="button" onclick="window.GoalsApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        const container = document.getElementById('modal-container');
        if (container) {
            container.innerHTML = html;
            container.style.pointerEvents = 'auto';
            
            const slider = document.getElementById('learning-progress-slider');
            const display = document.getElementById('learning-progress-display');
            if (slider && display) {
                slider.oninput = () => display.textContent = `${slider.value}%`;
            }
            
            document.getElementById('add-learning-goal-form').onsubmit = async (e) => {
                e.preventDefault();
                const submitBtn = e.target.querySelector('button[type="submit"]');
                const originalText = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Creating...';
                submitBtn.disabled = true;
                
                try {
                    const formData = new FormData(e.target);
                    const goalData = {
                        title: formData.get('title'),
                        description: formData.get('description') || '',
                        category: 'learning',
                        priority: formData.get('priority'),
                        studyHours: parseFloat(formData.get('studyHours')) || 0,
                        coursesCompleted: parseInt(formData.get('coursesCompleted')) || 0,
                        status: 'in-progress',
                        progress: parseInt(formData.get('progress')) || 0,
                        startDate: new Date(),
                        endDate: formData.get('endDate') ? new Date(formData.get('endDate')) : null,
                        userId: currentUser.uid,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                        lastUpdated: serverTimestamp()
                    };
                    
                    await addDoc(collection(db, 'goals'), goalData);
                    showToast('Learning goal created successfully! 📚', 'success');
                    window.GoalsApp.closeModal();
                    await loadGoals();
                    filterAndRenderGoals();
                    updateStats();
                    checkSmartAlerts();
                } catch (error) {
                    console.error('Error creating learning goal:', error);
                    showToast('Failed to create learning goal. Please try again.', 'error');
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                }
            };
        }
    },
    
    showAddMilestoneModal: function() {
        // ... keep existing milestone modal
        if (goalsCache.length === 0) {
            showToast('Create a goal first before adding milestones!', 'warning');
            return;
        }
        
        const today = new Date().toISOString().split('T')[0];
        const goalOptions = goalsCache
            .filter(g => g.status !== 'completed' && g.status !== 'cancelled')
            .map(g => `<option value="${g.id}">${escapeHtml(g.title)}</option>`)
            .join('');
        
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.GoalsApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto transform transition-all" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-flag-checkered mr-2" style="color: var(--deep-blue);"></i>Add Milestone
                            </h2>
                            <p class="text-xs text-muted">Break down your goal into achievable milestones</p>
                        </div>
                        <button onclick="window.GoalsApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="add-milestone-form" class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Select Goal *</label>
                            <select name="goalId" required class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                    style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                ${goalOptions}
                            </select>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Milestone Title *</label>
                            <input type="text" name="title" required placeholder="What's the milestone?"
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Description</label>
                            <textarea name="description" rows="2" placeholder="Describe the milestone..."
                                      class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></textarea>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Due Date</label>
                            <input type="date" name="dueDate" value="${today}"
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button type="submit" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-flag mr-1"></i> Add Milestone
                            </button>
                            <button type="button" onclick="window.GoalsApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        const container = document.getElementById('modal-container');
        if (container) {
            container.innerHTML = html;
            container.style.pointerEvents = 'auto';
            
            document.getElementById('add-milestone-form').onsubmit = async (e) => {
                e.preventDefault();
                const submitBtn = e.target.querySelector('button[type="submit"]');
                const originalText = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Adding...';
                submitBtn.disabled = true;
                
                try {
                    const formData = new FormData(e.target);
                    const milestoneData = {
                        goalId: formData.get('goalId'),
                        title: formData.get('title'),
                        description: formData.get('description') || '',
                        dueDate: formData.get('dueDate') ? new Date(formData.get('dueDate')) : null,
                        completed: false,
                        completedAt: null,
                        userId: currentUser.uid,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    };
                    
                    await addDoc(collection(db, 'milestones'), milestoneData);
                    showToast('Milestone added successfully! 🏁', 'success');
                    window.GoalsApp.closeModal();
                    await loadMilestones();
                    filterAndRenderGoals();
                } catch (error) {
                    console.error('Error creating milestone:', error);
                    showToast('Failed to add milestone. Please try again.', 'error');
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                }
            };
        }
    },
    
    addNote: function(goalId) {
        // Keep existing addNote function
        const goal = goalsCache.find(g => g.id === goalId);
        if (!goal) {
            showToast('Goal not found', 'error');
            return;
        }
        
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.GoalsApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto transform transition-all" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-sticky-note mr-2" style="color: var(--deep-blue);"></i>Reflection for "${escapeHtml(goal.title)}"
                            </h2>
                            <p class="text-xs text-muted">Record your progress, challenges, and next steps</p>
                        </div>
                        <button onclick="window.GoalsApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="add-note-form" class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">What progress did you make?</label>
                            <textarea name="progress" rows="2" placeholder="What did you accomplish?"
                                      class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></textarea>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">What challenges did you face?</label>
                            <textarea name="challenges" rows="2" placeholder="What obstacles did you encounter?"
                                      class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></textarea>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Lessons learned / Next steps</label>
                            <textarea name="lessons" rows="2" placeholder="What did you learn? What's next?"
                                      class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></textarea>
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button type="submit" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-1"></i> Save Reflection
                            </button>
                            <button type="button" onclick="window.GoalsApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        const container = document.getElementById('modal-container');
        if (container) {
            container.innerHTML = html;
            container.style.pointerEvents = 'auto';
            
            document.getElementById('add-note-form').onsubmit = async (e) => {
                e.preventDefault();
                const submitBtn = e.target.querySelector('button[type="submit"]');
                const originalText = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Saving...';
                submitBtn.disabled = true;
                
                try {
                    const formData = new FormData(e.target);
                    const content = [
                        `📈 Progress: ${formData.get('progress')}`,
                        `⚠️ Challenges: ${formData.get('challenges')}`,
                        `📝 Lessons & Next Steps: ${formData.get('lessons')}`
                    ].filter(s => s.includes(': ') && !s.endsWith(': ')).join('\n\n');
                    
                    if (!content.trim()) {
                        showToast('Please fill in at least one field', 'error');
                        submitBtn.innerHTML = originalText;
                        submitBtn.disabled = false;
                        return;
                    }
                    
                    const noteData = {
                        goalId: goalId,
                        content: content,
                        progress: formData.get('progress') || '',
                        challenges: formData.get('challenges') || '',
                        lessons: formData.get('lessons') || '',
                        userId: currentUser.uid,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    };
                    
                    await addDoc(collection(db, 'goalNotes'), noteData);
                    
                    // Update lastUpdated on goal
                    await updateDoc(doc(db, 'goals', goalId), {
                        lastUpdated: serverTimestamp()
                    });
                    
                    showToast('Reflection saved! 📝', 'success');
                    window.GoalsApp.closeModal();
                    await loadGoalNotes();
                    await loadGoals();
                    filterAndRenderGoals();
                    checkSmartAlerts();
                } catch (error) {
                    console.error('Error saving note:', error);
                    showToast('Failed to save reflection. Please try again.', 'error');
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                }
            };
        }
    },
    
    viewGoal: function(goalId) {
        // Keep existing viewGoal function
        const goal = goalsCache.find(g => g.id === goalId);
        if (!goal) {
            showToast('Goal not found', 'error');
            return;
        }
        
        const category = goalCategories[goal.category] || goalCategories.personal;
        const goalMilestones = milestonesCache.filter(m => m.goalId === goalId);
        const completedMilestones = goalMilestones.filter(m => m.completed);
        const goalNotes = goalNotesCache.filter(n => n.goalId === goalId);
        const progress = goal.progress || 0;
        const project = goal.projectId ? projectsCache.find(p => p.id === goal.projectId) : null;
        
        let daysRemaining = null;
        let countdownText = '';
        if (goal.endDate) {
            const now = new Date();
            const diffTime = goal.endDate - now;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays > 0) {
                daysRemaining = diffDays;
                countdownText = `${diffDays} days remaining`;
            } else if (diffDays === 0) {
                countdownText = 'Today is the deadline!';
            } else if (goal.status !== 'completed') {
                countdownText = '⏰ Overdue';
            }
        }
        
        const lastUpdate = goal.lastUpdated || goal.createdAt;
        const daysSinceUpdate = Math.floor((new Date() - lastUpdate) / (1000 * 60 * 60 * 24));
        
        let savingsData = null;
        if (goal.category === 'savings' && goal.targetAmount) {
            const savedAmount = goal.currentAmount || 0;
            const targetAmount = goal.targetAmount;
            const remaining = Math.max(0, targetAmount - savedAmount);
            const savingsProgress = targetAmount > 0 ? Math.min(Math.round((savedAmount / targetAmount) * 100), 100) : 0;
            
            savingsData = {
                savedAmount,
                targetAmount,
                remaining,
                savingsProgress,
                isComplete: savingsProgress >= 100
            };
        }
        
        // Get advisor tip for this goal
        let advisorTip = '';
        let statusKey = goal.status;
        if (goal.endDate && goal.endDate < new Date() && goal.status !== 'completed') {
            statusKey = 'overdue';
        }
        const tips = goalAdvisorTips[statusKey] || goalAdvisorTips['not-started'];
        if (tips && tips.length > 0) {
            advisorTip = tips[0].tip;
        }
        
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.GoalsApp.closeModal()">
                <div class="rounded-2xl w-full max-w-2xl mx-auto max-h-[90vh] overflow-y-auto transform transition-all" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <div class="flex items-center gap-2">
                                <i class="fas ${category.icon}" style="color: ${category.color};"></i>
                                <h2 class="text-xl font-bold" style="color: var(--text-primary);">${escapeHtml(goal.title)}</h2>
                            </div>
                            <p class="text-xs text-muted">Goal Details</p>
                        </div>
                        <button onclick="window.GoalsApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <div class="p-5 space-y-4">
                        ${goal.description ? `<p style="color: var(--text-primary);">${escapeHtml(goal.description)}</p>` : ''}
                        
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <div class="p-2 rounded-lg" style="background: var(--bg-primary);">
                                <div class="text-xs text-muted">Category</div>
                                <div class="font-semibold" style="color: var(--text-primary);"><i class="fas ${category.icon}" style="color: ${category.color};"></i> ${category.label}</div>
                            </div>
                            <div class="p-2 rounded-lg" style="background: var(--bg-primary);">
                                <div class="text-xs text-muted">Priority</div>
                                <div class="font-semibold" style="color: var(--text-primary);">${goal.priority || 'Medium'}</div>
                            </div>
                            <div class="p-2 rounded-lg" style="background: var(--bg-primary);">
                                <div class="text-xs text-muted">Status</div>
                                <div class="font-semibold" style="color: var(--text-primary);">${goal.status || 'Not Started'}</div>
                            </div>
                            <div class="p-2 rounded-lg" style="background: var(--bg-primary);">
                                <div class="text-xs text-muted">Progress</div>
                                <div class="font-semibold" style="color: var(--text-primary);">${progress}%</div>
                            </div>
                        </div>
                        
                        ${project ? `
                            <div class="p-2 rounded-lg" style="background: var(--bg-primary);">
                                <div class="text-xs text-muted">Linked Project</div>
                                <div class="font-semibold" style="color: var(--text-primary);">
                                    <i class="fas fa-project-diagram mr-1"></i> ${escapeHtml(project.name)}
                                </div>
                            </div>
                        ` : ''}
                        
                        ${countdownText ? `
                            <div class="p-2 rounded-lg" style="background: ${daysRemaining > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'};">
                                <div class="text-sm font-semibold" style="color: ${daysRemaining > 0 ? 'var(--emerald)' : '#ef4444'};">
                                    <i class="fas fa-clock mr-1"></i> ${countdownText}
                                </div>
                            </div>
                        ` : ''}
                        
                        ${daysSinceUpdate > 10 && goal.status === 'in-progress' ? `
                            <div class="p-2 rounded-lg" style="background: rgba(245, 158, 11, 0.1);">
                                <div class="text-sm font-semibold" style="color: #f59e0b;">
                                    <i class="fas fa-clock mr-1"></i> ⚠️ Not updated in ${daysSinceUpdate} days
                                </div>
                            </div>
                        ` : ''}
                        
                        ${advisorTip ? `
                            <div class="p-3 rounded-lg" style="background: rgba(139, 92, 246, 0.1); border-left: 3px solid #8b5cf6;">
                                <div class="text-xs text-muted"><i class="fas fa-lightbulb mr-1" style="color: #8b5cf6;"></i>Goal Advisor Tip</div>
                                <div class="text-sm" style="color: var(--text-primary);">${advisorTip}</div>
                            </div>
                        ` : ''}
                        
                        ${goal.startDate ? `<div class="text-sm text-muted"><i class="fas fa-calendar-alt mr-2"></i>Started: ${formatDate(goal.startDate)}</div>` : ''}
                        ${goal.endDate ? `<div class="text-sm text-muted"><i class="fas fa-calendar-check mr-2"></i>Target: ${formatDate(goal.endDate)}</div>` : ''}
                        
                        ${savingsData ? `
                            <div class="p-3 rounded-lg" style="background: rgba(6, 182, 212, 0.1);">
                                <h4 class="font-semibold mb-2" style="color: var(--text-primary);"><i class="fas fa-piggy-bank mr-2"></i>Savings Progress</h4>
                                <div class="space-y-2">
                                    <div class="flex justify-between">
                                        <span style="color: var(--text-muted);">Target:</span>
                                        <span style="color: var(--text-primary);">${formatCurrency(savingsData.targetAmount, 'GHS')}</span>
                                    </div>
                                    <div class="flex justify-between">
                                        <span style="color: var(--text-muted);">Saved:</span>
                                        <span style="color: var(--emerald);">${formatCurrency(savingsData.savedAmount, 'GHS')}</span>
                                    </div>
                                    <div class="flex justify-between">
                                        <span style="color: var(--text-muted);">Remaining:</span>
                                        <span style="color: ${savingsData.remaining > 0 ? '#ef4444' : 'var(--emerald)'};">${formatCurrency(savingsData.remaining, 'GHS')}</span>
                                    </div>
                                    <div class="mt-2">
                                        <div class="w-full h-2 rounded-full overflow-hidden" style="background: var(--border-color);">
                                            <div class="h-full rounded-full transition-all" style="width: ${savingsData.savingsProgress}%; background: linear-gradient(90deg, #06b6d4, var(--emerald));"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                        
                        ${goal.category === 'learning' ? `
                            <div class="p-3 rounded-lg" style="background: rgba(245, 158, 11, 0.1);">
                                <h4 class="font-semibold mb-2" style="color: var(--text-primary);"><i class="fas fa-graduation-cap mr-2"></i>Learning Progress</h4>
                                <div class="grid grid-cols-2 gap-3">
                                    <div>
                                        <div class="text-xs text-muted">Study Hours</div>
                                        <div class="font-bold" style="color: var(--text-primary);">${goal.studyHours || 0}h</div>
                                    </div>
                                    <div>
                                        <div class="text-xs text-muted">Courses Completed</div>
                                        <div class="font-bold" style="color: var(--text-primary);">${goal.coursesCompleted || 0}</div>
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                        
                        ${goalMilestones.length > 0 ? `
                            <div>
                                <h4 class="font-semibold mb-2" style="color: var(--text-primary);">
                                    <i class="fas fa-flag-checkered mr-2" style="color: var(--deep-blue);"></i>
                                    Milestones (${completedMilestones.length}/${goalMilestones.length})
                                </h4>
                                <div class="space-y-2 max-h-48 overflow-y-auto">
                                    ${goalMilestones.map(m => `
                                        <div class="flex items-center gap-2 p-2 rounded-lg" style="background: var(--bg-primary);">
                                            <input type="checkbox" ${m.completed ? 'checked' : ''} 
                                                   onchange="window.GoalsApp.toggleMilestone('${m.id}', this.checked)"
                                                   class="w-4 h-4 rounded cursor-pointer">
                                            <div class="flex-1">
                                                <div class="font-medium ${m.completed ? 'line-through text-muted' : ''}" style="color: ${m.completed ? 'var(--text-muted)' : 'var(--text-primary)'};">${escapeHtml(m.title)}</div>
                                                ${m.dueDate ? `<div class="text-xs text-muted">Due: ${formatDate(m.dueDate)}</div>` : ''}
                                            </div>
                                            <button onclick="event.stopPropagation(); window.GoalsApp.deleteMilestone('${m.id}')" class="text-red-500 hover:text-red-700">
                                                <i class="fas fa-trash text-xs"></i>
                                            </button>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                        
                        ${goalNotes.length > 0 ? `
                            <div>
                                <h4 class="font-semibold mb-2" style="color: var(--text-primary);">
                                    <i class="fas fa-sticky-note mr-2" style="color: var(--deep-blue);"></i>
                                    Reflections (${goalNotes.length})
                                </h4>
                                <div class="space-y-2 max-h-48 overflow-y-auto">
                                    ${goalNotes.slice(0, 5).map(note => `
                                        <div class="p-2 rounded-lg" style="background: var(--bg-primary);">
                                            <div class="text-xs text-muted">${timeAgo(note.createdAt)}</div>
                                            <div class="text-sm whitespace-pre-wrap" style="color: var(--text-secondary);">${escapeHtml(note.content ? note.content.substring(0, 150) : '')}${note.content && note.content.length > 150 ? '...' : ''}</div>
                                            <button onclick="event.stopPropagation(); window.GoalsApp.deleteNote('${note.id}')" class="text-xs text-red-500 hover:text-red-700 mt-1">
                                                <i class="fas fa-trash"></i> Delete
                                            </button>
                                        </div>
                                    `).join('')}
                                    ${goalNotes.length > 5 ? `<div class="text-center text-xs text-muted">+ ${goalNotes.length - 5} more reflections</div>` : ''}
                                </div>
                            </div>
                        ` : ''}
                        
                        <div class="flex flex-wrap gap-2 pt-2 border-t" style="border-color: var(--border-color);">
                            <button onclick="window.GoalsApp.closeModal(); window.GoalsApp.addNote('${goal.id}')" class="flex-1 py-2 rounded-lg font-semibold transition-all hover:shadow-md" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color);">
                                <i class="fas fa-sticky-note mr-1"></i> Reflect
                            </button>
                            <button onclick="window.GoalsApp.closeModal(); window.GoalsApp.updateProgress('${goal.id}')" class="flex-1 py-2 rounded-lg font-semibold transition-all hover:shadow-md" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color);">
                                <i class="fas fa-chart-line mr-1"></i> Update
                            </button>
                            <button onclick="window.GoalsApp.closeModal(); window.GoalsApp.editGoal('${goal.id}')" class="flex-1 py-2 rounded-lg font-semibold transition-all hover:shadow-md" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color);">
                                <i class="fas fa-edit mr-1"></i> Edit
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        const container = document.getElementById('modal-container');
        if (container) {
            container.innerHTML = html;
            container.style.pointerEvents = 'auto';
        }
    },
    
    editGoal: async function(goalId) {
        // Keep existing editGoal function
        const goal = goalsCache.find(g => g.id === goalId);
        if (!goal) {
            showToast('Goal not found', 'error');
            return;
        }
        
        const startDate = goal.startDate ? goal.startDate.toISOString().split('T')[0] : '';
        const endDate = goal.endDate ? goal.endDate.toISOString().split('T')[0] : '';
        const projectOptions = projectsCache
            .filter(p => !p.archived)
            .map(p => `<option value="${p.id}" ${p.id === goal.projectId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`)
            .join('');
        
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.GoalsApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto transform transition-all" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-edit mr-2" style="color: var(--deep-blue);"></i>Edit Goal
                            </h2>
                            <p class="text-xs text-muted">Update goal details</p>
                        </div>
                        <button onclick="window.GoalsApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="edit-goal-form" class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Goal Title *</label>
                            <input type="text" name="title" required value="${escapeHtml(goal.title)}"
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Description</label>
                            <textarea name="description" rows="3"
                                      class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">${escapeHtml(goal.description || '')}</textarea>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Category</label>
                                <select name="category" class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                        style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    ${Object.entries(goalCategories).map(([key, cat]) => 
                                        `<option value="${key}" ${key === goal.category ? 'selected' : ''}><i class="fas ${cat.icon}"></i> ${cat.label}</option>`
                                    ).join('')}
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Priority</label>
                                <select name="priority" class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                        style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    <option value="high" ${goal.priority === 'high' ? 'selected' : ''}>High</option>
                                    <option value="medium" ${goal.priority === 'medium' ? 'selected' : ''}>Medium</option>
                                    <option value="low" ${goal.priority === 'low' ? 'selected' : ''}>Low</option>
                                </select>
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Link to Project</label>
                            <select name="projectId" class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                    style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <option value="">None</option>
                                ${projectOptions}
                            </select>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Status</label>
                                <select name="status" class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                        style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    <option value="not-started" ${goal.status === 'not-started' ? 'selected' : ''}>Not Started</option>
                                    <option value="in-progress" ${goal.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
                                    <option value="completed" ${goal.status === 'completed' ? 'selected' : ''}>Completed</option>
                                    <option value="on-hold" ${goal.status === 'on-hold' ? 'selected' : ''}>On Hold</option>
                                    <option value="cancelled" ${goal.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Progress (%)</label>
                                <input type="number" name="progress" min="0" max="100" value="${goal.progress || 0}"
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Start Date</label>
                                <input type="date" name="startDate" value="${startDate}"
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Target Date</label>
                                <input type="date" name="endDate" value="${endDate}"
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                        </div>
                        
                        ${goal.category === 'savings' ? `
                            <div class="border-t pt-3" style="border-color: var(--border-color);">
                                <h4 class="text-sm font-semibold mb-2" style="color: var(--text-primary);"><i class="fas fa-piggy-bank mr-2"></i>Savings Details</h4>
                                <div class="grid grid-cols-2 gap-3">
                                    <div>
                                        <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Target Amount</label>
                                        <input type="number" name="targetAmount" step="100" value="${goal.targetAmount || ''}"
                                               class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                               style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    </div>
                                    <div>
                                        <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Current Amount</label>
                                        <input type="number" name="currentAmount" step="100" value="${goal.currentAmount || ''}"
                                               class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                               style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                        
                        ${goal.category === 'learning' ? `
                            <div class="border-t pt-3" style="border-color: var(--border-color);">
                                <h4 class="text-sm font-semibold mb-2" style="color: var(--text-primary);"><i class="fas fa-graduation-cap mr-2"></i>Learning Details</h4>
                                <div class="grid grid-cols-2 gap-3">
                                    <div>
                                        <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Study Hours</label>
                                        <input type="number" name="studyHours" step="0.5" value="${goal.studyHours || ''}"
                                               class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                               style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    </div>
                                    <div>
                                        <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Courses Completed</label>
                                        <input type="number" name="coursesCompleted" step="1" value="${goal.coursesCompleted || ''}"
                                               class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                               style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button type="submit" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-1"></i> Update Goal
                            </button>
                            <button type="button" onclick="window.GoalsApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        const container = document.getElementById('modal-container');
        if (container) {
            container.innerHTML = html;
            container.style.pointerEvents = 'auto';
            
            document.getElementById('edit-goal-form').onsubmit = async (e) => {
                e.preventDefault();
                const submitBtn = e.target.querySelector('button[type="submit"]');
                const originalText = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Updating...';
                submitBtn.disabled = true;
                
                try {
                    const formData = new FormData(e.target);
                    const updateData = {
                        title: formData.get('title'),
                        description: formData.get('description') || '',
                        category: formData.get('category'),
                        priority: formData.get('priority'),
                        projectId: formData.get('projectId') || null,
                        status: formData.get('status'),
                        progress: parseInt(formData.get('progress')) || 0,
                        startDate: formData.get('startDate') ? new Date(formData.get('startDate')) : null,
                        endDate: formData.get('endDate') ? new Date(formData.get('endDate')) : null,
                        updatedAt: serverTimestamp(),
                        lastUpdated: serverTimestamp()
                    };
                    
                    if (formData.get('category') === 'savings') {
                        updateData.targetAmount = parseFloat(formData.get('targetAmount')) || 0;
                        updateData.currentAmount = parseFloat(formData.get('currentAmount')) || 0;
                    }
                    
                    if (formData.get('category') === 'learning') {
                        updateData.studyHours = parseFloat(formData.get('studyHours')) || 0;
                        updateData.coursesCompleted = parseInt(formData.get('coursesCompleted')) || 0;
                    }
                    
                    await updateDoc(doc(db, 'goals', goalId), updateData);
                    showToast('Goal updated successfully!', 'success');
                    window.GoalsApp.closeModal();
                    await loadGoals();
                    filterAndRenderGoals();
                    updateStats();
                    checkSmartAlerts();
                } catch (error) {
                    console.error('Error updating goal:', error);
                    showToast('Failed to update goal. Please try again.', 'error');
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                }
            };
        }
    },
    
    deleteGoal: async function(goalId) {
        if (!confirm('Are you sure you want to delete this goal and all its milestones and reflections?')) return;
        
        try {
            const goalMilestones = milestonesCache.filter(m => m.goalId === goalId);
            for (const milestone of goalMilestones) {
                await deleteDoc(doc(db, 'milestones', milestone.id));
            }
            
            const goalNotes = goalNotesCache.filter(n => n.goalId === goalId);
            for (const note of goalNotes) {
                await deleteDoc(doc(db, 'goalNotes', note.id));
            }
            
            await deleteDoc(doc(db, 'goals', goalId));
            showToast('Goal deleted successfully', 'success');
            await loadGoals();
            await loadMilestones();
            await loadGoalNotes();
            filterAndRenderGoals();
            updateStats();
            checkSmartAlerts();
            window.GoalsApp.closeModal();
        } catch (error) {
            console.error('Error deleting goal:', error);
            showToast('Failed to delete goal. Please try again.', 'error');
        }
    },
    
    deleteNote: async function(noteId) {
        if (!confirm('Delete this reflection?')) return;
        try {
            await deleteDoc(doc(db, 'goalNotes', noteId));
            showToast('Reflection deleted', 'success');
            await loadGoalNotes();
            filterAndRenderGoals();
        } catch (error) {
            console.error('Error deleting note:', error);
            showToast('Failed to delete reflection', 'error');
        }
    },
    
    updateProgress: function(goalId) {
        const goal = goalsCache.find(g => g.id === goalId);
        if (!goal) {
            showToast('Goal not found', 'error');
            return;
        }
        
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.GoalsApp.closeModal()">
                <div class="rounded-2xl w-full max-w-sm mx-auto transform transition-all" style="background: var(--bg-secondary);">
                    <div class="flex justify-between items-center p-5 border-b" style="border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-chart-line mr-2" style="color: var(--deep-blue);"></i>Update Progress
                            </h2>
                            <p class="text-xs text-muted">${escapeHtml(goal.title)}</p>
                        </div>
                        <button onclick="window.GoalsApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <div class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Current Progress: ${goal.progress || 0}%</label>
                            <input type="range" id="progress-slider" min="0" max="100" value="${goal.progress || 0}"
                                   class="w-full cursor-pointer">
                            <div class="text-center text-2xl font-bold mt-2" id="progress-display" style="color: var(--deep-blue);">${goal.progress || 0}%</div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Status</label>
                            <select id="progress-status" class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                    style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <option value="not-started" ${goal.status === 'not-started' ? 'selected' : ''}>Not Started</option>
                                <option value="in-progress" ${goal.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
                                <option value="completed" ${goal.status === 'completed' ? 'selected' : ''}>Completed</option>
                                <option value="on-hold" ${goal.status === 'on-hold' ? 'selected' : ''}>On Hold</option>
                                <option value="cancelled" ${goal.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                            </select>
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button onclick="window.GoalsApp.saveProgress('${goal.id}')" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-1"></i> Save Progress
                            </button>
                            <button onclick="window.GoalsApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        const container = document.getElementById('modal-container');
        if (container) {
            container.innerHTML = html;
            container.style.pointerEvents = 'auto';
            
            const slider = document.getElementById('progress-slider');
            const display = document.getElementById('progress-display');
            if (slider && display) {
                slider.oninput = () => display.textContent = `${slider.value}%`;
            }
        }
    },
    
    saveProgress: async function(goalId) {
        const slider = document.getElementById('progress-slider');
        const status = document.getElementById('progress-status');
        
        if (!slider || !status) {
            showToast('Error saving progress', 'error');
            return;
        }
        
        const progress = parseInt(slider.value);
        const newStatus = status.value;
        
        try {
            await updateDoc(doc(db, 'goals', goalId), {
                progress: progress,
                status: newStatus,
                updatedAt: serverTimestamp(),
                lastUpdated: serverTimestamp()
            });
            
            showToast(`Progress updated to ${progress}%! 🎯`, 'success');
            window.GoalsApp.closeModal();
            await loadGoals();
            filterAndRenderGoals();
            updateStats();
            checkSmartAlerts();
        } catch (error) {
            console.error('Error updating progress:', error);
            showToast('Failed to update progress. Please try again.', 'error');
        }
    },
    
    toggleMilestone: async function(milestoneId, completed) {
        try {
            await updateDoc(doc(db, 'milestones', milestoneId), {
                completed: completed,
                completedAt: completed ? serverTimestamp() : null,
                updatedAt: serverTimestamp()
            });
            
            const milestone = milestonesCache.find(m => m.id === milestoneId);
            if (milestone) {
                const goalMilestones = milestonesCache.filter(m => m.goalId === milestone.goalId);
                const completedCount = goalMilestones.filter(m => m.completed).length;
                const progress = Math.round((completedCount / goalMilestones.length) * 100);
                
                await updateDoc(doc(db, 'goals', milestone.goalId), {
                    progress: progress,
                    status: progress === 100 ? 'completed' : 'in-progress',
                    updatedAt: serverTimestamp(),
                    lastUpdated: serverTimestamp()
                });
            }
            
            showToast(completed ? 'Milestone completed! 🏁' : 'Milestone reopened', 'success');
            await loadMilestones();
            await loadGoals();
            filterAndRenderGoals();
            updateStats();
            checkSmartAlerts();
        } catch (error) {
            console.error('Error toggling milestone:', error);
            showToast('Failed to update milestone', 'error');
        }
    },
    
    deleteMilestone: async function(milestoneId) {
        if (!confirm('Delete this milestone?')) return;
        
        try {
            await deleteDoc(doc(db, 'milestones', milestoneId));
            showToast('Milestone deleted', 'success');
            await loadMilestones();
            filterAndRenderGoals();
        } catch (error) {
            console.error('Error deleting milestone:', error);
            showToast('Failed to delete milestone', 'error');
        }
    },
    
    dismissAlert: function(goalId) {
        // Mark alert as dismissed by updating lastUpdated
        updateDoc(doc(db, 'goals', goalId), {
            lastUpdated: serverTimestamp()
        }).then(() => {
            checkSmartAlerts();
        }).catch(console.error);
    },
    
    closeModal: function() {
        const container = document.getElementById('modal-container');
        if (container) {
            container.innerHTML = '';
            container.style.pointerEvents = 'none';
        }
    }
};

// Add closeModal to global scope
window.closeModal = window.GoalsApp.closeModal;