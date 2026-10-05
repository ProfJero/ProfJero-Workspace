// js/pages/audiobook.js - Complete Updated Version
import { db, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, serverTimestamp } from '../firebase-config.js';
import { showToast, escapeHtml, formatDate, timeAgo } from '../utils/helpers.js';

let currentUser = null;
let documentsCache = [];
let currentPlayingId = null;
let speechSynthesis = window.speechSynthesis;
let currentUtterance = null;
let currentChunks = [];
let currentChunkIndex = 0;
let isPlaying = false;
let isPaused = false;
let totalDuration = 0;
let startPage = 0;
let totalPages = 0;
let documentPages = [];
let isSeeking = false;
let captionVisible = true;

// Default language settings
let currentLanguage = 'en-GB';
let currentVoice = null;

// Available language options
const LANGUAGE_OPTIONS = {
    'en-GB': { name: 'British English', flag: '🇬🇧', label: 'British English (UK)', short: 'British' },
    'en-US': { name: 'American English', flag: '🇺🇸', label: 'American English (US)', short: 'American' },
    'en-AU': { name: 'Australian English', flag: '🇦🇺', label: 'Australian English', short: 'Australian' },
    'en-IN': { name: 'Indian English', flag: '🇮🇳', label: 'Indian English', short: 'Indian' },
    'en-ZA': { name: 'South African English', flag: '🇿🇦', label: 'South African English', short: 'S. African' },
    'en-NZ': { name: 'New Zealand English', flag: '🇳🇿', label: 'New Zealand English', short: 'New Zealand' },
    'en-CA': { name: 'Canadian English', flag: '🇨🇦', label: 'Canadian English', short: 'Canadian' },
    'en-IE': { name: 'Irish English', flag: '🇮🇪', label: 'Irish English', short: 'Irish' }
};

// Load saved language preference
function loadLanguagePreference() {
    const saved = localStorage.getItem('studyCompanionLanguage');
    if (saved && LANGUAGE_OPTIONS[saved]) {
        currentLanguage = saved;
    }
    return currentLanguage;
}

// Save language preference
function saveLanguagePreference(lang) {
    localStorage.setItem('studyCompanionLanguage', lang);
    currentLanguage = lang;
}

// Load caption visibility preference
function loadCaptionPreference() {
    const saved = localStorage.getItem('studyCompanionCaption');
    if (saved !== null) {
        captionVisible = saved === 'true';
    }
    return captionVisible;
}

// Save caption visibility preference
function saveCaptionPreference(visible) {
    localStorage.setItem('studyCompanionCaption', visible.toString());
    captionVisible = visible;
}

export async function renderAudioBookPage(user) {
    currentUser = user;
    loadLanguagePreference();
    loadCaptionPreference();
    
    return `
        <div class="space-y-6 animate-fade-in-up">
            <!-- Header -->
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 class="text-3xl font-bold" style="color: var(--text-primary);">Study Companion</h1>
                    <p class="text-muted mt-1">Upload your lecture documents (PDF, PPTX, DOCX, TXT) and listen on the go</p>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button id="language-settings-btn" class="px-5 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all hover:shadow-md" style="background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary);">
                        <i class="fas fa-language"></i>
                        <span class="hidden sm:inline" id="current-accent-display">${LANGUAGE_OPTIONS[currentLanguage]?.flag || '🇬🇧'} ${LANGUAGE_OPTIONS[currentLanguage]?.short || 'British'}</span>
                        <span class="sm:hidden">Accent</span>
                    </button>
                    <button id="upload-doc-btn" class="px-5 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                        <i class="fas fa-cloud-upload-alt"></i>
                        <span>Upload</span>
                    </button>
                </div>
            </div>
            
            <!-- Quick Language Switcher -->
            <div class="glass-card rounded-xl p-2 flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2 text-xs text-muted">
                    <i class="fas fa-microphone"></i>
                    <span>Current Accent:</span>
                    <span class="font-semibold" style="color: var(--deep-blue);" id="quick-accent-display">${LANGUAGE_OPTIONS[currentLanguage]?.flag || '🇬🇧'} ${LANGUAGE_OPTIONS[currentLanguage]?.name || 'British English'}</span>
                </div>
                <div class="flex gap-1">
                    ${Object.entries(LANGUAGE_OPTIONS).slice(0, 4).map(([code, option]) => `
                        <button onclick="window.StudyCompanion.quickSelectLanguage('${code}')" 
                                class="px-2 py-1 rounded-lg text-xs transition-all hover:scale-105 ${currentLanguage === code ? 'border-2 border-deep-blue' : 'border border-transparent'}"
                                style="${currentLanguage === code ? 'background: rgba(0, 87, 217, 0.1);' : 'background: var(--bg-primary);'}"
                                title="${option.name}">
                            ${option.flag}
                        </button>
                    `).join('')}
                    <button id="more-accent-btn" class="px-2 py-1 rounded-lg text-xs transition-all hover:scale-105" style="background: var(--bg-primary); border: 1px solid var(--border-color);">
                        <i class="fas fa-ellipsis-h"></i>
                    </button>
                </div>
            </div>
            
            <!-- Stats -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div class="glass-card p-3 rounded-xl text-center">
                    <div class="text-xl font-bold" id="stat-total" style="color: var(--deep-blue);">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-file-alt"></i> Total Docs</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center">
                    <div class="text-xl font-bold" id="stat-audio" style="color: var(--emerald);">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-headphones"></i> Audio Ready</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center">
                    <div class="text-xl font-bold" id="stat-listened" style="color: var(--gold);">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-check-circle"></i> Listened</div>
                </div>
                <div class="glass-card p-3 rounded-xl text-center">
                    <div class="text-xl font-bold" id="stat-pages" style="color: #8b5cf6;">0</div>
                    <div class="text-xs text-muted"><i class="fas fa-hourglass-half"></i> Est. Minutes</div>
                </div>
            </div>
            
            <!-- Caption Toggle - Always Visible -->
            <div class="flex items-center justify-between gap-2 p-3 rounded-xl" style="background: var(--bg-primary); border: 1px solid var(--border-color);">
                <div class="flex items-center gap-2 text-sm" style="color: var(--text-primary);">
                    <i class="fas fa-closed-captioning"></i>
                    <span>Captions</span>
                    <span class="text-xs text-muted">(Show/Hide live text)</span>
                </div>
                <button id="caption-toggle-btn" class="px-4 py-2 rounded-lg font-semibold text-sm transition-all transform hover:scale-[1.02]" style="background: ${captionVisible ? 'linear-gradient(135deg, var(--deep-blue), var(--emerald))' : 'var(--bg-secondary)'}; color: ${captionVisible ? 'white' : 'var(--text-primary)'}; border: 1px solid var(--border-color);">
                    <i class="fas ${captionVisible ? 'fa-eye' : 'fa-eye-slash'} mr-1"></i>
                    ${captionVisible ? 'Hide Captions' : 'Show Captions'}
                </button>
            </div>
            
            <!-- Audio Player -->
            <div id="audio-player" class="glass-card rounded-xl p-4 hidden">
                <div class="flex flex-col gap-3">
                    <div class="flex flex-col md:flex-row items-center justify-between gap-4">
                        <div class="flex-1">
                            <div class="font-semibold truncate" id="now-playing-title" style="color: var(--text-primary);">Now Playing</div>
                            <div class="text-sm text-muted" id="now-playing-doc">Select a document to play</div>
                            <div class="text-xs text-muted mt-1" id="now-playing-page">Page: 0 / 0</div>
                            <div class="text-xs text-muted mt-1" id="now-playing-language" style="color: var(--deep-blue);">
                                <i class="fas fa-language"></i> Accent: ${LANGUAGE_OPTIONS[currentLanguage]?.flag || '🇬🇧'} ${LANGUAGE_OPTIONS[currentLanguage]?.name || 'British English'}
                                <button onclick="window.StudyCompanion.showLanguageSettings()" class="ml-2 text-xs hover:underline" style="color: var(--deep-blue);">Change</button>
                            </div>
                        </div>
                        <div class="flex flex-wrap gap-2">
                            <button id="seek-backward-btn" class="px-3 py-2 rounded-lg flex items-center gap-1 transition-all hover:scale-105" style="background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary);" title="Skip Backward">
                                <i class="fas fa-backward-step"></i>
                                <span class="text-xs">10s</span>
                            </button>
                            <button id="play-btn" class="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-play"></i>
                            </button>
                            <button id="pause-btn" class="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105 hidden" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-pause"></i>
                            </button>
                            <button id="stop-btn" class="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105" style="background: #ef4444; color: white;">
                                <i class="fas fa-stop"></i>
                            </button>
                            <button id="seek-forward-btn" class="px-3 py-2 rounded-lg flex items-center gap-1 transition-all hover:scale-105" style="background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary);" title="Skip Forward">
                                <i class="fas fa-forward-step"></i>
                                <span class="text-xs">10s</span>
                            </button>
                            <button id="page-settings-btn" class="px-3 py-2 rounded-lg flex items-center gap-1 transition-all hover:scale-105" style="background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary);" title="Page Settings">
                                <i class="fas fa-pager"></i>
                            </button>
                            <!-- Caption Toggle in Player -->
                            <button id="player-caption-toggle" class="px-3 py-2 rounded-lg flex items-center gap-1 transition-all hover:scale-105" style="background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary);" title="${captionVisible ? 'Hide Captions' : 'Show Captions'}">
                                <i class="fas ${captionVisible ? 'fa-eye' : 'fa-eye-slash'}"></i>
                                <span class="text-xs">${captionVisible ? 'Hide' : 'Show'}</span>
                            </button>
                        </div>
                        <div class="flex items-center gap-2">
                            <i class="fas fa-tachometer-alt text-muted"></i>
                            <select id="speed-control" class="px-2 py-1 rounded-lg border text-sm" style="background: var(--bg-primary); border-color: var(--border-color); color: var(--text-primary);">
                                <option value="0.5">0.5x</option>
                                <option value="0.75">0.75x</option>
                                <option value="1" selected>1x</option>
                                <option value="1.25">1.25x</option>
                                <option value="1.5">1.5x</option>
                                <option value="2">2x</option>
                            </select>
                        </div>
                    </div>
                    <div class="mt-2">
                        <div class="flex justify-between text-xs text-muted mb-1">
                            <span id="current-time">0:00</span>
                            <span id="total-time">0:00</span>
                        </div>
                        <div class="h-2 rounded-full overflow-hidden cursor-pointer relative" style="background: var(--border-color);" id="progress-bar">
                            <div id="audio-progress" class="h-full rounded-full transition-all" style="width: 0%; background: linear-gradient(90deg, var(--deep-blue), var(--emerald));"></div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Caption Display -->
            <div id="caption-container" class="glass-card rounded-xl p-4 ${captionVisible ? '' : 'hidden'}">
                <div class="flex items-center justify-between mb-2">
                    <div class="text-xs text-muted"><i class="fas fa-closed-captioning"></i> Live Captions</div>
                    <button id="caption-close-btn" class="text-muted hover:text-primary transition text-sm">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div id="caption-display" class="text-lg font-medium min-h-[60px] flex items-center" style="color: var(--text-primary);">
                    <span class="text-muted italic">Captions will appear here while playing...</span>
                </div>
            </div>
            
            <!-- Search and Filter -->
            <div class="glass-card rounded-xl p-4">
                <div class="flex flex-col md:flex-row gap-3">
                    <div class="flex-1 relative">
                        <i class="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-muted"></i>
                        <input type="text" id="doc-search" placeholder="Search documents..." 
                               class="w-full pl-10 pr-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue transition-all"
                               style="background: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);">
                    </div>
                    <select id="doc-filter" class="px-4 py-2 rounded-lg border focus:ring-2 focus:ring-deep-blue" style="background: var(--bg-secondary); border-color: var(--border-color); color: var(--text-primary);">
                        <option value="all">All Documents</option>
                        <option value="pdf">PDF Files</option>
                        <option value="pptx">PowerPoint Files</option>
                        <option value="docx">Word Files</option>
                        <option value="txt">Text Files</option>
                    </select>
                </div>
            </div>
            
            <!-- Documents Container -->
            <div id="documents-container" class="space-y-4">
                <div class="text-center py-12">
                    <div class="animate-pulse"><i class="fas fa-spinner fa-spin mr-2 text-muted"></i> Loading documents...</div>
                </div>
            </div>
        </div>
    `;
}

export async function loadAudioBookData() {
    if (!currentUser) return;
    await loadDocuments();
    setupEventListeners();
}

async function loadDocuments() {
    const container = document.getElementById('documents-container');
    if (!container) return;
    
    try {
        const q = query(collection(db, 'audioDocuments'), where('userId', '==', currentUser.uid), orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        
        documentsCache = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate?.() || new Date()
        }));
        
        updateStats();
        filterAndRenderDocuments();
    } catch (error) {
        console.error('Error loading documents:', error);
        container.innerHTML = '<div class="text-center py-12 text-red-500">Failed to load documents</div>';
    }
}

function updateStats() {
    const total = documentsCache.length;
    const audioReady = documentsCache.filter(d => d.content && d.content.length > 0).length;
    const listened = documentsCache.filter(d => d.listened).length;
    const totalMinutes = documentsCache.reduce((sum, d) => sum + Math.ceil((d.content?.length || 0) / 1500), 0);
    
    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-audio').textContent = audioReady;
    document.getElementById('stat-listened').textContent = listened;
    document.getElementById('stat-pages').textContent = totalMinutes;
}

function filterAndRenderDocuments() {
    let filtered = [...documentsCache];
    
    const searchInput = document.getElementById('doc-search');
    if (searchInput && searchInput.value) {
        const query = searchInput.value.toLowerCase();
        filtered = filtered.filter(d => d.title?.toLowerCase().includes(query));
    }
    
    const filterSelect = document.getElementById('doc-filter');
    if (filterSelect && filterSelect.value !== 'all') {
        filtered = filtered.filter(d => d.fileType === filterSelect.value);
    }
    
    renderDocuments(filtered);
}

function renderDocuments(documents) {
    const container = document.getElementById('documents-container');
    if (!container) return;
    
    if (documents.length === 0) {
        container.innerHTML = `
            <div class="glass-card rounded-xl p-12 text-center">
                <i class="fas fa-headphones text-6xl mb-4 text-muted"></i>
                <h3 class="text-xl font-semibold mb-2" style="color: var(--text-primary);">No documents yet</h3>
                <p class="text-muted">Upload your lecture notes, PowerPoint slides, or PDFs to listen on the go</p>
                <button id="empty-upload-btn" class="mt-4 px-5 py-2 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                    <i class="fas fa-cloud-upload-alt mr-1"></i> Upload Document
                </button>
            </div>
        `;
        const emptyBtn = document.getElementById('empty-upload-btn');
        if (emptyBtn) emptyBtn.onclick = () => showUploadModal();
        return;
    }
    
    container.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';
    container.innerHTML = documents.map(doc => createDocumentCard(doc)).join('');
}

function createDocumentCard(doc) {
    const fileIcons = {
        pdf: 'fa-file-pdf',
        pptx: 'fa-file-powerpoint',
        docx: 'fa-file-word',
        txt: 'fa-file-alt'
    };
    const fileColors = {
        pdf: '#ef4444',
        pptx: '#f59e0b',
        docx: '#3b82f6',
        txt: '#10b981'
    };
    
    const icon = fileIcons[doc.fileType] || 'fa-file';
    const color = fileColors[doc.fileType] || 'var(--text-muted)';
    const isPlaying = currentPlayingId === doc.id;
    const duration = Math.ceil((doc.content?.length || 0) / 1500);
    const pageCount = doc.pages || Math.ceil((doc.content?.length || 0) / 2000);
    
    return `
        <div class="glass-card rounded-xl p-4 transition-all hover:shadow-lg">
            <div class="flex items-start justify-between mb-3">
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-lg flex items-center justify-center" style="background: ${color}20;">
                        <i class="fas ${icon} text-2xl" style="color: ${color};"></i>
                    </div>
                    <div>
                        <h3 class="font-semibold line-clamp-1" style="color: var(--text-primary);">${escapeHtml(doc.title)}</h3>
                        <p class="text-xs text-muted">${formatDate(doc.createdAt)} • ~${duration} min • ${pageCount} pages</p>
                    </div>
                </div>
                ${doc.listened ? '<i class="fas fa-check-circle text-emerald-500" title="Listened"></i>' : ''}
            </div>
            
            <div class="mb-3">
                <p class="text-sm text-muted line-clamp-2">${escapeHtml(doc.content?.substring(0, 150) || 'No preview available')}...</p>
            </div>
            
            <div class="flex gap-2">
                <button onclick="window.StudyCompanion.showPageSettings('${doc.id}')" class="flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all" style="background: var(--bg-primary); color: var(--deep-blue); border: 1px solid var(--border-color);">
                    <i class="fas fa-pager mr-1"></i> Pages
                </button>
                <button onclick="window.StudyCompanion.playDocument('${doc.id}')" class="flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${isPlaying ? 'playing' : ''}" style="background: ${isPlaying ? 'linear-gradient(135deg, var(--deep-blue), var(--emerald))' : 'var(--bg-primary)'}; color: ${isPlaying ? 'white' : 'var(--deep-blue)'}; border: 1px solid var(--border-color);">
                    <i class="fas ${isPlaying ? 'fa-stop' : 'fa-play'} mr-1"></i> ${isPlaying ? 'Stop' : 'Play Audio'}
                </button>
                <button onclick="window.StudyCompanion.deleteDocument('${doc.id}')" class="px-3 py-2 rounded-lg text-sm transition-all hover:bg-red-100" style="color: #ef4444; border: 1px solid var(--border-color);">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

function setupEventListeners() {
    const searchInput = document.getElementById('doc-search');
    if (searchInput) searchInput.addEventListener('input', () => filterAndRenderDocuments());
    
    const filterSelect = document.getElementById('doc-filter');
    if (filterSelect) filterSelect.addEventListener('change', () => filterAndRenderDocuments());
    
    const uploadBtn = document.getElementById('upload-doc-btn');
    if (uploadBtn) uploadBtn.addEventListener('click', () => showUploadModal());
    
    // Language settings button
    const langSettingsBtn = document.getElementById('language-settings-btn');
    if (langSettingsBtn) langSettingsBtn.addEventListener('click', () => showLanguageSettings());
    
    // More accent button
    const moreAccentBtn = document.getElementById('more-accent-btn');
    if (moreAccentBtn) moreAccentBtn.addEventListener('click', () => showLanguageSettings());
    
    // Caption toggle buttons
    const captionToggleBtn = document.getElementById('caption-toggle-btn');
    const playerCaptionToggle = document.getElementById('player-caption-toggle');
    const captionCloseBtn = document.getElementById('caption-close-btn');
    
    function toggleCaption() {
        captionVisible = !captionVisible;
        saveCaptionPreference(captionVisible);
        
        const captionContainer = document.getElementById('caption-container');
        if (captionContainer) {
            if (captionVisible) {
                captionContainer.classList.remove('hidden');
            } else {
                captionContainer.classList.add('hidden');
            }
        }
        
        // Update toggle buttons
        const toggleBtn = document.getElementById('caption-toggle-btn');
        const playerToggle = document.getElementById('player-caption-toggle');
        
        if (toggleBtn) {
            toggleBtn.innerHTML = `<i class="fas ${captionVisible ? 'fa-eye' : 'fa-eye-slash'} mr-1"></i> ${captionVisible ? 'Hide Captions' : 'Show Captions'}`;
            toggleBtn.style.background = captionVisible ? 'linear-gradient(135deg, var(--deep-blue), var(--emerald))' : 'var(--bg-secondary)';
            toggleBtn.style.color = captionVisible ? 'white' : 'var(--text-primary)';
        }
        
        if (playerToggle) {
            playerToggle.innerHTML = `<i class="fas ${captionVisible ? 'fa-eye' : 'fa-eye-slash'}"></i><span class="text-xs">${captionVisible ? 'Hide' : 'Show'}</span>`;
        }
        
        showToast(captionVisible ? 'Captions visible' : 'Captions hidden', 'info');
    }
    
    if (captionToggleBtn) captionToggleBtn.addEventListener('click', toggleCaption);
    if (playerCaptionToggle) playerCaptionToggle.addEventListener('click', toggleCaption);
    if (captionCloseBtn) captionCloseBtn.addEventListener('click', toggleCaption);
    
    // Audio player controls
    const playBtn = document.getElementById('play-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const stopBtn = document.getElementById('stop-btn');
    const seekBackwardBtn = document.getElementById('seek-backward-btn');
    const seekForwardBtn = document.getElementById('seek-forward-btn');
    const pageSettingsBtn = document.getElementById('page-settings-btn');
    const speedControl = document.getElementById('speed-control');
    const progressBar = document.getElementById('progress-bar');
    
    if (playBtn) playBtn.addEventListener('click', () => resumeAudio());
    if (pauseBtn) pauseBtn.addEventListener('click', () => pauseAudio());
    if (stopBtn) stopBtn.addEventListener('click', () => stopAudio());
    if (seekBackwardBtn) seekBackwardBtn.addEventListener('click', () => seekAudio(-10));
    if (seekForwardBtn) seekForwardBtn.addEventListener('click', () => seekAudio(10));
    if (pageSettingsBtn) pageSettingsBtn.addEventListener('click', () => {
        if (currentPlayingId) {
            window.StudyCompanion.showPageSettings(currentPlayingId);
        } else {
            showToast('Please select a document first', 'info');
        }
    });
    
    if (speedControl) {
        speedControl.addEventListener('change', (e) => {
            const speed = parseFloat(e.target.value);
            if (currentUtterance) {
                if (isPlaying && !isPaused && currentChunks[currentChunkIndex]) {
                    speechSynthesis.cancel();
                    const newUtterance = new SpeechSynthesisUtterance(currentChunks[currentChunkIndex]);
                    newUtterance.rate = speed;
                    newUtterance.lang = currentLanguage;
                    if (currentVoice) {
                        newUtterance.voice = currentVoice;
                    }
                    newUtterance.onend = () => {
                        currentChunkIndex++;
                        updateProgress();
                        if (currentChunkIndex < currentChunks.length && isPlaying && !isPaused) {
                            setTimeout(() => speakChunk(), 100);
                        } else if (currentChunkIndex >= currentChunks.length) {
                            finishPlayback();
                        }
                    };
                    newUtterance.onerror = () => {
                        if (currentChunkIndex < currentChunks.length && isPlaying && !isPaused) {
                            setTimeout(() => speakChunk(), 500);
                        }
                    };
                    currentUtterance = newUtterance;
                    speechSynthesis.speak(newUtterance);
                }
            }
            showToast(`Speed: ${e.target.value}x`, 'info');
        });
    }
    
    if (progressBar) {
        progressBar.addEventListener('click', (e) => {
            const rect = progressBar.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            seekToPercent(percent);
        });
    }
}

function showLanguageSettings() {
    const currentLang = loadLanguagePreference();
    
    const html = `
        <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.StudyCompanion.closeModal()">
            <div class="rounded-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                    <div>
                        <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">
                            <i class="fas fa-language mr-2" style="color: var(--deep-blue);"></i>Accent Settings
                        </h2>
                        <p class="text-xs md:text-sm text-muted mt-1">Choose your preferred accent for text-to-speech</p>
                    </div>
                    <button onclick="window.StudyCompanion.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition">
                        <i class="fas fa-times text-muted"></i>
                    </button>
                </div>
                
                <div class="p-5">
                    <div class="mb-4">
                        <label class="block text-sm font-semibold mb-3" style="color: var(--text-primary);">Select Accent</label>
                        <div class="space-y-2">
                            ${Object.entries(LANGUAGE_OPTIONS).map(([code, option]) => `
                                <div class="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all hover:bg-gray-100 dark:hover:bg-gray-700 ${currentLang === code ? 'border-2 border-deep-blue' : 'border border-transparent'}" 
                                     onclick="window.StudyCompanion.selectLanguage('${code}')" 
                                     style="${currentLang === code ? 'background: rgba(0, 87, 217, 0.08);' : ''}">
                                    <span class="text-2xl">${option.flag}</span>
                                    <div class="flex-1">
                                        <div class="font-semibold" style="color: ${currentLang === code ? 'var(--deep-blue)' : 'var(--text-primary)'};">${option.name}</div>
                                        <div class="text-xs text-muted">${code}</div>
                                    </div>
                                    ${currentLang === code ? '<i class="fas fa-check-circle" style="color: var(--deep-blue);"></i>' : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    
                    <div class="mb-4 p-3 rounded-lg" style="background: var(--bg-primary);">
                        <div class="flex items-center gap-2 text-sm">
                            <i class="fas fa-volume-up" style="color: var(--deep-blue);"></i>
                            <span style="color: var(--text-primary);">Current Accent:</span>
                            <span style="color: var(--text-muted);">${LANGUAGE_OPTIONS[currentLang]?.flag || '🇬🇧'} ${LANGUAGE_OPTIONS[currentLang]?.name || 'British English'}</span>
                        </div>
                    </div>
                    
                    <div class="flex gap-3">
                        <button onclick="window.StudyCompanion.testLanguage()" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary);">
                            <i class="fas fa-volume-up mr-1"></i> Test Accent
                        </button>
                        <button onclick="window.StudyCompanion.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                            <i class="fas fa-check mr-1"></i> Done
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
    }
}

function showUploadModal() {
    const modalHtml = `
        <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.StudyCompanion.closeModal()">
            <div class="rounded-2xl w-full max-w-lg mx-auto transform transition-all max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                    <div>
                        <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">
                            <i class="fas fa-cloud-upload-alt mr-2" style="color: var(--deep-blue);"></i>Upload Document
                        </h2>
                        <p class="text-xs md:text-sm text-muted mt-1">Upload PDF, PowerPoint, Word, or Text files</p>
                    </div>
                    <button onclick="window.StudyCompanion.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition">
                        <i class="fas fa-times text-muted"></i>
                    </button>
                </div>
                
                <div class="p-5">
                    <div id="drop-zone" class="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all hover:border-deep-blue" style="border-color: var(--border-color);">
                        <i class="fas fa-cloud-upload-alt text-5xl mb-3" style="color: var(--text-muted);"></i>
                        <p class="text-muted">Drag & drop your file here or click to browse</p>
                        <p class="text-xs text-muted mt-2">Supports: PDF, PPTX, DOCX, TXT (Max 10MB)</p>
                        <input type="file" id="file-input" accept=".pdf,.pptx,.docx,.txt" class="hidden">
                    </div>
                    
                    <div id="file-preview" class="hidden mt-4 p-3 rounded-lg" style="background: var(--bg-primary);">
                        <div class="flex items-center gap-3">
                            <i class="fas fa-file-alt text-2xl text-deep-blue"></i>
                            <div class="flex-1">
                                <p id="file-name" class="font-semibold" style="color: var(--text-primary);"></p>
                                <p id="file-size" class="text-xs text-muted"></p>
                            </div>
                            <button id="remove-file" class="text-red-500 hover:text-red-700">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div class="flex gap-3 mt-5">
                        <button id="process-file" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;" disabled>
                            <i class="fas fa-magic mr-1"></i> Convert to Audio
                        </button>
                        <button onclick="window.StudyCompanion.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const modalContainer = document.getElementById('modal-container');
    if (modalContainer) {
        modalContainer.innerHTML = modalHtml;
        modalContainer.style.pointerEvents = 'auto';
        
        setupFileUploadHandlers();
    }
}

function setupFileUploadHandlers() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const filePreview = document.getElementById('file-preview');
    const fileName = document.getElementById('file-name');
    const fileSize = document.getElementById('file-size');
    const removeBtn = document.getElementById('remove-file');
    const processBtn = document.getElementById('process-file');
    let selectedFile = null;
    
    dropZone.onclick = () => fileInput.click();
    
    dropZone.ondragover = (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--deep-blue)';
        dropZone.style.background = 'rgba(0, 87, 217, 0.05)';
    };
    
    dropZone.ondragleave = (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--border-color)';
        dropZone.style.background = 'transparent';
    };
    
    dropZone.ondrop = (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--border-color)';
        dropZone.style.background = 'transparent';
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    };
    
    fileInput.onchange = (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    };
    
    removeBtn.onclick = () => {
        selectedFile = null;
        filePreview.classList.add('hidden');
        processBtn.disabled = true;
        fileInput.value = '';
    };
    
    function handleFile(file) {
        const validExtensions = ['.pdf', '.pptx', '.docx', '.txt'];
        const fileName_lower = file.name.toLowerCase();
        const isValid = validExtensions.some(ext => fileName_lower.endsWith(ext));
        const maxSize = 10 * 1024 * 1024;
        
        if (!isValid) {
            showToast('Please upload PDF, PPTX, DOCX, or TXT files only', 'error');
            return;
        }
        
        if (file.size > maxSize) {
            showToast('File size must be less than 10MB', 'error');
            return;
        }
        
        selectedFile = file;
        fileName.textContent = file.name;
        fileSize.textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
        filePreview.classList.remove('hidden');
        processBtn.disabled = false;
    }
    
    processBtn.onclick = async () => {
        if (!selectedFile) return;
        
        processBtn.disabled = true;
        processBtn.innerHTML = '<div class="loading-spinner w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>';
        
        try {
            const result = await extractTextFromFile(selectedFile);
            
            const docData = {
                title: selectedFile.name.replace(/\.[^/.]+$/, ''),
                fileName: selectedFile.name,
                fileType: selectedFile.name.split('.').pop().toLowerCase(),
                content: result.text,
                pages: result.pages || Math.ceil(result.text.length / 2000),
                pageContents: result.pageContents || [],
                listened: false,
                userId: currentUser.uid,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };
            
            await addDoc(collection(db, 'audioDocuments'), docData);
            showToast(`Document converted! ${docData.pages} pages extracted.`, 'success');
            window.StudyCompanion.closeModal();
            await loadDocuments();
            
        } catch (error) {
            console.error('Error processing file:', error);
            showToast('Failed to process file. Please try again.', 'error');
            processBtn.disabled = false;
            processBtn.innerHTML = '<i class="fas fa-magic mr-1"></i> Convert to Audio';
        }
    };
}

async function extractTextFromFile(file) {
    const fileName = file.name.toLowerCase();
    let fullText = '';
    let pageContents = [];
    let pageCount = 0;
    
    if (fileName.endsWith('.txt')) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target.result;
                pageContents = splitIntoPages(text, 2000);
                resolve({ text, pages: pageContents.length, pageContents });
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        });
    } 
    else if (fileName.endsWith('.pdf')) {
        if (typeof pdfjsLib === 'undefined') {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js');
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
        }
        
        const arrayBuffer = await readFileAsArrayBuffer(file);
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        pageCount = pdf.numPages;
        
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            const cleanPageText = cleanPageContent(pageText, i, pageCount);
            pageContents.push(cleanPageText);
            fullText += cleanPageText + '\n\n';
        }
        
        return { text: fullText, pages: pageCount, pageContents };
    }
    else if (fileName.endsWith('.pptx')) {
        if (typeof JSZip === 'undefined') {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
        }
        
        const arrayBuffer = await readFileAsArrayBuffer(file);
        const zip = await JSZip.loadAsync(arrayBuffer);
        
        const slideFiles = Object.keys(zip.files).filter(name => 
            name.match(/ppt\/slides\/slide\d+\.xml/)
        );
        pageCount = slideFiles.length;
        
        for (const slideFile of slideFiles) {
            const xmlContent = await zip.files[slideFile].async('text');
            const textMatches = xmlContent.match(/<a:t>([^<]*)<\/a:t>/g);
            if (textMatches) {
                const slideText = textMatches.map(match => 
                    match.replace(/<\/?a:t>/g, '')
                ).join(' ');
                pageContents.push(slideText);
                fullText += slideText + '\n\n';
            } else {
                pageContents.push('');
            }
        }
        
        return { text: fullText, pages: pageCount, pageContents };
    }
    else if (fileName.endsWith('.docx')) {
        if (typeof mammoth === 'undefined') {
            await loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.4.2/mammoth.browser.min.js');
        }
        
        const arrayBuffer = await readFileAsArrayBuffer(file);
        const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
        const text = result.value;
        pageContents = splitIntoPages(text, 2000);
        
        return { text, pages: pageContents.length, pageContents };
    }
    
    throw new Error('Unsupported file type');
}

function splitIntoPages(text, charsPerPage) {
    const pages = [];
    const sentences = text.split(/(?<=[.!?])\s+/);
    let currentPage = '';
    
    for (const sentence of sentences) {
        if ((currentPage + sentence).length > charsPerPage && currentPage.length > 0) {
            pages.push(currentPage);
            currentPage = sentence;
        } else {
            currentPage += (currentPage ? ' ' : '') + sentence;
        }
    }
    
    if (currentPage) {
        pages.push(currentPage);
    }
    
    return pages;
}

function cleanPageContent(text, pageNum, totalPages) {
    let cleaned = text
        .replace(/^\s*\d+\s*$/, '')
        .replace(/page\s+\d+\s+of\s+\d+/gi, '')
        .replace(/page\s+\d+/gi, '')
        .replace(/^\s*[-–—]\s*$/, '')
        .replace(/www\.[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,}/g, '')
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    
    return cleaned;
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
}

function updateCaptionDisplay(text) {
    if (!captionVisible) return;
    
    const captionDisplay = document.getElementById('caption-display');
    if (captionDisplay) {
        captionDisplay.innerHTML = escapeHtml(text) || '<span class="text-muted italic">Waiting for audio...</span>';
    }
}

function speakChunk() {
    if (!isPlaying || isPaused) return;
    if (currentChunkIndex >= currentChunks.length) {
        finishPlayback();
        return;
    }
    
    const currentText = currentChunks[currentChunkIndex];
    updateCaptionDisplay(currentText);
    
    const speedControl = document.getElementById('speed-control');
    const speed = speedControl ? parseFloat(speedControl.value) : 1;
    
    const utterance = new SpeechSynthesisUtterance(currentText);
    utterance.rate = speed;
    utterance.lang = currentLanguage;
    
    if (currentVoice) {
        utterance.voice = currentVoice;
    }
    
    utterance.onend = () => {
        currentChunkIndex++;
        updateProgress();
        updatePageDisplay();
        if (currentChunkIndex < currentChunks.length && isPlaying && !isPaused) {
            setTimeout(() => speakChunk(), 100);
        } else if (currentChunkIndex >= currentChunks.length) {
            finishPlayback();
        }
    };
    utterance.onerror = (e) => {
        console.log('Speech error, continuing...', e.error);
        currentChunkIndex++;
        updateProgress();
        updatePageDisplay();
        if (currentChunkIndex < currentChunks.length && isPlaying && !isPaused) {
            setTimeout(() => speakChunk(), 500);
        } else if (currentChunkIndex >= currentChunks.length) {
            finishPlayback();
        }
    };
    
    currentUtterance = utterance;
    speechSynthesis.speak(utterance);
    updatePlayerButtons(true);
}

function updatePageDisplay() {
    const pageDisplay = document.getElementById('now-playing-page');
    if (pageDisplay && documentPages.length > 0) {
        const currentPage = Math.min(Math.floor(currentChunkIndex / (currentChunks.length / documentPages.length)) + 1, documentPages.length);
        pageDisplay.textContent = `Page: ${currentPage} / ${documentPages.length}`;
    }
}

function pauseAudio() {
    if (speechSynthesis.speaking && !speechSynthesis.paused) {
        speechSynthesis.pause();
        isPlaying = false;
        isPaused = true;
        updatePlayerButtons(false, true);
        updateCaptionDisplay('⏸️ Paused');
        showToast('Paused', 'info');
    }
}

function resumeAudio() {
    if (speechSynthesis.paused) {
        speechSynthesis.resume();
        isPlaying = true;
        isPaused = false;
        updatePlayerButtons(true);
        showToast('Resumed', 'info');
    } else if (!isPlaying && currentChunks.length > 0 && currentChunkIndex < currentChunks.length) {
        isPlaying = true;
        isPaused = false;
        speakChunk();
    }
}

function stopAudio() {
    speechSynthesis.cancel();
    isPlaying = false;
    isPaused = false;
    currentPlayingId = null;
    currentChunkIndex = 0;
    updatePlayerButtons(false);
    updateProgress();
    updateCaptionDisplay('⏹️ Stopped');
    
    const player = document.getElementById('audio-player');
    if (player) player.classList.add('hidden');
    
    renderDocuments(documentsCache);
    showToast('Stopped', 'info');
}

function seekAudio(seconds) {
    if (!currentChunks.length || isSeeking) return;
    isSeeking = true;
    
    try {
        const secondsPerChunk = 2.5;
        const chunksToSkip = Math.max(1, Math.floor(Math.abs(seconds) / secondsPerChunk));
        
        if (seconds < 0) {
            currentChunkIndex = Math.max(0, currentChunkIndex - chunksToSkip);
            showToast(`Backward ${Math.abs(seconds)} seconds`, 'info');
        } else {
            currentChunkIndex = Math.min(currentChunks.length - 1, currentChunkIndex + chunksToSkip);
            showToast(`Forward ${seconds} seconds`, 'info');
        }
        
        updateProgress();
        updatePageDisplay();
        
        if (currentChunks[currentChunkIndex]) {
            updateCaptionDisplay(currentChunks[currentChunkIndex]);
        }
        
        if (isPlaying && !isPaused) {
            speechSynthesis.cancel();
            setTimeout(() => speakChunk(), 200);
        }
    } catch (error) {
        console.error('Seek error:', error);
    } finally {
        setTimeout(() => {
            isSeeking = false;
        }, 300);
    }
}

function seekToPercent(percent) {
    if (!currentChunks.length || isSeeking) return;
    isSeeking = true;
    
    try {
        const newIndex = Math.floor(percent * currentChunks.length);
        currentChunkIndex = Math.min(currentChunks.length - 1, Math.max(0, newIndex));
        updateProgress();
        updatePageDisplay();
        
        if (currentChunks[currentChunkIndex]) {
            updateCaptionDisplay(currentChunks[currentChunkIndex]);
        }
        
        if (isPlaying && !isPaused) {
            speechSynthesis.cancel();
            setTimeout(() => speakChunk(), 200);
        }
        
        showToast(`Jumped to ${Math.round(percent * 100)}%`, 'info');
    } catch (error) {
        console.error('Seek error:', error);
    } finally {
        setTimeout(() => {
            isSeeking = false;
        }, 300);
    }
}

function updateProgress() {
    const progress = currentChunks.length > 0 ? (currentChunkIndex / currentChunks.length) * 100 : 0;
    const progressBar = document.getElementById('audio-progress');
    if (progressBar) progressBar.style.width = `${progress}%`;
    
    const currentTimeElem = document.getElementById('current-time');
    if (currentTimeElem) {
        const elapsedSeconds = currentChunkIndex * 2.5;
        currentTimeElem.textContent = formatTime(elapsedSeconds);
    }
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function finishPlayback() {
    isPlaying = false;
    isPaused = false;
    updatePlayerButtons(false);
    updateCaptionDisplay('Playback completed! 🎉');
    showToast('Playback completed! 🎉', 'success');
    
    if (currentPlayingId) {
        markAsListened(currentPlayingId);
    }
    
    currentPlayingId = null;
    renderDocuments(documentsCache);
    
    const player = document.getElementById('audio-player');
    if (player) player.classList.add('hidden');
}

function updatePlayerButtons(playing, paused = false) {
    const playBtn = document.getElementById('play-btn');
    const pauseBtn = document.getElementById('pause-btn');
    
    if (playing && !paused) {
        if (playBtn) playBtn.classList.add('hidden');
        if (pauseBtn) pauseBtn.classList.remove('hidden');
    } else {
        if (playBtn) playBtn.classList.remove('hidden');
        if (pauseBtn) pauseBtn.classList.add('hidden');
    }
}

function splitTextIntoChunks(text, chunkSize) {
    if (!text) return [];
    const chunks = [];
    const sentences = text.split(/(?<=[.!?])\s+/);
    let currentChunk = '';
    
    for (const sentence of sentences) {
        if (sentence.trim().length < 3) continue;
        if ((currentChunk + sentence).length > chunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = sentence;
        } else {
            currentChunk += (currentChunk ? ' ' : '') + sentence;
        }
    }
    
    if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
    }
    
    if (chunks.length === 0 && text.trim().length > 0) {
        chunks.push(text.trim());
    }
    
    return chunks;
}

async function markAsListened(docId) {
    try {
        await updateDoc(doc(db, 'audioDocuments', docId), {
            listened: true,
            lastListened: serverTimestamp()
        });
        await loadDocuments();
    } catch (error) {
        console.error('Error marking as listened:', error);
    }
}

// StudyCompanion Global Object
window.StudyCompanion = {
    quickSelectLanguage: (langCode) => {
        window.StudyCompanion.selectLanguage(langCode);
        const quickDisplay = document.getElementById('quick-accent-display');
        if (quickDisplay) {
            quickDisplay.textContent = `${LANGUAGE_OPTIONS[langCode]?.flag || '🇬🇧'} ${LANGUAGE_OPTIONS[langCode]?.name || 'British English'}`;
        }
        const currentDisplay = document.getElementById('current-accent-display');
        if (currentDisplay) {
            currentDisplay.textContent = `${LANGUAGE_OPTIONS[langCode]?.flag || '🇬🇧'} ${LANGUAGE_OPTIONS[langCode]?.short || 'British'}`;
        }
    },
    
    selectLanguage: (langCode) => {
        if (!LANGUAGE_OPTIONS[langCode]) return;
        
        saveLanguagePreference(langCode);
        currentLanguage = langCode;
        
        const voices = speechSynthesis.getVoices();
        const matchingVoices = voices.filter(voice => voice.lang.startsWith(langCode));
        
        if (matchingVoices.length > 0) {
            currentVoice = matchingVoices.find(v => v.name.includes('Female')) || matchingVoices[0];
        } else {
            currentVoice = null;
        }
        
        const langDisplay = document.getElementById('now-playing-language');
        if (langDisplay) {
            langDisplay.innerHTML = `<i class="fas fa-language"></i> Accent: ${LANGUAGE_OPTIONS[langCode]?.flag || '🇬🇧'} ${LANGUAGE_OPTIONS[langCode]?.name || 'British English'} <button onclick="window.StudyCompanion.showLanguageSettings()" class="ml-2 text-xs hover:underline" style="color: var(--deep-blue);">Change</button>`;
        }
        
        const quickDisplay = document.getElementById('quick-accent-display');
        if (quickDisplay) {
            quickDisplay.textContent = `${LANGUAGE_OPTIONS[langCode]?.flag || '🇬🇧'} ${LANGUAGE_OPTIONS[langCode]?.name || 'British English'}`;
        }
        
        const currentDisplay = document.getElementById('current-accent-display');
        if (currentDisplay) {
            currentDisplay.textContent = `${LANGUAGE_OPTIONS[langCode]?.flag || '🇬🇧'} ${LANGUAGE_OPTIONS[langCode]?.short || 'British'}`;
        }
        
        showToast(`Accent changed to ${LANGUAGE_OPTIONS[langCode]?.name || 'British English'}`, 'success');
        window.StudyCompanion.closeModal();
    },
    
    testLanguage: () => {
        const testText = 'Hello! This is a test of the accent you have selected. How does it sound?';
        const utterance = new SpeechSynthesisUtterance(testText);
        utterance.lang = currentLanguage;
        utterance.rate = 1;
        
        if (currentVoice) {
            utterance.voice = currentVoice;
        }
        
        speechSynthesis.speak(utterance);
        showToast(`Testing ${LANGUAGE_OPTIONS[currentLanguage]?.name || 'British English'} accent...`, 'info');
    },
    
    showLanguageSettings: showLanguageSettings,
    
    showPageSettings: async (docId) => {
        const doc = documentsCache.find(d => d.id === docId);
        if (!doc) return;
        
        const pageCount = doc.pages || Math.ceil((doc.content?.length || 0) / 2000);
        const pages = doc.pageContents || [];
        
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) window.StudyCompanion.closeModal()">
                <div class="rounded-2xl w-full max-w-lg mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                    <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                        <div>
                            <h2 class="text-xl md:text-2xl font-bold" style="color: var(--text-primary);">
                                <i class="fas fa-pager mr-2" style="color: var(--deep-blue);"></i>Page Settings
                            </h2>
                            <p class="text-xs md:text-sm text-muted mt-1">Select which pages to include in the audio</p>
                        </div>
                        <button onclick="window.StudyCompanion.closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                    
                    <div class="p-5">
                        <div class="mb-4">
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Start Page</label>
                            <div class="flex items-center gap-4">
                                <input type="range" id="start-page-slider" min="1" max="${pageCount}" value="${startPage || 1}" class="flex-1">
                                <span id="start-page-display" class="font-bold min-w-[60px] text-center" style="color: var(--deep-blue);">1</span>
                            </div>
                            <p class="text-xs text-muted mt-1">Audio will start from this page</p>
                        </div>
                        
                        <div class="mb-4">
                            <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">End Page</label>
                            <div class="flex items-center gap-4">
                                <input type="range" id="end-page-slider" min="1" max="${pageCount}" value="${pageCount}" class="flex-1">
                                <span id="end-page-display" class="font-bold min-w-[60px] text-center" style="color: var(--deep-blue);">${pageCount}</span>
                            </div>
                            <p class="text-xs text-muted mt-1">Audio will end at this page</p>
                        </div>
                        
                        <div class="mb-4 p-3 rounded-lg" style="background: var(--bg-primary);">
                            <div class="flex justify-between text-sm">
                                <span style="color: var(--text-primary);">Selected Range</span>
                                <span style="color: var(--text-muted);" id="page-range-display">Page 1 - ${pageCount}</span>
                            </div>
                            <div class="flex justify-between text-sm mt-1">
                                <span style="color: var(--text-primary);">Total Pages</span>
                                <span style="color: var(--text-muted);" id="selected-page-count">${pageCount}</span>
                            </div>
                        </div>
                        
                        <div class="flex gap-3">
                            <button onclick="window.StudyCompanion.applyPageSettings('${docId}')" class="flex-1 py-2.5 rounded-lg font-semibold transition-all transform hover:scale-[1.02]" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                                <i class="fas fa-check mr-1"></i> Apply Settings
                            </button>
                            <button onclick="window.StudyCompanion.closeModal()" class="flex-1 py-2.5 rounded-lg font-semibold border transition-all hover:bg-gray-100" style="background: var(--bg-primary); color: var(--text-primary); border-color: var(--border-color);">
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
            
            const startSlider = document.getElementById('start-page-slider');
            const endSlider = document.getElementById('end-page-slider');
            const startDisplay = document.getElementById('start-page-display');
            const endDisplay = document.getElementById('end-page-display');
            const rangeDisplay = document.getElementById('page-range-display');
            const countDisplay = document.getElementById('selected-page-count');
            
            const updateRange = () => {
                const start = parseInt(startSlider.value);
                const end = parseInt(endSlider.value);
                const total = Math.max(0, end - start + 1);
                startDisplay.textContent = start;
                endDisplay.textContent = end;
                rangeDisplay.textContent = `Page ${start} - ${end}`;
                countDisplay.textContent = total;
            };
            
            startSlider.addEventListener('input', () => {
                if (parseInt(startSlider.value) > parseInt(endSlider.value)) {
                    endSlider.value = startSlider.value;
                }
                updateRange();
            });
            
            endSlider.addEventListener('input', () => {
                if (parseInt(endSlider.value) < parseInt(startSlider.value)) {
                    startSlider.value = endSlider.value;
                }
                updateRange();
            });
            
            updateRange();
        }
    },
    
    applyPageSettings: async (docId) => {
        const start = parseInt(document.getElementById('start-page-slider').value);
        const end = parseInt(document.getElementById('end-page-slider').value);
        const doc = documentsCache.find(d => d.id === docId);
        
        if (!doc) {
            showToast('Document not found', 'error');
            return;
        }
        
        const pageContents = doc.pageContents || [];
        const totalPages = pageContents.length || Math.ceil((doc.content?.length || 0) / 2000);
        
        const selectedContent = [];
        for (let i = start - 1; i < Math.min(end, totalPages); i++) {
            if (pageContents[i]) {
                selectedContent.push(pageContents[i]);
            } else {
                const chunkSize = Math.ceil(doc.content.length / totalPages);
                const startIdx = i * chunkSize;
                const endIdx = Math.min(startIdx + chunkSize, doc.content.length);
                selectedContent.push(doc.content.substring(startIdx, endIdx));
            }
        }
        
        const fullText = selectedContent.join('\n\n');
        
        const docIndex = documentsCache.findIndex(d => d.id === docId);
        if (docIndex !== -1) {
            documentsCache[docIndex].selectedContent = fullText;
            documentsCache[docIndex].selectedStartPage = start;
            documentsCache[docIndex].selectedEndPage = end;
        }
        
        showToast(`Pages ${start} - ${end} selected (${selectedContent.length} pages)`, 'success');
        window.StudyCompanion.closeModal();
        
        if (currentPlayingId === docId) {
            window.StudyCompanion.playDocument(docId);
        }
    },
    
    playDocument: async (docId) => {
        const doc = documentsCache.find(d => d.id === docId);
        if (!doc) return;
        
        if (currentPlayingId === docId && isPlaying) {
            stopAudio();
            return;
        }
        
        if (currentUtterance) {
            speechSynthesis.cancel();
        }
        
        let content = doc.selectedContent || doc.content || '';
        const pageContents = doc.pageContents || [];
        const totalPages = pageContents.length || Math.ceil((doc.content?.length || 0) / 2000);
        
        if (!content && pageContents.length > 0) {
            const start = doc.selectedStartPage || 1;
            const end = doc.selectedEndPage || totalPages;
            const selectedContent = [];
            for (let i = start - 1; i < Math.min(end, totalPages); i++) {
                if (pageContents[i]) {
                    selectedContent.push(pageContents[i]);
                }
            }
            content = selectedContent.join('\n\n');
        }
        
        if (!content) {
            showToast('No content available to play', 'error');
            return;
        }
        
        documentPages = pageContents;
        const startPage = doc.selectedStartPage || 1;
        const endPage = doc.selectedEndPage || totalPages;
        
        if (!currentVoice) {
            const voices = speechSynthesis.getVoices();
            const matchingVoices = voices.filter(voice => voice.lang.startsWith(currentLanguage));
            if (matchingVoices.length > 0) {
                currentVoice = matchingVoices.find(v => v.name.includes('Female')) || matchingVoices[0];
            }
        }
        
        currentPlayingId = docId;
        currentChunkIndex = 0;
        isPlaying = true;
        isPaused = false;
        
        const player = document.getElementById('audio-player');
        const nowPlayingTitle = document.getElementById('now-playing-title');
        const nowPlayingDoc = document.getElementById('now-playing-doc');
        const nowPlayingPage = document.getElementById('now-playing-page');
        const nowPlayingLanguage = document.getElementById('now-playing-language');
        
        if (player) player.classList.remove('hidden');
        if (nowPlayingTitle) nowPlayingTitle.textContent = doc.title;
        if (nowPlayingDoc) {
            const selectedPages = Math.max(0, endPage - startPage + 1);
            nowPlayingDoc.textContent = `${doc.fileType.toUpperCase()} • ${selectedPages} pages selected (${startPage}-${endPage})`;
        }
        if (nowPlayingPage) nowPlayingPage.textContent = `Page: ${startPage} / ${endPage}`;
        if (nowPlayingLanguage) {
            nowPlayingLanguage.innerHTML = `<i class="fas fa-language"></i> Accent: ${LANGUAGE_OPTIONS[currentLanguage]?.flag || '🇬🇧'} ${LANGUAGE_OPTIONS[currentLanguage]?.name || 'British English'} <button onclick="window.StudyCompanion.showLanguageSettings()" class="ml-2 text-xs hover:underline" style="color: var(--deep-blue);">Change</button>`;
        }
        
        currentChunks = splitTextIntoChunks(content, 1500);
        totalDuration = currentChunks.length * 2;
        
        const totalTimeElem = document.getElementById('total-time');
        if (totalTimeElem) totalTimeElem.textContent = formatTime(totalDuration);
        
        updateProgress();
        speakChunk();
        renderDocuments(documentsCache);
    },
    
    deleteDocument: async (docId) => {
        if (confirm('Delete this document?')) {
            await deleteDoc(doc(db, 'audioDocuments', docId));
            showToast('Document deleted', 'success');
            await loadDocuments();
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

// Load voices when available
if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
        const voices = speechSynthesis.getVoices();
        if (voices.length > 0) {
            const matchingVoices = voices.filter(voice => voice.lang.startsWith(currentLanguage));
            if (matchingVoices.length > 0) {
                currentVoice = matchingVoices.find(v => v.name.includes('Female')) || matchingVoices[0];
            }
        }
    };
}

// CSS for loading spinner and line clamp
const styleSheet = document.createElement("style");
styleSheet.textContent = `
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
    .loading-spinner {
        animation: spin 0.6s linear infinite;
    }
    .line-clamp-1 {
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
    .line-clamp-2 {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
`;
document.head.appendChild(styleSheet);