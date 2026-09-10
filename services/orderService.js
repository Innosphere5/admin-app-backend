import { supabase } from '../config/supabase.js';
import { createNotification, broadcastRealtimeEvent } from './notificationService.js';

const TABLE_NAME = 'orders';

// In-memory store for orders to ensure high performance and resilience
let ordersStore = [
  {
    id: 'BS-1024',
    orderNumber: '#BS1024',
    customerName: 'Rahul Sharma',
    customerMobile: '+91 98765 43210',
    customerEmail: 'rahul.sharma@example.com',
    deliveryAddress: {
      address1: 'House No. 142, Street 4, Model Town',
      address2: 'Near Kali Mata Temple',
      city: 'Bathinda',
      state: 'Punjab',
      postal: '151001'
    },
    school: 'Delhi Public School',
    items: [
      {
        id: 'item-1',
        productId: 'prod-1',
        name: 'Boys Full-Sleeve White Shirt (Bathinda)',
        school: 'Delhi Public School',
        category: 'Boys Uniform',
        size: '30',
        price: 550,
        qty: 2,
        itemTotal: 1100,
        imageSrc: '/prod-shirt.jpg'
      },
      {
        id: 'item-2',
        productId: 'prod-2',
        name: 'Grey Formal Trousers',
        school: 'Delhi Public School',
        category: 'Boys Uniform',
        size: '32',
        price: 650,
        qty: 1,
        itemTotal: 650,
        imageSrc: '/prod-pant.jpg'
      }
    ],
    itemsCount: 3,
    subtotal: 1750,
    deliveryFee: 0,
    totalAmount: 1750,
    status: 'pending',
    deliveryTime: '',
    adminNotes: '',
    declineReason: '',
    userCompleted: false,
    userCompletedAt: null,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: 'BS-1023',
    orderNumber: '#BS1023',
    customerName: 'Anita Desai',
    customerMobile: '+91 98123 45678',
    customerEmail: 'anita.desai@example.com',
    deliveryAddress: {
      address1: 'Flat 302, Green Avenue',
      address2: 'Civil Lines',
      city: 'Bathinda',
      state: 'Punjab',
      postal: '151002'
    },
    school: "St. Xavier's High",
    items: [
      {
        id: 'item-3',
        productId: 'prod-3',
        name: "Girls Pleated Dark Skirt",
        school: "St. Xavier's High",
        category: "Girls Uniform",
        size: '28',
        price: 600,
        qty: 2,
        itemTotal: 1200,
        imageSrc: '/prod-skirt.jpg'
      }
    ],
    itemsCount: 2,
    subtotal: 1200,
    deliveryFee: 0,
    totalAmount: 1200,
    status: 'accepted',
    deliveryTime: 'Today by 5:30 PM',
    adminNotes: 'Uniform prepared and packaged.',
    declineReason: '',
    userCompleted: false,
    userCompletedAt: null,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 72000000).toISOString()
  }
];

/**
 * Format DB row to Order Object
 */
function mapFromDb(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    orderNumber: row.order_number || row.orderNumber || row.id,
    customerName: row.customer_name || row.customerName,
    customerMobile: row.customer_mobile || row.customerMobile,
    customerEmail: row.customer_email || row.customerEmail || '',
    deliveryAddress: typeof row.delivery_address === 'string' ? JSON.parse(row.delivery_address) : (row.delivery_address || row.deliveryAddress || {}),
    school: row.school || 'General School',
    items: row.items ? (typeof row.items === 'string' ? JSON.parse(row.items) : row.items) : [],
    itemsCount: Number(row.items_count || row.itemsCount || 1),
    subtotal: Number(row.subtotal || 0),
    deliveryFee: Number(row.delivery_fee || row.deliveryFee || 0),
    totalAmount: Number(row.total_amount || row.totalAmount || 0),
    status: row.status || 'pending',
    deliveryTime: row.delivery_time || row.deliveryTime || '',
    adminNotes: row.admin_notes || row.adminNotes || '',
    declineReason: row.declinereason || row.decline_reason || row.declineReason || '',
    userCompleted: Boolean(row.user_completed || row.userCompleted),
    userCompletedAt: row.user_completed_at || row.userCompletedAt || null,
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString()
  };
}

/**
 * Format Order Object to DB row
 */
function mapToDb(order) {
  return {
    id: String(order.id),
    order_number: order.orderNumber || order.id,
    customer_name: order.customerName,
    customer_mobile: order.customerMobile,
    customer_email: order.customerEmail || '',
    delivery_address: order.deliveryAddress,
    school: order.school || 'General School',
    items: order.items || [],
    items_count: Number(order.itemsCount || 1),
    subtotal: Number(order.subtotal || 0),
    delivery_fee: Number(order.deliveryFee || 0),
    total_amount: Number(order.totalAmount || 0),
    status: order.status || 'pending',
    delivery_time: order.deliveryTime || '',
    admin_notes: order.adminNotes || '',
    declinereason: order.declineReason || '',
    user_completed: Boolean(order.userCompleted),
    user_completed_at: order.userCompletedAt || null,
    created_at: order.createdAt || new Date().toISOString(),
    updated_at: order.updatedAt || new Date().toISOString()
  };
}

/**
 * Fetch all orders from Supabase & fallback
 */
export async function getOrdersFromSupabase() {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      const formatted = data.map(mapFromDb).filter(Boolean);
      ordersStore = formatted;
      return formatted;
    }
  } catch (err) {
    // Suppress schema cache warning gracefully
  }
  return ordersStore;
}

/**
 * Get order by ID
 */
export async function getOrderByIdFromSupabase(id) {
  const all = await getOrdersFromSupabase();
  return all.find((o) => String(o.id) === String(id) || String(o.orderNumber) === String(id)) || null;
}

/**
 * Create a new order in Supabase & memory store + trigger real-time events
 */
export async function createOrderInSupabase(orderData) {
  const orderId = orderData.id || `BS-${Math.floor(1000 + Math.random() * 9000)}`;
  const orderNumber = orderData.orderNumber || `#${orderId.replace('-', '')}`;
  
  const subtotal = Number(orderData.subtotal ?? (orderData.items || []).reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.qty || 1)), 0));
  const deliveryFee = Number(orderData.deliveryFee ?? (subtotal >= 500 ? 0 : 50));
  const totalAmount = Number(orderData.totalAmount ?? (subtotal + deliveryFee));
  const itemsCount = (orderData.items || []).reduce((sum, item) => sum + Number(item.qty || 1), 0);

  const formattedOrder = {
    id: orderId,
    orderNumber,
    customerName: orderData.customerName || 'Customer',
    customerMobile: orderData.customerMobile || '',
    customerEmail: orderData.customerEmail || '',
    deliveryAddress: orderData.deliveryAddress || {},
    school: orderData.school || (orderData.items?.[0]?.school) || 'General School',
    items: orderData.items || [],
    itemsCount,
    subtotal,
    deliveryFee,
    totalAmount,
    status: 'pending',
    deliveryTime: '',
    adminNotes: '',
    declineReason: '',
    userCompleted: false,
    userCompletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Add to in-memory store
  ordersStore.unshift(formattedOrder);

  // Broadcast real-time order creation to all connected SSE clients
  broadcastRealtimeEvent('order_created', formattedOrder);

  // Create unified notification in Supabase & memory
  await createNotification({
    orderId: formattedOrder.id,
    type: 'order_created',
    title: '🔔 New Uniform Order Placed!',
    message: `Order ${formattedOrder.orderNumber} placed by ${formattedOrder.customerName} for ${formattedOrder.school} (₹${formattedOrder.totalAmount})`,
    targetRole: 'all',
    customerMobile: formattedOrder.customerMobile
  });

  try {
    const dbPayload = mapToDb(formattedOrder);
    const { error: insertErr } = await supabase.from(TABLE_NAME).insert([dbPayload]);
    if (insertErr) {
      console.error('Supabase order insert notice:', insertErr.message || insertErr);
    }
  } catch (err) {
    console.error('Order Supabase insert exception:', err.message || err);
  }

  return formattedOrder;
}

/**
 * Update order status (Accept with Delivery Time or Decline with Reason)
 */
export async function updateOrderStatusInSupabase(id, { status, deliveryTime, adminNotes, declineReason }) {
  const targetId = String(id);
  const index = ordersStore.findIndex((o) => String(o.id) === targetId || String(o.orderNumber) === targetId);

  let updatedOrder;
  if (index !== -1) {
    const existing = ordersStore[index];
    updatedOrder = {
      ...existing,
      status: status || existing.status,
      deliveryTime: deliveryTime !== undefined ? deliveryTime : existing.deliveryTime,
      adminNotes: adminNotes !== undefined ? adminNotes : existing.adminNotes,
      declineReason: declineReason !== undefined ? declineReason : existing.declineReason,
      updatedAt: new Date().toISOString()
    };
    ordersStore[index] = updatedOrder;
  } else {
    updatedOrder = {
      id: targetId,
      orderNumber: `#${targetId.replace('-', '')}`,
      status,
      deliveryTime: deliveryTime || '',
      adminNotes: adminNotes || '',
      declineReason: declineReason || '',
      updatedAt: new Date().toISOString()
    };
    ordersStore.unshift(updatedOrder);
  }

  // Real-time broadcast for live UI synchronization
  broadcastRealtimeEvent('order_updated', updatedOrder);

  // Create real-time notification for user & admin
  const isAccepted = status === 'accepted';
  await createNotification({
    orderId: updatedOrder.id,
    type: isAccepted ? 'order_accepted' : 'order_declined',
    title: isAccepted ? '🎉 Uniform Order Accepted!' : '⚠️ Uniform Order Declined',
    message: isAccepted
      ? `Order ${updatedOrder.orderNumber || updatedOrder.id} has been accepted! Expected Delivery: ${updatedOrder.deliveryTime || 'As scheduled'}`
      : `Order ${updatedOrder.orderNumber || updatedOrder.id} could not be accepted. Reason: ${declineReason || 'Item unavailable'}`,
    targetRole: 'all',
    customerMobile: updatedOrder.customerMobile
  });

  try {
    const dbPayload = mapToDb(updatedOrder);
    const { error: updateErr } = await supabase.from(TABLE_NAME).update(dbPayload).eq('id', updatedOrder.id);
    if (updateErr) {
      console.error('Supabase order update notice:', updateErr.message || updateErr);
    }
  } catch (err) {
    console.error('Order Supabase update exception:', err.message || err);
  }

  return updatedOrder;
}

/**
 * Mark order as completed by user (User tick)
 */
export async function completeOrderByUser(id) {
  const targetId = String(id);
  const index = ordersStore.findIndex((o) => String(o.id) === targetId || String(o.orderNumber) === targetId);

  let updatedOrder;
  const now = new Date().toISOString();

  if (index !== -1) {
    const existing = ordersStore[index];
    updatedOrder = {
      ...existing,
      status: 'completed',
      userCompleted: true,
      userCompletedAt: now,
      updatedAt: now
    };
    ordersStore[index] = updatedOrder;
  } else {
    updatedOrder = {
      id: targetId,
      status: 'completed',
      userCompleted: true,
      userCompletedAt: now,
      updatedAt: now
    };
    ordersStore.unshift(updatedOrder);
  }

  // Real-time broadcast
  broadcastRealtimeEvent('order_completed', updatedOrder);

  // Create real-time completion notification
  await createNotification({
    orderId: updatedOrder.id,
    type: 'order_completed',
    title: '✅ Uniform Order Delivered & Received!',
    message: `Order ${updatedOrder.orderNumber || updatedOrder.id} was marked as received and completed by ${updatedOrder.customerName || 'customer'} ✓`,
    targetRole: 'all',
    customerMobile: updatedOrder.customerMobile
  });

  try {
    await supabase
      .from(TABLE_NAME)
      .update({
        status: 'completed',
        user_completed: true,
        user_completed_at: now,
        updated_at: now
      })
      .eq('id', updatedOrder.id);
  } catch (err) {
    // Silent fallback
  }

  return updatedOrder;
}
