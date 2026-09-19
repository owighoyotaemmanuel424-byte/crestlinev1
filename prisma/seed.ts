import { PrismaClient, Role, UserStatus, AccountType, AccountStatus, KYCStatus, KYCTier, CardType, CardBrand, CardStatus, TransactionType, TransactionStatus, TransferStatus, RiskStatus, DepositStatus, DepositMethod, WithdrawalStatus, WithdrawalMethod, BeneficiaryStatus, FeeType, LoanApplicationStatus, DisbursementStatus, RepaymentStatus, PortfolioStatus, InvestmentType, InvestmentStatus, InvestmentTransactionType, SavingsGoalStatus, ContributionStatus, SupportCategory, SupportPriority, SupportTicketStatus, NotificationType, NotificationCategory, AuditAction, ResourceType, AuditStatus, FraudAlertType, FraudAlertStatus, SettingCategory } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Crestline Capital database...');

  // ============================================
  // PERMISSIONS
  // ============================================
  const permissions = [
    { name: 'user:read', description: 'Read user profiles', category: 'USER' },
    { name: 'user:create', description: 'Create users', category: 'USER' },
    { name: 'user:update', description: 'Update user profiles', category: 'USER' },
    { name: 'user:delete', description: 'Delete users', category: 'USER' },
    { name: 'user:suspend', description: 'Suspend users', category: 'USER' },
    { name: 'user:activate', description: 'Activate users', category: 'USER' },
    { name: 'account:read', description: 'Read accounts', category: 'ACCOUNT' },
    { name: 'account:create', description: 'Create accounts', category: 'ACCOUNT' },
    { name: 'account:freeze', description: 'Freeze accounts', category: 'ACCOUNT' },
    { name: 'account:unfreeze', description: 'Unfreeze accounts', category: 'ACCOUNT' },
    { name: 'account:close', description: 'Close accounts', category: 'ACCOUNT' },
    { name: 'transaction:read', description: 'Read transactions', category: 'TRANSACTION' },
    { name: 'transaction:create', description: 'Create transactions', category: 'TRANSACTION' },
    { name: 'transaction:reverse', description: 'Reverse transactions', category: 'TRANSACTION' },
    { name: 'transfer:read', description: 'Read transfers', category: 'TRANSFER' },
    { name: 'transfer:create', description: 'Create transfers', category: 'TRANSFER' },
    { name: 'transfer:approve', description: 'Approve transfers', category: 'TRANSFER' },
    { name: 'transfer:reject', description: 'Reject transfers', category: 'TRANSFER' },
    { name: 'transfer:reverse', description: 'Reverse transfers', category: 'TRANSFER' },
    { name: 'deposit:read', description: 'Read deposits', category: 'DEPOSIT' },
    { name: 'deposit:create', description: 'Create deposits', category: 'DEPOSIT' },
    { name: 'deposit:approve', description: 'Approve deposits', category: 'DEPOSIT' },
    { name: 'deposit:reject', description: 'Reject deposits', category: 'DEPOSIT' },
    { name: 'withdrawal:read', description: 'Read withdrawals', category: 'WITHDRAWAL' },
    { name: 'withdrawal:create', description: 'Create withdrawals', category: 'WITHDRAWAL' },
    { name: 'withdrawal:approve', description: 'Approve withdrawals', category: 'WITHDRAWAL' },
    { name: 'withdrawal:reject', description: 'Reject withdrawals', category: 'WITHDRAWAL' },
    { name: 'withdrawal:hold', description: 'Place withdrawals on hold', category: 'WITHDRAWAL' },
    { name: 'kyc:read', description: 'Read KYC profiles', category: 'KYC' },
    { name: 'kyc:approve', description: 'Approve KYC', category: 'KYC' },
    { name: 'kyc:reject', description: 'Reject KYC', category: 'KYC' },
    { name: 'kyc:request_info', description: 'Request additional information', category: 'KYC' },
    { name: 'card:read', description: 'Read cards', category: 'CARD' },
    { name: 'card:create', description: 'Create cards', category: 'CARD' },
    { name: 'card:freeze', description: 'Freeze cards', category: 'CARD' },
    { name: 'card:unfreeze', description: 'Unfreeze cards', category: 'CARD' },
    { name: 'card:cancel', description: 'Cancel cards', category: 'CARD' },
    { name: 'loan:read', description: 'Read loans', category: 'LOAN' },
    { name: 'loan:create', description: 'Create loan applications', category: 'LOAN' },
    { name: 'loan:approve', description: 'Approve loans', category: 'LOAN' },
    { name: 'loan:reject', description: 'Reject loans', category: 'LOAN' },
    { name: 'loan:disburse', description: 'Disburse loans', category: 'LOAN' },
    { name: 'fraud:read', description: 'Read fraud alerts', category: 'FRAUD' },
    { name: 'fraud:create', description: 'Create fraud alerts', category: 'FRAUD' },
    { name: 'fraud:review', description: 'Review fraud alerts', category: 'FRAUD' },
    { name: 'fraud:resolve', description: 'Resolve fraud alerts', category: 'FRAUD' },
    { name: 'fraud:escalate', description: 'Escalate fraud alerts', category: 'FRAUD' },
    { name: 'aml:read', description: 'Read AML alerts', category: 'AML' },
    { name: 'aml:review', description: 'Review AML alerts', category: 'AML' },
    { name: 'audit:read', description: 'Read audit logs', category: 'AUDIT' },
    { name: 'audit:export', description: 'Export audit logs', category: 'AUDIT' },
    { name: 'settings:read', description: 'Read settings', category: 'SETTINGS' },
    { name: 'settings:update', description: 'Update settings', category: 'SETTINGS' },
    { name: 'role:read', description: 'Read roles', category: 'ROLE' },
    { name: 'role:assign', description: 'Assign roles', category: 'ROLE' },
    { name: 'role:remove', description: 'Remove roles', category: 'ROLE' },
    { name: 'support:read', description: 'Read support tickets', category: 'SUPPORT' },
    { name: 'support:create', description: 'Create support tickets', category: 'SUPPORT' },
    { name: 'support:assign', description: 'Assign support tickets', category: 'SUPPORT' },
    { name: 'support:resolve', description: 'Resolve support tickets', category: 'SUPPORT' },
    { name: 'support:close', description: 'Close support tickets', category: 'SUPPORT' },
  ];

  const createdPermissions = await Promise.all(
    permissions.map(p => prisma.permission.upsert({
      where: { name: p.name },
      update: p,
      create: p,
    }))
  );
  console.log(`✅ Created ${createdPermissions.length} permissions`);

  const rolePermissions = [
    { role: Role.CUSTOMER, permissionName: 'user:read' },
    { role: Role.CUSTOMER, permissionName: 'account:read' },
    { role: Role.CUSTOMER, permissionName: 'transaction:read' },
    { role: Role.CUSTOMER, permissionName: 'transfer:read' },
    { role: Role.CUSTOMER, permissionName: 'transfer:create' },
    { role: Role.CUSTOMER, permissionName: 'deposit:read' },
    { role: Role.CUSTOMER, permissionName: 'deposit:create' },
    { role: Role.CUSTOMER, permissionName: 'withdrawal:read' },
    { role: Role.CUSTOMER, permissionName: 'withdrawal:create' },
    { role: Role.CUSTOMER, permissionName: 'card:read' },
    { role: Role.CUSTOMER, permissionName: 'kyc:read' },
    { role: Role.CUSTOMER, permissionName: 'loan:read' },
    { role: Role.CUSTOMER, permissionName: 'loan:create' },
    { role: Role.CUSTOMER, permissionName: 'support:read' },
    { role: Role.CUSTOMER, permissionName: 'support:create' },
    { role: Role.SUPPORT, permissionName: 'user:read' },
    { role: Role.SUPPORT, permissionName: 'account:read' },
    { role: Role.SUPPORT, permissionName: 'transaction:read' },
    { role: Role.SUPPORT, permissionName: 'transfer:read' },
    { role: Role.SUPPORT, permissionName: 'deposit:read' },
    { role: Role.SUPPORT, permissionName: 'withdrawal:read' },
    { role: Role.SUPPORT, permissionName: 'card:read' },
    { role: Role.SUPPORT, permissionName: 'kyc:read' },
    { role: Role.SUPPORT, permissionName: 'support:read' },
    { role: Role.SUPPORT, permissionName: 'support:create' },
    { role: Role.SUPPORT, permissionName: 'support:assign' },
    { role: Role.SUPPORT, permissionName: 'support:resolve' },
    { role: Role.SUPPORT, permissionName: 'support:close' },
    { role: Role.SUPPORT, permissionName: 'audit:read' },
    { role: Role.OPERATOR, permissionName: 'user:read' },
    { role: Role.OPERATOR, permissionName: 'user:suspend' },
    { role: Role.OPERATOR, permissionName: 'user:activate' },
    { role: Role.OPERATOR, permissionName: 'account:read' },
    { role: Role.OPERATOR, permissionName: 'account:freeze' },
    { role: Role.OPERATOR, permissionName: 'account:unfreeze' },
    { role: Role.OPERATOR, permissionName: 'transaction:read' },
    { role: Role.OPERATOR, permissionName: 'transaction:reverse' },
    { role: Role.OPERATOR, permissionName: 'transfer:read' },
    { role: Role.OPERATOR, permissionName: 'transfer:approve' },
    { role: Role.OPERATOR, permissionName: 'transfer:reject' },
    { role: Role.OPERATOR, permissionName: 'deposit:read' },
    { role: Role.OPERATOR, permissionName: 'deposit:approve' },
    { role: Role.OPERATOR, permissionName: 'withdrawal:read' },
    { role: Role.OPERATOR, permissionName: 'withdrawal:approve' },
    { role: Role.OPERATOR, permissionName: 'withdrawal:reject' },
    { role: Role.OPERATOR, permissionName: 'withdrawal:hold' },
    { role: Role.OPERATOR, permissionName: 'card:read' },
    { role: Role.OPERATOR, permissionName: 'card:freeze' },
    { role: Role.OPERATOR, permissionName: 'card:unfreeze' },
    { role: Role.OPERATOR, permissionName: 'card:cancel' },
    { role: Role.OPERATOR, permissionName: 'loan:read' },
    { role: Role.OPERATOR, permissionName: 'loan:approve' },
    { role: Role.OPERATOR, permissionName: 'loan:reject' },
    { role: Role.OPERATOR, permissionName: 'loan:disburse' },
    { role: Role.OPERATOR, permissionName: 'fraud:read' },
    { role: Role.OPERATOR, permissionName: 'fraud:review' },
    { role: Role.OPERATOR, permissionName: 'fraud:resolve' },
    { role: Role.OPERATOR, permissionName: 'audit:read' },
    { role: Role.OPERATOR, permissionName: 'support:read' },
    { role: Role.OPERATOR, permissionName: 'support:assign' },
    { role: Role.COMPLIANCE, permissionName: 'user:read' },
    { role: Role.COMPLIANCE, permissionName: 'user:suspend' },
    { role: Role.COMPLIANCE, permissionName: 'kyc:read' },
    { role: Role.COMPLIANCE, permissionName: 'kyc:approve' },
    { role: Role.COMPLIANCE, permissionName: 'kyc:reject' },
    { role: Role.COMPLIANCE, permissionName: 'kyc:request_info' },
    { role: Role.COMPLIANCE, permissionName: 'aml:read' },
    { role: Role.COMPLIANCE, permissionName: 'aml:review' },
    { role: Role.COMPLIANCE, permissionName: 'fraud:read' },
    { role: Role.COMPLIANCE, permissionName: 'fraud:review' },
    { role: Role.COMPLIANCE, permissionName: 'fraud:escalate' },
    { role: Role.COMPLIANCE, permissionName: 'audit:read' },
    { role: Role.COMPLIANCE, permissionName: 'audit:export' },
    { role: Role.COMPLIANCE, permissionName: 'transaction:read' },
    { role: Role.COMPLIANCE, permissionName: 'account:read' },
  ];

  for (const rp of rolePermissions) {
    const permission = createdPermissions.find(p => p.name === rp.permissionName);
    if (permission) {
      await prisma.rolePermission.upsert({
        where: {
          role_permissionId: {
            role: rp.role,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          role: rp.role,
          permissionId: permission.id,
        },
      });
    }
  }
  console.log(`✅ Created ${rolePermissions.length} role permissions`);

  const password = await bcrypt.hash('Demo@123456', 12);
  const adminPassword = await bcrypt.hash('Admin@123456', 12);
  const compliancePassword = await bcrypt.hash('Compliance@123', 12);

  const users = [
    {
      email: 'john.doe@crestline.capital',
      password,
      firstName: 'John',
      lastName: 'Doe',
      phone: '+1234567890',
      dateOfBirth: new Date('1985-05-15'),
      address: '123 Main St',
      city: 'New York',
      state: 'NY',
      zipCode: '10001',
      country: 'US',
      status: UserStatus.ACTIVE,
      role: Role.CUSTOMER,
      emailVerified: true,
      phoneVerified: true,
    },
    {
      email: 'jane.smith@crestline.capital',
      password,
      firstName: 'Jane',
      lastName: 'Smith',
      phone: '+1987654321',
      dateOfBirth: new Date('1990-08-20'),
      address: '456 Oak Ave',
      city: 'Los Angeles',
      state: 'CA',
      zipCode: '90001',
      country: 'US',
      status: UserStatus.ACTIVE,
      role: Role.CUSTOMER,
      emailVerified: true,
      phoneVerified: true,
    },
    {
      email: 'admin@crestline.capital',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      phone: '+1111111111',
      dateOfBirth: new Date('1980-01-01'),
      address: '789 Admin Blvd',
      city: 'Chicago',
      state: 'IL',
      zipCode: '60601',
      country: 'US',
      status: UserStatus.ACTIVE,
      role: Role.ADMIN,
      emailVerified: true,
      phoneVerified: true,
    },
    {
      email: 'compliance@crestline.capital',
      password: compliancePassword,
      firstName: 'Compliance',
      lastName: 'Officer',
      phone: '+1222222222',
      dateOfBirth: new Date('1975-03-10'),
      address: '321 Compliance St',
      city: 'Washington',
      state: 'DC',
      zipCode: '20001',
      country: 'US',
      status: UserStatus.ACTIVE,
      role: Role.COMPLIANCE,
      emailVerified: true,
      phoneVerified: true,
    },
    {
      email: 'support@crestline.capital',
      password,
      firstName: 'Support',
      lastName: 'Agent',
      phone: '+1333333333',
      dateOfBirth: new Date('1988-11-25'),
      address: '654 Support Ave',
      city: 'Miami',
      state: 'FL',
      zipCode: '33101',
      country: 'US',
      status: UserStatus.ACTIVE,
      role: Role.SUPPORT,
      emailVerified: true,
      phoneVerified: true,
    },
    {
      email: 'operator@crestline.capital',
      password,
      firstName: 'Operator',
      lastName: 'Staff',
      phone: '+1444444444',
      dateOfBirth: new Date('1992-07-14'),
      address: '987 Operator Ln',
      city: 'Houston',
      state: 'TX',
      zipCode: '77001',
      country: 'US',
      status: UserStatus.ACTIVE,
      role: Role.OPERATOR,
      emailVerified: true,
      phoneVerified: true,
    },
  ];

  const createdUsers = await Promise.all(
    users.map(u => prisma.user.upsert({
      where: { email: u.email },
      update: u,
      create: u,
    }))
  );
  console.log(`✅ Created ${createdUsers.length} users`);

  const johnDoe = createdUsers.find(u => u.email === 'john.doe@crestline.capital')!;
  const janeSmith = createdUsers.find(u => u.email === 'jane.smith@crestline.capital')!;
  const admin = createdUsers.find(u => u.email === 'admin@crestline.capital')!;

  const accounts = [
    {
      userId: johnDoe.id,
      accountNumber: 'CL-001-000001',
      accountType: AccountType.CHECKING,
      name: 'Primary Checking',
      currency: 'USD',
      status: AccountStatus.ACTIVE,
      balance: 10000.00,
      availableBalance: 10000.00,
    },
    {
      userId: johnDoe.id,
      accountNumber: 'CL-001-000002',
      accountType: AccountType.SAVINGS,
      name: 'Savings Account',
      currency: 'USD',
      status: AccountStatus.ACTIVE,
      balance: 5000.00,
      availableBalance: 5000.00,
    },
    {
      userId: janeSmith.id,
      accountNumber: 'CL-002-000001',
      accountType: AccountType.CHECKING,
      name: 'Primary Checking',
      currency: 'USD',
      status: AccountStatus.ACTIVE,
      balance: 15000.00,
      availableBalance: 15000.00,
    },
    {
      userId: janeSmith.id,
      accountNumber: 'CL-002-000002',
      accountType: AccountType.SAVINGS,
      name: 'Savings Account',
      currency: 'USD',
      status: AccountStatus.ACTIVE,
      balance: 8000.00,
      availableBalance: 8000.00,
    },
    {
      userId: admin.id,
      accountNumber: 'CL-ADM-000001',
      accountType: AccountType.CHECKING,
      name: 'Admin Account',
      currency: 'USD',
      status: AccountStatus.ACTIVE,
      balance: 50000.00,
      availableBalance: 50000.00,
    },
  ];

  const createdAccounts = await Promise.all(
    accounts.map(a => prisma.account.upsert({
      where: { accountNumber: a.accountNumber },
      update: a,
      create: a,
    }))
  );
  console.log(`✅ Created ${createdAccounts.length} accounts`);

  const profiles = [
    { userId: johnDoe.id, avatarUrl: '/avatars/john.jpg', bio: 'Software Engineer', preferredLanguage: 'en', timezone: 'America/New_York' },
    { userId: janeSmith.id, avatarUrl: '/avatars/jane.jpg', bio: 'Financial Analyst', preferredLanguage: 'en', timezone: 'America/Los_Angeles' },
    { userId: admin.id, avatarUrl: '/avatars/admin.jpg', bio: 'Administrator', preferredLanguage: 'en', timezone: 'America/Chicago' },
  ];

  await Promise.all(
    profiles.map(p => prisma.profile.upsert({
      where: { userId: p.userId },
      update: p,
      create: p,
    }))
  );
  console.log(`✅ Created ${profiles.length} profiles`);

  const securitySettings = [
    { userId: johnDoe.id, twoFactorEnabled: false, loginAlerts: true, transactionAlerts: true, ipWhitelist: [] },
    { userId: janeSmith.id, twoFactorEnabled: false, loginAlerts: true, transactionAlerts: true, ipWhitelist: [] },
    { userId: admin.id, twoFactorEnabled: true, loginAlerts: true, transactionAlerts: true, ipWhitelist: [] },
  ];

  await Promise.all(
    securitySettings.map(s => prisma.securitySettings.upsert({
      where: { userId: s.userId },
      update: s,
      create: s,
    }))
  );
  console.log(`✅ Created ${securitySettings.length} security settings`);

  const kycProfiles = [
    { userId: johnDoe.id, status: KYCStatus.APPROVED, tier: KYCTier.TIER_2, verifiedAt: new Date(), verifiedById: admin.id },
    { userId: janeSmith.id, status: KYCStatus.APPROVED, tier: KYCTier.TIER_2, verifiedAt: new Date(), verifiedById: admin.id },
    { userId: admin.id, status: KYCStatus.APPROVED, tier: KYCTier.TIER_3, verifiedAt: new Date(), verifiedById: admin.id },
  ];

  const createdKycProfiles = await Promise.all(
    kycProfiles.map(k => prisma.kYCProfile.upsert({
      where: { userId: k.userId },
      update: k,
      create: k,
    }))
  );
  console.log(`✅ Created ${createdKycProfiles.length} KYC profiles`);

  const beneficiaries = [
    {
      userId: johnDoe.id,
      name: 'Jane Smith',
      accountNumber: 'CL-002-000001',
      accountName: 'Primary Checking',
      bankName: 'Crestline Capital',
      bankCode: 'CLBANK',
      currency: 'USD',
      country: 'US',
      isVerified: true,
      status: BeneficiaryStatus.ACTIVE,
    },
    {
      userId: johnDoe.id,
      name: 'External Bank',
      accountNumber: 'EXT-123456789',
      accountName: 'External Account',
      bankName: 'External Bank',
      routingNumber: '123456789',
      currency: 'USD',
      country: 'US',
      isVerified: true,
      status: BeneficiaryStatus.ACTIVE,
    },
    {
      userId: janeSmith.id,
      name: 'John Doe',
      accountNumber: 'CL-001-000001',
      accountName: 'Primary Checking',
      bankName: 'Crestline Capital',
      bankCode: 'CLBANK',
      currency: 'USD',
      country: 'US',
      isVerified: true,
      status: BeneficiaryStatus.ACTIVE,
    },
  ];

  await Promise.all(
    beneficiaries.map(b => prisma.beneficiary.upsert({
      where: { userId_accountNumber: { userId: b.userId, accountNumber: b.accountNumber } },
      update: b,
      create: b,
    }))
  );
  console.log(`✅ Created ${beneficiaries.length} beneficiaries`);

  const johnChecking = createdAccounts.find(a => a.accountNumber === 'CL-001-000001')!;
  const janeChecking = createdAccounts.find(a => a.accountNumber === 'CL-002-000001')!;

  const cards = [
    {
      userId: johnDoe.id,
      accountId: johnChecking.id,
      cardNumber: '4111111111111111',
      maskedCardNumber: '**** **** **** 1111',
      cardType: CardType.DEBIT,
      cardBrand: CardBrand.VISA,
      expiryMonth: 12,
      expiryYear: 2028,
      status: CardStatus.ACTIVE,
      isDefault: true,
      dailyLimit: 5000.00,
      monthlyLimit: 50000.00,
      provider: 'sandbox',
      providerReference: 'card_john_001',
    },
    {
      userId: johnDoe.id,
      accountId: johnChecking.id,
      cardNumber: '5555555555554444',
      maskedCardNumber: '**** **** **** 4444',
      cardType: CardType.CREDIT,
      cardBrand: CardBrand.MASTERCARD,
      expiryMonth: 6,
      expiryYear: 2027,
      status: CardStatus.ACTIVE,
      isDefault: false,
      dailyLimit: 10000.00,
      monthlyLimit: 100000.00,
      provider: 'sandbox',
      providerReference: 'card_john_002',
    },
    {
      userId: janeSmith.id,
      accountId: janeChecking.id,
      cardNumber: '4242424242424242',
      maskedCardNumber: '**** **** **** 4242',
      cardType: CardType.DEBIT,
      cardBrand: CardBrand.VISA,
      expiryMonth: 9,
      expiryYear: 2026,
      status: CardStatus.ACTIVE,
      isDefault: true,
      dailyLimit: 7500.00,
      monthlyLimit: 75000.00,
      provider: 'sandbox',
      providerReference: 'card_jane_001',
    },
  ];

  await Promise.all(
    cards.map(c => prisma.card.upsert({
      where: { cardNumber: c.cardNumber },
      update: c,
      create: c,
    }))
  );
  console.log(`✅ Created ${cards.length} cards`);

  const tx1 = await prisma.transaction.create({
    data: {
      reference: 'TXN-CL-000001',
      userId: johnDoe.id,
      accountId: johnChecking.id,
      type: TransactionType.DEPOSIT,
      amount: 5000.00,
      currency: 'USD',
      description: 'Initial deposit',
      status: TransactionStatus.COMPLETED,
      category: 'DEPOSIT',
    },
  });

  const journal1 = await prisma.journal.create({
    data: {
      reference: 'JOURNAL-CL-000001',
      description: 'Initial deposit for John Doe',
      status: JournalStatus.POSTED,
      transaction: { connect: { id: tx1.id } },
    },
  });

  await prisma.ledgerEntry.createMany({
    data: [
      {
        journalId: journal1.id,
        accountId: johnChecking.id,
        entryType: 'CREDIT',
        amount: 5000.00,
        balance: 5000.00,
        description: 'Initial deposit',
        transactionId: tx1.id,
      },
      {
        journalId: journal1.id,
        accountId: 'SYSTEM_LIABILITIES',
        entryType: 'DEBIT',
        amount: 5000.00,
        balance: -5000.00,
        description: 'Liability for customer deposit',
        transactionId: tx1.id,
      },
    ],
  });

  const tx2 = await prisma.transaction.create({
    data: {
      reference: 'TXN-CL-000002',
      userId: janeSmith.id,
      accountId: janeChecking.id,
      type: TransactionType.DEPOSIT,
      amount: 8000.00,
      currency: 'USD',
      description: 'Initial deposit',
      status: TransactionStatus.COMPLETED,
      category: 'DEPOSIT',
    },
  });

  const journal2 = await prisma.journal.create({
    data: {
      reference: 'JOURNAL-CL-000002',
      description: 'Initial deposit for Jane Smith',
      status: JournalStatus.POSTED,
      transaction: { connect: { id: tx2.id } },
    },
  });

  await prisma.ledgerEntry.createMany({
    data: [
      {
        journalId: journal2.id,
        accountId: janeChecking.id,
        entryType: 'CREDIT',
        amount: 8000.00,
        balance: 8000.00,
        description: 'Initial deposit',
        transactionId: tx2.id,
      },
      {
        journalId: journal2.id,
        accountId: 'SYSTEM_LIABILITIES',
        entryType: 'DEBIT',
        amount: 8000.00,
        balance: -8000.00,
        description: 'Liability for customer deposit',
        transactionId: tx2.id,
      },
    ],
  });

  const tx3 = await prisma.transaction.create({
    data: {
      reference: 'TXN-CL-000003',
      userId: johnDoe.id,
      accountId: johnChecking.id,
      type: TransactionType.TRANSFER,
      amount: 100.00,
      currency: 'USD',
      description: 'Transfer to Jane Smith',
      status: TransactionStatus.COMPLETED,
      category: 'TRANSFER',
    },
  });

  const transfer1 = await prisma.transfer.create({
    data: {
      reference: 'TRF-CL-000001',
      fromUserId: johnDoe.id,
      toUserId: janeSmith.id,
      fromAccountId: johnChecking.id,
      toAccountId: janeChecking.id,
      amount: 100.00,
      currency: 'USD',
      description: 'Transfer to Jane Smith',
      status: TransferStatus.COMPLETED,
      riskStatus: RiskStatus.LOW,
      beneficiaryId: await prisma.beneficiary.findUnique({ where: { userId_accountNumber: { userId: johnDoe.id, accountNumber: 'CL-002-000001' } } }).then(b => b?.id),
    },
  });

  const journal3 = await prisma.journal.create({
    data: {
      reference: 'JOURNAL-CL-000003',
      description: 'Transfer from John Doe to Jane Smith',
      status: JournalStatus.POSTED,
      transaction: { connect: { id: tx3.id } },
      transfer: { connect: { id: transfer1.id } },
    },
  });

  await prisma.ledgerEntry.createMany({
    data: [
      {
        journalId: journal3.id,
        accountId: johnChecking.id,
        entryType: 'DEBIT',
        amount: 100.00,
        balance: johnChecking.balance.minus(100.00),
        description: 'Transfer to Jane Smith',
        transactionId: tx3.id,
      },
      {
        journalId: journal3.id,
        accountId: janeChecking.id,
        entryType: 'CREDIT',
        amount: 100.00,
        balance: janeChecking.balance.plus(100.00),
        description: 'Transfer from John Doe',
        transactionId: tx3.id,
      },
    ],
  });

  console.log('✅ Created sample transactions with ledger entries');

  const notifications = [
    {
      userId: johnDoe.id,
      title: 'Welcome to Crestline Capital',
      message: 'Your account has been successfully created.',
      type: NotificationType.SUCCESS,
      category: NotificationCategory.SYSTEM,
      isRead: false,
    },
    {
      userId: johnDoe.id,
      title: 'Transfer Completed',
      message: 'Your transfer of $100.00 to Jane Smith has been completed.',
      type: NotificationType.SUCCESS,
      category: NotificationCategory.TRANSFER,
      isRead: false,
    },
    {
      userId: janeSmith.id,
      title: 'Welcome to Crestline Capital',
      message: 'Your account has been successfully created.',
      type: NotificationType.SUCCESS,
      category: NotificationCategory.SYSTEM,
      isRead: false,
    },
    {
      userId: janeSmith.id,
      title: 'Transfer Received',
      message: 'You received $100.00 from John Doe.',
      type: NotificationType.SUCCESS,
      category: NotificationCategory.TRANSFER,
      isRead: false,
    },
  ];

  await prisma.notification.createMany({ data: notifications });
  console.log(`✅ Created ${notifications.length} notifications`);

  const supportTickets = [
    {
      reference: 'TICKET-000001',
      userId: johnDoe.id,
      subject: 'Question about transfer',
      category: SupportCategory.TRANSFER,
      priority: SupportPriority.MEDIUM,
      description: 'How do I make an international transfer?',
      status: SupportTicketStatus.OPEN,
    },
    {
      reference: 'TICKET-000002',
      userId: janeSmith.id,
      subject: 'Account balance inquiry',
      category: SupportCategory.ACCOUNT,
      priority: SupportPriority.LOW,
      description: 'My balance seems incorrect.',
      status: SupportTicketStatus.IN_PROGRESS,
      assignedToId: createdUsers.find(u => u.email === 'support@crestline.capital')?.id,
    },
  ];

  const createdTickets = await Promise.all(
    supportTickets.map(t => prisma.supportTicket.upsert({
      where: { reference: t.reference },
      update: t,
      create: t,
    }))
  );

  await prisma.supportMessage.createMany({
    data: [
      {
        ticketId: createdTickets[0].id,
        senderId: johnDoe.id,
        message: 'How do I make an international transfer?',
        isInternal: false,
      },
      {
        ticketId: createdTickets[1].id,
        senderId: janeSmith.id,
        message: 'My balance seems incorrect.',
        isInternal: false,
      },
      {
        ticketId: createdTickets[1].id,
        senderId: createdUsers.find(u => u.email === 'support@crestline.capital')!.id,
        message: 'We are investigating your balance discrepancy. Please allow 24-48 hours.',
        isInternal: false,
      },
    ],
  });
  console.log(`✅ Created ${createdTickets.length} support tickets with messages`);

  const systemSettings = [
    { key: 'app_name', value: { value: 'Crestline Capital' }, description: 'Application name', category: SettingCategory.GENERAL },
    { key: 'app_version', value: { value: '1.0.0' }, description: 'Application version', category: SettingCategory.GENERAL },
    { key: 'maintenance_mode', value: { enabled: false }, description: 'Maintenance mode toggle', category: SettingCategory.MAINTENANCE },
    { key: 'daily_transfer_limit', value: { amount: 50000, currency: 'USD' }, description: 'Daily transfer limit', category: SettingCategory.TRANSACTION_LIMITS },
    { key: 'daily_withdrawal_limit', value: { amount: 10000, currency: 'USD' }, description: 'Daily withdrawal limit', category: SettingCategory.TRANSACTION_LIMITS },
    { key: 'min_balance', value: { amount: 0, currency: 'USD' }, description: 'Minimum account balance', category: SettingCategory.TRANSACTION_LIMITS },
    { key: 'sandbox_mode', value: { enabled: true }, description: 'Sandbox mode enabled', category: SettingCategory.PROVIDER_CONFIGURATION },
  ];

  await Promise.all(
    systemSettings.map(s => prisma.systemSetting.upsert({
      where: { key: s.key },
      update: s,
      create: s,
    }))
  );
  console.log(`✅ Created ${systemSettings.length} system settings`);

  const auditLogs = [
    {
      actorId: admin.id,
      action: AuditAction.CREATE,
      resourceType: ResourceType.USER,
      resourceId: johnDoe.id,
      oldValues: null,
      newValues: { email: 'john.doe@crestline.capital', role: 'CUSTOMER' },
      metadata: { ipAddress: '192.168.1.1', userAgent: 'Mozilla/5.0' },
      status: AuditStatus.SUCCESS,
    },
    {
      actorId: admin.id,
      action: AuditAction.CREATE,
      resourceType: ResourceType.ACCOUNT,
      resourceId: johnChecking.id,
      oldValues: null,
      newValues: { accountNumber: 'CL-001-000001', accountType: 'CHECKING' },
      metadata: { ipAddress: '192.168.1.1', userAgent: 'Mozilla/5.0' },
      status: AuditStatus.SUCCESS,
    },
    {
      actorId: johnDoe.id,
      action: AuditAction.CREATE,
      resourceType: ResourceType.TRANSFER,
      resourceId: transfer1.id,
      oldValues: null,
      newValues: { reference: 'TRF-CL-000001', amount: 100.00 },
      metadata: { ipAddress: '192.168.1.2', userAgent: 'Mozilla/5.0' },
      status: AuditStatus.SUCCESS,
    },
  ];

  await prisma.auditLog.createMany({ data: auditLogs });
  console.log(`✅ Created ${auditLogs.length} audit logs`);

  console.log('\n🎉 Seeding completed successfully!');
  console.log('\n📋 Summary:');
  console.log(`   - Users: ${createdUsers.length}`);
  console.log(`   - Accounts: ${createdAccounts.length}`);
  console.log(`   - Permissions: ${createdPermissions.length}`);
  console.log(`   - Role Permissions: ${rolePermissions.length}`);
  console.log('\n🔐 Demo Credentials:');
  console.log('   - Customer: john.doe@crestline.capital / Demo@123456');
  console.log('   - Customer: jane.smith@crestline.capital / Demo@123456');
  console.log('   - Admin: admin@crestline.capital / Admin@123456');
  console.log('   - Compliance: compliance@crestline.capital / Compliance@123');
  console.log('   - Support: support@crestline.capital / Demo@123456');
  console.log('   - Operator: operator@crestline.capital / Demo@123456');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
