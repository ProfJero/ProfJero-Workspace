// js/pages/dashboard.js
import { db, collection, query, where, getDocs, orderBy, limit, serverTimestamp, addDoc, updateDoc, doc } from '../firebase-config.js';
import { showToast, escapeHtml, formatCurrency, timeAgo, closeModal } from '../utils/helpers.js';

let currentUser = null;

export async function renderDashboard(user) {
    currentUser = user;
    
    // Check if user exists and has properties
    const displayName = user?.displayName || user?.email?.split('@')[0] || 'User';
    const userEmail = user?.email || 'user@example.com';
    
    return `
        <div class="space-y-6 animate-fade-in-up">
            <!-- Welcome Banner -->
            <div class="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-6 text-white shadow-xl">
                <h2 class="text-2xl font-bold">Welcome back, ${escapeHtml(displayName)}! 👋</h2>
                <p class="mt-2 opacity-90">Here's your productivity overview for today.</p>
            </div>
            
            <!-- Stats Grid -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6" id="stats-container">
                ${generateSkeletonStats()}
            </div>
            
            <!-- Priority Projects Section -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- High Priority Projects -->
                <div class="glass-card rounded-2xl p-4 md:p-6">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-base md:text-lg font-semibold" style="color: var(--text-primary);">
                            <i class="fas fa-exclamation-triangle mr-2 text-red-500"></i>
                            Priority Projects
                        </h3>
                        <button onclick="window.dispatchEvent(new CustomEvent('navigate', { detail: 'projects' }))" class="text-indigo-600 text-sm hover:underline transition">
                            View All <i class="fas fa-arrow-right ml-1"></i>
                        </button>
                    </div>
                    <div id="priority-projects" class="space-y-3">
                        <div class="animate-pulse space-y-3">
                            <div class="h-20 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
                            <div class="h-20 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
                        </div>
                    </div>
                </div>
                
                <!-- Quick Actions -->
                <div class="glass-card rounded-2xl p-4 md:p-6">
                    <h3 class="text-base md:text-lg font-semibold mb-4" style="color: var(--text-primary);">
                        <i class="fas fa-bolt mr-2 text-yellow-500"></i>
                        Quick Actions
                    </h3>
                    <div class="space-y-3">
                        <button id="quick-task-btn" class="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-3 rounded-xl hover:shadow-lg transition-all transform hover:scale-[1.02] flex items-center justify-center gap-2">
                            <i class="fas fa-plus"></i> Quick Task
                        </button>
                        <button id="quick-note-btn" class="w-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white px-4 py-3 rounded-xl hover:shadow-lg transition-all transform hover:scale-[1.02] flex items-center justify-center gap-2">
                            <i class="fas fa-pen"></i> Quick Note
                        </button>
                        <button id="quick-expense-btn" class="w-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white px-4 py-3 rounded-xl hover:shadow-lg transition-all transform hover:scale-[1.02] flex items-center justify-center gap-2">
                            <i class="fas fa-money-bill-wave"></i> Add Expense
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- Recent Tasks -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="glass-card rounded-2xl p-4 md:p-6">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-base md:text-lg font-semibold" style="color: var(--text-primary);">
                            <i class="fas fa-tasks mr-2 text-indigo-500"></i>
                            Recent Tasks
                        </h3>
                        <button onclick="window.dispatchEvent(new CustomEvent('navigate', { detail: 'tasks' }))" class="text-indigo-600 text-sm hover:underline transition">
                            View All <i class="fas fa-arrow-right ml-1"></i>
                        </button>
                    </div>
                    <div id="recent-tasks" class="space-y-3">
                        <div class="animate-pulse space-y-3">
                            <div class="h-16 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
                            <div class="h-16 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
                        </div>
                    </div>
                </div>
                
                <!-- Recent Activity -->
                <div class="glass-card rounded-2xl p-4 md:p-6">
                    <h3 class="text-base md:text-lg font-semibold mb-4" style="color: var(--text-primary);">
                        <i class="fas fa-history mr-2 text-green-500"></i>
                        Recent Activity
                    </h3>
                    <div id="recent-activity" class="space-y-3">
                        <div class="animate-pulse space-y-3">
                            <div class="h-14 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
                            <div class="h-14 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function generateSkeletonStats() {
    return `
        <div class="glass-card rounded-xl p-4 md:p-6 animate-pulse">
            <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-2"></div>
            <div class="h-8 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
        </div>
        <div class="glass-card rounded-xl p-4 md:p-6 animate-pulse">
            <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-2"></div>
            <div class="h-8 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
        </div>
        <div class="glass-card rounded-xl p-4 md:p-6 animate-pulse">
            <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-2"></div>
            <div class="h-8 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
        </div>
        <div class="glass-card rounded-xl p-4 md:p-6 animate-pulse">
            <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-2"></div>
            <div class="h-8 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
        </div>
    `;
}

export async function loadDashboardData() {
    if (!currentUser) {
        console.log('No current user found');
        return;
    }
    
    try {
        await Promise.all([
            loadStats(),
            loadPriorityProjects(),
            loadRecentTasks(),
            loadRecentActivity()
        ]);
        
        // Setup quick action buttons after content is loaded
        setupQuickActions();
        
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        const statsContainer = document.getElementById('stats-container');
        if (statsContainer && error.code === 'permission-denied') {
            statsContainer.innerHTML = `
                <div class="col-span-full text-center py-8">
                    <i class="fas fa-lock text-4xl text-muted mb-3"></i>
                    <p class="text-muted">Please set up Firebase Security Rules</p>
                    <p class="text-xs text-muted mt-2">Go to Firebase Console → Firestore → Rules and set:</p>
                    <code class="text-xs block mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded">allow read, write: if request.auth != null;</code>
                </div>
            `;
        }
    }
}

function setupQuickActions() {
    // Quick Task Button
    const quickTaskBtn = document.getElementById('quick-task-btn');
    if (quickTaskBtn) {
        quickTaskBtn.addEventListener('click', () => {
            showAddTaskModal();
        });
    }
    
    // Quick Note Button
    const quickNoteBtn = document.getElementById('quick-note-btn');
    if (quickNoteBtn) {
        quickNoteBtn.addEventListener('click', () => {
            showAddNoteModal();
        });
    }
    
    // Quick Expense Button
    const quickExpenseBtn = document.getElementById('quick-expense-btn');
    if (quickExpenseBtn) {
        quickExpenseBtn.addEventListener('click', () => {
            showAddExpenseModal();
        });
    }
}

async function loadPriorityProjects() {
    if (!currentUser) return;
    
    const container = document.getElementById('priority-projects');
    if (!container) return;
    
    try {
        // Get all projects for the user
        const projectsQuery = query(collection(db, 'projects'), where('userId', '==', currentUser.uid));
        const projectsSnap = await getDocs(projectsQuery);
        
        if (projectsSnap.empty) {
            container.innerHTML = `
                <div class="text-center py-8">
                    <i class="fas fa-folder-open text-4xl mb-2" style="color: var(--text-muted);"></i>
                    <p style="color: var(--text-secondary);">No projects yet. Create your first project!</p>
                </div>
            `;
            return;
        }
        
        // Filter active projects and sort by priority (high first) and deadline
        const projects = projectsSnap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(p => p.status !== 'completed' && p.status !== 'cancelled' && !p.archived)
            .sort((a, b) => {
                // Priority order: high > medium > low
                const priorityOrder = { high: 0, medium: 1, low: 2 };
                const priorityDiff = (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1);
                if (priorityDiff !== 0) return priorityDiff;
                
                // If same priority, sort by deadline (closest first)
                if (a.deadline && b.deadline) {
                    return new Date(a.deadline) - new Date(b.deadline);
                }
                if (a.deadline) return -1;
                if (b.deadline) return 1;
                return 0;
            })
            .slice(0, 5); // Show top 5 priority projects
        
        if (projects.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8">
                    <i class="fas fa-check-circle text-4xl mb-2" style="color: var(--emerald);"></i>
                    <p style="color: var(--text-secondary);">All caught up! No priority projects.</p>
                </div>
            `;
            return;
        }
        
        const priorityColors = {
            high: 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400',
            medium: 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400',
            low: 'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400'
        };
        
        container.innerHTML = projects.map(project => {
            const priorityColor = priorityColors[project.priority] || priorityColors.medium;
            const progress = project.progress || 0;
            const isOverdue = project.deadline && new Date(project.deadline) < new Date();
            
            return `
                <div class="p-3 rounded-xl hover:shadow-md transition-all cursor-pointer" 
                     style="background: var(--bg-primary);" 
                     onclick="window.dispatchEvent(new CustomEvent('navigate', { detail: 'projects' }))">
                    <div class="flex items-start justify-between">
                        <div class="flex-1">
                            <div class="flex items-center gap-2 mb-1 flex-wrap">
                                <span class="font-medium" style="color: var(--text-primary);">${escapeHtml(project.name)}</span>
                                <span class="text-xs px-2 py-0.5 rounded-full ${priorityColor}">
                                    ${project.priority || 'Medium'}
                                </span>
                                ${isOverdue ? '<span class="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400"><i class="fas fa-clock mr-1"></i>Overdue</span>' : ''}
                            </div>
                            ${project.client ? `<p class="text-xs" style="color: var(--text-muted);">Client: ${escapeHtml(project.client)}</p>` : ''}
                            ${project.deadline ? `<p class="text-xs" style="color: ${isOverdue ? '#ef4444' : 'var(--text-muted)'};">Due: ${new Date(project.deadline).toLocaleDateString()}</p>` : ''}
                        </div>
                        <div class="text-right">
                            <div class="text-sm font-semibold" style="color: var(--text-primary);">${progress}%</div>
                            <div class="w-20 h-1.5 rounded-full overflow-hidden mt-1" style="background: var(--border-color);">
                                <div class="h-full rounded-full transition-all" style="width: ${progress}%; background: linear-gradient(90deg, var(--deep-blue), var(--emerald));"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading priority projects:', error);
        container.innerHTML = '<p class="text-red-500 text-center py-4">Error loading projects</p>';
    }
}

function showAddTaskModal() {
    const modalHtml = `
        <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) closeModal()">
            <div class="rounded-2xl w-full max-w-md mx-auto transform transition-all" style="background: var(--bg-secondary);">
                <div class="flex justify-between items-center p-5 border-b" style="border-color: var(--border-color);">
                    <div>
                        <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">Create New Task</h2>
                        <p class="text-xs md:text-sm text-muted mt-1">Add a task to your schedule</p>
                    </div>
                    <button onclick="closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                        <i class="fas fa-times text-muted"></i>
                    </button>
                </div>
                
                <form id="quick-task-form" class="p-5 space-y-4">
                    <div>
                        <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Task Title *</label>
                        <input type="text" name="title" required placeholder="Enter task title..." 
                               class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue text-sm md:text-base"
                               style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Description</label>
                        <textarea name="description" rows="3" placeholder="Add description (optional)..."
                                  class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue text-sm md:text-base"
                                  style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></textarea>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Priority</label>
                            <select name="priority" class="w-full px-3 md:px-4 py-2 rounded-lg border text-sm md:text-base"
                                    style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <option value="low">Low Priority</option>
                                <option value="medium" selected>Medium Priority</option>
                                <option value="high">High Priority</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Due Date</label>
                            <input type="date" name="dueDate" class="w-full px-3 md:px-4 py-2 rounded-lg border text-sm md:text-base"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                    </div>
                    
                    <div class="flex flex-col sm:flex-row gap-3 pt-4">
                        <button type="submit" class="flex-1 py-2.5 rounded-lg font-semibold transition-all text-sm md:text-base"
                                style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                            <i class="fas fa-save mr-1"></i> Create Task
                        </button>
                        <button type="button" onclick="closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all text-sm md:text-base"
                                style="background: var(--bg-primary); color: var(--text-muted); border-color: var(--border-color);">
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    const modalContainer = document.getElementById('modal-container');
    if (modalContainer) {
        modalContainer.innerHTML = modalHtml;
        modalContainer.style.pointerEvents = 'auto';
        
        document.getElementById('quick-task-form').onsubmit = async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            
            try {
                await addDoc(collection(db, 'tasks'), {
                    title: formData.get('title'),
                    description: formData.get('description') || '',
                    priority: formData.get('priority'),
                    dueDate: formData.get('dueDate') || null,
                    status: 'todo',
                    userId: currentUser.uid,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
                showToast('Task created successfully! 🎉', 'success');
                closeModal();
                await loadDashboardData();
                // Also reload tasks page data if it's the current page
                if (typeof loadTasksData !== 'undefined') {
                    try { await loadTasksData(); } catch(e) {}
                }
            } catch (error) {
                console.error('Error creating task:', error);
                showToast('Failed to create task. Please try again.', 'error');
            }
        };
    }
}

function showAddNoteModal() {
    const modalHtml = `
        <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) closeModal()">
            <div class="rounded-2xl w-full max-w-md mx-auto transform transition-all" style="background: var(--bg-secondary);">
                <div class="flex justify-between items-center p-5 border-b" style="border-color: var(--border-color);">
                    <div>
                        <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">Create New Note</h2>
                        <p class="text-xs md:text-sm text-muted mt-1">Capture your thoughts and ideas</p>
                    </div>
                    <button onclick="closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                        <i class="fas fa-times text-muted"></i>
                    </button>
                </div>
                
                <form id="quick-note-form" class="p-5 space-y-4">
                    <div>
                        <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Note Title *</label>
                        <input type="text" name="title" required placeholder="Enter note title..." 
                               class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue text-sm md:text-base"
                               style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Content</label>
                        <textarea name="content" rows="6" placeholder="Write your note here..."
                                  class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue text-sm md:text-base"
                                  style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></textarea>
                    </div>
                    
                    <div class="flex flex-col sm:flex-row gap-3 pt-4">
                        <button type="submit" class="flex-1 py-2.5 rounded-lg font-semibold transition-all text-sm md:text-base"
                                style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                            <i class="fas fa-save mr-1"></i> Save Note
                        </button>
                        <button type="button" onclick="closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all text-sm md:text-base"
                                style="background: var(--bg-primary); color: var(--text-muted); border-color: var(--border-color);">
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    const modalContainer = document.getElementById('modal-container');
    if (modalContainer) {
        modalContainer.innerHTML = modalHtml;
        modalContainer.style.pointerEvents = 'auto';
        
        document.getElementById('quick-note-form').onsubmit = async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            
            try {
                await addDoc(collection(db, 'notes'), {
                    title: formData.get('title'),
                    content: formData.get('content') || '',
                    category: 'personal',
                    tags: [],
                    important: false,
                    userId: currentUser.uid,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
                showToast('Note saved successfully! 📝', 'success');
                closeModal();
                await loadDashboardData();
                // Also reload notes page data if it's the current page
                if (typeof loadNotesData !== 'undefined') {
                    try { await loadNotesData(); } catch(e) {}
                }
            } catch (error) {
                console.error('Error creating note:', error);
                showToast('Failed to save note. Please try again.', 'error');
            }
        };
    }
}

function showAddExpenseModal() {
    const modalHtml = `
        <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) closeModal()">
            <div class="rounded-2xl w-full max-w-md mx-auto transform transition-all" style="background: var(--bg-secondary);">
                <div class="flex justify-between items-center p-5 border-b" style="border-color: var(--border-color);">
                    <div>
                        <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">Add Expense</h2>
                        <p class="text-xs md:text-sm text-muted mt-1">Track your spending</p>
                    </div>
                    <button onclick="closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                        <i class="fas fa-times text-muted"></i>
                    </button>
                </div>
                
                <form id="quick-expense-form" class="p-5 space-y-4">
                    <div>
                        <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Amount *</label>
                        <div class="relative">
                            <span class="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted">₵</span>
                            <input type="number" name="amount" step="0.01" required placeholder="0.00" 
                                   class="w-full pl-8 pr-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue text-sm md:text-base"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Category</label>
                        <select name="category" class="w-full px-3 md:px-4 py-2 rounded-lg border text-sm md:text-base"
                                style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            <option value="food">Food & Dining</option>
                            <option value="transport">Transport</option>
                            <option value="housing">Housing</option>
                            <option value="utilities">Utilities</option>
                            <option value="entertainment">Entertainment</option>
                            <option value="shopping">Shopping</option>
                            <option value="health">Health</option>
                            <option value="education">Education</option>
                            <option value="bills">Bills</option>
                            <option value="other-expense">Other</option>
                        </select>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Description</label>
                        <input type="text" name="description" required placeholder="What was this for?"
                               class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue text-sm md:text-base"
                               style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Date</label>
                        <input type="date" name="date" value="${new Date().toISOString().split('T')[0]}" 
                               class="w-full px-3 md:px-4 py-2 rounded-lg border text-sm md:text-base"
                               style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                    </div>
                    
                    <div class="flex flex-col sm:flex-row gap-3 pt-4">
                        <button type="submit" class="flex-1 py-2.5 rounded-lg font-semibold transition-all text-sm md:text-base"
                                style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                            <i class="fas fa-save mr-1"></i> Add Expense
                        </button>
                        <button type="button" onclick="closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all text-sm md:text-base"
                                style="background: var(--bg-primary); color: var(--text-muted); border-color: var(--border-color);">
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    const modalContainer = document.getElementById('modal-container');
    if (modalContainer) {
        modalContainer.innerHTML = modalHtml;
        modalContainer.style.pointerEvents = 'auto';
        
        document.getElementById('quick-expense-form').onsubmit = async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            
            try {
                await addDoc(collection(db, 'transactions'), {
                    type: 'expense',
                    category: formData.get('category'),
                    amount: parseFloat(formData.get('amount')),
                    description: formData.get('description'),
                    date: new Date(formData.get('date')),
                    userId: currentUser.uid,
                    createdAt: serverTimestamp()
                });
                showToast('Expense added successfully! 💰', 'success');
                closeModal();
                await loadDashboardData();
                // Also reload finance page data if it's the current page
                if (typeof loadFinanceData !== 'undefined') {
                    try { await loadFinanceData(); } catch(e) {}
                }
            } catch (error) {
                console.error('Error adding expense:', error);
                showToast('Failed to add expense. Please try again.', 'error');
            }
        };
    }
}

async function loadStats() {
    if (!currentUser) return;
    
    const statsContainer = document.getElementById('stats-container');
    if (!statsContainer) return;
    
    try {
        // Get tasks
        let totalTasks = 0;
        let completedTasks = 0;
        let activeProjects = 0;
        let totalIncome = 0;
        let totalExpenses = 0;
        
        try {
            const tasksQuery = query(collection(db, 'tasks'), where('userId', '==', currentUser.uid));
            const tasksSnap = await getDocs(tasksQuery);
            totalTasks = tasksSnap.size;
            completedTasks = tasksSnap.docs.filter(doc => doc.data().status === 'done').length;
        } catch (e) {
            console.log('Tasks collection not ready:', e.message);
        }
        
        try {
            const projectsQuery = query(collection(db, 'projects'), where('userId', '==', currentUser.uid));
            const projectsSnap = await getDocs(projectsQuery);
            activeProjects = projectsSnap.docs.filter(doc => doc.data().status === 'active').length;
        } catch (e) {
            console.log('Projects collection not ready:', e.message);
        }
        
        try {
            const financesQuery = query(collection(db, 'transactions'), where('userId', '==', currentUser.uid));
            const financesSnap = await getDocs(financesQuery);
            totalIncome = financesSnap.docs.filter(doc => doc.data().type === 'income').reduce((sum, doc) => sum + (doc.data().amount || 0), 0);
            totalExpenses = financesSnap.docs.filter(doc => doc.data().type === 'expense').reduce((sum, doc) => sum + (doc.data().amount || 0), 0);
        } catch (e) {
            console.log('Transactions collection not ready:', e.message);
        }
        
        const balance = totalIncome - totalExpenses;
        const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        
        statsContainer.innerHTML = `
            <div class="glass-card rounded-xl p-4 md:p-6 hover:shadow-lg transition-all">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-sm" style="color: var(--text-secondary);">Tasks Completed</span>
                    <i class="fas fa-check-circle text-green-500 text-xl"></i>
                </div>
                <div class="text-2xl md:text-3xl font-bold" style="color: var(--text-primary);">${completedTasks}/${totalTasks}</div>
                <div class="text-sm mt-2" style="color: var(--text-secondary);">${completionRate}% completion</div>
                <div class="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div class="h-full bg-green-500 rounded-full transition-all" style="width: ${completionRate}%"></div>
                </div>
            </div>
            <div class="glass-card rounded-xl p-4 md:p-6 hover:shadow-lg transition-all">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-sm" style="color: var(--text-secondary);">Active Projects</span>
                    <i class="fas fa-folder text-blue-500 text-xl"></i>
                </div>
                <div class="text-2xl md:text-3xl font-bold" style="color: var(--text-primary);">${activeProjects}</div>
                <div class="text-sm mt-2" style="color: var(--text-secondary);">Currently in progress</div>
            </div>
            <div class="glass-card rounded-xl p-4 md:p-6 hover:shadow-lg transition-all">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-sm" style="color: var(--text-secondary);">Balance</span>
                    <i class="fas fa-wallet text-purple-500 text-xl"></i>
                </div>
                <div class="text-2xl md:text-3xl font-bold ${balance >= 0 ? 'text-emerald-600' : 'text-red-600'}">
                    ${formatCurrency(balance, 'GHS')}
                </div>
                <div class="text-sm mt-2" style="color: var(--text-secondary);">
                    Income: ${formatCurrency(totalIncome, 'GHS')} | Expenses: ${formatCurrency(totalExpenses, 'GHS')}
                </div>
            </div>
            <div class="glass-card rounded-xl p-4 md:p-6 hover:shadow-lg transition-all">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-sm" style="color: var(--text-secondary);">Productivity</span>
                    <i class="fas fa-chart-line text-indigo-500 text-xl"></i>
                </div>
                <div class="text-2xl md:text-3xl font-bold" style="color: var(--text-primary);">${completionRate}%</div>
                <div class="text-sm mt-2" style="color: var(--text-secondary);">Overall completion rate</div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading stats:', error);
        if (statsContainer && error.code === 'permission-denied') {
            statsContainer.innerHTML = `
                <div class="col-span-full text-center py-8">
                    <i class="fas fa-lock text-4xl text-muted mb-3"></i>
                    <p class="text-muted">Unable to load statistics. Please check Firebase permissions.</p>
                </div>
            `;
        }
    }
}

async function loadRecentTasks() {
    if (!currentUser) return;
    
    const tasksContainer = document.getElementById('recent-tasks');
    if (!tasksContainer) return;
    
    try {
        const q = query(collection(db, 'tasks'), where('userId', '==', currentUser.uid), orderBy('createdAt', 'desc'), limit(5));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            tasksContainer.innerHTML = `
                <div class="text-center py-8">
                    <i class="fas fa-inbox text-4xl mb-2" style="color: var(--text-muted);"></i>
                    <p style="color: var(--text-secondary);">No tasks yet. Create your first task!</p>
                </div>
            `;
            return;
        }
        
        tasksContainer.innerHTML = querySnapshot.docs.map(doc => {
            const task = doc.data();
            const priorityColors = {
                high: 'text-red-500 bg-red-50 dark:bg-red-900/20',
                medium: 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20',
                low: 'text-green-500 bg-green-50 dark:bg-green-900/20'
            };
            const priorityColor = priorityColors[task.priority] || priorityColors.medium;
            
            return `
                <div class="flex items-center justify-between p-3 rounded-xl hover:shadow-md transition-all group" style="background: var(--bg-primary);">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1 flex-wrap">
                            <p class="font-medium ${task.status === 'done' ? 'line-through' : ''}" style="color: var(--text-primary);">
                                ${escapeHtml(task.title)}
                            </p>
                            <span class="text-xs px-2 py-0.5 rounded-full ${priorityColor}">
                                ${task.priority || 'medium'}
                            </span>
                        </div>
                        ${task.dueDate ? `<p class="text-xs" style="color: var(--text-muted);">Due: ${new Date(task.dueDate).toLocaleDateString()}</p>` : ''}
                    </div>
                    <input type="checkbox" ${task.status === 'done' ? 'checked' : ''} 
                           onchange="window.toggleTaskStatus('${doc.id}', this.checked)" 
                           class="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer">
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading tasks:', error);
        tasksContainer.innerHTML = '<p class="text-red-500 text-center py-4">Error loading tasks</p>';
    }
}

async function loadRecentActivity() {
    if (!currentUser) return;
    
    const activityContainer = document.getElementById('recent-activity');
    if (!activityContainer) return;
    
    try {
        const activities = [];
        
        // Get recent tasks
        try {
            const tasksQuery = query(collection(db, 'tasks'), where('userId', '==', currentUser.uid), orderBy('createdAt', 'desc'), limit(3));
            const tasksSnap = await getDocs(tasksQuery);
            tasksSnap.forEach(doc => {
                const data = doc.data();
                if (data.createdAt) {
                    activities.push({ 
                        type: 'task', 
                        title: data.title, 
                        date: data.createdAt,
                        icon: 'fa-tasks',
                        color: 'text-blue-500'
                    });
                }
            });
        } catch (e) {
            console.log('Error loading tasks for activity:', e.message);
        }
        
        // Get recent notes
        try {
            const notesQuery = query(collection(db, 'notes'), where('userId', '==', currentUser.uid), orderBy('createdAt', 'desc'), limit(3));
            const notesSnap = await getDocs(notesQuery);
            notesSnap.forEach(doc => {
                const data = doc.data();
                if (data.createdAt) {
                    activities.push({ 
                        type: 'note', 
                        title: data.title, 
                        date: data.createdAt,
                        icon: 'fa-pen',
                        color: 'text-green-500'
                    });
                }
            });
        } catch (e) {
            console.log('Error loading notes for activity:', e.message);
        }
        
        // Sort by date
        activities.sort((a, b) => {
            const dateA = a.date?.toDate ? a.date.toDate() : new Date(0);
            const dateB = b.date?.toDate ? b.date.toDate() : new Date(0);
            return dateB - dateA;
        });
        
        if (activities.length === 0) {
            activityContainer.innerHTML = `
                <div class="text-center py-8">
                    <i class="fas fa-clock text-4xl mb-2" style="color: var(--text-muted);"></i>
                    <p style="color: var(--text-secondary);">No recent activity</p>
                </div>
            `;
            return;
        }
        
        activityContainer.innerHTML = activities.slice(0, 5).map(activity => `
            <div class="flex items-center gap-3 p-3 rounded-xl hover:shadow-md transition-all" style="background: var(--bg-primary);">
                <div class="w-10 h-10 rounded-full flex items-center justify-center bg-indigo-100 dark:bg-indigo-900/30">
                    <i class="fas ${activity.icon} ${activity.color}"></i>
                </div>
                <div class="flex-1">
                    <p class="font-medium" style="color: var(--text-primary);">${escapeHtml(activity.title)}</p>
                    <p class="text-xs capitalize" style="color: var(--text-muted);">${activity.type}</p>
                </div>
                <span class="text-xs" style="color: var(--text-muted);">${timeAgo(activity.date)}</span>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading activity:', error);
        activityContainer.innerHTML = '<p class="text-red-500 text-center py-4">Error loading activity</p>';
    }
}

// Make functions available globally
window.toggleTaskStatus = async (taskId, completed) => {
    try {
        const taskRef = doc(db, 'tasks', taskId);
        await updateDoc(taskRef, {
            status: completed ? 'done' : 'todo',
            updatedAt: serverTimestamp()
        });
        showToast(completed ? 'Task completed! 🎉' : 'Task reopened', 'success');
        await loadRecentTasks();
        await loadRecentActivity();
        await loadStats();
        // Also reload tasks page data if it's the current page
        if (typeof loadTasksData !== 'undefined') {
            try { await loadTasksData(); } catch(e) {}
        }
    } catch (error) {
        console.error('Error updating task:', error);
        showToast('Error updating task', 'error');
    }
};

// Make closeModal available globally
window.closeModal = closeModal;