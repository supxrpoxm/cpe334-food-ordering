import bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();
const saltRounds = 10;

const catalog = [
  { id: '4ddaa64a-f1b9-4de8-8ed1-5330ae340001', name: 'Rice Bowls', products: [
    { id: '4ddaa64a-f1b9-4de8-8ed1-5330ae340101', name: 'Grilled Chicken Rice Bowl', description: 'Tender grilled chicken served over jasmine rice with seasonal vegetables.', price: '89.00', stockQuantity: 18 },
    { id: '4ddaa64a-f1b9-4de8-8ed1-5330ae340102', name: 'Basil Pork Rice', description: 'A comforting Thai basil pork stir-fry with rice.', price: '79.00', stockQuantity: 12 },
    { id: '4ddaa64a-f1b9-4de8-8ed1-5330ae340103', name: 'Crispy Tofu Rice Bowl', description: 'Crispy tofu, fresh greens, and a mild sesame dressing.', price: '75.00', stockQuantity: 0 },
  ] },
  { id: '4ddaa64a-f1b9-4de8-8ed1-5330ae340002', name: 'Noodles', products: [
    { id: '4ddaa64a-f1b9-4de8-8ed1-5330ae340201', name: 'Chicken Pad Thai', description: 'Rice noodles with chicken, egg, bean sprouts, and crushed peanuts.', price: '95.00', stockQuantity: 14 },
    { id: '4ddaa64a-f1b9-4de8-8ed1-5330ae340202', name: 'Vegetable Noodle Soup', description: 'A gentle, warming broth with noodles and fresh vegetables.', price: '82.00', stockQuantity: 9 },
  ] },
  { id: '4ddaa64a-f1b9-4de8-8ed1-5330ae340003', name: 'Drinks', products: [
    { id: '4ddaa64a-f1b9-4de8-8ed1-5330ae340301', name: 'Thai Iced Tea', description: 'Traditional Thai tea served chilled.', price: '45.00', stockQuantity: 25 },
    { id: '4ddaa64a-f1b9-4de8-8ed1-5330ae340302', name: 'Fresh Lime Soda', description: 'Fresh lime with sparkling water.', price: '40.00', stockQuantity: 20 },
  ] },
];

async function seed(): Promise<void> {
  const seedDemoData = process.env.SEED_DEMO_DATA === 'true' || process.env.NODE_ENV !== 'production';
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.trim() === '') {
    throw new Error('ADMIN_PASSWORD is required to seed the administrator.');
  }

  let demoUserPassword: string | undefined;
  if (seedDemoData) {
    demoUserPassword = process.env.DEMO_USER_PASSWORD;
    if (!demoUserPassword || demoUserPassword.trim() === '') {
      throw new Error('DEMO_USER_PASSWORD is required when SEED_DEMO_DATA is enabled.');
    }
  }

  for (const entry of catalog) {
    const category = await prisma.category.upsert({
      where: { name: entry.name },
      update: {},
      create: { id: entry.id, name: entry.name },
    });

    for (const product of entry.products) {
      await prisma.product.upsert({
        where: { id: product.id },
        update: {},
        create: { ...product, categoryId: category.id },
      });
    }
  }

  const accounts = [
    { email: 'admin@example.com', name: 'Demo Administrator', role: Role.ADMIN, password: adminPassword },
  ];

  if (demoUserPassword) {
    accounts.push({
      email: 'customer@example.com',
      name: 'Demo Customer',
      role: Role.CUSTOMER,
      password: demoUserPassword,
    });
  }

  for (const account of accounts) {
    const passwordHash = await bcrypt.hash(account.password, saltRounds);
    await prisma.user.upsert({
      where: { email: account.email },
      update: {},
      create: { email: account.email, name: account.name, role: account.role, passwordHash },
    });
  }

  console.log(`Seeded ${catalog.reduce((count, item) => count + item.products.length, 0)} menu items and ${accounts.length} accounts.`);
}

seed()
  .catch((error: unknown) => {
    console.error('Database seed failed', error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
