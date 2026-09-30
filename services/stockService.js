import { supabase } from '../config/supabase.js';

const PRODUCTS_TABLE = 'products';

/**
 * Deduct stock for all items in an order.
 * Decreases both `stock_quantity` (overall) and `size_stocks` (per-size JSONB) for each product.
 *
 * @param {Array} items - Array of order items, each with { productId, size, qty }
 * @returns {Object} { success: boolean, updatedProducts: Array, errors: Array }
 */
export async function deductStockForOrder(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { success: true, updatedProducts: [], errors: [] };
  }

  const updatedProducts = [];
  const errors = [];

  // Group items by productId to batch updates per product
  const productQtyMap = {};
  for (const item of items) {
    const productId = String(item.productId || item.id || '');
    if (!productId) continue;

    const size = String(item.size || '');
    const qty = Number(item.qty || 1);

    if (!productQtyMap[productId]) {
      productQtyMap[productId] = { totalQty: 0, sizeDeductions: {} };
    }
    productQtyMap[productId].totalQty += qty;

    if (size) {
      productQtyMap[productId].sizeDeductions[size] =
        (productQtyMap[productId].sizeDeductions[size] || 0) + qty;
    }
  }

  // Process each product
  for (const [productId, { totalQty, sizeDeductions }] of Object.entries(productQtyMap)) {
    try {
      // Fetch current product stock from Supabase
      const { data: product, error: fetchErr } = await supabase
        .from(PRODUCTS_TABLE)
        .select('id, name, stock_quantity, size_stocks, in_stock')
        .eq('id', productId)
        .maybeSingle();

      if (fetchErr || !product) {
        errors.push({ productId, error: fetchErr?.message || 'Product not found' });
        console.warn(`⚠️ Stock deduction skipped for product ${productId}: not found in DB`);
        continue;
      }

      // Calculate new overall stock (never go below 0)
      const currentStock = Number(product.stock_quantity ?? 0);
      const newStockQuantity = Math.max(0, currentStock - totalQty);

      // Calculate new per-size stocks
      let currentSizeStocks = product.size_stocks || {};
      if (typeof currentSizeStocks === 'string') {
        try { currentSizeStocks = JSON.parse(currentSizeStocks); } catch (e) { currentSizeStocks = {}; }
      }
      const newSizeStocks = { ...currentSizeStocks };

      for (const [size, deductQty] of Object.entries(sizeDeductions)) {
        const currentSizeStock = Number(newSizeStocks[size] ?? 0);
        newSizeStocks[size] = Math.max(0, currentSizeStock - deductQty);
      }

      // Update product in Supabase
      const updatePayload = {
        stock_quantity: newStockQuantity,
        size_stocks: newSizeStocks,
        in_stock: newStockQuantity > 0,
      };

      const { error: updateErr } = await supabase
        .from(PRODUCTS_TABLE)
        .update(updatePayload)
        .eq('id', productId);

      if (updateErr) {
        errors.push({ productId, error: updateErr.message });
        console.error(`❌ Failed to deduct stock for product ${productId}:`, updateErr.message);
      } else {
        updatedProducts.push({
          productId,
          name: product.name,
          previousStock: currentStock,
          newStock: newStockQuantity,
          deducted: totalQty,
        });
        console.log(`📦 Stock deducted for "${product.name}": ${currentStock} → ${newStockQuantity} (−${totalQty})`);
      }
    } catch (err) {
      errors.push({ productId, error: err.message });
      console.error(`❌ Stock deduction exception for product ${productId}:`, err.message);
    }
  }

  return { success: errors.length === 0, updatedProducts, errors };
}

/**
 * Restore stock for all items in an order.
 * Used when an order is declined, cancelled, or deleted (if it was pending/accepted).
 * Increases both `stock_quantity` (overall) and `size_stocks` (per-size JSONB) for each product.
 *
 * @param {Array} items - Array of order items, each with { productId, size, qty }
 * @returns {Object} { success: boolean, restoredProducts: Array, errors: Array }
 */
export async function restoreStockForOrder(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { success: true, restoredProducts: [], errors: [] };
  }

  const restoredProducts = [];
  const errors = [];

  // Group items by productId to batch updates per product
  const productQtyMap = {};
  for (const item of items) {
    const productId = String(item.productId || item.id || '');
    if (!productId) continue;

    const size = String(item.size || '');
    const qty = Number(item.qty || 1);

    if (!productQtyMap[productId]) {
      productQtyMap[productId] = { totalQty: 0, sizeRestorations: {} };
    }
    productQtyMap[productId].totalQty += qty;

    if (size) {
      productQtyMap[productId].sizeRestorations[size] =
        (productQtyMap[productId].sizeRestorations[size] || 0) + qty;
    }
  }

  // Process each product
  for (const [productId, { totalQty, sizeRestorations }] of Object.entries(productQtyMap)) {
    try {
      // Fetch current product stock from Supabase
      const { data: product, error: fetchErr } = await supabase
        .from(PRODUCTS_TABLE)
        .select('id, name, stock_quantity, size_stocks, in_stock')
        .eq('id', productId)
        .maybeSingle();

      if (fetchErr || !product) {
        errors.push({ productId, error: fetchErr?.message || 'Product not found' });
        console.warn(`⚠️ Stock restoration skipped for product ${productId}: not found in DB`);
        continue;
      }

      // Calculate new overall stock (add back)
      const currentStock = Number(product.stock_quantity ?? 0);
      const newStockQuantity = currentStock + totalQty;

      // Calculate new per-size stocks (add back)
      let currentSizeStocks = product.size_stocks || {};
      if (typeof currentSizeStocks === 'string') {
        try { currentSizeStocks = JSON.parse(currentSizeStocks); } catch (e) { currentSizeStocks = {}; }
      }
      const newSizeStocks = { ...currentSizeStocks };

      for (const [size, restoreQty] of Object.entries(sizeRestorations)) {
        const currentSizeStock = Number(newSizeStocks[size] ?? 0);
        newSizeStocks[size] = currentSizeStock + restoreQty;
      }

      // Update product in Supabase
      const updatePayload = {
        stock_quantity: newStockQuantity,
        size_stocks: newSizeStocks,
        in_stock: newStockQuantity > 0,
      };

      const { error: updateErr } = await supabase
        .from(PRODUCTS_TABLE)
        .update(updatePayload)
        .eq('id', productId);

      if (updateErr) {
        errors.push({ productId, error: updateErr.message });
        console.error(`❌ Failed to restore stock for product ${productId}:`, updateErr.message);
      } else {
        restoredProducts.push({
          productId,
          name: product.name,
          previousStock: currentStock,
          newStock: newStockQuantity,
          restored: totalQty,
        });
        console.log(`♻️ Stock restored for "${product.name}": ${currentStock} → ${newStockQuantity} (+${totalQty})`);
      }
    } catch (err) {
      errors.push({ productId, error: err.message });
      console.error(`❌ Stock restoration exception for product ${productId}:`, err.message);
    }
  }

  return { success: errors.length === 0, restoredProducts, errors };
}
