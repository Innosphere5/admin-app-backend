import { supabase } from '../config/supabase.js';

const TABLE_NAME = 'products';

// Seed data array - empty so user starts with 0 products
const SEED_PRODUCTS = [];

// Memory store initialized as empty array
let memoryStore = [];

function cleanImageUrl(url) {
  if (!url || typeof url !== 'string') return url;
  let cleaned = url
    .replace(/\/e_make_transparent:[^/]+\//g, '/')
    .replace(/e_make_transparent:[0-9]+,?/g, '');

  if (cleaned.includes('cloudinary.com') && cleaned.includes('/upload/')) {
    if (!cleaned.includes('e_background_removal')) {
      cleaned = cleaned.replace(
        /\/upload\/(?:[a-zA-Z0-9_:,]+\/)?/,
        '/upload/e_background_removal,f_png,q_auto/'
      );
    }
  }
  return cleaned;
}

/**
 * Format DB row to Product Object
 */
function mapFromDb(row) {
  if (!row) return null;
  const stock = Number(row.stock_quantity ?? row.stockQuantity ?? 50);
  const rawImage = row.image_src || row.imageSrc || '';
  const rawImages = row.images ? (typeof row.images === 'string' ? JSON.parse(row.images) : row.images) : [];
  let category = row.category || 'General';
  const lowerCat = category.toLowerCase();
  const lowerName = (row.name || '').toLowerCase();
  if (lowerCat.includes('accessories') && (lowerCat.includes('tie') || lowerCat.includes('belt'))) {
    if (lowerName.includes('tie')) category = 'Tie';
    else if (lowerName.includes('belt')) category = 'Belt';
    else category = 'Accessories';
  }

  return {
    id: row.id,
    name: row.name,
    category,
    school: row.school,
    applicableClass: row.applicable_class || row.applicableClass || '',
    description: row.description || row.details || '',
    details: row.description || row.details || '',
    basePrice: Number(row.base_price || row.basePrice || 500),
    imageSrc: cleanImageUrl(rawImage),
    images: (Array.isArray(rawImages) ? rawImages : [rawImage]).map(cleanImageUrl),
    sizes: row.sizes ? (typeof row.sizes === 'string' ? JSON.parse(row.sizes) : row.sizes) : ['28', '30', '32', '34', '36'],
    sizesText: row.sizes_text || row.sizesText || 'Multiple Sizes',
    sizePrices: row.size_prices ? (typeof row.size_prices === 'string' ? JSON.parse(row.size_prices) : row.size_prices) : {},
    sizeStocks: row.size_stocks ? (typeof row.size_stocks === 'string' ? JSON.parse(row.size_stocks) : row.size_stocks) : (row.sizeStocks || {}),
    inStock: stock > 0 && row.in_stock !== false,
    stockQuantity: stock,
    createdAt: row.created_at || new Date().toISOString()
  };
}

/**
 * Format Product Object to DB row
 */
function mapToDb(product) {
  const stock = Number(product.stockQuantity ?? product.stock_quantity ?? 50);
  let category = product.category || 'General';
  const lowerCat = category.toLowerCase();
  const lowerName = (product.name || '').toLowerCase();
  if (lowerCat.includes('accessories') && (lowerCat.includes('tie') || lowerCat.includes('belt'))) {
    if (lowerName.includes('tie')) category = 'Tie';
    else if (lowerName.includes('belt')) category = 'Belt';
    else category = 'Accessories';
  }

  return {
    id: String(product.id),
    name: product.name,
    category,
    school: product.school || 'General School',
    applicable_class: product.applicableClass || '',
    description: product.description || product.details || '',
    base_price: Number(product.basePrice) || 500,
    image_src: product.imageSrc || product.images?.[0] || '',
    images: Array.isArray(product.images) ? product.images : [product.imageSrc || ''],
    sizes: Array.isArray(product.sizes) ? product.sizes : ['28', '30', '32', '34', '36'],
    sizes_text: product.sizesText || (Array.isArray(product.sizes) ? `Sizes: ${product.sizes.join(', ')}` : 'Multiple Sizes'),
    size_prices: product.sizePrices || {},
    size_stocks: product.sizeStocks || product.size_stocks || {},
    in_stock: stock > 0 && product.inStock !== false,
    stock_quantity: stock,
    created_at: product.createdAt || new Date().toISOString()
  };
}

/**
 * Fetch all products from Supabase
 */
export async function getProductsFromSupabase() {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase fetch query notice:', error.message);
      return memoryStore;
    }

    if (data) {
      const formatted = data.map(mapFromDb).filter(Boolean);
      memoryStore = formatted;
      return formatted;
    }

    return memoryStore;
  } catch (err) {
    console.error('Supabase DB fetch error:', err.message);
    return memoryStore;
  }
}

/**
 * Add a new product to Supabase
 */
export async function addProductToSupabase(productData) {
  const stock = Number(productData.stockQuantity ?? 50);
  const formattedProduct = {
    id: productData.id || `prod-${Date.now()}`,
    name: productData.name || 'New Uniform Product',
    category: productData.category || 'General',
    school: productData.school || 'General School',
    applicableClass: productData.applicableClass || '',
    description: productData.description || productData.details || '',
    details: productData.description || productData.details || '',
    basePrice: Number(productData.basePrice) || 500,
    imageSrc: productData.imageSrc || productData.images?.[0] || '',
    images: productData.images || [productData.imageSrc || ''],
    sizes: productData.sizes || ['28', '30', '32', '34', '36'],
    sizesText: productData.sizesText || (Array.isArray(productData.sizes) ? `Sizes: ${productData.sizes.join(', ')}` : 'Multiple Sizes'),
    sizePrices: productData.sizePrices || {},
    sizeStocks: productData.sizeStocks || {},
    inStock: stock > 0,
    stockQuantity: stock,
    createdAt: new Date().toISOString()
  };

  memoryStore.unshift(formattedProduct);

  try {
    const dbPayload = mapToDb(formattedProduct);
    const { error } = await supabase
      .from(TABLE_NAME)
      .insert([dbPayload]);

    if (error) {
      console.warn('Supabase insert notice:', error.message);
    } else {
      console.log('Product stored in Supabase DB:', formattedProduct.name);
    }
  } catch (err) {
    console.error('Supabase insert exception:', err.message);
  }

  return formattedProduct;
}

/**
 * Update an existing product in Supabase & memory store
 */
export async function updateProductInSupabase(id, updateData) {
  const targetId = String(id);
  const index = memoryStore.findIndex((p) => String(p.id) === targetId);

  let updatedItem;
  if (index !== -1) {
    const existing = memoryStore[index];
    const newStock = updateData.stockQuantity !== undefined ? Number(updateData.stockQuantity) : existing.stockQuantity;

    updatedItem = {
      ...existing,
      ...updateData,
      id: targetId,
      basePrice: updateData.basePrice !== undefined ? Number(updateData.basePrice) : existing.basePrice,
      stockQuantity: newStock,
      inStock: newStock > 0,
      sizes: Array.isArray(updateData.sizes) ? updateData.sizes : existing.sizes,
      sizesText: updateData.sizesText || (Array.isArray(updateData.sizes) ? `Sizes: ${updateData.sizes.join(', ')}` : existing.sizesText),
      sizePrices: updateData.sizePrices !== undefined ? updateData.sizePrices : existing.sizePrices,
      sizeStocks: updateData.sizeStocks !== undefined ? updateData.sizeStocks : existing.sizeStocks,
    };
    memoryStore[index] = updatedItem;
  } else {
    updatedItem = {
      id: targetId,
      ...updateData,
    };
    memoryStore.unshift(updatedItem);
  }

  try {
    const dbPayload = mapToDb(updatedItem);
    const { error } = await supabase
      .from(TABLE_NAME)
      .update(dbPayload)
      .eq('id', targetId);

    if (error) {
      console.warn('Supabase update notice:', error.message);
    } else {
      console.log('Product successfully updated in Supabase DB:', updatedItem.name);
    }
  } catch (err) {
    console.error('Supabase update exception:', err.message);
  }

  return updatedItem;
}

/**
 * Delete product from Supabase
 */
export async function deleteProductFromSupabase(id) {
  memoryStore = memoryStore.filter((p) => String(p.id) !== String(id));
  try {
    const { error } = await supabase.from(TABLE_NAME).delete().eq('id', String(id));
    if (error) {
      console.warn('Supabase delete notice:', error.message);
    }
  } catch (err) {
    console.error('Supabase delete exception:', err.message);
  }
  return true;
}

/**
 * Clear all products from Supabase table & memory store
 */
export async function clearAllProductsFromSupabase() {
  memoryStore = [];
  try {
    const { error } = await supabase.from(TABLE_NAME).delete().neq('id', '___non_existent_id___');
    if (error) {
      console.warn('Supabase clear all notice:', error.message);
    } else {
      console.log('🧹 Cleared all products from Supabase DB successfully.');
    }
  } catch (err) {
    console.error('Supabase clear all exception:', err.message);
  }
  return true;
}

/**
 * Rename category across all products in Supabase and memory store
 */
export async function renameCategoryInProducts(oldName, newName) {
  if (!oldName || !newName) return { success: true, updatedCount: 0 };
  const cleanOld = String(oldName).trim().toLowerCase();
  const cleanNew = String(newName).trim();

  memoryStore.forEach((p) => {
    if (p.category && p.category.trim().toLowerCase() === cleanOld) {
      p.category = cleanNew;
    }
  });

  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update({ category: cleanNew })
      .ilike('category', oldName.trim())
      .select('id, name, category');

    let updatedCount = data?.length || 0;

    const { data: allProds } = await supabase.from(TABLE_NAME).select('id, category');
    if (Array.isArray(allProds)) {
      const remainingIds = allProds
        .filter((p) => p.category && p.category.trim().toLowerCase() === cleanOld && p.category !== cleanNew)
        .map((p) => p.id);

      if (remainingIds.length > 0) {
        const { data: updatedRemaining } = await supabase
          .from(TABLE_NAME)
          .update({ category: cleanNew })
          .in('id', remainingIds)
          .select('id');
        updatedCount += updatedRemaining?.length || 0;
      }
    }

    if (error) {
      console.warn('Supabase renameCategory notice:', error.message);
    } else {
      console.log(`Updated ${updatedCount} products from category "${oldName}" to "${cleanNew}"`);
    }
    return { success: !error, updatedCount };
  } catch (err) {
    console.error('renameCategoryInProducts exception:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Reset deleted category to 'General' across all products in Supabase and memory store
 */
export async function deleteCategoryInProducts(catName) {
  if (!catName) return { success: true, updatedCount: 0 };
  const cleanTarget = String(catName).trim().toLowerCase();

  memoryStore.forEach((p) => {
    if (p.category && p.category.trim().toLowerCase() === cleanTarget) {
      p.category = 'General';
    }
  });

  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update({ category: 'General' })
      .ilike('category', catName.trim())
      .select('id, name');

    let updatedCount = data?.length || 0;

    const { data: allProds } = await supabase.from(TABLE_NAME).select('id, category');
    if (Array.isArray(allProds)) {
      const remainingIds = allProds
        .filter((p) => p.category && p.category.trim().toLowerCase() === cleanTarget && p.category !== 'General')
        .map((p) => p.id);

      if (remainingIds.length > 0) {
        const { data: updatedRemaining } = await supabase
          .from(TABLE_NAME)
          .update({ category: 'General' })
          .in('id', remainingIds)
          .select('id');
        updatedCount += updatedRemaining?.length || 0;
      }
    }

    if (error) {
      console.warn('Supabase deleteCategory notice:', error.message);
    } else {
      console.log(`Reset ${updatedCount} products from deleted category "${catName}" to "General"`);
    }
    return { success: true, updatedCount };
  } catch (err) {
    console.error('deleteCategoryInProducts exception:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Rename school across all products in Supabase and memory store
 */
export async function renameSchoolInProducts(oldName, newName) {
  memoryStore.forEach((p) => {
    if (p.school && p.school.toLowerCase() === oldName.toLowerCase()) {
      p.school = newName;
    }
  });
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update({ school: newName })
      .ilike('school', oldName)
      .select('id, name, school');

    if (error) {
      console.warn('Supabase renameSchool notice:', error.message);
    } else {
      console.log(`Updated ${data?.length || 0} products from school "${oldName}" to "${newName}"`);
    }
    return { success: !error, updatedCount: data?.length || 0 };
  } catch (err) {
    console.error('renameSchoolInProducts exception:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Reset deleted school to 'General School' across all products in Supabase and memory store
 */
export async function deleteSchoolInProducts(schoolName) {
  if (!schoolName) return { success: true, updatedCount: 0 };
  const cleanTarget = String(schoolName).trim().toLowerCase();

  memoryStore.forEach((p) => {
    if (p.school && p.school.trim().toLowerCase() === cleanTarget) {
      p.school = 'General School';
    }
  });

  try {
    // 1. Direct case-insensitive match
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update({ school: 'General School' })
      .ilike('school', schoolName.trim())
      .select('id, name');

    let updatedCount = data?.length || 0;

    // 2. Fetch all products to catch any with slight formatting variations (extra spaces)
    const { data: allProds } = await supabase.from(TABLE_NAME).select('id, school');
    if (Array.isArray(allProds)) {
      const remainingIds = allProds
        .filter((p) => p.school && p.school.trim().toLowerCase() === cleanTarget && p.school !== 'General School')
        .map((p) => p.id);

      if (remainingIds.length > 0) {
        const { data: updatedRemaining } = await supabase
          .from(TABLE_NAME)
          .update({ school: 'General School' })
          .in('id', remainingIds)
          .select('id');
        updatedCount += updatedRemaining?.length || 0;
      }
    }

    if (error) {
      console.warn('Supabase deleteSchool notice:', error.message);
    } else {
      console.log(`Reset ${updatedCount} products from deleted school "${schoolName}" to "General School"`);
    }
    return { success: true, updatedCount };
  } catch (err) {
    console.error('deleteSchoolInProducts exception:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Rename class across all products in Supabase and memory store
 */
export async function renameClassInProducts(oldName, newName) {
  if (!oldName || !newName) return { success: true, updatedCount: 0 };
  const cleanOld = String(oldName).trim().toLowerCase();
  const cleanNew = String(newName).trim();

  memoryStore.forEach((p) => {
    if (p.applicableClass && p.applicableClass.trim().toLowerCase() === cleanOld) {
      p.applicableClass = cleanNew;
    }
  });

  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update({ applicable_class: cleanNew })
      .ilike('applicable_class', oldName.trim())
      .select('id, name, applicable_class');

    let updatedCount = data?.length || 0;

    const { data: allProds } = await supabase.from(TABLE_NAME).select('id, applicable_class');
    if (Array.isArray(allProds)) {
      const remainingIds = allProds
        .filter((p) => p.applicable_class && p.applicable_class.trim().toLowerCase() === cleanOld && p.applicable_class !== cleanNew)
        .map((p) => p.id);

      if (remainingIds.length > 0) {
        const { data: updatedRemaining } = await supabase
          .from(TABLE_NAME)
          .update({ applicable_class: cleanNew })
          .in('id', remainingIds)
          .select('id');
        updatedCount += updatedRemaining?.length || 0;
      }
    }

    if (error) {
      console.warn('Supabase renameClass notice:', error.message);
    } else {
      console.log(`Updated ${updatedCount} products from class "${oldName}" to "${cleanNew}"`);
    }
    return { success: !error, updatedCount };
  } catch (err) {
    console.error('renameClassInProducts exception:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Reset deleted class to 'All Classes' across all products in Supabase and memory store
 */
export async function deleteClassInProducts(className) {
  if (!className) return { success: true, updatedCount: 0 };
  const cleanTarget = String(className).trim().toLowerCase();

  memoryStore.forEach((p) => {
    if (p.applicableClass && p.applicableClass.trim().toLowerCase() === cleanTarget) {
      p.applicableClass = 'All Classes';
    }
  });

  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update({ applicable_class: 'All Classes' })
      .ilike('applicable_class', className.trim())
      .select('id, name');

    let updatedCount = data?.length || 0;

    const { data: allProds } = await supabase.from(TABLE_NAME).select('id, applicable_class');
    if (Array.isArray(allProds)) {
      const remainingIds = allProds
        .filter((p) => p.applicable_class && p.applicable_class.trim().toLowerCase() === cleanTarget && p.applicable_class !== 'All Classes')
        .map((p) => p.id);

      if (remainingIds.length > 0) {
        const { data: updatedRemaining } = await supabase
          .from(TABLE_NAME)
          .update({ applicable_class: 'All Classes' })
          .in('id', remainingIds)
          .select('id');
        updatedCount += updatedRemaining?.length || 0;
      }
    }

    if (error) {
      console.warn('Supabase deleteClass notice:', error.message);
    } else {
      console.log(`Reset ${updatedCount} products from deleted class "${className}" to "All Classes"`);
    }
    return { success: true, updatedCount };
  } catch (err) {
    console.error('deleteClassInProducts exception:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Retrieve master registry (schools, classes, categories, deletions) from Supabase persistent store
 */
export async function getMasterRegistryFromSupabase() {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('message, created_at')
      .eq('id', 'sys_master_registry')
      .maybeSingle();

    if (!error && data && data.message) {
      const parsed = JSON.parse(data.message);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Supabase getMasterRegistry notice:', err.message);
  }
  return null;
}

/**
 * Persist master registry directly into Supabase (accessible across cloud, local dev, and web panel)
 */
export async function saveMasterRegistryToSupabase(registry) {
  try {
    const payload = {
      id: 'sys_master_registry',
      order_id: 'SYSTEM',
      type: 'system_masters',
      title: 'System Master Registry',
      message: JSON.stringify({
        ...registry,
        updatedAt: new Date().toISOString()
      }),
      target_role: 'system',
      read: true,
      created_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('notifications')
      .upsert([payload], { onConflict: 'id' });

    if (error) {
      console.warn('Supabase saveMasterRegistry notice:', error.message);
      return false;
    }
    console.log('✅ Master registry successfully synced to Supabase database');
    return true;
  } catch (err) {
    console.error('saveMasterRegistryToSupabase exception:', err.message);
    return false;
  }
}

/**
 * Helper: Format real calendar date into a user-friendly string (e.g., "Saturday, 10 Oct 2026")
 */
export function formatRealDate(dateInput) {
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch (e) {
    return '';
  }
}

/**
 * Generate default shop status object (2 days closed by default)
 */
export function getDefaultShopStatus() {
  const now = new Date();
  const reopen = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const formatted = formatRealDate(reopen);

  return {
    isClosed: false,
    closureDays: 2,
    startDate: now.toISOString(),
    reopenDate: reopen.toISOString(),
    reopenDateFormatted: formatted,
    bannerTitle: 'Shop Temporarily Closed for 2 Days',
    bannerMessage: `Our shop is closed for 2 days. We will reopen on ${formatted}. Online orders placed now will be processed as soon as we reopen!`,
    allowOrders: true,
    showPopup: true,
    showTopBanner: true,
    updatedAt: now.toISOString()
  };
}

/**
 * Retrieve shop status and closure banner settings from Supabase
 */
export async function getShopStatusFromSupabase() {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('message, created_at')
      .eq('id', 'sys_shop_status')
      .maybeSingle();

    if (!error && data && data.message) {
      const parsed = JSON.parse(data.message);
      if (parsed && typeof parsed === 'object') {
        // Ensure reopenDateFormatted is present and accurate
        if (parsed.reopenDate && !parsed.reopenDateFormatted) {
          parsed.reopenDateFormatted = formatRealDate(parsed.reopenDate);
        }
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Supabase getShopStatus notice:', err.message);
  }
  return getDefaultShopStatus();
}

/**
 * Persist shop status and closure banner settings to Supabase
 */
export async function saveShopStatusToSupabase(statusData) {
  try {
    const current = await getShopStatusFromSupabase();
    const updated = {
      ...current,
      ...statusData,
      updatedAt: new Date().toISOString()
    };

    // Calculate/ensure real date string
    if (updated.reopenDate) {
      updated.reopenDateFormatted = formatRealDate(updated.reopenDate);
    } else if (updated.closureDays) {
      const start = updated.startDate ? new Date(updated.startDate) : new Date();
      const reopen = new Date(start.getTime() + Number(updated.closureDays) * 24 * 60 * 60 * 1000);
      updated.reopenDate = reopen.toISOString();
      updated.reopenDateFormatted = formatRealDate(reopen);
    }

    const payload = {
      id: 'sys_shop_status',
      order_id: 'SYSTEM',
      type: 'shop_status',
      title: 'Shop Status & Closure Banner',
      message: JSON.stringify(updated),
      target_role: 'all',
      read: true,
      created_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('notifications')
      .upsert([payload], { onConflict: 'id' });

    if (error) {
      console.warn('Supabase saveShopStatus notice:', error.message);
      return { success: false, error: error.message };
    }

    console.log('✅ Shop status & closure banner successfully synced to Supabase database');
    return { success: true, shopStatus: updated };
  } catch (err) {
    console.error('saveShopStatusToSupabase exception:', err.message);
    return { success: false, error: err.message };
  }
}


