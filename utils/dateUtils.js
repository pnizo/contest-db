/**
 * Date utility functions for parsing and age calculation
 * Used primarily for Muscleware CSV imports
 */

/**
 * Parse a date string in various formats to Date object
 * Supports: YYYY/M/D, YYYY/MM/DD, YYYY-MM-DD
 * @param {string} dateString - Date string to parse
 * @returns {Date|null} - Parsed Date object or null if invalid
 */
function parseFlexibleDate(dateString) {
  if (!dateString || typeof dateString !== 'string') return null;

  const trimmed = dateString.trim();
  if (trimmed === '') return null;

  // Try slash format (YYYY/M/D or YYYY/MM/DD)
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/');
    if (parts.length !== 3) return null;

    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);

    if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;

    const date = new Date(year, month - 1, day);
    // Validate the date was created correctly (handles invalid dates like Feb 30)
    if (date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day) {
      return null;
    }
    return date;
  }

  // Try dash format (YYYY-MM-DD)
  if (trimmed.includes('-')) {
    const parts = trimmed.split('-');
    if (parts.length !== 3) return null;

    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);

    if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;

    const date = new Date(year, month - 1, day);
    // Validate the date was created correctly
    if (date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day) {
      return null;
    }
    return date;
  }

  return null;
}

/**
 * Format Date object to YYYY-MM-DD string
 * @param {Date|string} date - Date to format (Date object or string)
 * @returns {string} - Formatted date string (YYYY-MM-DD) or empty string if invalid
 */
function formatToISODate(date) {
  let dateObj = date;

  // If string, parse it first
  if (typeof date === 'string') {
    dateObj = parseFlexibleDate(date);
  }

  if (!dateObj || !(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
    return '';
  }

  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Calculate age in full years on a specific reference date
 * @param {string|Date} birthDate - Date of birth
 * @param {string|Date} referenceDate - Date to calculate age at (e.g., contest date)
 * @returns {number|null} - Age in years, or null if invalid
 */
function calculateAge(birthDate, referenceDate) {
  // Parse birth date
  let birthDateObj = birthDate;
  if (typeof birthDate === 'string') {
    birthDateObj = parseFlexibleDate(birthDate);
  }

  if (!birthDateObj || !(birthDateObj instanceof Date) || isNaN(birthDateObj.getTime())) {
    return null;
  }

  // Parse reference date
  let referenceDateObj = referenceDate;
  if (typeof referenceDate === 'string') {
    referenceDateObj = parseFlexibleDate(referenceDate);
  }

  if (!referenceDateObj || !(referenceDateObj instanceof Date) || isNaN(referenceDateObj.getTime())) {
    return null;
  }

  // Check if birth date is in the future
  if (birthDateObj > referenceDateObj) {
    return null;
  }

  // Calculate age
  const birthYear = birthDateObj.getFullYear();
  const birthMonth = birthDateObj.getMonth();
  const birthDay = birthDateObj.getDate();

  const refYear = referenceDateObj.getFullYear();
  const refMonth = referenceDateObj.getMonth();
  const refDay = referenceDateObj.getDate();

  let age = refYear - birthYear;

  // Subtract 1 if birthday hasn't occurred yet in the reference year
  if (refMonth < birthMonth || (refMonth === birthMonth && refDay < birthDay)) {
    age--;
  }

  return age;
}

module.exports = {
  parseFlexibleDate,
  formatToISODate,
  calculateAge
};
