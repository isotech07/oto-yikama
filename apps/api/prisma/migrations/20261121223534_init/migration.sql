-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'CASHIER', 'WORKER');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('BEKLIYOR', 'YIKANIYOR', 'KURULANIYOR', 'HAZIR', 'TESLIM_EDILDI', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('NAKIT', 'KART', 'HAVALE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "plate" TEXT NOT NULL,
    "customer_id" UUID,
    "brand" TEXT,
    "model" TEXT,
    "color" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price_kurus" INTEGER NOT NULL,
    "vat_rate_bp" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_orders" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "customer_id" UUID,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'BEKLIYOR',
    "assigned_worker_id" UUID,
    "created_by_id" UUID NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "delivered_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_items" (
    "id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "service_name" TEXT NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "vat_rate_bp" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "amount_kurus" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "received_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_status_logs" (
    "id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "from_status" "WorkOrderStatus",
    "to_status" "WorkOrderStatus" NOT NULL,
    "changed_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_status_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "customers_phone_idx" ON "customers"("phone");

-- CreateIndex
CREATE INDEX "vehicles_customer_id_idx" ON "vehicles"("customer_id");

-- CreateIndex
CREATE INDEX "work_orders_vehicle_id_idx" ON "work_orders"("vehicle_id");

-- CreateIndex
CREATE INDEX "work_orders_customer_id_idx" ON "work_orders"("customer_id");

-- CreateIndex
CREATE INDEX "work_orders_assigned_worker_id_status_idx" ON "work_orders"("assigned_worker_id", "status");

-- CreateIndex
CREATE INDEX "work_orders_status_created_at_idx" ON "work_orders"("status", "created_at");

-- CreateIndex
CREATE INDEX "work_order_items_work_order_id_idx" ON "work_order_items"("work_order_id");

-- CreateIndex
CREATE INDEX "work_order_items_service_id_idx" ON "work_order_items"("service_id");

-- CreateIndex
CREATE INDEX "payments_work_order_id_idx" ON "payments"("work_order_id");

-- CreateIndex
CREATE INDEX "payments_created_at_idx" ON "payments"("created_at");

-- CreateIndex
CREATE INDEX "work_order_status_logs_work_order_id_idx" ON "work_order_status_logs"("work_order_id");

-- CreateIndex
CREATE INDEX "work_order_status_logs_changed_by_id_idx" ON "work_order_status_logs"("changed_by_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assigned_worker_id_fkey" FOREIGN KEY ("assigned_worker_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_status_logs" ADD CONSTRAINT "work_order_status_logs_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_status_logs" ADD CONSTRAINT "work_order_status_logs_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- Elle eklenen kısıtlar (Prisma şemasında ifade edilemiyor)
-- ============================================================

-- Plaka normalize edilmiş olmalı: yalnızca büyük harf ve rakam, boşluksuz.
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_plate_normalized_chk"
  CHECK ("plate" ~ '^[A-Z0-9]{2,12}$');

-- Plaka, silinmemiş araçlar arasında benzersiz.
CREATE UNIQUE INDEX "vehicles_plate_active_key" ON "vehicles" ("plate") WHERE "deleted_at" IS NULL;

-- Aynı araca (dolayısıyla aynı plakaya) aynı anda en fazla bir açık iş emri.
CREATE UNIQUE INDEX "work_orders_one_open_per_vehicle_key" ON "work_orders" ("vehicle_id")
  WHERE "status" NOT IN ('TESLIM_EDILDI', 'CANCELLED') AND "deleted_at" IS NULL;

-- Para ve oran kısıtları
ALTER TABLE "services" ADD CONSTRAINT "services_price_chk" CHECK ("price_kurus" >= 0);
ALTER TABLE "services" ADD CONSTRAINT "services_vat_chk" CHECK ("vat_rate_bp" BETWEEN 0 AND 10000);
ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_price_chk" CHECK ("unit_price" >= 0);
ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_vat_chk" CHECK ("vat_rate_bp" BETWEEN 0 AND 10000);
ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_qty_chk" CHECK ("quantity" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_chk" CHECK ("amount_kurus" <> 0);

-- E-posta küçük harfle saklanır
ALTER TABLE "users" ADD CONSTRAINT "users_email_lower_chk" CHECK ("email" = lower("email"));

-- Durum ile zaman damgaları tutarlı olmalı
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_delivered_chk"
  CHECK (("status" = 'TESLIM_EDILDI') = ("delivered_at" IS NOT NULL));
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_cancelled_chk"
  CHECK (("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL));

-- Ödeme kayıtları hiçbir zaman silinmez veya değiştirilmez.
CREATE FUNCTION "payments_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'payments kayıtları silinemez veya değiştirilemez' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "payments_no_update_delete"
  BEFORE UPDATE OR DELETE ON "payments"
  FOR EACH ROW EXECUTE FUNCTION "payments_immutable"();

CREATE TRIGGER "payments_no_truncate"
  BEFORE TRUNCATE ON "payments"
  FOR EACH STATEMENT EXECUTE FUNCTION "payments_immutable"();
