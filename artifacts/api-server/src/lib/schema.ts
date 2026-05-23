import { pgTable, text, integer, doublePrecision, varchar } from 'drizzle-orm/pg-core';

export const orders = pgTable('orders', {
  id: text('id').primaryKey(),
  symbol: text('symbol').notNull(),
  side: varchar('side', { length: 10 }).notNull(),
  quantity: integer('quantity').notNull(),
  price: doublePrecision('price'),
  orderType: varchar('order_type', { length: 20 }).notNull(),
  product: varchar('product', { length: 20 }).notNull(),
  exchange: varchar('exchange', { length: 10 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  executionTime: doublePrecision('execution_time'),
  slippage: doublePrecision('slippage'),
  timestamp: doublePrecision('timestamp').notNull(),
});

export const positions = pgTable('positions', {
  symbol: text('symbol').primaryKey(),
  quantity: integer('quantity').notNull(),
  avgPrice: doublePrecision('avg_price').notNull(),
  currentPrice: doublePrecision('current_price').notNull(),
  unrealizedPnL: doublePrecision('unrealized_pnl').notNull(),
  realizedPnL: doublePrecision('realized_pnl').notNull(),
  marketValue: doublePrecision('market_value').notNull(),
  timestamp: doublePrecision('timestamp').notNull(),
});