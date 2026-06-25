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
  address?: string;
  phone?: string;
  email?: string;
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
      address: opts.address ?? "تهران، ایران",
      phone: opts.phone,
      email: opts.email,
      serviceChargePct: opts.serviceChargePct ?? 10,
      taxPct: opts.taxPct ?? 0,
      taxInclusive: true,
      vatEnabled: false,
      vatPct: 0,
      tippingEnabled: true,
      tipPresets: [5, 10, 15],
    },
  });

  const createdItems: { id: string; price: number; name: string }[] = [];

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
        const createdItem = await db.menuItem.create({
          data: {
            vendorId: vendor.id,
            categoryId: createdCat.id,
            name: it.name,
            description: it.description,
            price: BigInt(it.price),
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
                        priceDelta: BigInt(o.priceDelta ?? 0),
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
          price: it.price,
          name: it.name,
        });
      }
    }
  }

  // Tables with QR passcodes
  const tables = [];
  const areas = ["Main Hall", "Terrace", "Main Hall", "Window", "Terrace"];
  for (let t = 1; t <= 12; t++) {
    const table = await db.diningTable.create({
      data: {
        vendorId: vendor.id,
        code: String(t),
        label: `Table ${t}`,
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
  items: { id: string; price: number; name: string }[],
  tables: { id: string }[],
  offset = 0
) {
  const names = ["Sara", "Omar", "Layla", "James", "Fatima", "Noah", "Aisha", "Liam"];
  const methods = ["ipg", "cash"] as const;
  const now = Date.now();

  for (let o = 0; o < 24; o++) {
    const pick = items
      .sort(() => 0.5 - Math.random())
      .slice(0, 1 + Math.floor(Math.random() * 3));
    let subtotal = 0;
    const orderItems = pick.map((p) => {
      const qty = 1 + Math.floor(Math.random() * 2);
      const line = p.price * qty;
      subtotal += line;
      return {
        itemId: p.id,
        name: p.name,
        unitPrice: BigInt(p.price),
        quantity: qty,
        lineTotal: BigInt(line),
      };
    });
    const serviceCharge = Math.round(subtotal * 0.07);
    const tax = Math.round((subtotal + serviceCharge) * 0.05);
    const tip = o % 3 === 0 ? Math.round(subtotal * 0.1) : 0;
    const total = subtotal + serviceCharge + tip;
    const daysAgo = Math.floor(o / 3);
    const createdAt = new Date(now - daysAgo * 86400000 - o * 1800000);
    const paid = o > 4; // a few still open
    const openStatuses = ["placed", "preparing", "ready"] as const;

    const order = await db.order.create({
      data: {
        vendorId,
        tableId: tables[o % tables.length].id,
        orderNumber: `Q-${String(10240 + offset + o)}`,
        type: o % 2 === 0 ? "dinein" : "qsr",
        status: paid ? "paid" : openStatuses[o % 3],
        guestName: names[o % names.length],
        currency: "IRR",
        subtotal: BigInt(subtotal),
        serviceCharge: BigInt(serviceCharge),
        tax: BigInt(tax),
        tipAmount: BigInt(tip),
        total: BigInt(total),
        amountPaid: paid ? BigInt(total) : BigInt(0),
        createdAt,
        items: { create: orderItems },
      },
    });

    if (paid) {
      const paymentRef = `pay_${order.orderNumber}_${o}`;
      const payment = await db.payment.create({
        data: {
          vendorId,
          orderId: order.id,
          amount: BigInt(subtotal + serviceCharge),
          tipAmount: BigInt(tip),
          total: BigInt(total),
          method: methods[o % methods.length],
          status: "succeeded",
          splitType: "full",
          payerName: names[o % names.length],
          reference: paymentRef,
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
              "Lovely brunch, the steak frites was perfect!",
              "Quick service and easy payment via QR.",
              "Great coffee and pastries. Will return.",
              "",
            ][o % 4],
            guestName: names[o % names.length],
            createdAt,
          },
        });
      }
    }
  }
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
    name: "پل — تهران",
    theme: "darkgold",
    description:
      "نانوایی و کافه فرانسوی، از ۱۸۸۹. نان تازه، وینیازری و صبحانه تمام روز.",
    logoUrl: UNS("photo-1559925393-8be0ec4767c8"),
    coverUrl: `${CDN}/372604/mo9oanvaspd80xtxea8_Entrecote%20Steak%20Frites.jpg`,
    address: "تهران، خیابان ولیعصر، پاساژ پارسیان",
    phone: "+98 21 0000 0000",
    email: "hello@paul-ir.example.com",
    serviceChargePct: 10,
    taxPct: 0,
    menus: paulMenus,
  });
  await seedOrders(paul.vendor.id, paul.items, paul.tables);

  // Second demo vendor so the platform feels multi-tenant
  const bistro = await seedVendor({
    slug: "olive-bistro-ir",
    name: "زیتون بیسترو",
    theme: "emerald",
    description: "غذاهای کوچک مدیترانه‌ای و کباب‌های هیزمی.",
    logoUrl: UNS("photo-1552566626-52f8b828add9"),
    coverUrl: UNS("photo-1414235077428-338989a2e8c0"),
    address: "اصفهان، خیابان چهارباغ",
    menus: [paulMenus[1], paulMenus[3]],
  });
  await seedOrders(bistro.vendor.id, bistro.items, bistro.tables, 1000);

  // Staff users — each gets a unique cryptographically-random password,
  // printed once so the operator can sign in. No shared/static credential.
  const demoStaff: { email: string; name: string; role: "superadmin" | "owner" | "manager" | "staff"; vendorId: string | null }[] = [
    { email: "admin@qlub.ir", name: "مدیر پلتفرم", role: "superadmin", vendorId: null },
    { email: "owner@paul-ir.example.com", name: "علی رضایی", role: "owner", vendorId: paul.vendor.id },
    { email: "manager@paul-ir.example.com", name: "مریم احمدی", role: "manager", vendorId: paul.vendor.id },
    { email: "owner@olive-bistro-ir.example.com", name: "سارا محمدی", role: "owner", vendorId: bistro.vendor.id },
  ];

  const generatedCredentials: { email: string; password: string }[] = [];
  for (const staff of demoStaff) {
    const password = randomStaffPassword();
    await db.staffUser.create({
      data: {
        email: staff.email,
        name: staff.name,
        role: staff.role,
        vendorId: staff.vendorId,
        passwordHash: await bcrypt.hash(password, 10),
      },
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
