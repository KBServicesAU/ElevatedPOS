/**
 * Industry Feature Flags
 *
 * Maps an industry slug to the set of features that should be
 * automatically enabled for that org. Called during onboarding
 * and whenever the industry is updated in settings.
 */

export interface FeatureFlags {
  // Food & beverage
  tableManagement: boolean;       // Floor plan / table assignment at POS
  restaurantReservations: boolean; // Party-size + time-slot booking with optional deposit
  onlineOrdering: boolean;         // Customers order online for pickup / delivery
  // Retail / ecommerce
  ecommerceWebsite: boolean;       // Storefront with cart + checkout
  // Services / appointments
  serviceReservations: boolean;    // Service + staff + time booking with optional deposit
  appointmentBooking: boolean;     // Alias for service reservations (salons, gyms, etc.)
  // Hospitality extras
  quickService: boolean;           // Optimised fast-ordering flow (cafes, quick-service)
}

const FOOD_SERVICE = ['cafe', 'restaurant', 'bar', 'quick_service'] as const;
const RETAIL = ['retail', 'fashion', 'grocery'] as const;
const SERVICES = ['salon', 'barber', 'gym', 'services'] as const;

export function getFeatureFlagsForIndustry(industry: string): FeatureFlags {
  const isFood = (FOOD_SERVICE as readonly string[]).includes(industry);
  const isRestaurant = ['restaurant', 'bar'].includes(industry);
  const isCafe = ['cafe', 'quick_service'].includes(industry);
  const isRetail = (RETAIL as readonly string[]).includes(industry);
  const isServices = (SERVICES as readonly string[]).includes(industry);

  return {
    tableManagement: isRestaurant || isFood,
    restaurantReservations: isRestaurant,
    onlineOrdering: isFood,
    ecommerceWebsite: isRetail,
    serviceReservations: isServices,
    appointmentBooking: isServices,
    quickService: isCafe,
  };
}

export const INDUSTRY_LABELS: Record<string, string> = {
  cafe: 'Café',
  restaurant: 'Restaurant',
  bar: 'Bar / Pub',
  quick_service: 'Quick Service',
  retail: 'Retail',
  fashion: 'Fashion / Apparel',
  grocery: 'Grocery / Market',
  salon: 'Hair Salon',
  barber: 'Barbershop',
  gym: 'Gym / Fitness',
  services: 'Professional Services',
  other: 'Other',
};

export const ALL_INDUSTRIES = Object.keys(INDUSTRY_LABELS);
