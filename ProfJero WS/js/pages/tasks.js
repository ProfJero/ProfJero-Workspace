// js/pages/tasks.js
import { db, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, serverTimestamp } from '../firebase-config.js';
import { showToast, escapeHtml, formatDate, timeAgo } from '../utils/helpers.js';

let currentUser = null;
let currentView = 'today';
let currentLayout = localStorage.getItem('taskLayout') || 'list';
let currentFilter = 'all';
let tasksCache = [];
let reminderInterval = null;

// Custom sound setup
let notificationSound = null;

function initNotificationSound() {
    if (!notificationSound) {
        notificationSound = {
            play: () => {
                try {
                    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    const oscillator = audioContext.createOscillator();
                    const gainNode = audioContext.createGain();
                    oscillator.connect(gainNode);
                    gainNode.connect(audioContext.destination);
                    oscillator.frequency.value = 880;
                    gainNode.gain.value = 0.3;
                    oscillator.start();
                    gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.5);
                    oscillator.stop(audioContext.currentTime + 0.5);
                    setTimeout(() => audioContext.close(), 1000);
                } catch(e) { console.log('Audio not supported'); }
            }
        };
    }
}

export async function renderTasksPage(user) {
    currentUser = user;
    initNotificationSound();
    
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
    
    return `
        <div class="space-y-6 animate-fade-in-up">
            <!-- Header -->
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 class="text-3xl font-bold" style="color: var(--text-primary);">Schedule Manager</h1>
                    <p class="text-muted mt-1">Plan your daily and weekly schedule with reminders</p>
                </div>
                <div class="flex gap-3">
                    <button id="add-schedule-btn" class="px-5 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                        <i class="fas fa-plus"></i>
                        <span>Add Schedule</span>
                    </button>
                    <button id="reminder-settings-btn" class="px-5 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all hover:shadow-md" style="background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary);">
                        <i class="fas fa-bell"></i>
                        <span>Reminders</span>
                    </button>
                </div>
            </div>
            
            <!-- Stats -->
            <div class="grid grid-cols-2 md:grid-cols-6 gap-3" id="task-stats">
                <div class="glass-card p-3 rounded-xl text-center cursor-pointer transition-all hover:scale-[1.02]" data-view="today">
                    <div class="text-xl font-bold" id="stat-today" style="color: var(--deep-blue);">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-sun"></i> Today</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center cursor-pointer transition-all hover:scale-[1.02]" data-view="tomorrow">
                    <div class="text-xl font-bold" id="stat-tomorrow" style="color: var(--gold);">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-calendar-day"></i> Tomorrow</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center cursor-pointer transition-all hover:scale-[1.02]" data-view="week">
                    <div class="text-xl font-bold" id="stat-week" style="color: var(--emerald);">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-calendar-week"></i> This Week</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center cursor-pointer transition-all hover:scale-[1.02]" data-view="upcoming">
                    <div class="text-xl font-bold" id="stat-upcoming" style="color: #8b5cf6;">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-calendar-alt"></i> Upcoming</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center">
                    <div class="text-xl font-bold" id="stat-completed" style="color: #10b981;">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-check-circle"></i> Done</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center">
                    <div class="text-xl font-bold" id="stat-overdue" style="color: #ef4444;">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-exclamation-triangle"></i> Overdue</div>
                </div>
            </div>
            
            <!-- View Tabs -->
            <div class="flex flex-wrap gap-2 border-b border-custom pb-2">
                <button class="view-tab px-4 py-2 rounded-lg transition-all" data-view="today">
                    <i class="fas fa-sun mr-1"></i> Today's Schedule
                </button>
                <button class="view-tab px-4 py-2 rounded-lg transition-all" data-view="tomorrow">
                    <i class="fas fa-calendar-day mr-1"></i> Tomorrow
                </button>
                <button class="view-tab px-4 py-2 rounded-lg transition-all" data-view="week">
                    <i class="fas fa-calendar-week mr-1"></i> This Week
                </button>
                <button class="view-tab px-4 py-2 rounded-lg transition-all" data-view="upcoming">
                    <i class="fas fa-calendar-alt mr-1"></i> Upcoming
                </button>
                <button class="view-tab px-4 py-2 rounded-lg transition-all" data-view="all">
                    <i class="fas fa-list mr-1"></i> All Schedules
                </button>
            </div>
            
            <!-- Layout Toggle & Filters -->
            <div class="glass-card rounded-xl p-4">
                <div class="flex flex-col md:flex-row gap-3">
                    <div class="flex-1 relative">
                        <i class="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-muted"></i>
                        <input type="text" id="task-search" placeholder="Search schedules..." 
                               class="w-full pl-10 pr-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all" 
                               style="background: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);">
                    </div>
                    
                    <select id="task-filter" class="px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all" style="background: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);">
                        <option value="all">All Categories</option>
                        <option value="class"><i class="fas fa-chalkboard-user"></i> Class/Lecture</option>
                        <option value="assignment"><i class="fas fa-book"></i> Assignment</option>
                        <option value="quiz"><i class="fas fa-pen-ruler"></i> Quiz/Exam</option>
                        <option value="meeting"><i class="fas fa-users"></i> Meeting</option>
                        <option value="study"><i class="fas fa-clock"></i> Study Time</option>
                        <option value="personal"><i class="fas fa-heart"></i> Personal</option>
                        <option value="other"><i class="fas fa-ellipsis-h"></i> Other</option>
                    </select>
                    
                    <select id="task-sort" class="px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all" style="background: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);">
                        <option value="dueDate"><i class="fas fa-calendar"></i> Sort by Time</option>
                        <option value="priority"><i class="fas fa-chart-line"></i> Sort by Priority</option>
                        <option value="createdAt"><i class="fas fa-clock"></i> Sort by Created</option>
                    </select>
                    
                    <div class="flex gap-2">
                        <button id="view-list" class="px-4 py-2 rounded-lg transition-all" title="List View">
                            <i class="fas fa-list"></i>
                        </button>
                        <button id="view-grid" class="px-4 py-2 rounded-lg transition-all" title="Grid View">
                            <i class="fas fa-th-large"></i>
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- Schedule Container -->
            <div id="tasks-container" class="space-y-4">
                <div class="text-center py-12">
                    <div class="animate-pulse"><i class="fas fa-spinner fa-spin mr-2 text-muted"></i> Loading schedule...</div>
                </div>
            </div>
        </div>
    `;
}

export async function loadTasksData() {
    if (!currentUser) return;
    await loadTasks();
    setupEventListeners();
    startReminderChecker();
}

async function loadTasks() {
    const container = document.getElementById('tasks-container');
    if (!container) return;
    
    try {
        const q = query(collection(db, 'tasks'), where('userId', '==', currentUser.uid), orderBy('dueDate', 'asc'));
        const querySnapshot = await getDocs(q);
        
        tasksCache = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate() || new Date(),
            dueDate: doc.data().dueDate?.toDate() || null,
            reminderTime: doc.data().reminderTime?.toDate() || null,
            isRecurring: doc.data().isRecurring || false,
            recurringPattern: doc.data().recurringPattern || null
        }));
        
        updateStats();
        filterAndRenderTasks();
    } catch (error) {
        console.error('Error loading tasks:', error);
        container.innerHTML = '<div class="text-center py-12 text-red-500">Failed to load schedule</div>';
    }
}

function updateStats() {
    const now = new Date();
    const today = now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekFromNow = new Date();
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    
    const todayTasks = tasksCache.filter(t => t.dueDate && t.dueDate.toDateString() === today && t.status !== 'done');
    const tomorrowTasks = tasksCache.filter(t => t.dueDate && t.dueDate.toDateString() === tomorrow.toDateString() && t.status !== 'done');
    const weekTasks = tasksCache.filter(t => t.dueDate && t.dueDate <= weekFromNow && t.dueDate >= now && t.status !== 'done');
    const upcomingTasks = tasksCache.filter(t => t.dueDate && t.dueDate > weekFromNow && t.status !== 'done');
    const completedTasks = tasksCache.filter(t => t.status === 'done');
    const overdueTasks = tasksCache.filter(t => t.status !== 'done' && t.dueDate && t.dueDate < now);
    
    const statToday = document.getElementById('stat-today');
    const statTomorrow = document.getElementById('stat-tomorrow');
    const statWeek = document.getElementById('stat-week');
    const statUpcoming = document.getElementById('stat-upcoming');
    const statCompleted = document.getElementById('stat-completed');
    const statOverdue = document.getElementById('stat-overdue');
    
    if (statToday) statToday.textContent = todayTasks.length;
    if (statTomorrow) statTomorrow.textContent = tomorrowTasks.length;
    if (statWeek) statWeek.textContent = weekTasks.length;
    if (statUpcoming) statUpcoming.textContent = upcomingTasks.length;
    if (statCompleted) statCompleted.textContent = completedTasks.length;
    if (statOverdue) statOverdue.textContent = overdueTasks.length;
    
    updateViewTabStyles();
}

function updateViewTabStyles() {
    document.querySelectorAll('.view-tab').forEach(tab => {
        if (tab.dataset.view === currentView) {
            tab.style.background = 'linear-gradient(135deg, var(--deep-blue), var(--emerald))';
            tab.style.color = 'white';
        } else {
            tab.style.background = 'var(--bg-secondary)';
            tab.style.color = 'var(--text-muted)';
        }
    });
}

function updateLayoutButtons() {
    const listBtn = document.getElementById('view-list');
    const gridBtn = document.getElementById('view-grid');
    if (listBtn && gridBtn) {
        if (currentLayout === 'list') {
            listBtn.style.background = 'linear-gradient(135deg, var(--deep-blue), var(--emerald))';
            listBtn.style.color = 'white';
            gridBtn.style.background = 'var(--bg-secondary)';
            gridBtn.style.color = 'var(--text-muted)';
        } else {
            gridBtn.style.background = 'linear-gradient(135deg, var(--deep-blue), var(--emerald))';
            gridBtn.style.color = 'white';
            listBtn.style.background = 'var(--bg-secondary)';
            listBtn.style.color = 'var(--text-muted)';
        }
    }
}

function filterAndRenderTasks() {
    let filtered = [...tasksCache];
    const now = new Date();
    const today = now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekFromNow = new Date();
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    
    switch(currentView) {
        case 'today':
            filtered = filtered.filter(t => t.dueDate && t.dueDate.toDateString() === today);
            break;
        case 'tomorrow':
            filtered = filtered.filter(t => t.dueDate && t.dueDate.toDateString() === tomorrow.toDateString());
            break;
        case 'week':
            filtered = filtered.filter(t => t.dueDate && t.dueDate <= weekFromNow && t.dueDate >= now);
            break;
        case 'upcoming':
            filtered = filtered.filter(t => t.dueDate && t.dueDate > weekFromNow);
            break;
        case 'all':
            break;
    }
    
    const searchInput = document.getElementById('task-search');
    if (searchInput && searchInput.value) {
        const query = searchInput.value.toLowerCase();
        filtered = filtered.filter(t => t.title?.toLowerCase().includes(query) || t.description?.toLowerCase().includes(query));
    }
    
    const filterSelect = document.getElementById('task-filter');
    if (filterSelect && filterSelect.value !== 'all') {
        filtered = filtered.filter(t => t.category === filterSelect.value);
    }
    
    const sortSelect = document.getElementById('task-sort');
    const sortBy = sortSelect ? sortSelect.value : 'dueDate';
    
    filtered.sort((a, b) => {
        if (sortBy === 'dueDate') {
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return a.dueDate - b.dueDate;
        }
        if (sortBy === 'priority') {
            const order = { high: 0, medium: 1, low: 2 };
            return (order[a.priority] || 1) - (order[b.priority] || 1);
        }
        return b.createdAt - a.createdAt;
    });
    
    renderSchedule(filtered);
}

function renderSchedule(tasks) {
    const container = document.getElementById('tasks-container');
    if (!container) return;
    
    if (tasks.length === 0) {
        container.innerHTML = `
            <div class="glass-card rounded-xl p-12 text-center">
                <i class="fas fa-calendar-check text-6xl mb-4 text-muted"></i>
                <h3 class="text-xl font-semibold mb-2" style="color: var(--text-primary);">No schedules</h3>
                <p class="text-muted">Create your first schedule to get organized!</p>
                <button id="empty-state-add-btn" class="mt-4 px-5 py-2 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                    <i class="fas fa-plus mr-1"></i> Add Schedule
                </button>
            </div>
        `;
        const emptyStateBtn = document.getElementById('empty-state-add-btn');
        if (emptyStateBtn) {
            emptyStateBtn.onclick = () => window.TasksApp.showAddModal();
        }
        return;
    }
    
    if (currentLayout === 'grid') {
        container.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';
        container.innerHTML = tasks.map(task => createScheduleCardGrid(task)).join('');
    } else {
        const grouped = {};
        tasks.forEach(task => {
            if (task.dueDate) {
                const dateKey = task.dueDate.toDateString();
                if (!grouped[dateKey]) grouped[dateKey] = [];
                grouped[dateKey].push(task);
            }
        });
        
        container.className = 'space-y-4';
        container.innerHTML = Object.entries(grouped).map(([date, dateTasks]) => `
            <div class="space-y-2">
                <div class="flex items-center gap-2 mb-2">
                    <div class="w-1 h-6 rounded-full" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald));"></div>
                    <h3 class="font-semibold text-lg" style="color: var(--text-primary);">${formatDateHeader(date)}</h3>
                    <span class="text-xs text-muted">${dateTasks.length} item${dateTasks.length !== 1 ? 's' : ''}</span>
                </div>
                <div class="space-y-3">
                    ${dateTasks.map(task => createScheduleCardList(task)).join('')}
                </div>
            </div>
        `).join('');
    }
}

function formatDateHeader(dateStr) {
    const date = new Date(dateStr);
    const today = new Date().toDateString();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (dateStr === today) return '<i class="fas fa-sun mr-2"></i> Today';
    if (dateStr === tomorrow.toDateString()) return '<i class="fas fa-sunrise mr-2"></i> Tomorrow';
    return `<i class="fas fa-calendar-day mr-2"></i> ${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`;
}

function createScheduleCardList(task) {
    const categoryIcons = {
        class: 'fa-chalkboard-user',
        assignment: 'fa-book',
        quiz: 'fa-pen-ruler',
        meeting: 'fa-users',
        study: 'fa-clock',
        personal: 'fa-heart',
        other: 'fa-ellipsis-h'
    };
    
    const priorityConfig = {
        high: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', label: 'High', icon: 'fa-arrow-up' },
        medium: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', label: 'Medium', icon: 'fa-minus' },
        low: { color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', label: 'Low', icon: 'fa-arrow-down' }
    };
    
    const priority = task.priority || 'medium';
    const config = priorityConfig[priority];
    const isOverdue = task.dueDate && task.dueDate < new Date() && task.status !== 'done';
    const isCompleted = task.status === 'done';
    const hasReminder = task.reminderTime && new Date(task.reminderTime) > new Date();
    
    return `
        <div class="glass-card rounded-xl p-4 transition-all hover:shadow-lg ${isCompleted ? 'opacity-60' : ''}">
            <div class="flex items-start gap-3">
                <input type="checkbox" ${isCompleted ? 'checked' : ''} 
                       onchange="window.TasksApp.toggleStatus('${task.id}', this.checked)" 
                       class="mt-1 w-5 h-5 rounded cursor-pointer transition-all" style="accent-color: var(--emerald);">
                
                <div class="flex-1">
                    <div class="flex flex-wrap items-center gap-2 mb-2">
                        <i class="fas ${categoryIcons[task.category] || 'fa-tasks'}" style="color: var(--text-muted);"></i>
                        <h3 class="font-semibold ${isCompleted ? 'line-through' : ''}" style="color: var(--text-primary);">
                            ${escapeHtml(task.title)}
                        </h3>
                        <span class="text-xs px-2 py-0.5 rounded-full" style="background: ${config.bg}; color: ${config.color};">
                            <i class="fas ${config.icon} text-xs mr-1"></i>${config.label}
                        </span>
                        ${hasReminder ? '<span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6;"><i class="fas fa-bell mr-1"></i>Reminder</span>' : ''}
                        ${isOverdue ? '<span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(239, 68, 68, 0.15); color: #ef4444;"><i class="fas fa-exclamation-triangle mr-1"></i>Overdue</span>' : ''}
                        ${task.isRecurring ? '<span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(139, 92, 246, 0.15); color: #8b5cf6;"><i class="fas fa-sync-alt mr-1"></i>Recurring</span>' : ''}
                    </div>
                    
                    ${task.description ? `<p class="text-sm text-muted mb-2 ${isCompleted ? 'line-through' : ''}">${escapeHtml(task.description)}</p>` : ''}
                    
                    <div class="flex flex-wrap items-center gap-4 text-xs">
                        ${task.dueDate ? `
                            <span class="flex items-center gap-1" style="color: var(--text-muted);">
                                <i class="fas fa-clock"></i>
                                <span ${isOverdue ? 'style="color: #ef4444;"' : ''}>${formatTimeDisplay(task.dueDate)}</span>
                            </span>
                        ` : ''}
                        ${task.reminderTime ? `
                            <span class="flex items-center gap-1" style="color: var(--text-muted);">
                                <i class="fas fa-bell"></i>
                                Reminder: ${formatTimeDisplay(task.reminderTime)}
                            </span>
                        ` : ''}
                    </div>
                </div>
                
                <div class="flex gap-1">
                    <button onclick="window.TasksApp.edit('${task.id}')" class="p-2 rounded-lg transition-all hover:bg-gray-100 dark:hover:bg-gray-700">
                        <i class="fas fa-edit" style="color: var(--text-muted);"></i>
                    </button>
                    <button onclick="window.TasksApp.delete('${task.id}')" class="p-2 rounded-lg transition-all hover:bg-red-100 dark:hover:bg-red-900/20">
                        <i class="fas fa-trash" style="color: #ef4444;"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

function createScheduleCardGrid(task) {
    const categoryIcons = {
        class: 'fa-chalkboard-user',
        assignment: 'fa-book',
        quiz: 'fa-pen-ruler',
        meeting: 'fa-users',
        study: 'fa-clock',
        personal: 'fa-heart',
        other: 'fa-ellipsis-h'
    };
    
    const priorityConfig = {
        high: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', label: 'High', icon: 'fa-arrow-up' },
        medium: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', label: 'Medium', icon: 'fa-minus' },
        low: { color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', label: 'Low', icon: 'fa-arrow-down' }
    };
    
    const priority = task.priority || 'medium';
    const config = priorityConfig[priority];
    const isOverdue = task.dueDate && task.dueDate < new Date() && task.status !== 'done';
    const isCompleted = task.status === 'done';
    const hasReminder = task.reminderTime && new Date(task.reminderTime) > new Date();
    
    return `
        <div class="glass-card rounded-xl p-4 transition-all hover:shadow-lg ${isCompleted ? 'opacity-60' : ''}">
            <div class="flex justify-between items-start mb-3">
                <input type="checkbox" ${isCompleted ? 'checked' : ''} 
                       onchange="window.TasksApp.toggleStatus('${task.id}', this.checked)" 
                       class="w-5 h-5 rounded cursor-pointer transition-all" style="accent-color: var(--emerald);">
                <div class="flex gap-1">
                    <button onclick="window.TasksApp.edit('${task.id}')" class="p-1 rounded-lg transition-all hover:bg-gray-100 dark:hover:bg-gray-700">
                        <i class="fas fa-edit" style="color: var(--text-muted); font-size: 12px;"></i>
                    </button>
                    <button onclick="window.TasksApp.delete('${task.id}')" class="p-1 rounded-lg transition-all hover:bg-red-100 dark:hover:bg-red-900/20">
                        <i class="fas fa-trash" style="color: #ef4444; font-size: 12px;"></i>
                    </button>
                </div>
            </div>
            
            <div class="mb-3">
                <div class="flex items-center gap-2 mb-2">
                    <i class="fas ${categoryIcons[task.category] || 'fa-tasks'}" style="color: var(--text-muted);"></i>
                    <h3 class="font-semibold ${isCompleted ? 'line-through' : ''}" style="color: var(--text-primary);">
                        ${escapeHtml(task.title)}
                    </h3>
                </div>
                ${task.description ? `<p class="text-sm text-muted mb-2 line-clamp-2">${escapeHtml(task.description)}</p>` : ''}
            </div>
            
            <div class="flex flex-wrap gap-2 mb-2">
                <span class="text-xs px-2 py-0.5 rounded-full" style="background: ${config.bg}; color: ${config.color};">
                    <i class="fas ${config.icon} text-xs mr-1"></i>${config.label}
                </span>
                ${hasReminder ? '<span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6;"><i class="fas fa-bell mr-1"></i>Reminder</span>' : ''}
                ${isOverdue ? '<span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(239, 68, 68, 0.15); color: #ef4444;"><i class="fas fa-exclamation-triangle mr-1"></i>Overdue</span>' : ''}
                ${task.isRecurring ? '<span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(139, 92, 246, 0.15); color: #8b5cf6;"><i class="fas fa-sync-alt mr-1"></i>Repeat</span>' : ''}
            </div>
            
            <div class="flex flex-col gap-1 text-xs">
                ${task.dueDate ? `
                    <span class="flex items-center gap-1" style="color: var(--text-muted);">
                        <i class="fas fa-calendar"></i>
                        <span>${formatDate(task.dueDate)}</span>
                    </span>
                    <span class="flex items-center gap-1" style="color: var(--text-muted);">
                        <i class="fas fa-clock"></i>
                        <span ${isOverdue ? 'style="color: #ef4444;"' : ''}>${formatTimeDisplay(task.dueDate)}</span>
                    </span>
                ` : ''}
            </div>
        </div>
    `;
}

function formatTimeDisplay(date) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Professional button loading effect helper
function setButtonLoading(button, isLoading, originalText = null, originalIcon = null) {
    if (!button) return;
    
    if (isLoading) {
        if (!button.getAttribute('data-original-text')) {
            button.setAttribute('data-original-text', originalText || button.innerText || 'Submit');
            const iconElement = button.querySelector('i');
            if (iconElement) {
                button.setAttribute('data-original-icon', iconElement.className);
            }
        }
        
        button.disabled = true;
        button.style.opacity = '0.7';
        button.style.cursor = 'not-allowed';
        
        button.innerHTML = `
            <div class="flex items-center justify-center gap-2">
                <div class="loading-spinner" style="width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: white; animation: spin 0.6s linear infinite;"></div>
                <span>Processing...</span>
            </div>
        `;
    } else {
        button.disabled = false;
        button.style.opacity = '1';
        button.style.cursor = 'pointer';
        
        const originalTextContent = button.getAttribute('data-original-text');
        const originalIconClass = button.getAttribute('data-original-icon');
        
        if (originalIconClass && originalTextContent) {
            button.innerHTML = `<i class="${originalIconClass} mr-1"></i><span>${originalTextContent}</span>`;
        } else if (originalTextContent) {
            button.innerHTML = `<span>${originalTextContent}</span>`;
        } else {
            button.innerHTML = '<span>Submit</span>';
        }
    }
}

function setupEventListeners() {
    document.querySelectorAll('.view-tab').forEach(tab => {
        tab.addEventListener('click', async () => {
            const view = tab.dataset.view;
            if (view === currentView) return;
            
            const originalText = tab.innerHTML;
            tab.innerHTML = '<div class="loading-spinner w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>';
            tab.disabled = true;
            
            currentView = view;
            updateViewTabStyles();
            filterAndRenderTasks();
            
            tab.innerHTML = originalText;
            tab.disabled = false;
        });
    });
    
    document.querySelectorAll('[data-view]').forEach(stat => {
        stat.addEventListener('click', () => {
            const view = stat.dataset.view;
            const tab = document.querySelector(`.view-tab[data-view="${view}"]`);
            if (tab) tab.click();
        });
    });
    
    const searchInput = document.getElementById('task-search');
    if (searchInput) searchInput.addEventListener('input', () => filterAndRenderTasks());
    
    const filterSelect = document.getElementById('task-filter');
    if (filterSelect) filterSelect.addEventListener('change', () => filterAndRenderTasks());
    
    const sortSelect = document.getElementById('task-sort');
    if (sortSelect) sortSelect.addEventListener('change', () => filterAndRenderTasks());
    
    const listBtn = document.getElementById('view-list');
    const gridBtn = document.getElementById('view-grid');
    if (listBtn && gridBtn) {
        listBtn.addEventListener('click', () => {
            currentLayout = 'list';
            localStorage.setItem('taskLayout', 'list');
            updateLayoutButtons();
            filterAndRenderTasks();
        });
        gridBtn.addEventListener('click', () => {
            currentLayout = 'grid';
            localStorage.setItem('taskLayout', 'grid');
            updateLayoutButtons();
            filterAndRenderTasks();
        });
    }
    
    const reminderBtn = document.getElementById('reminder-settings-btn');
    if (reminderBtn) reminderBtn.addEventListener('click', () => showReminderSettings());
    
    const addScheduleBtn = document.getElementById('add-schedule-btn');
    if (addScheduleBtn) {
        addScheduleBtn.addEventListener('click', () => window.TasksApp.showAddModal());
    }
}

function showReminderSettings() {
    const html = `
        <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.TasksApp.closeModal()">
            <div class="rounded-2xl w-full max-w-md mx-auto transform transition-all" style="background: var(--bg-secondary);">
                <div class="flex justify-between items-center p-5 border-b" style="border-color: var(--border-color);">
                    <div>
                        <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">
                            <i class="fas fa-bell mr-2" style="color: var(--deep-blue);"></i>Reminder Settings
                        </h2>
                        <p class="text-xs md:text-sm text-muted mt-1">Configure your notification preferences</p>
                    </div>
                    <button onclick="window.TasksApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                        <i class="fas fa-times text-muted"></i>
                    </button>
                </div>
                <div class="p-5 space-y-4">
                    <div>
                        <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Test Notification Sound</label>
                        <button onclick="window.TasksApp.testSound()" class="px-4 py-2 rounded-lg transition-all hover:shadow-md" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                            <i class="fas fa-volume-up mr-1"></i> Play Test Sound
                        </button>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Desktop Notifications</label>
                        <button onclick="window.TasksApp.requestNotificationPermission()" class="px-4 py-2 rounded-lg border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
                            <i class="fas fa-bell mr-1"></i> Request Permission
                        </button>
                    </div>
                    <div class="pt-3 border-t" style="border-color: var(--border-color);">
                        <p class="text-xs" style="color: var(--text-muted);">
                            <i class="fas fa-info-circle mr-1"></i>
                            Reminders are checked every minute. You'll receive notifications for schedules due within the next 3 days.
                        </p>
                    </div>
                    <div class="flex gap-3 pt-2">
                        <button onclick="window.TasksApp.closeModal()" class="flex-1 py-2 rounded-lg font-semibold transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color);">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    const modalContainer = document.getElementById('modal-container');
    if (modalContainer) {
        modalContainer.innerHTML = html;
        modalContainer.style.pointerEvents = 'auto';
    }
}

function startReminderChecker() {
    if (reminderInterval) clearInterval(reminderInterval);
    reminderInterval = setInterval(() => checkReminders(), 60000);
    checkReminders();
}

function checkReminders() {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    
    tasksCache.forEach(task => {
        if (task.status === 'done') return;
        if (!task.reminderTime) return;
        
        const reminderTime = new Date(task.reminderTime);
        const lastNotified = task.lastNotified ? new Date(task.lastNotified) : null;
        
        if (reminderTime <= threeDaysFromNow && reminderTime > now && !lastNotified) {
            sendNotification(task);
            updateDoc(doc(db, 'tasks', task.id), { lastNotified: serverTimestamp() }).catch(console.error);
        }
    });
}

function sendNotification(task) {
    if (notificationSound) {
        try {
            notificationSound.play();
        } catch(e) {
            console.log('Sound play failed:', e);
        }
    }
    
    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            new Notification('Schedule Reminder', {
                body: `${task.title} - ${formatTimeDisplay(task.dueDate)}`,
                icon: '/favicon.ico',
                tag: task.id
            });
        } catch(e) {
            console.log('Notification failed:', e);
        }
    }
    
    showToast(`Reminder: "${task.title}" is coming up!`, 'warning');
}

// Add CSS animation for spinner
const styleSheet = document.createElement("style");
styleSheet.textContent = `
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
    .loading-spinner {
        animation: spin 0.6s linear infinite;
    }
`;
document.head.appendChild(styleSheet);

// Add everything to window.TasksApp
window.TasksApp = {
    showAddModal: () => {
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.TasksApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto transform transition-all" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-plus-circle mr-2" style="color: var(--deep-blue);"></i>Add Schedule
                            </h2>
                            <p class="text-xs md:text-sm text-muted mt-1">Create a new task or event</p>
                        </div>
                        <button onclick="window.TasksApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="add-task-form" class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Title *</label>
                            <input type="text" name="title" placeholder="What's on your schedule?" required 
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Description</label>
                            <textarea name="description" rows="2" placeholder="Description (optional)"
                                      class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></textarea>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Category</label>
                                <select name="category" class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                        style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    <option value="class">Class/Lecture</option>
                                    <option value="assignment">Assignment</option>
                                    <option value="quiz">Quiz/Exam</option>
                                    <option value="meeting">Meeting</option>
                                    <option value="study">Study Time</option>
                                    <option value="personal">Personal</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Priority</label>
                                <select name="priority" class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                        style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    <option value="high">High Priority</option>
                                    <option value="medium" selected>Medium Priority</option>
                                    <option value="low">Low Priority</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Date *</label>
                                <input type="date" name="dueDate" required 
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Time *</label>
                                <input type="time" name="dueTime" required 
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                        </div>
                        
                        <div class="border-t pt-3" style="border-color: var(--border-color);">
                            <div class="flex items-center justify-between mb-2">
                                <label class="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" id="enable-reminder" class="w-4 h-4 rounded">
                                    <span class="text-sm" style="color: var(--text-primary);"><i class="fas fa-bell"></i> Set reminder</span>
                                </label>
                                <label class="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" id="enable-recurring" class="w-4 h-4 rounded">
                                    <span class="text-sm" style="color: var(--text-primary);"><i class="fas fa-sync-alt"></i> Recurring</span>
                                </label>
                            </div>
                            
                            <div id="reminder-time-input" class="hidden mt-2">
                                <label class="block text-xs mb-1" style="color: var(--text-muted);">Reminder time before due</label>
                                <select name="reminderBefore" class="w-full px-3 py-2 rounded-lg border text-sm"
                                        style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    <option value="5">5 minutes before</option>
                                    <option value="15">15 minutes before</option>
                                    <option value="30">30 minutes before</option>
                                    <option value="60">1 hour before</option>
                                    <option value="120">2 hours before</option>
                                    <option value="1440">1 day before</option>
                                    <option value="2880">2 days before</option>
                                    <option value="4320">3 days before</option>
                                </select>
                            </div>
                            
                            <div id="recurring-input" class="hidden mt-2">
                                <label class="block text-xs mb-1" style="color: var(--text-muted);">Repeat pattern</label>
                                <select name="recurringPattern" class="w-full px-3 py-2 rounded-lg border text-sm"
                                        style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly (same day)</option>
                                    <option value="weekdays">Weekdays (Mon-Fri)</option>
                                    <option value="monthly">Monthly</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button type="submit" id="create-task-submit" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-1"></i> Create Schedule
                            </button>
                            <button type="button" onclick="window.TasksApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        const modalContainer = document.getElementById('modal-container');
        if (modalContainer) {
            modalContainer.innerHTML = html;
            modalContainer.style.pointerEvents = 'auto';
            
            const reminderCheckbox = document.getElementById('enable-reminder');
            const reminderDiv = document.getElementById('reminder-time-input');
            const recurringCheckbox = document.getElementById('enable-recurring');
            const recurringDiv = document.getElementById('recurring-input');
            
            if (reminderCheckbox) {
                reminderCheckbox.onchange = () => reminderDiv.classList.toggle('hidden');
            }
            if (recurringCheckbox) {
                recurringCheckbox.onchange = () => recurringDiv.classList.toggle('hidden');
            }
            
            document.getElementById('add-task-form').onsubmit = async (e) => {
                e.preventDefault();
                const submitBtn = document.getElementById('create-task-submit');
                
                setButtonLoading(submitBtn, true, 'Create Schedule', 'fa-save');
                
                const data = new FormData(e.target);
                
                let dueDateTime = null;
                if (data.get('dueDate') && data.get('dueTime')) {
                    dueDateTime = new Date(`${data.get('dueDate')}T${data.get('dueTime')}`);
                }
                
                let reminderTime = null;
                if (reminderCheckbox.checked && dueDateTime) {
                    const minutesBefore = parseInt(data.get('reminderBefore'));
                    reminderTime = new Date(dueDateTime.getTime() - minutesBefore * 60 * 1000);
                }
                
                try {
                    await addDoc(collection(db, 'tasks'), {
                        title: data.get('title'),
                        description: data.get('description') || '',
                        category: data.get('category'),
                        priority: data.get('priority'),
                        dueDate: dueDateTime,
                        reminderTime: reminderTime,
                        isRecurring: recurringCheckbox.checked,
                        recurringPattern: recurringCheckbox.checked ? data.get('recurringPattern') : null,
                        status: 'todo',
                        userId: currentUser.uid,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    });
                    
                    showToast('Schedule created successfully!', 'success');
                    window.TasksApp.closeModal();
                    await loadTasks();
                } catch (error) {
                    console.error('Error creating task:', error);
                    showToast('Failed to create schedule. Please try again.', 'error');
                    setButtonLoading(submitBtn, false, 'Create Schedule', 'fa-save');
                }
            };
        }
    },
    
    edit: async (taskId) => {
        const task = tasksCache.find(t => t.id === taskId);
        if (!task) return;
        
        const dueDate = task.dueDate ? task.dueDate.toISOString().split('T')[0] : '';
        const dueTime = task.dueDate ? task.dueDate.toTimeString().slice(0, 5) : '';
        
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.TasksApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto transform transition-all" style="background: var(--bg-secondary);">
                    <div class="flex justify-between items-center p-5 border-b" style="border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-edit mr-2" style="color: var(--deep-blue);"></i>Edit Schedule
                            </h2>
                            <p class="text-xs md:text-sm text-muted mt-1">Update your task details</p>
                        </div>
                        <button onclick="window.TasksApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="edit-task-form" class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Title *</label>
                            <input type="text" name="title" value="${escapeHtml(task.title)}" required 
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Description</label>
                            <textarea name="description" rows="2" 
                                      class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">${escapeHtml(task.description || '')}</textarea>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Category</label>
                                <select name="category" class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                        style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    <option value="class" ${task.category === 'class' ? 'selected' : ''}>Class/Lecture</option>
                                    <option value="assignment" ${task.category === 'assignment' ? 'selected' : ''}>Assignment</option>
                                    <option value="quiz" ${task.category === 'quiz' ? 'selected' : ''}>Quiz/Exam</option>
                                    <option value="meeting" ${task.category === 'meeting' ? 'selected' : ''}>Meeting</option>
                                    <option value="study" ${task.category === 'study' ? 'selected' : ''}>Study Time</option>
                                    <option value="personal" ${task.category === 'personal' ? 'selected' : ''}>Personal</option>
                                    <option value="other" ${task.category === 'other' ? 'selected' : ''}>Other</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Priority</label>
                                <select name="priority" class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                        style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    <option value="high" ${task.priority === 'high' ? 'selected' : ''}>High Priority</option>
                                    <option value="medium" ${task.priority === 'medium' ? 'selected' : ''}>Medium Priority</option>
                                    <option value="low" ${task.priority === 'low' ? 'selected' : ''}>Low Priority</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Date *</label>
                                <input type="date" name="dueDate" value="${dueDate}" required 
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Time *</label>
                                <input type="time" name="dueTime" value="${dueTime}" required 
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button type="submit" id="edit-task-submit" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-1"></i> Save Changes
                            </button>
                            <button type="button" onclick="window.TasksApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        const modalContainer = document.getElementById('modal-container');
        if (modalContainer) {
            modalContainer.innerHTML = html;
            modalContainer.style.pointerEvents = 'auto';
            
            document.getElementById('edit-task-form').onsubmit = async (e) => {
                e.preventDefault();
                const submitBtn = document.getElementById('edit-task-submit');
                
                setButtonLoading(submitBtn, true, 'Save Changes', 'fa-save');
                
                const data = new FormData(e.target);
                
                let dueDateTime = null;
                if (data.get('dueDate') && data.get('dueTime')) {
                    dueDateTime = new Date(`${data.get('dueDate')}T${data.get('dueTime')}`);
                }
                
                try {
                    await updateDoc(doc(db, 'tasks', taskId), {
                        title: data.get('title'),
                        description: data.get('description') || '',
                        category: data.get('category'),
                        priority: data.get('priority'),
                        dueDate: dueDateTime,
                        updatedAt: serverTimestamp()
                    });
                    
                    showToast('Schedule updated!', 'success');
                    window.TasksApp.closeModal();
                    await loadTasks();
                } catch (error) {
                    console.error('Error updating task:', error);
                    showToast('Failed to update schedule. Please try again.', 'error');
                    setButtonLoading(submitBtn, false, 'Save Changes', 'fa-save');
                }
            };
        }
    },
    
    delete: async (taskId) => {
        if (confirm('Delete this schedule?')) {
            try {
                await deleteDoc(doc(db, 'tasks', taskId));
                showToast('Schedule deleted', 'success');
                await loadTasks();
            } catch (error) {
                console.error('Error deleting task:', error);
                if (error.code === 'permission-denied') {
                    showToast('You don\'t have permission to delete this schedule', 'error');
                } else {
                    showToast('Failed to delete schedule. Please try again.', 'error');
                }
            }
        }
    },
    
    toggleStatus: async (taskId, completed) => {
        await updateDoc(doc(db, 'tasks', taskId), {
            status: completed ? 'done' : 'todo',
            updatedAt: serverTimestamp()
        });
        showToast(completed ? 'Completed! 🎉' : 'Reopened', 'success');
        await loadTasks();
    },
    
    testSound: () => {
        if (notificationSound) {
            notificationSound.play();
            showToast('Test sound played!', 'info');
        }
    },
    
    requestNotificationPermission: () => {
        if ('Notification' in window) {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    showToast('Notifications enabled!', 'success');
                } else {
                    showToast('Notifications denied', 'error');
                }
            });
        } else {
            showToast('Notifications not supported', 'error');
        }
    },
    
    closeModal: () => {
        const modalContainer = document.getElementById('modal-container');
        if (modalContainer) {
            modalContainer.innerHTML = '';
            modalContainer.style.pointerEvents = 'none';
        }
    }
};