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
  getProductsFromSupabase
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

// -------------------------------------------------------------
// Category Master CRUD
// -------------------------------------------------------------

export async function getCategories() {
  const fileCategories = ensureFile(CATEGORIES_FILE, DEFAULT_CATEGORIES);
  const deletedCats = ensureFile(DELETED_CATEGORIES_FILE, []);
  const deletedSet = new Set(deletedCats.map((c) => String(c).trim().toLowerCase()));

  // Start with file categories that haven't been deleted
  const catSet = new Set();
  fileCategories.forEach((c) => {
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

  // Remove from deleted blacklist if present
  let deletedCats = ensureFile(DELETED_CATEGORIES_FILE, []);
  if (deletedCats.some((c) => c.toLowerCase() === lowerClean)) {
    deletedCats = deletedCats.filter((c) => c.toLowerCase() !== lowerClean);
    saveFile(DELETED_CATEGORIES_FILE, deletedCats);
  }

  const current = ensureFile(CATEGORIES_FILE, DEFAULT_CATEGORIES);
  if (!current.some((c) => c.toLowerCase() === lowerClean)) {
    current.push(cleanName);
    saveFile(CATEGORIES_FILE, current);
  }
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

  // Remove new name from blacklist
  let deletedCats = ensureFile(DELETED_CATEGORIES_FILE, []);
  if (deletedCats.some((c) => c.toLowerCase() === lowerNew)) {
    deletedCats = deletedCats.filter((c) => c.toLowerCase() !== lowerNew);
    saveFile(DELETED_CATEGORIES_FILE, deletedCats);
  }

  // Blacklist old name to avoid resurrection from products
  if (!deletedCats.some((c) => c.toLowerCase() === lowerOld)) {
    deletedCats.push(cleanOld);
    saveFile(DELETED_CATEGORIES_FILE, deletedCats);
  }

  let current = ensureFile(CATEGORIES_FILE, DEFAULT_CATEGORIES);
  current = current.filter((c) => c.toLowerCase() !== lowerOld);
  if (!current.some((c) => c.toLowerCase() === lowerNew)) {
    current.push(cleanNew);
  }

  const unique = Array.from(new Set(current));
  saveFile(CATEGORIES_FILE, unique);

  // Sync rename in Supabase products
  await renameCategoryInProducts(cleanOld, cleanNew);

  return { oldName: cleanOld, newName: cleanNew };
}

export async function deleteCategory(name) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('Category name is required');
  }
  const cleanName = name.trim();
  const lowerClean = cleanName.toLowerCase();

  // 1. Add to deleted blacklist so getCategories never restores it
  let deletedCats = ensureFile(DELETED_CATEGORIES_FILE, []);
  if (!deletedCats.some((c) => c.toLowerCase() === lowerClean)) {
    deletedCats.push(cleanName);
    saveFile(DELETED_CATEGORIES_FILE, deletedCats);
  }

  // 2. Remove from active categories file
  let current = ensureFile(CATEGORIES_FILE, DEFAULT_CATEGORIES);
  current = current.filter((c) => c.toLowerCase() !== lowerClean);
  saveFile(CATEGORIES_FILE, current);

  // 3. Sync delete in Supabase products (reset to 'General')
  await deleteCategoryInProducts(cleanName);

  return { deleted: cleanName };
}

// -------------------------------------------------------------
// School Master CRUD
// -------------------------------------------------------------

export async function getSchools() {
  const fileSchools = ensureFile(SCHOOLS_FILE, DEFAULT_SCHOOLS);
  const deletedSchools = ensureFile(DELETED_SCHOOLS_FILE, []);
  const deletedSet = new Set(deletedSchools.map((s) => String(s).trim().toLowerCase()));

  // Start with file schools that haven't been deleted
  const schoolSet = new Set();
  fileSchools.forEach((s) => {
    if (s && typeof s === 'string') {
      const trimmed = s.trim();
      if (trimmed && !deletedSet.has(trimmed.toLowerCase())) {
        schoolSet.add(trimmed);
      }
    }
  });

  try {
    const products = await getProductsFromSupabase();
    products.forEach((p) => {
      if (p.school && typeof p.school === 'string' && p.school !== 'General School') {
        const trimmed = p.school.trim();
        if (!deletedSet.has(trimmed.toLowerCase())) {
          schoolSet.add(trimmed);
        }
      }
    });
  } catch (e) {}

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

  // Remove from deleted blacklist if present
  let deletedSchools = ensureFile(DELETED_SCHOOLS_FILE, []);
  if (deletedSchools.some((s) => s.toLowerCase() === lowerClean)) {
    deletedSchools = deletedSchools.filter((s) => s.toLowerCase() !== lowerClean);
    saveFile(DELETED_SCHOOLS_FILE, deletedSchools);
  }

  const current = ensureFile(SCHOOLS_FILE, DEFAULT_SCHOOLS);
  if (!current.some((s) => s.toLowerCase() === lowerClean)) {
    current.push(cleanName);
    saveFile(SCHOOLS_FILE, current);
  }
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

  // Remove new name from blacklist
  let deletedSchools = ensureFile(DELETED_SCHOOLS_FILE, []);
  if (deletedSchools.some((s) => s.toLowerCase() === lowerNew)) {
    deletedSchools = deletedSchools.filter((s) => s.toLowerCase() !== lowerNew);
    saveFile(DELETED_SCHOOLS_FILE, deletedSchools);
  }

  // Blacklist old name to avoid resurrection from products
  if (!deletedSchools.some((s) => s.toLowerCase() === lowerOld)) {
    deletedSchools.push(cleanOld);
    saveFile(DELETED_SCHOOLS_FILE, deletedSchools);
  }

  let current = ensureFile(SCHOOLS_FILE, DEFAULT_SCHOOLS);
  current = current.filter((s) => s.toLowerCase() !== lowerOld);
  if (!current.some((s) => s.toLowerCase() === lowerNew)) {
    current.push(cleanNew);
  }

  const unique = Array.from(new Set(current));
  saveFile(SCHOOLS_FILE, unique);

  // Sync rename in Supabase products
  await renameSchoolInProducts(cleanOld, cleanNew);

  return { oldName: cleanOld, newName: cleanNew };
}

export async function deleteSchool(name) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('School name is required');
  }
  const cleanName = name.trim();
  const lowerClean = cleanName.toLowerCase();

  // 1. Add to deleted blacklist so getSchools never restores it
  let deletedSchools = ensureFile(DELETED_SCHOOLS_FILE, []);
  if (!deletedSchools.some((s) => s.toLowerCase() === lowerClean)) {
    deletedSchools.push(cleanName);
    saveFile(DELETED_SCHOOLS_FILE, deletedSchools);
  }

  // 2. Remove from active schools file
  let current = ensureFile(SCHOOLS_FILE, DEFAULT_SCHOOLS);
  current = current.filter((s) => s.toLowerCase() !== lowerClean);
  saveFile(SCHOOLS_FILE, current);

  // 3. Sync delete in Supabase products (reset to 'General School')
  await deleteSchoolInProducts(cleanName);

  return { deleted: cleanName };
}

// -------------------------------------------------------------
// Class Master CRUD
// -------------------------------------------------------------

export async function getClasses() {
  const fileClasses = ensureFile(CLASSES_FILE, DEFAULT_CLASSES);
  const deletedClasses = ensureFile(DELETED_CLASSES_FILE, []);
  const deletedSet = new Set(deletedClasses.map((c) => String(c).trim().toLowerCase()));

  // Start with file classes that haven't been deleted
  const classSet = new Set();
  fileClasses.forEach((c) => {
    if (c && typeof c === 'string') {
      const trimmed = c.trim();
      if (trimmed && !deletedSet.has(trimmed.toLowerCase())) {
        classSet.add(trimmed);
      }
    }
  });

  try {
    const products = await getProductsFromSupabase();
    products.forEach((p) => {
      const cls = p.applicableClass || p.applicable_class;
      if (cls && typeof cls === 'string' && cls !== 'All Classes') {
        const trimmed = cls.trim();
        if (!deletedSet.has(trimmed.toLowerCase())) {
          classSet.add(trimmed);
        }
      }
    });
  } catch (e) {}

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

  // Remove from deleted blacklist if present
  let deletedClasses = ensureFile(DELETED_CLASSES_FILE, []);
  if (deletedClasses.some((c) => c.toLowerCase() === lowerClean)) {
    deletedClasses = deletedClasses.filter((c) => c.toLowerCase() !== lowerClean);
    saveFile(DELETED_CLASSES_FILE, deletedClasses);
  }

  const current = ensureFile(CLASSES_FILE, DEFAULT_CLASSES);
  if (!current.some((c) => c.toLowerCase() === lowerClean)) {
    current.push(cleanName);
    saveFile(CLASSES_FILE, current);
  }
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

  // Remove new name from blacklist
  let deletedClasses = ensureFile(DELETED_CLASSES_FILE, []);
  if (deletedClasses.some((c) => c.toLowerCase() === lowerNew)) {
    deletedClasses = deletedClasses.filter((c) => c.toLowerCase() !== lowerNew);
    saveFile(DELETED_CLASSES_FILE, deletedClasses);
  }

  // Blacklist old name to avoid resurrection from products
  if (!deletedClasses.some((c) => c.toLowerCase() === lowerOld)) {
    deletedClasses.push(cleanOld);
    saveFile(DELETED_CLASSES_FILE, deletedClasses);
  }

  let current = ensureFile(CLASSES_FILE, DEFAULT_CLASSES);
  current = current.filter((c) => c.toLowerCase() !== lowerOld);
  if (!current.some((c) => c.toLowerCase() === lowerNew)) {
    current.push(cleanNew);
  }

  const unique = Array.from(new Set(current));
  saveFile(CLASSES_FILE, unique);

  // Sync rename in Supabase products
  await renameClassInProducts(cleanOld, cleanNew);

  return { oldName: cleanOld, newName: cleanNew };
}

export async function deleteClass(name) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('Class name is required');
  }
  const cleanName = name.trim();
  const lowerClean = cleanName.toLowerCase();

  // 1. Add to deleted blacklist so getClasses never restores it
  let deletedClasses = ensureFile(DELETED_CLASSES_FILE, []);
  if (!deletedClasses.some((c) => c.toLowerCase() === lowerClean)) {
    deletedClasses.push(cleanName);
    saveFile(DELETED_CLASSES_FILE, deletedClasses);
  }

  // 2. Remove from active classes file
  let current = ensureFile(CLASSES_FILE, DEFAULT_CLASSES);
  current = current.filter((c) => c.toLowerCase() !== lowerClean);
  saveFile(CLASSES_FILE, current);

  // 3. Sync delete in Supabase products (reset to 'All Classes')
  await deleteClassInProducts(cleanName);

  return { deleted: cleanName };
}

