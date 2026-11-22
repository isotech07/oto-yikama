-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "credit_allowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "credit_limit_kurus" INTEGER,
ADD COLUMN     "sms_consent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sms_consent_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "customer_package_id" UUID,
ALTER COLUMN "work_order_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "work_order_items" ADD COLUMN     "customer_package_id" UUID;

-- CreateTable
CREATE TABLE "business_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL DEFAULT 'Oto Yıkama',
    "address" TEXT,
    "phone" TEXT,
    "tax_office" TEXT,
    "tax_number" TEXT,
    "receipt_footer" TEXT,
    "sms_enabled" BOOLEAN NOT NULL DEFAULT false,
    "sms_ready_template" TEXT NOT NULL DEFAULT 'Sayın {musteri}, {plaka} plakalı aracınız hazır. {isletme}',
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "business_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_closings" (
    "id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "opening_float_kurus" INTEGER NOT NULL,
    "cash_in_kurus" INTEGER NOT NULL,
    "expected_kurus" INTEGER NOT NULL,
    "counted_kurus" INTEGER NOT NULL,
    "difference_kurus" INTEGER NOT NULL,
    "note" TEXT,
    "closed_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_closings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packages" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "service_id" UUID NOT NULL,
    "credits" INTEGER NOT NULL,
    "price_kurus" INTEGER NOT NULL,
    "vat_rate_bp" INTEGER NOT NULL,
    "valid_days" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_packages" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "total_credits" INTEGER NOT NULL,
    "remaining_credits" INTEGER NOT NULL,
    "price_kurus" INTEGER NOT NULL,
    "vat_rate_bp" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "sold_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "work_order_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "to_phone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cash_closings_business_date_key" ON "cash_closings"("business_date");

-- CreateIndex
CREATE INDEX "cash_closings_closed_by_id_idx" ON "cash_closings"("closed_by_id");

-- CreateIndex
CREATE INDEX "packages_service_id_idx" ON "packages"("service_id");

-- CreateIndex
CREATE INDEX "customer_packages_customer_id_idx" ON "customer_packages"("customer_id");

-- CreateIndex
CREATE INDEX "customer_packages_package_id_idx" ON "customer_packages"("package_id");

-- CreateIndex
CREATE INDEX "customer_packages_service_id_idx" ON "customer_packages"("service_id");

-- CreateIndex
CREATE INDEX "customer_packages_sold_by_id_idx" ON "customer_packages"("sold_by_id");

-- CreateIndex
CREATE INDEX "notifications_customer_id_idx" ON "notifications"("customer_id");

-- CreateIndex
CREATE INDEX "notifications_status_next_attempt_at_idx" ON "notifications"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_work_order_id_kind_key" ON "notifications"("work_order_id", "kind");

-- CreateIndex
CREATE INDEX "payments_customer_package_id_idx" ON "payments"("customer_package_id");

-- CreateIndex
CREATE INDEX "work_order_items_customer_package_id_idx" ON "work_order_items"("customer_package_id");

-- AddForeignKey
ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_customer_package_id_fkey" FOREIGN KEY ("customer_package_id") REFERENCES "customer_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_package_id_fkey" FOREIGN KEY ("customer_package_id") REFERENCES "customer_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_closings" ADD CONSTRAINT "cash_closings_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_packages" ADD CONSTRAINT "customer_packages_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_packages" ADD CONSTRAINT "customer_packages_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_packages" ADD CONSTRAINT "customer_packages_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_packages" ADD CONSTRAINT "customer_packages_sold_by_id_fkey" FOREIGN KEY ("sold_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ============================================================
-- Elle eklenen kısıtlar
-- ============================================================

-- İşletme ayarları tek satırdır.
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_singleton_chk" CHECK ("id" = 1);
INSERT INTO "business_settings" ("id", "updated_at") VALUES (1, now()) ON CONFLICT DO NOTHING;

-- Veresiye limiti negatif olamaz.
ALTER TABLE "customers" ADD CONSTRAINT "customers_credit_limit_chk" CHECK ("credit_limit_kurus" IS NULL OR "credit_limit_kurus" >= 0);

-- Ödeme tam olarak bir kaynağa aittir: iş emri ya da paket satışı.
ALTER TABLE "payments" ADD CONSTRAINT "payments_one_target_chk"
  CHECK (("work_order_id" IS NOT NULL)::int + ("customer_package_id" IS NOT NULL)::int = 1);

-- Paket tanımı
ALTER TABLE "packages" ADD CONSTRAINT "packages_credits_chk" CHECK ("credits" BETWEEN 1 AND 1000);
ALTER TABLE "packages" ADD CONSTRAINT "packages_price_chk" CHECK ("price_kurus" >= 0);
ALTER TABLE "packages" ADD CONSTRAINT "packages_vat_chk" CHECK ("vat_rate_bp" BETWEEN 0 AND 10000);
ALTER TABLE "packages" ADD CONSTRAINT "packages_valid_days_chk" CHECK ("valid_days" IS NULL OR "valid_days" > 0);

-- Satılan paket: kalan kredi 0 ile toplam arasında (eksiye düşemez).
ALTER TABLE "customer_packages" ADD CONSTRAINT "customer_packages_credits_chk"
  CHECK ("remaining_credits" >= 0 AND "remaining_credits" <= "total_credits" AND "total_credits" > 0);
ALTER TABLE "customer_packages" ADD CONSTRAINT "customer_packages_price_chk" CHECK ("price_kurus" >= 0);

-- Paketle karşılanan kalemin fiyatı 0'dır (ciro paket satışında sayılır).
ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_package_price_chk"
  CHECK ("customer_package_id" IS NULL OR "unit_price" = 0);

-- Kasa kapanışı: tutarlar tutarlı ve kayıt değiştirilemez/silinemez.
ALTER TABLE "cash_closings" ADD CONSTRAINT "cash_closings_math_chk"
  CHECK ("expected_kurus" = "opening_float_kurus" + "cash_in_kurus"
     AND "difference_kurus" = "counted_kurus" - "expected_kurus"
     AND "counted_kurus" >= 0 AND "opening_float_kurus" >= 0);

CREATE FUNCTION "cash_closings_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'cash_closings kayıtları silinemez veya değiştirilemez' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "cash_closings_no_update_delete" BEFORE UPDATE OR DELETE ON "cash_closings"
  FOR EACH ROW EXECUTE FUNCTION "cash_closings_immutable"();

-- Bildirim deneme sayısı
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_attempts_chk" CHECK ("attempts" >= 0);
