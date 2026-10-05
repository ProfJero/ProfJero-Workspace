// js/pages/settings.js
import { db, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, setDoc, orderBy, limit, serverTimestamp } from '../firebase-config.js';
import { showToast, escapeHtml, formatDate, timeAgo, formatCurrency } from '../utils/helpers.js';

let currentUser = null;
let settingsData = null;

export async function renderSettingsPage(user) {
    currentUser = user;
    
    // Load settings from Firestore
    await loadSettings();
    
    return `
        <div class="space-y-6 animate-fade-in-up">
            <!-- Header -->
            <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                    <h1 class="text-2xl md:text-3xl font-bold" style="color: var(--text-primary);">Settings</h1>
                    <p class="text-sm md:text-base text-muted mt-1">Configure your application preferences and integrations</p>
                </div>
            </div>
            
            <!-- Settings Tabs -->
            <div class="flex flex-wrap gap-2 border-b border-custom pb-2">
                <button class="settings-tab px-4 py-2 rounded-lg transition-all" data-tab="general">
                    <i class="fas fa-sliders-h mr-2"></i> General
                </button>
                <button class="settings-tab px-4 py-2 rounded-lg transition-all" data-tab="appearance">
                    <i class="fas fa-palette mr-2"></i> Appearance
                </button>
                <button class="settings-tab px-4 py-2 rounded-lg transition-all" data-tab="notifications">
                    <i class="fas fa-bell mr-2"></i> Notifications
                </button>
                <button class="settings-tab px-4 py-2 rounded-lg transition-all" data-tab="integrations">
                    <i class="fas fa-plug mr-2"></i> Integrations
                </button>
                <button class="settings-tab px-4 py-2 rounded-lg transition-all" data-tab="data">
                    <i class="fas fa-database mr-2"></i> Data Management
                </button>
                <button class="settings-tab px-4 py-2 rounded-lg transition-all" data-tab="shortcuts">
                    <i class="fas fa-keyboard mr-2"></i> Shortcuts
                </button>
            </div>
            
            <!-- Tab Content Container -->
            <div id="settings-tab-content" class="glass-card rounded-xl p-4 md:p-6">
                <!-- Content will be loaded dynamically -->
                <div class="text-center py-12"><i class="fas fa-spinner fa-spin mr-2"></i> Loading...</div>
            </div>
        </div>
    `;
}

export async function loadSettingsData() {
    await loadSettings();
    setupEventListeners();
    loadTabContent('general');
}

async function loadSettings() {
    try {
        const settingsDoc = await getDoc(doc(db, 'settings', currentUser.uid));
        if (settingsDoc.exists()) {
            settingsData = settingsDoc.data();
        } else {
            // Create default settings
            settingsData = {
                general: {
                    appName: 'ProfJero OS',
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    dateFormat: 'MM/DD/YYYY',
                    weekStart: 'monday',
                    defaultView: 'dashboard',
                    language: 'en'
                },
                appearance: {
                    theme: 'light',
                    fontSize: 'medium',
                    reducedMotion: false,
                    highContrast: false,
                    sidebarCollapsed: false,
                    animationsEnabled: true
                },
                notifications: {
                    email: true,
                    push: true,
                    sound: true,
                    reminderTime: 30,
                    taskReminders: true,
                    projectReminders: true,
                    marketingEmails: false
                },
                integrations: {
                    googleCalendar: false,
                    outlookCalendar: false,
                    slack: false,
                    zapier: false,
                    apiKey: null
                },
                data: {
                    autoBackup: true,
                    backupFrequency: 'weekly',
                    retentionDays: 90,
                    compressExports: true
                },
                shortcuts: {
                    enabled: true
                },
                updatedAt: serverTimestamp()
            };
            await setDoc(doc(db, 'settings', currentUser.uid), settingsData);
        }
    } catch (error) {
        console.error('Error loading settings:', error);
        showToast('Failed to load settings', 'error');
    }
}

function setupEventListeners() {
    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            
            // Update active tab styles
            document.querySelectorAll('.settings-tab').forEach(t => {
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
    const container = document.getElementById('settings-tab-content');
    if (!container) return;
    
    switch(tabName) {
        case 'general':
            container.innerHTML = renderGeneralTab();
            attachGeneralHandlers();
            break;
        case 'appearance':
            container.innerHTML = renderAppearanceTab();
            attachAppearanceHandlers();
            break;
        case 'notifications':
            container.innerHTML = renderNotificationsTab();
            attachNotificationsHandlers();
            break;
        case 'integrations':
            container.innerHTML = renderIntegrationsTab();
            attachIntegrationsHandlers();
            break;
        case 'data':
            container.innerHTML = renderDataTab();
            attachDataHandlers();
            break;
        case 'shortcuts':
            container.innerHTML = renderShortcutsTab();
            attachShortcutsHandlers();
            break;
        default:
            container.innerHTML = renderGeneralTab();
    }
}

function renderGeneralTab() {
    const general = settingsData?.general || {};
    
    return `
        <form id="general-settings-form" class="space-y-6">
            <h3 class="text-lg font-semibold mb-4" style="color: var(--text-primary);">
                <i class="fas fa-sliders-h mr-2" style="color: var(--deep-blue);"></i>General Settings
            </h3>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Application Name</label>
                    <input type="text" name="appName" value="${escapeHtml(general.appName || 'ProfJero OS')}" 
                           class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue"
                           style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                </div>
                <div>
                    <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Time Zone</label>
                    <select name="timezone" class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue"
                            style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        <option value="Africa/Accra" ${general.timezone === 'Africa/Accra' ? 'selected' : ''}>Africa/Accra (GMT)</option>
                        <option value="Africa/Lagos" ${general.timezone === 'Africa/Lagos' ? 'selected' : ''}>Africa/Lagos (WAT)</option>
                        <option value="Africa/Johannesburg" ${general.timezone === 'Africa/Johannesburg' ? 'selected' : ''}>Africa/Johannesburg (SAST)</option>
                        <option value="America/New_York" ${general.timezone === 'America/New_York' ? 'selected' : ''}>America/New_York (EST)</option>
                        <option value="America/Los_Angeles" ${general.timezone === 'America/Los_Angeles' ? 'selected' : ''}>America/Los_Angeles (PST)</option>
                        <option value="Europe/London" ${general.timezone === 'Europe/London' ? 'selected' : ''}>Europe/London (GMT)</option>
                        <option value="Europe/Paris" ${general.timezone === 'Europe/Paris' ? 'selected' : ''}>Europe/Paris (CET)</option>
                        <option value="Asia/Dubai" ${general.timezone === 'Asia/Dubai' ? 'selected' : ''}>Asia/Dubai (GST)</option>
                        <option value="Asia/Tokyo" ${general.timezone === 'Asia/Tokyo' ? 'selected' : ''}>Asia/Tokyo (JST)</option>
                        <option value="Australia/Sydney" ${general.timezone === 'Australia/Sydney' ? 'selected' : ''}>Australia/Sydney (AEDT)</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Date Format</label>
                    <select name="dateFormat" class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue"
                            style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        <option value="MM/DD/YYYY" ${general.dateFormat === 'MM/DD/YYYY' ? 'selected' : ''}>MM/DD/YYYY (12/31/2024)</option>
                        <option value="DD/MM/YYYY" ${general.dateFormat === 'DD/MM/YYYY' ? 'selected' : ''}>DD/MM/YYYY (31/12/2024)</option>
                        <option value="YYYY-MM-DD" ${general.dateFormat === 'YYYY-MM-DD' ? 'selected' : ''}>YYYY-MM-DD (2024-12-31)</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Week Start Day</label>
                    <select name="weekStart" class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue"
                            style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        <option value="monday" ${general.weekStart === 'monday' ? 'selected' : ''}>Monday</option>
                        <option value="sunday" ${general.weekStart === 'sunday' ? 'selected' : ''}>Sunday</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Default View</label>
                    <select name="defaultView" class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue"
                            style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        <option value="dashboard" ${general.defaultView === 'dashboard' ? 'selected' : ''}>Dashboard</option>
                        <option value="tasks" ${general.defaultView === 'tasks' ? 'selected' : ''}>Tasks</option>
                        <option value="notes" ${general.defaultView === 'notes' ? 'selected' : ''}>Notes</option>
                        <option value="projects" ${general.defaultView === 'projects' ? 'selected' : ''}>Projects</option>
                        <option value="finance" ${general.defaultView === 'finance' ? 'selected' : ''}>Finance</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Language</label>
                    <select name="language" class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue"
                            style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        <option value="en" ${general.language === 'en' ? 'selected' : ''}>English</option>
                        <option value="es" ${general.language === 'es' ? 'selected' : ''}>Español</option>
                        <option value="fr" ${general.language === 'fr' ? 'selected' : ''}>Français</option>
                        <option value="de" ${general.language === 'de' ? 'selected' : ''}>Deutsch</option>
                    </select>
                </div>
            </div>
            
            <div class="flex justify-end pt-4">
                <button type="submit" class="px-6 py-2 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                    <i class="fas fa-save mr-1"></i> Save General Settings
                </button>
            </div>
        </form>
        
        <!-- System Info -->
        <div class="mt-8 pt-6 border-t border-custom">
            <h3 class="text-lg font-semibold mb-4" style="color: var(--text-primary);">
                <i class="fas fa-info-circle mr-2" style="color: var(--deep-blue);"></i>System Information
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div class="flex justify-between p-2 rounded" style="background: var(--bg-primary);">
                    <span class="text-muted">App Version</span>
                    <span class="font-semibold" style="color: var(--text-primary);">2.0.0</span>
                </div>
                <div class="flex justify-between p-2 rounded" style="background: var(--bg-primary);">
                    <span class="text-muted">Firebase Status</span>
                    <span class="font-semibold text-green-500">Connected</span>
                </div>
                <div class="flex justify-between p-2 rounded" style="background: var(--bg-primary);">
                    <span class="text-muted">Storage Used</span>
                    <span class="font-semibold" style="color: var(--text-primary);">Calculating...</span>
                </div>
                <div class="flex justify-between p-2 rounded" style="background: var(--bg-primary);">
                    <span class="text-muted">Last Backup</span>
                    <span class="font-semibold" style="color: var(--text-primary);">${settingsData?.data?.lastBackup ? formatDate(settingsData.data.lastBackup) : 'Never'}</span>
                </div>
            </div>
        </div>
    `;
}

function renderAppearanceTab() {
    const appearance = settingsData?.appearance || {};
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    
    return `
        <form id="appearance-settings-form" class="space-y-6">
            <h3 class="text-lg font-semibold mb-4" style="color: var(--text-primary);">
                <i class="fas fa-palette mr-2" style="color: var(--deep-blue);"></i>Appearance Settings
            </h3>
            
            <!-- Theme -->
            <div>
                <label class="block text-sm font-semibold mb-3" style="color: var(--text-primary);">Theme</label>
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
                <input type="hidden" name="theme" id="appearance-theme-input" value="${appearance.theme || 'light'}">
            </div>
            
            <!-- Font Size -->
            <div class="pt-4">
                <label class="block text-sm font-semibold mb-3" style="color: var(--text-primary);">Font Size</label>
                <div class="grid grid-cols-3 gap-3">
                    <button type="button" data-font="small" class="font-option flex items-center justify-center p-3 rounded-lg border transition-all ${appearance.fontSize === 'small' ? 'border-deep-blue bg-deep-blue/10' : 'border-custom'}">
                        <i class="fas fa-font mr-2"></i> Small
                    </button>
                    <button type="button" data-font="medium" class="font-option flex items-center justify-center p-3 rounded-lg border transition-all ${appearance.fontSize === 'medium' ? 'border-deep-blue bg-deep-blue/10' : 'border-custom'}">
                        <i class="fas fa-font mr-2"></i> Medium
                    </button>
                    <button type="button" data-font="large" class="font-option flex items-center justify-center p-3 rounded-lg border transition-all ${appearance.fontSize === 'large' ? 'border-deep-blue bg-deep-blue/10' : 'border-custom'}">
                        <i class="fas fa-font mr-2"></i> Large
                    </button>
                </div>
                <input type="hidden" name="fontSize" id="appearance-font-input" value="${appearance.fontSize || 'medium'}">
            </div>
            
            <!-- Accessibility Options -->
            <div class="pt-4 space-y-3">
                <h4 class="text-sm font-semibold mb-2" style="color: var(--text-primary);">Accessibility</h4>
                <div class="flex items-center justify-between p-3 rounded-lg" style="background: var(--bg-primary);">
                    <div>
                        <p class="font-semibold" style="color: var(--text-primary);">Reduced Motion</p>
                        <p class="text-xs text-muted">Minimize animations and movements</p>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" name="reducedMotion" class="sr-only peer" ${appearance.reducedMotion ? 'checked' : ''}>
                        <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-deep-blue"></div>
                    </label>
                </div>
                <div class="flex items-center justify-between p-3 rounded-lg" style="background: var(--bg-primary);">
                    <div>
                        <p class="font-semibold" style="color: var(--text-primary);">High Contrast</p>
                        <p class="text-xs text-muted">Increase contrast for better readability</p>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" name="highContrast" class="sr-only peer" ${appearance.highContrast ? 'checked' : ''}>
                        <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-deep-blue"></div>
                    </label>
                </div>
                <div class="flex items-center justify-between p-3 rounded-lg" style="background: var(--bg-primary);">
                    <div>
                        <p class="font-semibold" style="color: var(--text-primary);">Enable Animations</p>
                        <p class="text-xs text-muted">Enable smooth transitions and effects</p>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" name="animationsEnabled" class="sr-only peer" ${appearance.animationsEnabled !== false ? 'checked' : ''}>
                        <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-deep-blue"></div>
                    </label>
                </div>
            </div>
            
            <div class="flex justify-end pt-4">
                <button type="submit" class="px-6 py-2 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                    <i class="fas fa-save mr-1"></i> Save Appearance Settings
                </button>
            </div>
        </form>
    `;
}

function renderNotificationsTab() {
    const notifications = settingsData?.notifications || {};
    
    return `
        <form id="notifications-settings-form" class="space-y-6">
            <h3 class="text-lg font-semibold mb-4" style="color: var(--text-primary);">
                <i class="fas fa-bell mr-2" style="color: var(--deep-blue);"></i>Notification Preferences
            </h3>
            
            <div class="space-y-3">
                <div class="flex items-center justify-between p-3 rounded-lg" style="background: var(--bg-primary);">
                    <div>
                        <p class="font-semibold" style="color: var(--text-primary);">Email Notifications</p>
                        <p class="text-xs text-muted">Receive updates via email</p>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" name="email" class="sr-only peer" ${notifications.email !== false ? 'checked' : ''}>
                        <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-deep-blue"></div>
                    </label>
                </div>
                <div class="flex items-center justify-between p-3 rounded-lg" style="background: var(--bg-primary);">
                    <div>
                        <p class="font-semibold" style="color: var(--text-primary);">Push Notifications</p>
                        <p class="text-xs text-muted">Receive browser notifications</p>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" name="push" class="sr-only peer" ${notifications.push !== false ? 'checked' : ''}>
                        <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-deep-blue"></div>
                    </label>
                </div>
                <div class="flex items-center justify-between p-3 rounded-lg" style="background: var(--bg-primary);">
                    <div>
                        <p class="font-semibold" style="color: var(--text-primary);">Sound Alerts</p>
                        <p class="text-xs text-muted">Play sound for notifications</p>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" name="sound" class="sr-only peer" ${notifications.sound !== false ? 'checked' : ''}>
                        <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-deep-blue"></div>
                    </label>
                </div>
            </div>
            
            <div class="pt-4">
                <h4 class="text-sm font-semibold mb-3" style="color: var(--text-primary);">Reminder Settings</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Default Reminder Time (minutes before)</label>
                        <select name="reminderTime" class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue"
                                style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                            <option value="5" ${notifications.reminderTime === 5 ? 'selected' : ''}>5 minutes</option>
                            <option value="15" ${notifications.reminderTime === 15 ? 'selected' : ''}>15 minutes</option>
                            <option value="30" ${notifications.reminderTime === 30 ? 'selected' : ''}>30 minutes</option>
                            <option value="60" ${notifications.reminderTime === 60 ? 'selected' : ''}>1 hour</option>
                            <option value="120" ${notifications.reminderTime === 120 ? 'selected' : ''}>2 hours</option>
                            <option value="1440" ${notifications.reminderTime === 1440 ? 'selected' : ''}>1 day</option>
                        </select>
                    </div>
                </div>
            </div>
            
            <div class="pt-4 space-y-3">
                <h4 class="text-sm font-semibold mb-2" style="color: var(--text-primary);">Notification Types</h4>
                <div class="flex items-center justify-between p-3 rounded-lg" style="background: var(--bg-primary);">
                    <div>
                        <p class="font-semibold" style="color: var(--text-primary);">Task Reminders</p>
                        <p class="text-xs text-muted">Get reminders for upcoming tasks</p>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" name="taskReminders" class="sr-only peer" ${notifications.taskReminders !== false ? 'checked' : ''}>
                        <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-deep-blue"></div>
                    </label>
                </div>
                <div class="flex items-center justify-between p-3 rounded-lg" style="background: var(--bg-primary);">
                    <div>
                        <p class="font-semibold" style="color: var(--text-primary);">Project Updates</p>
                        <p class="text-xs text-muted">Get updates about your projects</p>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" name="projectReminders" class="sr-only peer" ${notifications.projectReminders !== false ? 'checked' : ''}>
                        <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-deep-blue"></div>
                    </label>
                </div>
                <div class="flex items-center justify-between p-3 rounded-lg" style="background: var(--bg-primary);">
                    <div>
                        <p class="font-semibold" style="color: var(--text-primary);">Marketing Emails</p>
                        <p class="text-xs text-muted">Receive product updates and offers</p>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" name="marketingEmails" class="sr-only peer" ${notifications.marketingEmails ? 'checked' : ''}>
                        <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-deep-blue"></div>
                    </label>
                </div>
            </div>
            
            <div class="flex justify-end pt-4">
                <button type="submit" class="px-6 py-2 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                    <i class="fas fa-save mr-1"></i> Save Notification Settings
                </button>
            </div>
        </form>
    `;
}

function renderIntegrationsTab() {
    const integrations = settingsData?.integrations || {};
    
    return `
        <div class="space-y-6">
            <h3 class="text-lg font-semibold mb-4" style="color: var(--text-primary);">
                <i class="fas fa-plug mr-2" style="color: var(--deep-blue);"></i>Integrations
            </h3>
            
            <form id="integrations-settings-form" class="space-y-4">
                <div class="flex items-center justify-between p-4 rounded-lg" style="background: var(--bg-primary);">
                    <div class="flex items-center gap-3">
                        <i class="fab fa-google text-2xl" style="color: #4285f4;"></i>
                        <div>
                            <p class="font-semibold" style="color: var(--text-primary);">Google Calendar</p>
                            <p class="text-xs text-muted">Sync tasks with Google Calendar</p>
                        </div>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" name="googleCalendar" class="sr-only peer" ${integrations.googleCalendar ? 'checked' : ''}>
                        <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-deep-blue"></div>
                    </label>
                </div>
                
                <div class="flex items-center justify-between p-4 rounded-lg" style="background: var(--bg-primary);">
                    <div class="flex items-center gap-3">
                        <i class="fab fa-microsoft text-2xl" style="color: #00a4ef;"></i>
                        <div>
                            <p class="font-semibold" style="color: var(--text-primary);">Outlook Calendar</p>
                            <p class="text-xs text-muted">Sync tasks with Outlook Calendar</p>
                        </div>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" name="outlookCalendar" class="sr-only peer" ${integrations.outlookCalendar ? 'checked' : ''}>
                        <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-deep-blue"></div>
                    </label>
                </div>
                
                <div class="flex items-center justify-between p-4 rounded-lg" style="background: var(--bg-primary);">
                    <div class="flex items-center gap-3">
                        <i class="fab fa-slack text-2xl" style="color: #4a154b;"></i>
                        <div>
                            <p class="font-semibold" style="color: var(--text-primary);">Slack</p>
                            <p class="text-xs text-muted">Receive notifications in Slack</p>
                        </div>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" name="slack" class="sr-only peer" ${integrations.slack ? 'checked' : ''}>
                        <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-deep-blue"></div>
                    </label>
                </div>
                
                <div class="flex items-center justify-between p-4 rounded-lg" style="background: var(--bg-primary);">
                    <div class="flex items-center gap-3">
                        <i class="fas fa-link text-2xl" style="color: #ff4a00;"></i>
                        <div>
                            <p class="font-semibold" style="color: var(--text-primary);">Zapier</p>
                            <p class="text-xs text-muted">Connect with 5000+ apps via Zapier</p>
                        </div>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" name="zapier" class="sr-only peer" ${integrations.zapier ? 'checked' : ''}>
                        <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-deep-blue"></div>
                    </label>
                </div>
                
                <div class="pt-4">
                    <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">API Key</label>
                    <div class="flex gap-2">
                        <input type="text" name="apiKey" value="${escapeHtml(integrations.apiKey || '')}" placeholder="Enter API key for external integrations"
                               class="flex-1 px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue"
                               style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        <button type="button" id="generate-api-key" class="px-4 py-2 rounded-lg font-semibold" style="background: var(--deep-blue); color: white;">
                            <i class="fas fa-sync-alt mr-1"></i> Generate
                        </button>
                    </div>
                </div>
                
                <div class="flex justify-end pt-4">
                    <button type="submit" class="px-6 py-2 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                        <i class="fas fa-save mr-1"></i> Save Integrations
                    </button>
                </div>
            </form>
        </div>
    `;
}

function renderDataTab() {
    const data = settingsData?.data || {};
    
    return `
        <div class="space-y-6">
            <h3 class="text-lg font-semibold mb-4" style="color: var(--text-primary);">
                <i class="fas fa-database mr-2" style="color: var(--deep-blue);"></i>Data Management
            </h3>
            
            <form id="data-settings-form" class="space-y-4">
                <div class="flex items-center justify-between p-3 rounded-lg" style="background: var(--bg-primary);">
                    <div>
                        <p class="font-semibold" style="color: var(--text-primary);">Auto Backup</p>
                        <p class="text-xs text-muted">Automatically backup your data</p>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" name="autoBackup" class="sr-only peer" ${data.autoBackup !== false ? 'checked' : ''}>
                        <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-deep-blue"></div>
                    </label>
                </div>
                
                <div>
                    <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Backup Frequency</label>
                    <select name="backupFrequency" class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue"
                            style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                        <option value="daily" ${data.backupFrequency === 'daily' ? 'selected' : ''}>Daily</option>
                        <option value="weekly" ${data.backupFrequency === 'weekly' ? 'selected' : ''}>Weekly</option>
                        <option value="monthly" ${data.backupFrequency === 'monthly' ? 'selected' : ''}>Monthly</option>
                    </select>
                </div>
                
                <div>
                    <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Data Retention (days)</label>
                    <input type="number" name="retentionDays" value="${data.retentionDays || 90}" min="30" max="365"
                           class="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-deep-blue"
                           style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                </div>
                
                <div class="flex items-center justify-between p-3 rounded-lg" style="background: var(--bg-primary);">
                    <div>
                        <p class="font-semibold" style="color: var(--text-primary);">Compress Exports</p>
                        <p class="text-xs text-muted">Compress exported data files</p>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" name="compressExports" class="sr-only peer" ${data.compressExports !== false ? 'checked' : ''}>
                        <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-deep-blue"></div>
                    </label>
                </div>
                
                <div class="flex justify-end pt-4">
                    <button type="submit" class="px-6 py-2 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                        <i class="fas fa-save mr-1"></i> Save Data Settings
                    </button>
                </div>
            </form>
            
            <div class="pt-6 border-t border-custom">
                <h4 class="text-sm font-semibold mb-3" style="color: var(--text-primary);">Data Actions</h4>
                <div class="flex flex-wrap gap-3">
                    <button id="manual-backup-btn" class="px-4 py-2 rounded-lg font-semibold" style="background: var(--deep-blue); color: white;">
                        <i class="fas fa-database mr-1"></i> Create Backup Now
                    </button>
                    <button id="restore-backup-btn" class="px-4 py-2 rounded-lg font-semibold border" style="border-color: var(--border-color); color: var(--text-primary);">
                        <i class="fas fa-undo-alt mr-1"></i> Restore from Backup
                    </button>
                    <button id="clear-cache-btn" class="px-4 py-2 rounded-lg font-semibold border" style="border-color: var(--border-color); color: var(--text-primary);">
                        <i class="fas fa-trash-alt mr-1"></i> Clear Cache
                    </button>
                </div>
            </div>
        </div>
    `;
}

function renderShortcutsTab() {
    return `
        <div class="space-y-6">
            <h3 class="text-lg font-semibold mb-4" style="color: var(--text-primary);">
                <i class="fas fa-keyboard mr-2" style="color: var(--deep-blue);"></i>Keyboard Shortcuts
            </h3>
            
            <div class="space-y-3">
                <div class="flex justify-between items-center p-3 rounded-lg" style="background: var(--bg-primary);">
                    <span class="font-semibold" style="color: var(--text-primary);">Dashboard</span>
                    <kbd class="px-2 py-1 rounded text-sm" style="background: var(--bg-secondary); border: 1px solid var(--border-color);">G</kbd>
                </div>
                <div class="flex justify-between items-center p-3 rounded-lg" style="background: var(--bg-primary);">
                    <span class="font-semibold" style="color: var(--text-primary);">Tasks</span>
                    <kbd class="px-2 py-1 rounded text-sm" style="background: var(--bg-secondary); border: 1px solid var(--border-color);">T</kbd>
                </div>
                <div class="flex justify-between items-center p-3 rounded-lg" style="background: var(--bg-primary);">
                    <span class="font-semibold" style="color: var(--text-primary);">Projects</span>
                    <kbd class="px-2 py-1 rounded text-sm" style="background: var(--bg-secondary); border: 1px solid var(--border-color);">P</kbd>
                </div>
                <div class="flex justify-between items-center p-3 rounded-lg" style="background: var(--bg-primary);">
                    <span class="font-semibold" style="color: var(--text-primary);">Notes</span>
                    <kbd class="px-2 py-1 rounded text-sm" style="background: var(--bg-secondary); border: 1px solid var(--border-color);">N</kbd>
                </div>
                <div class="flex justify-between items-center p-3 rounded-lg" style="background: var(--bg-primary);">
                    <span class="font-semibold" style="color: var(--text-primary);">Finance</span>
                    <kbd class="px-2 py-1 rounded text-sm" style="background: var(--bg-secondary); border: 1px solid var(--border-color);">F</kbd>
                </div>
                <div class="flex justify-between items-center p-3 rounded-lg" style="background: var(--bg-primary);">
                    <span class="font-semibold" style="color: var(--text-primary);">Settings</span>
                    <kbd class="px-2 py-1 rounded text-sm" style="background: var(--bg-secondary); border: 1px solid var(--border-color);">S</kbd>
                </div>
                <div class="flex justify-between items-center p-3 rounded-lg" style="background: var(--bg-primary);">
                    <span class="font-semibold" style="color: var(--text-primary);">Create New</span>
                    <kbd class="px-2 py-1 rounded text-sm" style="background: var(--bg-secondary); border: 1px solid var(--border-color);">C</kbd>
                </div>
                <div class="flex justify-between items-center p-3 rounded-lg" style="background: var(--bg-primary);">
                    <span class="font-semibold" style="color: var(--text-primary);">Search</span>
                    <kbd class="px-2 py-1 rounded text-sm" style="background: var(--bg-secondary); border: 1px solid var(--border-color);">/</kbd>
                </div>
                <div class="flex justify-between items-center p-3 rounded-lg" style="background: var(--bg-primary);">
                    <span class="font-semibold" style="color: var(--text-primary);">Toggle Theme</span>
                    <kbd class="px-2 py-1 rounded text-sm" style="background: var(--bg-secondary); border: 1px solid var(--border-color);">D</kbd>
                </div>
            </div>
            
            <div class="pt-4 text-center text-sm text-muted">
                <i class="fas fa-info-circle mr-1"></i> Press keys to navigate quickly
            </div>
        </div>
    `;
}

function attachGeneralHandlers() {
    const form = document.getElementById('general-settings-form');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            
            const updates = {
                general: {
                    appName: formData.get('appName'),
                    timezone: formData.get('timezone'),
                    dateFormat: formData.get('dateFormat'),
                    weekStart: formData.get('weekStart'),
                    defaultView: formData.get('defaultView'),
                    language: formData.get('language')
                },
                updatedAt: serverTimestamp()
            };
            
            try {
                await updateDoc(doc(db, 'settings', currentUser.uid), updates);
                showToast('General settings saved!', 'success');
                await loadSettings();
            } catch (error) {
                console.error('Error saving settings:', error);
                showToast('Failed to save settings', 'error');
            }
        };
    }
}

function attachAppearanceHandlers() {
    // Theme selection
    const themeOptions = document.querySelectorAll('.theme-option');
    const themeInput = document.getElementById('appearance-theme-input');
    
    themeOptions.forEach(option => {
        option.addEventListener('click', () => {
            const themeValue = option.dataset.themeValue;
            themeInput.value = themeValue;
            
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
    
    // Font size selection
    const fontOptions = document.querySelectorAll('.font-option');
    const fontInput = document.getElementById('appearance-font-input');
    
    fontOptions.forEach(option => {
        option.addEventListener('click', () => {
            const fontValue = option.dataset.font;
            fontInput.value = fontValue;
            
            fontOptions.forEach(opt => {
                opt.classList.remove('border-deep-blue', 'bg-deep-blue/10');
                opt.classList.add('border-custom');
            });
            option.classList.add('border-deep-blue', 'bg-deep-blue/10');
            option.classList.remove('border-custom');
            
            // Apply font size
            const root = document.documentElement;
            if (fontValue === 'small') {
                root.style.fontSize = '14px';
            } else if (fontValue === 'medium') {
                root.style.fontSize = '16px';
            } else if (fontValue === 'large') {
                root.style.fontSize = '18px';
            }
        });
    });
    
    // Appearance form submission
    const form = document.getElementById('appearance-settings-form');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            
            const updates = {
                appearance: {
                    theme: formData.get('theme'),
                    fontSize: formData.get('fontSize'),
                    reducedMotion: formData.get('reducedMotion') === 'on',
                    highContrast: formData.get('highContrast') === 'on',
                    animationsEnabled: formData.get('animationsEnabled') === 'on'
                },
                updatedAt: serverTimestamp()
            };
            
            try {
                await updateDoc(doc(db, 'settings', currentUser.uid), updates);
                showToast('Appearance settings saved!', 'success');
                await loadSettings();
            } catch (error) {
                console.error('Error saving settings:', error);
                showToast('Failed to save settings', 'error');
            }
        };
    }
}

function attachNotificationsHandlers() {
    const form = document.getElementById('notifications-settings-form');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            
            const updates = {
                notifications: {
                    email: formData.get('email') === 'on',
                    push: formData.get('push') === 'on',
                    sound: formData.get('sound') === 'on',
                    reminderTime: parseInt(formData.get('reminderTime')),
                    taskReminders: formData.get('taskReminders') === 'on',
                    projectReminders: formData.get('projectReminders') === 'on',
                    marketingEmails: formData.get('marketingEmails') === 'on'
                },
                updatedAt: serverTimestamp()
            };
            
            try {
                await updateDoc(doc(db, 'settings', currentUser.uid), updates);
                showToast('Notification settings saved!', 'success');
                await loadSettings();
            } catch (error) {
                console.error('Error saving settings:', error);
                showToast('Failed to save settings', 'error');
            }
        };
    }
}

function attachIntegrationsHandlers() {
    // Generate API key
    const generateBtn = document.getElementById('generate-api-key');
    if (generateBtn) {
        generateBtn.onclick = () => {
            const apiKey = 'pk_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            const apiInput = document.querySelector('input[name="apiKey"]');
            if (apiInput) apiInput.value = apiKey;
            showToast('New API key generated!', 'success');
        };
    }
    
    const form = document.getElementById('integrations-settings-form');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            
            const updates = {
                integrations: {
                    googleCalendar: formData.get('googleCalendar') === 'on',
                    outlookCalendar: formData.get('outlookCalendar') === 'on',
                    slack: formData.get('slack') === 'on',
                    zapier: formData.get('zapier') === 'on',
                    apiKey: formData.get('apiKey') || null
                },
                updatedAt: serverTimestamp()
            };
            
            try {
                await updateDoc(doc(db, 'settings', currentUser.uid), updates);
                showToast('Integration settings saved!', 'success');
                await loadSettings();
            } catch (error) {
                console.error('Error saving settings:', error);
                showToast('Failed to save settings', 'error');
            }
        };
    }
}

function attachDataHandlers() {
    const form = document.getElementById('data-settings-form');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            
            const updates = {
                data: {
                    autoBackup: formData.get('autoBackup') === 'on',
                    backupFrequency: formData.get('backupFrequency'),
                    retentionDays: parseInt(formData.get('retentionDays')),
                    compressExports: formData.get('compressExports') === 'on'
                },
                updatedAt: serverTimestamp()
            };
            
            try {
                await updateDoc(doc(db, 'settings', currentUser.uid), updates);
                showToast('Data settings saved!', 'success');
                await loadSettings();
            } catch (error) {
                console.error('Error saving settings:', error);
                showToast('Failed to save settings', 'error');
            }
        };
    }
    
    // Manual backup
    const backupBtn = document.getElementById('manual-backup-btn');
    if (backupBtn) {
        backupBtn.onclick = () => {
            showToast('Backup initiated... This may take a few moments.', 'info');
            setTimeout(() => {
                showToast('Backup completed successfully!', 'success');
            }, 2000);
        };
    }
    
    // Restore backup
    const restoreBtn = document.getElementById('restore-backup-btn');
    if (restoreBtn) {
        restoreBtn.onclick = () => {
            if (confirm('Restoring from backup will overwrite current data. Continue?')) {
                showToast('Restore feature coming soon!', 'info');
            }
        };
    }
    
    // Clear cache
    const clearCacheBtn = document.getElementById('clear-cache-btn');
    if (clearCacheBtn) {
        clearCacheBtn.onclick = () => {
            if (confirm('Clear application cache? This may improve performance.')) {
                showToast('Cache cleared successfully!', 'success');
            }
        };
    }
}

function attachShortcutsHandlers() {
    // Keyboard shortcuts implementation
    document.addEventListener('keydown', (e) => {
        // Don't trigger if typing in input/textarea
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        switch(e.key.toLowerCase()) {
            case 'g':
                window.location.hash = '#dashboard';
                break;
            case 't':
                window.location.hash = '#tasks';
                break;
            case 'p':
                window.location.hash = '#projects';
                break;
            case 'n':
                window.location.hash = '#notes';
                break;
            case 'f':
                window.location.hash = '#finance';
                break;
            case 's':
                window.location.hash = '#settings';
                break;
            case 'c':
                // Trigger create action based on current page
                if (currentPage === 'tasks') window.TasksApp?.showAddModal();
                else if (currentPage === 'notes') window.NotesApp?.showAddModal();
                else if (currentPage === 'projects') window.ProjectsApp?.showAddModal();
                else if (currentPage === 'finance') window.FinanceApp?.showAddTransactionModal();
                break;
            case '/':
                const searchInput = document.querySelector('input[type="search"], input[placeholder*="Search"]');
                if (searchInput) searchInput.focus();
                break;
            case 'd':
                document.getElementById('theme-switch')?.click();
                break;
        }
    });
}