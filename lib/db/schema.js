const { pgTable, serial, varchar, boolean, integer, timestamp, index, unique } = require('drizzle-orm/pg-core');

const tickets = pgTable('tickets', {
  id: serial('id').primaryKey(),
  orderNo: varchar('order_no', { length: 50 }).notNull(),
  orderDate: varchar('order_date', { length: 20 }).notNull(),
  shopifyId: varchar('shopify_id', { length: 50 }).notNull(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  totalPrice: varchar('total_price', { length: 20 }).notNull().default('0'),
  financialStatus: varchar('financial_status', { length: 50 }).notNull().default(''),
  fulfillmentStatus: varchar('fulfillment_status', { length: 50 }).notNull().default(''),
  productName: varchar('product_name', { length: 500 }).notNull(),
  variant: varchar('variant', { length: 255 }).notNull().default(''),
  price: varchar('price', { length: 20 }).notNull().default('0'),
  lineItemId: varchar('line_item_id', { length: 50 }).notNull().default(''),
  itemSubNo: integer('item_sub_no').notNull().default(0),
  isUsable: boolean('is_usable').notNull().default(true),
  ownerShopifyId: varchar('owner_shopify_id', { length: 50 }).notNull(),
  reservedSeat: varchar('reserved_seat', { length: 50 }).notNull().default(''),
  color: varchar('color', { length: 20 }),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_tickets_owner_shopify_id').on(table.ownerShopifyId),
  index('idx_tickets_is_usable').on(table.isUsable),
  index('idx_tickets_shopify_id').on(table.shopifyId),
  index('idx_tickets_order_no').on(table.orderNo),
  unique('unique_ticket_line_item').on(table.lineItemId, table.itemSubNo),
]);

const ticketTags = pgTable('ticket_tags', {
  id: serial('id').primaryKey(),
  ticketId: integer('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  tag: varchar('tag', { length: 255 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
}, (table) => [
  index('idx_ticket_tags_ticket_id').on(table.ticketId),
  index('idx_ticket_tags_tag').on(table.tag),
]);

// contests テーブル
const contests = pgTable('contests', {
  id: serial('id').primaryKey(),
  contestName: varchar('contest_name', { length: 255 }).notNull(),
  contestDate: varchar('contest_date', { length: 20 }).notNull(),
  contestPlace: varchar('contest_place', { length: 255 }),
  isReady: boolean('is_ready').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_contests_contest_date').on(table.contestDate),
  index('idx_contests_is_ready').on(table.isReady),
]);

// guests テーブル
const guests = pgTable('guests', {
  id: serial('id').primaryKey(),
  contestDate: varchar('contest_date', { length: 20 }),
  contestName: varchar('contest_name', { length: 255 }),
  ticketType: varchar('ticket_type', { length: 100 }),
  groupType: varchar('group_type', { length: 100 }),
  nameJa: varchar('name_ja', { length: 255 }).notNull(),
  passType: varchar('pass_type', { length: 100 }),
  companyJa: varchar('company_ja', { length: 255 }),
  requestType: varchar('request_type', { length: 100 }),
  ticketCount: integer('ticket_count').default(0),
  isCheckedIn: boolean('is_checked_in').default(false),
  note: varchar('note', { length: 1000 }),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  contactPerson: varchar('contact_person', { length: 255 }),
  isPreNotified: boolean('is_pre_notified').default(false),
  isPostMailed: boolean('is_post_mailed').default(false),
  isValid: boolean('is_valid').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'),
  restoredAt: timestamp('restored_at'),
}, (table) => [
  index('idx_guests_contest_name').on(table.contestName),
  index('idx_guests_name_ja').on(table.nameJa),
  index('idx_guests_is_valid').on(table.isValid),
]);

// users テーブル
const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull().default('user'),
  isValid: boolean('is_valid').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'),
  restoredAt: timestamp('restored_at'),
}, (table) => [
  index('idx_users_email').on(table.email),
  index('idx_users_is_valid').on(table.isValid),
]);

// subjects テーブル（ポリシー違反認定者）
const subjects = pgTable('subjects', {
  id: serial('id').primaryKey(),
  fwjCardNo: varchar('fwj_card_no', { length: 50 }).notNull(),
  nameJa: varchar('name_ja', { length: 255 }).notNull(),
  firstName: varchar('first_name', { length: 255 }).notNull(),
  lastName: varchar('last_name', { length: 255 }).notNull(),
  npcMemberNo: varchar('npc_member_no', { length: 50 }),
  note: varchar('note', { length: 1000 }),
  isValid: boolean('is_valid').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'),
  restoredAt: timestamp('restored_at'),
}, (table) => [
  index('idx_subjects_fwj_card_no').on(table.fwjCardNo),
  index('idx_subjects_name_ja').on(table.nameJa),
  index('idx_subjects_is_valid').on(table.isValid),
]);

// notes テーブル（特記事項）
const notes = pgTable('notes', {
  id: serial('id').primaryKey(),
  contestDate: varchar('contest_date', { length: 20 }).notNull(),
  contestName: varchar('contest_name', { length: 255 }).notNull(),
  nameJa: varchar('name_ja', { length: 255 }).notNull(),
  type: varchar('type', { length: 100 }).notNull(),
  playerNo: varchar('player_no', { length: 50 }),
  fwjCardNo: varchar('fwj_card_no', { length: 50 }),
  npcMemberNo: varchar('npc_member_no', { length: 50 }),
  firstName: varchar('first_name', { length: 255 }),
  lastName: varchar('last_name', { length: 255 }),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  note: varchar('note', { length: 2000 }),
  isValid: boolean('is_valid').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'),
  restoredAt: timestamp('restored_at'),
}, (table) => [
  index('idx_notes_contest_name').on(table.contestName),
  index('idx_notes_contest_date').on(table.contestDate),
  index('idx_notes_fwj_card_no').on(table.fwjCardNo),
  index('idx_notes_is_valid').on(table.isValid),
]);

// scores テーブル（大会成績）
const scores = pgTable('scores', {
  id: serial('id').primaryKey(),
  fwjCardNo: varchar('fwj_card_no', { length: 50 }),
  contestDate: varchar('contest_date', { length: 20 }).notNull(),
  contestName: varchar('contest_name', { length: 255 }).notNull(),
  contestPlace: varchar('contest_place', { length: 255 }),
  categoryName: varchar('category_name', { length: 255 }).notNull(),
  placing: varchar('placing', { length: 20 }),
  playerNo: varchar('player_no', { length: 50 }),
  playerName: varchar('player_name', { length: 255 }),
  isValid: boolean('is_valid').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'),
  restoredAt: timestamp('restored_at'),
}, (table) => [
  index('idx_scores_fwj_card_no').on(table.fwjCardNo),
  index('idx_scores_contest_date').on(table.contestDate),
  index('idx_scores_contest_name').on(table.contestName),
  index('idx_scores_category_name').on(table.categoryName),
  index('idx_scores_is_valid').on(table.isValid),
]);

// members テーブル
const members = pgTable('members', {
  id: serial('id').primaryKey(),
  shopifyId: varchar('shopify_id', { length: 50 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  firstName: varchar('first_name', { length: 255 }),
  lastName: varchar('last_name', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  tags: varchar('tags', { length: 1000 }),
  address1: varchar('address1', { length: 500 }),
  address2: varchar('address2', { length: 500 }),
  city: varchar('city', { length: 255 }),
  province: varchar('province', { length: 255 }),
  zip: varchar('zip', { length: 20 }),
  country: varchar('country', { length: 100 }),
  // FWJ固有フィールド
  fwjEffectiveDate: varchar('fwj_effectivedate', { length: 20 }),
  fwjBirthday: varchar('fwj_birthday', { length: 20 }),
  fwjCardNo: varchar('fwj_card_no', { length: 50 }),
  fwjNationality: varchar('fwj_nationality', { length: 100 }),
  fwjSex: varchar('fwj_sex', { length: 20 }),
  fwjFirstName: varchar('fwj_firstname', { length: 255 }),
  fwjLastName: varchar('fwj_lastname', { length: 255 }),
  fwjKanaFirstName: varchar('fwj_kanafirstname', { length: 255 }),
  fwjKanaLastName: varchar('fwj_kanalastname', { length: 255 }),
  fwjHeight: varchar('fwj_height', { length: 20 }),
  fwjWeight: varchar('fwj_weight', { length: 20 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_members_shopify_id').on(table.shopifyId),
  index('idx_members_email').on(table.email),
  index('idx_members_fwj_card_no').on(table.fwjCardNo),
]);

// orders テーブル
const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  orderNo: varchar('order_no', { length: 50 }).notNull(),
  orderDate: varchar('order_date', { length: 30 }),
  shopifyId: varchar('shopify_id', { length: 50 }),
  fullName: varchar('full_name', { length: 255 }),
  email: varchar('email', { length: 255 }),
  totalPrice: varchar('total_price', { length: 20 }),
  financialStatus: varchar('financial_status', { length: 50 }),
  fulfillmentStatus: varchar('fulfillment_status', { length: 50 }),
  productName: varchar('product_name', { length: 500 }),
  variant: varchar('variant', { length: 255 }),
  quantity: integer('quantity').default(0),
  currentQuantity: integer('current_quantity').default(0),
  price: varchar('price', { length: 20 }),
  lineItemId: varchar('line_item_id', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_orders_order_no').on(table.orderNo),
  index('idx_orders_shopify_id').on(table.shopifyId),
  index('idx_orders_line_item_id').on(table.lineItemId),
]);

// orderTags テーブル（注文タグ用）
const orderTags = pgTable('order_tags', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  tag: varchar('tag', { length: 255 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
}, (table) => [
  index('idx_order_tags_order_id').on(table.orderId),
  index('idx_order_tags_tag').on(table.tag),
]);


// orderExportMeta テーブル（エクスポートメタデータ）
const orderExportMeta = pgTable('order_export_meta', {
  id: serial('id').primaryKey(),
  searchTags: varchar('search_tags', { length: 1000 }),  // 検索タグ（JSON配列）
  searchProductType: varchar('search_product_type', { length: 255 }),  // 検索商品タイプ
  paidOnly: boolean('paid_only').default(true),
  exportedAt: timestamp('exported_at').defaultNow(),
  orderCount: integer('order_count').default(0),
  rowCount: integer('row_count').default(0),
});

// registrations テーブル（大会登録）
const registrations = pgTable('registrations', {
  id: serial('id').primaryKey(),
  contestDate: varchar('contest_date', { length: 20 }).notNull(),
  contestName: varchar('contest_name', { length: 255 }).notNull(),
  playerNo: varchar('player_no', { length: 50 }),
  nameJa: varchar('name_ja', { length: 255 }),
  nameJaKana: varchar('name_ja_kana', { length: 255 }),
  fwjCardNo: varchar('fwj_card_no', { length: 50 }),
  firstName: varchar('first_name', { length: 255 }),
  lastName: varchar('last_name', { length: 255 }),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  country: varchar('country', { length: 100 }),
  age: varchar('age', { length: 10 }),
  className: varchar('class_name', { length: 255 }),
  sortIndex: varchar('sort_index', { length: 50 }),
  scoreCard: varchar('score_card', { length: 50 }),
  contestOrder: varchar('contest_order', { length: 50 }),
  height: varchar('height', { length: 20 }),
  weight: varchar('weight', { length: 20 }),
  occupation: varchar('occupation', { length: 255 }),
  instagram: varchar('instagram', { length: 255 }),
  biography: varchar('biography', { length: 2000 }),
  isValid: boolean('is_valid').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'),
  restoredAt: timestamp('restored_at'),
}, (table) => [
  index('idx_registrations_contest_date').on(table.contestDate),
  index('idx_registrations_contest_name').on(table.contestName),
  index('idx_registrations_fwj_card_no').on(table.fwjCardNo),
  index('idx_registrations_class_name').on(table.className),
  index('idx_registrations_is_valid').on(table.isValid),
]);

module.exports = { tickets, ticketTags, contests, guests, users, subjects, notes, scores, registrations, members, orders, orderTags, orderExportMeta };
