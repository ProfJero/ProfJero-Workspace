// js/pages/password-manager.js
import { db, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from '../firebase-config.js';
import { showToast, escapeHtml, formatDate } from '../utils/helpers.js';

let currentUser = null;
let currentPage = 'dashboard';
let selectedCategory = 'all';
let selectedPassword = null;
let currentView = 'grid';
let searchQuery = '';
let currentFilter = 'all';
let isInitialized = false;

// ====== DEFAULT DATA ======
let vaultData = {
    passwords: [],
    categories: [
        { id: 'personal', name: 'Personal', icon: 'fa-user', color: '#6366f1' },
        { id: 'work', name: 'Work', icon: 'fa-briefcase', color: '#f59e0b' },
        { id: 'business', name: 'Business', icon: 'fa-building', color: '#0891b2' },
        { id: 'social', name: 'Social Media', icon: 'fa-share-alt', color: '#3b82f6' },
        { id: 'finance', name: 'Finance', icon: 'fa-coins', color: '#10b981' },
        { id: 'banking', name: 'Banking', icon: 'fa-university', color: '#059669' },
        { id: 'education', name: 'Education', icon: 'fa-graduation-cap', color: '#8b5cf6' },
        { id: 'government', name: 'Government', icon: 'fa-landmark', color: '#dc2626' },
        { id: 'entertainment', name: 'Entertainment', icon: 'fa-film', color: '#ec4899' },
        { id: 'shopping', name: 'Shopping', icon: 'fa-shopping-bag', color: '#f97316' },
        { id: 'development', name: 'Development', icon: 'fa-code', color: '#06b6d4' },
        { id: 'cloud', name: 'Cloud Services', icon: 'fa-cloud', color: '#0284c7' }
    ],
    secureNotes: [],
    identities: [],
    cards: [],
    documents: [],
    history: []
};

// ====== PASSWORD GENERATOR ======
const generatorSettings = {
    length: 16,
    includeUppercase: true,
    includeLowercase: true,
    includeNumbers: true,
    includeSymbols: true,
    excludeSimilar: false,
    excludeAmbiguous: false,
    pronounceable: false,
    passphrase: false
};

// ====== LOAD VAULT DATA ======
async function loadVaultData() {
    if (!currentUser) {
        console.log('No user logged in, using default data');
        return;
    }
    
    try {
        const passwordsQuery = query(collection(db, 'passwords'), where('userId', '==', currentUser.uid));
        const passwordsSnapshot = await getDocs(passwordsQuery);
        vaultData.passwords = passwordsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const categoriesQuery = query(collection(db, 'passwordCategories'), where('userId', '==', currentUser.uid));
        const categoriesSnapshot = await getDocs(categoriesQuery);
        if (!categoriesSnapshot.empty) {
            vaultData.categories = categoriesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
        
        const notesQuery = query(collection(db, 'secureNotes'), where('userId', '==', currentUser.uid));
        const notesSnapshot = await getDocs(notesQuery);
        vaultData.secureNotes = notesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const identitiesQuery = query(collection(db, 'identities'), where('userId', '==', currentUser.uid));
        const identitiesSnapshot = await getDocs(identitiesQuery);
        vaultData.identities = identitiesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const cardsQuery = query(collection(db, 'paymentCards'), where('userId', '==', currentUser.uid));
        const cardsSnapshot = await getDocs(cardsQuery);
        vaultData.cards = cardsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const historyQuery = query(collection(db, 'passwordHistory'), where('userId', '==', currentUser.uid));
        const historySnapshot = await getDocs(historyQuery);
        vaultData.history = historySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        console.log('✅ Password Manager data loaded');
        
    } catch (error) {
        console.error('Error loading vault data:', error);
        if (error.code === 'permission-denied') {
            console.log('Using default categories');
        }
    }
}

// ====== RENDER PASSWORD MANAGER PAGE ======
export async function renderPasswordManagerPage(user) {
    currentUser = user;
    await loadVaultData();
    
    const stats = getVaultStats();
    
    return `
        <div class="space-y-6 animate-fade-in-up">
            <!-- Header -->
            <div class="glass-card rounded-2xl p-5 md:p-6">
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 class="text-2xl md:text-3xl font-bold" style="color: var(--text-primary);">
                            <i class="fas fa-lock mr-3" style="color: var(--deep-blue);"></i>Password Manager
                        </h1>
                        <p class="text-muted mt-1 text-sm">Secure vault for all your passwords and sensitive data</p>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <button id="add-password-btn" class="px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-all transform hover:scale-[1.02] text-sm" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                            <i class="fas fa-plus"></i> Add Password
                        </button>
                        <button id="generate-password-btn" class="px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-all hover:shadow-md text-sm" style="background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary);">
                            <i class="fas fa-dice"></i> Generate
                        </button>
                    </div>
                </div>
            </div>

            <!-- Stats Cards -->
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div class="glass-card rounded-xl p-4 transition-all hover:shadow-lg text-center">
                    <div class="text-2xl font-bold" style="color: var(--text-primary);">${stats.total}</div>
                    <div class="text-xs text-muted mt-1"><i class="fas fa-key mr-1"></i>Total</div>
                </div>
                <div class="glass-card rounded-xl p-4 transition-all hover:shadow-lg text-center">
                    <div class="text-2xl font-bold" style="color: #f59e0b;">${stats.favorites}</div>
                    <div class="text-xs text-muted mt-1"><i class="fas fa-star mr-1"></i>Favorites</div>
                </div>
                <div class="glass-card rounded-xl p-4 transition-all hover:shadow-lg text-center">
                    <div class="text-2xl font-bold" style="color: #ef4444;">${stats.weak}</div>
                    <div class="text-xs text-muted mt-1"><i class="fas fa-exclamation-triangle mr-1"></i>Weak</div>
                </div>
                <div class="glass-card rounded-xl p-4 transition-all hover:shadow-lg text-center">
                    <div class="text-2xl font-bold" style="color: #8b5cf6;">${stats.duplicates}</div>
                    <div class="text-xs text-muted mt-1"><i class="fas fa-copy mr-1"></i>Duplicates</div>
                </div>
                <div class="glass-card rounded-xl p-4 transition-all hover:shadow-lg text-center">
                    <div class="text-2xl font-bold" style="color: #dc2626;">${stats.expired}</div>
                    <div class="text-xs text-muted mt-1"><i class="fas fa-clock mr-1"></i>Expired</div>
                </div>
                <div class="glass-card rounded-xl p-4 transition-all hover:shadow-lg text-center">
                    <div class="text-2xl font-bold" style="color: #10b981;">${stats.securityScore}%</div>
                    <div class="text-xs text-muted mt-1"><i class="fas fa-shield-alt mr-1"></i>Security</div>
                </div>
            </div>

            <!-- Security Score Card -->
            <div class="glass-card rounded-2xl p-5">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="font-bold text-lg flex items-center gap-2" style="color: var(--text-primary);">
                        <i class="fas fa-shield-alt" style="color: var(--deep-blue);"></i>
                        Security Health
                    </h3>
                    <span class="text-sm font-semibold" style="color: ${stats.securityScore >= 80 ? '#10b981' : stats.securityScore >= 60 ? '#f59e0b' : '#ef4444'};">
                        ${stats.securityScore}% - ${stats.securityScore >= 80 ? 'Good' : stats.securityScore >= 60 ? 'Fair' : 'Needs Attention'}
                    </span>
                </div>
                <div class="w-full h-3 rounded-full overflow-hidden" style="background: var(--bg-primary);">
                    <div class="h-full rounded-full transition-all duration-500" style="width: ${stats.securityScore}%; background: linear-gradient(90deg, ${stats.securityScore >= 80 ? '#10b981' : stats.securityScore >= 60 ? '#f59e0b' : '#ef4444'}, ${stats.securityScore >= 80 ? '#34d399' : stats.securityScore >= 60 ? '#fbbf24' : '#f87171'});"></div>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                    <div class="text-center p-2 rounded-lg" style="background: var(--bg-primary);">
                        <div class="text-sm font-semibold" style="color: var(--text-primary);">${stats.strong}</div>
                        <div class="text-xs text-muted">Strong</div>
                    </div>
                    <div class="text-center p-2 rounded-lg" style="background: var(--bg-primary);">
                        <div class="text-sm font-semibold" style="color: var(--text-primary);">${stats.medium}</div>
                        <div class="text-xs text-muted">Medium</div>
                    </div>
                    <div class="text-center p-2 rounded-lg" style="background: var(--bg-primary);">
                        <div class="text-sm font-semibold" style="color: var(--text-primary);">${stats.weak}</div>
                        <div class="text-xs text-muted">Weak</div>
                    </div>
                    <div class="text-center p-2 rounded-lg" style="background: var(--bg-primary);">
                        <div class="text-sm font-semibold" style="color: var(--text-primary);">${stats.reused}</div>
                        <div class="text-xs text-muted">Reused</div>
                    </div>
                </div>
            </div>

            <!-- Main Content Tabs -->
            <div class="glass-card rounded-2xl overflow-hidden">
                <!-- Tab Navigation -->
                <div class="flex overflow-x-auto border-b scrollbar-hide" style="border-color: var(--border-color); background: var(--bg-secondary);">
                    <button class="tab-btn active px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all" data-tab="vault" style="border-color: var(--deep-blue); color: var(--deep-blue);">
                        <i class="fas fa-vault mr-2"></i>Vault
                    </button>
                    <button class="tab-btn px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all" data-tab="categories" style="border-color: transparent; color: var(--text-muted);">
                        <i class="fas fa-tags mr-2"></i>Categories
                    </button>
                    <button class="tab-btn px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all" data-tab="generator" style="border-color: transparent; color: var(--text-muted);">
                        <i class="fas fa-dice mr-2"></i>Generator
                    </button>
                    <button class="tab-btn px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all" data-tab="health" style="border-color: transparent; color: var(--text-muted);">
                        <i class="fas fa-heartbeat mr-2"></i>Health
                    </button>
                    <button class="tab-btn px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all" data-tab="notes" style="border-color: transparent; color: var(--text-muted);">
                        <i class="fas fa-sticky-note mr-2"></i>Secure Notes
                    </button>
                    <button class="tab-btn px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all" data-tab="identity" style="border-color: transparent; color: var(--text-muted);">
                        <i class="fas fa-id-card mr-2"></i>Identity
                    </button>
                    <button class="tab-btn px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all" data-tab="payments" style="border-color: transparent; color: var(--text-muted);">
                        <i class="fas fa-credit-card mr-2"></i>Payments
                    </button>
                    <button class="tab-btn px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all" data-tab="history" style="border-color: transparent; color: var(--text-muted);">
                        <i class="fas fa-history mr-2"></i>History
                    </button>
                </div>

                <!-- Tab Content -->
                <div class="p-4 md:p-5">
                    <div id="tab-vault" class="tab-content active">${renderVaultTab()}</div>
                    <div id="tab-categories" class="tab-content hidden">${renderCategoriesTab()}</div>
                    <div id="tab-generator" class="tab-content hidden">${renderGeneratorTab()}</div>
                    <div id="tab-health" class="tab-content hidden">${renderHealthTab()}</div>
                    <div id="tab-notes" class="tab-content hidden">${renderNotesTab()}</div>
                    <div id="tab-identity" class="tab-content hidden">${renderIdentityTab()}</div>
                    <div id="tab-payments" class="tab-content hidden">${renderPaymentsTab()}</div>
                    <div id="tab-history" class="tab-content hidden">${renderHistoryTab()}</div>
                </div>
            </div>
        </div>
    `;
}

// ====== RENDER FUNCTIONS (all the render functions remain the same) ======
// ... (keep all the render functions from the previous version)

// ====== STYLED MODAL FUNCTIONS ======

function showAddPasswordModal(prefilledPassword = null) {
    const categories = vaultData.categories || [];
    
    const modalHtml = `
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" id="modal-overlay" onclick="if(event.target === this) closeAddPasswordModal()">
            <div class="rounded-2xl w-full max-w-lg mx-auto shadow-2xl transform transition-all animate-scale-in" style="background: var(--bg-secondary); max-height: 90vh; overflow-y: auto;">
                <!-- Modal Header -->
                <div class="sticky top-0 flex justify-between items-center p-5 border-b z-10" style="background: var(--bg-secondary); border-color: var(--border-color);">
                    <h2 class="text-xl font-bold flex items-center gap-2" style="color: var(--text-primary);">
                        <span class="w-10 h-10 rounded-xl flex items-center justify-center" style="background: var(--deep-blue)15; color: var(--deep-blue);">
                            <i class="fas fa-plus-circle"></i>
                        </span>
                        Add New Password
                    </h2>
                    <button onclick="closeAddPasswordModal()" class="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-all" style="color: var(--text-muted);">
                        <i class="fas fa-times text-lg"></i>
                    </button>
                </div>
                
                <!-- Modal Body -->
                <div class="p-5">
                    <form id="add-password-form" class="space-y-4">
                        <div class="form-group">
                            <label class="form-label">Account Name <span class="text-red-500">*</span></label>
                            <input type="text" id="new-account-name" class="form-input" placeholder="e.g., Google, Facebook" required>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div class="form-group">
                                <label class="form-label">Username</label>
                                <input type="text" id="new-username" class="form-input" placeholder="Username">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Email</label>
                                <input type="email" id="new-email" class="form-input" placeholder="email@example.com">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Password <span class="text-red-500">*</span></label>
                            <div class="flex gap-2">
                                <input type="password" id="new-password" class="form-input flex-1" placeholder="Enter password" value="${prefilledPassword || ''}" required>
                                <button type="button" id="toggle-password-visibility" class="px-3 rounded-lg transition-all hover:bg-primary/10" style="background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary);">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div class="form-group">
                                <label class="form-label">Website URL</label>
                                <input type="url" id="new-website" class="form-input" placeholder="https://example.com">
                            </div>
                            <div class="form-group">
                                <label class="form-label">App Name</label>
                                <input type="text" id="new-app-name" class="form-input" placeholder="App name">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Category</label>
                            <select id="new-category" class="form-input">
                                ${categories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Tags (comma separated)</label>
                            <input type="text" id="new-tags" class="form-input" placeholder="work, personal, etc.">
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Notes</label>
                            <textarea id="new-notes" rows="2" class="form-input resize-none" placeholder="Additional notes..."></textarea>
                        </div>
                        
                        <div class="flex items-center gap-4">
                            <label class="flex items-center gap-2 text-sm cursor-pointer" style="color: var(--text-primary);">
                                <input type="checkbox" id="new-favorite" class="w-4 h-4 rounded" style="accent-color: var(--deep-blue);">
                                <i class="fas fa-star text-yellow-500"></i> Favorite
                            </label>
                        </div>
                        
                        <!-- Modal Footer -->
                        <div class="flex gap-3 pt-4 border-t" style="border-color: var(--border-color);">
                            <button type="submit" class="flex-1 px-4 py-2.5 rounded-xl font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-2"></i>Save Password
                            </button>
                            <button type="button" onclick="closeAddPasswordModal()" class="px-4 py-2.5 rounded-xl font-semibold transition-all hover:bg-primary/10" style="background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary);">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
    
    const container = document.createElement('div');
    container.id = 'add-password-modal';
    container.innerHTML = modalHtml;
    document.body.appendChild(container);
    
    // Add animation styles
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fade-in {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        @keyframes scale-in {
            from { opacity: 0; transform: scale(0.95) translateY(-20px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-fade-in { animation: fade-in 0.2s ease-out; }
        .animate-scale-in { animation: scale-in 0.3s ease-out; }
    `;
    document.head.appendChild(style);
    
    const form = document.getElementById('add-password-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveNewPassword();
        });
    }
    
    const toggleBtn = document.getElementById('toggle-password-visibility');
    const passwordInput = document.getElementById('new-password');
    if (toggleBtn && passwordInput) {
        toggleBtn.addEventListener('click', () => {
            const type = passwordInput.type === 'password' ? 'text' : 'password';
            passwordInput.type = type;
            toggleBtn.querySelector('i').className = type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
        });
    }
}

function closeAddPasswordModal() {
    const modal = document.getElementById('add-password-modal');
    if (modal) modal.remove();
}

window.closeAddPasswordModal = closeAddPasswordModal;

// ====== SHOW EDIT PASSWORD MODAL ======
function showEditPasswordModal(id) {
    const password = vaultData.passwords.find(p => p.id === id);
    if (!password) return;
    
    const categories = vaultData.categories || [];
    
    const modalHtml = `
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" id="modal-overlay" onclick="if(event.target === this) closeEditPasswordModal()">
            <div class="rounded-2xl w-full max-w-lg mx-auto shadow-2xl transform transition-all animate-scale-in" style="background: var(--bg-secondary); max-height: 90vh; overflow-y: auto;">
                <!-- Modal Header -->
                <div class="sticky top-0 flex justify-between items-center p-5 border-b z-10" style="background: var(--bg-secondary); border-color: var(--border-color);">
                    <h2 class="text-xl font-bold flex items-center gap-2" style="color: var(--text-primary);">
                        <span class="w-10 h-10 rounded-xl flex items-center justify-center" style="background: var(--deep-blue)15; color: var(--deep-blue);">
                            <i class="fas fa-edit"></i>
                        </span>
                        Edit Password
                    </h2>
                    <button onclick="closeEditPasswordModal()" class="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-all" style="color: var(--text-muted);">
                        <i class="fas fa-times text-lg"></i>
                    </button>
                </div>
                
                <!-- Modal Body -->
                <div class="p-5">
                    <form id="edit-password-form" class="space-y-4">
                        <div class="form-group">
                            <label class="form-label">Account Name <span class="text-red-500">*</span></label>
                            <input type="text" id="edit-account-name" class="form-input" value="${escapeHtml(password.accountName)}" required>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div class="form-group">
                                <label class="form-label">Username</label>
                                <input type="text" id="edit-username" class="form-input" value="${escapeHtml(password.username || '')}">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Email</label>
                                <input type="email" id="edit-email" class="form-input" value="${escapeHtml(password.email || '')}">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Password <span class="text-red-500">*</span></label>
                            <div class="flex gap-2">
                                <input type="password" id="edit-password" class="form-input flex-1" value="${escapeHtml(password.password)}" required>
                                <button type="button" id="toggle-edit-password" class="px-3 rounded-lg transition-all hover:bg-primary/10" style="background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary);">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div class="form-group">
                                <label class="form-label">Website URL</label>
                                <input type="url" id="edit-website" class="form-input" value="${escapeHtml(password.website || '')}">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Category</label>
                                <select id="edit-category" class="form-input">
                                    ${categories.map(cat => `
                                        <option value="${cat.id}" ${cat.id === password.category ? 'selected' : ''}>${cat.name}</option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Tags (comma separated)</label>
                            <input type="text" id="edit-tags" class="form-input" value="${escapeHtml((password.tags || []).join(', '))}">
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Notes</label>
                            <textarea id="edit-notes" rows="2" class="form-input resize-none">${escapeHtml(password.notes || '')}</textarea>
                        </div>
                        
                        <div class="flex items-center gap-4">
                            <label class="flex items-center gap-2 text-sm cursor-pointer" style="color: var(--text-primary);">
                                <input type="checkbox" id="edit-favorite" ${password.favorite ? 'checked' : ''} class="w-4 h-4 rounded" style="accent-color: var(--deep-blue);">
                                <i class="fas fa-star text-yellow-500"></i> Favorite
                            </label>
                        </div>
                        
                        <!-- Modal Footer -->
                        <div class="flex gap-3 pt-4 border-t" style="border-color: var(--border-color);">
                            <button type="submit" class="flex-1 px-4 py-2.5 rounded-xl font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-save mr-2"></i>Update Password
                            </button>
                            <button type="button" onclick="closeEditPasswordModal()" class="px-4 py-2.5 rounded-xl font-semibold transition-all hover:bg-primary/10" style="background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary);">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
    
    const container = document.createElement('div');
    container.id = 'edit-password-modal';
    container.innerHTML = modalHtml;
    document.body.appendChild(container);
    
    const form = document.getElementById('edit-password-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await updatePassword(id);
        });
    }
    
    const toggleBtn = document.getElementById('toggle-edit-password');
    const passwordInput = document.getElementById('edit-password');
    if (toggleBtn && passwordInput) {
        toggleBtn.addEventListener('click', () => {
            const type = passwordInput.type === 'password' ? 'text' : 'password';
            passwordInput.type = type;
            toggleBtn.querySelector('i').className = type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
        });
    }
}

function closeEditPasswordModal() {
    const modal = document.getElementById('edit-password-modal');
    if (modal) modal.remove();
}

window.closeEditPasswordModal = closeEditPasswordModal;

// ====== SAVE NEW PASSWORD ======
async function saveNewPassword() {
    if (!currentUser) {
        showToast('Please login to save passwords', 'error');
        return;
    }
    
    const accountName = document.getElementById('new-account-name')?.value.trim();
    const password = document.getElementById('new-password')?.value;
    
    if (!accountName) {
        showToast('Account name is required', 'error');
        return;
    }
    
    if (!password) {
        showToast('Password is required', 'error');
        return;
    }
    
    try {
        const passwordData = {
            userId: currentUser.uid,
            accountName: accountName,
            username: document.getElementById('new-username')?.value.trim() || '',
            email: document.getElementById('new-email')?.value.trim() || '',
            password: password,
            website: document.getElementById('new-website')?.value.trim() || '',
            appName: document.getElementById('new-app-name')?.value.trim() || '',
            category: document.getElementById('new-category')?.value || 'personal',
            tags: document.getElementById('new-tags')?.value.split(',').map(t => t.trim()).filter(Boolean) || [],
            notes: document.getElementById('new-notes')?.value.trim() || '',
            favorite: document.getElementById('new-favorite')?.checked || false,
            archived: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };
        
        await addDoc(collection(db, 'passwords'), passwordData);
        
        showToast('Password saved successfully!', 'success');
        closeAddPasswordModal();
        await loadVaultData();
        updatePasswordManagerUI();
        
    } catch (error) {
        console.error('Error saving password:', error);
        showToast('Failed to save password: ' + error.message, 'error');
    }
}

// ====== UPDATE PASSWORD ======
async function updatePassword(id) {
    try {
        const docRef = doc(db, 'passwords', id);
        await updateDoc(docRef, {
            accountName: document.getElementById('edit-account-name').value.trim(),
            username: document.getElementById('edit-username').value.trim(),
            email: document.getElementById('edit-email').value.trim(),
            password: document.getElementById('edit-password').value,
            website: document.getElementById('edit-website').value.trim(),
            category: document.getElementById('edit-category').value,
            tags: document.getElementById('edit-tags').value.split(',').map(t => t.trim()).filter(Boolean),
            notes: document.getElementById('edit-notes').value.trim(),
            favorite: document.getElementById('edit-favorite').checked,
            updatedAt: serverTimestamp()
        });
        
        showToast('Password updated!', 'success');
        closeEditPasswordModal();
        await loadVaultData();
        updatePasswordManagerUI();
        
    } catch (error) {
        console.error('Error updating password:', error);
        showToast('Failed to update password', 'error');
    }
}

// ====== UPDATE UI ======
function updatePasswordManagerUI() {
    const vaultTab = document.getElementById('tab-vault');
    if (vaultTab) vaultTab.innerHTML = renderVaultTab();
    
    const categoriesTab = document.getElementById('tab-categories');
    if (categoriesTab) categoriesTab.innerHTML = renderCategoriesTab();
    
    const healthTab = document.getElementById('tab-health');
    if (healthTab) healthTab.innerHTML = renderHealthTab();
    
    const notesTab = document.getElementById('tab-notes');
    if (notesTab) notesTab.innerHTML = renderNotesTab();
    
    const identityTab = document.getElementById('tab-identity');
    if (identityTab) identityTab.innerHTML = renderIdentityTab();
    
    const paymentsTab = document.getElementById('tab-payments');
    if (paymentsTab) paymentsTab.innerHTML = renderPaymentsTab();
    
    const historyTab = document.getElementById('tab-history');
    if (historyTab) historyTab.innerHTML = renderHistoryTab();
    
    attachEvents();
}

// ====== ATTACH EVENTS ======
function attachEvents() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.removeEventListener('click', handleTabClick);
        btn.addEventListener('click', handleTabClick);
    });
    
    // Vault search
    const searchInput = document.getElementById('vault-search');
    if (searchInput) {
        searchInput.removeEventListener('input', handleSearch);
        searchInput.addEventListener('input', handleSearch);
    }
    
    // Vault filter
    const filterSelect = document.getElementById('vault-filter');
    if (filterSelect) {
        filterSelect.removeEventListener('change', handleFilter);
        filterSelect.addEventListener('change', handleFilter);
    }
    
    // View toggle
    const viewToggle = document.getElementById('view-toggle');
    if (viewToggle) {
        viewToggle.removeEventListener('click', handleViewToggle);
        viewToggle.addEventListener('click', handleViewToggle);
    }
    
    // Add password button
    const addBtn = document.getElementById('add-password-btn');
    if (addBtn) {
        addBtn.removeEventListener('click', () => showAddPasswordModal());
        addBtn.addEventListener('click', () => showAddPasswordModal());
    }
    
    // Add password triggers
    document.querySelectorAll('.add-password-trigger').forEach(btn => {
        btn.removeEventListener('click', () => showAddPasswordModal());
        btn.addEventListener('click', () => showAddPasswordModal());
    });
    
    // Generate password button
    const genBtn = document.getElementById('generate-password-btn');
    if (genBtn) {
        genBtn.removeEventListener('click', handleGenerateClick);
        genBtn.addEventListener('click', handleGenerateClick);
    }
    
    // Copy password buttons
    document.querySelectorAll('.copy-password-btn').forEach(btn => {
        btn.removeEventListener('click', handleCopyPassword);
        btn.addEventListener('click', handleCopyPassword);
    });
    
    // Password actions
    document.querySelectorAll('.password-actions-btn').forEach(btn => {
        btn.removeEventListener('click', handlePasswordActions);
        btn.addEventListener('click', handlePasswordActions);
    });
    
    setupGeneratorEvents();
}

// ====== EVENT HANDLERS ======
function handleTabClick(e) {
    const btn = e.currentTarget;
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active');
        b.style.borderColor = 'transparent';
        b.style.color = 'var(--text-muted)';
    });
    btn.classList.add('active');
    btn.style.borderColor = 'var(--deep-blue)';
    btn.style.color = 'var(--deep-blue)';
    
    const tabId = btn.dataset.tab;
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.add('hidden'));
    const targetTab = document.getElementById(`tab-${tabId}`);
    if (targetTab) targetTab.classList.remove('hidden');
    
    if (tabId === 'generator') {
        setTimeout(setupGeneratorEvents, 50);
    }
}

function handleSearch(e) {
    searchQuery = e.target.value;
    updatePasswordManagerUI();
}

function handleFilter(e) {
    currentFilter = e.target.value;
    updatePasswordManagerUI();
}

function handleViewToggle() {
    currentView = currentView === 'grid' ? 'list' : 'grid';
    updatePasswordManagerUI();
}

function handleGenerateClick() {
    const genTabBtn = document.querySelector('[data-tab="generator"]');
    if (genTabBtn) genTabBtn.click();
}

function handleCopyPassword(e) {
    const password = e.currentTarget.dataset.password;
    if (password) {
        navigator.clipboard.writeText(password).then(() => {
            showToast('Password copied!', 'success');
        }).catch(() => {
            showToast('Failed to copy password', 'error');
        });
    }
}

function handlePasswordActions(e) {
    e.stopPropagation();
    const id = e.currentTarget.dataset.id;
    if (id) showPasswordActions(id);
}

// ====== GENERATOR EVENTS ======
function setupGeneratorEvents() {
    const lengthSlider = document.getElementById('password-length');
    if (lengthSlider) {
        lengthSlider.removeEventListener('input', handleLengthChange);
        lengthSlider.addEventListener('input', handleLengthChange);
    }
    
    ['include-uppercase', 'include-lowercase', 'include-numbers', 'include-symbols', 'exclude-similar', 'exclude-ambiguous'].forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            checkbox.removeEventListener('change', handleCheckboxChange);
            checkbox.addEventListener('change', handleCheckboxChange);
        }
    });
    
    const genBtn = document.getElementById('generate-password-btn-gen');
    if (genBtn) {
        genBtn.removeEventListener('click', generatePassword);
        genBtn.addEventListener('click', generatePassword);
    }
    
    const passphraseBtn = document.getElementById('generate-passphrase-btn');
    if (passphraseBtn) {
        passphraseBtn.removeEventListener('click', generatePassphrase);
        passphraseBtn.addEventListener('click', generatePassphrase);
    }
    
    const copyBtn = document.getElementById('copy-generated-btn');
    if (copyBtn) {
        copyBtn.removeEventListener('click', handleCopyGenerated);
        copyBtn.addEventListener('click', handleCopyGenerated);
    }
    
    const refreshBtn = document.getElementById('refresh-generated-btn');
    if (refreshBtn) {
        refreshBtn.removeEventListener('click', generatePassword);
        refreshBtn.addEventListener('click', generatePassword);
    }
    
    const useBtn = document.getElementById('use-generated-btn');
    if (useBtn) {
        useBtn.removeEventListener('click', handleUseGenerated);
        useBtn.addEventListener('click', handleUseGenerated);
    }
}

function handleLengthChange(e) {
    const display = document.getElementById('length-display');
    if (display) display.textContent = e.target.value;
    generatorSettings.length = parseInt(e.target.value);
}

function handleCheckboxChange(e) {
    const id = e.target.id;
    const setting = id.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    generatorSettings[setting] = e.target.checked;
}

function handleCopyGenerated() {
    const passwordEl = document.getElementById('generated-password');
    if (passwordEl && passwordEl.textContent !== 'Click Generate') {
        navigator.clipboard.writeText(passwordEl.textContent).then(() => {
            showToast('Password copied!', 'success');
        });
    } else {
        showToast('Generate a password first', 'info');
    }
}

function handleUseGenerated() {
    const passwordEl = document.getElementById('generated-password');
    if (passwordEl && passwordEl.textContent !== 'Click Generate') {
        const vaultTabBtn = document.querySelector('[data-tab="vault"]');
        if (vaultTabBtn) vaultTabBtn.click();
        setTimeout(() => showAddPasswordModal(passwordEl.textContent), 100);
    } else {
        showToast('Generate a password first', 'info');
    }
}

// ====== GENERATE PASSWORD FUNCTIONS ======
function generatePassword() {
    let charset = '';
    if (generatorSettings.includeLowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
    if (generatorSettings.includeUppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (generatorSettings.includeNumbers) charset += '0123456789';
    if (generatorSettings.includeSymbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    if (generatorSettings.excludeSimilar) charset = charset.replace(/[il1Lo0O]/g, '');
    if (generatorSettings.excludeAmbiguous) charset = charset.replace(/[{}|;:<>?]/g, '');
    
    if (!charset) {
        showToast('Please select at least one character type', 'error');
        return;
    }
    
    let password = '';
    for (let i = 0; i < generatorSettings.length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    displayGeneratedPassword(password);
}

function generatePassphrase() {
    const words = ['apple','blue','cat','dog','eagle','fish','green','happy','ice','jump','king','lion','moon','night','ocean','piano','queen','rain','star','tree','umbrella','violet','water','xenon','yellow','zebra','cloud','dream','fire','gold','heart','iron','jade','kind','love','music','nova','orange','peace','quiet'];
    const separators = ['-', '_', '.', '!', '#'];
    const numWords = Math.min(4, Math.floor(generatorSettings.length / 4));
    const selectedWords = [];
    for (let i = 0; i < numWords; i++) {
        selectedWords.push(words[Math.floor(Math.random() * words.length)]);
    }
    let password = selectedWords.join(separators[Math.floor(Math.random() * separators.length)]);
    if (generatorSettings.includeNumbers) password += Math.floor(Math.random() * 100);
    displayGeneratedPassword(password);
}

function displayGeneratedPassword(password) {
    const display = document.getElementById('generated-password');
    if (display) display.textContent = password;
    
    const strength = getPasswordStrength(password);
    const strengthLabel = document.getElementById('password-strength-label');
    const strengthBar = document.getElementById('password-strength-bar');
    const entropyLabel = document.getElementById('entropy-label');
    
    if (strengthLabel) strengthLabel.textContent = strength;
    if (strengthBar) {
        const percentage = strength === 'Strong' ? 100 : strength === 'Medium' ? 60 : 30;
        strengthBar.style.width = `${percentage}%`;
        strengthBar.style.background = strength === 'Strong' ? '#10b981' : strength === 'Medium' ? '#f59e0b' : '#ef4444';
    }
    if (entropyLabel) {
        const entropy = Math.log2(Math.pow(2, password.length));
        entropyLabel.textContent = `Entropy: ${entropy.toFixed(1)} bits`;
    }
}

// ====== SHOW PASSWORD ACTIONS ======
function showPasswordActions(id) {
    const password = vaultData.passwords.find(p => p.id === id);
    if (!password) return;
    
    document.querySelectorAll('.password-actions-dropdown').forEach(el => el.remove());
    
    const dropdown = document.createElement('div');
    dropdown.className = 'password-actions-dropdown fixed z-50 rounded-xl shadow-lg p-2 min-w-[180px]';
    dropdown.style.border = '1px solid var(--border-color)';
    dropdown.style.background = 'var(--bg-secondary)';
    
    const actions = [
        { icon: 'fa-edit', label: 'Edit', action: 'edit' },
        { icon: 'fa-copy', label: 'Copy Username', action: 'copy-username' },
        { icon: 'fa-key', label: 'Copy Password', action: 'copy-password' },
        { icon: 'fa-star', label: password.favorite ? 'Remove Favorite' : 'Add Favorite', action: 'toggle-favorite' },
        { icon: 'fa-archive', label: password.archived ? 'Restore' : 'Archive', action: 'archive' },
        { icon: 'fa-trash', label: 'Delete', action: 'delete' }
    ];
    
    actions.forEach(action => {
        const btn = document.createElement('button');
        btn.className = 'w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-primary/10 transition-all flex items-center gap-2';
        btn.style.color = 'var(--text-primary)';
        btn.innerHTML = `<i class="fas ${action.icon}" style="width: 20px;"></i> ${action.label}`;
        btn.addEventListener('click', () => {
            dropdown.remove();
            handlePasswordAction(id, action.action);
        });
        dropdown.appendChild(btn);
    });
    
    document.body.appendChild(dropdown);
    
    const rect = event.target.getBoundingClientRect();
    dropdown.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 200)}px`;
    dropdown.style.left = `${Math.min(rect.left, window.innerWidth - 200)}px`;
    
    setTimeout(() => {
        document.addEventListener('click', function closeDropdown(e) {
            if (!dropdown.contains(e.target)) {
                dropdown.remove();
                document.removeEventListener('click', closeDropdown);
            }
        });
    }, 10);
}

// ====== HANDLE PASSWORD ACTION ======
async function handlePasswordAction(id, action) {
    const password = vaultData.passwords.find(p => p.id === id);
    if (!password) return;
    
    switch (action) {
        case 'edit':
            showEditPasswordModal(id);
            break;
        case 'copy-username':
            if (password.username) {
                navigator.clipboard.writeText(password.username).then(() => showToast('Username copied!', 'success'));
            } else showToast('No username to copy', 'info');
            break;
        case 'copy-password':
            navigator.clipboard.writeText(password.password).then(() => showToast('Password copied!', 'success'));
            break;
        case 'toggle-favorite':
            try {
                const docRef = doc(db, 'passwords', id);
                await updateDoc(docRef, { favorite: !password.favorite, updatedAt: serverTimestamp() });
                showToast(password.favorite ? 'Removed from favorites' : 'Added to favorites', 'success');
                await loadVaultData();
                updatePasswordManagerUI();
            } catch (error) {
                showToast('Failed to update favorite', 'error');
            }
            break;
        case 'archive':
            try {
                const docRef = doc(db, 'passwords', id);
                await updateDoc(docRef, { archived: !password.archived, updatedAt: serverTimestamp() });
                showToast(password.archived ? 'Password restored' : 'Password archived', 'success');
                await loadVaultData();
                updatePasswordManagerUI();
            } catch (error) {
                showToast('Failed to archive password', 'error');
            }
            break;
        case 'delete':
            if (confirm('Are you sure you want to delete this password?')) {
                try {
                    await deleteDoc(doc(db, 'passwords', id));
                    showToast('Password deleted', 'success');
                    await loadVaultData();
                    updatePasswordManagerUI();
                } catch (error) {
                    showToast('Failed to delete password', 'error');
                }
            }
            break;
    }
}

// ====== HELPER FUNCTIONS ======
function getVaultStats() {
    const passwords = vaultData.passwords || [];
    const total = passwords.length;
    const favorites = passwords.filter(p => p.favorite).length;
    
    let weak = 0, medium = 0, strong = 0, reused = 0;
    const passwordCounts = {};
    
    passwords.forEach(p => {
        if (p.password) {
            const strength = getPasswordStrength(p.password);
            if (strength === 'Weak') weak++;
            else if (strength === 'Medium') medium++;
            else strong++;
            
            const normalized = p.password;
            if (passwordCounts[normalized]) passwordCounts[normalized]++;
            else passwordCounts[normalized] = 1;
        }
    });
    
    reused = Object.values(passwordCounts).filter(count => count > 1).length;
    
    const expired = passwords.filter(p => {
        if (!p.createdAt) return false;
        const created = p.createdAt.seconds ? new Date(p.createdAt.seconds * 1000) : new Date(p.createdAt);
        return (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24) > 90;
    }).length;
    
    const duplicates = Object.values(passwordCounts).filter(count => count > 1).reduce((sum, count) => sum + count - 1, 0);
    
    const totalWeight = total > 0 ? total : 1;
    const securityScore = Math.min(Math.round(((strong * 2 + medium) / (totalWeight * 2)) * 100), 100);
    
    return { total, favorites, weak, medium, strong, reused, duplicates, expired, securityScore };
}

function getPasswordStrength(password) {
    if (!password) return 'Weak';
    let score = 0;
    if (password.length >= 16) score += 3;
    else if (password.length >= 12) score += 2;
    else if (password.length >= 8) score += 1;
    if (/[a-z]/.test(password)) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^a-zA-Z0-9]/.test(password)) score += 1;
    if (/(.)\1{2,}/.test(password)) score -= 1;
    if (/^(password|123456|qwerty|admin|letmein)/i.test(password)) score -= 2;
    if (score >= 6) return 'Strong';
    if (score >= 4) return 'Medium';
    return 'Weak';
}

function getFilteredPasswords() {
    let passwords = vaultData.passwords || [];
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        passwords = passwords.filter(p => 
            p.accountName.toLowerCase().includes(query) ||
            (p.username && p.username.toLowerCase().includes(query)) ||
            (p.email && p.email.toLowerCase().includes(query)) ||
            (p.notes && p.notes.toLowerCase().includes(query))
        );
    }
    if (currentFilter !== 'all') {
        if (currentFilter === 'favorites') passwords = passwords.filter(p => p.favorite);
        else if (currentFilter === 'weak') passwords = passwords.filter(p => getPasswordStrength(p.password) === 'Weak');
        else if (currentFilter === 'strong') passwords = passwords.filter(p => getPasswordStrength(p.password) === 'Strong');
        else if (currentFilter === 'expired') {
            passwords = passwords.filter(p => {
                if (!p.createdAt) return false;
                const created = p.createdAt.seconds ? new Date(p.createdAt.seconds * 1000) : new Date(p.createdAt);
                return (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24) > 90;
            });
        }
    }
    return passwords;
}

function getSecurityIssues() {
    const passwords = vaultData.passwords || [];
    const weak = passwords.filter(p => p.password && getPasswordStrength(p.password) === 'Weak');
    
    const passwordMap = {};
    passwords.forEach(p => {
        if (p.password) {
            if (passwordMap[p.password]) passwordMap[p.password].push(p);
            else passwordMap[p.password] = [p];
        }
    });
    const reused = [];
    Object.values(passwordMap).forEach(group => {
        if (group.length > 1) reused.push(...group);
    });
    
    const old = passwords.filter(p => {
        if (!p.createdAt) return false;
        const created = p.createdAt.seconds ? new Date(p.createdAt.seconds * 1000) : new Date(p.createdAt);
        return (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24) > 180;
    });
    
    const missing = passwords.filter(p => !p.password || p.password.length === 0);
    return { weak, reused, old, missing };
}

function getRecommendations() {
    const issues = getSecurityIssues();
    const recommendations = [];
    if (issues.weak.length > 0) {
        recommendations.push({ icon: 'lock', color: '#ef4444', title: 'Weak passwords detected', description: `${issues.weak.length} password(s) need to be strengthened.` });
    }
    if (issues.reused.length > 0) {
        recommendations.push({ icon: 'copy', color: '#f59e0b', title: 'Reused passwords found', description: `${issues.reused.length} password(s) are reused.` });
    }
    if (issues.old.length > 0) {
        recommendations.push({ icon: 'clock', color: '#dc2626', title: 'Old passwords need updating', description: `${issues.old.length} password(s) are over 6 months old.` });
    }
    if (recommendations.length === 0) {
        recommendations.push({ icon: 'check-circle', color: '#10b981', title: 'Great security!', description: 'All your passwords are strong and up to date.' });
    }
    return recommendations;
}

// ====== RENDER FUNCTIONS (keep all render functions from previous version) ======
function renderVaultTab() {
    const filtered = getFilteredPasswords();
    return `
        <div class="flex flex-col sm:flex-row gap-3 mb-4">
            <div class="flex-1 relative">
                <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm"></i>
                <input id="vault-search" type="text" class="form-input pl-10" placeholder="Search passwords..." value="${escapeHtml(searchQuery)}">
            </div>
            <div class="flex gap-2">
                <select id="vault-filter" class="form-input">
                    <option value="all" ${currentFilter === 'all' ? 'selected' : ''}>All</option>
                    <option value="favorites" ${currentFilter === 'favorites' ? 'selected' : ''}>Favorites</option>
                    <option value="weak" ${currentFilter === 'weak' ? 'selected' : ''}>Weak</option>
                    <option value="strong" ${currentFilter === 'strong' ? 'selected' : ''}>Strong</option>
                    <option value="expired" ${currentFilter === 'expired' ? 'selected' : ''}>Expired</option>
                </select>
                <button id="view-toggle" class="px-3 py-2 rounded-lg transition-all" style="background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary);">
                    <i class="fas ${currentView === 'grid' ? 'fa-list' : 'fa-th'}"></i>
                </button>
            </div>
        </div>
        <div class="${currentView === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-3'}">
            ${filtered.length === 0 ? `
                <div class="col-span-full text-center py-12">
                    <i class="fas fa-key text-5xl text-muted mb-4"></i>
                    <h3 class="text-lg font-semibold" style="color: var(--text-primary);">No passwords found</h3>
                    <p class="text-muted text-sm">Add your first password to get started</p>
                    <button class="mt-4 px-4 py-2 rounded-lg text-sm font-semibold add-password-trigger" style="background: var(--deep-blue); color: white;">
                        <i class="fas fa-plus mr-2"></i>Add Password
                    </button>
                </div>
            ` : filtered.map(p => renderPasswordCard(p)).join('')}
        </div>
    `;
}

function renderPasswordCard(password) {
    const strength = getPasswordStrength(password.password);
    const strengthColor = strength === 'Strong' ? '#10b981' : strength === 'Medium' ? '#f59e0b' : '#ef4444';
    const category = vaultData.categories.find(c => c.id === password.category);
    
    return `
        <div class="glass-card rounded-xl p-4 transition-all hover:shadow-lg group ${password.archived ? 'opacity-60' : ''}" style="border: 1px solid var(--border-color);">
            <div class="flex items-start justify-between">
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                        <div class="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style="background: ${category?.color || '#6366f1'}20; color: ${category?.color || '#6366f1'};">
                            <i class="fas ${category?.icon || 'fa-key'}"></i>
                        </div>
                        <div>
                            <h4 class="font-semibold truncate" style="color: var(--text-primary);">${escapeHtml(password.accountName)}</h4>
                            <p class="text-xs text-muted truncate">${escapeHtml(password.username || password.email || 'No username')}</p>
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-1">
                    ${password.favorite ? `<i class="fas fa-star text-yellow-500 text-sm"></i>` : ''}
                    <button class="p-1 rounded hover:bg-primary/10 transition-all password-actions-btn" data-id="${password.id}">
                        <i class="fas fa-ellipsis-v text-muted text-sm"></i>
                    </button>
                </div>
            </div>
            <div class="mt-3 flex items-center gap-2">
                <div class="flex-1">
                    <div class="flex items-center gap-2 bg-primary/5 rounded-lg px-3 py-1.5" style="background: var(--bg-primary);">
                        <span class="text-sm font-mono flex-1 truncate" style="color: var(--text-primary);">${'•'.repeat(Math.min(password.password.length, 20))}</span>
                        <button class="copy-password-btn text-muted hover:text-primary transition-colors" data-password="${escapeHtml(password.password)}">
                            <i class="fas fa-copy text-xs"></i>
                        </button>
                    </div>
                </div>
                <span class="text-[10px] px-2 py-0.5 rounded-full font-medium" style="background: ${strengthColor}20; color: ${strengthColor};">${strength}</span>
            </div>
            <div class="mt-2 flex items-center justify-between text-xs text-muted">
                <span><i class="far fa-calendar-alt mr-1"></i>${formatDate(password.createdAt)}</span>
                ${password.website ? `<a href="${escapeHtml(password.website)}" target="_blank" class="hover:text-primary transition-colors"><i class="fas fa-external-link-alt"></i></a>` : ''}
            </div>
        </div>
    `;
}

function renderCategoriesTab() {
    return `
        <div class="flex justify-between items-center mb-4">
            <h3 class="font-semibold" style="color: var(--text-primary);">Manage Categories</h3>
            <button id="add-category-btn" class="px-3 py-1.5 rounded-lg text-sm font-semibold" style="background: var(--deep-blue); color: white;">
                <i class="fas fa-plus mr-1"></i>New Category
            </button>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            ${vaultData.categories.map(cat => `
                <div class="glass-card rounded-xl p-3 transition-all hover:shadow-lg" style="border: 1px solid ${cat.color}30;">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: ${cat.color}20; color: ${cat.color};">
                                <i class="fas ${cat.icon}"></i>
                            </div>
                            <span class="text-sm font-medium" style="color: var(--text-primary);">${cat.name}</span>
                        </div>
                        <div class="flex items-center gap-1">
                            <span class="text-xs text-muted">${vaultData.passwords.filter(p => p.category === cat.id).length}</span>
                            <button class="category-actions-btn p-1 hover:bg-primary/10 rounded transition-all" data-id="${cat.id}">
                                <i class="fas fa-ellipsis-v text-muted text-xs"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderGeneratorTab() {
    return `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
                <h3 class="font-semibold mb-4" style="color: var(--text-primary);">Generator Settings</h3>
                <div class="space-y-4">
                    <div>
                        <label class="text-sm font-medium" style="color: var(--text-primary);">Password Length: <span id="length-display">${generatorSettings.length}</span></label>
                        <input type="range" id="password-length" min="4" max="64" value="${generatorSettings.length}" class="w-full">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <label class="flex items-center gap-2 text-sm" style="color: var(--text-primary);">
                            <input type="checkbox" id="include-uppercase" ${generatorSettings.includeUppercase ? 'checked' : ''}> Uppercase (A-Z)
                        </label>
                        <label class="flex items-center gap-2 text-sm" style="color: var(--text-primary);">
                            <input type="checkbox" id="include-lowercase" ${generatorSettings.includeLowercase ? 'checked' : ''}> Lowercase (a-z)
                        </label>
                        <label class="flex items-center gap-2 text-sm" style="color: var(--text-primary);">
                            <input type="checkbox" id="include-numbers" ${generatorSettings.includeNumbers ? 'checked' : ''}> Numbers (0-9)
                        </label>
                        <label class="flex items-center gap-2 text-sm" style="color: var(--text-primary);">
                            <input type="checkbox" id="include-symbols" ${generatorSettings.includeSymbols ? 'checked' : ''}> Symbols (!@#)
                        </label>
                        <label class="flex items-center gap-2 text-sm" style="color: var(--text-primary);">
                            <input type="checkbox" id="exclude-similar" ${generatorSettings.excludeSimilar ? 'checked' : ''}> Exclude Similar
                        </label>
                        <label class="flex items-center gap-2 text-sm" style="color: var(--text-primary);">
                            <input type="checkbox" id="exclude-ambiguous" ${generatorSettings.excludeAmbiguous ? 'checked' : ''}> Exclude Ambiguous
                        </label>
                    </div>
                    <div class="flex gap-3">
                        <button id="generate-password-btn-gen" class="px-4 py-2 rounded-lg font-semibold flex-1" style="background: var(--deep-blue); color: white;">
                            <i class="fas fa-dice mr-2"></i>Generate Password
                        </button>
                        <button id="generate-passphrase-btn" class="px-4 py-2 rounded-lg font-semibold" style="background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary);">
                            <i class="fas fa-words mr-2"></i>Passphrase
                        </button>
                    </div>
                </div>
            </div>
            <div>
                <h3 class="font-semibold mb-4" style="color: var(--text-primary);">Generated Password</h3>
                <div class="glass-card rounded-xl p-5" style="border: 1px solid var(--border-color);">
                    <div class="flex items-center gap-3">
                        <div class="flex-1">
                            <div class="text-lg font-mono break-all" id="generated-password" style="color: var(--text-primary);">Click Generate</div>
                        </div>
                        <button id="copy-generated-btn" class="p-2 rounded-lg transition-all" style="background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary);">
                            <i class="fas fa-copy"></i>
                        </button>
                        <button id="refresh-generated-btn" class="p-2 rounded-lg transition-all" style="background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary);">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                    </div>
                    <div class="mt-4">
                        <div class="flex justify-between text-sm mb-1">
                            <span style="color: var(--text-primary);">Strength</span>
                            <span id="password-strength-label" style="color: var(--text-muted);">-</span>
                        </div>
                        <div class="w-full h-2 rounded-full overflow-hidden" style="background: var(--bg-primary);">
                            <div id="password-strength-bar" class="h-full rounded-full transition-all duration-500" style="width: 0%; background: #ef4444;"></div>
                        </div>
                    </div>
                    <div class="mt-4 text-sm text-muted">
                        <span id="entropy-label">Entropy: - bits</span>
                    </div>
                </div>
                <button id="use-generated-btn" class="mt-3 w-full px-4 py-2 rounded-lg font-semibold" style="background: var(--emerald); color: white;">
                    <i class="fas fa-check mr-2"></i>Use This Password
                </button>
            </div>
        </div>
    `;
}

function renderHealthTab() {
    const issues = getSecurityIssues();
    return `
        <div class="space-y-4">
            <h3 class="font-semibold" style="color: var(--text-primary);">Security Analysis</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="glass-card rounded-xl p-4" style="border: 1px solid var(--border-color);">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full flex items-center justify-center" style="background: #ef444420; color: #ef4444;">
                            <i class="fas fa-exclamation-triangle"></i>
                        </div>
                        <div>
                            <div class="text-sm font-semibold" style="color: var(--text-primary);">Weak Passwords</div>
                            <div class="text-2xl font-bold" style="color: #ef4444;">${issues.weak.length}</div>
                        </div>
                    </div>
                    ${issues.weak.length > 0 ? `
                        <div class="mt-2 text-xs text-muted">${issues.weak.map(p => escapeHtml(p.accountName)).join(', ')}</div>
                    ` : '<div class="mt-2 text-xs text-muted">All passwords are strong!</div>'}
                </div>
                <div class="glass-card rounded-xl p-4" style="border: 1px solid var(--border-color);">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full flex items-center justify-center" style="background: #f59e0b20; color: #f59e0b;">
                            <i class="fas fa-copy"></i>
                        </div>
                        <div>
                            <div class="text-sm font-semibold" style="color: var(--text-primary);">Reused Passwords</div>
                            <div class="text-2xl font-bold" style="color: #f59e0b;">${issues.reused.length}</div>
                        </div>
                    </div>
                    ${issues.reused.length > 0 ? `
                        <div class="mt-2 text-xs text-muted">${issues.reused.map(p => escapeHtml(p.accountName)).join(', ')}</div>
                    ` : '<div class="mt-2 text-xs text-muted">No reused passwords found!</div>'}
                </div>
                <div class="glass-card rounded-xl p-4" style="border: 1px solid var(--border-color);">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full flex items-center justify-center" style="background: #dc262620; color: #dc2626;">
                            <i class="fas fa-clock"></i>
                        </div>
                        <div>
                            <div class="text-sm font-semibold" style="color: var(--text-primary);">Expired/Old Passwords</div>
                            <div class="text-2xl font-bold" style="color: #dc2626;">${issues.old.length}</div>
                        </div>
                    </div>
                    ${issues.old.length > 0 ? `
                        <div class="mt-2 text-xs text-muted">${issues.old.map(p => escapeHtml(p.accountName)).join(', ')}</div>
                    ` : '<div class="mt-2 text-xs text-muted">All passwords are up to date!</div>'}
                </div>
                <div class="glass-card rounded-xl p-4" style="border: 1px solid var(--border-color);">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full flex items-center justify-center" style="background: #10b98120; color: #10b981;">
                            <i class="fas fa-shield-alt"></i>
                        </div>
                        <div>
                            <div class="text-sm font-semibold" style="color: var(--text-primary);">Missing Passwords</div>
                            <div class="text-2xl font-bold" style="color: #10b981;">${issues.missing.length}</div>
                        </div>
                    </div>
                    ${issues.missing.length > 0 ? `
                        <div class="mt-2 text-xs text-muted">${issues.missing.map(p => escapeHtml(p.accountName)).join(', ')}</div>
                    ` : '<div class="mt-2 text-xs text-muted">All entries have passwords!</div>'}
                </div>
            </div>
            <div class="glass-card rounded-xl p-4" style="border: 1px solid var(--border-color);">
                <h4 class="font-semibold mb-3" style="color: var(--text-primary);"><i class="fas fa-lightbulb mr-2" style="color: #f59e0b;"></i>Recommendations</h4>
                <div class="space-y-2">
                    ${getRecommendations().map(rec => `
                        <div class="flex items-start gap-3 p-2 rounded-lg" style="background: var(--bg-primary);">
                            <i class="fas fa-${rec.icon} mt-1" style="color: ${rec.color};"></i>
                            <div>
                                <div class="text-sm font-medium" style="color: var(--text-primary);">${rec.title}</div>
                                <div class="text-xs text-muted">${rec.description}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

function renderNotesTab() {
    const notes = vaultData.secureNotes || [];
    return `
        <div class="flex justify-between items-center mb-4">
            <h3 class="font-semibold" style="color: var(--text-primary);">Secure Notes</h3>
            <button id="add-note-btn" class="px-3 py-1.5 rounded-lg text-sm font-semibold" style="background: var(--deep-blue); color: white;">
                <i class="fas fa-plus mr-1"></i>New Note
            </button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${notes.length === 0 ? `
                <div class="col-span-full text-center py-12">
                    <i class="fas fa-sticky-note text-5xl text-muted mb-4"></i>
                    <h3 class="text-lg font-semibold" style="color: var(--text-primary);">No secure notes</h3>
                    <p class="text-muted text-sm">Add your first secure note</p>
                </div>
            ` : notes.map(note => `
                <div class="glass-card rounded-xl p-4" style="border: 1px solid var(--border-color);">
                    <div class="flex items-start justify-between">
                        <div>
                            <h4 class="font-semibold" style="color: var(--text-primary);">${escapeHtml(note.title)}</h4>
                            <p class="text-sm text-muted mt-1 line-clamp-3">${escapeHtml(note.content)}</p>
                        </div>
                        ${note.favorite ? `<i class="fas fa-star text-yellow-500"></i>` : ''}
                    </div>
                    <div class="mt-2 flex items-center gap-2 text-xs text-muted">
                        <span><i class="far fa-calendar-alt mr-1"></i>${formatDate(note.createdAt)}</span>
                        ${note.category ? `<span class="px-2 py-0.5 rounded-full" style="background: var(--bg-primary);">${escapeHtml(note.category)}</span>` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderIdentityTab() {
    const identities = vaultData.identities || [];
    return `
        <div class="flex justify-between items-center mb-4">
            <h3 class="font-semibold" style="color: var(--text-primary);">Identity Vault</h3>
            <button id="add-identity-btn" class="px-3 py-1.5 rounded-lg text-sm font-semibold" style="background: var(--deep-blue); color: white;">
                <i class="fas fa-plus mr-1"></i>New Identity
            </button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${identities.length === 0 ? `
                <div class="col-span-full text-center py-12">
                    <i class="fas fa-id-card text-5xl text-muted mb-4"></i>
                    <h3 class="text-lg font-semibold" style="color: var(--text-primary);">No identities saved</h3>
                    <p class="text-muted text-sm">Add your personal identity information</p>
                </div>
            ` : identities.map(id => `
                <div class="glass-card rounded-xl p-4" style="border: 1px solid var(--border-color);">
                    <div class="flex items-start justify-between">
                        <div>
                            <h4 class="font-semibold" style="color: var(--text-primary);">${escapeHtml(id.fullName)}</h4>
                            <p class="text-sm text-muted">${escapeHtml(id.nationalId || 'No ID')}</p>
                        </div>
                        <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <i class="fas fa-user text-sm" style="color: var(--deep-blue);"></i>
                        </div>
                    </div>
                    <div class="mt-2 grid grid-cols-2 gap-1 text-xs text-muted">
                        <div><span class="font-medium">DOB:</span> ${escapeHtml(id.dob || 'N/A')}</div>
                        <div><span class="font-medium">Blood:</span> ${escapeHtml(id.bloodGroup || 'N/A')}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderPaymentsTab() {
    const cards = vaultData.cards || [];
    return `
        <div class="flex justify-between items-center mb-4">
            <h3 class="font-semibold" style="color: var(--text-primary);">Payment & Banking</h3>
            <button id="add-card-btn" class="px-3 py-1.5 rounded-lg text-sm font-semibold" style="background: var(--deep-blue); color: white;">
                <i class="fas fa-plus mr-1"></i>New Card
            </button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${cards.length === 0 ? `
                <div class="col-span-full text-center py-12">
                    <i class="fas fa-credit-card text-5xl text-muted mb-4"></i>
                    <h3 class="text-lg font-semibold" style="color: var(--text-primary);">No cards saved</h3>
                    <p class="text-muted text-sm">Add your payment cards</p>
                </div>
            ` : cards.map(card => `
                <div class="glass-card rounded-xl p-4" style="border: 1px solid var(--border-color);">
                    <div class="flex items-start justify-between">
                        <div>
                            <h4 class="font-semibold" style="color: var(--text-primary);">${escapeHtml(card.cardHolder)}</h4>
                            <p class="text-sm font-mono text-muted">•••• ${escapeHtml(card.cardNumber.slice(-4))}</p>
                        </div>
                        <div class="text-sm font-semibold" style="color: var(--text-primary);">${escapeHtml(card.cardType || 'Card')}</div>
                    </div>
                    <div class="mt-2 flex items-center gap-4 text-xs text-muted">
                        <span>Exp: ${escapeHtml(card.expiry)}</span>
                        <span>${escapeHtml(card.bankName || 'N/A')}</span>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderHistoryTab() {
    const history = vaultData.history || [];
    return `
        <div>
            <h3 class="font-semibold mb-4" style="color: var(--text-primary);">Password History</h3>
            <div class="space-y-2">
                ${history.length === 0 ? `
                    <div class="text-center py-12">
                        <i class="fas fa-history text-5xl text-muted mb-4"></i>
                        <h3 class="text-lg font-semibold" style="color: var(--text-primary);">No history</h3>
                        <p class="text-muted text-sm">Password changes will appear here</p>
                    </div>
                ` : history.map(entry => `
                    <div class="glass-card rounded-xl p-3" style="border: 1px solid var(--border-color);">
                        <div class="flex items-center justify-between">
                            <div>
                                <div class="font-medium" style="color: var(--text-primary);">${escapeHtml(entry.accountName)}</div>
                                <div class="text-xs text-muted">${escapeHtml(entry.action)}</div>
                            </div>
                            <div class="text-xs text-muted">${formatDate(entry.timestamp)}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// ====== EXPORT FUNCTIONS ======
export function setupPasswordManagerEvents() {
    attachEvents();
}

export function closePasswordManager() {
    document.querySelectorAll('[id$="-modal"]').forEach(el => el.remove());
    document.querySelectorAll('.password-actions-dropdown').forEach(el => el.remove());
}

export async function loadPasswordManagerPage(user) {
    currentUser = user;
    const content = await renderPasswordManagerPage(user);
    return content;
}

export async function loadPasswordManagerData() {
    await loadVaultData();
    updatePasswordManagerUI();
}

// Export for main app
window.PasswordManagerApp = {
    renderPasswordManagerPage,
    loadPasswordManagerData,
    setupPasswordManagerEvents,
    closePasswordManager,
    loadPasswordManagerPage
};