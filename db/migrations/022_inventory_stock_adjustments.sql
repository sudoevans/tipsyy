ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_movement_type_check;
ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_movement_type_check CHECK (movement_type IN ('INITIAL_STOCK', 'RESTOCK', 'ADJUSTMENT'));
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_on_hand_after_check CHECK (on_hand_after >= 0 AND (movement_type = 'ADJUSTMENT' OR on_hand_after >= on_hand_before));
