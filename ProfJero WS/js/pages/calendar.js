// js/pages/calendar.js
import { db, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, serverTimestamp } from '../firebase-config.js';
import { showToast, escapeHtml, formatDate, timeAgo } from '../utils/helpers.js';

let currentUser = null;
let currentView = 'month';
let currentDate = new Date();
let eventsCache = [];
let tasksCache = [];

export async function renderCalendarPage(user) {
    currentUser = user;
    
    return `
        <div class="space-y-6 animate-fade-in-up">
            <!-- Header -->
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 class="text-3xl font-bold" style="color: var(--text-primary);">Calendar</h1>
                    <p class="text-muted mt-1">Manage your schedule, events, and tasks all in one place</p>
                </div>
                <div class="flex gap-3 flex-wrap">
                    <button id="add-event-btn" class="px-5 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                        <i class="fas fa-plus"></i>
                        <span>Add Event</span>
                    </button>
                    <button id="sync-tasks-btn" class="px-5 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all hover:shadow-md" style="background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary);">
                        <i class="fas fa-sync-alt"></i>
                        <span>Sync Tasks</span>
                    </button>
                </div>
            </div>
            
            <!-- Quick Stats -->
            <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div class="glass-card p-3 rounded-xl text-center cursor-pointer hover:shadow-lg transition-all" data-view="day" data-date="today">
                    <div class="text-xl font-bold" id="stat-today" style="color: var(--deep-blue);">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-calendar-day"></i> Today</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center cursor-pointer hover:shadow-lg transition-all" data-view="week">
                    <div class="text-xl font-bold" id="stat-week" style="color: var(--emerald);">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-calendar-week"></i> This Week</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center cursor-pointer hover:shadow-lg transition-all" data-view="month">
                    <div class="text-xl font-bold" id="stat-month" style="color: var(--gold);">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-calendar-alt"></i> This Month</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center">
                    <div class="text-xl font-bold" id="stat-events" style="color: #8b5cf6;">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-calendar-check"></i> Events</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center">
                    <div class="text-xl font-bold" id="stat-upcoming" style="color: #ef4444;">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-clock"></i> Upcoming</div>
                </div>
            </div>
            
            <!-- Calendar Navigation -->
            <div class="flex flex-wrap items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                    <button id="prev-btn" class="p-2 rounded-lg transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="color: var(--text-primary);">
                        <i class="fas fa-chevron-left"></i>
                    </button>
                    <h2 id="calendar-title" class="text-xl font-bold" style="color: var(--text-primary);">${formatDateHeader(currentDate)}</h2>
                    <button id="next-btn" class="p-2 rounded-lg transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="color: var(--text-primary);">
                        <i class="fas fa-chevron-right"></i>
                    </button>
                    <button id="today-btn" class="px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:shadow-md" style="background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary);">
                        Today
                    </button>
                </div>
                <div class="flex gap-2">
                    <button class="view-tab px-4 py-2 rounded-lg transition-all" data-view="day" style="background: var(--bg-secondary); color: var(--text-muted);">Day</button>
                    <button class="view-tab px-4 py-2 rounded-lg transition-all" data-view="week" style="background: var(--bg-secondary); color: var(--text-muted);">Week</button>
                    <button class="view-tab px-4 py-2 rounded-lg transition-all active" data-view="month" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">Month</button>
                </div>
            </div>
            
            <!-- Calendar Grid -->
            <div id="calendar-container" class="glass-card rounded-xl p-4 overflow-x-auto">
                <div class="text-center py-12">
                    <div class="animate-pulse"><i class="fas fa-spinner fa-spin mr-2 text-muted"></i> Loading calendar...</div>
                </div>
            </div>
            
            <!-- Upcoming Events Sidebar -->
            <div class="glass-card rounded-xl p-4">
                <h3 class="font-semibold mb-3" style="color: var(--text-primary);">
                    <i class="fas fa-clock mr-2" style="color: var(--deep-blue);"></i>Upcoming Events
                </h3>
                <div id="upcoming-events" class="space-y-2 max-h-64 overflow-y-auto">
                    <div class="text-center py-4 text-muted">Loading events...</div>
                </div>
            </div>
        </div>
    `;
}

export async function loadCalendarData() {
    if (!currentUser) return;
    await Promise.all([
        loadEvents(),
        loadTasksForCalendar()
    ]);
    setupEventListeners();
    renderCalendar();
    updateUpcomingEvents();
    updateCalendarTitle();
    updateStats();
}

async function loadEvents() {
    try {
        const q = query(
            collection(db, 'calendarEvents'), 
            where('userId', '==', currentUser.uid),
            orderBy('startDate', 'asc')
        );
        const querySnapshot = await getDocs(q);
        eventsCache = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                startDate: data.startDate?.toDate?.() || new Date(data.startDate),
                endDate: data.endDate?.toDate?.() || new Date(data.endDate),
                createdAt: data.createdAt?.toDate?.() || new Date()
            };
        });
    } catch (error) {
        console.error('Error loading events:', error);
        if (error.code === 'permission-denied') {
            showToast('Please set up calendar events collection in Firebase', 'info');
        }
    }
}

async function loadTasksForCalendar() {
    try {
        const q = query(
            collection(db, 'tasks'), 
            where('userId', '==', currentUser.uid)
        );
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

function formatDateHeader(date) {
    const options = { year: 'numeric', month: 'long' };
    return date.toLocaleDateString('en-US', options);
}

function formatDayHeader(date) {
    return date.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function getDaysInMonth(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    return { daysInMonth, firstDay };
}

function renderCalendar() {
    const container = document.getElementById('calendar-container');
    if (!container) return;
    
    const view = currentView;
    const date = currentDate;
    
    if (view === 'month') {
        renderMonthView(container, date);
    } else if (view === 'week') {
        renderWeekView(container, date);
    } else if (view === 'day') {
        renderDayView(container, date);
    }
    
    updateStats();
}

function renderMonthView(container, date) {
    const { daysInMonth, firstDay } = getDaysInMonth(date);
    const year = date.getFullYear();
    const month = date.getMonth();
    const today = new Date();
    
    // Get events for this month
    const monthEvents = eventsCache.filter(e => {
        const eventDate = e.startDate;
        return eventDate.getFullYear() === year && eventDate.getMonth() === month;
    });
    
    // Get tasks with due dates this month
    const monthTasks = tasksCache.filter(t => {
        if (!t.dueDate) return false;
        return t.dueDate.getFullYear() === year && t.dueDate.getMonth() === month && t.status !== 'done';
    });
    
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const todayDate = new Date();
    
    let html = `
        <div class="grid grid-cols-7 gap-1">
            ${weekdays.map(day => `
                <div class="text-center text-sm font-semibold py-2" style="color: var(--text-muted);">${day}</div>
            `).join('')}
    `;
    
    // Empty days before first day
    for (let i = 0; i < firstDay; i++) {
        html += `<div class="p-1 min-h-[80px]"></div>`;
    }
    
    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
        const currentDate = new Date(year, month, day);
        const isToday = todayDate.toDateString() === currentDate.toDateString();
        const isPast = currentDate < todayDate && !isToday;
        const dayEvents = monthEvents.filter(e => e.startDate.getDate() === day);
        const dayTasks = monthTasks.filter(t => t.dueDate.getDate() === day);
        const hasEvents = dayEvents.length > 0 || dayTasks.length > 0;
        const totalItems = dayEvents.length + dayTasks.length;
        
        html += `
            <div class="p-1 min-h-[80px] rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-all ${isToday ? 'border-2 border-deep-blue' : ''} ${isPast ? 'opacity-60' : ''}" 
                 onclick="window.CalendarApp.selectDate('${currentDate.toISOString()}')" 
                 data-date="${currentDate.toISOString()}">
                <div class="flex justify-between items-start">
                    <span class="text-sm font-medium ${isToday ? 'text-deep-blue font-bold' : ''}" style="color: ${isToday ? 'var(--deep-blue)' : 'var(--text-primary)'};">${day}</span>
                    ${hasEvents ? `<span class="text-xs px-1.5 py-0.5 rounded-full" style="background: ${isToday ? 'var(--deep-blue)' : 'var(--emerald)'}; color: white;">${totalItems}</span>` : ''}
                </div>
                <div class="space-y-0.5 mt-1 max-h-[50px] overflow-hidden">
                    ${dayEvents.slice(0, 2).map(e => `
                        <div class="text-xs truncate px-1 py-0.5 rounded" style="background: rgba(0, 87, 217, 0.1); color: var(--deep-blue);" title="${escapeHtml(e.title)}">
                            <i class="fas fa-calendar-check text-xs mr-1"></i>${escapeHtml(e.title)}
                        </div>
                    `).join('')}
                    ${dayTasks.slice(0, 2 - Math.min(dayEvents.length, 2)).map(t => `
                        <div class="text-xs truncate px-1 py-0.5 rounded" style="background: rgba(16, 185, 129, 0.1); color: var(--emerald);" title="${escapeHtml(t.title)}">
                            <i class="fas fa-tasks text-xs mr-1"></i>${escapeHtml(t.title)}
                        </div>
                    `).join('')}
                    ${totalItems > 3 ? `<div class="text-xs text-muted px-1">+${totalItems - 3} more</div>` : ''}
                </div>
            </div>
        `;
    }
    
    html += `</div>`;
    container.innerHTML = html;
}

function renderWeekView(container, date) {
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - date.getDay());
    const today = new Date();
    
    let html = `
        <div class="grid grid-cols-7 gap-2">
    `;
    
    for (let i = 0; i < 7; i++) {
        const currentDate = new Date(startOfWeek);
        currentDate.setDate(startOfWeek.getDate() + i);
        const isToday = today.toDateString() === currentDate.toDateString();
        const isPast = currentDate < today && !isToday;
        const dayEvents = eventsCache.filter(e => e.startDate.toDateString() === currentDate.toDateString());
        const dayTasks = tasksCache.filter(t => t.dueDate && t.dueDate.toDateString() === currentDate.toDateString() && t.status !== 'done');
        
        html += `
            <div class="min-h-[120px] rounded-lg p-2 ${isToday ? 'border-2 border-deep-blue' : ''} ${isPast ? 'opacity-60' : ''}" 
                 style="background: var(--bg-primary);">
                <div class="text-center mb-2 cursor-pointer" onclick="window.CalendarApp.selectDate('${currentDate.toISOString()}')">
                    <div class="text-xs text-muted">${currentDate.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                    <div class="font-semibold ${isToday ? 'text-deep-blue' : ''}" style="color: ${isToday ? 'var(--deep-blue)' : 'var(--text-primary)'};">${currentDate.getDate()}</div>
                </div>
                <div class="space-y-1 max-h-[100px] overflow-y-auto">
                    ${dayEvents.map(e => `
                        <div class="text-xs p-1 rounded truncate cursor-pointer hover:opacity-80" style="background: rgba(0, 87, 217, 0.1); color: var(--deep-blue);" 
                             onclick="event.stopPropagation(); window.CalendarApp.viewEvent('${e.id}')" title="${escapeHtml(e.title)}">
                            <i class="fas fa-calendar-check text-xs mr-1"></i>${escapeHtml(e.title)}
                        </div>
                    `).join('')}
                    ${dayTasks.map(t => `
                        <div class="text-xs p-1 rounded truncate cursor-pointer hover:opacity-80" style="background: rgba(16, 185, 129, 0.1); color: var(--emerald);" 
                             onclick="event.stopPropagation(); window.CalendarApp.viewTask('${t.id}')" title="${escapeHtml(t.title)}">
                            <i class="fas fa-tasks text-xs mr-1"></i>${escapeHtml(t.title)}
                        </div>
                    `).join('')}
                    ${dayEvents.length === 0 && dayTasks.length === 0 ? `<div class="text-xs text-muted text-center py-2">No events</div>` : ''}
                </div>
            </div>
        `;
    }
    
    html += `</div>`;
    container.innerHTML = html;
}

function renderDayView(container, date) {
    const today = new Date();
    const isToday = today.toDateString() === date.toDateString();
    const isPast = date < today && !isToday;
    const dayEvents = eventsCache.filter(e => e.startDate.toDateString() === date.toDateString());
    const dayTasks = tasksCache.filter(t => t.dueDate && t.dueDate.toDateString() === date.toDateString() && t.status !== 'done');
    
    // Combine and sort by time
    const allItems = [
        ...dayEvents.map(e => ({ ...e, type: 'event', time: e.startDate })),
        ...dayTasks.map(t => ({ ...t, type: 'task', time: t.dueDate }))
    ].sort((a, b) => a.time - b.time);
    
    let html = `
        <div>
            <div class="text-center mb-4">
                <h3 class="text-2xl font-bold ${isToday ? 'text-deep-blue' : ''}" style="color: ${isToday ? 'var(--deep-blue)' : 'var(--text-primary)'};">${formatDayHeader(date)}</h3>
                <p class="text-sm text-muted">${dayEvents.length} events, ${dayTasks.length} tasks</p>
            </div>
            <div class="space-y-2">
    `;
    
    if (allItems.length === 0) {
        html += `
            <div class="text-center py-8 text-muted">
                <i class="fas fa-calendar-day text-4xl mb-2"></i>
                <p>No events or tasks for this day</p>
                <button onclick="window.CalendarApp.showAddEventModal()" class="mt-2 text-sm text-deep-blue hover:underline cursor-pointer">Add an event</button>
            </div>
        `;
    } else {
        allItems.forEach(item => {
            const isEvent = item.type === 'event';
            const color = isEvent ? 'var(--deep-blue)' : 'var(--emerald)';
            const bg = isEvent ? 'rgba(0, 87, 217, 0.1)' : 'rgba(16, 185, 129, 0.1)';
            const icon = isEvent ? 'fa-calendar-check' : 'fa-tasks';
            
            html += `
                <div class="p-3 rounded-lg flex items-center gap-3 cursor-pointer hover:shadow-md transition-all" style="background: ${bg};" 
                     onclick="window.CalendarApp.${isEvent ? 'viewEvent' : 'viewTask'}('${item.id}')">
                    <i class="fas ${icon}" style="color: ${color};"></i>
                    <div class="flex-1">
                        <div class="font-semibold" style="color: var(--text-primary);">${escapeHtml(item.title)}</div>
                        <div class="text-xs text-muted">${item.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • ${isEvent ? 'Event' : 'Task'}</div>
                    </div>
                    ${isEvent ? `
                        <span class="text-xs px-2 py-0.5 rounded-full" style="background: ${item.status === 'completed' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)'}; color: ${item.status === 'completed' ? 'var(--emerald)' : 'var(--gold)'};">${item.status || 'pending'}</span>
                    ` : `
                        <span class="text-xs px-2 py-0.5 rounded-full" style="background: ${item.priority === 'high' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)'}; color: ${item.priority === 'high' ? '#ef4444' : 'var(--emerald)'};">${item.priority || 'medium'}</span>
                    `}
                </div>
            `;
        });
    }
    
    html += `
            </div>
        </div>
    `;
    container.innerHTML = html;
}

function updateStats() {
    const today = new Date();
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);
    
    const todayEvents = eventsCache.filter(e => e.startDate >= todayStart && e.startDate <= todayEnd);
    const weekEvents = eventsCache.filter(e => e.startDate >= startOfWeek && e.startDate <= todayEnd);
    const monthEvents = eventsCache.filter(e => e.startDate >= startOfMonth && e.startDate <= endOfMonth);
    const upcomingEvents = eventsCache.filter(e => e.startDate > todayEnd && e.status !== 'cancelled').sort((a, b) => a.startDate - b.startDate);
    
    const statToday = document.getElementById('stat-today');
    const statWeek = document.getElementById('stat-week');
    const statMonth = document.getElementById('stat-month');
    const statEvents = document.getElementById('stat-events');
    const statUpcoming = document.getElementById('stat-upcoming');
    
    if (statToday) statToday.textContent = todayEvents.length;
    if (statWeek) statWeek.textContent = weekEvents.length;
    if (statMonth) statMonth.textContent = monthEvents.length;
    if (statEvents) statEvents.textContent = eventsCache.length;
    if (statUpcoming) statUpcoming.textContent = upcomingEvents.length;
}

function updateUpcomingEvents() {
    const container = document.getElementById('upcoming-events');
    if (!container) return;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const upcoming = eventsCache
        .filter(e => e.startDate >= today && e.status !== 'cancelled')
        .sort((a, b) => a.startDate - b.startDate)
        .slice(0, 10);
    
    if (upcoming.length === 0) {
        container.innerHTML = `
            <div class="text-center py-4 text-muted">
                <i class="fas fa-calendar-check text-2xl mb-2"></i>
                <p>No upcoming events</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = upcoming.map(event => {
        const isToday = event.startDate.toDateString() === today.toDateString();
        const isTomorrow = new Date(today.getTime() + 86400000).toDateString() === event.startDate.toDateString();
        let dateLabel = formatDate(event.startDate);
        if (isToday) dateLabel = 'Today';
        else if (isTomorrow) dateLabel = 'Tomorrow';
        
        return `
            <div class="flex items-center justify-between p-2 rounded-lg cursor-pointer hover:shadow-md transition-all" style="background: var(--bg-primary);" onclick="window.CalendarApp.viewEvent('${event.id}')">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background: rgba(0, 87, 217, 0.1);">
                        <i class="fas fa-calendar-day" style="color: var(--deep-blue);"></i>
                    </div>
                    <div>
                        <div class="font-semibold" style="color: var(--text-primary);">${escapeHtml(event.title)}</div>
                        <div class="text-xs text-muted">${dateLabel} at ${event.startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                </div>
                <span class="text-xs px-2 py-0.5 rounded-full" style="background: ${event.status === 'completed' ? 'rgba(16, 185, 129, 0.2)' : event.status === 'confirmed' ? 'rgba(0, 87, 217, 0.2)' : 'rgba(245, 158, 11, 0.2)'}; color: ${event.status === 'completed' ? 'var(--emerald)' : event.status === 'confirmed' ? 'var(--deep-blue)' : 'var(--gold)'};">${event.status || 'pending'}</span>
            </div>
        `;
    }).join('');
}

function setupEventListeners() {
    // Navigation buttons
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const todayBtn = document.getElementById('today-btn');
    
    if (prevBtn) prevBtn.addEventListener('click', () => navigateCalendar(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => navigateCalendar(1));
    if (todayBtn) todayBtn.addEventListener('click', goToToday);
    
    // View tabs
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
            currentView = this.dataset.view;
            renderCalendar();
            updateCalendarTitle();
        });
    });
    
    // Stat cards navigation
    document.querySelectorAll('[data-view]').forEach(stat => {
        stat.addEventListener('click', function() {
            const view = this.dataset.view;
            const date = this.dataset.date;
            if (date === 'today') {
                goToToday();
            }
            const tab = document.querySelector(`.view-tab[data-view="${view}"]`);
            if (tab) tab.click();
        });
    });
    
    // Add event button
    const addBtn = document.getElementById('add-event-btn');
    if (addBtn) addBtn.addEventListener('click', () => window.CalendarApp.showAddEventModal());
    
    // Sync tasks button
    const syncBtn = document.getElementById('sync-tasks-btn');
    if (syncBtn) syncBtn.addEventListener('click', async () => {
        const originalText = syncBtn.innerHTML;
        syncBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
        syncBtn.disabled = true;
        
        try {
            await loadTasksForCalendar();
            renderCalendar();
            showToast('Tasks synced successfully!', 'success');
        } catch (error) {
            showToast('Failed to sync tasks', 'error');
        } finally {
            syncBtn.innerHTML = originalText;
            syncBtn.disabled = false;
        }
    });
}

function navigateCalendar(direction) {
    const newDate = new Date(currentDate);
    if (currentView === 'month') {
        newDate.setMonth(newDate.getMonth() + direction);
    } else if (currentView === 'week') {
        newDate.setDate(newDate.getDate() + (direction * 7));
    } else if (currentView === 'day') {
        newDate.setDate(newDate.getDate() + direction);
    }
    currentDate = newDate;
    renderCalendar();
    updateCalendarTitle();
}

function goToToday() {
    currentDate = new Date();
    renderCalendar();
    updateCalendarTitle();
    updateUpcomingEvents();
}

function updateCalendarTitle() {
    const title = document.getElementById('calendar-title');
    if (!title) return;
    
    if (currentView === 'month') {
        title.textContent = formatDateHeader(currentDate);
    } else if (currentView === 'week') {
        const start = new Date(currentDate);
        start.setDate(currentDate.getDate() - currentDate.getDay());
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        const startMonth = start.getMonth();
        const endMonth = end.getMonth();
        if (startMonth === endMonth) {
            title.textContent = `${start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} - ${end.getDate()}, ${end.getFullYear()}`;
        } else {
            title.textContent = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
        }
    } else {
        title.textContent = formatDayHeader(currentDate);
    }
}

window.CalendarApp = {
    selectDate: (dateStr) => {
        const date = new Date(dateStr);
        currentDate = date;
        currentView = 'day';
        document.querySelectorAll('.view-tab').forEach(t => {
            t.classList.remove('active');
            t.style.background = 'var(--bg-secondary)';
            t.style.color = 'var(--text-muted)';
        });
        const dayTab = document.querySelector('.view-tab[data-view="day"]');
        if (dayTab) {
            dayTab.classList.add('active');
            dayTab.style.background = 'linear-gradient(135deg, var(--deep-blue), var(--emerald))';
            dayTab.style.color = 'white';
        }
        renderCalendar();
        updateCalendarTitle();
    },
    
    viewEvent: async (eventId) => {
        const event = eventsCache.find(e => e.id === eventId);
        if (!event) {
            showToast('Event not found', 'error');
            return;
        }
        
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.CalendarApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto transform transition-all" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl font-bold" style="color: var(--text-primary);">${escapeHtml(event.title)}</h2>
                            <p class="text-xs text-muted">Event Details</p>
                        </div>
                        <button onclick="window.CalendarApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <div class="p-5 space-y-4">
                        <div class="flex items-center gap-3">
                            <i class="fas fa-calendar w-5" style="color: var(--deep-blue);"></i>
                            <span style="color: var(--text-primary);">${formatDate(event.startDate)}</span>
                        </div>
                        <div class="flex items-center gap-3">
                            <i class="fas fa-clock w-5" style="color: var(--deep-blue);"></i>
                            <span style="color: var(--text-primary);">${event.startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${event.endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        ${event.location ? `
                            <div class="flex items-center gap-3">
                                <i class="fas fa-map-marker-alt w-5" style="color: var(--deep-blue);"></i>
                                <span style="color: var(--text-primary);">${escapeHtml(event.location)}</span>
                            </div>
                        ` : ''}
                        ${event.description ? `
                            <div class="p-3 rounded-lg" style="background: var(--bg-primary);">
                                <p style="color: var(--text-primary);">${escapeHtml(event.description)}</p>
                            </div>
                        ` : ''}
                        <div class="flex flex-wrap gap-2 pt-2">
                            <span class="text-xs px-3 py-1 rounded-full" style="background: ${event.status === 'completed' ? 'rgba(16, 185, 129, 0.2)' : event.status === 'confirmed' ? 'rgba(0, 87, 217, 0.2)' : 'rgba(245, 158, 11, 0.2)'}; color: ${event.status === 'completed' ? 'var(--emerald)' : event.status === 'confirmed' ? 'var(--deep-blue)' : 'var(--gold)'};">${event.status || 'pending'}</span>
                            ${event.isRecurring ? `<span class="text-xs px-3 py-1 rounded-full" style="background: rgba(139, 92, 246, 0.2); color: #8b5cf6;"><i class="fas fa-sync-alt mr-1"></i>${event.recurringPattern || 'Recurring'}</span>` : ''}
                        </div>
                        <div class="flex flex-col sm:flex-row gap-2 pt-2">
                            <button onclick="window.CalendarApp.editEvent('${event.id}')" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-edit mr-1"></i> Edit
                            </button>
                            <button onclick="window.CalendarApp.deleteEvent('${event.id}')" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-red-50 dark:hover:bg-red-900/20" style="border-color: #ef4444; color: #ef4444;">
                                <i class="fas fa-trash mr-1"></i> Delete
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
    
    viewTask: (taskId) => {
        const task = tasksCache.find(t => t.id === taskId);
        if (!task) {
            showToast('Task not found', 'error');
            return;
        }
        showToast(`Task: ${task.title} - Due: ${formatDate(task.dueDate)}`, 'info');
        // Navigate to tasks page to view task details
        setTimeout(() => {
            window.location.hash = 'tasks';
        }, 1000);
    },
    
    showAddEventModal: () => {
        const today = new Date().toISOString().split('T')[0];
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.CalendarApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto transform transition-all" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-calendar-plus mr-2" style="color: var(--deep-blue);"></i>Add Event
                            </h2>
                            <p class="text-xs text-muted">Create a new calendar event</p>
                        </div>
                        <button onclick="window.CalendarApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="add-event-form" class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Event Title *</label>
                            <input type="text" name="title" required placeholder="Event title..." class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Description</label>
                            <textarea name="description" rows="3" placeholder="Event description..." class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></textarea>
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Start Date *</label>
                                <input type="date" name="startDate" required value="${today}" class="w-full px-3 md:px-4 py-2 rounded-lg border" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Start Time</label>
                                <input type="time" name="startTime" value="09:00" class="w-full px-3 md:px-4 py-2 rounded-lg border" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">End Date</label>
                                <input type="date" name="endDate" value="${today}" class="w-full px-3 md:px-4 py-2 rounded-lg border" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">End Time</label>
                                <input type="time" name="endTime" value="10:00" class="w-full px-3 md:px-4 py-2 rounded-lg border" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Location</label>
                            <input type="text" name="location" placeholder="Location (optional)" class="w-full px-3 md:px-4 py-2 rounded-lg border" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Status</label>
                            <select name="status" class="w-full px-3 md:px-4 py-2 rounded-lg border" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <option value="pending">Pending</option>
                                <option value="confirmed">Confirmed</option>
                                <option value="completed">Completed</option>
                                <option value="cancelled">Cancelled</option>
                            </select>
                        </div>
                        <div class="border-t pt-3" style="border-color: var(--border-color);">
                            <label class="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" id="event-recurring" class="w-4 h-4 rounded">
                                <span class="text-sm" style="color: var(--text-primary);"><i class="fas fa-sync-alt"></i> Recurring Event</span>
                            </label>
                            <div id="recurring-options" class="hidden mt-2">
                                <label class="block text-xs mb-1" style="color: var(--text-muted);">Repeat pattern</label>
                                <select name="recurringPattern" class="w-full px-3 py-2 rounded-lg border text-sm" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                    <option value="biweekly">Bi-weekly</option>
                                    <option value="monthly">Monthly</option>
                                </select>
                            </div>
                        </div>
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button type="submit" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-1"></i> Create Event
                            </button>
                            <button type="button" onclick="window.CalendarApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
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
            
            const recurringCheck = document.getElementById('event-recurring');
            const recurringOptions = document.getElementById('recurring-options');
            if (recurringCheck) {
                recurringCheck.onchange = () => {
                    recurringOptions.classList.toggle('hidden');
                };
            }
            
            document.getElementById('add-event-form').onsubmit = async (e) => {
                e.preventDefault();
                const submitBtn = e.target.querySelector('button[type="submit"]');
                const originalText = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Creating...';
                submitBtn.disabled = true;
                
                try {
                    const formData = new FormData(e.target);
                    const startDate = new Date(`${formData.get('startDate')}T${formData.get('startTime') || '00:00'}`);
                    let endDate = new Date(`${formData.get('endDate')}T${formData.get('endTime') || '00:00'}`);
                    if (endDate < startDate) {
                        endDate = new Date(startDate);
                        endDate.setHours(startDate.getHours() + 1);
                    }
                    
                    const eventData = {
                        title: formData.get('title'),
                        description: formData.get('description') || '',
                        startDate: startDate,
                        endDate: endDate,
                        location: formData.get('location') || '',
                        status: formData.get('status') || 'pending',
                        isRecurring: recurringCheck ? recurringCheck.checked : false,
                        recurringPattern: recurringCheck && recurringCheck.checked ? formData.get('recurringPattern') : null,
                        userId: currentUser.uid,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    };
                    
                    await addDoc(collection(db, 'calendarEvents'), eventData);
                    showToast('Event created successfully! 🎉', 'success');
                    window.CalendarApp.closeModal();
                    await loadEvents();
                    renderCalendar();
                    updateUpcomingEvents();
                    updateStats();
                } catch (error) {
                    console.error('Error creating event:', error);
                    showToast('Failed to create event. Please try again.', 'error');
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                }
            };
        }
    },
    
    editEvent: async (eventId) => {
        const event = eventsCache.find(e => e.id === eventId);
        if (!event) {
            showToast('Event not found', 'error');
            return;
        }
        
        const startDate = event.startDate.toISOString().split('T')[0];
        const startTime = event.startDate.toTimeString().slice(0, 5);
        const endDate = event.endDate.toISOString().split('T')[0];
        const endTime = event.endDate.toTimeString().slice(0, 5);
        
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.CalendarApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto transform transition-all" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-edit mr-2" style="color: var(--deep-blue);"></i>Edit Event
                            </h2>
                            <p class="text-xs text-muted">Update event details</p>
                        </div>
                        <button onclick="window.CalendarApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="edit-event-form" class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Event Title *</label>
                            <input type="text" name="title" required value="${escapeHtml(event.title)}" class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Description</label>
                            <textarea name="description" rows="3" class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">${escapeHtml(event.description || '')}</textarea>
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Start Date *</label>
                                <input type="date" name="startDate" required value="${startDate}" class="w-full px-3 md:px-4 py-2 rounded-lg border" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Start Time</label>
                                <input type="time" name="startTime" value="${startTime}" class="w-full px-3 md:px-4 py-2 rounded-lg border" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">End Date</label>
                                <input type="date" name="endDate" value="${endDate}" class="w-full px-3 md:px-4 py-2 rounded-lg border" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">End Time</label>
                                <input type="time" name="endTime" value="${endTime}" class="w-full px-3 md:px-4 py-2 rounded-lg border" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Location</label>
                            <input type="text" name="location" value="${escapeHtml(event.location || '')}" placeholder="Location" class="w-full px-3 md:px-4 py-2 rounded-lg border" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Status</label>
                            <select name="status" class="w-full px-3 md:px-4 py-2 rounded-lg border" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <option value="pending" ${event.status === 'pending' ? 'selected' : ''}>Pending</option>
                                <option value="confirmed" ${event.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
                                <option value="completed" ${event.status === 'completed' ? 'selected' : ''}>Completed</option>
                                <option value="cancelled" ${event.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                            </select>
                        </div>
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button type="submit" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-1"></i> Update Event
                            </button>
                            <button type="button" onclick="window.CalendarApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
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
            
            document.getElementById('edit-event-form').onsubmit = async (e) => {
                e.preventDefault();
                const submitBtn = e.target.querySelector('button[type="submit"]');
                const originalText = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Updating...';
                submitBtn.disabled = true;
                
                try {
                    const formData = new FormData(e.target);
                    const startDate = new Date(`${formData.get('startDate')}T${formData.get('startTime') || '00:00'}`);
                    let endDate = new Date(`${formData.get('endDate')}T${formData.get('endTime') || '00:00'}`);
                    if (endDate < startDate) {
                        endDate = new Date(startDate);
                        endDate.setHours(startDate.getHours() + 1);
                    }
                    
                    await updateDoc(doc(db, 'calendarEvents', eventId), {
                        title: formData.get('title'),
                        description: formData.get('description') || '',
                        startDate: startDate,
                        endDate: endDate,
                        location: formData.get('location') || '',
                        status: formData.get('status') || 'pending',
                        updatedAt: serverTimestamp()
                    });
                    
                    showToast('Event updated successfully!', 'success');
                    window.CalendarApp.closeModal();
                    await loadEvents();
                    renderCalendar();
                    updateUpcomingEvents();
                    updateStats();
                } catch (error) {
                    console.error('Error updating event:', error);
                    showToast('Failed to update event. Please try again.', 'error');
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                }
            };
        }
    },
    
    deleteEvent: async (eventId) => {
        if (!confirm('Are you sure you want to delete this event?')) return;
        
        try {
            await deleteDoc(doc(db, 'calendarEvents', eventId));
            showToast('Event deleted successfully', 'success');
            await loadEvents();
            renderCalendar();
            updateUpcomingEvents();
            updateStats();
            window.CalendarApp.closeModal();
        } catch (error) {
            console.error('Error deleting event:', error);
            showToast('Failed to delete event. Please try again.', 'error');
        }
    },
    
    closeModal: () => {
        const container = document.getElementById('modal-container');
        if (container) {
            container.innerHTML = '';
            container.style.pointerEvents = 'none';
        }
    }
};

// Add closeModal to global scope for inline onclick handlers
window.closeModal = window.CalendarApp.closeModal;