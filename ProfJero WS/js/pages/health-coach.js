// js/pages/health-coach.js
import { db, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, serverTimestamp, Timestamp } from '../firebase-config.js';
import { showToast, escapeHtml, formatDate, timeAgo, formatCurrency } from '../utils/helpers.js';

let currentUser = null;

// Cache variables
let healthDataCache = {
    dailyLogs: [],
    waterIntake: [],
    sleepLogs: [],
    activityLogs: [],
    nutritionLogs: [],
    moodLogs: [],
    medications: [],
    healthGoals: [],
    aiInsights: []
};

let currentDate = new Date();
let selectedDate = new Date();

// ============================================
// RENDER FUNCTION
// ============================================
export async function renderHealthCoachPage(user) {
    currentUser = user;
    
    return `
        <div class="space-y-6 animate-fade-in-up">
            <!-- Header -->
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 class="text-3xl font-bold" style="color: var(--text-primary);">
                        <i class="fas fa-heartbeat mr-3" style="color: var(--deep-blue);"></i>Health Coach
                    </h1>
                    <p class="text-muted mt-1">Your personal AI-powered wellness companion</p>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button onclick="window.HealthCoachApp.showQuickLog()" class="px-5 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                        <i class="fas fa-plus"></i> Quick Log
                    </button>
                    <button onclick="window.HealthCoachApp.getAIInsight()" class="px-5 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all hover:shadow-md" style="background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary);">
                        <i class="fas fa-robot"></i> AI Coach
                    </button>
                </div>
            </div>
            
            <!-- Daily Health Score -->
            <div class="glass-card rounded-xl p-6">
                <div class="flex flex-col md:flex-row items-center gap-6">
                    <div class="text-center">
                        <div class="relative w-28 h-28 mx-auto">
                            <svg class="w-28 h-28 transform -rotate-90">
                                <circle cx="56" cy="56" r="48" fill="none" stroke="var(--border-color)" stroke-width="8"/>
                                <circle id="health-score-circle" cx="56" cy="56" r="48" fill="none" stroke="var(--deep-blue)" stroke-width="8" stroke-linecap="round" stroke-dasharray="301.6" stroke-dashoffset="75.4"/>
                            </svg>
                            <div class="absolute inset-0 flex items-center justify-center">
                                <span id="health-score" class="text-3xl font-bold" style="color: var(--text-primary);">75</span>
                            </div>
                        </div>
                        <p class="text-sm text-muted mt-2">Daily Health Score</p>
                    </div>
                    
                    <div class="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div class="text-center p-3 rounded-lg" style="background: var(--bg-primary);">
                            <div class="text-2xl font-bold" style="color: var(--deep-blue);" id="water-today">0</div>
                            <div class="text-xs text-muted">💧 Water (glasses)</div>
                        </div>
                        <div class="text-center p-3 rounded-lg" style="background: var(--bg-primary);">
                            <div class="text-2xl font-bold" style="color: var(--emerald);" id="sleep-today">0</div>
                            <div class="text-xs text-muted">😴 Sleep (hrs)</div>
                        </div>
                        <div class="text-center p-3 rounded-lg" style="background: var(--bg-primary);">
                            <div class="text-2xl font-bold" style="color: #f59e0b;" id="steps-today">0</div>
                            <div class="text-xs text-muted">🚶 Steps</div>
                        </div>
                        <div class="text-center p-3 rounded-lg" style="background: var(--bg-primary);">
                            <div class="text-2xl font-bold" style="color: #8b5cf6;" id="calories-today">0</div>
                            <div class="text-xs text-muted">🔥 Calories</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Quick Stats -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div class="glass-card p-4 rounded-xl text-center cursor-pointer transition-all hover:scale-[1.02]" onclick="window.HealthCoachApp.showWaterTracker()">
                    <i class="fas fa-glass-water text-2xl mb-2" style="color: #3b82f6;"></i>
                    <div class="text-sm font-semibold">Water</div>
                    <div class="text-xs text-muted">Track hydration</div>
                </div>
                <div class="glass-card p-4 rounded-xl text-center cursor-pointer transition-all hover:scale-[1.02]" onclick="window.HealthCoachApp.showSleepTracker()">
                    <i class="fas fa-moon text-2xl mb-2" style="color: #8b5cf6;"></i>
                    <div class="text-sm font-semibold">Sleep</div>
                    <div class="text-xs text-muted">Log sleep hours</div>
                </div>
                <div class="glass-card p-4 rounded-xl text-center cursor-pointer transition-all hover:scale-[1.02]" onclick="window.HealthCoachApp.showActivityTracker()">
                    <i class="fas fa-walking text-2xl mb-2" style="color: #f59e0b;"></i>
                    <div class="text-sm font-semibold">Activity</div>
                    <div class="text-xs text-muted">Track steps</div>
                </div>
                <div class="glass-card p-4 rounded-xl text-center cursor-pointer transition-all hover:scale-[1.02]" onclick="window.HealthCoachApp.showMoodTracker()">
                    <i class="fas fa-smile text-2xl mb-2" style="color: #10b981;"></i>
                    <div class="text-sm font-semibold">Mood</div>
                    <div class="text-xs text-muted">Check-in</div>
                </div>
            </div>
            
            <!-- AI Insight -->
            <div id="ai-insight-container" class="glass-card rounded-xl p-4" style="border-left: 4px solid var(--deep-blue);">
                <div class="flex items-start gap-3">
                    <i class="fas fa-robot text-2xl mt-1" style="color: var(--deep-blue);"></i>
                    <div>
                        <div class="font-semibold text-sm">🤖 AI Health Coach</div>
                        <p id="ai-insight-text" class="text-sm text-muted">Loading insights...</p>
                    </div>
                </div>
            </div>
            
            <!-- Health Goals -->
            <div class="glass-card rounded-xl p-4">
                <div class="flex justify-between items-center mb-3">
                    <h3 class="font-semibold"><i class="fas fa-bullseye mr-2" style="color: var(--deep-blue);"></i>Health Goals</h3>
                    <button onclick="window.HealthCoachApp.showAddGoal()" class="text-sm text-deep-blue hover:underline">+ Add Goal</button>
                </div>
                <div id="health-goals-container" class="space-y-2">
                    <div class="text-center py-4 text-muted">Loading goals...</div>
                </div>
            </div>
            
            <!-- Medication Reminders -->
            <div class="glass-card rounded-xl p-4">
                <div class="flex justify-between items-center mb-3">
                    <h3 class="font-semibold"><i class="fas fa-pills mr-2" style="color: #ef4444;"></i>Medications & Reminders</h3>
                    <button onclick="window.HealthCoachApp.showAddMedication()" class="text-sm text-deep-blue hover:underline">+ Add</button>
                </div>
                <div id="medications-container" class="space-y-2">
                    <div class="text-center py-4 text-muted">No medications added</div>
                </div>
            </div>
            
            <!-- Weekly Progress -->
            <div class="glass-card rounded-xl p-4">
                <h3 class="font-semibold mb-3"><i class="fas fa-chart-line mr-2" style="color: var(--emerald);"></i>Weekly Progress</h3>
                <div class="h-48"><canvas id="weekly-progress-chart"></canvas></div>
            </div>
            
            <!-- Today's Logs -->
            <div class="glass-card rounded-xl p-4">
                <h3 class="font-semibold mb-3"><i class="fas fa-clock mr-2" style="color: var(--gold);"></i>Today's Logs</h3>
                <div id="today-logs-container" class="space-y-2 max-h-60 overflow-y-auto">
                    <div class="text-center py-4 text-muted">No logs for today</div>
                </div>
            </div>
        </div>
    `;
}

// ============================================
// DATA LOADING FUNCTIONS
// ============================================

export async function loadHealthCoachData() {
    if (!currentUser) return;
    
    await Promise.all([
        loadDailyLogs(),
        loadWaterIntake(),
        loadSleepLogs(),
        loadActivityLogs(),
        loadNutritionLogs(),
        loadMoodLogs(),
        loadMedications(),
        loadHealthGoals()
    ]);
    
    updateDashboard();
    generateAIInsight();
    renderGoals();
    renderMedications();
    renderTodayLogs();
    drawWeeklyChart();
}

async function loadDailyLogs() {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0,0,0,0);
        
        const q = query(
            collection(db, 'healthDailyLogs'),
            where('userId', '==', currentUser.uid),
            where('date', '>=', startOfDay),
            orderBy('date', 'desc')
        );
        const querySnapshot = await getDocs(q);
        healthDataCache.dailyLogs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('Error loading daily logs:', error);
        healthDataCache.dailyLogs = [];
    }
}

async function loadWaterIntake() {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0,0,0,0);
        
        const q = query(
            collection(db, 'healthWaterIntake'),
            where('userId', '==', currentUser.uid),
            where('date', '>=', startOfDay),
            orderBy('date', 'desc')
        );
        const querySnapshot = await getDocs(q);
        healthDataCache.waterIntake = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('Error loading water intake:', error);
        healthDataCache.waterIntake = [];
    }
}

async function loadSleepLogs() {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0,0,0,0);
        startOfDay.setDate(startOfDay.getDate() - 7);
        
        const q = query(
            collection(db, 'healthSleepLogs'),
            where('userId', '==', currentUser.uid),
            where('date', '>=', startOfDay),
            orderBy('date', 'desc')
        );
        const querySnapshot = await getDocs(q);
        healthDataCache.sleepLogs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('Error loading sleep logs:', error);
        healthDataCache.sleepLogs = [];
    }
}

async function loadActivityLogs() {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0,0,0,0);
        
        const q = query(
            collection(db, 'healthActivityLogs'),
            where('userId', '==', currentUser.uid),
            where('date', '>=', startOfDay),
            orderBy('date', 'desc')
        );
        const querySnapshot = await getDocs(q);
        healthDataCache.activityLogs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('Error loading activity logs:', error);
        healthDataCache.activityLogs = [];
    }
}

async function loadNutritionLogs() {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0,0,0,0);
        
        const q = query(
            collection(db, 'healthNutritionLogs'),
            where('userId', '==', currentUser.uid),
            where('date', '>=', startOfDay),
            orderBy('date', 'desc')
        );
        const querySnapshot = await getDocs(q);
        healthDataCache.nutritionLogs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('Error loading nutrition logs:', error);
        healthDataCache.nutritionLogs = [];
    }
}

async function loadMoodLogs() {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0,0,0,0);
        
        const q = query(
            collection(db, 'healthMoodLogs'),
            where('userId', '==', currentUser.uid),
            where('date', '>=', startOfDay),
            orderBy('date', 'desc')
        );
        const querySnapshot = await getDocs(q);
        healthDataCache.moodLogs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('Error loading mood logs:', error);
        healthDataCache.moodLogs = [];
    }
}

async function loadMedications() {
    try {
        const q = query(
            collection(db, 'healthMedications'),
            where('userId', '==', currentUser.uid),
            orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        healthDataCache.medications = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('Error loading medications:', error);
        healthDataCache.medications = [];
    }
}

async function loadHealthGoals() {
    try {
        const q = query(
            collection(db, 'healthGoals'),
            where('userId', '==', currentUser.uid),
            orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        healthDataCache.healthGoals = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('Error loading health goals:', error);
        healthDataCache.healthGoals = [];
    }
}

// ============================================
// DASHBOARD UPDATE FUNCTIONS
// ============================================

function updateDashboard() {
    const today = new Date().toDateString();
    
    // Calculate water
    const waterToday = healthDataCache.waterIntake
        .filter(w => new Date(w.date).toDateString() === today)
        .reduce((sum, w) => sum + (w.amount || 0), 0);
    document.getElementById('water-today').textContent = waterToday;
    
    // Calculate sleep
    const sleepToday = healthDataCache.sleepLogs
        .filter(s => new Date(s.date).toDateString() === today)
        .reduce((sum, s) => sum + (s.hours || 0), 0);
    document.getElementById('sleep-today').textContent = sleepToday.toFixed(1);
    
    // Calculate steps
    const stepsToday = healthDataCache.activityLogs
        .filter(a => new Date(a.date).toDateString() === today)
        .reduce((sum, a) => sum + (a.steps || 0), 0);
    document.getElementById('steps-today').textContent = stepsToday;
    
    // Calculate calories
    const caloriesToday = healthDataCache.activityLogs
        .filter(a => new Date(a.date).toDateString() === today)
        .reduce((sum, a) => sum + (a.calories || 0), 0);
    document.getElementById('calories-today').textContent = caloriesToday;
    
    // Update health score
    updateHealthScore();
}

function updateHealthScore() {
    const today = new Date().toDateString();
    const score = calculateHealthScore();
    document.getElementById('health-score').textContent = score;
    
    // Update circle
    const circle = document.getElementById('health-score-circle');
    if (circle) {
        const circumference = 301.6;
        const offset = circumference - (score / 100) * circumference;
        circle.style.strokeDashoffset = offset;
        
        // Color based on score
        if (score >= 80) circle.style.stroke = '#10b981';
        else if (score >= 60) circle.style.stroke = '#f59e0b';
        else circle.style.stroke = '#ef4444';
    }
}

function calculateHealthScore() {
    const today = new Date().toDateString();
    let score = 0;
    let total = 0;
    
    // Water (25%)
    const waterToday = healthDataCache.waterIntake
        .filter(w => new Date(w.date).toDateString() === today)
        .reduce((sum, w) => sum + (w.amount || 0), 0);
    const waterGoal = 8; // 8 glasses
    const waterScore = Math.min((waterToday / waterGoal) * 25, 25);
    score += waterScore;
    total += 25;
    
    // Sleep (25%)
    const sleepToday = healthDataCache.sleepLogs
        .filter(s => new Date(s.date).toDateString() === today)
        .reduce((sum, s) => sum + (s.hours || 0), 0);
    const sleepGoal = 8;
    const sleepScore = Math.min((sleepToday / sleepGoal) * 25, 25);
    score += sleepScore;
    total += 25;
    
    // Steps (25%)
    const stepsToday = healthDataCache.activityLogs
        .filter(a => new Date(a.date).toDateString() === today)
        .reduce((sum, a) => sum + (a.steps || 0), 0);
    const stepsGoal = 10000;
    const stepsScore = Math.min((stepsToday / stepsGoal) * 25, 25);
    score += stepsScore;
    total += 25;
    
    // Mood (25%)
    const latestMood = healthDataCache.moodLogs
        .filter(m => new Date(m.date).toDateString() === today);
    if (latestMood.length > 0) {
        const moodScore = (latestMood[0].mood / 5) * 25;
        score += moodScore;
    }
    total += 25;
    
    return Math.round((score / total) * 100);
}

// ============================================
// AI INSIGHT GENERATION
// ============================================

async function generateAIInsight() {
    const insightText = document.getElementById('ai-insight-text');
    if (!insightText) return;
    
    const insights = [];
    const today = new Date().toDateString();
    
    // Check sleep patterns
    const sleepLogs = healthDataCache.sleepLogs
        .filter(s => new Date(s.date).toDateString() !== today)
        .slice(0, 7);
    if (sleepLogs.length >= 3) {
        const avgSleep = sleepLogs.reduce((sum, s) => sum + (s.hours || 0), 0) / sleepLogs.length;
        if (avgSleep < 6) {
            insights.push("😴 You've been sleeping less than 6 hours on average. Consider improving your sleep routine.");
        } else if (avgSleep > 9) {
            insights.push("😴 You're sleeping more than 9 hours on average. While rest is important, excessive sleep might indicate underlying issues.");
        }
    }
    
    // Check water intake
    const waterLogs = healthDataCache.waterIntake
        .filter(w => new Date(w.date).toDateString() !== today)
        .slice(0, 7);
    if (waterLogs.length >= 3) {
        const avgWater = waterLogs.reduce((sum, w) => sum + (w.amount || 0), 0) / waterLogs.length;
        if (avgWater < 6) {
            insights.push("💧 Your water intake has been below recommended levels. Try to drink at least 8 glasses daily.");
        }
    }
    
    // Check activity
    const activityLogs = healthDataCache.activityLogs
        .filter(a => new Date(a.date).toDateString() !== today)
        .slice(0, 7);
    if (activityLogs.length >= 3) {
        const avgSteps = activityLogs.reduce((sum, a) => sum + (a.steps || 0), 0) / activityLogs.length;
        if (avgSteps < 5000) {
            insights.push("🚶 Your daily steps are below 5,000. Try to increase movement throughout the day.");
        } else if (avgSteps >= 10000) {
            insights.push("🏃 Great job! You've been consistently hitting your step goals. Keep it up!");
        }
    }
    
    // Check meal consistency
    const mealLogs = healthDataCache.nutritionLogs
        .filter(n => new Date(n.date).toDateString() === today);
    if (mealLogs.length < 3) {
        insights.push("🍎 You've logged fewer meals today. Regular meals help maintain energy levels.");
    }
    
    // Default insight if no specific insights
    if (insights.length === 0) {
        insights.push("🌟 You're doing great! Keep up your healthy habits. Remember to stay hydrated and get enough rest.");
    }
    
    insightText.textContent = insights[Math.floor(Math.random() * insights.length)];
}

// ============================================
// RENDER FUNCTIONS
// ============================================

function renderGoals() {
    const container = document.getElementById('health-goals-container');
    if (!container) return;
    
    if (healthDataCache.healthGoals.length === 0) {
        container.innerHTML = '<div class="text-center py-4 text-muted">No health goals set</div>';
        return;
    }
    
    container.innerHTML = healthDataCache.healthGoals.map(goal => {
        const progress = (goal.current / goal.target) * 100;
        return `
            <div class="p-3 rounded-lg" style="background: var(--bg-primary);">
                <div class="flex justify-between items-center mb-1">
                    <span class="text-sm font-semibold">${escapeHtml(goal.title)}</span>
                    <span class="text-xs text-muted">${goal.current} / ${goal.target} ${goal.unit || ''}</span>
                </div>
                <div class="h-2 rounded-full overflow-hidden" style="background: var(--border-color);">
                    <div class="h-full rounded-full transition-all" style="width: ${Math.min(progress, 100)}%; background: linear-gradient(90deg, var(--deep-blue), var(--emerald));"></div>
                </div>
                <div class="flex justify-between mt-1">
                    <span class="text-xs text-muted">${goal.category || 'Health'}</span>
                    <span class="text-xs text-muted">${Math.round(progress)}%</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderMedications() {
    const container = document.getElementById('medications-container');
    if (!container) return;
    
    if (healthDataCache.medications.length === 0) {
        container.innerHTML = '<div class="text-center py-4 text-muted">No medications added</div>';
        return;
    }
    
    const today = new Date().toDateString();
    
    container.innerHTML = healthDataCache.medications.map(med => {
        const isToday = new Date(med.date).toDateString() === today;
        return `
            <div class="flex items-center justify-between p-3 rounded-lg" style="background: var(--bg-primary);">
                <div>
                    <div class="text-sm font-semibold">${escapeHtml(med.name)}</div>
                    <div class="text-xs text-muted">${med.dosage || ''} ${med.frequency || ''}</div>
                    ${med.notes ? `<div class="text-xs text-muted mt-1">${escapeHtml(med.notes)}</div>` : ''}
                </div>
                <div class="flex items-center gap-2">
                    ${isToday ? '<span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(16,185,129,0.15); color: #10b981;">Today</span>' : ''}
                    <button onclick="window.HealthCoachApp.toggleMedication('${med.id}')" class="p-1 rounded hover:bg-gray-100">
                        <i class="fas ${med.taken ? 'fa-check-circle text-emerald-500' : 'fa-circle text-muted'}"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderTodayLogs() {
    const container = document.getElementById('today-logs-container');
    if (!container) return;
    
    const today = new Date().toDateString();
    const logs = [];
    
    // Water logs
    healthDataCache.waterIntake
        .filter(w => new Date(w.date).toDateString() === today)
        .forEach(w => {
            logs.push({ time: w.time || 'Morning', icon: '💧', text: `Drank ${w.amount} glasses of water` });
        });
    
    // Activity logs
    healthDataCache.activityLogs
        .filter(a => new Date(a.date).toDateString() === today)
        .forEach(a => {
            logs.push({ time: a.time || 'Today', icon: '🚶', text: `${a.steps} steps • ${a.calories || 0} calories` });
        });
    
    // Sleep logs
    healthDataCache.sleepLogs
        .filter(s => new Date(s.date).toDateString() === today)
        .forEach(s => {
            logs.push({ time: s.time || 'Last night', icon: '😴', text: `Slept ${s.hours} hours` });
        });
    
    // Mood logs
    healthDataCache.moodLogs
        .filter(m => new Date(m.date).toDateString() === today)
        .forEach(m => {
            const moodEmojis = ['😢', '😞', '😐', '😊', '😄'];
            logs.push({ time: m.time || 'Today', icon: moodEmojis[m.mood - 1] || '😐', text: `Mood: ${m.mood}/5 - ${escapeHtml(m.note || '')}` });
        });
    
    // Nutrition logs
    healthDataCache.nutritionLogs
        .filter(n => new Date(n.date).toDateString() === today)
        .forEach(n => {
            logs.push({ time: n.mealType || 'Meal', icon: '🍎', text: `${escapeHtml(n.food)} - ${n.calories || 0} calories` });
        });
    
    if (logs.length === 0) {
        container.innerHTML = '<div class="text-center py-4 text-muted">No logs for today</div>';
        return;
    }
    
    logs.sort((a, b) => a.time.localeCompare(b.time));
    
    container.innerHTML = logs.map(log => `
        <div class="flex items-center gap-3 p-2 rounded-lg" style="background: var(--bg-primary);">
            <span class="text-xl">${log.icon}</span>
            <div>
                <div class="text-sm">${log.text}</div>
                <div class="text-xs text-muted">${log.time}</div>
            </div>
        </div>
    `).join('');
}

function drawWeeklyChart() {
    const canvas = document.getElementById('weekly-progress-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const stepsData = [];
    const sleepData = [];
    const waterData = [];
    
    // Get last 7 days
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toDateString();
        
        const steps = healthDataCache.activityLogs
            .filter(a => new Date(a.date).toDateString() === dateStr)
            .reduce((sum, a) => sum + (a.steps || 0), 0);
        stepsData.push(Math.round(steps / 1000));
        
        const sleep = healthDataCache.sleepLogs
            .filter(s => new Date(s.date).toDateString() === dateStr)
            .reduce((sum, s) => sum + (s.hours || 0), 0);
        sleepData.push(Math.round(sleep * 10) / 10);
        
        const water = healthDataCache.waterIntake
            .filter(w => new Date(w.date).toDateString() === dateStr)
            .reduce((sum, w) => sum + (w.amount || 0), 0);
        waterData.push(water);
    }
    
    if (window.weeklyChart) window.weeklyChart.destroy();
    
    window.weeklyChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: days,
            datasets: [
                {
                    label: 'Steps (000)',
                    data: stepsData,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Sleep (hrs)',
                    data: sleepData,
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Water (glasses)',
                    data: waterData,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#1a1a2e',
                        font: { size: 10 }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'var(--border-color)' },
                    ticks: { color: 'var(--text-muted)' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: 'var(--text-muted)' }
                }
            }
        }
    });
}

// ============================================
// HEALTH COACH APP - MAIN OBJECT
// ============================================
window.HealthCoachApp = {
    // Quick Log Modal
    showQuickLog: () => {
        const modalHtml = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.HealthCoachApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <h2 class="text-xl font-bold" style="color: var(--text-primary);">Quick Log</h2>
                        <button onclick="window.HealthCoachApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <div class="p-5 space-y-3">
                        <button onclick="window.HealthCoachApp.showWaterTracker()" class="w-full p-4 rounded-xl text-left transition-all hover:shadow-md" style="background: var(--bg-primary);">
                            <i class="fas fa-glass-water mr-3" style="color: #3b82f6;"></i> Log Water Intake
                        </button>
                        <button onclick="window.HealthCoachApp.showSleepTracker()" class="w-full p-4 rounded-xl text-left transition-all hover:shadow-md" style="background: var(--bg-primary);">
                            <i class="fas fa-moon mr-3" style="color: #8b5cf6;"></i> Log Sleep
                        </button>
                        <button onclick="window.HealthCoachApp.showActivityTracker()" class="w-full p-4 rounded-xl text-left transition-all hover:shadow-md" style="background: var(--bg-primary);">
                            <i class="fas fa-walking mr-3" style="color: #f59e0b;"></i> Log Activity
                        </button>
                        <button onclick="window.HealthCoachApp.showMoodTracker()" class="w-full p-4 rounded-xl text-left transition-all hover:shadow-md" style="background: var(--bg-primary);">
                            <i class="fas fa-smile mr-3" style="color: #10b981;"></i> Log Mood
                        </button>
                        <button onclick="window.HealthCoachApp.showNutritionTracker()" class="w-full p-4 rounded-xl text-left transition-all hover:shadow-md" style="background: var(--bg-primary);">
                            <i class="fas fa-apple-alt mr-3" style="color: #ef4444;"></i> Log Nutrition
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('modal-container').innerHTML = modalHtml;
        document.getElementById('modal-container').style.pointerEvents = 'auto';
    },
    
    // Water Tracker
    showWaterTracker: () => {
        const todayWater = healthDataCache.waterIntake
            .filter(w => new Date(w.date).toDateString() === new Date().toDateString())
            .reduce((sum, w) => sum + (w.amount || 0), 0);
        
        const modalHtml = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.HealthCoachApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl font-bold" style="color: var(--text-primary);">💧 Water Tracker</h2>
                            <p class="text-xs text-muted">Goal: 8 glasses per day</p>
                        </div>
                        <button onclick="window.HealthCoachApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <div class="p-5">
                        <div class="text-center mb-6">
                            <div class="text-4xl font-bold" style="color: var(--deep-blue);">${todayWater}/8</div>
                            <div class="text-sm text-muted">glasses today</div>
                        </div>
                        
                        <div class="grid grid-cols-4 gap-2 mb-4">
                            ${[1,2,3,4,5,6,7,8].map(glass => `
                                <button onclick="window.HealthCoachApp.addWater(${glass})" 
                                        class="p-3 rounded-lg text-center transition-all hover:scale-[1.05]" 
                                        style="background: ${glass <= todayWater ? 'var(--deep-blue)' : 'var(--bg-primary)'}; color: ${glass <= todayWater ? 'white' : 'var(--text-primary)'}; border: 1px solid ${glass <= todayWater ? 'var(--deep-blue)' : 'var(--border-color)'};">
                                    ${glass}
                                </button>
                            `).join('')}
                        </div>
                        
                        <div class="flex gap-2">
                            <button onclick="window.HealthCoachApp.addWaterCustom()" class="flex-1 py-2 rounded-lg font-semibold" style="background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary);">
                                Custom Amount
                            </button>
                            <button onclick="window.HealthCoachApp.closeModal()" class="flex-1 py-2 rounded-lg font-semibold" style="background: var(--deep-blue); color: white;">
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('modal-container').innerHTML = modalHtml;
        document.getElementById('modal-container').style.pointerEvents = 'auto';
    },
    
    addWater: async (amount) => {
        try {
            await addDoc(collection(db, 'healthWaterIntake'), {
                amount: amount,
                date: new Date(),
                time: new Date().toLocaleTimeString(),
                userId: currentUser.uid,
                createdAt: serverTimestamp()
            });
            showToast(`Added ${amount} glass${amount > 1 ? 'es' : ''} of water! 💧`, 'success');
            window.HealthCoachApp.closeModal();
            await loadHealthCoachData();
        } catch (error) {
            console.error('Error adding water:', error);
            showToast('Failed to add water intake', 'error');
        }
    },
    
    addWaterCustom: () => {
        const amount = prompt('Enter number of glasses:', '1');
        if (amount && parseInt(amount) > 0) {
            window.HealthCoachApp.addWater(parseInt(amount));
        }
    },
    
    // Sleep Tracker
    showSleepTracker: () => {
        const modalHtml = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.HealthCoachApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <h2 class="text-xl font-bold" style="color: var(--text-primary);">😴 Sleep Log</h2>
                        <button onclick="window.HealthCoachApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="sleep-log-form" class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Hours of Sleep</label>
                            <input type="number" name="hours" step="0.5" min="0" max="24" required placeholder="e.g., 7.5" 
                                   class="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Sleep Quality</label>
                            <select name="quality" class="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                    style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <option value="excellent">😄 Excellent</option>
                                <option value="good">🙂 Good</option>
                                <option value="fair">😐 Fair</option>
                                <option value="poor">😞 Poor</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Notes</label>
                            <textarea name="notes" rows="2" placeholder="Any dreams, interruptions, etc." 
                                      class="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></textarea>
                        </div>
                        <button type="submit" class="w-full py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                            <i class="fas fa-save mr-1"></i> Log Sleep
                        </button>
                    </form>
                </div>
            </div>
        `;
        document.getElementById('modal-container').innerHTML = modalHtml;
        document.getElementById('modal-container').style.pointerEvents = 'auto';
        
        document.getElementById('sleep-log-form').onsubmit = async (e) => {
            e.preventDefault();
            const data = new FormData(e.target);
            try {
                await addDoc(collection(db, 'healthSleepLogs'), {
                    hours: parseFloat(data.get('hours')),
                    quality: data.get('quality'),
                    notes: data.get('notes') || '',
                    date: new Date(),
                    time: new Date().toLocaleTimeString(),
                    userId: currentUser.uid,
                    createdAt: serverTimestamp()
                });
                showToast('Sleep logged! 😴', 'success');
                window.HealthCoachApp.closeModal();
                await loadHealthCoachData();
            } catch (error) {
                console.error('Error logging sleep:', error);
                showToast('Failed to log sleep', 'error');
            }
        };
    },
    
    // Activity Tracker
    showActivityTracker: () => {
        const modalHtml = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.HealthCoachApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <h2 class="text-xl font-bold" style="color: var(--text-primary);">🚶 Activity Log</h2>
                        <button onclick="window.HealthCoachApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="activity-log-form" class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Steps</label>
                            <input type="number" name="steps" min="0" required placeholder="e.g., 5000" 
                                   class="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Activity Type</label>
                            <select name="activityType" class="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                    style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <option value="walking">Walking</option>
                                <option value="running">Running</option>
                                <option value="cycling">Cycling</option>
                                <option value="swimming">Swimming</option>
                                <option value="gym">Gym Workout</option>
                                <option value="yoga">Yoga</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Calories Burned (optional)</label>
                            <input type="number" name="calories" min="0" placeholder="e.g., 200" 
                                   class="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        <button type="submit" class="w-full py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                            <i class="fas fa-save mr-1"></i> Log Activity
                        </button>
                    </form>
                </div>
            </div>
        `;
        document.getElementById('modal-container').innerHTML = modalHtml;
        document.getElementById('modal-container').style.pointerEvents = 'auto';
        
        document.getElementById('activity-log-form').onsubmit = async (e) => {
            e.preventDefault();
            const data = new FormData(e.target);
            try {
                await addDoc(collection(db, 'healthActivityLogs'), {
                    steps: parseInt(data.get('steps')),
                    activityType: data.get('activityType'),
                    calories: parseInt(data.get('calories')) || 0,
                    date: new Date(),
                    time: new Date().toLocaleTimeString(),
                    userId: currentUser.uid,
                    createdAt: serverTimestamp()
                });
                showToast('Activity logged! 🚶', 'success');
                window.HealthCoachApp.closeModal();
                await loadHealthCoachData();
            } catch (error) {
                console.error('Error logging activity:', error);
                showToast('Failed to log activity', 'error');
            }
        };
    },
    
    // Mood Tracker
    showMoodTracker: () => {
        const modalHtml = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.HealthCoachApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <h2 class="text-xl font-bold" style="color: var(--text-primary);">😊 Mood Check-in</h2>
                        <button onclick="window.HealthCoachApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="mood-log-form" class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">How are you feeling?</label>
                            <div class="grid grid-cols-5 gap-2">
                                ${[1,2,3,4,5].map(level => `
                                    <button type="button" onclick="document.getElementById('mood-level').value = ${level}; document.querySelectorAll('.mood-btn').forEach(b => b.style.background = 'var(--bg-primary)'); this.style.background = 'var(--deep-blue)'; this.style.color = 'white';" 
                                            class="mood-btn p-3 rounded-lg text-center transition-all hover:scale-[1.05]" 
                                            style="background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary);">
                                        ${['😢','😞','😐','😊','😄'][level-1]}
                                    </button>
                                `).join('')}
                            </div>
                            <input type="hidden" id="mood-level" name="mood" value="3">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Note (optional)</label>
                            <textarea name="note" rows="2" placeholder="What's on your mind?" 
                                      class="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></textarea>
                        </div>
                        <button type="submit" class="w-full py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                            <i class="fas fa-save mr-1"></i> Log Mood
                        </button>
                    </form>
                </div>
            </div>
        `;
        document.getElementById('modal-container').innerHTML = modalHtml;
        document.getElementById('modal-container').style.pointerEvents = 'auto';
        
        document.getElementById('mood-log-form').onsubmit = async (e) => {
            e.preventDefault();
            const data = new FormData(e.target);
            try {
                await addDoc(collection(db, 'healthMoodLogs'), {
                    mood: parseInt(data.get('mood')),
                    note: data.get('note') || '',
                    date: new Date(),
                    time: new Date().toLocaleTimeString(),
                    userId: currentUser.uid,
                    createdAt: serverTimestamp()
                });
                showToast('Mood logged! 😊', 'success');
                window.HealthCoachApp.closeModal();
                await loadHealthCoachData();
            } catch (error) {
                console.error('Error logging mood:', error);
                showToast('Failed to log mood', 'error');
            }
        };
    },
    
    // Nutrition Tracker
    showNutritionTracker: () => {
        const modalHtml = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.HealthCoachApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <h2 class="text-xl font-bold" style="color: var(--text-primary);">🍎 Nutrition Log</h2>
                        <button onclick="window.HealthCoachApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="nutrition-log-form" class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Meal Type</label>
                            <select name="mealType" class="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                    style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <option value="breakfast">Breakfast</option>
                                <option value="lunch">Lunch</option>
                                <option value="dinner">Dinner</option>
                                <option value="snack">Snack</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Food</label>
                            <input type="text" name="food" required placeholder="What did you eat?" 
                                   class="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Calories</label>
                                <input type="number" name="calories" min="0" placeholder="e.g., 350" 
                                       class="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Rating</label>
                                <select name="rating" class="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                        style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    <option value="5">⭐⭐⭐⭐⭐ Excellent</option>
                                    <option value="4">⭐⭐⭐⭐ Good</option>
                                    <option value="3">⭐⭐⭐ Fair</option>
                                    <option value="2">⭐⭐ Poor</option>
                                    <option value="1">⭐ Bad</option>
                                </select>
                            </div>
                        </div>
                        <button type="submit" class="w-full py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                            <i class="fas fa-save mr-1"></i> Log Meal
                        </button>
                    </form>
                </div>
            </div>
        `;
        document.getElementById('modal-container').innerHTML = modalHtml;
        document.getElementById('modal-container').style.pointerEvents = 'auto';
        
        document.getElementById('nutrition-log-form').onsubmit = async (e) => {
            e.preventDefault();
            const data = new FormData(e.target);
            try {
                await addDoc(collection(db, 'healthNutritionLogs'), {
                    mealType: data.get('mealType'),
                    food: data.get('food'),
                    calories: parseInt(data.get('calories')) || 0,
                    rating: parseInt(data.get('rating')) || 3,
                    date: new Date(),
                    time: new Date().toLocaleTimeString(),
                    userId: currentUser.uid,
                    createdAt: serverTimestamp()
                });
                showToast('Meal logged! 🍎', 'success');
                window.HealthCoachApp.closeModal();
                await loadHealthCoachData();
            } catch (error) {
                console.error('Error logging nutrition:', error);
                showToast('Failed to log meal', 'error');
            }
        };
    },
    
    // Add Health Goal
    showAddGoal: () => {
        const modalHtml = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.HealthCoachApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <h2 class="text-xl font-bold" style="color: var(--text-primary);">🎯 New Health Goal</h2>
                        <button onclick="window.HealthCoachApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="add-goal-form" class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Goal Title</label>
                            <input type="text" name="title" required placeholder="e.g., Drink 8 glasses of water daily" 
                                   class="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Target</label>
                                <input type="number" name="target" step="0.1" required placeholder="e.g., 8" 
                                       class="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Unit</label>
                                <input type="text" name="unit" placeholder="e.g., glasses, hours, kg" 
                                       class="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Category</label>
                            <select name="category" class="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                    style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <option value="water">💧 Water</option>
                                <option value="sleep">😴 Sleep</option>
                                <option value="activity">🚶 Activity</option>
                                <option value="nutrition">🍎 Nutrition</option>
                                <option value="weight">⚖️ Weight</option>
                                <option value="mental">🧠 Mental Wellness</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Deadline</label>
                            <input type="date" name="deadline" 
                                   class="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        <button type="submit" class="w-full py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                            <i class="fas fa-bullseye mr-1"></i> Create Goal
                        </button>
                    </form>
                </div>
            </div>
        `;
        document.getElementById('modal-container').innerHTML = modalHtml;
        document.getElementById('modal-container').style.pointerEvents = 'auto';
        
        document.getElementById('add-goal-form').onsubmit = async (e) => {
            e.preventDefault();
            const data = new FormData(e.target);
            try {
                await addDoc(collection(db, 'healthGoals'), {
                    title: data.get('title'),
                    target: parseFloat(data.get('target')),
                    current: 0,
                    unit: data.get('unit') || '',
                    category: data.get('category'),
                    deadline: data.get('deadline') ? new Date(data.get('deadline')) : null,
                    status: 'active',
                    userId: currentUser.uid,
                    createdAt: serverTimestamp()
                });
                showToast('Health goal created! 🎯', 'success');
                window.HealthCoachApp.closeModal();
                await loadHealthCoachData();
            } catch (error) {
                console.error('Error creating goal:', error);
                showToast('Failed to create goal', 'error');
            }
        };
    },
    
    // Add Medication
    showAddMedication: () => {
        const modalHtml = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.HealthCoachApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <h2 class="text-xl font-bold" style="color: var(--text-primary);">💊 Add Medication</h2>
                        <button onclick="window.HealthCoachApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="add-medication-form" class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Medication Name</label>
                            <input type="text" name="name" required placeholder="e.g., Vitamin D" 
                                   class="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Dosage</label>
                            <input type="text" name="dosage" placeholder="e.g., 1000 IU" 
                                   class="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Frequency</label>
                            <input type="text" name="frequency" placeholder="e.g., Daily, Twice daily" 
                                   class="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Notes</label>
                            <textarea name="notes" rows="2" placeholder="Additional instructions..." 
                                      class="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></textarea>
                        </div>
                        <button type="submit" class="w-full py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                            <i class="fas fa-pills mr-1"></i> Add Medication
                        </button>
                    </form>
                </div>
            </div>
        `;
        document.getElementById('modal-container').innerHTML = modalHtml;
        document.getElementById('modal-container').style.pointerEvents = 'auto';
        
        document.getElementById('add-medication-form').onsubmit = async (e) => {
            e.preventDefault();
            const data = new FormData(e.target);
            try {
                await addDoc(collection(db, 'healthMedications'), {
                    name: data.get('name'),
                    dosage: data.get('dosage') || '',
                    frequency: data.get('frequency') || '',
                    notes: data.get('notes') || '',
                    taken: false,
                    date: new Date(),
                    userId: currentUser.uid,
                    createdAt: serverTimestamp()
                });
                showToast('Medication added! 💊', 'success');
                window.HealthCoachApp.closeModal();
                await loadHealthCoachData();
            } catch (error) {
                console.error('Error adding medication:', error);
                showToast('Failed to add medication', 'error');
            }
        };
    },
    
    toggleMedication: async (medicationId) => {
        try {
            const med = healthDataCache.medications.find(m => m.id === medicationId);
            if (!med) return;
            
            await updateDoc(doc(db, 'healthMedications', medicationId), {
                taken: !med.taken,
                updatedAt: serverTimestamp()
            });
            showToast(med.taken ? 'Medication unchecked' : 'Medication taken! 💊', 'success');
            await loadHealthCoachData();
        } catch (error) {
            console.error('Error toggling medication:', error);
            showToast('Failed to update medication', 'error');
        }
    },
    
    getAIInsight: async () => {
        const insightText = document.getElementById('ai-insight-text');
        if (!insightText) return;
        
        insightText.textContent = '🤔 Analyzing your health data...';
        
        await generateAIInsight();
        showToast('AI insight generated! 🤖', 'success');
    },
    
    closeModal: () => {
        const modalContainer = document.getElementById('modal-container');
        if (modalContainer) {
            modalContainer.innerHTML = '';
            modalContainer.style.pointerEvents = 'none';
        }
    }
};

// ============================================
// EXPORTS
// ============================================