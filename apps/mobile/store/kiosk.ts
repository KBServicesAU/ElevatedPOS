import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Translation map
// ---------------------------------------------------------------------------

export type KioskLang = 'en' | 'zh' | 'ar';

export const KIOSK_TRANSLATIONS: Record<KioskLang, Record<string, string>> = {
  en: {
    // attract
    tapText: 'TAP TO START',
    tapSub: 'Touch anywhere to begin',
    // order-type
    howDining: 'How are you dining?',
    selectOrderType: 'Select your order type to continue',
    dineIn: 'Dine In',
    dineInDesc: 'Eat here\nat a table',
    takeAway: 'Take Away',
    takeAwayDesc: 'Collect when\nready',
    tableNumber: 'Table Number',
    tableRangeError: 'Enter a table number between 1 and 99',
    continueTableFmt: 'Continue — Table {n} →',
    continueTakeaway: 'Continue — Take Away →',
    enterTableNumber: 'Enter your table number',
    // menu
    searchPlaceholder: 'Search menu...',
    ageVerifiedBanner: '✓ Age verified — alcohol and tobacco available',
    removeLabel: 'Remove',
    viewOrder: 'View Order',
    // cart
    yourCartEmpty: 'Your cart is empty',
    browseMenu: '← Browse Menu',
    addMoreItems: '+ Add More Items',
    nameTableBuzzer: 'Name / Table / Buzzer',
    nameTablePlaceholder: 'Enter your name or buzzer number',
    inclGST: 'Incl. GST',
    total: 'Total',
    proceedToPayment: 'Proceed to Payment →',
    dineInLabel: '🍽 Dine In',
    takeawayLabel: '🥡 Takeaway',
    wouldYouLikeAnythingElse: 'Would you like anything else?',
    tapToAddOrSkip: 'Tap to add — or skip and pay now.',
    added: 'Added ✓',
    addItem: '+ Add',
    noThanks: 'No thanks',
    continueToPayment: 'Continue to Payment →',
    // payment
    choosePayment: 'Choose Payment Method',
    cardLabel: 'Card',
    cardSub: 'Tap, insert or swipe',
    cashLabel: 'Cash',
    cashSub: 'Pay at counter',
    qrLabel: 'QR Pay',
    qrSub: 'WeChat Pay · Alipay',
    orderSummary: 'Order Summary',
    processing: 'Processing...',
    payFmt: 'Pay ${amount}',
    // age verification
    ageVerificationRequired: 'Age Verification Required',
    ageVerificationSubtitle: 'This item is restricted to customers aged 18 and over.',
    ageVerificationLegal: 'By confirming, you declare that you are 18 years of age or older. Staff may request photo ID before order completion.',
    yesIAm18: 'Yes, I am 18 or older',
    noRemoveItem: 'No, remove item',
    // confirmation
    orderPlaced: 'Order Placed!',
    orderBeingPrepared: 'Your order is being prepared',
    yourOrderNumber: 'Your Order Number',
    estimatedWait: 'Estimated Wait',
    waitTime: '10–15 minutes',
    returningHome: 'Returning to home in {n}s...',
    startNewOrder: 'Start New Order',
    // loyalty
    loyaltyTitle: 'Sign In for Rewards',
    loyaltySub: 'Scan your QR code or enter your mobile number',
    loyaltyRewards: 'Loyalty Rewards',
    earningPoints: "You're earning points on this order",
    earningPointsAs: 'Earning points as',
    ptsAvailable: ' pts available',
    changeAccount: 'Change Account',
    continueToMenu: 'Continue to Menu →',
    skipGuest: 'Skip — Order as Guest',
    applyAndContinue: 'Apply & Continue →',
    scanQR: 'Scan QR',
    phone: 'Phone',
    lookingUpAccount: 'Looking up account…',
    noAccountFound: 'No account found. Continue as guest.',
    positionQR: 'Position QR code in frame',
    openLoyaltyApp: 'Open your ElevatedPOS loyalty app and show your QR code',
  },

  zh: {
    // attract
    tapText: '触摸开始',
    tapSub: '点击任意位置开始',
    // order-type
    howDining: '您想怎样用餐？',
    selectOrderType: '请选择订单类型继续',
    dineIn: '堂食',
    dineInDesc: '在餐厅\n用餐',
    takeAway: '外带',
    takeAwayDesc: '准备好后\n取餐',
    tableNumber: '桌号',
    tableRangeError: '请输入 1 到 99 之间的桌号',
    continueTableFmt: '继续 — 桌号 {n} →',
    continueTakeaway: '继续 — 外带 →',
    enterTableNumber: '请输入您的桌号',
    // menu
    searchPlaceholder: '搜索菜单...',
    ageVerifiedBanner: '✓ 年龄已验证 — 可供应酒精和烟草',
    removeLabel: '移除',
    viewOrder: '查看订单',
    // cart
    yourCartEmpty: '您的购物车是空的',
    browseMenu: '← 浏览菜单',
    addMoreItems: '+ 继续添加菜品',
    nameTableBuzzer: '姓名 / 桌号 / 呼叫器',
    nameTablePlaceholder: '请输入您的姓名或呼叫器号码',
    inclGST: '含 GST',
    total: '合计',
    proceedToPayment: '前往支付 →',
    dineInLabel: '🍽 堂食',
    takeawayLabel: '🥡 外带',
    wouldYouLikeAnythingElse: '还需要什么吗？',
    tapToAddOrSkip: '点击添加，或跳过直接支付。',
    added: '已添加 ✓',
    addItem: '+ 添加',
    noThanks: '不，谢谢',
    continueToPayment: '继续支付 →',
    // payment
    choosePayment: '选择支付方式',
    cardLabel: '银行卡',
    cardSub: '感应、插入或刷卡',
    cashLabel: '现金',
    cashSub: '在柜台付款',
    qrLabel: '扫码支付',
    qrSub: '微信支付 · 支付宝',
    orderSummary: '订单摘要',
    processing: '处理中...',
    payFmt: '支付 ${amount}',
    // age verification
    ageVerificationRequired: '需要年龄验证',
    ageVerificationSubtitle: '此商品仅限 18 岁及以上顾客购买。',
    ageVerificationLegal: '点击确认即表示您声明已年满 18 周岁。工作人员可能在完成订单前要求出示证件。',
    yesIAm18: '是的，我已满 18 岁',
    noRemoveItem: '不，移除商品',
    // confirmation
    orderPlaced: '订单已提交！',
    orderBeingPrepared: '您的订单正在准备中',
    yourOrderNumber: '您的订单号',
    estimatedWait: '预计等待时间',
    waitTime: '10–15 分钟',
    returningHome: '{n} 秒后返回首页...',
    startNewOrder: '开始新订单',
    // loyalty
    loyaltyTitle: '登录以获取积分',
    loyaltySub: '扫描二维码或输入手机号',
    loyaltyRewards: '会员积分',
    earningPoints: '本次订单将为您累积积分',
    earningPointsAs: '正在为以下账户累积积分',
    ptsAvailable: ' 积分可用',
    changeAccount: '更换账户',
    continueToMenu: '继续浏览菜单 →',
    skipGuest: '跳过 — 以访客身份下单',
    applyAndContinue: '应用并继续 →',
    scanQR: '扫描二维码',
    phone: '手机号',
    lookingUpAccount: '正在查找账户…',
    noAccountFound: '未找到账户，以访客身份继续。',
    positionQR: '将二维码对准框内',
    openLoyaltyApp: '打开您的 ElevatedPOS 会员应用并展示二维码',
  },

  ar: {
    // attract
    tapText: 'انقر للبدء',
    tapSub: 'المس أي مكان للبدء',
    // order-type
    howDining: 'كيف ستتناول طعامك؟',
    selectOrderType: 'اختر نوع طلبك للمتابعة',
    dineIn: 'تناول هنا',
    dineInDesc: 'تناول الطعام\nعلى الطاولة',
    takeAway: 'طلب خارجي',
    takeAwayDesc: 'استلم عند\nالجاهزية',
    tableNumber: 'رقم الطاولة',
    tableRangeError: 'أدخل رقم طاولة بين 1 و 99',
    continueTableFmt: 'متابعة — طاولة {n} →',
    continueTakeaway: 'متابعة — طلب خارجي →',
    enterTableNumber: 'أدخل رقم طاولتك',
    // menu
    searchPlaceholder: 'ابحث في القائمة...',
    ageVerifiedBanner: '✓ تم التحقق من العمر — الكحول والتبغ متاحان',
    removeLabel: 'إزالة',
    viewOrder: 'عرض الطلب',
    // cart
    yourCartEmpty: 'سلة طلبك فارغة',
    browseMenu: '← تصفح القائمة',
    addMoreItems: '+ إضافة المزيد',
    nameTableBuzzer: 'الاسم / الطاولة / النداء',
    nameTablePlaceholder: 'أدخل اسمك أو رقم النداء',
    inclGST: 'شامل ضريبة السلع والخدمات',
    total: 'الإجمالي',
    proceedToPayment: 'المتابعة للدفع →',
    dineInLabel: '🍽 تناول هنا',
    takeawayLabel: '🥡 طلب خارجي',
    wouldYouLikeAnythingElse: 'هل تريد شيئًا آخر؟',
    tapToAddOrSkip: 'اضغط للإضافة، أو تخطَّ وادفع الآن.',
    added: 'تمت الإضافة ✓',
    addItem: '+ إضافة',
    noThanks: 'لا، شكرًا',
    continueToPayment: 'متابعة للدفع →',
    // payment
    choosePayment: 'اختر طريقة الدفع',
    cardLabel: 'بطاقة',
    cardSub: 'لمس، إدخال أو تمرير',
    cashLabel: 'نقداً',
    cashSub: 'ادفع عند المنضدة',
    qrLabel: 'دفع QR',
    qrSub: 'ويشات باي · علي باي',
    orderSummary: 'ملخص الطلب',
    processing: 'جارٍ المعالجة...',
    payFmt: 'ادفع ${amount}',
    // age verification
    ageVerificationRequired: 'التحقق من العمر مطلوب',
    ageVerificationSubtitle: 'هذا المنتج مخصص للعملاء الذين تجاوزوا 18 عامًا.',
    ageVerificationLegal: 'بالتأكيد، تُقر بأنك تجاوزت 18 عامًا. قد يطلب الموظف إبراز هوية قبل إتمام الطلب.',
    yesIAm18: 'نعم، عمري 18 أو أكثر',
    noRemoveItem: 'لا، إزالة المنتج',
    // confirmation
    orderPlaced: 'تم تقديم الطلب!',
    orderBeingPrepared: 'يتم تحضير طلبك الآن',
    yourOrderNumber: 'رقم طلبك',
    estimatedWait: 'وقت الانتظار المتوقع',
    waitTime: '10–15 دقيقة',
    returningHome: 'العودة للرئيسية خلال {n} ثانية...',
    startNewOrder: 'بدء طلب جديد',
    // loyalty
    loyaltyTitle: 'سجّل الدخول للحصول على مكافآت',
    loyaltySub: 'امسح رمز QR أو أدخل رقم هاتفك',
    loyaltyRewards: 'مكافآت الولاء',
    earningPoints: 'ستكسب نقاطًا على هذا الطلب',
    earningPointsAs: 'جمع النقاط باسم',
    ptsAvailable: ' نقطة متاحة',
    changeAccount: 'تغيير الحساب',
    continueToMenu: 'متابعة إلى القائمة →',
    skipGuest: 'تخطِّ — الطلب كضيف',
    applyAndContinue: 'تطبيق ومتابعة →',
    scanQR: 'مسح QR',
    phone: 'الهاتف',
    lookingUpAccount: 'جارٍ البحث عن الحساب…',
    noAccountFound: 'لم يُعثر على حساب. تابع كضيف.',
    positionQR: 'ضع رمز QR داخل الإطار',
    openLoyaltyApp: 'افتح تطبيق ElevatedPOS للولاء وأظهر رمز QR الخاص بك',
  },
};

/**
 * Simple translation helper. Replaces `{n}` / `{amount}` placeholders.
 * Usage: t(language, 'continueTableFmt', { n: '7' })
 */
export function t(
  lang: KioskLang,
  key: string,
  params?: Record<string, string>,
): string {
  let str =
    KIOSK_TRANSLATIONS[lang]?.[key] ??
    KIOSK_TRANSLATIONS['en'][key] ??
    key;
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    });
  }
  return str;
}

export interface SelectedModifier {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceAdjustment: number;
}

export interface CartItem {
  id: string;
  cartKey: string;
  name: string;
  price: number;
  qty: number;
  modifiers: SelectedModifier[];
  specialNote?: string;
}

export interface LoyaltyAccount {
  phone: string;
  name: string;
  points: number;
  tier: string;
}

export interface AppliedDiscount {
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  label: string;
}

type OrderType = 'dine_in' | 'takeaway';

interface KioskState {
  language: 'en' | 'zh' | 'ar';
  setLanguage: (lang: 'en' | 'zh' | 'ar') => void;
  cartItems: CartItem[];
  addToCart: (item: CartItem) => void;
  updateCartQty: (cartKey: string, qty: number) => void;
  removeFromCart: (cartKey: string) => void;
  clearCart: () => void;
  orderType: OrderType;
  setOrderType: (type: OrderType) => void;
  tableNumber: string;
  setTableNumber: (num: string) => void;
  specialInstructions: string;
  setSpecialInstructions: (text: string) => void;
  dineIn: boolean;
  setDineIn: (dineIn: boolean) => void;
  customerName: string;
  setCustomerName: (name: string) => void;
  ageVerified: boolean;
  setAgeVerified: (verified: boolean) => void;
  pendingAgeRestrictedProductId: string | null;
  setPendingAgeRestrictedProductId: (id: string | null) => void;
  loyaltyAccount: LoyaltyAccount | null;
  setLoyaltyAccount: (account: LoyaltyAccount | null) => void;
  earnedPoints: number | null;
  setEarnedPoints: (pts: number | null) => void;
  appliedDiscount: AppliedDiscount | null;
  setAppliedDiscount: (discount: AppliedDiscount | null) => void;
  orderNumber: string | null;
  setOrderNumber: (num: string) => void;
  resetOrder: () => void;
  resetKiosk: () => void;
}

const initialOrderState = {
  cartItems: [] as CartItem[],
  orderType: 'dine_in' as OrderType,
  tableNumber: '',
  specialInstructions: '',
  dineIn: true,
  customerName: '',
  ageVerified: false,
  pendingAgeRestrictedProductId: null as string | null,
  loyaltyAccount: null as LoyaltyAccount | null,
  earnedPoints: null as number | null,
  appliedDiscount: null as AppliedDiscount | null,
  orderNumber: null as string | null,
};

const initialState = {
  language: 'en' as const,
  ...initialOrderState,
};

export const useKioskStore = create<KioskState>((set) => ({
  ...initialState,
  setLanguage: (language) => set({ language }),
  addToCart: (item) =>
    set((state) => {
      const existing = state.cartItems.find((i) => i.cartKey === item.cartKey);
      if (existing) {
        return { cartItems: state.cartItems.map((i) => i.cartKey === item.cartKey ? { ...i, qty: i.qty + item.qty } : i) };
      }
      return { cartItems: [...state.cartItems, item] };
    }),
  updateCartQty: (cartKey, qty) =>
    set((state) => ({ cartItems: state.cartItems.map((i) => (i.cartKey === cartKey ? { ...i, qty } : i)) })),
  removeFromCart: (cartKey) =>
    set((state) => ({ cartItems: state.cartItems.filter((i) => i.cartKey !== cartKey) })),
  clearCart: () =>
    set({ cartItems: [], orderType: 'dine_in', tableNumber: '', ageVerified: false, pendingAgeRestrictedProductId: null }),
  setOrderType: (orderType) => set({ orderType, dineIn: orderType === 'dine_in' }),
  setTableNumber: (tableNumber) => set({ tableNumber }),
  setSpecialInstructions: (specialInstructions) => set({ specialInstructions }),
  setDineIn: (dineIn) => set({ dineIn, orderType: dineIn ? 'dine_in' : 'takeaway' }),
  setCustomerName: (customerName) => set({ customerName }),
  setAgeVerified: (ageVerified) => set({ ageVerified }),
  setPendingAgeRestrictedProductId: (pendingAgeRestrictedProductId) => set({ pendingAgeRestrictedProductId }),
  setLoyaltyAccount: (loyaltyAccount) => set({ loyaltyAccount }),
  setEarnedPoints: (earnedPoints) => set({ earnedPoints }),
  setAppliedDiscount: (appliedDiscount) => set({ appliedDiscount }),
  setOrderNumber: (orderNumber) => set({ orderNumber }),
  resetOrder: () => set((state) => ({ ...initialOrderState, language: state.language })),
  resetKiosk: () => set({ ...initialState }),
}));
