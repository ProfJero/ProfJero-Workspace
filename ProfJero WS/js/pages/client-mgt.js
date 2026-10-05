// js/pages/client-mgt.js
import { db, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, serverTimestamp } from '../firebase-config.js';
import { showToast, escapeHtml, formatDate, timeAgo, formatCurrency } from '../utils/helpers.js';

let currentUser = null;
let clientsCache = [];
let clientProjectsCache = [];
let clientInvoicesCache = [];
let clientCommunicationsCache = [];
let currentView = 'list';
let currentFilter = 'all';

// Client Statuses
const clientStatuses = {
    active: { color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', label: 'Active', icon: 'fa-check-circle' },
    inactive: { color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)', label: 'Inactive', icon: 'fa-pause-circle' },
    lead: { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', label: 'Lead', icon: 'fa-user-plus' },
    prospect: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', label: 'Prospect', icon: 'fa-eye' },
    vip: { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', label: 'VIP', icon: 'fa-crown' },
    former: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', label: 'Former Client', icon: 'fa-user-times' }
};

// Industries
const industries = [
    'Technology', 'Healthcare', 'Finance', 'Education', 'Retail',
    'Manufacturing', 'Real Estate', 'Hospitality', 'Media', 'Non-Profit',
    'Government', 'Legal', 'Construction', 'Energy', 'Transportation'
];

// Communication Types
const communicationTypes = {
    email: { icon: 'fa-envelope', color: '#3b82f6', label: 'Email' },
    call: { icon: 'fa-phone', color: '#10b981', label: 'Phone Call' },
    meeting: { icon: 'fa-users', color: '#8b5cf6', label: 'Meeting' },
    message: { icon: 'fa-comment', color: '#f59e0b', label: 'Message' },
    video: { icon: 'fa-video', color: '#ec4899', label: 'Video Call' },
    note: { icon: 'fa-sticky-note', color: '#6b7280', label: 'Note' }
};

export async function renderClientPage(user) {
    currentUser = user;
    
    return `
        <div class="space-y-6 animate-fade-in-up">
            <!-- Header -->
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 class="text-3xl font-bold" style="color: var(--text-primary);">👥 Client Management</h1>
                    <p class="text-muted mt-1">Manage your clients, projects, invoices, and communications</p>
                </div>
                <div class="flex gap-3 flex-wrap">
                    <button id="add-client-btn" class="px-5 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                        <i class="fas fa-plus"></i>
                        <span>New Client</span>
                    </button>
                    <button id="add-communication-btn" class="px-5 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all hover:shadow-md" style="background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary);">
                        <i class="fas fa-comment"></i>
                        <span>Log Communication</span>
                    </button>
                </div>
            </div>
            
            <!-- Stats Dashboard -->
            <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div class="glass-card p-3 rounded-xl text-center">
                    <div class="text-xl font-bold" id="stat-total" style="color: var(--deep-blue);">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-users"></i> Total Clients</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center">
                    <div class="text-xl font-bold" id="stat-active" style="color: var(--emerald);">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-check-circle"></i> Active</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center">
                    <div class="text-xl font-bold" id="stat-leads" style="color: #3b82f6;">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-user-plus"></i> Leads</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center">
                    <div class="text-xl font-bold" id="stat-projects" style="color: var(--gold);">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-project-diagram"></i> Projects</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center">
                    <div class="text-xl font-bold" id="stat-revenue" style="color: #8b5cf6;">₵0</div>
                    <div class="text-xs text-muted"><i class="fas fa-money-bill-wave"></i> Total Revenue</div>
                </div>
            </div>
            
            <!-- View Tabs -->
            <div class="flex flex-wrap gap-2 border-b border-custom pb-2">
                <button class="view-tab px-4 py-2 rounded-lg transition-all active" data-view="list" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                    <i class="fas fa-list mr-1"></i> List View
                </button>
                <button class="view-tab px-4 py-2 rounded-lg transition-all" data-view="grid" style="background: var(--bg-secondary); color: var(--text-muted);">
                    <i class="fas fa-th-large mr-1"></i> Grid View
                </button>
                <button class="view-tab px-4 py-2 rounded-lg transition-all" data-view="communications" style="background: var(--bg-secondary); color: var(--text-muted);">
                    <i class="fas fa-comments mr-1"></i> Communications
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
                        <input type="text" id="client-search" placeholder="Search clients by name, company, email..." 
                               class="w-full pl-10 pr-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all" 
                               style="background: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);">
                    </div>
                    
                    <select id="client-status-filter" class="px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all" style="background: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);">
                        <option value="all">All Status</option>
                        ${Object.entries(clientStatuses).map(([key, status]) => 
                            `<option value="${key}"><i class="fas ${status.icon}"></i> ${status.label}</option>`
                        ).join('')}
                    </select>
                    
                    <select id="client-industry-filter" class="px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all" style="background: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);">
                        <option value="all">All Industries</option>
                        ${industries.map(industry => 
                            `<option value="${industry}">${industry}</option>`
                        ).join('')}
                    </select>
                    
                    <button id="clear-filters" class="px-4 py-2 rounded-lg transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="color: var(--text-muted);">
                        <i class="fas fa-times"></i> Clear
                    </button>
                </div>
            </div>
            
            <!-- Client Container -->
            <div id="client-container" class="space-y-4">
                <div class="text-center py-12">
                    <div class="animate-pulse"><i class="fas fa-spinner fa-spin mr-2 text-muted"></i> Loading clients...</div>
                </div>
            </div>
        </div>
    `;
}

export async function loadClientData() {
    if (!currentUser) return;
    await Promise.all([
        loadClients(),
        loadClientProjects(),
        loadClientInvoices(),
        loadClientCommunications()
    ]);
    setupEventListeners();
    filterAndRenderClients();
    updateStats();
}

async function loadClients() {
    try {
        const q = query(
            collection(db, 'clients'),
            where('userId', '==', currentUser.uid),
            orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        clientsCache = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate?.() || new Date(),
                updatedAt: data.updatedAt?.toDate?.() || new Date(),
                lastContact: data.lastContact?.toDate?.() || null
            };
        });
    } catch (error) {
        console.error('Error loading clients:', error);
        if (error.code === 'permission-denied') {
            showToast('Please set up clients collection in Firebase', 'info');
        }
    }
}

async function loadClientProjects() {
    try {
        // Get projects that have a client field
        const q = query(
            collection(db, 'projects'),
            where('userId', '==', currentUser.uid)
        );
        const querySnapshot = await getDocs(q);
        clientProjectsCache = querySnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(p => p.client);
    } catch (error) {
        console.error('Error loading client projects:', error);
    }
}

async function loadClientInvoices() {
    try {
        const q = query(
            collection(db, 'invoices'),
            where('userId', '==', currentUser.uid)
        );
        const querySnapshot = await getDocs(q);
        clientInvoicesCache = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                date: data.date?.toDate?.() || new Date(data.date),
                dueDate: data.dueDate?.toDate?.() || new Date(data.dueDate),
                createdAt: data.createdAt?.toDate?.() || new Date()
            };
        });
    } catch (error) {
        console.error('Error loading client invoices:', error);
    }
}

async function loadClientCommunications() {
    try {
        const q = query(
            collection(db, 'clientCommunications'),
            where('userId', '==', currentUser.uid),
            orderBy('date', 'desc')
        );
        const querySnapshot = await getDocs(q);
        clientCommunicationsCache = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                date: data.date?.toDate?.() || new Date(data.date),
                createdAt: data.createdAt?.toDate?.() || new Date()
            };
        });
    } catch (error) {
        console.error('Error loading client communications:', error);
    }
}

function updateStats() {
    const total = clientsCache.length;
    const active = clientsCache.filter(c => c.status === 'active').length;
    const leads = clientsCache.filter(c => c.status === 'lead' || c.status === 'prospect').length;
    
    // Count projects linked to clients
    const clientNames = clientsCache.map(c => c.name);
    const projects = clientProjectsCache.filter(p => clientNames.includes(p.client));
    
    // Calculate total revenue from invoices
    const totalRevenue = clientInvoicesCache
        .filter(inv => inv.status === 'paid')
        .reduce((sum, inv) => sum + inv.total, 0);
    
    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-active').textContent = active;
    document.getElementById('stat-leads').textContent = leads;
    document.getElementById('stat-projects').textContent = projects.length;
    document.getElementById('stat-revenue').textContent = formatCurrency(totalRevenue, 'GHS');
}

function filterAndRenderClients() {
    let filtered = [...clientsCache];
    
    const searchInput = document.getElementById('client-search');
    if (searchInput?.value) {
        const query = searchInput.value.toLowerCase();
        filtered = filtered.filter(c => 
            c.name?.toLowerCase().includes(query) || 
            c.company?.toLowerCase().includes(query) ||
            c.email?.toLowerCase().includes(query) ||
            c.phone?.toLowerCase().includes(query)
        );
    }
    
    const statusFilter = document.getElementById('client-status-filter');
    if (statusFilter?.value !== 'all') {
        filtered = filtered.filter(c => c.status === statusFilter.value);
    }
    
    const industryFilter = document.getElementById('client-industry-filter');
    if (industryFilter?.value !== 'all') {
        filtered = filtered.filter(c => c.industry === industryFilter.value);
    }
    
    renderClients(filtered);
}

function renderClients(clients) {
    const container = document.getElementById('client-container');
    if (!container) return;
    
    const view = document.querySelector('.view-tab.active')?.dataset.view || 'list';
    
    if (view === 'communications') {
        renderCommunications();
        return;
    }
    
    if (view === 'analytics') {
        renderClientAnalytics();
        return;
    }
    
    if (clients.length === 0) {
        container.innerHTML = `
            <div class="glass-card rounded-xl p-12 text-center">
                <i class="fas fa-users text-6xl mb-4 text-muted"></i>
                <h3 class="text-xl font-semibold mb-2" style="color: var(--text-primary);">No clients yet</h3>
                <p class="text-muted">Start building your client relationships today!</p>
                <button id="empty-add-btn" class="mt-4 px-5 py-2 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                    <i class="fas fa-plus mr-1"></i> Add Client
                </button>
            </div>
        `;
        document.getElementById('empty-add-btn')?.addEventListener('click', () => window.ClientsApp.showAddClientModal());
        return;
    }
    
    if (view === 'grid') {
        container.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';
        container.innerHTML = clients.map(client => createClientCard(client)).join('');
    } else {
        container.className = 'space-y-4';
        container.innerHTML = clients.map(client => createClientListItem(client)).join('');
    }
}

function createClientCard(client) {
    const status = clientStatuses[client.status] || clientStatuses.inactive;
    const projects = clientProjectsCache.filter(p => p.client === client.name || p.client === client.company);
    const invoices = clientInvoicesCache.filter(inv => inv.clientName === client.name || inv.clientName === client.company);
    const paidInvoices = invoices.filter(inv => inv.status === 'paid');
    const totalPaid = paidInvoices.reduce((sum, inv) => sum + inv.total, 0);
    const communications = clientCommunicationsCache.filter(c => c.clientId === client.id);
    const lastComm = communications.length > 0 ? communications[0] : null;
    
    return `
        <div class="glass-card rounded-xl p-4 transition-all hover:shadow-lg cursor-pointer" onclick="window.ClientsApp.viewClient('${client.id}')">
            <div class="flex justify-between items-start mb-2">
                <div class="flex items-center gap-2">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center" style="background: ${status.color}20;">
                        <i class="fas fa-user" style="color: ${status.color};"></i>
                    </div>
                    <div>
                        <h3 class="font-semibold" style="color: var(--text-primary);">${escapeHtml(client.name)}</h3>
                        ${client.company ? `<p class="text-xs text-muted">${escapeHtml(client.company)}</p>` : ''}
                    </div>
                </div>
                <span class="text-xs px-2 py-0.5 rounded-full" style="background: ${status.bg}; color: ${status.color};">
                    <i class="fas ${status.icon} text-xs mr-1"></i>${status.label}
                </span>
            </div>
            
            <div class="flex flex-wrap gap-2 mb-2">
                ${client.email ? `<span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6;"><i class="fas fa-envelope"></i> ${escapeHtml(client.email)}</span>` : ''}
                ${client.phone ? `<span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(16, 185, 129, 0.15); color: #10b981;"><i class="fas fa-phone"></i> ${escapeHtml(client.phone)}</span>` : ''}
                ${client.industry ? `<span class="text-xs px-2 py-0.5 rounded-full" style="background: rgba(139, 92, 246, 0.15); color: #8b5cf6;">${escapeHtml(client.industry)}</span>` : ''}
            </div>
            
            <div class="grid grid-cols-3 gap-2 mt-2 text-center">
                <div class="p-2 rounded" style="background: var(--bg-primary);">
                    <div class="font-bold" style="color: var(--deep-blue);">${projects.length}</div>
                    <div class="text-xs text-muted">Projects</div>
                </div>
                <div class="p-2 rounded" style="background: var(--bg-primary);">
                    <div class="font-bold" style="color: var(--emerald);">${invoices.length}</div>
                    <div class="text-xs text-muted">Invoices</div>
                </div>
                <div class="p-2 rounded" style="background: var(--bg-primary);">
                    <div class="font-bold" style="color: var(--gold);">${formatCurrency(totalPaid, 'GHS')}</div>
                    <div class="text-xs text-muted">Paid</div>
                </div>
            </div>
            
            ${lastComm ? `
                <div class="mt-2 text-xs text-muted">
                    <i class="fas fa-clock mr-1"></i> Last contact: ${timeAgo(lastComm.date)}
                </div>
            ` : ''}
            
            <div class="flex gap-2 mt-3 pt-2 border-t" style="border-color: var(--border-color);">
                <button onclick="event.stopPropagation(); window.ClientsApp.logCommunication('${client.id}')" class="flex-1 py-1.5 text-xs rounded-lg transition-all hover:shadow-md" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color);">
                    <i class="fas fa-comment mr-1"></i> Log
                </button>
                <button onclick="event.stopPropagation(); window.ClientsApp.editClient('${client.id}')" class="flex-1 py-1.5 text-xs rounded-lg transition-all hover:shadow-md" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color);">
                    <i class="fas fa-edit mr-1"></i> Edit
                </button>
                <button onclick="event.stopPropagation(); window.ClientsApp.deleteClient('${client.id}')" class="px-3 py-1.5 text-xs rounded-lg transition-all hover:bg-red-100 dark:hover:bg-red-900/20" style="background: var(--bg-primary); color: #ef4444; border: 1px solid var(--border-color);">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

function createClientListItem(client) {
    const status = clientStatuses[client.status] || clientStatuses.inactive;
    const projects = clientProjectsCache.filter(p => p.client === client.name || p.client === client.company);
    const invoices = clientInvoicesCache.filter(inv => inv.clientName === client.name || inv.clientName === client.company);
    const totalPaid = invoices.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + inv.total, 0);
    
    return `
        <div class="glass-card rounded-xl p-4 transition-all hover:shadow-lg cursor-pointer" onclick="window.ClientsApp.viewClient('${client.id}')">
            <div class="flex flex-col md:flex-row md:items-center gap-3">
                <div class="flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                        <h3 class="font-semibold" style="color: var(--text-primary);">${escapeHtml(client.name)}</h3>
                        <span class="text-xs px-2 py-0.5 rounded-full" style="background: ${status.bg}; color: ${status.color};">
                            <i class="fas ${status.icon} text-xs mr-1"></i>${status.label}
                        </span>
                        ${client.company ? `<span class="text-xs text-muted">${escapeHtml(client.company)}</span>` : ''}
                    </div>
                    <div class="flex flex-wrap gap-3 text-xs text-muted">
                        ${client.email ? `<span><i class="fas fa-envelope"></i> ${escapeHtml(client.email)}</span>` : ''}
                        ${client.phone ? `<span><i class="fas fa-phone"></i> ${escapeHtml(client.phone)}</span>` : ''}
                        ${client.industry ? `<span>${escapeHtml(client.industry)}</span>` : ''}
                        ${client.location ? `<span><i class="fas fa-map-marker-alt"></i> ${escapeHtml(client.location)}</span>` : ''}
                    </div>
                </div>
                <div class="flex items-center gap-4">
                    <div class="text-center">
                        <div class="font-bold" style="color: var(--deep-blue);">${projects.length}</div>
                        <div class="text-xs text-muted">Projects</div>
                    </div>
                    <div class="text-center">
                        <div class="font-bold" style="color: var(--emerald);">${invoices.length}</div>
                        <div class="text-xs text-muted">Invoices</div>
                    </div>
                    <div class="text-center">
                        <div class="font-bold" style="color: var(--gold);">${formatCurrency(totalPaid, 'GHS')}</div>
                        <div class="text-xs text-muted">Paid</div>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="event.stopPropagation(); window.ClientsApp.logCommunication('${client.id}')" class="p-2 rounded-lg transition-all hover:bg-gray-100 dark:hover:bg-gray-700" title="Log Communication">
                            <i class="fas fa-comment" style="color: var(--text-muted);"></i>
                        </button>
                        <button onclick="event.stopPropagation(); window.ClientsApp.editClient('${client.id}')" class="p-2 rounded-lg transition-all hover:bg-gray-100 dark:hover:bg-gray-700" title="Edit Client">
                            <i class="fas fa-edit" style="color: var(--text-muted);"></i>
                        </button>
                        <button onclick="event.stopPropagation(); window.ClientsApp.deleteClient('${client.id}')" class="p-2 rounded-lg transition-all hover:bg-red-100 dark:hover:bg-red-900/20" title="Delete Client">
                            <i class="fas fa-trash" style="color: #ef4444;"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderCommunications() {
    const container = document.getElementById('client-container');
    if (!container) return;
    
    if (clientCommunicationsCache.length === 0) {
        container.innerHTML = `
            <div class="glass-card rounded-xl p-12 text-center">
                <i class="fas fa-comments text-6xl mb-4 text-muted"></i>
                <h3 class="text-xl font-semibold mb-2" style="color: var(--text-primary);">No communications logged</h3>
                <p class="text-muted">Start logging your client interactions and communications!</p>
            </div>
        `;
        return;
    }
    
    container.className = 'space-y-4';
    container.innerHTML = clientCommunicationsCache.map(comm => {
        const type = communicationTypes[comm.type] || communicationTypes.note;
        const client = clientsCache.find(c => c.id === comm.clientId);
        
        return `
            <div class="glass-card rounded-xl p-4 transition-all hover:shadow-lg">
                <div class="flex flex-col md:flex-row md:items-center gap-3">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background: ${type.color}20;">
                            <i class="fas ${type.icon}" style="color: ${type.color};"></i>
                        </div>
                        <div>
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="font-semibold" style="color: var(--text-primary);">${client ? escapeHtml(client.name) : 'Unknown Client'}</span>
                                <span class="text-xs px-2 py-0.5 rounded-full" style="background: ${type.color}20; color: ${type.color};">${type.label}</span>
                            </div>
                            <div class="text-xs text-muted">${formatDate(comm.date)} at ${comm.date.toLocaleTimeString()}</div>
                        </div>
                    </div>
                    <div class="flex-1">
                        <p style="color: var(--text-secondary);">${escapeHtml(comm.content)}</p>
                        ${comm.notes ? `<p class="text-xs text-muted mt-1"><i class="fas fa-sticky-note mr-1"></i>${escapeHtml(comm.notes)}</p>` : ''}
                    </div>
                    <button onclick="window.ClientsApp.deleteCommunication('${comm.id}')" class="p-2 rounded-lg transition-all hover:bg-red-100 dark:hover:bg-red-900/20">
                        <i class="fas fa-trash" style="color: #ef4444;"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderClientAnalytics() {
    const container = document.getElementById('client-container');
    if (!container) return;
    
    const total = clientsCache.length;
    const active = clientsCache.filter(c => c.status === 'active').length;
    const leads = clientsCache.filter(c => c.status === 'lead' || c.status === 'prospect').length;
    const vip = clientsCache.filter(c => c.status === 'vip').length;
    
    // Status breakdown
    const statusStats = {};
    clientsCache.forEach(c => {
        if (!statusStats[c.status]) statusStats[c.status] = 0;
        statusStats[c.status]++;
    });
    
    // Industry breakdown
    const industryStats = {};
    clientsCache.forEach(c => {
        if (c.industry) {
            if (!industryStats[c.industry]) industryStats[c.industry] = 0;
            industryStats[c.industry]++;
        }
    });
    
    // Revenue by client
    const clientRevenue = {};
    clientInvoicesCache
        .filter(inv => inv.status === 'paid')
        .forEach(inv => {
            const key = inv.clientName;
            if (!clientRevenue[key]) clientRevenue[key] = 0;
            clientRevenue[key] += inv.total;
        });
    
    const topClients = Object.entries(clientRevenue)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    
    return `
        <div class="space-y-6">
            <!-- Quick Stats -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div class="glass-card p-3 rounded-xl text-center">
                    <div class="text-xl font-bold" style="color: var(--deep-blue);">${total}</div>
                    <div class="text-xs text-muted">Total Clients</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center">
                    <div class="text-xl font-bold" style="color: var(--emerald);">${active}</div>
                    <div class="text-xs text-muted">Active Clients</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center">
                    <div class="text-xl font-bold" style="color: #3b82f6;">${leads}</div>
                    <div class="text-xs text-muted">Leads & Prospects</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center">
                    <div class="text-xl font-bold" style="color: #8b5cf6;">${vip}</div>
                    <div class="text-xs text-muted">VIP Clients</div>
                </div>
            </div>
            
            <!-- Status Breakdown -->
            <div class="glass-card rounded-xl p-4">
                <h4 class="font-semibold mb-3" style="color: var(--text-primary);">
                    <i class="fas fa-chart-pie mr-2" style="color: var(--deep-blue);"></i>Status Breakdown
                </h4>
                <div class="space-y-2">
                    ${Object.entries(statusStats).map(([status, count]) => {
                        const statusConfig = clientStatuses[status] || clientStatuses.inactive;
                        const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
                        return `
                            <div class="p-2 rounded-lg" style="background: var(--bg-primary);">
                                <div class="flex justify-between items-center">
                                    <div>
                                        <i class="fas ${statusConfig.icon}" style="color: ${statusConfig.color};"></i>
                                        <span class="font-medium ml-2" style="color: var(--text-primary);">${statusConfig.label}</span>
                                    </div>
                                    <span class="text-sm" style="color: var(--text-muted);">${count} (${percentage}%)</span>
                                </div>
                                <div class="w-full h-1.5 rounded-full overflow-hidden mt-1" style="background: var(--border-color);">
                                    <div class="h-full rounded-full transition-all" style="width: ${percentage}%; background: ${statusConfig.color};"></div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
            
            <!-- Top Clients by Revenue -->
            ${topClients.length > 0 ? `
                <div class="glass-card rounded-xl p-4">
                    <h4 class="font-semibold mb-3" style="color: var(--text-primary);">
                        <i class="fas fa-trophy mr-2" style="color: var(--gold);"></i>Top Clients by Revenue
                    </h4>
                    <div class="space-y-2">
                        ${topClients.map(([name, revenue], index) => `
                            <div class="flex justify-between items-center p-2 rounded" style="background: var(--bg-primary);">
                                <div class="flex items-center gap-3">
                                    <span class="text-sm font-bold" style="color: ${index === 0 ? '#f59e0b' : index === 1 ? '#9ca3af' : index === 2 ? '#d97706' : 'var(--text-muted)'};">#${index + 1}</span>
                                    <span style="color: var(--text-primary);">${escapeHtml(name)}</span>
                                </div>
                                <span class="font-semibold" style="color: var(--emerald);">${formatCurrency(revenue, 'GHS')}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            <!-- Industry Breakdown -->
            ${Object.keys(industryStats).length > 0 ? `
                <div class="glass-card rounded-xl p-4">
                    <h4 class="font-semibold mb-3" style="color: var(--text-primary);">
                        <i class="fas fa-building mr-2" style="color: #3b82f6;"></i>Industry Breakdown
                    </h4>
                    <div class="flex flex-wrap gap-2">
                        ${Object.entries(industryStats)
                            .sort((a, b) => b[1] - a[1])
                            .map(([industry, count]) => `
                                <span class="px-3 py-1 rounded-full text-sm" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6;">
                                    ${escapeHtml(industry)} (${count})
                                </span>
                            `).join('')}
                    </div>
                </div>
            ` : ''}
            
            <!-- Analytics Insights -->
            <div class="glass-card p-4 rounded-xl" style="border-left: 4px solid #8b5cf6;">
                <h4 class="font-semibold mb-2" style="color: var(--text-primary);">
                    <i class="fas fa-lightbulb mr-2" style="color: #8b5cf6;"></i>Client Insights
                </h4>
                <div class="space-y-1 text-sm" style="color: var(--text-secondary);">
                    ${total > 0 ? `
                        <p>👥 You have <strong style="color: var(--text-primary);">${total}</strong> clients in your network.</p>
                        <p>📊 <strong style="color: var(--text-primary);">${active}</strong> are active, <strong style="color: var(--text-primary);">${leads}</strong> are leads or prospects.</p>
                        ${vip > 0 ? `<p>⭐ You have <strong style="color: var(--text-primary);">${vip}</strong> VIP clients. Keep them happy!</p>` : ''}
                        ${topClients.length > 0 ? `<p>💰 Your top client is <strong style="color: var(--text-primary);">${escapeHtml(topClients[0][0])}</strong> with ${formatCurrency(topClients[0][1], 'GHS')} in revenue.</p>` : ''}
                        ${active < 3 && total > 5 ? `<p>💡 Tip: Reach out to your inactive clients to re-engage them.</p>` : ''}
                        ${leads > 3 ? `<p>🚀 You have ${leads} leads. Focus on converting them to active clients!</p>` : ''}
                    ` : '<p>Start adding clients to see insights here!</p>'}
                </div>
            </div>
            
            <!-- Refresh Button -->
            <div class="text-center">
                <button onclick="window.ClientsApp.refreshAnalytics()" class="px-6 py-2 rounded-lg font-semibold transition-all hover:shadow-md" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color);">
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
            filterAndRenderClients();
        });
    });
    
    // Search and filters
    document.getElementById('client-search')?.addEventListener('input', () => filterAndRenderClients());
    document.getElementById('client-status-filter')?.addEventListener('change', () => filterAndRenderClients());
    document.getElementById('client-industry-filter')?.addEventListener('change', () => filterAndRenderClients());
    
    // Clear filters
    document.getElementById('clear-filters')?.addEventListener('click', () => {
        document.getElementById('client-search').value = '';
        document.getElementById('client-status-filter').value = 'all';
        document.getElementById('client-industry-filter').value = 'all';
        filterAndRenderClients();
    });
    
    // Add client button
    document.getElementById('add-client-btn')?.addEventListener('click', () => window.ClientsApp.showAddClientModal());
    document.getElementById('add-communication-btn')?.addEventListener('click', () => window.ClientsApp.showAddCommunicationModal());
}

// ============= GLOBAL CLIENTS APP OBJECT =============

window.ClientsApp = {
    refreshAnalytics: function() {
        showToast('Refreshing analytics...', 'info');
        const view = document.querySelector('.view-tab.active')?.dataset.view || 'list';
        if (view === 'analytics') {
            filterAndRenderClients();
            showToast('Analytics refreshed!', 'success');
        } else {
            const analyticsTab = document.querySelector('.view-tab[data-view="analytics"]');
            if (analyticsTab) analyticsTab.click();
        }
    },
    
    showAddClientModal: function() {
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.ClientsApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto transform transition-all" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-user-plus mr-2" style="color: var(--deep-blue);"></i>Add New Client
                            </h2>
                            <p class="text-xs text-muted">Add a client to your network</p>
                        </div>
                        <button onclick="window.ClientsApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="add-client-form" class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Client Name *</label>
                            <input type="text" name="name" required placeholder="Full name" 
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Company</label>
                            <input type="text" name="company" placeholder="Company name"
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Email</label>
                                <input type="email" name="email" placeholder="client@email.com"
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Phone</label>
                                <input type="tel" name="phone" placeholder="+233 XX XXX XXXX"
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Status</label>
                                <select name="status" class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                        style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    ${Object.entries(clientStatuses).map(([key, status]) => 
                                        `<option value="${key}"><i class="fas ${status.icon}"></i> ${status.label}</option>`
                                    ).join('')}
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Industry</label>
                                <select name="industry" class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                        style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    <option value="">Select Industry</option>
                                    ${industries.map(industry => 
                                        `<option value="${industry}">${industry}</option>`
                                    ).join('')}
                                </select>
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Location (Optional)</label>
                            <input type="text" name="location" placeholder="City, Country"
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Notes</label>
                            <textarea name="notes" rows="2" placeholder="Additional notes about the client..."
                                      class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></textarea>
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button type="submit" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-1"></i> Add Client
                            </button>
                            <button type="button" onclick="window.ClientsApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
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
            
            document.getElementById('add-client-form').onsubmit = async (e) => {
                e.preventDefault();
                const submitBtn = e.target.querySelector('button[type="submit"]');
                const originalText = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Adding...';
                submitBtn.disabled = true;
                
                try {
                    const formData = new FormData(e.target);
                    const clientData = {
                        name: formData.get('name'),
                        company: formData.get('company') || '',
                        email: formData.get('email') || '',
                        phone: formData.get('phone') || '',
                        status: formData.get('status') || 'lead',
                        industry: formData.get('industry') || '',
                        location: formData.get('location') || '',
                        notes: formData.get('notes') || '',
                        userId: currentUser.uid,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    };
                    
                    await addDoc(collection(db, 'clients'), clientData);
                    showToast('Client added successfully! 👤', 'success');
                    window.ClientsApp.closeModal();
                    await loadClients();
                    filterAndRenderClients();
                    updateStats();
                } catch (error) {
                    console.error('Error adding client:', error);
                    showToast('Failed to add client. Please try again.', 'error');
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                }
            };
        }
    },
    
    showAddCommunicationModal: function() {
        if (clientsCache.length === 0) {
            showToast('Please add a client first before logging communications!', 'warning');
            return;
        }
        
        const clientOptions = clientsCache.map(c => 
            `<option value="${c.id}">${escapeHtml(c.name)}${c.company ? ` (${escapeHtml(c.company)})` : ''}</option>`
        ).join('');
        
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.ClientsApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto transform transition-all" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-comment mr-2" style="color: var(--deep-blue);"></i>Log Communication
                            </h2>
                            <p class="text-xs text-muted">Record your client interactions</p>
                        </div>
                        <button onclick="window.ClientsApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="add-communication-form" class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Client *</label>
                            <select name="clientId" required class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                    style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <option value="">Select Client</option>
                                ${clientOptions}
                            </select>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Communication Type *</label>
                            <select name="type" required class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                    style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                ${Object.entries(communicationTypes).map(([key, type]) => 
                                    `<option value="${key}"><i class="fas ${type.icon}"></i> ${type.label}</option>`
                                ).join('')}
                            </select>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Content / Summary *</label>
                            <textarea name="content" required rows="3" placeholder="What was discussed or communicated?"
                                      class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></textarea>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Notes (Optional)</label>
                            <textarea name="notes" rows="2" placeholder="Additional notes or follow-up items..."
                                      class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></textarea>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Date & Time</label>
                            <input type="datetime-local" name="date" value="${new Date().toISOString().slice(0, 16)}"
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button type="submit" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-1"></i> Log Communication
                            </button>
                            <button type="button" onclick="window.ClientsApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
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
            
            document.getElementById('add-communication-form').onsubmit = async (e) => {
                e.preventDefault();
                const submitBtn = e.target.querySelector('button[type="submit"]');
                const originalText = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Logging...';
                submitBtn.disabled = true;
                
                try {
                    const formData = new FormData(e.target);
                    const clientId = formData.get('clientId');
                    const client = clientsCache.find(c => c.id === clientId);
                    
                    const commData = {
                        clientId: clientId,
                        clientName: client ? client.name : '',
                        type: formData.get('type'),
                        content: formData.get('content'),
                        notes: formData.get('notes') || '',
                        date: new Date(formData.get('date')),
                        userId: currentUser.uid,
                        createdAt: serverTimestamp()
                    };
                    
                    await addDoc(collection(db, 'clientCommunications'), commData);
                    
                    // Update client last contact
                    await updateDoc(doc(db, 'clients', clientId), {
                        lastContact: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    });
                    
                    showToast('Communication logged successfully! 💬', 'success');
                    window.ClientsApp.closeModal();
                    await loadClientCommunications();
                    await loadClients();
                    filterAndRenderClients();
                    updateStats();
                } catch (error) {
                    console.error('Error logging communication:', error);
                    showToast('Failed to log communication. Please try again.', 'error');
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                }
            };
        }
    },
    
    viewClient: function(clientId) {
        const client = clientsCache.find(c => c.id === clientId);
        if (!client) {
            showToast('Client not found', 'error');
            return;
        }
        
        const status = clientStatuses[client.status] || clientStatuses.inactive;
        const projects = clientProjectsCache.filter(p => p.client === client.name || p.client === client.company);
        const invoices = clientInvoicesCache.filter(inv => inv.clientName === client.name || inv.clientName === client.company);
        const communications = clientCommunicationsCache.filter(c => c.clientId === clientId);
        const totalPaid = invoices.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + inv.total, 0);
        const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.total, 0);
        
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.ClientsApp.closeModal()">
                <div class="rounded-2xl w-full max-w-2xl mx-auto max-h-[90vh] overflow-y-auto transform transition-all" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <div class="flex items-center gap-2">
                                <i class="fas fa-user" style="color: ${status.color};"></i>
                                <h2 class="text-xl font-bold" style="color: var(--text-primary);">${escapeHtml(client.name)}</h2>
                            </div>
                            <p class="text-xs text-muted">Client Details</p>
                        </div>
                        <button onclick="window.ClientsApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <div class="p-5 space-y-4">
                        <!-- Client Info -->
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <div class="p-2 rounded-lg" style="background: var(--bg-primary);">
                                <div class="text-xs text-muted">Status</div>
                                <div class="font-semibold" style="color: ${status.color};">
                                    <i class="fas ${status.icon} mr-1"></i>${status.label}
                                </div>
                            </div>
                            ${client.company ? `
                                <div class="p-2 rounded-lg" style="background: var(--bg-primary);">
                                    <div class="text-xs text-muted">Company</div>
                                    <div class="font-semibold" style="color: var(--text-primary);">${escapeHtml(client.company)}</div>
                                </div>
                            ` : ''}
                            ${client.industry ? `
                                <div class="p-2 rounded-lg" style="background: var(--bg-primary);">
                                    <div class="text-xs text-muted">Industry</div>
                                    <div class="font-semibold" style="color: var(--text-primary);">${escapeHtml(client.industry)}</div>
                                </div>
                            ` : ''}
                            ${client.location ? `
                                <div class="p-2 rounded-lg" style="background: var(--bg-primary);">
                                    <div class="text-xs text-muted">Location</div>
                                    <div class="font-semibold" style="color: var(--text-primary);">${escapeHtml(client.location)}</div>
                                </div>
                            ` : ''}
                        </div>
                        
                        <!-- Contact Info -->
                        <div class="flex flex-wrap gap-3 text-sm">
                            ${client.email ? `<span><i class="fas fa-envelope" style="color: #3b82f6;"></i> ${escapeHtml(client.email)}</span>` : ''}
                            ${client.phone ? `<span><i class="fas fa-phone" style="color: #10b981;"></i> ${escapeHtml(client.phone)}</span>` : ''}
                        </div>
                        
                        ${client.notes ? `
                            <div class="p-3 rounded-lg" style="background: var(--bg-primary);">
                                <p style="color: var(--text-secondary);">${escapeHtml(client.notes)}</p>
                            </div>
                        ` : ''}
                        
                        <!-- Financial Summary -->
                        <div class="grid grid-cols-3 gap-2">
                            <div class="p-2 rounded-lg text-center" style="background: var(--bg-primary);">
                                <div class="text-xs text-muted">Projects</div>
                                <div class="font-bold" style="color: var(--deep-blue);">${projects.length}</div>
                            </div>
                            <div class="p-2 rounded-lg text-center" style="background: var(--bg-primary);">
                                <div class="text-xs text-muted">Invoices</div>
                                <div class="font-bold" style="color: var(--emerald);">${invoices.length}</div>
                            </div>
                            <div class="p-2 rounded-lg text-center" style="background: var(--bg-primary);">
                                <div class="text-xs text-muted">Total Paid</div>
                                <div class="font-bold" style="color: var(--gold);">${formatCurrency(totalPaid, 'GHS')}</div>
                            </div>
                        </div>
                        
                        <!-- Communications -->
                        ${communications.length > 0 ? `
                            <div>
                                <h4 class="font-semibold mb-2" style="color: var(--text-primary);">
                                    <i class="fas fa-comments mr-2" style="color: var(--deep-blue);"></i>
                                    Communications (${communications.length})
                                </h4>
                                <div class="space-y-2 max-h-48 overflow-y-auto">
                                    ${communications.slice(0, 5).map(comm => {
                                        const type = communicationTypes[comm.type] || communicationTypes.note;
                                        return `
                                            <div class="flex items-center gap-2 p-2 rounded-lg" style="background: var(--bg-primary);">
                                                <i class="fas ${type.icon}" style="color: ${type.color};"></i>
                                                <div class="flex-1">
                                                    <div class="text-sm" style="color: var(--text-secondary);">${escapeHtml(comm.content)}</div>
                                                    <div class="text-xs text-muted">${formatDate(comm.date)} - ${type.label}</div>
                                                </div>
                                            </div>
                                        `;
                                    }).join('')}
                                    ${communications.length > 5 ? `<div class="text-center text-xs text-muted">+ ${communications.length - 5} more communications</div>` : ''}
                                </div>
                            </div>
                        ` : ''}
                        
                        <!-- Actions -->
                        <div class="flex flex-wrap gap-2 pt-2 border-t" style="border-color: var(--border-color);">
                            <button onclick="window.ClientsApp.closeModal(); window.ClientsApp.logCommunication('${client.id}')" class="flex-1 py-2 rounded-lg font-semibold transition-all hover:shadow-md" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color);">
                                <i class="fas fa-comment mr-1"></i> Log Communication
                            </button>
                            <button onclick="window.ClientsApp.closeModal(); window.ClientsApp.editClient('${client.id}')" class="flex-1 py-2 rounded-lg font-semibold transition-all hover:shadow-md" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color);">
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
    
    editClient: async function(clientId) {
        const client = clientsCache.find(c => c.id === clientId);
        if (!client) {
            showToast('Client not found', 'error');
            return;
        }
        
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.ClientsApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto transform transition-all" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-edit mr-2" style="color: var(--deep-blue);"></i>Edit Client
                            </h2>
                            <p class="text-xs text-muted">Update client information</p>
                        </div>
                        <button onclick="window.ClientsApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="edit-client-form" class="p-5 space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Client Name *</label>
                            <input type="text" name="name" required value="${escapeHtml(client.name)}"
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Company</label>
                            <input type="text" name="company" value="${escapeHtml(client.company || '')}"
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Email</label>
                                <input type="email" name="email" value="${escapeHtml(client.email || '')}"
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Phone</label>
                                <input type="tel" name="phone" value="${escapeHtml(client.phone || '')}"
                                       class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                       style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Status</label>
                                <select name="status" class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                        style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    ${Object.entries(clientStatuses).map(([key, status]) => 
                                        `<option value="${key}" ${key === client.status ? 'selected' : ''}><i class="fas ${status.icon}"></i> ${status.label}</option>`
                                    ).join('')}
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Industry</label>
                                <select name="industry" class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                        style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                    <option value="">Select Industry</option>
                                    ${industries.map(industry => 
                                        `<option value="${industry}" ${industry === client.industry ? 'selected' : ''}>${industry}</option>`
                                    ).join('')}
                                </select>
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Location</label>
                            <input type="text" name="location" value="${escapeHtml(client.location || '')}"
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Notes</label>
                            <textarea name="notes" rows="2"
                                      class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">${escapeHtml(client.notes || '')}</textarea>
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button type="submit" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-1"></i> Update Client
                            </button>
                            <button type="button" onclick="window.ClientsApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
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
            
            document.getElementById('edit-client-form').onsubmit = async (e) => {
                e.preventDefault();
                const submitBtn = e.target.querySelector('button[type="submit"]');
                const originalText = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Updating...';
                submitBtn.disabled = true;
                
                try {
                    const formData = new FormData(e.target);
                    const updateData = {
                        name: formData.get('name'),
                        company: formData.get('company') || '',
                        email: formData.get('email') || '',
                        phone: formData.get('phone') || '',
                        status: formData.get('status') || 'lead',
                        industry: formData.get('industry') || '',
                        location: formData.get('location') || '',
                        notes: formData.get('notes') || '',
                        updatedAt: serverTimestamp()
                    };
                    
                    await updateDoc(doc(db, 'clients', clientId), updateData);
                    showToast('Client updated successfully!', 'success');
                    window.ClientsApp.closeModal();
                    await loadClients();
                    filterAndRenderClients();
                    updateStats();
                } catch (error) {
                    console.error('Error updating client:', error);
                    showToast('Failed to update client. Please try again.', 'error');
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                }
            };
        }
    },
    
    deleteClient: async function(clientId) {
        if (!confirm('Delete this client and all related communications?')) return;
        
        try {
            // Delete related communications
            const relatedComms = clientCommunicationsCache.filter(c => c.clientId === clientId);
            for (const comm of relatedComms) {
                await deleteDoc(doc(db, 'clientCommunications', comm.id));
            }
            
            await deleteDoc(doc(db, 'clients', clientId));
            showToast('Client deleted successfully', 'success');
            await loadClients();
            await loadClientCommunications();
            filterAndRenderClients();
            updateStats();
        } catch (error) {
            console.error('Error deleting client:', error);
            showToast('Failed to delete client. Please try again.', 'error');
        }
    },
    
    logCommunication: function(clientId) {
        const client = clientsCache.find(c => c.id === clientId);
        if (!client) {
            showToast('Client not found', 'error');
            return;
        }
        
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.ClientsApp.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto transform transition-all" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-comment mr-2" style="color: var(--deep-blue);"></i>Log Communication
                            </h2>
                            <p class="text-xs text-muted">${escapeHtml(client.name)}</p>
                        </div>
                        <button onclick="window.ClientsApp.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    <form id="quick-communication-form" class="p-5 space-y-4">
                        <input type="hidden" name="clientId" value="${clientId}">
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Communication Type *</label>
                            <select name="type" required class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                    style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                ${Object.entries(communicationTypes).map(([key, type]) => 
                                    `<option value="${key}"><i class="fas ${type.icon}"></i> ${type.label}</option>`
                                ).join('')}
                            </select>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Content / Summary *</label>
                            <textarea name="content" required rows="3" placeholder="What was discussed?"
                                      class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></textarea>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Notes (Optional)</label>
                            <textarea name="notes" rows="2" placeholder="Follow-up items..."
                                      class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                                      style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);"></textarea>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Date & Time</label>
                            <input type="datetime-local" name="date" value="${new Date().toISOString().slice(0, 16)}"
                                   class="w-full px-3 md:px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        </div>
                        
                        <div class="flex flex-col sm:flex-row gap-3 pt-2">
                            <button type="submit" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-1"></i> Log Communication
                            </button>
                            <button type="button" onclick="window.ClientsApp.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100 dark:hover:bg-gray-700" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
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
            
            document.getElementById('quick-communication-form').onsubmit = async (e) => {
                e.preventDefault();
                const submitBtn = e.target.querySelector('button[type="submit"]');
                const originalText = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Logging...';
                submitBtn.disabled = true;
                
                try {
                    const formData = new FormData(e.target);
                    const commData = {
                        clientId: formData.get('clientId'),
                        clientName: client.name,
                        type: formData.get('type'),
                        content: formData.get('content'),
                        notes: formData.get('notes') || '',
                        date: new Date(formData.get('date')),
                        userId: currentUser.uid,
                        createdAt: serverTimestamp()
                    };
                    
                    await addDoc(collection(db, 'clientCommunications'), commData);
                    
                    await updateDoc(doc(db, 'clients', clientId), {
                        lastContact: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    });
                    
                    showToast('Communication logged successfully! 💬', 'success');
                    window.ClientsApp.closeModal();
                    await loadClientCommunications();
                    await loadClients();
                    filterAndRenderClients();
                    updateStats();
                } catch (error) {
                    console.error('Error logging communication:', error);
                    showToast('Failed to log communication. Please try again.', 'error');
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                }
            };
        }
    },
    
    deleteCommunication: async function(commId) {
        if (!confirm('Delete this communication record?')) return;
        
        try {
            await deleteDoc(doc(db, 'clientCommunications', commId));
            showToast('Communication deleted', 'success');
            await loadClientCommunications();
            filterAndRenderClients();
        } catch (error) {
            console.error('Error deleting communication:', error);
            showToast('Failed to delete communication. Please try again.', 'error');
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

// Add closeModal to global scope
window.closeModal = window.ClientsApp.closeModal;