export type Category = {
  id: string;
  name: string;
  sortOrder: number;
};

export type Dish = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: string;
  costPrice: string | null;
  photoUrl: string | null;
  isAvailable: boolean;
  sortOrder: number;
};

export type Table = {
  id: string;
  number: string;
  createdAt: string;
};

export type Statistics = {
  range: {
    from: string;
    to: string;
    groupBy: "day" | "week" | "month";
    timeZone: string;
  };
  totalRevenue: string;
  totalProfit: string | null;
  orderCount: number;
  averageCheck: string | null;
  points: Array<{ date: string; revenue: string; profit: string | null }>;
  topDishes: Array<{ dishName: string; quantity: number }>;
};

export type CategoryInput = { name: string; sort_order: number };
export type DishInput = {
  category_id: string;
  name: string;
  description: string | null;
  price: string | number;
  cost_price: string | number | null;
  photo_url: string | null;
  is_available: boolean;
  sort_order: number;
};
export type TableInput = { number: string };
export type Session = { authenticated: boolean };
export type LoginResult = { ok: boolean };
