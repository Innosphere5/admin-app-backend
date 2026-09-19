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
  memoryStore.forEach((p) => {
    if (p.category && p.category.toLowerCase() === oldName.toLowerCase()) {
      p.category = newName;
    }
  });
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update({ category: newName })
      .ilike('category', oldName)
      .select('id, name, category');

    if (error) {
      console.warn('Supabase renameCategory notice:', error.message);
    } else {
      console.log(`Updated ${data?.length || 0} products from category "${oldName}" to "${newName}"`);
    }
    return { success: !error, updatedCount: data?.length || 0 };
  } catch (err) {
    console.error('renameCategoryInProducts exception:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Reset deleted category to 'General' across all products in Supabase and memory store
 */
export async function deleteCategoryInProducts(catName) {
  memoryStore.forEach((p) => {
    if (p.category && p.category.toLowerCase() === catName.toLowerCase()) {
      p.category = 'General';
    }
  });
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update({ category: 'General' })
      .ilike('category', catName)
      .select('id, name');

    if (error) {
      console.warn('Supabase deleteCategory notice:', error.message);
    } else {
      console.log(`Reset ${data?.length || 0} products from deleted category "${catName}" to "General"`);
    }
    return { success: !error, updatedCount: data?.length || 0 };
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
  memoryStore.forEach((p) => {
    if (p.school && p.school.toLowerCase() === schoolName.toLowerCase()) {
      p.school = 'General School';
    }
  });
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update({ school: 'General School' })
      .ilike('school', schoolName)
      .select('id, name');

    if (error) {
      console.warn('Supabase deleteSchool notice:', error.message);
    } else {
      console.log(`Reset ${data?.length || 0} products from deleted school "${schoolName}" to "General School"`);
    }
    return { success: !error, updatedCount: data?.length || 0 };
  } catch (err) {
    console.error('deleteSchoolInProducts exception:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Rename class across all products in Supabase and memory store
 */
export async function renameClassInProducts(oldName, newName) {
  memoryStore.forEach((p) => {
    if (p.applicableClass && p.applicableClass.toLowerCase() === oldName.toLowerCase()) {
      p.applicableClass = newName;
    }
  });
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update({ applicable_class: newName })
      .ilike('applicable_class', oldName)
      .select('id, name, applicable_class');

    if (error) {
      console.warn('Supabase renameClass notice:', error.message);
    } else {
      console.log(`Updated ${data?.length || 0} products from class "${oldName}" to "${newName}"`);
    }
    return { success: !error, updatedCount: data?.length || 0 };
  } catch (err) {
    console.error('renameClassInProducts exception:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Reset deleted class to 'All Classes' across all products in Supabase and memory store
 */
export async function deleteClassInProducts(className) {
  memoryStore.forEach((p) => {
    if (p.applicableClass && p.applicableClass.toLowerCase() === className.toLowerCase()) {
      p.applicableClass = 'All Classes';
    }
  });
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update({ applicable_class: 'All Classes' })
      .ilike('applicable_class', className)
      .select('id, name');

    if (error) {
      console.warn('Supabase deleteClass notice:', error.message);
    } else {
      console.log(`Reset ${data?.length || 0} products from deleted class "${className}" to "All Classes"`);
    }
    return { success: !error, updatedCount: data?.length || 0 };
  } catch (err) {
    console.error('deleteClassInProducts exception:', err.message);
    return { success: false, error: err.message };
  }
}

