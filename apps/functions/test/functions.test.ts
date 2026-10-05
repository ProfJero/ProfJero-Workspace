import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { reconcileAccounts as reconcileLocal, type Account } from '@profjero/shared';
import { account, addMember, admin, balance, cleanupApps, createUser, failure, newTenant, rid, txInput, type TestUser } from './helpers';

let owner: TestUser;
let tenantId: string;

beforeAll(async () => {
  owner = await createUser('owner');
  tenantId = await newTenant(owner);
});
afterAll(cleanupApps);

describe('tenants', () => {
  it('creating a workspace makes the caller its owner', async () => {
    const m = await admin.db.doc(`tenants/${tenantId}/members/${owner.uid}`).get();
    expect(m.data()).toMatchObject({ role: 'owner', status: 'active', uid: owner.uid });
  });
  it('replaying createTenant with the same requestId does not create a second workspace', async () => {
    const requestId = rid();
    const input = { name: 'Once', kind: 'personal', currency: 'GHS', timezone: 'Africa/Accra', requestId };
    const [a, b] = await Promise.all([owner.call('createTenant', input), owner.call('createTenant', input)]);
    expect(a).toEqual(b);
  });
  it('rejects unauthenticated and malformed calls', async () => {
    expect(await failure(owner.call('createTenant', { name: '', kind: 'x' }))).toBe('invalid_input');
  });
});

describe('cross-tenant attacks', () => {
  it('an owner of tenant B cannot act on tenant A by sending its id', async () => {
    const mallory = await createUser('mallory');
    await newTenant(mallory, 'Mallory Inc');
    expect(await failure(mallory.call('createAccount', { tenantId, requestId: rid(), account: { name: 'x', type: 'cash', currency: 'GHS', openingBalanceMinor: 0 } }))).toBe('not_member');
    expect(await failure(mallory.call('reconcileAccounts', { tenantId, requestId: rid(), fix: false }))).toBe('not_member');
    expect(await failure(mallory.call('inviteMember', { tenantId, requestId: rid(), email: 'friend@example.com', role: 'admin' }))).toBe('not_member');
  });
  it('a referenced account from another tenant is not found', async () => {
    const other = await createUser('other');
    const otherTenant = await newTenant(other);
    const foreign = await account(other, otherTenant, 'Foreign', 0);
    const local = await account(owner, tenantId, 'Local', 0);
    const reason = await failure(owner.call('createTransaction', {
      tenantId, requestId: rid(), transaction: txInput({ type: 'transfer', amountMinor: 100, accountId: local, toAccountId: foreign }),
    }));
    expect(reason).toBe('invalid_input');
    expect(await balance(otherTenant, foreign)).toBe(0);
  });
});

describe('roles', () => {
  it('viewers and members cannot touch finance; managers cannot manage accounts', async () => {
    const viewer = await createUser('viewer');
    const member = await createUser('member');
    const manager = await createUser('manager');
    await addMember(tenantId, viewer, 'viewer');
    await addMember(tenantId, member, 'member');
    await addMember(tenantId, manager, 'manager');
    const acct = await account(owner, tenantId, 'Ops', 10000);
    const tx = { tenantId, transaction: txInput({ type: 'expense', amountMinor: 100, accountId: acct, categoryId: 'utilities' }) };
    expect(await failure(viewer.call('createTransaction', { ...tx, requestId: rid() }))).toBe('forbidden');
    expect(await failure(member.call('createTransaction', { ...tx, requestId: rid() }))).toBe('forbidden');
    await manager.call('createTransaction', { ...tx, requestId: rid() });
    expect(await failure(manager.call('createAccount', { tenantId, requestId: rid(), account: { name: 'x', type: 'cash', currency: 'GHS', openingBalanceMinor: 0 } }))).toBe('forbidden');
    expect(await failure(viewer.call('inviteMember', { tenantId, requestId: rid(), email: 'a@example.com', role: 'viewer' }))).toBe('forbidden');
    expect(await failure(viewer.call('updateTenant', { tenantId, requestId: rid(), settings: { name: 'hijacked' } }))).toBe('forbidden');
  });

  it('a removed member loses access immediately', async () => {
    const temp = await createUser('temp');
    await addMember(tenantId, temp, 'manager');
    const acct = await account(owner, tenantId, 'Temp', 0);
    await owner.call('removeMember', { tenantId, requestId: rid(), uid: temp.uid });
    expect(await failure(temp.call('createTransaction', {
      tenantId, requestId: rid(), transaction: txInput({ type: 'income', amountMinor: 1, accountId: acct, categoryId: 'salary' }),
    }))).toBe('not_member');
  });

  it('admins cannot escalate privileges', async () => {
    const adminUser = await createUser('admin');
    const victim = await createUser('victim');
    await addMember(tenantId, adminUser, 'admin');
    await addMember(tenantId, victim, 'member');
    expect(await failure(adminUser.call('changeMemberRole', { tenantId, requestId: rid(), uid: victim.uid, role: 'admin' }))).toBe('forbidden');
    expect(await failure(adminUser.call('changeMemberRole', { tenantId, requestId: rid(), uid: adminUser.uid, role: 'owner' }))).toBe('forbidden');
    expect(await failure(adminUser.call('changeMemberRole', { tenantId, requestId: rid(), uid: owner.uid, role: 'viewer' }))).toBe('forbidden');
    expect(await failure(adminUser.call('removeMember', { tenantId, requestId: rid(), uid: owner.uid }))).toBe('forbidden');
    await adminUser.call('changeMemberRole', { tenantId, requestId: rid(), uid: victim.uid, role: 'manager' });
    const log = await admin.db.collection(`tenants/${tenantId}/auditLogs`).where('action', '==', 'member.role_change').get();
    expect(log.docs.some((d) => d.data().resource.id === victim.uid && d.data().metadata.to === 'manager')).toBe(true);
  });
});

describe('invitations', () => {
  it('only the verified invitee can accept', async () => {
    const invitee = await createUser('invitee');
    const thief = await createUser('thief');
    const { invitationId } = await owner.call<{ invitationId: string }>('inviteMember', { tenantId, requestId: rid(), email: invitee.email, role: 'member' });
    expect(await failure(invitee.call('acceptInvitation', { tenantId, invitationId }))).toBe('email_unverified');
    await admin.auth.updateUser(thief.uid, { emailVerified: true });
    await thief.refreshToken();
    expect(await failure(thief.call('acceptInvitation', { tenantId, invitationId }))).toBe('forbidden');
    await admin.auth.updateUser(invitee.uid, { emailVerified: true });
    await invitee.refreshToken();
    await invitee.call('acceptInvitation', { tenantId, invitationId });
    const m = await admin.db.doc(`tenants/${tenantId}/members/${invitee.uid}`).get();
    expect(m.data()).toMatchObject({ role: 'member', status: 'active' });
    expect(await failure(invitee.call('acceptInvitation', { tenantId, invitationId }))).toBe('conflict');
  });
});

describe('ledger integrity', () => {
  it('a GH₵500 transfer MoMo → Bank leaves net position unchanged', async () => {
    const momo = await account(owner, tenantId, 'MoMo', 100000, 'mobile_money');
    const bank = await account(owner, tenantId, 'Bank', 20000);
    await owner.call('createTransaction', { tenantId, requestId: rid(), transaction: txInput({ type: 'transfer', amountMinor: 50000, accountId: momo, toAccountId: bank }) });
    expect(await balance(tenantId, momo)).toBe(50000);
    expect(await balance(tenantId, bank)).toBe(70000);
  });

  it('duplicate submissions create exactly one transaction', async () => {
    const acct = await account(owner, tenantId, 'Dup', 0);
    const requestId = rid();
    const input = { tenantId, requestId, transaction: txInput({ type: 'income', amountMinor: 12345, accountId: acct, categoryId: 'salary' }) };
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => owner.call<{ transactionId: string }>('createTransaction', input)));
    const ids = new Set(results.filter((r) => r.status === 'fulfilled').map((r) => (r as PromiseFulfilledResult<{ transactionId: string }>).value.transactionId));
    expect(ids.size).toBe(1);
    const n = await admin.db.collection(`tenants/${tenantId}/transactions`).where('accountId', '==', acct).get();
    expect(n.size).toBe(1);
    expect(await balance(tenantId, acct)).toBe(12345);
  });

  it('concurrent different transactions on one account never lose an update', async () => {
    const acct = await account(owner, tenantId, 'Busy', 0);
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        owner.call('createTransaction', { tenantId, requestId: rid(), transaction: txInput({ type: 'income', amountMinor: 100 + i, accountId: acct, categoryId: 'salary' }) }),
      ),
    );
    expect(await balance(tenantId, acct)).toBe(8 * 100 + 28);
  });

  it('edits adjust balances exactly and stale edits are rejected', async () => {
    const a = await account(owner, tenantId, 'EditA', 10000);
    const b = await account(owner, tenantId, 'EditB', 10000);
    const { transactionId } = await owner.call<{ transactionId: string }>('createTransaction', {
      tenantId, requestId: rid(), transaction: txInput({ type: 'expense', amountMinor: 1000, accountId: a, categoryId: 'groceries' }),
    });
    await owner.call('updateTransaction', { tenantId, requestId: rid(), transactionId, expectedVersion: 1, transaction: txInput({ type: 'expense', amountMinor: 2500, accountId: b, categoryId: 'groceries' }) });
    expect(await balance(tenantId, a)).toBe(10000);
    expect(await balance(tenantId, b)).toBe(7500);
    // A second tab still holding version 1 must not overwrite version 2.
    expect(await failure(owner.call('updateTransaction', { tenantId, requestId: rid(), transactionId, expectedVersion: 1, transaction: txInput({ type: 'expense', amountMinor: 1, accountId: a, categoryId: 'groceries' }) }))).toBe('conflict');
    await owner.call('voidTransaction', { tenantId, requestId: rid(), transactionId, reason: 'Entered twice' });
    expect(await balance(tenantId, b)).toBe(10000);
    const voided = (await admin.db.doc(`tenants/${tenantId}/transactions/${transactionId}`).get()).data()!;
    expect(voided).toMatchObject({ status: 'void', voidReason: 'Entered twice', voidedBy: owner.uid });
    expect(await failure(owner.call('voidTransaction', { tenantId, requestId: rid(), transactionId, reason: 'again' }))).toBe('conflict');
  });

  it('rejects forged and malformed amounts', async () => {
    const acct = await account(owner, tenantId, 'Forge', 0);
    for (const amountMinor of [-500, 0, 10.5, '1000', 1e20]) {
      expect(await failure(owner.call('createTransaction', { tenantId, requestId: rid(), transaction: txInput({ type: 'income', amountMinor, accountId: acct, categoryId: 'salary' }) }))).toBe('invalid_input');
    }
    // Wrong category kind and unknown category.
    expect(await failure(owner.call('createTransaction', { tenantId, requestId: rid(), transaction: txInput({ type: 'income', amountMinor: 1, accountId: acct, categoryId: 'groceries' }) }))).toBe('invalid_input');
    expect(await failure(owner.call('createTransaction', { tenantId, requestId: rid(), transaction: txInput({ type: 'income', amountMinor: 1, accountId: acct, categoryId: 'made_up' }) }))).toBe('invalid_input');
    // Client-sent balance fields are ignored, not trusted.
    await owner.call('createTransaction', { tenantId, requestId: rid(), transaction: { ...txInput({ type: 'income', amountMinor: 1, accountId: acct, categoryId: 'salary' }), balanceMinor: 999999, status: 'void' } });
    expect(await balance(tenantId, acct)).toBe(1);
  });

  it('refunds cannot exceed the original expense', async () => {
    const acct = await account(owner, tenantId, 'Refund', 10000);
    const { transactionId } = await owner.call<{ transactionId: string }>('createTransaction', {
      tenantId, requestId: rid(), transaction: txInput({ type: 'expense', amountMinor: 3000, accountId: acct, categoryId: 'shopping' }),
    });
    const refund = (amountMinor: number) => owner.call('createTransaction', { tenantId, requestId: rid(), transaction: txInput({ type: 'refund', amountMinor, accountId: acct, categoryId: 'shopping', refundOfId: transactionId }) });
    await refund(2000);
    expect(await failure(refund(1001))).toBe('invalid_input');
    await refund(1000);
    expect(await balance(tenantId, acct)).toBe(10000);
    expect(await failure(owner.call('voidTransaction', { tenantId, requestId: rid(), transactionId, reason: 'x' }))).toBe('conflict');
  });
});

describe('money lent and borrowed', () => {
  it('GH₵1,000 lent, repaid 300 + 200 leaves 500 outstanding; overpayment is rejected', async () => {
    const momo = await account(owner, tenantId, 'LoanMoMo', 200000, 'mobile_money');
    const { debtId } = await owner.call<{ debtId: string }>('createDebt', {
      tenantId, requestId: rid(), debt: { direction: 'lent', counterparty: 'Kofi', principalMinor: 100000, currency: 'GHS', date: '2026-09-01', dueDate: '2026-12-01', notes: '', accountId: momo },
    });
    expect(await balance(tenantId, momo)).toBe(100000);
    const repay = (amountMinor: number) => owner.call<{ remainingMinor: number }>('recordRepayment', { tenantId, requestId: rid(), debtId, amountMinor, date: '2026-09-15', accountId: momo, note: '' });
    expect((await repay(30000)).remainingMinor).toBe(70000);
    expect((await repay(20000)).remainingMinor).toBe(50000);
    expect(await failure(repay(50001))).toBe('invalid_input');
    const debt = (await admin.db.doc(`tenants/${tenantId}/debts/${debtId}`).get()).data()!;
    expect(debt).toMatchObject({ paidMinor: 50000, status: 'open' });
    expect(await balance(tenantId, momo)).toBe(150000);
  });

  it('concurrent repayments cannot over-repay a debt', async () => {
    const cash = await account(owner, tenantId, 'LoanCash', 0, 'cash');
    const { debtId } = await owner.call<{ debtId: string }>('createDebt', {
      tenantId, requestId: rid(), debt: { direction: 'borrowed', counterparty: 'Ama', principalMinor: 50000, currency: 'GHS', date: '2026-09-01', dueDate: null, notes: '', accountId: cash },
    });
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => owner.call('recordRepayment', { tenantId, requestId: rid(), debtId, amountMinor: 20000, date: '2026-09-10', accountId: cash, note: '' })),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    expect(ok).toBe(2);
    const debt = (await admin.db.doc(`tenants/${tenantId}/debts/${debtId}`).get()).data()!;
    expect(debt.paidMinor).toBe(40000);
    expect(await balance(tenantId, cash)).toBe(50000 - 40000);
  });

  it('voiding a repayment and voiding the debt keep everything consistent', async () => {
    const acct = await account(owner, tenantId, 'VoidLoan', 100000);
    const { debtId } = await owner.call<{ debtId: string }>('createDebt', {
      tenantId, requestId: rid(), debt: { direction: 'lent', counterparty: 'Yaw', principalMinor: 40000, currency: 'GHS', date: '2026-09-01', dueDate: null, notes: '', accountId: acct },
    });
    const { transactionId } = await owner.call<{ transactionId: string }>('recordRepayment', { tenantId, requestId: rid(), debtId, amountMinor: 10000, date: '2026-09-02', accountId: acct, note: '' });
    await owner.call('voidTransaction', { tenantId, requestId: rid(), transactionId, reason: 'Wrong debt' });
    expect((await admin.db.doc(`tenants/${tenantId}/debts/${debtId}`).get()).data()!.paidMinor).toBe(0);
    expect(await balance(tenantId, acct)).toBe(60000);
    await owner.call('voidDebt', { tenantId, requestId: rid(), debtId, reason: 'Never happened' });
    expect(await balance(tenantId, acct)).toBe(100000);
  });
});

describe('savings', () => {
  it('deposits with a source account record a real transfer; withdrawals are bounded', async () => {
    const main = await account(owner, tenantId, 'Main', 100000);
    const vault = await account(owner, tenantId, 'Vault', 0, 'savings');
    const { goalId } = await owner.call<{ goalId: string }>('saveSavingsGoal', {
      tenantId, requestId: rid(), goalId: null, goal: { name: 'Emergency', targetMinor: 50000, currency: 'GHS', targetDate: null, accountId: vault },
    });
    await owner.call('recordSavingsMovement', { tenantId, requestId: rid(), goalId, kind: 'deposit', amountMinor: 60000, date: '2026-10-01', note: '', fromAccountId: main });
    expect(await balance(tenantId, main)).toBe(40000);
    expect(await balance(tenantId, vault)).toBe(60000);
    const goal = (await admin.db.doc(`tenants/${tenantId}/savingsGoals/${goalId}`).get()).data()!;
    expect(goal).toMatchObject({ savedMinor: 60000, status: 'achieved' });
    expect(await failure(owner.call('recordSavingsMovement', { tenantId, requestId: rid(), goalId, kind: 'withdrawal', amountMinor: 60001, date: '2026-10-02', note: '', fromAccountId: null }))).toBe('invalid_input');
  });
});

describe('invoices and the client portal', () => {
  it('end-to-end: invoice → portal → payment notice → approval → income', async () => {
    const bank = await account(owner, tenantId, 'InvoiceBank', 0);
    const clientRef = admin.db.collection(`tenants/${tenantId}/clients`).doc();
    await clientRef.set({ name: 'Acme Ltd', company: 'Acme', email: 'pay@acme.test', phone: '', address: '', status: 'active', notes: 'internal note', tags: [] });
    const otherClient = admin.db.collection(`tenants/${tenantId}/clients`).doc();
    await otherClient.set({ name: 'Other', company: '', email: '', phone: '', address: '', status: 'active', notes: '', tags: [] });

    const mk = (clientId: string) => owner.call<{ invoiceId: string; number: string }>('saveInvoice', {
      tenantId, requestId: rid(), invoiceId: null,
      invoice: { clientId, issueDate: '2026-10-01', dueDate: '2026-10-31', currency: 'GHS', lines: [{ description: 'Design', quantityMilli: 1500, unitPriceMinor: 20000 }], discountMinor: 0, taxRateBps: 1500, notes: '', projectId: null },
    });
    const { invoiceId, number } = await mk(clientRef.id);
    const other = await mk(otherClient.id);
    expect(number).toMatch(/^INV-\d{5}$/);
    const inv = (await admin.db.doc(`tenants/${tenantId}/invoices/${invoiceId}`).get()).data()!;
    expect(inv.totalMinor).toBe(34500); // 30000 + 15% tax
    await owner.call('sendInvoice', { tenantId, requestId: rid(), invoiceId });
    await owner.call('sendInvoice', { tenantId, requestId: rid(), invoiceId: other.invoiceId });

    const { token } = await owner.call<{ token: string }>('createPortalLink', { tenantId, requestId: rid(), clientId: clientRef.id, expiresInDays: 30 });
    const anonymous = await createUser('portal-visitor'); // any caller; the token is the credential
    const portal = await anonymous.call<{ invoices: { id: string }[]; client: Record<string, unknown> }>('portalGetInvoices', { token });
    expect(portal.invoices.map((i) => i.id)).toEqual([invoiceId]); // never the other client's invoice
    expect(JSON.stringify(portal)).not.toContain('internal note');
    expect(await failure(anonymous.call('portalGetInvoices', { token: 'A'.repeat(43) }))).toBe('link_invalid');
    expect(await failure(anonymous.call('portalSubmitPaymentNotice', { token, invoiceId: other.invoiceId, amountMinor: 100, method: 'mobile_money', reference: 'x', paidOn: '2026-10-02', requestId: rid() }))).toBe('link_invalid');
    expect(await failure(anonymous.call('portalSubmitPaymentNotice', { token, invoiceId, amountMinor: 34501, method: 'mobile_money', reference: 'x', paidOn: '2026-10-02', requestId: rid() }))).toBe('invalid_input');

    const { noticeId } = await anonymous.call<{ noticeId: string }>('portalSubmitPaymentNotice', { token, invoiceId, amountMinor: 20000, method: 'mobile_money', reference: 'MP123', paidOn: '2026-10-02', requestId: rid() });
    // Nothing is recorded until approved.
    expect((await admin.db.doc(`tenants/${tenantId}/invoices/${invoiceId}`).get()).data()!.paidMinor).toBe(0);
    await owner.call('reviewPaymentNotice', { tenantId, requestId: rid(), noticeId, decision: 'approve', accountId: bank, reason: '' });
    const after = (await admin.db.doc(`tenants/${tenantId}/invoices/${invoiceId}`).get()).data()!;
    expect(after).toMatchObject({ paidMinor: 20000, status: 'partially_paid' });
    expect(await balance(tenantId, bank)).toBe(20000);
    expect(await failure(owner.call('reviewPaymentNotice', { tenantId, requestId: rid(), noticeId, decision: 'approve', accountId: bank, reason: '' }))).toBe('conflict');

    await owner.call('revokePortalLinks', { tenantId, requestId: rid(), clientId: clientRef.id });
    expect(await failure(anonymous.call('portalGetInvoices', { token }))).toBe('link_invalid');
  });
});

describe('reconciliation', () => {
  it('stored balances match the ledger after all operations, and drift is detected and fixed', async () => {
    const report = await owner.call<{ accounts: { accountId: string; driftMinor: number }[] }>('reconcileAccounts', { tenantId, requestId: rid(), fix: false });
    expect(report.accounts.length).toBeGreaterThan(5);
    expect(report.accounts.filter((a) => a.driftMinor !== 0)).toEqual([]);

    // Independent check with the shared engine on raw data.
    const accounts = (await admin.db.collection(`tenants/${tenantId}/accounts`).get()).docs.map((d) => ({ id: d.id, ...d.data() }) as Account);
    const txs = (await admin.db.collection(`tenants/${tenantId}/transactions`).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
    expect(reconcileLocal(accounts, txs as never).every((r) => r.driftMinor === 0)).toBe(true);

    const victim = accounts[0]!;
    await admin.db.doc(`tenants/${tenantId}/accounts/${victim.id}`).update({ balanceMinor: victim.balanceMinor + 777 });
    const broken = await owner.call<{ accounts: { accountId: string; driftMinor: number }[] }>('reconcileAccounts', { tenantId, requestId: rid(), fix: true });
    expect(broken.accounts.find((a) => a.accountId === victim.id)!.driftMinor).toBe(777);
    expect(await balance(tenantId, victim.id)).toBe(victim.balanceMinor);
  });
});
