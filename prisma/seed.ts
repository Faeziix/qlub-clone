/**
 * Seed: Paul - UAE (verified against app.qlub.io/qr/ae/paul-uae) plus a second
 * demo vendor, tables, staff, and sample orders/payments/reviews so the admin
 * dashboard renders with real-looking data.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomInt, randomBytes } from "node:crypto";

const db = new PrismaClient();

function randomTablePasscode() {
  return String(randomInt(0, 10000)).padStart(4, "0");
}

function randomStaffPassword() {
  return randomBytes(18).toString("base64url");
}

const CDN = "https://cdn-customerapp.qlub.io/digital_menu/menu";
const UNS = (id: string) => `https://images.unsplash.com/${id}?w=600&q=80&auto=format&fit=crop`;

interface SeedItem {
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  tags?: string[];
  calories?: number;
  modifierGroups?: {
    name: string;
    minSelect?: number;
    maxSelect?: number;
    required?: boolean;
    options: { name: string; priceDelta?: number; isDefault?: boolean }[];
  }[];
}
interface SeedCategory {
  name: string;
  items: SeedItem[];
}
interface SeedMenu {
  name: string;
  imageUrl?: string;
  categories: SeedCategory[];
}

const hotBeverage = {
  name: "Choose your hot beverage",
  required: true,
  minSelect: 1,
  maxSelect: 1,
  options: [
    { name: "Espresso", isDefault: true },
    { name: "Cappuccino" },
    { name: "Café Latte" },
    { name: "English Breakfast Tea" },
    { name: "Hot Chocolate", priceDelta: 4 },
  ],
};
const viennoiserie = {
  name: "Choose your viennoiserie",
  required: true,
  minSelect: 1,
  maxSelect: 1,
  options: [
    { name: "Butter Croissant", isDefault: true },
    { name: "Pain au Chocolat" },
    { name: "Pain aux Raisins" },
    { name: "Almond Croissant", priceDelta: 5 },
  ],
};
const eggStyle = {
  name: "How would you like your eggs?",
  required: true,
  minSelect: 1,
  maxSelect: 1,
  options: [
    { name: "Sunny side up", isDefault: true },
    { name: "Scrambled" },
    { name: "Poached" },
    { name: "Omelette" },
  ],
};
const extras = {
  name: "Add extras",
  minSelect: 0,
  maxSelect: 5,
  options: [
    { name: "Smoked Salmon", priceDelta: 18 },
    { name: "Avocado", priceDelta: 12 },
    { name: "Turkey Bacon", priceDelta: 10 },
    { name: "Extra Egg", priceDelta: 6 },
    { name: "Sautéed Mushrooms", priceDelta: 8 },
  ],
};

const paulMenus: SeedMenu[] = [
  {
    name: "BREAKFAST MENU",
    imageUrl: `${CDN}/372608/mo9oxuh0998qeolnyln_Eggs%20Benedict%20Salmon.jpg`,
    categories: [
      {
        name: "Breakfast Combo",
        items: [
          {
            name: "Parisien",
            description:
              "1 hot beverage + 1 viennoiserie of your choice, ½ flûte à l'ancienne, butter & jam.",
            price: 62,
            tags: ["popular"],
            modifierGroups: [hotBeverage, viennoiserie],
          },
          {
            name: "Continental",
            description:
              "1 hot beverage + 1 fresh orange juice + 1 viennoiserie of your choice + ½ flûte à l'ancienne, butter & jam.",
            price: 72,
            modifierGroups: [hotBeverage, viennoiserie],
          },
          {
            name: "Complete",
            description:
              "1 hot beverage + 1 fresh orange juice + 1 viennoiserie + ½ flûte à l'ancienne + 2 eggs any style, butter & jam.",
            price: 88,
            tags: ["chef-special"],
            modifierGroups: [hotBeverage, viennoiserie, eggStyle],
          },
        ],
      },
      {
        name: "Eggs & Omelettes",
        items: [
          {
            name: "Eggs Benedict Salmon",
            description:
              "Two poached eggs, smoked salmon, hollandaise sauce on a toasted muffin with hash brown.",
            price: 58,
            imageUrl: `${CDN}/372608/mo9oxuh0998qeolnyln_Eggs%20Benedict%20Salmon.jpg`,
            tags: ["popular"],
            calories: 540,
            modifierGroups: [extras],
          },
          {
            name: "Eggs Benedict Turkey Ham",
            description:
              "Two poached eggs, turkey ham, hollandaise sauce on a toasted muffin with hash brown.",
            price: 52,
            tags: ["halal"],
            modifierGroups: [extras],
          },
          {
            name: "Three Egg Omelette",
            description:
              "Fluffy three-egg omelette with your choice of fillings, served with mixed greens.",
            price: 46,
            modifierGroups: [
              {
                name: "Choose fillings",
                minSelect: 0,
                maxSelect: 4,
                options: [
                  { name: "Cheese", isDefault: true },
                  { name: "Mushroom" },
                  { name: "Tomato" },
                  { name: "Spinach" },
                  { name: "Turkey Ham", priceDelta: 6 },
                ],
              },
            ],
          },
          {
            name: "Shakshuka",
            description:
              "Baked eggs in spiced tomato & pepper sauce, served with flûte à l'ancienne.",
            price: 48,
            tags: ["vegetarian", "spicy"],
          },
        ],
      },
      {
        name: "Sandwiches & Toasts",
        items: [
          {
            name: "Avocado Toast",
            description:
              "Smashed avocado, poached egg, cherry tomatoes, dukkah on multigrain sourdough.",
            price: 44,
            tags: ["vegetarian", "popular"],
            imageUrl: UNS("photo-1588137378633-dea1336ce1e2"),
            modifierGroups: [extras],
          },
          {
            name: "Croque Monsieur",
            description:
              "Toasted brioche, turkey ham, béchamel & gruyère cheese gratiné.",
            price: 42,
          },
          {
            name: "Croque Madame",
            description: "Croque Monsieur topped with a sunny-side-up egg.",
            price: 46,
          },
        ],
      },
      {
        name: "French Toast & Açaí",
        items: [
          {
            name: "Pain Perdu",
            description:
              "Brioche French toast, caramelised, with fresh berries & vanilla ice cream.",
            price: 45,
            imageUrl: `${CDN}/377374/moh4c5mq8gc97jlt4p_Pain%20Perdu.jpg`,
            tags: ["popular", "vegetarian"],
            calories: 620,
          },
          {
            name: "Açaí Bowl",
            description:
              "Açaí blend topped with granola, banana, strawberries & honey.",
            price: 48,
            tags: ["vegan"],
            imageUrl: UNS("photo-1590301157890-4810ed352733"),
          },
        ],
      },
    ],
  },
  {
    name: "LUNCH MENU",
    imageUrl: `${CDN}/372604/mo9oanvaspd80xtxea8_Entrecote%20Steak%20Frites.jpg`,
    categories: [
      {
        name: "All Day Brunch",
        items: [
          {
            name: "Smashed Avocado & Eggs",
            description:
              "Sourdough, smashed avocado, two poached eggs, feta & chilli flakes.",
            price: 49,
            tags: ["vegetarian"],
          },
          {
            name: "Salmon & Scrambled Eggs",
            description:
              "Creamy scrambled eggs, smoked salmon, chives on toasted sourdough.",
            price: 56,
            tags: ["popular"],
          },
        ],
      },
      {
        name: "Appetizers & Soups",
        items: [
          {
            name: "French Onion Soup",
            description:
              "Slow-cooked onions, beef broth, gruyère crouton gratiné.",
            price: 38,
            imageUrl: UNS("photo-1547592166-23ac45744acd"),
          },
          {
            name: "Burrata & Heirloom Tomato",
            description:
              "Creamy burrata, heirloom tomatoes, basil pesto & aged balsamic.",
            price: 52,
            tags: ["vegetarian", "chef-special"],
          },
          {
            name: "Soup of the Day",
            description: "Ask your server — served with warm bread.",
            price: 32,
            tags: ["vegetarian"],
          },
        ],
      },
      {
        name: "Sandwiches",
        items: [
          {
            name: "Le Parisien Baguette",
            description:
              "Flûte à l'ancienne, turkey ham, emmental, butter & cornichons.",
            price: 42,
          },
          {
            name: "Tuna Niçoise Baguette",
            description: "Tuna, egg, olives, tomato & lettuce on baguette.",
            price: 44,
          },
        ],
      },
      {
        name: "Clubs & Burgers",
        items: [
          {
            name: "Paul Club Sandwich",
            description:
              "Triple-decker with grilled chicken, turkey bacon, egg, tomato & fries.",
            price: 58,
            tags: ["popular"],
            imageUrl: UNS("photo-1528735602780-2552fd46c7af"),
            modifierGroups: [
              {
                name: "Choice of side",
                required: true,
                minSelect: 1,
                maxSelect: 1,
                options: [
                  { name: "French Fries", isDefault: true },
                  { name: "Mixed Salad" },
                  { name: "Sweet Potato Fries", priceDelta: 6 },
                ],
              },
            ],
          },
          {
            name: "Wagyu Beef Burger",
            description:
              "Wagyu patty, cheddar, caramelised onion, brioche bun & fries.",
            price: 72,
            tags: ["chef-special"],
            modifierGroups: [
              {
                name: "Add-ons",
                minSelect: 0,
                maxSelect: 3,
                options: [
                  { name: "Extra Cheese", priceDelta: 6 },
                  { name: "Turkey Bacon", priceDelta: 10 },
                  { name: "Fried Egg", priceDelta: 6 },
                ],
              },
            ],
          },
        ],
      },
      {
        name: "Salads",
        items: [
          {
            name: "Niçoise Salad",
            description:
              "Seared tuna, green beans, egg, potato, olives & vinaigrette.",
            price: 54,
          },
          {
            name: "Quinoa & Avocado Salad",
            description: "Quinoa, avocado, pomegranate, almonds & lemon dressing.",
            price: 48,
            tags: ["vegan", "gluten-free"],
          },
        ],
      },
      {
        name: "Pasta & Risotto",
        items: [
          {
            name: "Truffle Mushroom Risotto",
            description: "Arborio rice, wild mushrooms, parmesan & truffle oil.",
            price: 62,
            tags: ["vegetarian", "chef-special"],
          },
          {
            name: "Penne Arrabbiata",
            description: "Penne in spicy tomato & garlic sauce, basil.",
            price: 46,
            tags: ["vegetarian", "spicy"],
          },
        ],
      },
      {
        name: "French Traditional",
        items: [
          {
            name: "Entrecôte Steak Frites",
            description:
              "Grilled ribeye, café de Paris butter, golden fries & green salad.",
            price: 96,
            imageUrl: `${CDN}/372604/mo9oanvaspd80xtxea8_Entrecote%20Steak%20Frites.jpg`,
            tags: ["popular", "chef-special"],
            calories: 820,
            modifierGroups: [
              {
                name: "How would you like it cooked?",
                required: true,
                minSelect: 1,
                maxSelect: 1,
                options: [
                  { name: "Medium Rare", isDefault: true },
                  { name: "Medium" },
                  { name: "Well Done" },
                ],
              },
            ],
          },
          {
            name: "Coq au Vin",
            description: "Braised chicken, mushrooms, pearl onions in red wine jus.",
            price: 68,
          },
        ],
      },
      {
        name: "More Mains",
        items: [
          {
            name: "Grilled Salmon Fillet",
            description: "Salmon, sautéed vegetables, lemon butter sauce.",
            price: 78,
            tags: ["gluten-free"],
          },
          {
            name: "Roasted Chicken Supreme",
            description: "Free-range chicken, mashed potato, mushroom sauce.",
            price: 64,
          },
        ],
      },
    ],
  },
  {
    name: "DESSERTS",
    imageUrl: `${CDN}/377374/moh4c5mq8gc97jlt4p_Pain%20Perdu.jpg`,
    categories: [
      {
        name: "Patisserie",
        items: [
          {
            name: "Tarte au Citron",
            description: "Classic lemon tart with torched meringue.",
            price: 36,
            tags: ["vegetarian"],
          },
          {
            name: "Mille-Feuille",
            description: "Layered puff pastry, vanilla crème pâtissière.",
            price: 38,
            tags: ["popular", "vegetarian"],
          },
          {
            name: "Éclair au Chocolat",
            description: "Choux pastry, chocolate cream, chocolate glaze.",
            price: 28,
            tags: ["vegetarian"],
          },
          {
            name: "Crème Brûlée",
            description: "Vanilla custard with caramelised sugar crust.",
            price: 34,
            tags: ["vegetarian", "gluten-free"],
          },
        ],
      },
      {
        name: "Cakes & Sweets",
        items: [
          {
            name: "Fondant au Chocolat",
            description: "Warm molten chocolate cake, vanilla ice cream.",
            price: 42,
            tags: ["popular", "vegetarian"],
            imageUrl: UNS("photo-1606313564200-e75d5e30476c"),
          },
          {
            name: "Macarons (Box of 6)",
            description: "Assorted French macarons.",
            price: 48,
            tags: ["vegetarian"],
          },
        ],
      },
    ],
  },
  {
    name: "BEVERAGES",
    imageUrl: `${CDN}/372603/mo9o4yg5di61ylc1zne_Caramel%20Cappuccino.jpg`,
    categories: [
      {
        name: "Hot Coffee",
        items: [
          {
            name: "Caramel Cappuccino",
            description: "Espresso, steamed milk, caramel drizzle.",
            price: 26,
            imageUrl: `${CDN}/372603/mo9o4yg5di61ylc1zne_Caramel%20Cappuccino.jpg`,
            tags: ["popular"],
            modifierGroups: [
              {
                name: "Milk",
                required: true,
                minSelect: 1,
                maxSelect: 1,
                options: [
                  { name: "Full Cream", isDefault: true },
                  { name: "Skimmed" },
                  { name: "Oat Milk", priceDelta: 4 },
                  { name: "Almond Milk", priceDelta: 4 },
                ],
              },
              {
                name: "Size",
                required: true,
                minSelect: 1,
                maxSelect: 1,
                options: [
                  { name: "Regular", isDefault: true },
                  { name: "Large", priceDelta: 5 },
                ],
              },
            ],
          },
          { name: "Espresso", description: "Single / double shot.", price: 16 },
          { name: "Café Latte", description: "Espresso with steamed milk.", price: 24 },
          { name: "Flat White", description: "Double ristretto, microfoam.", price: 24 },
        ],
      },
      {
        name: "Cold Drinks",
        items: [
          {
            name: "Fresh Orange Juice",
            description: "Freshly squeezed.",
            price: 28,
            tags: ["vegan"],
          },
          { name: "Iced Latte", description: "Espresso over ice & milk.", price: 26 },
          {
            name: "Lemonade Mint",
            description: "Fresh lemon, mint & soda.",
            price: 24,
            tags: ["vegan"],
          },
          { name: "Still / Sparkling Water", price: 12 },
        ],
      },
    ],
  },
  {
    name: "World Cup Boxes",
    imageUrl: UNS("photo-1414235077428-338989a2e8c0"),
    categories: [
      {
        name: "Sharing Boxes",
        items: [
          {
            name: "Le Petit Box",
            description:
              "Assorted mini sandwiches, viennoiseries & macarons. Serves 2-3.",
            price: 145,
            tags: ["popular"],
          },
          {
            name: "Le Grand Box",
            description:
              "Sandwiches, quiches, salads, pastries & juices. Serves 4-6.",
            price: 280,
            tags: ["chef-special"],
          },
        ],
      },
    ],
  },
];

async function seedVendor(opts: {
  slug: string;
  name: string;
  theme: string;
  logoUrl?: string;
  coverUrl?: string;
  description?: string;
  serviceChargePct?: number;
  taxPct?: number;
  menus: SeedMenu[];
}) {
  const vendor = await db.vendor.create({
    data: {
      slug: opts.slug,
      name: opts.name,
      country: "ir",
      currency: "IRR",
      locale: "fa",
      timezone: "Asia/Tehran",
      theme: opts.theme,
      logoUrl: opts.logoUrl,
      coverUrl: opts.coverUrl,
      description: opts.description,
      supportedLangs: ["fa", "en"],
      address: "تهران، خیابان ولیعصر",
      phone: "+98 21 0000 0000",
      email: "hello@example.ir",
      serviceChargePct: opts.serviceChargePct ?? 0,
      taxPct: opts.taxPct ?? 0,
      vatEnabled: false,
      taxInclusive: true,
      tippingEnabled: true,
      tipPresets: [5, 10, 15],
    },
  });

  const createdItems: { id: string; price: bigint; name: string }[] = [];

  for (let m = 0; m < opts.menus.length; m++) {
    const menu = opts.menus[m];
    const createdMenu = await db.menu.create({
      data: {
        vendorId: vendor.id,
        name: menu.name,
        imageUrl: menu.imageUrl,
        sortOrder: m,
      },
    });
    for (let c = 0; c < menu.categories.length; c++) {
      const cat = menu.categories[c];
      const createdCat = await db.category.create({
        data: { menuId: createdMenu.id, name: cat.name, sortOrder: c },
      });
      for (let i = 0; i < cat.items.length; i++) {
        const it = cat.items[i];
        const priceRial = BigInt(it.price) * 1000n;
        const createdItem = await db.menuItem.create({
          data: {
            vendorId: vendor.id,
            categoryId: createdCat.id,
            name: it.name,
            description: it.description,
            price: priceRial,
            imageUrl: it.imageUrl,
            tags: it.tags ?? [],
            calories: it.calories,
            sortOrder: i,
            modifierGroups: it.modifierGroups
              ? {
                  create: it.modifierGroups.map((g, gi) => ({
                    name: g.name,
                    required: g.required ?? false,
                    minSelect: g.minSelect ?? 0,
                    maxSelect: g.maxSelect ?? 1,
                    sortOrder: gi,
                    options: {
                      create: g.options.map((o, oi) => ({
                        name: o.name,
                        priceDelta: BigInt(o.priceDelta ?? 0) * 1000n,
                        isDefault: o.isDefault ?? false,
                        sortOrder: oi,
                      })),
                    },
                  })),
                }
              : undefined,
          },
        });
        createdItems.push({
          id: createdItem.id,
          price: priceRial,
          name: it.name,
        });
      }
    }
  }

  const tables = [];
  const areas = ["سالن اصلی", "تراس", "سالن اصلی", "پنجره", "تراس"];
  for (let t = 1; t <= 12; t++) {
    const table = await db.diningTable.create({
      data: {
        vendorId: vendor.id,
        code: String(t),
        label: `میز ${t}`,
        passcode: randomTablePasscode(),
        seats: 2 + (t % 4),
        area: areas[t % areas.length],
        status: t <= 3 ? "occupied" : "available",
      },
    });
    tables.push(table);
  }

  return { vendor, items: createdItems, tables };
}

async function seedOrders(
  vendorId: string,
  items: { id: string; price: bigint; name: string }[],
  tables: { id: string }[],
  orderSeqStart = 0
) {
  const names = ["سارا", "عمر", "لیلا", "فاطمه", "نوح", "عائشه", "علی", "مریم"];
  const now = Date.now();

  let currentSeq = orderSeqStart;

  for (let o = 0; o < 24; o++) {
    const pick = items
      .sort(() => 0.5 - Math.random())
      .slice(0, 1 + Math.floor(Math.random() * 3));
    let subtotal = 0n;
    const orderItems = pick.map((p) => {
      const qty = 1 + Math.floor(Math.random() * 2);
      const line = p.price * BigInt(qty);
      subtotal += line;
      return {
        itemId: p.id,
        name: p.name,
        unitPrice: p.price,
        quantity: qty,
        lineTotal: line,
      };
    });
    const serviceCharge = (subtotal * 700n) / 10_000n;
    const tip = o % 3 === 0 ? (subtotal * 1000n) / 10_000n : 0n;
    const total = subtotal + serviceCharge + tip;
    const daysAgo = Math.floor(o / 3);
    const createdAt = new Date(now - daysAgo * 86400000 - o * 1800000);
    const paid = o > 4;

    currentSeq += 1;
    const orderNumber = `V-${String(currentSeq).padStart(6, "0")}`;

    const order = await db.order.create({
      data: {
        vendorId,
        tableId: tables[o % tables.length].id,
        orderNumber,
        type: o % 2 === 0 ? "dinein" : "qsr",
        status: paid ? "paid" : (["placed", "preparing", "ready"] as const)[o % 3],
        guestName: names[o % names.length],
        currency: "IRR",
        subtotal,
        serviceCharge,
        tipAmount: tip,
        total,
        amountPaid: paid ? total : 0n,
        createdAt,
        items: { create: orderItems },
      },
    });

    if (paid) {
      const payment = await db.payment.create({
        data: {
          vendorId,
          orderId: order.id,
          amount: subtotal + serviceCharge,
          tipAmount: tip,
          total,
          method: "ipg",
          status: "succeeded",
          splitType: "full",
          payerName: names[o % names.length],
          reference: `pay_${orderNumber}_${o}`,
          createdAt,
        },
      });

      if (o % 2 === 0) {
        await db.review.create({
          data: {
            vendorId,
            paymentId: payment.id,
            rating: 4 + (o % 2),
            foodRating: 4 + (o % 2),
            serviceRating: 5 - (o % 2),
            ambienceRating: 4 + (o % 2),
            comment: [
              "عالی بود، استیک فوق العاده!",
              "سرویس سریع و پرداخت آسان با QR.",
              "قهوه و شیرینی خوب. حتماً برمی‌گردیم.",
              "",
            ][o % 4],
            guestName: names[o % names.length],
            createdAt,
          },
        });
      }
    }
  }

  return currentSeq;
}

async function main() {
  console.log("🌱 Seeding…");
  await db.review.deleteMany();
  await db.payment.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.modifierOption.deleteMany();
  await db.modifierGroup.deleteMany();
  await db.menuItem.deleteMany();
  await db.category.deleteMany();
  await db.menu.deleteMany();
  await db.diningTable.deleteMany();
  await db.staffUser.deleteMany();
  await db.vendor.deleteMany();

  const paul = await seedVendor({
    slug: "paul-ir",
    name: "پل — رستوران فرانسوی",
    theme: "darkgold",
    description:
      "کافه و نانوایی فرانسوی، از سال ۱۸۸۹. نان تازه، شیرینی و صبحانه تمام روز.",
    logoUrl: UNS("photo-1559925393-8be0ec4767c8"),
    coverUrl: `${CDN}/372604/mo9oanvaspd80xtxea8_Entrecote%20Steak%20Frites.jpg`,
    menus: paulMenus,
  });
  const paulFinalSeq = await seedOrders(paul.vendor.id, paul.items, paul.tables, 0);
  await db.vendor.update({
    where: { id: paul.vendor.id },
    data: { vendorOrderSeq: paulFinalSeq },
  });

  const bistro = await seedVendor({
    slug: "olive-bistro-ir",
    name: "رستوران زیتون",
    theme: "emerald",
    description: "پیش‌غذاهای مدیترانه‌ای و غذاهای تنوری.",
    logoUrl: UNS("photo-1552566626-52f8b828add9"),
    coverUrl: UNS("photo-1414235077428-338989a2e8c0"),
    menus: [paulMenus[1], paulMenus[3]],
  });
  const bistroFinalSeq = await seedOrders(bistro.vendor.id, bistro.items, bistro.tables, 0);
  await db.vendor.update({
    where: { id: bistro.vendor.id },
    data: { vendorOrderSeq: bistroFinalSeq },
  });

  const demoStaff = [
    { email: "admin@qlub.ir", name: "مدیر پلتفرم", role: "superadmin" as const, vendorId: null },
    { email: "owner@paul.ir", name: "پیر دوبوا", role: "owner" as const, vendorId: paul.vendor.id },
    { email: "manager@paul.ir", name: "یارا حداد", role: "manager" as const, vendorId: paul.vendor.id },
    { email: "owner@olive.ir", name: "النا روسی", role: "owner" as const, vendorId: bistro.vendor.id },
  ];

  const generatedCredentials: { email: string; password: string }[] = [];
  for (const staff of demoStaff) {
    const password = randomStaffPassword();
    await db.staffUser.create({
      data: { ...staff, passwordHash: await bcrypt.hash(password, 10) },
    });
    generatedCredentials.push({ email: staff.email, password });
  }

  console.log("✅ Seed complete.");
  console.log("   Customer: /qr/ir/paul-ir");
  console.log("   Admin:    /admin/login");
  console.log("   Generated staff credentials (shown once — copy them now):");
  for (const { email, password } of generatedCredentials) {
    console.log(`     ${email}  ${password}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
