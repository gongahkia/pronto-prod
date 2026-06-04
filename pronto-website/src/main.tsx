import React from "react";
import ReactDOM from "react-dom/client";
import {
  ArrowLeft,
  ArrowRight,
  Braces,
  CalendarClock,
  Camera,
  Check,
  CheckCheck,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  DatabaseZap,
  FileCheck2,
  Languages,
  MessageCircle,
  Mic,
  MoreVertical,
  Paperclip,
  Phone,
  PlugZap,
  ShieldCheck,
  Smile,
  Sparkles,
  Video,
  Workflow,
} from "lucide-react";
import { Logos3, type Logo } from "./components/ui/Logos3";
import "./styles.css";

// TODO: replace this mock Calendly URL with Pronto's real discovery-call link.
const BOOK_CALL_URL = "https://calendly.com/pronto-team/discovery-call";
const LANGUAGE_STORAGE_KEY = "pronto-language";
const HERO_CHANNEL_IDS = ["whatsapp", "telegram", "instagram"] as const;

type LanguageKey = "en" | "zh" | "ms" | "ta";
type HeroChannelId = (typeof HERO_CHANNEL_IDS)[number];
type LogoId =
  | "whatsapp"
  | "telegram"
  | "email"
  | "messenger"
  | "instagram"
  | "google-calendar"
  | "calendly"
  | "shopify"
  | "woocommerce"
  | "delivery-tracking"
  | "inventory-api"
  | "crm"
  | "custom-api";

interface SiteCopy {
  cta: { bookShort: string; bookDiscovery: string; viewPricing: string; scopeTogether: string };
  languageLabel: string;
  proofAria: string;
  hero: { eyebrow: string; title: string; lede: string; actionsAria: string; actionLabel: string };
  chat: {
    aria: string;
    contact: string;
    account: string;
    today: string;
    secure: string;
    customer: string;
    typing: string;
    agent: string;
    compose: string;
  };
  stats: Array<{ value: string; label: string }>;
  sections: {
    problem: { eyebrow: string; title: string; body: string };
    fit: { eyebrow: string; title: string; body: string };
    channels: { eyebrow: string; title: string; body: string };
    process: { eyebrow: string; title: string; body: string };
    comparison: { eyebrow: string; title: string; body: string; aria: string; headers: [string, string, string] };
    pricing: { eyebrow: string; title: string; body: string };
    team: { eyebrow: string; title: string; body: string };
    faq: { eyebrow: string; title: string; body: string };
  };
  problemCards: Array<{ title: string; body: string }>;
  fitCards: Array<{ label: string; title: string; body: string }>;
  offer: { eyebrow: string; title: string; body: string; proofs: string[] };
  capabilities: Array<{ title: string; body: string }>;
  logoDescriptions: Record<LogoId, string>;
  logosHeading: string;
  matrix: { customerChannels: string; businessSystems: string };
  processSteps: Array<{ title: string; eyebrow: string; body: string }>;
  comparisonRows: Array<{ point: string; diy: string; pronto: string }>;
  setupOffers: Array<{ title: string; price: string; body: string }>;
  pricingTiers: Array<{ name: string; price: string; cadence: string; summary: string; highlight: boolean; features: string[] }>;
  pricingLabels: { featured: string; enterpriseName: string; enterpriseSummary: string; enterprisePrice: string };
  faqs: Array<{ question: string; answer: string }>;
  finalCta: { eyebrow: string; title: string };
  footer: { tagline: string; links: { offer: string; pricing: string; team: string; book: string } };
}

const LANGUAGES: Array<{ key: LanguageKey; label: string }> = [
  { key: "en", label: "English" },
  { key: "zh", label: "中文" },
  { key: "ms", label: "Bahasa Melayu" },
  { key: "ta", label: "தமிழ்" },
];

const channelLogoBase: Array<{ id: LogoId; image: string }> = [
  { id: "whatsapp", image: "/logos/whatsapp.png" },
  { id: "telegram", image: "/logos/telegram.png" },
  { id: "email", image: "/logos/email.png" },
  { id: "messenger", image: "/logos/messenger.png" },
  { id: "instagram", image: "/logos/instagram.png" },
];

const integrationLogoBase: Array<{ id: LogoId; image: string }> = [
  { id: "google-calendar", image: "/logos/google-calendar.png" },
  { id: "calendly", image: "/logos/calendly.png" },
  { id: "shopify", image: "/logos/shopify.png" },
  { id: "woocommerce", image: "/logos/woocommerce.png" },
  { id: "delivery-tracking", image: "/logos/delivery-tracking.png" },
  { id: "inventory-api", image: "/logos/inventory-api.png" },
  { id: "crm", image: "/logos/crm.png" },
  { id: "custom-api", image: "/logos/custom-api.png" },
];

const capabilityIcons = [DatabaseZap, Sparkles, MessageCircle, PlugZap];

function isHeroChannelId(id: string): id is HeroChannelId {
  return HERO_CHANNEL_IDS.includes(id as HeroChannelId);
}

const CONTENT: Record<LanguageKey, SiteCopy> = {
  en: {
    cta: { bookShort: "Book a call", bookDiscovery: "Book a discovery call", viewPricing: "View pricing", scopeTogether: "Scope together" },
    languageLabel: "Language",
    proofAria: "Pronto proof points",
    hero: {
      eyebrow: "Singapore SMEs. Real customer channels. No DIY setup.",
      title: "The AI front desk for every customer.",
      lede: "Pronto builds, deploys, and maintains custom customer service agents that answer from your verified sources, in your brand voice, across the channels your customers already use.",
      actionsAria: "Primary actions",
      actionLabel: "20-30 min discovery call",
    },
    chat: {
      aria: "Animated WhatsApp-style Pronto customer service flow",
      contact: "Pronto agent",
      account: "Business Account",
      today: "TODAY",
      secure: "This business uses Pronto to manage this chat.",
      customer: "Can I get this delivered by Friday? Also is walnut in stock?",
      typing: "Pronto is typing",
      agent: "Walnut is available. Friday delivery is possible for orders confirmed before 2PM today.",
      compose: "Message",
    },
    stats: [
      { value: "<1 week", label: "target launch after scope is locked" },
      { value: "4 languages", label: "English, Mandarin, Bahasa Melayu, Tamil, and SG code-switching" },
      { value: "0 guesses", label: "answers only from verified sources or escalates" },
    ],
    sections: {
      problem: {
        eyebrow: "The problem",
        title: "Customer service is high-volume work that rarely gets leverage.",
        body: "Hiring more people is expensive. Doing nothing loses conversions. DIY platforms still leave the setup, maintenance, and quality risk with the business.",
      },
      fit: {
        eyebrow: "Who it is for",
        title: "Built for owner-operated teams where reply speed changes revenue.",
        body: "The first customers should have repeated questions, real source material, and enough enquiry volume that fast, accurate answers matter.",
      },
      channels: {
        eyebrow: "Channels and integrations",
        title: "Pronto fits into the workflow your customers and staff already use.",
        body: "The first launch stays scoped, then additional channels and integrations can be added as volume and operational needs grow.",
      },
      process: {
        eyebrow: "How launch works",
        title: "A practical path from first conversation to live agent.",
        body: "The process is designed to qualify fit, lock scope, stress-test the agent, and avoid pushing an unreliable system into production.",
      },
      comparison: {
        eyebrow: "Why Pronto",
        title: "Not a DIY chatbot subscription. A managed customer service layer.",
        body: "The market already has tools. Pronto is for businesses that want the outcome without becoming the implementation team.",
        aria: "DIY chatbot platforms compared with Pronto",
        headers: ["Decision point", "Typical DIY platform", "Pronto"],
      },
      pricing: {
        eyebrow: "Pricing",
        title: "Transparent tiers, no per-message meter.",
        body: "Flat setup covers the build. Monthly retainers scale with conversation volume and support expectations, so clients can budget without unpredictable usage spikes.",
      },
      team: {
        eyebrow: "Solv3d",
        title: "Brought to you by the Team who made Solv3d.",
        body: "The same Singapore-based team behind Solv3d stays close to Pronto's client fit, technical implementation, and customer-facing AI governance.",
      },
      faq: {
        eyebrow: "FAQ",
        title: "Enough clarity to decide whether a call is worth it.",
        body: "The first conversation should confirm fit and scope, not push a business into a tool it has to manage.",
      },
    },
    problemCards: [
      { title: "Repeated questions drain the day", body: "Opening hours, stock checks, delivery timelines, refunds, reservations, and policy questions keep landing across the same few channels." },
      { title: "Slow replies quietly lose revenue", body: "For owner-operated SMEs, a missed or late answer can decide whether a customer books, buys, or moves on to another business." },
      { title: "DIY tools still need a technical owner", body: "Most chatbot platforms make the business configure flows, clean content, connect data, monitor quality, and maintain the agent." },
    ],
    fitCards: [
      { label: "F&B operators", title: "Reservations, hours, availability, last-minute questions.", body: "Best for lean teams where every fast answer can turn into a booking, table, pickup, or delivery order." },
      { label: "E-commerce and DTC", title: "Stock, delivery, returns, sizing, product fit.", body: "Useful when product and fulfilment data already exists but customer answers are still scattered across messages." },
      { label: "Clinics", title: "Opening hours, appointment rules, queues, intake basics.", body: "Scoped to operational questions only, with sensitive medical, legal, or complaint-like messages escalated immediately." },
      { label: "Carousell and Shopee sellers", title: "Repeated pre-sale questions across high-intent chats.", body: "For sellers who lose deals when they cannot reply quickly enough while still running the rest of the business." },
    ],
    offer: {
      eyebrow: "The offer",
      title: "We sell the finished experience, not another platform to manage.",
      body: "Pronto owns the build end-to-end: source mapping, data ingestion, brand voice configuration, channel deployment, confidence checks, and ongoing maintenance.",
      proofs: ["Done-for-you setup", "Founder-led scoping", "Multilingual from day one"],
    },
    capabilities: [
      { title: "Trained on your real sources", body: "Website content, FAQs, product catalogues, refund policies, booking rules, delivery information, and uploaded guidelines." },
      { title: "Configured in your brand voice", body: "We extract tone from your existing content and encode the patterns, vocabulary, limits, and examples into the agent." },
      { title: "Deployed where customers already are", body: "Priority customer channels first, with additional DM and inbox surfaces ready as follow-on channels." },
      { title: "Connected to live systems", body: "Calendars, storefronts, delivery tracking, inventory databases, internal CRMs, and custom APIs where scope supports it." },
    ],
    logoDescriptions: {
      whatsapp: "WhatsApp",
      telegram: "Telegram",
      email: "Email",
      messenger: "Messenger",
      instagram: "Instagram DMs",
      "google-calendar": "Google Calendar",
      calendly: "Calendly",
      shopify: "Shopify",
      woocommerce: "WooCommerce",
      "delivery-tracking": "Delivery tracking",
      "inventory-api": "Inventory APIs",
      crm: "CRM systems",
      "custom-api": "Custom APIs",
    },
    logosHeading: "Launch channels and common integrations",
    matrix: { customerChannels: "Customer channels", businessSystems: "Business systems" },
    processSteps: [
      { title: "Discovery call", eyebrow: "20-30 min", body: "Map customer service pain, channel mix, query volume, and fit without forcing pricing too early." },
      { title: "Tailored proposal", eyebrow: "Scope first", body: "Define channels, data sources, integrations, timeline, and likely tier before the deeper implementation pass." },
      { title: "Deep discovery", eyebrow: "Lock scope", body: "Collect source material, brand voice examples, escalation rules, and the exact data paths the agent can trust." },
      { title: "Build and pilot", eyebrow: "Stress test", body: "Assemble the agent from Pronto's reusable core, then test it until escalation behavior and answer quality are launch-ready." },
      { title: "Launch and maintain", eyebrow: "Ongoing", body: "Ramp onto live customer traffic, review performance, refresh knowledge, and keep the system current as the business changes." },
    ],
    comparisonRows: [
      { point: "Setup burden", diy: "The owner or ops lead has to configure flows, prompts, data, and handoffs.", pronto: "Pronto scopes, builds, tests, and launches the agent for the business." },
      { point: "Answer quality", diy: "Often starts as a website crawler or FAQ bot with limited operational context.", pronto: "Static sources, live systems, brand voice rules, and escalation logic are mapped together." },
      { point: "When unsure", diy: "Many bots still try to be helpful and create brand-risky answers.", pronto: "The agent escalates with the question, context, and reason it needs a human." },
      { point: "Maintenance", diy: "The business owns tuning, monitoring, analytics, and content refreshes.", pronto: "Knowledge refreshes, performance review, bug fixes, and check-ins sit inside the retainer." },
    ],
    setupOffers: [
      { title: "Standard build", price: "SGD 2,500", body: "1-2 channels, FAQ coverage, and 1-2 practical integrations." },
      { title: "Custom build", price: "SGD 5,000+", body: "More channels, deeper integrations, stricter voice needs, or complex scope." },
      { title: "Scoped trial", price: "SGD 500", body: "2-4 week paid trial, credited toward setup if converted." },
    ],
    pricingTiers: [
      { name: "Starter", price: "SGD 200", cadence: "/month", summary: "For one main customer channel and predictable FAQ volume.", highlight: false, features: ["Up to 500 conversations/month", "1 channel", "Monthly check-in", "24h business-hours SLA"] },
      { name: "Growth", price: "SGD 500", cadence: "/month", summary: "For SMEs with higher enquiry volume and more than one active channel.", highlight: true, features: ["Up to 2,000 conversations/month", "2 channels", "Biweekly check-in", "4h business-hours SLA"] },
      { name: "Scale", price: "SGD 1,200", cadence: "/month", summary: "For busy teams that need broader coverage and tighter response support.", highlight: false, features: ["Up to 6,000 conversations/month", "All channels", "Weekly check-in", "1h business-hours SLA"] },
    ],
    pricingLabels: {
      featured: "Common fit",
      enterpriseName: "Enterprise",
      enterpriseSummary: "For above-Scale volume, special compliance needs, or deep integration requirements.",
      enterprisePrice: "Custom",
    },
    faqs: [
      { question: "Do we need clean systems before talking to Pronto?", answer: "No. The first pass is built around the way your business already answers customers today, then we define what sources can be trusted for launch." },
      { question: "What if the agent does not know the answer?", answer: "It escalates. Pronto is designed around grounded answers and human handoff, so uncertain or sensitive questions do not become customer-facing guesses." },
      { question: "How quickly can we go live?", answer: "The target is under one week after scope is locked. Complex integrations can change that timeline, but most standard deployments should land in a few days." },
      { question: "Is this only for larger companies?", answer: "No. Pronto is aimed at Singapore SMEs with repeated customer questions and limited customer service bandwidth." },
    ],
    finalCta: {
      eyebrow: "Start with fit",
      title: "Bring your repeated customer questions. We will map what Pronto should answer, and what it should escalate.",
    },
    footer: {
      tagline: "Done-for-you AI customer service agents for Singapore SMEs.",
      links: { offer: "Offer", pricing: "Pricing", team: "Team", book: "Book a call" },
    },
  },
  zh: {
    cta: { bookShort: "预约通话", bookDiscovery: "预约需求沟通", viewPricing: "查看价格", scopeTogether: "一起确认范围" },
    languageLabel: "语言",
    proofAria: "Pronto 关键信息",
    hero: {
      eyebrow: "新加坡中小企业。真实客户渠道。无需自己配置。",
      title: "为每一位客户准备的 AI 前台。",
      lede: "Pronto 为企业构建、部署并维护定制 AI 客服代理。它会从经过验证的资料回答，用你的品牌语气，在客户已经使用的渠道里工作。",
      actionsAria: "主要操作",
      actionLabel: "20-30 分钟需求沟通",
    },
    chat: {
      aria: "WhatsApp 风格的 Pronto 客服流程动画",
      contact: "Pronto 代理",
      account: "企业账号",
      today: "今天",
      secure: "此商家使用 Pronto 管理这段对话。",
      customer: "这个星期五可以送到吗？胡桃木色还有货吗？",
      typing: "Pronto 正在输入",
      agent: "胡桃木色有货。今天下午 2 点前确认的订单，可以安排星期五送达。",
      compose: "消息",
    },
    stats: [
      { value: "<1 周", label: "范围确认后目标上线时间" },
      { value: "4 种语言", label: "英语、华语、马来语、泰米尔语，以及新加坡式混用" },
      { value: "0 猜测", label: "只根据验证来源回答，否则升级给人工" },
    ],
    sections: {
      problem: { eyebrow: "问题", title: "客服是高频工作，但通常很难产生杠杆。", body: "多招人很贵。完全不处理会流失转化。DIY 平台仍然把配置、维护和质量风险留给企业自己。" },
      fit: { eyebrow: "适合谁", title: "为回复速度会影响收入的老板型团队而建。", body: "最适合有重复问题、真实资料来源，并且询问量足够高、需要快速准确回复的企业。" },
      channels: { eyebrow: "渠道与集成", title: "Pronto 接入客户和员工已经在用的工作流。", body: "首次上线保持清晰范围，之后可根据需求增加渠道和系统集成。" },
      process: { eyebrow: "上线流程", title: "从第一次沟通到真实上线的务实路径。", body: "流程会先确认适配度、锁定范围、压力测试代理，避免把不可靠的系统推到客户面前。" },
      comparison: { eyebrow: "为什么选 Pronto", title: "不是 DIY 聊天机器人订阅，而是托管式客服层。", body: "市场上已经有工具。Pronto 面向想要结果、但不想自己成为实施团队的企业。", aria: "DIY 聊天机器人平台与 Pronto 对比", headers: ["决策点", "典型 DIY 平台", "Pronto"] },
      pricing: { eyebrow: "价格", title: "透明套餐，不按每条消息计费。", body: "一次性设置费覆盖构建。月费按对话量和支持要求分层，让客户可以预算，不必担心不可控的用量账单。" },
      team: { eyebrow: "Solv3d", title: "由打造 Solv3d 的团队带来。", body: "同一支新加坡 Solv3d 团队会贴近 Pronto：客户适配、技术落地，以及让面向客户的 AI 保持受控的运营规则。" },
      faq: { eyebrow: "常见问题", title: "先有足够清晰度，再决定是否值得约通话。", body: "第一次沟通应该确认适配度和范围，而不是把企业推向一个还要自己管理的工具。" },
    },
    problemCards: [
      { title: "重复问题消耗一天", body: "营业时间、库存、配送、退款、预订和政策问题，会不断出现在同几个渠道里。" },
      { title: "慢回复会悄悄丢收入", body: "对老板型中小企业来说，漏回或晚回一次，就可能决定客户是下单、预约，还是转去别家。" },
      { title: "DIY 工具仍然需要技术负责人", body: "多数聊天机器人平台仍要求企业配置流程、整理内容、连接数据、监控质量并维护代理。" },
    ],
    fitCards: [
      { label: "餐饮业者", title: "预订、营业时间、供应情况、临时问题。", body: "适合团队精简、每一个快速回复都可能转化为预订、到店、自取或外送订单的业务。" },
      { label: "电商与 DTC 品牌", title: "库存、配送、退换、尺码、产品匹配。", body: "当产品和履约资料已经存在，但客户回复仍分散在多个消息渠道时尤其有用。" },
      { label: "诊所", title: "营业时间、预约规则、排队情况、基础接待。", body: "只处理运营类问题；医疗、法律、投诉或敏感问题会立即转交人工。" },
      { label: "Carousell 与 Shopee 卖家", title: "高意向聊天里的重复售前问题。", body: "适合因为无法及时回复而错过成交机会，同时还要处理日常经营的卖家。" },
    ],
    offer: {
      eyebrow: "服务",
      title: "我们卖的是完成后的体验，而不是又一个要你管理的平台。",
      body: "Pronto 端到端负责构建：资料映射、数据导入、品牌语气、渠道部署、信心检查和持续维护。",
      proofs: ["全套代建", "创始人亲自确认范围", "第一天起支持多语言"],
    },
    capabilities: [
      { title: "基于真实资料训练", body: "网站内容、FAQ、产品目录、退款政策、预订规则、配送信息和上传指南。" },
      { title: "配置成你的品牌语气", body: "我们从现有内容提取语气，并把表达模式、词汇、边界和示例写入代理规则。" },
      { title: "部署在客户已经使用的地方", body: "先覆盖最重要的客户渠道，后续再加入其他私信和邮箱入口。" },
      { title: "连接实时业务系统", body: "日历、网店、配送追踪、库存数据库、内部 CRM 和范围允许的自定义 API。" },
    ],
    logoDescriptions: {
      whatsapp: "WhatsApp",
      telegram: "Telegram",
      email: "电子邮件",
      messenger: "Messenger",
      instagram: "Instagram 私信",
      "google-calendar": "Google Calendar",
      calendly: "Calendly",
      shopify: "Shopify",
      woocommerce: "WooCommerce",
      "delivery-tracking": "配送追踪",
      "inventory-api": "库存 API",
      crm: "CRM 系统",
      "custom-api": "自定义 API",
    },
    logosHeading: "上线渠道与常见集成",
    matrix: { customerChannels: "客户渠道", businessSystems: "业务系统" },
    processSteps: [
      { title: "需求沟通", eyebrow: "20-30 分钟", body: "了解客服痛点、渠道组合、询问量和适配度，不会过早强推价格。" },
      { title: "定制方案", eyebrow: "先定范围", body: "定义渠道、资料来源、集成、时间线和大致套餐，再进入更深的实施确认。" },
      { title: "深入发现", eyebrow: "锁定范围", body: "收集资料、品牌语气示例、升级规则，以及代理可以信任的准确数据路径。" },
      { title: "构建与试点", eyebrow: "压力测试", body: "基于 Pronto 可复用核心组装代理，并测试到升级行为和回答质量可上线。" },
      { title: "上线与维护", eyebrow: "持续支持", body: "逐步接入真实客户流量，复盘表现，更新知识，并随着业务变化保持系统可用。" },
    ],
    comparisonRows: [
      { point: "设置负担", diy: "老板或运营负责人要自己配置流程、提示词、数据和人工交接。", pronto: "Pronto 为企业确认范围、构建、测试并上线代理。" },
      { point: "回答质量", diy: "通常从网站爬虫或 FAQ bot 开始，运营上下文有限。", pronto: "静态资料、实时系统、品牌语气规则和升级逻辑会一起映射。" },
      { point: "不确定时", diy: "很多机器人仍会试图回答，产生品牌风险。", pronto: "代理会带着问题、上下文和升级原因转交人工。" },
      { point: "维护", diy: "企业自己负责调优、监控、分析和内容更新。", pronto: "知识更新、表现复盘、修复和定期跟进都包含在月费内。" },
    ],
    setupOffers: [
      { title: "标准构建", price: "SGD 2,500", body: "1-2 个渠道、FAQ 覆盖和 1-2 个实用集成。" },
      { title: "定制构建", price: "SGD 5,000+", body: "更多渠道、更深集成、更严格语气要求或复杂范围。" },
      { title: "范围化试用", price: "SGD 500", body: "2-4 周付费试用；若转为正式构建，可抵扣设置费。" },
    ],
    pricingTiers: [
      { name: "Starter", price: "SGD 200", cadence: "/月", summary: "适合一个主要客户渠道和可预测 FAQ 量。", highlight: false, features: ["每月最多 500 次对话", "1 个渠道", "每月检查", "24 小时工作时段 SLA"] },
      { name: "Growth", price: "SGD 500", cadence: "/月", summary: "适合询问量更高、且有不止一个活跃渠道的中小企业。", highlight: true, features: ["每月最多 2,000 次对话", "2 个渠道", "每两周检查", "4 小时工作时段 SLA"] },
      { name: "Scale", price: "SGD 1,200", cadence: "/月", summary: "适合需要更广覆盖和更快支持的繁忙团队。", highlight: false, features: ["每月最多 6,000 次对话", "所有渠道", "每周检查", "1 小时工作时段 SLA"] },
    ],
    pricingLabels: { featured: "常见适配", enterpriseName: "企业版", enterpriseSummary: "适合超过 Scale 量级、特殊合规或深度集成需求。", enterprisePrice: "定制" },
    faqs: [
      { question: "系统还不整洁，可以先聊 Pronto 吗？", answer: "可以。第一步会围绕企业今天实际如何回复客户来构建，然后再定义哪些资料可以作为上线来源。" },
      { question: "如果代理不知道答案怎么办？", answer: "它会升级给人工。Pronto 以有根据回答和人工交接为核心，避免不确定或敏感问题变成面向客户的猜测。" },
      { question: "多久可以上线？", answer: "范围锁定后目标是一周内。复杂集成可能改变时间线，但多数标准部署应在几天内完成。" },
      { question: "这只适合大公司吗？", answer: "不是。Pronto 面向有重复客户问题、但客服带宽有限的新加坡中小企业。" },
    ],
    finalCta: { eyebrow: "从适配开始", title: "带着你的重复客户问题来。我们会一起划清哪些该由 Pronto 回答，哪些该升级给人工。" },
    footer: { tagline: "为新加坡中小企业提供代建式 AI 客服代理。", links: { offer: "服务", pricing: "价格", team: "团队", book: "预约通话" } },
  },
  ms: {
    cta: { bookShort: "Tempah panggilan", bookDiscovery: "Tempah panggilan discovery", viewPricing: "Lihat harga", scopeTogether: "Tetapkan skop bersama" },
    languageLabel: "Bahasa",
    proofAria: "Bukti ringkas Pronto",
    hero: {
      eyebrow: "PKS Singapura. Saluran pelanggan sebenar. Tiada setup DIY.",
      title: "Kaunter hadapan AI untuk setiap pelanggan.",
      lede: "Pronto membina, melancarkan, dan menyelenggara agen khidmat pelanggan tersuai yang menjawab daripada sumber sah anda, dalam suara jenama anda, di saluran yang pelanggan sudah gunakan.",
      actionsAria: "Tindakan utama",
      actionLabel: "Panggilan discovery 20-30 min",
    },
    chat: {
      aria: "Aliran khidmat pelanggan Pronto bergaya WhatsApp yang beranimasi",
      contact: "Agen Pronto",
      account: "Akaun Perniagaan",
      today: "HARI INI",
      secure: "Perniagaan ini menggunakan Pronto untuk mengurus chat ini.",
      customer: "Boleh dihantar hari Jumaat? Stok warna walnut masih ada?",
      typing: "Pronto sedang menaip",
      agent: "Walnut masih tersedia. Penghantaran Jumaat boleh dibuat untuk pesanan yang disahkan sebelum 2PM hari ini.",
      compose: "Mesej",
    },
    stats: [
      { value: "<1 minggu", label: "sasaran pelancaran selepas skop dikunci" },
      { value: "4 bahasa", label: "Inggeris, Mandarin, Bahasa Melayu, Tamil, dan code-switching SG" },
      { value: "0 tekaan", label: "jawapan hanya daripada sumber sah atau dieskalasi" },
    ],
    sections: {
      problem: { eyebrow: "Masalah", title: "Khidmat pelanggan ialah kerja volume tinggi yang jarang memberi leverage.", body: "Mengupah lebih ramai orang mahal. Tidak bertindak boleh hilangkan jualan. Platform DIY masih meletakkan setup, maintenance, dan risiko kualiti pada perniagaan." },
      fit: { eyebrow: "Untuk siapa", title: "Dibina untuk pasukan owner-operated di mana kelajuan balasan mengubah revenue.", body: "Pelanggan awal patut ada soalan berulang, bahan sumber sebenar, dan volume pertanyaan yang cukup untuk menjadikan balasan cepat dan tepat penting." },
      channels: { eyebrow: "Saluran dan integrasi", title: "Pronto masuk ke workflow yang pelanggan dan staf sudah gunakan.", body: "Pelancaran pertama kekal terhad skopnya, kemudian saluran dan integrasi tambahan boleh ditambah apabila volume dan operasi berkembang." },
      process: { eyebrow: "Cara pelancaran", title: "Laluan praktikal daripada perbualan pertama ke agen live.", body: "Proses ini direka untuk mengesahkan fit, mengunci skop, stress-test agen, dan mengelakkan sistem tidak stabil masuk production." },
      comparison: { eyebrow: "Kenapa Pronto", title: "Bukan langganan chatbot DIY. Ini lapisan khidmat pelanggan terurus.", body: "Pasaran sudah ada banyak alat. Pronto untuk perniagaan yang mahu hasil tanpa menjadi pasukan implementasi sendiri.", aria: "Perbandingan platform chatbot DIY dengan Pronto", headers: ["Titik keputusan", "Platform DIY biasa", "Pronto"] },
      pricing: { eyebrow: "Harga", title: "Tier telus, tiada meter per mesej.", body: "Yuran setup merangkumi binaan. Retainer bulanan mengikut volume perbualan dan tahap sokongan supaya pelanggan boleh bajet tanpa spike penggunaan yang sukar diramal." },
      team: { eyebrow: "Solv3d", title: "Dibawakan oleh pasukan yang membina Solv3d.", body: "Pasukan Singapura yang sama di belakang Solv3d kekal dekat dengan Pronto: fit klien, implementasi teknikal, dan peraturan operasi yang memastikan AI pelanggan terkawal." },
      faq: { eyebrow: "FAQ", title: "Cukup jelas untuk putuskan sama ada panggilan berbaloi.", body: "Perbualan pertama patut mengesahkan fit dan skop, bukan menolak perniagaan ke alat yang perlu diurus sendiri." },
    },
    problemCards: [
      { title: "Soalan berulang menghabiskan hari", body: "Waktu operasi, stok, timeline penghantaran, refund, tempahan, dan polisi terus masuk melalui saluran yang sama." },
      { title: "Balasan lambat hilangkan revenue secara senyap", body: "Untuk PKS owner-operated, balasan terlepas atau lambat boleh menentukan sama ada pelanggan membuat tempahan, membeli, atau pergi ke pesaing." },
      { title: "Alat DIY masih perlukan pemilik teknikal", body: "Kebanyakan platform chatbot memerlukan perniagaan mengkonfigurasi flow, membersihkan kandungan, sambung data, pantau kualiti, dan maintain agen." },
    ],
    fitCards: [
      { label: "Operator F&B", title: "Tempahan, waktu operasi, ketersediaan, soalan last-minute.", body: "Sesuai untuk pasukan lean di mana setiap balasan cepat boleh bertukar menjadi booking, meja, pickup, atau pesanan delivery." },
      { label: "E-commerce dan DTC", title: "Stok, penghantaran, pulangan, saiz, kesesuaian produk.", body: "Berguna apabila data produk dan fulfilment sudah ada, tetapi jawapan pelanggan masih bersepah di banyak mesej." },
      { label: "Klinik", title: "Waktu operasi, aturan appointment, queue, intake asas.", body: "Terhad kepada soalan operasi sahaja; topik perubatan, undang-undang, aduan, atau sensitif akan dieskalasi segera." },
      { label: "Penjual Carousell dan Shopee", title: "Soalan pra-jualan berulang dalam chat high-intent.", body: "Untuk penjual yang kehilangan deal apabila tidak dapat membalas cukup cepat sambil mengurus perniagaan lain." },
    ],
    offer: {
      eyebrow: "Tawaran",
      title: "Kami menjual pengalaman yang siap, bukan satu lagi platform untuk diurus.",
      body: "Pronto memiliki binaan end-to-end: pemetaan sumber, ingestion data, konfigurasi suara jenama, deployment saluran, confidence checks, dan maintenance berterusan.",
      proofs: ["Setup done-for-you", "Skop dipimpin pengasas", "Berbilang bahasa dari hari pertama"],
    },
    capabilities: [
      { title: "Dilatih pada sumber sebenar anda", body: "Kandungan laman web, FAQ, katalog produk, polisi refund, aturan booking, maklumat penghantaran, dan panduan yang dimuat naik." },
      { title: "Dikonfigurasi dalam suara jenama anda", body: "Kami ekstrak tone daripada kandungan sedia ada dan encode corak, kosa kata, had, dan contoh ke dalam agen." },
      { title: "Dilancarkan di tempat pelanggan sudah berada", body: "Saluran pelanggan utama dahulu, dengan DM dan inbox tambahan sebagai saluran susulan." },
      { title: "Disambung ke sistem live", body: "Kalendar, storefront, tracking penghantaran, pangkalan data inventori, CRM dalaman, dan API tersuai apabila skop menyokong." },
    ],
    logoDescriptions: {
      whatsapp: "WhatsApp",
      telegram: "Telegram",
      email: "E-mel",
      messenger: "Messenger",
      instagram: "DM Instagram",
      "google-calendar": "Google Calendar",
      calendly: "Calendly",
      shopify: "Shopify",
      woocommerce: "WooCommerce",
      "delivery-tracking": "Tracking penghantaran",
      "inventory-api": "API inventori",
      crm: "Sistem CRM",
      "custom-api": "API tersuai",
    },
    logosHeading: "Saluran pelancaran dan integrasi biasa",
    matrix: { customerChannels: "Saluran pelanggan", businessSystems: "Sistem perniagaan" },
    processSteps: [
      { title: "Panggilan discovery", eyebrow: "20-30 min", body: "Petakan masalah khidmat pelanggan, campuran saluran, volume pertanyaan, dan fit tanpa memaksa harga terlalu awal." },
      { title: "Cadangan tersuai", eyebrow: "Skop dahulu", body: "Tentukan saluran, sumber data, integrasi, timeline, dan tier yang sesuai sebelum discovery lebih mendalam." },
      { title: "Deep discovery", eyebrow: "Kunci skop", body: "Kumpul bahan sumber, contoh suara jenama, peraturan eskalasi, dan path data tepat yang boleh dipercayai agen." },
      { title: "Bina dan pilot", eyebrow: "Stress test", body: "Pasang agen daripada core Pronto yang boleh digunakan semula, kemudian test sehingga eskalasi dan kualiti jawapan sedia dilancarkan." },
      { title: "Launch dan maintain", eyebrow: "Berterusan", body: "Ramp ke trafik pelanggan sebenar, semak prestasi, refresh knowledge, dan kekalkan sistem apabila perniagaan berubah." },
    ],
    comparisonRows: [
      { point: "Beban setup", diy: "Owner atau ops lead perlu konfigurasi flow, prompt, data, dan handoff.", pronto: "Pronto skop, bina, test, dan launch agen untuk perniagaan." },
      { point: "Kualiti jawapan", diy: "Selalunya bermula sebagai crawler laman web atau FAQ bot dengan konteks operasi terhad.", pronto: "Sumber statik, sistem live, aturan suara jenama, dan logik eskalasi dipetakan bersama." },
      { point: "Apabila tidak pasti", diy: "Banyak bot masih cuba membantu dan menghasilkan jawapan berisiko kepada jenama.", pronto: "Agen mengeskalasi dengan soalan, konteks, dan sebab ia perlukan manusia." },
      { point: "Maintenance", diy: "Perniagaan memiliki tuning, monitoring, analytics, dan refresh kandungan.", pronto: "Refresh knowledge, semakan prestasi, bug fixes, dan check-in termasuk dalam retainer." },
    ],
    setupOffers: [
      { title: "Binaan standard", price: "SGD 2,500", body: "1-2 saluran, liputan FAQ, dan 1-2 integrasi praktikal." },
      { title: "Binaan custom", price: "SGD 5,000+", body: "Lebih banyak saluran, integrasi lebih dalam, keperluan suara lebih ketat, atau skop kompleks." },
      { title: "Trial berskop", price: "SGD 500", body: "Trial berbayar 2-4 minggu, dikreditkan kepada yuran setup jika convert." },
    ],
    pricingTiers: [
      { name: "Starter", price: "SGD 200", cadence: "/bulan", summary: "Untuk satu saluran utama dan volume FAQ yang boleh dijangka.", highlight: false, features: ["Sehingga 500 perbualan/bulan", "1 saluran", "Check-in bulanan", "SLA 24 jam waktu kerja"] },
      { name: "Growth", price: "SGD 500", cadence: "/bulan", summary: "Untuk PKS dengan volume pertanyaan lebih tinggi dan lebih daripada satu saluran aktif.", highlight: true, features: ["Sehingga 2,000 perbualan/bulan", "2 saluran", "Check-in dua minggu sekali", "SLA 4 jam waktu kerja"] },
      { name: "Scale", price: "SGD 1,200", cadence: "/bulan", summary: "Untuk pasukan sibuk yang perlukan liputan lebih luas dan sokongan lebih cepat.", highlight: false, features: ["Sehingga 6,000 perbualan/bulan", "Semua saluran", "Check-in mingguan", "SLA 1 jam waktu kerja"] },
    ],
    pricingLabels: { featured: "Fit biasa", enterpriseName: "Enterprise", enterpriseSummary: "Untuk volume melebihi Scale, keperluan compliance khas, atau integrasi mendalam.", enterprisePrice: "Custom" },
    faqs: [
      { question: "Perlu sistem kami bersih sebelum bercakap dengan Pronto?", answer: "Tidak. Pass pertama dibina sekitar cara perniagaan anda menjawab pelanggan hari ini, kemudian kami tentukan sumber yang boleh dipercayai untuk launch." },
      { question: "Apa jadi jika agen tidak tahu jawapan?", answer: "Ia eskalasi. Pronto direka untuk jawapan grounded dan handoff manusia, supaya soalan tidak pasti atau sensitif tidak menjadi tekaan kepada pelanggan." },
      { question: "Berapa cepat boleh live?", answer: "Sasaran ialah kurang daripada seminggu selepas skop dikunci. Integrasi kompleks boleh mengubah timeline, tetapi kebanyakan deployment standard boleh siap dalam beberapa hari." },
      { question: "Adakah ini hanya untuk syarikat besar?", answer: "Tidak. Pronto untuk PKS Singapura dengan soalan pelanggan berulang dan bandwidth khidmat pelanggan terhad." },
    ],
    finalCta: { eyebrow: "Mula dengan fit", title: "Bawa soalan pelanggan yang berulang. Kami akan petakan apa yang Pronto patut jawab, dan apa yang patut dieskalasi." },
    footer: { tagline: "Agen khidmat pelanggan AI done-for-you untuk PKS Singapura.", links: { offer: "Tawaran", pricing: "Harga", team: "Pasukan", book: "Tempah panggilan" } },
  },
  ta: {
    cta: { bookShort: "அழைப்பு பதிவு", bookDiscovery: "Discovery அழைப்பு பதிவு", viewPricing: "விலை பார்க்க", scopeTogether: "ஸ்கோப் சேர்ந்து தீர்மானிக்க" },
    languageLabel: "மொழி",
    proofAria: "Pronto முக்கிய ஆதாரங்கள்",
    hero: {
      eyebrow: "சிங்கப்பூர் SMEகள். உண்மையான வாடிக்கையாளர் சேனல்கள். DIY setup இல்லை.",
      title: "ஒவ்வொரு customer க்கும் AI front desk.",
      lede: "Pronto உங்கள் சரிபார்க்கப்பட்ட sources இலிருந்து, உங்கள் brand voice இல், உங்கள் வாடிக்கையாளர்கள் ஏற்கனவே பயன்படுத்தும் சேனல்களில் பதிலளிக்கும் custom customer service agents ஐ build, deploy, maintain செய்கிறது.",
      actionsAria: "முக்கிய செயல்கள்",
      actionLabel: "20-30 min discovery call",
    },
    chat: {
      aria: "WhatsApp பாணி Pronto customer service flow animation",
      contact: "Pronto agent",
      account: "Business Account",
      today: "இன்று",
      secure: "இந்த business இந்த chat ஐ manage செய்ய Pronto பயன்படுத்துகிறது.",
      customer: "இது வெள்ளிக்கிழமை delivery ஆகுமா? Walnut stock இருக்கா?",
      typing: "Pronto typing",
      agent: "Walnut கிடைக்கிறது. இன்று 2PM க்குள் உறுதி செய்யும் orders க்கு Friday delivery சாத்தியம்.",
      compose: "Message",
    },
    stats: [
      { value: "<1 வாரம்", label: "scope lock ஆன பிறகு target launch" },
      { value: "4 மொழிகள்", label: "English, Mandarin, Bahasa Melayu, Tamil, மற்றும் SG code-switching" },
      { value: "0 guesses", label: "verified sources இலிருந்து மட்டும் பதில்; இல்லையெனில் escalation" },
    ],
    sections: {
      problem: { eyebrow: "பிரச்சினை", title: "Customer service அதிக volume வேலை; ஆனால் leverage குறைவு.", body: "மேலும் மனிதர்களை hire செய்வது செலவு. ஒன்றும் செய்யாமல் இருப்பது conversions இழக்கச் செய்யும். DIY platforms setup, maintenance, quality risk எல்லாவற்றையும் business மீது விடுகின்றன." },
      fit: { eyebrow: "யாருக்கு", title: "Reply speed revenue மாற்றும் owner-operated teams க்கு.", body: "Repeated questions, real source material, மற்றும் fast accurate answers முக்கியமாகும் enquiry volume உள்ள businesses க்கு இது பொருந்தும்." },
      channels: { eyebrow: "Channels மற்றும் integrations", title: "Pronto உங்கள் customers மற்றும் staff ஏற்கனவே பயன்படுத்தும் workflow இல் பொருந்துகிறது.", body: "முதல் launch scoped ஆக இருக்கும்; volume மற்றும் operations வளரும்போது கூடுதல் channels மற்றும் integrations சேர்க்கலாம்." },
      process: { eyebrow: "Launch எப்படி", title: "முதல் உரையாடலிருந்து live agent வரை practical பாதை.", body: "Fit qualify, scope lock, agent stress-test, unreliable system ஐ production க்கு தள்ளாமல் இருப்பதற்காக இந்த process வடிவமைக்கப்பட்டுள்ளது." },
      comparison: { eyebrow: "ஏன் Pronto", title: "DIY chatbot subscription அல்ல. Managed customer service layer.", body: "Market இல் tools ஏற்கனவே உள்ளன. Implementation team ஆகாமல் outcome வேண்டும் என்ற businesses க்கு Pronto.", aria: "DIY chatbot platforms மற்றும் Pronto ஒப்பீடு", headers: ["Decision point", "Typical DIY platform", "Pronto"] },
      pricing: { eyebrow: "விலை", title: "தெளிவான tiers; per-message meter இல்லை.", body: "Setup fee build ஐ cover செய்கிறது. Monthly retainers conversation volume மற்றும் support expectations அடிப்படையில் scale ஆகும்; usage spikes இல்லாமல் budget செய்ய முடியும்." },
      team: { eyebrow: "Solv3d", title: "Solv3d ஐ உருவாக்கிய team வழங்குகிறது.", body: "Solv3d பின்னால் உள்ள அதே Singapore-based team Pronto க்கும் அருகில் இருக்கும்: client fit, technical implementation, மற்றும் customer-facing AI governance." },
      faq: { eyebrow: "FAQ", title: "ஒரு call மதிப்புள்ளதா என்று முடிவெடுக்க போதுமான தெளிவு.", body: "முதல் உரையாடல் fit மற்றும் scope ஐ உறுதிப்படுத்த வேண்டும்; business தான் manage செய்ய வேண்டிய tool க்கு தள்ள வேண்டாம்." },
    },
    problemCards: [
      { title: "Repeated questions நாள் முழுவதையும் சாப்பிடும்", body: "Opening hours, stock checks, delivery timelines, refunds, reservations, policy questions எல்லாம் அதே சில channels இல் தொடர்ந்து வரும்." },
      { title: "மெதுவான replies revenue ஐ அமைதியாக இழக்கச் செய்யும்", body: "Owner-operated SMEs க்கு ஒரு missed அல்லது late answer கூட customer book/buy செய்கிறாரா அல்லது competitor க்கு செல்கிறாரா என்பதை முடிவு செய்யலாம்." },
      { title: "DIY tools க்கும் technical owner தேவை", body: "பல chatbot platforms business ஐ flows, prompts, data, quality monitoring, maintenance எல்லாவற்றையும் configure செய்ய வைக்கின்றன." },
    ],
    fitCards: [
      { label: "F&B operators", title: "Reservations, hours, availability, last-minute questions.", body: "ஒவ்வொரு fast answer உம் booking, table, pickup, delivery order ஆக மாறக்கூடிய lean teams க்கு." },
      { label: "E-commerce மற்றும் DTC", title: "Stock, delivery, returns, sizing, product fit.", body: "Product மற்றும் fulfilment data ஏற்கனவே இருந்தும் customer answers messages முழுவதும் சிதறி இருக்கும் போது பயன்படும்." },
      { label: "Clinics", title: "Opening hours, appointment rules, queues, intake basics.", body: "Operational questions மட்டும்; medical, legal, complaints, sensitive topics உடனே human escalation." },
      { label: "Carousell மற்றும் Shopee sellers", title: "High-intent chats இல் repeated pre-sale questions.", body: "மற்ற business வேலைகளைச் செய்யும்போது உடனடி reply முடியாமல் deals இழக்கும் sellers க்கு." },
    ],
    offer: {
      eyebrow: "சேவை",
      title: "நாங்கள் sell செய்வது finished experience; manage செய்ய இன்னொரு platform அல்ல.",
      body: "Pronto build end-to-end ஐ own செய்கிறது: source mapping, data ingestion, brand voice configuration, channel deployment, confidence checks, ongoing maintenance.",
      proofs: ["Done-for-you setup", "Founder-led scoping", "Day one இலிருந்தே multilingual"],
    },
    capabilities: [
      { title: "உங்கள் real sources மீது trained", body: "Website content, FAQs, product catalogues, refund policies, booking rules, delivery information, uploaded guidelines." },
      { title: "உங்கள் brand voice இல் configured", body: "Existing content இலிருந்து tone எடுத்து, patterns, vocabulary, limits, examples ஐ agent க்குள் encode செய்கிறோம்." },
      { title: "Customers ஏற்கனவே இருக்கும் channels இல் deployed", body: "முதலில் priority customer channels, பிறகு additional DM மற்றும் inbox surfaces." },
      { title: "Live systems உடன் connected", body: "Calendars, storefronts, delivery tracking, inventory databases, internal CRMs, மற்றும் scope ஆதரிக்கும் custom APIs." },
    ],
    logoDescriptions: {
      whatsapp: "WhatsApp",
      telegram: "Telegram",
      email: "Email",
      messenger: "Messenger",
      instagram: "Instagram DMs",
      "google-calendar": "Google Calendar",
      calendly: "Calendly",
      shopify: "Shopify",
      woocommerce: "WooCommerce",
      "delivery-tracking": "Delivery tracking",
      "inventory-api": "Inventory APIs",
      crm: "CRM systems",
      "custom-api": "Custom APIs",
    },
    logosHeading: "Launch channels மற்றும் common integrations",
    matrix: { customerChannels: "Customer channels", businessSystems: "Business systems" },
    processSteps: [
      { title: "Discovery call", eyebrow: "20-30 min", body: "Customer service pain, channel mix, query volume, fit ஆகியவற்றை pricing ஐ விரைவில் தள்ளாமல் map செய்கிறோம்." },
      { title: "Tailored proposal", eyebrow: "Scope first", body: "Channels, data sources, integrations, timeline, likely tier ஆகியவற்றை deep implementation க்கு முன் define செய்கிறோம்." },
      { title: "Deep discovery", eyebrow: "Lock scope", body: "Source material, brand voice examples, escalation rules, agent நம்பும் exact data paths ஆகியவற்றை collect செய்கிறோம்." },
      { title: "Build and pilot", eyebrow: "Stress test", body: "Pronto reusable core இலிருந்து agent assemble செய்து, escalation behavior மற்றும் answer quality launch-ready ஆகும் வரை test செய்கிறோம்." },
      { title: "Launch and maintain", eyebrow: "Ongoing", body: "Live customer traffic க்கு ramp செய்து, performance review, knowledge refresh, business changes க்கு system update செய்கிறோம்." },
    ],
    comparisonRows: [
      { point: "Setup burden", diy: "Owner அல்லது ops lead flows, prompts, data, handoffs எல்லாவற்றையும் configure செய்ய வேண்டும்.", pronto: "Pronto business க்காக agent ஐ scope, build, test, launch செய்கிறது." },
      { point: "Answer quality", diy: "பெரும்பாலும் website crawler அல்லது limited context கொண்ட FAQ bot ஆக தொடங்கும்.", pronto: "Static sources, live systems, brand voice rules, escalation logic ஒன்றாக mapped." },
      { point: "When unsure", diy: "பல bots helpful ஆக இருக்க முயன்று brand-risky answers உருவாக்கும்.", pronto: "Agent question, context, human தேவைப்படும் reason உடன் escalate செய்கிறது." },
      { point: "Maintenance", diy: "Business tuning, monitoring, analytics, content refreshes அனைத்தையும் own செய்ய வேண்டும்.", pronto: "Knowledge refreshes, performance review, bug fixes, check-ins retainer இல் அடங்கும்." },
    ],
    setupOffers: [
      { title: "Standard build", price: "SGD 2,500", body: "1-2 channels, FAQ coverage, மற்றும் 1-2 practical integrations." },
      { title: "Custom build", price: "SGD 5,000+", body: "More channels, deeper integrations, stricter voice needs, அல்லது complex scope." },
      { title: "Scoped trial", price: "SGD 500", body: "2-4 week paid trial; convert ஆனால் setup fee க்கு credit." },
    ],
    pricingTiers: [
      { name: "Starter", price: "SGD 200", cadence: "/month", summary: "ஒரு main customer channel மற்றும் predictable FAQ volume க்கு.", highlight: false, features: ["Up to 500 conversations/month", "1 channel", "Monthly check-in", "24h business-hours SLA"] },
      { name: "Growth", price: "SGD 500", cadence: "/month", summary: "Higher enquiry volume மற்றும் ஒன்றுக்கு மேற்பட்ட active channel உள்ள SMEs க்கு.", highlight: true, features: ["Up to 2,000 conversations/month", "2 channels", "Biweekly check-in", "4h business-hours SLA"] },
      { name: "Scale", price: "SGD 1,200", cadence: "/month", summary: "Broader coverage மற்றும் faster response support தேவைப்படும் busy teams க்கு.", highlight: false, features: ["Up to 6,000 conversations/month", "All channels", "Weekly check-in", "1h business-hours SLA"] },
    ],
    pricingLabels: { featured: "Common fit", enterpriseName: "Enterprise", enterpriseSummary: "Above-Scale volume, special compliance, அல்லது deep integration requirements க்கு.", enterprisePrice: "Custom" },
    faqs: [
      { question: "Pronto உடன் பேசுவதற்கு முன் systems clean ஆக வேண்டுமா?", answer: "இல்லை. உங்கள் business இன்று customers க்கு எப்படி பதிலளிக்கிறது என்பதிலிருந்து first pass உருவாகும்; பிறகு launch க்கு trust செய்யும் sources ஐ define செய்கிறோம்." },
      { question: "Agent க்கு answer தெரியாவிட்டால்?", answer: "அது escalate செய்யும். Pronto grounded answers மற்றும் human handoff அடிப்படையில் designed; uncertain அல்லது sensitive questions customer-facing guesses ஆக மாறாது." },
      { question: "எவ்வளவு விரைவாக live ஆகலாம்?", answer: "Scope lock ஆன பின் target under one week. Complex integrations timeline ஐ மாற்றலாம்; standard deployments சில நாட்களில் முடியும்." },
      { question: "இது பெரிய companies க்கு மட்டுமா?", answer: "இல்லை. Repeated customer questions மற்றும் limited CS bandwidth உள்ள Singapore SMEs க்காக Pronto." },
    ],
    finalCta: { eyebrow: "Fit இலிருந்து தொடங்கு", title: "உங்கள் repeated customer questions ஐ கொண்டு வாருங்கள். Pronto எதை answer செய்ய வேண்டும், எதை escalate செய்ய வேண்டும் என்பதை map செய்வோம்." },
    footer: { tagline: "Singapore SMEs க்கு done-for-you AI customer service agents.", links: { offer: "சேவை", pricing: "விலை", team: "அணி", book: "அழைப்பு பதிவு" } },
  },
};

function isLanguageKey(value: string | null): value is LanguageKey {
  return LANGUAGES.some((language) => language.key === value);
}

function readStoredLanguage(): LanguageKey {
  if (typeof window === "undefined") {
    return "en";
  }
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return isLanguageKey(stored) ? stored : "en";
}

function localizeLogos(baseLogos: Array<{ id: LogoId; image: string }>, copy: SiteCopy): Logo[] {
  return baseLogos.map((logo) => ({
    id: logo.id,
    image: logo.image,
    description: copy.logoDescriptions[logo.id],
  }));
}

function ButtonLink({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const isExternal = href.startsWith("http");
  return (
    <a className={`button button-${variant}`} href={href} target={isExternal ? "_blank" : undefined} rel={isExternal ? "noreferrer" : undefined}>
      {children}
    </a>
  );
}

function DiagramLogoPill({
  logo,
  className = "",
}: {
  logo: Logo;
  className?: string;
}) {
  return (
    <span className={`diagram-logo-pill ${className}`}>
      <img src={logo.image} alt="" loading="eager" />
      {logo.description}
    </span>
  );
}

function SectionHeader({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="section-header">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {body ? <p>{body}</p> : null}
    </div>
  );
}

function LanguagePicker({
  id,
  language,
  label,
  onChange,
}: {
  id: string;
  language: LanguageKey;
  label: string;
  onChange: (language: LanguageKey) => void;
}) {
  return (
    <label className="language-picker" htmlFor={id}>
      <Languages size={16} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <select
        id={id}
        value={language}
        aria-label={label}
        onChange={(event) => onChange(event.target.value as LanguageKey)}
      >
        {LANGUAGES.map((item) => (
          <option key={item.key} value={item.key}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function App() {
  const [language, setLanguageState] = React.useState<LanguageKey>(readStoredLanguage);
  const [activeHeroChannel, setActiveHeroChannel] = React.useState<HeroChannelId>("whatsapp");
  const copy = CONTENT[language];
  const channelLogos = localizeLogos(channelLogoBase, copy);
  const heroChannelLogos = channelLogos.filter((logo): logo is Logo & { id: HeroChannelId } => isHeroChannelId(logo.id));
  const integrationLogos = localizeLogos(integrationLogoBase, copy);
  const supportedLogos = [...channelLogos, ...integrationLogos];

  React.useEffect(() => {
    document.documentElement.lang = language;
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  function setLanguage(nextLanguage: LanguageKey) {
    setLanguageState(nextLanguage);
  }

  return (
    <>
      <main>
        <div className="hero-frame" id="top">
          <section className="hero section">
            <div className="hero-copy">
              <h1>{copy.hero.title}</h1>
              <p className="hero-lede">{copy.hero.lede}</p>
              <div className="hero-actions" aria-label={copy.hero.actionsAria}>
                <ButtonLink href={BOOK_CALL_URL}>
                  {copy.cta.bookDiscovery} <ArrowRight size={18} aria-hidden="true" />
                </ButtonLink>
                <ButtonLink href="#pricing" variant="secondary">
                  {copy.cta.viewPricing} <CircleDollarSign size={18} aria-hidden="true" />
                </ButtonLink>
              </div>
            </div>
            <div className="chat-showcase" data-channel={activeHeroChannel} aria-label={copy.chat.aria}>
              <div className="channel-switcher" role="tablist" aria-label={copy.matrix.customerChannels}>
                {heroChannelLogos.map((logo) => (
                  <button
                    type="button"
                    className="channel-chip"
                    key={logo.id}
                    role="tab"
                    aria-selected={logo.id === activeHeroChannel}
                    onClick={() => setActiveHeroChannel(logo.id)}
                  >
                    <img src={logo.image} alt="" aria-hidden="true" />
                    {logo.description}
                  </button>
                ))}
              </div>
              <div className="customer-chat-phone" key={activeHeroChannel}>
                <div className="chat-status" aria-hidden="true">
                  <span>17:48</span>
                  <span>LTE 80%</span>
                </div>
                <div className="chat-header">
                  <ArrowLeft size={19} aria-hidden="true" />
                  <div className="chat-avatar" aria-hidden="true">P</div>
                  <div className="chat-contact">
                    <strong>{copy.chat.contact}</strong>
                    <span>{copy.chat.account}</span>
                  </div>
                  <div className="chat-tools" aria-hidden="true">
                    <CircleDollarSign className="chat-tool-dollar" size={18} />
                    <Phone size={18} />
                    <Video className="chat-tool-video" size={18} />
                    <MoreVertical className="chat-tool-menu" size={18} />
                  </div>
                </div>
                <div className="chat-body">
                  <div className="chat-day">{copy.chat.today}</div>
                  <p className="chat-secure">
                    <ShieldCheck size={15} aria-hidden="true" />
                    {copy.chat.secure}
                  </p>
                  <article className="chat-message customer-message">
                    <p>{copy.chat.customer}</p>
                    <time>
                      17:48 <CheckCheck size={15} aria-hidden="true" />
                    </time>
                  </article>
                  <div className="chat-typing" aria-label={copy.chat.typing}>
                    <strong>{copy.chat.typing}</strong>
                    <i />
                    <i />
                    <i />
                  </div>
                  <article className="chat-message agent-message">
                    <p>{copy.chat.agent}</p>
                    <time>17:49</time>
                  </article>
                </div>
                <div className="chat-compose">
                  <div className="compose-field">
                    <Smile size={18} aria-hidden="true" />
                    <span>{copy.chat.compose}</span>
                    <Paperclip size={18} aria-hidden="true" />
                    <Camera size={18} aria-hidden="true" />
                  </div>
                  <button className="compose-mic" type="button" aria-label={copy.chat.compose}>
                    <Mic size={18} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className="section problem" id="problem">
          <SectionHeader
            eyebrow={copy.sections.problem.eyebrow}
            title={copy.sections.problem.title}
            body={copy.sections.problem.body}
          />
          <div className="card-grid three">
            {copy.problemCards.map((card, index) => (
              <article className="info-card" key={card.title}>
                <span className="card-index">{String(index + 1).padStart(2, "0")}</span>
                <Clock3 size={24} aria-hidden="true" />
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section fit" id="fit">
          <SectionHeader
            eyebrow={copy.sections.fit.eyebrow}
            title={copy.sections.fit.title}
            body={copy.sections.fit.body}
          />
          <div className="fit-grid">
            {copy.fitCards.map((card, index) => (
              <article className="fit-card" key={card.label}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <small>{card.label}</small>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section offer" id="offer">
          <div className="split">
            <div>
              <p className="eyebrow">{copy.offer.eyebrow}</p>
              <h2>{copy.offer.title}</h2>
              <p>{copy.offer.body}</p>
            </div>
            <div className="capability-grid">
              {copy.capabilities.map((item, index) => {
                const Icon = capabilityIcons[index];
                return (
                  <article className="capability" key={item.title}>
                    <Icon size={24} aria-hidden="true" />
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="section channels" id="channels">
          <SectionHeader
            eyebrow={copy.sections.channels.eyebrow}
            title={copy.sections.channels.title}
            body={copy.sections.channels.body}
          />
          <Logos3 heading={copy.logosHeading} logos={supportedLogos} />
          <div className="architecture-board" aria-label="Pronto architecture diagram">
            <div className="architecture-grid">
              <svg className="architecture-wires" viewBox="0 0 1100 420" aria-hidden="true" preserveAspectRatio="none">
                <path className="wire wire-muted" d="M88 232 H294" />
                <path className="wire wire-primary" d="M294 232 C384 232 382 88 498 88" />
                <path className="wire wire-primary" d="M550 142 V184" />
                <path className="wire wire-primary" d="M604 88 C672 88 646 232 724 232" />
                <path className="wire wire-accent" d="M724 232 C802 232 806 136 920 136 H1010" />
                <path className="wire wire-accent" d="M724 232 H1010" />
                <path className="wire wire-accent" d="M724 232 C802 232 806 304 920 304 H1010" />
                <circle className="wire-dot" cx="294" cy="232" r="8" />
                <circle className="wire-dot accent" cx="724" cy="232" r="8" />
              </svg>

              <div className="arch-zone arch-zone-left">
                <div className="arch-zone-heading">
                  <MessageCircle size={28} aria-hidden="true" />
                  <span>{copy.matrix.customerChannels}</span>
                </div>
                <div className="arch-pill-row">
                  {channelLogos.map((logo) => (
                    <DiagramLogoPill className="arch-pill" logo={logo} key={logo.id} />
                  ))}
                </div>
              </div>

              <div className="arch-zone arch-zone-core">
                <div className="arch-core-mark" aria-hidden="true">P</div>
                <span className="arch-core-label">Pronto</span>
                <div className="arch-policy-stack">
                  <span><FileCheck2 size={15} aria-hidden="true" /> {copy.offer.proofs[0]}</span>
                  <span><Braces size={15} aria-hidden="true" /> {copy.offer.proofs[1]}</span>
                  <span><ShieldCheck size={15} aria-hidden="true" /> {copy.stats[2].value} {copy.stats[2].label}</span>
                </div>
              </div>

              <div className="arch-zone arch-zone-right">
                <div className="arch-zone-heading">
                  <Workflow size={28} aria-hidden="true" />
                  <span>{copy.matrix.businessSystems}</span>
                </div>
                <div className="arch-system-grid">
                  {integrationLogos.map((logo) => (
                    <DiagramLogoPill className="arch-system" logo={logo} key={logo.id} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="architecture-card-grid" aria-label="Pronto architecture examples">
            <article className="arch-mini-card arch-mini-purple">
              <p className="arch-mini-eyebrow">{copy.matrix.customerChannels}</p>
              <h3>{copy.capabilities[2].title}</h3>
              <div className="mini-diagram">
                <svg className="mini-wires" viewBox="0 0 420 300" aria-hidden="true" preserveAspectRatio="none">
                  <path className="mini-wire" d="M92 48 C92 120 170 120 210 168" />
                  <path className="mini-wire" d="M260 48 C260 120 220 120 210 168" />
                  <path className="mini-wire" d="M134 96 C150 126 190 136 210 168" />
                  <path className="mini-wire" d="M328 96 C300 130 240 136 210 168" />
                  <path className="mini-wire" d="M210 212 V266" />
                </svg>
                <DiagramLogoPill className="mini-node mini-node-a" logo={channelLogos[0]} />
                <DiagramLogoPill className="mini-node mini-node-b" logo={channelLogos[3]} />
                <DiagramLogoPill className="mini-node mini-node-c" logo={channelLogos[4]} />
                <DiagramLogoPill className="mini-node mini-node-d" logo={channelLogos[2]} />
                <span className="mini-core">P</span>
                <span className="mini-node wide">{copy.chat.contact}</span>
              </div>
            </article>

            <article className="arch-mini-card arch-mini-green">
              <p className="arch-mini-eyebrow">{copy.matrix.businessSystems}</p>
              <h3>{copy.capabilities[3].title}</h3>
              <div className="mini-diagram systems">
                <svg className="mini-wires" viewBox="0 0 420 300" aria-hidden="true" preserveAspectRatio="none">
                  <path className="mini-wire" d="M210 118 V148 C210 176 84 176 84 192" />
                  <path className="mini-wire" d="M210 118 V192" />
                  <path className="mini-wire" d="M210 118 V148 C210 176 336 176 336 192" />
                  <path className="mini-wire" d="M210 118 V160 C210 222 151 222 151 252" />
                  <path className="mini-wire" d="M210 118 V160 C210 222 269 222 269 252" />
                </svg>
                <span className="mini-core">P</span>
                <DiagramLogoPill className="mini-node mini-node-a" logo={integrationLogos[0]} />
                <DiagramLogoPill className="mini-node mini-node-b" logo={integrationLogos[5]} />
                <DiagramLogoPill className="mini-node mini-node-c" logo={integrationLogos[6]} />
                <DiagramLogoPill className="mini-node mini-node-d" logo={integrationLogos[2]} />
                <DiagramLogoPill className="mini-node mini-node-e" logo={integrationLogos[3]} />
              </div>
            </article>
          </div>

        </section>

        <section className="section process" id="process">
          <SectionHeader
            eyebrow={copy.sections.process.eyebrow}
            title={copy.sections.process.title}
            body={copy.sections.process.body}
          />
          <div className="timeline">
            {copy.processSteps.map((step, index) => (
              <article className="timeline-step" key={step.title}>
                <span className="step-number">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <small>{step.eyebrow}</small>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="section comparison" id="comparison">
          <SectionHeader
            eyebrow={copy.sections.comparison.eyebrow}
            title={copy.sections.comparison.title}
            body={copy.sections.comparison.body}
          />
          <div className="comparison-grid" role="table" aria-label={copy.sections.comparison.aria}>
            <div className="comparison-head" role="row">
              {copy.sections.comparison.headers.map((header) => (
                <span role="columnheader" key={header}>{header}</span>
              ))}
            </div>
            {copy.comparisonRows.map((row) => (
              <div className="comparison-row" role="row" key={row.point}>
                <strong role="cell">{row.point}</strong>
                <p role="cell" data-label={copy.sections.comparison.headers[1]}>{row.diy}</p>
                <p role="cell" data-label={copy.sections.comparison.headers[2]}>{row.pronto}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section pricing" id="pricing">
          <SectionHeader
            eyebrow={copy.sections.pricing.eyebrow}
            title={copy.sections.pricing.title}
            body={copy.sections.pricing.body}
          />
          <div className="pricing-grid">
            {copy.pricingTiers.map((tier) => (
              <article className={`price-card ${tier.highlight ? "featured" : ""}`} key={tier.name}>
                <div className="price-card-sheen" aria-hidden="true" />
                <div className="price-card-header">
                  <span className="featured-label">{tier.highlight ? copy.pricingLabels.featured : tier.name}</span>
                  <h3>{tier.name}</h3>
                </div>
                <p className="price-summary">{tier.summary}</p>
                <div className="price">
                  <strong>{tier.price}</strong>
                  <span>{tier.cadence}</span>
                </div>
                <ul className="price-feature-list">
                  {tier.features.map((feature) => (
                    <li key={feature}><Check size={17} aria-hidden="true" /> {feature}</li>
                  ))}
                </ul>
                <ButtonLink href={BOOK_CALL_URL} variant={tier.highlight ? "primary" : "secondary"}>
                  {copy.cta.scopeTogether} <ChevronRight size={18} aria-hidden="true" />
                </ButtonLink>
              </article>
            ))}
          </div>
        </section>

        <section className="section solv3d-attribution" id="team">
          <a className="solv3d-card" href="https://solv3d-website.vercel.app/" target="_blank" rel="noreferrer">
            <div className="solv3d-logo-wrap">
              <img src="/logos/solv3d-logo.png" alt="Solv3d" loading="eager" />
            </div>
            <div className="solv3d-copy">
              <h2>{copy.sections.team.title}</h2>
              <p>{copy.sections.team.body}</p>
            </div>
            <ArrowRight className="solv3d-arrow" size={24} aria-hidden="true" />
          </a>
        </section>

        <section className="section faq" id="faq">
          <div className="faq-wrap">
            <SectionHeader
              eyebrow={copy.sections.faq.eyebrow}
              title={copy.sections.faq.title}
              body={copy.sections.faq.body}
            />
            <div className="faq-list">
              {copy.faqs.map((item) => (
                <details key={item.question}>
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="section final-cta" id="contact">
          <div>
            <p className="eyebrow">{copy.finalCta.eyebrow}</p>
            <h2>{copy.finalCta.title}</h2>
          </div>
          <div className="final-actions">
            <ButtonLink href={BOOK_CALL_URL}>
              {copy.cta.bookDiscovery} <CalendarClock size={18} aria-hidden="true" />
            </ButtonLink>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div>
          <strong>Pronto</strong>
          <span>{copy.footer.tagline}</span>
          <div className="footer-language">
            <LanguagePicker id="language-select-footer" language={language} label={copy.languageLabel} onChange={setLanguage} />
          </div>
        </div>
        <div className="footer-links">
          <a href="#offer">{copy.footer.links.offer}</a>
          <a href="#pricing">{copy.footer.links.pricing}</a>
          <a href="#team">{copy.footer.links.team}</a>
          <a href={BOOK_CALL_URL} target="_blank" rel="noreferrer">{copy.footer.links.book}</a>
        </div>
      </footer>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
