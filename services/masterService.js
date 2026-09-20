import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  renameCategoryInProducts,
  deleteCategoryInProducts,
  renameSchoolInProducts,
  deleteSchoolInProducts,
  renameClassInProducts,
  deleteClassInProducts,
  getProductsFromSupabase,
  getMasterRegistryFromSupabase,
  saveMasterRegistryToSupabase
} from './supabaseService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../data');

const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const SCHOOLS_FILE = path.join(DATA_DIR, 'schools.json');
const CLASSES_FILE = path.join(DATA_DIR, 'classes.json');
const DELETED_CATEGORIES_FILE = path.join(DATA_DIR, 'deleted_categories.json');
const DELETED_SCHOOLS_FILE = path.join(DATA_DIR, 'deleted_schools.json');
const DELETED_CLASSES_FILE = path.join(DATA_DIR, 'deleted_classes.json');

const DEFAULT_CATEGORIES = [
  'Shirt',
  'Pant',
  'Skirt',
  'Skirt Divided',
  'Socks',
  'Tie',
  'Belt',
  'T.Shirt',
  'Lower',
  'Track Suit',
  'Sweater',
  'Pullover',
  'Coat/Blazer',
  'Jacket',
  'Stocking',
  'Shoes',
  'Accessories'
];

const DEFAULT_SCHOOLS = [
  'Delhi Public School, Bathinda',
  'St. Xavier School, Bathinda',
  'St. Joseph School, Bathinda',
  'Silver Oaks School, Bathinda',
  'Silver Oaks Global School, Bathinda',
  "St. Paul's School, Bathinda",
  'Xavier World School, Bathinda',
  'St. Kabir Convent School, Bhuchoo Khurd',
  'St. Kabir Convent School, Model Town Branch',
  'The Sanskaar School, Talwandi Sabo',
  'DAV Public School, Bathinda'
];

const DEFAULT_CLASSES = [
  'NURSERY - KG',
  'NUR - II',
  'NUR - V',
  'NUR - X',
  'I - II',
  'III - V',
  'I - V',
  'I - VIII',
  'I - X',
  'VI - VIII',
  'VI - X',
  'IX - X',
  'XI - XII',
  'All Classes'
];

function ensureFile(filePath, defaultData) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2), 'utf-8');
      return defaultData;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (err) {
    console.warn(`Error reading ${filePath}:`, err.message);
  }
  return defaultData;
}

function saveFile(filePath, data) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Error saving ${filePath}:`, err.message);
  }
}

/**
 * Load full master state from Supabase (shared persistent store) with local file fallback
 */
async function getFullRegistry() {
  const fileCategories = ensureFile(CATEGORIES_FILE, DEFAULT_CATEGORIES);
  const fileSchools = ensureFile(SCHOOLS_FILE, DEFAULT_SCHOOLS);
  const fileClasses = ensureFile(CLASSES_FILE, DEFAULT_CLASSES);
  const fileDelCats = ensureFile(DELETED_CATEGORIES_FILE, []);
  const fileDelSchools = ensureFile(DELETED_SCHOOLS_FILE, []);
  const fileDelClasses = ensureFile(DELETED_CLASSES_FILE, []);

  try {
    const remote = await getMasterRegistryFromSupabase();
    if (remote && Array.isArray(remote.schools) && Array.isArray(remote.classes)) {
      // Sync to local files for secondary cache
      saveFile(CATEGORIES_FILE, remote.categories || fileCategories);
      saveFile(SCHOOLS_FILE, remote.schools || fileSchools);
      saveFile(CLASSES_FILE, remote.classes || fileClasses);
      saveFile(DELETED_CATEGORIES_FILE, remote.deletedCategories || fileDelCats);
      saveFile(DELETED_SCHOOLS_FILE, remote.deletedSchools || fileDelSchools);
      saveFile(DELETED_CLASSES_FILE, remote.deletedClasses || fileDelClasses);
      return remote;
    }
  } catch (e) {
    console.warn('Could not read master registry from Supabase:', e.message);
  }

  // Initialize Supabase registry from local files if not yet seeded
  const initial = {
    categories: fileCategories,
    schools: fileSchools,
    classes: fileClasses,
    deletedCategories: fileDelCats,
    deletedSchools: fileDelSchools,
    deletedClasses: fileDelClasses,
  };
  await saveMasterRegistryToSupabase(initial);
  return initial;
}

/**
 * Save master state to both Supabase and local cache files
 */
async function syncRegistry(updated) {
  const current = await getFullRegistry();
  const merged = {
    categories: updated.categories !== undefined ? updated.categories : (current.categories || []),
    schools: updated.schools !== undefined ? updated.schools : (current.schools || []),
    classes: updated.classes !== undefined ? updated.classes : (current.classes || []),
    deletedCategories: updated.deletedCategories !== undefined ? updated.deletedCategories : (current.deletedCategories || []),
    deletedSchools: updated.deletedSchools !== undefined ? updated.deletedSchools : (current.deletedSchools || []),
    deletedClasses: updated.deletedClasses !== undefined ? updated.deletedClasses : (current.deletedClasses || []),
  };

  saveFile(CATEGORIES_FILE, merged.categories);
  saveFile(SCHOOLS_FILE, merged.schools);
  saveFile(CLASSES_FILE, merged.classes);
  saveFile(DELETED_CATEGORIES_FILE, merged.deletedCategories);
  saveFile(DELETED_SCHOOLS_FILE, merged.deletedSchools);
  saveFile(DELETED_CLASSES_FILE, merged.deletedClasses);

  await saveMasterRegistryToSupabase(merged);
  return merged;
}

// -------------------------------------------------------------
// Category Master CRUD
// -------------------------------------------------------------

export async function getCategories() {
  const registry = await getFullRegistry();
  const deletedSet = new Set((registry.deletedCategories || []).map((c) => String(c).trim().toLowerCase()));

  const catSet = new Set();
  (registry.categories || []).forEach((c) => {
    if (c && typeof c === 'string') {
      const trimmed = c.trim();
      if (trimmed && !deletedSet.has(trimmed.toLowerCase())) {
        catSet.add(trimmed);
      }
    }
  });

  try {
    const products = await getProductsFromSupabase();
    products.forEach((p) => {
      if (p.category && typeof p.category === 'string') {
        const c = p.category.trim();
        const lower = c.toLowerCase();
        if (!deletedSet.has(lower) && (!lower.includes('accessories') || (!lower.includes('tie') && !lower.includes('belt')))) {
          catSet.add(c);
        }
      }
    });
  } catch (e) {}

  const result = Array.from(catSet);
  saveFile(CATEGORIES_FILE, result);
  return result;
}

export async function addCategory(name) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('Valid category name is required');
  }
  const cleanName = name.trim();
  const lowerClean = cleanName.toLowerCase();

  const registry = await getFullRegistry();
  let deletedCats = (registry.deletedCategories || []).filter((c) => c.trim().toLowerCase() !== lowerClean);
  let cats = (registry.categories || []).filter((c) => c.trim().toLowerCase() !== lowerClean);
  cats.push(cleanName);

  await syncRegistry({ categories: cats, deletedCategories: deletedCats });
  return cleanName;
}

export async function updateCategory(oldName, newName) {
  if (!oldName || !newName || !newName.trim()) {
    throw new Error('Both old and new category names are required');
  }
  const cleanOld = oldName.trim();
  const cleanNew = newName.trim();
  const lowerOld = cleanOld.toLowerCase();
  const lowerNew = cleanNew.toLowerCase();

  const registry = await getFullRegistry();
  let deletedCats = (registry.deletedCategories || []).filter((c) => c.trim().toLowerCase() !== lowerNew);
  if (!deletedCats.some((c) => c.trim().toLowerCase() === lowerOld)) {
    deletedCats.push(cleanOld);
  }

  let cats = (registry.categories || []).filter((c) => c.trim().toLowerCase() !== lowerOld);
  if (!cats.some((c) => c.trim().toLowerCase() === lowerNew)) {
    cats.push(cleanNew);
  }

  await syncRegistry({ categories: cats, deletedCategories: deletedCats });
  await renameCategoryInProducts(cleanOld, cleanNew);

  return { oldName: cleanOld, newName: cleanNew };
}

export async function deleteCategory(name) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('Category name is required');
  }
  const cleanName = name.trim();
  const lowerClean = cleanName.toLowerCase();

  const registry = await getFullRegistry();
  let deletedCats = registry.deletedCategories || [];
  if (!deletedCats.some((c) => c.trim().toLowerCase() === lowerClean)) {
    deletedCats.push(cleanName);
  }

  let cats = (registry.categories || []).filter((c) => c.trim().toLowerCase() !== lowerClean);

  await syncRegistry({ categories: cats, deletedCategories: deletedCats });
  await deleteCategoryInProducts(cleanName);

  return { deleted: cleanName };
}

// -------------------------------------------------------------
// School Master CRUD
// -------------------------------------------------------------

export async function getSchools() {
  const registry = await getFullRegistry();
  const deletedSet = new Set((registry.deletedSchools || []).map((s) => String(s).trim().toLowerCase()));

  const schoolSet = new Set();
  (registry.schools || []).forEach((s) => {
    if (s && typeof s === 'string') {
      const trimmed = s.trim();
      if (trimmed && !deletedSet.has(trimmed.toLowerCase())) {
        schoolSet.add(trimmed);
      }
    }
  });

  const result = Array.from(schoolSet);
  saveFile(SCHOOLS_FILE, result);
  return result;
}

export async function addSchool(name) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('Valid school name is required');
  }
  const cleanName = name.trim();
  const lowerClean = cleanName.toLowerCase();

  const registry = await getFullRegistry();
  let deletedSchools = (registry.deletedSchools || []).filter((s) => s.trim().toLowerCase() !== lowerClean);
  let schools = (registry.schools || []).filter((s) => s.trim().toLowerCase() !== lowerClean);
  schools.push(cleanName);

  await syncRegistry({ schools, deletedSchools });
  return cleanName;
}

export async function updateSchool(oldName, newName) {
  if (!oldName || !newName || !newName.trim()) {
    throw new Error('Both old and new school names are required');
  }
  const cleanOld = oldName.trim();
  const cleanNew = newName.trim();
  const lowerOld = cleanOld.toLowerCase();
  const lowerNew = cleanNew.toLowerCase();

  const registry = await getFullRegistry();
  let deletedSchools = (registry.deletedSchools || []).filter((s) => s.trim().toLowerCase() !== lowerNew);
  if (!deletedSchools.some((s) => s.trim().toLowerCase() === lowerOld)) {
    deletedSchools.push(cleanOld);
  }

  let schools = (registry.schools || []).filter((s) => s.trim().toLowerCase() !== lowerOld);
  if (!schools.some((s) => s.trim().toLowerCase() === lowerNew)) {
    schools.push(cleanNew);
  }

  await syncRegistry({ schools, deletedSchools });
  await renameSchoolInProducts(cleanOld, cleanNew);

  return { oldName: cleanOld, newName: cleanNew };
}

export async function deleteSchool(name) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('School name is required');
  }
  const cleanName = name.trim();
  const lowerClean = cleanName.toLowerCase();

  const registry = await getFullRegistry();
  let deletedSchools = registry.deletedSchools || [];
  if (!deletedSchools.some((s) => s.trim().toLowerCase() === lowerClean)) {
    deletedSchools.push(cleanName);
  }

  let schools = (registry.schools || []).filter((s) => s.trim().toLowerCase() !== lowerClean);

  await syncRegistry({ schools, deletedSchools });
  await deleteSchoolInProducts(cleanName);

  return { deleted: cleanName };
}

// -------------------------------------------------------------
// Class Master CRUD
// -------------------------------------------------------------

export async function getClasses() {
  const registry = await getFullRegistry();
  const deletedSet = new Set((registry.deletedClasses || []).map((c) => String(c).trim().toLowerCase()));

  const classSet = new Set();
  (registry.classes || []).forEach((c) => {
    if (c && typeof c === 'string') {
      const trimmed = c.trim();
      if (trimmed && !deletedSet.has(trimmed.toLowerCase())) {
        classSet.add(trimmed);
      }
    }
  });

  const result = Array.from(classSet);
  saveFile(CLASSES_FILE, result);
  return result;
}

export async function addClass(name) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('Valid class name is required');
  }
  const cleanName = name.trim();
  const lowerClean = cleanName.toLowerCase();

  const registry = await getFullRegistry();
  let deletedClasses = (registry.deletedClasses || []).filter((c) => c.trim().toLowerCase() !== lowerClean);
  let classes = (registry.classes || []).filter((c) => c.trim().toLowerCase() !== lowerClean);
  classes.push(cleanName);

  await syncRegistry({ classes, deletedClasses });
  return cleanName;
}

export async function updateClass(oldName, newName) {
  if (!oldName || !newName || !newName.trim()) {
    throw new Error('Both old and new class names are required');
  }
  const cleanOld = oldName.trim();
  const cleanNew = newName.trim();
  const lowerOld = cleanOld.toLowerCase();
  const lowerNew = cleanNew.toLowerCase();

  const registry = await getFullRegistry();
  let deletedClasses = (registry.deletedClasses || []).filter((c) => c.trim().toLowerCase() !== lowerNew);
  if (!deletedClasses.some((c) => c.trim().toLowerCase() === lowerOld)) {
    deletedClasses.push(cleanOld);
  }

  let classes = (registry.classes || []).filter((c) => c.trim().toLowerCase() !== lowerOld);
  if (!classes.some((c) => c.trim().toLowerCase() === lowerNew)) {
    classes.push(cleanNew);
  }

  await syncRegistry({ classes, deletedClasses });
  await renameClassInProducts(cleanOld, cleanNew);

  return { oldName: cleanOld, newName: cleanNew };
}

export async function deleteClass(name) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('Class name is required');
  }
  const cleanName = name.trim();
  const lowerClean = cleanName.toLowerCase();

  const registry = await getFullRegistry();
  let deletedClasses = registry.deletedClasses || [];
  if (!deletedClasses.some((c) => c.trim().toLowerCase() === lowerClean)) {
    deletedClasses.push(cleanName);
  }

  let classes = (registry.classes || []).filter((c) => c.trim().toLowerCase() !== lowerClean);

  await syncRegistry({ classes, deletedClasses });
  await deleteClassInProducts(cleanName);

  return { deleted: cleanName };
}
