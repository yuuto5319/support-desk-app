/**
 * Support Desk App - Network access restriction
 * Only clients on the internal network may use the app.
 *
 * ALLOWED_SUBNETS (optional): comma-separated CIDR list that replaces the defaults,
 *   e.g. ALLOWED_SUBNETS=192.168.1.0/24,127.0.0.1/32
 */

const net = require('net');

// Private / loopback ranges (RFC 1918, RFC 4193, link-local IPv6)
const DEFAULT_SUBNETS = [
    '127.0.0.0/8',
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
    '::1/128',
    'fc00::/7',
    'fe80::/10'
];

function buildAllowList(subnets) {
    const list = new net.BlockList();
    for (const entry of subnets) {
        const [address, prefix] = entry.trim().split('/');
        const type = net.isIPv6(address) ? 'ipv6' : 'ipv4';
        if (!net.isIP(address)) {
            throw new Error(`Invalid address in ALLOWED_SUBNETS: ${entry}`);
        }
        const bits = prefix === undefined ? (type === 'ipv6' ? 128 : 32) : Number(prefix);
        list.addSubnet(address, bits, type);
    }
    return list;
}

const subnets = process.env.ALLOWED_SUBNETS
    ? process.env.ALLOWED_SUBNETS.split(',').filter(s => s.trim())
    : DEFAULT_SUBNETS;
const allowList = buildAllowList(subnets);

/**
 * Check whether a client address is inside the allowed subnets.
 * Uses the TCP peer address only (X-Forwarded-For is not trusted).
 */
function isAllowedAddress(address) {
    if (!address) return false;
    // IPv4 clients on a dual-stack socket appear as '::ffff:192.168.1.10'
    const ip = address.startsWith('::ffff:') ? address.slice(7) : address;
    if (net.isIPv4(ip)) return allowList.check(ip, 'ipv4');
    if (net.isIPv6(ip)) return allowList.check(ip, 'ipv6');
    return false;
}

/**
 * Express middleware
 */
function restrictToAllowedNetwork(req, res, next) {
    if (isAllowedAddress(req.socket.remoteAddress)) {
        return next();
    }
    console.warn(`Blocked request from ${req.socket.remoteAddress}: ${req.method} ${req.originalUrl}`);
    res.status(403).send('Forbidden');
}

module.exports = { isAllowedAddress, restrictToAllowedNetwork, subnets };
