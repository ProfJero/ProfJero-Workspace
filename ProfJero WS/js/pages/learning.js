// js/pages/learning.js
import { db, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, serverTimestamp } from '../firebase-config.js';
import { showToast, escapeHtml, formatDate, timeAgo, formatCurrency } from '../utils/helpers.js';

let currentUser = null;
let learningGoalsCache = [];
let coursesCache = [];
let studySessionsCache = [];
let certificationsCache = [];
let resourcesCache = [];
let currentView = 'courses';
let currentFilter = 'all';

// Learning Categories
const learningCategories = {
    programming: { icon: 'fa-code', color: '#3b82f6', label: 'Programming' },
    design: { icon: 'fa-paint-brush', color: '#ec4899', label: 'Design' },
    business: { icon: 'fa-chart-line', color: '#10b981', label: 'Business' },
    language: { icon: 'fa-language', color: '#8b5cf6', label: 'Language' },
    science: { icon: 'fa-flask', color: '#06b6d4', label: 'Science' },
    math: { icon: 'fa-square-root-variable', color: '#f59e0b', label: 'Mathematics' },
    humanities: { icon: 'fa-book', color: '#ef4444', label: 'Humanities' },
    health: { icon: 'fa-heartbeat', color: '#ec4899', label: 'Health & Wellness' },
    technology: { icon: 'fa-microchip', color: '#6366f1', label: 'Technology' },
    personal: { icon: 'fa-user', color: '#8b5cf6', label: 'Personal Development' }
};

// Course Difficulty Levels
const difficultyLevels = {
    beginner: { color: '#10b981', label: 'Beginner' },
    intermediate: { color: '#f59e0b', label: 'Intermediate' },
    advanced: { color: '#ef4444', label: 'Advanced' }
};

// Study Timer
let studyTimer = null;
let studyTimerSeconds = 0;
let isTimerRunning = false;

export async function renderLearningPage(user) {
    currentUser = user;
    
    return `
        <div class="space-y-6 animate-fade-in-up">
            <!-- Header -->
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 class="text-3xl font-bold" style="color: var(--text-primary);">📚 Learning Hub</h1>
                    <p class="text-muted mt-1">Track your courses, study hours, certifications, and learning progress</p>
                </div>
                <div class="flex gap-3 flex-wrap">
                    <button id="add-course-btn" class="px-5 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                        <i class="fas fa-plus"></i>
                        <span>New Course</span>
                    </button>
                    <button id="start-study-btn" class="px-5 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all hover:shadow-md" style="background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary);">
                        <i class="fas fa-play"></i>
                        <span>Study Timer</span>
                    </button>
                </div>
            </div>
            
            <!-- Study Timer Display -->
            <div class="glass-card rounded-xl p-4" id="study-timer-container">
                <div class="flex flex-col md:flex-row items-center justify-between gap-4">
                    <div class="flex items-center gap-4">
                        <div class="text-4xl font-mono font-bold" id="timer-display" style="color: var(--deep-blue);">00:00:00</div>
                        <div class="flex gap-2">
                            <button id="timer-play-btn" class="px-4 py-2 rounded-lg transition-all hover:shadow-md" style="background: var(--deep-blue); color: white;">
                                <i class="fas fa-play"></i>
                            </button>
                            <button id="timer-pause-btn" class="px-4 py-2 rounded-lg transition-all hover:shadow-md" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color);">
                                <i class="fas fa-pause"></i>
                            </button>
                            <button id="timer-reset-btn" class="px-4 py-2 rounded-lg transition-all hover:shadow-md" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color);">
                                <i class="fas fa-stop"></i>
                            </button>
                        </div>
                    </div>
                    <div class="flex items-center gap-3 flex-wrap">
                        <select id="timer-course-select" class="px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            <option value="">Select Course (Optional)</option>
                            ${coursesCache.map(c => `<option value="${c.id}">${escapeHtml(c.title)}</option>`).join('')}
                        </select>
                        <button id="log-study-btn" class="px-4 py-2 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                            <i class="fas fa-save"></i> Log Session
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- Stats Dashboard -->
            <div class="grid grid-cols-2 md:grid-cols-6 gap-3">
                <div class="glass-card p-3 rounded-xl text-center">
                    <div class="text-xl font-bold" id="stat-courses" style="color: var(--deep-blue);">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-book"></i> Courses</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center">
                    <div class="text-xl font-bold" id="stat-hours" style="color: var(--emerald);">0h</div>
                    <div class="text-xs text-muted"><i class="fas fa-clock"></i> Total Hours</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center">
                    <div class="text-xl font-bold" id="stat-sessions" style="color: var(--gold);">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-play-circle"></i> Sessions</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center">
                    <div class="text-xl font-bold" id="stat-certifications" style="color: #8b5cf6;">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-certificate"></i> Certifications</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center">
                    <div class="text-xl font-bold" id="stat-progress" style="color: #f59e0b;">0%</div>
                    <div class="text-xs text-muted"><i class="fas fa-chart-line"></i> Avg Progress</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center">
                    <div class="text-xl font-bold" id="stat-streak" style="color: #ef4444;">0d</div>
                    <div class="text-xs text-muted"><i class="fas fa-fire"></i> Study Streak</div>
                </div>
            </div>
            
            <!-- View Tabs -->
            <div class="flex flex-wrap gap-2 border-b border-custom pb-2">
                <button class="view-tab px-4 py-2 rounded-lg transition-all active" data-view="courses" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                    <i class="fas fa-book mr-1"></i> Courses
                </button>
                <button class="view-tab px-4 py-2 rounded-lg transition-all" data-view="sessions" style="background: var(--bg-secondary); color: var(--text-muted);">
                    <i class="fas fa-clock mr-1"></i> Study Sessions
                </button>
                <button class="view-tab px-4 py-2 rounded-lg transition-all" data-view="certifications" style="background: var(--bg-secondary); color: var(--text-muted);">
                    <i class="fas fa-certificate mr-1"></i> Certifications
                </button>
                <button class="view-tab px-4 py-2 rounded-lg transition-all" data-view="resources" style="background: var(--bg-secondary); color: var(--text-muted);">
                    <i class="fas fa-link mr-1"></i> Resources
                </button>
                <button class="view-tab px-4 py-2 rounded-lg transition-all" data-view="analytics" style="background: var(--bg-secondary); color: var(--text-muted);">
                    <i class="fas fa-chart-pie mr-1"></i> Analytics
                </button>
            </div>
            
            <!-- Filters & Search -->
            <div class="glass-card rounded-xl p-4">
                <div class="flex flex-col md:flex-row gap-3">
                    <div class="flex-1 relative">
                        <i class="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-muted"></i>
                        <input type="text" id="learning-search" placeholder="Search courses..." 
                               class="w-full pl-10 pr-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all" 
                               style="background: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);">
                    </div>
                    
                    <select id="learning-category-filter" class="px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all" style="background: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);">
                        <option value="all">All Categories</option>
                        ${Object.entries(learningCategories).map(([key, cat]) => 
                            `<option value="${key}"><i class="fas ${cat.icon}"></i> ${cat.label}</option>`
                        ).join('')}
                    </select>
                    
                    <select id="learning-status-filter" class="px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all" style="background: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);">
                        <option value="all">All Status</option>
                        <option value="not-started">Not Started</option>
                        <option value="in-progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="paused">Paused</option>
                    </select>
                    
                    <select id="learning-difficulty-filter" class="px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all" style="background: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);">
                        <option value="all">All Difficulty</option>
                        <option value="beginner">Beginner</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="advanced">Advanced</option>
                    </select>
                    
                    <button id="clear-filters" class="px-4 py-2 rounded-lg transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="color: var(--text-muted);">
                        <i class="fas fa-times"></i> Clear
                    </button>
                </div>
            </div>
            
            <!-- Content Container -->
            <div id="learning-container" class="space-y-4">
                <div class="text-center py-12">
                    <div class="animate-pulse"><i class="fas fa-spinner fa-spin mr-2 text-muted"></i> Loading learning content...</div>
                </div>
            </div>
        </div>
    `;
}

export async function loadLearningData() {
    if (!currentUser) return;
    await Promise.all([
        loadCourses(),
        loadStudySessions(),
        loadCertifications(),
        loadResources(),
        loadLearningGoals()
    ]);
    setupEventListeners();
    filterAndRenderContent();
    updateStats();
}

async function loadLearningGoals() {
    try {
        const q = query(
            collection(db, 'goals'),
            where('userId', '==', currentUser.uid),
            where('category', '==', 'learning')
        );
        const querySnapshot = await getDocs(q);
        learningGoalsCache = querySnapshot.docs.map(doc => {
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
        console.error('Error loading learning goals:', error);
    }
}

async function loadCourses() {
    try {
        const q = query(
            collection(db, 'courses'),
            where('userId', '==', currentUser.uid),
            orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        coursesCache = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                startDate: data.startDate?.toDate?.() || new Date(data.startDate),
                completionDate: data.completionDate?.toDate?.() || null,
                createdAt: data.createdAt?.toDate?.() || new Date(),
                updatedAt: data.updatedAt?.toDate?.() || new Date()
            };
        });
    } catch (error) {
        console.error('Error loading courses:', error);
        if (error.code === 'permission-denied') {
            showToast('Please set up courses collection in Firebase', 'info');
        }
    }
}

async function loadStudySessions() {
    try {
        const q = query(
            collection(db, 'studySessions'),
            where('userId', '==', currentUser.uid),
            orderBy('date', 'desc')
        );
        const querySnapshot = await getDocs(q);
        studySessionsCache = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                date: data.date?.toDate?.() || new Date(data.date),
                createdAt: data.createdAt?.toDate?.() || new Date()
            };
        });
    } catch (error) {
        console.error('Error loading study sessions:', error);
    }
}

async function loadCertifications() {
    try {
        const q = query(
            collection(db, 'certifications'),
            where('userId', '==', currentUser.uid),
            orderBy('dateEarned', 'desc')
        );
        const querySnapshot = await getDocs(q);
        certificationsCache = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                dateEarned: data.dateEarned?.toDate?.() || new Date(data.dateEarned),
                expiryDate: data.expiryDate?.toDate?.() || null,
                createdAt: data.createdAt?.toDate?.() || new Date()
            };
        });
    } catch (error) {
        console.error('Error loading certifications:', error);
    }
}

async function loadResources() {
    try {
        const q = query(
            collection(db, 'learningResources'),
            where('userId', '==', currentUser.uid),
            orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        resourcesCache = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate?.() || new Date()
            };
        });
    } catch (error) {
        console.error('Error loading resources:', error);
    }
}

function updateStats() {
    const totalCourses = coursesCache.length;
    const completedCourses = coursesCache.filter(c => c.status === 'completed').length;
    const totalHours = studySessionsCache.reduce((sum, s) => sum + s.hours, 0);
    const totalSessions = studySessionsCache.length;
    const totalCertifications = certificationsCache.length;
    const avgProgress = totalCourses > 0 ? Math.round(coursesCache.reduce((sum, c) => sum + (c.progress || 0), 0) / totalCourses) : 0;
    
    // Calculate study streak
    let streak = 0;
    if (studySessionsCache.length > 0) {
        const sortedSessions = [...studySessionsCache].sort((a, b) => b.date - a.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        let currentDate = today;
        for (const session of sortedSessions) {
            const sessionDate = new Date(session.date);
            sessionDate.setHours(0, 0, 0, 0);
            
            const diffDays = Math.floor((currentDate - sessionDate) / (1000 * 60 * 60 * 24));
            if (diffDays === 0 || diffDays === 1) {
                streak++;
                currentDate = sessionDate;
            } else {
                break;
            }
        }
    }
    
    document.getElementById('stat-courses').textContent = totalCourses;
    document.getElementById('stat-hours').textContent = `${totalHours.toFixed(1)}h`;
    document.getElementById('stat-sessions').textContent = totalSessions;
    document.getElementById('stat-certifications').textContent = totalCertifications;
    document.getElementById('stat-progress').textContent = `${avgProgress}%`;
    document.getElementById('stat-streak').textContent = `${streak}d`;
}

function filterAndRenderContent() {
    const view = document.querySelector('.view-tab.active')?.dataset.view || 'courses';
    
    if (view === 'courses') {
        renderCourses();
    } else if (view === 'sessions') {
        renderStudySessions();
    } else if (view === 'certifications') {
        renderCertifications();
    } else if (view === 'resources') {
        renderResources();
    } else if (view === 'analytics') {
        renderLearningAnalytics();
    }
}

function renderCourses() {
    const container = document.getElementById('learning-container');
    if (!container) return;
    
    let filtered = [...coursesCache];
    
    const searchInput = document.getElementById('learning-search');
    if (searchInput?.value) {
        const query = searchInput.value.toLowerCase();
        filtered = filtered.filter(c => 
            c.title?.toLowerCase().includes(query) || 
            c.description?.toLowerCase().includes(query) ||
            c.instructor?.toLowerCase().includes(query)
        );
    }
    
    const categoryFilter = document.getElementById('learning-category-filter');
    if (categoryFilter?.value !== 'all') {
        filtered = filtered.filter(c => c.category === categoryFilter.value);
    }
    
    const statusFilter = document.getElementById('learning-status-filter');
    if (statusFilter?.value !== 'all') {
        filtered = filtered.filter(c => c.status === statusFilter.value);
    }
    
    const difficultyFilter = document.getElementById('learning-difficulty-filter');
    if (difficultyFilter?.value !== 'all') {
        filtered = filtered.filter(c => c.difficulty === difficultyFilter.value);
    }
    
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="glass-card rounded-xl p-12 text-center">
                <i class="fas fa-book text-6xl mb-4 text-muted"></i>
                <h3 class="text-xl font-semibold mb-2" style="color: var(--text-primary);">No courses found</h3>
                <p class="text-muted">Start your learning journey by adding a new course!</p>
                <button id="empty-add-btn" class="mt-4 px-5 py-2 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                    <i class="fas fa-plus mr-1"></i> Add Course
                </button>
            </div>
        `;
        document.getElementById('empty-add-btn')?.addEventListener('click', () => window.LearningApp.showAddCourseModal());
        return;
    }
    
    container.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';
    container.innerHTML = filtered.map(course => createCourseCard(course)).join('');
}

function createCourseCard(course) {
    const category = learningCategories[course.category] || learningCategories.personal;
    const difficulty = difficultyLevels[course.difficulty] || difficultyLevels.beginner;
    const statusConfig = {
        'not-started': { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', label: 'Not Started', icon: 'fa-hourglass-start' },
        'in-progress': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', label: 'In Progress', icon: 'fa-spinner' },
        'completed': { color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', label: 'Completed', icon: 'fa-check-circle' },
        'paused': { color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)', label: 'Paused', icon: 'fa-pause' }
    };
    
    const status = course.status || 'not-started';
    const config = statusConfig[status];
    const progress = course.progress || 0;
    
    // Get study sessions for this course
    const courseSessions = studySessionsCache.filter(s => s.courseId === course.id);
    const totalHours = courseSessions.reduce((sum, s) => sum + s.hours, 0);
    const totalSessions = courseSessions.length;
    
    // Get related learning goal
    const learningGoal = learningGoalsCache.find(g => g.title.toLowerCase().includes(course.title.toLowerCase()));
    
    return `
        <div class="glass-card rounded-xl p-4 transition-all hover:shadow-lg cursor-pointer" onclick="window.LearningApp.viewCourse('${course.id}')">
            <div class="flex justify-between items-start mb-2">
                <div class="flex items-center gap-2">
                    <i class="fas ${category.icon}" style="color: ${category.color};"></i>
                    <h3 class="font-semibold" style="color: var(--text-primary);">${escapeHtml(course.title)}</h3>
                </div>
                <span class="text-xs px-2 py-0.5 rounded-full" style="background: ${config.bg}; color: ${config.color};">
                    <i class="fas ${config.icon} text-xs mr-1"></i>${config.label}
                </span>
            </div>
            
            ${course.description ? `<p class="text-sm text-muted mb-2 line-clamp-2">${escapeHtml(course.description)}</p>` : ''}
            
            <div class="flex flex-wrap gap-2 mb-2">
                <span class="text-xs px-2 py-0.5 rounded-full" style="background: ${category.color}20; color: ${category.color};">
                    <i class="fas ${category.icon}"></i> ${category.label}
                </span>
                <span class="text-xs px-2 py-0.5 rounded-full" style="background: ${difficulty.color}20; color: ${difficulty.color};">
                    ${difficulty.label}
                </span>
                ${course.instructor ? `<span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6;"><i class="fas fa-user"></i> ${escapeHtml(course.instructor)}</span>` : ''}
                ${learningGoal ? `<span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(139, 92, 246, 0.15); color: #8b5cf6;"><i class="fas fa-bullseye"></i> Goal Linked</span>` : ''}
            </div>
            
            <div class="mt-2">
                <div class="flex justify-between text-xs text-muted mb-1">
                    <span>Progress</span>
                    <span>${progress}%</span>
                </div>
                <div class="w-full h-2 rounded-full overflow-hidden" style="background: var(--border-color);">
                    <div class="h-full rounded-full transition-all" style="width: ${progress}%; background: linear-gradient(90deg, var(--deep-blue), ${progress >= 100 ? 'var(--emerald)' : 'var(--gold)'});"></div>
                </div>
            </div>
            
            <div class="flex flex-wrap gap-3 mt-2 text-xs" style="color: var(--text-muted);">
                <span><i class="fas fa-clock"></i> ${totalHours.toFixed(1)}h studied</span>
                <span><i class="fas fa-play-circle"></i> ${totalSessions} sessions</span>
                ${course.startDate ? `<span><i class="fas fa-calendar-alt"></i> Started: ${formatDate(course.startDate)}</span>` : ''}
            </div>
            
            <div class="flex gap-2 mt-3 pt-2 border-t" style="border-color: var(--border-color);">
                <button onclick="event.stopPropagation(); window.LearningApp.logStudy('${course.id}')" class="flex-1 py-1.5 text-xs rounded-lg transition-all hover:shadow-md" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color);">
                    <i class="fas fa-clock mr-1"></i> Log Study
                </button>
                <button onclick="event.stopPropagation(); window.LearningApp.updateCourse('${course.id}')" class="flex-1 py-1.5 text-xs rounded-lg transition-all hover:shadow-md" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color);">
                    <i class="fas fa-edit mr-1"></i> Update
                </button>
                <button onclick="event.stopPropagation(); window.LearningApp.deleteCourse('${course.id}')" class="px-3 py-1.5 text-xs rounded-lg transition-all hover:bg-red-100 dark:hover:bg-red-900/20" style="background: var(--bg-primary); color: #ef4444; border: 1px solid var(--border-color);">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

function renderStudySessions() {
    const container = document.getElementById('learning-container');
    if (!container) return;
    
    if (studySessionsCache.length === 0) {
        container.innerHTML = `
            <div class="glass-card rounded-xl p-12 text-center">
                <i class="fas fa-clock text-6xl mb-4 text-muted"></i>
                <h3 class="text-xl font-semibold mb-2" style="color: var(--text-primary);">No study sessions yet</h3>
                <p class="text-muted">Start the study timer or log your first session!</p>
            </div>
        `;
        return;
    }
    
    // Group by date
    const grouped = {};
    studySessionsCache.forEach(s => {
        const key = s.date.toDateString();
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(s);
    });
    
    container.className = 'space-y-4';
    container.innerHTML = Object.entries(grouped).map(([date, sessions]) => {
        const totalDayHours = sessions.reduce((sum, s) => sum + s.hours, 0);
        return `
            <div class="space-y-2">
                <div class="flex items-center gap-2">
                    <div class="w-1 h-6 rounded-full" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald));"></div>
                    <h3 class="font-semibold" style="color: var(--text-primary);">${formatDateHeader(date)}</h3>
                    <span class="text-xs text-muted">${totalDayHours.toFixed(1)}h total</span>
                </div>
                <div class="space-y-2">
                    ${sessions.map(session => {
                        const course = coursesCache.find(c => c.id === session.courseId);
                        return `
                            <div class="glass-card rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all hover:shadow-md">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background: rgba(16, 185, 129, 0.15);">
                                        <i class="fas fa-graduation-cap" style="color: var(--emerald);"></i>
                                    </div>
                                    <div>
                                        <div class="font-semibold" style="color: var(--text-primary);">${course ? escapeHtml(course.title) : 'Unknown Course'}</div>
                                        <div class="text-xs" style="color: var(--text-muted);">${session.date.toLocaleTimeString()} • ${session.hours.toFixed(1)} hours</div>
                                        ${session.notes ? `<div class="text-xs text-muted mt-1">${escapeHtml(session.notes)}</div>` : ''}
                                    </div>
                                </div>
                                <div class="flex gap-2">
                                    <button onclick="window.LearningApp.deleteSession('${session.id}')" class="p-1 rounded transition-all hover:bg-red-100 dark:hover:bg-red-900/20">
                                        <i class="fas fa-trash text-red-500"></i>
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }).join('');
}

function renderCertifications() {
    const container = document.getElementById('learning-container');
    if (!container) return;
    
    if (certificationsCache.length === 0) {
        container.innerHTML = `
            <div class="glass-card rounded-xl p-12 text-center">
                <i class="fas fa-certificate text-6xl mb-4 text-muted"></i>
                <h3 class="text-xl font-semibold mb-2" style="color: var(--text-primary);">No certifications yet</h3>
                <p class="text-muted">Track your certifications and achievements here!</p>
                <button id="empty-add-cert-btn" class="mt-4 px-5 py-2 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                    <i class="fas fa-plus mr-1"></i> Add Certification
                </button>
            </div>
        `;
        document.getElementById('empty-add-cert-btn')?.addEventListener('click', () => window.LearningApp.showAddCertificationModal());
        return;
    }
    
    container.className = 'grid grid-cols-1 md:grid-cols-2 gap-4';
    container.innerHTML = certificationsCache.map(cert => {
        const isExpired = cert.expiryDate && cert.expiryDate < new Date();
        return `
            <div class="glass-card rounded-xl p-4 transition-all hover:shadow-lg">
                <div class="flex items-start gap-3">
                    <div class="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0" style="background: rgba(139, 92, 246, 0.15);">
                        <i class="fas fa-certificate text-2xl" style="color: #8b5cf6;"></i>
                    </div>
                    <div class="flex-1">
                        <h3 class="font-semibold" style="color: var(--text-primary);">${escapeHtml(cert.title)}</h3>
                        ${cert.issuer ? `<div class="text-sm" style="color: var(--text-muted);">Issued by: ${escapeHtml(cert.issuer)}</div>` : ''}
                        <div class="flex flex-wrap gap-2 mt-2">
                            <span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(16, 185, 129, 0.15); color: var(--emerald);">
                                <i class="fas fa-calendar-alt mr-1"></i> ${formatDate(cert.dateEarned)}
                            </span>
                            ${cert.expiryDate ? `
                                <span class="text-xs px-2 py-0.5 rounded-full" style="background: ${isExpired ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)'}; color: ${isExpired ? '#ef4444' : '#f59e0b'};">
                                    <i class="fas fa-clock mr-1"></i> ${isExpired ? 'Expired' : `Expires: ${formatDate(cert.expiryDate)}`}
                                </span>
                            ` : ''}
                            ${cert.credentialId ? `<span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6;">ID: ${escapeHtml(cert.credentialId)}</span>` : ''}
                        </div>
                        ${cert.url ? `<a href="${cert.url}" target="_blank" class="text-sm text-deep-blue hover:underline mt-2 inline-block"><i class="fas fa-external-link-alt mr-1"></i>View Certificate</a>` : ''}
                    </div>
                    <div class="flex gap-1">
                        <button onclick="window.LearningApp.deleteCertification('${cert.id}')" class="p-1 rounded transition-all hover:bg-red-100 dark:hover:bg-red-900/20">
                            <i class="fas fa-trash text-red-500"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderResources() {
    const container = document.getElementById('learning-container');
    if (!container) return;
    
    if (resourcesCache.length === 0) {
        container.innerHTML = `
            <div class="glass-card rounded-xl p-12 text-center">
                <i class="fas fa-link text-6xl mb-4 text-muted"></i>
                <h3 class="text-xl font-semibold mb-2" style="color: var(--text-primary);">No learning resources yet</h3>
                <p class="text-muted">Save useful learning resources like links, books, and articles!</p>
                <button id="empty-add-resource-btn" class="mt-4 px-5 py-2 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                    <i class="fas fa-plus mr-1"></i> Add Resource
                </button>
            </div>
        `;
        document.getElementById('empty-add-resource-btn')?.addEventListener('click', () => window.LearningApp.showAddResourceModal());
        return;
    }
    
    container.className = 'grid grid-cols-1 md:grid-cols-2 gap-4';
    container.innerHTML = resourcesCache.map(resource => `
        <div class="glass-card rounded-xl p-4 transition-all hover:shadow-lg">
            <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style="background: rgba(59, 130, 246, 0.15);">
                    <i class="fas ${resource.type === 'book' ? 'fa-book' : resource.type === 'video' ? 'fa-video' : resource.type === 'article' ? 'fa-newspaper' : 'fa-link'}" style="color: #3b82f6;"></i>
                </div>
                <div class="flex-1">
                    <h3 class="font-semibold" style="color: var(--text-primary);">${escapeHtml(resource.title)}</h3>
                    ${resource.description ? `<p class="text-sm text-muted">${escapeHtml(resource.description)}</p>` : ''}
                    <div class="flex flex-wrap gap-2 mt-2">
                        <span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6;">
                            <i class="fas fa-tag mr-1"></i> ${resource.type || 'link'}
                        </span>
                        ${resource.category ? `<span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(16, 185, 129, 0.15); color: var(--emerald);">${escapeHtml(resource.category)}</span>` : ''}
                    </div>
                    ${resource.url ? `<a href="${resource.url}" target="_blank" class="text-sm text-deep-blue hover:underline mt-2 inline-block"><i class="fas fa-external-link-alt mr-1"></i>Open Resource</a>` : ''}
                </div>
                <div class="flex gap-1">
                    <button onclick="window.LearningApp.deleteResource('${resource.id}')" class="p-1 rounded transition-all hover:bg-red-100 dark:hover:bg-red-900/20">
                        <i class="fas fa-trash text-red-500"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

function renderLearningAnalytics() {
    const container = document.getElementById('learning-container');
    if (!container) return;
    
    const totalCourses = coursesCache.length;
    const completedCourses = coursesCache.filter(c => c.status === 'completed').length;
    const inProgressCourses = coursesCache.filter(c => c.status === 'in-progress').length;
    const totalHours = studySessionsCache.reduce((sum, s) => sum + s.hours, 0);
    const totalSessions = studySessionsCache.length;
    const totalCertifications = certificationsCache.length;
    const avgProgress = totalCourses > 0 ? Math.round(coursesCache.reduce((sum, c) => sum + (c.progress || 0), 0) / totalCourses) : 0;
    
    // Category breakdown
    const categoryStats = {};
    coursesCache.forEach(c => {
        const cat = c.category || 'personal';
        if (!categoryStats[cat]) categoryStats[cat] = { total: 0, completed: 0 };
        categoryStats[cat].total++;
        if (c.status === 'completed') categoryStats[cat].completed++;
    });
    
    // Study hours by course
    const courseHours = {};
    studySessionsCache.forEach(s => {
        if (!courseHours[s.courseId]) courseHours[s.courseId] = 0;
        courseHours[s.courseId] += s.hours;
    });
    
    // Recent study activity (last 7 days)
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recentSessions = studySessionsCache.filter(s => s.date >= weekAgo);
    const hoursThisWeek = recentSessions.reduce((sum, s) => sum + s.hours, 0);
    
    // Daily study chart data
    const dailyData = {};
    for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const key = date.toDateString();
        dailyData[key] = 0;
    }
    studySessionsCache.forEach(s => {
        const key = s.date.toDateString();
        if (dailyData[key] !== undefined) {
            dailyData[key] += s.hours;
        }
    });
    
    const dailyLabels = Object.keys(dailyData).map(d => new Date(d).toLocaleDateString('en-US', { weekday: 'short' }));
    const dailyValues = Object.values(dailyData);
    
    return `
        <div class="space-y-6">
            <!-- Quick Stats -->
            <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div class="glass-card p-3 rounded-xl text-center">
                    <div class="text-xl font-bold" style="color: var(--deep-blue);">${totalCourses}</div>
                    <div class="text-xs text-muted">Total Courses</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center">
                    <div class="text-xl font-bold" style="color: var(--emerald);">${completedCourses}</div>
                    <div class="text-xs text-muted">Completed</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center">
                    <div class="text-xl font-bold" style="color: var(--gold);">${inProgressCourses}</div>
                    <div class="text-xs text-muted">In Progress</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center">
                    <div class="text-xl font-bold" style="color: #8b5cf6;">${totalHours.toFixed(1)}h</div>
                    <div class="text-xs text-muted">Total Hours</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center">
                    <div class="text-xl font-bold" style="color: #f59e0b;">${hoursThisWeek.toFixed(1)}h</div>
                    <div class="text-xs text-muted">Hours This Week</div>
                </div>
            </div>
            
            <!-- Study Hours Chart -->
            <div class="glass-card rounded-xl p-4">
                <h4 class="font-semibold mb-3" style="color: var(--text-primary);">
                    <i class="fas fa-chart-bar mr-2" style="color: var(--deep-blue);"></i>Study Hours (Last 7 Days)
                </h4>
                <div class="w-full h-64">
                    <canvas id="study-hours-chart-${Date.now()}"></canvas>
                </div>
            </div>
            
            <!-- Category Breakdown -->
            <div class="glass-card rounded-xl p-4">
                <h4 class="font-semibold mb-3" style="color: var(--text-primary);">
                    <i class="fas fa-chart-pie mr-2" style="color: var(--emerald);"></i>Category Breakdown
                </h4>
                <div class="space-y-2">
                    ${Object.entries(categoryStats).map(([cat, stats]) => {
                        const category = learningCategories[cat] || learningCategories.personal;
                        const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
                        return `
                            <div class="p-2 rounded-lg" style="background: var(--bg-primary);">
                                <div class="flex justify-between items-center">
                                    <div>
                                        <i class="fas ${category.icon}" style="color: ${category.color};"></i>
                                        <span class="font-medium ml-2" style="color: var(--text-primary);">${category.label}</span>
                                        <span class="text-xs text-muted ml-2">(${stats.completed}/${stats.total})</span>
                                    </div>
                                    <span class="text-sm" style="color: var(--text-muted);">${completionRate}%</span>
                                </div>
                                <div class="w-full h-1.5 rounded-full overflow-hidden mt-1" style="background: var(--border-color);">
                                    <div class="h-full rounded-full transition-all" style="width: ${completionRate}%; background: ${category.color};"></div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
            
            <!-- Top Courses by Study Time -->
            <div class="glass-card rounded-xl p-4">
                <h4 class="font-semibold mb-3" style="color: var(--text-primary);">
                    <i class="fas fa-trophy mr-2" style="color: var(--gold);"></i>Most Studied Courses
                </h4>
                <div class="space-y-2">
                    ${Object.entries(courseHours)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 5)
                        .map(([courseId, hours]) => {
                            const course = coursesCache.find(c => c.id === courseId);
                            return course ? `
                                <div class="flex justify-between items-center p-2 rounded" style="background: var(--bg-primary);">
                                    <span style="color: var(--text-primary);">${escapeHtml(course.title)}</span>
                                    <span class="font-semibold" style="color: var(--deep-blue);">${hours.toFixed(1)}h</span>
                                </div>
                            ` : '';
                        }).join('')}
                    ${Object.keys(courseHours).length === 0 ? '<div class="text-center text-muted py-4">No study data available</div>' : ''}
                </div>
            </div>
            
            <!-- Learning Insights -->
            <div class="glass-card p-4 rounded-xl" style="border-left: 4px solid #8b5cf6;">
                <h4 class="font-semibold mb-2" style="color: var(--text-primary);">
                    <i class="fas fa-lightbulb mr-2" style="color: #8b5cf6;"></i>Learning Insights
                </h4>
                <div class="space-y-1 text-sm" style="color: var(--text-secondary);">
                    ${totalCourses > 0 ? `
                        <p>📚 You're studying <strong style="color: var(--text-primary);">${totalCourses}</strong> courses with <strong style="color: var(--text-primary);">${completedCourses}</strong> completed.</p>
                        <p>⏱️ You've spent <strong style="color: var(--text-primary);">${totalHours.toFixed(1)}</strong> hours learning across <strong style="color: var(--text-primary);">${totalSessions}</strong> sessions.</p>
                        ${totalCertifications > 0 ? `<p>🏆 You've earned <strong style="color: var(--text-primary);">${totalCertifications}</strong> certifications!</p>` : ''}
                        ${avgProgress < 50 && totalCourses > 0 ? `<p>💡 Tip: Focus on completing one course at a time to improve your completion rate.</p>` : ''}
                        ${hoursThisWeek < 2 && totalCourses > 0 ? `<p>⏰ Try to study at least 30 minutes daily to maintain momentum.</p>` : ''}
                        ${completedCourses > 0 && completedCourses === totalCourses ? `<p>🎉 Amazing! You've completed all your courses! Time to add more!</p>` : ''}
                    ` : '<p>Start your learning journey by adding your first course!</p>'}
                </div>
            </div>
            
            <!-- Refresh Button -->
            <div class="text-center">
                <button onclick="window.LearningApp.refreshAnalytics()" class="px-6 py-2 rounded-lg font-semibold transition-all hover:shadow-md" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color);">
                    <i class="fas fa-sync-alt mr-2"></i> Refresh Analytics
                </button>
            </div>
        </div>
    `;
}

function setupEventListeners() {
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
            filterAndRenderContent();
        });
    });
    
    // Search and filters
    document.getElementById('learning-search')?.addEventListener('input', () => filterAndRenderContent());
    document.getElementById('learning-category-filter')?.addEventListener('change', () => filterAndRenderContent());
    document.getElementById('learning-status-filter')?.addEventListener('change', () => filterAndRenderContent());
    document.getElementById('learning-difficulty-filter')?.addEventListener('change', () => filterAndRenderContent());
    
    // Clear filters
    document.getElementById('clear-filters')?.addEventListener('click', () => {
        document.getElementById('learning-search').value = '';
        document.getElementById('learning-category-filter').value = 'all';
        document.getElementById('learning-status-filter').value = 'all';
        document.getElementById('learning-difficulty-filter').value = 'all';
        filterAndRenderContent();
    });
    
    // Add course button
    document.getElementById('add-course-btn')?.addEventListener('click', () => window.LearningApp.showAddCourseModal());
    
    // Study timer - with proper null checks
    const timerPlayBtn = document.getElementById('timer-play-btn');
    const timerPauseBtn = document.getElementById('timer-pause-btn');
    const timerResetBtn = document.getElementById('timer-reset-btn');
    const logStudyBtn = document.getElementById('log-study-btn');
    const startStudyBtn = document.getElementById('start-study-btn');
    
    if (startStudyBtn) {
        startStudyBtn.addEventListener('click', () => {
            if (studyTimer) {
                clearInterval(studyTimer);
                studyTimer = null;
            }
            isTimerRunning = false;
            studyTimerSeconds = 0;
            updateTimerDisplay();
            if (timerPlayBtn) {
                timerPlayBtn.style.display = 'inline-flex';
                timerPlayBtn.click();
            }
        });
    }
    
    if (timerPlayBtn) {
        timerPlayBtn.addEventListener('click', () => {
            if (!isTimerRunning) {
                isTimerRunning = true;
                if (studyTimer) {
                    clearInterval(studyTimer);
                }
                studyTimer = setInterval(() => {
                    studyTimerSeconds++;
                    updateTimerDisplay();
                }, 1000);
                timerPlayBtn.style.display = 'none';
            }
        });
    }
    
    if (timerPauseBtn) {
        timerPauseBtn.addEventListener('click', () => {
            if (isTimerRunning) {
                isTimerRunning = false;
                if (studyTimer) {
                    clearInterval(studyTimer);
                    studyTimer = null;
                }
                if (timerPlayBtn) timerPlayBtn.style.display = 'inline-flex';
            }
        });
    }
    
    if (timerResetBtn) {
        timerResetBtn.addEventListener('click', () => {
            if (studyTimer) {
                clearInterval(studyTimer);
                studyTimer = null;
            }
            isTimerRunning = false;
            studyTimerSeconds = 0;
            updateTimerDisplay();
            if (timerPlayBtn) timerPlayBtn.style.display = 'inline-flex';
        });
    }
    
    if (logStudyBtn) {
        logStudyBtn.addEventListener('click', () => {
            if (studyTimerSeconds < 60) {
                showToast('Please study for at least 1 minute before logging!', 'warning');
                return;
            }
            
            const hours = studyTimerSeconds / 3600;
            const courseSelect = document.getElementById('timer-course-select');
            const courseId = courseSelect ? courseSelect.value : null;
            window.LearningApp.logStudySession(courseId, hours);
        });
    }
}

function updateTimerDisplay() {
    const display = document.getElementById('timer-display');
    if (!display) return; // Exit if element doesn't exist
    
    const hours = Math.floor(studyTimerSeconds / 3600);
    const minutes = Math.floor((studyTimerSeconds % 3600) / 60);
    const seconds = studyTimerSeconds % 60;
    display.textContent = 
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatDateHeader(dateStr) {
    const date = new Date(dateStr);
    const today = new Date().toDateString();
    if (dateStr === today) return 'Today';
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    if (dateStr === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ============= GLOBAL LEARNING APP OBJECT =============

window.LearningApp = {
    refreshAnalytics: function() {
        showToast('Refreshing analytics...', 'info');
        const view = document.querySelector('.view-tab.active')?.dataset.view || 'courses';
        if (view === 'analytics') {
            filterAndRenderContent();
            setTimeout(() => {
                initLearningCharts();
                showToast('Analytics refreshed!', 'success');
            }, 200);
        } else {
            const analyticsTab = document.querySelector('.view-tab[data-view="analytics"]');
            if (analyticsTab) analyticsTab.click();
        }
    },
    
    showAddCourseModal: function() {
        const today = new Date().toISOString().split('T')[0];
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.LearningApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto transform transition-all" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-book mr-2" style="color: var(--deep-blue);"></i>Add New Course
                            </h2>
                            <p class="text-xs text-muted">Start tracking your learning journey</p>
                        </div>
                        <button onclick="window.LearningApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="add-course-form" class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Course Title *</label>
                            <input type="text" name="title" required placeholder="e.g., JavaScript Masterclass" 
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Description</label>
                            <textarea name="description" rows="2" placeholder="Course description..."
                                      class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></textarea>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Category</label>
                                <select name="category" class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                        style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    ${Object.entries(learningCategories).map(([key, cat]) => 
                                        `<option value="${key}"><i class="fas ${cat.icon}"></i> ${cat.label}</option>`
                                    ).join('')}
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Difficulty</label>
                                <select name="difficulty" class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                        style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    <option value="beginner">Beginner</option>
                                    <option value="intermediate" selected>Intermediate</option>
                                    <option value="advanced">Advanced</option>
                                </select>
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Instructor (Optional)</label>
                            <input type="text" name="instructor" placeholder="Instructor name"
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Start Date</label>
                                <input type="date" name="startDate" value="${today}"
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Status</label>
                                <select name="status" class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                        style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    <option value="not-started">Not Started</option>
                                    <option value="in-progress" selected>In Progress</option>
                                    <option value="paused">Paused</option>
                                </select>
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Progress (%)</label>
                            <input type="range" name="progress" min="0" max="100" value="0"
                                   class="w-full cursor-pointer" id="course-progress-slider">
                            <div class="text-right text-sm text-muted mt-1" id="course-progress-display">0%</div>
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button type="submit" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-1"></i> Add Course
                            </button>
                            <button type="button" onclick="window.LearningApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
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
            
            const slider = document.getElementById('course-progress-slider');
            const display = document.getElementById('course-progress-display');
            if (slider && display) {
                slider.oninput = () => display.textContent = `${slider.value}%`;
            }
            
            document.getElementById('add-course-form').onsubmit = async (e) => {
                e.preventDefault();
                const submitBtn = e.target.querySelector('button[type="submit"]');
                const originalText = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Adding...';
                submitBtn.disabled = true;
                
                try {
                    const formData = new FormData(e.target);
                    const courseData = {
                        title: formData.get('title'),
                        description: formData.get('description') || '',
                        category: formData.get('category'),
                        difficulty: formData.get('difficulty'),
                        instructor: formData.get('instructor') || '',
                        status: formData.get('status'),
                        progress: parseInt(formData.get('progress')) || 0,
                        startDate: formData.get('startDate') ? new Date(formData.get('startDate')) : null,
                        userId: currentUser.uid,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    };
                    
                    await addDoc(collection(db, 'courses'), courseData);
                    showToast('Course added successfully! 📚', 'success');
                    window.LearningApp.closeModal();
                    await loadCourses();
                    filterAndRenderContent();
                    updateStats();
                } catch (error) {
                    console.error('Error adding course:', error);
                    showToast('Failed to add course. Please try again.', 'error');
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                }
            };
        }
    },
    
    showAddCertificationModal: function() {
        const today = new Date().toISOString().split('T')[0];
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.LearningApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto transform transition-all" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-certificate mr-2" style="color: #8b5cf6;"></i>Add Certification
                            </h2>
                            <p class="text-xs text-muted">Track your professional certifications</p>
                        </div>
                        <button onclick="window.LearningApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="add-certification-form" class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Certification Title *</label>
                            <input type="text" name="title" required placeholder="e.g., AWS Certified Developer" 
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Issuing Organization</label>
                            <input type="text" name="issuer" placeholder="e.g., Amazon Web Services"
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Credential ID (Optional)</label>
                            <input type="text" name="credentialId" placeholder="e.g., AWS-12345"
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Date Earned *</label>
                                <input type="date" name="dateEarned" required value="${today}"
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Expiry Date (Optional)</label>
                                <input type="date" name="expiryDate"
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Verification URL (Optional)</label>
                            <input type="url" name="url" placeholder="https://..."
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button type="submit" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, #8b5cf6, var(--deep-blue)); color: white;">
                                <i class="fas fa-save mr-1"></i> Add Certification
                            </button>
                            <button type="button" onclick="window.LearningApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
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
            
            document.getElementById('add-certification-form').onsubmit = async (e) => {
                e.preventDefault();
                const submitBtn = e.target.querySelector('button[type="submit"]');
                const originalText = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Adding...';
                submitBtn.disabled = true;
                
                try {
                    const formData = new FormData(e.target);
                    const certData = {
                        title: formData.get('title'),
                        issuer: formData.get('issuer') || '',
                        credentialId: formData.get('credentialId') || '',
                        dateEarned: new Date(formData.get('dateEarned')),
                        expiryDate: formData.get('expiryDate') ? new Date(formData.get('expiryDate')) : null,
                        url: formData.get('url') || '',
                        userId: currentUser.uid,
                        createdAt: serverTimestamp()
                    };
                    
                    await addDoc(collection(db, 'certifications'), certData);
                    showToast('Certification added successfully! 🏆', 'success');
                    window.LearningApp.closeModal();
                    await loadCertifications();
                    filterAndRenderContent();
                    updateStats();
                } catch (error) {
                    console.error('Error adding certification:', error);
                    showToast('Failed to add certification. Please try again.', 'error');
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                }
            };
        }
    },
    
    showAddResourceModal: function() {
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.LearningApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto transform transition-all" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-link mr-2" style="color: #3b82f6;"></i>Add Learning Resource
                            </h2>
                            <p class="text-xs text-muted">Save useful learning materials</p>
                        </div>
                        <button onclick="window.LearningApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="add-resource-form" class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Resource Title *</label>
                            <input type="text" name="title" required placeholder="e.g., JavaScript: The Good Parts" 
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Description</label>
                            <textarea name="description" rows="2" placeholder="Brief description..."
                                      class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></textarea>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">URL</label>
                            <input type="url" name="url" placeholder="https://..."
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Type</label>
                                <select name="type" class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                        style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    <option value="link">Link</option>
                                    <option value="book">Book</option>
                                    <option value="video">Video</option>
                                    <option value="article">Article</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Category</label>
                                <input type="text" name="category" placeholder="e.g., JavaScript"
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button type="submit" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, #3b82f6, var(--deep-blue)); color: white;">
                                <i class="fas fa-save mr-1"></i> Add Resource
                            </button>
                            <button type="button" onclick="window.LearningApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
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
            
            document.getElementById('add-resource-form').onsubmit = async (e) => {
                e.preventDefault();
                const submitBtn = e.target.querySelector('button[type="submit"]');
                const originalText = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Adding...';
                submitBtn.disabled = true;
                
                try {
                    const formData = new FormData(e.target);
                    const resourceData = {
                        title: formData.get('title'),
                        description: formData.get('description') || '',
                        url: formData.get('url') || '',
                        type: formData.get('type') || 'link',
                        category: formData.get('category') || '',
                        userId: currentUser.uid,
                        createdAt: serverTimestamp()
                    };
                    
                    await addDoc(collection(db, 'learningResources'), resourceData);
                    showToast('Resource added successfully! 🔗', 'success');
                    window.LearningApp.closeModal();
                    await loadResources();
                    filterAndRenderContent();
                } catch (error) {
                    console.error('Error adding resource:', error);
                    showToast('Failed to add resource. Please try again.', 'error');
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                }
            };
        }
    },
    
    logStudySession: async function(courseId, hours) {
        try {
            const sessionData = {
                courseId: courseId || null,
                hours: hours,
                date: new Date(),
                notes: `Studied for ${hours.toFixed(2)} hours`,
                userId: currentUser.uid,
                createdAt: serverTimestamp()
            };
            
            await addDoc(collection(db, 'studySessions'), sessionData);
            
            // Update course progress if linked
            if (courseId) {
                const course = coursesCache.find(c => c.id === courseId);
                if (course && course.status !== 'completed') {
                    const progressIncrement = Math.min(hours * 2, 10);
                    const newProgress = Math.min(100, (course.progress || 0) + progressIncrement);
                    
                    await updateDoc(doc(db, 'courses', courseId), {
                        progress: newProgress,
                        status: newProgress >= 100 ? 'completed' : 'in-progress',
                        completionDate: newProgress >= 100 ? serverTimestamp() : null,
                        updatedAt: serverTimestamp()
                    });
                }
            }
            
            // Reset timer
            if (studyTimer) {
                clearInterval(studyTimer);
                studyTimer = null;
            }
            isTimerRunning = false;
            studyTimerSeconds = 0;
            updateTimerDisplay();
            const playBtn = document.getElementById('timer-play-btn');
            if (playBtn) playBtn.style.display = 'inline-flex';
            
            // Reset course select
            const courseSelect = document.getElementById('timer-course-select');
            if (courseSelect) courseSelect.value = '';
            
            showToast(`Study session logged! ${hours.toFixed(2)} hours 📚`, 'success');
            await loadStudySessions();
            await loadCourses();
            filterAndRenderContent();
            updateStats();
        } catch (error) {
            console.error('Error logging study session:', error);
            showToast('Failed to log study session. Please try again.', 'error');
        }
    },
    
    logStudy: function(courseId) {
        const course = coursesCache.find(c => c.id === courseId);
        if (!course) return;
        
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.LearningApp.closeModal()">
                <div class="rounded-2xl w-full max-w-sm mx-auto transform transition-all" style="background: var(--bg-secondary);">
                    <div class="flex justify-between items-center p-5 border-b" style="border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-clock mr-2" style="color: var(--deep-blue);"></i>Log Study Time
                            </h2>
                            <p class="text-xs text-muted">${escapeHtml(course.title)}</p>
                        </div>
                        <button onclick="window.LearningApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <div class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Hours Studied</label>
                            <input type="number" id="study-hours-input" step="0.5" min="0.5" value="1" 
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Notes (Optional)</label>
                            <textarea id="study-notes-input" rows="2" placeholder="What did you learn?"
                                      class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></textarea>
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button onclick="window.LearningApp.saveStudyLog('${courseId}')" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-1"></i> Log Session
                            </button>
                            <button type="button" onclick="window.LearningApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
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
        }
    },
    
    saveStudyLog: async function(courseId) {
        const hoursInput = document.getElementById('study-hours-input');
        const notesInput = document.getElementById('study-notes-input');
        
        const hours = parseFloat(hoursInput?.value) || 0;
        if (hours < 0.5) {
            showToast('Please study for at least 0.5 hours!', 'warning');
            return;
        }
        
        try {
            const sessionData = {
                courseId: courseId,
                hours: hours,
                date: new Date(),
                notes: notesInput?.value || '',
                userId: currentUser.uid,
                createdAt: serverTimestamp()
            };
            
            await addDoc(collection(db, 'studySessions'), sessionData);
            
            // Update course progress
            const course = coursesCache.find(c => c.id === courseId);
            if (course && course.status !== 'completed') {
                const progressIncrement = Math.min(hours * 2, 10);
                const newProgress = Math.min(100, (course.progress || 0) + progressIncrement);
                
                await updateDoc(doc(db, 'courses', courseId), {
                    progress: newProgress,
                    status: newProgress >= 100 ? 'completed' : 'in-progress',
                    completionDate: newProgress >= 100 ? serverTimestamp() : null,
                    updatedAt: serverTimestamp()
                });
            }
            
            showToast(`Study session logged! ${hours} hours 📚`, 'success');
            window.LearningApp.closeModal();
            await loadStudySessions();
            await loadCourses();
            filterAndRenderContent();
            updateStats();
        } catch (error) {
            console.error('Error logging study session:', error);
            showToast('Failed to log study session. Please try again.', 'error');
        }
    },
    
    viewCourse: function(courseId) {
        const course = coursesCache.find(c => c.id === courseId);
        if (!course) {
            showToast('Course not found', 'error');
            return;
        }
        
        const category = learningCategories[course.category] || learningCategories.personal;
        const difficulty = difficultyLevels[course.difficulty] || difficultyLevels.beginner;
        const statusConfig = {
            'not-started': { color: '#8b5cf6', label: 'Not Started' },
            'in-progress': { color: '#f59e0b', label: 'In Progress' },
            'completed': { color: '#10b981', label: 'Completed' },
            'paused': { color: '#6b7280', label: 'Paused' }
        };
        const config = statusConfig[course.status] || statusConfig['not-started'];
        
        const courseSessions = studySessionsCache.filter(s => s.courseId === courseId);
        const totalHours = courseSessions.reduce((sum, s) => sum + s.hours, 0);
        const totalSessions = courseSessions.length;
        
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.LearningApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto transform transition-all" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl font-bold" style="color: var(--text-primary);">${escapeHtml(course.title)}</h2>
                            <p class="text-xs text-muted">Course Details</p>
                        </div>
                        <button onclick="window.LearningApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <div class="p-5 space-y-4">
                        ${course.description ? `<p style="color: var(--text-primary);">${escapeHtml(course.description)}</p>` : ''}
                        
                        <div class="grid grid-cols-2 gap-2">
                            <div class="p-2 rounded-lg" style="background: var(--bg-primary);">
                                <div class="text-xs text-muted">Category</div>
                                <div class="font-semibold" style="color: var(--text-primary);"><i class="fas ${category.icon}" style="color: ${category.color};"></i> ${category.label}</div>
                            </div>
                            <div class="p-2 rounded-lg" style="background: var(--bg-primary);">
                                <div class="text-xs text-muted">Difficulty</div>
                                <div class="font-semibold" style="color: var(--text-primary);">${difficulty.label}</div>
                            </div>
                            <div class="p-2 rounded-lg" style="background: var(--bg-primary);">
                                <div class="text-xs text-muted">Status</div>
                                <div class="font-semibold" style="color: ${config.color};">${config.label}</div>
                            </div>
                            <div class="p-2 rounded-lg" style="background: var(--bg-primary);">
                                <div class="text-xs text-muted">Progress</div>
                                <div class="font-semibold" style="color: var(--text-primary);">${course.progress || 0}%</div>
                            </div>
                        </div>
                        
                        ${course.instructor ? `<div class="text-sm text-muted"><i class="fas fa-user mr-2"></i>Instructor: ${escapeHtml(course.instructor)}</div>` : ''}
                        ${course.startDate ? `<div class="text-sm text-muted"><i class="fas fa-calendar-alt mr-2"></i>Started: ${formatDate(course.startDate)}</div>` : ''}
                        ${course.completionDate ? `<div class="text-sm text-muted"><i class="fas fa-check-circle mr-2" style="color: var(--emerald);"></i>Completed: ${formatDate(course.completionDate)}</div>` : ''}
                        
                        <div class="p-3 rounded-lg" style="background: var(--bg-primary);">
                            <h4 class="font-semibold text-sm mb-2" style="color: var(--text-primary);"><i class="fas fa-clock mr-2"></i>Study Statistics</h4>
                            <div class="grid grid-cols-2 gap-2 text-sm">
                                <div><span class="text-muted">Total Hours:</span> <span class="font-semibold">${totalHours.toFixed(1)}h</span></div>
                                <div><span class="text-muted">Sessions:</span> <span class="font-semibold">${totalSessions}</span></div>
                            </div>
                        </div>
                        
                        ${courseSessions.length > 0 ? `
                            <div>
                                <h4 class="font-semibold text-sm mb-2" style="color: var(--text-primary);"><i class="fas fa-history mr-2"></i>Recent Sessions</h4>
                                <div class="space-y-1 max-h-32 overflow-y-auto">
                                    ${courseSessions.slice(0, 5).map(s => `
                                        <div class="flex justify-between text-xs p-1 rounded" style="background: var(--bg-primary);">
                                            <span style="color: var(--text-muted);">${formatDate(s.date)}</span>
                                            <span class="font-semibold" style="color: var(--deep-blue);">${s.hours.toFixed(1)}h</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                        
                        <div class="flex flex-wrap gap-2 pt-2 border-t" style="border-color: var(--border-color);">
                            <button onclick="window.LearningApp.closeModal(); window.LearningApp.logStudy('${course.id}')" class="flex-1 py-2 rounded-lg font-semibold transition-all hover:shadow-md" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color);">
                                <i class="fas fa-clock mr-1"></i> Log Study
                            </button>
                            <button onclick="window.LearningApp.closeModal(); window.LearningApp.updateCourse('${course.id}')" class="flex-1 py-2 rounded-lg font-semibold transition-all hover:shadow-md" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color);">
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
    
    updateCourse: async function(courseId) {
        const course = coursesCache.find(c => c.id === courseId);
        if (!course) return;
        
        const startDate = course.startDate ? course.startDate.toISOString().split('T')[0] : '';
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.LearningApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto transform transition-all" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-edit mr-2" style="color: var(--deep-blue);"></i>Edit Course
                            </h2>
                            <p class="text-xs text-muted">Update course details</p>
                        </div>
                        <button onclick="window.LearningApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="edit-course-form" class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Course Title *</label>
                            <input type="text" name="title" required value="${escapeHtml(course.title)}"
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Description</label>
                            <textarea name="description" rows="2"
                                      class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">${escapeHtml(course.description || '')}</textarea>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Category</label>
                                <select name="category" class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                        style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    ${Object.entries(learningCategories).map(([key, cat]) => 
                                        `<option value="${key}" ${key === course.category ? 'selected' : ''}><i class="fas ${cat.icon}"></i> ${cat.label}</option>`
                                    ).join('')}
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Difficulty</label>
                                <select name="difficulty" class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                        style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    <option value="beginner" ${course.difficulty === 'beginner' ? 'selected' : ''}>Beginner</option>
                                    <option value="intermediate" ${course.difficulty === 'intermediate' ? 'selected' : ''}>Intermediate</option>
                                    <option value="advanced" ${course.difficulty === 'advanced' ? 'selected' : ''}>Advanced</option>
                                </select>
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Instructor</label>
                            <input type="text" name="instructor" value="${escapeHtml(course.instructor || '')}"
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Start Date</label>
                                <input type="date" name="startDate" value="${startDate}"
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Status</label>
                                <select name="status" class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                        style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    <option value="not-started" ${course.status === 'not-started' ? 'selected' : ''}>Not Started</option>
                                    <option value="in-progress" ${course.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
                                    <option value="completed" ${course.status === 'completed' ? 'selected' : ''}>Completed</option>
                                    <option value="paused" ${course.status === 'paused' ? 'selected' : ''}>Paused</option>
                                </select>
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Progress (%)</label>
                            <input type="range" name="progress" min="0" max="100" value="${course.progress || 0}"
                                   class="w-full cursor-pointer" id="edit-course-progress-slider">
                            <div class="text-right text-sm text-muted mt-1" id="edit-course-progress-display">${course.progress || 0}%</div>
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button type="submit" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-1"></i> Update Course
                            </button>
                            <button type="button" onclick="window.LearningApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
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
            
            const slider = document.getElementById('edit-course-progress-slider');
            const display = document.getElementById('edit-course-progress-display');
            if (slider && display) {
                slider.oninput = () => display.textContent = `${slider.value}%`;
            }
            
            document.getElementById('edit-course-form').onsubmit = async (e) => {
                e.preventDefault();
                const submitBtn = e.target.querySelector('button[type="submit"]');
                const originalText = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Updating...';
                submitBtn.disabled = true;
                
                try {
                    const formData = new FormData(e.target);
                    const progress = parseInt(formData.get('progress')) || 0;
                    const status = formData.get('status');
                    
                    const updateData = {
                        title: formData.get('title'),
                        description: formData.get('description') || '',
                        category: formData.get('category'),
                        difficulty: formData.get('difficulty'),
                        instructor: formData.get('instructor') || '',
                        status: status,
                        progress: progress,
                        startDate: formData.get('startDate') ? new Date(formData.get('startDate')) : null,
                        completionDate: progress >= 100 ? serverTimestamp() : null,
                        updatedAt: serverTimestamp()
                    };
                    
                    await updateDoc(doc(db, 'courses', courseId), updateData);
                    showToast('Course updated successfully!', 'success');
                    window.LearningApp.closeModal();
                    await loadCourses();
                    filterAndRenderContent();
                    updateStats();
                } catch (error) {
                    console.error('Error updating course:', error);
                    showToast('Failed to update course. Please try again.', 'error');
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                }
            };
        }
    },
    
    deleteCourse: async function(courseId) {
        if (!confirm('Delete this course and all related study sessions?')) return;
        
        try {
            // Delete related study sessions
            const relatedSessions = studySessionsCache.filter(s => s.courseId === courseId);
            for (const session of relatedSessions) {
                await deleteDoc(doc(db, 'studySessions', session.id));
            }
            
            await deleteDoc(doc(db, 'courses', courseId));
            showToast('Course deleted successfully', 'success');
            await loadCourses();
            await loadStudySessions();
            filterAndRenderContent();
            updateStats();
        } catch (error) {
            console.error('Error deleting course:', error);
            showToast('Failed to delete course. Please try again.', 'error');
        }
    },
    
    deleteSession: async function(sessionId) {
        if (!confirm('Delete this study session?')) return;
        
        try {
            await deleteDoc(doc(db, 'studySessions', sessionId));
            showToast('Study session deleted', 'success');
            await loadStudySessions();
            filterAndRenderContent();
            updateStats();
        } catch (error) {
            console.error('Error deleting session:', error);
            showToast('Failed to delete session. Please try again.', 'error');
        }
    },
    
    deleteCertification: async function(certId) {
        if (!confirm('Delete this certification?')) return;
        
        try {
            await deleteDoc(doc(db, 'certifications', certId));
            showToast('Certification deleted', 'success');
            await loadCertifications();
            filterAndRenderContent();
            updateStats();
        } catch (error) {
            console.error('Error deleting certification:', error);
            showToast('Failed to delete certification. Please try again.', 'error');
        }
    },
    
    deleteResource: async function(resourceId) {
        if (!confirm('Delete this resource?')) return;
        
        try {
            await deleteDoc(doc(db, 'learningResources', resourceId));
            showToast('Resource deleted', 'success');
            await loadResources();
            filterAndRenderContent();
        } catch (error) {
            console.error('Error deleting resource:', error);
            showToast('Failed to delete resource. Please try again.', 'error');
        }
    },
    
    closeModal: function() {
        const container = document.getElementById('modal-container');
        if (container) {
            container.innerHTML = '';
            container.style.pointerEvents = 'none';
        }
    }
};

// ============= HELPER FUNCTIONS =============

function initLearningCharts() {
    // This function will be called when analytics view is loaded
    setTimeout(() => {
        const canvas = document.querySelector('canvas[id^="study-hours-chart-"]');
        if (!canvas) return;
        
        // Check if Chart.js is available
        if (typeof Chart === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
            script.onload = () => {
                setTimeout(() => initLearningCharts(), 100);
            };
            document.head.appendChild(script);
            return;
        }
        
        // Get daily data from the analytics render
        const now = new Date();
        const dailyData = {};
        for (let i = 6; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            const key = date.toDateString();
            dailyData[key] = 0;
        }
        studySessionsCache.forEach(s => {
            const key = s.date.toDateString();
            if (dailyData[key] !== undefined) {
                dailyData[key] += s.hours;
            }
        });
        
        const dailyLabels = Object.keys(dailyData).map(d => new Date(d).toLocaleDateString('en-US', { weekday: 'short' }));
        const dailyValues = Object.values(dailyData);
        
        // Destroy existing chart if any
        if (window.studyChart) {
            window.studyChart.destroy();
        }
        
        window.studyChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: dailyLabels,
                datasets: [{
                    label: 'Hours Studied',
                    data: dailyValues,
                    backgroundColor: ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e'],
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
    }, 300);
}

// Add closeModal to global scope
window.closeModal = window.LearningApp.closeModal;