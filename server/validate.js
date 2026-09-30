/**
 * Support Desk App - Input validation helpers
 */

// '#rrggbb' only (matches what <input type="color"> produces)
function isValidColor(value) {
    return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

// 'HH:MM' (24h)
function isValidTime(value) {
    return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isNonEmptyString(value, maxLength = 200) {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

// Memo may be empty (clears the memo)
function isValidMemo(value) {
    return typeof value === 'string' && value.length <= 500;
}

// Positive integer id; accepts numbers or digit-only strings ('1abc' is rejected)
function parseId(value) {
    const id = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// Settings that clients are allowed to change
const SETTING_KEYS = ['theme', 'enableNotifications', 'flipVertical', 'flipHorizontal'];

/**
 * Validate a status definition sent by the client
 */
function isValidStatus(status) {
    return !!status
        && isNonEmptyString(status.id)
        && isNonEmptyString(status.name)
        && isValidColor(status.color);
}

module.exports = {
    isValidColor, isValidTime, isNonEmptyString, isValidMemo, isValidStatus, parseId, SETTING_KEYS
};
