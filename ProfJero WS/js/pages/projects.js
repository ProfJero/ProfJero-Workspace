// js/pages/projects.js
import { db, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, serverTimestamp } from '../firebase-config.js';
import { showToast, escapeHtml, formatDate, timeAgo } from '../utils/helpers.js';

let currentUser = null;
let currentStatus = 'all';
let currentSort = 'priorityDeadline';
let searchQuery = '';
let projectsCache = [];
let notificationSound = null;
let notificationInterval = null;
let userNotificationSettings = {
    enabled: true,
    periods: [5, 3, 1], // days before deadline
    soundUrl: null
};

// Sound Notification System
export class NotificationSystem {
    constructor() {
        this.sound = null;
        this.settings = this.loadSettings();
        this.checkedProjects = new Set();
        this.startMonitoring();
    }

    loadSettings() {
        const saved = localStorage.getItem('projectNotificationSettings');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                return { enabled: true, periods: [5, 3, 1], soundUrl: null };
            }
        }
        return { enabled: true, periods: [5, 3, 1], soundUrl: null };
    }

    saveSettings() {
        localStorage.setItem('projectNotificationSettings', JSON.stringify(this.settings));
    }

    async loadSound() {
        if (this.settings.soundUrl) {
            try {
                this.sound = new Audio(this.settings.soundUrl);
                await this.sound.load();
                return true;
            } catch (error) {
                console.error('Failed to load notification sound:', error);
                return false;
            }
        }
        return false;
    }

    playSound() {
        if (this.sound && this.settings.enabled) {
            try {
                this.sound.currentTime = 0;
                this.sound.play().catch(e => console.log('Sound play failed:', e));
            } catch (error) {
                console.error('Failed to play notification sound:', error);
            }
        }
    }

    async checkDeadlines(projects) {
        if (!this.settings.enabled) return;

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        for (const project of projects) {
            if (!project.deadline || project.archived || project.status === 'completed' || project.status === 'cancelled') continue;

            const deadline = new Date(project.deadline);
            const deadlineDate = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
            const daysUntil = Math.ceil((deadlineDate - today) / (1000 * 60 * 60 * 24));
            const projectKey = `${project.id}-${daysUntil}`;

            // Check if we've already notified for this deadline period
            if (this.checkedProjects.has(projectKey)) continue;

            // Check if days until deadline matches any configured period
            const matchingPeriod = this.settings.periods.find(period => daysUntil === period);
            
            if (matchingPeriod) {
                this.checkedProjects.add(projectKey);
                this.showDeadlineNotification(project, daysUntil);
                this.playSound();
            }

            // Also check if deadline is overdue
            if (daysUntil < 0) {
                const overdueKey = `${project.id}-overdue`;
                if (!this.checkedProjects.has(overdueKey)) {
                    this.checkedProjects.add(overdueKey);
                    this.showOverdueNotification(project);
                    this.playSound();
                }
            }
        }
    }

    showDeadlineNotification(project, days) {
        const notification = new Notification('🔔 Project Deadline Reminder', {
            body: `"${project.name}" deadline is in ${days} day${days > 1 ? 's' : ''}!`,
            icon: '/favicon.ico'
        });

        // Also show toast notification
        showToast(`⚠️ "${project.name}" deadline in ${days} day${days > 1 ? 's' : ''}!`, 'warning');
    }

    showOverdueNotification(project) {
        const notification = new Notification('⚠️ Project Overdue!', {
            body: `"${project.name}" is overdue! Please take action.`,
            icon: '/favicon.ico'
        });

        showToast(`🚨 "${project.name}" is overdue!`, 'error');
    }

    startMonitoring() {
        // Check every hour
        if (notificationInterval) {
            clearInterval(notificationInterval);
        }
        notificationInterval = setInterval(() => {
            if (projectsCache.length > 0) {
                this.checkDeadlines(projectsCache);
            }
        }, 3600000); // 1 hour

        // Request notification permission
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    stopMonitoring() {
        if (notificationInterval) {
            clearInterval(notificationInterval);
        }
    }

    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        this.saveSettings();
        if (newSettings.soundUrl !== undefined) {
            this.loadSound();
        }
        this.checkedProjects.clear();
        this.startMonitoring();
        showToast('Notification settings updated!', 'success');
    }

    async uploadSound(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const audioData = e.target.result;
                // Store as data URL
                this.updateSettings({ soundUrl: audioData });
                resolve(audioData);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
}

// Create global notification instance
export const notificationSystem = new NotificationSystem();

// Add notification settings UI
function renderNotificationSettings() {
    const settings = notificationSystem.settings;
    
    return `
        <div class="glass-card rounded-xl p-5">
            <h3 class="text-lg font-semibold mb-3" style="color: var(--text-primary);">
                <i class="fas fa-bell mr-2"></i>Notification Settings
            </h3>
            
            <div class="space-y-3">
                <div class="flex items-center gap-3">
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="notif-enabled" ${settings.enabled ? 'checked' : ''} 
                               class="sr-only peer">
                        <div class="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-deep-blue/25 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-deep-blue"></div>
                    </label>
                    <span style="color: var(--text-primary);">Enable Notifications</span>
                </div>
                
                <div>
                    <label class="block text-sm font-medium mb-2" style="color: var(--text-primary);">
                        <i class="fas fa-clock mr-1"></i>Remind me before deadline (days)
                    </label>
                    <div class="flex flex-wrap gap-2" id="notification-periods">
                        ${[5, 3, 1].map(day => `
                            <label class="flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-all hover:scale-[1.02]" 
                                   style="background: ${settings.periods.includes(day) ? 'var(--deep-blue)' : 'var(--bg-primary)'}; 
                                          border-color: ${settings.periods.includes(day) ? 'var(--deep-blue)' : 'var(--border-color)'};
                                          color: ${settings.periods.includes(day) ? 'white' : 'var(--text-primary)'};">
                                <input type="checkbox" value="${day}" ${settings.periods.includes(day) ? 'checked' : ''} 
                                       class="period-checkbox hidden" data-period="${day}">
                                <span>${day} day${day > 1 ? 's' : ''}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
                
                <div>
                    <label class="block text-sm font-medium mb-2" style="color: var(--text-primary);">
                        <i class="fas fa-music mr-1"></i>Custom Notification Sound
                    </label>
                    <div class="flex gap-2 flex-wrap">
                        <input type="file" id="sound-upload" accept="audio/*" class="hidden">
                        <button onclick="document.getElementById('sound-upload').click()" 
                                class="px-4 py-2 rounded-lg font-semibold transition-all hover:shadow-md"
                                style="background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary);">
                            <i class="fas fa-upload mr-1"></i>Upload Sound
                        </button>
                        ${settings.soundUrl ? `
                            <button onclick="window.testNotificationSound()" 
                                    class="px-4 py-2 rounded-lg font-semibold transition-all hover:shadow-md"
                                    style="background: var(--deep-blue); color: white;">
                                <i class="fas fa-play mr-1"></i>Test Sound
                            </button>
                            <button onclick="window.removeNotificationSound()" 
                                    class="px-4 py-2 rounded-lg font-semibold transition-all hover:shadow-md"
                                    style="background: #ef4444; color: white;">
                                <i class="fas fa-trash mr-1"></i>Remove
                            </button>
                        ` : ''}
                    </div>
                    ${settings.soundUrl ? `
                        <p class="text-xs mt-1" style="color: var(--text-muted);">
                            <i class="fas fa-check-circle" style="color: var(--emerald);"></i> Custom sound loaded
                        </p>
                    ` : `
                        <p class="text-xs mt-1" style="color: var(--text-muted);">
                            <i class="fas fa-info-circle"></i> Upload a custom sound (MP3, WAV, OGG)
                        </p>
                    `}
                </div>
            </div>
        </div>
    `;
}

// Helper function to show loading state on button
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

// Main render function
export async function renderProjectsPage(user) {
    currentUser = user;
    
    // Load notification settings
    await notificationSystem.loadSound();
    
    return `
        <div class="space-y-6 animate-fade-in-up">
            <!-- Header -->
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 class="text-3xl font-bold" style="color: var(--text-primary);">Projects</h1>
                    <p class="text-muted mt-1">Manage your professional work, client projects, and team collaborations</p>
                </div>
                <div class="flex gap-3 flex-wrap">
                    <button onclick="window.ProjectsApp.showNotificationSettings()" class="px-5 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all hover:shadow-md" style="background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary);">
                        <i class="fas fa-bell"></i>
                        <span>Notifications</span>
                        ${notificationSystem.settings.enabled ? '<span class="w-2 h-2 rounded-full bg-emerald"></span>' : ''}
                    </button>
                    <button onclick="window.ProjectsApp.showArchived()" class="px-5 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all hover:shadow-md" style="background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary);">
                        <i class="fas fa-archive"></i>
                        <span>Archived</span>
                    </button>
                    <button onclick="window.ProjectsApp.showAddModal()" class="px-5 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                        <i class="fas fa-plus"></i>
                        <span>New Project</span>
                    </button>
                </div>
            </div>
            
            <!-- Stats Overview -->
            <div class="grid grid-cols-2 md:grid-cols-7 gap-3">
                <div class="glass-card p-3 rounded-xl text-center cursor-pointer transition-all hover:scale-[1.02]" data-status="all">
                    <div class="text-xl font-bold" id="stat-all" style="color: var(--deep-blue);">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-folder"></i> All</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center cursor-pointer transition-all hover:scale-[1.02]" data-status="active">
                    <div class="text-xl font-bold" id="stat-active" style="color: var(--emerald);">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-play-circle"></i> Active</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center cursor-pointer transition-all hover:scale-[1.02]" data-status="planning">
                    <div class="text-xl font-bold" id="stat-planning" style="color: var(--gold);">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-drafting-compass"></i> Planning</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center cursor-pointer transition-all hover:scale-[1.02]" data-status="on-hold">
                    <div class="text-xl font-bold" id="stat-hold" style="color: #f59e0b;">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-pause-circle"></i> On Hold</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center cursor-pointer transition-all hover:scale-[1.02]" data-status="cancelled">
                    <div class="text-xl font-bold" id="stat-cancelled" style="color: #ef4444;">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-ban"></i> Cancelled</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center cursor-pointer transition-all hover:scale-[1.02]" data-status="completed">
                    <div class="text-xl font-bold" id="stat-completed" style="color: #8b5cf6;">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-check-circle"></i> Completed</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center cursor-pointer transition-all hover:scale-[1.02]" data-status="archived">
                    <div class="text-xl font-bold" id="stat-archived" style="color: #64748b;">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-archive"></i> Archived</div>
                </div>
            </div>
            
            <!-- Search and Filter Bar -->
            <div class="glass-card rounded-xl p-4">
                <div class="flex flex-col md:flex-row gap-3">
                    <div class="flex-1 relative">
                        <i class="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-muted"></i>
                        <input type="text" id="project-search" placeholder="Search projects by name, client, or owner..." 
                               class="w-full pl-10 pr-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all" 
                               style="background: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);">
                    </div>
                    
                    <select id="project-status-filter" class="px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all" style="background: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);">
                        <option value="all">All Status</option>
                        <option value="active"><i class="fas fa-play-circle"></i> Active</option>
                        <option value="planning"><i class="fas fa-drafting-compass"></i> Planning</option>
                        <option value="on-hold"><i class="fas fa-pause-circle"></i> On Hold</option>
                        <option value="cancelled"><i class="fas fa-ban"></i> Cancelled</option>
                        <option value="completed"><i class="fas fa-check-circle"></i> Completed</option>
                        <option value="archived"><i class="fas fa-archive"></i> Archived</option>
                    </select>
                    
                    <select id="project-priority-filter" class="px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all" style="background: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);">
                        <option value="all">All Priorities</option>
                        <option value="high"><i class="fas fa-arrow-up"></i> High Priority</option>
                        <option value="medium"><i class="fas fa-minus"></i> Medium Priority</option>
                        <option value="low"><i class="fas fa-arrow-down"></i> Low Priority</option>
                    </select>
                    
                    <select id="project-sort" class="px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all" style="background: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);">
                        <option value="priorityDeadline" selected><i class="fas fa-chart-simple"></i> Priority & Deadline</option>
                        <option value="updatedAt"><i class="fas fa-clock"></i> Last Updated</option>
                        <option value="createdAt"><i class="fas fa-calendar-plus"></i> Date Created</option>
                        <option value="deadline"><i class="fas fa-calendar-times"></i> Deadline</option>
                        <option value="name"><i class="fas fa-font"></i> Project Name</option>
                        <option value="progress"><i class="fas fa-chart-line"></i> Progress</option>
                        <option value="priority"><i class="fas fa-chart-simple"></i> Priority</option>
                    </select>
                </div>
            </div>
            
            <!-- Projects Container -->
            <div id="projects-container" class="space-y-4">
                <div class="text-center py-12">
                    <div class="animate-pulse"><i class="fas fa-spinner fa-spin mr-2 text-muted"></i> Loading projects...</div>
                </div>
            </div>
        </div>
    `;
}

// Load projects data - this is the main function to call
export async function loadProjectsData() {
    if (!currentUser) {
        console.log('No user logged in');
        return;
    }
    await loadProjects();
    setupEventListeners();
}

// Load projects from Firebase
async function loadProjects() {
    const container = document.getElementById('projects-container');
    if (!container) {
        console.log('Container not found');
        return;
    }
    
    try {
        const q = query(collection(db, 'projects'), where('userId', '==', currentUser.uid), orderBy('updatedAt', 'desc'));
        const querySnapshot = await getDocs(q);
        
        projectsCache = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate?.() || new Date(),
            updatedAt: doc.data().updatedAt?.toDate?.() || new Date(),
            deadline: doc.data().deadline ? new Date(doc.data().deadline) : null,
            tasks: doc.data().tasks || [],
            timeline: doc.data().timeline || [],
            notes: doc.data().notes || [],
            team: doc.data().team || []
        }));
        
        updateStats();
        filterAndRenderProjects();
        
        // Check deadlines for notifications
        await notificationSystem.checkDeadlines(projectsCache);
    } catch (error) {
        console.error('Error loading projects:', error);
        container.innerHTML = '<div class="text-center py-12 text-red-500">Failed to load projects</div>';
    }
}

function updateStats() {
    const all = projectsCache.filter(p => !p.archived).length;
    const active = projectsCache.filter(p => p.status === 'active' && !p.archived).length;
    const planning = projectsCache.filter(p => p.status === 'planning' && !p.archived).length;
    const onHold = projectsCache.filter(p => p.status === 'on-hold' && !p.archived).length;
    const cancelled = projectsCache.filter(p => p.status === 'cancelled' && !p.archived).length;
    const completed = projectsCache.filter(p => p.status === 'completed' && !p.archived).length;
    const archived = projectsCache.filter(p => p.archived === true).length;
    
    const statAll = document.getElementById('stat-all');
    const statActive = document.getElementById('stat-active');
    const statPlanning = document.getElementById('stat-planning');
    const statHold = document.getElementById('stat-hold');
    const statCancelled = document.getElementById('stat-cancelled');
    const statCompleted = document.getElementById('stat-completed');
    const statArchived = document.getElementById('stat-archived');
    
    if (statAll) statAll.textContent = all;
    if (statActive) statActive.textContent = active;
    if (statPlanning) statPlanning.textContent = planning;
    if (statHold) statHold.textContent = onHold;
    if (statCancelled) statCancelled.textContent = cancelled;
    if (statCompleted) statCompleted.textContent = completed;
    if (statArchived) statArchived.textContent = archived;
}

function filterAndRenderProjects() {
    let filtered = [...projectsCache];
    
    const showArchived = currentStatus === 'archived';
    filtered = filtered.filter(p => showArchived ? p.archived === true : !p.archived);
    
    const searchInput = document.getElementById('project-search');
    if (searchInput && searchInput.value) {
        const query = searchInput.value.toLowerCase();
        filtered = filtered.filter(p => 
            p.name?.toLowerCase().includes(query) || 
            p.client?.toLowerCase().includes(query) ||
            p.owner?.toLowerCase().includes(query) ||
            p.description?.toLowerCase().includes(query)
        );
    }
    
    const statusFilter = document.getElementById('project-status-filter');
    if (statusFilter && statusFilter.value !== 'all' && statusFilter.value !== 'archived') {
        filtered = filtered.filter(p => p.status === statusFilter.value);
    }
    
    const priorityFilter = document.getElementById('project-priority-filter');
    if (priorityFilter && priorityFilter.value !== 'all') {
        filtered = filtered.filter(p => p.priority === priorityFilter.value);
    }
    
    const sortSelect = document.getElementById('project-sort');
    const sortBy = sortSelect ? sortSelect.value : 'priorityDeadline';
    
    filtered.sort((a, b) => {
        if (sortBy === 'priorityDeadline') {
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            const priorityDiff = (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1);
            if (priorityDiff !== 0) return priorityDiff;
            
            if (a.deadline && b.deadline) {
                return a.deadline - b.deadline;
            }
            if (a.deadline) return -1;
            if (b.deadline) return 1;
            return 0;
        }
        if (sortBy === 'updatedAt') return b.updatedAt - a.updatedAt;
        if (sortBy === 'createdAt') return b.createdAt - a.createdAt;
        if (sortBy === 'deadline') {
            if (!a.deadline) return 1;
            if (!b.deadline) return -1;
            return a.deadline - b.deadline;
        }
        if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
        if (sortBy === 'progress') return (b.progress || 0) - (a.progress || 0);
        if (sortBy === 'priority') {
            const order = { high: 0, medium: 1, low: 2 };
            return (order[a.priority] || 1) - (order[b.priority] || 1);
        }
        return 0;
    });
    
    renderProjects(filtered);
}

function renderProjects(projects) {
    const container = document.getElementById('projects-container');
    if (!container) return;
    
    if (projects.length === 0) {
        container.innerHTML = `
            <div class="glass-card rounded-xl p-12 text-center">
                <i class="fas fa-project-diagram text-6xl mb-4 text-muted"></i>
                <h3 class="text-xl font-semibold mb-2" style="color: var(--text-primary);">No projects found</h3>
                <p class="text-muted">${currentStatus === 'archived' ? 'No archived projects' : 'Create your first project to start tracking your work'}</p>
                ${currentStatus !== 'archived' ? `
                    <button onclick="window.ProjectsApp.showAddModal()" class="mt-4 px-5 py-2 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                        <i class="fas fa-plus mr-1"></i> New Project
                    </button>
                ` : ''}
            </div>
        `;
        return;
    }
    
    container.className = 'grid grid-cols-1 lg:grid-cols-2 gap-4';
    container.innerHTML = projects.map(project => createProjectCard(project)).join('');
}

function createProjectCard(project) {
    const statusConfig = {
        active: { color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', icon: 'fa-play-circle', label: 'Active' },
        planning: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: 'fa-drafting-compass', label: 'Planning' },
        'on-hold': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: 'fa-pause-circle', label: 'On Hold' },
        cancelled: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', icon: 'fa-ban', label: 'Cancelled' },
        completed: { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', icon: 'fa-check-circle', label: 'Completed' }
    };
    
    const priorityConfig = {
        high: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', icon: 'fa-arrow-up', label: 'High' },
        medium: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: 'fa-minus', label: 'Medium' },
        low: { color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', icon: 'fa-arrow-down', label: 'Low' }
    };
    
    const config = statusConfig[project.status] || statusConfig.planning;
    const priority = priorityConfig[project.priority] || priorityConfig.medium;
    const progress = project.progress || 0;
    const isOverdue = project.deadline && project.deadline < new Date() && project.status !== 'completed' && project.status !== 'cancelled';
    const taskCount = project.tasks?.length || 0;
    const completedTasks = project.tasks?.filter(t => t.completed).length || 0;
    const timelineCount = project.timeline?.length || 0;
    const recentTimeline = project.timeline?.[project.timeline.length - 1];
    
    function formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'GHS',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    }
    
    return `
        <div class="glass-card rounded-xl p-5 transition-all hover:shadow-lg ${project.archived ? 'opacity-60' : ''}">
            <!-- Header -->
            <div class="flex justify-between items-start mb-3">
                <div class="flex-1">
                    <div class="flex items-center gap-2 mb-2 flex-wrap">
                        <i class="fas fa-folder-open" style="color: var(--deep-blue);"></i>
                        <h3 class="font-bold text-lg" style="color: var(--text-primary);">${escapeHtml(project.name)}</h3>
                        <span class="text-xs px-2 py-0.5 rounded-full" style="background: ${config.bg}; color: ${config.color};">
                            <i class="fas ${config.icon} text-xs mr-1"></i>${config.label}
                        </span>
                        <span class="text-xs px-2 py-0.5 rounded-full" style="background: ${priority.bg}; color: ${priority.color};">
                            <i class="fas ${priority.icon} text-xs mr-1"></i>${priority.label} Priority
                        </span>
                        ${project.archived ? '<span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(100, 116, 139, 0.15); color: #64748b;"><i class="fas fa-archive mr-1"></i>Archived</span>' : ''}
                        ${isOverdue ? '<span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(239, 68, 68, 0.15); color: #ef4444;"><i class="fas fa-clock mr-1"></i>Overdue</span>' : ''}
                    </div>
                    ${project.client ? `
                        <div class="flex items-center gap-2 text-xs mb-1" style="color: var(--text-muted);">
                            <i class="fas fa-building"></i>
                            <span>Client: ${escapeHtml(project.client)}</span>
                        </div>
                    ` : ''}
                    ${project.owner ? `
                        <div class="flex items-center gap-2 text-xs" style="color: var(--text-muted);">
                            <i class="fas fa-user-circle"></i>
                            <span>Owner: ${escapeHtml(project.owner)}</span>
                        </div>
                    ` : ''}
                </div>
                <div class="flex gap-1">
                    <button onclick="window.ProjectsApp.showTimeline('${project.id}')" class="p-2 rounded-lg transition-all hover:bg-gray-100 dark:hover:bg-gray-700" title="Timeline">
                        <i class="fas fa-timeline" style="color: var(--text-muted);"></i>
                    </button>
                    <button onclick="window.ProjectsApp.showNotes('${project.id}')" class="p-2 rounded-lg transition-all hover:bg-gray-100 dark:hover:bg-gray-700" title="Notes">
                        <i class="fas fa-sticky-note" style="color: var(--text-muted);"></i>
                    </button>
                    <button onclick="window.ProjectsApp.showTeam('${project.id}')" class="p-2 rounded-lg transition-all hover:bg-gray-100 dark:hover:bg-gray-700" title="Team">
                        <i class="fas fa-users" style="color: var(--text-muted);"></i>
                    </button>
                    <button onclick="window.ProjectsApp.edit('${project.id}')" class="p-2 rounded-lg transition-all hover:bg-gray-100 dark:hover:bg-gray-700">
                        <i class="fas fa-edit" style="color: var(--text-muted);"></i>
                    </button>
                    <button onclick="window.ProjectsApp.delete('${project.id}')" class="p-2 rounded-lg transition-all hover:bg-red-100 dark:hover:bg-red-900/20">
                        <i class="fas fa-trash" style="color: #ef4444;"></i>
                    </button>
                </div>
            </div>
            
            <!-- Description -->
            ${project.description ? `
                <p class="text-sm mb-3 line-clamp-2" style="color: var(--text-muted);">${escapeHtml(project.description)}</p>
            ` : ''}
            
            <!-- Progress Bar -->
            <div class="mb-3">
                <div class="flex justify-between text-xs mb-1" style="color: var(--text-muted);">
                    <span><i class="fas fa-chart-line"></i> Progress</span>
                    <span>${progress}%</span>
                </div>
                <div class="h-2 rounded-full overflow-hidden" style="background: var(--border-color);">
                    <div class="h-full rounded-full transition-all" style="width: ${progress}%; background: linear-gradient(90deg, var(--deep-blue), var(--emerald));"></div>
                </div>
            </div>
            
            <!-- Task and Timeline Summary -->
            <div class="flex flex-wrap items-center gap-4 mb-3 text-xs" style="color: var(--text-muted);">
                <span class="flex items-center gap-1">
                    <i class="fas fa-tasks"></i>
                    ${taskCount} ${taskCount === 1 ? 'task' : 'tasks'}
                </span>
                ${taskCount > 0 ? `
                    <span class="flex items-center gap-1">
                        <i class="fas fa-check-circle" style="color: var(--emerald);"></i>
                        ${completedTasks} completed
                    </span>
                ` : ''}
                ${timelineCount > 0 ? `
                    <span class="flex items-center gap-1">
                        <i class="fas fa-timeline"></i>
                        ${timelineCount} milestones
                    </span>
                ` : ''}
                ${project.budget ? `
                    <span class="flex items-center gap-1">
                        <i class="fas fa-money-bill-wave"></i>
                        ${formatCurrency(project.budget)}
                    </span>
                ` : ''}
            </div>
            
            <!-- Recent Timeline Update -->
            ${recentTimeline ? `
                <div class="mb-3 p-2 rounded-lg" style="background: ${config.bg}">
                    <div class="flex items-center gap-2 text-xs">
                        <i class="fas fa-calendar-check" style="color: ${config.color};"></i>
                        <span style="color: var(--text-muted);">Latest: ${escapeHtml(recentTimeline.title)}</span>
                        <span style="color: var(--text-muted);">- ${formatDate(recentTimeline.date)}</span>
                    </div>
                </div>
            ` : ''}
            
            <!-- Dates -->
            <div class="flex flex-wrap gap-3 text-xs pt-2 border-t" style="color: var(--text-muted); border-color: var(--border-color);">
                ${project.deadline ? `
                    <span class="flex items-center gap-1">
                        <i class="fas fa-calendar-alt"></i>
                        <span ${isOverdue ? 'style="color: #ef4444;"' : ''}>
                            Deadline: ${formatDate(project.deadline)}
                            ${isOverdue ? ' (Overdue)' : ''}
                        </span>
                    </span>
                ` : ''}
                <span class="flex items-center gap-1">
                    <i class="fas fa-clock"></i>
                    Updated: ${timeAgo(project.updatedAt)}
                </span>
            </div>
            
            <!-- Action Buttons -->
            <div class="flex gap-2 mt-3 pt-2 border-t" style="border-color: var(--border-color);">
                <button onclick="window.ProjectsApp.manageTasks('${project.id}')" class="flex-1 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all hover:shadow-md" style="background: var(--bg-primary); color: var(--deep-blue); border: 1px solid var(--border-color);">
                    <i class="fas fa-tasks mr-1"></i> Tasks (${taskCount})
                </button>
                <button onclick="window.ProjectsApp.updateProgress('${project.id}')" class="flex-1 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                    <i class="fas fa-chart-simple mr-1"></i> Update
                </button>
                ${!project.archived ? `
                    <button onclick="window.ProjectsApp.archive('${project.id}')" class="px-3 py-1.5 rounded-lg text-sm transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="background: var(--bg-primary); color: var(--text-muted); border: 1px solid var(--border-color);">
                        <i class="fas fa-archive"></i>
                    </button>
                ` : `
                    <button onclick="window.ProjectsApp.unarchive('${project.id}')" class="px-3 py-1.5 rounded-lg text-sm transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="background: var(--bg-primary); color: var(--emerald); border: 1px solid var(--border-color);">
                        <i class="fas fa-box-open"></i>
                    </button>
                `}
            </div>
        </div>
    `;
}

function setupEventListeners() {
    document.querySelectorAll('[data-status]').forEach(stat => {
        stat.addEventListener('click', () => {
            const status = stat.dataset.status;
            currentStatus = status;
            
            document.querySelectorAll('[data-status]').forEach(s => {
                s.style.opacity = '0.7';
            });
            stat.style.opacity = '1';
            
            const filterSelect = document.getElementById('project-status-filter');
            if (filterSelect && status !== 'archived') {
                filterSelect.value = status === 'all' ? 'all' : status;
            }
            
            filterAndRenderProjects();
        });
    });
    
    const searchInput = document.getElementById('project-search');
    if (searchInput) searchInput.addEventListener('input', () => filterAndRenderProjects());
    
    const statusFilter = document.getElementById('project-status-filter');
    if (statusFilter) statusFilter.addEventListener('change', () => {
        currentStatus = statusFilter.value;
        filterAndRenderProjects();
    });
    
    const priorityFilter = document.getElementById('project-priority-filter');
    if (priorityFilter) priorityFilter.addEventListener('change', () => filterAndRenderProjects());
    
    const sortSelect = document.getElementById('project-sort');
    if (sortSelect) sortSelect.addEventListener('change', () => filterAndRenderProjects());
}

// ProjectsApp Global Object - All methods
window.ProjectsApp = {
    showAddModal: () => {
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.ProjectsApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto transform transition-all" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color); z-10;">
                        <div>
                            <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-project-diagram mr-2" style="color: var(--deep-blue);"></i>New Project
                            </h2>
                            <p class="text-xs md:text-sm text-muted mt-1">Create a new project to track your work</p>
                        </div>
                        <button onclick="window.ProjectsApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="add-project-form" class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Project Name</label>
                            <input type="text" name="name" required placeholder="e.g., Website Redesign" 
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Project Owner</label>
                            <input type="text" name="owner" placeholder="Project owner/lead name" 
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Client/Organization</label>
                            <input type="text" name="client" placeholder="Client name (optional)" 
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Description</label>
                            <textarea name="description" rows="3" placeholder="Project overview..." 
                                      class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></textarea>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Priority</label>
                                <select name="priority" class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                        style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    <option value="high"><i class="fas fa-arrow-up"></i> High Priority</option>
                                    <option value="medium" selected><i class="fas fa-minus"></i> Medium Priority</option>
                                    <option value="low"><i class="fas fa-arrow-down"></i> Low Priority</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Status</label>
                                <select name="status" class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                        style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    <option value="planning"><i class="fas fa-drafting-compass"></i> Planning</option>
                                    <option value="active"><i class="fas fa-play-circle"></i> Active</option>
                                    <option value="on-hold"><i class="fas fa-pause-circle"></i> On Hold</option>
                                    <option value="completed"><i class="fas fa-check-circle"></i> Completed</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Progress (%)</label>
                                <input type="number" name="progress" min="0" max="100" value="0" 
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Budget (Optional)</label>
                                <input type="number" name="budget" step="any" placeholder="Any amount" 
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Deadline</label>
                            <input type="date" name="deadline" 
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button type="submit" id="create-project-btn" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-1"></i> Create Project
                            </button>
                            <button type="button" onclick="window.ProjectsApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
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
            
            document.getElementById('add-project-form').onsubmit = async (e) => {
                e.preventDefault();
                const submitBtn = document.getElementById('create-project-btn');
                setButtonLoading(submitBtn, true);
                
                try {
                    const data = new FormData(e.target);
                    
                    await addDoc(collection(db, 'projects'), {
                        name: data.get('name'),
                        owner: data.get('owner') || null,
                        client: data.get('client') || null,
                        description: data.get('description') || '',
                        priority: data.get('priority'),
                        status: data.get('status'),
                        progress: parseInt(data.get('progress')) || 0,
                        budget: data.get('budget') ? parseFloat(data.get('budget')) : null,
                        deadline: data.get('deadline') || null,
                        tasks: [],
                        timeline: [],
                        notes: [],
                        team: [],
                        archived: false,
                        userId: currentUser.uid,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    });
                    showToast('Project created successfully!', 'success');
                    window.ProjectsApp.closeModal();
                    await loadProjects();
                } catch (error) {
                    console.error('Error creating project:', error);
                    showToast('Failed to create project', 'error');
                } finally {
                    setButtonLoading(submitBtn, false, '<i class="fas fa-save mr-1"></i> Create Project');
                }
            };
        }
    },
    
    edit: async (projectId) => {
        const project = projectsCache.find(p => p.id === projectId);
        if (!project) return;
        
        const deadline = project.deadline ? project.deadline.toISOString().split('T')[0] : '';
        
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.ProjectsApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto transform transition-all" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="border-color: var(--border-color); background: var(--bg-secondary); z-10;">
                        <div>
                            <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-edit mr-2" style="color: var(--deep-blue);"></i>Edit Project
                            </h2>
                            <p class="text-xs md:text-sm text-muted mt-1">Update project details</p>
                        </div>
                        <button onclick="window.ProjectsApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="edit-project-form" class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Project Name</label>
                            <input type="text" name="name" required value="${escapeHtml(project.name)}" 
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Project Owner</label>
                            <input type="text" name="owner" value="${escapeHtml(project.owner || '')}" 
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Client/Organization</label>
                            <input type="text" name="client" value="${escapeHtml(project.client || '')}" 
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Description</label>
                            <textarea name="description" rows="3" 
                                      class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">${escapeHtml(project.description || '')}</textarea>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Priority</label>
                                <select name="priority" class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                        style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    <option value="high" ${project.priority === 'high' ? 'selected' : ''}><i class="fas fa-arrow-up"></i> High Priority</option>
                                    <option value="medium" ${project.priority === 'medium' ? 'selected' : ''}><i class="fas fa-minus"></i> Medium Priority</option>
                                    <option value="low" ${project.priority === 'low' ? 'selected' : ''}><i class="fas fa-arrow-down"></i> Low Priority</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Status</label>
                                <select name="status" class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                        style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    <option value="planning" ${project.status === 'planning' ? 'selected' : ''}><i class="fas fa-drafting-compass"></i> Planning</option>
                                    <option value="active" ${project.status === 'active' ? 'selected' : ''}><i class="fas fa-play-circle"></i> Active</option>
                                    <option value="on-hold" ${project.status === 'on-hold' ? 'selected' : ''}><i class="fas fa-pause-circle"></i> On Hold</option>
                                    <option value="cancelled" ${project.status === 'cancelled' ? 'selected' : ''}><i class="fas fa-ban"></i> Cancelled</option>
                                    <option value="completed" ${project.status === 'completed' ? 'selected' : ''}><i class="fas fa-check-circle"></i> Completed</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Progress (%)</label>
                                <input type="number" name="progress" min="0" max="100" value="${project.progress || 0}" 
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Budget</label>
                                <input type="number" name="budget" step="any" value="${project.budget || ''}" 
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Deadline</label>
                            <input type="date" name="deadline" value="${deadline}" 
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button type="submit" id="edit-project-btn" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-1"></i> Save Changes
                            </button>
                            <button type="button" onclick="window.ProjectsApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
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
            
            document.getElementById('edit-project-form').onsubmit = async (e) => {
                e.preventDefault();
                const submitBtn = document.getElementById('edit-project-btn');
                setButtonLoading(submitBtn, true);
                
                try {
                    const data = new FormData(e.target);
                    
                    await updateDoc(doc(db, 'projects', projectId), {
                        name: data.get('name'),
                        owner: data.get('owner') || null,
                        client: data.get('client') || null,
                        description: data.get('description') || '',
                        priority: data.get('priority'),
                        status: data.get('status'),
                        progress: parseInt(data.get('progress')) || 0,
                        budget: data.get('budget') ? parseFloat(data.get('budget')) : null,
                        deadline: data.get('deadline') || null,
                        updatedAt: serverTimestamp()
                    });
                    showToast('Project updated!', 'success');
                    window.ProjectsApp.closeModal();
                    await loadProjects();
                } catch (error) {
                    console.error('Error updating project:', error);
                    showToast('Failed to update project', 'error');
                } finally {
                    setButtonLoading(submitBtn, false, '<i class="fas fa-save mr-1"></i> Save Changes');
                }
            };
        }
    },
    
    delete: async (projectId) => {
        if (confirm('Delete this project permanently? This action cannot be undone.')) {
            try {
                await deleteDoc(doc(db, 'projects', projectId));
                showToast('Project deleted permanently', 'success');
                await loadProjects();
            } catch (error) {
                console.error('Error deleting project:', error);
                showToast('Failed to delete project', 'error');
            }
        }
    },
    
    archive: async (projectId) => {
        try {
            await updateDoc(doc(db, 'projects', projectId), {
                archived: true,
                updatedAt: serverTimestamp()
            });
            showToast('Project archived', 'success');
            await loadProjects();
        } catch (error) {
            console.error('Error archiving project:', error);
            showToast('Failed to archive project', 'error');
        }
    },
    
    unarchive: async (projectId) => {
        try {
            await updateDoc(doc(db, 'projects', projectId), {
                archived: false,
                updatedAt: serverTimestamp()
            });
            showToast('Project restored from archive', 'success');
            await loadProjects();
        } catch (error) {
            console.error('Error unarchiving project:', error);
            showToast('Failed to restore project', 'error');
        }
    },
    
    showArchived: () => {
        currentStatus = 'archived';
        filterAndRenderProjects();
    },
    
    manageTasks: async (projectId) => {
        const project = projectsCache.find(p => p.id === projectId);
        if (!project) return;
        
        const tasksHtml = project.tasks?.map((task, index) => `
            <div class="flex items-center gap-3 p-3 rounded-lg" style="background: var(--bg-primary);">
                <input type="checkbox" ${task.completed ? 'checked' : ''} 
                       onchange="window.ProjectsApp.toggleTask('${projectId}', ${index}, this.checked)" class="w-4 h-4 rounded">
                <div class="flex-1">
                    <span class="${task.completed ? 'line-through' : ''}" style="color: var(--text-muted);">${escapeHtml(task.title)}</span>
                    ${task.dueDate ? `<div class="text-xs" style="color: var(--text-muted);">Due: ${formatDate(task.dueDate)}</div>` : ''}
                </div>
                <button onclick="window.ProjectsApp.deleteTask('${projectId}', ${index})" class="text-red-500 hover:text-red-700">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');
        
        const html = `
            <div id="manage-tasks-modal" class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.ProjectsApp.closeModal()">
                <div class="rounded-2xl w-full max-w-lg mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-tasks mr-2"></i>Tasks - ${escapeHtml(project.name)}
                            </h2>
                            <p class="text-xs md:text-sm text-muted mt-1">Manage project tasks</p>
                        </div>
                        <button onclick="window.ProjectsApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    
                    <div class="p-5">
                        <div class="mb-4">
                            <div class="flex gap-2 flex-wrap">
                                <input type="text" id="new-task-title" placeholder="New task..." class="flex-1 min-w-[150px] px-3 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <input type="date" id="new-task-due" class="px-3 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <button onclick="window.ProjectsApp.addTask('${projectId}')" class="px-4 py-2 rounded-lg transition-all hover:shadow-md" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                    <i class="fas fa-plus"></i>
                                </button>
                            </div>
                        </div>
                        
                        <div class="space-y-2 max-h-96 overflow-y-auto">
                            ${tasksHtml || '<div class="text-center py-8" style="color: var(--text-muted);">No tasks yet. Add your first task above.</div>'}
                        </div>
                        
                        <div class="mt-4 pt-3 border-t flex justify-between flex-wrap" style="border-color: var(--border-color);">
                            <span class="text-sm" style="color: var(--text-muted);">
                                ${project.tasks?.filter(t => t.completed).length || 0}/${project.tasks?.length || 0} completed
                            </span>
                            <button onclick="window.ProjectsApp.closeModal()" class="px-4 py-2 rounded-lg border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="border-color: var(--border-color); color: var(--text-primary);">Close</button>
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
    },
    
    addTask: async (projectId) => {
        const titleInput = document.getElementById('new-task-title');
        const dueInput = document.getElementById('new-task-due');
        const title = titleInput?.value.trim();
        const addBtn = document.querySelector('#manage-tasks-modal button[onclick*="addTask"]');
        
        if (!title) {
            showToast('Please enter a task title', 'error');
            return;
        }
        
        if (addBtn) setButtonLoading(addBtn, true);
        
        try {
            const project = projectsCache.find(p => p.id === projectId);
            const newTask = {
                title: title,
                dueDate: dueInput?.value || null,
                completed: false,
                createdAt: new Date()
            };
            
            const updatedTasks = [...(project.tasks || []), newTask];
            
            await updateDoc(doc(db, 'projects', projectId), {
                tasks: updatedTasks,
                updatedAt: serverTimestamp()
            });
            
            titleInput.value = '';
            if (dueInput) dueInput.value = '';
            
            showToast('Task added!', 'success');
            await loadProjects();
            window.ProjectsApp.manageTasks(projectId);
        } catch (error) {
            console.error('Error adding task:', error);
            showToast('Failed to add task', 'error');
        } finally {
            if (addBtn) setButtonLoading(addBtn, false, '<i class="fas fa-plus"></i>');
        }
    },
    
    toggleTask: async (projectId, taskIndex, completed) => {
        try {
            const project = projectsCache.find(p => p.id === projectId);
            const updatedTasks = [...(project.tasks || [])];
            updatedTasks[taskIndex].completed = completed;
            
            await updateDoc(doc(db, 'projects', projectId), {
                tasks: updatedTasks,
                updatedAt: serverTimestamp()
            });
            
            const completedCount = updatedTasks.filter(t => t.completed).length;
            const totalTasks = updatedTasks.length;
            const newProgress = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : project.progress;
            
            await updateDoc(doc(db, 'projects', projectId), {
                progress: newProgress
            });
            
            await loadProjects();
            window.ProjectsApp.manageTasks(projectId);
        } catch (error) {
            console.error('Error toggling task:', error);
            showToast('Failed to update task', 'error');
        }
    },
    
    deleteTask: async (projectId, taskIndex) => {
        try {
            const project = projectsCache.find(p => p.id === projectId);
            const updatedTasks = [...(project.tasks || [])];
            updatedTasks.splice(taskIndex, 1);
            
            await updateDoc(doc(db, 'projects', projectId), {
                tasks: updatedTasks,
                updatedAt: serverTimestamp()
            });
            
            showToast('Task deleted', 'success');
            await loadProjects();
            window.ProjectsApp.manageTasks(projectId);
        } catch (error) {
            console.error('Error deleting task:', error);
            showToast('Failed to delete task', 'error');
        }
    },
    
    showTimeline: async (projectId) => {
        const project = projectsCache.find(p => p.id === projectId);
        if (!project) return;
        
        const timelineHtml = project.timeline?.map((item, index) => `
            <div class="flex gap-3 p-3 rounded-lg" style="background: var(--bg-primary);">
                <div class="w-20 text-sm font-semibold" style="color: var(--deep-blue);">${formatDate(item.date)}</div>
                <div class="flex-1">
                    <div class="font-semibold" style="color: var(--text-primary);">${escapeHtml(item.title)}</div>
                    ${item.description ? `<div class="text-sm" style="color: var(--text-muted);">${escapeHtml(item.description)}</div>` : ''}
                </div>
                <button onclick="window.ProjectsApp.deleteTimeline('${projectId}', ${index})" class="text-red-500 hover:text-red-700">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');
        
        const html = `
            <div id="timeline-modal" class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.ProjectsApp.closeModal()">
                <div class="rounded-2xl w-full max-w-lg mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-timeline mr-2"></i>Timeline - ${escapeHtml(project.name)}
                            </h2>
                            <p class="text-xs md:text-sm text-muted mt-1">Track project milestones</p>
                        </div>
                        <button onclick="window.ProjectsApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    
                    <div class="p-5">
                        <div class="mb-4">
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                                <input type="text" id="timeline-title" placeholder="Milestone title..." class="px-3 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <input type="date" id="timeline-date" class="px-3 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div class="flex gap-2">
                                <input type="text" id="timeline-desc" placeholder="Description (optional)" class="flex-1 px-3 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <button onclick="window.ProjectsApp.addTimeline('${projectId}')" class="px-4 py-2 rounded-lg transition-all hover:shadow-md" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                    <i class="fas fa-plus"></i> Add
                                </button>
                            </div>
                        </div>
                        
                        <div class="space-y-2 max-h-96 overflow-y-auto">
                            ${timelineHtml || '<div class="text-center py-8" style="color: var(--text-muted);">No timeline entries yet. Add your first milestone.</div>'}
                        </div>
                        
                        <div class="mt-4 pt-3 border-t" style="border-color: var(--border-color);">
                            <button onclick="window.ProjectsApp.closeModal()" class="w-full px-4 py-2 rounded-lg border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="border-color: var(--border-color); color: var(--text-primary);">Close</button>
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
    },
    
    addTimeline: async (projectId) => {
        const titleInput = document.getElementById('timeline-title');
        const dateInput = document.getElementById('timeline-date');
        const descInput = document.getElementById('timeline-desc');
        const title = titleInput?.value.trim();
        const date = dateInput?.value;
        const addBtn = document.querySelector('#timeline-modal button[onclick*="addTimeline"]');
        
        if (!title || !date) {
            showToast('Please enter both title and date', 'error');
            return;
        }
        
        if (addBtn) setButtonLoading(addBtn, true);
        
        try {
            const project = projectsCache.find(p => p.id === projectId);
            const newEntry = {
                title: title,
                date: new Date(date),
                description: descInput?.value || '',
                createdAt: new Date()
            };
            
            const updatedTimeline = [...(project.timeline || []), newEntry];
            updatedTimeline.sort((a, b) => new Date(a.date) - new Date(b.date));
            
            await updateDoc(doc(db, 'projects', projectId), {
                timeline: updatedTimeline,
                updatedAt: serverTimestamp()
            });
            
            titleInput.value = '';
            dateInput.value = '';
            if (descInput) descInput.value = '';
            
            showToast('Timeline entry added!', 'success');
            await loadProjects();
            window.ProjectsApp.showTimeline(projectId);
        } catch (error) {
            console.error('Error adding timeline:', error);
            showToast('Failed to add timeline entry', 'error');
        } finally {
            if (addBtn) setButtonLoading(addBtn, false, '<i class="fas fa-plus"></i> Add');
        }
    },
    
    deleteTimeline: async (projectId, index) => {
        try {
            const project = projectsCache.find(p => p.id === projectId);
            const updatedTimeline = [...(project.timeline || [])];
            updatedTimeline.splice(index, 1);
            
            await updateDoc(doc(db, 'projects', projectId), {
                timeline: updatedTimeline,
                updatedAt: serverTimestamp()
            });
            
            showToast('Timeline entry deleted', 'success');
            await loadProjects();
            window.ProjectsApp.showTimeline(projectId);
        } catch (error) {
            console.error('Error deleting timeline:', error);
            showToast('Failed to delete timeline entry', 'error');
        }
    },
    
    showNotes: async (projectId) => {
        const project = projectsCache.find(p => p.id === projectId);
        if (!project) return;
        
        const notesHtml = project.notes?.map((note, index) => `
            <div class="p-3 rounded-lg" style="background: var(--bg-primary);">
                <div class="flex justify-between items-start mb-2">
                    <span class="text-xs" style="color: var(--text-muted);">${formatDate(note.date)}</span>
                    <button onclick="window.ProjectsApp.deleteNote('${projectId}', ${index})" class="text-red-500 text-sm hover:text-red-700">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <p class="text-sm" style="color: var(--text-primary);">${escapeHtml(note.content)}</p>
                ${note.author ? `<div class="text-xs mt-1" style="color: var(--text-muted);">— ${escapeHtml(note.author)}</div>` : ''}
            </div>
        `).join('');
        
        const html = `
            <div id="notes-modal" class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.ProjectsApp.closeModal()">
                <div class="rounded-2xl w-full max-w-lg mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-sticky-note mr-2"></i>Notes - ${escapeHtml(project.name)}
                            </h2>
                            <p class="text-xs md:text-sm text-muted mt-1">Project notes and documentation</p>
                        </div>
                        <button onclick="window.ProjectsApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    
                    <div class="p-5">
                        <div class="mb-4">
                            <div class="flex gap-2">
                                <textarea id="new-note" rows="2" placeholder="Write a note..." class="flex-1 px-3 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></textarea>
                                <button onclick="window.ProjectsApp.addNote('${projectId}')" class="px-4 py-2 rounded-lg self-end transition-all hover:shadow-md" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                    <i class="fas fa-plus"></i> Add
                                </button>
                            </div>
                        </div>
                        
                        <div class="space-y-3 max-h-96 overflow-y-auto">
                            ${notesHtml || '<div class="text-center py-8" style="color: var(--text-muted);">No notes yet. Add your first note above.</div>'}
                        </div>
                        
                        <div class="mt-4 pt-3 border-t" style="border-color: var(--border-color);">
                            <button onclick="window.ProjectsApp.closeModal()" class="w-full px-4 py-2 rounded-lg border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="border-color: var(--border-color); color: var(--text-primary);">Close</button>
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
    },
    
    addNote: async (projectId) => {
        const noteInput = document.getElementById('new-note');
        const content = noteInput?.value.trim();
        const addBtn = document.querySelector('#notes-modal button[onclick*="addNote"]');
        
        if (!content) {
            showToast('Please enter a note', 'error');
            return;
        }
        
        if (addBtn) setButtonLoading(addBtn, true);
        
        try {
            const project = projectsCache.find(p => p.id === projectId);
            const newNote = {
                content: content,
                date: new Date(),
                author: currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User'
            };
            
            const updatedNotes = [...(project.notes || []), newNote];
            
            await updateDoc(doc(db, 'projects', projectId), {
                notes: updatedNotes,
                updatedAt: serverTimestamp()
            });
            
            noteInput.value = '';
            showToast('Note added!', 'success');
            await loadProjects();
            window.ProjectsApp.showNotes(projectId);
        } catch (error) {
            console.error('Error adding note:', error);
            showToast('Failed to add note', 'error');
        } finally {
            if (addBtn) setButtonLoading(addBtn, false, '<i class="fas fa-plus"></i> Add');
        }
    },
    
    deleteNote: async (projectId, index) => {
        try {
            const project = projectsCache.find(p => p.id === projectId);
            const updatedNotes = [...(project.notes || [])];
            updatedNotes.splice(index, 1);
            
            await updateDoc(doc(db, 'projects', projectId), {
                notes: updatedNotes,
                updatedAt: serverTimestamp()
            });
            
            showToast('Note deleted', 'success');
            await loadProjects();
            window.ProjectsApp.showNotes(projectId);
        } catch (error) {
            console.error('Error deleting note:', error);
            showToast('Failed to delete note', 'error');
        }
    },
    
    showTeam: async (projectId) => {
        const project = projectsCache.find(p => p.id === projectId);
        if (!project) return;
        
        const teamHtml = project.team?.map((member, index) => `
            <div class="flex justify-between items-center p-3 rounded-lg" style="background: var(--bg-primary);">
                <div class="flex items-center gap-3">
                    <i class="fas fa-user-circle text-2xl" style="color: var(--text-muted);"></i>
                    <div>
                        <div class="font-semibold" style="color: var(--text-primary);">${escapeHtml(member.name)}</div>
                        <div class="text-xs" style="color: var(--text-muted);">${escapeHtml(member.role)} • ${escapeHtml(member.email)}</div>
                    </div>
                </div>
                <button onclick="window.ProjectsApp.removeTeamMember('${projectId}', ${index})" class="text-red-500 hover:text-red-700">
                    <i class="fas fa-user-minus"></i>
                </button>
            </div>
        `).join('');
        
        const html = `
            <div id="team-modal" class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.ProjectsApp.closeModal()">
                <div class="rounded-2xl w-full max-w-lg mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-users mr-2"></i>Team Members - ${escapeHtml(project.name)}
                            </h2>
                            <p class="text-xs md:text-sm text-muted mt-1">Manage project team</p>
                        </div>
                        <button onclick="window.ProjectsApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    
                    <div class="p-5">
                        <div class="mb-4">
                            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
                                <input type="text" id="member-name" placeholder="Name" class="px-3 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <input type="text" id="member-role" placeholder="Role" class="px-3 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <input type="email" id="member-email" placeholder="Email" class="px-3 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <button onclick="window.ProjectsApp.addTeamMember('${projectId}')" class="w-full px-4 py-2 rounded-lg transition-all hover:shadow-md" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-user-plus mr-1"></i> Add Team Member
                            </button>
                        </div>
                        
                        <div class="space-y-2 max-h-96 overflow-y-auto">
                            ${teamHtml || '<div class="text-center py-8" style="color: var(--text-muted);">No team members yet. Add your first team member.</div>'}
                        </div>
                        
                        <div class="mt-4 pt-3 border-t" style="border-color: var(--border-color);">
                            <button onclick="window.ProjectsApp.closeModal()" class="w-full px-4 py-2 rounded-lg border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="border-color: var(--border-color); color: var(--text-primary);">Close</button>
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
    },
    
    addTeamMember: async (projectId) => {
        const nameInput = document.getElementById('member-name');
        const roleInput = document.getElementById('member-role');
        const emailInput = document.getElementById('member-email');
        const name = nameInput?.value.trim();
        const role = roleInput?.value.trim();
        const email = emailInput?.value.trim();
        const addBtn = document.querySelector('#team-modal button[onclick*="addTeamMember"]');
        
        if (!name || !role || !email) {
            showToast('Please fill all fields', 'error');
            return;
        }
        
        if (addBtn) setButtonLoading(addBtn, true);
        
        try {
            const project = projectsCache.find(p => p.id === projectId);
            const newMember = {
                name: name,
                role: role,
                email: email,
                addedAt: new Date()
            };
            
            const updatedTeam = [...(project.team || []), newMember];
            
            await updateDoc(doc(db, 'projects', projectId), {
                team: updatedTeam,
                updatedAt: serverTimestamp()
            });
            
            nameInput.value = '';
            roleInput.value = '';
            emailInput.value = '';
            
            showToast('Team member added!', 'success');
            await loadProjects();
            window.ProjectsApp.showTeam(projectId);
        } catch (error) {
            console.error('Error adding team member:', error);
            showToast('Failed to add team member', 'error');
        } finally {
            if (addBtn) setButtonLoading(addBtn, false, '<i class="fas fa-user-plus mr-1"></i> Add Team Member');
        }
    },
    
    removeTeamMember: async (projectId, index) => {
        try {
            const project = projectsCache.find(p => p.id === projectId);
            const updatedTeam = [...(project.team || [])];
            updatedTeam.splice(index, 1);
            
            await updateDoc(doc(db, 'projects', projectId), {
                team: updatedTeam,
                updatedAt: serverTimestamp()
            });
            
            showToast('Team member removed', 'success');
            await loadProjects();
            window.ProjectsApp.showTeam(projectId);
        } catch (error) {
            console.error('Error removing team member:', error);
            showToast('Failed to remove team member', 'error');
        }
    },
    
    updateProgress: async (projectId) => {
        const project = projectsCache.find(p => p.id === projectId);
        if (!project) return;
        
        const html = `
            <div id="progress-modal" class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.ProjectsApp.closeModal()">
                <div class="rounded-2xl w-full max-w-sm mx-auto" style="background: var(--bg-secondary);">
                    <div class="flex justify-between items-center p-5 border-b" style="border-color: var(--border-color);">
                        <h2 class="text-xl font-bold" style="color: var(--text-primary);">
                            <i class="fas fa-chart-simple mr-2"></i>Update Progress
                        </h2>
                        <button onclick="window.ProjectsApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="p-5">
                        <div class="mb-4">
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Current Progress: ${project.progress || 0}%</label>
                            <input type="range" id="progress-slider" min="0" max="100" value="${project.progress || 0}" class="w-full">
                            <div class="text-center mt-2">
                                <span id="progress-value" class="text-2xl font-bold" style="color: var(--deep-blue);">${project.progress || 0}%</span>
                            </div>
                        </div>
                        <div class="flex gap-3">
                            <button onclick="window.ProjectsApp.setProgress('${projectId}')" class="flex-1 py-2 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                Save Progress
                            </button>
                            <button onclick="window.ProjectsApp.closeModal()" class="flex-1 py-2 rounded-lg border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="border-color: var(--border-color); color: var(--text-primary);">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        const modalContainer = document.getElementById('modal-container');
        if (modalContainer) {
            modalContainer.innerHTML = html;
            modalContainer.style.pointerEvents = 'auto';
            
            const slider = document.getElementById('progress-slider');
            const valueDisplay = document.getElementById('progress-value');
            
            slider.oninput = () => {
                valueDisplay.textContent = `${slider.value}%`;
            };
        }
    },
    
    setProgress: async (projectId) => {
        const slider = document.getElementById('progress-slider');
        const progress = parseInt(slider.value);
        const saveBtn = document.querySelector('#progress-modal button[onclick*="setProgress"]');
        
        if (saveBtn) setButtonLoading(saveBtn, true);
        
        try {
            await updateDoc(doc(db, 'projects', projectId), {
                progress: progress,
                updatedAt: serverTimestamp()
            });
            
            if (progress === 100) {
                await updateDoc(doc(db, 'projects', projectId), {
                    status: 'completed'
                });
                showToast('Project completed! Congratulations!', 'success');
            } else {
                showToast(`Progress updated to ${progress}%`, 'success');
            }
            
            window.ProjectsApp.closeModal();
            await loadProjects();
        } catch (error) {
            console.error('Error updating progress:', error);
            showToast('Failed to update progress', 'error');
        } finally {
            if (saveBtn) setButtonLoading(saveBtn, false, 'Save Progress');
        }
    },
    
    showNotificationSettings: () => {
        const settingsHtml = renderNotificationSettings();
        
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.ProjectsApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto transform transition-all" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color); z-10;">
                        <div>
                            <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-bell mr-2" style="color: var(--deep-blue);"></i>Notification Settings
                            </h2>
                            <p class="text-xs md:text-sm text-muted mt-1">Configure project notifications</p>
                        </div>
                        <button onclick="window.ProjectsApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <div class="p-5">
                        ${settingsHtml}
                        <div class="flex gap-3 mt-4 pt-3 border-t flex-wrap" style="border-color: var(--border-color);">
                            <button onclick="window.ProjectsApp.saveNotificationSettings()" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-1"></i> Save Settings
                            </button>
                            <button onclick="window.ProjectsApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        const modalContainer = document.getElementById('modal-container');
        if (modalContainer) {
            modalContainer.innerHTML = html;
            modalContainer.style.pointerEvents = 'auto';
            
            // Setup sound upload
            const soundUpload = document.getElementById('sound-upload');
            if (soundUpload) {
                soundUpload.addEventListener('change', async (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        try {
                            await notificationSystem.uploadSound(file);
                            showToast('Sound uploaded successfully!', 'success');
                            window.ProjectsApp.showNotificationSettings();
                        } catch (error) {
                            console.error('Error uploading sound:', error);
                            showToast('Failed to upload sound', 'error');
                        }
                    }
                });
            }
        }
    },
    
    saveNotificationSettings: () => {
        const enabled = document.getElementById('notif-enabled')?.checked ?? false;
        const periodCheckboxes = document.querySelectorAll('.period-checkbox');
        const periods = Array.from(periodCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => parseInt(cb.dataset.period));
        
        notificationSystem.updateSettings({
            enabled: enabled,
            periods: periods.length > 0 ? periods : [5, 3, 1]
        });
        
        window.ProjectsApp.closeModal();
        showToast('Notification settings saved!', 'success');
    },
    
    closeModal: () => {
        const modalContainer = document.getElementById('modal-container');
        if (modalContainer) {
            modalContainer.innerHTML = '';
            modalContainer.style.pointerEvents = 'none';
        }
    }
};

// Global test functions
window.testNotificationSound = () => {
    notificationSystem.playSound();
    showToast('🔔 Testing notification sound...', 'info');
};

window.removeNotificationSound = () => {
    notificationSystem.updateSettings({ soundUrl: null });
    showToast('Sound removed', 'success');
    window.ProjectsApp.showNotificationSettings();
};