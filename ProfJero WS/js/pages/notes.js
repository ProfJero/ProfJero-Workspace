// js/pages/notes.js
import { db, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, serverTimestamp } from '../firebase-config.js';
import { showToast, escapeHtml, formatDate, timeAgo } from '../utils/helpers.js';

let currentUser = null;
let currentCategory = 'all';
let currentSort = 'updatedAt';
let searchQuery = '';
let notesCache = [];
let autoSaveTimer = null;
let currentEditingNote = null;
let isFormattingActive = false;

export async function renderNotesPage(user) {
    currentUser = user;
    
    return `
        <div class="space-y-6 animate-fade-in-up">
            <!-- Header -->
            <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                    <h1 class="text-2xl md:text-3xl font-bold" style="color: var(--text-primary);">Notes & Ideas</h1>
                    <p class="text-sm md:text-base text-muted mt-1">Capture, organize, and manage your thoughts with rich formatting</p>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button onclick="window.NotesApp.showAddModal()" class="px-4 md:px-5 py-2 md:py-3 rounded-xl font-semibold flex items-center gap-2 transition-all transform hover:scale-[1.02] text-sm md:text-base" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                        <i class="fas fa-plus"></i>
                        <span class="hidden sm:inline">New Note</span>
                        <span class="sm:hidden">Note</span>
                    </button>
                    <button onclick="window.NotesApp.showMeetingNotesModal()" class="px-4 md:px-5 py-2 md:py-3 rounded-xl font-semibold flex items-center gap-2 transition-all hover:shadow-md text-sm md:text-base" style="background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary);">
                        <i class="fas fa-users"></i>
                        <span class="hidden sm:inline">Meeting</span>
                        <span class="sm:hidden">Meeting</span>
                    </button>
                    <button onclick="window.NotesApp.showCategories()" class="px-4 md:px-5 py-2 md:py-3 rounded-xl font-semibold flex items-center gap-2 transition-all hover:shadow-md text-sm md:text-base" style="background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary);">
                        <i class="fas fa-tags"></i>
                        <span class="hidden sm:inline">Categories</span>
                        <span class="sm:hidden">Tags</span>
                    </button>
                </div>
            </div>
            
            <!-- Stats -->
            <div class="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-6 gap-2 md:gap-3">
                <div class="glass-card p-2 md:p-3 rounded-xl text-center cursor-pointer transition-all hover:scale-[1.02]" data-category="all">
                    <div class="text-base md:text-xl font-bold" id="stat-all" style="color: var(--deep-blue);">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-folder-open"></i> <span class="hidden xs:inline">All</span></div>
                </div>
                <div class="glass-card p-2 md:p-3 rounded-xl text-center cursor-pointer transition-all hover:scale-[1.02]" data-category="pinned">
                    <div class="text-base md:text-xl font-bold" id="stat-pinned" style="color: #f59e0b;">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-thumbtack"></i> <span class="hidden xs:inline">Pin</span></div>
                </div>
                <div class="glass-card p-2 md:p-3 rounded-xl text-center cursor-pointer transition-all hover:scale-[1.02]" data-category="personal">
                    <div class="text-base md:text-xl font-bold" id="stat-personal" style="color: var(--emerald);">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-user"></i> <span class="hidden xs:inline">Pers</span></div>
                </div>
                <div class="glass-card p-2 md:p-3 rounded-xl text-center cursor-pointer transition-all hover:scale-[1.02]" data-category="work">
                    <div class="text-base md:text-xl font-bold" id="stat-work" style="color: var(--gold);">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-briefcase"></i> <span class="hidden xs:inline">Work</span></div>
                </div>
                <div class="glass-card p-2 md:p-3 rounded-xl text-center cursor-pointer transition-all hover:scale-[1.02]" data-category="meeting">
                    <div class="text-base md:text-xl font-bold" id="stat-meeting" style="color: #8b5cf6;">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-users"></i> <span class="hidden xs:inline">Meet</span></div>
                </div>
                <div class="glass-card p-2 md:p-3 rounded-xl text-center cursor-pointer transition-all hover:scale-[1.02]" data-category="important">
                    <div class="text-base md:text-xl font-bold" id="stat-important" style="color: #ef4444;">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-star"></i> <span class="hidden xs:inline">Imp</span></div>
                </div>
            </div>
            
            <!-- Search and Filter -->
            <div class="glass-card rounded-xl p-3 md:p-4">
                <div class="flex flex-col md:flex-row gap-3">
                    <div class="flex-1 relative">
                        <i class="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-muted"></i>
                        <input type="text" id="note-search" placeholder="Search notes..." 
                               class="w-full pl-10 pr-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all text-sm" 
                               style="background: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);">
                    </div>
                    
                    <div class="flex flex-wrap gap-2">
                        <select id="note-category-filter" class="flex-1 md:flex-none px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all text-sm" style="background: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);">
                            <option value="all">All</option>
                            <option value="pinned">📌 Pinned</option>
                            <option value="personal">👤 Personal</option>
                            <option value="work">💼 Work</option>
                            <option value="meeting">👥 Meeting</option>
                            <option value="ideas">💡 Ideas</option>
                            <option value="important">⭐ Important</option>
                            <option value="research">🔬 Research</option>
                            <option value="tutorial">🎓 Tutorial</option>
                        </select>
                        
                        <select id="note-sort" class="flex-1 md:flex-none px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all text-sm" style="background: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);">
                            <option value="updatedAt"><i class="fas fa-clock"></i> Recent</option>
                            <option value="createdAt"><i class="fas fa-calendar-plus"></i> Oldest</option>
                            <option value="title"><i class="fas fa-font"></i> Title</option>
                            <option value="pinned"><i class="fas fa-thumbtack"></i> Pinned</option>
                        </select>
                        
                        <div class="flex gap-2">
                            <button id="view-grid" class="px-3 md:px-4 py-2 rounded-lg transition-all" title="Grid View">
                                <i class="fas fa-th-large"></i>
                            </button>
                            <button id="view-list" class="px-3 md:px-4 py-2 rounded-lg transition-all" title="List View">
                                <i class="fas fa-list"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Notes Container -->
            <div id="notes-container" class="space-y-4">
                <div class="text-center py-12">
                    <div class="animate-pulse"><i class="fas fa-spinner fa-spin mr-2 text-muted"></i> Loading notes...</div>
                </div>
            </div>
        </div>
    `;
}

export async function loadNotesData() {
    if (!currentUser) return;
    await loadNotes();
    setupEventListeners();
}

async function loadNotes() {
    const container = document.getElementById('notes-container');
    if (!container) return;
    
    try {
        const q = query(collection(db, 'notes'), where('userId', '==', currentUser.uid), orderBy('updatedAt', 'desc'));
        const querySnapshot = await getDocs(q);
        
        notesCache = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate?.() || new Date(),
            updatedAt: doc.data().updatedAt?.toDate?.() || new Date(),
            tags: doc.data().tags || []
        }));
        
        updateStats();
        filterAndRenderNotes();
    } catch (error) {
        console.error('Error loading notes:', error);
        container.innerHTML = '<div class="text-center py-12 text-red-500">Failed to load notes</div>';
    }
}

function updateStats() {
    const all = notesCache.length;
    const pinned = notesCache.filter(n => n.pinned === true).length;
    const personal = notesCache.filter(n => n.category === 'personal').length;
    const work = notesCache.filter(n => n.category === 'work').length;
    const meeting = notesCache.filter(n => n.category === 'meeting').length;
    const important = notesCache.filter(n => n.important === true).length;
    
    // Use try-catch to handle missing elements gracefully
    try {
        const statAll = document.getElementById('stat-all');
        const statPinned = document.getElementById('stat-pinned');
        const statPersonal = document.getElementById('stat-personal');
        const statWork = document.getElementById('stat-work');
        const statMeeting = document.getElementById('stat-meeting');
        const statImportant = document.getElementById('stat-important');
        
        if (statAll) statAll.textContent = all;
        if (statPinned) statPinned.textContent = pinned;
        if (statPersonal) statPersonal.textContent = personal;
        if (statWork) statWork.textContent = work;
        if (statMeeting) statMeeting.textContent = meeting;
        if (statImportant) statImportant.textContent = important;
    } catch (error) {
        console.log('Stats update skipped - elements not ready');
    }
}

function filterAndRenderNotes() {
    let filtered = [...notesCache];
    
    const searchInput = document.getElementById('note-search');
    if (searchInput && searchInput.value) {
        const query = searchInput.value.toLowerCase();
        filtered = filtered.filter(n => 
            n.title?.toLowerCase().includes(query) || 
            n.content?.toLowerCase().includes(query) ||
            n.tags?.some(tag => tag.toLowerCase().includes(query)) ||
            (n.meetingData?.agenda?.toLowerCase().includes(query)) ||
            (n.meetingData?.actionItems?.some(item => item.toLowerCase().includes(query)))
        );
    }
    
    const categoryFilter = document.getElementById('note-category-filter');
    if (categoryFilter && categoryFilter.value !== 'all') {
        if (categoryFilter.value === 'pinned') {
            filtered = filtered.filter(n => n.pinned === true);
        } else {
            filtered = filtered.filter(n => n.category === categoryFilter.value);
        }
    }
    
    const sortSelect = document.getElementById('note-sort');
    const sortBy = sortSelect ? sortSelect.value : 'updatedAt';
    
    filtered.sort((a, b) => {
        if (sortBy === 'pinned') return (b.pinned === true) - (a.pinned === true);
        if (sortBy === 'updatedAt') return b.updatedAt - a.updatedAt;
        if (sortBy === 'createdAt') return b.createdAt - a.createdAt;
        if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
        return 0;
    });
    
    renderNotes(filtered);
}

function renderNotes(notes) {
    const container = document.getElementById('notes-container');
    if (!container) return;
    
    const isGridView = localStorage.getItem('noteView') === 'grid';
    
    if (notes.length === 0) {
        container.innerHTML = `
            <div class="glass-card rounded-xl p-8 md:p-12 text-center">
                <i class="fas fa-pen-fancy text-5xl md:text-6xl mb-4 text-muted"></i>
                <h3 class="text-lg md:text-xl font-semibold mb-2" style="color: var(--text-primary);">No notes yet</h3>
                <p class="text-sm text-muted">Create your first note to capture your thoughts and ideas</p>
                <button onclick="window.NotesApp.showAddModal()" class="mt-4 px-4 md:px-5 py-2 rounded-lg font-semibold transition-all transform hover:scale-[1.02] text-sm" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                    <i class="fas fa-plus mr-1"></i> Write a Note
                </button>
            </div>
        `;
        return;
    }
    
    if (isGridView) {
        container.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4';
        container.innerHTML = notes.map(note => createNoteCard(note)).join('');
    } else {
        container.className = 'space-y-3';
        container.innerHTML = notes.map(note => createNoteListItem(note)).join('');
    }
}

function createNoteCard(note) {
    const categoryConfig = {
        personal: { icon: 'fa-user', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', label: 'Personal' },
        work: { icon: 'fa-briefcase', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', label: 'Work' },
        meeting: { icon: 'fa-users', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', label: 'Meeting' },
        ideas: { icon: 'fa-lightbulb', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)', label: 'Ideas' },
        important: { icon: 'fa-star', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', label: 'Important' },
        research: { icon: 'fa-flask', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', label: 'Research' },
        tutorial: { icon: 'fa-graduation-cap', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', label: 'Tutorial' }
    };
    
    const config = categoryConfig[note.category] || categoryConfig.personal;
    const previewContent = note.content?.substring(0, 120) || '';
    const wordCount = note.content?.split(/\s+/).filter(w => w.length > 0).length || 0;
    const isMeeting = note.category === 'meeting' && note.meetingData;
    
    return `
        <div class="glass-card rounded-xl p-4 md:p-5 transition-all hover:shadow-lg cursor-pointer ${note.pinned ? 'border-t-4' : ''}" style="${note.pinned ? `border-top-color: ${config.color};` : ''}" onclick="window.NotesApp.viewNote('${note.id}')">
            <div class="flex justify-between items-start mb-3">
                <div class="flex items-center gap-2 flex-wrap">
                    ${note.pinned ? '<i class="fas fa-thumbtack text-sm" style="color: #f59e0b; transform: rotate(45deg);"></i>' : ''}
                    <i class="fas ${config.icon} text-sm md:text-base" style="color: ${config.color};"></i>
                    <span class="text-xs px-2 py-0.5 rounded-full" style="background: ${config.bg}; color: ${config.color};">${config.label}</span>
                    ${note.important ? '<i class="fas fa-star text-xs" style="color: #f59e0b;"></i>' : ''}
                </div>
                <div class="flex gap-1">
                    <button onclick="event.stopPropagation(); window.NotesApp.togglePin('${note.id}')" class="p-1 rounded-lg transition-all hover:bg-gray-100 dark:hover:bg-gray-700" title="${note.pinned ? 'Unpin' : 'Pin'}">
                        <i class="fas fa-thumbtack text-xs" style="color: ${note.pinned ? '#f59e0b' : 'var(--text-muted)'};"></i>
                    </button>
                    <button onclick="event.stopPropagation(); window.NotesApp.toggleImportant('${note.id}')" class="p-1 rounded-lg transition-all hover:bg-gray-100 dark:hover:bg-gray-700">
                        <i class="fas ${note.important ? 'fa-star' : 'fa-star'} text-xs" style="color: ${note.important ? '#f59e0b' : 'var(--text-muted)'};"></i>
                    </button>
                    <button onclick="event.stopPropagation(); window.NotesApp.edit('${note.id}')" class="p-1 rounded-lg transition-all hover:bg-gray-100 dark:hover:bg-gray-700">
                        <i class="fas fa-edit text-xs" style="color: var(--text-muted);"></i>
                    </button>
                    <button onclick="event.stopPropagation(); window.NotesApp.delete('${note.id}')" class="p-1 rounded-lg transition-all hover:bg-red-100 dark:hover:bg-red-900/20">
                        <i class="fas fa-trash text-xs" style="color: #ef4444;"></i>
                    </button>
                </div>
            </div>
            
            <h3 class="font-bold text-base md:text-lg mb-2 line-clamp-1" style="color: var(--text-primary);">${escapeHtml(note.title)}</h3>
            
            ${isMeeting && note.meetingData ? `
                <div class="mb-3 p-2 rounded-lg" style="background: ${config.bg}">
                    <div class="text-xs mb-1" style="color: var(--text-muted);"><i class="fas fa-calendar"></i> ${formatDate(note.meetingData.date)}</div>
                    <div class="text-xs mb-1" style="color: var(--text-muted);"><i class="fas fa-users"></i> Attendees: ${note.meetingData.attendees?.length || 0}</div>
                    <div class="text-xs" style="color: var(--text-muted);"><i class="fas fa-check-circle"></i> Action Items: ${note.meetingData.actionItems?.length || 0}</div>
                </div>
            ` : previewContent ? `
                <div class="text-sm mb-3 line-clamp-3" style="color: var(--text-muted);">${escapeHtml(previewContent)}</div>
            ` : '<div class="text-sm italic mb-3" style="color: var(--text-muted);">No content</div>'}
            
            ${note.tags?.length > 0 ? `
                <div class="flex flex-wrap gap-1 mb-3">
                    ${note.tags.slice(0, 3).map(tag => `<span class="text-xs px-2 py-0.5 rounded-full" style="background: var(--bg-primary); color: var(--text-muted);"><i class="fas fa-tag"></i> ${escapeHtml(tag)}</span>`).join('')}
                    ${note.tags.length > 3 ? `<span class="text-xs px-2 py-0.5 rounded-full" style="background: var(--bg-primary); color: var(--text-muted);">+${note.tags.length - 3}</span>` : ''}
                </div>
            ` : ''}
            
            <div class="flex justify-between items-center text-xs pt-2 border-t" style="color: var(--text-muted); border-color: var(--border-color);">
                <span><i class="fas fa-clock"></i> ${timeAgo(note.updatedAt)}</span>
                <span><i class="fas fa-file-alt"></i> ${wordCount} words</span>
            </div>
        </div>
    `;
}

function createNoteListItem(note) {
    const categoryConfig = {
        personal: { icon: 'fa-user', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', label: 'Personal' },
        work: { icon: 'fa-briefcase', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', label: 'Work' },
        meeting: { icon: 'fa-users', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', label: 'Meeting' },
        ideas: { icon: 'fa-lightbulb', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)', label: 'Ideas' },
        important: { icon: 'fa-star', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', label: 'Important' },
        research: { icon: 'fa-flask', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', label: 'Research' },
        tutorial: { icon: 'fa-graduation-cap', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', label: 'Tutorial' }
    };
    
    const config = categoryConfig[note.category] || categoryConfig.personal;
    const previewContent = note.content?.substring(0, 80) || '';
    const isMeeting = note.category === 'meeting' && note.meetingData;
    
    return `
        <div class="glass-card rounded-xl p-3 md:p-4 transition-all hover:shadow-lg cursor-pointer ${note.pinned ? 'border-l-4' : ''}" style="${note.pinned ? `border-left-color: ${config.color};` : ''}" onclick="window.NotesApp.viewNote('${note.id}')">
            <div class="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                <div class="flex-shrink-0 self-start">
                    <div class="w-10 h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center" style="background: ${config.bg};">
                        <i class="fas ${config.icon} text-base md:text-xl" style="color: ${config.color};"></i>
                    </div>
                </div>
                
                <div class="flex-1 min-w-0">
                    <div class="flex flex-wrap items-center gap-2 mb-2">
                        ${note.pinned ? '<i class="fas fa-thumbtack text-xs" style="color: #f59e0b;"></i>' : ''}
                        <h3 class="font-bold text-base md:text-lg truncate" style="color: var(--text-primary);">${escapeHtml(note.title)}</h3>
                        <span class="text-xs px-2 py-0.5 rounded-full" style="background: ${config.bg}; color: ${config.color};">${config.label}</span>
                        ${note.important ? '<i class="fas fa-star text-xs" style="color: #f59e0b;"></i>' : ''}
                    </div>
                    
                    ${isMeeting && note.meetingData ? `
                        <div class="text-xs mb-2" style="color: var(--text-muted);">
                            <i class="fas fa-calendar"></i> ${formatDate(note.meetingData.date)} | 
                            <i class="fas fa-users"></i> ${note.meetingData.attendees?.length || 0} attendees
                        </div>
                    ` : previewContent ? `
                        <div class="text-sm line-clamp-2" style="color: var(--text-muted);">${escapeHtml(previewContent)}...</div>
                    ` : '<div class="text-sm italic" style="color: var(--text-muted);">No content</div>'}
                    
                    <div class="flex flex-wrap items-center gap-3 mt-2 text-xs" style="color: var(--text-muted);">
                        <span><i class="fas fa-clock"></i> ${timeAgo(note.updatedAt)}</span>
                        ${note.tags?.length > 0 ? `
                            <span class="flex items-center gap-1">
                                <i class="fas fa-tags"></i>
                                ${note.tags.slice(0, 2).map(tag => `<span class="text-xs">${escapeHtml(tag)}</span>`).join(', ')}
                                ${note.tags.length > 2 ? `+${note.tags.length - 2}` : ''}
                            </span>
                        ` : ''}
                    </div>
                </div>
                
                <div class="flex gap-1 self-start">
                    <button onclick="event.stopPropagation(); window.NotesApp.togglePin('${note.id}')" class="p-1 md:p-2 rounded-lg transition-all hover:bg-gray-100 dark:hover:bg-gray-700" title="${note.pinned ? 'Unpin' : 'Pin'}">
                        <i class="fas fa-thumbtack text-xs md:text-sm" style="color: ${note.pinned ? '#f59e0b' : 'var(--text-muted)'};"></i>
                    </button>
                    <button onclick="event.stopPropagation(); window.NotesApp.toggleImportant('${note.id}')" class="p-1 md:p-2 rounded-lg transition-all hover:bg-gray-100 dark:hover:bg-gray-700">
                        <i class="fas ${note.important ? 'fa-star' : 'fa-star'} text-xs md:text-sm" style="color: ${note.important ? '#f59e0b' : 'var(--text-muted)'};"></i>
                    </button>
                    <button onclick="event.stopPropagation(); window.NotesApp.edit('${note.id}')" class="p-1 md:p-2 rounded-lg transition-all hover:bg-gray-100 dark:hover:bg-gray-700">
                        <i class="fas fa-edit text-xs md:text-sm" style="color: var(--text-muted);"></i>
                    </button>
                    <button onclick="event.stopPropagation(); window.NotesApp.delete('${note.id}')" class="p-1 md:p-2 rounded-lg transition-all hover:bg-red-100 dark:hover:bg-red-900/20">
                        <i class="fas fa-trash text-xs md:text-sm" style="color: #ef4444;"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

function setupEventListeners() {
    document.querySelectorAll('[data-category]').forEach(stat => {
        stat.addEventListener('click', () => {
            const category = stat.dataset.category;
            const filterSelect = document.getElementById('note-category-filter');
            if (filterSelect) {
                filterSelect.value = category;
                filterAndRenderNotes();
            }
        });
    });
    
    const searchInput = document.getElementById('note-search');
    if (searchInput) searchInput.addEventListener('input', () => filterAndRenderNotes());
    
    const categoryFilter = document.getElementById('note-category-filter');
    if (categoryFilter) categoryFilter.addEventListener('change', () => filterAndRenderNotes());
    
    const sortSelect = document.getElementById('note-sort');
    if (sortSelect) sortSelect.addEventListener('change', () => filterAndRenderNotes());
    
    const gridBtn = document.getElementById('view-grid');
    const listBtn = document.getElementById('view-list');
    
    if (gridBtn && listBtn) {
        gridBtn.addEventListener('click', () => {
            localStorage.setItem('noteView', 'grid');
            gridBtn.style.background = 'linear-gradient(135deg, var(--deep-blue), var(--emerald))';
            gridBtn.style.color = 'white';
            listBtn.style.background = 'var(--bg-secondary)';
            listBtn.style.color = 'var(--text-muted)';
            filterAndRenderNotes();
        });
        
        listBtn.addEventListener('click', () => {
            localStorage.setItem('noteView', 'list');
            listBtn.style.background = 'linear-gradient(135deg, var(--deep-blue), var(--emerald))';
            listBtn.style.color = 'white';
            gridBtn.style.background = 'var(--bg-secondary)';
            gridBtn.style.color = 'var(--text-muted)';
            filterAndRenderNotes();
        });
        
        const savedView = localStorage.getItem('noteView');
        if (savedView === 'list') {
            listBtn.click();
        }
    }
}

// Rich Text Editor Functions
function applyFormatting(command, value = null) {
    if (isFormattingActive) return;
    isFormattingActive = true;
    
    try {
        // For color formatting, we need to handle it differently
        if (command === 'foreColor' || command === 'hiliteColor') {
            document.execCommand(command, false, value);
        } else {
            document.execCommand(command, false, value);
        }
    } catch (e) {
        console.log('Formatting error:', e);
    }
    
    setTimeout(() => {
        isFormattingActive = false;
    }, 100);
    
    // Focus back on the editor
    const editor = document.getElementById('note-content-editor');
    if (editor) editor.focus();
}

function getSelectedText() {
    const selection = window.getSelection();
    return selection.toString();
}

function insertLink() {
    const url = prompt('Enter URL:', 'https://');
    if (url) {
        applyFormatting('createLink', url);
    }
}

function insertImage() {
    const url = prompt('Enter image URL:', 'https://');
    if (url) {
        applyFormatting('insertImage', url);
    }
}

function insertList(type) {
    applyFormatting(type);
}

function formatBlock(blockType) {
    applyFormatting('formatBlock', `<${blockType}>`);
}

function insertHorizontalRule() {
    applyFormatting('insertHorizontalRule');
}

function removeFormatting() {
    applyFormatting('removeFormat');
}

function getTextColor() {
    const color = document.getElementById('text-color-picker')?.value || '#000000';
    applyFormatting('foreColor', color);
    // Focus back on the editor
    const editor = document.getElementById('note-content-editor');
    if (editor) editor.focus();
}

function getHighlightColor() {
    const color = document.getElementById('highlight-color-picker')?.value || '#ffff00';
    applyFormatting('hiliteColor', color);
    // Focus back on the editor
    const editor = document.getElementById('note-content-editor');
    if (editor) editor.focus();
}

// Auto-save function
function startAutoSave(noteId, formData, isEdit = false) {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    
    autoSaveTimer = setTimeout(async () => {
        if (!noteId || !formData) return;
        
        try {
            const content = document.getElementById('note-content-editor')?.innerHTML || formData.get('content') || '';
            const title = formData.get('title');
            
            if (!title && !content) return;
            
            if (isEdit) {
                await updateDoc(doc(db, 'notes', noteId), {
                    title: title || 'Untitled',
                    content: content || '',
                    updatedAt: serverTimestamp()
                });
            } else if (currentEditingNote) {
                await updateDoc(doc(db, 'notes', currentEditingNote), {
                    title: title || 'Untitled',
                    content: content || '',
                    updatedAt: serverTimestamp()
                });
            }
            // Don't show toast for auto-save to avoid spam
            await loadNotes();
        } catch (error) {
            console.error('Auto-save failed:', error);
        }
    }, 5000);
}

// NotesApp Global Object
window.NotesApp = {
    showAddModal: () => {
        currentEditingNote = null;
        
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.NotesApp.closeModal()">
                <div class="rounded-2xl w-full max-w-3xl mx-auto max-h-[90vh] overflow-y-auto transform transition-all" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-4 md:p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-lg md:text-2xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-pen-fancy mr-2" style="color: var(--deep-blue);"></i>Create New Note
                            </h2>
                            <p class="text-xs md:text-sm text-muted mt-1">Capture your thoughts with rich formatting</p>
                        </div>
                        <button onclick="window.NotesApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    
                    <form id="add-note-form" class="p-4 md:p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Title</label>
                            <input type="text" name="title" id="note-title" required placeholder="Note title..." 
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all text-sm"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Category</label>
                                <select name="category" id="note-category" class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue text-sm"
                                        style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    <option value="personal"><i class="fas fa-user"></i> Personal</option>
                                    <option value="work"><i class="fas fa-briefcase"></i> Work</option>
                                    <option value="ideas"><i class="fas fa-lightbulb"></i> Ideas</option>
                                    <option value="important"><i class="fas fa-star"></i> Important</option>
                                    <option value="research"><i class="fas fa-flask"></i> Research</option>
                                    <option value="tutorial"><i class="fas fa-graduation-cap"></i> Tutorial</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Tags (comma separated)</label>
                                <input type="text" name="tags" id="note-tags" placeholder="e.g., javascript, project, idea" 
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue text-sm"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                        </div>
                        
                        <!-- Rich Text Editor Toolbar -->
                        <div class="border rounded-lg overflow-hidden" style="border-color: var(--border-color);">
                            <div class="flex flex-wrap gap-1 p-2" style="background: var(--bg-secondary); border-bottom: 1px solid var(--border-color);">
                                <button type="button" onclick="applyFormatting('bold')" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition" title="Bold" style="color: var(--text-primary);"><b>B</b></button>
                                <button type="button" onclick="applyFormatting('italic')" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition" title="Italic" style="color: var(--text-primary);"><i>I</i></button>
                                <button type="button" onclick="applyFormatting('underline')" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition" title="Underline" style="color: var(--text-primary);"><u>U</u></button>
                                <button type="button" onclick="applyFormatting('strikeThrough')" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition" title="Strikethrough" style="color: var(--text-primary);"><s>S</s></button>
                                <span class="w-px" style="background: var(--border-color);"></span>
                                <button type="button" onclick="applyFormatting('insertUnorderedList')" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition" title="Bullet List" style="color: var(--text-primary);"><i class="fas fa-list-ul"></i></button>
                                <button type="button" onclick="applyFormatting('insertOrderedList')" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition" title="Numbered List" style="color: var(--text-primary);"><i class="fas fa-list-ol"></i></button>
                                <span class="w-px" style="background: var(--border-color);"></span>
                                <button type="button" onclick="formatBlock('h2')" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition" title="Heading" style="color: var(--text-primary);">H</button>
                                <button type="button" onclick="formatBlock('h3')" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition" title="Subheading" style="color: var(--text-primary);">H<sub>2</sub></button>
                                <span class="w-px" style="background: var(--border-color);"></span>
                                <button type="button" onclick="applyFormatting('justifyLeft')" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition" title="Align Left" style="color: var(--text-primary);"><i class="fas fa-align-left"></i></button>
                                <button type="button" onclick="applyFormatting('justifyCenter')" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition" title="Center" style="color: var(--text-primary);"><i class="fas fa-align-center"></i></button>
                                <button type="button" onclick="applyFormatting('justifyRight')" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition" title="Align Right" style="color: var(--text-primary);"><i class="fas fa-align-right"></i></button>
                                <span class="w-px" style="background: var(--border-color);"></span>
                                <button type="button" onclick="insertLink()" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition" title="Insert Link" style="color: var(--text-primary);"><i class="fas fa-link"></i></button>
                                <button type="button" onclick="insertImage()" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition" title="Insert Image" style="color: var(--text-primary);"><i class="fas fa-image"></i></button>
                                <span class="w-px" style="background: var(--border-color);"></span>
                                <div class="flex items-center gap-1">
                                    <label class="text-xs" style="color: var(--text-primary);">Text</label>
                                    <input type="color" id="text-color-picker" onchange="getTextColor()" value="#000000" class="w-6 h-6 p-0 border rounded cursor-pointer" style="background: transparent; border-color: var(--border-color);">
                                </div>
                                <div class="flex items-center gap-1">
                                    <label class="text-xs" style="color: var(--text-primary);">Highlight</label>
                                    <input type="color" id="highlight-color-picker" onchange="getHighlightColor()" value="#ffff00" class="w-6 h-6 p-0 border rounded cursor-pointer" style="background: transparent; border-color: var(--border-color);">
                                </div>
                                <span class="w-px" style="background: var(--border-color);"></span>
                                <button type="button" onclick="insertHorizontalRule()" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition" title="Horizontal Rule" style="color: var(--text-primary);"><i class="fas fa-minus"></i></button>
                                <button type="button" onclick="removeFormatting()" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition" title="Remove Formatting" style="color: var(--text-primary);"><i class="fas fa-eraser"></i></button>
                            </div>
                            <div id="note-content-editor" contenteditable="true" class="p-4 min-h-[200px] text-sm focus:outline-none" style="background: var(--bg-primary); color: var(--text-primary);"
                                 placeholder="Write your note here..."></div>
                        </div>
                        <input type="hidden" name="content" id="note-content">
                        
                        <p class="text-xs" style="color: var(--text-muted);"><i class="fas fa-save"></i> Auto-saves every 5 seconds • <i class="fas fa-undo"></i> Ctrl+Z to undo</p>
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button type="submit" id="save-note-btn" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02] text-sm" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-1"></i> Save Note
                            </button>
                            <button type="button" onclick="window.NotesApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700 text-sm" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
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
            
            const titleInput = document.getElementById('note-title');
            const contentEditor = document.getElementById('note-content-editor');
            const contentInput = document.getElementById('note-content');
            
            // Update hidden input on content change
            const updateContent = () => {
                contentInput.value = contentEditor.innerHTML;
            };
            
            contentEditor.addEventListener('input', updateContent);
            
            // Handle enter key in editor - allow Shift+Enter for line breaks
            contentEditor.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    document.execCommand('insertLineBreak');
                }
            });
            
            // Focus the title input
            if (titleInput) titleInput.focus();
            
            document.getElementById('add-note-form').onsubmit = async (e) => {
                e.preventDefault();
                const submitBtn = document.getElementById('save-note-btn');
                const originalText = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Saving...';
                submitBtn.disabled = true;
                
                try {
                    const data = new FormData(e.target);
                    const tagsValue = data.get('tags');
                    const content = document.getElementById('note-content-editor').innerHTML;
                    
                    await addDoc(collection(db, 'notes'), {
                        title: data.get('title'),
                        content: content || '',
                        category: data.get('category'),
                        tags: tagsValue ? tagsValue.split(',').map(t => t.trim()).filter(t => t) : [],
                        pinned: false,
                        important: false,
                        userId: currentUser.uid,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    });
                    showToast('Note created successfully!', 'success');
                    window.NotesApp.closeModal();
                    await loadNotes();
                } catch (error) {
                    console.error('Error creating note:', error);
                    showToast('Failed to create note', 'error');
                } finally {
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                }
            };
        }
    },
    
    showMeetingNotesModal: () => {
        currentEditingNote = null;
        
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.NotesApp.closeModal()">
                <div class="rounded-2xl w-full max-w-2xl mx-auto max-h-[90vh] overflow-y-auto transform transition-all" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-4 md:p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-lg md:text-2xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-users mr-2" style="color: var(--deep-blue);"></i>Meeting Notes
                            </h2>
                            <p class="text-xs md:text-sm text-muted mt-1">Document your meetings and action items</p>
                        </div>
                        <button onclick="window.NotesApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="add-meeting-form" class="p-4 md:p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Meeting Title</label>
                            <input type="text" name="title" required placeholder="e.g., Weekly Team Sync" 
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue text-sm"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Date</label>
                                <input type="date" name="date" required value="${new Date().toISOString().split('T')[0]}" 
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue text-sm"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Time</label>
                                <input type="time" name="time" value="${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}" 
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue text-sm"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Attendees (comma separated)</label>
                            <input type="text" name="attendees" placeholder="e.g., John Doe, Jane Smith, Team" 
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue text-sm"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Agenda / Discussion Points</label>
                            <textarea name="agenda" rows="4" placeholder="- Project update&#10;- Budget review&#10;- Next steps" 
                                      class="w-full px-3 md:px-4 py-2 rounded-lg border font-mono focus:ring-2 focus:ring-deep-blue text-sm"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></textarea>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Action Items (one per line)</label>
                            <textarea name="actionItems" rows="4" placeholder="- Complete task by Friday&#10;- Schedule follow-up&#10;- Send meeting notes" 
                                      class="w-full px-3 md:px-4 py-2 rounded-lg border font-mono focus:ring-2 focus:ring-deep-blue text-sm"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></textarea>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Additional Notes</label>
                            <textarea name="notes" rows="3" placeholder="Any other important points..." 
                                      class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue text-sm"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></textarea>
                        </div>
                        
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Tags</label>
                                <input type="text" name="tags" placeholder="meeting, client, project" 
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue text-sm"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div class="flex items-end">
                                <label class="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" name="important" class="w-4 h-4 rounded">
                                    <span class="text-sm" style="color: var(--text-primary);"><i class="fas fa-star"></i> Mark as Important</span>
                                </label>
                            </div>
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button type="submit" id="save-meeting-btn" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02] text-sm" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-1"></i> Save Meeting Notes
                            </button>
                            <button type="button" onclick="window.NotesApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700 text-sm" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
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
            
            document.getElementById('add-meeting-form').onsubmit = async (e) => {
                e.preventDefault();
                const submitBtn = document.getElementById('save-meeting-btn');
                const originalText = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Saving...';
                submitBtn.disabled = true;
                
                try {
                    const data = new FormData(e.target);
                    const tagsValue = data.get('tags');
                    const attendeesValue = data.get('attendees');
                    const actionItemsValue = data.get('actionItems');
                    
                    const meetingDateTime = new Date(`${data.get('date')}T${data.get('time') || '12:00'}`);
                    
                    await addDoc(collection(db, 'notes'), {
                        title: data.get('title'),
                        category: 'meeting',
                        tags: tagsValue ? tagsValue.split(',').map(t => t.trim()).filter(t => t) : [],
                        important: data.get('important') === 'on',
                        pinned: false,
                        meetingData: {
                            date: meetingDateTime,
                            attendees: attendeesValue ? attendeesValue.split(',').map(a => a.trim()).filter(a => a) : [],
                            agenda: data.get('agenda') || '',
                            actionItems: actionItemsValue ? actionItemsValue.split('\n').filter(item => item.trim()) : [],
                            notes: data.get('notes') || ''
                        },
                        userId: currentUser.uid,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    });
                    showToast('Meeting notes saved!', 'success');
                    window.NotesApp.closeModal();
                    await loadNotes();
                } catch (error) {
                    console.error('Error saving meeting notes:', error);
                    showToast('Failed to save meeting notes', 'error');
                } finally {
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                }
            };
        }
    },
    
    edit: async (noteId) => {
        const note = notesCache.find(n => n.id === noteId);
        if (!note) return;
        
        currentEditingNote = noteId;
        const tagsValue = note.tags?.join(', ') || '';
        const isMeeting = note.category === 'meeting' && note.meetingData;
        
        if (isMeeting) {
            const meetingDate = note.meetingData.date ? new Date(note.meetingData.date).toISOString().split('T')[0] : '';
            const meetingTime = note.meetingData.date ? new Date(note.meetingData.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
            
            const html = `
                <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.NotesApp.closeModal()">
                    <div class="rounded-2xl w-full max-w-2xl mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                        <div class="sticky top-0 flex justify-between items-center p-4 md:p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                            <div>
                                <h2 class="text-lg md:text-2xl font-bold" style="color: var(--text-primary);">
                                    <i class="fas fa-edit mr-2"></i>Edit Meeting Notes
                                </h2>
                                <p class="text-xs md:text-sm text-muted mt-1">Update meeting details</p>
                            </div>
                            <button onclick="window.NotesApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                                <i class="fas fa-times text-muted"></i>
                            </button>
                        </div>
                        <form id="edit-meeting-form" class="p-4 md:p-5 space-y-4">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Meeting Title</label>
                                <input type="text" name="title" required value="${escapeHtml(note.title)}" 
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue text-sm"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Date</label>
                                    <input type="date" name="date" required value="${meetingDate}" 
                                           class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue text-sm"
                                           style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                </div>
                                <div>
                                    <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Time</label>
                                    <input type="time" name="time" value="${meetingTime}" 
                                           class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue text-sm"
                                           style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                </div>
                            </div>
                            
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Attendees</label>
                                <input type="text" name="attendees" value="${escapeHtml(note.meetingData?.attendees?.join(', ') || '')}" 
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue text-sm"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Agenda</label>
                                <textarea name="agenda" rows="4" 
                                          class="w-full px-3 md:px-4 py-2 rounded-lg border font-mono focus:ring-2 focus:ring-deep-blue text-sm"
                                          style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">${escapeHtml(note.meetingData?.agenda || '')}</textarea>
                            </div>
                            
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Action Items</label>
                                <textarea name="actionItems" rows="4" 
                                          class="w-full px-3 md:px-4 py-2 rounded-lg border font-mono focus:ring-2 focus:ring-deep-blue text-sm"
                                          style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">${escapeHtml(note.meetingData?.actionItems?.join('\n') || '')}</textarea>
                            </div>
                            
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Additional Notes</label>
                                <textarea name="notes" rows="3" 
                                          class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue text-sm"
                                          style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">${escapeHtml(note.meetingData?.notes || '')}</textarea>
                            </div>
                            
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Tags</label>
                                <input type="text" name="tags" value="${escapeHtml(tagsValue)}" 
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue text-sm"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            
                            <div class="flex flex-col sm:flex-row gap-3 pt-2">
                                <button type="submit" id="edit-meeting-btn" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02] text-sm" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                    <i class="fas fa-save mr-1"></i> Save Changes
                                </button>
                                <button type="button" onclick="window.NotesApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700 text-sm" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
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
                
                document.getElementById('edit-meeting-form').onsubmit = async (e) => {
                    e.preventDefault();
                    const submitBtn = document.getElementById('edit-meeting-btn');
                    const originalText = submitBtn.innerHTML;
                    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Saving...';
                    submitBtn.disabled = true;
                    
                    try {
                        const data = new FormData(e.target);
                        const tagsValue = data.get('tags');
                        const attendeesValue = data.get('attendees');
                        const actionItemsValue = data.get('actionItems');
                        
                        const meetingDateTime = new Date(`${data.get('date')}T${data.get('time') || '12:00'}`);
                        
                        await updateDoc(doc(db, 'notes', noteId), {
                            title: data.get('title'),
                            tags: tagsValue ? tagsValue.split(',').map(t => t.trim()).filter(t => t) : [],
                            meetingData: {
                                date: meetingDateTime,
                                attendees: attendeesValue ? attendeesValue.split(',').map(a => a.trim()).filter(a => a) : [],
                                agenda: data.get('agenda') || '',
                                actionItems: actionItemsValue ? actionItemsValue.split('\n').filter(item => item.trim()) : [],
                                notes: data.get('notes') || ''
                            },
                            updatedAt: serverTimestamp()
                        });
                        showToast('Meeting notes updated!', 'success');
                        window.NotesApp.closeModal();
                        await loadNotes();
                    } catch (error) {
                        console.error('Error updating meeting notes:', error);
                        showToast('Failed to update meeting notes', 'error');
                    } finally {
                        submitBtn.innerHTML = originalText;
                        submitBtn.disabled = false;
                    }
                };
            }
        } else {
            const html = `
                <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.NotesApp.closeModal()">
                    <div class="rounded-2xl w-full max-w-3xl mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                        <div class="sticky top-0 flex justify-between items-center p-4 md:p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                            <div>
                                <h2 class="text-lg md:text-2xl font-bold" style="color: var(--text-primary);">
                                    <i class="fas fa-edit mr-2" style="color: var(--deep-blue);"></i>Edit Note
                                </h2>
                                <p class="text-xs md:text-sm text-muted mt-1">Update your note with rich formatting</p>
                            </div>
                            <button onclick="window.NotesApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                                <i class="fas fa-times text-muted"></i>
                            </button>
                        </div>
                        <form id="edit-note-form" class="p-4 md:p-5 space-y-4">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Title</label>
                                <input type="text" name="title" required value="${escapeHtml(note.title)}" 
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue text-sm"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Category</label>
                                    <select name="category" class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue text-sm"
                                            style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                        <option value="personal" ${note.category === 'personal' ? 'selected' : ''}>Personal</option>
                                        <option value="work" ${note.category === 'work' ? 'selected' : ''}>Work</option>
                                        <option value="ideas" ${note.category === 'ideas' ? 'selected' : ''}>Ideas</option>
                                        <option value="important" ${note.category === 'important' ? 'selected' : ''}>Important</option>
                                        <option value="research" ${note.category === 'research' ? 'selected' : ''}>Research</option>
                                        <option value="tutorial" ${note.category === 'tutorial' ? 'selected' : ''}>Tutorial</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Tags (comma separated)</label>
                                    <input type="text" name="tags" value="${escapeHtml(tagsValue)}" 
                                           class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue text-sm"
                                           style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                </div>
                            </div>
                            
                            <!-- Rich Text Editor Toolbar -->
                            <div class="border rounded-lg overflow-hidden" style="border-color: var(--border-color);">
                                <div class="flex flex-wrap gap-1 p-2" style="background: var(--bg-secondary); border-bottom: 1px solid var(--border-color);">
                                    <button type="button" onclick="applyFormatting('bold')" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition" title="Bold" style="color: var(--text-primary);"><b>B</b></button>
                                    <button type="button" onclick="applyFormatting('italic')" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition" title="Italic" style="color: var(--text-primary);"><i>I</i></button>
                                    <button type="button" onclick="applyFormatting('underline')" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition" title="Underline" style="color: var(--text-primary);"><u>U</u></button>
                                    <button type="button" onclick="applyFormatting('strikeThrough')" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition" title="Strikethrough" style="color: var(--text-primary);"><s>S</s></button>
                                    <span class="w-px" style="background: var(--border-color);"></span>
                                    <button type="button" onclick="applyFormatting('insertUnorderedList')" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition" title="Bullet List" style="color: var(--text-primary);"><i class="fas fa-list-ul"></i></button>
                                    <button type="button" onclick="applyFormatting('insertOrderedList')" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition" title="Numbered List" style="color: var(--text-primary);"><i class="fas fa-list-ol"></i></button>
                                    <span class="w-px" style="background: var(--border-color);"></span>
                                    <button type="button" onclick="formatBlock('h2')" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition" title="Heading" style="color: var(--text-primary);">H</button>
                                    <button type="button" onclick="formatBlock('h3')" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition" title="Subheading" style="color: var(--text-primary);">H<sub>2</sub></button>
                                    <span class="w-px" style="background: var(--border-color);"></span>
                                    <button type="button" onclick="applyFormatting('justifyLeft')" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition" title="Align Left" style="color: var(--text-primary);"><i class="fas fa-align-left"></i></button>
                                    <button type="button" onclick="applyFormatting('justifyCenter')" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition" title="Center" style="color: var(--text-primary);"><i class="fas fa-align-center"></i></button>
                                    <button type="button" onclick="applyFormatting('justifyRight')" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition" title="Align Right" style="color: var(--text-primary);"><i class="fas fa-align-right"></i></button>
                                    <span class="w-px" style="background: var(--border-color);"></span>
                                    <button type="button" onclick="insertLink()" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition" title="Insert Link" style="color: var(--text-primary);"><i class="fas fa-link"></i></button>
                                    <button type="button" onclick="insertImage()" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition" title="Insert Image" style="color: var(--text-primary);"><i class="fas fa-image"></i></button>
                                    <span class="w-px" style="background: var(--border-color);"></span>
                                    <div class="flex items-center gap-1">
                                        <label class="text-xs" style="color: var(--text-primary);">Text</label>
                                        <input type="color" id="text-color-picker-edit" onchange="getTextColor()" value="#000000" class="w-6 h-6 p-0 border rounded cursor-pointer" style="background: transparent; border-color: var(--border-color);">
                                    </div>
                                    <div class="flex items-center gap-1">
                                        <label class="text-xs" style="color: var(--text-primary);">Highlight</label>
                                        <input type="color" id="highlight-color-picker-edit" onchange="getHighlightColor()" value="#ffff00" class="w-6 h-6 p-0 border rounded cursor-pointer" style="background: transparent; border-color: var(--border-color);">
                                    </div>
                                    <span class="w-px" style="background: var(--border-color);"></span>
                                    <button type="button" onclick="insertHorizontalRule()" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition" title="Horizontal Rule" style="color: var(--text-primary);"><i class="fas fa-minus"></i></button>
                                    <button type="button" onclick="removeFormatting()" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition" title="Remove Formatting" style="color: var(--text-primary);"><i class="fas fa-eraser"></i></button>
                                </div>
                                <div id="note-content-editor" contenteditable="true" class="p-4 min-h-[200px] text-sm focus:outline-none" style="background: var(--bg-primary); color: var(--text-primary);">${note.content || ''}</div>
                            </div>
                            <input type="hidden" name="content" id="note-content" value="${escapeHtml(note.content || '')}">
                            
                            <p class="text-xs" style="color: var(--text-muted);"><i class="fas fa-save"></i> Auto-saves every 5 seconds • <i class="fas fa-undo"></i> Ctrl+Z to undo</p>
                            
                            <div class="flex flex-col sm:flex-row gap-3 pt-2">
                                <button type="submit" id="edit-note-btn" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02] text-sm" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                    <i class="fas fa-save mr-1"></i> Save Changes
                                </button>
                                <button type="button" onclick="window.NotesApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700 text-sm" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
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
                
                const titleInput = document.getElementById('edit-note-form').querySelector('input[name="title"]');
                const contentEditor = document.getElementById('note-content-editor');
                const contentInput = document.getElementById('note-content');
                
                const updateContent = () => {
                    contentInput.value = contentEditor.innerHTML;
                };
                
                contentEditor.addEventListener('input', updateContent);
                
                // Handle enter key in editor
                contentEditor.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        document.execCommand('insertLineBreak');
                    }
                });
                
                if (titleInput) titleInput.focus();
                
                document.getElementById('edit-note-form').onsubmit = async (e) => {
                    e.preventDefault();
                    const submitBtn = document.getElementById('edit-note-btn');
                    const originalText = submitBtn.innerHTML;
                    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Saving...';
                    submitBtn.disabled = true;
                    
                    try {
                        const data = new FormData(e.target);
                        const tagsValue = data.get('tags');
                        const content = document.getElementById('note-content-editor').innerHTML;
                        
                        await updateDoc(doc(db, 'notes', noteId), {
                            title: data.get('title'),
                            content: content || '',
                            category: data.get('category'),
                            tags: tagsValue ? tagsValue.split(',').map(t => t.trim()).filter(t => t) : [],
                            updatedAt: serverTimestamp()
                        });
                        showToast('Note updated!', 'success');
                        window.NotesApp.closeModal();
                        await loadNotes();
                    } catch (error) {
                        console.error('Error updating note:', error);
                        showToast('Failed to update note', 'error');
                    } finally {
                        submitBtn.innerHTML = originalText;
                        submitBtn.disabled = false;
                    }
                };
            }
        }
    },
    
    viewNote: async (noteId) => {
        const note = notesCache.find(n => n.id === noteId);
        if (!note) return;
        
        const categoryConfig = {
            personal: { icon: 'fa-user', color: '#10b981', label: 'Personal' },
            work: { icon: 'fa-briefcase', color: '#f59e0b', label: 'Work' },
            meeting: { icon: 'fa-users', color: '#8b5cf6', label: 'Meeting' },
            ideas: { icon: 'fa-lightbulb', color: '#06b6d4', label: 'Ideas' },
            important: { icon: 'fa-star', color: '#ef4444', label: 'Important' },
            research: { icon: 'fa-flask', color: '#ec4899', label: 'Research' },
            tutorial: { icon: 'fa-graduation-cap', color: '#f59e0b', label: 'Tutorial' }
        };
        
        const config = categoryConfig[note.category] || categoryConfig.personal;
        const wordCount = note.content?.split(/\s+/).filter(w => w.length > 0).length || 0;
        const charCount = note.content?.length || 0;
        const isMeeting = note.category === 'meeting' && note.meetingData;
        
        let formattedContent = '';
        
        if (isMeeting) {
            formattedContent = `
                <div class="space-y-4">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 rounded-lg" style="background: ${config.color}10;">
                        <div><i class="fas fa-calendar"></i> <strong>Date:</strong> ${formatDate(note.meetingData.date)}</div>
                        <div><i class="fas fa-clock"></i> <strong>Time:</strong> ${new Date(note.meetingData.date).toLocaleTimeString()}</div>
                        <div class="sm:col-span-2"><i class="fas fa-users"></i> <strong>Attendees:</strong> ${note.meetingData.attendees?.join(', ') || 'None'}</div>
                    </div>
                    
                    ${note.meetingData.agenda ? `
                        <div>
                            <h4 class="font-semibold mb-2"><i class="fas fa-list"></i> Agenda / Discussion</h4>
                            <div class="p-3 rounded-lg" style="background: var(--bg-primary);">${escapeHtml(note.meetingData.agenda).replace(/\n/g, '<br>')}</div>
                        </div>
                    ` : ''}
                    
                    ${note.meetingData.actionItems?.length > 0 ? `
                        <div>
                            <h4 class="font-semibold mb-2"><i class="fas fa-check-circle"></i> Action Items</h4>
                            <div class="space-y-1">
                                ${note.meetingData.actionItems.map(item => `
                                    <div class="p-2 rounded-lg" style="background: var(--bg-primary);">
                                        <input type="checkbox" class="mr-2"> ${escapeHtml(item)}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    
                    ${note.meetingData.notes ? `
                        <div>
                            <h4 class="font-semibold mb-2"><i class="fas fa-sticky-note"></i> Additional Notes</h4>
                            <div class="p-3 rounded-lg" style="background: var(--bg-primary);">${escapeHtml(note.meetingData.notes).replace(/\n/g, '<br>')}</div>
                        </div>
                    ` : ''}
                </div>
            `;
        } else {
            formattedContent = note.content || '';
        }
        
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.NotesApp.closeModal()">
                <div class="rounded-2xl w-full max-w-3xl mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-start p-4 md:p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div class="flex-1">
                            <div class="flex items-center gap-2 mb-2 flex-wrap">
                                ${note.pinned ? '<i class="fas fa-thumbtack" style="color: #f59e0b;"></i>' : ''}
                                <i class="fas ${config.icon}" style="color: ${config.color};"></i>
                                <span class="text-xs px-2 py-0.5 rounded-full" style="background: ${config.color}20; color: ${config.color};">${config.label}</span>
                                ${note.important ? '<i class="fas fa-star" style="color: #f59e0b;"></i>' : ''}
                            </div>
                            <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">${escapeHtml(note.title)}</h2>
                        </div>
                        <div class="flex gap-2 ml-4">
                            <button onclick="window.NotesApp.togglePin('${note.id}');" class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition" title="${note.pinned ? 'Unpin' : 'Pin'}">
                                <i class="fas fa-thumbtack" style="color: ${note.pinned ? '#f59e0b' : 'var(--text-muted)'};"></i>
                            </button>
                            <button onclick="window.NotesApp.toggleImportant('${note.id}');" class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                                <i class="fas ${note.important ? 'fa-star' : 'fa-star'}" style="color: ${note.important ? '#f59e0b' : 'var(--text-muted)'};"></i>
                            </button>
                            <button onclick="window.NotesApp.edit('${note.id}'); window.NotesApp.closeModal()" class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                                <i class="fas fa-edit" style="color: var(--text-muted);"></i>
                            </button>
                            <button onclick="window.NotesApp.closeModal()" class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                                <i class="fas fa-times text-xl" style="color: var(--text-muted);"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div class="p-4 md:p-5">
                        ${note.tags?.length > 0 ? `
                            <div class="flex flex-wrap gap-2 mb-4">
                                ${note.tags.map(tag => `<span class="text-xs px-3 py-1 rounded-full" style="background: var(--bg-primary); color: var(--text-muted);"><i class="fas fa-tag"></i> ${escapeHtml(tag)}</span>`).join('')}
                            </div>
                        ` : ''}
                        
                        <div class="prose max-w-none mb-4 p-4 rounded-lg" style="background: var(--bg-primary); min-height: 100px;">
                            ${formattedContent || '<p class="italic" style="color: var(--text-muted);">No content</p>'}
                        </div>
                        
                        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs pt-3 border-t" style="color: var(--text-muted); border-color: var(--border-color);">
                            <div class="flex flex-wrap gap-3">
                                <span><i class="fas fa-clock"></i> Created: ${formatDate(note.createdAt)}</span>
                                <span><i class="fas fa-edit"></i> Updated: ${timeAgo(note.updatedAt)}</span>
                            </div>
                            ${!isMeeting ? `
                                <div class="flex flex-wrap gap-3">
                                    <span><i class="fas fa-file-alt"></i> ${wordCount} words</span>
                                    <span><i class="fas fa-text-height"></i> ${charCount} characters</span>
                                </div>
                            ` : ''}
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
    
    delete: async (noteId) => {
        if (confirm('Delete this note permanently?')) {
            try {
                await deleteDoc(doc(db, 'notes', noteId));
                showToast('Note deleted', 'success');
                await loadNotes();
            } catch (error) {
                console.error('Error deleting note:', error);
                showToast('Failed to delete note', 'error');
            }
        }
    },
    
    togglePin: async (noteId) => {
        const note = notesCache.find(n => n.id === noteId);
        if (!note) return;
        
        try {
            await updateDoc(doc(db, 'notes', noteId), {
                pinned: !note.pinned,
                updatedAt: serverTimestamp()
            });
            
            showToast(note.pinned ? 'Unpinned' : 'Pinned to top', 'success');
            await loadNotes();
        } catch (error) {
            console.error('Error toggling pin:', error);
            showToast('Failed to update', 'error');
        }
    },
    
    toggleImportant: async (noteId) => {
        const note = notesCache.find(n => n.id === noteId);
        if (!note) return;
        
        try {
            await updateDoc(doc(db, 'notes', noteId), {
                important: !note.important,
                updatedAt: serverTimestamp()
            });
            
            showToast(note.important ? 'Removed from important' : 'Marked as important', 'success');
            await loadNotes();
        } catch (error) {
            console.error('Error toggling important:', error);
            showToast('Failed to update', 'error');
        }
    },
    
    showCategories: () => {
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.NotesApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto" style="background: var(--bg-secondary);">
                    <div class="flex justify-between items-center p-4 md:p-5 border-b" style="border-color: var(--border-color);">
                        <div>
                            <h2 class="text-lg md:text-2xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-tags mr-2"></i>Categories
                            </h2>
                            <p class="text-xs md:text-sm text-muted mt-1">Filter notes by category</p>
                        </div>
                        <button onclick="window.NotesApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <div class="p-4 md:p-5 space-y-2">
                        <div class="p-3 rounded-lg cursor-pointer transition-all hover:bg-gray-100 dark:hover:bg-gray-700" onclick="window.NotesApp.filterByCategory('all'); window.NotesApp.closeModal()">
                            <div class="flex items-center gap-3">
                                <i class="fas fa-folder-open text-blue-500 w-6"></i>
                                <span style="color: var(--text-primary);">All Notes</span>
                                <span class="text-xs ml-auto" style="color: var(--text-muted);">${notesCache.length} notes</span>
                            </div>
                        </div>
                        <div class="p-3 rounded-lg cursor-pointer transition-all hover:bg-gray-100 dark:hover:bg-gray-700" onclick="window.NotesApp.filterByCategory('pinned'); window.NotesApp.closeModal()">
                            <div class="flex items-center gap-3">
                                <i class="fas fa-thumbtack text-yellow-500 w-6"></i>
                                <span style="color: var(--text-primary);">Pinned</span>
                                <span class="text-xs ml-auto" style="color: var(--text-muted);">${notesCache.filter(n => n.pinned).length} notes</span>
                            </div>
                        </div>
                        <div class="p-3 rounded-lg cursor-pointer transition-all hover:bg-gray-100 dark:hover:bg-gray-700" onclick="window.NotesApp.filterByCategory('personal'); window.NotesApp.closeModal()">
                            <div class="flex items-center gap-3">
                                <i class="fas fa-user text-emerald-500 w-6"></i>
                                <span style="color: var(--text-primary);">Personal</span>
                                <span class="text-xs ml-auto" style="color: var(--text-muted);">${notesCache.filter(n => n.category === 'personal').length} notes</span>
                            </div>
                        </div>
                        <div class="p-3 rounded-lg cursor-pointer transition-all hover:bg-gray-100 dark:hover:bg-gray-700" onclick="window.NotesApp.filterByCategory('work'); window.NotesApp.closeModal()">
                            <div class="flex items-center gap-3">
                                <i class="fas fa-briefcase text-yellow-500 w-6"></i>
                                <span style="color: var(--text-primary);">Work</span>
                                <span class="text-xs ml-auto" style="color: var(--text-muted);">${notesCache.filter(n => n.category === 'work').length} notes</span>
                            </div>
                        </div>
                        <div class="p-3 rounded-lg cursor-pointer transition-all hover:bg-gray-100 dark:hover:bg-gray-700" onclick="window.NotesApp.filterByCategory('meeting'); window.NotesApp.closeModal()">
                            <div class="flex items-center gap-3">
                                <i class="fas fa-users text-purple-500 w-6"></i>
                                <span style="color: var(--text-primary);">Meetings</span>
                                <span class="text-xs ml-auto" style="color: var(--text-muted);">${notesCache.filter(n => n.category === 'meeting').length} notes</span>
                            </div>
                        </div>
                        <div class="p-3 rounded-lg cursor-pointer transition-all hover:bg-gray-100 dark:hover:bg-gray-700" onclick="window.NotesApp.filterByCategory('important'); window.NotesApp.closeModal()">
                            <div class="flex items-center gap-3">
                                <i class="fas fa-star text-red-500 w-6"></i>
                                <span style="color: var(--text-primary);">Important</span>
                                <span class="text-xs ml-auto" style="color: var(--text-muted);">${notesCache.filter(n => n.important).length} notes</span>
                            </div>
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
    
    filterByCategory: (category) => {
        const filterSelect = document.getElementById('note-category-filter');
        if (filterSelect) {
            filterSelect.value = category;
            filterAndRenderNotes();
        }
    },
    
    closeModal: () => {
        if (autoSaveTimer) clearTimeout(autoSaveTimer);
        const modalContainer = document.getElementById('modal-container');
        if (modalContainer) {
            modalContainer.innerHTML = '';
            modalContainer.style.pointerEvents = 'none';
        }
        currentEditingNote = null;
    }
};

// Make formatting functions globally available for the toolbar
window.applyFormatting = applyFormatting;
window.getTextColor = getTextColor;
window.getHighlightColor = getHighlightColor;
window.insertLink = insertLink;
window.insertImage = insertImage;
window.insertHorizontalRule = insertHorizontalRule;
window.removeFormatting = removeFormatting;
window.formatBlock = formatBlock;