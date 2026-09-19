-- ========================================================
-- B'Smart Supabase PostgreSQL Database Schema & Realtime CDC
-- Run this script in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/rxnvxqrzgecynpxjobkh/sql/new
-- ========================================================

-- 1. Create products table
CREATE TABLE IF NOT EXISTS public.products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    school TEXT,
    applicable_class TEXT,
    description TEXT,
    base_price NUMERIC DEFAULT 0,
    image_src TEXT,
    images JSONB DEFAULT '[]'::jsonb,
    sizes JSONB DEFAULT '[]'::jsonb,
    sizes_text TEXT,
    size_prices JSONB DEFAULT '{}'::jsonb,
    size_stocks JSONB DEFAULT '{}'::jsonb,
    in_stock BOOLEAN DEFAULT true,
    stock_quantity INTEGER DEFAULT 50,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure size_stocks column exists if table was already created earlier
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS size_stocks JSONB DEFAULT '{}'::jsonb;

-- 2. Enable Row Level Security (RLS) on products
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- 3. Create Public Policies for products (Read, Insert, Update, Delete)
DROP POLICY IF EXISTS "Allow public read access" ON public.products;
CREATE POLICY "Allow public read access" ON public.products FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert access" ON public.products;
CREATE POLICY "Allow public insert access" ON public.products FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update access" ON public.products;
CREATE POLICY "Allow public update access" ON public.products FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete access" ON public.products;
CREATE POLICY "Allow public delete access" ON public.products FOR DELETE USING (true);

-- 4. Create orders table
CREATE TABLE IF NOT EXISTS public.orders (
    id TEXT PRIMARY KEY,
    order_number TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_mobile TEXT NOT NULL,
    customer_email TEXT,
    delivery_address JSONB NOT NULL,
    school TEXT,
    items JSONB DEFAULT '[]'::jsonb,
    items_count INTEGER DEFAULT 1,
    subtotal NUMERIC DEFAULT 0,
    delivery_fee NUMERIC DEFAULT 0,
    total_amount NUMERIC NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'accepted', 'declined', 'completed'
    delivery_time TEXT,            -- e.g. "Today by 5:30 PM", "Within 45 mins"
    admin_notes TEXT,
    decline_reason TEXT,
    user_completed BOOLEAN DEFAULT false,
    user_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Enable Row Level Security (RLS) on orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 6. Create Public Policies for orders (Read, Insert, Update, Delete)
DROP POLICY IF EXISTS "Allow public read orders" ON public.orders;
CREATE POLICY "Allow public read orders" ON public.orders FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert orders" ON public.orders;
CREATE POLICY "Allow public insert orders" ON public.orders FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update orders" ON public.orders;
CREATE POLICY "Allow public update orders" ON public.orders FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete orders" ON public.orders;
CREATE POLICY "Allow public delete orders" ON public.orders FOR DELETE USING (true);

-- 7. Create notifications table for Real-Time Notification System
CREATE TABLE IF NOT EXISTS public.notifications (
    id TEXT PRIMARY KEY,
    order_id TEXT,
    type TEXT NOT NULL,           -- 'order_created', 'order_accepted', 'order_declined', 'order_completed', 'general'
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    target_role TEXT DEFAULT 'all', -- 'user', 'admin', 'all'
    customer_mobile TEXT,
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Enable Row Level Security (RLS) on notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 9. Create Public Policies for notifications
DROP POLICY IF EXISTS "Allow public read notifications" ON public.notifications;
CREATE POLICY "Allow public read notifications" ON public.notifications FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert notifications" ON public.notifications;
CREATE POLICY "Allow public insert notifications" ON public.notifications FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update notifications" ON public.notifications;
CREATE POLICY "Allow public update notifications" ON public.notifications FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete notifications" ON public.notifications;
CREATE POLICY "Allow public delete notifications" ON public.notifications FOR DELETE USING (true);

-- 10. Enable Full Replica Identity for PostgreSQL CDC (Change Data Capture)
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.products REPLICA IDENTITY FULL;

-- 11. Enable Supabase Realtime Publication for Live CDC Streaming
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;

    -- Add tables safely only if they are not already in the publication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_rel pr
        JOIN pg_class c ON pr.prrelid = c.oid
        JOIN pg_publication p ON pr.prpubid = p.oid
        WHERE p.pubname = 'supabase_realtime' AND c.relname = 'orders'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_rel pr
        JOIN pg_class c ON pr.prrelid = c.oid
        JOIN pg_publication p ON pr.prpubid = p.oid
        WHERE p.pubname = 'supabase_realtime' AND c.relname = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_rel pr
        JOIN pg_class c ON pr.prrelid = c.oid
        JOIN pg_publication p ON pr.prpubid = p.oid
        WHERE p.pubname = 'supabase_realtime' AND c.relname = 'products'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
    END IF;
END $$;

-- 12. Create optional Master Tables (schools, categories, classes)
CREATE TABLE IF NOT EXISTS public.schools (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read schools" ON public.schools;
CREATE POLICY "Allow public read schools" ON public.schools FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public all schools" ON public.schools;
CREATE POLICY "Allow public all schools" ON public.schools FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS public.categories (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read categories" ON public.categories;
CREATE POLICY "Allow public read categories" ON public.categories FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public all categories" ON public.categories;
CREATE POLICY "Allow public all categories" ON public.categories FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS public.classes (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read classes" ON public.classes;
CREATE POLICY "Allow public read classes" ON public.classes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public all classes" ON public.classes;
CREATE POLICY "Allow public all classes" ON public.classes FOR ALL USING (true);

