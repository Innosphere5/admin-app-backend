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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing with increased payload limit for base64 images
app.use(cors());
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

// POST /api/upload - Upload image to Cloudinary
app.post('/api/upload', async (req, res) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ success: false, message: 'No image data provided' });
    }

    console.log('Uploading image to Cloudinary folder: bsmart_products...');

    const uploadResponse = await cloudinary.uploader.upload(image, {
      folder: 'bsmart_products',
      resource_type: 'auto',
      transformation: [
        { quality: 'auto', fetch_format: 'auto' }
      ]
    });

    console.log('Upload successful! Public ID:', uploadResponse.public_id);
    console.log('Cloudinary Secure URL:', uploadResponse.secure_url);

    const optimizedUrl = cloudinary.url(uploadResponse.public_id, {
      fetch_format: 'auto',
      quality: 'auto',
      secure: true
    });

    // Automatic background transparency transformation for studio product photos
    const transparentUrl = cloudinary.url(uploadResponse.public_id, {
      effect: 'make_transparent:15',
      fetch_format: 'png',
      quality: 'auto',
      secure: true
    });

    const thumbnailUrl = cloudinary.url(uploadResponse.public_id, {
      width: 400,
      height: 400,
      crop: 'fill',
      gravity: 'auto',
      fetch_format: 'auto',
      quality: 'auto',
      secure: true
    });

    res.status(200).json({
      success: true,
      url: transparentUrl || uploadResponse.secure_url,
      optimizedUrl: transparentUrl || optimizedUrl,
      thumbnailUrl,
      public_id: uploadResponse.public_id,
      format: uploadResponse.format,
      width: uploadResponse.width,
      height: uploadResponse.height,
      bytes: uploadResponse.bytes
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