import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cloudinary from './config/cloudinary.js';
import {
  getProductsFromSupabase,
  addProductToSupabase,
  updateProductInSupabase,
  deleteProductFromSupabase
} from './services/supabaseService.js';
import {
  getOrdersFromSupabase,
  getOrderByIdFromSupabase,
  createOrderInSupabase,
  updateOrderStatusInSupabase,
  completeOrderByUser
} from './services/orderService.js';
import {
  getNotificationsFromSupabase,
  createNotification,
  markNotificationRead,
  markAllNotificationsRead,
  registerSseClient
} from './services/notificationService.js';
import { generateOrderPdf } from './services/pdfService.js';
import {
  getCategories,
  addCategory,
  updateCategory,
  deleteCategory,
  getSchools,
  addSchool,
  updateSchool,
  deleteSchool
} from './services/masterService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS with restricted origins for production security
const allowedOrigins = [
  'https://bsmartdresses.com',
  'https://www.bsmartdresses.com',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5000',
  'http://localhost:8081',
  'http://localhost:19006',
];
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, true); // Permissive fallback — tighten after verifying production
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health Check
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: "B'Smart Supabase & Cloudinary API Backend",
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    supabaseUrl: process.env.SUPABASE_URL,
    time: new Date().toISOString(),
  });
});

// GET Cloudinary & Supabase configuration info
app.get('/api/config', (req, res) => {
  res.json({
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    supabaseUrl: process.env.SUPABASE_URL,
    status: 'configured',
  });
});

// In-memory store for custom created categories and schools
let customCategories = new Set();
let customSchools = new Set();

// POST /api/upload - Upload image to Cloudinary with AI Background Removal
app.post('/api/upload', async (req, res) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ success: false, message: 'No image data provided' });
    }

    console.log('Uploading image to Cloudinary with AI Background Removal...');

    let uploadResponse;
    let bgRemovalApplied = false;

    // 1. Attempt upload with Cloudinary AI background removal
    try {
      uploadResponse = await cloudinary.uploader.upload(image, {
        folder: 'bsmart_products',
        resource_type: 'auto',
        background_removal: 'cloudinary_ai',
        format: 'png',
      });
      bgRemovalApplied = true;
      console.log('AI Background Removal successful! Public ID:', uploadResponse.public_id);
    } catch (bgErr) {
      console.warn('AI Background Removal fallback triggered:', bgErr.message);
      uploadResponse = await cloudinary.uploader.upload(image, {
        folder: 'bsmart_products',
        resource_type: 'auto',
        transformation: [
          { quality: 'auto', fetch_format: 'auto' }
        ]
      });
    }

    console.log('Cloudinary Secure URL:', uploadResponse.secure_url);

    const optimizedUrl = cloudinary.url(uploadResponse.public_id, {
      fetch_format: bgRemovalApplied ? 'png' : 'auto',
      quality: 'auto',
      secure: true
    });

    const thumbnailUrl = cloudinary.url(uploadResponse.public_id, {
      width: 400,
      height: 400,
      crop: 'fill',
      gravity: 'auto',
      fetch_format: bgRemovalApplied ? 'png' : 'auto',
      quality: 'auto',
      secure: true
    });

    res.status(200).json({
      success: true,
      url: uploadResponse.secure_url,
      optimizedUrl: optimizedUrl,
      thumbnailUrl,
      public_id: uploadResponse.public_id,
      format: uploadResponse.format,
      width: uploadResponse.width,
      height: uploadResponse.height,
      bytes: uploadResponse.bytes,
      bgRemovalApplied
    });

  } catch (error) {
    console.error('Cloudinary Upload Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload image to Cloudinary',
      error: error.message
    });
  }
});

// ========================================================
// CATEGORIES CRUD API (Persistent & Supabase Synchronized)
// ========================================================

// GET /api/categories - Read all categories
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await getCategories();
    res.json({ success: true, count: categories.length, categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch categories' });
  }
});

// POST /api/categories - Create / Add a new category
app.post('/api/categories', async (req, res) => {
  try {
    const { category, name } = req.body;
    const catName = category || name;
    if (!catName || typeof catName !== 'string' || !catName.trim()) {
      return res.status(400).json({ success: false, message: 'Category name is required' });
    }
    const created = await addCategory(catName.trim());
    res.status(201).json({ success: true, category: created });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Failed to add category' });
  }
});

// PUT /api/categories/:name - Update / Edit / Rename an existing category
app.put('/api/categories/:name', async (req, res) => {
  try {
    const oldName = decodeURIComponent(req.params.name);
    const { newName, newCategory, category } = req.body;
    const targetNewName = (newName || newCategory || category || '').trim();

    if (!targetNewName) {
      return res.status(400).json({ success: false, message: 'New category name is required' });
    }

    const result = await updateCategory(oldName, targetNewName);
    res.json({ success: true, message: `Category renamed successfully from "${oldName}" to "${targetNewName}"`, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Failed to update category' });
  }
});

// DELETE /api/categories/:name - Delete a category
app.delete('/api/categories/:name', async (req, res) => {
  try {
    const catName = decodeURIComponent(req.params.name);
    const result = await deleteCategory(catName);
    res.json({ success: true, message: `Category "${catName}" deleted successfully`, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Failed to delete category' });
  }
});

// ========================================================
// SCHOOLS CRUD API (Persistent & Supabase Synchronized)
// ========================================================

// GET /api/schools - Read all schools
app.get('/api/schools', async (req, res) => {
  try {
    const schools = await getSchools();
    res.json({ success: true, count: schools.length, schools });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch schools' });
  }
});

// POST /api/schools - Create / Add a new school
app.post('/api/schools', async (req, res) => {
  try {
    const { school, name } = req.body;
    const schoolName = school || name;
    if (!schoolName || typeof schoolName !== 'string' || !schoolName.trim()) {
      return res.status(400).json({ success: false, message: 'School name is required' });
    }
    const created = await addSchool(schoolName.trim());
    res.status(201).json({ success: true, school: created });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Failed to add school' });
  }
});

// PUT /api/schools/:name - Update / Edit / Rename an existing school
app.put('/api/schools/:name', async (req, res) => {
  try {
    const oldName = decodeURIComponent(req.params.name);
    const { newName, newSchool, school } = req.body;
    const targetNewName = (newName || newSchool || school || '').trim();

    if (!targetNewName) {
      return res.status(400).json({ success: false, message: 'New school name is required' });
    }

    const result = await updateSchool(oldName, targetNewName);
    res.json({ success: true, message: `School renamed successfully from "${oldName}" to "${targetNewName}"`, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Failed to update school' });
  }
});

// DELETE /api/schools/:name - Delete a school
app.delete('/api/schools/:name', async (req, res) => {
  try {
    const schoolName = decodeURIComponent(req.params.name);
    const result = await deleteSchool(schoolName);
    res.json({ success: true, message: `School "${schoolName}" deleted successfully`, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Failed to delete school' });
  }
});

// GET /api/products - Get all products from Supabase DB
app.get('/api/products', async (req, res) => {
  try {
    const products = await getProductsFromSupabase();
    res.json({ success: true, database: 'Supabase PostgreSQL', count: products.length, products });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});

// GET /api/products/:id - Get product by ID from Supabase DB
app.get('/api/products/:id', async (req, res) => {
  try {
    const products = await getProductsFromSupabase();
    const product = products.find((p) => String(p.id) === String(req.params.id));
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, product });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch product' });
  }
});

// POST /api/products - Add new product to Supabase DB
app.post('/api/products', async (req, res) => {
  try {
    const newProduct = await addProductToSupabase(req.body);
    console.log('New product saved in Supabase:', newProduct.name);
    res.status(201).json({ success: true, database: 'Supabase PostgreSQL', product: newProduct });
  } catch (error) {
    console.error('Error creating product in Supabase:', error);
    res.status(500).json({ success: false, message: 'Failed to create product in Supabase' });
  }
});

// PUT /api/products/:id - Update product in Supabase DB (CRUD Update)
app.put('/api/products/:id', async (req, res) => {
  try {
    const updatedProduct = await updateProductInSupabase(req.params.id, req.body);
    console.log('Product updated in Supabase:', updatedProduct.name);
    res.json({ success: true, database: 'Supabase PostgreSQL', product: updatedProduct });
  } catch (error) {
    console.error('Error updating product in Supabase:', error);
    res.status(500).json({ success: false, message: 'Failed to update product in Supabase' });
  }
});

// DELETE /api/products/:id - Delete product from Supabase DB (CRUD Delete)
app.delete('/api/products/:id', async (req, res) => {
  try {
    await deleteProductFromSupabase(req.params.id);
    res.json({ success: true, message: 'Product deleted successfully from Supabase DB' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete product' });
  }
});

// ==========================================
// ORDER MANAGEMENT & PDF INVOICE REST API
// ==========================================

// GET /api/orders - Get all orders (with optional status filter)
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await getOrdersFromSupabase();
    const { status, search } = req.query;

    let filtered = orders;
    if (status && status !== 'All') {
      filtered = filtered.filter((o) => o.status?.toLowerCase() === status.toLowerCase());
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((o) =>
        o.orderNumber?.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q) ||
        o.customerMobile?.includes(q) ||
        o.school?.toLowerCase().includes(q)
      );
    }

    res.json({ success: true, count: filtered.length, orders: filtered });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
});

// GET /api/orders/:id - Get single order details
app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = await getOrderByIdFromSupabase(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch order' });
  }
});

// POST /api/orders - Place new customer order
app.post('/api/orders', async (req, res) => {
  try {
    const { customerName, customerMobile, deliveryAddress, items } = req.body;

    if (!customerName || !customerMobile || !deliveryAddress || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required order fields: customerName, customerMobile, deliveryAddress, and items array are required.'
      });
    }

    const calculatedSubtotal = Number(req.body.subtotal ?? items.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.qty || 1)), 0));
    if (calculatedSubtotal < 500) {
      return res.status(400).json({
        success: false,
        message: 'Minimum order amount is ₹500 to place an order. Delivery is free for all orders.'
      });
    }

    const order = await createOrderInSupabase(req.body);
    console.log(`🎉 New order received: ${order.orderNumber} for ₹${order.totalAmount}`);

    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      order
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ success: false, message: 'Failed to create order', error: error.message });
  }
});

// GET /api/orders/:id/pdf - Generate & Stream Order PDF Invoice
app.get('/api/orders/:id/pdf', async (req, res) => {
  try {
    const order = await getOrderByIdFromSupabase(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found for PDF generation' });
    }

    const pdfBuffer = await generateOrderPdf(order);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="bsmart_invoice_${order.orderNumber || order.id}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ success: false, message: 'Failed to generate PDF', error: error.message });
  }
});

// PUT /api/orders/:id/status - Update order status (Admin Accept with Delivery Time or Decline)
app.put('/api/orders/:id/status', async (req, res) => {
  try {
    const { status, deliveryTime, adminNotes, declineReason } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required (e.g. accepted, declined)' });
    }

    const updatedOrder = await updateOrderStatusInSupabase(req.params.id, {
      status,
      deliveryTime,
      adminNotes,
      declineReason
    });

    console.log(`Order ${updatedOrder.orderNumber || updatedOrder.id} status updated to ${status}. Delivery: ${deliveryTime || 'N/A'}`);

    res.json({
      success: true,
      message: `Order status updated to ${status}`,
      order: updatedOrder
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ success: false, message: 'Failed to update order status' });
  }
});

// PUT /api/orders/:id/complete - Mark order as completed by user (User Tick)
app.put('/api/orders/:id/complete', async (req, res) => {
  try {
    const updatedOrder = await completeOrderByUser(req.params.id);

    console.log(`Order ${updatedOrder.orderNumber || updatedOrder.id} marked COMPLETED by customer tick!`);

    res.json({
      success: true,
      message: 'Order marked as completed by customer',
      order: updatedOrder
    });
  } catch (error) {
    console.error('Error marking order completed:', error);
    res.status(500).json({ success: false, message: 'Failed to complete order' });
  }
});

// ==========================================
// REAL-TIME EVENT STREAM (Server-Sent Events)
// ==========================================
app.get('/api/realtime/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Send initial connection heartbeat
  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', time: new Date().toISOString() })}\n\n`);

  registerSseClient(res);

  // Keep-alive ping interval
  const pingInterval = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch (e) {
      clearInterval(pingInterval);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(pingInterval);
  });
});

// ==========================================
// NOTIFICATIONS REST API
// ==========================================

// GET /api/notifications - Get all live notifications
app.get('/api/notifications', async (req, res) => {
  try {
    const { role, mobile } = req.query;
    const notifs = await getNotificationsFromSupabase(role, mobile);
    res.json({ success: true, count: notifs.length, notifications: notifs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
});

// POST /api/notifications - Manually create a notification
app.post('/api/notifications', async (req, res) => {
  try {
    const notif = await createNotification(req.body);
    res.status(201).json({ success: true, notification: notif });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create notification' });
  }
});

// POST /api/notifications/:id/read - Mark notification as read
app.post('/api/notifications/:id/read', async (req, res) => {
  try {
    const notifs = await markNotificationRead(req.params.id);
    res.json({ success: true, notifications: notifs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to mark notification read' });
  }
});

// POST /api/notifications/read-all - Mark all notifications as read
app.post('/api/notifications/read-all', async (req, res) => {
  try {
    const { role } = req.body || {};
    const notifs = await markAllNotificationsRead(role);
    res.json({ success: true, notifications: notifs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to mark all notifications read' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`=================================================`);
  console.log(`🚀 B'Smart Cloudinary + Supabase Server running on port ${PORT}`);
  console.log(`Cloud Name: ${process.env.CLOUDINARY_CLOUD_NAME}`);
  console.log(`Supabase URL: ${process.env.SUPABASE_URL}`);
  console.log(`Order Management & PDF Invoicing: ACTIVE`);
  console.log(`=================================================`);
});