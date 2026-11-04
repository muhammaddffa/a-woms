-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "work_order_items" ADD COLUMN     "actual_container_size" TEXT,
ADD COLUMN     "current_position_id" UUID,
ADD COLUMN     "position_note" TEXT,
ADD COLUMN     "position_updated_at" TIMESTAMPTZ(6),
ADD COLUMN     "stuffing_location" TEXT,
ADD COLUMN     "tare" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "container_positions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "container_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "container_position_logs" (
    "id" UUID NOT NULL,
    "work_order_item_id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "note" TEXT,
    "actor_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "container_position_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "container_positions_code_key" ON "container_positions"("code");

-- CreateIndex
CREATE INDEX "container_position_logs_work_order_item_id_created_at_idx" ON "container_position_logs"("work_order_item_id", "created_at");

-- CreateIndex
CREATE INDEX "work_order_items_current_position_id_idx" ON "work_order_items"("current_position_id");

-- AddForeignKey
ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_current_position_id_fkey" FOREIGN KEY ("current_position_id") REFERENCES "container_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_position_logs" ADD CONSTRAINT "container_position_logs_work_order_item_id_fkey" FOREIGN KEY ("work_order_item_id") REFERENCES "work_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_position_logs" ADD CONSTRAINT "container_position_logs_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "container_positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_position_logs" ADD CONSTRAINT "container_position_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
