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

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate a status definition sent by the client
 */
function isValidStatus(status) {
    return !!status
        && isNonEmptyString(status.id)
        && isNonEmptyString(status.name)
        && isValidColor(status.color);
}

module.exports = { isValidColor, isValidTime, isNonEmptyString, isValidStatus };
