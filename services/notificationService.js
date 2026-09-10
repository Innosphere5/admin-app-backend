import { supabase } from '../config/supabase.js';

const TABLE_NAME = 'notifications';

// In-memory notifications store for resilience
let notificationsStore = [
  {
    id: 'notif-seed-1',
    orderId: 'BS-1024',
    type: 'order_created',
    title: 'New Uniform Order Received',
    message: 'Order #BS1024 placed by Rahul Sharma for Delhi Public School (₹1,750)',
    targetRole: 'all',
    customerMobile: '+91 98765 43210',
    read: false,
    createdAt: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: 'notif-seed-2',
    orderId: 'BS-1023',
    type: 'order_accepted',
    title: 'Order Accepted & Scheduled',
    message: 'Order #BS1023 accepted. Expected Delivery: Today by 5:30 PM',
    targetRole: 'all',
    customerMobile: '+91 98123 45678',
    read: false,
    createdAt: new Date(Date.now() - 72000000).toISOString()
  }
];

// Active SSE client connections for real-time push
const sseClients = new Set();

/**
 * Register a client for live Server-Sent Events stream
 */
export function registerSseClient(res) {
  sseClients.add(res);
  res.on('close', () => {
    sseClients.delete(res);
  });
}

/**
 * Broadcast real-time event to all connected SSE clients
 */
export function broadcastRealtimeEvent(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

function mapFromDb(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    orderId: row.order_id || row.orderId,
    type: row.type || 'general',
    title: row.title,
    message: row.message,
    targetRole: row.target_role || row.targetRole || 'all',
    customerMobile: row.customer_mobile || row.customerMobile || '',
    read: Boolean(row.read),
    createdAt: row.created_at || row.createdAt || new Date().toISOString()
  };
}

function mapToDb(notif) {
  return {
    id: String(notif.id),
    order_id: notif.orderId,
    type: notif.type,
    title: notif.title,
    message: notif.message,
    target_role: notif.targetRole || 'all',
    customer_mobile: notif.customerMobile || '',
    read: Boolean(notif.read),
    created_at: notif.createdAt || new Date().toISOString()
  };
}

/**
 * Fetch notifications from Supabase & fallback
 */
export async function getNotificationsFromSupabase(role = 'all', mobile = '') {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error && Array.isArray(data) && data.length > 0) {
      const formatted = data.map(mapFromDb).filter(Boolean);
      notificationsStore = formatted;
    }
  } catch (err) {
    // Suppress schema cache warning gracefully
  }

  let filtered = notificationsStore;
  if (role && role !== 'all') {
    filtered = filtered.filter((n) => n.targetRole === 'all' || n.targetRole === role);
  }
  if (mobile) {
    filtered = filtered.filter((n) => !n.customerMobile || n.customerMobile === mobile);
  }
  return filtered;
}

/**
 * Create and broadcast a new real-time notification
 */
export async function createNotification(notifData) {
  const notif = {
    id: notifData.id || `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    orderId: notifData.orderId || null,
    type: notifData.type || 'general',
    title: notifData.title || 'Uniform Order Update',
    message: notifData.message || '',
    targetRole: notifData.targetRole || 'all',
    customerMobile: notifData.customerMobile || '',
    read: false,
    createdAt: new Date().toISOString()
  };

  // Prepend to local memory store
  notificationsStore.unshift(notif);
  if (notificationsStore.length > 100) notificationsStore.pop();

  // Broadcast to all active SSE subscribers in real-time
  broadcastRealtimeEvent('notification', notif);

  // Persist to Supabase if table exists
  try {
    const dbPayload = mapToDb(notif);
    await supabase.from(TABLE_NAME).insert([dbPayload]);
  } catch (err) {
    // Silent fallback
  }

  return notif;
}

/**
 * Mark notification as read
 */
export async function markNotificationRead(id) {
  const targetId = String(id);
  const notif = notificationsStore.find((n) => String(n.id) === targetId);
  if (notif) {
    notif.read = true;
  }

  try {
    await supabase.from(TABLE_NAME).update({ read: true }).eq('id', targetId);
  } catch (e) {}

  broadcastRealtimeEvent('notification_read', { id: targetId });
  return notificationsStore;
}

/**
 * Mark all notifications as read
 */
export async function markAllNotificationsRead(role = 'all') {
  notificationsStore.forEach((n) => {
    if (role === 'all' || n.targetRole === role || n.targetRole === 'all') {
      n.read = true;
    }
  });

  try {
    await supabase.from(TABLE_NAME).update({ read: true }).eq('read', false);
  } catch (e) {}

  broadcastRealtimeEvent('all_notifications_read', { role });
  return notificationsStore;
}
