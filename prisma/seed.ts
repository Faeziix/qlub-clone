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

const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function generateSeedPublicId(): string {
  const bytes = randomBytes(5);
  const n =
    (BigInt(bytes[0]) << 32n) |
    (BigInt(bytes[1]) << 24n) |
    (BigInt(bytes[2]) << 16n) |
    (BigInt(bytes[3]) << 8n) |
    BigInt(bytes[4]);
  let code = "";
  for (let shift = 35; shift >= 0; shift -= 5) {
    code += CROCKFORD_ALPHABET[Number((n >> BigInt(shift)) & 31n)];
  }
  return code;
}

// Defaults to a per-account crypto-random password (no static credential in
// committed source — see ADR-0001). For an easy known local login, set
// SEED_STAFF_PASSWORD in an untracked .env.local; it is never committed.
const SEED_STAFF_PASSWORD_OVERRIDE = process.env.SEED_STAFF_PASSWORD || null;

const CDN = "https://cdn-customerapp.qlub.io/digital_menu/menu";
const UNS = (id: string) => `https://images.unsplash.com/${id}?w=600&q=80&auto=format&fit=crop`;

interface SeedItem {
  name: string;
  faName?: string;
  description?: string;
  faDescription?: string;
  price: number;
  imageUrl?: string;
  tags?: string[];
  calories?: number;
  modifierGroups?: {
    name: string;
    faName?: string;
    minSelect?: number;
    maxSelect?: number;
    required?: boolean;
    options: { name: string; faName?: string; priceDelta?: number; isDefault?: boolean }[];
  }[];
}
interface SeedCategory {
  name: string;
  faName?: string;
  items: SeedItem[];
}
interface SeedMenu {
  name: string;
  imageUrl?: string;
  categories: SeedCategory[];
}

const R = 10_000;

const hotBeverage = {
  name: "Choose your hot beverage",
  faName: "نوشیدنی گرم را انتخاب کنید",
  required: true,
  minSelect: 1,
  maxSelect: 1,
  options: [
    { name: "Espresso", faName: "اسپرسو", isDefault: true },
    { name: "Cappuccino", faName: "کاپوچینو" },
    { name: "Café Latte", faName: "کافه لاته" },
    { name: "English Breakfast Tea", faName: "چای صبحانه انگلیسی" },
    { name: "Hot Chocolate", faName: "شکلات داغ", priceDelta: 4 * R },
  ],
};
const viennoiserie = {
  name: "Choose your viennoiserie",
  faName: "شیرینی وینیازری را انتخاب کنید",
  required: true,
  minSelect: 1,
  maxSelect: 1,
  options: [
    { name: "Butter Croissant", faName: "کروسان کره‌ای", isDefault: true },
    { name: "Pain au Chocolat", faName: "پن او شکلا" },
    { name: "Pain aux Raisins", faName: "پن او کشمش" },
    { name: "Almond Croissant", faName: "کروسان بادامی", priceDelta: 5 * R },
  ],
};
const eggStyle = {
  name: "How would you like your eggs?",
  faName: "تخم‌مرغ را چطور می‌خواهید؟",
  required: true,
  minSelect: 1,
  maxSelect: 1,
  options: [
    { name: "Sunny side up", faName: "نیمرو", isDefault: true },
    { name: "Scrambled", faName: "تخم‌مرغ هم‌زده" },
    { name: "Poached", faName: "تخم‌مرغ آب‌پز سبک" },
    { name: "Omelette", faName: "املت" },
  ],
};
const extras = {
  name: "Add extras",
  faName: "افزودنی‌ها",
  minSelect: 0,
  maxSelect: 5,
  options: [
    { name: "Smoked Salmon", faName: "سالمون دودی", priceDelta: 18 * R },
    { name: "Avocado", faName: "آووکادو", priceDelta: 12 * R },
    { name: "Turkey Bacon", faName: "بیکن بوقلمون", priceDelta: 10 * R },
    { name: "Extra Egg", faName: "تخم‌مرغ اضافه", priceDelta: 6 * R },
    { name: "Sautéed Mushrooms", faName: "قارچ سوته", priceDelta: 8 * R },
  ],
};

const paulMenus: SeedMenu[] = [
  {
    name: "BREAKFAST MENU",
    imageUrl: `${CDN}/372608/mo9oxuh0998qeolnyln_Eggs%20Benedict%20Salmon.jpg`,
    categories: [
      {
        name: "Breakfast Combo",
        faName: "صبحانه ترکیبی",
        items: [
          {
            name: "Parisien",
            faName: "پاریسیان",
            description:
              "1 hot beverage + 1 viennoiserie of your choice, ½ flûte à l'ancienne, butter & jam.",
            faDescription: "یک نوشیدنی گرم + یک شیرینی وینیازری به انتخاب شما، نان باگت، کره و مربا.",
            price: 62 * R,
            tags: ["popular"],
            modifierGroups: [hotBeverage, viennoiserie],
          },
          {
            name: "Continental",
            faName: "کانتیننتال",
            description:
              "1 hot beverage + 1 fresh orange juice + 1 viennoiserie of your choice + ½ flûte à l'ancienne, butter & jam.",
            faDescription: "یک نوشیدنی گرم + آب پرتقال تازه + یک شیرینی وینیازری + نان باگت، کره و مربا.",
            price: 72 * R,
            modifierGroups: [hotBeverage, viennoiserie],
          },
          {
            name: "Complete",
            faName: "کامل",
            description:
              "1 hot beverage + 1 fresh orange juice + 1 viennoiserie + ½ flûte à l'ancienne + 2 eggs any style, butter & jam.",
            faDescription: "یک نوشیدنی گرم + آب پرتقال + شیرینی وینیازری + باگت + ۲ تخم‌مرغ، کره و مربا.",
            price: 88 * R,
            tags: ["chef-special"],
            modifierGroups: [hotBeverage, viennoiserie, eggStyle],
          },
        ],
      },
      {
        name: "Eggs & Omelettes",
        faName: "تخم‌مرغ و املت",
        items: [
          {
            name: "Eggs Benedict Salmon",
            faName: "تخم‌مرغ بندیکت با سالمون",
            description:
              "Two poached eggs, smoked salmon, hollandaise sauce on a toasted muffin with hash brown.",
            faDescription: "دو تخم‌مرغ آب‌پز، سالمون دودی، سس هولندز روی ماففین تست‌شده با هش براون.",
            price: 58 * R,
            imageUrl: `${CDN}/372608/mo9oxuh0998qeolnyln_Eggs%20Benedict%20Salmon.jpg`,
            tags: ["popular"],
            calories: 540,
            modifierGroups: [extras],
          },
          {
            name: "Eggs Benedict Turkey Ham",
            faName: "تخم‌مرغ بندیکت با بوقلمون",
            description:
              "Two poached eggs, turkey ham, hollandaise sauce on a toasted muffin with hash brown.",
            faDescription: "دو تخم‌مرغ آب‌پز، ژامبون بوقلمون، سس هولندز روی ماففین تست‌شده با هش براون.",
            price: 52 * R,
            tags: ["halal"],
            modifierGroups: [extras],
          },
          {
            name: "Three Egg Omelette",
            faName: "املت سه تخم‌مرغ",
            description:
              "Fluffy three-egg omelette with your choice of fillings, served with mixed greens.",
            faDescription: "املت پف‌دار با سه تخم‌مرغ و مواد میانی به انتخاب شما، سرو شده با سبزیجات.",
            price: 46 * R,
            modifierGroups: [
              {
                name: "Choose fillings",
                faName: "انتخاب مواد میانی",
                minSelect: 0,
                maxSelect: 4,
                options: [
                  { name: "Cheese", faName: "پنیر", isDefault: true },
                  { name: "Mushroom", faName: "قارچ" },
                  { name: "Tomato", faName: "گوجه‌فرنگی" },
                  { name: "Spinach", faName: "اسفناج" },
                  { name: "Turkey Ham", faName: "ژامبون بوقلمون", priceDelta: 6 * R },
                ],
              },
            ],
          },
          {
            name: "Shakshuka",
            faName: "شکشوکا",
            description:
              "Baked eggs in spiced tomato & pepper sauce, served with flûte à l'ancienne.",
            faDescription: "تخم‌مرغ پخته در سس گوجه و فلفل ادویه‌دار، سرو شده با نان باگت.",
            price: 48 * R,
            tags: ["vegetarian", "spicy"],
          },
        ],
      },
      {
        name: "Sandwiches & Toasts",
        faName: "ساندویچ و توست",
        items: [
          {
            name: "Avocado Toast",
            faName: "توست آووکادو",
            description:
              "Smashed avocado, poached egg, cherry tomatoes, dukkah on multigrain sourdough.",
            faDescription: "آووکادو له‌شده، تخم‌مرغ آب‌پز، گوجه گیلاسی و دوکا روی نان خمیرترش.",
            price: 44 * R,
            tags: ["vegetarian", "popular"],
            imageUrl: UNS("photo-1588137378633-dea1336ce1e2"),
            modifierGroups: [extras],
          },
          {
            name: "Croque Monsieur",
            faName: "کروک مسیو",
            description:
              "Toasted brioche, turkey ham, béchamel & gruyère cheese gratiné.",
            faDescription: "بریوش تست‌شده، ژامبون بوقلمون، سس بشامل و پنیر گرویر.",
            price: 42 * R,
          },
          {
            name: "Croque Madame",
            faName: "کروک مادام",
            description: "Croque Monsieur topped with a sunny-side-up egg.",
            faDescription: "کروک مسیو با یک تخم‌مرغ نیمرو روی آن.",
            price: 46 * R,
          },
        ],
      },
      {
        name: "French Toast & Açaí",
        faName: "فرنچ توست و آسائی",
        items: [
          {
            name: "Pain Perdu",
            faName: "فرنچ توست",
            description:
              "Brioche French toast, caramelised, with fresh berries & vanilla ice cream.",
            faDescription: "فرنچ توست بریوش کارامله‌شده با توت تازه و بستنی وانیلی.",
            price: 45 * R,
            imageUrl: `${CDN}/377374/moh4c5mq8gc97jlt4p_Pain%20Perdu.jpg`,
            tags: ["popular", "vegetarian"],
            calories: 620,
          },
          {
            name: "Açaí Bowl",
            faName: "کاسه آسائی",
            description:
              "Açaí blend topped with granola, banana, strawberries & honey.",
            faDescription: "پوره آسائی با گرانولا، موز، توت‌فرنگی و عسل.",
            price: 48 * R,
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
        faName: "برانچ تمام روز",
        items: [
          {
            name: "Smashed Avocado & Eggs",
            faName: "آووکادو له‌شده با تخم‌مرغ",
            description:
              "Sourdough, smashed avocado, two poached eggs, feta & chilli flakes.",
            faDescription: "نان خمیرترش، آووکادو له‌شده، دو تخم‌مرغ آب‌پز، پنیر فتا و فلفل تند.",
            price: 49 * R,
            tags: ["vegetarian"],
          },
          {
            name: "Salmon & Scrambled Eggs",
            faName: "سالمون با تخم‌مرغ همزده",
            description:
              "Creamy scrambled eggs, smoked salmon, chives on toasted sourdough.",
            faDescription: "تخم‌مرغ همزده خامه‌ای، سالمون دودی و پیازچه روی نان خمیرترش.",
            price: 56 * R,
            tags: ["popular"],
          },
        ],
      },
      {
        name: "Appetizers & Soups",
        faName: "پیش‌غذا و سوپ",
        items: [
          {
            name: "French Onion Soup",
            faName: "سوپ پیاز فرانسوی",
            description:
              "Slow-cooked onions, beef broth, gruyère crouton gratiné.",
            faDescription: "پیاز آرام‌پخته در آبگوشت گاو با کروتون پنیر گرویر.",
            price: 38 * R,
            imageUrl: UNS("photo-1547592166-23ac45744acd"),
          },
          {
            name: "Burrata & Heirloom Tomato",
            faName: "بوراتا با گوجه فرنگی",
            description:
              "Creamy burrata, heirloom tomatoes, basil pesto & aged balsamic.",
            faDescription: "بوراتای خامه‌ای، گوجه فرنگی، پستوی ریحان و سرکه بالزامیک.",
            price: 52 * R,
            tags: ["vegetarian", "chef-special"],
          },
          {
            name: "Soup of the Day",
            faName: "سوپ روز",
            description: "Ask your server — served with warm bread.",
            faDescription: "از سرویردهنده بپرسید — سرو شده با نان گرم.",
            price: 32 * R,
            tags: ["vegetarian"],
          },
        ],
      },
      {
        name: "Sandwiches",
        faName: "ساندویچ‌ها",
        items: [
          {
            name: "Le Parisien Baguette",
            faName: "باگت پاریسیان",
            description:
              "Flûte à l'ancienne, turkey ham, emmental, butter & cornichons.",
            faDescription: "باگت سنتی، ژامبون بوقلمون، پنیر امنتال، کره و خیارشور فرانسوی.",
            price: 42 * R,
          },
          {
            name: "Tuna Niçoise Baguette",
            faName: "باگت تونا نیسواز",
            description: "Tuna, egg, olives, tomato & lettuce on baguette.",
            faDescription: "ماهی تون، تخم‌مرغ، زیتون، گوجه و کاهو روی باگت.",
            price: 44 * R,
          },
        ],
      },
      {
        name: "Clubs & Burgers",
        faName: "کلاب ساندویچ و برگر",
        items: [
          {
            name: "Paul Club Sandwich",
            faName: "کلاب ساندویچ پل",
            description:
              "Triple-decker with grilled chicken, turkey bacon, egg, tomato & fries.",
            faDescription: "ساندویچ سه‌طبقه با مرغ گریل، بیکن بوقلمون، تخم‌مرغ، گوجه و سیب‌زمینی.",
            price: 58 * R,
            tags: ["popular"],
            imageUrl: UNS("photo-1528735602780-2552fd46c7af"),
            modifierGroups: [
              {
                name: "Choice of side",
                faName: "انتخاب پیش‌غذا",
                required: true,
                minSelect: 1,
                maxSelect: 1,
                options: [
                  { name: "French Fries", faName: "سیب‌زمینی سرخ‌کرده", isDefault: true },
                  { name: "Mixed Salad", faName: "سالاد مخلوط" },
                  { name: "Sweet Potato Fries", faName: "سیب‌زمینی شیرین سرخ‌شده", priceDelta: 6 * R },
                ],
              },
            ],
          },
          {
            name: "Wagyu Beef Burger",
            faName: "برگر واگیو",
            description:
              "Wagyu patty, cheddar, caramelised onion, brioche bun & fries.",
            faDescription: "پتی واگیو، پنیر چدار، پیاز کارامله، نان بریوش و سیب‌زمینی.",
            price: 72 * R,
            tags: ["chef-special"],
            modifierGroups: [
              {
                name: "Add-ons",
                faName: "افزودنی‌ها",
                minSelect: 0,
                maxSelect: 3,
                options: [
                  { name: "Extra Cheese", faName: "پنیر اضافه", priceDelta: 6 * R },
                  { name: "Turkey Bacon", faName: "بیکن بوقلمون", priceDelta: 10 * R },
                  { name: "Fried Egg", faName: "تخم‌مرغ سرخ‌شده", priceDelta: 6 * R },
                ],
              },
            ],
          },
        ],
      },
      {
        name: "Salads",
        faName: "سالادها",
        items: [
          {
            name: "Niçoise Salad",
            faName: "سالاد نیسواز",
            description:
              "Seared tuna, green beans, egg, potato, olives & vinaigrette.",
            faDescription: "ماهی تون سرخ‌شده، لوبیا سبز، تخم‌مرغ، سیب‌زمینی، زیتون و سس وینیگرت.",
            price: 54 * R,
          },
          {
            name: "Quinoa & Avocado Salad",
            faName: "سالاد کینوا و آووکادو",
            description: "Quinoa, avocado, pomegranate, almonds & lemon dressing.",
            faDescription: "کینوا، آووکادو، انار، بادام و سس لیمو.",
            price: 48 * R,
            tags: ["vegan", "gluten-free"],
          },
        ],
      },
      {
        name: "Pasta & Risotto",
        faName: "پاستا و ریزوتو",
        items: [
          {
            name: "Truffle Mushroom Risotto",
            faName: "ریزوتو قارچ و ترافل",
            description: "Arborio rice, wild mushrooms, parmesan & truffle oil.",
            faDescription: "برنج آربوریو، قارچ وحشی، پنیر پارمزان و روغن ترافل.",
            price: 62 * R,
            tags: ["vegetarian", "chef-special"],
          },
          {
            name: "Penne Arrabbiata",
            faName: "پنه آرابیاتا",
            description: "Penne in spicy tomato & garlic sauce, basil.",
            faDescription: "پنه در سس گوجه تند و سیر با ریحان.",
            price: 46 * R,
            tags: ["vegetarian", "spicy"],
          },
        ],
      },
      {
        name: "French Traditional",
        faName: "غذاهای سنتی فرانسوی",
        items: [
          {
            name: "Entrecôte Steak Frites",
            faName: "استیک آنتره‌کوت با سیب‌زمینی",
            description:
              "Grilled ribeye, café de Paris butter, golden fries & green salad.",
            faDescription: "ریب‌آی گریل‌شده، کره کافه دو پاری، سیب‌زمینی طلایی و سالاد سبز.",
            price: 96 * R,
            imageUrl: `${CDN}/372604/mo9oanvaspd80xtxea8_Entrecote%20Steak%20Frites.jpg`,
            tags: ["popular", "chef-special"],
            calories: 820,
            modifierGroups: [
              {
                name: "How would you like it cooked?",
                faName: "سطح پخت گوشت را انتخاب کنید",
                required: true,
                minSelect: 1,
                maxSelect: 1,
                options: [
                  { name: "Medium Rare", faName: "مدیوم ریر", isDefault: true },
                  { name: "Medium", faName: "مدیوم" },
                  { name: "Well Done", faName: "خوب‌پخته" },
                ],
              },
            ],
          },
          {
            name: "Coq au Vin",
            faName: "خورش مرغ با شراب",
            description: "Braised chicken, mushrooms, pearl onions in red wine jus.",
            faDescription: "مرغ آرام‌پخته با قارچ و پیاز مروارید در عصاره شراب قرمز.",
            price: 68 * R,
          },
        ],
      },
      {
        name: "More Mains",
        faName: "غذاهای اصلی",
        items: [
          {
            name: "Grilled Salmon Fillet",
            faName: "فیله سالمون گریل",
            description: "Salmon, sautéed vegetables, lemon butter sauce.",
            faDescription: "سالمون گریل‌شده با سبزیجات سرخ‌شده و سس کره لیمو.",
            price: 78 * R,
            tags: ["gluten-free"],
          },
          {
            name: "Roasted Chicken Supreme",
            faName: "مرغ بریان",
            description: "Free-range chicken, mashed potato, mushroom sauce.",
            faDescription: "مرغ آزادگردش با پوره سیب‌زمینی و سس قارچ.",
            price: 64 * R,
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
        faName: "شیرینی و دسر",
        items: [
          {
            name: "Tarte au Citron",
            faName: "تارت لیمو",
            description: "Classic lemon tart with torched meringue.",
            faDescription: "تارت لیمو کلاسیک با مرنگ شعله‌کشیده.",
            price: 36 * R,
            tags: ["vegetarian"],
          },
          {
            name: "Mille-Feuille",
            faName: "میل‌فوی",
            description: "Layered puff pastry, vanilla crème pâtissière.",
            faDescription: "لایه‌های خمیر هزارلا با کاسترد وانیل.",
            price: 38 * R,
            tags: ["popular", "vegetarian"],
          },
          {
            name: "Éclair au Chocolat",
            faName: "اکلر شکلاتی",
            description: "Choux pastry, chocolate cream, chocolate glaze.",
            faDescription: "خمیر شو با کرم شکلاتی و روکش شکلات.",
            price: 28 * R,
            tags: ["vegetarian"],
          },
          {
            name: "Crème Brûlée",
            faName: "کرم بروله",
            description: "Vanilla custard with caramelised sugar crust.",
            faDescription: "کاسترد وانیل با پوسته قند کارامله.",
            price: 34 * R,
            tags: ["vegetarian", "gluten-free"],
          },
        ],
      },
      {
        name: "Cakes & Sweets",
        faName: "کیک و شیرینی",
        items: [
          {
            name: "Fondant au Chocolat",
            faName: "فوندان شکلاتی",
            description: "Warm molten chocolate cake, vanilla ice cream.",
            faDescription: "کیک شکلاتی گرم با مرکز مذاب، سرو شده با بستنی وانیلی.",
            price: 42 * R,
            tags: ["popular", "vegetarian"],
            imageUrl: UNS("photo-1606313564200-e75d5e30476c"),
          },
          {
            name: "Macarons (Box of 6)",
            faName: "ماکارون (جعبه ۶ تایی)",
            description: "Assorted French macarons.",
            faDescription: "ماکارون‌های فرانسوی متنوع.",
            price: 48 * R,
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
        faName: "قهوه داغ",
        items: [
          {
            name: "Caramel Cappuccino",
            faName: "کاپوچینو کارامل",
            description: "Espresso, steamed milk, caramel drizzle.",
            faDescription: "اسپرسو، شیر بخار و سرریز کارامل.",
            price: 26 * R,
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
                  { name: "Oat Milk", priceDelta: 4 * R },
                  { name: "Almond Milk", priceDelta: 4 * R },
                ],
              },
              {
                name: "Size",
                required: true,
                minSelect: 1,
                maxSelect: 1,
                options: [
                  { name: "Regular", isDefault: true },
                  { name: "Large", priceDelta: 5 * R },
                ],
              },
            ],
          },
          {
            name: "Espresso",
            faName: "اسپرسو",
            description: "Single / double shot.",
            faDescription: "شات تکی یا دوبل.",
            price: 16 * R,
          },
          {
            name: "Café Latte",
            faName: "کافه لاته",
            description: "Espresso with steamed milk.",
            faDescription: "اسپرسو با شیر بخارپز.",
            price: 24 * R,
          },
          {
            name: "Flat White",
            faName: "فلت وایت",
            description: "Double ristretto, microfoam.",
            faDescription: "دبل ریسترتو با میکروفوم.",
            price: 24 * R,
          },
        ],
      },
      {
        name: "Cold Drinks",
        faName: "نوشیدنی سرد",
        items: [
          {
            name: "Fresh Orange Juice",
            faName: "آب پرتقال تازه",
            description: "Freshly squeezed.",
            faDescription: "تازه‌فشرده‌شده.",
            price: 28 * R,
            tags: ["vegan"],
          },
          {
            name: "Iced Latte",
            faName: "آیس لاته",
            description: "Espresso over ice & milk.",
            faDescription: "اسپرسو روی یخ و شیر.",
            price: 26 * R,
          },
          {
            name: "Lemonade Mint",
            faName: "لیموناد نعناع",
            description: "Fresh lemon, mint & soda.",
            faDescription: "لیمو تازه، نعناع و سودا.",
            price: 24 * R,
            tags: ["vegan"],
          },
          {
            name: "Still / Sparkling Water",
            faName: "آب معدنی",
            price: 12 * R,
          },
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
        faName: "جعبه‌های اشتراکی",
        items: [
          {
            name: "Le Petit Box",
            faName: "جعبه کوچک",
            description:
              "Assorted mini sandwiches, viennoiseries & macarons. Serves 2-3.",
            faDescription: "ساندویچ‌های مینی متنوع، وینیازری و ماکارون. برای ۲ تا ۳ نفر.",
            price: 145 * R,
            tags: ["popular"],
          },
          {
            name: "Le Grand Box",
            faName: "جعبه بزرگ",
            description:
              "Sandwiches, quiches, salads, pastries & juices. Serves 4-6.",
            faDescription: "ساندویچ، کیش، سالاد، شیرینی و آبمیوه. برای ۴ تا ۶ نفر.",
            price: 280 * R,
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
      if (cat.faName) {
        await db.categoryTranslation.create({
          data: { categoryId: createdCat.id, locale: "fa", name: cat.faName },
        });
      }
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
          },
        });
        if (it.faName) {
          await db.menuItemTranslation.create({
            data: {
              menuItemId: createdItem.id,
              locale: "fa",
              name: it.faName,
              description: it.faDescription,
            },
          });
        }
        for (let gi = 0; gi < (it.modifierGroups ?? []).length; gi++) {
          const g = it.modifierGroups![gi];
          const createdGroup = await db.modifierGroup.create({
            data: {
              itemId: createdItem.id,
              name: g.name,
              required: g.required ?? false,
              minSelect: g.minSelect ?? 0,
              maxSelect: g.maxSelect ?? 1,
              sortOrder: gi,
            },
          });
          if (g.faName) {
            await db.modifierGroupTranslation.create({
              data: { modifierGroupId: createdGroup.id, locale: "fa", name: g.faName },
            });
          }
          for (let oi = 0; oi < g.options.length; oi++) {
            const o = g.options[oi];
            const createdOption = await db.modifierOption.create({
              data: {
                groupId: createdGroup.id,
                name: o.name,
                priceDelta: BigInt(o.priceDelta ?? 0),
                isDefault: o.isDefault ?? false,
                sortOrder: oi,
              },
            });
            if (o.faName) {
              await db.modifierOptionTranslation.create({
                data: { modifierOptionId: createdOption.id, locale: "fa", name: o.faName },
              });
            }
          }
        }
        createdItems.push({
          id: createdItem.id,
          price: it.price,
          name: it.name,
        });
      }
    }
  }

  // Tables with QR passcodes
  const usedPublicIds = new Set<string>();
  const tables = [];
  const areas = ["Main Hall", "Terrace", "Main Hall", "Window", "Terrace"];
  for (let t = 1; t <= 12; t++) {
    let publicId = generateSeedPublicId();
    while (usedPublicIds.has(publicId)) {
      publicId = generateSeedPublicId();
    }
    usedPublicIds.add(publicId);

    const table = await db.diningTable.create({
      data: {
        vendorId: vendor.id,
        code: String(t),
        label: `Table ${t}`,
        passcode: randomTablePasscode(),
        publicId,
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
        orderNumber: `Q-${String(offset + o + 1).padStart(6, "0")}`,
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

  await db.vendor.update({
    where: { id: vendorId },
    data: { vendorOrderSeq: offset + 24 },
  });
}

async function main() {
  console.log("🌱 Seeding…");
  await db.auditLog.deleteMany();
  await db.opsQueueEntry.deleteMany();
  await db.walletTransaction.deleteMany();
  await db.platformWallet.deleteMany();
  await db.review.deleteMany();
  await db.payment.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.modifierOptionTranslation.deleteMany();
  await db.modifierOption.deleteMany();
  await db.modifierGroupTranslation.deleteMany();
  await db.modifierGroup.deleteMany();
  await db.menuItemTranslation.deleteMany();
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
    const password = SEED_STAFF_PASSWORD_OVERRIDE ?? randomStaffPassword();
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
  console.log(
    SEED_STAFF_PASSWORD_OVERRIDE
      ? "   Staff credentials (SEED_STAFF_PASSWORD override):"
      : "   Generated staff credentials (shown once — copy them now):"
  );
  for (const { email, password } of generatedCredentials) {
    console.log(`     ${email}  ${password}`);
  }
  for (const { email } of demoStaff) {
    console.log(`     ${email}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
