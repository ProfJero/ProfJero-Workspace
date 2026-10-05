// js/pages/profile.js
import { db, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, setDoc, orderBy, limit, serverTimestamp } from '../firebase-config.js';
import { showToast, escapeHtml, formatDate, timeAgo, formatCurrency } from '../utils/helpers.js';

let currentUser = null;
let userData = null;
let activeTab = 'profile';

export async function renderProfilePage(user) {
    currentUser = user;
    
    // Load user data from Firestore
    await loadUserProfile();
    
    return `
        <div class="space-y-6 animate-fade-in-up">
            <!-- Header -->
            <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                    <h1 class="text-2xl md:text-3xl font-bold" style="color: var(--text-primary);">Profile Settings</h1>
                    <p class="text-sm md:text-base text-muted mt-1">Manage your account, preferences, and security settings</p>
                </div>
            </div>
            
            <!-- Profile Tabs -->
            <div class="flex flex-wrap gap-2 border-b border-custom pb-2">
                <button class="profile-tab px-4 py-2 rounded-lg transition-all" data-tab="profile">
                    <i class="fas fa-user mr-2"></i> Profile
                </button>
                <button class="profile-tab px-4 py-2 rounded-lg transition-all" data-tab="security">
                    <i class="fas fa-lock mr-2"></i> Security
                </button>
                <button class="profile-tab px-4 py-2 rounded-lg transition-all" data-tab="preferences">
                    <i class="fas fa-cog mr-2"></i> Preferences
                </button>
                <button class="profile-tab px-4 py-2 rounded-lg transition-all" data-tab="activity">
                    <i class="fas fa-history mr-2"></i> Activity Log
                </button>
                <button class="profile-tab px-4 py-2 rounded-lg transition-all" data-tab="danger">
                    <i class="fas fa-exclamation-triangle mr-2"></i> Danger Zone
                </button>
            </div>
            
            <!-- Tab Content Container -->
            <div id="profile-tab-content" class="glass-card rounded-xl p-4 md:p-6">
                <!-- Content will be loaded dynamically based on active tab -->
                <div class="text-center py-12"><i class="fas fa-spinner fa-spin mr-2"></i> Loading...</div>
            </div>
        </div>
    `;
}

export async function loadProfileData() {
    await loadUserProfile();
    setupEventListeners();
    loadTabContent('profile');
}

async function loadUserProfile() {
    try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
            userData = userDoc.data();
            // Update the avatar in the header
            updateHeaderAvatar(userData.photoURL);
        } else {
            // Create default user profile if not exists
            userData = {
                displayName: currentUser.displayName || currentUser.email.split('@')[0],
                email: currentUser.email,
                photoURL: null,
                bio: '',
                phone: '',
                location: '',
                website: '',
                company: '',
                role: 'user',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                preferences: {
                    theme: 'light',
                    notifications: true,
                    emailReminders: true,
                    language: 'en',
                    dateFormat: 'MM/DD/YYYY',
                    currency: 'GHS'
                },
                stats: {
                    totalTasks: 0,
                    completedTasks: 0,
                    totalProjects: 0,
                    totalNotes: 0,
                    memberSince: new Date()
                }
            };
            await setDoc(doc(db, 'users', currentUser.uid), userData);
        }
    } catch (error) {
        console.error('Error loading user profile:', error);
        showToast('Failed to load profile', 'error');
    }
}

// Update header avatar
function updateHeaderAvatar(photoURL) {
    const userAvatar = document.getElementById('user-avatar');
    if (userAvatar) {
        if (photoURL) {
            userAvatar.src = photoURL;
        } else {
            // Use default avatar
            userAvatar.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%230057D9'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E`;
        }
    }
}

function setupEventListeners() {
    document.querySelectorAll('.profile-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            activeTab = tabName;
            
            // Update active tab styles
            document.querySelectorAll('.profile-tab').forEach(t => {
                t.style.background = 'var(--bg-secondary)';
                t.style.color = 'var(--text-muted)';
            });
            tab.style.background = 'linear-gradient(135deg, var(--deep-blue), var(--emerald))';
            tab.style.color = 'white';
            
            loadTabContent(tabName);
        });
    });
}

async function loadTabContent(tabName) {
    const container = document.getElementById('profile-tab-content');
    if (!container) return;
    
    switch(tabName) {
        case 'profile':
            container.innerHTML = renderProfileTab();
            attachProfileHandlers();
            break;
        case 'security':
            container.innerHTML = renderSecurityTab();
            attachSecurityHandlers();
            break;
        case 'preferences':
            container.innerHTML = renderPreferencesTab();
            attachPreferencesHandlers();
            break;
        case 'activity':
            container.innerHTML = await renderActivityTab();
            break;
        case 'danger':
            container.innerHTML = renderDangerTab();
            attachDangerHandlers();
            break;
        default:
            container.innerHTML = renderProfileTab();
    }
}

function renderProfileTab() {
    const defaultAvatar = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%230057D9'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E`;
    const photoURL = userData?.photoURL || defaultAvatar;
    
    return `
        <div class="space-y-6">
            <!-- Avatar Section -->
            <div class="flex flex-col sm:flex-row items-center gap-6 pb-6 border-b border-custom">
                <div class="relative">
                    <div class="w-24 h-24 md:w-32 md:h-32 rounded-full overflow-hidden bg-gradient-to-r from-deep-blue to-emerald p-1">
                        <img id="profile-avatar" src="${photoURL}" alt="Avatar" class="w-full h-full rounded-full object-cover" 
                             onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(userData?.displayName || 'User')}&background=0057D9&color=fff&size=128'">
                    </div>
                    <button id="change-avatar-btn" class="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-deep-blue text-white flex items-center justify-center hover:scale-110 transition-transform shadow-lg">
                        <i class="fas fa-camera text-xs"></i>
                    </button>
                    <!-- Hidden file input -->
                    <input type="file" id="avatar-upload" accept="image/*" class="hidden">
                </div>
                <div class="text-center sm:text-left">
                    <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">${escapeHtml(userData?.displayName || currentUser.displayName || 'User')}</h2>
                    <p class="text-muted">${escapeHtml(currentUser.email)}</p>
                    <p class="text-xs text-muted mt-1">Member since ${formatDate(userData?.createdAt?.toDate?.() || new Date())}</p>
                </div>
            </div>
            
            <!-- Personal Information Form -->
            <form id="profile-form" class="space-y-4">
                <h3 class="text-lg font-semibold" style="color: var(--text-primary);">
                    <i class="fas fa-id-card mr-2" style="color: var(--deep-blue);"></i>Personal Information
                </h3>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Full Name</label>
                        <input type="text" name="displayName" value="${escapeHtml(userData?.displayName || currentUser.displayName || '')}" 
                               class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue transition-all"
                               style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Email Address</label>
                        <input type="email" value="${escapeHtml(currentUser.email)}" disabled 
                               class="w-full px-3 md:px-4 py-2 border rounded-lg opacity-70 cursor-not-allowed"
                               style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-muted);">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Phone Number</label>
                        <input type="tel" name="phone" value="${escapeHtml(userData?.phone || '')}" placeholder="+233 XX XXX XXXX"
                               class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue transition-all"
                               style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Location</label>
                        <input type="text" name="location" value="${escapeHtml(userData?.location || '')}" placeholder="City, Country"
                               class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue transition-all"
                               style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Company/Organization</label>
                        <input type="text" name="company" value="${escapeHtml(userData?.company || '')}" placeholder="Your company"
                               class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue transition-all"
                               style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Website</label>
                        <input type="url" name="website" value="${escapeHtml(userData?.website || '')}" placeholder="https://example.com"
                               class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue transition-all"
                               style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                    </div>
                </div>
                
                <div>
                    <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Bio</label>
                    <textarea name="bio" rows="3" placeholder="Tell us about yourself..."
                              class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue transition-all"
                              style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">${escapeHtml(userData?.bio || '')}</textarea>
                </div>
                
                <div class="flex justify-end pt-4">
                    <button type="submit" class="px-6 py-2 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                        <i class="fas fa-save mr-1"></i> Save Changes
                    </button>
                </div>
            </form>
            
            <!-- Account Statistics -->
            <div class="pt-6 border-t border-custom">
                <h3 class="text-lg font-semibold mb-4" style="color: var(--text-primary);">
                    <i class="fas fa-chart-line mr-2" style="color: var(--deep-blue);"></i>Account Statistics
                </h3>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div class="glass-card p-3 rounded-xl text-center">
                        <div class="text-2xl font-bold" id="stat-tasks" style="color: var(--deep-blue);">0</div>
                        <div class="text-xs text-muted">Total Tasks</div>
                    </div>
                    <div class="glass-card p-3 rounded-xl text-center">
                        <div class="text-2xl font-bold" id="stat-projects" style="color: var(--emerald);">0</div>
                        <div class="text-xs text-muted">Projects</div>
                    </div>
                    <div class="glass-card p-3 rounded-xl text-center">
                        <div class="text-2xl font-bold" id="stat-notes" style="color: var(--gold);">0</div>
                        <div class="text-xs text-muted">Notes</div>
                    </div>
                    <div class="glass-card p-3 rounded-xl text-center">
                        <div class="text-2xl font-bold" id="stat-completion" style="color: #8b5cf6;">0%</div>
                        <div class="text-xs text-muted">Completion Rate</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderSecurityTab() {
    return `
        <div class="space-y-6">
            <!-- Change Password -->
            <div>
                <h3 class="text-lg font-semibold mb-4" style="color: var(--text-primary);">
                    <i class="fas fa-key mr-2" style="color: var(--deep-blue);"></i>Change Password
                </h3>
                <form id="password-form" class="space-y-4 max-w-md">
                    <div>
                        <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Current Password</label>
                        <div class="relative">
                            <input type="password" id="current-password" required 
                                   class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            <button type="button" class="toggle-password absolute right-3 top-1/2 transform -translate-y-1/2 text-muted hover:text-primary">
                                <i class="fas fa-eye-slash"></i>
                            </button>
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">New Password</label>
                        <div class="relative">
                            <input type="password" id="new-password" required 
                                   class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            <button type="button" class="toggle-password absolute right-3 top-1/2 transform -translate-y-1/2 text-muted hover:text-primary">
                                <i class="fas fa-eye-slash"></i>
                            </button>
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Confirm New Password</label>
                        <div class="relative">
                            <input type="password" id="confirm-password" required 
                                   class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue"
                                   style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            <button type="button" class="toggle-password absolute right-3 top-1/2 transform -translate-y-1/2 text-muted hover:text-primary">
                                <i class="fas fa-eye-slash"></i>
                            </button>
                        </div>
                        <div id="password-match-indicator" class="text-xs mt-1 hidden"></div>
                    </div>
                    <div>
                        <button type="submit" class="px-6 py-2 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                            <i class="fas fa-save mr-1"></i> Update Password
                        </button>
                    </div>
                </form>
            </div>
            
            <!-- Session Management -->
            <div class="pt-6 border-t border-custom">
                <h3 class="text-lg font-semibold mb-4" style="color: var(--text-primary);">
                    <i class="fas fa-laptop mr-2" style="color: var(--deep-blue);"></i>Active Sessions
                </h3>
                <div class="space-y-3">
                    <div class="flex items-center justify-between p-3 rounded-lg" style="background: var(--bg-primary);">
                        <div class="flex items-center gap-3">
                            <i class="fas fa-laptop-code text-xl text-muted"></i>
                            <div>
                                <p class="font-semibold" style="color: var(--text-primary);">Current Session</p>
                                <p class="text-xs text-muted">Browser - ${new Date().toLocaleString()}</p>
                            </div>
                        </div>
                        <span class="text-xs px-2 py-0.5 rounded-full bg-green-500 text-white">Active</span>
                    </div>
                    <button id="logout-all-devices" class="w-full md:w-auto px-4 py-2 rounded-lg text-sm font-semibold border border-red-500 text-red-500 hover:bg-red-50 transition">
                        <i class="fas fa-sign-out-alt mr-1"></i> Sign Out All Other Devices
                    </button>
                </div>
            </div>
        </div>
    `;
}

function renderPreferencesTab() {
    const prefs = userData?.preferences || {
        theme: 'light',
        notifications: true,
        emailReminders: true,
        language: 'en',
        dateFormat: 'MM/DD/YYYY',
        currency: 'GHS'
    };
    
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    
    return `
        <div class="space-y-6">
            <form id="preferences-form" class="space-y-6">
                <!-- Appearance -->
                <div>
                    <h3 class="text-lg font-semibold mb-4" style="color: var(--text-primary);">
                        <i class="fas fa-palette mr-2" style="color: var(--deep-blue);"></i>Appearance
                    </h3>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Theme</label>
                            <div class="grid grid-cols-3 gap-3">
                                <button type="button" data-theme-value="light" class="theme-option flex items-center justify-center p-3 rounded-lg border transition-all ${currentTheme === 'light' ? 'border-deep-blue bg-deep-blue/10' : 'border-custom'}" style="border-color: var(--border-color);">
                                    <i class="fas fa-sun mr-2"></i> Light
                                </button>
                                <button type="button" data-theme-value="dark" class="theme-option flex items-center justify-center p-3 rounded-lg border transition-all ${currentTheme === 'dark' ? 'border-deep-blue bg-deep-blue/10' : 'border-custom'}" style="border-color: var(--border-color);">
                                    <i class="fas fa-moon mr-2"></i> Dark
                                </button>
                                <button type="button" data-theme-value="system" class="theme-option flex items-center justify-center p-3 rounded-lg border transition-all ${currentTheme === 'system' ? 'border-deep-blue bg-deep-blue/10' : 'border-custom'}" style="border-color: var(--border-color);">
                                    <i class="fas fa-desktop mr-2"></i> System
                                </button>
                            </div>
                            <input type="hidden" name="theme" id="theme-input" value="${prefs.theme}">
                        </div>
                    </div>
                </div>
                
                <!-- Notifications -->
                <div class="pt-6 border-t border-custom">
                    <h3 class="text-lg font-semibold mb-4" style="color: var(--text-primary);">
                        <i class="fas fa-bell mr-2" style="color: var(--deep-blue);"></i>Notifications
                    </h3>
                    <div class="space-y-3">
                        <div class="flex items-center justify-between p-3 rounded-lg" style="background: var(--bg-primary);">
                            <div>
                                <p class="font-semibold" style="color: var(--text-primary);">Push Notifications</p>
                                <p class="text-sm text-muted">Receive notifications about your tasks and reminders</p>
                            </div>
                            <label class="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" name="notifications" class="sr-only peer notification-toggle" ${prefs.notifications ? 'checked' : ''}>
                                <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-deep-blue"></div>
                            </label>
                        </div>
                        <div class="flex items-center justify-between p-3 rounded-lg" style="background: var(--bg-primary);">
                            <div>
                                <p class="font-semibold" style="color: var(--text-primary);">Email Reminders</p>
                                <p class="text-sm text-muted">Receive email reminders for upcoming deadlines</p>
                            </div>
                            <label class="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" name="emailReminders" class="sr-only peer email-toggle" ${prefs.emailReminders ? 'checked' : ''}>
                                <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-deep-blue"></div>
                            </label>
                        </div>
                    </div>
                </div>
                
                <!-- Regional Settings -->
                <div class="pt-6 border-t border-custom">
                    <h3 class="text-lg font-semibold mb-4" style="color: var(--text-primary);">
                        <i class="fas fa-globe mr-2" style="color: var(--deep-blue);"></i>Regional Settings
                    </h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Language</label>
                            <select name="language" class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <option value="en" ${prefs.language === 'en' ? 'selected' : ''}>English</option>
                                <option value="es" ${prefs.language === 'es' ? 'selected' : ''}>Español</option>
                                <option value="fr" ${prefs.language === 'fr' ? 'selected' : ''}>Français</option>
                                <option value="de" ${prefs.language === 'de' ? 'selected' : ''}>Deutsch</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Date Format</label>
                            <select name="dateFormat" class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <option value="MM/DD/YYYY" ${prefs.dateFormat === 'MM/DD/YYYY' ? 'selected' : ''}>MM/DD/YYYY</option>
                                <option value="DD/MM/YYYY" ${prefs.dateFormat === 'DD/MM/YYYY' ? 'selected' : ''}>DD/MM/YYYY</option>
                                <option value="YYYY-MM-DD" ${prefs.dateFormat === 'YYYY-MM-DD' ? 'selected' : ''}>YYYY-MM-DD</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Currency</label>
                            <select name="currency" class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <option value="GHS" ${prefs.currency === 'GHS' ? 'selected' : ''}>₵ Ghanaian Cedi (GHS)</option>
                                <option value="USD" ${prefs.currency === 'USD' ? 'selected' : ''}>$ US Dollar (USD)</option>
                                <option value="EUR" ${prefs.currency === 'EUR' ? 'selected' : ''}>€ Euro (EUR)</option>
                                <option value="GBP" ${prefs.currency === 'GBP' ? 'selected' : ''}>£ British Pound (GBP)</option>
                                <option value="NGN" ${prefs.currency === 'NGN' ? 'selected' : ''}>₦ Nigerian Naira (NGN)</option>
                            </select>
                        </div>
                    </div>
                </div>
                
                <div class="flex justify-end pt-4">
                    <button type="submit" class="px-6 py-2 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                        <i class="fas fa-save mr-1"></i> Save Preferences
                    </button>
                </div>
            </form>
        </div>
    `;
}

async function renderActivityTab() {
    let activities = [];
    
    try {
        // Get recent tasks
        const tasksQuery = query(collection(db, 'tasks'), where('userId', '==', currentUser.uid), orderBy('updatedAt', 'desc'), limit(10));
        const tasksSnap = await getDocs(tasksQuery);
        tasksSnap.forEach(doc => {
            const data = doc.data();
            if (data.updatedAt) {
                activities.push({
                    type: 'task',
                    title: data.title,
                    action: data.status === 'done' ? 'completed' : 'updated',
                    date: data.updatedAt?.toDate?.() || new Date(),
                    icon: 'fa-tasks',
                    color: '#10b981'
                });
            }
        });
        
        // Get recent notes
        const notesQuery = query(collection(db, 'notes'), where('userId', '==', currentUser.uid), orderBy('updatedAt', 'desc'), limit(10));
        const notesSnap = await getDocs(notesQuery);
        notesSnap.forEach(doc => {
            const data = doc.data();
            if (data.updatedAt) {
                activities.push({
                    type: 'note',
                    title: data.title,
                    action: 'updated',
                    date: data.updatedAt?.toDate?.() || new Date(),
                    icon: 'fa-pen',
                    color: '#8b5cf6'
                });
            }
        });
        
        // Get recent projects
        const projectsQuery = query(collection(db, 'projects'), where('userId', '==', currentUser.uid), orderBy('updatedAt', 'desc'), limit(10));
        const projectsSnap = await getDocs(projectsQuery);
        projectsSnap.forEach(doc => {
            const data = doc.data();
            if (data.updatedAt) {
                activities.push({
                    type: 'project',
                    title: data.name,
                    action: 'updated',
                    date: data.updatedAt?.toDate?.() || new Date(),
                    icon: 'fa-folder',
                    color: '#f59e0b'
                });
            }
        });
        
        // Sort by date
        activities.sort((a, b) => b.date - a.date);
        activities = activities.slice(0, 20);
        
    } catch (error) {
        console.error('Error loading activities:', error);
    }
    
    if (activities.length === 0) {
        return `
            <div class="text-center py-12">
                <i class="fas fa-history text-5xl mb-4 text-muted"></i>
                <p class="text-muted">No recent activity found</p>
            </div>
        `;
    }
    
    return `
        <div class="space-y-3">
            <h3 class="text-lg font-semibold mb-4" style="color: var(--text-primary);">
                <i class="fas fa-history mr-2" style="color: var(--deep-blue);"></i>Recent Activity
            </h3>
            <div class="space-y-3 max-h-96 overflow-y-auto">
                ${activities.map(activity => `
                    <div class="flex items-center gap-3 p-3 rounded-lg transition-all hover:shadow-md" style="background: var(--bg-primary);">
                        <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style="background: ${activity.color}20;">
                            <i class="fas ${activity.icon}" style="color: ${activity.color};"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="font-semibold truncate" style="color: var(--text-primary);">${escapeHtml(activity.title)}</p>
                            <p class="text-xs text-muted capitalize">${activity.type} ${activity.action}</p>
                        </div>
                        <span class="text-xs text-muted flex-shrink-0">${timeAgo(activity.date)}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderDangerTab() {
    return `
        <div class="space-y-6">
            <!-- Delete Account -->
            <div class="p-4 rounded-lg" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3);">
                <h3 class="text-lg font-semibold mb-2" style="color: #ef4444;">
                    <i class="fas fa-exclamation-triangle mr-2"></i>Delete Account
                </h3>
                <p class="text-sm text-muted mb-4">Once you delete your account, there is no going back. All your data will be permanently removed.</p>
                <button id="delete-account-btn" class="px-4 py-2 rounded-lg font-semibold bg-red-500 text-white hover:bg-red-600 transition">
                    <i class="fas fa-trash mr-1"></i> Delete Account
                </button>
            </div>
            
            <!-- Export Data -->
            <div class="p-4 rounded-lg" style="background: var(--bg-primary);">
                <h3 class="text-lg font-semibold mb-2" style="color: var(--text-primary);">
                    <i class="fas fa-download mr-2"></i>Export Your Data
                </h3>
                <p class="text-sm text-muted mb-4">Download a copy of all your data in JSON format.</p>
                <button id="export-data-btn" class="px-4 py-2 rounded-lg font-semibold transition-all" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                    <i class="fas fa-download mr-1"></i> Export Data
                </button>
            </div>
            
            <!-- Clear Data -->
            <div class="p-4 rounded-lg" style="background: var(--bg-primary);">
                <h3 class="text-lg font-semibold mb-2" style="color: var(--text-primary);">
                    <i class="fas fa-eraser mr-2"></i>Clear All Data
                </h3>
                <p class="text-sm text-muted mb-4">Clear all your tasks, notes, projects, and transactions. This action cannot be undone.</p>
                <button id="clear-data-btn" class="px-4 py-2 rounded-lg font-semibold border border-yellow-500 text-yellow-500 hover:bg-yellow-50 transition">
                    <i class="fas fa-trash-alt mr-1"></i> Clear All Data
                </button>
            </div>
        </div>
    `;
}

function attachProfileHandlers() {
    // Profile form submission
    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
        profileForm.onsubmit = async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            
            const updates = {
                displayName: formData.get('displayName'),
                phone: formData.get('phone'),
                location: formData.get('location'),
                company: formData.get('company'),
                website: formData.get('website'),
                bio: formData.get('bio'),
                updatedAt: serverTimestamp()
            };
            
            try {
                await updateDoc(doc(db, 'users', currentUser.uid), updates);
                showToast('Profile updated successfully!', 'success');
                await loadUserProfile();
                loadTabContent('profile');
            } catch (error) {
                console.error('Error updating profile:', error);
                showToast('Failed to update profile', 'error');
            }
        };
    }
    
    // Change avatar button - opens file picker
    const changeAvatarBtn = document.getElementById('change-avatar-btn');
    const avatarUpload = document.getElementById('avatar-upload');
    
    if (changeAvatarBtn && avatarUpload) {
        changeAvatarBtn.onclick = () => {
            avatarUpload.click();
        };
        
        avatarUpload.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                await uploadProfileAvatar(file);
            }
        };
    }
    
    // Load statistics
    loadUserStatistics();
}

// Upload profile avatar as base64 to Firestore
async function uploadProfileAvatar(file) {
    // Check file size (max 500KB for Firestore)
    if (file.size > 500 * 1024) {
        showToast('Image too large. Maximum size is 500KB.', 'error');
        return;
    }
    
    // Check file type
    if (!file.type.startsWith('image/')) {
        showToast('Please select an image file.', 'error');
        return;
    }
    
    const submitBtn = document.getElementById('change-avatar-btn');
    const originalText = submitBtn?.innerHTML || '';
    
    try {
        // Show loading state
        if (submitBtn) {
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            submitBtn.disabled = true;
        }
        
        showToast('Processing avatar...', 'info');
        
        // Convert image to base64
        const base64Data = await convertToBase64(file);
        
        // Update user profile in Firestore with base64 image
        await updateDoc(doc(db, 'users', currentUser.uid), {
            photoURL: base64Data,
            updatedAt: serverTimestamp()
        });
        
        // Update local userData
        userData.photoURL = base64Data;
        
        // Update avatar in header
        updateHeaderAvatar(base64Data);
        
        // Update avatar in profile page
        const profileAvatar = document.getElementById('profile-avatar');
        if (profileAvatar) {
            profileAvatar.src = base64Data;
        }
        
        showToast('Avatar updated successfully!', 'success');
        
    } catch (error) {
        console.error('Error uploading avatar:', error);
        showToast('Failed to upload avatar: ' + error.message, 'error');
    } finally {
        // Reset button
        if (submitBtn) {
            submitBtn.innerHTML = originalText || '<i class="fas fa-camera text-xs"></i>';
            submitBtn.disabled = false;
        }
        // Reset file input
        const avatarUpload = document.getElementById('avatar-upload');
        if (avatarUpload) {
            avatarUpload.value = '';
        }
    }
}

// Convert file to base64
function convertToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            resolve(e.target.result);
        };
        reader.onerror = (error) => {
            reject(error);
        };
        reader.readAsDataURL(file);
    });
}

async function loadUserStatistics() {
    try {
        const tasksQuery = query(collection(db, 'tasks'), where('userId', '==', currentUser.uid));
        const tasksSnap = await getDocs(tasksQuery);
        const totalTasks = tasksSnap.size;
        const completedTasks = tasksSnap.docs.filter(d => d.data().status === 'done').length;
        const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        
        const projectsQuery = query(collection(db, 'projects'), where('userId', '==', currentUser.uid));
        const projectsSnap = await getDocs(projectsQuery);
        const totalProjects = projectsSnap.size;
        
        const notesQuery = query(collection(db, 'notes'), where('userId', '==', currentUser.uid));
        const notesSnap = await getDocs(notesQuery);
        const totalNotes = notesSnap.size;
        
        document.getElementById('stat-tasks') && (document.getElementById('stat-tasks').textContent = totalTasks);
        document.getElementById('stat-projects') && (document.getElementById('stat-projects').textContent = totalProjects);
        document.getElementById('stat-notes') && (document.getElementById('stat-notes').textContent = totalNotes);
        document.getElementById('stat-completion') && (document.getElementById('stat-completion').textContent = `${completionRate}%`);
        
    } catch (error) {
        console.error('Error loading statistics:', error);
    }
}

function attachSecurityHandlers() {
    // Password visibility toggles
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.onclick = () => {
            const input = btn.parentElement.querySelector('input');
            const type = input.type === 'password' ? 'text' : 'password';
            input.type = type;
            btn.querySelector('i').classList.toggle('fa-eye');
            btn.querySelector('i').classList.toggle('fa-eye-slash');
        };
    });
    
    // Password match checking
    const newPassword = document.getElementById('new-password');
    const confirmPassword = document.getElementById('confirm-password');
    const matchIndicator = document.getElementById('password-match-indicator');
    
    const checkMatch = () => {
        if (!confirmPassword || confirmPassword.value.length === 0) {
            if (matchIndicator) matchIndicator.classList.add('hidden');
            return;
        }
        if (matchIndicator) {
            matchIndicator.classList.remove('hidden');
            if (newPassword.value === confirmPassword.value) {
                matchIndicator.innerHTML = '<i class="fas fa-check-circle text-green-500"></i> <span class="text-green-600">Passwords match</span>';
                matchIndicator.className = 'text-xs mt-1 text-green-600';
            } else {
                matchIndicator.innerHTML = '<i class="fas fa-times-circle text-red-500"></i> <span class="text-red-600">Passwords do not match</span>';
                matchIndicator.className = 'text-xs mt-1 text-red-600';
            }
        }
    };
    
    if (newPassword) newPassword.addEventListener('input', checkMatch);
    if (confirmPassword) confirmPassword.addEventListener('input', checkMatch);
    
    // Password form submission
    const passwordForm = document.getElementById('password-form');
    if (passwordForm) {
        passwordForm.onsubmit = async (e) => {
            e.preventDefault();
            const currentPwd = document.getElementById('current-password').value;
            const newPwd = document.getElementById('new-password').value;
            const confirmPwd = document.getElementById('confirm-password').value;
            
            if (newPwd !== confirmPwd) {
                showToast('New passwords do not match', 'error');
                return;
            }
            
            if (newPwd.length < 6) {
                showToast('Password must be at least 6 characters', 'error');
                return;
            }
            
            showToast('Password update - Implement Firebase Auth reauthentication', 'info');
        };
    }
    
    // Logout all devices
    const logoutAllBtn = document.getElementById('logout-all-devices');
    if (logoutAllBtn) {
        logoutAllBtn.onclick = () => {
            showToast('Sign out all devices - Coming soon', 'info');
        };
    }
}

function attachPreferencesHandlers() {
    // Theme selection
    const themeOptions = document.querySelectorAll('.theme-option');
    const themeInput = document.getElementById('theme-input');
    
    themeOptions.forEach(option => {
        option.addEventListener('click', () => {
            const themeValue = option.dataset.themeValue;
            themeInput.value = themeValue;
            
            // Update UI
            themeOptions.forEach(opt => {
                opt.classList.remove('border-deep-blue', 'bg-deep-blue/10');
                opt.classList.add('border-custom');
            });
            option.classList.add('border-deep-blue', 'bg-deep-blue/10');
            option.classList.remove('border-custom');
            
            // Apply theme immediately
            if (themeValue === 'dark') {
                document.documentElement.setAttribute('data-theme', 'dark');
                document.documentElement.classList.add('dark');
            } else if (themeValue === 'light') {
                document.documentElement.removeAttribute('data-theme');
                document.documentElement.classList.remove('dark');
            } else if (themeValue === 'system') {
                const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (systemDark) {
                    document.documentElement.setAttribute('data-theme', 'dark');
                    document.documentElement.classList.add('dark');
                } else {
                    document.documentElement.removeAttribute('data-theme');
                    document.documentElement.classList.remove('dark');
                }
            }
        });
    });
    
    // Preferences form submission
    const preferencesForm = document.getElementById('preferences-form');
    if (preferencesForm) {
        preferencesForm.onsubmit = async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            
            const preferences = {
                theme: formData.get('theme') || 'light',
                notifications: document.querySelector('.notification-toggle')?.checked || false,
                emailReminders: document.querySelector('.email-toggle')?.checked || false,
                language: formData.get('language'),
                dateFormat: formData.get('dateFormat'),
                currency: formData.get('currency')
            };
            
            try {
                await updateDoc(doc(db, 'users', currentUser.uid), {
                    preferences: preferences,
                    updatedAt: serverTimestamp()
                });
                showToast('Preferences saved!', 'success');
                
                // Apply theme if changed
                if (preferences.theme === 'dark') {
                    document.documentElement.setAttribute('data-theme', 'dark');
                    document.documentElement.classList.add('dark');
                } else if (preferences.theme === 'light') {
                    document.documentElement.removeAttribute('data-theme');
                    document.documentElement.classList.remove('dark');
                }
            } catch (error) {
                console.error('Error saving preferences:', error);
                showToast('Failed to save preferences', 'error');
            }
        };
    }
}

function attachDangerHandlers() {
    // Delete account
    const deleteAccountBtn = document.getElementById('delete-account-btn');
    if (deleteAccountBtn) {
        deleteAccountBtn.onclick = () => {
            if (confirm('⚠️ WARNING: This will permanently delete your account and all your data. This action cannot be undone. Are you absolutely sure?')) {
                const confirmation = prompt('Type "DELETE" to confirm:');
                if (confirmation === 'DELETE') {
                    showToast('Account deletion - Implement with Firebase Auth', 'info');
                }
            }
        };
    }
    
    // Export data
    const exportDataBtn = document.getElementById('export-data-btn');
    if (exportDataBtn) {
        exportDataBtn.onclick = async () => {
            showToast('Preparing your data for export...', 'info');
            try {
                const data = {
                    user: { uid: currentUser.uid, email: currentUser.email, ...userData },
                    tasks: await getAllUserData('tasks'),
                    projects: await getAllUserData('projects'),
                    notes: await getAllUserData('notes'),
                    transactions: await getAllUserData('transactions'),
                    exportedAt: new Date().toISOString()
                };
                
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `profjero_data_export_${new Date().toISOString().split('T')[0]}.json`;
                a.click();
                URL.revokeObjectURL(url);
                showToast('Data exported successfully!', 'success');
            } catch (error) {
                console.error('Error exporting data:', error);
                showToast('Failed to export data', 'error');
            }
        };
    }
    
    // Clear all data
    const clearDataBtn = document.getElementById('clear-data-btn');
    if (clearDataBtn) {
        clearDataBtn.onclick = () => {
            if (confirm('⚠️ WARNING: This will delete ALL your tasks, notes, projects, and transactions. This action cannot be undone. Are you sure?')) {
                showToast('Clear data - Implement batch delete', 'info');
            }
        };
    }
}

async function getAllUserData(collectionName) {
    try {
        const q = query(collection(db, collectionName), where('userId', '==', currentUser.uid));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error(`Error loading ${collectionName}:`, error);
        return [];
    }
}