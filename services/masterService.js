import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  renameCategoryInProducts,
  deleteCategoryInProducts,
  renameSchoolInProducts,
  deleteSchoolInProducts,
  getProductsFromSupabase
} from './supabaseService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../data');

const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const SCHOOLS_FILE = path.join(DATA_DIR, 'schools.json');

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
  const catSet = new Set(fileCategories);

  try {
    const products = await getProductsFromSupabase();
    products.forEach((p) => {
      if (p.category && typeof p.category === 'string') {
        const c = p.category.trim();
        const lower = c.toLowerCase();
        if (!lower.includes('accessories') || (!lower.includes('tie') && !lower.includes('belt'))) {
          catSet.add(c);
        }
      }
    });
  } catch (e) {}

  return Array.from(catSet);
}

export async function addCategory(name) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('Valid category name is required');
  }
  const cleanName = name.trim();
  const current = ensureFile(CATEGORIES_FILE, DEFAULT_CATEGORIES);

  if (!current.some((c) => c.toLowerCase() === cleanName.toLowerCase())) {
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

  let current = ensureFile(CATEGORIES_FILE, DEFAULT_CATEGORIES);
  let found = false;

  current = current.map((c) => {
    if (c.toLowerCase() === cleanOld.toLowerCase()) {
      found = true;
      return cleanNew;
    }
    return c;
  });

  if (!found) {
    current.push(cleanNew);
  }

  // Deduplicate
  const unique = Array.from(new Set(current));
  saveFile(CATEGORIES_FILE, unique);

  // Sync rename in Supabase products
  await renameCategoryInProducts(cleanOld, cleanNew);

  return { oldName: cleanOld, newName: cleanNew };
}

export async function deleteCategory(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('Category name is required');
  }
  const cleanName = name.trim();
  let current = ensureFile(CATEGORIES_FILE, DEFAULT_CATEGORIES);

  current = current.filter((c) => c.toLowerCase() !== cleanName.toLowerCase());
  saveFile(CATEGORIES_FILE, current);

  // Sync delete in Supabase products (reset to 'General')
  await deleteCategoryInProducts(cleanName);

  return { deleted: cleanName };
}

// -------------------------------------------------------------
// School Master CRUD
// -------------------------------------------------------------

export async function getSchools() {
  const fileSchools = ensureFile(SCHOOLS_FILE, DEFAULT_SCHOOLS);
  const schoolSet = new Set(fileSchools);

  try {
    const products = await getProductsFromSupabase();
    products.forEach((p) => {
      if (p.school && typeof p.school === 'string' && p.school !== 'General School') {
        schoolSet.add(p.school.trim());
      }
    });
  } catch (e) {}

  return Array.from(schoolSet);
}

export async function addSchool(name) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('Valid school name is required');
  }
  const cleanName = name.trim();
  const current = ensureFile(SCHOOLS_FILE, DEFAULT_SCHOOLS);

  if (!current.some((s) => s.toLowerCase() === cleanName.toLowerCase())) {
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

  let current = ensureFile(SCHOOLS_FILE, DEFAULT_SCHOOLS);
  let found = false;

  current = current.map((s) => {
    if (s.toLowerCase() === cleanOld.toLowerCase()) {
      found = true;
      return cleanNew;
    }
    return s;
  });

  if (!found) {
    current.push(cleanNew);
  }

  const unique = Array.from(new Set(current));
  saveFile(SCHOOLS_FILE, unique);

  // Sync rename in Supabase products
  await renameSchoolInProducts(cleanOld, cleanNew);

  return { oldName: cleanOld, newName: cleanNew };
}

export async function deleteSchool(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('School name is required');
  }
  const cleanName = name.trim();
  let current = ensureFile(SCHOOLS_FILE, DEFAULT_SCHOOLS);

  current = current.filter((s) => s.toLowerCase() !== cleanName.toLowerCase());
  saveFile(SCHOOLS_FILE, current);

  // Sync delete in Supabase products (reset to 'General School')
  await deleteSchoolInProducts(cleanName);

  return { deleted: cleanName };
}
