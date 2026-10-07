INSERT INTO delivery_areas (
  slug, name, secondary_name, fee_minor, latitude, longitude,
  service_radius_km, estimated_min_minutes, estimated_max_minutes, sort_order
) VALUES
  ('karatina-university-kagochi', 'Karatina University — Kagochi', 'Kagochi, Nyeri', 250, -0.482236, 37.126167, 6, 30, 55, 10),
  ('karatina-town', 'Karatina Town', 'Karatina, Nyeri', 250, -0.484006, 37.127897, 7, 25, 50, 20),
  ('ihwagi', 'Ihwagi', 'Karatina, Nyeri', 300, -0.451800, 37.115900, 8, 35, 65, 30),
  ('kibirigwi', 'Kibirigwi', 'Kianyaga, Nyeri', 350, -0.409900, 37.209700, 12, 45, 80, 40),
  ('kinoo-ward', 'Kinoo ward', 'Kikuyu, Kiambu', 250, -1.255910, 36.700180, 8, 30, 55, 50)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  secondary_name = EXCLUDED.secondary_name,
  fee_minor = EXCLUDED.fee_minor,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  service_radius_km = EXCLUDED.service_radius_km,
  estimated_min_minutes = EXCLUDED.estimated_min_minutes,
  estimated_max_minutes = EXCLUDED.estimated_max_minutes,
  active = true,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

INSERT INTO categories (slug, name, image_url, sort_order) VALUES
  ('whisky', 'Whisky', 'https://images.unsplash.com/photo-1527281400683-1aae777175f8?auto=format&fit=crop&w=600&q=85', 10),
  ('spirits', 'Spirits', 'https://images.unsplash.com/photo-1547595628-c61a29f496f0?auto=format&fit=crop&w=600&q=85', 20),
  ('rum', 'Rum', 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f?auto=format&fit=crop&w=600&q=85', 30),
  ('beer', 'Beer', 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=85', 40),
  ('wine', 'Wine', 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?auto=format&fit=crop&w=600&q=85', 50),
  ('vodka', 'Vodka', 'https://images.unsplash.com/photo-1547595628-c61a29f496f0?auto=format&fit=crop&w=600&q=85', 60),
  ('mixers', 'Mixers', 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=85', 70),
  ('gin', 'Gin', 'https://images.unsplash.com/photo-1574096079513-d8259312b785?auto=format&fit=crop&w=600&q=85', 80)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  image_url = EXCLUDED.image_url,
  active = true,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

INSERT INTO brands (slug, name) VALUES
  ('glenmorangie', 'Glenmorangie'),
  ('jack-daniels', 'Jack Daniel''s'),
  ('johnnie-walker', 'Johnnie Walker'),
  ('chalawan', 'Chalawan'),
  ('woodford-reserve', 'Woodford Reserve'),
  ('glenlivet', 'The Glenlivet'),
  ('kenya-cane', 'Kenya Cane'),
  ('vat-69', 'VAT 69'),
  ('kane-extra', 'Kane Extra'),
  ('captain-morgan', 'Captain Morgan'),
  ('black-and-white', 'Black & White'),
  ('viceroy', 'Viceroy'),
  ('general-meakins', 'General Meakins'),
  ('hunters-choice', 'Hunter''s Choice'),
  ('county', 'County'),
  ('gilbeys', 'Gilbey''s'),
  ('four-cousins', 'Four Cousins'),
  ('caprice', 'Caprice'),
  ('4th-street', '4th Street'),
  ('manyatta', 'Manyatta'),
  ('smirnoff', 'Smirnoff'),
  ('coca-cola', 'Coca-Cola')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, active = true, updated_at = now();

WITH product_seed(slug, name, category_slug, brand_slug, image_url, abv, active, featured) AS (VALUES
  ('glenmorangie', 'Glenmorangie Original 10', 'whisky', 'glenmorangie', 'https://images.unsplash.com/photo-1569529465841-dfecdab7503b?auto=format&fit=crop&w=900&q=85', 40.0, true, true),
  ('jack-daniels', 'Jack Daniel''s Old No. 7', 'whisky', 'jack-daniels', 'https://images.unsplash.com/photo-1527281400683-1aae777175f8?auto=format&fit=crop&w=900&q=85', 40.0, true, true),
  ('red-label', 'Johnnie Walker Red Label', 'whisky', 'johnnie-walker', '/images/products/red-label.jpg', 40.0, true, true),
  ('chalawan', 'Chalawan Pale Ale', 'beer', 'chalawan', 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=900&q=85', 4.7, true, false),
  ('woodford', 'Woodford Reserve', 'whisky', 'woodford-reserve', 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f?auto=format&fit=crop&w=900&q=85', 43.2, true, true),
  ('glenlivet', 'The Glenlivet 12 Year', 'whisky', 'glenlivet', 'https://images.unsplash.com/photo-1535958636474-b021ee887b13?auto=format&fit=crop&w=900&q=85', 40.0, true, false),
  ('kc-pineapple', 'KC Pineapple', 'spirits', 'kenya-cane', '/images/products/kc-pineapple.jpg', NULL, true, false),
  ('kc-ginger', 'KC Ginger', 'spirits', 'kenya-cane', '/images/products/kc-ginger.jpg', NULL, true, false),
  ('kc-smooth', 'KC Smooth', 'spirits', 'kenya-cane', NULL, NULL, true, false),
  ('vat-69', 'VAT 69', 'whisky', 'vat-69', NULL, NULL, true, false),
  ('kane-extra', 'Kane Extra', 'spirits', 'kane-extra', '/images/products/kane-extra.jpg', NULL, true, false),
  ('captain-morgan-gold', 'Captain Morgan Gold', 'rum', 'captain-morgan', '/images/products/captain-morgan-gold.jpg', NULL, true, false),
  ('captain-morgan-muck-pit', 'Captain Morgan Muck Pit', 'rum', 'captain-morgan', '/images/products/captain-morgan-muck-pit.jpg', NULL, true, false),
  ('black-and-white', 'Black & White', 'whisky', 'black-and-white', NULL, NULL, true, false),
  ('viceroy', 'Viceroy', 'spirits', 'viceroy', '/images/products/viceroy.jpg', NULL, true, false),
  ('general-meakins', 'General Meakins', 'spirits', 'general-meakins', NULL, NULL, true, false),
  ('hunters-choice', 'Hunter''s Choice', 'whisky', 'hunters-choice', '/images/products/hunters-choice.jpg', NULL, true, false),
  ('county', 'County', 'spirits', 'county', '/images/products/county.jpg', NULL, true, false),
  ('gilbeys', 'Gilbey''s Gin', 'gin', 'gilbeys', '/images/products/gilbeys-gin.jpg', NULL, true, false),
  ('four-cousins', 'Four Cousins', 'wine', 'four-cousins', '/images/products/four-cousins.jpg', NULL, true, false),
  ('caprice', 'Caprice', 'wine', 'caprice', '/images/products/caprice.jpg', NULL, true, false),
  ('4th-street', '4th Street', 'wine', '4th-street', '/images/products/4th-street.jpg', NULL, true, false),
  ('pineapple-punch', 'Pineapple Punch', 'mixers', NULL, '/images/products/pineapple-punch.jpg', 0.0, true, false),
  ('manyatta', 'Manyatta', 'wine', 'manyatta', '/images/products/manyatta.jpg', NULL, true, false),
  ('smirnoff-ice', 'Smirnoff Ice', 'beer', 'smirnoff', NULL, NULL, true, false),
  ('lemonade', 'Lemonade', 'mixers', NULL, '/images/products/lemonade.jpg', 0.0, true, false),
  ('coca-cola-1l', 'Coca-Cola 1 Litre', 'mixers', 'coca-cola', '/images/products/coca-cola-1l.jpg', 0.0, true, false),
  ('shisha', 'Shisha', 'mixers', NULL, NULL, NULL, true, false),
  ('test', 'Test', 'mixers', NULL, NULL, 0.0, true, false)
)
INSERT INTO products (slug, sku, name, category_id, brand_id, image_url, alcohol_by_volume, active, featured, age_restricted)
SELECT ps.slug, 'TT-PROD-' || upper(regexp_replace(ps.slug, '[^a-zA-Z0-9]+', '-', 'g')), ps.name, c.id, b.id, ps.image_url, ps.abv, ps.active, ps.featured,
       CASE WHEN ps.category_slug = 'mixers' THEN false ELSE true END
FROM product_seed ps
JOIN categories c ON c.slug = ps.category_slug
LEFT JOIN brands b ON b.slug = ps.brand_slug
ON CONFLICT (slug) DO UPDATE SET
  sku = EXCLUDED.sku,
  name = EXCLUDED.name,
  category_id = EXCLUDED.category_id,
  brand_id = EXCLUDED.brand_id,
  image_url = EXCLUDED.image_url,
  alcohol_by_volume = EXCLUDED.alcohol_by_volume,
  active = EXCLUDED.active,
  featured = EXCLUDED.featured,
  age_restricted = EXCLUDED.age_restricted,
  updated_at = now();

WITH variant_seed(product_slug, sku, label, size_label, price_minor, cost_price_minor, active, is_default) AS (VALUES
  ('glenmorangie','GLENMORANGIE-700ML','700 ml','700 ml',6500,4800,true,true),
  ('glenmorangie','GLENMORANGIE-1L','1 litre','1 litre',8900,6700,true,false),
  ('jack-daniels','JACK-DANIELS-750ML','750 ml','750 ml',5200,3800,true,true),
  ('jack-daniels','JACK-DANIELS-1L','1 litre','1 litre',6900,5100,true,false),
  ('red-label','RED-LABEL-700ML','700 ml','700 ml',3200,2350,true,true),
  ('chalawan','CHALAWAN-330ML','330 ml','330 ml',450,280,true,true),
  ('woodford','WOODFORD-700ML','700 ml','700 ml',7600,5700,true,true),
  ('woodford','WOODFORD-1L','1 litre','1 litre',9800,7400,true,false),
  ('glenlivet','GLENLIVET-700ML','700 ml','700 ml',8800,6500,true,true),
  ('kc-pineapple','KC-PINEAPPLE-750ML','750 ml','750 ml',1350,920,true,true),
  ('kc-ginger','KC-GINGER-750ML','750 ml','750 ml',1350,920,true,true),
  ('kc-smooth','KC-SMOOTH-750ML','750 ml','750 ml',1350,920,true,true),
  ('vat-69','VAT69-750ML','750 ml','750 ml',1850,1320,true,true),
  ('kane-extra','KANE-EXTRA-750ML','750 ml','750 ml',1250,850,true,true),
  ('captain-morgan-gold','CAPTAIN-MORGAN-GOLD-750ML','750 ml','750 ml',2100,1500,true,true),
  ('captain-morgan-muck-pit','CAPTAIN-MUCK-PIT-750ML','750 ml','750 ml',2200,1580,true,true),
  ('black-and-white','BLACK-WHITE-750ML','750 ml','750 ml',1800,1280,true,true),
  ('viceroy','VICEROY-750ML','750 ml','750 ml',1450,980,true,true),
  ('general-meakins','GENERAL-MEAKINS-750ML','750 ml','750 ml',1350,900,true,true),
  ('hunters-choice','HUNTERS-CHOICE-750ML','750 ml','750 ml',1200,820,true,true),
  ('county','COUNTY-750ML','750 ml','750 ml',950,650,true,true),
  ('gilbeys','GILBEYS-750ML','750 ml','750 ml',1650,1150,true,true),
  ('four-cousins','FOUR-COUSINS-750ML','750 ml','750 ml',1500,1000,true,true),
  ('caprice','CAPRICE-750ML','750 ml','750 ml',1100,720,true,true),
  ('4th-street','4TH-STREET-750ML','750 ml','750 ml',1250,820,true,true),
  ('pineapple-punch','PINEAPPLE-PUNCH-1L','1 litre','1 litre',320,190,true,true),
  ('manyatta','MANYATTA-750ML','750 ml','750 ml',650,400,true,true),
  ('smirnoff-ice','SMIRNOFF-ICE-330ML','330 ml','330 ml',300,185,true,true),
  ('lemonade','LEMONADE-1L','1 litre','1 litre',220,120,true,true),
  ('coca-cola-1l','COCA-COLA-1L','1 litre','1 litre',180,95,true,true),
  ('shisha','SHISHA-50G','50 g','50 g',850,520,true,true),
  ('test','TEST-VARIANT-1','Variant 1','Variant 1',1,1,true,true),
  ('test','TEST-VARIANT-2','Variant 2','Variant 2',1,1,true,false),
  ('test','TEST-VARIANT-3','Variant 3','Variant 3',1,1,true,false)
)
INSERT INTO product_variants (product_id, sku, label, size_label, price_minor, cost_price_minor, active, is_default)
SELECT p.id,vs.sku,vs.label,vs.size_label,vs.price_minor,vs.cost_price_minor,vs.active,vs.is_default
FROM variant_seed vs
JOIN products p ON p.slug = vs.product_slug
ON CONFLICT (sku) DO UPDATE SET
  label = EXCLUDED.label,
  size_label = EXCLUDED.size_label,
  price_minor = EXCLUDED.price_minor,
  cost_price_minor = EXCLUDED.cost_price_minor,
  active = EXCLUDED.active,
  is_default = EXCLUDED.is_default,
  updated_at = now();

WITH variant_seed(sku, stock) AS (VALUES
  ('GLENMORANGIE-700ML', 20), ('GLENMORANGIE-1L', 12),
  ('JACK-DANIELS-750ML', 20), ('JACK-DANIELS-1L', 10),
  ('RED-LABEL-700ML', 25), ('CHALAWAN-330ML', 48),
  ('WOODFORD-700ML',16),('WOODFORD-1L',8),('GLENLIVET-700ML',14),
  ('KC-PINEAPPLE-750ML',22),('KC-GINGER-750ML',18),('KC-SMOOTH-750ML',15),
  ('VAT69-750ML',12),('KANE-EXTRA-750ML',11),('CAPTAIN-MORGAN-GOLD-750ML',17),
  ('CAPTAIN-MUCK-PIT-750ML',9),('BLACK-WHITE-750ML',13),('VICEROY-750ML',16),
  ('GENERAL-MEAKINS-750ML',8),('HUNTERS-CHOICE-750ML',20),('COUNTY-750ML',25),
  ('GILBEYS-750ML',14),('FOUR-COUSINS-750ML',10),('CAPRICE-750ML',12),
  ('4TH-STREET-750ML',15),('PINEAPPLE-PUNCH-1L',30),('MANYATTA-750ML',24),
  ('SMIRNOFF-ICE-330ML',48),('LEMONADE-1L',32),('COCA-COLA-1L',40),('SHISHA-50G',7),
  ('TEST-VARIANT-1',10),('TEST-VARIANT-2',10),('TEST-VARIANT-3',10)
)
INSERT INTO inventory (variant_id, on_hand_quantity)
SELECT pv.id, vs.stock
FROM variant_seed vs
JOIN product_variants pv ON pv.sku = vs.sku
ON CONFLICT (variant_id) DO UPDATE SET
  on_hand_quantity = GREATEST(EXCLUDED.on_hand_quantity, inventory.reserved_quantity),
  updated_at = now();

INSERT INTO content_blocks (key, kind, title, body, image_url, link_url, sort_order, metadata)
VALUES
  ('home-weekend-whisky', 'HERO_BANNER', 'Get 20% off selected whiskies', 'Selected bottles only. While stock lasts.', 'https://images.unsplash.com/photo-1569529465841-dfecdab7503b?auto=format&fit=crop&w=1800&q=88', '/whisky', 10, '{"eyebrow":"Weekend ready?"}'::jsonb),
  ('home-cold-beer', 'HERO_BANNER', 'Cold beer, delivered fast', 'Stock the fridge without leaving home.', 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=1800&q=88', '/beer', 20, '{"eyebrow":"Easy refreshment"}'::jsonb),
  ('home-mixers', 'HERO_BANNER', 'Everything for the perfect serve', 'Mixers and essentials delivered with your order.', 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=1800&q=88', '/mixers', 30, '{"eyebrow":"Complete your order"}'::jsonb)
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  image_url = EXCLUDED.image_url,
  link_url = EXCLUDED.link_url,
  active = true,
  sort_order = EXCLUDED.sort_order,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO promotions (name, kind, percentage_basis_points, active, usage_limit, minimum_order_minor, metadata)
SELECT 'Welcome 10%', 'PERCENTAGE', 1000, true, 500, 1000, '{"campaign":"welcome"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM promotions WHERE name = 'Welcome 10%');

WITH promotion AS (SELECT id FROM promotions WHERE name = 'Welcome 10%' ORDER BY created_at LIMIT 1)
INSERT INTO coupons (promotion_id, code, customer_usage_limit, active)
SELECT id, 'WELCOME10', 1, true FROM promotion
ON CONFLICT (code) DO UPDATE SET active = true;

-- Testable operating data. These records are deterministic and safe to reseed.
INSERT INTO users (phone,email,display_name,role,status,phone_verified_at) VALUES
  ('+254711000101','amina@example.test','Amina Wanjiku','CUSTOMER','ACTIVE',now()),
  ('+254711000102','brian@example.test','Brian Mwangi','CUSTOMER','ACTIVE',now()),
  ('+254711000103','carol@example.test','Carol Njeri','CUSTOMER','SUSPENDED',now()),
  ('+254722000201',NULL,'James Kariuki','RIDER','ACTIVE',now()),
  ('+254722000202',NULL,'Mary Wambui','RIDER','ACTIVE',now()),
  ('+254722000203',NULL,'Peter Maina','RIDER','DISABLED',now())
ON CONFLICT (phone) DO UPDATE SET email=EXCLUDED.email,display_name=EXCLUDED.display_name,role=EXCLUDED.role,status=EXCLUDED.status,updated_at=now();

INSERT INTO customer_profiles (user_id,legal_name,date_of_birth,marketing_opt_in)
SELECT id,display_name,DATE '1992-05-14',true FROM users WHERE phone IN ('+254711000101','+254711000102','+254711000103')
ON CONFLICT (user_id) DO UPDATE SET legal_name=EXCLUDED.legal_name,marketing_opt_in=EXCLUDED.marketing_opt_in,updated_at=now();

INSERT INTO riders (user_id,availability,vehicle_type,vehicle_registration,earnings_minor,last_seen_at)
SELECT id,CASE phone WHEN '+254722000201' THEN 'ONLINE'::rider_availability WHEN '+254722000202' THEN 'BUSY'::rider_availability ELSE 'OFFLINE'::rider_availability END,'Motorbike',CASE phone WHEN '+254722000201' THEN 'KMDT 201A' WHEN '+254722000202' THEN 'KMEF 842B' ELSE 'KMCX 109C' END,CASE phone WHEN '+254722000201' THEN 184500 WHEN '+254722000202' THEN 132000 ELSE 76000 END,now() FROM users WHERE phone IN ('+254722000201','+254722000202','+254722000203')
ON CONFLICT (user_id) DO UPDATE SET availability=EXCLUDED.availability,vehicle_type=EXCLUDED.vehicle_type,vehicle_registration=EXCLUDED.vehicle_registration,earnings_minor=EXCLUDED.earnings_minor,updated_at=now();

INSERT INTO vendors (name,contact_name,phone,email,payment_terms,status,balance_minor) VALUES
  ('Highlands Beverages Ltd','Grace Njeri','+254733100100','orders@highlands.example','Net 30','ACTIVE',245000),
  ('Central Wines Distributors','David Kamau','+254733100200','sales@centralwines.example','Net 14','ACTIVE',118500),
  ('Refreshments Kenya','Mercy Atieno','+254733100300','supply@refreshments.example','Pay on delivery','ACTIVE',0)
ON CONFLICT (name) DO UPDATE SET contact_name=EXCLUDED.contact_name,phone=EXCLUDED.phone,email=EXCLUDED.email,payment_terms=EXCLUDED.payment_terms,status=EXCLUDED.status,balance_minor=EXCLUDED.balance_minor,updated_at=now();

INSERT INTO vendor_products (vendor_id,variant_id,vendor_sku,last_cost_minor,preferred)
SELECT v.id,pv.id,'SUP-'||pv.sku,pv.cost_price_minor,true FROM product_variants pv JOIN products p ON p.id=pv.product_id JOIN vendors v ON v.name=CASE WHEN p.category_id=(SELECT id FROM categories WHERE slug='wine') THEN 'Central Wines Distributors' WHEN p.category_id=(SELECT id FROM categories WHERE slug='mixers') THEN 'Refreshments Kenya' ELSE 'Highlands Beverages Ltd' END
ON CONFLICT (vendor_id,variant_id) DO UPDATE SET last_cost_minor=EXCLUDED.last_cost_minor,preferred=true;

INSERT INTO purchase_orders (po_number,vendor_id,status,total_minor,ordered_at,expected_at,received_at)
SELECT x.po,v.id,x.status,x.total,x.ordered,x.expected,x.received FROM (VALUES
 ('PO-2026-001','Highlands Beverages Ltd','RECEIVED',384000,now()-interval '20 days',now()-interval '15 days',now()-interval '14 days'),
 ('PO-2026-002','Central Wines Distributors','ORDERED',118500,now()-interval '3 days',now()+interval '4 days',NULL),
 ('PO-2026-003','Refreshments Kenya','DRAFT',72000,NULL,NULL,NULL)
) AS x(po,vendor,status,total,ordered,expected,received) JOIN vendors v ON v.name=x.vendor
ON CONFLICT (po_number) DO UPDATE SET status=EXCLUDED.status,total_minor=EXCLUDED.total_minor,ordered_at=EXCLUDED.ordered_at,expected_at=EXCLUDED.expected_at,received_at=EXCLUDED.received_at,updated_at=now();

INSERT INTO purchase_order_items (purchase_order_id,variant_id,quantity,received_quantity,unit_cost_minor)
SELECT po.id,pv.id,24,CASE WHEN po.status='RECEIVED' THEN 24 ELSE 0 END,pv.cost_price_minor FROM purchase_orders po JOIN vendors v ON v.id=po.vendor_id JOIN vendor_products vp ON vp.vendor_id=v.id JOIN product_variants pv ON pv.id=vp.variant_id WHERE po.po_number IN ('PO-2026-001','PO-2026-002','PO-2026-003') AND NOT EXISTS (SELECT 1 FROM purchase_order_items poi WHERE poi.purchase_order_id=po.id AND poi.variant_id=pv.id) AND pv.is_default LIMIT 12;

INSERT INTO vendor_payments (vendor_id,purchase_order_id,amount_minor,reference,status,paid_at)
SELECT v.id,po.id,384000,'VEND-MPESA-001','PAID',now()-interval '13 days' FROM vendors v JOIN purchase_orders po ON po.vendor_id=v.id WHERE po.po_number='PO-2026-001' AND NOT EXISTS(SELECT 1 FROM vendor_payments WHERE reference='VEND-MPESA-001');

INSERT INTO expenses (category,description,amount_minor,expense_date,reference)
SELECT * FROM (VALUES
 ('Rent','October store rent',850000,CURRENT_DATE-3,'EXP-RENT-1026'),
 ('Utilities','Electricity and internet',94000,CURRENT_DATE-2,'EXP-UTIL-1026'),
 ('Marketing','Weekend campaign',125000,CURRENT_DATE-1,'EXP-MKT-1026')
) AS x(category,description,amount_minor,expense_date,reference)
WHERE NOT EXISTS (SELECT 1 FROM expenses e WHERE e.reference=x.reference);

INSERT INTO fleet_vehicles (registration,vehicle_type,make_model,rider_id,status,insurance_expires_at,service_due_at)
SELECT r.vehicle_registration,'Motorbike',CASE r.vehicle_registration WHEN 'KMDT 201A' THEN 'TVS HLX 150' WHEN 'KMEF 842B' THEN 'Boxer 150' ELSE 'Honda ACE 125' END,r.id,CASE WHEN u.status='ACTIVE' THEN 'ASSIGNED' ELSE 'AVAILABLE' END,CURRENT_DATE+90,CURRENT_DATE+30 FROM riders r JOIN users u ON u.id=r.user_id WHERE r.vehicle_registration IS NOT NULL
ON CONFLICT (registration) DO UPDATE SET rider_id=EXCLUDED.rider_id,status=EXCLUDED.status,insurance_expires_at=EXCLUDED.insurance_expires_at,service_due_at=EXCLUDED.service_due_at,updated_at=now();

WITH demo(order_number,customer_phone,status,days_ago,subtotal,discount,delivery,total) AS (VALUES
 ('TT-DEMO-1001','+254711000101','DELIVERED'::order_status,12,11700,700,250,11250),
 ('TT-DEMO-1002','+254711000102','DELIVERED'::order_status,8,6500,0,250,6750),
 ('TT-DEMO-1003','+254711000101','OUT_FOR_DELIVERY'::order_status,1,3650,0,300,3950),
 ('TT-DEMO-1004','+254711000102','PREPARING'::order_status,0,5200,500,250,4950),
 ('TT-DEMO-1005','+254711000103','PAYMENT_FAILED'::order_status,0,3200,0,250,3450)
)
INSERT INTO orders (order_number,access_token_hash,user_id,delivery_area_id,status,customer_name,customer_phone,delivery_address,subtotal_minor,discount_minor,delivery_fee_minor,total_minor,paid_at,confirmed_at,delivered_at,created_at)
SELECT d.order_number,'seed-access-'||d.order_number,u.id,da.id,d.status,u.display_name,u.phone,jsonb_build_object('label',da.name,'addressLine',da.name),d.subtotal,d.discount,d.delivery,d.total,CASE WHEN d.status='PAYMENT_FAILED' THEN NULL ELSE now()-(d.days_ago||' days')::interval END,CASE WHEN d.status='PAYMENT_FAILED' THEN NULL ELSE now()-(d.days_ago||' days')::interval END,CASE WHEN d.status='DELIVERED' THEN now()-(d.days_ago||' days')::interval+interval '1 hour' ELSE NULL END,now()-(d.days_ago||' days')::interval FROM demo d JOIN users u ON u.phone=d.customer_phone CROSS JOIN LATERAL(SELECT id,name FROM delivery_areas ORDER BY sort_order LIMIT 1) da
ON CONFLICT (order_number) DO UPDATE SET status=EXCLUDED.status,subtotal_minor=EXCLUDED.subtotal_minor,discount_minor=EXCLUDED.discount_minor,delivery_fee_minor=EXCLUDED.delivery_fee_minor,total_minor=EXCLUDED.total_minor,paid_at=EXCLUDED.paid_at,confirmed_at=EXCLUDED.confirmed_at,delivered_at=EXCLUDED.delivered_at,updated_at=now();

WITH lines(order_number,sku,quantity) AS (VALUES
 ('TT-DEMO-1001','JACK-DANIELS-750ML',1),('TT-DEMO-1001','GLENMORANGIE-700ML',1),
 ('TT-DEMO-1002','GLENMORANGIE-700ML',1),('TT-DEMO-1003','KC-PINEAPPLE-750ML',2),('TT-DEMO-1003','COCA-COLA-1L',1),
 ('TT-DEMO-1004','JACK-DANIELS-750ML',1),('TT-DEMO-1005','RED-LABEL-700ML',1)
)
INSERT INTO order_items (order_id,product_id,variant_id,product_name,sku,size_label,image_url,quantity,unit_price_minor,line_total_minor)
SELECT o.id,p.id,pv.id,p.name,pv.sku,pv.size_label,p.image_url,l.quantity,pv.price_minor,l.quantity*pv.price_minor FROM lines l JOIN orders o ON o.order_number=l.order_number JOIN product_variants pv ON pv.sku=l.sku JOIN products p ON p.id=pv.product_id
WHERE NOT EXISTS(SELECT 1 FROM order_items oi WHERE oi.order_id=o.id AND oi.variant_id=pv.id);

INSERT INTO payments (order_id,status,amount_minor,provider_receipt,payer_phone,paid_at,refunded_minor)
SELECT o.id,CASE WHEN o.status='PAYMENT_FAILED' THEN 'FAILED'::payment_status ELSE 'SUCCEEDED'::payment_status END,o.total_minor,'SEED'||replace(o.order_number,'-',''),o.customer_phone,o.paid_at,0 FROM orders o WHERE o.order_number LIKE 'TT-DEMO-%'
ON CONFLICT (provider_receipt) DO UPDATE SET status=EXCLUDED.status,amount_minor=EXCLUDED.amount_minor,paid_at=EXCLUDED.paid_at;

INSERT INTO delivery_assignments (order_id,rider_id,status,assigned_at,accepted_at,picked_up_at,delivered_at,payout_minor)
SELECT o.id,r.id,CASE WHEN o.status='DELIVERED' THEN 'DELIVERED'::assignment_status WHEN o.status='OUT_FOR_DELIVERY' THEN 'PICKED_UP'::assignment_status ELSE 'ASSIGNED'::assignment_status END,o.created_at+interval '20 minutes',o.created_at+interval '25 minutes',CASE WHEN o.status IN('DELIVERED','OUT_FOR_DELIVERY') THEN o.created_at+interval '45 minutes' END,o.delivered_at,25000 FROM orders o CROSS JOIN LATERAL(SELECT id FROM riders ORDER BY created_at LIMIT 1) r WHERE o.order_number IN('TT-DEMO-1001','TT-DEMO-1002','TT-DEMO-1003')
ON CONFLICT (order_id) DO UPDATE SET status=EXCLUDED.status,delivered_at=EXCLUDED.delivered_at,payout_minor=EXCLUDED.payout_minor;

INSERT INTO platform_settings (key,value,description)
VALUES ('inventory.low_stock_threshold','{"quantity":3}'::jsonb,'Global available-stock level that triggers a low-stock alert.')
ON CONFLICT (key) DO NOTHING;
