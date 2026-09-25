import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
export const poolState = sqliteTable('pool_state', {
  id: integer('id').primaryKey(),
  revision: integer('revision').notNull(),
  state: text('state').notNull(),
});
export const throttle = sqliteTable('throttle', {
  key: text('key').primaryKey(),
  until: integer('until').notNull(),
  count: integer('count').notNull().default(0),
});
