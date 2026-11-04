-- CreateEnum
CREATE TYPE "LoadType" AS ENUM ('FCL', 'LCL');

-- CreateEnum
CREATE TYPE "ChargeAppliesTo" AS ENUM ('FCL', 'LCL', 'ALL');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('EXPORT', 'IMPORT');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('OPEN', 'COST_CHECKED', 'COST_APPROVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkOrderItemStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingMode" AS ENUM ('FIXED', 'AT_COST');

-- CreateEnum
CREATE TYPE "CostBearer" AS ENUM ('COMPANY', 'VENDOR', 'DEDUCT_FROM_VENDOR');

-- CreateEnum
CREATE TYPE "CashAdvanceType" AS ENUM ('OPERATIONAL', 'DRIVER_ALLOWANCE');

-- CreateEnum
CREATE TYPE "CashAdvanceStatus" AS ENUM ('DRAFT', 'CHECKED', 'APPROVED', 'PAID', 'TRANSFER_VERIFIED', 'REPORT_SUBMITTED', 'REPORT_CHECKED', 'REPORT_APPROVED', 'SETTLED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AdvanceReturnStatus" AS ENUM ('DRAFT', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AdvanceReturnDirection" AS ENUM ('RETURN_TO_COMPANY', 'REIMBURSE_STAFF');

-- CreateEnum
CREATE TYPE "ApprovalDocType" AS ENUM ('WORK_ORDER_COST', 'CASH_ADVANCE', 'ADVANCE_RETURN');

-- CreateEnum
CREATE TYPE "ApprovalStep" AS ENUM ('CHECK', 'APPROVE', 'PAY', 'VERIFY_TRANSFER', 'REPORT_SUBMIT', 'REPORT_CHECK', 'REPORT_APPROVE', 'RECEIVE');

-- CreateEnum
CREATE TYPE "ApprovalAction" AS ENUM ('DONE', 'REJECT', 'REVERT');

-- CreateEnum
CREATE TYPE "AttachmentOwnerType" AS ENUM ('CASH_ADVANCE', 'CASH_ADVANCE_ITEM', 'CASH_ADVANCE_EXTRA_COST', 'ADVANCE_RETURN', 'WORK_ORDER_ITEM');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('RECEIPT', 'PHOTO', 'PDF', 'TRANSFER_PROOF');

-- CreateEnum
CREATE TYPE "AccountingEventStatus" AS ENUM ('PENDING', 'POSTED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "full_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "invoice_name" TEXT,
    "payment_terms_days" INTEGER NOT NULL DEFAULT 0,
    "entity_code" TEXT NOT NULL DEFAULT 'AGS',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charge_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "applies_to" "ChargeAppliesTo" NOT NULL DEFAULT 'ALL',
    "use_actual_cost" BOOLEAN NOT NULL DEFAULT false,
    "billing_mode" "BillingMode" NOT NULL DEFAULT 'FIXED',
    "is_trucking" BOOLEAN NOT NULL DEFAULT false,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "default_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "default_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "revenue_account" TEXT,
    "cost_account" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "charge_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "plate_no" TEXT NOT NULL,
    "owner_code" TEXT,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_accounts" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "cash_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_orders" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "order_date" DATE NOT NULL,
    "customer_id" UUID NOT NULL,
    "brand" TEXT,
    "project" TEXT,
    "entity_code" TEXT NOT NULL DEFAULT 'AGS',
    "is_dummy" BOOLEAN NOT NULL DEFAULT false,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'OPEN',
    "cost_note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_items" (
    "id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "direction" "Direction",
    "reference_no" TEXT,
    "load_type" "LoadType" NOT NULL DEFAULT 'FCL',
    "container_size" TEXT,
    "container_no" TEXT,
    "seal_no" TEXT,
    "vehicle_id" UUID,
    "driver_id" UUID,
    "origin" TEXT,
    "destination" TEXT,
    "status" "WorkOrderItemStatus" NOT NULL DEFAULT 'DRAFT',

    CONSTRAINT "work_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planned_costs" (
    "id" UUID NOT NULL,
    "work_order_item_id" UUID NOT NULL,
    "charge_type_id" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL DEFAULT 1,
    "unit_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "bearer" "CostBearer" NOT NULL DEFAULT 'COMPANY',
    "bearer_note" TEXT,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "planned_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billable_charges" (
    "id" UUID NOT NULL,
    "work_order_item_id" UUID NOT NULL,
    "charge_type_id" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "invoice_id" UUID,
    "note" TEXT,

    CONSTRAINT "billable_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_advances" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "advance_type" "CashAdvanceType" NOT NULL DEFAULT 'OPERATIONAL',
    "work_order_id" UUID NOT NULL,
    "advance_date" DATE NOT NULL,
    "recipient" TEXT NOT NULL,
    "holder_user_id" UUID,
    "cash_account_id" UUID,
    "transfer_fee" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "description" TEXT,
    "status" "CashAdvanceStatus" NOT NULL DEFAULT 'DRAFT',
    "required_steps" "ApprovalStep"[] DEFAULT ARRAY[]::"ApprovalStep"[],
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cash_advances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_advance_items" (
    "id" UUID NOT NULL,
    "cash_advance_id" UUID NOT NULL,
    "planned_cost_id" UUID NOT NULL,
    "advance_amount" DECIMAL(18,2) NOT NULL,
    "actual_amount" DECIMAL(18,2),
    "note" TEXT,

    CONSTRAINT "cash_advance_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_advance_extra_costs" (
    "id" UUID NOT NULL,
    "cash_advance_id" UUID NOT NULL,
    "work_order_item_id" UUID NOT NULL,
    "charge_type_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,

    CONSTRAINT "cash_advance_extra_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advance_returns" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "direction" "AdvanceReturnDirection" NOT NULL DEFAULT 'RETURN_TO_COMPANY',
    "return_date" DATE NOT NULL,
    "returned_by" TEXT NOT NULL,
    "cash_account_id" UUID,
    "status" "AdvanceReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advance_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advance_return_items" (
    "id" UUID NOT NULL,
    "advance_return_id" UUID NOT NULL,
    "cash_advance_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "advance_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_history" (
    "id" UUID NOT NULL,
    "doc_type" "ApprovalDocType" NOT NULL,
    "doc_id" UUID NOT NULL,
    "step" "ApprovalStep" NOT NULL,
    "action" "ApprovalAction" NOT NULL,
    "actor_id" UUID NOT NULL,
    "acted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "approval_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "owner_type" "AttachmentOwnerType" NOT NULL,
    "owner_id" UUID NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "uploaded_by" UUID,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_events" (
    "id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" UUID NOT NULL,
    "status" "AccountingEventStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "posted_at" TIMESTAMPTZ(6),

    CONSTRAINT "accounting_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_settings" (
    "id" UUID NOT NULL,
    "doc_type" "ApprovalDocType" NOT NULL,
    "step" "ApprovalStep" NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "min_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workflow_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_setting_logs" (
    "id" UUID NOT NULL,
    "setting_id" UUID NOT NULL,
    "old_value" JSONB NOT NULL,
    "new_value" JSONB NOT NULL,
    "changed_by" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_setting_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_code_key" ON "customers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "charge_types_code_key" ON "charge_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_plate_no_key" ON "vehicles"("plate_no");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_code_key" ON "drivers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "cash_accounts_code_key" ON "cash_accounts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_number_key" ON "work_orders"("number");

-- CreateIndex
CREATE INDEX "work_orders_order_date_customer_id_idx" ON "work_orders"("order_date", "customer_id");

-- CreateIndex
CREATE INDEX "work_order_items_container_no_idx" ON "work_order_items"("container_no");

-- CreateIndex
CREATE INDEX "work_order_items_vehicle_id_idx" ON "work_order_items"("vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_items_work_order_id_line_no_key" ON "work_order_items"("work_order_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "planned_costs_work_order_item_id_charge_type_id_key" ON "planned_costs"("work_order_item_id", "charge_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "billable_charges_work_order_item_id_charge_type_id_key" ON "billable_charges"("work_order_item_id", "charge_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_advances_number_key" ON "cash_advances"("number");

-- CreateIndex
CREATE INDEX "cash_advances_work_order_id_idx" ON "cash_advances"("work_order_id");

-- CreateIndex
CREATE INDEX "cash_advances_status_advance_date_idx" ON "cash_advances"("status", "advance_date");

-- CreateIndex
CREATE INDEX "cash_advance_items_planned_cost_id_idx" ON "cash_advance_items"("planned_cost_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_advance_items_cash_advance_id_planned_cost_id_key" ON "cash_advance_items"("cash_advance_id", "planned_cost_id");

-- CreateIndex
CREATE INDEX "cash_advance_extra_costs_cash_advance_id_idx" ON "cash_advance_extra_costs"("cash_advance_id");

-- CreateIndex
CREATE INDEX "cash_advance_extra_costs_charge_type_id_idx" ON "cash_advance_extra_costs"("charge_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "advance_returns_number_key" ON "advance_returns"("number");

-- CreateIndex
CREATE UNIQUE INDEX "advance_return_items_advance_return_id_cash_advance_id_key" ON "advance_return_items"("advance_return_id", "cash_advance_id");

-- CreateIndex
CREATE INDEX "approval_history_doc_type_doc_id_acted_at_idx" ON "approval_history"("doc_type", "doc_id", "acted_at");

-- CreateIndex
CREATE INDEX "attachments_owner_type_owner_id_idx" ON "attachments"("owner_type", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_settings_doc_type_step_key" ON "workflow_settings"("doc_type", "step");

-- CreateIndex
CREATE INDEX "workflow_setting_logs_setting_id_changed_at_idx" ON "workflow_setting_logs"("setting_id", "changed_at");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_costs" ADD CONSTRAINT "planned_costs_work_order_item_id_fkey" FOREIGN KEY ("work_order_item_id") REFERENCES "work_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_costs" ADD CONSTRAINT "planned_costs_charge_type_id_fkey" FOREIGN KEY ("charge_type_id") REFERENCES "charge_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_costs" ADD CONSTRAINT "planned_costs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billable_charges" ADD CONSTRAINT "billable_charges_work_order_item_id_fkey" FOREIGN KEY ("work_order_item_id") REFERENCES "work_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billable_charges" ADD CONSTRAINT "billable_charges_charge_type_id_fkey" FOREIGN KEY ("charge_type_id") REFERENCES "charge_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_advances" ADD CONSTRAINT "cash_advances_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_advances" ADD CONSTRAINT "cash_advances_holder_user_id_fkey" FOREIGN KEY ("holder_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_advances" ADD CONSTRAINT "cash_advances_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_advances" ADD CONSTRAINT "cash_advances_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_advance_items" ADD CONSTRAINT "cash_advance_items_cash_advance_id_fkey" FOREIGN KEY ("cash_advance_id") REFERENCES "cash_advances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_advance_items" ADD CONSTRAINT "cash_advance_items_planned_cost_id_fkey" FOREIGN KEY ("planned_cost_id") REFERENCES "planned_costs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_advance_extra_costs" ADD CONSTRAINT "cash_advance_extra_costs_cash_advance_id_fkey" FOREIGN KEY ("cash_advance_id") REFERENCES "cash_advances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_advance_extra_costs" ADD CONSTRAINT "cash_advance_extra_costs_work_order_item_id_fkey" FOREIGN KEY ("work_order_item_id") REFERENCES "work_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_advance_extra_costs" ADD CONSTRAINT "cash_advance_extra_costs_charge_type_id_fkey" FOREIGN KEY ("charge_type_id") REFERENCES "charge_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advance_returns" ADD CONSTRAINT "advance_returns_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advance_returns" ADD CONSTRAINT "advance_returns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advance_return_items" ADD CONSTRAINT "advance_return_items_advance_return_id_fkey" FOREIGN KEY ("advance_return_id") REFERENCES "advance_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advance_return_items" ADD CONSTRAINT "advance_return_items_cash_advance_id_fkey" FOREIGN KEY ("cash_advance_id") REFERENCES "cash_advances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_history" ADD CONSTRAINT "approval_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_settings" ADD CONSTRAINT "workflow_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_setting_logs" ADD CONSTRAINT "workflow_setting_logs_setting_id_fkey" FOREIGN KEY ("setting_id") REFERENCES "workflow_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_setting_logs" ADD CONSTRAINT "workflow_setting_logs_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
