ALTER TABLE products ADD COLUMN sku text;
UPDATE products SET sku = 'TT-PROD-' || upper(regexp_replace(slug, '[^a-zA-Z0-9]+', '-', 'g')) WHERE sku IS NULL;
ALTER TABLE products ALTER COLUMN sku SET NOT NULL;
ALTER TABLE products ADD CONSTRAINT products_sku_key UNIQUE (sku);
