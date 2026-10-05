// js/pages/identity.js
import { db, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, onSnapshot } from '../firebase-config.js';
import { showToast, escapeHtml, formatDate, formatCurrency } from '../utils/helpers.js';

// Add html2pdf for proper PDF generation
const html2pdfScript = document.createElement('script');
html2pdfScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
document.head.appendChild(html2pdfScript);

let currentUser = null;
let currentOutputType = 'resume';
let currentCategory = 'all';
let selectedTemplate = null;
let currentColor = '#004ac6';
let savedProfiles = [];
let profilePhotoBase64 = null;
let html2pdfLoaded = false;

// Wait for html2pdf to load
html2pdfScript.onload = () => { html2pdfLoaded = true; };

// ====== EXTENDED STUNNING MODERN TEMPLATES (27+ Templates) ======
const templates = [
    // === PROFESSIONAL TEMPLATES (6) ===
    { 
        id: 'premium-executive', 
        name: 'Premium Executive', 
        category: 'professional', 
        icon: 'fa-crown', 
        color: '#1a1a2e',
        style: 'premium',
        description: 'Luxurious dark design with gold accents',
        layout: 'sidebar-elegant',
        font: 'Inter',
        bgColor: '#1a1a2e',
        accentColor: '#d4af37'
    },
    { 
        id: 'corporate-elegance', 
        name: 'Corporate Elegance', 
        category: 'professional', 
        icon: 'fa-building', 
        color: '#004ac6',
        style: 'elegant',
        description: 'Sophisticated blue with geometric patterns',
        layout: 'sidebar-modern',
        font: 'Inter',
        bgColor: '#f0f4ff',
        accentColor: '#004ac6'
    },
    { 
        id: 'minimal-luxe', 
        name: 'Minimal Luxe', 
        category: 'professional', 
        icon: 'fa-gem', 
        color: '#2d3748',
        style: 'minimal-luxury',
        description: 'Clean luxury with subtle gradients',
        layout: 'centered-luxury',
        font: 'Georgia',
        bgColor: '#ffffff',
        accentColor: '#2d3748'
    },
    { 
        id: 'modern-corporate', 
        name: 'Modern Corporate', 
        category: 'professional', 
        icon: 'fa-briefcase', 
        color: '#0d9488',
        style: 'modern-corporate',
        description: 'Contemporary with teal accents',
        layout: 'modern-simple',
        font: 'Inter',
        bgColor: '#ffffff',
        accentColor: '#0d9488'
    },
    { 
        id: 'executive-black', 
        name: 'Executive Black', 
        category: 'professional', 
        icon: 'fa-user-tie', 
        color: '#000000',
        style: 'executive-black',
        description: 'Bold black and white executive design',
        layout: 'executive-dark',
        font: 'Inter',
        bgColor: '#000000',
        accentColor: '#ffffff'
    },
    { 
        id: 'navy-classic', 
        name: 'Navy Classic', 
        category: 'professional', 
        icon: 'fa-anchor', 
        color: '#1a2a4a',
        style: 'navy-classic',
        description: 'Timeless navy blue professional',
        layout: 'classic-navy',
        font: 'Georgia',
        bgColor: '#f8faff',
        accentColor: '#1a2a4a'
    },

    // === CREATIVE TEMPLATES (6) ===
    { 
        id: 'creative-portfolio', 
        name: 'Creative Portfolio', 
        category: 'creative', 
        icon: 'fa-palette', 
        color: '#7c3aed',
        style: 'creative-portfolio',
        description: 'Artistic design with color blocks',
        layout: 'creative-grid',
        font: 'Inter',
        bgColor: '#faf5ff',
        accentColor: '#7c3aed'
    },
    { 
        id: 'gradient-artist', 
        name: 'Gradient Artist', 
        category: 'creative', 
        icon: 'fa-fill-drip', 
        color: '#0891b2',
        style: 'gradient-artist',
        description: 'Stunning gradient overlays',
        layout: 'gradient-layout',
        font: 'Inter',
        bgColor: '#ffffff',
        accentColor: '#0891b2'
    },
    { 
        id: 'vibrant-dynamic', 
        name: 'Vibrant Dynamic', 
        category: 'creative', 
        icon: 'fa-rocket', 
        color: '#f59e0b',
        style: 'vibrant-dynamic',
        description: 'Energetic with bold colors',
        layout: 'dynamic-split',
        font: 'Inter',
        bgColor: '#fffbeb',
        accentColor: '#f59e0b'
    },
    { 
        id: 'urban-modern', 
        name: 'Urban Modern', 
        category: 'creative', 
        icon: 'fa-city', 
        color: '#ec4899',
        style: 'urban-modern',
        description: 'Modern urban aesthetic',
        layout: 'urban-layout',
        font: 'Inter',
        bgColor: '#fdf2f8',
        accentColor: '#ec4899'
    },
    { 
        id: 'art-deco', 
        name: 'Art Deco', 
        category: 'creative', 
        icon: 'fa-landmark', 
        color: '#b8860b',
        style: 'art-deco',
        description: 'Elegant art deco inspired design',
        layout: 'art-deco-layout',
        font: 'Georgia',
        bgColor: '#faf6ed',
        accentColor: '#b8860b'
    },
    { 
        id: 'neon-dream', 
        name: 'Neon Dream', 
        category: 'creative', 
        icon: 'fa-lightbulb', 
        color: '#ff3366',
        style: 'neon-dream',
        description: 'Vibrant neon aesthetic',
        layout: 'neon-layout',
        font: 'Inter',
        bgColor: '#0a0a1a',
        accentColor: '#ff3366'
    },

    // === ACADEMIC TEMPLATES (5) ===
    { 
        id: 'academic-scholar', 
        name: 'Academic Scholar', 
        category: 'academic', 
        icon: 'fa-flask', 
        color: '#7c3aed',
        style: 'academic-scholar',
        description: 'Traditional academic with modern flair',
        layout: 'academic-full',
        font: 'Georgia',
        bgColor: '#f8f7ff',
        accentColor: '#7c3aed'
    },
    { 
        id: 'research-pioneer', 
        name: 'Research Pioneer', 
        category: 'academic', 
        icon: 'fa-microscope', 
        color: '#004ac6',
        style: 'research-pioneer',
        description: 'Research-focused design',
        layout: 'research-layout',
        font: 'Inter',
        bgColor: '#f0f7ff',
        accentColor: '#004ac6'
    },
    { 
        id: 'academic-excellence', 
        name: 'Academic Excellence', 
        category: 'academic', 
        icon: 'fa-graduation-cap', 
        color: '#059669',
        style: 'academic-excellence',
        description: 'Clean academic design',
        layout: 'academic-clean',
        font: 'Inter',
        bgColor: '#f0fdf4',
        accentColor: '#059669'
    },
    { 
        id: 'phd-classic', 
        name: 'PhD Classic', 
        category: 'academic', 
        icon: 'fa-university', 
        color: '#6b3fa0',
        style: 'phd-classic',
        description: 'Classic PhD candidate design',
        layout: 'phd-layout',
        font: 'Times New Roman',
        bgColor: '#fcf9ff',
        accentColor: '#6b3fa0'
    },
    { 
        id: 'science-modern', 
        name: 'Science Modern', 
        category: 'academic', 
        icon: 'fa-atom', 
        color: '#0ea5e9',
        style: 'science-modern',
        description: 'Modern scientific academic',
        layout: 'science-layout',
        font: 'Inter',
        bgColor: '#f0f9ff',
        accentColor: '#0ea5e9'
    },

    // === INDUSTRY TEMPLATES (6) ===
    { 
        id: 'tech-innovator', 
        name: 'Tech Innovator', 
        category: 'industry', 
        icon: 'fa-code', 
        color: '#004ac6',
        style: 'tech-innovator',
        description: 'Tech-focused with code aesthetic',
        layout: 'tech-dark',
        font: 'JetBrains Mono',
        bgColor: '#0a0e1a',
        accentColor: '#004ac6'
    },
    { 
        id: 'healthcare-hero', 
        name: 'Healthcare Hero', 
        category: 'industry', 
        icon: 'fa-heartbeat', 
        color: '#059669',
        style: 'healthcare-hero',
        description: 'Clean healthcare professional design',
        layout: 'healthcare-layout',
        font: 'Inter',
        bgColor: '#f0fdf4',
        accentColor: '#059669'
    },
    { 
        id: 'marketing-guru', 
        name: 'Marketing Guru', 
        category: 'industry', 
        icon: 'fa-bullhorn', 
        color: '#dc2626',
        style: 'marketing-guru',
        description: 'Dynamic marketing professional',
        layout: 'marketing-layout',
        font: 'Inter',
        bgColor: '#fef2f2',
        accentColor: '#dc2626'
    },
    { 
        id: 'finance-pro', 
        name: 'Finance Pro', 
        category: 'industry', 
        icon: 'fa-chart-line', 
        color: '#0891b2',
        style: 'finance-pro',
        description: 'Professional finance executive',
        layout: 'finance-layout',
        font: 'Inter',
        bgColor: '#ecfeff',
        accentColor: '#0891b2'
    },
    { 
        id: 'legal-eagle', 
        name: 'Legal Eagle', 
        category: 'industry', 
        icon: 'fa-gavel', 
        color: '#4a3728',
        style: 'legal-eagle',
        description: 'Legal professional design',
        layout: 'legal-layout',
        font: 'Georgia',
        bgColor: '#fcf9f5',
        accentColor: '#4a3728'
    },
    { 
        id: 'architecture-modern', 
        name: 'Architecture Modern', 
        category: 'industry', 
        icon: 'fa-drafting-compass', 
        color: '#78716c',
        style: 'architecture-modern',
        description: 'Clean architectural design',
        layout: 'architecture-layout',
        font: 'Inter',
        bgColor: '#faf9f8',
        accentColor: '#78716c'
    },

    // === MINIMAL TEMPLATES (4) ===
    { 
        id: 'ultra-minimal', 
        name: 'Ultra Minimal', 
        category: 'professional', 
        icon: 'fa-square', 
        color: '#4a5568',
        style: 'ultra-minimal',
        description: 'Cleanest possible design',
        layout: 'ultra-minimal-layout',
        font: 'Inter',
        bgColor: '#ffffff',
        accentColor: '#4a5568'
    },
    { 
        id: 'white-space', 
        name: 'White Space', 
        category: 'professional', 
        icon: 'fa-arrow-right', 
        color: '#2d3748',
        style: 'white-space',
        description: 'Maximal whitespace design',
        layout: 'white-space-layout',
        font: 'Georgia',
        bgColor: '#ffffff',
        accentColor: '#2d3748'
    },
    { 
        id: 'monochrome', 
        name: 'Monochrome', 
        category: 'creative', 
        icon: 'fa-circle', 
        color: '#1a202c',
        style: 'monochrome',
        description: 'Black and white minimalist',
        layout: 'monochrome-layout',
        font: 'Inter',
        bgColor: '#fafafa',
        accentColor: '#1a202c'
    },
    { 
        id: 'clean-modern', 
        name: 'Clean Modern', 
        category: 'professional', 
        icon: 'fa-star', 
        color: '#0d9488',
        style: 'clean-modern',
        description: 'Crisp clean modern design',
        layout: 'clean-modern-layout',
        font: 'Inter',
        bgColor: '#ffffff',
        accentColor: '#0d9488'
    }
];

// ====== DEFAULT PROFILE DATA ======
let profileData = {
    name: 'ProfJero',
    title: 'Software Engineer',
    email: 'profjero947@gmail.com',
    phone: '+233 24 000 0000',
    location: 'Cape Coast, Ghana',
    linkedin: 'https://linkedin.com/in/profjero',
    github: 'https://github.com/profjero',
    bio: 'Passionate Software Engineer with a strong foundation in full-stack development. Experienced in building scalable web applications and contributing to open-source projects. Dedicated to continuous learning and mentoring the next generation of developers.',
    skills: ['JavaScript', 'React', 'Node.js', 'Python', 'Flutter', 'Firebase', 'TypeScript', 'AWS'],
    experience: [
        { company: 'TechCorp Inc.', title: 'Senior Software Engineer', years: '2023-Present', description: 'Leading development of cloud-native applications serving 50K+ users. Implementing microservices architecture and CI/CD pipelines.' },
        { company: 'StartupX', title: 'Full Stack Developer', years: '2020-2023', description: 'Built and scaled the core product from MVP to Series B. Implemented real-time features using WebSocket and Redis.' }
    ],
    education: [
        { school: 'University of Cape Coast (UCC)', degree: 'BSc Computer Science', years: '2023-2027' },
        { school: 'UPSHS', degree: 'High School Diploma', years: '2020-2023' },
        { school: 'Royal Home Basic Sch', degree: 'Basic Education', years: 'Completed 2020' }
    ],
    certifications: ['AWS Certified Solutions Architect', 'Google Cloud Professional', 'Scrum Master Certified'],
    languages: ['English (Fluent)', 'Twi/Fante (Native)', 'Ga (Conversational)'],
    interests: ['Open Source', 'AI/ML', 'Photography', 'Gaming', 'Mentoring']
};

// ====== RENDER FUNCTIONS ======

export async function renderIdentityPage(user) {
    currentUser = user;
    await loadSavedProfiles();
    
    return `
        <div class="space-y-6 animate-fade-in-up">
            <!-- Header -->
            <div class="glass-card rounded-2xl p-5 md:p-6">
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 class="text-2xl md:text-3xl font-bold" style="color: var(--text-primary);">
                            <i class="fas fa-id-card mr-3" style="color: var(--deep-blue);"></i>Identity Builder
                        </h1>
                        <p class="text-muted mt-1 text-sm">Create professional resumes, CVs, bios, cover letters, and more from a single profile</p>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <button id="generate-identity-btn" class="px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-all transform hover:scale-[1.02] text-sm" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                            <i class="fas fa-magic"></i> Generate
                        </button>
                        <button id="save-profile-btn" class="px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-all hover:shadow-md text-sm" style="background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary);">
                            <i class="fas fa-save"></i> Save
                        </button>
                        <button id="load-profile-btn" class="px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-all hover:shadow-md text-sm" style="background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary);">
                            <i class="fas fa-upload"></i> Load
                        </button>
                    </div>
                </div>
            </div>

            <!-- Stats Cards -->
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div class="glass-card rounded-xl p-4 transition-all hover:shadow-lg text-center">
                    <div class="text-2xl font-bold" id="template-count" style="color: var(--text-primary);">${templates.length}</div>
                    <div class="text-xs text-muted mt-1">Templates</div>
                </div>
                <div class="glass-card rounded-xl p-4 transition-all hover:shadow-lg text-center">
                    <div class="text-2xl font-bold" id="output-count" style="color: var(--emerald);">6</div>
                    <div class="text-xs text-muted mt-1">Outputs</div>
                </div>
                <div class="glass-card rounded-xl p-4 transition-all hover:shadow-lg text-center">
                    <div class="text-2xl font-bold" id="resume-count" style="color: #f59e0b;">0</div>
                    <div class="text-xs text-muted mt-1">Resumes</div>
                </div>
                <div class="glass-card rounded-xl p-4 transition-all hover:shadow-lg text-center">
                    <div class="text-2xl font-bold" id="cover-count" style="color: #8b5cf6;">0</div>
                    <div class="text-xs text-muted mt-1">Cover Letters</div>
                </div>
                <div class="glass-card rounded-xl p-4 transition-all hover:shadow-lg text-center">
                    <div class="text-2xl font-bold" id="profile-count" style="color: #06b6d4;">${savedProfiles.length}</div>
                    <div class="text-xs text-muted mt-1">Profiles</div>
                </div>
            </div>

            <!-- Main Content Grid -->
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <!-- Sidebar: Profile Form -->
                <div class="lg:col-span-4">
                    <div class="glass-card rounded-2xl p-5 space-y-5 sticky top-24" style="max-height: calc(100vh - 120px); overflow-y: auto; background: var(--bg-secondary); border-color: var(--border-color);">
                        <!-- Form Header -->
                        <div class="flex items-center justify-between pb-4 border-b" style="border-color: var(--border-color);">
                            <h2 class="font-bold text-lg flex items-center gap-2" style="color: var(--text-primary);">
                                <i class="fas fa-user-edit" style="color: var(--deep-blue);"></i>
                                Profile Information
                            </h2>
                            <span class="text-[10px] px-2 py-1 rounded-full" style="background: var(--deep-blue)15; color: var(--deep-blue);">Required</span>
                        </div>
                        
                        <!-- Profile Photo Upload -->
                        <div class="flex flex-col items-center py-3 border-b" style="border-color: var(--border-color);">
                            <div class="relative">
                                <div id="profile-photo-preview" class="w-24 h-24 rounded-full border-4 overflow-hidden flex items-center justify-center" style="background: var(--bg-primary); border-color: var(--deep-blue);">
                                    ${profilePhotoBase64 ? 
                                        `<img src="${profilePhotoBase64}" alt="Profile Photo" class="w-full h-full object-cover">` :
                                        `<i class="fas fa-user text-4xl" style="color: var(--text-muted);"></i>`
                                    }
                                </div>
                                <button id="upload-photo-btn" class="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110" style="background: var(--deep-blue); color: white; border: 2px solid var(--bg-secondary);">
                                    <i class="fas fa-camera text-xs"></i>
                                </button>
                                <input type="file" id="photo-input" accept="image/*" class="hidden">
                            </div>
                            <button id="remove-photo-btn" class="text-xs text-red-500 mt-2 hover:underline ${profilePhotoBase64 ? '' : 'hidden'}">Remove Photo</button>
                            <p class="text-[10px] text-muted mt-1">Upload profile photo (max 500KB)</p>
                        </div>
                        
                        <form id="identity-profile-form" class="space-y-4">
                            <!-- Personal Information Section -->
                            <div class="space-y-3">
                                <div class="flex items-center gap-2 mb-2">
                                    <span class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">Personal Details</span>
                                    <div class="flex-1 h-px" style="background: var(--border-color);"></div>
                                </div>
                                
                                <div class="form-group">
                                    <label class="form-label">Full Name <span class="text-red-500">*</span></label>
                                    <input type="text" id="id-full-name" class="form-input" placeholder="e.g., Alex Rivera" value="${escapeHtml(profileData.name)}" />
                                </div>
                                
                                <div class="form-group">
                                    <label class="form-label">Job Title <span class="text-red-500">*</span></label>
                                    <input type="text" id="id-job-title" class="form-input" placeholder="e.g., Senior Software Engineer" value="${escapeHtml(profileData.title)}" />
                                </div>
                                
                                <div class="grid grid-cols-2 gap-3">
                                    <div class="form-group">
                                        <label class="form-label">Email <span class="text-red-500">*</span></label>
                                        <input type="email" id="id-email" class="form-input" placeholder="alex@example.com" value="${escapeHtml(profileData.email)}" />
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">Phone</label>
                                        <input type="text" id="id-phone" class="form-input" placeholder="+233 24 000 0000" value="${escapeHtml(profileData.phone)}" />
                                    </div>
                                </div>
                                
                                <div class="form-group">
                                    <label class="form-label">Location</label>
                                    <input type="text" id="id-location" class="form-input" placeholder="e.g., Cape Coast, Ghana" value="${escapeHtml(profileData.location)}" />
                                </div>
                                
                                <div class="grid grid-cols-2 gap-3">
                                    <div class="form-group">
                                        <label class="form-label">LinkedIn URL</label>
                                        <input type="url" id="id-linkedin" class="form-input" placeholder="https://linkedin.com/in/..." value="${escapeHtml(profileData.linkedin)}" />
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">GitHub URL</label>
                                        <input type="url" id="id-github" class="form-input" placeholder="https://github.com/..." value="${escapeHtml(profileData.github)}" />
                                    </div>
                                </div>
                            </div>

                            <!-- Professional Summary -->
                            <div class="space-y-2">
                                <div class="flex items-center gap-2 mb-2">
                                    <span class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">Professional Summary</span>
                                    <div class="flex-1 h-px" style="background: var(--border-color);"></div>
                                </div>
                                <div class="form-group">
                                    <label class="form-label">Bio / Summary <span class="text-red-500">*</span></label>
                                    <textarea id="id-bio" rows="3" class="form-input resize-none" placeholder="Write a brief professional summary...">${escapeHtml(profileData.bio)}</textarea>
                                </div>
                            </div>

                            <!-- Skills -->
                            <div class="space-y-2">
                                <div class="flex items-center gap-2 mb-2">
                                    <span class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">Skills</span>
                                    <div class="flex-1 h-px" style="background: var(--border-color);"></div>
                                </div>
                                <div class="form-group">
                                    <label class="form-label">Skills (comma separated) <span class="text-red-500">*</span></label>
                                    <input type="text" id="id-skills" class="form-input" placeholder="JavaScript, React, Node.js, Python" value="${escapeHtml(profileData.skills.join(', '))}" />
                                    <p class="text-[10px] text-muted mt-1">Separate skills with commas</p>
                                </div>
                            </div>

                            <!-- Experience -->
                            <div class="space-y-2">
                                <div class="flex items-center gap-2 mb-2">
                                    <span class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">Experience</span>
                                    <div class="flex-1 h-px" style="background: var(--border-color);"></div>
                                </div>
                                <div class="form-group">
                                    <label class="form-label">Work Experience</label>
                                    <textarea id="id-experience" rows="4" class="form-input resize-none" placeholder="Company, Title, Years, Description (one per line)">${profileData.experience.map(e => `${e.company}, ${e.title}, ${e.years}, ${e.description}`).join('\n')}</textarea>
                                    <p class="text-[10px] text-muted mt-1">Format: Company, Title, Years, Description</p>
                                </div>
                            </div>

                            <!-- Education -->
                            <div class="space-y-2">
                                <div class="flex items-center gap-2 mb-2">
                                    <span class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">Education</span>
                                    <div class="flex-1 h-px" style="background: var(--border-color);"></div>
                                </div>
                                <div class="form-group">
                                    <label class="form-label">Education</label>
                                    <textarea id="id-education" rows="3" class="form-input resize-none" placeholder="University, Degree, Years (one per line)">${profileData.education.map(e => `${e.school}, ${e.degree}, ${e.years}`).join('\n')}</textarea>
                                    <p class="text-[10px] text-muted mt-1">Format: University, Degree, Years</p>
                                </div>
                            </div>

                            <!-- Certifications -->
                            <div class="space-y-2">
                                <div class="flex items-center gap-2 mb-2">
                                    <span class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">Certifications</span>
                                    <div class="flex-1 h-px" style="background: var(--border-color);"></div>
                                </div>
                                <div class="form-group">
                                    <label class="form-label">Certifications</label>
                                    <input type="text" id="id-certifications" class="form-input" placeholder="AWS Certified, PMP, Scrum Master" value="${escapeHtml(profileData.certifications.join(', '))}" />
                                </div>
                            </div>

                            <!-- Languages -->
                            <div class="space-y-2">
                                <div class="flex items-center gap-2 mb-2">
                                    <span class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">Languages</span>
                                    <div class="flex-1 h-px" style="background: var(--border-color);"></div>
                                </div>
                                <div class="form-group">
                                    <label class="form-label">Languages</label>
                                    <input type="text" id="id-languages" class="form-input" placeholder="English (Native), Spanish (Fluent)" value="${escapeHtml(profileData.languages.join(', '))}" />
                                </div>
                            </div>

                            <!-- Interests -->
                            <div class="space-y-2">
                                <div class="flex items-center gap-2 mb-2">
                                    <span class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">Interests</span>
                                    <div class="flex-1 h-px" style="background: var(--border-color);"></div>
                                </div>
                                <div class="form-group">
                                    <label class="form-label">Interests</label>
                                    <input type="text" id="id-interests" class="form-input" placeholder="Open source, Photography, Hiking" value="${escapeHtml(profileData.interests.join(', '))}" />
                                </div>
                            </div>
                        </form>
                    </div>
                </div>

                <!-- Main Content -->
                <div class="lg:col-span-8 space-y-6">
                    <!-- Output Type Selector -->
                    <div class="glass-card rounded-2xl p-4">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="text-sm font-semibold text-muted mr-2">Generate:</span>
                            <button class="output-type-btn active px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium" data-type="resume" style="background: var(--deep-blue); color: white;"><i class="fas fa-file-alt mr-1"></i>Resume</button>
                            <button class="output-type-btn px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium text-muted hover:bg-primary/10" data-type="cv"><i class="fas fa-file-pdf mr-1"></i>CV</button>
                            <button class="output-type-btn px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium text-muted hover:bg-primary/10" data-type="bio"><i class="fas fa-user mr-1"></i>Bio</button>
                            <button class="output-type-btn px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium text-muted hover:bg-primary/10" data-type="cover"><i class="fas fa-envelope mr-1"></i>Cover Letter</button>
                            <button class="output-type-btn px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium text-muted hover:bg-primary/10" data-type="linkedin"><i class="fab fa-linkedin mr-1"></i>LinkedIn</button>
                            <button class="output-type-btn px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium text-muted hover:bg-primary/10" data-type="portfolio"><i class="fas fa-briefcase mr-1"></i>Portfolio</button>
                        </div>
                    </div>

                    <!-- Template Categories -->
                    <div class="glass-card rounded-2xl p-4">
                        <div class="flex flex-wrap gap-2 mb-4">
                            <button class="category-btn active px-3 py-1.5 rounded-full text-xs font-medium" data-category="all" style="background: var(--deep-blue); color: white;"><i class="fas fa-th mr-1"></i>All</button>
                            <button class="category-btn px-3 py-1.5 rounded-full text-xs font-medium text-muted hover:bg-primary/10" data-category="professional"><i class="fas fa-briefcase mr-1"></i>Professional</button>
                            <button class="category-btn px-3 py-1.5 rounded-full text-xs font-medium text-muted hover:bg-primary/10" data-category="creative"><i class="fas fa-paint-brush mr-1"></i>Creative</button>
                            <button class="category-btn px-3 py-1.5 rounded-full text-xs font-medium text-muted hover:bg-primary/10" data-category="academic"><i class="fas fa-graduation-cap mr-1"></i>Academic</button>
                            <button class="category-btn px-3 py-1.5 rounded-full text-xs font-medium text-muted hover:bg-primary/10" data-category="industry"><i class="fas fa-industry mr-1"></i>Industry</button>
                        </div>

                        <!-- Template Grid -->
                        <div id="template-grid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            <!-- Templates rendered by JS -->
                        </div>
                    </div>

                    <!-- Customization -->
                    <div class="glass-card rounded-2xl p-4">
                        <h3 class="font-semibold text-xs uppercase tracking-wider text-muted mb-3"><i class="fas fa-sliders-h mr-1"></i>Customize</h3>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div>
                                <label class="form-label text-[10px]">Color</label>
                                <div class="flex items-center gap-2">
                                    <input type="color" id="color-picker" class="w-8 h-8 rounded-full border-2 border-transparent cursor-pointer" value="#004ac6" style="padding: 0;">
                                    <span id="color-hex" class="text-xs text-muted">#004ac6</span>
                                </div>
                            </div>
                            <div>
                                <label class="form-label text-[10px]">Font</label>
                                <select id="font-select" class="form-input text-sm">
                                    <option value="Inter">Inter</option>
                                    <option value="Arial">Arial</option>
                                    <option value="Georgia">Georgia</option>
                                    <option value="Times New Roman">Times New Roman</option>
                                    <option value="Calibri">Calibri</option>
                                    <option value="Helvetica">Helvetica</option>
                                    <option value="Verdana">Verdana</option>
                                    <option value="Tahoma">Tahoma</option>
                                    <option value="Trebuchet MS">Trebuchet MS</option>
                                    <option value="Palatino Linotype">Palatino Linotype</option>
                                    <option value="JetBrains Mono">JetBrains Mono</option>
                                    <option value="Hanken Grotesk">Hanken Grotesk</option>
                                    <option value="Geist">Geist</option>
                                </select>
                            </div>
                            <div>
                                <label class="form-label text-[10px]">Header</label>
                                <select id="header-style" class="form-input text-sm">
                                    <option value="centered">Centered</option>
                                    <option value="left">Left Aligned</option>
                                    <option value="right">Right Aligned</option>
                                </select>
                            </div>
                            <div>
                                <label class="form-label text-[10px]">Spacing</label>
                                <select id="spacing" class="form-input text-sm">
                                    <option value="compact">Compact</option>
                                    <option value="normal" selected>Normal</option>
                                    <option value="relaxed">Relaxed</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- Generate Button -->
                    <button id="generate-identity-btn-main" class="w-full py-3.5 rounded-2xl font-bold text-base hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3" style="background: linear-gradient(135deg, var(--deep-blue), var(--emerald)); color: white;">
                        <i class="fas fa-magic"></i>
                        Generate Your Professional Identity
                    </button>
                </div>
            </div>
        </div>
    `;
}

// ====== LOAD SAVED PROFILES ======

async function loadSavedProfiles() {
    if (!currentUser) return;
    
    try {
        const q = query(collection(db, 'identityProfiles'), where('userId', '==', currentUser.uid));
        const snapshot = await getDocs(q);
        savedProfiles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('Error loading saved profiles:', error);
        savedProfiles = [];
    }
}

// ====== RENDER STUNNING TEMPLATES ======

function renderTemplates() {
    const grid = document.getElementById('template-grid');
    if (!grid) return;
    
    const filtered = currentCategory === 'all' 
        ? templates 
        : templates.filter(t => t.category === currentCategory);
    
    if (!selectedTemplate) selectedTemplate = filtered[0] || templates[0];
    
    grid.innerHTML = filtered.map(t => {
        const isActive = selectedTemplate?.id === t.id;
        const borderColor = isActive ? t.color : 'transparent';
        const shadow = isActive ? `0 8px 32px ${t.color}40` : 'none';
        const transform = isActive ? 'scale(1.04)' : 'scale(1)';
        
        // Get template preview - exact match of what will be generated
        const previewHtml = getTemplatePreview(t, true);
        
        return `
            <div class="template-card glass-card rounded-xl p-3 cursor-pointer transition-all duration-300 ${isActive ? 'active' : ''}" 
                 data-id="${t.id}" 
                 style="border: 2px solid ${borderColor}; box-shadow: ${shadow}; transform: ${transform}; background: ${isActive ? t.color + '15' : 'var(--bg-primary)'};">
                <div class="preview rounded-lg overflow-hidden min-h-[180px] relative" style="background: ${t.bgColor || 'white'}; border: 1px solid ${t.color}20;">
                    ${isActive ? `<div class="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center z-10" style="background: ${t.color}; color: white; box-shadow: 0 2px 8px ${t.color}40;"><i class="fas fa-check text-xs"></i></div>` : ''}
                    ${previewHtml}
                </div>
                <div class="mt-2 flex items-center justify-between">
                    <span class="text-xs font-medium truncate" style="color: var(--text-primary);"><i class="fas ${t.icon} mr-1" style="color: ${t.color};"></i>${t.name}</span>
                    <span class="text-[9px] text-muted capitalize">${t.category}</span>
                </div>
                <div class="text-[8px] text-muted mt-0.5 truncate">${t.description}</div>
            </div>
        `;
    }).join('');
    
    // Click handlers
    document.querySelectorAll('.template-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.template-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            const id = card.dataset.id;
            selectedTemplate = templates.find(t => t.id === id) || templates[0];
            currentColor = selectedTemplate.color;
            document.getElementById('color-picker').value = currentColor;
            document.getElementById('color-hex').textContent = currentColor;
            renderTemplates();
        });
    });
}

// ====== GET STUNNING TEMPLATE PREVIEW (EXACT MATCH) ======

function getTemplatePreview(template, isPreview = true) {
    const t = template;
    const c = t.color;
    const bg = t.bgColor || '#ffffff';
    const name = profileData.name || 'Your Name';
    const title = profileData.title || 'Job Title';
    const skills = profileData.skills || ['JavaScript', 'React', 'Node.js'];
    const email = profileData.email || 'email@example.com';
    const location = profileData.location || 'Cape Coast, Ghana';
    
    // For preview mode, use abbreviated content
    const displayName = isPreview ? (name.length > 10 ? name.substring(0, 8) + '…' : name) : name;
    const displayTitle = isPreview ? (title.length > 12 ? title.substring(0, 10) + '…' : title) : title;
    const displaySkills = isPreview ? skills.slice(0, 2) : skills;
    
    switch(t.layout) {
        case 'sidebar-elegant':
            return `
                <div style="display: flex; height: 100%; min-height: 180px;">
                    <div style="width: 30%; background: ${t.bgColor}; padding: 12px; display: flex; flex-direction: column; gap: 4px;">
                        <div style="width: 32px; height: 32px; border-radius: 50%; background: ${t.accentColor}; margin: 0 auto;"></div>
                        <div style="height: 4px; background: ${t.accentColor}40; border-radius: 2px; width: 60%; margin: 4px auto;"></div>
                        <div style="height: 4px; background: ${t.accentColor}30; border-radius: 2px; width: 40%; margin: 0 auto;"></div>
                        <div style="margin-top: 8px;">
                            <div style="height: 3px; background: ${t.accentColor}20; border-radius: 2px; margin: 3px 0;"></div>
                            <div style="height: 3px; background: ${t.accentColor}20; border-radius: 2px; margin: 3px 0; width: 70%;"></div>
                            <div style="height: 3px; background: ${t.accentColor}15; border-radius: 2px; margin: 3px 0; width: 50%;"></div>
                        </div>
                    </div>
                    <div style="flex: 1; padding: 12px; background: ${bg};">
                        <div style="font-size: 14px; font-weight: 700; color: ${c};">${displayName}</div>
                        <div style="font-size: 9px; color: #666; margin: 2px 0;">${displayTitle}</div>
                        <div style="display: flex; gap: 3px; flex-wrap: wrap; margin: 4px 0;">
                            ${displaySkills.map(s => `<span style="background: ${c}15; color: ${c}; padding: 1px 6px; border-radius: 2px; font-size: 7px; font-weight: 600;">${s}</span>`).join('')}
                        </div>
                        <div style="margin-top: 4px; border-top: 1px solid ${c}15; padding-top: 4px;">
                            <div style="height: 3px; background: ${c}20; border-radius: 2px; margin: 2px 0;"></div>
                            <div style="height: 3px; background: ${c}20; border-radius: 2px; margin: 2px 0; width: 70%;"></div>
                            <div style="font-size: 7px; color: #999; margin-top: 2px;"><i class="fas fa-envelope" style="font-size: 6px;"></i> ${email}</div>
                        </div>
                    </div>
                </div>
            `;
            
        case 'sidebar-modern':
            return `
                <div style="display: flex; height: 100%; min-height: 180px;">
                    <div style="width: 35%; background: ${c}; padding: 12px; display: flex; flex-direction: column; color: white;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <div style="width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,0.3);"></div>
                            <div>
                                <div style="font-size: 12px; font-weight: 700;">${displayName}</div>
                                <div style="font-size: 7px; opacity: 0.8;">${displayTitle}</div>
                            </div>
                        </div>
                        <div style="margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 6px;">
                            ${displaySkills.map(s => `<div style="font-size: 7px; padding: 2px 0; opacity: 0.9;"><i class="fas fa-check-circle" style="font-size: 6px; margin-right: 3px;"></i>${s}</div>`).join('')}
                        </div>
                    </div>
                    <div style="flex: 1; padding: 12px; background: ${bg};">
                        <div style="font-size: 8px; color: #999; text-transform: uppercase; letter-spacing: 0.5px;">Experience</div>
                        <div style="margin-top: 4px;">
                            <div style="height: 3px; background: ${c}20; border-radius: 2px; width: 90%;"></div>
                            <div style="height: 3px; background: ${c}15; border-radius: 2px; margin-top: 2px; width: 70%;"></div>
                            <div style="height: 3px; background: ${c}15; border-radius: 2px; margin-top: 2px; width: 80%;"></div>
                        </div>
                        <div style="font-size: 8px; color: #999; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 6px;">Education</div>
                        <div style="margin-top: 2px;">
                            <div style="height: 3px; background: ${c}15; border-radius: 2px; width: 60%;"></div>
                            <div style="height: 3px; background: ${c}15; border-radius: 2px; margin-top: 2px; width: 50%;"></div>
                        </div>
                    </div>
                </div>
            `;
            
        case 'centered-luxury':
            return `
                <div style="padding: 12px; background: ${bg}; min-height: 180px; text-align: center;">
                    <div style="width: 40px; height: 40px; border-radius: 50%; background: ${c}20; margin: 0 auto 6px; display: flex; align-items: center; justify-content: center; color: ${c}; font-size: 16px;"><i class="fas fa-user"></i></div>
                    <div style="font-size: 14px; font-weight: 700; color: ${c};">${displayName}</div>
                    <div style="font-size: 9px; color: #666;">${displayTitle}</div>
                    <div style="display: flex; justify-content: center; gap: 3px; flex-wrap: wrap; margin: 4px 0;">
                        ${displaySkills.map(s => `<span style="background: ${c}15; color: ${c}; padding: 1px 6px; border-radius: 10px; font-size: 7px; font-weight: 600;">${s}</span>`).join('')}
                    </div>
                    <div style="margin-top: 6px; border-top: 1px solid ${c}30; padding-top: 6px;">
                        <div style="height: 3px; background: ${c}30; border-radius: 2px; width: 80%; margin: 0 auto;"></div>
                        <div style="height: 3px; background: ${c}20; border-radius: 2px; width: 60%; margin: 2px auto;"></div>
                        <div style="font-size: 7px; color: #999; margin-top: 2px;"><i class="fas fa-envelope" style="font-size: 6px;"></i> ${email}</div>
                    </div>
                </div>
            `;
            
        case 'modern-simple':
            return `
                <div style="padding: 12px; background: ${bg}; min-height: 180px;">
                    <div style="display: flex; align-items: center; gap: 8px; border-bottom: 2px solid ${c}; padding-bottom: 6px;">
                        <div style="width: 32px; height: 32px; border-radius: 50%; background: ${c};"></div>
                        <div>
                            <div style="font-size: 13px; font-weight: 700; color: ${c};">${displayName}</div>
                            <div style="font-size: 8px; color: #666;">${displayTitle}</div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 3px; flex-wrap: wrap; margin: 6px 0;">
                        ${displaySkills.map(s => `<span style="background: ${c}15; color: ${c}; padding: 1px 6px; border-radius: 2px; font-size: 7px; font-weight: 600;">${s}</span>`).join('')}
                    </div>
                    <div style="margin-top: 4px;">
                        <div style="height: 3px; background: ${c}20; border-radius: 2px;"></div>
                        <div style="display: flex; justify-content: space-between; margin-top: 3px;">
                            <div style="height: 2px; background: ${c}15; border-radius: 2px; width: 45%;"></div>
                            <div style="height: 2px; background: ${c}15; border-radius: 2px; width: 45%;"></div>
                        </div>
                        <div style="font-size: 7px; color: #999; margin-top: 2px;"><i class="fas fa-map-marker-alt" style="font-size: 6px;"></i> ${location}</div>
                    </div>
                </div>
            `;
            
        case 'executive-dark':
            return `
                <div style="padding: 12px; background: ${t.bgColor}; min-height: 180px; color: #e8edf5;">
                    <div style="display: flex; justify-content: space-between; align-items: start; border-bottom: 1px solid ${t.accentColor}40; padding-bottom: 6px;">
                        <div>
                            <div style="font-size: 14px; font-weight: 700; color: ${t.accentColor};">${displayName}</div>
                            <div style="font-size: 8px; opacity: 0.7;">${displayTitle}</div>
                        </div>
                        <div style="width: 24px; height: 24px; border-radius: 50%; border: 2px solid ${t.accentColor};"></div>
                    </div>
                    <div style="display: flex; gap: 3px; flex-wrap: wrap; margin: 6px 0;">
                        ${displaySkills.map(s => `<span style="background: ${t.accentColor}20; color: ${t.accentColor}; padding: 1px 6px; border-radius: 2px; font-size: 7px; font-weight: 600;">${s}</span>`).join('')}
                    </div>
                    <div style="margin-top: 4px;">
                        <div style="height: 2px; background: ${t.accentColor}30; border-radius: 2px;"></div>
                        <div style="display: flex; gap: 4px; margin-top: 3px;">
                            <div style="height: 2px; background: ${t.accentColor}20; border-radius: 2px; flex: 1;"></div>
                            <div style="height: 2px; background: ${t.accentColor}20; border-radius: 2px; flex: 1;"></div>
                        </div>
                        <div style="font-size: 6px; opacity: 0.5; margin-top: 2px;"><i class="fas fa-envelope" style="font-size: 5px;"></i> ${email}</div>
                    </div>
                </div>
            `;
            
        case 'classic-navy':
            return `
                <div style="padding: 12px; background: ${bg}; min-height: 180px; border-left: 3px solid ${c};">
                    <div style="font-size: 14px; font-weight: 700; color: ${c};">${displayName}</div>
                    <div style="font-size: 9px; color: #666;">${displayTitle}</div>
                    <div style="display: flex; gap: 3px; flex-wrap: wrap; margin: 4px 0;">
                        ${displaySkills.map(s => `<span style="background: ${c}15; color: ${c}; padding: 1px 6px; border-radius: 2px; font-size: 7px; font-weight: 600;">${s}</span>`).join('')}
                    </div>
                    <div style="margin-top: 4px; border-top: 1px solid ${c}20; padding-top: 4px;">
                        <div style="height: 3px; background: ${c}20; border-radius: 2px; width: 80%;"></div>
                        <div style="height: 3px; background: ${c}15; border-radius: 2px; margin-top: 2px; width: 60%;"></div>
                        <div style="font-size: 7px; color: #999; margin-top: 2px;"><i class="fas fa-phone" style="font-size: 6px;"></i> ${profileData.phone || '+233 24 000 0000'}</div>
                    </div>
                </div>
            `;
            
        case 'creative-grid':
            return `
                <div style="padding: 12px; background: ${bg}; min-height: 180px;">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div>
                            <div style="font-size: 14px; font-weight: 700; color: ${c};">${displayName}</div>
                            <div style="font-size: 9px; color: #666;">${displayTitle}</div>
                        </div>
                        <div style="width: 30px; height: 30px; background: ${c}20; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 12px; color: ${c};"><i class="fas fa-star"></i></div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 8px;">
                        <div style="background: ${c}10; border-radius: 4px; padding: 4px;">
                            <div style="height: 3px; background: ${c}30; border-radius: 2px; width: 60%;"></div>
                            <div style="height: 3px; background: ${c}20; border-radius: 2px; margin-top: 2px; width: 40%;"></div>
                        </div>
                        <div style="background: ${c}10; border-radius: 4px; padding: 4px;">
                            <div style="height: 3px; background: ${c}30; border-radius: 2px; width: 50%;"></div>
                            <div style="height: 3px; background: ${c}20; border-radius: 2px; margin-top: 2px; width: 30%;"></div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 3px; flex-wrap: wrap; margin-top: 6px;">
                        ${displaySkills.map(s => `<span style="background: ${c}15; color: ${c}; padding: 1px 6px; border-radius: 3px; font-size: 7px; font-weight: 600;">${s}</span>`).join('')}
                    </div>
                    <div style="margin-top: 6px; height: 3px; background: linear-gradient(90deg, ${c}, ${c}40); border-radius: 2px;"></div>
                </div>
            `;
            
        case 'gradient-layout':
            return `
                <div style="padding: 12px; background: linear-gradient(135deg, ${bg}, ${c}10); min-height: 180px; position: relative; overflow: hidden;">
                    <div style="position: absolute; top: -20px; right: -20px; width: 60px; height: 60px; background: ${c}20; border-radius: 50%;"></div>
                    <div style="position: absolute; bottom: -10px; left: -10px; width: 40px; height: 40px; background: ${c}15; border-radius: 50%;"></div>
                    <div style="position: relative; z-index: 1;">
                        <div style="font-size: 14px; font-weight: 700; color: ${c};">${displayName}</div>
                        <div style="font-size: 9px; color: #666;">${displayTitle}</div>
                        <div style="display: flex; gap: 3px; flex-wrap: wrap; margin: 4px 0;">
                            ${displaySkills.map(s => `<span style="background: ${c}20; color: ${c}; padding: 1px 6px; border-radius: 3px; font-size: 7px; font-weight: 600;">${s}</span>`).join('')}
                        </div>
                        <div style="display: flex; gap: 4px; margin-top: 6px;">
                            <div style="flex: 1; height: 3px; background: ${c}30; border-radius: 2px;"></div>
                            <div style="flex: 1; height: 3px; background: ${c}20; border-radius: 2px;"></div>
                            <div style="flex: 0.5; height: 3px; background: ${c}15; border-radius: 2px;"></div>
                        </div>
                        <div style="font-size: 7px; color: #999; margin-top: 4px;"><i class="fas fa-envelope" style="font-size: 6px;"></i> ${email}</div>
                    </div>
                </div>
            `;
            
        case 'dynamic-split':
            return `
                <div style="display: flex; height: 100%; min-height: 180px; background: ${bg};">
                    <div style="flex: 1; padding: 12px; background: ${c}10; display: flex; flex-direction: column; justify-content: center;">
                        <div style="font-size: 14px; font-weight: 700; color: ${c};">${displayName}</div>
                        <div style="font-size: 9px; color: #666;">${displayTitle}</div>
                        <div style="margin-top: 4px;">
                            ${displaySkills.map(s => `<span style="background: ${c}20; color: ${c}; padding: 1px 6px; border-radius: 3px; font-size: 7px; font-weight: 600; display: inline-block; margin: 1px;">${s}</span>`).join('')}
                        </div>
                    </div>
                    <div style="width: 40%; padding: 12px; background: ${c}; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                        <div style="width: 30px; height: 30px; border-radius: 50%; background: ${c}40; border: 2px solid white;"></div>
                        <div style="height: 3px; background: white; border-radius: 2px; width: 60%; margin: 4px auto;"></div>
                        <div style="height: 3px; background: white; border-radius: 2px; width: 40%; margin: 0 auto;"></div>
                        <div style="font-size: 6px; color: white; opacity: 0.7; margin-top: 4px;"><i class="fas fa-envelope" style="font-size: 5px;"></i> ${email}</div>
                    </div>
                </div>
            `;
            
        case 'urban-layout':
            return `
                <div style="padding: 12px; background: ${bg}; min-height: 180px; position: relative;">
                    <div style="position: absolute; top: 0; right: 0; width: 60px; height: 60px; background: ${c}10; clip-path: polygon(0 0, 100% 0, 100% 100%);"></div>
                    <div style="position: relative; z-index: 1;">
                        <div style="display: flex; justify-content: space-between; align-items: start;">
                            <div>
                                <div style="font-size: 14px; font-weight: 700; color: ${c};">${displayName}</div>
                                <div style="font-size: 9px; color: #666;">${displayTitle}</div>
                            </div>
                            <div style="font-size: 16px; color: ${c};"><i class="fas fa-city"></i></div>
                        </div>
                        <div style="display: flex; gap: 4px; margin-top: 6px; flex-wrap: wrap;">
                            ${displaySkills.map(s => `<span style="background: ${c}15; color: ${c}; padding: 1px 8px; border-radius: 10px; font-size: 7px; font-weight: 600;">${s}</span>`).join('')}
                        </div>
                        <div style="margin-top: 6px; display: flex; gap: 6px;">
                            <div style="flex: 1; height: 2px; background: ${c}30; border-radius: 1px;"></div>
                            <div style="flex: 1; height: 2px; background: ${c}20; border-radius: 1px;"></div>
                        </div>
                        <div style="font-size: 7px; color: #999; margin-top: 4px;"><i class="fas fa-map-marker-alt" style="font-size: 6px;"></i> ${location}</div>
                    </div>
                </div>
            `;
            
        case 'art-deco-layout':
            return `
                <div style="padding: 12px; background: ${bg}; min-height: 180px; border: 2px solid ${c}30; border-radius: 4px; position: relative;">
                    <div style="position: absolute; top: -1px; right: -1px; width: 30px; height: 30px; border-right: 2px solid ${c}30; border-top: 2px solid ${c}30;"></div>
                    <div style="position: absolute; bottom: -1px; left: -1px; width: 30px; height: 30px; border-left: 2px solid ${c}30; border-bottom: 2px solid ${c}30;"></div>
                    <div style="text-align: center;">
                        <div style="font-size: 13px; font-weight: 700; color: ${c};">${displayName}</div>
                        <div style="font-size: 8px; color: #666;">${displayTitle}</div>
                        <div style="display: flex; justify-content: center; gap: 3px; flex-wrap: wrap; margin: 4px 0;">
                            ${displaySkills.map(s => `<span style="background: ${c}15; color: ${c}; padding: 1px 6px; border-radius: 2px; font-size: 7px; font-weight: 600;">${s}</span>`).join('')}
                        </div>
                        <div style="border-top: 1px solid ${c}30; padding-top: 4px; margin-top: 4px;">
                            <div style="font-size: 7px; color: #999;"><i class="fas fa-envelope" style="font-size: 6px;"></i> ${email}</div>
                        </div>
                    </div>
                </div>
            `;
            
        case 'neon-layout':
            return `
                <div style="padding: 12px; background: ${t.bgColor}; min-height: 180px; color: #e8edf5; position: relative; overflow: hidden;">
                    <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: radial-gradient(circle at 30% 40%, ${c}20, transparent 70%);"></div>
                    <div style="position: relative; z-index: 1;">
                        <div style="font-size: 14px; font-weight: 700; color: ${c}; text-shadow: 0 0 10px ${c}40;">${displayName}</div>
                        <div style="font-size: 9px; opacity: 0.7;">${displayTitle}</div>
                        <div style="display: flex; gap: 3px; flex-wrap: wrap; margin: 4px 0;">
                            ${displaySkills.map(s => `<span style="background: ${c}25; color: ${c}; padding: 1px 6px; border-radius: 2px; font-size: 7px; font-weight: 600; border: 1px solid ${c}30;">${s}</span>`).join('')}
                        </div>
                        <div style="margin-top: 6px;">
                            <div style="height: 2px; background: ${c}40; border-radius: 2px; box-shadow: 0 0 10px ${c}40;"></div>
                            <div style="font-size: 7px; opacity: 0.5; margin-top: 2px;"><i class="fas fa-envelope" style="font-size: 6px;"></i> ${email}</div>
                        </div>
                    </div>
                </div>
            `;
            
        case 'academic-full':
            return `
                <div style="padding: 12px; background: ${bg}; min-height: 180px; border-bottom: 3px solid ${c};">
                    <div style="font-size: 14px; font-weight: 700; color: ${c};">${displayName}</div>
                    <div style="font-size: 9px; color: #666;">${displayTitle}</div>
                    <div style="display: flex; gap: 3px; flex-wrap: wrap; margin: 4px 0;">
                        ${displaySkills.map(s => `<span style="background: ${c}15; color: ${c}; padding: 1px 6px; border-radius: 2px; font-size: 7px; font-weight: 600;">${s}</span>`).join('')}
                    </div>
                    <div style="margin-top: 4px; display: flex; gap: 8px;">
                        <div style="flex: 1;">
                            <div style="height: 3px; background: ${c}20; border-radius: 2px;"></div>
                            <div style="height: 3px; background: ${c}15; border-radius: 2px; margin-top: 2px; width: 70%;"></div>
                        </div>
                        <div style="flex: 1;">
                            <div style="height: 3px; background: ${c}20; border-radius: 2px;"></div>
                            <div style="height: 3px; background: ${c}15; border-radius: 2px; margin-top: 2px; width: 60%;"></div>
                        </div>
                    </div>
                    <div style="font-size: 7px; color: #999; margin-top: 4px;"><i class="fas fa-graduation-cap" style="font-size: 6px;"></i> ${profileData.education[0]?.school || 'University'}</div>
                </div>
            `;
            
        case 'research-layout':
            return `
                <div style="padding: 12px; background: ${bg}; min-height: 180px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="width: 28px; height: 28px; border-radius: 50%; background: ${c}; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px;"><i class="fas fa-microscope"></i></div>
                        <div>
                            <div style="font-size: 13px; font-weight: 700; color: ${c};">${displayName}</div>
                            <div style="font-size: 8px; color: #666;">${displayTitle}</div>
                        </div>
                    </div>
                    <div style="margin-top: 6px; border-left: 2px solid ${c}; padding-left: 8px;">
                        ${displaySkills.map(s => `<div style="font-size: 7px; padding: 2px 0; color: #555;"><i class="fas fa-check-circle" style="font-size: 6px; color: ${c}; margin-right: 3px;"></i>${s}</div>`).join('')}
                    </div>
                    <div style="margin-top: 4px; border-top: 1px solid ${c}20; padding-top: 4px;">
                        <div style="font-size: 7px; color: #999;"><i class="fas fa-envelope" style="font-size: 6px;"></i> ${email}</div>
                    </div>
                </div>
            `;
            
        case 'academic-clean':
            return `
                <div style="padding: 12px; background: ${bg}; min-height: 180px; border-left: 4px solid ${c};">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div>
                            <div style="font-size: 14px; font-weight: 700; color: ${c};">${displayName}</div>
                            <div style="font-size: 9px; color: #666;">${displayTitle}</div>
                        </div>
                        <div style="font-size: 10px; color: ${c}40;"><i class="fas fa-graduation-cap"></i></div>
                    </div>
                    <div style="display: flex; gap: 3px; flex-wrap: wrap; margin: 4px 0;">
                        ${displaySkills.map(s => `<span style="background: ${c}10; color: ${c}; padding: 1px 6px; border-radius: 2px; font-size: 7px; font-weight: 600;">${s}</span>`).join('')}
                    </div>
                    <div style="margin-top: 4px;">
                        <div style="height: 2px; background: ${c}20; border-radius: 2px; width: 80%;"></div>
                        <div style="height: 2px; background: ${c}15; border-radius: 2px; margin-top: 2px; width: 50%;"></div>
                    </div>
                    <div style="font-size: 7px; color: #999; margin-top: 3px;"><i class="fas fa-calendar-alt" style="font-size: 6px;"></i> ${profileData.education[0]?.years || '2023-2027'}</div>
                </div>
            `;
            
        case 'phd-layout':
            return `
                <div style="padding: 12px; background: ${bg}; min-height: 180px; border: 1px solid ${c}30; border-radius: 4px; text-align: center;">
                    <div style="width: 36px; height: 36px; border-radius: 50%; background: ${c}; margin: 0 auto 4px; display: flex; align-items: center; justify-content: center; color: white; font-size: 14px;"><i class="fas fa-user-graduate"></i></div>
                    <div style="font-size: 13px; font-weight: 700; color: ${c};">${displayName}</div>
                    <div style="font-size: 8px; color: #666;">${displayTitle}</div>
                    <div style="display: flex; justify-content: center; gap: 2px; flex-wrap: wrap; margin: 3px 0;">
                        ${displaySkills.slice(0, 3).map(s => `<span style="background: ${c}15; color: ${c}; padding: 1px 4px; border-radius: 2px; font-size: 6px; font-weight: 600;">${s}</span>`).join('')}
                    </div>
                    <div style="border-top: 1px solid ${c}20; padding-top: 3px; margin-top: 3px;">
                        <div style="font-size: 6px; color: #999;"><i class="fas fa-envelope" style="font-size: 5px;"></i> ${email}</div>
                    </div>
                </div>
            `;
            
        case 'science-layout':
            return `
                <div style="padding: 12px; background: ${bg}; min-height: 180px; border: 1px solid ${c}30;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <div style="width: 28px; height: 28px; background: ${c}20; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: ${c};"><i class="fas fa-atom"></i></div>
                        <div>
                            <div style="font-size: 13px; font-weight: 700; color: ${c};">${displayName}</div>
                            <div style="font-size: 8px; color: #666;">${displayTitle}</div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 2px; flex-wrap: wrap; margin: 4px 0;">
                        ${displaySkills.slice(0, 3).map(s => `<span style="background: ${c}15; color: ${c}; padding: 1px 6px; border-radius: 10px; font-size: 6px; font-weight: 600;">${s}</span>`).join('')}
                    </div>
                    <div style="margin-top: 4px; background: ${c}10; padding: 4px; border-radius: 2px;">
                        <div style="font-size: 6px; color: #666;"><i class="fas fa-flask" style="font-size: 5px;"></i> Research Experience</div>
                        <div style="height: 2px; background: ${c}30; border-radius: 2px; margin-top: 2px; width: 70%;"></div>
                    </div>
                </div>
            `;
            
        case 'tech-dark':
            return `
                <div style="padding: 12px; background: ${t.bgColor}; min-height: 180px; color: #e8edf5; position: relative; overflow: hidden;">
                    <div style="position: absolute; top: 0; right: 0; font-size: 40px; opacity: 0.05; font-family: monospace;">{ }</div>
                    <div style="position: relative; z-index: 1;">
                        <div style="font-size: 14px; font-weight: 700; color: ${c};">${displayName}</div>
                        <div style="font-size: 9px; color: #9aa4b8;">${displayTitle}</div>
                        <div style="display: flex; gap: 4px; margin: 4px 0; flex-wrap: wrap;">
                            ${displaySkills.map(s => `<span style="background: ${c}30; color: ${c}; padding: 1px 6px; border-radius: 2px; font-size: 7px; font-family: monospace;">${s}</span>`).join('')}
                        </div>
                        <div style="margin-top: 6px; border-left: 2px solid ${c}; padding-left: 6px;">
                            <div style="height: 3px; background: ${c}30; border-radius: 2px; width: 80%;"></div>
                            <div style="height: 3px; background: ${c}20; border-radius: 2px; margin-top: 2px; width: 60%;"></div>
                        </div>
                        <div style="font-size: 7px; color: #6a7a8a; margin-top: 4px;"><i class="fas fa-code" style="font-size: 6px;"></i> ${email}</div>
                    </div>
                </div>
            `;
            
        case 'healthcare-layout':
            return `
                <div style="padding: 12px; background: ${bg}; min-height: 180px; border-left: 4px solid ${c};">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                        <div style="width: 24px; height: 24px; border-radius: 50%; background: ${c}20; display: flex; align-items: center; justify-content: center; color: ${c}; font-size: 12px;"><i class="fas fa-heartbeat"></i></div>
                        <div>
                            <div style="font-size: 14px; font-weight: 700; color: ${c};">${displayName}</div>
                            <div style="font-size: 9px; color: #666;">${displayTitle}</div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 6px; margin: 4px 0; flex-wrap: wrap;">
                        ${displaySkills.map(s => `<span style="background: ${c}15; color: ${c}; padding: 1px 6px; border-radius: 3px; font-size: 7px; font-weight: 600;">${s}</span>`).join('')}
                    </div>
                    <div style="margin-top: 6px;">
                        <div style="height: 3px; background: ${c}20; border-radius: 2px; width: 90%;"></div>
                        <div style="height: 3px; background: ${c}15; border-radius: 2px; margin-top: 2px; width: 60%;"></div>
                    </div>
                    <div style="font-size: 7px; color: #999; margin-top: 4px;"><i class="fas fa-stethoscope" style="font-size: 6px;"></i> ${location}</div>
                </div>
            `;
            
        case 'marketing-layout':
            return `
                <div style="padding: 12px; background: ${bg}; min-height: 180px; position: relative;">
                    <div style="position: absolute; bottom: 0; right: 0; width: 40px; height: 40px; background: ${c}15; border-radius: 50% 0 0 0;"></div>
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div>
                            <div style="font-size: 14px; font-weight: 700; color: ${c};">${displayName}</div>
                            <div style="font-size: 9px; color: #666;">${displayTitle}</div>
                        </div>
                        <div style="font-size: 18px; color: ${c};"><i class="fas fa-bullhorn"></i></div>
                    </div>
                    <div style="display: flex; gap: 4px; margin: 4px 0; flex-wrap: wrap;">
                        ${displaySkills.map(s => `<span style="background: ${c}15; color: ${c}; padding: 1px 6px; border-radius: 3px; font-size: 7px; font-weight: 600;">${s}</span>`).join('')}
                    </div>
                    <div style="margin-top: 6px; display: flex; gap: 4px;">
                        <div style="flex: 2; height: 3px; background: ${c}30; border-radius: 2px;"></div>
                        <div style="flex: 1; height: 3px; background: ${c}20; border-radius: 2px;"></div>
                    </div>
                    <div style="font-size: 7px; color: #999; margin-top: 4px;"><i class="fas fa-envelope" style="font-size: 6px;"></i> ${email}</div>
                </div>
            `;
            
        case 'finance-layout':
            return `
                <div style="padding: 12px; background: ${bg}; min-height: 180px; border: 1px solid ${c}30; border-radius: 4px;">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div>
                            <div style="font-size: 14px; font-weight: 700; color: ${c};">${displayName}</div>
                            <div style="font-size: 9px; color: #666;">${displayTitle}</div>
                        </div>
                        <div style="font-size: 16px; color: ${c};"><i class="fas fa-chart-line"></i></div>
                    </div>
                    <div style="display: flex; gap: 3px; flex-wrap: wrap; margin: 4px 0;">
                        ${displaySkills.map(s => `<span style="background: ${c}15; color: ${c}; padding: 1px 6px; border-radius: 2px; font-size: 7px; font-weight: 600;">${s}</span>`).join('')}
                    </div>
                    <div style="margin-top: 4px; display: flex; gap: 2px;">
                        <div style="height: 3px; background: ${c}30; border-radius: 2px; flex: 1;"></div>
                        <div style="height: 3px; background: ${c}25; border-radius: 2px; flex: 1;"></div>
                        <div style="height: 3px; background: ${c}20; border-radius: 2px; flex: 1;"></div>
                    </div>
                    <div style="font-size: 7px; color: #999; margin-top: 4px;"><i class="fas fa-dollar-sign" style="font-size: 6px;"></i> ${location}</div>
                </div>
            `;
            
        case 'legal-layout':
            return `
                <div style="padding: 12px; background: ${bg}; min-height: 180px; border: 2px solid ${c}30; border-radius: 8px;">
                    <div style="text-align: center;">
                        <div style="font-size: 16px; color: ${c};"><i class="fas fa-gavel"></i></div>
                        <div style="font-size: 13px; font-weight: 700; color: ${c};">${displayName}</div>
                        <div style="font-size: 8px; color: #666;">${displayTitle}</div>
                        <div style="display: flex; justify-content: center; gap: 2px; flex-wrap: wrap; margin: 3px 0;">
                            ${displaySkills.slice(0, 3).map(s => `<span style="background: ${c}15; color: ${c}; padding: 1px 4px; border-radius: 2px; font-size: 6px; font-weight: 600;">${s}</span>`).join('')}
                        </div>
                        <div style="border-top: 1px solid ${c}20; padding-top: 3px; margin-top: 3px;">
                            <div style="font-size: 6px; color: #999;"><i class="fas fa-balance-scale" style="font-size: 5px;"></i> Legal Professional</div>
                        </div>
                    </div>
                </div>
            `;
            
        case 'architecture-layout':
            return `
                <div style="padding: 12px; background: ${bg}; min-height: 180px; border: 1px solid #ddd;">
                    <div style="display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px;">
                        <div style="font-size: 16px; color: ${c};"><i class="fas fa-drafting-compass"></i></div>
                        <div>
                            <div style="font-size: 13px; font-weight: 700; color: ${c};">${displayName}</div>
                            <div style="font-size: 8px; color: #666;">${displayTitle}</div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 2px; flex-wrap: wrap; margin: 4px 0;">
                        ${displaySkills.map(s => `<span style="background: #f0f0f0; color: #333; padding: 1px 6px; border-radius: 2px; font-size: 7px; font-weight: 600;">${s}</span>`).join('')}
                    </div>
                    <div style="margin-top: 4px; display: grid; grid-template-columns: 1fr 1fr; gap: 2px;">
                        <div style="background: #f5f5f5; height: 12px; border-radius: 2px;"></div>
                        <div style="background: #f5f5f5; height: 12px; border-radius: 2px;"></div>
                    </div>
                    <div style="font-size: 6px; color: #999; margin-top: 3px;"><i class="fas fa-map-pin" style="font-size: 5px;"></i> ${location}</div>
                </div>
            `;
            
        case 'ultra-minimal-layout':
            return `
                <div style="padding: 12px; background: ${bg}; min-height: 180px;">
                    <div style="font-size: 14px; font-weight: 700; color: ${c};">${displayName}</div>
                    <div style="font-size: 9px; color: #999;">${displayTitle}</div>
                    <div style="margin-top: 6px; border-top: 1px solid #eee; padding-top: 6px;">
                        ${displaySkills.map(s => `<span style="color: #666; font-size: 7px; margin-right: 6px;">${s}</span>`).join('')}
                    </div>
                    <div style="margin-top: 6px; font-size: 7px; color: #ccc;"><i class="fas fa-envelope" style="font-size: 6px;"></i> ${email}</div>
                </div>
            `;
            
        case 'white-space-layout':
            return `
                <div style="padding: 20px; background: ${bg}; min-height: 180px; display: flex; flex-direction: column; justify-content: center;">
                    <div style="font-size: 14px; font-weight: 700; color: ${c};">${displayName}</div>
                    <div style="font-size: 9px; color: #999; margin-top: 2px;">${displayTitle}</div>
                    <div style="margin-top: 8px; display: flex; gap: 8px;">
                        ${displaySkills.slice(0, 2).map(s => `<span style="color: #666; font-size: 7px; border: 1px solid #eee; padding: 2px 8px; border-radius: 10px;">${s}</span>`).join('')}
                    </div>
                    <div style="margin-top: 8px; font-size: 7px; color: #ddd;"><i class="fas fa-envelope" style="font-size: 6px;"></i> ${email}</div>
                </div>
            `;
            
        case 'monochrome-layout':
            return `
                <div style="padding: 12px; background: ${bg}; min-height: 180px; border: 1px solid #ddd;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <div style="width: 28px; height: 28px; border-radius: 50%; background: ${c};"></div>
                        <div>
                            <div style="font-size: 13px; font-weight: 700; color: ${c};">${displayName}</div>
                            <div style="font-size: 8px; color: #666;">${displayTitle}</div>
                        </div>
                    </div>
                    <div style="margin-top: 6px; display: flex; gap: 2px; flex-wrap: wrap;">
                        ${displaySkills.map(s => `<span style="background: #f0f0f0; color: #333; padding: 1px 6px; border-radius: 2px; font-size: 7px; font-weight: 600;">${s}</span>`).join('')}
                    </div>
                    <div style="margin-top: 6px; height: 2px; background: #eee;"></div>
                    <div style="font-size: 6px; color: #999; margin-top: 3px;"><i class="fas fa-envelope" style="font-size: 5px;"></i> ${email}</div>
                </div>
            `;
            
        case 'clean-modern-layout':
            return `
                <div style="padding: 12px; background: ${bg}; min-height: 180px;">
                    <div style="display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid ${c}; padding-bottom: 4px;">
                        <div>
                            <div style="font-size: 14px; font-weight: 700; color: ${c};">${displayName}</div>
                            <div style="font-size: 8px; color: #666;">${displayTitle}</div>
                        </div>
                        <div style="font-size: 10px; color: ${c};"><i class="fas fa-star"></i></div>
                    </div>
                    <div style="display: flex; gap: 2px; flex-wrap: wrap; margin: 6px 0;">
                        ${displaySkills.map(s => `<span style="background: ${c}10; color: ${c}; padding: 1px 6px; border-radius: 2px; font-size: 7px; font-weight: 600;">${s}</span>`).join('')}
                    </div>
                    <div style="display: flex; gap: 4px; margin-top: 4px;">
                        <div style="flex: 1; height: 2px; background: ${c}30; border-radius: 2px;"></div>
                        <div style="flex: 1; height: 2px; background: ${c}20; border-radius: 2px;"></div>
                    </div>
                    <div style="font-size: 7px; color: #999; margin-top: 3px;"><i class="fas fa-map-marker-alt" style="font-size: 6px;"></i> ${location}</div>
                </div>
            `;
            
        default:
            return `
                <div style="padding: 12px; background: ${bg}; min-height: 180px;">
                    <div style="font-size: 14px; font-weight: 700; color: ${c};">${displayName}</div>
                    <div style="font-size: 9px; color: #666;">${displayTitle}</div>
                    <div style="display: flex; gap: 3px; flex-wrap: wrap; margin: 4px 0;">
                        ${displaySkills.map(s => `<span style="background: ${c}15; color: ${c}; padding: 1px 6px; border-radius: 3px; font-size: 7px; font-weight: 600;">${s}</span>`).join('')}
                    </div>
                    <div style="margin-top: 6px;">
                        <div style="height: 3px; background: ${c}20; border-radius: 2px; width: 70%;"></div>
                        <div style="height: 3px; background: ${c}15; border-radius: 2px; margin-top: 2px; width: 50%;"></div>
                    </div>
                    <div style="font-size: 7px; color: #999; margin-top: 4px;"><i class="fas fa-envelope" style="font-size: 6px;"></i> ${email}</div>
                </div>
            `;
    }
}

// ====== GENERATE CONTENT WITH TEMPLATE STYLES (EXACT MATCH) ======

function generateContent(type, template, color) {
    const data = profileData;
    const t = template || selectedTemplate || templates[0];
    const c = color || t.color || '#004ac6';
    const font = document.getElementById('font-select')?.value || t.font || 'Inter';
    const spacing = document.getElementById('spacing')?.value || 'normal';
    const headerStyle = document.getElementById('header-style')?.value || 'centered';
    
    const padding = spacing === 'compact' ? '20px' : spacing === 'relaxed' ? '48px' : '32px';
    const headerAlign = headerStyle === 'centered' ? 'center' : headerStyle === 'left' ? 'left' : 'right';
    
    // Template-specific styling
    let templateStyles = '';
    let textColor = '#0d1c2f';
    let textSecondary = '#4a5568';
    let textMuted = '#737686';
    
    switch(t.style) {
        case 'premium':
            templateStyles = `
                background: ${t.bgColor};
                color: #e8edf5;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(26, 26, 46, 0.3);
                border-left: 4px solid ${t.accentColor};
                padding: ${padding};
            `;
            textColor = '#e8edf5';
            textSecondary = '#c8d0dc';
            textMuted = '#9aa4b8';
            break;
        case 'elegant':
            templateStyles = `
                background: ${t.bgColor};
                border: 1px solid ${c}20;
                border-radius: 12px;
                box-shadow: 0 4px 20px ${c}15;
                padding: ${padding};
                background-image: radial-gradient(circle at 10% 20%, ${c}05, transparent 50%);
            `;
            break;
        case 'minimal-luxury':
            templateStyles = `
                background: ${t.bgColor};
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(45, 55, 72, 0.1);
                padding: ${padding};
                border-top: 3px solid ${c};
            `;
            break;
        case 'modern-corporate':
            templateStyles = `
                background: ${t.bgColor};
                border-radius: 8px;
                box-shadow: 0 2px 12px ${c}20;
                padding: ${padding};
                border: 1px solid ${c}20;
            `;
            break;
        case 'executive-black':
            templateStyles = `
                background: ${t.bgColor};
                color: #e8edf5;
                border-radius: 8px;
                padding: ${padding};
                border: 1px solid #333;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            `;
            textColor = '#e8edf5';
            textSecondary = '#c8d0dc';
            textMuted = '#8a9aa8';
            break;
        case 'navy-classic':
            templateStyles = `
                background: ${t.bgColor};
                border-radius: 8px;
                box-shadow: 0 2px 12px rgba(26, 42, 74, 0.1);
                padding: ${padding};
                border: 1px solid ${c}30;
            `;
            break;
        case 'creative-portfolio':
            templateStyles = `
                background: ${t.bgColor};
                border-radius: 12px;
                box-shadow: 0 4px 20px ${c}20;
                padding: ${padding};
                border: 1px solid ${c}20;
                background-image: linear-gradient(135deg, ${c}08, transparent 60%);
            `;
            break;
        case 'gradient-artist':
            templateStyles = `
                background: linear-gradient(135deg, ${c}15, ${c}05);
                border-radius: 16px;
                border: 1px solid ${c}30;
                box-shadow: 0 4px 20px ${c}20;
                padding: ${padding};
            `;
            break;
        case 'vibrant-dynamic':
            templateStyles = `
                background: ${t.bgColor};
                border: 2px solid ${c}30;
                border-radius: 12px;
                box-shadow: 0 4px 20px ${c}20;
                padding: ${padding};
                background-image: linear-gradient(to bottom right, ${c}08, transparent 70%);
            `;
            break;
        case 'urban-modern':
            templateStyles = `
                background: ${t.bgColor};
                border-radius: 12px;
                box-shadow: 0 4px 20px ${c}20;
                padding: ${padding};
                border-left: 4px solid ${c};
                background-image: radial-gradient(circle at 90% 10%, ${c}10, transparent 60%);
            `;
            break;
        case 'art-deco':
            templateStyles = `
                background: ${t.bgColor};
                border-radius: 8px;
                border: 2px solid ${c}40;
                padding: ${padding};
                box-shadow: 0 4px 20px ${c}15;
            `;
            break;
        case 'neon-dream':
            templateStyles = `
                background: ${t.bgColor};
                color: #e8edf5;
                border-radius: 12px;
                padding: ${padding};
                border: 1px solid ${c}50;
                box-shadow: 0 0 30px ${c}20, inset 0 0 30px ${c}10;
            `;
            textColor = '#e8edf5';
            textSecondary = '#c8d0dc';
            textMuted = '#8a9aa8';
            break;
        case 'academic-scholar':
            templateStyles = `
                background: ${t.bgColor};
                border-radius: 8px;
                box-shadow: 0 2px 12px ${c}15;
                padding: ${padding};
                border-bottom: 3px solid ${c};
            `;
            break;
        case 'research-pioneer':
            templateStyles = `
                background: ${t.bgColor};
                border-radius: 8px;
                box-shadow: 0 2px 12px rgba(0, 74, 198, 0.1);
                padding: ${padding};
                border-left: 3px solid ${c};
            `;
            break;
        case 'academic-excellence':
            templateStyles = `
                background: ${t.bgColor};
                border-radius: 8px;
                box-shadow: 0 2px 12px rgba(5, 150, 105, 0.1);
                padding: ${padding};
                border: 1px solid ${c}30;
            `;
            break;
        case 'phd-classic':
            templateStyles = `
                background: ${t.bgColor};
                border-radius: 8px;
                box-shadow: 0 2px 12px rgba(107, 63, 160, 0.1);
                padding: ${padding};
                border: 1px solid ${c}40;
            `;
            break;
        case 'science-modern':
            templateStyles = `
                background: ${t.bgColor};
                border-radius: 8px;
                box-shadow: 0 2px 12px rgba(14, 165, 233, 0.1);
                padding: ${padding};
                border: 1px solid ${c}30;
            `;
            break;
        case 'tech-innovator':
            templateStyles = `
                background: ${t.bgColor};
                color: #e8edf5;
                border-radius: 12px;
                padding: ${padding};
                font-family: 'JetBrains Mono', monospace;
                border: 1px solid ${c}40;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            `;
            textColor = '#e8edf5';
            textSecondary = '#9aa4b8';
            textMuted = '#6a7a8a';
            break;
        case 'healthcare-hero':
            templateStyles = `
                background: ${t.bgColor};
                border-radius: 8px;
                box-shadow: 0 2px 12px rgba(5, 150, 105, 0.1);
                padding: ${padding};
                border-left: 4px solid ${c};
            `;
            break;
        case 'marketing-guru':
            templateStyles = `
                background: ${t.bgColor};
                border-radius: 8px;
                box-shadow: 0 2px 12px rgba(220, 38, 38, 0.1);
                padding: ${padding};
                border: 1px solid ${c}30;
                position: relative;
                overflow: hidden;
            `;
            break;
        case 'finance-pro':
            templateStyles = `
                background: ${t.bgColor};
                border-radius: 8px;
                box-shadow: 0 2px 12px rgba(8, 145, 178, 0.1);
                padding: ${padding};
                border: 1px solid ${c}30;
            `;
            break;
        case 'legal-eagle':
            templateStyles = `
                background: ${t.bgColor};
                border-radius: 8px;
                box-shadow: 0 2px 12px rgba(74, 55, 40, 0.1);
                padding: ${padding};
                border: 2px solid ${c}40;
            `;
            break;
        case 'architecture-modern':
            templateStyles = `
                background: ${t.bgColor};
                border-radius: 8px;
                box-shadow: 0 2px 12px rgba(120, 113, 108, 0.1);
                padding: ${padding};
                border: 1px solid #ddd;
            `;
            break;
        case 'ultra-minimal':
            templateStyles = `
                background: ${t.bgColor};
                padding: ${padding};
                border-top: 1px solid #eee;
            `;
            break;
        case 'white-space':
            templateStyles = `
                background: ${t.bgColor};
                padding: ${padding};
                border: 1px solid #f0f0f0;
                border-radius: 8px;
            `;
            break;
        case 'monochrome':
            templateStyles = `
                background: ${t.bgColor};
                padding: ${padding};
                border: 1px solid #ddd;
                border-radius: 4px;
            `;
            break;
        case 'clean-modern':
            templateStyles = `
                background: ${t.bgColor};
                padding: ${padding};
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(13, 148, 136, 0.1);
                border: 1px solid ${c}20;
            `;
            break;
        default:
            templateStyles = `
                background: white;
                border: 1px solid ${c}20;
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.04);
                padding: ${padding};
            `;
    }
    
    const containerStyle = `
        font-family: '${font}', sans-serif;
        max-width: 800px;
        margin: 0 auto;
        ${templateStyles}
    `;
    
    // Photo handling with FontAwesome
    const photoHtml = profilePhotoBase64 ? `
        <div style="text-align: ${headerAlign}; margin-bottom: 16px;">
            <img src="${profilePhotoBase64}" alt="Profile" style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover; border: 3px solid ${c};">
        </div>
    ` : '';
    
    const sections = {
        header: `
            ${photoHtml}
            <div style="text-align:${headerAlign}; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 3px solid ${c};">
                <h1 style="font-size: 28px; font-weight: 700; margin: 0; color: ${textColor};">${data.name}</h1>
                <p style="font-size: 16px; color: ${c}; margin: 4px 0 8px;">${data.title}</p>
                <div style="display: flex; justify-content:${headerAlign}; gap: 16px; flex-wrap: wrap; font-size: 13px; color: ${textMuted};">
                    <span><i class="fas fa-envelope" style="margin-right: 4px;"></i>${data.email}</span>
                    <span><i class="fas fa-phone" style="margin-right: 4px;"></i>${data.phone}</span>
                    <span><i class="fas fa-map-marker-alt" style="margin-right: 4px;"></i>${data.location}</span>
                    ${data.linkedin ? `<span><i class="fab fa-linkedin" style="margin-right: 4px;"></i>${data.linkedin}</span>` : ''}
                    ${data.github ? `<span><i class="fab fa-github" style="margin-right: 4px;"></i>${data.github}</span>` : ''}
                </div>
            </div>
        `,
        bio: `
            <div style="margin-bottom: 16px;">
                <h2 style="font-size: 16px; font-weight: 600; color: ${c}; border-bottom: 2px solid ${c}30; padding-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em;"><i class="fas fa-user" style="margin-right: 8px;"></i>Professional Summary</h2>
                <p style="font-size: 14px; line-height: 1.6; color: ${textSecondary}; margin-top: 8px;">${data.bio}</p>
            </div>
        `,
        skills: `
            <div style="margin-bottom: 16px;">
                <h2 style="font-size: 16px; font-weight: 600; color: ${c}; border-bottom: 2px solid ${c}30; padding-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em;"><i class="fas fa-code" style="margin-right: 8px;"></i>Skills</h2>
                <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;">
                    ${data.skills.map(s => `<span style="background: ${c}20; color: ${c}; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 500;">${s}</span>`).join('')}
                </div>
            </div>
        `,
        experience: `
            <div style="margin-bottom: 16px;">
                <h2 style="font-size: 16px; font-weight: 600; color: ${c}; border-bottom: 2px solid ${c}30; padding-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em;"><i class="fas fa-briefcase" style="margin-right: 8px;"></i>Experience</h2>
                ${data.experience.map(exp => `
                    <div style="margin-top: 10px;">
                        <div style="display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap;">
                            <span style="font-weight: 600; font-size: 15px; color: ${textColor};">${exp.title}</span>
                            <span style="font-size: 13px; color: ${c}; font-weight: 500;">${exp.company}</span>
                            <span style="font-size: 12px; color: ${textMuted};"><i class="far fa-calendar-alt" style="margin-right: 4px;"></i>${exp.years}</span>
                        </div>
                        <p style="font-size: 13px; color: ${textSecondary}; margin-top: 4px; line-height: 1.5;">${exp.description}</p>
                    </div>
                `).join('')}
            </div>
        `,
        education: `
            <div style="margin-bottom: 16px;">
                <h2 style="font-size: 16px; font-weight: 600; color: ${c}; border-bottom: 2px solid ${c}30; padding-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em;"><i class="fas fa-graduation-cap" style="margin-right: 8px;"></i>Education</h2>
                ${data.education.map(edu => `
                    <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap;">
                        <span style="font-weight: 600; font-size: 14px; color: ${textColor};">${edu.school}</span>
                        <span style="font-size: 13px; color: ${textSecondary};">${edu.degree}</span>
                        <span style="font-size: 12px; color: ${textMuted};"><i class="far fa-calendar-alt" style="margin-right: 4px;"></i>${edu.years}</span>
                    </div>
                `).join('')}
            </div>
        `,
        certifications: data.certifications && data.certifications.length ? `
            <div style="margin-bottom: 16px;">
                <h2 style="font-size: 16px; font-weight: 600; color: ${c}; border-bottom: 2px solid ${c}30; padding-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em;"><i class="fas fa-certificate" style="margin-right: 8px;"></i>Certifications</h2>
                <ul style="list-style: none; padding: 0; margin-top: 8px;">
                    ${data.certifications.map(cert => `<li style="padding: 4px 0; font-size: 13px; color: ${textSecondary};"><i class="fas fa-check-circle" style="color: ${c}; margin-right: 8px;"></i>${cert}</li>`).join('')}
                </ul>
            </div>
        ` : '',
        languages: data.languages && data.languages.length ? `
            <div style="margin-bottom: 16px;">
                <h2 style="font-size: 16px; font-weight: 600; color: ${c}; border-bottom: 2px solid ${c}30; padding-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em;"><i class="fas fa-language" style="margin-right: 8px;"></i>Languages</h2>
                <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
                    ${data.languages.map(lang => `<span style="background: ${c}15; padding: 4px 12px; border-radius: 20px; font-size: 13px; color: ${textSecondary};"><i class="fas fa-check" style="color: ${c}; margin-right: 4px; font-size: 10px;"></i>${lang}</span>`).join('')}
                </div>
            </div>
        ` : '',
        interests: data.interests && data.interests.length ? `
            <div style="margin-bottom: 16px;">
                <h2 style="font-size: 16px; font-weight: 600; color: ${c}; border-bottom: 2px solid ${c}30; padding-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em;"><i class="fas fa-heart" style="margin-right: 8px;"></i>Interests</h2>
                <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
                    ${data.interests.map(i => `<span style="background: ${c}15; padding: 4px 12px; border-radius: 20px; font-size: 13px; color: ${textSecondary};"><i class="fas fa-tag" style="color: ${c}; margin-right: 4px; font-size: 10px;"></i>${i}</span>`).join('')}
                </div>
            </div>
        ` : ''
    };
    
    let content = '';
    
    // ALL output types use the SAME template design
    // The template design is applied via containerStyle which includes all template styling
    switch(type) {
        case 'resume':
        case 'cv':
            content = `
                <div style="${containerStyle}">
                    ${sections.header}
                    ${sections.bio}
                    ${sections.skills}
                    ${sections.experience}
                    ${sections.education}
                    ${sections.certifications}
                    ${sections.languages}
                    ${sections.interests}
                </div>
            `;
            break;
        case 'bio':
            content = `
                <div style="${containerStyle}">
                    ${photoHtml}
                    <div style="text-align: ${headerAlign}; margin-bottom: 16px;">
                        <h1 style="font-size: 28px; font-weight: 700; color: ${c}; margin-bottom: 4px;">${data.name}</h1>
                        <p style="font-size: 18px; color: ${textSecondary}; margin-bottom: 16px;">${data.title}</p>
                    </div>
                    <p style="font-size: 15px; line-height: 1.8; color: ${textSecondary};">${data.bio}</p>
                    <div style="margin-top: 16px; display: flex; gap: 16px; flex-wrap: wrap; font-size: 14px; color: ${textMuted}; justify-content: ${headerAlign};">
                        <span><i class="fas fa-envelope" style="margin-right: 4px;"></i>${data.email}</span>
                        <span><i class="fas fa-phone" style="margin-right: 4px;"></i>${data.phone}</span>
                        <span><i class="fas fa-map-marker-alt" style="margin-right: 4px;"></i>${data.location}</span>
                    </div>
                    ${sections.skills}
                    ${sections.interests}
                </div>
            `;
            break;
        case 'cover':
            content = `
                <div style="${containerStyle}">
                    <div style="text-align: right; margin-bottom: 32px;">
                        <p style="font-weight: 600; color: ${textColor}; font-size: 16px;">${data.name}</p>
                        <p style="font-size: 14px; color: ${textMuted};"><i class="fas fa-envelope" style="margin-right: 4px;"></i>${data.email} • <i class="fas fa-phone" style="margin-right: 4px;"></i>${data.phone}</p>
                        <p style="font-size: 14px; color: ${textMuted};"><i class="fas fa-map-marker-alt" style="margin-right: 4px;"></i>${data.location}</p>
                        <p style="font-size: 14px; color: ${textMuted}; margin-top: 4px;">${new Date().toLocaleDateString()}</p>
                    </div>
                    <div style="margin-bottom: 24px;">
                        <p style="font-weight: 600; color: ${textColor};">Hiring Manager</p>
                        <p style="font-size: 14px; color: ${textMuted};">[Company Name]</p>
                        <p style="font-size: 14px; color: ${textMuted};">[Company Address]</p>
                    </div>
                    <p style="font-size: 15px; line-height: 1.8; color: ${textSecondary}; margin-bottom: 16px;">Dear Hiring Manager,</p>
                    <p style="font-size: 15px; line-height: 1.8; color: ${textSecondary}; margin-bottom: 16px;">${data.bio}</p>
                    <p style="font-size: 15px; line-height: 1.8; color: ${textSecondary}; margin-bottom: 16px;">I am particularly excited about this opportunity because of my experience with ${data.skills.slice(0, 3).join(', ')}. In my previous role at ${data.experience[0]?.company}, I ${data.experience[0]?.description}.</p>
                    <p style="font-size: 15px; line-height: 1.8; color: ${textSecondary};">Thank you for your time and consideration. I look forward to hearing from you.</p>
                    <p style="font-size: 15px; line-height: 1.8; color: ${textSecondary}; margin-top: 24px;">Sincerely,<br>${data.name}</p>
                </div>
            `;
            break;
        case 'linkedin':
            content = `
                <div style="${containerStyle}">
                    ${photoHtml}
                    <div style="text-align: ${headerAlign};">
                        <h1 style="font-size: 28px; font-weight: 700; color: ${c}; margin-bottom: 4px;">${data.name}</h1>
                        <p style="font-size: 18px; color: ${textSecondary}; margin-bottom: 12px;">${data.title}</p>
                        <div style="display: flex; gap: 12px; flex-wrap: wrap; font-size: 14px; color: ${textMuted}; justify-content: ${headerAlign};">
                            <span><i class="fas fa-map-marker-alt" style="margin-right: 4px;"></i>${data.location}</span>
                            <span><i class="fab fa-linkedin" style="margin-right: 4px;"></i>${data.linkedin || 'linkedin.com/in/' + data.name.toLowerCase().replace(' ', '')}</span>
                        </div>
                    </div>
                    <div style="margin-top: 20px;">
                        ${sections.bio}
                        ${sections.experience}
                        ${sections.skills}
                        ${sections.education}
                        ${sections.certifications}
                        ${sections.languages}
                    </div>
                </div>
            `;
            break;
        case 'portfolio':
            // PORTFOLIO now uses the EXACT SAME template design
            content = `
                <div style="${containerStyle}">
                    <div style="text-align: ${headerAlign}; margin-bottom: 32px;">
                        ${photoHtml ? `<div style="display: flex; justify-content: ${headerAlign};">${photoHtml}</div>` : `
                            <div style="width: 120px; height: 120px; border-radius: 50%; background: ${c}30; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; font-size: 48px; font-weight: 700; color: ${c};">${data.name.charAt(0)}</div>
                        `}
                        <h1 style="font-size: 32px; font-weight: 700; color: ${c}; margin: 0;">${data.name}</h1>
                        <p style="font-size: 18px; color: ${textSecondary}; margin: 4px 0 12px;">${data.title}</p>
                        <div style="display: flex; justify-content: ${headerAlign}; gap: 16px; flex-wrap: wrap; font-size: 14px; color: ${textMuted};">
                            <span><i class="fas fa-envelope" style="margin-right: 4px;"></i>${data.email}</span>
                            <span><i class="fas fa-phone" style="margin-right: 4px;"></i>${data.phone}</span>
                            <span><i class="fas fa-map-marker-alt" style="margin-right: 4px;"></i>${data.location}</span>
                            ${data.github ? `<span><i class="fab fa-github" style="margin-right: 4px;"></i>${data.github}</span>` : ''}
                        </div>
                    </div>
                    ${sections.bio}
                    ${sections.skills}
                    ${sections.experience}
                    ${sections.education}
                    ${sections.certifications}
                    ${sections.languages}
                    ${sections.interests}
                </div>
            `;
            break;
        default:
            content = `<div style="${containerStyle}"><p style="color: ${textSecondary}; text-align: center;"><i class="fas fa-exclamation-circle" style="color: ${c};"></i> Select a valid output type</p></div>`;
    }
    
    return content;
}

// ====== SHOW PREVIEW MODAL ======

function showPreviewModal() {
    const content = generateContent(currentOutputType, selectedTemplate, currentColor);
    
    const modalHtml = `
        <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) closePreviewModal()">
            <div class="rounded-2xl w-full max-w-4xl mx-auto max-h-[90vh] overflow-y-auto" style="background: var(--bg-secondary);">
                <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color); z-index: 10;">
                    <div>
                        <h2 class="text-xl md:text-2xl font-bold" id="preview-title" style="color: var(--text-primary);">
                            <i class="fas fa-file-alt mr-2" style="color: var(--deep-blue);"></i>${currentOutputType.charAt(0).toUpperCase() + currentOutputType.slice(1)} Preview
                        </h2>
                        <p class="text-xs text-muted mt-1">Using template: ${selectedTemplate?.name || 'Default'}</p>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="copyPreviewText()" class="px-3 py-1.5 rounded-lg text-sm" style="background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary);">
                            <i class="fas fa-copy"></i> Copy
                        </button>
                        <button onclick="exportPreviewPDF()" class="px-3 py-1.5 rounded-lg text-sm" style="background: var(--deep-blue); color: white;">
                            <i class="fas fa-file-pdf"></i> PDF
                        </button>
                        <button onclick="closePreviewModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition">
                            <i class="fas fa-times text-muted"></i>
                        </button>
                    </div>
                </div>
                <div id="preview-content" class="p-8" style="background: white; color: #1a1a2e; border-radius: 0 0 16px 16px;">
                    ${content}
                </div>
            </div>
        </div>
    `;
    
    const existingModal = document.getElementById('preview-modal');
    if (existingModal) existingModal.remove();
    
    const modalContainer = document.createElement('div');
    modalContainer.id = 'preview-modal';
    modalContainer.innerHTML = modalHtml;
    document.body.appendChild(modalContainer);
}

function closePreviewModal() {
    const modal = document.getElementById('preview-modal');
    if (modal) modal.remove();
}

window.closePreviewModal = closePreviewModal;

function copyPreviewText() {
    const content = document.getElementById('preview-content');
    if (!content) return;
    
    const text = content.innerText;
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard!', 'success');
    }).catch(() => {
        const range = document.createRange();
        range.selectNode(content);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        document.execCommand('copy');
        showToast('Copied to clipboard!', 'success');
    });
}

window.copyPreviewText = copyPreviewText;

// ====== EXPORT AS PROPER PDF USING html2pdf ======

function exportPreviewPDF() {
    const content = document.getElementById('preview-content');
    if (!content) return;
    
    // Show loading toast
    showToast('Generating PDF...', 'info');
    
    // Clone the content to avoid affecting the displayed content
    const clone = content.cloneNode(true);
    
    // Create a clean container for PDF
    const container = document.createElement('div');
    container.style.padding = '40px';
    container.style.background = 'white';
    container.style.fontFamily = "'Inter', sans-serif";
    container.style.maxWidth = '900px';
    container.style.margin = '0 auto';
    container.style.color = '#1a1a2e';
    container.appendChild(clone);
    
    // Create a temporary container in the document
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'fixed';
    tempContainer.style.left = '-9999px';
    tempContainer.style.top = '0';
    tempContainer.style.width = '100%';
    tempContainer.style.background = 'white';
    tempContainer.appendChild(container);
    document.body.appendChild(tempContainer);
    
    // Import FontAwesome for PDF
    const faLink = document.createElement('link');
    faLink.rel = 'stylesheet';
    faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
    container.appendChild(faLink);
    
    // Generate PDF using html2pdf
    const opt = {
        margin:        [0, 0, 0, 0],
        filename:     `${currentOutputType}-${profileData.name.replace(/\s+/g, '-')}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, allowTaint: true, letterRendering: true },
        jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' },
        pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
    };
    
    if (typeof html2pdf !== 'undefined') {
        html2pdf().set(opt).from(container).save().then(() => {
            document.body.removeChild(tempContainer);
            showToast('PDF downloaded successfully!', 'success');
        }).catch((error) => {
            console.error('PDF generation error:', error);
            document.body.removeChild(tempContainer);
            showToast('Failed to generate PDF. Please try again.', 'error');
        });
    } else {
        // Fallback - try to load html2pdf
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
        script.onload = () => {
            html2pdf().set(opt).from(container).save().then(() => {
                document.body.removeChild(tempContainer);
                showToast('PDF downloaded successfully!', 'success');
            }).catch((error) => {
                console.error('PDF generation error:', error);
                document.body.removeChild(tempContainer);
                showToast('Failed to generate PDF. Please try again.', 'error');
            });
        };
        script.onerror = () => {
            document.body.removeChild(tempContainer);
            showToast('PDF library failed to load. Please try again.', 'error');
        };
        document.head.appendChild(script);
    }
}

window.exportPreviewPDF = exportPreviewPDF;

// ====== SAVE PROFILE ======

async function saveProfile() {
    if (!currentUser) {
        showToast('Please login to save profiles', 'error');
        return;
    }
    
    const name = document.getElementById('id-full-name')?.value || 'Untitled';
    const profileName = prompt('Enter a name for this profile:', name + ' - ' + new Date().toLocaleDateString());
    if (!profileName) return;
    
    try {
        const data = getProfileDataFromForm();
        const saveData = {
            ...data,
            photo: profilePhotoBase64 || null
        };
        
        await addDoc(collection(db, 'identityProfiles'), {
            userId: currentUser.uid,
            name: profileName,
            profileData: saveData,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        
        showToast('Profile saved successfully!', 'success');
        await loadSavedProfiles();
        updateStats();
    } catch (error) {
        console.error('Error saving profile:', error);
        showToast('Failed to save profile', 'error');
    }
}

// ====== LOAD PROFILE ======

async function loadProfile() {
    if (savedProfiles.length === 0) {
        showToast('No saved profiles found', 'info');
        return;
    }
    
    const modalHtml = `
        <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target === this) closeLoadModal()">
            <div class="rounded-2xl w-full max-w-md mx-auto" style="background: var(--bg-secondary);">
                <div class="sticky top-0 flex justify-between items-center p-5 border-b" style="background: var(--bg-secondary); border-color: var(--border-color);">
                    <h2 class="text-xl font-bold" style="color: var(--text-primary);"><i class="fas fa-upload mr-2" style="color: var(--deep-blue);"></i>Load Profile</h2>
                    <button onclick="closeLoadModal()" class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition">
                        <i class="fas fa-times text-muted"></i>
                    </button>
                </div>
                <div class="p-5 space-y-2">
                    ${savedProfiles.map(p => `
                        <button onclick="loadProfileById('${p.id}')" class="w-full text-left px-4 py-3 rounded-lg transition-all hover:bg-primary/10" style="color: var(--text-primary);">
                            <div class="font-semibold"><i class="fas fa-user mr-2" style="color: var(--deep-blue);"></i>${escapeHtml(p.name)}</div>
                            <div class="text-xs text-muted"><i class="far fa-clock mr-1"></i>${formatDate(p.updatedAt)}</div>
                        </button>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    
    const container = document.createElement('div');
    container.id = 'load-modal';
    container.innerHTML = modalHtml;
    document.body.appendChild(container);
}

function closeLoadModal() {
    const modal = document.getElementById('load-modal');
    if (modal) modal.remove();
}

window.closeLoadModal = closeLoadModal;

async function loadProfileById(id) {
    const profile = savedProfiles.find(p => p.id === id);
    if (!profile) return;
    
    const data = profile.profileData;
    if (!data) return;
    
    // Update form fields
    document.getElementById('id-full-name').value = data.name || '';
    document.getElementById('id-job-title').value = data.title || '';
    document.getElementById('id-email').value = data.email || '';
    document.getElementById('id-phone').value = data.phone || '';
    document.getElementById('id-location').value = data.location || '';
    document.getElementById('id-linkedin').value = data.linkedin || '';
    document.getElementById('id-github').value = data.github || '';
    document.getElementById('id-bio').value = data.bio || '';
    document.getElementById('id-skills').value = (data.skills || []).join(', ');
    document.getElementById('id-experience').value = (data.experience || []).map(e => `${e.company}, ${e.title}, ${e.years}, ${e.description}`).join('\n');
    document.getElementById('id-education').value = (data.education || []).map(e => `${e.school}, ${e.degree}, ${e.years}`).join('\n');
    document.getElementById('id-certifications').value = (data.certifications || []).join(', ');
    document.getElementById('id-languages').value = (data.languages || []).join(', ');
    document.getElementById('id-interests').value = (data.interests || []).join(', ');
    
    // Load photo
    if (data.photo) {
        profilePhotoBase64 = data.photo;
        const preview = document.getElementById('profile-photo-preview');
        if (preview) {
            preview.innerHTML = `<img src="${data.photo}" alt="Profile Photo" class="w-full h-full object-cover">`;
        }
        document.getElementById('remove-photo-btn')?.classList.remove('hidden');
    }
    
    // Update profileData
    profileData = data;
    
    closeLoadModal();
    showToast('Profile loaded successfully!', 'success');
    renderTemplates();
}

window.loadProfileById = loadProfileById;

// ====== GET PROFILE DATA FROM FORM ======

function getProfileDataFromForm() {
    const skills = document.getElementById('id-skills')?.value?.split(',').map(s => s.trim()).filter(Boolean) || [];
    const experience = document.getElementById('id-experience')?.value?.split('\n').filter(Boolean).map(line => {
        const parts = line.split(',').map(s => s.trim());
        return { company: parts[0] || '', title: parts[1] || '', years: parts[2] || '', description: parts[3] || '' };
    }) || [];
    const education = document.getElementById('id-education')?.value?.split('\n').filter(Boolean).map(line => {
        const parts = line.split(',').map(s => s.trim());
        return { school: parts[0] || '', degree: parts[1] || '', years: parts[2] || '' };
    }) || [];
    const certifications = document.getElementById('id-certifications')?.value?.split(',').map(s => s.trim()).filter(Boolean) || [];
    const languages = document.getElementById('id-languages')?.value?.split(',').map(s => s.trim()).filter(Boolean) || [];
    const interests = document.getElementById('id-interests')?.value?.split(',').map(s => s.trim()).filter(Boolean) || [];
    
    return {
        name: document.getElementById('id-full-name')?.value || '',
        title: document.getElementById('id-job-title')?.value || '',
        email: document.getElementById('id-email')?.value || '',
        phone: document.getElementById('id-phone')?.value || '',
        location: document.getElementById('id-location')?.value || '',
        linkedin: document.getElementById('id-linkedin')?.value || '',
        github: document.getElementById('id-github')?.value || '',
        bio: document.getElementById('id-bio')?.value || '',
        skills: skills,
        experience: experience,
        education: education,
        certifications: certifications,
        languages: languages,
        interests: interests
    };
}

// ====== UPDATE STATS ======

function updateStats() {
    const profileCount = document.getElementById('profile-count');
    if (profileCount) profileCount.textContent = savedProfiles.length;
}

// ====== SETUP EVENT LISTENERS ======

export async function loadIdentityData() {
    // Render templates
    renderTemplates();
    updateStats();
    
    // Output type buttons
    document.querySelectorAll('.output-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.output-type-btn').forEach(b => {
                b.classList.remove('active');
                b.style.background = 'var(--bg-secondary)';
                b.style.color = 'var(--text-muted)';
            });
            btn.classList.add('active');
            btn.style.background = 'var(--deep-blue)';
            btn.style.color = 'white';
            currentOutputType = btn.dataset.type;
        });
    });
    
    // Category buttons
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.category-btn').forEach(b => {
                b.classList.remove('active');
                b.style.background = 'var(--bg-secondary)';
                b.style.color = 'var(--text-muted)';
            });
            btn.classList.add('active');
            btn.style.background = 'var(--deep-blue)';
            btn.style.color = 'white';
            currentCategory = btn.dataset.category;
            renderTemplates();
        });
    });
    
    // Color picker
    document.getElementById('color-picker')?.addEventListener('input', (e) => {
        currentColor = e.target.value;
        document.getElementById('color-hex').textContent = currentColor;
        if (selectedTemplate) {
            selectedTemplate.color = currentColor;
            renderTemplates();
        }
    });
    
    // Form inputs
    document.querySelectorAll('#identity-profile-form input, #identity-profile-form textarea').forEach(input => {
        input.addEventListener('input', () => {
            profileData = getProfileDataFromForm();
            renderTemplates();
        });
    });
    
    // Generate buttons
    const generateBtn = document.getElementById('generate-identity-btn');
    const generateBtnMain = document.getElementById('generate-identity-btn-main');
    
    const generateHandler = () => {
        profileData = getProfileDataFromForm();
        showPreviewModal();
    };
    
    if (generateBtn) generateBtn.addEventListener('click', generateHandler);
    if (generateBtnMain) generateBtnMain.addEventListener('click', generateHandler);
    
    // Save profile
    const saveBtn = document.getElementById('save-profile-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveProfile);
    
    // Load profile
    const loadBtn = document.getElementById('load-profile-btn');
    if (loadBtn) loadBtn.addEventListener('click', loadProfile);
    
    // Font, header, spacing
    document.getElementById('font-select')?.addEventListener('change', renderTemplates);
    document.getElementById('header-style')?.addEventListener('change', renderTemplates);
    document.getElementById('spacing')?.addEventListener('change', renderTemplates);
    
    // Photo upload
    document.getElementById('upload-photo-btn')?.addEventListener('click', () => {
        document.getElementById('photo-input')?.click();
    });
    
    document.getElementById('photo-input')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        if (file.size > 500 * 1024) {
            showToast('Photo too large. Maximum 500KB.', 'error');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (event) => {
            profilePhotoBase64 = event.target.result;
            const preview = document.getElementById('profile-photo-preview');
            if (preview) {
                preview.innerHTML = `<img src="${profilePhotoBase64}" alt="Profile Photo" class="w-full h-full object-cover">`;
            }
            document.getElementById('remove-photo-btn')?.classList.remove('hidden');
            showToast('Photo uploaded successfully!', 'success');
        };
        reader.readAsDataURL(file);
    });
    
    document.getElementById('remove-photo-btn')?.addEventListener('click', () => {
        profilePhotoBase64 = null;
        const preview = document.getElementById('profile-photo-preview');
        if (preview) {
            preview.innerHTML = `<i class="fas fa-user text-4xl" style="color: var(--text-muted);"></i>`;
        }
        document.getElementById('remove-photo-btn')?.classList.add('hidden');
        showToast('Photo removed', 'info');
    });
    
    injectFormStyles();
    
    console.log('✅ Identity Builder initialized');
    console.log('📝 Templates loaded:', templates.length);
    console.log('📁 Saved profiles:', savedProfiles.length);
}

// ====== INJECT FORM STYLES ======

function injectFormStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .form-group { margin-bottom: 4px; }
        .form-label {
            display: block;
            font-size: 11px;
            font-weight: 600;
            color: var(--text-muted, #737686);
            margin-bottom: 4px;
            letter-spacing: 0.3px;
        }
        .form-input {
            width: 100%;
            padding: 8px 12px;
            border-radius: 8px;
            border: 1px solid var(--border-color, #e2e8f0);
            background: var(--bg-primary, #ffffff);
            color: var(--text-primary, #0d1c2f);
            font-size: 13px;
            transition: all 0.2s ease;
            outline: none;
        }
        .form-input:focus {
            border-color: var(--deep-blue, #004ac6);
            box-shadow: 0 0 0 3px rgba(0, 74, 198, 0.1);
        }
        .form-input::placeholder {
            color: var(--text-muted, #94a3b8);
            font-size: 12px;
        }
        .dark .form-input {
            background: var(--bg-primary, #0f1a2e);
            border-color: var(--border-color, #2a3a4a);
            color: var(--text-primary, #e8edf5);
        }
        .dark .form-input:focus {
            border-color: var(--deep-blue, #3a7aef);
            box-shadow: 0 0 0 3px rgba(58, 122, 239, 0.15);
        }
        .dark .form-label {
            color: var(--text-muted, #5a6a7a);
        }
        .template-card.active {
            transform: scale(1.04);
            transition: all 0.3s ease;
            z-index: 2;
        }
        .template-card {
            transition: all 0.3s ease;
        }
        .template-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0,0,0,0.08);
        }
        .preview {
            transition: all 0.3s ease;
        }
        #preview-content {
            font-size: 14px;
            line-height: 1.6;
        }
        #preview-content h1, #preview-content h2, #preview-content h3 {
            margin-top: 0;
        }
        #preview-content i {
            display: inline-block;
        }
    `;
    document.head.appendChild(style);
}

// Export for main app
window.IdentityApp = {
    loadIdentityData,
    renderIdentityPage,
    saveProfile,
    loadProfile,
    generateContent,
    showPreviewModal,
    closePreviewModal,
    exportPreviewPDF
};