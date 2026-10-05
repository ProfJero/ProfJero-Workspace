// js/pages/client-portal.js
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, serverTimestamp, Timestamp, getDoc, onSnapshot } from 'firebase/firestore';
import { showToast, escapeHtml, formatDate, timeAgo, formatCurrency } from '../utils/helpers.js';

// Use the global db and auth from window
const db = window.db;
const auth = window.auth;

let clientPortalState = {
    authenticated: false,
    clientId: null,
    clientData: null,
    invoices: [],
    paymentHistory: [],
    accessToken: null,
    phoneNumber: '',
    pendingPayments: [],
    paymentListeners: {}
};

// Business Settings will be passed from the main HTML
let businessSettings = null;

// ============================================
// HELPER FUNCTIONS
// ============================================
function generateAccessToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
}

function setButtonLoading(button, isLoading, originalText = null) {
    if (!button) return;
    
    if (isLoading) {
        button.disabled = true;
        button.dataset.originalText = originalText || button.innerHTML;
        button.innerHTML = '<span class="spinner-inline spinner-inline-white"></span> Processing...';
    } else {
        button.disabled = false;
        button.innerHTML = button.dataset.originalText || originalText || button.innerHTML;
    }
}

// Get theme colors for modals
function getThemeColors() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const isDark = currentTheme === 'dark';
    
    return {
        isDark,
        modalBg: isDark ? '#1e293b' : '#ffffff',
        modalText: isDark ? '#f1f5f9' : '#1a1a2e',
        borderColor: isDark ? '#334155' : '#e2e8f0',
        bgPrimary: isDark ? '#0f172a' : '#f1f5f9',
        textMuted: isDark ? '#94a3b8' : '#64748b',
        deepBlue: isDark ? '#60a5fa' : '#1a237e'
    };
}

// ============================================
// LOAD CLIENT DATA FUNCTIONS
// ============================================
async function loadClientInvoices(clientData) {
    try {
        console.log('📄 Loading invoices for client:', clientData);
        
        let invoices = [];
        const clientPhone = clientData.phone;
        const clientName = clientData.name;
        const clientEmail = clientData.email;
        
        // Approach 1: Query invoices by clientPhone
        try {
            const invoicesRef = collection(db, 'invoices');
            const q = query(invoicesRef, where('clientPhone', '==', clientPhone));
            const querySnapshot = await getDocs(q);
            invoices = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`📄 Approach 1: Found ${invoices.length} invoices by clientPhone`);
        } catch (e) {
            console.log('⚠️ Approach 1 failed:', e.message);
        }
        
        // Approach 2: Query by clientName
        if (invoices.length === 0 && clientName) {
            try {
                const invoicesRef = collection(db, 'invoices');
                const q = query(invoicesRef, where('clientName', '==', clientName));
                const querySnapshot = await getDocs(q);
                invoices = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                console.log(`📄 Approach 2: Found ${invoices.length} invoices by clientName`);
            } catch (e) {
                console.log('⚠️ Approach 2 failed:', e.message);
            }
        }
        
        // Approach 3: Query by clientEmail
        if (invoices.length === 0 && clientEmail) {
            try {
                const invoicesRef = collection(db, 'invoices');
                const q = query(invoicesRef, where('clientEmail', '==', clientEmail));
                const querySnapshot = await getDocs(q);
                invoices = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                console.log(`📄 Approach 3: Found ${invoices.length} invoices by clientEmail`);
            } catch (e) {
                console.log('⚠️ Approach 3 failed:', e.message);
            }
        }
        
        // Approach 4: Fallback - filter all invoices
        if (invoices.length === 0) {
            try {
                const invoicesRef = collection(db, 'invoices');
                const querySnapshot = await getDocs(invoicesRef);
                const allInvoices = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                invoices = allInvoices.filter(inv => 
                    inv.clientPhone === clientPhone ||
                    inv.clientName === clientName ||
                    (clientEmail && inv.clientEmail === clientEmail)
                );
                console.log(`📄 Approach 4: Found ${invoices.length} invoices by client filtering`);
            } catch (e) {
                console.log('⚠️ Approach 4 failed:', e.message);
            }
        }
        
        clientPortalState.invoices = invoices;
        clientPortalState.invoices.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        console.log(`📄 Total invoices loaded: ${clientPortalState.invoices.length}`);
    } catch (error) {
        console.error('❌ Error loading client invoices:', error);
        clientPortalState.invoices = [];
    }
}

async function loadPaymentHistory(clientId) {
    try {
        console.log('💳 Loading payment history for client:', clientId);
        
        let payments = [];
        
        // Approach 1: Query by clientId
        try {
            const paymentRef = collection(db, 'paymentHistory');
            const q = query(paymentRef, where('clientId', '==', clientId), orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);
            payments = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`💳 Approach 1: Found ${payments.length} payments by clientId`);
        } catch (e) {
            console.log('⚠️ Approach 1 failed:', e.message);
        }
        
        // Approach 2: Filter by invoiceId
        if (payments.length === 0 && clientPortalState.invoices.length > 0) {
            try {
                const paymentRef = collection(db, 'paymentHistory');
                const querySnapshot = await getDocs(paymentRef);
                const allPayments = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                const invoiceIds = clientPortalState.invoices.map(inv => inv.id);
                payments = allPayments.filter(p => invoiceIds.includes(p.invoiceId));
                console.log(`💳 Approach 2: Found ${payments.length} payments by invoice filtering`);
            } catch (e) {
                console.log('⚠️ Approach 2 failed:', e.message);
            }
        }
        
        clientPortalState.paymentHistory = payments;
        console.log(`💳 Total payments loaded: ${clientPortalState.paymentHistory.length}`);
    } catch (error) {
        console.error('❌ Error loading payment history:', error);
        clientPortalState.paymentHistory = [];
    }
}

// ============================================
// REAL-TIME PAYMENT CONFIRMATION LISTENER
// ============================================
function setupPaymentConfirmationListener(invoiceId) {
    console.log(`👂 Setting up payment confirmation listener for invoice: ${invoiceId}`);
    
    // Clean up existing listeners for this invoice
    if (clientPortalState.paymentListeners[invoiceId]) {
        clientPortalState.paymentListeners[invoiceId]();
        delete clientPortalState.paymentListeners[invoiceId];
    }
    
    // Query for pending payments for this invoice
    const paymentRef = collection(db, 'paymentHistory');
    const q = query(
        paymentRef,
        where('invoiceId', '==', invoiceId),
        where('status', 'in', ['pending_approval', 'pending'])
    );
    
    // Set up real-time listener
    const unsubscribe = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'modified' || change.type === 'added') {
                const paymentData = { id: change.doc.id, ...change.doc.data() };
                console.log('🔄 Payment status changed:', paymentData);
                
                // Check if payment was confirmed (status changed to 'approved' or 'completed')
                if (paymentData.status === 'approved' || paymentData.status === 'completed' || paymentData.status === 'confirmed') {
                    console.log('✅ Payment confirmed for invoice:', invoiceId);
                    
                    // Update the invoice status
                    updateInvoiceAfterConfirmation(invoiceId, paymentData);
                    
                    // Show success message with amount
                    showToast(
                        `Payment of ${formatCurrency(paymentData.amount, 'GHS')} confirmed for invoice ${paymentData.invoiceNumber || ''}`,
                        'success',
                        'Payment Approved ✅'
                    );
                    
                    // Refresh the portal
                    refreshClientPortal();
                    
                    // Clean up the listener after confirmation
                    if (clientPortalState.paymentListeners[invoiceId]) {
                        clientPortalState.paymentListeners[invoiceId]();
                        delete clientPortalState.paymentListeners[invoiceId];
                    }
                }
            }
        });
    }, (error) => {
        console.error('❌ Payment listener error:', error);
    });
    
    // Store the unsubscribe function
    clientPortalState.paymentListeners[invoiceId] = unsubscribe;
}

async function updateInvoiceAfterConfirmation(invoiceId, paymentData) {
    try {
        const invoiceRef = doc(db, 'invoices', invoiceId);
        const invoiceSnap = await getDoc(invoiceRef);
        
        if (invoiceSnap.exists()) {
            const invoice = invoiceSnap.data();
            const totalPaid = (invoice.amountPaid || 0) + (paymentData.amount || 0);
            
            let newStatus = 'paid';
            if (totalPaid < (invoice.total || 0)) {
                newStatus = 'partially-paid';
            }
            
            await updateDoc(invoiceRef, {
                status: newStatus,
                amountPaid: totalPaid,
                balanceDue: (invoice.total || 0) - totalPaid,
                updatedAt: serverTimestamp()
            });
            
            console.log(`✅ Invoice ${invoiceId} updated to status: ${newStatus}`);
        }
    } catch (error) {
        console.error('❌ Error updating invoice after confirmation:', error);
    }
}

async function refreshClientPortal() {
    if (clientPortalState.clientData) {
        await loadClientInvoices(clientPortalState.clientData);
        await loadPaymentHistory(clientPortalState.clientId);
        
        const container = document.getElementById('client-portal-container');
        if (container && clientPortalState.authenticated) {
            container.innerHTML = renderAuthenticatedContent();
        }
    }
}

// ============================================
// AUTHENTICATION FUNCTIONS
// ============================================
async function authenticateWithToken(token) {
    try {
        console.log('🔐 Authenticating with token:', token);
        
        const clientsRef = collection(db, 'clients');
        const q = query(clientsRef, where('accessToken', '==', token));
        const querySnapshot = await getDocs(q);
        
        console.log('📊 Query results:', querySnapshot.size);
        
        if (!querySnapshot.empty) {
            const docSnapshot = querySnapshot.docs[0];
            const data = docSnapshot.data();
            console.log('✅ Client found:', data);
            
            clientPortalState.clientId = docSnapshot.id;
            clientPortalState.clientData = { id: docSnapshot.id, ...data };
            clientPortalState.authenticated = true;
            
            await loadClientInvoices(clientPortalState.clientData);
            await loadPaymentHistory(clientPortalState.clientId);
            
            // Update last login
            try {
                const clientRef = doc(db, 'clients', clientPortalState.clientId);
                await updateDoc(clientRef, {
                    lastLogin: serverTimestamp()
                });
            } catch (e) {
                console.log('⚠️ Could not update last login:', e);
            }
            
            // Check if invoice ID is provided
            const urlParams = new URLSearchParams(window.location.search);
            const invoiceId = urlParams.get('invoice');
            if (invoiceId) {
                const invoice = clientPortalState.invoices.find(i => i.id === invoiceId);
                if (invoice) {
                    setTimeout(() => {
                        ClientPortal.viewInvoice(invoiceId);
                    }, 500);
                }
            }
            
            showToast('Welcome back!', 'success');
            return true;
        } else {
            console.log('❌ No client found with token.');
            return false;
        }
    } catch (error) {
        console.error('❌ Token authentication failed:', error);
        return false;
    }
}

// ============================================
// RENDER FUNCTIONS
// ============================================
function renderLoginContent() {
    return `
        <div class="login-container">
            <div class="glass-card rounded-2xl p-8 animate-fade-in">
                <div class="text-center mb-8">
                    <div class="login-logo">
                        <i class="fas fa-file-invoice"></i>
                    </div>
                    <h1 class="text-2xl font-bold" style="color: var(--text-primary);">Client Portal</h1>
                    <p class="text-sm text-muted mt-2">Access your invoices and make payments</p>
                </div>
                
                <form id="client-login-form" class="space-y-4">
                    <div>
                        <label class="block text-sm font-semibold mb-2" style="color: var(--text-primary);">Phone Number</label>
                        <div class="relative">
                            <span class="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted">+233</span>
                            <input type="tel" id="login-phone" placeholder="24XXXXXXXX" required
                                   class="input-premium pl-16">
                        </div>
                        <p class="text-xs text-muted mt-1">Enter the phone number associated with your account</p>
                    </div>
                    
                    <button type="submit" id="login-btn" class="btn-premium btn-premium-primary w-full py-3">
                        <i class="fas fa-sign-in-alt mr-2"></i> Access Your Account
                    </button>
                </form>
                
                <div class="mt-6 text-center">
                    <p class="text-xs text-muted">Secure access to your invoices</p>
                    <p class="text-xs text-muted mt-1">Your data is encrypted and protected</p>
                </div>
            </div>
        </div>
    `;
}

function renderInvoiceItem(invoice) {
    const statusClasses = {
        draft: 'badge-draft',
        sent: 'badge-sent',
        pending: 'badge-pending',
        pending_approval: 'badge-pending',
        'partially-paid': 'badge-partially-paid',
        paid: 'badge-paid',
        overdue: 'badge-overdue',
        cancelled: 'badge-cancelled',
        refunded: 'badge-refunded'
    };
    
    const statusLabels = {
        draft: 'Draft',
        sent: 'Sent',
        pending: 'Pending',
        pending_approval: 'Pending Approval',
        'partially-paid': 'Partially Paid',
        paid: 'Paid',
        overdue: 'Overdue',
        cancelled: 'Cancelled',
        refunded: 'Refunded'
    };
    
    const statusIcons = {
        draft: 'fa-file',
        sent: 'fa-paper-plane',
        pending: 'fa-clock',
        pending_approval: 'fa-hourglass-half',
        'partially-paid': 'fa-half',
        paid: 'fa-check-circle',
        overdue: 'fa-exclamation-triangle',
        cancelled: 'fa-ban',
        refunded: 'fa-undo'
    };
    
    const isOverdue = invoice.dueDate && new Date(invoice.dueDate) < new Date() && invoice.status !== 'paid' && invoice.status !== 'cancelled';
    const statusDisplay = invoice.status || 'draft';
    const displayLabel = statusLabels[statusDisplay] || statusDisplay.replace('-', ' ').toUpperCase();
    
    return `
        <div class="invoice-item glass-card rounded-xl p-4 transition-all hover:shadow-md">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                    <div class="flex items-center gap-3 flex-wrap">
                        <span class="font-semibold" style="color: var(--text-primary);">${invoice.invoiceNumber || 'N/A'}</span>
                        <span class="badge ${statusClasses[statusDisplay] || 'badge-draft'}">
                            <i class="fas ${statusIcons[statusDisplay] || 'fa-file-invoice'} text-xs mr-1"></i> 
                            ${displayLabel}
                        </span>
                        ${isOverdue ? '<span class="badge badge-overdue"><i class="fas fa-clock mr-1"></i>OVERDUE</span>' : ''}
                    </div>
                    <div class="text-sm text-muted mt-1">
                        <i class="fas fa-calendar-alt mr-1"></i> ${formatDate(invoice.date)}
                        ${invoice.dueDate ? `• <i class="fas fa-hourglass-end mr-1"></i> Due: ${formatDate(invoice.dueDate)}` : ''}
                    </div>
                </div>
                <div class="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <div class="text-right">
                        <div class="font-bold text-lg" style="color: var(--text-primary);">${formatCurrency(invoice.total || 0, 'GHS')}</div>
                        ${invoice.amountPaid > 0 ? `
                            <div class="text-xs text-muted">Paid: ${formatCurrency(invoice.amountPaid, 'GHS')}</div>
                            <div class="text-xs" style="color: ${(invoice.total - invoice.amountPaid) > 0 ? '#ef4444' : '#10b981'};">Balance: ${formatCurrency(invoice.total - invoice.amountPaid, 'GHS')}</div>
                        ` : ''}
                    </div>
                    <div class="flex gap-2 flex-wrap">
                        <button onclick="window.ClientPortal.viewInvoice('${invoice.id}')" class="btn-premium btn-premium-primary text-sm py-1.5 px-3">
                            <i class="fas fa-eye mr-1"></i> View
                        </button>
                        <button onclick="window.ClientPortal.downloadInvoice('${invoice.id}')" class="btn-premium btn-premium-secondary text-sm py-1.5 px-3">
                            <i class="fas fa-download mr-1"></i> PDF
                        </button>
                        ${invoice.status !== 'paid' && invoice.status !== 'cancelled' ? `
                            <button onclick="window.ClientPortal.payNow('${invoice.id}')" class="btn-premium btn-premium-success text-sm py-1.5 px-3">
                                <i class="fas fa-mobile-alt mr-1"></i> Pay
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderAuthenticatedContent() {
    const client = clientPortalState.clientData;
    const invoices = clientPortalState.invoices;
    const paymentHistory = clientPortalState.paymentHistory;
    
    const totalInvoices = invoices.length;
    const totalAmount = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const totalPaid = invoices.reduce((sum, inv) => sum + (inv.amountPaid || 0), 0);
    const balanceDue = totalAmount - totalPaid;
    
    // Check for pending approval payments
    const pendingApprovals = paymentHistory.filter(p => p.status === 'pending_approval' || p.status === 'pending');
    
    // Use business settings from the global window object
    const settings = window.businessSettings || businessSettings;
    
    return `
        <!-- Header -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 animate-fade-in">
            <div>
                <h1 class="text-2xl md:text-3xl font-bold" style="color: var(--text-primary);">
                    Welcome, ${escapeHtml(client?.name || 'Client')}
                </h1>
                <p class="text-sm text-muted">${escapeHtml(client?.email || client?.phone || '')}</p>
            </div>
            <div class="flex gap-2">
                ${pendingApprovals.length > 0 ? `
                    <span class="px-3 py-2 rounded-lg text-sm font-semibold" style="background: rgba(245,158,11,0.15); color: #f59e0b;">
                        <i class="fas fa-hourglass-half mr-1"></i> ${pendingApprovals.length} pending approval
                    </span>
                ` : ''}
                <button onclick="window.ClientPortal.logout()" class="btn-premium btn-premium-danger">
                    <i class="fas fa-sign-out-alt mr-1"></i> Logout
                </button>
            </div>
        </div>
        
        <!-- Stats -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 animate-fade-in-up">
            <div class="glass-card rounded-xl p-5 stat-card">
                <div class="flex items-center justify-between">
                    <span class="text-sm text-muted">Total Invoices</span>
                    <div class="stat-icon stat-icon-blue">
                        <i class="fas fa-file-invoice"></i>
                    </div>
                </div>
                <div class="stat-number mt-2" style="color: var(--text-primary);">${totalInvoices}</div>
            </div>
            <div class="glass-card rounded-xl p-5 stat-card">
                <div class="flex items-center justify-between">
                    <span class="text-sm text-muted">Total Amount</span>
                    <div class="stat-icon stat-icon-gold">
                        <i class="fas fa-money-bill-wave"></i>
                    </div>
                </div>
                <div class="stat-number mt-2" style="color: var(--text-primary);">${formatCurrency(totalAmount, 'GHS')}</div>
            </div>
            <div class="glass-card rounded-xl p-5 stat-card">
                <div class="flex items-center justify-between">
                    <span class="text-sm text-muted">Amount Paid</span>
                    <div class="stat-icon stat-icon-emerald">
                        <i class="fas fa-check-circle"></i>
                    </div>
                </div>
                <div class="stat-number mt-2" style="color: var(--emerald);">${formatCurrency(totalPaid, 'GHS')}</div>
            </div>
            <div class="glass-card rounded-xl p-5 stat-card">
                <div class="flex items-center justify-between">
                    <span class="text-sm text-muted">Balance Due</span>
                    <div class="stat-icon ${balanceDue > 0 ? 'stat-icon-red' : 'stat-icon-emerald'}">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                </div>
                <div class="stat-number mt-2" style="color: ${balanceDue > 0 ? '#ef4444' : 'var(--emerald)'};">${formatCurrency(balanceDue, 'GHS')}</div>
            </div>
        </div>
        
        <!-- Invoices Section -->
        <div class="glass-card rounded-xl p-6 mb-8 animate-fade-in-up">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                <h2 class="text-xl font-bold" style="color: var(--text-primary);">
                    <i class="fas fa-file-invoice-dollar mr-2" style="color: var(--deep-blue);"></i>My Invoices
                </h2>
            </div>
            
            <div id="invoices-list">
                ${invoices.length === 0 ? `
                    <div class="text-center py-8">
                        <i class="fas fa-file-invoice text-4xl text-muted mb-3"></i>
                        <p class="text-muted">No invoices found for your account</p>
                        <p class="text-xs text-muted mt-2">If you have invoices, please contact support</p>
                    </div>
                ` : `
                    <div class="space-y-3">
                        ${invoices.map(inv => renderInvoiceItem(inv)).join('')}
                    </div>
                `}
            </div>
        </div>
        
        <!-- Payment History -->
        ${paymentHistory.length > 0 ? `
            <div class="glass-card rounded-xl p-6 animate-fade-in-up">
                <h2 class="text-xl font-bold mb-4" style="color: var(--text-primary);">
                    <i class="fas fa-history mr-2" style="color: var(--deep-blue);"></i>Payment History
                </h2>
                <div class="overflow-x-auto">
                    <table class="table-premium">
                        <thead>
                            <tr>
                                <th>Invoice</th>
                                <th>Date</th>
                                <th class="text-right">Amount</th>
                                <th>Method</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${paymentHistory.map(p => `
                                <tr>
                                    <td>${p.invoiceNumber || 'N/A'}</td>
                                    <td>${formatDate(p.paymentDate)}</td>
                                    <td class="text-right font-semibold" style="color: ${p.status === 'approved' || p.status === 'completed' || p.status === 'confirmed' ? 'var(--emerald)' : 'var(--gold)'};">${formatCurrency(p.amount || 0, 'GHS')}</td>
                                    <td>${p.paymentMethod || 'N/A'}</td>
                                    <td>
                                        <span class="badge ${p.status === 'approved' || p.status === 'completed' || p.status === 'confirmed' ? 'badge-paid' : p.status === 'pending_approval' || p.status === 'pending' ? 'badge-pending' : 'badge-draft'}">
                                            ${p.status === 'pending_approval' ? 'Pending Approval' : 
                                              p.status === 'approved' || p.status === 'confirmed' ? 'Approved ✅' : 
                                              p.status || 'pending'}
                                        </span>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        ` : ''}
        
        <!-- Mobile Money Payment Info -->
        <div class="payment-section mt-8 animate-fade-in-up">
            <h3 class="text-lg font-semibold mb-2" style="color: var(--text-primary);">
                <i class="fas fa-mobile-alt mr-2" style="color: var(--deep-blue);"></i>Pay with Mobile Money
            </h3>
            <p class="text-sm text-muted mb-3">Make payments directly to our mobile money account</p>
            <div class="payment-details" style="background: var(--bg-card); border: 1px solid var(--border-color);">
                <div class="text-sm font-semibold" style="color: var(--text-primary);">
                    Mobile Money: <span class="mobile-money-number">${escapeHtml(settings?.paymentDetails?.mobileMoney || '0244XXXXXX')}</span>
                </div>
                <div class="text-sm" style="color: var(--text-muted);">
                    Name: <span style="color: var(--text-secondary); font-weight: 500;">${escapeHtml(settings?.paymentDetails?.mobileMoneyName || 'Business Name')}</span>
                </div>
            </div>
            <p class="text-xs text-muted mt-3">After payment, your invoice status will be updated within 24 hours</p>
        </div>
    `;
}

// ============================================
// MAIN RENDER FUNCTION
// ============================================
export async function renderClientPortal() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    if (token) {
        clientPortalState.accessToken = token;
        await authenticateWithToken(token);
    }
    
    return `
        <div class="min-h-screen" style="background: var(--bg-primary);">
            <div class="container mx-auto px-4 py-8 max-w-5xl">
                ${clientPortalState.authenticated ? renderAuthenticatedContent() : renderLoginContent()}
            </div>
        </div>
    `;
}

// ============================================
// SETUP LOGIN HANDLERS
// ============================================
function setupLoginHandlers() {
    const loginForm = document.getElementById('client-login-form');
    const phoneInput = document.getElementById('login-phone');
    const loginBtn = document.getElementById('login-btn');
    
    if (!loginForm) return;
    
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const phone = phoneInput?.value.trim();
        if (!phone) {
            showToast('Please enter your phone number', 'error');
            return;
        }
        
        const originalText = loginBtn.innerHTML;
        setButtonLoading(loginBtn, true);
        
        try {
            await ClientPortal.login(phone);
        } catch (error) {
            console.error('Login error:', error);
            showToast('Login failed. Please try again.', 'error');
        } finally {
            setButtonLoading(loginBtn, false, originalText);
        }
    });
}

// ============================================
// CLIENT PORTAL OBJECT
// ============================================
const ClientPortal = {
    login: async function(phone) {
        try {
            const formattedPhone = phone.startsWith('0') ? phone.substring(1) : phone;
            const fullPhone = `+233${formattedPhone}`;
            
            console.log('📱 Logging in with phone:', fullPhone);
            
            const clientsRef = collection(db, 'clients');
            const q = query(clientsRef, where('phone', '==', fullPhone));
            const querySnapshot = await getDocs(q);
            
            let clientData = null;
            let clientId = null;
            
            if (querySnapshot.empty) {
                console.log('🆕 Creating new client account');
                const token = generateAccessToken();
                const newClientData = {
                    phone: fullPhone,
                    name: 'Client',
                    email: '',
                    accessToken: token,
                    status: 'active',
                    createdAt: serverTimestamp(),
                    lastLogin: serverTimestamp()
                };
                
                try {
                    const docRef = await addDoc(collection(db, 'clients'), newClientData);
                    clientId = docRef.id;
                    clientData = { id: clientId, ...newClientData };
                    console.log('✅ Client created with ID:', clientId);
                    showToast('Account created successfully!', 'success');
                } catch (createError) {
                    console.error('❌ Failed to create client:', createError);
                    showToast('Unable to create account. Please try again.', 'error');
                    return false;
                }
            } else {
                const docSnap = querySnapshot.docs[0];
                clientData = { id: docSnap.id, ...docSnap.data() };
                clientId = docSnap.id;
                console.log('✅ Existing client found:', clientData);
                
                if (!clientData.accessToken) {
                    const token = generateAccessToken();
                    try {
                        const clientRef = doc(db, 'clients', clientId);
                        await updateDoc(clientRef, {
                            accessToken: token,
                            lastLogin: serverTimestamp()
                        });
                        clientData.accessToken = token;
                    } catch (updateError) {
                        console.error('❌ Failed to update token:', updateError);
                    }
                } else {
                    try {
                        const clientRef = doc(db, 'clients', clientId);
                        await updateDoc(clientRef, {
                            lastLogin: serverTimestamp()
                        });
                    } catch (e) {
                        console.log('⚠️ Could not update last login:', e);
                    }
                }
                showToast('Welcome back!', 'success');
            }
            
            clientPortalState.clientId = clientId;
            clientPortalState.clientData = clientData;
            clientPortalState.authenticated = true;
            clientPortalState.accessToken = clientData.accessToken;
            clientPortalState.phoneNumber = fullPhone;
            
            await loadClientInvoices(clientData);
            await loadPaymentHistory(clientId);
            
            const newUrl = `${window.location.pathname}?token=${clientData.accessToken}`;
            window.history.pushState({}, '', newUrl);
            
            const container = document.getElementById('client-portal-container');
            if (container) {
                container.innerHTML = renderAuthenticatedContent();
            }
            
            return true;
        } catch (error) {
            console.error('❌ Login failed:', error);
            showToast('Login failed. Please try again.', 'error');
            return false;
        }
    },
    
    logout: function() {
        // Clean up all payment listeners
        Object.keys(clientPortalState.paymentListeners).forEach(key => {
            if (clientPortalState.paymentListeners[key]) {
                clientPortalState.paymentListeners[key]();
            }
        });
        clientPortalState.paymentListeners = [];
        
        clientPortalState.authenticated = false;
        clientPortalState.clientId = null;
        clientPortalState.clientData = null;
        clientPortalState.invoices = [];
        clientPortalState.paymentHistory = [];
        clientPortalState.accessToken = null;
        
        window.history.pushState({}, '', window.location.pathname);
        
        const container = document.getElementById('client-portal-container');
        if (container) {
            container.innerHTML = renderLoginContent();
            setupLoginHandlers();
        }
        
        showToast('Logged out successfully', 'info');
    },
    
    viewInvoice: async function(invoiceId) {
        const viewButtons = document.querySelectorAll(`[onclick*="viewInvoice('${invoiceId}')"]`);
        viewButtons.forEach(btn => {
            const originalText = btn.innerHTML;
            btn.dataset.originalText = originalText;
            btn.innerHTML = '<span class="spinner-inline"></span> Loading...';
            btn.disabled = true;
        });
        
        try {
            let invoice = clientPortalState.invoices.find(i => i.id === invoiceId);
            
            if (!invoice) {
                try {
                    const invoiceRef = doc(db, 'invoices', invoiceId);
                    const invoiceSnap = await getDoc(invoiceRef);
                    if (invoiceSnap.exists()) {
                        invoice = { id: invoiceSnap.id, ...invoiceSnap.data() };
                        clientPortalState.invoices.push(invoice);
                    }
                } catch (e) {
                    console.log('Could not fetch invoice directly:', e);
                }
            }
            
            if (!invoice) {
                showToast('Invoice not found', 'error');
                viewButtons.forEach(btn => {
                    btn.innerHTML = btn.dataset.originalText || '<i class="fas fa-eye mr-1"></i> View';
                    btn.disabled = false;
                });
                return;
            }
            
            try {
                await addDoc(collection(db, 'invoiceTimeline'), {
                    invoiceNumber: invoice.invoiceNumber,
                    action: 'client_viewed',
                    description: `Invoice viewed by client ${clientPortalState.clientData.name || clientPortalState.clientData.phone}`,
                    clientId: clientPortalState.clientId,
                    timestamp: serverTimestamp()
                });
            } catch (e) {
                console.log('Timeline update skipped:', e.message);
            }
            
            const paymentHistory = clientPortalState.paymentHistory.filter(p => p.invoiceId === invoiceId);
            
            // Use business settings from the global window object
            const settings = window.businessSettings || businessSettings;
            
            const logoHtml = settings?.logo ? 
                `<img src="${settings.logo}" alt="${escapeHtml(settings.name)}" style="max-height: 60px; object-fit: contain; margin-bottom: 10px; display: block;">` : 
                '';
            
            // Get theme colors
            const colors = getThemeColors();
            
            const html = `
                <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto modal-overlay" onclick="if(event.target === this) ClientPortal.closeModal()">
                    <div class="rounded-2xl w-full max-w-4xl mx-auto my-4 sm:my-8 animate-fade-in max-h-[95vh] overflow-y-auto invoice-modal-container" onclick="event.stopPropagation();" style="background: ${colors.modalBg};">
                        <div class="sticky top-0 flex flex-wrap justify-between items-center gap-2 p-3 sm:p-4 border-b z-10" style="background: ${colors.modalBg}; border-color: ${colors.borderColor};">
                            <div>
                                <h2 class="text-base sm:text-xl font-bold" style="color: ${colors.modalText};">Invoice ${invoice.invoiceNumber}</h2>
                            </div>
                            <div class="flex gap-1 sm:gap-2 flex-wrap">
                                <button onclick="ClientPortal.downloadInvoice('${invoiceId}')" class="btn-premium btn-premium-primary text-xs sm:text-sm py-1 px-2 sm:py-1.5 sm:px-3">
                                    <i class="fas fa-download"></i> <span class="hidden xs:inline">PDF</span>
                                </button>
                                ${invoice.status !== 'paid' && invoice.status !== 'cancelled' ? `
                                    <button onclick="ClientPortal.payNow('${invoiceId}'); ClientPortal.closeModal();" class="btn-premium btn-premium-success text-xs sm:text-sm py-1 px-2 sm:py-1.5 sm:px-3">
                                        <i class="fas fa-mobile-alt"></i> <span class="hidden xs:inline">Pay</span>
                                    </button>
                                ` : ''}
                                <button onclick="ClientPortal.closeModal()" class="btn-premium btn-premium-secondary text-xs sm:text-sm py-1 px-2 sm:py-1.5 sm:px-3">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                        
                        <div class="p-3 sm:p-6 invoice-container modal-scrollable" style="background: ${colors.modalBg}; color: ${colors.modalText}; overflow-x: auto;">
                            <div class="max-w-3xl mx-auto">
                                <!-- Header with Logo -->
                                <div class="invoice-header flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4" style="border-bottom-color: ${colors.borderColor}; padding-bottom: 20px; margin-bottom: 25px;">
                                    <div class="w-full sm:w-auto">
                                        ${logoHtml}
                                        <h1 style="font-size: 20px; font-weight: 700; color: ${colors.modalText}; margin: 0;">${escapeHtml(settings?.name || 'ProfJero WorkSpace')}</h1>
                                        ${settings?.address ? `<p style="color: ${colors.textMuted}; font-size: 11px; margin: 4px 0 2px 0;">${escapeHtml(settings.address)}</p>` : ''}
                                        ${settings?.phone ? `<p style="color: ${colors.textMuted}; font-size: 11px; margin: 2px 0;">📞 ${escapeHtml(settings.phone)}</p>` : ''}
                                        ${settings?.email ? `<p style="color: ${colors.textMuted}; font-size: 11px; margin: 2px 0;">✉️ ${escapeHtml(settings.email)}</p>` : ''}
                                    </div>
                                    <div style="text-align: right; width: 100%; sm:width: auto;">
                                        <h2 class="invoice-title" style="font-size: 24px; font-weight: 700; color: ${colors.modalText}; margin: 0;">INVOICE</h2>
                                        <p style="color: ${colors.textMuted}; font-size: 13px; margin: 4px 0;"># ${invoice.invoiceNumber}</p>
                                        <span class="badge ${invoice.status === 'paid' ? 'badge-paid' : invoice.status === 'overdue' ? 'badge-overdue' : 'badge-pending'}" style="font-size: 10px; padding: 0.2rem 0.6rem; color: ${colors.modalText};">
                                            ${invoice.status === 'pending_approval' ? 'Pending Approval' : (invoice.status || 'draft').toUpperCase()}
                                        </span>
                                    </div>
                                </div>
                                
                                <!-- Client & Invoice Details -->
                                <div style="display: grid; grid-template-columns: 1fr; sm:grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px;">
                                    <div>
                                        <p style="color: ${colors.textMuted}; font-size: 11px; font-weight: 600; text-transform: uppercase; margin: 0 0 6px 0; letter-spacing: 0.5px;">Bill To:</p>
                                        <p style="font-size: 14px; font-weight: 600; margin: 4px 0; color: ${colors.modalText};">${escapeHtml(invoice.clientName)}</p>
                                        ${invoice.clientEmail ? `<p style="color: ${colors.textMuted}; font-size: 13px; margin: 4px 0;">${escapeHtml(invoice.clientEmail)}</p>` : ''}
                                        ${invoice.clientPhone ? `<p style="color: ${colors.textMuted}; font-size: 13px; margin: 4px 0;">📞 ${escapeHtml(invoice.clientPhone)}</p>` : ''}
                                    </div>
                                    <div style="text-align: left; sm:text-align: right; margin-top: 10px; sm:margin-top: 0;">
                                        <p style="color: ${colors.textMuted}; font-size: 12px; margin: 4px 0;"><strong>Date:</strong> ${formatDate(invoice.date)}</p>
                                        <p style="color: ${colors.textMuted}; font-size: 12px; margin: 4px 0;"><strong>Due:</strong> ${formatDate(invoice.dueDate)}</p>
                                    </div>
                                </div>
                                
                                <!-- Items Table -->
                                <div style="overflow-x: auto; -webkit-overflow-scrolling: touch; margin-bottom: 20px;">
                                    <table class="table-premium" style="min-width: 400px; width: 100%;">
                                        <thead>
                                            <tr style="background: ${colors.bgPrimary};">
                                                <th style="font-size: 10px; padding: 8px 4px; color: ${colors.textMuted}; text-align: left;">Description</th>
                                                <th style="text-align: center; font-size: 10px; padding: 8px 4px; color: ${colors.textMuted};">Qty</th>
                                                <th style="text-align: right; font-size: 10px; padding: 8px 4px; color: ${colors.textMuted};">Price</th>
                                                <th style="text-align: right; font-size: 10px; padding: 8px 4px; color: ${colors.textMuted};">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${(invoice.items || []).map((item, index) => `
                                                <tr style="border-bottom-color: ${colors.borderColor};">
                                                    <td style="font-size: 11px; padding: 8px 4px; color: ${colors.modalText};">${escapeHtml(item.description)}</td>
                                                    <td style="text-align: center; font-size: 11px; padding: 8px 4px; color: ${colors.modalText};">${item.quantity || 0}</td>
                                                    <td style="text-align: right; font-size: 11px; padding: 8px 4px; color: ${colors.modalText};">${formatCurrency(item.price || 0, 'GHS')}</td>
                                                    <td style="text-align: right; font-weight: 600; font-size: 11px; padding: 8px 4px; color: ${colors.modalText};">${formatCurrency(item.total || 0, 'GHS')}</td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                        <tfoot>
                                            <tr><td colspan="3" style="text-align: right; padding: 6px 4px; font-size: 11px; color: ${colors.modalText};">Subtotal:</td><td style="text-align: right; padding: 6px 4px; font-size: 11px; color: ${colors.modalText};">${formatCurrency(invoice.subtotal || 0, 'GHS')}</td></tr>
                                            ${invoice.discount > 0 ? `<tr><td colspan="3" style="text-align: right; padding: 4px; font-size: 11px; color: #ef4444;">Discount (${invoice.discount}%):</td><td style="text-align: right; padding: 4px; font-size: 11px; color: #ef4444;">-${formatCurrency(invoice.discount, 'GHS')}</td></tr>` : ''}
                                            ${invoice.taxRate > 0 ? `<tr><td colspan="3" style="text-align: right; padding: 4px; font-size: 11px; color: ${colors.modalText};">Tax (${invoice.taxRate}%):</td><td style="text-align: right; padding: 4px; font-size: 11px; color: ${colors.modalText};">${formatCurrency(invoice.taxAmount || 0, 'GHS')}</td></tr>` : ''}
                                            <tr style="border-top: 3px solid ${colors.borderColor}; background: ${colors.bgPrimary};">
                                                <td colspan="3" style="text-align: right; padding: 10px 4px; font-size: 14px; font-weight: 700; color: ${colors.modalText};">Total Due:</td>
                                                <td style="text-align: right; padding: 10px 4px; font-size: 16px; font-weight: 700; color: ${colors.modalText};">${formatCurrency(invoice.total || 0, 'GHS')}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                                
                                <!-- Payment Summary -->
                                <div style="margin: 15px 0; padding: 12px; background: ${colors.bgPrimary}; border-radius: 8px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
                                    <div>
                                        <p style="font-size: 9px; color: ${colors.textMuted}; margin: 0;">Total Invoice</p>
                                        <p style="font-size: 13px; font-weight: 600; margin: 2px 0; color: ${colors.modalText};">${formatCurrency(invoice.total || 0, 'GHS')}</p>
                                    </div>
                                    <div>
                                        <p style="font-size: 9px; color: ${colors.textMuted}; margin: 0;">Amount Paid</p>
                                        <p style="font-size: 13px; font-weight: 600; color: #10b981; margin: 2px 0;">${formatCurrency(invoice.amountPaid || 0, 'GHS')}</p>
                                    </div>
                                    <div>
                                        <p style="font-size: 9px; color: ${colors.textMuted}; margin: 0;">Balance Due</p>
                                        <p style="font-size: 13px; font-weight: 600; color: ${(invoice.balanceDue || invoice.total || 0) > 0 ? '#ef4444' : '#10b981'}; margin: 2px 0;">${formatCurrency(invoice.balanceDue || invoice.total || 0, 'GHS')}</p>
                                    </div>
                                </div>
                                
                                ${paymentHistory.length > 0 ? `
                                    <div style="margin: 15px 0; padding: 12px; background: ${colors.bgPrimary}; border-radius: 8px; overflow-x: auto;">
                                        <h4 style="font-size: 12px; font-weight: 600; margin: 0 0 8px 0; color: ${colors.modalText};">Payment History</h4>
                                        ${paymentHistory.map(p => `
                                            <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid ${colors.borderColor}; flex-wrap: wrap; gap: 5px;">
                                                <span style="font-size: 10px; color: ${colors.modalText};">${formatDate(p.paymentDate)}</span>
                                                <span style="font-size: 10px; color: ${colors.modalText};">${p.paymentMethod}</span>
                                                <span style="font-size: 10px; font-weight: 600; color: ${p.status === 'pending_approval' ? '#f59e0b' : '#10b981'};">${formatCurrency(p.amount || 0, 'GHS')}</span>
                                                <span style="font-size: 10px; color: ${colors.textMuted};">
                                                    ${p.status === 'pending_approval' ? '⏳ Pending' : 
                                                      p.status === 'approved' || p.status === 'confirmed' ? '✅ Approved' : 
                                                      p.status || ''}
                                                </span>
                                            </div>
                                        `).join('')}
                                    </div>
                                ` : ''}
                                
                                ${invoice.status !== 'paid' && invoice.status !== 'cancelled' ? `
                                    <div style="margin: 15px 0; padding: 12px; background: rgba(16,185,129,0.1); border: 2px dashed #10b981; border-radius: 8px; text-align: center;">
                                        <p style="font-size: 13px; font-weight: 600; color: #10b981; margin: 0 0 6px 0;">
                                            <i class="fas fa-mobile-alt"></i> Pay with Mobile Money
                                        </p>
                                        <p style="font-size: 11px; color: ${colors.textMuted}; margin: 0;">
                                            Send to:
                                        </p>
                                        <p style="font-size: 14px; font-weight: 700; color: #10b981; margin: 4px 0;">
                                            ${escapeHtml(settings?.paymentDetails?.mobileMoney || '0244XXXXXX')}
                                        </p>
                                        <p style="font-size: 10px; color: ${colors.textMuted}; margin: 0;">
                                            Name: ${escapeHtml(settings?.paymentDetails?.mobileMoneyName || 'Business Name')}
                                        </p>
                                        <p style="font-size: 10px; color: ${colors.textMuted}; margin-top: 6px;">
                                            <i class="fas fa-info-circle"></i> Use invoice number <strong style="color: ${colors.modalText};">${invoice.invoiceNumber}</strong> as reference
                                        </p>
                                        <button onclick="ClientPortal.payNow('${invoiceId}')" class="btn-premium btn-premium-success mt-3 text-xs sm:text-sm py-1.5 px-3 sm:py-2 sm:px-4">
                                            <i class="fas fa-mobile-alt"></i> Pay Now
                                        </button>
                                    </div>
                                ` : ''}
                                
                                ${invoice.notes ? `
                                    <div style="margin: 15px 0; padding: 10px; background: ${colors.bgPrimary}; border-left: 4px solid var(--deep-blue); border-radius: 4px;">
                                        <p style="font-size: 10px; color: ${colors.textMuted}; margin: 0;">${escapeHtml(invoice.notes)}</p>
                                    </div>
                                ` : ''}
                                
                                <div style="margin-top: 20px; padding-top: 12px; border-top: 1px solid ${colors.borderColor}; text-align: center;">
                                    <p style="font-size: 10px; color: ${colors.textMuted}; margin: 0;">Thank you for your business!</p>
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
            
            viewButtons.forEach(btn => {
                btn.innerHTML = btn.dataset.originalText || '<i class="fas fa-eye mr-1"></i> View';
                btn.disabled = false;
            });
            
        } catch (error) {
            console.error('❌ Error viewing invoice:', error);
            showToast('Error loading invoice details', 'error');
            viewButtons.forEach(btn => {
                btn.innerHTML = btn.dataset.originalText || '<i class="fas fa-eye mr-1"></i> View';
                btn.disabled = false;
            });
        }
    },
    
    downloadInvoice: async function(invoiceId) {
        const invoice = clientPortalState.invoices.find(i => i.id === invoiceId);
        if (!invoice) {
            showToast('Invoice not found', 'error');
            return;
        }
        
        const settings = window.businessSettings || businessSettings;
        
        const logoHtml = settings?.logo ? 
            `<img src="${settings.logo}" alt="${escapeHtml(settings.name)}" style="max-height: 60px; object-fit: contain; margin-bottom: 10px; display: block;">` : 
            '';
        
        const printContent = `
            <div style="padding: 40px; font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; background: white; color: #1a1a2e;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a1a2e; padding-bottom: 20px; margin-bottom: 30px; flex-wrap: wrap; gap: 20px;">
                    <div>
                        ${logoHtml}
                        <h1 style="font-size: 24px; font-weight: 700; color: #1a1a2e; margin: 0;">${escapeHtml(settings?.name || 'ProfJero WorkSpace')}</h1>
                        ${settings?.address ? `<p style="color: #666; font-size: 12px; margin: 4px 0;">${escapeHtml(settings.address)}</p>` : ''}
                        ${settings?.phone ? `<p style="color: #666; font-size: 12px; margin: 2px 0;">📞 ${escapeHtml(settings.phone)}</p>` : ''}
                        ${settings?.email ? `<p style="color: #666; font-size: 12px; margin: 2px 0;">✉️ ${escapeHtml(settings.email)}</p>` : ''}
                    </div>
                    <div style="text-align: right;">
                        <h2 style="font-size: 28px; font-weight: 700; color: #1a1a2e; margin: 0;">INVOICE</h2>
                        <p style="color: #666; font-size: 13px;"># ${invoice.invoiceNumber}</p>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
                    <div>
                        <p style="color: #666; font-size: 11px; font-weight: 600; text-transform: uppercase;">Bill To:</p>
                        <p style="font-size: 14px; font-weight: 600; margin: 4px 0;">${escapeHtml(invoice.clientName)}</p>
                        ${invoice.clientEmail ? `<p style="color: #666; font-size: 13px;">${escapeHtml(invoice.clientEmail)}</p>` : ''}
                        ${invoice.clientPhone ? `<p style="color: #666; font-size: 13px;">📞 ${escapeHtml(invoice.clientPhone)}</p>` : ''}
                    </div>
                    <div style="text-align: right;">
                        <p style="color: #666; font-size: 12px; margin: 2px 0;"><strong>Date:</strong> ${formatDate(invoice.date)}</p>
                        <p style="color: #666; font-size: 12px; margin: 2px 0;"><strong>Due:</strong> ${formatDate(invoice.dueDate)}</p>
                    </div>
                </div>
                
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                    <thead>
                        <tr style="background: #f8f9fa; border-bottom: 2px solid #1a1a2e;">
                            <th style="text-align: left; padding: 10px 8px; font-size: 12px; font-weight: 600;">Description</th>
                            <th style="text-align: center; padding: 10px 8px; font-size: 12px; font-weight: 600;">Qty</th>
                            <th style="text-align: right; padding: 10px 8px; font-size: 12px; font-weight: 600;">Price</th>
                            <th style="text-align: right; padding: 10px 8px; font-size: 12px; font-weight: 600;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(invoice.items || []).map((item, index) => `
                            <tr style="border-bottom: ${index === invoice.items.length - 1 ? '2px solid #1a1a2e' : '1px solid #e5e7eb'};">
                                <td style="padding: 10px 8px; font-size: 13px;">${escapeHtml(item.description)}</td>
                                <td style="text-align: center; padding: 10px 8px; font-size: 13px;">${item.quantity || 0}</td>
                                <td style="text-align: right; padding: 10px 8px; font-size: 13px;">${formatCurrency(item.price || 0, 'GHS')}</td>
                                <td style="text-align: right; padding: 10px 8px; font-size: 13px; font-weight: 600;">${formatCurrency(item.total || 0, 'GHS')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr><td colspan="3" style="text-align: right; padding: 8px; font-size: 13px;">Subtotal:</td><td style="text-align: right; padding: 8px; font-size: 13px;">${formatCurrency(invoice.subtotal || 0, 'GHS')}</td></tr>
                        ${invoice.discount > 0 ? `<tr><td colspan="3" style="text-align: right; padding: 4px; font-size: 13px; color: #ef4444;">Discount (${invoice.discount}%):</td><td style="text-align: right; padding: 4px; font-size: 13px; color: #ef4444;">-${formatCurrency(invoice.discount, 'GHS')}</td></tr>` : ''}
                        ${invoice.taxRate > 0 ? `<tr><td colspan="3" style="text-align: right; padding: 4px; font-size: 13px;">Tax (${invoice.taxRate}%):</td><td style="text-align: right; padding: 4px; font-size: 13px;">${formatCurrency(invoice.taxAmount || 0, 'GHS')}</td></tr>` : ''}
                        <tr style="border-top: 3px solid #1a1a2e; background: #f8f9fa;">
                            <td colspan="3" style="text-align: right; padding: 12px; font-size: 16px; font-weight: 700;">Total Due:</td>
                            <td style="text-align: right; padding: 12px; font-size: 18px; font-weight: 700;">${formatCurrency(invoice.total || 0, 'GHS')}</td>
                        </tr>
                    </tfoot>
                </table>
                
                <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
                    <div>
                        <p style="font-size: 11px; color: #666; margin: 0;">Total Invoice</p>
                        <p style="font-size: 15px; font-weight: 600; margin: 2px 0;">${formatCurrency(invoice.total || 0, 'GHS')}</p>
                    </div>
                    <div>
                        <p style="font-size: 11px; color: #666; margin: 0;">Amount Paid</p>
                        <p style="font-size: 15px; font-weight: 600; color: #10b981; margin: 2px 0;">${formatCurrency(invoice.amountPaid || 0, 'GHS')}</p>
                    </div>
                    <div>
                        <p style="font-size: 11px; color: #666; margin: 0;">Balance Due</p>
                        <p style="font-size: 15px; font-weight: 600; color: ${(invoice.balanceDue || invoice.total || 0) > 0 ? '#ef4444' : '#10b981'}; margin: 2px 0;">${formatCurrency(invoice.balanceDue || invoice.total || 0, 'GHS')}</p>
                    </div>
                </div>
                
                ${invoice.notes ? `
                    <div style="margin: 15px 0; padding: 12px; background: #f8f9fa; border-left: 4px solid #1a1a2e; border-radius: 4px;">
                        <p style="font-size: 12px; color: #666; margin: 0;">${escapeHtml(invoice.notes)}</p>
                    </div>
                ` : ''}
                
                <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #e5e7eb; text-align: center;">
                    <p style="font-size: 12px; color: #999; margin: 0;">Thank you for your business!</p>
                </div>
            </div>
        `;
        
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        if (printWindow) {
            printWindow.document.write(`
                <html>
                    <head>
                        <title>Invoice ${invoice.invoiceNumber}</title>
                        <style>
                            @page { margin: 20px; }
                            body { margin: 0; padding: 20px; background: white; }
                            @media print {
                                body { padding: 0; }
                            }
                        </style>
                    </head>
                    <body>${printContent}</body>
                </html>
            `);
            printWindow.document.close();
            printWindow.print();
            showToast('Invoice opened for download', 'success');
        } else {
            showToast('Please allow popups to download invoices', 'error');
        }
    },
    
    payNow: async function(invoiceId) {
        const invoice = clientPortalState.invoices.find(i => i.id === invoiceId);
        if (!invoice) {
            showToast('Invoice not found', 'error');
            return;
        }
        
        const balanceDue = invoice.balanceDue || invoice.total || 0;
        const isFullyPaid = invoice.status === 'paid';
        
        if (isFullyPaid) {
            showToast('This invoice is already fully paid', 'info');
            return;
        }
        
        // Get theme colors
        const colors = getThemeColors();
        const settings = window.businessSettings || businessSettings;
        
        const html = `
            <div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4 modal-overlay" onclick="if(event.target === this) ClientPortal.closeModal()">
                <div class="rounded-2xl w-full max-w-md mx-auto animate-fade-in" style="background: ${colors.modalBg}; max-height: 90vh; overflow-y-auto;">
                    <div class="sticky top-0 flex justify-between items-center p-4 border-b z-10" style="background: ${colors.modalBg}; border-color: ${colors.borderColor};">
                        <h3 class="text-lg font-bold" style="color: ${colors.modalText};">Make a Payment</h3>
                        <button onclick="ClientPortal.closeModal()" class="btn-premium btn-premium-secondary text-sm py-1.5 px-3">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="p-5">
                        <div class="text-center mb-4">
                            <div class="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                                <i class="fas fa-mobile-alt text-2xl" style="color: #10b981;"></i>
                            </div>
                            <p class="font-semibold" style="color: ${colors.modalText};">Invoice ${invoice.invoiceNumber}</p>
                            <p class="text-sm" style="color: ${colors.textMuted};">Balance Due: <strong style="color: ${colors.modalText};">${formatCurrency(balanceDue, 'GHS')}</strong></p>
                            ${invoice.amountPaid > 0 ? `
                                <p class="text-xs" style="color: ${colors.textMuted}; margin-top: 1px;">Already Paid: ${formatCurrency(invoice.amountPaid, 'GHS')}</p>
                            ` : ''}
                        </div>
                        
                        <form id="payment-form" class="space-y-4">
                            <div>
                                <label class="block text-sm font-semibold mb-2" style="color: ${colors.modalText};">Amount to Pay</label>
                                <div class="relative">
                                    <span class="absolute left-3 top-1/2 transform -translate-y-1/2" style="color: ${colors.textMuted};">₵</span>
                                    <input type="number" id="payment-amount" step="0.01" min="0.01" max="${balanceDue}" 
                                           value="${balanceDue}" required
                                           class="input-premium pl-8" placeholder="Enter amount" style="background: ${colors.bgPrimary}; color: ${colors.modalText}; border-color: ${colors.borderColor};">
                                </div>
                                <p class="text-xs" style="color: ${colors.textMuted}; margin-top: 1px;">Maximum: ${formatCurrency(balanceDue, 'GHS')}</p>
                            </div>
                            
                            <div class="space-y-3 text-sm">
                                <div class="p-3 rounded-lg" style="background: ${colors.bgPrimary}; border: 1px solid ${colors.borderColor};">
                                    <p style="color: ${colors.textMuted};">Mobile Money Number</p>
                                    <p class="font-semibold mobile-money-number" style="color: ${colors.deepBlue}; font-weight: 700;">${escapeHtml(settings?.paymentDetails?.mobileMoney || '0244XXXXXX')}</p>
                                </div>
                                <div class="p-3 rounded-lg" style="background: ${colors.bgPrimary}; border: 1px solid ${colors.borderColor};">
                                    <p style="color: ${colors.textMuted};">Account Name</p>
                                    <p class="font-semibold" style="color: ${colors.modalText};">${escapeHtml(settings?.paymentDetails?.mobileMoneyName || 'Business Name')}</p>
                                </div>
                                <div class="p-3 rounded-lg" style="background: ${colors.bgPrimary}; border: 1px solid ${colors.borderColor};">
                                    <p style="color: ${colors.textMuted};">Reference</p>
                                    <p class="font-semibold" style="color: ${colors.modalText};">${invoice.invoiceNumber}</p>
                                </div>
                            </div>
                            
                            <div class="mt-4 p-3 rounded-lg" style="background: rgba(16,185,129,0.1); border: 1px solid #10b981;">
                                <p class="text-xs text-center" style="color: #10b981;">
                                    <i class="fas fa-info-circle mr-1"></i>
                                    Enter the amount you're paying. Partial payments are accepted.
                                </p>
                            </div>
                            
                            <div class="flex gap-3 mt-4">
                                <button type="submit" id="submit-payment-btn" class="btn-premium btn-premium-success flex-1 py-2.5">
                                    <i class="fas fa-check mr-1"></i> I've Sent Payment
                                </button>
                                <button type="button" onclick="ClientPortal.closeModal()" class="btn-premium btn-premium-secondary flex-1 py-2.5">
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
        
        const modalContainer = document.getElementById('modal-container');
        if (modalContainer) {
            modalContainer.innerHTML = html;
            modalContainer.style.pointerEvents = 'auto';
            
            // Handle form submission
            document.getElementById('payment-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const amountInput = document.getElementById('payment-amount');
                const amount = parseFloat(amountInput.value);
                
                if (!amount || amount <= 0) {
                    showToast('Please enter a valid amount', 'error');
                    return;
                }
                
                if (amount > balanceDue) {
                    showToast(`Amount cannot exceed balance due of ${formatCurrency(balanceDue, 'GHS')}`, 'error');
                    return;
                }
                
                await ClientPortal.markPaymentSent(invoiceId, amount);
            });
        }
    },
    
    markPaymentSent: async function(invoiceId, amount) {
        const invoice = clientPortalState.invoices.find(i => i.id === invoiceId);
        if (!invoice) {
            showToast('Invoice not found', 'error');
            return;
        }
        
        // If amount not provided, use balance due
        const paymentAmount = amount || invoice.balanceDue || invoice.total || 0;
        
        // Show loading state on the submit button
        const submitBtn = document.getElementById('submit-payment-btn');
        if (submitBtn) {
            setButtonLoading(submitBtn, true);
        }
        
        try {
            // IMPORTANT: Get the business owner's userId from the invoice
            // The invoice has userId which is the business owner's UID
            const businessUserId = invoice.userId;
            
            if (!businessUserId) {
                console.error('❌ No userId found on invoice');
                showToast('Unable to process payment. Please contact support.', 'error');
                return;
            }
            
            // Create a pending payment record with the business owner's userId
            const paymentData = {
                invoiceId: invoiceId,
                invoiceNumber: invoice.invoiceNumber,
                amount: paymentAmount,
                paymentDate: new Date(),
                paymentMethod: 'mobile_money',
                status: 'pending_approval',  // This is the key status
                clientId: clientPortalState.clientId,
                clientPhone: clientPortalState.clientData?.phone || '',
                clientName: clientPortalState.clientData?.name || '',
                reference: invoice.invoiceNumber,
                userId: businessUserId,  // CRITICAL: This must match the business owner's UID
                createdAt: serverTimestamp(),
                requiresApproval: true,
                partialPayment: paymentAmount < (invoice.total || 0)
            };
            
            console.log('📤 Creating payment record:', paymentData);
            
            const docRef = await addDoc(collection(db, 'paymentHistory'), paymentData);
            console.log('✅ Payment record created with ID:', docRef.id);
            
            // Update invoice status to pending_approval
            try {
                const invoiceRef = doc(db, 'invoices', invoiceId);
                await updateDoc(invoiceRef, {
                    status: 'pending_approval',
                    paymentRequested: true,
                    paymentRequestDate: serverTimestamp(),
                    paymentAmount: paymentAmount,
                    updatedAt: serverTimestamp()
                });
                console.log('✅ Invoice status updated to pending_approval');
            } catch (invoiceError) {
                console.log('⚠️ Could not update invoice status:', invoiceError.message);
            }
            
            // Add to timeline
            try {
                await addDoc(collection(db, 'invoiceTimeline'), {
                    invoiceNumber: invoice.invoiceNumber,
                    action: 'payment_initiated',
                    description: `Payment of ${formatCurrency(paymentAmount, 'GHS')} initiated by client. ${paymentAmount < (invoice.total || 0) ? 'Partial payment.' : 'Full payment.'} Awaiting approval.`,
                    clientId: clientPortalState.clientId,
                    userId: businessUserId,  // Add userId to timeline too
                    timestamp: serverTimestamp()
                });
                console.log('✅ Timeline entry created');
            } catch (timelineError) {
                console.log('⚠️ Timeline update skipped:', timelineError.message);
            }
            
            showToast(`Payment request for ${formatCurrency(paymentAmount, 'GHS')} sent! Awaiting admin confirmation.`, 'success', 'Payment Pending Approval');
            
            // Set up real-time listener for confirmation
            setupPaymentConfirmationListener(invoiceId);
            
            // Reset button
            if (submitBtn) {
                setButtonLoading(submitBtn, false, '<i class="fas fa-check mr-1"></i> I\'ve Sent Payment');
            }
            
            // Close the payment modal
            try {
                ClientPortal.closeModal();
            } catch (closeError) {
                console.log('⚠️ Could not close modal:', closeError.message);
                const modalContainer = document.getElementById('modal-container');
                if (modalContainer) {
                    modalContainer.innerHTML = '';
                    modalContainer.style.pointerEvents = 'none';
                }
            }
            
            // Refresh the portal to show updated status
            await refreshClientPortal();
            
            // Also refresh the finance data if the page is open
            // This will update the pending approvals badge
            if (window.loadFinanceData) {
                await window.loadFinanceData();
            }
            
        } catch (error) {
            console.error('❌ Error recording payment:', error);
            
            if (error.code === 'permission-denied') {
                showToast('Permission denied. Please contact support.', 'error');
            } else {
                showToast('Failed to record payment. Please try again.', 'error');
            }
            
            if (submitBtn) {
                setButtonLoading(submitBtn, false, '<i class="fas fa-check mr-1"></i> I\'ve Sent Payment');
            }
        }
    },
    
    closeModal: function() {
        console.log('🔒 Closing modal');
        const modalContainer = document.getElementById('modal-container');
        if (modalContainer) {
            modalContainer.innerHTML = '';
            modalContainer.style.pointerEvents = 'none';
        }
    }
};

// ============================================
// EXPOSE TO GLOBAL SCOPE
// ============================================
window.ClientPortal = ClientPortal;
window.ClientPortal.closeModal = ClientPortal.closeModal;

// ============================================
// INITIALIZATION
// ============================================
export async function initClientPortal(businessSettingsFromMain) {
    const container = document.getElementById('client-portal-container');
    if (!container) return;
    
    // Use business settings passed from main HTML
    if (businessSettingsFromMain) {
        businessSettings = businessSettingsFromMain;
        window.businessSettings = businessSettings;
        console.log('📋 Business settings received in client-portal.js:', businessSettings);
    } else {
        // Fallback: try to get from window
        if (window.businessSettings) {
            businessSettings = window.businessSettings;
        } else {
            // Use default settings as last resort
            businessSettings = {
                name: 'ProfJero WorkSpace',
                address: 'UCC, Cape Coast, Ghana',
                phone: '+233 20 478 5158',
                email: 'profjero947@gmail.com',
                logo: null,
                paymentDetails: {
                    mobileMoney: '+233 53 120 7256',
                    mobileMoneyName: 'Benjamin Kweku Amoako',
                    paymentInstructions: 'Please include invoice number as reference'
                }
            };
            window.businessSettings = businessSettings;
        }
    }
    
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    if (token) {
        await authenticateWithToken(token);
        if (clientPortalState.authenticated) {
            container.innerHTML = renderAuthenticatedContent();
            return;
        }
    }
    
    container.innerHTML = renderLoginContent();
    setupLoginHandlers();
}