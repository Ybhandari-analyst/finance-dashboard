export const CATEGORIES = [
  "Food Delivery","Dining & Drinks","Cannabis","Groceries","Shopping","Entertainment & Events",
  "Health & Wellness","Travel - Flights","Travel - Hotels","Transit & Rideshare",
  "Subscriptions & Apps","Bills & Utilities","Rent","Card Payment","Income",
  "Investments","Transfers","Refund / Credit","Card Fee","Gambling","Other",
];

export const CAT_COLORS = {
  "Food Delivery":"#534AB7","Dining & Drinks":"#D4537E","Cannabis":"#3B6D11","Groceries":"#1D9E75",
  "Shopping":"#888780","Entertainment & Events":"#D85A30","Health & Wellness":"#378ADD",
  "Travel - Flights":"#BA7517","Travel - Hotels":"#E9A93A","Transit & Rideshare":"#9FE1CB",
  "Subscriptions & Apps":"#639922","Bills & Utilities":"#4A90D9","Rent":"#A32D2D",
  "Card Payment":"#C4C2B8","Income":"#0F6E56","Investments":"#3C3489",
  "Transfers":"#B4B2A9","Refund / Credit":"#5DCAA5","Card Fee":"#F09595","Gambling":"#8B0000","Other":"#B4B2A9",
};

export const EXPENSE_CATS = new Set([
  "Food Delivery","Dining & Drinks","Cannabis","Groceries","Shopping","Entertainment & Events",
  "Health & Wellness","Travel - Flights","Travel - Hotels","Transit & Rideshare",
  "Subscriptions & Apps","Bills & Utilities","Rent","Card Fee","Gambling","Other",
]);

export function categorize(desc, overrides = {}) {
  const key = desc.trim().toUpperCase();
  if (overrides[key]) return overrides[key];
  const d = key;

  // Income — must come before DIRECT DEPOSIT catch-all
  if (d.includes("KLICK") || d.includes("ADMIN BY CL") || d.includes("DIRECT DEPOSIT FROM KLICK") || d.includes("DIRECT DEPOSIT FROM ADMIN")) return "Income";
  if (d.includes("INTEREST EARNED") || d.includes("INTEREST RECEIVED") || d.includes("BONUS PAYMENT") || d.includes("DIRECT DEPOSIT FROM CANADA") || d.includes("DIRECT DEPOSIT FROM BRITISH AIRWAYS")) return "Income";

  // Rent
  if (d.includes("CHEXY") || d.includes("PARIS HOLDING") || d.includes("LANDLORD")) return "Rent";

  // Investments
  if (d.includes("WS INVESTMENTS") || d.includes("WEALTHSIMPLE INVEST")) return "Investments";

  // Transfers
  if (d.includes("WISE") && (d.includes("WITHDRAWAL") || d.includes("SENT"))) return "Transfers";
  if (d.includes("YASH BHANDARI") || d.includes("TRANSFER FROM") || d.includes("TRANSFER TO")) return "Transfers";
  if (d.includes("INTERAC E-TRANSFER RECEIVED") || d.includes("INTERAC E-TRANSFER SENT")) return "Transfers";

  // Card payments — covers Amex, CIBC, Scotia, EQ payments, Scene+ "thank you", installments
  if (d.includes("PAYMENT TO AMERICAN") || d.includes("PAYMENT TO CIBC") || d.includes("PAYMENT TO SCOTIA") || d.includes("PAYMENT TO KOODO") || d.includes("CARD LOAD")) return "Card Payment";
  if (d.includes("PAYMENT RECEIVED") || d.includes("PAID TO FLEXIBLE PAYMENT") || d.includes("PAID TO DUE IN FULL") || d.includes("THANK YOU") || d.includes("PAYMENT FROM -")) return "Card Payment";

  // Card fees
  if (d.includes("MEMBERSHIP FEE") || d.includes("INSTALLMENT PLAN")) return "Card Fee";

  // Refunds & credits — before general shopping to catch refunds from those merchants
  if (d.includes("REFUND") || d.includes("RETURN") || d.includes("REVERSAL") || d.includes("USE POINTS FOR PURCHASES") || d.includes("STATEMENT CREDIT") || d.includes("DINING CREDIT") || d.includes("TRAVEL CREDIT") || d.includes("AMAZON SHOP WITH POINTS") || d.includes("NEXUS") || d.includes("STUBHUB")) return "Refund / Credit";

  // Cannabis
  if (d.includes("POT SPOT") || d.includes("VALUEBUD") || d.includes("VALUE BUDS") || d.includes("CANNABIS") || d.includes("CANNA") || d.includes("DISPENSARY") || d.includes("OCS ") || d.includes("SPIRITLEAF") || d.includes("TWEED") || d.includes("TOKYO SMOKE") || d.includes("MISC CANNABIS") || d.includes("ONE PLANT") || d.includes("GROWERS RETAIL")) return "Cannabis";

  // Food delivery
  if (d.includes("UBER EATS") || d.includes("DOORDASH") || d.includes("DASHPASS") || d.includes("SKIP")) return "Food Delivery";

  // Dining & drinks
  if (d.includes("RESTAURANT") || d.includes("CAFE") || d.includes("COFFEE") || d.includes("ESPRESSO") || d.includes("BAKERY") || d.includes("PASTA") || d.includes("SUSHI") || d.includes("GRILL") || d.includes("BISTRO") || d.includes("BREWERY") || d.includes("PIZZA") || d.includes("ICE CREAM") || d.includes("TIM HORTON") || d.includes("STARBUCKS") || d.includes("NOVA ERA") || d.includes("POUR BOY") || d.includes("NORTH OF BROOKLYN") || d.includes("GOOD BEHAVIOUR") || d.includes("WASTED YOUTH") || d.includes("SOVEREIGN") || d.includes("ALMOND BUTTERFLY") || d.includes("LCBO") || d.includes("SAUCY") || d.includes("KIIN") || d.includes("PIZZERIA") || d.includes("BAZAAR") || d.includes("CRAFTY COYOTE") || d.includes("SUNNYS CHINESE") || d.includes("THREE SPEED") || d.includes("ANNEX SOCIAL") || d.includes("CORNER PLACE") || d.includes("RIVOLI") || d.includes("DARK HORSE") || d.includes("ANNABELLE PASTA") || d.includes("GAUCHO") || d.includes("WYCH") || d.includes("AD HOSPITALITY") || d.includes("BANG BANG") || d.includes("TINY MARKET") || d.includes("GREATER GOOD") || d.includes("CHAHALO") || d.includes("ERIKA KULLBERG") || d.includes("BEYOND BANH MI") || d.includes("SUGO TORONTO") || d.includes("SALAD HOUSE") || d.includes("DUFFYS TAVERN") || d.includes("VIVA*KOUTALI") || d.includes("MOSAIKON") || d.includes("SINJEON") || d.includes("EL POCHO") || d.includes("SP J STUDIO")) return "Dining & Drinks";

  // Groceries
  if (d.includes("GROCERY") || d.includes("WALMART") || d.includes("SOBEYS") || d.includes("LOBLAWS") || d.includes("FRESHCO") || d.includes("FORTINOS") || d.includes("NO FRILLS") || d.includes("FARM BOY") || d.includes("FOTO GROCERY") || d.includes("T&T SUPERMARKET") || d.includes("METRO")) return "Groceries";

  // Transit & rideshare
  if (d.includes("UBER ") || d.includes("LYFT") || d.includes("PRESTO") || d.includes("GO TRAIN") || d.includes("FREENOW") || d.includes("BOLT SERVICES") || d.includes("BIKE SHARE TORONTO")) return "Transit & Rideshare";

  // Travel
  if (d.includes("FLIGHT") || d.includes("AIR CANADA") || d.includes("WESTJET") || d.includes("JETBLUE") || d.includes("EMIRATES") || d.includes("TRIP.COM") || d.includes("TRAINLINE") || d.includes("FLIXBUS") || d.includes("HEATHROW") || d.includes("EXPEDIA") || d.includes("BOOKING.COM") || d.includes("CONDOR FRANKFURT") || d.includes("CAASCO TRAVEL") || d.includes("FLYTOTO") || d.includes("AMERICAN EXPRESS ONLINE")) return "Travel - Flights";
  if (d.includes("HOTEL") || d.includes("MARRIOTT") || d.includes("HILTON") || d.includes("AIRBNB") || d.includes("VRBO") || d.includes("ELEPHANT HOSTEL") || d.includes("ENTERPRISE RENT")) return "Travel - Hotels";

  // Entertainment & events
  if (d.includes("TICKETMASTER") || d.includes("POINTS DEVELOPMENT") || d.includes("FANTASY FOOTBALL") || d.includes("USCUSTOMS TRUSTED") || d.includes("UKVI") || d.includes("P1. CORPORATE") || d.includes("FGT*VELD") || d.includes("PAYPAL *RA TICKETS") || d.includes("PAYPAL *RA") || d.includes("ARTBOX")) return "Entertainment & Events";

  // Subscriptions
  if (d.includes("NETFLIX") || d.includes("SPOTIFY") || d.includes("APPLE") || d.includes("GOOGLE") || d.includes("DISNEY") || d.includes("CRAVE") || d.includes("YOUTUBE") || d.includes("WILLOW.TV") || d.includes("RAZORPAY") || d.includes("BILLDESK") || d.includes("HINGE") || d.includes("PUREVPN") || d.includes("FUBOTV") || d.includes("WALMART DELIVERY") || d.includes("CRUNCHYROLL") || d.includes("IMPRINT") || d.includes("POINT.ME") || d.includes("PADDLE.NET")) return "Subscriptions & Apps";

  // Shopping
  if (d.includes("AMAZON") || d.includes("AMZN") || d.includes("BEST BUY") || d.includes("COSTCO") || d.includes("IKEA") || d.includes("UNIQLO") || d.includes("TEMU") || d.includes("DOLLAR BAZAAR") || d.includes("DOLLARAMA") || d.includes("TSHIRT GUYS") || d.includes("MAX RETAIL") || d.includes("NEW BALANCE") || d.includes("ADIDAS") || d.includes("WINNERS") || d.includes("ABSORBSOME") || d.includes("VESSI")) return "Shopping";

  // Health & wellness
  if (d.includes("SHAPE FITNESS") || d.includes("CHIROPATH") || d.includes("ACHES AWAY") || d.includes("ORIGIN WELLNESS") || d.includes("BLOOR FOOT") || d.includes("REXALL") || d.includes("PHARMACY") || d.includes("MEDICAL") || d.includes("DENTAL")) return "Health & Wellness";

  // Bills & utilities
  if (d.includes("FIDO") || d.includes("ROGERS") || d.includes("KOODO") || d.includes("BELL ") || d.includes("TELUS") || d.includes("HYDRO") || d.includes("ENBRIDGE") || d.includes("SQUARE ONE INSURANCE") || d.includes("OXIO.CA") || d.includes("OXIO") || d.includes("DRIVE TEST") || d.includes("MTO TSD") || d.includes("IMMIGRATION CANADA")) return "Bills & Utilities";

  if (d.includes("BET365") || d.includes("DRAFTKINGS") || d.includes("FANDUEL") || d.includes("BETWAY") || d.includes("POINTSBET")) return "Gambling";

  return "Other";
}
